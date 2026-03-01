import { createLogger } from '../config/logger.js'
import type { DailyChallenge } from '../config/index.js'

const log = createLogger('date')

const getCurrentDateString = (timeZone = 'America/New_York'): string => {
  const now = new Date()
  const options: Intl.DateTimeFormatOptions = { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric', timeZone }
  return now.toLocaleDateString('en-US', options)
}

const getCurrentMonthYear = (): string => {
  const now = new Date()
  return `${now.toLocaleString('en-US', { month: 'long', timeZone: 'America/New_York' })} ${now.getFullYear()}`
}

const getCurrentMonth = (): string => {
  const now = new Date()
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
}

interface UserLocalDate {
  year: number
  month: number
  day: number
}

const getUserLocalDate = (timezone?: string): UserLocalDate => {
  const now = new Date()
  if (!timezone) {
    return {
      year: now.getUTCFullYear(),
      month: now.getUTCMonth() + 1,
      day: now.getUTCDate(),
    }
  }
  try {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: timezone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).formatToParts(now)
    return {
      year: parseInt(parts.find(p => p.type === 'year')!.value),
      month: parseInt(parts.find(p => p.type === 'month')!.value),
      day: parseInt(parts.find(p => p.type === 'day')!.value),
    }
  } catch (err) {
    log.warn({ err, timezone }, 'Invalid timezone, falling back to UTC')
    return {
      year: now.getUTCFullYear(),
      month: now.getUTCMonth() + 1,
      day: now.getUTCDate(),
    }
  }
}

const getMonthForUser = (timezone?: string): string => {
  const { year, month } = getUserLocalDate(timezone)
  return `${year}-${String(month).padStart(2, '0')}`
}

const getTodayForUser = (timezone?: string): string => {
  const { year, month, day } = getUserLocalDate(timezone)
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
}

const getDateKeyForUser = (dateInput: string | Date | null | undefined, timezone?: string): string | null => {
  if (!dateInput) return null
  const parsed = new Date(dateInput)
  if (Number.isNaN(parsed.getTime())) return null

  try {
    if (timezone) {
      const parts = new Intl.DateTimeFormat('en-US', {
        timeZone: timezone,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
      }).formatToParts(parsed)
      const year = parts.find(p => p.type === 'year')?.value
      const month = parts.find(p => p.type === 'month')?.value
      const day = parts.find(p => p.type === 'day')?.value
      if (year && month && day) return `${year}-${month}-${day}`
    }
  } catch (err) {
    log.warn({ err, timezone }, 'Failed to format date key for timezone, falling back to UTC')
  }

  return parsed.toISOString().substring(0, 10)
}

const getDayDiffFromDateKeys = (startDateKey: string | null | undefined, endDateKey: string | null | undefined): number | null => {
  if (!startDateKey || !endDateKey) return null
  const startParts = startDateKey.split('-').map(Number)
  const endParts = endDateKey.split('-').map(Number)
  if (startParts.length !== 3 || endParts.length !== 3) return null
  if (startParts.some(Number.isNaN) || endParts.some(Number.isNaN)) return null

  const startMs = Date.UTC(startParts[0], startParts[1] - 1, startParts[2])
  const endMs = Date.UTC(endParts[0], endParts[1] - 1, endParts[2])
  return Math.round((endMs - startMs) / (1000 * 60 * 60 * 24))
}

const getTodaysChallenge = (dateStr: string, challenges: DailyChallenge[]): DailyChallenge => {
  const parts = dateStr.split('-').map(Number)
  const dayOfYear = Math.floor((Date.UTC(parts[0], parts[1] - 1, parts[2]) - Date.UTC(parts[0], 0, 0)) / (1000 * 60 * 60 * 24))
  return challenges[dayOfYear % challenges.length]
}

export {
  getCurrentDateString,
  getCurrentMonthYear,
  getCurrentMonth,
  getUserLocalDate,
  getMonthForUser,
  getTodayForUser,
  getDateKeyForUser,
  getDayDiffFromDateKeys,
  getTodaysChallenge,
}
