import { Router } from 'express'
import { findRelevantContext, formatMemoryContext, generateEmbedding } from '../services/memory.js'
import db from '../../database/db.js'

const router = Router()

router.post('/retrieve', async (req, res) => {
  try {
    const userId = req.userId
    const { prompt, needsContext, targetModel } = req.body
    if (!prompt) {
      return res.status(400).json({ error: 'prompt is required' })
    }

    const scoreThreshold = needsContext ? 0.70 : 0.82
    const memoryContextItems = await findRelevantContext(userId, prompt, 3, scoreThreshold, targetModel || null)
    const memoryContextString = formatMemoryContext(memoryContextItems)

    let diagnostics = null
    if (memoryContextItems.length === 0) {
      try {
        const dbInstance = await db.getDb()
        const totalDocs = await dbInstance.collection('conversation_history').countDocuments({ userId })
        const docsWithEmbedding = await dbInstance.collection('conversation_history').countDocuments({ userId, embedding: { $exists: true, $ne: null } })
        diagnostics = { totalDocs, docsWithEmbedding }
        console.log(`[Memory Retrieve] Diagnostics for ${userId}: ${totalDocs} total docs, ${docsWithEmbedding} with embeddings`)
      } catch (diagErr) {
        console.error('[Memory Retrieve] Diagnostic check failed:', diagErr.message)
      }
    }

    if (memoryContextString) {
      console.log(`[Memory Retrieve] Found ${memoryContextItems.length} items for user ${userId} (threshold: ${scoreThreshold})`)
    } else {
      console.log(`[Memory Retrieve] No relevant context for user ${userId} (threshold: ${scoreThreshold})`)
    }

    res.json({
      items: memoryContextItems,
      contextString: memoryContextString,
      needsContextHint: !!needsContext,
      scoreThreshold,
      injected: memoryContextItems.length > 0,
      diagnostics,
    })
  } catch (error) {
    console.error('[Memory Retrieve] Error:', error.message)
    res.json({ items: [], contextString: '', injected: false })
  }
})

router.get('/debug', async (req, res) => {
  try {
    const userId = req.userId

    const dbInstance = await db.getDb()
    const col = dbInstance.collection('conversation_history')

    const totalDocs = await col.countDocuments({ userId })
    const docsWithEmbedding = await col.countDocuments({ userId, embedding: { $exists: true, $ne: null } })

    const recentDocs = await col.find({ userId })
      .sort({ savedAt: -1 })
      .limit(10)
      .project({ _id: 1, title: 1, originalPrompt: 1, savedAt: 1, embeddingText: 1, embedding: { $slice: 3 }, finalizedAt: 1 })
      .toArray()

    const docSummaries = recentDocs.map(d => ({
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
    let vectorSearchError = null
    let rawResults = []
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
        rawResults = searchResults.map(r => ({
          id: r._id,
          userId: r.userId,
          title: r.title,
          prompt: (r.originalPrompt || '').substring(0, 100),
          score: r.score,
        }))

        let filteredResults = []
        try {
          const filteredSearch = await col.aggregate([
            {
              $vectorSearch: {
                index: 'conversation_embedding_index',
                path: 'embedding',
                queryVector: testEmbedding,
                numCandidates: 20,
                limit: 5,
                filter: { userId: userId }
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
          filteredResults = filteredSearch.map(r => ({
            id: r._id,
            userId: r.userId,
            title: r.title,
            prompt: (r.originalPrompt || '').substring(0, 100),
            score: r.score,
          }))
        } catch (filterErr) {
          filteredResults = { error: filterErr.message, code: filterErr.code, codeName: filterErr.codeName }
        }

        rawResults = {
          withoutFilter: rawResults,
          withUserIdFilter: filteredResults,
        }
      } else {
        vectorSearchError = 'Could not generate test embedding (OpenAI API key issue?)'
      }
    } catch (vsErr) {
      vectorSearchError = `${vsErr.message} (code: ${vsErr.code}, codeName: ${vsErr.codeName})`
    }

    res.json({
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
  } catch (error) {
    console.error('[Memory Debug] Error:', error.message)
    res.status(500).json({ error: error.message })
  }
})

export default router
