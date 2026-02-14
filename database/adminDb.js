/**
 * Admin Database Access Layer
 * 
 * Separate database (ADMIN) for all admin-related data:
 * - admins: List of admin user IDs
 * - metadata: App-wide stats (deleted users, user counts)
 * - expenses: Monthly expense tracking (API costs, hosting, services)
 * 
 * This keeps admin/operational data separate from user data in the Arkitek DB.
 * 
 * Usage:
 *   import adminDb from './database/adminDb.js'
 *   
 *   await adminDb.connect()
 *   const isAdmin = await adminDb.admins.isAdmin('userId')
 *   await adminDb.expenses.save({ stripeFees: 12.50, ... })
 *   await adminDb.close()
 */

import { MongoClient } from 'mongodb'

// Singleton client
let client = null
let database = null

const DB_NAME = 'ADMIN'

// ============================================================================
// CONNECTION MANAGEMENT
// ============================================================================

function getMongoUri() {
  return process.env.MONGODB_URI || 'mongodb://localhost:27017'
}

/**
 * Connect to ADMIN database
 */
async function connect() {
  if (database) return database
  
  const MONGODB_URI = getMongoUri()
  
  try {
    client = new MongoClient(MONGODB_URI, {
      maxPoolSize: 5,
      minPoolSize: 1,
      retryWrites: true,
      w: 'majority'
    })
    
    await client.connect()
    database = client.db(DB_NAME)
    
    const sanitizedUri = MONGODB_URI.replace(/:([^:@]+)@/, ':****@')
    console.log(`[AdminDB] Connected to MongoDB: ${DB_NAME}`)
    console.log(`[AdminDB] URI: ${sanitizedUri}`)
    return database
  } catch (error) {
    console.error('[AdminDB] Connection failed:', error)
    throw error
  }
}

/**
 * Close database connection
 */
async function close() {
  if (client) {
    await client.close()
    client = null
    database = null
    console.log('[AdminDB] Connection closed')
  }
}

/**
 * Get database instance (auto-connects if needed)
 */
async function getDb() {
  if (!database) await connect()
  return database
}

// ============================================================================
// ADMINS COLLECTION
// ============================================================================

const admins = {
  /**
   * Get list of admin userIds
   */
  async getList() {
    const db = await getDb()
    const doc = await db.collection('admins').findOne({ _id: 'admin_list' })
    return doc?.admins || []
  },
  
  /**
   * Check if user is an admin
   */
  async isAdmin(userId) {
    const adminList = await this.getList()
    return adminList.includes(userId)
  },
  
  /**
   * Add user to admin list
   */
  async add(userId) {
    const db = await getDb()
    return db.collection('admins').updateOne(
      { _id: 'admin_list' },
      { $addToSet: { admins: userId } },
      { upsert: true }
    )
  },
  
  /**
   * Remove user from admin list
   */
  async remove(userId) {
    const db = await getDb()
    return db.collection('admins').updateOne(
      { _id: 'admin_list' },
      { $pull: { admins: userId } }
    )
  },
  
  /**
   * Set the entire admin list (for migration)
   */
  async setList(adminList) {
    const db = await getDb()
    return db.collection('admins').replaceOne(
      { _id: 'admin_list' },
      { _id: 'admin_list', admins: adminList },
      { upsert: true }
    )
  }
}

// ============================================================================
// METADATA COLLECTION (App-wide stats and admin tracking)
// ============================================================================

const metadata = {
  /**
   * Get metadata document by key
   */
  async get(key) {
    const db = await getDb()
    return db.collection('metadata').findOne({ _id: key })
  },
  
  /**
   * Update or create metadata document
   */
  async set(key, data) {
    const db = await getDb()
    return db.collection('metadata').updateOne(
      { _id: key },
      { $set: { ...data, lastUpdated: new Date() } },
      { upsert: true }
    )
  },
  
  /**
   * Increment a counter in metadata
   */
  async increment(key, field, amount = 1) {
    const db = await getDb()
    return db.collection('metadata').updateOne(
      { _id: key },
      { 
        $inc: { [field]: amount },
        $set: { lastUpdated: new Date() }
      },
      { upsert: true }
    )
  },
  
  /**
   * Get admin stats (deleted users, totals, etc.)
   */
  async getAdminStats() {
    return this.get('admin_stats')
  },
  
  /**
   * Update admin stats
   */
  async updateAdminStats(stats) {
    return this.set('admin_stats', stats)
  },
  
  /**
   * Increment deleted users count
   */
  async incrementDeletedUsers() {
    return this.increment('admin_stats', 'deletedUsersCount', 1)
  },
}

// ============================================================================
// EXPENSES COLLECTION (Monthly expense tracking)
// ============================================================================

const expenses = {
  /**
   * Get expenses for a specific month
   * @param {string} monthKey - Format: "YYYY-MM" (e.g., "2026-02")
   * If not provided, uses current month
   */
  async get(monthKey) {
    if (!monthKey) {
      const now = new Date()
      monthKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
    }
    const db = await getDb()
    const doc = await db.collection('expenses').findOne({ _id: monthKey })
    return doc || null
  },
  
  /**
   * Save/update expenses for a specific month
   * @param {string} monthKey - Format: "YYYY-MM"
   * @param {Object} expenseData - All expense fields
   */
  async save(monthKey, expenseData) {
    if (!monthKey) {
      const now = new Date()
      monthKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
    }
    const db = await getDb()
    
    const doc = {
      stripeFees: parseFloat(expenseData.stripeFees) || 0,
      openaiCost: parseFloat(expenseData.openaiCost) || 0,
      anthropicCost: parseFloat(expenseData.anthropicCost) || 0,
      googleCost: parseFloat(expenseData.googleCost) || 0,
      metaCost: parseFloat(expenseData.metaCost) || 0,
      deepseekCost: parseFloat(expenseData.deepseekCost) || 0,
      mistralCost: parseFloat(expenseData.mistralCost) || 0,
      xaiCost: parseFloat(expenseData.xaiCost) || 0,
      serperCost: parseFloat(expenseData.serperCost) || 0,
      resendCost: parseFloat(expenseData.resendCost) || 0,
      mongoDbCost: parseFloat(expenseData.mongoDbCost) || 0,
      railwayCost: parseFloat(expenseData.railwayCost) || 0,
      vercelCost: parseFloat(expenseData.vercelCost) || 0,
      domainCost: parseFloat(expenseData.domainCost) || 0,
      lastUpdated: new Date(),
    }
    
    await db.collection('expenses').updateOne(
      { _id: monthKey },
      { $set: doc },
      { upsert: true }
    )
    
    return { _id: monthKey, ...doc }
  },
  
  /**
   * Get all months' expenses (for history view)
   */
  async getAll() {
    const db = await getDb()
    return db.collection('expenses')
      .find({})
      .sort({ _id: -1 })
      .toArray()
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

