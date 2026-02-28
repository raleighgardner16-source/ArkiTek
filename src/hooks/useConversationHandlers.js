import { useState, useEffect, useRef, useCallback } from 'react'
import { useStore } from '../store/useStore'
import api from '../utils/api'
import { API_URL } from '../utils/config'
import { streamFetch } from '../utils/streamFetch'

export function useConversationHandlers({ isLoading, isGeneratingSummary }) {
  // ---- Store selectors ---- //
  const currentUser = useStore((state) => state.currentUser)
  const summary = useStore((state) => state.summary)
  const setSummary = useStore((state) => state.setSummary)
  const responses = useStore((state) => state.responses || [])
  const lastSubmittedPrompt = useStore((state) => state.lastSubmittedPrompt || '')
  const councilColumnConvoHistory = useStore((state) => state.councilColumnConvoHistory)
  const setCouncilColumnConvoHistory = useStore((state) => state.setCouncilColumnConvoHistory)

  // ---- Inline conversation state ---- //
  const [conversationInput, setConversationInput] = useState('')
  const [isSendingConvo, setIsSendingConvo] = useState(false)
  const [isSearchingInConvo, setIsSearchingInConvo] = useState(false)
  const [conversationContext, setConversationContext] = useState([])
  const [summaryConvoSources, setSummaryConvoSources] = useState({})
  const [showSummaryConvoSources, setShowSummaryConvoSources] = useState({})
  const [showCouncilColumnSources, setShowCouncilColumnSources] = useState({})

  // Single-model conversation state
  const [singleModelConvoInput, setSingleModelConvoInput] = useState('')
  const [isSendingSingleConvo, setIsSendingSingleConvo] = useState(false)
  const [isSearchingInSingleConvo, setIsSearchingInSingleConvo] = useState(false)
  const [singleModelConvoHistory, setSingleModelConvoHistory] = useState([])
  const [singleModelInitialSources, setSingleModelInitialSources] = useState([])
  const [singleConvoSources, setSingleConvoSources] = useState({})
  const [showSingleConvoSources, setShowSingleConvoSources] = useState({})

  // Council column conversation state
  const [councilColumnConvoInputs, setCouncilColumnConvoInputs] = useState({})
  const [councilColumnConvoSending, setCouncilColumnConvoSending] = useState({})
  const [councilColumnConvoSearching, setCouncilColumnConvoSearching] = useState({})
  const [councilColumnConvoSources, setCouncilColumnConvoSources] = useState({})
  const [showCouncilColumnConvoSources, setShowCouncilColumnConvoSources] = useState({})

  // Unified council follow-up
  const [councilFollowUpInput, setCouncilFollowUpInput] = useState('')
  const [councilFollowUpSending, setCouncilFollowUpSending] = useState(false)
  const [resultViewMode, setResultViewMode] = useState('summary')

  // ---- Refs ---- //
  const convoTextareaRef = useRef(null)
  const singleConvoTextareaRef = useRef(null)
  const singleConvoAbortControllerRef = useRef(null)

  // ---- Reset all conversation state (called by handleSubmit in MainView) ---- //
  const resetConversationState = useCallback(() => {
    setConversationInput('')
    setConversationContext([])
    setSingleModelConvoInput('')
    setSingleModelConvoHistory([])
    setCouncilColumnConvoInputs({})
    setCouncilColumnConvoHistory({})
    setCouncilColumnConvoSending({})
    setResultViewMode('summary')
    setSummaryConvoSources({})
    setShowSummaryConvoSources({})
    setShowCouncilColumnSources({})
    setSingleConvoSources({})
    setShowSingleConvoSources({})
  }, [setCouncilColumnConvoHistory])

  // ---- Fetch conversation context when summary appears ---- //
  useEffect(() => {
    if (summary && currentUser?.id) {
      fetchConversationContext()
    }
  }, [summary?.text, currentUser?.id])

  const fetchConversationContext = async () => {
    if (!currentUser?.id) return
    try {
      const response = await api.get(`${API_URL}/api/judge/context`)
      setConversationContext(response.data.context || [])
    } catch (error) {
      console.error('[MainView] Error fetching conversation context:', error)
      setConversationContext([])
    }
  }

  // ---- Summary conversation follow-up handler ---- //
  const handleSendConversation = async () => {
    if (!conversationInput.trim() || !currentUser?.id || isSendingConvo) return
    
    setIsSendingConvo(true)
    setIsSearchingInConvo(false)
    const userMsg = conversationInput.trim()
    setConversationInput('')
    
    const initialSummary = summary.initialSummary || summary.text
    
    setSummary(prev => ({
      ...prev,
      text: '',
      summary: '',
      initialSummary: initialSummary,
      prompt: `${prev.prompt || ''}\n\nUser: ${userMsg}`,
      conversationHistory: [...(prev.conversationHistory || []), {
        user: userMsg,
        assistant: '',
        timestamp: Date.now()
      }]
    }))
    
    try {
      const finalData = await streamFetch(`${API_URL}/api/judge/conversation/stream`, {
        userMessage: userMsg,
        conversationContext: conversationContext,
        originalSummaryText: summary.initialSummary || summary.text || ''
      }, {
        onToken: (token) => {
          setIsSearchingInConvo(false)
          setSummary(prev => {
            const updatedHistory = [...(prev.conversationHistory || [])]
            if (updatedHistory.length > 0) {
              updatedHistory[updatedHistory.length - 1] = {
                ...updatedHistory[updatedHistory.length - 1],
                assistant: (updatedHistory[updatedHistory.length - 1].assistant || '') + token
              }
            }
            return {
              ...prev,
              text: (prev.text || '') + token,
              summary: (prev.text || '') + token,
              conversationHistory: updatedHistory
            }
          })
        },
        onStatus: (message) => {
          if (message.toLowerCase().includes('search')) {
            setIsSearchingInConvo(true)
          }
        },
        onError: (message) => {
          console.error('[MainView] Stream error:', message)
        }
      })
      
      if (finalData) {
        if (finalData.searchResults && finalData.searchResults.length > 0) {
          const turnIndex = (summary.conversationHistory || []).length
          setSummaryConvoSources(prev => ({ ...prev, [turnIndex]: finalData.searchResults }))
        }
        
        if (finalData?.usedSearch) {
          useStore.getState().incrementQueryCount()
        }
        
        const store = useStore.getState()
        if (finalData.debugData) {
          const existingDebugData = store.ragDebugData || {}
          store.setRAGDebugData({
            ...existingDebugData,
            search: finalData.debugData.search || existingDebugData.search,
            refiner: finalData.debugData.refiner,
            categoryDetection: finalData.debugData.categoryDetection || existingDebugData.categoryDetection,
            conversationContext: existingDebugData.conversationContext || [],
            memoryContext: finalData.debugData.memoryContext || existingDebugData.memoryContext,
          })
        }
        
        setTimeout(async () => {
          await fetchConversationContext()
          const ragDebugData = store.ragDebugData
          if (ragDebugData && currentUser?.id) {
            try {
              const contextResponse = await api.get(`${API_URL}/api/judge/context`)
              store.setRAGDebugData({
                ...ragDebugData,
                conversationContext: contextResponse.data.context || []
              })
            } catch (error) {
              console.error('[MainView] Error updating debug pipeline context:', error)
            }
          }
        }, 500)
      }

      if (currentUser?.id && finalData?.tokens?.total > 0) {
        useStore.getState().triggerStatsRefresh()
      }

      if (finalData?.tokens) {
        useStore.getState().mergeTokenData('Judge Model', {
          input: finalData.tokens.input || 0,
          output: finalData.tokens.output || 0,
          total: finalData.tokens.total || 0,
        }, true)
      }

      const activeHistoryId = useStore.getState().currentHistoryId
      if (activeHistoryId && currentUser?.id) {
        const latestSummary = useStore.getState().summary
        const latestTurn = latestSummary?.conversationHistory?.slice(-1)[0]
        if (latestTurn && latestTurn.assistant) {
          api.post(`${API_URL}/api/history/update-conversation`, {
            historyId: activeHistoryId,
            turn: {
              type: 'judge',
              modelName: 'Judge (Summary)',
              user: userMsg,
              assistant: latestTurn.assistant,
              sources: finalData?.searchResults || [],
            }
          }).then(() => useStore.getState().triggerHistoryRefresh())
            .catch(err => console.error('[History] Error updating judge conversation turn:', err.message))
        }
      }
    } catch (error) {
      if (error.name === 'AbortError') {
        setSummary(prev => ({
          ...prev,
          text: initialSummary,
          summary: initialSummary,
          conversationHistory: (prev.conversationHistory || []).slice(0, -1)
        }))
      } else {
        console.error('[MainView] Error sending conversation:', error)
        setConversationInput(userMsg)
        setSummary(prev => ({
          ...prev,
          text: initialSummary,
          summary: initialSummary,
          conversationHistory: (prev.conversationHistory || []).slice(0, -1)
        }))
        alert('Failed to send message. Please try again.')
      }
    } finally {
      setIsSendingConvo(false)
      setIsSearchingInConvo(false)
    }
  }

  // Single-model conversation handler — uses SSE streaming
  const handleSendSingleModelConvo = async () => {
    if (!singleModelConvoInput.trim() || !currentUser?.id || isSendingSingleConvo) return
    if (responses.length !== 1) return

    if (singleConvoAbortControllerRef.current) {
      singleConvoAbortControllerRef.current.abort()
    }
    const abortController = new AbortController()
    singleConvoAbortControllerRef.current = abortController

    const singleResponse = responses[0]
    const modelName = singleResponse.modelName || singleResponse.actualModelName
    const userMsg = singleModelConvoInput.trim()
    setSingleModelConvoInput('')

    setIsSendingSingleConvo(true)
    setIsSearchingInSingleConvo(false)
    
    setSingleModelConvoHistory(prev => [
      ...prev,
      { user: userMsg, assistant: '', timestamp: Date.now() }
    ])
    
    try {
      const finalData = await streamFetch(`${API_URL}/api/model/conversation/stream`, {
        modelName: modelName,
        userMessage: userMsg,
        originalResponse: singleResponse.text || '',
        responseId: singleResponse.id,
      }, {
        onToken: (token) => {
          setIsSearchingInSingleConvo(false)
          setSingleModelConvoHistory(prev => {
            const updated = [...prev]
            if (updated.length > 0) {
              updated[updated.length - 1] = {
                ...updated[updated.length - 1],
                assistant: (updated[updated.length - 1].assistant || '') + token
              }
            }
            return updated
          })
        },
        onStatus: (message) => {
          if (message.toLowerCase().includes('search')) {
            setIsSearchingInSingleConvo(true)
          }
        },
        onError: (message) => {
          console.error('[SingleModelConvo] Stream error:', message)
        },
        signal: abortController.signal,
      })
      
      if (finalData?.searchResults && finalData.searchResults.length > 0) {
        const turnIndex = singleModelConvoHistory.length
        setSingleConvoSources(prev => ({ ...prev, [turnIndex]: finalData.searchResults }))
      }

      if (finalData?.usedSearch) {
        useStore.getState().incrementQueryCount()
      }

      if (currentUser?.id && finalData?.tokens?.total > 0) {
        useStore.getState().triggerStatsRefresh()
      }

      if (finalData?.tokens) {
        useStore.getState().mergeTokenData(modelName, {
          input: finalData.tokens.input || 0,
          output: finalData.tokens.output || 0,
          total: finalData.tokens.total || 0,
        }, false)
      }

      const activeHistoryId = useStore.getState().currentHistoryId
      if (activeHistoryId && currentUser?.id) {
        api.post(`${API_URL}/api/history/update-conversation`, {
          historyId: activeHistoryId,
          turn: {
            type: 'model',
            modelName: modelName,
            user: userMsg,
            assistant: finalData?.response || '',
            sources: finalData?.searchResults || [],
          }
        }).then(() => useStore.getState().triggerHistoryRefresh())
          .catch(err => console.error('[History] Error updating single model conversation turn:', err.message))
      }
    } catch (error) {
      if (error.name === 'AbortError') {
        setSingleModelConvoHistory(prev => prev.slice(0, -1))
      } else {
        console.error('[SingleModelConvo] Error sending message:', error)
        setSingleModelConvoHistory(prev => prev.slice(0, -1))
        setSingleModelConvoInput(userMsg)
        alert('Failed to send message. Please try again.')
      }
    } finally {
      setIsSendingSingleConvo(false)
      setIsSearchingInSingleConvo(false)
      singleConvoAbortControllerRef.current = null
    }
  }

  // Per-column council conversation handler (multi-model view)
  const handleSendCouncilColumnConvo = async (response) => {
    const responseId = response?.id
    if (!responseId || !currentUser?.id) return
    const rawInput = councilColumnConvoInputs[responseId] || ''
    const userMsg = rawInput.trim()
    if (!userMsg || councilColumnConvoSending[responseId]) return

    const modelName = response.modelName || response.actualModelName
    if (!modelName) return

    setCouncilColumnConvoInputs(prev => ({ ...prev, [responseId]: '' }))
    setCouncilColumnConvoSending(prev => ({ ...prev, [responseId]: true }))
    setCouncilColumnConvoSearching(prev => ({ ...prev, [responseId]: false }))
    const prevTurnCount = (councilColumnConvoHistory[responseId] || []).length
    setCouncilColumnConvoHistory(prev => ({
      ...prev,
      [responseId]: [...(prev[responseId] || []), { user: userMsg, assistant: '', timestamp: Date.now() }]
    }))

    try {
      const finalData = await streamFetch(`${API_URL}/api/model/conversation/stream`, {
        modelName,
        userMessage: userMsg,
        originalResponse: response.text || '',
        responseId,
      }, {
        onToken: (token) => {
          setCouncilColumnConvoSearching(prev => ({ ...prev, [responseId]: false }))
          setCouncilColumnConvoHistory(prev => {
            const turns = [...(prev[responseId] || [])]
            if (turns.length > 0) {
              turns[turns.length - 1] = {
                ...turns[turns.length - 1],
                assistant: (turns[turns.length - 1].assistant || '') + token
              }
            }
            return { ...prev, [responseId]: turns }
          })
        },
        onStatus: (message) => {
          if (message.toLowerCase().includes('search')) {
            setCouncilColumnConvoSearching(prev => ({ ...prev, [responseId]: true }))
          }
        },
        onError: (message) => {
          console.error('[Council Column Convo] Stream error:', message)
        }
      })

      if (finalData?.searchResults && finalData.searchResults.length > 0) {
        const sourceKey = `${responseId}-${prevTurnCount}`
        setCouncilColumnConvoSources(prev => ({ ...prev, [sourceKey]: finalData.searchResults }))
      }

      if (finalData?.usedSearch) {
        useStore.getState().incrementQueryCount()
      }

      if (finalData?.tokens) {
        useStore.getState().mergeTokenData(modelName, {
          input: finalData.tokens.input || 0,
          output: finalData.tokens.output || 0,
          total: finalData.tokens.total || 0,
        }, false)
      }

      if (currentUser?.id && finalData?.tokens?.total > 0) {
        useStore.getState().triggerStatsRefresh()
      }

      const activeHistoryId = useStore.getState().currentHistoryId
      if (activeHistoryId && currentUser?.id) {
        const latestTurns = councilColumnConvoHistory[responseId] || []
        const latestTurn = latestTurns.length > 0 ? latestTurns[latestTurns.length - 1] : null
        const assistantText = finalData?.response || latestTurn?.assistant || ''
        if (assistantText) {
          api.post(`${API_URL}/api/history/update-conversation`, {
            historyId: activeHistoryId,
            turn: {
              type: 'model',
              modelName: modelName,
              user: userMsg,
              assistant: assistantText,
              sources: finalData?.searchResults || [],
            }
          }).then(() => useStore.getState().triggerHistoryRefresh())
            .catch(err => console.error('[History] Error updating council column conversation turn:', err.message))
        }
      }
    } catch (error) {
      if (error.name === 'AbortError') {
        setCouncilColumnConvoHistory(prev => ({
          ...prev,
          [responseId]: (prev[responseId] || []).slice(0, -1)
        }))
      } else {
        console.error('[Council Column Convo] Error:', error)
        setCouncilColumnConvoHistory(prev => ({
          ...prev,
          [responseId]: (prev[responseId] || []).slice(0, -1)
        }))
        setCouncilColumnConvoInputs(prev => ({ ...prev, [responseId]: userMsg }))
      }
    } finally {
      setCouncilColumnConvoSending(prev => ({ ...prev, [responseId]: false }))
      setCouncilColumnConvoSearching(prev => ({ ...prev, [responseId]: false }))
    }
  }

  // Cleanup local per-column convo state when responses are cleared
  useEffect(() => {
    if (responses.length === 0) {
      setCouncilColumnConvoInputs({})
      setCouncilColumnConvoHistory({})
      setCouncilColumnConvoSending({})
      setCouncilColumnConvoSearching({})
      setCouncilColumnConvoSources({})
      setShowCouncilColumnConvoSources({})
      setShowCouncilColumnSources({})
      setCouncilFollowUpInput('')
      setCouncilFollowUpSending(false)
    }
  }, [responses.length])

  // Unified council follow-up: sends the same prompt to ALL council models at once
  const handleSendCouncilFollowUp = async () => {
    const userMsg = councilFollowUpInput.trim()
    if (!userMsg || councilFollowUpSending || !currentUser?.id) return

    const activeResponses = responses.filter(r => !r.error)
    if (activeResponses.length === 0) return

    setCouncilFollowUpInput('')
    setCouncilFollowUpSending(true)

    api.post(`${API_URL}/api/conversation/track-follow-up`, {
      userMessage: userMsg,
    }).catch(err => console.error('[Council Follow-Up] Error tracking prompt:', err.message))

    activeResponses.forEach(response => {
      const responseId = response.id
      setCouncilColumnConvoHistory(prev => ({
        ...prev,
        [responseId]: [...(prev[responseId] || []), { user: userMsg, assistant: '', timestamp: Date.now() }]
      }))
      setCouncilColumnConvoSending(prev => ({ ...prev, [responseId]: true }))
      setCouncilColumnConvoSearching(prev => ({ ...prev, [responseId]: false }))
    })

    const promises = activeResponses.map(async (response) => {
      const responseId = response.id
      const modelName = response.modelName || response.actualModelName
      if (!modelName) return
      const prevTurnCount = (councilColumnConvoHistory[responseId] || []).length

      try {
        const finalData = await streamFetch(`${API_URL}/api/model/conversation/stream`, {
          modelName,
          userMessage: userMsg,
          originalResponse: response.text || '',
          responseId,
          isCouncilFollowUp: true,
        }, {
          onToken: (token) => {
            setCouncilColumnConvoSearching(prev => ({ ...prev, [responseId]: false }))
            setCouncilColumnConvoHistory(prev => {
              const turns = [...(prev[responseId] || [])]
              if (turns.length > 0) {
                turns[turns.length - 1] = {
                  ...turns[turns.length - 1],
                  assistant: (turns[turns.length - 1].assistant || '') + token
                }
              }
              return { ...prev, [responseId]: turns }
            })
          },
          onStatus: (message) => {
            if (message.toLowerCase().includes('search')) {
              setCouncilColumnConvoSearching(prev => ({ ...prev, [responseId]: true }))
            }
          },
          onError: (message) => {
            console.error('[Council Follow-Up] Stream error:', message)
          }
        })

        if (finalData?.searchResults && finalData.searchResults.length > 0) {
          const sourceKey = `${responseId}-${prevTurnCount}`
          setCouncilColumnConvoSources(prev => ({ ...prev, [sourceKey]: finalData.searchResults }))
        }
        if (finalData?.usedSearch) {
          useStore.getState().incrementQueryCount()
        }
        if (finalData?.tokens) {
          useStore.getState().mergeTokenData(modelName, {
            input: finalData.tokens.input || 0,
            output: finalData.tokens.output || 0,
            total: finalData.tokens.total || 0,
          }, false)
        }
        if (currentUser?.id && finalData?.tokens?.total > 0) {
          useStore.getState().triggerStatsRefresh()
        }

        const activeHistoryId = useStore.getState().currentHistoryId
        if (activeHistoryId && currentUser?.id) {
          const assistantText = finalData?.response || ''
          if (assistantText) {
            api.post(`${API_URL}/api/history/update-conversation`, {
              historyId: activeHistoryId,
              turn: {
                type: 'model',
                modelName,
                user: userMsg,
                assistant: assistantText,
                sources: finalData?.searchResults || [],
              }
            }).then(() => useStore.getState().triggerHistoryRefresh())
              .catch(err => console.error('[History] Error updating council follow-up turn:', err.message))
          }
        }
      } catch (error) {
        if (error.name !== 'AbortError') {
          console.error('[Council Follow-Up] Error for', modelName, ':', error)
        }
        setCouncilColumnConvoHistory(prev => ({
          ...prev,
          [responseId]: (prev[responseId] || []).slice(0, -1)
        }))
      } finally {
        setCouncilColumnConvoSending(prev => ({ ...prev, [responseId]: false }))
        setCouncilColumnConvoSearching(prev => ({ ...prev, [responseId]: false }))
      }
    })

    await Promise.allSettled(promises)
    setCouncilFollowUpSending(false)
  }

  // Auto-grow conversation textarea
  const adjustConvoTextarea = () => {
    const textarea = convoTextareaRef.current
    if (textarea) {
      textarea.style.height = 'auto'
      textarea.style.height = Math.min(textarea.scrollHeight, 150) + 'px'
    }
  }

  // Auto-grow single-model conversation textarea
  const adjustSingleConvoTextarea = () => {
    const textarea = singleConvoTextareaRef.current
    if (textarea) {
      textarea.style.height = 'auto'
      textarea.style.height = Math.min(textarea.scrollHeight, 150) + 'px'
    }
  }

  // ---- Computed values for inline display ---- //
  const hasActiveConversation = !!(lastSubmittedPrompt && (responses.length > 0 || summary))
  const inlineResponseText = summary
    ? (summary.singleModel && summary.summary ? summary.summary : (summary.initialSummary || summary.text))
    : (responses.length === 1 ? responses[0].text : null)
  const inlineResponseLabel = summary
    ? (summary.singleModel ? (summary.modelName || 'Model') : 'Summary')
    : (responses.length === 1 ? (responses[0].modelName || 'Model') : null)
  const showConversationInput = !!(
    summary &&
    !summary.singleModel &&
    summary.text &&
    summary.text.trim().length > 0 &&
    resultViewMode === 'summary'
  )
  const showSingleModelConvoInput = !summary && responses.length === 1 && !responses[0]?.error && lastSubmittedPrompt
  const summaryInitialSources = Array.isArray(summary?.sources) ? summary.sources : []

  useEffect(() => {
    setSingleModelInitialSources([])
  }, [lastSubmittedPrompt])

  useEffect(() => {
    if (!showSingleModelConvoInput) return
    if (singleModelInitialSources.length > 0) return
    const initialSources = Array.isArray(responses[0]?.sources) ? responses[0].sources : []
    if (initialSources.length === 0) return
    setSingleModelInitialSources([...initialSources])
  }, [showSingleModelConvoInput, singleModelInitialSources.length, responses])

  // ---- Helper: get short provider name from model ID ---- //
  const getProviderDisplayName = (modelName) => {
    const name = (modelName || '').toLowerCase()
    if (name.includes('gpt') || name.includes('openai') || name.includes('o3') || name.includes('o4')) return 'ChatGPT'
    if (name.includes('claude') || name.includes('anthropic')) return 'Claude'
    if (name.includes('gemini') || name.includes('google')) return 'Gemini'
    if (name.includes('grok') || name.includes('xai')) return 'Grok'
    if (name.includes('llama') || name.includes('meta')) return 'Llama'
    if (name.includes('deepseek')) return 'DeepSeek'
    if (name.includes('mistral')) return 'Mistral'
    return 'Model'
  }

  // ---- Phase detection for council streaming view ---- //
  const responsesWithText = responses.filter(r => r.text?.length > 0 && !r.error)
  const councilDisplayResponses = responses.filter(r => !r.error)
  const councilColumnCount = councilDisplayResponses.length
  const primaryResponse = responses.find(r => !r.error) || null
  const isSingleModel = responses.length <= 1
  const hasSummaryTokens = !!(summary?.text && summary.text.trim().length > 0)
  const summaryInitializing = !!(summary && summary.isStreaming && !hasSummaryTokens)

  const showCouncilLoading = isLoading && responses.length === 0
  const showCouncilReviewPhase = !isLoading && !isGeneratingSummary && !summary && !isSingleModel && responses.length > 0
  const hasCouncilResponsesForView = responses.filter(r => !r.error).length >= 2
  const canToggleResultViews = !isSingleModel && hasSummaryTokens && !isGeneratingSummary && !(summary && summary.isStreaming) && hasCouncilResponsesForView
  const canShowCouncilSideBySideButton = !!(
    summary &&
    !summary.singleModel &&
    !isLoading &&
    !isGeneratingSummary &&
    !(summary && summary.isStreaming) &&
    hasCouncilResponsesForView
  )

  // Reset resultViewMode when council toggle becomes unavailable
  useEffect(() => {
    if (!canToggleResultViews && resultViewMode !== 'summary') {
      setResultViewMode('summary')
    }
  }, [canToggleResultViews, resultViewMode])

  return {
    // State + setters
    conversationInput, setConversationInput,
    isSendingConvo,
    isSearchingInConvo,
    conversationContext,
    summaryConvoSources, setSummaryConvoSources,
    showSummaryConvoSources, setShowSummaryConvoSources,
    showCouncilColumnSources, setShowCouncilColumnSources,
    singleModelConvoInput, setSingleModelConvoInput,
    isSendingSingleConvo,
    isSearchingInSingleConvo,
    singleModelConvoHistory, setSingleModelConvoHistory,
    singleModelInitialSources,
    singleConvoSources,
    showSingleConvoSources, setShowSingleConvoSources,
    councilColumnConvoInputs, setCouncilColumnConvoInputs,
    councilColumnConvoHistory,
    councilColumnConvoSending,
    councilColumnConvoSearching,
    councilColumnConvoSources,
    showCouncilColumnConvoSources, setShowCouncilColumnConvoSources,
    councilFollowUpInput, setCouncilFollowUpInput,
    councilFollowUpSending,
    resultViewMode, setResultViewMode,

    // Refs
    convoTextareaRef,
    singleConvoTextareaRef,
    singleConvoAbortControllerRef,

    // Handlers
    resetConversationState,
    fetchConversationContext,
    handleSendConversation,
    handleSendSingleModelConvo,
    handleSendCouncilColumnConvo,
    handleSendCouncilFollowUp,
    adjustConvoTextarea,
    adjustSingleConvoTextarea,
    getProviderDisplayName,

    // Computed
    hasActiveConversation,
    inlineResponseText,
    inlineResponseLabel,
    showConversationInput,
    showSingleModelConvoInput,
    summaryInitialSources,
    responsesWithText,
    councilDisplayResponses,
    councilColumnCount,
    primaryResponse,
    isSingleModel,
    hasSummaryTokens,
    summaryInitializing,
    showCouncilLoading,
    showCouncilReviewPhase,
    hasCouncilResponsesForView,
    canToggleResultViews,
    canShowCouncilSideBySideButton,
  }
}
