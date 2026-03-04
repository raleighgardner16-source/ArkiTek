import db from '../../database/db.js'
import { getCurrentDateString, getMonthForUser, getTodayForUser, getDateKeyForUser } from '../helpers/date.js'
import { getPricingData, calculateModelCost } from '../helpers/pricing.js'
import { createLogger } from '../config/logger.js'
import { grantPromptXP, grantFollowUpXP } from './xp.js'

const log = createLogger('usage')

const getUserTimezone = async (userId: string) => {
  const user = await db.users.get(userId) as any
  return user?.timezone || null
}

const getCurrentDateStringForUser = async (userId: string | null | undefined) => {
  const timezone = userId ? await getUserTimezone(userId) : null
  if (!timezone) {
    return getCurrentDateString()
  }
  try {
    return getCurrentDateString(timezone)
  } catch (err: any) {
    log.warn({ err, userId, timezone }, 'Failed to format date for timezone, falling back to ET')
    return getCurrentDateString()
  }
}

// Track a prompt submission (one per user submission, regardless of models called)
const trackPrompt = async (userId: string, promptText: string, category: string, promptData: any = {}) => {
  const userUsage = await db.usage.getOrDefault(userId)
  const tz = await getUserTimezone(userId)
  const currentMonth = getMonthForUser(tz)
  const today = getTodayForUser(tz)

  // Track council prompts (prompts sent to 3+ providers/models)
  const responseCount = promptData?.responses?.length || 0
  if (responseCount >= 3) {
    userUsage.councilPrompts = (userUsage.councilPrompts || 0) + 1
    log.debug({ userId, responseCount, total: userUsage.councilPrompts }, 'Council prompt detected')
  }

  // Track debate prompts
  if (promptData?.promptMode === 'debate') {
    if (userUsage.debatePrompts === undefined) {
      userUsage.debatePrompts = 0
    }
    userUsage.debatePrompts = (userUsage.debatePrompts || 0) + 1
    log.debug({ userId, total: userUsage.debatePrompts }, 'Debate prompt detected')
  }

  // Count 1 prompt per user submission (actual increment handled by atomic $inc below)
  const oldTotal = userUsage.totalPrompts || 0
  log.debug({ userId, oldTotal, newTotal: oldTotal + 1 }, 'Prompt count')

  // Log monthly prompt count (actual increment handled by atomic $inc below)
  const oldMonthly = userUsage.monthlyUsage?.[currentMonth]?.prompts || 0
  log.debug({ userId, currentMonth, oldMonthly, newMonthly: oldMonthly + 1 }, 'Monthly prompt count')

  // NOTE: User's typed prompt tokens are NOT counted here anymore.
  // They are included in the full inputTokens counted by trackUsage() (which now counts input + output).
  // Adding them here would cause double-counting since the API's input token count already includes the user prompt.

  // Track prompt history (keep last 100, we'll return last 20 to frontend)
  if (promptText) {
    const promptEntry: Record<string, any> = {
      text: promptText.substring(0, 500), // Limit to 500 chars
      category: category || 'general',
      timestamp: new Date().toISOString(),
    }
    
    // Add responses, summary, facts, and sources if provided
    if (promptData.responses && Array.isArray(promptData.responses)) {
      promptEntry.responses = promptData.responses.map((r: any) => ({
        modelName: r.modelName,
        actualModelName: r.actualModelName,
        originalModelName: r.originalModelName,
        text: r.text,
        error: r.error || false,
        tokens: r.tokens || null,
      }))
    }
    
    if (promptData.summary) {
      promptEntry.summary = {
        text: promptData.summary.text,
        consensus: promptData.summary.consensus,
        summary: promptData.summary.summary,
        agreements: promptData.summary.agreements || [],
        disagreements: promptData.summary.disagreements || [],
        singleModel: promptData.summary.singleModel || false,
      }
    }
    
    if (promptData.facts && Array.isArray(promptData.facts)) {
      promptEntry.facts = promptData.facts.map((f: any) => ({
        fact: f.fact || f,
        source_quote: f.source_quote || null,
      }))
    }
    
    if (promptData.sources && Array.isArray(promptData.sources)) {
      promptEntry.sources = promptData.sources.map((s: any) => ({
        title: s.title,
        link: s.link,
        snippet: s.snippet,
      }))
    }
    
    userUsage.promptHistory.unshift(promptEntry)
    // Keep only last 10 prompts
    if (userUsage.promptHistory.length > 10) {
      userUsage.promptHistory = userUsage.promptHistory.slice(0, 10)
    }
  }

  // Track category counts and recent prompts per category (max 8 per category)
  const cat = category || 'General Knowledge/Other'
  if (!userUsage.categories[cat]) {
    userUsage.categories[cat] = 0
  }
  userUsage.categories[cat] += 1
  
  // Track recent prompts per category (keep only last 8)
  if (promptText) {
    if (!userUsage.categoryPrompts[cat]) {
      userUsage.categoryPrompts[cat] = []
    }
    // Add new prompt to the beginning
    const categoryPromptEntry: Record<string, any> = {
      text: promptText.substring(0, 500), // Limit to 500 chars
      timestamp: new Date().toISOString(),
    }
    
    // Add responses, summary, facts, and sources if provided
    if (promptData.responses && Array.isArray(promptData.responses)) {
      categoryPromptEntry.responses = promptData.responses.map((r: any) => ({
        modelName: r.modelName,
        actualModelName: r.actualModelName,
        originalModelName: r.originalModelName,
        text: r.text,
        error: r.error || false,
        tokens: r.tokens || null,
      }))
    }
    
    if (promptData.summary) {
      categoryPromptEntry.summary = {
        text: promptData.summary.text,
        consensus: promptData.summary.consensus,
        summary: promptData.summary.summary,
        agreements: promptData.summary.agreements || [],
        disagreements: promptData.summary.disagreements || [],
        singleModel: promptData.summary.singleModel || false,
      }
    }
    
    if (promptData.facts && Array.isArray(promptData.facts)) {
      categoryPromptEntry.facts = promptData.facts.map((f: any) => ({
        fact: f.fact || f,
        source_quote: f.source_quote || null,
      }))
    }
    
    if (promptData.sources && Array.isArray(promptData.sources)) {
      categoryPromptEntry.sources = promptData.sources.map((s: any) => ({
        title: s.title,
        link: s.link,
        snippet: s.snippet,
      }))
    }
    
    userUsage.categoryPrompts[cat].unshift(categoryPromptEntry)
    // Keep only last 8 prompts per category
    if (userUsage.categoryPrompts[cat].length > 8) {
      userUsage.categoryPrompts[cat] = userUsage.categoryPrompts[cat].slice(0, 8)
    }
  }

  // Update streak — compare YYYY-MM-DD date strings directly (no timezone confusion)
  // Normalize lastActiveAt to YYYY-MM-DD in case it was stored as a full ISO timestamp (from login)
  let lastActiveDate = userUsage.lastActiveAt
  if (lastActiveDate && lastActiveDate.length > 10) {
    // It's a full ISO timestamp like "2026-02-21T19:00:00.000Z" — extract just the date portion
    // using the user's timezone so the date is correct for their locale
    const parsed = new Date(lastActiveDate)
    if (!isNaN(parsed.getTime())) {
      if (tz) {
        lastActiveDate = getDateKeyForUser(parsed, tz)
      } else {
        lastActiveDate = parsed.toISOString().substring(0, 10)
      }
    }
  }

  if (lastActiveDate && lastActiveDate.length === 10) {
    // Compare YYYY-MM-DD strings directly — both are in the user's local timezone
    if (lastActiveDate === today) {
      // Same day, streak continues — no change needed
    } else {
      // Calculate day difference using date-only strings (avoid UTC time-of-day issues)
      const lastParts = lastActiveDate.split('-').map(Number)
      const todayParts = today.split('-').map(Number)
      const lastMs = Date.UTC(lastParts[0], lastParts[1] - 1, lastParts[2])
      const todayMs = Date.UTC(todayParts[0], todayParts[1] - 1, todayParts[2])
      const diffDays = Math.round((todayMs - lastMs) / (1000 * 60 * 60 * 24))

      if (diffDays === 1) {
        // Consecutive day, increment streak
        userUsage.streakDays = (userUsage.streakDays || 0) + 1
        // Clear any pending break since user is back on track
        if (userUsage.pendingStreakBreak) {
          userUsage.pendingStreakBreak = null
        }
      } else {
        // Streak broken — save pending break if there was a meaningful streak,
        // unless one is already pending (don't overwrite with lower value)
        const oldStreak = userUsage.streakDays || 0
        if (oldStreak >= 2 && !userUsage.pendingStreakBreak) {
          userUsage.pendingStreakBreak = {
            broken: true,
            previousStreak: oldStreak,
            brokenAt: today,
          }
        }
        userUsage.streakDays = 1
      }
    }
  } else {
    // First time ever, start streak at 1
    userUsage.streakDays = 1
  }
  userUsage.lastActiveAt = today

  // Write changed fields to DB
  const setFields: Record<string, any> = {
    streakDays: userUsage.streakDays,
    lastActiveAt: userUsage.lastActiveAt,
    pendingStreakBreak: userUsage.pendingStreakBreak || null,
    [`categories.${cat}`]: userUsage.categories[cat],
  }
  if (promptText) {
    setFields.promptHistory = userUsage.promptHistory
    if (userUsage.categoryPrompts?.[cat]) {
      setFields[`categoryPrompts.${cat}`] = userUsage.categoryPrompts[cat]
    }
  }
  if (responseCount >= 3) {
    setFields.councilPrompts = userUsage.councilPrompts
  }
  if (promptData?.promptMode === 'debate') {
    setFields.debatePrompts = userUsage.debatePrompts
  }
  await db.usage.update(userId, setFields)

  // Atomic MongoDB $inc for prompt counts (prevents race conditions on Vercel serverless)
  try {
    await db.usage.atomicInc(userId, {
      totalPrompts: 1,
      [`monthlyUsage.${currentMonth}.prompts`]: 1,
      [`dailyUsage.${currentMonth}.${today}.prompts`]: 1,
    })
    await db.usage.update(userId, { [`dailyUsage.${currentMonth}.${today}.categories.${cat}`]: true })
    console.log(`[Prompt Tracking] Atomic $inc for ${userId}: totalPrompts +1, monthlyUsage.${currentMonth}.prompts +1, dailyPrompts +1`)
  } catch (incErr: any) {
    console.error(`[Prompt Tracking] Atomic $inc failed for ${userId}:`, incErr.message)
  }

  // Update user lastActiveAt directly in DB
  try {
    const activeDate = new Date().toISOString()
    await db.users.update(userId, { lastActiveAt: activeDate })
    console.log(`[User Update] Updated ${userId}: lastActiveAt=${activeDate}`)
  } catch (error: any) {
    console.error(`[User Update] Error updating user ${userId}:`, error)
  }

  // Grant XP for the prompt
  try {
    const modelsUsed = (promptData?.responses || [])
      .filter((r: any) => r && !r.error)
      .map((r: any) => r.actualModelName || r.modelName || '')
      .filter(Boolean)
    await grantPromptXP(userId, {
      isGeneral: responseCount >= 3,
      isDebate: promptData?.promptMode === 'debate',
      today,
      category: cat,
      modelsUsed,
      streakDays: userUsage.streakDays || 0,
    })
  } catch (xpErr: any) {
    console.error(`[XP] Error granting prompt XP for ${userId}:`, xpErr.message)
  }
}

// Track a continued conversation prompt (1 per follow-up message in judge or model conversation)
// Counts 1 prompt per follow-up message. Token counting is handled by trackUsage() separately.
// NOTE: When user sends a council follow-up (same message to all models), the frontend passes
// isCouncilFollowUp: true and calls /api/conversation/track-follow-up once. Model endpoints
// skip this when isCouncilFollowUp is true to avoid counting 1 prompt per model.
const trackConversationPrompt = async (userId: string, userMessage: any) => {
  if (!userId) return

  const userUsage = await db.usage.get(userId)
  if (!userUsage) return

  const tz = await getUserTimezone(userId)
  const currentMonth = getMonthForUser(tz)

  const totalPrompts = (userUsage.totalPrompts || 0) + 1
  const monthlyPrompts = (userUsage.monthlyUsage?.[currentMonth]?.prompts || 0) + 1
  console.log(`[Conversation Prompt] User ${userId}: Prompts -> ${totalPrompts}, Monthly -> ${monthlyPrompts}`)

  // Atomic MongoDB $inc for prompt counts (prevents race conditions on Vercel serverless)
  try {
    await db.usage.atomicInc(userId, {
      totalPrompts: 1,
      [`monthlyUsage.${currentMonth}.prompts`]: 1,
    })
    console.log(`[Conversation Prompt] Atomic $inc for ${userId}: totalPrompts +1, monthlyUsage.${currentMonth}.prompts +1`)
  } catch (incErr: any) {
    console.error(`[Conversation Prompt] Atomic $inc failed for ${userId}:`, incErr.message)
  }

  // Grant XP for follow-up
  try {
    await grantFollowUpXP(userId)
  } catch (xpErr: any) {
    console.error(`[XP] Error granting follow-up XP for ${userId}:`, xpErr.message)
  }
}

// Track usage for a user
// isPipeline = true for internal/behind-the-scenes calls (category detection, refiner, context summarization)
// isPipeline = false for user-visible model calls (council members, summary, individual models, judge conversation)
// Pipeline usage: only counted in dailyUsage/cost. NOT in visible token counters or per-model stats.
// Non-pipeline usage: FULL input+output tokens counted in visible counters + per-model stats. All tokens counted in cost.
// This means visible counters include: user prompt + web sources + system formatting + model output.
// Pipeline calls (category detection etc.) are excluded from visible counters.
// NOTE: Prompt counting is NOT done here — it's handled by trackPrompt (initial) and trackConversationPrompt (follow-ups).
const trackUsage = async (userId: string, provider: string, model: string, inputTokens: number, outputTokens: number, isPipeline = false) => {
  const userUsage = await db.usage.getOrDefault(userId)
  const tz = await getUserTimezone(userId)
  const currentMonth = getMonthForUser(tz)
  const today = getTodayForUser(tz)
  const modelKey = `${provider}-${model}`
  
  // Update user-visible stats (per-model, provider) only for user-visible calls.
  // Pipeline calls (refiner, category detection) still count towards cost via dailyUsage below.
  if (!isPipeline) {
    const callTokens = inputTokens + outputTokens

    // totalTokens is the single source of truth and always equals totalInputTokens + totalOutputTokens
    userUsage.totalTokens = (userUsage.totalTokens || 0) + callTokens
    userUsage.totalInputTokens = (userUsage.totalInputTokens || 0) + inputTokens
    userUsage.totalOutputTokens = (userUsage.totalOutputTokens || 0) + outputTokens

    if (!userUsage.monthlyUsage[currentMonth]) {
      userUsage.monthlyUsage[currentMonth] = { tokens: 0, inputTokens: 0, outputTokens: 0, queries: 0, prompts: 0 }
    }
    userUsage.monthlyUsage[currentMonth].tokens = (userUsage.monthlyUsage[currentMonth].tokens || 0) + callTokens
    userUsage.monthlyUsage[currentMonth].inputTokens = (userUsage.monthlyUsage[currentMonth].inputTokens || 0) + inputTokens
    userUsage.monthlyUsage[currentMonth].outputTokens = (userUsage.monthlyUsage[currentMonth].outputTokens || 0) + outputTokens

    // NOTE: Prompt counting is NOT done here. Prompts are counted:
    // - 1 per initial user submission (in trackPrompt)
    // - 1 per continued conversation message (in conversation endpoints)

    // Update provider stats — full input + output tokens for the visible token counter
    if (!userUsage.providers[provider]) {
      userUsage.providers[provider] = {
        totalTokens: 0,
        totalInputTokens: 0,
        totalOutputTokens: 0,
        totalQueries: 0,
        monthlyTokens: {},
        monthlyInputTokens: {},
        monthlyOutputTokens: {},
        monthlyQueries: {},
      }
    }
    userUsage.providers[provider].totalTokens += (inputTokens + outputTokens)
    userUsage.providers[provider].totalInputTokens = (userUsage.providers[provider].totalInputTokens || 0) + inputTokens
    userUsage.providers[provider].totalOutputTokens = (userUsage.providers[provider].totalOutputTokens || 0) + outputTokens

    if (!userUsage.providers[provider].monthlyTokens[currentMonth]) {
      userUsage.providers[provider].monthlyTokens[currentMonth] = 0
      userUsage.providers[provider].monthlyInputTokens = userUsage.providers[provider].monthlyInputTokens || {}
      userUsage.providers[provider].monthlyOutputTokens = userUsage.providers[provider].monthlyOutputTokens || {}
      userUsage.providers[provider].monthlyInputTokens[currentMonth] = 0
      userUsage.providers[provider].monthlyOutputTokens[currentMonth] = 0
      userUsage.providers[provider].monthlyQueries[currentMonth] = 0
    }
    userUsage.providers[provider].monthlyTokens[currentMonth] += (inputTokens + outputTokens)
    userUsage.providers[provider].monthlyInputTokens[currentMonth] = (userUsage.providers[provider].monthlyInputTokens[currentMonth] || 0) + inputTokens
    userUsage.providers[provider].monthlyOutputTokens[currentMonth] = (userUsage.providers[provider].monthlyOutputTokens[currentMonth] || 0) + outputTokens
  } else {
    // Still ensure monthlyUsage exists for pipeline calls (needed for prompts counter)
    if (!userUsage.monthlyUsage[currentMonth]) {
      userUsage.monthlyUsage[currentMonth] = { tokens: 0, inputTokens: 0, outputTokens: 0, queries: 0, prompts: 0 }
    }
  }

  // Update model stats
  // Update per-model stats only for user-visible calls (not pipeline internals)
  if (!isPipeline) {
    if (!userUsage.models[modelKey]) {
      userUsage.models[modelKey] = {
        totalTokens: 0,
        totalInputTokens: 0,
        totalOutputTokens: 0,
        totalQueries: 0,
        totalPrompts: 0,
        provider,
        model,
        pricing: null,
      }
    }
    userUsage.models[modelKey].totalTokens += (inputTokens + outputTokens)
    userUsage.models[modelKey].totalInputTokens = (userUsage.models[modelKey].totalInputTokens || 0) + inputTokens
    userUsage.models[modelKey].totalOutputTokens = (userUsage.models[modelKey].totalOutputTokens || 0) + outputTokens
    userUsage.models[modelKey].totalPrompts = (userUsage.models[modelKey].totalPrompts || 0) + 1
  }

  // Update daily usage (for cost calculation and daily breakdown chart)
  if (!userUsage.dailyUsage[currentMonth]) {
    userUsage.dailyUsage[currentMonth] = {}
  }
  if (!userUsage.dailyUsage[currentMonth][today]) {
    userUsage.dailyUsage[currentMonth][today] = { inputTokens: 0, outputTokens: 0, queries: 0, models: {} }
  }
  // Only count user-visible tokens in the daily aggregate (shown in the chart)
  if (!isPipeline) {
    userUsage.dailyUsage[currentMonth][today].inputTokens = (userUsage.dailyUsage[currentMonth][today].inputTokens || 0) + inputTokens
    userUsage.dailyUsage[currentMonth][today].outputTokens = (userUsage.dailyUsage[currentMonth][today].outputTokens || 0) + outputTokens
  }
  
  // Always track per-model tokens on this day (drives cost calculation for ALL calls including pipeline)
  if (!userUsage.dailyUsage[currentMonth][today].models[modelKey]) {
    userUsage.dailyUsage[currentMonth][today].models[modelKey] = { inputTokens: 0, outputTokens: 0 }
  }
  userUsage.dailyUsage[currentMonth][today].models[modelKey].inputTokens = (userUsage.dailyUsage[currentMonth][today].models[modelKey].inputTokens || 0) + inputTokens
  userUsage.dailyUsage[currentMonth][today].models[modelKey].outputTokens = (userUsage.dailyUsage[currentMonth][today].models[modelKey].outputTokens || 0) + outputTokens

  // Write changed fields to DB (excluding totalTokens and monthlyUsage.*.tokens, handled by $inc)
  const setFields: Record<string, any> = {}
  if (!isPipeline) {
    setFields.totalInputTokens = userUsage.totalInputTokens
    setFields.totalOutputTokens = userUsage.totalOutputTokens
    setFields[`monthlyUsage.${currentMonth}.inputTokens`] = userUsage.monthlyUsage[currentMonth].inputTokens
    setFields[`monthlyUsage.${currentMonth}.outputTokens`] = userUsage.monthlyUsage[currentMonth].outputTokens
    setFields[`providers.${provider}`] = userUsage.providers[provider]
    setFields[`models.${modelKey}`] = userUsage.models[modelKey]
  }
  setFields[`dailyUsage.${currentMonth}.${today}`] = userUsage.dailyUsage[currentMonth][today]
  await db.usage.update(userId, setFields)

  // Update monthly cost atomically in user_stats
  try {
    const pricing = getPricingData()
    const thisCost = calculateModelCost(modelKey, inputTokens, outputTokens, pricing as any)
    if (thisCost > 0) {
      await db.userStats.addMonthlyCost(userId, currentMonth, thisCost)
      console.log(`[Usage] Added $${thisCost.toFixed(6)} to monthlyUsageCost for ${currentMonth}`)
    }
  } catch (costErr: any) {
    console.error('[Usage] Error updating monthlyUsageCost:', costErr)
  }

  // Atomic $inc for totalTokens and monthlyUsage.*.tokens (single source of truth)
  if (!isPipeline) {
    const callTokens = inputTokens + outputTokens
    if (callTokens > 0) {
      try {
        await db.usage.atomicInc(userId, {
          totalTokens: callTokens,
          [`monthlyUsage.${currentMonth}.tokens`]: callTokens,
        })
      } catch (incErr: any) {
        console.error(`[Usage] Atomic $inc for totalTokens failed for ${userId}:`, incErr.message)
      }
    }
  }
}

export {
  getUserTimezone,
  getCurrentDateStringForUser,
  trackPrompt,
  trackConversationPrompt,
  trackUsage,
}
