import type { Request, Response, NextFunction } from 'express'
import { verifyToken } from '../helpers/auth.js'
import { sendError } from '../types/api.js'

const requireAuth = (req: Request, res: Response, next: NextFunction) => {
  const authHeader = req.headers.authorization
  if (!authHeader?.startsWith('Bearer ')) {
    return sendError(res, 'Authentication required', 401)
  }

  const token = authHeader.slice(7)
  try {
    const decoded = verifyToken(token) as { userId: string }
    req.userId = decoded.userId
    next()
  } catch (_err) {
    return sendError(res, 'Invalid or expired token', 401)
  }
}

export { requireAuth }
