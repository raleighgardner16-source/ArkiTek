import type React from 'react';
import { useState, useEffect, useRef, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Flame, Search, Lock, FileText, PauseCircle, MessageCircle, Swords, AlertTriangle } from 'lucide-react'
import { useStore } from '../store/useStore'
import { getAllModels } from '../services/llmProviders'
import { getModelShortLabel } from '../utils/modelNames'
import { detectCategory } from '../utils/categoryDetector'
import { getTheme } from '../utils/theme'
import api from '../utils/api'
import { useScrollManagement } from '../hooks/useScrollManagement'
import MarkdownRenderer from './MarkdownRenderer'
import TokenUsageWindow from './TokenUsageWindow'
import CostBreakdownWindow from './CostBreakdownWindow'
import { useConversationHandlers } from '../hooks/useConversationHandlers'
import ModelSelector from './ModelSelector'
import TopActionBar from './TopActionBar'
import CouncilColumnsView from './CouncilColumnsView'
import ConversationInput from './ConversationInput'
import StreakBreakModal from './StreakBreakModal'
import { spacing, fontSize, fontWeight, radius, zIndex, transition, layout, sx, createStyles } from '../utils/styles'

interface MainViewProps {
  onClearAll: () => void
  subscriptionRestricted?: boolean
  subscriptionPaused?: boolean
  subscriptionExpiring?: boolean
  subscriptionRenewalDate?: string | null
  isLoading?: boolean
  isGeneratingSummary?: boolean
  onCancelPrompt?: () => void
  onCancelSummary?: () => void
}

const MainView = ({ onClearAll, subscriptionRestricted = false, subscriptionPaused = false, subscriptionExpiring = false, subscriptionRenewalDate = null, isLoading = false, isGeneratingSummary = false, onCancelPrompt, onCancelSummary }: MainViewProps) => {
  const selectedModels = useStore((state) => state.selectedModels)
  const setSelectedModels = useStore((state) => state.setSelectedModels)
  const currentPrompt = useStore((state) => state.currentPrompt)
  const setCurrentPrompt = useStore((state) => state.setCurrentPrompt)
  const lastSubmittedPrompt = useStore((state) => state.lastSubmittedPrompt || '')
  const lastSubmittedCategory = useStore((state) => state.lastSubmittedCategory || '')
  const triggerSubmit = useStore((state) => state.triggerSubmit)
  const triggerGenerateSummary = useStore((state) => state.triggerGenerateSummary)
  const responses = useStore((state) => state.responses || [])
  const clearResponses = useStore((state) => state.clearResponses)
  const clearLastSubmittedPrompt = useStore((state) => state.clearLastSubmittedPrompt)
  const currentUser = useStore((state) => state.currentUser)
  const summary = useStore((state) => state.summary)
  const ragDebugData = useStore((state) => state.ragDebugData)
  const statsRefreshTrigger = useStore((state) => state.statsRefreshTrigger)
  const theme = useStore((state) => state.theme || 'dark')
  const isNavExpanded = useStore((state) => state.isNavExpanded)
  const showCouncilPanel = useStore((state) => state.showCouncilPanel)
  const setShowCouncilPanel = useStore((state) => state.setShowCouncilPanel)
  const toggleCouncilPanel = useStore((state) => state.toggleCouncilPanel)
  const setActiveTab = useStore((state) => state.setActiveTab)
  const currentHistoryId = useStore((state) => state.currentHistoryId)
  const currentTheme = getTheme(theme)
  const s = createStyles(currentTheme)
  // Combined lock: either fully restricted (expired) or paused (voluntary)
  const [usageExhausted, setUsageExhausted] = useState(false)
  const [userPlan, setUserPlan] = useState(currentUser?.plan || 'free_trial')
  const isPromptLocked = subscriptionRestricted || subscriptionPaused || usageExhausted
  const isFreePlan = currentUser?.plan === 'free_trial' && !currentUser?.stripeSubscriptionId
  const navWidth = isNavExpanded ? '240px' : '60px'
  const [mountReady, setMountReady] = useState(false)
  useEffect(() => { const id = requestAnimationFrame(() => setMountReady(true)); return () => cancelAnimationFrame(id) }, [])
  const [streakDays, setStreakDays] = useState(0)
  const [streakBreakData, setStreakBreakData] = useState<any>(null)
  const [showStreakBreakModal, setShowStreakBreakModal] = useState(false)
  const setGeminiDetectionResponse = useStore((state) => state.setGeminiDetectionResponse)
  const isSearchingWeb = useStore((state) => state.isSearchingWeb)
  const [showNoModelNotification, setShowNoModelNotification] = useState(false)
  const [showCouncilTooltip, setShowCouncilTooltip] = useState(false)
  const promptMode = useStore((state) => state.promptMode)
  const setPromptMode = useStore((state) => state.setPromptMode)
  const modelRoles = useStore((state) => state.modelRoles)
  const setModelRole = useStore((state) => state.setModelRole)
  const clearModelRoles = useStore((state) => state.clearModelRoles)
  const autoSmartProviders = useStore((state) => state.autoSmartProviders)
  const setAutoSmartProviders = useStore((state) => state.setAutoSmartProviders)
  const currentPromptFavorite = useStore((state) => state.currentPromptFavorite)
  const setCurrentPromptFavorite = useStore((state) => state.setCurrentPromptFavorite)
  const currentPromptSessionId = useStore((state) => state.currentPromptSessionId)
  const isReopenedHistoryChat = useStore((state) => state.isReopenedHistoryChat)
  const isCancelledPrompt = useStore((state) => state.isCancelledPrompt)
  const [sharingPrompt, setSharingPrompt] = useState(false)
  const [shareSuccess, setShareSuccess] = useState(false)

  const handleSharePrompt = useCallback(async () => {
    if (sharingPrompt || responses.length === 0 || !lastSubmittedPrompt) return
    setSharingPrompt(true)
    try {
      const shareResponses = responses
        .filter((r: any) => r.text && !r.error)
        .map((r: any) => ({
          modelName: r.modelName,
          actualModelName: r.actualModelName,
          originalModelName: r.originalModelName,
          text: r.text,
          error: false,
        }))
      if (shareResponses.length === 0) return setSharingPrompt(false)
      const shareSummary = summary && !summary.error ? {
        text: summary.text || '',
        consensus: summary.consensus ?? null,
        summary: summary.summary || '',
        agreements: summary.agreements || [],
        disagreements: summary.disagreements || [],
        differences: summary.differences || [],
        singleModel: summary.singleModel || false,
        modelName: summary.modelName || null,
      } : null
      const res = await api.post('/share', {
        prompt: lastSubmittedPrompt,
        category: lastSubmittedCategory,
        responses: shareResponses,
        summary: shareSummary,
      })
      if (res.data?.data?.shareToken) {
        const shareUrl = `${window.location.origin}/share/${res.data.data.shareToken}`
        await navigator.clipboard.writeText(shareUrl)
        setShareSuccess(true)
        setTimeout(() => setShareSuccess(false), 3000)
      }
    } catch (err) {
      console.error('[Share] Error sharing prompt:', err)
    } finally {
      setSharingPrompt(false)
    }
  }, [sharingPrompt, responses, lastSubmittedPrompt, lastSubmittedCategory, summary])

  // Conversation handlers hook
  const conversation = useConversationHandlers({ isLoading, isGeneratingSummary })
  const {
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
    convoTextareaRef,
    singleConvoTextareaRef,
    singleConvoAbortControllerRef,
    resetConversationState,
    fetchConversationContext,
    handleSendConversation,
    handleSendSingleModelConvo,
    handleSendCouncilColumnConvo,
    handleSendCouncilFollowUp,
    adjustConvoTextarea,
    adjustSingleConvoTextarea,
    getProviderDisplayName,
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
  } = conversation

  const [showClearSummaryTooltip, setShowClearSummaryTooltip] = useState(false)
  const [showPostPromptTooltip, setShowPostPromptTooltip] = useState(false)
  const [showClearTooltip, setShowClearTooltip] = useState(false)
  const [showPostPromptSingleTooltip, setShowPostPromptSingleTooltip] = useState(false)
  const [showSendTooltip, setShowSendTooltip] = useState(false)
  const [showSingleTokenUsage, setShowSingleTokenUsage] = useState(false)
  const [showTopCostBreakdown, setShowTopCostBreakdown] = useState(false)
  const tokenData = useStore((state) => state.tokenData)
  const queryCount = useStore((state) => state.queryCount || 0)

  const [isCouncilColumnInputFocused, setIsCouncilColumnInputFocused] = useState(false)
  const [isSubmitPending, setIsSubmitPending] = useState(false)

  const handlePickFavorite = useCallback(async (responseId: string) => {
    if (isReopenedHistoryChat) return
    const isAlreadyFavorite = currentPromptFavorite === responseId
    const newFavorite = isAlreadyFavorite ? null : responseId
    setCurrentPromptFavorite(newFavorite)

    if (currentUser?.id && currentPromptSessionId) {
      try {
        const response = responses.find((r: any) => r.id === responseId)
        const modelId = response?.modelName || responseId.split('-').slice(0, 2).join('-')
        const firstDash = modelId.indexOf('-')
        const provider = firstDash > 0 ? modelId.substring(0, firstDash) : modelId
        const model = firstDash > 0 ? modelId.substring(firstDash + 1) : modelId

        await api.post('/ratings', {
          promptSessionId: currentPromptSessionId,
          responseId: newFavorite ? responseId : null,
          provider: newFavorite ? provider : null,
          model: newFavorite ? model : null,
        })

        useStore.getState().triggerStatsRefresh()
      } catch (error: any) {
        console.error('[Favorite] Error saving model win:', error)
      }
    }
  }, [isReopenedHistoryChat, currentPromptFavorite, currentPromptSessionId, currentUser?.id, responses, setCurrentPromptFavorite])

  // Check if user's usage is exhausted
  useEffect(() => {
    if (!currentUser?.id) return
    const checkUsage = async () => {
      try {
        const res = await api.get(`/stats/${currentUser.id}`)
        const data = res.data
        setUserPlan(data.userPlan || currentUser?.plan || 'free_trial')
        const balance = data.totalAvailableBalance ?? data.remainingFreeAllocation ?? 0
        setUsageExhausted(balance <= 0 && (data.freeMonthlyAllocation || 0) > 0)
      } catch (err: any) {
        // Don't block on error
      }
    }
    checkUsage()
  }, [currentUser?.id, statsRefreshTrigger])

  // Refs for chat layout
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const chatAreaRef = useRef<HTMLDivElement>(null)
  const chatEndRef = useRef<HTMLDivElement>(null)
  const responseAreaRef = useRef<HTMLDivElement>(null)

  // Fetch streak data and privacy setting
  useEffect(() => {
    if (currentUser?.id) {
      fetchStreak()
    }
  }, [currentUser, statsRefreshTrigger])

  const fetchStreak = async () => {
    try {
      const response = await api.get(`/stats/${currentUser.id}/streak`)
      setStreakDays(response.data.streakDays || 0)

      if (response.data.streakBreak) {
        setStreakBreakData(response.data.streakBreak)
        setShowStreakBreakModal(true)
      }
    } catch (error: any) {
      console.error('Error fetching streak:', error)
      setStreakDays(0)
    }
  }

  const triggerStatsRefresh = useStore((state) => state.triggerStatsRefresh)

  const handleStreakRecover = async (method: 'pass' | 'xp' | 'decline') => {
    try {
      const response = await api.post(`/stats/${currentUser.id}/streak/recover`, { method })
      if (response.data.success) {
        setStreakDays(response.data.streakDays || 0)
        setShowStreakBreakModal(false)
        setStreakBreakData(null)
        triggerStatsRefresh()
      }
    } catch (error: any) {
      console.error('Error recovering streak:', error)
    }
  }

  const allModels = getAllModels()

  const handleNewChat = useCallback(() => {
    if (currentHistoryId && currentUser?.id) {
      api.post('/history/finalize', {
        historyId: currentHistoryId,
      }).catch(err => console.error('[History] Error finalizing:', err.message))
    }
    clearResponses()
    clearLastSubmittedPrompt()
    if (currentUser?.id) {
      api.post('/judge/clear-context', {}).catch(err => console.error('[Clear Context] Error:', err))
      api.post('/model/clear-context', {}).catch(err => console.error('[Clear Model Context] Error:', err))
    }
    resetConversationState()
  }, [currentHistoryId, currentUser?.id, clearResponses, clearLastSubmittedPrompt, resetConversationState])

  // All models are available - API keys are stored in the backend
  const availableModels = allModels

  // Group models by provider
  const modelsByProvider: Record<string, any> = availableModels.reduce((acc: Record<string, any>, model: any) => {
    if (model.provider === 'deepseek' || model.provider === 'meta' || model.provider === 'mistral') {
      return acc
    }
    
    if (!acc[model.provider]) {
      acc[model.provider] = {
        providerName: model.providerName,
        models: []
      }
    }
    acc[model.provider].models.push(model)
    return acc
  }, {})


  // Global Enter key listener - allows submitting prompt even when input isn't focused
  useEffect(() => {
    const handleGlobalKeyDown = (e: KeyboardEvent) => {
      // Only trigger on Enter key (not Shift+Enter)
      if (e.key !== 'Enter' || e.shiftKey) return
      if (e.defaultPrevented) return
      if (isCouncilColumnInputFocused) return

      const target = e.target as Element
      if (target?.closest?.('[data-local-enter-handler="true"]')) {
        return
      }
      
      // Don't trigger if user is focused on ANY input/textarea
      const activeElement = document.activeElement
      const tagName = activeElement?.tagName?.toLowerCase()
      const activeElementHasLocalHandler = activeElement?.closest?.('[data-local-enter-handler="true"]')
      
      if (activeElementHasLocalHandler || tagName === 'input' || tagName === 'textarea') {
        return
      }

      // If council responses are ready, Enter triggers summary generation.
      const canGenerateSummaryFromKey = !isLoading &&
        !isGeneratingSummary &&
        !summary &&
        responses.filter(r => !r.error && r.text).length >= 2
      if (canGenerateSummaryFromKey) {
        e.preventDefault()
        triggerGenerateSummary()
        return
      }
      
      // Check if there's a prompt to send
      if (!currentPrompt.trim()) return
      
      // Check if any models are selected or Auto Smart is enabled
      const hasAutoSmart = Object.values(autoSmartProviders).some(v => v)
      if (selectedModels.length === 0 && !hasAutoSmart) {
        setShowNoModelNotification(true)
        setTimeout(() => setShowNoModelNotification(false), 4000)
        return
      }
      
      setIsSubmitPending(true)
      e.preventDefault()
      handleSubmitRef.current?.()
    }
    
    window.addEventListener('keydown', handleGlobalKeyDown)
    return () => window.removeEventListener('keydown', handleGlobalKeyDown)
  }, [currentPrompt, selectedModels, autoSmartProviders, isLoading, isGeneratingSummary, summary, responses, triggerGenerateSummary, isCouncilColumnInputFocused])

  // Hand-off/reset for immediate-submit UI state.
  // Clear when real processing starts or once results are present.
  useEffect(() => {
    if (isLoading || isGeneratingSummary) {
      setIsSubmitPending(false)
      return
    }
    if (!isLoading && !isGeneratingSummary && (responses.length > 0 || !!summary)) {
      setIsSubmitPending(false)
    }
  }, [isLoading, isGeneratingSummary, responses.length, summary])
  
  // Ref to always have the latest handleSubmit function
  const handleSubmitRef = useRef<(() => void) | null>(null)

  const handleSubmit = async () => {
    if (isPromptLocked) return
    if (!currentPrompt.trim()) return

    const providersWithAutoSmart = Object.entries(autoSmartProviders).filter(([_, isEnabled]) => isEnabled)
    const hasSelectedModels = selectedModels.length > 0
    
    if (!hasSelectedModels && providersWithAutoSmart.length === 0) {
      console.warn('[Submit] No models selected and no Auto Smart enabled')
      setShowNoModelNotification(true)
      setTimeout(() => setShowNoModelNotification(false), 4000)
      setIsSubmitPending(false)
      return
    }
    
    // Reset conversation state for new prompt
    resetConversationState()
    setShowCouncilPanel(false)
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto'
    }
    
    if (providersWithAutoSmart.length > 0) {
      const selectedProvidersData = providersWithAutoSmart.map(([providerKey]) => {
        const providerData = modelsByProvider[providerKey]
        return {
          providerKey,
          providerName: providerData?.providerName || providerKey,
          models: providerData?.models || []
        }
      })

      try {
        const detectionResult = await detectCategory(currentPrompt, selectedProvidersData)
        const { recommendedModels, recommendedModelType, rawResponse } = detectionResult
        
        setGeminiDetectionResponse(rawResponse || 'No response received')
        
        let newSelectedModels: string[] = []
        let hasAutoSmartSelection = false

        const allProviderModelIds = new Set()
        providersWithAutoSmart.forEach(([providerKey]) => {
          const providerData = modelsByProvider[providerKey]
          if (providerData) {
            providerData.models.forEach((model: any) => {
              allProviderModelIds.add(model.id)
            })
          }
        })
        
        const providersWithoutAutoSmart = Object.keys(modelsByProvider).filter(
          providerKey => !autoSmartProviders[providerKey]
        )
        providersWithoutAutoSmart.forEach(providerKey => {
          const providerData = modelsByProvider[providerKey]
          if (providerData) {
            providerData.models.forEach((model: any) => {
              if (selectedModels.includes(model.id)) {
                newSelectedModels.push(model.id)
              }
            })
          }
        })

        if (recommendedModelType) {
          providersWithAutoSmart.forEach(([providerKey]) => {
            const providerData = modelsByProvider[providerKey]
            if (!providerData) {
              console.warn(`[Auto Smart] No provider data found for ${providerKey}`)
              return
            }
            
            const specificRecommendation = recommendedModels?.[providerKey]
            let modelToUse = null
            
            if (specificRecommendation) {
              const recommendedModel = availableModels.find(m => m.id === specificRecommendation)
              
              if (recommendedModel && recommendedModel.type === recommendedModelType) {
                modelToUse = specificRecommendation
              }
            }
            
            if (!modelToUse) {
              const modelByType = providerData.models.find((m: any) => m.type === recommendedModelType)
              
              if (modelByType) {
                modelToUse = modelByType.id
              } else {
                const versatileModel = providerData.models.find((m: any) => m.type === 'versatile')
                if (versatileModel) {
                  modelToUse = versatileModel.id
                  console.warn(`[Auto Smart] ⚠ No ${recommendedModelType} model for ${providerKey}, falling back to versatile: ${modelToUse}`)
                } else if (providerData.models.length > 0) {
                  modelToUse = providerData.models[0].id
                  console.warn(`[Auto Smart] ⚠ No ${recommendedModelType} or versatile for ${providerKey}, using first available: ${modelToUse}`)
                } else {
                  console.error(`[Auto Smart] ✗ No models available for ${providerKey}`)
                }
              }
            }
            
            const existingModelIndex = newSelectedModels.findIndex(id => {
              const m = availableModels.find(am => am.id === id)
              return m && m.provider === providerKey
            })
            if (existingModelIndex > -1) {
              newSelectedModels.splice(existingModelIndex, 1)
            }
            
            if (modelToUse && !newSelectedModels.includes(modelToUse)) {
              newSelectedModels.push(modelToUse)
              hasAutoSmartSelection = true
            }
          })
        } else {
          Object.entries(recommendedModels).forEach(([providerKey, modelId]) => {
            if (modelId && !newSelectedModels.includes(modelId)) {
              newSelectedModels.push(modelId)
              hasAutoSmartSelection = true
            }
          })
        }
        
        newSelectedModels = [...new Set(newSelectedModels)]

        if (hasAutoSmartSelection || newSelectedModels.length > 0) {
          const finalModels = [...new Set(newSelectedModels)]
          
          const providersWithSelectedModels = new Set()
          finalModels.forEach(modelId => {
            const model = availableModels.find(m => m.id === modelId)
            if (model && model.provider) {
              providersWithSelectedModels.add(model.provider)
            }
          })
          
          setAutoSmartProviders((prev) => {
            const newState = { ...prev }
            providersWithSelectedModels.forEach((providerKey: any) => {
              delete newState[providerKey]
            })
            return newState
          })
          
          setSelectedModels(finalModels)

          if (promptMode === 'debate') {
            finalModels.forEach(modelId => {
              const model = availableModels.find(m => m.id === modelId)
              if (model && !modelRoles[modelId]) {
                const autoSmartKey = `autoSmart-${model.provider}`
                const inheritedRole = modelRoles[autoSmartKey] || 'neutral'
                setModelRole(modelId, inheritedRole)
              }
            })
          }
          
          setTimeout(() => {
      triggerSubmit()
          }, 100)
        } else {
          if (selectedModels.length > 0) {
            triggerSubmit()
          } else {
            console.error('[Auto Smart] Failed to select models and no manual selections')
            alert('Failed to automatically select models. Please manually select models or try again.')
            setIsSubmitPending(false)
          }
        }
      } catch (error: any) {
        console.error('[Auto Smart] Error getting model recommendations:', error)
        if (selectedModels.length > 0) {
          triggerSubmit()
        } else {
          alert('Error getting model recommendations. Please manually select models or try again.')
          setIsSubmitPending(false)
        }
      }
    } else {
      if (selectedModels.length > 0) {
        triggerSubmit()
      } else {
        setIsSubmitPending(false)
      }
    }
  }
  
  // Keep ref updated with latest handleSubmit
  handleSubmitRef.current = handleSubmit

  const showCouncilColumns = !isSingleModel && responses.length > 0 && (
    (!hasSummaryTokens && (isLoading || isGeneratingSummary || summaryInitializing || showCouncilReviewPhase)) ||
    (canToggleResultViews && resultViewMode === 'council')
  )
  const showSingleModelStreamingPhase = isSingleModel && isLoading && responses.length > 0
  const showSummaryStreamingPhase = hasSummaryTokens && (isGeneratingSummary || (summary && summary.isStreaming))
  const showProcessingView = showCouncilLoading || showCouncilColumns || showSingleModelStreamingPhase || showSummaryStreamingPhase
  const canGenerateSummary = !isLoading && !isGeneratingSummary && !summary && responses.filter(r => !r.error && r.text).length >= 2
  const topBarVisible = canGenerateSummary || canToggleResultViews || canShowCouncilSideBySideButton || isCancelledPrompt
  const normalViewTopPadding = topBarVisible ? '140px' : '100px'
  const processingTopPadding = topBarVisible ? 150 : 80
  const {
    councilGutterHover,
    setCouncilGutterHover,
    leftGutterRef,
    rightGutterRef,
  } = useScrollManagement({
    chatAreaRef,
    responseAreaRef,
    showCouncilColumns,
    hasActiveConversation,
    inlineResponseText,
    lastSubmittedPrompt,
    summaryConvoLength: summary?.conversationHistory?.length || 0,
    singleModelConvoLength: singleModelConvoHistory.length,
  })

  const bottomBarStyle: React.CSSProperties = {
    flexShrink: 0,
    padding: `${spacing.lg} ${spacing['5xl']} ${spacing['2xl']}`,
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    borderTop: hasActiveConversation ? `1px solid ${currentTheme.borderLight}` : 'none',
    background: currentTheme.background,
    ...(hasActiveConversation
      ? {}
      : {
          position: 'absolute',
          top: '50%',
          left: '50%',
          transform: 'translate(-50%, -50%)',
          width: '100%',
          zIndex: 20,
        }),
  }

  return (
    <>
      <style>
        {`
          .chat-area::-webkit-scrollbar {
            width: 6px;
          }
          .chat-area::-webkit-scrollbar-track {
            background: transparent;
          }
          .chat-area::-webkit-scrollbar-thumb {
            background: rgba(128, 128, 128, 0.3);
            border-radius: 3px;
          }
          .chat-area::-webkit-scrollbar-thumb:hover {
            background: rgba(128, 128, 128, 0.5);
          }
          .council-column-scroll {
            scrollbar-width: thin; /* Firefox */
            scrollbar-color: rgba(93, 173, 226, 0.55) transparent;
          }
          .council-column-scroll::-webkit-scrollbar {
            width: 6px;
          }
          .council-column-scroll::-webkit-scrollbar-track {
            background: transparent;
          }
          .council-column-scroll::-webkit-scrollbar-thumb {
            background: rgba(93, 173, 226, 0.55);
            border-radius: 6px;
          }
          .council-column-scroll::-webkit-scrollbar-thumb:hover {
            background: rgba(93, 173, 226, 0.75);
          }
          .main-prompt-input::placeholder {
            color: ${currentTheme.textMuted};
          }
        `}
      </style>
      <div
        className={mountReady ? undefined : 'no-mount-transition'}
        style={s.pageContainer(navWidth)}
      >
        <TopActionBar
          canGenerateSummary={canGenerateSummary}
          canToggleResultViews={canToggleResultViews}
          canShowCouncilSideBySideButton={canShowCouncilSideBySideButton}
          theme={theme}
          currentTheme={currentTheme}
          resultViewMode={resultViewMode}
          setResultViewMode={setResultViewMode}
          setShowSingleTokenUsage={setShowSingleTokenUsage}
          setShowTopCostBreakdown={setShowTopCostBreakdown}
          triggerGenerateSummary={triggerGenerateSummary}
          isCancelledPrompt={isCancelledPrompt}
          onShare={handleSharePrompt}
          sharingPrompt={sharingPrompt}
          shareSuccess={shareSuccess}
          canShare={responses.length > 0 && !!lastSubmittedPrompt}
        />

        {/* ===== SCROLLABLE CHAT AREA ===== */}
      <div
          ref={chatAreaRef}
          className="chat-area"
        style={sx(layout.flexCol, {
            flex: 1,
            overflowY: showCouncilColumns ? 'hidden' : 'auto',
            padding: showProcessingView ? `0 0 ${spacing['3xl']} 0` : `${normalViewTopPadding} ${spacing['5xl']} 36px`,
          })}
        >

          {/* ===== COUNCIL PROCESSING VIEW ===== */}
          {showProcessingView && (
            <div style={sx(layout.flexCol, {
              flex: 1,
              alignItems: 'center',
              justifyContent: showCouncilLoading ? 'center' : 'flex-start',
              width: '100%',
              height: '100%',
              position: 'relative',
              padding: showCouncilLoading ? `0 0 ${spacing['3xl']} 0` : `${processingTopPadding}px ${spacing['2xl']} 36px`,
            })}>
              {/* Phase 1: Loading Council of LLMs - centered spinner */}
              {showCouncilLoading && (
                <motion.div
                  initial={{ opacity: 0, scale: 0.9 }}
                  animate={{ opacity: 1, scale: 1 }}
                  style={sx(layout.flexCol, {
                    alignItems: 'center',
                    gap: spacing['3xl'],
                  })}
                >
                  <motion.div
                    animate={{ rotate: 360 }}
                    transition={{ duration: 1.5, repeat: Infinity, ease: 'linear' }}
                    style={{
                      width: '56px',
                      height: '56px',
                      border: `3px solid ${currentTheme.borderLight}`,
                      borderTop: `3px solid ${currentTheme.accent}`,
                      borderRadius: radius.circle,
                    }}
                  />
                  <span style={{
                    fontSize: fontSize['4xl'],
                    fontWeight: fontWeight.medium,
                    background: currentTheme.accentGradient,
                    WebkitBackgroundClip: 'text',
                    WebkitTextFillColor: 'transparent',
                  }}>
                    {selectedModels.length === 1
                      ? `Loading ${allModels.find(m => m.id === selectedModels[0])?.providerName || 'model'}'s response...`
                      : 'Loading Council of LLMs...'}
                  </span>
                  {isSearchingWeb && (
                    <motion.div
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      style={sx(layout.flexRow, { gap: spacing.sm })}
                    >
                      <Search size={14} color={currentTheme.accent} />
                      <span style={{ color: currentTheme.accent, fontSize: fontSize.base, fontWeight: fontWeight.medium }}>Searching the web</span>
                      <motion.span
                        animate={{ opacity: [1, 0.3, 1] }}
                        transition={{ duration: 1.5, repeat: Infinity, ease: 'easeInOut' }}
                        style={{ color: currentTheme.accent, fontSize: fontSize.base }}
                      >...</motion.span>
                    </motion.div>
                  )}
                </motion.div>
              )}

              <CouncilColumnsView
                showCouncilColumns={showCouncilColumns}
                isLoading={isLoading}
                isGeneratingSummary={isGeneratingSummary}
                isSearchingWeb={isSearchingWeb}
                onCancelPrompt={onCancelPrompt ?? null}
                onCancelSummary={onCancelSummary ?? null}
                theme={theme}
                currentTheme={currentTheme}
                summaryInitializing={summaryInitializing}
                showCouncilReviewPhase={showCouncilReviewPhase}
                canToggleResultViews={canToggleResultViews}
                resultViewMode={resultViewMode}
                councilColumnCount={councilColumnCount}
                councilDisplayResponses={councilDisplayResponses}
                councilGutterHover={councilGutterHover}
                setCouncilGutterHover={setCouncilGutterHover}
                leftGutterRef={leftGutterRef}
                rightGutterRef={rightGutterRef}
                lastSubmittedPrompt={lastSubmittedPrompt}
                getProviderDisplayName={getProviderDisplayName}
                showCouncilColumnSources={showCouncilColumnSources}
                setShowCouncilColumnSources={setShowCouncilColumnSources}
                councilColumnConvoHistory={councilColumnConvoHistory}
                councilColumnConvoSending={councilColumnConvoSending}
                councilColumnConvoSearching={councilColumnConvoSearching}
                councilColumnConvoSources={councilColumnConvoSources}
                showCouncilColumnConvoSources={showCouncilColumnConvoSources}
                setShowCouncilColumnConvoSources={setShowCouncilColumnConvoSources}
                councilColumnConvoInputs={councilColumnConvoInputs}
                setCouncilColumnConvoInputs={setCouncilColumnConvoInputs}
                handleSendCouncilColumnConvo={handleSendCouncilColumnConvo}
                councilFollowUpInput={councilFollowUpInput}
                setCouncilFollowUpInput={setCouncilFollowUpInput}
                councilFollowUpSending={councilFollowUpSending}
                handleSendCouncilFollowUp={handleSendCouncilFollowUp}
                responses={responses}
                setIsCouncilColumnInputFocused={setIsCouncilColumnInputFocused}
                currentPromptFavorite={currentPromptFavorite}
                onPickFavorite={handlePickFavorite}
                isReopenedHistoryChat={isReopenedHistoryChat}
              />

              {/* Phase 2b: Single model streaming - show as normal flowing response */}
              {showSingleModelStreamingPhase && (
                <motion.div
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  style={{ maxWidth: '800px', width: '100%', padding: `0 ${spacing['2xl']} 36px` }}
                >
                  {isSearchingWeb && (
                    <motion.div
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      style={sx(layout.flexRow, { gap: spacing.sm, justifyContent: 'center', marginBottom: spacing.xl })}
                    >
                      <Search size={14} color={currentTheme.accent} />
                      <span style={{ color: currentTheme.accent, fontSize: fontSize.base, fontWeight: fontWeight.medium }}>Searching the web</span>
                      <motion.span
                        animate={{ opacity: [1, 0.3, 1] }}
                        transition={{ duration: 1.5, repeat: Infinity, ease: 'easeInOut' }}
                        style={{ color: currentTheme.accent, fontSize: fontSize.base }}
                      >...</motion.span>
                    </motion.div>
                  )}
                  {/* User prompt bubble */}
                  <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: spacing['3xl'] }}>
                    <div style={{
                      maxWidth: '75%',
                      background: currentTheme.buttonBackground,
                      border: `1px solid ${currentTheme.borderLight}`,
                      borderRadius: `${radius['2xl']} ${radius['2xl']} ${radius.xs} ${radius['2xl']}`,
                      padding: `${spacing.lg} 18px`,
                    }}>
                      <div style={{ fontSize: fontSize.xs, fontWeight: fontWeight.semibold, color: currentTheme.text, marginBottom: spacing.xs, textTransform: 'uppercase', letterSpacing: '0.5px' }}>You</div>
                      <p style={{ color: currentTheme.text, lineHeight: '1.6', fontSize: fontSize['2xl'], whiteSpace: 'pre-wrap', margin: 0 }}>
                        {lastSubmittedPrompt}
                      </p>
                    </div>
                  </div>
                  {/* Model name label */}
                  <div style={sx(layout.flexRow, { gap: spacing.md, alignItems: 'center', marginBottom: '14px' })}>
                    <FileText size={16} color={currentTheme.accent} />
                    <span style={{ fontSize: '0.75rem', fontWeight: fontWeight.bold, color: currentTheme.accent, textTransform: 'uppercase', letterSpacing: '0.8px' }}>
                      {getProviderDisplayName(primaryResponse?.modelName)}
                      {getModelShortLabel(primaryResponse?.modelName) && (
                        <span style={{ color: currentTheme.textMuted, fontWeight: fontWeight.normal, textTransform: 'none', letterSpacing: 'normal' }}>
                          {' '}({getModelShortLabel(primaryResponse?.modelName)})
                        </span>
                      )}
                    </span>
                  </div>
                  {/* Streaming response */}
                  <div>
                    {!primaryResponse?.text && primaryResponse?.isStreaming ? (
                      <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        style={sx(layout.flexRow, { gap: spacing.md, alignItems: 'center', padding: `${spacing.lg} 0` })}
                      >
                        <motion.div
                          animate={{ rotate: 360 }}
                          transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
                          style={{
                            width: '16px',
                            height: '16px',
                            border: `2px solid ${currentTheme.borderLight}`,
                            borderTop: `2px solid ${currentTheme.accent}`,
                            borderRadius: radius.circle,
                          }}
                        />
                        <span style={{ color: currentTheme.textSecondary, fontSize: fontSize.base, fontWeight: fontWeight.medium }}>
                          Waiting for response...
                        </span>
                      </motion.div>
                    ) : (
                      <MarkdownRenderer content={primaryResponse?.text || ''} theme={currentTheme} fontSize="1rem" lineHeight="1.85" />
                    )}
                  </div>
                </motion.div>
              )}

              {/* Phase 3: Summary streaming - replaces council columns */}
              {showSummaryStreamingPhase && (
                <motion.div
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  style={{ maxWidth: '800px', width: '100%', padding: `0 ${spacing['2xl']} 36px` }}
                >
                  {isGeneratingSummary && (
                    <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '18px' }}>
                      <motion.button
                        onClick={() => { if (onCancelSummary) onCancelSummary() }}
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        style={sx(layout.flexRow, {
                          padding: `${spacing.md} 14px`,
                          background: 'rgba(239, 68, 68, 0.12)',
                          border: '1px solid #ef4444',
                          borderRadius: radius.lg,
                          color: theme === 'light' ? '#dc2626' : '#fff',
                          cursor: 'pointer',
                          transition: transition.normal,
                          fontSize: '0.82rem',
                          fontWeight: fontWeight.semibold,
                        })}
                        whileHover={{ scale: 1.03 }}
                        whileTap={{ scale: 0.97 }}
                        title="Cancel Summary"
                      >
                        Cancel
                      </motion.button>
                    </div>
                  )}
                  {/* User prompt bubble */}
                  <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: spacing['3xl'] }}>
                    <div style={{
                      maxWidth: '75%',
                      background: currentTheme.buttonBackground,
                      border: `1px solid ${currentTheme.borderLight}`,
                      borderRadius: `${radius['2xl']} ${radius['2xl']} ${radius.xs} ${radius['2xl']}`,
                      padding: `${spacing.lg} 18px`,
                    }}>
                      <div style={{ fontSize: fontSize.xs, fontWeight: fontWeight.semibold, color: currentTheme.text, marginBottom: spacing.xs, textTransform: 'uppercase', letterSpacing: '0.5px' }}>You</div>
                      <p style={{ color: currentTheme.text, lineHeight: '1.6', fontSize: fontSize['2xl'], whiteSpace: 'pre-wrap', margin: 0 }}>
                        {lastSubmittedPrompt}
                      </p>
                    </div>
                  </div>
                  {/* Summary streaming text */}
                  <div>
                    <MarkdownRenderer content={summary?.text || ''} theme={currentTheme} fontSize="1rem" lineHeight="1.85" />
                  </div>
                </motion.div>
              )}

            </div>
          )}

          {/* ===== NORMAL CONVERSATION VIEW ===== */}
          {!showProcessingView && (
          <div style={sx(layout.flexCol, { maxWidth: '800px', width: '100%', margin: '0 auto', flex: 1 })}>
            
            {/* Welcome header removed - title now lives in provider tab */}

            {/* ===== CONVERSATION FLOW ===== */}
            {/* Only show the prompt bubble + inline response once the response is actually ready */}
            {/* This prevents the user's prompt from sitting alone while council models are still streaming */}
            {hasActiveConversation && inlineResponseText && (
              <div style={sx(layout.flexCol, { gap: '28px', paddingTop: spacing['2xl'], paddingBottom: spacing['2xl'] })}>
                
                {/* User Prompt Bubble */}
                <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                  <div style={{
                    maxWidth: '75%',
                    background: currentTheme.buttonBackground,
                    border: `1px solid ${currentTheme.borderLight}`,
                    borderRadius: `${radius['2xl']} ${radius['2xl']} ${radius.xs} ${radius['2xl']}`,
                    padding: `${spacing.lg} 18px`,
                  }}>
                    <div style={{
                      fontSize: fontSize.xs,
                      fontWeight: fontWeight.semibold,
                      color: currentTheme.text,
                      marginBottom: spacing.xs,
                      textTransform: 'uppercase',
                      letterSpacing: '0.5px',
                    }}>
                      You
                    </div>
                    <p style={{
                      color: currentTheme.text,
                      lineHeight: '1.6',
                      fontSize: fontSize['2xl'],
                      whiteSpace: 'pre-wrap',
                      margin: 0,
                    }}>
                      {lastSubmittedPrompt}
          </p>
          </div>
        </div>

                {/* Response - Free flowing text, NO container/border */}
                {inlineResponseText && (
                  <div ref={responseAreaRef} style={{ padding: `${spacing.xs} 0 0 ${spacing.xs}` }}>
                    {inlineResponseLabel && (
                      <div style={sx(layout.flexRow, { gap: spacing.md, alignItems: 'center', marginBottom: '14px' })}>
                        <FileText size={16} color={currentTheme.accent} />
                        <span style={{ fontSize: '0.75rem', fontWeight: fontWeight.bold, color: currentTheme.accent, textTransform: 'uppercase', letterSpacing: '0.8px' }}>
                          {getProviderDisplayName(inlineResponseLabel)}
                          {getModelShortLabel(inlineResponseLabel) && (
                            <span style={{ color: currentTheme.textMuted, fontWeight: fontWeight.normal, textTransform: 'none', letterSpacing: 'normal' }}>
                              {' '}({getModelShortLabel(inlineResponseLabel)})
                            </span>
                          )}
                        </span>
                      </div>
                    )}
                    <div>
                      <MarkdownRenderer content={inlineResponseText} theme={currentTheme} fontSize="1rem" lineHeight="1.85" />
                    </div>
                  </div>
                )}

                <ConversationInput
                  showConversationInput={showConversationInput}
                  summaryInitialSources={summaryInitialSources}
                  summaryConvoSources={summaryConvoSources}
                  showSummaryConvoSources={showSummaryConvoSources}
                  setShowSummaryConvoSources={setShowSummaryConvoSources}
                  summary={summary}
                  isSendingConvo={isSendingConvo}
                  isSearchingInConvo={isSearchingInConvo}
                  conversationInput={conversationInput}
                  setConversationInput={setConversationInput}
                  convoTextareaRef={convoTextareaRef}
                  adjustConvoTextarea={adjustConvoTextarea}
                  handleSendConversation={handleSendConversation}
                  showSingleModelConvoInput={!!showSingleModelConvoInput}
                  singleModelInitialSources={singleModelInitialSources}
                  singleConvoSources={singleConvoSources}
                  showSingleConvoSources={showSingleConvoSources}
                  setShowSingleConvoSources={setShowSingleConvoSources}
                  singleModelConvoHistory={singleModelConvoHistory}
                  inlineResponseLabel={inlineResponseLabel}
                  isSearchingInSingleConvo={isSearchingInSingleConvo}
                  isSendingSingleConvo={isSendingSingleConvo}
                  singleModelConvoInput={singleModelConvoInput}
                  setSingleModelConvoInput={setSingleModelConvoInput}
                  singleConvoTextareaRef={singleConvoTextareaRef}
                  adjustSingleConvoTextarea={adjustSingleConvoTextarea}
                  handleSendSingleModelConvo={handleSendSingleModelConvo}
                  singleConvoAbortControllerRef={singleConvoAbortControllerRef}
                  getProviderDisplayName={getProviderDisplayName}
                  primaryResponse={primaryResponse}
                  theme={theme}
                  currentTheme={currentTheme}
                  responses={responses}
                  allModels={allModels}
                  lastSubmittedPrompt={lastSubmittedPrompt}
                  handleNewChat={handleNewChat}
                  tokenData={tokenData}
                  setShowSingleTokenUsage={setShowSingleTokenUsage}
                  showClearTooltip={showClearTooltip}
                  setShowClearTooltip={setShowClearTooltip}
                />
              </div>
            )}

            <div ref={chatEndRef} />
          </div>
          )}
        </div>

        {/* ===== BOTTOM INPUT BAR ===== */}
        {!showProcessingView && !hasActiveConversation && (
        <div style={bottomBarStyle}>
          <div style={{ maxWidth: '1100px', width: '100%', margin: '0 auto' }}>
            {/* Streak & Searching indicator row - above prompt area */}
            {(streakDays > 0 || isSearchingWeb) && (
              <div
                style={sx(layout.spaceBetween, {
                  justifyContent: isSearchingWeb && streakDays > 0 ? 'space-between' : isSearchingWeb ? 'flex-start' : 'flex-end',
                  paddingBottom: spacing.md,
                })}
              >
                {isSearchingWeb && (
                  <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    style={sx(layout.flexRow, {
                          gap: spacing.xs,
                        })}
                      >
                    <Search size={14} color={currentTheme.accent} />
                    <span style={{ color: currentTheme.accent, fontSize: '0.75rem', fontWeight: fontWeight.bold }}>Searching the web</span>
                    <motion.span
                      animate={{ opacity: [1, 0.3, 1] }}
                      transition={{ duration: 1.5, repeat: Infinity, ease: 'easeInOut' }}
                      style={{ color: currentTheme.accent, fontSize: '0.75rem' }}
                    >
                      ...
                    </motion.span>
                  </motion.div>
                )}
                {streakDays > 0 && (
                  <div style={sx(layout.flexRow, { gap: spacing.xs })}>
                        <Flame size={14} color="#FF6B00" />
                        <span style={{ color: '#FF6B00', fontSize: '0.75rem', fontWeight: fontWeight.bold }}>
                          {streakDays} day streak
                        </span>
                      </div>
                    )}
                  </div>
            )}
            {/* Subscription paused notice */}
            {subscriptionExpiring && subscriptionRenewalDate && (
              <div style={{ textAlign: 'center', marginBottom: spacing.sm }}>
                <span style={{
                  fontSize: '0.68rem',
                  color: 'rgba(255, 255, 255, 0.55)',
                  fontWeight: fontWeight.normal,
                }}>
                  Subscription paused · access until {new Date(subscriptionRenewalDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                </span>
              </div>
            )}
            {/* Welcome Title */}
            <h2
              key={`welcome-title-${theme}`}
              style={{
                textAlign: 'center',
                fontSize: fontSize['5xl'],
                fontWeight: fontWeight.semibold,
                margin: `0 0 ${spacing.lg} 0`,
                background: currentTheme.accentGradient,
                WebkitBackgroundClip: 'text',
                WebkitTextFillColor: 'transparent',
                letterSpacing: '0.3px',
              }}
            >
              Welcome to the Council of LLMs
            </h2>

            {/* Fetching Response Indicator - above prompt box */}
            <AnimatePresence>
              {(isLoading || isGeneratingSummary) && (
                <motion.div
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: 10 }}
                  transition={{ duration: 0.25 }}
                  style={sx(layout.flexCol, {
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '10px',
                    marginBottom: '14px',
                    padding: `${spacing.lg} ${spacing['3xl']}`,
                  })}
                >
                  <motion.button
                    onClick={() => { if (onCancelPrompt) onCancelPrompt() }}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    style={sx(layout.flexRow, {
                      padding: `${spacing.md} 14px`,
                      background: 'rgba(239, 68, 68, 0.12)',
                      border: '1px solid #ef4444',
                      borderRadius: radius.lg,
                      color: theme === 'light' ? '#dc2626' : '#fff',
                      cursor: 'pointer',
                      transition: transition.normal,
                      fontSize: '0.82rem',
                      fontWeight: fontWeight.semibold,
                    })}
                    whileHover={{ scale: 1.03 }}
                    whileTap={{ scale: 0.97 }}
                    title="Cancel"
                  >
                    Cancel
                  </motion.button>
                  <div style={sx(layout.center, { gap: spacing.lg })}>
                  <motion.div
                    animate={{ rotate: 360 }}
                    transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
                    style={{
                      width: '20px',
                      height: '20px',
                      border: `2.5px solid ${currentTheme.borderLight}`,
                      borderTop: `2.5px solid ${currentTheme.accent}`,
                      borderRadius: radius.circle,
                      flexShrink: 0,
                    }}
                  />
                  <span style={{
                    fontSize: fontSize.xl,
                    fontWeight: fontWeight.medium,
                    background: currentTheme.accentGradient,
                    WebkitBackgroundClip: 'text',
                    WebkitTextFillColor: 'transparent',
                  }}>
                    {isGeneratingSummary 
                      ? 'Working on summary...' 
                      : selectedModels.length === 1
                        ? `Loading ${allModels.find(m => m.id === selectedModels[0])?.providerName || 'model'}'s response...`
                        : 'Loading Council of LLMs responses...'}
                  </span>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            {/* Unified Prompt Box with embedded provider buttons */}
            <div style={{
              position: 'relative',
              background: promptMode === 'debate'
                ? (currentTheme.name === 'dark' ? 'rgba(231, 76, 60, 0.06)' : 'rgba(192, 57, 43, 0.04)')
                : currentTheme.buttonBackground,
              border: promptMode === 'debate'
                ? `1px solid ${currentTheme.name === 'dark' ? 'rgba(231, 76, 60, 0.28)' : 'rgba(192, 57, 43, 0.22)'}`
                : `1px solid ${currentTheme.borderLight}`,
              borderRadius: radius['3xl'],
              overflow: 'visible',
              boxShadow: promptMode === 'debate'
                ? `0 2px 16px ${currentTheme.name === 'dark' ? 'rgba(231, 76, 60, 0.12)' : 'rgba(192, 57, 43, 0.08)'}`
                : `0 2px 12px ${currentTheme.shadow}`,
              transition: 'background 0.3s ease, border 0.3s ease, box-shadow 0.3s ease',
            }}>
              {/* Usage Exhausted Overlay */}
              {usageExhausted && !subscriptionRestricted && !subscriptionPaused && (
                <div
                  style={sx(layout.flexCol, layout.center, {
                    position: 'absolute',
                    top: 0,
                    left: 0,
                    right: 0,
                    bottom: 0,
                    zIndex: 50,
                    background: 'linear-gradient(135deg, rgba(0, 0, 0, 0.8) 0%, rgba(30, 20, 50, 0.9) 100%)',
                    backdropFilter: 'blur(6px)',
                    borderRadius: radius['3xl'],
                    gap: '10px',
                    padding: `${spacing['3xl']} ${spacing['2xl']}`,
                  })}
                >
                  <div style={sx(layout.center, {
                    width: '52px',
                    height: '52px',
                    borderRadius: radius.circle,
                    background: 'linear-gradient(135deg, rgba(255, 170, 0, 0.2), rgba(255, 100, 0, 0.08))',
                    border: '1.5px solid rgba(255, 170, 0, 0.4)',
                  })}>
                    <AlertTriangle size={26} color="#ffaa00" />
                  </div>
                  <p style={{
                    color: currentTheme.warning,
                    fontSize: fontSize.xl,
                    fontWeight: fontWeight.semibold,
                    textAlign: 'center',
                    margin: 0,
                    lineHeight: '1.4',
                  }}>
                    Usage Limit Reached
                  </p>
                  <p style={{
                    color: 'rgba(255, 255, 255, 0.5)',
                    fontSize: fontSize.md,
                    textAlign: 'center',
                    margin: 0,
                    maxWidth: '300px',
                    lineHeight: '1.4',
                  }}>
                    {isFreePlan
                      ? 'Your free plan usage has been reached. Upgrade to Pro or Premium for more usage.'
                      : 'Your monthly usage has been reached. Buy more credits or upgrade your plan.'
                    }
                  </p>
                  <div style={sx(layout.flexRow, { gap: spacing.md, marginTop: spacing.xs })}>
                    {isFreePlan ? (
                      <motion.button
                        onClick={() => setActiveTab('settings')}
                        whileHover={{ scale: 1.04 }}
                        whileTap={{ scale: 0.96 }}
                        style={{
                          padding: `${spacing.md} ${spacing['2xl']}`,
                          background: 'linear-gradient(135deg, #48c9b0, #5dade2)',
                          border: 'none',
                          borderRadius: radius.lg,
                          color: '#fff',
                          fontSize: fontSize.md,
                          fontWeight: fontWeight.semibold,
                          cursor: 'pointer',
                          letterSpacing: '0.3px',
                        }}
                      >
                        Upgrade Plan
                      </motion.button>
                    ) : (
                      <>
                        <motion.button
                          onClick={() => setActiveTab('statistics')}
                          whileHover={{ scale: 1.04 }}
                          whileTap={{ scale: 0.96 }}
                          style={{
                            padding: `${spacing.md} ${spacing['2xl']}`,
                            background: 'linear-gradient(135deg, #48c9b0, #5dade2)',
                            border: 'none',
                            borderRadius: radius.lg,
                            color: '#fff',
                            fontSize: fontSize.md,
                            fontWeight: fontWeight.semibold,
                            cursor: 'pointer',
                            letterSpacing: '0.3px',
                          }}
                        >
                          Buy More Usage
                        </motion.button>
                        <motion.button
                          onClick={() => setActiveTab('settings')}
                          whileHover={{ scale: 1.04 }}
                          whileTap={{ scale: 0.96 }}
                          style={{
                            padding: `${spacing.md} ${spacing['2xl']}`,
                            background: 'rgba(255, 255, 255, 0.1)',
                            border: '1px solid rgba(255, 255, 255, 0.2)',
                            borderRadius: radius.lg,
                            color: 'rgba(255, 255, 255, 0.7)',
                            fontSize: fontSize.md,
                            fontWeight: fontWeight.semibold,
                            cursor: 'pointer',
                            letterSpacing: '0.3px',
                          }}
                        >
                          Upgrade Plan
                        </motion.button>
                      </>
                    )}
                  </div>
                </div>
              )}
              {/* Subscription Lock Overlay — shown when paused or expired */}
              {isPromptLocked && (
                <div
                  style={sx(layout.flexCol, layout.center, {
                    position: 'absolute',
                    top: 0,
                    left: 0,
                    right: 0,
                    bottom: 0,
                    zIndex: 50,
                    background: subscriptionPaused && !subscriptionRestricted
                      ? 'linear-gradient(135deg, rgba(0, 0, 0, 0.75) 0%, rgba(30, 30, 50, 0.85) 100%)'
                      : 'rgba(0, 0, 0, 0.75)',
                    backdropFilter: 'blur(6px)',
                    borderRadius: radius['3xl'],
                    gap: '10px',
                    padding: `${spacing['3xl']} ${spacing['2xl']}`,
                  })}
                >
                  <div style={sx(layout.center, {
                    width: '52px',
                    height: '52px',
                    borderRadius: radius.circle,
                    background: subscriptionPaused && !subscriptionRestricted
                      ? 'linear-gradient(135deg, rgba(255, 170, 0, 0.2), rgba(255, 170, 0, 0.08))'
                      : 'linear-gradient(135deg, rgba(255, 59, 48, 0.2), rgba(255, 59, 48, 0.08))',
                    border: `1.5px solid ${subscriptionPaused && !subscriptionRestricted ? 'rgba(255, 170, 0, 0.4)' : 'rgba(255, 59, 48, 0.4)'}`,
                  })}>
                    {subscriptionPaused && !subscriptionRestricted
                      ? <PauseCircle size={26} color="#ffaa00" />
                      : <Lock size={24} color={currentTheme.error} />
                    }
                  </div>
                  <p style={{
                    color: subscriptionPaused && !subscriptionRestricted ? currentTheme.warning : currentTheme.error,
                    fontSize: fontSize.xl,
                    fontWeight: fontWeight.semibold,
                    textAlign: 'center',
                    margin: 0,
                    lineHeight: '1.4',
                  }}>
                    {subscriptionPaused && !subscriptionRestricted
                      ? 'Your account is paused'
                      : 'Subscription expired'
                    }
                  </p>
                  <p style={{
                    color: 'rgba(255, 255, 255, 0.5)',
                    fontSize: fontSize.md,
                    textAlign: 'center',
                    margin: 0,
                    maxWidth: '280px',
                    lineHeight: '1.4',
                  }}>
                    {subscriptionPaused && !subscriptionRestricted
                      ? 'Resume your subscription to start prompting again.'
                      : 'Resubscribe to send prompts.'
                    }
                  </p>
                  <motion.button
                    onClick={() => setActiveTab('settings')}
                    whileHover={{ scale: 1.04 }}
                    whileTap={{ scale: 0.96 }}
                    style={{
                      marginTop: spacing.xs,
                      padding: `${spacing.md} ${spacing['2xl']}`,
                      background: subscriptionPaused && !subscriptionRestricted
                        ? 'linear-gradient(135deg, #ffaa00, #ff8800)'
                        : `linear-gradient(135deg, ${currentTheme.error}, #ee5a5a)`,
                      border: 'none',
                      borderRadius: radius.lg,
                      color: '#fff',
                      fontSize: fontSize.md,
                      fontWeight: fontWeight.semibold,
                      cursor: 'pointer',
                      letterSpacing: '0.3px',
                    }}
                  >
                    {subscriptionPaused && !subscriptionRestricted ? 'Resume in Settings' : 'Resubscribe in Settings'}
                  </motion.button>
                </div>
              )}

              {/* Mode Toggle: General / Debate */}
              {responses.length === 0 && !isPromptLocked && (
                <div style={sx(layout.flexRow, {
                  gap: spacing.xs,
                  padding: `${spacing.md} ${spacing.xl} 0 ${spacing.xl}`,
                })}>
                  <div style={sx(layout.flexRow, {
                    background: currentTheme.name === 'dark' ? 'rgba(255, 255, 255, 0.05)' : 'rgba(0, 0, 0, 0.04)',
                    borderRadius: radius.lg,
                    padding: '3px',
                    border: `1px solid ${currentTheme.borderLight}`,
                  })}>
                    {[
                      { key: 'general', label: 'General', icon: <MessageCircle size={13} /> },
                      { key: 'debate', label: 'Debate', icon: <Swords size={13} /> },
                    ].map((mode) => (
                      <button
                        key={mode.key}
                        onClick={() => {
                          setPromptMode(mode.key)
                        }}
                        style={sx(layout.flexRow, {
                          gap: '5px',
                          padding: `5px ${spacing.lg}`,
                          borderRadius: radius.md,
                          border: 'none',
                          cursor: 'pointer',
                          fontSize: '0.78rem',
                          fontWeight: promptMode === mode.key ? fontWeight.semibold : fontWeight.medium,
                          color: promptMode === mode.key
                            ? (mode.key === 'debate'
                              ? (currentTheme.name === 'dark' ? currentTheme.error : '#c0392b')
                              : (currentTheme.name === 'dark' ? '#fff' : '#1a365d'))
                            : currentTheme.textMuted,
                          background: promptMode === mode.key
                            ? (mode.key === 'debate'
                              ? (currentTheme.name === 'dark' ? 'rgba(231, 76, 60, 0.15)' : 'rgba(192, 57, 43, 0.12)')
                              : (currentTheme.name === 'dark' ? 'rgba(255, 255, 255, 0.10)' : 'rgba(44, 82, 130, 0.10)'))
                            : 'transparent',
                          transition: transition.fast,
                        })}
                      >
                        {mode.icon}
                        {mode.label}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Debate Mode Banner */}
              <AnimatePresence>
                {promptMode === 'debate' && responses.length === 0 && (
                  <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: 'auto' }}
                    exit={{ opacity: 0, height: 0 }}
                    transition={{ duration: 0.25, ease: 'easeInOut' }}
                    style={{ overflow: 'hidden' }}
                  >
                    <div style={sx(layout.flexRow, {
                      gap: spacing.sm,
                      padding: `${spacing.sm} ${spacing['2xl']}`,
                      borderBottom: `1px solid ${currentTheme.name === 'dark' ? 'rgba(231, 76, 60, 0.15)' : 'rgba(192, 57, 43, 0.10)'}`,
                    })}>
                      <Swords size={12} color={currentTheme.name === 'dark' ? currentTheme.error : '#c0392b'} />
                      <span style={{
                        fontSize: fontSize['2xs'],
                        fontWeight: fontWeight.bold,
                        letterSpacing: '1.2px',
                        textTransform: 'uppercase',
                        color: currentTheme.name === 'dark' ? currentTheme.error : '#c0392b',
                      }}>
                        Debate Mode
                      </span>
                      <span style={{
                        fontSize: '0.6rem',
                        fontWeight: fontWeight.medium,
                        color: currentTheme.textMuted,
                        marginLeft: spacing.xs,
                      }}>
                        Models will argue from assigned perspectives
                      </span>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>

              {/* Textarea */}
              <textarea
                ref={textareaRef}
                className="main-prompt-input"
                value={currentPrompt}
                onChange={(e) => {
                  if (!isPromptLocked) {
                    setCurrentPrompt(e.target.value)
                    const textarea = e.target
                    textarea.style.height = 'auto'
                    textarea.style.height = `${Math.min(textarea.scrollHeight, 200)  }px`
                  }
                }}
                disabled={isPromptLocked}
                placeholder={isPromptLocked ? (subscriptionPaused ? "Account paused..." : "Resubscribe to send prompts...") : promptMode === 'debate' ? "Enter a statement here and get responses with varying views..." : "Enter a prompt here to get a response from the council of LLMs or individual models..."}
                style={{
                  width: '100%',
                  minHeight: '70px',
                  maxHeight: '200px',
                  padding: `${spacing.xl} ${spacing['2xl']} ${spacing.md} ${spacing['2xl']}`,
                  background: 'transparent',
                  border: 'none',
                  borderRadius: `${radius['3xl']} ${radius['3xl']} 0 0`,
                  color: currentTheme.text,
                  fontSize: fontSize['2xl'],
                  fontFamily: 'inherit',
                  resize: 'none',
                  lineHeight: '1.5',
                  overflow: 'hidden',
                  outline: 'none',
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault()
                    const hasAutoSmart = Object.values(autoSmartProviders).some(enabled => enabled)
                    if (currentPrompt.trim()) {
                      if (selectedModels.length > 0 || hasAutoSmart) {
                        setIsSubmitPending(true)
                        handleSubmit()
                      } else {
                        setShowNoModelNotification(true)
                        setTimeout(() => setShowNoModelNotification(false), 4000)
                      }
                    }
                  }
                }}
              />

              <ModelSelector
                currentTheme={currentTheme}
                onSubmit={handleSubmit}
                isSubmitPending={isSubmitPending}
                setIsSubmitPending={setIsSubmitPending}
                isLoading={isLoading}
                isGeneratingSummary={isGeneratingSummary}
                showNoModelNotification={showNoModelNotification}
                setShowNoModelNotification={setShowNoModelNotification}
                responses={responses}
              />
            </div>
          </div>
        </div>
        )}
      </div>

      {/* Token Usage modal for single-model mode */}
      <TokenUsageWindow
        isOpen={showSingleTokenUsage}
        onClose={() => setShowSingleTokenUsage(false)}
        tokenData={tokenData}
      />
      <CostBreakdownWindow
        isOpen={showTopCostBreakdown}
        onClose={() => setShowTopCostBreakdown(false)}
        tokenData={tokenData}
        queryCount={queryCount}
      />

      <StreakBreakModal
        isOpen={showStreakBreakModal}
        streakBreak={streakBreakData}
        onRecover={handleStreakRecover}
      />

    </>
  )
}

export default MainView
