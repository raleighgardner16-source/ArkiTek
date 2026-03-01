import { describe, it, expect } from 'vitest'
import { estimateTokensFallback, extractTokensFromResponse } from '../server/helpers/tokenCounters.js'

describe('estimateTokensFallback', () => {
  it('returns 0 for empty string', () => {
    expect(estimateTokensFallback('')).toBe(0)
  })

  it('returns 0 for null/undefined', () => {
    expect(estimateTokensFallback(null as any)).toBe(0)
    expect(estimateTokensFallback(undefined as any)).toBe(0)
  })

  it('estimates roughly 1 token per 4 chars', () => {
    const text = 'a'.repeat(100)
    expect(estimateTokensFallback(text)).toBe(25)
  })

  it('rounds up partial tokens', () => {
    expect(estimateTokensFallback('abc')).toBe(1) // 3/4 = 0.75 → ceil = 1
  })

  it('handles single character', () => {
    expect(estimateTokensFallback('x')).toBe(1)
  })
})

describe('extractTokensFromResponse', () => {
  it('extracts from OpenAI-compatible format', () => {
    const response = {
      usage: {
        prompt_tokens: 100,
        completion_tokens: 50,
        total_tokens: 150,
      },
    }
    const result = extractTokensFromResponse(response, 'openai')
    expect(result).toEqual({
      inputTokens: 100,
      outputTokens: 50,
      totalTokens: 150,
    })
  })

  it('extracts from Anthropic format', () => {
    const response = {
      input_tokens: 200,
      output_tokens: 100,
    }
    const result = extractTokensFromResponse(response, 'anthropic')
    expect(result).toEqual({
      inputTokens: 200,
      outputTokens: 100,
      totalTokens: 300,
    })
  })

  it('extracts from Google Gemini usageMetadata format', () => {
    const response = {
      usageMetadata: {
        promptTokenCount: 150,
        candidatesTokenCount: 75,
        totalTokenCount: 225,
        thoughtsTokenCount: 0,
      },
    }
    const result = extractTokensFromResponse(response, 'google')
    expect(result).toEqual({
      inputTokens: 150,
      outputTokens: 75,
      totalTokens: 225,
      reasoningTokens: 0,
    })
  })

  it('extracts from Google usage_metadata (snake_case) format', () => {
    const response = {
      usage_metadata: {
        prompt_token_count: 100,
        candidates_token_count: 50,
        total_token_count: 150,
        thoughts_token_count: 10,
      },
    }
    const result = extractTokensFromResponse(response, 'google')
    expect(result).toEqual({
      inputTokens: 100,
      outputTokens: 50,
      totalTokens: 150,
      reasoningTokens: 10,
    })
  })

  it('handles xAI input_tokens/output_tokens in usage', () => {
    const response = {
      usage: {
        input_tokens: 300,
        output_tokens: 150,
        total_tokens: 450,
      },
    }
    const result = extractTokensFromResponse(response, 'xai')
    expect(result).toEqual({
      inputTokens: 300,
      outputTokens: 150,
      totalTokens: 450,
    })
  })

  it('returns null when no usage data present', () => {
    const result = extractTokensFromResponse({}, 'openai')
    expect(result).toBeNull()
  })

  it('returns null for completely empty response', () => {
    const result = extractTokensFromResponse({}, 'unknown')
    expect(result).toBeNull()
  })

  it('handles missing fields gracefully with 0 defaults', () => {
    const response = {
      usage: {},
    }
    const result = extractTokensFromResponse(response, 'openai')
    expect(result).toEqual({
      inputTokens: 0,
      outputTokens: 0,
      totalTokens: 0,
    })
  })
})
