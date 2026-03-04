import cors from 'cors'
import express, { type Application } from 'express'
import { pinoHttp } from 'pino-http'
import logger from '../config/logger.js'
import { ALLOWED_ORIGINS, API_PREFIX } from '../config/index.js'

export const setupMiddleware = (app: Application) => {
  app.use(pinoHttp({
    logger,
    genReqId: (req) => (req.headers['x-request-id'] as string) || `req-${Date.now()}-${Math.random().toString(36).slice(2, 11)}`,
    autoLogging: {
      ignore: (req) => req.url === `${API_PREFIX}/health` || req.url === '/api/health',
    },
    customSuccessMessage: (req, res) => `${req.method} ${req.url} ${res.statusCode}`,
    customErrorMessage: (req, res, err) => `${req.method} ${req.url} ${res.statusCode} — ${err.message}`,
    customLogLevel: (_req, res, err) => {
      if (err || res.statusCode >= 500) return 'error'
      if (res.statusCode >= 400) return 'warn'
      return 'info'
    },
  }))

  const allowedOrigins = ALLOWED_ORIGINS
  if (allowedOrigins) {
    app.use(cors({
      origin: (origin, callback) => {
        if (!origin || allowedOrigins.includes(origin)) {
          callback(null, true)
        } else {
          callback(new Error('Not allowed by CORS'))
        }
      },
      credentials: true,
    }))
  } else {
    app.use(cors())
  }

  // Stripe webhook needs raw body — must be BEFORE express.json()
  app.use(`${API_PREFIX}/stripe/webhook`, express.raw({ type: 'application/json' }))
  app.use('/api/stripe/webhook', express.raw({ type: 'application/json' }))

  app.use(express.json({ limit: '20mb' }))
}
