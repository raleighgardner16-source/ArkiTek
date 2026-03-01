import { Router, type Request, type Response } from 'express'
import axios from 'axios'
import { API_KEYS, MODEL_MAPPINGS, PROVIDER_BASE_URLS } from '../config/index.js'
import { countTokens, extractTokensFromResponse } from '../helpers/tokenCounters.js'
import { trackUsage, trackConversationPrompt, getCurrentDateStringForUser } from '../services/usage.js'
import { checkSubscriptionStatusAsync } from '../services/subscription.js'
import { buildTokenBreakdown } from '../helpers/pricing.js'
import { detectCategoryForJudge, storeModelContext } from '../services/context.js'
import { findRelevantContext, formatMemoryContext } from '../services/memory.js'
import { performSerperSearch, buildSearchContextSnippet, reformulateSearchQuery, formatRawSourcesForPrompt } from '../services/search.js'
import db from '../../database/db.js'
import { createLogger } from '../config/logger.js'
import { sendSuccess, sendError } from '../types/api.js'

const log = createLogger('model')
const router = Router()

router.get('/context', async (req: Request, res: Response) => {
  try {
    const userId = req.userId!
    const { modelName } = req.query
    
    if (!modelName) {
      return sendError(res, 'modelName query parameter is required', 400)
    }
    
    const decodedUserId = decodeURIComponent(userId!)
    const decodedModelName = decodeURIComponent(modelName as string)
    log.debug({ userId: decodedUserId, modelName: decodedModelName }, 'Fetching model context')
    
    const userUsage: any = await db.usage.getOrDefault(decodedUserId)
    const allModelContexts = userUsage.modelConversationContext || {}
    const context = (allModelContexts[decodedModelName] || []).slice(0, 5)
    
    log.debug({ modelName: decodedModelName, count: context.length }, 'Found model context entries')
    sendSuccess(res, { context })
  } catch (error: any) {
    log.error({ err: error }, 'Error fetching model context')
    sendError(res, 'Failed to fetch model conversation context: ' + error.message)
  }
})

router.post('/clear-context', async (req: Request, res: Response) => {
  try {
    const userId = req.userId!
    const { modelName } = req.body
    
    const userUsage: any = await db.usage.getOrDefault(userId)
    if (userUsage.modelConversationContext) {
      if (modelName) {
        delete userUsage.modelConversationContext[modelName]
        log.info({ modelName, userId }, 'Cleared context for model')
      } else {
        userUsage.modelConversationContext = {}
        log.info({ userId }, 'Cleared all model contexts')
      }
      await db.usage.update(userId, { modelConversationContext: userUsage.modelConversationContext })
    }
    
    sendSuccess(res, { message: 'Model context cleared' })
  } catch (error: any) {
    log.error({ err: error }, 'Error clearing model context')
    sendError(res, 'Failed to clear model conversation context: ' + error.message)
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

  const heartbeat = setInterval(() => {
    try { res.write(': heartbeat\n\n') } catch (e) { clearInterval(heartbeat) }
  }, 15000)

  try {
    const userId = req.userId!
    const { modelName, userMessage, originalResponse, responseId, isCouncilFollowUp } = req.body

    if (!modelName || !userMessage) {
      sendSSE('error', { message: 'modelName and userMessage are required' })
      clearInterval(heartbeat)
      return res.end()
    }

    const subscriptionCheck = await checkSubscriptionStatusAsync(userId)
    if (!subscriptionCheck.hasAccess) {
      sendSSE('error', { message: 'Active subscription required.', subscriptionRequired: true })
      clearInterval(heartbeat)
      return res.end()
    }

    log.debug({ modelName }, 'Model conversation stream: processing message')

    const parts = modelName.split('-')
    const provider = parts[0]
    const model = parts.slice(1).join('-')

    sendSSE('status', { message: 'Analyzing query...' })
    const { category, needsSearch, needsContext } = await detectCategoryForJudge(userMessage, userId)
    log.debug({ modelName, category, needsSearch, needsContext }, 'Model conversation stream context')

    let memoryContextString = ''
    let memoryContextItems: any[] = []
    if (userId) {
      const scoreThreshold = needsContext ? 0.70 : 0.82
      memoryContextItems = await findRelevantContext(userId, userMessage, 3, scoreThreshold, modelName)
      memoryContextString = formatMemoryContext(memoryContextItems)
      if (memoryContextString) {
        log.debug({ modelName, count: memoryContextItems.length }, 'Memory: injecting past conversations')
      }
    }

    const userUsage: any = await db.usage.getOrDefault(userId)
    const allModelContexts = userUsage.modelConversationContext || {}
    const contextSummaries = (allModelContexts[modelName] || []).slice(0, 5)

    let rawSourcesData: any = null
    let searchResults: any[] = []

    if (needsSearch) {
      sendSSE('status', { message: 'Searching the web...' })
      const serperApiKey = API_KEYS.serper
      if (serperApiKey) {
        try {
          const searchContextSnippet = buildSearchContextSnippet(contextSummaries, originalResponse)
          const searchQuery = await reformulateSearchQuery(userMessage, userId, searchContextSnippet)
          const serperData = await performSerperSearch(searchQuery, 5)
          searchResults = (serperData?.organic || []).map((r: any) => ({
            title: r.title, link: r.link, snippet: r.snippet
          }))
          if (searchResults.length > 0) {
            sendSSE('status', { message: 'Reading sources...' })
            rawSourcesData = await formatRawSourcesForPrompt(searchResults, 5)
            log.debug({ sourceCount: rawSourcesData.sourceCount }, 'Raw sources scraped')
          }
        } catch (searchError: any) {
          log.error({ err: searchError }, 'Model conversation stream: search/scrape error')
        }
      }
    }

    let systemMessage = `Today's date is ${await getCurrentDateStringForUser(userId)}. You have access to real-time web search — when source content is provided below, read and parse it yourself to answer the user's question. Do NOT tell the user you cannot search the web or ask them for permission. The search has already been performed for you and the source content is included in this prompt. Answer confidently using the provided data. If citing sources, cite publication/site/title or URL/domain and NEVER use numeric labels like "source 1" or "source 3".`

    if (memoryContextString) {
      systemMessage += '\n\n' + memoryContextString
    }

    if (rawSourcesData && rawSourcesData.sourceCount > 0) {
      systemMessage += `\n\nHere is raw content from recent web sources that may help answer the user's question:\n\n${rawSourcesData.formatted}`
    }

    const conversationMessages: { role: string; content: string }[] = []
    if (contextSummaries.length > 0) {
      const chronological = [...contextSummaries].reverse()
      for (const ctx of chronological) {
        if (ctx.originalPrompt) {
          conversationMessages.push({ role: 'user', content: ctx.originalPrompt })
        }
        const assistantText = ctx.isFull && ctx.response ? ctx.response : ctx.summary
        if (assistantText) {
          conversationMessages.push({ role: 'assistant', content: assistantText })
        }
      }
    } else if (originalResponse && originalResponse.trim()) {
      conversationMessages.push({ role: 'assistant', content: originalResponse.substring(0, 4000) })
    }

    conversationMessages.push({ role: 'user', content: userMessage })

    const prompt = systemMessage + '\n\n' + conversationMessages.map(m => `${m.role}: ${m.content}`).join('\n')

    log.debug({ messageCount: conversationMessages.length, contextCount: contextSummaries.length }, 'Built conversation messages')

    const mappedModel = MODEL_MAPPINGS[model] || model

    sendSSE('status', { message: 'Generating response...' })

    let fullResponse = ''
    let inputTokens = 0
    let outputTokens = 0

    if (['openai', 'xai', 'meta', 'deepseek', 'mistral'].includes(provider)) {
      const apiKey = API_KEYS[provider]
      if (!apiKey) {
        sendSSE('error', { message: `${provider} API key not configured` })
        return res.end()
      }

      const modelsWithFixedTemperature = ['gpt-5-mini']
      const shouldUseDefaultTemperature = modelsWithFixedTemperature.includes(mappedModel) || modelsWithFixedTemperature.includes(model)

      const streamResponse = await axios.post(
        `${PROVIDER_BASE_URLS[provider]}/chat/completions`,
        {
          model: mappedModel,
          messages: [{ role: 'user', content: prompt }],
          ...(shouldUseDefaultTemperature ? {} : { temperature: 0.7 }),
          stream: true
        },
        {
          headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
          responseType: 'stream'
        }
      )

      await new Promise<void>((resolve, reject) => {
        streamResponse.data.on('data', (chunk: Buffer) => {
          const lines = chunk.toString().split('\n').filter((l: string) => l.trim().startsWith('data:'))
          for (const line of lines) {
            const jsonStr = line.replace(/^data:\s*/, '').trim()
            if (jsonStr === '[DONE]') continue
            try {
              const parsed = JSON.parse(jsonStr)
              const token = parsed.choices?.[0]?.delta?.content || ''
              if (token) {
                fullResponse += token
                sendSSE('token', { content: token })
              }
              if (parsed.usage) {
                inputTokens = parsed.usage.prompt_tokens || 0
                outputTokens = parsed.usage.completion_tokens || 0
              }
            } catch (e) { /* skip */ }
          }
        })
        streamResponse.data.on('end', resolve)
        streamResponse.data.on('error', reject)
      })

    } else if (provider === 'anthropic') {
      const apiKey = API_KEYS.anthropic
      if (!apiKey) {
        sendSSE('error', { message: 'Anthropic API key not configured' })
        return res.end()
      }

      const streamResponse = await axios.post(
        'https://api.anthropic.com/v1/messages',
        {
          model: mappedModel,
          max_tokens: 4096,
          messages: [{ role: 'user', content: prompt }],
          stream: true
        },
        {
          headers: {
            'x-api-key': apiKey,
            'anthropic-version': '2023-06-01',
            'Content-Type': 'application/json'
          },
          responseType: 'stream',
          timeout: 120000
        }
      )

      await new Promise<void>((resolve, reject) => {
        let buffer = ''
        let streamError: string | null = null
        const processAnthropicConvoLine = (line: string) => {
          if (line.startsWith('data: ')) {
            const jsonStr = line.replace('data: ', '').trim()
            if (!jsonStr) return
            try {
              const parsed = JSON.parse(jsonStr)
              if (parsed.type === 'content_block_delta') {
                const text = parsed.delta?.text || ''
                if (text) {
                  fullResponse += text
                  sendSSE('token', { content: text })
                }
              }
              if (parsed.type === 'message_delta' && parsed.usage) {
                outputTokens = parsed.usage.output_tokens || 0
              }
              if (parsed.type === 'message_start' && parsed.message?.usage) {
                inputTokens = parsed.message.usage.input_tokens || 0
              }
              if (parsed.type === 'error') {
                log.error({ error: parsed.error || parsed }, 'Anthropic stream error event')
                streamError = parsed.error?.message || 'Anthropic stream error'
              }
            } catch (e) { /* skip */ }
          }
        }
        streamResponse.data.on('data', (chunk: Buffer) => {
          buffer += chunk.toString()
          const lines = buffer.split('\n')
          buffer = lines.pop() || ''
          for (const line of lines) {
            processAnthropicConvoLine(line)
          }
        })
        streamResponse.data.on('end', () => {
          if (buffer.trim()) {
            const remaining = buffer.split('\n')
            for (const line of remaining) {
              processAnthropicConvoLine(line)
            }
          }
          if (streamError && !fullResponse) {
            reject(new Error(streamError))
          } else {
            resolve()
          }
        })
        streamResponse.data.on('error', (err: Error) => {
          log.error({ err }, 'Anthropic stream connection error')
          reject(err)
        })
      })

    } else if (provider === 'google') {
      const apiKey = API_KEYS.google
      if (!apiKey) {
        sendSSE('error', { message: 'Google API key not configured' })
        return res.end()
      }

      const streamResponse = await axios.post(
        `https://generativelanguage.googleapis.com/v1beta/models/${mappedModel}:streamGenerateContent?key=${apiKey}&alt=sse`,
        {
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: { maxOutputTokens: 4096 }
        },
        { responseType: 'stream' }
      )

      await new Promise<void>((resolve, reject) => {
        let buffer = ''
        const processGoogleConvoLine = (line: string) => {
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
            processGoogleConvoLine(line)
          }
        })
        streamResponse.data.on('end', () => {
          if (buffer.trim()) {
            const remaining = buffer.split('\n')
            for (const line of remaining) {
              processGoogleConvoLine(line)
            }
          }
          resolve()
        })
        streamResponse.data.on('error', reject)
      })

    } else {
      sendSSE('error', { message: `Unsupported provider: ${provider}` })
      clearInterval(heartbeat)
      return res.end()
    }

    if (inputTokens === 0 && outputTokens === 0) {
      try {
        inputTokens = await countTokens(prompt, provider, mappedModel)
        outputTokens = await countTokens(fullResponse, provider, mappedModel)
      } catch (e) { /* skip */ }
    }

    trackUsage(userId, provider, model, inputTokens, outputTokens)

    if (!isCouncilFollowUp) {
      await trackConversationPrompt(userId, userMessage)
    }

    storeModelContext(userId, modelName, fullResponse, userMessage).catch(err => {
      log.error({ err, modelName }, 'Error storing model context')
    })

    log.debug({ modelName, inputTokens, outputTokens }, 'Model conversation stream: response generated')

    sendSSE('done', {
      response: fullResponse,
      tokens: { input: inputTokens, output: outputTokens, total: inputTokens + outputTokens, breakdown: rawSourcesData ? buildTokenBreakdown(userMessage, rawSourcesData.formatted, inputTokens) : null },
      category, needsSearch,
      usedSearch: needsSearch && rawSourcesData !== null && rawSourcesData.sourceCount > 0,
      searchResults,
      refinedData: null
    })

    clearInterval(heartbeat)
    res.end()

  } catch (error: any) {
    clearInterval(heartbeat)
    log.error({ err: error, status: error.response?.status, statusText: error.response?.statusText, data: error.response?.data }, 'Model conversation stream API error')
    sendSSE('error', { message: 'Failed to get model response: ' + (error.response?.data?.error?.message || error.message) })
    res.end()
  }
})

router.post('/conversation', async (req: Request, res: Response) => {
  try {
    const userId = req.userId!
    const { modelName, userMessage, originalResponse, responseId, isCouncilFollowUp } = req.body
    
    if (!modelName || !userMessage) {
      return sendError(res, 'modelName and userMessage are required', 400)
    }
    
    const subscriptionCheck = await checkSubscriptionStatusAsync(userId)
    if (!subscriptionCheck.hasAccess) {
      return sendError(res, 'Active subscription required. Please subscribe to use this service.', 403, { subscriptionRequired: true, reason: subscriptionCheck.reason })
    }
    
    log.debug({ modelName }, 'Model conversation: processing message')
    
    const parts = modelName.split('-')
    const provider = parts[0]
    const model = parts.slice(1).join('-')
    
    const { category, needsSearch, needsContext } = await detectCategoryForJudge(userMessage, userId)
    log.debug({ modelName, category, needsSearch, needsContext }, 'Model conversation context')
    
    let memoryContextString = ''
    let memoryContextItems: any[] = []
    if (userId) {
      const scoreThreshold = needsContext ? 0.70 : 0.82
      memoryContextItems = await findRelevantContext(userId, userMessage, 3, scoreThreshold, modelName)
      memoryContextString = formatMemoryContext(memoryContextItems)
      if (memoryContextString) {
        log.debug({ modelName, count: memoryContextItems.length }, 'Memory: injecting past conversations')
      }
    }
    
    const userUsage: any = await db.usage.getOrDefault(userId)
    const allModelContexts = userUsage.modelConversationContext || {}
    const contextSummaries = (allModelContexts[modelName] || []).slice(0, 5)

    let rawSourcesData: any = null
    let searchResults: any[] = []
    
    if (needsSearch) {
      log.debug({ modelName }, 'Search needed, fetching raw sources')
      
      const serperApiKey = API_KEYS.serper
      if (serperApiKey) {
        try {
          const searchContextSnippet = buildSearchContextSnippet(contextSummaries, originalResponse)
          const searchQuery = await reformulateSearchQuery(userMessage, userId, searchContextSnippet)
          const serperData = await performSerperSearch(searchQuery, 5)
          searchResults = (serperData?.organic || []).map((r: any) => ({
            title: r.title,
            link: r.link,
            snippet: r.snippet
          }))
          
          log.debug({ resultCount: searchResults.length }, 'Search completed')
          
          if (searchResults.length > 0) {
            rawSourcesData = await formatRawSourcesForPrompt(searchResults, 5)
            log.debug({ sourceCount: rawSourcesData.sourceCount }, 'Raw sources scraped')
          }
        } catch (searchError: any) {
          log.error({ err: searchError }, 'Model conversation: search/scrape error')
        }
      } else {
        log.warn('Serper API key not configured, skipping search')
      }
    }
    
    let prompt = `Today's date is ${await getCurrentDateStringForUser(userId)}. You have access to real-time web search — when source content is provided below, read and parse it yourself to answer the user's question. Do NOT tell the user you cannot search the web or ask them for permission. The search has already been performed for you and the source content is included in this prompt. Answer confidently using the provided data. If citing sources, cite publication/site/title or URL/domain and NEVER use numeric labels like "source 1" or "source 3".\n\n`
    
    if (memoryContextString) {
      prompt += memoryContextString + '\n'
    }
    
    if (contextSummaries.length > 0) {
      const contextString = contextSummaries.map((ctx: any, idx: number) => {
        const promptPart = ctx.originalPrompt ? `User asked: ${ctx.originalPrompt}\n` : ''
        const responsePart = ctx.isFull && ctx.response 
          ? `Your response: ${ctx.response}`
          : `Your response (summary): ${ctx.summary}`
        return `${idx + 1}. ${promptPart}${responsePart}`
      }).join('\n\n')
      prompt += `Here is context from your recent conversation with this user (most recent first — prioritize the latest context):\n\n${contextString}\n\n`
    } else if (originalResponse && originalResponse.trim()) {
      prompt += `Your previous response that the user wants to continue discussing:\n${originalResponse.substring(0, 2000)}${originalResponse.length > 2000 ? '...' : ''}\n\n`
    }
    
    if (rawSourcesData && rawSourcesData.sourceCount > 0) {
      prompt += `Here is raw content from recent web sources that may help answer the user's question:\n\n${rawSourcesData.formatted}\n\n`
    }
    
    prompt += `User: ${userMessage}`
    
    let responseText = ''
    let inputTokens = 0
    let outputTokens = 0
    
    const mappedModel = MODEL_MAPPINGS[model] || model
    if (MODEL_MAPPINGS[model]) {
      log.debug({ model, mappedModel }, 'Model mapping')
    }
    
    if (['openai', 'xai', 'meta', 'deepseek', 'mistral'].includes(provider)) {
      const apiKey = API_KEYS[provider]
      if (!apiKey) {
        return sendError(res, `${provider} API key not configured`, 400)
      }
      
      const modelsWithFixedTemperature = ['gpt-5-mini']
      const shouldUseDefaultTemperature = modelsWithFixedTemperature.includes(mappedModel) || modelsWithFixedTemperature.includes(model)
      
      const response = await axios.post(
        `${PROVIDER_BASE_URLS[provider]}/chat/completions`,
        {
          model: mappedModel,
          messages: [{ role: 'user', content: prompt }],
          ...(shouldUseDefaultTemperature ? {} : { temperature: 0.7 }),
        },
        { headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' } }
      )
      
      responseText = response.data.choices[0].message.content
      inputTokens = response.data.usage?.prompt_tokens || 0
      outputTokens = response.data.usage?.completion_tokens || 0
      
    } else if (provider === 'anthropic') {
      const apiKey = API_KEYS.anthropic
      if (!apiKey) {
        return sendError(res, 'Anthropic API key not configured', 400)
      }
      
      const response = await axios.post(
        'https://api.anthropic.com/v1/messages',
        {
          model: mappedModel,
          max_tokens: 4096,
          messages: [{ role: 'user', content: prompt }],
        },
        { 
          headers: { 
            'x-api-key': apiKey,
            'anthropic-version': '2023-06-01',
            'Content-Type': 'application/json'
          } 
        }
      )
      
      responseText = response.data.content[0].text
      inputTokens = response.data.usage?.input_tokens || 0
      outputTokens = response.data.usage?.output_tokens || 0
      
    } else if (provider === 'google') {
      const apiKey = API_KEYS.google
      if (!apiKey) {
        return sendError(res, 'Google API key not configured', 400)
      }
      
      const response = await axios.post(
        `https://generativelanguage.googleapis.com/v1beta/models/${mappedModel}:generateContent?key=${apiKey}`,
        {
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: { maxOutputTokens: 4096 }
        }
      )
      
      responseText = response.data.candidates[0].content.parts[0].text
      const usageMetadata = response.data.usageMetadata || {}
      inputTokens = usageMetadata.promptTokenCount || 0
      outputTokens = usageMetadata.candidatesTokenCount || 0
      
    } else {
      return sendError(res, `Unsupported provider: ${provider}`, 400)
    }
    
    trackUsage(userId, provider, model, inputTokens, outputTokens)
    
    if (!isCouncilFollowUp) {
      await trackConversationPrompt(userId, userMessage)
    }
    
    storeModelContext(userId, modelName, responseText, userMessage).catch(err => {
      log.error({ err, modelName }, 'Error storing model context')
    })
    
    log.debug({ modelName, inputTokens, outputTokens, usedSearch: needsSearch && rawSourcesData !== null }, 'Model conversation: response generated')
    
    sendSuccess(res, {
      response: responseText,
      tokens: {
        input: inputTokens,
        output: outputTokens,
        total: inputTokens + outputTokens,
        breakdown: rawSourcesData ? buildTokenBreakdown(userMessage, rawSourcesData.formatted, inputTokens) : null
      },
      category: category,
      needsSearch: needsSearch,
      usedSearch: needsSearch && rawSourcesData !== null && rawSourcesData.sourceCount > 0,
      searchResults: searchResults,
      refinedData: null
    })
    
  } catch (error: any) {
    log.error({ err: error, status: error.response?.status, statusText: error.response?.statusText, data: error.response?.data }, 'Model conversation API error')
    sendError(res, 'Failed to get model response: ' + (error.response?.data?.error?.message || error.message))
  }
})

export default router
