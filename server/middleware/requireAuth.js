import { verifyToken } from '../helpers/auth.js'

const requireAuth = (req, res, next) => {
  const authHeader = req.headers.authorization
  if (!authHeader?.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Authentication required' })
  }

  const token = authHeader.slice(7)
  try {
    const decoded = verifyToken(token)
    req.userId = decoded.userId
    next()
  } catch (err) {
    return res.status(401).json({ error: 'Invalid or expired token' })
  }
}

export { requireAuth }
