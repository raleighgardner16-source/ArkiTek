import { useStore } from '../store/useStore'
import { streamFetch } from '../utils/streamFetch'
import { getRoleByKey, getRoleSystemPrompt } from '../utils/debateRoles'
import { API_URL, API_PREFIX } from '../utils/config'

interface RAGPipelineParams {
  prompt: string
  models: string[]
  isDebateMode: boolean
  submittedRoles: Record<string, string>
  needsContext: boolean
  geminiThinkingLevel?: string
  signal: AbortSignal
  images?: Array<{ mimeType: string; base64: string }>
}

export interface RAGPipelineResult {
  responses: any[]
  ragData: any
}

/**
 * Executes the RAG (Retrieval-Augmented Generation) pipeline:
 * Serper search → stream council model responses with real-time updates.
 *
 * Returns null when the pipeline fails with a recoverable error (caller
 * should fall back to direct LLM calls). Throws on abort or subscription errors.
 */
export async function executeRAGPipeline({
  prompt,
  models,
  isDebateMode,
  submittedRoles,
  needsContext,
  geminiThinkingLevel,
  signal,
  images,
}: RAGPipelineParams): Promise<RAGPipelineResult | null> {
  const store = useStore.getState()
  store.setIsSearchingWeb(true)

  const responseIds: Record<string, string> = {}
  const ragResponsesByModel: Record<string, any> = {}
  let latestRagSearchSources: any[] = []
  let searchPhaseDone = false

  const clearSearchIndicator = () => {
    if (!searchPhaseDone) {
      searchPhaseDone = true
      useStore.getState().setIsSearchingWeb(false)
    }
  }

  const normalizeCouncilResponse = (councilResponse: any) => {
    const actualModel = councilResponse.actual_model_name || councilResponse.model_name
    const originalModel = councilResponse.original_model_name || councilResponse.model_name

    let responseText = ''
    if (typeof councilResponse.response === 'string') {
      responseText = councilResponse.response
    } else if (Array.isArray(councilResponse.response)) {
      responseText = councilResponse.response
        .map((item: any) => {
          if (typeof item === 'string') return item
          if (item && typeof item === 'object' && item.text) return item.text
          return JSON.stringify(item)
        })
        .join(' ')
    } else if (councilResponse.response && typeof councilResponse.response === 'object') {
      responseText =
        councilResponse.response.text ||
        councilResponse.response.content ||
        councilResponse.response.message ||
        JSON.stringify(councilResponse.response)
    } else {
      responseText = String(councilResponse.response || '')
    }

    return {
      id:
        responseIds[councilResponse.model_name] ||
        `${councilResponse.model_name}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      modelName: councilResponse.model_name,
      actualModelName: actualModel,
      originalModelName: originalModel,
      text: responseText,
      error: !!councilResponse.error,
      tokens: councilResponse.tokens || null,
      isStreaming: false,
      sources: latestRagSearchSources,
    }
  }

  try {
    // Add placeholder cards so council columns can stream in
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
        sources: [],
        debateRole: roleDef ? { key: roleDef.key, label: roleDef.label } : null,
      })
    })

    // Build role prompts map for the RAG pipeline
    const rolePromptsForRag: Record<string, string> = {}
    if (isDebateMode) {
      models.forEach((modelId) => {
        const rp = getRoleSystemPrompt(submittedRoles[modelId] || 'neutral')
        if (rp) rolePromptsForRag[modelId] = rp
      })
    }

    const ragFinalData = await streamFetch(
      `${API_URL}${API_PREFIX}/rag/stream`,
      {
        query: prompt,
        selectedModels: models,
        needsContext,
        rolePrompts: Object.keys(rolePromptsForRag).length > 0 ? rolePromptsForRag : undefined,
        geminiThinkingLevel,
        ...(images && images.length > 0 ? { images } : {}),
      },
      {
        onToken: () => {},
        onStatus: () => {},
        onEvent: (event) => {
          if (!event || !event.type) return

          if (event.type === 'search_results') {
            clearSearchIndicator()
            if (Array.isArray(event.search_results) && event.search_results.length > 0) {
              latestRagSearchSources = [...event.search_results]
              useStore.getState().setSearchSources(event.search_results)
            }
            return
          }

          if (event.type === 'model_token') {
            clearSearchIndicator()
            const responseId = responseIds[event.model_name]
            if (!responseId || !event.content) return
            useStore.getState().updateResponse(responseId, {
              text: (useStore.getState().responses.find((r: any) => r.id === responseId)?.text || '') + event.content,
              isStreaming: true,
              actualModelName: event.actual_model_name || event.model_name,
              originalModelName: event.original_model_name || event.model_name,
            })
            return
          }

          if (event.type === 'model_done') {
            const normalized = normalizeCouncilResponse(event)
            ragResponsesByModel[normalized.modelName] = normalized
            useStore.getState().updateResponse(normalized.id, {
              text: normalized.text,
              error: normalized.error,
              tokens: normalized.tokens,
              actualModelName: normalized.actualModelName,
              originalModelName: normalized.originalModelName,
              isStreaming: false,
              sources: normalized.sources || [],
            })
            return
          }

          if (event.type === 'model_error') {
            const responseId = responseIds[event.model_name]
            if (!responseId) return
            useStore.getState().updateResponse(responseId, {
              text: `Error: ${event.error || 'Unknown model error'}`,
              error: true,
              isStreaming: false,
            })
          }
        },
        onError: (message) => {
          console.error('[RAG Stream] Error:', message)
        },
        signal,
      },
    )

    const ragData = ragFinalData || {}

    // Store sources for display
    if (ragData.search_results && Array.isArray(ragData.search_results) && ragData.search_results.length > 0) {
      latestRagSearchSources = [...ragData.search_results]
      useStore.getState().setSearchSources(ragData.search_results)
    } else {
      console.warn('[RAG Pipeline] No search results returned from Serper')
      useStore.getState().setSearchSources(null)
    }

    // Finalize responses from the done payload (fills any gaps from streaming)
    // Only overwrite if the done payload has richer data (e.g., tokens that model_done missed)
    if (Array.isArray(ragData.council_responses)) {
      ragData.council_responses.forEach((councilResponse: any) => {
        const normalized = normalizeCouncilResponse(councilResponse)
        const existing = ragResponsesByModel[normalized.modelName]
        // Preserve existing token data from model_done events if done payload lacks it
        if (existing?.tokens && !normalized.tokens) {
          normalized.tokens = existing.tokens
        }
        ragResponsesByModel[normalized.modelName] = normalized
        useStore.getState().updateResponse(normalized.id, {
          text: normalized.text,
          error: normalized.error,
          tokens: normalized.tokens,
          actualModelName: normalized.actualModelName,
          originalModelName: normalized.originalModelName,
          isStreaming: false,
          sources: normalized.sources || [],
        })
      })
    }

    // Build the final ordered response list
    const responses = models.map((modelId) => {
      if (ragResponsesByModel[modelId]) return ragResponsesByModel[modelId]
      const responseId = responseIds[modelId]
      const storeResponse = useStore.getState().responses.find((r: any) => r.id === responseId)
      return {
        id: responseId,
        modelName: modelId,
        actualModelName: storeResponse?.actualModelName || modelId,
        originalModelName: storeResponse?.originalModelName || modelId,
        text: storeResponse?.text || '',
        error: false,
        tokens: storeResponse?.tokens || null,
        isStreaming: false,
        sources: latestRagSearchSources,
      }
    })

    clearSearchIndicator()
    return { responses, ragData }
  } catch (ragError: any) {
    // Abort → re-throw so the orchestrator handles it
    if (ragError.name === 'AbortError' || ragError.code === 'ERR_CANCELED' || signal.aborted) {
      throw ragError
    }

    console.error('[RAG Pipeline] Error:', ragError.message, ragError.response?.status)

    // Subscription errors are non-recoverable — re-throw
    if (
      ragError.response?.status === 403 ||
      ragError.response?.data?.subscriptionRequired ||
      /HTTP 403/.test(ragError.message) ||
      /subscription required/i.test(ragError.message)
    ) {
      useStore.getState().clearResponses()
      clearSearchIndicator()
      throw ragError
    }

    // Other failures: clear partial state and signal the caller to fall back
    useStore.getState().clearResponses()
    clearSearchIndicator()
    return null
  }
}
