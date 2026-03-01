import { Router, type Request, type Response } from 'express'
import db from '../../database/db.js'
import { generateEmbedding, buildEmbeddingText } from '../services/memory.js'
import { sendSuccess, sendError } from '../types/api.js'
import type { ConversationHistoryDoc, ConversationTurn } from '../../database/types.js'

const router = Router()

// POST /api/history/auto-save
router.post('/auto-save', async (req: Request, res: Response) => {
  try {
    const userId = req.userId!
    const { originalPrompt, category, promptMode, responses, summary, sources, facts, ragDebugData } = req.body

    if (!originalPrompt) {
      return sendError(res, 'originalPrompt is required', 400)
    }

    const user = await db.users.get(userId)
    if (!user) {
      return sendError(res, 'User not found', 404)
    }

    const historyId = `hist-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
    const title = originalPrompt.substring(0, 80) + (originalPrompt.length > 80 ? '...' : '')

    const doc: ConversationHistoryDoc = {
      _id: historyId,
      userId,
      title,
      originalPrompt,
      category: category || 'General',
      promptMode: promptMode || 'general',
      savedAt: new Date(),
      responses: (responses || []).map((r: any) => ({
        modelName: r.modelName || r.actualModelName || 'Unknown',
        actualModelName: r.actualModelName || r.modelName || 'Unknown',
        text: r.text || r.modelResponse || '',
        error: r.error || false,
        tokens: r.tokens || null,
      })),
      summary: summary ? {
        text: summary.text || '',
        consensus: summary.consensus || null,
        agreements: summary.agreements || [],
        disagreements: summary.disagreements || [],
        singleModel: summary.singleModel || false,
        modelName: summary.modelName || null,
      } : null,
      sources: sources || [],
      facts: facts || [],
    }

    await db.conversationHistory.create(doc)
    console.log(`[History] Auto-saved conversation for user ${userId}: ${historyId}`)

    // Generate embedding BEFORE sending response.
    // On Vercel serverless, fire-and-forget async work after res.json() is lost because
    // the execution environment freezes once the response is sent. The embedding MUST
    // complete before we respond, otherwise it will never be stored and memory/context
    // retrieval will fail for this conversation.
    let embeddingStored = false
    try {
      const embeddingText = buildEmbeddingText(originalPrompt, doc.responses, doc.summary, [])
      const embedding = await generateEmbedding(embeddingText, userId)
      if (embedding) {
        await db.conversationHistory.update(historyId, { embedding, embeddingText })
        embeddingStored = true
        console.log(`[History] Embedding stored for ${historyId} (${embedding.length} dims)`)
      }
    } catch (embErr: any) {
      console.error(`[History] Embedding generation failed for ${historyId}:`, embErr.message)
    }

    sendSuccess(res, { historyId, title, embeddingStored })
  } catch (error: any) {
    console.error('[History] Error auto-saving:', error)
    sendError(res, 'Failed to save conversation history')
  }
})

// POST /api/history/update-summary
router.post('/update-summary', async (req: Request, res: Response) => {
  try {
    const userId = req.userId!
    const { historyId, summary } = req.body

    if (!historyId || !summary) {
      return sendError(res, 'historyId and summary are required', 400)
    }

    const doc = await db.conversationHistory.getByIdAndUser(historyId, userId)
    if (!doc) {
      return sendError(res, 'History entry not found', 404)
    }

    const summaryDoc = {
      text: summary.text || '',
      consensus: summary.consensus || null,
      agreements: summary.agreements || [],
      disagreements: summary.disagreements || [],
      differences: summary.differences || [],
      singleModel: summary.singleModel || false,
      modelName: summary.modelName || null,
    }

    await db.conversationHistory.updateByUser(historyId, userId, { summary: summaryDoc })

    console.log(`[History] Updated summary for ${historyId}`)
    sendSuccess(res, {})
  } catch (error: any) {
    console.error('[History] Error updating summary:', error)
    sendError(res, 'Failed to update summary')
  }
})

// POST /api/history/update-conversation
router.post('/update-conversation', async (req: Request, res: Response) => {
  try {
    const { historyId, turn } = req.body

    if (!historyId || !turn) {
      return sendError(res, 'historyId and turn are required', 400)
    }

    const conversationTurn: ConversationTurn = {
      type: turn.type || 'model',
      modelName: turn.modelName || 'Unknown',
      user: turn.user || '',
      assistant: turn.assistant || '',
      timestamp: new Date(),
      sources: turn.sources || [],
    }

    const matched = await db.conversationHistory.pushConversationTurn(historyId, conversationTurn)

    if (!matched) {
      return sendError(res, 'History entry not found', 404)
    }

    console.log(`[History] Updated conversation for ${historyId}: +1 ${conversationTurn.type} turn with ${conversationTurn.modelName}`)
    sendSuccess(res, {})
  } catch (error: any) {
    console.error('[History] Error updating conversation:', error)
    sendError(res, 'Failed to update conversation history')
  }
})

// POST /api/history/finalize
router.post('/finalize', async (req: Request, res: Response) => {
  try {
    const userId = req.userId!
    const { historyId } = req.body

    if (!historyId) {
      return sendError(res, 'historyId is required', 400)
    }

    const doc = await db.conversationHistory.getById(historyId)

    if (!doc) {
      return sendError(res, 'History entry not found', 404)
    }

    const turns = doc.conversationTurns || []
    if (turns.length === 0) {
      console.log(`[History] Finalize ${historyId}: no conversation turns, skipping embedding regen`)
      return sendSuccess(res, { embeddingUpdated: false })
    }

    let embeddingUpdated = false
    try {
      const embeddingText = buildEmbeddingText(
        doc.originalPrompt,
        doc.responses,
        doc.summary,
        turns
      )
      const embedding = await generateEmbedding(embeddingText, userId || doc.userId)
      if (embedding) {
        await db.conversationHistory.update(historyId, { embedding, embeddingText, finalizedAt: new Date() })
        embeddingUpdated = true
        console.log(`[History] Finalized ${historyId}: embedding regenerated with ${turns.length} conversation turns (${embedding.length} dims)`)
      }
    } catch (embErr: any) {
      console.error(`[History] Finalize embedding failed for ${historyId}:`, embErr.message)
    }

    sendSuccess(res, { embeddingUpdated })
  } catch (error: any) {
    console.error('[History] Error finalizing:', error)
    sendError(res, 'Failed to finalize history entry')
  }
})

// GET /api/history/detail/:historyId
// NOTE: This route MUST be defined BEFORE /:userId to avoid Express matching "detail" as a userId
router.get('/detail/:historyId', async (req: Request, res: Response) => {
  try {
    const historyId = req.params.historyId as string
    const doc = await db.conversationHistory.getById(historyId)

    if (!doc) {
      return sendError(res, 'History entry not found', 404)
    }

    let postedToFeed = false
    if (doc.userId && doc.originalPrompt) {
      const userPosts = await db.leaderboardPosts.getByUser(doc.userId)
      const normalizedPrompt = doc.originalPrompt.trim().toLowerCase()
      postedToFeed = userPosts.some(
        (p: any) => p.promptText && p.promptText.trim().toLowerCase() === normalizedPrompt
      )
    }

    sendSuccess(res, {
      conversation: {
        id: doc._id,
        title: doc.title,
        originalPrompt: doc.originalPrompt,
        category: doc.category,
        promptMode: doc.promptMode || 'general',
        savedAt: doc.savedAt,
        responses: doc.responses || [],
        summary: doc.summary || null,
        sources: doc.sources || [],
        facts: doc.facts || [],
        conversationTurns: doc.conversationTurns || [],
        postedToFeed,
      }
    })
  } catch (error: any) {
    console.error('[History] Error fetching detail:', error)
    sendError(res, 'Failed to fetch history detail')
  }
})

// GET /api/history/:userId
router.get('/:userId', async (req: Request, res: Response) => {
  try {
    const userId = req.userId!

    const results = await db.conversationHistory.listForUser(userId, {
      _id: 1,
      title: 1,
      originalPrompt: 1,
      category: 1,
      promptMode: 1,
      savedAt: 1,
      starred: 1,
      'responses.modelName': 1,
      'responses.error': 1,
      'summary.consensus': 1,
      'summary.singleModel': 1,
    })

    const mapped = results.map((c: any) => ({
      id: c._id,
      title: c.title,
      originalPrompt: c.originalPrompt,
      category: c.category,
      promptMode: c.promptMode || 'general',
      savedAt: c.savedAt,
      starred: !!c.starred,
      modelCount: c.responses?.length || 0,
      modelNames: (c.responses || []).filter((r: any) => !r.error).map((r: any) => r.modelName),
      consensus: c.summary?.consensus || null,
      isSingleModel: c.summary?.singleModel || (c.responses?.length === 1),
      hasSummary: !!c.summary,
    }))

    sendSuccess(res, { history: mapped })
  } catch (error: any) {
    console.error('[History] Error listing:', error)
    sendError(res, 'Failed to list conversation history')
  }
})

// DELETE /api/history/:historyId
router.delete('/:historyId', async (req: Request, res: Response) => {
  try {
    const historyId = req.params.historyId as string
    const userId = req.userId!

    const entry = await db.conversationHistory.getByIdAndUser(historyId, userId)

    if (!entry) {
      return sendError(res, 'History entry not found or not owned by this user', 404)
    }

    await db.conversationHistory.deleteByUser(historyId, userId)

    if (entry.category && entry.originalPrompt) {
      try {
        const userUsage: any = await db.usage.getOrDefault(userId)
        const cat = entry.category
        const prompts = userUsage.categoryPrompts?.[cat]
        if (prompts && prompts.length > 0) {
          const promptSnippet = entry.originalPrompt.substring(0, 500)
          const idx = prompts.findIndex((p: any) => p.text === promptSnippet)
          if (idx !== -1) {
            prompts.splice(idx, 1)
            userUsage.categoryPrompts[cat] = prompts
            await db.usage.update(userId, { categoryPrompts: userUsage.categoryPrompts })
            console.log(`[History] Also removed prompt from category "${cat}" for user ${userId}`)
          }
        }
      } catch (catErr: any) {
        console.error(`[History] Non-fatal: failed to remove prompt from category:`, catErr.message)
      }
    }

    console.log(`[History] Deleted ${historyId} for user ${userId}`)
    sendSuccess(res, {})
  } catch (error: any) {
    console.error('[History] Error deleting:', error)
    sendError(res, 'Failed to delete history entry')
  }
})

// POST /api/history/star
router.post('/star', async (req: Request, res: Response) => {
  try {
    const userId = req.userId!
    const { historyId, starred } = req.body
    if (!historyId) {
      return sendError(res, 'historyId is required', 400)
    }

    const matched = await db.conversationHistory.updateByUser(historyId, userId, { starred: !!starred })

    if (!matched) {
      return sendError(res, 'History entry not found or not owned by this user', 404)
    }

    sendSuccess(res, { starred: !!starred })
  } catch (error: any) {
    console.error('[History] Error toggling star:', error)
    sendError(res, 'Failed to toggle star status')
  }
})

// POST /api/history/restore-context
router.post('/restore-context', async (req: Request, res: Response) => {
  try {
    const userId = req.userId!
    const { historyId } = req.body
    if (!historyId) {
      return sendError(res, 'historyId is required', 400)
    }

    const entry = await db.conversationHistory.getByIdAndUser(historyId, userId)
    if (!entry) {
      return sendError(res, 'History entry not found', 404)
    }

    const judgeTurns = (entry.conversationTurns || []).filter((t: any) => t.type === 'judge')
    const judgeConversationContext = judgeTurns.map((t: any) => ({
      role: 'user',
      content: t.user,
      response: t.assistant,
    }))

    const modelConversationContext: Record<string, any> = {}
    ;(entry.conversationTurns || []).forEach((turn: any) => {
      if (turn.type !== 'judge' && turn.modelName) {
        if (!modelConversationContext[turn.modelName]) modelConversationContext[turn.modelName] = []
        modelConversationContext[turn.modelName].push({
          role: 'user',
          content: turn.user,
          response: turn.assistant,
        })
      }
    })

    await db.usage.update(userId, { judgeConversationContext, modelConversationContext })
    console.log(`[History] Restored context for user ${userId} from ${historyId} (${judgeTurns.length} judge turns, ${Object.keys(modelConversationContext).length} model contexts)`)
    sendSuccess(res, {})
  } catch (error: any) {
    console.error('[History] Error restoring context:', error)
    sendError(res, 'Failed to restore conversation context')
  }
})

export default router
