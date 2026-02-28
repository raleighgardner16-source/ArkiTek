import React, { useState, useEffect, useRef, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Flame, Search, Lock, FileText, PauseCircle, MessageCircle, Swords, AlertTriangle } from 'lucide-react'
import { useStore } from '../store/useStore'
import { getAllModels } from '../services/llmProviders'
import { detectCategory } from '../utils/categoryDetector'
import { getTheme } from '../utils/theme'
import api from '../utils/api'
import { API_URL } from '../utils/config'
import { useScrollManagement } from '../hooks/useScrollManagement'
import MarkdownRenderer from './MarkdownRenderer'
import TokenUsageWindow from './TokenUsageWindow'
import CostBreakdownWindow from './CostBreakdownWindow'
import { useConversationHandlers } from '../hooks/useConversationHandlers'
import PostToFeedWindow from './PostToFeedWindow'
import ModelSelector from './ModelSelector'
import TopActionBar from './TopActionBar'
import CouncilColumnsView from './CouncilColumnsView'
import ConversationInput from './ConversationInput'

const MainView = ({ onClearAll, subscriptionRestricted = false, subscriptionPaused = false, subscriptionExpiring = false, subscriptionRenewalDate = null, isLoading = false, isGeneratingSummary = false, onCancelPrompt }) => {
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
  // Combined lock: either fully restricted (expired) or paused (voluntary)
  const [usageExhausted, setUsageExhausted] = useState(false)
  const [userPlan, setUserPlan] = useState(currentUser?.plan || 'free_trial')
  const isPromptLocked = subscriptionRestricted || subscriptionPaused || usageExhausted
  const isFreePlan = currentUser?.plan === 'free_trial' && !currentUser?.stripeSubscriptionId
  const navWidth = isNavExpanded ? '240px' : '60px'
  const [mountReady, setMountReady] = useState(false)
  useEffect(() => { const id = requestAnimationFrame(() => setMountReady(true)); return () => cancelAnimationFrame(id) }, [])
  const [streakDays, setStreakDays] = useState(0)
  const setGeminiDetectionResponse = useStore((state) => state.setGeminiDetectionResponse)
  const isSearchingWeb = useStore((state) => state.isSearchingWeb)
  const [showNoModelNotification, setShowNoModelNotification] = useState(false)
  const [showPostWindow, setShowPostWindow] = useState(false)
  const [userIsPrivate, setUserIsPrivate] = useState(false)
  const [showCouncilTooltip, setShowCouncilTooltip] = useState(false)
  const promptMode = useStore((state) => state.promptMode)
  const setPromptMode = useStore((state) => state.setPromptMode)
  const modelRoles = useStore((state) => state.modelRoles)
  const setModelRole = useStore((state) => state.setModelRole)
  const clearModelRoles = useStore((state) => state.clearModelRoles)
  const autoSmartProviders = useStore((state) => state.autoSmartProviders)
  const setAutoSmartProviders = useStore((state) => state.setAutoSmartProviders)

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

  // Check if user's usage is exhausted
  useEffect(() => {
    if (!currentUser?.id) return
    const checkUsage = async () => {
      try {
        const res = await api.get(`${API_URL}/api/stats`)
        const data = res.data
        setUserPlan(data.userPlan || currentUser?.plan || 'free_trial')
        const balance = data.totalAvailableBalance ?? data.remainingFreeAllocation ?? 0
        setUsageExhausted(balance <= 0 && (data.freeMonthlyAllocation || 0) > 0)
      } catch (err) {
        // Don't block on error
      }
    }
    checkUsage()
  }, [currentUser?.id, statsRefreshTrigger])

  // Refs for chat layout
  const textareaRef = useRef(null)
  const chatAreaRef = useRef(null)
  const chatEndRef = useRef(null)
  const responseAreaRef = useRef(null)

  // Fetch streak data and privacy setting
  useEffect(() => {
    if (currentUser?.id) {
      fetchStreak()
      api.get(`${API_URL}/api/profile/${currentUser.id}`).then(res => {
        const isPriv = res.data?.isPrivate || false
        setUserIsPrivate(isPriv)
      }).catch(() => {})
    }
  }, [currentUser, statsRefreshTrigger])

  const fetchStreak = async () => {
    try {
      const response = await api.get(`${API_URL}/api/stats/${currentUser.id}/streak`)
      setStreakDays(response.data.streakDays || 0)
    } catch (error) {
      console.error('Error fetching streak:', error)
      setStreakDays(0)
    }
  }

  const allModels = getAllModels()

  const handleNewChat = useCallback(() => {
    if (currentHistoryId && currentUser?.id) {
      api.post(`${API_URL}/api/history/finalize`, {
        historyId: currentHistoryId,
      }).catch(err => console.error('[History] Error finalizing:', err.message))
    }
    clearResponses()
    clearLastSubmittedPrompt()
    if (currentUser?.id) {
      api.post(`${API_URL}/api/judge/clear-context`, {}).catch(err => console.error('[Clear Context] Error:', err))
      api.post(`${API_URL}/api/model/clear-context`, {}).catch(err => console.error('[Clear Model Context] Error:', err))
    }
    resetConversationState()
  }, [currentHistoryId, currentUser?.id, clearResponses, clearLastSubmittedPrompt, resetConversationState])

  // All models are available - API keys are stored in the backend
  const availableModels = allModels

  // Group models by provider
  const modelsByProvider = availableModels.reduce((acc, model) => {
    // Filter out deepseek, meta, and mistral from main app (keep them for admin page)
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
    const handleGlobalKeyDown = (e) => {
      // Only trigger on Enter key (not Shift+Enter)
      if (e.key !== 'Enter' || e.shiftKey) return
      if (e.defaultPrevented) return
      if (isCouncilColumnInputFocused) return

      const target = e.target
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
      handleSubmitRef.current()
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
  const handleSubmitRef = useRef(null)

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
        
        let newSelectedModels = []
        let hasAutoSmartSelection = false

        const allProviderModelIds = new Set()
        providersWithAutoSmart.forEach(([providerKey]) => {
          const providerData = modelsByProvider[providerKey]
          if (providerData) {
            providerData.models.forEach(model => {
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
            providerData.models.forEach(model => {
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
              const modelByType = providerData.models.find(m => m.type === recommendedModelType)
              
              if (modelByType) {
                modelToUse = modelByType.id
              } else {
                const versatileModel = providerData.models.find(m => m.type === 'versatile')
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
            providersWithSelectedModels.forEach(providerKey => {
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
      } catch (error) {
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
  const topBarVisible = canGenerateSummary || canToggleResultViews || canShowCouncilSideBySideButton
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

  const bottomBarStyle = {
    flexShrink: 0,
    padding: '12px 40px 20px',
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
        style={{
          position: 'fixed',
          top: 0,
          left: navWidth,
          width: `calc(100% - ${navWidth})`,
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          transition: 'left 0.3s ease, width 0.3s ease',
          zIndex: 10,
        }}
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
        />

        {/* ===== SCROLLABLE CHAT AREA ===== */}
      <div
          ref={chatAreaRef}
          className="chat-area"
        style={{
            flex: 1,
            overflowY: showCouncilColumns ? 'hidden' : 'auto',
            padding: showProcessingView ? '0 0 24px 0' : `${normalViewTopPadding} 40px 36px`,
          display: 'flex',
          flexDirection: 'column',
          }}
        >

          {/* ===== COUNCIL PROCESSING VIEW ===== */}
          {showProcessingView && (
            <div style={{
              flex: 1,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: showCouncilLoading ? 'center' : 'flex-start',
              width: '100%',
              height: '100%',
              position: 'relative',
              padding: showCouncilLoading ? '0 0 24px 0' : `${processingTopPadding}px 20px 36px`,
            }}>
              {/* Phase 1: Loading Council of LLMs - centered spinner */}
              {showCouncilLoading && (
                <motion.div
                  initial={{ opacity: 0, scale: 0.9 }}
                  animate={{ opacity: 1, scale: 1 }}
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    gap: '24px',
                  }}
                >
                  <motion.div
                    animate={{ rotate: 360 }}
                    transition={{ duration: 1.5, repeat: Infinity, ease: 'linear' }}
                    style={{
                      width: '56px',
                      height: '56px',
                      border: `3px solid ${currentTheme.borderLight}`,
                      borderTop: `3px solid ${currentTheme.accent}`,
                      borderRadius: '50%',
                    }}
                  />
                  <span style={{
                    fontSize: '1.2rem',
                    fontWeight: '500',
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
                      style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
                    >
                      <Search size={14} color={currentTheme.accent} />
                      <span style={{ color: currentTheme.accent, fontSize: '0.85rem', fontWeight: '500' }}>Searching the web</span>
                      <motion.span
                        animate={{ opacity: [1, 0.3, 1] }}
                        transition={{ duration: 1.5, repeat: Infinity, ease: 'easeInOut' }}
                        style={{ color: currentTheme.accent, fontSize: '0.85rem' }}
                      >...</motion.span>
                    </motion.div>
                  )}
                </motion.div>
              )}

              <CouncilColumnsView
                showCouncilColumns={showCouncilColumns}
                isLoading={isLoading}
                isGeneratingSummary={isGeneratingSummary}
                onCancelPrompt={onCancelPrompt}
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
              />

              {/* Phase 2b: Single model streaming - show as normal flowing response */}
              {showSingleModelStreamingPhase && (
                <motion.div
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  style={{ maxWidth: '800px', width: '100%', padding: '0 20px 36px' }}
                >
                  {/* User prompt bubble */}
                  <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '24px' }}>
                    <div style={{
                      maxWidth: '75%',
                      background: currentTheme.buttonBackground,
                      border: `1px solid ${currentTheme.borderLight}`,
                      borderRadius: '16px 16px 4px 16px',
                      padding: '12px 18px',
                    }}>
                      <div style={{ fontSize: '0.7rem', fontWeight: '600', color: currentTheme.text, marginBottom: '4px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>You</div>
                      <p style={{ color: currentTheme.text, lineHeight: '1.6', fontSize: '1rem', whiteSpace: 'pre-wrap', margin: 0 }}>
                        {lastSubmittedPrompt}
                      </p>
                    </div>
                  </div>
                  {/* Model name label */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '14px' }}>
                    <FileText size={16} color={currentTheme.accent} />
                    <span style={{ color: currentTheme.accent, fontSize: '0.8rem', fontWeight: '600', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                      {getProviderDisplayName(primaryResponse?.modelName)}
                    </span>
                  </div>
                  {/* Streaming response */}
                  <div>
                    <MarkdownRenderer content={primaryResponse?.text || ''} theme={currentTheme} fontSize="1rem" lineHeight="1.85" />
                  </div>
                </motion.div>
              )}

              {/* Phase 3: Summary streaming - replaces council columns */}
              {showSummaryStreamingPhase && (
                <motion.div
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  style={{ maxWidth: '800px', width: '100%', padding: '0 20px 36px' }}
                >
                  {isGeneratingSummary && (
                    <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '18px' }}>
                      <motion.button
                        onClick={() => { if (onCancelPrompt) onCancelPrompt() }}
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          padding: '8px 14px',
                          background: 'rgba(239, 68, 68, 0.12)',
                          border: '1px solid #ef4444',
                          borderRadius: '10px',
                          color: theme === 'light' ? '#dc2626' : '#fff',
                          cursor: 'pointer',
                          transition: 'all 0.2s ease',
                          fontSize: '0.82rem',
                          fontWeight: '600',
                        }}
                        whileHover={{ scale: 1.03 }}
                        whileTap={{ scale: 0.97 }}
                        title="Cancel"
                      >
                        Cancel
                      </motion.button>
                    </div>
                  )}
                  {/* User prompt bubble */}
                  <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '24px' }}>
                    <div style={{
                      maxWidth: '75%',
                      background: currentTheme.buttonBackground,
                      border: `1px solid ${currentTheme.borderLight}`,
                      borderRadius: '16px 16px 4px 16px',
                      padding: '12px 18px',
                    }}>
                      <div style={{ fontSize: '0.7rem', fontWeight: '600', color: currentTheme.text, marginBottom: '4px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>You</div>
                      <p style={{ color: currentTheme.text, lineHeight: '1.6', fontSize: '1rem', whiteSpace: 'pre-wrap', margin: 0 }}>
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
          <div style={{ maxWidth: '800px', width: '100%', margin: '0 auto', flex: 1, display: 'flex', flexDirection: 'column' }}>
            
            {/* Welcome header removed - title now lives in provider tab */}

            {/* ===== CONVERSATION FLOW ===== */}
            {/* Only show the prompt bubble + inline response once the response is actually ready */}
            {/* This prevents the user's prompt from sitting alone while council models are still streaming */}
            {hasActiveConversation && inlineResponseText && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '28px', paddingTop: '20px', paddingBottom: '20px' }}>
                
                {/* User Prompt Bubble */}
                <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                  <div style={{
                    maxWidth: '75%',
                    background: currentTheme.buttonBackground,
                    border: `1px solid ${currentTheme.borderLight}`,
                    borderRadius: '16px 16px 4px 16px',
                    padding: '12px 18px',
                  }}>
                    <div style={{
                      fontSize: '0.7rem',
                      fontWeight: '600',
                      color: currentTheme.text,
                      marginBottom: '4px',
                      textTransform: 'uppercase',
                      letterSpacing: '0.5px',
                    }}>
                      You
                    </div>
                    <p style={{
                      color: currentTheme.text,
                      lineHeight: '1.6',
                      fontSize: '1rem',
                      whiteSpace: 'pre-wrap',
                      margin: 0,
                    }}>
                      {lastSubmittedPrompt}
          </p>
          </div>
        </div>

                {/* Response - Free flowing text, NO container/border */}
                {inlineResponseText && (
                  <div ref={responseAreaRef} style={{ padding: '4px 0 0 4px' }}>
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
                  showSingleModelConvoInput={showSingleModelConvoInput}
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
                style={{
                  display: 'flex',
                  justifyContent: isSearchingWeb && streakDays > 0 ? 'space-between' : isSearchingWeb ? 'flex-start' : 'flex-end',
                  alignItems: 'center',
                  paddingBottom: '8px',
                }}
              >
                {isSearchingWeb && (
                  <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: '4px',
                        }}
                      >
                    <Search size={14} color={currentTheme.accent} />
                    <span style={{ color: currentTheme.accent, fontSize: '0.75rem', fontWeight: 'bold' }}>Searching the web</span>
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
                  <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                        <Flame size={14} color="#FF6B00" />
                        <span style={{ color: '#FF6B00', fontSize: '0.75rem', fontWeight: 'bold' }}>
                          {streakDays} day streak
                        </span>
                      </div>
                    )}
                  </div>
            )}
            {/* Subscription paused notice */}
            {subscriptionExpiring && subscriptionRenewalDate && (
              <div style={{ textAlign: 'center', marginBottom: '6px' }}>
                <span style={{
                  fontSize: '0.68rem',
                  color: 'rgba(255, 255, 255, 0.55)',
                  fontWeight: '400',
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
                fontSize: '1.3rem',
                fontWeight: '600',
                margin: '0 0 12px 0',
                background: currentTheme.accentGradient,
                WebkitBackgroundClip: 'text',
                WebkitTextFillColor: 'transparent',
                letterSpacing: '0.3px',
              }}
            >
              Welcome to the Council of the LLMs
            </h2>

            {/* Fetching Response Indicator - above prompt box */}
            <AnimatePresence>
              {(isLoading || isGeneratingSummary) && (
                <motion.div
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: 10 }}
                  transition={{ duration: 0.25 }}
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '10px',
                    marginBottom: '14px',
                    padding: '12px 24px',
                  }}
                >
                  <motion.button
                    onClick={() => { if (onCancelPrompt) onCancelPrompt() }}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      padding: '8px 14px',
                      background: 'rgba(239, 68, 68, 0.12)',
                      border: '1px solid #ef4444',
                      borderRadius: '10px',
                      color: theme === 'light' ? '#dc2626' : '#fff',
                      cursor: 'pointer',
                      transition: 'all 0.2s ease',
                      fontSize: '0.82rem',
                      fontWeight: '600',
                    }}
                    whileHover={{ scale: 1.03 }}
                    whileTap={{ scale: 0.97 }}
                    title="Cancel"
                  >
                    Cancel
                  </motion.button>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '12px' }}>
                  <motion.div
                    animate={{ rotate: 360 }}
                    transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
                    style={{
                      width: '20px',
                      height: '20px',
                      border: `2.5px solid ${currentTheme.borderLight}`,
                      borderTop: `2.5px solid ${currentTheme.accent}`,
                      borderRadius: '50%',
                      flexShrink: 0,
                    }}
                  />
                  <span style={{
                    fontSize: '0.95rem',
                    fontWeight: '500',
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
              borderRadius: '20px',
              overflow: 'visible',
              boxShadow: promptMode === 'debate'
                ? `0 2px 16px ${currentTheme.name === 'dark' ? 'rgba(231, 76, 60, 0.12)' : 'rgba(192, 57, 43, 0.08)'}`
                : `0 2px 12px ${currentTheme.shadow}`,
              transition: 'background 0.3s ease, border 0.3s ease, box-shadow 0.3s ease',
            }}>
              {/* Usage Exhausted Overlay */}
              {usageExhausted && !subscriptionRestricted && !subscriptionPaused && (
                <div
                  style={{
                    position: 'absolute',
                    top: 0,
                    left: 0,
                    right: 0,
                    bottom: 0,
                    zIndex: 50,
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    justifyContent: 'center',
                    background: 'linear-gradient(135deg, rgba(0, 0, 0, 0.8) 0%, rgba(30, 20, 50, 0.9) 100%)',
                    backdropFilter: 'blur(6px)',
                    borderRadius: '20px',
                    gap: '10px',
                    padding: '24px 20px',
                  }}
                >
                  <div style={{
                    width: '52px',
                    height: '52px',
                    borderRadius: '50%',
                    background: 'linear-gradient(135deg, rgba(255, 170, 0, 0.2), rgba(255, 100, 0, 0.08))',
                    border: '1.5px solid rgba(255, 170, 0, 0.4)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}>
                    <AlertTriangle size={26} color="#ffaa00" />
                  </div>
                  <p style={{
                    color: '#ffaa00',
                    fontSize: '0.95rem',
                    fontWeight: '600',
                    textAlign: 'center',
                    margin: 0,
                    lineHeight: '1.4',
                  }}>
                    Usage Limit Reached
                  </p>
                  <p style={{
                    color: 'rgba(255, 255, 255, 0.5)',
                    fontSize: '0.8rem',
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
                  <div style={{ display: 'flex', gap: '8px', marginTop: '4px' }}>
                    {isFreePlan ? (
                      <motion.button
                        onClick={() => setActiveTab('settings')}
                        whileHover={{ scale: 1.04 }}
                        whileTap={{ scale: 0.96 }}
                        style={{
                          padding: '8px 20px',
                          background: 'linear-gradient(135deg, #48c9b0, #5dade2)',
                          border: 'none',
                          borderRadius: '10px',
                          color: '#fff',
                          fontSize: '0.8rem',
                          fontWeight: '600',
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
                            padding: '8px 20px',
                            background: 'linear-gradient(135deg, #48c9b0, #5dade2)',
                            border: 'none',
                            borderRadius: '10px',
                            color: '#fff',
                            fontSize: '0.8rem',
                            fontWeight: '600',
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
                            padding: '8px 20px',
                            background: 'rgba(255, 255, 255, 0.1)',
                            border: '1px solid rgba(255, 255, 255, 0.2)',
                            borderRadius: '10px',
                            color: 'rgba(255, 255, 255, 0.7)',
                            fontSize: '0.8rem',
                            fontWeight: '600',
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
                  style={{
                    position: 'absolute',
                    top: 0,
                    left: 0,
                    right: 0,
                    bottom: 0,
                    zIndex: 50,
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    justifyContent: 'center',
                    background: subscriptionPaused && !subscriptionRestricted
                      ? 'linear-gradient(135deg, rgba(0, 0, 0, 0.75) 0%, rgba(30, 30, 50, 0.85) 100%)'
                      : 'rgba(0, 0, 0, 0.75)',
                    backdropFilter: 'blur(6px)',
                    borderRadius: '20px',
                    gap: '10px',
                    padding: '24px 20px',
                  }}
                >
                  <div style={{
                    width: '52px',
                    height: '52px',
                    borderRadius: '50%',
                    background: subscriptionPaused && !subscriptionRestricted
                      ? 'linear-gradient(135deg, rgba(255, 170, 0, 0.2), rgba(255, 170, 0, 0.08))'
                      : 'linear-gradient(135deg, rgba(255, 59, 48, 0.2), rgba(255, 59, 48, 0.08))',
                    border: `1.5px solid ${subscriptionPaused && !subscriptionRestricted ? 'rgba(255, 170, 0, 0.4)' : 'rgba(255, 59, 48, 0.4)'}`,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}>
                    {subscriptionPaused && !subscriptionRestricted
                      ? <PauseCircle size={26} color="#ffaa00" />
                      : <Lock size={24} color="#ff6b6b" />
                    }
                  </div>
                  <p style={{
                    color: subscriptionPaused && !subscriptionRestricted ? '#ffaa00' : '#ff6b6b',
                    fontSize: '0.95rem',
                    fontWeight: '600',
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
                    fontSize: '0.8rem',
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
                      marginTop: '4px',
                      padding: '8px 20px',
                      background: subscriptionPaused && !subscriptionRestricted
                        ? 'linear-gradient(135deg, #ffaa00, #ff8800)'
                        : 'linear-gradient(135deg, #ff6b6b, #ee5a5a)',
                      border: 'none',
                      borderRadius: '10px',
                      color: '#fff',
                      fontSize: '0.8rem',
                      fontWeight: '600',
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
                <div style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '4px',
                  padding: '8px 16px 0 16px',
                }}>
                  <div style={{
                    display: 'flex',
                    alignItems: 'center',
                    background: currentTheme.name === 'dark' ? 'rgba(255, 255, 255, 0.05)' : 'rgba(0, 0, 0, 0.04)',
                    borderRadius: '10px',
                    padding: '3px',
                    border: `1px solid ${currentTheme.borderLight}`,
                  }}>
                    {[
                      { key: 'general', label: 'General', icon: <MessageCircle size={13} /> },
                      { key: 'debate', label: 'Debate', icon: <Swords size={13} /> },
                    ].map((mode) => (
                      <button
                        key={mode.key}
                        onClick={() => {
                          setPromptMode(mode.key)
                        }}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: '5px',
                          padding: '5px 12px',
                          borderRadius: '8px',
                          border: 'none',
                          cursor: 'pointer',
                          fontSize: '0.78rem',
                          fontWeight: promptMode === mode.key ? '600' : '500',
                          color: promptMode === mode.key
                            ? (mode.key === 'debate'
                              ? (currentTheme.name === 'dark' ? '#ff6b6b' : '#c0392b')
                              : (currentTheme.name === 'dark' ? '#fff' : '#1a365d'))
                            : currentTheme.textMuted,
                          background: promptMode === mode.key
                            ? (mode.key === 'debate'
                              ? (currentTheme.name === 'dark' ? 'rgba(231, 76, 60, 0.15)' : 'rgba(192, 57, 43, 0.12)')
                              : (currentTheme.name === 'dark' ? 'rgba(255, 255, 255, 0.10)' : 'rgba(44, 82, 130, 0.10)'))
                            : 'transparent',
                          transition: 'all 0.15s ease',
                        }}
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
                    <div style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '6px',
                      padding: '6px 20px',
                      borderBottom: `1px solid ${currentTheme.name === 'dark' ? 'rgba(231, 76, 60, 0.15)' : 'rgba(192, 57, 43, 0.10)'}`,
                    }}>
                      <Swords size={12} color={currentTheme.name === 'dark' ? '#ff6b6b' : '#c0392b'} />
                      <span style={{
                        fontSize: '0.65rem',
                        fontWeight: '700',
                        letterSpacing: '1.2px',
                        textTransform: 'uppercase',
                        color: currentTheme.name === 'dark' ? '#ff6b6b' : '#c0392b',
                      }}>
                        Debate Mode
                      </span>
                      <span style={{
                        fontSize: '0.6rem',
                        fontWeight: '500',
                        color: currentTheme.textMuted,
                        marginLeft: '4px',
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
                    textarea.style.height = Math.min(textarea.scrollHeight, 200) + 'px'
                  }
                }}
                disabled={isPromptLocked}
                placeholder={isPromptLocked ? (subscriptionPaused ? "Account paused..." : "Resubscribe to send prompts...") : promptMode === 'debate' ? "Enter a statement here and get responses with varying views..." : "Enter a prompt here to get a response from the council of LLMs or individual models..."}
                style={{
                  width: '100%',
                  minHeight: '70px',
                  maxHeight: '200px',
                  padding: '16px 20px 8px 20px',
                  background: 'transparent',
                  border: 'none',
                  borderRadius: '20px 20px 0 0',
                  color: currentTheme.text,
                  fontSize: '1rem',
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

      {/* DISABLED: Post to Prompt Feed Window temporarily removed (social media feature) */}
      {false && (
        <PostToFeedWindow
          isOpen={showPostWindow}
          onClose={() => setShowPostWindow(false)}
          currentTheme={currentTheme}
          lastSubmittedPrompt={lastSubmittedPrompt}
          lastSubmittedCategory={lastSubmittedCategory}
          responses={responses}
          summary={summary}
          ragDebugData={ragDebugData}
          userIsPrivate={userIsPrivate}
        />
      )}

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

    </>
  )
}

export default MainView
