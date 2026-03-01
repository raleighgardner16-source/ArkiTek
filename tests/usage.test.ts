import { describe, it, expect, vi, beforeEach } from 'vitest'
import db from '../database/db.js'

const mockDb = vi.mocked(db)

describe('getUserTimezone', () => {
  let getUserTimezone: typeof import('../server/services/usage.js').getUserTimezone

  beforeEach(async () => {
    vi.clearAllMocks()
    const mod = await import('../server/services/usage.js')
    getUserTimezone = mod.getUserTimezone
  })

  it('returns timezone when user has one set', async () => {
    mockDb.users.get.mockResolvedValue({ timezone: 'America/Chicago' } as any)
    const result = await getUserTimezone('user-1')
    expect(result).toBe('America/Chicago')
  })

  it('returns null when user has no timezone', async () => {
    mockDb.users.get.mockResolvedValue({} as any)
    const result = await getUserTimezone('user-1')
    expect(result).toBeNull()
  })

  it('returns null when user is not found', async () => {
    mockDb.users.get.mockResolvedValue(null)
    const result = await getUserTimezone('missing')
    expect(result).toBeNull()
  })
})

describe('trackPrompt', () => {
  let trackPrompt: typeof import('../server/services/usage.js').trackPrompt

  beforeEach(async () => {
    vi.clearAllMocks()
    const mod = await import('../server/services/usage.js')
    trackPrompt = mod.trackPrompt
    mockDb.usage.getOrDefault.mockResolvedValue({
      totalPrompts: 0,
      monthlyUsage: {},
      dailyUsage: {},
      categories: {},
      categoryPrompts: {},
      promptHistory: [],
      providers: {},
      models: {},
      streakDays: 0,
      lastActiveAt: null,
    } as any)
    mockDb.users.get.mockResolvedValue({} as any)
    mockDb.usage.update.mockResolvedValue(undefined as any)
    mockDb.usage.atomicInc.mockResolvedValue(undefined as any)
    mockDb.users.update.mockResolvedValue(undefined as any)
  })

  it('increments category count', async () => {
    await trackPrompt('user-1', 'Test prompt', 'Science')
    expect(mockDb.usage.update).toHaveBeenCalledWith(
      'user-1',
      expect.objectContaining({
        'categories.Science': 1,
      }),
    )
  })

  it('defaults category to General Knowledge/Other', async () => {
    await trackPrompt('user-1', 'Test', '')
    expect(mockDb.usage.update).toHaveBeenCalledWith(
      'user-1',
      expect.objectContaining({
        'categories.General Knowledge/Other': 1,
      }),
    )
  })

  it('adds prompt to history', async () => {
    await trackPrompt('user-1', 'My test prompt', 'Tech')
    expect(mockDb.usage.update).toHaveBeenCalledWith(
      'user-1',
      expect.objectContaining({
        promptHistory: expect.arrayContaining([
          expect.objectContaining({ text: 'My test prompt', category: 'Tech' }),
        ]),
      }),
    )
  })

  it('truncates prompt text to 500 chars in history', async () => {
    const longPrompt = 'x'.repeat(600)
    await trackPrompt('user-1', longPrompt, 'Science')
    const setCall = mockDb.usage.update.mock.calls[0]
    const history = setCall[1].promptHistory as any[]
    expect(history[0].text.length).toBeLessThanOrEqual(500)
  })

  it('keeps prompt history at max 10 entries', async () => {
    mockDb.usage.getOrDefault.mockResolvedValue({
      totalPrompts: 10,
      monthlyUsage: {},
      dailyUsage: {},
      categories: {},
      categoryPrompts: {},
      promptHistory: Array.from({ length: 10 }, (_, i) => ({
        text: `Prompt ${i}`,
        category: 'general',
        timestamp: new Date().toISOString(),
      })),
      providers: {},
      models: {},
      streakDays: 1,
      lastActiveAt: null,
    } as any)

    await trackPrompt('user-1', 'New prompt', 'Tech')
    const setCall = mockDb.usage.update.mock.calls[0]
    const history = setCall[1].promptHistory as any[]
    expect(history.length).toBeLessThanOrEqual(10)
    expect(history[0].text).toBe('New prompt')
  })

  it('tracks council prompts when 3+ responses', async () => {
    await trackPrompt('user-1', 'Test', 'Science', {
      responses: [{ text: 'a' }, { text: 'b' }, { text: 'c' }],
    })
    expect(mockDb.usage.update).toHaveBeenCalledWith(
      'user-1',
      expect.objectContaining({
        councilPrompts: 1,
      }),
    )
  })

  it('tracks debate prompts', async () => {
    await trackPrompt('user-1', 'Test', 'Science', { promptMode: 'debate' })
    expect(mockDb.usage.update).toHaveBeenCalledWith(
      'user-1',
      expect.objectContaining({
        debatePrompts: 1,
      }),
    )
  })

  it('calls atomicInc for prompt counts', async () => {
    await trackPrompt('user-1', 'Test', 'Science')
    expect(mockDb.usage.atomicInc).toHaveBeenCalledWith(
      'user-1',
      expect.objectContaining({ totalPrompts: 1 }),
    )
  })

  it('updates user lastActiveAt', async () => {
    await trackPrompt('user-1', 'Test', 'Science')
    expect(mockDb.users.update).toHaveBeenCalledWith(
      'user-1',
      expect.objectContaining({ lastActiveAt: expect.any(String) }),
    )
  })

  it('starts streak at 1 for first-time user', async () => {
    await trackPrompt('user-1', 'Test', 'Science')
    expect(mockDb.usage.update).toHaveBeenCalledWith(
      'user-1',
      expect.objectContaining({ streakDays: 1 }),
    )
  })
})

describe('trackUsage', () => {
  let trackUsage: typeof import('../server/services/usage.js').trackUsage

  beforeEach(async () => {
    vi.clearAllMocks()
    const mod = await import('../server/services/usage.js')
    trackUsage = mod.trackUsage
    mockDb.usage.getOrDefault.mockResolvedValue({
      totalTokens: 0,
      totalInputTokens: 0,
      totalOutputTokens: 0,
      monthlyUsage: {},
      dailyUsage: {},
      providers: {},
      models: {},
    } as any)
    mockDb.users.get.mockResolvedValue({} as any)
    mockDb.usage.update.mockResolvedValue(undefined as any)
    mockDb.usage.atomicInc.mockResolvedValue(undefined as any)
    mockDb.userStats.addMonthlyCost.mockResolvedValue(undefined as any)
  })

  it('updates visible token counters for non-pipeline calls', async () => {
    await trackUsage('user-1', 'openai', 'gpt-4.1', 500, 200)
    expect(mockDb.usage.update).toHaveBeenCalledWith(
      'user-1',
      expect.objectContaining({
        totalInputTokens: 500,
        totalOutputTokens: 200,
      }),
    )
  })

  it('does NOT update visible token counters for pipeline calls', async () => {
    await trackUsage('user-1', 'google', 'gemini-2.5-flash-lite', 100, 50, true)
    const updateCall = mockDb.usage.update.mock.calls[0]
    expect(updateCall[1]).not.toHaveProperty('totalInputTokens')
    expect(updateCall[1]).not.toHaveProperty('totalOutputTokens')
  })

  it('updates daily per-model tokens even for pipeline calls', async () => {
    await trackUsage('user-1', 'google', 'gemini-2.5-flash-lite', 100, 50, true)
    const updateCall = mockDb.usage.update.mock.calls[0]
    const dailyKey = Object.keys(updateCall[1]).find(k => k.startsWith('dailyUsage.'))!
    const dailyData = updateCall[1][dailyKey] as any
    expect(dailyData.models['google-gemini-2.5-flash-lite']).toEqual({
      inputTokens: 100,
      outputTokens: 50,
    })
  })

  it('calls atomicInc for totalTokens on non-pipeline calls', async () => {
    await trackUsage('user-1', 'openai', 'gpt-4.1', 500, 200)
    expect(mockDb.usage.atomicInc).toHaveBeenCalledWith(
      'user-1',
      expect.objectContaining({ totalTokens: 700 }),
    )
  })

  it('does NOT call atomicInc for pipeline calls', async () => {
    await trackUsage('user-1', 'google', 'gemini-2.5-flash-lite', 100, 50, true)
    expect(mockDb.usage.atomicInc).not.toHaveBeenCalled()
  })

  it('skips monthly cost when model key is not in flat pricing map', async () => {
    // getPricingData() returns nested structure; calculateModelCost expects flat keys.
    // So cost is 0 and addMonthlyCost is not called for keys like "openai-gpt-4.1".
    await trackUsage('user-1', 'openai', 'gpt-4.1', 1000, 500)
    expect(mockDb.userStats.addMonthlyCost).not.toHaveBeenCalled()
  })

  it('creates provider stats for first usage', async () => {
    await trackUsage('user-1', 'openai', 'gpt-4.1', 1000, 500)
    expect(mockDb.usage.update).toHaveBeenCalledWith(
      'user-1',
      expect.objectContaining({
        'providers.openai': expect.objectContaining({
          totalTokens: 1500,
          totalInputTokens: 1000,
          totalOutputTokens: 500,
        }),
      }),
    )
  })

  it('creates model stats for first usage', async () => {
    await trackUsage('user-1', 'openai', 'gpt-4.1', 1000, 500)
    expect(mockDb.usage.update).toHaveBeenCalledWith(
      'user-1',
      expect.objectContaining({
        'models.openai-gpt-4.1': expect.objectContaining({
          totalTokens: 1500,
          provider: 'openai',
          model: 'gpt-4.1',
        }),
      }),
    )
  })
})

describe('trackConversationPrompt', () => {
  let trackConversationPrompt: typeof import('../server/services/usage.js').trackConversationPrompt

  beforeEach(async () => {
    vi.clearAllMocks()
    const mod = await import('../server/services/usage.js')
    trackConversationPrompt = mod.trackConversationPrompt
    mockDb.users.get.mockResolvedValue({} as any)
    mockDb.usage.atomicInc.mockResolvedValue(undefined as any)
  })

  it('does nothing when userId is empty', async () => {
    await trackConversationPrompt('', {})
    expect(mockDb.usage.get).not.toHaveBeenCalled()
  })

  it('does nothing when usage not found', async () => {
    mockDb.usage.get.mockResolvedValue(null)
    await trackConversationPrompt('user-1', {})
    expect(mockDb.usage.atomicInc).not.toHaveBeenCalled()
  })

  it('increments prompt counts via atomicInc', async () => {
    mockDb.usage.get.mockResolvedValue({
      totalPrompts: 5,
      monthlyUsage: {},
    } as any)
    await trackConversationPrompt('user-1', { text: 'follow up' })
    expect(mockDb.usage.atomicInc).toHaveBeenCalledWith(
      'user-1',
      expect.objectContaining({ totalPrompts: 1 }),
    )
  })
})
