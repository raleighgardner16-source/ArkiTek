import { describe, it, expect, vi, beforeEach } from 'vitest'
import express from 'express'
import request from 'supertest'
import db from '../database/db.js'
import { generateToken } from '../server/helpers/auth.js'

const mockDb = vi.mocked(db)

vi.mock('../server/services/subscription.js', () => ({
  syncSubscriptionFromStripe: vi.fn(() => Promise.resolve({ synced: false })),
  checkSubscriptionStatus: vi.fn(() => Promise.resolve({ hasAccess: true })),
  checkSubscriptionStatusAsync: vi.fn(() => Promise.resolve({ hasAccess: true })),
  usageExhaustedEmailsSent: new Map(),
  sendUsageExhaustedEmail: vi.fn(),
}))

const authToken = generateToken('test-user')

function createApp() {
  const app = express()
  app.use(express.json())
  return app
}

describe('stripe routes', () => {
  let app: express.Express

  beforeEach(async () => {
    vi.clearAllMocks()
    app = createApp()
    const { default: router } = await import('../server/routes/stripe.js')
    app.use('/', router)
  })

  describe('GET /config (public)', () => {
    it('returns error when publishable key is not configured', async () => {
      const res = await request(app).get('/config')
      // In test env, STRIPE_PUBLISHABLE_KEY is empty string
      expect(res.status).toBe(500)
      expect(res.body.success).toBe(false)
    })
  })

  describe('GET /subscription-status (authenticated)', () => {
    it('returns subscription status for user', async () => {
      mockDb.users.get.mockResolvedValue({
        _id: 'test-user',
        subscriptionStatus: 'active',
        plan: 'pro',
        subscriptionRenewalDate: new Date(Date.now() + 30 * 86400000).toISOString(),
        stripeSubscriptionId: 'sub_123',
      } as any)

      const res = await request(app)
        .get('/subscription-status')
        .set('Authorization', `Bearer ${authToken}`)
      expect(res.status).toBe(200)
      expect(res.body.success).toBe(true)
      expect(res.body.subscriptionStatus).toBe('active')
    })

    it('returns 404 when no user found', async () => {
      mockDb.users.get.mockResolvedValue(null)

      const res = await request(app)
        .get('/subscription-status')
        .set('Authorization', `Bearer ${authToken}`)
      expect(res.status).toBe(404)
    })

    it('rejects unauthenticated requests', async () => {
      const res = await request(app).get('/subscription-status')
      expect(res.status).toBe(401)
    })
  })

  describe('POST /create-usage-intent (authenticated)', () => {
    it('rejects amount below $1', async () => {
      mockDb.users.get.mockResolvedValue({ _id: 'test-user' } as any)

      const res = await request(app)
        .post('/create-usage-intent')
        .set('Authorization', `Bearer ${authToken}`)
        .send({ amount: 0.5 })
      expect(res.status).toBe(400)
    })

    it('rejects amount above $500', async () => {
      mockDb.users.get.mockResolvedValue({ _id: 'test-user' } as any)

      const res = await request(app)
        .post('/create-usage-intent')
        .set('Authorization', `Bearer ${authToken}`)
        .send({ amount: 501 })
      expect(res.status).toBe(400)
    })
  })

  describe('POST /confirm-usage-purchase (authenticated)', () => {
    it('rejects missing paymentIntentId', async () => {
      const res = await request(app)
        .post('/confirm-usage-purchase')
        .set('Authorization', `Bearer ${authToken}`)
        .send({ amount: 5 })
      expect(res.status).toBe(400)
    })

    it('rejects missing amount', async () => {
      const res = await request(app)
        .post('/confirm-usage-purchase')
        .set('Authorization', `Bearer ${authToken}`)
        .send({ paymentIntentId: 'pi_123' })
      expect(res.status).toBe(400)
    })
  })

  describe('POST /charge-saved-card (authenticated)', () => {
    it('rejects missing paymentMethodId', async () => {
      const res = await request(app)
        .post('/charge-saved-card')
        .set('Authorization', `Bearer ${authToken}`)
        .send({ amount: 5 })
      expect(res.status).toBe(400)
    })

    it('rejects amount below $1', async () => {
      const res = await request(app)
        .post('/charge-saved-card')
        .set('Authorization', `Bearer ${authToken}`)
        .send({ paymentMethodId: 'pm_123', amount: 0.5 })
      expect(res.status).toBe(400)
    })
  })

  describe('POST /upgrade-to-premium (authenticated)', () => {
    it('rejects when user has no active subscription', async () => {
      mockDb.users.get.mockResolvedValue({
        _id: 'test-user',
        subscriptionStatus: 'inactive',
      } as any)

      const res = await request(app)
        .post('/upgrade-to-premium')
        .set('Authorization', `Bearer ${authToken}`)
      expect(res.status).toBe(400)
    })
  })

  describe('POST /pause-subscription (authenticated)', () => {
    it('rejects when user has no subscription to pause', async () => {
      mockDb.users.get.mockResolvedValue({
        _id: 'test-user',
        subscriptionStatus: 'inactive',
      } as any)

      const res = await request(app)
        .post('/pause-subscription')
        .set('Authorization', `Bearer ${authToken}`)
      expect(res.status).toBe(400)
    })
  })
})
