import React, { useState, useEffect, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Send, ChevronDown, Check, Trash2, X, XCircle, Flame, Sparkles, Info } from 'lucide-react'
import { useStore } from '../store/useStore'
import { getAllModels, LLM_PROVIDERS } from '../services/llmProviders'
import { detectCategory } from '../utils/categoryDetector'
import axios from 'axios'

const MainView = ({ onClearAll }) => {
  const selectedModels = useStore((state) => state.selectedModels)
  const setSelectedModels = useStore((state) => state.setSelectedModels)
  const currentPrompt = useStore((state) => state.currentPrompt)
  const setCurrentPrompt = useStore((state) => state.setCurrentPrompt)
  const triggerSubmit = useStore((state) => state.triggerSubmit)
  const responses = useStore((state) => state.responses || [])
  const clearResponses = useStore((state) => state.clearResponses)
  const currentUser = useStore((state) => state.currentUser)
  const statsRefreshTrigger = useStore((state) => state.statsRefreshTrigger)
  const [streakDays, setStreakDays] = useState(0)
  const gpt4oMiniResponse = useStore((state) => state.gpt4oMiniResponse)
  const setGpt4oMiniResponse = useStore((state) => state.setGpt4oMiniResponse)
  const clearGpt4oMiniResponse = useStore((state) => state.clearGpt4oMiniResponse)
  const isSearchingWeb = useStore((state) => state.isSearchingWeb)
  // Mode selection removed - always use Independent Research Mode

  // Fetch streak data
  useEffect(() => {
    if (currentUser?.id) {
      fetchStreak()
    }
  }, [currentUser, statsRefreshTrigger])

  const fetchStreak = async () => {
    try {
      const response = await axios.get(`http://localhost:3001/api/stats/${currentUser.id}/streak`)
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
    // NOTE: Mistral is temporarily disabled in main app - code remains intact for future use
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

  // Add placeholder providers (greyed out, non-selectable)
  const placeholderProviders = {
    deepseek: {
      providerName: 'DeepSeek',
      models: [],
      isPlaceholder: true
    },
    meta: {
      providerName: 'Meta (Llama)',
      models: [],
      isPlaceholder: true
    },
    mistral: {
      providerName: 'Mistral AI',
      models: [],
      isPlaceholder: true
    }
  }

  // Merge placeholder providers into modelsByProvider
  Object.assign(modelsByProvider, placeholderProviders)

  // Define the order for provider tabs (left to right) - includes placeholders
  const providerOrder = ['openai', 'anthropic', 'google', 'xai', 'deepseek', 'meta', 'mistral']
  
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
    // Override display name for OpenAI to "ChatGPT"
    if (providerKey === 'openai') {
      return [providerKey, { ...providerData, providerName: 'ChatGPT' }]
    }
    return [providerKey, providerData]
  })

  // Track which provider tab is expanded (only one at a time) - now click-based
  const [expandedProviders, setExpandedProviders] = useState({})
  const [autoSmartProviders, setAutoSmartProviders] = useState({}) // Track which providers have auto smart enabled
  const [dropdownPositions, setDropdownPositions] = useState({}) // Store dropdown positions
  const [tooltipState, setTooltipState] = useState({ show: false, type: null, x: 0, y: 0 }) // Tooltip state
  const dropdownRefs = useRef({})
  const providerButtonRefs = useRef({})
  const tooltipTimeoutRef = useRef(null)
  
  const handleArrowClick = (providerKey, e) => {
    e.stopPropagation()
    e.preventDefault()
    
    // Calculate dropdown position based on button position
    const buttonRef = providerButtonRefs.current[providerKey]
    if (buttonRef) {
      const rect = buttonRef.getBoundingClientRect()
      setDropdownPositions((prev) => ({
        ...prev,
        [providerKey]: {
          top: rect.bottom + window.scrollY + 8,
          left: rect.left + window.scrollX,
          width: rect.width,
        },
      }))
    }
    
    // Toggle the expanded state for this provider
    setExpandedProviders((prev) => {
      const isCurrentlyExpanded = prev[providerKey]
      // If clicking the same provider, close it. Otherwise, open this one and close others
      if (isCurrentlyExpanded) {
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
    
    e.stopPropagation()
    const providerData = modelsByProvider[providerKey]
    if (!providerData) return
    
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
          if (buttonRef) {
            const rect = buttonRef.getBoundingClientRect()
            setDropdownPositions((prev) => ({
              ...prev,
              [providerKey]: {
                top: rect.bottom + window.scrollY + 8,
                left: rect.left + window.scrollX,
                width: rect.width,
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

  // Function to determine the best model for a provider based on prompt category
  // getBestModelForProvider removed - now using Gemini 2.5 Flash Lite recommendations via detectCategory

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

  // Auto-select is now handled in handleSubmit when the user actually submits the prompt


  // Dropdown positioning is handled by absolute positioning within the container

  // Clean up selectedModels - remove any that don't exist in availableModels
  useEffect(() => {
    const validModelIds = availableModels.map(m => m.id)
    const invalidModels = selectedModels.filter(id => !validModelIds.includes(id))
    if (invalidModels.length > 0) {
      console.warn('[DEBUG] Removing invalid model selections:', invalidModels)
      setSelectedModels(selectedModels.filter(id => validModelIds.includes(id)))
    }
  }, [availableModels, selectedModels, setSelectedModels])

  const toggleModel = (modelId) => {
    // Find which provider this model belongs to
    const model = availableModels.find(m => m.id === modelId)
    if (!model || !model.provider) return
    
    const providerKey = model.provider
    
    if (selectedModels.includes(modelId)) {
      // Deselecting: remove this model
      setSelectedModels(selectedModels.filter((id) => id !== modelId))
    } else {
      // Selecting: first remove any other models from the same provider, then add this one
      const otherModelsFromSameProvider = selectedModels.filter(id => {
        const m = availableModels.find(am => am.id === id)
        return m && m.provider === providerKey
      })
      
      // Remove other models from same provider
      const newSelectedModels = selectedModels.filter(id => {
        const m = availableModels.find(am => am.id === id)
        return !m || m.provider !== providerKey
      })
      
      // Add the new model
      setSelectedModels([...newSelectedModels, modelId])
      
      // When a model is manually selected, disable Auto Smart for that provider
      setAutoSmartProviders((prev) => {
        const newState = { ...prev }
        delete newState[providerKey]
        return newState
      })
    }
  }

  const handleSubmit = async () => {
    if (!currentPrompt.trim()) return

    // Check if any providers have Auto Smart enabled
    const providersWithAutoSmart = Object.entries(autoSmartProviders).filter(([_, isEnabled]) => isEnabled)
    
    // Check if we have any models selected (either manually or from Auto Smart)
    const hasSelectedModels = selectedModels.length > 0
    
    // If no models selected and no Auto Smart enabled, can't submit
    if (!hasSelectedModels && providersWithAutoSmart.length === 0) {
      console.warn('[Submit] No models selected and no Auto Smart enabled')
      return
    }
    
    if (providersWithAutoSmart.length > 0) {
      // Build list of selected providers with their models
      const selectedProvidersData = providersWithAutoSmart.map(([providerKey]) => {
        const providerData = modelsByProvider[providerKey]
        return {
          providerKey,
          providerName: providerData?.providerName || providerKey,
          models: providerData?.models || []
        }
      })

      // Get model recommendations from Gemini 2.5 Flash Lite
      try {
        const detectionResult = await detectCategory(currentPrompt, selectedProvidersData)
        const { recommendedModels, recommendedModelType, rawResponse } = detectionResult
        
        // Store raw response for display
        setGpt4oMiniResponse(rawResponse || 'No response received')
        
        console.log('[Auto Smart] Gemini 2.5 Flash Lite recommendations:', { recommendedModels, recommendedModelType })
        
        // Update selected models based on recommendations
        // IMPORTANT: Start with an empty array, not existing selectedModels
        // This ensures we only use Auto Smart selections, not previous manual selections
        let newSelectedModels = []
        let hasAutoSmartSelection = false

        // Remove any existing models from Auto Smart providers (cleanup step)
        // This ensures we don't have leftover models from previous selections
        const allProviderModelIds = new Set()
        providersWithAutoSmart.forEach(([providerKey]) => {
          const providerData = modelsByProvider[providerKey]
          if (providerData) {
            providerData.models.forEach(model => {
              allProviderModelIds.add(model.id)
            })
          }
        })
        
        // Keep only models from providers that DON'T have Auto Smart enabled
        // This preserves manual selections for providers without Auto Smart
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

        // Priority: Use recommendedModelType for ALL Auto Smart providers
        // Only use specific recommendedModels if they match the recommended type
        if (recommendedModelType) {
          console.log(`[Auto Smart] Using recommendedModelType: "${recommendedModelType}" for all Auto Smart providers`)
          providersWithAutoSmart.forEach(([providerKey]) => {
            const providerData = modelsByProvider[providerKey]
            if (!providerData) {
              console.warn(`[Auto Smart] No provider data found for ${providerKey}`)
              return
            }
            
            console.log(`[Auto Smart] Processing ${providerKey}, available models:`, 
              providerData.models.map(m => ({ id: m.id, type: m.type, label: m.label })))
            
            // Check if there's a specific recommendation for this provider
            const specificRecommendation = recommendedModels?.[providerKey]
            let modelToUse = null
            
            if (specificRecommendation) {
              // Verify the specific recommendation matches the recommended type
              const recommendedModel = availableModels.find(m => m.id === specificRecommendation)
              console.log(`[Auto Smart] Checking specific recommendation for ${providerKey}:`, {
                recommended: specificRecommendation,
                found: !!recommendedModel,
                modelType: recommendedModel?.type,
                requiredType: recommendedModelType,
                matches: recommendedModel?.type === recommendedModelType
              })
              
              if (recommendedModel && recommendedModel.type === recommendedModelType) {
                // Use the specific recommendation if it matches the type
                modelToUse = specificRecommendation
                console.log(`[Auto Smart] ✓ Using specific recommendation ${modelToUse} for ${providerKey} (matches ${recommendedModelType} type)`)
              } else {
                // Specific recommendation doesn't match type, use type-based selection instead
                console.log(`[Auto Smart] ✗ Specific recommendation ${specificRecommendation} (type: ${recommendedModel?.type}) doesn't match ${recommendedModelType} type, using type-based selection for ${providerKey}`)
              }
            } else {
              console.log(`[Auto Smart] No specific recommendation for ${providerKey}, using type-based selection`)
            }
            
            // If no valid specific recommendation, use the recommended type
            if (!modelToUse) {
              const modelByType = providerData.models.find(m => m.type === recommendedModelType)
              console.log(`[Auto Smart] Looking for ${recommendedModelType} model in ${providerKey}:`, {
                found: !!modelByType,
                modelId: modelByType?.id,
                availableTypes: providerData.models.map(m => m.type)
              })
              
              if (modelByType) {
                modelToUse = modelByType.id
                console.log(`[Auto Smart] ✓ Selected ${modelToUse} (${recommendedModelType} type) for ${providerKey}`)
              } else {
                console.warn(`[Auto Smart] ✗ No ${recommendedModelType} model found for ${providerKey}, available types:`, 
                  providerData.models.map(m => `${m.id}: ${m.type}`))
              }
            }
            
            // Remove any existing model from this provider
            const existingModelIndex = newSelectedModels.findIndex(id => {
              const m = availableModels.find(am => am.id === id)
              return m && m.provider === providerKey
            })
            if (existingModelIndex > -1) {
              newSelectedModels.splice(existingModelIndex, 1)
            }
            
            // Add the selected model
            if (modelToUse && !newSelectedModels.includes(modelToUse)) {
              newSelectedModels.push(modelToUse)
              hasAutoSmartSelection = true
            }
          })
        } else {
          // Fallback: Use specific recommendations if no type is recommended
          Object.entries(recommendedModels).forEach(([providerKey, modelId]) => {
            if (modelId && !newSelectedModels.includes(modelId)) {
              newSelectedModels.push(modelId)
              hasAutoSmartSelection = true
              console.log(`[Auto Smart] Selected ${modelId} for ${providerKey} (no type recommendation, using specific)`)
            }
          })
        }
        
        // Final deduplication check
        newSelectedModels = [...new Set(newSelectedModels)]

        // If we got models from Auto Smart, use them; otherwise use existing selected models
        if (hasAutoSmartSelection || newSelectedModels.length > 0) {
          // Ensure final deduplication
          const finalModels = [...new Set(newSelectedModels)]
          console.log('[Auto Smart] Final models to submit:', finalModels)
          
          // Clear Auto Smart for providers that now have models explicitly selected
          // This prevents double-counting in the Clear Selected button
          const providersWithSelectedModels = new Set()
          finalModels.forEach(modelId => {
            const model = availableModels.find(m => m.id === modelId)
            if (model && model.provider) {
              providersWithSelectedModels.add(model.provider)
            }
          })
          
          // Clear Auto Smart for providers that now have explicit model selections
          setAutoSmartProviders((prev) => {
            const newState = { ...prev }
            providersWithSelectedModels.forEach(providerKey => {
              delete newState[providerKey]
            })
            return newState
          })
          
          setSelectedModels(finalModels)
          
          // Wait for state to update, then trigger submit
          setTimeout(() => {
      triggerSubmit()
          }, 100) // Increased timeout to ensure state updates
        } else {
          // Auto Smart failed to select models, but we should still try if we have manually selected models
          if (selectedModels.length > 0) {
            triggerSubmit()
          } else {
            console.error('[Auto Smart] Failed to select models and no manual selections')
            alert('Failed to automatically select models. Please manually select models or try again.')
          }
        }
      } catch (error) {
        console.error('[Auto Smart] Error getting model recommendations:', error)
        // Fall back to submitting with current models if we have any
        if (selectedModels.length > 0) {
          triggerSubmit()
        } else {
          alert('Error getting model recommendations. Please manually select models or try again.')
        }
      }
    } else {
      // No auto smart enabled, submit immediately if models are selected
      if (selectedModels.length > 0) {
        triggerSubmit()
      }
    }
  }

  return (
    <>
      {/* Debug Windows Container - Top Row */}
      <div
        style={{
          position: 'fixed',
          top: '20px',
          left: '20px',
          right: '20px',
          display: 'flex',
          gap: '12px',
          zIndex: 10000,
          flexWrap: 'wrap',
          alignItems: 'flex-start',
        }}
      >
        {/* GPT-4o-mini Response Display Window - Hidden for now, code kept for future use */}
        {false && gpt4oMiniResponse && (
          <motion.div
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            style={{
              width: '400px',
              maxHeight: '500px',
              background: 'rgba(0, 0, 0, 0.95)',
              border: '2px solid #00FFFF',
              borderRadius: '12px',
              padding: '20px',
              boxShadow: '0 4px 20px rgba(0, 255, 255, 0.3)',
              overflow: 'hidden',
              display: 'flex',
              flexDirection: 'column',
              flexShrink: 0,
            }}
          >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
            <h3 style={{ color: '#00FFFF', fontSize: '1.1rem', margin: 0, fontWeight: 'bold' }}>
              GPT-4o-mini Response
            </h3>
            <button
              onClick={() => clearGpt4oMiniResponse()}
              style={{
                background: 'transparent',
                border: 'none',
                color: '#ff6b6b',
                cursor: 'pointer',
                padding: '4px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <X size={20} />
            </button>
          </div>
          <div
            style={{
              flex: 1,
              overflowY: 'auto',
              color: '#cccccc',
              fontSize: '0.85rem',
              fontFamily: 'monospace',
              whiteSpace: 'pre-wrap',
              wordBreak: 'break-word',
              padding: '12px',
              background: 'rgba(0, 255, 255, 0.05)',
              borderRadius: '8px',
              border: '1px solid rgba(0, 255, 255, 0.2)',
            }}
          >
            {gpt4oMiniResponse}
          </div>
        </motion.div>
        )}
      </div>

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
            background: rgba(0, 255, 255, 0.5);
            border-radius: 4px;
          }
          .model-dropdown::-webkit-scrollbar-thumb:hover {
            background: rgba(0, 255, 255, 0.7);
          }
          /* Horizontal scrollbar for provider tabs */
          .provider-tabs-container::-webkit-scrollbar {
            height: 8px;
          }
          .provider-tabs-container::-webkit-scrollbar-track {
            background: rgba(0, 0, 0, 0.1);
            border-radius: 4px;
          }
          .provider-tabs-container::-webkit-scrollbar-thumb {
            background: rgba(0, 255, 255, 0.5);
            border-radius: 4px;
          }
          .provider-tabs-container::-webkit-scrollbar-thumb:hover {
            background: rgba(0, 255, 255, 0.7);
          }
        `}
      </style>
      <div
        style={{
          position: 'fixed',
          top: 0,
          left: 0,
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'flex-start',
          padding: '40px',
          paddingTop: '180px', // Moved down further
          paddingLeft: '260px', // Account for nav bar
          zIndex: 10,
          overflowY: 'auto',
        }}
      >
      <div
        style={{
          width: '100%',
          maxWidth: '1200px',
          display: 'flex',
          flexDirection: 'column',
          gap: '16px',
        }}
      >
        {/* Header */}
        <div style={{ marginBottom: '8px' }}>
          <div>
          <h1
            style={{
              fontSize: '2rem',
              marginBottom: '8px',
              background: 'linear-gradient(90deg, #00FFFF, #00FF00)',
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
            }}
          >
            Welcome to the Council of AIs
          </h1>
          <p style={{ color: '#aaaaaa', fontSize: '0.95rem' }}>
            Select models and enter your prompt to compare responses side-by-side and a summary of the responses
          </p>
          </div>
        </div>

        {/* Prompt Input */}
        <div
            style={{
            position: 'relative',
            display: 'flex',
            flexDirection: 'column',
            marginBottom: '20px',
          }}
        >
          {/* Streak Icon - Top Right Corner of Prompt Container */}
          {streakDays > 0 && (
            <div
              style={{
                position: 'absolute',
                top: '12px',
                right: '12px',
                display: 'flex',
                alignItems: 'center',
                gap: '4px',
                background: 'transparent',
                border: 'none',
                borderRadius: '8px',
                padding: '6px 10px',
                zIndex: 10,
              }}
            >
              <Flame size={14} color="#FF6B00" />
              <span style={{ color: '#FF6B00', fontSize: '0.75rem', fontWeight: 'bold' }}>
                {streakDays} day streak
              </span>
            </div>
          )}

          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              marginBottom: '12px',
              height: '28px',
            }}
          >
            <label
              style={{
              color: '#ffffff',
              fontSize: '1.1rem',
              fontWeight: '500',
            }}
            >
              Enter your prompt
            </label>
            {isSearchingWeb && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  color: '#00FFFF',
                  fontSize: '0.9rem',
                  fontWeight: '500',
                }}
              >
                <span>Searching the web</span>
                <motion.span
                  animate={{ opacity: [1, 0.3, 1] }}
                  transition={{
                    duration: 1.5,
                    repeat: Infinity,
                    ease: 'easeInOut'
                  }}
                >
                  ...
                </motion.span>
              </motion.div>
            )}
          </div>
          <textarea
            value={currentPrompt}
            onChange={(e) => setCurrentPrompt(e.target.value)}
            placeholder="Type your prompt here... (Enter to submit, Shift+Enter for new line)"
            style={{
              width: '100%',
              minHeight: '200px',
              height: '200px',
              padding: '20px',
              paddingRight: '60px', // Make room for the send button
              background: 'rgba(0, 255, 255, 0.05)',
              border: '1px solid rgba(0, 255, 255, 0.3)',
              borderRadius: '12px',
              color: '#ffffff',
              fontSize: '1rem',
              fontFamily: 'inherit',
              resize: 'vertical',
              lineHeight: '1.6',
            }}
            onKeyDown={(e) => {
              // Submit on Enter (unless Shift is held for new line)
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault() // Prevent default newline
                const hasAutoSmart = Object.values(autoSmartProviders).some(enabled => enabled)
                if (currentPrompt.trim() && (selectedModels.length > 0 || hasAutoSmart)) {
                  handleSubmit()
                }
              }
            }}
          />
          {/* Send Icon Button - Bottom Right Corner */}
          {(() => {
            const hasAutoSmart = Object.values(autoSmartProviders).some(enabled => enabled)
            const canSubmit = currentPrompt.trim() && (selectedModels.length > 0 || hasAutoSmart)
            
            return (
          <motion.button
            onClick={handleSubmit}
                disabled={!canSubmit}
            style={{
              position: 'absolute',
              bottom: '16px',
              right: '16px',
              width: '44px',
              height: '44px',
              borderRadius: '50%',
                  background: canSubmit
                  ? 'linear-gradient(135deg, #00FFFF, #00FF00)'
                  : 'rgba(128, 128, 128, 0.3)',
              border: 'none',
                  color: canSubmit ? '#000000' : '#666666',
                  cursor: canSubmit ? 'pointer' : 'not-allowed',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
                  boxShadow: canSubmit
                  ? '0 4px 12px rgba(0, 255, 255, 0.4)'
                  : 'none',
              transition: 'all 0.2s ease',
              zIndex: 10,
            }}
            whileHover={
                  canSubmit
                ? { scale: 1.1, boxShadow: '0 6px 16px rgba(0, 255, 255, 0.6)' }
                : {}
            }
                whileTap={canSubmit ? { scale: 0.95 } : {}}
          >
            <Send size={20} />
          </motion.button>
            )
          })()}
        </div>

        {/* Provider Tabs - Always Visible */}
        {availableModels.length > 0 && (
          <>
            {/* Explanation Text */}
            <div style={{ 
              color: '#ffffff', 
              fontSize: '0.8rem', 
              marginBottom: '12px',
              textAlign: 'center'
            }}>
              Click a provider tab to auto select a model | Click the arrow of the tab to manually select a model
            </div>
            
            <div
              style={{
                position: 'relative',
                background: 'rgba(0, 0, 0, 0.95)',
                border: '1px solid rgba(0, 255, 255, 0.3)',
                borderRadius: '12px',
                padding: '20px',
                overflow: 'visible',
                zIndex: 1000,
                boxShadow: '0 0 30px rgba(0, 255, 255, 0.3)',
              }}
            >
              {/* Provider Tabs - Horizontal Row with Even Spacing + Clear Selected Button */}
              <div
                className="provider-tabs-container"
                style={{
                  display: 'flex',
                  flexDirection: 'row',
                  justifyContent: 'flex-start',
                  alignItems: 'flex-start',
                  gap: '12px',
                  marginBottom: '20px',
                  paddingBottom: '8px',
                  width: '100%',
                  flexWrap: 'nowrap',
                  position: 'relative',
                  overflowX: 'auto',
                  overflowY: 'visible',
                  scrollbarWidth: 'thin',
                  scrollbarColor: 'rgba(0, 255, 255, 0.5) rgba(0, 0, 0, 0.1)',
                }}
              >
                {/* Clear Selected Button - Moved to first position */}
                <div
                  style={{
                    position: 'relative',
                    flex: '0 0 auto',
                    minWidth: '150px',
                  }}
                >
                  <button
                    onClick={(e) => {
                      e.preventDefault()
                      e.stopPropagation()
                      // Clear all selected models
                        setSelectedModels([])
                      // Clear all Auto Smart selections
                      setAutoSmartProviders({})
                    }}
                    disabled={(() => {
                      const hasModels = selectedModels && selectedModels.length > 0
                      const hasAutoSmart = Object.keys(autoSmartProviders).length > 0
                      return !hasModels && !hasAutoSmart
                    })()}
                    style={{
                      width: '100%',
                      padding: '14px 20px',
                      background: (() => {
                        const hasModels = selectedModels && selectedModels.length > 0
                        const hasAutoSmart = Object.keys(autoSmartProviders).length > 0
                        return hasModels || hasAutoSmart
                        ? 'rgba(255, 0, 0, 0.2)'
                          : 'rgba(128, 128, 128, 0.1)'
                      })(),
                      border: (() => {
                        const hasModels = selectedModels && selectedModels.length > 0
                        const hasAutoSmart = Object.keys(autoSmartProviders).length > 0
                        return hasModels || hasAutoSmart
                        ? '1px solid rgba(255, 0, 0, 0.5)'
                          : '1px solid rgba(128, 128, 128, 0.3)'
                      })(),
                      borderRadius: '8px',
                      color: (() => {
                        const hasModels = selectedModels && selectedModels.length > 0
                        const hasAutoSmart = Object.keys(autoSmartProviders).length > 0
                        return hasModels || hasAutoSmart
                        ? '#FF0000'
                          : '#888888'
                      })(),
                      cursor: (() => {
                        const hasModels = selectedModels && selectedModels.length > 0
                        const hasAutoSmart = Object.keys(autoSmartProviders).length > 0
                        return hasModels || hasAutoSmart
                        ? 'pointer'
                          : 'not-allowed'
                      })(),
                      fontSize: '1rem',
                      fontWeight: (() => {
                        const hasModels = selectedModels && selectedModels.length > 0
                        const hasAutoSmart = Object.keys(autoSmartProviders).length > 0
                        return hasModels || hasAutoSmart ? '600' : '500'
                      })(),
                      whiteSpace: 'nowrap',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: '10px',
                      transition: 'all 0.2s ease',
                      opacity: (() => {
                        const hasModels = selectedModels && selectedModels.length > 0
                        const hasAutoSmart = Object.keys(autoSmartProviders).length > 0
                        return hasModels || hasAutoSmart ? 1 : 0.6
                      })(),
                    }}
                    onMouseEnter={(e) => {
                      const hasModels = selectedModels && selectedModels.length > 0
                      const hasAutoSmart = Object.keys(autoSmartProviders).length > 0
                      if (hasModels || hasAutoSmart) {
                        e.currentTarget.style.background = 'rgba(255, 0, 0, 0.3)'
                      }
                    }}
                    onMouseLeave={(e) => {
                      const hasModels = selectedModels && selectedModels.length > 0
                      const hasAutoSmart = Object.keys(autoSmartProviders).length > 0
                      if (hasModels || hasAutoSmart) {
                        e.currentTarget.style.background = 'rgba(255, 0, 0, 0.2)'
                      } else {
                        e.currentTarget.style.background = 'rgba(128, 128, 128, 0.1)'
                      }
                    }}
                  >
                    <XCircle size={18} />
                    <span>Clear Selected</span>
                    {(() => {
                      const hasModels = selectedModels && selectedModels.length > 0
                      const hasAutoSmart = Object.keys(autoSmartProviders).length > 0
                      
                      // Count only providers with Auto Smart that don't have explicit model selections
                      // to avoid double-counting when Auto Smart has selected models
                      const autoSmartOnlyCount = Object.keys(autoSmartProviders).filter(providerKey => {
                        // Check if this provider has any models in selectedModels
                        const hasExplicitModel = selectedModels.some(modelId => {
                          const model = availableModels.find(m => m.id === modelId)
                          return model && model.provider === providerKey
                        })
                        return !hasExplicitModel // Only count if no explicit model is selected
                      }).length
                      
                      const totalCount = (selectedModels?.length || 0) + autoSmartOnlyCount
                      return (hasModels || hasAutoSmart) && totalCount > 0 ? (
                      <span
                        style={{
                          background: 'rgba(255, 0, 0, 0.3)',
                          color: '#FF0000',
                          padding: '3px 8px',
                          borderRadius: '10px',
                          fontSize: '0.75rem',
                          fontWeight: 'bold',
                        }}
                      >
                          {totalCount}
                      </span>
                      ) : null
                    })()}
                  </button>
                </div>

                {sortedProviders.map(([providerKey, providerData]) => {
                  const isPlaceholder = providerData.isPlaceholder || false
                  const isExpanded = expandedProviders[providerKey]
                  const selectedCount = providerData.models.filter(m => 
                    selectedModels.includes(m.id)
                  ).length
                  const hasSelectedModels = selectedCount > 0
                  const hasAutoSmart = autoSmartProviders[providerKey] || false
                  const isActive = isExpanded || hasSelectedModels || hasAutoSmart
                  
                  return (
                    <div
                      key={providerKey}
                      style={{
                        position: 'relative',
                        flex: '0 0 auto',
                        display: 'flex',
                        flexDirection: 'column',
                        overflow: 'visible',
                      }}
                    >
                      {/* Provider Tab Button */}
                      <button
                        ref={(el) => {
                          if (el) {
                            providerButtonRefs.current[providerKey] = el
                          }
                        }}
                        onClick={(e) => {
                          if (!isPlaceholder) {
                            handleProviderTabClick(providerKey, e)
                          }
                        }}
                        disabled={isPlaceholder}
                        style={{
                          padding: '14px 20px',
                          background: isPlaceholder
                            ? 'rgba(128, 128, 128, 0.1)'
                            : isActive
                            ? 'rgba(0, 255, 255, 0.3)'
                            : 'rgba(0, 255, 255, 0.05)',
                          border: isPlaceholder
                            ? '1px solid rgba(128, 128, 128, 0.3)'
                            : isActive
                            ? '2px solid rgba(0, 255, 255, 0.8)'
                            : '1px solid rgba(0, 255, 255, 0.2)',
                          borderRadius: '8px',
                          color: isPlaceholder ? '#666666' : '#ffffff',
                          cursor: isPlaceholder ? 'not-allowed' : 'pointer',
                          fontSize: '1rem',
                          fontWeight: isActive ? '600' : '500',
                          whiteSpace: 'nowrap',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          gap: '10px',
                          transition: 'all 0.2s ease',
                          flexShrink: 0,
                          width: 'fit-content',
                          minWidth: 'fit-content',
                          boxShadow: isPlaceholder
                            ? 'none'
                            : isActive
                            ? '0 0 15px rgba(0, 255, 255, 0.4), 0 0 30px rgba(0, 255, 255, 0.2)'
                            : 'none',
                          opacity: isPlaceholder ? 0.5 : 1,
                        }}
                      >
                        {!isPlaceholder && (
                          <div
                            data-arrow-wrapper
                            onClick={(e) => handleArrowClick(providerKey, e)}
                            style={{
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              cursor: 'pointer',
                              flexShrink: 0,
                              padding: '2px',
                          }}
                        >
                          <ChevronDown
                            size={18}
                            style={{
                              transform: isExpanded ? 'rotate(180deg)' : 'rotate(0deg)',
                              transition: 'transform 0.2s ease',
                              pointerEvents: 'none',
                            }}
                          />
                          </div>
                        )}
                        <span style={{ textAlign: 'center', whiteSpace: 'nowrap' }}>{providerData.providerName}</span>
                        {!isPlaceholder && selectedCount > 0 && (
                          <span
                            style={{
                              background: 'rgba(0, 255, 0, 0.2)',
                              color: '#00FF00',
                              padding: '3px 8px',
                              borderRadius: '10px',
                              fontSize: '0.75rem',
                              fontWeight: 'bold',
                              flexShrink: 0,
                            }}
                          >
                            {selectedCount}
                          </span>
                        )}
                      </button>

                    </div>
                  )
                })}
                
                {/* Provider Models Dropdowns - Rendered outside container */}
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
                            if (el) {
                              dropdownRefs.current[providerKey] = el
                            }
                          }}
                        onClick={(e) => e.stopPropagation()}
                          initial={{ opacity: 0, y: -10 }}
                          animate={{ opacity: 1, y: 0 }}
                          exit={{ opacity: 0, y: -10 }}
                          transition={{ duration: 0.2 }}
                          className="model-dropdown"
                          style={{
                          position: 'fixed',
                          top: `${position.top}px`,
                          left: `${position.left}px`,
                          width: 'max-content',
                          minWidth: `${position.width}px`,
                            background: 'rgba(0, 0, 0, 0.98)',
                            border: '1px solid rgba(0, 255, 255, 0.4)',
                            borderRadius: '8px',
                            padding: '16px',
                          zIndex: 2000,
                            boxShadow: '0 4px 20px rgba(0, 255, 255, 0.3)',
                          maxHeight: '400px',
                            overflowY: 'auto',
                            overflowX: 'hidden',
                            // Custom scrollbar styling for Firefox
                            scrollbarWidth: 'thin',
                            scrollbarColor: 'rgba(0, 255, 255, 0.5) rgba(0, 0, 0, 0.1)',
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
                                ? 'rgba(0, 255, 0, 0.1)'
                                : 'rgba(0, 255, 255, 0.05)',
                              border: autoSmartProviders[providerKey]
                                ? '1px solid rgba(0, 255, 0, 0.5)'
                                : '1px solid rgba(0, 255, 255, 0.2)',
                              borderRadius: '6px',
                              cursor: 'pointer',
                              transition: 'all 0.2s ease',
                              marginBottom: '8px',
                            }}
                            onMouseEnter={(e) => {
                              e.currentTarget.style.background = autoSmartProviders[providerKey]
                                ? 'rgba(0, 255, 0, 0.15)'
                                : 'rgba(0, 255, 255, 0.1)'
                            }}
                            onMouseLeave={(e) => {
                              e.currentTarget.style.background = autoSmartProviders[providerKey]
                                ? 'rgba(0, 255, 0, 0.1)'
                                : 'rgba(0, 255, 255, 0.05)'
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
                                accentColor: autoSmartProviders[providerKey] ? '#00FF00' : '#00FFFF',
                              }}
                            />
                            <Sparkles size={16} color={autoSmartProviders[providerKey] ? '#00FF00' : '#00FFFF'} />
                            <div style={{ flex: 1, color: '#cccccc', fontSize: '0.9rem', fontWeight: '500' }}>
                              Auto Smart
                            </div>
                            {autoSmartProviders[providerKey] && (
                              <Check size={16} color="#00FF00" style={{ flexShrink: 0 }} />
                            )}
                          </label>
                          
                          <div
                            style={{
                              display: 'flex',
                              flexDirection: 'column',
                              gap: '8px',
                            }}
                          >
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
                                      ? 'rgba(0, 255, 255, 0.2)'
                                      : 'rgba(0, 255, 255, 0.05)',
                                    border: isSelected
                                      ? '1px solid rgba(0, 255, 255, 0.5)'
                                      : '1px solid rgba(0, 255, 255, 0.2)',
                                    borderRadius: '6px',
                                    cursor: 'pointer',
                                    transition: 'all 0.2s ease',
                                  }}
                                  onMouseEnter={(e) => {
                                    if (!isSelected) {
                                      e.currentTarget.style.background = 'rgba(0, 255, 255, 0.1)'
                                    }
                                  }}
                                  onMouseLeave={(e) => {
                                    e.currentTarget.style.background = isSelected
                                      ? 'rgba(0, 255, 255, 0.2)'
                                      : 'rgba(0, 255, 255, 0.05)'
                                  }}
                                >
                                  <input
                                    type="checkbox"
                                    checked={isSelected}
                                    onChange={() => toggleModel(model.id)}
                                    style={{
                                      width: '18px',
                                      height: '18px',
                                      cursor: 'pointer',
                                      accentColor: '#00FFFF',
                                    }}
                                  />
                                  <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                                    <div style={{ color: '#cccccc', fontSize: '0.9rem', fontWeight: '500' }}>
                                    {model.model}
                                    </div>
                                    {model.type && model.label && (
                                      <>
                                        <span style={{ 
                                          color: '#00FFFF', 
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
                                          <Info size={12} color="#00FFFF" style={{ flexShrink: 0 }} />
                                        </div>
                                      </>
                                    )}
                                  </div>
                                  {isSelected && (
                                    <Check size={16} color="#00FF00" style={{ flexShrink: 0 }} />
                                  )}
                                </label>
                              )
                            })}
                          </div>
                        </motion.div>
                  )
                })}
                  </AnimatePresence>
              </div>
          </div>
          </>
        )}

      </div>
    </div>

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
              border: '1px solid rgba(0, 255, 255, 0.5)',
              borderRadius: '8px',
              padding: '12px 16px',
              zIndex: 10001,
              maxWidth: '280px',
              boxShadow: '0 4px 20px rgba(0, 255, 255, 0.3)',
              pointerEvents: 'none',
            }}
            onMouseEnter={() => {
              if (tooltipTimeoutRef.current) {
                clearTimeout(tooltipTimeoutRef.current)
              }
            }}
            onMouseLeave={handleTooltipHide}
          >
            <div style={{ color: '#ffffff', fontSize: '0.85rem', lineHeight: '1.5' }}>
              {getModelTypeTooltip(tooltipState.type)}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Mode selection removed */}
      <AnimatePresence>
        {false && (
        <motion.div
          initial={{ opacity: 0, scale: 0.8, y: -20 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.8, y: -20 }}
          style={{
            position: 'fixed',
            top: '50%',
            left: '50%',
            transform: 'translate(-50%, -50%)',
            background: 'rgba(0, 0, 0, 0.95)',
            border: '2px solid rgba(0, 255, 255, 0.5)',
            borderRadius: '12px',
            padding: '20px 24px',
            zIndex: 10002,
            boxShadow: '0 8px 32px rgba(0, 255, 255, 0.3)',
            minWidth: '280px',
            maxWidth: '320px',
            textAlign: 'center',
          }}
          onClick={(e) => e.stopPropagation()}
        >
          <div style={{ color: '#ffffff', fontSize: '1rem', lineHeight: '1.5' }}>
            <div style={{ marginBottom: '12px', color: '#00FFFF', fontSize: '1.1rem', fontWeight: '600' }}>
              Mode Required
            </div>
            <div style={{ color: '#cccccc' }}>
              Please select a mode before submitting your prompt.
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
    </>
  )
}

export default MainView

