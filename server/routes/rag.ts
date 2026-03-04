import { Router, type Request, type Response } from 'express'
import axios from 'axios'
import { API_KEYS, MODEL_MAPPINGS, PROVIDER_BASE_URLS } from '../config/index.js'
import { countTokens, extractTokensFromResponse } from '../helpers/tokenCounters.js'
import { trackUsage, getUserTimezone, getCurrentDateStringForUser } from '../services/usage.js'
import { checkSubscriptionStatus } from '../services/subscription.js'
import { buildTokenBreakdown, calculateSerperQueryCost } from '../helpers/pricing.js'
import { getMonthForUser, getTodayForUser } from '../helpers/date.js'
import { storeModelContext } from '../services/context.js'
import { findRelevantContext, formatMemoryContext } from '../services/memory.js'
import {
  performSerperSearch,
  reformulateSearchQuery,
  formatRawSourcesForPrompt,
  buildSnippetFallback,
  cleanMistralResponse,
} from '../services/search.js'
import db from '../../database/db.js'
import { sendSuccess, sendError } from '../types/api.js'

const router = Router()

async function streamRagCouncilModel({
  modelId,
  query,
  rawSourcesData,
  memoryContextString,
  userId,
  sendSSE,
  rolePrompt,
  clientClosedRef,
}: {
  modelId: string
  query: string
  rawSourcesData: any
  memoryContextString: string
  userId: string | undefined
  sendSSE: (type: string, data: any) => void
  rolePrompt: string | null
  clientClosedRef: { closed: boolean }
}) {
  const firstDashIndex = modelId.indexOf('-')
  if (firstDashIndex === -1) {
    const invalidResult = {
      model_name: modelId,
      actual_model_name: modelId,
      original_model_name: modelId,
      response: '',
      error: 'Invalid model ID format',
      tokens: null,
    }
    sendSSE('model_error', invalidResult)
    return invalidResult
  }

  const providerKey = modelId.substring(0, firstDashIndex)
  const model = modelId.substring(firstDashIndex + 1)
  const mappedModel = MODEL_MAPPINGS[model] || model

  const baseCouncilPrompt = `Today's date is ${await getCurrentDateStringForUser(userId)}.
${memoryContextString ? `\n${memoryContextString}` : ''}
Web Sources (background reference material):
${rawSourcesData.formatted}

The above sources are from a real-time web search and may contain useful context. Use them as reference where relevant, but DO NOT cite by number (do not write "source 1", "source 3", etc.). Instead, cite where information came from using the source's publication/site name, title, or URL/domain. Answer primarily from your own knowledge and expertise, and do not limit your response to only what the sources cover.

User Query: ${query}`

  const councilPrompt = rolePrompt
    ? `${rolePrompt}\n\n${baseCouncilPrompt}`
    : baseCouncilPrompt

  sendSSE('model_start', {
    model_name: modelId,
    actual_model_name: mappedModel,
    original_model_name: model,
  })

  let fullResponse = ''
  let inputTokens = 0
  let outputTokens = 0
  const reasoningTokens = 0
  let tokenSource = 'none'
  let upstreamStream: any = null

  try {
    const apiKey = API_KEYS[providerKey]
    if (!apiKey || apiKey.trim() === '') {
      throw new Error(`No API key configured for provider: ${providerKey}`)
    }

    if (['openai', 'xai', 'meta', 'deepseek', 'mistral'].includes(providerKey)) {
      const modelsWithFixedTemperature = ['gpt-5-mini']
      const shouldUseDefaultTemperature = modelsWithFixedTemperature.includes(mappedModel) || modelsWithFixedTemperature.includes(model)

      const councilMessages: any[] = []
      if (rolePrompt) councilMessages.push({ role: 'system', content: rolePrompt })
      councilMessages.push({ role: 'user', content: rolePrompt ? baseCouncilPrompt : councilPrompt })

      const streamResponse = await axios.post(
        `${PROVIDER_BASE_URLS[providerKey]}/chat/completions`,
        {
          model: mappedModel,
          messages: councilMessages,
          ...(shouldUseDefaultTemperature ? {} : { temperature: 0.7 }),
          stream: true,
          stream_options: { include_usage: true },
        },
        {
          headers: {
            'Authorization': `Bearer ${apiKey}`,
            'Content-Type': 'application/json',
          },
          responseType: 'stream',
        }
      )

      upstreamStream = streamResponse.data

      await new Promise<void>((resolve, reject) => {
        let buffer = ''
        const processLine = (line: string) => {
          if (!line.startsWith('data:')) return
          const jsonStr = line.replace(/^data:\s*/, '').trim()
          if (!jsonStr || jsonStr === '[DONE]') return
          try {
            const parsed = JSON.parse(jsonStr)
            const token = parsed.choices?.[0]?.delta?.content || ''
            if (token) {
              fullResponse += token
              sendSSE('model_token', {
                model_name: modelId,
                actual_model_name: mappedModel,
                original_model_name: model,
                content: token,
              })
            }
            if (parsed.usage) {
              inputTokens = parsed.usage.prompt_tokens || inputTokens
              outputTokens = parsed.usage.completion_tokens || outputTokens
            }
          } catch (_) { /* skip */ }
        }

        streamResponse.data.on('data', (chunk: any) => {
          if (clientClosedRef.closed) {
            try { streamResponse.data.destroy() } catch (_) {}
            return
          }
          buffer += chunk.toString()
          const lines = buffer.split('\n')
          buffer = lines.pop() || ''
          for (const line of lines) processLine(line)
        })
        streamResponse.data.on('end', () => {
          if (buffer.trim()) {
            const remaining = buffer.split('\n')
            for (const line of remaining) processLine(line)
          }
          resolve()
        })
        streamResponse.data.on('error', (err: any) => {
          if (clientClosedRef.closed) return resolve()
          reject(err)
        })
      })

      if (providerKey === 'mistral') {
        fullResponse = cleanMistralResponse(fullResponse) || ''
      }
    } else if (providerKey === 'anthropic') {
      const anthropicCouncilBody: Record<string, any> = {
        model: mappedModel,
        max_tokens: 4096,
        messages: [{ role: 'user', content: rolePrompt ? baseCouncilPrompt : councilPrompt }],
        stream: true,
      }
      if (rolePrompt) anthropicCouncilBody.system = rolePrompt

      const streamResponse = await axios.post(
        'https://api.anthropic.com/v1/messages',
        anthropicCouncilBody,
        {
          headers: {
            'x-api-key': apiKey,
            'anthropic-version': '2023-06-01',
            'Content-Type': 'application/json',
          },
          responseType: 'stream',
          timeout: 120000,
        }
      )

      upstreamStream = streamResponse.data

      await new Promise<void>((resolve, reject) => {
        let buffer = ''
        let streamError: string | null = null
        const processLine = (line: string) => {
          if (!line.startsWith('data: ')) return
          const jsonStr = line.replace('data: ', '').trim()
          if (!jsonStr) return
          try {
            const parsed = JSON.parse(jsonStr)
            if (parsed.type === 'content_block_delta') {
              const text = parsed.delta?.text || ''
              if (text) {
                fullResponse += text
                sendSSE('model_token', {
                  model_name: modelId,
                  actual_model_name: mappedModel,
                  original_model_name: model,
                  content: text,
                })
              }
            }
            if (parsed.type === 'message_delta' && parsed.usage) {
              outputTokens = parsed.usage.output_tokens || 0
            }
            if (parsed.type === 'message_start' && parsed.message?.usage) {
              inputTokens = parsed.message.usage.input_tokens || 0
            }
            if (parsed.type === 'error') {
              streamError = parsed.error?.message || 'Anthropic stream error'
            }
          } catch (_) { /* skip */ }
        }
        streamResponse.data.on('data', (chunk: any) => {
          if (clientClosedRef.closed) {
            try { streamResponse.data.destroy() } catch (_) {}
            return
          }
          buffer += chunk.toString()
          const lines = buffer.split('\n')
          buffer = lines.pop() || ''
          for (const line of lines) processLine(line)
        })
        streamResponse.data.on('end', () => {
          if (buffer.trim()) {
            const remaining = buffer.split('\n')
            for (const line of remaining) processLine(line)
          }
          if (streamError && !fullResponse) reject(new Error(streamError))
          else resolve()
        })
        streamResponse.data.on('error', (err: any) => {
          if (clientClosedRef.closed) return resolve()
          reject(err)
        })
      })
    } else if (providerKey === 'google') {
      const isPreviewModel = mappedModel.includes('-preview')
      const apiVersion = isPreviewModel ? 'v1beta' : 'v1'
      const baseUrl = `https://generativelanguage.googleapis.com/${apiVersion}`
      const geminiCouncilBody: Record<string, any> = {
        contents: [{ parts: [{ text: rolePrompt ? baseCouncilPrompt : councilPrompt }] }],
        generationConfig: { maxOutputTokens: 4096 },
      }
      if (rolePrompt) {
        geminiCouncilBody.systemInstruction = { parts: [{ text: rolePrompt }] }
      }
      const streamResponse = await axios.post(
        `${baseUrl}/models/${mappedModel}:streamGenerateContent?key=${apiKey}&alt=sse`,
        geminiCouncilBody,
        { responseType: 'stream' }
      )

      upstreamStream = streamResponse.data

      await new Promise<void>((resolve, reject) => {
        let buffer = ''
        const processLine = (line: string) => {
          if (!line.startsWith('data: ')) return
          const jsonStr = line.replace('data: ', '').trim()
          if (!jsonStr) return
          try {
            const parsed = JSON.parse(jsonStr)
            const text = parsed.candidates?.[0]?.content?.parts?.[0]?.text || ''
            if (text) {
              fullResponse += text
              sendSSE('model_token', {
                model_name: modelId,
                actual_model_name: mappedModel,
                original_model_name: model,
                content: text,
              })
            }
            if (parsed.usageMetadata) {
              inputTokens = parsed.usageMetadata.promptTokenCount || inputTokens
              outputTokens = parsed.usageMetadata.candidatesTokenCount || outputTokens
            }
          } catch (_) { /* skip */ }
        }
        streamResponse.data.on('data', (chunk: any) => {
          if (clientClosedRef.closed) {
            try { streamResponse.data.destroy() } catch (_) {}
            return
          }
          buffer += chunk.toString()
          const lines = buffer.split('\n')
          buffer = lines.pop() || ''
          for (const line of lines) processLine(line)
        })
        streamResponse.data.on('end', () => {
          if (buffer.trim()) {
            const remaining = buffer.split('\n')
            for (const line of remaining) processLine(line)
          }
          resolve()
        })
        streamResponse.data.on('error', (err: any) => {
          if (clientClosedRef.closed) return resolve()
          reject(err)
        })
      })
    } else {
      throw new Error(`Unsupported provider: ${providerKey}`)
    }

    if (clientClosedRef.closed) {
      if (inputTokens === 0) {
        try { inputTokens = await countTokens(councilPrompt, providerKey, mappedModel) } catch (_) {}
      }
      if (outputTokens === 0 && fullResponse) {
        try { outputTokens = await countTokens(fullResponse, providerKey, mappedModel) } catch (_) {}
      }
      tokenSource = (inputTokens > 0 || outputTokens > 0) ? 'estimated' : 'none'
      if (userId) {
        trackUsage(userId, providerKey, model, inputTokens, outputTokens)
      }
      console.log(`[RAG Stream] Client disconnected for ${modelId} — tracked ${inputTokens} input, ${outputTokens} output tokens`)
      return {
        model_name: modelId,
        actual_model_name: mappedModel,
        original_model_name: model,
        response: fullResponse,
        prompt: councilPrompt,
        error: 'Client disconnected',
        tokens: { input: inputTokens, output: outputTokens, total: inputTokens + outputTokens, reasoningTokens, provider: providerKey, model, source: tokenSource },
      }
    }

    if (inputTokens === 0 && outputTokens === 0) {
      inputTokens = await countTokens(councilPrompt, providerKey, mappedModel)
      outputTokens = await countTokens(fullResponse, providerKey, mappedModel)
      tokenSource = 'tokenizer'
    } else {
      tokenSource = 'api_response'
    }

    if (userId && fullResponse) {
      trackUsage(userId, providerKey, model, inputTokens, outputTokens)
    }

    const tokenInfo = userId && fullResponse ? {
      input: inputTokens,
      output: outputTokens,
      total: inputTokens + outputTokens,
      reasoningTokens,
      provider: providerKey,
      model,
      source: tokenSource,
      breakdown: buildTokenBreakdown(query, rawSourcesData?.formatted, inputTokens),
    } : null

    const result = {
      model_name: modelId,
      actual_model_name: mappedModel,
      original_model_name: model,
      response: fullResponse,
      prompt: councilPrompt,
      error: null,
      tokens: tokenInfo,
    }

    sendSSE('model_done', {
      model_name: modelId,
      actual_model_name: mappedModel,
      original_model_name: model,
      response: fullResponse,
      error: null,
      tokens: tokenInfo,
    })
    return result
  } catch (error: any) {
    if (clientClosedRef.closed) {
      if (inputTokens === 0) {
        try { inputTokens = await countTokens(councilPrompt, providerKey, mappedModel) } catch (_) {}
      }
      if (outputTokens === 0 && fullResponse) {
        try { outputTokens = await countTokens(fullResponse, providerKey, mappedModel) } catch (_) {}
      }
      if (userId) {
        trackUsage(userId, providerKey, model, inputTokens, outputTokens)
      }
      console.log(`[RAG Stream] Client disconnected (caught) for ${modelId} — tracked ${inputTokens} input, ${outputTokens} output tokens`)
      return {
        model_name: modelId,
        actual_model_name: mappedModel,
        original_model_name: model,
        response: fullResponse,
        prompt: councilPrompt,
        error: 'Client disconnected',
        tokens: { input: inputTokens, output: outputTokens, total: inputTokens + outputTokens, reasoningTokens, provider: providerKey, model, source: 'estimated' },
      }
    }

    console.error(`[RAG Stream] Error calling ${modelId}:`, error.message)
    const errorResult = {
      model_name: modelId,
      actual_model_name: mappedModel || model,
      original_model_name: model,
      response: '',
      prompt: councilPrompt,
      error: error.message || 'Unknown model error',
      tokens: null,
    }
    sendSSE('model_error', errorResult)
    return errorResult
  }
}

// Helper to track query usage (shared between /api/rag and /api/rag/stream)
async function trackQueryUsage(userId: string | undefined) {
  if (!userId) return
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

  try {
    const queryCost = calculateSerperQueryCost(1)
    await db.userStats.addMonthlyCost(userId, currentMonth, queryCost)
  } catch (costErr) {
    console.error('[RAG] Error updating monthlyUsageCost:', costErr)
  }
}

// POST /api/rag → router.post('/')
router.post('/', async (req: Request, res: Response) => {
  const userId = req.userId
  if (userId) {
    const subscriptionCheck = await checkSubscriptionStatus(userId)
    if (!subscriptionCheck.hasAccess) {
      return sendError(res, 'Active subscription required. Please subscribe to use this service.', 403, {
        subscriptionRequired: true,
        reason: subscriptionCheck.reason
      })
    }
  }

  try {
    const { query, selectedModels, needsContext: needsContextHint } = req.body
    
    if (!query || !query.trim()) {
      return sendError(res, 'Missing required field: query', 400)
    }
    
    if (!selectedModels || !Array.isArray(selectedModels) || selectedModels.length === 0) {
      return sendError(res, 'Missing or empty selectedModels array', 400)
    }
    
    console.log(`[RAG Pipeline] Starting pipeline for: "${query}" with ${selectedModels.length} models`)
    
    const serperApiKey = API_KEYS.serper
    if (!serperApiKey) {
      return sendError(res, 'Serper API key not configured', 400)
    }
    
    const searchQuery = await reformulateSearchQuery(query, userId)
    
    let serperData
    try {
      serperData = await performSerperSearch(searchQuery, 5)
    } catch (serperError: any) {
      console.error('[RAG Pipeline] Serper search failed:', serperError.message)
      return sendError(res, `Serper search failed: ${serperError.message}`, 500, {
        query,
        search_results: [],
        refined_data: null,
        council_responses: [],
      })
    }
    
    const searchResults = (serperData?.organic || []).map((r: any) => ({
      title: r.title,
      link: r.link,
      snippet: r.snippet
    }))

    await trackQueryUsage(userId)
    
    let rawSourcesData
    try {
      rawSourcesData = await formatRawSourcesForPrompt(searchResults, 5)
    } catch (scrapeError: any) {
      console.error('[RAG Pipeline] Source scraping error:', scrapeError.message)
      rawSourcesData = buildSnippetFallback(searchResults)
    }
    if (!rawSourcesData.formatted && searchResults.length > 0) {
      console.warn('[RAG Pipeline] Scraping returned empty content, falling back to snippets')
      rawSourcesData = buildSnippetFallback(searchResults)
    }
    
    let memoryContextString = ''
    let memoryContextItems: any[] = []
    if (userId) {
      const scoreThreshold = needsContextHint ? 0.70 : 0.82
      memoryContextItems = await findRelevantContext(userId, query, 3, scoreThreshold)
      memoryContextString = formatMemoryContext(memoryContextItems)
      if (memoryContextString) {
        console.log(`[RAG Pipeline] Memory: Injecting ${memoryContextItems.length} past conversations as context`)
      }
    }

    const councilPromises = selectedModels.map(async (modelId: any) => {
      const firstDashIndex = modelId.indexOf('-')
      if (firstDashIndex === -1) {
        return { model_name: modelId, response: '', error: 'Invalid model ID format' }
      }
      
      const providerKey = modelId.substring(0, firstDashIndex)
      const model = modelId.substring(firstDashIndex + 1)
      let councilTokenInfo: any = null
      
      const mappedModel = MODEL_MAPPINGS[model] || model
      
      const councilPrompt = `Today's date is ${await getCurrentDateStringForUser(userId)}.
${memoryContextString ? `\n${memoryContextString}` : ''}
Web Sources (background reference material):
${rawSourcesData.formatted}

The above sources are from a real-time web search and may contain useful context. Use them as reference where relevant, but DO NOT cite by number (do not write "source 1", "source 3", etc.). Instead, cite where information came from using the source's publication/site name, title, or URL/domain. Answer primarily from your own knowledge and expertise, and do not limit your response to only what the sources cover.

User Query: ${query}`
      
      try {
        const apiKey = API_KEYS[providerKey]
        if (!apiKey || apiKey.trim() === '') {
          throw new Error(`No API key configured for provider: ${providerKey}`)
        }

        let responseText = ''
        
        if (['openai', 'xai', 'meta', 'deepseek', 'mistral'].includes(providerKey)) {
          const modelsWithFixedTemperature = ['gpt-5-mini']
          const shouldUseDefaultTemperature = modelsWithFixedTemperature.includes(mappedModel) || modelsWithFixedTemperature.includes(model)
          
          const response = await axios.post(
            `${PROVIDER_BASE_URLS[providerKey]}/chat/completions`,
            {
              model: mappedModel,
              messages: [{ role: 'user', content: councilPrompt }],
              ...(shouldUseDefaultTemperature ? {} : { temperature: 0.7 }),
            },
            {
              headers: {
                'Authorization': `Bearer ${apiKey}`,
                'Content-Type': 'application/json',
              },
            }
          )
          
          let content = response.data.choices[0].message.content
          
          if (providerKey === 'mistral') {
            content = cleanMistralResponse(content)
          }
          
          if (typeof content === 'string') {
            responseText = content
          } else if (Array.isArray(content)) {
            responseText = content.map((item: any) => {
              if (typeof item === 'string') return item
              if (item && typeof item === 'object' && item.text) return item.text
              return String(item || '')
            }).join(' ')
          } else if (content && typeof content === 'object') {
            responseText = content.text || content.content || JSON.stringify(content)
          } else {
            responseText = String(content || '')
          }
          
          let inputTokens = 0
          let outputTokens = 0
          let tokenSource = 'none'
          let reasoningTokens = 0
          
          if (userId && responseText) {
            const responseTokens: any = extractTokensFromResponse(response.data, providerKey)
            
            if (responseTokens) {
              inputTokens = responseTokens.inputTokens || 0
              outputTokens = responseTokens.outputTokens || 0
              reasoningTokens = responseTokens.reasoningTokens || 0
              tokenSource = 'api_response'
            } else {
              inputTokens = await countTokens(councilPrompt, providerKey, mappedModel)
              outputTokens = await countTokens(responseText, providerKey, mappedModel)
              tokenSource = 'tokenizer'
            }
            
            trackUsage(userId, providerKey, model, inputTokens, outputTokens)
          }
          
          councilTokenInfo = userId && responseText ? {
            input: inputTokens,
            output: outputTokens,
            total: inputTokens + outputTokens,
            reasoningTokens,
            provider: providerKey,
            model,
            source: tokenSource,
            breakdown: buildTokenBreakdown(query, rawSourcesData?.formatted, inputTokens)
          } : null
          
        } else if (providerKey === 'google') {
          const isPreviewModel = mappedModel.includes('-preview')
          const apiVersion = isPreviewModel ? 'v1beta' : 'v1'
          const baseUrl = `https://generativelanguage.googleapis.com/${apiVersion}`
          
          const response = await axios.post(
            `${baseUrl}/models/${mappedModel}:generateContent?key=${apiKey}`,
            {
              contents: [{ parts: [{ text: councilPrompt }] }],
            },
            {
              headers: { 'Content-Type': 'application/json' },
            }
          )
          
          responseText = response.data.candidates[0].content.parts[0].text
          
          let inputTokens = 0
          let outputTokens = 0
          let tokenSource = 'none'
          
          if (userId && responseText) {
            const responseTokens: any = extractTokensFromResponse(response.data, providerKey)
            
            if (responseTokens) {
              inputTokens = responseTokens.inputTokens || 0
              outputTokens = responseTokens.outputTokens || 0
              tokenSource = 'api_response'
            } else {
              inputTokens = await countTokens(councilPrompt, providerKey, mappedModel)
              outputTokens = await countTokens(responseText, providerKey, mappedModel)
              tokenSource = 'tokenizer'
            }
            
            trackUsage(userId, providerKey, model, inputTokens, outputTokens)
            
            councilTokenInfo = {
              input: inputTokens,
              output: outputTokens,
              total: inputTokens + outputTokens,
              provider: providerKey,
              model,
              source: tokenSource,
              breakdown: buildTokenBreakdown(query, rawSourcesData?.formatted, inputTokens)
            }
          }
        } else if (providerKey === 'anthropic') {
          const response = await axios.post(
            'https://api.anthropic.com/v1/messages',
            {
              model: mappedModel,
              max_tokens: 4096,
              messages: [{ role: 'user', content: councilPrompt }],
            },
            {
              headers: {
                'x-api-key': apiKey,
                'anthropic-version': '2023-06-01',
                'Content-Type': 'application/json',
              },
            }
          )
          
          responseText = response.data.content[0].text
          
          let inputTokens = 0
          let outputTokens = 0
          let tokenSource = 'none'
          
          if (userId && responseText) {
            const responseTokens: any = extractTokensFromResponse(response.data, providerKey)
            
            if (responseTokens) {
              inputTokens = responseTokens.inputTokens || 0
              outputTokens = responseTokens.outputTokens || 0
              tokenSource = 'api_response'
            } else {
              inputTokens = await countTokens(councilPrompt, providerKey, mappedModel)
              outputTokens = await countTokens(responseText, providerKey, mappedModel)
              tokenSource = 'tokenizer'
            }
            
            trackUsage(userId, providerKey, model, inputTokens, outputTokens)
            
            councilTokenInfo = {
              input: inputTokens,
              output: outputTokens,
              total: inputTokens + outputTokens,
              provider: providerKey,
              model,
              source: tokenSource,
              breakdown: buildTokenBreakdown(query, rawSourcesData?.formatted, inputTokens)
            }
          }
        } else {
          throw new Error(`Unsupported provider: ${providerKey}`)
        }
        
        const safeResponseText = typeof responseText === 'string' ? responseText : String(responseText || '')
        
        return {
          model_name: modelId,
          actual_model_name: mappedModel,
          original_model_name: model,
          response: safeResponseText,
          prompt: councilPrompt,
          error: null,
          tokens: councilTokenInfo
        }
      } catch (error: any) {
        console.error(`[RAG Pipeline] Error calling ${modelId}:`, error.message)
        
        let errorMessage = error.message
        if (providerKey === 'mistral') {
          const apiErrorMessage = error.response?.data?.message || error.message || ''
          if (apiErrorMessage.includes('Service tier capacity exceeded') || 
              apiErrorMessage.includes('capacity exceeded') ||
              apiErrorMessage.includes('rate limit') ||
              error.response?.status === 429) {
            errorMessage = 'Mistral API capacity exceeded. The model is currently at capacity. Please try again later or use a different model.'
          }
        }
        
        return {
          model_name: modelId,
          actual_model_name: mappedModel || model,
          original_model_name: model,
          response: '',
          prompt: councilPrompt,
          error: errorMessage
        }
      }
    })
    
    const councilResponses = await Promise.all(councilPromises)

    if (userId) {
      for (const cr of councilResponses) {
        if (cr.response && cr.model_name) {
          storeModelContext(userId, cr.model_name, cr.response, query).catch((err: any) => {
            console.error(`[RAG Pipeline] Error storing initial model context for ${cr.model_name}:`, err)
          })
        }
      }
    }
    
    return sendSuccess(res, {
      query,
      search_results: searchResults,
      refined_data: null,
      council_responses: councilResponses,
      raw_sources: {
        source_count: rawSourcesData.sourceCount,
        scraped_sources: rawSourcesData.scrapedSources,
      },
      memory_context: {
        items: memoryContextItems,
        needsContextHint: !!needsContextHint,
        scoreThreshold: needsContextHint ? 0.70 : 0.82,
        injected: memoryContextItems.length > 0,
      },
    })
  } catch (error: any) {
    console.error('[RAG Pipeline] Error:', error)
    return sendError(res, error.message || 'Unknown error in RAG pipeline')
  }
})

// POST /api/rag/stream → router.post('/stream')
router.post('/stream', async (req: Request, res: Response) => {
  res.setHeader('Content-Type', 'text/event-stream')
  res.setHeader('Cache-Control', 'no-cache')
  res.setHeader('Connection', 'keep-alive')
  res.setHeader('X-Accel-Buffering', 'no')
  res.flushHeaders()

  const clientClosedRef = { closed: false }

  res.on('close', () => {
    if (!res.writableFinished) {
      clientClosedRef.closed = true
    }
  })

  const sendSSE = (type: string, data: any) => {
    if (clientClosedRef.closed) return
    try {
      res.write(`data: ${JSON.stringify({ type, ...data })}\n\n`)
    } catch (_) { /* stream may already be closed */ }
  }

  const heartbeat = setInterval(() => {
    if (clientClosedRef.closed) { clearInterval(heartbeat); return }
    try { res.write(': heartbeat\n\n') } catch (_) { clearInterval(heartbeat) }
  }, 15000)

  try {
    const userId = req.userId
    const { query, selectedModels, needsContext: needsContextHint, rolePrompts } = req.body || {}

    if (userId) {
      const subscriptionCheck = await checkSubscriptionStatus(userId)
      if (!subscriptionCheck.hasAccess) {
        sendSSE('error', {
          message: 'Active subscription required. Please subscribe to use this service.',
          subscriptionRequired: true,
          reason: subscriptionCheck.reason,
        })
        clearInterval(heartbeat)
        return res.end()
      }
    }

    if (!query || !query.trim()) {
      sendSSE('error', { message: 'Missing required field: query' })
      clearInterval(heartbeat)
      return res.end()
    }
    if (!selectedModels || !Array.isArray(selectedModels) || selectedModels.length === 0) {
      sendSSE('error', { message: 'Missing or empty selectedModels array' })
      clearInterval(heartbeat)
      return res.end()
    }

    sendSSE('status', { message: 'Searching the web...' })

    const serperApiKey = API_KEYS.serper
    if (!serperApiKey) {
      sendSSE('error', { message: 'Serper API key not configured' })
      clearInterval(heartbeat)
      return res.end()
    }

    const searchQuery = await reformulateSearchQuery(query, userId)
    const serperData = await performSerperSearch(searchQuery, 5)
    const searchResults = (serperData?.organic || []).map((r: any) => ({
      title: r.title,
      link: r.link,
      snippet: r.snippet,
    }))
    sendSSE('search_results', { search_results: searchResults })

    await trackQueryUsage(userId)

    sendSSE('status', { message: 'Scraping web sources...' })
    let rawSourcesData
    try {
      rawSourcesData = await formatRawSourcesForPrompt(searchResults, 5)
    } catch (scrapeError: any) {
      console.error('[RAG Stream] Source scraping error:', scrapeError.message)
      rawSourcesData = buildSnippetFallback(searchResults)
    }
    if (!rawSourcesData.formatted && searchResults.length > 0) {
      console.warn('[RAG Stream] Scraping returned empty content, falling back to snippets')
      rawSourcesData = buildSnippetFallback(searchResults)
    }

    let memoryContextString = ''
    let memoryContextItems: any[] = []
    if (userId) {
      const scoreThreshold = needsContextHint ? 0.70 : 0.82
      memoryContextItems = await findRelevantContext(userId, query, 3, scoreThreshold)
      memoryContextString = formatMemoryContext(memoryContextItems)
    }

    sendSSE('status', { message: 'Streaming council model responses...' })
    const councilResponses = await Promise.all(
      selectedModels.map((modelId: any) => streamRagCouncilModel({
        modelId,
        query,
        rawSourcesData,
        memoryContextString,
        userId,
        sendSSE,
        rolePrompt: rolePrompts?.[modelId] || null,
        clientClosedRef,
      }))
    )

    if (clientClosedRef.closed) {
      console.log('[RAG Stream] Client disconnected — usage already tracked per-model above')
      clearInterval(heartbeat)
      return
    }

    if (userId) {
      for (const cr of councilResponses) {
        if (cr.response && cr.model_name) {
          storeModelContext(userId, cr.model_name, cr.response, query).catch((err: any) => {
            console.error(`[RAG Stream] Error storing initial model context for ${cr.model_name}:`, err)
          })
        }
      }
    }

    const lightCouncilResponses = councilResponses.map(cr => ({
      model_name: cr.model_name,
      actual_model_name: cr.actual_model_name,
      original_model_name: cr.original_model_name,
      response: cr.response,
      error: cr.error,
      tokens: cr.tokens,
    }))

    sendSSE('done', {
      query,
      search_results: searchResults,
      refined_data: null,
      council_responses: lightCouncilResponses,
      raw_sources: {
        source_count: rawSourcesData.sourceCount,
        scraped_sources: rawSourcesData.scrapedSources,
      },
      memory_context: {
        items: memoryContextItems,
        needsContextHint: !!needsContextHint,
        scoreThreshold: needsContextHint ? 0.70 : 0.82,
        injected: memoryContextItems.length > 0,
      },
    })

    clearInterval(heartbeat)
    res.end()
  } catch (error: any) {
    clearInterval(heartbeat)
    if (clientClosedRef.closed) {
      console.log('[RAG Stream] Client disconnected (caught) — usage already tracked per-model')
      return
    }
    console.error('[RAG Stream] Error:', error)
    sendSSE('error', { message: error.message || 'Unknown error in RAG stream pipeline' })
    res.end()
  }
})

export default router
