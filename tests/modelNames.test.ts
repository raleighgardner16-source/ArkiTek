import { describe, it, expect } from 'vitest'
import { getShortModelName } from '../src/utils/modelNames.js'

describe('getShortModelName', () => {
  it('returns empty string for null', () => {
    expect(getShortModelName(null)).toBe('')
  })

  it('returns empty string for undefined', () => {
    expect(getShortModelName(undefined)).toBe('')
  })

  it('returns ChatGPT for openai models', () => {
    expect(getShortModelName('openai-gpt-4.1')).toBe('ChatGPT')
  })

  it('returns ChatGPT for gpt models', () => {
    expect(getShortModelName('gpt-5.2')).toBe('ChatGPT')
  })

  it('returns ChatGPT for o3/o4 models', () => {
    expect(getShortModelName('o3-mini')).toBe('ChatGPT')
    expect(getShortModelName('o4-preview')).toBe('ChatGPT')
  })

  it('returns Claude for anthropic models', () => {
    expect(getShortModelName('anthropic-claude-4.6-sonnet')).toBe('Claude')
  })

  it('returns Claude for claude models', () => {
    expect(getShortModelName('claude-4.5-haiku')).toBe('Claude')
  })

  it('returns Gemini for google models', () => {
    expect(getShortModelName('google-gemini-3.1-pro')).toBe('Gemini')
  })

  it('returns Gemini for gemini models', () => {
    expect(getShortModelName('gemini-2.5-flash-lite')).toBe('Gemini')
  })

  it('returns Grok for xai models', () => {
    expect(getShortModelName('xai-grok-4')).toBe('Grok')
  })

  it('returns Grok for grok models', () => {
    expect(getShortModelName('grok-3-mini')).toBe('Grok')
  })

  it('returns Llama for meta models', () => {
    expect(getShortModelName('meta-llama-4-maverick')).toBe('Llama')
  })

  it('returns Llama for llama models', () => {
    expect(getShortModelName('llama-3.3-8b-instruct')).toBe('Llama')
  })

  it('returns Mistral for mistral models', () => {
    expect(getShortModelName('mistral-medium-3.1')).toBe('Mistral')
  })

  it('returns original name for non-matching model variants', () => {
    expect(getShortModelName('magistral-medium')).toBe('magistral-medium')
  })

  it('returns DeepSeek for deepseek models', () => {
    expect(getShortModelName('deepseek-reasoning-model')).toBe('DeepSeek')
  })

  it('returns original name for unknown models', () => {
    expect(getShortModelName('some-unknown-model')).toBe('some-unknown-model')
  })

  it('is case insensitive', () => {
    expect(getShortModelName('OPENAI-GPT-4')).toBe('ChatGPT')
    expect(getShortModelName('Claude-3')).toBe('Claude')
  })
})
