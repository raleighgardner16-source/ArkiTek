import { vi } from 'vitest'

process.env.JWT_SECRET = 'test-secret-key-for-tests'
process.env.NODE_ENV = 'test'

vi.mock('../database/db.js', () => {
  const users = new Map()
  const usage = new Map()
  const userStats = new Map()
  let dbInstance = null

  return {
    default: {
      connect: vi.fn(),
      close: vi.fn(),
      getDb: vi.fn(() => {
        if (!dbInstance) {
          dbInstance = {
            collection: vi.fn(() => ({
              insertOne: vi.fn(),
              findOne: vi.fn(),
              updateOne: vi.fn(),
              deleteOne: vi.fn(),
              deleteMany: vi.fn(),
              updateMany: vi.fn(),
            })),
          }
        }
        return dbInstance
      }),
      users: {
        get: vi.fn((id) => users.get(id) || null),
        getByUsername: vi.fn((username) => {
          for (const [, user] of users) {
            if (user.username === username) return user
          }
          return null
        }),
        getByEmail: vi.fn((email) => {
          for (const [, user] of users) {
            if (user.email === email) return user
          }
          return null
        }),
        getByCanonicalEmail: vi.fn(() => null),
        create: vi.fn((id, data) => {
          users.set(id, { _id: id, ...data })
        }),
        update: vi.fn((id, updates) => {
          const user = users.get(id)
          if (user) users.set(id, { ...user, ...updates })
        }),
        delete: vi.fn((id) => users.delete(id)),
        countFreeTrialsByIp: vi.fn(() => 0),
        getUsedTrialForReturningUser: vi.fn(() => null),
        recordUsedTrial: vi.fn(),
      },
      usage: {
        create: vi.fn(),
        getAll: vi.fn(() => []),
      },
      userStats: {
        getOrCreate: vi.fn(),
        get: vi.fn(),
        addMonthlyCost: vi.fn(),
      },
      _users: users,
      _clearAll: () => {
        users.clear()
        usage.clear()
        userStats.clear()
      },
    },
  }
})

vi.mock('../database/adminDb.js', () => ({
  default: {
    connect: vi.fn(),
    close: vi.fn(),
    admins: {
      getList: vi.fn(() => []),
      isAdmin: vi.fn(() => false),
    },
    metadata: {
      incrementDeletedUsers: vi.fn(),
      getAdminStats: vi.fn(() => ({ deletedUsersCount: 0 })),
    },
  },
}))

vi.mock('../server/config/index.js', async () => {
  const actual = await vi.importActual('../server/config/index.js')
  return {
    ...actual,
    resend: null,
    stripe: {
      subscriptions: { cancel: vi.fn() },
      customers: { del: vi.fn() },
    },
    STRIPE_WEBHOOK_SECRET: 'whsec_test',
    APP_URL: 'http://localhost:3000',
  }
})
