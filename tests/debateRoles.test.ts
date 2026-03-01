import { describe, it, expect } from 'vitest'
import { DEBATE_ROLES, getRoleByKey, getRoleSystemPrompt } from '../src/utils/debateRoles.js'

describe('DEBATE_ROLES', () => {
  it('contains 9 roles', () => {
    expect(DEBATE_ROLES).toHaveLength(9)
  })

  it('each role has required fields', () => {
    for (const role of DEBATE_ROLES) {
      expect(role.key).toBeTruthy()
      expect(role.label).toBeTruthy()
      expect(role.description).toBeTruthy()
      expect(role.systemPrompt).toBeTruthy()
    }
  })

  it('has unique keys', () => {
    const keys = DEBATE_ROLES.map(r => r.key)
    expect(new Set(keys).size).toBe(keys.length)
  })

  it('includes expected role keys', () => {
    const keys = DEBATE_ROLES.map(r => r.key)
    expect(keys).toContain('optimist')
    expect(keys).toContain('skeptic')
    expect(keys).toContain('neutral')
    expect(keys).toContain('realist')
    expect(keys).toContain('risk_analyst')
    expect(keys).toContain('long_term')
    expect(keys).toContain('short_term')
    expect(keys).toContain('probability')
    expect(keys).toContain('strategic')
  })
})

describe('getRoleByKey', () => {
  it('finds existing role', () => {
    const role = getRoleByKey('optimist')
    expect(role).toBeDefined()
    expect(role!.label).toContain('Optimist')
  })

  it('returns undefined for non-existent key', () => {
    expect(getRoleByKey('nonexistent')).toBeUndefined()
  })

  it('returns undefined for empty string', () => {
    expect(getRoleByKey('')).toBeUndefined()
  })
})

describe('getRoleSystemPrompt', () => {
  it('returns system prompt for valid key', () => {
    const prompt = getRoleSystemPrompt('skeptic')
    expect(prompt).toContain('Skeptic')
    expect(prompt.length).toBeGreaterThan(50)
  })

  it('returns empty string for invalid key', () => {
    expect(getRoleSystemPrompt('invalid')).toBe('')
  })

  it('returns empty string for empty key', () => {
    expect(getRoleSystemPrompt('')).toBe('')
  })
})
