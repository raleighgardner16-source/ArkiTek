import rateLimit from 'express-rate-limit'

export const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false as const, error: 'Too many authentication attempts. Please try again in 15 minutes.' },
})

export const llmLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => req.userId || 'anon',
  message: { success: false as const, error: 'Too many requests. Please slow down and try again in a minute.' },
})

export const generalLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false as const, error: 'Too many requests. Please try again shortly.' },
})
