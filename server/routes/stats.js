import { Router } from 'express'
import db from '../../database/db.js'
import { DAILY_CHALLENGE_REWARD, DAILY_CHALLENGES } from '../config/index.js'
import { getMonthForUser, getTodayForUser, getDateKeyForUser, getDayDiffFromDateKeys, getUserLocalDate, getTodaysChallenge } from '../helpers/date.js'
import { getPlanAllocation, getPricingData, calculateModelCost, calculateSerperQueryCost } from '../helpers/pricing.js'
import { getUserTimezone, trackPrompt } from '../services/usage.js'

// =============================================================================
// Stats Router — mounted at /api/stats
// =============================================================================
const statsRouter = Router()

// Track a prompt submission
statsRouter.post('/prompt', async (req, res) => {
  try {
    const userId = req.userId
    const { promptText, category, responses, summary, facts, sources, promptMode } = req.body
    console.log('[Prompt Tracking] Received prompt tracking request for user:', userId, 'category:', category, 'mode:', promptMode || 'general')
    console.log('[Prompt Tracking] Additional data:', {
      hasResponses: !!responses,
      responseCount: responses?.length || 0,
      hasSummary: !!summary,
      hasFacts: !!facts,
      factsCount: facts?.length || 0,
      hasSources: !!sources,
      sourcesCount: sources?.length || 0,
    })
    await trackPrompt(userId, promptText, category, { responses, summary, facts, sources, promptMode })
    console.log('[Prompt Tracking] Prompt tracking completed for user:', userId)
    
    res.json({ success: true, message: 'Prompt tracked' })
  } catch (error) {
    console.error('[Prompt Tracking] Error in prompt tracking endpoint:', error)
    res.status(500).json({ error: 'Failed to track prompt' })
  }
})

// DEPRECATED: Token counting is now handled entirely by the backend in trackUsage().
// This endpoint is kept as a no-op so old cached frontend versions don't break.
statsRouter.post('/token-update', async (req, res) => {
  res.json({ success: true, message: 'no-op — tokens are now tracked server-side in trackUsage()' })
})

// Update model pricing
statsRouter.post('/pricing', async (req, res) => {
  const userId = req.userId
  const { provider, model, pricing } = req.body

  if (!provider || !model || pricing === undefined) {
    return res.status(400).json({ error: 'provider, model, and pricing are required' })
  }

  const userUsage = await db.usage.getOrDefault(userId)
  if (!userUsage) {
    return res.status(404).json({ error: 'User not found' })
  }

  const modelKey = `${provider}-${model}`
  if (!userUsage.models[modelKey]) {
    userUsage.models[modelKey] = {
      totalTokens: 0,
      totalQueries: 0,
      provider: provider,
      model: model,
      pricing: null,
    }
  }

  userUsage.models[modelKey].pricing = pricing
  await db.usage.update(userId, { models: userUsage.models })

  res.json({ success: true, message: 'Pricing updated' })
})

// Get user statistics
statsRouter.get('/:userId', async (req, res) => {
  const userId = req.userId

  const [user, userUsage] = await Promise.all([
    db.users.get(userId),
    db.usage.getOrDefault(userId),
  ])
  
  const tz = await getUserTimezone(userId)

  const currentMonth = getMonthForUser(tz)
  const monthlyStats = (userUsage.monthlyUsage || {})[currentMonth] || { tokens: 0, inputTokens: 0, outputTokens: 0, queries: 0, prompts: 0 }

  // Calculate provider stats with monthly breakdown
  const providerStats = {}
  Object.keys(userUsage.providers || {}).forEach((provider) => {
    const providerData = userUsage.providers[provider]
    let totalPrompts = 0
    Object.keys(userUsage.models || {}).forEach((modelKey) => {
      if (modelKey.startsWith(`${provider}-`)) {
        totalPrompts += (userUsage.models[modelKey].totalPrompts || 0)
      }
    })
    
    providerStats[provider] = {
      totalTokens: (providerData.totalInputTokens || 0) + (providerData.totalOutputTokens || 0),
      totalInputTokens: providerData.totalInputTokens || 0,
      totalOutputTokens: providerData.totalOutputTokens || 0,
      totalPrompts: totalPrompts,
      monthlyTokens: (providerData.monthlyInputTokens?.[currentMonth] || 0) + (providerData.monthlyOutputTokens?.[currentMonth] || 0),
      monthlyInputTokens: providerData.monthlyInputTokens?.[currentMonth] || 0,
      monthlyOutputTokens: providerData.monthlyOutputTokens?.[currentMonth] || 0,
    }
  })

  // Calculate model stats
  const modelStats = {}
  Object.keys(userUsage.models || {}).forEach((modelKey) => {
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
  
  let cachedMonthlyCost = user?.monthlyUsageCost?.[currentMonth] || 0
  
  const pricing = getPricingData()
  const dailyData = userUsage.dailyUsage?.[currentMonth] || {}
  
  // Calculate monthly cost from daily usage data (ground truth from per-model token counts)
  let calculatedMonthlyCost = 0
  Object.keys(dailyData).forEach((dateStr) => {
    const dayData = dailyData[dateStr]
    if (dayData && dayData.models) {
      Object.keys(dayData.models).forEach((modelKey) => {
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
  let monthlyCost = Math.max(cachedMonthlyCost, calculatedMonthlyCost)
  
  if (calculatedMonthlyCost > cachedMonthlyCost && user) {
    await db.userStats.addMonthlyCost(userId, currentMonth, calculatedMonthlyCost - cachedMonthlyCost)
    console.log(`[Stats] Corrected monthlyUsageCost from $${cachedMonthlyCost.toFixed(6)} to $${calculatedMonthlyCost.toFixed(6)} (from daily data)`)
  }
  
  console.log(`[Stats] Monthly cost for ${userId} in ${currentMonth}: $${monthlyCost.toFixed(4)} (cached: $${cachedMonthlyCost.toFixed(4)}, calculated: $${calculatedMonthlyCost.toFixed(4)})`)
  
  let remainingFreeAllocation = Math.max(0, FREE_MONTHLY_ALLOCATION - monthlyCost)
  
  let purchasedCredits = userUsage.purchasedCredits || { total: 0, remaining: 0, purchases: [] }
  
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
  const dailyUsage = []
  const { year: tzYear, month: tzMonth } = getUserLocalDate(tz)
  const daysInMonth = new Date(tzYear, tzMonth, 0).getDate()
  
  for (let day = 1; day <= daysInMonth; day++) {
    const dateStr = `${tzYear}-${String(tzMonth).padStart(2, '0')}-${String(day).padStart(2, '0')}`
    const dayData = dailyData[dateStr]
    
    if (dayData) {
      let dayCost = 0
      if (dayData.models) {
        Object.keys(dayData.models).forEach((modelKey) => {
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
        day: day,
        cost: dayCost,
        percentage: dayPercentage,
        inputTokens: dayData.inputTokens || 0,
        outputTokens: dayData.outputTokens || 0,
      })
    } else {
      dailyUsage.push({
        date: dateStr,
        day: day,
        cost: 0,
        percentage: 0,
        inputTokens: 0,
        outputTokens: 0,
      })
    }
  }

  const roundCents = (v) => Math.round((v || 0) * 100) / 100

  const totalTokens = userUsage.totalTokens || 0
  const monthlyTokens = monthlyStats.tokens || 0
  const totalPrompts = userUsage.totalPrompts || 0
  const monthlyPrompts = monthlyStats.prompts || 0

  const usagePercentUsed = effectiveAllocation > 0 ? Math.min((monthlyCost / effectiveAllocation) * 100, 100) : 0
  const usagePercentRemaining = Math.max(0, 100 - usagePercentUsed)
  const purchasedCreditsPercent = effectiveAllocation > 0 ? (purchasedCreditsRemaining / effectiveAllocation) * 100 : 0

  res.json({
    totalTokens: totalTokens,
    totalInputTokens: userUsage.totalInputTokens || 0,
    totalOutputTokens: userUsage.totalOutputTokens || 0,
    totalPrompts: totalPrompts,
    monthlyTokens: monthlyTokens,
    monthlyInputTokens: monthlyStats.inputTokens || 0,
    monthlyOutputTokens: monthlyStats.outputTokens || 0,
    monthlyPrompts: monthlyPrompts,
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
    createdAt: createdAt,
    earnedBadges: userUsage.earnedBadges || [],
  })
})

// Save earned badges (permanent — badges can only be added, never removed)
statsRouter.post('/:userId/badges', async (req, res) => {
  const userId = req.userId
  const { newBadges } = req.body
  
  if (!Array.isArray(newBadges) || newBadges.length === 0) {
    return res.json({ success: true, earnedBadges: [] })
  }
  
  const userUsage = await db.usage.getOrDefault(userId)
  
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
    console.log(`[Badges] Saved ${added} new badges for ${userId}. Total: ${userUsage.earnedBadges.length}`)
  }
  
  res.json({ success: true, earnedBadges: userUsage.earnedBadges })
})

// Get prompt history (last 10 prompts)
statsRouter.get('/:userId/history', async (req, res) => {
  const userId = req.userId
  const userUsage = await db.usage.getOrDefault(userId)
  const promptHistory = userUsage.promptHistory || []
  res.json({ prompts: promptHistory.slice(0, 10) })
})

// Clear prompt history
statsRouter.delete('/:userId/history', async (req, res) => {
  const userId = req.userId
  console.log(`[Clear History] DELETE request received for user: ${userId}`)
  
  await db.usage.update(userId, { promptHistory: [] })
  
  console.log(`[Clear History] Successfully cleared prompt history for user: ${userId}`)
  res.json({ success: true, message: 'Prompt history cleared' })
})

// Get categories stats
statsRouter.get('/:userId/categories', async (req, res) => {
  const userId = req.userId
  const userUsage = await db.usage.getOrDefault(userId)
  
  const categories = userUsage.categories || {}
  const categoryPrompts = userUsage.categoryPrompts || {}
  
  // Handle migration: if categories[cat] is a number (old format), convert to new format
  const categoriesData = {}
  
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
  
  console.log('[Categories API] Returning categories data:', Object.keys(categoriesData).map(cat => ({
    category: cat,
    count: categoriesData[cat].count,
    prompts: categoriesData[cat].recentPrompts?.length || 0
  })))
  
  res.json({ categories: categoriesData })
})

// Clear category prompts
// Use wildcard (*) to handle categories with forward slashes like "Politics/Law"
statsRouter.delete('/:userId/categories/*/prompts', async (req, res) => {
  const userId = req.userId
  const categoryPath = req.params[0] || ''
  
  console.log(`[Clear Category] DELETE request received for user: ${userId}, category path: ${categoryPath}`)
  
  const userUsage = await db.usage.getOrDefault(userId)
  
  const decodedCategory = decodeURIComponent(categoryPath)
  console.log(`[Clear Category] Decoded category: ${decodedCategory}`)
  
  if (!userUsage.categoryPrompts) {
    userUsage.categoryPrompts = {}
  }
  
  let cleared = false
  let matchedKey = null
  if (userUsage.categoryPrompts[decodedCategory]) {
    matchedKey = decodedCategory
  } else if (userUsage.categoryPrompts[categoryPath]) {
    matchedKey = categoryPath
  } else {
    const categoryKeys = Object.keys(userUsage.categoryPrompts || {})
    matchedKey = categoryKeys.find(key => 
      key.toLowerCase() === decodedCategory.toLowerCase() || 
      decodeURIComponent(key) === decodedCategory ||
      key === categoryPath
    )
  }
  
  if (matchedKey) {
    userUsage.categoryPrompts[matchedKey] = []
    cleared = true
    await db.usage.update(userId, { categoryPrompts: userUsage.categoryPrompts })
    console.log(`[Clear Category] Successfully cleared prompts for category "${decodedCategory}" for user: ${userId}`)
    res.json({ success: true, message: `Prompts cleared for category: ${decodedCategory}` })
  } else {
    console.log(`[Clear Category] Category not found. Available categories: ${Object.keys(userUsage.categoryPrompts).join(', ')}`)
    res.status(404).json({ error: `Category "${decodedCategory}" not found` })
  }
})

// Delete a single prompt from a category by index
statsRouter.delete('/:userId/categories/*/prompts/:promptIndex', async (req, res) => {
  const userId = req.userId
  const categoryPath = req.params[0] || ''
  const promptIndex = parseInt(req.params.promptIndex, 10)

  console.log(`[Delete Prompt] DELETE request for user: ${userId}, category: ${categoryPath}, index: ${promptIndex}`)

  const userUsage = await db.usage.getOrDefault(userId)
  const decodedCategory = decodeURIComponent(categoryPath)

  if (!userUsage.categoryPrompts) {
    return res.status(404).json({ error: 'No category prompts found' })
  }

  let prompts = null
  let matchedKey = null
  const categoryKeys = Object.keys(userUsage.categoryPrompts)
  for (const key of categoryKeys) {
    if (key === decodedCategory || key.toLowerCase() === decodedCategory.toLowerCase() || decodeURIComponent(key) === decodedCategory) {
      prompts = userUsage.categoryPrompts[key]
      matchedKey = key
      break
    }
  }

  if (!prompts || !matchedKey) {
    return res.status(404).json({ error: `Category "${decodedCategory}" not found` })
  }

  if (promptIndex < 0 || promptIndex >= prompts.length) {
    return res.status(400).json({ error: `Invalid prompt index: ${promptIndex}` })
  }

  prompts.splice(promptIndex, 1)
  userUsage.categoryPrompts[matchedKey] = prompts
  await db.usage.update(userId, { categoryPrompts: userUsage.categoryPrompts })

  console.log(`[Delete Prompt] Deleted prompt at index ${promptIndex} from "${decodedCategory}" for user: ${userId}`)
  res.json({ success: true, message: `Prompt deleted from category: ${decodedCategory}` })
})

// Get ratings stats
statsRouter.get('/:userId/ratings', async (req, res) => {
  const userId = req.userId
  const userUsage = await db.usage.getOrDefault(userId)
  res.json({ ratings: userUsage.ratings || {} })
})

// Get streak info
statsRouter.get('/:userId/streak', async (req, res) => {
  const userId = req.userId
  const [user, userUsage] = await Promise.all([
    db.users.get(userId),
    db.usage.getOrDefault(userId),
  ])
  if (!user) return res.json({ streakDays: 0, lastActiveAt: null })

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

  res.json({ 
    streakDays,
    lastActiveAt: userUsage.lastActiveAt || null,
  })
})

// =============================================================================
// Daily Challenge Router — mounted at /api/daily-challenge
// =============================================================================
const dailyChallengeRouter = Router()

// Get daily challenge status
dailyChallengeRouter.get('/:userId/status', async (req, res) => {
  try {
    const userId = req.userId
    const user = await db.users.get(userId)
    if (!user) return res.status(404).json({ error: 'User not found' })

    const isFreePlan = user.plan === 'free_trial' || (user.subscriptionStatus === 'trialing' && !user.stripeSubscriptionId)
    const tz = await getUserTimezone(userId)
    const today = getDateKeyForUser(new Date(), tz)
    const currentMonth = getMonthForUser(tz)
    const challenge = getTodaysChallenge(today, DAILY_CHALLENGES)

    const userUsage = await db.usage.getOrDefault(userId)
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
    const [userStatsDoc] = await Promise.all([db.userStats.get(userId)])
    const monthlyCost = userStatsDoc?.monthlyUsageCost?.[currentMonth] || 0
    const purchasedCreditsRemaining = userUsage.purchasedCredits?.remaining || 0
    const remainingFreeAllocation = Math.max(0, planAllocation - monthlyCost)
    const totalAvailableBalance = remainingFreeAllocation + purchasedCreditsRemaining
    const effectiveAllocation = monthlyCost + totalAvailableBalance
    const percentageReward = effectiveAllocation > 0 ? (DAILY_CHALLENGE_REWARD / effectiveAllocation) * 100 : 0

    res.json({
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
  } catch (error) {
    console.error('[Daily Challenge] Error getting status:', error)
    res.status(500).json({ error: 'Failed to get daily challenge status' })
  }
})

// Claim daily challenge reward
dailyChallengeRouter.post('/:userId/claim', async (req, res) => {
  try {
    const userId = req.userId
    const user = await db.users.get(userId)
    if (!user) return res.status(404).json({ error: 'User not found' })

    const isFreePlan = user.plan === 'free_trial' || (user.subscriptionStatus === 'trialing' && !user.stripeSubscriptionId)
    if (isFreePlan) {
      return res.status(403).json({ error: 'Daily challenges require a Pro or Premium plan' })
    }

    const tz = await getUserTimezone(userId)
    const today = getDateKeyForUser(new Date(), tz)
    const currentMonth = getMonthForUser(tz)
    const challenge = getTodaysChallenge(today, DAILY_CHALLENGES)

    const userUsage = await db.usage.getOrDefault(userId)

    if (userUsage.dailyChallengesClaimed && userUsage.dailyChallengesClaimed[today]) {
      return res.status(400).json({ error: 'Already claimed today\'s challenge', alreadyClaimed: true })
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
      return res.status(400).json({ error: 'Challenge requirement not met yet', requirementNotMet: true })
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
    const [userStatsDoc] = await Promise.all([db.userStats.get(userId)])
    const monthlyCost = userStatsDoc?.monthlyUsageCost?.[currentMonth] || 0
    const remainingFreeAllocation = Math.max(0, planAllocation - monthlyCost)
    const totalAvailableBalance = remainingFreeAllocation + newRemaining
    const effectiveAllocation = monthlyCost + totalAvailableBalance
    const percentageReward = effectiveAllocation > 0 ? (DAILY_CHALLENGE_REWARD / effectiveAllocation) * 100 : 0
    const newPercentRemaining = effectiveAllocation > 0 ? (totalAvailableBalance / effectiveAllocation) * 100 : 0

    console.log(`[Daily Challenge] User ${userId} claimed daily challenge "${challenge.id}". Awarded $${DAILY_CHALLENGE_REWARD} (+${percentageReward.toFixed(1)}%)`)

    res.json({
      success: true,
      percentageReward: Math.round(percentageReward * 10) / 10,
      newPercentRemaining: Math.round(newPercentRemaining * 10) / 10,
    })
  } catch (error) {
    console.error('[Daily Challenge] Error claiming:', error)
    res.status(500).json({ error: 'Failed to claim daily challenge' })
  }
})

// =============================================================================
// User Router — mounted at /api/user
// =============================================================================
const userRouter = Router()

// Save model preferences
userRouter.put('/model-preferences', async (req, res) => {
  try {
    const userId = req.userId
    const { selectedModels, autoSmartProviders } = req.body

    const user = await db.users.get(userId)
    if (!user) return res.status(404).json({ error: 'User not found' })

    await db.users.update(userId, {
      modelPreferences: {
        selectedModels: selectedModels || [],
        autoSmartProviders: autoSmartProviders || {},
        updatedAt: new Date().toISOString(),
      }
    })

    res.json({ success: true })
  } catch (error) {
    console.error('[Model Preferences] Error saving:', error)
    res.status(500).json({ error: 'Failed to save model preferences' })
  }
})

// Load model preferences
userRouter.get('/model-preferences/:userId', async (req, res) => {
  try {
    const userId = req.userId
    const user = await db.users.get(userId)
    if (!user) return res.status(404).json({ error: 'User not found' })

    const prefs = user.modelPreferences || null
    res.json({ modelPreferences: prefs })
  } catch (error) {
    console.error('[Model Preferences] Error loading:', error)
    res.status(500).json({ error: 'Failed to load model preferences' })
  }
})

// =============================================================================
// Ratings Router — mounted at /api/ratings
// =============================================================================
const ratingsRouter = Router()

// Save a rating for a model response
ratingsRouter.post('/', async (req, res) => {
  try {
    const userId = req.userId
    const { responseId, rating, modelName } = req.body

    if (!responseId || rating === undefined) {
      return res.status(400).json({ error: 'responseId and rating are required' })
    }

    if (rating < 1 || rating > 5) {
      return res.status(400).json({ error: 'Rating must be between 1 and 5' })
    }

    const userUsage = await db.usage.getOrDefault(userId)
    if (!userUsage.ratings) {
      userUsage.ratings = {}
    }

    userUsage.ratings[responseId] = rating
    await db.usage.update(userId, { ratings: userUsage.ratings })

    res.json({ success: true, message: 'Rating saved successfully' })
  } catch (error) {
    console.error('[Save Rating] Error:', error)
    res.status(500).json({ error: 'Failed to save rating' })
  }
})

export { statsRouter, dailyChallengeRouter, userRouter, ratingsRouter }
