export const getShortModelName = (modelName: string | null | undefined): string => {
  if (!modelName) return modelName || ''
  const lower = modelName.toLowerCase()
  if (lower.includes('openai') || lower.includes('gpt') || lower.includes('o3') || lower.includes('o4')) return 'ChatGPT'
  if (lower.includes('claude') || lower.includes('anthropic')) return 'Claude'
  if (lower.includes('gemini') || lower.includes('google')) return 'Gemini'
  if (lower.includes('grok') || lower.includes('xai')) return 'Grok'
  if (lower.includes('llama') || lower.includes('meta')) return 'Llama'
  if (lower.includes('mistral')) return 'Mistral'
  if (lower.includes('deepseek')) return 'DeepSeek'
  return modelName
}

const MODEL_SHORT_LABELS: Record<string, string> = {
  'gpt-5.2': '5.2',
  'gpt-4.1': '4.1',
  'gpt-5-mini': '5 Mini',
  'claude-4.6-opus': 'Opus 4.6',
  'claude-4.6-sonnet': 'Sonnet 4.6',
  'claude-4.5-haiku': 'Haiku 4.5',
  'gemini-3.1-pro': '3.1 Pro',
  'gemini-3-flash': '3 Flash',
  'gemini-2.5-flash-lite': '2.5 Flash Lite',
  'grok-4-1-fast-reasoning': '4.1 Reasoning',
  'grok-4-1-fast-non-reasoning': '4.1 Versatile',
  'grok-3-mini': '3 Mini',
  'llama-4-maverick': '4 Maverick',
  'llama-4-scout': '4 Scout',
  'llama-3.3-8b-instruct': '3.3 8B',
  'deepseek-reasoning-model': 'Reasoning',
  'deepseek-versatile-model': 'Versatile',
  'deepseek-fast-model': 'Fast',
  'magistral-medium': 'Magistral Medium',
  'mistral-medium-3.1': 'Medium 3.1',
  'mistral-small-3.2': 'Small 3.2',
}

export const getModelShortLabel = (modelName: string | null | undefined): string => {
  if (!modelName) return ''
  const lower = modelName.toLowerCase()

  // Strip provider prefix (e.g., "openai-gpt-5.2" → "gpt-5.2")
  const prefixes = ['openai-', 'anthropic-', 'google-', 'xai-', 'meta-', 'deepseek-', 'mistral-']
  let modelPart = lower
  for (const prefix of prefixes) {
    if (modelPart.startsWith(prefix)) {
      modelPart = modelPart.slice(prefix.length)
      break
    }
  }

  return MODEL_SHORT_LABELS[modelPart] || modelPart
}
