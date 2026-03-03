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
      .filter((u: any) => u.showOnLeaderboard === true && !u.isAnonymous)
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
      .filter((u: any) => u.showOnLeaderboard === true && !u.isAnonymous)
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

export default router
