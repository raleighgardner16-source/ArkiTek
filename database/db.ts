/**
 * Database Access Layer for Arktek
 *
 * Provides a typed API for all database operations, organized by collection.
 *
 * Usage:
 *   import db from './database/db.js'
 *
 *   await db.connect()
 *   const user = await db.users.get('userId')
 *   await db.prompts.save('userId', promptData)
 *   await db.close()
 */

import { MongoClient, ObjectId } from 'mongodb'
import type { Db, WithId, Collection, Filter, UpdateFilter } from 'mongodb'
import env from '../server/config/env.js'
import { createLogger } from '../server/config/logger.js'
import type {
  UserDoc,
  UsedTrialDoc,
  RelationshipDoc,
  SubscriptionEventDoc,
  UsageDataDoc,
  UserStatsDoc,
  PromptDoc,
  PurchaseDoc,
  JudgeContextDoc,
  JudgeContextItem,
  LeaderboardPostDoc,
  PostComment,
  PostReply,
  ConversationHistoryDoc,
  ConversationTurn,
  EmailVerificationDoc,
  PasswordResetDoc,
  NotificationDoc,
  ConversationDoc,
  MessageDoc,
} from './types.js'

const log = createLogger('db')

// Singleton client
let client: MongoClient | null = null
let database: Db | null = null

// ============================================================================
// CONNECTION MANAGEMENT
// ============================================================================

function getMongoUri() {
  return env.MONGODB_URI
}

function getDbName() {
  return env.DB_NAME
}

async function connect(): Promise<Db> {
  if (database) return database

  const MONGODB_URI = getMongoUri()
  const DB_NAME = getDbName()

  try {
    client = new MongoClient(MONGODB_URI, {
      maxPoolSize: 10,
      minPoolSize: 2,
      retryWrites: true,
      w: 'majority',
    })

    await client.connect()
    database = client.db(DB_NAME)

    const sanitizedUri = MONGODB_URI.replace(/:([^:@]+)@/, ':****@')
    log.info({ dbName: DB_NAME, uri: sanitizedUri }, 'Connected to MongoDB')
    return database
  } catch (error: unknown) {
    log.error({ err: error }, 'Connection failed')
    throw error
  }
}

async function close(): Promise<void> {
  if (client) {
    await client.close()
    client = null
    database = null
    log.info('Connection closed')
  }
}

async function getDb(): Promise<Db> {
  if (!database) await connect()
  return database!
}

// ============================================================================
// Collection helpers (typed)
// ============================================================================

const col = {
  users: async (): Promise<Collection<UserDoc>> => (await getDb()).collection<UserDoc>('users'),
  usedTrials: async (): Promise<Collection<UsedTrialDoc>> => (await getDb()).collection<UsedTrialDoc>('used_trials'),
  prompts: async (): Promise<Collection<PromptDoc>> => (await getDb()).collection<PromptDoc>('prompts'),
  usageData: async (): Promise<Collection<UsageDataDoc>> => (await getDb()).collection<UsageDataDoc>('usage_data'),
  userStats: async (): Promise<Collection<UserStatsDoc>> => (await getDb()).collection<UserStatsDoc>('user_stats'),
  purchases: async (): Promise<Collection<PurchaseDoc>> => (await getDb()).collection<PurchaseDoc>('purchases'),
  judgeContext: async (): Promise<Collection<JudgeContextDoc>> => (await getDb()).collection<JudgeContextDoc>('judge_context'),
  leaderboardPosts: async (): Promise<Collection<LeaderboardPostDoc>> => (await getDb()).collection<LeaderboardPostDoc>('leaderboard_posts'),
  relationships: async (): Promise<Collection<RelationshipDoc>> => (await getDb()).collection<RelationshipDoc>('relationships'),
  subscriptionEvents: async (): Promise<Collection<SubscriptionEventDoc>> => (await getDb()).collection<SubscriptionEventDoc>('subscription_events'),
  conversationHistory: async (): Promise<Collection<ConversationHistoryDoc>> => (await getDb()).collection<ConversationHistoryDoc>('conversation_history'),
  emailVerifications: async (): Promise<Collection<EmailVerificationDoc>> => (await getDb()).collection<EmailVerificationDoc>('email_verifications'),
  passwordResets: async (): Promise<Collection<PasswordResetDoc>> => (await getDb()).collection<PasswordResetDoc>('password_resets'),
  notifications: async (): Promise<Collection<NotificationDoc>> => (await getDb()).collection<NotificationDoc>('notifications'),
  conversations: async (): Promise<Collection<ConversationDoc>> => (await getDb()).collection<ConversationDoc>('conversations'),
  messages: async (): Promise<Collection<MessageDoc>> => (await getDb()).collection<MessageDoc>('messages'),
}

// ============================================================================
// USER OPERATIONS
// ============================================================================

const users = {
  async get(userId: string): Promise<WithId<UserDoc> | null> {
    const c = await col.users()
    return c.findOne({ _id: userId } satisfies Filter<UserDoc>)
  },

  async getByUsername(username: string): Promise<WithId<UserDoc> | null> {
    const c = await col.users()
    return c.findOne({ username })
  },

  async getByEmail(email: string): Promise<WithId<UserDoc> | null> {
    const c = await col.users()
    return c.findOne({ email })
  },

  /**
   * Checks active users first, then the used_trials collection for
   * deleted accounts that consumed a free trial.
   */
  async getByCanonicalEmail(canonicalEmail: string): Promise<WithId<UserDoc> | WithId<UsedTrialDoc> | null> {
    const c = await col.users()
    const activeUser = await c.findOne({ canonicalEmail } satisfies Filter<UserDoc>)
    if (activeUser) return activeUser
    const trials = await col.usedTrials()
    return trials.findOne({ canonicalEmail } satisfies Filter<UsedTrialDoc>)
  },

  async countFreeTrialsByIp(ip: string): Promise<number> {
    const c = await col.users()
    const activeCount = await c.countDocuments({ signupIp: ip, plan: 'free_trial' } satisfies Filter<UserDoc>)
    const trials = await col.usedTrials()
    const deletedCount = await trials.countDocuments({ signupIp: ip })
    return activeCount + deletedCount
  },

  async getFreeTrialByFingerprint(fingerprint: string): Promise<WithId<UserDoc> | WithId<UsedTrialDoc> | null> {
    if (!fingerprint) return null
    const c = await col.users()
    const activeUser = await c.findOne({ deviceFingerprint: fingerprint, plan: 'free_trial' } satisfies Filter<UserDoc>)
    if (activeUser) return activeUser
    const trials = await col.usedTrials()
    return trials.findOne({ deviceFingerprint: fingerprint } satisfies Filter<UsedTrialDoc>)
  },

  async recordUsedTrial(trialData: Partial<UsedTrialDoc>): Promise<void> {
    const trials = await col.usedTrials()
    const doc: Record<string, unknown> = {
      ...trialData,
      recordedAt: new Date(),
    }
    if (trialData.remainingAllocation != null) doc.remainingAllocation = trialData.remainingAllocation
    if (trialData.deletionMonth) doc.deletionMonth = trialData.deletionMonth
    try {
      await trials.updateOne(
        { canonicalEmail: trialData.canonicalEmail } satisfies Filter<UsedTrialDoc>,
        { $set: doc } as UpdateFilter<UsedTrialDoc>,
        { upsert: true },
      )
      log.info({ email: trialData.email || trialData.canonicalEmail, remaining: trialData.remainingAllocation || 0 }, 'Recorded used trial')
    } catch (error: unknown) {
      log.error({ err: error }, 'Error recording used trial')
    }
  },

  /**
   * Find a used_trials record for returning user (by email, fingerprint, or IP).
   * Returns the record with highest remainingAllocation.
   */
  async getUsedTrialForReturningUser(
    canonicalEmail: string,
    fingerprint: string | null,
    signupIp: string,
  ): Promise<WithId<UsedTrialDoc> | null> {
    const trials = await col.usedTrials()
    const orClause: Record<string, unknown>[] = []
    if (canonicalEmail) orClause.push({ canonicalEmail })
    if (fingerprint) orClause.push({ deviceFingerprint: fingerprint })
    if (signupIp) orClause.push({ signupIp })
    if (orClause.length === 0) return null
    const candidates = await trials.find({ $or: orClause } satisfies Filter<UsedTrialDoc>).toArray()
    if (candidates.length === 0) return null
    return candidates.reduce((best, c) =>
      (c.remainingAllocation ?? 0) > (best.remainingAllocation ?? 0) ? c : best,
    )
  },

  async create(userId: string, userData: Partial<UserDoc>): Promise<UserDoc> {
    const c = await col.users()

    const doc: UserDoc = {
      _id: userId,
      email: userData.email!,
      canonicalEmail: (userData.canonicalEmail || userData.email) as string,
      password: userData.password ?? null,
      firstName: userData.firstName ?? null,
      lastName: userData.lastName ?? null,
      username: userData.username || userId,
      stripeCustomerId: null,
      stripeSubscriptionId: null,
      subscriptionStatus: (userData.subscriptionStatus as UserDoc['subscriptionStatus']) || 'inactive',
      subscriptionRenewalDate: null,
      createdAt: new Date(),
      lastActiveAt: new Date(),
      purchasedCredits: { total: 0, remaining: 0 },
      emailVerified: userData.emailVerified || false,
      signupIp: userData.signupIp ?? null,
      deviceFingerprint: userData.deviceFingerprint ?? null,
      plan: userData.plan ?? null,
      bio: '',
      profileImage: null,
      isAnonymous: false,
      isPrivate: false,
      ...(userData.timezone !== undefined ? { timezone: userData.timezone } : {}),
    }

    await c.insertOne(doc)
    return doc
  },

  async update(userId: string, updates: Partial<UserDoc>): Promise<void> {
    const c = await col.users()
    await c.updateOne(
      { _id: userId } satisfies Filter<UserDoc>,
      { $set: { ...updates, lastActiveAt: new Date() } } satisfies UpdateFilter<UserDoc>,
    )
  },

  async getAll(): Promise<WithId<UserDoc>[]> {
    const c = await col.users()
    return c.find({}).toArray()
  },

  async verifyPassword(userId: string, hashedPassword: string): Promise<WithId<UserDoc> | null> {
    const c = await col.users()
    return c.findOne({ _id: userId, password: hashedPassword } satisfies Filter<UserDoc>)
  },

  async updateStats(userId: string, stats: Record<string, number>): Promise<boolean> {
    const sCol = await col.userStats()

    const $inc: Record<string, number> = {}
    if (stats.totalTokens) $inc['stats.totalTokens'] = stats.totalTokens
    if (stats.totalInputTokens) $inc['stats.totalInputTokens'] = stats.totalInputTokens
    if (stats.totalOutputTokens) $inc['stats.totalOutputTokens'] = stats.totalOutputTokens
    if (stats.totalQueries) $inc['stats.totalQueries'] = stats.totalQueries
    if (stats.totalPrompts) $inc['stats.totalPrompts'] = stats.totalPrompts

    const update: UpdateFilter<UserStatsDoc> =
      Object.keys($inc).length > 0 ? { $set: { updatedAt: new Date() }, $inc } : { $set: { updatedAt: new Date() } }

    const result = await sCol.updateOne(
      { _id: userId } satisfies Filter<UserStatsDoc>,
      update,
      { upsert: true },
    )

    const c = await col.users()
    await c.updateOne({ _id: userId } satisfies Filter<UserDoc>, { $set: { lastActiveAt: new Date() } } satisfies UpdateFilter<UserDoc>)

    return result.modifiedCount > 0
  },

  async updateProviderStats(userId: string, provider: string, stats: Record<string, number>): Promise<void> {
    const sCol = await col.userStats()

    const $inc: Record<string, number> = {}
    if (stats.totalTokens) $inc[`stats.providers.${provider}.totalTokens`] = stats.totalTokens
    if (stats.totalInputTokens) $inc[`stats.providers.${provider}.totalInputTokens`] = stats.totalInputTokens
    if (stats.totalOutputTokens) $inc[`stats.providers.${provider}.totalOutputTokens`] = stats.totalOutputTokens

    await sCol.updateOne(
      { _id: userId } satisfies Filter<UserStatsDoc>,
      { $inc } as UpdateFilter<UserStatsDoc>,
      { upsert: true },
    )
  },

  async updateModelStats(userId: string, modelKey: string, stats: Record<string, unknown>): Promise<void> {
    const sCol = await col.userStats()

    const $inc: Record<string, number> = {}
    if (stats.totalTokens) $inc[`stats.models.${modelKey}.totalTokens`] = stats.totalTokens as number
    if (stats.totalInputTokens) $inc[`stats.models.${modelKey}.totalInputTokens`] = stats.totalInputTokens as number
    if (stats.totalOutputTokens) $inc[`stats.models.${modelKey}.totalOutputTokens`] = stats.totalOutputTokens as number
    if (stats.totalPrompts) $inc[`stats.models.${modelKey}.totalPrompts`] = stats.totalPrompts as number

    const $setOnInsert = {
      [`stats.models.${modelKey}.provider`]: stats.provider,
      [`stats.models.${modelKey}.model`]: stats.model,
    }

    await sCol.updateOne(
      { _id: userId } satisfies Filter<UserStatsDoc>,
      { $inc, $setOnInsert } as UpdateFilter<UserStatsDoc>,
      { upsert: true },
    )
  },

  async updateStripe(userId: string, stripeData: Partial<Pick<UserDoc, 'stripeCustomerId' | 'subscriptionStatus'> & { subscriptionId?: string }>): Promise<void> {
    const c = await col.users()

    const $set: Record<string, unknown> = {}
    if (stripeData.stripeCustomerId !== undefined) $set.stripeCustomerId = stripeData.stripeCustomerId
    if (stripeData.subscriptionStatus !== undefined) $set.subscriptionStatus = stripeData.subscriptionStatus
    if (stripeData.subscriptionId !== undefined) $set.subscriptionId = stripeData.subscriptionId

    await c.updateOne({ _id: userId } satisfies Filter<UserDoc>, { $set } as UpdateFilter<UserDoc>)
  },

  async updateCredits(userId: string, amount: number): Promise<void> {
    const c = await col.users()

    const $inc: Record<string, number> = {
      'purchasedCredits.remaining': amount,
    }
    if (amount > 0) {
      $inc['purchasedCredits.total'] = amount
    }

    await c.updateOne({ _id: userId } satisfies Filter<UserDoc>, { $inc } as UpdateFilter<UserDoc>)
  },

  async delete(userId: string): Promise<void> {
    const db = await getDb()

    const usersCol = db.collection<UserDoc>('users')
    const judgeCol = db.collection<JudgeContextDoc>('judge_context')
    const usageCol = db.collection<UsageDataDoc>('usage_data')
    const statsCol = db.collection<UserStatsDoc>('user_stats')

    await Promise.all([
      usersCol.deleteOne({ _id: userId } satisfies Filter<UserDoc>),
      db.collection('prompts').deleteMany({ userId }),
      db.collection('purchases').deleteMany({ userId }),
      judgeCol.deleteOne({ _id: userId } satisfies Filter<JudgeContextDoc>),
      usageCol.deleteOne({ _id: userId } satisfies Filter<UsageDataDoc>),
      statsCol.deleteOne({ _id: userId } satisfies Filter<UserStatsDoc>),
      db.collection('leaderboard_posts').deleteMany({ userId }),
      db.collection('conversation_history').deleteMany({ userId }),
      db.collection('daily_usage').deleteMany({ userId }),
      db.collection('email_verifications').deleteMany({ userId }),
      db.collection('relationships').deleteMany({ $or: [{ fromUserId: userId }, { toUserId: userId }] }),
      db.collection('subscription_events').deleteMany({ userId }),
    ])

    const lbCollection = db.collection<LeaderboardPostDoc>('leaderboard_posts')
    await Promise.all([
      lbCollection.updateMany(
        { likes: userId } satisfies Filter<LeaderboardPostDoc>,
        { $pull: { likes: userId }, $inc: { likeCount: -1 } } as UpdateFilter<LeaderboardPostDoc>,
      ),
      lbCollection.updateMany(
        { 'comments.userId': userId } satisfies Filter<LeaderboardPostDoc>,
        { $pull: { comments: { userId } } } as UpdateFilter<LeaderboardPostDoc>,
      ),
      lbCollection.updateMany(
        { 'comments.likes': userId } satisfies Filter<LeaderboardPostDoc>,
        { $pull: { 'comments.$[].likes': userId } } as UpdateFilter<LeaderboardPostDoc>,
      ),
      lbCollection.updateMany(
        { 'comments.replies.userId': userId } satisfies Filter<LeaderboardPostDoc>,
        { $pull: { 'comments.$[].replies': { userId } } } as UpdateFilter<LeaderboardPostDoc>,
      ),
    ])

    log.info({ userId }, 'Deleted user and ALL associated data')
  },

  async exists(userId: string): Promise<boolean> {
    const c = await col.users()
    const count = await c.countDocuments({ _id: userId } satisfies Filter<UserDoc>)
    return count > 0
  },
}

// ============================================================================
// PROMPT OPERATIONS
// ============================================================================

const prompts = {
  async save(userId: string, promptData: Partial<PromptDoc>): Promise<ObjectId> {
    const c = await col.prompts()

    const doc: PromptDoc = {
      _id: new ObjectId(),
      userId,
      text: promptData.text!,
      category: promptData.category || 'Uncategorized',
      timestamp: promptData.timestamp ? new Date(promptData.timestamp as string | Date) : new Date(),
      responses: promptData.responses || [],
      summary: promptData.summary ?? null,
      facts: promptData.facts || [],
      sources: promptData.sources || [],
      searchQuery: promptData.searchQuery ?? null,
      wasSearched: !!(promptData.facts && promptData.facts.length > 0),
    }

    const result = await c.insertOne(doc)
    return result.insertedId
  },

  async getRecent(userId: string, limit = 20): Promise<WithId<PromptDoc>[]> {
    const c = await col.prompts()
    return c.find({ userId }).sort({ timestamp: -1 }).limit(limit).toArray()
  },

  async getByCategory(userId: string, category: string, limit = 50): Promise<WithId<PromptDoc>[]> {
    const c = await col.prompts()
    return c.find({ userId, category }).sort({ timestamp: -1 }).limit(limit).toArray()
  },

  async getByDateRange(userId: string, startDate: Date, endDate: Date): Promise<WithId<PromptDoc>[]> {
    const c = await col.prompts()
    return c.find({
      userId,
      timestamp: { $gte: new Date(startDate), $lte: new Date(endDate) },
    } satisfies Filter<PromptDoc>).sort({ timestamp: -1 }).toArray()
  },

  async getByModel(userId: string, modelName: string, limit = 50): Promise<WithId<PromptDoc>[]> {
    const c = await col.prompts()
    return c.find({ userId, 'responses.modelName': modelName } satisfies Filter<PromptDoc>).sort({ timestamp: -1 }).limit(limit).toArray()
  },

  async getById(promptId: string | ObjectId): Promise<WithId<PromptDoc> | null> {
    const c = await col.prompts()
    const id = typeof promptId === 'string' ? new ObjectId(promptId) : promptId
    return c.findOne({ _id: id } satisfies Filter<PromptDoc>)
  },

  async count(userId: string): Promise<number> {
    const c = await col.prompts()
    return c.countDocuments({ userId })
  },

  async getCategoryStats(userId: string) {
    const c = await col.prompts()
    return c.aggregate([
      { $match: { userId } },
      { $group: { _id: '$category', count: { $sum: 1 }, latestPrompt: { $max: '$timestamp' } } },
      { $sort: { count: -1 } },
    ]).toArray()
  },

  async getPaginated(userId: string, page = 1, pageSize = 20) {
    const c = await col.prompts()
    const skip = (page - 1) * pageSize

    const [results, total] = await Promise.all([
      c.find({ userId }).sort({ timestamp: -1 }).skip(skip).limit(pageSize).toArray(),
      c.countDocuments({ userId }),
    ])

    return { prompts: results, total, page, pageSize, totalPages: Math.ceil(total / pageSize) }
  },
}

// ============================================================================
// USAGE DATA OPERATIONS (usage_data collection)
// ============================================================================

const DEFAULT_USAGE: Omit<UsageDataDoc, '_id'> = {
  totalTokens: 0,
  totalInputTokens: 0,
  totalOutputTokens: 0,
  totalQueries: 0,
  totalPrompts: 0,
  monthlyUsage: {},
  dailyUsage: {},
  providers: {},
  models: {},
  promptHistory: [],
  categories: {},
  categoryPrompts: {},
  ratings: {},
  lastActiveAt: null,
  streakDays: 0,
  judgeConversationContext: [],
  purchasedCredits: { total: 0, remaining: 0 },
  dailyChallengesClaimed: {},
}

const usage = {
  async get(userId: string): Promise<Omit<UsageDataDoc, '_id'> | null> {
    const c = await col.usageData()
    const doc = await c.findOne({ _id: userId } satisfies Filter<UsageDataDoc>)
    if (!doc) return null
    const { _id, updatedAt, ...data } = doc
    return { ...DEFAULT_USAGE, ...data }
  },

  async getOrDefault(userId: string): Promise<Omit<UsageDataDoc, '_id'>> {
    const existing = await this.get(userId)
    return existing || { ...DEFAULT_USAGE }
  },

  async create(userId: string, data: Partial<UsageDataDoc> = {}): Promise<UsageDataDoc> {
    const c = await col.usageData()
    const doc = { _id: userId, ...DEFAULT_USAGE, ...data, updatedAt: new Date() } as UsageDataDoc
    await c.insertOne(doc)
    return doc
  },

  async update(userId: string, setFields: Partial<UsageDataDoc> | Record<string, unknown>): Promise<void> {
    const c = await col.usageData()
    await c.updateOne(
      { _id: userId } satisfies Filter<UsageDataDoc>,
      { $set: { ...setFields, updatedAt: new Date() } } as UpdateFilter<UsageDataDoc>,
    )
  },

  async increment(userId: string, incFields: Record<string, number>): Promise<void> {
    const c = await col.usageData()
    await c.updateOne(
      { _id: userId } satisfies Filter<UsageDataDoc>,
      { $inc: incFields, $set: { updatedAt: new Date() } } as UpdateFilter<UsageDataDoc>,
    )
  },

  async atomicInc(userId: string, incFields: Record<string, number>, setFields?: Record<string, unknown>): Promise<void> {
    const c = await col.usageData()
    const update = {
      $inc: incFields,
      $set: { ...setFields, updatedAt: new Date() },
    } as UpdateFilter<UsageDataDoc>
    await c.updateOne({ _id: userId } satisfies Filter<UsageDataDoc>, update, { upsert: true })
  },

  async getAll(): Promise<WithId<UsageDataDoc>[]> {
    const c = await col.usageData()
    return c.find({}).toArray()
  },

  async delete(userId: string): Promise<void> {
    const c = await col.usageData()
    await c.deleteOne({ _id: userId } satisfies Filter<UsageDataDoc>)
  },
}

// ============================================================================
// USER STATS OPERATIONS (user_stats collection)
// ============================================================================

const userStats = {
  async get(userId: string): Promise<WithId<UserStatsDoc> | null> {
    const c = await col.userStats()
    return c.findOne({ _id: userId } satisfies Filter<UserStatsDoc>)
  },

  async getOrCreate(userId: string): Promise<WithId<UserStatsDoc> | UserStatsDoc> {
    const existing = await this.get(userId)
    if (existing) return existing
    const doc: UserStatsDoc = {
      _id: userId,
      userId,
      monthlyUsageCost: {},
      monthlyOverageBilled: {},
      stats: { totalTokens: 0, totalInputTokens: 0, totalOutputTokens: 0, totalQueries: 0, totalPrompts: 0, providers: {}, models: {} },
      updatedAt: new Date(),
    }
    try {
      const c = await col.userStats()
      await c.insertOne(doc)
    } catch (e: any) {
      if (e.code !== 11000) throw e
    }
    return doc
  },

  async update(userId: string, setFields: Partial<UserStatsDoc> | Record<string, unknown>): Promise<void> {
    const c = await col.userStats()
    await c.updateOne(
      { _id: userId } satisfies Filter<UserStatsDoc>,
      { $set: { ...setFields, updatedAt: new Date() } } as UpdateFilter<UserStatsDoc>,
    )
  },

  async increment(userId: string, incFields: Record<string, number>): Promise<void> {
    const c = await col.userStats()
    await c.updateOne(
      { _id: userId } satisfies Filter<UserStatsDoc>,
      { $inc: incFields, $set: { updatedAt: new Date() } } as UpdateFilter<UserStatsDoc>,
      { upsert: true },
    )
  },

  async addMonthlyCost(userId: string, month: string, amount: number): Promise<void> {
    const c = await col.userStats()
    const update = {
      $inc: { [`monthlyUsageCost.${month}`]: amount },
      $set: { updatedAt: new Date() },
    } as UpdateFilter<UserStatsDoc>
    await c.updateOne({ _id: userId } satisfies Filter<UserStatsDoc>, update, { upsert: true })
  },

  async setMonthlyOverage(userId: string, month: string, amount: number): Promise<void> {
    const c = await col.userStats()
    await c.updateOne(
      { _id: userId } satisfies Filter<UserStatsDoc>,
      { $set: { [`monthlyOverageBilled.${month}`]: amount, updatedAt: new Date() } } as UpdateFilter<UserStatsDoc>,
      { upsert: true },
    )
  },

  async getAll(): Promise<WithId<UserStatsDoc>[]> {
    const c = await col.userStats()
    return c.find({}).toArray()
  },

  async delete(userId: string): Promise<void> {
    const c = await col.userStats()
    await c.deleteOne({ _id: userId } satisfies Filter<UserStatsDoc>)
  },
}

// ============================================================================
// PURCHASE OPERATIONS
// ============================================================================

const purchases = {
  async save(userId: string, purchaseData: Partial<PurchaseDoc>): Promise<ObjectId> {
    const c = await col.purchases()

    const doc = {
      userId,
      timestamp: new Date(),
      amount: purchaseData.amount!,
      fee: purchaseData.fee!,
      total: purchaseData.total!,
      paymentIntentId: purchaseData.paymentIntentId!,
      status: purchaseData.status || 'succeeded',
    }

    const result = await c.insertOne(doc)

    if (purchaseData.status === 'succeeded') {
      await users.updateCredits(userId, purchaseData.amount!)
    }

    return result.insertedId
  },

  async getHistory(userId: string, limit = 50): Promise<WithId<PurchaseDoc>[]> {
    const c = await col.purchases()
    return c.find({ userId }).sort({ timestamp: -1 }).limit(limit).toArray()
  },

  async getRemainingCredits(userId: string): Promise<number> {
    const user = await users.get(userId)
    return user?.purchasedCredits?.remaining || 0
  },

  async getByPaymentIntent(paymentIntentId: string): Promise<WithId<PurchaseDoc> | null> {
    const c = await col.purchases()
    return c.findOne({ paymentIntentId })
  },
}

// ============================================================================
// JUDGE CONTEXT OPERATIONS
// ============================================================================

const judgeContext = {
  async get(userId: string): Promise<JudgeContextItem[]> {
    const c = await col.judgeContext()
    const doc = await c.findOne({ _id: userId } satisfies Filter<JudgeContextDoc>)
    return doc?.context || []
  },

  async add(userId: string, contextItem: Partial<JudgeContextItem>): Promise<JudgeContextItem[]> {
    const c = await col.judgeContext()

    const doc = await c.findOne({ _id: userId } satisfies Filter<JudgeContextDoc>)
    let context = doc?.context || []

    if (context.length > 0 && context[0].isFull) {
      context[0].isFull = false
    }

    context.unshift({
      response: contextItem.response ?? null,
      summary: contextItem.summary ?? null,
      tokens: contextItem.tokens || 0,
      originalPrompt: contextItem.originalPrompt ?? null,
      timestamp: new Date(),
      isFull: contextItem.isFull || false,
    })

    context = context.slice(0, 5)

    await c.updateOne(
      { _id: userId } satisfies Filter<JudgeContextDoc>,
      { $set: { context, userId } } satisfies UpdateFilter<JudgeContextDoc>,
      { upsert: true },
    )

    return context
  },

  async clear(userId: string): Promise<void> {
    const c = await col.judgeContext()
    await c.updateOne(
      { _id: userId } satisfies Filter<JudgeContextDoc>,
      { $set: { context: [] } } satisfies UpdateFilter<JudgeContextDoc>,
      { upsert: true },
    )
  },
}

// ============================================================================
// LEADERBOARD OPERATIONS
// ============================================================================

const leaderboard = {
  async getTopByPrompts(limit = 10) {
    const c = await col.userStats()
    return c.find({}).sort({ 'stats.totalPrompts': -1 } satisfies Record<string, 1 | -1>).limit(limit)
      .project({ _id: 1, 'stats.totalPrompts': 1, 'stats.totalTokens': 1 })
      .toArray()
  },

  async getTopByTokens(limit = 10) {
    const c = await col.userStats()
    return c.find({}).sort({ 'stats.totalTokens': -1 } satisfies Record<string, 1 | -1>).limit(limit)
      .project({ _id: 1, 'stats.totalPrompts': 1, 'stats.totalTokens': 1 })
      .toArray()
  },
}

// ============================================================================
// LEADERBOARD POSTS OPERATIONS
// ============================================================================

const leaderboardPosts = {
  async submit(postData: Record<string, unknown> & { userId: string; username: string; promptText: string }): Promise<string> {
    const c = await col.leaderboardPosts()

    const postId = `prompt-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`

    const doc = {
      _id: postId,
      userId: postData.userId,
      username: postData.username,
      promptText: postData.promptText,
      category: (postData.category as string) || 'General Knowledge/Other',
      createdAt: new Date(),
      responses: (postData.responses as LeaderboardPostDoc['responses']) || [],
      summary: (postData.summary as LeaderboardPostDoc['summary']) ?? null,
      sources: (postData.sources as LeaderboardPostDoc['sources']) || [],
      likes: [] as string[],
      likeCount: 0,
      comments: [] as PostComment[],
    } satisfies LeaderboardPostDoc

    await c.insertOne(doc)
    return postId
  },

  async getRecent(limit = 15): Promise<WithId<LeaderboardPostDoc>[]> {
    const c = await col.leaderboardPosts()
    const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000)
    return c.find({ createdAt: { $gte: oneDayAgo } } satisfies Filter<LeaderboardPostDoc>).sort({ likeCount: -1, createdAt: -1 }).limit(limit).toArray()
  },

  async getTopAllTime(limit = 15): Promise<WithId<LeaderboardPostDoc>[]> {
    const c = await col.leaderboardPosts()
    return c.find({}).sort({ likeCount: -1 }).limit(limit).toArray()
  },

  async getByUser(userId: string): Promise<WithId<LeaderboardPostDoc>[]> {
    const c = await col.leaderboardPosts()
    return c.find({ userId }).sort({ createdAt: -1 }).toArray()
  },

  async getByCategory(category: string, limit = 15): Promise<WithId<LeaderboardPostDoc>[]> {
    const c = await col.leaderboardPosts()
    return c.find({ category }).sort({ likeCount: -1, createdAt: -1 }).limit(limit).toArray()
  },

  async toggleLike(postId: string, userId: string): Promise<{ liked: boolean; likeCount: number }> {
    const c = await col.leaderboardPosts()

    const post = await c.findOne({ _id: postId } satisfies Filter<LeaderboardPostDoc>)
    if (!post) throw new Error('Post not found')

    const alreadyLiked = post.likes.includes(userId)

    if (alreadyLiked) {
      await c.updateOne(
        { _id: postId } satisfies Filter<LeaderboardPostDoc>,
        { $pull: { likes: userId }, $inc: { likeCount: -1 } } as UpdateFilter<LeaderboardPostDoc>,
      )
      return { liked: false, likeCount: post.likeCount - 1 }
    } else {
      await c.updateOne(
        { _id: postId } satisfies Filter<LeaderboardPostDoc>,
        { $push: { likes: userId }, $inc: { likeCount: 1 } } as UpdateFilter<LeaderboardPostDoc>,
      )
      return { liked: true, likeCount: post.likeCount + 1 }
    }
  },

  async delete(postId: string, userId: string): Promise<boolean> {
    const c = await col.leaderboardPosts()
    const result = await c.deleteOne({ _id: postId, userId } satisfies Filter<LeaderboardPostDoc>)
    return result.deletedCount > 0
  },

  async addComment(postId: string, commentData: Partial<PostComment> & { userId: string; username: string; text: string }): Promise<string> {
    const c = await col.leaderboardPosts()

    const commentId = `comment-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`

    const comment: PostComment = {
      id: commentId,
      userId: commentData.userId,
      username: commentData.username,
      text: commentData.text,
      createdAt: new Date(),
      likes: [],
      likeCount: 0,
      replies: [],
    }

    await c.updateOne(
      { _id: postId } satisfies Filter<LeaderboardPostDoc>,
      { $push: { comments: comment } } as UpdateFilter<LeaderboardPostDoc>,
    )

    return commentId
  },

  async deleteComment(postId: string, commentId: string, userId: string): Promise<boolean> {
    const c = await col.leaderboardPosts()
    const result = await c.updateOne(
      { _id: postId } satisfies Filter<LeaderboardPostDoc>,
      { $pull: { comments: { id: commentId, userId } } } as UpdateFilter<LeaderboardPostDoc>,
    )
    return result.modifiedCount > 0
  },

  async addReply(postId: string, commentId: string, replyData: Partial<PostReply> & { userId: string; username: string; text: string }): Promise<string> {
    const c = await col.leaderboardPosts()

    const replyId = `reply-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`

    const reply: PostReply = {
      id: replyId,
      userId: replyData.userId,
      username: replyData.username,
      text: replyData.text,
      createdAt: new Date(),
    }

    await c.updateOne(
      { _id: postId, 'comments.id': commentId } satisfies Filter<LeaderboardPostDoc>,
      { $push: { 'comments.$.replies': reply } } as UpdateFilter<LeaderboardPostDoc>,
    )

    return replyId
  },

  async toggleCommentLike(postId: string, commentId: string, userId: string): Promise<{ liked: boolean; likeCount: number }> {
    const c = await col.leaderboardPosts()

    const post = await c.findOne({ _id: postId } satisfies Filter<LeaderboardPostDoc>)
    if (!post) throw new Error('Post not found')

    const comment = post.comments.find((cm: PostComment) => cm.id === commentId)
    if (!comment) throw new Error('Comment not found')

    const alreadyLiked = comment.likes.includes(userId)

    if (alreadyLiked) {
      await c.updateOne(
        { _id: postId, 'comments.id': commentId } satisfies Filter<LeaderboardPostDoc>,
        { $pull: { 'comments.$.likes': userId }, $inc: { 'comments.$.likeCount': -1 } } as UpdateFilter<LeaderboardPostDoc>,
      )
      return { liked: false, likeCount: comment.likeCount - 1 }
    } else {
      await c.updateOne(
        { _id: postId, 'comments.id': commentId } satisfies Filter<LeaderboardPostDoc>,
        { $push: { 'comments.$.likes': userId }, $inc: { 'comments.$.likeCount': 1 } } as UpdateFilter<LeaderboardPostDoc>,
      )
      return { liked: true, likeCount: comment.likeCount + 1 }
    }
  },
}

// ============================================================================
// RELATIONSHIP OPERATIONS (relationships collection)
// ============================================================================

const relationships = {
  async follow(fromUserId: string, toUserId: string): Promise<void> {
    const c = await col.relationships()
    await c.updateOne(
      { fromUserId, toUserId } satisfies Filter<RelationshipDoc>,
      { $set: { fromUserId, toUserId, type: 'follow', createdAt: new Date() } } satisfies UpdateFilter<RelationshipDoc>,
      { upsert: true },
    )
  },

  async unfollow(fromUserId: string, toUserId: string): Promise<void> {
    const c = await col.relationships()
    await c.deleteMany({ fromUserId, toUserId } satisfies Filter<RelationshipDoc>)
  },

  async sendRequest(fromUserId: string, toUserId: string): Promise<void> {
    const c = await col.relationships()
    await c.updateOne(
      { fromUserId, toUserId } satisfies Filter<RelationshipDoc>,
      { $set: { fromUserId, toUserId, type: 'follow_request', createdAt: new Date() } } satisfies UpdateFilter<RelationshipDoc>,
      { upsert: true },
    )
  },

  async acceptRequest(fromUserId: string, toUserId: string): Promise<void> {
    const c = await col.relationships()
    await c.updateOne(
      { fromUserId, toUserId, type: 'follow_request' } satisfies Filter<RelationshipDoc>,
      { $set: { type: 'follow', createdAt: new Date() } } satisfies UpdateFilter<RelationshipDoc>,
    )
  },

  async removeRequest(fromUserId: string, toUserId: string): Promise<void> {
    const c = await col.relationships()
    await c.deleteOne({ fromUserId, toUserId, type: 'follow_request' } satisfies Filter<RelationshipDoc>)
  },

  async getFollowers(userId: string): Promise<string[]> {
    const c = await col.relationships()
    const docs = await c.find({ toUserId: userId, type: 'follow' } satisfies Filter<RelationshipDoc>).toArray()
    return docs.map(d => d.fromUserId)
  },

  async getFollowing(userId: string): Promise<string[]> {
    const c = await col.relationships()
    const docs = await c.find({ fromUserId: userId, type: 'follow' } satisfies Filter<RelationshipDoc>).toArray()
    return docs.map(d => d.toUserId)
  },

  async getFollowRequests(userId: string): Promise<string[]> {
    const c = await col.relationships()
    const docs = await c.find({ toUserId: userId, type: 'follow_request' } satisfies Filter<RelationshipDoc>).toArray()
    return docs.map(d => d.fromUserId)
  },

  async isFollowing(fromUserId: string, toUserId: string): Promise<boolean> {
    const c = await col.relationships()
    const doc = await c.findOne({ fromUserId, toUserId, type: 'follow' } satisfies Filter<RelationshipDoc>)
    return !!doc
  },

  async hasRequested(fromUserId: string, toUserId: string): Promise<boolean> {
    const c = await col.relationships()
    const doc = await c.findOne({ fromUserId, toUserId, type: 'follow_request' } satisfies Filter<RelationshipDoc>)
    return !!doc
  },

  async getFollowersCount(userId: string): Promise<number> {
    const c = await col.relationships()
    return c.countDocuments({ toUserId: userId, type: 'follow' } satisfies Filter<RelationshipDoc>)
  },

  async getFollowingCount(userId: string): Promise<number> {
    const c = await col.relationships()
    return c.countDocuments({ fromUserId: userId, type: 'follow' } satisfies Filter<RelationshipDoc>)
  },

  async getFollowersCounts(userIds: string[]): Promise<Record<string, number>> {
    if (userIds.length === 0) return {}
    const c = await col.relationships()
    const results = await c.aggregate([
      { $match: { toUserId: { $in: userIds }, type: 'follow' } },
      { $group: { _id: '$toUserId', count: { $sum: 1 } } },
    ]).toArray()
    const map: Record<string, number> = {}
    for (const r of results) map[r._id as string] = (r as { _id: string; count: number }).count
    return map
  },

  async acceptAllRequests(toUserId: string): Promise<number> {
    const c = await col.relationships()
    const result = await c.updateMany(
      { toUserId, type: 'follow_request' } satisfies Filter<RelationshipDoc>,
      { $set: { type: 'follow', createdAt: new Date() } },
    )
    return result.modifiedCount
  },
}

// ============================================================================
// SUBSCRIPTION EVENT OPERATIONS (subscription_events collection)
// ============================================================================

const subscriptionEvents = {
  async add(userId: string, reason: string): Promise<void> {
    const c = await col.subscriptionEvents()
    await c.insertOne({
      userId,
      date: new Date().toISOString(),
      reason,
      createdAt: new Date(),
    } satisfies SubscriptionEventDoc)
  },

  async getForUser(userId: string): Promise<WithId<SubscriptionEventDoc>[]> {
    const c = await col.subscriptionEvents()
    return c.find({ userId }).sort({ createdAt: -1 }).toArray()
  },

  async getInDateRange(startDate: Date, endDate: Date): Promise<WithId<SubscriptionEventDoc>[]> {
    const c = await col.subscriptionEvents()
    return c.find({ createdAt: { $gte: startDate, $lt: endDate } } satisfies Filter<SubscriptionEventDoc>).toArray()
  },
}

// ============================================================================
// CONVERSATION HISTORY OPERATIONS (conversation_history collection)
// ============================================================================

const conversationHistory = {
  async create(doc: ConversationHistoryDoc): Promise<string> {
    const c = await col.conversationHistory()
    await c.insertOne(doc)
    return doc._id
  },

  async getById(historyId: string): Promise<WithId<ConversationHistoryDoc> | null> {
    const c = await col.conversationHistory()
    return c.findOne({ _id: historyId } satisfies Filter<ConversationHistoryDoc>)
  },

  async getByIdAndUser(historyId: string, userId: string): Promise<WithId<ConversationHistoryDoc> | null> {
    const c = await col.conversationHistory()
    return c.findOne({ _id: historyId, userId } satisfies Filter<ConversationHistoryDoc>)
  },

  async update(historyId: string, setFields: Partial<ConversationHistoryDoc> | Record<string, unknown>): Promise<boolean> {
    const c = await col.conversationHistory()
    const result = await c.updateOne(
      { _id: historyId } satisfies Filter<ConversationHistoryDoc>,
      { $set: setFields } as UpdateFilter<ConversationHistoryDoc>,
    )
    return result.matchedCount > 0
  },

  async updateByUser(historyId: string, userId: string, setFields: Partial<ConversationHistoryDoc> | Record<string, unknown>): Promise<boolean> {
    const c = await col.conversationHistory()
    const result = await c.updateOne(
      { _id: historyId, userId } satisfies Filter<ConversationHistoryDoc>,
      { $set: setFields } as UpdateFilter<ConversationHistoryDoc>,
    )
    return result.matchedCount > 0
  },

  async pushConversationTurn(historyId: string, turn: ConversationTurn): Promise<boolean> {
    const c = await col.conversationHistory()
    const update = { $push: { conversationTurns: turn }, $set: { updatedAt: new Date() } } as UpdateFilter<ConversationHistoryDoc>
    const result = await c.updateOne(
      { _id: historyId } satisfies Filter<ConversationHistoryDoc>,
      update,
    )
    return result.matchedCount > 0
  },

  async listForUser(userId: string, projection?: Record<string, 1>): Promise<WithId<ConversationHistoryDoc>[]> {
    const c = await col.conversationHistory()
    let cursor = c.find({ userId } satisfies Filter<ConversationHistoryDoc>).sort({ savedAt: -1 })
    if (projection) cursor = cursor.project(projection)
    return cursor.toArray()
  },

  async deleteByUser(historyId: string, userId: string): Promise<boolean> {
    const c = await col.conversationHistory()
    const result = await c.deleteOne({ _id: historyId, userId } satisfies Filter<ConversationHistoryDoc>)
    return result.deletedCount > 0
  },

  async countForUser(userId: string): Promise<number> {
    const c = await col.conversationHistory()
    return c.countDocuments({ userId })
  },

  async countWithEmbedding(userId: string): Promise<number> {
    const c = await col.conversationHistory()
    // Filter for documents with non-empty embedding (typed via assertion for $ne: null)
    const filter = { userId, embedding: { $exists: true, $ne: null } } as unknown as Filter<ConversationHistoryDoc>
    return c.countDocuments(filter)
  },

  /**
   * Run a MongoDB $vectorSearch aggregation. Returns raw documents — the
   * caller is responsible for filtering by score and projecting fields.
   */
  async vectorSearch(queryVector: number[], userId: string, limit: number, numCandidates = 50) {
    const c = await col.conversationHistory()
    return c.aggregate([
      {
        $vectorSearch: {
          index: 'conversation_embedding_index',
          path: 'embedding',
          queryVector,
          numCandidates,
          limit,
          filter: { userId },
        },
      },
      {
        $project: {
          _id: 1,
          userId: 1,
          title: 1,
          originalPrompt: 1,
          'summary.text': 1,
          'summary.consensus': 1,
          'responses.modelName': 1,
          'responses.actualModelName': 1,
          'responses.text': 1,
          savedAt: 1,
          score: { $meta: 'vectorSearchScore' },
        },
      },
    ]).toArray()
  },
}

// ============================================================================
// EMAIL VERIFICATION OPERATIONS (email_verifications collection)
// ============================================================================

const emailVerifications = {
  async create(data: Omit<EmailVerificationDoc, '_id'>): Promise<void> {
    const c = await col.emailVerifications()
    await c.insertOne(data)
  },

  async findByToken(token: string): Promise<WithId<EmailVerificationDoc> | null> {
    const c = await col.emailVerifications()
    return c.findOne({ token, used: false })
  },

  async findRecentForUser(userId: string, sinceMs: number): Promise<WithId<EmailVerificationDoc> | null> {
    const c = await col.emailVerifications()
    return c.findOne({
      userId,
      createdAt: { $gt: new Date(Date.now() - sinceMs) },
      used: false,
    } satisfies Filter<EmailVerificationDoc>)
  },

  async markUsed(token: string): Promise<void> {
    const c = await col.emailVerifications()
    await c.updateOne({ token }, { $set: { used: true } })
  },

  async invalidateForUser(userId: string): Promise<void> {
    const c = await col.emailVerifications()
    await c.updateMany({ userId, used: false }, { $set: { used: true } })
  },

  async deleteByToken(token: string): Promise<void> {
    const c = await col.emailVerifications()
    await c.deleteOne({ token })
  },

  async deleteExpiredAndUsed(): Promise<number> {
    const c = await col.emailVerifications()
    const result = await c.deleteMany({
      $or: [
        { expiresAt: { $lt: new Date() } },
        { used: true },
      ],
    })
    return result.deletedCount
  },
}

// ============================================================================
// PASSWORD RESET OPERATIONS (password_resets collection)
// ============================================================================

const passwordResets = {
  async create(data: Omit<PasswordResetDoc, '_id'>): Promise<void> {
    const c = await col.passwordResets()
    await c.insertOne(data)
  },

  async findByToken(token: string): Promise<WithId<PasswordResetDoc> | null> {
    const c = await col.passwordResets()
    return c.findOne({ token, used: false })
  },

  async markUsed(token: string): Promise<void> {
    const c = await col.passwordResets()
    await c.updateOne({ token }, { $set: { used: true } })
  },

  async deleteByToken(token: string): Promise<void> {
    const c = await col.passwordResets()
    await c.deleteOne({ token })
  },

  async deleteExpiredAndUsed(): Promise<number> {
    const c = await col.passwordResets()
    const result = await c.deleteMany({
      $or: [
        { expiresAt: { $lt: new Date() } },
        { used: true },
      ],
    })
    return result.deletedCount
  },
}

// ============================================================================
// NOTIFICATION OPERATIONS (notifications collection)
// ============================================================================

const notifications = {
  async create(notification: Partial<NotificationDoc> & { userId: string }): Promise<void> {
    const c = await col.notifications()
    await c.insertOne({
      ...notification,
      _id: `notif-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      createdAt: new Date(),
      read: false,
    } as NotificationDoc)
  },

  async listForUser(userId: string, limit = 50): Promise<WithId<NotificationDoc>[]> {
    const c = await col.notifications()
    return c.find({ userId }).sort({ createdAt: -1 }).limit(limit).toArray()
  },

  async countUnread(userId: string): Promise<number> {
    const c = await col.notifications()
    return c.countDocuments({ userId, read: false })
  },

  async markRead(userId: string, notificationIds?: string[]): Promise<void> {
    const c = await col.notifications()
    const filter: Filter<NotificationDoc> =
      notificationIds && notificationIds.length > 0
        ? { userId, _id: { $in: notificationIds } }
        : { userId }
    await c.updateMany(filter, { $set: { read: true } } satisfies UpdateFilter<NotificationDoc>)
  },
}

// ============================================================================
// CONVERSATION / MESSAGE OPERATIONS (messaging)
// ============================================================================

const conversations = {
  async listForUser(userId: string, type?: 'dm' | 'group'): Promise<WithId<ConversationDoc>[]> {
    const c = await col.conversations()
    const filter: Filter<ConversationDoc> =
      type ? { 'participants.userId': userId, type } : { 'participants.userId': userId }
    return c.find(filter).sort({ lastMessageAt: -1 }).toArray()
  },

  async getById(conversationId: string): Promise<WithId<ConversationDoc> | null> {
    const c = await col.conversations()
    return c.findOne({ _id: conversationId } satisfies Filter<ConversationDoc>)
  },

  async findDm(userId1: string, userId2: string): Promise<WithId<ConversationDoc> | null> {
    const c = await col.conversations()
    const allIds = [userId1, userId2].sort()
    return c.findOne({
      type: 'dm',
      'participants.userId': { $all: allIds },
      $expr: { $eq: [{ $size: '$participants' }, 2] },
    } satisfies Filter<ConversationDoc>)
  },

  async create(doc: ConversationDoc): Promise<ConversationDoc> {
    const c = await col.conversations()
    await c.insertOne(doc)
    return doc
  },

  async updateLastMessage(conversationId: string, data: { lastMessage: string; lastMessageAt: string; lastMessageBy: string }): Promise<void> {
    const c = await col.conversations()
    await c.updateOne({ _id: conversationId } satisfies Filter<ConversationDoc>, { $set: data } satisfies UpdateFilter<ConversationDoc>)
  },
}

const messages = {
  async listForConversation(conversationId: string, limit = 200): Promise<WithId<MessageDoc>[]> {
    const c = await col.messages()
    return c.find({ conversationId } satisfies Filter<MessageDoc>).sort({ createdAt: 1 }).limit(limit).toArray()
  },

  async create(message: MessageDoc): Promise<MessageDoc> {
    const c = await col.messages()
    await c.insertOne(message)
    return message
  },

  async markRead(conversationId: string, userId: string): Promise<void> {
    const c = await col.messages()
    await c.updateMany(
      { conversationId, readBy: { $ne: userId } } satisfies Filter<MessageDoc>,
      { $addToSet: { readBy: userId } } as UpdateFilter<MessageDoc>,
    )
  },

  async countUnread(userId: string, conversationIds: string[]): Promise<number> {
    if (conversationIds.length === 0) return 0
    const c = await col.messages()
    return c.countDocuments({
      conversationId: { $in: conversationIds },
      senderId: { $ne: userId },
      readBy: { $ne: userId },
    } satisfies Filter<MessageDoc>)
  },
}

// ============================================================================
// EXPORT
// ============================================================================

export default {
  connect,
  close,
  getDb,

  // Collections
  users,
  prompts,
  purchases,
  judgeContext,
  leaderboard,
  leaderboardPosts,
  usage,
  userStats,
  relationships,
  subscriptionEvents,

  // New typed repos
  conversationHistory,
  emailVerifications,
  passwordResets,
  notifications,
  conversations,
  messages,
}

export {
  connect,
  close,
  getDb,
  users,
  prompts,
  purchases,
  judgeContext,
  leaderboard,
  leaderboardPosts,
  usage,
  userStats,
  relationships,
  subscriptionEvents,
  conversationHistory,
  emailVerifications,
  passwordResets,
  notifications,
  conversations,
  messages,
}
