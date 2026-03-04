import { Router, type Request, type Response } from 'express'
import axios from 'axios'
import { API_KEYS, MODEL_MAPPINGS, PROVIDER_BASE_URLS, ANTHROPIC_DEFAULT_SYSTEM_PROMPT } from '../config/index.js'
import { countTokens, extractTokensFromResponse } from '../helpers/tokenCounters.js'
import { trackUsage } from '../services/usage.js'
import { checkSubscriptionStatusAsync } from '../services/subscription.js'
import { cleanMistralResponse } from '../services/search.js'
import { createLogger } from '../config/logger.js'
import { sendSuccess, sendError } from '../types/api.js'

const log = createLogger('llm')
const router = Router()

// POST /api/llm → router.post('/')
router.post('/', async (req: Request, res: Response) => {
  const userId = req.userId
  const { provider, model, prompt, isSummary, geminiThinkingLevel, images } = req.body || {}
  let apiKey = null
  let responseText = null
  
  try {
    log.debug({ provider, model, promptLength: prompt?.length, isSummary: isSummary || false }, 'Received LLM request')

    if (!provider || !model || !prompt) {
      return sendError(res, 'Missing required fields: provider, model, or prompt', 400)
    }

    if (!isSummary && userId) {
      const subscriptionCheck = await checkSubscriptionStatusAsync(userId)
      if (!subscriptionCheck.hasAccess) {
        return sendError(res, subscriptionCheck.usageExhausted ? (subscriptionCheck.reason ?? 'Usage exhausted') : 'Active subscription required. Please subscribe to use this service.', 403, {
          subscriptionRequired: !subscriptionCheck.usageExhausted,
          usageExhausted: subscriptionCheck.usageExhausted || false,
          planType: subscriptionCheck.planType || null,
          reason: subscriptionCheck.reason
        })
      }
    }

    apiKey = API_KEYS[provider]
    if (!apiKey || apiKey.trim() === '') {
      return sendError(res, `No API key configured for provider: ${provider}. Please add it to the backend .env file.`, 400)
    }

    let response

    const mappedModel = MODEL_MAPPINGS[model] || model
    
    if (MODEL_MAPPINGS[model]) {
      log.debug({ model, mappedModel }, 'Model mapping')
    }

    if (['openai', 'xai', 'meta', 'deepseek', 'mistral'].includes(provider)) {
      try {
        log.debug({ provider, model, mappedModel, apiKeyLength: apiKey?.length }, 'LLM API call')
        
        if (provider === 'xai') {
          try {
            const modelsResponse = await axios.get(
              `${PROVIDER_BASE_URLS[provider]}/models`,
              { headers: { 'Authorization': `Bearer ${apiKey}` } }
            )
            const availableModels = modelsResponse.data?.data?.map((m: any) => m.id) || []
            log.debug({ availableModels }, 'Available xAI models')
          } catch (listError) {
            log.debug({ err: listError }, 'Could not list xAI models (this is okay)')
          }
        }
        
        const modelsWithFixedTemperature = ['gpt-5-mini']
        const shouldUseDefaultTemperature = modelsWithFixedTemperature.includes(mappedModel) || modelsWithFixedTemperature.includes(model)
        
        const hasImgs = Array.isArray(images) && images.length > 0
        let userContent: any = prompt
        if (hasImgs) {
          userContent = [
            { type: 'text', text: prompt },
            ...images.map((img: any) => ({
              type: 'image_url',
              image_url: { url: `data:${img.mimeType};base64,${img.base64}` },
            })),
          ]
        }

        const apiRequestBody = {
          model: mappedModel,
          messages: [{ role: 'user', content: userContent }],
          ...(shouldUseDefaultTemperature ? {} : { temperature: 0.7 }),
        }
        
        response = await axios.post(
          `${PROVIDER_BASE_URLS[provider]}/chat/completions`,
          apiRequestBody,
          {
            headers: {
              'Authorization': `Bearer ${apiKey}`,
              'Content-Type': 'application/json',
            },
            maxContentLength: Infinity,
            maxBodyLength: Infinity,
          }
        )
        
        log.debug({ mappedModel }, 'API call successful')

        let rawContent = response.data.choices[0].message.content
        
        if (provider === 'mistral') {
          rawContent = cleanMistralResponse(rawContent)
        }
        
        responseText = rawContent
        
        if (userId && responseText) {
          let inputTokens = 0
          let outputTokens = 0
          
          const responseTokens: any = extractTokensFromResponse(response.data, provider)
          if (responseTokens) {
            inputTokens = responseTokens.inputTokens || 0
            outputTokens = responseTokens.outputTokens || 0
            const totalTokens = responseTokens.totalTokens || (inputTokens + outputTokens)
            log.debug({ provider, model, inputTokens, outputTokens, total: totalTokens }, 'Token tracking: using API response')
          } else {
            inputTokens = await countTokens(prompt, provider, mappedModel)
            outputTokens = await countTokens(responseText, provider, mappedModel)
            log.debug({ provider, model, inputTokens, outputTokens }, 'Token tracking: counted via tokenizer')
          }
          
          trackUsage(userId, provider, model, inputTokens, outputTokens)
          
          const totalTokens = responseTokens?.totalTokens || (inputTokens + outputTokens)
          
          return sendSuccess(res, { 
            text: responseText,
            model: mappedModel,
            originalModel: model,
            tokens: {
              input: inputTokens || 0,
              output: outputTokens || 0,
              total: totalTokens,
              provider,
              model,
              source: responseTokens ? 'api_response' : 'tokenizer'
            }
          })
        } else {
          return sendSuccess(res, { 
            text: responseText,
            model: mappedModel,
            originalModel: model,
            tokens: null
          })
        }
      } catch (apiError: any) {
        log.error({
          err: apiError,
          provider,
          originalModel: model,
          mappedModel,
          status: apiError.response?.status,
          data: apiError.response?.data,
        }, `${provider} API error`)
        
        if (provider === 'mistral') {
          const errorMessage = apiError.response?.data?.message || apiError.message || ''
          if (errorMessage.includes('Service tier capacity exceeded') || 
              errorMessage.includes('capacity exceeded') ||
              errorMessage.includes('rate limit') ||
              apiError.response?.status === 429) {
            return sendError(res, 'Mistral API capacity exceeded. The model is currently at capacity. Please try again later or use a different model.', 503, {
              model: mappedModel,
              originalModel: model,
              retryAfter: apiError.response?.headers?.['retry-after'] || null
            })
          }
        }
        
        if (provider === 'xai' && apiError.response?.status === 404) {
          const modelMap: Record<string, string[]> = {
            'grok-4-1-fast-reasoning': ['grok-beta', 'grok-2-1212'],
            'grok-4-1-fast-non-reasoning': ['grok-beta', 'grok-2-1212'],
            'grok-4-heavy': ['grok-beta', 'grok-2-1212'],
            'grok-4-fast-reasoning': ['grok-beta', 'grok-2-1212'],
            'grok-4-fast-non-reasoning': ['grok-beta', 'grok-2-1212'],
          }
          
          const fallbackModels = modelMap[model] || ['grok-beta', 'grok-2-1212', 'grok-vision-beta']
          
          for (const fallbackModel of fallbackModels) {
            if (mappedModel === fallbackModel) continue
            log.info({ fallbackModel, originalModel: model }, 'Trying fallback model')
            try {
              response = await axios.post(
                `${PROVIDER_BASE_URLS[provider]}/chat/completions`,
                {
                  model: fallbackModel,
                  messages: [{ role: 'user', content: prompt }],
                  temperature: 0.7,
                },
                {
                  headers: {
                    'Authorization': `Bearer ${apiKey}`,
                    'Content-Type': 'application/json',
                  },
                }
              )
              log.info({ fallbackModel }, 'Successfully used fallback model')
              responseText = response.data.choices[0].message.content
              
              let inputTokens = 0
              let outputTokens = 0
              let tokenSource = 'none'
              
              if (userId && responseText) {
                const responseTokens: any = extractTokensFromResponse(response.data, provider)
                
                if (responseTokens) {
                  inputTokens = responseTokens.inputTokens || 0
                  outputTokens = responseTokens.outputTokens || 0
                  tokenSource = 'api_response'
                } else {
                  inputTokens = await countTokens(prompt, provider, fallbackModel)
                  outputTokens = await countTokens(responseText, provider, fallbackModel)
                  tokenSource = 'tokenizer'
                }
                
                trackUsage(userId, provider, fallbackModel, inputTokens, outputTokens)
              }
              
              return sendSuccess(res, { 
                text: responseText,
                model: fallbackModel,
                originalModel: model,
                tokens: userId && responseText ? {
                  input: inputTokens,
                  output: outputTokens,
                  total: inputTokens + outputTokens,
                  provider,
                  model: fallbackModel,
                  source: tokenSource
                } : null
              })
            } catch (fallbackError: any) {
              log.warn({ err: fallbackError, fallbackModel, data: fallbackError.response?.data }, 'Fallback model also failed')
              continue
            }
          }
        }
        
        throw apiError
      }
    }

    if (provider === 'anthropic') {
      log.debug({ mappedModel, model }, 'Calling Anthropic')
      
      const hasImgs = Array.isArray(images) && images.length > 0
      let anthropicContent: any = prompt
      if (hasImgs) {
        anthropicContent = [
          ...images.map((img: any) => ({
            type: 'image',
            source: { type: 'base64', media_type: img.mimeType, data: img.base64 },
          })),
          { type: 'text', text: prompt },
        ]
      }

      try {
        response = await axios.post(
          'https://api.anthropic.com/v1/messages',
          {
            model: mappedModel,
            max_tokens: 1024,
            system: ANTHROPIC_DEFAULT_SYSTEM_PROMPT,
            messages: [{ role: 'user', content: anthropicContent }],
          },
          {
            headers: {
              'x-api-key': apiKey,
              'anthropic-version': '2023-06-01',
              'Content-Type': 'application/json',
            },
            maxContentLength: Infinity,
            maxBodyLength: Infinity,
          }
        )

        if (response.data.content && response.data.content.length > 0) {
          responseText = response.data.content[0].text
          
          let inputTokens = 0
          let outputTokens = 0
          let tokenSource = 'none'
          
          if (userId && responseText) {
            const responseTokens: any = extractTokensFromResponse(response.data, provider)
            
            if (responseTokens) {
              inputTokens = responseTokens.inputTokens || 0
              outputTokens = responseTokens.outputTokens || 0
              tokenSource = 'api_response'
            } else {
              inputTokens = await countTokens(prompt, provider, mappedModel)
              outputTokens = await countTokens(responseText, provider, mappedModel)
              tokenSource = 'tokenizer'
            }
            
            trackUsage(userId, provider, model, inputTokens, outputTokens)
          }
          
          return sendSuccess(res, { 
            text: responseText,
            model: mappedModel,
            originalModel: model,
            tokens: userId && responseText ? {
              input: inputTokens,
              output: outputTokens,
              total: inputTokens + outputTokens,
              provider,
              model,
              source: tokenSource
            } : null
          })
        }
        throw new Error('No content in response')
      } catch (anthropicError: any) {
        log.error({
          err: anthropicError,
          model,
          status: anthropicError.response?.status,
          data: anthropicError.response?.data,
        }, 'Anthropic API error')
        
        if (anthropicError.response?.status === 404) {
          const apiErrorMsg = anthropicError.response?.data?.error?.message || 'Model not found'
          throw new Error(`Anthropic API Error: ${apiErrorMsg}. The model "${model}" may not exist or may have been deprecated.`)
        }
        
        throw anthropicError
      }
    }

    if (provider === 'google') {
      const mappedGeminiModel = mappedModel
      const isPreviewModel = mappedGeminiModel.includes('-preview')
      const apiVersion = isPreviewModel ? 'v1beta' : 'v1'
      const baseUrl = `https://generativelanguage.googleapis.com/${apiVersion}`
      const endpoint = `/models/${mappedGeminiModel}:generateContent`

      const hasImgs = Array.isArray(images) && images.length > 0
      const geminiParts: any[] = [{ text: prompt }]
      if (hasImgs) {
        for (const img of images) {
          geminiParts.push({
            inline_data: { mime_type: img.mimeType, data: img.base64 },
          })
        }
      }

      const geminiRequestBody: Record<string, any> = {
        contents: [{ parts: geminiParts }],
      }
      if (geminiThinkingLevel && ['low', 'medium', 'high'].includes(geminiThinkingLevel.toLowerCase())) {
        geminiRequestBody.generationConfig = {
          thinkingConfig: { thinkingLevel: geminiThinkingLevel.toUpperCase() },
        }
      }

      try {
        response = await axios.post(
          `${baseUrl}${endpoint}`,
          geminiRequestBody,
          {
            headers: {
              'x-goog-api-key': apiKey,
              'Content-Type': 'application/json',
            },
            maxContentLength: Infinity,
            maxBodyLength: Infinity,
          }
        )
      } catch (headerError: any) {
        log.warn({ err: headerError, status: headerError.response?.status }, 'Google API header auth failed')
        
        try {
          response = await axios.post(
            `${baseUrl}${endpoint}?key=${apiKey}`,
            geminiRequestBody,
            {
              headers: {
                'Content-Type': 'application/json',
              },
            }
          )
        } catch (queryError) {
          log.error({ err: queryError }, 'Google API query param auth also failed')
          throw queryError
        }
      }

      responseText = response.data.candidates[0].content.parts[0].text
      
      let inputTokens = 0
      let outputTokens = 0
      let totalTokens = 0
      let tokenSource = 'none'
      let responseTokens: any = null
      
      if (responseText) {
        responseTokens = extractTokensFromResponse(response.data, provider)
        
        if (responseTokens) {
          inputTokens = responseTokens.inputTokens || 0
          outputTokens = responseTokens.outputTokens || 0
          totalTokens = responseTokens.totalTokens || (inputTokens + outputTokens)
          tokenSource = 'api_response'
        } else {
          inputTokens = await countTokens(prompt, provider, mappedModel)
          outputTokens = await countTokens(responseText, provider, mappedModel)
          totalTokens = inputTokens + outputTokens
          tokenSource = 'tokenizer'
        }
        
        if (userId) {
          trackUsage(userId, provider, model, inputTokens, outputTokens)
        }
      }
      
      return sendSuccess(res, { 
        text: responseText,
        model: mappedModel,
        originalModel: model,
        tokens: responseText ? {
          input: inputTokens,
          output: outputTokens,
          total: totalTokens,
          reasoningTokens: responseTokens?.reasoningTokens || 0,
          provider,
          model,
          source: tokenSource
        } : null
      })
    }

    return sendError(res, `Unknown provider: ${provider}`, 400)
  } catch (error: any) {
    log.error({ err: error }, 'LLM proxy error')
    
    const requestProvider = req.body?.provider || provider
    const requestModel = req.body?.model || model
    
    let errorMessage = error.response?.data?.error?.message 
      || error.response?.data?.message
      || error.message
      || 'Unknown error occurred'
    
    const status = error.response?.status
    if (status === 401) {
      errorMessage = `Unauthorized (401): Invalid API key for ${requestProvider}.`
    } else if (status === 400) {
      errorMessage = `Bad Request (400): ${errorMessage}. Check if the model name "${requestModel}" is correct for ${requestProvider}.`
    } else if (status === 404) {
      errorMessage = `Not Found (404): Model "${requestModel}" not found for ${requestProvider}.`
    } else if (status === 503 || status === 429 || status === 529) {
      errorMessage = `⚠️ ${requestModel} is currently experiencing high demand and is temporarily unavailable. Please try again in a moment or select a different model.`
    }

    return sendError(res, errorMessage, status || 500, {
      status,
      model: requestModel,
      provider: requestProvider
    })
  }
})

// POST /api/llm/stream → router.post('/stream')
router.post('/stream', async (req: Request, res: Response) => {
  res.setHeader('Content-Type', 'text/event-stream')
  res.setHeader('Cache-Control', 'no-cache')
  res.setHeader('Connection', 'keep-alive')
  res.setHeader('X-Accel-Buffering', 'no')
  res.flushHeaders()

  let clientClosed = false
  let upstreamStream: any = null

  res.on('close', () => {
    if (!res.writableFinished) {
      clientClosed = true
      if (upstreamStream) {
        try { upstreamStream.destroy() } catch (_) {}
      }
    }
  })

  const sendSSE = (type: string, data: any) => {
    if (clientClosed) return
    try {
      res.write(`data: ${JSON.stringify({ type, ...data })}\n\n`)
    } catch (_) {}
  }

  const heartbeat = setInterval(() => {
    if (clientClosed) { clearInterval(heartbeat); return }
    try { res.write(': heartbeat\n\n') } catch (e) { clearInterval(heartbeat) }
  }, 15000)

  const userId = req.userId
  const { provider, model, prompt, isSummary, rolePrompt, geminiThinkingLevel, images } = req.body || {}
  const mappedModel = MODEL_MAPPINGS[model] || model
  let fullResponse = ''
  let inputTokens = 0
  let outputTokens = 0
  const hasImages = Array.isArray(images) && images.length > 0

  try {
    if (!provider || !model || !prompt) {
      sendSSE('error', { message: 'Missing required fields: provider, model, or prompt' })
      clearInterval(heartbeat)
      return res.end()
    }

    if (!isSummary && userId) {
      const subscriptionCheck = await checkSubscriptionStatusAsync(userId)
      if (!subscriptionCheck.hasAccess) {
        sendSSE('error', { message: 'Active subscription required.', subscriptionRequired: true })
        clearInterval(heartbeat)
        return res.end()
      }
    }

    const apiKey = API_KEYS[provider]
    if (!apiKey || apiKey.trim() === '') {
      sendSSE('error', { message: `No API key configured for provider: ${provider}` })
      clearInterval(heartbeat)
      return res.end()
    }

    if (['openai', 'xai', 'meta', 'deepseek', 'mistral'].includes(provider)) {
      const modelsWithFixedTemperature = ['gpt-5-mini']
      const shouldUseDefaultTemperature = modelsWithFixedTemperature.includes(mappedModel) || modelsWithFixedTemperature.includes(model)

      const messages: any[] = []
      if (rolePrompt) messages.push({ role: 'system', content: rolePrompt })

      if (hasImages) {
        const contentParts: any[] = [{ type: 'text', text: prompt }]
        for (const img of images) {
          contentParts.push({
            type: 'image_url',
            image_url: { url: `data:${img.mimeType};base64,${img.base64}` },
          })
        }
        messages.push({ role: 'user', content: contentParts })
      } else {
        messages.push({ role: 'user', content: prompt })
      }

      const streamResponse = await axios.post(
        `${PROVIDER_BASE_URLS[provider]}/chat/completions`,
        {
          model: mappedModel,
          messages,
          ...(shouldUseDefaultTemperature ? {} : { temperature: 0.7 }),
          stream: true,
          stream_options: { include_usage: true }
        },
        {
          headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
          responseType: 'stream',
          maxContentLength: Infinity,
          maxBodyLength: Infinity,
        }
      )

      upstreamStream = streamResponse.data

      await new Promise<void>((resolve, reject) => {
        streamResponse.data.on('data', (chunk: any) => {
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

      if (provider === 'mistral') {
        fullResponse = cleanMistralResponse(fullResponse) as string
      }

    } else if (provider === 'anthropic') {
      let anthropicUserContent: any = prompt
      if (hasImages) {
        const contentParts: any[] = []
        for (const img of images) {
          contentParts.push({
            type: 'image',
            source: { type: 'base64', media_type: img.mimeType, data: img.base64 },
          })
        }
        contentParts.push({ type: 'text', text: prompt })
        anthropicUserContent = contentParts
      }

      const anthropicBody: Record<string, any> = {
        model: mappedModel,
        max_tokens: 4096,
        system: rolePrompt || ANTHROPIC_DEFAULT_SYSTEM_PROMPT,
        messages: [{ role: 'user', content: anthropicUserContent }],
        stream: true
      }

      const streamResponse = await axios.post(
        'https://api.anthropic.com/v1/messages',
        anthropicBody,
        {
          headers: {
            'x-api-key': apiKey,
            'anthropic-version': '2023-06-01',
            'Content-Type': 'application/json'
          },
          responseType: 'stream',
          timeout: 120000,
          maxContentLength: Infinity,
          maxBodyLength: Infinity,
        }
      )

      upstreamStream = streamResponse.data

      await new Promise<void>((resolve, reject) => {
        let buffer = ''
        let streamError: string | null = null
        const processAnthropicLine = (line: string) => {
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
        streamResponse.data.on('data', (chunk: any) => {
          buffer += chunk.toString()
          const lines = buffer.split('\n')
          buffer = lines.pop() || ''
          for (const line of lines) {
            processAnthropicLine(line)
          }
        })
        streamResponse.data.on('end', () => {
          if (buffer.trim()) {
            const remaining = buffer.split('\n')
            for (const line of remaining) {
              processAnthropicLine(line)
            }
          }
          if (streamError && !fullResponse) {
            reject(new Error(streamError))
          } else {
            resolve()
          }
        })
        streamResponse.data.on('error', (err: any) => {
          log.error({ err }, 'Anthropic stream connection error')
          reject(err)
        })
      })

    } else if (provider === 'google') {
      const isPreviewModel = mappedModel.includes('-preview')
      const apiVersion = isPreviewModel ? 'v1beta' : 'v1'
      const baseUrl = `https://generativelanguage.googleapis.com/${apiVersion}`

      const geminiParts: any[] = [{ text: prompt }]
      if (hasImages) {
        for (const img of images) {
          geminiParts.push({
            inline_data: { mime_type: img.mimeType, data: img.base64 },
          })
        }
      }

      const geminiBody: Record<string, any> = {
        contents: [{ parts: geminiParts }],
      }
      if (rolePrompt) {
        geminiBody.systemInstruction = { parts: [{ text: rolePrompt }] }
      }
      if (geminiThinkingLevel && ['low', 'medium', 'high'].includes(geminiThinkingLevel.toLowerCase())) {
        geminiBody.generationConfig = {
          ...geminiBody.generationConfig,
          thinkingConfig: { thinkingLevel: geminiThinkingLevel.toUpperCase() },
        }
        log.debug({ model, thinkingLevel: geminiThinkingLevel.toUpperCase() }, 'Gemini thinking level set')
      }

      const streamResponse = await axios.post(
        `${baseUrl}/models/${mappedModel}:streamGenerateContent?key=${apiKey}&alt=sse`,
        geminiBody,
        { responseType: 'stream', maxContentLength: Infinity, maxBodyLength: Infinity }
      )

      upstreamStream = streamResponse.data

      await new Promise<void>((resolve, reject) => {
        let buffer = ''
        const processGoogleLine = (line: string) => {
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
        streamResponse.data.on('data', (chunk: any) => {
          buffer += chunk.toString()
          const lines = buffer.split('\n')
          buffer = lines.pop() || ''
          for (const line of lines) {
            processGoogleLine(line)
          }
        })
        streamResponse.data.on('end', () => {
          if (buffer.trim()) {
            const remaining = buffer.split('\n')
            for (const line of remaining) {
              processGoogleLine(line)
            }
          }
          resolve()
        })
        streamResponse.data.on('error', reject)
      })

    } else {
      sendSSE('error', { message: `Unknown provider: ${provider}` })
      clearInterval(heartbeat)
      return res.end()
    }

    if (clientClosed) {
      let tokenSource = 'estimated'
      if (inputTokens === 0) {
        try { inputTokens = await countTokens(prompt, provider, mappedModel) } catch (_) {}
      } else {
        tokenSource = 'api_response'
      }
      if (outputTokens === 0 && fullResponse) {
        try { outputTokens = await countTokens(fullResponse, provider, mappedModel) } catch (_) {}
      } else if (outputTokens > 0) {
        tokenSource = 'api_response'
      }
      if (userId) {
        trackUsage(userId, provider, model, inputTokens, outputTokens)
      }
      log.info({ provider, model, inputTokens, outputTokens, tokenSource, responseLength: fullResponse.length }, 'Client disconnected — tracked partial usage')
      clearInterval(heartbeat)
      return
    }

    let tokenSource = 'api_response'
    if (inputTokens === 0 && outputTokens === 0) {
      tokenSource = 'estimated'
      try {
        inputTokens = await countTokens(prompt, provider, mappedModel)
        outputTokens = await countTokens(fullResponse, provider, mappedModel)
      } catch (e) { /* skip */ }
    }

    if (userId && fullResponse) {
      trackUsage(userId, provider, model, inputTokens, outputTokens)
    }

    const totalTokens = inputTokens + outputTokens

    sendSSE('done', {
      text: fullResponse,
      model: mappedModel,
      originalModel: model,
      tokens: {
        input: inputTokens,
        output: outputTokens,
        total: totalTokens,
        provider,
        model,
        source: tokenSource
      }
    })

    clearInterval(heartbeat)
    res.end()

  } catch (error: any) {
    clearInterval(heartbeat)

    if (clientClosed) {
      let tokenSource = 'estimated'
      if (inputTokens > 0 || outputTokens > 0) tokenSource = 'api_response'
      if (inputTokens === 0) {
        try { inputTokens = await countTokens(prompt, provider, mappedModel) } catch (_) {}
      }
      if (outputTokens === 0 && fullResponse) {
        try { outputTokens = await countTokens(fullResponse, provider, mappedModel) } catch (_) {}
      }
      if (userId) {
        trackUsage(userId, provider, model, inputTokens, outputTokens)
      }
      log.info({ provider, model, inputTokens, outputTokens, tokenSource, responseLength: fullResponse.length }, 'Client disconnected (caught) — tracked partial usage')
      return
    }

    log.error({ err: error, provider, model }, 'LLM stream error')
    try {
      const status = error.response?.status
      let errorMsg = error.response?.data?.error?.message || error.message || 'Unknown error'
      
      if (status === 503 || status === 429 || status === 529) {
        errorMsg = `⚠️ ${model} is currently experiencing high demand and is temporarily unavailable. Please try again in a moment or select a different model.`
      }
      
      sendSSE('error', { message: errorMsg })
      res.end()
    } catch (e) {
      log.error({ err: e }, 'Failed to send error to client')
    }
  }
})

export default router

// Named export for the summary stream (mounted at /api/summary)
const summaryRouter = Router()

summaryRouter.post('/stream', async (req: Request, res: Response) => {
  res.setHeader('Content-Type', 'text/event-stream')
  res.setHeader('Cache-Control', 'no-cache')
  res.setHeader('Connection', 'keep-alive')
  res.setHeader('X-Accel-Buffering', 'no')
  res.flushHeaders()

  let clientClosed = false
  let upstreamStream: any = null

  res.on('close', () => {
    if (!res.writableFinished) {
      clientClosed = true
      if (upstreamStream) {
        try { upstreamStream.destroy() } catch (_) {}
      }
    }
  })

  const sendSSE = (type: string, data: any) => {
    if (clientClosed) return
    try {
      res.write(`data: ${JSON.stringify({ type, ...data })}\n\n`)
    } catch (_) {}
  }

  const userId = req.userId
  const { prompt } = req.body
  const judgeModel = 'gemini-3-flash'
  const judgeModelApi = 'gemini-3-flash-preview'
  let fullResponse = ''
  let inputTokens = 0
  let outputTokens = 0

  try {
    if (!prompt) {
      sendSSE('error', { message: 'Missing prompt' })
      return res.end()
    }

    const apiKey = API_KEYS.google
    if (!apiKey) {
      sendSSE('error', { message: 'Google API key not configured' })
      return res.end()
    }

    const streamResponse = await axios.post(
      `https://generativelanguage.googleapis.com/v1beta/models/${judgeModelApi}:streamGenerateContent?key=${apiKey}&alt=sse`,
      {
        contents: [{ parts: [{ text: prompt }] }],
      },
      { responseType: 'stream' }
    )

    upstreamStream = streamResponse.data

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
      streamResponse.data.on('data', (chunk: any) => {
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

    if (clientClosed) {
      if (inputTokens === 0) {
        try { inputTokens = await countTokens(prompt, 'google', judgeModel) } catch (_) {}
      }
      if (outputTokens === 0 && fullResponse) {
        try { outputTokens = await countTokens(fullResponse, 'google', judgeModel) } catch (_) {}
      }
      if (userId) {
        trackUsage(userId, 'judge', 'summary-model', inputTokens, outputTokens, false)
      }
      log.info({ inputTokens, outputTokens, responseLength: fullResponse.length }, 'Summary client disconnected — tracked partial usage')
      return
    }

    let tokenSource = 'api_response'
    if (inputTokens === 0 && outputTokens === 0) {
      tokenSource = 'estimated'
      try {
        inputTokens = await countTokens(prompt, 'google', judgeModel)
        outputTokens = await countTokens(fullResponse, 'google', judgeModel)
      } catch (e) { /* skip */ }
    }

    if (userId) {
      trackUsage(userId, 'judge', 'summary-model', inputTokens, outputTokens, false)
    }

    sendSSE('done', {
      text: fullResponse,
      model: judgeModel,
      tokens: {
        input: inputTokens,
        output: outputTokens,
        total: inputTokens + outputTokens,
        provider: 'judge',
        model: 'summary-model',
        source: tokenSource
      }
    })

    res.end()
  } catch (error: any) {
    if (clientClosed) {
      if (inputTokens === 0) {
        try { inputTokens = await countTokens(prompt, 'google', judgeModel) } catch (_) {}
      }
      if (outputTokens === 0 && fullResponse) {
        try { outputTokens = await countTokens(fullResponse, 'google', judgeModel) } catch (_) {}
      }
      if (userId) {
        trackUsage(userId, 'judge', 'summary-model', inputTokens, outputTokens, false)
      }
      log.info({ inputTokens, outputTokens, responseLength: fullResponse.length }, 'Summary client disconnected (caught) — tracked partial usage')
      return
    }
    log.error({ err: error }, 'Summary stream error')
    try {
      sendSSE('error', { message: error.message })
      res.end()
    } catch (_) {}
  }
})

export { summaryRouter }
