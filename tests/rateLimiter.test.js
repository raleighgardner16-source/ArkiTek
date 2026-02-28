import { describe, it, expect } from 'vitest'
import { authLimiter, llmLimiter, generalLimiter } from '../server/middleware/rateLimiter.js'

describe('Rate Limiters', () => {
  it('authLimiter is a valid middleware function', () => {
    expect(typeof authLimiter).toBe('function')
  })

  it('llmLimiter is a valid middleware function', () => {
    expect(typeof llmLimiter).toBe('function')
  })

  it('generalLimiter is a valid middleware function', () => {
    expect(typeof generalLimiter).toBe('function')
  })
})
