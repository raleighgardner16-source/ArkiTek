import { Router } from 'express'
import db from '../../database/db.js'
import { generateEmbedding, buildEmbeddingText } from '../services/memory.js'

const router = Router()

// POST /api/history/auto-save
router.post('/auto-save', async (req, res) => {
  try {
    const { userId, originalPrompt, category, promptMode, responses, summary, sources, facts, ragDebugData } = req.body

    if (!userId || !originalPrompt) {
      return res.status(400).json({ error: 'userId and originalPrompt are required' })
    }

    const user = await db.users.get(userId)
    if (!user) {
      return res.status(404).json({ error: 'User not found' })
    }

    const dbInstance = await db.getDb()
    const historyId = `hist-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
    const title = originalPrompt.substring(0, 80) + (originalPrompt.length > 80 ? '...' : '')

    const doc = {
      _id: historyId,
      userId,
      title,
      originalPrompt,
      category: category || 'General',
      promptMode: promptMode || 'general',
      savedAt: new Date(),
      responses: (responses || []).map(r => ({
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

    await dbInstance.collection('conversation_history').insertOne(doc)
    console.log(`[History] Auto-saved conversation for user ${userId}: ${historyId}`)

    // Generate embedding BEFORE sending response.
    // On Vercel serverless, fire-and-forget async work after res.json() is lost because
    // the execution environment freezes once the response is sent. The embedding MUST
    // complete before we respond, otherwise it will never be stored and memory/context
    // retrieval will fail for this conversation.
    let embeddingStored = false
    try {
      const embeddingText = buildEmbeddingText(originalPrompt, doc.responses, doc.summary)
      const embedding = await generateEmbedding(embeddingText, userId)
      if (embedding) {
        await dbInstance.collection('conversation_history').updateOne(
          { _id: historyId },
          { $set: { embedding, embeddingText } }
        )
        embeddingStored = true
        console.log(`[History] Embedding stored for ${historyId} (${embedding.length} dims)`)
      }
    } catch (embErr) {
      console.error(`[History] Embedding generation failed for ${historyId}:`, embErr.message)
    }

    res.json({ success: true, historyId, title, embeddingStored })
  } catch (error) {
    console.error('[History] Error auto-saving:', error)
    res.status(500).json({ error: 'Failed to save conversation history' })
  }
})

// POST /api/history/update-summary
router.post('/update-summary', async (req, res) => {
  try {
    const { historyId, userId, summary } = req.body

    if (!historyId || !userId || !summary) {
      return res.status(400).json({ error: 'historyId, userId, and summary are required' })
    }

    const dbInstance = await db.getDb()
    const doc = await dbInstance.collection('conversation_history').findOne({ _id: historyId, userId })
    if (!doc) {
      return res.status(404).json({ error: 'History entry not found' })
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

    await dbInstance.collection('conversation_history').updateOne(
      { _id: historyId, userId },
      { $set: { summary: summaryDoc } }
    )

    console.log(`[History] Updated summary for ${historyId}`)
    res.json({ success: true })
  } catch (error) {
    console.error('[History] Error updating summary:', error)
    res.status(500).json({ error: 'Failed to update summary' })
  }
})

// POST /api/history/update-conversation
router.post('/update-conversation', async (req, res) => {
  try {
    const { historyId, turn } = req.body

    if (!historyId || !turn) {
      return res.status(400).json({ error: 'historyId and turn are required' })
    }

    const dbInstance = await db.getDb()

    const conversationTurn = {
      type: turn.type || 'model',
      modelName: turn.modelName || 'Unknown',
      user: turn.user || '',
      assistant: turn.assistant || '',
      timestamp: new Date(),
      sources: turn.sources || [],
    }

    const result = await dbInstance.collection('conversation_history').updateOne(
      { _id: historyId },
      {
        $push: { conversationTurns: conversationTurn },
        $set: { updatedAt: new Date() }
      }
    )

    if (result.matchedCount === 0) {
      return res.status(404).json({ error: 'History entry not found' })
    }

    console.log(`[History] Updated conversation for ${historyId}: +1 ${conversationTurn.type} turn with ${conversationTurn.modelName}`)
    res.json({ success: true })
  } catch (error) {
    console.error('[History] Error updating conversation:', error)
    res.status(500).json({ error: 'Failed to update conversation history' })
  }
})

// POST /api/history/finalize
router.post('/finalize', async (req, res) => {
  try {
    const { historyId, userId } = req.body

    if (!historyId) {
      return res.status(400).json({ error: 'historyId is required' })
    }

    const dbInstance = await db.getDb()
    const doc = await dbInstance.collection('conversation_history').findOne({ _id: historyId })

    if (!doc) {
      return res.status(404).json({ error: 'History entry not found' })
    }

    const turns = doc.conversationTurns || []
    if (turns.length === 0) {
      console.log(`[History] Finalize ${historyId}: no conversation turns, skipping embedding regen`)
      return res.json({ success: true, embeddingUpdated: false })
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
        await dbInstance.collection('conversation_history').updateOne(
          { _id: historyId },
          { $set: { embedding, embeddingText, finalizedAt: new Date() } }
        )
        embeddingUpdated = true
        console.log(`[History] Finalized ${historyId}: embedding regenerated with ${turns.length} conversation turns (${embedding.length} dims)`)
      }
    } catch (embErr) {
      console.error(`[History] Finalize embedding failed for ${historyId}:`, embErr.message)
    }

    res.json({ success: true, embeddingUpdated })
  } catch (error) {
    console.error('[History] Error finalizing:', error)
    res.status(500).json({ error: 'Failed to finalize history entry' })
  }
})

// GET /api/history/detail/:historyId
// NOTE: This route MUST be defined BEFORE /:userId to avoid Express matching "detail" as a userId
router.get('/detail/:historyId', async (req, res) => {
  try {
    const { historyId } = req.params
    const dbInstance = await db.getDb()
    const doc = await dbInstance.collection('conversation_history').findOne({ _id: historyId })

    if (!doc) {
      return res.status(404).json({ error: 'History entry not found' })
    }

    let postedToFeed = false
    if (doc.userId && doc.originalPrompt) {
      const userPosts = await db.leaderboardPosts.getByUser(doc.userId)
      const normalizedPrompt = doc.originalPrompt.trim().toLowerCase()
      postedToFeed = userPosts.some(
        p => p.promptText && p.promptText.trim().toLowerCase() === normalizedPrompt
      )
    }

    res.json({
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
  } catch (error) {
    console.error('[History] Error fetching detail:', error)
    res.status(500).json({ error: 'Failed to fetch history detail' })
  }
})

// GET /api/history/:userId
router.get('/:userId', async (req, res) => {
  try {
    const { userId } = req.params
    if (!userId) {
      return res.status(400).json({ error: 'userId is required' })
    }

    const dbInstance = await db.getDb()
    const results = await dbInstance.collection('conversation_history')
      .find({ userId })
      .sort({ savedAt: -1 })
      .project({
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
      .toArray()

    const mapped = results.map(c => ({
      id: c._id,
      title: c.title,
      originalPrompt: c.originalPrompt,
      category: c.category,
      promptMode: c.promptMode || 'general',
      savedAt: c.savedAt,
      starred: !!c.starred,
      modelCount: c.responses?.length || 0,
      modelNames: (c.responses || []).filter(r => !r.error).map(r => r.modelName),
      consensus: c.summary?.consensus || null,
      isSingleModel: c.summary?.singleModel || (c.responses?.length === 1),
      hasSummary: !!c.summary,
    }))

    res.json({ history: mapped })
  } catch (error) {
    console.error('[History] Error listing:', error)
    res.status(500).json({ error: 'Failed to list conversation history' })
  }
})

// DELETE /api/history/:historyId
router.delete('/:historyId', async (req, res) => {
  try {
    const { historyId } = req.params
    const { userId } = req.body

    if (!userId) {
      return res.status(400).json({ error: 'userId is required' })
    }

    const dbInstance = await db.getDb()

    const entry = await dbInstance.collection('conversation_history').findOne({
      _id: historyId,
      userId,
    })

    if (!entry) {
      return res.status(404).json({ error: 'History entry not found or not owned by this user' })
    }

    await dbInstance.collection('conversation_history').deleteOne({ _id: historyId, userId })

    if (entry.category && entry.originalPrompt) {
      try {
        const userUsage = await db.usage.getOrDefault(userId)
        const cat = entry.category
        const prompts = userUsage.categoryPrompts?.[cat]
        if (prompts && prompts.length > 0) {
          const promptSnippet = entry.originalPrompt.substring(0, 500)
          const idx = prompts.findIndex(p => p.text === promptSnippet)
          if (idx !== -1) {
            prompts.splice(idx, 1)
            userUsage.categoryPrompts[cat] = prompts
            await db.usage.update(userId, { categoryPrompts: userUsage.categoryPrompts })
            console.log(`[History] Also removed prompt from category "${cat}" for user ${userId}`)
          }
        }
      } catch (catErr) {
        console.error(`[History] Non-fatal: failed to remove prompt from category:`, catErr.message)
      }
    }

    console.log(`[History] Deleted ${historyId} for user ${userId}`)
    res.json({ success: true })
  } catch (error) {
    console.error('[History] Error deleting:', error)
    res.status(500).json({ error: 'Failed to delete history entry' })
  }
})

// POST /api/history/star
router.post('/star', async (req, res) => {
  try {
    const { historyId, userId, starred } = req.body
    if (!historyId || !userId) {
      return res.status(400).json({ error: 'historyId and userId are required' })
    }

    const dbInstance = await db.getDb()
    const result = await dbInstance.collection('conversation_history').updateOne(
      { _id: historyId, userId },
      { $set: { starred: !!starred } }
    )

    if (result.matchedCount === 0) {
      return res.status(404).json({ error: 'History entry not found or not owned by this user' })
    }

    res.json({ success: true, starred: !!starred })
  } catch (error) {
    console.error('[History] Error toggling star:', error)
    res.status(500).json({ error: 'Failed to toggle star status' })
  }
})

// POST /api/history/restore-context
router.post('/restore-context', async (req, res) => {
  try {
    const { historyId, userId } = req.body
    if (!historyId || !userId) {
      return res.status(400).json({ error: 'historyId and userId are required' })
    }

    const dbInstance = await db.getDb()
    const entry = await dbInstance.collection('conversation_history').findOne({ _id: historyId, userId })
    if (!entry) {
      return res.status(404).json({ error: 'History entry not found' })
    }

    const judgeTurns = (entry.conversationTurns || []).filter(t => t.type === 'judge')
    const judgeConversationContext = judgeTurns.map(t => ({
      role: 'user',
      content: t.user,
      response: t.assistant,
    }))

    const modelConversationContext = {}
    ;(entry.conversationTurns || []).forEach(turn => {
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
    res.json({ success: true })
  } catch (error) {
    console.error('[History] Error restoring context:', error)
    res.status(500).json({ error: 'Failed to restore conversation context' })
  }
})

export default router
