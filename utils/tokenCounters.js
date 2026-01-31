/**
 * Provider-specific token counting utilities
 * Implements accurate token counting for each provider/model
 */

// Simple estimation fallback (last resort)
const estimateTokensFallback = (text) => {
  if (!text) return 0
  // Rough approximation: ~4 characters per token (very inaccurate, use only as fallback)
  return Math.ceil(text.length / 4)
}

/**
 * Count tokens for OpenAI models using tiktoken
 * @param {string} text - Text to tokenize
 * @param {string} model - Model name (e.g., 'gpt-4o-mini', 'gpt-5.2')
 * @returns {number} Token count
 */
const countOpenAITokens = async (text, model) => {
  try {
    // Try to use tiktoken if available
    const { encoding_for_model } = await import('tiktoken')
    const enc = encoding_for_model(model)
    const tokens = enc.encode(text).length
    return tokens
  } catch (error) {
    console.warn(`[Token Counter] tiktoken not available for ${model}, using fallback`)
    return estimateTokensFallback(text)
  }
}

/**
 * Count tokens for Anthropic Claude models
 * @param {string} text - Text to tokenize
 * @returns {number} Token count
 */
const countAnthropicTokens = async (text) => {
  try {
    // Anthropic uses a different tokenization scheme
    // The @anthropic-ai/sdk includes token counting, but for now use better estimation
    // Claude tokenization is roughly 1 token per 3-4 characters
    // This is more accurate than the 4-char fallback
    return Math.ceil(text.length / 3.5)
  } catch (error) {
    console.warn('[Token Counter] Error counting Anthropic tokens, using fallback')
    return estimateTokensFallback(text)
  }
}

/**
 * Count tokens for Google Gemini models
 * @param {string} text - Text to tokenize
 * @returns {number} Token count
 */
const countGoogleTokens = async (text) => {
  try {
    // Google provides token counting via their SDK
    // For now, use a better estimation based on their documentation
    // Gemini uses SentencePiece tokenization, roughly 1 token per 2-3 characters
    // This is more accurate than the 4-char fallback
    return Math.ceil(text.length / 2.5)
  } catch (error) {
    return estimateTokensFallback(text)
  }
}

/**
 * Count tokens for Mistral models
 * @param {string} text - Text to tokenize
 * @returns {number} Token count
 */
const countMistralTokens = async (text) => {
  try {
    // Mistral uses SentencePiece similar to Google
    // Better estimation than fallback
    return Math.ceil(text.length / 2.5)
  } catch (error) {
    return estimateTokensFallback(text)
  }
}

/**
 * Count tokens for xAI Grok models
 * @param {string} text - Text to tokenize
 * @param {string} model - Model name (optional, for better accuracy)
 * @returns {number} Token count
 */
const countXAITokens = async (text, model) => {
  try {
    // xAI uses OpenAI-compatible API, so try using tiktoken with a similar model
    // Grok models are similar to GPT-4 in tokenization
    try {
      const { encoding_for_model } = await import('tiktoken')
      // Use gpt-4 as a proxy since Grok uses similar tokenization
      const enc = encoding_for_model('gpt-4')
      const tokens = enc.encode(text).length
      console.log(`[Token Counter] xAI: Used tiktoken (gpt-4 proxy) for ${model || 'grok'}, counted ${tokens} tokens`)
      return tokens
    } catch (tiktokenError) {
      console.warn(`[Token Counter] tiktoken not available for xAI, using estimation`)
      // Fallback: xAI tokenization is roughly similar to OpenAI
      // Use a better estimation: ~1 token per 3.5 characters (between GPT-3.5 and GPT-4)
      return Math.ceil(text.length / 3.5)
    }
  } catch (error) {
    console.warn(`[Token Counter] Error counting xAI tokens, using fallback:`, error.message)
    return estimateTokensFallback(text)
  }
}

/**
 * Main token counting function
 * Uses provider-specific tokenizers when available
 * @param {string} text - Text to tokenize
 * @param {string} provider - Provider name (openai, anthropic, google, etc.)
 * @param {string} model - Model name
 * @returns {Promise<number>} Token count
 */
const countTokens = async (text, provider, model) => {
  if (!text) return 0

  try {
    switch (provider) {
      case 'openai':
        return await countOpenAITokens(text, model)
      
      case 'anthropic':
        return await countAnthropicTokens(text)
      
      case 'google':
        return await countGoogleTokens(text)
      
      case 'mistral':
        return await countMistralTokens(text)
      
      case 'xai':
        return await countXAITokens(text, model)
      
      case 'meta':
      case 'deepseek':
        // These use OpenAI-compatible APIs, try OpenAI tokenizer
        try {
          return await countOpenAITokens(text, model || 'gpt-4o-mini')
        } catch {
          return estimateTokensFallback(text)
        }
      
      default:
        console.warn(`[Token Counter] Unknown provider: ${provider}, using fallback`)
        return estimateTokensFallback(text)
    }
  } catch (error) {
    console.error(`[Token Counter] Error counting tokens for ${provider}/${model}:`, error)
    return estimateTokensFallback(text)
  }
}

/**
 * Extract token counts from API response if available
 * Many providers return usage information in their responses
 * @param {object} responseData - API response data
 * @param {string} provider - Provider name
 * @returns {object|null} { inputTokens, outputTokens } or null if not available
 */
const extractTokensFromResponse = (responseData, provider) => {
  try {
    // OpenAI-compatible format (OpenAI, xAI, Mistral, Meta, DeepSeek)
    if (responseData.usage) {
      const tokens = {
        inputTokens: responseData.usage.prompt_tokens || responseData.usage.input_tokens || 0,
        outputTokens: responseData.usage.completion_tokens || responseData.usage.output_tokens || 0,
        totalTokens: responseData.usage.total_tokens || 0,
      }
      
      // Log for xAI to verify API is returning usage
      if (provider === 'xai') {
        console.log(`[Token Counter] xAI API returned usage:`, {
          prompt_tokens: responseData.usage.prompt_tokens,
          completion_tokens: responseData.usage.completion_tokens,
          total_tokens: responseData.usage.total_tokens,
          extracted: tokens
        })
      }
      
      return tokens
    }

    // Anthropic format
    if (responseData.input_tokens !== undefined && responseData.output_tokens !== undefined) {
      return {
        inputTokens: responseData.input_tokens,
        outputTokens: responseData.output_tokens,
        totalTokens: responseData.input_tokens + responseData.output_tokens,
      }
    }

    // Google Gemini format
    if (responseData.usageMetadata) {
      const tokens = {
        inputTokens: responseData.usageMetadata.promptTokenCount || 0,
        outputTokens: responseData.usageMetadata.candidatesTokenCount || 0,
        totalTokens: responseData.usageMetadata.totalTokenCount || 0,
        reasoningTokens: responseData.usageMetadata.thoughtsTokenCount || 0, // Reasoning tokens for reasoning models
      }
      
      // Log for Gemini to verify API is returning usage correctly
      console.log(`[Token Counter] Gemini API returned usageMetadata:`, {
        promptTokenCount: responseData.usageMetadata.promptTokenCount,
        candidatesTokenCount: responseData.usageMetadata.candidatesTokenCount,
        totalTokenCount: responseData.usageMetadata.totalTokenCount,
        thoughtsTokenCount: responseData.usageMetadata.thoughtsTokenCount,
        fullUsageMetadata: responseData.usageMetadata,
        extracted: tokens
      })
      
      return tokens
    }
    
    // Also check for alternative field names (some API versions might use different casing)
    if (responseData.usage_metadata) {
      const tokens = {
        inputTokens: responseData.usage_metadata.prompt_token_count || responseData.usage_metadata.promptTokenCount || 0,
        outputTokens: responseData.usage_metadata.candidates_token_count || responseData.usage_metadata.candidatesTokenCount || 0,
        totalTokens: responseData.usage_metadata.total_token_count || responseData.usage_metadata.totalTokenCount || 0,
        reasoningTokens: responseData.usage_metadata.thoughts_token_count || responseData.usage_metadata.thoughtsTokenCount || 0, // Reasoning tokens
      }
      
      console.log(`[Token Counter] Gemini API returned usage_metadata (snake_case):`, {
        extracted: tokens,
        fullUsageMetadata: responseData.usage_metadata
      })
      
      return tokens
    }

    return null
  } catch (error) {
    console.error('[Token Counter] Error extracting tokens from response:', error)
    return null
  }
}

export {
  countTokens,
  extractTokensFromResponse,
  estimateTokensFallback,
}

