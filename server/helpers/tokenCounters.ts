/**
 * Provider-specific token counting utilities
 * Implements accurate token counting for each provider/model
 */

// Simple estimation fallback (last resort)
const estimateTokensFallback = (text: string): number => {
  if (!text) return 0
  // Rough approximation: ~4 characters per token (very inaccurate, use only as fallback)
  return Math.ceil(text.length / 4)
}

/**
 * Count tokens for OpenAI models using tiktoken
 */
const countOpenAITokens = async (text: string, model: string): Promise<number> => {
  try {
    // Try to use tiktoken if available
    const { encoding_for_model } = await import('tiktoken')
    const enc = encoding_for_model(model as any)
    const tokens = enc.encode(text).length
    return tokens
  } catch (error) {
    console.warn(`[Token Counter] tiktoken not available for ${model}, using fallback`)
    return estimateTokensFallback(text)
  }
}

/**
 * Count tokens for Anthropic Claude models
 */
const countAnthropicTokens = async (text: string): Promise<number> => {
  try {
    // Claude tokenization is roughly 1 token per 3-4 characters
    return Math.ceil(text.length / 3.5)
  } catch (error) {
    console.warn('[Token Counter] Error counting Anthropic tokens, using fallback')
    return estimateTokensFallback(text)
  }
}

/**
 * Count tokens for Google Gemini models
 */
const countGoogleTokens = async (text: string): Promise<number> => {
  try {
    // Gemini uses SentencePiece tokenization, roughly 1 token per 2-3 characters
    return Math.ceil(text.length / 2.5)
  } catch (error) {
    return estimateTokensFallback(text)
  }
}

/**
 * Count tokens for Mistral models
 */
const countMistralTokens = async (text: string): Promise<number> => {
  try {
    // Mistral uses SentencePiece similar to Google
    return Math.ceil(text.length / 2.5)
  } catch (error) {
    return estimateTokensFallback(text)
  }
}

/**
 * Count tokens for xAI Grok models
 */
const countXAITokens = async (text: string, model: string): Promise<number> => {
  try {
    try {
      const { encoding_for_model } = await import('tiktoken')
      // Use gpt-4 as a proxy since Grok uses similar tokenization
      const enc = encoding_for_model('gpt-4')
      const tokens = enc.encode(text).length
      console.log(`[Token Counter] xAI: Used tiktoken (gpt-4 proxy) for ${model || 'grok'}, counted ${tokens} tokens`)
      return tokens
    } catch (tiktokenError) {
      console.warn(`[Token Counter] tiktoken not available for xAI, using estimation`)
      return Math.ceil(text.length / 3.5)
    }
  } catch (error: any) {
    console.warn(`[Token Counter] Error counting xAI tokens, using fallback:`, error.message)
    return estimateTokensFallback(text)
  }
}

/**
 * Main token counting function
 * Uses provider-specific tokenizers when available
 */
const countTokens = async (text: string, provider: string, model: string): Promise<number> => {
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
 */
const extractTokensFromResponse = (responseData: any, provider: string) => {
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
        reasoningTokens: responseData.usageMetadata.thoughtsTokenCount || 0,
      }
      
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
        reasoningTokens: responseData.usage_metadata.thoughts_token_count || responseData.usage_metadata.thoughtsTokenCount || 0,
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
