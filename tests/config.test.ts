import { describe, it, expect } from 'vitest'

describe('server config', () => {
  it('exports expected constants', async () => {
    const config = await import('../server/config/index.js')
    expect(config.APP_NAME).toBeTruthy()
    expect(config.API_VERSION).toBeTruthy()
    expect(config.API_PREFIX).toBeTruthy()
    expect(config.SERVER_VERSION).toBeTruthy()
  })

  it('APP_NAME is Arkitek', async () => {
    const config = await import('../server/config/index.js')
    expect(config.APP_NAME).toBe('ArkiTek')
  })

  it('API_PREFIX starts with /api/', async () => {
    const config = await import('../server/config/index.js')
    expect(config.API_PREFIX).toMatch(/^\/api\//)
  })

  it('MAX_FREE_TRIALS_PER_IP is a positive number', async () => {
    const config = await import('../server/config/index.js')
    expect(config.MAX_FREE_TRIALS_PER_IP).toBeGreaterThan(0)
  })

  it('JWT_EXPIRY is set', async () => {
    const config = await import('../server/config/index.js')
    expect(config.JWT_EXPIRY).toBeTruthy()
  })

  it('MODEL_MAPPINGS is an object', async () => {
    const config = await import('../server/config/index.js')
    expect(typeof config.MODEL_MAPPINGS).toBe('object')
  })

  it('PROVIDER_BASE_URLS is an object', async () => {
    const config = await import('../server/config/index.js')
    expect(typeof config.PROVIDER_BASE_URLS).toBe('object')
  })

  it('API_KEYS is an object', async () => {
    const config = await import('../server/config/index.js')
    expect(typeof config.API_KEYS).toBe('object')
  })

  it('DAILY_CHALLENGES is a non-empty array', async () => {
    const config = await import('../server/config/index.js')
    expect(Array.isArray(config.DAILY_CHALLENGES)).toBe(true)
    expect(config.DAILY_CHALLENGES.length).toBeGreaterThan(0)
  })

  it('DAILY_CHALLENGE_REWARD is a positive number', async () => {
    const config = await import('../server/config/index.js')
    expect(config.DAILY_CHALLENGE_REWARD).toBeGreaterThan(0)
  })

  it('disposableDomains is an array', async () => {
    const config = await import('../server/config/index.js')
    expect(Array.isArray(config.disposableDomains)).toBe(true)
  })
})
