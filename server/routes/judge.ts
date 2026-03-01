import { Router, type Request, type Response } from 'express'
import axios from 'axios'
import { API_KEYS } from '../config/index.js'
import { countTokens, extractTokensFromResponse } from '../helpers/tokenCounters.js'
import { trackUsage, trackConversationPrompt, getCurrentDateStringForUser } from '../services/usage.js'
import { checkSubscriptionStatusAsync } from '../services/subscription.js'
import { buildTokenBreakdown } from '../helpers/pricing.js'
import { detectCategoryForJudge, storeJudgeContext } from '../services/context.js'
import { findRelevantContext, formatMemoryContext } from '../services/memory.js'
import { performSerperSearch, buildSearchContextSnippet, reformulateSearchQuery, formatRawSourcesForPrompt } from '../services/search.js'
import db from '../../database/db.js'
import { sendSuccess, sendError } from '../types/api.js'

const router = Router()

router.get('/context/:userId', async (req: Request, res: Response) => {
  try {
    const userId = req.userId!
    const decodedUserId = decodeURIComponent(userId!)
    
    const userUsage: any = await db.usage.getOrDefault(decodedUserId)
    const context = (userUsage.judgeConversationContext || []).slice(0, 5)
    
    sendSuccess(res, { context })
  } catch (error: any) {
    console.error('[Judge Context] Error fetching context:', error)
    sendError(res, `Failed to fetch conversation context: ${  error.message}`)
  }
})

router.get('/context', async (req: Request, res: Response) => {
  try {
    const userId = req.userId!
    const decodedUserId = decodeURIComponent(userId!)
    
    const userUsage: any = await db.usage.getOrDefault(decodedUserId)
    const context = (userUsage.judgeConversationContext || []).slice(0, 5)
    
    sendSuccess(res, { context })
  } catch (error: any) {
    console.error('[Judge Context] Error fetching context:', error)
    sendError(res, `Failed to fetch conversation context: ${  error.message}`)
  }
})

router.post('/clear-context', async (req: Request, res: Response) => {
  try {
    const userId = req.userId!
    
    await db.usage.update(userId, { judgeConversationContext: [] })
    console.log(`[Judge Context] Cleared context for user ${userId}`)
    
    sendSuccess(res, { message: 'Context cleared' })
  } catch (error: any) {
    console.error('[Judge Context] Error clearing context:', error)
    sendError(res, `Failed to clear conversation context: ${  error.message}`)
  }
})

router.post('/conversation', async (req: Request, res: Response) => {
  try {
    const userId = req.userId!
    const { userMessage, conversationContext, originalSummaryText } = req.body
    
    if (!userMessage) {
      return sendError(res, 'userMessage is required', 400)
    }
    
    const subscriptionCheck = await checkSubscriptionStatusAsync(userId)
    if (!subscriptionCheck.hasAccess) {
      return sendError(res, 'Active subscription required. Please subscribe to use this service.', 403, {
        subscriptionRequired: true,
        reason: subscriptionCheck.reason
      })
    }
    
    console.log('[Judge Conversation] Processing message with Gemini 3 Flash (conversational mode, with RAG support)')
    
    const { category, needsSearch, needsContext } = await detectCategoryForJudge(userMessage, userId)
    console.log(`[Judge Conversation] Category: ${category}, Needs Search: ${needsSearch}, Needs Context: ${needsContext}`)
    
    let memoryContextString = ''
    let memoryContextItems: any[] = []
    if (userId) {
      const scoreThreshold = needsContext ? 0.70 : 0.82
      memoryContextItems = await findRelevantContext(userId, userMessage, 3, scoreThreshold)
      memoryContextString = formatMemoryContext(memoryContextItems)
      if (memoryContextString) {
        console.log(`[Judge Conversation] Memory: Injecting ${memoryContextItems.length} past conversations as context`)
      }
    }
    
    const usageData: any = await db.usage.getOrDefault(userId)
    const contextSummaries = (conversationContext && conversationContext.length > 0)
      ? conversationContext
      : (usageData.judgeConversationContext || []).slice(0, 5)
    
    let contextString = ''
    if (memoryContextString) {
      contextString += `${memoryContextString  }\n`
    }
    if (contextSummaries.length > 0) {
      contextString += `Here is context from your recent conversation with this user (most recent first — prioritize the latest context):\n\n${contextSummaries.map((ctx: any, idx: number) => {
          const promptPart = ctx.originalPrompt ? `User asked: ${ctx.originalPrompt}\n` : ''
          const responsePart = ctx.isFull && ctx.response 
            ? `Your response: ${ctx.response}`
            : `Your response (summary): ${ctx.summary}`
          return `${idx + 1}. ${promptPart}${responsePart}`
        }).join('\n\n')}\n\n`
    } else if (originalSummaryText && originalSummaryText.trim()) {
      contextString += `Your previous summary response that the user wants to continue discussing:\n${originalSummaryText.substring(0, 3000)}${originalSummaryText.length > 3000 ? '...' : ''}\n\n`
    }
    
    let judgePrompt = ''
    let rawSourcesData: any = null
    let searchResults: any[] = []
    
    if (needsSearch) {
      console.log('[Judge Conversation] Search needed, fetching raw sources...')
      
      const serperApiKey = API_KEYS.serper
      if (!serperApiKey) {
        console.warn('[Judge Conversation] Serper API key not configured, skipping search')
      } else {
        try {
          const searchContextSnippet = buildSearchContextSnippet(contextSummaries, originalSummaryText)
          const searchQuery = await reformulateSearchQuery(userMessage, userId, searchContextSnippet)
          const serperData = await performSerperSearch(searchQuery, 5)
          searchResults = (serperData?.organic || []).map((r: any) => ({
            title: r.title,
            link: r.link,
            snippet: r.snippet
          }))
          
          console.log(`[Judge Conversation] Search completed, found ${searchResults.length} results`)
          
          if (searchResults.length > 0) {
            rawSourcesData = await formatRawSourcesForPrompt(searchResults, 5)
            console.log(`[Judge Conversation] Raw sources scraped: ${rawSourcesData.sourceCount} sources`)
          }
        } catch (searchError) {
          console.error('[Judge Conversation] Search/scrape error:', searchError)
        }
      }
    }
    
    const todayDate = await getCurrentDateStringForUser(userId)
    if (rawSourcesData && rawSourcesData.sourceCount > 0) {
      judgePrompt = `Today's date is ${todayDate}. You have access to real-time web search — the source content below is current and already retrieved for you. Read and parse it yourself to answer. Do NOT tell the user you cannot search the web.\n\n${contextString}Here is raw content from recent web sources that may help:\n\n${rawSourcesData.formatted}\n\nUser's question: ${userMessage}`
    } else {
      judgePrompt = `Today's date is ${todayDate}. You have access to real-time web search. If search results are provided, use them directly. Do NOT tell the user you cannot search the web.\n\n${contextString}User: ${userMessage}`
    }
    
    const apiKey = API_KEYS.google
    if (!apiKey) {
      return sendError(res, 'Google API key not configured')
    }
    
    const judgeModel = 'gemini-3-flash'
    const judgeModelApi = 'gemini-3-flash-preview'
    
    const response = await axios.post(
      `https://generativelanguage.googleapis.com/v1beta/models/${judgeModelApi}:generateContent?key=${apiKey}`,
      {
        contents: [{ parts: [{ text: judgePrompt }] }],
      },
      {
        headers: {
          'Content-Type': 'application/json'
        }
      }
    )
    
    const responseText = response.data.candidates[0].content.parts[0].text
    
    const responseTokens: any = extractTokensFromResponse(response.data, 'google')
    let inputTokens = 0
    let outputTokens = 0
    
    if (responseTokens) {
      inputTokens = responseTokens.inputTokens || 0
      outputTokens = responseTokens.outputTokens || 0
    } else {
      inputTokens = await countTokens(judgePrompt, 'google', judgeModel)
      outputTokens = await countTokens(responseText, 'google', judgeModel)
    }
    
    trackUsage(userId, 'google', judgeModel, inputTokens, outputTokens, false)
    
    await trackConversationPrompt(userId, userMessage)
    
    storeJudgeContext(userId, responseText, userMessage).catch(err => {
      console.error('[Judge Conversation] Error storing context:', err)
    })
    
    const debugData = {
      search: needsSearch ? {
        query: userMessage,
        results: searchResults
      } : null,
      refiner: null,
      categoryDetection: {
        category,
        needsSearch,
        needsContext
      },
      memoryContext: {
        items: memoryContextItems,
        needsContextHint: needsContext,
        injected: memoryContextItems.length > 0,
      }
    }
    
    sendSuccess(res, { 
      response: responseText,
      tokens: {
        input: inputTokens,
        output: outputTokens,
        total: inputTokens + outputTokens,
        breakdown: rawSourcesData ? buildTokenBreakdown(userMessage, rawSourcesData.formatted, inputTokens) : null
      },
      category,
      needsSearch,
      usedSearch: needsSearch && rawSourcesData !== null && rawSourcesData.sourceCount > 0,
      debugData,
      searchResults,
      refinedData: null
    })
  } catch (error: any) {
    console.error('[Judge Conversation] Error:', error)
    sendError(res, `Failed to get judge response: ${  error.message}`)
  }
})

router.post('/conversation/stream', async (req: Request, res: Response) => {
  res.setHeader('Content-Type', 'text/event-stream')
  res.setHeader('Cache-Control', 'no-cache')
  res.setHeader('Connection', 'keep-alive')
  res.setHeader('X-Accel-Buffering', 'no')
  res.flushHeaders()

  const sendSSE = (type: string, data: any) => {
    res.write(`data: ${JSON.stringify({ type, ...data })}\n\n`)
  }

  try {
    const userId = req.userId!
    const { userMessage, conversationContext, originalSummaryText } = req.body

    if (!userMessage) {
      sendSSE('error', { message: 'userMessage is required' })
      return res.end()
    }

    const subscriptionCheck = await checkSubscriptionStatusAsync(userId)
    if (!subscriptionCheck.hasAccess) {
      sendSSE('error', { message: 'Active subscription required.', subscriptionRequired: true })
      return res.end()
    }

    console.log('[Judge Conversation Stream] Processing message with Gemini 3 Flash')

    sendSSE('status', { message: 'Analyzing query...' })
    const { category, needsSearch, needsContext } = await detectCategoryForJudge(userMessage, userId)
    console.log(`[Judge Conversation Stream] Category: ${category}, Needs Search: ${needsSearch}, Needs Context: ${needsContext}`)

    let memoryContextString = ''
    let memoryContextItems: any[] = []
    if (userId) {
      const scoreThreshold = needsContext ? 0.70 : 0.82
      memoryContextItems = await findRelevantContext(userId, userMessage, 3, scoreThreshold)
      memoryContextString = formatMemoryContext(memoryContextItems)
      if (memoryContextString) {
        console.log(`[Judge Conversation Stream] Memory: Injecting ${memoryContextItems.length} past conversations as context`)
      }
    }

    const usageData: any = await db.usage.getOrDefault(userId)
    const contextSummaries = (conversationContext && conversationContext.length > 0)
      ? conversationContext
      : (usageData.judgeConversationContext || []).slice(0, 5)
    
    let contextString = ''
    if (memoryContextString) {
      contextString += `${memoryContextString  }\n`
    }
    if (contextSummaries.length > 0) {
      contextString += `Here is context from your recent conversation with this user (most recent first — prioritize the latest context):\n\n${contextSummaries.map((ctx: any, idx: number) => {
          const promptPart = ctx.originalPrompt ? `User asked: ${ctx.originalPrompt}\n` : ''
          const responsePart = ctx.isFull && ctx.response
            ? `Your response: ${ctx.response}`
            : `Your response (summary): ${ctx.summary}`
          return `${idx + 1}. ${promptPart}${responsePart}`
        }).join('\n\n')}\n\n`
    } else if (originalSummaryText && originalSummaryText.trim()) {
      contextString += `Your previous summary response that the user wants to continue discussing:\n${originalSummaryText.substring(0, 3000)}${originalSummaryText.length > 3000 ? '...' : ''}\n\n`
    }

    let judgePrompt = ''
    let rawSourcesData: any = null
    let searchResults: any[] = []

    if (needsSearch) {
      sendSSE('status', { message: 'Searching the web...' })
      const serperApiKey = API_KEYS.serper
      if (serperApiKey) {
        try {
          const searchContextSnippet = buildSearchContextSnippet(contextSummaries, originalSummaryText)
          const searchQuery = await reformulateSearchQuery(userMessage, userId, searchContextSnippet)
          const serperData = await performSerperSearch(searchQuery, 5)
          searchResults = (serperData?.organic || []).map((r: any) => ({
            title: r.title, link: r.link, snippet: r.snippet
          }))
          console.log(`[Judge Conversation Stream] Search completed, found ${searchResults.length} results`)

          if (searchResults.length > 0) {
            sendSSE('status', { message: 'Reading sources...' })
            rawSourcesData = await formatRawSourcesForPrompt(searchResults, 5)
            console.log(`[Judge Conversation Stream] Raw sources scraped: ${rawSourcesData.sourceCount} sources`)
          }
        } catch (searchError) {
          console.error('[Judge Conversation Stream] Search/scrape error:', searchError)
        }
      }
    }

    const todayDate = await getCurrentDateStringForUser(userId)
    if (rawSourcesData && rawSourcesData.sourceCount > 0) {
      judgePrompt = `Today's date is ${todayDate}. You have access to real-time web search — the source content below is current and already retrieved for you. Read and parse it yourself to answer. Do NOT tell the user you cannot search the web.\n\n${contextString}Here is raw content from recent web sources that may help:\n\n${rawSourcesData.formatted}\n\nUser's question: ${userMessage}`
    } else {
      judgePrompt = `Today's date is ${todayDate}. You have access to real-time web search. If search results are provided, use them directly. Do NOT tell the user you cannot search the web.\n\n${contextString}User: ${userMessage}`
    }

    const apiKey = API_KEYS.google
    if (!apiKey) {
      sendSSE('error', { message: 'Google API key not configured' })
      return res.end()
    }

    const judgeModel = 'gemini-3-flash'
    const judgeModelApi = 'gemini-3-flash-preview'

    sendSSE('status', { message: 'Generating response...' })

    const systemPrefix = 'You are a helpful conversational AI assistant. Respond directly and naturally to the user\'s follow-up questions. Do NOT format your response as a council summary — no CONSENSUS, SUMMARY, AGREEMENTS, or CONTRADICTIONS sections. Just answer conversationally as a single assistant. Use the conversation context provided to maintain continuity.\n\n'

    const streamResponse = await axios.post(
      `https://generativelanguage.googleapis.com/v1beta/models/${judgeModelApi}:streamGenerateContent?key=${apiKey}&alt=sse`,
      {
        contents: [{ parts: [{ text: systemPrefix + judgePrompt }] }],
      },
      { responseType: 'stream' }
    )

    let fullResponse = ''
    let inputTokens = 0
    let outputTokens = 0

    await new Promise<void>((resolve, reject) => {
      let buffer = ''
      const processLine = (line: string) => {
        if (line.startsWith('data: ')) {
          const jsonStr = line.replace('data: ', '').trim()
          if (!jsonStr) return
          try {
            const parsed = JSON.parse(jsonStr)
            const text = parsed.candidates?.[0]?.content?.parts?.[0]?.text || ''
            if (text) {
              fullResponse += text
              sendSSE('token', { content: text })
            }
            if (parsed.usageMetadata) {
              inputTokens = parsed.usageMetadata.promptTokenCount || inputTokens
              outputTokens = parsed.usageMetadata.candidatesTokenCount || outputTokens
            }
          } catch (e) { /* skip */ }
        }
      }
      streamResponse.data.on('data', (chunk: Buffer) => {
        buffer += chunk.toString()
        const lines = buffer.split('\n')
        buffer = lines.pop() || ''
        for (const line of lines) {
          processLine(line)
        }
      })
      streamResponse.data.on('end', () => {
        if (buffer.trim()) {
          const remaining = buffer.split('\n')
          for (const line of remaining) {
            processLine(line)
          }
        }
        resolve()
      })
      streamResponse.data.on('error', reject)
    })

    if (inputTokens === 0 && outputTokens === 0) {
      try {
        inputTokens = await countTokens(judgePrompt, 'google', judgeModel)
        outputTokens = await countTokens(fullResponse, 'google', judgeModel)
      } catch (e) {
        console.error('[Judge Stream] Token counting error:', e)
      }
    }

    trackUsage(userId, 'google', judgeModel, inputTokens, outputTokens, false)
    
    await trackConversationPrompt(userId, userMessage)

    storeJudgeContext(userId, fullResponse, userMessage).catch(err => {
      console.error('[Judge Conversation Stream] Error storing context:', err)
    })

    const debugData = {
      search: needsSearch ? { query: userMessage, results: searchResults } : null,
      refiner: null,
      categoryDetection: { category, needsSearch, needsContext },
      memoryContext: {
        items: memoryContextItems,
        needsContextHint: needsContext,
        injected: memoryContextItems.length > 0,
      }
    }

    sendSSE('done', {
      response: fullResponse,
      tokens: { input: inputTokens, output: outputTokens, total: inputTokens + outputTokens, breakdown: rawSourcesData ? buildTokenBreakdown(userMessage, rawSourcesData.formatted, inputTokens) : null },
      category, needsSearch,
      usedSearch: needsSearch && rawSourcesData !== null && rawSourcesData.sourceCount > 0,
      debugData,
      searchResults,
      refinedData: null
    })

    res.end()

  } catch (error: any) {
    console.error('[Judge Conversation Stream] Error:', error.message)
    sendSSE('error', { message: `Failed to get judge response: ${  error.message}` })
    res.end()
  }
})

router.post('/store-initial-summary', async (req: Request, res: Response) => {
  try {
    const userId = req.userId!
    const { summaryText, originalPrompt } = req.body
    
    if (!summaryText) {
      return sendError(res, 'summaryText is required', 400)
    }
    
    await storeJudgeContext(userId, summaryText, originalPrompt)
    
    sendSuccess(res, { message: 'Initial summary stored' })
  } catch (error: any) {
    console.error('[Store Initial Summary] Error:', error)
    sendError(res, `Failed to store initial summary: ${  error.message}`)
  }
})

export default router
