import { useStore } from '../store/useStore'
import { callLLMStream } from './llmProviders'
import { getRoleByKey, getRoleSystemPrompt } from '../utils/debateRoles'
import api from '../utils/api'

interface DirectLLMParams {
  prompt: string
  models: string[]
  isDebateMode: boolean
  submittedRoles: Record<string, string>
  needsContext: boolean
  geminiThinkingLevel?: string
  userId: string | null
  signal: AbortSignal
  images?: Array<{ mimeType: string; base64: string }>
}

export interface DirectLLMResult {
  responses: any[]
  memoryContextData: any
}

/**
 * Executes direct LLM calls to all selected models in parallel with
 * real-time streaming. Optionally retrieves memory context to prepend
 * to the prompt.
 */
export async function executeDirectLLM({
  prompt,
  models,
  isDebateMode,
  submittedRoles,
  needsContext,
  geminiThinkingLevel,
  userId,
  signal,
  images,
}: DirectLLMParams): Promise<DirectLLMResult> {
  let memoryContextData = null
  let memoryPrefix = ''

  if (needsContext && userId) {
    try {
      console.log('[Memory] Retrieving embedded context for non-search prompt...')
      const memResponse = await api.post('/memory/retrieve', { prompt, needsContext: true })
      memoryContextData = memResponse.data
      memoryPrefix = memResponse.data?.contextString || ''
      if (memoryPrefix) {
        console.log(`[Memory] Injecting ${memResponse.data.items.length} past conversations into direct LLM prompts`)
      }
    } catch (memErr: any) {
      console.error('[Memory] Error retrieving context:', memErr.message)
    }
  }

  const todayDate = new Date().toLocaleDateString('en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  })
  const dateGroundedPrompt = `Today is ${todayDate}. This is the real, current date.\n\nUser Query: ${prompt}`
  const enhancedPrompt = memoryPrefix ? `${memoryPrefix}\n${dateGroundedPrompt}` : dateGroundedPrompt

  // Add placeholder response cards immediately so columns can stream in
  const responseIds: Record<string, string> = {}
  models.forEach((modelId) => {
    const id = `${modelId}-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`
    responseIds[modelId] = id
    const roleKey = isDebateMode ? submittedRoles[modelId] || 'neutral' : submittedRoles[modelId]
    const roleDef = roleKey ? getRoleByKey(roleKey) : null
    useStore.getState().addResponse({
      id,
      modelName: modelId,
      actualModelName: modelId,
      originalModelName: modelId,
      text: '',
      error: false,
      tokens: null,
      isStreaming: true,
      debateRole: roleDef ? { key: roleDef.key, label: roleDef.label } : null,
    })
  })

  // Stream all models in parallel
  const responsePromises = models.map(async (modelId) => {
    const firstDashIndex = modelId.indexOf('-')
    if (firstDashIndex === -1) {
      console.error(`[Direct LLM Stream] Invalid modelId format: ${modelId}`)
      useStore.getState().updateResponse(responseIds[modelId], {
        text: 'Error: Invalid model ID format',
        error: true,
        isStreaming: false,
      })
      return {
        id: responseIds[modelId],
        modelName: modelId,
        text: 'Error: Invalid model ID format',
        error: true,
      }
    }

    const providerKey = modelId.substring(0, firstDashIndex)
    const model = modelId.substring(firstDashIndex + 1)
    const responseId = responseIds[modelId]

    try {
      const rolePrompt = isDebateMode ? getRoleSystemPrompt(submittedRoles[modelId] || 'neutral') : null
      const thinkingLevel = providerKey === 'google' ? geminiThinkingLevel : undefined
      const llmResponse = await callLLMStream(
        providerKey,
        model,
        enhancedPrompt,
        userId,
        false,
        (token) => {
          useStore.getState().updateResponse(responseId, {
            text: (useStore.getState().responses.find((r: any) => r.id === responseId)?.text || '') + token,
          })
        },
        signal,
        rolePrompt,
        thinkingLevel,
        images,
      )

      const responseText = llmResponse.text
      const actualModel = llmResponse.model || modelId
      const originalModel = llmResponse.originalModel || modelId

      useStore.getState().updateResponse(responseId, {
        text: responseText,
        actualModelName: actualModel,
        originalModelName: originalModel,
        tokens: llmResponse.tokens || null,
        isStreaming: false,
      })

      return {
        id: responseId,
        modelName: modelId,
        actualModelName: actualModel,
        originalModelName: originalModel,
        text: responseText,
        error: false,
        tokens: llmResponse.tokens || null,
      }
    } catch (error: any) {
      if (error.name === 'AbortError' || signal.aborted) {
        return { id: responseId, modelName: modelId, text: '', error: false, aborted: true }
      }
      console.error(`[Direct LLM Stream] Error calling ${modelId}:`, error)
      useStore.getState().updateResponse(responseId, {
        text: `Error: ${error.message}`,
        error: true,
        isStreaming: false,
      })
      return {
        id: responseId,
        modelName: modelId,
        actualModelName: modelId,
        originalModelName: modelId,
        text: `Error: ${error.message}`,
        error: true,
      }
    }
  })

  const responses = await Promise.all(responsePromises)
  return { responses, memoryContextData }
}
