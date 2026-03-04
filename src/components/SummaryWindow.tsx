import React, { useState, useEffect } from 'react'
import { motion } from 'framer-motion'
import { X, FileText, Move, Maximize2, ChevronRight, ChevronDown, Send, Search, Globe } from 'lucide-react'
import { useStore } from '../store/useStore'
import { getTheme } from '../utils/theme'
import api from '../utils/api'
import { API_URL, API_PREFIX } from '../utils/config'
import { streamFetch } from '../utils/streamFetch'
import { spacing, fontSize, fontWeight, radius, zIndex, transition, layout, sx, createStyles } from '../utils/styles'

const SummaryWindow = () => {
  const getProviderName = (modelName: string) => {
    const name = (modelName || '').toLowerCase()
    if (name.includes('gpt')) return 'Chatgpt'
    if (name.includes('claude')) return 'Claude'
    if (name.includes('gemini')) return 'Gemini'
    if (name.includes('grok')) return 'Grok'
    if (name.includes('llama')) return 'Meta'
    if (name.includes('deepseek')) return 'DeepSeek'
    if (name.includes('mistral')) return 'Mistral'
    return 'Model'
  }
  const summary = useStore((state) => state.summary)
  const clearSummary = useStore((state) => state.clearSummary)
  const isSummaryMinimized = useStore((state) => state.isSummaryMinimized)
  const setSummaryMinimized = useStore((state) => state.setSummaryMinimized)
  const activeTab = useStore((state) => state.activeTab)
  const currentUser = useStore((state) => state.currentUser)
  const setSummary = useStore((state) => state.setSummary)
  const searchSources = useStore((state) => state.searchSources)
  const theme = useStore((state) => state.theme || 'dark')
  const currentTheme = getTheme(theme)
  const s = createStyles(currentTheme)
  const [position, setPosition] = useState({ x: 0, y: 0 })
  const [isDragging, setIsDragging] = useState(false)
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 })
  const [isInitialized, setIsInitialized] = useState(false)
  const [isMaximized, setIsMaximized] = useState(true)
  const [conversationInput, setConversationInput] = useState('')
  const [isSendingMessage, setIsSendingMessage] = useState(false)
  const [conversationContext, setConversationContext] = useState<any[]>([])
  const [isSearchingInConvo, setIsSearchingInConvo] = useState(false)
  const [convoSources, setConvoSources] = useState<Record<number, any[]>>({})
  const [showConvoSources, setShowConvoSources] = useState<Record<string | number, boolean>>({})
  const lastSubmittedPrompt = useStore((state) => state.lastSubmittedPrompt || '')
  const lastSubmittedCategory = useStore((state) => state.lastSubmittedCategory || '')
  const prevSummaryRef = React.useRef<string | null>(null)
  const convoEndRef = React.useRef<HTMLDivElement>(null)
  const summaryContainerRef = React.useRef<HTMLDivElement>(null)
  const prevConvoLengthRef = React.useRef(0)

  React.useEffect(() => {
    const convoLen = summary?.conversationHistory?.length || 0
    if (convoLen > prevConvoLengthRef.current) {
      setTimeout(() => {
        if (summaryContainerRef.current) {
          summaryContainerRef.current.scrollTo({ top: summaryContainerRef.current.scrollHeight, behavior: 'smooth' })
        }
      }, 150)
    }
    prevConvoLengthRef.current = convoLen
  }, [summary?.conversationHistory?.length])
  
  const handleClearSummary = () => {
    clearSummary()
    if (currentUser?.id) {
      api.post('/judge/clear-context').catch(err => console.error('[Clear Context] Error:', err))
      api.post('/model/clear-context').catch(err => console.error('[Clear Model Context] Error:', err))
    }
  }
  
  useEffect(() => {
    if (activeTab !== 'home' && summary) {
      setSummaryMinimized(true)
    }
  }, [activeTab, summary, setSummaryMinimized])

  useEffect(() => {
    if (summary && activeTab === 'home') {
      if (prevSummaryRef.current !== summary.text) {
        setSummaryMinimized(false)
        setTimeout(() => {
        setIsMaximized(true)
        }, 0)
        setIsInitialized(false)
        prevSummaryRef.current = summary.text
      }
    }
  }, [summary, activeTab, setSummaryMinimized])

  useEffect(() => {
    if (summary && currentUser?.id && !isSummaryMinimized) {
      fetchConversationContext()
    }
  }, [summary, currentUser, isSummaryMinimized])

  const fetchConversationContext = async () => {
    if (!currentUser?.id) return
    try {
      const response = await api.get('/judge/context')
      setConversationContext(response.data.context || [])
    } catch (error: any) {
      console.error('[SummaryWindow] Error fetching conversation context:', error)
      setConversationContext([])
    }
  }

  const handleSendMessage = async () => {
    if (!conversationInput.trim() || !currentUser?.id || isSendingMessage) return
    
    setIsSendingMessage(true)
    setIsSearchingInConvo(false)
    const userMsg = conversationInput.trim()
    setConversationInput('')
    
    const initialSummary = summary.initialSummary || summary.text
    
    setSummary((prev: any) => ({
      ...prev,
      text: '',
      summary: '',
      initialSummary,
      prompt: `${prev.prompt || ''}\n\nUser: ${userMsg}`,
      conversationHistory: [...(prev.conversationHistory || []), {
        user: userMsg,
        assistant: '',
        timestamp: Date.now()
      }]
    }))
    
    try {
      const finalData = await streamFetch(`${API_URL}${API_PREFIX}/judge/conversation/stream`, {
        userMessage: userMsg,
        conversationContext,
        originalSummaryText: summary.initialSummary || summary.text || ''
      }, {
        onToken: (token) => {
          setIsSearchingInConvo(false)
          setSummary((prev: any) => {
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
          console.error('[SummaryWindow] Stream error:', message)
        }
      })
      
      if (finalData) {
        if (finalData.searchResults && finalData.searchResults.length > 0) {
          const turnIndex = (summary.conversationHistory || []).length
          setConvoSources(prev => ({ ...prev, [turnIndex]: finalData.searchResults }))
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
              const contextResponse = await api.get('/judge/context')
              const updatedContext = contextResponse.data.context || []
              store.setRAGDebugData({
                ...ragDebugData,
                conversationContext: updatedContext
              })
            } catch (error: any) {
              console.error('[SummaryWindow] Error updating debug pipeline context:', error)
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
    } catch (error: any) {
      console.error('[SummaryWindow] Error sending message:', error)
      setConversationInput(userMsg)
      setSummary((prev: any) => ({
        ...prev,
        text: initialSummary,
        summary: initialSummary,
        conversationHistory: (prev.conversationHistory || []).slice(0, -1)
      }))
      alert('Failed to send message. Please try again.')
    } finally {
      setIsSendingMessage(false)
      setIsSearchingInConvo(false)
    }
  }

  useEffect(() => {
    if (isSummaryMinimized && isMaximized) {
      setIsMaximized(false)
    }
  }, [isSummaryMinimized, isMaximized])

  useEffect(() => {
    if (summary && !isInitialized) {
      const windowWidth = window.innerWidth
      const windowHeight = window.innerHeight
      const popupWidth = Math.min(550, windowWidth * 0.9)
      const popupHeight = Math.min(500, windowHeight * 0.7)
      
      const centerX = Math.max(80, (windowWidth - popupWidth) / 2)
      const centerY = Math.max(80, (windowHeight - popupHeight) / 3)
      
      setPosition({ x: centerX, y: centerY })
      setIsInitialized(true)
    }
  }, [summary, isInitialized])

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (isDragging && dragOffset.x !== undefined && dragOffset.y !== undefined) {
        const newX = e.clientX - dragOffset.x
        const newY = e.clientY - dragOffset.y
        setPosition({ x: newX, y: newY })
      }
    }

    const handleMouseUp = () => {
      setIsDragging(false)
      setDragOffset({ x: 0, y: 0 })
      document.body.style.userSelect = ''
      document.body.style.cursor = ''
    }

    if (isDragging) {
      window.addEventListener('mousemove', handleMouseMove, true)
      window.addEventListener('mouseup', handleMouseUp, true)
      document.body.style.userSelect = 'none'
      document.body.style.cursor = 'grabbing'
      
      return () => {
        window.removeEventListener('mousemove', handleMouseMove, true)
        window.removeEventListener('mouseup', handleMouseUp, true)
        document.body.style.userSelect = ''
        document.body.style.cursor = ''
      }
    }
  }, [isDragging, dragOffset])

  const handleDragStart = (e: React.MouseEvent) => {
    const rect = e.currentTarget.getBoundingClientRect()
    const offsetX = e.clientX - rect.left
    const offsetY = e.clientY - rect.top
    
    setIsDragging(true)
    setDragOffset({ x: offsetX, y: offsetY })
  }

  const getConsensusColor = (score: number): string => {
    if (score >= 80) return '#22c55e'
    if (score >= 60) return '#3b82f6'
    if (score >= 40) return '#eab308'
    if (score >= 20) return '#f97316'
    return '#ef4444'
  }

  const renderStructuredSummaryText = (text: string, size: string, lineHeight: number) => {
    const content = (text || '').toString()
    if (!content.trim()) return null

    const headerPattern = /^(CONSENSUS|SUMMARY|AGREEMENTS|CONTRADICTIONS|DIFFERENCES)\b:?/i
    const consensusPattern = /^CONSENSUS[:\s-]*(\d+)\s*%?/i
    const lines = content.split('\n')

    return lines.map((line, index) => {
      const normalizedLine = line.replace(/^\s*#{1,6}\s*/, '')
      const isHeader = headerPattern.test(normalizedLine.trim())
      const consensusMatch = normalizedLine.trim().match(consensusPattern)
      const consensusScore = consensusMatch ? parseInt(consensusMatch[1], 10) : null
      const consensusColor = consensusScore !== null ? getConsensusColor(consensusScore) : null

      return (
        <div
          key={`summary-line-${index}`}
          style={{
            color: consensusColor || currentTheme.textSecondary,
            fontSize: isHeader ? '1.05rem' : size,
            lineHeight,
            fontWeight: isHeader ? fontWeight.bold : fontWeight.normal,
            textTransform: isHeader ? 'uppercase' : 'none',
            margin: isHeader ? `${spacing.md} 0 ${spacing['2xs']} 0` : '0',
            minHeight: line.trim() === '' ? `${lineHeight}em` : 'auto',
            whiteSpace: 'pre-wrap',
          }}
        >
          {isHeader ? normalizedLine : line}
        </div>
      )
    })
  }

  useEffect(() => {
  }, [summary])

  if (!summary) {
    return null
  }

  if (activeTab === 'home') {
    return null
  }

  const cardWidth = '270px'

  if (summary?.singleModel) {
    return null
  }

  if (isSummaryMinimized && activeTab === 'home') {
    return (
      <div
        style={{
          position: 'fixed',
          top: 'calc(50% - 87px)',
          left: '75px',
          width: `calc(${cardWidth} + ${spacing.lg})`,
          overflow: 'visible',
          pointerEvents: 'auto',
          zIndex: 140,
        }}
      >
        <div
          style={{
            position: 'relative',
            width: '100%',
            minWidth: cardWidth,
            maxWidth: cardWidth,
            overflow: 'visible',
            pointerEvents: 'auto',
          }}
        >
          <button
            onClick={(e) => {
              e.stopPropagation()
              handleClearSummary()
            }}
            style={sx(layout.center, {
              position: 'absolute',
              top: `-${spacing.sm}`,
              right: `-${spacing.sm}`,
              width: spacing['3xl'],
              height: spacing['3xl'],
              borderRadius: radius.circle,
              border: 'none',
              background: theme === 'light' ? '#ffffff' : currentTheme.backgroundOverlayLight,
              cursor: 'pointer',
              padding: 0,
              zIndex: 1001,
              pointerEvents: 'auto',
              boxShadow: theme === 'light' ? '0 0 10px rgba(0, 0, 0, 0.2)' : '0 0 10px rgba(255, 255, 255, 0.4)',
            })}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = 'rgba(255, 0, 0, 0.3)'
              e.currentTarget.style.boxShadow = theme === 'light' ? '0 0 15px rgba(0, 0, 0, 0.3)' : '0 0 15px rgba(255, 255, 255, 0.5)'
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = theme === 'light' ? '#ffffff' : currentTheme.backgroundOverlayLight
              e.currentTarget.style.boxShadow = theme === 'light' ? '0 0 10px rgba(0, 0, 0, 0.2)' : '0 0 10px rgba(255, 255, 255, 0.4)'
            }}
            title="Close"
          >
            <X size={16} color={currentTheme.text} />
          </button>
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            style={{
              width: '100%',
              minWidth: cardWidth,
              maxWidth: cardWidth,
              background: theme === 'light' ? '#ffffff' : currentTheme.backgroundOverlayLight,
              border: `1px solid ${currentTheme.borderLight}`,
              borderRadius: radius.xl,
              padding: '0',
              boxShadow: `0 0 20px ${currentTheme.shadowLight}`,
              cursor: 'pointer',
              pointerEvents: 'auto',
              position: 'relative',
              zIndex: 1000,
            }}
            onClick={(e) => {
              e.stopPropagation()
              setSummaryMinimized(false)
              setIsMaximized(true)
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.borderColor = currentTheme.borderActive
              e.currentTarget.style.boxShadow = `0 0 30px ${currentTheme.shadow}`
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.borderColor = currentTheme.borderLight
              e.currentTarget.style.boxShadow = `0 0 20px ${currentTheme.shadowLight}`
            }}
          >
            <div style={sx(layout.spaceBetween, { padding: `${spacing.lg} ${spacing.xl}` })}>
              <div style={sx(layout.flexRow, { gap: spacing.md })}>
                <FileText size={16} color={currentTheme.accent} />
                <h3
                  key={`summary-title-${theme}`}
                  style={sx(s.gradientText, {
                    fontSize: fontSize.lg,
                    margin: 0,
                    fontWeight: fontWeight.medium,
                  })}
                >
                  {summary.singleModel ? 'Response' : 'Summary'}
                </h3>
              </div>
              <ChevronRight size={16} color={currentTheme.accent} style={{ marginRight: spacing['2xl'] }} />
            </div>
          </motion.div>
        </div>
      </div>
    )
  }
  
  if (isSummaryMinimized && activeTab !== 'home') {
    return null
  }

  if ((!summary.text || summary.text.trim() === '') && !summary.isStreaming) {
    return (
      <motion.div
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        style={{
          position: 'fixed',
          left: `${position.x}px`,
          top: `${position.y}px`,
          width: '90%',
          maxWidth: '900px',
          background: 'rgba(0, 0, 0, 0.95)',
          border: '1px solid rgba(255, 0, 0, 0.3)',
          borderRadius: radius['2xl'],
          padding: spacing['4xl'],
          zIndex: zIndex.popup,
        }}
      >
        <p style={{ color: '#ff6666' }}>Summary text is empty. Check console for errors.</p>
      </motion.div>
    )
  }

  if (isMaximized) {
    return (
      <div
        style={sx(layout.center, {
          position: 'fixed',
          top: 0,
          left: 0,
          width: '100vw',
          height: '100vh',
          background: theme === 'light' ? 'rgba(255, 255, 255, 0.98)' : 'rgba(0, 0, 0, 0.95)',
          zIndex: zIndex.popup,
          padding: spacing['5xl'],
        })}
        onClick={() => {
          setIsMaximized(false)
        }}
      >
        <motion.div
          ref={summaryContainerRef}
          initial={{ scale: 0.9, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          onClick={(e) => e.stopPropagation()}
          style={{
            background: currentTheme.backgroundOverlay,
            border: `1px solid ${currentTheme.border}`,
            borderRadius: radius['2xl'],
            padding: `${spacing['4xl']} ${spacing['4xl']} 44px`,
            maxWidth: '900px',
            width: '100%',
            maxHeight: '80vh',
            overflowY: 'auto',
            position: 'relative',
            boxShadow: `0 0 40px ${currentTheme.shadow}`,
          }}
        >
          <button
            onClick={() => {
              setIsMaximized(false)
            }}
            style={sx(layout.center, {
              position: 'absolute',
              top: spacing['2xl'],
              right: spacing['2xl'],
              background: 'rgba(255, 0, 0, 0.1)',
              border: '1px solid rgba(255, 0, 0, 0.3)',
              borderRadius: radius.md,
              padding: spacing.md,
              color: currentTheme.error,
              cursor: 'pointer',
              zIndex: zIndex.base,
            })}
            title="Close"
          >
            <X size={20} />
          </button>

          <div
            style={{
              padding: spacing['2xl'],
              background: currentTheme.buttonBackground,
              border: `1px solid ${currentTheme.borderLight}`,
              borderRadius: radius.xl,
            }}
          >
            {summary.singleModel && summary.modelName && (
              <h3
                key={`model-name-maximized-${theme}`}
                style={sx(s.gradientText, {
                  fontSize: fontSize['4xl'],
                  margin: `0 0 ${spacing.xl} 0`,
                })}
              >
                {summary.modelName}
              </h3>
            )}
            
            {/* Original User Prompt */}
            {summary.originalPrompt && (
              <div style={{
                display: 'flex',
                justifyContent: 'flex-end',
                marginBottom: spacing.xl,
              }}>
                <div style={{
                  background: currentTheme.accentGradient,
                  borderRadius: `${radius.xl} ${radius.xl} ${radius.xs} ${radius.xl}`,
                  padding: `${spacing.lg} ${spacing.xl}`,
                  maxWidth: '80%',
                }}>
                  <div style={{
                    fontSize: '0.75rem',
                    fontWeight: fontWeight.semibold,
                    color: theme === 'light' ? 'rgba(255,255,255,0.8)' : 'rgba(0,0,0,0.6)',
                    marginBottom: spacing.xs,
                    textTransform: 'uppercase',
                    letterSpacing: '0.5px',
                  }}>
                    You
                  </div>
                  <p style={{
                    color: theme === 'light' ? '#ffffff' : '#000000',
                    lineHeight: '1.6',
                    fontSize: fontSize.xl,
                    whiteSpace: 'pre-wrap',
                    margin: 0,
                  }}>
                    {summary.originalPrompt}
                  </p>
                </div>
              </div>
            )}
            
            {/* Initial Summary/Response */}
            <div style={{
              background: currentTheme.buttonBackground,
              borderRadius: `${radius.xl} ${radius.xl} ${radius.xl} ${radius.xs}`,
              padding: spacing.xl,
              marginBottom: spacing.xl,
              border: `1px solid ${currentTheme.borderLight}`,
              maxWidth: '85%',
            }}>
              {summary.singleModel
                ? (
                  <p
                    style={{
                      color: currentTheme.textSecondary,
                      lineHeight: '1.8',
                      fontSize: fontSize['2xl'],
                      whiteSpace: 'pre-wrap',
                      margin: 0,
                      fontStyle: 'normal',
                    }}
                  >
                    {summary.summary || 'No summary content available.'}
                  </p>
                )
                : renderStructuredSummaryText(summary.initialSummary || summary.text || 'No summary content available.', fontSize['2xl'], 1.8)}
            </div>

            {/* Initial Sources */}
            {(() => {
              if (!searchSources || !Array.isArray(searchSources) || searchSources.length === 0) return null
              const toggleKey = 'initial'
              return (
                <div style={{ marginTop: spacing.lg, marginBottom: spacing.lg }}>
                  <button
                    onClick={() => setShowConvoSources(prev => ({ ...prev, [toggleKey]: !prev[toggleKey] }))}
                    style={sx(layout.flexRow, {
                      gap: spacing.sm, padding: `${spacing.sm} ${spacing.lg}`,
                      background: showConvoSources[toggleKey] ? `${currentTheme.accent}15` : currentTheme.buttonBackground,
                      border: `1px solid ${showConvoSources[toggleKey] ? currentTheme.accent : currentTheme.borderLight}`,
                      borderRadius: radius.md, color: currentTheme.accent, fontSize: fontSize.md, fontWeight: fontWeight.medium,
                      cursor: 'pointer', transition: transition.normal,
                    })}
                  >
                    <Globe size={14} />
                    Sources ({searchSources.length})
                    <ChevronDown size={14} style={{ transform: showConvoSources[toggleKey] ? 'rotate(180deg)' : 'rotate(0deg)', transition: 'transform 0.2s' }} />
                  </button>
                  {showConvoSources[toggleKey] && (
                    <motion.div
                      initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }}
                      style={sx(layout.flexCol, { marginTop: spacing.md, gap: spacing.sm, maxHeight: '200px', overflowY: 'auto' })}
                    >
                      {searchSources.map((source, sIdx) => (
                        <a key={sIdx} href={source.link} target="_blank" rel="noopener noreferrer"
                          style={{ display: 'block', padding: `${spacing.md} ${spacing.lg}`, background: currentTheme.buttonBackground, border: `1px solid ${currentTheme.borderLight}`, borderRadius: radius.md, textDecoration: 'none', transition: 'border-color 0.2s' }}
                          onMouseEnter={(e) => { e.currentTarget.style.borderColor = currentTheme.accent }}
                          onMouseLeave={(e) => { e.currentTarget.style.borderColor = currentTheme.borderLight }}
                        >
                          <div style={{ fontSize: fontSize.md, fontWeight: fontWeight.semibold, color: currentTheme.accent, marginBottom: spacing['2xs'], overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{source.title}</div>
                          <div style={{ fontSize: fontSize.xs, color: currentTheme.textMuted, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{source.link}</div>
                          {source.snippet && (<div style={{ fontSize: '0.75rem', color: currentTheme.textSecondary, marginTop: spacing.xs, lineHeight: '1.4', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{source.snippet}</div>)}
                        </a>
                      ))}
                    </motion.div>
                  )}
                </div>
              )
            })()}
            
            {/* Conversation History */}
            {summary.conversationHistory && summary.conversationHistory.length > 0 && (
              <div style={sx(layout.flexCol, { gap: spacing.xl })}>
                {summary.conversationHistory.map((exchange: any, index: number) => (
                  <div key={index} style={sx(layout.flexCol, { gap: spacing.lg })}>
                    {/* User Message */}
                    <div style={{
                      display: 'flex',
                      justifyContent: 'flex-end',
                    }}>
                      <div style={{
                        background: currentTheme.accentGradient,
                        borderRadius: `${radius.xl} ${radius.xl} ${radius.xs} ${radius.xl}`,
                        padding: `${spacing.lg} ${spacing.xl}`,
                        maxWidth: '80%',
                      }}>
                        <div style={{
                          fontSize: '0.75rem',
                          fontWeight: fontWeight.semibold,
                          color: theme === 'light' ? 'rgba(255,255,255,0.8)' : 'rgba(0,0,0,0.6)',
                          marginBottom: spacing.xs,
                          textTransform: 'uppercase',
                          letterSpacing: '0.5px',
                        }}>
                          You
                        </div>
                        <p style={{
                          color: theme === 'light' ? '#ffffff' : '#000000',
                          lineHeight: '1.6',
                          fontSize: fontSize.xl,
                          whiteSpace: 'pre-wrap',
                          margin: 0,
                        }}>
                          {exchange.user}
                        </p>
                      </div>
                    </div>
                    
                    {/* Assistant Response */}
                    <div style={{
                      display: 'flex',
                      justifyContent: 'flex-start',
                    }}>
                      <div style={{
                        background: currentTheme.buttonBackground,
                        borderRadius: `${radius.xl} ${radius.xl} ${radius.xl} ${radius.xs}`,
                        padding: `${spacing.lg} ${spacing.xl}`,
                        maxWidth: '85%',
                        border: `1px solid ${currentTheme.borderLight}`,
                      }}>
                        <div style={{
                          fontSize: '0.75rem',
                          fontWeight: fontWeight.semibold,
                          color: currentTheme.accent,
                          marginBottom: spacing.sm,
                          textTransform: 'uppercase',
                          letterSpacing: '0.5px',
                        }}>
                          Response
                        </div>
                        <p style={{
                          color: currentTheme.textSecondary,
                          lineHeight: '1.7',
                          fontSize: fontSize.xl,
                          whiteSpace: 'pre-wrap',
                          margin: 0,
                        }}>
                          {exchange.assistant || exchange.judge}
                        </p>
                      </div>
                    </div>
                    {/* Per-turn Sources Tab (maximized summary) */}
                    {(() => {
                      const turnSources = convoSources[index]
                      if (!turnSources || turnSources.length === 0) return null
                      return (
                        <div style={{ marginTop: spacing.md, marginBottom: spacing.xs }}>
                          <button
                            onClick={() => setShowConvoSources(prev => ({ ...prev, [index]: !prev[index] }))}
                            style={sx(layout.flexRow, {
                              gap: spacing.sm, padding: `5px 10px`,
                              background: showConvoSources[index] ? `${currentTheme.accent}15` : currentTheme.buttonBackground,
                              border: `1px solid ${showConvoSources[index] ? currentTheme.accent : currentTheme.borderLight}`,
                              borderRadius: radius.md, color: currentTheme.accent, fontSize: '0.75rem', fontWeight: fontWeight.medium,
                              cursor: 'pointer', transition: transition.normal,
                            })}
                          >
                            <Globe size={12} />
                            Sources ({turnSources.length})
                            <ChevronDown size={12} style={{ transform: showConvoSources[index] ? 'rotate(180deg)' : 'rotate(0deg)', transition: 'transform 0.2s' }} />
                          </button>
                          {showConvoSources[index] && (
                            <motion.div
                              initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }}
                              style={sx(layout.flexCol, { marginTop: spacing.sm, gap: spacing.xs, maxHeight: '180px', overflowY: 'auto' })}
                            >
                              {turnSources.map((source, sIdx) => (
                                <a key={sIdx} href={source.link} target="_blank" rel="noopener noreferrer"
                                  style={{ display: 'block', padding: `${spacing.sm} 10px`, background: currentTheme.buttonBackground, border: `1px solid ${currentTheme.borderLight}`, borderRadius: radius.sm, textDecoration: 'none', transition: 'border-color 0.2s' }}
                                  onMouseEnter={(e) => { e.currentTarget.style.borderColor = currentTheme.accent }}
                                  onMouseLeave={(e) => { e.currentTarget.style.borderColor = currentTheme.borderLight }}
                                >
                                  <div style={{ fontSize: '0.75rem', fontWeight: fontWeight.semibold, color: currentTheme.accent, marginBottom: spacing['2xs'], overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{source.title}</div>
                                  <div style={{ fontSize: fontSize['2xs'], color: currentTheme.textMuted, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{source.link}</div>
                                  {source.snippet && (<div style={{ fontSize: fontSize.xs, color: currentTheme.textSecondary, marginTop: '3px', lineHeight: '1.4', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{source.snippet}</div>)}
                                </a>
                              ))}
                            </motion.div>
                          )}
                        </div>
                      )
                    })()}
                  </div>
                ))}
              </div>
            )}
            
            {/* Fetching Response Indicator */}
            {isSendingMessage && (
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                style={sx(layout.flexRow, {
                  gap: '10px',
                  padding: `${spacing.lg} ${spacing.xl}`,
                  marginTop: spacing.xl,
                })}
              >
                <motion.div
                  animate={{ rotate: 360 }}
                  transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
                  style={{
                    width: spacing.xl,
                    height: spacing.xl,
                    border: `2px solid ${currentTheme.borderLight}`,
                    borderTop: `2px solid ${currentTheme.accent}`,
                    borderRadius: radius.circle,
                    flexShrink: 0,
                  }}
                />
                <span style={{
                  fontSize: fontSize.base,
                  color: currentTheme.textMuted,
                  fontStyle: 'italic',
                }}>
                  Loading summary model's response...
                </span>
              </motion.div>
            )}

            <div ref={convoEndRef} />

            {/* Conversation Input */}
            {!summary.singleModel && (
              <div style={{ marginTop: spacing['2xl'], paddingTop: spacing['2xl'], borderTop: `1px solid ${currentTheme.borderLight}` }}>
                {/* Web Search Indicator */}
                {isSearchingInConvo && (
                  <motion.div
                    initial={{ opacity: 0, y: 5 }}
                    animate={{ opacity: 1, y: 0 }}
                    style={sx(layout.flexRow, {
                      gap: spacing.sm,
                      marginBottom: '10px',
                      padding: `${spacing.sm} ${spacing.lg}`,
                      background: currentTheme.buttonBackground,
                      borderRadius: radius.sm,
                      width: 'fit-content',
                    })}
                  >
                    <Search size={14} color={currentTheme.accent} />
                    <span style={sx(s.gradientText, {
                      fontSize: fontSize.base,
                    })}>
                      Searching the web
                    </span>
                    <motion.span
                      animate={{ opacity: [1, 0.3, 1] }}
                      transition={{
                        duration: 1.5,
                        repeat: Infinity,
                        ease: 'easeInOut'
                      }}
                      style={sx(s.gradientText)}
                    >
                      ...
                    </motion.span>
                  </motion.div>
                )}
                <div style={{ display: 'flex', gap: spacing.md, alignItems: 'flex-end' }}>
                  <textarea
                    value={conversationInput}
                    onChange={(e) => setConversationInput(e.target.value)}
                    onKeyPress={(e) => {
                      if (e.key === 'Enter' && !e.shiftKey) {
                        e.preventDefault()
                        handleSendMessage()
                      }
                    }}
                    placeholder="Continue conversation with Judge Model..."
                    disabled={isSendingMessage}
                    style={{
                      flex: 1,
                      minHeight: '100px',
                      maxHeight: '200px',
                      padding: '14px',
                      background: currentTheme.buttonBackground,
                      border: `1px solid ${currentTheme.borderLight}`,
                      borderRadius: radius.lg,
                      color: currentTheme.text,
                      fontSize: fontSize['2xl'],
                      resize: 'vertical',
                      fontFamily: 'inherit',
                      outline: 'none',
                    }}
                  />
                  <button
                    onClick={handleSendMessage}
                    disabled={!conversationInput.trim() || isSendingMessage}
                    style={sx(layout.flexRow, {
                      padding: `${spacing.lg} ${spacing['3xl']}`,
                      background: conversationInput.trim() && !isSendingMessage ? currentTheme.accentGradient : 'rgba(128, 128, 128, 0.3)',
                      border: 'none',
                      borderRadius: radius.md,
                      color: conversationInput.trim() && !isSendingMessage ? (theme === 'light' ? '#ffffff' : '#000000') : currentTheme.textMuted,
                      fontSize: fontSize.lg,
                      fontWeight: fontWeight.medium,
                      cursor: conversationInput.trim() && !isSendingMessage ? 'pointer' : 'not-allowed',
                      gap: spacing.md,
                      whiteSpace: 'nowrap',
                    })}
                  >
                    <Send size={18} />
                    {isSendingMessage ? 'Sending...' : 'Send'}
                  </button>
                </div>
              </div>
            )}
          </div>
        </motion.div>
      </div>
    )
  }

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.9 }}
      animate={{ 
        opacity: 1, 
        scale: 1,
      }}
      exit={{ opacity: 0, scale: 0.9 }}
      ref={summaryContainerRef}
      style={{
        position: 'fixed',
        left: `${position.x}px`,
        top: `${position.y}px`,
        width: '90%',
        maxWidth: '550px',
        maxHeight: '70vh',
        background: currentTheme.backgroundOverlay,
        border: `1px solid ${currentTheme.border}`,
        borderRadius: radius['2xl'],
        padding: `${spacing['4xl']} ${spacing['4xl']} 44px`,
        zIndex: zIndex.popup,
        boxShadow: `0 0 40px ${currentTheme.shadow}`,
        overflowY: 'auto',
        cursor: isDragging ? 'grabbing' : 'default',
        transform: 'none',
      }}
    >
      {/* Header - Draggable Area */}
      <div
        onMouseDown={handleDragStart}
        style={sx(layout.spaceBetween, {
          marginBottom: spacing['3xl'],
          paddingBottom: spacing.xl,
          borderBottom: `1px solid ${currentTheme.borderLight}`,
          cursor: isDragging ? 'grabbing' : 'grab',
          userSelect: 'none',
        })}
      >
        <div style={sx(layout.flexRow, { gap: spacing.lg })}>
          <Move size={20} color={currentTheme.accent} style={{ opacity: 0.6 }} />
        </div>
        <div style={sx(layout.flexRow, { gap: spacing.md })}>
          <button
            onClick={(e) => {
              e.stopPropagation()
              setIsMaximized(true)
            }}
            onMouseDown={(e) => e.stopPropagation()}
            style={sx(layout.center, {
              background: currentTheme.buttonBackground,
              border: `1px solid ${currentTheme.borderLight}`,
              borderRadius: radius.md,
              padding: spacing.md,
              color: currentTheme.accent,
              cursor: 'pointer',
              zIndex: zIndex.base,
            })}
            title="Maximize"
          >
            <Maximize2 size={20} />
          </button>
          <button
            onClick={(e) => {
              e.stopPropagation()
              handleClearSummary()
            }}
            onMouseDown={(e) => e.stopPropagation()}
            style={sx(layout.center, {
              background: 'rgba(255, 0, 0, 0.1)',
              border: '1px solid rgba(255, 0, 0, 0.3)',
              borderRadius: radius.md,
              padding: spacing.md,
              color: '#FF0000',
              cursor: 'pointer',
              zIndex: zIndex.base,
            })}
            title="Close"
          >
            <X size={20} />
          </button>
        </div>
      </div>

      {/* Summary Content */}
      <div
        style={{
          padding: spacing['2xl'],
          background: currentTheme.buttonBackground,
          border: `1px solid ${currentTheme.borderLight}`,
          borderRadius: radius.xl,
        }}
      >
        {/* Original User Prompt */}
        {summary.originalPrompt && (
          <div style={{
            display: 'flex',
            justifyContent: 'flex-end',
            marginBottom: '14px',
          }}>
            <div style={{
              background: currentTheme.accentGradient,
              borderRadius: `${radius.lg} ${radius.lg} ${radius.xs} ${radius.lg}`,
              padding: '10px 14px',
              maxWidth: '85%',
            }}>
              <div style={{
                fontSize: fontSize.xs,
                fontWeight: fontWeight.semibold,
                color: theme === 'light' ? 'rgba(255,255,255,0.8)' : 'rgba(0,0,0,0.6)',
                marginBottom: spacing.xs,
                textTransform: 'uppercase',
                letterSpacing: '0.5px',
              }}>
                You
              </div>
              <p style={{
                color: theme === 'light' ? '#ffffff' : '#000000',
                lineHeight: '1.5',
                fontSize: fontSize.lg,
                whiteSpace: 'pre-wrap',
                margin: 0,
              }}>
                {summary.originalPrompt}
              </p>
            </div>
          </div>
        )}
        
        {/* Initial Summary/Response */}
        <div style={{
          background: theme === 'light' ? 'rgba(0, 150, 200, 0.05)' : 'rgba(93, 173, 226, 0.05)',
          borderRadius: `${radius.lg} ${radius.lg} ${radius.lg} ${radius.xs}`,
          padding: '14px',
          marginBottom: '14px',
          border: `1px solid ${currentTheme.borderLight}`,
          maxWidth: '90%',
        }}>
          {summary.singleModel
            ? (
              <p
                style={{
                  color: currentTheme.textSecondary,
                  lineHeight: '1.7',
                  fontSize: fontSize.xl,
                  whiteSpace: 'pre-wrap',
                  margin: 0,
                  fontStyle: 'normal',
                }}
              >
                {summary.summary || 'No summary content available.'}
              </p>
            )
            : renderStructuredSummaryText(summary.initialSummary || summary.text || 'No summary content available.', fontSize.xl, 1.7)}
        </div>

        {/* Initial Sources (minimized) */}
        {(() => {
          if (!searchSources || !Array.isArray(searchSources) || searchSources.length === 0) return null
          const toggleKey = 'initial'
          return (
            <div style={{ marginTop: spacing.md, marginBottom: spacing.lg }}>
              <button
                onClick={() => setShowConvoSources(prev => ({ ...prev, [toggleKey]: !prev[toggleKey] }))}
                style={sx(layout.flexRow, {
                  gap: spacing.sm, padding: `5px 10px`,
                  background: showConvoSources[toggleKey] ? `${currentTheme.accent}15` : currentTheme.buttonBackground,
                  border: `1px solid ${showConvoSources[toggleKey] ? currentTheme.accent : currentTheme.borderLight}`,
                  borderRadius: radius.md, color: currentTheme.accent, fontSize: '0.75rem', fontWeight: fontWeight.medium,
                  cursor: 'pointer', transition: transition.normal,
                })}
              >
                <Globe size={12} />
                Sources ({searchSources.length})
                <ChevronDown size={12} style={{ transform: showConvoSources[toggleKey] ? 'rotate(180deg)' : 'rotate(0deg)', transition: 'transform 0.2s' }} />
              </button>
              {showConvoSources[toggleKey] && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }}
                  style={sx(layout.flexCol, { marginTop: spacing.sm, gap: spacing.xs, maxHeight: '180px', overflowY: 'auto' })}
                >
                  {searchSources.map((source, sIdx) => (
                    <a key={sIdx} href={source.link} target="_blank" rel="noopener noreferrer"
                      style={{ display: 'block', padding: `${spacing.sm} 10px`, background: currentTheme.buttonBackground, border: `1px solid ${currentTheme.borderLight}`, borderRadius: radius.sm, textDecoration: 'none', transition: 'border-color 0.2s' }}
                      onMouseEnter={(e) => { e.currentTarget.style.borderColor = currentTheme.accent }}
                      onMouseLeave={(e) => { e.currentTarget.style.borderColor = currentTheme.borderLight }}
                    >
                      <div style={{ fontSize: '0.75rem', fontWeight: fontWeight.semibold, color: currentTheme.accent, marginBottom: spacing['2xs'], overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{source.title}</div>
                      <div style={{ fontSize: fontSize['2xs'], color: currentTheme.textMuted, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{source.link}</div>
                      {source.snippet && (<div style={{ fontSize: fontSize.xs, color: currentTheme.textSecondary, marginTop: '3px', lineHeight: '1.4', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{source.snippet}</div>)}
                    </a>
                  ))}
                </motion.div>
              )}
            </div>
          )
        })()}
        
        {/* Conversation History */}
        {summary.conversationHistory && summary.conversationHistory.length > 0 && (
          <div style={sx(layout.flexCol, { gap: '14px', marginBottom: '14px' })}>
            {summary.conversationHistory.map((exchange: any, index: number) => (
              <div key={index} style={sx(layout.flexCol, { gap: '10px' })}>
                {/* User Message */}
                <div style={{
                  display: 'flex',
                  justifyContent: 'flex-end',
                }}>
                  <div style={{
                    background: currentTheme.accentGradient,
                    borderRadius: `${radius.lg} ${radius.lg} ${radius.xs} ${radius.lg}`,
                    padding: '10px 14px',
                    maxWidth: '85%',
                  }}>
                    <div style={{
                      fontSize: fontSize.xs,
                      fontWeight: fontWeight.semibold,
                      color: theme === 'light' ? 'rgba(255,255,255,0.8)' : 'rgba(0,0,0,0.6)',
                      marginBottom: spacing.xs,
                      textTransform: 'uppercase',
                      letterSpacing: '0.5px',
                    }}>
                      You
                    </div>
                    <p style={{
                      color: theme === 'light' ? '#ffffff' : '#000000',
                      lineHeight: '1.5',
                      fontSize: fontSize.lg,
                      whiteSpace: 'pre-wrap',
                      margin: 0,
                    }}>
                      {exchange.user}
                    </p>
                  </div>
                </div>
                
                {/* Assistant Response */}
                <div style={{
                  display: 'flex',
                  justifyContent: 'flex-start',
                }}>
                  <div style={{
                    background: theme === 'light' ? 'rgba(0, 150, 200, 0.05)' : 'rgba(93, 173, 226, 0.05)',
                    borderRadius: `${radius.lg} ${radius.lg} ${radius.lg} ${radius.xs}`,
                    padding: '10px 14px',
                    maxWidth: '90%',
                    border: `1px solid ${currentTheme.borderLight}`,
                  }}>
                    <div style={{
                      fontSize: fontSize.xs,
                      fontWeight: fontWeight.semibold,
                      color: currentTheme.accent,
                      marginBottom: spacing.xs,
                      textTransform: 'uppercase',
                      letterSpacing: '0.5px',
                    }}>
                      Assistant
                    </div>
                    <p style={{
                      color: currentTheme.textSecondary,
                      lineHeight: '1.6',
                      fontSize: fontSize.lg,
                      whiteSpace: 'pre-wrap',
                      margin: 0,
                    }}>
                      {exchange.assistant || exchange.judge}
                    </p>
                  </div>
                </div>
                {/* Per-turn Sources Tab (minimized summary) */}
                {(() => {
                  const turnSources = convoSources[index]
                  if (!turnSources || turnSources.length === 0) return null
                  return (
                    <div style={{ marginTop: spacing.sm, marginBottom: spacing.xs }}>
                      <button
                        onClick={() => setShowConvoSources(prev => ({ ...prev, [index]: !prev[index] }))}
                        style={sx(layout.flexRow, {
                          gap: '5px', padding: `${spacing.xs} ${spacing.md}`,
                          background: showConvoSources[index] ? `${currentTheme.accent}15` : currentTheme.buttonBackground,
                          border: `1px solid ${showConvoSources[index] ? currentTheme.accent : currentTheme.borderLight}`,
                          borderRadius: radius.sm, color: currentTheme.accent, fontSize: fontSize.xs, fontWeight: fontWeight.medium,
                          cursor: 'pointer', transition: transition.normal,
                        })}
                      >
                        <Globe size={11} />
                        Sources ({turnSources.length})
                        <ChevronDown size={11} style={{ transform: showConvoSources[index] ? 'rotate(180deg)' : 'rotate(0deg)', transition: 'transform 0.2s' }} />
                      </button>
                      {showConvoSources[index] && (
                        <motion.div
                          initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }}
                          style={sx(layout.flexCol, { marginTop: spacing.xs, gap: '3px', maxHeight: '150px', overflowY: 'auto' })}
                        >
                          {turnSources.map((source, sIdx) => (
                            <a key={sIdx} href={source.link} target="_blank" rel="noopener noreferrer"
                              style={{ display: 'block', padding: `5px ${spacing.md}`, background: currentTheme.buttonBackground, border: `1px solid ${currentTheme.borderLight}`, borderRadius: '5px', textDecoration: 'none', transition: 'border-color 0.2s' }}
                              onMouseEnter={(e) => { e.currentTarget.style.borderColor = currentTheme.accent }}
                              onMouseLeave={(e) => { e.currentTarget.style.borderColor = currentTheme.borderLight }}
                            >
                              <div style={{ fontSize: fontSize.xs, fontWeight: fontWeight.semibold, color: currentTheme.accent, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{source.title}</div>
                              <div style={{ fontSize: '0.6rem', color: currentTheme.textMuted, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{source.link}</div>
                            </a>
                          ))}
                        </motion.div>
                      )}
                    </div>
                  )
                })()}
              </div>
            ))}
          </div>
        )}
        
        {/* Fetching Response Indicator */}
        {isSendingMessage && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            style={sx(layout.flexRow, {
              gap: '10px',
              padding: `${spacing.lg} ${spacing.xl}`,
              marginTop: spacing.lg,
            })}
          >
            <motion.div
              animate={{ rotate: 360 }}
              transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
              style={{
                width: spacing.xl,
                height: spacing.xl,
                border: `2px solid ${currentTheme.borderLight}`,
                borderTop: `2px solid ${currentTheme.accent}`,
                borderRadius: radius.circle,
                flexShrink: 0,
              }}
            />
            <span style={{
              fontSize: fontSize.base,
              color: currentTheme.textMuted,
              fontStyle: 'italic',
            }}>
              Loading summary model's response...
            </span>
          </motion.div>
        )}

        <div ref={convoEndRef} />

        {/* Conversation Input */}
        {!summary.singleModel && (
          <div style={{ paddingTop: '14px', borderTop: `1px solid ${currentTheme.borderLight}` }}>
            {/* Web Search Indicator */}
            {isSearchingInConvo && (
              <motion.div
                initial={{ opacity: 0, y: 5 }}
                animate={{ opacity: 1, y: 0 }}
                style={sx(layout.flexRow, {
                  gap: spacing.sm,
                  marginBottom: '10px',
                  padding: `${spacing.sm} ${spacing.lg}`,
                  background: currentTheme.buttonBackground,
                  borderRadius: radius.sm,
                  width: 'fit-content',
                })}
              >
                <Search size={14} color={currentTheme.accent} />
                <span style={sx(s.gradientText, {
                  fontSize: fontSize.base,
                })}>
                  Searching the web
                </span>
                <motion.span
                  animate={{ opacity: [1, 0.3, 1] }}
                  transition={{
                    duration: 1.5,
                    repeat: Infinity,
                    ease: 'easeInOut'
                  }}
                  style={sx(s.gradientText)}
                >
                  ...
                </motion.span>
              </motion.div>
            )}
            <div style={{ display: 'flex', gap: spacing.md, alignItems: 'flex-end' }}>
              <textarea
                value={conversationInput}
                onChange={(e) => setConversationInput(e.target.value)}
                onKeyPress={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault()
                    handleSendMessage()
                  }
                }}
                placeholder="Continue conversation with Judge Model..."
                disabled={isSendingMessage}
                style={{
                  flex: 1,
                  minHeight: '100px',
                  maxHeight: '200px',
                  padding: '14px',
                  background: currentTheme.buttonBackground,
                  border: `1px solid ${currentTheme.borderLight}`,
                  borderRadius: radius.lg,
                  color: currentTheme.text,
                  fontSize: fontSize['2xl'],
                  resize: 'vertical',
                  fontFamily: 'inherit',
                  outline: 'none',
                }}
              />
              <button
                onClick={handleSendMessage}
                disabled={!conversationInput.trim() || isSendingMessage}
                style={sx(layout.flexRow, {
                  padding: `${spacing.lg} ${spacing['3xl']}`,
                  background: conversationInput.trim() && !isSendingMessage ? currentTheme.accentGradient : 'rgba(128, 128, 128, 0.3)',
                  border: 'none',
                  borderRadius: radius.md,
                  color: conversationInput.trim() && !isSendingMessage ? '#000000' : currentTheme.textMuted,
                  fontSize: fontSize.lg,
                  fontWeight: fontWeight.medium,
                  cursor: conversationInput.trim() && !isSendingMessage ? 'pointer' : 'not-allowed',
                  gap: spacing.md,
                  whiteSpace: 'nowrap',
                })}
              >
                <Send size={18} />
                {isSendingMessage ? 'Sending...' : 'Send'}
              </button>
            </div>
          </div>
        )}
      </div>
    </motion.div>
  )
}

export default SummaryWindow
