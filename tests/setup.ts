import { vi } from 'vitest'

process.env.JWT_SECRET = 'test-secret-key-for-tests'
process.env.NODE_ENV = 'test'

vi.mock('../database/db.js', () => {
  const users = new Map()
  const usage = new Map()
  const userStats = new Map()
  let dbInstance: Record<string, unknown> | null = null

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
        get: vi.fn((id: string) => users.get(id) || null),
        getByUsername: vi.fn((username: string) => {
          for (const [, user] of users) {
            if (user.username === username) return user
          }
          return null
        }),
        getByEmail: vi.fn((email: string) => {
          for (const [, user] of users) {
            if (user.email === email) return user
          }
          return null
        }),
        getByCanonicalEmail: vi.fn(() => null),
        create: vi.fn((id: string, data: Record<string, unknown>) => {
          users.set(id, { _id: id, ...data })
        }),
        update: vi.fn((id: string, updates: Record<string, unknown>) => {
          const user = users.get(id)
          if (user) users.set(id, { ...user, ...updates })
        }),
        delete: vi.fn((id: string) => users.delete(id)),
        getAll: vi.fn(() => Array.from(users.values())),
        exists: vi.fn((id: string) => users.has(id)),
        countFreeTrialsByIp: vi.fn(() => 0),
        getUsedTrialForReturningUser: vi.fn(() => null),
        recordUsedTrial: vi.fn(),
      },
      usage: {
        create: vi.fn(),
        get: vi.fn(() => null),
        getAll: vi.fn(() => []),
        getOrDefault: vi.fn(() => ({
          totalPrompts: 0,
          totalTokens: 0,
          totalInputTokens: 0,
          totalOutputTokens: 0,
          monthlyUsage: {},
          dailyUsage: {},
          categories: {},
          categoryPrompts: {},
          promptHistory: [],
          providers: {},
          models: {},
          streakDays: 0,
          lastActiveAt: null,
          purchasedCredits: { remaining: 0 },
        })),
        update: vi.fn(),
        atomicInc: vi.fn(),
      },
      conversationHistory: {
        create: vi.fn(),
        getById: vi.fn(() => null),
        getByIdAndUser: vi.fn(() => null),
        update: vi.fn(),
        updateByUser: vi.fn(),
        pushConversationTurn: vi.fn(),
        listForUser: vi.fn(() => []),
        deleteByUser: vi.fn(),
        countForUser: vi.fn(() => 0),
        countWithEmbedding: vi.fn(() => 0),
        vectorSearch: vi.fn(() => []),
      },
      weeklyLeaderboard: {
        get: vi.fn(() => null),
        upsert: vi.fn(),
        finalize: vi.fn(),
        getAllFinalized: vi.fn(() => []),
        countProviderFirstPlace: vi.fn(() => 0),
        countModelFirstPlace: vi.fn(() => 0),
        getCumulativeWins: vi.fn(() => ({ providers: {}, models: {} })),
      },
      notifications: {
        create: vi.fn(),
        listForUser: vi.fn(() => []),
        countUnread: vi.fn(() => 0),
        markRead: vi.fn(),
      },
      conversations: {
        listForUser: vi.fn(() => []),
        getById: vi.fn(() => null),
        findDm: vi.fn(() => null),
        create: vi.fn(),
        updateLastMessage: vi.fn(),
      },
      messages: {
        listForConversation: vi.fn(() => []),
        create: vi.fn(),
        markRead: vi.fn(),
        countUnread: vi.fn(() => 0),
      },
      emailVerifications: {
        create: vi.fn(),
        findByToken: vi.fn(() => null),
        findRecentForUser: vi.fn(() => null),
        markUsed: vi.fn(),
        invalidateForUser: vi.fn(),
        deleteByToken: vi.fn(),
        deleteExpiredAndUsed: vi.fn(),
      },
      passwordResets: {
        create: vi.fn(),
        findByToken: vi.fn(() => null),
        markUsed: vi.fn(),
        deleteByToken: vi.fn(),
        deleteExpiredAndUsed: vi.fn(),
      },
      relationships: {
        follow: vi.fn(),
        unfollow: vi.fn(),
        sendRequest: vi.fn(),
        acceptRequest: vi.fn(),
        removeRequest: vi.fn(),
        getFollowers: vi.fn(() => []),
        getFollowing: vi.fn(() => []),
        getFollowRequests: vi.fn(() => []),
        isFollowing: vi.fn(() => false),
        hasRequested: vi.fn(() => false),
        getFollowersCount: vi.fn(() => 0),
        getFollowingCount: vi.fn(() => 0),
        getFollowersCounts: vi.fn(() => ({ followers: 0, following: 0 })),
        acceptAllRequests: vi.fn(),
      },
      prompts: {
        save: vi.fn(),
        getRecent: vi.fn(() => []),
        count: vi.fn(() => 0),
      },
      userStats: {
        getOrCreate: vi.fn(),
        get: vi.fn(() => null),
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

vi.mock('../server/config/env.js', () => ({
  default: {
    NODE_ENV: 'test',
    MONGODB_URI: 'mongodb://localhost:27017',
    DB_NAME: 'Arkitek',
    ADMIN_DB_NAME: 'Arkitek',
    JWT_SECRET: 'test-secret-key-for-tests',
    PORT: 3001,
    APP_URL: 'http://localhost:3000',
    ALLOWED_ORIGINS: '',
    OPENAI_API_KEY: '',
    ANTHROPIC_API_KEY: '',
    GOOGLE_API_KEY: '',
    XAI_API_KEY: '',
    META_API_KEY: '',
    DEEPSEEK_API_KEY: '',
    MISTRAL_API_KEY: '',
    SERPER_API_KEY: '',
    STRIPE_SECRET_KEY: '',
    STRIPE_PUBLISHABLE_KEY: '',
    STRIPE_PRICE_ID: '',
    STRIPE_PREMIUM_PRICE_ID: '',
    STRIPE_WEBHOOK_SECRET: '',
    RESEND_API_KEY: '',
    FROM_EMAIL: 'noreply@arkitek.app',
    SENTRY_DSN: '',
    VERCEL: '',
  },
}))

vi.mock('../server/config/sentry.js', () => ({
  Sentry: {
    captureException: vi.fn(),
    captureMessage: vi.fn(),
    flush: vi.fn(() => Promise.resolve()),
    setupExpressErrorHandler: vi.fn(),
  },
  isEnabled: false,
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
