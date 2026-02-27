import cors from 'cors'
import express from 'express'
import { ALLOWED_ORIGINS } from '../config/index.js'

export const setupMiddleware = (app) => {
  app.use(cors(ALLOWED_ORIGINS ? {
    origin: (origin, callback) => {
      if (!origin || ALLOWED_ORIGINS.includes(origin)) {
        callback(null, true)
      } else {
        callback(new Error('Not allowed by CORS'))
      }
    },
    credentials: true,
  } : undefined))

  // Stripe webhook needs raw body — must be BEFORE express.json()
  app.use('/api/stripe/webhook', express.raw({ type: 'application/json' }))

  app.use(express.json({ limit: '2mb' }))
}
