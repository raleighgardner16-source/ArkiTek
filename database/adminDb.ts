/**
 * Admin Database Access Layer
 *
 * Separate database (ADMIN) for all admin-related data:
 * - admins: List of admin user IDs
 * - metadata: App-wide stats (deleted users, user counts)
 * - expenses: Monthly expense tracking (API costs, hosting, services)
 *
 * Usage:
 *   import adminDb from './database/adminDb.js'
 *
 *   await adminDb.connect()
 *   const isAdmin = await adminDb.admins.isAdmin('userId')
 *   await adminDb.expenses.save('2026-02', { stripeFees: 12.50, ... })
 *   await adminDb.close()
 */

import { MongoClient } from 'mongodb'
import type { Db, Collection, WithId, Filter, UpdateFilter } from 'mongodb'
import env from '../server/config/env.js'
import { createLogger } from '../server/config/logger.js'
import type { AdminListDoc, MetadataDoc, ExpenseDoc } from './types.js'

const log = createLogger('adminDb')

// Singleton client
let client: MongoClient | null = null
let database: Db | null = null

const DB_NAME = env.ADMIN_DB_NAME

// ============================================================================
// CONNECTION MANAGEMENT
// ============================================================================

function getMongoUri() {
  return env.MONGODB_URI
}

async function connect(): Promise<Db> {
  if (database) return database

  const MONGODB_URI = getMongoUri()

  try {
    client = new MongoClient(MONGODB_URI, {
      maxPoolSize: 5,
      minPoolSize: 1,
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

// Typed collection helpers
const col = {
  admins: async (): Promise<Collection<AdminListDoc>> => (await getDb()).collection<AdminListDoc>('admins'),
  metadata: async (): Promise<Collection<MetadataDoc>> => (await getDb()).collection<MetadataDoc>('metadata'),
  expenses: async (): Promise<Collection<ExpenseDoc>> => (await getDb()).collection<ExpenseDoc>('expenses'),
}

// ============================================================================
// ADMINS COLLECTION
// ============================================================================

const admins = {
  async getList(): Promise<string[]> {
    const c = await col.admins()
    const doc = await c.findOne({ _id: 'admin_list' } satisfies Filter<AdminListDoc>)
    return doc?.admins || []
  },

  async isAdmin(userId: string): Promise<boolean> {
    const adminList = await this.getList()
    return adminList.includes(userId)
  },

  async add(userId: string) {
    const c = await col.admins()
    return c.updateOne(
      { _id: 'admin_list' } satisfies Filter<AdminListDoc>,
      { $addToSet: { admins: userId } } satisfies UpdateFilter<AdminListDoc>,
      { upsert: true },
    )
  },

  async remove(userId: string) {
    const c = await col.admins()
    return c.updateOne(
      { _id: 'admin_list' } satisfies Filter<AdminListDoc>,
      { $pull: { admins: userId } } satisfies UpdateFilter<AdminListDoc>,
    )
  },

  async setList(adminList: string[]) {
    const c = await col.admins()
    return c.replaceOne(
      { _id: 'admin_list' } satisfies Filter<AdminListDoc>,
      { _id: 'admin_list', admins: adminList } as AdminListDoc,
      { upsert: true },
    )
  },
}

// ============================================================================
// METADATA COLLECTION
// ============================================================================

const metadata = {
  async get(key: string): Promise<WithId<MetadataDoc> | null> {
    const c = await col.metadata()
    return c.findOne({ _id: key } satisfies Filter<MetadataDoc>)
  },

  async set(key: string, data: Partial<MetadataDoc>) {
    const c = await col.metadata()
    return c.updateOne(
      { _id: key } satisfies Filter<MetadataDoc>,
      { $set: { ...data, lastUpdated: new Date() } } as UpdateFilter<MetadataDoc>,
      { upsert: true },
    )
  },

  async increment(key: string, field: string, amount = 1) {
    const c = await col.metadata()
    const update = { $inc: { [field]: amount }, $set: { lastUpdated: new Date() } } as UpdateFilter<MetadataDoc>
    return c.updateOne(
      { _id: key } satisfies Filter<MetadataDoc>,
      update,
      { upsert: true },
    )
  },

  async getAdminStats(): Promise<WithId<MetadataDoc> | null> {
    return this.get('admin_stats')
  },

  async updateAdminStats(stats: Partial<MetadataDoc>) {
    return this.set('admin_stats', stats)
  },

  async incrementDeletedUsers() {
    return this.increment('admin_stats', 'deletedUsersCount', 1)
  },
}

// ============================================================================
// EXPENSES COLLECTION
// ============================================================================

const expenses = {
  async get(monthKey?: string): Promise<WithId<ExpenseDoc> | null> {
    if (!monthKey) {
      const now = new Date()
      monthKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
    }
    const c = await col.expenses()
    return c.findOne({ _id: monthKey } satisfies Filter<ExpenseDoc>)
  },

  async save(monthKey: string | undefined, expenseData: Partial<ExpenseDoc>): Promise<ExpenseDoc> {
    if (!monthKey) {
      const now = new Date()
      monthKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
    }
    const c = await col.expenses()

    const doc: Omit<ExpenseDoc, '_id'> = {
      stripeFees: parseFloat(String(expenseData.stripeFees)) || 0,
      openaiCost: parseFloat(String(expenseData.openaiCost)) || 0,
      anthropicCost: parseFloat(String(expenseData.anthropicCost)) || 0,
      googleCost: parseFloat(String(expenseData.googleCost)) || 0,
      xaiCost: parseFloat(String(expenseData.xaiCost)) || 0,
      metaCost: parseFloat(String(expenseData.metaCost)) || 0,
      deepseekCost: parseFloat(String(expenseData.deepseekCost)) || 0,
      mistralCost: parseFloat(String(expenseData.mistralCost)) || 0,
      serperCost: parseFloat(String(expenseData.serperCost)) || 0,
      resendCost: parseFloat(String(expenseData.resendCost)) || 0,
      mongoDbCost: parseFloat(String(expenseData.mongoDbCost)) || 0,
      vercelCost: parseFloat(String(expenseData.vercelCost)) || 0,
      domainCost: parseFloat(String(expenseData.domainCost)) || 0,
      googleWorkspaceCost: parseFloat(String(expenseData.googleWorkspaceCost)) || 0,
      artlistCost: parseFloat(String(expenseData.artlistCost)) || 0,
      lastUpdated: new Date(),
    }

    await c.updateOne(
      { _id: monthKey } satisfies Filter<ExpenseDoc>,
      { $set: doc } satisfies UpdateFilter<ExpenseDoc>,
      { upsert: true },
    )

    return { _id: monthKey, ...doc }
  },

  async getAll(): Promise<Array<WithId<ExpenseDoc>>> {
    const c = await col.expenses()
    return c.find({}).sort({ _id: -1 }).toArray()
  },
}

// ============================================================================
// EXPORT
// ============================================================================

export default {
  connect,
  close,
  getDb,
  admins,
  metadata,
  expenses,
}

export {
  connect,
  close,
  getDb,
  admins,
  metadata,
  expenses,
}
