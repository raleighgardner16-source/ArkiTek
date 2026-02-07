import express from 'express'
import cors from 'cors'
import axios from 'axios'
import dotenv from 'dotenv'
import fs from 'fs'
import path from 'path'
import crypto from 'crypto'
import { fileURLToPath } from 'url'
import * as cheerio from 'cheerio'
import { countTokens, extractTokensFromResponse, estimateTokensFallback } from './utils/tokenCounters.js'
import Stripe from 'stripe'
import db from './database/db.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

dotenv.config()

// ============================================================================
// DATABASE CONNECTION (MongoDB Only - No JSON Files)
// ============================================================================
const initDatabase = async () => {
  try {
    await db.connect()
    console.log('[Server] ✅ MongoDB connected successfully')
    console.log('[Server] 🗄️  Using MongoDB as primary data store')
  } catch (error) {
    console.error('[Server] ❌ MongoDB connection failed:', error.message)
    console.error('[Server] Cannot start without database connection')
    process.exit(1) // Exit if MongoDB fails - no fallback
  }
}

// Graceful shutdown
process.on('SIGINT', async () => {
  console.log('\n[Server] Shutting down gracefully...')
  await db.close()
  process.exit(0)
})

process.on('SIGTERM', async () => {
  console.log('\n[Server] Received SIGTERM, shutting down...')
  await db.close()
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

// ============================================================================
// ADMIN LIST (kept in simple JSON file since it rarely changes)
// ============================================================================
const ADMINS_FILE = path.join(__dirname, 'ADMIN', 'admins.json')

const readAdmins = () => {
  // First try to use MongoDB cache (populated on server startup)
  if (cacheLoaded && adminsCache.admins.length > 0) {
    return { admins: adminsCache.admins }
  }
  
  // Fall back to JSON file during startup or if cache is empty
  try {
    if (fs.existsSync(ADMINS_FILE)) {
      const data = fs.readFileSync(ADMINS_FILE, 'utf8')
      if (data.trim() === '') return { admins: [] }
      return JSON.parse(data)
    }
  } catch (error) {
    console.error('Error reading admins file:', error)
  }
  return { admins: [] }
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
// MONGODB-BACKED DATA LAYER (Replaces JSON File Operations)
// ============================================================================
// These functions maintain backwards compatibility with existing code
// while storing all data in MongoDB instead of JSON files

// In-memory cache for usage data (synced with MongoDB)
let usageCache = {}
let usersCache = {}
let leaderboardCache = { prompts: [] }
let adminsCache = { admins: [] }
let cacheLoaded = false

// Load cache from MongoDB on startup
const loadCacheFromMongoDB = async () => {
  try {
    // Load all users
    const allUsers = await db.users.getAll()
    for (const user of allUsers) {
      usersCache[user._id] = {
        id: user._id,
        firstName: user.firstName,
        lastName: user.lastName,
        username: user.username,
        email: user.email,
        password: user.password,
        createdAt: user.createdAt?.toISOString?.() || user.createdAt,
        stripeCustomerId: user.stripeCustomerId,
        stripeSubscriptionId: user.stripeSubscriptionId,
        subscriptionStatus: user.subscriptionStatus,
        subscriptionEndDate: user.subscriptionEndDate,
        monthlyUsageCost: user.monthlyUsageCost || {},
        lastLoginDate: user.lastLoginDate?.toISOString?.() || user.lastLoginDate,
      }
      
      // Build usage data from user stats
      usageCache[user._id] = {
        totalTokens: user.stats?.totalTokens || 0,
        totalInputTokens: user.stats?.totalInputTokens || 0,
        totalOutputTokens: user.stats?.totalOutputTokens || 0,
        totalQueries: user.stats?.totalQueries || 0,
        totalPrompts: user.stats?.totalPrompts || 0,
        monthlyUsage: {},
        dailyUsage: {},
        providers: user.stats?.providers || {},
        models: user.stats?.models || {},
        promptHistory: [],
        categories: {},
        categoryPrompts: {},
        ratings: {},
        lastActiveDate: user.lastActiveAt?.toISOString?.()?.split('T')[0] || null,
        lastLoginDate: user.lastLoginDate?.toISOString?.() || null,
        streakDays: 0,
        judgeConversationContext: [],
        purchasedCredits: user.purchasedCredits || { total: 0, remaining: 0 },
      }
    }
    
    // Load leaderboard posts
    const dbInstance = await db.getDb()
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
    
    // Load admins list
    const adminsDoc = await dbInstance.collection('admins').findOne({ _id: 'admin_list' })
    if (adminsDoc && adminsDoc.admins) {
      adminsCache.admins = adminsDoc.admins
    }
    
    cacheLoaded = true
    console.log(`[Cache] Loaded ${Object.keys(usersCache).length} users, ${leaderboardCache.prompts.length} leaderboard posts, ${adminsCache.admins.length} admins`)
  } catch (error) {
    console.error('[Cache] Failed to load from MongoDB:', error.message)
  }
}

// Sync cache to MongoDB (debounced)
let syncTimeout = null
const syncToMongoDB = async (collection, id, data) => {
  try {
    const dbInstance = await db.getDb()
    if (collection === 'users') {
      await dbInstance.collection('users').updateOne(
        { _id: id },
        { $set: data },
        { upsert: true }
      )
    } else if (collection === 'usage') {
      // Usage data is embedded in user document
      await dbInstance.collection('users').updateOne(
        { _id: id },
        { 
          $set: {
            'stats.totalTokens': data.totalTokens || 0,
            'stats.totalInputTokens': data.totalInputTokens || 0,
            'stats.totalOutputTokens': data.totalOutputTokens || 0,
            'stats.totalQueries': data.totalQueries || 0,
            'stats.totalPrompts': data.totalPrompts || 0,
            'stats.providers': data.providers || {},
            'stats.models': data.models || {},
            lastActiveAt: new Date(),
          }
        },
        { upsert: true }
      )
    } else if (collection === 'leaderboard') {
      // Handled separately
    }
  } catch (error) {
    console.error(`[Sync] Failed to sync ${collection}/${id}:`, error.message)
  }
}

// MongoDB-backed readUsers (uses cache)
const readUsers = () => {
  return usersCache
}

// MongoDB-backed writeUsers (updates cache + syncs to MongoDB)
const writeUsers = (users) => {
  usersCache = users
  // Sync each user to MongoDB
  for (const [userId, userData] of Object.entries(users)) {
    syncToMongoDB('users', userId, {
      _id: userId,
      firstName: userData.firstName,
      lastName: userData.lastName,
      username: userData.username,
      email: userData.email,
      password: userData.password,
      createdAt: userData.createdAt ? new Date(userData.createdAt) : new Date(),
      stripeCustomerId: userData.stripeCustomerId,
      stripeSubscriptionId: userData.stripeSubscriptionId,
      subscriptionStatus: userData.subscriptionStatus,
      subscriptionEndDate: userData.subscriptionEndDate,
      monthlyUsageCost: userData.monthlyUsageCost || {},
      lastLoginDate: userData.lastLoginDate ? new Date(userData.lastLoginDate) : null,
    })
  }
}

// MongoDB-backed readUsage (uses cache)
const readUsage = () => {
  return usageCache
}

// MongoDB-backed writeUsage (updates cache + syncs to MongoDB)
const writeUsage = (usage) => {
  usageCache = usage
  // Sync each user's usage to MongoDB
  for (const [userId, userData] of Object.entries(usage)) {
    syncToMongoDB('usage', userId, userData)
  }
}

// MongoDB-backed readLeaderboard
const readLeaderboard = () => {
  return leaderboardCache
}

// MongoDB-backed writeLeaderboard
const writeLeaderboard = async (leaderboard) => {
  leaderboardCache = leaderboard
  
  try {
    const dbInstance = await db.getDb()
    
    // Sync each post
    for (const post of leaderboard.prompts) {
      await dbInstance.collection('leaderboard_posts').updateOne(
        { _id: post.id },
        { 
          $set: {
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
          }
        },
        { upsert: true }
      )
    }
  } catch (error) {
    console.error('[Leaderboard Sync] Failed:', error.message)
  }
}

// Track deleted users count in MongoDB
const incrementDeletedUsers = async () => {
  try {
    const dbInstance = await db.getDb()
    const result = await dbInstance.collection('metadata').findOneAndUpdate(
      { _id: 'admin_stats' },
      { $inc: { deletedUsersCount: 1 } },
      { upsert: true, returnDocument: 'after' }
    )
    return result.deletedUsersCount || 1
  } catch (error) {
    console.error('[DeletedUsers] Failed to increment:', error.message)
    return 0
  }
}

// Read deleted users count from MongoDB
const readDeletedUsers = async () => {
  try {
    const dbInstance = await db.getDb()
    const stats = await dbInstance.collection('metadata').findOne({ _id: 'admin_stats' })
    return { count: stats?.deletedUsersCount || 0 }
  } catch (error) {
    console.error('[DeletedUsers] Failed to read:', error.message)
    return { count: 0 }
  }
}

// Read admin stats from MongoDB
const getAdminStats = async () => {
  try {
    const dbInstance = await db.getDb()
    return await dbInstance.collection('metadata').findOne({ _id: 'admin_stats' })
  } catch (error) {
    console.error('[AdminStats] Failed to read:', error.message)
    return null
  }
}

// Password hashing
const hashPassword = (password) => {
  return crypto.createHash('sha256').update(password).digest('hex')
}

// Get current month key (YYYY-MM)
const getCurrentMonth = () => {
  const now = new Date()
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
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
      lastActiveDate: null,
      lastLoginDate: null,
      streakDays: 0,
      judgeConversationContext: [], // Store last 5 summaries from judge model conversations
    }
  }

  const userUsage = usage[userId]
  const currentMonth = getCurrentMonth()
  const today = new Date().toISOString().split('T')[0] // YYYY-MM-DD format

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
  if (!userUsage.lastActiveDate) {
    userUsage.lastActiveDate = null
  }
  if (userUsage.lastLoginDate === undefined) {
    userUsage.lastLoginDate = null
  }
  if (userUsage.streakDays === undefined) {
    userUsage.streakDays = 0
  }
  // Migration: Ensure judge conversation context exists
  if (!userUsage.judgeConversationContext) {
    userUsage.judgeConversationContext = []
  }

  // Update prompt totals
  const oldTotal = userUsage.totalPrompts || 0
  userUsage.totalPrompts = (userUsage.totalPrompts || 0) + 1
  console.log(`[Prompt Tracking] User ${userId}: Prompts ${oldTotal} -> ${userUsage.totalPrompts}`)

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
    // Keep only last 100 prompts
    if (userUsage.promptHistory.length > 100) {
      userUsage.promptHistory = userUsage.promptHistory.slice(0, 100)
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
  if (userUsage.lastActiveDate) {
    const lastDate = new Date(userUsage.lastActiveDate)
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
  userUsage.lastActiveDate = today

  writeUsage(usage)
  
  // Also update users.json with last active date and status
  const users = readUsers()
  if (users[userId]) {
    // Always update lastActiveDate
    users[userId].lastActiveDate = activeDate
    
    // Update status based on activity within last month (only if not canceled)
    if (users[userId].status !== 'canceled' && users[userId].canceled !== true) {
      const now = new Date()
      const oneMonthAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000)
      const lastActive = new Date(activeDate)
      
      if (lastActive >= oneMonthAgo) {
        users[userId].status = 'active'
      } else {
        users[userId].status = 'inactive'
      }
    }
    
    // Always write users.json when updating lastActiveDate
    try {
      writeUsers(users)
      console.log(`[User Update] Updated ${userId} in users.json: lastActiveDate=${activeDate}, status=${users[userId].status}`)
    } catch (error) {
      console.error(`[User Update] Error updating users.json for ${userId}:`, error)
    }
  }
}

// Refiner models - these are internal pipeline models whose tokens should NOT be shown to users
// but their COST should still be tracked and billed
const REFINER_MODELS = [
  'gemini-2.5-flash-lite',
  'gemini-1.5-flash-lite', 
  'gpt-4o-mini'
]

// Check if a model is a refiner model (internal pipeline model)
const isRefinerModel = (model) => {
  return REFINER_MODELS.some(refiner => model.includes(refiner))
}

// Track usage for a user
const trackUsage = async (userId, provider, model, inputTokens, outputTokens) => {
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
  const currentMonth = getCurrentMonth()
  const today = new Date().toISOString().split('T')[0] // YYYY-MM-DD format
  const tokensUsed = inputTokens + outputTokens
  const modelKey = `${provider}-${model}`
  
  // Check if this is a refiner model (internal pipeline model)
  // Refiner models: their cost is tracked but tokens are NOT shown to users
  const isRefiner = isRefinerModel(model)
  
  if (isRefiner) {
    console.log(`[Usage] Tracking refiner model ${modelKey}: ${tokensUsed} tokens (hidden from user count, included in cost)`)
  }

  // Update totals - ONLY for non-refiner models (user-visible token counts)
  if (!isRefiner) {
    userUsage.totalTokens += tokensUsed
    userUsage.totalInputTokens = (userUsage.totalInputTokens || 0) + inputTokens
    userUsage.totalOutputTokens = (userUsage.totalOutputTokens || 0) + outputTokens
  }
  // Note: totalQueries is now only incremented when Serper queries are made, not for LLM calls

  // Update monthly usage - ONLY for non-refiner models (user-visible token counts)
  if (!userUsage.monthlyUsage[currentMonth]) {
    userUsage.monthlyUsage[currentMonth] = { tokens: 0, inputTokens: 0, outputTokens: 0, queries: 0, prompts: 0 }
  }
  if (!isRefiner) {
    userUsage.monthlyUsage[currentMonth].tokens += tokensUsed
    userUsage.monthlyUsage[currentMonth].inputTokens = (userUsage.monthlyUsage[currentMonth].inputTokens || 0) + inputTokens
    userUsage.monthlyUsage[currentMonth].outputTokens = (userUsage.monthlyUsage[currentMonth].outputTokens || 0) + outputTokens
  }
  // Note: queries are now only incremented when Serper queries are made, not for LLM calls

  // Update provider stats - ONLY for non-refiner models (user-visible token counts)
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
  if (!isRefiner) {
    userUsage.providers[provider].totalTokens += tokensUsed
    userUsage.providers[provider].totalInputTokens = (userUsage.providers[provider].totalInputTokens || 0) + inputTokens
    userUsage.providers[provider].totalOutputTokens = (userUsage.providers[provider].totalOutputTokens || 0) + outputTokens
  }
  // Note: provider queries are now only incremented when Serper queries are made, not for LLM calls
  if (!userUsage.providers[provider].monthlyTokens[currentMonth]) {
    userUsage.providers[provider].monthlyTokens[currentMonth] = 0
    userUsage.providers[provider].monthlyInputTokens = userUsage.providers[provider].monthlyInputTokens || {}
    userUsage.providers[provider].monthlyOutputTokens = userUsage.providers[provider].monthlyOutputTokens || {}
    userUsage.providers[provider].monthlyInputTokens[currentMonth] = 0
    userUsage.providers[provider].monthlyOutputTokens[currentMonth] = 0
    userUsage.providers[provider].monthlyQueries[currentMonth] = 0
  }
  if (!isRefiner) {
    userUsage.providers[provider].monthlyTokens[currentMonth] += tokensUsed
    userUsage.providers[provider].monthlyInputTokens[currentMonth] = (userUsage.providers[provider].monthlyInputTokens[currentMonth] || 0) + inputTokens
    userUsage.providers[provider].monthlyOutputTokens[currentMonth] = (userUsage.providers[provider].monthlyOutputTokens[currentMonth] || 0) + outputTokens
  }
  // Note: provider monthly queries are now only incremented when Serper queries are made, not for LLM calls

  // Update model stats (within provider) - ONLY for non-refiner models
  if (!isRefiner) {
    if (!userUsage.models[modelKey]) {
      userUsage.models[modelKey] = {
        totalTokens: 0,
        totalInputTokens: 0,
        totalOutputTokens: 0,
        totalQueries: 0,
        totalPrompts: 0, // Track how many times this model was used
        provider: provider,
        model: model,
        pricing: null, // Will be set later
      }
    }
    userUsage.models[modelKey].totalTokens += tokensUsed
    userUsage.models[modelKey].totalInputTokens = (userUsage.models[modelKey].totalInputTokens || 0) + inputTokens
    userUsage.models[modelKey].totalOutputTokens = (userUsage.models[modelKey].totalOutputTokens || 0) + outputTokens
    // Increment prompt count for this model (each time trackUsage is called, it's one prompt/usage)
    userUsage.models[modelKey].totalPrompts = (userUsage.models[modelKey].totalPrompts || 0) + 1
  }
  // Note: model queries are now only incremented when Serper queries are made, not for LLM calls

  // Update daily usage (for COST calculation - includes ALL models including refiners)
  // This is used by the cost calculation function to determine billing
  if (!userUsage.dailyUsage) {
    userUsage.dailyUsage = {}
  }
  if (!userUsage.dailyUsage[currentMonth]) {
    userUsage.dailyUsage[currentMonth] = {}
  }
  if (!userUsage.dailyUsage[currentMonth][today]) {
    userUsage.dailyUsage[currentMonth][today] = { inputTokens: 0, outputTokens: 0, queries: 0, models: {} }
  }
  // Only add to aggregate daily totals for non-refiner models (user-visible)
  if (!isRefiner) {
    userUsage.dailyUsage[currentMonth][today].inputTokens = (userUsage.dailyUsage[currentMonth][today].inputTokens || 0) + inputTokens
    userUsage.dailyUsage[currentMonth][today].outputTokens = (userUsage.dailyUsage[currentMonth][today].outputTokens || 0) + outputTokens
  }
  
  // Track which models were used on this day - ALL models including refiners (for cost calculation)
  if (!userUsage.dailyUsage[currentMonth][today].models[modelKey]) {
    userUsage.dailyUsage[currentMonth][today].models[modelKey] = { inputTokens: 0, outputTokens: 0 }
  }
  userUsage.dailyUsage[currentMonth][today].models[modelKey].inputTokens = (userUsage.dailyUsage[currentMonth][today].models[modelKey].inputTokens || 0) + inputTokens
  userUsage.dailyUsage[currentMonth][today].models[modelKey].outputTokens = (userUsage.dailyUsage[currentMonth][today].models[modelKey].outputTokens || 0) + outputTokens

  writeUsage(usage)
  
  // ALSO update the monthlyUsageCost in users.json immediately
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
        writeUsers(users)
        console.log(`[Usage] Added $${thisCost.toFixed(6)} to monthlyUsageCost. New total: $${user.monthlyUsageCost[currentMonth].toFixed(4)}`)
      }
    }
  } catch (costErr) {
    console.error('[Usage] Error updating monthlyUsageCost:', costErr)
  }
  
  // Also track in MongoDB (non-blocking, for gradual migration)
  // Only track non-refiner models in user-visible stats
  if (!isRefiner) {
    db.trackUsage(userId, provider, model, inputTokens, outputTokens).catch(err => 
      console.warn('[Usage] MongoDB tracking failed (non-critical):', err.message)
    )
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

// Middleware
app.use(cors())

// Stripe webhook endpoint needs raw body for signature verification
// This must be BEFORE express.json() middleware
app.use('/api/stripe/webhook', express.raw({ type: 'application/json' }))

// JSON parsing for all other routes
app.use(express.json())

// Authentication endpoints
app.post('/api/auth/signup', async (req, res) => {
  try {
    const { firstName, lastName, username, email, password } = req.body

    if (!firstName || !lastName || !username || !email || !password) {
      return res.status(400).json({ error: 'All fields are required' })
    }

    if (password.length < 8) {
      return res.status(400).json({ error: 'Password must be at least 8 characters' })
    }

    console.log('[Auth] Signup attempt for username:', username)

    // Check if username or email already exists in MongoDB
    const existingUser = await db.users.get(username)
    if (existingUser) {
      return res.status(400).json({ error: 'Username already exists' })
    }
    
    const existingEmail = await db.users.getByEmail(email)
    if (existingEmail) {
      return res.status(400).json({ error: 'Email already registered' })
    }

    // Create new user in MongoDB
    const hashedPassword = hashPassword(password)
    const userId = username
    
    await db.users.create(userId, {
      email,
      password: hashedPassword,
      firstName,
      lastName,
      username
    })
    console.log('[Auth] User created in MongoDB:', userId)

    // Update cache
    const users = readUsers()
    users[userId] = {
      id: userId,
      firstName,
      lastName,
      username,
      email,
      password: hashedPassword,
      createdAt: new Date().toISOString(),
      stripeCustomerId: null,
      stripeSubscriptionId: null,
      subscriptionStatus: 'inactive',
      subscriptionEndDate: null,
      monthlyUsageCost: {},
    }
    usersCache = users

    // Initialize usage tracking in cache
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
      lastActiveDate: null,
      lastLoginDate: null,
      streakDays: 0,
      judgeConversationContext: [],
      purchasedCredits: { total: 0, remaining: 0 },
    }
    usageCache = usage

    res.json({
      success: true,
      user: {
        id: userId,
        firstName,
        lastName,
        username,
        email,
        subscriptionStatus: 'inactive',
        subscriptionEndDate: null,
      },
    })
  } catch (error) {
    console.error('[Auth] Signup error:', error)
    res.status(500).json({ error: 'An error occurred during signup. Please try again.' })
  }
})

app.post('/api/auth/signin', async (req, res) => {
  try {
    const { username, password } = req.body

    if (!username || !password) {
      return res.status(400).json({ error: 'Username and password are required' })
    }

    // Get user from MongoDB
    const dbUser = await db.users.get(username)
    
    if (!dbUser) {
      console.log('[Auth] User not found in MongoDB:', username)
      return res.status(401).json({ error: 'Username not found. Please check your username or sign up.' })
    }

    const hashedPassword = hashPassword(password)
    
    if (dbUser.password !== hashedPassword) {
      console.log('[Auth] Password mismatch for user:', username)
      return res.status(401).json({ error: 'Invalid password. Please check your password and try again.' })
    }

    // Update last login in MongoDB
    const loginDate = new Date()
    await db.users.update(username, { lastLoginDate: loginDate, lastActiveAt: loginDate })
    
    // Update cache
    const users = readUsers()
    if (users[username]) {
      users[username].lastLoginDate = loginDate.toISOString()
      usersCache = users
    }
    
    const usage = readUsage()
    if (usage[username]) {
      usage[username].lastLoginDate = loginDate.toISOString()
      usageCache = usage
    }
    
    console.log('[Auth] Successful sign in for user:', username)
    res.json({
      success: true,
      user: {
        id: dbUser._id,
        firstName: dbUser.firstName,
        lastName: dbUser.lastName,
        username: dbUser.username,
        email: dbUser.email,
        subscriptionStatus: dbUser.subscriptionStatus || 'inactive',
        subscriptionEndDate: dbUser.subscriptionEndDate || null,
      },
    })
  } catch (error) {
    console.error('[Auth] Sign in error:', error)
    res.status(500).json({ error: 'An error occurred during sign in. Please try again.' })
  }
})

// Track a prompt submission
app.post('/api/stats/prompt', (req, res) => {
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
    res.json({ success: true, message: 'Prompt tracked' })
  } catch (error) {
    console.error('[Prompt Tracking] Error in prompt tracking endpoint:', error)
    res.status(500).json({ error: 'Failed to track prompt' })
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

    // Delete user and all associated data from MongoDB
    await db.users.delete(userId)
    console.log('[Account Deletion] User and all data deleted from MongoDB:', userId, userInfo)

    // Clear from cache
    delete usersCache[userId]
    delete usageCache[userId]

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

// Get user statistics
app.get('/api/stats/:userId', (req, res) => {
  const { userId } = req.params
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
  
  const userUsage = usage[userId] || {
    totalTokens: 0,
    totalInputTokens: 0,
    totalOutputTokens: 0,
    totalQueries: 0,
    totalPrompts: 0,
    monthlyUsage: {},
    providers: {},
    models: {},
  }

  const currentMonth = getCurrentMonth()
  const monthlyStats = userUsage.monthlyUsage[currentMonth] || { tokens: 0, inputTokens: 0, outputTokens: 0, queries: 0, prompts: 0 }

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
  const FREE_MONTHLY_ALLOCATION = 5.00 // $5 per month included in subscription
  
  // Get the tracked monthly cost directly from users.json
  // This is accumulated incrementally by trackUsage() when usage occurs
  let monthlyCost = user?.monthlyUsageCost?.[currentMonth] || 0
  
  // Log the tracked cost for debugging
  console.log(`[Stats] Monthly cost for ${userId} in ${currentMonth}: $${monthlyCost.toFixed(4)}`)
  
  let remainingFreeAllocation = Math.max(0, FREE_MONTHLY_ALLOCATION - monthlyCost)
  
  // Get pricing data and daily usage for the daily breakdown chart
  const pricing = getPricingData()
  const dailyData = userUsage.dailyUsage?.[currentMonth] || {}
  
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
  const daysInMonth = new Date(new Date().getFullYear(), new Date().getMonth() + 1, 0).getDate()
  
  // Get all days of the current month
  for (let day = 1; day <= daysInMonth; day++) {
    const dateStr = `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`
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
      
      // Calculate percentage of $5 allocation used on this day
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

  // Note: Query costs ($0.001/query) are included in monthlyCost but not exposed to users
  res.json({
    totalTokens: userUsage.totalTokens || 0,
    totalInputTokens: userUsage.totalInputTokens || 0,
    totalOutputTokens: userUsage.totalOutputTokens || 0,
    totalPrompts: userUsage.totalPrompts || 0,
    monthlyTokens: monthlyStats.tokens || 0,
    monthlyInputTokens: monthlyStats.inputTokens || 0,
    monthlyOutputTokens: monthlyStats.outputTokens || 0,
    monthlyPrompts: monthlyStats.prompts || 0,
    monthlyCost: monthlyCost,
    remainingFreeAllocation: remainingFreeAllocation,
    freeUsagePercentage: freeUsagePercentage,
    totalAvailableBalance: totalAvailableBalance,
    purchasedCredits: {
      total: purchasedCredits.total || 0,
      remaining: purchasedCreditsRemaining,
      purchaseCount: purchasedCredits.purchases?.length || 0,
      lastPurchase: purchasedCredits.purchases?.[purchasedCredits.purchases.length - 1] || null
    },
    dailyUsage: dailyUsage,
    providers: providerStats,
    models: modelStats,
    categories: userUsage.categories || {},
    ratings: userUsage.ratings || {},
    streakDays: userUsage.streakDays || 0,
    createdAt: createdAt,
  })
})

// Get prompt history (last 12 prompts)
app.get('/api/stats/:userId/history', (req, res) => {
  const { userId } = req.params
  const usage = readUsage()
  const userUsage = usage[userId] || {}
  const promptHistory = userUsage.promptHistory || []
  // Return last 12 prompts
  res.json({ prompts: promptHistory.slice(0, 12) })
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
    console.log('[Judge Context] Fetching context for userId:', decodedUserId)
    
    const usage = readUsage()
    const userUsage = usage[decodedUserId] || {}
    const context = (userUsage.judgeConversationContext || []).slice(0, 5)
    
    console.log('[Judge Context] Found context entries:', context.length)
    res.json({ context })
  } catch (error) {
    console.error('[Judge Context] Error fetching context:', error)
    res.status(500).json({ error: 'Failed to fetch conversation context: ' + error.message })
  }
})

// Also support query-only endpoint for better compatibility
app.get('/api/judge/context', async (req, res) => {
  try {
    const userId = req.query.userId
    
    if (!userId) {
      return res.status(400).json({ error: 'userId query parameter is required' })
    }
    
    // Decode the userId in case it was URL encoded
    const decodedUserId = decodeURIComponent(userId)
    console.log('[Judge Context] Fetching context for userId (query):', decodedUserId)
    
    // Try MongoDB first, fallback to JSON
    let context = []
    try {
      context = await db.judgeContext.get(decodedUserId)
      console.log('[Judge Context] Got context from MongoDB:', context.length, 'entries')
    } catch (dbErr) {
      // Fallback to JSON file
      console.warn('[Judge Context] MongoDB failed, using JSON fallback:', dbErr.message)
      const usage = readUsage()
      const userUsage = usage[decodedUserId] || {}
      context = (userUsage.judgeConversationContext || []).slice(0, 5)
    }
    
    console.log('[Judge Context] Found context entries:', context.length)
    res.json({ context })
  } catch (error) {
    console.error('[Judge Context] Error fetching context:', error)
    res.status(500).json({ error: 'Failed to fetch conversation context: ' + error.message })
  }
})

// Clear judge conversation context (called when user starts new prompt or clears)
app.post('/api/judge/clear-context', async (req, res) => {
  try {
    const { userId } = req.body
    
    if (!userId) {
      return res.status(400).json({ error: 'userId is required' })
    }
    
    // Clear in JSON (backward compatibility)
    const usage = readUsage()
    if (usage[userId]) {
      usage[userId].judgeConversationContext = []
      writeUsage(usage)
      console.log(`[Judge Context] Cleared context in JSON for user ${userId}`)
    }
    
    // Also clear in MongoDB
    try {
      await db.judgeContext.clear(userId)
      console.log(`[Judge Context] Cleared context in MongoDB for user ${userId}`)
    } catch (dbErr) {
      console.warn('[Judge Context] MongoDB clear failed (non-critical):', dbErr.message)
    }
    
    res.json({ success: true, message: 'Context cleared' })
  } catch (error) {
    console.error('[Judge Context] Error clearing context:', error)
    res.status(500).json({ error: 'Failed to clear conversation context: ' + error.message })
  }
})

// Helper function to detect category and determine if search is needed
const detectCategoryForJudge = async (prompt, userId = null) => {
  const categoryPrompt = `Classify the user prompt into EXACTLY ONE category from the list below.
Determine if a web search would genuinely help answer the query.

needsSearch = true when:
- The query asks about current events, recent news, or real-time information
- The query needs factual verification (specific facts, statistics, dates)
- The query asks about specific people, companies, or events that may have recent updates

needsSearch = false when:
- The query is about general concepts, explanations, or "how does X work"
- The query asks for opinions, advice, or creative content
- The query is about well-established knowledge (science fundamentals, history, etc.)
- The query can be answered from general knowledge without specific sources

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
    
    // Track tokens for category detection
    if (userId) {
      const responseTokens = extractTokensFromResponse(response.data, 'google')
      if (responseTokens) {
        trackUsage(userId, 'google', 'gemini-2.5-flash-lite', responseTokens.inputTokens || 0, responseTokens.outputTokens || 0)
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
    const { userId, userMessage, conversationContext } = req.body
    
    if (!userId || !userMessage) {
      return res.status(400).json({ error: 'userId and userMessage are required' })
    }
    
    // Check subscription status
    const subscriptionCheck = checkSubscriptionStatus(userId)
    if (!subscriptionCheck.hasAccess) {
      return res.status(403).json({ 
        error: 'Active subscription required. Please subscribe to use this service.',
        subscriptionRequired: true,
        reason: subscriptionCheck.reason
      })
    }
    
    console.log('[Judge Conversation] Processing message with Grok (conversational mode, with RAG support)')
    
    // Step 1: Detect category and determine if search is needed (using same model as main page)
    const { category, needsSearch } = await detectCategoryForJudge(userMessage, userId)
    console.log(`[Judge Conversation] Category: ${category}, Needs Search: ${needsSearch}`)
    
    // Get last 5 summaries from context or fetch from storage
    const usage = readUsage()
    const contextSummaries = conversationContext || (usage[userId]?.judgeConversationContext || []).slice(0, 5)
    
    // Build context string with the user's recent conversation history
    // Position 0 is full response, positions 1-4 are summarized
    const contextString = contextSummaries.length > 0
      ? `Here is context from your recent conversation with this user:\n\n${contextSummaries.map((ctx, idx) => {
          const promptPart = ctx.originalPrompt ? `User asked: ${ctx.originalPrompt}\n` : ''
          // Use full response for position 0 (isFull=true), summary for others
          const responsePart = ctx.isFull && ctx.response 
            ? `Your response: ${ctx.response}`
            : `Your response (summary): ${ctx.summary}`
          return `${idx + 1}. ${promptPart}${responsePart}`
        }).join('\n\n')}\n\n`
      : ''
    
    let judgePrompt = ''
    let refinedData = null
    let searchResults = []
    
    // Step 2: If search is needed, run RAG pipeline (search + refiner)
    if (needsSearch) {
      console.log('[Judge Conversation] Search needed, running RAG pipeline...')
      
      // Perform search (top 5 sources, same as main pipeline)
      const serperApiKey = API_KEYS.serper
      if (!serperApiKey) {
        console.warn('[Judge Conversation] Serper API key not configured, skipping search')
      } else {
        try {
          const serperData = await performSerperSearch(userMessage, 5) // Get top 5 sources (same as main pipeline)
          searchResults = (serperData?.organic || []).map(r => ({
            title: r.title,
            link: r.link,
            snippet: r.snippet
          }))
          
          console.log(`[Judge Conversation] Search completed, found ${searchResults.length} results`)
          
          // Run refiner step (using Gemini 2.5 Flash Lite)
          if (searchResults.length > 0) {
            refinedData = await refinerStep(userMessage, searchResults, false, userId)
            console.log(`[Judge Conversation] Refiner completed, extracted ${refinedData.facts_with_citations?.length || 0} facts`)
          }
        } catch (searchError) {
          console.error('[Judge Conversation] Search/refiner error:', searchError)
          // Continue without refined data
        }
      }
    }
    
    // Step 3: Build prompt for Grok (conversational, not judge mode)
    // After the initial judge summary, the user is just talking to Grok naturally
    if (refinedData && refinedData.facts_with_citations && refinedData.facts_with_citations.length > 0) {
      // Include refined facts in the prompt
      const factsText = refinedData.facts_with_citations
        .map((fact, idx) => `${idx + 1}. ${fact.fact}${fact.source_quote ? `\n   Source: "${fact.source_quote}"` : ''}`)
        .join('\n\n')
      
      judgePrompt = `${contextString}Here is verified information from a recent web search that may help:\n\n${factsText}\n\nUser's question: ${userMessage}`
    } else {
      // No search or no facts found, use direct conversational prompt
      judgePrompt = `${contextString}User: ${userMessage}`
    }
    
    // Step 4: Call Grok
    const apiKey = API_KEYS.xai
    if (!apiKey) {
      return res.status(500).json({ error: 'xAI API key not configured' })
    }
    
    const response = await axios.post(
      'https://api.x.ai/v1/chat/completions',
      {
        model: 'grok-4-1-fast-reasoning',
        messages: [{ role: 'user', content: judgePrompt }],
        temperature: 0.7
      },
      {
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json'
        }
      }
    )
    
    const responseText = response.data.choices[0].message.content
    
    // Track usage for Grok call
    const responseTokens = extractTokensFromResponse(response.data, 'xai')
    let inputTokens = 0
    let outputTokens = 0
    
    if (responseTokens) {
      inputTokens = responseTokens.inputTokens || 0
      outputTokens = responseTokens.outputTokens || 0
    } else {
      inputTokens = await countTokens(judgePrompt, 'xai', 'grok-4-1-fast-reasoning')
      outputTokens = await countTokens(responseText, 'xai', 'grok-4-1-fast-reasoning')
    }
    
    trackUsage(userId, 'xai', 'grok-4-1-fast-reasoning', inputTokens, outputTokens)
    
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
      refiner: refinedData ? {
        primary: {
          facts_with_citations: refinedData.facts_with_citations || [],
          data_points: refinedData.data_points || [],
          tokens: refinedData.tokens || null
        }
      } : null,
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
        total: inputTokens + outputTokens
      },
      category: category,
      needsSearch: needsSearch,
      usedSearch: needsSearch && refinedData !== null,
      // Include debug data so frontend can update Facts/Sources and Pipeline Debug windows
      debugData: debugData,
      searchResults: searchResults,
      refinedData: refinedData ? {
        facts_with_citations: refinedData.facts_with_citations || [],
        data_points: refinedData.data_points || [],
        tokens: refinedData.tokens || null
      } : null
    })
  } catch (error) {
    console.error('[Judge Conversation] Error:', error)
    res.status(500).json({ error: 'Failed to get judge response: ' + error.message })
  }
})

// Continue conversation with a specific model (for individual response windows)
app.post('/api/model/conversation', async (req, res) => {
  try {
    const { userId, modelName, userMessage, originalResponse, conversationContext, responseId } = req.body
    
    if (!userId || !modelName || !userMessage) {
      return res.status(400).json({ error: 'userId, modelName, and userMessage are required' })
    }
    
    // Check subscription status
    const subscriptionCheck = checkSubscriptionStatus(userId)
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
    
    // Build prompt with context
    let prompt = ''
    if (conversationContext && conversationContext.trim()) {
      prompt = `Previous conversation context:\n${conversationContext}\n\n`
    }
    if (originalResponse && originalResponse.trim()) {
      prompt += `Your previous response that the user wants to continue discussing:\n${originalResponse.substring(0, 2000)}${originalResponse.length > 2000 ? '...' : ''}\n\n`
    }
    prompt += `User: ${userMessage}`
    
    let responseText = ''
    let inputTokens = 0
    let outputTokens = 0
    
    // Call the appropriate API based on provider
    if (provider === 'openai') {
      const apiKey = API_KEYS.openai
      if (!apiKey) {
        return res.status(400).json({ error: 'OpenAI API key not configured' })
      }
      
      const actualModel = model.includes('gpt-5') ? 'gpt-5.2' : (model.includes('gpt-4') ? 'gpt-4o' : model)
      const response = await axios.post(
        'https://api.openai.com/v1/chat/completions',
        {
          model: actualModel,
          messages: [{ role: 'user', content: prompt }],
          max_tokens: 2048,
        },
        { headers: { 'Authorization': `Bearer ${apiKey}` } }
      )
      
      responseText = response.data.choices[0].message.content
      inputTokens = response.data.usage?.prompt_tokens || 0
      outputTokens = response.data.usage?.completion_tokens || 0
      
    } else if (provider === 'anthropic') {
      const apiKey = API_KEYS.anthropic
      if (!apiKey) {
        return res.status(400).json({ error: 'Anthropic API key not configured' })
      }
      
      const actualModel = model.includes('claude-4') ? 'claude-4.5-opus' : model
      const response = await axios.post(
        'https://api.anthropic.com/v1/messages',
        {
          model: actualModel,
          max_tokens: 2048,
          messages: [{ role: 'user', content: prompt }],
        },
        { 
          headers: { 
            'x-api-key': apiKey,
            'anthropic-version': '2024-01-01',
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
      
      const actualModel = model.includes('gemini-3') ? `${model}-preview` : model
      const response = await axios.post(
        `https://generativelanguage.googleapis.com/v1beta/models/${actualModel}:generateContent?key=${apiKey}`,
        {
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: { maxOutputTokens: 2048 }
        }
      )
      
      responseText = response.data.candidates[0].content.parts[0].text
      const usageMetadata = response.data.usageMetadata || {}
      inputTokens = usageMetadata.promptTokenCount || 0
      outputTokens = usageMetadata.candidatesTokenCount || 0
      
    } else if (provider === 'xai') {
      const apiKey = API_KEYS.xai
      if (!apiKey) {
        return res.status(400).json({ error: 'xAI API key not configured' })
      }
      
      const response = await axios.post(
        'https://api.x.ai/v1/chat/completions',
        {
          model: model,
          messages: [{ role: 'user', content: prompt }],
          max_tokens: 2048,
        },
        { headers: { 'Authorization': `Bearer ${apiKey}` } }
      )
      
      responseText = response.data.choices[0].message.content
      inputTokens = response.data.usage?.prompt_tokens || 0
      outputTokens = response.data.usage?.completion_tokens || 0
      
    } else {
      return res.status(400).json({ error: `Unsupported provider: ${provider}` })
    }
    
    // Track usage
    trackUsage(userId, provider, model, inputTokens, outputTokens)
    
    console.log(`[Model Conversation] Response generated for ${modelName}, tokens: ${inputTokens}/${outputTokens}`)
    
    res.json({
      response: responseText,
      tokens: {
        input: inputTokens,
        output: outputTokens,
        total: inputTokens + outputTokens
      }
    })
    
  } catch (error) {
    console.error('[Model Conversation] Error:', error)
    res.status(500).json({ error: 'Failed to get model response: ' + error.message })
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
        lastActiveDate: null,
        lastLoginDate: null,
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
    lastActiveDate: userUsage.lastActiveDate || null,
  })
})

// Legacy function for backward compatibility (deprecated - use countTokens instead)
const estimateTokens = (text) => {
  console.warn('[Deprecated] estimateTokens() is deprecated. Use countTokens() with provider/model instead.')
  return estimateTokensFallback(text)
}

// Helper function to check if user has active subscription
const checkSubscriptionStatus = (userId) => {
  if (!userId) {
    console.log('[Subscription Check] No user ID provided')
    return { hasAccess: false, reason: 'No user ID provided' }
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

  if (status === 'active') {
    // Check if subscription hasn't expired
    if (user.subscriptionEndDate) {
      const endDate = new Date(user.subscriptionEndDate)
      const now = new Date()
      if (endDate < now) {
        console.log(`[Subscription Check] Subscription expired for user ${userId}: ${endDate} < ${now}`)
        return { hasAccess: false, reason: 'Subscription has expired' }
      }
    }
    console.log(`[Subscription Check] Access granted for user ${userId}`)
    return { hasAccess: true }
  }

  // Paused users don't have access (but are kept in database)
  if (status === 'paused') {
    console.log(`[Subscription Check] Access denied - subscription paused for user ${userId}`)
    return { hasAccess: false, reason: 'Subscription is paused. Please reactivate to continue.' }
  }

  console.log(`[Subscription Check] Access denied for user ${userId}: status is ${status}`)
  return { hasAccess: false, reason: `Subscription status: ${status}` }
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
      const subscriptionCheck = checkSubscriptionStatus(userId)
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

// Helper function for Serper search (used by both /api/search and RAG pipeline)
async function performSerperSearch(query, num = 10) {
  const apiKey = API_KEYS.serper
  if (!apiKey || apiKey.trim() === '') {
    throw new Error('No Serper API key configured. Please add SERPER_API_KEY to the backend .env file.')
  }

  console.log('[Serper] Search request:', { query, num })

  const response = await axios.post(
    'https://google.serper.dev/search',
    {
      q: query,
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
      const currentMonth = getCurrentMonth()
      
      // Increment total queries
      userUsage.totalQueries = (userUsage.totalQueries || 0) + 1
      
      // Increment monthly queries
      if (!userUsage.monthlyUsage[currentMonth]) {
        userUsage.monthlyUsage[currentMonth] = { tokens: 0, inputTokens: 0, outputTokens: 0, queries: 0, prompts: 0 }
      }
      userUsage.monthlyUsage[currentMonth].queries = (userUsage.monthlyUsage[currentMonth].queries || 0) + 1
      
      // Track daily query usage
      const today = new Date().toISOString().split('T')[0] // YYYY-MM-DD format
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
      
      writeUsage(usage)
      console.log(`[Query Tracking] User ${userId}: Total queries ${userUsage.totalQueries}, Monthly queries ${userUsage.monthlyUsage[currentMonth].queries}`)
      
      // Also add query cost to monthlyUsageCost in users.json
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
          writeUsers(users)
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
      // Filter out empty paragraphs and take first 3-4
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
    
    // If content is still very long, split by sentences and take first portion
    // This ensures we get roughly 3-4 paragraphs worth of content
    if (content.length > 2000) {
      // Split by sentence endings and take approximately first 3-4 paragraphs worth
      const sentences = content.match(/[^.!?]+[.!?]+/g) || [content]
      const firstSentences = sentences.slice(0, 12).join(' ') // ~3-4 paragraphs = ~12 sentences
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
  
  const refinerPrompt = `You are a data extraction engine. Extract ONLY relevant, useful factual information that directly helps answer the user's query.

CRITICAL REQUIREMENTS:
- Extract at least ONE fact from EACH of the first 5 parseable sources
- ONLY extract facts that are DIRECTLY RELEVANT to answering the user's query
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
        
        // Track usage if userId is provided
        if (userId) {
          trackUsage(userId, 'openai', 'gpt-4o-mini', inputTokens, outputTokens)
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
      
      // Track usage in database if userId is provided
      if (userId) {
        trackUsage(userId, 'google', modelName, inputTokens, outputTokens)
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
  
  const judgePrompt = `You are an expert judge analyzing two summaries of search results. Your task is to select the BEST summary based on:
1. Better and more number of facts with valid source citations
2. Relevance to the user's query

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
    const apiKey = API_KEYS.xai
    if (!apiKey) {
      console.log('[Judge] xAI API key not configured, using citation count as fallback')
      return backupCitationCount > primaryCitationCount ? backupRefined : primaryRefined
    }
    
    const response = await axios.post(
      'https://api.x.ai/v1/chat/completions',
      {
        model: 'grok-4-1-fast-reasoning',
        messages: [{ role: 'user', content: judgePrompt }],
        temperature: 0.3
      },
      {
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json'
        }
      }
    )
    
      const content = response.data.choices[0].message.content
      
      // Track usage for judge refiner selection (xAI/Grok) and get token info
      if (content) {
        const responseTokens = extractTokensFromResponse(response.data, 'xai')
        let inputTokens = 0
        let outputTokens = 0
        
        if (responseTokens) {
          inputTokens = responseTokens.inputTokens || 0
          outputTokens = responseTokens.outputTokens || 0
        } else {
          inputTokens = await countTokens(judgePrompt, 'xai', 'grok-4-1-fast-reasoning')
          outputTokens = await countTokens(content, 'xai', 'grok-4-1-fast-reasoning')
        }
        
        // Track usage if userId is provided
        if (userId) {
          trackUsage(userId, 'xai', 'grok-4-1-fast-reasoning', inputTokens, outputTokens)
        }
        
        judgeTokenInfo = {
          input: inputTokens,
          output: outputTokens,
          total: inputTokens + outputTokens,
          provider: 'xai',
          model: 'grok-4-1-fast-reasoning',
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
  
  const judgePrompt = `You are a judge analyzing responses from multiple AI models.

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
- [Any points where models disagree - explain the difference]
(If no disagreements exist, write "None identified.")`



  try {
    const apiKey = API_KEYS.xai
    if (!apiKey) {
      throw new Error('xAI API key not configured')
    }
    
    const response = await axios.post(
      'https://api.x.ai/v1/chat/completions',
      {
        model: 'grok-4-1-fast-reasoning',
        messages: [{ role: 'user', content: judgePrompt }],
        temperature: 0.7
      },
      {
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json'
        }
      }
    )
    
    const content = response.data.choices[0].message.content
    
    // Track usage for judge finalization (xAI/Grok) and get token info
    let judgeTokenInfo = null
    if (content) {
      const responseTokens = extractTokensFromResponse(response.data, 'xai')
      let inputTokens = 0
      let outputTokens = 0
      
      if (responseTokens) {
        inputTokens = responseTokens.inputTokens || 0
        outputTokens = responseTokens.outputTokens || 0
      } else {
        inputTokens = await countTokens(judgePrompt, 'xai', 'grok-4-1-fast-reasoning')
        outputTokens = await countTokens(content, 'xai', 'grok-4-1-fast-reasoning')
      }
      
      // Track usage if userId is provided
      if (userId) {
        trackUsage(userId, 'xai', 'grok-4-1-fast-reasoning', inputTokens, outputTokens)
      }
      
      judgeTokenInfo = {
        input: inputTokens,
        output: outputTokens,
        total: inputTokens + outputTokens,
        provider: 'xai',
        model: 'grok-4-1-fast-reasoning',
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
    const disagreementsMatch = content.match(/(?:^|\n)\s*(?:\d+\.\s*)?(?:\*\*)?DISAGREEMENTS(?:\*\*)?[:\-]?\s*\n?([\s\S]+?)$/im)
    
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
                                    l.toLowerCase().includes('write "none')
          const isEmpty = !l || l.length < 5
          const isNone = l.toLowerCase().includes('none identified')
          const isGarbage = l.match(/^\*+:?$/)
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

// Summarize Grok response using Gemini 2.5 Flash Lite (max 75 tokens)
const summarizeGrokResponse = async (grokResponse, userId = null) => {
  console.log('[Summarize] Summarizing Grok response using Gemini 2.5 Flash Lite')
  
  const summaryPrompt = `Summarize this response in 75 tokens or less. Be concise but preserve key information and context:

${grokResponse}

Provide only the summary (max 75 tokens):`
  
  try {
    const apiKey = API_KEYS.google
    if (!apiKey) {
      console.warn('[Summarize] Google API key not configured, using fallback truncation')
      // Fallback: simple truncation
      return { 
        summary: grokResponse.substring(0, 200) + (grokResponse.length > 200 ? '...' : ''), 
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
      
      trackUsage(userId, 'google', 'gemini-2.5-flash-lite', inputTokens, outputTokens)
    }
    
    console.log(`[Summarize] Summary created: ${tokens} tokens`)
    return { summary, tokens }
  } catch (error) {
    console.error('[Summarize] Error summarizing Grok response:', error)
    // Fallback: simple truncation
    return { 
      summary: grokResponse.substring(0, 200) + (grokResponse.length > 200 ? '...' : ''), 
      tokens: 50 // Estimate
    }
  }
}

// Store judge conversation context (rolling window of 5 - position 0 is full, positions 1-4 are summarized)
const storeJudgeContext = async (userId, grokResponse, originalPrompt = null) => {
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
      const { summary, tokens } = await summarizeGrokResponse(context[0].response, userId)
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
      response: grokResponse, // Store full response
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
        judge_analysis: null,
        debug_data: {
          categoryDetection: null,
          search: {
            query: query,
            results: [],
            error: serperError.message
          },
          refiner: null,
          council: [],
          judgeFinalization: null
        }
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
      const currentMonth = getCurrentMonth()
      
      // Increment total queries
      userUsage.totalQueries = (userUsage.totalQueries || 0) + 1
      
      // Increment monthly queries
      if (!userUsage.monthlyUsage[currentMonth]) {
        userUsage.monthlyUsage[currentMonth] = { tokens: 0, inputTokens: 0, outputTokens: 0, queries: 0, prompts: 0 }
      }
      userUsage.monthlyUsage[currentMonth].queries = (userUsage.monthlyUsage[currentMonth].queries || 0) + 1
      
      // Track daily query usage
      const today = new Date().toISOString().split('T')[0] // YYYY-MM-DD format
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
      
      writeUsage(usage)
      console.log(`[Query Tracking] User ${userId}: Total queries ${userUsage.totalQueries}, Monthly queries ${userUsage.monthlyUsage[currentMonth].queries}`)
      
      // Also add query cost to monthlyUsageCost in users.json
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
          writeUsers(users)
          console.log(`[Query Tracking] Added $${queryCost.toFixed(6)} query cost. New total: $${user.monthlyUsageCost[currentMonth].toFixed(4)}`)
        }
      } catch (costErr) {
        console.error('[Query Tracking] Error updating monthlyUsageCost:', costErr)
      }
    }
    
    console.log(`[RAG Pipeline] Search completed, found ${searchResults.length} results`)
    
    // Query tracking is already handled by /api/search endpoint, so we don't need to track it again here
    
    // Stage 2: Primary Refiner (Gemini 2.5 Flash-lite)
    console.log('[RAG Pipeline] Stage 2: Primary refiner (Gemini 2.5 Flash-lite)...')
    let primaryRefined
    try {
      primaryRefined = await refinerStep(query, searchResults, false, userId)
      console.log('[RAG Pipeline] Primary refiner completed. Tokens:', {
        hasTokens: !!primaryRefined?.tokens,
        tokens: primaryRefined?.tokens,
        input: primaryRefined?.tokens?.input,
        output: primaryRefined?.tokens?.output,
        total: primaryRefined?.tokens?.total
      })
    } catch (refinerError) {
      console.error('[RAG Pipeline] Refiner step error:', refinerError.message)
      console.error('[RAG Pipeline] Refiner error details:', refinerError.response?.data || refinerError.message)
      throw new Error(`Refiner step failed: ${refinerError.message}`)
    }
    
    let refinedData = primaryRefined
    let backupRefined = null
    
    // Check if backup refiner is needed (>30% discard rate)
    if (primaryRefined.discard_rate > 0.3) {
      console.log(`[RAG Pipeline] High discard rate (${(primaryRefined.discard_rate * 100).toFixed(1)}%), triggering backup refiner`)
      
      // Stage 2b: Backup Refiner (GPT-4o-mini) - performs NEW Serper query
      console.log('[RAG Pipeline] Stage 2b: Backup refiner (GPT-4o-mini) with new search...')
      let backupSerperData
      try {
        // Request 5 results for backup refiner too
        backupSerperData = await performSerperSearch(query, 5)
        console.log('[RAG Pipeline] Backup Serper search successful, results:', backupSerperData?.organic?.length || 0)
      } catch (backupSerperError) {
        console.error('[RAG Pipeline] Backup Serper search failed:', backupSerperError.message)
        // Continue with empty results - refiner will handle NOT_FOUND
        backupSerperData = { organic: [] }
      }
      
      const backupSearchResults = (backupSerperData?.organic || []).map(r => ({
        title: r.title,
        link: r.link,
        snippet: r.snippet
      }))
      
      backupRefined = await refinerStep(query, backupSearchResults, true, userId)
      console.log('[RAG Pipeline] Backup refiner completed. Tokens:', {
        hasTokens: !!backupRefined?.tokens,
        tokens: backupRefined?.tokens,
        input: backupRefined?.tokens?.input,
        output: backupRefined?.tokens?.output,
        total: backupRefined?.tokens?.total
      })
      
      // Stage 2c: Judge selects best refiner summary
      console.log('[RAG Pipeline] Stage 2c: Judge comparing refiner summaries...')
      refinedData = await judgeRefinerSelection(query, primaryRefined, backupRefined, userId)
      console.log(`[RAG Pipeline] Judge selected best summary (${refinedData.facts_with_citations.length} facts with citations)`)
    } else {
      console.log(`[RAG Pipeline] Primary refiner passed verification (${(primaryRefined.discard_rate * 100).toFixed(1)}% discard rate), proceeding to council`)
    }
    
    // Stage 3: Council (parallel processing)
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
      
      // Format refined data for council prompt
      console.log(`[RAG Pipeline] Council: Preparing prompt for ${modelId}`)
      console.log(`[RAG Pipeline] Council: Refined data points count: ${refinedData.data_points?.length || 0}`)
      console.log(`[RAG Pipeline] Council: First 3 data points:`, refinedData.data_points?.slice(0, 3) || 'none')
      
      // Format facts with citations for council prompt
      let factsWithSourcesText = ''
      if (refinedData.facts_with_citations && refinedData.facts_with_citations.length > 0) {
        factsWithSourcesText = refinedData.facts_with_citations.map((factObj, idx) => {
          const fact = factObj.fact || factObj
          const sourceQuote = factObj.source_quote || ''
          return `${idx + 1}. ${fact}${sourceQuote ? `\n   [SOURCE QUOTE]: "${sourceQuote}"` : ''}`
        }).join('\n\n')
      } else if (refinedData.data_points && refinedData.data_points.length > 0) {
        // Fallback to data_points if facts_with_citations not available
        factsWithSourcesText = refinedData.data_points.map((p, idx) => `${idx + 1}. ${p}`).join('\n\n')
      } else {
        factsWithSourcesText = 'No factual data points found (NOT FOUND)'
      }
      
      const councilPrompt = `You are analyzing factual information that was extracted from recent web search results. This data is current and up-to-date from the internet.

INSTRUCTIONS:
1. TRUST the provided sources - they come from verified web sources, not your training data cutoff
2. Keep your response CONCISE - aim for 3-4 paragraphs maximum
3. When referencing sources in your response, refer to them by their number (e.g., "see source 4", "as stated in source 2", "source 1 indicates").
4. Do NOT question the validity of sources based on your training data - the web search provides more recent information
5. Provide a clear, direct answer to the user's query using these sources

User Query: ${query}

Verified Sources from Web Search (numbered for easy reference):
${factsWithSourcesText}`
      
      console.log(`[RAG Pipeline] Council: Prompt length: ${councilPrompt.length} chars`)
      console.log(`[RAG Pipeline] Council: Facts with sources text length: ${factsWithSourcesText.length} chars`)
      
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
            source: tokenSource
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
              source: tokenSource
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
              source: tokenSource
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
    
    // Stage 4: Judge (final analysis) - only if 2 or more models were used
    let judgeAnalysis = null
    if (selectedModels.length >= 2) {
      console.log('[RAG Pipeline] Stage 4: Judge finalization (2+ models detected)...')
      judgeAnalysis = await judgeFinalization(query, councilResponses, userId)
      
      // Store the initial summary in conversation context (summarize with Gemini and store)
      if (userId && judgeAnalysis?.response) {
        storeJudgeContext(userId, judgeAnalysis.response, judgeAnalysis.prompt || null).catch(err => {
          console.error('[RAG Pipeline] Error storing initial judge summary:', err)
        })
      }
    } else {
      console.log('[RAG Pipeline] Skipping judge finalization (only 1 model selected)')
    }
    
    console.log('[RAG Pipeline] Pipeline complete!')
    
    // Build comprehensive debug data
    console.log('[RAG Pipeline] Building debug data...')
    console.log('[RAG Pipeline] Search results count:', searchResults.length)
    console.log('[RAG Pipeline] Primary refiner facts count:', primaryRefined.facts_with_citations?.length || 0)
    console.log('[RAG Pipeline] Refined data points count:', refinedData.data_points?.length || 0)
    console.log('[RAG Pipeline] Council responses count:', councilResponses.length)
    
    const debugData = {
      categoryDetection: null, // Will be set by frontend
      search: {
        query: query,
        results: searchResults
      },
      refiner: {
        primary: {
          model: primaryRefined.model || 'gemini-2.5-flash-lite',
          prompt: primaryRefined.prompt,
          response: primaryRefined.response,
          data_points: primaryRefined.data_points || [],
          facts_with_citations: primaryRefined.facts_with_citations || [],
          discard_rate: primaryRefined.discard_rate || 0
        },
        backup: backupRefined ? {
          model: backupRefined.model || 'gpt-4o-mini',
          prompt: backupRefined.prompt,
          response: backupRefined.response,
          data_points: backupRefined.data_points || [],
          facts_with_citations: backupRefined.facts_with_citations || [],
          discard_rate: backupRefined.discard_rate || 0
        } : null,
        judgeSelection: refinedData.judgePrompt ? {
          prompt: refinedData.judgePrompt,
          response: refinedData.judgeResponse,
          reasoning: refinedData.judgeReasoning,
          selected: refinedData.selected
        } : null
      },
      council: councilResponses.map(r => ({
        model: r.model_name,
        actual_model: r.actual_model_name,
        prompt: r.prompt,
        response: r.response,
        error: r.error
      })),
      judgeFinalization: judgeAnalysis ? {
        prompt: judgeAnalysis.prompt,
        response: judgeAnalysis.response,
        consensus: judgeAnalysis.consensus,
        summary: judgeAnalysis.summary,
        agreements: judgeAnalysis.agreements,
        disagreements: judgeAnalysis.disagreements
      } : null
    }
    
    console.log('[RAG Pipeline] Debug data structure:', {
      hasSearch: !!debugData.search,
      hasRefiner: !!debugData.refiner,
      hasCouncil: !!debugData.council,
      hasJudge: !!debugData.judgeFinalization,
      searchResultsCount: debugData.search.results.length,
      refinerFactsCount: debugData.refiner.primary.facts_with_citations.length,
      councilCount: debugData.council.length
    })
    
    // Log what we're sending in the response
    console.log('[RAG Pipeline] Preparing response with refiner_tokens:', {
      primaryRefinedHasTokens: !!primaryRefined?.tokens,
      backupRefinedHasTokens: !!backupRefined?.tokens,
      primaryRefinedTokens: primaryRefined?.tokens,
      backupRefinedTokens: backupRefined?.tokens,
      judgeFinalizationTokens: judgeAnalysis?.tokens
    })
    
    return res.json({
      query,
      search_results: searchResults,
      refined_data: {
        data_points: refinedData.data_points,
        facts_with_citations: refinedData.facts_with_citations,
        found: refinedData.found,
        discard_rate: refinedData.discard_rate,
        backup_used: backupRefined !== null
      },
      council_responses: councilResponses,
      judge_analysis: judgeAnalysis,
      debug_data: debugData,
      // Include token info for refiner and judge models
      refiner_tokens: {
        primary: primaryRefined?.tokens || null,
        backup: backupRefined?.tokens || null,
        judge_selection: refinedData?.judgeTokens || null
      },
      judge_finalization_tokens: judgeAnalysis?.tokens || null
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
    
    const userList = Object.values(users).map(user => {
      const userUsage = usage[user.id]
      
      // Check if user has been active within the last month
      // ALWAYS use users.json dates for status calculation (most authoritative source)
      // Only use usage.json as fallback if users.json doesn't have the date
      // This ensures status is based on the authoritative source, not potentially stale usage.json data
      const lastActiveDate = user.lastActiveDate || userUsage?.lastActiveDate
      // For status calculation, ALWAYS prefer users.json lastLoginDate
      // Only use usage.json if users.json doesn't have it
      const lastLoginDate = user.lastLoginDate || userUsage?.lastLoginDate
      
      let isActive = false
      if (lastActiveDate || lastLoginDate) {
        const now = new Date()
        const oneMonthAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000) // 30 days ago
        
        // Check last active date (from prompts/interactions)
        if (lastActiveDate) {
          const lastActive = new Date(lastActiveDate)
          if (lastActive >= oneMonthAgo) {
            isActive = true
          }
        }
        
        // Check last login date
        if (!isActive && lastLoginDate) {
          const lastLogin = new Date(lastLoginDate)
          if (lastLogin >= oneMonthAgo) {
            isActive = true
          }
        }
      }
      
      // Determine status
      let status = 'inactive'
      if (user.canceled === true || user.status === 'canceled') {
        status = 'canceled'
      } else if (isActive) {
        status = 'active'
      }
      
      // Update users.json with status and dates
      if (users[user.id]) {
        // Update dates if we have them from usage.json but not in users.json
        if (lastActiveDate && (!users[user.id].lastActiveDate || new Date(users[user.id].lastActiveDate) < new Date(lastActiveDate))) {
          users[user.id].lastActiveDate = lastActiveDate
        }
        // Only update lastLoginDate if usage.json has a MORE RECENT date than users.json
        // This prevents overwriting users.json with stale/incorrect data from usage.json
        if (userUsage?.lastLoginDate) {
          const usersDate = users[user.id].lastLoginDate ? new Date(users[user.id].lastLoginDate) : null
          const usageDate = new Date(userUsage.lastLoginDate)
          // Only update if usage.json date is more recent AND users.json date doesn't exist or is older
          if (!usersDate || usageDate > usersDate) {
            users[user.id].lastLoginDate = userUsage.lastLoginDate
          }
        } else if (lastLoginDate && !users[user.id].lastLoginDate) {
          // If users.json doesn't have it and usage.json doesn't have it, use the calculated value
          users[user.id].lastLoginDate = lastLoginDate
        }
        // Always update status (unless user is canceled)
        if (users[user.id].status !== 'canceled' && users[user.id].canceled !== true) {
          users[user.id].status = status
        }
        writeUsers(users)
      }
      
      return {
        id: user.id,
        username: user.username,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        createdAt: user.createdAt,
        isAdmin: admins.admins.includes(user.id),
        status: status,
        lastActiveDate: user.lastActiveDate || lastActiveDate || null,
        lastLoginDate: user.lastLoginDate || lastLoginDate || null,
      }
    })
    
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
    
    // Add to MongoDB admins collection
    await db.admins.add(userId)
    
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
    
    // Remove from MongoDB admins collection
    await db.admins.remove(userId)
    
    // Update local cache
    adminsCache.admins = adminsCache.admins.filter(id => id !== userId)
    
    console.log(`[Admin] Removed admin: ${userId}`)
    res.json({ success: true, message: 'Admin removed successfully' })
  } catch (error) {
    console.error('[Admin] Error removing admin:', error)
    res.status(500).json({ error: 'Failed to remove admin' })
  }
})

// ==================== LEADERBOARD ENDPOINTS ====================

// Submit a prompt to the leaderboard
app.post('/api/leaderboard/submit', async (req, res) => {
  console.log('[Leaderboard] Submit endpoint hit:', { userId: req.body?.userId, hasPromptText: !!req.body?.promptText })
  try {
    const { userId, promptText, category, responses, summary, facts, sources } = req.body
    
    if (!userId || !promptText || !promptText.trim()) {
      console.log('[Leaderboard] Missing required fields:', { userId: !!userId, promptText: !!promptText })
      return res.status(400).json({ error: 'userId and promptText are required' })
    }
    
    const users = readUsers()
    const user = users[userId]
    
    if (!user) {
      return res.status(404).json({ error: 'User not found' })
    }
    
    // Save to JSON (backward compatibility)
    const leaderboard = readLeaderboard()
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
app.delete('/api/leaderboard/delete/:promptId', (req, res) => {
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
    
    // Remove the prompt from the leaderboard
    leaderboard.prompts.splice(promptIndex, 1)
    writeLeaderboard(leaderboard)
    
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
    
    res.json({
      wins: wins.sort((a, b) => new Date(b.date) - new Date(a.date)),
      winCount: wins.length,
      notifications: notifications.slice(0, 10), // Last 10 notifications
      totalLikes: userPrompts.reduce((sum, p) => sum + (p.likes?.length || 0), 0),
      totalPrompts: userPrompts.length,
    })
  } catch (error) {
    console.error('[Leaderboard] Error fetching user stats:', error)
    res.status(500).json({ error: 'Failed to fetch user stats' })
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
      writeUsers(users)
      console.log(`[Stripe] Created new customer ${customerId} for user ${userId}`)
    }
    
    // Create a Checkout session in setup mode (just to save card, no payment)
    const session = await stripe.checkout.sessions.create({
      customer: customerId,
      payment_method_types: ['card'],
      mode: 'setup',
      success_url: `${req.headers.origin || 'http://localhost:5173'}/statistics?card_added=success`,
      cancel_url: `${req.headers.origin || 'http://localhost:5173'}/statistics?card_added=canceled`,
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

// Buy additional usage credits
app.post('/api/stripe/buy-usage', async (req, res) => {
  try {
    const { userId, amount, fee, total } = req.body
    
    if (!userId || !amount || amount <= 0) {
      return res.status(400).json({ error: 'userId and valid amount are required' })
    }
    
    // Validate amounts
    if (amount < 1 || amount > 500) {
      return res.status(400).json({ error: 'Amount must be between $1 and $500' })
    }
    
    const users = readUsers()
    const user = users[userId]
    
    if (!user) {
      return res.status(404).json({ error: 'User not found' })
    }
    
    if (!user.stripeCustomerId) {
      return res.status(400).json({ error: 'No payment method on file. Please subscribe first.' })
    }
    
    // Get the customer's default payment method
    let paymentMethodId = null
    
    const customer = await stripe.customers.retrieve(user.stripeCustomerId, {
      expand: ['invoice_settings.default_payment_method']
    })
    
    if (customer.invoice_settings?.default_payment_method) {
      paymentMethodId = customer.invoice_settings.default_payment_method.id
    } else {
      // Try to get any payment method attached to customer
      const paymentMethods = await stripe.paymentMethods.list({
        customer: user.stripeCustomerId,
        type: 'card',
        limit: 1,
      })
      
      if (paymentMethods.data.length > 0) {
        paymentMethodId = paymentMethods.data[0].id
      }
    }
    
    if (!paymentMethodId) {
      return res.status(400).json({ error: 'No payment method on file' })
    }
    
    // Calculate total with 5% fee
    const calculatedFee = amount * 0.05
    const calculatedTotal = amount + calculatedFee
    
    // Convert to cents for Stripe
    const totalCents = Math.round(calculatedTotal * 100)
    
    console.log(`[Buy Usage] User ${userId} purchasing $${amount} usage credits (+ $${calculatedFee.toFixed(2)} fee = $${calculatedTotal.toFixed(2)} total)`)
    
    // Create a payment intent and confirm it immediately
    const paymentIntent = await stripe.paymentIntents.create({
      amount: totalCents,
      currency: 'usd',
      customer: user.stripeCustomerId,
      payment_method: paymentMethodId,
      confirm: true,
      off_session: true,
      description: `Usage credits purchase: $${amount.toFixed(2)}`,
      metadata: {
        userId: userId,
        usageAmount: amount.toString(),
        fee: calculatedFee.toFixed(2),
        type: 'usage_purchase'
      }
    })
    
    if (paymentIntent.status !== 'succeeded') {
      console.error(`[Buy Usage] Payment failed with status: ${paymentIntent.status}`)
      return res.status(400).json({ error: 'Payment failed. Please try again.' })
    }
    
    console.log(`[Buy Usage] Payment successful! PaymentIntent: ${paymentIntent.id}`)
    
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
        lastActiveDate: null,
        lastLoginDate: null,
        streakDays: 0,
        judgeConversationContext: [],
      }
    }
    
    // Initialize purchasedCredits if not exists
    if (!usage[userId].purchasedCredits) {
      usage[userId].purchasedCredits = {
        total: 0,
        remaining: 0,
        purchases: []
      }
    }
    
    // Add the purchase
    usage[userId].purchasedCredits.total += amount
    usage[userId].purchasedCredits.remaining += amount
    usage[userId].purchasedCredits.purchases.push({
      amount: amount,
      fee: calculatedFee,
      total: calculatedTotal,
      paymentIntentId: paymentIntent.id,
      timestamp: new Date().toISOString()
    })
    
    writeUsage(usage)
    
    console.log(`[Buy Usage] Added $${amount} usage credits to user ${userId}. New balance: $${usage[userId].purchasedCredits.remaining}`)
    
    res.json({
      success: true,
      message: `Successfully purchased $${amount.toFixed(2)} in usage credits`,
      creditsAdded: amount,
      newBalance: usage[userId].purchasedCredits.remaining,
      paymentIntentId: paymentIntent.id
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

// Sync subscription status from Stripe API
const syncSubscriptionFromStripe = async (userId) => {
  try {
    const users = readUsers()
    const user = users[userId]
    
    if (!user || !user.stripeCustomerId) {
      return { synced: false, reason: 'No Stripe customer ID' }
    }

    // Get all subscriptions for this customer from Stripe
    const subscriptions = await stripe.subscriptions.list({
      customer: user.stripeCustomerId,
      status: 'all',
      limit: 10,
    })

    if (subscriptions.data.length === 0) {
      // No subscriptions found in Stripe
      if (user.subscriptionStatus !== 'inactive') {
        user.subscriptionStatus = 'inactive'
        user.stripeSubscriptionId = null
        user.subscriptionEndDate = null
        writeUsers(users)
        console.log(`[Stripe] Synced subscription status to inactive for user: ${userId}`)
        return { synced: true, status: 'inactive' }
      }
      return { synced: false, reason: 'No subscriptions in Stripe' }
    }

    // Get the most recent active subscription (or the most recent one if none are active)
    const activeSubscription = subscriptions.data.find(sub => sub.status === 'active')
    const subscription = activeSubscription || subscriptions.data[0]

    // Update user's subscription info
    const oldStatus = user.subscriptionStatus
    user.stripeSubscriptionId = subscription.id
    user.subscriptionStatus = subscription.status
    user.subscriptionEndDate = new Date(subscription.current_period_end * 1000).toISOString()
    
    writeUsers(users)
    
    if (oldStatus !== subscription.status) {
      console.log(`[Stripe] Synced subscription status from Stripe for user ${userId}: ${oldStatus} → ${subscription.status}`)
    }
    
    return { 
      synced: true, 
      status: subscription.status,
      subscriptionId: subscription.id,
      endDate: user.subscriptionEndDate
    }
  } catch (error) {
    console.error(`[Stripe] Error syncing subscription from Stripe for user ${userId}:`, error)
    return { synced: false, error: error.message }
  }
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
          subscriptionEndDate: updatedUser.subscriptionEndDate || null,
          hasActiveSubscription: updatedUser.subscriptionStatus === 'active',
          synced: true,
        })
      }
    }

    res.json({
      subscriptionStatus: user.subscriptionStatus || 'inactive',
      subscriptionEndDate: user.subscriptionEndDate || null,
      hasActiveSubscription: user.subscriptionStatus === 'active',
      synced: false,
    })
  } catch (error) {
    console.error('[Stripe] Error getting subscription status:', error)
    res.status(500).json({ error: 'Failed to get subscription status' })
  }
})

// Create Stripe Checkout Session for subscription
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
      writeUsers(users)
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
      success_url: `${req.headers.origin || 'http://localhost:5173'}/settings?subscription=success`,
      cancel_url: `${req.headers.origin || 'http://localhost:5173'}/settings?subscription=canceled`,
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

    // Cancel the subscription in Stripe (this will stop recurring payments)
    await stripe.subscriptions.cancel(user.stripeSubscriptionId)

    // Update user status to 'paused' (keep user in database)
    user.subscriptionStatus = 'paused'
    user.subscriptionEndDate = null
    // Keep stripeSubscriptionId for reference but subscription is canceled in Stripe
    writeUsers(users)

    console.log(`[Stripe] Subscription paused for user: ${userId}`)
    res.json({ success: true, message: 'Subscription paused successfully' })
  } catch (error) {
    console.error('[Stripe] Error pausing subscription:', error)
    res.status(500).json({ error: 'Failed to pause subscription' })
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

    // Delete user from database
    delete users[userId]
    writeUsers(users)

    // Also delete user usage data if it exists
    const usage = readUsage()
    if (usage[userId]) {
      delete usage[userId]
      writeUsage(usage)
    }

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
    const FREE_MONTHLY_ALLOCATION = 5.00
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
    
    // Calculate overage (cost above $5 free allocation)
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
      writeUsers(users)
      
      console.log(`[Billing] Billed $${amountToBill.toFixed(2)} overage for user ${userId} for ${month}`)
      return { overage, billed: true, amountBilled: amountToBill }
    }
    
    writeUsers(users)
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
          user.subscriptionEndDate = new Date(subscription.current_period_end * 1000).toISOString()

          writeUsers(users)
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
          user.subscriptionStatus = 'canceled'
          user.subscriptionEndDate = new Date(subscription.current_period_end * 1000).toISOString()
          // Keep subscription ID for reference

          writeUsers(users)
          console.log(`[Stripe] Subscription canceled for user: ${userId}`)
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
          user.subscriptionEndDate = new Date(subscription.current_period_end * 1000).toISOString()
          user.subscriptionStatus = subscription.status

          writeUsers(users)
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

          writeUsers(users)
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
// SERVER STARTUP
// ============================================================================
const startServer = async () => {
  // Initialize database connection
  await initDatabase()
  
  // Load cache from MongoDB
  console.log('[Server] Loading data from MongoDB...')
  await loadCacheFromMongoDB()
  
  // Start HTTP server
  app.listen(PORT, () => {
    console.log('')
    console.log('═══════════════════════════════════════════════════')
    console.log(`🚀 ARKTEK Backend Server - http://localhost:${PORT}`)
    console.log('═══════════════════════════════════════════════════')
    console.log(`📡 LLM API Proxy:     Ready`)
    console.log(`🔍 Serper Search:     Ready`)
    console.log(`🗄️  MongoDB:          Connected (Primary Store)`)
    console.log(`👑 Admin Endpoints:   Ready`)
    console.log(`🏆 Leaderboard:       Ready`)
    console.log('═══════════════════════════════════════════════════')
    console.log('')
  })
}

startServer().catch(error => {
  console.error('[Server] Failed to start:', error)
  process.exit(1)
})


