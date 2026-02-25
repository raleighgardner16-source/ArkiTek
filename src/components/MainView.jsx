import React, { useState, useEffect, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Send, ChevronDown, ChevronUp, Check, XCircle, Flame, Sparkles, Info, Trophy, Search, Lock, FileText, LayoutGrid, Trash2, PauseCircle, Globe, Square, MessageSquarePlus, Coins, DollarSign, Maximize2, X } from 'lucide-react'
import { useStore } from '../store/useStore'
import { getAllModels, LLM_PROVIDERS } from '../services/llmProviders'
import { detectCategory } from '../utils/categoryDetector'
import { getTheme } from '../utils/theme'
import axios from 'axios'
import { API_URL } from '../utils/config'
import { streamFetch } from '../utils/streamFetch'
import MarkdownRenderer from './MarkdownRenderer'
import TokenUsageWindow from './TokenUsageWindow'
import CostBreakdownWindow from './CostBreakdownWindow'

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
  const setSummary = useStore((state) => state.setSummary)
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
  const isPromptLocked = subscriptionRestricted || subscriptionPaused
  const navWidth = isNavExpanded ? '260px' : '60px'
  const [streakDays, setStreakDays] = useState(0)
  const setGeminiDetectionResponse = useStore((state) => state.setGeminiDetectionResponse)
  const isSearchingWeb = useStore((state) => state.isSearchingWeb)
  const [showNoModelNotification, setShowNoModelNotification] = useState(false)
  const [showPostWindow, setShowPostWindow] = useState(false)
  const [isSubmittingToVote, setIsSubmittingToVote] = useState(false)
  const [promptPostedSuccess, setPromptPostedSuccess] = useState(false)
  const [postDescription, setPostDescription] = useState('')
  const [postPromptExpanded, setPostPromptExpanded] = useState(false)
  const [postActiveTab, setPostActiveTab] = useState(null)
  const [postIncludeSummary, setPostIncludeSummary] = useState(true)
  const [postExcludedResponses, setPostExcludedResponses] = useState(new Set())
  const [postVisibility, setPostVisibility] = useState('public')
  const [userIsPrivate, setUserIsPrivate] = useState(false)
  const [showCouncilTooltip, setShowCouncilTooltip] = useState(false)

  // Inline conversation state (moved from SummaryWindow)
  const [conversationInput, setConversationInput] = useState('')
  const [isSendingConvo, setIsSendingConvo] = useState(false)
  const [isSearchingInConvo, setIsSearchingInConvo] = useState(false)
  const [conversationContext, setConversationContext] = useState([])
  const [summaryConvoSources, setSummaryConvoSources] = useState({}) // { turnIndex: [...sources] } — per-turn summary follow-up search
  const [showSummaryConvoSources, setShowSummaryConvoSources] = useState({}) // { turnIndex: true/false }
  const [showCouncilColumnSources, setShowCouncilColumnSources] = useState({}) // { responseId: true/false }
  const [showClearSummaryTooltip, setShowClearSummaryTooltip] = useState(false)
  const [showPostPromptTooltip, setShowPostPromptTooltip] = useState(false)
  const [showClearTooltip, setShowClearTooltip] = useState(false)
  const [showPostPromptSingleTooltip, setShowPostPromptSingleTooltip] = useState(false)
  const [showSendTooltip, setShowSendTooltip] = useState(false)
  const [showSingleTokenUsage, setShowSingleTokenUsage] = useState(false)
  const [showTopCostBreakdown, setShowTopCostBreakdown] = useState(false)
  const tokenData = useStore((state) => state.tokenData)
  const queryCount = useStore((state) => state.queryCount || 0)

  // Single-model conversation state
  const [singleModelConvoInput, setSingleModelConvoInput] = useState('')
  const [isSendingSingleConvo, setIsSendingSingleConvo] = useState(false)
  const [isSearchingInSingleConvo, setIsSearchingInSingleConvo] = useState(false)
  const [singleModelConvoHistory, setSingleModelConvoHistory] = useState([])
  const [singleModelInitialSources, setSingleModelInitialSources] = useState([])
  const [singleConvoSources, setSingleConvoSources] = useState({}) // { turnIndex: [...sources] } — per-turn single-model follow-up search
  const [showSingleConvoSources, setShowSingleConvoSources] = useState({}) // { turnIndex: true/false }
  const [councilColumnConvoInputs, setCouncilColumnConvoInputs] = useState({}) // { responseId: inputText }
  const [councilColumnConvoHistory, setCouncilColumnConvoHistory] = useState({}) // { responseId: [{user, assistant, timestamp}] }
  const [councilColumnConvoSending, setCouncilColumnConvoSending] = useState({}) // { responseId: boolean }
  const [councilColumnConvoSearching, setCouncilColumnConvoSearching] = useState({}) // { responseId: boolean }
  const [councilColumnConvoSources, setCouncilColumnConvoSources] = useState({}) // { `${responseId}-${turnIdx}`: [...sources] }
  const [showCouncilColumnConvoSources, setShowCouncilColumnConvoSources] = useState({}) // { `${responseId}-${turnIdx}`: boolean }
  const [isCouncilColumnInputFocused, setIsCouncilColumnInputFocused] = useState(false)
  const [isSubmitPending, setIsSubmitPending] = useState(false) // Immediate UI feedback before App flips isLoading
  const [maximizedCouncilResponseId, setMaximizedCouncilResponseId] = useState(null)
  const [resultViewMode, setResultViewMode] = useState('summary') // 'summary' | 'council'

  // Refs for chat layout
  const textareaRef = useRef(null)
  const chatAreaRef = useRef(null)
  const chatEndRef = useRef(null)
  const convoTextareaRef = useRef(null)
  const singleConvoTextareaRef = useRef(null)
  const singleConvoAbortControllerRef = useRef(null)
  const responseAreaRef = useRef(null)

  // Fetch streak data and privacy setting
  useEffect(() => {
    if (currentUser?.id) {
      fetchStreak()
      axios.get(`${API_URL}/api/profile/${currentUser.id}`).then(res => {
        const isPriv = res.data?.isPrivate || false
        setUserIsPrivate(isPriv)
        if (isPriv) setPostVisibility('followers')
      }).catch(() => {})
    }
  }, [currentUser, statsRefreshTrigger])

  const fetchStreak = async () => {
    try {
      const response = await axios.get(`${API_URL}/api/stats/${currentUser.id}/streak`)
      setStreakDays(response.data.streakDays || 0)
    } catch (error) {
      console.error('Error fetching streak:', error)
      setStreakDays(0)
    }
  }

  const allModels = getAllModels()
  
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

  // Define the order for provider tabs (left to right)
  const providerOrder = ['openai', 'anthropic', 'google', 'xai']
  
  // Sort providers according to the specified order
  const sortedProviders = Object.entries(modelsByProvider).sort((a, b) => {
    const indexA = providerOrder.indexOf(a[0].toLowerCase())
    const indexB = providerOrder.indexOf(b[0].toLowerCase())
    
    // If provider is not in the order list, put it at the end
    if (indexA === -1 && indexB === -1) return 0
    if (indexA === -1) return 1
    if (indexB === -1) return -1
    
    return indexA - indexB
  }).map(([providerKey, providerData]) => {
    return [providerKey, providerData]
  })

  // Track which provider tab is expanded (only one at a time) - now click-based
  const [expandedProviders, setExpandedProviders] = useState({})
  const autoSmartProviders = useStore((state) => state.autoSmartProviders)
  const setAutoSmartProviders = useStore((state) => state.setAutoSmartProviders)
  const [dropdownPositions, setDropdownPositions] = useState({}) // Store dropdown positions

  // Shift the bottom bar up when a provider dropdown is open so model options are visible
  const isAnyProviderExpanded = Object.values(expandedProviders).some(v => v)
  const [tooltipState, setTooltipState] = useState({ show: false, type: null, x: 0, y: 0 }) // Tooltip state
  const dropdownRefs = useRef({})
  const providerButtonRefs = useRef({})
  const tooltipTimeoutRef = useRef(null)
  
  const handleArrowClick = (providerKey, e) => {
    e.stopPropagation()
    e.preventDefault()
    
    const isCurrentlyExpanded = expandedProviders[providerKey]
    
    // Set an initial dropdown position above the button
    const buttonRef = providerButtonRefs.current[providerKey]
    if (buttonRef && !isCurrentlyExpanded) {
      const rect = buttonRef.getBoundingClientRect()
      // Estimate dropdown height based on number of models (each ~60px + Auto Smart ~50px + padding ~24px)
      const providerData = sortedProviders.find(([key]) => key === providerKey)?.[1]
      const estimatedHeight = providerData ? (providerData.models.length * 60) + 50 + 24 : 300
      // Position above the button by default (since buttons are at bottom of screen)
      let top = rect.top - estimatedHeight - 8
      if (top < 10) {
        top = rect.bottom + 8
      }
      setDropdownPositions((prev) => ({
        ...prev,
        [providerKey]: {
          top,
          left: rect.left,
          width: Math.max(rect.width, 220),
          positionAbove: true,
        },
      }))
    }
    
    // Toggle the expanded state for this provider
    setExpandedProviders((prev) => {
      const wasExpanded = prev[providerKey]
      if (wasExpanded) {
        return {}
      } else {
      return { [providerKey]: true }
      }
    })
  }

  const handleProviderTabClick = (providerKey, e) => {
    // Don't handle if clicking on the arrow wrapper
    if (e.target.closest('[data-arrow-wrapper]')) {
      return
    }
    
    e.preventDefault()
    e.stopPropagation()
    
    const providerData = modelsByProvider[providerKey]
    if (!providerData) {
      console.warn('[handleProviderTabClick] Provider data not found for:', providerKey)
      return
    }
    
    
    // Check if any models from this provider are already selected
    const selectedFromProvider = providerData.models.filter(model => 
      selectedModels.includes(model.id)
    )
    
    // Check if Auto Smart is currently enabled for this provider
    const isAutoSmartEnabled = autoSmartProviders[providerKey] || false
    
    // If any models from this provider are selected OR Auto Smart is enabled, deselect them all
    if (selectedFromProvider.length > 0 || isAutoSmartEnabled) {
      const newSelectedModels = selectedModels.filter(id => 
        !providerData.models.some(model => model.id === id)
      )
      setSelectedModels(newSelectedModels)
      // Disable Auto Smart for this provider
      setAutoSmartProviders((prev) => {
        const newState = { ...prev }
        delete newState[providerKey]
        return newState
      })
      // Close the dropdown if it's open
      setExpandedProviders((prev) => {
        const newState = { ...prev }
        delete newState[providerKey]
        return newState
      })
    } else {
      // No models selected from this provider and Auto Smart not enabled, so enable Auto Smart
      // Remove any manually selected models from this provider first
      const newSelectedModels = selectedModels.filter(id => 
        !providerData.models.some(model => model.id === id)
      )
      setSelectedModels(newSelectedModels)
      
      // Enable Auto Smart - the actual model selection will happen when the prompt is submitted
      setAutoSmartProviders((prev) => ({
        ...prev,
        [providerKey]: true,
      }))
    }
  }

  const toggleAutoSmart = (providerKey, e) => {
    e.stopPropagation()
    const isCurrentlyEnabled = autoSmartProviders[providerKey] || false
    
    if (isCurrentlyEnabled) {
      // Disabling Auto Smart - remove all models from this provider
      const providerData = modelsByProvider[providerKey]
      if (providerData) {
        const newSelectedModels = selectedModels.filter(id => 
          !providerData.models.some(model => model.id === id)
        )
        setSelectedModels(newSelectedModels)
      }
    } else {
      // Enabling Auto Smart - remove all manually selected models from this provider
      // Auto Smart will select the best model when the prompt is submitted
      const providerData = modelsByProvider[providerKey]
      if (providerData) {
        const newSelectedModels = selectedModels.filter(id => 
          !providerData.models.some(model => model.id === id)
        )
        setSelectedModels(newSelectedModels)
      }
    }
    
    setAutoSmartProviders((prev) => ({
      ...prev,
      [providerKey]: !prev[providerKey],
    }))

    // Close dropdown and shift bar back down after toggling auto smart
    setExpandedProviders({})
  }

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event) => {
      // Check if click is outside all provider buttons and dropdowns
      const clickedButton = Object.values(providerButtonRefs.current).some((ref) => {
        if (!ref) return false
        return ref.contains(event.target)
      })
      
      const clickedDropdown = Object.values(dropdownRefs.current).some((ref) => {
        if (!ref) return false
        return ref.contains(event.target)
      })
      
      // Also check if clicking on the arrow wrapper div
      const clickedArrow = event.target.closest('[data-arrow-wrapper]')
      
      // Only close if clicking completely outside
      if (!clickedButton && !clickedDropdown && !clickedArrow) {
        setExpandedProviders({})
      }
    }

    // Update dropdown positions on scroll/resize
    const updatePositions = () => {
      Object.keys(expandedProviders).forEach((providerKey) => {
        if (expandedProviders[providerKey]) {
          const buttonRef = providerButtonRefs.current[providerKey]
          const dropdownRef = dropdownRefs.current[providerKey]
          if (buttonRef) {
            const rect = buttonRef.getBoundingClientRect()
            const dropdownHeight = dropdownRef ? dropdownRef.offsetHeight : 300
            
            let top = rect.top - dropdownHeight - 8
            if (top < 10) {
              top = rect.bottom + 8
            }
            
            setDropdownPositions((prev) => ({
              ...prev,
              [providerKey]: {
                top,
                left: rect.left,
                width: Math.max(rect.width, 220),
                positionAbove: true,
              },
            }))
          }
        }
      })
    }

    window.addEventListener('scroll', updatePositions, true)
    window.addEventListener('resize', updatePositions)
      document.addEventListener('mousedown', handleClickOutside)
      return () => {
      window.removeEventListener('scroll', updatePositions, true)
      window.removeEventListener('resize', updatePositions)
        document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [expandedProviders])

  // Recalculate dropdown positions after expanding
  useEffect(() => {
    if (!isAnyProviderExpanded) return

    // Use a short delay to let the DOM update, then position the dropdown above the button
    const timer = setTimeout(() => {
      Object.keys(expandedProviders).forEach((providerKey) => {
        if (expandedProviders[providerKey]) {
          const buttonRef = providerButtonRefs.current[providerKey]
          const dropdownRef = dropdownRefs.current[providerKey]
          if (buttonRef) {
            const rect = buttonRef.getBoundingClientRect()
            const dropdownHeight = dropdownRef ? dropdownRef.offsetHeight : 300
            
            // Position above the button
            let top = rect.top - dropdownHeight - 8
            // If it would go above the viewport, position below instead
            if (top < 10) {
              top = rect.bottom + 8
            }
            
            setDropdownPositions((prev) => ({
              ...prev,
              [providerKey]: {
                top,
                left: rect.left,
                width: Math.max(rect.width, 220),
                positionAbove: true,
              },
            }))
          }
        }
      })
    }, 50)

    return () => clearTimeout(timer)
  }, [isAnyProviderExpanded, expandedProviders]) // eslint-disable-line react-hooks/exhaustive-deps

  // Tooltip content for model types
  const getModelTypeTooltip = (type) => {
    switch (type) {
      case 'reasoning':
        return 'Reasoning models excel at complex problem-solving, logical analysis, and step-by-step thinking. Best for math, coding, and analytical tasks.'
      case 'versatile':
        return 'Versatile models are well-rounded and handle a wide variety of tasks effectively. Good for general conversation, writing, and multi-purpose use.'
      case 'fast':
        return 'Fast models prioritize speed and efficiency. Ideal for quick responses, simple queries, text processing, and when speed is more important than depth.'
      default:
        return ''
    }
  }

  // Handle tooltip show/hide
  const handleTooltipShow = (e, type) => {
    if (tooltipTimeoutRef.current) {
      clearTimeout(tooltipTimeoutRef.current)
    }
    const rect = e.currentTarget.getBoundingClientRect()
    const tooltipWidth = 280 // maxWidth of tooltip
    const padding = 10
    const windowWidth = window.innerWidth
    
    // Check if there's enough space to the right
    const spaceToRight = windowWidth - rect.right
    const spaceToLeft = rect.left
    
    let x, y
    
    if (spaceToRight >= tooltipWidth + padding) {
      // Position to the right
      x = rect.right + padding
      y = rect.top
    } else if (spaceToLeft >= tooltipWidth + padding) {
      // Position to the left
      x = rect.left - tooltipWidth - padding
      y = rect.top
    } else {
      // Not enough space on either side, position to the right but adjust if needed
      x = Math.max(padding, Math.min(rect.right + padding, windowWidth - tooltipWidth - padding))
      y = rect.top
    }
    
    setTooltipState({
      show: true,
      type: type,
      x: x,
      y: y,
    })
  }

  const handleTooltipHide = () => {
    tooltipTimeoutRef.current = setTimeout(() => {
      setTooltipState({ show: false, type: null, x: 0, y: 0 })
    }, 100)
  }

  // Clean up selectedModels - remove any that don't exist in availableModels
  useEffect(() => {
    const validModelIds = availableModels.map(m => m.id)
    const invalidModels = selectedModels.filter(id => !validModelIds.includes(id))
    if (invalidModels.length > 0) {
      console.warn('[DEBUG] Removing invalid model selections:', invalidModels)
      setSelectedModels(selectedModels.filter(id => validModelIds.includes(id)))
    }
  }, [availableModels, selectedModels, setSelectedModels])

  // On sign-in (or first visit), restore saved model preferences from the server.
  // If no preferences exist (brand new user), default to Auto Smart for all providers.
  const modelPrefsRestoredForUserRef = useRef(null)
  useEffect(() => {
    if (Object.keys(modelsByProvider).length === 0) return
    const restoreKey = currentUser?.id || 'guest'
    if (modelPrefsRestoredForUserRef.current === restoreKey) return

    const hasStorePrefs = selectedModels.length > 0 || Object.keys(autoSmartProviders).length > 0
    const applyDefaultAutoSmart = () => {
      const autoSmartState = {}
      Object.keys(modelsByProvider).forEach(providerKey => {
        autoSmartState[providerKey] = true
      })
      setSelectedModels([])
      setAutoSmartProviders(autoSmartState)
      localStorage.setItem('arktek-models-initialized', 'true')
    }

    // If preferences were already placed in store (e.g. sign-in response), keep them.
    if (hasStorePrefs) {
      modelPrefsRestoredForUserRef.current = restoreKey
      return
    }

    let cancelled = false
    const restoreModelPrefs = async () => {
      // Signed-in user: load their last saved config from backend.
      if (currentUser?.id) {
        try {
          const response = await axios.get(`${API_URL}/api/user/model-preferences/${currentUser.id}`)
          if (cancelled) return

          const prefs = response.data?.modelPreferences
          const savedModels = Array.isArray(prefs?.selectedModels) ? prefs.selectedModels : []
          const savedAutoSmart = (prefs?.autoSmartProviders && typeof prefs.autoSmartProviders === 'object') ? prefs.autoSmartProviders : {}

          if (savedModels.length > 0 || Object.keys(savedAutoSmart).length > 0) {
            setSelectedModels(savedModels)
            setAutoSmartProviders(savedAutoSmart)
            localStorage.setItem('arktek-models-initialized', 'true')
          } else {
            applyDefaultAutoSmart()
          }
        } catch (error) {
          console.error('[Model Prefs] Error loading preferences:', error.message)
          applyDefaultAutoSmart()
        } finally {
          if (!cancelled) modelPrefsRestoredForUserRef.current = restoreKey
        }
        return
      }

      // Guest/no user: keep sane defaults.
      applyDefaultAutoSmart()
      modelPrefsRestoredForUserRef.current = restoreKey
    }

    restoreModelPrefs()

    return () => {
      cancelled = true
    }
  }, [modelsByProvider, currentUser?.id, selectedModels, autoSmartProviders, setSelectedModels, setAutoSmartProviders])

  // Debounced save of model preferences to the server whenever they change
  const savePrefsTimeoutRef = useRef(null)
  useEffect(() => {
    if (!currentUser?.id) return
    if (modelPrefsRestoredForUserRef.current !== currentUser.id) return // Don't save before restore completes for this user

    // Debounce: save 1.5s after last change
    if (savePrefsTimeoutRef.current) clearTimeout(savePrefsTimeoutRef.current)
    savePrefsTimeoutRef.current = setTimeout(() => {
      axios.put(`${API_URL}/api/user/model-preferences`, {
        userId: currentUser.id,
        selectedModels,
        autoSmartProviders,
      }).catch(err => console.error('[Model Prefs] Error saving:', err.message))
    }, 1500)

    return () => {
      if (savePrefsTimeoutRef.current) clearTimeout(savePrefsTimeoutRef.current)
    }
  }, [selectedModels, autoSmartProviders, currentUser?.id])

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

  const toggleModel = (modelId) => {
    const model = availableModels.find(m => m.id === modelId)
    if (!model || !model.provider) return
    
    const providerKey = model.provider
    
    if (selectedModels.includes(modelId)) {
      setSelectedModels(selectedModels.filter((id) => id !== modelId))
    } else {
      const newSelectedModels = selectedModels.filter(id => {
        const m = availableModels.find(am => am.id === id)
        return !m || m.provider !== providerKey
      })
      
      setSelectedModels([...newSelectedModels, modelId])
      
      setAutoSmartProviders((prev) => {
        const newState = { ...prev }
        delete newState[providerKey]
        return newState
      })
    }

    // Close dropdown and shift bar back down after model selection
    setExpandedProviders({})
  }

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
    setConversationInput('')
    setConversationContext([])
    setShowCouncilPanel(false)
    setSingleModelConvoInput('')
    setSingleModelConvoHistory([])
    setCouncilColumnConvoInputs({})
    setCouncilColumnConvoHistory({})
    setCouncilColumnConvoSending({})
    setResultViewMode('summary')
    // Reset textarea height back to normal after submitting
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto'
    }
    // Reset per-turn sources when starting a new prompt
    setSummaryConvoSources({})
    setShowSummaryConvoSources({})
    setShowCouncilColumnSources({})
    setSingleConvoSources({})
    setShowSingleConvoSources({})
    
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

  // ---- Inline Conversation Handlers ---- //
  
  // Scroll to top when initial response/summary loads, scroll to bottom only for follow-up messages
  const prevConvoLengthRef = useRef(0)
  const prevSingleConvoLengthRef = useRef(0)
  const lastScrolledPromptRef = useRef(null) // Track which prompt we already scrolled for

  // Fetch conversation context when summary appears
  useEffect(() => {
    if (summary && currentUser?.id) {
      fetchConversationContext()
    }
  }, [summary?.text, currentUser?.id])

  const fetchConversationContext = async () => {
    if (!currentUser?.id) return
    try {
      const response = await axios.get(`${API_URL}/api/judge/context`, {
        params: { userId: currentUser.id }
      })
      setConversationContext(response.data.context || [])
    } catch (error) {
      console.error('[MainView] Error fetching conversation context:', error)
      setConversationContext([])
    }
  }

  const handleSendConversation = async () => {
    if (!conversationInput.trim() || !currentUser?.id || isSendingConvo) return
    
    setIsSendingConvo(true)
    setIsSearchingInConvo(false)
    const userMsg = conversationInput.trim()
    setConversationInput('')
    
    const initialSummary = summary.initialSummary || summary.text
    
    // Add user message with empty assistant placeholder immediately
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
        userId: currentUser.id,
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
      
      // Handle final metadata
      if (finalData) {
        // Capture conversation sources keyed by turn index
        // NOTE: summary.conversationHistory in closure still has the OLD length (before the new turn was added)
        // so the new turn's index = oldLength (not oldLength - 1)
        if (finalData.searchResults && finalData.searchResults.length > 0) {
          const turnIndex = (summary.conversationHistory || []).length
          setSummaryConvoSources(prev => ({ ...prev, [turnIndex]: finalData.searchResults }))
        }
        
        // Increment query count if a web search was performed during this follow-up
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
              const contextResponse = await axios.get(`${API_URL}/api/judge/context`, {
                params: { userId: currentUser.id }
              })
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

      // Update main token counter with conversation tokens so stats page totalTokens/monthlyTokens stay consistent
      if (currentUser?.id && finalData?.tokens?.total > 0) {
        axios.post(`${API_URL}/api/stats/token-update`, {
          userId: currentUser.id,
          promptTokens: finalData.tokens.total,
        }).then(() => {
          useStore.getState().triggerStatsRefresh()
        }).catch(err => console.error('[Token Update] Judge conversation token update failed:', err.message))
      }

      // Merge follow-up token data into the existing judge entry so there's one combined row
      if (finalData?.tokens) {
        useStore.getState().mergeTokenData('Judge Model', {
          input: finalData.tokens.input || 0,
          output: finalData.tokens.output || 0,
          total: finalData.tokens.total || 0,
        }, true)
      }

      // Push this conversation turn to the active history entry
      const activeHistoryId = useStore.getState().currentHistoryId
      if (activeHistoryId && currentUser?.id) {
        const latestSummary = useStore.getState().summary
        const latestTurn = latestSummary?.conversationHistory?.slice(-1)[0]
        if (latestTurn && latestTurn.assistant) {
          axios.post(`${API_URL}/api/history/update-conversation`, {
            historyId: activeHistoryId,
            turn: {
              type: 'judge',
              modelName: 'Judge (Summary)',
              user: userMsg,
              assistant: latestTurn.assistant,
              sources: finalData?.searchResults || [],
            }
          }).catch(err => console.error('[History] Error updating judge conversation turn:', err.message))
        }
      }
    } catch (error) {
      // If aborted, just remove the pending message silently
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

  // Single-model conversation handler — context is managed server-side (rolling window of 5 summaries)
  // Now uses SSE streaming for real-time token display
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
    
    // Add user message with empty assistant placeholder immediately
    setSingleModelConvoHistory(prev => [
      ...prev,
      { user: userMsg, assistant: '', timestamp: Date.now() }
    ])
    
    try {
      const finalData = await streamFetch(`${API_URL}/api/model/conversation/stream`, {
        userId: currentUser.id,
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
      
      // Capture search results keyed by turn index
      // NOTE: singleModelConvoHistory in closure still has the OLD length (before the new turn was added)
      // so the new turn's index = oldLength (not oldLength - 1)
      if (finalData?.searchResults && finalData.searchResults.length > 0) {
        const turnIndex = singleModelConvoHistory.length
        setSingleConvoSources(prev => ({ ...prev, [turnIndex]: finalData.searchResults }))
      }

      // Increment query count if a web search was performed during this follow-up
      if (finalData?.usedSearch) {
        useStore.getState().incrementQueryCount()
      }

      // Update main token counter with conversation tokens so stats page totalTokens/monthlyTokens stay consistent
      if (currentUser?.id && finalData?.tokens?.total > 0) {
        axios.post(`${API_URL}/api/stats/token-update`, {
          userId: currentUser.id,
          promptTokens: finalData.tokens.total,
        }).then(() => {
          useStore.getState().triggerStatsRefresh()
        }).catch(err => console.error('[Token Update] Single model conversation token update failed:', err.message))
      }

      // Merge follow-up token data into the existing model entry so there's one combined row
      if (finalData?.tokens) {
        useStore.getState().mergeTokenData(modelName, {
          input: finalData.tokens.input || 0,
          output: finalData.tokens.output || 0,
          total: finalData.tokens.total || 0,
        }, false)
      }

      // Push this conversation turn to the active history entry
      const activeHistoryId = useStore.getState().currentHistoryId
      if (activeHistoryId && currentUser?.id) {
        axios.post(`${API_URL}/api/history/update-conversation`, {
          historyId: activeHistoryId,
          turn: {
            type: 'model',
            modelName: modelName,
            user: userMsg,
            assistant: finalData?.response || '',
            sources: finalData?.searchResults || [],
          }
        }).catch(err => console.error('[History] Error updating single model conversation turn:', err.message))
      }
    } catch (error) {
      // If aborted, just remove the pending message silently
      if (error.name === 'AbortError') {
        setSingleModelConvoHistory(prev => prev.slice(0, -1))
      } else {
        console.error('[SingleModelConvo] Error sending message:', error)
        // Remove the placeholder on error
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
        userId: currentUser.id,
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
        axios.post(`${API_URL}/api/stats/token-update`, {
          userId: currentUser.id,
          promptTokens: finalData.tokens.total,
        }).then(() => {
          useStore.getState().triggerStatsRefresh()
        }).catch(err => console.error('[Token Update] Council column conversation token update failed:', err.message))
      }

      const activeHistoryId = useStore.getState().currentHistoryId
      if (activeHistoryId && currentUser?.id) {
        const latestTurns = councilColumnConvoHistory[responseId] || []
        const latestTurn = latestTurns.length > 0 ? latestTurns[latestTurns.length - 1] : null
        const assistantText = finalData?.response || latestTurn?.assistant || ''
        if (assistantText) {
          axios.post(`${API_URL}/api/history/update-conversation`, {
            historyId: activeHistoryId,
            turn: {
              type: 'model',
              modelName: modelName,
              user: userMsg,
              assistant: assistantText,
              sources: finalData?.searchResults || [],
            }
          }).catch(err => console.error('[History] Error updating council column conversation turn:', err.message))
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
    }
  }, [responses.length])

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
  const showSingleModelConvoInput = !summary && responses.length === 1 && !responses[0].error && lastSubmittedPrompt
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
  const maximizedCouncilResponse = maximizedCouncilResponseId
    ? councilDisplayResponses.find(r => r.id === maximizedCouncilResponseId) || null
    : null

  useEffect(() => {
    if (!canToggleResultViews && resultViewMode !== 'summary') {
      setResultViewMode('summary')
    }
  }, [canToggleResultViews, resultViewMode])

  // In side-by-side council view, lock page-level scrolling and allow
  // scrolling only inside each response column.
  useEffect(() => {
    if (!showCouncilColumns) return

    const previousBodyOverflow = document.body.style.overflow
    const previousBodyOverscroll = document.body.style.overscrollBehavior
    const previousHtmlOverflow = document.documentElement.style.overflow
    const previousHtmlOverscroll = document.documentElement.style.overscrollBehavior

    document.body.style.overflow = 'hidden'
    document.body.style.overscrollBehavior = 'none'
    document.documentElement.style.overflow = 'hidden'
    document.documentElement.style.overscrollBehavior = 'none'

    return () => {
      document.body.style.overflow = previousBodyOverflow
      document.body.style.overscrollBehavior = previousBodyOverscroll
      document.documentElement.style.overflow = previousHtmlOverflow
      document.documentElement.style.overscrollBehavior = previousHtmlOverscroll
    }
  }, [showCouncilColumns])

  // Scroll to show the response when it first appears (after a new prompt)
  useEffect(() => {
    if (!hasActiveConversation || !inlineResponseText || !chatAreaRef.current) return
    // Only scroll once per prompt
    if (lastScrolledPromptRef.current === lastSubmittedPrompt) return
    lastScrolledPromptRef.current = lastSubmittedPrompt
    // Wait for the response div to render, then scroll to it
    requestAnimationFrame(() => {
      setTimeout(() => {
        if (responseAreaRef.current && chatAreaRef.current) {
          const containerRect = chatAreaRef.current.getBoundingClientRect()
          const responseRect = responseAreaRef.current.getBoundingClientRect()
          const responseTopInContainer = responseRect.top - containerRect.top + chatAreaRef.current.scrollTop
          // Scroll so the response starts ~120px from the top, showing a bit of prompt context
          const scrollTarget = Math.max(0, responseTopInContainer - 120)
          chatAreaRef.current.scrollTo({ top: scrollTarget, behavior: 'smooth' })
        }
      }, 100)
    })
  }, [hasActiveConversation, inlineResponseText, lastSubmittedPrompt])

  // Scroll to bottom when a follow-up conversation message is added
  useEffect(() => {
    const convoLength = summary?.conversationHistory?.length || 0
    const singleConvoLength = singleModelConvoHistory.length
    
    if ((convoLength > prevConvoLengthRef.current && convoLength > 0) ||
        (singleConvoLength > prevSingleConvoLengthRef.current && singleConvoLength > 0)) {
      setTimeout(() => {
        if (chatAreaRef.current) {
          chatAreaRef.current.scrollTo({ top: chatAreaRef.current.scrollHeight, behavior: 'smooth' })
        }
      }, 150)
    }
    
    prevConvoLengthRef.current = convoLength
    prevSingleConvoLengthRef.current = singleConvoLength
  }, [summary?.conversationHistory?.length, singleModelConvoHistory.length])

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
          .model-dropdown::-webkit-scrollbar {
            width: 8px;
          }
          .model-dropdown::-webkit-scrollbar-track {
            background: rgba(0, 0, 0, 0.1);
            border-radius: 4px;
          }
          .model-dropdown::-webkit-scrollbar-thumb {
            background: rgba(93, 173, 226, 0.5);
            border-radius: 4px;
          }
          .model-dropdown::-webkit-scrollbar-thumb:hover {
            background: rgba(93, 173, 226, 0.7);
          }
          .provider-tabs-container::-webkit-scrollbar {
            height: 8px;
          }
          .provider-tabs-container::-webkit-scrollbar-track {
            background: rgba(0, 0, 0, 0.1);
            border-radius: 4px;
          }
          .provider-tabs-container::-webkit-scrollbar-thumb {
            background: rgba(93, 173, 226, 0.5);
            border-radius: 4px;
          }
          .provider-tabs-container::-webkit-scrollbar-thumb:hover {
            background: rgba(93, 173, 226, 0.7);
          }
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
        {canGenerateSummary && (
          <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            style={{
              position: 'absolute',
              top: '16px',
              left: 0,
              right: 0,
              zIndex: 30,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexDirection: 'column',
              gap: '6px',
              pointerEvents: 'none',
            }}
          >
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                padding: '8px 12px',
                borderRadius: '16px',
                border: theme === 'light' ? '1px solid rgba(0, 0, 0, 0.1)' : '1px solid rgba(255, 255, 255, 0.12)',
                background: theme === 'light' ? '#ffffff' : '#111827',
                boxShadow: theme === 'light'
                  ? '0 4px 20px rgba(0, 0, 0, 0.12), 0 1px 4px rgba(0, 0, 0, 0.06)'
                  : '0 4px 24px rgba(0, 0, 0, 0.6), 0 1px 3px rgba(0, 0, 0, 0.4)',
                pointerEvents: 'auto',
              }}
            >
              <motion.button
                onClick={() => setShowSingleTokenUsage(true)}
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '5px',
                  padding: '8px 12px',
                  borderRadius: '10px',
                  border: 'none',
                  background: theme === 'light' ? '#f3f4f6' : '#1f2937',
                  color: currentTheme.accent,
                  fontSize: '0.76rem',
                  fontWeight: '600',
                  cursor: 'pointer',
                }}
                title="Open prompt token usage"
              >
                <Coins size={13} />
                Token Usage
              </motion.button>

              <div style={{
                width: '1px',
                height: '24px',
                background: theme === 'light' ? 'rgba(0, 0, 0, 0.1)' : 'rgba(255, 255, 255, 0.1)',
                margin: '0 2px',
              }} />

              <motion.button
                onClick={() => triggerGenerateSummary()}
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  padding: '8px 16px',
                  borderRadius: '10px',
                  border: 'none',
                  background: currentTheme.accentGradient,
                  color: '#ffffff',
                  fontSize: '0.76rem',
                  fontWeight: '700',
                  cursor: 'pointer',
                  letterSpacing: '0.3px',
                }}
                title="Generate summary from the current council responses (Enter)"
              >
                <Sparkles size={14} />
                Generate Summary
              </motion.button>

              <div style={{
                width: '1px',
                height: '24px',
                background: theme === 'light' ? 'rgba(0, 0, 0, 0.1)' : 'rgba(255, 255, 255, 0.1)',
                margin: '0 2px',
              }} />

              <motion.button
                onClick={() => setShowTopCostBreakdown(true)}
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '5px',
                  padding: '8px 12px',
                  borderRadius: '10px',
                  border: 'none',
                  background: theme === 'light' ? '#f3f4f6' : '#1f2937',
                  color: currentTheme.accent,
                  fontSize: '0.76rem',
                  fontWeight: '600',
                  cursor: 'pointer',
                }}
                title="Open prompt cost breakdown"
              >
                <DollarSign size={13} />
                Cost Breakdown
              </motion.button>
            </div>
            <span
              style={{
                fontSize: '0.68rem',
                color: theme === 'light' ? currentTheme.textMuted : 'rgba(255, 255, 255, 0.4)',
                textAlign: 'center',
                pointerEvents: 'auto',
              }}
            >
              PRESS ENTER TO GENERATE
            </span>
          </motion.div>
        )}
        {(canToggleResultViews || canShowCouncilSideBySideButton) && (
          <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            style={{
              position: 'absolute',
              top: '16px',
              left: 0,
              right: 0,
              zIndex: 30,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              pointerEvents: 'none',
            }}
          >
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                padding: '8px 12px',
                borderRadius: '16px',
                border: theme === 'light' ? '1px solid rgba(0, 0, 0, 0.1)' : '1px solid rgba(255, 255, 255, 0.12)',
                background: theme === 'light' ? '#ffffff' : '#111827',
                boxShadow: theme === 'light'
                  ? '0 4px 20px rgba(0, 0, 0, 0.12), 0 1px 4px rgba(0, 0, 0, 0.06)'
                  : '0 4px 24px rgba(0, 0, 0, 0.6), 0 1px 3px rgba(0, 0, 0, 0.4)',
                pointerEvents: 'auto',
              }}
            >
              <motion.button
                onClick={() => setShowSingleTokenUsage(true)}
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '5px',
                  padding: '8px 12px',
                  borderRadius: '10px',
                  border: 'none',
                  background: theme === 'light' ? '#f3f4f6' : '#1f2937',
                  color: currentTheme.accent,
                  fontSize: '0.76rem',
                  fontWeight: '600',
                  cursor: 'pointer',
                }}
                title="Open prompt token usage"
              >
                <Coins size={13} />
                Token Usage
              </motion.button>
              <motion.button
                onClick={() => setShowTopCostBreakdown(true)}
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '5px',
                  padding: '8px 12px',
                  borderRadius: '10px',
                  border: 'none',
                  background: theme === 'light' ? '#f3f4f6' : '#1f2937',
                  color: currentTheme.accent,
                  fontSize: '0.76rem',
                  fontWeight: '600',
                  cursor: 'pointer',
                }}
                title="Open prompt cost breakdown"
              >
                <DollarSign size={13} />
                Cost Breakdown
              </motion.button>

              <div style={{
                width: '1px',
                height: '24px',
                background: theme === 'light' ? 'rgba(0, 0, 0, 0.1)' : 'rgba(255, 255, 255, 0.1)',
                margin: '0 2px',
              }} />

              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '3px',
                  padding: '3px',
                  borderRadius: '10px',
                  background: theme === 'light' ? '#f3f4f6' : '#1f2937',
                }}
              >
                <motion.button
                  onClick={() => setResultViewMode('summary')}
                  whileHover={{ scale: 1.03 }}
                  whileTap={{ scale: 0.95 }}
                  style={{
                    padding: '6px 14px',
                    borderRadius: '8px',
                    border: 'none',
                    background: resultViewMode === 'summary'
                      ? currentTheme.accentGradient
                      : 'transparent',
                    color: resultViewMode === 'summary' ? '#ffffff' : currentTheme.textSecondary,
                    fontSize: '0.76rem',
                    fontWeight: '600',
                    cursor: 'pointer',
                    transition: 'all 0.2s ease',
                  }}
                  title="Show summary response"
                >
                  Summary View
                </motion.button>
                <motion.button
                  onClick={() => setResultViewMode('council')}
                  whileHover={{ scale: 1.03 }}
                  whileTap={{ scale: 0.95 }}
                  style={{
                    padding: '6px 14px',
                    borderRadius: '8px',
                    border: 'none',
                    background: resultViewMode === 'council'
                      ? currentTheme.accentGradient
                      : 'transparent',
                    color: resultViewMode === 'council' ? '#ffffff' : currentTheme.textSecondary,
                    fontSize: '0.76rem',
                    fontWeight: '600',
                    cursor: 'pointer',
                    transition: 'all 0.2s ease',
                  }}
                  title="Show side-by-side model responses"
                >
                  Council Side by Side View
                </motion.button>
              </div>

              <div style={{
                width: '1px',
                height: '24px',
                background: theme === 'light' ? 'rgba(0, 0, 0, 0.1)' : 'rgba(255, 255, 255, 0.1)',
                margin: '0 2px',
              }} />

              <motion.button
                onClick={() => {
                  if (!currentUser?.id) {
                    alert('Please sign in to submit prompts to the Prompt Feed')
                    return
                  }
                  setShowPostWindow(true)
                }}
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '5px',
                  padding: '8px 12px',
                  borderRadius: '10px',
                  border: 'none',
                  background: theme === 'light' ? 'rgba(255, 140, 0, 0.9)' : 'rgba(255, 170, 0, 0.15)',
                  color: theme === 'light' ? '#fff' : '#ffaa00',
                  fontSize: '0.76rem',
                  fontWeight: '600',
                  cursor: 'pointer',
                }}
                title="Submit your prompt and the council's response to the Prompt Feed"
              >
                <Trophy size={13} />
                Post Prompt
              </motion.button>
            </div>
          </motion.div>
        )}

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

              {/* Phase 2: Council Columns - multi-model streaming responses */}
              {showCouncilColumns && (
                <>
                  {isLoading && !isGeneratingSummary && (
                    <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '16px' }}>
                      <motion.button
                        onClick={() => { if (onCancelPrompt) onCancelPrompt() }}
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        whileHover={{ scale: 1.03 }}
                        whileTap={{ scale: 0.97 }}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          padding: '8px 14px',
                          background: theme === 'light' ? 'rgba(239, 68, 68, 0.12)' : 'rgba(239, 68, 68, 0.12)',
                          border: '1px solid #ef4444',
                          borderRadius: '10px',
                          color: theme === 'light' ? '#dc2626' : '#fff',
                          fontSize: '0.82rem',
                          fontWeight: '600',
                          cursor: 'pointer',
                        }}
                        title="Cancel"
                      >
                        Cancel
                      </motion.button>
                    </div>
                  )}
                  {/* Loading Summary indicator at top center */}
                  {(isGeneratingSummary || summaryInitializing) && (
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '12px', marginBottom: '30px' }}>
                      {isGeneratingSummary && (
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
                      )}
                      <motion.div
                        initial={{ opacity: 0, y: -10 }}
                        animate={{ opacity: 1, y: 0 }}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: '12px',
                          padding: '10px 24px',
                          background: currentTheme.buttonBackground,
                          borderRadius: '12px',
                          border: `1px solid ${currentTheme.borderLight}`,
                        }}
                      >
                        <motion.div
                          animate={{ rotate: 360 }}
                          transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
                          style={{
                            width: '18px',
                            height: '18px',
                            border: `2px solid ${currentTheme.borderLight}`,
                            borderTop: `2px solid ${currentTheme.accent}`,
                            borderRadius: '50%',
                            flexShrink: 0,
                          }}
                        />
                        <span style={{
                          fontSize: '0.9rem',
                          fontWeight: '500',
                          background: currentTheme.accentGradient,
                          WebkitBackgroundClip: 'text',
                          WebkitTextFillColor: 'transparent',
                        }}>
                          Loading Summary...
                        </span>
                      </motion.div>
                    </div>
                  )}

                  {/* Council Response Columns */}
                  <div style={{
                    display: 'flex',
                    justifyContent: 'center',
                    alignItems: 'stretch',
                    width: '100%',
                    maxWidth: councilColumnCount <= 2 ? '800px' : councilColumnCount === 3 ? '1000px' : '1200px',
                    flex: 1,
                    minHeight: 0,
                    height: '100%',
                    gap: '0',
                    overflow: 'hidden',
                  }}>
                    {councilDisplayResponses.map((response, index, arr) => (
                      <React.Fragment key={response.id}>
                        {index > 0 && (
                          <div style={{
                            width: '1px',
                            background: 'rgba(255, 255, 255, 0.15)',
                            flexShrink: 0,
                            alignSelf: 'stretch',
                          }} />
                        )}
                        <div className="council-column-scroll" style={{
                          flex: 1,
                          padding: '0 16px 24px',
                          overflowY: 'auto',
                          overflowX: 'hidden',
                          overscrollBehaviorY: 'contain',
                          minWidth: 0,
                          height: '100%',
                          maxWidth: arr.length === 1 ? '800px' : 'none',
                        }}>
                          <motion.div
                            initial={{ opacity: 0, y: 10 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ delay: index * 0.1 }}
                          >
                            {lastSubmittedPrompt && (
                              <div style={{
                                marginBottom: '12px',
                                padding: '10px 12px',
                                background: currentTheme.buttonBackground,
                                border: `1px solid ${currentTheme.borderLight}`,
                                borderRadius: '10px',
                              }}>
                                <div style={{
                                  fontSize: '0.68rem',
                                  fontWeight: '700',
                                  color: currentTheme.textMuted,
                                  textTransform: 'uppercase',
                                  letterSpacing: '0.6px',
                                  marginBottom: '4px',
                                }}>
                                  Prompt
                                </div>
                                <p style={{
                                  margin: 0,
                                  color: currentTheme.text,
                                  fontSize: '0.82rem',
                                  lineHeight: '1.45',
                                  whiteSpace: 'pre-wrap',
                                  overflowWrap: 'anywhere',
                                  wordBreak: 'break-word',
                                }}>
                                  {lastSubmittedPrompt}
                                </p>
                              </div>
                            )}
                            <div style={{
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'space-between',
                              gap: '8px',
                              marginBottom: '12px',
                              paddingBottom: '8px',
                              borderBottom: `1px solid ${currentTheme.borderLight}`,
                              minHeight: '32px',
                            }}>
                              <div style={{
                                fontSize: '0.75rem',
                                fontWeight: '700',
                                color: currentTheme.accent,
                                textTransform: 'uppercase',
                                letterSpacing: '0.8px',
                                whiteSpace: 'nowrap',
                                overflow: 'hidden',
                                textOverflow: 'ellipsis',
                              }}>
                                {getProviderDisplayName(response.modelName)}
                              </div>
                              <button
                                onClick={() => setMaximizedCouncilResponseId(response.id)}
                                title="Expand response"
                                style={{
                                  display: 'flex',
                                  alignItems: 'center',
                                  justifyContent: 'center',
                                  width: '24px',
                                  height: '24px',
                                  borderRadius: '6px',
                                  border: `1px solid ${currentTheme.borderLight}`,
                                  background: currentTheme.buttonBackground,
                                  color: currentTheme.textSecondary,
                                  cursor: 'pointer',
                                  flexShrink: 0,
                                  transition: 'all 0.2s ease',
                                }}
                              >
                                <Maximize2 size={13} />
                              </button>
                            </div>
                            <div style={{
                              fontSize: arr.length > 3 ? '0.8rem' : '0.85rem',
                              color: currentTheme.textSecondary,
                              lineHeight: '1.7',
                            }}>
                              {response.text ? (
                                <MarkdownRenderer content={response.text} theme={currentTheme} fontSize={arr.length > 3 ? '0.8rem' : '0.85rem'} lineHeight="1.7" />
                              ) : (
                                <motion.div
                                  style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '8px 0' }}
                                >
                                  <motion.div
                                    animate={{ rotate: 360 }}
                                    transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
                                    style={{
                                      width: '14px',
                                      height: '14px',
                                      border: `2px solid ${currentTheme.borderLight}`,
                                      borderTop: `2px solid ${currentTheme.accent}`,
                                      borderRadius: '50%',
                                    }}
                                  />
                                  <span style={{ fontSize: '0.8rem', color: currentTheme.textMuted, fontStyle: 'italic' }}>
                                    Waiting for response...
                                  </span>
                                </motion.div>
                              )}
                            </div>
                            {(showCouncilReviewPhase || (canToggleResultViews && resultViewMode === 'council') || (!response.isStreaming && response.text)) && (
                              <div style={{ marginTop: '14px', borderTop: `1px solid ${currentTheme.borderLight}`, paddingTop: '12px' }}>
                                {/* Initial prompt sources — anchored to the initial response */}
                                {(() => {
                                  const initialSources = Array.isArray(response.sources) ? response.sources : []
                                  if (initialSources.length === 0) return null
                                  return (
                                    <div style={{ marginBottom: '10px' }}>
                                      <button
                                        onClick={() => setShowCouncilColumnSources(prev => ({ ...prev, [response.id]: !prev[response.id] }))}
                                        style={{
                                          display: 'flex',
                                          alignItems: 'center',
                                          gap: '6px',
                                          padding: '5px 10px',
                                          background: showCouncilColumnSources[response.id] ? `${currentTheme.accent}15` : currentTheme.buttonBackground,
                                          border: `1px solid ${showCouncilColumnSources[response.id] ? currentTheme.accent : currentTheme.borderLight}`,
                                          borderRadius: '8px',
                                          color: currentTheme.accent,
                                          fontSize: '0.75rem',
                                          fontWeight: '500',
                                          cursor: 'pointer',
                                          transition: 'all 0.2s ease',
                                        }}
                                      >
                                        <Globe size={12} />
                                        Sources ({initialSources.length})
                                        <ChevronDown size={12} style={{ transform: showCouncilColumnSources[response.id] ? 'rotate(180deg)' : 'rotate(0deg)', transition: 'transform 0.2s' }} />
                                      </button>
                                      {showCouncilColumnSources[response.id] && (
                                        <motion.div
                                          initial={{ opacity: 0, height: 0 }}
                                          animate={{ opacity: 1, height: 'auto' }}
                                          exit={{ opacity: 0, height: 0 }}
                                          style={{ marginTop: '6px', marginBottom: '8px', display: 'flex', flexDirection: 'column', gap: '4px', maxHeight: '180px', overflowY: 'auto' }}
                                        >
                                          {initialSources.map((source, sIdx) => (
                                            <a
                                              key={sIdx}
                                              href={source.link}
                                              target="_blank"
                                              rel="noopener noreferrer"
                                              style={{
                                                display: 'block',
                                                padding: '6px 10px',
                                                background: currentTheme.buttonBackground,
                                                border: `1px solid ${currentTheme.borderLight}`,
                                                borderRadius: '6px',
                                                textDecoration: 'none',
                                                transition: 'border-color 0.2s',
                                              }}
                                              onMouseEnter={(e) => { e.currentTarget.style.borderColor = currentTheme.accent }}
                                              onMouseLeave={(e) => { e.currentTarget.style.borderColor = currentTheme.borderLight }}
                                            >
                                              <div style={{ fontSize: '0.75rem', fontWeight: '600', color: currentTheme.accent, marginBottom: '2px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                                {source.title}
                                              </div>
                                              <div style={{ fontSize: '0.65rem', color: currentTheme.textMuted, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                                {source.link}
                                              </div>
                                              {source.snippet && (
                                                <div style={{ fontSize: '0.7rem', color: currentTheme.textSecondary, marginTop: '3px', lineHeight: '1.4', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
                                                  {source.snippet}
                                                </div>
                                              )}
                                            </a>
                                          ))}
                                        </motion.div>
                                      )}
                                    </div>
                                  )
                                })()}
                                {(councilColumnConvoHistory[response.id] || []).map((turn, turnIdx) => {
                                  const turnSourceKey = `${response.id}-${turnIdx}`
                                  const turnSources = councilColumnConvoSources[turnSourceKey] || []
                                  const isLastTurn = turnIdx === (councilColumnConvoHistory[response.id] || []).length - 1
                                  return (
                                  <div key={`${response.id}-turn-${turnIdx}`} style={{ marginBottom: '10px' }}>
                                    <div style={{ fontSize: '0.7rem', color: currentTheme.textMuted, marginBottom: '4px', textTransform: 'uppercase', letterSpacing: '0.4px' }}>You</div>
                                    <div style={{
                                      marginBottom: '8px',
                                      padding: '8px 10px',
                                      borderRadius: '10px',
                                      border: theme === 'light' ? '1px solid rgba(0, 0, 0, 0.15)' : '1px solid rgba(255, 255, 255, 0.35)',
                                      background: theme === 'light' ? 'rgba(255, 255, 255, 0.95)' : 'rgba(255, 255, 255, 0.08)',
                                    }}>
                                      <div style={{ fontSize: '0.8rem', color: theme === 'light' ? '#111111' : currentTheme.text, whiteSpace: 'pre-wrap', overflowWrap: 'anywhere', wordBreak: 'break-word' }}>
                                        {turn.user}
                                      </div>
                                    </div>
                                    {isLastTurn && councilColumnConvoSearching[response.id] && (
                                      <motion.div
                                        initial={{ opacity: 0, y: 3 }}
                                        animate={{ opacity: 1, y: 0 }}
                                        style={{
                                          display: 'flex',
                                          alignItems: 'center',
                                          gap: '6px',
                                          marginBottom: '8px',
                                          padding: '5px 10px',
                                          background: currentTheme.buttonBackground,
                                          borderRadius: '16px',
                                          width: 'fit-content',
                                        }}
                                      >
                                        <Search size={12} color={currentTheme.accent} />
                                        <span style={{
                                          fontSize: '0.75rem',
                                          background: currentTheme.accentGradient,
                                          WebkitBackgroundClip: 'text',
                                          WebkitTextFillColor: 'transparent',
                                        }}>
                                          Searching the web
                                        </span>
                                        <motion.span
                                          animate={{ opacity: [1, 0.3, 1] }}
                                          transition={{ duration: 1.5, repeat: Infinity, ease: 'easeInOut' }}
                                          style={{
                                            background: currentTheme.accentGradient,
                                            WebkitBackgroundClip: 'text',
                                            WebkitTextFillColor: 'transparent',
                                          }}
                                        >
                                          ...
                                        </motion.span>
                                      </motion.div>
                                    )}
                                    <div style={{ fontSize: '0.7rem', color: currentTheme.accent, marginBottom: '4px', textTransform: 'uppercase', letterSpacing: '0.4px' }}>
                                      {getProviderDisplayName(response.modelName)}
                                    </div>
                                    {turn.assistant ? (
                                      <div style={{ fontSize: '0.8rem', color: currentTheme.textSecondary, overflowWrap: 'anywhere', wordBreak: 'break-word' }}>
                                        <MarkdownRenderer
                                          content={turn.assistant}
                                          theme={currentTheme}
                                          fontSize="0.8rem"
                                          lineHeight="1.6"
                                        />
                                      </div>
                                    ) : (
                                      <div style={{ fontSize: '0.8rem', color: currentTheme.textSecondary, whiteSpace: 'pre-wrap', overflowWrap: 'anywhere', wordBreak: 'break-word' }}>
                                        {councilColumnConvoSending[response.id] ? 'Thinking...' : ''}
                                      </div>
                                    )}
                                    {turnSources.length > 0 && (
                                      <div style={{ marginTop: '8px' }}>
                                        <button
                                          onClick={() => setShowCouncilColumnConvoSources(prev => ({ ...prev, [turnSourceKey]: !prev[turnSourceKey] }))}
                                          style={{
                                            display: 'flex',
                                            alignItems: 'center',
                                            gap: '6px',
                                            padding: '4px 8px',
                                            background: showCouncilColumnConvoSources[turnSourceKey] ? `${currentTheme.accent}15` : currentTheme.buttonBackground,
                                            border: `1px solid ${showCouncilColumnConvoSources[turnSourceKey] ? currentTheme.accent : currentTheme.borderLight}`,
                                            borderRadius: '8px',
                                            color: currentTheme.accent,
                                            fontSize: '0.7rem',
                                            fontWeight: '500',
                                            cursor: 'pointer',
                                            transition: 'all 0.2s ease',
                                          }}
                                        >
                                          <Globe size={11} />
                                          Sources ({turnSources.length})
                                          <ChevronDown size={11} style={{ transform: showCouncilColumnConvoSources[turnSourceKey] ? 'rotate(180deg)' : 'rotate(0deg)', transition: 'transform 0.2s' }} />
                                        </button>
                                        {showCouncilColumnConvoSources[turnSourceKey] && (
                                          <motion.div
                                            initial={{ opacity: 0, height: 0 }}
                                            animate={{ opacity: 1, height: 'auto' }}
                                            exit={{ opacity: 0, height: 0 }}
                                            style={{ marginTop: '5px', marginBottom: '6px', display: 'flex', flexDirection: 'column', gap: '3px', maxHeight: '160px', overflowY: 'auto' }}
                                          >
                                            {turnSources.map((source, sIdx) => (
                                              <a
                                                key={sIdx}
                                                href={source.link}
                                                target="_blank"
                                                rel="noopener noreferrer"
                                                style={{
                                                  display: 'block',
                                                  padding: '5px 8px',
                                                  background: currentTheme.buttonBackground,
                                                  border: `1px solid ${currentTheme.borderLight}`,
                                                  borderRadius: '6px',
                                                  textDecoration: 'none',
                                                  transition: 'border-color 0.2s',
                                                }}
                                                onMouseEnter={(e) => { e.currentTarget.style.borderColor = currentTheme.accent }}
                                                onMouseLeave={(e) => { e.currentTarget.style.borderColor = currentTheme.borderLight }}
                                              >
                                                <div style={{ fontSize: '0.7rem', fontWeight: '600', color: currentTheme.accent, marginBottom: '1px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                                  {source.title}
                                                </div>
                                                <div style={{ fontSize: '0.6rem', color: currentTheme.textMuted, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                                  {source.link}
                                                </div>
                                                {source.snippet && (
                                                  <div style={{ fontSize: '0.65rem', color: currentTheme.textSecondary, marginTop: '2px', lineHeight: '1.4', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
                                                    {source.snippet}
                                                  </div>
                                                )}
                                              </a>
                                            ))}
                                          </motion.div>
                                        )}
                                      </div>
                                    )}
                                  </div>
                                  )
                                })}
                                <textarea
                                  data-local-enter-handler="true"
                                  value={councilColumnConvoInputs[response.id] || ''}
                                  onChange={(e) => setCouncilColumnConvoInputs(prev => ({ ...prev, [response.id]: e.target.value }))}
                                  onFocus={() => setIsCouncilColumnInputFocused(true)}
                                  onBlur={() => setIsCouncilColumnInputFocused(false)}
                                  onKeyDown={(e) => {
                                    if (e.key === 'Enter' && !e.shiftKey) {
                                      e.preventDefault()
                                      e.stopPropagation()
                                      handleSendCouncilColumnConvo(response)
                                    }
                                  }}
                                  placeholder={`Continue conversation with ${getProviderDisplayName(response.modelName)}...`}
                                  disabled={!!councilColumnConvoSending[response.id]}
                                  style={{
                                    width: '100%',
                                    minHeight: '44px',
                                    maxHeight: '120px',
                                    padding: '10px 12px',
                                    background: currentTheme.buttonBackground,
                                    border: `1px solid ${currentTheme.borderLight}`,
                                    borderRadius: '10px',
                                    color: currentTheme.text,
                                    fontSize: '0.82rem',
                                    resize: 'vertical',
                                    fontFamily: 'inherit',
                                    outline: 'none',
                                    lineHeight: '1.4',
                                  }}
                                />
                              </div>
                            )}
                          </motion.div>
                        </div>
                      </React.Fragment>
                    ))}
                  </div>
                </>
              )}

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

                {/* Initial Sources — shown with the first prompt+response pair */}
                {showConversationInput && (() => {
                  if (!summaryInitialSources || summaryInitialSources.length === 0) return null
                  const toggleKey = 'summary_initial'
                  return (
                    <div style={{ marginTop: '8px', marginBottom: '4px' }}>
                      <button
                        onClick={() => setShowSummaryConvoSources(prev => ({ ...prev, [toggleKey]: !prev[toggleKey] }))}
                        style={{
                          display: 'flex', alignItems: 'center', gap: '6px', padding: '6px 12px',
                          background: showSummaryConvoSources[toggleKey] ? `${currentTheme.accent}15` : currentTheme.buttonBackground,
                          border: `1px solid ${showSummaryConvoSources[toggleKey] ? currentTheme.accent : currentTheme.borderLight}`,
                          borderRadius: '8px', color: currentTheme.accent, fontSize: '0.8rem', fontWeight: '500',
                          cursor: 'pointer', transition: 'all 0.2s ease',
                        }}
                      >
                        <Globe size={14} />
                        Sources ({summaryInitialSources.length})
                        <ChevronDown size={14} style={{ transform: showSummaryConvoSources[toggleKey] ? 'rotate(180deg)' : 'rotate(0deg)', transition: 'transform 0.2s' }} />
                      </button>
                      {showSummaryConvoSources[toggleKey] && (
                        <motion.div
                          initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }}
                          style={{ marginTop: '8px', display: 'flex', flexDirection: 'column', gap: '6px', maxHeight: '200px', overflowY: 'auto' }}
                        >
                          {summaryInitialSources.map((source, sIdx) => (
                            <a key={sIdx} href={source.link} target="_blank" rel="noopener noreferrer"
                              style={{ display: 'block', padding: '8px 12px', background: currentTheme.buttonBackground, border: `1px solid ${currentTheme.borderLight}`, borderRadius: '8px', textDecoration: 'none', transition: 'border-color 0.2s' }}
                              onMouseEnter={(e) => { e.currentTarget.style.borderColor = currentTheme.accent }}
                              onMouseLeave={(e) => { e.currentTarget.style.borderColor = currentTheme.borderLight }}
                            >
                              <div style={{ fontSize: '0.8rem', fontWeight: '600', color: currentTheme.accent, marginBottom: '2px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{source.title}</div>
                              <div style={{ fontSize: '0.7rem', color: currentTheme.textMuted, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{source.link}</div>
                              {source.snippet && (<div style={{ fontSize: '0.75rem', color: currentTheme.textSecondary, marginTop: '4px', lineHeight: '1.4', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{source.snippet}</div>)}
                            </a>
                          ))}
                        </motion.div>
                      )}
                    </div>
                  )
                })()}

                {/* Single-model Initial Sources — shown with the first prompt+response pair */}
                {showSingleModelConvoInput && (() => {
                  if (!singleModelInitialSources || singleModelInitialSources.length === 0) return null
                  const toggleKey = 'single_initial'
                  return (
                    <div style={{ marginTop: '8px', marginBottom: '4px' }}>
                      <button
                        onClick={() => setShowSingleConvoSources(prev => ({ ...prev, [toggleKey]: !prev[toggleKey] }))}
                        style={{
                          display: 'flex', alignItems: 'center', gap: '6px', padding: '6px 12px',
                          background: showSingleConvoSources[toggleKey] ? `${currentTheme.accent}15` : currentTheme.buttonBackground,
                          border: `1px solid ${showSingleConvoSources[toggleKey] ? currentTheme.accent : currentTheme.borderLight}`,
                          borderRadius: '8px', color: currentTheme.accent, fontSize: '0.8rem', fontWeight: '500',
                          cursor: 'pointer', transition: 'all 0.2s ease',
                        }}
                      >
                        <Globe size={14} />
                        Sources ({singleModelInitialSources.length})
                        <ChevronDown size={14} style={{ transform: showSingleConvoSources[toggleKey] ? 'rotate(180deg)' : 'rotate(0deg)', transition: 'transform 0.2s' }} />
                      </button>
                      {showSingleConvoSources[toggleKey] && (
                        <motion.div
                          initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }}
                          style={{ marginTop: '8px', display: 'flex', flexDirection: 'column', gap: '6px', maxHeight: '200px', overflowY: 'auto' }}
                        >
                          {singleModelInitialSources.map((source, sIdx) => (
                            <a key={sIdx} href={source.link} target="_blank" rel="noopener noreferrer"
                              style={{ display: 'block', padding: '8px 12px', background: currentTheme.buttonBackground, border: `1px solid ${currentTheme.borderLight}`, borderRadius: '8px', textDecoration: 'none', transition: 'border-color 0.2s' }}
                              onMouseEnter={(e) => { e.currentTarget.style.borderColor = currentTheme.accent }}
                              onMouseLeave={(e) => { e.currentTarget.style.borderColor = currentTheme.borderLight }}
                            >
                              <div style={{ fontSize: '0.8rem', fontWeight: '600', color: currentTheme.accent, marginBottom: '2px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{source.title}</div>
                              <div style={{ fontSize: '0.7rem', color: currentTheme.textMuted, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{source.link}</div>
                              {source.snippet && (<div style={{ fontSize: '0.75rem', color: currentTheme.textSecondary, marginTop: '4px', lineHeight: '1.4', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{source.snippet}</div>)}
                            </a>
                          ))}
                        </motion.div>
                      )}
                    </div>
                  )
                })()}

                {/* Conversation History */}
                {summary?.conversationHistory && summary.conversationHistory.length > 0 && (
                  summary.conversationHistory.map((exchange, idx) => (
                    <React.Fragment key={`convo-${idx}`}>
                      {/* User follow-up bubble */}
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
                            {exchange.user}
                          </p>
                        </div>
                      </div>

                      {/* Response / Sources tabs for follow-up turns */}
                      {(() => {
                        const turnSources = summaryConvoSources[idx] || []
                        const hasTurnSources = turnSources.length > 0
                        const toggleKey = `summary_${idx}`
                        const showSourcesTab = hasTurnSources && !!showSummaryConvoSources[toggleKey]

                        return (
                          <div style={{ padding: '4px 0 0 4px' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '10px' }}>
                              <button
                                onClick={() => setShowSummaryConvoSources(prev => ({ ...prev, [toggleKey]: false }))}
                                style={{
                                  display: 'flex',
                                  alignItems: 'center',
                                  gap: '6px',
                                  padding: '5px 10px',
                                  background: !showSourcesTab ? `${currentTheme.accent}15` : currentTheme.buttonBackground,
                                  border: `1px solid ${!showSourcesTab ? currentTheme.accent : currentTheme.borderLight}`,
                                  borderRadius: '8px',
                                  color: !showSourcesTab ? currentTheme.accent : currentTheme.textSecondary,
                                  fontSize: '0.75rem',
                                  fontWeight: '600',
                                  cursor: 'pointer',
                                  transition: 'all 0.2s ease',
                                }}
                              >
                                <FileText size={12} />
                                Response
                              </button>
                              {hasTurnSources && (
                                <button
                                  onClick={() => setShowSummaryConvoSources(prev => ({ ...prev, [toggleKey]: true }))}
                                  style={{
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '6px',
                                    padding: '5px 10px',
                                    background: showSourcesTab ? `${currentTheme.accent}15` : currentTheme.buttonBackground,
                                    border: `1px solid ${showSourcesTab ? currentTheme.accent : currentTheme.borderLight}`,
                                    borderRadius: '8px',
                                    color: showSourcesTab ? currentTheme.accent : currentTheme.textSecondary,
                                    fontSize: '0.75rem',
                                    fontWeight: '600',
                                    cursor: 'pointer',
                                    transition: 'all 0.2s ease',
                                  }}
                                >
                                  <Globe size={12} />
                                  Sources ({turnSources.length})
                                </button>
                              )}
                            </div>

                            {!showSourcesTab ? (
                              <MarkdownRenderer content={exchange.assistant || exchange.judge} theme={currentTheme} fontSize="1rem" lineHeight="1.85" />
                            ) : (
                              <motion.div
                                initial={{ opacity: 0, y: 2 }}
                                animate={{ opacity: 1, y: 0 }}
                                style={{ display: 'flex', flexDirection: 'column', gap: '4px', maxHeight: '180px', overflowY: 'auto' }}
                              >
                                {turnSources.map((source, sIdx) => (
                                  <a
                                    key={sIdx}
                                    href={source.link}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    style={{
                                      display: 'block',
                                      padding: '6px 10px',
                                      background: currentTheme.buttonBackground,
                                      border: `1px solid ${currentTheme.borderLight}`,
                                      borderRadius: '6px',
                                      textDecoration: 'none',
                                      transition: 'border-color 0.2s',
                                    }}
                                    onMouseEnter={(e) => { e.currentTarget.style.borderColor = currentTheme.accent }}
                                    onMouseLeave={(e) => { e.currentTarget.style.borderColor = currentTheme.borderLight }}
                                  >
                                    <div style={{ fontSize: '0.75rem', fontWeight: '600', color: currentTheme.accent, marginBottom: '2px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{source.title}</div>
                                    <div style={{ fontSize: '0.65rem', color: currentTheme.textMuted, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{source.link}</div>
                                    {source.snippet && (<div style={{ fontSize: '0.7rem', color: currentTheme.textSecondary, marginTop: '3px', lineHeight: '1.4', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{source.snippet}</div>)}
                                  </a>
                                ))}
                              </motion.div>
                            )}
                          </div>
                        )
                      })()}
                    </React.Fragment>
                  ))
                )}

                {/* Fetching Response Indicator */}
                {isSendingConvo && (
                  <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '10px',
                      padding: '12px 16px',
                      maxWidth: '85%',
                    }}
                  >
                    <motion.div
                      animate={{ rotate: 360 }}
                      transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
                      style={{
                        width: '16px',
                        height: '16px',
                        border: `2px solid ${currentTheme.borderLight}`,
                        borderTop: `2px solid ${currentTheme.accent}`,
                        borderRadius: '50%',
                        flexShrink: 0,
                      }}
                    />
                    <span style={{
                      fontSize: '0.85rem',
                      color: currentTheme.textMuted,
                      fontStyle: 'italic',
                    }}>
                      Loading summary model's response...
                    </span>
                  </motion.div>
                )}

                {/* Inline Conversation Continuation Input */}
                {showConversationInput && (
                  <div style={{ padding: '8px 0 0 0' }}>
                    {/* Web Search Indicator */}
                    {isSearchingInConvo && (
              <motion.div
                        initial={{ opacity: 0, y: 5 }}
                        animate={{ opacity: 1, y: 0 }}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                          marginBottom: '10px',
                          padding: '6px 12px',
                          background: currentTheme.buttonBackground,
                          borderRadius: '20px',
                          width: 'fit-content',
                }}
              >
                <Search size={14} color={currentTheme.accent} />
                        <span style={{ 
                          fontSize: '0.85rem', 
                          color: currentTheme.text,
                          background: currentTheme.accentGradient,
                          WebkitBackgroundClip: 'text',
                          WebkitTextFillColor: 'transparent',
                        }}>
                          Searching the web
                        </span>
                <motion.span
                  animate={{ opacity: [1, 0.3, 1] }}
                          transition={{ duration: 1.5, repeat: Infinity, ease: 'easeInOut' }}
                          style={{
                            background: currentTheme.accentGradient,
                            WebkitBackgroundClip: 'text',
                            WebkitTextFillColor: 'transparent',
                  }}
                >
                  ...
                </motion.span>
              </motion.div>
                    )}
                    <div style={{ display: 'flex', gap: '10px', alignItems: 'flex-end' }}>
                      <div style={{ flex: 1, position: 'relative' }}>
                        <textarea
                          ref={convoTextareaRef}
                          value={conversationInput}
                          onChange={(e) => {
                            setConversationInput(e.target.value)
                            adjustConvoTextarea()
                          }}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter' && !e.shiftKey) {
                              e.preventDefault()
                              handleSendConversation()
                            }
                          }}
                          placeholder="Continue conversation with Judge Model..."
                          disabled={isSendingConvo}
            style={{
              width: '100%',
                            minHeight: '48px',
                            maxHeight: '150px',
                            padding: '12px 48px 12px 18px',
              background: currentTheme.buttonBackground,
              border: `1px solid ${currentTheme.borderLight}`,
                            borderRadius: '24px',
              color: currentTheme.text,
                            fontSize: '0.95rem',
                            resize: 'none',
              fontFamily: 'inherit',
                            outline: 'none',
                            lineHeight: '1.5',
                            overflow: 'hidden',
                          }}
                        />
          <motion.button
                          onClick={handleSendConversation}
                          disabled={!conversationInput.trim() || isSendingConvo}
            style={{
              position: 'absolute',
                            right: '8px',
                            bottom: '8px',
                            background: 'transparent',
              border: 'none',
                            color: conversationInput.trim() && !isSendingConvo ? currentTheme.accent : currentTheme.textMuted,
                            cursor: conversationInput.trim() && !isSendingConvo ? 'pointer' : 'not-allowed',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              transition: 'all 0.2s ease',
                          }}
                          whileHover={conversationInput.trim() && !isSendingConvo ? { scale: 1.1 } : {}}
                          whileTap={conversationInput.trim() && !isSendingConvo ? { scale: 0.95 } : {}}
                        >
                          <Send size={16} />
          </motion.button>
                      </div>
                    </div>
                  </div>
                )}

                {/* Single-model conversation history */}
                {showSingleModelConvoInput && singleModelConvoHistory.length > 0 && (
                  singleModelConvoHistory.map((exchange, idx) => (
                    <React.Fragment key={`single-convo-${idx}`}>
                      {/* User follow-up bubble */}
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
                            {exchange.user}
                          </p>
                        </div>
                      </div>

                      {/* Response / Sources tabs for follow-up turns */}
                      {(() => {
                        const turnSources = singleConvoSources[idx] || []
                        const hasTurnSources = turnSources.length > 0
                        const toggleKey = `single_${idx}`
                        const showSourcesTab = hasTurnSources && !!showSingleConvoSources[toggleKey]

                        return (
                          <div style={{ padding: '4px 0 0 4px' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '10px' }}>
                              <button
                                onClick={() => setShowSingleConvoSources(prev => ({ ...prev, [toggleKey]: false }))}
                                style={{
                                  display: 'flex',
                                  alignItems: 'center',
                                  gap: '6px',
                                  padding: '5px 10px',
                                  background: !showSourcesTab ? `${currentTheme.accent}15` : currentTheme.buttonBackground,
                                  border: `1px solid ${!showSourcesTab ? currentTheme.accent : currentTheme.borderLight}`,
                                  borderRadius: '8px',
                                  color: !showSourcesTab ? currentTheme.accent : currentTheme.textSecondary,
                                  fontSize: '0.75rem',
                                  fontWeight: '600',
                                  cursor: 'pointer',
                                  transition: 'all 0.2s ease',
                                }}
                              >
                                <FileText size={12} />
                                {inlineResponseLabel || 'Response'}
                              </button>
                              {hasTurnSources && (
                                <button
                                  onClick={() => setShowSingleConvoSources(prev => ({ ...prev, [toggleKey]: true }))}
                                  style={{
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '6px',
                                    padding: '5px 10px',
                                    background: showSourcesTab ? `${currentTheme.accent}15` : currentTheme.buttonBackground,
                                    border: `1px solid ${showSourcesTab ? currentTheme.accent : currentTheme.borderLight}`,
                                    borderRadius: '8px',
                                    color: showSourcesTab ? currentTheme.accent : currentTheme.textSecondary,
                                    fontSize: '0.75rem',
                                    fontWeight: '600',
                                    cursor: 'pointer',
                                    transition: 'all 0.2s ease',
                                  }}
                                >
                                  <Globe size={12} />
                                  Sources ({turnSources.length})
                                </button>
                              )}
                            </div>

                            {!showSourcesTab ? (
                              <MarkdownRenderer content={exchange.assistant} theme={currentTheme} fontSize="1rem" lineHeight="1.85" />
                            ) : (
                              <motion.div
                                initial={{ opacity: 0, y: 2 }}
                                animate={{ opacity: 1, y: 0 }}
                                style={{ display: 'flex', flexDirection: 'column', gap: '4px', maxHeight: '180px', overflowY: 'auto' }}
                              >
                                {turnSources.map((source, sIdx) => (
                                  <a
                                    key={sIdx}
                                    href={source.link}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    style={{ display: 'block', padding: '6px 10px', background: currentTheme.buttonBackground, border: `1px solid ${currentTheme.borderLight}`, borderRadius: '6px', textDecoration: 'none', transition: 'border-color 0.2s' }}
                                    onMouseEnter={(e) => { e.currentTarget.style.borderColor = currentTheme.accent }}
                                    onMouseLeave={(e) => { e.currentTarget.style.borderColor = currentTheme.borderLight }}
                                  >
                                    <div style={{ fontSize: '0.75rem', fontWeight: '600', color: currentTheme.accent, marginBottom: '2px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{source.title}</div>
                                    <div style={{ fontSize: '0.65rem', color: currentTheme.textMuted, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{source.link}</div>
                                    {source.snippet && (<div style={{ fontSize: '0.7rem', color: currentTheme.textSecondary, marginTop: '3px', lineHeight: '1.4', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{source.snippet}</div>)}
                                  </a>
                                ))}
                              </motion.div>
                            )}
                          </div>
                        )
                      })()}
                    </React.Fragment>
                  ))
                )}

                {/* Web Search Indicator for single-model convo */}
                {isSearchingInSingleConvo && (
                  <motion.div
                    initial={{ opacity: 0, y: 5 }}
                    animate={{ opacity: 1, y: 0 }}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '6px',
                      padding: '6px 12px',
                      background: currentTheme.buttonBackground,
                      borderRadius: '20px',
                      width: 'fit-content',
                      marginBottom: '4px',
                    }}
                  >
                    <Search size={14} color={currentTheme.accent} />
                    <span style={{
                      fontSize: '0.85rem',
                      color: currentTheme.text,
                      background: currentTheme.accentGradient,
                      WebkitBackgroundClip: 'text',
                      WebkitTextFillColor: 'transparent',
                    }}>
                      Searching the web
                    </span>
                    <motion.span
                      animate={{ opacity: [1, 0.3, 1] }}
                      transition={{ duration: 1.5, repeat: Infinity, ease: 'easeInOut' }}
                      style={{
                        background: currentTheme.accentGradient,
                        WebkitBackgroundClip: 'text',
                        WebkitTextFillColor: 'transparent',
                      }}
                    >
                      ...
                    </motion.span>
                  </motion.div>
                )}

                {/* Fetching single-model response indicator */}
                {isSendingSingleConvo && (
                  <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '10px',
                      padding: '12px 16px',
                      maxWidth: '85%',
                    }}
                  >
                    <motion.div
                      animate={{ rotate: 360 }}
                      transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
                      style={{
                        width: '16px',
                        height: '16px',
                        border: `2px solid ${currentTheme.borderLight}`,
                        borderTop: `2px solid ${currentTheme.accent}`,
                        borderRadius: '50%',
                        flexShrink: 0,
                      }}
                    />
                    <span style={{
                      fontSize: '0.85rem',
                      color: currentTheme.textMuted,
                      fontStyle: 'italic',
                    }}>
                      {responses.length === 1
                        ? `Loading ${allModels.find(m => m.id === responses[0]?.modelName)?.providerName || 'model'}'s response...`
                        : 'Loading response...'}
                    </span>
                  </motion.div>
                )}

                {/* Single-model conversation input + action buttons */}
                {showSingleModelConvoInput && (
                  <div style={{ padding: '8px 0 0 0' }}>
                    {/* Action buttons row */}
                    {(responses.length > 0 && lastSubmittedPrompt) && (
                      <div style={{ display: 'flex', justifyContent: 'stretch', gap: '6px', marginBottom: '8px', width: '100%' }}>
                        {/* Clear Button */}
                        <div style={{ position: 'relative', flex: 1, display: 'flex' }}>
                        <motion.button
                          onClick={() => {
                            // Finalize the active history entry before clearing
                            if (currentHistoryId && currentUser?.id) {
                              axios.post(`${API_URL}/api/history/finalize`, {
                                historyId: currentHistoryId,
                                userId: currentUser.id,
                              }).catch(err => console.error('[History] Error finalizing:', err.message))
                            }
                            clearResponses()
                            clearLastSubmittedPrompt()
                            if (currentUser?.id) {
                              axios.post(`${API_URL}/api/judge/clear-context`, {
                                userId: currentUser.id
                              }).catch(err => console.error('[Clear Context] Error:', err))
                              axios.post(`${API_URL}/api/model/clear-context`, {
                                userId: currentUser.id
                              }).catch(err => console.error('[Clear Model Context] Error:', err))
                            }
                            setConversationInput('')
                            setConversationContext([])
                            setSingleModelConvoInput('')
                            setSingleModelConvoHistory([])
                            // Reset per-turn sources
                            setSummaryConvoSources({})
                            setShowSummaryConvoSources({})
                            setSingleConvoSources({})
                            setShowSingleConvoSources({})
                          }}
                          style={{
                            flex: 1,
                            padding: '4px 6px',
                            background: theme === 'light' ? 'rgba(255, 255, 255, 0.9)' : 'rgba(255, 255, 255, 0.12)',
                            border: theme === 'light' ? '1px solid rgba(200, 200, 200, 0.8)' : '1px solid rgba(255, 255, 255, 0.3)',
                            borderRadius: '12px',
                            color: theme === 'light' ? '#333' : '#ffffff',
                            fontSize: '0.7rem',
                            fontWeight: '500',
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            gap: '4px',
                            transition: 'all 0.2s ease',
                            whiteSpace: 'nowrap',
                            height: '28px',
                          }}
                          whileHover={{ 
                            background: theme === 'light' ? 'rgba(240, 240, 240, 1)' : 'rgba(255, 255, 255, 0.2)',
                          }}
                          whileTap={{ scale: 0.96 }}
                        >
                          <MessageSquarePlus size={12} />
                          New Chat
                        </motion.button>
                          <div
                            style={{ position: 'absolute', top: '-6px', right: '-6px', cursor: 'help', zIndex: 10 }}
                            onMouseEnter={() => setShowClearTooltip(true)}
                            onMouseLeave={() => setShowClearTooltip(false)}
                          >
                            <Info size={10} color={currentTheme.textMuted} />
                            {showClearTooltip && (
                              <div style={{
                                position: 'absolute',
                                bottom: '16px',
                                right: 0,
                                background: currentTheme.backgroundOverlay,
                                border: `1px solid ${currentTheme.borderLight}`,
                                borderRadius: '8px',
                                padding: '6px 10px',
                                fontSize: '0.7rem',
                                color: currentTheme.textSecondary,
                                width: '180px',
                                boxShadow: '0 4px 12px rgba(0,0,0,0.3)',
                                zIndex: 100,
                              }}>
                                Start a new chat and clear the current conversation.
                              </div>
                            )}
                          </div>
                        </div>

                        {/* Post Prompt Button */}
                        <div style={{ position: 'relative', flex: 1, display: 'flex' }}>
                        <motion.button
                          onClick={() => {
                            if (!currentUser?.id) {
                              alert('Please sign in to submit prompts to the Prompt Feed')
                              return
                            }
                            setShowPostWindow(true)
                          }}
                          style={{
                            flex: 1,
                            padding: '4px 6px',
                            background: theme === 'light' ? 'rgba(255, 140, 0, 0.85)' : 'rgba(255, 170, 0, 0.15)',
                            border: theme === 'light' ? '1px solid rgba(200, 100, 0, 0.8)' : '1px solid rgba(255, 170, 0, 0.4)',
                            borderRadius: '12px',
                            color: theme === 'light' ? '#fff' : '#ffaa00',
                            fontSize: '0.7rem',
                            fontWeight: '500',
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            gap: '4px',
                            transition: 'all 0.2s ease',
                            whiteSpace: 'nowrap',
                            height: '28px',
                          }}
                          whileHover={{ 
                            background: theme === 'light' ? 'rgba(255, 120, 0, 0.95)' : 'rgba(255, 170, 0, 0.25)',
                          }}
                          whileTap={{ scale: 0.96 }}
                        >
                          <Trophy size={12} />
                          Post Prompt
                        </motion.button>
                          <div
                            style={{ position: 'absolute', top: '-6px', right: '-6px', cursor: 'help', zIndex: 10 }}
                            onMouseEnter={() => setShowPostPromptSingleTooltip(true)}
                            onMouseLeave={() => setShowPostPromptSingleTooltip(false)}
                          >
                            <Info size={10} color={currentTheme.textMuted} />
                            {showPostPromptSingleTooltip && (
                              <div style={{
                                position: 'absolute',
                                bottom: '16px',
                                right: 0,
                                background: currentTheme.backgroundOverlay,
                                border: `1px solid ${currentTheme.borderLight}`,
                                borderRadius: '8px',
                                padding: '6px 10px',
                                fontSize: '0.7rem',
                                color: currentTheme.textSecondary,
                                width: '180px',
                                boxShadow: '0 4px 12px rgba(0,0,0,0.3)',
                                zIndex: 100,
                              }}>
                                Submit your prompt and response to the Prompt Feed.
                              </div>
                            )}
                          </div>
                        </div>

                        {/* Token Usage Button (single-model only) */}
                        {tokenData && tokenData.length > 0 && (
                          <div style={{ position: 'relative', flex: 1, display: 'flex' }}>
                            <motion.button
                              onClick={() => setShowSingleTokenUsage(true)}
                              style={{
                                flex: 1,
                                padding: '4px 6px',
                                background: currentTheme.buttonBackground,
                                border: `1px solid ${currentTheme.borderLight}`,
                                borderRadius: '12px',
                                color: currentTheme.accent,
                                fontSize: '0.7rem',
                                fontWeight: '500',
                                cursor: 'pointer',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                gap: '4px',
                                transition: 'all 0.2s ease',
                                whiteSpace: 'nowrap',
                                height: '28px',
                              }}
                              whileHover={{
                                background: currentTheme.buttonBackgroundHover,
                              }}
                              whileTap={{ scale: 0.96 }}
                            >
                              <Coins size={12} />
                              Model Usage Window
                            </motion.button>
                          </div>
                        )}

                      </div>
                    )}

                    {/* Conversation text input */}
                    <div style={{ display: 'flex', gap: '10px', alignItems: 'flex-end' }}>
                      <div style={{ flex: 1, position: 'relative' }}>
                        <textarea
                          ref={singleConvoTextareaRef}
                          value={singleModelConvoInput}
                          onChange={(e) => {
                            setSingleModelConvoInput(e.target.value)
                            adjustSingleConvoTextarea()
                          }}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter' && !e.shiftKey) {
                              e.preventDefault()
                              handleSendSingleModelConvo()
                            }
                          }}
                          placeholder={`Continue conversation with ${getProviderDisplayName(primaryResponse?.modelName)}...`}
                          disabled={isSendingSingleConvo}
                          style={{
                            width: '100%',
                            minHeight: '48px',
                            maxHeight: '150px',
                            padding: '12px 48px 12px 18px',
                            background: currentTheme.buttonBackground,
                            border: `1px solid ${currentTheme.borderLight}`,
                            borderRadius: '24px',
                            color: currentTheme.text,
                            fontSize: '0.95rem',
                            resize: 'none',
                            fontFamily: 'inherit',
                            outline: 'none',
                            lineHeight: '1.5',
                            overflow: 'hidden',
                          }}
                        />
                        <motion.button
                          onClick={() => {
                            if (isSendingSingleConvo) {
                              if (singleConvoAbortControllerRef.current) {
                                singleConvoAbortControllerRef.current.abort()
                              }
                            } else {
                              handleSendSingleModelConvo()
                            }
                          }}
                          disabled={!isSendingSingleConvo && !singleModelConvoInput.trim()}
                        style={{
                          position: 'absolute',
                            right: '8px',
                            bottom: '8px',
                            background: isSendingSingleConvo ? '#ef4444' : 'transparent',
                            border: isSendingSingleConvo ? 'none' : 'none',
                            color: isSendingSingleConvo ? '#fff' : ((!singleModelConvoInput.trim() || isSendingSingleConvo) ? currentTheme.textMuted : currentTheme.accent),
                            cursor: (!isSendingSingleConvo && !singleModelConvoInput.trim()) ? 'not-allowed' : 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            width: isSendingSingleConvo ? '26px' : 'auto',
                            height: isSendingSingleConvo ? '26px' : 'auto',
                            padding: isSendingSingleConvo ? '0' : '6px',
                            borderRadius: isSendingSingleConvo ? '8px' : '50%',
                            opacity: (!isSendingSingleConvo && !singleModelConvoInput.trim()) ? 0.4 : 1,
                          }}
                          whileHover={isSendingSingleConvo ? { scale: 1.05 } : (singleModelConvoInput.trim() ? { scale: 1.1 } : {})}
                          whileTap={isSendingSingleConvo ? { scale: 0.95 } : (singleModelConvoInput.trim() ? { scale: 0.95 } : {})}
                          title={isSendingSingleConvo ? 'Pause' : 'Send'}
                        >
                          {isSendingSingleConvo ? <Square size={12} fill="#fff" /> : <Send size={16} />}
                        </motion.button>
                      </div>
                    </div>
                  </div>
                )}
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
              background: currentTheme.buttonBackground,
              border: `1px solid ${currentTheme.borderLight}`,
              borderRadius: '20px',
              overflow: 'visible',
              boxShadow: `0 2px 12px ${currentTheme.shadow}`,
            }}>
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
                placeholder={isPromptLocked ? (subscriptionPaused ? "Account paused..." : "Resubscribe to send prompts...") : "Enter a prompt here to get a response from the council of LLMs or individual models..."}
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

              {/* Bottom bar: provider buttons + send */}
              <div style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '6px 12px 10px 12px',
                gap: '8px',
              }}>
                {/* Left side: placeholder or future "+" button */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexShrink: 0 }}>
                  {/* Could add attachment button here in the future */}
                </div>

                {/* Right side: provider buttons + send */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                  {availableModels.length > 0 && sortedProviders.map(([providerKey, providerData]) => {
                  const isPlaceholder = providerData.isPlaceholder || false
                    if (isPlaceholder) return null
                      const hasSelectedModels = providerData.models.some(m => selectedModels.includes(m.id))
                  const hasAutoSmart = autoSmartProviders[providerKey] || false
                    const isActive = hasSelectedModels || hasAutoSmart
                    const isExpanded = expandedProviders[providerKey]
                  
                  return (
                      <div key={providerKey} style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
                      <button
                        ref={(el) => {
                              if (el) providerButtonRefs.current[providerKey] = el
                        }}
                        onClick={(e) => {
                            handleProviderTabClick(providerKey, e)
                            e.currentTarget.blur()
                        }}
                        onKeyDown={(e) => {
                              if (e.key === 'Enter') e.preventDefault()
                        }}
                        onMouseEnter={(e) => {
                          if (!isActive) {
                            e.currentTarget.style.background = currentTheme.name === 'dark' ? 'rgba(255, 255, 255, 0.08)' : 'rgba(93, 133, 186, 0.1)'
                            e.currentTarget.style.borderColor = currentTheme.name === 'dark' ? 'rgba(255, 255, 255, 0.25)' : 'rgba(93, 133, 186, 0.35)'
                            e.currentTarget.style.transform = 'translateY(-1px)'
                          } else {
                            e.currentTarget.style.transform = 'translateY(-1px)'
                          }
                        }}
                        onMouseLeave={(e) => {
                          if (!isActive) {
                            e.currentTarget.style.background = 'transparent'
                            e.currentTarget.style.borderColor = currentTheme.borderLight
                          }
                          e.currentTarget.style.transform = 'translateY(0)'
                        }}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                            gap: '4px',
                            padding: '5px 8px',
                            height: '30px',
                            background: isActive
                              ? (currentTheme.name === 'dark' ? 'rgba(255, 255, 255, 0.10)' : 'rgba(44, 82, 130, 0.08)')
                              : 'transparent',
                            border: `1px solid ${isActive ? (currentTheme.name === 'dark' ? 'rgba(255, 255, 255, 0.30)' : 'rgba(44, 82, 130, 0.30)') : currentTheme.borderLight}`,
                            borderRadius: '8px',
                            color: isActive ? (currentTheme.name === 'dark' ? '#fff' : '#1a365d') : currentTheme.textSecondary,
                            cursor: 'pointer',
                            fontSize: '0.8rem',
                            fontWeight: isActive ? '600' : '500',
                            whiteSpace: 'nowrap',
                          transition: 'all 0.15s ease',
                              outline: 'none',
                              WebkitTapHighlightColor: 'transparent',
                            boxShadow: 'none',
                          }}
                        >
                          {isActive && (
                            <Check
                              size={13}
                              style={{ flexShrink: 0, color: currentTheme.name === 'dark' ? '#fff' : '#000', strokeWidth: 3 }}
                            />
                          )}
                          <span>{providerData.providerName}</span>
                          {isActive && (
                            <XCircle
                              size={13}
                              style={{ flexShrink: 0, opacity: 0.5, color: isActive ? (currentTheme.name === 'dark' ? 'rgba(255,255,255,0.5)' : 'rgba(0,0,0,0.4)') : undefined }}
                              onClick={(e) => {
                                e.stopPropagation()
                                // Deselect all models from this provider
                                const newSelectedModels = selectedModels.filter(id =>
                                  !providerData.models.some(model => model.id === id)
                                )
                                setSelectedModels(newSelectedModels)
                                setAutoSmartProviders((prev) => {
                                  const newState = { ...prev }
                                  delete newState[providerKey]
                                  return newState
                                })
                                setExpandedProviders((prev) => {
                                  const newState = { ...prev }
                                  delete newState[providerKey]
                                  return newState
                                })
                              }}
                            />
                          )}
                          <div
                            data-arrow-wrapper
                            onClick={(e) => handleArrowClick(providerKey, e)}
                            style={{
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              cursor: 'pointer',
                              flexShrink: 0,
                              padding: '0 1px',
                              marginLeft: '2px',
                              borderLeft: `1px solid ${isActive ? (currentTheme.name === 'dark' ? 'rgba(255,255,255,0.15)' : 'rgba(0,0,0,0.1)') : currentTheme.borderLight}`,
                              paddingLeft: '4px',
                            }}
                          >
                            <ChevronDown
                              size={14}
                              style={{
                                transform: isExpanded ? 'rotate(180deg)' : 'rotate(0deg)',
                                transition: 'transform 0.2s ease',
                                pointerEvents: 'none',
                              }}
                            />
                          </div>
                        </button>
                      </div>
                    )
                  })}

                  {/* Send Button */}
                  {(() => {
                    const hasAutoSmart = Object.values(autoSmartProviders).some(enabled => enabled)
                    const hasModels = selectedModels.length > 0 || hasAutoSmart
                    const canSubmit = currentPrompt.trim() && hasModels
                    const hasPromptOnly = currentPrompt.trim() && !hasModels
                    const isProcessing = isSubmitPending || isLoading || isGeneratingSummary
                    
                    return (
                      <div style={{ position: 'relative', display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <motion.button
                        onClick={() => {
                          if (isProcessing) return
                          if (canSubmit) {
                            setIsSubmitPending(true)
                            handleSubmit()
                          } else if (hasPromptOnly) {
                            setShowNoModelNotification(true)
                            setTimeout(() => setShowNoModelNotification(false), 4000)
                          }
                        }}
                          style={{ 
                          width: '30px',
                          height: '30px',
                          padding: 0,
                          background: canSubmit ? currentTheme.accent : hasPromptOnly ? '#ffaa00' : currentTheme.borderLight,
                          border: 'none',
                          borderRadius: '8px',
                          color: canSubmit || hasPromptOnly ? '#fff' : currentTheme.textMuted,
                          cursor: (!isProcessing && (canSubmit || hasPromptOnly)) ? 'pointer' : 'not-allowed',
                            display: 'flex', 
                            alignItems: 'center', 
                            justifyContent: 'center',
                          transition: 'all 0.2s ease',
                          opacity: isProcessing ? 0.55 : 1,
                        }}
                        whileHover={(!isProcessing && (canSubmit || hasPromptOnly)) ? { scale: 1.1 } : {}}
                        whileTap={(!isProcessing && (canSubmit || hasPromptOnly)) ? { scale: 0.9 } : {}}
                        title="Send"
                      >
                        <Send size={14} />
                      </motion.button>
                        <div
                          style={{ position: 'absolute', top: '-8px', right: '-8px', cursor: 'help', zIndex: 10 }}
                          onMouseEnter={() => setShowSendTooltip(true)}
                          onMouseLeave={() => setShowSendTooltip(false)}
                        >
                          <Info size={10} color={currentTheme.textMuted} />
                          {showSendTooltip && (
                            <div style={{
                              position: 'absolute',
                              bottom: '16px',
                              right: 0,
                              background: currentTheme.backgroundOverlay,
                              border: `1px solid ${currentTheme.borderLight}`,
                              borderRadius: '8px',
                              padding: '6px 10px',
                              fontSize: '0.7rem',
                              color: currentTheme.textSecondary,
                              width: '200px',
                              boxShadow: '0 4px 12px rgba(0,0,0,0.3)',
                              zIndex: 100,
                            }}>
                              Send your prompt to the selected models. Select at least one provider and model first.
                            </div>
                          )}
                        </div>
                      </div>
                    )
                  })()}
                          </div>
                    </div>
            </div>
          </div>
        </div>
        )}
      </div>

      {/* Expanded Council Column Response Popup */}
      <AnimatePresence>
        {maximizedCouncilResponse && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setMaximizedCouncilResponseId(null)}
            style={{
              position: 'fixed',
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              zIndex: 900,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              background: theme === 'light' ? 'rgba(0, 0, 0, 0.35)' : 'rgba(0, 0, 0, 0.72)',
              backdropFilter: 'blur(4px)',
            }}
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              onClick={(e) => e.stopPropagation()}
              style={{
                position: 'relative',
                width: 'min(900px, calc(100vw - 48px))',
                maxHeight: '82vh',
                overflowY: 'auto',
                background: currentTheme.backgroundOverlay,
                border: `1px solid ${currentTheme.borderLight}`,
                borderRadius: '14px',
                padding: '22px',
                boxShadow: theme === 'light'
                  ? '0 10px 40px rgba(0, 0, 0, 0.18)'
                  : '0 10px 40px rgba(0, 0, 0, 0.6)',
              }}
            >
              <button
                onClick={() => setMaximizedCouncilResponseId(null)}
                title="Close"
                style={{
                  position: 'absolute',
                  top: '14px',
                  right: '14px',
                  background: 'rgba(255, 0, 0, 0.08)',
                  border: '1px solid rgba(255, 0, 0, 0.3)',
                  borderRadius: '8px',
                  padding: '6px',
                  color: '#ff6b6b',
                  cursor: 'pointer',
                }}
              >
                <X size={16} />
              </button>

              <div style={{ marginBottom: '14px', paddingRight: '36px' }}>
                <h3
                  style={{
                    margin: 0,
                    fontSize: '1.25rem',
                    fontWeight: '700',
                    background: currentTheme.accentGradient,
                    WebkitBackgroundClip: 'text',
                    WebkitTextFillColor: 'transparent',
                  }}
                >
                  {getProviderDisplayName(maximizedCouncilResponse.modelName)}
                </h3>
              </div>

              <MarkdownRenderer
                content={typeof maximizedCouncilResponse.text === 'string' ? maximizedCouncilResponse.text : String(maximizedCouncilResponse.text || '')}
                theme={currentTheme}
                fontSize="1rem"
                lineHeight="1.8"
              />

              {Array.isArray(maximizedCouncilResponse.sources) && maximizedCouncilResponse.sources.length > 0 && (
                <div style={{ marginTop: '14px', borderTop: `1px solid ${currentTheme.borderLight}`, paddingTop: '12px' }}>
                  <div style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                    marginBottom: '8px',
                    color: currentTheme.accent,
                    fontSize: '0.85rem',
                    fontWeight: '600',
                  }}>
                    <Globe size={14} />
                    Sources ({maximizedCouncilResponse.sources.length})
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', maxHeight: '220px', overflowY: 'auto' }}>
                    {maximizedCouncilResponse.sources.map((source, sIdx) => (
                      <a
                        key={sIdx}
                        href={source.link}
                        target="_blank"
                        rel="noopener noreferrer"
                        style={{
                          display: 'block',
                          padding: '8px 12px',
                          background: currentTheme.buttonBackground,
                          border: `1px solid ${currentTheme.borderLight}`,
                          borderRadius: '8px',
                          textDecoration: 'none',
                          transition: 'border-color 0.2s',
                        }}
                        onMouseEnter={(e) => { e.currentTarget.style.borderColor = currentTheme.accent }}
                        onMouseLeave={(e) => { e.currentTarget.style.borderColor = currentTheme.borderLight }}
                      >
                        <div style={{ fontSize: '0.8rem', fontWeight: '600', color: currentTheme.accent, marginBottom: '2px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {source.title}
                        </div>
                        <div style={{ fontSize: '0.7rem', color: currentTheme.textMuted, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {source.link}
                        </div>
                        {source.snippet && (
                          <div style={{ fontSize: '0.75rem', color: currentTheme.textSecondary, marginTop: '4px', lineHeight: '1.4', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
                            {source.snippet}
                          </div>
                        )}
                      </a>
                    ))}
                  </div>
                </div>
              )}

              <div style={{ marginTop: '16px', borderTop: `1px solid ${currentTheme.borderLight}`, paddingTop: '12px' }}>
                {(councilColumnConvoHistory[maximizedCouncilResponse.id] || []).map((turn, turnIdx) => {
                  const turnSourceKey = `${maximizedCouncilResponse.id}-${turnIdx}`
                  const turnSources = councilColumnConvoSources[turnSourceKey] || []
                  const isLastTurn = turnIdx === (councilColumnConvoHistory[maximizedCouncilResponse.id] || []).length - 1
                  return (
                    <div key={`${maximizedCouncilResponse.id}-modal-turn-${turnIdx}`} style={{ marginBottom: '12px' }}>
                      <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                        <div style={{
                          maxWidth: '80%',
                          padding: '8px 10px',
                          borderRadius: '10px',
                          border: theme === 'light' ? '1px solid rgba(0, 0, 0, 0.15)' : '1px solid rgba(255, 255, 255, 0.35)',
                          background: theme === 'light' ? 'rgba(255, 255, 255, 0.95)' : 'rgba(255, 255, 255, 0.08)',
                        }}>
                          <div style={{ fontSize: '0.8rem', color: theme === 'light' ? '#111111' : currentTheme.text, whiteSpace: 'pre-wrap', overflowWrap: 'anywhere', wordBreak: 'break-word' }}>
                            {turn.user}
                          </div>
                        </div>
                      </div>

                      {isLastTurn && councilColumnConvoSearching[maximizedCouncilResponse.id] && (
                        <motion.div
                          initial={{ opacity: 0, y: 3 }}
                          animate={{ opacity: 1, y: 0 }}
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: '6px',
                            margin: '8px 0 6px',
                            padding: '5px 10px',
                            background: currentTheme.buttonBackground,
                            borderRadius: '16px',
                            width: 'fit-content',
                          }}
                        >
                          <Search size={12} color={currentTheme.accent} />
                          <span style={{
                            fontSize: '0.75rem',
                            background: currentTheme.accentGradient,
                            WebkitBackgroundClip: 'text',
                            WebkitTextFillColor: 'transparent',
                          }}>
                            Searching the web
                          </span>
                          <motion.span
                            animate={{ opacity: [1, 0.3, 1] }}
                            transition={{ duration: 1.5, repeat: Infinity, ease: 'easeInOut' }}
                            style={{
                              background: currentTheme.accentGradient,
                              WebkitBackgroundClip: 'text',
                              WebkitTextFillColor: 'transparent',
                            }}
                          >
                            ...
                          </motion.span>
                        </motion.div>
                      )}

                      <div style={{ marginTop: '6px', fontSize: '0.95rem', color: currentTheme.textSecondary, overflowWrap: 'anywhere', wordBreak: 'break-word' }}>
                        <MarkdownRenderer content={turn.assistant || ''} theme={currentTheme} fontSize="0.95rem" lineHeight="1.7" />
                      </div>

                      {turnSources.length > 0 && (
                        <div style={{ marginTop: '8px' }}>
                          <button
                            onClick={() => setShowCouncilColumnConvoSources(prev => ({ ...prev, [turnSourceKey]: !prev[turnSourceKey] }))}
                            style={{
                              display: 'flex',
                              alignItems: 'center',
                              gap: '6px',
                              padding: '5px 10px',
                              background: showCouncilColumnConvoSources[turnSourceKey] ? `${currentTheme.accent}15` : currentTheme.buttonBackground,
                              border: `1px solid ${showCouncilColumnConvoSources[turnSourceKey] ? currentTheme.accent : currentTheme.borderLight}`,
                              borderRadius: '8px',
                              color: currentTheme.accent,
                              fontSize: '0.75rem',
                              fontWeight: '500',
                              cursor: 'pointer',
                              transition: 'all 0.2s ease',
                            }}
                          >
                            <Globe size={12} />
                            Sources ({turnSources.length})
                            <ChevronDown size={12} style={{ transform: showCouncilColumnConvoSources[turnSourceKey] ? 'rotate(180deg)' : 'rotate(0deg)', transition: 'transform 0.2s' }} />
                          </button>
                          {showCouncilColumnConvoSources[turnSourceKey] && (
                            <motion.div
                              initial={{ opacity: 0, height: 0 }}
                              animate={{ opacity: 1, height: 'auto' }}
                              exit={{ opacity: 0, height: 0 }}
                              style={{ marginTop: '6px', display: 'flex', flexDirection: 'column', gap: '4px', maxHeight: '170px', overflowY: 'auto' }}
                            >
                              {turnSources.map((source, sIdx) => (
                                <a
                                  key={sIdx}
                                  href={source.link}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  style={{
                                    display: 'block',
                                    padding: '6px 10px',
                                    background: currentTheme.buttonBackground,
                                    border: `1px solid ${currentTheme.borderLight}`,
                                    borderRadius: '6px',
                                    textDecoration: 'none',
                                  }}
                                >
                                  <div style={{ fontSize: '0.75rem', fontWeight: '600', color: currentTheme.accent, marginBottom: '2px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                    {source.title}
                                  </div>
                                  <div style={{ fontSize: '0.65rem', color: currentTheme.textMuted, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                    {source.link}
                                  </div>
                                  {source.snippet && (
                                    <div style={{ fontSize: '0.7rem', color: currentTheme.textSecondary, marginTop: '3px', lineHeight: '1.4', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
                                      {source.snippet}
                                    </div>
                                  )}
                                </a>
                              ))}
                            </motion.div>
                          )}
                        </div>
                      )}
                    </div>
                  )
                })}

                <textarea
                  data-local-enter-handler="true"
                  value={councilColumnConvoInputs[maximizedCouncilResponse.id] || ''}
                  onChange={(e) => setCouncilColumnConvoInputs(prev => ({ ...prev, [maximizedCouncilResponse.id]: e.target.value }))}
                  onFocus={() => setIsCouncilColumnInputFocused(true)}
                  onBlur={() => setIsCouncilColumnInputFocused(false)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault()
                      e.stopPropagation()
                      handleSendCouncilColumnConvo(maximizedCouncilResponse)
                    }
                  }}
                  placeholder={`Continue conversation with ${getProviderDisplayName(maximizedCouncilResponse.modelName)}...`}
                  disabled={!!councilColumnConvoSending[maximizedCouncilResponse.id]}
                  style={{
                    width: '100%',
                    minHeight: '46px',
                    maxHeight: '130px',
                    padding: '10px 12px',
                    marginTop: '8px',
                    background: currentTheme.buttonBackground,
                    border: `1px solid ${currentTheme.borderLight}`,
                    borderRadius: '10px',
                    color: currentTheme.text,
                    fontSize: '0.85rem',
                    resize: 'vertical',
                    fontFamily: 'inherit',
                    outline: 'none',
                    lineHeight: '1.45',
                  }}
                />
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Provider Models Dropdowns - rendered at top level to avoid transform containing block issues */}
                <AnimatePresence>
                  {Object.entries(expandedProviders).map(([providerKey, isExpanded]) => {
                    if (!isExpanded || !dropdownPositions[providerKey]) return null
                    
                    const providerData = sortedProviders.find(([key]) => key === providerKey)?.[1]
                    if (!providerData) return null
                    
                    const position = dropdownPositions[providerKey]
                    
                    return (
                        <motion.div
                        key={`dropdown-${providerKey}`}
                          ref={(el) => {
                              if (el) dropdownRefs.current[providerKey] = el
                          }}
                        onClick={(e) => e.stopPropagation()}
                          initial={{ opacity: 0, y: -6 }}
                          animate={{ opacity: 1, y: 0 }}
                          exit={{ opacity: 0, y: -6 }}
                          transition={{ duration: 0.15 }}
                          className="model-dropdown"
                          style={{
                          position: 'fixed',
                          top: `${position.top}px`,
                          left: `${position.left}px`,
                          width: 'max-content',
                          minWidth: `${position.width}px`,
                            background: currentTheme.backgroundOverlay,
                            border: `1px solid ${currentTheme.borderLight}`,
                            borderRadius: '12px',
                            padding: '12px',
                          zIndex: 2000,
                            boxShadow: `0 -4px 20px ${currentTheme.shadow}`,
                          maxHeight: '400px',
                            overflowY: 'auto',
                            overflowX: 'hidden',
                            scrollbarWidth: 'thin',
                            scrollbarColor: `${currentTheme.accent} ${currentTheme.backgroundOverlayLighter}`,
                          }}
                        >
                          {/* Auto Smart Checkbox */}
                          <label
                            onClick={(e) => e.stopPropagation()}
                            style={{
                              display: 'flex',
                              alignItems: 'center',
                              gap: '10px',
                              padding: '10px',
                              background: autoSmartProviders[providerKey]
                                ? 'rgba(72, 201, 176, 0.1)'
                                : currentTheme.buttonBackground,
                              border: autoSmartProviders[providerKey]
                                ? '1px solid rgba(72, 201, 176, 0.5)'
                                : `1px solid ${currentTheme.border}`,
                              borderRadius: '6px',
                              cursor: 'pointer',
                              transition: 'all 0.2s ease',
                              marginBottom: '8px',
                            }}
                            onMouseEnter={(e) => {
                              e.currentTarget.style.background = autoSmartProviders[providerKey]
                                ? 'rgba(72, 201, 176, 0.15)'
                                : currentTheme.buttonBackgroundHover
                            }}
                            onMouseLeave={(e) => {
                              e.currentTarget.style.background = autoSmartProviders[providerKey]
                                ? 'rgba(72, 201, 176, 0.1)'
                                : currentTheme.buttonBackground
                            }}
                          >
                            <input
                              type="checkbox"
                              checked={autoSmartProviders[providerKey] || false}
                              onChange={(e) => toggleAutoSmart(providerKey, e)}
                              onClick={(e) => e.stopPropagation()}
                              style={{
                                width: '18px',
                                height: '18px',
                                cursor: 'pointer',
                                accentColor: autoSmartProviders[providerKey] ? '#48c9b0' : '#5dade2',
                              }}
                            />
                            <Sparkles size={16} color={autoSmartProviders[providerKey] ? currentTheme.accentSecondary : currentTheme.accent} />
                            <div style={{ flex: 1, color: currentTheme.textSecondary, fontSize: '0.9rem', fontWeight: '500' }}>
                              Auto Select
                            </div>
                            {autoSmartProviders[providerKey] && (
                              <Check size={16} color={currentTheme.accentSecondary} style={{ flexShrink: 0 }} />
                            )}
                          </label>
                          
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                            {providerData.models.map((model) => {
                              const isSelected = selectedModels.includes(model.id)
                              return (
                                <label
                                  key={model.id}
                                  style={{
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '10px',
                                    padding: '12px',
                                    minHeight: '48px',
                                    background: isSelected
                                      ? 'rgba(93, 173, 226, 0.2)'
                                      : 'rgba(93, 173, 226, 0.05)',
                                    border: isSelected
                                      ? '1px solid rgba(93, 173, 226, 0.5)'
                                      : '1px solid rgba(93, 173, 226, 0.2)',
                                    borderRadius: '6px',
                                    cursor: 'pointer',
                                    transition: 'all 0.2s ease',
                                  }}
                                  onMouseEnter={(e) => {
                                    if (!isSelected) {
                                      e.currentTarget.style.background = 'rgba(93, 173, 226, 0.1)'
                                    }
                                  }}
                                  onMouseLeave={(e) => {
                                    e.currentTarget.style.background = isSelected
                                      ? 'rgba(93, 173, 226, 0.2)'
                                      : 'rgba(93, 173, 226, 0.05)'
                                  }}
                                >
                                  <input
                                    type="radio"
                                    name={`provider-${providerKey}`}
                                    checked={isSelected}
                                    onChange={() => toggleModel(model.id)}
                                    style={{
                                      width: '18px',
                                      height: '18px',
                                      cursor: 'pointer',
                                      accentColor: '#5dade2',
                                    }}
                                  />
                                  <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                                    <div style={{ color: currentTheme.textSecondary, fontSize: '0.9rem', fontWeight: '500' }}>
                                    {model.model}
                                    </div>
                                    {model.type && model.label && (
                                      <>
                                        <span style={{ 
                                          color: currentTheme.accent, 
                                          fontSize: '0.75rem',
                                          fontWeight: '500'
                                        }}>
                                          {model.label}
                                        </span>
                                        <div
                                          style={{
                                            position: 'relative',
                                            display: 'inline-flex',
                                            alignItems: 'center',
                                            cursor: 'help',
                                          }}
                                          onMouseEnter={(e) => handleTooltipShow(e, model.type)}
                                          onMouseLeave={handleTooltipHide}
                                        >
                                          <Info size={12} color={currentTheme.accent} style={{ flexShrink: 0 }} />
                                        </div>
                                      </>
                                    )}
                                  </div>
                                  {isSelected && (
                                    <Check size={16} color={currentTheme.accentSecondary} style={{ flexShrink: 0 }} />
                                  )}
                                </label>
                              )
                            })}
                          </div>
                        </motion.div>
                  )
                })}
                  </AnimatePresence>

      {/* Post to Prompt Feed Window */}
      <AnimatePresence>
        {showPostWindow && (
          <div
            onClick={() => { if (!isSubmittingToVote) { setShowPostWindow(false); setPromptPostedSuccess(false); setPostDescription(''); setPostPromptExpanded(false); setPostActiveTab(null); setPostIncludeSummary(true); setPostExcludedResponses(new Set()); setPostVisibility(userIsPrivate ? 'followers' : 'public') } }}
            style={{
              position: 'fixed',
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              zIndex: 10000,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              background: 'rgba(0, 0, 0, 0.5)',
              backdropFilter: 'blur(4px)',
            }}
          >
            <motion.div
              onClick={(e) => e.stopPropagation()}
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              transition={{ duration: 0.2 }}
              style={{
                background: currentTheme.backgroundOverlay,
                border: `1px solid ${currentTheme.border}`,
                borderRadius: '16px',
                padding: '30px',
                maxWidth: '600px',
                width: 'calc(100% - 80px)',
                maxHeight: '80vh',
                overflowY: 'auto',
                position: 'relative',
                boxShadow: `0 0 40px ${currentTheme.shadow}`,
              }}
            >
              {/* Close button */}
              <button
                onClick={() => { if (!isSubmittingToVote) { setShowPostWindow(false); setPromptPostedSuccess(false); setPostDescription(''); setPostPromptExpanded(false); setPostActiveTab(null); setPostIncludeSummary(true); setPostExcludedResponses(new Set()) } }}
                style={{
                  position: 'absolute',
                  top: '16px',
                  right: '16px',
                  background: currentTheme.buttonBackground,
                  border: `1px solid ${currentTheme.borderLight}`,
                  borderRadius: '8px',
                  padding: '6px',
                  color: currentTheme.textSecondary,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <XCircle size={18} />
              </button>

              {promptPostedSuccess ? (
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '16px', padding: '20px 0' }}>
                  <div style={{
                    width: '48px',
                    height: '48px',
                    borderRadius: '50%',
                    background: 'rgba(34, 197, 94, 0.15)',
                    border: '2px solid rgba(34, 197, 94, 0.5)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}>
                    <Check size={26} color="#22c55e" />
                  </div>
                  <p style={{ color: '#22c55e', margin: 0, fontSize: '1.1rem', fontWeight: '600' }}>
                    Posted to Prompt Feed!
                  </p>
                  <motion.button
                    onClick={() => { setShowPostWindow(false); setPromptPostedSuccess(false); setPostDescription(''); setPostPromptExpanded(false); setPostActiveTab(null); setPostIncludeSummary(true); setPostExcludedResponses(new Set()) }}
                    style={{
                      marginTop: '4px',
                      padding: '10px 28px',
                      background: 'rgba(34, 197, 94, 0.15)',
                      border: '1px solid rgba(34, 197, 94, 0.4)',
                      borderRadius: '10px',
                      color: '#22c55e',
                      fontSize: '0.9rem',
                      fontWeight: '500',
                      cursor: 'pointer',
                    }}
                    whileHover={{ background: 'rgba(34, 197, 94, 0.25)' }}
                  >
                    Close
                  </motion.button>
                </div>
              ) : (
                <>
                  {/* Title */}
                  <h2 style={{
                    fontSize: '1.4rem',
                    margin: '0 0 6px 0',
                    background: currentTheme.accentGradient,
                    WebkitBackgroundClip: 'text',
                    WebkitTextFillColor: 'transparent',
                    paddingRight: '30px',
                  }}>
                    Post to Prompt Feed
                  </h2>

                  {/* Description textarea — on top */}
                  <div style={{ marginBottom: '16px', marginTop: '16px' }}>
                    <label style={{
                      color: currentTheme.textSecondary,
                      fontSize: '0.75rem',
                      fontWeight: '500',
                      textTransform: 'uppercase',
                      letterSpacing: '0.5px',
                      display: 'block',
                      marginBottom: '8px',
                    }}>
                      Description (optional)
                    </label>
                    <textarea
                      value={postDescription}
                      onChange={(e) => setPostDescription(e.target.value)}
                      placeholder="Add context or thoughts about this prompt..."
                      maxLength={500}
                      style={{
                        width: '100%',
                        minHeight: '90px',
                        padding: '12px 14px',
                        background: currentTheme.buttonBackground,
                        border: `1px solid ${currentTheme.borderLight}`,
                        borderRadius: '10px',
                        color: currentTheme.text,
                        fontSize: '0.9rem',
                        lineHeight: '1.5',
                        resize: 'vertical',
                        outline: 'none',
                        fontFamily: 'inherit',
                        boxSizing: 'border-box',
                        transition: 'border-color 0.2s',
                      }}
                      onFocus={(e) => { e.target.style.borderColor = currentTheme.accent }}
                      onBlur={(e) => { e.target.style.borderColor = currentTheme.borderLight }}
                    />
                    <p style={{
                      color: currentTheme.textMuted || currentTheme.textSecondary,
                      fontSize: '0.72rem',
                      margin: '4px 0 0 0',
                      textAlign: 'right',
                    }}>
                      {postDescription.length}/500
                    </p>
                  </div>

                  {/* Prompt preview — below description, with 50-word truncation */}
                  {(() => {
                    const promptText = lastSubmittedPrompt?.trim() || 'No prompt'
                    const words = promptText.split(/\s+/)
                    const isTruncated = words.length > 50
                    const displayText = (!postPromptExpanded && isTruncated) ? words.slice(0, 50).join(' ') : promptText
                    return (
                      <div style={{
                        padding: '14px 16px',
                        background: currentTheme.buttonBackground,
                        border: `1px solid ${currentTheme.borderLight}`,
                        borderRadius: '10px',
                        marginBottom: '16px',
                      }}>
                        <p style={{
                          color: currentTheme.textSecondary,
                          fontSize: '0.75rem',
                          fontWeight: '500',
                          margin: '0 0 6px 0',
                          textTransform: 'uppercase',
                          letterSpacing: '0.5px',
                        }}>
                          Prompt
                        </p>
                        <p style={{
                          color: currentTheme.text,
                          fontSize: '0.95rem',
                          margin: 0,
                          lineHeight: '1.5',
                          whiteSpace: 'pre-wrap',
                          wordBreak: 'break-word',
                        }}>
                          {displayText}
                          {isTruncated && !postPromptExpanded && (
                            <span
                              onClick={() => setPostPromptExpanded(true)}
                              style={{
                                color: currentTheme.accent,
                                cursor: 'pointer',
                                fontSize: '0.85rem',
                                fontWeight: '500',
                                marginLeft: '4px',
                              }}
                            >
                              ... show more
                            </span>
                          )}
                          {isTruncated && postPromptExpanded && (
                            <span
                              onClick={() => setPostPromptExpanded(false)}
                              style={{
                                color: currentTheme.accent,
                                cursor: 'pointer',
                                fontSize: '0.85rem',
                                fontWeight: '500',
                                marginLeft: '4px',
                              }}
                            >
                              {' '}show less
                            </span>
                          )}
                        </p>
                      </div>
                    )
                  })()}

                  {/* Response pull-down containers — each with include/exclude toggle */}
                  {(summary || (responses && responses.length > 0)) && (
                    <div style={{ marginBottom: '20px' }}>
                      <label style={{
                        color: currentTheme.textSecondary,
                        fontSize: '0.75rem',
                        fontWeight: '500',
                        textTransform: 'uppercase',
                        letterSpacing: '0.5px',
                        display: 'block',
                        marginBottom: '8px',
                      }}>
                        Include in Post
                      </label>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                      {/* Summary pull-down */}
                      {summary && (
                        <div style={{
                          background: currentTheme.buttonBackground,
                          border: `1px solid ${postIncludeSummary ? currentTheme.accent + '55' : currentTheme.borderLight}`,
                          borderRadius: '8px',
                          overflow: 'hidden',
                          opacity: postIncludeSummary ? 1 : 0.5,
                          transition: 'opacity 0.2s, border-color 0.2s',
                        }}>
                          <div style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: '0',
                          }}>
                            <button
                              onClick={() => setPostIncludeSummary(!postIncludeSummary)}
                              style={{
                                padding: '10px 0 10px 12px',
                                background: 'transparent',
                                border: 'none',
                                cursor: 'pointer',
                                display: 'flex',
                                alignItems: 'center',
                                flexShrink: 0,
                              }}
                            >
                              <div style={{
                                width: '20px',
                                height: '20px',
                                borderRadius: '5px',
                                border: postIncludeSummary ? 'none' : `2px solid ${currentTheme.textMuted || currentTheme.textSecondary}`,
                                background: postIncludeSummary ? currentTheme.accentGradient : 'transparent',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                transition: 'all 0.15s',
                              }}>
                                {postIncludeSummary && <Check size={14} color="#fff" strokeWidth={3} />}
                              </div>
                            </button>
                            <button
                              onClick={() => setPostActiveTab(postActiveTab === 'summary' ? null : 'summary')}
                              style={{
                                flex: 1,
                                padding: '10px 12px',
                                background: 'transparent',
                                border: 'none',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'space-between',
                                cursor: 'pointer',
                                color: currentTheme.text,
                              }}
                            >
                              <span style={{ fontSize: '0.9rem', fontWeight: '500' }}>Summary Response</span>
                              {postActiveTab === 'summary' ? (
                                <ChevronUp size={16} color={currentTheme.accent} />
                              ) : (
                                <ChevronDown size={16} color={currentTheme.accent} />
                              )}
                            </button>
                          </div>
                          {postActiveTab === 'summary' && (
                            <div style={{ padding: '12px', borderTop: `1px solid ${currentTheme.borderLight}`, maxHeight: '200px', overflowY: 'auto' }}>
                              <MarkdownRenderer
                                content={typeof summary === 'string' ? summary : (summary.text || summary.initialSummary || '')}
                                theme={currentTheme}
                                fontSize="0.85rem"
                                lineHeight="1.5"
                              />
                            </div>
                          )}
                        </div>
                      )}
                      {/* Individual model pull-downs */}
                      {responses && responses.map((r, idx) => {
                        const isIncluded = !postExcludedResponses.has(idx)
                        return (
                        <div key={idx} style={{
                          background: currentTheme.buttonBackground,
                          border: `1px solid ${isIncluded ? currentTheme.accent + '55' : currentTheme.borderLight}`,
                          borderRadius: '8px',
                          overflow: 'hidden',
                          opacity: isIncluded ? 1 : 0.5,
                          transition: 'opacity 0.2s, border-color 0.2s',
                        }}>
                          <div style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: '0',
                          }}>
                            <button
                              onClick={() => {
                                setPostExcludedResponses(prev => {
                                  const next = new Set(prev)
                                  if (next.has(idx)) next.delete(idx)
                                  else next.add(idx)
                                  return next
                                })
                              }}
                              style={{
                                padding: '10px 0 10px 12px',
                                background: 'transparent',
                                border: 'none',
                                cursor: 'pointer',
                                display: 'flex',
                                alignItems: 'center',
                                flexShrink: 0,
                              }}
                            >
                              <div style={{
                                width: '20px',
                                height: '20px',
                                borderRadius: '5px',
                                border: isIncluded ? 'none' : `2px solid ${currentTheme.textMuted || currentTheme.textSecondary}`,
                                background: isIncluded ? currentTheme.accentGradient : 'transparent',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                transition: 'all 0.15s',
                              }}>
                                {isIncluded && <Check size={14} color="#fff" strokeWidth={3} />}
                              </div>
                            </button>
                            <button
                              onClick={() => setPostActiveTab(postActiveTab === idx ? null : idx)}
                              style={{
                                flex: 1,
                                padding: '10px 12px',
                                background: 'transparent',
                                border: 'none',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'space-between',
                                cursor: 'pointer',
                                color: currentTheme.text,
                              }}
                            >
                              <span style={{ fontSize: '0.9rem', fontWeight: '500' }}>{r.modelName || `Model ${idx + 1}`} Response</span>
                              {postActiveTab === idx ? (
                                <ChevronUp size={16} color={currentTheme.accent} />
                              ) : (
                                <ChevronDown size={16} color={currentTheme.accent} />
                              )}
                            </button>
                          </div>
                          {postActiveTab === idx && (
                            <div style={{ padding: '12px', borderTop: `1px solid ${currentTheme.borderLight}`, maxHeight: '200px', overflowY: 'auto' }}>
                              <MarkdownRenderer
                                content={r.text || 'No response text'}
                                theme={currentTheme}
                                fontSize="0.85rem"
                                lineHeight="1.5"
                              />
                            </div>
                          )}
                        </div>
                        )
                      })}
                      </div>
                    </div>
                  )}

                  {/* Post Visibility Selector (for private accounts) */}
                  {userIsPrivate && (
                    <div style={{
                      display: 'flex', alignItems: 'center', gap: '8px',
                      marginBottom: '12px', padding: '10px 12px',
                      background: currentTheme.buttonBackground,
                      border: `1px solid ${currentTheme.borderLight}`,
                      borderRadius: '10px',
                    }}>
                      <Lock size={15} color={currentTheme.textSecondary} />
                      <span style={{ color: currentTheme.textSecondary, fontSize: '0.82rem', marginRight: 'auto' }}>Visibility:</span>
                      {['public', 'followers'].map(v => (
                        <button
                          key={v}
                          onClick={() => setPostVisibility(v)}
                          style={{
                            padding: '5px 14px',
                            background: postVisibility === v ? currentTheme.accentGradient : 'transparent',
                            border: postVisibility === v ? 'none' : `1px solid ${currentTheme.borderLight}`,
                            borderRadius: '8px',
                            color: postVisibility === v ? '#fff' : currentTheme.textSecondary,
                            fontSize: '0.8rem',
                            fontWeight: postVisibility === v ? '600' : '400',
                            cursor: 'pointer',
                            transition: 'all 0.15s',
                          }}
                        >
                          {v === 'public' ? 'Public' : 'Followers Only'}
                        </button>
                      ))}
                    </div>
                  )}

                  {/* Submit button */}
                  {(() => {
                    const includedResponseCount = responses ? responses.filter((_, idx) => !postExcludedResponses.has(idx)).length : 0
                    const includedSummary = summary && postIncludeSummary
                    const nothingIncluded = includedResponseCount === 0 && !includedSummary
                    return nothingIncluded ? (
                      <p style={{
                        color: '#ff6b6b',
                        fontSize: '0.78rem',
                        textAlign: 'center',
                        margin: '0 0 8px 0',
                      }}>
                        Select at least one response or the summary to include in your post
                      </p>
                    ) : null
                  })()}
                  <motion.button
                    onClick={async () => {
                      const includedResponseCount = responses ? responses.filter((_, idx) => !postExcludedResponses.has(idx)).length : 0
                      const includedSummary = summary && postIncludeSummary
                      if (includedResponseCount === 0 && !includedSummary) return
                      setIsSubmittingToVote(true)
                      try {
                        let facts = null
                        let sources = null
                        
                        const responseBoundSources = Array.isArray(summary?.sources) && summary.sources.length > 0
                          ? summary.sources
                          : (responses.find(r => Array.isArray(r.sources) && r.sources.length > 0)?.sources || null)

                        if (responseBoundSources) {
                          sources = responseBoundSources.map(s => ({
                            title: s.title,
                            link: s.link || s.url,
                            snippet: s.snippet,
                          }))
                        } else if (ragDebugData?.search?.results && Array.isArray(ragDebugData.search.results)) {
                          sources = ragDebugData.search.results.map(s => ({
                            title: s.title,
                            link: s.link,
                            snippet: s.snippet,
                          }))
                        }
                        
                        // No refiner facts — models read raw sources directly
                        // facts remain null
                        
                        const response = await axios.post(`${API_URL}/api/leaderboard/submit`, {
                          userId: currentUser.id,
                          promptText: lastSubmittedPrompt.trim(),
                          category: lastSubmittedCategory || 'General Knowledge/Other',
                          description: postDescription.trim() || null,
                          visibility: userIsPrivate ? postVisibility : 'public',
                          responses: (() => {
                            const filtered = responses ? responses.filter((_, idx) => !postExcludedResponses.has(idx)) : []
                            return filtered.length > 0 ? filtered.map(r => ({
                              modelName: r.modelName,
                              actualModelName: r.actualModelName,
                              originalModelName: r.originalModelName,
                              text: r.text,
                              error: r.error || false,
                              tokens: r.tokens || null,
                            })) : null
                          })(),
                          summary: (summary && postIncludeSummary) ? summary : null,
                          facts: facts,
                          sources: sources,
                        })
                        
                        if (response.data.success) {
                          setPromptPostedSuccess(true)
                        }
                      } catch (error) {
                        console.error('Error submitting to leaderboard:', error)
                        if (error.response?.data?.alreadyPosted) {
                          alert('This prompt has already been posted to the Prompt Feed.')
                        } else {
                          alert(error.response?.data?.error || 'Failed to submit prompt to Prompt Feed')
                        }
                      } finally {
                        setIsSubmittingToVote(false)
                      }
                    }}
                    disabled={isSubmittingToVote}
                    style={{
                      width: '100%',
                      padding: '12px',
                      background: currentTheme.accentGradient,
                      border: 'none',
                      borderRadius: '10px',
                      color: '#fff',
                      fontSize: '0.95rem',
                      fontWeight: '600',
                      cursor: isSubmittingToVote ? 'wait' : 'pointer',
                      opacity: isSubmittingToVote ? 0.7 : 1,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: '8px',
                    }}
                    whileHover={!isSubmittingToVote ? { scale: 1.01 } : {}}
                    whileTap={!isSubmittingToVote ? { scale: 0.99 } : {}}
                  >
                    <Trophy size={18} />
                    {isSubmittingToVote ? 'Posting...' : 'Submit to Prompt Feed'}
                  </motion.button>
                </>
              )}
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Model Type Tooltip */}
      <AnimatePresence>
        {tooltipState.show && tooltipState.type && (
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.9 }}
            transition={{ duration: 0.15 }}
            style={{
              position: 'fixed',
              left: `${tooltipState.x}px`,
              top: `${tooltipState.y}px`,
              background: 'rgba(0, 0, 0, 0.95)',
              border: '1px solid rgba(93, 173, 226, 0.5)',
              borderRadius: '8px',
              padding: '12px 16px',
              zIndex: 10001,
              maxWidth: '280px',
              boxShadow: '0 4px 20px rgba(93, 173, 226, 0.3)',
              pointerEvents: 'none',
            }}
            onMouseEnter={() => {
              if (tooltipTimeoutRef.current) {
                clearTimeout(tooltipTimeoutRef.current)
              }
            }}
            onMouseLeave={handleTooltipHide}
          >
            <div style={{ color: currentTheme.text, fontSize: '0.85rem', lineHeight: '1.5' }}>
              {getModelTypeTooltip(tooltipState.type)}
          </div>
        </motion.div>
      )}
    </AnimatePresence>

      {/* No Model Selected Notification */}
      <AnimatePresence>
        {showNoModelNotification && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowNoModelNotification(false)}
              style={{
                position: 'fixed',
                top: 0,
                left: 0,
                right: 0,
                bottom: 0,
                background: 'rgba(0, 0, 0, 0.3)',
                zIndex: 10002,
              }}
            />
            <motion.div
              initial={{ opacity: 0, y: -20, scale: 0.9 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -20, scale: 0.9 }}
              style={{
                position: 'fixed',
                top: '20%',
                left: '50%',
                transform: 'translateX(-50%)',
                background: currentTheme.backgroundOverlay,
                border: `2px solid ${currentTheme.borderActive}`,
                borderRadius: '12px',
                padding: '24px 32px',
                zIndex: 10003,
                boxShadow: `0 8px 32px ${currentTheme.shadow}`,
                minWidth: '320px',
                maxWidth: '400px',
                textAlign: 'center',
              }}
              onClick={() => setShowNoModelNotification(false)}
            >
            <div style={{ 
              color: currentTheme.text, 
              fontSize: '1rem', 
              lineHeight: '1.6',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: '12px',
            }}>
              <div style={{ 
                color: currentTheme.accent, 
                fontSize: '1.2rem', 
                fontWeight: '600',
                marginBottom: '4px',
              }}>
                Select a Model First
              </div>
              <div style={{ color: currentTheme.textSecondary }}>
                Please select at least one provider model or enable Auto Select before submitting your prompt.
              </div>
              <button
                onClick={() => setShowNoModelNotification(false)}
                style={{
                  marginTop: '8px',
                  padding: '8px 20px',
                  background: currentTheme.buttonBackground,
                  border: `1px solid ${currentTheme.border}`,
                  borderRadius: '6px',
                  color: currentTheme.text,
                  cursor: 'pointer',
                  fontSize: '0.9rem',
                  transition: 'all 0.2s ease',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = currentTheme.buttonBackgroundHover
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = currentTheme.buttonBackground
                }}
              >
                Got it
              </button>
            </div>
          </motion.div>
          </>
        )}
      </AnimatePresence>

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
