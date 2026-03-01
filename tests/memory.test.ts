import { describe, it, expect } from 'vitest'
import { buildEmbeddingText, formatMemoryContext } from '../server/services/memory.js'

describe('buildEmbeddingText', () => {
  it('starts with the user prompt', () => {
    const result = buildEmbeddingText('What is AI?', [], null, [])
    expect(result).toBe('User prompt: What is AI?')
  })

  it('includes summary when provided', () => {
    const result = buildEmbeddingText('Question', [], { text: 'Summary of the answer' }, [])
    expect(result).toContain('Summary: Summary of the answer')
  })

  it('uses first response text when no summary', () => {
    const responses = [{ text: 'First response content' }]
    const result = buildEmbeddingText('Question', responses, null, [])
    expect(result).toContain('Response: First response content')
  })

  it('falls back to modelResponse field', () => {
    const responses = [{ modelResponse: 'Model response content' }]
    const result = buildEmbeddingText('Question', responses, null, [])
    expect(result).toContain('Response: Model response content')
  })

  it('prefers summary over first response', () => {
    const responses = [{ text: 'Response text' }]
    const result = buildEmbeddingText('Question', responses, { text: 'Summary text' }, [])
    expect(result).toContain('Summary: Summary text')
    expect(result).not.toContain('Response: Response text')
  })

  it('includes conversation turns', () => {
    const turns = [
      { user: 'Follow-up question', assistant: 'Follow-up answer', modelName: 'GPT-4' },
    ]
    const result = buildEmbeddingText('Original', [], null, turns)
    expect(result).toContain('Follow-up conversation:')
    expect(result).toContain('User: Follow-up question')
    expect(result).toContain('GPT-4: Follow-up answer')
  })

  it('uses "Assistant" as default model name for turns', () => {
    const turns = [{ user: 'question', assistant: 'answer' }]
    const result = buildEmbeddingText('Prompt', [], null, turns)
    expect(result).toContain('Assistant: answer')
  })

  it('truncates total text to 4000 chars when conversation is long', () => {
    const turns = Array.from({ length: 50 }, (_, i) => ({
      user: `Question ${i}: ${'x'.repeat(100)}`,
      assistant: `Answer ${i}: ${'y'.repeat(200)}`,
    }))
    const result = buildEmbeddingText('Original prompt', [], null, turns)
    expect(result.length).toBeLessThanOrEqual(4000)
  })

  it('truncates summary to 500 chars', () => {
    const longSummary = { text: 'a'.repeat(600) }
    const result = buildEmbeddingText('Prompt', [], longSummary, [])
    const summaryPart = result.split('Summary: ')[1]
    expect(summaryPart.length).toBeLessThanOrEqual(500)
  })
})

describe('formatMemoryContext', () => {
  it('returns empty string for empty array', () => {
    expect(formatMemoryContext([])).toBe('')
  })

  it('returns empty string for null/undefined', () => {
    expect(formatMemoryContext(null as any)).toBe('')
    expect(formatMemoryContext(undefined as any)).toBe('')
  })

  it('formats contexts with numbered entries', () => {
    const contexts = [
      {
        originalPrompt: 'What is quantum computing?',
        summarySnippet: 'Quantum computing uses qubits instead of classical bits.',
        savedAt: '2025-06-15T12:00:00Z',
        score: 0.85,
      },
    ]
    const result = formatMemoryContext(contexts)
    expect(result).toContain('1.')
    expect(result).toContain('What is quantum computing?')
    expect(result).toContain('Quantum computing uses qubits')
    expect(result).toContain('Relevant context from this user')
  })

  it('formats multiple contexts with sequential numbers', () => {
    const contexts = [
      { originalPrompt: 'First question', summarySnippet: 'First answer', savedAt: '2025-06-15', score: 0.9 },
      { originalPrompt: 'Second question', summarySnippet: 'Second answer', savedAt: '2025-06-14', score: 0.8 },
    ]
    const result = formatMemoryContext(contexts)
    expect(result).toContain('1.')
    expect(result).toContain('2.')
    expect(result).toContain('First question')
    expect(result).toContain('Second question')
  })

  it('adds ellipsis for long snippets (795+ chars)', () => {
    const contexts = [
      {
        originalPrompt: 'Question',
        summarySnippet: 'a'.repeat(800),
        savedAt: '2025-06-15',
        score: 0.9,
      },
    ]
    const result = formatMemoryContext(contexts)
    expect(result).toContain('...')
  })

  it('shows "Unknown date" when savedAt is missing', () => {
    const contexts = [
      { originalPrompt: 'Question', summarySnippet: 'Answer', score: 0.9 },
    ]
    const result = formatMemoryContext(contexts)
    expect(result).toContain('Unknown date')
  })
})
