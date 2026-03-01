import { describe, it, expect } from 'vitest'
import {
  isNonParseableSource,
  buildSearchContextSnippet,
  verifyExtraction,
  cleanMistralResponse,
} from '../server/services/search.js'

describe('isNonParseableSource', () => {
  it('returns true for youtube.com URLs', () => {
    expect(isNonParseableSource('https://www.youtube.com/watch?v=abc123')).toBe(true)
  })

  it('returns true for youtu.be short links', () => {
    expect(isNonParseableSource('https://youtu.be/abc123')).toBe(true)
  })

  it('returns true for vimeo.com URLs', () => {
    expect(isNonParseableSource('https://vimeo.com/123456')).toBe(true)
  })

  it('returns true for tiktok.com URLs', () => {
    expect(isNonParseableSource('https://www.tiktok.com/@user/video/123')).toBe(true)
  })

  it('returns true for .mp4 files', () => {
    expect(isNonParseableSource('https://example.com/video.mp4')).toBe(true)
  })

  it('returns true for .webm files', () => {
    expect(isNonParseableSource('https://example.com/video.webm')).toBe(true)
  })

  it('returns true for .mov files', () => {
    expect(isNonParseableSource('https://example.com/video.mov')).toBe(true)
  })

  it('returns false for regular web pages', () => {
    expect(isNonParseableSource('https://example.com/article')).toBe(false)
  })

  it('returns false for wikipedia', () => {
    expect(isNonParseableSource('https://en.wikipedia.org/wiki/Test')).toBe(false)
  })

  it('is case insensitive', () => {
    expect(isNonParseableSource('https://WWW.YOUTUBE.COM/watch?v=test')).toBe(true)
  })
})

describe('buildSearchContextSnippet', () => {
  it('returns empty string when no context provided', () => {
    expect(buildSearchContextSnippet([], '')).toBe('')
  })

  it('includes previous prompt from context summaries', () => {
    const contexts = [{ originalPrompt: 'What is quantum computing?' }]
    const result = buildSearchContextSnippet(contexts)
    expect(result).toContain('Previous user prompt: What is quantum computing?')
  })

  it('includes assistant response when available', () => {
    const contexts = [
      {
        originalPrompt: 'Hello',
        isFull: true,
        response: 'Quantum computing uses qubits...',
      },
    ]
    const result = buildSearchContextSnippet(contexts)
    expect(result).toContain('Previous assistant response: Quantum computing uses qubits...')
  })

  it('falls back to summary when response not full', () => {
    const contexts = [
      {
        originalPrompt: 'Hello',
        isFull: false,
        summary: 'Short summary of the topic',
      },
    ]
    const result = buildSearchContextSnippet(contexts)
    expect(result).toContain('Previous assistant response: Short summary of the topic')
  })

  it('uses fallbackText when no context summaries', () => {
    const result = buildSearchContextSnippet([], 'fallback info')
    expect(result).toContain('Previous assistant response: fallback info')
  })

  it('truncates long prompts to 500 chars', () => {
    const longPrompt = 'x'.repeat(600)
    const contexts = [{ originalPrompt: longPrompt }]
    const result = buildSearchContextSnippet(contexts)
    expect(result.length).toBeLessThan(longPrompt.length + 50)
  })
})

describe('verifyExtraction', () => {
  const rawText = 'The Earth orbits the Sun at an average distance of about 93 million miles. Water boils at 100 degrees Celsius.'

  it('keeps facts whose source_quote is found in raw text', () => {
    const facts = [
      { fact: 'Earth orbits Sun', source_quote: '93 million miles', source_url: 'https://example.com' },
    ]
    const { verifiedFacts, discardRate } = verifyExtraction(rawText, facts)
    expect(verifiedFacts).toHaveLength(1)
    expect(discardRate).toBe(0)
  })

  it('discards facts whose source_quote is NOT in raw text', () => {
    const facts = [
      { fact: 'Mars is red', source_quote: 'Mars has iron oxide', source_url: '' },
    ]
    const { verifiedFacts, discardRate } = verifyExtraction(rawText, facts)
    expect(verifiedFacts).toHaveLength(0)
    expect(discardRate).toBe(1)
  })

  it('handles mixed verified and discarded facts', () => {
    const facts = [
      { fact: 'Earth-Sun distance', source_quote: '93 million miles', source_url: '' },
      { fact: 'Boiling point', source_quote: '100 degrees Celsius', source_url: '' },
      { fact: 'Fake fact', source_quote: 'not in text', source_url: '' },
    ]
    const { verifiedFacts, discardRate } = verifyExtraction(rawText, facts)
    expect(verifiedFacts).toHaveLength(2)
    expect(discardRate).toBeCloseTo(1 / 3)
  })

  it('returns 0 discard rate for empty array', () => {
    const { verifiedFacts, discardRate } = verifyExtraction(rawText, [])
    expect(verifiedFacts).toHaveLength(0)
    expect(discardRate).toBe(0)
  })

  it('case insensitive matching', () => {
    const facts = [
      { fact: 'Distance', source_quote: 'THE EARTH ORBITS', source_url: '' },
    ]
    const { verifiedFacts } = verifyExtraction(rawText, facts)
    expect(verifiedFacts).toHaveLength(1)
  })

  it('discards facts without source_quote', () => {
    const facts = [
      { fact: 'No source', source_quote: '', source_url: '' },
    ]
    const { verifiedFacts, discardRate } = verifyExtraction(rawText, facts)
    expect(verifiedFacts).toHaveLength(0)
    expect(discardRate).toBe(1)
  })
})

describe('cleanMistralResponse', () => {
  it('returns null/undefined as-is', () => {
    expect(cleanMistralResponse(null)).toBeNull()
    expect(cleanMistralResponse(undefined)).toBeUndefined()
  })

  it('returns regular text as-is', () => {
    expect(cleanMistralResponse('Hello, world!')).toBe('Hello, world!')
  })

  it('returns empty string as-is', () => {
    expect(cleanMistralResponse('')).toBe('')
  })

  it('extracts text after thinking JSON block', () => {
    const input = '{"type":"thinking","thinking":[{"type":"text","text":"thinking..."}]}Here is the actual response.'
    const result = cleanMistralResponse(input)
    expect(result).toBe('Here is the actual response.')
  })

  it('extracts text from thinking array when no text after JSON', () => {
    const input = '{"type":"thinking","thinking":[{"type":"text","text":"The answer is 42"}]}'
    const result = cleanMistralResponse(input)
    expect(result).toBe('The answer is 42')
  })

  it('does not modify normal JSON-like content without thinking marker', () => {
    const input = '{"key": "value"}'
    expect(cleanMistralResponse(input)).toBe('{"key": "value"}')
  })

  it('handles nested braces in thinking content', () => {
    const input = '{"type":"thinking","thinking":[{"type":"text","text":"test {nested} braces"}]}Actual output'
    const result = cleanMistralResponse(input)
    expect(result).toBe('Actual output')
  })
})
