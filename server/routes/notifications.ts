import { Router, type Request, type Response } from 'express'
import db from '../../database/db.js'
import { createLogger } from '../config/logger.js'
import { sendSuccess, sendError } from '../types/api.js'
import type { NotificationDoc } from '../../database/types.js'

const log = createLogger('notifications')
const router = Router()

// Helper: create a notification (fire-and-forget — non-blocking)
export const createNotification = async (notification: Record<string, any>) => {
  try {
    await db.notifications.create(notification as NotificationDoc)
  } catch (error: any) {
    log.error({ err: error }, 'Error creating notification')
  }
}

// Get notifications for a user
router.get('/:userId', async (req: Request, res: Response) => {
  try {
    const userId = req.userId
    const limit = parseInt(req.query.limit as string) || 50

    const notifications = await db.notifications.listForUser(userId!, limit)
    const unreadCount = await db.notifications.countUnread(userId!)

    sendSuccess(res, { notifications, unreadCount })
  } catch (error: any) {
    log.error({ err: error }, 'Error fetching notifications')
    sendError(res, 'Failed to fetch notifications')
  }
})

// Mark notifications as read
router.post('/mark-read', async (req: Request, res: Response) => {
  try {
    const userId = req.userId
    const { notificationIds } = req.body

    await db.notifications.markRead(userId!, notificationIds)
    sendSuccess(res, {})
  } catch (error: any) {
    log.error({ err: error }, 'Error marking notifications read')
    sendError(res, 'Failed to mark notifications as read')
  }
})

export default router
