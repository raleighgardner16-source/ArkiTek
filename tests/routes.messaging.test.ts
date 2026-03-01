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

describe('messaging routes', () => {
  let app: express.Express

  beforeEach(async () => {
    vi.clearAllMocks()
    app = createApp()
    const { default: router } = await import('../server/routes/messaging.js')
    app.use('/', router)
  })

  describe('GET /conversations/:userId', () => {
    it('returns conversations for user', async () => {
      const convos = [{ _id: 'c1', type: 'dm', participants: [] }]
      mockDb.conversations.listForUser.mockResolvedValue(convos as any)

      const res = await request(app).get('/conversations/test-user')
      expect(res.status).toBe(200)
      expect(res.body.success).toBe(true)
      expect(res.body.conversations).toHaveLength(1)
    })
  })

  describe('GET /conversation/:conversationId', () => {
    it('returns messages for conversation', async () => {
      const messages = [{ _id: 'm1', text: 'Hello', senderId: 'test-user' }]
      mockDb.messages.listForConversation.mockResolvedValue(messages as any)
      mockDb.messages.markRead.mockResolvedValue(undefined as any)

      const res = await request(app).get('/conversation/conv-123')
      expect(res.status).toBe(200)
      expect(res.body.success).toBe(true)
      expect(res.body.messages).toHaveLength(1)
    })

    it('rejects missing conversationId', async () => {
      const res = await request(app).get('/conversation/')
      expect(res.status).toBe(404) // Express won't match the route
    })
  })

  describe('POST /send', () => {
    it('sends a message in an existing conversation', async () => {
      const conversation = {
        _id: 'conv-1',
        participants: [{ userId: 'test-user', username: 'tester' }],
      }
      mockDb.conversations.getById.mockResolvedValue(conversation as any)
      mockDb.messages.create.mockResolvedValue(undefined as any)
      mockDb.conversations.updateLastMessage.mockResolvedValue(undefined as any)
      mockDb.messages.markRead.mockResolvedValue(undefined as any)

      const res = await request(app)
        .post('/send')
        .send({ conversationId: 'conv-1', text: 'Hello!' })
      expect(res.status).toBe(200)
      expect(res.body.success).toBe(true)
      expect(res.body.message).toBeDefined()
    })

    it('rejects empty text', async () => {
      const res = await request(app)
        .post('/send')
        .send({ conversationId: 'conv-1', text: '' })
      expect(res.status).toBe(400)
    })

    it('rejects missing conversationId', async () => {
      const res = await request(app)
        .post('/send')
        .send({ text: 'Hello!' })
      expect(res.status).toBe(400)
    })

    it('returns 404 for non-existent conversation', async () => {
      mockDb.conversations.getById.mockResolvedValue(null)

      const res = await request(app)
        .post('/send')
        .send({ conversationId: 'missing', text: 'Hello!' })
      expect(res.status).toBe(404)
    })

    it('returns 403 if user is not a participant', async () => {
      mockDb.conversations.getById.mockResolvedValue({
        _id: 'conv-1',
        participants: [{ userId: 'other-user' }],
      } as any)

      const res = await request(app)
        .post('/send')
        .send({ conversationId: 'conv-1', text: 'Hello!' })
      expect(res.status).toBe(403)
    })
  })

  describe('POST /conversation/create', () => {
    it('creates a new DM conversation', async () => {
      mockDb.conversations.findDm.mockResolvedValue(null)
      mockDb.users.get.mockResolvedValue({ _id: 'other-user', username: 'other' } as any)
      mockDb.conversations.create.mockResolvedValue(undefined as any)

      const res = await request(app)
        .post('/conversation/create')
        .send({ type: 'dm', participantIds: ['other-user'] })
      expect(res.status).toBe(200)
      expect(res.body.success).toBe(true)
      expect(res.body.conversation).toBeDefined()
    })

    it('reuses existing DM if found', async () => {
      mockDb.conversations.findDm.mockResolvedValue({ _id: 'existing-conv' } as any)

      const res = await request(app)
        .post('/conversation/create')
        .send({ type: 'dm', participantIds: ['other-user'] })
      expect(res.status).toBe(200)
      expect(res.body.existing).toBe(true)
    })

    it('rejects empty participantIds', async () => {
      const res = await request(app)
        .post('/conversation/create')
        .send({ type: 'dm', participantIds: [] })
      expect(res.status).toBe(400)
    })
  })

  describe('POST /group/create', () => {
    it('creates a group conversation', async () => {
      mockDb.users.get.mockResolvedValue({ _id: 'test-user', username: 'tester' } as any)
      mockDb.conversations.create.mockResolvedValue(undefined as any)

      const res = await request(app)
        .post('/group/create')
        .send({ name: 'My Group', memberIds: ['user-2', 'user-3'] })
      expect(res.status).toBe(200)
      expect(res.body.success).toBe(true)
    })

    it('rejects missing group name', async () => {
      const res = await request(app)
        .post('/group/create')
        .send({ memberIds: ['user-2'] })
      expect(res.status).toBe(400)
    })
  })

  describe('GET /unread/:userId', () => {
    it('returns unread message count', async () => {
      mockDb.conversations.listForUser.mockResolvedValue([
        { _id: 'c1' },
        { _id: 'c2' },
      ] as any)
      mockDb.messages.countUnread.mockResolvedValue(3 as any)

      const res = await request(app).get('/unread/test-user')
      expect(res.status).toBe(200)
      expect(res.body.success).toBe(true)
      expect(typeof res.body.unreadCount).toBe('number')
    })
  })
})
