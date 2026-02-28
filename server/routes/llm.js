import { Router } from 'express'
import axios from 'axios'
import { API_KEYS, MODEL_MAPPINGS, PROVIDER_BASE_URLS } from '../config/index.js'
import { countTokens, extractTokensFromResponse } from '../../utils/tokenCounters.js'
import { trackUsage } from '../services/usage.js'
import { checkSubscriptionStatusAsync } from '../services/subscription.js'
import { cleanMistralResponse } from '../services/search.js'

const router = Router()

// POST /api/llm → router.post('/')
router.post('/', async (req, res) => {
  const userId = req.userId
  const { provider, model, prompt, isSummary } = req.body || {}
  let apiKey = null
  let responseText = null
  
  try {
    console.log('[Backend] Received request:', {
      provider,
      model,
      promptLength: prompt?.length,
      isSummary: isSummary || false,
    })

    if (!provider || !model || !prompt) {
      return res.status(400).json({ 
        error: 'Missing required fields: provider, model, or prompt' 
      })
    }

    if (!isSummary && userId) {
      const subscriptionCheck = await checkSubscriptionStatusAsync(userId)
      if (!subscriptionCheck.hasAccess) {
        return res.status(403).json({ 
          error: subscriptionCheck.usageExhausted ? subscriptionCheck.reason : 'Active subscription required. Please subscribe to use this service.',
          subscriptionRequired: !subscriptionCheck.usageExhausted,
          usageExhausted: subscriptionCheck.usageExhausted || false,
          planType: subscriptionCheck.planType || null,
          reason: subscriptionCheck.reason
        })
      }
    }

    apiKey = API_KEYS[provider]
    if (!apiKey || apiKey.trim() === '') {
      return res.status(400).json({ 
        error: `No API key configured for provider: ${provider}. Please add it to the backend .env file.` 
      })
    }

    let response

    const mappedModel = MODEL_MAPPINGS[model] || model
    
    if (MODEL_MAPPINGS[model]) {
      console.log(`[Backend] Model mapping: "${model}" -> "${mappedModel}"`)
    }

    if (['openai', 'xai', 'meta', 'deepseek', 'mistral'].includes(provider)) {
      try {
        console.log(`[Backend] ===== LLM API CALL =====`)
        console.log(`[Backend] Provider: ${provider}`)
        console.log(`[Backend] User Selected Model: ${model}`)
        console.log(`[Backend] API Model Name: ${mappedModel}`)
        console.log(`[Backend] Using backend-configured API key (length: ${apiKey?.length})`)
        
        if (provider === 'xai') {
          try {
            const modelsResponse = await axios.get(
              `${PROVIDER_BASE_URLS[provider]}/models`,
              { headers: { 'Authorization': `Bearer ${apiKey}` } }
            )
            const availableModels = modelsResponse.data?.data?.map(m => m.id) || []
            console.log(`[Backend] Available xAI models:`, availableModels)
          } catch (listError) {
            console.log(`[Backend] Could not list xAI models (this is okay):`, listError.message)
          }
        }
        
        const modelsWithFixedTemperature = ['gpt-5-mini']
        const shouldUseDefaultTemperature = modelsWithFixedTemperature.includes(mappedModel) || modelsWithFixedTemperature.includes(model)
        
        const apiRequestBody = {
          model: mappedModel,
          messages: [{ role: 'user', content: prompt }],
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
          }
        )
        
        console.log(`[Backend] API Call Successful - Model ${mappedModel} responded`)

        let rawContent = response.data.choices[0].message.content
        
        if (provider === 'mistral') {
          rawContent = cleanMistralResponse(rawContent)
        }
        
        responseText = rawContent
        
        if (userId && responseText) {
          let inputTokens = 0
          let outputTokens = 0
          
          const responseTokens = extractTokensFromResponse(response.data, provider)
          if (responseTokens) {
            inputTokens = responseTokens.inputTokens || 0
            outputTokens = responseTokens.outputTokens || 0
            const totalTokens = responseTokens.totalTokens || (inputTokens + outputTokens)
            console.log(`[Token Tracking] Using API response tokens for ${provider}/${model}: input=${inputTokens}, output=${outputTokens}, total=${totalTokens}`)
          } else {
            inputTokens = await countTokens(prompt, provider, mappedModel)
            outputTokens = await countTokens(responseText, provider, mappedModel)
            console.log(`[Token Tracking] Counted tokens using tokenizer for ${provider}/${model}: input=${inputTokens}, output=${outputTokens}, total=${inputTokens + outputTokens}`)
          }
          
          trackUsage(userId, provider, model, inputTokens, outputTokens)
          
          const totalTokens = responseTokens?.totalTokens || (inputTokens + outputTokens)
          
          return res.json({ 
            text: responseText,
            model: mappedModel,
            originalModel: model,
            tokens: {
              input: inputTokens || 0,
              output: outputTokens || 0,
              total: totalTokens,
              provider: provider,
              model: model,
              source: responseTokens ? 'api_response' : 'tokenizer'
            }
          })
        } else {
          return res.json({ 
            text: responseText,
            model: mappedModel,
            originalModel: model,
            tokens: null
          })
        }
      } catch (apiError) {
        console.error(`[Backend] ${provider} API Error:`, {
          originalModel: model,
          mappedModel: mappedModel,
          status: apiError.response?.status,
          statusText: apiError.response?.statusText,
          data: apiError.response?.data,
          message: apiError.message,
        })
        
        if (provider === 'mistral') {
          const errorMessage = apiError.response?.data?.message || apiError.message || ''
          if (errorMessage.includes('Service tier capacity exceeded') || 
              errorMessage.includes('capacity exceeded') ||
              errorMessage.includes('rate limit') ||
              apiError.response?.status === 429) {
            return res.status(503).json({
              error: 'Mistral API capacity exceeded. The model is currently at capacity. Please try again later or use a different model.',
              model: mappedModel,
              originalModel: model,
              retryAfter: apiError.response?.headers?.['retry-after'] || null
            })
          }
        }
        
        if (provider === 'xai' && apiError.response?.status === 404) {
          const modelMap = {
            'grok-4-1-fast-reasoning': ['grok-beta', 'grok-2-1212'],
            'grok-4-1-fast-non-reasoning': ['grok-beta', 'grok-2-1212'],
            'grok-4-heavy': ['grok-beta', 'grok-2-1212'],
            'grok-4-fast-reasoning': ['grok-beta', 'grok-2-1212'],
            'grok-4-fast-non-reasoning': ['grok-beta', 'grok-2-1212'],
          }
          
          const fallbackModels = modelMap[model] || ['grok-beta', 'grok-2-1212', 'grok-vision-beta']
          
          for (const fallbackModel of fallbackModels) {
            if (mappedModel === fallbackModel) continue
            console.log(`[Backend] Trying fallback model: ${fallbackModel} for original model: ${model}`)
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
              console.log(`[Backend] Successfully used fallback model: ${fallbackModel}`)
              responseText = response.data.choices[0].message.content
              
              let inputTokens = 0
              let outputTokens = 0
              let tokenSource = 'none'
              
              if (userId && responseText) {
                const responseTokens = extractTokensFromResponse(response.data, provider)
                
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
              
              return res.json({ 
                text: responseText,
                model: fallbackModel,
                originalModel: model,
                tokens: userId && responseText ? {
                  input: inputTokens,
                  output: outputTokens,
                  total: inputTokens + outputTokens,
                  provider: provider,
                  model: fallbackModel,
                  source: tokenSource
                } : null
              })
            } catch (fallbackError) {
              console.error(`[Backend] Fallback model ${fallbackModel} also failed:`, fallbackError.response?.data)
              continue
            }
          }
        }
        
        throw apiError
      }
    }

    if (provider === 'anthropic') {
      console.log(`[Backend] Calling Anthropic with model: ${mappedModel}${model !== mappedModel ? ` (mapped from ${model})` : ''}`)
      
      try {
        response = await axios.post(
          'https://api.anthropic.com/v1/messages',
          {
            model: mappedModel,
            max_tokens: 1024,
            messages: [{ role: 'user', content: prompt }],
          },
          {
            headers: {
              'x-api-key': apiKey,
              'anthropic-version': '2023-06-01',
              'Content-Type': 'application/json',
            },
          }
        )

        if (response.data.content && response.data.content.length > 0) {
          responseText = response.data.content[0].text
          
          let inputTokens = 0
          let outputTokens = 0
          let tokenSource = 'none'
          
          if (userId && responseText) {
            const responseTokens = extractTokensFromResponse(response.data, provider)
            
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
          
          return res.json({ 
            text: responseText,
            model: mappedModel,
            originalModel: model,
            tokens: userId && responseText ? {
              input: inputTokens,
              output: outputTokens,
              total: inputTokens + outputTokens,
              provider: provider,
              model: model,
              source: tokenSource
            } : null
          })
        }
        throw new Error('No content in response')
      } catch (anthropicError) {
        console.error('[Backend] Anthropic API Error:', JSON.stringify({
          model: model,
          status: anthropicError.response?.status,
          data: anthropicError.response?.data,
          message: anthropicError.message
        }, null, 2))
        
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

      try {
        response = await axios.post(
          `${baseUrl}${endpoint}`,
          {
            contents: [{ parts: [{ text: prompt }] }],
          },
          {
            headers: {
              'x-goog-api-key': apiKey,
              'Content-Type': 'application/json',
            },
          }
        )
      } catch (headerError) {
        console.error(`[Backend] Header auth failed:`, {
          status: headerError.response?.status,
          message: headerError.message
        })
        
        try {
          response = await axios.post(
            `${baseUrl}${endpoint}?key=${apiKey}`,
            {
              contents: [{ parts: [{ text: prompt }] }],
            },
            {
              headers: {
                'Content-Type': 'application/json',
              },
            }
          )
        } catch (queryError) {
          console.error(`[Backend] Query param auth also failed.`)
          throw queryError
        }
      }

      responseText = response.data.candidates[0].content.parts[0].text
      
      let inputTokens = 0
      let outputTokens = 0
      let totalTokens = 0
      let tokenSource = 'none'
      let responseTokens = null
      
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
      
      return res.json({ 
        text: responseText,
        model: mappedModel,
        originalModel: model,
        tokens: responseText ? {
          input: inputTokens,
          output: outputTokens,
          total: totalTokens,
          reasoningTokens: responseTokens?.reasoningTokens || 0,
          provider: provider,
          model: model,
          source: tokenSource
        } : null
      })
    }

    return res.status(400).json({ error: `Unknown provider: ${provider}` })
  } catch (error) {
    console.error('Proxy error:', error)
    
    const requestProvider = req.body?.provider || provider
    const requestModel = req.body?.model || model
    
    let errorMessage = error.response?.data?.error?.message 
      || error.response?.data?.message
      || error.message
      || 'Unknown error occurred'
    
    if (error.response?.status === 401) {
      errorMessage = `Unauthorized (401): Invalid API key for ${requestProvider}.`
    } else if (error.response?.status === 400) {
      errorMessage = `Bad Request (400): ${errorMessage}. Check if the model name "${requestModel}" is correct for ${requestProvider}.`
    } else if (error.response?.status === 404) {
      errorMessage = `Not Found (404): Model "${requestModel}" not found for ${requestProvider}.`
    }

    return res.status(error.response?.status || 500).json({
      error: errorMessage,
      status: error.response?.status,
      model: requestModel,
      provider: requestProvider
    })
  }
})

// POST /api/llm/stream → router.post('/stream')
router.post('/stream', async (req, res) => {
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

  const userId = req.userId
  const { provider, model, prompt, isSummary, rolePrompt } = req.body || {}

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

    const mappedModel = MODEL_MAPPINGS[model] || model

    let fullResponse = ''
    let inputTokens = 0
    let outputTokens = 0

    if (['openai', 'xai', 'meta', 'deepseek', 'mistral'].includes(provider)) {
      const modelsWithFixedTemperature = ['gpt-5-mini']
      const shouldUseDefaultTemperature = modelsWithFixedTemperature.includes(mappedModel) || modelsWithFixedTemperature.includes(model)

      const messages = []
      if (rolePrompt) messages.push({ role: 'system', content: rolePrompt })
      messages.push({ role: 'user', content: prompt })

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

      if (provider === 'mistral') {
        fullResponse = cleanMistralResponse(fullResponse)
      }

    } else if (provider === 'anthropic') {
      const anthropicBody = {
        model: mappedModel,
        max_tokens: 4096,
        messages: [{ role: 'user', content: prompt }],
        stream: true
      }
      if (rolePrompt) anthropicBody.system = rolePrompt

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
          timeout: 120000
        }
      )

      await new Promise((resolve, reject) => {
        let buffer = ''
        let streamError = null
        const processAnthropicLine = (line) => {
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
                console.error(`[LLM Stream] Anthropic stream error event:`, parsed.error || parsed)
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
        streamResponse.data.on('error', (err) => {
          console.error(`[LLM Stream] Anthropic stream connection error:`, err.message)
          reject(err)
        })
      })

    } else if (provider === 'google') {
      const isPreviewModel = mappedModel.includes('-preview')
      const apiVersion = isPreviewModel ? 'v1beta' : 'v1'
      const baseUrl = `https://generativelanguage.googleapis.com/${apiVersion}`

      const geminiBody = {
        contents: [{ parts: [{ text: prompt }] }],
      }
      if (rolePrompt) {
        geminiBody.systemInstruction = { parts: [{ text: rolePrompt }] }
      }

      const streamResponse = await axios.post(
        `${baseUrl}/models/${mappedModel}:streamGenerateContent?key=${apiKey}&alt=sse`,
        geminiBody,
        { responseType: 'stream' }
      )

      await new Promise((resolve, reject) => {
        let buffer = ''
        const processGoogleLine = (line) => {
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

  } catch (error) {
    clearInterval(heartbeat)
    console.error(`[LLM Stream] Error for ${provider}/${model}:`, error.message)
    try {
      sendSSE('error', { message: error.response?.data?.error?.message || error.message || 'Unknown error' })
      res.end()
    } catch (e) {
      console.error('[LLM Stream] Failed to send error to client:', e.message)
    }
  }
})

export default router

// Named export for the summary stream (mounted at /api/summary)
const summaryRouter = Router()

summaryRouter.post('/stream', async (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream')
  res.setHeader('Cache-Control', 'no-cache')
  res.setHeader('Connection', 'keep-alive')
  res.setHeader('X-Accel-Buffering', 'no')
  res.flushHeaders()

  const sendSSE = (type, data) => {
    res.write(`data: ${JSON.stringify({ type, ...data })}\n\n`)
  }

  try {
    const userId = req.userId
    const { prompt } = req.body
    if (!prompt) {
      sendSSE('error', { message: 'Missing prompt' })
      return res.end()
    }

    const apiKey = API_KEYS.google
    if (!apiKey) {
      sendSSE('error', { message: 'Google API key not configured' })
      return res.end()
    }

    const judgeModel = 'gemini-3-flash'
    const judgeModelApi = 'gemini-3-flash-preview'
    let fullResponse = ''
    let inputTokens = 0
    let outputTokens = 0

    const streamResponse = await axios.post(
      `https://generativelanguage.googleapis.com/v1beta/models/${judgeModelApi}:streamGenerateContent?key=${apiKey}&alt=sse`,
      {
        contents: [{ parts: [{ text: prompt }] }],
      },
      { responseType: 'stream' }
    )

    await new Promise((resolve, reject) => {
      let buffer = ''
      const processLine = (line) => {
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

    let tokenSource = 'api_response'
    if (inputTokens === 0 && outputTokens === 0) {
      tokenSource = 'estimated'
      try {
        inputTokens = await countTokens(prompt, 'google', judgeModel)
        outputTokens = await countTokens(fullResponse, 'google', judgeModel)
      } catch (e) { /* skip */ }
    }

    if (userId) {
      trackUsage(userId, 'google', judgeModel, inputTokens, outputTokens, false)
    }

    sendSSE('done', {
      text: fullResponse,
      model: judgeModel,
      tokens: {
        input: inputTokens,
        output: outputTokens,
        total: inputTokens + outputTokens,
        provider: 'google',
        model: judgeModel,
        source: tokenSource
      }
    })

    res.end()
  } catch (error) {
    console.error('[Summary Stream] Error:', error.message)
    sendSSE('error', { message: error.message })
    res.end()
  }
})

export { summaryRouter }
