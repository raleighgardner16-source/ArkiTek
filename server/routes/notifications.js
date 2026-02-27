import { Router } from 'express'
import db from '../../database/db.js'

const router = Router()

// Helper: create a notification (fire-and-forget — non-blocking)
export const createNotification = async (notification) => {
  try {
    const dbInstance = await db.getDb()
    await dbInstance.collection('notifications').insertOne({
      ...notification,
      _id: `notif-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      createdAt: new Date(),
      read: false,
    })
  } catch (error) {
    console.error('[Notifications] Error creating notification:', error.message)
  }
}

// Get notifications for a user
router.get('/:userId', async (req, res) => {
  try {
    const { userId } = req.params
    const limit = parseInt(req.query.limit) || 50

    const dbInstance = await db.getDb()
    const notifications = await dbInstance.collection('notifications')
      .find({ userId })
      .sort({ createdAt: -1 })
      .limit(limit)
      .toArray()

    const unreadCount = await dbInstance.collection('notifications')
      .countDocuments({ userId, read: false })

    res.json({ notifications, unreadCount })
  } catch (error) {
    console.error('[Notifications] Error fetching notifications:', error)
    res.status(500).json({ error: 'Failed to fetch notifications' })
  }
})

// Mark notifications as read
router.post('/mark-read', async (req, res) => {
  try {
    const { userId, notificationIds } = req.body
    if (!userId) {
      return res.status(400).json({ error: 'userId is required' })
    }

    const dbInstance = await db.getDb()
    const filter = { userId }
    if (notificationIds && notificationIds.length > 0) {
      filter._id = { $in: notificationIds }
    }

    await dbInstance.collection('notifications').updateMany(filter, { $set: { read: true } })
    res.json({ success: true })
  } catch (error) {
    console.error('[Notifications] Error marking notifications read:', error)
    res.status(500).json({ error: 'Failed to mark notifications as read' })
  }
})

export default router
