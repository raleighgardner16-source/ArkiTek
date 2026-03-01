import { Sentry, isEnabled as sentryEnabled } from './server/config/sentry.js'
import express from 'express'
import type { Request, Response } from 'express'
import path from 'path'
import db from './database/db.js'
import adminDb from './database/adminDb.js'
import { PORT, SERVER_VERSION, API_PREFIX, PROJECT_ROOT } from './server/config/index.js'
import env from './server/config/env.js'
import { createLogger } from './server/config/logger.js'
import { setupMiddleware } from './server/middleware/index.js'
import { loadAdminsList } from './server/middleware/requireAdmin.js'
import { requireAuth } from './server/middleware/requireAuth.js'
import { authLimiter, llmLimiter, generalLimiter } from './server/middleware/rateLimiter.js'
import { trackConversationPrompt } from './server/services/usage.js'
import { sendSuccess, sendError } from './server/types/api.js'

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

const log = createLogger('server')
const memLog = createLogger('memory')
const cleanupLog = createLogger('cleanup')

// ============================================================================
// GLOBAL CRASH PREVENTION
// ============================================================================
process.on('uncaughtException', (err) => {
  log.fatal({ err }, 'Uncaught exception — server NOT crashing')
  if (sentryEnabled) Sentry.captureException(err)
})
process.on('unhandledRejection', (reason) => {
  log.fatal({ err: reason instanceof Error ? reason : new Error(String(reason)) }, 'Unhandled rejection — server NOT crashing')
  if (sentryEnabled) Sentry.captureException(reason instanceof Error ? reason : new Error(String(reason)))
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
      memLog.info('Vector search index "conversation_embedding_index" exists')
      return
    }

    memLog.warn('Vector search index not found, creating "conversation_embedding_index"...')
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
    memLog.info('Vector search index "conversation_embedding_index" created successfully')
    memLog.info('Note: Atlas may take 1-2 minutes to build the index before queries work')
  } catch (error: any) {
    if (error.code === 31 || error.codeName === 'CommandNotSupported' || error.message?.includes('not supported')) {
      memLog.warn('Could not create vector search index programmatically — please create it manually in MongoDB Atlas')
    } else {
      memLog.error({ err: error }, 'Error checking/creating vector search index')
    }
  }
}

const initDatabase = async () => {
  try {
    await db.connect()
    log.info('Arkitek DB connected successfully')
    await adminDb.connect()
    log.info('Admin DB connected successfully')
    log.info('Using MongoDB as primary data store')
    await ensureVectorSearchIndex()
  } catch (error: any) {
    log.fatal({ err: error }, 'MongoDB connection failed — cannot start without database')
    process.exit(1)
  }
}

// Graceful shutdown
const performGracefulShutdown = async (signal: string) => {
  log.info({ signal }, 'Received shutdown signal, shutting down gracefully')
  if (sentryEnabled) await Sentry.flush(2000)
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

    cleanupLog.info({ keepMonths: [previousMonth, currentMonth] }, 'Running daily usage cleanup')

    const allUsage = await db.usage.getAll()
    let totalMonthsRemoved = 0

    for (const userUsage of allUsage) {
      if (userUsage?.dailyUsage) {
        const monthsToRemove = Object.keys(userUsage.dailyUsage).filter(m => m < previousMonth)
        if (monthsToRemove.length > 0) {
          const unsetFields: Record<string, string> = {}
          for (const month of monthsToRemove) {
            unsetFields[`dailyUsage.${month}`] = ''
          }
          const dbInstance = await db.getDb()
          await dbInstance.collection('usage_data').updateOne(
            { _id: userUsage._id } as any,
            { $unset: unsetFields }
          )
          totalMonthsRemoved += monthsToRemove.length
        }
      }
    }

    cleanupLog.info({ removedMonths: totalMonthsRemoved }, 'Daily usage cleanup complete')
  } catch (error: any) {
    cleanupLog.error({ err: error }, 'Error during daily usage cleanup')
  }
}

// ============================================================================
// EXPRESS APP
// ============================================================================
const app = express()

// Middleware (pino-http, CORS, body parsing, Stripe raw body)
setupMiddleware(app)

// ============================================================================
// VERSIONED API ROUTER (v1)
// ============================================================================
const v1 = express.Router()

// Health check
v1.get('/health', (req: Request, res: Response) => {
  sendSuccess(res, { version: SERVER_VERSION, timestamp: new Date().toISOString() })
})

// Standalone route: track council follow-up prompt
v1.post('/conversation/track-follow-up', requireAuth, async (req: Request, res: Response) => {
  try {
    const userId = req.userId
    const { userMessage } = req.body
    if (!userMessage) {
      return sendError(res, 'userMessage is required', 400)
    }
    await trackConversationPrompt(userId!, userMessage)
    sendSuccess(res)
  } catch (error: any) {
    log.error({ err: error }, 'Failed to track follow-up prompt')
    sendError(res, 'Failed to track follow-up prompt')
  }
})

// Public routes (no auth required)
v1.use('/auth', authLimiter, authRouter)
v1.use('/pricing', pricingRouter)
v1.use('/stripe', stripeRouter)

// Protected routes (JWT required)
v1.use('/stats', requireAuth, statsRouter)
v1.use('/daily-challenge', requireAuth, dailyChallengeRouter)
v1.use('/user', requireAuth, userRouter)
v1.use('/ratings', requireAuth, ratingsRouter)
v1.use('/judge', requireAuth, llmLimiter, judgeRouter)
v1.use('/model', requireAuth, llmLimiter, modelRouter)
v1.use('/llm', requireAuth, llmLimiter, llmRouter)
v1.use('/summary', requireAuth, llmLimiter, summaryRouter)
v1.use('/search', requireAuth, llmLimiter, searchRouter)
v1.use('/detect-search-needed', requireAuth, llmLimiter, detectSearchRouter)
v1.use('/rag', requireAuth, llmLimiter, ragRouter)
v1.use('/memory', requireAuth, memoryRouter)
v1.use('/history', requireAuth, historyRouter)
v1.use('/leaderboard', requireAuth, leaderboardRouter)
v1.use('/notifications', requireAuth, notificationsRouter)
v1.use('/profile', requireAuth, profileRouter)
v1.use('/users', requireAuth, usersRouter)
v1.use('/messages', requireAuth, messagingRouter)
v1.use('/admin', requireAuth, adminRouter)

// Mount v1 at the canonical versioned path
app.use(API_PREFIX, generalLimiter, v1)

// Backward compat: mount same router at /api with deprecation header
const deprecationNotice: express.RequestHandler = (_req, res, next) => {
  res.setHeader('Deprecation', 'true')
  res.setHeader('Sunset', '2026-06-01')
  next()
}
app.use('/api', deprecationNotice, generalLimiter, v1)

// Sentry error handler — must be after all routes and before any other error middleware
if (sentryEnabled) {
  Sentry.setupExpressErrorHandler(app)
}

// ============================================================================
// SERVERLESS INITIALIZATION (Vercel)
// ============================================================================
let _serverlessInitialized = false

export const initializeForServerless = async () => {
  if (_serverlessInitialized) return
  _serverlessInitialized = true
  log.info({ version: SERVER_VERSION }, 'Initializing serverless')
  await initDatabase()
  await loadAdminsList()
  await cleanupOldDailyUsage()
  log.info('Serverless initialization complete')
}

export default app

// ============================================================================
// LOCAL SERVER STARTUP (only when NOT running on Vercel)
// ============================================================================
if (!env.VERCEL) {
  const startServer = async () => {
    await initDatabase()
    await loadAdminsList()

    await cleanupOldDailyUsage()
    setInterval(cleanupOldDailyUsage, 24 * 60 * 60 * 1000)
    log.info('Daily usage cleanup scheduled (runs every 24h)')

    app.use(express.static(path.join(PROJECT_ROOT, 'dist')))

    app.get('*', (req: Request, res: Response) => {
      if (req.path.startsWith(`${API_PREFIX}/`) || req.path.startsWith('/api/')) {
        return sendError(res, 'API endpoint not found', 404)
      }
      res.sendFile(path.join(PROJECT_ROOT, 'dist', 'index.html'))
    })

    app.listen(PORT, () => {
      log.info({
        port: PORT,
        version: SERVER_VERSION,
        url: `http://localhost:${PORT}`,
        features: ['frontend', 'llm-proxy', 'search', 'leaderboard', 'admin', 'daily-cleanup'],
      }, 'ARKTEK Fullstack Server started')
    })
  }

  startServer().catch(error => {
    log.fatal({ err: error }, 'Failed to start server')
    process.exit(1)
  })
}
