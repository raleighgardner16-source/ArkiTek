import { describe, it, expect } from 'vitest'
import {
  getPlanAllocation,
  getPricingData,
  calculateModelCost,
  calculateSerperQueryCost,
  buildTokenBreakdown,
} from '../server/helpers/pricing.js'

describe('getPlanAllocation', () => {
  it('returns 25.00 for premium plan', () => {
    expect(getPlanAllocation({ plan: 'premium' })).toBe(25.0)
  })

  it('returns 7.50 for pro plan', () => {
    expect(getPlanAllocation({ plan: 'pro' })).toBe(7.5)
  })

  it('returns 7.50 for active status with Stripe subscription', () => {
    expect(
      getPlanAllocation({ subscriptionStatus: 'active', stripeSubscriptionId: 'sub_123' }),
    ).toBe(7.5)
  })

  it('returns 1.00 for free_trial plan', () => {
    expect(getPlanAllocation({ plan: 'free_trial' })).toBe(1.0)
  })

  it('returns 1.00 for trialing status without Stripe subscription', () => {
    expect(getPlanAllocation({ subscriptionStatus: 'trialing' })).toBe(1.0)
  })

  it('returns 7.50 for trialing status WITH Stripe subscription (paid trial)', () => {
    expect(
      getPlanAllocation({ subscriptionStatus: 'trialing', stripeSubscriptionId: 'sub_abc' }),
    ).toBe(7.5)
  })

  it('returns 7.50 as default for unknown plan', () => {
    expect(getPlanAllocation({})).toBe(7.5)
  })

  it('returns 7.50 for undefined user (fallback)', () => {
    expect(getPlanAllocation(undefined as any)).toBe(7.5)
  })

  it('prioritizes premium plan over any subscription status', () => {
    expect(
      getPlanAllocation({
        plan: 'premium',
        subscriptionStatus: 'trialing',
        stripeSubscriptionId: 'sub_x',
      }),
    ).toBe(25.0)
  })
})

describe('calculateModelCost', () => {
  const pricing: Record<string, { input: number; output: number; per: number }> = {
    'openai-gpt-4.1': { input: 2.0, output: 8.0, per: 1_000_000 },
    'google-gemini-2.5-flash-lite': { input: 0.1, output: 0.4, per: 1_000_000 },
  }

  it('calculates cost correctly for input + output tokens', () => {
    const cost = calculateModelCost('openai-gpt-4.1', 1000, 500, pricing)
    const expected = (1000 / 1_000_000) * 2.0 + (500 / 1_000_000) * 8.0
    expect(cost).toBeCloseTo(expected, 10)
  })

  it('returns 0 for a model not in pricing', () => {
    expect(calculateModelCost('unknown-model', 1000, 500, pricing)).toBe(0)
  })

  it('returns 0 for zero tokens', () => {
    expect(calculateModelCost('openai-gpt-4.1', 0, 0, pricing)).toBe(0)
  })

  it('handles large token counts', () => {
    const cost = calculateModelCost('google-gemini-2.5-flash-lite', 1_000_000, 1_000_000, pricing)
    const expected = (1_000_000 / 1_000_000) * 0.1 + (1_000_000 / 1_000_000) * 0.4
    expect(cost).toBeCloseTo(expected, 10)
  })
})

describe('calculateSerperQueryCost', () => {
  it('returns 0.001 per query', () => {
    expect(calculateSerperQueryCost(1)).toBeCloseTo(0.001)
  })

  it('returns 0 for zero queries', () => {
    expect(calculateSerperQueryCost(0)).toBe(0)
  })

  it('scales linearly', () => {
    expect(calculateSerperQueryCost(100)).toBeCloseTo(0.1)
  })
})

describe('getPricingData', () => {
  it('returns pricing for all expected providers', () => {
    const data = getPricingData()
    expect(data).toHaveProperty('openai')
    expect(data).toHaveProperty('anthropic')
    expect(data).toHaveProperty('google')
    expect(data).toHaveProperty('xai')
    expect(data).toHaveProperty('meta')
    expect(data).toHaveProperty('deepseek')
    expect(data).toHaveProperty('mistral')
    expect(data).toHaveProperty('serper')
  })

  it('each provider has a name and models', () => {
    const data = getPricingData()
    for (const [key, provider] of Object.entries(data)) {
      expect(provider).toHaveProperty('name')
      if (key !== 'serper') {
        expect(provider).toHaveProperty('models')
      }
    }
  })

  it('serper has queryTiers array', () => {
    const data = getPricingData()
    expect(data.serper.queryTiers).toBeInstanceOf(Array)
    expect(data.serper.queryTiers.length).toBeGreaterThan(0)
  })

  it('openai models have numeric input/output pricing', () => {
    const data = getPricingData()
    const gpt41 = data.openai.models['gpt-4.1']
    expect(gpt41.input).toBeTypeOf('number')
    expect(gpt41.output).toBeTypeOf('number')
  })
})

describe('buildTokenBreakdown', () => {
  it('splits tokens between user prompt, source context, and overhead', () => {
    const result = buildTokenBreakdown('hello world', 'source text here', 100)
    expect(result).toHaveProperty('userPrompt')
    expect(result).toHaveProperty('sourceContext')
    expect(result).toHaveProperty('systemOverhead')
    expect(result.userPrompt).toBeGreaterThan(0)
    expect(result.sourceContext).toBeGreaterThan(0)
  })

  it('system overhead is non-negative even when estimates exceed total', () => {
    const result = buildTokenBreakdown('x'.repeat(1000), 'y'.repeat(1000), 10)
    expect(result.systemOverhead).toBeGreaterThanOrEqual(0)
  })

  it('handles empty inputs', () => {
    const result = buildTokenBreakdown('', '', 50)
    expect(result.userPrompt).toBe(0)
    expect(result.sourceContext).toBe(0)
    expect(result.systemOverhead).toBe(50)
  })
})
