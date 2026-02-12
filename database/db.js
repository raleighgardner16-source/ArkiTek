/**
 * Database Access Layer for Arktek
 * 
 * This module provides a clean API for all database operations,
 * replacing the JSON file read/write pattern with efficient MongoDB queries.
 * 
 * Usage:
 *   import db from './database/db.js'
 *   
 *   await db.connect()
 *   const user = await db.users.get('username')
 *   await db.prompts.save('username', promptData)
 *   await db.close()
 * 
 * All functions handle errors gracefully and log issues.
 */

import { MongoClient, ObjectId } from 'mongodb'

// Singleton client
let client = null
let database = null

// ============================================================================
// CONNECTION MANAGEMENT
// ============================================================================

/**
 * Get MongoDB URI - reads at runtime AFTER dotenv has loaded
 */
function getMongoUri() {
  return process.env.MONGODB_URI || 'mongodb://localhost:27017'
}

/**
 * Get database name - reads at runtime AFTER dotenv has loaded
 */
function getDbName() {
  return process.env.DB_NAME || 'Arkitek'
}

/**
 * Connect to MongoDB
 * @returns {Promise<Db>} The database instance
 */
async function connect() {
  if (database) return database
  
  // Read env vars at runtime (after dotenv.config() has been called)
  const MONGODB_URI = getMongoUri()
  const DB_NAME = getDbName()
  
  try {
    client = new MongoClient(MONGODB_URI, {
      maxPoolSize: 10,
      minPoolSize: 2,
      retryWrites: true,
      w: 'majority'
    })
    
    await client.connect()
    database = client.db(DB_NAME)
    
    // Log connection info (hide password)
    const sanitizedUri = MONGODB_URI.replace(/:([^:@]+)@/, ':****@')
    console.log(`[DB] Connected to MongoDB: ${DB_NAME}`)
    console.log(`[DB] URI: ${sanitizedUri}`)
    return database
  } catch (error) {
    console.error('[DB] Connection failed:', error)
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
    console.log('[DB] Connection closed')
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
// USER OPERATIONS
// ============================================================================

const users = {
  /**
   * Get user by ID
   * @param {string} userId 
   * @returns {Promise<Object|null>}
   */
  async get(userId) {
    const db = await getDb()
    return db.collection('users').findOne({ _id: userId })
  },
  
  /**
   * Get user by username
   * @param {string} username 
   * @returns {Promise<Object|null>}
   */
  async getByUsername(username) {
    const db = await getDb()
    return db.collection('users').findOne({ username })
  },
  
  /**
   * Get user by email
   * @param {string} email 
   * @returns {Promise<Object|null>}
   */
  async getByEmail(email) {
    const db = await getDb()
    return db.collection('users').findOne({ email })
  },
  
  /**
   * Create new user
   * @param {string} userId 
   * @param {Object} userData 
   * @returns {Promise<Object>}
   */
  async create(userId, userData) {
    const db = await getDb()
    
    const doc = {
      _id: userId,
      email: userData.email,
      password: userData.password || null,
      firstName: userData.firstName || null,
      lastName: userData.lastName || null,
      username: userData.username || userId,
      stripeCustomerId: null,
      stripeSubscriptionId: null,
      subscriptionStatus: 'inactive',
      subscriptionRenewalDate: null,
      createdAt: new Date(),
      lastActiveAt: new Date(),
      purchasedCredits: {
        total: 0,
        remaining: 0
      }
    }
    
    await db.collection('users').insertOne(doc)
    return doc
  },
  
  /**
   * Update user fields (general update)
   * @param {string} userId 
   * @param {Object} updates 
   */
  async update(userId, updates) {
    const db = await getDb()
    await db.collection('users').updateOne(
      { _id: userId },
      { $set: { ...updates, lastActiveAt: new Date() } }
    )
  },
  
  /**
   * Get all users (for admin)
   * @returns {Promise<Array>}
   */
  async getAll() {
    const db = await getDb()
    return db.collection('users').find({}).toArray()
  },
  
  // addMonthlyUsageCost removed — monthlyUsageCost lives in user_stats only
  
  /**
   * Verify password (returns user if match, null otherwise)
   * @param {string} userId 
   * @param {string} hashedPassword 
   */
  async verifyPassword(userId, hashedPassword) {
    const db = await getDb()
    return db.collection('users').findOne({ 
      _id: userId, 
      password: hashedPassword 
    })
  },
  
  /**
   * Update user stats (atomic increment)
   * @param {string} userId 
   * @param {Object} stats - { totalTokens, totalInputTokens, totalOutputTokens, etc. }
   * @returns {Promise<boolean>}
   */
  async updateStats(userId, stats) {
    const db = await getDb()
    
    const $inc = {}
    if (stats.totalTokens) $inc['stats.totalTokens'] = stats.totalTokens
    if (stats.totalInputTokens) $inc['stats.totalInputTokens'] = stats.totalInputTokens
    if (stats.totalOutputTokens) $inc['stats.totalOutputTokens'] = stats.totalOutputTokens
    if (stats.totalQueries) $inc['stats.totalQueries'] = stats.totalQueries
    if (stats.totalPrompts) $inc['stats.totalPrompts'] = stats.totalPrompts
    
    const update = { $set: { updatedAt: new Date() } }
    if (Object.keys($inc).length > 0) update.$inc = $inc
    
    // Stats live in user_stats collection, not users
    const result = await db.collection('user_stats').updateOne(
      { _id: userId },
      update,
      { upsert: true }
    )
    
    // Also update lastActiveAt on the users document
    await db.collection('users').updateOne(
      { _id: userId },
      { $set: { lastActiveAt: new Date() } }
    )
    
    return result.modifiedCount > 0
  },
  
  /**
   * Update provider stats
   * @param {string} userId 
   * @param {string} provider 
   * @param {Object} stats 
   */
  async updateProviderStats(userId, provider, stats) {
    const db = await getDb()
    
    const $inc = {}
    if (stats.totalTokens) $inc[`stats.providers.${provider}.totalTokens`] = stats.totalTokens
    if (stats.totalInputTokens) $inc[`stats.providers.${provider}.totalInputTokens`] = stats.totalInputTokens
    if (stats.totalOutputTokens) $inc[`stats.providers.${provider}.totalOutputTokens`] = stats.totalOutputTokens
    
    // Stats live in user_stats collection, not users
    await db.collection('user_stats').updateOne(
      { _id: userId },
      { $inc },
      { upsert: true }
    )
  },
  
  /**
   * Update model stats
   * @param {string} userId 
   * @param {string} modelKey 
   * @param {Object} stats 
   */
  async updateModelStats(userId, modelKey, stats) {
    const db = await getDb()
    
    const $inc = {}
    if (stats.totalTokens) $inc[`stats.models.${modelKey}.totalTokens`] = stats.totalTokens
    if (stats.totalInputTokens) $inc[`stats.models.${modelKey}.totalInputTokens`] = stats.totalInputTokens
    if (stats.totalOutputTokens) $inc[`stats.models.${modelKey}.totalOutputTokens`] = stats.totalOutputTokens
    if (stats.totalPrompts) $inc[`stats.models.${modelKey}.totalPrompts`] = stats.totalPrompts
    
    // Also set the model metadata if first time
    const $setOnInsert = {
      [`stats.models.${modelKey}.provider`]: stats.provider,
      [`stats.models.${modelKey}.model`]: stats.model
    }
    
    // Stats live in user_stats collection, not users
    await db.collection('user_stats').updateOne(
      { _id: userId },
      { $inc, $setOnInsert },
      { upsert: true }
    )
  },
  
  /**
   * Update Stripe info
   * @param {string} userId 
   * @param {Object} stripeData 
   */
  async updateStripe(userId, stripeData) {
    const db = await getDb()
    
    const $set = {}
    if (stripeData.stripeCustomerId !== undefined) $set.stripeCustomerId = stripeData.stripeCustomerId
    if (stripeData.subscriptionStatus !== undefined) $set.subscriptionStatus = stripeData.subscriptionStatus
    if (stripeData.subscriptionId !== undefined) $set.subscriptionId = stripeData.subscriptionId
    
    await db.collection('users').updateOne(
      { _id: userId },
      { $set }
    )
  },
  
  /**
   * Update purchased credits (atomic)
   * @param {string} userId 
   * @param {number} amount - Positive to add, negative to deduct
   */
  async updateCredits(userId, amount) {
    const db = await getDb()
    
    const $inc = {
      'purchasedCredits.remaining': amount
    }
    
    // Only increment total when adding
    if (amount > 0) {
      $inc['purchasedCredits.total'] = amount
    }
    
    await db.collection('users').updateOne(
      { _id: userId },
      { $inc }
    )
  },
  
  /**
   * Delete user and all associated data
   * @param {string} userId 
   */
  async delete(userId) {
    const db = await getDb()
    
    // Delete from ALL collections that store user data
    await Promise.all([
      db.collection('users').deleteOne({ _id: userId }),
      db.collection('prompts').deleteMany({ userId }),
      db.collection('purchases').deleteMany({ userId }),
      db.collection('judge_context').deleteOne({ _id: userId }),
      db.collection('usage_data').deleteOne({ _id: userId }),
      db.collection('user_stats').deleteOne({ _id: userId }),
      db.collection('saved_individual').deleteMany({ userId }),
      db.collection('saved_sessions').deleteMany({ userId }),
      db.collection('leaderboard_posts').deleteMany({ userId }),
    ])
    
    console.log(`[DB] Deleted user and ALL associated data: ${userId}`)
  },
  
  /**
   * Check if user exists
   * @param {string} userId 
   */
  async exists(userId) {
    const db = await getDb()
    const count = await db.collection('users').countDocuments({ _id: userId })
    return count > 0
  }
}

// ============================================================================
// PROMPT OPERATIONS
// ============================================================================

const prompts = {
  /**
   * Save a new prompt with responses
   * @param {string} userId 
   * @param {Object} promptData 
   * @returns {Promise<ObjectId>} The new prompt ID
   */
  async save(userId, promptData) {
    const db = await getDb()
    
    const doc = {
      userId,
      text: promptData.text,
      category: promptData.category || 'Uncategorized',
      timestamp: promptData.timestamp ? new Date(promptData.timestamp) : new Date(),
      responses: promptData.responses || [],
      summary: promptData.summary || null,
      facts: promptData.facts || [],
      sources: promptData.sources || [],
      searchQuery: promptData.searchQuery || null,
      wasSearched: !!(promptData.facts && promptData.facts.length > 0)
    }
    
    const result = await db.collection('prompts').insertOne(doc)
    return result.insertedId
  },
  
  /**
   * Get recent prompts for a user
   * @param {string} userId 
   * @param {number} limit 
   * @returns {Promise<Array>}
   */
  async getRecent(userId, limit = 20) {
    const db = await getDb()
    
    return db.collection('prompts')
      .find({ userId })
      .sort({ timestamp: -1 })
      .limit(limit)
      .toArray()
  },
  
  /**
   * Get prompts by category
   * @param {string} userId 
   * @param {string} category 
   * @param {number} limit 
   * @returns {Promise<Array>}
   */
  async getByCategory(userId, category, limit = 50) {
    const db = await getDb()
    
    return db.collection('prompts')
      .find({ userId, category })
      .sort({ timestamp: -1 })
      .limit(limit)
      .toArray()
  },
  
  /**
   * Get prompts by date range
   * @param {string} userId 
   * @param {Date} startDate 
   * @param {Date} endDate 
   * @returns {Promise<Array>}
   */
  async getByDateRange(userId, startDate, endDate) {
    const db = await getDb()
    
    return db.collection('prompts')
      .find({
        userId,
        timestamp: {
          $gte: new Date(startDate),
          $lte: new Date(endDate)
        }
      })
      .sort({ timestamp: -1 })
      .toArray()
  },
  
  /**
   * Get prompts by model used
   * @param {string} userId 
   * @param {string} modelName 
   * @param {number} limit 
   */
  async getByModel(userId, modelName, limit = 50) {
    const db = await getDb()
    
    return db.collection('prompts')
      .find({
        userId,
        'responses.modelName': modelName
      })
      .sort({ timestamp: -1 })
      .limit(limit)
      .toArray()
  },
  
  /**
   * Get single prompt by ID
   * @param {string|ObjectId} promptId 
   */
  async getById(promptId) {
    const db = await getDb()
    
    const id = typeof promptId === 'string' ? new ObjectId(promptId) : promptId
    return db.collection('prompts').findOne({ _id: id })
  },
  
  /**
   * Get prompt count for user
   * @param {string} userId 
   */
  async count(userId) {
    const db = await getDb()
    return db.collection('prompts').countDocuments({ userId })
  },
  
  /**
   * Get category statistics for user
   * @param {string} userId 
   */
  async getCategoryStats(userId) {
    const db = await getDb()
    
    return db.collection('prompts').aggregate([
      { $match: { userId } },
      { 
        $group: {
          _id: '$category',
          count: { $sum: 1 },
          latestPrompt: { $max: '$timestamp' }
        }
      },
      { $sort: { count: -1 } }
    ]).toArray()
  },
  
  /**
   * Get prompts with pagination
   * @param {string} userId 
   * @param {number} page 
   * @param {number} pageSize 
   */
  async getPaginated(userId, page = 1, pageSize = 20) {
    const db = await getDb()
    
    const skip = (page - 1) * pageSize
    
    const [prompts, total] = await Promise.all([
      db.collection('prompts')
        .find({ userId })
        .sort({ timestamp: -1 })
        .skip(skip)
        .limit(pageSize)
        .toArray(),
      db.collection('prompts').countDocuments({ userId })
    ])
    
    return {
      prompts,
      total,
      page,
      pageSize,
      totalPages: Math.ceil(total / pageSize)
    }
  }
}

// ============================================================================
// USAGE STATS OPERATIONS
// ============================================================================
// NOTE: usage_daily and user_monthly_usage collections have been removed.
// All usage data is now tracked solely through the in-memory cache (usageCache)
// which is persisted to the usage_data collection in MongoDB.
// The usage_data collection is the single source of truth for all usage data.

// ============================================================================
// PURCHASE OPERATIONS
// ============================================================================

const purchases = {
  /**
   * Save a new purchase
   * @param {string} userId 
   * @param {Object} purchaseData 
   */
  async save(userId, purchaseData) {
    const db = await getDb()
    
    const doc = {
      userId,
      timestamp: new Date(),
      amount: purchaseData.amount,
      fee: purchaseData.fee,
      total: purchaseData.total,
      paymentIntentId: purchaseData.paymentIntentId,
      status: purchaseData.status || 'succeeded'
    }
    
    const result = await db.collection('purchases').insertOne(doc)
    
    // Also update user's credits
    if (purchaseData.status === 'succeeded') {
      await users.updateCredits(userId, purchaseData.amount)
    }
    
    return result.insertedId
  },
  
  /**
   * Get purchase history for user
   * @param {string} userId 
   * @param {number} limit 
   */
  async getHistory(userId, limit = 50) {
    const db = await getDb()
    
    return db.collection('purchases')
      .find({ userId })
      .sort({ timestamp: -1 })
      .limit(limit)
      .toArray()
  },
  
  /**
   * Get remaining credits for user
   * @param {string} userId 
   */
  async getRemainingCredits(userId) {
    const user = await users.get(userId)
    return user?.purchasedCredits?.remaining || 0
  },
  
  /**
   * Get purchase by payment intent ID
   * @param {string} paymentIntentId 
   */
  async getByPaymentIntent(paymentIntentId) {
    const db = await getDb()
    return db.collection('purchases').findOne({ paymentIntentId })
  }
}

// ============================================================================
// JUDGE CONTEXT OPERATIONS
// ============================================================================

const judgeContext = {
  /**
   * Get context for user
   * @param {string} userId 
   */
  async get(userId) {
    const db = await getDb()
    const doc = await db.collection('judge_context').findOne({ _id: userId })
    return doc?.context || []
  },
  
  /**
   * Add new context (FIFO, max 5)
   * @param {string} userId 
   * @param {Object} contextItem 
   */
  async add(userId, contextItem) {
    const db = await getDb()
    
    // Get existing context
    const doc = await db.collection('judge_context').findOne({ _id: userId })
    let context = doc?.context || []
    
    // If there's a full response at position 0, summarize it first
    if (context.length > 0 && context[0].isFull) {
      // This would typically call your summarize function
      // For now, just mark it as not full
      context[0].isFull = false
    }
    
    // Add new item at beginning
    context.unshift({
      response: contextItem.response || null,
      summary: contextItem.summary || null,
      tokens: contextItem.tokens || 0,
      originalPrompt: contextItem.originalPrompt || null,
      timestamp: new Date(),
      isFull: contextItem.isFull || false
    })
    
    // Keep only 5
    context = context.slice(0, 5)
    
    await db.collection('judge_context').updateOne(
      { _id: userId },
      { 
        $set: { context, userId },
      },
      { upsert: true }
    )
    
    return context
  },
  
  /**
   * Clear context for user
   * @param {string} userId 
   */
  async clear(userId) {
    const db = await getDb()
    await db.collection('judge_context').updateOne(
      { _id: userId },
      { $set: { context: [] } },
      { upsert: true }
    )
  }
}

// ============================================================================
// LEADERBOARD OPERATIONS
// ============================================================================

const leaderboard = {
  /**
   * Get top users by total prompts
   * @param {number} limit 
   */
  async getTopByPrompts(limit = 10) {
    const db = await getDb()
    
    // Stats live in user_stats collection
    return db.collection('user_stats')
      .find({})
      .sort({ 'stats.totalPrompts': -1 })
      .limit(limit)
      .project({
        _id: 1,
        'stats.totalPrompts': 1,
        'stats.totalTokens': 1
      })
      .toArray()
  },
  
  /**
   * Get top users by total tokens
   * @param {number} limit 
   */
  async getTopByTokens(limit = 10) {
    const db = await getDb()
    
    // Stats live in user_stats collection
    return db.collection('user_stats')
      .find({})
      .sort({ 'stats.totalTokens': -1 })
      .limit(limit)
      .project({
        _id: 1,
        'stats.totalPrompts': 1,
        'stats.totalTokens': 1
      })
      .toArray()
  }
}

// ============================================================================
// LEADERBOARD POSTS OPERATIONS
// ============================================================================

const leaderboardPosts = {
  /**
   * Submit a new post to the leaderboard
   * @param {Object} postData 
   * @returns {Promise<string>} The post ID
   */
  async submit(postData) {
    const db = await getDb()
    
    const postId = `prompt-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
    
    const doc = {
      _id: postId,
      userId: postData.userId,
      username: postData.username,
      promptText: postData.promptText,
      category: postData.category || 'General Knowledge/Other',
      createdAt: new Date(),
      responses: postData.responses || [],
      summary: postData.summary || null,
      sources: postData.sources || [],
      likes: [],
      likeCount: 0,
      comments: []
    }
    
    await db.collection('leaderboard_posts').insertOne(doc)
    return postId
  },
  
  /**
   * Get recent posts (Today's Favorites)
   * @param {number} limit 
   */
  async getRecent(limit = 15) {
    const db = await getDb()
    
    const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000)
    
    return db.collection('leaderboard_posts')
      .find({ createdAt: { $gte: oneDayAgo } })
      .sort({ likeCount: -1, createdAt: -1 })
      .limit(limit)
      .toArray()
  },
  
  /**
   * Get top posts of all time
   * @param {number} limit 
   */
  async getTopAllTime(limit = 15) {
    const db = await getDb()
    
    return db.collection('leaderboard_posts')
      .find({})
      .sort({ likeCount: -1 })
      .limit(limit)
      .toArray()
  },
  
  /**
   * Get posts by user
   * @param {string} userId 
   */
  async getByUser(userId) {
    const db = await getDb()
    
    return db.collection('leaderboard_posts')
      .find({ userId })
      .sort({ createdAt: -1 })
      .toArray()
  },
  
  /**
   * Get posts by category
   * @param {string} category 
   * @param {number} limit 
   */
  async getByCategory(category, limit = 15) {
    const db = await getDb()
    
    return db.collection('leaderboard_posts')
      .find({ category })
      .sort({ likeCount: -1, createdAt: -1 })
      .limit(limit)
      .toArray()
  },
  
  /**
   * Like/unlike a post
   * @param {string} postId 
   * @param {string} userId 
   * @returns {Promise<{liked: boolean, likeCount: number}>}
   */
  async toggleLike(postId, userId) {
    const db = await getDb()
    
    const post = await db.collection('leaderboard_posts').findOne({ _id: postId })
    if (!post) throw new Error('Post not found')
    
    const alreadyLiked = post.likes.includes(userId)
    
    if (alreadyLiked) {
      await db.collection('leaderboard_posts').updateOne(
        { _id: postId },
        { 
          $pull: { likes: userId },
          $inc: { likeCount: -1 }
        }
      )
      return { liked: false, likeCount: post.likeCount - 1 }
    } else {
      await db.collection('leaderboard_posts').updateOne(
        { _id: postId },
        { 
          $push: { likes: userId },
          $inc: { likeCount: 1 }
        }
      )
      return { liked: true, likeCount: post.likeCount + 1 }
    }
  },
  
  /**
   * Delete a post (owner only)
   * @param {string} postId 
   * @param {string} userId 
   */
  async delete(postId, userId) {
    const db = await getDb()
    
    const result = await db.collection('leaderboard_posts').deleteOne({
      _id: postId,
      userId: userId  // Only owner can delete
    })
    
    return result.deletedCount > 0
  },
  
  /**
   * Add a comment to a post
   * @param {string} postId 
   * @param {Object} commentData 
   */
  async addComment(postId, commentData) {
    const db = await getDb()
    
    const commentId = `comment-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
    
    const comment = {
      id: commentId,
      userId: commentData.userId,
      username: commentData.username,
      text: commentData.text,
      createdAt: new Date(),
      likes: [],
      likeCount: 0,
      replies: []
    }
    
    await db.collection('leaderboard_posts').updateOne(
      { _id: postId },
      { $push: { comments: comment } }
    )
    
    return commentId
  },
  
  /**
   * Delete a comment (owner only)
   * @param {string} postId 
   * @param {string} commentId 
   * @param {string} userId 
   */
  async deleteComment(postId, commentId, userId) {
    const db = await getDb()
    
    const result = await db.collection('leaderboard_posts').updateOne(
      { _id: postId },
      { 
        $pull: { 
          comments: { id: commentId, userId: userId }
        }
      }
    )
    
    return result.modifiedCount > 0
  },
  
  /**
   * Add a reply to a comment
   */
  async addReply(postId, commentId, replyData) {
    const db = await getDb()
    
    const replyId = `reply-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
    
    const reply = {
      id: replyId,
      userId: replyData.userId,
      username: replyData.username,
      text: replyData.text,
      createdAt: new Date()
    }
    
    await db.collection('leaderboard_posts').updateOne(
      { _id: postId, 'comments.id': commentId },
      { $push: { 'comments.$.replies': reply } }
    )
    
    return replyId
  },
  
  /**
   * Like/unlike a comment
   */
  async toggleCommentLike(postId, commentId, userId) {
    const db = await getDb()
    
    const post = await db.collection('leaderboard_posts').findOne({ _id: postId })
    if (!post) throw new Error('Post not found')
    
    const comment = post.comments.find(c => c.id === commentId)
    if (!comment) throw new Error('Comment not found')
    
    const alreadyLiked = comment.likes.includes(userId)
    
    if (alreadyLiked) {
      await db.collection('leaderboard_posts').updateOne(
        { _id: postId, 'comments.id': commentId },
        { 
          $pull: { 'comments.$.likes': userId },
          $inc: { 'comments.$.likeCount': -1 }
        }
      )
      return { liked: false, likeCount: comment.likeCount - 1 }
    } else {
      await db.collection('leaderboard_posts').updateOne(
        { _id: postId, 'comments.id': commentId },
        { 
          $push: { 'comments.$.likes': userId },
          $inc: { 'comments.$.likeCount': 1 }
        }
      )
      return { liked: true, likeCount: comment.likeCount + 1 }
    }
  }
}

// ============================================================================
// COMBINED TRACKING — REMOVED
// ============================================================================
// trackUsage, trackPrompt, and trackQuery have been removed.
// All usage tracking is now handled by the in-memory cache in server.js
// which is persisted to the usage_data collection. No separate MongoDB
// tracking to usage_daily or user_monthly_usage is needed.

// ============================================================================
// METADATA COLLECTION (App-wide stats and admin tracking)
// ============================================================================

const metadata = {
  /**
   * Get metadata document by key
   * @param {string} key - Document key (e.g., "admin_stats")
   */
  async get(key) {
    const db = getDb()
    return db.collection('metadata').findOne({ _id: key })
  },
  
  /**
   * Update or create metadata document
   * @param {string} key - Document key
   * @param {object} data - Data to set/update
   */
  async set(key, data) {
    const db = getDb()
    return db.collection('metadata').updateOne(
      { _id: key },
      { 
        $set: { ...data, lastUpdated: new Date() }
      },
      { upsert: true }
    )
  },
  
  /**
   * Increment a counter in metadata
   * @param {string} key - Document key
   * @param {string} field - Field to increment
   * @param {number} amount - Amount to increment by (default 1)
   */
  async increment(key, field, amount = 1) {
    const db = getDb()
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
  
  /**
   * Recalculate and cache user counts from users collection
   */
  async recalculateUserCounts() {
    const db = getDb()
    const now = new Date()
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000)
    
    const [activeCount, canceledCount, inactiveCount, totalCount] = await Promise.all([
      db.collection('users').countDocuments({ subscriptionStatus: 'active' }),
      db.collection('users').countDocuments({ subscriptionStatus: 'canceled' }),
      db.collection('users').countDocuments({ 
        subscriptionStatus: { $ne: 'canceled' },
        lastActiveAt: { $lt: thirtyDaysAgo }
      }),
      db.collection('users').countDocuments({})
    ])
    
    await this.set('admin_stats', {
      activeUsersCount: activeCount,
      canceledUsersCount: canceledCount,
      inactiveUsersCount: inactiveCount,
      totalUsersEver: totalCount
    })
    
    return { activeCount, canceledCount, inactiveCount, totalCount }
  }
}

// ============================================================================
// ADMINS COLLECTION (Admin user list)
// ============================================================================

const admins = {
  /**
   * Get list of admin userIds
   */
  async getList() {
    const db = getDb()
    const doc = await db.collection('admins').findOne({ _id: 'admin_list' })
    return doc?.admins || []
  },
  
  /**
   * Check if user is an admin
   * @param {string} userId
   */
  async isAdmin(userId) {
    const adminList = await this.getList()
    return adminList.includes(userId)
  },
  
  /**
   * Add user to admin list
   * @param {string} userId
   */
  async add(userId) {
    const db = getDb()
    return db.collection('admins').updateOne(
      { _id: 'admin_list' },
      { $addToSet: { admins: userId } },
      { upsert: true }
    )
  },
  
  /**
   * Remove user from admin list
   * @param {string} userId
   */
  async remove(userId) {
    const db = getDb()
    return db.collection('admins').updateOne(
      { _id: 'admin_list' },
      { $pull: { admins: userId } }
    )
  },
  
  /**
   * Set the entire admin list (for migration)
   * @param {string[]} adminList
   */
  async setList(adminList) {
    const db = getDb()
    return db.collection('admins').replaceOne(
      { _id: 'admin_list' },
      { _id: 'admin_list', admins: adminList },
      { upsert: true }
    )
  }
}

// ============================================================================
// USER SAVED POSTS (Bookmarked leaderboard posts)
// ============================================================================

const savedPosts = {
  /**
   * Get user's saved posts
   * @param {string} userId
   */
  async getByUser(userId) {
    const db = getDb()
    const user = await db.collection('users').findOne(
      { _id: userId },
      { projection: { savedPosts: 1 } }
    )
    return user?.savedPosts || []
  },
  
  /**
   * Save a post for a user
   * @param {string} userId
   * @param {string} postId
   */
  async save(userId, postId) {
    const db = getDb()
    return db.collection('users').updateOne(
      { _id: userId },
      { $addToSet: { savedPosts: postId } }
    )
  },
  
  /**
   * Unsave a post for a user
   * @param {string} userId
   * @param {string} postId
   */
  async unsave(userId, postId) {
    const db = getDb()
    return db.collection('users').updateOne(
      { _id: userId },
      { $pull: { savedPosts: postId } }
    )
  },
  
  /**
   * Get full post details for user's saved posts
   * @param {string} userId
   */
  async getFullPosts(userId) {
    const db = getDb()
    const savedIds = await this.getByUser(userId)
    if (savedIds.length === 0) return []
    
    return db.collection('leaderboard_posts')
      .find({ _id: { $in: savedIds } })
      .sort({ createdAt: -1 })
      .toArray()
  }
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
  metadata,
  admins,
  savedPosts,
}

// Named exports for convenience
export {
  connect,
  close,
  users,
  prompts,
  purchases,
  judgeContext,
  leaderboard,
  leaderboardPosts,
  metadata,
  admins,
  savedPosts,
}

