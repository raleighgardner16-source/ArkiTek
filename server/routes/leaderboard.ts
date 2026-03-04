import { Router, type Request, type Response } from 'express'
import db from '../../database/db.js'
import { sendSuccess, sendError } from '../types/api.js'

const router = Router()

// GET /leaderboard/rankings?type=tokens|prompts|streak
// Returns all users who opted in, ranked by the requested stat.
router.get('/rankings', async (req: Request, res: Response) => {
  try {
    const { type } = req.query
    const validTypes = ['tokens', 'prompts', 'streak']
    if (!type || !validTypes.includes(type as string)) {
      return sendError(res, 'type must be one of: tokens, prompts, streak', 400)
    }

    const dbInstance = await db.getDb()

    const allUsers: any[] = await db.users.getAll()
    const usersMap: Record<string, any> = {}
    for (const u of allUsers) usersMap[u._id] = u

    const eligibleUserIds = allUsers
      .filter((u: any) => u.showOnLeaderboard !== false)
      .map((u: any) => u._id)

    if (eligibleUserIds.length === 0) {
      return sendSuccess(res, { rankings: [], myRank: null })
    }

    const usageRecords = await dbInstance
      .collection<any>('usage_data')
      .find({ _id: { $in: eligibleUserIds } })
      .toArray()

    const usageMap: Record<string, any> = {}
    for (const ud of usageRecords) usageMap[ud._id] = ud

    let entries: Array<{
      userId: string
      username: string
      profileImage: string | null
      value: number
    }> = []

    for (const uid of eligibleUserIds) {
      const user = usersMap[uid]
      const usage = usageMap[uid]
      if (!user) continue

      let value = 0
      if (type === 'tokens') {
        value = usage?.totalTokens || 0
      } else if (type === 'prompts') {
        value = usage?.totalPrompts || 0
      } else if (type === 'streak') {
        value = usage?.streakDays || 0
      }

      entries.push({
        userId: uid,
        username: user.username || 'Unknown',
        profileImage: user.profileImage || null,
        value,
      })
    }

    entries.sort((a, b) => b.value - a.value)

    const requesterId = req.userId
    let myRank: number | null = null
    if (requesterId) {
      const idx = entries.findIndex((e) => e.userId === requesterId)
      if (idx !== -1) myRank = idx + 1
    }

    const rankings = entries.map((e, i) => ({
      rank: i + 1,
      userId: e.userId,
      username: e.username,
      profileImage: e.profileImage,
      value: e.value,
    }))

    sendSuccess(res, { rankings, myRank })
  } catch (error: any) {
    console.error('[Leaderboard] Error fetching rankings:', error)
    sendError(res, 'Failed to fetch rankings')
  }
})

// GET /leaderboard/my-ranks
// Returns the current user's rank in all three leaderboards.
router.get('/my-ranks', async (req: Request, res: Response) => {
  try {
    const userId = req.userId
    if (!userId) return sendError(res, 'Unauthorized', 401)

    const dbInstance = await db.getDb()

    const allUsers: any[] = await db.users.getAll()
    const eligibleUserIds = allUsers
      .filter((u: any) => u.showOnLeaderboard !== false)
      .map((u: any) => u._id)

    const isEligible = eligibleUserIds.includes(userId)
    if (!isEligible) {
      return sendSuccess(res, {
        tokens: null,
        prompts: null,
        streak: null,
        totalParticipants: eligibleUserIds.length,
      })
    }

    const usageRecords = await dbInstance
      .collection<any>('usage_data')
      .find({ _id: { $in: eligibleUserIds } })
      .toArray()

    const usageMap: Record<string, any> = {}
    for (const ud of usageRecords) usageMap[ud._id] = ud

    const buildRanking = (key: string) => {
      const vals = eligibleUserIds
        .map((uid: string) => ({
          userId: uid,
          value: usageMap[uid]?.[key] || 0,
        }))
        .sort((a: any, b: any) => b.value - a.value)

      const idx = vals.findIndex((v: any) => v.userId === userId)
      return idx !== -1 ? idx + 1 : null
    }

    sendSuccess(res, {
      tokens: buildRanking('totalTokens'),
      prompts: buildRanking('totalPrompts'),
      streak: buildRanking('streakDays'),
      totalParticipants: eligibleUserIds.length,
    })
  } catch (error: any) {
    console.error('[Leaderboard] Error fetching user ranks:', error)
    sendError(res, 'Failed to fetch user ranks')
  }
})

// ============================================================================
// WEEKLY LEADERBOARD HELPERS
// ============================================================================

const PROVIDER_NAMES: Record<string, string> = {
  openai: 'ChatGPT',
  anthropic: 'Claude',
  google: 'Gemini',
  meta: 'Meta (Llama)',
  deepseek: 'DeepSeek',
  mistral: 'Mistral AI',
  xai: 'Grok',
}

function getWeekBoundary(date: Date = new Date()) {
  const dayOfWeek = date.getUTCDay()
  const mondayOffset = dayOfWeek === 0 ? 6 : dayOfWeek - 1
  const weekStart = new Date(Date.UTC(
    date.getUTCFullYear(),
    date.getUTCMonth(),
    date.getUTCDate() - mondayOffset,
    0, 0, 0, 0,
  ))
  const weekEnd = new Date(weekStart.getTime() + 7 * 24 * 60 * 60 * 1000)
  const weekId = weekStart.toISOString().slice(0, 10)
  return { weekStart, weekEnd, weekId }
}

async function computeWeeklyRankings(weekStartMs: number, weekEndMs: number) {
  const dbInstance = await db.getDb()
  const allUsage = await dbInstance
    .collection<any>('usage_data')
    .find({})
    .project({ modelWins: 1 })
    .toArray()

  const providerWins: Record<string, number> = {}
  const modelWinsMap: Record<string, { provider: string; wins: number }> = {}
  let totalVotes = 0

  for (const usage of allUsage) {
    const wins = usage.modelWins || {}
    for (const [sessionId, win] of Object.entries(wins)) {
      const ts = parseInt(sessionId, 10)
      if (isNaN(ts) || ts < weekStartMs || ts >= weekEndMs) continue

      const provider = (win as any).provider
      const model = (win as any).model
      if (!provider) continue

      providerWins[provider] = (providerWins[provider] || 0) + 1
      totalVotes++

      if (model) {
        if (!modelWinsMap[model]) modelWinsMap[model] = { provider, wins: 0 }
        modelWinsMap[model].wins++
      }
    }
  }

  const providerRankings = Object.entries(providerWins)
    .map(([key, wins]) => ({
      provider: key,
      name: PROVIDER_NAMES[key] || key,
      wins,
      rank: 0,
    }))
    .sort((a, b) => b.wins - a.wins)
  providerRankings.forEach((entry, i) => { entry.rank = i + 1 })

  const modelRankings = Object.entries(modelWinsMap)
    .map(([model, data]) => ({
      model,
      provider: data.provider,
      providerName: PROVIDER_NAMES[data.provider] || data.provider,
      wins: data.wins,
      rank: 0,
    }))
    .sort((a, b) => b.wins - a.wins)
  modelRankings.forEach((entry, i) => { entry.rank = i + 1 })

  return { providerRankings, modelRankings, totalVotes }
}

async function ensurePreviousWeeksFinalized(currentWeekId: string) {
  const finalized = await db.weeklyLeaderboard.getAllFinalized()
  const finalizedIds = new Set(finalized.map((w) => w._id))

  const current = getWeekBoundary()
  const oneWeekAgo = new Date(current.weekStart.getTime() - 7 * 24 * 60 * 60 * 1000)
  const prevWeek = getWeekBoundary(oneWeekAgo)

  if (prevWeek.weekId === currentWeekId || finalizedIds.has(prevWeek.weekId)) return

  const existing = await db.weeklyLeaderboard.get(prevWeek.weekId)
  if (existing?.finalized) return

  const { providerRankings, modelRankings, totalVotes } = await computeWeeklyRankings(
    prevWeek.weekStart.getTime(),
    prevWeek.weekEnd.getTime(),
  )

  await db.weeklyLeaderboard.upsert({
    _id: prevWeek.weekId,
    weekStart: prevWeek.weekStart,
    weekEnd: prevWeek.weekEnd,
    totalVotes,
    providerRankings,
    modelRankings,
    finalized: true,
  })

  console.log(`[Leaderboard] Finalized week ${prevWeek.weekId} with ${totalVotes} votes`)
}

// GET /leaderboard/provider-rankings
// Returns current week rankings (live-computed) + cumulative win counts from past weeks.
router.get('/provider-rankings', async (req: Request, res: Response) => {
  try {
    const { weekStart, weekEnd, weekId } = getWeekBoundary()

    await ensurePreviousWeeksFinalized(weekId)

    const { providerRankings, modelRankings, totalVotes } = await computeWeeklyRankings(
      weekStart.getTime(),
      weekEnd.getTime(),
    )

    await db.weeklyLeaderboard.upsert({
      _id: weekId,
      weekStart,
      weekEnd,
      totalVotes,
      providerRankings,
      modelRankings,
      finalized: false,
    })

    const cumulativeWins = await db.weeklyLeaderboard.getCumulativeWins()

    sendSuccess(res, {
      providerRankings,
      modelRankings,
      totalVotes,
      weekStart: weekStart.toISOString(),
      cumulativeWins,
    })
  } catch (error: any) {
    console.error('[Leaderboard] Error fetching provider rankings:', error)
    sendError(res, 'Failed to fetch provider rankings')
  }
})

export default router
