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
const getCurrentDateString = () => {
  const now = new Date()
  const options = { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' }
  return now.toLocaleDateString('en-US', options) // e.g. "Wednesday, February 12, 2026"
}
const getCurrentMonthYear = () => {
  const now = new Date()
  return `${now.toLocaleString('en-US', { month: 'long' })} ${now.getFullYear()}` // e.g. "February 2026"
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
  } catch (error) {
    console.error('[Server] ❌ MongoDB connection failed:', error.message)
    console.error('[Server] Cannot start without database connection')
    process.exit(1) // Exit if MongoDB fails - no fallback
  }
}

// Graceful shutdown — flush all pending data to MongoDB before closing
process.on('SIGINT', async () => {
  console.log('\n[Server] Shutting down gracefully...')
  if (usageSyncTimer) clearTimeout(usageSyncTimer)
  await flushUsageToMongo()
  await db.close()
  await adminDb.close()
  process.exit(0)
})

process.on('SIGTERM', async () => {
  console.log('\n[Server] Received SIGTERM, shutting down...')
  if (usageSyncTimer) clearTimeout(usageSyncTimer)
  await flushUsageToMongo()
  await db.close()
  await adminDb.close()
  process.exit(0)
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

const scheduleUsageSync = (userId) => {
  if (userId) usageDirtyUsers.add(userId)
  if (usageSyncTimer) clearTimeout(usageSyncTimer)
  usageSyncTimer = setTimeout(() => flushUsageToMongo(), 2000)
}

const flushUsageToMongo = async () => {
  if (usageDirtyUsers.size === 0) return
  const usersToSync = [...usageDirtyUsers]
  usageDirtyUsers.clear()
  
  try {
    const dbInstance = await db.getDb()
    const collection = dbInstance.collection('usage_data')
    for (const userId of usersToSync) {
      if (!usageCache[userId]) continue
      
      // IMPORTANT: Exclude totalTokens and monthlyUsage from $set entirely.
      // totalTokens and monthlyUsage.*.tokens are managed EXCLUSIVELY by the
      // POST /api/stats/token-update endpoint using atomic MongoDB $inc.
      //
      // Previously, we stripped .tokens from monthlyUsage entries but still $set
      // the entire monthlyUsage object. This REPLACED the whole field in MongoDB,
      // which DELETED the $inc'd tokens value. Now we use dot-notation $set for
      // each monthlyUsage sub-field so the tokens field is left untouched.
      const { totalTokens: _tt, monthlyUsage: _mu, ...cacheWithoutManagedFields } = usageCache[userId]
      
      // Build dot-notation updates for monthlyUsage sub-fields (excluding .tokens)
      const monthlyDotUpdates = {}
      if (_mu) {
        for (const [month, data] of Object.entries(_mu)) {
          if (!data) continue
          const { tokens: _mt, ...monthWithoutTokens } = data
          // Set each non-tokens field individually via dot notation
          for (const [field, value] of Object.entries(monthWithoutTokens)) {
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
      }},
      { upsert: true }
    )
  } catch (error) {
    console.error(`[Users Sync] Failed for ${userId}:`, error.message)
  }
}

// --- User Stats sync (writes costs, stats, overage to 'user_stats' collection) ---
const syncUserStatsToMongo = async (userId) => {
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
    
    // 1. Load all users (profile + subscription + purchasedCredits only)
    const allUsers = await dbInstance.collection('users').find({}).toArray()
    for (const user of allUsers) {
      usersCache[user._id] = {
        id: user._id,
        firstName: user.firstName,
        lastName: user.lastName,
        username: user.username,
        email: user.email,
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
    const allUsage = await dbInstance.collection('usage_data').find({}).toArray()
    for (const doc of allUsage) {
      const { _id, updatedAt, ...data } = doc
      usageCache[_id] = data
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

const readUsage = () => {
  return usageCache
}

const writeUsage = (usage, changedUserId = null) => {
  // Mark dirty users for MongoDB sync
  // NOTE: callers modify usageCache in-place via readUsage() reference,
  // so reference equality (usage[id] !== usageCache[id]) won't detect changes.
  // If a specific userId was provided, only mark that one dirty.
  // Otherwise mark all users (safe fallback for in-place mutations).
  if (changedUserId) {
    usageDirtyUsers.add(changedUserId)
  } else {
    for (const userId of Object.keys(usage)) {
      usageDirtyUsers.add(userId)
  }
}
  usageCache = usage
  
  if (process.env.VERCEL) {
    // On Vercel serverless: flush immediately (fire-and-forget).
    // The 2-second debounced timer NEVER fires because Vercel freezes the instance
    // after each response is sent. This causes token data to be lost between requests.
    // Multiple concurrent flushes are safe — flushUsageToMongo clears the dirty set
    // atomically and writes the latest cache state.
    flushUsageToMongo().catch(err => console.error('[Usage Sync] Vercel immediate flush failed:', err.message))
  } else {
    // On traditional server: debounce for efficiency (batches rapid writes)
    if (usageSyncTimer) clearTimeout(usageSyncTimer)
    usageSyncTimer = setTimeout(() => flushUsageToMongo(), 2000)
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

// Get a user's stored timezone from the users cache
const getUserTimezone = (userId) => {
  const users = readUsers()
  return users[userId]?.timezone || null
}

// Track a prompt submission (one per user submission, regardless of models called)
const trackPrompt = (userId, promptText, category, promptData = {}) => {
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

  // Update streak
  if (userUsage.lastActiveAt) {
    const lastDate = new Date(userUsage.lastActiveAt)
    const todayDate = new Date(today)
    const diffTime = todayDate - lastDate
    const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24))
    
    if (diffDays === 0) {
      // Same day, streak continues
      // No change needed
    } else if (diffDays === 1) {
      // Consecutive day, increment streak
      userUsage.streakDays = (userUsage.streakDays || 0) + 1
    } else {
      // Streak broken, reset to 1
      userUsage.streakDays = 1
    }
  } else {
    // First time, start streak at 1
    userUsage.streakDays = 1
  }
  const activeDate = new Date().toISOString()
  userUsage.lastActiveAt = today

  writeUsage(usage, userId)
  
  // Also update users cache with last active date
  const users = readUsers()
  if (users[userId]) {
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
const trackConversationPrompt = (userId, userMessage) => {
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
  
  // Count 1 prompt for this conversation follow-up
  userUsage.totalPrompts = (userUsage.totalPrompts || 0) + 1
  userUsage.monthlyUsage[currentMonth].prompts += 1
  console.log(`[Conversation Prompt] User ${userId}: Prompts -> ${userUsage.totalPrompts}, Monthly -> ${userUsage.monthlyUsage[currentMonth].prompts}`)
  
  // NOTE: User's typed conversation message tokens are NOT counted here anymore.
  // They are included in the full inputTokens counted by trackUsage() (which now counts input + output).
  // Adding them here would cause double-counting since the API's input token count already includes the user message.
  
  writeUsage(usage, userId)
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
  //
  // NOTE: totalTokens and monthlyUsage.tokens are NOT updated here.
  // They are updated ONCE per prompt via POST /api/stats/token-update, using the EXACT
  // token total from the frontend's Token Usage Window. This avoids all the cache/flush/
  // multi-instance issues on Vercel serverless. The frontend is the single source of truth
  // for the user-visible token counter.
  if (!isPipeline) {
    // Track granular input/output for per-model breakdown (not used for the main counter)
    userUsage.totalInputTokens = (userUsage.totalInputTokens || 0) + inputTokens
    userUsage.totalOutputTokens = (userUsage.totalOutputTokens || 0) + outputTokens

    // Ensure monthly sub-object exists (needed for prompts counter and per-model monthly stats)
    if (!userUsage.monthlyUsage[currentMonth]) {
      userUsage.monthlyUsage[currentMonth] = { tokens: 0, inputTokens: 0, outputTokens: 0, queries: 0, prompts: 0 }
    }
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
  
  // Usage is tracked in the in-memory cache (flushed to usage_data collection).
  // No separate MongoDB tracking needed — usage_data is the single source of truth.
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

// JSON parsing for all other routes
app.use(express.json())

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
    
    // Update cache (keyed by _id) — always ensure user is in cache after login
    const users = readUsers()
    if (!users[userId]) {
      // User exists in MongoDB but not in cache — populate cache from DB record
      users[userId] = {
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
        lastActiveAt: loginDate.toISOString(),
        monthlyUsageCost: dbUser.monthlyUsageCost || {},
        monthlyOverageBilled: dbUser.monthlyOverageBilled || {},
        plan: dbUser.plan || null,
        emailVerified: dbUser.emailVerified || false,
        timezone: timezone || dbUser.timezone || null,
        signupIp: dbUser.signupIp || null,
        deviceFingerprint: dbUser.deviceFingerprint || null,
      }
      console.log('[Auth] Added missing user to cache:', userId)
    } else {
      users[userId].lastActiveAt = loginDate.toISOString()
      if (timezone) users[userId].timezone = timezone
    }
    usersCache = users
    
    const usage = readUsage()
    if (!usage[userId]) {
      // Initialize empty usage cache for user
      usage[userId] = {
        totalTokens: 0, totalInputTokens: 0, totalOutputTokens: 0,
        totalQueries: 0, totalPrompts: 0,
        monthlyUsage: {}, dailyUsage: {},
        providers: {}, models: {},
        promptHistory: [], categories: {}, categoryPrompts: {},
        ratings: {}, lastActiveAt: loginDate.toISOString(),
        streakDays: 0, judgeConversationContext: [],
        purchasedCredits: { total: 0, remaining: 0 },
      }
    } else {
      usage[userId].lastActiveAt = loginDate.toISOString()
    }
    usageCache = usage
    
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

    // Update last active
    const loginDate = new Date()
    await db.users.update(userId, { lastActiveAt: loginDate })

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

    const { promptText, category, responses, summary, facts, sources } = req.body
    console.log('[Prompt Tracking] Received prompt tracking request for user:', userId, 'category:', category)
    console.log('[Prompt Tracking] Additional data:', {
      hasResponses: !!responses,
      responseCount: responses?.length || 0,
      hasSummary: !!summary,
      hasFacts: !!facts,
      factsCount: facts?.length || 0,
      hasSources: !!sources,
      sourcesCount: sources?.length || 0,
    })
    trackPrompt(userId, promptText, category, { responses, summary, facts, sources })
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

// Update the user-visible token counter with the EXACT total from the frontend's Token Usage Window.
// This is the ONLY place totalTokens and monthlyUsage.tokens are incremented.
// Called once per prompt, after all models (including judge/summary) have responded.
// Uses MongoDB $inc for atomic updates — no cache/flush race conditions on Vercel serverless.
app.post('/api/stats/token-update', async (req, res) => {
  try {
    const { userId, promptTokens } = req.body
    if (!userId || promptTokens === undefined) {
      return res.status(400).json({ error: 'userId and promptTokens are required' })
    }
    
    const tokens = Math.max(0, Math.round(promptTokens)) // Ensure non-negative integer
    if (tokens === 0) {
      return res.json({ success: true, message: 'No tokens to add' })
    }
    
    const tz = getUserTimezone(userId)
    const currentMonth = getMonthForUser(tz)
    
    // 1. Atomic MongoDB update using $inc (no race conditions, no stale cache issues)
    const dbInstance = await db.getDb()
    await dbInstance.collection('usage_data').updateOne(
      { _id: userId },
      { 
        $inc: { 
          totalTokens: tokens,
          [`monthlyUsage.${currentMonth}.tokens`]: tokens
        },
        $set: { updatedAt: new Date() }
      },
      { upsert: true }
    )
    
    // 2. Also update the in-memory cache so same-instance reads are consistent
    const usage = readUsage()
    if (usage[userId]) {
      usage[userId].totalTokens = (usage[userId].totalTokens || 0) + tokens
      if (!usage[userId].monthlyUsage) usage[userId].monthlyUsage = {}
      if (!usage[userId].monthlyUsage[currentMonth]) {
        usage[userId].monthlyUsage[currentMonth] = { tokens: 0, inputTokens: 0, outputTokens: 0, queries: 0, prompts: 0 }
      }
      usage[userId].monthlyUsage[currentMonth].tokens = (usage[userId].monthlyUsage[currentMonth].tokens || 0) + tokens
    }
    
    console.log(`[Token Update] User ${userId}: +${tokens} tokens (total: ${usage[userId]?.totalTokens || '?'}, month: ${usage[userId]?.monthlyUsage?.[currentMonth]?.tokens || '?'})`)
    
    res.json({ success: true, tokens, totalTokens: usage[userId]?.totalTokens || 0 })
  } catch (error) {
    console.error('[Token Update] Error:', error.message)
    res.status(500).json({ error: 'Failed to update token counter' })
  }
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

    // Delete user and ALL associated data from MongoDB (covers every collection)
    await db.users.delete(userId)
    console.log('[Account Deletion] User and all data deleted from MongoDB:', userId, userInfo)

    // Clear from cache
    delete usersCache[userId]
    delete usageCache[userId]

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
app.get('/api/user/model-preferences/:userId', (req, res) => {
  try {
    const { userId } = req.params
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
  
  // Use user's timezone for date calculations
  const tz = getUserTimezone(userId)
  
  // Read totalTokens and monthlyUsage.tokens DIRECTLY from MongoDB.
  // These are managed by atomic $inc in /api/stats/token-update and must not
  // come from the in-memory cache (which could be stale on a different Vercel instance).
  let mongoTotalTokens = null
  let mongoMonthlyTokens = null
  try {
    const dbInstance = await db.getDb()
    const mongoDoc = await dbInstance.collection('usage_data').findOne({ _id: userId })
    if (mongoDoc) {
      mongoTotalTokens = mongoDoc.totalTokens || 0
      const currentMonthKey = getMonthForUser(tz)
      mongoMonthlyTokens = mongoDoc.monthlyUsage?.[currentMonthKey]?.tokens || 0
    }
  } catch (err) {
    console.error('[Stats] MongoDB direct read failed:', err.message)
  }
  
  const usage = readUsage()
  const users = readUsers()
  
  // Ensure userUsage has totalPrompts field (migration for existing users)
  if (usage[userId] && usage[userId].totalPrompts === undefined) {
    usage[userId].totalPrompts = 0
    // Also ensure monthlyUsage has prompts field
    Object.keys(usage[userId].monthlyUsage || {}).forEach(month => {
      if (usage[userId].monthlyUsage[month].prompts === undefined) {
        usage[userId].monthlyUsage[month].prompts = 0
      }
    })
    writeUsage(usage)
  }
  
  const userUsage = {
    totalTokens: 0,
    totalInputTokens: 0,
    totalOutputTokens: 0,
    totalQueries: 0,
    totalPrompts: 0,
    monthlyUsage: {},
    providers: {},
    models: {},
    dailyUsage: {},
    ...(usage[userId] || {}),
  }

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
  const user = users[userId]
  const createdAt = user?.createdAt || null

  // Calculate monthly cost and remaining free allocation
  const FREE_MONTHLY_ALLOCATION = 7.50 // $7.50 per month included in subscription
  
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
  
  // If the calculated cost is higher than cached, update the cache for future consistency
  if (calculatedMonthlyCost > cachedMonthlyCost && user) {
    if (!user.monthlyUsageCost) user.monthlyUsageCost = {}
    user.monthlyUsageCost[currentMonth] = calculatedMonthlyCost
    writeUsers(users, userId)
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
      writeUsage(usage)
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
      
      // Calculate percentage of $7.50 allocation used on this day
      const dayPercentage = (dayCost / FREE_MONTHLY_ALLOCATION) * 100
      
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

  // Use MongoDB values for totalTokens/monthlyTokens (updated atomically via $inc).
  // Fall back to cache values if MongoDB read failed, using Math.max for safety.
  const cacheTotalTokens = userUsage.totalTokens || 0
  const totalTokens = mongoTotalTokens !== null ? Math.max(mongoTotalTokens, cacheTotalTokens) : cacheTotalTokens
  const cacheMonthlyTokens = monthlyStats.tokens || 0
  const monthlyTokens = mongoMonthlyTokens !== null ? Math.max(mongoMonthlyTokens, cacheMonthlyTokens) : cacheMonthlyTokens

  // Note: Query costs ($0.001/query) are included in monthlyCost but not exposed to users
  res.json({
    totalTokens: totalTokens,
    totalInputTokens: userUsage.totalInputTokens || 0,
    totalOutputTokens: userUsage.totalOutputTokens || 0,
    totalPrompts: userUsage.totalPrompts || 0,
    monthlyTokens: monthlyTokens,
    monthlyInputTokens: monthlyStats.inputTokens || 0,
    monthlyOutputTokens: monthlyStats.outputTokens || 0,
    monthlyPrompts: monthlyStats.prompts || 0,
    monthlyCost: roundCents(monthlyCost),
    remainingFreeAllocation: roundCents(remainingFreeAllocation),
    freeUsagePercentage: Math.round(freeUsagePercentage * 100) / 100,
    totalAvailableBalance: roundCents(totalAvailableBalance),
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
app.get('/api/stats/:userId/history', (req, res) => {
  const { userId } = req.params
  const usage = readUsage()
  const userUsage = usage[userId] || {}
  const promptHistory = userUsage.promptHistory || []
  // Return last 10 prompts
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
  const todayDate = getCurrentDateString()
  const categoryPrompt = `Today's date is ${todayDate}.

Classify the user prompt into EXACTLY ONE category from the list below.
Determine if a web search would genuinely help answer the query.

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

Output ONLY this JSON:
{
  "category": "CategoryName",
  "needsSearch": false
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
      category = parsed.category || 'General Knowledge/Other'
    } catch (parseError) {
      // Fallback: check for keywords
      needsSearch = lowerResponse.includes('"needsSearch":true') || 
                   lowerResponse.includes('needsSearch: true') ||
                   (lowerResponse.includes('yes') && (lowerResponse.includes('search') || lowerResponse.includes('web')))
      
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

    return { category, needsSearch }
  } catch (error) {
    console.error('[Category Detection] Error:', error)
    return { category: 'General Knowledge/Other', needsSearch: false }
  }
}

// Quick endpoint to check if a query needs web search (for showing search indicator)
app.post('/api/detect-search-needed', async (req, res) => {
  try {
    const { query, userId } = req.body
    
    if (!query) {
      return res.status(400).json({ error: 'query is required' })
    }
    
    const { category, needsSearch } = await detectCategoryForJudge(query, userId)
    
    res.json({ 
      needsSearch, 
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
    const { category, needsSearch } = await detectCategoryForJudge(userMessage, userId)
    console.log(`[Judge Conversation] Category: ${category}, Needs Search: ${needsSearch}`)
    
    // Get last 5 summaries from context — use frontend-provided context only if non-empty
    const usage = readUsage()
    const contextSummaries = (conversationContext && conversationContext.length > 0)
      ? conversationContext
      : (usage[userId]?.judgeConversationContext || []).slice(0, 5)
    
    // Build context string with the user's recent conversation history
    // Position 0 is full response (most recent, highest priority), positions 1-4 are summarized
    let contextString = ''
    if (contextSummaries.length > 0) {
      contextString = `Here is context from your recent conversation with this user (most recent first — prioritize the latest context):\n\n${contextSummaries.map((ctx, idx) => {
          const promptPart = ctx.originalPrompt ? `User asked: ${ctx.originalPrompt}\n` : ''
          const responsePart = ctx.isFull && ctx.response 
            ? `Your response: ${ctx.response}`
            : `Your response (summary): ${ctx.summary}`
          return `${idx + 1}. ${promptPart}${responsePart}`
        }).join('\n\n')}\n\n`
    } else if (originalSummaryText && originalSummaryText.trim()) {
      contextString = `Your previous summary response that the user wants to continue discussing:\n${originalSummaryText.substring(0, 3000)}${originalSummaryText.length > 3000 ? '...' : ''}\n\n`
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
          const serperData = await performSerperSearch(userMessage, 5)
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
    const todayDate = getCurrentDateString()
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
    trackConversationPrompt(userId, userMessage)
    
    // Flush to MongoDB immediately (Vercel serverless may freeze before debounced timer fires)
    flushUsageToMongo().catch(err => console.error('[Judge Conversation] Flush failed:', err.message))
    
    // Summarize the response and store it (async, don't wait) - pass just the user message as originalPrompt
    storeJudgeContext(userId, responseText, userMessage).catch(err => {
      console.error('[Judge Conversation] Error storing context:', err)
    })
    
    // Build debug data for frontend (same structure as main RAG pipeline)
    const debugData = needsSearch ? {
      search: {
        query: userMessage,
        results: searchResults
      },
      refiner: null, // No refiner — models read raw sources directly
      categoryDetection: {
        category: category,
        needsSearch: needsSearch
      }
    } : null
    
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
    const { category, needsSearch } = await detectCategoryForJudge(userMessage, userId)
    console.log(`[Judge Conversation Stream] Category: ${category}, Needs Search: ${needsSearch}`)

    // Get context summaries — use frontend-provided context only if non-empty, otherwise fall back to server-stored context
    const usage = readUsage()
    const contextSummaries = (conversationContext && conversationContext.length > 0)
      ? conversationContext
      : (usage[userId]?.judgeConversationContext || []).slice(0, 5)
    
    let contextString = ''
    if (contextSummaries.length > 0) {
      // Build context with newest first (index 0 = most recent, highest priority)
      contextString = `Here is context from your recent conversation with this user (most recent first — prioritize the latest context):\n\n${contextSummaries.map((ctx, idx) => {
          const promptPart = ctx.originalPrompt ? `User asked: ${ctx.originalPrompt}\n` : ''
          const responsePart = ctx.isFull && ctx.response
            ? `Your response: ${ctx.response}`
            : `Your response (summary): ${ctx.summary}`
          return `${idx + 1}. ${promptPart}${responsePart}`
        }).join('\n\n')}\n\n`
    } else if (originalSummaryText && originalSummaryText.trim()) {
      // Fallback: use the original summary text when no stored context exists yet
      contextString = `Your previous summary response that the user wants to continue discussing:\n${originalSummaryText.substring(0, 3000)}${originalSummaryText.length > 3000 ? '...' : ''}\n\n`
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
          const serperData = await performSerperSearch(userMessage, 5)
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
    const todayDate = getCurrentDateString()
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
    const systemPrefix = 'You are a helpful conversational AI assistant. Respond directly and naturally to the user\'s follow-up questions. Do NOT format your response as a council summary — no CONSENSUS, SUMMARY, AGREEMENTS, or DISAGREEMENTS sections. Just answer conversationally as a single assistant. Use the conversation context provided to maintain continuity.\n\n'

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
    trackConversationPrompt(userId, userMessage)

    // Flush to MongoDB immediately (Vercel serverless may freeze before debounced timer fires)
    flushUsageToMongo().catch(err => console.error('[Judge Conversation Stream] Flush failed:', err.message))

    // Store context async
    storeJudgeContext(userId, fullResponse, userMessage).catch(err => {
      console.error('[Judge Conversation Stream] Error storing context:', err)
    })

    // Build debug data
    const debugData = needsSearch ? {
      search: { query: userMessage, results: searchResults },
      refiner: null, // No refiner — models read raw sources directly
      categoryDetection: { category, needsSearch }
    } : null

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
    const { category, needsSearch } = await detectCategoryForJudge(userMessage, userId)
    console.log(`[Model Conversation Stream] Category: ${category}, Needs Search: ${needsSearch}`)

    // Step 2: Search + scrape raw sources (no refiner)
    let rawSourcesData = null
    let searchResults = []

    if (needsSearch) {
      sendSSE('status', { message: 'Searching the web...' })
      const serperApiKey = API_KEYS.serper
      if (serperApiKey) {
        try {
          const serperData = await performSerperSearch(userMessage, 5)
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

    // Step 3: Build prompt (same as non-streaming)
    const usageData = readUsage()
    const userUsage = usageData[userId] || {}
    const allModelContexts = userUsage.modelConversationContext || {}
    const contextSummaries = (allModelContexts[modelName] || []).slice(0, 5)

    let prompt = `Today's date is ${getCurrentDateString()}. You have access to real-time web search — when source content is provided below, read and parse it yourself to answer the user's question. Do NOT tell the user you cannot search the web or ask them for permission. The search has already been performed for you and the source content is included in this prompt. Answer confidently using the provided data.\n\n`

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
      prompt += `Your previous response that the user wants to continue discussing:\n${originalResponse.substring(0, 2000)}${originalResponse.length > 2000 ? '...' : ''}\n\n`
    }

    if (rawSourcesData && rawSourcesData.sourceCount > 0) {
      prompt += `Here is raw content from recent web sources that may help answer the user's question:\n\n${rawSourcesData.formatted}\n\n`
    }

    prompt += `User: ${userMessage}`

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
    trackConversationPrompt(userId, userMessage)

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
    const { category, needsSearch } = await detectCategoryForJudge(userMessage, userId)
    console.log(`[Model Conversation] Category: ${category}, Needs Search: ${needsSearch}`)
    
    // Step 2: If search is needed, run search + refiner pipeline
    let rawSourcesData = null
    let searchResults = []
    
    if (needsSearch) {
      console.log(`[Model Conversation] Search needed for ${modelName}, fetching raw sources...`)
      
      const serperApiKey = API_KEYS.serper
      if (serperApiKey) {
        try {
          const serperData = await performSerperSearch(userMessage, 5)
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
    
    // Step 3: Get conversation context from server-side storage
    const usage = readUsage()
    const userUsage = usage[userId] || {}
    const allModelContexts = userUsage.modelConversationContext || {}
    const contextSummaries = (allModelContexts[modelName] || []).slice(0, 5)
    
    // Build context string from server-stored context (position 0 = full, 1-4 = summarized)
    let prompt = `Today's date is ${getCurrentDateString()}. You have access to real-time web search — when source content is provided below, read and parse it yourself to answer the user's question. Do NOT tell the user you cannot search the web or ask them for permission. The search has already been performed for you and the source content is included in this prompt. Answer confidently using the provided data.\n\n`
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
    trackConversationPrompt(userId, userMessage)
    
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
app.get('/api/stats/:userId/categories', (req, res) => {
  const { userId } = req.params
  const usage = readUsage()
  const userUsage = usage[userId] || {}
  
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
app.get('/api/stats/:userId/ratings', (req, res) => {
  const { userId } = req.params
  const usage = readUsage()
  const userUsage = usage[userId] || {}
  res.json({ ratings: userUsage.ratings || {} })
})

// Get streak info
app.get('/api/stats/:userId/streak', (req, res) => {
  const { userId } = req.params
  const usage = readUsage()
  const userUsage = usage[userId] || {}
  res.json({ 
    streakDays: userUsage.streakDays || 0,
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
const checkSubscriptionStatus = (userId) => {
  if (!userId) {
    console.log('[Subscription Check] No user ID provided')
    return { hasAccess: false, reason: 'No user ID provided' }
  }

  // Admins always have access regardless of subscription status
  if (isAdmin(userId)) {
    console.log(`[Subscription Check] Admin bypass for user ${userId}`)
    return { hasAccess: true }
  }

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
  const result = checkSubscriptionStatus(userId)
  
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

  const { provider, model, prompt, userId, isSummary } = req.body || {}

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

      const streamResponse = await axios.post(
        `${baseUrls[provider]}/chat/completions`,
        {
          model: mappedModel,
          messages: [{ role: 'user', content: prompt }],
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

      const streamResponse = await axios.post(
        `${baseUrl}/models/${mappedModel}:streamGenerateContent?key=${apiKey}&alt=sse`,
        {
          contents: [{ parts: [{ text: prompt }] }],
        },
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
      // Filter out empty paragraphs and take first 5
      const validParagraphs = paragraphs.filter(p => p.length > 20).slice(0, 5)
      content = validParagraphs.join(' ')
      
      // If we didn't get enough paragraphs from <p> tags, fallback to text extraction
      if (content.length < 200) {
        content = mainContent.first().text()
      }
    } else {
      // Fallback to body text - try to extract paragraphs
      const paragraphs = $('body p').map((i, el) => $(el).text().trim()).get()
      const validParagraphs = paragraphs.filter(p => p.length > 20).slice(0, 5)
      content = validParagraphs.join(' ')
      
      // If we didn't get enough paragraphs, fallback to body text
      if (content.length < 200) {
        content = $('body').text()
      }
    }
    
    // Clean up: remove extra whitespace
    content = content.replace(/\s+/g, ' ').trim()
    
    // If content is still very long, split by sentences and take first portion
    // This ensures we get roughly 5 paragraphs worth of content
    if (content.length > 2000) {
      // Split by sentence endings and take approximately first 5 paragraphs worth
      const sentences = content.match(/[^.!?]+[.!?]+/g) || [content]
      const firstSentences = sentences.slice(0, 15).join(' ') // ~5 paragraphs = ~15 sentences
      if (firstSentences.length > 2000) {
        content = firstSentences.substring(0, 2000) + '...'
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
// Scrapes up to maxParseableSources, caps each at 2000 chars, returns a clean numbered block
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
  
  const judgePrompt = `Today's date is ${getCurrentDateString()}. You are a judge analyzing responses from multiple AI models.

Original User Query: "${query}"

Council Model Responses:
${responsesText}

RESPOND WITH EXACTLY THESE 4 SECTIONS IN THIS EXACT FORMAT:

CONSENSUS: [number]%

SUMMARY:
[Write a comprehensive summary of what the council collectively determined. Use the model names exactly as shown above (ChatGPT, Claude, Gemini, Grok, etc.) when attributing statements like "Gemini states...", "ChatGPT and Claude agree that...". Include source citations from the models like [source 2] if they cited sources.]

AGREEMENTS:
- [First specific point all/most models agree on - name which models]
- [Second point they agree on - name which models]
- [Third point of agreement - name which models]
(THIS SECTION IS MANDATORY! List at least 3-5 specific agreement points. NEVER write "None identified" unless models literally contradict each other on everything.)

DISAGREEMENTS:
- [First difference between models - explain]
- [Second difference between models - explain]
(THIS SECTION IS MANDATORY! Look for: outright contradictions, different emphasis or focus areas, different levels of detail, different examples or evidence cited, different tone (optimistic vs pessimistic), topics covered by one model but omitted by another, or different framing of the same issue. You MUST list at least 2-3 differences — even when models broadly agree, they almost always differ in emphasis, specificity, or framing. Only write "None identified." if the responses are virtually identical word-for-word.)`



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
    const agreementsMatch = content.match(/(?:^|\n)\s*(?:\d+\.\s*)?(?:LIST\s+)?(?:\*\*)?AGREEMENTS(?:\*\*)?[:\-]?(?:\s*-[^\n]*)?\s*\n?([\s\S]+?)(?=(?:^|\n)\s*(?:\d+\.\s*)?(?:\*\*)?DISAGREEMENTS|$)/im)
    const disagreementsMatch = content.match(/(?:^|\n)\s*(?:\d+\.\s*)?(?:\*\*)?DISAGREEMENTS(?:\*\*)?[:\-]?\s*\n?([\s\S]+)$/im)
    
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
      hasDisagreements: !!disagreementsMatch
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
      .replace(/[-•]\s*(?:\d+\.\s*)?(?:LIST\s+)?\*?\*?AGREEMENTS\*?\*?[:\-]?\s*[\s\S]*?(?=[-•]\s*(?:\d+\.\s*)?\*?\*?DISAGREEMENTS|$)/gi, '')
      .replace(/(?:\d+\.\s*)?(?:LIST\s+)?\*?\*?AGREEMENTS\*?\*?[:\-]?\s*[\s\S]*?(?=(?:\d+\.\s*)?\*?\*?DISAGREEMENTS|$)/gi, '')
      // Remove embedded DISAGREEMENTS sections
      .replace(/[-•]\s*(?:\d+\.\s*)?\*?\*?DISAGREEMENTS\*?\*?[:\-]?\s*[\s\S]*/gi, '')
      .replace(/(?:\d+\.\s*)?\*?\*?DISAGREEMENTS\*?\*?[:\-]?\s*[\s\S]*/gi, '')
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
                                    l.toLowerCase().includes('write "none') ||
                                    l.toLowerCase().includes('this section is mandatory') ||
                                    l.toLowerCase().includes('look for:') ||
                                    l.toLowerCase().includes('you must list') ||
                                    l.toLowerCase().includes('only write "none')
          const isEmpty = !l || l.length < 5
          const isNone = l.toLowerCase() === 'none identified' || l.toLowerCase() === 'none identified.'
          const isGarbage = l.match(/^\*+:?$/) || l.match(/^\(.*\)$/)
          return !isInstructionText && !isEmpty && !isNone && !isGarbage
        })
      console.log('[Judge] Extracted disagreements:', disagreements.length, disagreements)
    } else {
      console.log('[Judge] No disagreements section matched!')
    }
    
    return {
      consensus: consensus,
      summary: summary,
      agreements: agreements,
      disagreements: disagreements,
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
    const subscriptionCheck = checkSubscriptionStatus(userId)
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
    const { query, selectedModels, userId } = req.body
    
    console.log('[RAG Pipeline] Parsed request:', { query, selectedModels, userId })
    
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
    
    // Use the helper function directly instead of making an HTTP call
    let serperData
    try {
      // Request 5 results to ensure we have at least 5 parseable sources after filtering
      serperData = await performSerperSearch(query, 5)
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
      
      const councilPrompt = `Today's date is ${getCurrentDateString()}. You are reading raw content scraped from recent web search results. This data is current and up-to-date from the internet. Your job is to parse and interpret the source content yourself to answer the user's query.

INSTRUCTIONS:
1. TRUST the provided sources - they come from verified web sources, not your training data cutoff
2. When referencing sources in your response, refer to them by their number (e.g., "see source 4", "as stated in source 2", "source 1 indicates")
3. Do NOT question the validity of sources based on your training data - the web search provides more recent information
4. Extract the most relevant and useful information from each source to directly answer the user's query
5. Ignore any irrelevant content, navigation text, or boilerplate that may appear in the raw source content

User Query: ${query}

Web Sources (numbered for easy reference):
${rawSourcesData.formatted}`
      
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
app.get('/api/admin/check', (req, res) => {
  try {
    const { userId } = req.query
    if (!userId) {
      return res.status(400).json({ error: 'userId is required' })
    }
    
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
    res.json({ success: true, historyId, title })
  } catch (error) {
    console.error('[History] Error auto-saving:', error)
    res.status(500).json({ error: 'Failed to save conversation history' })
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
      modelCount: c.responses?.length || 0,
      modelNames: (c.responses || []).filter(r => !r.error).map(r => r.modelName),
      consensus: c.summary?.consensus || null,
      isSingleModel: c.summary?.singleModel || (c.responses?.length === 1),
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

// ==================== SAVED CONVERSATIONS ENDPOINTS ====================
// Two separate collections:
//   saved_individual — single model response + conversation
//   saved_sessions   — full council + judge + sources

const SAVED_COLLECTION = {
  individual: 'saved_individual',
  full: 'saved_sessions',
}

// Save a conversation
app.post('/api/conversations/save', async (req, res) => {
  try {
    const { userId, type, originalPrompt, category } = req.body

    if (!userId || !type || !SAVED_COLLECTION[type]) {
      return res.status(400).json({ error: 'userId and valid type ("individual" or "full") are required' })
    }

    const users = readUsers()
    if (!users[userId]) {
      return res.status(404).json({ error: 'User not found' })
    }

    const dbInstance = await db.getDb()

    // --- Enforce: each convo/response can only be saved ONCE ---
    if (type === 'individual') {
      const { modelName, modelResponse, conversation } = req.body
      if (!modelName || !modelResponse) {
        return res.status(400).json({ error: 'modelName and modelResponse are required for individual saves' })
      }
      // Check if this exact response was already saved
      const alreadySaved = await dbInstance.collection('saved_individual').findOne({
        userId,
        originalPrompt: originalPrompt || '',
        modelName,
      })
      if (alreadySaved) {
        console.log(`[Conversations] Already saved individual: user=${userId}, model=${modelName}, prompt="${(originalPrompt || '').substring(0, 40)}"`)
        return res.status(409).json({ error: 'This response has already been saved.', alreadySaved: true })
      }
    } else if (type === 'full') {
      // Check if this session was already saved
      const alreadySaved = await dbInstance.collection('saved_sessions').findOne({
        userId,
        originalPrompt: originalPrompt || '',
      })
      if (alreadySaved) {
        console.log(`[Conversations] Already saved full session: user=${userId}, prompt="${(originalPrompt || '').substring(0, 40)}"`)
        return res.status(409).json({ error: 'This session has already been saved.', alreadySaved: true })
      }
    }

    const conversationId = `conv-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
    const title = originalPrompt
      ? originalPrompt.substring(0, 80) + (originalPrompt.length > 80 ? '...' : '')
      : 'Untitled Conversation'

    let doc = {
      _id: conversationId,
      userId,
      type,
      title,
      originalPrompt: originalPrompt || '',
      category: category || 'General',
      savedAt: new Date(),
    }

    if (type === 'individual') {
      const { modelName, modelResponse, conversation, sources, conversationSources } = req.body
      doc.modelName = modelName
      doc.modelResponse = modelResponse
      doc.conversation = conversation || []
      doc.sources = sources || []
      doc.conversationSources = conversationSources || {}
    } else if (type === 'full') {
      const { responses, summary, sources, facts } = req.body

      // Session save always includes ALL responses (individual saves are separate)
      doc.responses = (responses || []).map(r => ({
        modelName: r.modelName,
        modelResponse: r.modelResponse || r.text || '',
        conversation: r.conversation || [],
      }))
      doc.summary = summary || null
      doc.sources = sources || []
      doc.facts = facts || []
    }

    await dbInstance.collection(SAVED_COLLECTION[type]).insertOne(doc)

    console.log(`[Conversations] Saved ${type} to ${SAVED_COLLECTION[type]} for user ${userId}: ${conversationId}`)
    res.json({ success: true, conversationId, title })
  } catch (error) {
    console.error('[Conversations] Error saving:', error)
    res.status(500).json({ error: 'Failed to save conversation' })
  }
})

// Get full detail of a single saved conversation
// NOTE: This route MUST be defined BEFORE /api/conversations/:userId to avoid Express matching "detail" as a userId
app.get('/api/conversations/detail/:conversationId', async (req, res) => {
  try {
    const { conversationId } = req.params
    const dbInstance = await db.getDb()

    // Check both collections
    let doc = await dbInstance.collection('saved_individual').findOne({ _id: conversationId })
    if (!doc) {
      doc = await dbInstance.collection('saved_sessions').findOne({ _id: conversationId })
    }

    if (!doc) {
      return res.status(404).json({ error: 'Conversation not found' })
    }

    res.json({ conversation: { ...doc, id: doc._id } })
  } catch (error) {
    console.error('[Conversations] Error fetching detail:', error)
    res.status(500).json({ error: 'Failed to fetch conversation' })
  }
})

// List all saved conversations for a user (merges both collections)
app.get('/api/conversations/:userId', async (req, res) => {
  try {
    const { userId } = req.params
    const { type: filterType } = req.query // optional: "individual" or "full"

    if (!userId) {
      return res.status(400).json({ error: 'userId is required' })
    }

    const dbInstance = await db.getDb()
    const projection = { _id: 1, type: 1, title: 1, originalPrompt: 1, category: 1, savedAt: 1, modelName: 1 }

    let results = []

    if (!filterType || filterType === 'all' || filterType === 'individual') {
      const individual = await dbInstance.collection('saved_individual')
        .find({ userId })
        .sort({ savedAt: -1 })
        .project(projection)
        .toArray()
      results.push(...individual)
    }

    if (!filterType || filterType === 'all' || filterType === 'full') {
      const sessions = await dbInstance.collection('saved_sessions')
        .find({ userId })
        .sort({ savedAt: -1 })
        .project(projection)
        .toArray()
      results.push(...sessions)
    }

    // Sort combined results by date descending
    results.sort((a, b) => new Date(b.savedAt) - new Date(a.savedAt))

    const mapped = results.map(c => ({
      id: c._id,
      type: c.type,
      title: c.title,
      originalPrompt: c.originalPrompt,
      category: c.category,
      savedAt: c.savedAt,
      modelName: c.modelName || null,
    }))

    res.json({ conversations: mapped })
  } catch (error) {
    console.error('[Conversations] Error listing:', error)
    res.status(500).json({ error: 'Failed to list conversations' })
  }
})

// Delete a saved conversation
app.delete('/api/conversations/:conversationId', async (req, res) => {
  try {
    const { conversationId } = req.params
    const { userId, type } = req.body

    if (!conversationId || !userId) {
      return res.status(400).json({ error: 'conversationId and userId are required' })
    }

    const dbInstance = await db.getDb()

    // If type is provided, delete from the specific collection; otherwise try both
    let result
    if (type && SAVED_COLLECTION[type]) {
      result = await dbInstance.collection(SAVED_COLLECTION[type]).deleteOne({
        _id: conversationId,
        userId,
      })
    } else {
      result = await dbInstance.collection('saved_individual').deleteOne({
        _id: conversationId,
        userId,
      })
      if (result.deletedCount === 0) {
        result = await dbInstance.collection('saved_sessions').deleteOne({
          _id: conversationId,
          userId,
        })
      }
    }

    if (result.deletedCount === 0) {
      return res.status(404).json({ error: 'Conversation not found or not owned by user' })
    }

    console.log(`[Conversations] Deleted conversation ${conversationId} for user ${userId}`)
    res.json({ success: true })
  } catch (error) {
    console.error('[Conversations] Error deleting:', error)
    res.status(500).json({ error: 'Failed to delete conversation' })
  }
})

// ==================== LEADERBOARD ENDPOINTS ====================

// Submit a prompt to the leaderboard
app.post('/api/leaderboard/submit', async (req, res) => {
  console.log('[Leaderboard] Submit endpoint hit:', { userId: req.body?.userId, hasPromptText: !!req.body?.promptText })
  try {
    const { userId, promptText, category, responses, summary, facts, sources, description } = req.body
    
    if (!userId || !promptText || !promptText.trim()) {
      console.log('[Leaderboard] Missing required fields:', { userId: !!userId, promptText: !!promptText })
      return res.status(400).json({ error: 'userId and promptText are required' })
    }
    
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
      username: user.username || user.email || 'Anonymous',
      promptText: promptText.trim(),
      category: category || 'General Knowledge/Other',
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
    
    // Also save to MongoDB
    try {
      await db.leaderboardPosts.submit({
        userId,
        username: user.username || user.email || 'Anonymous',
        promptText: promptText.trim(),
        category: category || 'General Knowledge/Other',
        responses: responses || [],
        summary: summary || null,
        sources: sources || []
      })
      console.log(`[Leaderboard] Prompt also saved to MongoDB: ${promptId}`)
    } catch (dbErr) {
      console.warn('[Leaderboard] MongoDB save failed (non-critical):', dbErr.message)
    }
    
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
app.get('/api/leaderboard', (req, res) => {
  try {
    const leaderboard = readLeaderboard()
    const users = readUsers()
    const { filter, userId } = req.query
    
    // Map prompts with user info and like count
    let prompts = leaderboard.prompts.map(prompt => {
      const user = users[prompt.userId]
      return {
        ...prompt,
        username: user?.username || user?.email || 'Anonymous',
        likeCount: prompt.likes?.length || 0,
      }
    })
    
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
      // Unlike: remove the like
      prompt.likes.splice(likeIndex, 1)
      console.log(`[Leaderboard] User ${userId} unliked prompt ${promptId}`)
    } else {
      // Like: add the like
      prompt.likes.push(userId)
      console.log(`[Leaderboard] User ${userId} liked prompt ${promptId}`)
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
          promptText: prompt.promptText.substring(0, 50) + '...',
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
app.get('/api/profile/:userId', (req, res) => {
  try {
    const { userId } = req.params
    const users = readUsers()
    const user = users[userId]

    if (!user) {
      return res.status(404).json({ error: 'User not found' })
    }

    const usage = readUsage()
    const userUsage = usage[userId] || {}
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

    // Public profile data only — no spending, credits, tokens, or private stats
    res.json({
      username: user.username || 'Anonymous',
      firstName: user.firstName || null,
      createdAt: user.createdAt || null,
      earnedBadges: userUsage.earnedBadges || [],
      leaderboard: {
        totalPosts: userPrompts.length,
        totalLikes,
        totalComments,
      },
      // Return their leaderboard posts (public)
      posts: userPrompts.map(p => ({
        id: p.id,
        promptText: p.promptText,
        category: p.category,
        likeCount: p.likes?.length || 0,
        likes: p.likes || [],
        createdAt: p.createdAt,
        comments: p.comments || [],
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
      username: user.username || user.email || 'Anonymous',
      text: commentText.trim(),
      createdAt: new Date().toISOString(),
      replies: [],
    }
    
    prompt.comments.push(comment)
    writeLeaderboard(leaderboard)
    
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
      username: user.username || user.email || 'Anonymous',
      text: replyText.trim(),
      createdAt: new Date().toISOString(),
    }
    
    comment.replies.push(reply)
    writeLeaderboard(leaderboard)
    
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

// ==================== STRIPE SUBSCRIPTION ENDPOINTS ====================

// Get user's payment method info (last 4 digits, brand, etc.)
app.get('/api/stripe/payment-method', async (req, res) => {
  try {
    const { userId } = req.query
    
    if (!userId) {
      return res.status(400).json({ error: 'userId is required' })
    }
    
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

    // Cancel subscription in Stripe if it exists
    if (user.stripeSubscriptionId) {
      try {
        await stripe.subscriptions.cancel(user.stripeSubscriptionId)
        console.log(`[Stripe] Subscription canceled for user: ${userId}`)
      } catch (stripeError) {
        console.error('[Stripe] Error canceling subscription (may already be canceled):', stripeError)
        // Continue with deletion even if subscription cancel fails
      }
    }

    if (!user.cancellationHistory) user.cancellationHistory = []
    user.cancellationHistory.push({
      date: new Date().toISOString(),
      reason: 'account_deleted',
    })

    // Delete user from cache (MongoDB deletion happens below via db.users.delete)
    delete users[userId]
    usersCache = users // Update the cache reference directly

    // Delete user usage data from cache
    const usage = readUsage()
    if (usage[userId]) {
      delete usage[userId]
      writeUsage(usage)
    }

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
    const FREE_MONTHLY_ALLOCATION = 7.50
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
    
    // Calculate overage (cost above $7.50 free allocation)
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
  await initDatabase()
  console.log('[Server] Loading data from MongoDB...')
  await loadCacheFromMongoDB()
  await cleanupOldDailyUsage()
  console.log('[Server] ✅ Serverless initialization complete')
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


