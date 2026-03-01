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
