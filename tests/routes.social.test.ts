import { describe, it, expect, vi, beforeEach } from 'vitest'
import express from 'express'
import request from 'supertest'
import db from '../database/db.js'

const mockDb = vi.mocked(db)

vi.mock('../server/routes/notifications.js', () => ({
  createNotification: vi.fn(),
  default: express.Router(),
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

describe('profile routes', () => {
  let app: express.Express

  beforeEach(async () => {
    vi.clearAllMocks()
    app = createApp()
    const { profileRouter } = await import('../server/routes/social.js')
    app.use('/', profileRouter)
  })

  describe('GET /:userId', () => {
    it('returns 404 for non-existent user', async () => {
      mockDb.users.get.mockResolvedValue(null)

      const res = await request(app).get('/missing-user')
      expect(res.status).toBe(404)
    })
  })

  describe('PUT /:userId', () => {
    it('updates profile fields', async () => {
      mockDb.users.get.mockResolvedValue({
        _id: 'test-user',
        username: 'tester',
        isPrivate: false,
      } as any)
      mockDb.users.update.mockResolvedValue(undefined as any)

      const res = await request(app).put('/test-user').send({
        bio: 'Updated bio',
        isAnonymous: false,
      })
      expect(res.status).toBe(200)
      expect(res.body.success).toBe(true)
    })

    it('accepts bio up to 300 chars', async () => {
      mockDb.users.get.mockResolvedValue({
        _id: 'test-user',
        username: 'tester',
        isPrivate: false,
      } as any)
      mockDb.users.update.mockResolvedValue(undefined as any)

      const res = await request(app).put('/test-user').send({
        bio: 'x'.repeat(300),
      })
      expect(res.status).toBe(200)
    })

    it('rejects oversized profile image with 413', async () => {
      mockDb.users.get.mockResolvedValue({
        _id: 'test-user',
        username: 'tester',
      } as any)

      const res = await request(app).put('/test-user').send({
        profileImage: 'x'.repeat(500001),
      })
      expect(res.status).toBe(413)
    })
  })
})

describe('users routes', () => {
  let app: express.Express

  beforeEach(async () => {
    vi.clearAllMocks()
    app = createApp()
    const { usersRouter } = await import('../server/routes/social.js')
    app.use('/', usersRouter)
  })

  describe('GET /search', () => {
    it('returns empty array for empty query', async () => {
      const res = await request(app).get('/search').query({ q: '' })
      expect(res.status).toBe(200)
      expect(res.body.users).toEqual([])
    })

    it('returns matching users', async () => {
      mockDb.users.getAll.mockResolvedValue([
        { _id: 'u1', username: 'alice', firstName: 'Alice', lastName: 'Smith', isAnonymous: false, followers: [] },
        { _id: 'u2', username: 'bob', firstName: 'Bob', lastName: 'Jones', isAnonymous: false, followers: [] },
      ] as any)

      const res = await request(app).get('/search').query({ q: 'alice' })
      expect(res.status).toBe(200)
      expect(res.body.users.length).toBeGreaterThan(0)
    })

    it('excludes anonymous users', async () => {
      mockDb.users.getAll.mockResolvedValue([
        { _id: 'u1', username: 'anon', firstName: 'Anon', isAnonymous: true, followers: [] },
      ] as any)

      const res = await request(app).get('/search').query({ q: 'anon' })
      expect(res.status).toBe(200)
      expect(res.body.users).toEqual([])
    })
  })

  describe('POST /:targetUserId/follow', () => {
    it('rejects following self', async () => {
      const res = await request(app).post('/test-user/follow')
      expect(res.status).toBe(400)
    })

    it('returns 404 for non-existent target user', async () => {
      mockDb.users.get.mockResolvedValue(null)

      const res = await request(app).post('/other-user/follow')
      expect(res.status).toBe(404)
    })

    it('follows a public user directly', async () => {
      const mockGetDb = vi.fn().mockResolvedValue({
        collection: vi.fn().mockReturnValue({
          updateOne: vi.fn().mockResolvedValue({ modifiedCount: 1 }),
        }),
      })
      ;(db as any).getDb = mockGetDb

      mockDb.users.get
        .mockResolvedValueOnce({ _id: 'test-user', username: 'tester', following: [], followers: [] } as any)
        .mockResolvedValueOnce({ _id: 'other-user', username: 'other', isPrivate: false, following: [], followers: [] } as any)

      const res = await request(app).post('/other-user/follow')
      expect(res.status).toBe(200)
      expect(res.body.success).toBe(true)
    })
  })

  describe('POST /:targetUserId/unfollow', () => {
    it('unfollows a user', async () => {
      const mockGetDb = vi.fn().mockResolvedValue({
        collection: vi.fn().mockReturnValue({
          updateOne: vi.fn().mockResolvedValue({ modifiedCount: 1 }),
        }),
      })
      ;(db as any).getDb = mockGetDb

      const res = await request(app).post('/other-user/unfollow')
      expect(res.status).toBe(200)
      expect(res.body.success).toBe(true)
    })
  })

  describe('GET /:userId/followers', () => {
    it('returns 404 for non-existent user', async () => {
      mockDb.users.get.mockResolvedValue(null)

      const res = await request(app).get('/missing/followers')
      expect(res.status).toBe(404)
    })
  })
})
