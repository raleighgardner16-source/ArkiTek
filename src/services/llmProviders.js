import axios from 'axios'
import { streamFetch } from '../utils/streamFetch'

// LLM Provider configurations
export const LLM_PROVIDERS = {
  openai: {
    name: 'Chatgpt',
    models: [
      { id: 'gpt-5.2', type: 'reasoning', label: 'Reasoning' },
      { id: 'gpt-4.1', type: 'versatile', label: 'Versatile' },
      { id: 'gpt-5-mini', type: 'fast', label: 'Fast' },
    ],
    baseUrl: 'https://api.openai.com/v1',
    endpoint: '/chat/completions',
    apiKeyUrl: 'https://platform.openai.com/api-keys',
  },
  anthropic: {
    name: 'Claude',
    models: [
      { id: 'claude-4.5-opus', type: 'reasoning', label: 'Reasoning' },
      { id: 'claude-4.5-sonnet', type: 'versatile', label: 'Versatile' },
      { id: 'claude-4.5-haiku', type: 'fast', label: 'Fast' },
    ],
    baseUrl: 'https://api.anthropic.com/v1',
    endpoint: '/messages',
    apiKeyUrl: 'https://console.anthropic.com/',
  },
  google: {
    name: 'Gemini',
    models: [
      { id: 'gemini-3-pro', type: 'reasoning', label: 'Reasoning' },
      { id: 'gemini-3-flash', type: 'versatile', label: 'Versatile' },
      { id: 'gemini-2.5-flash-lite', type: 'fast', label: 'Fast' },
    ],
    baseUrl: 'https://generativelanguage.googleapis.com/v1beta',
    endpoint: '/models/{model}:generateContent',
    apiKeyUrl: 'https://makersuite.google.com/app/apikey',
  },
  meta: {
    name: 'Meta (Llama)',
    models: [
      { id: 'llama-4-maverick', type: 'reasoning', label: 'Reasoning' },
      { id: 'llama-4-scout', type: 'versatile', label: 'Versatile' },
      { id: 'llama-3.3-8b-instruct', type: 'fast', label: 'Fast' },
    ],
    baseUrl: 'https://api.groq.com/openai/v1',
    endpoint: '/chat/completions',
    apiKeyUrl: 'https://console.groq.com/',
  },
  deepseek: {
    name: 'DeepSeek',
    models: [
      { id: 'deepseek-reasoning-model', type: 'reasoning', label: 'Reasoning' },
      { id: 'deepseek-versatile-model', type: 'versatile', label: 'Versatile' },
      { id: 'deepseek-fast-model', type: 'fast', label: 'Fast' },
    ],
    baseUrl: 'https://api.deepseek.com/v1',
    endpoint: '/chat/completions',
    apiKeyUrl: 'https://platform.deepseek.com/api_keys',
  },
  // NOTE: Mistral is temporarily disabled in the main app UI (filtered out in MainView.jsx)
  // Code remains intact for future use - all backend support is still functional
  mistral: {
    name: 'Mistral AI',
    models: [
      { id: 'magistral-medium', type: 'reasoning', label: 'Reasoning' },
      { id: 'mistral-medium-3.1', type: 'versatile', label: 'Versatile' },
      { id: 'mistral-small-3.2', type: 'fast', label: 'Fast' },
    ],
    baseUrl: 'https://api.mistral.ai/v1',
    endpoint: '/chat/completions',
    apiKeyUrl: 'https://console.mistral.ai/',
  },
  xai: {
    name: 'Grok',
    models: [
      { id: 'grok-4-1-fast-reasoning', type: 'reasoning', label: 'Reasoning' },
      { id: 'grok-4-1-fast-non-reasoning', type: 'versatile', label: 'Versatile' },
      { id: 'grok-3-mini', type: 'fast', label: 'Fast' },
    ],
    baseUrl: 'https://api.x.ai/v1',
    endpoint: '/chat/completions',
    apiKeyUrl: 'https://console.x.ai/',
  },
}

// Helper to get all available models
export const getAllModels = () => {
  const allModels = []
  Object.entries(LLM_PROVIDERS).forEach(([providerKey, provider]) => {
    provider.models.forEach((modelObj) => {
      // Handle both object format (new) and string format (legacy)
      const modelId = typeof modelObj === 'string' ? modelObj : modelObj.id
      const modelType = typeof modelObj === 'string' ? null : modelObj.type
      const modelLabel = typeof modelObj === 'string' ? null : modelObj.label
      
      allModels.push({
        id: `${providerKey}-${modelId}`,
        provider: providerKey,
        providerName: provider.name,
        model: modelId,
        type: modelType,
        label: modelLabel,
        displayName: `${provider.name} - ${modelId}`,
      })
    })
  })
  return allModels
}

// API call functions
import { API_URL } from '../utils/config'

// Use backend proxy for all API calls to avoid CORS issues
const BACKEND_URL = API_URL

export const callLLM = async (providerKey, model, prompt, userId = null, isSummary = false) => {
  const provider = LLM_PROVIDERS[providerKey]
  if (!provider) throw new Error(`Unknown provider: ${providerKey}`)

  // Verify the model is in the provider's model list
  const modelExists = provider.models.some(m => 
    (typeof m === 'string' ? m : m.id) === model
  )
  if (!modelExists) {
    console.warn(`Model ${model} not found in provider ${providerKey} model list. Attempting API call anyway.`)
  }


  try {
    // Call backend proxy - API keys are now stored in the backend
    const response = await axios.post(
      `${BACKEND_URL}/api/llm`,
      {
        provider: providerKey,
        model: model,
        prompt: prompt,
        userId: userId,
        isSummary: isSummary, // Flag to indicate this is a summary call, not a user prompt
      },
      {
        headers: {
          'Content-Type': 'application/json',
        },
      }
    )
    
    // Log model verification
    
    // Return object with model info, but for backward compatibility, also support string return
    const result = {
      text: response.data.text,
      model: response.data.model, // Actual API model name
      originalModel: response.data.originalModel || model, // User-selected model name
      tokens: response.data.tokens || null // Token information
    }
    
    // For summary calls, return the full result object so tokens can be accessed
    // The caller can extract .text if they only need the text
    return result
  } catch (error) {
    console.error(`Error calling ${providerKey} via backend:`, error)
    
    // Handle network/CORS errors specifically
    if (error.message === 'Network Error' || error.code === 'ERR_NETWORK' || !error.response) {
      const errorMessage = `Network Error: Cannot connect to backend server at ${BACKEND_URL}. Make sure the backend server is running (npm run dev:server).`
      console.error('Backend Connection Error:', errorMessage)
      throw new Error(errorMessage)
    }
    
    // Provide more detailed error information
    let errorMessage = error.response?.data?.error 
      || error.response?.data?.message
      || error.message
      || `Failed to call ${providerKey}`
    
    // Log full error details for debugging
    if (error.response) {
      console.error('Backend Error Response:', error.response.data)
      console.error('Status:', error.response.status)
      console.error('Model being called:', model)
      console.error('Provider:', providerKey)
      
      // If it's a 404, add helpful context
      if (error.response.status === 404) {
        const availableModelIds = LLM_PROVIDERS[providerKey]?.models?.map(m => 
          typeof m === 'string' ? m : m.id
        ).join(', ') || 'unknown'
        errorMessage = `Model "${model}" not found (404). Please check if the model name is correct. Available models: ${availableModelIds}`
      }
    }
    
    throw new Error(errorMessage)
  }
}

// Streaming version of callLLM — uses SSE to stream tokens
// onToken is called for each token, returns final metadata on completion
export const callLLMStream = async (providerKey, model, prompt, userId = null, isSummary = false, onToken = () => {}, signal = null) => {
  // Track accumulated text from streamed tokens as a fallback
  let accumulatedText = ''
  const wrappedOnToken = (token) => {
    accumulatedText += token
    onToken(token)
  }

  const finalData = await streamFetch(`${BACKEND_URL}/api/llm/stream`, {
    provider: providerKey,
    model,
    prompt,
    userId,
    isSummary,
  }, {
    onToken: wrappedOnToken,
    onStatus: () => {},
    onError: (message) => {
      throw new Error(message)
    },
    signal,
  })

  // If we received tokens but didn't get the 'done' event, use accumulated text as fallback
  if (!finalData) {
    if (accumulatedText) {
      console.warn(`[LLM Stream] No 'done' event received for ${providerKey}/${model}, using ${accumulatedText.length} chars of streamed text as fallback`)
      return {
        text: accumulatedText,
        model: model,
        originalModel: model,
        tokens: null
      }
    }
    throw new Error('Stream ended without final data')
  }

  return {
    text: finalData.text,
    model: finalData.model,
    originalModel: finalData.originalModel || model,
    tokens: finalData.tokens || null
  }
}

// Serper search API function
export const searchWithSerper = async (query, num = 10, userId = null) => {
  if (!query || !query.trim()) {
    throw new Error('Search query is required')
  }



  try {
    const response = await axios.post(
      `${BACKEND_URL}/api/search`,
      {
        query: query.trim(),
        num: num,
        userId: userId,
      },
      {
        headers: {
          'Content-Type': 'application/json',
        },
      }
    )

    return response.data
  } catch (error) {
    console.error('[Serper] Search error:', error)
    
    // Handle network/CORS errors specifically
    if (error.message === 'Network Error' || error.code === 'ERR_NETWORK' || !error.response) {
      const errorMessage = `Network Error: Cannot connect to backend server at ${BACKEND_URL}. Make sure the backend server is running (npm run dev:server).`
      console.error('Backend Connection Error:', errorMessage)
      throw new Error(errorMessage)
    }
    
    // Provide more detailed error information
    let errorMessage = error.response?.data?.error 
      || error.response?.data?.message
      || error.message
      || 'Failed to perform search'
    
    throw new Error(errorMessage)
  }
}

