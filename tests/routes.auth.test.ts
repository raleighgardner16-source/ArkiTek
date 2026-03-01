import { describe, it, expect, vi, beforeEach } from 'vitest'
import express from 'express'
import request from 'supertest'
import db from '../database/db.js'
import { generateToken } from '../server/helpers/auth.js'

const mockDb = vi.mocked(db)

vi.mock('../server/services/usage.js', () => ({
  getUserTimezone: vi.fn(() => Promise.resolve(null)),
  trackPrompt: vi.fn(),
  trackUsage: vi.fn(),
  trackConversationPrompt: vi.fn(),
  getCurrentDateStringForUser: vi.fn(() => Promise.resolve('Saturday, February 28, 2026')),
}))

function createApp() {
  const app = express()
  app.use(express.json())
  return app
}

describe('auth routes', () => {
  let app: express.Express

  beforeEach(async () => {
    vi.clearAllMocks()
    app = createApp()
    const { default: router } = await import('../server/routes/auth.js')
    app.use('/', router)
  })

  describe('POST /signup', () => {
    it('rejects missing required fields', async () => {
      const res = await request(app).post('/signup').send({ firstName: 'Test' })
      expect(res.status).toBe(400)
      expect(res.body.error).toContain('required')
    })

    it('rejects short password', async () => {
      const res = await request(app).post('/signup').send({
        firstName: 'Test',
        lastName: 'User',
        username: 'testuser',
        email: 'test@example.com',
        password: '1234567',
        plan: 'pro',
      })
      expect(res.status).toBe(400)
      expect(res.body.error).toContain('8 characters')
    })

    it('rejects disposable email for free trial', async () => {
      const res = await request(app).post('/signup').send({
        firstName: 'Test',
        lastName: 'User',
        username: 'testuser',
        email: 'test@mailinator.com',
        password: 'password123',
        plan: 'free_trial',
      })
      expect(res.status).toBe(400)
      expect(res.body.error).toContain('permanent email')
    })

    it('rejects duplicate username', async () => {
      mockDb.users.getByUsername.mockResolvedValue({ _id: 'existing', username: 'testuser' } as any)

      const res = await request(app).post('/signup').send({
        firstName: 'Test',
        lastName: 'User',
        username: 'testuser',
        email: 'new@example.com',
        password: 'password123',
        plan: 'pro',
      })
      expect(res.status).toBe(400)
      expect(res.body.error).toContain('Username already exists')
    })

    it('rejects duplicate email', async () => {
      mockDb.users.getByUsername.mockResolvedValue(null)
      mockDb.users.getByEmail.mockResolvedValue({ _id: 'existing', email: 'test@example.com' } as any)

      const res = await request(app).post('/signup').send({
        firstName: 'Test',
        lastName: 'User',
        username: 'newuser',
        email: 'test@example.com',
        password: 'password123',
        plan: 'pro',
      })
      expect(res.status).toBe(400)
      expect(res.body.error).toContain('Email already registered')
    })

    it('rejects free trial when IP limit exceeded', async () => {
      mockDb.users.getByCanonicalEmail.mockResolvedValue(null)
      mockDb.users.countFreeTrialsByIp.mockResolvedValue(5 as any)

      const res = await request(app).post('/signup').send({
        firstName: 'Test',
        lastName: 'User',
        username: 'testuser',
        email: 'test@example.com',
        password: 'password123',
        plan: 'free_trial',
      })
      expect(res.status).toBe(400)
      expect(res.body.error).toContain('Free plan limit')
    })

    it('creates user on successful signup', async () => {
      mockDb.users.getByUsername.mockResolvedValue(null)
      mockDb.users.getByEmail.mockResolvedValue(null)
      mockDb.users.create.mockResolvedValue(undefined as any)
      mockDb.usage.create.mockResolvedValue(undefined as any)
      mockDb.userStats.getOrCreate.mockResolvedValue(undefined as any)
      mockDb.emailVerifications.create.mockResolvedValue(undefined as any)

      const res = await request(app).post('/signup').send({
        firstName: 'Test',
        lastName: 'User',
        username: 'newuser',
        email: 'test@example.com',
        password: 'password123',
        plan: 'pro',
      })
      expect(res.status).toBe(200)
      expect(res.body.success).toBe(true)
      expect(res.body.requiresVerification).toBe(true)
      expect(mockDb.users.create).toHaveBeenCalled()
    })
  })

  describe('POST /signin', () => {
    it('rejects missing credentials', async () => {
      const res = await request(app).post('/signin').send({})
      expect(res.status).toBe(400)
    })

    it('rejects non-existent user', async () => {
      mockDb.users.getByUsername.mockResolvedValue(null)

      const res = await request(app).post('/signin').send({
        username: 'nonexistent',
        password: 'password123',
      })
      expect(res.status).toBe(401)
    })
  })

  describe('POST /forgot-username', () => {
    it('always returns success (no user enumeration)', async () => {
      mockDb.users.getByEmail.mockResolvedValue(null)

      const res = await request(app).post('/forgot-username').send({ email: 'test@example.com' })
      expect(res.status).toBe(200)
      expect(res.body.success).toBe(true)
    })
  })

  describe('POST /forgot-password', () => {
    it('always returns success (no user enumeration)', async () => {
      mockDb.users.getByEmail.mockResolvedValue(null)

      const res = await request(app).post('/forgot-password').send({ email: 'test@example.com' })
      expect(res.status).toBe(200)
      expect(res.body.success).toBe(true)
    })
  })

  describe('POST /reset-password', () => {
    it('rejects missing token', async () => {
      const res = await request(app).post('/reset-password').send({ newPassword: 'newpass123' })
      expect(res.status).toBe(400)
    })

    it('rejects short new password', async () => {
      const res = await request(app).post('/reset-password').send({
        token: 'sometoken',
        newPassword: '1234567',
      })
      expect(res.status).toBe(400)
    })

    it('rejects invalid token', async () => {
      mockDb.passwordResets.findByToken.mockResolvedValue(null)

      const res = await request(app).post('/reset-password').send({
        token: 'invalidtoken',
        newPassword: 'newpass12345',
      })
      expect(res.status).toBe(400)
      expect(res.body.error).toContain('Invalid')
    })
  })

  describe('POST /verify-email', () => {
    it('rejects missing token', async () => {
      const res = await request(app).post('/verify-email').send({})
      expect(res.status).toBe(400)
    })

    it('rejects invalid token', async () => {
      mockDb.emailVerifications.findByToken.mockResolvedValue(null)

      const res = await request(app).post('/verify-email').send({ token: 'badtoken' })
      expect(res.status).toBe(400)
    })
  })

  describe('POST /check-verification', () => {
    it('returns verified:false when user is not verified', async () => {
      mockDb.users.get.mockResolvedValue({
        _id: 'u1',
        subscriptionStatus: 'pending_verification',
        emailVerified: false,
      } as any)

      const res = await request(app).post('/check-verification').send({ userId: 'u1' })
      expect(res.status).toBe(200)
      expect(res.body.verified).toBe(false)
    })
  })

  describe('POST /resend-verification', () => {
    it('rejects when user not in pending status', async () => {
      mockDb.users.get.mockResolvedValue({
        _id: 'u1',
        subscriptionStatus: 'active',
      } as any)

      const res = await request(app).post('/resend-verification').send({ userId: 'u1' })
      expect(res.status).toBe(400)
    })
  })

  describe('POST /update-timezone', () => {
    it('requires authentication', async () => {
      const res = await request(app).post('/update-timezone').send({ timezone: 'America/New_York' })
      expect(res.status).toBe(401)
    })

    it('updates timezone for authenticated user', async () => {
      mockDb.users.update.mockResolvedValue(undefined as any)
      const token = generateToken('test-user')

      const res = await request(app)
        .post('/update-timezone')
        .set('Authorization', `Bearer ${token}`)
        .send({ timezone: 'America/New_York' })
      expect(res.status).toBe(200)
      expect(res.body.success).toBe(true)
    })
  })
})
