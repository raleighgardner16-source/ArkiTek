import { Router } from 'express'
import { performSerperSearch } from '../services/search.js'
import { detectCategoryForJudge } from '../services/context.js'
import { getUserTimezone } from '../services/usage.js'
import { getMonthForUser, getTodayForUser } from '../helpers/date.js'
import { calculateSerperQueryCost } from '../helpers/pricing.js'
import db from '../../database/db.js'

const router = Router()

// POST /api/search → router.post('/')
router.post('/', async (req, res) => {
  try {
    const { query, num = 10 } = req.body

    if (!query || !query.trim()) {
      return res.status(400).json({ 
        error: 'Missing required field: query' 
      })
    }

    const response = await performSerperSearch(query, num)

    const userId = req.userId
    if (userId) {
      const userUsage = await db.usage.getOrDefault(userId)
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
      console.log(`[Query Tracking] User ${userId}: Total queries ${userUsage.totalQueries}, Monthly queries ${userUsage.monthlyUsage[currentMonth].queries}`)
      
      try {
        const queryCost = calculateSerperQueryCost(1)
        await db.userStats.addMonthlyCost(userId, currentMonth, queryCost)
        console.log(`[Query Tracking] Added $${queryCost.toFixed(6)} query cost via userStats`)
      } catch (costErr) {
        console.error('[Query Tracking] Error updating monthlyUsageCost:', costErr)
      }
    }

    const searchResults = {
      query: query,
      results: response?.organic || [],
      answerBox: response?.answerBox || null,
      knowledgeGraph: response?.knowledgeGraph || null,
    }

    return res.json(searchResults)
  } catch (error) {
    console.error('[Backend] Serper search error:', error)
    
    let errorMessage = error.response?.data?.message 
      || error.response?.data?.error
      || error.message
      || 'Unknown error occurred'
    
    if (error.response?.status === 401) {
      errorMessage = 'Unauthorized (401): Invalid Serper API key. Please check your SERPER_API_KEY in the .env file.'
    } else if (error.response?.status === 400) {
      errorMessage = `Bad Request (400): ${errorMessage}`
    }

    return res.status(error.response?.status || 500).json({ 
      error: errorMessage 
    })
  }
})

export default router

// Named export for detect-search-needed (mounted at /api/detect-search-needed)
const detectSearchRouter = Router()

detectSearchRouter.post('/', async (req, res) => {
  try {
    const userId = req.userId
    const { query } = req.body
    
    if (!query) {
      return res.status(400).json({ error: 'query is required' })
    }
    
    const { category, needsSearch, needsContext } = await detectCategoryForJudge(query, userId)
    
    res.json({ 
      needsSearch, 
      needsContext,
      category 
    })
  } catch (error) {
    console.error('[Detect Search] Error:', error)
    res.json({ needsSearch: false, category: 'General Knowledge/Other' })
  }
})

export { detectSearchRouter }
