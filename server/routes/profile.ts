import { Router, type Request, type Response } from 'express'
import db from '../../database/db.js'
import { sendSuccess, sendError } from '../types/api.js'
import { createLogger } from '../config/logger.js'
import { getMonthForUser, getUserLocalDate } from '../helpers/date.js'
import { getUserTimezone } from '../services/usage.js'
import { calculateModelCost, calculateSerperQueryCost, getPricingData } from '../helpers/pricing.js'
import { getLevelFromXP, getLevelTitle } from '../config/xp.js'

const log = createLogger('profile')

const profileRouter = Router()

profileRouter.get('/:userId', async (req: Request, res: Response) => {
  try {
    const targetUserId = req.params.userId as string
    const viewerId = (req.query.viewerId as string) || ''
    const isSelf = viewerId === targetUserId

    const user: any = await db.users.get(targetUserId)
    if (!user) return sendError(res, 'User not found', 404)

    const usage: any = await db.usage.getOrDefault(targetUserId)

    const baseData: any = {
      userId: user._id,
      username: user.username,
      bio: user.bio || '',
      profileImage: user.profileImage || null,
      isPrivate: user.isPrivate || false,
      showOnLeaderboard: user.showOnLeaderboard !== false,
      createdAt: user.createdAt,
      earnedBadges: usage.earnedBadges || [],
    }

    if (!isSelf) {
      const tz = await getUserTimezone(targetUserId)
      const currentMonth = getMonthForUser(tz)
      const monthlyStats = (usage.monthlyUsage || {})[currentMonth] || { tokens: 0, inputTokens: 0, outputTokens: 0, queries: 0, prompts: 0 }

      const providerStats: any = {}
      Object.keys(usage.providers || {}).forEach((provider: string) => {
        const providerData = usage.providers[provider]
        let totalPrompts = 0
        Object.keys(usage.models || {}).forEach((modelKey: string) => {
          if (modelKey.startsWith(`${provider}-`)) {
            totalPrompts += (usage.models[modelKey].totalPrompts || 0)
          }
        })
        providerStats[provider] = {
          totalTokens: (providerData.totalInputTokens || 0) + (providerData.totalOutputTokens || 0),
          totalInputTokens: providerData.totalInputTokens || 0,
          totalOutputTokens: providerData.totalOutputTokens || 0,
          totalPrompts,
        }
      })

      const modelStats: any = {}
      Object.keys(usage.models || {}).forEach((modelKey: string) => {
        const stored = usage.models[modelKey]
        const derivedProvider = stored.provider || modelKey.split('-')[0]
        const derivedModel = stored.model || modelKey.substring(derivedProvider.length + 1)
        modelStats[modelKey] = {
          provider: derivedProvider,
          model: derivedModel,
          totalInputTokens: stored.totalInputTokens || 0,
          totalOutputTokens: stored.totalOutputTokens || 0,
          totalTokens: (stored.totalInputTokens || 0) + (stored.totalOutputTokens || 0),
          totalPrompts: stored.totalPrompts || 0,
        }
      })

      const dailyData = usage.dailyUsage?.[currentMonth] || {}
      const pricing: any = getPricingData()
      const { year: tzYear, month: tzMonth } = getUserLocalDate(tz)
      const daysInMonth = new Date(tzYear, tzMonth, 0).getDate()

      let maxDayCost = 0
      const rawDays: { date: string; day: number; cost: number }[] = []
      for (let day = 1; day <= daysInMonth; day++) {
        const dateStr = `${tzYear}-${String(tzMonth).padStart(2, '0')}-${String(day).padStart(2, '0')}`
        const dayData = dailyData[dateStr]
        let dayCost = 0
        if (dayData) {
          if (dayData.models) {
            Object.keys(dayData.models).forEach((mk: string) => {
              const md = dayData.models[mk]
              dayCost += calculateModelCost(mk, md.inputTokens || 0, md.outputTokens || 0, pricing)
            })
          }
          if (dayData.queries > 0) dayCost += calculateSerperQueryCost(dayData.queries)
        }
        if (dayCost > maxDayCost) maxDayCost = dayCost
        rawDays.push({ date: dateStr, day, cost: dayCost })
      }

      const dailyUsage = rawDays.map(d => ({
        date: d.date,
        day: d.day,
        percentage: maxDayCost > 0 ? Math.round(((d.cost / maxDayCost) * 100) * 100) / 100 : 0,
      }))

      const xpData = usage.xp || { totalXP: 0 }
      const totalXP = xpData.totalXP || 0
      const levelInfo = getLevelFromXP(totalXP)
      const levelTitle = getLevelTitle(levelInfo.level)

      const ratingsAgg = await db.modelWins.aggregateForUser(targetUserId)

      baseData.publicStats = {
        totalTokens: usage.totalTokens || 0,
        totalPrompts: usage.totalPrompts || 0,
        monthlyTokens: monthlyStats.tokens || 0,
        monthlyPrompts: monthlyStats.prompts || 0,
        dailyUsage,
        providers: providerStats,
        models: modelStats,
        ratingsStats: {
          totalWins: ratingsAgg.totalWins,
          providerLeaderboard: ratingsAgg.providerLeaderboard,
          modelLeaderboard: ratingsAgg.modelLeaderboard,
        },
        streakDays: usage.streakDays || 0,
        councilPrompts: usage.councilPrompts || 0,
        debatePrompts: usage.debatePrompts || 0,
        xp: {
          totalXP,
          level: levelInfo.level,
          currentLevelXP: levelInfo.currentLevelXP,
          nextLevelXP: levelInfo.nextLevelXP,
          levelTitle,
        },
      }
    }

    sendSuccess(res, baseData)
  } catch (error: any) {
    log.error({ err: error }, 'Get profile error')
    sendError(res, 'Failed to get profile')
  }
})

profileRouter.put('/:userId', async (req: Request, res: Response) => {
  try {
    const userId = req.userId!
    const targetUserId = req.params.userId

    if (userId !== targetUserId) {
      return sendError(res, 'Unauthorized', 403)
    }

    const { bio, isPrivate, showOnLeaderboard, profileImage } = req.body

    const updates: Record<string, any> = {}
    if (bio !== undefined) updates.bio = (bio || '').substring(0, 300)
    if (isPrivate !== undefined) updates.isPrivate = !!isPrivate
    if (showOnLeaderboard !== undefined) updates.showOnLeaderboard = !!showOnLeaderboard
    if (profileImage !== undefined) updates.profileImage = profileImage

    await db.users.update(userId, updates)

    sendSuccess(res, { message: 'Profile updated' })
  } catch (error: any) {
    log.error({ err: error }, 'Update profile error')
    sendError(res, 'Failed to update profile')
  }
})

export default profileRouter
