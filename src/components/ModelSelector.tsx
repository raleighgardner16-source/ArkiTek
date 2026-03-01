import type React from 'react';
import { useState, useEffect, useRef, useMemo } from 'react'
import { createPortal } from 'react-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { Send, Check, XCircle, Sparkles, Info, ChevronDown, Swords } from 'lucide-react'
import { useStore } from '../store/useStore'
import { getAllModels } from '../services/llmProviders'
import { DEBATE_ROLES, getRoleByKey } from '../utils/debateRoles'
import api from '../utils/api'
import ModelTypeTooltip from './ModelTypeTooltip'
import { spacing, fontSize, fontWeight, radius, zIndex, transition, layout, sx, createStyles } from '../utils/styles'

interface Props {
  currentTheme: any
  onSubmit: () => void
  isSubmitPending: boolean
  setIsSubmitPending: (v: boolean) => void
  isLoading: boolean
  isGeneratingSummary: boolean
  showNoModelNotification: boolean
  setShowNoModelNotification: (v: boolean) => void
  responses: any[]
}

const ModelSelector = ({
  currentTheme,
  onSubmit,
  isSubmitPending,
  setIsSubmitPending,
  isLoading,
  isGeneratingSummary,
  showNoModelNotification,
  setShowNoModelNotification,
  responses,
}: Props) => {
  const selectedModels = useStore((s) => s.selectedModels)
  const setSelectedModels = useStore((s) => s.setSelectedModels)
  const autoSmartProviders = useStore((s) => s.autoSmartProviders)
  const setAutoSmartProviders = useStore((s) => s.setAutoSmartProviders)
  const currentPrompt = useStore((s) => s.currentPrompt)
  const promptMode = useStore((s) => s.promptMode)
  const modelRoles = useStore((s) => s.modelRoles)
  const setModelRole = useStore((s) => s.setModelRole)
  const currentUser = useStore((s) => s.currentUser)

  const s = createStyles(currentTheme)
  const allModels = getAllModels()
  const availableModels = allModels

  const modelsByProvider: Record<string, { providerName: string; models: any[]; isPlaceholder?: boolean }> = availableModels.reduce((acc: Record<string, { providerName: string; models: any[]; isPlaceholder?: boolean }>, model: any) => {
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

  const providerOrder = ['openai', 'anthropic', 'google', 'xai']

  const sortedProviders: Array<[string, { providerName: string; models: any[]; isPlaceholder?: boolean }]> = Object.entries(modelsByProvider).sort((a, b) => {
    const indexA = providerOrder.indexOf(a[0].toLowerCase())
    const indexB = providerOrder.indexOf(b[0].toLowerCase())
    if (indexA === -1 && indexB === -1) return 0
    if (indexA === -1) return 1
    if (indexB === -1) return -1
    return indexA - indexB
  })

  const [expandedProviders, setExpandedProviders] = useState<Record<string, boolean>>({})
  const [openRoleDropdown, setOpenRoleDropdown] = useState<string | null>(null)
  const [roleTooltip, setRoleTooltip] = useState<{ visible: boolean; roleKey: string | null; x: number; y: number }>({ visible: false, roleKey: null, x: 0, y: 0 })
  const roleDropdownRef = useRef<HTMLDivElement>(null)

  const debateRoleEntries = useMemo(() => {
    if (promptMode !== 'debate') return [] as Array<{ key: string; label: string; roleStoreKey: string }>
    const entries: Array<{ key: string; label: string; roleStoreKey: string }> = []
    const coveredProviders = new Set()

    selectedModels.forEach((modelId) => {
      const modelInfo = allModels.find(m => m.id === modelId)
      if (modelInfo) coveredProviders.add(modelInfo.provider)
      entries.push({
        key: modelId,
        label: modelInfo?.providerName || modelId,
        roleStoreKey: modelId,
      })
    })

    Object.entries(autoSmartProviders).forEach(([providerKey, enabled]) => {
      if (!enabled || coveredProviders.has(providerKey)) return
      const providerData = modelsByProvider[providerKey]
      entries.push({
        key: `autoSmart-${providerKey}`,
        label: providerData?.providerName || providerKey,
        roleStoreKey: `autoSmart-${providerKey}`,
      })
    })

    return entries
  }, [promptMode, selectedModels, autoSmartProviders, allModels, modelsByProvider])

  const [dropdownPositions, setDropdownPositions] = useState<Record<string, { top: number; left: number; width: number; positionAbove: boolean }>>({})
  const isAnyProviderExpanded = Object.values(expandedProviders).some(v => v)
  const [tooltipState, setTooltipState] = useState<{ show: boolean; type: string | null; x: number; y: number }>({ show: false, type: null, x: 0, y: 0 })
  const dropdownRefs = useRef<Record<string, HTMLDivElement>>({})
  const providerButtonRefs = useRef<Record<string, HTMLButtonElement>>({})
  const tooltipTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Auto-assign default 'neutral' role when entering debate mode
  useEffect(() => {
    if (promptMode === 'debate') {
      selectedModels.forEach((modelId) => {
        if (!modelRoles[modelId]) {
          setModelRole(modelId, 'neutral')
        }
      })
      Object.entries(autoSmartProviders).forEach(([providerKey, enabled]) => {
        const autoKey = `autoSmart-${providerKey}`
        if (enabled && !modelRoles[autoKey]) {
          setModelRole(autoKey, 'neutral')
        }
      })
    }
  }, [promptMode, selectedModels, autoSmartProviders])

  const handleArrowClick = (providerKey: string, e: React.MouseEvent) => {
    e.stopPropagation()
    e.preventDefault()

    const isCurrentlyExpanded = expandedProviders[providerKey]

    const buttonRef = providerButtonRefs.current[providerKey]
    if (buttonRef && !isCurrentlyExpanded) {
      const rect = buttonRef.getBoundingClientRect()
      const providerData = sortedProviders.find(([key]) => key === providerKey)?.[1]
      const estimatedHeight = providerData ? (providerData.models.length * 60) + 50 + 24 : 300
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

    setExpandedProviders((prev) => {
      const wasExpanded = prev[providerKey]
      if (wasExpanded) {
        return {}
      } else {
      return { [providerKey]: true }
      }
    })
  }

  const handleProviderTabClick = (providerKey: string, e: React.MouseEvent) => {
    if ((e.target as HTMLElement).closest('[data-arrow-wrapper]')) {
      return
    }

    e.preventDefault()
    e.stopPropagation()

    const providerData = modelsByProvider[providerKey]
    if (!providerData) {
      console.warn('[handleProviderTabClick] Provider data not found for:', providerKey)
      return
    }

    const selectedFromProvider = providerData.models.filter(model =>
      selectedModels.includes(model.id)
    )

    const isAutoSmartEnabled = autoSmartProviders[providerKey] || false

    if (selectedFromProvider.length > 0 || isAutoSmartEnabled) {
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
    } else {
      const newSelectedModels = selectedModels.filter(id =>
        !providerData.models.some(model => model.id === id)
      )
      setSelectedModels(newSelectedModels)

      setAutoSmartProviders((prev) => ({
        ...prev,
        [providerKey]: true,
      }))
    }
  }

  const toggleAutoSmart = (providerKey: string, e: React.MouseEvent | React.ChangeEvent) => {
    e.stopPropagation()
    const isCurrentlyEnabled = autoSmartProviders[providerKey] || false

    if (isCurrentlyEnabled) {
      const providerData = modelsByProvider[providerKey]
      if (providerData) {
        const newSelectedModels = selectedModels.filter(id =>
          !providerData.models.some(model => model.id === id)
        )
        setSelectedModels(newSelectedModels)
      }
    } else {
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

    setExpandedProviders({})
  }

  const toggleModel = (modelId: string) => {
    const model = availableModels.find(m => m.id === modelId)
    if (!model || !model.provider) return

    const providerKey = model.provider

    if (selectedModels.includes(modelId)) {
      setSelectedModels(selectedModels.filter((id) => id !== modelId))
    } else {
      const replacedModelId = selectedModels.find(id => {
        const m = availableModels.find(am => am.id === id)
        return m && m.provider === providerKey
      })
      const newSelectedModels = selectedModels.filter(id => {
        const m = availableModels.find(am => am.id === id)
        return !m || m.provider !== providerKey
      })

      setSelectedModels([...newSelectedModels, modelId])

      if (promptMode === 'debate') {
        const inheritedRole = replacedModelId ? (modelRoles[replacedModelId] || 'neutral') : 'neutral'
        setModelRole(modelId, inheritedRole)
      }

      setAutoSmartProviders((prev) => {
        const newState = { ...prev }
        delete newState[providerKey]
        return newState
      })
    }

    setExpandedProviders({})
  }

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const clickedButton = Object.values(providerButtonRefs.current).some((ref) => {
        if (!ref) return false
        return ref.contains(event.target as Node)
      })

      const clickedDropdown = Object.values(dropdownRefs.current).some((ref) => {
        if (!ref) return false
        return ref.contains(event.target as Node)
      })

      const clickedArrow = (event.target as HTMLElement).closest('[data-arrow-wrapper]')

      if (!clickedButton && !clickedDropdown && !clickedArrow) {
        setExpandedProviders({})
      }
    }

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

  useEffect(() => {
    if (!openRoleDropdown) return
    const handleClick = (e: MouseEvent) => {
      if (roleDropdownRef.current && !roleDropdownRef.current.contains(e.target as Node)) {
        setOpenRoleDropdown(null)
        setRoleTooltip({ visible: false, roleKey: null, x: 0, y: 0 })
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [openRoleDropdown])

  // Recalculate dropdown positions after expanding
  useEffect(() => {
    if (!isAnyProviderExpanded) return

    const timer = setTimeout(() => {
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
    }, 50)

    return () => clearTimeout(timer)
  }, [isAnyProviderExpanded, expandedProviders])

  const handleTooltipShow = (e: React.MouseEvent, type: string) => {
    if (tooltipTimeoutRef.current) {
      clearTimeout(tooltipTimeoutRef.current)
    }
    const rect = e.currentTarget.getBoundingClientRect()
    const tooltipWidth = 280
    const padding = 10
    const windowWidth = window.innerWidth

    const spaceToRight = windowWidth - rect.right
    const spaceToLeft = rect.left

    let x, y

    if (spaceToRight >= tooltipWidth + padding) {
      x = rect.right + padding
      y = rect.top
    } else if (spaceToLeft >= tooltipWidth + padding) {
      x = rect.left - tooltipWidth - padding
      y = rect.top
    } else {
      x = Math.max(padding, Math.min(rect.right + padding, windowWidth - tooltipWidth - padding))
      y = rect.top
    }

    setTooltipState({
      show: true,
      type,
      x,
      y,
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

  // Restore saved model preferences on sign-in
  const modelPrefsRestoredForUserRef = useRef<string | null>(null)
  useEffect(() => {
    if (Object.keys(modelsByProvider).length === 0) return
    const restoreKey = currentUser?.id || 'guest'
    if (modelPrefsRestoredForUserRef.current === restoreKey) return

    const hasStorePrefs = selectedModels.length > 0 || Object.keys(autoSmartProviders).length > 0
    const applyDefaultAutoSmart = () => {
      const autoSmartState: Record<string, boolean> = {}
      Object.keys(modelsByProvider).forEach(providerKey => {
        autoSmartState[providerKey] = true
      })
      setSelectedModels([])
      setAutoSmartProviders(autoSmartState)
      localStorage.setItem('arktek-models-initialized', 'true')
    }

    if (hasStorePrefs) {
      modelPrefsRestoredForUserRef.current = restoreKey
      return
    }

    let cancelled = false
    const restoreModelPrefs = async () => {
      if (currentUser?.id) {
        try {
          const response = await api.get(`/user/model-preferences/${currentUser.id}`)
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
        } catch (error: any) {
          console.error('[Model Prefs] Error loading preferences:', error.message)
          applyDefaultAutoSmart()
        } finally {
          if (!cancelled) modelPrefsRestoredForUserRef.current = restoreKey
        }
        return
      }

      applyDefaultAutoSmart()
      modelPrefsRestoredForUserRef.current = restoreKey
    }

    restoreModelPrefs()

    return () => {
      cancelled = true
    }
  }, [modelsByProvider, currentUser?.id, selectedModels, autoSmartProviders, setSelectedModels, setAutoSmartProviders])

  // Debounced save of model preferences
  const savePrefsTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  useEffect(() => {
    if (!currentUser?.id) return
    if (modelPrefsRestoredForUserRef.current !== currentUser.id) return

    if (savePrefsTimeoutRef.current) clearTimeout(savePrefsTimeoutRef.current)
    savePrefsTimeoutRef.current = setTimeout(() => {
      api.put('/user/model-preferences', {
        selectedModels,
        autoSmartProviders,
      }).catch(err => console.error('[Model Prefs] Error saving:', err.message))
    }, 1500)

    return () => {
      if (savePrefsTimeoutRef.current) clearTimeout(savePrefsTimeoutRef.current)
    }
  }, [selectedModels, autoSmartProviders, currentUser?.id])

  const sendButton = (() => {
    const hasAutoSmart = Object.values(autoSmartProviders).some(enabled => enabled)
    const hasModels = selectedModels.length > 0 || hasAutoSmart
    const canSubmit = currentPrompt.trim() && hasModels
    const hasPromptOnly = currentPrompt.trim() && !hasModels
    const isProcessing = isSubmitPending || isLoading || isGeneratingSummary

    return (
      <div style={sx(layout.flexRow, { position: 'relative', gap: spacing.sm })}>
      <motion.button
        onClick={() => {
          if (isProcessing) return
          if (canSubmit) {
            setIsSubmitPending(true)
            onSubmit()
          } else if (hasPromptOnly) {
            setShowNoModelNotification(true)
            setTimeout(() => setShowNoModelNotification(false), 4000)
          }
        }}
          style={sx(layout.center, {
          width: spacing['4xl'],
          height: spacing['4xl'],
          padding: 0,
          background: canSubmit
            ? (promptMode === 'debate' ? (currentTheme.name === 'dark' ? '#E74C3C' : '#c0392b') : currentTheme.accent)
            : hasPromptOnly ? currentTheme.warning : currentTheme.borderLight,
          border: 'none',
          borderRadius: radius.md,
          color: canSubmit || hasPromptOnly ? '#fff' : currentTheme.textMuted,
          cursor: (!isProcessing && (canSubmit || hasPromptOnly)) ? 'pointer' : 'not-allowed',
          transition: transition.normal,
          opacity: isProcessing ? 0.55 : 1,
        })}
        whileHover={(!isProcessing && (canSubmit || hasPromptOnly)) ? { scale: 1.1 } : {}}
        whileTap={(!isProcessing && (canSubmit || hasPromptOnly)) ? { scale: 0.9 } : {}}
        title="Send"
      >
        <Send size={14} />
      </motion.button>
      </div>
    )
  })()

  const portalContent = (
    <>
      {/* Provider Models Dropdowns */}
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
                  borderRadius: radius.xl,
                  padding: spacing.lg,
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
                  style={sx(layout.flexRow, {
                    gap: '10px',
                    padding: '10px',
                    background: autoSmartProviders[providerKey]
                      ? 'rgba(72, 201, 176, 0.1)'
                      : currentTheme.buttonBackground,
                    border: autoSmartProviders[providerKey]
                      ? '1px solid rgba(72, 201, 176, 0.5)'
                      : `1px solid ${currentTheme.border}`,
                    borderRadius: radius.sm,
                    cursor: 'pointer',
                    transition: transition.normal,
                    marginBottom: spacing.md,
                  })}
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
                  <div style={{ flex: 1, color: currentTheme.textSecondary, fontSize: fontSize.lg, fontWeight: fontWeight.medium }}>
                    Auto Select
                  </div>
                  {autoSmartProviders[providerKey] && (
                    <Check size={16} color={currentTheme.accentSecondary} style={{ flexShrink: 0 }} />
                  )}
                </label>

                  <div style={sx(layout.flexCol, { gap: spacing.md })}>
                  {providerData.models.map((model) => {
                    const isSelected = selectedModels.includes(model.id)
                    return (
                      <label
                        key={model.id}
                        style={sx(layout.flexRow, {
                          gap: '10px',
                          padding: spacing.lg,
                          minHeight: '48px',
                          background: isSelected
                            ? 'rgba(93, 173, 226, 0.2)'
                            : 'rgba(93, 173, 226, 0.05)',
                          border: isSelected
                            ? '1px solid rgba(93, 173, 226, 0.5)'
                            : '1px solid rgba(93, 173, 226, 0.2)',
                          borderRadius: radius.sm,
                          cursor: 'pointer',
                          transition: transition.normal,
                        })}
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
                        <div style={sx(layout.flexRow, { flex: 1, gap: spacing.md, flexWrap: 'wrap' })}>
                          <div style={{ color: currentTheme.textSecondary, fontSize: fontSize.lg, fontWeight: fontWeight.medium }}>
                          {model.model}
                          </div>
                          {model.type && model.label && (
                            <>
                              <span style={{
                                color: currentTheme.accent,
                                fontSize: '0.75rem',
                                fontWeight: fontWeight.medium
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

      {/* Model Type Tooltip */}
      <ModelTypeTooltip
        tooltipState={tooltipState}
        currentTheme={currentTheme}
        onMouseEnter={() => {
          if (tooltipTimeoutRef.current) {
            clearTimeout(tooltipTimeoutRef.current)
          }
        }}
        onMouseLeave={handleTooltipHide}
      />

      {/* No Model Selected Notification */}
      <AnimatePresence>
        {showNoModelNotification && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowNoModelNotification(false)}
              style={sx(layout.fixedFill, {
                background: 'rgba(0, 0, 0, 0.3)',
                zIndex: 10002,
              })}
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
                borderRadius: radius.xl,
                padding: `${spacing['3xl']} 32px`,
                zIndex: 10003,
                boxShadow: `0 8px 32px ${currentTheme.shadow}`,
                minWidth: '320px',
                maxWidth: '400px',
                textAlign: 'center',
              }}
              onClick={() => setShowNoModelNotification(false)}
            >
            <div style={sx(layout.flexCol, {
              color: currentTheme.text,
              fontSize: fontSize['2xl'],
              lineHeight: '1.6',
              alignItems: 'center',
              gap: spacing.lg,
            })}>
              <div style={{
                color: currentTheme.accent,
                fontSize: fontSize['4xl'],
                fontWeight: fontWeight.semibold,
                marginBottom: spacing.xs,
              }}>
                Select a Model First
              </div>
              <div style={{ color: currentTheme.textSecondary }}>
                Please select at least one provider model or enable Auto Select before submitting your prompt.
              </div>
              <button
                onClick={() => setShowNoModelNotification(false)}
                style={{
                  marginTop: spacing.md,
                  padding: `${spacing.md} ${spacing['2xl']}`,
                  background: currentTheme.buttonBackground,
                  border: `1px solid ${currentTheme.border}`,
                  borderRadius: radius.sm,
                  color: currentTheme.text,
                  cursor: 'pointer',
                  fontSize: fontSize.lg,
                  transition: transition.normal,
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

      {/* Role Tooltip */}
      {roleTooltip.visible && (() => {
        const role = getRoleByKey(roleTooltip.roleKey!)
        if (!role) return null
        const tooltipWidth = 240
        const tooltipX = roleTooltip.x + tooltipWidth > window.innerWidth
          ? roleTooltip.x - tooltipWidth - 24
          : roleTooltip.x
        const tooltipY = roleTooltip.y < 10 ? 10 : roleTooltip.y
        return (
          <div
            style={{
              position: 'fixed',
              left: tooltipX,
              top: tooltipY,
              width: tooltipWidth,
              padding: `10px ${spacing.lg}`,
              borderRadius: radius.md,
              background: currentTheme.name === 'dark' ? '#1a1a2e' : '#fff',
              border: `1px solid ${currentTheme.borderLight}`,
              boxShadow: '0 8px 24px rgba(0,0,0,0.3)',
              zIndex: zIndex.modal,
              pointerEvents: 'none',
            }}
          >
            <div style={{
              fontSize: fontSize.sm,
              fontWeight: fontWeight.semibold,
              color: currentTheme.accent,
              marginBottom: spacing.xs,
            }}>
              {role.label}
            </div>
            <div style={{
              fontSize: '0.72rem',
              color: currentTheme.textSecondary,
              lineHeight: '1.5',
            }}>
              {role.description}
            </div>
          </div>
        )
      })()}
    </>
  )

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
        `}
      </style>

      {/* Bottom bar: provider buttons + send */}
      <div style={sx(layout.spaceBetween, {
        padding: `${spacing.sm} ${spacing.lg} 10px ${spacing.lg}`,
        gap: spacing.md,
      })}>
        {/* Left side: placeholder */}
        <div style={sx(layout.flexRow, { gap: spacing.sm, flexShrink: 0 })}>
        </div>

        {/* Right side: provider buttons + send */}
        <div style={sx(layout.flexRow, { gap: spacing.sm, flexWrap: 'wrap', justifyContent: 'flex-end' })}>
          {availableModels.length > 0 && sortedProviders.map(([providerKey, providerData]) => {
          const isPlaceholder = providerData.isPlaceholder || false
            if (isPlaceholder) return null
              const hasSelectedModels = providerData.models.some(m => selectedModels.includes(m.id))
          const hasAutoSmart = autoSmartProviders[providerKey] || false
            const isActive = hasSelectedModels || hasAutoSmart
            const isExpanded = expandedProviders[providerKey]

          return (
              <div key={providerKey} style={sx(layout.flexRow, { position: 'relative' })}>
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
                style={sx(layout.flexRow, {
                    gap: spacing.xs,
                    padding: `5px ${spacing.md}`,
                    height: spacing['4xl'],
                    background: isActive
                      ? (currentTheme.name === 'dark' ? 'rgba(255, 255, 255, 0.10)' : 'rgba(44, 82, 130, 0.08)')
                      : 'transparent',
                    border: `1px solid ${isActive ? (currentTheme.name === 'dark' ? 'rgba(255, 255, 255, 0.30)' : 'rgba(44, 82, 130, 0.30)') : currentTheme.borderLight}`,
                    borderRadius: radius.md,
                    color: isActive ? (currentTheme.name === 'dark' ? '#fff' : '#1a365d') : currentTheme.textSecondary,
                    cursor: 'pointer',
                    fontSize: fontSize.md,
                    fontWeight: isActive ? fontWeight.semibold : fontWeight.medium,
                    whiteSpace: 'nowrap',
                  transition: transition.fast,
                      outline: 'none',
                      WebkitTapHighlightColor: 'transparent',
                    boxShadow: 'none',
                  })}
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
                    style={sx(layout.center, {
                      cursor: 'pointer',
                      flexShrink: 0,
                      padding: '0 1px',
                      marginLeft: spacing['2xs'],
                      borderLeft: `1px solid ${isActive ? (currentTheme.name === 'dark' ? 'rgba(255,255,255,0.15)' : 'rgba(0,0,0,0.1)') : currentTheme.borderLight}`,
                      paddingLeft: spacing.xs,
                    })}
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
          {sendButton}
                </div>
          </div>

      {/* Debate Mode: Role Assignment */}
      {promptMode === 'debate' && debateRoleEntries.length > 0 && responses.length === 0 && (
        <div style={{
          padding: `${spacing.md} 14px 10px 14px`,
          borderTop: `1px solid ${currentTheme.name === 'dark' ? 'rgba(255, 140, 50, 0.15)' : 'rgba(200, 80, 30, 0.10)'}`,
          overflow: 'visible',
        }}>
          <div style={sx(layout.flexRow, {
            gap: spacing.sm,
            marginBottom: spacing.sm,
          })}>
            <Swords size={12} style={{ color: currentTheme.name === 'dark' ? '#ffb36b' : '#c05a1c' }} />
            <span style={{
              fontSize: '0.72rem',
              fontWeight: fontWeight.semibold,
              color: currentTheme.textSecondary,
              textTransform: 'uppercase',
              letterSpacing: '0.5px',
            }}>
              Assign Roles
            </span>
          </div>
          <div style={sx(layout.flexCol, { gap: '5px' })}>
            {debateRoleEntries.map(({ key, label, roleStoreKey }) => {
              const currentRole = modelRoles[roleStoreKey] || 'neutral'
              const currentRoleDef = getRoleByKey(currentRole)
              const isOpen = openRoleDropdown === roleStoreKey
              return (
                <div
                  key={key}
                  style={sx(layout.flexRow, {
                    gap: spacing.md,
                    padding: `5px ${spacing.md}`,
                    borderRadius: radius.md,
                    background: currentTheme.name === 'dark' ? 'rgba(255, 255, 255, 0.03)' : 'rgba(0, 0, 0, 0.02)',
                  })}
                >
                  <span style={{
                    fontSize: '0.78rem',
                    fontWeight: fontWeight.medium,
                    color: currentTheme.text,
                    minWidth: '100px',
                    flexShrink: 0,
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}>
                    {label}
                  </span>
                  <div
                    ref={isOpen ? roleDropdownRef : undefined}
                    style={{ position: 'relative', flex: 1 }}
                  >
                    <button
                      onClick={() => setOpenRoleDropdown(isOpen ? null : roleStoreKey)}
                      style={{
                        width: '100%',
                        padding: `${spacing.xs} 28px ${spacing.xs} ${spacing.md}`,
                        borderRadius: radius.sm,
                        border: `1px solid ${isOpen ? currentTheme.accent : currentTheme.borderLight}`,
                        backgroundColor: currentTheme.name === 'dark' ? 'rgba(255, 255, 255, 0.06)' : 'rgba(255, 255, 255, 0.9)',
                        color: currentTheme.text,
                        fontSize: fontSize.sm,
                        fontWeight: fontWeight.medium,
                        cursor: 'pointer',
                        outline: 'none',
                        textAlign: 'left',
                        backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='${currentTheme.name === 'dark' ? '%23999' : '%23666'}' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='M6 9l6 6 6-6'/%3E%3C/svg%3E")`,
                        backgroundRepeat: 'no-repeat',
                        backgroundPosition: 'right 6px center',
                      }}
                    >
                      {currentRoleDef?.label || 'Select role'}
                    </button>
                    {isOpen && (
                      <div style={{
                        position: 'absolute',
                        bottom: '100%',
                        left: 0,
                        right: 0,
                        marginBottom: spacing.xs,
                        borderRadius: radius.md,
                        border: `1px solid ${currentTheme.borderLight}`,
                        background: currentTheme.name === 'dark' ? '#1a1a2e' : '#fff',
                        boxShadow: '0 8px 24px rgba(0,0,0,0.3)',
                        zIndex: 1000,
                        maxHeight: '260px',
                        overflowY: 'auto',
                        padding: spacing.xs,
                      }}>
                        {DEBATE_ROLES.map((role) => (
                          <div
                            key={role.key}
                            onClick={() => {
                              setModelRole(roleStoreKey, role.key)
                              setOpenRoleDropdown(null)
                              setRoleTooltip({ visible: false, roleKey: null, x: 0, y: 0 })
                            }}
                            style={sx(layout.spaceBetween, {
                              padding: '7px 10px',
                              borderRadius: radius.sm,
                              cursor: 'pointer',
                              background: role.key === currentRole
                                ? (currentTheme.name === 'dark' ? 'rgba(147, 130, 220, 0.15)' : 'rgba(107, 70, 193, 0.08)')
                                : 'transparent',
                              transition: 'background 0.15s',
                            })}
                            onMouseEnter={(e) => {
                              if (role.key !== currentRole) {
                                e.currentTarget.style.background = currentTheme.name === 'dark' ? 'rgba(255, 255, 255, 0.06)' : 'rgba(0, 0, 0, 0.04)'
                              }
                            }}
                            onMouseLeave={(e) => {
                              if (role.key !== currentRole) {
                                e.currentTarget.style.background = 'transparent'
                              }
                            }}
                          >
                            <span style={{
                              fontSize: fontSize.sm,
                              fontWeight: role.key === currentRole ? fontWeight.semibold : fontWeight.normal,
                              color: role.key === currentRole
                                ? (currentTheme.name === 'dark' ? '#b8a9e8' : '#6b46c1')
                                : currentTheme.text,
                            }}>
                              {role.label}
                            </span>
                            <div
                              onClick={(e) => e.stopPropagation()}
                              onMouseEnter={(e) => {
                                const rect = e.currentTarget.getBoundingClientRect()
                                setRoleTooltip({
                                  visible: true,
                                  roleKey: role.key,
                                  x: rect.right + 8,
                                  y: rect.top - 4,
                                })
                              }}
                              onMouseLeave={() => {
                                setRoleTooltip({ visible: false, roleKey: null, x: 0, y: 0 })
                              }}
                              style={{
                                padding: spacing['2xs'],
                                cursor: 'help',
                                flexShrink: 0,
                              }}
                            >
                              <Info
                                size={13}
                                style={{
                                  color: currentTheme.textMuted,
                                  opacity: 0.5,
                                }}
                              />
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {createPortal(portalContent, document.body)}
    </>
  )
}

export default ModelSelector
