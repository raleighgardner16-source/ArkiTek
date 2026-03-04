import { useState, useEffect, useRef } from 'react'
import { useStore } from '../store/useStore'
import { detectCategory } from '../utils/categoryDetector'
import { executeRAGPipeline } from '../services/ragPipeline'
import { executeDirectLLM } from '../services/directLLMExecution'
import api from '../utils/api'

export function usePromptSubmission() {
  const [isLoading, setIsLoading] = useState(false)
  const abortControllerRef = useRef<AbortController | null>(null)

  const shouldSubmit = useStore((state) => state.shouldSubmit)

  // ── Clear all responses, windows, and server-side context ──────────
  const clearAllWindows = () => {
    try {
      const store = useStore.getState()
      store.clearResponses()
      store.setSummaryMinimized(true)

      const currentUser = store.currentUser
      if (currentUser?.id) {
        api.post('/judge/clear-context').catch((err) => console.error('[Clear Context] Error:', err))
        api.post('/model/clear-context').catch((err) => console.error('[Clear Model Context] Error:', err))
      }
    } catch (error: any) {
      console.error('[clearAllWindows] Error clearing windows:', error)
    }
  }

  // ── Abort the current submission and keep partial results ────────
  const handleCancelPrompt = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort()
      abortControllerRef.current = null
    }

    const store = useStore.getState()
    setIsLoading(false)
    store.setIsSearchingWeb(false)
    store.stopAllStreaming()
    store.clearGenerateSummary()

    // Only preserve on screen if at least one model produced text
    const hasVisibleContent = store.responses.some((r: any) => r.text && r.text.trim().length > 0)
    if (hasVisibleContent) {
      store.setIsCancelledPrompt(true)

      // Collect whatever tokens are already available and add a cancelled marker
      const cancelledTokenData: any[] = []
      store.responses.forEach((r: any) => {
        if (r.tokens) {
          cancelledTokenData.push({ modelName: r.modelName || r.actualModelName, tokens: r.tokens })
        }
      })
      cancelledTokenData.push({
        modelName: 'Cancelled Prompt',
        isCancelledPrompt: true,
        isJudge: false,
        isPipeline: false,
        tokens: null,
      })
      store.setTokenData(cancelledTokenData)
    } else {
      store.clearResponses()
      store.setCurrentPrompt('')
      store.setLastSubmittedPrompt('')
      store.setLastSubmittedCategory('')
    }
  }

  // ── Main prompt submission orchestrator ────────────────────────────
  const handlePromptSubmit = async () => {
    const store = useStore.getState()
    const latestSelectedModels = store.selectedModels
    const currentPrompt = store.currentPrompt

    if (!currentPrompt.trim() || latestSelectedModels.length === 0) return
    store.clearGenerateSummary()

    const savedPrompt = currentPrompt.trim()
    store.setLastSubmittedPrompt(savedPrompt)

    // Deduplicate selectedModels
    const uniqueModels = [...new Set(latestSelectedModels)]
    if (uniqueModels.length !== latestSelectedModels.length) {
      console.warn('[handlePromptSubmit] Found duplicate models, deduplicating')
    }
    const modelsToUse = uniqueModels

    // Cancel any in-flight request
    if (abortControllerRef.current) {
      abortControllerRef.current.abort()
    }
    const abortController = new AbortController()
    abortControllerRef.current = abortController

    setIsLoading(true)

    // Finalize the previous history entry
    const currentHistoryId = store.currentHistoryId
    const currentUser = store.currentUser
    if (currentHistoryId && currentUser?.id) {
      api
        .post('/history/finalize', { historyId: currentHistoryId })
        .catch((err) => console.error('[History] Error finalizing previous entry:', err.message))
    }

    store.clearResponses()
    store.setIsReopenedHistoryChat(false)
    store.setSearchSources(null)

    // Clear server-side judge/model conversation context
    if (currentUser?.id) {
      api.post('/judge/clear-context').catch((err) => console.error('[Clear Context] Error:', err))
      api.post('/model/clear-context').catch((err) => console.error('[Clear Model Context] Error:', err))
    }

    try {
      // Snapshot debate-mode state for this submission
      const isDebateMode = useStore.getState().promptMode === 'debate'
      const submittedRoles: Record<string, string> = isDebateMode
        ? { ...useStore.getState().modelRoles }
        : {}

      // ── 1. Category detection ───────────────────────────────────
      let category = 'General Knowledge/Other'
      let needsSearch = false
      let needsContext = false
      let detectionResult: any = null
      let categoryDetectionTokens: any = null

      try {
        detectionResult = await detectCategory(currentPrompt, [], isDebateMode)
        category = detectionResult.category || 'General Knowledge/Other'
        needsSearch = detectionResult.needsSearch || false
        needsContext = detectionResult.needsContext || false
        categoryDetectionTokens = detectionResult.tokens || null

        if (detectionResult?.rawResponse) {
          useStore.getState().setGeminiDetectionResponse(detectionResult.rawResponse)
        }
      } catch (error: any) {
        console.error('[Category Detection] Error:', error)
      }

      useStore.getState().setCategory(Date.now().toString(), category)
      useStore.getState().setLastSubmittedCategory(category)

      let responses: any[] = []
      let ragData: any = null

      // ── 2. Execute models (RAG or Direct) ───────────────────────
      if (needsSearch) {
        const ragResult = await executeRAGPipeline({
          prompt: currentPrompt,
          models: modelsToUse,
          isDebateMode,
          submittedRoles,
          needsContext,
          signal: abortController.signal,
        })

        if (ragResult) {
          responses = ragResult.responses
          ragData = ragResult.ragData

          useStore.getState().setQueryCount(1)
          useStore.getState().setRAGDebugData({
            search: ragData.search_results
              ? { query: currentPrompt, results: ragData.search_results }
              : null,
            refiner: null,
            categoryDetection: {
              category,
              needsSearch,
              needsContext,
              prompt: detectionResult?.prompt || null,
              response: detectionResult?.rawResponse || null,
            },
            memoryContext: ragData.memory_context || null,
          })
        } else {
          // RAG failed with a recoverable error — fall back to direct LLM
          needsSearch = false
        }
      }

      if (!needsSearch || (needsSearch && responses.length === 0)) {
        useStore.getState().setQueryCount(0)

        const directResult = await executeDirectLLM({
          prompt: currentPrompt,
          models: modelsToUse,
          isDebateMode,
          submittedRoles,
          needsContext,
          userId: currentUser?.id || null,
          signal: abortController.signal,
        })

        responses = directResult.responses

        if (!ragData) {
          useStore.getState().setRAGDebugData({
            search: null,
            refiner: null,
            categoryDetection: {
              category,
              needsSearch,
              needsContext,
              prompt: detectionResult?.prompt || null,
              response: detectionResult?.rawResponse || null,
            },
            memoryContext: directResult.memoryContextData || null,
          })
        }
      }

      setIsLoading(false)

      // If cancelled, collect whatever token data is available and stop
      if (abortController.signal.aborted) {
        console.log('[handlePromptSubmit] Request cancelled — collecting partial token data')
        const cancelledTokenData: any[] = []
        if (categoryDetectionTokens) {
          cancelledTokenData.push({
            modelName: 'Category Detection (Refiner)',
            tokens: categoryDetectionTokens,
            isPipeline: true,
          })
        }
        responses.forEach((r) => {
          if (r.tokens) cancelledTokenData.push({ modelName: r.modelName, tokens: r.tokens })
        })
        cancelledTokenData.push({
          modelName: 'Cancelled Prompt',
          isCancelledPrompt: true,
          isJudge: false,
          isPipeline: false,
          tokens: null,
        })
        useStore.getState().setTokenData(cancelledTokenData)
        return
      }

      // ── 3. Collect token data ───────────────────────────────────
      const tokenData: any[] = []
      if (categoryDetectionTokens) {
        tokenData.push({
          modelName: 'Category Detection (Refiner)',
          tokens: categoryDetectionTokens,
          isPipeline: true,
        })
      }
      responses.forEach((r) => {
        if (r.tokens) tokenData.push({ modelName: r.modelName, tokens: r.tokens })
      })

      // ── 4. Track prompt on server ───────────────────────────────
      if (currentUser?.id) {
        try {
          let sources = null
          if (ragData?.search_results && Array.isArray(ragData.search_results)) {
            sources = ragData.search_results.map((s: any) => ({
              title: s.title,
              link: s.link,
              snippet: s.snippet,
            }))
          }

          await api.post('/stats/prompt', {
            promptText: currentPrompt,
            category,
            responses: responses.length > 0 ? responses : null,
            summary: null,
            facts: null,
            sources,
            promptMode: useStore.getState().promptMode,
          })
          useStore.getState().triggerStatsRefresh()
        } catch (error: any) {
          console.error('[Prompt Tracking] Error:', error.message)
        }
      }

      // ── 5. Update local stats ───────────────────────────────────
      const modelNames = modelsToUse.map((id) => {
        const firstDashIndex = id.indexOf('-')
        return `${id.substring(0, firstDashIndex)}-${id.substring(firstDashIndex + 1)}`
      })
      useStore.getState().updateStats(currentPrompt, modelNames, category)

      // ── 6. Persist token data & refresh stats ───────────────────
      useStore.getState().setTokenData(tokenData)
      if (currentUser?.id) {
        useStore.getState().triggerStatsRefresh()
      }

      // ── 7. Auto-save to history ─────────────────────────────────
      if (currentUser?.id) {
        try {
          const currentSummary = useStore.getState().summary
          const currentResponses = useStore.getState().responses || responses
          const searchSrcs = useStore.getState().searchSources

          const autoSaveResponse = await api.post('/history/auto-save', {
            originalPrompt: savedPrompt,
            category: category || 'General',
            promptMode: useStore.getState().promptMode || 'general',
            responses: currentResponses.map((r: any) => ({
              modelName: r.modelName || r.actualModelName || 'Unknown',
              actualModelName: r.actualModelName || r.modelName || 'Unknown',
              text: r.text || '',
              error: r.error || false,
              tokens: r.tokens || null,
            })),
            summary: currentSummary
              ? {
                  text: currentSummary.text || '',
                  consensus: currentSummary.consensus || null,
                  agreements: currentSummary.agreements || [],
                  disagreements: currentSummary.disagreements || [],
                  singleModel: currentSummary.singleModel || false,
                  modelName: currentSummary.modelName || null,
                }
              : null,
            sources: searchSrcs || ragData?.search_results || [],
            facts: [],
          })

          if (autoSaveResponse.data?.historyId) {
            useStore.getState().setCurrentHistoryId(autoSaveResponse.data.historyId)
            console.log('[History] Auto-saved conversation, tracking:', autoSaveResponse.data.historyId)
          }
        } catch (error: any) {
          console.error('[History] Error auto-saving:', error.message)
        }
      }

      // Clear the prompt input
      useStore.getState().setCurrentPrompt('')
    } catch (error: any) {
      if (
        error.name === 'AbortError' ||
        error.code === 'ERR_CANCELED' ||
        abortController.signal.aborted
      ) {
        console.log('[handlePromptSubmit] Request cancelled by user — collecting partial token data')
        const store = useStore.getState()
        const currentResponses = store.responses || []
        const cancelledTokenData: any[] = []
        currentResponses.forEach((r: any) => {
          if (r.tokens) {
            cancelledTokenData.push({ modelName: r.modelName || r.actualModelName, tokens: r.tokens })
          }
        })
        cancelledTokenData.push({
          modelName: 'Cancelled Prompt',
          isCancelledPrompt: true,
          isJudge: false,
          isPipeline: false,
          tokens: null,
        })
        store.setTokenData(cancelledTokenData)
        return
      }

      console.error('[handlePromptSubmit] Unhandled error:', error)
      console.error('[handlePromptSubmit] Error details:', {
        message: error.message,
        stack: error.stack,
        response: error.response?.data,
        status: error.response?.status,
      })

      const errorMessage =
        error.response?.data?.error || error.message || 'An unexpected error occurred. Please try again.'

      useStore.getState().addResponse({
        id: `error-${Date.now()}`,
        modelName: 'Error',
        actualModelName: 'Error',
        originalModelName: 'Error',
        text: `Error: ${errorMessage}`,
        error: true,
      })

      if (error.response?.status === 403 || error.response?.data?.subscriptionRequired) {
        useStore.getState().addResponse({
          id: `subscription-error-${Date.now()}`,
          modelName: 'Subscription Required',
          actualModelName: 'Subscription Required',
          originalModelName: 'Subscription Required',
          text: 'Active subscription required. Please subscribe to use this service. You can manage your subscription in Settings.',
          error: true,
        })
      }
    } finally {
      if (abortControllerRef.current === abortController) {
        abortControllerRef.current = null
      }
      setIsLoading(false)
      useStore.getState().setIsSearchingWeb(false)
    }
  }

  // Auto-trigger when the store flag is set (user pressed Enter / clicked Submit)
  useEffect(() => {
    const store = useStore.getState()
    if (shouldSubmit && store.currentPrompt && store.selectedModels.length > 0) {
      handlePromptSubmit()
      store.clearSubmit()
    }
  }, [shouldSubmit])

  return { isLoading, handlePromptSubmit, handleCancelPrompt, clearAllWindows }
}
