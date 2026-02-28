import express from 'express'
import path from 'path'
import db from './database/db.js'
import adminDb from './database/adminDb.js'
import { PORT, SERVER_VERSION, PROJECT_ROOT } from './server/config/index.js'
import { setupMiddleware } from './server/middleware/index.js'
import { loadAdminsList } from './server/middleware/requireAdmin.js'
import { requireAuth } from './server/middleware/requireAuth.js'
import { authLimiter, llmLimiter, generalLimiter } from './server/middleware/rateLimiter.js'
import { trackConversationPrompt } from './server/services/usage.js'

// Route imports
import authRouter from './server/routes/auth.js'
import { statsRouter, dailyChallengeRouter, userRouter, ratingsRouter } from './server/routes/stats.js'
import judgeRouter from './server/routes/judge.js'
import modelRouter from './server/routes/model.js'
import llmRouter, { summaryRouter } from './server/routes/llm.js'
import searchRouter, { detectSearchRouter } from './server/routes/search.js'
import ragRouter from './server/routes/rag.js'
import memoryRouter from './server/routes/memory.js'
import historyRouter from './server/routes/history.js'
import leaderboardRouter from './server/routes/leaderboard.js'
import notificationsRouter from './server/routes/notifications.js'
import { profileRouter, usersRouter } from './server/routes/social.js'
import messagingRouter from './server/routes/messaging.js'
import adminRouter, { pricingRouter } from './server/routes/admin.js'
import stripeRouter from './server/routes/stripe.js'

// ============================================================================
// GLOBAL CRASH PREVENTION
// ============================================================================
process.on('uncaughtException', (err) => {
  console.error('[FATAL] Uncaught Exception — server NOT crashing:', err.message, err.stack)
})
process.on('unhandledRejection', (reason) => {
  console.error('[FATAL] Unhandled Rejection — server NOT crashing:', reason)
})

// ============================================================================
// DATABASE INITIALIZATION
// ============================================================================
const ensureVectorSearchIndex = async () => {
  try {
    const dbInstance = await db.getDb()
    const col = dbInstance.collection('conversation_history')
    const existingIndexes = await col.listSearchIndexes().toArray()
    const hasIndex = existingIndexes.some(idx => idx.name === 'conversation_embedding_index')

    if (hasIndex) {
      console.log('[Memory] ✅ Vector search index "conversation_embedding_index" exists')
      return
    }

    console.log('[Memory] ⚠️  Vector search index not found, creating "conversation_embedding_index"...')
    await col.createSearchIndex({
      name: 'conversation_embedding_index',
      type: 'vectorSearch',
      definition: {
        fields: [
          { type: 'vector', path: 'embedding', numDimensions: 1536, similarity: 'cosine' },
          { type: 'filter', path: 'userId' },
        ],
      },
    })
    console.log('[Memory] ✅ Vector search index "conversation_embedding_index" created successfully')
    console.log('[Memory] ℹ️  Note: Atlas may take 1-2 minutes to build the index before queries work')
  } catch (error) {
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

const initDatabase = async () => {
  try {
    await db.connect()
    console.log('[Server] ✅ Arkitek DB connected successfully')
    await adminDb.connect()
    console.log('[Server] ✅ ADMIN DB connected successfully')
    console.log('[Server] 🗄️  Using MongoDB as primary data store')
    await ensureVectorSearchIndex()
  } catch (error) {
    console.error('[Server] ❌ MongoDB connection failed:', error.message)
    console.error('[Server] Cannot start without database connection')
    process.exit(1)
  }
}

// Graceful shutdown
const performGracefulShutdown = async (signal) => {
  console.log(`\n[Server] ${signal} received, shutting down gracefully...`)
  await db.close()
  await adminDb.close()
  process.exit(0)
}
process.on('SIGINT', () => performGracefulShutdown('SIGINT'))
process.on('SIGTERM', () => performGracefulShutdown('SIGTERM'))

// ============================================================================
// MONTHLY CLEANUP
// ============================================================================
const cleanupOldDailyUsage = async () => {
  try {
    const now = new Date()
    const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
    const prevDate = new Date(now.getFullYear(), now.getMonth() - 1, 1)
    const previousMonth = `${prevDate.getFullYear()}-${String(prevDate.getMonth() + 1).padStart(2, '0')}`

    console.log(`[Cleanup] Running daily usage cleanup. Keeping months: ${previousMonth}, ${currentMonth}`)

    const allUsage = await db.usage.getAll()
    let totalMonthsRemoved = 0

    for (const userUsage of allUsage) {
      if (userUsage?.dailyUsage) {
        const monthsToRemove = Object.keys(userUsage.dailyUsage).filter(m => m < previousMonth)
        if (monthsToRemove.length > 0) {
          const unsetFields = {}
          for (const month of monthsToRemove) {
            unsetFields[`dailyUsage.${month}`] = ''
          }
          const dbInstance = await db.getDb()
          await dbInstance.collection('usage_data').updateOne(
            { _id: userUsage._id },
            { $unset: unsetFields }
          )
          totalMonthsRemoved += monthsToRemove.length
        }
      }
    }

    console.log(`[Cleanup] Done. Removed ${totalMonthsRemoved} old month entries from MongoDB usage_data.`)
  } catch (error) {
    console.error('[Cleanup] Error during daily usage cleanup:', error.message)
  }
}

// ============================================================================
// EXPRESS APP
// ============================================================================
const app = express()

// Middleware (CORS, body parsing, Stripe raw body)
setupMiddleware(app)

// General rate limiter for all API routes
app.use('/api/', generalLimiter)

// Health check
app.get('/api/health', (req, res) => {
  res.json({ version: SERVER_VERSION, timestamp: new Date().toISOString() })
})

// Standalone route: track council follow-up prompt (different prefix from other routes)
app.post('/api/conversation/track-follow-up', requireAuth, async (req, res) => {
  try {
    const userId = req.userId
    const { userMessage } = req.body
    if (!userMessage) {
      return res.status(400).json({ error: 'userMessage is required' })
    }
    await trackConversationPrompt(userId, userMessage)
    res.json({ success: true })
  } catch (error) {
    console.error('[Track Follow-Up] Error:', error)
    res.status(500).json({ error: 'Failed to track follow-up prompt' })
  }
})

// ============================================================================
// MOUNT ROUTES
// ============================================================================
// Public routes (no auth required)
app.use('/api/auth', authLimiter, authRouter)
app.use('/api/pricing', pricingRouter)
app.use('/api/stripe', stripeRouter)

// Protected routes (JWT required)
app.use('/api/stats', requireAuth, statsRouter)
app.use('/api/daily-challenge', requireAuth, dailyChallengeRouter)
app.use('/api/user', requireAuth, userRouter)
app.use('/api/ratings', requireAuth, ratingsRouter)
app.use('/api/judge', requireAuth, llmLimiter, judgeRouter)
app.use('/api/model', requireAuth, llmLimiter, modelRouter)
app.use('/api/llm', requireAuth, llmLimiter, llmRouter)
app.use('/api/summary', requireAuth, llmLimiter, summaryRouter)
app.use('/api/search', requireAuth, llmLimiter, searchRouter)
app.use('/api/detect-search-needed', requireAuth, llmLimiter, detectSearchRouter)
app.use('/api/rag', requireAuth, llmLimiter, ragRouter)
app.use('/api/memory', requireAuth, memoryRouter)
app.use('/api/history', requireAuth, historyRouter)
app.use('/api/leaderboard', requireAuth, leaderboardRouter)
app.use('/api/notifications', requireAuth, notificationsRouter)
app.use('/api/profile', requireAuth, profileRouter)
app.use('/api/users', requireAuth, usersRouter)
app.use('/api/messages', requireAuth, messagingRouter)
app.use('/api/admin', requireAuth, adminRouter)

// ============================================================================
// SERVERLESS INITIALIZATION (Vercel)
// ============================================================================
let _serverlessInitialized = false

export const initializeForServerless = async () => {
  if (_serverlessInitialized) return
  _serverlessInitialized = true
  console.log(`[Server] 🚀 Initializing serverless (version: ${SERVER_VERSION})`)
  await initDatabase()
  await loadAdminsList()
  await cleanupOldDailyUsage()
  console.log(`[Server] ✅ Serverless initialization complete`)
}

export default app

// ============================================================================
// LOCAL SERVER STARTUP (only when NOT running on Vercel)
// ============================================================================
if (!process.env.VERCEL) {
  const startServer = async () => {
    await initDatabase()
    await loadAdminsList()

    await cleanupOldDailyUsage()
    setInterval(cleanupOldDailyUsage, 24 * 60 * 60 * 1000)
    console.log('[Server] 🗑️  Daily usage cleanup scheduled (runs every 24h)')

    app.use(express.static(path.join(PROJECT_ROOT, 'dist')))

    app.get('*', (req, res) => {
      if (req.path.startsWith('/api/')) {
        return res.status(404).json({ error: 'API endpoint not found' })
      }
      res.sendFile(path.join(PROJECT_ROOT, 'dist', 'index.html'))
    })

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
