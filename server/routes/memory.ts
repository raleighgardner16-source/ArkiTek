import { Router, type Request, type Response } from 'express'
import { findRelevantContext, formatMemoryContext, generateEmbedding } from '../services/memory.js'
import db from '../../database/db.js'
import { createLogger } from '../config/logger.js'
import { sendSuccess, sendError } from '../types/api.js'

const log = createLogger('memory')
const router = Router()

router.post('/retrieve', async (req: Request, res: Response) => {
  try {
    const userId = req.userId
    const { prompt, needsContext, targetModel } = req.body
    if (!prompt) {
      return sendError(res, 'prompt is required', 400)
    }

    const scoreThreshold = needsContext ? 0.70 : 0.82
    const memoryContextItems = await findRelevantContext(userId as string, prompt, 3, scoreThreshold, targetModel || null)
    const memoryContextString = formatMemoryContext(memoryContextItems)

    let diagnostics: any = null
    if (memoryContextItems.length === 0) {
      try {
        const totalDocs = await db.conversationHistory.countForUser(userId!)
        const docsWithEmbedding = await db.conversationHistory.countWithEmbedding(userId!)
        diagnostics = { totalDocs, docsWithEmbedding }
        log.debug({ userId, totalDocs, docsWithEmbedding }, 'Memory retrieve diagnostics')
      } catch (diagErr) {
        log.warn({ err: diagErr }, 'Memory diagnostic check failed')
      }
    }

    if (memoryContextString) {
      log.debug({ userId, itemCount: memoryContextItems.length, scoreThreshold }, 'Found memory context')
    } else {
      log.debug({ userId, scoreThreshold }, 'No relevant memory context')
    }

    sendSuccess(res, {
      items: memoryContextItems,
      contextString: memoryContextString,
      needsContextHint: !!needsContext,
      scoreThreshold,
      injected: memoryContextItems.length > 0,
      diagnostics,
    })
  } catch (error) {
    log.error({ err: error }, 'Memory retrieve error')
    sendSuccess(res, { items: [], contextString: '', injected: false })
  }
})

router.get('/debug', async (req: Request, res: Response) => {
  try {
    const userId = req.userId

    const dbInstance: any = await db.getDb()
    const col = dbInstance.collection('conversation_history')

    const totalDocs = await col.countDocuments({ userId })
    const docsWithEmbedding = await col.countDocuments({ userId, embedding: { $exists: true, $ne: null } })

    const recentDocs = await col.find({ userId })
      .sort({ savedAt: -1 })
      .limit(10)
      .project({ _id: 1, title: 1, originalPrompt: 1, savedAt: 1, embeddingText: 1, embedding: { $slice: 3 }, finalizedAt: 1 })
      .toArray()

    const docSummaries = recentDocs.map((d: any) => ({
      id: d._id,
      title: d.title,
      prompt: (d.originalPrompt || '').substring(0, 100),
      savedAt: d.savedAt,
      hasEmbedding: !!(d.embedding && d.embedding.length > 0),
      embeddingDims: d.embedding ? d.embedding.length : 0,
      embeddingTextLength: d.embeddingText ? d.embeddingText.length : 0,
      embeddingTextPreview: d.embeddingText ? d.embeddingText.substring(0, 200) : null,
      finalizedAt: d.finalizedAt || null,
    }))

    let vectorSearchWorks = false
    let vectorSearchError: string | null = null
    let rawResults: any = []
    try {
      const testEmbedding = await generateEmbedding('test query about hunting', userId)
      if (testEmbedding) {
        const searchResults = await col.aggregate([
          {
            $vectorSearch: {
              index: 'conversation_embedding_index',
              path: 'embedding',
              queryVector: testEmbedding,
              numCandidates: 20,
              limit: 5
            }
          },
          {
            $project: {
              _id: 1,
              userId: 1,
              title: 1,
              originalPrompt: 1,
              score: { $meta: 'vectorSearchScore' }
            }
          }
        ]).toArray()

        vectorSearchWorks = true
        rawResults = searchResults.map((r: any) => ({
          id: r._id,
          userId: r.userId,
          title: r.title,
          prompt: (r.originalPrompt || '').substring(0, 100),
          score: r.score,
        }))

        let filteredResults: any = []
        try {
          const filteredSearch = await col.aggregate([
            {
              $vectorSearch: {
                index: 'conversation_embedding_index',
                path: 'embedding',
                queryVector: testEmbedding,
                numCandidates: 20,
                limit: 5,
                filter: { userId }
              }
            },
            {
              $project: {
                _id: 1,
                userId: 1,
                title: 1,
                originalPrompt: 1,
                score: { $meta: 'vectorSearchScore' }
              }
            }
          ]).toArray()
          filteredResults = filteredSearch.map((r: any) => ({
            id: r._id,
            userId: r.userId,
            title: r.title,
            prompt: (r.originalPrompt || '').substring(0, 100),
            score: r.score,
          }))
        } catch (filterErr: any) {
          filteredResults = { error: filterErr.message, code: filterErr.code, codeName: filterErr.codeName }
        }

        rawResults = {
          withoutFilter: rawResults,
          withUserIdFilter: filteredResults,
        }
      } else {
        vectorSearchError = 'Could not generate test embedding (OpenAI API key issue?)'
      }
    } catch (vsErr: any) {
      vectorSearchError = `${vsErr.message} (code: ${vsErr.code}, codeName: ${vsErr.codeName})`
    }

    sendSuccess(res, {
      userId,
      totalDocs,
      docsWithEmbedding,
      recentDocs: docSummaries,
      vectorSearch: {
        works: vectorSearchWorks,
        error: vectorSearchError,
        results: rawResults,
      },
      indexExpected: 'conversation_embedding_index',
      indexRequirements: {
        path: 'embedding',
        numDimensions: 1536,
        similarity: 'cosine',
        filterFields: ['userId'],
        note: 'The userId field MUST be defined as a "filter" type in the Atlas Search index definition for filtered $vectorSearch to work.'
      }
    })
  } catch (error: any) {
    log.error({ err: error }, 'Memory debug error')
    sendError(res, error.message)
  }
})

export default router
