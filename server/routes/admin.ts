import { Router, type Request, type Response } from 'express'
import db from '../../database/db.js'
import adminDb from '../../database/adminDb.js'
import { requireAdmin, isAdmin, adminsCache } from '../middleware/requireAdmin.js'
import { getPricingData, calculateModelCost, calculateSerperQueryCost } from '../helpers/pricing.js'
import { sendSuccess, sendError } from '../types/api.js'

const router = Router()
const pricingRouter = Router()

// ============================================================================
// LOCAL HELPERS
// ============================================================================

const readAdmins = async () => {
  try {
    const adminsList = await adminDb.admins.getList()
    return { admins: adminsList }
  } catch (error: any) {
    console.error('[Admin] Failed to read admins:', error.message)
    return { admins: [] }
  }
}

const readDeletedUsers = async () => {
  try {
    const stats = await adminDb.metadata.getAdminStats()
    return { count: stats?.deletedUsersCount || 0 }
  } catch (error: any) {
    console.error('[DeletedUsers] Failed to read:', error.message)
    return { count: 0 }
  }
}

function computeDateRange(period: string, dateStr: string | undefined) {
  const now = new Date()
  const ref = dateStr ? new Date(dateStr + (dateStr.length <= 10 ? 'T00:00:00' : '')) : now
  let startDate: Date, endDate: Date

  switch (period) {
    case 'day': {
      startDate = new Date(ref.getFullYear(), ref.getMonth(), ref.getDate())
      endDate = new Date(ref.getFullYear(), ref.getMonth(), ref.getDate() + 1)
      break
    }
    case 'week': {
      const dow = ref.getDay()
      const diffToMon = dow === 0 ? 6 : dow - 1
      const monday = new Date(ref)
      monday.setDate(ref.getDate() - diffToMon)
      startDate = new Date(monday.getFullYear(), monday.getMonth(), monday.getDate())
      endDate = new Date(startDate)
      endDate.setDate(startDate.getDate() + 7)
      break
    }
    case 'month': {
      startDate = new Date(ref.getFullYear(), ref.getMonth(), 1)
      endDate = new Date(ref.getFullYear(), ref.getMonth() + 1, 1)
      break
    }
    case 'quarter': {
      const q = Math.floor(ref.getMonth() / 3)
      startDate = new Date(ref.getFullYear(), q * 3, 1)
      endDate = new Date(ref.getFullYear(), q * 3 + 3, 1)
      break
    }
    case 'year': {
      startDate = new Date(ref.getFullYear(), 0, 1)
      endDate = new Date(ref.getFullYear() + 1, 0, 1)
      break
    }
    case 'all': {
      startDate = new Date(2020, 0, 1)
      endDate = new Date(2099, 0, 1)
      break
    }
    default: {
      startDate = new Date(ref.getFullYear(), ref.getMonth(), 1)
      endDate = new Date(ref.getFullYear(), ref.getMonth() + 1, 1)
    }
  }
  return { startDate, endDate }
}

// ============================================================================
// PUBLIC PRICING ROUTE (mounted separately at /api/pricing)
// ============================================================================

pricingRouter.get('/', (req: Request, res: Response) => {
  try {
    const pricing = getPricingData()
    sendSuccess(res, pricing)
  } catch (error: any) {
    console.error('[Pricing] Error fetching pricing:', error)
    sendError(res, 'Failed to fetch pricing')
  }
})

// ============================================================================
// ADMIN ROUTES (mounted at /api/admin)
// ============================================================================

// GET /api/admin/users
router.get('/users', requireAdmin, async (req: Request, res: Response) => {
  try {
    const [allUsers, admins, allUsage, deletedUsers] = await Promise.all([
      db.users.getAll(),
      readAdmins(),
      db.usage.getAll(),
      readDeletedUsers(),
    ])
    
    const usageMap: Record<string, any> = {}
    for (const u of allUsage) {
      usageMap[(u as any)._id] = u
    }
    
    const userList = (allUsers as any[]).map(user => {
      const userUsage = usageMap[user._id]
      const lastActiveAt = user.lastActiveAt || userUsage?.lastActiveAt
      
      let isActive = false
      if (lastActiveAt) {
        const now = new Date()
        const oneMonthAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000)
        const lastActive = new Date(lastActiveAt)
        if (lastActive >= oneMonthAgo) {
          isActive = true
        }
      }
      
      let status = 'inactive'
      if (user.canceled === true || user.status === 'canceled') {
        status = 'canceled'
      } else if (isActive) {
        status = 'active'
      }
      
      return {
        id: user._id,
        username: user.username,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        createdAt: user.createdAt,
        isAdmin: admins.admins.includes(user._id),
        status,
        lastActiveAt: lastActiveAt || null,
      }
    })
    
    sendSuccess(res, {
      totalUsers: userList.length,
      users: userList,
      deletedUsers: deletedUsers.count || 0,
    })
  } catch (error: any) {
    console.error('[Admin] Error fetching users:', error)
    sendError(res, 'Failed to fetch users')
  }
})

// GET /api/admin/costs
router.get('/costs', requireAdmin, async (req: Request, res: Response) => {
  try {
    const [allUsage, pricing, allUsers] = await Promise.all([
      db.usage.getAll(),
      getPricingData(),
      db.users.getAll(),
    ])
    
    const usersMap: Record<string, any> = {}
    for (const u of allUsers as any[]) usersMap[u._id] = u
    
    let totalCost = 0
    const userCosts: any[] = []
    
    ;(allUsage as any[]).forEach(usageDoc => {
      const userId = usageDoc._id
      const userUsage = usageDoc
      const user = usersMap[userId]
      let userTotalCost = 0
      const modelCosts: Record<string, any> = {}
      
      Object.keys(userUsage.models || {}).forEach((modelKey: string) => {
        const modelData = userUsage.models[modelKey]
        const inputTokens = modelData.totalInputTokens || 0
        const outputTokens = modelData.totalOutputTokens || 0
        const cost = calculateModelCost(modelKey, inputTokens, outputTokens, pricing as any)
        
        modelCosts[modelKey] = {
          model: modelData.model,
          provider: modelData.provider,
          inputTokens,
          outputTokens,
          totalTokens: inputTokens + outputTokens,
          cost,
        }
        
        userTotalCost += cost
      })
      
      const totalQueries = userUsage.totalQueries || 0
      if (totalQueries > 0) {
        const queryCost = calculateSerperQueryCost(totalQueries)
        userTotalCost += queryCost
      }
      
      totalCost += userTotalCost
      
      userCosts.push({
        userId,
        username: user?.username || userId,
        email: user?.email || '',
        firstName: user?.firstName || '',
        lastName: user?.lastName || '',
        plan: user?.plan || null,
        totalInputTokens: userUsage.totalInputTokens || 0,
        totalOutputTokens: userUsage.totalOutputTokens || 0,
        totalTokens: userUsage.totalTokens || 0,
        totalQueries: userUsage.totalQueries || 0,
        totalPrompts: userUsage.totalPrompts || 0,
        cost: userTotalCost,
        modelCosts,
      })
    })
    
    sendSuccess(res, {
      totalCost,
      userCosts: userCosts.sort((a, b) => b.cost - a.cost),
    })
  } catch (error: any) {
    console.error('[Admin] Error calculating costs:', error)
    sendError(res, 'Failed to calculate costs')
  }
})

// GET /api/admin/pricing
router.get('/pricing', requireAdmin, (req: Request, res: Response) => {
  try {
    const pricing = getPricingData()
    sendSuccess(res, pricing)
  } catch (error: any) {
    console.error('[Admin] Error fetching pricing:', error)
    sendError(res, 'Failed to fetch pricing')
  }
})

// GET /api/admin/check
router.get('/check', async (req: Request, res: Response) => {
  try {
    const userId = req.userId
    
    const user = await db.users.get(userId as string)
    
    if (!user) {
      return sendError(res, 'User not found', 404)
    }
    
    const userIsAdmin = await isAdmin(userId as string)
    sendSuccess(res, {
      isAdmin: userIsAdmin,
    })
  } catch (error: any) {
    console.error('[Admin] Error checking admin status:', error)
    sendError(res, 'Failed to check admin status')
  }
})

// POST /api/admin/add
router.post('/add', requireAdmin, async (req: Request, res: Response) => {
  try {
    const { userId } = req.body
    if (!userId) {
      return sendError(res, 'userId is required', 400)
    }
    
    const user = await db.users.get(userId)
    if (!user) {
      return sendError(res, 'User not found', 404)
    }
    
    await adminDb.admins.add(userId)
    
    if (!adminsCache.admins.includes(userId)) {
      adminsCache.admins.push(userId)
    }
    
    console.log(`[Admin] Added admin: ${userId}`)
    sendSuccess(res, { message: 'Admin added successfully' })
  } catch (error: any) {
    console.error('[Admin] Error adding admin:', error)
    sendError(res, 'Failed to add admin')
  }
})

// POST /api/admin/remove
router.post('/remove', requireAdmin, async (req: Request, res: Response) => {
  try {
    const { userId } = req.body
    if (!userId) {
      return sendError(res, 'userId is required', 400)
    }
    
    await adminDb.admins.remove(userId)
    
    adminsCache.admins = adminsCache.admins.filter(id => id !== userId)
    
    console.log(`[Admin] Removed admin: ${userId}`)
    sendSuccess(res, { message: 'Admin removed successfully' })
  } catch (error: any) {
    console.error('[Admin] Error removing admin:', error)
    sendError(res, 'Failed to remove admin')
  }
})

// GET /api/admin/expenses
router.get('/expenses', requireAdmin, async (req: Request, res: Response) => {
  try {
    const { month } = req.query
    const expenses = await adminDb.expenses.get(((month as string) || null) as any)
    sendSuccess(res, { expenses: expenses || {} })
  } catch (error: any) {
    console.error('[Admin] Error fetching expenses:', error)
    sendError(res, 'Failed to fetch expenses')
  }
})

// POST /api/admin/expenses
router.post('/expenses', requireAdmin, async (req: Request, res: Response) => {
  try {
    const { month, expenses: expenseData } = req.body
    if (!expenseData) {
      return sendError(res, 'expenses data is required', 400)
    }
    const saved = await adminDb.expenses.save(month || null, expenseData)
    sendSuccess(res, { expenses: saved })
  } catch (error: any) {
    console.error('[Admin] Error saving expenses:', error)
    sendError(res, 'Failed to save expenses')
  }
})

// GET /api/admin/revenue
router.get('/revenue', requireAdmin, async (req: Request, res: Response) => {
  try {
    const { period = 'month', date } = req.query
    const { startDate, endDate } = computeDateRange(period as string, date as string | undefined)

    const allUsers = await db.users.getAll() as any[]
    const usersMap: Record<string, any> = {}
    for (const u of allUsers) usersMap[u._id] = u
    const dbInstance = await db.getDb()

    let activeSubscriptions = 0
    let newSubscriptions = 0
    let renewedSubscriptions = 0
    let canceledSubscriptions = 0
    let activeFreeTrials = 0
    let newFreeTrials = 0
    const subscriptionUsers: any[] = []
    const freeTrialUsers: any[] = []
    const activeUsersList: any[] = []
    const freeTrialUsersList: any[] = []
    const inactiveUsersList: any[] = []

    const toUTCDayStart = (dateVal: Date) => {
      const d = new Date(dateVal)
      return new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()))
    }
    const periodStartUTC = toUTCDayStart(startDate)
    const periodEndUTC = toUTCDayStart(endDate)

    for (const user of allUsers) {
      const userId = user._id
      const status = user.subscriptionStatus
      if (!status || status === 'pending_verification') continue
      const isTrial = user.plan === 'free_trial' || status === 'trialing'
      const uInfo = { username: user.username || 'Anonymous', date: user.subscriptionStartedDate || user.createdAt || null, email: user.email || '' }

      if (status === 'active') {
        activeSubscriptions++
        activeUsersList.push(uInfo)
      } else if (status === 'trialing') {
        activeFreeTrials++
        freeTrialUsersList.push(uInfo)
      } else if (status === 'inactive' || status === 'canceled') {
        inactiveUsersList.push({ ...uInfo, status })
      }

      if (status === 'inactive') continue

      const startedRaw = user.subscriptionStartedDate || user.createdAt
      let isNewInPeriod = false
      if (startedRaw) {
        const startedUTC = toUTCDayStart(startedRaw)
        isNewInPeriod = startedUTC >= periodStartUTC && startedUTC < periodEndUTC
      }

      if (isNewInPeriod) {
        if (isTrial) {
          newFreeTrials++
          freeTrialUsers.push({
            username: user.username || 'Anonymous',
            date: startedRaw,
          })
        } else {
          newSubscriptions++
          subscriptionUsers.push({
            username: user.username || 'Anonymous',
            type: 'new_subscription',
            plan: user.plan || 'pro',
            date: startedRaw,
          })
        }
      }

      if (status === 'active' && startedRaw && !isNewInPeriod) {
        const started = new Date(startedRaw)
        const billingDay = started.getUTCDate()
        let renewalDate = new Date(Date.UTC(started.getUTCFullYear(), started.getUTCMonth() + 1, 1))
        renewalDate.setUTCDate(Math.min(billingDay, new Date(Date.UTC(renewalDate.getUTCFullYear(), renewalDate.getUTCMonth() + 1, 0)).getUTCDate()))
        while (renewalDate < periodEndUTC) {
          if (renewalDate >= periodStartUTC) {
            renewedSubscriptions++
            break
          }
          const nextMonth = renewalDate.getUTCMonth() + 1
          renewalDate = new Date(Date.UTC(renewalDate.getUTCFullYear(), nextMonth, 1))
          renewalDate.setUTCDate(Math.min(billingDay, new Date(Date.UTC(renewalDate.getUTCFullYear(), renewalDate.getUTCMonth() + 1, 0)).getUTCDate()))
        }
      }

      if (user.cancellationHistory?.length > 0) {
        user.cancellationHistory.forEach((c: any) => {
          const cancelUTC = toUTCDayStart(c.canceledAt || c.date)
          if (cancelUTC >= periodStartUTC && cancelUTC < periodEndUTC) {
            canceledSubscriptions++
          }
        })
      }
    }

    let creditPurchases: any[] = []
    let totalCreditRevenue = 0
    try {
      const purchases = await dbInstance.collection('purchases')
        .find({ timestamp: { $gte: startDate, $lt: endDate }, status: 'succeeded' })
        .sort({ timestamp: -1 })
        .toArray()
      creditPurchases = purchases.map((p: any) => ({
        userId: p.userId,
        username: usersMap[p.userId]?.username || 'Unknown',
        amount: p.amount || 0,
        total: p.total || 0,
        date: p.timestamp,
      }))
      totalCreditRevenue = creditPurchases.reduce((sum: number, p: any) => sum + (p.total || 0), 0)
    } catch (e) {
      // purchases collection may not exist yet
    }

    const subscriptionPrice = 19.95
    const freePlanMonthlyCost = 1.00
    const newSubscriptionRevenue = newSubscriptions * subscriptionPrice
    const renewalRevenue = renewedSubscriptions * subscriptionPrice
    const totalSubscriptionRevenue = newSubscriptionRevenue + renewalRevenue
    const totalFreeTrialCost = activeFreeTrials * freePlanMonthlyCost
    const totalRevenue = totalSubscriptionRevenue + totalCreditRevenue

    let storePurchases: any[] = []
    let totalStoreRevenue = 0
    try {
      const storeOrders = await dbInstance.collection('storePurchases')
        .find({ timestamp: { $gte: startDate, $lt: endDate }, status: 'succeeded' })
        .sort({ timestamp: -1 })
        .toArray()
      storePurchases = storeOrders.map((p: any) => ({
        userId: p.userId,
        username: usersMap[p.userId]?.username || 'Unknown',
        item: p.itemName || p.item || 'Unknown Item',
        total: p.total || p.amount || 0,
        date: p.timestamp,
      }))
      totalStoreRevenue = storePurchases.reduce((sum: number, p: any) => sum + (p.total || 0), 0)
    } catch (e) {
      // storePurchases collection may not exist yet
    }

    const grandTotalRevenue = totalSubscriptionRevenue + totalCreditRevenue + totalStoreRevenue

    const allUsageForBadges = await db.usage.getAll() as any[]
    const usageMapForBadges: Record<string, any> = {}
    for (const u of allUsageForBadges) usageMapForBadges[u._id] = u
    const BADGE_TIERS = [
      { name: 'Bronze', min: 1, max: 25, reward: 0.25 },
      { name: 'Silver', min: 26, max: 50, reward: 0.50 },
      { name: 'Gold', min: 51, max: 75, reward: 0.75 },
      { name: 'Platinum', min: 76, max: Infinity, reward: 1.00 },
    ]
    const getBadgeTier = (badgeCount: number) => {
      if (badgeCount <= 0) return null
      return BADGE_TIERS.find(t => badgeCount >= t.min && badgeCount <= t.max) || null
    }

    const badgeTierUsers: any[] = []
    const badgeTierSummary: Record<string, number> = { Bronze: 0, Silver: 0, Gold: 0, Platinum: 0 }
    let totalBadgeTierCost = 0

    for (const user of allUsers) {
      const userId = user._id
      const status = user.subscriptionStatus
      if (!status || status === 'inactive' || status === 'pending_verification') continue
      const userUsage = usageMapForBadges[userId]
      const badgeCount = (userUsage?.earnedBadges || []).length
      if (badgeCount <= 0) continue
      const tier = getBadgeTier(badgeCount)
      if (!tier) continue
      badgeTierSummary[tier.name]++
      totalBadgeTierCost += tier.reward
      badgeTierUsers.push({
        username: user.username || 'Anonymous',
        email: user.email || '',
        tier: tier.name,
        badgeCount,
        reward: tier.reward,
      })
    }
    badgeTierUsers.sort((a, b) => b.badgeCount - a.badgeCount)

    sendSuccess(res, {
      revenue: {
        period,
        startDate: startDate.toISOString(),
        endDate: endDate.toISOString(),
        activeSubscriptions,
        newSubscriptions,
        renewedSubscriptions,
        canceledSubscriptions,
        subscriptionPrice,
        newSubscriptionRevenue,
        renewalRevenue,
        totalSubscriptionRevenue,
        creditPurchases,
        creditPurchaseCount: creditPurchases.length,
        totalCreditRevenue,
        storePurchases,
        storePurchaseCount: storePurchases.length,
        totalStoreRevenue,
        totalRevenue: grandTotalRevenue,
        subscriptionUsers,
        activeFreeTrials,
        newFreeTrials,
        freeTrialCost: freePlanMonthlyCost,
        totalFreeTrialCost,
        freeTrialUsers,
        activeUsersList,
        freeTrialUsersList,
        inactiveUsersList,
        badgeTierUsers,
        badgeTierSummary,
        totalBadgeTierCost,
      },
    })
  } catch (error: any) {
    console.error('[Admin] Error fetching revenue:', error)
    sendError(res, 'Failed to fetch revenue data')
  }
})

// GET /api/admin/expenses/aggregate
router.get('/expenses/aggregate', requireAdmin, async (req: Request, res: Response) => {
  try {
    const { period = 'month', date } = req.query
    const { startDate, endDate } = computeDateRange(period as string, date as string | undefined)

    const allExpenseDocs = await adminDb.expenses.getAll() as any[]
    const relevantMonths: string[] = []
    const expenseFields = [
      'stripeFees', 'openaiCost', 'anthropicCost', 'googleCost',
      'xaiCost', 'serperCost', 'resendCost',
      'mongoDbCost', 'vercelCost', 'domainCost',
    ]

    const aggregated: Record<string, number> = {}
    expenseFields.forEach(f => { aggregated[f] = 0 })

    for (const doc of allExpenseDocs) {
      const monthKey = doc._id || doc.month
      if (!monthKey) continue
      const [y, m] = monthKey.split('-').map(Number)
      const monthStart = new Date(y, m - 1, 1)
      const monthEnd = new Date(y, m, 1)

      if (monthEnd > startDate && monthStart < endDate) {
        relevantMonths.push(monthKey)
        expenseFields.forEach(f => {
          aggregated[f] += parseFloat(doc[f]) || 0
        })
      }
    }

    const totalApiCost = ['openaiCost', 'anthropicCost', 'googleCost', 'xaiCost']
      .reduce((sum, key) => sum + aggregated[key], 0)
    const grandTotal = Object.values(aggregated).reduce((sum, val) => sum + val, 0)

    sendSuccess(res, {
      expenses: aggregated,
      months: relevantMonths,
      totalApiCost,
      grandTotal,
    })
  } catch (error: any) {
    console.error('[Admin] Error aggregating expenses:', error)
    sendError(res, 'Failed to aggregate expenses')
  }
})

// GET /api/admin/expenses/history
router.get('/expenses/history', requireAdmin, async (req: Request, res: Response) => {
  try {
    const allExpenses = await adminDb.expenses.getAll()
    sendSuccess(res, { expenses: allExpenses })
  } catch (error: any) {
    console.error('[Admin] Error fetching expense history:', error)
    sendError(res, 'Failed to fetch expense history')
  }
})

export default router
export { pricingRouter }
