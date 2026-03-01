import { describe, it, expect, vi, beforeEach } from 'vitest'
import express from 'express'
import request from 'supertest'
import db from '../database/db.js'

const mockDb = vi.mocked(db)

function createApp() {
  const app = express()
  app.use(express.json())
  app.use((req, _res, next) => {
    req.userId = 'test-user'
    next()
  })
  return app
}

describe('notifications routes', () => {
  let app: express.Express

  beforeEach(async () => {
    vi.clearAllMocks()
    app = createApp()
    const { default: router } = await import('../server/routes/notifications.js')
    app.use('/', router)
  })

  describe('GET /:userId', () => {
    it('returns notifications and unread count', async () => {
      const mockNotifications = [
        { _id: 'n1', type: 'like', message: 'Someone liked your post', read: false },
      ]
      mockDb.notifications.listForUser.mockResolvedValue(mockNotifications as any)
      mockDb.notifications.countUnread.mockResolvedValue(1 as any)

      const res = await request(app).get('/test-user')
      expect(res.status).toBe(200)
      expect(res.body.success).toBe(true)
      expect(res.body.notifications).toHaveLength(1)
      expect(res.body.unreadCount).toBe(1)
    })

    it('returns empty arrays when no notifications', async () => {
      mockDb.notifications.listForUser.mockResolvedValue([] as any)
      mockDb.notifications.countUnread.mockResolvedValue(0 as any)

      const res = await request(app).get('/test-user')
      expect(res.status).toBe(200)
      expect(res.body.notifications).toHaveLength(0)
      expect(res.body.unreadCount).toBe(0)
    })
  })

  describe('POST /mark-read', () => {
    it('marks notifications as read', async () => {
      mockDb.notifications.markRead.mockResolvedValue(undefined as any)

      const res = await request(app).post('/mark-read').send({ notificationIds: ['n1', 'n2'] })
      expect(res.status).toBe(200)
      expect(res.body.success).toBe(true)
      expect(mockDb.notifications.markRead).toHaveBeenCalledWith('test-user', ['n1', 'n2'])
    })
  })
})

describe('createNotification helper', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('creates a notification in the database', async () => {
    mockDb.notifications.create.mockResolvedValue(undefined as any)
    const { createNotification } = await import('../server/routes/notifications.js')

    await createNotification({ type: 'like', userId: 'user-1', message: 'Test' })
    expect(mockDb.notifications.create).toHaveBeenCalled()
  })

  it('does not throw on error', async () => {
    mockDb.notifications.create.mockRejectedValue(new Error('DB error'))
    const { createNotification } = await import('../server/routes/notifications.js')

    await expect(createNotification({ type: 'like' })).resolves.toBeUndefined()
  })
})
