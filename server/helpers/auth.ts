import crypto from 'crypto'
import bcrypt from 'bcrypt'
import jwt from 'jsonwebtoken'
import { disposableDomains, JWT_SECRET, JWT_EXPIRY } from '../config/index.js'

const BCRYPT_ROUNDS = 12

const hashPassword = async (password: string): Promise<string> => {
  return bcrypt.hash(password, BCRYPT_ROUNDS)
}

const legacySha256 = (password: string): string => {
  return crypto.createHash('sha256').update(password).digest('hex')
}

/**
 * Verify a password against a stored hash. Supports both bcrypt (new) and
 * SHA-256 (legacy). Returns { valid, needsRehash } so callers can lazily
 * migrate legacy hashes to bcrypt.
 */
const verifyPassword = async (password: string, storedHash: string): Promise<{ valid: boolean; needsRehash: boolean }> => {
  if (storedHash.startsWith('$2b$') || storedHash.startsWith('$2a$')) {
    const valid = await bcrypt.compare(password, storedHash)
    return { valid, needsRehash: false }
  }
  const valid = legacySha256(password) === storedHash
  return { valid, needsRehash: valid }
}

const generateToken = (userId: string): string => {
  return jwt.sign({ userId }, JWT_SECRET, { expiresIn: JWT_EXPIRY })
}

const verifyToken = (token: string): string | jwt.JwtPayload => {
  return jwt.verify(token, JWT_SECRET)
}

const canonicalizeEmail = (email: string): string => {
  const [local, domain] = email.toLowerCase().trim().split('@')
  const googleDomains = ['gmail.com', 'googlemail.com']
  if (googleDomains.includes(domain)) {
    const cleaned = local.split('+')[0].replace(/\./g, '')
    return `${cleaned}@${domain}`
  }
  const cleaned = local.split('+')[0]
  return `${cleaned}@${domain}`
}

const isDisposableEmail = (email: string): boolean => {
  const domain = email.split('@')[1]?.toLowerCase()
  return disposableDomains.includes(domain)
}

export { hashPassword, verifyPassword, generateToken, verifyToken, canonicalizeEmail, isDisposableEmail }
