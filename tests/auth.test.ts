import { describe, it, expect, beforeEach } from 'vitest'
import { hashPassword, verifyPassword, generateToken, verifyToken } from '../server/helpers/auth.js'

describe('Password Hashing', () => {
  it('hashes a password with bcrypt', async () => {
    const hash: string = await hashPassword('testpassword123')
    expect(hash).toBeTruthy()
    expect(hash).toMatch(/^\$2[ab]\$/)
  })

  it('produces different hashes for the same password', async () => {
    const hash1: string = await hashPassword('samepassword')
    const hash2: string = await hashPassword('samepassword')
    expect(hash1).not.toBe(hash2)
  })

  it('verifies a bcrypt password correctly', async () => {
    const hash: string = await hashPassword('mypassword')
    const { valid, needsRehash } = await verifyPassword('mypassword', hash)
    expect(valid).toBe(true)
    expect(needsRehash).toBe(false)
  })

  it('rejects wrong password with bcrypt hash', async () => {
    const hash: string = await hashPassword('correctpassword')
    const { valid } = await verifyPassword('wrongpassword', hash)
    expect(valid).toBe(false)
  })

  it('verifies a legacy SHA-256 hash and flags for rehash', async () => {
    const crypto = await import('crypto')
    const legacyHash: string = crypto.createHash('sha256').update('legacypassword').digest('hex')

    const { valid, needsRehash } = await verifyPassword('legacypassword', legacyHash)
    expect(valid).toBe(true)
    expect(needsRehash).toBe(true)
  })

  it('rejects wrong password with legacy SHA-256 hash', async () => {
    const crypto = await import('crypto')
    const legacyHash: string = crypto.createHash('sha256').update('legacypassword').digest('hex')

    const { valid, needsRehash } = await verifyPassword('wrongpassword', legacyHash)
    expect(valid).toBe(false)
    expect(needsRehash).toBe(false)
  })
})

describe('JWT Tokens', () => {
  it('generates a valid token', () => {
    const token: string = generateToken('user-123')
    expect(token).toBeTruthy()
    expect(typeof token).toBe('string')
    expect(token.split('.')).toHaveLength(3)
  })

  it('verifies a valid token and returns userId', () => {
    const token: string = generateToken('user-456')
    const decoded = verifyToken(token) as { userId: string }
    expect(decoded.userId).toBe('user-456')
  })

  it('throws on invalid token', () => {
    expect(() => verifyToken('invalid.token.here')).toThrow()
  })

  it('throws on tampered token', () => {
    const token: string = generateToken('user-789')
    const tampered: string = `${token.slice(0, -5)  }XXXXX`
    expect(() => verifyToken(tampered)).toThrow()
  })
})
