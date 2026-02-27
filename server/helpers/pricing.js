import { estimateTokensFallback } from '../../utils/tokenCounters.js'

const buildTokenBreakdown = (userQuery, sourceContent, totalInputTokens) => {
  const userPromptTokens = estimateTokensFallback(userQuery || '')
  const sourceTokens = estimateTokensFallback(sourceContent || '')
  const systemOverhead = Math.max(0, totalInputTokens - userPromptTokens - sourceTokens)
  return {
    userPrompt: userPromptTokens,
    sourceContext: sourceTokens,
    systemOverhead: systemOverhead
  }
}

const getPlanAllocation = (user) => {
  const plan = user?.plan
  const status = user?.subscriptionStatus
  const hasStripe = !!user?.stripeSubscriptionId
  
  if (plan === 'premium') return 25.00
  if (plan === 'pro' || (status === 'active' && hasStripe)) return 7.50
  if (plan === 'free_trial' || (status === 'trialing' && !hasStripe)) return 1.00
  return 7.50
}

const getPricingData = () => {
  return {
    openai: {
      name: 'OpenAI',
      models: {
        'gpt-5.2': { input: 1.75, cachedInput: null, output: 14.00, note: 'Reasoning model' },
        'gpt-4.1': { input: 2.00, cachedInput: null, output: 8.00, note: 'Versatile model' },
        'gpt-4o-mini': { input: 0.15, cachedInput: null, output: 0.60, note: 'Fast model' },
        'gpt-5o-mini': { input: 0.25, cachedInput: null, output: 2.00, note: 'Fast model' },
        'text-embedding-3-small': { input: 0.02, cachedInput: null, output: 0.00, note: 'Embedding model (memory/context)' },
      },
    },
    anthropic: {
      name: 'Anthropic (Claude)',
      models: {
        'claude-4.5-opus': { input: 5.00, cachedInput: null, output: 25.00, note: 'Reasoning model' },
        'claude-4.5-sonnet': { input: 3.00, cachedInput: null, output: 15.00, note: 'Versatile model' },
        'claude-4.5-haiku': { input: 1.00, cachedInput: null, output: 5.00, note: 'Fast model' },
      },
    },
    google: {
      name: 'Google (Gemini)',
      models: {
        'gemini-3-pro': { input: 2.00, cachedInput: null, output: 12.00, note: 'Reasoning model' },
        'gemini-3-flash': { input: 0.50, cachedInput: null, output: 3.00, note: 'Versatile model' },
        'gemini-2.5-flash-lite': { input: 0.10, cachedInput: null, output: 0.40, note: 'Fast model' },
      },
    },
    xai: {
      name: 'xAI (Grok)',
      models: {
        'grok-4-1-fast-reasoning': { input: 0.20, cachedInput: null, output: 0.50, note: 'Reasoning model' },
        'grok-4-1-fast-non-reasoning': { input: 0.20, cachedInput: null, output: 0.50, note: 'Versatile model' },
        'grok-3-mini': { input: 0.30, cachedInput: null, output: 0.50, note: 'Fast model' },
      },
    },
    meta: {
      name: 'Meta (Llama)',
      models: {
        'llama-4-maverick': { input: null, cachedInput: null, output: null, note: 'Placeholder pricing - Reasoning model' },
        'llama-4-scout': { input: null, cachedInput: null, output: null, note: 'Placeholder pricing - Versatile model' },
        'llama-3.3-8b-instruct': { input: null, cachedInput: null, output: null, note: 'Placeholder pricing - Fast model' },
      },
    },
    deepseek: {
      name: 'DeepSeek',
      models: {
        'deepseek-reasoning-model': { input: null, cachedInput: null, output: null, note: 'Placeholder pricing - Reasoning model' },
        'deepseek-versatile-model': { input: null, cachedInput: null, output: null, note: 'Placeholder pricing - Versatile model' },
        'deepseek-fast-model': { input: null, cachedInput: null, output: null, note: 'Placeholder pricing - Fast model' },
      },
    },
    mistral: {
      name: 'Mistral AI',
      models: {
        'magistral-medium': { input: 2.00, cachedInput: null, output: 5.00, note: 'Reasoning model' },
        'mistral-medium-3.1': { input: 0.40, cachedInput: null, output: 2.00, note: 'Versatile model' },
        'mistral-small-3.2': { input: 0.10, cachedInput: null, output: 0.30, note: 'Fast model' },
      },
    },
    serper: {
      name: 'Serper (Search Queries)',
      queryTiers: [
        { credits: 50000, pricePer1k: 1.00, note: '50k credits' },
        { credits: 500000, pricePer1k: 0.75, note: '500k credits' },
        { credits: 2500000, pricePer1k: 0.50, note: '2.5M credits' },
        { credits: 12500000, pricePer1k: 0.30, note: '12.5M credits' },
      ],
    },
  }
}

const calculateModelCost = (modelKey, inputTokens, outputTokens, pricing) => {
  const modelPricing = pricing[modelKey]
  if (!modelPricing) return 0
  const inputCost = (inputTokens / modelPricing.per) * modelPricing.input
  const outputCost = (outputTokens / modelPricing.per) * modelPricing.output
  return inputCost + outputCost
}

const calculateSerperQueryCost = (queryCount) => {
  return queryCount * 0.001
}

export {
  buildTokenBreakdown,
  getPlanAllocation,
  getPricingData,
  calculateModelCost,
  calculateSerperQueryCost,
}
