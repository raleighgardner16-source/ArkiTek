import { describe, it, expect, vi, beforeEach } from 'vitest'
import express from 'express'
import request from 'supertest'
import db from '../database/db.js'

const mockDb = vi.mocked(db)

vi.mock('../server/services/context.js', () => ({
  detectCategoryForJudge: vi.fn(() =>
    Promise.resolve({ category: 'Science', needsSearch: false, needsContext: false }),
  ),
  summarizeJudgeResponse: vi.fn(() => Promise.resolve({ summary: 'test', tokens: 10 })),
  storeJudgeContext: vi.fn(),
  storeModelContext: vi.fn(),
}))

vi.mock('../server/services/memory.js', () => ({
  generateEmbedding: vi.fn(() => Promise.resolve(null)),
  buildEmbeddingText: vi.fn(() => ''),
  findRelevantContext: vi.fn(() => Promise.resolve([])),
  formatMemoryContext: vi.fn(() => ''),
}))

vi.mock('../server/services/search.js', () => ({
  performSerperSearch: vi.fn(() => Promise.resolve({ organic: [] })),
  buildSearchContextSnippet: vi.fn(() => ''),
  reformulateSearchQuery: vi.fn((q: string) => Promise.resolve(q)),
  formatRawSourcesForPrompt: vi.fn(() => Promise.resolve({ formatted: '', sourceCount: 0, scrapedSources: [] })),
  cleanMistralResponse: vi.fn((c: string) => c),
}))

vi.mock('../server/services/subscription.js', () => ({
  checkSubscriptionStatusAsync: vi.fn(() => Promise.resolve({ hasAccess: true })),
  checkSubscriptionStatus: vi.fn(() => Promise.resolve({ hasAccess: true })),
  syncSubscriptionFromStripe: vi.fn(() => Promise.resolve({ synced: false })),
  usageExhaustedEmailsSent: new Map(),
  sendUsageExhaustedEmail: vi.fn(),
}))

vi.mock('axios', () => ({
  default: {
    post: vi.fn(() =>
      Promise.resolve({
        data: {
          candidates: [{ content: { parts: [{ text: 'Test response' }] } }],
          usageMetadata: { promptTokenCount: 100, candidatesTokenCount: 50, totalTokenCount: 150 },
        },
      }),
    ),
    get: vi.fn(),
  },
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

describe('judge routes', () => {
  let app: express.Express

  beforeEach(async () => {
    vi.clearAllMocks()
    app = createApp()
    const { default: router } = await import('../server/routes/judge.js')
    app.use('/', router)
    mockDb.usage.getOrDefault.mockResolvedValue({
      judgeConversationContext: [],
      modelConversationContext: {},
    } as any)
    mockDb.usage.update.mockResolvedValue(undefined as any)
    mockDb.usage.atomicInc.mockResolvedValue(undefined as any)
    mockDb.users.get.mockResolvedValue({} as any)
    mockDb.userStats.addMonthlyCost.mockResolvedValue(undefined as any)
  })

  describe('GET /context', () => {
    it('returns judge context for user', async () => {
      const context = [{ summary: 'Previous conversation', timestamp: new Date().toISOString() }]
      mockDb.usage.getOrDefault.mockResolvedValue({ judgeConversationContext: context } as any)

      const res = await request(app).get('/context')
      expect(res.status).toBe(200)
      expect(res.body.success).toBe(true)
      expect(res.body.context).toHaveLength(1)
    })

    it('returns empty context when none exists', async () => {
      mockDb.usage.getOrDefault.mockResolvedValue({} as any)

      const res = await request(app).get('/context')
      expect(res.status).toBe(200)
      expect(res.body.context).toEqual([])
    })
  })

  describe('POST /clear-context', () => {
    it('clears judge context', async () => {
      mockDb.usage.update.mockResolvedValue(undefined as any)

      const res = await request(app).post('/clear-context')
      expect(res.status).toBe(200)
      expect(res.body.success).toBe(true)
      expect(mockDb.usage.update).toHaveBeenCalledWith(
        'test-user',
        expect.objectContaining({ judgeConversationContext: [] }),
      )
    })
  })

  describe('POST /store-initial-summary', () => {
    it('stores initial summary text as context', async () => {
      const { storeJudgeContext } = await import('../server/services/context.js')

      const res = await request(app).post('/store-initial-summary').send({
        summaryText: 'The models agreed on X',
        originalPrompt: 'What is X?',
      })
      expect(res.status).toBe(200)
      expect(res.body.success).toBe(true)
      expect(storeJudgeContext).toHaveBeenCalledWith('test-user', 'The models agreed on X', 'What is X?')
    })

    it('rejects missing summaryText', async () => {
      const res = await request(app).post('/store-initial-summary').send({})
      expect(res.status).toBe(400)
    })
  })

  describe('POST /conversation', () => {
    it('rejects missing userMessage', async () => {
      const res = await request(app).post('/conversation').send({})
      expect(res.status).toBe(400)
    })

    it('returns error when Google API key not configured', async () => {
      const res = await request(app).post('/conversation').send({
        userMessage: 'Tell me more about that',
        conversationContext: [],
      })
      // API_KEYS.google is empty in test environment
      expect(res.status).toBe(500)
      expect(res.body.success).toBe(false)
    })
  })
})
