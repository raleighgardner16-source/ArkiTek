import { Router, type Request, type Response } from 'express'
import { performSerperSearch } from '../services/search.js'
import { detectCategoryForJudge } from '../services/context.js'
import { getUserTimezone } from '../services/usage.js'
import { getMonthForUser, getTodayForUser } from '../helpers/date.js'
import { calculateSerperQueryCost } from '../helpers/pricing.js'
import db from '../../database/db.js'
import { createLogger } from '../config/logger.js'
import { sendSuccess, sendError } from '../types/api.js'

const log = createLogger('search')
const router = Router()

// POST /api/search → router.post('/')
router.post('/', async (req: Request, res: Response) => {
  try {
    const { query, num = 10 } = req.body

    if (!query || !query.trim()) {
      return sendError(res, 'Missing required field: query', 400)
    }

    const response = await performSerperSearch(query, num)

    const userId = req.userId
    if (userId) {
      const userUsage: any = await db.usage.getOrDefault(userId)
      const tz = await getUserTimezone(userId)
      const currentMonth = getMonthForUser(tz)
      
      userUsage.totalQueries = (userUsage.totalQueries || 0) + 1
      
      if (!userUsage.monthlyUsage) userUsage.monthlyUsage = {}
      if (!userUsage.monthlyUsage[currentMonth]) {
        userUsage.monthlyUsage[currentMonth] = { tokens: 0, inputTokens: 0, outputTokens: 0, queries: 0, prompts: 0 }
      }
      userUsage.monthlyUsage[currentMonth].queries = (userUsage.monthlyUsage[currentMonth].queries || 0) + 1
      
      const today = getTodayForUser(tz)
      if (!userUsage.dailyUsage) userUsage.dailyUsage = {}
      if (!userUsage.dailyUsage[currentMonth]) userUsage.dailyUsage[currentMonth] = {}
      if (!userUsage.dailyUsage[currentMonth][today]) {
        userUsage.dailyUsage[currentMonth][today] = { inputTokens: 0, outputTokens: 0, queries: 0, models: {} }
      }
      userUsage.dailyUsage[currentMonth][today].queries = (userUsage.dailyUsage[currentMonth][today].queries || 0) + 1
      
      await db.usage.update(userId, {
        totalQueries: userUsage.totalQueries,
        monthlyUsage: userUsage.monthlyUsage,
        dailyUsage: userUsage.dailyUsage,
      })
      log.info({ userId, totalQueries: userUsage.totalQueries, monthlyQueries: userUsage.monthlyUsage[currentMonth].queries }, 'Query tracking')
      
      try {
        const queryCost = calculateSerperQueryCost(1)
        await db.userStats.addMonthlyCost(userId, currentMonth, queryCost)
        log.debug({ userId, queryCost }, 'Added query cost via userStats')
      } catch (costErr) {
        log.error({ err: costErr }, 'Error updating monthlyUsageCost')
      }
    }

    const searchResults = {
      query,
      results: response?.organic || [],
      answerBox: response?.answerBox || null,
      knowledgeGraph: response?.knowledgeGraph || null,
    }

    return sendSuccess(res, searchResults)
  } catch (error: any) {
    log.error({ err: error }, 'Serper search error')
    
    let errorMessage = error.response?.data?.message 
      || error.response?.data?.error
      || error.message
      || 'Unknown error occurred'
    
    if (error.response?.status === 401) {
      errorMessage = 'Unauthorized (401): Invalid Serper API key. Please check your SERPER_API_KEY in the .env file.'
    } else if (error.response?.status === 400) {
      errorMessage = `Bad Request (400): ${errorMessage}`
    }

    return sendError(res, errorMessage, error.response?.status || 500)
  }
})

export default router

// Named export for detect-search-needed (mounted at /api/detect-search-needed)
const detectSearchRouter = Router()

detectSearchRouter.post('/', async (req: Request, res: Response) => {
  try {
    const userId = req.userId
    const { query } = req.body
    
    if (!query) {
      return sendError(res, 'query is required', 400)
    }
    
    const { category, needsSearch, needsContext } = await detectCategoryForJudge(query, userId)
    
    sendSuccess(res, { 
      needsSearch, 
      needsContext,
      category 
    })
  } catch (error) {
    log.error({ err: error }, 'Detect search error')
    sendSuccess(res, { needsSearch: false, category: 'General Knowledge/Other' })
  }
})

export { detectSearchRouter }
