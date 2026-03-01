import { describe, it, expect, vi, beforeEach } from 'vitest'
import db from '../database/db.js'

const mockDb = vi.mocked(db)

vi.mock('axios', () => ({
  default: {
    post: vi.fn(),
    get: vi.fn(),
  },
}))

vi.mock('../server/helpers/tokenCounters.js', () => ({
  countTokens: vi.fn(() => 10),
  extractTokensFromResponse: vi.fn(() => ({ inputTokens: 50, outputTokens: 20 })),
  estimateTokensFallback: vi.fn((text: string) => Math.ceil((text?.length || 0) / 4)),
}))

describe('storeJudgeContext', () => {
  let storeJudgeContext: typeof import('../server/services/context.js').storeJudgeContext

  beforeEach(async () => {
    vi.clearAllMocks()
    const mod = await import('../server/services/context.js')
    storeJudgeContext = mod.storeJudgeContext
    mockDb.usage.update.mockResolvedValue(undefined as any)
  })

  it('does nothing when userId is empty', async () => {
    await storeJudgeContext('', 'response text')
    expect(mockDb.usage.getOrDefault).not.toHaveBeenCalled()
  })

  it('creates new context array when none exists', async () => {
    mockDb.usage.getOrDefault.mockResolvedValue({} as any)
    await storeJudgeContext('user-1', 'Judge response text', 'Original prompt')

    expect(mockDb.usage.update).toHaveBeenCalledWith(
      'user-1',
      expect.objectContaining({
        judgeConversationContext: expect.arrayContaining([
          expect.objectContaining({
            response: 'Judge response text',
            originalPrompt: 'Original prompt',
            isFull: true,
          }),
        ]),
      }),
    )
  })

  it('limits context to 5 entries', async () => {
    const existingContext = Array.from({ length: 5 }, (_, i) => ({
      summary: `Summary ${i}`,
      tokens: 30,
      originalPrompt: `Prompt ${i}`,
      timestamp: new Date().toISOString(),
      isFull: false,
    }))
    mockDb.usage.getOrDefault.mockResolvedValue({
      judgeConversationContext: existingContext,
    } as any)

    await storeJudgeContext('user-1', 'New response')

    const updateCall = mockDb.usage.update.mock.calls[0]
    const context = updateCall[1].judgeConversationContext as any[]
    expect(context.length).toBeLessThanOrEqual(5)
    expect(context[0].response).toBe('New response')
  })
})

describe('storeModelContext', () => {
  let storeModelContext: typeof import('../server/services/context.js').storeModelContext

  beforeEach(async () => {
    vi.clearAllMocks()
    const mod = await import('../server/services/context.js')
    storeModelContext = mod.storeModelContext
    mockDb.usage.update.mockResolvedValue(undefined as any)
  })

  it('does nothing when userId is empty', async () => {
    await storeModelContext('', 'gpt-4', 'response')
    expect(mockDb.usage.getOrDefault).not.toHaveBeenCalled()
  })

  it('does nothing when modelName is empty', async () => {
    await storeModelContext('user-1', '', 'response')
    expect(mockDb.usage.getOrDefault).not.toHaveBeenCalled()
  })

  it('creates model context namespace when none exists', async () => {
    mockDb.usage.getOrDefault.mockResolvedValue({} as any)
    await storeModelContext('user-1', 'gpt-4', 'Model response', 'Original prompt')

    expect(mockDb.usage.update).toHaveBeenCalledWith(
      'user-1',
      expect.objectContaining({
        modelConversationContext: expect.objectContaining({
          'gpt-4': expect.arrayContaining([
            expect.objectContaining({
              response: 'Model response',
              originalPrompt: 'Original prompt',
              isFull: true,
            }),
          ]),
        }),
      }),
    )
  })

  it('limits per-model context to 5 entries', async () => {
    const existingContext = Array.from({ length: 5 }, (_, i) => ({
      summary: `Summary ${i}`,
      tokens: 30,
      originalPrompt: `Prompt ${i}`,
      timestamp: new Date().toISOString(),
      isFull: false,
    }))
    mockDb.usage.getOrDefault.mockResolvedValue({
      modelConversationContext: { 'gpt-4': existingContext },
    } as any)

    await storeModelContext('user-1', 'gpt-4', 'New response')

    const updateCall = mockDb.usage.update.mock.calls[0]
    const context = updateCall[1].modelConversationContext['gpt-4'] as any[]
    expect(context.length).toBeLessThanOrEqual(5)
    expect(context[0].response).toBe('New response')
  })

  it('keeps separate context per model', async () => {
    mockDb.usage.getOrDefault.mockResolvedValue({
      modelConversationContext: {
        'claude-3': [{ summary: 'Old Claude context', isFull: false, timestamp: new Date().toISOString() }],
      },
    } as any)

    await storeModelContext('user-1', 'gpt-4', 'GPT response')

    const updateCall = mockDb.usage.update.mock.calls[0]
    const allContext = updateCall[1].modelConversationContext as any
    expect(allContext['gpt-4']).toBeDefined()
    expect(allContext['claude-3']).toBeDefined()
  })
})
