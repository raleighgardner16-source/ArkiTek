import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  getCurrentDateString,
  getCurrentMonth,
  getCurrentMonthYear,
  getUserLocalDate,
  getMonthForUser,
  getTodayForUser,
  getDateKeyForUser,
  getDayDiffFromDateKeys,
  getTodaysChallenge,
} from '../server/helpers/date.js'

describe('getCurrentDateString', () => {
  it('returns a non-empty string', () => {
    const result = getCurrentDateString()
    expect(result).toBeTruthy()
    expect(typeof result).toBe('string')
  })

  it('contains the current year', () => {
    const result = getCurrentDateString()
    expect(result).toContain(String(new Date().getFullYear()))
  })

  it('accepts a custom timezone', () => {
    const result = getCurrentDateString('Asia/Tokyo')
    expect(result).toBeTruthy()
  })

  it('defaults to America/New_York', () => {
    const resultDefault = getCurrentDateString()
    const resultExplicit = getCurrentDateString('America/New_York')
    expect(resultDefault).toBe(resultExplicit)
  })
})

describe('getCurrentMonthYear', () => {
  it('returns month and year string', () => {
    const result = getCurrentMonthYear()
    expect(result).toMatch(/\w+ \d{4}/)
  })
})

describe('getCurrentMonth', () => {
  it('returns YYYY-MM format', () => {
    const result = getCurrentMonth()
    expect(result).toMatch(/^\d{4}-\d{2}$/)
  })
})

describe('getUserLocalDate', () => {
  it('returns UTC date parts when no timezone provided', () => {
    const now = new Date()
    const result = getUserLocalDate()
    expect(result.year).toBe(now.getUTCFullYear())
    expect(result.month).toBe(now.getUTCMonth() + 1)
    expect(result.day).toBe(now.getUTCDate())
  })

  it('returns date parts for a valid timezone', () => {
    const result = getUserLocalDate('America/Los_Angeles')
    expect(result.year).toBeGreaterThan(2020)
    expect(result.month).toBeGreaterThanOrEqual(1)
    expect(result.month).toBeLessThanOrEqual(12)
    expect(result.day).toBeGreaterThanOrEqual(1)
    expect(result.day).toBeLessThanOrEqual(31)
  })

  it('falls back to UTC for invalid timezone', () => {
    const now = new Date()
    const result = getUserLocalDate('Invalid/Timezone')
    expect(result.year).toBe(now.getUTCFullYear())
  })
})

describe('getMonthForUser', () => {
  it('returns YYYY-MM format', () => {
    const result = getMonthForUser()
    expect(result).toMatch(/^\d{4}-\d{2}$/)
  })

  it('accepts a timezone', () => {
    const result = getMonthForUser('Europe/London')
    expect(result).toMatch(/^\d{4}-\d{2}$/)
  })
})

describe('getTodayForUser', () => {
  it('returns YYYY-MM-DD format', () => {
    const result = getTodayForUser()
    expect(result).toMatch(/^\d{4}-\d{2}-\d{2}$/)
  })

  it('accepts a timezone', () => {
    const result = getTodayForUser('Asia/Tokyo')
    expect(result).toMatch(/^\d{4}-\d{2}-\d{2}$/)
  })
})

describe('getDateKeyForUser', () => {
  it('returns YYYY-MM-DD for a valid Date', () => {
    const result = getDateKeyForUser(new Date('2025-06-15T12:00:00Z'))
    expect(result).toBe('2025-06-15')
  })

  it('returns YYYY-MM-DD for an ISO string', () => {
    const result = getDateKeyForUser('2025-03-01T00:00:00Z')
    expect(result).toBe('2025-03-01')
  })

  it('adjusts for timezone', () => {
    // At midnight UTC on March 1st, it's still Feb 28 in US Pacific (UTC-8)
    const result = getDateKeyForUser('2025-03-01T02:00:00Z', 'America/Los_Angeles')
    expect(result).toBe('2025-02-28')
  })

  it('returns null for null input', () => {
    expect(getDateKeyForUser(null)).toBeNull()
  })

  it('returns null for undefined input', () => {
    expect(getDateKeyForUser(undefined)).toBeNull()
  })

  it('returns null for invalid date string', () => {
    expect(getDateKeyForUser('not-a-date')).toBeNull()
  })
})

describe('getDayDiffFromDateKeys', () => {
  it('returns 0 for the same date', () => {
    expect(getDayDiffFromDateKeys('2025-06-15', '2025-06-15')).toBe(0)
  })

  it('returns positive for forward diff', () => {
    expect(getDayDiffFromDateKeys('2025-06-15', '2025-06-17')).toBe(2)
  })

  it('returns negative for backward diff', () => {
    expect(getDayDiffFromDateKeys('2025-06-17', '2025-06-15')).toBe(-2)
  })

  it('handles month boundaries', () => {
    expect(getDayDiffFromDateKeys('2025-01-31', '2025-02-01')).toBe(1)
  })

  it('handles year boundaries', () => {
    expect(getDayDiffFromDateKeys('2024-12-31', '2025-01-01')).toBe(1)
  })

  it('returns null for null start', () => {
    expect(getDayDiffFromDateKeys(null, '2025-06-15')).toBeNull()
  })

  it('returns null for null end', () => {
    expect(getDayDiffFromDateKeys('2025-06-15', null)).toBeNull()
  })

  it('returns null for malformed date keys', () => {
    expect(getDayDiffFromDateKeys('2025-06', '2025-06-15')).toBeNull()
  })
})

describe('getTodaysChallenge', () => {
  const challenges = [
    { id: 'c1', description: 'Challenge 1', metric: 'prompts', target: 3, reward: 0.05 },
    { id: 'c2', description: 'Challenge 2', metric: 'prompts', target: 5, reward: 0.10 },
    { id: 'c3', description: 'Challenge 3', metric: 'council', target: 1, reward: 0.05 },
  ] as any[]

  it('returns a challenge from the array', () => {
    const result = getTodaysChallenge('2025-06-15', challenges)
    expect(challenges).toContain(result)
  })

  it('returns different challenges for different dates', () => {
    const r1 = getTodaysChallenge('2025-01-01', challenges)
    const r2 = getTodaysChallenge('2025-01-02', challenges)
    const r3 = getTodaysChallenge('2025-01-03', challenges)
    // At least two of three should differ (they cycle mod 3)
    const unique = new Set([
      challenges.indexOf(r1),
      challenges.indexOf(r2),
      challenges.indexOf(r3),
    ])
    expect(unique.size).toBeGreaterThanOrEqual(2)
  })

  it('wraps around the challenges array', () => {
    const result = getTodaysChallenge('2025-12-31', challenges)
    expect(challenges).toContain(result)
  })
})
