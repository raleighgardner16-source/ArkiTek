import { Router } from 'express'
import axios from 'axios'
import { API_KEYS, MODEL_MAPPINGS, PROVIDER_BASE_URLS } from '../config/index.js'
import { countTokens, extractTokensFromResponse } from '../../utils/tokenCounters.js'
import { trackUsage, trackConversationPrompt, getCurrentDateStringForUser } from '../services/usage.js'
import { checkSubscriptionStatusAsync } from '../services/subscription.js'
import { buildTokenBreakdown } from '../helpers/pricing.js'
import { detectCategoryForJudge, storeModelContext } from '../services/context.js'
import { findRelevantContext, formatMemoryContext } from '../services/memory.js'
import { performSerperSearch, buildSearchContextSnippet, reformulateSearchQuery, formatRawSourcesForPrompt } from '../services/search.js'
import db from '../../database/db.js'

const router = Router()

router.get('/context', async (req, res) => {
  try {
    const { userId, modelName } = req.query
    
    if (!userId || !modelName) {
      return res.status(400).json({ error: 'userId and modelName query parameters are required' })
    }
    
    const decodedUserId = decodeURIComponent(userId)
    const decodedModelName = decodeURIComponent(modelName)
    console.log(`[Model Context] Fetching context for userId: ${decodedUserId}, model: ${decodedModelName}`)
    
    const userUsage = await db.usage.getOrDefault(decodedUserId)
    const allModelContexts = userUsage.modelConversationContext || {}
    const context = (allModelContexts[decodedModelName] || []).slice(0, 5)
    
    console.log(`[Model Context] Found ${context.length} context entries for ${decodedModelName}`)
    res.json({ context })
  } catch (error) {
    console.error('[Model Context] Error fetching context:', error)
    res.status(500).json({ error: 'Failed to fetch model conversation context: ' + error.message })
  }
})

router.post('/clear-context', async (req, res) => {
  try {
    const { userId, modelName } = req.body
    
    if (!userId) {
      return res.status(400).json({ error: 'userId is required' })
    }
    
    const userUsage = await db.usage.getOrDefault(userId)
    if (userUsage.modelConversationContext) {
      if (modelName) {
        delete userUsage.modelConversationContext[modelName]
        console.log(`[Model Context] Cleared context for model ${modelName}, user ${userId}`)
      } else {
        userUsage.modelConversationContext = {}
        console.log(`[Model Context] Cleared all model contexts for user ${userId}`)
      }
      await db.usage.update(userId, { modelConversationContext: userUsage.modelConversationContext })
    }
    
    res.json({ success: true, message: 'Model context cleared' })
  } catch (error) {
    console.error('[Model Context] Error clearing context:', error)
    res.status(500).json({ error: 'Failed to clear model conversation context: ' + error.message })
  }
})

router.post('/conversation/stream', async (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream')
  res.setHeader('Cache-Control', 'no-cache')
  res.setHeader('Connection', 'keep-alive')
  res.setHeader('X-Accel-Buffering', 'no')
  res.flushHeaders()

  const sendSSE = (type, data) => {
    res.write(`data: ${JSON.stringify({ type, ...data })}\n\n`)
  }

  const heartbeat = setInterval(() => {
    try { res.write(': heartbeat\n\n') } catch (e) { clearInterval(heartbeat) }
  }, 15000)

  try {
    const { userId, modelName, userMessage, originalResponse, responseId, isCouncilFollowUp } = req.body

    if (!userId || !modelName || !userMessage) {
      sendSSE('error', { message: 'userId, modelName, and userMessage are required' })
      clearInterval(heartbeat)
      return res.end()
    }

    const subscriptionCheck = await checkSubscriptionStatusAsync(userId)
    if (!subscriptionCheck.hasAccess) {
      sendSSE('error', { message: 'Active subscription required.', subscriptionRequired: true })
      clearInterval(heartbeat)
      return res.end()
    }

    console.log(`[Model Conversation Stream] Processing message for model: ${modelName}`)

    const parts = modelName.split('-')
    const provider = parts[0]
    const model = parts.slice(1).join('-')

    sendSSE('status', { message: 'Analyzing query...' })
    const { category, needsSearch, needsContext } = await detectCategoryForJudge(userMessage, userId)
    console.log(`[Model Conversation Stream] Category: ${category}, Needs Search: ${needsSearch}, Needs Context: ${needsContext}`)

    let memoryContextString = ''
    let memoryContextItems = []
    if (userId) {
      const scoreThreshold = needsContext ? 0.70 : 0.82
      memoryContextItems = await findRelevantContext(userId, userMessage, 3, scoreThreshold, modelName)
      memoryContextString = formatMemoryContext(memoryContextItems)
      if (memoryContextString) {
        console.log(`[Model Conversation Stream] Memory: Injecting ${memoryContextItems.length} past conversations as context (model-specific: ${modelName})`)
      }
    }

    const userUsage = await db.usage.getOrDefault(userId)
    const allModelContexts = userUsage.modelConversationContext || {}
    const contextSummaries = (allModelContexts[modelName] || []).slice(0, 5)

    let rawSourcesData = null
    let searchResults = []

    if (needsSearch) {
      sendSSE('status', { message: 'Searching the web...' })
      const serperApiKey = API_KEYS.serper
      if (serperApiKey) {
        try {
          const searchContextSnippet = buildSearchContextSnippet(contextSummaries, originalResponse)
          const searchQuery = await reformulateSearchQuery(userMessage, userId, searchContextSnippet)
          const serperData = await performSerperSearch(searchQuery, 5)
          searchResults = (serperData?.organic || []).map(r => ({
            title: r.title, link: r.link, snippet: r.snippet
          }))
          if (searchResults.length > 0) {
            sendSSE('status', { message: 'Reading sources...' })
            rawSourcesData = await formatRawSourcesForPrompt(searchResults, 5)
            console.log(`[Model Conversation Stream] Raw sources scraped: ${rawSourcesData.sourceCount} sources`)
          }
        } catch (searchError) {
          console.error('[Model Conversation Stream] Search/scrape error:', searchError)
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

    const conversationMessages = []
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

    console.log(`[Model Conversation Stream] Built ${conversationMessages.length} conversation messages (${contextSummaries.length} context entries)`)

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

      await new Promise((resolve, reject) => {
        streamResponse.data.on('data', (chunk) => {
          const lines = chunk.toString().split('\n').filter(l => l.trim().startsWith('data:'))
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

      await new Promise((resolve, reject) => {
        let buffer = ''
        let streamError = null
        const processAnthropicConvoLine = (line) => {
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
                console.error(`[Model Conversation Stream] Anthropic stream error event:`, parsed.error || parsed)
                streamError = parsed.error?.message || 'Anthropic stream error'
              }
            } catch (e) { /* skip */ }
          }
        }
        streamResponse.data.on('data', (chunk) => {
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
        streamResponse.data.on('error', (err) => {
          console.error(`[Model Conversation Stream] Anthropic stream connection error:`, err.message)
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

      await new Promise((resolve, reject) => {
        let buffer = ''
        const processGoogleConvoLine = (line) => {
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
        streamResponse.data.on('data', (chunk) => {
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
      console.error(`[Model Conversation Stream] Error storing context for ${modelName}:`, err)
    })

    console.log(`[Model Conversation Stream] Response generated for ${modelName}, tokens: ${inputTokens}/${outputTokens}`)

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

  } catch (error) {
    clearInterval(heartbeat)
    if (error.response?.data) {
      try { console.error('[Model Conversation Stream] API Error:', JSON.stringify(error.response.data)) } catch (e) { console.error('[Model Conversation Stream] API Error (non-serializable):', error.response.status, error.response.statusText) }
    } else {
      console.error('[Model Conversation Stream] Error:', error.message)
    }
    sendSSE('error', { message: 'Failed to get model response: ' + (error.response?.data?.error?.message || error.message) })
    res.end()
  }
})

router.post('/conversation', async (req, res) => {
  try {
    const { userId, modelName, userMessage, originalResponse, responseId, isCouncilFollowUp } = req.body
    
    if (!userId || !modelName || !userMessage) {
      return res.status(400).json({ error: 'userId, modelName, and userMessage are required' })
    }
    
    const subscriptionCheck = await checkSubscriptionStatusAsync(userId)
    if (!subscriptionCheck.hasAccess) {
      return res.status(403).json({ 
        error: 'Active subscription required. Please subscribe to use this service.',
        subscriptionRequired: true,
        reason: subscriptionCheck.reason
      })
    }
    
    console.log(`[Model Conversation] Processing message for model: ${modelName}`)
    
    const parts = modelName.split('-')
    const provider = parts[0]
    const model = parts.slice(1).join('-')
    
    const { category, needsSearch, needsContext } = await detectCategoryForJudge(userMessage, userId)
    console.log(`[Model Conversation] Category: ${category}, Needs Search: ${needsSearch}, Needs Context: ${needsContext}`)
    
    let memoryContextString = ''
    let memoryContextItems = []
    if (userId) {
      const scoreThreshold = needsContext ? 0.70 : 0.82
      memoryContextItems = await findRelevantContext(userId, userMessage, 3, scoreThreshold, modelName)
      memoryContextString = formatMemoryContext(memoryContextItems)
      if (memoryContextString) {
        console.log(`[Model Conversation] Memory: Injecting ${memoryContextItems.length} past conversations as context (model-specific: ${modelName})`)
      }
    }
    
    const userUsage = await db.usage.getOrDefault(userId)
    const allModelContexts = userUsage.modelConversationContext || {}
    const contextSummaries = (allModelContexts[modelName] || []).slice(0, 5)

    let rawSourcesData = null
    let searchResults = []
    
    if (needsSearch) {
      console.log(`[Model Conversation] Search needed for ${modelName}, fetching raw sources...`)
      
      const serperApiKey = API_KEYS.serper
      if (serperApiKey) {
        try {
          const searchContextSnippet = buildSearchContextSnippet(contextSummaries, originalResponse)
          const searchQuery = await reformulateSearchQuery(userMessage, userId, searchContextSnippet)
          const serperData = await performSerperSearch(searchQuery, 5)
          searchResults = (serperData?.organic || []).map(r => ({
            title: r.title,
            link: r.link,
            snippet: r.snippet
          }))
          
          console.log(`[Model Conversation] Search completed, found ${searchResults.length} results`)
          
          if (searchResults.length > 0) {
            rawSourcesData = await formatRawSourcesForPrompt(searchResults, 5)
            console.log(`[Model Conversation] Raw sources scraped: ${rawSourcesData.sourceCount} sources`)
          }
        } catch (searchError) {
          console.error('[Model Conversation] Search/scrape error:', searchError)
        }
      } else {
        console.warn('[Model Conversation] Serper API key not configured, skipping search')
      }
    }
    
    let prompt = `Today's date is ${await getCurrentDateStringForUser(userId)}. You have access to real-time web search — when source content is provided below, read and parse it yourself to answer the user's question. Do NOT tell the user you cannot search the web or ask them for permission. The search has already been performed for you and the source content is included in this prompt. Answer confidently using the provided data. If citing sources, cite publication/site/title or URL/domain and NEVER use numeric labels like "source 1" or "source 3".\n\n`
    
    if (memoryContextString) {
      prompt += memoryContextString + '\n'
    }
    
    if (contextSummaries.length > 0) {
      const contextString = contextSummaries.map((ctx, idx) => {
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
      console.log(`[Model Conversation] Model mapping: "${model}" -> "${mappedModel}"`)
    }
    
    if (['openai', 'xai', 'meta', 'deepseek', 'mistral'].includes(provider)) {
      const apiKey = API_KEYS[provider]
      if (!apiKey) {
        return res.status(400).json({ error: `${provider} API key not configured` })
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
        return res.status(400).json({ error: 'Anthropic API key not configured' })
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
        return res.status(400).json({ error: 'Google API key not configured' })
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
      return res.status(400).json({ error: `Unsupported provider: ${provider}` })
    }
    
    trackUsage(userId, provider, model, inputTokens, outputTokens)
    
    if (!isCouncilFollowUp) {
      await trackConversationPrompt(userId, userMessage)
    }
    
    storeModelContext(userId, modelName, responseText, userMessage).catch(err => {
      console.error(`[Model Conversation] Error storing context for ${modelName}:`, err)
    })
    
    console.log(`[Model Conversation] Response generated for ${modelName}, tokens: ${inputTokens}/${outputTokens}, usedSearch: ${needsSearch && rawSourcesData !== null}`)
    
    res.json({
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
    
  } catch (error) {
    if (error.response?.data) {
      try { console.error('[Model Conversation] API Error Response:', JSON.stringify(error.response.data)) } catch (e) { console.error('[Model Conversation] API Error (non-serializable):', error.response.status, error.response.statusText) }
      console.error('[Model Conversation] Status:', error.response.status)
    } else {
      console.error('[Model Conversation] Error:', error.message)
    }
    res.status(500).json({ error: 'Failed to get model response: ' + (error.response?.data?.error?.message || error.message) })
  }
})

export default router
