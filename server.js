import express from 'express'
import cors from 'cors'
import axios from 'axios'
import dotenv from 'dotenv'
import crypto from 'crypto'
import * as cheerio from 'cheerio'
import path from 'path'
import { fileURLToPath } from 'url'
import { createRequire } from 'module'
import { countTokens, extractTokensFromResponse, estimateTokensFallback } from './utils/tokenCounters.js'
import Stripe from 'stripe'
import { Resend } from 'resend'
import db from './database/db.js'
import adminDb from './database/adminDb.js'

// Load disposable email domains list (CJS package, use createRequire for ESM compat)
const require = createRequire(import.meta.url)
const disposableDomains = require('disposable-email-domains')

dotenv.config()

// Version tag — used to verify which deployment is live
const SERVER_VERSION = '2026-02-21-v1-judge-filter'

// Get __dirname equivalent for ES modules
const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

// Global crash prevention — log but don't kill the server
process.on('uncaughtException', (err) => {
  console.error('[FATAL] Uncaught Exception — server NOT crashing:', err.message, err.stack)
})
process.on('unhandledRejection', (reason) => {
  console.error('[FATAL] Unhandled Rejection — server NOT crashing:', reason)
})

// ============================================================================
// DATE HELPERS — dynamic current date for prompts & search queries
// ============================================================================
const getCurrentDateString = (timeZone = 'America/New_York') => {
  const now = new Date()
  const options = { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric', timeZone }
  return now.toLocaleDateString('en-US', options) // e.g. "Wednesday, February 12, 2026"
}
const getCurrentMonthYear = () => {
  const now = new Date()
  return `${now.toLocaleString('en-US', { month: 'long', timeZone: 'America/New_York' })} ${now.getFullYear()}` // e.g. "February 2026"
}

// ============================================================================
// DATABASE CONNECTION (MongoDB Only - No JSON Files)
// ============================================================================
const initDatabase = async () => {
  try {
    await db.connect()
    console.log('[Server] ✅ Arkitek DB connected successfully')
    
    await adminDb.connect()
    console.log('[Server] ✅ ADMIN DB connected successfully')
    
    console.log('[Server] 🗄️  Using MongoDB as primary data store')

    // Ensure the vector search index exists for embedding-based memory retrieval
    await ensureVectorSearchIndex()
  } catch (error) {
    console.error('[Server] ❌ MongoDB connection failed:', error.message)
    console.error('[Server] Cannot start without database connection')
    process.exit(1) // Exit if MongoDB fails - no fallback
  }
}

/**
 * Ensure the conversation_embedding_index exists in MongoDB Atlas.
 * This vector search index is required for $vectorSearch (embedding-based memory).
 * If it doesn't exist, we attempt to create it programmatically.
 */
async function ensureVectorSearchIndex() {
  try {
    const dbInstance = await db.getDb()
    const col = dbInstance.collection('conversation_history')

    // Check if the index already exists
    const existingIndexes = await col.listSearchIndexes().toArray()
    const hasIndex = existingIndexes.some(idx => idx.name === 'conversation_embedding_index')

    if (hasIndex) {
      console.log('[Memory] ✅ Vector search index "conversation_embedding_index" exists')
      return
    }

    // Index doesn't exist — create it
    console.log('[Memory] ⚠️  Vector search index not found, creating "conversation_embedding_index"...')
    await col.createSearchIndex({
      name: 'conversation_embedding_index',
      type: 'vectorSearch',
      definition: {
        fields: [
          {
            type: 'vector',
            path: 'embedding',
            numDimensions: 1536,
            similarity: 'cosine',
          },
          {
            type: 'filter',
            path: 'userId',
          },
        ],
      },
    })
    console.log('[Memory] ✅ Vector search index "conversation_embedding_index" created successfully')
    console.log('[Memory] ℹ️  Note: Atlas may take 1-2 minutes to build the index before queries work')
  } catch (error) {
    // Atlas free tier or shared clusters might not support programmatic index creation
    // In that case, the user needs to create it manually in the Atlas UI
    if (error.code === 31 || error.codeName === 'CommandNotSupported' || error.message?.includes('not supported')) {
      console.warn('[Memory] ⚠️  Could not create vector search index programmatically.')
      console.warn('[Memory] ⚠️  Please create it manually in MongoDB Atlas:')
      console.warn('[Memory]     → Database: conversation_history collection')
      console.warn('[Memory]     → Index name: conversation_embedding_index')
      console.warn('[Memory]     → Type: vectorSearch')
      console.warn('[Memory]     → Fields: embedding (vector, 1536 dims, cosine) + userId (filter)')
    } else {
      console.error('[Memory] Error checking/creating vector search index:', error.message)
    }
  }
}

// Graceful shutdown — flush all pending data to MongoDB before closing
const performGracefulShutdown = async (signal) => {
  console.log(`\n[Server] ${signal} received, shutting down gracefully...`)
  if (usageSyncTimer) clearTimeout(usageSyncTimer)
  await flushUsageToMongo()
  // Also flush ALL user cache entries to MongoDB to persist latest social/profile data
  const allUsers = Object.entries(usersCache)
  if (allUsers.length > 0) {
    console.log(`[Server] Flushing ${allUsers.length} user records to MongoDB...`)
    await Promise.allSettled(allUsers.map(([uid, data]) => syncUserToMongo(uid, data)))
  }
  await db.close()
  await adminDb.close()
  process.exit(0)
}

process.on('SIGINT', () => performGracefulShutdown('SIGINT'))
process.on('SIGTERM', () => performGracefulShutdown('SIGTERM'))

// Last-resort: 'beforeExit' fires when the event loop drains (e.g. process.exit not called).
// Won't help on kill -9 or power-off, but catches additional graceful scenarios.
process.on('beforeExit', async () => {
  if (usageDirtyUsers.size > 0) {
    console.log('[Server] beforeExit — flushing remaining dirty usage data...')
    await flushUsageToMongo()
  }
})

const app = express()
const PORT = process.env.PORT || 3001

// Initialize Stripe
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || '', {
  apiVersion: '2024-11-20.acacia',
})

// Stripe configuration
const STRIPE_PRICE_ID = process.env.STRIPE_PRICE_ID || ''
const STRIPE_WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET || ''

// Initialize Resend (email service for password resets + email verification)
// Only initialize if API key is configured — server still works without it (password reset emails won't send)
const resend = process.env.RESEND_API_KEY ? new Resend(process.env.RESEND_API_KEY) : null
const APP_NAME = 'ArkiTek'
const FROM_EMAIL = process.env.FROM_EMAIL || 'noreply@arkitek.app' // Must be a verified domain in Resend
const APP_URL = process.env.APP_URL || 'http://localhost:3000' // Frontend URL for reset links


// In-memory store for password reset tokens (also persisted to MongoDB for durability)
// Format: { token: { userId, email, expiresAt } }
const passwordResetTokens = new Map()

// In-memory store for email verification tokens (also persisted to MongoDB)
const emailVerificationTokens = new Map()

// ============================================================================
// ADMIN LIST (MongoDB only)
// ============================================================================

const readAdmins = () => {
    return { admins: adminsCache.admins }
}

const isAdmin = (userId) => {
  const admins = readAdmins()
  return admins.admins.includes(userId)
}

// Admin authentication middleware - requires admin privileges
const requireAdmin = (req, res, next) => {
  // Get userId from query params (GET) or body (POST/PUT/DELETE)
  const userId = req.query.requestingUserId || req.body.requestingUserId
  
  if (!userId) {
    console.log('[Admin] ❌ Access denied - no requestingUserId provided')
    return res.status(401).json({ 
      error: 'Authentication required',
      message: 'You must be logged in to access this resource'
    })
  }
  
  if (!isAdmin(userId)) {
    console.log(`[Admin] ❌ Access denied - user ${userId} is not an admin`)
    return res.status(403).json({ 
      error: 'Admin access required',
      message: 'You do not have permission to access this resource'
    })
  }
  
  console.log(`[Admin] ✅ Access granted for admin: ${userId}`)
  next()
}

// ============================================================================
// MONGODB-ONLY DATA LAYER (No JSON files)
// ============================================================================
// In-memory cache for fast reads, fully synced to MongoDB for persistence.
// All data survives server restarts.

let usageCache = {}
let usersCache = {}
let leaderboardCache = { prompts: [] }
let adminsCache = { admins: [] }
let cacheLoaded = false

// --- Usage sync (debounced to batch rapid writes) ---
let usageSyncTimer = null
let usageDirtyUsers = new Set()
const deletedUserIds = new Set() // Users whose accounts have been deleted — never flush these back to MongoDB
let lastFlushTime = Date.now()
const MAX_FLUSH_INTERVAL_MS = 15000 // Force flush at least every 15s even under continuous load

const scheduleUsageSync = (userId) => {
  if (userId) usageDirtyUsers.add(userId)
  // If we haven't flushed in a while, flush immediately to prevent data loss
  // under continuous activity (the debounce timer keeps resetting otherwise).
  if (Date.now() - lastFlushTime >= MAX_FLUSH_INTERVAL_MS) {
    if (usageSyncTimer) clearTimeout(usageSyncTimer)
    flushUsageToMongo()
    return
  }
  if (usageSyncTimer) clearTimeout(usageSyncTimer)
  usageSyncTimer = setTimeout(() => flushUsageToMongo(), 2000)
}

const flushUsageToMongo = async () => {
  if (usageDirtyUsers.size === 0) { lastFlushTime = Date.now(); return }
  const usersToSync = [...usageDirtyUsers]
  usageDirtyUsers.clear()
  lastFlushTime = Date.now()
  
  try {
    const dbInstance = await db.getDb()
    const collection = dbInstance.collection('usage_data')
    for (const userId of usersToSync) {
      if (!usageCache[userId]) continue
      if (deletedUserIds.has(userId)) continue // Account was deleted — don't re-create the document
      
      // IMPORTANT: Exclude totalTokens, totalPrompts, and monthlyUsage from $set entirely.
      // totalTokens and monthlyUsage.*.tokens are managed by trackUsage() using atomic $inc.
      // totalPrompts and monthlyUsage.*.prompts are managed by trackPrompt() / trackConversationPrompt() using atomic $inc.
      //
      // Previously, we stripped .tokens from monthlyUsage entries but still $set
      // the entire monthlyUsage object. This REPLACED the whole field in MongoDB,
      // which DELETED the $inc'd tokens value. Now we use dot-notation $set for
      // each monthlyUsage sub-field so the tokens/prompts fields are left untouched.
      const { totalTokens: _tt, totalPrompts: _tp, monthlyUsage: _mu, ...cacheWithoutManagedFields } = usageCache[userId]
      
      // Build dot-notation updates for monthlyUsage sub-fields (excluding .tokens and .prompts)
      const monthlyDotUpdates = {}
      if (_mu) {
        for (const [month, data] of Object.entries(_mu)) {
          if (!data) continue
          const { tokens: _mt, prompts: _mp, ...monthWithoutManagedFields } = data
          // Set each non-managed field individually via dot notation
          for (const [field, value] of Object.entries(monthWithoutManagedFields)) {
            monthlyDotUpdates[`monthlyUsage.${month}.${field}`] = value
          }
        }
      }
      
      await collection.updateOne(
        { _id: userId },
        { $set: { ...cacheWithoutManagedFields, ...monthlyDotUpdates, _id: userId, updatedAt: new Date() } },
        { upsert: true }
      )
      // Also sync stats to user_stats collection (aggregated totals, purchased credits)
      syncUserStatsToMongo(userId)
    }
  } catch (error) {
    console.error('[Usage Sync] Failed to flush to MongoDB:', error.message)
    // Re-queue failed users
    for (const u of usersToSync) usageDirtyUsers.add(u)
  }
}

// --- Users sync (immediate since user changes are critical) ---
// Only writes profile + subscription + purchasedCredits to 'users' collection
const syncUserToMongo = async (userId, userData) => {
  if (deletedUserIds.has(userId)) return // Account was deleted — don't re-create
  try {
    const dbInstance = await db.getDb()
    const usageData = usageCache[userId] || {}
    await dbInstance.collection('users').updateOne(
      { _id: userId },
      { $set: {
        _id: userId,
        firstName: userData.firstName,
        lastName: userData.lastName,
        username: userData.username,
        email: userData.email,
        canonicalEmail: userData.canonicalEmail || userData.email,
        password: userData.password,
        createdAt: userData.createdAt ? new Date(userData.createdAt) : new Date(),
        stripeCustomerId: userData.stripeCustomerId || null,
        stripeSubscriptionId: userData.stripeSubscriptionId || null,
        subscriptionStatus: userData.subscriptionStatus || 'inactive',
        subscriptionRenewalDate: userData.subscriptionRenewalDate || null,
        subscriptionStartedDate: userData.subscriptionStartedDate || null,
        subscriptionPausedDate: userData.subscriptionPausedDate || null,
        cancellationHistory: userData.cancellationHistory || [],
        lastActiveAt: userData.lastActiveAt || null,
        purchasedCredits: usageData.purchasedCredits || { total: 0, remaining: 0 },
        // Free trial abuse prevention fields
        emailVerified: userData.emailVerified || false,
        signupIp: userData.signupIp || null,
        deviceFingerprint: userData.deviceFingerprint || null,
        plan: userData.plan || null,
        // Model selection preferences (persists across sessions)
        modelPreferences: userData.modelPreferences || null,
        // User's local timezone (e.g. "America/Denver") for date bucketing
        timezone: userData.timezone || null,
        // Social / profile fields
        bio: userData.bio || '',
        profileImage: userData.profileImage || null,
        isAnonymous: userData.isAnonymous || false,
        isPrivate: userData.isPrivate || false,
        followers: userData.followers || [],
        following: userData.following || [],
        followRequests: userData.followRequests || [],
        sentFollowRequests: userData.sentFollowRequests || [],
      }},
      { upsert: true }
    )
  } catch (error) {
    console.error(`[Users Sync] Failed for ${userId}:`, error.message)
  }
}

// --- User Stats sync (writes costs, stats, overage to 'user_stats' collection) ---
const syncUserStatsToMongo = async (userId) => {
  if (deletedUserIds.has(userId)) return // Account was deleted — don't re-create
  try {
    const dbInstance = await db.getDb()
    const userData = usersCache[userId] || {}
    const usageData = usageCache[userId] || {}
    
    await dbInstance.collection('user_stats').updateOne(
      { _id: userId },
      { $set: {
        _id: userId,
        userId: userId,
        monthlyUsageCost: userData.monthlyUsageCost || {},
        monthlyOverageBilled: userData.monthlyOverageBilled || {},
        stats: {
          totalTokens: (usageData.totalInputTokens || 0) + (usageData.totalOutputTokens || 0),
          totalInputTokens: usageData.totalInputTokens || 0,
          totalOutputTokens: usageData.totalOutputTokens || 0,
          totalQueries: usageData.totalQueries || 0,
          totalPrompts: usageData.totalPrompts || 0,
          councilPrompts: usageData.councilPrompts || 0,
          debatePrompts: usageData.debatePrompts || 0,
          providers: usageData.providers || {},
          models: usageData.models || {},
        },
        updatedAt: new Date(),
      }},
      { upsert: true }
    )
  } catch (error) {
    console.error(`[UserStats Sync] Failed for ${userId}:`, error.message)
  }
}

// Load ALL data from MongoDB on startup
const loadCacheFromMongoDB = async () => {
  try {
    const dbInstance = await db.getDb()
    
    // 1. Load all users (profile + subscription + social + purchasedCredits)
    const allUsers = await dbInstance.collection('users').find({}).toArray()
    for (const user of allUsers) {
      usersCache[user._id] = {
        id: user._id,
        firstName: user.firstName,
        lastName: user.lastName,
        username: user.username,
        email: user.email,
        canonicalEmail: user.canonicalEmail || null,
        password: user.password,
        createdAt: user.createdAt?.toISOString?.() || user.createdAt,
        stripeCustomerId: user.stripeCustomerId || null,
        stripeSubscriptionId: user.stripeSubscriptionId || null,
        subscriptionStatus: user.subscriptionStatus || 'inactive',
        subscriptionRenewalDate: user.subscriptionRenewalDate || null,
        subscriptionStartedDate: user.subscriptionStartedDate || null,
        subscriptionPausedDate: user.subscriptionPausedDate || null,
        cancellationHistory: user.cancellationHistory || [],
        lastActiveAt: user.lastActiveAt || null,
        plan: user.plan || null,
        emailVerified: user.emailVerified || false,
        timezone: user.timezone || null,
        signupIp: user.signupIp || null,
        deviceFingerprint: user.deviceFingerprint || null,
        modelPreferences: user.modelPreferences || null,
        // Social fields
        bio: user.bio || '',
        profileImage: user.profileImage || null,
        isAnonymous: user.isAnonymous || false,
        isPrivate: user.isPrivate || false,
        followers: user.followers || [],
        following: user.following || [],
        followRequests: user.followRequests || [],
        sentFollowRequests: user.sentFollowRequests || [],
        // monthlyUsageCost and monthlyOverageBilled loaded from user_stats below
        monthlyUsageCost: {},
        monthlyOverageBilled: {},
      }
    }
    
    // 1b. Load user_stats (costs, aggregated stats, purchased credits, overage billing)
    const allUserStats = await dbInstance.collection('user_stats').find({}).toArray()
    for (const statsDoc of allUserStats) {
      const userId = statsDoc._id
      // Merge cost/overage fields into usersCache (for quick access by billing logic)
      if (usersCache[userId]) {
        usersCache[userId].monthlyUsageCost = statsDoc.monthlyUsageCost || {}
        usersCache[userId].monthlyOverageBilled = statsDoc.monthlyOverageBilled || {}
      }
      // Merge aggregated stats into usageCache
      if (!usageCache[userId]) usageCache[userId] = {}
      if (statsDoc.stats) {
        usageCache[userId].totalTokens = statsDoc.stats.totalTokens || usageCache[userId].totalTokens || 0
        usageCache[userId].totalInputTokens = statsDoc.stats.totalInputTokens || usageCache[userId].totalInputTokens || 0
        usageCache[userId].totalOutputTokens = statsDoc.stats.totalOutputTokens || usageCache[userId].totalOutputTokens || 0
        usageCache[userId].totalQueries = statsDoc.stats.totalQueries || usageCache[userId].totalQueries || 0
        usageCache[userId].totalPrompts = statsDoc.stats.totalPrompts || usageCache[userId].totalPrompts || 0
        // Only overwrite providers/models if they have data (don't clobber existing)
        if (Object.keys(statsDoc.stats.providers || {}).length > 0) {
          usageCache[userId].providers = statsDoc.stats.providers
        }
        if (Object.keys(statsDoc.stats.models || {}).length > 0) {
          usageCache[userId].models = statsDoc.stats.models
        }
      }
    }
    // Load purchasedCredits from users collection into usageCache (for compatibility)
    for (const user of allUsers) {
      if (!usageCache[user._id]) usageCache[user._id] = {}
      if (user.purchasedCredits) {
        usageCache[user._id].purchasedCredits = user.purchasedCredits
      }
    }
    console.log(`[Cache] Loaded ${allUserStats.length} user_stats documents`)
    
    // 2. Load all usage data (full — includes dailyUsage, monthlyUsage, etc.)
    // MERGE into usageCache instead of overwriting, so user_stats data loaded
    // above (totalTokens, totalPrompts, purchasedCredits, etc.) is preserved.
    // usage_data fields win for fields present in both (they are the fresher source
    // for dailyUsage, models, providers, etc.), but user_stats fields that
    // don't exist in usage_data are kept.
    const allUsage = await dbInstance.collection('usage_data').find({}).toArray()
    for (const doc of allUsage) {
      const { _id, updatedAt, ...data } = doc
      if (usageCache[_id]) {
        // Merge: usage_data fields take precedence, but keep existing fields from user_stats
        usageCache[_id] = { ...usageCache[_id], ...data }
      } else {
        usageCache[_id] = data
      }
    }
    // Re-apply purchasedCredits from users collection (authoritative source) since
    // usage_data may have a stale copy from a previous flush.
    for (const user of allUsers) {
      if (usageCache[user._id] && user.purchasedCredits) {
        usageCache[user._id].purchasedCredits = user.purchasedCredits
      }
    }
    
    // For users that exist but have no usage_data doc yet, initialize empty usage
    for (const userId of Object.keys(usersCache)) {
      if (!usageCache[userId]) {
        usageCache[userId] = {
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
        }
          usageDirtyUsers.add(userId) // Mark dirty so it gets flushed to usage_data
      }
    }
    
    if (usageDirtyUsers.size > 0) {
      setTimeout(() => flushUsageToMongo(), 1000)
    }
    
    // 3. Load leaderboard posts
    const posts = await dbInstance.collection('leaderboard_posts').find({}).toArray()
    leaderboardCache.prompts = posts.map(p => ({
      id: p._id,
      userId: p.userId,
      username: p.username,
      promptText: p.promptText,
      category: p.category,
      description: p.description || null,
      likes: p.likes || [],
      likeCount: p.likeCount || 0,
      createdAt: p.createdAt?.toISOString?.() || p.createdAt,
      responses: p.responses || [],
      summary: p.summary,
      sources: p.sources || [],
      comments: p.comments || [],
    }))
    
    // 4. Load admins list (from ADMIN database) — non-fatal if it fails
    try {
      const adminsList = await adminDb.admins.getList()
      adminsCache.admins = adminsList
    } catch (adminError) {
      console.warn('[Cache] Failed to load admins (non-fatal):', adminError.message)
      adminsCache.admins = []
    }
    
    cacheLoaded = true
    console.log(`[Cache] Loaded ${Object.keys(usersCache).length} users, ${Object.keys(usageCache).length} usage records, ${leaderboardCache.prompts.length} leaderboard posts, ${adminsCache.admins.length} admins`)
  } catch (error) {
    console.error('[Cache] Failed to load from MongoDB:', error.message)
  }
}

// --- Public read/write functions (same API, now fully backed by MongoDB) ---

const readUsers = () => {
  return usersCache
}

const writeUsers = (users, changedUserId = null) => {
  usersCache = users
  // Sync changed users to MongoDB immediately
  if (changedUserId) {
    // Only sync the specific user that changed
    const userData = users[changedUserId]
    if (userData) {
      syncUserToMongo(changedUserId, userData)
      syncUserStatsToMongo(changedUserId) // Also sync stats to user_stats collection
    }
  } else {
    // Sync all users (fallback — ideally always pass changedUserId for efficiency)
  for (const [userId, userData] of Object.entries(users)) {
      syncUserToMongo(userId, userData)
      syncUserStatsToMongo(userId)
    }
  }
}

// Fallback: if a user isn't in cache (common on Vercel cold starts), load from MongoDB
const ensureUserInCache = async (userId) => {
  if (usersCache[userId]) return usersCache[userId]

  // Try loading from MongoDB
  try {
    const dbUser = await db.users.get(userId)
    if (!dbUser) return null

    usersCache[userId] = {
      id: dbUser._id,
      firstName: dbUser.firstName,
      lastName: dbUser.lastName,
      username: dbUser.username,
      email: dbUser.email,
      canonicalEmail: dbUser.canonicalEmail || null,
      password: dbUser.password,
      createdAt: dbUser.createdAt?.toISOString?.() || dbUser.createdAt,
      stripeCustomerId: dbUser.stripeCustomerId || null,
      stripeSubscriptionId: dbUser.stripeSubscriptionId || null,
      subscriptionStatus: dbUser.subscriptionStatus || 'inactive',
      subscriptionRenewalDate: dbUser.subscriptionRenewalDate || null,
      subscriptionStartedDate: dbUser.subscriptionStartedDate || null,
      subscriptionPausedDate: dbUser.subscriptionPausedDate || null,
      cancellationHistory: dbUser.cancellationHistory || [],
      lastActiveAt: dbUser.lastActiveAt || null,
      monthlyUsageCost: dbUser.monthlyUsageCost || {},
      monthlyOverageBilled: dbUser.monthlyOverageBilled || {},
      plan: dbUser.plan || null,
      emailVerified: dbUser.emailVerified || false,
      timezone: dbUser.timezone || null,
      signupIp: dbUser.signupIp || null,
      deviceFingerprint: dbUser.deviceFingerprint || null,
      bio: dbUser.bio || '',
      profileImage: dbUser.profileImage || null,
      isAnonymous: dbUser.isAnonymous || false,
      isPrivate: dbUser.isPrivate || false,
      followers: dbUser.followers || [],
      following: dbUser.following || [],
      followRequests: dbUser.followRequests || [],
      sentFollowRequests: dbUser.sentFollowRequests || [],
      modelPreferences: dbUser.modelPreferences || null,
    }
    console.log(`[Cache Fallback] Loaded user ${userId} from MongoDB into cache`)
    return usersCache[userId]
  } catch (err) {
    console.error(`[Cache Fallback] Failed to load user ${userId} from MongoDB:`, err.message)
    return null
  }
}

// ============================================================================
// MongoDB-direct read helpers (source of truth for all user-facing endpoints)
// ============================================================================
// These ALWAYS query MongoDB and update the cache as a side effect.
// Use these in any endpoint that DISPLAYS data to the user.

const mapDbUserToCache = (dbUser, statsDoc) => ({
  id: dbUser._id,
  firstName: dbUser.firstName,
  lastName: dbUser.lastName,
  username: dbUser.username,
  email: dbUser.email,
  canonicalEmail: dbUser.canonicalEmail || null,
  password: dbUser.password,
  createdAt: dbUser.createdAt?.toISOString?.() || dbUser.createdAt,
  stripeCustomerId: dbUser.stripeCustomerId || null,
  stripeSubscriptionId: dbUser.stripeSubscriptionId || null,
  subscriptionStatus: dbUser.subscriptionStatus || 'inactive',
  subscriptionRenewalDate: dbUser.subscriptionRenewalDate || null,
  subscriptionStartedDate: dbUser.subscriptionStartedDate || null,
  subscriptionPausedDate: dbUser.subscriptionPausedDate || null,
  cancellationHistory: dbUser.cancellationHistory || [],
  lastActiveAt: dbUser.lastActiveAt || null,
  plan: dbUser.plan || null,
  emailVerified: dbUser.emailVerified || false,
  timezone: dbUser.timezone || null,
  signupIp: dbUser.signupIp || null,
  deviceFingerprint: dbUser.deviceFingerprint || null,
  modelPreferences: dbUser.modelPreferences || null,
  bio: dbUser.bio || '',
  profileImage: dbUser.profileImage || null,
  isAnonymous: dbUser.isAnonymous || false,
  isPrivate: dbUser.isPrivate || false,
  followers: dbUser.followers || [],
  following: dbUser.following || [],
  followRequests: dbUser.followRequests || [],
  sentFollowRequests: dbUser.sentFollowRequests || [],
  monthlyUsageCost: statsDoc?.monthlyUsageCost || {},
  monthlyOverageBilled: statsDoc?.monthlyOverageBilled || {},
})

const getUserFromDb = async (userId) => {
  try {
    const dbInstance = await db.getDb()
    const [dbUser, statsDoc] = await Promise.all([
      dbInstance.collection('users').findOne({ _id: userId }),
      dbInstance.collection('user_stats').findOne({ _id: userId }),
    ])
    if (!dbUser) return usersCache[userId] || null
    const mapped = mapDbUserToCache(dbUser, statsDoc)
    usersCache[userId] = mapped
    return mapped
  } catch (err) {
    console.error(`[DB Read] getUserFromDb failed for ${userId}:`, err.message)
    return usersCache[userId] || null
  }
}

const getUserUsageFromDb = async (userId) => {
  try {
    const dbInstance = await db.getDb()
    const [usageDoc, userDoc] = await Promise.all([
      dbInstance.collection('usage_data').findOne({ _id: userId }),
      dbInstance.collection('users').findOne({ _id: userId }, { projection: { purchasedCredits: 1 } }),
    ])
    const defaults = {
      totalTokens: 0, totalInputTokens: 0, totalOutputTokens: 0,
      totalQueries: 0, totalPrompts: 0,
      monthlyUsage: {}, dailyUsage: {},
      providers: {}, models: {},
      promptHistory: [], categories: {}, categoryPrompts: {},
      ratings: {}, lastActiveAt: null, streakDays: 0,
      judgeConversationContext: [],
      purchasedCredits: { total: 0, remaining: 0 },
    }
    if (usageDoc) {
      const { _id, updatedAt, ...data } = usageDoc
      const merged = { ...defaults, ...(usageCache[userId] || {}), ...data }
      // purchasedCredits from the users collection is authoritative
      if (userDoc?.purchasedCredits) merged.purchasedCredits = userDoc.purchasedCredits
      usageCache[userId] = merged
      return merged
    }
    // No usage_data doc — return defaults (merged with any existing cache)
    const result = { ...defaults, ...(usageCache[userId] || {}) }
    if (userDoc?.purchasedCredits) result.purchasedCredits = userDoc.purchasedCredits
    usageCache[userId] = result
    return result
  } catch (err) {
    console.error(`[DB Read] getUserUsageFromDb failed for ${userId}:`, err.message)
    return usageCache[userId] || {
      totalTokens: 0, totalInputTokens: 0, totalOutputTokens: 0,
      totalQueries: 0, totalPrompts: 0, monthlyUsage: {}, dailyUsage: {},
      providers: {}, models: {}, purchasedCredits: { total: 0, remaining: 0 },
    }
  }
}

const readUsage = () => {
  return usageCache
}

// Flush a single user's usage data to MongoDB immediately (no debounce).
// Used by writeUsage when a specific changedUserId is provided.
const flushSingleUserUsage = async (userId) => {
  if (!usageCache[userId]) return
  if (deletedUserIds.has(userId)) return
  try {
    const dbInstance = await db.getDb()
    const collection = dbInstance.collection('usage_data')
    const { totalTokens: _tt, totalPrompts: _tp, monthlyUsage: _mu, ...cacheWithoutManagedFields } = usageCache[userId]
    const monthlyDotUpdates = {}
    if (_mu) {
      for (const [month, data] of Object.entries(_mu)) {
        if (!data) continue
        const { tokens: _mt, prompts: _mp, ...monthWithoutManagedFields } = data
        for (const [field, value] of Object.entries(monthWithoutManagedFields)) {
          monthlyDotUpdates[`monthlyUsage.${month}.${field}`] = value
        }
      }
    }
    await collection.updateOne(
      { _id: userId },
      { $set: { ...cacheWithoutManagedFields, ...monthlyDotUpdates, _id: userId, updatedAt: new Date() } },
      { upsert: true }
    )
    syncUserStatsToMongo(userId)
    // Remove from dirty set since we just flushed
    usageDirtyUsers.delete(userId)
  } catch (err) {
    console.error(`[Usage Sync] Immediate flush failed for ${userId}:`, err.message)
    usageDirtyUsers.add(userId)
  }
}

const writeUsage = (usage, changedUserId = null) => {
  usageCache = usage

  if (changedUserId) {
    // Flush this specific user to MongoDB immediately — no debounce.
    // This ensures the data is in the database within the same request cycle.
    flushSingleUserUsage(changedUserId).catch(err =>
      console.error(`[Usage Sync] Immediate single-user flush failed:`, err.message)
    )
  } else {
    // No specific user — mark all dirty and debounce
    for (const userId of Object.keys(usage)) {
      usageDirtyUsers.add(userId)
    }
    if (process.env.VERCEL) {
      flushUsageToMongo().catch(err => console.error('[Usage Sync] Vercel immediate flush failed:', err.message))
    } else {
      if (Date.now() - lastFlushTime >= MAX_FLUSH_INTERVAL_MS) {
        if (usageSyncTimer) clearTimeout(usageSyncTimer)
        flushUsageToMongo().catch(err => console.error('[Usage Sync] Forced flush failed:', err.message))
      } else {
        if (usageSyncTimer) clearTimeout(usageSyncTimer)
        usageSyncTimer = setTimeout(() => flushUsageToMongo(), 2000)
      }
    }
  }
}

const readLeaderboard = () => {
  return leaderboardCache
}

const writeLeaderboard = async (leaderboard) => {
  leaderboardCache = leaderboard
  
  try {
    const dbInstance = await db.getDb()
    for (const post of leaderboard.prompts) {
      await dbInstance.collection('leaderboard_posts').updateOne(
        { _id: post.id },
        { $set: {
            userId: post.userId,
            username: post.username,
            promptText: post.promptText,
            category: post.category,
            description: post.description || null,
            likes: post.likes || [],
            likeCount: post.likeCount || 0,
            createdAt: post.createdAt ? new Date(post.createdAt) : new Date(),
            responses: post.responses || [],
            summary: post.summary,
            sources: post.sources || [],
            comments: post.comments || [],
        }},
        { upsert: true }
      )
    }
  } catch (error) {
    console.error('[Leaderboard Sync] Failed:', error.message)
  }
}

// Purge ALL traces of a deleted user from the leaderboard cache + MongoDB
// Removes their posts, their likes on others' posts, their comments, and their replies
const purgeUserFromLeaderboard = async (userId) => {
  const leaderboard = readLeaderboard()
  const postsToUpdateInDb = []

  // 1. Remove the user's own posts from cache
  const beforeCount = leaderboard.prompts.length
  leaderboard.prompts = leaderboard.prompts.filter(p => p.userId !== userId)
  const removedPosts = beforeCount - leaderboard.prompts.length

  // 2. Scrub the user's likes, comments, and replies from OTHER users' posts
  for (const prompt of leaderboard.prompts) {
    let modified = false

    // Remove user's likes
    if (prompt.likes && prompt.likes.includes(userId)) {
      prompt.likes = prompt.likes.filter(id => id !== userId)
      prompt.likeCount = prompt.likes.length
      modified = true
    }

    // Remove user's comments (and their replies on other comments)
    if (prompt.comments && prompt.comments.length > 0) {
      const beforeComments = prompt.comments.length
      prompt.comments = prompt.comments.filter(c => c.userId !== userId)
      if (prompt.comments.length !== beforeComments) modified = true

      // Remove user's replies from remaining comments + user's likes on comments
      for (const comment of prompt.comments) {
        if (comment.replies && comment.replies.length > 0) {
          const beforeReplies = comment.replies.length
          comment.replies = comment.replies.filter(r => r.userId !== userId)
          if (comment.replies.length !== beforeReplies) modified = true
        }
        if (comment.likes && comment.likes.includes(userId)) {
          comment.likes = comment.likes.filter(id => id !== userId)
          comment.likeCount = comment.likes.length
          modified = true
        }
      }
    }

    if (modified) postsToUpdateInDb.push(prompt)
  }

  // 3. Update the in-memory cache
  leaderboardCache = leaderboard

  // 4. Sync modified posts back to MongoDB (likes/comments changes on other users' posts)
  if (postsToUpdateInDb.length > 0) {
    try {
      const dbInstance = await db.getDb()
      await Promise.all(postsToUpdateInDb.map(post =>
        dbInstance.collection('leaderboard_posts').updateOne(
          { _id: post.id },
          { $set: {
            likes: post.likes || [],
            likeCount: post.likeCount || 0,
            comments: post.comments || [],
          }}
        )
      ))
    } catch (err) {
      console.error('[Leaderboard Purge] MongoDB sync error:', err.message)
    }
  }

  console.log(`[Leaderboard Purge] User ${userId}: removed ${removedPosts} posts, updated ${postsToUpdateInDb.length} other posts`)
}

// Track deleted users count in ADMIN database
const incrementDeletedUsers = async () => {
  try {
    await adminDb.metadata.incrementDeletedUsers()
    const stats = await adminDb.metadata.getAdminStats()
    return stats?.deletedUsersCount || 1
  } catch (error) {
    console.error('[DeletedUsers] Failed to increment:', error.message)
    return 0
  }
}

// Read deleted users count from ADMIN database
const readDeletedUsers = async () => {
  try {
    const stats = await adminDb.metadata.getAdminStats()
    return { count: stats?.deletedUsersCount || 0 }
  } catch (error) {
    console.error('[DeletedUsers] Failed to read:', error.message)
    return { count: 0 }
  }
}

// Read admin stats from ADMIN database
const getAdminStats = async () => {
  try {
    return await adminDb.metadata.getAdminStats()
  } catch (error) {
    console.error('[AdminStats] Failed to read:', error.message)
    return null
  }
}

// Password hashing
const hashPassword = (password) => {
  return crypto.createHash('sha256').update(password).digest('hex')
}

// ============================================================================
// FREE TRIAL ABUSE PREVENTION UTILITIES
// ============================================================================

// Canonicalize email to prevent alias abuse (e.g. john+trial@gmail.com → john@gmail.com)
const canonicalizeEmail = (email) => {
  const [local, domain] = email.toLowerCase().trim().split('@')
  // Gmail/Google domains: strip dots and +suffixes (Gmail ignores them)
  const googleDomains = ['gmail.com', 'googlemail.com']
  if (googleDomains.includes(domain)) {
    const cleaned = local.split('+')[0].replace(/\./g, '')
    return `${cleaned}@${domain}`
  }
  // For other providers, at least strip +suffixes (most support them)
  const cleaned = local.split('+')[0]
  return `${cleaned}@${domain}`
}

// Check if email uses a disposable/temporary domain (mailinator, guerrillamail, etc.)
const isDisposableEmail = (email) => {
  const domain = email.split('@')[1]?.toLowerCase()
  return disposableDomains.includes(domain)
}

// Max free trials allowed per IP address (allows for shared households)
const MAX_FREE_TRIALS_PER_IP = 2

// Get current month key (YYYY-MM)
const getCurrentMonth = () => {
  const now = new Date()
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
}

// ============================================================================
// TIMEZONE-AWARE DATE HELPERS
// ============================================================================
// All date keys (month, day) should be computed in the user's local timezone
// so usage is bucketed by their wall-clock date, not UTC.
// Falls back to UTC if no timezone is stored (legacy users before this feature).

const getUserLocalDate = (timezone) => {
  const now = new Date()
  if (!timezone) {
    // Fallback: UTC (same behavior as before for legacy users)
    return {
      year: now.getUTCFullYear(),
      month: now.getUTCMonth() + 1,
      day: now.getUTCDate(),
    }
  }
  try {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: timezone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).formatToParts(now)
    return {
      year: parseInt(parts.find(p => p.type === 'year').value),
      month: parseInt(parts.find(p => p.type === 'month').value),
      day: parseInt(parts.find(p => p.type === 'day').value),
    }
  } catch (err) {
    // Invalid timezone string — fall back to UTC
    console.warn(`[Timezone] Invalid timezone "${timezone}", falling back to UTC:`, err.message)
    return {
      year: now.getUTCFullYear(),
      month: now.getUTCMonth() + 1,
      day: now.getUTCDate(),
    }
  }
}

// Timezone-aware "YYYY-MM" key
const getMonthForUser = (timezone) => {
  const { year, month } = getUserLocalDate(timezone)
  return `${year}-${String(month).padStart(2, '0')}`
}

// Timezone-aware "YYYY-MM-DD" key
const getTodayForUser = (timezone) => {
  const { year, month, day } = getUserLocalDate(timezone)
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
}

// Convert a timestamp/date into YYYY-MM-DD in the user's timezone.
// Falls back to UTC when timezone is missing or invalid.
const getDateKeyForUser = (dateInput, timezone) => {
  if (!dateInput) return null
  const parsed = new Date(dateInput)
  if (Number.isNaN(parsed.getTime())) return null

  try {
    if (timezone) {
      const parts = new Intl.DateTimeFormat('en-US', {
        timeZone: timezone,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
      }).formatToParts(parsed)
      const year = parts.find(p => p.type === 'year')?.value
      const month = parts.find(p => p.type === 'month')?.value
      const day = parts.find(p => p.type === 'day')?.value
      if (year && month && day) return `${year}-${month}-${day}`
    }
  } catch (err) {
    console.warn(`[Timezone] Failed to format date key for timezone "${timezone}", falling back to UTC:`, err.message)
  }

  return parsed.toISOString().substring(0, 10)
}

const getDayDiffFromDateKeys = (startDateKey, endDateKey) => {
  if (!startDateKey || !endDateKey) return null
  const startParts = startDateKey.split('-').map(Number)
  const endParts = endDateKey.split('-').map(Number)
  if (startParts.length !== 3 || endParts.length !== 3) return null
  if (startParts.some(Number.isNaN) || endParts.some(Number.isNaN)) return null

  const startMs = Date.UTC(startParts[0], startParts[1] - 1, startParts[2])
  const endMs = Date.UTC(endParts[0], endParts[1] - 1, endParts[2])
  return Math.round((endMs - startMs) / (1000 * 60 * 60 * 24))
}

// Get a user's stored timezone from the users cache
const getUserTimezone = (userId) => {
  const users = readUsers()
  return users[userId]?.timezone || null
}

// Date string aligned to the user's stored timezone (falls back to ET for legacy users)
const getCurrentDateStringForUser = (userId) => {
  const timezone = userId ? getUserTimezone(userId) : null
  if (!timezone) {
    return getCurrentDateString()
  }
  try {
    return getCurrentDateString(timezone)
  } catch (err) {
    console.warn(`[Timezone] Failed to format date for user ${userId} timezone "${timezone}", falling back to ET:`, err.message)
    return getCurrentDateString()
  }
}

// Track a prompt submission (one per user submission, regardless of models called)
const trackPrompt = async (userId, promptText, category, promptData = {}) => {
  const usage = readUsage()
  if (!usage[userId]) {
    usage[userId] = {
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
      judgeConversationContext: [], // Store last 5 summaries from judge model conversations
    }
  }

  const userUsage = usage[userId]
  const tz = getUserTimezone(userId)
  const currentMonth = getMonthForUser(tz)
  const today = getTodayForUser(tz)

  // Migration: Ensure totalPrompts field exists
  if (userUsage.totalPrompts === undefined) {
    userUsage.totalPrompts = 0
  }
  // Migration: Ensure input/output tokens fields exist
  if (userUsage.totalInputTokens === undefined) {
    userUsage.totalInputTokens = 0
  }
  if (userUsage.totalOutputTokens === undefined) {
    userUsage.totalOutputTokens = 0
  }
  // Migration: Ensure prompt history exists
  if (!userUsage.promptHistory) {
    userUsage.promptHistory = []
  }
  // Migration: Ensure categories exists
  if (!userUsage.categories) {
    userUsage.categories = {}
  }
  // Migration: Ensure categoryPrompts exists (stores recent prompts per category)
  if (!userUsage.categoryPrompts) {
    userUsage.categoryPrompts = {}
  }
  // Migration: Ensure ratings exists
  if (!userUsage.ratings) {
    userUsage.ratings = {}
  }
  // Migration: Ensure streak tracking exists
  if (!userUsage.lastActiveAt) {
    userUsage.lastActiveAt = null
  }
  if (userUsage.streakDays === undefined) {
    userUsage.streakDays = 0
  }
  // Migration: Ensure judge conversation context exists
  if (!userUsage.judgeConversationContext) {
    userUsage.judgeConversationContext = []
  }
  // Migration: Ensure councilPrompts exists
  if (userUsage.councilPrompts === undefined) {
    userUsage.councilPrompts = 0
  }

  // Track council prompts (prompts sent to 3+ providers/models)
  const responseCount = promptData?.responses?.length || 0
  if (responseCount >= 3) {
    userUsage.councilPrompts = (userUsage.councilPrompts || 0) + 1
    console.log(`[Prompt Tracking] User ${userId}: Council prompt detected (${responseCount} models). Total council prompts: ${userUsage.councilPrompts}`)
  }

  // Track debate prompts
  if (promptData?.promptMode === 'debate') {
    if (userUsage.debatePrompts === undefined) {
      userUsage.debatePrompts = 0
    }
    userUsage.debatePrompts = (userUsage.debatePrompts || 0) + 1
    console.log(`[Prompt Tracking] User ${userId}: Debate prompt detected. Total debate prompts: ${userUsage.debatePrompts}`)
  }

  // Count 1 prompt per user submission (regardless of how many models are in the council)
  const oldTotal = userUsage.totalPrompts || 0
  userUsage.totalPrompts = (userUsage.totalPrompts || 0) + 1
  console.log(`[Prompt Tracking] User ${userId}: Prompts ${oldTotal} -> ${userUsage.totalPrompts}`)

  // Ensure monthlyUsage exists before accessing it
  if (!userUsage.monthlyUsage) {
    userUsage.monthlyUsage = {}
  }
  
  // Update monthly prompt usage
  if (!userUsage.monthlyUsage[currentMonth]) {
    userUsage.monthlyUsage[currentMonth] = { tokens: 0, inputTokens: 0, outputTokens: 0, queries: 0, prompts: 0 }
  }
  // Migration: Ensure prompts field exists in monthlyUsage
  if (userUsage.monthlyUsage[currentMonth].prompts === undefined) {
    userUsage.monthlyUsage[currentMonth].prompts = 0
  }
  const oldMonthly = userUsage.monthlyUsage[currentMonth].prompts || 0
  userUsage.monthlyUsage[currentMonth].prompts += 1
  console.log(`[Prompt Tracking] User ${userId} (${currentMonth}): Monthly prompts ${oldMonthly} -> ${userUsage.monthlyUsage[currentMonth].prompts}`)

  // NOTE: User's typed prompt tokens are NOT counted here anymore.
  // They are included in the full inputTokens counted by trackUsage() (which now counts input + output).
  // Adding them here would cause double-counting since the API's input token count already includes the user prompt.

  // Track prompt history (keep last 100, we'll return last 20 to frontend)
  if (promptText) {
    const promptEntry = {
      text: promptText.substring(0, 500), // Limit to 500 chars
      category: category || 'general',
      timestamp: new Date().toISOString(),
    }
    
    // Add responses, summary, facts, and sources if provided
    if (promptData.responses && Array.isArray(promptData.responses)) {
      promptEntry.responses = promptData.responses.map(r => ({
        modelName: r.modelName,
        actualModelName: r.actualModelName,
        originalModelName: r.originalModelName,
        text: r.text,
        error: r.error || false,
        tokens: r.tokens || null,
      }))
    }
    
    if (promptData.summary) {
      promptEntry.summary = {
        text: promptData.summary.text,
        consensus: promptData.summary.consensus,
        summary: promptData.summary.summary,
        agreements: promptData.summary.agreements || [],
        disagreements: promptData.summary.disagreements || [],
        singleModel: promptData.summary.singleModel || false,
      }
    }
    
    if (promptData.facts && Array.isArray(promptData.facts)) {
      promptEntry.facts = promptData.facts.map(f => ({
        fact: f.fact || f,
        source_quote: f.source_quote || null,
      }))
    }
    
    if (promptData.sources && Array.isArray(promptData.sources)) {
      promptEntry.sources = promptData.sources.map(s => ({
        title: s.title,
        link: s.link,
        snippet: s.snippet,
      }))
    }
    
    userUsage.promptHistory.unshift(promptEntry)
    // Keep only last 10 prompts
    if (userUsage.promptHistory.length > 10) {
      userUsage.promptHistory = userUsage.promptHistory.slice(0, 10)
    }
  }

  // Track category counts and recent prompts per category (max 8 per category)
  const cat = category || 'General Knowledge/Other'
  if (!userUsage.categories[cat]) {
    userUsage.categories[cat] = 0
  }
  userUsage.categories[cat] += 1
  
  // Track recent prompts per category (keep only last 8)
  if (promptText) {
    if (!userUsage.categoryPrompts[cat]) {
      userUsage.categoryPrompts[cat] = []
    }
    // Add new prompt to the beginning
    const categoryPromptEntry = {
      text: promptText.substring(0, 500), // Limit to 500 chars
      timestamp: new Date().toISOString(),
    }
    
    // Add responses, summary, facts, and sources if provided
    if (promptData.responses && Array.isArray(promptData.responses)) {
      categoryPromptEntry.responses = promptData.responses.map(r => ({
        modelName: r.modelName,
        actualModelName: r.actualModelName,
        originalModelName: r.originalModelName,
        text: r.text,
        error: r.error || false,
        tokens: r.tokens || null,
      }))
    }
    
    if (promptData.summary) {
      categoryPromptEntry.summary = {
        text: promptData.summary.text,
        consensus: promptData.summary.consensus,
        summary: promptData.summary.summary,
        agreements: promptData.summary.agreements || [],
        disagreements: promptData.summary.disagreements || [],
        singleModel: promptData.summary.singleModel || false,
      }
    }
    
    if (promptData.facts && Array.isArray(promptData.facts)) {
      categoryPromptEntry.facts = promptData.facts.map(f => ({
        fact: f.fact || f,
        source_quote: f.source_quote || null,
      }))
    }
    
    if (promptData.sources && Array.isArray(promptData.sources)) {
      categoryPromptEntry.sources = promptData.sources.map(s => ({
        title: s.title,
        link: s.link,
        snippet: s.snippet,
      }))
    }
    
    userUsage.categoryPrompts[cat].unshift(categoryPromptEntry)
    // Keep only last 8 prompts per category
    if (userUsage.categoryPrompts[cat].length > 8) {
      userUsage.categoryPrompts[cat] = userUsage.categoryPrompts[cat].slice(0, 8)
    }
  }

  // Update streak — compare YYYY-MM-DD date strings directly (no timezone confusion)
  // Normalize lastActiveAt to YYYY-MM-DD in case it was stored as a full ISO timestamp (from login)
  let lastActiveDate = userUsage.lastActiveAt
  if (lastActiveDate && lastActiveDate.length > 10) {
    // It's a full ISO timestamp like "2026-02-21T19:00:00.000Z" — extract just the date portion
    // using the user's timezone so the date is correct for their locale
    const parsed = new Date(lastActiveDate)
    if (!isNaN(parsed.getTime())) {
      if (tz) {
        lastActiveDate = getDateKeyForUser(parsed, tz)
      } else {
        lastActiveDate = parsed.toISOString().substring(0, 10)
      }
    }
  }

  if (lastActiveDate && lastActiveDate.length === 10) {
    // Compare YYYY-MM-DD strings directly — both are in the user's local timezone
    if (lastActiveDate === today) {
      // Same day, streak continues — no change needed
    } else {
      // Calculate day difference using date-only strings (avoid UTC time-of-day issues)
      const lastParts = lastActiveDate.split('-').map(Number)
      const todayParts = today.split('-').map(Number)
      const lastMs = Date.UTC(lastParts[0], lastParts[1] - 1, lastParts[2])
      const todayMs = Date.UTC(todayParts[0], todayParts[1] - 1, todayParts[2])
      const diffDays = Math.round((todayMs - lastMs) / (1000 * 60 * 60 * 24))

      if (diffDays === 1) {
        // Consecutive day, increment streak
        userUsage.streakDays = (userUsage.streakDays || 0) + 1
      } else {
        // Streak broken (or future date edge case), reset to 1
        userUsage.streakDays = 1
      }
    }
  } else {
    // First time ever, start streak at 1
    userUsage.streakDays = 1
  }
  userUsage.lastActiveAt = today // Always store as YYYY-MM-DD (user's local date)

  writeUsage(usage, userId)
  
  // Atomic MongoDB $inc for prompt counts (prevents race conditions on Vercel serverless).
  // Same pattern as trackUsage() uses for totalTokens.
  try {
    const dbInstance = await db.getDb()
    await dbInstance.collection('usage_data').updateOne(
      { _id: userId },
      {
        $inc: {
          totalPrompts: 1,
          [`monthlyUsage.${currentMonth}.prompts`]: 1
        },
        $set: { updatedAt: new Date() }
      },
      { upsert: true }
    )
    console.log(`[Prompt Tracking] Atomic $inc for ${userId}: totalPrompts +1, monthlyUsage.${currentMonth}.prompts +1`)
  } catch (incErr) {
    console.error(`[Prompt Tracking] Atomic $inc failed for ${userId}:`, incErr.message)
  }

  // Also update users cache with last active date
  const users = readUsers()
  if (users[userId]) {
    const activeDate = new Date().toISOString()
    users[userId].lastActiveAt = activeDate
    
    try {
      writeUsers(users, userId)
      console.log(`[User Update] Updated ${userId} in users cache: lastActiveAt=${activeDate}`)
    } catch (error) {
      console.error(`[User Update] Error updating users cache for ${userId}:`, error)
    }
  }
}

// Track a continued conversation prompt (1 per follow-up message in judge or model conversation)
// Counts 1 prompt per follow-up message. Token counting is handled by trackUsage() separately.
const trackConversationPrompt = async (userId, userMessage) => {
  if (!userId) return
  
  const usage = readUsage()
  if (!usage[userId]) return
  
  const userUsage = usage[userId]
  const tz = getUserTimezone(userId)
  const currentMonth = getMonthForUser(tz)
  
  // Ensure monthlyUsage exists
  if (!userUsage.monthlyUsage) userUsage.monthlyUsage = {}
  if (!userUsage.monthlyUsage[currentMonth]) {
    userUsage.monthlyUsage[currentMonth] = { tokens: 0, inputTokens: 0, outputTokens: 0, queries: 0, prompts: 0 }
  }
  if (userUsage.monthlyUsage[currentMonth].prompts === undefined) {
    userUsage.monthlyUsage[currentMonth].prompts = 0
  }
  
  // Count 1 prompt for this conversation follow-up (in-memory for same-instance reads)
  userUsage.totalPrompts = (userUsage.totalPrompts || 0) + 1
  userUsage.monthlyUsage[currentMonth].prompts += 1
  console.log(`[Conversation Prompt] User ${userId}: Prompts -> ${userUsage.totalPrompts}, Monthly -> ${userUsage.monthlyUsage[currentMonth].prompts}`)
  
  // NOTE: User's typed conversation message tokens are NOT counted here anymore.
  // They are included in the full inputTokens counted by trackUsage() (which now counts input + output).
  // Adding them here would cause double-counting since the API's input token count already includes the user message.
  
  writeUsage(usage, userId)
  
  // Atomic MongoDB $inc for prompt counts (prevents race conditions on Vercel serverless).
  // Same pattern as trackUsage() uses for totalTokens.
  try {
    const dbInstance = await db.getDb()
    await dbInstance.collection('usage_data').updateOne(
      { _id: userId },
      {
        $inc: {
          totalPrompts: 1,
          [`monthlyUsage.${currentMonth}.prompts`]: 1
        },
        $set: { updatedAt: new Date() }
      },
      { upsert: true }
    )
    console.log(`[Conversation Prompt] Atomic $inc for ${userId}: totalPrompts +1, monthlyUsage.${currentMonth}.prompts +1`)
  } catch (incErr) {
    console.error(`[Conversation Prompt] Atomic $inc failed for ${userId}:`, incErr.message)
  }
}

// Track usage for a user
// isPipeline = true for internal/behind-the-scenes calls (category detection, refiner, context summarization)
// isPipeline = false for user-visible model calls (council members, summary, individual models, judge conversation)
// Pipeline usage: only counted in dailyUsage/cost. NOT in visible token counters or per-model stats.
// Non-pipeline usage: FULL input+output tokens counted in visible counters + per-model stats. All tokens counted in cost.
// This means visible counters include: user prompt + web sources + system formatting + model output.
// Pipeline calls (category detection etc.) are excluded from visible counters.
// NOTE: Prompt counting is NOT done here — it's handled by trackPrompt (initial) and trackConversationPrompt (follow-ups).
const trackUsage = async (userId, provider, model, inputTokens, outputTokens, isPipeline = false) => {
  const usage = readUsage()
  if (!usage[userId]) {
    usage[userId] = {
      totalTokens: 0,
      totalInputTokens: 0,
      totalOutputTokens: 0,
      totalQueries: 0,
      totalPrompts: 0,
      monthlyUsage: {},
      dailyUsage: {},
      providers: {},
      models: {},
    }
  }

  const userUsage = usage[userId]
  const tz = getUserTimezone(userId)
  const currentMonth = getMonthForUser(tz)
  const today = getTodayForUser(tz)
  const modelKey = `${provider}-${model}`
  
  // Ensure all required sub-objects exist (existing users loaded from MongoDB may lack these)
  if (!userUsage.monthlyUsage) {
    userUsage.monthlyUsage = {}
  }
  if (!userUsage.providers) {
    userUsage.providers = {}
  }
  if (!userUsage.models) {
    userUsage.models = {}
  }
  if (!userUsage.dailyUsage) {
    userUsage.dailyUsage = {}
  }
  
  // Update user-visible stats (per-model, provider) only for user-visible calls.
  // Pipeline calls (refiner, category detection) still count towards cost via dailyUsage below.
  if (!isPipeline) {
    const callTokens = inputTokens + outputTokens

    // totalTokens is the single source of truth and always equals totalInputTokens + totalOutputTokens
    userUsage.totalTokens = (userUsage.totalTokens || 0) + callTokens
    userUsage.totalInputTokens = (userUsage.totalInputTokens || 0) + inputTokens
    userUsage.totalOutputTokens = (userUsage.totalOutputTokens || 0) + outputTokens

    if (!userUsage.monthlyUsage[currentMonth]) {
      userUsage.monthlyUsage[currentMonth] = { tokens: 0, inputTokens: 0, outputTokens: 0, queries: 0, prompts: 0 }
    }
    userUsage.monthlyUsage[currentMonth].tokens = (userUsage.monthlyUsage[currentMonth].tokens || 0) + callTokens
    userUsage.monthlyUsage[currentMonth].inputTokens = (userUsage.monthlyUsage[currentMonth].inputTokens || 0) + inputTokens
    userUsage.monthlyUsage[currentMonth].outputTokens = (userUsage.monthlyUsage[currentMonth].outputTokens || 0) + outputTokens

    // NOTE: Prompt counting is NOT done here. Prompts are counted:
    // - 1 per initial user submission (in trackPrompt)
    // - 1 per continued conversation message (in conversation endpoints)

    // Update provider stats — full input + output tokens for the visible token counter
    if (!userUsage.providers[provider]) {
      userUsage.providers[provider] = {
        totalTokens: 0,
        totalInputTokens: 0,
        totalOutputTokens: 0,
        totalQueries: 0,
        monthlyTokens: {},
        monthlyInputTokens: {},
        monthlyOutputTokens: {},
        monthlyQueries: {},
      }
    }
    userUsage.providers[provider].totalTokens += (inputTokens + outputTokens)
    userUsage.providers[provider].totalInputTokens = (userUsage.providers[provider].totalInputTokens || 0) + inputTokens
    userUsage.providers[provider].totalOutputTokens = (userUsage.providers[provider].totalOutputTokens || 0) + outputTokens

    if (!userUsage.providers[provider].monthlyTokens[currentMonth]) {
      userUsage.providers[provider].monthlyTokens[currentMonth] = 0
      userUsage.providers[provider].monthlyInputTokens = userUsage.providers[provider].monthlyInputTokens || {}
      userUsage.providers[provider].monthlyOutputTokens = userUsage.providers[provider].monthlyOutputTokens || {}
      userUsage.providers[provider].monthlyInputTokens[currentMonth] = 0
      userUsage.providers[provider].monthlyOutputTokens[currentMonth] = 0
      userUsage.providers[provider].monthlyQueries[currentMonth] = 0
    }
    userUsage.providers[provider].monthlyTokens[currentMonth] += (inputTokens + outputTokens)
    userUsage.providers[provider].monthlyInputTokens[currentMonth] = (userUsage.providers[provider].monthlyInputTokens[currentMonth] || 0) + inputTokens
    userUsage.providers[provider].monthlyOutputTokens[currentMonth] = (userUsage.providers[provider].monthlyOutputTokens[currentMonth] || 0) + outputTokens
  } else {
    // Still ensure monthlyUsage exists for pipeline calls (needed for prompts counter)
    if (!userUsage.monthlyUsage[currentMonth]) {
      userUsage.monthlyUsage[currentMonth] = { tokens: 0, inputTokens: 0, outputTokens: 0, queries: 0, prompts: 0 }
    }
  }

  // Update model stats
  // Update per-model stats only for user-visible calls (not pipeline internals)
  if (!isPipeline) {
    if (!userUsage.models[modelKey]) {
      userUsage.models[modelKey] = {
        totalTokens: 0,
        totalInputTokens: 0,
        totalOutputTokens: 0,
        totalQueries: 0,
        totalPrompts: 0,
        provider: provider,
        model: model,
        pricing: null,
      }
    }
    userUsage.models[modelKey].totalTokens += (inputTokens + outputTokens)
    userUsage.models[modelKey].totalInputTokens = (userUsage.models[modelKey].totalInputTokens || 0) + inputTokens
    userUsage.models[modelKey].totalOutputTokens = (userUsage.models[modelKey].totalOutputTokens || 0) + outputTokens
    userUsage.models[modelKey].totalPrompts = (userUsage.models[modelKey].totalPrompts || 0) + 1
  }

  // Update daily usage (for cost calculation and daily breakdown chart)
  if (!userUsage.dailyUsage[currentMonth]) {
    userUsage.dailyUsage[currentMonth] = {}
  }
  if (!userUsage.dailyUsage[currentMonth][today]) {
    userUsage.dailyUsage[currentMonth][today] = { inputTokens: 0, outputTokens: 0, queries: 0, models: {} }
  }
  // Only count user-visible tokens in the daily aggregate (shown in the chart)
  if (!isPipeline) {
    userUsage.dailyUsage[currentMonth][today].inputTokens = (userUsage.dailyUsage[currentMonth][today].inputTokens || 0) + inputTokens
    userUsage.dailyUsage[currentMonth][today].outputTokens = (userUsage.dailyUsage[currentMonth][today].outputTokens || 0) + outputTokens
  }
  
  // Always track per-model tokens on this day (drives cost calculation for ALL calls including pipeline)
  if (!userUsage.dailyUsage[currentMonth][today].models[modelKey]) {
    userUsage.dailyUsage[currentMonth][today].models[modelKey] = { inputTokens: 0, outputTokens: 0 }
  }
  userUsage.dailyUsage[currentMonth][today].models[modelKey].inputTokens = (userUsage.dailyUsage[currentMonth][today].models[modelKey].inputTokens || 0) + inputTokens
  userUsage.dailyUsage[currentMonth][today].models[modelKey].outputTokens = (userUsage.dailyUsage[currentMonth][today].models[modelKey].outputTokens || 0) + outputTokens

  writeUsage(usage, userId)
  
  // ALSO update the monthlyUsageCost in users cache immediately
  // This ensures costs are tracked incrementally and won't be lost if dailyUsage is reset
  try {
    const users = readUsers()
    const user = users[userId]
    if (user) {
      // Calculate the cost of THIS specific usage
      const pricing = getPricingData()
      const thisCost = calculateModelCost(modelKey, inputTokens, outputTokens, pricing)
      
      if (thisCost > 0) {
        if (!user.monthlyUsageCost) {
          user.monthlyUsageCost = {}
        }
        const existingCost = user.monthlyUsageCost[currentMonth] || 0
        user.monthlyUsageCost[currentMonth] = existingCost + thisCost
        writeUsers(users, userId)
        console.log(`[Usage] Added $${thisCost.toFixed(6)} to monthlyUsageCost. New total: $${user.monthlyUsageCost[currentMonth].toFixed(4)}`)
      }
    }
  } catch (costErr) {
    console.error('[Usage] Error updating monthlyUsageCost:', costErr)
  }
  
  // Atomic $inc for totalTokens and monthlyUsage.*.tokens (same pattern as totalPrompts).
  // This is the single source of truth — no frontend token-update call needed.
  if (!isPipeline) {
    const callTokens = inputTokens + outputTokens
    if (callTokens > 0) {
      try {
        const dbInstance = await db.getDb()
        await dbInstance.collection('usage_data').updateOne(
          { _id: userId },
          {
            $inc: {
              totalTokens: callTokens,
              [`monthlyUsage.${currentMonth}.tokens`]: callTokens
            },
            $set: { updatedAt: new Date() }
          },
          { upsert: true }
        )
      } catch (incErr) {
        console.error(`[Usage] Atomic $inc for totalTokens failed for ${userId}:`, incErr.message)
      }
    }
  }
}

// API Keys from environment variables (stored securely in .env file)
const API_KEYS = {
  openai: process.env.OPENAI_API_KEY || '',
  anthropic: process.env.ANTHROPIC_API_KEY || '',
  google: process.env.GOOGLE_API_KEY || '',
  xai: process.env.XAI_API_KEY || '',
  meta: process.env.META_API_KEY || '', // Empty for now, can be added later
  deepseek: process.env.DEEPSEEK_API_KEY || '',
  mistral: process.env.MISTRAL_API_KEY || '',
  serper: process.env.SERPER_API_KEY || '',
}

// Middleware — allow frontend origin in production, everything in dev
const ALLOWED_ORIGINS = process.env.ALLOWED_ORIGINS
  ? process.env.ALLOWED_ORIGINS.split(',').map(o => o.trim())
  : null // null = allow all (dev mode)

app.use(cors(ALLOWED_ORIGINS ? {
  origin: (origin, callback) => {
    // Allow requests with no origin (server-to-server, curl, etc.)
    if (!origin || ALLOWED_ORIGINS.includes(origin)) {
      callback(null, true)
    } else {
      callback(new Error('Not allowed by CORS'))
    }
  },
  credentials: true,
} : undefined))

// Stripe webhook endpoint needs raw body for signature verification
// This must be BEFORE express.json() middleware
app.use('/api/stripe/webhook', express.raw({ type: 'application/json' }))

// JSON parsing for all other routes (2mb limit to support profile image uploads)
app.use(express.json({ limit: '2mb' }))

// Health/version check endpoint
app.get('/api/health', (req, res) => {
  res.json({ 
    version: SERVER_VERSION, 
    cacheUsers: Object.keys(usersCache).length,
    cacheUsage: Object.keys(usageCache).length,
    timestamp: new Date().toISOString()
  })
})

// Authentication endpoints
app.post('/api/auth/signup', async (req, res) => {
  try {
    const { firstName, lastName, username, email: rawEmail, password, plan, fingerprint, timezone } = req.body

    if (!firstName || !lastName || !username || !rawEmail || !password) {
      return res.status(400).json({ error: 'All fields are required' })
    }

    const isFreeTrial = plan === 'free_trial'

    if (password.length < 8) {
      return res.status(400).json({ error: 'Password must be at least 8 characters' })
    }

    // Normalize email to prevent case-sensitivity issues (e.g. "Test@Gmail.COM" vs "test@gmail.com")
    const email = rawEmail.toLowerCase().trim()
    // Canonicalize email to detect alias abuse (e.g. john+trial1@gmail.com → john@gmail.com)
    const canonical = canonicalizeEmail(email)

    console.log('[Auth] Signup attempt for username:', username, '| plan:', plan)

    // ==================== FREE TRIAL ABUSE PREVENTION ====================
    if (isFreeTrial) {
      // 1. Block disposable/temporary email domains (mailinator, guerrillamail, etc.)
      if (isDisposableEmail(email)) {
        console.log('[Auth] ❌ Blocked disposable email:', email)
        return res.status(400).json({ error: 'Please use a permanent email address to sign up. Temporary email services are not allowed.' })
      }

      // 2. Check canonical email — catches Gmail alias abuse (john+1@gmail.com, j.o.h.n@gmail.com)
      const existingCanonical = await db.users.getByCanonicalEmail(canonical)
      if (existingCanonical && existingCanonical.plan === 'free_trial') {
        console.log('[Auth] ❌ Canonical email already used for free trial:', canonical)
        return res.status(400).json({ error: 'A free trial has already been used with this email address.' })
      }

      // 3. IP-based rate limiting — max N free trials per IP (allows shared households)
      const signupIp = req.headers['x-forwarded-for']?.split(',')[0]?.trim() || req.socket?.remoteAddress || 'unknown'
      const trialCountFromIp = await db.users.countFreeTrialsByIp(signupIp)
      if (trialCountFromIp >= MAX_FREE_TRIALS_PER_IP) {
        console.log(`[Auth] ❌ IP ${signupIp} exceeded free trial limit (${trialCountFromIp}/${MAX_FREE_TRIALS_PER_IP})`)
        return res.status(400).json({ error: 'Free trial limit reached for this network. Please subscribe to a Pro plan to continue.' })
      }

      // 4. Device fingerprint check — same browser can't get multiple free trials
      if (fingerprint) {
        const existingFingerprint = await db.users.getFreeTrialByFingerprint(fingerprint)
        if (existingFingerprint) {
          console.log('[Auth] ❌ Device fingerprint already used for free trial:', fingerprint.substring(0, 12) + '...')
          return res.status(400).json({ error: 'A free trial has already been used on this device. Please subscribe to a Pro plan to continue.' })
        }
      }
    }

    // ==================== STANDARD DUPLICATE CHECKS ====================
    const existingUser = await db.users.getByUsername(username)
    if (existingUser) {
      return res.status(400).json({ error: 'Username already exists' })
    }
    
    const existingEmail = await db.users.getByEmail(email)
    if (existingEmail) {
      return res.status(400).json({ error: 'Email already registered' })
    }

    // ==================== CREATE USER ====================
    const hashedPassword = hashPassword(password)
    const userId = crypto.randomUUID()
    const signupIp = req.headers['x-forwarded-for']?.split(',')[0]?.trim() || req.socket?.remoteAddress || 'unknown'
    
    // Both free trial and pro start as pending_verification (must verify email first)
    // Free trial: pending_verification → trialing (after email verified)
    // Pro: pending_verification → inactive (after email verified) → active (after payment)
    const initialStatus = 'pending_verification'
    
    await db.users.create(userId, {
      email,
      canonicalEmail: canonical,
      password: hashedPassword,
      firstName,
      lastName,
      username,
      subscriptionStatus: initialStatus,
      signupIp,
      deviceFingerprint: fingerprint || null,
      emailVerified: false,
      plan: isFreeTrial ? 'free_trial' : null,
      timezone: timezone || null,
    })
    console.log('[Auth] User created in MongoDB:', userId, '| status:', initialStatus)

    // Update cache
    const users = readUsers()
    users[userId] = {
      id: userId,
      firstName,
      lastName,
      username,
      email,
      canonicalEmail: canonical,
      password: hashedPassword,
      createdAt: new Date().toISOString(),
      stripeCustomerId: null,
      stripeSubscriptionId: null,
      subscriptionStatus: initialStatus,
      subscriptionRenewalDate: null,
      subscriptionStartedDate: isFreeTrial ? new Date().toISOString() : null,
      subscriptionPausedDate: null,
      cancellationHistory: [],
      lastActiveAt: null,
      monthlyUsageCost: {},
      monthlyOverageBilled: {},
      plan: isFreeTrial ? 'free_trial' : null,
      emailVerified: false,
      signupIp,
      deviceFingerprint: fingerprint || null,
      timezone: timezone || null,
      bio: '',
      profileImage: null,
      isAnonymous: false,
      followers: [],
      following: [],
    }
    usersCache = users

    // Initialize usage tracking in cache (no credits yet for free trial — granted after email verification)
    const usage = readUsage()
    usage[userId] = {
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
    }
    usageCache = usage

    // ==================== EMAIL VERIFICATION (all plans) ====================
    // Both free trial AND pro plans require email verification before proceeding
    const verifyToken = crypto.randomBytes(32).toString('hex')
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000) // 24 hours

    // Store token in memory + MongoDB
    emailVerificationTokens.set(verifyToken, { userId, email, expiresAt })
    try {
      const dbInstance = await db.getDb()
      await dbInstance.collection('email_verifications').insertOne({
        token: verifyToken,
        userId,
        email,
        expiresAt,
        createdAt: new Date(),
        used: false,
      })
    } catch (dbErr) {
      console.error('[Auth] Error saving verification token to DB:', dbErr)
    }

    // Send verification email
    const verifyLink = `${APP_URL}/#verify-email?token=${verifyToken}`
    const emailPurpose = isFreeTrial
      ? 'Please verify your email address to continue setting up your free trial.'
      : 'Please verify your email address to complete your account setup.'
    try {
      if (resend) {
        await resend.emails.send({
          from: FROM_EMAIL,
          to: email,
          subject: `${APP_NAME} — Verify Your Email`,
          html: `
            <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 500px; margin: 0 auto; padding: 40px 20px;">
              <h2 style="color: #333; margin-bottom: 24px;">Verify Your Email</h2>
              <p style="color: #555; font-size: 16px; line-height: 1.6;">
                Hi ${firstName},
              </p>
              <p style="color: #555; font-size: 16px; line-height: 1.6;">
                Thanks for signing up for ${APP_NAME}! ${emailPurpose}
              </p>
              <div style="text-align: center; margin: 32px 0;">
                <a href="${verifyLink}" style="display: inline-block; padding: 14px 32px; background: linear-gradient(135deg, #5dade2, #48c9b0); color: #000; font-weight: bold; font-size: 16px; text-decoration: none; border-radius: 8px;">
                  Verify Email Address
                </a>
              </div>
              <p style="color: #888; font-size: 14px; line-height: 1.6;">
                This link expires in 24 hours. If the button doesn't work, copy and paste this link:
              </p>
              <p style="color: #5dade2; font-size: 13px; word-break: break-all;">
                ${verifyLink}
              </p>
              <hr style="border: none; border-top: 1px solid #eee; margin: 32px 0;" />
              <p style="color: #999; font-size: 13px;">
                If you didn't sign up for ${APP_NAME}, you can safely ignore this email.
              </p>
            </div>
          `,
        })
        console.log('[Auth] Verification email sent to:', email)
      } else {
        console.warn('[Auth] Resend not configured — verification email NOT sent. Token:', verifyToken.substring(0, 8) + '...')
      }
    } catch (emailErr) {
      console.error('[Auth] Failed to send verification email:', emailErr)
      // Don't fail signup — user can resend verification later
    }

    const signupMessage = isFreeTrial
      ? 'Account created! Please check your email to verify your account and activate your free trial.'
      : 'Account created! Please check your email to verify your account.'

    return res.json({
      success: true,
      requiresVerification: true,
      message: signupMessage,
      user: {
        id: userId,
        firstName,
        lastName,
        username,
        email,
        subscriptionStatus: 'pending_verification',
        subscriptionRenewalDate: null,
        plan: isFreeTrial ? 'free_trial' : 'pro',
        emailVerified: false,
      },
    })
  } catch (error) {
    console.error('[Auth] Signup error:', error)
    res.status(500).json({ error: 'An error occurred during signup. Please try again.' })
  }
})

app.post('/api/auth/signin', async (req, res) => {
  try {
    const { username, password, timezone } = req.body

    if (!username || !password) {
      return res.status(400).json({ error: 'Username and password are required' })
    }

    // Get user from MongoDB by username field (not _id)
    const dbUser = await db.users.getByUsername(username)
    
    if (!dbUser) {
      console.log('[Auth] User not found in MongoDB:', username)
      return res.status(401).json({ error: 'Username not found. Please check your username or sign up.' })
    }

    const hashedPassword = hashPassword(password)
    
    if (dbUser.password !== hashedPassword) {
      console.log('[Auth] Password mismatch for user:', username)
      return res.status(401).json({ error: 'Invalid password. Please check your password and try again.' })
    }

    // Use the actual _id (UUID for new users, username for legacy users)
    const userId = dbUser._id

    // Update last active and timezone in MongoDB
    const loginDate = new Date()
    const updateFields = { lastActiveAt: loginDate }
    if (timezone) updateFields.timezone = timezone
    await db.users.update(userId, updateFields)
    
    // Load user + usage data from MongoDB into cache (source of truth)
    const [userData, userUsageData] = await Promise.all([
      getUserFromDb(userId),
      getUserUsageFromDb(userId),
    ])
    // Update lastActiveAt and timezone from this login
    if (userData) {
      userData.lastActiveAt = loginDate.toISOString()
      if (timezone) userData.timezone = timezone
      usersCache[userId] = userData
    }
    
    const userTz = timezone || dbUser.timezone || null
    const loginDateStr = getTodayForUser(userTz)
    if (userUsageData) {
      userUsageData.lastActiveAt = loginDateStr
      usageCache[userId] = userUsageData
    }
    
    console.log('[Auth] Successful sign in for user:', username, '(id:', userId, ')')
    
    // Check if this user still needs email verification
    const needsVerification = dbUser.subscriptionStatus === 'pending_verification' && !dbUser.emailVerified
    
    res.json({
      success: true,
      requiresVerification: needsVerification,
      user: {
        id: dbUser._id,
        firstName: dbUser.firstName,
        lastName: dbUser.lastName,
        username: dbUser.username,
        email: dbUser.email,
        subscriptionStatus: dbUser.subscriptionStatus || 'inactive',
        subscriptionRenewalDate: dbUser.subscriptionRenewalDate || null,
        emailVerified: dbUser.emailVerified || false,
        plan: dbUser.plan || null,
        modelPreferences: dbUser.modelPreferences || null,
      },
    })
  } catch (error) {
    console.error('[Auth] Sign in error:', error)
    res.status(500).json({ error: 'An error occurred during sign in. Please try again.' })
  }
})

// Update user timezone (called on app mount for already-logged-in users)
app.post('/api/auth/update-timezone', async (req, res) => {
  try {
    const { userId, timezone } = req.body
    if (!userId || !timezone) {
      return res.status(400).json({ error: 'userId and timezone are required' })
    }
    // Ensure user is in cache (handles Vercel cold start)
    await ensureUserInCache(userId)
    // Update in MongoDB
    await db.users.update(userId, { timezone })
    // Update in cache
    const users = readUsers()
    if (users[userId]) {
      users[userId].timezone = timezone
      usersCache = users
    }
    res.json({ success: true })
  } catch (error) {
    console.error('[Auth] Update timezone error:', error)
    res.status(500).json({ error: 'Failed to update timezone' })
  }
})

// ============================================================================
// FORGOT USERNAME / FORGOT PASSWORD
// ============================================================================

// Forgot Username — looks up username by email, sends it via email
app.post('/api/auth/forgot-username', async (req, res) => {
  try {
    const { email } = req.body
    if (!email) {
      return res.status(400).json({ error: 'Email is required' })
    }

    console.log('[Auth] Forgot username request for email:', email)

    // Look up user by email
    const dbUser = await db.users.getByEmail(email.toLowerCase().trim())

    // Always return success (don't reveal whether the email exists)
    if (!dbUser) {
      console.log('[Auth] No user found for email:', email)
      return res.json({ success: true, message: 'If an account exists with that email, your username has been sent.' })
    }

    // Send email with username
    try {
      if (!resend) {
        console.error('[Auth] Resend not configured — cannot send email')
        return res.status(500).json({ error: 'Email service not configured' })
      }
      await resend.emails.send({
        from: FROM_EMAIL,
        to: dbUser.email,
        subject: `${APP_NAME} — Your Username`,
        html: `
          <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 500px; margin: 0 auto; padding: 40px 20px;">
            <h2 style="color: #333; margin-bottom: 24px;">Username Reminder</h2>
            <p style="color: #555; font-size: 16px; line-height: 1.6;">
              Hi ${dbUser.firstName || 'there'},
            </p>
            <p style="color: #555; font-size: 16px; line-height: 1.6;">
              You requested your username for your ${APP_NAME} account. Here it is:
            </p>
            <div style="background: #f0f4f8; border-radius: 8px; padding: 20px; text-align: center; margin: 24px 0;">
              <p style="font-size: 24px; font-weight: bold; color: #1a1a2e; margin: 0;">${dbUser.username}</p>
            </div>
            <p style="color: #555; font-size: 16px; line-height: 1.6;">
              If you didn't request this, you can safely ignore this email.
            </p>
            <hr style="border: none; border-top: 1px solid #eee; margin: 32px 0;" />
            <p style="color: #999; font-size: 13px;">
              This email was sent by ${APP_NAME}. Please do not reply to this email.
            </p>
          </div>
        `,
      })
      console.log('[Auth] Username reminder email sent to:', dbUser.email)
    } catch (emailErr) {
      console.error('[Auth] Failed to send username email:', emailErr)
      return res.status(500).json({ error: 'Failed to send email. Please try again later.' })
    }

    res.json({ success: true, message: 'If an account exists with that email, your username has been sent.' })
  } catch (error) {
    console.error('[Auth] Forgot username error:', error)
    res.status(500).json({ error: 'An error occurred. Please try again.' })
  }
})

// Forgot Password — generates a reset token, sends reset link via email
app.post('/api/auth/forgot-password', async (req, res) => {
  try {
    const { email } = req.body
    if (!email) {
      return res.status(400).json({ error: 'Email is required' })
    }

    console.log('[Auth] Forgot password request for email:', email)

    const dbUser = await db.users.getByEmail(email.toLowerCase().trim())

    // Always return success (don't reveal whether the email exists)
    if (!dbUser) {
      console.log('[Auth] No user found for email:', email)
      return res.json({ success: true, message: 'If an account exists with that email, a reset link has been sent.' })
    }

    // Generate a secure random token (64 hex chars)
    const resetToken = crypto.randomBytes(32).toString('hex')
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000) // 1 hour from now

    // Store token in memory and MongoDB
    passwordResetTokens.set(resetToken, {
      userId: dbUser._id,
      email: dbUser.email,
      expiresAt,
    })

    // Also persist to MongoDB (in case server restarts)
    try {
      const dbInstance = await db.getDb()
      await dbInstance.collection('password_resets').insertOne({
        token: resetToken,
        userId: dbUser._id,
        email: dbUser.email,
        expiresAt,
        createdAt: new Date(),
        used: false,
      })
    } catch (dbErr) {
      console.error('[Auth] Error persisting reset token to DB:', dbErr)
      // Continue anyway — in-memory token still works
    }

    // Build the reset link (frontend will handle the #reset-password route)
    const resetLink = `${APP_URL}/#reset-password?token=${resetToken}`

    // Send email with reset link
    try {
      if (!resend) {
        console.error('[Auth] Resend not configured — cannot send email')
        return res.status(500).json({ error: 'Email service not configured' })
      }
      await resend.emails.send({
        from: FROM_EMAIL,
        to: dbUser.email,
        subject: `${APP_NAME} — Reset Your Password`,
        html: `
          <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 500px; margin: 0 auto; padding: 40px 20px;">
            <h2 style="color: #333; margin-bottom: 24px;">Reset Your Password</h2>
            <p style="color: #555; font-size: 16px; line-height: 1.6;">
              Hi ${dbUser.firstName || 'there'},
            </p>
            <p style="color: #555; font-size: 16px; line-height: 1.6;">
              We received a request to reset the password for your ${APP_NAME} account (<strong>${dbUser.username}</strong>).
            </p>
            <p style="color: #555; font-size: 16px; line-height: 1.6;">
              Click the button below to set a new password. This link expires in <strong>1 hour</strong>.
            </p>
            <div style="text-align: center; margin: 32px 0;">
              <a href="${resetLink}" style="display: inline-block; padding: 14px 32px; background: linear-gradient(135deg, #5dade2, #48c9b0); color: #000; font-weight: bold; font-size: 16px; text-decoration: none; border-radius: 8px;">
                Reset Password
              </a>
            </div>
            <p style="color: #888; font-size: 14px; line-height: 1.6;">
              If the button doesn't work, copy and paste this link into your browser:
            </p>
            <p style="color: #5dade2; font-size: 13px; word-break: break-all;">
              ${resetLink}
            </p>
            <hr style="border: none; border-top: 1px solid #eee; margin: 32px 0;" />
            <p style="color: #999; font-size: 13px;">
              If you didn't request a password reset, you can safely ignore this email. Your password will remain unchanged.
            </p>
            <p style="color: #999; font-size: 13px;">
              This email was sent by ${APP_NAME}. Please do not reply to this email.
            </p>
          </div>
        `,
      })
      console.log('[Auth] Password reset email sent to:', dbUser.email)
    } catch (emailErr) {
      console.error('[Auth] Failed to send reset email:', emailErr)
      return res.status(500).json({ error: 'Failed to send email. Please try again later.' })
    }

    res.json({ success: true, message: 'If an account exists with that email, a reset link has been sent.' })
  } catch (error) {
    console.error('[Auth] Forgot password error:', error)
    res.status(500).json({ error: 'An error occurred. Please try again.' })
  }
})

// Reset Password — verify token and set new password
app.post('/api/auth/reset-password', async (req, res) => {
  try {
    const { token, newPassword } = req.body

    if (!token || !newPassword) {
      return res.status(400).json({ error: 'Token and new password are required' })
    }

    if (newPassword.length < 8) {
      return res.status(400).json({ error: 'Password must be at least 8 characters' })
    }

    console.log('[Auth] Password reset attempt with token:', token.substring(0, 8) + '...')

    // Check in-memory first
    let tokenData = passwordResetTokens.get(token)

    // If not in memory, check MongoDB (server may have restarted)
    if (!tokenData) {
      try {
        const dbInstance = await db.getDb()
        const dbToken = await dbInstance.collection('password_resets').findOne({ token, used: false })
        if (dbToken) {
          tokenData = {
            userId: dbToken.userId,
            email: dbToken.email,
            expiresAt: dbToken.expiresAt,
          }
        }
      } catch (dbErr) {
        console.error('[Auth] Error checking reset token in DB:', dbErr)
      }
    }

    if (!tokenData) {
      return res.status(400).json({ error: 'Invalid or expired reset link. Please request a new one.' })
    }

    // Check if token has expired
    if (new Date() > new Date(tokenData.expiresAt)) {
      // Clean up expired token
      passwordResetTokens.delete(token)
      try {
        const dbInstance = await db.getDb()
        await dbInstance.collection('password_resets').deleteOne({ token })
      } catch (dbErr) { /* ignore cleanup errors */ }
      return res.status(400).json({ error: 'This reset link has expired. Please request a new one.' })
    }

    // Update the password
    const hashedPassword = hashPassword(newPassword)
    const userId = tokenData.userId

    // Update in MongoDB
    await db.users.update(userId, { password: hashedPassword })

    // Update in cache
    const users = readUsers()
    if (users[userId]) {
      users[userId].password = hashedPassword
      usersCache = users
    }

    // Invalidate the token (single-use)
    passwordResetTokens.delete(token)
    try {
      const dbInstance = await db.getDb()
      await dbInstance.collection('password_resets').updateOne({ token }, { $set: { used: true } })
    } catch (dbErr) {
      console.error('[Auth] Error marking token as used:', dbErr)
    }

    console.log('[Auth] Password successfully reset for user:', userId)
    res.json({ success: true, message: 'Your password has been reset. You can now sign in with your new password.' })
  } catch (error) {
    console.error('[Auth] Reset password error:', error)
    res.status(500).json({ error: 'An error occurred. Please try again.' })
  }
})

// Cleanup expired reset tokens (runs every hour)
setInterval(async () => {
  const now = new Date()
  let cleaned = 0
  for (const [token, data] of passwordResetTokens.entries()) {
    if (now > new Date(data.expiresAt)) {
      passwordResetTokens.delete(token)
      cleaned++
    }
  }
  // Also clean MongoDB
  try {
    const dbInstance = await db.getDb()
    const result = await dbInstance.collection('password_resets').deleteMany({
      $or: [
        { expiresAt: { $lt: now } },
        { used: true },
      ]
    })
    cleaned += result.deletedCount || 0
  } catch (err) { /* ignore cleanup errors */ }
  if (cleaned > 0) console.log(`[Auth] Cleaned up ${cleaned} expired/used reset tokens`)
  
  // Also clean email verification tokens
  let emailCleaned = 0
  for (const [token, data] of emailVerificationTokens.entries()) {
    if (now > new Date(data.expiresAt)) {
      emailVerificationTokens.delete(token)
      emailCleaned++
    }
  }
  try {
    const dbInstance = await db.getDb()
    const result = await dbInstance.collection('email_verifications').deleteMany({
      $or: [
        { expiresAt: { $lt: now } },
        { used: true },
      ]
    })
    emailCleaned += result.deletedCount || 0
  } catch (err) { /* ignore cleanup errors */ }
  if (emailCleaned > 0) console.log(`[Auth] Cleaned up ${emailCleaned} expired/used email verification tokens`)
}, 60 * 60 * 1000) // Every hour

// ============================================================================
// EMAIL VERIFICATION
// ============================================================================

// Verify email — handles both free trial (needs phone next) and pro (goes to payment)
app.post('/api/auth/verify-email', async (req, res) => {
  try {
    const { token } = req.body

    if (!token) {
      return res.status(400).json({ error: 'Verification token is required' })
    }

    console.log('[Auth] Email verification attempt with token:', token.substring(0, 8) + '...')

    // Check in-memory first
    let tokenData = emailVerificationTokens.get(token)

    // If not in memory, check MongoDB (server may have restarted)
    if (!tokenData) {
      try {
        const dbInstance = await db.getDb()
        const dbToken = await dbInstance.collection('email_verifications').findOne({ token, used: false })
        if (dbToken) {
          tokenData = {
            userId: dbToken.userId,
            email: dbToken.email,
            expiresAt: dbToken.expiresAt,
          }
        }
      } catch (dbErr) {
        console.error('[Auth] Error checking verification token in DB:', dbErr)
      }
    }

    if (!tokenData) {
      return res.status(400).json({ error: 'Invalid or expired verification link. Please request a new one.' })
    }

    // Check if token has expired
    if (new Date() > new Date(tokenData.expiresAt)) {
      emailVerificationTokens.delete(token)
      try {
        const dbInstance = await db.getDb()
        await dbInstance.collection('email_verifications').deleteOne({ token })
      } catch (dbErr) { /* ignore cleanup errors */ }
      return res.status(400).json({ error: 'This verification link has expired. Please request a new one.' })
    }

    const userId = tokenData.userId

    // Get the user to check their plan
    const dbUser = await db.users.get(userId)
    if (!dbUser) {
      return res.status(400).json({ error: 'User not found.' })
    }

    const isFreeTrial = dbUser.plan === 'free_trial'

    if (isFreeTrial) {
      // FREE TRIAL: Email verified → activate trial immediately
      const freeTrialCredits = 0.50

      await db.users.update(userId, {
        emailVerified: true,
        subscriptionStatus: 'trialing',
        subscriptionStartedDate: new Date(),
      })

      // Update cache — ensure user is in cache even if server restarted
      const users = readUsers()
      if (!users[userId]) {
        users[userId] = {
          id: dbUser._id, firstName: dbUser.firstName, lastName: dbUser.lastName,
          username: dbUser.username, email: dbUser.email, canonicalEmail: dbUser.canonicalEmail || null,
          password: dbUser.password, createdAt: dbUser.createdAt?.toISOString?.() || dbUser.createdAt,
          stripeCustomerId: dbUser.stripeCustomerId || null, stripeSubscriptionId: dbUser.stripeSubscriptionId || null,
          subscriptionStatus: 'trialing', subscriptionRenewalDate: dbUser.subscriptionRenewalDate || null,
          subscriptionStartedDate: new Date().toISOString(), subscriptionPausedDate: null,
          cancellationHistory: dbUser.cancellationHistory || [], lastActiveAt: null,
          monthlyUsageCost: {}, monthlyOverageBilled: {},
          plan: dbUser.plan || 'free_trial', emailVerified: true,
          timezone: dbUser.timezone || null, signupIp: dbUser.signupIp || null,
          deviceFingerprint: dbUser.deviceFingerprint || null,
          bio: dbUser.bio || '', profileImage: dbUser.profileImage || null,
          isAnonymous: dbUser.isAnonymous || false, isPrivate: dbUser.isPrivate || false,
          followers: dbUser.followers || [], following: dbUser.following || [],
          followRequests: dbUser.followRequests || [], sentFollowRequests: dbUser.sentFollowRequests || [],
        }
        console.log('[Auth] Added missing user to cache during verify-email:', userId)
      } else {
        users[userId].emailVerified = true
        users[userId].subscriptionStatus = 'trialing'
        users[userId].subscriptionStartedDate = new Date().toISOString()
      }
      writeUsers(users, userId)

      // Grant free trial credits
      const usage = readUsage()
      if (!usage[userId]) {
        usage[userId] = {
          totalTokens: 0, totalInputTokens: 0, totalOutputTokens: 0,
          totalQueries: 0, totalPrompts: 0, monthlyUsage: {}, dailyUsage: {},
          providers: {}, models: {}, promptHistory: [], categories: {}, categoryPrompts: {},
          ratings: {}, lastActiveAt: null, streakDays: 0, judgeConversationContext: [],
          purchasedCredits: { total: freeTrialCredits, remaining: freeTrialCredits },
        }
      } else {
        usage[userId].purchasedCredits = { total: freeTrialCredits, remaining: freeTrialCredits }
      }
      usageCache = usage
      scheduleUsageSync(userId)

      // Invalidate the token (single-use)
      emailVerificationTokens.delete(token)
      try {
        const dbInstance = await db.getDb()
        await dbInstance.collection('email_verifications').updateOne({ token }, { $set: { used: true } })
      } catch (dbErr) {
        console.error('[Auth] Error marking verification token as used:', dbErr)
      }

      console.log('[Auth] ✅ Email verified + free trial activated for user:', userId)
      res.json({
        success: true,
        message: 'Email verified! Your free trial is now active.',
        user: {
          id: dbUser._id,
          firstName: dbUser.firstName,
          lastName: dbUser.lastName,
          username: dbUser.username,
          email: dbUser.email,
          subscriptionStatus: 'trialing',
          subscriptionRenewalDate: null,
          emailVerified: true,
          plan: 'free_trial',
          modelPreferences: dbUser.modelPreferences || null,
        },
      })
    } else {
      // PRO PLAN: Email verified → go to payment (status becomes inactive)
      await db.users.update(userId, {
        emailVerified: true,
        subscriptionStatus: 'inactive',
      })

      // Update cache — ensure user is in cache even if server restarted
      const users = readUsers()
      if (!users[userId]) {
        users[userId] = {
          id: dbUser._id, firstName: dbUser.firstName, lastName: dbUser.lastName,
          username: dbUser.username, email: dbUser.email, canonicalEmail: dbUser.canonicalEmail || null,
          password: dbUser.password, createdAt: dbUser.createdAt?.toISOString?.() || dbUser.createdAt,
          stripeCustomerId: dbUser.stripeCustomerId || null, stripeSubscriptionId: dbUser.stripeSubscriptionId || null,
          subscriptionStatus: 'inactive', subscriptionRenewalDate: dbUser.subscriptionRenewalDate || null,
          subscriptionStartedDate: null, subscriptionPausedDate: null,
          cancellationHistory: dbUser.cancellationHistory || [], lastActiveAt: null,
          monthlyUsageCost: {}, monthlyOverageBilled: {},
          plan: dbUser.plan || null, emailVerified: true,
          timezone: dbUser.timezone || null, signupIp: dbUser.signupIp || null,
          deviceFingerprint: dbUser.deviceFingerprint || null,
          bio: dbUser.bio || '', profileImage: dbUser.profileImage || null,
          isAnonymous: dbUser.isAnonymous || false, isPrivate: dbUser.isPrivate || false,
          followers: dbUser.followers || [], following: dbUser.following || [],
          followRequests: dbUser.followRequests || [], sentFollowRequests: dbUser.sentFollowRequests || [],
        }
        console.log('[Auth] Added missing user to cache during verify-email (pro):', userId)
      } else {
        users[userId].emailVerified = true
        users[userId].subscriptionStatus = 'inactive'
      }
      writeUsers(users, userId)

      // Invalidate the token (single-use)
      emailVerificationTokens.delete(token)
      try {
        const dbInstance = await db.getDb()
        await dbInstance.collection('email_verifications').updateOne({ token }, { $set: { used: true } })
      } catch (dbErr) {
        console.error('[Auth] Error marking verification token as used:', dbErr)
      }

      console.log('[Auth] ✅ Email verified for pro user (ready for payment):', userId)
      res.json({
        success: true,
        message: 'Email verified! Setting up your account...',
        user: {
          id: dbUser._id,
          firstName: dbUser.firstName,
          lastName: dbUser.lastName,
          username: dbUser.username,
          email: dbUser.email,
          subscriptionStatus: 'inactive',
          subscriptionRenewalDate: null,
          emailVerified: true,
          plan: 'pro',
          modelPreferences: dbUser.modelPreferences || null,
        },
      })
    }
  } catch (error) {
    console.error('[Auth] Email verification error:', error)
    res.status(500).json({ error: 'An error occurred. Please try again.' })
  }
})

// Check verification status — used by the verification-pending page to poll for completion
// When email is verified, returns full user data so the client can auto-login
app.post('/api/auth/check-verification', async (req, res) => {
  try {
    const { userId } = req.body

    if (!userId) {
      return res.status(400).json({ error: 'User ID is required' })
    }

    const dbUser = await db.users.get(userId)
    if (!dbUser) {
      return res.status(404).json({ error: 'User not found' })
    }

    // If email is not yet verified, return pending status
    if (!dbUser.emailVerified || dbUser.subscriptionStatus === 'pending_verification') {
      return res.json({ success: true, verified: false })
    }

    // Email is verified — return full user data for auto-login
    console.log('[Auth] Verification poll: user', userId, 'is verified, returning user data for auto-login')

    // Load user + usage from MongoDB into cache for subsequent API calls
    const loginDate = new Date()
    await db.users.update(userId, { lastActiveAt: loginDate })
    await Promise.all([
      getUserFromDb(userId),
      getUserUsageFromDb(userId),
    ])

    res.json({
      success: true,
      verified: true,
      user: {
        id: dbUser._id,
        firstName: dbUser.firstName,
        lastName: dbUser.lastName,
        username: dbUser.username,
        email: dbUser.email,
        subscriptionStatus: dbUser.subscriptionStatus || 'inactive',
        subscriptionRenewalDate: dbUser.subscriptionRenewalDate || null,
        emailVerified: dbUser.emailVerified || false,
        plan: dbUser.plan || null,
        modelPreferences: dbUser.modelPreferences || null,
      },
    })
  } catch (error) {
    console.error('[Auth] Check verification error:', error)
    res.status(500).json({ error: 'An error occurred. Please try again.' })
  }
})

// Resend verification email
app.post('/api/auth/resend-verification', async (req, res) => {
  try {
    const { userId, email } = req.body

    if (!userId && !email) {
      return res.status(400).json({ error: 'userId or email is required' })
    }

    // Find the user
    let user
    if (userId) {
      user = await db.users.get(userId)
    } else {
      user = await db.users.getByEmail(email.toLowerCase().trim())
    }

    if (!user) {
      // Don't reveal whether user exists
      return res.json({ success: true, message: 'If an account exists, a new verification email has been sent.' })
    }

    // Only resend for users pending verification
    if (user.emailVerified || user.subscriptionStatus !== 'pending_verification') {
      return res.status(400).json({ error: 'This account is already verified.' })
    }

    // Rate limit: max 1 resend per 2 minutes
    const dbInstance = await db.getDb()
    const recentToken = await dbInstance.collection('email_verifications').findOne({
      userId: user._id,
      createdAt: { $gt: new Date(Date.now() - 2 * 60 * 1000) }, // Last 2 minutes
      used: false,
    })
    if (recentToken) {
      return res.status(429).json({ error: 'Please wait a couple minutes before requesting another verification email.' })
    }

    // Invalidate old tokens for this user
    await dbInstance.collection('email_verifications').updateMany(
      { userId: user._id, used: false },
      { $set: { used: true } }
    )

    // Generate new token
    const verifyToken = crypto.randomBytes(32).toString('hex')
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000) // 24 hours

    emailVerificationTokens.set(verifyToken, { userId: user._id, email: user.email, expiresAt })
    await dbInstance.collection('email_verifications').insertOne({
      token: verifyToken,
      userId: user._id,
      email: user.email,
      expiresAt,
      createdAt: new Date(),
      used: false,
    })

    // Send verification email
    const verifyLink = `${APP_URL}/#verify-email?token=${verifyToken}`
    if (resend) {
      await resend.emails.send({
        from: FROM_EMAIL,
        to: user.email,
        subject: `${APP_NAME} — Verify Your Email`,
        html: `
          <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 500px; margin: 0 auto; padding: 40px 20px;">
            <h2 style="color: #333; margin-bottom: 24px;">Verify Your Email</h2>
            <p style="color: #555; font-size: 16px; line-height: 1.6;">
              Hi ${user.firstName || 'there'},
            </p>
            <p style="color: #555; font-size: 16px; line-height: 1.6;">
              Here's a new verification link for your ${APP_NAME} account.
            </p>
            <div style="text-align: center; margin: 32px 0;">
              <a href="${verifyLink}" style="display: inline-block; padding: 14px 32px; background: linear-gradient(135deg, #5dade2, #48c9b0); color: #000; font-weight: bold; font-size: 16px; text-decoration: none; border-radius: 8px;">
                Verify Email Address
              </a>
            </div>
            <p style="color: #888; font-size: 14px;">This link expires in 24 hours.</p>
            <hr style="border: none; border-top: 1px solid #eee; margin: 32px 0;" />
            <p style="color: #999; font-size: 13px;">
              If you didn't sign up for ${APP_NAME}, you can safely ignore this email.
            </p>
          </div>
        `,
      })
      console.log('[Auth] Resent verification email to:', user.email)
    }

    res.json({ success: true, message: 'A new verification email has been sent.' })
  } catch (error) {
    console.error('[Auth] Resend verification error:', error)
    res.status(500).json({ error: 'An error occurred. Please try again.' })
  }
})

// Track a prompt submission
app.post('/api/stats/prompt', async (req, res) => {
  try {
    const { userId } = req.body

    if (!userId) {
      console.log('[Prompt Tracking] Missing userId in request')
      return res.status(400).json({ error: 'userId is required' })
    }

    const { promptText, category, responses, summary, facts, sources, promptMode } = req.body
    console.log('[Prompt Tracking] Received prompt tracking request for user:', userId, 'category:', category, 'mode:', promptMode || 'general')
    console.log('[Prompt Tracking] Additional data:', {
      hasResponses: !!responses,
      responseCount: responses?.length || 0,
      hasSummary: !!summary,
      hasFacts: !!facts,
      factsCount: facts?.length || 0,
      hasSources: !!sources,
      sourcesCount: sources?.length || 0,
    })
    await trackPrompt(userId, promptText, category, { responses, summary, facts, sources, promptMode })
    console.log('[Prompt Tracking] Prompt tracking completed for user:', userId)
    
    // CRITICAL: Flush to MongoDB IMMEDIATELY (not debounced).
    // On Vercel serverless, the 2-second debounced timer may never fire because
    // the instance is frozen after the response is sent. Flushing here ensures
    // all token/prompt data from this entire prompt lifecycle persists to MongoDB.
    if (usageDirtyUsers.size > 0) {
      console.log(`[Prompt Tracking] Flushing ${usageDirtyUsers.size} dirty user(s) to MongoDB immediately...`)
      await flushUsageToMongo()
      console.log('[Prompt Tracking] MongoDB flush complete')
    }
    
    res.json({ success: true, message: 'Prompt tracked' })
  } catch (error) {
    console.error('[Prompt Tracking] Error in prompt tracking endpoint:', error)
    res.status(500).json({ error: 'Failed to track prompt' })
  }
})

// DEPRECATED: Token counting is now handled entirely by the backend in trackUsage().
// This endpoint is kept as a no-op so old cached frontend versions don't break.
app.post('/api/stats/token-update', async (req, res) => {
  res.json({ success: true, message: 'no-op — tokens are now tracked server-side in trackUsage()' })
})

// Update model pricing
app.post('/api/stats/pricing', (req, res) => {
  const { userId, provider, model, pricing } = req.body

  if (!userId || !provider || !model || pricing === undefined) {
    return res.status(400).json({ error: 'userId, provider, model, and pricing are required' })
  }

  const usage = readUsage()
  if (!usage[userId]) {
    return res.status(404).json({ error: 'User not found' })
  }

  const modelKey = `${provider}-${model}`
  if (!usage[userId].models[modelKey]) {
    // Initialize model if it doesn't exist
    usage[userId].models[modelKey] = {
      totalTokens: 0,
      totalQueries: 0,
      provider: provider,
      model: model,
      pricing: null,
    }
  }

  usage[userId].models[modelKey].pricing = pricing
  writeUsage(usage)

  res.json({ success: true, message: 'Pricing updated' })
})

// Delete user account
app.delete('/api/auth/account', async (req, res) => {
  try {
    const { userId } = req.body

    if (!userId) {
      return res.status(400).json({ error: 'userId is required' })
    }

    console.log('[Account Deletion] Received delete request for user:', userId)

    // Check if user exists in MongoDB
    const dbUser = await db.users.get(userId)
    if (!dbUser) {
      console.log('[Account Deletion] User not found in MongoDB:', userId)
      return res.status(404).json({ error: 'User not found' })
    }

    // Store user info for logging before deletion
    const userInfo = { username: dbUser.username, email: dbUser.email }

    // Preserve free trial abuse prevention data before deletion
    if (dbUser.plan === 'free_trial') {
      await db.users.recordUsedTrial({
        canonicalEmail: dbUser.canonicalEmail || dbUser.email,
        email: dbUser.email,
        signupIp: dbUser.signupIp || null,
        deviceFingerprint: dbUser.deviceFingerprint || null,
      })
      console.log(`[Account Deletion] Recorded used free trial for abuse prevention: ${dbUser.email}`)
    }

    // Cancel Stripe subscription if active
    if (dbUser.stripeSubscriptionId) {
      try {
        await stripe.subscriptions.cancel(dbUser.stripeSubscriptionId)
        console.log(`[Account Deletion] Stripe subscription canceled for user: ${userId}`)
      } catch (stripeError) {
        console.error('[Account Deletion] Error canceling Stripe subscription (may already be canceled):', stripeError.message)
      }
    }

    // Delete the Stripe customer record entirely (removes from Stripe dashboard)
    if (dbUser.stripeCustomerId) {
      try {
        await stripe.customers.del(dbUser.stripeCustomerId)
        console.log(`[Account Deletion] Stripe customer deleted for user: ${userId}`)
      } catch (stripeError) {
        console.error('[Account Deletion] Error deleting Stripe customer:', stripeError.message)
      }
    }

    // Prevent background flushes from re-creating this user's data in MongoDB
    usageDirtyUsers.delete(userId)
    deletedUserIds.add(userId)

    // Clear from cache BEFORE deleting from MongoDB so no flush can re-write
    delete usersCache[userId]
    delete usageCache[userId]

    // Delete user and ALL associated data from MongoDB (covers every collection)
    await db.users.delete(userId)
    console.log('[Account Deletion] User and all data deleted from MongoDB:', userId, userInfo)

    // Purge all user traces from leaderboard (posts, likes, comments, replies)
    await purgeUserFromLeaderboard(userId)
    console.log('[Account Deletion] User purged from leaderboard cache and MongoDB')

    // Increment deleted users count
    await incrementDeletedUsers()
    console.log('[Account Deletion] Deleted users count incremented')
    
    console.log('[Account Deletion] Account completely removed from MongoDB')
    res.json({ success: true, message: 'Account deleted successfully' })
  } catch (error) {
    console.error('[Account Deletion] Error deleting account:', error)
    res.status(500).json({ error: 'Failed to delete account' })
  }
})

// ============================================================================
// MODEL PREFERENCES — Save/Load user's selected models & Auto Smart state
// ============================================================================

// Save model preferences
app.put('/api/user/model-preferences', async (req, res) => {
  try {
    const { userId, selectedModels, autoSmartProviders } = req.body
    if (!userId) return res.status(400).json({ error: 'userId is required' })

    await ensureUserInCache(userId)
    const users = readUsers()
    if (!users[userId]) return res.status(404).json({ error: 'User not found' })

    // Save to user cache
    users[userId].modelPreferences = {
      selectedModels: selectedModels || [],
      autoSmartProviders: autoSmartProviders || {},
      updatedAt: new Date().toISOString(),
    }
    writeUsers(users, userId)

    res.json({ success: true })
  } catch (error) {
    console.error('[Model Preferences] Error saving:', error)
    res.status(500).json({ error: 'Failed to save model preferences' })
  }
})

// Load model preferences
app.get('/api/user/model-preferences/:userId', async (req, res) => {
  try {
    const { userId } = req.params
    await ensureUserInCache(userId)
    const users = readUsers()
    if (!users[userId]) return res.status(404).json({ error: 'User not found' })

    const prefs = users[userId].modelPreferences || null
    res.json({ modelPreferences: prefs })
  } catch (error) {
    console.error('[Model Preferences] Error loading:', error)
    res.status(500).json({ error: 'Failed to load model preferences' })
  }
})

// Get user statistics
app.get('/api/stats/:userId', async (req, res) => {
  const { userId } = req.params

  // Read ALL data directly from MongoDB (source of truth)
  const [user, userUsage] = await Promise.all([
    getUserFromDb(userId),
    getUserUsageFromDb(userId),
  ])
  
  // Use user's timezone for date calculations
  const tz = getUserTimezone(userId)

  const currentMonth = getMonthForUser(tz)
  const monthlyStats = (userUsage.monthlyUsage || {})[currentMonth] || { tokens: 0, inputTokens: 0, outputTokens: 0, queries: 0, prompts: 0 }

  // Calculate provider stats with monthly breakdown
  const providerStats = {}
  Object.keys(userUsage.providers || {}).forEach((provider) => {
    const providerData = userUsage.providers[provider]
    // Calculate total prompts for this provider by summing all model prompts
    let totalPrompts = 0
    Object.keys(userUsage.models || {}).forEach((modelKey) => {
      if (modelKey.startsWith(`${provider}-`)) {
        totalPrompts += (userUsage.models[modelKey].totalPrompts || 0)
      }
    })
    
    providerStats[provider] = {
      totalTokens: (providerData.totalInputTokens || 0) + (providerData.totalOutputTokens || 0),
      totalInputTokens: providerData.totalInputTokens || 0,
      totalOutputTokens: providerData.totalOutputTokens || 0,
      totalPrompts: totalPrompts,
      monthlyTokens: (providerData.monthlyInputTokens?.[currentMonth] || 0) + (providerData.monthlyOutputTokens?.[currentMonth] || 0),
      monthlyInputTokens: providerData.monthlyInputTokens?.[currentMonth] || 0,
      monthlyOutputTokens: providerData.monthlyOutputTokens?.[currentMonth] || 0,
    }
  })

  // Calculate model stats
  const modelStats = {}
  Object.keys(userUsage.models || {}).forEach((modelKey) => {
    modelStats[modelKey] = {
      ...userUsage.models[modelKey],
      totalInputTokens: userUsage.models[modelKey].totalInputTokens || 0,
      totalOutputTokens: userUsage.models[modelKey].totalOutputTokens || 0,
      totalTokens: (userUsage.models[modelKey].totalInputTokens || 0) + (userUsage.models[modelKey].totalOutputTokens || 0), // Recalculate to ensure accuracy (input + output only)
      totalPrompts: userUsage.models[modelKey].totalPrompts || 0,
    }
  })

  // Get user's account creation date
  const createdAt = user?.createdAt || null

  // Calculate monthly cost and remaining free allocation
  // Free trial users only get their $0.50 purchasedCredits — no monthly allocation.
  // Defensive: trialing users with no Stripe subscription are free trial users even if plan field is missing.
  const isFreeTrial = user?.plan === 'free_trial' || (user?.subscriptionStatus === 'trialing' && !user?.stripeSubscriptionId)
  const FREE_MONTHLY_ALLOCATION = isFreeTrial ? 0 : 7.50
  
  // Get the tracked monthly cost from users cache (incremental counter)
  let cachedMonthlyCost = user?.monthlyUsageCost?.[currentMonth] || 0
  
  // Get pricing data and daily usage for the daily breakdown chart
  const pricing = getPricingData()
  const dailyData = userUsage.dailyUsage?.[currentMonth] || {}
  
  // ALSO calculate monthly cost from daily usage data (ground truth from per-model token counts)
  // This ensures costs are accurate even if the incremental counter got reset/lost
  let calculatedMonthlyCost = 0
  Object.keys(dailyData).forEach((dateStr) => {
    const dayData = dailyData[dateStr]
    if (dayData && dayData.models) {
      Object.keys(dayData.models).forEach((modelKey) => {
        const modelDayData = dayData.models[modelKey]
        const dayInputTokens = modelDayData.inputTokens || 0
        const dayOutputTokens = modelDayData.outputTokens || 0
        calculatedMonthlyCost += calculateModelCost(modelKey, dayInputTokens, dayOutputTokens, pricing)
      })
    }
    // Include Serper query costs
    const dayQueries = dayData?.queries || 0
    if (dayQueries > 0) {
      calculatedMonthlyCost += calculateSerperQueryCost(dayQueries)
    }
  })
  
  // Use the higher of cached vs calculated (handles both counter drift and data gaps)
  let monthlyCost = Math.max(cachedMonthlyCost, calculatedMonthlyCost)
  
  // If the calculated cost is higher than cached, update the cache + MongoDB for future consistency
  if (calculatedMonthlyCost > cachedMonthlyCost && user) {
    if (!user.monthlyUsageCost) user.monthlyUsageCost = {}
    user.monthlyUsageCost[currentMonth] = calculatedMonthlyCost
    const allUsers = readUsers()
    if (allUsers[userId]) allUsers[userId].monthlyUsageCost = user.monthlyUsageCost
    writeUsers(allUsers, userId)
    console.log(`[Stats] Corrected monthlyUsageCost from $${cachedMonthlyCost.toFixed(6)} to $${calculatedMonthlyCost.toFixed(6)} (from daily data)`)
  }
  
  console.log(`[Stats] Monthly cost for ${userId} in ${currentMonth}: $${monthlyCost.toFixed(4)} (cached: $${cachedMonthlyCost.toFixed(4)}, calculated: $${calculatedMonthlyCost.toFixed(4)})`)
  
  let remainingFreeAllocation = Math.max(0, FREE_MONTHLY_ALLOCATION - monthlyCost)
  
  // Get purchased credits
  let purchasedCredits = userUsage.purchasedCredits || { total: 0, remaining: 0, purchases: [] }
  
  // Calculate how much of the overage should be deducted from purchased credits
  const overage = Math.max(0, monthlyCost - FREE_MONTHLY_ALLOCATION)
  let purchasedCreditsRemaining = purchasedCredits.remaining || 0
  
  // If there's overage, deduct from purchased credits first
  if (overage > 0 && purchasedCreditsRemaining > 0) {
    const deductFromPurchased = Math.min(overage, purchasedCreditsRemaining)
    purchasedCreditsRemaining = purchasedCreditsRemaining - deductFromPurchased
    
    // Update the stored purchased credits if it changed
    if (purchasedCreditsRemaining !== (purchasedCredits.remaining || 0)) {
      userUsage.purchasedCredits = {
        ...purchasedCredits,
        remaining: purchasedCreditsRemaining
      }
      writeUsage(usageCache, userId)
    }
  }
  
  // Total available balance = remaining free allocation + remaining purchased credits
  const totalAvailableBalance = remainingFreeAllocation + purchasedCreditsRemaining
  const totalAllocation = FREE_MONTHLY_ALLOCATION + (purchasedCredits.total || 0)
  
  // Calculate percentage based on what's left vs what was available (free + all purchased ever)
  const usedAmount = monthlyCost
  const freeUsagePercentage = totalAllocation > 0 ? (totalAvailableBalance / (FREE_MONTHLY_ALLOCATION + purchasedCreditsRemaining)) * 100 : 0
  
  // Note: monthlyUsageCost is now tracked incrementally by trackUsage() function
  // No need to update it here - it's already accumulated as usage happens

  // Calculate daily usage with costs and percentages
  // Effective allocation = total budget for the month (spent + remaining).
  // This dynamically adjusts when the user buys extra credits: the denominator
  // increases, so all daily percentages shrink proportionally.
  const effectiveAllocation = monthlyCost + totalAvailableBalance
  const dailyUsage = []
  const { year: tzYear, month: tzMonth } = getUserLocalDate(tz)
  const daysInMonth = new Date(tzYear, tzMonth, 0).getDate()
  
  // Get all days of the current month (in user's local timezone)
  for (let day = 1; day <= daysInMonth; day++) {
    const dateStr = `${tzYear}-${String(tzMonth).padStart(2, '0')}-${String(day).padStart(2, '0')}`
    const dayData = dailyData[dateStr]
    
    if (dayData) {
      // Calculate cost for this day based on models used
      let dayCost = 0
      if (dayData.models) {
        Object.keys(dayData.models).forEach((modelKey) => {
          const modelDayData = dayData.models[modelKey]
          const dayInputTokens = modelDayData.inputTokens || 0
          const dayOutputTokens = modelDayData.outputTokens || 0
          const modelDayCost = calculateModelCost(modelKey, dayInputTokens, dayOutputTokens, pricing)
          dayCost += modelDayCost
        })
      }
      
      // Add Serper query costs for this day
      const dayQueries = dayData.queries || 0
      if (dayQueries > 0) {
        const queryCost = calculateSerperQueryCost(dayQueries)
        dayCost += queryCost
      }
      
      const dayPercentage = effectiveAllocation > 0 ? (dayCost / effectiveAllocation) * 100 : 0
      
      dailyUsage.push({
        date: dateStr,
        day: day,
        cost: dayCost,
        percentage: dayPercentage,
        inputTokens: dayData.inputTokens || 0,
        outputTokens: dayData.outputTokens || 0,
      })
    } else {
      // No usage on this day
      dailyUsage.push({
        date: dateStr,
        day: day,
        cost: 0,
        percentage: 0,
        inputTokens: 0,
        outputTokens: 0,
      })
    }
  }

  // Round all monetary values to 2 decimal places (cents) before sending
  const roundCents = (v) => Math.round((v || 0) * 100) / 100

  // userUsage is already loaded from MongoDB via getUserUsageFromDb
  const totalTokens = userUsage.totalTokens || 0
  const monthlyTokens = monthlyStats.tokens || 0
  const totalPrompts = userUsage.totalPrompts || 0
  const monthlyPrompts = monthlyStats.prompts || 0

  res.json({
    totalTokens: totalTokens,
    totalInputTokens: userUsage.totalInputTokens || 0,
    totalOutputTokens: userUsage.totalOutputTokens || 0,
    totalPrompts: totalPrompts,
    monthlyTokens: monthlyTokens,
    monthlyInputTokens: monthlyStats.inputTokens || 0,
    monthlyOutputTokens: monthlyStats.outputTokens || 0,
    monthlyPrompts: monthlyPrompts,
    monthlyCost: roundCents(monthlyCost),
    freeMonthlyAllocation: FREE_MONTHLY_ALLOCATION,
    remainingFreeAllocation: roundCents(remainingFreeAllocation),
    freeUsagePercentage: Math.round(freeUsagePercentage * 100) / 100,
    totalAvailableBalance: roundCents(totalAvailableBalance),
    effectiveAllocation: roundCents(effectiveAllocation),
    purchasedCredits: {
      total: roundCents(purchasedCredits.total),
      remaining: roundCents(purchasedCreditsRemaining),
      purchaseCount: purchasedCredits.purchases?.length || 0,
      lastPurchase: purchasedCredits.purchases?.[purchasedCredits.purchases.length - 1] || null
    },
    dailyUsage: dailyUsage.map(d => ({ ...d, cost: roundCents(d.cost), percentage: Math.round(d.percentage * 100) / 100 })),
    providers: providerStats,
    models: modelStats,
    categories: userUsage.categories || {},
    ratings: userUsage.ratings || {},
    streakDays: userUsage.streakDays || 0,
    councilPrompts: userUsage.councilPrompts || 0,
    debatePrompts: userUsage.debatePrompts || 0,
    createdAt: createdAt,
    earnedBadges: userUsage.earnedBadges || [],
  })
})

// Save earned badges (permanent — badges can only be added, never removed)
app.post('/api/stats/:userId/badges', (req, res) => {
  const { userId } = req.params
  const { newBadges } = req.body // Array of badge IDs like ["tokens-0", "prompts-1"]
  
  if (!Array.isArray(newBadges) || newBadges.length === 0) {
    return res.json({ success: true, earnedBadges: [] })
  }
  
  const usage = readUsage()
  if (!usage[userId]) {
    return res.status(404).json({ error: 'User not found' })
  }
  
  if (!usage[userId].earnedBadges) {
    usage[userId].earnedBadges = []
  }
  
  // Only add badges that aren't already saved (append-only, never remove)
  const existing = new Set(usage[userId].earnedBadges)
  let added = 0
  for (const badgeId of newBadges) {
    if (!existing.has(badgeId)) {
      usage[userId].earnedBadges.push(badgeId)
      existing.add(badgeId)
      added++
    }
  }
  
  if (added > 0) {
    writeUsage(usage, userId)
    console.log(`[Badges] Saved ${added} new badges for ${userId}. Total: ${usage[userId].earnedBadges.length}`)
  }
  
  res.json({ success: true, earnedBadges: usage[userId].earnedBadges })
})

// Get prompt history (last 10 prompts)
app.get('/api/stats/:userId/history', async (req, res) => {
  const { userId } = req.params
  const userUsage = await getUserUsageFromDb(userId)
  const promptHistory = userUsage.promptHistory || []
  res.json({ prompts: promptHistory.slice(0, 10) })
})

// Clear prompt history
app.delete('/api/stats/:userId/history', (req, res) => {
  const { userId } = req.params
  console.log(`[Clear History] DELETE request received for user: ${userId}`)
  
  const usage = readUsage()
  
  if (!usage[userId]) {
    console.log(`[Clear History] User not found: ${userId}`)
    return res.status(404).json({ error: 'User not found' })
  }
  
  usage[userId].promptHistory = []
  writeUsage(usage)
  
  console.log(`[Clear History] Successfully cleared prompt history for user: ${userId}`)
  res.json({ success: true, message: 'Prompt history cleared' })
})

// Get judge conversation context
// Support both path parameter and query parameter (query parameter handles special characters better)
app.get('/api/judge/context/:userId', (req, res) => {
  try {
    let userId = req.query.userId || req.params.userId
    
    if (!userId || userId === 'undefined') {
      return res.status(400).json({ error: 'userId is required' })
    }
    
    // Decode the userId in case it was URL encoded (handles colons and special characters)
    const decodedUserId = decodeURIComponent(userId)
    
    const usage = readUsage()
    const userUsage = usage[decodedUserId] || {}
    const context = (userUsage.judgeConversationContext || []).slice(0, 5)
    
    res.json({ context })
  } catch (error) {
    console.error('[Judge Context] Error fetching context:', error)
    res.status(500).json({ error: 'Failed to fetch conversation context: ' + error.message })
  }
})

// Also support query-only endpoint for better compatibility
app.get('/api/judge/context', (req, res) => {
  try {
    const userId = req.query.userId
    
    if (!userId) {
      return res.status(400).json({ error: 'userId query parameter is required' })
    }
    
    const decodedUserId = decodeURIComponent(userId)
    
    // Read from in-memory cache (fully synced with MongoDB)
    const usage = readUsage()
    const userUsage = usage[decodedUserId] || {}
    const context = (userUsage.judgeConversationContext || []).slice(0, 5)
    
    res.json({ context })
  } catch (error) {
    console.error('[Judge Context] Error fetching context:', error)
    res.status(500).json({ error: 'Failed to fetch conversation context: ' + error.message })
  }
})

// Clear judge conversation context (called when user starts new prompt or clears)
app.post('/api/judge/clear-context', (req, res) => {
  try {
    const { userId } = req.body
    
    if (!userId) {
      return res.status(400).json({ error: 'userId is required' })
    }
    
    const usage = readUsage()
    if (usage[userId]) {
      usage[userId].judgeConversationContext = []
      writeUsage(usage)
      console.log(`[Judge Context] Cleared context for user ${userId}`)
    }
    
    res.json({ success: true, message: 'Context cleared' })
  } catch (error) {
    console.error('[Judge Context] Error clearing context:', error)
    res.status(500).json({ error: 'Failed to clear conversation context: ' + error.message })
  }
})

// Get model conversation context (per model, per user)
app.get('/api/model/context', (req, res) => {
  try {
    const { userId, modelName } = req.query
    
    if (!userId || !modelName) {
      return res.status(400).json({ error: 'userId and modelName query parameters are required' })
    }
    
    const decodedUserId = decodeURIComponent(userId)
    const decodedModelName = decodeURIComponent(modelName)
    console.log(`[Model Context] Fetching context for userId: ${decodedUserId}, model: ${decodedModelName}`)
    
    const usage = readUsage()
    const userUsage = usage[decodedUserId] || {}
    const allModelContexts = userUsage.modelConversationContext || {}
    const context = (allModelContexts[decodedModelName] || []).slice(0, 5)
    
    console.log(`[Model Context] Found ${context.length} context entries for ${decodedModelName}`)
    res.json({ context })
  } catch (error) {
    console.error('[Model Context] Error fetching context:', error)
    res.status(500).json({ error: 'Failed to fetch model conversation context: ' + error.message })
  }
})

// Clear model conversation context (for a specific model or all models for a user)
app.post('/api/model/clear-context', (req, res) => {
  try {
    const { userId, modelName } = req.body
    
    if (!userId) {
      return res.status(400).json({ error: 'userId is required' })
    }
    
    const usage = readUsage()
    if (usage[userId] && usage[userId].modelConversationContext) {
      if (modelName) {
        // Clear context for a specific model
        delete usage[userId].modelConversationContext[modelName]
        console.log(`[Model Context] Cleared context for model ${modelName}, user ${userId}`)
      } else {
        // Clear all model contexts for this user
        usage[userId].modelConversationContext = {}
        console.log(`[Model Context] Cleared all model contexts for user ${userId}`)
      }
      writeUsage(usage, userId)
    }
    
    res.json({ success: true, message: 'Model context cleared' })
  } catch (error) {
    console.error('[Model Context] Error clearing context:', error)
    res.status(500).json({ error: 'Failed to clear model conversation context: ' + error.message })
  }
})

// Helper function to detect category and determine if search is needed
const detectCategoryForJudge = async (prompt, userId = null) => {
  const todayDate = getCurrentDateStringForUser(userId)
  const categoryPrompt = `Today's date is ${todayDate}.

Classify the user prompt into EXACTLY ONE category from the list below.
Determine if a web search would genuinely help answer the query.
Determine if the user's prompt might benefit from context of their previous conversations (memory).

needsSearch = true when:
- The query asks about current events, recent news, or real-time information
- The query references "today", "this year", "this week", "recently", "right now", "currently", "gonna", or any time-relative language
- The query needs factual verification (specific facts, statistics, dates)
- The query asks about specific people, companies, or events that may have recent updates
- The query asks about weather, prices, scores, or anything that changes frequently
- The query asks about rankings, comparisons, or "who/what is best" in a field that evolves over time (e.g. AI, tech, sports, politics, business)
- The query asks for predictions or opinions about factual/evolving topics (e.g. "who will win the AI race", "what's the best phone right now", "which company is leading in X") — even if phrased as an opinion, the answer depends on current real-world data
- The query mentions specific products, models, tools, or technologies that are actively being updated or released (e.g. AI models, software, hardware, games, etc.)

needsSearch = false ONLY when:
- The query is purely about timeless concepts, explanations, or "how does X work" (e.g. "how does gravity work", "explain recursion")
- The query asks for purely personal/creative content with no factual basis needed (e.g. "write me a poem", "give me life advice")
- The query is about well-established historical knowledge that does NOT change (e.g. "when was the French Revolution", "what is the speed of light")

IMPORTANT: When in doubt, set needsSearch = true. It is much better to search unnecessarily than to miss providing current information. If the topic is even slightly time-sensitive or involves entities that change over time, set needsSearch = true.

needsContext = true when:
- The query references something previously discussed (e.g. "going back to what we talked about", "remember when I asked about", "like I said before", "as we discussed")
- The query is a follow-up or continuation of a topic the user likely discussed before (e.g. "what else should I know about investing" — implies prior investing discussion)
- The query uses pronouns that reference a past topic without naming it (e.g. "tell me more about that", "can you expand on it")

needsContext = false when:
- The query is completely self-contained and does not reference any prior conversation
- The query is a brand new topic with no indication the user has discussed it before
- The query is purely creative or standalone (e.g. "write me a poem about the ocean", "what is 2+2")

Output ONLY this JSON:
{
  "category": "CategoryName",
  "needsSearch": false,
  "needsContext": false
}

Categories:
1 Science
2 Tech
3 Business
4 Health
5 Politics/Law
6 History/Geography
7 Philosophy/Religion
8 Arts/Culture
9 Lifestyle/Self-Improvement
10 General Knowledge/Other

User prompt:
"${prompt}"`

  try {
    const apiKey = API_KEYS.google
    if (!apiKey) {
      throw new Error('Google API key not configured')
    }

    // Use gemini-2.5-flash-lite (same as main page category detection)
    const response = await axios.post(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-lite:generateContent?key=${apiKey}`,
      {
        contents: [{
          parts: [{
            text: categoryPrompt
          }]
        }],
        generationConfig: {
          temperature: 0.3,
          maxOutputTokens: 200
        }
      }
    )
    
    // Track tokens for category detection (pipeline — not shown in per-model stats)
    if (userId) {
      const responseTokens = extractTokensFromResponse(response.data, 'google')
      if (responseTokens) {
        trackUsage(userId, 'google', 'gemini-2.5-flash-lite', responseTokens.inputTokens || 0, responseTokens.outputTokens || 0, true)
      }
    }

    const categoryResponse = response.data.candidates[0].content.parts[0].text.trim()
    const lowerResponse = categoryResponse.toLowerCase()

    // Parse JSON response
    let needsSearch = false
    let needsContext = false
    let category = 'General Knowledge/Other'

    try {
      let jsonContent = categoryResponse
      if (jsonContent.includes('```json')) {
        jsonContent = jsonContent.split('```json')[1].split('```')[0].trim()
      } else if (jsonContent.includes('```')) {
        jsonContent = jsonContent.split('```')[1].split('```')[0].trim()
      }
      
      const parsed = JSON.parse(jsonContent)
      needsSearch = parsed.needsSearch === true
      needsContext = parsed.needsContext === true
      category = parsed.category || 'General Knowledge/Other'
    } catch (parseError) {
      // Fallback: check for keywords
      needsSearch = lowerResponse.includes('"needsSearch":true') || 
                   lowerResponse.includes('needsSearch: true') ||
                   (lowerResponse.includes('yes') && (lowerResponse.includes('search') || lowerResponse.includes('web')))
      needsContext = lowerResponse.includes('"needsContext":true') || 
                    lowerResponse.includes('needsContext: true')
      
      // Determine category from keywords
      if (lowerResponse.includes('science')) category = 'Science'
      else if (lowerResponse.includes('tech') || lowerResponse.includes('technology')) category = 'Tech'
      else if (lowerResponse.includes('business')) category = 'Business'
      else if (lowerResponse.includes('health')) category = 'Health'
      else if (lowerResponse.includes('politics') || lowerResponse.includes('law')) category = 'Politics/Law'
      else if (lowerResponse.includes('history') || lowerResponse.includes('geography')) category = 'History/Geography'
      else if (lowerResponse.includes('philosophy') || lowerResponse.includes('religion')) category = 'Philosophy/Religion'
      else if (lowerResponse.includes('arts') || lowerResponse.includes('culture')) category = 'Arts/Culture'
      else if (lowerResponse.includes('lifestyle') || lowerResponse.includes('self-improvement')) category = 'Lifestyle/Self-Improvement'
    }

    return { category, needsSearch, needsContext }
  } catch (error) {
    console.error('[Category Detection] Error:', error)
    return { category: 'General Knowledge/Other', needsSearch: false, needsContext: false }
  }
}

// Quick endpoint to check if a query needs web search (for showing search indicator)
app.post('/api/detect-search-needed', async (req, res) => {
  try {
    const { query, userId } = req.body
    
    if (!query) {
      return res.status(400).json({ error: 'query is required' })
    }
    
    const { category, needsSearch, needsContext } = await detectCategoryForJudge(query, userId)
    
    res.json({ 
      needsSearch, 
      needsContext,
      category 
    })
  } catch (error) {
    console.error('[Detect Search] Error:', error)
    res.json({ needsSearch: false, category: 'General Knowledge/Other' })
  }
})

// Continue judge conversation with RAG pipeline support
app.post('/api/judge/conversation', async (req, res) => {
  try {
    const { userId, userMessage, conversationContext, originalSummaryText } = req.body
    
    if (!userId || !userMessage) {
      return res.status(400).json({ error: 'userId and userMessage are required' })
    }
    
    // Check subscription status (async — syncs with Stripe if needed)
    const subscriptionCheck = await checkSubscriptionStatusAsync(userId)
    if (!subscriptionCheck.hasAccess) {
      return res.status(403).json({ 
        error: 'Active subscription required. Please subscribe to use this service.',
        subscriptionRequired: true,
        reason: subscriptionCheck.reason
      })
    }
    
    console.log('[Judge Conversation] Processing message with Gemini 3 Flash (conversational mode, with RAG support)')
    
    // Step 1: Detect category and determine if search is needed (using same model as main page)
    const { category, needsSearch, needsContext } = await detectCategoryForJudge(userMessage, userId)
    console.log(`[Judge Conversation] Category: ${category}, Needs Search: ${needsSearch}, Needs Context: ${needsContext}`)
    
    // Step 1.5: Retrieve relevant past conversations via embedding memory
    let memoryContextString = ''
    let memoryContextItems = []
    if (userId) {
      const scoreThreshold = needsContext ? 0.70 : 0.82
      memoryContextItems = await findRelevantContext(userId, userMessage, 3, scoreThreshold)
      memoryContextString = formatMemoryContext(memoryContextItems)
      if (memoryContextString) {
        console.log(`[Judge Conversation] Memory: Injecting ${memoryContextItems.length} past conversations as context`)
      }
    }
    
    // Get last 5 summaries from context — use frontend-provided context only if non-empty
    const usage = readUsage()
    const contextSummaries = (conversationContext && conversationContext.length > 0)
      ? conversationContext
      : (usage[userId]?.judgeConversationContext || []).slice(0, 5)
    
    // Build context string with the user's recent conversation history
    // Position 0 is full response (most recent, highest priority), positions 1-4 are summarized
    let contextString = ''
    if (memoryContextString) {
      contextString += memoryContextString + '\n'
    }
    if (contextSummaries.length > 0) {
      contextString += `Here is context from your recent conversation with this user (most recent first — prioritize the latest context):\n\n${contextSummaries.map((ctx, idx) => {
          const promptPart = ctx.originalPrompt ? `User asked: ${ctx.originalPrompt}\n` : ''
          const responsePart = ctx.isFull && ctx.response 
            ? `Your response: ${ctx.response}`
            : `Your response (summary): ${ctx.summary}`
          return `${idx + 1}. ${promptPart}${responsePart}`
        }).join('\n\n')}\n\n`
    } else if (originalSummaryText && originalSummaryText.trim()) {
      contextString += `Your previous summary response that the user wants to continue discussing:\n${originalSummaryText.substring(0, 3000)}${originalSummaryText.length > 3000 ? '...' : ''}\n\n`
    }
    
    let judgePrompt = ''
    let rawSourcesData = null
    let searchResults = []
    
    // Step 2: If search is needed, search + scrape raw sources (no refiner)
    if (needsSearch) {
      console.log('[Judge Conversation] Search needed, fetching raw sources...')
      
      const serperApiKey = API_KEYS.serper
      if (!serperApiKey) {
        console.warn('[Judge Conversation] Serper API key not configured, skipping search')
      } else {
        try {
          const searchContextSnippet = buildSearchContextSnippet(contextSummaries, originalSummaryText)
          const searchQuery = await reformulateSearchQuery(userMessage, userId, searchContextSnippet)
          const serperData = await performSerperSearch(searchQuery, 5)
          searchResults = (serperData?.organic || []).map(r => ({
            title: r.title,
            link: r.link,
            snippet: r.snippet
          }))
          
          console.log(`[Judge Conversation] Search completed, found ${searchResults.length} results`)
          
          // Scrape raw source content (no refiner LLM)
          if (searchResults.length > 0) {
            rawSourcesData = await formatRawSourcesForPrompt(searchResults, 5)
            console.log(`[Judge Conversation] Raw sources scraped: ${rawSourcesData.sourceCount} sources`)
          }
        } catch (searchError) {
          console.error('[Judge Conversation] Search/scrape error:', searchError)
          // Continue without source data
        }
      }
    }
    
    // Step 3: Build prompt for Gemini (conversational, not judge mode)
    // After the initial judge summary, the user is just talking to Gemini naturally
    const todayDate = getCurrentDateStringForUser(userId)
    if (rawSourcesData && rawSourcesData.sourceCount > 0) {
      judgePrompt = `Today's date is ${todayDate}. You have access to real-time web search — the source content below is current and already retrieved for you. Read and parse it yourself to answer. Do NOT tell the user you cannot search the web.\n\n${contextString}Here is raw content from recent web sources that may help:\n\n${rawSourcesData.formatted}\n\nUser's question: ${userMessage}`
    } else {
      // No search or no sources found, use direct conversational prompt
      judgePrompt = `Today's date is ${todayDate}. You have access to real-time web search. If search results are provided, use them directly. Do NOT tell the user you cannot search the web.\n\n${contextString}User: ${userMessage}`
    }
    
    // Step 4: Call Gemini 3 Flash
    const apiKey = API_KEYS.google
    if (!apiKey) {
      return res.status(500).json({ error: 'Google API key not configured' })
    }
    
    const judgeModel = 'gemini-3-flash'
    const judgeModelApi = 'gemini-3-flash-preview'
    
    const response = await axios.post(
      `https://generativelanguage.googleapis.com/v1beta/models/${judgeModelApi}:generateContent?key=${apiKey}`,
      {
        contents: [{ parts: [{ text: judgePrompt }] }],
      },
      {
        headers: {
          'Content-Type': 'application/json'
        }
      }
    )
    
    const responseText = response.data.candidates[0].content.parts[0].text
    
    // Track usage for Gemini call
    const responseTokens = extractTokensFromResponse(response.data, 'google')
    let inputTokens = 0
    let outputTokens = 0
    
    if (responseTokens) {
      inputTokens = responseTokens.inputTokens || 0
      outputTokens = responseTokens.outputTokens || 0
    } else {
      inputTokens = await countTokens(judgePrompt, 'google', judgeModel)
      outputTokens = await countTokens(responseText, 'google', judgeModel)
    }
    
    // User sees the judge conversation response on screen — NOT pipeline
    trackUsage(userId, 'google', judgeModel, inputTokens, outputTokens, false)
    
    // Count this continued conversation as 1 prompt + count user's message tokens
    await trackConversationPrompt(userId, userMessage)
    
    // Flush to MongoDB immediately (Vercel serverless may freeze before debounced timer fires)
    flushUsageToMongo().catch(err => console.error('[Judge Conversation] Flush failed:', err.message))
    
    // Summarize the response and store it (async, don't wait) - pass just the user message as originalPrompt
    storeJudgeContext(userId, responseText, userMessage).catch(err => {
      console.error('[Judge Conversation] Error storing context:', err)
    })
    
    // Build debug data for frontend (same structure as main RAG pipeline)
    const debugData = {
      search: needsSearch ? {
        query: userMessage,
        results: searchResults
      } : null,
      refiner: null, // No refiner — models read raw sources directly
      categoryDetection: {
        category: category,
        needsSearch: needsSearch,
        needsContext: needsContext
      },
      memoryContext: {
        items: memoryContextItems,
        needsContextHint: needsContext,
        injected: memoryContextItems.length > 0,
      }
    }
    
    res.json({ 
      response: responseText,
      tokens: {
        input: inputTokens,
        output: outputTokens,
        total: inputTokens + outputTokens,
        breakdown: rawSourcesData ? buildTokenBreakdown(userMessage, rawSourcesData.formatted, inputTokens) : null
      },
      category: category,
      needsSearch: needsSearch,
      usedSearch: needsSearch && rawSourcesData !== null && rawSourcesData.sourceCount > 0,
      // Include debug data so frontend can update Facts/Sources and Pipeline Debug windows
      debugData: debugData,
      searchResults: searchResults,
      refinedData: null // No refiner — models read raw sources directly
    })
  } catch (error) {
    console.error('[Judge Conversation] Error:', error)
    res.status(500).json({ error: 'Failed to get judge response: ' + error.message })
  }
})

// ==================== STREAMING JUDGE CONVERSATION ====================
// SSE streaming version of /api/judge/conversation
app.post('/api/judge/conversation/stream', async (req, res) => {
  // Set SSE headers
  res.setHeader('Content-Type', 'text/event-stream')
  res.setHeader('Cache-Control', 'no-cache')
  res.setHeader('Connection', 'keep-alive')
  res.setHeader('X-Accel-Buffering', 'no')
  res.flushHeaders()

  const sendSSE = (type, data) => {
    res.write(`data: ${JSON.stringify({ type, ...data })}\n\n`)
  }

  try {
    const { userId, userMessage, conversationContext, originalSummaryText } = req.body

    if (!userId || !userMessage) {
      sendSSE('error', { message: 'userId and userMessage are required' })
      return res.end()
    }

    // Check subscription
    const subscriptionCheck = await checkSubscriptionStatusAsync(userId)
    if (!subscriptionCheck.hasAccess) {
      sendSSE('error', { message: 'Active subscription required.', subscriptionRequired: true })
      return res.end()
    }

    console.log('[Judge Conversation Stream] Processing message with Gemini 3 Flash')

    // Step 1: Category detection
    sendSSE('status', { message: 'Analyzing query...' })
    const { category, needsSearch, needsContext } = await detectCategoryForJudge(userMessage, userId)
    console.log(`[Judge Conversation Stream] Category: ${category}, Needs Search: ${needsSearch}, Needs Context: ${needsContext}`)

    // Step 1.5: Retrieve relevant past conversations via embedding memory
    let memoryContextString = ''
    let memoryContextItems = []
    if (userId) {
      const scoreThreshold = needsContext ? 0.70 : 0.82
      memoryContextItems = await findRelevantContext(userId, userMessage, 3, scoreThreshold)
      memoryContextString = formatMemoryContext(memoryContextItems)
      if (memoryContextString) {
        console.log(`[Judge Conversation Stream] Memory: Injecting ${memoryContextItems.length} past conversations as context`)
      }
    }

    // Get context summaries — use frontend-provided context only if non-empty, otherwise fall back to server-stored context
    const usage = readUsage()
    const contextSummaries = (conversationContext && conversationContext.length > 0)
      ? conversationContext
      : (usage[userId]?.judgeConversationContext || []).slice(0, 5)
    
    let contextString = ''
    if (memoryContextString) {
      contextString += memoryContextString + '\n'
    }
    if (contextSummaries.length > 0) {
      // Build context with newest first (index 0 = most recent, highest priority)
      contextString += `Here is context from your recent conversation with this user (most recent first — prioritize the latest context):\n\n${contextSummaries.map((ctx, idx) => {
          const promptPart = ctx.originalPrompt ? `User asked: ${ctx.originalPrompt}\n` : ''
          const responsePart = ctx.isFull && ctx.response
            ? `Your response: ${ctx.response}`
            : `Your response (summary): ${ctx.summary}`
          return `${idx + 1}. ${promptPart}${responsePart}`
        }).join('\n\n')}\n\n`
    } else if (originalSummaryText && originalSummaryText.trim()) {
      // Fallback: use the original summary text when no stored context exists yet
      contextString += `Your previous summary response that the user wants to continue discussing:\n${originalSummaryText.substring(0, 3000)}${originalSummaryText.length > 3000 ? '...' : ''}\n\n`
    }

    let judgePrompt = ''
    let rawSourcesData = null
    let searchResults = []

    // Step 2: Search + scrape raw sources (no refiner)
    if (needsSearch) {
      sendSSE('status', { message: 'Searching the web...' })
      const serperApiKey = API_KEYS.serper
      if (serperApiKey) {
        try {
          const searchContextSnippet = buildSearchContextSnippet(contextSummaries, originalSummaryText)
          const searchQuery = await reformulateSearchQuery(userMessage, userId, searchContextSnippet)
          const serperData = await performSerperSearch(searchQuery, 5)
          searchResults = (serperData?.organic || []).map(r => ({
            title: r.title, link: r.link, snippet: r.snippet
          }))
          console.log(`[Judge Conversation Stream] Search completed, found ${searchResults.length} results`)

          if (searchResults.length > 0) {
            sendSSE('status', { message: 'Reading sources...' })
            rawSourcesData = await formatRawSourcesForPrompt(searchResults, 5)
            console.log(`[Judge Conversation Stream] Raw sources scraped: ${rawSourcesData.sourceCount} sources`)
          }
        } catch (searchError) {
          console.error('[Judge Conversation Stream] Search/scrape error:', searchError)
        }
      }
    }

    // Step 3: Build prompt
    const todayDate = getCurrentDateStringForUser(userId)
    if (rawSourcesData && rawSourcesData.sourceCount > 0) {
      judgePrompt = `Today's date is ${todayDate}. You have access to real-time web search — the source content below is current and already retrieved for you. Read and parse it yourself to answer. Do NOT tell the user you cannot search the web.\n\n${contextString}Here is raw content from recent web sources that may help:\n\n${rawSourcesData.formatted}\n\nUser's question: ${userMessage}`
    } else {
      judgePrompt = `Today's date is ${todayDate}. You have access to real-time web search. If search results are provided, use them directly. Do NOT tell the user you cannot search the web.\n\n${contextString}User: ${userMessage}`
    }

    // Step 4: Stream from Gemini 3 Flash
    const apiKey = API_KEYS.google
    if (!apiKey) {
      sendSSE('error', { message: 'Google API key not configured' })
      return res.end()
    }

    const judgeModel = 'gemini-3-flash'
    const judgeModelApi = 'gemini-3-flash-preview'

    sendSSE('status', { message: 'Generating response...' })

    // Prepend system instruction into the user prompt for Gemini (Gemini uses systemInstruction or inline)
    const systemPrefix = 'You are a helpful conversational AI assistant. Respond directly and naturally to the user\'s follow-up questions. Do NOT format your response as a council summary — no CONSENSUS, SUMMARY, AGREEMENTS, or CONTRADICTIONS sections. Just answer conversationally as a single assistant. Use the conversation context provided to maintain continuity.\n\n'

    const streamResponse = await axios.post(
      `https://generativelanguage.googleapis.com/v1beta/models/${judgeModelApi}:streamGenerateContent?key=${apiKey}&alt=sse`,
      {
        contents: [{ parts: [{ text: systemPrefix + judgePrompt }] }],
      },
      { responseType: 'stream' }
    )

    let fullResponse = ''
    let inputTokens = 0
    let outputTokens = 0

    await new Promise((resolve, reject) => {
      let buffer = ''
      const processLine = (line) => {
        if (line.startsWith('data: ')) {
          const jsonStr = line.replace('data: ', '').trim()
          if (!jsonStr) return
          try {
            const parsed = JSON.parse(jsonStr)
            const text = parsed.candidates?.[0]?.content?.parts?.[0]?.text || ''
            if (text) {
              fullResponse += text
              sendSSE('token', { content: text })
            }
            if (parsed.usageMetadata) {
              inputTokens = parsed.usageMetadata.promptTokenCount || inputTokens
              outputTokens = parsed.usageMetadata.candidatesTokenCount || outputTokens
            }
          } catch (e) { /* skip */ }
        }
      }
      streamResponse.data.on('data', (chunk) => {
        buffer += chunk.toString()
        const lines = buffer.split('\n')
        buffer = lines.pop() || ''
        for (const line of lines) {
          processLine(line)
        }
      })
      streamResponse.data.on('end', () => {
        if (buffer.trim()) {
          const remaining = buffer.split('\n')
          for (const line of remaining) {
            processLine(line)
          }
        }
        resolve()
      })
      streamResponse.data.on('error', reject)
    })

    // If tokens weren't in stream, estimate them
    if (inputTokens === 0 && outputTokens === 0) {
      try {
        inputTokens = await countTokens(judgePrompt, 'google', judgeModel)
        outputTokens = await countTokens(fullResponse, 'google', judgeModel)
      } catch (e) {
        console.error('[Judge Stream] Token counting error:', e)
      }
    }

    // User sees the judge conversation stream on screen — NOT pipeline
    trackUsage(userId, 'google', judgeModel, inputTokens, outputTokens, false)
    
    // Count this continued conversation as 1 prompt + count user's message tokens
    await trackConversationPrompt(userId, userMessage)

    // Flush to MongoDB immediately (Vercel serverless may freeze before debounced timer fires)
    flushUsageToMongo().catch(err => console.error('[Judge Conversation Stream] Flush failed:', err.message))

    // Store context async
    storeJudgeContext(userId, fullResponse, userMessage).catch(err => {
      console.error('[Judge Conversation Stream] Error storing context:', err)
    })

    // Build debug data
    const debugData = {
      search: needsSearch ? { query: userMessage, results: searchResults } : null,
      refiner: null, // No refiner — models read raw sources directly
      categoryDetection: { category, needsSearch, needsContext },
      memoryContext: {
        items: memoryContextItems,
        needsContextHint: needsContext,
        injected: memoryContextItems.length > 0,
      }
    }

    // Send final metadata
    sendSSE('done', {
      response: fullResponse,
      tokens: { input: inputTokens, output: outputTokens, total: inputTokens + outputTokens, breakdown: rawSourcesData ? buildTokenBreakdown(userMessage, rawSourcesData.formatted, inputTokens) : null },
      category, needsSearch,
      usedSearch: needsSearch && rawSourcesData !== null && rawSourcesData.sourceCount > 0,
      debugData,
      searchResults,
      refinedData: null // No refiner — models read raw sources directly
    })

    res.end()

  } catch (error) {
    console.error('[Judge Conversation Stream] Error:', error.message)
    sendSSE('error', { message: 'Failed to get judge response: ' + error.message })
    res.end()
  }
})

// ==================== STREAMING MODEL CONVERSATION ====================
// SSE streaming version of /api/model/conversation
app.post('/api/model/conversation/stream', async (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream')
  res.setHeader('Cache-Control', 'no-cache')
  res.setHeader('Connection', 'keep-alive')
  res.setHeader('X-Accel-Buffering', 'no')
  res.flushHeaders()

  const sendSSE = (type, data) => {
    res.write(`data: ${JSON.stringify({ type, ...data })}\n\n`)
  }

  // Keep-alive heartbeat for model conversation stream
  const heartbeat = setInterval(() => {
    try { res.write(': heartbeat\n\n') } catch (e) { clearInterval(heartbeat) }
  }, 15000)

  try {
    const { userId, modelName, userMessage, originalResponse, responseId } = req.body

    if (!userId || !modelName || !userMessage) {
      sendSSE('error', { message: 'userId, modelName, and userMessage are required' })
      clearInterval(heartbeat)
      return res.end()
    }

    const subscriptionCheck = await checkSubscriptionStatusAsync(userId)
    if (!subscriptionCheck.hasAccess) {
      sendSSE('error', { message: 'Active subscription required.', subscriptionRequired: true })
      clearInterval(heartbeat)
      return res.end()
    }

    console.log(`[Model Conversation Stream] Processing message for model: ${modelName}`)

    const parts = modelName.split('-')
    const provider = parts[0]
    const model = parts.slice(1).join('-')

    // Step 1: Category detection
    sendSSE('status', { message: 'Analyzing query...' })
    const { category, needsSearch, needsContext } = await detectCategoryForJudge(userMessage, userId)
    console.log(`[Model Conversation Stream] Category: ${category}, Needs Search: ${needsSearch}, Needs Context: ${needsContext}`)

    // Step 1.5: Retrieve relevant past conversations via embedding memory
    //   Pass modelName so the memory system extracts THIS model's specific past response
    //   instead of the generic judge summary — gives the model its own context for consistency.
    let memoryContextString = ''
    let memoryContextItems = []
    if (userId) {
      const scoreThreshold = needsContext ? 0.70 : 0.82
      memoryContextItems = await findRelevantContext(userId, userMessage, 3, scoreThreshold, modelName)
      memoryContextString = formatMemoryContext(memoryContextItems)
      if (memoryContextString) {
        console.log(`[Model Conversation Stream] Memory: Injecting ${memoryContextItems.length} past conversations as context (model-specific: ${modelName})`)
      }
    }

    // Step 2: Load model conversation context before search so vague follow-ups can be resolved.
    const usageData = readUsage()
    const userUsage = usageData[userId] || {}
    const allModelContexts = userUsage.modelConversationContext || {}
    const contextSummaries = (allModelContexts[modelName] || []).slice(0, 5)

    // Step 3: Search + scrape raw sources (no refiner)
    let rawSourcesData = null
    let searchResults = []

    if (needsSearch) {
      sendSSE('status', { message: 'Searching the web...' })
      const serperApiKey = API_KEYS.serper
      if (serperApiKey) {
        try {
          const searchContextSnippet = buildSearchContextSnippet(contextSummaries, originalResponse)
          const searchQuery = await reformulateSearchQuery(userMessage, userId, searchContextSnippet)
          const serperData = await performSerperSearch(searchQuery, 5)
          searchResults = (serperData?.organic || []).map(r => ({
            title: r.title, link: r.link, snippet: r.snippet
          }))
          if (searchResults.length > 0) {
            sendSSE('status', { message: 'Reading sources...' })
            rawSourcesData = await formatRawSourcesForPrompt(searchResults, 5)
            console.log(`[Model Conversation Stream] Raw sources scraped: ${rawSourcesData.sourceCount} sources`)
          }
        } catch (searchError) {
          console.error('[Model Conversation Stream] Search/scrape error:', searchError)
        }
      }
    }

    // Step 4: Build multi-turn messages (proper conversation format so models understand context)

    // System message: instructions, memory context, and search results
    let systemMessage = `Today's date is ${getCurrentDateStringForUser(userId)}. You have access to real-time web search — when source content is provided below, read and parse it yourself to answer the user's question. Do NOT tell the user you cannot search the web or ask them for permission. The search has already been performed for you and the source content is included in this prompt. Answer confidently using the provided data. If citing sources, cite publication/site/title or URL/domain and NEVER use numeric labels like "source 1" or "source 3".`

    if (memoryContextString) {
      systemMessage += '\n\n' + memoryContextString
    }

    if (rawSourcesData && rawSourcesData.sourceCount > 0) {
      systemMessage += `\n\nHere is raw content from recent web sources that may help answer the user's question:\n\n${rawSourcesData.formatted}`
    }

    // Build proper multi-turn conversation messages from stored context.
    // contextSummaries is ordered most-recent-first, so reverse for chronological order.
    const conversationMessages = []
    if (contextSummaries.length > 0) {
      const chronological = [...contextSummaries].reverse()
      for (const ctx of chronological) {
        if (ctx.originalPrompt) {
          conversationMessages.push({ role: 'user', content: ctx.originalPrompt })
        }
        const assistantText = ctx.isFull && ctx.response ? ctx.response : ctx.summary
        if (assistantText) {
          conversationMessages.push({ role: 'assistant', content: assistantText })
        }
      }
    } else if (originalResponse && originalResponse.trim()) {
      // First follow-up with no server-stored context yet: use the original response
      conversationMessages.push({ role: 'assistant', content: originalResponse.substring(0, 4000) })
    }

    // Add current user message as the final turn
    conversationMessages.push({ role: 'user', content: userMessage })

    // Also build a flat prompt string for token estimation (used as fallback)
    const prompt = systemMessage + '\n\n' + conversationMessages.map(m => `${m.role}: ${m.content}`).join('\n')

    console.log(`[Model Conversation Stream] Built ${conversationMessages.length} conversation messages (${contextSummaries.length} context entries)`)

    // Step 4: Model mapping
    const modelMappings = {
      'claude-4.5-opus': 'claude-opus-4-5-20251101',
      'claude-4.5-sonnet': 'claude-sonnet-4-5-20250929',
      'claude-4.5-haiku': 'claude-haiku-4-5-20251001',
      'gemini-3-pro': 'gemini-3-pro-preview',
      'gemini-3-flash': 'gemini-3-flash-preview',
      'magistral-medium': 'magistral-medium-latest',
      'mistral-medium-3.1': 'mistral-medium-latest',
      'mistral-small-3.2': 'mistral-small-latest',
    }
    const mappedModel = modelMappings[model] || model

    sendSSE('status', { message: 'Generating response...' })

    let fullResponse = ''
    let inputTokens = 0
    let outputTokens = 0

    // Step 5: Stream from the appropriate provider
    if (['openai', 'xai', 'meta', 'deepseek', 'mistral'].includes(provider)) {
      // OpenAI-compatible streaming
      const baseUrls = {
        openai: 'https://api.openai.com/v1',
        xai: 'https://api.x.ai/v1',
        meta: 'https://api.groq.com/openai/v1',
        deepseek: 'https://api.deepseek.com/v1',
        mistral: 'https://api.mistral.ai/v1',
      }
      const apiKey = API_KEYS[provider]
      if (!apiKey) {
        sendSSE('error', { message: `${provider} API key not configured` })
        return res.end()
      }

      const modelsWithFixedTemperature = ['gpt-5-mini']
      const shouldUseDefaultTemperature = modelsWithFixedTemperature.includes(mappedModel) || modelsWithFixedTemperature.includes(model)

      const streamResponse = await axios.post(
        `${baseUrls[provider]}/chat/completions`,
        {
          model: mappedModel,
          messages: [{ role: 'user', content: prompt }],
          ...(shouldUseDefaultTemperature ? {} : { temperature: 0.7 }),
          stream: true
        },
        {
          headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
          responseType: 'stream'
        }
      )

      await new Promise((resolve, reject) => {
        streamResponse.data.on('data', (chunk) => {
          const lines = chunk.toString().split('\n').filter(l => l.trim().startsWith('data:'))
          for (const line of lines) {
            const jsonStr = line.replace(/^data:\s*/, '').trim()
            if (jsonStr === '[DONE]') continue
            try {
              const parsed = JSON.parse(jsonStr)
              const token = parsed.choices?.[0]?.delta?.content || ''
              if (token) {
                fullResponse += token
                sendSSE('token', { content: token })
              }
              if (parsed.usage) {
                inputTokens = parsed.usage.prompt_tokens || 0
                outputTokens = parsed.usage.completion_tokens || 0
              }
            } catch (e) { /* skip */ }
          }
        })
        streamResponse.data.on('end', resolve)
        streamResponse.data.on('error', reject)
      })

    } else if (provider === 'anthropic') {
      // Anthropic streaming (different SSE format)
      const apiKey = API_KEYS.anthropic
      if (!apiKey) {
        sendSSE('error', { message: 'Anthropic API key not configured' })
        return res.end()
      }

      const streamResponse = await axios.post(
        'https://api.anthropic.com/v1/messages',
        {
          model: mappedModel,
          max_tokens: 4096,
          messages: [{ role: 'user', content: prompt }],
          stream: true
        },
        {
          headers: {
            'x-api-key': apiKey,
            'anthropic-version': '2023-06-01',
            'Content-Type': 'application/json'
          },
          responseType: 'stream',
          timeout: 120000
        }
      )

      await new Promise((resolve, reject) => {
        let buffer = ''
        let streamError = null
        const processAnthropicConvoLine = (line) => {
          if (line.startsWith('data: ')) {
            const jsonStr = line.replace('data: ', '').trim()
            if (!jsonStr) return
            try {
              const parsed = JSON.parse(jsonStr)
              if (parsed.type === 'content_block_delta') {
                const text = parsed.delta?.text || ''
                if (text) {
                  fullResponse += text
                  sendSSE('token', { content: text })
                }
              }
              if (parsed.type === 'message_delta' && parsed.usage) {
                outputTokens = parsed.usage.output_tokens || 0
              }
              if (parsed.type === 'message_start' && parsed.message?.usage) {
                inputTokens = parsed.message.usage.input_tokens || 0
              }
              if (parsed.type === 'error') {
                console.error(`[Model Conversation Stream] Anthropic stream error event:`, parsed.error || parsed)
                streamError = parsed.error?.message || 'Anthropic stream error'
              }
            } catch (e) { /* skip */ }
          }
        }
        streamResponse.data.on('data', (chunk) => {
          buffer += chunk.toString()
          const lines = buffer.split('\n')
          buffer = lines.pop() || ''
          for (const line of lines) {
            processAnthropicConvoLine(line)
          }
        })
        streamResponse.data.on('end', () => {
          if (buffer.trim()) {
            const remaining = buffer.split('\n')
            for (const line of remaining) {
              processAnthropicConvoLine(line)
            }
          }
          if (streamError && !fullResponse) {
            reject(new Error(streamError))
          } else {
            resolve()
          }
        })
        streamResponse.data.on('error', (err) => {
          console.error(`[Model Conversation Stream] Anthropic stream connection error:`, err.message)
          reject(err)
        })
      })

    } else if (provider === 'google') {
      // Google Gemini streaming
      const apiKey = API_KEYS.google
      if (!apiKey) {
        sendSSE('error', { message: 'Google API key not configured' })
        return res.end()
      }

      const streamResponse = await axios.post(
        `https://generativelanguage.googleapis.com/v1beta/models/${mappedModel}:streamGenerateContent?key=${apiKey}&alt=sse`,
        {
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: { maxOutputTokens: 4096 }
        },
        { responseType: 'stream' }
      )

      await new Promise((resolve, reject) => {
        let buffer = ''
        const processGoogleConvoLine = (line) => {
          if (line.startsWith('data: ')) {
            const jsonStr = line.replace('data: ', '').trim()
            if (!jsonStr) return
            try {
              const parsed = JSON.parse(jsonStr)
              const text = parsed.candidates?.[0]?.content?.parts?.[0]?.text || ''
              if (text) {
                fullResponse += text
                sendSSE('token', { content: text })
              }
              if (parsed.usageMetadata) {
                inputTokens = parsed.usageMetadata.promptTokenCount || inputTokens
                outputTokens = parsed.usageMetadata.candidatesTokenCount || outputTokens
              }
            } catch (e) { /* skip */ }
          }
        }
        streamResponse.data.on('data', (chunk) => {
          buffer += chunk.toString()
          const lines = buffer.split('\n')
          buffer = lines.pop() || ''
          for (const line of lines) {
            processGoogleConvoLine(line)
          }
        })
        streamResponse.data.on('end', () => {
          if (buffer.trim()) {
            const remaining = buffer.split('\n')
            for (const line of remaining) {
              processGoogleConvoLine(line)
            }
          }
          resolve()
        })
        streamResponse.data.on('error', reject)
      })

    } else {
      sendSSE('error', { message: `Unsupported provider: ${provider}` })
      clearInterval(heartbeat)
      return res.end()
    }

    // If tokens weren't captured from stream, estimate
    if (inputTokens === 0 && outputTokens === 0) {
      try {
        inputTokens = await countTokens(prompt, provider, mappedModel)
        outputTokens = await countTokens(fullResponse, provider, mappedModel)
      } catch (e) { /* skip */ }
    }

    // Track usage
    trackUsage(userId, provider, model, inputTokens, outputTokens)

    // Count this continued conversation as 1 prompt + count user's message tokens
    await trackConversationPrompt(userId, userMessage)

    // Flush to MongoDB immediately (Vercel serverless may freeze before debounced timer fires)
    flushUsageToMongo().catch(err => console.error('[Model Conversation] Flush failed:', err.message))

    // Store context async
    storeModelContext(userId, modelName, fullResponse, userMessage).catch(err => {
      console.error(`[Model Conversation Stream] Error storing context for ${modelName}:`, err)
    })

    console.log(`[Model Conversation Stream] Response generated for ${modelName}, tokens: ${inputTokens}/${outputTokens}`)

    // Send final metadata
    sendSSE('done', {
      response: fullResponse,
      tokens: { input: inputTokens, output: outputTokens, total: inputTokens + outputTokens, breakdown: rawSourcesData ? buildTokenBreakdown(userMessage, rawSourcesData.formatted, inputTokens) : null },
      category, needsSearch,
      usedSearch: needsSearch && rawSourcesData !== null && rawSourcesData.sourceCount > 0,
      searchResults,
      refinedData: null // No refiner — models read raw sources directly
    })

    clearInterval(heartbeat)
    res.end()

  } catch (error) {
    clearInterval(heartbeat)
    if (error.response?.data) {
      try { console.error('[Model Conversation Stream] API Error:', JSON.stringify(error.response.data)) } catch (e) { console.error('[Model Conversation Stream] API Error (non-serializable):', error.response.status, error.response.statusText) }
    } else {
      console.error('[Model Conversation Stream] Error:', error.message)
    }
    sendSSE('error', { message: 'Failed to get model response: ' + (error.response?.data?.error?.message || error.message) })
    res.end()
  }
})

// Continue conversation with a specific model (for individual response windows AND single-model main view)
// Uses server-side context storage (same rolling-window pattern as judge context)
app.post('/api/model/conversation', async (req, res) => {
  try {
    const { userId, modelName, userMessage, originalResponse, responseId } = req.body
    
    if (!userId || !modelName || !userMessage) {
      return res.status(400).json({ error: 'userId, modelName, and userMessage are required' })
    }
    
    // Check subscription status (async — syncs with Stripe if needed)
    const subscriptionCheck = await checkSubscriptionStatusAsync(userId)
    if (!subscriptionCheck.hasAccess) {
      return res.status(403).json({ 
        error: 'Active subscription required. Please subscribe to use this service.',
        subscriptionRequired: true,
        reason: subscriptionCheck.reason
      })
    }
    
    console.log(`[Model Conversation] Processing message for model: ${modelName}`)
    
    // Extract provider and model from modelName (e.g., "openai-gpt-5.2" -> provider: "openai", model: "gpt-5.2")
    const parts = modelName.split('-')
    const provider = parts[0]
    const model = parts.slice(1).join('-')
    
    // Step 1: Detect category and determine if web search is needed (same as judge conversation)
    const { category, needsSearch, needsContext } = await detectCategoryForJudge(userMessage, userId)
    console.log(`[Model Conversation] Category: ${category}, Needs Search: ${needsSearch}, Needs Context: ${needsContext}`)
    
    // Step 1.5: Retrieve relevant past conversations via embedding memory
    //   Pass modelName so the memory system extracts THIS model's specific past response
    //   instead of the generic judge summary — gives the model its own context for consistency.
    let memoryContextString = ''
    let memoryContextItems = []
    if (userId) {
      const scoreThreshold = needsContext ? 0.70 : 0.82
      memoryContextItems = await findRelevantContext(userId, userMessage, 3, scoreThreshold, modelName)
      memoryContextString = formatMemoryContext(memoryContextItems)
      if (memoryContextString) {
        console.log(`[Model Conversation] Memory: Injecting ${memoryContextItems.length} past conversations as context (model-specific: ${modelName})`)
      }
    }
    
    // Step 2: Get conversation context from server-side storage before search
    const usage = readUsage()
    const userUsage = usage[userId] || {}
    const allModelContexts = userUsage.modelConversationContext || {}
    const contextSummaries = (allModelContexts[modelName] || []).slice(0, 5)

    // Step 3: If search is needed, run search + refiner pipeline
    let rawSourcesData = null
    let searchResults = []
    
    if (needsSearch) {
      console.log(`[Model Conversation] Search needed for ${modelName}, fetching raw sources...`)
      
      const serperApiKey = API_KEYS.serper
      if (serperApiKey) {
        try {
          const searchContextSnippet = buildSearchContextSnippet(contextSummaries, originalResponse)
          const searchQuery = await reformulateSearchQuery(userMessage, userId, searchContextSnippet)
          const serperData = await performSerperSearch(searchQuery, 5)
          searchResults = (serperData?.organic || []).map(r => ({
            title: r.title,
            link: r.link,
            snippet: r.snippet
          }))
          
          console.log(`[Model Conversation] Search completed, found ${searchResults.length} results`)
          
          // Scrape raw source content (no refiner LLM)
          if (searchResults.length > 0) {
            rawSourcesData = await formatRawSourcesForPrompt(searchResults, 5)
            console.log(`[Model Conversation] Raw sources scraped: ${rawSourcesData.sourceCount} sources`)
          }
        } catch (searchError) {
          console.error('[Model Conversation] Search/scrape error:', searchError)
          // Continue without source data
        }
      } else {
        console.warn('[Model Conversation] Serper API key not configured, skipping search')
      }
    }
    
    // Step 4: Build context string from server-stored context (position 0 = full, 1-4 = summarized)
    let prompt = `Today's date is ${getCurrentDateStringForUser(userId)}. You have access to real-time web search — when source content is provided below, read and parse it yourself to answer the user's question. Do NOT tell the user you cannot search the web or ask them for permission. The search has already been performed for you and the source content is included in this prompt. Answer confidently using the provided data. If citing sources, cite publication/site/title or URL/domain and NEVER use numeric labels like "source 1" or "source 3".\n\n`
    
    if (memoryContextString) {
      prompt += memoryContextString + '\n'
    }
    
    if (contextSummaries.length > 0) {
      const contextString = contextSummaries.map((ctx, idx) => {
        const promptPart = ctx.originalPrompt ? `User asked: ${ctx.originalPrompt}\n` : ''
        const responsePart = ctx.isFull && ctx.response 
          ? `Your response: ${ctx.response}`
          : `Your response (summary): ${ctx.summary}`
        return `${idx + 1}. ${promptPart}${responsePart}`
      }).join('\n\n')
      prompt += `Here is context from your recent conversation with this user (most recent first — prioritize the latest context):\n\n${contextString}\n\n`
    } else if (originalResponse && originalResponse.trim()) {
      // First follow-up: use the original response as initial context
      prompt += `Your previous response that the user wants to continue discussing:\n${originalResponse.substring(0, 2000)}${originalResponse.length > 2000 ? '...' : ''}\n\n`
    }
    
    // Step 4: Add raw source content to prompt if available
    if (rawSourcesData && rawSourcesData.sourceCount > 0) {
      prompt += `Here is raw content from recent web sources that may help answer the user's question:\n\n${rawSourcesData.formatted}\n\n`
    }
    
    prompt += `User: ${userMessage}`
    
    let responseText = ''
    let inputTokens = 0
    let outputTokens = 0
    
    // Use the same model mapping table as the main /api/llm endpoint
    const modelMappings = {
      'claude-4.5-opus': 'claude-opus-4-5-20251101',
      'claude-4.5-sonnet': 'claude-sonnet-4-5-20250929',
      'claude-4.5-haiku': 'claude-haiku-4-5-20251001',
      'gemini-3-pro': 'gemini-3-pro-preview',
      'gemini-3-flash': 'gemini-3-flash-preview',
      'magistral-medium': 'magistral-medium-latest',
      'mistral-medium-3.1': 'mistral-medium-latest',
      'mistral-small-3.2': 'mistral-small-latest',
    }
    const mappedModel = modelMappings[model] || model
    if (modelMappings[model]) {
      console.log(`[Model Conversation] Model mapping: "${model}" -> "${mappedModel}"`)
    }
    
    // Step 5: Call the appropriate API based on provider
    if (['openai', 'xai', 'meta', 'deepseek', 'mistral'].includes(provider)) {
      const baseUrls = {
        openai: 'https://api.openai.com/v1',
        xai: 'https://api.x.ai/v1',
        meta: 'https://api.groq.com/openai/v1',
        deepseek: 'https://api.deepseek.com/v1',
        mistral: 'https://api.mistral.ai/v1',
      }
      const apiKey = API_KEYS[provider]
      if (!apiKey) {
        return res.status(400).json({ error: `${provider} API key not configured` })
      }
      
      // Some models only support default temperature
      const modelsWithFixedTemperature = ['gpt-5-mini']
      const shouldUseDefaultTemperature = modelsWithFixedTemperature.includes(mappedModel) || modelsWithFixedTemperature.includes(model)
      
      const response = await axios.post(
        `${baseUrls[provider]}/chat/completions`,
        {
          model: mappedModel,
          messages: [{ role: 'user', content: prompt }],
          ...(shouldUseDefaultTemperature ? {} : { temperature: 0.7 }),
        },
        { headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' } }
      )
      
      responseText = response.data.choices[0].message.content
      inputTokens = response.data.usage?.prompt_tokens || 0
      outputTokens = response.data.usage?.completion_tokens || 0
      
    } else if (provider === 'anthropic') {
      const apiKey = API_KEYS.anthropic
      if (!apiKey) {
        return res.status(400).json({ error: 'Anthropic API key not configured' })
      }
      
      const response = await axios.post(
        'https://api.anthropic.com/v1/messages',
        {
          model: mappedModel,
          max_tokens: 4096,
          messages: [{ role: 'user', content: prompt }],
        },
        { 
          headers: { 
            'x-api-key': apiKey,
            'anthropic-version': '2023-06-01',
            'Content-Type': 'application/json'
          } 
        }
      )
      
      responseText = response.data.content[0].text
      inputTokens = response.data.usage?.input_tokens || 0
      outputTokens = response.data.usage?.output_tokens || 0
      
    } else if (provider === 'google') {
      const apiKey = API_KEYS.google
      if (!apiKey) {
        return res.status(400).json({ error: 'Google API key not configured' })
      }
      
      const response = await axios.post(
        `https://generativelanguage.googleapis.com/v1beta/models/${mappedModel}:generateContent?key=${apiKey}`,
        {
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: { maxOutputTokens: 4096 }
        }
      )
      
      responseText = response.data.candidates[0].content.parts[0].text
      const usageMetadata = response.data.usageMetadata || {}
      inputTokens = usageMetadata.promptTokenCount || 0
      outputTokens = usageMetadata.candidatesTokenCount || 0
      
    } else {
      return res.status(400).json({ error: `Unsupported provider: ${provider}` })
    }
    
    // Track usage
    trackUsage(userId, provider, model, inputTokens, outputTokens)
    
    // Count this continued conversation as 1 prompt + count user's message tokens
    await trackConversationPrompt(userId, userMessage)
    
    // Flush to MongoDB immediately (Vercel serverless may freeze before debounced timer fires)
    flushUsageToMongo().catch(err => console.error('[Model Conversation Non-Stream] Flush failed:', err.message))
    
    // Store response in server-side context (async, don't wait — same as judge)
    storeModelContext(userId, modelName, responseText, userMessage).catch(err => {
      console.error(`[Model Conversation] Error storing context for ${modelName}:`, err)
    })
    
    console.log(`[Model Conversation] Response generated for ${modelName}, tokens: ${inputTokens}/${outputTokens}, usedSearch: ${needsSearch && rawSourcesData !== null}`)
    
    res.json({
      response: responseText,
      tokens: {
        input: inputTokens,
        output: outputTokens,
        total: inputTokens + outputTokens,
        breakdown: rawSourcesData ? buildTokenBreakdown(userMessage, rawSourcesData.formatted, inputTokens) : null
      },
      category: category,
      needsSearch: needsSearch,
      usedSearch: needsSearch && rawSourcesData !== null && rawSourcesData.sourceCount > 0,
      searchResults: searchResults,
      refinedData: null // No refiner — models read raw sources directly
    })
    
  } catch (error) {
    // Log the actual API error response if available (not the full axios dump)
    if (error.response?.data) {
      try { console.error('[Model Conversation] API Error Response:', JSON.stringify(error.response.data)) } catch (e) { console.error('[Model Conversation] API Error (non-serializable):', error.response.status, error.response.statusText) }
      console.error('[Model Conversation] Status:', error.response.status)
    } else {
      console.error('[Model Conversation] Error:', error.message)
    }
    res.status(500).json({ error: 'Failed to get model response: ' + (error.response?.data?.error?.message || error.message) })
  }
})

// Get categories stats
app.get('/api/stats/:userId/categories', async (req, res) => {
  const { userId } = req.params
  const userUsage = await getUserUsageFromDb(userId)
  
  // Return both category counts and recent prompts per category
  const categories = userUsage.categories || {}
  const categoryPrompts = userUsage.categoryPrompts || {}
  
  // Build response with counts and prompts for each category
  // Handle migration: if categories[cat] is a number (old format), convert to new format
  const categoriesData = {}
  
  // First, process all categories that have counts
  Object.keys(categories).forEach(cat => {
    const categoryValue = categories[cat]
    if (typeof categoryValue === 'number') {
      // Old format: just a count
      categoriesData[cat] = {
        count: categoryValue,
        recentPrompts: categoryPrompts[cat] || []
      }
    } else if (typeof categoryValue === 'object' && categoryValue !== null) {
      // New format: already an object
      categoriesData[cat] = {
        count: categoryValue.count || 0,
        recentPrompts: categoryValue.recentPrompts || categoryPrompts[cat] || []
      }
    } else {
      // Fallback
      categoriesData[cat] = {
        count: 0,
        recentPrompts: []
      }
    }
  })
  
  // Also include categories that have prompts but no counts (shouldn't happen, but just in case)
  Object.keys(categoryPrompts).forEach(cat => {
    if (!categoriesData[cat] && categoryPrompts[cat] && categoryPrompts[cat].length > 0) {
      categoriesData[cat] = {
        count: 0,
        recentPrompts: categoryPrompts[cat] || []
      }
    }
  })
  
  console.log('[Categories API] Returning categories data:', Object.keys(categoriesData).map(cat => ({
    category: cat,
    count: categoriesData[cat].count,
    prompts: categoriesData[cat].recentPrompts?.length || 0
  })))
  
  res.json({ categories: categoriesData })
})

// Clear category prompts
// Use wildcard (*) to handle categories with forward slashes like "Politics/Law"
app.delete('/api/stats/:userId/categories/*/prompts', (req, res) => {
  const { userId } = req.params
  // Get the category from the wildcard match (req.params[0] contains the matched path)
  const categoryPath = req.params[0] || ''
  const usage = readUsage()
  
  console.log(`[Clear Category] DELETE request received for user: ${userId}, category path: ${categoryPath}`)
  
  if (!usage[userId]) {
    console.log(`[Clear Category] User not found: ${userId}`)
    return res.status(404).json({ error: 'User not found' })
  }
  
  // Decode the category name (in case it's URL-encoded)
  const decodedCategory = decodeURIComponent(categoryPath)
  console.log(`[Clear Category] Decoded category: ${decodedCategory}`)
  
  // Ensure categoryPrompts exists
  if (!usage[userId].categoryPrompts) {
    usage[userId].categoryPrompts = {}
  }
  
  // Clear prompts for this category (try both encoded and decoded versions)
  let cleared = false
  if (usage[userId].categoryPrompts[decodedCategory]) {
    usage[userId].categoryPrompts[decodedCategory] = []
    cleared = true
    console.log(`[Clear Category] Cleared prompts for decoded category: ${decodedCategory}`)
  } else if (usage[userId].categoryPrompts[categoryPath]) {
    usage[userId].categoryPrompts[categoryPath] = []
    cleared = true
    console.log(`[Clear Category] Cleared prompts for encoded category: ${categoryPath}`)
  } else {
    // Try to find the category by matching keys (case-insensitive or partial match)
    const categoryKeys = Object.keys(usage[userId].categoryPrompts || {})
    const matchedKey = categoryKeys.find(key => 
      key.toLowerCase() === decodedCategory.toLowerCase() || 
      decodeURIComponent(key) === decodedCategory ||
      key === categoryPath
    )
    if (matchedKey) {
      usage[userId].categoryPrompts[matchedKey] = []
      cleared = true
      console.log(`[Clear Category] Cleared prompts for matched category: ${matchedKey}`)
    } else {
      console.log(`[Clear Category] Category not found. Available categories: ${categoryKeys.join(', ')}`)
      console.log(`[Clear Category] Searched for: "${decodedCategory}" or "${categoryPath}"`)
    }
  }
  
  if (cleared) {
    writeUsage(usage)
    console.log(`[Clear Category] Successfully cleared prompts for category "${decodedCategory}" for user: ${userId}`)
    res.json({ success: true, message: `Prompts cleared for category: ${decodedCategory}` })
  } else {
    res.status(404).json({ error: `Category "${decodedCategory}" not found` })
  }
})

// Delete a single prompt from a category by index
app.delete('/api/stats/:userId/categories/*/prompts/:promptIndex', (req, res) => {
  const { userId } = req.params
  const categoryPath = req.params[0] || ''
  const promptIndex = parseInt(req.params.promptIndex, 10)
  const usage = readUsage()

  console.log(`[Delete Prompt] DELETE request for user: ${userId}, category: ${categoryPath}, index: ${promptIndex}`)

  if (!usage[userId]) {
    return res.status(404).json({ error: 'User not found' })
  }

  const decodedCategory = decodeURIComponent(categoryPath)

  if (!usage[userId].categoryPrompts) {
    return res.status(404).json({ error: 'No category prompts found' })
  }

  // Find the category (case-insensitive)
  let prompts = null
  let matchedKey = null
  const categoryKeys = Object.keys(usage[userId].categoryPrompts)
  for (const key of categoryKeys) {
    if (key === decodedCategory || key.toLowerCase() === decodedCategory.toLowerCase() || decodeURIComponent(key) === decodedCategory) {
      prompts = usage[userId].categoryPrompts[key]
      matchedKey = key
      break
    }
  }

  if (!prompts || !matchedKey) {
    return res.status(404).json({ error: `Category "${decodedCategory}" not found` })
  }

  if (promptIndex < 0 || promptIndex >= prompts.length) {
    return res.status(400).json({ error: `Invalid prompt index: ${promptIndex}` })
  }

  // Remove the prompt at the given index
  prompts.splice(promptIndex, 1)
  usage[userId].categoryPrompts[matchedKey] = prompts
  writeUsage(usage)

  console.log(`[Delete Prompt] Deleted prompt at index ${promptIndex} from "${decodedCategory}" for user: ${userId}`)
  res.json({ success: true, message: `Prompt deleted from category: ${decodedCategory}` })
})

// Save a rating for a model response
app.post('/api/ratings', (req, res) => {
  try {
    const { userId, responseId, rating, modelName } = req.body

    if (!userId || !responseId || rating === undefined) {
      return res.status(400).json({ error: 'userId, responseId, and rating are required' })
    }

    if (rating < 1 || rating > 5) {
      return res.status(400).json({ error: 'Rating must be between 1 and 5' })
    }

    const usage = readUsage()
    if (!usage[userId]) {
      usage[userId] = {
        totalTokens: 0,
        totalInputTokens: 0,
        totalOutputTokens: 0,
        totalQueries: 0,
        totalPrompts: 0,
        monthlyUsage: {},
        providers: {},
        models: {},
        promptHistory: [],
        categories: {},
        categoryPrompts: {},
        ratings: {},
        lastActiveAt: null,
        streakDays: 0,
      }
    }

    const userUsage = usage[userId]
    if (!userUsage.ratings) {
      userUsage.ratings = {}
    }

    // Store rating with responseId as key
    // The responseId contains model info in format: "provider-model-timestamp-random"
    userUsage.ratings[responseId] = rating

    writeUsage(usage)

    res.json({ success: true, message: 'Rating saved successfully' })
  } catch (error) {
    console.error('[Save Rating] Error:', error)
    res.status(500).json({ error: 'Failed to save rating' })
  }
})

// Get ratings stats
app.get('/api/stats/:userId/ratings', async (req, res) => {
  const { userId } = req.params
  const userUsage = await getUserUsageFromDb(userId)
  res.json({ ratings: userUsage.ratings || {} })
})

// Get streak info
app.get('/api/stats/:userId/streak', async (req, res) => {
  const { userId } = req.params
  const [user, userUsage] = await Promise.all([
    getUserFromDb(userId),
    getUserUsageFromDb(userId),
  ])
  if (!user) return res.json({ streakDays: 0, lastActiveAt: null })

  const tz = user.timezone || null
  const todayKey = getTodayForUser(tz)
  const memberSinceRaw = user.subscriptionStartedDate || user.createdAt || null
  const memberSinceKey = getDateKeyForUser(memberSinceRaw, tz)

  let streakDays = userUsage.streakDays || 0
  if (memberSinceKey && streakDays > 0) {
    const membershipDayDiff = getDayDiffFromDateKeys(memberSinceKey, todayKey)
    if (membershipDayDiff !== null && membershipDayDiff >= 0) {
      // Do not allow streak to exceed elapsed membership days (inclusive).
      const membershipDays = membershipDayDiff + 1
      streakDays = Math.min(streakDays, membershipDays)
    }
  }

  res.json({ 
    streakDays,
    lastActiveAt: userUsage.lastActiveAt || null,
  })
})

// Legacy function for backward compatibility (deprecated - use countTokens instead)
const estimateTokens = (text) => {
  console.warn('[Deprecated] estimateTokens() is deprecated. Use countTokens() with provider/model instead.')
  return estimateTokensFallback(text)
}

// Build a token breakdown showing user prompt vs source context vs system overhead
// This lets the frontend display what's "counted" vs "behind the scenes"
const buildTokenBreakdown = (userQuery, sourceContent, totalInputTokens) => {
  const userPromptTokens = estimateTokensFallback(userQuery || '')
  const sourceTokens = estimateTokensFallback(sourceContent || '')
  const systemOverhead = Math.max(0, totalInputTokens - userPromptTokens - sourceTokens)
  return {
    userPrompt: userPromptTokens,
    sourceContext: sourceTokens,
    systemOverhead: systemOverhead
  }
}

// Helper function to check if user has active subscription
const checkSubscriptionStatus = async (userId) => {
  if (!userId) {
    console.log('[Subscription Check] No user ID provided')
    return { hasAccess: false, reason: 'No user ID provided' }
  }

  // Admins always have access regardless of subscription status
  if (isAdmin(userId)) {
    console.log(`[Subscription Check] Admin bypass for user ${userId}`)
    return { hasAccess: true }
  }

  await ensureUserInCache(userId)
  const users = readUsers()
  const user = users[userId]

  if (!user) {
    console.log(`[Subscription Check] User not found: ${userId}`)
    return { hasAccess: false, reason: 'User not found' }
  }

  // Check subscription status
  const status = user.subscriptionStatus || 'inactive'
  console.log(`[Subscription Check] User ${userId} status: ${status}, customerId: ${user.stripeCustomerId || 'none'}, subscriptionId: ${user.stripeSubscriptionId || 'none'}`)

  if (status === 'active' || status === 'trialing') {
    // Check if subscription hasn't expired
    if (user.subscriptionRenewalDate) {
      const endDate = new Date(user.subscriptionRenewalDate)
      const now = new Date()
      if (endDate < now) {
        console.log(`[Subscription Check] Subscription expired for user ${userId}: ${endDate} < ${now}`)
        return { hasAccess: false, reason: 'Subscription has expired' }
      }
    }

    // Free trial users: enforce spending limit (purchased credits only, no $7.50 monthly allocation)
    // Defensive: trialing users with no Stripe subscription are free trial users even if plan field is missing
    const isFreeTrial = user.plan === 'free_trial' || (status === 'trialing' && !user.stripeSubscriptionId)
    if (isFreeTrial) {
      const tz = getUserTimezone(userId)
      const currentMonth = getMonthForUser(tz)
      const monthlyCost = user.monthlyUsageCost?.[currentMonth] || 0
      const usage = readUsage()
      const purchasedCreditsTotal = usage[userId]?.purchasedCredits?.total || 0

      if (monthlyCost >= purchasedCreditsTotal) {
        console.log(`[Subscription Check] Free trial budget exhausted for user ${userId}: spent $${monthlyCost.toFixed(4)}, total credits: $${purchasedCreditsTotal.toFixed(2)}`)
        return { hasAccess: false, reason: 'Your free trial credits have been used up. Please upgrade to a Pro plan to continue.' }
      }
    }

    console.log(`[Subscription Check] Access granted for user ${userId}`)
    return { hasAccess: true }
  }

  // Canceled/paused users still have full access until their paid period ends
  if (status === 'canceled' || status === 'paused') {
    if (user.subscriptionRenewalDate) {
      const endDate = new Date(user.subscriptionRenewalDate)
      const now = new Date()
      if (endDate > now) {
        console.log(`[Subscription Check] Access granted for ${status} user ${userId} — paid period ends ${endDate.toISOString()}`)
        return { hasAccess: true }
      }
    }
    console.log(`[Subscription Check] Access denied - subscription ${status} and paid period ended for user ${userId}`)
    return { hasAccess: false, reason: `Your subscription has been ${status}. Please resubscribe to send prompts.` }
  }

  console.log(`[Subscription Check] Access denied for user ${userId}: status is ${status}`)
  return { hasAccess: false, reason: `Subscription status: ${status}` }
}

// Async version that syncs with Stripe before denying access
const checkSubscriptionStatusAsync = async (userId) => {
  const result = await checkSubscriptionStatus(userId)
  
  // If access is granted, return immediately
  if (result.hasAccess) return result
  
  // If access denied and user has a Stripe customer ID, sync from Stripe before final denial
  const users = readUsers()
  const user = users[userId]
  if (user && user.stripeCustomerId) {
    console.log(`[Subscription Check] Access denied locally for ${userId}, syncing from Stripe before final denial...`)
    const syncResult = await syncSubscriptionFromStripe(userId, 1)
    if (syncResult.synced && (syncResult.status === 'active' || syncResult.status === 'trialing')) {
      console.log(`[Subscription Check] Stripe sync restored access for ${userId}: ${syncResult.status}`)
      return { hasAccess: true }
    }
  }
  
  return result
}

// API endpoint to proxy LLM calls
app.post('/api/llm', async (req, res) => {
  // Extract variables at the top level so they're available in catch block
  const { provider, model, prompt, userId, isSummary } = req.body || {}
  let apiKey = null // Declare at top level so it's available in catch block
  let responseText = null
  
  try {
    console.log('[Backend] Received request:', {
      provider,
      model,
      promptLength: prompt?.length,
      isSummary: isSummary || false, // Flag indicating this is a summary call, not a user prompt
    })
    
    // Note: Summary calls (isSummary=true) are NOT counted as prompts.
    // They only track token usage, not prompt counts.

    if (!provider || !model || !prompt) {
      return res.status(400).json({ 
        error: 'Missing required fields: provider, model, or prompt' 
      })
    }

    // Check subscription status (skip for summary calls to allow summaries even without subscription)
    if (!isSummary && userId) {
      const subscriptionCheck = await checkSubscriptionStatusAsync(userId)
      if (!subscriptionCheck.hasAccess) {
        return res.status(403).json({ 
          error: 'Active subscription required. Please subscribe to use this service.',
          subscriptionRequired: true,
          reason: subscriptionCheck.reason
        })
      }
    }

    // Get API key from backend configuration (not from frontend)
    apiKey = API_KEYS[provider]
    if (!apiKey || apiKey.trim() === '') {
      return res.status(400).json({ 
        error: `No API key configured for provider: ${provider}. Please add it to the backend .env file.` 
      })
    }

    let response

    // Map UI model names to actual API model names
    const modelMappings = {
      // Anthropic Claude models
      'claude-4.5-opus': 'claude-opus-4-5-20251101',
      'claude-4.5-sonnet': 'claude-sonnet-4-5-20250929',
      'claude-4.5-haiku': 'claude-haiku-4-5-20251001',
      
      // Google Gemini models
      'gemini-3-pro': 'gemini-3-pro-preview',
      'gemini-3-flash': 'gemini-3-flash-preview',
      // gemini-2.5-flash-lite is already correct
      
      // Mistral models
      'magistral-medium': 'magistral-medium-latest',
      'mistral-medium-3.1': 'mistral-medium-latest',
      'mistral-small-3.2': 'mistral-small-latest',
    }
    
    // Apply mapping if it exists, otherwise use the model name as-is
    const mappedModel = modelMappings[model] || model
    
    if (modelMappings[model]) {
      console.log(`[Backend] Model mapping: "${model}" -> "${mappedModel}"`)
    }

    // OpenAI-compatible providers (OpenAI, xAI, Meta, DeepSeek, Mistral)
    if (['openai', 'xai', 'meta', 'deepseek', 'mistral'].includes(provider)) {
      const baseUrls = {
        openai: 'https://api.openai.com/v1',
        xai: 'https://api.x.ai/v1',
        meta: 'https://api.groq.com/openai/v1', // Meta models via Groq
        deepseek: 'https://api.deepseek.com/v1', // DeepSeek direct API
        mistral: 'https://api.mistral.ai/v1',
      }

      try {
        console.log(`[Backend] ===== LLM API CALL =====`)
        console.log(`[Backend] Provider: ${provider}`)
        console.log(`[Backend] User Selected Model: ${model}`)
        console.log(`[Backend] API Model Name: ${mappedModel}`)
        console.log(`[Backend] Model: ${model} (passed through as-is - no mapping)`)
        console.log(`[Backend] Using backend-configured API key (length: ${apiKey?.length})`)
        
        // For xAI, try to list available models first if we get a 404 (for debugging)
        if (provider === 'xai') {
          try {
            const modelsResponse = await axios.get(
              `${baseUrls[provider]}/models`,
              {
                headers: {
                  'Authorization': `Bearer ${apiKey}`,
                },
              }
            )
            const availableModels = modelsResponse.data?.data?.map(m => m.id) || []
            console.log(`[Backend] Available xAI models:`, availableModels)
          } catch (listError) {
            console.log(`[Backend] Could not list xAI models (this is okay):`, listError.message)
          }
        }
        
        // Some models only support default temperature (1) and don't accept the temperature parameter
        // gpt-5-mini only supports the default temperature value (1)
        const modelsWithFixedTemperature = ['gpt-5-mini']
        const shouldUseDefaultTemperature = modelsWithFixedTemperature.includes(mappedModel) || modelsWithFixedTemperature.includes(model)
        
        const apiRequestBody = {
          model: mappedModel, // Use mapped model name (or original if no mapping)
          messages: [{ role: 'user', content: prompt }],
          ...(shouldUseDefaultTemperature ? {} : { temperature: 0.7 }),
        }
        
        console.log(`[Backend] API Request URL: ${baseUrls[provider]}/chat/completions`)
        console.log(`[Backend] API Request Body:`, JSON.stringify(apiRequestBody, null, 2))
        
        response = await axios.post(
          `${baseUrls[provider]}/chat/completions`,
          apiRequestBody,
          {
            headers: {
              'Authorization': `Bearer ${apiKey}`,
              'Content-Type': 'application/json',
            },
          }
        )
        
        console.log(`[Backend] ✅ API Call Successful - Model ${mappedModel} responded`)

        let rawContent = response.data.choices[0].message.content
        
        // Clean Mistral responses to remove thinking/reasoning content
        // NOTE: Mistral is temporarily disabled in main app UI but backend support remains intact
        if (provider === 'mistral') {
          rawContent = cleanMistralResponse(rawContent)
        }
        
        responseText = rawContent
        
        // Track usage if userId is provided
        if (userId && responseText) {
          // First, try to extract token counts from API response (most accurate)
          let inputTokens = 0
          let outputTokens = 0
          
          const responseTokens = extractTokensFromResponse(response.data, provider)
          if (responseTokens) {
            // Use token counts from API response (most accurate)
            inputTokens = responseTokens.inputTokens || 0
            outputTokens = responseTokens.outputTokens || 0
            // Use totalTokens from API if available (includes thoughtsTokenCount for reasoning models)
            const totalTokens = responseTokens.totalTokens || (inputTokens + outputTokens)
            console.log(`[Token Tracking] Using API response tokens for ${provider}/${model}: input=${inputTokens}, output=${outputTokens}, total=${totalTokens}`)
          } else {
            // Fallback: Count tokens ourselves using provider-specific tokenizers
            console.log(`[Token Tracking] API response has no token counts for ${provider}/${model}, checking response.data:`, {
              hasUsage: !!response.data?.usage,
              hasUsageMetadata: !!response.data?.usageMetadata,
              responseKeys: Object.keys(response.data || {})
            })
            inputTokens = await countTokens(prompt, provider, mappedModel)
            outputTokens = await countTokens(responseText, provider, mappedModel)
            console.log(`[Token Tracking] Counted tokens using tokenizer for ${provider}/${model}: input=${inputTokens}, output=${outputTokens}, total=${inputTokens + outputTokens}`)
          }
          
          trackUsage(userId, provider, model, inputTokens, outputTokens)
          
          // Flush token data to MongoDB before responding (Vercel serverless persistence)
          if (usageDirtyUsers.size > 0) {
            await flushUsageToMongo().catch(err => console.error('[LLM] Flush failed:', err.message))
          }
          
          // Calculate total tokens (use API totalTokenCount if available, otherwise sum)
          const totalTokens = responseTokens?.totalTokens || (inputTokens + outputTokens)
          
          // Return token information in response
          return res.json({ 
            text: responseText,
            model: mappedModel, // Return the actual API model name used
            originalModel: model, // Return the user-selected model name
            tokens: {
              input: inputTokens || 0,
              output: outputTokens || 0,
              total: totalTokens, // Use API totalTokenCount when available
              provider: provider,
              model: model,
              source: responseTokens ? 'api_response' : 'tokenizer'
            }
          })
        } else {
          return res.json({ 
            text: responseText,
            model: mappedModel,
            originalModel: model,
            tokens: null
          })
        }
      } catch (apiError) {
        // Enhanced error logging for debugging
        console.error(`[Backend] ${provider} API Error:`, {
          originalModel: model,
          mappedModel: mappedModel,
          status: apiError.response?.status,
          statusText: apiError.response?.statusText,
          data: apiError.response?.data,
          message: apiError.message,
          apiKeyLength: apiKey?.length,
          apiKeyPrefix: apiKey?.substring(0, 10) + '...' // Log first 10 chars only for debugging
        })
        
        // Handle Mistral capacity/rate limit errors with user-friendly message
        if (provider === 'mistral') {
          const errorMessage = apiError.response?.data?.message || apiError.message || ''
          if (errorMessage.includes('Service tier capacity exceeded') || 
              errorMessage.includes('capacity exceeded') ||
              errorMessage.includes('rate limit') ||
              apiError.response?.status === 429) {
            return res.status(503).json({
              error: 'Mistral API capacity exceeded. The model is currently at capacity. Please try again later or use a different model.',
              model: mappedModel,
              originalModel: model,
              retryAfter: apiError.response?.headers?.['retry-after'] || null
            })
          }
        }
        
        // For xAI, try fallback models if primary fails
        if (provider === 'xai' && apiError.response?.status === 404) {
          // Map user-friendly names to actual API model names as fallback
          const modelMap = {
            'grok-4-1-fast-reasoning': ['grok-beta', 'grok-2-1212'],
            'grok-4-1-fast-non-reasoning': ['grok-beta', 'grok-2-1212'],
            'grok-4-heavy': ['grok-beta', 'grok-2-1212'],
            'grok-4-fast-reasoning': ['grok-beta', 'grok-2-1212'],
            'grok-4-fast-non-reasoning': ['grok-beta', 'grok-2-1212'],
          }
          
          const fallbackModels = modelMap[model] || ['grok-beta', 'grok-2-1212', 'grok-vision-beta']
          
          for (const fallbackModel of fallbackModels) {
            if (mappedModel === fallbackModel) continue // Skip if we already tried this
            console.log(`[Backend] Trying fallback model: ${fallbackModel} for original model: ${model}`)
            try {
              response = await axios.post(
                `${baseUrls[provider]}/chat/completions`,
                {
                  model: fallbackModel,
                  messages: [{ role: 'user', content: prompt }],
                  temperature: 0.7,
                },
                {
                  headers: {
                    'Authorization': `Bearer ${apiKey}`,
                    'Content-Type': 'application/json',
                  },
                }
              )
              console.log(`[Backend] Successfully used fallback model: ${fallbackModel}`)
              responseText = response.data.choices[0].message.content
              
              // Track usage if userId is provided
              let inputTokens = 0
              let outputTokens = 0
              let tokenSource = 'none'
              
              if (userId && responseText) {
                const responseTokens = extractTokensFromResponse(response.data, provider)
                
                if (responseTokens) {
                  inputTokens = responseTokens.inputTokens || 0
                  outputTokens = responseTokens.outputTokens || 0
                  tokenSource = 'api_response'
                } else {
                  inputTokens = await countTokens(prompt, provider, fallbackModel)
                  outputTokens = await countTokens(responseText, provider, fallbackModel)
                  tokenSource = 'tokenizer'
                }
                
                trackUsage(userId, provider, fallbackModel, inputTokens, outputTokens)
              }
              
              return res.json({ 
                text: responseText,
                model: fallbackModel,
                originalModel: model,
                tokens: userId && responseText ? {
                  input: inputTokens,
                  output: outputTokens,
                  total: inputTokens + outputTokens,
                  provider: provider,
                  model: fallbackModel,
                  source: tokenSource
                } : null
              })
            } catch (fallbackError) {
              console.error(`[Backend] Fallback model ${fallbackModel} also failed:`, fallbackError.response?.data)
              continue // Try next fallback
            }
          }
        }
        
        // Re-throw with more context
        throw apiError
      }
    }

    // Anthropic (Claude)
    if (provider === 'anthropic') {
      // Use mapped model (mapping applied above)
      console.log(`[Backend] Calling Anthropic with model: ${mappedModel}${model !== mappedModel ? ` (mapped from ${model})` : ''}`)
      
      try {
        response = await axios.post(
          'https://api.anthropic.com/v1/messages',
          {
            model: mappedModel,
            max_tokens: 1024,
            messages: [{ role: 'user', content: prompt }],
          },
          {
            headers: {
              'x-api-key': apiKey,
              'anthropic-version': '2023-06-01',
              'Content-Type': 'application/json',
            },
          }
        )

        if (response.data.content && response.data.content.length > 0) {
          responseText = response.data.content[0].text
          
          // Track usage if userId is provided
          let inputTokens = 0
          let outputTokens = 0
          let tokenSource = 'none'
          
          if (userId && responseText) {
            const responseTokens = extractTokensFromResponse(response.data, provider)
            
            if (responseTokens) {
              inputTokens = responseTokens.inputTokens || 0
              outputTokens = responseTokens.outputTokens || 0
              tokenSource = 'api_response'
            } else {
              inputTokens = await countTokens(prompt, provider, mappedModel)
              outputTokens = await countTokens(responseText, provider, mappedModel)
              tokenSource = 'tokenizer'
            }
            
            trackUsage(userId, provider, model, inputTokens, outputTokens)
          }
          
          return res.json({ 
            text: responseText,
            model: mappedModel,
            originalModel: model,
            tokens: userId && responseText ? {
              input: inputTokens,
              output: outputTokens,
              total: inputTokens + outputTokens,
              provider: provider,
              model: model,
              source: tokenSource
            } : null
          })
        }
        throw new Error('No content in response')
      } catch (anthropicError) {
        const errorDetails = {
          model: model,
          status: anthropicError.response?.status,
          statusText: anthropicError.response?.statusText,
          data: anthropicError.response?.data,
          message: anthropicError.message
        }
        console.error('[Backend] Anthropic API Error:', JSON.stringify(errorDetails, null, 2))
        
        // If it's a 404, provide a helpful error message
        if (anthropicError.response?.status === 404) {
          const apiErrorMsg = anthropicError.response?.data?.error?.message || 'Model not found'
          const errorMsg = `Anthropic API Error: ${apiErrorMsg}. The model "${model}" may not exist or may have been deprecated. Please check Anthropic's documentation for current available models.`
          throw new Error(errorMsg)
        }
        
        throw anthropicError
      }
    }

    // Google (Gemini)
    if (provider === 'google') {
      // Use mapped model name (e.g., gemini-3-pro -> gemini-3-pro-preview)
      const mappedGeminiModel = mappedModel
      
      // Determine API version - preview models use v1beta, stable models use v1
      const isPreviewModel = mappedGeminiModel.includes('-preview')
      const apiVersion = isPreviewModel ? 'v1beta' : 'v1'
      const baseUrl = `https://generativelanguage.googleapis.com/${apiVersion}`
      const endpoint = `/models/${mappedGeminiModel}:generateContent`

      console.log(`[Backend] Gemini API call:`, {
        baseUrl,
        endpoint,
        mappedModel: mappedGeminiModel,
        originalModel: model,
        apiVersion
      })

      // Try with header authentication first
      try {
              response = await axios.post(
                `${baseUrl}${endpoint}`,
                {
                  contents: [{ parts: [{ text: prompt }] }],
                },
          {
            headers: {
              'x-goog-api-key': apiKey,
              'Content-Type': 'application/json',
            },
          }
        )
      } catch (headerError) {
        console.error(`[Backend] Header auth failed:`, {
          status: headerError.response?.status,
          statusText: headerError.response?.statusText,
          data: headerError.response?.data,
          message: headerError.message
        })
        
        // No fallback - use model name as-is from UI
        
        // If header auth fails, try query parameter
        try {
                response = await axios.post(
                  `${baseUrl}${endpoint}?key=${apiKey}`,
                  {
                    contents: [{ parts: [{ text: prompt }] }],
                  },
            {
              headers: {
                'Content-Type': 'application/json',
              },
            }
          )
        } catch (queryError) {
          // No fallback - use model name as-is from UI
          // If both fail, try to list available models to help debug
          console.error(`[Backend] Query param auth also failed. Listing available models...`)
          try {
            const listResponse = await axios.get(
              `${baseUrl}/models?key=${apiKey}`
            )
            const availableModels = listResponse.data?.models?.map(m => m.name) || []
            console.log(`[Backend] Available Gemini models (${apiVersion}):`, availableModels)
            
            // Also try v1beta if we were using v1
            if (apiVersion === 'v1') {
              try {
                const v1betaList = await axios.get(
                  `https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`
                )
                const v1betaModels = v1betaList.data?.models?.map(m => m.name) || []
                console.log(`[Backend] Available Gemini models (v1beta):`, v1betaModels)
              } catch (e) {
                console.error(`[Backend] Could not list v1beta models:`, e.message)
              }
            }
          } catch (listError) {
            console.error(`[Backend] Could not list models:`, listError.message)
          }
          throw queryError
        }
      }

      responseText = response.data.candidates[0].content.parts[0].text
      
      // ALWAYS extract token usage from Gemini API response (usageMetadata)
      // This is the ONLY reliable source of token counts per request
      let inputTokens = 0
      let outputTokens = 0
      let totalTokens = 0
      let tokenSource = 'none'
      let responseTokens = null
      
      if (responseText) {
        responseTokens = extractTokensFromResponse(response.data, provider)
        
        if (responseTokens) {
          // Use API response tokens (most accurate - from usageMetadata)
          inputTokens = responseTokens.inputTokens || 0
          outputTokens = responseTokens.outputTokens || 0
          // Use totalTokens from API if available (includes thoughtsTokenCount for reasoning models)
          // Otherwise calculate as fallback
          totalTokens = responseTokens.totalTokens || (inputTokens + outputTokens)
          tokenSource = 'api_response'
          console.log(`[Token Tracking] ✅ Gemini API returned usageMetadata for ${model}: promptTokenCount=${inputTokens}, candidatesTokenCount=${outputTokens}, totalTokenCount=${totalTokens}`)
        } else {
          // Log what we received to debug why usageMetadata wasn't found
          console.warn(`[Token Tracking] ⚠️ Gemini API response missing usageMetadata for ${model}. Response structure:`, {
            hasUsageMetadata: !!response.data?.usageMetadata,
            hasUsage_metadata: !!response.data?.usage_metadata,
            responseKeys: Object.keys(response.data || {}),
            usageMetadataSample: response.data?.usageMetadata ? JSON.stringify(response.data.usageMetadata) : 'NOT FOUND'
          })
          // Fallback to tokenizer estimation (less accurate)
          inputTokens = await countTokens(prompt, provider, mappedModel)
          outputTokens = await countTokens(responseText, provider, mappedModel)
          totalTokens = inputTokens + outputTokens
          tokenSource = 'tokenizer'
          console.log(`[Token Tracking] ⚠️ Gemini: Using tokenizer fallback for ${model}: input=${inputTokens}, output=${outputTokens}, total=${totalTokens}`)
        }
        
        // Track usage in database if userId is provided
        if (userId) {
          trackUsage(userId, provider, model, inputTokens, outputTokens)
        }
      }
      
      // Flush token data to MongoDB before responding (Vercel serverless persistence)
      if (userId && usageDirtyUsers.size > 0) {
        await flushUsageToMongo().catch(err => console.error('[LLM Gemini] Flush failed:', err.message))
      }
      
      return res.json({ 
        text: responseText,
        model: mappedModel,
        originalModel: model,
        // Always return tokens if we extracted them (even without userId)
        // This allows the frontend to display token usage
        tokens: responseText ? {
          input: inputTokens,
          output: outputTokens,
          total: totalTokens, // Use API totalTokenCount when available (includes thoughtsTokenCount)
          reasoningTokens: responseTokens?.reasoningTokens || 0, // Reasoning tokens from API metadata
          provider: provider,
          model: model,
          source: tokenSource
        } : null
      })
    }

    return res.status(400).json({ error: `Unknown provider: ${provider}` })
  } catch (error) {
    console.error('Proxy error:', error)
    
    // Get provider and model from the request body (they might not be in scope if error happened early)
    const requestProvider = req.body?.provider || provider
    const requestModel = req.body?.model || model
    
    console.error('Request details:', {
      provider: requestProvider,
      model: requestModel,
      hasApiKey: !!apiKey,
      apiKeyLength: apiKey?.length,
      errorStatus: error.response?.status,
      errorData: error.response?.data
    })
    
    // Provide more helpful error messages based on status code
    let errorMessage = error.response?.data?.error?.message 
      || error.response?.data?.message
      || error.message
      || 'Unknown error occurred'
    
    // Add context for common errors
    if (error.response?.status === 401) {
      errorMessage = `Unauthorized (401): Invalid API key for ${requestProvider}. Please check your API key in the .env file.`
    } else if (error.response?.status === 400) {
      errorMessage = `Bad Request (400): ${errorMessage}. Check if the model name "${requestModel}" is correct for ${requestProvider}.`
    } else if (error.response?.status === 404) {
      errorMessage = `Not Found (404): Model "${requestModel}" not found for ${requestProvider}. Please check the model name.`
    }

    // Include more details in the error response for debugging
    const errorDetails = {
      error: errorMessage,
      status: error.response?.status,
      model: requestModel,
      provider: requestProvider
    }

    return res.status(error.response?.status || 500).json(errorDetails)
  }
})

// ==================== STREAMING LLM ENDPOINT ====================
// SSE streaming version of /api/llm for individual model responses
app.post('/api/llm/stream', async (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream')
  res.setHeader('Cache-Control', 'no-cache')
  res.setHeader('Connection', 'keep-alive')
  res.setHeader('X-Accel-Buffering', 'no')
  res.flushHeaders()

  const sendSSE = (type, data) => {
    res.write(`data: ${JSON.stringify({ type, ...data })}\n\n`)
  }

  // Keep-alive heartbeat — prevents browser/proxy from closing idle SSE connections
  // SSE comment lines (starting with :) are ignored by the client parser
  const heartbeat = setInterval(() => {
    try { res.write(': heartbeat\n\n') } catch (e) { clearInterval(heartbeat) }
  }, 15000)

  const { provider, model, prompt, userId, isSummary, rolePrompt } = req.body || {}

  try {
    if (!provider || !model || !prompt) {
      sendSSE('error', { message: 'Missing required fields: provider, model, or prompt' })
      clearInterval(heartbeat)
      return res.end()
    }

    if (!isSummary && userId) {
      const subscriptionCheck = await checkSubscriptionStatusAsync(userId)
      if (!subscriptionCheck.hasAccess) {
        sendSSE('error', { message: 'Active subscription required.', subscriptionRequired: true })
        clearInterval(heartbeat)
        return res.end()
      }
    }

    const apiKey = API_KEYS[provider]
    if (!apiKey || apiKey.trim() === '') {
      sendSSE('error', { message: `No API key configured for provider: ${provider}` })
      clearInterval(heartbeat)
      return res.end()
    }

    const modelMappings = {
      'claude-4.5-opus': 'claude-opus-4-5-20251101',
      'claude-4.5-sonnet': 'claude-sonnet-4-5-20250929',
      'claude-4.5-haiku': 'claude-haiku-4-5-20251001',
      'gemini-3-pro': 'gemini-3-pro-preview',
      'gemini-3-flash': 'gemini-3-flash-preview',
      'magistral-medium': 'magistral-medium-latest',
      'mistral-medium-3.1': 'mistral-medium-latest',
      'mistral-small-3.2': 'mistral-small-latest',
    }
    const mappedModel = modelMappings[model] || model

    let fullResponse = ''
    let inputTokens = 0
    let outputTokens = 0

    // OpenAI-compatible providers
    if (['openai', 'xai', 'meta', 'deepseek', 'mistral'].includes(provider)) {
      const baseUrls = {
        openai: 'https://api.openai.com/v1',
        xai: 'https://api.x.ai/v1',
        meta: 'https://api.groq.com/openai/v1',
        deepseek: 'https://api.deepseek.com/v1',
        mistral: 'https://api.mistral.ai/v1',
      }

      const modelsWithFixedTemperature = ['gpt-5-mini']
      const shouldUseDefaultTemperature = modelsWithFixedTemperature.includes(mappedModel) || modelsWithFixedTemperature.includes(model)

      const messages = []
      if (rolePrompt) messages.push({ role: 'system', content: rolePrompt })
      messages.push({ role: 'user', content: prompt })

      const streamResponse = await axios.post(
        `${baseUrls[provider]}/chat/completions`,
        {
          model: mappedModel,
          messages,
          ...(shouldUseDefaultTemperature ? {} : { temperature: 0.7 }),
          stream: true,
          stream_options: { include_usage: true }
        },
        {
          headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
          responseType: 'stream'
        }
      )

      await new Promise((resolve, reject) => {
        streamResponse.data.on('data', (chunk) => {
          const lines = chunk.toString().split('\n').filter(l => l.trim().startsWith('data:'))
          for (const line of lines) {
            const jsonStr = line.replace(/^data:\s*/, '').trim()
            if (jsonStr === '[DONE]') continue
            try {
              const parsed = JSON.parse(jsonStr)
              const token = parsed.choices?.[0]?.delta?.content || ''
              if (token) {
                fullResponse += token
                sendSSE('token', { content: token })
              }
              if (parsed.usage) {
                inputTokens = parsed.usage.prompt_tokens || 0
                outputTokens = parsed.usage.completion_tokens || 0
              }
            } catch (e) { /* skip */ }
          }
        })
        streamResponse.data.on('end', resolve)
        streamResponse.data.on('error', reject)
      })

      // Clean Mistral responses
      if (provider === 'mistral') {
        fullResponse = cleanMistralResponse(fullResponse)
      }

    } else if (provider === 'anthropic') {
      const anthropicBody = {
        model: mappedModel,
        max_tokens: 4096,
        messages: [{ role: 'user', content: prompt }],
        stream: true
      }
      if (rolePrompt) anthropicBody.system = rolePrompt

      const streamResponse = await axios.post(
        'https://api.anthropic.com/v1/messages',
        anthropicBody,
        {
          headers: {
            'x-api-key': apiKey,
            'anthropic-version': '2023-06-01',
            'Content-Type': 'application/json'
          },
          responseType: 'stream',
          timeout: 120000 // 2 minute timeout for slow models like Opus
        }
      )

      await new Promise((resolve, reject) => {
        let buffer = ''
        let streamError = null
        const processAnthropicLine = (line) => {
          if (line.startsWith('data: ')) {
            const jsonStr = line.replace('data: ', '').trim()
            if (!jsonStr) return
            try {
              const parsed = JSON.parse(jsonStr)
              if (parsed.type === 'content_block_delta') {
                // Handle both text and thinking deltas
                const text = parsed.delta?.text || ''
                if (text) {
                  fullResponse += text
                  sendSSE('token', { content: text })
                }
              }
              if (parsed.type === 'message_delta' && parsed.usage) {
                outputTokens = parsed.usage.output_tokens || 0
              }
              if (parsed.type === 'message_start' && parsed.message?.usage) {
                inputTokens = parsed.message.usage.input_tokens || 0
              }
              if (parsed.type === 'error') {
                console.error(`[LLM Stream] Anthropic stream error event:`, parsed.error || parsed)
                streamError = parsed.error?.message || 'Anthropic stream error'
              }
            } catch (e) { /* skip unparseable */ }
          }
        }
        streamResponse.data.on('data', (chunk) => {
          buffer += chunk.toString()
          const lines = buffer.split('\n')
          buffer = lines.pop() || ''
          for (const line of lines) {
            processAnthropicLine(line)
          }
        })
        streamResponse.data.on('end', () => {
          // Flush remaining buffer
          if (buffer.trim()) {
            const remaining = buffer.split('\n')
            for (const line of remaining) {
              processAnthropicLine(line)
            }
          }
          if (streamError && !fullResponse) {
            reject(new Error(streamError))
          } else {
            resolve()
          }
        })
        streamResponse.data.on('error', (err) => {
          console.error(`[LLM Stream] Anthropic stream connection error:`, err.message)
          reject(err)
        })
      })

      console.log(`[LLM Stream] Anthropic stream completed for ${mappedModel}, response length: ${fullResponse.length}`)

    } else if (provider === 'google') {
      const isPreviewModel = mappedModel.includes('-preview')
      const apiVersion = isPreviewModel ? 'v1beta' : 'v1'
      const baseUrl = `https://generativelanguage.googleapis.com/${apiVersion}`

      const geminiBody = {
        contents: [{ parts: [{ text: prompt }] }],
      }
      if (rolePrompt) {
        geminiBody.systemInstruction = { parts: [{ text: rolePrompt }] }
      }

      const streamResponse = await axios.post(
        `${baseUrl}/models/${mappedModel}:streamGenerateContent?key=${apiKey}&alt=sse`,
        geminiBody,
        { responseType: 'stream' }
      )

      await new Promise((resolve, reject) => {
        let buffer = ''
        const processGoogleLine = (line) => {
          if (line.startsWith('data: ')) {
            const jsonStr = line.replace('data: ', '').trim()
            if (!jsonStr) return
            try {
              const parsed = JSON.parse(jsonStr)
              const text = parsed.candidates?.[0]?.content?.parts?.[0]?.text || ''
              if (text) {
                fullResponse += text
                sendSSE('token', { content: text })
              }
              if (parsed.usageMetadata) {
                inputTokens = parsed.usageMetadata.promptTokenCount || inputTokens
                outputTokens = parsed.usageMetadata.candidatesTokenCount || outputTokens
              }
            } catch (e) { /* skip */ }
          }
        }
        streamResponse.data.on('data', (chunk) => {
          buffer += chunk.toString()
          const lines = buffer.split('\n')
          buffer = lines.pop() || ''
          for (const line of lines) {
            processGoogleLine(line)
          }
        })
        streamResponse.data.on('end', () => {
          // Flush remaining buffer
          if (buffer.trim()) {
            const remaining = buffer.split('\n')
            for (const line of remaining) {
              processGoogleLine(line)
            }
          }
          resolve()
        })
        streamResponse.data.on('error', reject)
      })

    } else {
      sendSSE('error', { message: `Unknown provider: ${provider}` })
      clearInterval(heartbeat)
      return res.end()
    }

    // Determine if tokens came from the API stream or need estimation
    let tokenSource = 'api_response' // assume API reported them via the stream
    if (inputTokens === 0 && outputTokens === 0) {
      // API didn't return usage — fall back to estimation
      tokenSource = 'estimated'
      try {
        inputTokens = await countTokens(prompt, provider, mappedModel)
        outputTokens = await countTokens(fullResponse, provider, mappedModel)
      } catch (e) { /* skip */ }
    }

    // Track usage
    if (userId && fullResponse) {
      trackUsage(userId, provider, model, inputTokens, outputTokens)
    }

    const totalTokens = inputTokens + outputTokens

    // Send final metadata
    sendSSE('done', {
      text: fullResponse,
      model: mappedModel,
      originalModel: model,
      tokens: {
        input: inputTokens,
        output: outputTokens,
        total: totalTokens,
        provider,
        model,
        source: tokenSource
      }
    })

    // Flush token data to MongoDB before ending (Vercel may freeze instance after res.end)
    if (userId && usageDirtyUsers.size > 0) {
      await flushUsageToMongo().catch(err => console.error('[LLM Stream] Flush failed:', err.message))
    }

    clearInterval(heartbeat)
    res.end()

  } catch (error) {
    clearInterval(heartbeat)
    console.error(`[LLM Stream] Error for ${provider}/${model}:`, error.message)
    if (error.response) {
      console.error('[LLM Stream] API Error status:', error.response.status, error.response.statusText)
      try {
        if (typeof error.response.data === 'string') {
          console.error('[LLM Stream] API Error body:', error.response.data.substring(0, 500))
        } else if (error.response.data && typeof error.response.data === 'object' && !error.response.data.on) {
          console.error('[LLM Stream] API Error body:', JSON.stringify(error.response.data).substring(0, 500))
        }
      } catch (e) { /* skip */ }
    }
    try {
      sendSSE('error', { message: error.response?.data?.error?.message || error.message || 'Unknown error' })
      res.end()
    } catch (e) {
      console.error('[LLM Stream] Failed to send error to client:', e.message)
    }
  }
})

// ==================== STREAMING SUMMARY ENDPOINT ====================
// SSE streaming version for judge/summary generation (always Gemini 3 Flash)
app.post('/api/summary/stream', async (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream')
  res.setHeader('Cache-Control', 'no-cache')
  res.setHeader('Connection', 'keep-alive')
  res.setHeader('X-Accel-Buffering', 'no')
  res.flushHeaders()

  const sendSSE = (type, data) => {
    res.write(`data: ${JSON.stringify({ type, ...data })}\n\n`)
  }

  try {
    const { prompt, userId } = req.body
    if (!prompt) {
      sendSSE('error', { message: 'Missing prompt' })
      return res.end()
    }

    const apiKey = API_KEYS.google
    if (!apiKey) {
      sendSSE('error', { message: 'Google API key not configured' })
      return res.end()
    }

    const judgeModel = 'gemini-3-flash'
    const judgeModelApi = 'gemini-3-flash-preview'
    let fullResponse = ''
    let inputTokens = 0
    let outputTokens = 0

    const streamResponse = await axios.post(
      `https://generativelanguage.googleapis.com/v1beta/models/${judgeModelApi}:streamGenerateContent?key=${apiKey}&alt=sse`,
      {
        contents: [{ parts: [{ text: prompt }] }],
      },
      { responseType: 'stream' }
    )

    await new Promise((resolve, reject) => {
      let buffer = ''
      const processLine = (line) => {
        if (line.startsWith('data: ')) {
          const jsonStr = line.replace('data: ', '').trim()
          if (!jsonStr) return
          try {
            const parsed = JSON.parse(jsonStr)
            const text = parsed.candidates?.[0]?.content?.parts?.[0]?.text || ''
            if (text) {
              fullResponse += text
              sendSSE('token', { content: text })
            }
            if (parsed.usageMetadata) {
              inputTokens = parsed.usageMetadata.promptTokenCount || inputTokens
              outputTokens = parsed.usageMetadata.candidatesTokenCount || outputTokens
            }
          } catch (e) { /* skip */ }
        }
      }
      streamResponse.data.on('data', (chunk) => {
        buffer += chunk.toString()
        const lines = buffer.split('\n')
        buffer = lines.pop() || ''
        for (const line of lines) {
          processLine(line)
        }
      })
      streamResponse.data.on('end', () => {
        if (buffer.trim()) {
          const remaining = buffer.split('\n')
          for (const line of remaining) {
            processLine(line)
          }
        }
        resolve()
      })
      streamResponse.data.on('error', reject)
    })

    // Determine if tokens came from the API stream or need estimation
    let tokenSource = 'api_response' // assume API reported them via the stream
    if (inputTokens === 0 && outputTokens === 0) {
      tokenSource = 'estimated'
      try {
        inputTokens = await countTokens(prompt, 'google', judgeModel)
        outputTokens = await countTokens(fullResponse, 'google', judgeModel)
      } catch (e) { /* skip */ }
    }

    // Track usage as summary call — user sees the summary output on screen,
    // so this is NOT pipeline (counts in visible counters).
    if (userId) {
      trackUsage(userId, 'google', judgeModel, inputTokens, outputTokens, false)
    }

    sendSSE('done', {
      text: fullResponse,
      model: judgeModel,
      tokens: {
        input: inputTokens,
        output: outputTokens,
        total: inputTokens + outputTokens,
        provider: 'google',
        model: judgeModel,
        source: tokenSource
      }
    })

    // Flush token data to MongoDB before ending (Vercel serverless persistence)
    if (userId && usageDirtyUsers.size > 0) {
      await flushUsageToMongo().catch(err => console.error('[Summary Stream] Flush failed:', err.message))
    }

    res.end()
  } catch (error) {
    console.error('[Summary Stream] Error:', error.message)
    sendSSE('error', { message: error.message })
    res.end()
  }
})

function buildSearchContextSnippet(contextSummaries = [], fallbackText = '') {
  const parts = []
  const latest = Array.isArray(contextSummaries) && contextSummaries.length > 0 ? contextSummaries[0] : null

  if (latest?.originalPrompt) {
    parts.push(`Previous user prompt: ${String(latest.originalPrompt).substring(0, 500)}`)
  }

  const latestAssistant = latest?.isFull && latest?.response ? latest.response : latest?.summary
  if (latestAssistant) {
    parts.push(`Previous assistant response: ${String(latestAssistant).substring(0, 1000)}`)
  } else if (fallbackText && String(fallbackText).trim()) {
    parts.push(`Previous assistant response: ${String(fallbackText).substring(0, 1000)}`)
  }

  return parts.join('\n')
}

// Reformulate a conversational user prompt into an effective Google search query
// Uses Gemini 2.5 Flash Lite for speed and cost efficiency
async function reformulateSearchQuery(userMessage, userId = null, contextSnippet = '') {
  try {
    const apiKey = API_KEYS.google
    if (!apiKey) {
      console.warn('[Query Reformulation] Google API key not configured, using raw query')
      return userMessage
    }

    const trimmedContext = String(contextSnippet || '').trim()
    const contextBlock = trimmedContext
      ? `\nConversation context (use this to resolve references like "this", "that", "it", and "latest"):\n${trimmedContext}\n`
      : ''

    const reformulationPrompt = `Convert the following user message into a concise, effective Google search query. 
- Remove conversational language, filler words, and self-referential pronouns (e.g. "your", "you", "my")
- Focus on the core topic the user wants information about
- If the message is a follow-up with vague references, resolve them using the conversation context
- Preserve specific topic nouns from context so the query is not generic
- Keep it under 10 words if possible
- Output ONLY the search query, nothing else
${contextBlock}

User message: "${userMessage}"

Search query:`

    const response = await axios.post(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-lite:generateContent?key=${apiKey}`,
      {
        contents: [{ parts: [{ text: reformulationPrompt }] }],
        generationConfig: {
          temperature: 0.2,
          maxOutputTokens: 50
        }
      }
    )

    const reformulated = response.data.candidates?.[0]?.content?.parts?.[0]?.text?.trim()
    
    if (reformulated && reformulated.length > 3 && reformulated.length < 200) {
      console.log(`[Query Reformulation] "${userMessage}" -> "${reformulated}"`)
      
      // Track tokens for reformulation (pipeline cost)
      if (userId) {
        const inputTokens = response.data.usageMetadata?.promptTokenCount || 0
        const outputTokens = response.data.usageMetadata?.candidatesTokenCount || 0
        if (inputTokens || outputTokens) {
          trackUsage(userId, 'google', 'gemini-2.5-flash-lite', inputTokens, outputTokens)
        }
      }
      
      return reformulated
    }
    
    console.warn('[Query Reformulation] Bad reformulation result, using raw query')
    return userMessage
  } catch (error) {
    console.error('[Query Reformulation] Error:', error.message)
    return userMessage // Fallback to raw query
  }
}

// ============================================================================
// EMBEDDING & MEMORY SYSTEM
// Uses OpenAI text-embedding-3-small to generate vector embeddings of
// conversations, stored in conversation_history alongside the original data.
// At query time, $vectorSearch finds the 3 most relevant past conversations
// for the current user and injects them as memory context.
// ============================================================================

/**
 * Generate a vector embedding for a piece of text using OpenAI text-embedding-3-small.
 * Returns an array of 1536 floats, or null on failure.
 */
async function generateEmbedding(text, userId = null) {
  const apiKey = API_KEYS.openai
  if (!apiKey) {
    console.warn('[Embedding] OpenAI API key not configured, skipping embedding')
    return null
  }

  try {
    // Truncate to ~8000 tokens worth of text (~32000 chars) to stay within model limits
    const truncated = text.length > 32000 ? text.substring(0, 32000) : text

    const response = await axios.post(
      'https://api.openai.com/v1/embeddings',
      {
        model: 'text-embedding-3-small',
        input: truncated,
      },
      {
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
      }
    )

    const embedding = response.data?.data?.[0]?.embedding
    if (!embedding || !Array.isArray(embedding)) {
      console.error('[Embedding] Unexpected response shape')
      return null
    }

    const tokensUsed = response.data?.usage?.total_tokens || 0
    console.log(`[Embedding] Generated ${embedding.length}-dim vector (${tokensUsed} tokens)`)

    // Track embedding tokens as pipeline usage (behind-the-scenes, not shown in per-model stats)
    if (userId && tokensUsed > 0) {
      trackUsage(userId, 'openai', 'text-embedding-3-small', tokensUsed, 0, true) // isPipeline = true
    }

    return embedding
  } catch (error) {
    console.error('[Embedding] Error generating embedding:', error.message)
    return null
  }
}

/**
 * Build a concise text representation of a conversation for embedding.
 * Combines the user's prompt with a brief summary of the response(s).
 */
function buildEmbeddingText(originalPrompt, responses, summary, conversationTurns) {
  let text = `User prompt: ${originalPrompt}`

  // Add summary if available (council mode)
  if (summary && summary.text) {
    // Use first 500 chars of the summary
    text += `\nSummary: ${summary.text.substring(0, 500)}`
  } else if (responses && responses.length > 0) {
    // Single model — use first 500 chars of the response
    const firstResponse = responses[0]?.text || responses[0]?.modelResponse || ''
    if (firstResponse) {
      text += `\nResponse: ${firstResponse.substring(0, 500)}`
    }
  }

  // Include follow-up conversation turns (captures the full thread of discussion)
  if (conversationTurns && conversationTurns.length > 0) {
    text += '\nFollow-up conversation:'
    for (const turn of conversationTurns) {
      text += `\nUser: ${(turn.user || '').substring(0, 200)}`
      text += `\n${turn.modelName || 'Assistant'}: ${(turn.assistant || '').substring(0, 300)}`
    }
    // Cap total embedding text at ~4000 chars to stay within embedding model limits
    if (text.length > 4000) {
      text = text.substring(0, 4000)
    }
  }

  return text
}

/**
 * Find the top N most relevant past conversations for a user, given a new prompt.
 * Uses MongoDB Atlas $vectorSearch on the conversation_history collection.
 * Returns an array of { title, originalPrompt, summarySnippet } objects.
 */
async function findRelevantContext(userId, currentPrompt, limit = 3, scoreThreshold = 0.75, targetModel = null) {
  if (!userId || !currentPrompt) return []

  try {
    // 1. Generate embedding for the current prompt
    const queryEmbedding = await generateEmbedding(`User prompt: ${currentPrompt}`, userId)
    if (!queryEmbedding) {
      console.log('[Memory] Could not generate query embedding, skipping context retrieval')
      return []
    }

    // 2. Run $vectorSearch against conversation_history
    //    Return full responses (modelName + text) so we can extract per-model context
    const dbInstance = await db.getDb()
    const results = await dbInstance.collection('conversation_history').aggregate([
      {
        $vectorSearch: {
          index: 'conversation_embedding_index',
          path: 'embedding',
          queryVector: queryEmbedding,
          numCandidates: 50,
          limit: limit + 5, // Fetch extra so we can filter by score
          filter: { userId: userId }
        }
      },
      {
        $project: {
          _id: 1,
          title: 1,
          originalPrompt: 1,
          'summary.text': 1,
          'summary.consensus': 1,
          'responses.modelName': 1,
          'responses.actualModelName': 1,
          'responses.text': 1,
          savedAt: 1,
          score: { $meta: 'vectorSearchScore' }
        }
      }
    ]).toArray()

    if (!results || results.length === 0) {
      console.log(`[Memory] No relevant past conversations found for user ${userId}`)
      return []
    }

    // 3. Filter by score threshold and format into concise context snippets
    const contexts = results
      .filter(r => r.score >= scoreThreshold)
      .slice(0, limit)
      .map(r => {
        let snippet = ''

        // --- Model-aware extraction ---
        // When continuing a conversation with a specific model, find THAT model's
        // past response instead of the generic judge summary. This gives the model
        // its own previous context for consistency.
        if (targetModel && r.responses && r.responses.length > 0) {
          const modelResponse = r.responses.find(resp => 
            resp.modelName === targetModel || resp.actualModelName === targetModel
          )
          if (modelResponse && modelResponse.text) {
            snippet = modelResponse.text.substring(0, 800)
            console.log(`[Memory] Using ${targetModel}'s specific response for context (${snippet.length} chars)`)
          }
          // Fall through to summary extraction if model not found in responses
        }

        // --- Council/general extraction (improved) ---
        if (!snippet && r.summary?.text) {
          const summaryText = r.summary.text

          // Extract SUMMARY section
          const summaryStart = summaryText.indexOf('## SUMMARY')
          const agreementsStart = summaryText.indexOf('## AGREEMENTS')
          const contradictionsStart = summaryText.indexOf('## CONTRADICTIONS')
          const disagreementsStart = contradictionsStart !== -1 ? contradictionsStart : summaryText.indexOf('## DISAGREEMENTS')
          let summarySection = ''
          if (summaryStart !== -1) {
            const summaryEnd = agreementsStart !== -1 ? agreementsStart : summaryText.length
            summarySection = summaryText.substring(summaryStart + 10, summaryEnd).trim()
          } else {
            // Fallback: skip the CONSENSUS line
            const lines = summaryText.split('\n').filter(l => l.trim() && !l.startsWith('**CONSENSUS'))
            summarySection = lines.join(' ').trim()
          }

          // Strip boilerplate meta-commentary (e.g. "All models state they have no memory...")
          // These patterns remove sentences about models lacking memory, requesting context, etc.
          // Applied repeatedly to catch multiple consecutive boilerplate sentences.
          const boilerplatePatterns = [
            // "All four models state they do not have / have no / cannot recall / lack memory..."
            /^all\s+(?:four\s+|three\s+|two\s+)?(?:council\s+)?models?\s+(?:unanimously\s+)?(?:state|agree|clarify|acknowledge|note|confirm|indicate|explain|emphasize)\s+(?:that\s+)?they\s+(?:do\s+not|don't|cannot|can\s*not|lack|have\s+no)\s+[^.]*(?:memory|recall|access|history|past\s+(?:conversations?|interactions?))[^.]*\.\s*/i,
            /^the\s+(?:council\s+)?models?\s+(?:unanimously\s+)?(?:state|agree|clarify|confirm|note)\s+(?:that\s+)?they\s+(?:do\s+not|don't|cannot|have\s+no|lack)[^.]*\.\s*/i,
            // "Each session is treated as a new start..."
            /^each\s+(?:model|session)\s+(?:is\s+)?(?:treated|started|considered)\s+as\s+[^.]*\.\s*/i,
            // "They all invite/request the user to provide..."
            /^they\s+(?:all\s+)?(?:collectively\s+)?(?:invite|request|encourage|ask)\s+the\s+user\s+to\s+(?:provide|share|give)[^.]*\.\s*/i,
            /^every\s+model\s+(?:requests?|asks?)\s+(?:that\s+)?the\s+user\s+provide[^.]*\.\s*/i,
            // "Despite this limitation..."  "However, all models express willingness..."
            /^despite\s+this\s+(?:limitation|constraint)[^.]*\.\s*/i,
            /^however,?\s+(?:all\s+)?(?:every\s+)?(?:each\s+)?(?:the\s+)?models?\s+(?:express|show|demonstrate)[^.]*willingness[^.]*\.\s*/i,
            // Lines starting with "- All models lack/confirm/state they have no..."
            /^-\s*all\s+models?\s+(?:lack|confirm|state|agree|note)\s+(?:they\s+)?(?:have\s+no|lack|cannot|do\s+not\s+have)\s+[^.\n]*(?:memory|access|history|recall|past\s+(?:conversations?|interactions?))[^.\n]*\.?\s*/im,
            /^-\s*each\s+(?:session|model)\s+is\s+(?:treated|started)\s+as\s+[^.\n]*\.?\s*/im,
            /^-\s*(?:all|every)\s+models?\s+(?:express|request|invite|ask)[^.\n]*(?:provide|context|summary|details)[^.\n]*\.?\s*/im,
          ]
          // Run multiple passes — removing one boilerplate sentence can expose the next
          for (let pass = 0; pass < 3; pass++) {
            const before = summarySection
            for (const pattern of boilerplatePatterns) {
              summarySection = summarySection.replace(pattern, '').trim()
            }
            if (summarySection === before) break // No more changes
          }

          // Extract AGREEMENTS section for concrete factual points
          let agreementsSection = ''
          if (agreementsStart !== -1) {
            const agreementsEnd = disagreementsStart !== -1 ? disagreementsStart : summaryText.length
            agreementsSection = summaryText.substring(agreementsStart + 14, agreementsEnd).trim()
            // Also strip boilerplate from agreements (multiple passes)
            for (let pass = 0; pass < 3; pass++) {
              const before = agreementsSection
              for (const pattern of boilerplatePatterns) {
                agreementsSection = agreementsSection.replace(pattern, '').trim()
              }
              if (agreementsSection === before) break
            }
          }

          // Combine summary + agreements up to 800 chars total
          if (summarySection && agreementsSection) {
            snippet = `${summarySection.substring(0, 400)}\nKey points: ${agreementsSection.substring(0, 400)}`
          } else if (summarySection) {
            snippet = summarySection
          } else if (agreementsSection) {
            snippet = agreementsSection
          }
          snippet = snippet.substring(0, 800)
        }

        // Fallback: use first response text
        if (!snippet && r.responses?.[0]?.text) {
          snippet = r.responses[0].text.substring(0, 800)
        }

        return {
          title: r.title || r.originalPrompt?.substring(0, 80),
          originalPrompt: r.originalPrompt,
          summarySnippet: snippet,
          score: r.score,
          savedAt: r.savedAt,
        }
      })

    if (contexts.length === 0) {
      console.log(`[Memory] All ${results.length} results below score threshold (${scoreThreshold}) for user ${userId} (best score: ${results[0]?.score?.toFixed(3)})`)
      return []
    }

    console.log(`[Memory] Found ${contexts.length} relevant past conversations for user ${userId} (scores: ${contexts.map(c => c.score?.toFixed(3)).join(', ')}, threshold: ${scoreThreshold}${targetModel ? `, targetModel: ${targetModel}` : ''})`)
    return contexts
  } catch (error) {
    // Gracefully handle cases where the vector search index doesn't exist yet
    if (error.codeName === 'InvalidPipelineOperator' || error.message?.includes('vectorSearch') || error.code === 40324) {
      console.warn('[Memory] Vector Search index not found — skipping context retrieval. Create the index in Atlas to enable memory.')
    } else {
      console.error('[Memory] Error finding relevant context:', error.message)
    }
    return []
  }
}

/**
 * Format relevant context into a string for injection into the council prompt.
 */
function formatMemoryContext(contexts) {
  if (!contexts || contexts.length === 0) return ''

  const formatted = contexts.map((ctx, i) => {
    const date = ctx.savedAt ? new Date(ctx.savedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : 'Unknown date'
    const ellipsis = ctx.summarySnippet.length >= 795 ? '...' : ''
    return `${i + 1}. [${date}] User asked: "${ctx.originalPrompt}"\n   Context: ${ctx.summarySnippet}${ellipsis}`
  }).join('\n\n')

  return `Relevant context from this user's previous conversations (use as background knowledge if helpful):\n\n${formatted}\n\n`
}

// ==================== MEMORY CONTEXT RETRIEVAL ====================
// Standalone endpoint to retrieve embedding-based memory context.
// Called by the frontend when needsContext=true but needsSearch=false,
// so that models in the direct (non-RAG) path still get memory injected.
app.post('/api/memory/retrieve', async (req, res) => {
  try {
    const { userId, prompt, needsContext, targetModel } = req.body
    if (!userId || !prompt) {
      return res.status(400).json({ error: 'userId and prompt are required' })
    }

    const scoreThreshold = needsContext ? 0.70 : 0.82
    const memoryContextItems = await findRelevantContext(userId, prompt, 3, scoreThreshold, targetModel || null)
    const memoryContextString = formatMemoryContext(memoryContextItems)

    // Quick diagnostic: count how many docs have embeddings for this user
    let diagnostics = null
    if (memoryContextItems.length === 0) {
      try {
        const dbInstance = await db.getDb()
        const totalDocs = await dbInstance.collection('conversation_history').countDocuments({ userId })
        const docsWithEmbedding = await dbInstance.collection('conversation_history').countDocuments({ userId, embedding: { $exists: true, $ne: null } })
        diagnostics = { totalDocs, docsWithEmbedding }
        console.log(`[Memory Retrieve] Diagnostics for ${userId}: ${totalDocs} total docs, ${docsWithEmbedding} with embeddings`)
      } catch (diagErr) {
        console.error('[Memory Retrieve] Diagnostic check failed:', diagErr.message)
      }
    }

    if (memoryContextString) {
      console.log(`[Memory Retrieve] Found ${memoryContextItems.length} items for user ${userId} (threshold: ${scoreThreshold})`)
    } else {
      console.log(`[Memory Retrieve] No relevant context for user ${userId} (threshold: ${scoreThreshold})`)
    }

    res.json({
      items: memoryContextItems,
      contextString: memoryContextString,
      needsContextHint: !!needsContext,
      scoreThreshold,
      injected: memoryContextItems.length > 0,
      diagnostics,
    })
  } catch (error) {
    console.error('[Memory Retrieve] Error:', error.message)
    res.json({ items: [], contextString: '', injected: false })
  }
})

// ==================== MEMORY DIAGNOSTICS ====================
// Checks embedding storage and vector search health for a user.
app.get('/api/memory/debug/:userId', async (req, res) => {
  try {
    const { userId } = req.params
    if (!userId) return res.status(400).json({ error: 'userId required' })

    const dbInstance = await db.getDb()
    const col = dbInstance.collection('conversation_history')

    // 1. Count total docs for this user
    const totalDocs = await col.countDocuments({ userId })

    // 2. Count docs with embeddings
    const docsWithEmbedding = await col.countDocuments({ userId, embedding: { $exists: true, $ne: null } })

    // 3. Sample recent docs to see if they have embeddings
    const recentDocs = await col.find({ userId })
      .sort({ savedAt: -1 })
      .limit(10)
      .project({ _id: 1, title: 1, originalPrompt: 1, savedAt: 1, embeddingText: 1, embedding: { $slice: 3 }, finalizedAt: 1 })
      .toArray()

    const docSummaries = recentDocs.map(d => ({
      id: d._id,
      title: d.title,
      prompt: (d.originalPrompt || '').substring(0, 100),
      savedAt: d.savedAt,
      hasEmbedding: !!(d.embedding && d.embedding.length > 0),
      embeddingDims: d.embedding ? d.embedding.length : 0,
      embeddingTextLength: d.embeddingText ? d.embeddingText.length : 0,
      embeddingTextPreview: d.embeddingText ? d.embeddingText.substring(0, 200) : null,
      finalizedAt: d.finalizedAt || null,
    }))

    // 4. Attempt vector search (without userId filter to test if index exists at all)
    let vectorSearchWorks = false
    let vectorSearchError = null
    let rawResults = []
    try {
      // Generate a test embedding
      const testEmbedding = await generateEmbedding('test query about hunting', userId)
      if (testEmbedding) {
        // Try without userId filter first
        const searchResults = await col.aggregate([
          {
            $vectorSearch: {
              index: 'conversation_embedding_index',
              path: 'embedding',
              queryVector: testEmbedding,
              numCandidates: 20,
              limit: 5
            }
          },
          {
            $project: {
              _id: 1,
              userId: 1,
              title: 1,
              originalPrompt: 1,
              score: { $meta: 'vectorSearchScore' }
            }
          }
        ]).toArray()

        vectorSearchWorks = true
        rawResults = searchResults.map(r => ({
          id: r._id,
          userId: r.userId,
          title: r.title,
          prompt: (r.originalPrompt || '').substring(0, 100),
          score: r.score,
        }))

        // 5. Try with userId filter
        let filteredResults = []
        try {
          const filteredSearch = await col.aggregate([
            {
              $vectorSearch: {
                index: 'conversation_embedding_index',
                path: 'embedding',
                queryVector: testEmbedding,
                numCandidates: 20,
                limit: 5,
                filter: { userId: userId }
              }
            },
            {
              $project: {
                _id: 1,
                userId: 1,
                title: 1,
                originalPrompt: 1,
                score: { $meta: 'vectorSearchScore' }
              }
            }
          ]).toArray()
          filteredResults = filteredSearch.map(r => ({
            id: r._id,
            userId: r.userId,
            title: r.title,
            prompt: (r.originalPrompt || '').substring(0, 100),
            score: r.score,
          }))
        } catch (filterErr) {
          filteredResults = { error: filterErr.message, code: filterErr.code, codeName: filterErr.codeName }
        }

        rawResults = {
          withoutFilter: rawResults,
          withUserIdFilter: filteredResults,
        }
      } else {
        vectorSearchError = 'Could not generate test embedding (OpenAI API key issue?)'
      }
    } catch (vsErr) {
      vectorSearchError = `${vsErr.message} (code: ${vsErr.code}, codeName: ${vsErr.codeName})`
    }

    res.json({
      userId,
      totalDocs,
      docsWithEmbedding,
      recentDocs: docSummaries,
      vectorSearch: {
        works: vectorSearchWorks,
        error: vectorSearchError,
        results: rawResults,
      },
      indexExpected: 'conversation_embedding_index',
      indexRequirements: {
        path: 'embedding',
        numDimensions: 1536,
        similarity: 'cosine',
        filterFields: ['userId'],
        note: 'The userId field MUST be defined as a "filter" type in the Atlas Search index definition for filtered $vectorSearch to work.'
      }
    })
  } catch (error) {
    console.error('[Memory Debug] Error:', error.message)
    res.status(500).json({ error: error.message })
  }
})

// Helper function for Serper search (used by both /api/search and RAG pipeline)
async function performSerperSearch(query, num = 10) {
  const apiKey = API_KEYS.serper
  if (!apiKey || apiKey.trim() === '') {
    throw new Error('No Serper API key configured. Please add SERPER_API_KEY to the backend .env file.')
  }

  // Append current month + year to the query so Google prioritizes recent results
  const dateTag = getCurrentMonthYear() // e.g. "February 2026"
  const datedQuery = `${query} ${dateTag}`

  console.log('[Serper] Search request:', { original: query, datedQuery, num })

  const response = await axios.post(
    'https://google.serper.dev/search',
    {
      q: datedQuery,
      num: num,
    },
    {
      headers: {
        'X-API-KEY': apiKey,
        'Content-Type': 'application/json',
      },
    }
  )

  console.log('[Serper] Search successful, results:', response.data?.organic?.length || 0)
  return response.data
}

// API endpoint for Serper search queries
app.post('/api/search', async (req, res) => {
  try {
    const { query, num = 10 } = req.body

    if (!query || !query.trim()) {
      return res.status(400).json({ 
        error: 'Missing required field: query' 
      })
    }

    const response = await performSerperSearch(query, num)

    // Track query usage (only when Serper query is successfully made)
    const { userId } = req.body
    if (userId) {
      const usage = readUsage()
      if (!usage[userId]) {
        usage[userId] = {
          totalTokens: 0,
          totalInputTokens: 0,
          totalOutputTokens: 0,
          totalQueries: 0,
          totalPrompts: 0,
          monthlyUsage: {},
          providers: {},
          models: {},
        }
      }
      
      const userUsage = usage[userId]
      const tz = getUserTimezone(userId)
      const currentMonth = getMonthForUser(tz)
      
      // Increment total queries
      userUsage.totalQueries = (userUsage.totalQueries || 0) + 1
      
      // Ensure monthlyUsage exists before accessing it
      if (!userUsage.monthlyUsage) {
        userUsage.monthlyUsage = {}
      }
      
      // Increment monthly queries
      if (!userUsage.monthlyUsage[currentMonth]) {
        userUsage.monthlyUsage[currentMonth] = { tokens: 0, inputTokens: 0, outputTokens: 0, queries: 0, prompts: 0 }
      }
      userUsage.monthlyUsage[currentMonth].queries = (userUsage.monthlyUsage[currentMonth].queries || 0) + 1
      
      // Track daily query usage
      const today = getTodayForUser(tz)
      if (!userUsage.dailyUsage) {
        userUsage.dailyUsage = {}
      }
      if (!userUsage.dailyUsage[currentMonth]) {
        userUsage.dailyUsage[currentMonth] = {}
      }
      if (!userUsage.dailyUsage[currentMonth][today]) {
        userUsage.dailyUsage[currentMonth][today] = { inputTokens: 0, outputTokens: 0, queries: 0, models: {} }
      }
      userUsage.dailyUsage[currentMonth][today].queries = (userUsage.dailyUsage[currentMonth][today].queries || 0) + 1
      
      writeUsage(usage, userId)
      console.log(`[Query Tracking] User ${userId}: Total queries ${userUsage.totalQueries}, Monthly queries ${userUsage.monthlyUsage[currentMonth].queries}`)
      
      // Also add query cost to monthlyUsageCost in users cache
      try {
        const users = readUsers()
        const user = users[userId]
        if (user) {
          const queryCost = calculateSerperQueryCost(1)
          if (!user.monthlyUsageCost) {
            user.monthlyUsageCost = {}
          }
          const existingCost = user.monthlyUsageCost[currentMonth] || 0
          user.monthlyUsageCost[currentMonth] = existingCost + queryCost
          writeUsers(users, userId)
          console.log(`[Query Tracking] Added $${queryCost.toFixed(6)} query cost. New total: $${user.monthlyUsageCost[currentMonth].toFixed(4)}`)
        }
      } catch (costErr) {
        console.error('[Query Tracking] Error updating monthlyUsageCost:', costErr)
      }
    }

    // Format the response to include organic results
    const searchResults = {
      query: query,
      results: response.data?.organic || [],
      answerBox: response.data?.answerBox || null,
      knowledgeGraph: response.data?.knowledgeGraph || null,
    }

    return res.json(searchResults)
  } catch (error) {
    console.error('[Backend] Serper search error:', error)
    
    let errorMessage = error.response?.data?.message 
      || error.response?.data?.error
      || error.message
      || 'Unknown error occurred'
    
    if (error.response?.status === 401) {
      errorMessage = 'Unauthorized (401): Invalid Serper API key. Please check your SERPER_API_KEY in the .env file.'
    } else if (error.response?.status === 400) {
      errorMessage = `Bad Request (400): ${errorMessage}`
    }

    return res.status(error.response?.status || 500).json({ 
      error: errorMessage 
    })
  }
})

// ============================================================================
// RAG Pipeline Implementation
// ============================================================================

// Helper function to verify citations exist in source text
const verifyExtraction = (rawText, factsJson) => {
  const verifiedFacts = []
  let discardedCount = 0
  
  for (const item of factsJson) {
    const factText = item.fact || ''
    const sourceQuote = item.source_quote || ''
    const sourceUrl = item.source_url || ''
    
    // Check if the quote exists in the raw text (case-insensitive)
    if (sourceQuote && rawText.toLowerCase().includes(sourceQuote.toLowerCase())) {
      verifiedFacts.push({
        fact: factText,
        source_quote: sourceQuote,
        source_url: sourceUrl
      })
    } else {
      discardedCount++
      console.log(`[Refiner] Hallucination detected! Discarding: ${factText.substring(0, 50)}...`)
    }
  }
  
  const discardRate = factsJson.length > 0 ? discardedCount / factsJson.length : 0
  console.log(`[Refiner] Verification: ${verifiedFacts.length}/${factsJson.length} facts verified (${(discardRate * 100).toFixed(1)}% discarded)`)
  
  return { verifiedFacts, discardRate }
}

// Fetch and extract text content from a URL
const fetchPageContent = async (url, timeout = 10000) => {
  try {
    const response = await axios.get(url, {
      timeout,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
      },
      maxRedirects: 5
    })
    
    const $ = cheerio.load(response.data)
    
    // Remove script and style elements
    $('script, style, nav, header, footer, aside, .ad, .advertisement, .sidebar').remove()
    
    // Extract text from main content areas (prioritize article, main, content areas)
    let content = ''
    
    // Try to find main content areas first
    const mainContent = $('article, main, [role="main"], .content, .post-content, .entry-content, .article-content')
    if (mainContent.length > 0) {
      // Extract paragraphs from the main content
      const paragraphs = mainContent.first().find('p').map((i, el) => $(el).text().trim()).get()
      // Filter out empty paragraphs and take first 4
      const validParagraphs = paragraphs.filter(p => p.length > 20).slice(0, 4)
      content = validParagraphs.join(' ')
      
      // If we didn't get enough paragraphs from <p> tags, fallback to text extraction
      if (content.length < 200) {
        content = mainContent.first().text()
      }
    } else {
      // Fallback to body text - try to extract paragraphs
      const paragraphs = $('body p').map((i, el) => $(el).text().trim()).get()
      const validParagraphs = paragraphs.filter(p => p.length > 20).slice(0, 4)
      content = validParagraphs.join(' ')
      
      // If we didn't get enough paragraphs, fallback to body text
      if (content.length < 200) {
        content = $('body').text()
      }
    }
    
    // Clean up: remove extra whitespace
    content = content.replace(/\s+/g, ' ').trim()
    
    // Cap at ~4 paragraphs / 10 sentences / 1500 characters
    if (content.length > 1500) {
      const sentences = content.match(/[^.!?]+[.!?]+/g) || [content]
      const firstSentences = sentences.slice(0, 10).join(' ')
      if (firstSentences.length > 1500) {
        content = firstSentences.substring(0, 1500) + '...'
      } else {
        content = firstSentences
      }
    }
    
    return content || null
  } catch (error) {
    console.log(`[Web Scraping] Failed to fetch ${url}: ${error.message}`)
    return null
  }
}

// Clean Mistral responses to remove thinking/reasoning content
// NOTE: Mistral is temporarily disabled in main app UI but backend support remains intact
// Mistral models sometimes return JSON with "type":"thinking" that includes internal reasoning
// Format can be: {"type":"thinking","thinking":[...]} followed by actual answer text
const cleanMistralResponse = (content) => {
  if (!content || typeof content !== 'string') {
    return content
  }
  
  const trimmed = content.trim()
  
  // Check if content starts with JSON thinking object
  if (trimmed.startsWith('{') && trimmed.includes('"type":"thinking"')) {
    try {
      // First, try to find where the JSON object ends by counting braces
      let braceCount = 0
      let jsonEndIndex = -1
      let inString = false
      let escapeNext = false
      
      for (let i = 0; i < trimmed.length; i++) {
        const char = trimmed[i]
        
        if (escapeNext) {
          escapeNext = false
          continue
        }
        
        if (char === '\\') {
          escapeNext = true
          continue
        }
        
        if (char === '"') {
          inString = !inString
          continue
        }
        
        if (!inString) {
          if (char === '{') {
            braceCount++
          } else if (char === '}') {
            braceCount--
            if (braceCount === 0) {
              jsonEndIndex = i
              break
            }
          }
        }
      }
      
      // If we found the end of the JSON object, extract text after it
      if (jsonEndIndex >= 0) {
        const afterJson = trimmed.substring(jsonEndIndex + 1).trim()
        if (afterJson.length > 0) {
          // Return the text after the JSON (the actual answer)
          console.log('[Mistral Clean] Extracted text after thinking JSON:', afterJson.substring(0, 100))
          return afterJson
        }
      }
      
      // Fallback: try to parse just the JSON part (before any text)
      // Extract JSON part only (up to the first closing brace that matches)
      if (jsonEndIndex >= 0) {
        const jsonPart = trimmed.substring(0, jsonEndIndex + 1)
        try {
          const parsed = JSON.parse(jsonPart)
          if (parsed.type === 'thinking' && Array.isArray(parsed.thinking)) {
            // Check if there's text after the JSON
            const afterJson = trimmed.substring(jsonEndIndex + 1).trim()
            if (afterJson.length > 0) {
              return afterJson
            }
            // If no text after, try to extract from thinking array (last text item)
            const textItems = parsed.thinking.filter(item => item.type === 'text' && item.text)
            if (textItems.length > 0) {
              // Return the last text item (usually the actual answer)
              return textItems[textItems.length - 1].text
            }
          }
        } catch (parseError) {
          // JSON parsing failed, continue to next fallback
        }
      }
      
      // Another fallback: try regex to find JSON object and extract text after
      const jsonMatch = trimmed.match(/^(\{[^}]*"type"\s*:\s*"thinking"[^}]*\})/s)
      if (jsonMatch) {
        const afterJson = trimmed.substring(jsonMatch[0].length).trim()
        if (afterJson.length > 0) {
          console.log('[Mistral Clean] Extracted text using regex:', afterJson.substring(0, 100))
          return afterJson
        }
      }
      
      // Last resort: try to parse entire content as JSON (might fail if text follows)
      try {
        const parsed = JSON.parse(trimmed)
        if (parsed.type === 'thinking' && Array.isArray(parsed.thinking)) {
          const textItems = parsed.thinking.filter(item => item.type === 'text' && item.text)
          if (textItems.length > 0) {
            return textItems[textItems.length - 1].text
          }
        }
        if (parsed.text) {
          return parsed.text
        }
      } catch (parseError) {
        // If parsing fails, it means there's text after JSON - that's what we want
        // The brace counting should have caught this, but if not, try one more approach
      }
      
      // If we can't extract properly, return the original content
      console.warn('[Mistral Clean] Could not clean response, returning as-is')
      return content
    } catch (e) {
      console.error('[Mistral Clean] Error cleaning response:', e.message)
      // If we can't extract, return as-is
      return content
    }
  }
  
  return content
}

// Check if a URL is likely to be non-parseable (video-only platforms and video files)
// Note: Text-based social media (Twitter, Reddit, Facebook, LinkedIn) are kept as they contain parseable text
const isNonParseableSource = (url) => {
  const nonParseablePatterns = [
    /youtube\.com/i,           // Video platform
    /youtu\.be/i,              // YouTube short links
    /vimeo\.com/i,             // Video platform
    /tiktok\.com/i,            // Video platform
    /\.mp4$/i,                 // Video file
    /\.mov$/i,                 // Video file
    /\.avi$/i,                 // Video file
    /\.mkv$/i,                 // Video file
    /\.webm$/i,                // Video file
    /\.flv$/i,                 // Video file
  ]
  
  return nonParseablePatterns.some(pattern => pattern.test(url))
}

// Format search results for refiner prompt (with full page content)
// Filters out non-parseable sources and processes all parseable sources (up to 4)
// Note: Serper returns 4 results, and we process all parseable sources
const formatSearchResults = async (searchResults, maxParseableSources = 5) => {
  let formatted = ''
  let parseableCount = 0
  const processedUrls = new Set()
  
  // Process results, filtering out non-parseable sources, stopping at maxParseableSources
  for (let index = 0; index < searchResults.length; index++) {
    const result = searchResults[index]
    
    // Skip if URL is non-parseable
    if (isNonParseableSource(result.link)) {
      console.log(`[Web Scraping] Skipping non-parseable source: ${result.link}`)
      continue
    }
    
    // Stop if we've reached the maximum number of parseable sources to process
    if (parseableCount >= maxParseableSources) {
      console.log(`[Web Scraping] Reached maximum of ${maxParseableSources} parseable sources, stopping`)
      break
    }
    
    processedUrls.add(result.link)
    formatted += `${parseableCount + 1}. ${result.title}\n`
    formatted += `   URL: ${result.link}\n`
    formatted += `   Snippet: ${result.snippet}\n`
    
    // Fetch full page content
    console.log(`[Web Scraping] Fetching content from: ${result.link}`)
    const pageContent = await fetchPageContent(result.link)
    
    if (pageContent && pageContent.trim().length > 100) {
      // Only count as parseable if we got substantial content
      formatted += `   Full Content: ${pageContent}\n`
      parseableCount++
    } else {
      formatted += `   Full Content: [Unable to fetch substantial content - using snippet only]\n`
      // Still include it but don't count it as parseable
    }
    
    formatted += '\n'
  }
  
  // If we don't have enough parseable sources, log a warning
  if (parseableCount < maxParseableSources) {
    console.warn(`[Web Scraping] Only found ${parseableCount} parseable sources (wanted ${maxParseableSources})`)
  } else {
    console.log(`[Web Scraping] Successfully processed ${parseableCount} parseable sources`)
  }
  
  return formatted
}

// Format raw scraped source content for direct injection into model prompts
// Scrapes up to maxParseableSources, caps each at 1500 chars / 10 sentences, returns a clean numbered block
const formatRawSourcesForPrompt = async (searchResults, maxParseableSources = 5) => {
  let formatted = ''
  let parseableCount = 0
  const scrapedSources = [] // Track which sources were successfully scraped
  
  for (let index = 0; index < searchResults.length; index++) {
    const result = searchResults[index]
    
    // Skip non-parseable sources (videos, etc.)
    if (isNonParseableSource(result.link)) {
      console.log(`[Raw Sources] Skipping non-parseable source: ${result.link}`)
      continue
    }
    
    if (parseableCount >= maxParseableSources) {
      console.log(`[Raw Sources] Reached maximum of ${maxParseableSources} parseable sources, stopping`)
      break
    }
    
    console.log(`[Raw Sources] Fetching content from: ${result.link}`)
    const pageContent = await fetchPageContent(result.link)
    
    parseableCount++
    const sourceNum = parseableCount
    
    formatted += `Source ${sourceNum}: "${result.title}"\n`
    formatted += `URL: ${result.link}\n`
    
    if (pageContent && pageContent.trim().length > 100) {
      formatted += `Content: ${pageContent}\n`
      scrapedSources.push({ title: result.title, link: result.link, snippet: result.snippet, hasContent: true })
    } else {
      // Fall back to snippet if scraping failed
      formatted += `Content: ${result.snippet || '[Unable to fetch content]'}\n`
      scrapedSources.push({ title: result.title, link: result.link, snippet: result.snippet, hasContent: false })
    }
    
    formatted += '\n'
  }
  
  if (parseableCount < maxParseableSources) {
    console.warn(`[Raw Sources] Only found ${parseableCount} parseable sources (wanted ${maxParseableSources})`)
  } else {
    console.log(`[Raw Sources] Successfully processed ${parseableCount} parseable sources`)
  }
  
  return { formatted, sourceCount: parseableCount, scrapedSources }
}

// Refiner step: Extract facts with citations
const refinerStep = async (query, searchResults, useSecondary = false, userId = null) => {
  let modelName = useSecondary ? 'gpt-4o-mini' : 'gemini-2.5-flash-lite'
  console.log(`[Refiner] Extracting factual data points for: ${query} (using ${modelName})`)
  
  if (!searchResults || searchResults.length === 0) {
    return {
      query,
      data_points: [],
      facts_with_citations: [],
      found: false,
      discard_rate: 0,
      tokens: null // No tokens when no search results
    }
  }
  
  const formattedResults = await formatSearchResults(searchResults)
  
  const refinerPrompt = `Today's date is ${getCurrentDateString()}. You are a data extraction engine. Extract ONLY relevant, useful factual information that directly helps answer the user's query.

CRITICAL REQUIREMENTS:
- Extract at least ONE fact from EACH of the first 5 parseable sources
- ONLY extract facts that are DIRECTLY RELEVANT to answering the user's query
- Prioritize the MOST RECENT and up-to-date facts — discard outdated information from previous years when newer data is available
- Prioritize facts that provide specific, actionable, or informative answers to the user's question
- Focus on facts that add value: specific details, statistics, dates, names, locations, explanations, or insights
- If a source is a video or not parsable, skip it and move to the next source

Output Format: You must output a JSON array. For EVERY fact, you must include:
- "fact": A single, relevant factual statement that helps answer the user's query
- "source_quote": The exact substring from that source (title, snippet, or full content) that supports this fact
- "source_url": The URL of the source where this fact came from (extract from the "URL:" line in the search results)

Example format:
[{"fact": "Relevant fact that answers the query", "source_quote": "Exact quote from source 1", "source_url": "https://example1.com"}]

User Query: ${query}

Search Results:
${formattedResults}`
  
  try {
    let content = ''
    let tokenInfo = null
    
    if (useSecondary) {
      // Use GPT-4o-mini (backup refiner)
      const apiKey = API_KEYS.openai
      if (!apiKey) {
        throw new Error('OpenAI API key not configured')
      }
      
      const response = await axios.post(
        'https://api.openai.com/v1/chat/completions',
        {
          model: 'gpt-4o-mini',
          messages: [
            { role: 'system', content: 'You are a strict data extraction engine. Output only valid JSON.' },
            { role: 'user', content: refinerPrompt }
          ],
          temperature: 0.3
        },
        {
          headers: {
            'Authorization': `Bearer ${apiKey}`,
            'Content-Type': 'application/json'
          }
        }
      )
      
      content = response.data.choices[0].message.content
      
      // Track usage for backup refiner (GPT-4o-mini) and get token info
      if (content) {
        const responseTokens = extractTokensFromResponse(response.data, 'openai')
        let inputTokens = 0
        let outputTokens = 0
        
        if (responseTokens) {
          inputTokens = responseTokens.inputTokens || 0
          outputTokens = responseTokens.outputTokens || 0
        } else {
          inputTokens = await countTokens(refinerPrompt, 'openai', 'gpt-4o-mini')
          outputTokens = await countTokens(content, 'openai', 'gpt-4o-mini')
        }
        
        // Track usage for backup refiner (pipeline — not shown in per-model stats)
        if (userId) {
          trackUsage(userId, 'openai', 'gpt-4o-mini', inputTokens, outputTokens, true)
        }
        
        tokenInfo = {
          input: inputTokens,
          output: outputTokens,
          total: inputTokens + outputTokens,
          provider: 'openai',
          model: 'gpt-4o-mini',
          source: responseTokens ? 'api_response' : 'tokenizer'
        }
      }
    } else {
      // Use Gemini 2.5 Flash-lite (primary refiner)
      const apiKey = API_KEYS.google
      if (!apiKey) {
        throw new Error('Google API key not configured')
      }
      
      let response
      let actualModelName = 'gemini-2.5-flash-lite' // Track which model is actually used
      try {
        console.log(`[Refiner] Attempting to call Gemini API with model: gemini-2.5-flash-lite`)
        response = await axios.post(
          `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-lite:generateContent?key=${apiKey}`,
          {
            contents: [{ parts: [{ text: refinerPrompt }] }],
            generationConfig: { temperature: 0.3 }
          }
        )
        console.log(`[Refiner] Gemini API call successful with model: gemini-2.5-flash-lite`)
      } catch (apiError) {
        console.error(`[Refiner] Gemini API error: ${apiError.message}`)
        console.error(`[Refiner] Gemini API error details:`, apiError.response?.data || apiError.message)
        // If the model name is invalid, try gemini-1.5-flash-lite as fallback
        if (apiError.response?.status === 404 || apiError.message?.includes('not found') || apiError.response?.data?.error?.message?.includes('not found')) {
          console.log('[Refiner] Model gemini-2.5-flash-lite not found, trying gemini-1.5-flash-lite...')
          actualModelName = 'gemini-1.5-flash-lite'
          try {
            response = await axios.post(
              `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash-lite:generateContent?key=${apiKey}`,
              {
                contents: [{ parts: [{ text: refinerPrompt }] }],
                generationConfig: { temperature: 0.3 }
              }
            )
            console.log('[Refiner] Successfully used gemini-1.5-flash-lite as fallback')
          } catch (fallbackError) {
            console.error(`[Refiner] Fallback model also failed: ${fallbackError.message}`)
            throw new Error(`Gemini API failed: ${apiError.message}. Fallback also failed: ${fallbackError.message}`)
          }
        } else {
          throw apiError
        }
      }
      
      content = response.data?.candidates?.[0]?.content?.parts?.[0]?.text || ''
      
      // Check if API returned an error
      if (response.data?.error) {
        console.error(`[Refiner] Gemini API returned error:`, response.data.error)
        throw new Error(`Gemini API error: ${response.data.error.message || JSON.stringify(response.data.error)}`)
      }
      
      if (!content) {
        console.error(`[Refiner] Gemini API returned empty content. Response:`, JSON.stringify(response.data, null, 2))
        throw new Error('Gemini API returned empty content')
      }
      
      // Update modelName to reflect the actual model used
      modelName = actualModelName
      console.log(`[Refiner] Using model: ${modelName} for token tracking`)
      
      // ALWAYS extract token usage from Gemini API response (usageMetadata)
      // This is the ONLY reliable source of token counts per request
      // Extract tokens even if content is empty (we still used tokens for the prompt)
      const responseTokens = extractTokensFromResponse(response.data, 'google')
      let inputTokens = 0
      let outputTokens = 0
      let totalTokens = 0
      
      if (responseTokens) {
        // Use API response tokens from usageMetadata (most accurate)
        inputTokens = responseTokens.inputTokens || 0
        outputTokens = responseTokens.outputTokens || 0
        // Use totalTokenCount from API if available (includes thoughtsTokenCount for reasoning models)
        totalTokens = responseTokens.totalTokens || (inputTokens + outputTokens)
        console.log(`[Refiner] ✅ Gemini API returned usageMetadata for ${modelName}: promptTokenCount=${inputTokens}, candidatesTokenCount=${outputTokens}, totalTokenCount=${totalTokens}`)
      } else {
        // Log warning if usageMetadata is missing
        console.warn(`[Refiner] ⚠️ Gemini API response missing usageMetadata for ${modelName}. Response structure:`, {
          hasUsageMetadata: !!response.data?.usageMetadata,
          responseKeys: Object.keys(response.data || {}),
          usageMetadataSample: response.data?.usageMetadata ? JSON.stringify(response.data.usageMetadata) : 'NOT FOUND'
        })
        // Fallback to tokenizer estimation (less accurate)
        inputTokens = await countTokens(refinerPrompt, 'google', modelName)
        outputTokens = content ? await countTokens(content, 'google', modelName) : 0
        totalTokens = inputTokens + outputTokens
        console.log(`[Refiner] ⚠️ Using tokenizer fallback for ${modelName}: input=${inputTokens}, output=${outputTokens}, total=${totalTokens}`)
      }
      
      // Track usage for primary refiner (pipeline — not shown in per-model stats)
      if (userId) {
        trackUsage(userId, 'google', modelName, inputTokens, outputTokens, true)
      }
      
      // Always return tokenInfo (even if userId is null or content is empty) so it can be displayed
      tokenInfo = {
        input: inputTokens,
        output: outputTokens,
        total: totalTokens, // Use API totalTokenCount when available (includes thoughtsTokenCount)
        reasoningTokens: responseTokens?.reasoningTokens || 0, // Reasoning tokens from API metadata
        provider: 'google',
        model: modelName,
        source: responseTokens ? 'api_response' : 'tokenizer'
      }
      console.log(`[Refiner] TokenInfo set:`, tokenInfo)
    }
    
    // Parse JSON response
    try {
      let jsonContent = content
      if (jsonContent.includes('```json')) {
        jsonContent = jsonContent.split('```json')[1].split('```')[0].trim()
      } else if (jsonContent.includes('```')) {
        jsonContent = jsonContent.split('```')[1].split('```')[0].trim()
      }
      
      const startIdx = jsonContent.indexOf('[')
      const endIdx = jsonContent.lastIndexOf(']')
      if (startIdx !== -1 && endIdx !== -1) {
        jsonContent = jsonContent.substring(startIdx, endIdx + 1)
      }
      
      const parsed = JSON.parse(jsonContent)
      
      // Handle error response
      if (typeof parsed === 'object' && parsed.error === 'NOT_FOUND') {
        console.log('[Refiner] No relevant data found')
        return {
          query,
          data_points: [],
          facts_with_citations: [],
          found: false,
          discard_rate: 0,
          prompt: refinerPrompt,
          response: content,
          model: modelName,
          tokens: tokenInfo // Include tokens even when no data found
        }
      }
      
      // Handle array of facts
      let factsJson = []
      if (Array.isArray(parsed)) {
        factsJson = parsed
      } else if (parsed.facts) {
        factsJson = parsed.facts
      } else if (parsed.fact) {
        factsJson = [parsed]
      }
      
      // Verify citations exist in source text
      let { verifiedFacts, discardRate } = verifyExtraction(formattedResults, factsJson)
      
      // Limit to maximum 5 facts (one per source from 5 sources)
      if (verifiedFacts.length > 5) {
        console.log(`[Refiner] Limiting facts from ${verifiedFacts.length} to 5 (one per source from 5 sources)`)
        verifiedFacts = verifiedFacts.slice(0, 5)
      }
      
      // Convert to data_points format
      const dataPoints = verifiedFacts.map(f => f.fact)
      
      console.log(`[Refiner] Extracted ${verifiedFacts.length} verified facts (one per source from 5 sources)`)
      
      return {
        query,
        data_points: dataPoints,
        facts_with_citations: verifiedFacts,
        found: verifiedFacts.length > 0,
        discard_rate: discardRate,
        prompt: refinerPrompt,
        response: content,
        model: modelName,
        tokens: tokenInfo
      }
    } catch (parseError) {
      console.error(`[Refiner] JSON parsing error: ${parseError.message}`)
      console.error(`[Refiner] Raw content: ${content.substring(0, 500)}`)
      
      if (content.toUpperCase().includes('NOT FOUND') || content.toUpperCase().includes('NOT_FOUND')) {
        return {
          query,
          data_points: [],
          facts_with_citations: [],
          found: false,
          discard_rate: 0,
          tokens: tokenInfo // Include tokens even when NOT FOUND
        }
      }
      
      return {
        query,
        data_points: [],
        facts_with_citations: [],
        found: false,
        discard_rate: 0,
        error: `JSON parsing error: ${parseError.message}`,
        prompt: refinerPrompt,
        response: content,
        tokens: tokenInfo, // Include tokens even on parse error
        model: modelName
      }
    }
  } catch (error) {
    console.error(`[Refiner] Exception: ${error.message}`)
    return {
      query,
      data_points: [],
      facts_with_citations: [],
      found: false,
      discard_rate: 0,
      error: error.message,
      prompt: refinerPrompt,
      response: '',
      model: modelName
    }
  }
}

// Judge: Select best refiner summary
const judgeRefinerSelection = async (query, primaryRefined, backupRefined, userId = null) => {
  console.log('[Judge] Comparing two refiner summaries to select the best one')
  let judgeTokenInfo = null
  
  const primarySummary = primaryRefined.facts_with_citations
    .map(f => `• ${f.fact} [Source: ${f.source_quote.substring(0, 100)}...]`)
    .join('\n')
  const backupSummary = backupRefined.facts_with_citations
    .map(f => `• ${f.fact} [Source: ${f.source_quote.substring(0, 100)}...]`)
    .join('\n')
  
  const primaryCitationCount = primaryRefined.facts_with_citations.length
  const backupCitationCount = backupRefined.facts_with_citations.length
  
  const judgePrompt = `Today's date is ${getCurrentDateString()}. You are an expert judge analyzing two summaries of search results. Your task is to select the BEST summary based on:
1. Better and more number of facts with valid source citations
2. Relevance to the user's query
3. Recency — prefer facts that are current and up-to-date

Original User Query: "${query}"

Summary 1 (Gemini 2.5 Flash-lite):
Facts with citations: ${primaryCitationCount}
Summary:
${primarySummary}

Summary 2 (GPT-4o-mini):
Facts with citations: ${backupCitationCount}
Summary:
${backupSummary}

Respond with ONLY a JSON object in this format:
{
  "selected": "primary" or "backup",
  "reasoning": "Brief explanation of why this summary is better"
}

If both summaries have similar citation quality, prefer the one with more citations.`
  
  try {
    const apiKey = API_KEYS.google
    if (!apiKey) {
      console.log('[Judge] Google API key not configured, using citation count as fallback')
      return backupCitationCount > primaryCitationCount ? backupRefined : primaryRefined
    }
    
    const judgeModel = 'gemini-3-flash'
    const judgeModelApi = 'gemini-3-flash-preview'
    
    const response = await axios.post(
      `https://generativelanguage.googleapis.com/v1beta/models/${judgeModelApi}:generateContent?key=${apiKey}`,
      {
        contents: [{ parts: [{ text: judgePrompt }] }],
      },
      {
        headers: {
          'Content-Type': 'application/json'
        }
      }
    )
    
      const content = response.data.candidates[0].content.parts[0].text
      
      // Track usage for judge refiner selection (Google/Gemini) and get token info
      if (content) {
        const responseTokens = extractTokensFromResponse(response.data, 'google')
        let inputTokens = 0
        let outputTokens = 0
        
        if (responseTokens) {
          inputTokens = responseTokens.inputTokens || 0
          outputTokens = responseTokens.outputTokens || 0
        } else {
          inputTokens = await countTokens(judgePrompt, 'google', judgeModel)
          outputTokens = await countTokens(content, 'google', judgeModel)
        }
        
        // Track usage for judge refiner selection (pipeline — not shown in per-model stats)
        if (userId) {
          trackUsage(userId, 'google', judgeModel, inputTokens, outputTokens, true)
        }
        
        judgeTokenInfo = {
          input: inputTokens,
          output: outputTokens,
          total: inputTokens + outputTokens,
          provider: 'google',
          model: judgeModel,
          source: responseTokens ? 'api_response' : 'tokenizer'
        }
      }
      
      try {
        let jsonContent = content
        if (jsonContent.includes('```json')) {
          jsonContent = jsonContent.split('```json')[1].split('```')[0].trim()
        } else if (jsonContent.includes('```')) {
          jsonContent = jsonContent.split('```')[1].split('```')[0].trim()
        }
        
        const parsed = JSON.parse(jsonContent)
        const selected = parsed.selected || 'primary'
        const reasoning = parsed.reasoning || ''
        
        console.log(`[Judge] Selected: ${selected} - ${reasoning}`)
        
        const selectedRefined = selected === 'backup' ? backupRefined : primaryRefined
        return {
          ...selectedRefined,
          judgePrompt: judgePrompt,
          judgeResponse: content,
          judgeReasoning: reasoning,
          selected: selected,
          judgeTokens: judgeTokenInfo
        }
    } catch (parseError) {
      console.log('[Judge] JSON parse failed, using citation count as fallback')
      const selectedRefined = backupCitationCount > primaryCitationCount ? backupRefined : primaryRefined
      return {
        ...selectedRefined,
        judgePrompt: judgePrompt,
        judgeResponse: '',
        judgeReasoning: 'Fallback: Used citation count comparison',
        selected: backupCitationCount > primaryCitationCount ? 'backup' : 'primary',
        judgeTokens: judgeTokenInfo
      }
    }
  } catch (error) {
    console.error(`[Judge] Error in refiner selection: ${error.message}, using citation count as fallback`)
    const selectedRefined = backupCitationCount > primaryCitationCount ? backupRefined : primaryRefined
    return {
      ...selectedRefined,
      judgePrompt: judgePrompt,
      judgeResponse: `Error: ${error.message}`,
      judgeReasoning: 'Fallback: Used citation count comparison due to error',
      selected: backupCitationCount > primaryCitationCount ? 'backup' : 'primary',
      judgeTokens: judgeTokenInfo
    }
  }
}

// Helper function to get friendly model names for the judge
const getFriendlyModelName = (apiModelName) => {
  // Map API model names to friendly display names
  const nameMap = {
    // OpenAI
    'openai-gpt-5.2': 'ChatGPT',
    'openai-gpt-5-mini': 'ChatGPT',
    'openai-gpt-4.1': 'ChatGPT',
    'openai-gpt-4o-mini': 'ChatGPT',
    'openai-o3-mini': 'ChatGPT',
    'openai-o4-mini': 'ChatGPT',
    // Anthropic
    'anthropic-claude-4.5-opus': 'Claude',
    'anthropic-claude-4.5-sonnet': 'Claude',
    'anthropic-claude-4-sonnet': 'Claude',
    // Google
    'google-gemini-3-pro': 'Gemini',
    'google-gemini-3-flash': 'Gemini',
    'google-gemini-2.5-flash-lite': 'Gemini',
    // xAI
    'xai-grok-4-1-fast-reasoning': 'Grok',
    'xai-grok-4-1-fast-non-reasoning': 'Grok',
    // Meta
    'meta-llama-4-maverick': 'Llama',
    'meta-llama-4-scout': 'Llama',
    // Mistral
    'mistral-medium-3': 'Mistral',
    'mistral-small-3.2': 'Mistral',
    // DeepSeek
    'deepseek-r2': 'DeepSeek',
    'deepseek-v4': 'DeepSeek',
  }
  
  // Try exact match first
  if (nameMap[apiModelName]) {
    return nameMap[apiModelName]
  }
  
  // Try to extract provider and return a friendly name
  const lowerName = apiModelName.toLowerCase()
  if (lowerName.includes('openai') || lowerName.includes('gpt') || lowerName.includes('o3') || lowerName.includes('o4')) return 'ChatGPT'
  if (lowerName.includes('claude') || lowerName.includes('anthropic')) return 'Claude'
  if (lowerName.includes('gemini') || lowerName.includes('google')) return 'Gemini'
  if (lowerName.includes('grok') || lowerName.includes('xai')) return 'Grok'
  if (lowerName.includes('llama') || lowerName.includes('meta')) return 'Llama'
  if (lowerName.includes('mistral')) return 'Mistral'
  if (lowerName.includes('deepseek')) return 'DeepSeek'
  
  // Fallback: return the original name
  return apiModelName
}

// Judge: Final analysis of council responses
const judgeFinalization = async (query, councilResponses, userId = null) => {
  console.log(`[Judge] Analyzing ${councilResponses.length} council responses`)
  
  const validResponses = councilResponses.filter(r => !r.error && r.response)
  
  if (validResponses.length === 0) {
    return {
      summary: 'All council models encountered errors.',
      agreements: [],
      disagreements: []
    }
  }
  
  // Build model list for clarity with friendly names
  const modelNames = validResponses.map(r => getFriendlyModelName(r.model_name)).join(', ')
  
  const responsesText = validResponses
    .map((r, idx) => `\n--- Response ${idx + 1}: ${getFriendlyModelName(r.model_name)} ---\n${r.response}\n`)
    .join('')
  
  const judgePrompt = `Today is ${getCurrentDateStringForUser(userId)}. This is the real, current date — not hypothetical or simulated. You are a judge analyzing responses from multiple AI models to a user's question.

Original User Query: "${query}"

Council Model Responses:
${responsesText}

RESPOND WITH EXACTLY THESE 5 SECTIONS IN THIS EXACT FORMAT:

CONSENSUS: [number]%

SUMMARY:
[Write a thorough, explanatory summary that synthesizes what the council collectively determined. Do not just state conclusions — explain the reasoning, key details, and context behind them. When referencing models, use ONLY their short names: ChatGPT, Claude, Gemini, Grok. Do NOT use version numbers or full model identifiers like "GPT-4.1" or "Claude 4.5 Sonnet" or "Gemini 3 Flash" or "Grok 4-1 Fast". If models cited sources, include source attributions by publication/site/title or URL/domain — NEVER use numeric labels like [source 2]. The summary should give the reader a complete understanding of the topic without needing to read the individual model responses. Aim for 2-3 substantial paragraphs.]

AGREEMENTS:
- [First specific point all/most models agree on
- [Second point they agree on - name which models]
- [Third point of agreement - name which models]
(THIS SECTION IS MANDATORY! List at least 3-5 specific agreement points. NEVER write "None identified" unless models literally contradict each other on everything.)

CONTRADICTIONS:
[ONLY list factual contradictions where Model A and Model B make claims that CANNOT BOTH BE TRUE. Example: "Gemini states the date is November 7, but Claude states it is November 5 — these are contradictory." If one model mentions something another does not, that is NOT a contradiction. If models suggest different examples, products, or details, those are NOT contradictions. If models differ in tone, depth, or structure, those are NOT contradictions. If there are no factual contradictions, write: "None identified — all models are in factual agreement."]

DIFFERENCES:
[List notable differences in how the models responded. This includes: details or topics one model covered that others omitted, different examples or recommendations given, varying levels of depth or specificity, different tones or approaches, and any unique angles or perspectives. These are NOT contradictions — just interesting variations worth noting. Each difference should start with a dash and name which models are involved.]`



  try {
    const apiKey = API_KEYS.google
    if (!apiKey) {
      throw new Error('Google API key not configured')
    }
    
    const judgeModel = 'gemini-3-flash'
    const judgeModelApi = 'gemini-3-flash-preview'
    
    const response = await axios.post(
      `https://generativelanguage.googleapis.com/v1beta/models/${judgeModelApi}:generateContent?key=${apiKey}`,
      {
        contents: [{ parts: [{ text: judgePrompt }] }],
      },
      {
        headers: {
          'Content-Type': 'application/json'
        }
      }
    )
    
    const content = response.data.candidates[0].content.parts[0].text
    
    // Track usage for judge finalization (Google/Gemini) and get token info
    let judgeTokenInfo = null
    if (content) {
      const responseTokens = extractTokensFromResponse(response.data, 'google')
      let inputTokens = 0
      let outputTokens = 0
      
      if (responseTokens) {
        inputTokens = responseTokens.inputTokens || 0
        outputTokens = responseTokens.outputTokens || 0
      } else {
        inputTokens = await countTokens(judgePrompt, 'google', judgeModel)
        outputTokens = await countTokens(content, 'google', judgeModel)
      }
      
      // Track usage for judge finalization (pipeline — not shown in per-model stats)
      if (userId) {
        trackUsage(userId, 'google', judgeModel, inputTokens, outputTokens, true)
      }
      
      judgeTokenInfo = {
        input: inputTokens,
        output: outputTokens,
        total: inputTokens + outputTokens,
        provider: 'google',
        model: judgeModel,
        source: responseTokens ? 'api_response' : 'tokenizer'
      }
    }
    
    // Parse the response to extract sections (Consensus, Summary, Agreements, Disagreements)
    console.log('[Judge] Raw response content:', content.substring(0, 1000))
    
    // More flexible consensus matching - handles various formats like "Consensus: 85", "**Consensus**: 85%", "[85]", etc.
    const consensusMatch = content.match(/(?:Consensus|consensus)[:\-]?\s*(?:\[|\*\*)?\s*(\d+)\s*(?:%|]|\*\*)?/i)
    
    // More robust section extraction - look for section headers with various formats
    // Handles: "SUMMARY:", "**SUMMARY**:", "Summary:", "2. SUMMARY:", "LIST AGREEMENTS", "AGREEMENTS:", etc.
    const summaryMatch = content.match(/(?:^|\n)\s*(?:\d+\.\s*)?(?:\*\*)?SUMMARY(?:\*\*)?[:\-]?\s*\n?([\s\S]+?)(?=(?:^|\n)\s*(?:\d+\.\s*)?(?:LIST\s+)?(?:\*\*)?AGREEMENTS|$)/im)
    const agreementsMatch = content.match(/(?:^|\n)\s*(?:\d+\.\s*)?(?:LIST\s+)?(?:\*\*)?AGREEMENTS(?:\*\*)?[:\-]?(?:\s*-[^\n]*)?\s*\n?([\s\S]+?)(?=(?:^|\n)\s*(?:\d+\.\s*)?(?:\*\*)?(?:CONTRADICTIONS|DISAGREEMENTS)|$)/im)
    const disagreementsMatch = content.match(/(?:^|\n)\s*(?:\d+\.\s*)?(?:\*\*)?(?:CONTRADICTIONS|DISAGREEMENTS)(?:\*\*)?[:\-]?\s*\n?([\s\S]+?)(?=(?:^|\n)\s*(?:\d+\.\s*)?(?:\*\*)?DIFFERENCES|$)/im)
    const differencesMatch = content.match(/(?:^|\n)\s*(?:\d+\.\s*)?(?:\*\*)?DIFFERENCES(?:\*\*)?[:\-]?\s*\n?([\s\S]+)$/im)
    
    // Extract consensus score (0-100)
    let consensus = null
    if (consensusMatch) {
      const score = parseInt(consensusMatch[1], 10)
      consensus = Math.max(0, Math.min(100, score)) // Clamp between 0-100
      console.log(`[Judge] Extracted consensus score: ${consensus}%`)
    } else {
      // Try more flexible patterns
      const patterns = [
        /consensus[:\-]?\s*(\d+)\s*%/i,
        /consensus[:\-]?\s*\[(\d+)\]/i,
        /consensus[:\-]?\s*(\d+)/i,
        /(\d+)\s*%\s*consensus/i,
        /consensus.*?(\d+)/i
      ]
      
      for (const pattern of patterns) {
        const match = content.match(pattern)
        if (match) {
          const score = parseInt(match[1], 10)
          consensus = Math.max(0, Math.min(100, score))
          console.log(`[Judge] Extracted consensus score (fallback pattern): ${consensus}%`)
          break
        }
      }
      
      if (!consensus) {
        console.log(`[Judge] Warning: Could not extract consensus score from response. Content preview: ${content.substring(0, 500)}`)
      }
    }
    
    // Log what we found
    console.log('[Judge] Parsed sections:', {
      hasConsensus: !!consensusMatch,
      hasSummary: !!summaryMatch,
      hasAgreements: !!agreementsMatch,
      hasContradictions: !!disagreementsMatch,
      hasDifferences: !!differencesMatch
    })
    
    // Extract summary - if no explicit summary section, try to extract everything between consensus and agreements
    let summary = ''
    if (summaryMatch) {
      summary = summaryMatch[1].trim()
    } else {
      // Fallback: try to get content between CONSENSUS line and AGREEMENTS
      const fallbackMatch = content.match(/CONSENSUS[:\-]?\s*\d+%?\s*\n+([\s\S]+?)(?=\n\s*(?:\d+\.\s*)?(?:LIST\s+)?(?:\*\*)?AGREEMENTS|$)/im)
      if (fallbackMatch) {
        summary = fallbackMatch[1].trim()
        console.log('[Judge] Using fallback summary extraction')
      } else {
        // Last resort: use the whole response minus the first line (consensus)
        const lines = content.split('\n').filter(l => l.trim())
        summary = lines.slice(1).join('\n').trim()
        console.log('[Judge] Using last resort summary extraction')
      }
    }
    
    // Clean the summary to remove any embedded sections or duplicated headers
    summary = summary
      // Remove embedded CONSENSUS lines
      .replace(/[-•*]\s*\*?\*?CONSENSUS[^:]*:[^\n]*/gi, '')
      .replace(/\*?\*?CONSENSUS\s+of\s+Agreement\*?\*?[:\-]?\s*\d+%?/gi, '')
      // Remove embedded SUMMARY headers
      .replace(/[-•*]\s*\*?\*?SUMMARY\*?\*?[:\-]?\s*/gi, '')
      // Remove embedded AGREEMENTS sections (various formats)
      .replace(/[-•]\s*(?:\d+\.\s*)?(?:LIST\s+)?\*?\*?AGREEMENTS\*?\*?[:\-]?\s*[\s\S]*?(?=[-•]\s*(?:\d+\.\s*)?\*?\*?(?:CONTRADICTIONS|DISAGREEMENTS|DIFFERENCES)|$)/gi, '')
      .replace(/(?:\d+\.\s*)?(?:LIST\s+)?\*?\*?AGREEMENTS\*?\*?[:\-]?\s*[\s\S]*?(?=(?:\d+\.\s*)?\*?\*?(?:CONTRADICTIONS|DISAGREEMENTS|DIFFERENCES)|$)/gi, '')
      // Remove embedded CONTRADICTIONS/DISAGREEMENTS sections
      .replace(/[-•]\s*(?:\d+\.\s*)?\*?\*?(?:CONTRADICTIONS|DISAGREEMENTS)\*?\*?[:\-]?\s*[\s\S]*?(?=[-•]\s*(?:\d+\.\s*)?\*?\*?DIFFERENCES|$)/gi, '')
      .replace(/(?:\d+\.\s*)?\*?\*?(?:CONTRADICTIONS|DISAGREEMENTS)\*?\*?[:\-]?\s*[\s\S]*?(?=(?:\d+\.\s*)?\*?\*?DIFFERENCES|$)/gi, '')
      // Remove embedded DIFFERENCES sections
      .replace(/[-•]\s*(?:\d+\.\s*)?\*?\*?DIFFERENCES\*?\*?[:\-]?\s*[\s\S]*/gi, '')
      .replace(/(?:\d+\.\s*)?\*?\*?DIFFERENCES\*?\*?[:\-]?\s*[\s\S]*/gi, '')
      // Clean up any remaining artifacts
      .replace(/^[-•*]\s*/, '') // Remove leading bullets
      .replace(/\n\s*\n\s*\n/g, '\n\n') // Collapse multiple newlines
      .trim()
    
    // Extract agreements and disagreements as arrays
    let agreements = []
    if (agreementsMatch) {
      const rawAgreements = agreementsMatch[1]
      console.log('[Judge] Raw agreements section:', rawAgreements.substring(0, 500))
      agreements = rawAgreements
        .split('\n')
        .filter(l => l.trim() && !l.match(/^[-•*]\s*$/))
        .map(l => l.replace(/^[-•*\[\]]\s*/, '').replace(/^\d+\.\s*/, '').trim()) // Also remove [, ], and numbered lists
        .filter(l => {
          // Skip instruction-like text and empty/garbage entries
          const isInstructionText = l.toLowerCase().includes('this section is mandatory') || 
                                    l.toLowerCase().includes('list at least') ||
                                    l.toLowerCase().includes('never write')
          const isEmpty = !l || l.length < 5
          const isNone = l.toLowerCase().includes('none identified')
          const isGarbage = l.match(/^\*+:?$/)
          return !isInstructionText && !isEmpty && !isNone && !isGarbage
        })
      console.log('[Judge] Extracted agreements:', agreements.length, agreements)
    } else {
      console.log('[Judge] No agreements section matched!')
    }
    
    let disagreements = []
    if (disagreementsMatch) {
      const rawDisagreements = disagreementsMatch[1]
      console.log('[Judge] Raw disagreements section:', rawDisagreements.substring(0, 300))
      disagreements = rawDisagreements
        .split('\n')
        .filter(l => l.trim() && !l.match(/^[-•*]\s*$/))
        .map(l => l.replace(/^[-•*\[\]]\s*/, '').replace(/^\d+\.\s*/, '').trim())
        .filter(l => {
          // Skip instruction-like text and empty/garbage entries
          const isInstructionText = l.toLowerCase().includes('if no disagreements') || 
                                    l.toLowerCase().includes('if no contradictions') ||
                                    l.toLowerCase().includes('if there are no factual') ||
                                    l.toLowerCase().includes('write "none') ||
                                    l.toLowerCase().includes('this section is mandatory') ||
                                    l.toLowerCase().includes('look for:') ||
                                    l.toLowerCase().includes('you must list') ||
                                    l.toLowerCase().includes('only write "none')
          const isEmpty = !l || l.length < 5
          const isNone = l.toLowerCase().startsWith('none identified')
          const isGarbage = l.match(/^\*+:?$/) || l.match(/^\(.*\)$/)
          return !isInstructionText && !isEmpty && !isNone && !isGarbage
        })

      // Post-processing: Filter out "disagreements" that are actually coverage differences, not contradictions.
      // The judge model sometimes lists omissions, tone differences, and detail differences as disagreements
      // despite being told not to. This catches those patterns as a safety net.
      const beforeFilter = disagreements.length
      disagreements = disagreements.filter(d => {
        const lower = d.toLowerCase()
        // Pattern: "X omits / does not mention / does not include / leaves out / omitted by / not mentioned"
        const isOmission = /\b(?:omits?|omitted|(?:does|do|did|is|are|were?) not (?:mention|include|address|cite|reference|provide|name|specify|list)|not mentioned|not included|not referenced|not cited|not addressed|left out|leaves? out|without (?:mentioning|citing|referencing|naming)|absent from|refrain(?:s)? from|a detail (?:omitted|absent|missing|not))\b/i.test(d)
        // Pattern: "more detail / more specific / more structured / more informal / deeper / broader / general descriptions"
        const isDetailDiff = /\b(?:more (?:detail|detailed|specific|structured|informal|clinical|conversational|comprehensive|general|predictive|neutral|cautious|thorough|extensive)|less (?:detail|specific|thorough)|greater (?:detail|depth|specificity)|deeper|broader|level of detail|varying (?:levels?|degrees?)|different (?:tone|style|structure|framing|approach|perspective|level)|general (?:descriptions?|terms?|categories?|statements?))\b/i.test(d)
        // Pattern: "X adopts a ... tone" or "X is more ... while Y is more ..." or "X uses ... analogy"
        const isToneDiff = /\b(?:adopts?\s+(?:a\s+)?(?:more\s+)?(?:\w+\s+)?tone|(?:conversational|informal|clinical|formal|neutral|empathetic|structured|predictive|cautious)\s+(?:tone|style|approach)|uses?\s+(?:a\s+)?(?:\w+\s+)?analogy)\b/i.test(d)
        // Pattern: "X emphasizes ... while Y focuses on" (different focus, not contradiction)
        const isFocusDiff = /\b(?:emphasiz(?:es?|ing)|focus(?:es|ing)?\s+(?:on|more|instead|primarily)|prioritiz(?:es?|ing)|centers?\s+on)\b.*\b(?:while|whereas|but|however)\b.*\b(?:emphasiz|focus|prioritiz|centers?|provid|takes?|us(?:es?|ing))\b/i.test(d)
        // Pattern: "X lists specific names/figures while others do not" — naming extra details is not a contradiction
        const isExtraDetail = /\b(?:lists?\s+specific|provides?\s+specific|names?\s+specific|cites?\s+specific|identifies?\s+specific|includes?\s+specific)\b.*\b(?:while|whereas|but)\b/i.test(d) || /\b(?:while|whereas)\b.*\b(?:the other(?:s|\s+models?)?)\b.*\b(?:do not|don'?t|refrain|avoid|only|simply|use more general)\b/i.test(d)
        
        if (isOmission || isDetailDiff || isToneDiff || isFocusDiff || isExtraDetail) {
          console.log(`[Judge] Filtered out non-contradiction: "${d.substring(0, 80)}..."`)
          return false
        }
        return true
      })
      if (beforeFilter !== disagreements.length) {
        console.log(`[Judge] Post-filter: ${beforeFilter} → ${disagreements.length} disagreements (removed ${beforeFilter - disagreements.length} coverage differences)`)
      }
      console.log('[Judge] Extracted disagreements:', disagreements.length, disagreements)
    } else {
      console.log('[Judge] No disagreements section matched!')
    }
    
    // Extract differences
    let differences = []
    if (differencesMatch) {
      const rawDifferences = differencesMatch[1]
      console.log('[Judge] Raw differences section:', rawDifferences.substring(0, 500))
      differences = rawDifferences
        .split('\n')
        .filter(l => l.trim() && !l.match(/^[-•*]\s*$/))
        .map(l => l.replace(/^[-•*\[\]]\s*/, '').replace(/^\d+\.\s*/, '').trim())
        .filter(l => {
          const isEmpty = !l || l.length < 5
          const isNone = l.toLowerCase().startsWith('none identified') || l.toLowerCase().startsWith('no notable')
          const isGarbage = l.match(/^\*+:?$/) || l.match(/^\(.*\)$/)
          return !isEmpty && !isNone && !isGarbage
        })
      console.log('[Judge] Extracted differences:', differences.length, differences)
    } else {
      console.log('[Judge] No differences section matched!')
    }
    
    // Post-process: replace any full model names with short friendly names
    const shortenModelNames = (text) => {
      if (!text) return text
      return text
        .replace(/GPT[-\s]?4\.1/gi, 'ChatGPT')
        .replace(/GPT[-\s]?4o[-\s]?mini/gi, 'ChatGPT')
        .replace(/GPT[-\s]?5\.2/gi, 'ChatGPT')
        .replace(/GPT[-\s]?5[-\s]?mini/gi, 'ChatGPT')
        .replace(/OpenAI[-\s]?gpt[-\s]?[\d.]+[-\w]*/gi, 'ChatGPT')
        .replace(/Claude\s+4\.5\s+Sonnet/gi, 'Claude')
        .replace(/Claude\s+4\.5\s+Opus/gi, 'Claude')
        .replace(/Claude\s+4\s+Sonnet/gi, 'Claude')
        .replace(/anthropic[-\s]claude[-\s][\d.]+[-\w]*/gi, 'Claude')
        .replace(/Gemini\s+3\s+Flash/gi, 'Gemini')
        .replace(/Gemini\s+3\s+Pro/gi, 'Gemini')
        .replace(/Gemini\s+2\.5\s+Flash[-\s]?Lite/gi, 'Gemini')
        .replace(/google[-\s]gemini[-\s][\d.]+[-\w]*/gi, 'Gemini')
        .replace(/Grok\s+4[-\s]?1[-\s]?fast[-\s]?(?:non[-\s]?)?reasoning/gi, 'Grok')
        .replace(/Grok[-\s]?4[-\s]?1[-\s]?fast/gi, 'Grok')
        .replace(/xai[-\s]grok[-\s][\d.]+[-\w]*/gi, 'Grok')
    }
    summary = shortenModelNames(summary)
    agreements = agreements.map(a => shortenModelNames(a))
    disagreements = disagreements.map(d => shortenModelNames(d))
    differences = differences.map(d => shortenModelNames(d))

    return {
      consensus: consensus,
      summary: summary,
      agreements: agreements,
      disagreements: disagreements,
      differences: differences,
      prompt: judgePrompt,
      response: content,
      tokens: judgeTokenInfo
    }
  } catch (error) {
    console.error(`[Judge] Error in finalization: ${error.message}`)
    return {
      consensus: null,
      summary: `Error analyzing responses: ${error.message}`,
      agreements: [],
      disagreements: [],
      differences: [],
      prompt: judgePrompt,
      response: `Error: ${error.message}`
    }
  }
}

// Summarize judge response using Gemini 2.5 Flash Lite (max 75 tokens)
const summarizeJudgeResponse = async (judgeResponseText, userId = null) => {
  console.log('[Summarize] Summarizing judge response using Gemini 2.5 Flash Lite')
  
  const summaryPrompt = `Summarize this response in 75 tokens or less. Be concise but preserve key information and context:

${judgeResponseText}

Provide only the summary (max 75 tokens):`
  
  try {
    const apiKey = API_KEYS.google
    if (!apiKey) {
      console.warn('[Summarize] Google API key not configured, using fallback truncation')
      // Fallback: simple truncation
      return { 
        summary: judgeResponseText.substring(0, 200) + (judgeResponseText.length > 200 ? '...' : ''), 
        tokens: 50 // Estimate
      }
    }
    
    const response = await axios.post(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-lite:generateContent?key=${apiKey}`,
      {
        contents: [{ parts: [{ text: summaryPrompt }] }],
        generationConfig: {
          maxOutputTokens: 100, // Limit output to help stay under 75 tokens
          temperature: 0.3
        }
      },
      {
        headers: {
          'Content-Type': 'application/json'
        }
      }
    )
    
    let summary = response.data.candidates[0].content.parts[0].text.trim()
    
    // Count tokens using existing token counter
    let tokens = await countTokens(summary, 'google', 'gemini-2.5-flash-lite')
    
    // If over 75 tokens, truncate intelligently
    if (tokens > 75) {
      console.log(`[Summarize] Summary is ${tokens} tokens, truncating to 75...`)
      // Truncate by words, checking token count
      const words = summary.split(' ')
      let truncated = ''
      let tokenCount = 0
      
      for (const word of words) {
        const wordTokens = await countTokens(word + ' ', 'google', 'gemini-2.5-flash-lite')
        if (tokenCount + wordTokens > 75) break
        truncated += (truncated ? ' ' : '') + word
        tokenCount += wordTokens
      }
      
      summary = truncated + (truncated.length < summary.length ? '...' : '')
      tokens = tokenCount
    }
    
    // Track usage if userId is provided
    if (userId) {
      const responseTokens = extractTokensFromResponse(response.data, 'google')
      let inputTokens = 0
      let outputTokens = 0
      
      if (responseTokens) {
        inputTokens = responseTokens.inputTokens || 0
        outputTokens = responseTokens.outputTokens || 0
      } else {
        inputTokens = await countTokens(summaryPrompt, 'google', 'gemini-2.5-flash-lite')
        outputTokens = await countTokens(summary, 'google', 'gemini-2.5-flash-lite')
      }
      
      trackUsage(userId, 'google', 'gemini-2.5-flash-lite', inputTokens, outputTokens, true)
    }
    
    console.log(`[Summarize] Summary created: ${tokens} tokens`)
    return { summary, tokens }
  } catch (error) {
    console.error('[Summarize] Error summarizing judge response:', error)
    // Fallback: simple truncation
    return { 
      summary: judgeResponseText.substring(0, 200) + (judgeResponseText.length > 200 ? '...' : ''), 
      tokens: 50 // Estimate
    }
  }
}

// Store judge conversation context (rolling window of 5 - position 0 is full, positions 1-4 are summarized)
const storeJudgeContext = async (userId, judgeResponse, originalPrompt = null) => {
  if (!userId) return
  
  try {
    const usage = readUsage()
    if (!usage[userId]) {
      usage[userId] = {
        judgeConversationContext: []
      }
    }
    
    if (!usage[userId].judgeConversationContext) {
      usage[userId].judgeConversationContext = []
    }
    
    const context = usage[userId].judgeConversationContext
    
    // If there's an existing item at position 0 (full response), summarize it before shifting
    if (context.length > 0 && context[0].isFull) {
      console.log('[Judge Context] Summarizing previous full response before adding new one')
      const { summary, tokens } = await summarizeJudgeResponse(context[0].response, userId)
      context[0] = {
        summary,
        tokens,
        originalPrompt: context[0].originalPrompt,
        timestamp: context[0].timestamp,
        isFull: false // Now it's summarized
      }
    }
    
    // Add new FULL response at position 0 (not summarized yet)
    context.unshift({
      response: judgeResponse, // Store full response
      summary: null, // Will be summarized when pushed to position 1
      tokens: null,
      originalPrompt: originalPrompt || null, // Just the user's prompt
      timestamp: new Date().toISOString(),
      isFull: true // Flag to indicate this is a full response
    })
    
    // Keep only last 5
    if (context.length > 5) {
      usage[userId].judgeConversationContext = context.slice(0, 5)
    }
    
    writeUsage(usage)
    console.log(`[Judge Context] Stored full response for user ${userId}, total context entries: ${usage[userId].judgeConversationContext.length}`)
  } catch (error) {
    console.error('[Judge Context] Error storing context:', error)
  }
}

// Store model conversation context (rolling window of 5 per model — same pattern as judge context)
// Key: modelConversationContext[modelName] = [ { response, summary, tokens, originalPrompt, timestamp, isFull } ]
const storeModelContext = async (userId, modelName, modelResponse, originalPrompt = null) => {
  if (!userId || !modelName) return
  
  try {
    const usage = readUsage()
    if (!usage[userId]) {
      usage[userId] = { modelConversationContext: {} }
    }
    
    if (!usage[userId].modelConversationContext) {
      usage[userId].modelConversationContext = {}
    }
    
    if (!usage[userId].modelConversationContext[modelName]) {
      usage[userId].modelConversationContext[modelName] = []
    }
    
    const context = usage[userId].modelConversationContext[modelName]
    
    // If there's an existing item at position 0 (full response), summarize it before shifting
    if (context.length > 0 && context[0].isFull) {
      console.log(`[Model Context] Summarizing previous full response for ${modelName} before adding new one`)
      const { summary, tokens } = await summarizeJudgeResponse(context[0].response, userId)
      context[0] = {
        summary,
        tokens,
        originalPrompt: context[0].originalPrompt,
        timestamp: context[0].timestamp,
        isFull: false // Now it's summarized
      }
    }
    
    // Add new FULL response at position 0 (not summarized yet)
    context.unshift({
      response: modelResponse, // Store full response
      summary: null, // Will be summarized when pushed to position 1
      tokens: null,
      originalPrompt: originalPrompt || null,
      timestamp: new Date().toISOString(),
      isFull: true
    })
    
    // Keep only last 5
    if (context.length > 5) {
      usage[userId].modelConversationContext[modelName] = context.slice(0, 5)
    }
    
    writeUsage(usage, userId)
    console.log(`[Model Context] Stored full response for ${modelName}, user ${userId}, total context entries: ${usage[userId].modelConversationContext[modelName].length}`)
  } catch (error) {
    console.error(`[Model Context] Error storing context for ${modelName}:`, error)
  }
}

// Store initial summary from summary window (when first created)
app.post('/api/judge/store-initial-summary', async (req, res) => {
  try {
    const { userId, summaryText, originalPrompt } = req.body
    
    if (!userId || !summaryText) {
      return res.status(400).json({ error: 'userId and summaryText are required' })
    }
    
    // Store the initial summary in conversation context
    await storeJudgeContext(userId, summaryText, originalPrompt)
    
    res.json({ success: true, message: 'Initial summary stored' })
  } catch (error) {
    console.error('[Store Initial Summary] Error:', error)
    res.status(500).json({ error: 'Failed to store initial summary: ' + error.message })
  }
})

// RAG Pipeline endpoint
app.post('/api/rag', async (req, res) => {
  // Check subscription status
  const { userId } = req.body || {}
  if (userId) {
    const subscriptionCheck = await checkSubscriptionStatus(userId)
    if (!subscriptionCheck.hasAccess) {
      return res.status(403).json({ 
        error: 'Active subscription required. Please subscribe to use this service.',
        subscriptionRequired: true,
        reason: subscriptionCheck.reason
      })
    }
  }
  console.log('[RAG Pipeline] ===== ENDPOINT HIT =====')
  console.log('[RAG Pipeline] Request body:', JSON.stringify(req.body, null, 2))
  try {
    const { query, selectedModels, userId, needsContext: needsContextHint } = req.body
    
    console.log('[RAG Pipeline] Parsed request:', { query, selectedModels, userId, needsContextHint })
    
    if (!query || !query.trim()) {
      console.log('[RAG Pipeline] Error: Missing query')
      return res.status(400).json({ error: 'Missing required field: query' })
    }
    
    if (!selectedModels || !Array.isArray(selectedModels) || selectedModels.length === 0) {
      console.log('[RAG Pipeline] Error: Missing or empty selectedModels')
      return res.status(400).json({ error: 'Missing or empty selectedModels array' })
    }
    
    console.log(`[RAG Pipeline] Starting pipeline for: "${query}" with ${selectedModels.length} models`)
    
    // Stage 1: Search (Serper)
    const serperApiKey = API_KEYS.serper
    if (!serperApiKey) {
      return res.status(400).json({ error: 'Serper API key not configured' })
    }
    
    console.log('[RAG Pipeline] Stage 1: Performing Serper search...')
    console.log('[RAG Pipeline] Serper API key present:', !!serperApiKey, 'Length:', serperApiKey?.length)
    
    // Reformulate the user's conversational prompt into an effective search query
    const searchQuery = await reformulateSearchQuery(query, userId)
    
    // Use the helper function directly instead of making an HTTP call
    let serperData
    try {
      // Request 5 results to ensure we have at least 5 parseable sources after filtering
      serperData = await performSerperSearch(searchQuery, 5)
      console.log('[RAG Pipeline] Serper search successful, results:', serperData?.organic?.length || 0)
    } catch (serperError) {
      console.error('[RAG Pipeline] Serper search failed:', serperError.message)
      console.error('[RAG Pipeline] Serper error details:', {
        message: serperError.message,
        response: serperError.response?.data,
        status: serperError.response?.status
      })
      // Return error response instead of throwing
      return res.status(500).json({
        error: `Serper search failed: ${serperError.message}`,
        query,
        search_results: [],
        refined_data: null,
        council_responses: [],
      })
    }
    
    const searchResults = (serperData?.organic || []).map(r => ({
      title: r.title,
      link: r.link,
      snippet: r.snippet
    }))
    
    if (searchResults.length === 0) {
      console.warn('[RAG Pipeline] WARNING: Serper returned no search results!')
    }
    
    // Track query usage
    if (userId) {
      const usage = readUsage()
      if (!usage[userId]) {
        usage[userId] = {
          totalTokens: 0,
          totalInputTokens: 0,
          totalOutputTokens: 0,
          totalQueries: 0,
          totalPrompts: 0,
          monthlyUsage: {},
          providers: {},
          models: {},
        }
      }
      
      const userUsage = usage[userId]
      const tz = getUserTimezone(userId)
      const currentMonth = getMonthForUser(tz)
      
      // Increment total queries
      userUsage.totalQueries = (userUsage.totalQueries || 0) + 1
      
      // Ensure monthlyUsage exists before accessing it
      if (!userUsage.monthlyUsage) {
        userUsage.monthlyUsage = {}
      }
      
      // Increment monthly queries
      if (!userUsage.monthlyUsage[currentMonth]) {
        userUsage.monthlyUsage[currentMonth] = { tokens: 0, inputTokens: 0, outputTokens: 0, queries: 0, prompts: 0 }
      }
      userUsage.monthlyUsage[currentMonth].queries = (userUsage.monthlyUsage[currentMonth].queries || 0) + 1
      
      // Track daily query usage
      const today = getTodayForUser(tz)
      if (!userUsage.dailyUsage) {
        userUsage.dailyUsage = {}
      }
      if (!userUsage.dailyUsage[currentMonth]) {
        userUsage.dailyUsage[currentMonth] = {}
      }
      if (!userUsage.dailyUsage[currentMonth][today]) {
        userUsage.dailyUsage[currentMonth][today] = { inputTokens: 0, outputTokens: 0, queries: 0, models: {} }
      }
      userUsage.dailyUsage[currentMonth][today].queries = (userUsage.dailyUsage[currentMonth][today].queries || 0) + 1
      
      writeUsage(usage, userId)
      console.log(`[Query Tracking] User ${userId}: Total queries ${userUsage.totalQueries}, Monthly queries ${userUsage.monthlyUsage[currentMonth].queries}`)
      
      // Also add query cost to monthlyUsageCost in users cache
      try {
        const users = readUsers()
        const user = users[userId]
        if (user) {
          const queryCost = calculateSerperQueryCost(1)
          if (!user.monthlyUsageCost) {
            user.monthlyUsageCost = {}
          }
          const existingCost = user.monthlyUsageCost[currentMonth] || 0
          user.monthlyUsageCost[currentMonth] = existingCost + queryCost
          writeUsers(users, userId)
          console.log(`[Query Tracking] Added $${queryCost.toFixed(6)} query cost. New total: $${user.monthlyUsageCost[currentMonth].toFixed(4)}`)
        }
      } catch (costErr) {
        console.error('[Query Tracking] Error updating monthlyUsageCost:', costErr)
      }
    }
    
    console.log(`[RAG Pipeline] Search completed, found ${searchResults.length} results`)
    
    // Query tracking is already handled by /api/search endpoint, so we don't need to track it again here
    
    // Stage 2: Scrape raw source content (no refiner LLM — models read sources directly)
    console.log('[RAG Pipeline] Stage 2: Scraping raw source content for direct model consumption...')
    let rawSourcesData
    try {
      rawSourcesData = await formatRawSourcesForPrompt(searchResults, 5)
      console.log(`[RAG Pipeline] Raw sources scraped: ${rawSourcesData.sourceCount} sources, ${rawSourcesData.formatted.length} chars`)
    } catch (scrapeError) {
      console.error('[RAG Pipeline] Source scraping error:', scrapeError.message)
      rawSourcesData = { formatted: '', sourceCount: 0, scrapedSources: [] }
    }
    
    // Stage 2.5: Memory — retrieve relevant past conversations for this user
    let memoryContextString = ''
    let memoryContextItems = [] // Store for debug/frontend display
    if (userId) {
      // Use needsContext as a soft gate: if the detector says context IS needed, use a lower
      // threshold (0.70) to be more permissive. If context is NOT explicitly needed, use a
      // higher threshold (0.82) so only very relevant past conversations get injected.
      const scoreThreshold = needsContextHint ? 0.70 : 0.82
      console.log(`[RAG Pipeline] Stage 2.5: Retrieving relevant memory context (needsContext: ${!!needsContextHint}, threshold: ${scoreThreshold})...`)
      memoryContextItems = await findRelevantContext(userId, query, 3, scoreThreshold)
      memoryContextString = formatMemoryContext(memoryContextItems)
      if (memoryContextString) {
        console.log(`[RAG Pipeline] Memory: Injecting ${memoryContextItems.length} past conversations as context (scores: ${memoryContextItems.map(c => c.score?.toFixed(3)).join(', ')})`)
      } else {
        console.log('[RAG Pipeline] Memory: No relevant past conversations found above threshold')
      }
    }

    // Stage 3: Council (parallel processing) — models receive raw source content directly
    console.log(`[RAG Pipeline] Stage 3: Council processing with ${selectedModels.length} models...`)
    const councilPromises = selectedModels.map(async (modelId) => {
      console.log(`[RAG Pipeline] Council: Processing ${modelId}...`)
      const firstDashIndex = modelId.indexOf('-')
      if (firstDashIndex === -1) {
        return {
          model_name: modelId,
          response: '',
          error: 'Invalid model ID format'
        }
      }
      
      const providerKey = modelId.substring(0, firstDashIndex)
      let model = modelId.substring(firstDashIndex + 1)
      let councilTokenInfo = null // Store token info for this council call
      
      // Map UI model names to actual API model names
      const modelMappings = {
        // Anthropic Claude models
        'claude-4.5-opus': 'claude-opus-4-5-20251101',
        'claude-4.5-sonnet': 'claude-sonnet-4-5-20250929',
        'claude-4.5-haiku': 'claude-haiku-4-5-20251001',
        
        // Google Gemini models
        'gemini-3-pro': 'gemini-3-pro-preview',
        'gemini-3-flash': 'gemini-3-flash-preview',
        // gemini-2.5-flash-lite is already correct
        
        // Mistral models
        'magistral-medium': 'magistral-medium-latest',
        'mistral-medium-3.1': 'mistral-medium-latest',
        'mistral-small-3.2': 'mistral-small-latest',
      }
      
      // Apply mapping if it exists, otherwise use the model name as-is
      const mappedModel = modelMappings[model] || model
      
      if (modelMappings[model]) {
        console.log(`[RAG Pipeline] Model mapping: "${model}" -> "${mappedModel}"`)
      }
      
      // Prepare council prompt with raw source content
      console.log(`[RAG Pipeline] Council: Preparing prompt for ${modelId}`)
      console.log(`[RAG Pipeline] Council: Raw sources count: ${rawSourcesData.sourceCount}`)
      
      const councilPrompt = `Today's date is ${getCurrentDateStringForUser(userId)}.
${memoryContextString ? `\n${memoryContextString}` : ''}
Web Sources (background reference material):
${rawSourcesData.formatted}

The above sources are from a real-time web search and may contain useful context. Use them as reference where relevant, but DO NOT cite by number (do not write "source 1", "source 3", etc.). Instead, cite where information came from using the source's publication/site name, title, or URL/domain. Answer primarily from your own knowledge and expertise, and do not limit your response to only what the sources cover.

User Query: ${query}`
      
      console.log(`[RAG Pipeline] Council: Prompt length: ${councilPrompt.length} chars`)
      console.log(`[RAG Pipeline] Council: Raw sources text length: ${rawSourcesData.formatted.length} chars`)
      
      try {
        // Call LLM directly (reuse the logic from /api/llm endpoint)
        const apiKey = API_KEYS[providerKey]
        if (!apiKey || apiKey.trim() === '') {
          throw new Error(`No API key configured for provider: ${providerKey}`)
        }

        // Use mapped model (mapping applied above)

        let responseText = ''
        
        // OpenAI-compatible providers
        if (['openai', 'xai', 'meta', 'deepseek', 'mistral'].includes(providerKey)) {
          const baseUrls = {
            openai: 'https://api.openai.com/v1',
            xai: 'https://api.x.ai/v1',
            meta: 'https://api.groq.com/openai/v1',
            deepseek: 'https://api.deepseek.com/v1',
            mistral: 'https://api.mistral.ai/v1',
          }
          
          console.log(`[RAG Pipeline] ===== Council LLM API CALL =====`)
          console.log(`[RAG Pipeline] Provider: ${providerKey}`)
          console.log(`[RAG Pipeline] Model: ${mappedModel}${model !== mappedModel ? ` (mapped from ${model})` : ' (no mapping needed)'}`)
          
          // Some models only support default temperature (1) and don't accept the temperature parameter
          // gpt-5-mini only supports the default temperature value (1)
          const modelsWithFixedTemperature = ['gpt-5-mini']
          const shouldUseDefaultTemperature = modelsWithFixedTemperature.includes(mappedModel) || modelsWithFixedTemperature.includes(model)
          
          const apiRequestBody = {
            model: mappedModel,
            messages: [{ role: 'user', content: councilPrompt }],
            ...(shouldUseDefaultTemperature ? {} : { temperature: 0.7 }),
          }
          
          console.log(`[RAG Pipeline] API Request URL: ${baseUrls[providerKey]}/chat/completions`)
          console.log(`[RAG Pipeline] API Request Body:`, JSON.stringify({ ...apiRequestBody, messages: [{ role: 'user', content: '[PROMPT TRUNCATED FOR LOGGING]' }] }, null, 2))
          
          const response = await axios.post(
            `${baseUrls[providerKey]}/chat/completions`,
            apiRequestBody,
            {
              headers: {
                'Authorization': `Bearer ${apiKey}`,
                'Content-Type': 'application/json',
              },
            }
          )
          
          console.log(`[RAG Pipeline] Council: ${modelId} response received`)
          
          // Handle different response formats
          let content = response.data.choices[0].message.content
          
          // Clean Mistral responses to remove thinking/reasoning content
          // NOTE: Mistral is temporarily disabled in main app UI but backend support remains intact
          if (providerKey === 'mistral') {
            content = cleanMistralResponse(content)
          }
          
          if (typeof content === 'string') {
            responseText = content
          } else if (Array.isArray(content)) {
            // If content is an array, join the text parts
            responseText = content.map(item => {
              if (typeof item === 'string') return item
              if (item && typeof item === 'object' && item.text) return item.text
              return String(item || '')
            }).join(' ')
          } else if (content && typeof content === 'object') {
            // If content is an object, try to extract text
            responseText = content.text || content.content || JSON.stringify(content)
          } else {
            responseText = String(content || '')
          }
          
          console.log(`[RAG Pipeline] Council: ${modelId} responseText type: ${typeof responseText}, length: ${responseText.length}`)
          
          // Track usage
          let inputTokens = 0
          let outputTokens = 0
          let tokenSource = 'none'
          
          let reasoningTokens = 0
          if (userId && responseText) {
            const responseTokens = extractTokensFromResponse(response.data, providerKey)
            
            if (responseTokens) {
              inputTokens = responseTokens.inputTokens || 0
              outputTokens = responseTokens.outputTokens || 0
              reasoningTokens = responseTokens.reasoningTokens || 0
              tokenSource = 'api_response'
            } else {
              inputTokens = await countTokens(councilPrompt, providerKey, mappedModel)
              outputTokens = await countTokens(responseText, providerKey, mappedModel)
              tokenSource = 'tokenizer'
            }
            
            trackUsage(userId, providerKey, model, inputTokens, outputTokens)
          }
          
          // Store token info for return
          const tokenInfo = userId && responseText ? {
            input: inputTokens,
            output: outputTokens,
            total: inputTokens + outputTokens,
            reasoningTokens: reasoningTokens, // Reasoning tokens from API metadata
            provider: providerKey,
            model: model,
            source: tokenSource,
            breakdown: buildTokenBreakdown(query, rawSourcesData?.formatted, inputTokens)
          } : null
          
          // Store token info in a variable accessible to return statement
          councilTokenInfo = tokenInfo
        } else if (providerKey === 'google') {
          // Google/Gemini
          // Preview models (gemini-3-*-preview) use v1beta, stable models use v1
          const isPreviewModel = mappedModel.includes('-preview')
          const apiVersion = isPreviewModel ? 'v1beta' : 'v1'
          const baseUrl = `https://generativelanguage.googleapis.com/${apiVersion}`
          
          console.log(`[RAG Pipeline] Gemini API call:`, {
            baseUrl,
            mappedModel,
            originalModel: model,
            apiVersion,
            isPreviewModel
          })
          
          const response = await axios.post(
            `${baseUrl}/models/${mappedModel}:generateContent?key=${apiKey}`,
            {
              contents: [{ parts: [{ text: councilPrompt }] }],
            },
            {
              headers: {
                'Content-Type': 'application/json',
              },
            }
          )
          
          responseText = response.data.candidates[0].content.parts[0].text
          
          // Track usage
          let inputTokens = 0
          let outputTokens = 0
          let tokenSource = 'none'
          
          if (userId && responseText) {
            const responseTokens = extractTokensFromResponse(response.data, providerKey)
            
            if (responseTokens) {
              inputTokens = responseTokens.inputTokens || 0
              outputTokens = responseTokens.outputTokens || 0
              tokenSource = 'api_response'
            } else {
              inputTokens = await countTokens(councilPrompt, providerKey, mappedModel)
              outputTokens = await countTokens(responseText, providerKey, mappedModel)
              tokenSource = 'tokenizer'
            }
            
            trackUsage(userId, providerKey, model, inputTokens, outputTokens)
            
            councilTokenInfo = {
              input: inputTokens,
              output: outputTokens,
              total: inputTokens + outputTokens,
              provider: providerKey,
              model: model,
              source: tokenSource,
              breakdown: buildTokenBreakdown(query, rawSourcesData?.formatted, inputTokens)
            }
          }
        } else if (providerKey === 'anthropic') {
          // Anthropic/Claude
          const response = await axios.post(
            'https://api.anthropic.com/v1/messages',
            {
              model: mappedModel,
              max_tokens: 4096,
              messages: [{ role: 'user', content: councilPrompt }],
            },
            {
              headers: {
                'x-api-key': apiKey,
                'anthropic-version': '2023-06-01',
                'Content-Type': 'application/json',
              },
            }
          )
          
          responseText = response.data.content[0].text
          
          // Track usage
          let inputTokens = 0
          let outputTokens = 0
          let tokenSource = 'none'
          
          if (userId && responseText) {
            const responseTokens = extractTokensFromResponse(response.data, providerKey)
            
            if (responseTokens) {
              inputTokens = responseTokens.inputTokens || 0
              outputTokens = responseTokens.outputTokens || 0
              tokenSource = 'api_response'
            } else {
              inputTokens = await countTokens(councilPrompt, providerKey, mappedModel)
              outputTokens = await countTokens(responseText, providerKey, mappedModel)
              tokenSource = 'tokenizer'
            }
            
            trackUsage(userId, providerKey, model, inputTokens, outputTokens)
            
            councilTokenInfo = {
              input: inputTokens,
              output: outputTokens,
              total: inputTokens + outputTokens,
              provider: providerKey,
              model: model,
              source: tokenSource,
              breakdown: buildTokenBreakdown(query, rawSourcesData?.formatted, inputTokens)
            }
          }
        } else {
          throw new Error(`Unsupported provider: ${providerKey}`)
        }
        
        // Ensure responseText is always a string
        const safeResponseText = typeof responseText === 'string' ? responseText : String(responseText || '')
        
        return {
          model_name: modelId, // User-selected model name
          actual_model_name: mappedModel, // Actual API model name used
          original_model_name: model, // Original model from modelId
          response: safeResponseText,
          prompt: councilPrompt,
          error: null,
          tokens: councilTokenInfo
        }
      } catch (error) {
        console.error(`[RAG Pipeline] Error calling ${modelId}:`, error.message)
        console.error(`[RAG Pipeline] Error details:`, {
          message: error.message,
          status: error.response?.status,
          statusText: error.response?.statusText,
          data: error.response?.data,
          url: error.config?.url,
          method: error.config?.method
        })
        
        // Handle Mistral capacity/rate limit errors with user-friendly message
        let errorMessage = error.message
        if (providerKey === 'mistral') {
          const apiErrorMessage = error.response?.data?.message || error.message || ''
          if (apiErrorMessage.includes('Service tier capacity exceeded') || 
              apiErrorMessage.includes('capacity exceeded') ||
              apiErrorMessage.includes('rate limit') ||
              error.response?.status === 429) {
            errorMessage = 'Mistral API capacity exceeded. The model is currently at capacity. Please try again later or use a different model.'
          }
        }
        
        // Use model name directly since we're not mapping anymore
        return {
          model_name: modelId, // User-selected model name
          actual_model_name: mappedModel || model, // Actual API model name
          original_model_name: model, // Original model from modelId
          response: '',
          prompt: councilPrompt,
          error: errorMessage
        }
      }
    })
    
    const councilResponses = await Promise.all(councilPromises)
    console.log(`[RAG Pipeline] Council completed, received ${councilResponses.length} responses`)
    
    // Judge finalization is now handled client-side via streaming endpoint
    // (saves tokens and lets the user see the summary stream in real-time)
    // Store each council model's initial response so council tab conversations have context
    if (userId) {
      for (const cr of councilResponses) {
        if (cr.response && cr.model_name) {
          storeModelContext(userId, cr.model_name, cr.response, query).catch(err => {
            console.error(`[RAG Pipeline] Error storing initial model context for ${cr.model_name}:`, err)
          })
        }
      }
    }
    
    console.log('[RAG Pipeline] Pipeline complete!')
    console.log('[RAG Pipeline] Council responses count:', councilResponses.length)
    
    console.log('[RAG Pipeline] Preparing response (no refiner — raw sources sent to models)')
    
    // CRITICAL: Flush all token data to MongoDB before responding.
    // On Vercel serverless, the next request (POST /api/stats/prompt) might hit a
    // different instance. If we don't flush here, the token data from trackUsage
    // calls above would be lost in this instance's memory.
    if (userId && usageDirtyUsers.size > 0) {
      try {
        await flushUsageToMongo()
        console.log('[RAG Pipeline] Token data flushed to MongoDB')
      } catch (err) {
        console.error('[RAG Pipeline] Token flush failed:', err.message)
      }
    }
    
    return res.json({
      query,
      search_results: searchResults,
      refined_data: null, // No refiner — models read raw sources directly
      council_responses: councilResponses,
      raw_sources: {
        source_count: rawSourcesData.sourceCount,
        scraped_sources: rawSourcesData.scrapedSources,
      },
      memory_context: {
        items: memoryContextItems,
        needsContextHint: !!needsContextHint,
        scoreThreshold: needsContextHint ? 0.70 : 0.82,
        injected: memoryContextItems.length > 0,
      },
    })
  } catch (error) {
    console.error('[RAG Pipeline] Error:', error)
    console.error('[RAG Pipeline] Error stack:', error.stack)
    console.error('[RAG Pipeline] Error details:', {
      message: error.message,
      name: error.name,
      code: error.code,
      response: error.response?.data,
      status: error.response?.status,
      config: error.config ? {
        url: error.config.url,
        method: error.config.method
      } : null
    })
    
    // If it's an axios error, provide more details
    if (error.response) {
      console.error('[RAG Pipeline] Axios error response:', {
        status: error.response.status,
        statusText: error.response.statusText,
        data: error.response.data
      })
    }
    
    return res.status(500).json({
      error: error.message || 'Unknown error in RAG pipeline',
      details: process.env.NODE_ENV === 'development' ? {
        message: error.message,
        stack: error.stack,
        response: error.response?.data,
        status: error.response?.status
      } : undefined
    })
  }
})

// Stream one council model response for the RAG pipeline and emit per-token events.
async function streamRagCouncilModel({
  modelId,
  query,
  rawSourcesData,
  memoryContextString,
  userId,
  sendSSE,
  rolePrompt,
}) {
  const firstDashIndex = modelId.indexOf('-')
  if (firstDashIndex === -1) {
    const invalidResult = {
      model_name: modelId,
      actual_model_name: modelId,
      original_model_name: modelId,
      response: '',
      error: 'Invalid model ID format',
      tokens: null,
    }
    sendSSE('model_error', invalidResult)
    return invalidResult
  }

  const providerKey = modelId.substring(0, firstDashIndex)
  const model = modelId.substring(firstDashIndex + 1)
  const modelMappings = {
    'claude-4.5-opus': 'claude-opus-4-5-20251101',
    'claude-4.5-sonnet': 'claude-sonnet-4-5-20250929',
    'claude-4.5-haiku': 'claude-haiku-4-5-20251001',
    'gemini-3-pro': 'gemini-3-pro-preview',
    'gemini-3-flash': 'gemini-3-flash-preview',
    'magistral-medium': 'magistral-medium-latest',
    'mistral-medium-3.1': 'mistral-medium-latest',
    'mistral-small-3.2': 'mistral-small-latest',
  }
  const mappedModel = modelMappings[model] || model

  const baseCouncilPrompt = `Today's date is ${getCurrentDateStringForUser(userId)}.
${memoryContextString ? `\n${memoryContextString}` : ''}
Web Sources (background reference material):
${rawSourcesData.formatted}

The above sources are from a real-time web search and may contain useful context. Use them as reference where relevant, but DO NOT cite by number (do not write "source 1", "source 3", etc.). Instead, cite where information came from using the source's publication/site name, title, or URL/domain. Answer primarily from your own knowledge and expertise, and do not limit your response to only what the sources cover.

User Query: ${query}`

  const councilPrompt = rolePrompt
    ? `${rolePrompt}\n\n${baseCouncilPrompt}`
    : baseCouncilPrompt

  sendSSE('model_start', {
    model_name: modelId,
    actual_model_name: mappedModel,
    original_model_name: model,
  })

  try {
    const apiKey = API_KEYS[providerKey]
    if (!apiKey || apiKey.trim() === '') {
      throw new Error(`No API key configured for provider: ${providerKey}`)
    }

    let fullResponse = ''
    let inputTokens = 0
    let outputTokens = 0
    let reasoningTokens = 0
    let tokenSource = 'none'

    if (['openai', 'xai', 'meta', 'deepseek', 'mistral'].includes(providerKey)) {
      const baseUrls = {
        openai: 'https://api.openai.com/v1',
        xai: 'https://api.x.ai/v1',
        meta: 'https://api.groq.com/openai/v1',
        deepseek: 'https://api.deepseek.com/v1',
        mistral: 'https://api.mistral.ai/v1',
      }

      const modelsWithFixedTemperature = ['gpt-5-mini']
      const shouldUseDefaultTemperature = modelsWithFixedTemperature.includes(mappedModel) || modelsWithFixedTemperature.includes(model)

      const councilMessages = []
      if (rolePrompt) councilMessages.push({ role: 'system', content: rolePrompt })
      councilMessages.push({ role: 'user', content: rolePrompt ? baseCouncilPrompt : councilPrompt })

      const streamResponse = await axios.post(
        `${baseUrls[providerKey]}/chat/completions`,
        {
          model: mappedModel,
          messages: councilMessages,
          ...(shouldUseDefaultTemperature ? {} : { temperature: 0.7 }),
          stream: true,
        },
        {
          headers: {
            'Authorization': `Bearer ${apiKey}`,
            'Content-Type': 'application/json',
          },
          responseType: 'stream',
        }
      )

      await new Promise((resolve, reject) => {
        let buffer = ''
        const processLine = (line) => {
          if (!line.startsWith('data:')) return
          const jsonStr = line.replace(/^data:\s*/, '').trim()
          if (!jsonStr || jsonStr === '[DONE]') return
          try {
            const parsed = JSON.parse(jsonStr)
            const token = parsed.choices?.[0]?.delta?.content || ''
            if (token) {
              fullResponse += token
              sendSSE('model_token', {
                model_name: modelId,
                actual_model_name: mappedModel,
                original_model_name: model,
                content: token,
              })
            }
            if (parsed.usage) {
              inputTokens = parsed.usage.prompt_tokens || inputTokens
              outputTokens = parsed.usage.completion_tokens || outputTokens
            }
          } catch (_) { /* skip malformed partial events */ }
        }

        streamResponse.data.on('data', (chunk) => {
          buffer += chunk.toString()
          const lines = buffer.split('\n')
          buffer = lines.pop() || ''
          for (const line of lines) processLine(line)
        })
        streamResponse.data.on('end', () => {
          if (buffer.trim()) {
            const remaining = buffer.split('\n')
            for (const line of remaining) processLine(line)
          }
          resolve()
        })
        streamResponse.data.on('error', reject)
      })

      // NOTE: Mistral supports streaming but sometimes returns reasoning wrappers.
      if (providerKey === 'mistral') {
        fullResponse = cleanMistralResponse(fullResponse)
      }
    } else if (providerKey === 'anthropic') {
      const anthropicCouncilBody = {
        model: mappedModel,
        max_tokens: 4096,
        messages: [{ role: 'user', content: rolePrompt ? baseCouncilPrompt : councilPrompt }],
        stream: true,
      }
      if (rolePrompt) anthropicCouncilBody.system = rolePrompt

      const streamResponse = await axios.post(
        'https://api.anthropic.com/v1/messages',
        anthropicCouncilBody,
        {
          headers: {
            'x-api-key': apiKey,
            'anthropic-version': '2023-06-01',
            'Content-Type': 'application/json',
          },
          responseType: 'stream',
          timeout: 120000,
        }
      )

      await new Promise((resolve, reject) => {
        let buffer = ''
        let streamError = null
        const processLine = (line) => {
          if (!line.startsWith('data: ')) return
          const jsonStr = line.replace('data: ', '').trim()
          if (!jsonStr) return
          try {
            const parsed = JSON.parse(jsonStr)
            if (parsed.type === 'content_block_delta') {
              const text = parsed.delta?.text || ''
              if (text) {
                fullResponse += text
                sendSSE('model_token', {
                  model_name: modelId,
                  actual_model_name: mappedModel,
                  original_model_name: model,
                  content: text,
                })
              }
            }
            if (parsed.type === 'message_delta' && parsed.usage) {
              outputTokens = parsed.usage.output_tokens || 0
            }
            if (parsed.type === 'message_start' && parsed.message?.usage) {
              inputTokens = parsed.message.usage.input_tokens || 0
            }
            if (parsed.type === 'error') {
              streamError = parsed.error?.message || 'Anthropic stream error'
            }
          } catch (_) { /* skip */ }
        }
        streamResponse.data.on('data', (chunk) => {
          buffer += chunk.toString()
          const lines = buffer.split('\n')
          buffer = lines.pop() || ''
          for (const line of lines) processLine(line)
        })
        streamResponse.data.on('end', () => {
          if (buffer.trim()) {
            const remaining = buffer.split('\n')
            for (const line of remaining) processLine(line)
          }
          if (streamError && !fullResponse) reject(new Error(streamError))
          else resolve()
        })
        streamResponse.data.on('error', reject)
      })
    } else if (providerKey === 'google') {
      const isPreviewModel = mappedModel.includes('-preview')
      const apiVersion = isPreviewModel ? 'v1beta' : 'v1'
      const baseUrl = `https://generativelanguage.googleapis.com/${apiVersion}`
      const geminiCouncilBody = {
        contents: [{ parts: [{ text: rolePrompt ? baseCouncilPrompt : councilPrompt }] }],
        generationConfig: { maxOutputTokens: 4096 },
      }
      if (rolePrompt) {
        geminiCouncilBody.systemInstruction = { parts: [{ text: rolePrompt }] }
      }
      const streamResponse = await axios.post(
        `${baseUrl}/models/${mappedModel}:streamGenerateContent?key=${apiKey}&alt=sse`,
        geminiCouncilBody,
        { responseType: 'stream' }
      )

      await new Promise((resolve, reject) => {
        let buffer = ''
        const processLine = (line) => {
          if (!line.startsWith('data: ')) return
          const jsonStr = line.replace('data: ', '').trim()
          if (!jsonStr) return
          try {
            const parsed = JSON.parse(jsonStr)
            const text = parsed.candidates?.[0]?.content?.parts?.[0]?.text || ''
            if (text) {
              fullResponse += text
              sendSSE('model_token', {
                model_name: modelId,
                actual_model_name: mappedModel,
                original_model_name: model,
                content: text,
              })
            }
            if (parsed.usageMetadata) {
              inputTokens = parsed.usageMetadata.promptTokenCount || inputTokens
              outputTokens = parsed.usageMetadata.candidatesTokenCount || outputTokens
            }
          } catch (_) { /* skip */ }
        }
        streamResponse.data.on('data', (chunk) => {
          buffer += chunk.toString()
          const lines = buffer.split('\n')
          buffer = lines.pop() || ''
          for (const line of lines) processLine(line)
        })
        streamResponse.data.on('end', () => {
          if (buffer.trim()) {
            const remaining = buffer.split('\n')
            for (const line of remaining) processLine(line)
          }
          resolve()
        })
        streamResponse.data.on('error', reject)
      })
    } else {
      throw new Error(`Unsupported provider: ${providerKey}`)
    }

    if (inputTokens === 0 && outputTokens === 0) {
      const responseTokens = null
      if (responseTokens) {
        inputTokens = responseTokens.inputTokens || 0
        outputTokens = responseTokens.outputTokens || 0
        reasoningTokens = responseTokens.reasoningTokens || 0
        tokenSource = 'api_response'
      } else {
        inputTokens = await countTokens(councilPrompt, providerKey, mappedModel)
        outputTokens = await countTokens(fullResponse, providerKey, mappedModel)
        tokenSource = 'tokenizer'
      }
    } else {
      tokenSource = 'api_response'
    }

    if (userId && fullResponse) {
      trackUsage(userId, providerKey, model, inputTokens, outputTokens)
    }

    const tokenInfo = userId && fullResponse ? {
      input: inputTokens,
      output: outputTokens,
      total: inputTokens + outputTokens,
      reasoningTokens: reasoningTokens,
      provider: providerKey,
      model: model,
      source: tokenSource,
      breakdown: buildTokenBreakdown(query, rawSourcesData?.formatted, inputTokens),
    } : null

    const result = {
      model_name: modelId,
      actual_model_name: mappedModel,
      original_model_name: model,
      response: fullResponse,
      prompt: councilPrompt,
      error: null,
      tokens: tokenInfo,
    }

    sendSSE('model_done', result)
    return result
  } catch (error) {
    console.error(`[RAG Stream] Error calling ${modelId}:`, error.message)
    const errorResult = {
      model_name: modelId,
      actual_model_name: mappedModel || model,
      original_model_name: model,
      response: '',
      prompt: councilPrompt,
      error: error.message || 'Unknown model error',
      tokens: null,
    }
    sendSSE('model_error', errorResult)
    return errorResult
  }
}

// SSE streaming version of RAG pipeline (search + council model streaming + done payload)
app.post('/api/rag/stream', async (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream')
  res.setHeader('Cache-Control', 'no-cache')
  res.setHeader('Connection', 'keep-alive')
  res.setHeader('X-Accel-Buffering', 'no')
  res.flushHeaders()

  const sendSSE = (type, data) => {
    try {
      res.write(`data: ${JSON.stringify({ type, ...data })}\n\n`)
    } catch (_) { /* stream may already be closed */ }
  }

  const heartbeat = setInterval(() => {
    try { res.write(': heartbeat\n\n') } catch (_) { clearInterval(heartbeat) }
  }, 15000)

  try {
    const { query, selectedModels, userId, needsContext: needsContextHint, rolePrompts } = req.body || {}

    if (userId) {
      const subscriptionCheck = await checkSubscriptionStatus(userId)
      if (!subscriptionCheck.hasAccess) {
        sendSSE('error', {
          message: 'Active subscription required. Please subscribe to use this service.',
          subscriptionRequired: true,
          reason: subscriptionCheck.reason,
        })
        clearInterval(heartbeat)
        return res.end()
      }
    }

    if (!query || !query.trim()) {
      sendSSE('error', { message: 'Missing required field: query' })
      clearInterval(heartbeat)
      return res.end()
    }
    if (!selectedModels || !Array.isArray(selectedModels) || selectedModels.length === 0) {
      sendSSE('error', { message: 'Missing or empty selectedModels array' })
      clearInterval(heartbeat)
      return res.end()
    }

    sendSSE('status', { message: 'Searching the web...' })

    const serperApiKey = API_KEYS.serper
    if (!serperApiKey) {
      sendSSE('error', { message: 'Serper API key not configured' })
      clearInterval(heartbeat)
      return res.end()
    }

    const searchQuery = await reformulateSearchQuery(query, userId)
    const serperData = await performSerperSearch(searchQuery, 5)
    const searchResults = (serperData?.organic || []).map(r => ({
      title: r.title,
      link: r.link,
      snippet: r.snippet,
    }))
    sendSSE('search_results', { search_results: searchResults })

    // Query tracking (same as /api/rag JSON endpoint)
    if (userId) {
      const usage = readUsage()
      if (!usage[userId]) {
        usage[userId] = {
          totalTokens: 0,
          totalInputTokens: 0,
          totalOutputTokens: 0,
          totalQueries: 0,
          totalPrompts: 0,
          monthlyUsage: {},
          providers: {},
          models: {},
        }
      }
      const userUsage = usage[userId]
      const tz = getUserTimezone(userId)
      const currentMonth = getMonthForUser(tz)
      userUsage.totalQueries = (userUsage.totalQueries || 0) + 1
      if (!userUsage.monthlyUsage) userUsage.monthlyUsage = {}
      if (!userUsage.monthlyUsage[currentMonth]) {
        userUsage.monthlyUsage[currentMonth] = { tokens: 0, inputTokens: 0, outputTokens: 0, queries: 0, prompts: 0 }
      }
      userUsage.monthlyUsage[currentMonth].queries = (userUsage.monthlyUsage[currentMonth].queries || 0) + 1
      const today = getTodayForUser(tz)
      if (!userUsage.dailyUsage) userUsage.dailyUsage = {}
      if (!userUsage.dailyUsage[currentMonth]) userUsage.dailyUsage[currentMonth] = {}
      if (!userUsage.dailyUsage[currentMonth][today]) {
        userUsage.dailyUsage[currentMonth][today] = { inputTokens: 0, outputTokens: 0, queries: 0, models: {} }
      }
      userUsage.dailyUsage[currentMonth][today].queries = (userUsage.dailyUsage[currentMonth][today].queries || 0) + 1
      writeUsage(usage, userId)

      try {
        const users = readUsers()
        const user = users[userId]
        if (user) {
          const queryCost = calculateSerperQueryCost(1)
          if (!user.monthlyUsageCost) user.monthlyUsageCost = {}
          const existingCost = user.monthlyUsageCost[currentMonth] || 0
          user.monthlyUsageCost[currentMonth] = existingCost + queryCost
          writeUsers(users, userId)
        }
      } catch (costErr) {
        console.error('[RAG Stream] Error updating monthlyUsageCost:', costErr)
      }
    }

    sendSSE('status', { message: 'Scraping web sources...' })
    let rawSourcesData
    try {
      rawSourcesData = await formatRawSourcesForPrompt(searchResults, 5)
    } catch (scrapeError) {
      console.error('[RAG Stream] Source scraping error:', scrapeError.message)
      rawSourcesData = { formatted: '', sourceCount: 0, scrapedSources: [] }
    }

    let memoryContextString = ''
    let memoryContextItems = []
    if (userId) {
      const scoreThreshold = needsContextHint ? 0.70 : 0.82
      memoryContextItems = await findRelevantContext(userId, query, 3, scoreThreshold)
      memoryContextString = formatMemoryContext(memoryContextItems)
    }

    sendSSE('status', { message: 'Streaming council model responses...' })
    const councilResponses = await Promise.all(
      selectedModels.map((modelId) => streamRagCouncilModel({
        modelId,
        query,
        rawSourcesData,
        memoryContextString,
        userId,
        sendSSE,
        rolePrompt: rolePrompts?.[modelId] || null,
      }))
    )

    if (userId) {
      for (const cr of councilResponses) {
        if (cr.response && cr.model_name) {
          storeModelContext(userId, cr.model_name, cr.response, query).catch(err => {
            console.error(`[RAG Stream] Error storing initial model context for ${cr.model_name}:`, err)
          })
        }
      }
    }

    if (userId && usageDirtyUsers.size > 0) {
      try {
        await flushUsageToMongo()
      } catch (err) {
        console.error('[RAG Stream] Token flush failed:', err.message)
      }
    }

    sendSSE('done', {
      query,
      search_results: searchResults,
      refined_data: null,
      council_responses: councilResponses,
      raw_sources: {
        source_count: rawSourcesData.sourceCount,
        scraped_sources: rawSourcesData.scrapedSources,
      },
      memory_context: {
        items: memoryContextItems,
        needsContextHint: !!needsContextHint,
        scoreThreshold: needsContextHint ? 0.70 : 0.82,
        injected: memoryContextItems.length > 0,
      },
    })

    clearInterval(heartbeat)
    res.end()
  } catch (error) {
    console.error('[RAG Stream] Error:', error)
    sendSSE('error', { message: error.message || 'Unknown error in RAG stream pipeline' })
    clearInterval(heartbeat)
    res.end()
  }
})

// Admin endpoints
// Get total users count and user list (PROTECTED - requires admin)
app.get('/api/admin/users', requireAdmin, async (req, res) => {
  try {
    const users = readUsers()
    const admins = readAdmins()
    const usage = readUsage()
    const deletedUsers = await readDeletedUsers()
    
    // Collect users whose lastActiveAt needs syncing (batch write after loop)
    const usersToSync = []
    
    const userList = Object.values(users).map(user => {
      const userUsage = usage[user.id]
      
      // Check if user has been active within the last month
      // Use lastActiveAt from users cache, fall back to usage cache
      const lastActiveAt = user.lastActiveAt || userUsage?.lastActiveAt
      
      let isActive = false
      if (lastActiveAt) {
        const now = new Date()
        const oneMonthAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000) // 30 days ago
        const lastActive = new Date(lastActiveAt)
          if (lastActive >= oneMonthAgo) {
            isActive = true
        }
      }
      
      // Determine status
      let status = 'inactive'
      if (user.canceled === true || user.status === 'canceled') {
        status = 'canceled'
      } else if (isActive) {
        status = 'active'
      }
      
      // Sync lastActiveAt from usage cache to users cache if more recent
      if (users[user.id] && lastActiveAt) {
        if (!users[user.id].lastActiveAt || new Date(users[user.id].lastActiveAt) < new Date(lastActiveAt)) {
          users[user.id].lastActiveAt = lastActiveAt
          usersToSync.push(user.id)
        }
      }
      
      return {
        id: user.id,
        username: user.username,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        createdAt: user.createdAt,
        isAdmin: admins.admins.includes(user.id),
        status: status, // Computed on the fly, not stored in DB
        lastActiveAt: lastActiveAt || null,
      }
    })
    
    // Batch sync all changed users ONCE after the loop (instead of N times inside it)
    if (usersToSync.length > 0) {
      for (const uid of usersToSync) {
        writeUsers(users, uid)
      }
    }
    
    res.json({
      totalUsers: userList.length,
      users: userList,
      deletedUsers: deletedUsers.count || 0,
    })
  } catch (error) {
    console.error('[Admin] Error fetching users:', error)
    res.status(500).json({ error: 'Failed to fetch users' })
  }
})

// Calculate cost for a model based on tokens and pricing
const calculateModelCost = (modelKey, inputTokens, outputTokens, pricing) => {
  // modelKey format: "provider-model" (e.g., "openai-gpt-5.2" or "xai-grok-4-1-fast-reasoning")
  const firstDashIndex = modelKey.indexOf('-')
  if (firstDashIndex === -1) {
    return 0 // Invalid format
  }
  
  const provider = modelKey.substring(0, firstDashIndex)
  const model = modelKey.substring(firstDashIndex + 1)
  
  if (!pricing[provider] || !pricing[provider].models[model]) {
    return 0 // No pricing data available
  }
  
  const modelPricing = pricing[provider].models[model]
  const inputPrice = modelPricing.input || 0
  const outputPrice = modelPricing.output || 0
  const inputCost = (inputTokens / 1000000) * inputPrice
  const outputCost = (outputTokens / 1000000) * outputPrice
  
  return inputCost + outputCost
}

// Calculate cost for Serper search queries
// Fixed rate: $0.001 per query (hidden from users, just factored into usage)
const SERPER_COST_PER_QUERY = 0.001

const calculateSerperQueryCost = (numQueries) => {
  if (!numQueries || numQueries === 0) {
    return 0
  }
  return numQueries * SERPER_COST_PER_QUERY
}

// Get cost analysis for all users (PROTECTED - requires admin)
app.get('/api/admin/costs', requireAdmin, (req, res) => {
  try {
    const usage = readUsage()
    const pricing = getPricingData()
    const users = readUsers()
    
    let totalCost = 0
    const userCosts = []
    
    // Calculate costs for each user
    Object.keys(usage).forEach(userId => {
      const userUsage = usage[userId]
      const user = users[userId]
      let userTotalCost = 0
      const modelCosts = {}
      
      // Calculate cost per model
      Object.keys(userUsage.models || {}).forEach(modelKey => {
        const modelData = userUsage.models[modelKey]
        const inputTokens = modelData.totalInputTokens || 0
        const outputTokens = modelData.totalOutputTokens || 0
        const cost = calculateModelCost(modelKey, inputTokens, outputTokens, pricing)
        
        modelCosts[modelKey] = {
          model: modelData.model,
          provider: modelData.provider,
          inputTokens,
          outputTokens,
          totalTokens: inputTokens + outputTokens,
          cost,
        }
        
        userTotalCost += cost
      })
      
      // Add Serper query costs
      const totalQueries = userUsage.totalQueries || 0
      if (totalQueries > 0) {
        const queryCost = calculateSerperQueryCost(totalQueries)
        userTotalCost += queryCost
      }
      
      totalCost += userTotalCost
      
      userCosts.push({
        userId,
        username: user?.username || userId,
        email: user?.email || '',
        firstName: user?.firstName || '',
        lastName: user?.lastName || '',
        plan: user?.plan || null,
        totalInputTokens: userUsage.totalInputTokens || 0,
        totalOutputTokens: userUsage.totalOutputTokens || 0,
        totalTokens: userUsage.totalTokens || 0,
        totalQueries: userUsage.totalQueries || 0,
        totalPrompts: userUsage.totalPrompts || 0,
        cost: userTotalCost,
        modelCosts,
      })
    })
    
    res.json({
      totalCost,
      userCosts: userCosts.sort((a, b) => b.cost - a.cost), // Sort by cost descending
    })
  } catch (error) {
    console.error('[Admin] Error calculating costs:', error)
    res.status(500).json({ error: 'Failed to calculate costs' })
  }
})

// Helper function to get pricing data (same as /api/admin/pricing)
const getPricingData = () => {
  return {
    openai: {
      name: 'OpenAI',
      models: {
        'gpt-5.2': { input: 1.75, cachedInput: null, output: 14.00, note: 'Reasoning model' },
        'gpt-4.1': { input: 2.00, cachedInput: null, output: 8.00, note: 'Versatile model' },
        'gpt-4o-mini': { input: 0.15, cachedInput: null, output: 0.60, note: 'Fast model' },
        'gpt-5o-mini': { input: 0.25, cachedInput: null, output: 2.00, note: 'Fast model' },
        'text-embedding-3-small': { input: 0.02, cachedInput: null, output: 0.00, note: 'Embedding model (memory/context)' },
      },
    },
    anthropic: {
      name: 'Anthropic (Claude)',
      models: {
        'claude-4.5-opus': { input: 5.00, cachedInput: null, output: 25.00, note: 'Reasoning model' },
        'claude-4.5-sonnet': { input: 3.00, cachedInput: null, output: 15.00, note: 'Versatile model' },
        'claude-4.5-haiku': { input: 1.00, cachedInput: null, output: 5.00, note: 'Fast model' },
      },
    },
    google: {
      name: 'Google (Gemini)',
      models: {
        'gemini-3-pro': { input: 2.00, cachedInput: null, output: 12.00, note: 'Reasoning model' },
        'gemini-3-flash': { input: 0.50, cachedInput: null, output: 3.00, note: 'Versatile model' },
        'gemini-2.5-flash-lite': { input: 0.10, cachedInput: null, output: 0.40, note: 'Fast model' },
      },
    },
    xai: {
      name: 'xAI (Grok)',
      models: {
        'grok-4-1-fast-reasoning': { input: 0.20, cachedInput: null, output: 0.50, note: 'Reasoning model' },
        'grok-4-1-fast-non-reasoning': { input: 0.20, cachedInput: null, output: 0.50, note: 'Versatile model' },
        'grok-3-mini': { input: 0.30, cachedInput: null, output: 0.50, note: 'Fast model' },
      },
    },
    meta: {
      name: 'Meta (Llama)',
      models: {
        'llama-4-maverick': { input: null, cachedInput: null, output: null, note: 'Placeholder pricing - Reasoning model' },
        'llama-4-scout': { input: null, cachedInput: null, output: null, note: 'Placeholder pricing - Versatile model' },
        'llama-3.3-8b-instruct': { input: null, cachedInput: null, output: null, note: 'Placeholder pricing - Fast model' },
      },
    },
    deepseek: {
      name: 'DeepSeek',
      models: {
        'deepseek-reasoning-model': { input: null, cachedInput: null, output: null, note: 'Placeholder pricing - Reasoning model' },
        'deepseek-versatile-model': { input: null, cachedInput: null, output: null, note: 'Placeholder pricing - Versatile model' },
        'deepseek-fast-model': { input: null, cachedInput: null, output: null, note: 'Placeholder pricing - Fast model' },
      },
    },
    mistral: {
      name: 'Mistral AI',
      models: {
        'magistral-medium': { input: 2.00, cachedInput: null, output: 5.00, note: 'Reasoning model' },
        'mistral-medium-3.1': { input: 0.40, cachedInput: null, output: 2.00, note: 'Versatile model' },
        'mistral-small-3.2': { input: 0.10, cachedInput: null, output: 0.30, note: 'Fast model' },
      },
    },
    serper: {
      name: 'Serper (Search Queries)',
      queryTiers: [
        { credits: 50000, pricePer1k: 1.00, note: '50k credits' },
        { credits: 500000, pricePer1k: 0.75, note: '500k credits' },
        { credits: 2500000, pricePer1k: 0.50, note: '2.5M credits' },
        { credits: 12500000, pricePer1k: 0.30, note: '12.5M credits' },
      ],
    },
  }
}

// Get model pricing information (PUBLIC - used by CostBreakdownWindow for all users)
app.get('/api/pricing', (req, res) => {
  try {
    const pricing = getPricingData()
    res.json(pricing)
  } catch (error) {
    console.error('[Pricing] Error fetching pricing:', error)
    res.status(500).json({ error: 'Failed to fetch pricing' })
  }
})

// Get model pricing information (PROTECTED - requires admin)
app.get('/api/admin/pricing', requireAdmin, (req, res) => {
  try {
    const pricing = getPricingData()
    res.json(pricing)
  } catch (error) {
    console.error('[Admin] Error fetching pricing:', error)
    res.status(500).json({ error: 'Failed to fetch pricing' })
  }
})

// Check if user is admin
app.get('/api/admin/check', async (req, res) => {
  try {
    const { userId } = req.query
    if (!userId) {
      return res.status(400).json({ error: 'userId is required' })
    }
    
    await ensureUserInCache(userId)
    const users = readUsers()
    const user = users[userId]
    
    if (!user) {
      return res.status(404).json({ error: 'User not found' })
    }
    
    res.json({
      isAdmin: isAdmin(userId),
    })
  } catch (error) {
    console.error('[Admin] Error checking admin status:', error)
    res.status(500).json({ error: 'Failed to check admin status' })
  }
})

// Add/Remove admin endpoints (PROTECTED - requires admin)
app.post('/api/admin/add', requireAdmin, async (req, res) => {
  try {
    const { userId } = req.body
    if (!userId) {
      return res.status(400).json({ error: 'userId is required' })
    }
    
    // Verify user exists
    await ensureUserInCache(userId)
    const users = readUsers()
    if (!users[userId]) {
      return res.status(404).json({ error: 'User not found' })
    }
    
    // Add to ADMIN database admins collection
    await adminDb.admins.add(userId)
    
    // Update local cache
    if (!adminsCache.admins.includes(userId)) {
      adminsCache.admins.push(userId)
    }
    
    console.log(`[Admin] Added admin: ${userId}`)
    res.json({ success: true, message: 'Admin added successfully' })
  } catch (error) {
    console.error('[Admin] Error adding admin:', error)
    res.status(500).json({ error: 'Failed to add admin' })
  }
})

app.post('/api/admin/remove', requireAdmin, async (req, res) => {
  try {
    const { userId } = req.body
    if (!userId) {
      return res.status(400).json({ error: 'userId is required' })
    }
    
    // Remove from ADMIN database admins collection
    await adminDb.admins.remove(userId)
    
    // Update local cache
    adminsCache.admins = adminsCache.admins.filter(id => id !== userId)
    
    console.log(`[Admin] Removed admin: ${userId}`)
    res.json({ success: true, message: 'Admin removed successfully' })
  } catch (error) {
    console.error('[Admin] Error removing admin:', error)
    res.status(500).json({ error: 'Failed to remove admin' })
  }
})

// ==================== ADMIN EXPENSES ENDPOINTS ====================

// Get expenses for a month (PROTECTED - requires admin)
app.get('/api/admin/expenses', requireAdmin, async (req, res) => {
  try {
    const { month } = req.query // Format: "YYYY-MM", defaults to current month
    const expenses = await adminDb.expenses.get(month || null)
    res.json({ success: true, expenses: expenses || {} })
  } catch (error) {
    console.error('[Admin] Error fetching expenses:', error)
    res.status(500).json({ error: 'Failed to fetch expenses' })
  }
})

// Save expenses for a month (PROTECTED - requires admin)
app.post('/api/admin/expenses', requireAdmin, async (req, res) => {
  try {
    const { month, expenses: expenseData } = req.body
    if (!expenseData) {
      return res.status(400).json({ error: 'expenses data is required' })
    }
    const saved = await adminDb.expenses.save(month || null, expenseData)
    res.json({ success: true, expenses: saved })
  } catch (error) {
    console.error('[Admin] Error saving expenses:', error)
    res.status(500).json({ error: 'Failed to save expenses' })
  }
})

// Helper: compute date range from period + reference date
function computeDateRange(period, dateStr) {
  const now = new Date()
  const ref = dateStr ? new Date(dateStr + (dateStr.length <= 10 ? 'T00:00:00' : '')) : now
  let startDate, endDate

  switch (period) {
    case 'day': {
      startDate = new Date(ref.getFullYear(), ref.getMonth(), ref.getDate())
      endDate = new Date(ref.getFullYear(), ref.getMonth(), ref.getDate() + 1)
      break
    }
    case 'week': {
      const dow = ref.getDay()
      const diffToMon = dow === 0 ? 6 : dow - 1
      const monday = new Date(ref)
      monday.setDate(ref.getDate() - diffToMon)
      startDate = new Date(monday.getFullYear(), monday.getMonth(), monday.getDate())
      endDate = new Date(startDate)
      endDate.setDate(startDate.getDate() + 7)
      break
    }
    case 'month': {
      startDate = new Date(ref.getFullYear(), ref.getMonth(), 1)
      endDate = new Date(ref.getFullYear(), ref.getMonth() + 1, 1)
      break
    }
    case 'quarter': {
      const q = Math.floor(ref.getMonth() / 3)
      startDate = new Date(ref.getFullYear(), q * 3, 1)
      endDate = new Date(ref.getFullYear(), q * 3 + 3, 1)
      break
    }
    case 'year': {
      startDate = new Date(ref.getFullYear(), 0, 1)
      endDate = new Date(ref.getFullYear() + 1, 0, 1)
      break
    }
    case 'all': {
      startDate = new Date(2020, 0, 1)
      endDate = new Date(2099, 0, 1)
      break
    }
    default: {
      startDate = new Date(ref.getFullYear(), ref.getMonth(), 1)
      endDate = new Date(ref.getFullYear(), ref.getMonth() + 1, 1)
    }
  }
  return { startDate, endDate }
}

// Get revenue data for any period (PROTECTED - requires admin)
app.get('/api/admin/revenue', requireAdmin, async (req, res) => {
  try {
    const { period = 'month', date } = req.query
    const { startDate, endDate } = computeDateRange(period, date)

    const users = readUsers()
    const dbInstance = await db.getDb()

    let activeSubscriptions = 0
    let newSubscriptions = 0
    let renewedSubscriptions = 0
    let canceledSubscriptions = 0
    let activeFreeTrials = 0
    let newFreeTrials = 0
    const subscriptionUsers = []
    const freeTrialUsers = []
    const activeUsersList = []
    const freeTrialUsersList = []
    const inactiveUsersList = []

    // Use UTC-based date parsing to avoid timezone mismatches
    const toUTCDayStart = (dateVal) => {
      const d = new Date(dateVal)
      return new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()))
    }
    const periodStartUTC = toUTCDayStart(startDate)
    const periodEndUTC = toUTCDayStart(endDate)

    for (const [userId, user] of Object.entries(users)) {
      const status = user.subscriptionStatus
      if (!status || status === 'pending_verification') continue
      const isTrial = user.plan === 'free_trial' || status === 'trialing'
      const uInfo = { username: user.username || 'Anonymous', date: user.subscriptionStartedDate || user.createdAt || null, email: user.email || '' }

      if (status === 'active') {
        activeSubscriptions++
        activeUsersList.push(uInfo)
      } else if (status === 'trialing') {
        activeFreeTrials++
        freeTrialUsersList.push(uInfo)
      } else if (status === 'inactive' || status === 'canceled') {
        inactiveUsersList.push({ ...uInfo, status })
      }

      if (status === 'inactive') continue

      // Check subscriptionStartedDate OR createdAt as fallback for when the sub started
      const startedRaw = user.subscriptionStartedDate || user.createdAt
      let isNewInPeriod = false
      if (startedRaw) {
        const startedUTC = toUTCDayStart(startedRaw)
        isNewInPeriod = startedUTC >= periodStartUTC && startedUTC < periodEndUTC
      }

      if (isNewInPeriod) {
        if (isTrial) {
          newFreeTrials++
          freeTrialUsers.push({
            username: user.username || 'Anonymous',
            date: startedRaw,
          })
        } else {
          newSubscriptions++
          subscriptionUsers.push({
            username: user.username || 'Anonymous',
            type: 'new_subscription',
            plan: user.plan || 'pro',
            date: startedRaw,
          })
        }
      }

      // Count renewals: active paid subs whose monthly billing date falls in this period
      if (status === 'active' && startedRaw && !isNewInPeriod) {
        const started = new Date(startedRaw)
        const billingDay = started.getUTCDate()
        let renewalDate = new Date(Date.UTC(started.getUTCFullYear(), started.getUTCMonth() + 1, 1))
        renewalDate.setUTCDate(Math.min(billingDay, new Date(Date.UTC(renewalDate.getUTCFullYear(), renewalDate.getUTCMonth() + 1, 0)).getUTCDate()))
        while (renewalDate < periodEndUTC) {
          if (renewalDate >= periodStartUTC) {
            renewedSubscriptions++
            break
          }
          const nextMonth = renewalDate.getUTCMonth() + 1
          renewalDate = new Date(Date.UTC(renewalDate.getUTCFullYear(), nextMonth, 1))
          renewalDate.setUTCDate(Math.min(billingDay, new Date(Date.UTC(renewalDate.getUTCFullYear(), renewalDate.getUTCMonth() + 1, 0)).getUTCDate()))
        }
      }

      // Count cancellations in this period (check all users, including canceled ones)
      if (user.cancellationHistory?.length > 0) {
        user.cancellationHistory.forEach(c => {
          const cancelUTC = toUTCDayStart(c.canceledAt || c.date)
          if (cancelUTC >= periodStartUTC && cancelUTC < periodEndUTC) {
            canceledSubscriptions++
          }
        })
      }
    }

    let creditPurchases = []
    let totalCreditRevenue = 0
    try {
      const purchases = await dbInstance.collection('purchases')
        .find({ timestamp: { $gte: startDate, $lt: endDate }, status: 'succeeded' })
        .sort({ timestamp: -1 })
        .toArray()
      creditPurchases = purchases.map(p => ({
        userId: p.userId,
        username: users[p.userId]?.username || 'Unknown',
        amount: p.amount || 0,
        total: p.total || 0,
        date: p.timestamp,
      }))
      totalCreditRevenue = creditPurchases.reduce((sum, p) => sum + (p.total || 0), 0)
    } catch (e) {
      // purchases collection may not exist yet
    }

    const subscriptionPrice = 19.95
    const freeTrialCost = 0.50
    const newSubscriptionRevenue = newSubscriptions * subscriptionPrice
    const renewalRevenue = renewedSubscriptions * subscriptionPrice
    const totalSubscriptionRevenue = newSubscriptionRevenue + renewalRevenue
    const totalFreeTrialCost = newFreeTrials * freeTrialCost
    const totalRevenue = totalSubscriptionRevenue + totalCreditRevenue

    let storePurchases = []
    let totalStoreRevenue = 0
    try {
      const storeOrders = await dbInstance.collection('storePurchases')
        .find({ timestamp: { $gte: startDate, $lt: endDate }, status: 'succeeded' })
        .sort({ timestamp: -1 })
        .toArray()
      storePurchases = storeOrders.map(p => ({
        userId: p.userId,
        username: users[p.userId]?.username || 'Unknown',
        item: p.itemName || p.item || 'Unknown Item',
        total: p.total || p.amount || 0,
        date: p.timestamp,
      }))
      totalStoreRevenue = storePurchases.reduce((sum, p) => sum + (p.total || 0), 0)
    } catch (e) {
      // storePurchases collection may not exist yet
    }

    const grandTotalRevenue = totalSubscriptionRevenue + totalCreditRevenue + totalStoreRevenue

    // Badge tier rewards calculation
    const usage = readUsage()
    const BADGE_TIERS = [
      { name: 'Bronze', min: 1, max: 25, reward: 0.25 },
      { name: 'Silver', min: 26, max: 50, reward: 0.50 },
      { name: 'Gold', min: 51, max: 75, reward: 0.75 },
      { name: 'Platinum', min: 76, max: Infinity, reward: 1.00 },
    ]
    const getBadgeTier = (badgeCount) => {
      if (badgeCount <= 0) return null
      return BADGE_TIERS.find(t => badgeCount >= t.min && badgeCount <= t.max) || null
    }

    const badgeTierUsers = []
    const badgeTierSummary = { Bronze: 0, Silver: 0, Gold: 0, Platinum: 0 }
    let totalBadgeTierCost = 0

    for (const [userId, user] of Object.entries(users)) {
      const status = user.subscriptionStatus
      if (!status || status === 'inactive' || status === 'pending_verification') continue
      const userUsage = usage[userId]
      const badgeCount = (userUsage?.earnedBadges || []).length
      if (badgeCount <= 0) continue
      const tier = getBadgeTier(badgeCount)
      if (!tier) continue
      badgeTierSummary[tier.name]++
      totalBadgeTierCost += tier.reward
      badgeTierUsers.push({
        username: user.username || 'Anonymous',
        email: user.email || '',
        tier: tier.name,
        badgeCount,
        reward: tier.reward,
      })
    }
    badgeTierUsers.sort((a, b) => b.badgeCount - a.badgeCount)

    res.json({
      success: true,
      revenue: {
        period,
        startDate: startDate.toISOString(),
        endDate: endDate.toISOString(),
        activeSubscriptions,
        newSubscriptions,
        renewedSubscriptions,
        canceledSubscriptions,
        subscriptionPrice,
        newSubscriptionRevenue,
        renewalRevenue,
        totalSubscriptionRevenue,
        creditPurchases,
        creditPurchaseCount: creditPurchases.length,
        totalCreditRevenue,
        storePurchases,
        storePurchaseCount: storePurchases.length,
        totalStoreRevenue,
        totalRevenue: grandTotalRevenue,
        subscriptionUsers,
        activeFreeTrials,
        newFreeTrials,
        freeTrialCost,
        totalFreeTrialCost,
        freeTrialUsers,
        activeUsersList,
        freeTrialUsersList,
        inactiveUsersList,
        badgeTierUsers,
        badgeTierSummary,
        totalBadgeTierCost,
      },
    })
  } catch (error) {
    console.error('[Admin] Error fetching revenue:', error)
    res.status(500).json({ error: 'Failed to fetch revenue data' })
  }
})

// Get aggregated expenses for any period (PROTECTED - requires admin)
app.get('/api/admin/expenses/aggregate', requireAdmin, async (req, res) => {
  try {
    const { period = 'month', date } = req.query
    const { startDate, endDate } = computeDateRange(period, date)

    // Determine which YYYY-MM month keys fall within the range
    const allExpenseDocs = await adminDb.expenses.getAll()
    const relevantMonths = []
    const expenseFields = [
      'stripeFees', 'openaiCost', 'anthropicCost', 'googleCost',
      'xaiCost', 'serperCost', 'resendCost',
      'mongoDbCost', 'vercelCost', 'domainCost',
    ]

    const aggregated = {}
    expenseFields.forEach(f => { aggregated[f] = 0 })

    for (const doc of allExpenseDocs) {
      const monthKey = doc._id || doc.month
      if (!monthKey) continue
      const [y, m] = monthKey.split('-').map(Number)
      const monthStart = new Date(y, m - 1, 1)
      const monthEnd = new Date(y, m, 1)

      // Include if the month overlaps with the period range
      if (monthEnd > startDate && monthStart < endDate) {
        relevantMonths.push(monthKey)
        expenseFields.forEach(f => {
          aggregated[f] += parseFloat(doc[f]) || 0
        })
      }
    }

    const totalApiCost = ['openaiCost', 'anthropicCost', 'googleCost', 'xaiCost']
      .reduce((sum, key) => sum + aggregated[key], 0)
    const grandTotal = Object.values(aggregated).reduce((sum, val) => sum + val, 0)

    res.json({
      success: true,
      expenses: aggregated,
      months: relevantMonths,
      totalApiCost,
      grandTotal,
    })
  } catch (error) {
    console.error('[Admin] Error aggregating expenses:', error)
    res.status(500).json({ error: 'Failed to aggregate expenses' })
  }
})

// Get all months' expenses history (PROTECTED - requires admin)
app.get('/api/admin/expenses/history', requireAdmin, async (req, res) => {
  try {
    const allExpenses = await adminDb.expenses.getAll()
    res.json({ success: true, expenses: allExpenses })
  } catch (error) {
    console.error('[Admin] Error fetching expense history:', error)
    res.status(500).json({ error: 'Failed to fetch expense history' })
  }
})

// ==================== CONVERSATION HISTORY (AUTO-SAVE) ====================
// Every prompt+response is automatically saved to 'conversation_history' collection.
// Organized by Year → Month → Day in the frontend.

app.post('/api/history/auto-save', async (req, res) => {
  try {
    const { userId, originalPrompt, category, responses, summary, sources, facts, ragDebugData } = req.body

    if (!userId || !originalPrompt) {
      return res.status(400).json({ error: 'userId and originalPrompt are required' })
    }

    await ensureUserInCache(userId)
    const users = readUsers()
    if (!users[userId]) {
      return res.status(404).json({ error: 'User not found' })
    }

    const dbInstance = await db.getDb()
    const historyId = `hist-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
    const title = originalPrompt.substring(0, 80) + (originalPrompt.length > 80 ? '...' : '')

    const doc = {
      _id: historyId,
      userId,
      title,
      originalPrompt,
      category: category || 'General',
      savedAt: new Date(),
      // All model responses from the council or individual model
      responses: (responses || []).map(r => ({
        modelName: r.modelName || r.actualModelName || 'Unknown',
        actualModelName: r.actualModelName || r.modelName || 'Unknown',
        text: r.text || r.modelResponse || '',
        error: r.error || false,
        tokens: r.tokens || null,
      })),
      // Summary/Judge analysis (if council of 2+ models)
      summary: summary ? {
        text: summary.text || '',
        consensus: summary.consensus || null,
        agreements: summary.agreements || [],
        disagreements: summary.disagreements || [],
        singleModel: summary.singleModel || false,
        modelName: summary.modelName || null,
      } : null,
      // Search sources
      sources: sources || [],
      // Extracted facts
      facts: facts || [],
    }

    await dbInstance.collection('conversation_history').insertOne(doc)
    console.log(`[History] Auto-saved conversation for user ${userId}: ${historyId}`)

    // Generate embedding BEFORE sending response.
    // On Vercel serverless, fire-and-forget async work after res.json() is lost because
    // the execution environment freezes once the response is sent. The embedding MUST
    // complete before we respond, otherwise it will never be stored and memory/context
    // retrieval will fail for this conversation.
    let embeddingStored = false
    try {
      const embeddingText = buildEmbeddingText(originalPrompt, doc.responses, doc.summary)
      const embedding = await generateEmbedding(embeddingText, userId)
      if (embedding) {
        await dbInstance.collection('conversation_history').updateOne(
          { _id: historyId },
          { $set: { embedding, embeddingText } }
        )
        embeddingStored = true
        console.log(`[History] Embedding stored for ${historyId} (${embedding.length} dims)`)
      }
    } catch (embErr) {
      console.error(`[History] Embedding generation failed for ${historyId}:`, embErr.message)
      // Non-fatal — conversation is saved, embedding can be backfilled later
    }

    res.json({ success: true, historyId, title, embeddingStored })
  } catch (error) {
    console.error('[History] Error auto-saving:', error)
    res.status(500).json({ error: 'Failed to save conversation history' })
  }
})

// ==================== UPDATE HISTORY WITH SUMMARY ====================
// Updates an existing history entry with the judge summary after manual generation.
app.post('/api/history/update-summary', async (req, res) => {
  try {
    const { historyId, userId, summary } = req.body

    if (!historyId || !userId || !summary) {
      return res.status(400).json({ error: 'historyId, userId, and summary are required' })
    }

    const dbInstance = await db.getDb()
    const doc = await dbInstance.collection('conversation_history').findOne({ _id: historyId, userId })
    if (!doc) {
      return res.status(404).json({ error: 'History entry not found' })
    }

    const summaryDoc = {
      text: summary.text || '',
      consensus: summary.consensus || null,
      agreements: summary.agreements || [],
      disagreements: summary.disagreements || [],
      differences: summary.differences || [],
      singleModel: summary.singleModel || false,
      modelName: summary.modelName || null,
    }

    await dbInstance.collection('conversation_history').updateOne(
      { _id: historyId, userId },
      { $set: { summary: summaryDoc } }
    )

    console.log(`[History] Updated summary for ${historyId}`)
    res.json({ success: true })
  } catch (error) {
    console.error('[History] Error updating summary:', error)
    res.status(500).json({ error: 'Failed to update summary' })
  }
})

// ==================== UPDATE HISTORY WITH CONTINUED CONVERSATION ====================
// Appends a follow-up conversation turn to an existing history entry.
// Called after each model/judge follow-up message completes.
app.post('/api/history/update-conversation', async (req, res) => {
  try {
    const { historyId, turn } = req.body

    if (!historyId || !turn) {
      return res.status(400).json({ error: 'historyId and turn are required' })
    }

    const dbInstance = await db.getDb()

    const conversationTurn = {
      type: turn.type || 'model', // 'judge' or 'model'
      modelName: turn.modelName || 'Unknown',
      user: turn.user || '',
      assistant: turn.assistant || '',
      timestamp: new Date(),
      sources: turn.sources || [],
    }

    const result = await dbInstance.collection('conversation_history').updateOne(
      { _id: historyId },
      {
        $push: { conversationTurns: conversationTurn },
        $set: { updatedAt: new Date() }
      }
    )

    if (result.matchedCount === 0) {
      return res.status(404).json({ error: 'History entry not found' })
    }

    console.log(`[History] Updated conversation for ${historyId}: +1 ${conversationTurn.type} turn with ${conversationTurn.modelName}`)
    res.json({ success: true })
  } catch (error) {
    console.error('[History] Error updating conversation:', error)
    res.status(500).json({ error: 'Failed to update conversation history' })
  }
})

// ==================== FINALIZE HISTORY ENTRY ====================
// Called when user starts a new chat or navigates away.
// Regenerates the embedding using the full conversation (original + all follow-up turns).
app.post('/api/history/finalize', async (req, res) => {
  try {
    const { historyId, userId } = req.body

    if (!historyId) {
      return res.status(400).json({ error: 'historyId is required' })
    }

    const dbInstance = await db.getDb()
    const doc = await dbInstance.collection('conversation_history').findOne({ _id: historyId })

    if (!doc) {
      return res.status(404).json({ error: 'History entry not found' })
    }

    // Only regenerate embedding if there are conversation turns (otherwise initial embedding is fine)
    const turns = doc.conversationTurns || []
    if (turns.length === 0) {
      console.log(`[History] Finalize ${historyId}: no conversation turns, skipping embedding regen`)
      return res.json({ success: true, embeddingUpdated: false })
    }

    // Regenerate embedding with full conversation context
    let embeddingUpdated = false
    try {
      const embeddingText = buildEmbeddingText(
        doc.originalPrompt,
        doc.responses,
        doc.summary,
        turns
      )
      const embedding = await generateEmbedding(embeddingText, userId || doc.userId)
      if (embedding) {
        await dbInstance.collection('conversation_history').updateOne(
          { _id: historyId },
          { $set: { embedding, embeddingText, finalizedAt: new Date() } }
        )
        embeddingUpdated = true
        console.log(`[History] Finalized ${historyId}: embedding regenerated with ${turns.length} conversation turns (${embedding.length} dims)`)
      }
    } catch (embErr) {
      console.error(`[History] Finalize embedding failed for ${historyId}:`, embErr.message)
      // Non-fatal — conversation data is already saved
    }

    res.json({ success: true, embeddingUpdated })
  } catch (error) {
    console.error('[History] Error finalizing:', error)
    res.status(500).json({ error: 'Failed to finalize history entry' })
  }
})

// Get full detail of a single history entry
// NOTE: This route MUST be defined BEFORE /api/history/:userId to avoid Express matching "detail" as a userId
app.get('/api/history/detail/:historyId', async (req, res) => {
  try {
    const { historyId } = req.params
    const dbInstance = await db.getDb()
    const doc = await dbInstance.collection('conversation_history').findOne({ _id: historyId })

    if (!doc) {
      return res.status(404).json({ error: 'History entry not found' })
    }

    // Check if this prompt was posted to the leaderboard/prompt feed
    let postedToFeed = false
    if (doc.userId && doc.originalPrompt) {
      const leaderboard = readLeaderboard()
      const normalizedPrompt = doc.originalPrompt.trim().toLowerCase()
      postedToFeed = leaderboard.prompts.some(
        p => p.userId === doc.userId && p.promptText.trim().toLowerCase() === normalizedPrompt
      )
    }

    res.json({
      conversation: {
        id: doc._id,
        title: doc.title,
        originalPrompt: doc.originalPrompt,
        category: doc.category,
        savedAt: doc.savedAt,
        responses: doc.responses || [],
        summary: doc.summary || null,
        sources: doc.sources || [],
        facts: doc.facts || [],
        conversationTurns: doc.conversationTurns || [],
        postedToFeed,
      }
    })
  } catch (error) {
    console.error('[History] Error fetching detail:', error)
    res.status(500).json({ error: 'Failed to fetch history detail' })
  }
})

// List all conversation history for a user (lightweight — no full responses)
app.get('/api/history/:userId', async (req, res) => {
  try {
    const { userId } = req.params
    if (!userId) {
      return res.status(400).json({ error: 'userId is required' })
    }

    const dbInstance = await db.getDb()
    const results = await dbInstance.collection('conversation_history')
      .find({ userId })
      .sort({ savedAt: -1 })
      .project({
        _id: 1,
        title: 1,
        originalPrompt: 1,
        category: 1,
        savedAt: 1,
        starred: 1,
        'responses.modelName': 1,
        'responses.error': 1,
        'summary.consensus': 1,
        'summary.singleModel': 1,
      })
      .toArray()

    const mapped = results.map(c => ({
      id: c._id,
      title: c.title,
      originalPrompt: c.originalPrompt,
      category: c.category,
      savedAt: c.savedAt,
      starred: !!c.starred,
      modelCount: c.responses?.length || 0,
      modelNames: (c.responses || []).filter(r => !r.error).map(r => r.modelName),
      consensus: c.summary?.consensus || null,
      isSingleModel: c.summary?.singleModel || (c.responses?.length === 1),
      hasSummary: !!c.summary,
    }))

    res.json({ history: mapped })
  } catch (error) {
    console.error('[History] Error listing:', error)
    res.status(500).json({ error: 'Failed to list conversation history' })
  }
})

// Delete a history entry
app.delete('/api/history/:historyId', async (req, res) => {
  try {
    const { historyId } = req.params
    const { userId } = req.body

    if (!userId) {
      return res.status(400).json({ error: 'userId is required' })
    }

    const dbInstance = await db.getDb()
    const result = await dbInstance.collection('conversation_history').deleteOne({
      _id: historyId,
      userId,
    })

    if (result.deletedCount === 0) {
      return res.status(404).json({ error: 'History entry not found or not owned by this user' })
    }

    console.log(`[History] Deleted ${historyId} for user ${userId}`)
    res.json({ success: true })
  } catch (error) {
    console.error('[History] Error deleting:', error)
    res.status(500).json({ error: 'Failed to delete history entry' })
  }
})

// Toggle starred/favorite status on a history entry
app.post('/api/history/star', async (req, res) => {
  try {
    const { historyId, userId, starred } = req.body
    if (!historyId || !userId) {
      return res.status(400).json({ error: 'historyId and userId are required' })
    }

    const dbInstance = await db.getDb()
    const result = await dbInstance.collection('conversation_history').updateOne(
      { _id: historyId, userId },
      { $set: { starred: !!starred } }
    )

    if (result.matchedCount === 0) {
      return res.status(404).json({ error: 'History entry not found or not owned by this user' })
    }

    res.json({ success: true, starred: !!starred })
  } catch (error) {
    console.error('[History] Error toggling star:', error)
    res.status(500).json({ error: 'Failed to toggle star status' })
  }
})

// Restore server-side conversation context from a saved history entry
// This rebuilds judgeConversationContext and modelConversationContext so the user
// can continue chatting seamlessly.
app.post('/api/history/restore-context', async (req, res) => {
  try {
    const { historyId, userId } = req.body
    if (!historyId || !userId) {
      return res.status(400).json({ error: 'historyId and userId are required' })
    }

    const dbInstance = await db.getDb()
    const entry = await dbInstance.collection('conversation_history').findOne({ _id: historyId, userId })
    if (!entry) {
      return res.status(404).json({ error: 'History entry not found' })
    }

    const usage = readUsage()
    if (!usage[userId]) usage[userId] = {}

    // Rebuild judge conversation context from the summary + judge conversation turns
    const judgeTurns = (entry.conversationTurns || []).filter(t => t.type === 'judge')
    const judgeContext = judgeTurns.map(t => ({
      role: 'user',
      content: t.user,
      response: t.assistant,
    }))
    usage[userId].judgeConversationContext = judgeContext

    // Rebuild model conversation context from model conversation turns
    const modelContexts = {}
    ;(entry.conversationTurns || []).forEach(turn => {
      if (turn.type !== 'judge' && turn.modelName) {
        if (!modelContexts[turn.modelName]) modelContexts[turn.modelName] = []
        modelContexts[turn.modelName].push({
          role: 'user',
          content: turn.user,
          response: turn.assistant,
        })
      }
    })
    usage[userId].modelConversationContext = modelContexts

    writeUsage(usage)
    console.log(`[History] Restored context for user ${userId} from ${historyId} (${judgeTurns.length} judge turns, ${Object.keys(modelContexts).length} model contexts)`)
    res.json({ success: true })
  } catch (error) {
    console.error('[History] Error restoring context:', error)
    res.status(500).json({ error: 'Failed to restore conversation context' })
  }
})

// (Legacy saved_individual / saved_sessions endpoints removed — all conversation
//  data now lives in conversation_history via /api/history/* endpoints.)

// ==================== LEADERBOARD ENDPOINTS ====================

// Submit a prompt to the leaderboard
app.post('/api/leaderboard/submit', async (req, res) => {
  console.log('[Leaderboard] Submit endpoint hit:', { userId: req.body?.userId, hasPromptText: !!req.body?.promptText })
  try {
    const { userId, promptText, category, responses, summary, facts, sources, description, visibility } = req.body
    
    if (!userId || !promptText || !promptText.trim()) {
      console.log('[Leaderboard] Missing required fields:', { userId: !!userId, promptText: !!promptText })
      return res.status(400).json({ error: 'userId and promptText are required' })
    }
    
    await ensureUserInCache(userId)
    const users = readUsers()
    const user = users[userId]
    
    if (!user) {
      return res.status(404).json({ error: 'User not found' })
    }
    
    // Check for duplicate submission (same user, same prompt text)
    const leaderboard = readLeaderboard()
    const normalizedPrompt = promptText.trim().toLowerCase()
    const isDuplicate = leaderboard.prompts.some(
      p => p.userId === userId && p.promptText.trim().toLowerCase() === normalizedPrompt
    )
    if (isDuplicate) {
      return res.status(409).json({ error: 'You have already posted this prompt to the leaderboard', alreadyPosted: true })
    }
    
    const promptId = `prompt-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
    
    const promptEntry = {
      id: promptId,
      userId: userId,
      username: user.username || 'Anonymous',
      promptText: promptText.trim(),
      category: category || 'General Knowledge/Other',
      visibility: visibility || 'public',
      likes: [],
      likeCount: 0,
      createdAt: new Date().toISOString(),
    }
    
    // Add responses, summary, facts, and sources if provided
    if (responses && Array.isArray(responses)) {
      promptEntry.responses = responses
    }
    
    if (summary) {
      promptEntry.summary = summary
    }
    
    if (facts && Array.isArray(facts)) {
      promptEntry.facts = facts
    }
    
    if (sources && Array.isArray(sources)) {
      promptEntry.sources = sources
    }
    
    if (description && typeof description === 'string' && description.trim()) {
      promptEntry.description = description.trim()
    }
    
    leaderboard.prompts.push(promptEntry)
    writeLeaderboard(leaderboard)
    
    console.log(`[Leaderboard] Prompt submitted by user ${userId}: ${promptId}`)
    res.json({ success: true, promptId })
  } catch (error) {
    console.error('[Leaderboard] Error submitting prompt:', error)
    res.status(500).json({ error: 'Failed to submit prompt to leaderboard' })
  }
})

// Get all leaderboard prompts (sorted by likes)
// Supports query parameters:
// - ?filter=today - Today's favorites (all prompts from today)
// - ?filter=alltime - All time favorites (top 15 most liked)
// - ?filter=profile&userId=xxx - User's profile (all prompts by user)
// - ?filter=fyp&userId=xxx - For you prompts (mix of recent + popular; excludes user's own if userId provided)
// - ?filter=myfeed&userId=xxx - Posts from users the current user follows, sorted by recency
// - ?filter=browse&userId=xxx - Posts from users the current user does NOT follow (discovery feed)
app.get('/api/leaderboard', (req, res) => {
  try {
    const leaderboard = readLeaderboard()
    const users = readUsers()
    const { filter, userId } = req.query
    
    // Map prompts with user info, profile images on comments/replies, and like count
    let prompts = leaderboard.prompts.map(prompt => {
      const user = users[prompt.userId]
      const enrichedComments = (prompt.comments || []).map(comment => {
        const commenter = users[comment.userId]
        return {
          ...comment,
          profileImage: commenter?.profileImage || null,
          replies: (comment.replies || []).map(reply => {
            const replier = users[reply.userId]
            return { ...reply, profileImage: replier?.profileImage || null }
          }),
        }
      })
      return {
        ...prompt,
        username: user?.isAnonymous ? 'Anonymous' : (user?.username || 'Anonymous'),
        profileImage: user?.profileImage || null,
        likeCount: prompt.likes?.length || 0,
        comments: enrichedComments,
      }
    })
    
    // Filter out followers-only posts for non-followers
    if (userId) {
      const viewer = users[userId]
      prompts = prompts.filter(prompt => {
        if (prompt.visibility !== 'followers') return true
        if (prompt.userId === userId) return true
        return (viewer?.following || []).includes(prompt.userId)
      })
    } else {
      prompts = prompts.filter(prompt => prompt.visibility !== 'followers')
    }

    // Apply filters based on query parameter
    if (filter === 'today') {
      // Today's Favorites: All prompts from today
      const today = new Date()
      today.setHours(0, 0, 0, 0)
      const todayEnd = new Date(today)
      todayEnd.setHours(23, 59, 59, 999)
      
      prompts = prompts.filter(prompt => {
        const promptDate = new Date(prompt.createdAt)
        return promptDate >= today && promptDate <= todayEnd
      })
      
      // Sort by like count (descending), then by creation date (newest first)
      prompts.sort((a, b) => {
        if (b.likeCount !== a.likeCount) {
          return b.likeCount - a.likeCount
        }
        return new Date(b.createdAt) - new Date(a.createdAt)
      })
    } else if (filter === 'alltime') {
      // All Time Favorites: Top 15 most liked prompts of all time
      prompts.sort((a, b) => {
        if (b.likeCount !== a.likeCount) {
          return b.likeCount - a.likeCount
        }
        return new Date(b.createdAt) - new Date(a.createdAt)
      })
      
      // Take only top 15
      prompts = prompts.slice(0, 15)
    } else if (filter === 'fyp') {
      // For You: Mix of recency + likes, optionally exclude user's own prompts
      if (userId) {
        prompts = prompts.filter(prompt => prompt.userId !== userId)
      }

      prompts = prompts
        .map((prompt) => {
          const createdAt = new Date(prompt.createdAt).getTime()
          const hoursSince = Math.max(0, (Date.now() - createdAt) / (1000 * 60 * 60))
          const recencyBoost = Math.max(0, (48 - hoursSince) / 48) // boost for ~2 days
          const score = (prompt.likeCount || 0) * 2 + recencyBoost

          return { ...prompt, score }
        })
        .sort((a, b) => {
          if (b.score !== a.score) return b.score - a.score
          return new Date(b.createdAt) - new Date(a.createdAt)
        })
    } else if (filter === 'myfeed' && userId) {
      // My Feed: Posts from users the current user follows, sorted by recency
      const currentUser = users[userId]
      const followingList = currentUser?.following || []

      prompts = prompts.filter(prompt => prompt.userId === userId || followingList.includes(prompt.userId))

      prompts.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
    } else if (filter === 'browse' && userId) {
      // Browse: Discovery feed — posts from users the current user does NOT follow (and not their own)
      const currentUser = users[userId]
      const followingList = currentUser?.following || []
      const excludeSet = new Set([...followingList, userId])

      prompts = prompts.filter(prompt => !excludeSet.has(prompt.userId))

      prompts = prompts
        .map((prompt) => {
          const createdAt = new Date(prompt.createdAt).getTime()
          const hoursSince = Math.max(0, (Date.now() - createdAt) / (1000 * 60 * 60))
          const recencyBoost = Math.max(0, (48 - hoursSince) / 48)
          const score = (prompt.likeCount || 0) * 2 + recencyBoost
          return { ...prompt, score }
        })
        .sort((a, b) => {
          if (b.score !== a.score) return b.score - a.score
          return new Date(b.createdAt) - new Date(a.createdAt)
        })
    } else if (filter === 'profile' && userId) {
      // My Profile: All prompts submitted by the user
      prompts = prompts.filter(prompt => prompt.userId === userId)
      
      // Sort by creation date (newest first)
      prompts.sort((a, b) => {
        return new Date(b.createdAt) - new Date(a.createdAt)
      })
    } else {
      // Default: Sort by like count (descending), then by creation date (newest first)
      prompts.sort((a, b) => {
        if (b.likeCount !== a.likeCount) {
          return b.likeCount - a.likeCount
        }
        return new Date(b.createdAt) - new Date(a.createdAt)
      })
    }
    
    res.json({ prompts })
  } catch (error) {
    console.error('[Leaderboard] Error fetching leaderboard:', error)
    res.status(500).json({ error: 'Failed to fetch leaderboard' })
  }
})

// Like/unlike a prompt
app.post('/api/leaderboard/like', (req, res) => {
  try {
    const { userId, promptId } = req.body
    
    if (!userId || !promptId) {
      return res.status(400).json({ error: 'userId and promptId are required' })
    }
    
    const leaderboard = readLeaderboard()
    const prompt = leaderboard.prompts.find(p => p.id === promptId)
    
    if (!prompt) {
      return res.status(404).json({ error: 'Prompt not found' })
    }
    
    // Users can't like their own prompts
    if (prompt.userId === userId) {
      return res.status(400).json({ error: 'You cannot like your own prompt' })
    }
    
    // Initialize likes array if it doesn't exist
    if (!prompt.likes) {
      prompt.likes = []
    }
    
    const likeIndex = prompt.likes.indexOf(userId)
    
    if (likeIndex > -1) {
      prompt.likes.splice(likeIndex, 1)
      console.log(`[Leaderboard] User ${userId} unliked prompt ${promptId}`)
    } else {
      prompt.likes.push(userId)
      console.log(`[Leaderboard] User ${userId} liked prompt ${promptId}`)
      // Create notification for the prompt owner
      if (prompt.userId !== userId) {
        const users = readUsers()
        const liker = users[userId]
        createNotification({
          userId: prompt.userId,
          type: 'like',
          fromUserId: userId,
          fromUsername: liker?.username || 'Someone',
          fromProfileImage: liker?.profileImage || null,
          promptId,
          promptText: (prompt.promptText || '').substring(0, 80),
        })
      }
    }
    
    prompt.likeCount = prompt.likes.length
    writeLeaderboard(leaderboard)
    
    res.json({ 
      success: true, 
      liked: likeIndex === -1,
      likeCount: prompt.likeCount 
    })
  } catch (error) {
    console.error('[Leaderboard] Error liking prompt:', error)
    res.status(500).json({ error: 'Failed to like/unlike prompt' })
  }
})

// Delete a prompt (only by owner)
app.delete('/api/leaderboard/delete/:promptId', async (req, res) => {
  try {
    const { promptId } = req.params
    const { userId } = req.body
    
    if (!userId || !promptId) {
      return res.status(400).json({ error: 'userId and promptId are required' })
    }
    
    const leaderboard = readLeaderboard()
    const promptIndex = leaderboard.prompts.findIndex(p => p.id === promptId)
    
    if (promptIndex === -1) {
      return res.status(404).json({ error: 'Prompt not found' })
    }
    
    const prompt = leaderboard.prompts[promptIndex]
    
    // Only the owner can delete their prompt
    if (prompt.userId !== userId) {
      return res.status(403).json({ error: 'You can only delete your own prompts' })
    }
    
    // Remove the prompt from the leaderboard cache
    leaderboard.prompts.splice(promptIndex, 1)
    writeLeaderboard(leaderboard)
    
    // Also delete from MongoDB directly
    try {
      const dbInstance = await db.getDb()
      await dbInstance.collection('leaderboard_posts').deleteOne({ _id: promptId })
      console.log(`[Leaderboard] Deleted prompt ${promptId} from MongoDB`)
    } catch (dbErr) {
      console.error(`[Leaderboard] MongoDB delete error:`, dbErr.message)
    }
    
    console.log(`[Leaderboard] User ${userId} deleted prompt ${promptId}`)
    
    res.json({ 
      success: true, 
      message: 'Prompt deleted successfully' 
    })
  } catch (error) {
    console.error('[Leaderboard] Error deleting prompt:', error)
    res.status(500).json({ error: 'Failed to delete prompt' })
  }
})

// Get user leaderboard stats (wins, notifications)
app.get('/api/leaderboard/user-stats/:userId', (req, res) => {
  try {
    const { userId } = req.params
    const leaderboard = readLeaderboard()
    const users = readUsers()
    const user = users[userId]
    
    if (!user) {
      return res.status(404).json({ error: 'User not found' })
    }
    
    // Get all prompts by this user
    const userPrompts = leaderboard.prompts.filter(p => p.userId === userId)
    
    // Calculate wins (prompts that were #1 at some point or currently #1)
    // For simplicity, we'll consider a prompt a "win" if it has the most likes
    const sortedByLikes = [...leaderboard.prompts].sort((a, b) => {
      const aLikes = a.likes?.length || 0
      const bLikes = b.likes?.length || 0
      if (bLikes !== aLikes) return bLikes - aLikes
      return new Date(b.createdAt) - new Date(a.createdAt)
    })
    
    const wins = []
    userPrompts.forEach(prompt => {
      const promptLikes = prompt.likes?.length || 0
      // Check if this prompt is currently #1 or was #1
      if (sortedByLikes[0]?.id === prompt.id && promptLikes > 0) {
        wins.push({
          promptId: prompt.id,
          promptText: prompt.promptText,
          promptTextShort: prompt.promptText.substring(0, 80) + (prompt.promptText.length > 80 ? '...' : ''),
          category: prompt.category || 'General Knowledge/Other',
          likes: promptLikes,
          date: prompt.createdAt,
        })
      }
    })
    
    // Get recent notifications (likes on user's prompts)
    const notifications = []
    userPrompts.forEach(prompt => {
      const recentLikes = prompt.likes || []
      if (recentLikes.length > 0) {
        // Get the most recent like timestamp (we'll use createdAt as approximation)
        notifications.push({
          type: 'like',
          promptId: prompt.id,
          promptText: prompt.promptText.substring(0, 50) + '...',
          count: recentLikes.length,
          timestamp: prompt.createdAt, // In a real app, you'd track when each like happened
        })
      }
    })
    
    // Sort notifications by timestamp (most recent first)
    notifications.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))
    
    // Count total comments and replies made by this user across all prompts
    let totalComments = 0
    leaderboard.prompts.forEach(prompt => {
      (prompt.comments || []).forEach(comment => {
        if (comment.userId === userId) totalComments++
        ;(comment.replies || []).forEach(reply => {
          if (reply.userId === userId) totalComments++
        })
      })
    })
    
    res.json({
      wins: wins.sort((a, b) => new Date(b.date) - new Date(a.date)),
      winCount: wins.length,
      notifications: notifications.slice(0, 10), // Last 10 notifications
      totalLikes: userPrompts.reduce((sum, p) => sum + (p.likes?.length || 0), 0),
      totalPrompts: userPrompts.length,
      totalComments,
    })
  } catch (error) {
    console.error('[Leaderboard] Error fetching user stats:', error)
    res.status(500).json({ error: 'Failed to fetch user stats' })
  }
})

// Get a user's public profile (visible to other users)
app.get('/api/profile/:userId', async (req, res) => {
  try {
    const { userId } = req.params
    const { viewerId } = req.query

    // Read directly from MongoDB (source of truth)
    const [user, userUsage] = await Promise.all([
      getUserFromDb(userId),
      getUserUsageFromDb(userId),
    ])

    if (!user) {
      return res.status(404).json({ error: 'User not found' })
    }

    const leaderboard = readLeaderboard()

    // Public leaderboard stats
    const userPrompts = leaderboard.prompts.filter(p => p.userId === userId)
    const totalLikes = userPrompts.reduce((sum, p) => sum + (p.likes?.length || 0), 0)

    // Count total comments
    let totalComments = 0
    leaderboard.prompts.forEach(prompt => {
      (prompt.comments || []).forEach(comment => {
        if (comment.userId === userId) totalComments++
        ;(comment.replies || []).forEach(reply => {
          if (reply.userId === userId) totalComments++
        })
      })
    })

    const followers = user.followers || []
    const following = user.following || []
    const isFollowing = viewerId ? followers.includes(viewerId) : false
    const hasRequestedFollow = viewerId ? (user.followRequests || []).includes(viewerId) : false

    res.json({
      userId,
      username: user.isAnonymous ? 'Anonymous' : (user.username || 'Anonymous'),
      firstName: user.isAnonymous ? null : (user.firstName || null),
      bio: user.bio || '',
      profileImage: user.profileImage || null,
      isAnonymous: user.isAnonymous || false,
      isPrivate: user.isPrivate || false,
      createdAt: user.createdAt || null,
      followersCount: followers.length,
      followingCount: following.length,
      isFollowing,
      hasRequestedFollow,
      earnedBadges: userUsage.earnedBadges || [],
      leaderboard: {
        totalPosts: userPrompts.length,
        totalLikes,
        totalComments,
      },
      posts: userPrompts.map(p => ({
        id: p.id,
        promptText: p.promptText,
        category: p.category,
        likeCount: p.likes?.length || 0,
        likes: p.likes || [],
        createdAt: p.createdAt,
        comments: (p.comments || []).map(c => {
          const commenter = usersCache[c.userId]
          return {
            ...c,
            profileImage: commenter?.profileImage || null,
            replies: (c.replies || []).map(r => {
              const replier = usersCache[r.userId]
              return { ...r, profileImage: replier?.profileImage || null }
            }),
          }
        }),
        responses: p.responses || [],
        summary: p.summary || null,
        sources: p.sources || [],
        facts: p.facts || [],
      })).sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)),
    })
  } catch (error) {
    console.error('[Profile] Error fetching public profile:', error)
    res.status(500).json({ error: 'Failed to fetch profile' })
  }
})

// Update user profile (bio, profileImage, isAnonymous, isPrivate)
app.put('/api/profile/:userId', async (req, res) => {
  try {
    const { userId } = req.params
    const { bio, profileImage, isAnonymous, isPrivate } = req.body

    await ensureUserInCache(userId)
    const users = readUsers()
    const user = users[userId]

    if (!user) {
      return res.status(404).json({ error: 'User not found' })
    }

    const updates = {}
    if (bio !== undefined) {
      updates.bio = (bio || '').substring(0, 300)
    }
    if (profileImage !== undefined) {
      if (profileImage && profileImage.length > 500000) {
        return res.status(400).json({ error: 'Profile image too large. Please use a smaller image.' })
      }
      updates.profileImage = profileImage
    }
    if (isAnonymous !== undefined) {
      updates.isAnonymous = !!isAnonymous
    }
    if (isPrivate !== undefined) {
      const wasPrivate = !!user.isPrivate
      updates.isPrivate = !!isPrivate
      // When switching from private to public, auto-approve all pending follow requests
      if (wasPrivate && !updates.isPrivate && user.followRequests && user.followRequests.length > 0) {
        if (!user.followers) user.followers = []
        const dbInstance = await db.getDb()
        for (const requesterId of user.followRequests) {
          await ensureUserInCache(requesterId)
          const requester = users[requesterId]
          if (requester) {
            if (!requester.following) requester.following = []
            if (!requester.following.includes(userId)) requester.following.push(userId)
            requester.sentFollowRequests = (requester.sentFollowRequests || []).filter(id => id !== userId)
            try {
              await dbInstance.collection('users').updateOne({ _id: requesterId }, {
                $addToSet: { following: userId },
                $pull: { sentFollowRequests: userId },
              })
            } catch (e) { /* non-critical */ }
          }
          if (!user.followers.includes(requesterId)) user.followers.push(requesterId)
        }
        user.followRequests = []
        updates.followRequests = []
        updates.followers = user.followers
        try {
          await dbInstance.collection('users').updateOne({ _id: userId }, {
            $set: { followRequests: [], followers: user.followers },
          })
        } catch (e) { /* non-critical */ }
        console.log(`[Profile] Auto-approved ${user.followers.length} pending follow requests for ${userId} (switched to public)`)
      }
    }

    Object.assign(user, updates)
    writeUsers(users, userId)

    try {
      await db.users.update(userId, updates)
    } catch (dbErr) {
      console.warn('[Profile] MongoDB update failed (non-critical):', dbErr.message)
    }

    console.log(`[Profile] Updated profile for user ${userId}:`, Object.keys(updates))
    res.json({ success: true, ...updates })
  } catch (error) {
    console.error('[Profile] Error updating profile:', error)
    res.status(500).json({ error: 'Failed to update profile' })
  }
})

// Follow a user (or send a follow request if target is private)
app.post('/api/users/:targetUserId/follow', async (req, res) => {
  try {
    const { targetUserId } = req.params
    const { userId } = req.body

    if (!userId || !targetUserId) {
      return res.status(400).json({ error: 'userId and targetUserId are required' })
    }
    if (userId === targetUserId) {
      return res.status(400).json({ error: 'You cannot follow yourself' })
    }

    await ensureUserInCache(userId)
    await ensureUserInCache(targetUserId)
    const users = readUsers()
    const currentUser = users[userId]
    const targetUser = users[targetUserId]

    if (!currentUser || !targetUser) {
      return res.status(404).json({ error: 'User not found' })
    }

    if (!currentUser.following) currentUser.following = []
    if (!targetUser.followers) targetUser.followers = []

    if (currentUser.following.includes(targetUserId)) {
      return res.json({ success: true, status: 'following', alreadyFollowing: true })
    }

    // If target account is private, create a follow request instead
    if (targetUser.isPrivate) {
      if (!targetUser.followRequests) targetUser.followRequests = []
      if (!currentUser.sentFollowRequests) currentUser.sentFollowRequests = []

      if (targetUser.followRequests.includes(userId)) {
        return res.json({ success: true, status: 'requested', alreadyRequested: true })
      }

      targetUser.followRequests.push(userId)
      currentUser.sentFollowRequests.push(targetUserId)
      writeUsers(users, userId)
      await syncUserToMongo(targetUserId, targetUser)

      // Atomic MongoDB write to guarantee follow request data persists
      const dbI = await db.getDb()
      await Promise.all([
        dbI.collection('users').updateOne({ _id: targetUserId }, { $addToSet: { followRequests: userId } }),
        dbI.collection('users').updateOne({ _id: userId }, { $addToSet: { sentFollowRequests: targetUserId } }),
      ])

      createNotification({
        userId: targetUserId,
        type: 'follow_request',
        fromUserId: userId,
        fromUsername: currentUser.username || 'Someone',
        fromProfileImage: currentUser.profileImage || null,
      })

      console.log(`[Social] User ${userId} sent follow request to private account ${targetUserId}`)
      return res.json({ success: true, status: 'requested' })
    }

    // Public account — follow directly
    currentUser.following.push(targetUserId)
    targetUser.followers.push(userId)
    writeUsers(users, userId)
    await syncUserToMongo(targetUserId, targetUser)

    // Atomic MongoDB write to guarantee follow data persists
    const dbInst = await db.getDb()
    await Promise.all([
      dbInst.collection('users').updateOne({ _id: userId }, { $addToSet: { following: targetUserId } }),
      dbInst.collection('users').updateOne({ _id: targetUserId }, { $addToSet: { followers: userId } }),
    ])

    createNotification({
      userId: targetUserId,
      type: 'follow',
      fromUserId: userId,
      fromUsername: currentUser.username || 'Someone',
      fromProfileImage: currentUser.profileImage || null,
    })

    console.log(`[Social] User ${userId} followed ${targetUserId}`)
    res.json({
      success: true,
      status: 'following',
      followersCount: targetUser.followers.length,
      followingCount: currentUser.following.length,
    })
  } catch (error) {
    console.error('[Social] Error following user:', error)
    res.status(500).json({ error: 'Failed to follow user' })
  }
})

// Unfollow a user (or cancel a pending follow request)
app.post('/api/users/:targetUserId/unfollow', async (req, res) => {
  try {
    const { targetUserId } = req.params
    const { userId } = req.body

    if (!userId || !targetUserId) {
      return res.status(400).json({ error: 'userId and targetUserId are required' })
    }

    await ensureUserInCache(userId)
    await ensureUserInCache(targetUserId)
    const users = readUsers()
    const currentUser = users[userId]
    const targetUser = users[targetUserId]

    if (!currentUser || !targetUser) {
      return res.status(404).json({ error: 'User not found' })
    }

    if (!currentUser.following) currentUser.following = []
    if (!targetUser.followers) targetUser.followers = []

    // Remove from following/followers
    currentUser.following = currentUser.following.filter(id => id !== targetUserId)
    targetUser.followers = targetUser.followers.filter(id => id !== userId)

    // Also cancel any pending follow request
    if (targetUser.followRequests) {
      targetUser.followRequests = targetUser.followRequests.filter(id => id !== userId)
    }
    if (currentUser.sentFollowRequests) {
      currentUser.sentFollowRequests = currentUser.sentFollowRequests.filter(id => id !== targetUserId)
    }
    writeUsers(users, userId)
    await syncUserToMongo(targetUserId, targetUser)

    // Atomic MongoDB write to guarantee unfollow data persists
    const dbInst = await db.getDb()
    await Promise.all([
      dbInst.collection('users').updateOne({ _id: userId }, {
        $pull: { following: targetUserId, sentFollowRequests: targetUserId },
      }),
      dbInst.collection('users').updateOne({ _id: targetUserId }, {
        $pull: { followers: userId, followRequests: userId },
      }),
    ])

    console.log(`[Social] User ${userId} unfollowed/cancelled request to ${targetUserId}`)
    res.json({
      success: true,
      followersCount: targetUser.followers.length,
      followingCount: currentUser.following.length,
    })
  } catch (error) {
    console.error('[Social] Error unfollowing user:', error)
    res.status(500).json({ error: 'Failed to unfollow user' })
  }
})

// Accept a follow request
app.post('/api/users/:targetUserId/follow/accept', async (req, res) => {
  try {
    const { targetUserId } = req.params // targetUserId is the account owner accepting the request
    const { requesterId } = req.body    // requesterId is the person who requested to follow

    if (!targetUserId || !requesterId) {
      return res.status(400).json({ error: 'targetUserId and requesterId are required' })
    }

    await ensureUserInCache(targetUserId)
    await ensureUserInCache(requesterId)
    const users = readUsers()
    const owner = users[targetUserId]
    const requester = users[requesterId]

    if (!owner || !requester) {
      return res.status(404).json({ error: 'User not found' })
    }

    if (!owner.followRequests || !owner.followRequests.includes(requesterId)) {
      return res.status(400).json({ error: 'No pending follow request from this user' })
    }

    // Move from followRequests to followers/following
    owner.followRequests = owner.followRequests.filter(id => id !== requesterId)
    if (!owner.followers) owner.followers = []
    if (!owner.followers.includes(requesterId)) owner.followers.push(requesterId)

    if (!requester.following) requester.following = []
    if (!requester.following.includes(targetUserId)) requester.following.push(targetUserId)
    requester.sentFollowRequests = (requester.sentFollowRequests || []).filter(id => id !== targetUserId)

    writeUsers(users, targetUserId)
    await syncUserToMongo(requesterId, requester)

    // Atomic MongoDB write to guarantee accept data persists
    const dbInst = await db.getDb()
    await Promise.all([
      dbInst.collection('users').updateOne({ _id: targetUserId }, {
        $pull: { followRequests: requesterId },
        $addToSet: { followers: requesterId },
      }),
      dbInst.collection('users').updateOne({ _id: requesterId }, {
        $pull: { sentFollowRequests: targetUserId },
        $addToSet: { following: targetUserId },
      }),
    ])

    // Notify the requester that their follow was accepted
    createNotification({
      userId: requesterId,
      type: 'follow_accepted',
      fromUserId: targetUserId,
      fromUsername: owner.username || 'Someone',
      fromProfileImage: owner.profileImage || null,
    })

    console.log(`[Social] User ${targetUserId} accepted follow request from ${requesterId}`)
    res.json({ success: true, followersCount: owner.followers.length })
  } catch (error) {
    console.error('[Social] Error accepting follow request:', error)
    res.status(500).json({ error: 'Failed to accept follow request' })
  }
})

// Deny a follow request
app.post('/api/users/:targetUserId/follow/deny', async (req, res) => {
  try {
    const { targetUserId } = req.params
    const { requesterId } = req.body

    if (!targetUserId || !requesterId) {
      return res.status(400).json({ error: 'targetUserId and requesterId are required' })
    }

    await ensureUserInCache(targetUserId)
    await ensureUserInCache(requesterId)
    const users = readUsers()
    const owner = users[targetUserId]
    const requester = users[requesterId]

    if (!owner) {
      return res.status(404).json({ error: 'User not found' })
    }

    owner.followRequests = (owner.followRequests || []).filter(id => id !== requesterId)
    if (requester) {
      requester.sentFollowRequests = (requester.sentFollowRequests || []).filter(id => id !== targetUserId)
    }
    writeUsers(users, targetUserId)
    if (requester) await syncUserToMongo(requesterId, requester)

    // Atomic MongoDB write to guarantee deny data persists
    const dbInst = await db.getDb()
    await Promise.all([
      dbInst.collection('users').updateOne({ _id: targetUserId }, { $pull: { followRequests: requesterId } }),
      dbInst.collection('users').updateOne({ _id: requesterId }, { $pull: { sentFollowRequests: targetUserId } }),
    ])

    console.log(`[Social] User ${targetUserId} denied follow request from ${requesterId}`)
    res.json({ success: true })
  } catch (error) {
    console.error('[Social] Error denying follow request:', error)
    res.status(500).json({ error: 'Failed to deny follow request' })
  }
})

// Get pending follow requests for a user
app.get('/api/users/:userId/follow-requests', async (req, res) => {
  try {
    const { userId } = req.params
    const user = await getUserFromDb(userId)

    if (!user) {
      return res.status(404).json({ error: 'User not found' })
    }

    const requests = (user.followRequests || []).map(rId => {
      const r = usersCache[rId]
      return r ? {
        userId: rId,
        username: r.isAnonymous ? 'Anonymous' : (r.username || 'Anonymous'),
        profileImage: r.profileImage || null,
        bio: (r.bio || '').substring(0, 100),
      } : null
    }).filter(Boolean)

    res.json({ requests })
  } catch (error) {
    console.error('[Social] Error fetching follow requests:', error)
    res.status(500).json({ error: 'Failed to fetch follow requests' })
  }
})

// Get followers list
app.get('/api/users/:userId/followers', async (req, res) => {
  try {
    const { userId } = req.params
    const user = await getUserFromDb(userId)

    if (!user) {
      return res.status(404).json({ error: 'User not found' })
    }

    const followerIds = user.followers || []
    await Promise.all(followerIds.map(fId => ensureUserInCache(fId)))

    const followers = followerIds.map(fId => {
      const f = usersCache[fId]
      return f ? {
        userId: fId,
        username: f.isAnonymous ? 'Anonymous' : (f.username || 'Anonymous'),
        profileImage: f.profileImage || null,
        bio: (f.bio || '').substring(0, 100),
      } : null
    }).filter(Boolean)

    res.json({ followers })
  } catch (error) {
    console.error('[Social] Error fetching followers:', error)
    res.status(500).json({ error: 'Failed to fetch followers' })
  }
})

// Get following list
app.get('/api/users/:userId/following', async (req, res) => {
  try {
    const { userId } = req.params
    const user = await getUserFromDb(userId)

    if (!user) {
      return res.status(404).json({ error: 'User not found' })
    }

    const followingIds = user.following || []
    await Promise.all(followingIds.map(fId => ensureUserInCache(fId)))

    const following = followingIds.map(fId => {
      const f = usersCache[fId]
      return f ? {
        userId: fId,
        username: f.isAnonymous ? 'Anonymous' : (f.username || 'Anonymous'),
        profileImage: f.profileImage || null,
        bio: (f.bio || '').substring(0, 100),
      } : null
    }).filter(Boolean)

    res.json({ following })
  } catch (error) {
    console.error('[Social] Error fetching following:', error)
    res.status(500).json({ error: 'Failed to fetch following' })
  }
})

// Search users by username
app.get('/api/users/search', async (req, res) => {
  try {
    const { q } = req.query
    if (!q || q.trim().length < 1) {
      return res.json({ users: [] })
    }

    const query = q.trim().toLowerCase()
    const users = readUsers()
    const results = []

    for (const [uid, user] of Object.entries(users)) {
      if (user.isAnonymous) continue
      const username = (user.username || '').toLowerCase()
      const firstName = (user.firstName || '').toLowerCase()
      const lastName = (user.lastName || '').toLowerCase()
      if (username.includes(query) || firstName.includes(query) || lastName.includes(query)) {
        results.push({
          userId: uid,
          username: user.username || 'Anonymous',
          firstName: user.firstName || null,
          profileImage: user.profileImage || null,
          bio: (user.bio || '').substring(0, 100),
          followersCount: (user.followers || []).length,
        })
      }
      if (results.length >= 20) break
    }

    results.sort((a, b) => {
      const aExact = a.username.toLowerCase() === query
      const bExact = b.username.toLowerCase() === query
      if (aExact && !bExact) return -1
      if (!aExact && bExact) return 1
      return b.followersCount - a.followersCount
    })

    res.json({ users: results })
  } catch (error) {
    console.error('[Search] Error searching users:', error)
    res.status(500).json({ error: 'Failed to search users' })
  }
})

// Add a comment to a prompt
app.post('/api/leaderboard/comment', (req, res) => {
  try {
    const { userId, promptId, commentText } = req.body
    
    if (!userId || !promptId || !commentText || !commentText.trim()) {
      return res.status(400).json({ error: 'userId, promptId, and commentText are required' })
    }
    
    const leaderboard = readLeaderboard()
    const users = readUsers()
    const user = users[userId]
    const prompt = leaderboard.prompts.find(p => p.id === promptId)
    
    if (!user) {
      return res.status(404).json({ error: 'User not found' })
    }
    
    if (!prompt) {
      return res.status(404).json({ error: 'Prompt not found' })
    }
    
    // Initialize comments array if it doesn't exist
    if (!prompt.comments) {
      prompt.comments = []
    }
    
    const commentId = `comment-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
    const comment = {
      id: commentId,
      userId: userId,
      username: user.username || 'Anonymous',
      text: commentText.trim(),
      createdAt: new Date().toISOString(),
      replies: [],
    }
    
    prompt.comments.push(comment)
    writeLeaderboard(leaderboard)
    
    // Notify prompt owner about the comment
    if (prompt.userId !== userId) {
      createNotification({
        userId: prompt.userId,
        type: 'comment',
        fromUserId: userId,
        fromUsername: user.username || 'Someone',
        fromProfileImage: user.profileImage || null,
        promptId,
        promptText: (prompt.promptText || '').substring(0, 80),
        commentText: commentText.trim().substring(0, 120),
      })
    }
    
    console.log(`[Leaderboard] Comment added by user ${userId} on prompt ${promptId}`)
    res.json({ success: true, comment })
  } catch (error) {
    console.error('[Leaderboard] Error adding comment:', error)
    res.status(500).json({ error: 'Failed to add comment' })
  }
})

// Reply to a comment
app.post('/api/leaderboard/comment/reply', (req, res) => {
  try {
    const { userId, promptId, commentId, replyText } = req.body
    
    if (!userId || !promptId || !commentId || !replyText || !replyText.trim()) {
      return res.status(400).json({ error: 'userId, promptId, commentId, and replyText are required' })
    }
    
    const leaderboard = readLeaderboard()
    const users = readUsers()
    const user = users[userId]
    const prompt = leaderboard.prompts.find(p => p.id === promptId)
    
    if (!user) {
      return res.status(404).json({ error: 'User not found' })
    }
    
    if (!prompt || !prompt.comments) {
      return res.status(404).json({ error: 'Prompt or comment not found' })
    }
    
    const comment = prompt.comments.find(c => c.id === commentId)
    if (!comment) {
      return res.status(404).json({ error: 'Comment not found' })
    }
    
    // Initialize replies array if it doesn't exist
    if (!comment.replies) {
      comment.replies = []
    }
    
    const replyId = `reply-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
    const reply = {
      id: replyId,
      userId: userId,
      username: user.username || 'Anonymous',
      text: replyText.trim(),
      createdAt: new Date().toISOString(),
    }
    
    comment.replies.push(reply)
    writeLeaderboard(leaderboard)
    
    // Notify the original commenter about the reply
    if (comment.userId !== userId) {
      createNotification({
        userId: comment.userId,
        type: 'reply',
        fromUserId: userId,
        fromUsername: user.username || 'Someone',
        fromProfileImage: user.profileImage || null,
        promptId,
        promptText: (prompt.promptText || '').substring(0, 80),
        commentText: replyText.trim().substring(0, 120),
      })
    }
    
    console.log(`[Leaderboard] Reply added by user ${userId} to comment ${commentId}`)
    res.json({ success: true, reply })
  } catch (error) {
    console.error('[Leaderboard] Error adding reply:', error)
    res.status(500).json({ error: 'Failed to add reply' })
  }
})

// Delete a reply (only by owner)
app.delete('/api/leaderboard/comment/reply/delete/:replyId', (req, res) => {
  try {
    const { replyId } = req.params
    const { userId, promptId, commentId } = req.body
    
    if (!userId || !promptId || !commentId || !replyId) {
      return res.status(400).json({ error: 'userId, promptId, commentId, and replyId are required' })
    }
    
    const leaderboard = readLeaderboard()
    const prompt = leaderboard.prompts.find(p => p.id === promptId)
    
    if (!prompt || !prompt.comments) {
      return res.status(404).json({ error: 'Prompt not found' })
    }
    
    const comment = prompt.comments.find(c => c.id === commentId)
    if (!comment || !comment.replies) {
      return res.status(404).json({ error: 'Comment not found' })
    }
    
    const replyIndex = comment.replies.findIndex(r => r.id === replyId)
    if (replyIndex === -1) {
      return res.status(404).json({ error: 'Reply not found' })
    }
    
    const reply = comment.replies[replyIndex]
    
    // Only the owner can delete their reply
    if (reply.userId !== userId) {
      return res.status(403).json({ error: 'You can only delete your own replies' })
    }
    
    // Remove the reply
    comment.replies.splice(replyIndex, 1)
    writeLeaderboard(leaderboard)
    
    console.log(`[Leaderboard] User ${userId} deleted reply ${replyId}`)
    
    res.json({ 
      success: true, 
      message: 'Reply deleted successfully' 
    })
  } catch (error) {
    console.error('[Leaderboard] Error deleting reply:', error)
    res.status(500).json({ error: 'Failed to delete reply' })
  }
})

// Delete a comment (only by owner)
app.delete('/api/leaderboard/comment/delete/:commentId', (req, res) => {
  try {
    const { commentId } = req.params
    const { userId, promptId } = req.body
    
    if (!userId || !promptId || !commentId) {
      return res.status(400).json({ error: 'userId, promptId, and commentId are required' })
    }
    
    const leaderboard = readLeaderboard()
    const prompt = leaderboard.prompts.find(p => p.id === promptId)
    
    if (!prompt || !prompt.comments) {
      return res.status(404).json({ error: 'Prompt not found' })
    }
    
    const commentIndex = prompt.comments.findIndex(c => c.id === commentId)
    if (commentIndex === -1) {
      return res.status(404).json({ error: 'Comment not found' })
    }
    
    const comment = prompt.comments[commentIndex]
    
    // Only the owner can delete their comment
    if (comment.userId !== userId) {
      return res.status(403).json({ error: 'You can only delete your own comments' })
    }
    
    // Remove the comment
    prompt.comments.splice(commentIndex, 1)
    writeLeaderboard(leaderboard)
    
    console.log(`[Leaderboard] User ${userId} deleted comment ${commentId}`)
    
    res.json({ 
      success: true, 
      message: 'Comment deleted successfully' 
    })
  } catch (error) {
    console.error('[Leaderboard] Error deleting comment:', error)
    res.status(500).json({ error: 'Failed to delete comment' })
  }
})

// Like/unlike a comment
app.post('/api/leaderboard/comment/like', (req, res) => {
  try {
    const { userId, promptId, commentId } = req.body
    
    if (!userId || !promptId || !commentId) {
      return res.status(400).json({ error: 'userId, promptId, and commentId are required' })
    }
    
    const leaderboard = readLeaderboard()
    const prompt = leaderboard.prompts.find(p => p.id === promptId)
    
    if (!prompt || !prompt.comments) {
      return res.status(404).json({ error: 'Prompt not found' })
    }
    
    const comment = prompt.comments.find(c => c.id === commentId)
    if (!comment) {
      return res.status(404).json({ error: 'Comment not found' })
    }
    
    // Users can't like their own comments
    if (comment.userId === userId) {
      return res.status(400).json({ error: 'You cannot like your own comment' })
    }
    
    // Initialize likes array if it doesn't exist
    if (!comment.likes) {
      comment.likes = []
    }
    
    const likeIndex = comment.likes.indexOf(userId)
    
    if (likeIndex !== -1) {
      // Unlike: remove the like
      comment.likes.splice(likeIndex, 1)
      console.log(`[Leaderboard] User ${userId} unliked comment ${commentId}`)
    } else {
      // Like: add the like
      comment.likes.push(userId)
      console.log(`[Leaderboard] User ${userId} liked comment ${commentId}`)
    }
    
    writeLeaderboard(leaderboard)
    
    res.json({ 
      success: true, 
      liked: likeIndex === -1,
      likeCount: comment.likes.length 
    })
  } catch (error) {
    console.error('[Leaderboard] Error liking comment:', error)
    res.status(500).json({ error: 'Failed to like/unlike comment' })
  }
})

// ==================== NOTIFICATIONS ENDPOINTS ====================

// Helper: create a notification (fire-and-forget — non-blocking)
const createNotification = async (notification) => {
  try {
    const dbInstance = await db.getDb()
    await dbInstance.collection('notifications').insertOne({
      ...notification,
      _id: `notif-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      createdAt: new Date(),
      read: false,
    })
  } catch (error) {
    console.error('[Notifications] Error creating notification:', error.message)
  }
}

// Get notifications for a user
app.get('/api/notifications/:userId', async (req, res) => {
  try {
    const { userId } = req.params
    const limit = parseInt(req.query.limit) || 50

    const dbInstance = await db.getDb()
    const notifications = await dbInstance.collection('notifications')
      .find({ userId })
      .sort({ createdAt: -1 })
      .limit(limit)
      .toArray()

    const unreadCount = await dbInstance.collection('notifications')
      .countDocuments({ userId, read: false })

    res.json({ notifications, unreadCount })
  } catch (error) {
    console.error('[Notifications] Error fetching notifications:', error)
    res.status(500).json({ error: 'Failed to fetch notifications' })
  }
})

// Mark notifications as read
app.post('/api/notifications/mark-read', async (req, res) => {
  try {
    const { userId, notificationIds } = req.body
    if (!userId) {
      return res.status(400).json({ error: 'userId is required' })
    }

    const dbInstance = await db.getDb()
    const filter = { userId }
    if (notificationIds && notificationIds.length > 0) {
      filter._id = { $in: notificationIds }
    }

    await dbInstance.collection('notifications').updateMany(filter, { $set: { read: true } })
    res.json({ success: true })
  } catch (error) {
    console.error('[Notifications] Error marking notifications read:', error)
    res.status(500).json({ error: 'Failed to mark notifications as read' })
  }
})

// ==================== STRIPE SUBSCRIPTION ENDPOINTS ====================

// Get user's payment method info (last 4 digits, brand, etc.)
app.get('/api/stripe/payment-method', async (req, res) => {
  try {
    const { userId } = req.query
    
    if (!userId) {
      return res.status(400).json({ error: 'userId is required' })
    }
    
    await ensureUserInCache(userId)
    const users = readUsers()
    const user = users[userId]
    
    if (!user) {
      return res.status(404).json({ error: 'User not found' })
    }
    
    if (!user.stripeCustomerId) {
      return res.json({ paymentMethod: null, message: 'No Stripe customer ID' })
    }
    
    // Get the customer's default payment method from Stripe
    const customer = await stripe.customers.retrieve(user.stripeCustomerId, {
      expand: ['invoice_settings.default_payment_method']
    })
    
    let paymentMethod = null
    
    // Check if there's a default payment method
    if (customer.invoice_settings?.default_payment_method) {
      const pm = customer.invoice_settings.default_payment_method
      paymentMethod = {
        id: pm.id,
        brand: pm.card?.brand || 'unknown',
        last4: pm.card?.last4 || '****',
        expMonth: pm.card?.exp_month,
        expYear: pm.card?.exp_year,
      }
    } else {
      // Try to get any payment method attached to customer
      const paymentMethods = await stripe.paymentMethods.list({
        customer: user.stripeCustomerId,
        type: 'card',
        limit: 1,
      })
      
      if (paymentMethods.data.length > 0) {
        const pm = paymentMethods.data[0]
        paymentMethod = {
          id: pm.id,
          brand: pm.card?.brand || 'unknown',
          last4: pm.card?.last4 || '****',
          expMonth: pm.card?.exp_month,
          expYear: pm.card?.exp_year,
        }
      }
    }
    
    res.json({ paymentMethod })
    
  } catch (error) {
    console.error('[Stripe] Error fetching payment method:', error)
    res.status(500).json({ error: 'Failed to fetch payment method' })
  }
})

// Create a setup session to add a payment method (card)
app.post('/api/stripe/setup-card', async (req, res) => {
  try {
    const { userId } = req.body
    
    if (!userId) {
      return res.status(400).json({ error: 'userId is required' })
    }
    
    await ensureUserInCache(userId)
    const users = readUsers()
    const user = users[userId]
    
    if (!user) {
      return res.status(404).json({ error: 'User not found' })
    }
    
    // Get or create Stripe customer
    let customerId = user.stripeCustomerId
    
    if (!customerId) {
      // Create new Stripe customer
      const customer = await stripe.customers.create({
        email: user.email,
        name: user.displayName || userId,
        metadata: {
          userId: userId
        }
      })
      customerId = customer.id
      
      // Save customer ID to user
      user.stripeCustomerId = customerId
      writeUsers(users, userId)
      console.log(`[Stripe] Created new customer ${customerId} for user ${userId}`)
    }
    
    // Create a Checkout session in setup mode (just to save card, no payment)
    const session = await stripe.checkout.sessions.create({
      customer: customerId,
      payment_method_types: ['card'],
      mode: 'setup',
      success_url: `${req.headers.origin || 'http://localhost:3000'}/?card_added=success`,
      cancel_url: `${req.headers.origin || 'http://localhost:3000'}/`,
      metadata: {
        userId: userId,
        type: 'add_card'
      }
    })
    
    console.log(`[Stripe] Created setup session ${session.id} for user ${userId}`)
    
    res.json({ sessionId: session.id, url: session.url })
    
  } catch (error) {
    console.error('[Stripe] Error creating setup session:', error)
    res.status(500).json({ error: 'Failed to create card setup session' })
  }
})

// ============================================================================
// SAVED CARDS
// ============================================================================

// List user's saved payment methods (cards only)
app.get('/api/stripe/saved-cards', async (req, res) => {
  try {
    const { userId } = req.query
    if (!userId) {
      return res.status(400).json({ error: 'userId is required' })
    }

    await ensureUserInCache(userId)
    const users = readUsers()
    const user = users[userId]
    if (!user || !user.stripeCustomerId) {
      return res.json({ cards: [] })
    }

    const paymentMethods = await stripe.paymentMethods.list({
      customer: user.stripeCustomerId,
      type: 'card',
    })

    const cards = paymentMethods.data.map(pm => ({
      id: pm.id,
      brand: pm.card.brand,           // visa, mastercard, amex, etc.
      last4: pm.card.last4,
      expMonth: pm.card.exp_month,
      expYear: pm.card.exp_year,
    }))

    res.json({ cards })
  } catch (error) {
    console.error('[Stripe] Error fetching saved cards:', error)
    res.status(500).json({ error: 'Failed to fetch saved cards' })
  }
})

// Charge a saved card for usage purchase (no card entry needed)
app.post('/api/stripe/charge-saved-card', async (req, res) => {
  try {
    const { userId, paymentMethodId, amount } = req.body
    
    if (!userId || !paymentMethodId || !amount || amount <= 0) {
      return res.status(400).json({ error: 'userId, paymentMethodId, and valid amount are required' })
    }
    if (amount < 1 || amount > 500) {
      return res.status(400).json({ error: 'Amount must be between $1 and $500' })
    }
    
    await ensureUserInCache(userId)
    const users = readUsers()
    const user = users[userId]
    if (!user || !user.stripeCustomerId) {
      return res.status(404).json({ error: 'User not found or no Stripe customer' })
    }

    const TRANSACTION_FEE_PERCENT = 3.5
    const calculatedFee = Math.round(amount * (TRANSACTION_FEE_PERCENT / 100) * 100) / 100
    const calculatedTotal = amount + calculatedFee
    const totalCents = Math.round(calculatedTotal * 100)

    console.log(`[Buy Usage] Charging saved card ${paymentMethodId} for user ${userId}: $${calculatedTotal.toFixed(2)}`)

    // Create and immediately confirm a PaymentIntent using the saved card
    const paymentIntent = await stripe.paymentIntents.create({
      amount: totalCents,
      currency: 'usd',
      customer: user.stripeCustomerId,
      payment_method: paymentMethodId,
      payment_method_types: ['card'],
      confirm: true,                 // Charge immediately
      off_session: true,             // Customer is not present
      description: `Usage credits purchase: $${amount.toFixed(2)}`,
      metadata: {
        userId,
        usageAmount: amount.toString(),
        fee: calculatedFee.toFixed(2),
        type: 'usage_purchase',
      },
    })

    if (paymentIntent.status === 'succeeded') {
      // Add credits to user
      const usage = readUsage()
      if (!usage[userId]) usage[userId] = {}
      if (!usage[userId].purchasedCredits) {
        usage[userId].purchasedCredits = { total: 0, remaining: 0, purchases: [] }
      }
      usage[userId].purchasedCredits.total += amount
      usage[userId].purchasedCredits.remaining += amount
      usage[userId].purchasedCredits.purchases = usage[userId].purchasedCredits.purchases || []
      usage[userId].purchasedCredits.purchases.push({
        amount,
        fee: calculatedFee,
        total: calculatedTotal,
        paymentIntentId: paymentIntent.id,
        date: new Date().toISOString(),
      })
      writeUsage(usage)

      console.log(`[Buy Usage] Added $${amount.toFixed(2)} credits to user ${userId} via saved card`)
      res.json({ success: true, creditsAdded: amount, paymentIntentId: paymentIntent.id })
    } else {
      res.status(400).json({ error: `Payment status: ${paymentIntent.status}. Please try again.` })
    }
  } catch (error) {
    console.error('[Buy Usage] Error charging saved card:', error)
    // Handle card declined or authentication required
    if (error.code === 'authentication_required') {
      res.status(400).json({ error: 'This card requires authentication. Please use a new card instead.' })
    } else {
      res.status(500).json({ error: error.message || 'Failed to charge saved card. Please try again.' })
    }
  }
})

// Delete a saved card
app.delete('/api/stripe/saved-cards/:paymentMethodId', async (req, res) => {
  try {
    const { paymentMethodId } = req.params
    await stripe.paymentMethods.detach(paymentMethodId)
    console.log(`[Stripe] Detached payment method ${paymentMethodId}`)
    res.json({ success: true })
  } catch (error) {
    console.error('[Stripe] Error removing saved card:', error)
    res.status(500).json({ error: 'Failed to remove card' })
  }
})

// ============================================================================
// BUY ADDITIONAL USAGE CREDITS
// ============================================================================

// Create a PaymentIntent for usage purchase (returns clientSecret for inline card collection)
app.post('/api/stripe/create-usage-intent', async (req, res) => {
  try {
    const { userId, amount, saveCard } = req.body

    if (!userId || !amount || amount <= 0) {
      return res.status(400).json({ error: 'userId and valid amount are required' })
    }
    
    if (amount < 1 || amount > 500) {
      return res.status(400).json({ error: 'Amount must be between $1 and $500' })
    }

    await ensureUserInCache(userId)
    const users = readUsers()
    const user = users[userId]

    if (!user) {
      return res.status(404).json({ error: 'User not found' })
    }

    // Ensure user has a Stripe customer
    let customerId = user.stripeCustomerId
    if (!customerId) {
      const customer = await stripe.customers.create({
        email: user.email,
        name: `${user.firstName || ''} ${user.lastName || ''}`.trim() || userId,
        metadata: { userId },
      })
      customerId = customer.id
      user.stripeCustomerId = customerId
      writeUsers(users, userId)
    }
    
    // Calculate total with 3.5% fee
    const TRANSACTION_FEE_PERCENT = 3.5
    const calculatedFee = Math.round(amount * (TRANSACTION_FEE_PERCENT / 100) * 100) / 100
    const calculatedTotal = amount + calculatedFee
    const totalCents = Math.round(calculatedTotal * 100)
    
    console.log(`[Buy Usage] Creating PaymentIntent for user ${userId}: $${amount} + $${calculatedFee.toFixed(2)} fee = $${calculatedTotal.toFixed(2)} (saveCard: ${!!saveCard})`)
    
    // Build PaymentIntent options
    const piOptions = {
      amount: totalCents,
      currency: 'usd',
      payment_method_types: ['card'],
      description: `Usage credits purchase: $${amount.toFixed(2)}`,
      metadata: {
        userId,
        stripeCustomerId: customerId,
        usageAmount: amount.toString(),
        fee: calculatedFee.toFixed(2),
        type: 'usage_purchase',
      },
    }

    // If user wants to save the card, attach to customer and set setup_future_usage
    if (saveCard) {
      piOptions.customer = customerId
      piOptions.setup_future_usage = 'off_session'
    }

    const paymentIntent = await stripe.paymentIntents.create(piOptions)

    res.json({
      clientSecret: paymentIntent.client_secret,
      paymentIntentId: paymentIntent.id,
    })
  } catch (error) {
    console.error('[Buy Usage] Error creating usage intent:', error)
    res.status(500).json({ error: 'Failed to initialize payment. Please try again.' })
  }
})

// Confirm usage purchase after payment succeeds (called from frontend after stripe.confirmPayment)
app.post('/api/stripe/confirm-usage-purchase', async (req, res) => {
  try {
    const { userId, paymentIntentId, amount } = req.body

    if (!userId || !paymentIntentId || !amount) {
      return res.status(400).json({ error: 'userId, paymentIntentId, and amount are required' })
    }

    // Verify the payment intent actually succeeded
    const paymentIntent = await stripe.paymentIntents.retrieve(paymentIntentId)
    if (paymentIntent.status !== 'succeeded') {
      return res.status(400).json({ error: 'Payment has not been completed.' })
    }

    // Verify metadata matches
    if (paymentIntent.metadata?.userId !== userId || paymentIntent.metadata?.type !== 'usage_purchase') {
      return res.status(400).json({ error: 'Payment verification failed.' })
    }
    
    const usageAmount = parseFloat(paymentIntent.metadata.usageAmount)
    const calculatedFee = parseFloat(paymentIntent.metadata.fee)
    const calculatedTotal = usageAmount + calculatedFee
    
    // Add usage credits to the user's account
    const usage = readUsage()
    if (!usage[userId]) {
      usage[userId] = {
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
      }
    }
    
    // Initialize purchasedCredits if not exists
    if (!usage[userId].purchasedCredits) {
      usage[userId].purchasedCredits = {
        total: 0,
        remaining: 0,
        purchases: [],
      }
    }

    // Check if this purchase was already processed (idempotency)
    const alreadyProcessed = usage[userId].purchasedCredits.purchases?.some(
      (p) => p.paymentIntentId === paymentIntentId
    )
    if (alreadyProcessed) {
      return res.json({
        success: true,
        message: 'Purchase already processed',
        creditsAdded: usageAmount,
        newBalance: usage[userId].purchasedCredits.remaining,
      })
    }
    
    // Add the purchase
    usage[userId].purchasedCredits.total += usageAmount
    usage[userId].purchasedCredits.remaining += usageAmount
    usage[userId].purchasedCredits.purchases.push({
      amount: usageAmount,
      fee: calculatedFee,
      total: calculatedTotal,
      paymentIntentId: paymentIntentId,
      timestamp: new Date().toISOString(),
    })
    
    writeUsage(usage)
    
    console.log(`[Buy Usage] Added $${usageAmount} credits to user ${userId}. New balance: $${usage[userId].purchasedCredits.remaining}`)
    
    res.json({
      success: true,
      message: `Successfully purchased $${usageAmount.toFixed(2)} in usage credits`,
      creditsAdded: usageAmount,
      newBalance: usage[userId].purchasedCredits.remaining,
      paymentIntentId,
    })
    
  } catch (error) {
    console.error('[Buy Usage] Error:', error)
    
    // Handle specific Stripe errors
    if (error.type === 'StripeCardError') {
      return res.status(400).json({ error: error.message || 'Card declined' })
    }
    
    res.status(500).json({ error: 'Failed to process payment. Please try again.' })
  }
})

// Sync subscription status from Stripe API (with retry for incomplete → active transitions)
// Also searches by email to recover from duplicate-customer race conditions
const syncSubscriptionFromStripe = async (userId, retries = 3) => {
  for (let attempt = 1; attempt <= retries; attempt++) {
  try {
    await ensureUserInCache(userId)
    const users = readUsers()
    const user = users[userId]
    
    if (!user || !user.stripeCustomerId) {
      return { synced: false, reason: 'No Stripe customer ID' }
    }

    // Get all subscriptions for this customer from Stripe
    let subscriptions = await stripe.subscriptions.list({
      customer: user.stripeCustomerId,
      status: 'all',
      limit: 10,
    })

    // If no active/trialing subscriptions on stored customer, search ALL customers by email
    // This recovers from the duplicate-customer race condition where payment went to an orphaned customer
    const hasActiveSub = subscriptions.data.some(s => s.status === 'active' || s.status === 'trialing')
    if (!hasActiveSub && user.email) {
      try {
        const allCustomers = await stripe.customers.list({ email: user.email, limit: 20 })
        for (const cust of allCustomers.data) {
          if (cust.id === user.stripeCustomerId) continue // Already checked
          const custSubs = await stripe.subscriptions.list({ customer: cust.id, status: 'all', limit: 10 })
          const activeSub = custSubs.data.find(s => s.status === 'active' || s.status === 'trialing')
          if (activeSub) {
            console.log(`[Stripe] Found active subscription on alternate customer ${cust.id} (was using ${user.stripeCustomerId}) for user ${userId}`)
            // Fix the stored customer ID to the one with the active subscription
            user.stripeCustomerId = cust.id
            user.stripeSubscriptionId = activeSub.id
            user.subscriptionStatus = activeSub.status
            user.subscriptionRenewalDate = new Date(activeSub.current_period_end * 1000).toISOString()
            if (!user.subscriptionStartedDate) {
              user.subscriptionStartedDate = new Date().toISOString()
            }
            writeUsers(users, userId)
            console.log(`[Stripe] Recovered subscription for user ${userId}: customer=${cust.id}, sub=${activeSub.id}, status=${activeSub.status}`)
            return { synced: true, status: activeSub.status, subscriptionId: activeSub.id, endDate: user.subscriptionRenewalDate }
          }
          // Also check for incomplete subs with succeeded payment intents on alternate customers
          for (const sub of custSubs.data) {
            if (sub.status === 'incomplete') {
              try {
                const expandedSub = await stripe.subscriptions.retrieve(sub.id, { expand: ['latest_invoice.payment_intent'] })
                const pi = expandedSub.latest_invoice?.payment_intent
                if (pi && pi.status === 'succeeded') {
                  console.log(`[Stripe] Found paid-but-incomplete subscription on alternate customer ${cust.id} for user ${userId}`)
                  user.stripeCustomerId = cust.id
                  user.stripeSubscriptionId = sub.id
                  user.subscriptionStatus = 'active'
                  user.subscriptionRenewalDate = new Date(expandedSub.current_period_end * 1000).toISOString()
                  if (!user.subscriptionStartedDate) {
                    user.subscriptionStartedDate = new Date().toISOString()
                  }
                  writeUsers(users, userId)
                  console.log(`[Stripe] Recovered (force-active) subscription for user ${userId}: customer=${cust.id}, sub=${sub.id}`)
                  return { synced: true, status: 'active', subscriptionId: sub.id, endDate: user.subscriptionRenewalDate }
                }
              } catch (e) {
                // Skip this sub if we can't expand it
              }
            }
          }
        }
      } catch (emailSearchErr) {
        console.warn(`[Stripe] Email-based customer search failed for ${userId}:`, emailSearchErr.message)
      }
    }

    if (subscriptions.data.length === 0) {
      if (user.subscriptionStatus !== 'inactive') {
        user.subscriptionStatus = 'inactive'
        user.stripeSubscriptionId = null
          user.subscriptionRenewalDate = null
        writeUsers(users, userId)
        console.log(`[Stripe] Synced subscription status to inactive for user: ${userId}`)
        return { synced: true, status: 'inactive' }
      }
      return { synced: false, reason: 'No subscriptions in Stripe' }
    }

    // Get the most recent active subscription (or the most recent one if none are active)
    const activeSubscription = subscriptions.data.find(sub => sub.status === 'active')
      const trialingSubscription = subscriptions.data.find(sub => sub.status === 'trialing')
      const subscription = activeSubscription || trialingSubscription || subscriptions.data[0]

      // If subscription is still incomplete and we have retries left, wait and try again
      if (subscription.status === 'incomplete' && attempt < retries) {
        console.log(`[Stripe] Subscription still incomplete for ${userId}, retrying in 2s... (attempt ${attempt}/${retries})`)
        await new Promise(resolve => setTimeout(resolve, 2000))
        continue
      }

      // If subscription is incomplete, check if the latest invoice's payment intent succeeded
      if (subscription.status === 'incomplete') {
        try {
          const expandedSub = await stripe.subscriptions.retrieve(subscription.id, {
            expand: ['latest_invoice.payment_intent'],
          })
          const pi = expandedSub.latest_invoice?.payment_intent
          if (pi && pi.status === 'succeeded') {
            // Payment succeeded but subscription hasn't transitioned yet — force it
            console.log(`[Stripe] Payment succeeded but sub still incomplete for ${userId}. Treating as active.`)
            const oldStatus = user.subscriptionStatus
            user.stripeSubscriptionId = subscription.id
            user.subscriptionStatus = 'active'
            user.subscriptionRenewalDate = new Date(expandedSub.current_period_end * 1000).toISOString()
            if (!user.subscriptionStartedDate) {
              user.subscriptionStartedDate = new Date().toISOString()
            }
            writeUsers(users, userId)
            if (oldStatus !== 'active') {
              console.log(`[Stripe] Force-synced subscription for user ${userId}: ${oldStatus} → active`)
            }
            return { synced: true, status: 'active', subscriptionId: subscription.id, endDate: user.subscriptionRenewalDate }
          }
        } catch (expandErr) {
          console.warn(`[Stripe] Could not expand subscription for ${userId}:`, expandErr.message)
        }
      }

    // Update user's subscription info
    const oldStatus = user.subscriptionStatus
    user.stripeSubscriptionId = subscription.id
    user.subscriptionStatus = subscription.status
      user.subscriptionRenewalDate = new Date(subscription.current_period_end * 1000).toISOString()
    
    writeUsers(users, userId)
    
    if (oldStatus !== subscription.status) {
      console.log(`[Stripe] Synced subscription status from Stripe for user ${userId}: ${oldStatus} → ${subscription.status}`)
    }
    
    return { 
      synced: true, 
      status: subscription.status,
      subscriptionId: subscription.id,
        endDate: user.subscriptionRenewalDate
    }
  } catch (error) {
      console.error(`[Stripe] Error syncing subscription from Stripe for user ${userId} (attempt ${attempt}):`, error)
      if (attempt === retries) {
    return { synced: false, error: error.message }
  }
    }
  }
  return { synced: false, reason: 'Retries exhausted' }
}

// Get subscription status for current user
app.get('/api/stripe/subscription-status', async (req, res) => {
  try {
    const { userId, sync } = req.query
    if (!userId) {
      return res.status(400).json({ error: 'userId is required' })
    }

    await ensureUserInCache(userId)
    const users = readUsers()
    const user = users[userId]

    if (!user) {
      return res.status(404).json({ error: 'User not found' })
    }

    // If sync=true or if user has customerId but status is inactive, sync from Stripe
    const shouldSync = sync === 'true' || (user.stripeCustomerId && (!user.subscriptionStatus || user.subscriptionStatus === 'inactive'))
    
    if (shouldSync) {
      const syncResult = await syncSubscriptionFromStripe(userId)
      if (syncResult.synced) {
        // Re-read users to get updated status
        const updatedUsers = readUsers()
        const updatedUser = updatedUsers[userId]
        return res.json({
          subscriptionStatus: updatedUser.subscriptionStatus || 'inactive',
          subscriptionRenewalDate: updatedUser.subscriptionRenewalDate || null,
          hasActiveSubscription: updatedUser.subscriptionStatus === 'active',
          synced: true,
        })
      }
    }

    res.json({
      subscriptionStatus: user.subscriptionStatus || 'inactive',
      subscriptionRenewalDate: user.subscriptionRenewalDate || null,
      hasActiveSubscription: user.subscriptionStatus === 'active',
      synced: false,
    })
  } catch (error) {
    console.error('[Stripe] Error getting subscription status:', error)
    res.status(500).json({ error: 'Failed to get subscription status' })
  }
})

// Get Stripe publishable key for frontend
app.get('/api/stripe/config', (req, res) => {
  const publishableKey = process.env.STRIPE_PUBLISHABLE_KEY || ''
  if (!publishableKey) {
    return res.status(500).json({ error: 'Stripe publishable key not configured' })
  }
  res.json({ publishableKey })
})

// Create subscription with incomplete payment (for inline card collection)
// In-flight locks to prevent race conditions on concurrent subscription-intent calls
const subscriptionIntentLocks = new Set()

app.post('/api/stripe/create-subscription-intent', async (req, res) => {
  try {
    const { userId } = req.body
    if (!userId) {
      return res.status(400).json({ error: 'userId is required' })
    }

    // Prevent concurrent calls for the same user (race condition from double useEffect etc.)
    if (subscriptionIntentLocks.has(userId)) {
      console.log(`[Stripe] Duplicate create-subscription-intent call blocked for user ${userId}`)
      return res.status(409).json({ error: 'Subscription initialization already in progress. Please wait.' })
    }
    subscriptionIntentLocks.add(userId)

    if (!STRIPE_PRICE_ID) {
      subscriptionIntentLocks.delete(userId)
      return res.status(500).json({ error: 'Stripe price ID not configured' })
    }

    await ensureUserInCache(userId)
    const users = readUsers()
    const user = users[userId]

    if (!user) {
      subscriptionIntentLocks.delete(userId)
      return res.status(404).json({ error: 'User not found' })
    }

    // Create or retrieve Stripe customer
    let customerId = user.stripeCustomerId

    if (!customerId) {
      const customer = await stripe.customers.create({
        email: user.email,
        name: `${user.firstName || ''} ${user.lastName || ''}`.trim() || userId,
        metadata: {
          userId: userId,
        },
      })
      customerId = customer.id

      // Save customer ID to user — re-read cache to avoid overwriting concurrent updates
      const freshUsers = readUsers()
      if (freshUsers[userId] && !freshUsers[userId].stripeCustomerId) {
        freshUsers[userId].stripeCustomerId = customerId
        writeUsers(freshUsers, userId)
        // Also update the local reference
        user.stripeCustomerId = customerId
      } else if (freshUsers[userId]?.stripeCustomerId) {
        // Another call already set a customer ID — use that one and clean up the duplicate
        console.log(`[Stripe] Race condition detected: another call already set customer ${freshUsers[userId].stripeCustomerId}, discarding ${customerId}`)
        customerId = freshUsers[userId].stripeCustomerId
        user.stripeCustomerId = customerId
      }
      console.log(`[Stripe] Created new customer ${customerId} for user ${userId}`)
    }

    // Check if user already has an active subscription in Stripe
    if (customerId) {
      const existingSubs = await stripe.subscriptions.list({
        customer: customerId,
        status: 'all',
        limit: 10,
      })

      // If there's an active/trialing subscription, update user and return
      const activeSub = existingSubs.data.find(s => s.status === 'active' || s.status === 'trialing')
      if (activeSub) {
        user.subscriptionStatus = activeSub.status
        user.stripeSubscriptionId = activeSub.id
        user.subscriptionRenewalDate = new Date(activeSub.current_period_end * 1000).toISOString()
        if (!user.subscriptionStartedDate) {
          user.subscriptionStartedDate = new Date().toISOString()
        }
        writeUsers(users, userId)
        console.log(`[Stripe] User ${userId} already has active subscription ${activeSub.id}`)
        subscriptionIntentLocks.delete(userId)
        return res.json({ alreadyActive: true, subscriptionId: activeSub.id })
      }

      // If there's an incomplete subscription, try to reuse it
      const incompleteSub = existingSubs.data.find(s => s.status === 'incomplete')
      if (incompleteSub) {
        // Retrieve with expanded payment intent
        const expandedSub = await stripe.subscriptions.retrieve(incompleteSub.id, {
          expand: ['latest_invoice.payment_intent'],
        })
        const pi = expandedSub.latest_invoice?.payment_intent

        if (pi && pi.status === 'succeeded') {
          // Payment actually succeeded — subscription should be active soon
          user.subscriptionStatus = 'active'
          user.stripeSubscriptionId = incompleteSub.id
          user.subscriptionRenewalDate = new Date(expandedSub.current_period_end * 1000).toISOString()
          if (!user.subscriptionStartedDate) {
            user.subscriptionStartedDate = new Date().toISOString()
          }
          writeUsers(users, userId)
          console.log(`[Stripe] User ${userId} incomplete sub ${incompleteSub.id} has succeeded PI — force activating`)
          subscriptionIntentLocks.delete(userId)
          return res.json({ alreadyActive: true, subscriptionId: incompleteSub.id })
        }

        if (pi && (pi.status === 'requires_payment_method' || pi.status === 'requires_confirmation')) {
          // Reuse this subscription — just return its client secret
          console.log(`[Stripe] Reusing incomplete subscription ${incompleteSub.id} for user ${userId} (PI status: ${pi.status})`)
          
          // Save the subscription ID on the user
          user.stripeSubscriptionId = incompleteSub.id
          user.subscriptionStatus = 'incomplete'
          writeUsers(users, userId)

          subscriptionIntentLocks.delete(userId)
          return res.json({
            subscriptionId: incompleteSub.id,
            clientSecret: pi.client_secret,
          })
        }

        // Otherwise cancel the stale incomplete subscription
        try {
          await stripe.subscriptions.cancel(incompleteSub.id)
          console.log(`[Stripe] Canceled stale incomplete subscription ${incompleteSub.id}`)
        } catch (cancelErr) {
          console.warn(`[Stripe] Could not cancel stale sub:`, cancelErr.message)
        }
      }
    }

    // Detach any existing payment methods from this customer so old cards don't show up
    try {
      const existingMethods = await stripe.paymentMethods.list({
        customer: customerId,
        type: 'card',
      })
      for (const pm of existingMethods.data) {
        await stripe.paymentMethods.detach(pm.id)
      }
    } catch (detachErr) {
      console.warn('[Stripe] Could not detach old payment methods:', detachErr.message)
    }

    // Create subscription with incomplete payment so we can collect card info inline
    const subscription = await stripe.subscriptions.create({
      customer: customerId,
      items: [{ price: STRIPE_PRICE_ID }],
      payment_behavior: 'default_incomplete',
      payment_settings: {
        save_default_payment_method: 'on_subscription',
        payment_method_types: ['card'],
      },
      expand: ['latest_invoice.payment_intent'],
      metadata: {
        userId: userId,
      },
    })

    const paymentIntent = subscription.latest_invoice.payment_intent

    // Save subscription ID on the user record
    user.stripeSubscriptionId = subscription.id
    user.subscriptionStatus = 'incomplete'
    writeUsers(users, userId)

    console.log(`[Stripe] Created subscription intent for user ${userId}, sub: ${subscription.id}, PI: ${paymentIntent.id}`)

    subscriptionIntentLocks.delete(userId)
    res.json({
      subscriptionId: subscription.id,
      clientSecret: paymentIntent.client_secret,
    })
  } catch (error) {
    // Release lock on error
    const lockUserId = req.body?.userId
    if (lockUserId) subscriptionIntentLocks.delete(lockUserId)
    console.error('[Stripe] Error creating subscription intent:', error)
    res.status(500).json({ error: 'Failed to create subscription. Please try again.' })
  }
})

// Confirm subscription after payment — called by frontend after stripe.confirmPayment succeeds
app.post('/api/stripe/confirm-subscription', async (req, res) => {
  try {
    const { userId, subscriptionId } = req.body
    if (!userId) {
      return res.status(400).json({ error: 'userId is required' })
    }

    const users = readUsers()
    const user = users[userId]
    if (!user) {
      return res.status(404).json({ error: 'User not found' })
    }

    const subId = subscriptionId || user.stripeSubscriptionId
    if (!subId) {
      return res.status(400).json({ error: 'No subscription ID found for user' })
    }

    // Retrieve the subscription from Stripe with expanded payment intent
    const subscription = await stripe.subscriptions.retrieve(subId, {
      expand: ['latest_invoice.payment_intent'],
    })

    console.log(`[Stripe] Confirm-subscription for ${userId}: sub status=${subscription.status}, PI status=${subscription.latest_invoice?.payment_intent?.status}`)

    const pi = subscription.latest_invoice?.payment_intent

    if (subscription.status === 'active' || subscription.status === 'trialing') {
      // Already active
      user.subscriptionStatus = subscription.status
      user.stripeSubscriptionId = subscription.id
      user.subscriptionRenewalDate = new Date(subscription.current_period_end * 1000).toISOString()
      writeUsers(users, userId)
      console.log(`[Stripe] Subscription ${subId} confirmed active for user ${userId}`)
      return res.json({ 
        success: true, 
        subscriptionStatus: subscription.status,
        subscriptionRenewalDate: user.subscriptionRenewalDate,
      })
    }

    if (pi && pi.status === 'succeeded') {
      // Payment succeeded but subscription hasn't transitioned yet — force active
      user.subscriptionStatus = 'active'
      user.stripeSubscriptionId = subscription.id
      user.subscriptionRenewalDate = new Date(subscription.current_period_end * 1000).toISOString()
      if (!user.subscriptionStartedDate) {
        user.subscriptionStartedDate = new Date().toISOString()
      }
      writeUsers(users, userId)
      console.log(`[Stripe] Payment succeeded for sub ${subId}, force-activating user ${userId}`)
      return res.json({ 
        success: true, 
        subscriptionStatus: 'active',
        subscriptionRenewalDate: user.subscriptionRenewalDate,
      })
    }

    // Still not active
    return res.json({ 
      success: false, 
      subscriptionStatus: subscription.status,
      paymentStatus: pi?.status || 'unknown',
      message: `Subscription is ${subscription.status}, payment is ${pi?.status || 'unknown'}`,
    })
  } catch (error) {
    console.error('[Stripe] Error confirming subscription:', error)
    res.status(500).json({ error: 'Failed to confirm subscription status' })
  }
})

// Create Stripe Checkout Session for subscription (legacy redirect flow)
app.post('/api/stripe/create-checkout-session', async (req, res) => {
  try {
    const { userId } = req.body
    if (!userId) {
      return res.status(400).json({ error: 'userId is required' })
    }

    if (!STRIPE_PRICE_ID) {
      return res.status(500).json({ error: 'Stripe price ID not configured' })
    }

    const users = readUsers()
    const user = users[userId]

    if (!user) {
      return res.status(404).json({ error: 'User not found' })
    }

    // Create or retrieve Stripe customer
    let customerId = user.stripeCustomerId

    if (!customerId) {
      const customer = await stripe.customers.create({
        email: user.email,
        name: `${user.firstName} ${user.lastName}`,
        metadata: {
          userId: userId,
        },
      })
      customerId = customer.id

      // Save customer ID to user
      user.stripeCustomerId = customerId
      writeUsers(users, userId)
    }

    // Create checkout session
    const session = await stripe.checkout.sessions.create({
      customer: customerId,
      payment_method_types: ['card'],
      line_items: [
        {
          price: STRIPE_PRICE_ID,
          quantity: 1,
        },
      ],
      mode: 'subscription',
      success_url: `${req.headers.origin || 'http://localhost:3000'}/?subscription=success`,
      cancel_url: `${req.headers.origin || 'http://localhost:3000'}/`,
      metadata: {
        userId: userId,
      },
    })

    res.json({ sessionId: session.id, url: session.url })
  } catch (error) {
    console.error('[Stripe] Error creating checkout session:', error)
    res.status(500).json({ error: 'Failed to create checkout session' })
  }
})

// Pause subscription - cancel recurring payments but keep user in database
app.post('/api/stripe/pause-subscription', async (req, res) => {
  try {
    const { userId } = req.body
    if (!userId) {
      return res.status(400).json({ error: 'userId is required' })
    }

    const users = readUsers()
    const user = users[userId]

    if (!user) {
      return res.status(404).json({ error: 'User not found' })
    }

    if (!user.stripeSubscriptionId) {
      return res.status(400).json({ error: 'No active subscription found' })
    }

    // Retrieve the subscription to get the current_period_end before canceling
    let periodEnd = user.subscriptionRenewalDate
    try {
      const stripeSub = await stripe.subscriptions.retrieve(user.stripeSubscriptionId)
      if (stripeSub.current_period_end) {
        periodEnd = new Date(stripeSub.current_period_end * 1000).toISOString()
      }
    } catch (e) {
      console.log(`[Stripe] Could not retrieve subscription for period end, using existing renewalDate`)
    }

    // Cancel the subscription in Stripe (this will stop recurring payments)
    await stripe.subscriptions.cancel(user.stripeSubscriptionId)

    // Update user status to 'paused' (keep user in database)
    // KEEP the subscriptionRenewalDate so user retains access until their paid period ends
    user.subscriptionStatus = 'paused'
    user.subscriptionRenewalDate = periodEnd
    user.subscriptionPausedDate = new Date().toISOString()
    
    // Add to cancellation history
    if (!user.cancellationHistory) user.cancellationHistory = []
    user.cancellationHistory.push({
      date: new Date().toISOString(),
      reason: 'user_paused',
    })
    
    // Keep stripeSubscriptionId for reference but subscription is canceled in Stripe
    writeUsers(users, userId)

    console.log(`[Stripe] Subscription paused for user: ${userId}`)
    res.json({ success: true, message: 'Subscription paused successfully' })
  } catch (error) {
    console.error('[Stripe] Error pausing subscription:', error)
    res.status(500).json({ error: 'Failed to pause subscription' })
  }
})

// Resume/unpause subscription - re-subscribe the user
app.post('/api/stripe/resume-subscription', async (req, res) => {
  try {
    const { userId } = req.body
    if (!userId) {
      return res.status(400).json({ error: 'userId is required' })
    }

    const users = readUsers()
    const user = users[userId]

    if (!user) {
      return res.status(404).json({ error: 'User not found' })
    }

    if (user.subscriptionStatus !== 'paused' && user.subscriptionStatus !== 'canceled') {
      return res.status(400).json({ error: 'Subscription is not paused or canceled' })
    }

    if (!user.stripeCustomerId) {
      return res.status(400).json({ error: 'No Stripe customer found. Please re-subscribe.' })
    }

    // Check if user is still within their paid period
    const now = new Date()
    const renewalDate = user.subscriptionRenewalDate ? new Date(user.subscriptionRenewalDate) : null
    const isWithinPaidPeriod = renewalDate && renewalDate > now

    if (isWithinPaidPeriod) {
      // --- WITHIN PAID PERIOD: Reactivate seamlessly using saved card ---
      // User already paid for this period, so create a new subscription that starts
      // billing at the END of their current paid period (no immediate charge).
      console.log(`[Stripe] Resuming within paid period for user ${userId}. Renewal: ${renewalDate.toISOString()}`)

      // Get the customer's existing payment method
      const paymentMethods = await stripe.paymentMethods.list({
        customer: user.stripeCustomerId,
        type: 'card',
      })

      if (paymentMethods.data.length === 0) {
        // No saved card — fall back to checkout
        console.log(`[Stripe] No saved payment method for ${userId}, falling back to checkout`)
        return res.status(400).json({ 
          error: 'No payment method on file. Please re-enter your card.',
          needsCheckout: true,
        })
      }

      const defaultPaymentMethod = paymentMethods.data[0].id

      // Set the payment method as the customer's default
      await stripe.customers.update(user.stripeCustomerId, {
        invoice_settings: { default_payment_method: defaultPaymentMethod },
      })

      // Create a new subscription with trial_end = renewalDate
      // This means: no charge now, billing starts when the already-paid period ends
      const trialEndUnix = Math.floor(renewalDate.getTime() / 1000)
      const subscription = await stripe.subscriptions.create({
        customer: user.stripeCustomerId,
        items: [{ price: STRIPE_PRICE_ID }],
        default_payment_method: defaultPaymentMethod,
        trial_end: trialEndUnix,
        metadata: { userId },
      })

      // Update user — reactivate immediately
      user.subscriptionStatus = 'active'
      user.stripeSubscriptionId = subscription.id
      user.subscriptionPausedDate = null
      user.subscriptionRenewalDate = renewalDate.toISOString() // Keep the same renewal date
      user.subscriptionStartedDate = user.subscriptionStartedDate || new Date().toISOString()

      // Add to cancellation history
      if (!user.cancellationHistory) user.cancellationHistory = []
      user.cancellationHistory.push({
        date: new Date().toISOString(),
        reason: 'user_resumed',
      })

      writeUsers(users, userId)

      console.log(`[Stripe] Subscription resumed for user ${userId}. New sub: ${subscription.id}, billing starts: ${renewalDate.toISOString()}`)
      return res.json({
        success: true,
        subscriptionStatus: 'active',
        subscriptionRenewalDate: user.subscriptionRenewalDate,
        message: `Subscription reactivated! Your next billing date is ${renewalDate.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}.`,
      })

    } else {
      // --- PAST PAID PERIOD: Need to charge immediately via checkout ---
      console.log(`[Stripe] User ${userId} is past paid period, redirecting to checkout`)
      
      // Try to use saved card for immediate subscription
      const paymentMethods = await stripe.paymentMethods.list({
        customer: user.stripeCustomerId,
        type: 'card',
      })

      if (paymentMethods.data.length > 0) {
        // Has a saved card — create subscription that charges immediately
        const defaultPaymentMethod = paymentMethods.data[0].id

        await stripe.customers.update(user.stripeCustomerId, {
          invoice_settings: { default_payment_method: defaultPaymentMethod },
        })

        const subscription = await stripe.subscriptions.create({
          customer: user.stripeCustomerId,
          items: [{ price: STRIPE_PRICE_ID }],
          default_payment_method: defaultPaymentMethod,
          metadata: { userId },
        })

        // Update user
        user.subscriptionStatus = subscription.status // should be 'active'
        user.stripeSubscriptionId = subscription.id
        user.subscriptionPausedDate = null
        user.subscriptionRenewalDate = new Date(subscription.current_period_end * 1000).toISOString()
        user.subscriptionStartedDate = new Date().toISOString()

        if (!user.cancellationHistory) user.cancellationHistory = []
        user.cancellationHistory.push({
          date: new Date().toISOString(),
          reason: 'user_resumed',
        })

        writeUsers(users, userId)

        console.log(`[Stripe] Subscription restarted for user ${userId}. Sub: ${subscription.id}, status: ${subscription.status}`)
        return res.json({
          success: true,
          subscriptionStatus: subscription.status,
          subscriptionRenewalDate: user.subscriptionRenewalDate,
          message: 'Subscription reactivated and payment processed!',
        })
      } else {
        // No saved card — must go through checkout
        return res.status(400).json({
          error: 'No payment method on file. Please re-enter your card.',
          needsCheckout: true,
        })
      }
    }
  } catch (error) {
    console.error('[Stripe] Error resuming subscription:', error)
    res.status(500).json({ error: 'Failed to resume subscription. Please try again.' })
  }
})

// Cancel subscription and delete account - remove everything
app.post('/api/stripe/cancel-subscription-delete-account', async (req, res) => {
  try {
    const { userId } = req.body
    if (!userId) {
      return res.status(400).json({ error: 'userId is required' })
    }

    const users = readUsers()
    const user = users[userId]

    if (!user) {
      return res.status(404).json({ error: 'User not found' })
    }

    // Preserve free trial abuse prevention data before deletion
    if (user.plan === 'free_trial') {
      await db.users.recordUsedTrial({
        canonicalEmail: user.canonicalEmail || user.email,
        email: user.email,
        signupIp: user.signupIp || null,
        deviceFingerprint: user.deviceFingerprint || null,
      })
      console.log(`[Stripe] Recorded used free trial for abuse prevention: ${user.email}`)
    }

    // Cancel subscription in Stripe if it exists
    if (user.stripeSubscriptionId) {
      try {
        await stripe.subscriptions.cancel(user.stripeSubscriptionId)
        console.log(`[Stripe] Subscription canceled for user: ${userId}`)
      } catch (stripeError) {
        console.error('[Stripe] Error canceling subscription (may already be canceled):', stripeError.message)
        // Continue with deletion even if subscription cancel fails
      }
    }

    // Delete the Stripe customer record entirely (removes from Stripe dashboard)
    if (user.stripeCustomerId) {
      try {
        await stripe.customers.del(user.stripeCustomerId)
        console.log(`[Stripe] Customer deleted from Stripe for user: ${userId}`)
      } catch (stripeError) {
        console.error('[Stripe] Error deleting Stripe customer:', stripeError.message)
        // Continue with deletion even if customer delete fails
      }
    }

    // Prevent background flushes from re-creating this user's data in MongoDB
    usageDirtyUsers.delete(userId)
    deletedUserIds.add(userId)

    // Clear caches BEFORE deleting from MongoDB so no flush can re-write
    delete users[userId]
    usersCache = users
    delete usageCache[userId]

    // Delete ALL user data from MongoDB (one call covers every collection)
    try {
      await db.users.delete(userId)
      console.log(`[Stripe] Deleted user ${userId} and all data from MongoDB`)
    } catch (dbErr) {
      console.error(`[Stripe] MongoDB cleanup error for ${userId}:`, dbErr.message)
    }

    // Purge all user traces from leaderboard (posts, likes, comments, replies)
    try {
      await purgeUserFromLeaderboard(userId)
      console.log(`[Stripe] User ${userId} purged from leaderboard cache and MongoDB`)
    } catch (lbErr) {
      console.error(`[Stripe] Leaderboard purge error for ${userId}:`, lbErr.message)
    }

    // Increment deleted users count
    await incrementDeletedUsers()

    console.log(`[Stripe] Account deleted for user: ${userId}`)
    res.json({ success: true, message: 'Account and subscription deleted successfully' })
  } catch (error) {
    console.error('[Stripe] Error canceling subscription and deleting account:', error)
    res.status(500).json({ error: 'Failed to cancel subscription and delete account' })
  }
})

// Calculate and record usage-based billing for overage
const calculateAndRecordOverage = async (userId, month) => {
  try {
    const users = readUsers()
    const user = users[userId]
    
    if (!user || !user.stripeCustomerId || user.subscriptionStatus !== 'active') {
      console.log(`[Billing] Skipping overage calculation for ${userId}: no active subscription`)
      return { overage: 0, billed: false }
    }
    
    const usage = readUsage()
    const userUsage = usage[userId]
    if (!userUsage) {
      return { overage: 0, billed: false }
    }
    
    // Calculate monthly cost
    // Free trial users have no monthly allocation (they only get purchasedCredits)
    const isFreeTrial = user?.plan === 'free_trial' || (user?.subscriptionStatus === 'trialing' && !user?.stripeSubscriptionId)
    const FREE_MONTHLY_ALLOCATION = isFreeTrial ? 0 : 7.50
    const pricing = getPricingData()
    const dailyData = userUsage.dailyUsage?.[month] || {}
    let monthlyCost = 0
    
    // Sum up costs from all days in the month
    Object.keys(dailyData).forEach((dateStr) => {
      const dayData = dailyData[dateStr]
      if (dayData) {
        // Calculate cost for each model used on this day
        if (dayData.models) {
          Object.keys(dayData.models).forEach((modelKey) => {
            const modelDayData = dayData.models[modelKey]
            const dayInputTokens = modelDayData.inputTokens || 0
            const dayOutputTokens = modelDayData.outputTokens || 0
            const dayCost = calculateModelCost(modelKey, dayInputTokens, dayOutputTokens, pricing)
            monthlyCost += dayCost
          })
        }
        
        // Calculate cost for Serper queries on this day
        const dayQueries = dayData.queries || 0
        if (dayQueries > 0) {
          const queryCost = calculateSerperQueryCost(dayQueries)
          monthlyCost += queryCost
        }
      }
    })
    
    // Calculate overage (cost above free allocation — $7.50 for pro, $0 for free trial)
    const overage = Math.max(0, monthlyCost - FREE_MONTHLY_ALLOCATION)
    
    // Update user's monthly usage cost
    if (!user.monthlyUsageCost) {
      user.monthlyUsageCost = {}
    }
    if (!user.monthlyOverageBilled) {
      user.monthlyOverageBilled = {}
    }
    
    // Preserve higher existing monthlyUsageCost if it exists (in case usage data was reset)
    const existingCost = user.monthlyUsageCost[month] || 0
    if (existingCost > monthlyCost) {
      console.log(`[Billing] Preserving higher existing monthly cost: $${existingCost.toFixed(4)} > calculated: $${monthlyCost.toFixed(4)}`)
      monthlyCost = existingCost
    }
    user.monthlyUsageCost[month] = monthlyCost
    const alreadyBilled = user.monthlyOverageBilled[month] || 0
    
    // Only bill if there's overage and it hasn't been fully billed yet
    if (overage > 0 && alreadyBilled < overage) {
      const baseOverage = overage - alreadyBilled
      
      // Calculate amount to charge including Stripe fees (2.9% + $0.30)
      // Formula: We need to charge X such that after Stripe fee, we get baseOverage
      // Stripe fee = 0.029 * X + 0.30
      // We need: X - (0.029 * X + 0.30) = baseOverage
      // Solving: X - 0.029X - 0.30 = baseOverage
      //         0.971X = baseOverage + 0.30
      //         X = (baseOverage + 0.30) / 0.971
      const amountToBill = (baseOverage + 0.30) / 0.971
      
      // Round to 2 decimal places for display, then convert to cents for Stripe
      const amountToBillRounded = Math.round(amountToBill * 100) / 100
      const amountInCents = Math.round(amountToBillRounded * 100)
      
      // Calculate what Stripe will take as fee
      const stripeFee = (amountToBillRounded * 0.029) + 0.30
      const netAmount = amountToBillRounded - stripeFee
      
      console.log(`[Billing] Overage calculation for ${userId}:`)
      console.log(`  Base overage: $${baseOverage.toFixed(2)}`)
      console.log(`  Amount to charge: $${amountToBillRounded.toFixed(2)}`)
      console.log(`  Stripe fee (2.9% + $0.30): $${stripeFee.toFixed(2)}`)
      console.log(`  Net after fee: $${netAmount.toFixed(2)}`)
      
      // Create invoice item for overage (with fee markup included)
      await stripe.invoiceItems.create({
        customer: user.stripeCustomerId,
        amount: amountInCents, // Amount in cents
        currency: 'usd',
        description: `Overage usage for ${month} ($${monthlyCost.toFixed(2)} total - $${FREE_MONTHLY_ALLOCATION.toFixed(2)} included)`,
        metadata: {
          userId: userId,
          month: month,
          totalCost: monthlyCost.toFixed(2),
          freeAllocation: FREE_MONTHLY_ALLOCATION.toFixed(2),
          baseOverage: baseOverage.toFixed(2),
          amountCharged: amountToBillRounded.toFixed(2),
          stripeFee: stripeFee.toFixed(2),
        },
      })
      
      // Update billed amount
      user.monthlyOverageBilled[month] = overage
      writeUsers(users, userId)
      
      console.log(`[Billing] Billed $${amountToBill.toFixed(2)} overage for user ${userId} for ${month}`)
      return { overage, billed: true, amountBilled: amountToBill }
    }
    
    writeUsers(users, userId)
    return { overage, billed: false }
  } catch (error) {
    console.error(`[Billing] Error calculating overage for ${userId}:`, error)
    return { overage: 0, billed: false, error: error.message }
  }
}

// Stripe webhook handler for subscription events
app.post('/api/stripe/webhook', async (req, res) => {
  const sig = req.headers['stripe-signature']
  let event

  try {
    // Verify webhook signature
    if (STRIPE_WEBHOOK_SECRET) {
      event = stripe.webhooks.constructEvent(req.body, sig, STRIPE_WEBHOOK_SECRET)
    } else {
      // In development, you might skip verification (not recommended for production)
      console.warn('[Stripe] Webhook secret not set, skipping signature verification')
      event = JSON.parse(req.body.toString())
    }
  } catch (err) {
    console.error('[Stripe] Webhook signature verification failed:', err.message)
    return res.status(400).send(`Webhook Error: ${err.message}`)
  }

  try {
    const users = readUsers()

    // Handle the event
    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object
        const userId = session.metadata?.userId

        if (userId && users[userId]) {
          // Subscription will be activated via customer.subscription.created or updated
          console.log(`[Stripe] Checkout completed for user: ${userId}`)
        }
        break
      }

      case 'customer.subscription.created':
      case 'customer.subscription.updated': {
        const subscription = event.data.object
        const customerId = subscription.customer

        // Find user by customer ID
        const userId = Object.keys(users).find(
          (id) => users[id].stripeCustomerId === customerId
        )

        if (userId) {
          const user = users[userId]
          user.stripeSubscriptionId = subscription.id
          user.subscriptionStatus = subscription.status // 'active', 'canceled', 'past_due', etc.
          user.subscriptionRenewalDate = new Date(subscription.current_period_end * 1000).toISOString()
          if ((subscription.status === 'active' || subscription.status === 'trialing') && !user.subscriptionStartedDate) {
            user.subscriptionStartedDate = new Date().toISOString()
          }

          writeUsers(users, userId)
          console.log(`[Stripe] Subscription ${event.type} for user: ${userId}, status: ${subscription.status}`)
        }
        break
      }

      case 'customer.subscription.deleted': {
        const subscription = event.data.object
        const customerId = subscription.customer

        const userId = Object.keys(users).find(
          (id) => users[id].stripeCustomerId === customerId
        )

        if (userId) {
          const user = users[userId]
          // Only overwrite status if the user isn't already paused (paused is our own concept)
          if (user.subscriptionStatus !== 'paused') {
          user.subscriptionStatus = 'canceled'
          }
          // KEEP subscriptionRenewalDate if it exists so user retains access until paid period ends
          // Only set it from Stripe's data if we have it and it's in the future
          if (subscription.current_period_end) {
            const periodEnd = new Date(subscription.current_period_end * 1000)
            if (periodEnd > new Date()) {
              user.subscriptionRenewalDate = periodEnd.toISOString()
            }
            // If period already ended, leave existing renewalDate (it may already be set)
          }
          // Track cancellation in history
          if (!user.cancellationHistory) user.cancellationHistory = []
          user.cancellationHistory.push({
            date: new Date().toISOString(),
            reason: subscription.cancellation_details?.reason || 'subscription_deleted',
          })

          writeUsers(users, userId)
          console.log(`[Stripe] Subscription canceled for user: ${userId}, access until: ${user.subscriptionRenewalDate || 'none'}`)
        }
        break
      }

      case 'invoice.payment_succeeded': {
        const invoice = event.data.object
        const customerId = invoice.customer

        const userId = Object.keys(users).find(
          (id) => users[id].stripeCustomerId === customerId
        )

        if (userId && invoice.subscription) {
          const user = users[userId]
          // Update subscription end date on successful payment
          const subscription = await stripe.subscriptions.retrieve(invoice.subscription)
          user.subscriptionRenewalDate = new Date(subscription.current_period_end * 1000).toISOString()
          user.subscriptionStatus = subscription.status

          writeUsers(users, userId)
          console.log(`[Stripe] Payment succeeded for user: ${userId}`)
        }
        break
      }

      case 'invoice.payment_failed': {
        const invoice = event.data.object
        const customerId = invoice.customer

        const userId = Object.keys(users).find(
          (id) => users[id].stripeCustomerId === customerId
        )

        if (userId) {
          const user = users[userId]
          user.subscriptionStatus = 'past_due'

          writeUsers(users, userId)
          console.log(`[Stripe] Payment failed for user: ${userId}`)
        }
        break
      }

      case 'invoice.upcoming': {
        // This fires a few days before the invoice is finalized
        // Calculate and add overage billing for the previous billing period
        const invoice = event.data.object
        const customerId = invoice.customer
        const subscriptionId = invoice.subscription

        const userId = Object.keys(users).find(
          (id) => users[id].stripeCustomerId === customerId
        )

        if (userId && subscriptionId) {
          // Get the subscription to find the billing period
          try {
            const subscription = await stripe.subscriptions.retrieve(subscriptionId)
            const periodStart = new Date(subscription.current_period_start * 1000)
            const periodEnd = new Date(subscription.current_period_end * 1000)
            
            // Calculate month from period end (the month we're billing for)
            const billingMonth = `${periodEnd.getFullYear()}-${String(periodEnd.getMonth() + 1).padStart(2, '0')}`
            
            console.log(`[Billing] Invoice upcoming for user ${userId}, calculating overage for ${billingMonth}`)
            
            // Calculate and bill overage for the billing period
            const result = await calculateAndRecordOverage(userId, billingMonth)
            
            if (result.billed) {
              console.log(`[Billing] Added $${result.amountBilled.toFixed(2)} overage to upcoming invoice for user ${userId}`)
            }
          } catch (error) {
            console.error(`[Billing] Error processing invoice.upcoming for user ${userId}:`, error)
          }
        }
        break
      }

      case 'invoice.finalized': {
        // Invoice has been finalized - ensure overage was calculated
        const invoice = event.data.object
        const customerId = invoice.customer

        const userId = Object.keys(users).find(
          (id) => users[id].stripeCustomerId === customerId
        )

        if (userId && invoice.subscription) {
          try {
            const subscription = await stripe.subscriptions.retrieve(invoice.subscription)
            const periodEnd = new Date(subscription.current_period_end * 1000)
            const billingMonth = `${periodEnd.getFullYear()}-${String(periodEnd.getMonth() + 1).padStart(2, '0')}`
            
            // Double-check overage was calculated (in case invoice.upcoming was missed)
            const result = await calculateAndRecordOverage(userId, billingMonth)
            console.log(`[Billing] Invoice finalized for user ${userId}, overage check: $${result.overage.toFixed(2)}`)
          } catch (error) {
            console.error(`[Billing] Error processing invoice.finalized for user ${userId}:`, error)
          }
        }
        break
      }

      default:
        console.log(`[Stripe] Unhandled event type: ${event.type}`)
    }

    res.json({ received: true })
  } catch (error) {
    console.error('[Stripe] Error processing webhook:', error)
    res.status(500).json({ error: 'Webhook processing failed' })
  }
})

// ==================== END STRIPE ENDPOINTS ====================

// ============================================================================
// MONTHLY CLEANUP - Purge old daily usage data from cache
// ============================================================================
// Keeps the current month + previous month (for billing grace period).
// Deletes everything older from the in-memory cache (which syncs to usage_data in MongoDB).

const cleanupOldDailyUsage = async () => {
  try {
    const now = new Date()
    const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
    
    // Calculate previous month
    const prevDate = new Date(now.getFullYear(), now.getMonth() - 1, 1)
    const previousMonth = `${prevDate.getFullYear()}-${String(prevDate.getMonth() + 1).padStart(2, '0')}`
    
    console.log(`[Cleanup] Running daily usage cleanup. Keeping months: ${previousMonth}, ${currentMonth}`)
    
    // Clean in-memory cache: remove old months from each user's dailyUsage
    let cacheMonthsRemoved = 0
    for (const userId of Object.keys(usageCache)) {
      const userUsage = usageCache[userId]
      let userRemoved = 0
      if (userUsage?.dailyUsage) {
        for (const month of Object.keys(userUsage.dailyUsage)) {
          if (month < previousMonth) {
            delete userUsage.dailyUsage[month]
            cacheMonthsRemoved++
            userRemoved++
          }
        }
        // Mark dirty so the cleaned cache gets synced to MongoDB usage_data collection
        if (userRemoved > 0) {
          scheduleUsageSync(userId)
        }
      }
    }
    
    console.log(`[Cleanup] Done. Removed ${cacheMonthsRemoved} old month entries from cache (synced to usage_data in MongoDB).`)
  } catch (error) {
    console.error('[Cleanup] Error during daily usage cleanup:', error.message)
  }
}

// ============================================================================
// SERVERLESS INITIALIZATION (Vercel)
// ============================================================================
let _serverlessInitialized = false

export const initializeForServerless = async () => {
  if (_serverlessInitialized) return
  _serverlessInitialized = true
  console.log(`[Server] 🚀 Initializing serverless (version: ${SERVER_VERSION})`)
  await initDatabase()
  console.log('[Server] Loading data from MongoDB...')
  await loadCacheFromMongoDB()
  await cleanupOldDailyUsage()
  console.log(`[Server] ✅ Serverless initialization complete (${Object.keys(usersCache).length} users in cache)`)
}

// Export Express app for Vercel serverless functions
export default app

// ============================================================================
// LOCAL SERVER STARTUP (only when NOT running on Vercel)
// ============================================================================
if (!process.env.VERCEL) {
  const startServer = async () => {
    // Initialize database connection
    await initDatabase()
    
    // Load cache from MongoDB
    console.log('[Server] Loading data from MongoDB...')
    await loadCacheFromMongoDB()
    
    // Run cleanup once on startup, then schedule daily (every 24 hours)
    await cleanupOldDailyUsage()
    setInterval(cleanupOldDailyUsage, 24 * 60 * 60 * 1000) // Run every 24 hours
    console.log('[Server] 🗑️  Daily usage cleanup scheduled (runs every 24h)')
    
    // Periodic background flush: guarantee all dirty cache data reaches MongoDB
    // even under continuous load (where the 2s debounce timer keeps resetting).
    setInterval(() => {
      if (usageDirtyUsers.size > 0) {
        flushUsageToMongo().catch(err => console.error('[Periodic Flush] Error:', err.message))
      }
    }, 30000) // Every 30 seconds
    console.log('[Server] 💾 Periodic MongoDB flush scheduled (every 30s)')
    
    // Serve static files from the React app build
    app.use(express.static(path.join(__dirname, 'dist')))
    
    // Catch-all handler: send back React's index.html file for client-side routing
    // This must be AFTER all API routes
    app.get('*', (req, res) => {
      // Don't serve index.html for API routes
      if (req.path.startsWith('/api/')) {
        return res.status(404).json({ error: 'API endpoint not found' })
      }
      res.sendFile(path.join(__dirname, 'dist', 'index.html'))
    })
    
    // Start HTTP server
    app.listen(PORT, () => {
      console.log('')
      console.log('═══════════════════════════════════════════════════')
      console.log(`🚀 ARKTEK Fullstack Server - http://localhost:${PORT}`)
      console.log('═══════════════════════════════════════════════════')
      console.log(`🌐 Frontend:           Serving from /dist`)
      console.log(`📡 LLM API Proxy:     Ready`)
      console.log(`🔍 Serper Search:     Ready`)
      console.log(`🗄️  Arkitek DB:       Connected (Primary Store)`)
      console.log(`🛡️  ADMIN DB:         Connected (Admin/Expenses)`)
      console.log(`👑 Admin Endpoints:   Ready`)
      console.log(`🏆 Leaderboard:       Ready`)
      console.log(`🗑️  Cleanup:          Scheduled (daily)`)
      console.log('═══════════════════════════════════════════════════')
      console.log('')
    })
  }

  startServer().catch(error => {
    console.error('[Server] Failed to start:', error)
    process.exit(1)
  })
}


