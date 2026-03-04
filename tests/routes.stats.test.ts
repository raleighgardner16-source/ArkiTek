import { describe, it, expect, vi, beforeEach } from 'vitest'
import express from 'express'
import request from 'supertest'
import db from '../database/db.js'

const mockDb = vi.mocked(db)

vi.mock('../server/services/usage.js', () => ({
  getUserTimezone: vi.fn(() => Promise.resolve(null)),
  getCurrentDateStringForUser: vi.fn(() => Promise.resolve('Saturday, February 28, 2026')),
  trackPrompt: vi.fn(() => Promise.resolve()),
  trackUsage: vi.fn(() => Promise.resolve()),
  trackConversationPrompt: vi.fn(() => Promise.resolve()),
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

describe('stats routes', () => {
  let app: express.Express

  beforeEach(async () => {
    vi.clearAllMocks()
    app = createApp()
    const { statsRouter } = await import('../server/routes/stats.js')
    app.use('/', statsRouter)
  })

  describe('POST /prompt', () => {
    it('tracks a prompt submission', async () => {
      const { trackPrompt } = await import('../server/services/usage.js')

      const res = await request(app).post('/prompt').send({
        promptText: 'What is quantum computing?',
        category: 'Science',
        responses: [{ modelName: 'gpt-4', text: 'Quantum computing...' }],
      })
      expect(res.status).toBe(200)
      expect(res.body.success).toBe(true)
      expect(trackPrompt).toHaveBeenCalled()
    })
  })

  describe('POST /token-update (deprecated)', () => {
    it('returns success (no-op)', async () => {
      const res = await request(app).post('/token-update').send({})
      expect(res.status).toBe(200)
      expect(res.body.success).toBe(true)
    })
  })

  describe('GET /:userId', () => {
    it('returns user stats', async () => {
      mockDb.users.get.mockResolvedValue({
        _id: 'test-user',
        username: 'tester',
        plan: 'pro',
        subscriptionStatus: 'active',
        stripeSubscriptionId: 'sub_123',
        createdAt: new Date().toISOString(),
      } as any)
      mockDb.usage.getOrDefault.mockResolvedValue({
        totalPrompts: 10,
        totalTokens: 5000,
        totalInputTokens: 3000,
        totalOutputTokens: 2000,
        monthlyUsage: {},
        dailyUsage: {},
        categories: { Science: 5, Tech: 5 },
        categoryPrompts: {},
        promptHistory: [],
        providers: {},
        models: {},
        streakDays: 3,
        lastActiveAt: '2026-02-28',
        purchasedCredits: { remaining: 0, total: 0, purchases: [] },
        ratings: {},
        earnedBadges: [],
      } as any)
      mockDb.userStats.get.mockResolvedValue({
        monthlyUsageCost: {},
        monthlyOverageBilled: {},
      } as any)

      const res = await request(app).get('/test-user')
      expect(res.status).toBe(200)
      expect(res.body.success).toBe(true)
      expect(res.body.totalPrompts).toBe(10)
      expect(res.body.totalTokens).toBe(5000)
    })
  })

  describe('POST /:userId/badges', () => {
    it('adds new badges without duplicates', async () => {
      mockDb.usage.getOrDefault.mockResolvedValue({
        earnedBadges: [{ id: 'badge-1', earnedAt: '2025-01-01' }],
      } as any)
      mockDb.usage.update.mockResolvedValue(undefined as any)

      const res = await request(app).post('/test-user/badges').send({
        newBadges: [
          { id: 'badge-2', earnedAt: '2025-06-15' },
          { id: 'badge-1', earnedAt: '2025-06-15' },
        ],
      })
      expect(res.status).toBe(200)
      expect(res.body.success).toBe(true)
    })
  })

  describe('GET /:userId/history', () => {
    it('returns prompt history', async () => {
      mockDb.usage.getOrDefault.mockResolvedValue({
        promptHistory: [
          { text: 'Test prompt', category: 'Science', timestamp: new Date().toISOString() },
        ],
      } as any)

      const res = await request(app).get('/test-user/history')
      expect(res.status).toBe(200)
      expect(res.body.success).toBe(true)
      expect(res.body.prompts).toHaveLength(1)
    })
  })

  describe('DELETE /:userId/history', () => {
    it('clears prompt history', async () => {
      mockDb.usage.update.mockResolvedValue(undefined as any)

      const res = await request(app).delete('/test-user/history')
      expect(res.status).toBe(200)
      expect(res.body.success).toBe(true)
    })
  })

  describe('GET /:userId/ratings', () => {
    it('returns user ratings', async () => {
      mockDb.usage.getOrDefault.mockResolvedValue({
        ratings: { 'response-1': 5, 'response-2': 4 },
      } as any)

      const res = await request(app).get('/test-user/ratings')
      expect(res.status).toBe(200)
      expect(res.body.success).toBe(true)
      expect(res.body.ratings).toBeDefined()
    })
  })

  describe('GET /:userId/streak', () => {
    it('returns streak information', async () => {
      mockDb.usage.getOrDefault.mockResolvedValue({
        streakDays: 5,
        lastActiveAt: '2026-02-28',
      } as any)
      mockDb.users.get.mockResolvedValue({
        _id: 'test-user',
        createdAt: '2026-01-01T00:00:00Z',
      } as any)

      const res = await request(app).get('/test-user/streak')
      expect(res.status).toBe(200)
      expect(res.body.success).toBe(true)
      expect(typeof res.body.streakDays).toBe('number')
    })
  })
})

describe('daily challenge routes', () => {
  let app: express.Express

  beforeEach(async () => {
    vi.clearAllMocks()
    app = createApp()
    const { dailyChallengeRouter } = await import('../server/routes/stats.js')
    app.use('/', dailyChallengeRouter)
  })

  describe('GET /:userId/status', () => {
    it('returns daily challenge status', async () => {
      mockDb.users.get.mockResolvedValue({
        _id: 'test-user',
        plan: 'pro',
        subscriptionStatus: 'active',
        stripeSubscriptionId: 'sub_123',
      } as any)
      mockDb.usage.getOrDefault.mockResolvedValue({
        totalPrompts: 5,
        councilPrompts: 2,
        dailyChallenges: {},
        dailyUsage: {},
      } as any)

      const res = await request(app).get('/test-user/status')
      expect(res.status).toBe(200)
      expect(res.body.success).toBe(true)
      expect(res.body.challenge).toBeDefined()
      expect(typeof res.body.challenge.progress).toBe('number')
    })
  })
})

describe('ratings routes', () => {
  let app: express.Express

  beforeEach(async () => {
    vi.clearAllMocks()
    app = createApp()
    const { ratingsRouter } = await import('../server/routes/stats.js')
    app.use('/', ratingsRouter)
  })

  describe('POST /', () => {
    it('saves a model win', async () => {
      mockDb.modelWins.upsert.mockResolvedValue(undefined as any)

      const res = await request(app).post('/').send({
        promptSessionId: 'session1',
        responseId: 'r1',
        provider: 'openai',
        model: 'gpt-4',
      })
      expect(res.status).toBe(200)
      expect(res.body.success).toBe(true)
    })

    it('rejects missing promptSessionId', async () => {
      const res = await request(app).post('/').send({ responseId: 'r1', provider: 'openai', model: 'gpt-4' })
      expect(res.status).toBe(400)
    })
  })
})

describe('user preferences routes', () => {
  let app: express.Express

  beforeEach(async () => {
    vi.clearAllMocks()
    app = createApp()
    const { userRouter } = await import('../server/routes/stats.js')
    app.use('/', userRouter)
  })

  describe('PUT /model-preferences', () => {
    it('saves model preferences', async () => {
      mockDb.users.update.mockResolvedValue(undefined as any)

      const res = await request(app).put('/model-preferences').send({
        selectedModels: ['gpt-4', 'claude-3'],
        autoSmartProviders: { openai: true },
      })
      expect(res.status).toBe(200)
      expect(res.body.success).toBe(true)
    })
  })

  describe('GET /model-preferences/:userId', () => {
    it('returns model preferences', async () => {
      mockDb.users.get.mockResolvedValue({
        _id: 'test-user',
        modelPreferences: {
          selectedModels: ['gpt-4'],
          autoSmartProviders: {},
        },
      } as any)

      const res = await request(app).get('/model-preferences/test-user')
      expect(res.status).toBe(200)
      expect(res.body.success).toBe(true)
    })
  })
})
