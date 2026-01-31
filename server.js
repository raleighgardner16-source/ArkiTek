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

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

dotenv.config()

const app = express()
const PORT = process.env.PORT || 3001

// User data storage file
const USERS_FILE = path.join(__dirname, 'ADMIN', 'users.json')
const USAGE_FILE = path.join(__dirname, 'ADMIN', 'usage.json')
const ADMINS_FILE = path.join(__dirname, 'ADMIN', 'admins.json')
const DELETED_USERS_FILE = path.join(__dirname, 'ADMIN', 'deleted_users.json')

// Helper functions for user storage
const readUsers = () => {
  try {
    if (fs.existsSync(USERS_FILE)) {
      const data = fs.readFileSync(USERS_FILE, 'utf8')
      if (data.trim() === '') {
        return {}
      }
      return JSON.parse(data)
    }
  } catch (error) {
    console.error('Error reading users file:', error)
  }
  return {}
}

const writeUsers = (users) => {
  try {
    fs.writeFileSync(USERS_FILE, JSON.stringify(users, null, 2))
  } catch (error) {
    console.error('Error writing users file:', error)
  }
}

// Helper functions for admin storage
const readAdmins = () => {
  try {
    if (fs.existsSync(ADMINS_FILE)) {
      const data = fs.readFileSync(ADMINS_FILE, 'utf8')
      if (data.trim() === '') {
        return { admins: [] }
      }
      return JSON.parse(data)
    }
  } catch (error) {
    console.error('Error reading admins file:', error)
  }
  return { admins: [] }
}

const isAdmin = (userId) => {
  const admins = readAdmins()
  console.log(`[Admin Check] Checking if ${userId} is admin. Admins list:`, admins.admins)
  const result = admins.admins.includes(userId)
  console.log(`[Admin Check] Result for ${userId}:`, result)
  return result
}

// Helper functions for deleted users tracking
const readDeletedUsers = () => {
  try {
    if (fs.existsSync(DELETED_USERS_FILE)) {
      const data = fs.readFileSync(DELETED_USERS_FILE, 'utf8')
      if (data.trim() === '') {
        return { count: 0 }
      }
      return JSON.parse(data)
    }
  } catch (error) {
    console.error('Error reading deleted users file:', error)
  }
  return { count: 0 }
}

const writeDeletedUsers = (data) => {
  try {
    fs.writeFileSync(DELETED_USERS_FILE, JSON.stringify(data, null, 2))
  } catch (error) {
    console.error('Error writing deleted users file:', error)
  }
}

const incrementDeletedUsers = () => {
  const deletedUsers = readDeletedUsers()
  deletedUsers.count = (deletedUsers.count || 0) + 1
  writeDeletedUsers(deletedUsers)
  return deletedUsers.count
}

// Helper functions for usage tracking
const readUsage = () => {
  try {
    if (fs.existsSync(USAGE_FILE)) {
      const data = fs.readFileSync(USAGE_FILE, 'utf8')
      return JSON.parse(data)
    }
  } catch (error) {
    console.error('Error reading usage file:', error)
  }
  return {}
}

const writeUsage = (usage) => {
  try {
    fs.writeFileSync(USAGE_FILE, JSON.stringify(usage, null, 2))
  } catch (error) {
    console.error('Error writing usage file:', error)
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
const trackPrompt = (userId, promptText, category) => {
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
    userUsage.promptHistory.unshift({
      text: promptText.substring(0, 500), // Limit to 500 chars
      category: category || 'general',
      timestamp: new Date().toISOString(),
    })
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
    userUsage.categoryPrompts[cat].unshift({
      text: promptText.substring(0, 500), // Limit to 500 chars
      timestamp: new Date().toISOString(),
    })
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

// Track usage for a user
const trackUsage = (userId, provider, model, inputTokens, outputTokens) => {
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

  // Update totals
  userUsage.totalTokens += tokensUsed
  userUsage.totalInputTokens = (userUsage.totalInputTokens || 0) + inputTokens
  userUsage.totalOutputTokens = (userUsage.totalOutputTokens || 0) + outputTokens
  // Note: totalQueries is now only incremented when Serper queries are made, not for LLM calls

  // Update monthly usage
  if (!userUsage.monthlyUsage[currentMonth]) {
    userUsage.monthlyUsage[currentMonth] = { tokens: 0, inputTokens: 0, outputTokens: 0, queries: 0, prompts: 0 }
  }
  userUsage.monthlyUsage[currentMonth].tokens += tokensUsed
  userUsage.monthlyUsage[currentMonth].inputTokens = (userUsage.monthlyUsage[currentMonth].inputTokens || 0) + inputTokens
  userUsage.monthlyUsage[currentMonth].outputTokens = (userUsage.monthlyUsage[currentMonth].outputTokens || 0) + outputTokens
  // Note: queries are now only incremented when Serper queries are made, not for LLM calls

  // Update provider stats
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
  userUsage.providers[provider].totalTokens += tokensUsed
  userUsage.providers[provider].totalInputTokens = (userUsage.providers[provider].totalInputTokens || 0) + inputTokens
  userUsage.providers[provider].totalOutputTokens = (userUsage.providers[provider].totalOutputTokens || 0) + outputTokens
  // Note: provider queries are now only incremented when Serper queries are made, not for LLM calls
  if (!userUsage.providers[provider].monthlyTokens[currentMonth]) {
    userUsage.providers[provider].monthlyTokens[currentMonth] = 0
    userUsage.providers[provider].monthlyInputTokens = userUsage.providers[provider].monthlyInputTokens || {}
    userUsage.providers[provider].monthlyOutputTokens = userUsage.providers[provider].monthlyOutputTokens || {}
    userUsage.providers[provider].monthlyInputTokens[currentMonth] = 0
    userUsage.providers[provider].monthlyOutputTokens[currentMonth] = 0
    userUsage.providers[provider].monthlyQueries[currentMonth] = 0
  }
  userUsage.providers[provider].monthlyTokens[currentMonth] += tokensUsed
  userUsage.providers[provider].monthlyInputTokens[currentMonth] = (userUsage.providers[provider].monthlyInputTokens[currentMonth] || 0) + inputTokens
  userUsage.providers[provider].monthlyOutputTokens[currentMonth] = (userUsage.providers[provider].monthlyOutputTokens[currentMonth] || 0) + outputTokens
  // Note: provider monthly queries are now only incremented when Serper queries are made, not for LLM calls

  // Update model stats (within provider)
  const modelKey = `${provider}-${model}`
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
  // Note: model queries are now only incremented when Serper queries are made, not for LLM calls

  // Update daily usage (after modelKey is defined)
  if (!userUsage.dailyUsage) {
    userUsage.dailyUsage = {}
  }
  if (!userUsage.dailyUsage[currentMonth]) {
    userUsage.dailyUsage[currentMonth] = {}
  }
  if (!userUsage.dailyUsage[currentMonth][today]) {
    userUsage.dailyUsage[currentMonth][today] = { inputTokens: 0, outputTokens: 0, queries: 0, models: {} }
  }
  userUsage.dailyUsage[currentMonth][today].inputTokens = (userUsage.dailyUsage[currentMonth][today].inputTokens || 0) + inputTokens
  userUsage.dailyUsage[currentMonth][today].outputTokens = (userUsage.dailyUsage[currentMonth][today].outputTokens || 0) + outputTokens
  
  // Track which models were used on this day
  if (!userUsage.dailyUsage[currentMonth][today].models[modelKey]) {
    userUsage.dailyUsage[currentMonth][today].models[modelKey] = { inputTokens: 0, outputTokens: 0 }
  }
  userUsage.dailyUsage[currentMonth][today].models[modelKey].inputTokens = (userUsage.dailyUsage[currentMonth][today].models[modelKey].inputTokens || 0) + inputTokens
  userUsage.dailyUsage[currentMonth][today].models[modelKey].outputTokens = (userUsage.dailyUsage[currentMonth][today].models[modelKey].outputTokens || 0) + outputTokens

  writeUsage(usage)
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
app.use(express.json())

// Authentication endpoints
app.post('/api/auth/signup', (req, res) => {
  try {
    const { firstName, lastName, username, email, password } = req.body

    if (!firstName || !lastName || !username || !email || !password) {
      return res.status(400).json({ error: 'All fields are required' })
    }

    if (password.length < 8) {
      return res.status(400).json({ error: 'Password must be at least 8 characters' })
    }

    const users = readUsers()
    console.log('[Auth] Signup attempt for username:', username)

    // Check if username or email already exists
    if (users[username]) {
      return res.status(400).json({ error: 'Username already exists' })
    }

    // Check if email already exists
    const existingUser = Object.values(users).find((u) => u.email === email)
    if (existingUser) {
      return res.status(400).json({ error: 'Email already registered' })
    }

    // Create new user
    const hashedPassword = hashPassword(password)
    const userId = username
    users[userId] = {
      id: userId,
      firstName,
      lastName,
      username,
      email,
      password: hashedPassword,
      createdAt: new Date().toISOString(),
    }

    const writeResult = writeUsers(users)
    console.log('[Auth] User created successfully:', username)
    console.log('[Auth] Users file written:', USERS_FILE)

  // Initialize usage tracking
  const usage = readUsage()
  if (!usage[userId]) {
    usage[userId] = {
      totalTokens: 0,
      totalQueries: 0,
      totalPrompts: 0,
      monthlyUsage: {},
      providers: {},
      models: {},
    }
    writeUsage(usage)
    console.log('[Auth] Usage tracking initialized for:', userId)
  }

    res.json({
      success: true,
      user: {
        id: userId,
        firstName,
        lastName,
        username,
        email,
      },
    })
  } catch (error) {
    console.error('[Auth] Signup error:', error)
    res.status(500).json({ error: 'An error occurred during signup. Please try again.' })
  }
})

app.post('/api/auth/signin', (req, res) => {
  try {
    const { username, password } = req.body

    if (!username || !password) {
      return res.status(400).json({ error: 'Username and password are required' })
    }

    const users = readUsers()
    
    if (!users || Object.keys(users).length === 0) {
      console.log('[Auth] No users found in database')
      return res.status(401).json({ error: 'No account found. Please sign up first.' })
    }

    const user = users[username]

    if (!user) {
      console.log('[Auth] User not found:', username)
      console.log('[Auth] Available users:', Object.keys(users))
      return res.status(401).json({ error: 'Username not found. Please check your username or sign up.' })
    }

    const hashedPassword = hashPassword(password)
    console.log('[Auth] Comparing passwords - stored hash:', user.password?.substring(0, 20) + '...', 'input hash:', hashedPassword?.substring(0, 20) + '...')
    
    if (user.password !== hashedPassword) {
      console.log('[Auth] Password mismatch for user:', username)
      return res.status(401).json({ error: 'Invalid password. Please check your password and try again.' })
    }

    // Track login activity
    const usage = readUsage()
    if (!usage[username]) {
      usage[username] = {
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
        ratings: {},
        lastActiveDate: null,
        lastLoginDate: null,
        streakDays: 0,
      }
    }
    const loginDate = new Date().toISOString()
    usage[username].lastLoginDate = loginDate
    writeUsage(usage)
    
    // Also update users.json with last login date and status
    // Note: 'users' was already declared above, so we reuse it
    if (users[username]) {
      users[username].lastLoginDate = loginDate
      // Update status based on login within last month
      const now = new Date()
      const oneMonthAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000)
      const lastLogin = new Date(loginDate)
      
      // Only update status if user is not canceled
      if (users[username].status !== 'canceled' && users[username].canceled !== true) {
        if (lastLogin >= oneMonthAgo) {
          users[username].status = 'active'
        } else {
          users[username].status = 'inactive'
        }
      }
      
      // Always write users.json when updating lastLoginDate
      writeUsers(users)
    }
    
    console.log('[Auth] Successful sign in for user:', username)
    res.json({
      success: true,
      user: {
        id: user.id,
        firstName: user.firstName,
        lastName: user.lastName,
        username: user.username,
        email: user.email,
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

    const { promptText, category } = req.body
    console.log('[Prompt Tracking] Received prompt tracking request for user:', userId, 'category:', category)
    trackPrompt(userId, promptText, category)
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
app.delete('/api/auth/account', (req, res) => {
  try {
    const { userId } = req.body

    if (!userId) {
      return res.status(400).json({ error: 'userId is required' })
    }

    console.log('[Account Deletion] Received delete request for user:', userId)

    // Read users and usage
    const users = readUsers()
    const usage = readUsage()

    // Check if user exists
    if (!users[userId]) {
      console.log('[Account Deletion] User not found in users.json:', userId)
      return res.status(404).json({ error: 'User not found' })
    }

    // Store user info for logging before deletion
    const userInfo = { username: users[userId].username, email: users[userId].email }

    // Delete user from users.json
    delete users[userId]
    writeUsers(users)
    
    // Verify deletion from users.json
    const verifyUsers = readUsers()
    if (verifyUsers[userId]) {
      console.error('[Account Deletion] ERROR: User still exists in users.json after deletion!')
      return res.status(500).json({ error: 'Failed to delete user account' })
    }
    console.log('[Account Deletion] User successfully deleted from users.json:', userId, userInfo)

    // Delete user's usage data from ADMIN/usage.json
    if (usage[userId]) {
      delete usage[userId]
      writeUsage(usage)
      
      // Verify deletion from ADMIN/usage.json
      const verifyUsage = readUsage()
      if (verifyUsage[userId]) {
        console.error('[Account Deletion] ERROR: Usage data still exists in ADMIN/usage.json after deletion!')
        return res.status(500).json({ error: 'Failed to delete usage data' })
      }
      console.log('[Account Deletion] Usage data successfully deleted from ADMIN/usage.json for user:', userId)
    } else {
      console.log('[Account Deletion] No usage data found in ADMIN/usage.json for user:', userId)
    }

    // Also check and clean up root-level usage.json if it exists (legacy file)
    const ROOT_USAGE_FILE = path.join(__dirname, 'usage.json')
    if (fs.existsSync(ROOT_USAGE_FILE)) {
      try {
        const rootUsage = JSON.parse(fs.readFileSync(ROOT_USAGE_FILE, 'utf8'))
        if (rootUsage[userId]) {
          delete rootUsage[userId]
          fs.writeFileSync(ROOT_USAGE_FILE, JSON.stringify(rootUsage, null, 2))
          console.log('[Account Deletion] Usage data successfully deleted from root usage.json for user:', userId)
        }
      } catch (error) {
        console.error('[Account Deletion] Error cleaning up root usage.json:', error)
        // Don't fail the deletion if root file cleanup fails - it's just a legacy file
      }
    }

    // Increment deleted users count
    incrementDeletedUsers()
    console.log('[Account Deletion] Deleted users count incremented')
    
    console.log('[Account Deletion] Account completely removed - user no longer exists in system')
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
      totalTokens: (providerData.totalInputTokens || 0) + (providerData.totalOutputTokens || 0), // Recalculate to ensure accuracy (input + output only)
      totalInputTokens: providerData.totalInputTokens || 0,
      totalOutputTokens: providerData.totalOutputTokens || 0,
      totalQueries: providerData.totalQueries || 0, // Serper queries only
      totalPrompts: totalPrompts, // Sum of all model prompts for this provider
      monthlyTokens: (providerData.monthlyInputTokens?.[currentMonth] || 0) + (providerData.monthlyOutputTokens?.[currentMonth] || 0), // Recalculate
      monthlyInputTokens: providerData.monthlyInputTokens?.[currentMonth] || 0,
      monthlyOutputTokens: providerData.monthlyOutputTokens?.[currentMonth] || 0,
      monthlyQueries: providerData.monthlyQueries?.[currentMonth] || 0,
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
  let monthlyCost = 0
  let remainingFreeAllocation = FREE_MONTHLY_ALLOCATION
  
  // Calculate monthly cost based on actual daily usage data for current month
  const pricing = getPricingData()
  const dailyData = userUsage.dailyUsage?.[currentMonth] || {}
  
  // Sum up costs from all days in the current month
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
        const queryCost = calculateSerperQueryCost(dayQueries, pricing)
        monthlyCost += queryCost
      }
    }
  })
  
  remainingFreeAllocation = Math.max(0, FREE_MONTHLY_ALLOCATION - monthlyCost)
  
  // Calculate percentage of free usage remaining
  const freeUsagePercentage = (remainingFreeAllocation / FREE_MONTHLY_ALLOCATION) * 100

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
        const queryCost = calculateSerperQueryCost(dayQueries, pricing)
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

  res.json({
    totalTokens: userUsage.totalTokens || 0,
    totalInputTokens: userUsage.totalInputTokens || 0,
    totalOutputTokens: userUsage.totalOutputTokens || 0,
    totalQueries: userUsage.totalQueries || 0,
    totalPrompts: userUsage.totalPrompts || 0,
    monthlyTokens: monthlyStats.tokens || 0,
    monthlyInputTokens: monthlyStats.inputTokens || 0,
    monthlyOutputTokens: monthlyStats.outputTokens || 0,
    monthlyQueries: monthlyStats.queries || 0,
    monthlyPrompts: monthlyStats.prompts || 0,
    monthlyCost: monthlyCost,
    remainingFreeAllocation: remainingFreeAllocation,
    freeUsagePercentage: freeUsagePercentage,
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
        
        const apiRequestBody = {
          model: mappedModel, // Use mapped model name (or original if no mapping)
          messages: [{ role: 'user', content: prompt }],
          temperature: 0.7,
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
  
  const responsesText = validResponses
    .map((r) => `\n--- ${r.model_name}'s response ---\n${r.response}\n`)
    .join('')
  
  const judgePrompt = `You are an expert judge analyzing multiple AI model responses. Your task is to:

1. Provide a summary of the council's responses
2. Identify where the models agree
3. Identify where the models disagree or contradict each other

Original User Query: "${query}"

Council Model Responses:
${responsesText}

Please analyze these responses and provide ONLY these three sections:
- **Summary**: A concise summary of what the council models collectively determined
- **Agreements**: List specific points where models agree (bullet points)
- **Disagreements**: List specific points where models disagree or contradict (bullet points)

Format your response clearly with these three sections only.`
  
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
    
    // Parse the response to extract sections (only Summary, Agreements, Disagreements)
    const summaryMatch = content.match(/(?:Summary)[:\-]?\s*(.+?)(?=\n\n|\n(?:Agreements|Disagreements)|$)/is)
    const agreementsMatch = content.match(/(?:Agreements)[:\-]?\s*(.+?)(?=\n\n|\n(?:Disagreements|Summary)|$)/is)
    const disagreementsMatch = content.match(/(?:Disagreements)[:\-]?\s*(.+?)(?=\n\n|\n(?:Summary|Agreements)|$)/is)
    
    // Extract summary - if no explicit summary section, use first part of content
    let summary = summaryMatch ? summaryMatch[1].trim() : content.split(/\n\n/)[0].trim()
    
    // Extract agreements and disagreements as arrays
    const agreements = agreementsMatch 
      ? agreementsMatch[1].split('\n').filter(l => l.trim() && !l.match(/^[-•*]\s*$/)).map(l => l.replace(/^[-•*]\s*/, '').trim())
      : []
    
    const disagreements = disagreementsMatch 
      ? disagreementsMatch[1].split('\n').filter(l => l.trim() && !l.match(/^[-•*]\s*$/)).map(l => l.replace(/^[-•*]\s*/, '').trim())
      : []
    
    return {
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
      summary: `Error analyzing responses: ${error.message}`,
      agreements: [],
      disagreements: [],
      prompt: judgePrompt,
      response: `Error: ${error.message}`
    }
  }
}

// RAG Pipeline endpoint
app.post('/api/rag', async (req, res) => {
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
          
          const apiRequestBody = {
            model: mappedModel,
            messages: [{ role: 'user', content: councilPrompt }],
            temperature: 0.7,
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
          }
          
          // Store token info for return
          const tokenInfo = userId && responseText ? {
            input: inputTokens,
            output: outputTokens,
            total: inputTokens + outputTokens,
            reasoningTokens: responseTokens?.reasoningTokens || 0, // Reasoning tokens from API metadata
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
// Get total users count and user list
app.get('/api/admin/users', (req, res) => {
  try {
    const users = readUsers()
    const admins = readAdmins()
    const usage = readUsage()
    const deletedUsers = readDeletedUsers()
    
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

// Calculate cost for Serper queries based on pricing tiers
const calculateSerperQueryCost = (numQueries, pricing) => {
  if (!pricing.serper || !pricing.serper.queryTiers || numQueries === 0) {
    return 0
  }
  
  // Use the first tier pricing (assuming we're using the 50k credits tier)
  // In a real scenario, you'd determine which tier based on total monthly queries
  const tier = pricing.serper.queryTiers[0] // Using first tier (50k credits, $1.00 per 1k)
  const pricePer1k = tier.pricePer1k || 1.00
  const cost = (numQueries / 1000) * pricePer1k
  
  return cost
}

// Get cost analysis for all users
app.get('/api/admin/costs', (req, res) => {
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
        const queryCost = calculateSerperQueryCost(totalQueries, pricing)
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

// Get model pricing information
app.get('/api/admin/pricing', (req, res) => {
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

// Add/Remove admin endpoints
app.post('/api/admin/add', (req, res) => {
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
    
    const admins = readAdmins()
    if (!admins.admins.includes(userId)) {
      admins.admins.push(userId)
      fs.writeFileSync(ADMINS_FILE, JSON.stringify(admins, null, 2))
      console.log(`[Admin] Added admin: ${userId}`)
    }
    
    res.json({ success: true, message: 'Admin added successfully' })
  } catch (error) {
    console.error('[Admin] Error adding admin:', error)
    res.status(500).json({ error: 'Failed to add admin' })
  }
})

app.post('/api/admin/remove', (req, res) => {
  try {
    const { userId } = req.body
    if (!userId) {
      return res.status(400).json({ error: 'userId is required' })
    }
    
    const admins = readAdmins()
    admins.admins = admins.admins.filter(id => id !== userId)
    fs.writeFileSync(ADMINS_FILE, JSON.stringify(admins, null, 2))
    console.log(`[Admin] Removed admin: ${userId}`)
    
    res.json({ success: true, message: 'Admin removed successfully' })
  } catch (error) {
    console.error('[Admin] Error removing admin:', error)
    res.status(500).json({ error: 'Failed to remove admin' })
  }
})

app.listen(PORT, () => {
  console.log(`🚀 Backend server running on http://localhost:${PORT}`)
  console.log(`📡 Ready to proxy LLM API calls`)
  console.log(`🔍 Serper search API ready`)
  console.log(`👑 Admin endpoints ready`)
})


