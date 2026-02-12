import React, { useState, useEffect, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Send, ChevronDown, Check, XCircle, Flame, Sparkles, Info, Trophy, Search, Save, Lock, FileText, LayoutGrid, Trash2 } from 'lucide-react'
import { useStore } from '../store/useStore'
import { getAllModels, LLM_PROVIDERS } from '../services/llmProviders'
import { detectCategory } from '../utils/categoryDetector'
import { getTheme } from '../utils/theme'
import axios from 'axios'
import { API_URL } from '../utils/config'
// ProviderIcon import kept available for future use
// import { ProviderIcon } from './ProviderIcons'

const MainView = ({ onClearAll, subscriptionRestricted = false }) => {
  const selectedModels = useStore((state) => state.selectedModels)
  const setSelectedModels = useStore((state) => state.setSelectedModels)
  const currentPrompt = useStore((state) => state.currentPrompt)
  const setCurrentPrompt = useStore((state) => state.setCurrentPrompt)
  const lastSubmittedPrompt = useStore((state) => state.lastSubmittedPrompt || '')
  const lastSubmittedCategory = useStore((state) => state.lastSubmittedCategory || '')
  const triggerSubmit = useStore((state) => state.triggerSubmit)
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
  const currentTheme = getTheme(theme)
  const navWidth = isNavExpanded ? '260px' : '60px'
  const [streakDays, setStreakDays] = useState(0)
  const setGeminiDetectionResponse = useStore((state) => state.setGeminiDetectionResponse)
  const isSearchingWeb = useStore((state) => state.isSearchingWeb)
  const [showNoModelNotification, setShowNoModelNotification] = useState(false)
  const [showVotingConfirm, setShowVotingConfirm] = useState(false)
  const [isSubmittingToVote, setIsSubmittingToVote] = useState(false)
  const [saveAllState, setSaveAllState] = useState('idle') // 'idle'|'saving'|'saved'
  const [showSaveAllTooltip, setShowSaveAllTooltip] = useState(false)
  const [showCouncilTooltip, setShowCouncilTooltip] = useState(false)

  // Inline conversation state (moved from SummaryWindow)
  const [conversationInput, setConversationInput] = useState('')
  const [isSendingConvo, setIsSendingConvo] = useState(false)
  const [isSearchingInConvo, setIsSearchingInConvo] = useState(false)
  const [conversationContext, setConversationContext] = useState([])
  const [convoSavingState, setConvoSavingState] = useState('idle')
  const [showConvoSaveTooltip, setShowConvoSaveTooltip] = useState(false)

  // Refs for chat layout
  const textareaRef = useRef(null)
  const chatAreaRef = useRef(null)
  const chatEndRef = useRef(null)
  const convoTextareaRef = useRef(null)

  // Fetch streak data
  useEffect(() => {
    if (currentUser?.id) {
      fetchStreak()
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
  const [autoSmartProviders, setAutoSmartProviders] = useState({}) // Track which providers have auto smart enabled
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
      // Position above the button by default (since buttons are at bottom of screen)
      setDropdownPositions((prev) => ({
        ...prev,
        [providerKey]: {
          top: rect.top - 8, // will be adjusted by height in useEffect
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

  // Global Enter key listener - allows submitting prompt even when input isn't focused
  useEffect(() => {
    const handleGlobalKeyDown = (e) => {
      // Only trigger on Enter key (not Shift+Enter)
      if (e.key !== 'Enter' || e.shiftKey) return
      
      // Don't trigger if user is focused on ANY input/textarea
      const activeElement = document.activeElement
      const tagName = activeElement?.tagName?.toLowerCase()
      
      if (tagName === 'input' || tagName === 'textarea') {
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
      
      e.preventDefault()
      handleSubmitRef.current()
    }
    
    window.addEventListener('keydown', handleGlobalKeyDown)
    return () => window.removeEventListener('keydown', handleGlobalKeyDown)
  }, [currentPrompt, selectedModels, autoSmartProviders])
  
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
    if (subscriptionRestricted) return
    if (!currentPrompt.trim()) return

    const providersWithAutoSmart = Object.entries(autoSmartProviders).filter(([_, isEnabled]) => isEnabled)
    const hasSelectedModels = selectedModels.length > 0
    
    if (!hasSelectedModels && providersWithAutoSmart.length === 0) {
      console.warn('[Submit] No models selected and no Auto Smart enabled')
      setShowNoModelNotification(true)
      setTimeout(() => setShowNoModelNotification(false), 4000)
      return
    }
    
    // Reset conversation state for new prompt
    setConversationInput('')
    setConversationContext([])
    setConvoSavingState('idle')
    setSaveAllState('idle')
    setShowCouncilPanel(false)
    
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
          }
        }
      } catch (error) {
        console.error('[Auto Smart] Error getting model recommendations:', error)
        if (selectedModels.length > 0) {
          triggerSubmit()
        } else {
          alert('Error getting model recommendations. Please manually select models or try again.')
        }
      }
    } else {
      if (selectedModels.length > 0) {
        triggerSubmit()
      }
    }
  }
  
  // Keep ref updated with latest handleSubmit
  handleSubmitRef.current = handleSubmit

  // Save All: saves all council responses, judge summary, sources, and conversations
  const handleSaveAll = async () => {
    if (!currentUser?.id) {
      alert('Please sign in to save conversations')
      return
    }
    setSaveAllState('saving')
    try {
      const allResponses = responses.map(r => ({
        modelName: r.modelName || r.model || '',
        modelResponse: r.text || r.response || '',
        conversation: [],
      }))

      const summaryData = useStore.getState().summary
      const ragData = useStore.getState().ragDebugData

      await axios.post(`${API_URL}/api/conversations/save`, {
        userId: currentUser.id,
        type: 'full',
        originalPrompt: lastSubmittedPrompt || '',
        category: lastSubmittedCategory || 'General',
        responses: allResponses,
        summary: summaryData ? {
          text: summaryData.text || '',
          originalPrompt: summaryData.originalPrompt || '',
          singleModel: summaryData.singleModel || false,
          modelName: summaryData.modelName || null,
        } : null,
        sources: ragData?.sources || ragData?.webResults || [],
        facts: ragData?.facts || [],
      })

      setSaveAllState('saved')
    } catch (error) {
      console.error('[Save All] Error:', error)
      if (error.response?.data?.alreadySaved) {
        setSaveAllState('saved')
      } else {
        alert('Failed to save conversation. Please try again.')
        setSaveAllState('idle')
      }
    }
  }

  // ---- Inline Conversation Handlers ---- //
  
  // Scroll to top when initial response/summary loads, scroll to bottom only for follow-up messages
  const prevConvoLengthRef = useRef(0)
  const lastScrolledPromptRef = useRef(null) // Track which prompt we already scrolled to top for
  useEffect(() => {
    const convoLength = summary?.conversationHistory?.length || 0
    
    if (convoLength > prevConvoLengthRef.current && convoLength > 0) {
      // Follow-up conversation message added — scroll to bottom to see the new reply
      setTimeout(() => {
        chatEndRef.current?.scrollIntoView({ behavior: 'smooth' })
      }, 150)
    } else if (chatAreaRef.current && (summary || responses.length > 0)) {
      // Only scroll to top ONCE per new prompt — don't re-scroll while the user is reading
      const currentPromptKey = lastSubmittedPrompt + '|' + responses.length
      if (lastScrolledPromptRef.current !== currentPromptKey) {
        lastScrolledPromptRef.current = currentPromptKey
        setTimeout(() => {
          chatAreaRef.current?.scrollTo({ top: 0, behavior: 'smooth' })
        }, 150)
      }
    }
    
    prevConvoLengthRef.current = convoLength
  }, [summary?.text, summary?.conversationHistory?.length, responses.length, lastSubmittedPrompt])

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
    
    try {
      // Check if web search is needed
      const detectResponse = await axios.post(`${API_URL}/api/detect-search-needed`, {
        query: conversationInput.trim(),
        userId: currentUser.id
      })
      
      if (detectResponse.data.needsSearch) {
        setIsSearchingInConvo(true)
      }
      
      const response = await axios.post(`${API_URL}/api/judge/conversation`, {
        userId: currentUser.id,
        userMessage: conversationInput.trim(),
        conversationContext: conversationContext
      })
      
      const initialSummary = summary.initialSummary || summary.text
      
      setSummary({
        ...summary,
        text: response.data.response,
        summary: response.data.response,
        initialSummary: initialSummary,
        prompt: `${summary.prompt || ''}\n\nUser: ${conversationInput.trim()}`,
        conversationHistory: [...(summary.conversationHistory || []), {
          user: conversationInput.trim(),
          assistant: response.data.response,
          timestamp: Date.now()
        }]
      })
      
      setConversationInput('')
      
      // Handle RAG debug data updates
      const store = useStore.getState()
      if (response.data.debugData && response.data.usedSearch) {
        const existingDebugData = store.ragDebugData || {}
        store.setRAGDebugData({
          ...existingDebugData,
          search: response.data.debugData.search,
          refiner: response.data.debugData.refiner,
          categoryDetection: response.data.debugData.categoryDetection,
          conversationContext: existingDebugData.conversationContext || []
        })
        
        if (response.data.searchResults && response.data.searchResults.length > 0) {
          store.setShowFactsWindow(true)
        }
      }
      
      // Refresh context
      setTimeout(async () => {
        await fetchConversationContext()
        const ragDebugData = store.ragDebugData
        if (ragDebugData && currentUser?.id) {
          try {
            const contextResponse = await axios.get(`${API_URL}/api/judge/context`, {
              params: { userId: currentUser.id }
            })
            const updatedContext = contextResponse.data.context || []
            store.setRAGDebugData({
              ...ragDebugData,
              conversationContext: updatedContext
            })
          } catch (error) {
            console.error('[MainView] Error updating debug pipeline context:', error)
          }
        }
      }, 500)
    } catch (error) {
      console.error('[MainView] Error sending conversation:', error)
      alert('Failed to send message. Please try again.')
    } finally {
      setIsSendingConvo(false)
      setIsSearchingInConvo(false)
    }
  }

  const handleSaveConversation = async () => {
    if (!currentUser?.id || !summary) return
    setConvoSavingState('saving')
    try {
      const conversation = conversationContext.map(ctx => ([
        { role: 'user', text: ctx.user, timestamp: ctx.timestamp },
        { role: 'assistant', text: ctx.judge || ctx.assistant, timestamp: ctx.timestamp },
      ])).flat()

      await axios.post(`${API_URL}/api/conversations/save`, {
        userId: currentUser.id,
        type: 'individual',
        originalPrompt: summary.originalPrompt || lastSubmittedPrompt || '',
        category: lastSubmittedCategory || 'General',
        modelName: summary.singleModel ? (summary.modelName || 'Single Model') : 'Judge Summary',
        modelResponse: summary.text || '',
        conversation,
      })
      setConvoSavingState('saved')
    } catch (error) {
      console.error('[Save] Error saving summary:', error)
      if (error.response?.data?.alreadySaved) {
        setConvoSavingState('saved')
      } else {
        alert('Failed to save. Please try again.')
        setConvoSavingState('idle')
      }
    }
  }

  // Auto-grow conversation textarea
  const adjustConvoTextarea = () => {
    const textarea = convoTextareaRef.current
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
  const showConversationInput = summary && !summary.singleModel
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
        {/* ===== SCROLLABLE CHAT AREA ===== */}
      <div
          ref={chatAreaRef}
          className="chat-area"
        style={{
            flex: 1,
            overflowY: 'auto',
            padding: '100px 40px 20px',
          display: 'flex',
          flexDirection: 'column',
          }}
        >
          <div style={{ maxWidth: '800px', width: '100%', margin: '0 auto', flex: 1, display: 'flex', flexDirection: 'column' }}>
            
            {/* Welcome header removed - title now lives in provider tab */}

            {/* ===== CONVERSATION FLOW ===== */}
            {hasActiveConversation && (
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
                  <div style={{ padding: '4px 0 0 4px' }}>
                    <div style={{
                      marginBottom: '14px',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      gap: '12px',
                    }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <FileText size={16} color={currentTheme.accent} />
                        <span style={{
                          color: currentTheme.accent,
                          fontSize: '0.8rem',
                          fontWeight: '600',
                          textTransform: 'uppercase',
                          letterSpacing: '0.5px',
                        }}>
                          {inlineResponseLabel}
                        </span>
                      </div>
                      
                    </div>
                    <div style={{
                      color: currentTheme.textSecondary,
                      lineHeight: '1.85',
                      fontSize: '1rem',
                      whiteSpace: 'pre-wrap',
                      margin: 0,
                    }}>
                      {inlineResponseText}
                    </div>
                  </div>
                )}

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

                      {/* Response - free flowing */}
                      <div style={{ padding: '4px 0 0 4px' }}>
                        <div style={{
                          marginBottom: '10px',
                display: 'flex',
                alignItems: 'center',
                          gap: '6px',
                        }}>
                          <span style={{
                            color: currentTheme.accent,
                            fontSize: '0.8rem',
                            fontWeight: '600',
                            textTransform: 'uppercase',
                            letterSpacing: '0.5px',
                          }}>
                            Response
                          </span>
                        </div>
                        <div style={{
                          color: currentTheme.textSecondary,
                          lineHeight: '1.85',
                          fontSize: '1rem',
                          whiteSpace: 'pre-wrap',
                          margin: 0,
                        }}>
                          {exchange.assistant || exchange.judge}
                        </div>
                      </div>
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
                      Fetching response...
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
                    {(responses.length > 0 && lastSubmittedPrompt) && (
                      <div style={{ display: 'flex', justifyContent: 'stretch', gap: '6px', marginBottom: '8px', width: '100%' }}>
                        {/* Clear Summary Button */}
                        <motion.button
                          onClick={() => {
                            clearResponses()
                            clearLastSubmittedPrompt()
                            // Clear judge conversation context
                            if (currentUser?.id) {
                              axios.post(`${API_URL}/api/judge/clear-context`, {
                                userId: currentUser.id
                              }).catch(err => console.error('[Clear Context] Error:', err))
                            }
                            // Reset inline conversation state
                            setConversationInput('')
                            setConversationContext([])
                          }}
                          style={{
                            flex: 1,
                            padding: '4px 6px',
                            background: theme === 'light' ? 'rgba(255, 59, 48, 0.85)' : 'rgba(255, 59, 48, 0.15)',
                            border: theme === 'light' ? '1px solid rgba(200, 40, 30, 0.8)' : '1px solid rgba(255, 59, 48, 0.4)',
                            borderRadius: '12px',
                            color: theme === 'light' ? '#fff' : '#ff6b6b',
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
                            background: theme === 'light' ? 'rgba(255, 40, 30, 0.95)' : 'rgba(255, 59, 48, 0.25)',
                          }}
                          whileTap={{ scale: 0.96 }}
                          title="Clear summary and all council responses"
                        >
                          <Trash2 size={12} />
                          Clear Summary
                        </motion.button>

                        <motion.button
                          onClick={() => {
                            if (!currentUser?.id) {
                              alert('Please sign in to submit prompts to the leaderboard')
                              return
                            }
                            setShowVotingConfirm(true)
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

                        <div style={{ position: 'relative', flex: 1, display: 'flex' }}>
                          <motion.button
                            onClick={handleSaveAll}
                            disabled={saveAllState === 'saving' || saveAllState === 'saved'}
                            style={{
                              flex: 1,
                              padding: '4px 6px',
                              background: saveAllState === 'saved'
                                ? 'rgba(0, 200, 100, 0.18)'
                                : theme === 'light' ? 'rgba(59, 130, 246, 0.85)' : 'rgba(59, 130, 246, 0.15)',
                              border: saveAllState === 'saved'
                                ? '1px solid rgba(0, 200, 100, 0.45)'
                                : theme === 'light' ? '1px solid rgba(37, 99, 235, 0.8)' : '1px solid rgba(59, 130, 246, 0.4)',
                              borderRadius: '12px',
                              color: saveAllState === 'saved'
                                ? '#00c864'
                                : theme === 'light' ? '#fff' : '#60a5fa',
                              fontSize: '0.7rem',
                              fontWeight: '500',
                              cursor: (saveAllState === 'saving' || saveAllState === 'saved') ? 'not-allowed' : 'pointer',
                              opacity: saveAllState === 'saving' ? 0.6 : 1,
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              gap: '4px',
                              transition: 'all 0.2s ease',
                              whiteSpace: 'nowrap',
                              height: '28px',
                            }}
                            whileHover={(saveAllState !== 'saving' && saveAllState !== 'saved') ? { 
                              background: saveAllState === 'saved' ? 'rgba(0, 200, 100, 0.28)' : theme === 'light' ? 'rgba(37, 99, 235, 0.95)' : 'rgba(59, 130, 246, 0.25)',
                            } : {}}
                            whileTap={(saveAllState !== 'saving' && saveAllState !== 'saved') ? { scale: 0.96 } : {}}
                            title={saveAllState === 'saved' ? 'Already saved' : 'Save all council responses'}
                          >
                            <Save size={12} />
                            {saveAllState === 'saving' ? 'Saving...' : saveAllState === 'saved' ? 'Saved!' : 'Save Council'}
                          </motion.button>
                          <div
                            style={{ position: 'absolute', top: '-6px', right: '-6px', cursor: 'help', zIndex: 10 }}
                            onMouseEnter={() => setShowSaveAllTooltip(true)}
                            onMouseLeave={() => setShowSaveAllTooltip(false)}
                          >
                            <Info size={10} color={currentTheme.textMuted} />
                            {showSaveAllTooltip && (
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
                                Save all model responses from this session as one bundle.
                              </div>
                            )}
                          </div>
                        </div>

                        <div style={{ position: 'relative', flex: 1, display: 'flex' }}>
                          <motion.button
                            onClick={handleSaveConversation}
                            disabled={convoSavingState === 'saving' || convoSavingState === 'saved'}
                            style={{
                              flex: 1,
                              padding: '4px 6px',
                              background: convoSavingState === 'saved' ? 'rgba(0, 200, 100, 0.18)' : currentTheme.buttonBackground,
                              border: `1px solid ${convoSavingState === 'saved' ? 'rgba(0, 200, 100, 0.45)' : currentTheme.borderLight}`,
                              borderRadius: '12px',
                              color: convoSavingState === 'saved' ? '#00c864' : currentTheme.accent,
                              fontSize: '0.7rem',
                              fontWeight: '500',
                              cursor: (convoSavingState === 'saving' || convoSavingState === 'saved') ? 'not-allowed' : 'pointer',
                              opacity: convoSavingState === 'saving' ? 0.6 : 1,
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              gap: '4px',
                              whiteSpace: 'nowrap',
                              height: '28px',
                            }}
                            whileHover={(convoSavingState !== 'saving' && convoSavingState !== 'saved') ? { scale: 1.02 } : {}}
                            title={convoSavingState === 'saved' ? 'Already saved' : 'Save the summary conversation'}
                          >
                            <Save size={12} />
                            {convoSavingState === 'saving' ? 'Saving...' : convoSavingState === 'saved' ? 'Saved!' : 'Save Convo'}
                          </motion.button>
                          <div
                            style={{ position: 'absolute', top: '-6px', right: '-6px', cursor: 'help', zIndex: 10 }}
                            onMouseEnter={() => setShowConvoSaveTooltip(true)}
                            onMouseLeave={() => setShowConvoSaveTooltip(false)}
                          >
                            <Info size={10} color={currentTheme.textMuted} />
                            {showConvoSaveTooltip && (
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
                                Save the summary judge conversation and its history.
                              </div>
                            )}
                          </div>
                        </div>

                        {/* Council Responses toggle button */}
                        <div style={{ position: 'relative', flex: 1, display: 'flex' }}>
                          <motion.button
                            onClick={toggleCouncilPanel}
                            style={{
                              flex: 1,
                              padding: '4px 6px',
                              background: showCouncilPanel 
                                ? (theme === 'light' ? 'rgba(59, 130, 246, 0.15)' : 'rgba(59, 130, 246, 0.2)')
                                : currentTheme.buttonBackground,
                              border: `1px solid ${showCouncilPanel ? 'rgba(59, 130, 246, 0.5)' : currentTheme.borderLight}`,
                              borderRadius: '12px',
                              color: showCouncilPanel ? '#60a5fa' : currentTheme.textSecondary,
                              cursor: 'pointer',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              gap: '4px',
                              transition: 'all 0.2s ease',
                              whiteSpace: 'nowrap',
                              height: '28px',
                              fontSize: '0.7rem',
                              fontWeight: '500',
                            }}
                            whileHover={{ 
                              background: showCouncilPanel 
                                ? (theme === 'light' ? 'rgba(59, 130, 246, 0.25)' : 'rgba(59, 130, 246, 0.3)')
                                : (theme === 'light' ? 'rgba(59, 130, 246, 0.1)' : 'rgba(59, 130, 246, 0.15)'),
                            }}
                            whileTap={{ scale: 0.96 }}
                            title={showCouncilPanel ? 'Hide Council Responses' : 'Show Council Responses'}
                          >
                            <LayoutGrid size={12} />
                            {showCouncilPanel ? 'Hide Council' : 'Show Council'}
                          </motion.button>
                          <div
                            style={{ position: 'absolute', top: '-6px', right: '-6px', cursor: 'help', zIndex: 10 }}
                            onMouseEnter={() => setShowCouncilTooltip(true)}
                            onMouseLeave={() => setShowCouncilTooltip(false)}
                          >
                            <Info size={10} color={currentTheme.textMuted} />
                            {showCouncilTooltip && (
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
                                Toggle the council panel to view individual responses from each AI model.
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
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
                          placeholder="Continue the conversation..."
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

                {/* Buttons for single model response (no conversation input) */}
                {!showConversationInput && inlineResponseText && lastSubmittedPrompt && (
                  <div style={{ display: 'flex', justifyContent: 'stretch', gap: '6px', marginTop: '16px', width: '100%' }}>
                    {/* Clear Button */}
                    <motion.button
                      onClick={() => {
                        clearResponses()
                        clearLastSubmittedPrompt()
                        if (currentUser?.id) {
                          axios.post(`${API_URL}/api/judge/clear-context`, {
                            userId: currentUser.id
                          }).catch(err => console.error('[Clear Context] Error:', err))
                        }
                        setConversationInput('')
                        setConversationContext([])
                      }}
                      style={{
                        flex: 1,
                        padding: '4px 6px',
                        background: theme === 'light' ? 'rgba(255, 59, 48, 0.85)' : 'rgba(255, 59, 48, 0.15)',
                        border: theme === 'light' ? '1px solid rgba(200, 40, 30, 0.8)' : '1px solid rgba(255, 59, 48, 0.4)',
                        borderRadius: '12px',
                        color: theme === 'light' ? '#fff' : '#ff6b6b',
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
                        background: theme === 'light' ? 'rgba(255, 40, 30, 0.95)' : 'rgba(255, 59, 48, 0.25)',
                      }}
                      whileTap={{ scale: 0.96 }}
                      title="Clear response"
                    >
                      <Trash2 size={12} />
                      Clear
                    </motion.button>

                    {/* Post Prompt Button */}
                    <motion.button
                      onClick={() => {
                        if (!currentUser?.id) {
                          alert('Please sign in to submit prompts to the leaderboard')
                          return
                        }
                        setShowVotingConfirm(true)
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

                    {/* Save Convo Button */}
                    <motion.button
                      onClick={handleSaveConversation}
                      disabled={convoSavingState === 'saving' || convoSavingState === 'saved'}
                      style={{
                        flex: 1,
                        padding: '4px 6px',
                        background: convoSavingState === 'saved' ? 'rgba(0, 200, 100, 0.18)' : currentTheme.buttonBackground,
                        border: `1px solid ${convoSavingState === 'saved' ? 'rgba(0, 200, 100, 0.45)' : currentTheme.borderLight}`,
                        borderRadius: '12px',
                        color: convoSavingState === 'saved' ? '#00c864' : currentTheme.accent,
                        fontSize: '0.7rem',
                        fontWeight: '500',
                        cursor: (convoSavingState === 'saving' || convoSavingState === 'saved') ? 'not-allowed' : 'pointer',
                        opacity: convoSavingState === 'saving' ? 0.6 : 1,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: '4px',
                        whiteSpace: 'nowrap',
                        height: '28px',
                      }}
                      whileHover={(convoSavingState !== 'saving' && convoSavingState !== 'saved') ? { scale: 1.02 } : {}}
                      title={convoSavingState === 'saved' ? 'Already saved' : 'Save this conversation'}
                    >
                      <Save size={12} />
                      {convoSavingState === 'saving' ? 'Saving...' : convoSavingState === 'saved' ? 'Saved!' : 'Save Convo'}
                    </motion.button>
                  </div>
                )}
              </div>
            )}

            <div ref={chatEndRef} />
          </div>
        </div>

        {/* ===== BOTTOM INPUT BAR ===== */}
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

            {/* Unified Prompt Box with embedded provider buttons */}
            <div style={{
              position: 'relative',
              background: currentTheme.buttonBackground,
              border: `1px solid ${currentTheme.borderLight}`,
              borderRadius: '20px',
              overflow: 'visible',
              boxShadow: `0 2px 12px ${currentTheme.shadow}`,
            }}>
              {/* Subscription Restricted Overlay */}
              {subscriptionRestricted && (
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
                    background: 'rgba(0, 0, 0, 0.7)',
                    backdropFilter: 'blur(4px)',
                    borderRadius: '20px',
                    gap: '8px',
                    padding: '12px',
                  }}
                >
                  <Lock size={24} color="#ff6b6b" />
                  <p style={{ color: '#ff6b6b', fontSize: '0.85rem', fontWeight: '600', textAlign: 'center', margin: 0 }}>
                    Resubscribe to send prompts
                  </p>
                </div>
              )}

              {/* Textarea */}
              <textarea
                ref={textareaRef}
                className="main-prompt-input"
                value={currentPrompt}
                onChange={(e) => {
                  if (!subscriptionRestricted) {
                    setCurrentPrompt(e.target.value)
                    const textarea = e.target
                    textarea.style.height = 'auto'
                    textarea.style.height = Math.min(textarea.scrollHeight, 200) + 'px'
                  }
                }}
                disabled={subscriptionRestricted}
                placeholder={subscriptionRestricted ? "Resubscribe to send prompts..." : "Enter a new prompt here to receive responses from the Council of LLMs..."}
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
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: '4px',
                            padding: '5px 8px',
                            height: '30px',
                            background: isActive
                              ? `${currentTheme.accent}18`
                              : 'transparent',
                            border: `1px solid ${isActive ? currentTheme.accent + '50' : currentTheme.borderLight}`,
                            borderRadius: '8px',
                            color: isActive ? currentTheme.accent : currentTheme.textSecondary,
                            cursor: 'pointer',
                            fontSize: '0.8rem',
                            fontWeight: isActive ? '600' : '500',
                            whiteSpace: 'nowrap',
                            transition: 'all 0.2s ease',
                            outline: 'none',
                            WebkitTapHighlightColor: 'transparent',
                          }}
                        >
                          <span>{providerData.providerName}</span>
                          {isActive && (
                            <XCircle
                              size={13}
                              style={{ flexShrink: 0, opacity: 0.7 }}
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
                              borderLeft: `1px solid ${isActive ? currentTheme.accent + '30' : currentTheme.borderLight}`,
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
                    
                    return (
                      <motion.button
                        onClick={() => {
                          if (canSubmit) {
                            handleSubmit()
                          } else if (hasPromptOnly) {
                            setShowNoModelNotification(true)
                            setTimeout(() => setShowNoModelNotification(false), 4000)
                          }
                        }}
                        style={{
                          padding: '5px 16px',
                          height: '30px',
                          background: canSubmit ? currentTheme.accent : hasPromptOnly ? '#ffaa00' : currentTheme.borderLight,
                          border: 'none',
                          borderRadius: '8px',
                          color: canSubmit || hasPromptOnly ? '#fff' : currentTheme.textMuted,
                          cursor: (canSubmit || hasPromptOnly) ? 'pointer' : 'not-allowed',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          gap: '6px',
                          fontSize: '0.8rem',
                          fontWeight: '600',
                          transition: 'all 0.2s ease',
                          whiteSpace: 'nowrap',
                        }}
                        whileHover={(canSubmit || hasPromptOnly) ? { scale: 1.03 } : {}}
                        whileTap={(canSubmit || hasPromptOnly) ? { scale: 0.97 } : {}}
                      >
                        Send
                      </motion.button>
                    )
                  })()}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

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
                          initial={{ opacity: 0, y: 10 }}
                          animate={{ opacity: 1, y: 0 }}
                          exit={{ opacity: 0, y: 10 }}
                          transition={{ duration: 0.2 }}
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
                              Auto Smart
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

      {/* Voting Confirmation Popup */}
      <AnimatePresence>
        {showVotingConfirm && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowVotingConfirm(false)}
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
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9 }}
              transition={{ duration: 0.15 }}
              style={{
                position: 'fixed',
                top: '50%',
                left: '50%',
                transform: 'translate(-50%, -50%)',
                background: currentTheme.backgroundOverlay,
                border: `1px solid rgba(255, 170, 0, 0.5)`,
                borderRadius: '12px',
                padding: '20px 24px',
                boxShadow: '0 4px 20px rgba(0, 0, 0, 0.4)',
                zIndex: 10003,
                minWidth: '320px',
              }}
            >
              <p style={{ 
                color: currentTheme.text, 
                margin: '0 0 16px 0', 
                fontSize: '0.95rem',
                lineHeight: '1.4'
              }}>
                Submit this prompt and responses to the leaderboard for voting?
              </p>
              <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
                <motion.button
                  onClick={() => setShowVotingConfirm(false)}
                  style={{
                    padding: '8px 16px',
                    background: 'transparent',
                    border: `1px solid ${currentTheme.borderLight}`,
                    borderRadius: '6px',
                    color: currentTheme.textSecondary,
                    fontSize: '0.85rem',
                    cursor: 'pointer',
                  }}
                  whileHover={{ background: currentTheme.buttonBackgroundHover }}
                >
                  Cancel
                </motion.button>
                <motion.button
                  onClick={async () => {
                    setIsSubmittingToVote(true)
                    try {
                      let facts = null
                      let sources = null
                      
                      if (ragDebugData) {
                        if (ragDebugData.refiner?.primary?.facts_with_citations) {
                          facts = ragDebugData.refiner.primary.facts_with_citations.map(f => ({
                            fact: f.fact,
                            source_quote: f.source_quote || null,
                          }))
                        } else if (ragDebugData.refiner?.backup?.facts_with_citations) {
                          facts = ragDebugData.refiner.backup.facts_with_citations.map(f => ({
                            fact: f.fact,
                            source_quote: f.source_quote || null,
                          }))
                        }
                        
                        if (ragDebugData.search?.results && Array.isArray(ragDebugData.search.results)) {
                          sources = ragDebugData.search.results.map(s => ({
                            title: s.title,
                            link: s.link,
                            snippet: s.snippet,
                          }))
                        }
                      }
                      
                      const response = await axios.post(`${API_URL}/api/leaderboard/submit`, {
                        userId: currentUser.id,
                        promptText: lastSubmittedPrompt.trim(),
                        category: lastSubmittedCategory || 'General Knowledge/Other',
                        responses: responses.length > 0 ? responses.map(r => ({
                          modelName: r.modelName,
                          actualModelName: r.actualModelName,
                          originalModelName: r.originalModelName,
                          text: r.text,
                          error: r.error || false,
                          tokens: r.tokens || null,
                        })) : null,
                        summary: summary || null,
                        facts: facts,
                        sources: sources,
                      })
                      
                      if (response.data.success) {
                        setShowVotingConfirm(false)
                      }
                    } catch (error) {
                      console.error('Error submitting to leaderboard:', error)
                      alert(error.response?.data?.error || 'Failed to submit prompt to leaderboard')
                    } finally {
                      setIsSubmittingToVote(false)
                    }
                  }}
                  disabled={isSubmittingToVote}
                  style={{
                    padding: '8px 16px',
                    background: 'rgba(255, 170, 0, 0.3)',
                    border: '1px solid rgba(255, 170, 0, 0.6)',
                    borderRadius: '6px',
                    color: '#ffaa00',
                    fontSize: '0.85rem',
                    fontWeight: '500',
                    cursor: isSubmittingToVote ? 'wait' : 'pointer',
                    opacity: isSubmittingToVote ? 0.7 : 1,
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                  }}
                  whileHover={!isSubmittingToVote ? { background: 'rgba(255, 170, 0, 0.4)' } : {}}
                >
                  {isSubmittingToVote ? 'Submitting...' : 'Confirm Submit'}
                </motion.button>
              </div>
            </motion.div>
          </>
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
                Please select at least one provider model or enable Auto Smart before submitting your prompt.
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
    </>
  )
}

export default MainView
