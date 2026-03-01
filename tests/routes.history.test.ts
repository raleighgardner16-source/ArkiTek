import { describe, it, expect, vi, beforeEach } from 'vitest'
import express from 'express'
import request from 'supertest'
import db from '../database/db.js'

const mockDb = vi.mocked(db)

vi.mock('../server/services/memory.js', () => ({
  generateEmbedding: vi.fn(() => Promise.resolve([0.1, 0.2, 0.3])),
  buildEmbeddingText: vi.fn(() => 'embedding text'),
}))

function createApp() {
  const app = express()
  app.use(express.json())
  app.use((req, _res, next) => {
    req.userId = 'test-user'
    next()
  })
  return app
}

describe('history routes', () => {
  let app: express.Express

  beforeEach(async () => {
    vi.clearAllMocks()
    app = createApp()
    const { default: router } = await import('../server/routes/history.js')
    app.use('/', router)
  })

  describe('POST /auto-save', () => {
    it('saves a conversation and returns historyId', async () => {
      mockDb.users.get.mockResolvedValue({ _id: 'test-user' } as any)
      mockDb.conversationHistory.create.mockResolvedValue(undefined as any)
      mockDb.conversationHistory.update.mockResolvedValue(undefined as any)

      const res = await request(app).post('/auto-save').send({
        originalPrompt: 'What is AI?',
        responses: [{ modelName: 'gpt-4', text: 'AI is...' }],
      })
      expect(res.status).toBe(200)
      expect(res.body.success).toBe(true)
      expect(res.body.historyId).toBeTruthy()
      expect(res.body.title).toBeTruthy()
    })

    it('rejects when originalPrompt is missing', async () => {
      const res = await request(app).post('/auto-save').send({})
      expect(res.status).toBe(400)
    })
  })

  describe('POST /update-summary', () => {
    it('updates summary for a history entry', async () => {
      mockDb.conversationHistory.getByIdAndUser.mockResolvedValue({ _id: 'h1' } as any)
      mockDb.conversationHistory.updateByUser.mockResolvedValue(undefined as any)

      const res = await request(app).post('/update-summary').send({
        historyId: 'h1',
        summary: { text: 'Updated summary', consensus: 90 },
      })
      expect(res.status).toBe(200)
      expect(res.body.success).toBe(true)
    })

    it('rejects missing historyId', async () => {
      const res = await request(app).post('/update-summary').send({ summary: {} })
      expect(res.status).toBe(400)
    })
  })

  describe('POST /update-conversation', () => {
    it('pushes a conversation turn', async () => {
      mockDb.conversationHistory.pushConversationTurn.mockResolvedValue(true as any)

      const res = await request(app).post('/update-conversation').send({
        historyId: 'h1',
        turn: { user: 'Follow up', assistant: 'Response', modelName: 'gpt-4' },
      })
      expect(res.status).toBe(200)
      expect(res.body.success).toBe(true)
    })

    it('returns 404 when history not found', async () => {
      mockDb.conversationHistory.pushConversationTurn.mockResolvedValue(false as any)

      const res = await request(app).post('/update-conversation').send({
        historyId: 'missing',
        turn: { user: 'test', assistant: 'resp', modelName: 'gpt-4' },
      })
      expect(res.status).toBe(404)
    })

    it('rejects missing historyId', async () => {
      const res = await request(app).post('/update-conversation').send({
        turn: { user: 'test' },
      })
      expect(res.status).toBe(400)
    })
  })

  describe('POST /star', () => {
    it('stars a conversation', async () => {
      mockDb.conversationHistory.updateByUser.mockResolvedValue(true as any)

      const res = await request(app).post('/star').send({
        historyId: 'h1',
        starred: true,
      })
      expect(res.status).toBe(200)
      expect(res.body.success).toBe(true)
      expect(res.body.starred).toBe(true)
    })

    it('returns 404 when not found', async () => {
      mockDb.conversationHistory.updateByUser.mockResolvedValue(false as any)

      const res = await request(app).post('/star').send({
        historyId: 'missing',
        starred: true,
      })
      expect(res.status).toBe(404)
    })
  })

  describe('GET /:userId (uses req.userId)', () => {
    it('returns list of conversations for authenticated user', async () => {
      mockDb.conversationHistory.listForUser.mockResolvedValue([
        {
          _id: 'h1',
          title: 'Test Conversation',
          category: 'Science',
          originalPrompt: 'test',
          responses: [{ modelName: 'gpt-4' }],
          savedAt: new Date().toISOString(),
        },
      ] as any)

      const res = await request(app).get('/anything')
      expect(res.status).toBe(200)
      expect(res.body.success).toBe(true)
      expect(res.body.history).toHaveLength(1)
      expect(res.body.history[0]).toHaveProperty('id')
    })
  })

  describe('DELETE /:historyId', () => {
    it('deletes a conversation', async () => {
      mockDb.conversationHistory.getByIdAndUser.mockResolvedValue({
        _id: 'h1',
        category: 'Science',
      } as any)
      mockDb.conversationHistory.deleteByUser.mockResolvedValue(undefined as any)
      mockDb.usage.getOrDefault.mockResolvedValue({ categoryPrompts: {} } as any)

      const res = await request(app).delete('/h1')
      expect(res.status).toBe(200)
      expect(res.body.success).toBe(true)
    })

    it('returns 404 for non-existent entry', async () => {
      mockDb.conversationHistory.getByIdAndUser.mockResolvedValue(null)

      const res = await request(app).delete('/missing-id')
      expect(res.status).toBe(404)
    })
  })
})
