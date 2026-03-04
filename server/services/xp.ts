import db from '../../database/db.js'
import { XP_VALUES, getStreakMultiplier } from '../config/xp.js'
import { createLogger } from '../config/logger.js'

const log = createLogger('xp')

function applyMultiplier(baseXP: number, streakDays: number): number {
  const multiplier = getStreakMultiplier(streakDays)
  return Math.floor(baseXP * multiplier)
}

/**
 * Grant XP for a prompt submission.
 * Called from trackPrompt after all prompt-level data is updated.
 */
export async function grantPromptXP(
  userId: string,
  options: {
    isGeneral: boolean
    isDebate: boolean
    today: string
    category: string
    modelsUsed: string[]
    streakDays: number
  }
) {
  const { isGeneral, isDebate, today, category, modelsUsed, streakDays } = options

  const userUsage: any = await db.usage.getOrDefault(userId)
  const xp = userUsage.xp || { totalXP: 0, lastDailyBonusDate: null, discoveredModels: [], discoveredCategories: [] }

  let earned = XP_VALUES.PROMPT

  if (isGeneral) earned += XP_VALUES.GENERAL_BONUS
  if (isDebate) earned += XP_VALUES.DEBATE_BONUS

  if (xp.lastDailyBonusDate !== today) {
    earned += XP_VALUES.FIRST_PROMPT_OF_DAY
    xp.lastDailyBonusDate = today
  }

  const discoveredModelsSet = new Set(xp.discoveredModels || [])
  for (const model of modelsUsed) {
    if (!discoveredModelsSet.has(model)) {
      earned += XP_VALUES.DISCOVER_MODEL
      discoveredModelsSet.add(model)
    }
  }
  xp.discoveredModels = Array.from(discoveredModelsSet)

  const discoveredCatsSet = new Set(xp.discoveredCategories || [])
  const cat = category || 'General Knowledge/Other'
  if (!discoveredCatsSet.has(cat)) {
    earned += XP_VALUES.DISCOVER_CATEGORY
    discoveredCatsSet.add(cat)
  }
  xp.discoveredCategories = Array.from(discoveredCatsSet)

  const finalXP = applyMultiplier(earned, streakDays)
  xp.totalXP = (xp.totalXP || 0) + finalXP

  await db.usage.update(userId, { xp })
  log.debug({ userId, earned, finalXP, streakDays, multiplier: getStreakMultiplier(streakDays), totalXP: xp.totalXP }, 'Prompt XP granted')
}

/**
 * Grant XP for a follow-up conversation message.
 */
export async function grantFollowUpXP(userId: string) {
  const userUsage: any = await db.usage.getOrDefault(userId)
  const xp = userUsage.xp || { totalXP: 0, lastDailyBonusDate: null, discoveredModels: [], discoveredCategories: [] }
  const streakDays = userUsage.streakDays || 0

  const finalXP = applyMultiplier(XP_VALUES.FOLLOW_UP, streakDays)
  xp.totalXP = (xp.totalXP || 0) + finalXP

  await db.usage.update(userId, { 'xp.totalXP': xp.totalXP })
  log.debug({ userId, finalXP, totalXP: xp.totalXP }, 'Follow-up XP granted')
}

/**
 * Grant XP for favoriting a model response.
 */
export async function grantFavoriteXP(userId: string) {
  const userUsage: any = await db.usage.getOrDefault(userId)
  const xp = userUsage.xp || { totalXP: 0, lastDailyBonusDate: null, discoveredModels: [], discoveredCategories: [] }
  const streakDays = userUsage.streakDays || 0

  const finalXP = applyMultiplier(XP_VALUES.FAVORITE, streakDays)
  xp.totalXP = (xp.totalXP || 0) + finalXP

  await db.usage.update(userId, { 'xp.totalXP': xp.totalXP })
  log.debug({ userId, finalXP, totalXP: xp.totalXP }, 'Favorite XP granted')
}

/**
 * Grant XP for completing and claiming a daily challenge.
 */
export async function grantDailyChallengeXP(userId: string) {
  const userUsage: any = await db.usage.getOrDefault(userId)
  const xp = userUsage.xp || { totalXP: 0, lastDailyBonusDate: null, discoveredModels: [], discoveredCategories: [] }
  const streakDays = userUsage.streakDays || 0

  const finalXP = applyMultiplier(XP_VALUES.DAILY_CHALLENGE, streakDays)
  xp.totalXP = (xp.totalXP || 0) + finalXP

  await db.usage.update(userId, { 'xp.totalXP': xp.totalXP })
  log.debug({ userId, finalXP, totalXP: xp.totalXP }, 'Daily challenge XP granted')
}
