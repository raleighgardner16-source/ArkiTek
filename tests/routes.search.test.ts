import { describe, it, expect, vi, beforeEach } from 'vitest'
import express from 'express'
import request from 'supertest'
import db from '../database/db.js'

const mockDb = vi.mocked(db)

vi.mock('../server/services/search.js', () => ({
  performSerperSearch: vi.fn(() =>
    Promise.resolve({
      organic: [{ title: 'Result 1', link: 'https://example.com', snippet: 'Test snippet' }],
    }),
  ),
  buildSearchContextSnippet: vi.fn(() => ''),
  reformulateSearchQuery: vi.fn((q: string) => Promise.resolve(q)),
  fetchPageContent: vi.fn(() => Promise.resolve(null)),
  isNonParseableSource: vi.fn(() => false),
  formatSearchResults: vi.fn(() => Promise.resolve('')),
  formatRawSourcesForPrompt: vi.fn(() => Promise.resolve({ formatted: '', sourceCount: 0, scrapedSources: [] })),
  verifyExtraction: vi.fn(() => ({ verifiedFacts: [], discardRate: 0 })),
  cleanMistralResponse: vi.fn((c: string) => c),
}))

vi.mock('../server/services/context.js', () => ({
  detectCategoryForJudge: vi.fn(() =>
    Promise.resolve({ category: 'Science', needsSearch: true, needsContext: false }),
  ),
  summarizeJudgeResponse: vi.fn(() => Promise.resolve({ summary: 'test', tokens: 10 })),
  storeJudgeContext: vi.fn(),
  storeModelContext: vi.fn(),
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

describe('search routes', () => {
  let app: express.Express

  beforeEach(async () => {
    vi.clearAllMocks()
    app = createApp()
    const { default: searchRouter } = await import('../server/routes/search.js')
    app.use('/search', searchRouter)
  })

  describe('POST /search', () => {
    it('performs a search and returns results', async () => {
      mockDb.usage.getOrDefault.mockResolvedValue({
        totalQueries: 0,
        monthlyUsage: {},
        dailyUsage: {},
        providers: {},
      } as any)
      mockDb.usage.update.mockResolvedValue(undefined as any)
      mockDb.usage.atomicInc.mockResolvedValue(undefined as any)
      mockDb.userStats.addMonthlyCost.mockResolvedValue(undefined as any)
      mockDb.users.get.mockResolvedValue({} as any)

      const res = await request(app).post('/search').send({ query: 'AI news' })
      expect(res.status).toBe(200)
      expect(res.body.success).toBe(true)
      expect(res.body.results).toBeDefined()
    })

    it('rejects empty query', async () => {
      const res = await request(app).post('/search').send({ query: '' })
      expect(res.status).toBe(400)
    })

    it('rejects missing query', async () => {
      const res = await request(app).post('/search').send({})
      expect(res.status).toBe(400)
    })
  })
})

describe('detect-search routes', () => {
  let app: express.Express

  beforeEach(async () => {
    vi.clearAllMocks()
    app = createApp()
    const { detectSearchRouter } = await import('../server/routes/search.js')
    app.use('/detect', detectSearchRouter)
  })

  describe('POST /detect', () => {
    it('detects whether search is needed', async () => {
      const res = await request(app).post('/detect').send({ query: 'Latest AI news' })
      expect(res.status).toBe(200)
      expect(res.body.success).toBe(true)
      expect(typeof res.body.needsSearch).toBe('boolean')
      expect(res.body.category).toBeTruthy()
    })

    it('rejects missing query', async () => {
      const res = await request(app).post('/detect').send({})
      expect(res.status).toBe(400)
    })
  })
})
