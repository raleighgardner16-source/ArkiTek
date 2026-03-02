import { Router, type Request, type Response } from 'express'
import db from '../../database/db.js'
import { DAILY_CHALLENGE_REWARD, DAILY_CHALLENGES } from '../config/index.js'
import { getMonthForUser, getTodayForUser, getDateKeyForUser, getDayDiffFromDateKeys, getUserLocalDate, getTodaysChallenge } from '../helpers/date.js'
import { getPlanAllocation, getPricingData, calculateModelCost, calculateSerperQueryCost } from '../helpers/pricing.js'
import { getUserTimezone, trackPrompt } from '../services/usage.js'
import { createLogger } from '../config/logger.js'
import { sendSuccess, sendError } from '../types/api.js'

const log = createLogger('stats')

// =============================================================================
// Stats Router — mounted at /api/stats
// =============================================================================
const statsRouter = Router()

// Track a prompt submission
statsRouter.post('/prompt', async (req: Request, res: Response) => {
  try {
    const userId = req.userId!
    const { promptText, category, responses, summary, facts, sources, promptMode } = req.body
    log.debug({ userId, category, promptMode: promptMode || 'general', hasResponses: !!responses, responseCount: responses?.length || 0, hasSummary: !!summary, hasFacts: !!facts, factsCount: facts?.length || 0, hasSources: !!sources, sourcesCount: sources?.length || 0 }, 'Prompt tracking request')
    await trackPrompt(userId, promptText, category, { responses, summary, facts, sources, promptMode })
    log.debug({ userId }, 'Prompt tracking completed')
    
    sendSuccess(res, { message: 'Prompt tracked' })
  } catch (error: any) {
    log.error({ err: error }, 'Prompt tracking error')
    sendError(res, 'Failed to track prompt')
  }
})

// DEPRECATED: Token counting is now handled entirely by the backend in trackUsage().
// This endpoint is kept as a no-op so old cached frontend versions don't break.
statsRouter.post('/token-update', async (req: Request, res: Response) => {
  sendSuccess(res, { message: 'no-op — tokens are now tracked server-side in trackUsage()' })
})

// Update model pricing
statsRouter.post('/pricing', async (req: Request, res: Response) => {
  const userId = req.userId!
  const { provider, model, pricing } = req.body

  if (!provider || !model || pricing === undefined) {
    return sendError(res, 'provider, model, and pricing are required', 400)
  }

  const userUsage: any = await db.usage.getOrDefault(userId)
  if (!userUsage) {
    return sendError(res, 'User not found', 404)
  }

  const modelKey = `${provider}-${model}`
  if (!userUsage.models[modelKey]) {
    userUsage.models[modelKey] = {
      totalTokens: 0,
      totalQueries: 0,
      provider,
      model,
      pricing: null,
    }
  }

  userUsage.models[modelKey].pricing = pricing
  await db.usage.update(userId, { models: userUsage.models })

  sendSuccess(res, { message: 'Pricing updated' })
})

// Get user statistics
statsRouter.get('/:userId', async (req: Request, res: Response) => {
  const userId = req.userId!

  const [user, userUsage]: any[] = await Promise.all([
    db.users.get(userId),
    db.usage.getOrDefault(userId),
  ])
  
  const tz = await getUserTimezone(userId)

  const currentMonth = getMonthForUser(tz)
  const monthlyStats = (userUsage.monthlyUsage || {})[currentMonth] || { tokens: 0, inputTokens: 0, outputTokens: 0, queries: 0, prompts: 0 }

  // Calculate provider stats with monthly breakdown
  const providerStats: any = {}
  Object.keys(userUsage.providers || {}).forEach((provider: string) => {
    const providerData = userUsage.providers[provider]
    let totalPrompts = 0
    Object.keys(userUsage.models || {}).forEach((modelKey: string) => {
      if (modelKey.startsWith(`${provider}-`)) {
        totalPrompts += (userUsage.models[modelKey].totalPrompts || 0)
      }
    })
    
    providerStats[provider] = {
      totalTokens: (providerData.totalInputTokens || 0) + (providerData.totalOutputTokens || 0),
      totalInputTokens: providerData.totalInputTokens || 0,
      totalOutputTokens: providerData.totalOutputTokens || 0,
      totalPrompts,
      monthlyTokens: (providerData.monthlyInputTokens?.[currentMonth] || 0) + (providerData.monthlyOutputTokens?.[currentMonth] || 0),
      monthlyInputTokens: providerData.monthlyInputTokens?.[currentMonth] || 0,
      monthlyOutputTokens: providerData.monthlyOutputTokens?.[currentMonth] || 0,
    }
  })

  // Calculate model stats
  const modelStats: any = {}
  Object.keys(userUsage.models || {}).forEach((modelKey: string) => {
    modelStats[modelKey] = {
      ...userUsage.models[modelKey],
      totalInputTokens: userUsage.models[modelKey].totalInputTokens || 0,
      totalOutputTokens: userUsage.models[modelKey].totalOutputTokens || 0,
      totalTokens: (userUsage.models[modelKey].totalInputTokens || 0) + (userUsage.models[modelKey].totalOutputTokens || 0),
      totalPrompts: userUsage.models[modelKey].totalPrompts || 0,
    }
  })

  const createdAt = user?.createdAt || null

  // Free plan: $1.00/month. Pro: $7.50/month. Premium: $25.00/month.
  const FREE_MONTHLY_ALLOCATION = getPlanAllocation(user)
  
  const cachedMonthlyCost = user?.monthlyUsageCost?.[currentMonth] || 0
  
  const pricing: any = getPricingData()
  const dailyData = userUsage.dailyUsage?.[currentMonth] || {}
  
  // Calculate monthly cost from daily usage data (ground truth from per-model token counts)
  let calculatedMonthlyCost = 0
  Object.keys(dailyData).forEach((dateStr: string) => {
    const dayData = dailyData[dateStr]
    if (dayData && dayData.models) {
      Object.keys(dayData.models).forEach((modelKey: string) => {
        const modelDayData = dayData.models[modelKey]
        const dayInputTokens = modelDayData.inputTokens || 0
        const dayOutputTokens = modelDayData.outputTokens || 0
        calculatedMonthlyCost += calculateModelCost(modelKey, dayInputTokens, dayOutputTokens, pricing)
      })
    }
    const dayQueries = dayData?.queries || 0
    if (dayQueries > 0) {
      calculatedMonthlyCost += calculateSerperQueryCost(dayQueries)
    }
  })
  
  // Use the higher of cached vs calculated (handles both counter drift and data gaps)
  const monthlyCost = Math.max(cachedMonthlyCost, calculatedMonthlyCost)
  
  if (calculatedMonthlyCost > cachedMonthlyCost && user) {
    await db.userStats.addMonthlyCost(userId, currentMonth, calculatedMonthlyCost - cachedMonthlyCost)
    log.info({ userId, currentMonth, cachedMonthlyCost, calculatedMonthlyCost }, 'Corrected monthlyUsageCost from daily data')
  }
  
  log.debug({ userId, currentMonth, monthlyCost, cachedMonthlyCost, calculatedMonthlyCost }, 'Monthly cost')
  
  const remainingFreeAllocation = Math.max(0, FREE_MONTHLY_ALLOCATION - monthlyCost)
  
  const purchasedCredits = userUsage.purchasedCredits || { total: 0, remaining: 0, purchases: [] }
  
  const overage = Math.max(0, monthlyCost - FREE_MONTHLY_ALLOCATION)
  let purchasedCreditsRemaining = purchasedCredits.remaining || 0
  
  if (overage > 0 && purchasedCreditsRemaining > 0) {
    const deductFromPurchased = Math.min(overage, purchasedCreditsRemaining)
    purchasedCreditsRemaining = purchasedCreditsRemaining - deductFromPurchased
    
    if (purchasedCreditsRemaining !== (purchasedCredits.remaining || 0)) {
      await db.usage.update(userId, {
        purchasedCredits: { ...purchasedCredits, remaining: purchasedCreditsRemaining }
      })
    }
  }
  
  const totalAvailableBalance = remainingFreeAllocation + purchasedCreditsRemaining
  const totalAllocation = FREE_MONTHLY_ALLOCATION + (purchasedCredits.total || 0)
  
  const usedAmount = monthlyCost
  const freeUsagePercentage = totalAllocation > 0 ? (totalAvailableBalance / (FREE_MONTHLY_ALLOCATION + purchasedCreditsRemaining)) * 100 : 0

  // Calculate daily usage with costs and percentages
  const effectiveAllocation = monthlyCost + totalAvailableBalance
  const dailyUsage: any[] = []
  const { year: tzYear, month: tzMonth } = getUserLocalDate(tz)
  const daysInMonth = new Date(tzYear, tzMonth, 0).getDate()
  
  for (let day = 1; day <= daysInMonth; day++) {
    const dateStr = `${tzYear}-${String(tzMonth).padStart(2, '0')}-${String(day).padStart(2, '0')}`
    const dayData = dailyData[dateStr]
    
    if (dayData) {
      let dayCost = 0
      if (dayData.models) {
        Object.keys(dayData.models).forEach((modelKey: string) => {
          const modelDayData = dayData.models[modelKey]
          const dayInputTokens = modelDayData.inputTokens || 0
          const dayOutputTokens = modelDayData.outputTokens || 0
          const modelDayCost = calculateModelCost(modelKey, dayInputTokens, dayOutputTokens, pricing)
          dayCost += modelDayCost
        })
      }
      
      const dayQueries = dayData.queries || 0
      if (dayQueries > 0) {
        const queryCost = calculateSerperQueryCost(dayQueries)
        dayCost += queryCost
      }
      
      const dayPercentage = effectiveAllocation > 0 ? (dayCost / effectiveAllocation) * 100 : 0
      
      dailyUsage.push({
        date: dateStr,
        day,
        cost: dayCost,
        percentage: dayPercentage,
        inputTokens: dayData.inputTokens || 0,
        outputTokens: dayData.outputTokens || 0,
      })
    } else {
      dailyUsage.push({
        date: dateStr,
        day,
        cost: 0,
        percentage: 0,
        inputTokens: 0,
        outputTokens: 0,
      })
    }
  }

  const roundCents = (v: number) => Math.round((v || 0) * 100) / 100

  const totalTokens = userUsage.totalTokens || 0
  const monthlyTokens = monthlyStats.tokens || 0
  const totalPrompts = userUsage.totalPrompts || 0
  const monthlyPrompts = monthlyStats.prompts || 0

  const usagePercentUsed = effectiveAllocation > 0 ? Math.min((monthlyCost / effectiveAllocation) * 100, 100) : 0
  const usagePercentRemaining = Math.max(0, 100 - usagePercentUsed)
  const purchasedCreditsPercent = effectiveAllocation > 0 ? (purchasedCreditsRemaining / effectiveAllocation) * 100 : 0

  sendSuccess(res, {
    totalTokens,
    totalInputTokens: userUsage.totalInputTokens || 0,
    totalOutputTokens: userUsage.totalOutputTokens || 0,
    totalPrompts,
    monthlyTokens,
    monthlyInputTokens: monthlyStats.inputTokens || 0,
    monthlyOutputTokens: monthlyStats.outputTokens || 0,
    monthlyPrompts,
    monthlyCost: roundCents(monthlyCost),
    freeMonthlyAllocation: FREE_MONTHLY_ALLOCATION,
    userPlan: user?.plan || (user?.subscriptionStatus === 'trialing' && !user?.stripeSubscriptionId ? 'free_trial' : 'pro'),
    remainingFreeAllocation: roundCents(remainingFreeAllocation),
    freeUsagePercentage: Math.round(freeUsagePercentage * 100) / 100,
    usagePercentUsed: Math.round(usagePercentUsed * 100) / 100,
    usagePercentRemaining: Math.round(usagePercentRemaining * 100) / 100,
    purchasedCreditsPercent: Math.round(purchasedCreditsPercent * 100) / 100,
    totalAvailableBalance: roundCents(totalAvailableBalance),
    effectiveAllocation: roundCents(effectiveAllocation),
    purchasedCredits: {
      total: roundCents(purchasedCredits.total),
      remaining: roundCents(purchasedCreditsRemaining),
      purchaseCount: purchasedCredits.purchases?.length || 0,
      lastPurchase: purchasedCredits.purchases?.[purchasedCredits.purchases.length - 1] || null
    },
    dailyUsage: dailyUsage.map(d => ({ ...d, cost: roundCents(d.cost), percentage: Math.round(d.percentage * 100) / 100 })),
    providers: providerStats,
    models: modelStats,
    categories: userUsage.categories || {},
    ratings: userUsage.ratings || {},
    streakDays: userUsage.streakDays || 0,
    councilPrompts: userUsage.councilPrompts || 0,
    debatePrompts: userUsage.debatePrompts || 0,
    createdAt,
    earnedBadges: userUsage.earnedBadges || [],
  })
})

// Save earned badges (permanent — badges can only be added, never removed)
statsRouter.post('/:userId/badges', async (req: Request, res: Response) => {
  const userId = req.userId!
  const { newBadges } = req.body
  
  if (!Array.isArray(newBadges) || newBadges.length === 0) {
    return sendSuccess(res, { earnedBadges: [] })
  }
  
  const userUsage: any = await db.usage.getOrDefault(userId)
  
  if (!userUsage.earnedBadges) {
    userUsage.earnedBadges = []
  }
  
  const existing = new Set(userUsage.earnedBadges)
  let added = 0
  for (const badgeId of newBadges) {
    if (!existing.has(badgeId)) {
      userUsage.earnedBadges.push(badgeId)
      existing.add(badgeId)
      added++
    }
  }
  
  if (added > 0) {
    await db.usage.update(userId, { earnedBadges: userUsage.earnedBadges })
    log.info({ userId, added, total: userUsage.earnedBadges.length }, 'Saved new badges')
  }
  
  sendSuccess(res, { earnedBadges: userUsage.earnedBadges })
})

// Get prompt history (last 10 prompts)
statsRouter.get('/:userId/history', async (req: Request, res: Response) => {
  const userId = req.userId!
  const userUsage: any = await db.usage.getOrDefault(userId)
  const promptHistory = userUsage.promptHistory || []
  sendSuccess(res, { prompts: promptHistory.slice(0, 10) })
})

// Clear prompt history
statsRouter.delete('/:userId/history', async (req: Request, res: Response) => {
  const userId = req.userId!
  log.info({ userId }, 'Clear history request')
  
  await db.usage.update(userId, { promptHistory: [] })
  
  log.info({ userId }, 'Prompt history cleared')
  sendSuccess(res, { message: 'Prompt history cleared' })
})

// Get categories stats
statsRouter.get('/:userId/categories', async (req: Request, res: Response) => {
  const userId = req.userId!
  const userUsage: any = await db.usage.getOrDefault(userId)
  
  const categories = userUsage.categories || {}
  const categoryPrompts = userUsage.categoryPrompts || {}
  
  // Handle migration: if categories[cat] is a number (old format), convert to new format
  const categoriesData: any = {}
  
  Object.keys(categories).forEach(cat => {
    const categoryValue = categories[cat]
    if (typeof categoryValue === 'number') {
      categoriesData[cat] = {
        count: categoryValue,
        recentPrompts: categoryPrompts[cat] || []
      }
    } else if (typeof categoryValue === 'object' && categoryValue !== null) {
      categoriesData[cat] = {
        count: categoryValue.count || 0,
        recentPrompts: categoryValue.recentPrompts || categoryPrompts[cat] || []
      }
    } else {
      categoriesData[cat] = {
        count: 0,
        recentPrompts: []
      }
    }
  })
  
  Object.keys(categoryPrompts).forEach(cat => {
    if (!categoriesData[cat] && categoryPrompts[cat] && categoryPrompts[cat].length > 0) {
      categoriesData[cat] = {
        count: 0,
        recentPrompts: categoryPrompts[cat] || []
      }
    }
  })
  
  log.debug({ categories: Object.keys(categoriesData).map(cat => ({ category: cat, count: categoriesData[cat].count, prompts: categoriesData[cat].recentPrompts?.length || 0 })) }, 'Categories API response')
  
  sendSuccess(res, { categories: categoriesData })
})

// Clear category prompts
// Use wildcard (*) to handle categories with forward slashes like "Politics/Law"
statsRouter.delete('/:userId/categories/*/prompts', async (req: Request, res: Response) => {
  const userId = req.userId!
  const categoryPath = req.params[0] || ''
  
  log.info({ userId, categoryPath }, 'Clear category request')
  
  const userUsage: any = await db.usage.getOrDefault(userId)
  
  const decodedCategory = decodeURIComponent(categoryPath)
  log.debug({ decodedCategory }, 'Clear category')
  
  if (!userUsage.categoryPrompts) {
    userUsage.categoryPrompts = {}
  }
  
  let cleared = false
  let matchedKey: string | null = null
  if (userUsage.categoryPrompts[decodedCategory]) {
    matchedKey = decodedCategory
  } else if (userUsage.categoryPrompts[categoryPath]) {
    matchedKey = categoryPath
  } else {
    const categoryKeys = Object.keys(userUsage.categoryPrompts || {})
    matchedKey = categoryKeys.find((key: string) => 
      key.toLowerCase() === decodedCategory.toLowerCase() || 
      decodeURIComponent(key) === decodedCategory ||
      key === categoryPath
    ) || null
  }
  
  if (matchedKey) {
    userUsage.categoryPrompts[matchedKey] = []
    cleared = true
    await db.usage.update(userId, { categoryPrompts: userUsage.categoryPrompts })
    log.info({ userId, decodedCategory }, 'Cleared prompts for category')
    sendSuccess(res, { message: `Prompts cleared for category: ${decodedCategory}` })
  } else {
    log.warn({ userId, decodedCategory, availableCategories: Object.keys(userUsage.categoryPrompts) }, 'Category not found')
    sendError(res, `Category "${decodedCategory}" not found`, 404)
  }
})

// Delete a single prompt from a category by index
statsRouter.delete('/:userId/categories/*/prompts/:promptIndex', async (req: Request, res: Response) => {
  const userId = req.userId!
  const categoryPath = req.params[0] || ''
  const promptIndex = parseInt(req.params.promptIndex as string, 10)

  log.info({ userId, categoryPath, promptIndex }, 'Delete prompt request')

  const userUsage: any = await db.usage.getOrDefault(userId)
  const decodedCategory = decodeURIComponent(categoryPath)

  if (!userUsage.categoryPrompts) {
    return sendError(res, 'No category prompts found', 404)
  }

  let prompts: any[] | null = null
  let matchedKey: string | null = null
  const categoryKeys = Object.keys(userUsage.categoryPrompts)
  for (const key of categoryKeys) {
    if (key === decodedCategory || key.toLowerCase() === decodedCategory.toLowerCase() || decodeURIComponent(key) === decodedCategory) {
      prompts = userUsage.categoryPrompts[key]
      matchedKey = key
      break
    }
  }

  if (!prompts || !matchedKey) {
    return sendError(res, `Category "${decodedCategory}" not found`, 404)
  }

  if (promptIndex < 0 || promptIndex >= prompts.length) {
    return sendError(res, `Invalid prompt index: ${promptIndex}`, 400)
  }

  prompts.splice(promptIndex, 1)
  userUsage.categoryPrompts[matchedKey] = prompts
  await db.usage.update(userId, { categoryPrompts: userUsage.categoryPrompts })

  log.info({ userId, promptIndex, decodedCategory }, 'Deleted prompt')
  sendSuccess(res, { message: `Prompt deleted from category: ${decodedCategory}` })
})

// Move a prompt from one category to another
statsRouter.post('/:userId/categories/*/prompts/:promptIndex/move', async (req: Request, res: Response) => {
  const userId = req.userId!
  const categoryPath = req.params[0] || ''
  const promptIndex = parseInt(req.params.promptIndex as string, 10)
  const { targetCategory } = req.body

  if (!targetCategory) {
    return sendError(res, 'targetCategory is required', 400)
  }

  log.info({ userId, categoryPath, promptIndex, targetCategory }, 'Move prompt request')

  const userUsage: any = await db.usage.getOrDefault(userId)
  const decodedSource = decodeURIComponent(categoryPath)

  if (!userUsage.categoryPrompts) {
    return sendError(res, 'No category prompts found', 404)
  }

  // Find the source category
  let sourcePrompts: any[] | null = null
  let sourceKey: string | null = null
  for (const key of Object.keys(userUsage.categoryPrompts)) {
    if (key === decodedSource || key.toLowerCase() === decodedSource.toLowerCase() || decodeURIComponent(key) === decodedSource) {
      sourcePrompts = userUsage.categoryPrompts[key]
      sourceKey = key
      break
    }
  }

  if (!sourcePrompts || !sourceKey) {
    return sendError(res, `Source category "${decodedSource}" not found`, 404)
  }

  if (promptIndex < 0 || promptIndex >= sourcePrompts.length) {
    return sendError(res, `Invalid prompt index: ${promptIndex}`, 400)
  }

  const [prompt] = sourcePrompts.splice(promptIndex, 1)
  userUsage.categoryPrompts[sourceKey] = sourcePrompts

  if (!userUsage.categoryPrompts[targetCategory]) {
    userUsage.categoryPrompts[targetCategory] = []
  }
  userUsage.categoryPrompts[targetCategory].push(prompt)

  // Update category counts as well
  if (userUsage.categories) {
    if (typeof userUsage.categories[sourceKey] === 'number' && userUsage.categories[sourceKey] > 0) {
      userUsage.categories[sourceKey]--
    }
    if (typeof userUsage.categories[targetCategory] === 'number') {
      userUsage.categories[targetCategory]++
    } else {
      userUsage.categories[targetCategory] = 1
    }
  }

  await db.usage.update(userId, {
    categoryPrompts: userUsage.categoryPrompts,
    categories: userUsage.categories,
  })

  log.info({ userId, from: decodedSource, to: targetCategory, promptIndex }, 'Moved prompt between categories')
  sendSuccess(res, { message: `Prompt moved from "${decodedSource}" to "${targetCategory}"` })
})

// Get ratings stats
statsRouter.get('/:userId/ratings', async (req: Request, res: Response) => {
  const userId = req.userId!
  const userUsage: any = await db.usage.getOrDefault(userId)
  sendSuccess(res, { ratings: userUsage.ratings || {} })
})

// Get streak info
statsRouter.get('/:userId/streak', async (req: Request, res: Response) => {
  const userId = req.userId!
  const [user, userUsage]: any[] = await Promise.all([
    db.users.get(userId),
    db.usage.getOrDefault(userId),
  ])
  if (!user) return sendSuccess(res, { streakDays: 0, lastActiveAt: null })

  const tz = user.timezone || null
  const todayKey = getTodayForUser(tz)
  const memberSinceRaw = user.subscriptionStartedDate || user.createdAt || null
  const memberSinceKey = getDateKeyForUser(memberSinceRaw, tz)

  let streakDays = userUsage.streakDays || 0
  if (memberSinceKey && streakDays > 0) {
    const membershipDayDiff = getDayDiffFromDateKeys(memberSinceKey, todayKey)
    if (membershipDayDiff !== null && membershipDayDiff >= 0) {
      const membershipDays = membershipDayDiff + 1
      streakDays = Math.min(streakDays, membershipDays)
    }
  }

  sendSuccess(res, { 
    streakDays,
    lastActiveAt: userUsage.lastActiveAt || null,
  })
})

// =============================================================================
// Daily Challenge Router — mounted at /api/daily-challenge
// =============================================================================
const dailyChallengeRouter = Router()

// Get daily challenge status
dailyChallengeRouter.get('/:userId/status', async (req: Request, res: Response) => {
  try {
    const userId = req.userId!
    const user: any = await db.users.get(userId)
    if (!user) return sendError(res, 'User not found', 404)

    const isFreePlan = user.plan === 'free_trial' || (user.subscriptionStatus === 'trialing' && !user.stripeSubscriptionId)
    const tz = await getUserTimezone(userId)
    const today = getDateKeyForUser(new Date(), tz)!
    const currentMonth = getMonthForUser(tz)
    const challenge = getTodaysChallenge(today, DAILY_CHALLENGES)

    const userUsage: any = await db.usage.getOrDefault(userId)
    const claimed = !!(userUsage.dailyChallengesClaimed && userUsage.dailyChallengesClaimed[today])

    const dailyData = userUsage.dailyUsage?.[currentMonth]?.[today]
    let progress = 0
    let met = false
    if (challenge.requirement === 'prompts') {
      const dayPrompts = dailyData?.prompts || 0
      progress = dayPrompts
      met = dayPrompts >= challenge.threshold
    } else if (challenge.requirement === 'models') {
      const modelsUsed = dailyData?.models ? Object.keys(dailyData.models).length : 0
      progress = modelsUsed
      met = modelsUsed >= challenge.threshold
    } else if (challenge.requirement === 'streak') {
      progress = userUsage.streakDays || 0
      met = progress >= challenge.threshold
    } else if (challenge.requirement === 'tokens') {
      const dayTokens = (dailyData?.inputTokens || 0) + (dailyData?.outputTokens || 0)
      progress = dayTokens
      met = dayTokens >= challenge.threshold
    } else if (challenge.requirement === 'categories') {
      const dayCats = dailyData?.categories ? Object.keys(dailyData.categories).length : 0
      progress = dayCats
      met = dayCats >= challenge.threshold
    }

    const planAllocation = getPlanAllocation(user)
    const [userStatsDoc]: any[] = await Promise.all([db.userStats.get(userId)])
    const monthlyCost = userStatsDoc?.monthlyUsageCost?.[currentMonth] || 0
    const purchasedCreditsRemaining = userUsage.purchasedCredits?.remaining || 0
    const remainingFreeAllocation = Math.max(0, planAllocation - monthlyCost)
    const totalAvailableBalance = remainingFreeAllocation + purchasedCreditsRemaining
    const effectiveAllocation = monthlyCost + totalAvailableBalance
    const percentageReward = effectiveAllocation > 0 ? (DAILY_CHALLENGE_REWARD / effectiveAllocation) * 100 : 0

    sendSuccess(res, {
      challenge: {
        ...challenge,
        progress,
        threshold: challenge.threshold,
        met,
      },
      claimed,
      isFreePlan,
      percentageReward: Math.round(percentageReward * 10) / 10,
      today,
    })
  } catch (error: any) {
    log.error({ err: error }, 'Daily challenge status error')
    sendError(res, 'Failed to get daily challenge status')
  }
})

// Claim daily challenge reward
dailyChallengeRouter.post('/:userId/claim', async (req: Request, res: Response) => {
  try {
    const userId = req.userId!
    const user: any = await db.users.get(userId)
    if (!user) return sendError(res, 'User not found', 404)

    const isFreePlan = user.plan === 'free_trial' || (user.subscriptionStatus === 'trialing' && !user.stripeSubscriptionId)
    if (isFreePlan) {
      return sendError(res, 'Daily challenges require a Pro or Premium plan', 403)
    }

    const tz = await getUserTimezone(userId)
    const today = getDateKeyForUser(new Date(), tz)!
    const currentMonth = getMonthForUser(tz)
    const challenge = getTodaysChallenge(today, DAILY_CHALLENGES)

    const userUsage: any = await db.usage.getOrDefault(userId)

    if (userUsage.dailyChallengesClaimed && userUsage.dailyChallengesClaimed[today]) {
      return sendError(res, 'Already claimed today\'s challenge', 400, { alreadyClaimed: true })
    }

    const dailyData = userUsage.dailyUsage?.[currentMonth]?.[today]
    let met = false
    if (challenge.requirement === 'prompts') {
      met = (dailyData?.prompts || 0) >= challenge.threshold
    } else if (challenge.requirement === 'models') {
      met = dailyData?.models ? Object.keys(dailyData.models).length >= challenge.threshold : false
    } else if (challenge.requirement === 'streak') {
      met = (userUsage.streakDays || 0) >= challenge.threshold
    } else if (challenge.requirement === 'tokens') {
      met = ((dailyData?.inputTokens || 0) + (dailyData?.outputTokens || 0)) >= challenge.threshold
    } else if (challenge.requirement === 'categories') {
      met = dailyData?.categories ? Object.keys(dailyData.categories).length >= challenge.threshold : false
    }

    if (!met) {
      return sendError(res, 'Challenge requirement not met yet', 400, { requirementNotMet: true })
    }

    const currentPurchased = userUsage.purchasedCredits || { total: 0, remaining: 0 }
    const newRemaining = (currentPurchased.remaining || 0) + DAILY_CHALLENGE_REWARD
    const newTotal = (currentPurchased.total || 0) + DAILY_CHALLENGE_REWARD

    const claimedMap = userUsage.dailyChallengesClaimed || {}
    claimedMap[today] = true

    await db.usage.update(userId, {
      [`dailyChallengesClaimed.${today}`]: true,
      'purchasedCredits.remaining': newRemaining,
      'purchasedCredits.total': newTotal,
    })

    const planAllocation = getPlanAllocation(user)
    const [userStatsDoc]: any[] = await Promise.all([db.userStats.get(userId)])
    const monthlyCost = userStatsDoc?.monthlyUsageCost?.[currentMonth] || 0
    const remainingFreeAllocation = Math.max(0, planAllocation - monthlyCost)
    const totalAvailableBalance = remainingFreeAllocation + newRemaining
    const effectiveAllocation = monthlyCost + totalAvailableBalance
    const percentageReward = effectiveAllocation > 0 ? (DAILY_CHALLENGE_REWARD / effectiveAllocation) * 100 : 0
    const newPercentRemaining = effectiveAllocation > 0 ? (totalAvailableBalance / effectiveAllocation) * 100 : 0

    log.info({ userId, challengeId: challenge.id, reward: DAILY_CHALLENGE_REWARD, percentageReward }, 'User claimed daily challenge')

    sendSuccess(res, {
      percentageReward: Math.round(percentageReward * 10) / 10,
      newPercentRemaining: Math.round(newPercentRemaining * 10) / 10,
    })
  } catch (error: any) {
    log.error({ err: error }, 'Daily challenge claim error')
    sendError(res, 'Failed to claim daily challenge')
  }
})

// =============================================================================
// User Router — mounted at /api/user
// =============================================================================
const userRouter = Router()

// Save model preferences
userRouter.put('/model-preferences', async (req: Request, res: Response) => {
  try {
    const userId = req.userId!
    const { selectedModels, autoSmartProviders } = req.body

    const user = await db.users.get(userId)
    if (!user) return sendError(res, 'User not found', 404)

    await db.users.update(userId, {
      modelPreferences: {
        selectedModels: selectedModels || [],
        autoSmartProviders: autoSmartProviders || {},
        updatedAt: new Date().toISOString(),
      }
    })

    sendSuccess(res)
  } catch (error: any) {
    log.error({ err: error }, 'Model preferences save error')
    sendError(res, 'Failed to save model preferences')
  }
})

// Load model preferences
userRouter.get('/model-preferences/:userId', async (req: Request, res: Response) => {
  try {
    const userId = req.userId!
    const user: any = await db.users.get(userId)
    if (!user) return sendError(res, 'User not found', 404)

    const prefs = user.modelPreferences || null
    sendSuccess(res, { modelPreferences: prefs })
  } catch (error: any) {
    log.error({ err: error }, 'Model preferences load error')
    sendError(res, 'Failed to load model preferences')
  }
})

// =============================================================================
// Ratings Router — mounted at /api/ratings
// =============================================================================
const ratingsRouter = Router()

// Save a rating for a model response
ratingsRouter.post('/', async (req: Request, res: Response) => {
  try {
    const userId = req.userId!
    const { responseId, rating, modelName } = req.body

    if (!responseId || rating === undefined) {
      return sendError(res, 'responseId and rating are required', 400)
    }

    if (rating < 1 || rating > 5) {
      return sendError(res, 'Rating must be between 1 and 5', 400)
    }

    const userUsage: any = await db.usage.getOrDefault(userId)
    if (!userUsage.ratings) {
      userUsage.ratings = {}
    }

    userUsage.ratings[responseId] = rating
    await db.usage.update(userId, { ratings: userUsage.ratings })

    sendSuccess(res, { message: 'Rating saved successfully' })
  } catch (error: any) {
    log.error({ err: error }, 'Save rating error')
    sendError(res, 'Failed to save rating')
  }
})

export { statsRouter, dailyChallengeRouter, userRouter, ratingsRouter }
