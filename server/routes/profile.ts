import { Router, type Request, type Response } from 'express'
import db from '../../database/db.js'
import { sendSuccess, sendError } from '../types/api.js'
import { createLogger } from '../config/logger.js'

const log = createLogger('profile')

const profileRouter = Router()

profileRouter.get('/:userId', async (req: Request, res: Response) => {
  try {
    const targetUserId = req.params.userId
    const user: any = await db.users.get(targetUserId)
    if (!user) return sendError(res, 'User not found', 404)

    const usage: any = await db.usage.getOrDefault(targetUserId)

    sendSuccess(res, {
      userId: user._id,
      username: user.username,
      bio: user.bio || '',
      profileImage: user.profileImage || null,
      isPrivate: user.isPrivate || false,
      showOnLeaderboard: user.showOnLeaderboard !== false,
      createdAt: user.createdAt,
      earnedBadges: usage.earnedBadges || [],
    })
  } catch (error: any) {
    log.error({ err: error }, 'Get profile error')
    sendError(res, 'Failed to get profile')
  }
})

profileRouter.put('/:userId', async (req: Request, res: Response) => {
  try {
    const userId = req.userId!
    const targetUserId = req.params.userId

    if (userId !== targetUserId) {
      return sendError(res, 'Unauthorized', 403)
    }

    const { bio, isPrivate, showOnLeaderboard, profileImage } = req.body

    const updates: Record<string, any> = {}
    if (bio !== undefined) updates.bio = (bio || '').substring(0, 300)
    if (isPrivate !== undefined) updates.isPrivate = !!isPrivate
    if (showOnLeaderboard !== undefined) updates.showOnLeaderboard = !!showOnLeaderboard
    if (profileImage !== undefined) updates.profileImage = profileImage

    await db.users.update(userId, updates)

    sendSuccess(res, { message: 'Profile updated' })
  } catch (error: any) {
    log.error({ err: error }, 'Update profile error')
    sendError(res, 'Failed to update profile')
  }
})

export default profileRouter
