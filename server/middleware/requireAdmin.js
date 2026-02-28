import adminDb from '../../database/adminDb.js'

let adminsCache = { admins: [] }

const loadAdminsList = async () => {
  try {
    const adminsList = await adminDb.admins.getList()
    adminsCache.admins = adminsList
    console.log(`[Server] Loaded ${adminsList.length} admins`)
  } catch (error) {
    console.warn('[Server] Failed to load admins (non-fatal):', error.message)
    adminsCache.admins = []
  }
}

const isAdmin = async (userId) => {
  if (adminsCache.admins.includes(userId)) return true
  return await adminDb.admins.isAdmin(userId)
}

const requireAdmin = async (req, res, next) => {
  const userId = req.userId

  if (!userId) {
    console.log('[Admin] Access denied - no authenticated user')
    return res.status(401).json({
      error: 'Authentication required',
      message: 'You must be logged in to access this resource'
    })
  }

  if (!(await isAdmin(userId))) {
    console.log(`[Admin] Access denied - user ${userId} is not an admin`)
    return res.status(403).json({
      error: 'Admin access required',
      message: 'You do not have permission to access this resource'
    })
  }

  console.log(`[Admin] Access granted for admin: ${userId}`)
  next()
}

export { loadAdminsList, isAdmin, requireAdmin, adminsCache }
