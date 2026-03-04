import { Router, type Request, type Response } from 'express'
import crypto from 'crypto'
import db from '../../database/db.js'
import { requireAuth } from '../middleware/requireAuth.js'
import { sendSuccess, sendError } from '../types/api.js'
import type { ShareDoc } from '../../database/types.js'

const router = Router()

router.post('/', requireAuth, async (req: Request, res: Response) => {
  try {
    const userId = req.userId
    if (!userId) return sendError(res, 'Authentication required', 401)

    const { prompt, category, responses, summary } = req.body
    if (!prompt || !responses || !Array.isArray(responses) || responses.length === 0) {
      return sendError(res, 'prompt and responses are required', 400)
    }

    const safeResponses = responses.map((r: any) => ({
      modelName: r.modelName || '',
      actualModelName: r.actualModelName || '',
      originalModelName: r.originalModelName || '',
      text: r.text || '',
      error: !!r.error,
    }))

    const safeSummary = summary ? {
      text: summary.text || '',
      consensus: summary.consensus ?? null,
      summary: summary.summary || '',
      agreements: summary.agreements || [],
      disagreements: summary.disagreements || [],
      differences: summary.differences || [],
      singleModel: !!summary.singleModel,
      modelName: summary.modelName || null,
    } : null

    const token = crypto.randomBytes(16).toString('hex')

    const now = new Date()
    const expiresAt = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000)

    const doc: ShareDoc = {
      _id: token,
      userId,
      prompt: String(prompt).slice(0, 10000),
      category: String(category || 'General').slice(0, 100),
      responses: safeResponses,
      summary: safeSummary,
      createdAt: now,
      expiresAt,
    }

    await db.shares.create(doc)

    sendSuccess(res, { shareToken: token })
  } catch (error: any) {
    console.error('[Share] Error creating share:', error)
    sendError(res, 'Failed to create share link')
  }
})

router.get('/:token', async (req: Request, res: Response) => {
  try {
    const { token } = req.params
    if (!token || token.length !== 32) {
      return sendError(res, 'Invalid share link', 404)
    }

    const share = await db.shares.getByToken(token)
    if (!share) {
      return sendError(res, 'Share not found or has expired', 404)
    }

    if (share.expiresAt && new Date(share.expiresAt) < new Date()) {
      return sendError(res, 'This share link has expired', 410)
    }

    sendSuccess(res, {
      prompt: share.prompt,
      category: share.category,
      responses: share.responses,
      summary: share.summary,
      createdAt: share.createdAt,
      expiresAt: share.expiresAt || null,
    })
  } catch (error: any) {
    console.error('[Share] Error fetching share:', error)
    sendError(res, 'Failed to load shared content')
  }
})

router.delete('/:token', requireAuth, async (req: Request, res: Response) => {
  try {
    const userId = req.userId
    if (!userId) return sendError(res, 'Authentication required', 401)

    const { token } = req.params
    const deleted = await db.shares.deleteByToken(token, userId)
    if (!deleted) {
      return sendError(res, 'Share not found or not owned by you', 404)
    }

    sendSuccess(res, { deleted: true })
  } catch (error: any) {
    console.error('[Share] Error deleting share:', error)
    sendError(res, 'Failed to delete share')
  }
})

export default router
