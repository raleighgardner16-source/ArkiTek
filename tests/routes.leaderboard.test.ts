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

describe('leaderboard routes', () => {
  let app: express.Express

  beforeEach(async () => {
    vi.clearAllMocks()
    app = createApp()
    const { default: router } = await import('../server/routes/leaderboard.js')
    app.use('/', router)
  })

  describe('POST /submit', () => {
    it('submits a new post', async () => {
      mockDb.users.get.mockResolvedValue({ _id: 'test-user', username: 'tester' } as any)
      mockDb.leaderboardPosts.getByUser.mockResolvedValue([] as any)
      mockDb.leaderboardPosts.submit.mockResolvedValue('post-123' as any)

      const res = await request(app).post('/submit').send({
        promptText: 'What is the meaning of life?',
        category: 'Philosophy/Religion',
        responses: [{ modelName: 'gpt-4', text: 'It is 42' }],
      })
      expect(res.status).toBe(200)
      expect(res.body.success).toBe(true)
      expect(res.body.promptId).toBe('post-123')
    })

    it('rejects empty promptText', async () => {
      const res = await request(app).post('/submit').send({ promptText: '' })
      expect(res.status).toBe(400)
    })

    it('rejects missing promptText', async () => {
      const res = await request(app).post('/submit').send({})
      expect(res.status).toBe(400)
    })
  })

  describe('GET /', () => {
    it('returns leaderboard posts', async () => {
      const mockCollection = {
        find: vi.fn().mockReturnThis(),
        sort: vi.fn().mockReturnThis(),
        toArray: vi.fn().mockResolvedValue([
          {
            _id: 'p1',
            userId: 'test-user',
            promptText: 'Test prompt',
            likes: [],
            comments: [],
            submittedAt: new Date().toISOString(),
          },
        ]),
      }
      ;(db as any).getDb = vi.fn().mockResolvedValue({
        collection: vi.fn().mockReturnValue(mockCollection),
      })
      mockDb.users.getAll.mockResolvedValue([
        { _id: 'test-user', username: 'tester', firstName: 'Test' },
      ] as any)

      const res = await request(app).get('/')
      expect(res.status).toBe(200)
      expect(res.body.success).toBe(true)
      expect(res.body.prompts).toBeDefined()
    })
  })

  describe('POST /like', () => {
    it('toggles like on a post', async () => {
      mockDb.leaderboardPosts.toggleLike.mockResolvedValue({ liked: true, likeCount: 1 } as any)
      // The like handler also tries to send a notification by calling db.getDb().collection('leaderboard_posts').findOne
      ;(db as any).getDb = vi.fn().mockResolvedValue({
        collection: vi.fn().mockReturnValue({
          findOne: vi.fn().mockResolvedValue({ _id: 'p1', userId: 'other-user' }),
        }),
      })

      const res = await request(app).post('/like').send({ promptId: 'p1' })
      expect(res.status).toBe(200)
      expect(res.body.success).toBe(true)
    })

    it('rejects missing promptId', async () => {
      const res = await request(app).post('/like').send({})
      expect(res.status).toBe(400)
    })
  })

  describe('DELETE /delete/:promptId', () => {
    it('deletes own post', async () => {
      mockDb.leaderboardPosts.delete.mockResolvedValue(true as any)

      const res = await request(app).delete('/delete/p1')
      expect(res.status).toBe(200)
      expect(res.body.success).toBe(true)
    })

    it('returns 404 when post not found or not owner', async () => {
      mockDb.leaderboardPosts.delete.mockResolvedValue(false as any)

      const res = await request(app).delete('/delete/p1')
      expect(res.status).toBe(404)
    })
  })

  describe('POST /comment', () => {
    it('adds a comment to a post', async () => {
      mockDb.leaderboardPosts.addComment.mockResolvedValue(undefined as any)
      ;(db as any).getDb = vi.fn().mockResolvedValue({
        collection: vi.fn().mockReturnValue({
          findOne: vi.fn().mockResolvedValue({ _id: 'p1', userId: 'other-user' }),
        }),
      })

      const res = await request(app).post('/comment').send({
        promptId: 'p1',
        commentText: 'Great post!',
      })
      expect(res.status).toBe(200)
      expect(res.body.success).toBe(true)
    })

    it('rejects empty comment text', async () => {
      const res = await request(app).post('/comment').send({
        promptId: 'p1',
        commentText: '',
      })
      expect(res.status).toBe(400)
    })
  })

  describe('POST /comment/reply', () => {
    it('adds a reply to a comment', async () => {
      mockDb.leaderboardPosts.addReply.mockResolvedValue(undefined as any)
      ;(db as any).getDb = vi.fn().mockResolvedValue({
        collection: vi.fn().mockReturnValue({
          findOne: vi.fn().mockResolvedValue({
            _id: 'p1',
            userId: 'other',
            comments: [{ _id: 'c1', userId: 'commenter', text: 'hi' }],
          }),
        }),
      })

      const res = await request(app).post('/comment/reply').send({
        promptId: 'p1',
        commentId: 'c1',
        replyText: 'Thanks!',
      })
      expect(res.status).toBe(200)
      expect(res.body.success).toBe(true)
    })
  })

  describe('POST /comment/like', () => {
    it('toggles like on a comment', async () => {
      mockDb.leaderboardPosts.toggleCommentLike.mockResolvedValue({ liked: true, likeCount: 1 } as any)

      const res = await request(app).post('/comment/like').send({
        promptId: 'p1',
        commentId: 'c1',
      })
      expect(res.status).toBe(200)
      expect(res.body.success).toBe(true)
      expect(res.body.liked).toBe(true)
    })

    it('rejects missing fields', async () => {
      const res = await request(app).post('/comment/like').send({})
      expect(res.status).toBe(400)
    })
  })
})
