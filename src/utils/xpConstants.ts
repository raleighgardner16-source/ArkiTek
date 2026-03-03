// XP Level Calculation & Display (frontend mirror of server/config/xp.ts)

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

export const STREAK_MULTIPLIER_TIERS = [
  { minDays: 30, multiplier: 2.0, label: '2x' },
  { minDays: 14, multiplier: 1.75, label: '1.75x' },
  { minDays: 7, multiplier: 1.5, label: '1.5x' },
  { minDays: 3, multiplier: 1.25, label: '1.25x' },
  { minDays: 0, multiplier: 1.0, label: '1x' },
]

export function getStreakMultiplier(streakDays: number): { multiplier: number; label: string } {
  for (const tier of STREAK_MULTIPLIER_TIERS) {
    if (streakDays >= tier.minDays) return { multiplier: tier.multiplier, label: tier.label }
  }
  return { multiplier: 1.0, label: '1x' }
}
