import type { Request, Response, NextFunction } from 'express'
import adminDb from '../../database/adminDb.js'
import { createLogger } from '../config/logger.js'
import { sendError } from '../types/api.js'

const log = createLogger('admin')

interface AdminsCache {
  admins: string[]
}

let adminsCache: AdminsCache = { admins: [] }

const loadAdminsList = async () => {
  try {
    const adminsList = await adminDb.admins.getList()
    adminsCache.admins = adminsList
    log.info({ count: adminsList.length }, 'Loaded admins list')
  } catch (error) {
    log.warn({ err: error }, 'Failed to load admins (non-fatal)')
    adminsCache.admins = []
  }
}

const isAdmin = async (userId: string): Promise<boolean> => {
  if (adminsCache.admins.includes(userId)) return true
  return await adminDb.admins.isAdmin(userId)
}

const requireAdmin = async (req: Request, res: Response, next: NextFunction) => {
  const userId = req.userId

  if (!userId) {
    log.info('Access denied — no authenticated user')
    return sendError(res, 'Authentication required', 401)
  }

  if (!(await isAdmin(userId))) {
    log.info({ userId }, 'Access denied — not an admin')
    return sendError(res, 'Admin access required', 403)
  }

  log.debug({ userId }, 'Admin access granted')
  next()
}

export { loadAdminsList, isAdmin, requireAdmin, adminsCache }
