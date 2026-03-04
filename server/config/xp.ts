// XP System Configuration
// XP is granted server-side for every user action. Level is derived from totalXP.

export const XP_VALUES = {
  PROMPT: 10,
  FOLLOW_UP: 15,
  FAVORITE: 20,
  DAILY_CHALLENGE: 50,
  GENERAL_BONUS: 15,
  DEBATE_BONUS: 20,
  FIRST_PROMPT_OF_DAY: 25,
  DISCOVER_MODEL: 15,
  DISCOVER_CATEGORY: 20,
} as const

export const STREAK_MULTIPLIERS: { minDays: number; multiplier: number }[] = [
  { minDays: 30, multiplier: 2.0 },
  { minDays: 14, multiplier: 1.75 },
  { minDays: 7, multiplier: 1.5 },
  { minDays: 3, multiplier: 1.25 },
  { minDays: 0, multiplier: 1.0 },
]

export function getStreakMultiplier(streakDays: number): number {
  for (const tier of STREAK_MULTIPLIERS) {
    if (streakDays >= tier.minDays) return tier.multiplier
  }
  return 1.0
}

export function getLevelFromXP(totalXP: number): { level: number; currentLevelXP: number; nextLevelXP: number } {
  let level = 1
  let xpForNext = 100
  let accumulated = 0

  while (totalXP >= accumulated + xpForNext && level < 200) {
    accumulated += xpForNext
    level++
    xpForNext = Math.floor(100 * Math.pow(1.15, level - 1))
  }

  return {
    level,
    currentLevelXP: totalXP - accumulated,
    nextLevelXP: xpForNext,
  }
}

export const LEVEL_TITLES: { maxLevel: number; title: string }[] = [
  { maxLevel: 5, title: 'Apprentice' },
  { maxLevel: 15, title: 'Thinker' },
  { maxLevel: 25, title: 'Strategist' },
  { maxLevel: 35, title: 'Architect' },
  { maxLevel: 45, title: 'Visionary' },
  { maxLevel: Infinity, title: 'ArkiTek Master' },
]

export function getLevelTitle(level: number): string {
  for (const tier of LEVEL_TITLES) {
    if (level <= tier.maxLevel) return tier.title
  }
  return 'ArkiTek Master'
}

export const STREAK_SAVE_LEVEL_COST = 5

/**
 * Calculate total XP needed to reach a given level from level 1.
 */
export function getTotalXPForLevel(targetLevel: number): number {
  let accumulated = 0
  for (let lvl = 1; lvl < targetLevel; lvl++) {
    accumulated += Math.floor(100 * Math.pow(1.15, lvl - 1))
  }
  return accumulated
}

/**
 * Calculate XP cost to save a streak: the XP difference between
 * the user's current level and 10 levels below it.
 * Returns { xpCost, newLevel, canAfford }.
 */
export function getStreakSaveXPCost(totalXP: number): { xpCost: number; newLevel: number; canAfford: boolean } {
  const { level } = getLevelFromXP(totalXP)
  if (level < STREAK_SAVE_LEVEL_COST) return { xpCost: 0, newLevel: level, canAfford: false }
  const newLevel = level - STREAK_SAVE_LEVEL_COST
  const xpCost = totalXP - getTotalXPForLevel(newLevel)
  return { xpCost: Math.max(0, xpCost), newLevel, canAfford: true }
}
