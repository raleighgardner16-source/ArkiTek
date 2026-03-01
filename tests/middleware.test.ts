import type { Request, Response, NextFunction } from 'express'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { generateToken } from '../server/helpers/auth.js'

describe('requireAuth middleware', () => {
  let requireAuth: (req: Request, res: Response, next: NextFunction) => void

  beforeEach(async () => {
    const mod = await import('../server/middleware/requireAuth.js')
    requireAuth = mod.requireAuth
  })

  it('rejects requests with no Authorization header', () => {
    const req = { headers: {} } as Request
    const res = {
      status: vi.fn().mockReturnThis(),
      json: vi.fn(),
    } as unknown as Response
    const next = vi.fn() as NextFunction

    requireAuth(req, res, next)
    expect(res.status).toHaveBeenCalledWith(401)
    expect(res.json).toHaveBeenCalledWith({ success: false, error: 'Authentication required' })
    expect(next).not.toHaveBeenCalled()
  })

  it('rejects requests with invalid token', () => {
    const req = { headers: { authorization: 'Bearer invalidtoken' } } as Request
    const res = {
      status: vi.fn().mockReturnThis(),
      json: vi.fn(),
    } as unknown as Response
    const next = vi.fn() as NextFunction

    requireAuth(req, res, next)
    expect(res.status).toHaveBeenCalledWith(401)
    expect(res.json).toHaveBeenCalledWith({ success: false, error: 'Invalid or expired token' })
    expect(next).not.toHaveBeenCalled()
  })

  it('rejects requests with non-Bearer scheme', () => {
    const token: string = generateToken('user-123')
    const req = { headers: { authorization: `Basic ${token}` } } as Request
    const res = {
      status: vi.fn().mockReturnThis(),
      json: vi.fn(),
    } as unknown as Response
    const next = vi.fn() as NextFunction

    requireAuth(req, res, next)
    expect(res.status).toHaveBeenCalledWith(401)
    expect(next).not.toHaveBeenCalled()
  })

  it('accepts requests with valid Bearer token and sets req.userId', () => {
    const token: string = generateToken('user-abc-123')
    const req = { headers: { authorization: `Bearer ${token}` } } as Request & { userId?: string }
    const res = {
      status: vi.fn().mockReturnThis(),
      json: vi.fn(),
    } as unknown as Response
    const next = vi.fn() as NextFunction

    requireAuth(req, res, next)
    expect(next).toHaveBeenCalled()
    expect(req.userId).toBe('user-abc-123')
    expect(res.status).not.toHaveBeenCalled()
  })
})

describe('requireAdmin middleware', () => {
  it('rejects requests without req.userId', async () => {
    const { requireAdmin } = await import('../server/middleware/requireAdmin.js')

    const req = {} as Request
    const res = {
      status: vi.fn().mockReturnThis(),
      json: vi.fn(),
    } as unknown as Response
    const next = vi.fn() as NextFunction

    await requireAdmin(req, res, next)
    expect(res.status).toHaveBeenCalledWith(401)
    expect(next).not.toHaveBeenCalled()
  })

  it('rejects non-admin users', async () => {
    const { requireAdmin } = await import('../server/middleware/requireAdmin.js')

    const req = { userId: 'regular-user' } as Request
    const res = {
      status: vi.fn().mockReturnThis(),
      json: vi.fn(),
    } as unknown as Response
    const next = vi.fn() as NextFunction

    await requireAdmin(req, res, next)
    expect(res.status).toHaveBeenCalledWith(403)
    expect(next).not.toHaveBeenCalled()
  })
})
