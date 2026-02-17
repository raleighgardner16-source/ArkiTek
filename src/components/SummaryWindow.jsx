import React, { useState, useEffect } from 'react'
import { motion } from 'framer-motion'
import { X, FileText, Move, Minimize2, Maximize2, ChevronRight, ChevronDown, Send, Search, Save, Info, Globe } from 'lucide-react'
import { useStore } from '../store/useStore'
import { getTheme } from '../utils/theme'
import axios from 'axios'
import { API_URL } from '../utils/config'
import { streamFetch } from '../utils/streamFetch'

const SummaryWindow = () => {
  const getProviderName = (modelName) => {
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
  const [position, setPosition] = useState({ x: 0, y: 0 })
  const [isDragging, setIsDragging] = useState(false)
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 })
  const [isInitialized, setIsInitialized] = useState(false)
  const [isMaximized, setIsMaximized] = useState(true) // Start maximized by default
  const [conversationInput, setConversationInput] = useState('')
  const [isSendingMessage, setIsSendingMessage] = useState(false)
  const [conversationContext, setConversationContext] = useState([])
  const [isSearchingInConvo, setIsSearchingInConvo] = useState(false)
  const [savingState, setSavingState] = useState('idle') // 'idle'|'saving'|'saved'
  const [showSaveTooltip, setShowSaveTooltip] = useState(false)
  const [convoSources, setConvoSources] = useState({}) // { turnIndex: [...sources] } — per-turn follow-up search results
  const [showConvoSources, setShowConvoSources] = useState({}) // { turnIndex: true/false } — per-turn toggle
  const lastSubmittedPrompt = useStore((state) => state.lastSubmittedPrompt || '')
  const lastSubmittedCategory = useStore((state) => state.lastSubmittedCategory || '')
  const prevSummaryRef = React.useRef(null)
  const convoEndRef = React.useRef(null) // Scroll anchor for auto-scrolling conversation
  const summaryContainerRef = React.useRef(null) // Scrollable container ref for auto-scrolling
  const prevConvoLengthRef = React.useRef(0) // Track previous conversation length

  // Auto-scroll summary container when new conversation messages are added
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
  
  // Helper function to clear summary and also clear judge + model context
  const handleClearSummary = () => {
    clearSummary()
    // Clear judge and model conversation context when closing summary window
    if (currentUser?.id) {
      axios.post(`${API_URL}/api/judge/clear-context`, {
        userId: currentUser.id
      }).catch(err => console.error('[Clear Context] Error:', err))
      axios.post(`${API_URL}/api/model/clear-context`, {
        userId: currentUser.id
      }).catch(err => console.error('[Clear Model Context] Error:', err))
    }
  }
  
  // Save this summary/judge response + conversation individually
  const handleSaveSummary = async () => {
    if (!currentUser?.id || !summary) return
    setSavingState('saving')
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
        sources: searchSources || [],
        conversationSources: convoSources || {},
      })
      setSavingState('saved')
    } catch (error) {
      console.error('[Save] Error saving summary:', error)
      if (error.response?.data?.alreadySaved) {
        setSavingState('saved')
      } else {
        alert('Failed to save. Please try again.')
        setSavingState('idle')
      }
    }
  }
  
  // Auto-minimize when user navigates away from home tab
  useEffect(() => {
    if (activeTab !== 'home' && summary) {
      setSummaryMinimized(true)
    }
  }, [activeTab, summary, setSummaryMinimized])

  // When summary first appears (new summary or page refresh), show it in maximized view
  // This applies to BOTH regular summaries AND single model responses
  useEffect(() => {
    if (summary && activeTab === 'home') {
      // Check if this is a new summary (different from previous)
      if (prevSummaryRef.current !== summary.text) {
        setSummaryMinimized(false) // Un-minimize first (store update)
        // Use a microtask to ensure isSummaryMinimized updates before setting isMaximized
        // This avoids the race condition where the "reset maximized when minimized" effect
        // sees stale isSummaryMinimized=true and clears isMaximized
        setTimeout(() => {
        setIsMaximized(true) // Show in maximized view by default (centered)
        }, 0)
        setIsInitialized(false) // Reset initialization so position recalculates for non-maximized view
        prevSummaryRef.current = summary.text
      }
    }
  }, [summary, activeTab, setSummaryMinimized])

  // Fetch conversation context when summary appears
  useEffect(() => {
    if (summary && currentUser?.id && !isSummaryMinimized) {
      fetchConversationContext()
    }
  }, [summary, currentUser, isSummaryMinimized])

  const fetchConversationContext = async () => {
    if (!currentUser?.id) return
    try {
      // Use query parameter to handle special characters (colons, etc.) better
      const response = await axios.get(`${API_URL}/api/judge/context`, {
        params: { userId: currentUser.id }
      })
      setConversationContext(response.data.context || [])
    } catch (error) {
      console.error('[SummaryWindow] Error fetching conversation context:', error)
      setConversationContext([])
    }
  }

  const handleSendMessage = async () => {
    if (!conversationInput.trim() || !currentUser?.id || isSendingMessage) return
    
    setIsSendingMessage(true)
    setIsSearchingInConvo(false)
    const userMsg = conversationInput.trim()
    setConversationInput('') // Clear input immediately for responsiveness
    
    // Preserve initial summary
    const initialSummary = summary.initialSummary || summary.text
    
    // Add user message to history immediately and set empty assistant placeholder
    setSummary(prev => ({
      ...prev,
      text: '', // Will be filled by streaming tokens
      summary: '',
      initialSummary: initialSummary,
      prompt: `${prev.prompt || ''}\n\nUser: ${userMsg}`,
      conversationHistory: [...(prev.conversationHistory || []), {
        user: userMsg,
        assistant: '', // Placeholder — will be updated as tokens stream in
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
          console.error('[SummaryWindow] Stream error:', message)
        }
      })
      
      // Handle final metadata from 'done' event
      if (finalData) {
        // Capture conversation sources keyed by turn index
        // NOTE: summary.conversationHistory in closure still has the OLD length (before the new turn was added)
        // so the new turn's index = oldLength (not oldLength - 1)
        if (finalData.searchResults && finalData.searchResults.length > 0) {
          const turnIndex = (summary.conversationHistory || []).length
          setConvoSources(prev => ({ ...prev, [turnIndex]: finalData.searchResults }))
        }
        
        const store = useStore.getState()
        if (finalData.debugData && finalData.usedSearch) {
          const existingDebugData = store.ragDebugData || {}
          store.setRAGDebugData({
            ...existingDebugData,
            search: finalData.debugData.search,
            refiner: finalData.debugData.refiner,
            categoryDetection: finalData.debugData.categoryDetection,
            conversationContext: existingDebugData.conversationContext || []
          })
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
              console.error('[SummaryWindow] Error updating debug pipeline context:', error)
            }
          }
        }, 500)
      }
    } catch (error) {
      console.error('[SummaryWindow] Error sending message:', error)
      // Restore the conversation input on error
      setConversationInput(userMsg)
      // Remove the placeholder history entry on error
      setSummary(prev => ({
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

  // Reset maximized state when minimized
  useEffect(() => {
    if (isSummaryMinimized && isMaximized) {
      setIsMaximized(false)
    }
  }, [isSummaryMinimized, isMaximized])

  // Initialize position to center of screen on first render / page refresh
  useEffect(() => {
    if (summary && !isInitialized) {
      const windowWidth = window.innerWidth
      const windowHeight = window.innerHeight
      const popupWidth = Math.min(550, windowWidth * 0.9) // Match maxWidth of the rendered window
      const popupHeight = Math.min(500, windowHeight * 0.7)
      
      // Center the window on screen (same as when it first appears after a prompt)
      const centerX = Math.max(80, (windowWidth - popupWidth) / 2)
      const centerY = Math.max(80, (windowHeight - popupHeight) / 3)
      
      setPosition({ x: centerX, y: centerY })
      setIsInitialized(true)
    }
  }, [summary, isInitialized])

  // Handle mouse move for dragging
  useEffect(() => {
    const handleMouseMove = (e) => {
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

  const handleDragStart = (e) => {
    // Only allow dragging from the header area
    const rect = e.currentTarget.getBoundingClientRect()
    const offsetX = e.clientX - rect.left
    const offsetY = e.clientY - rect.top
    
    setIsDragging(true)
    setDragOffset({ x: offsetX, y: offsetY })
  }

  // Debug log
  useEffect(() => {
  }, [summary])

  if (!summary) {
    return null
  }

  // When on home tab, MainView handles inline display - don't show popup
  if (activeTab === 'home') {
    return null
  }

  const cardWidth = '270px' // Match other minimized windows

  // Show minimized state - styled like Facts and Sources and Council responses
  // Don't show anything if it's a single model response
  if (summary?.singleModel) {
    return null
  }

  // Only show on home tab
  if (isSummaryMinimized && activeTab === 'home') {
    return (
      <div
        style={{
          position: 'fixed',
          top: 'calc(50% - 87px)', // Position second from top (below Facts and Sources)
          left: '75px', // 15px padding from nav bar (60px nav + 15px)
          width: `calc(${cardWidth} + 12px)`, // Add space for badge extension
          overflow: 'visible', // Allow badge to extend outside
          pointerEvents: 'auto', // Ensure clicks work
          zIndex: 140, // Above other elements
        }}
      >
        <div
          style={{
            position: 'relative',
            width: '100%',
            minWidth: cardWidth,
            maxWidth: cardWidth,
            overflow: 'visible', // Allow badge to extend outside
            pointerEvents: 'auto', // Ensure clicks work
          }}
        >
          {/* X Badge - positioned outside container, overlapping top-right corner, fully visible */}
          <button
            onClick={(e) => {
              e.stopPropagation()
              handleClearSummary()
            }}
            style={{
              position: 'absolute',
              top: '-6px', // Position so full badge is visible, overlapping corner
              right: '-6px', // Position so full badge is visible, overlapping corner
              width: '24px',
              height: '24px',
              borderRadius: '50%',
              border: 'none', // No border
              background: theme === 'light' ? '#ffffff' : currentTheme.backgroundOverlayLight,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'pointer',
              padding: 0,
              zIndex: 1001, // Above the container
              pointerEvents: 'auto',
              boxShadow: theme === 'light' ? '0 0 10px rgba(0, 0, 0, 0.2)' : '0 0 10px rgba(255, 255, 255, 0.4)',
            }}
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
              borderRadius: '12px',
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
              setIsMaximized(true) // Directly maximize instead of just expanding
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
            <div
              style={{
                padding: '12px 16px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <FileText size={16} color={currentTheme.accent} />
                <h3
                  key={`summary-title-${theme}`}
                  style={{
                    fontSize: '0.9rem',
                    background: currentTheme.accentGradient,
                    WebkitBackgroundClip: 'text',
                    WebkitTextFillColor: 'transparent',
                    margin: 0,
                    fontWeight: '500',
                  }}
                >
                  {summary.singleModel ? 'Response' : 'Summary'}
                </h3>
              </div>
              <ChevronRight size={16} color={currentTheme.accent} style={{ marginRight: '20px' }} />
            </div>
          </motion.div>
        </div>
      </div>
    )
  }
  
  // Don't show anything if minimized and not on home tab
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
          borderRadius: '16px',
          padding: '30px',
          zIndex: 300,
        }}
      >
        <p style={{ color: '#ff6666' }}>Summary text is empty. Check console for errors.</p>
      </motion.div>
    )
  }

  // If maximized, show full-screen overlay
  if (isMaximized) {
    return (
      <div
        style={{
          position: 'fixed',
          top: 0,
          left: 0,
          width: '100vw',
          height: '100vh',
          background: theme === 'light' ? 'rgba(255, 255, 255, 0.98)' : 'rgba(0, 0, 0, 0.95)',
          zIndex: 300,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '40px',
        }}
        onClick={() => {
          setIsMaximized(false)
          setSummaryMinimized(true) // Return to minimized state
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
            borderRadius: '16px',
            padding: '30px',
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
              setSummaryMinimized(true) // Return to minimized state
            }}
            style={{
              position: 'absolute',
              top: '20px',
              right: '20px',
              background: currentTheme.buttonBackground,
              border: `1px solid ${currentTheme.borderLight}`,
              borderRadius: '8px',
              padding: '8px',
              color: currentTheme.accent,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              zIndex: 10,
            }}
            title="Minimize"
          >
            <Minimize2 size={20} />
          </button>

          <div style={{ marginBottom: '24px', paddingRight: '40px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <FileText size={28} color={currentTheme.accent} />
              <h2
                key={`summary-title-maximized-${theme}`}
                style={{
                  fontSize: '1.8rem',
                  margin: 0,
                  background: currentTheme.accentGradient,
                  WebkitBackgroundClip: 'text',
                  WebkitTextFillColor: 'transparent',
                }}
              >
                {summary.singleModel ? 'Model Response' : 'Response Summary'}
              </h2>
            </div>
          </div>

          <div
            style={{
              padding: '20px',
              background: currentTheme.buttonBackground,
              border: `1px solid ${currentTheme.borderLight}`,
              borderRadius: '12px',
            }}
          >
            {summary.singleModel && summary.modelName && (
              <h3
                key={`model-name-maximized-${theme}`}
                style={{
                  fontSize: '1.2rem',
                  margin: '0 0 16px 0',
                  background: currentTheme.accentGradient,
                  WebkitBackgroundClip: 'text',
                  WebkitTextFillColor: 'transparent',
                }}
              >
                {summary.modelName}
              </h3>
            )}
            
            {/* Original User Prompt */}
            {summary.originalPrompt && (
              <div style={{
                display: 'flex',
                justifyContent: 'flex-end',
                marginBottom: '16px',
              }}>
                <div style={{
                  background: currentTheme.accentGradient,
                  borderRadius: '12px 12px 4px 12px',
                  padding: '12px 16px',
                  maxWidth: '80%',
                }}>
                  <div style={{
                    fontSize: '0.75rem',
                    fontWeight: '600',
                    color: theme === 'light' ? 'rgba(255,255,255,0.8)' : 'rgba(0,0,0,0.6)',
                    marginBottom: '4px',
                    textTransform: 'uppercase',
                    letterSpacing: '0.5px',
                  }}>
                    You
                  </div>
                  <p style={{
                    color: theme === 'light' ? '#ffffff' : '#000000',
                    lineHeight: '1.6',
                    fontSize: '0.95rem',
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
              borderRadius: '12px 12px 12px 4px',
              padding: '16px',
              marginBottom: '16px',
              border: `1px solid ${currentTheme.borderLight}`,
              maxWidth: '85%',
            }}>
              <div style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                marginBottom: '10px',
              }}>
                <span style={{
                  fontSize: '0.8rem',
                  fontWeight: '600',
                  color: currentTheme.accent,
                  textTransform: 'uppercase',
                  letterSpacing: '0.5px',
                }}>
                  {summary.singleModel ? (summary.modelName || 'Model') : 'Summary'}
                </span>
              </div>
              <p
                style={{
                  color: currentTheme.textSecondary,
                  lineHeight: '1.8',
                  fontSize: '1rem',
                  whiteSpace: 'pre-wrap',
                  margin: 0,
                  fontStyle: 'normal',
                }}
              >
                {summary.singleModel && summary.summary ? summary.summary : (summary.initialSummary || summary.text || 'No summary content available.')}
              </p>
            </div>

            {/* Initial Sources — shown with the first prompt+response pair */}
            {(() => {
              if (!searchSources || !Array.isArray(searchSources) || searchSources.length === 0) return null
              const toggleKey = 'initial'
              return (
                <div style={{ marginTop: '12px', marginBottom: '12px' }}>
                  <button
                    onClick={() => setShowConvoSources(prev => ({ ...prev, [toggleKey]: !prev[toggleKey] }))}
                    style={{
                      display: 'flex', alignItems: 'center', gap: '6px', padding: '6px 12px',
                      background: showConvoSources[toggleKey] ? `${currentTheme.accent}15` : currentTheme.buttonBackground,
                      border: `1px solid ${showConvoSources[toggleKey] ? currentTheme.accent : currentTheme.borderLight}`,
                      borderRadius: '8px', color: currentTheme.accent, fontSize: '0.8rem', fontWeight: '500',
                      cursor: 'pointer', transition: 'all 0.2s ease',
                    }}
                  >
                    <Globe size={14} />
                    Sources ({searchSources.length})
                    <ChevronDown size={14} style={{ transform: showConvoSources[toggleKey] ? 'rotate(180deg)' : 'rotate(0deg)', transition: 'transform 0.2s' }} />
                  </button>
                  {showConvoSources[toggleKey] && (
                    <motion.div
                      initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }}
                      style={{ marginTop: '8px', display: 'flex', flexDirection: 'column', gap: '6px', maxHeight: '200px', overflowY: 'auto' }}
                    >
                      {searchSources.map((source, sIdx) => (
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
            {summary.conversationHistory && summary.conversationHistory.length > 0 && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                {summary.conversationHistory.map((exchange, index) => (
                  <div key={index} style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                    {/* User Message */}
                    <div style={{
                      display: 'flex',
                      justifyContent: 'flex-end',
                    }}>
                      <div style={{
                        background: currentTheme.accentGradient,
                        borderRadius: '12px 12px 4px 12px',
                        padding: '12px 16px',
                        maxWidth: '80%',
                      }}>
                        <div style={{
                          fontSize: '0.75rem',
                          fontWeight: '600',
                          color: theme === 'light' ? 'rgba(255,255,255,0.8)' : 'rgba(0,0,0,0.6)',
                          marginBottom: '4px',
                          textTransform: 'uppercase',
                          letterSpacing: '0.5px',
                        }}>
                          You
                        </div>
                        <p style={{
                          color: theme === 'light' ? '#ffffff' : '#000000',
                          lineHeight: '1.6',
                          fontSize: '0.95rem',
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
                        borderRadius: '12px 12px 12px 4px',
                        padding: '12px 16px',
                        maxWidth: '85%',
                        border: `1px solid ${currentTheme.borderLight}`,
                      }}>
                        <div style={{
                          fontSize: '0.75rem',
                          fontWeight: '600',
                          color: currentTheme.accent,
                          marginBottom: '6px',
                          textTransform: 'uppercase',
                          letterSpacing: '0.5px',
                        }}>
                          Response
                        </div>
                        <p style={{
                          color: currentTheme.textSecondary,
                          lineHeight: '1.7',
                          fontSize: '0.95rem',
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
                        <div style={{ marginTop: '8px', marginBottom: '4px' }}>
                          <button
                            onClick={() => setShowConvoSources(prev => ({ ...prev, [index]: !prev[index] }))}
                            style={{
                              display: 'flex', alignItems: 'center', gap: '6px', padding: '5px 10px',
                              background: showConvoSources[index] ? `${currentTheme.accent}15` : currentTheme.buttonBackground,
                              border: `1px solid ${showConvoSources[index] ? currentTheme.accent : currentTheme.borderLight}`,
                              borderRadius: '8px', color: currentTheme.accent, fontSize: '0.75rem', fontWeight: '500',
                              cursor: 'pointer', transition: 'all 0.2s ease',
                            }}
                          >
                            <Globe size={12} />
                            Sources ({turnSources.length})
                            <ChevronDown size={12} style={{ transform: showConvoSources[index] ? 'rotate(180deg)' : 'rotate(0deg)', transition: 'transform 0.2s' }} />
                          </button>
                          {showConvoSources[index] && (
                            <motion.div
                              initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }}
                              style={{ marginTop: '6px', display: 'flex', flexDirection: 'column', gap: '4px', maxHeight: '180px', overflowY: 'auto' }}
                            >
                              {turnSources.map((source, sIdx) => (
                                <a key={sIdx} href={source.link} target="_blank" rel="noopener noreferrer"
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
                  </div>
                ))}
              </div>
            )}
            
            {/* Fetching Response Indicator */}
            {isSendingMessage && (
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '10px',
                  padding: '12px 16px',
                  marginTop: '16px',
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

            {/* Scroll anchor for auto-scroll on new message */}
            <div ref={convoEndRef} />

            {/* Conversation Input */}
            {!summary.singleModel && (
              <div style={{ marginTop: '20px', paddingTop: '20px', borderTop: `1px solid ${currentTheme.borderLight}` }}>
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
                      borderRadius: '6px',
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
                      transition={{
                        duration: 1.5,
                        repeat: Infinity,
                        ease: 'easeInOut'
                      }}
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
                <div style={{ display: 'flex', gap: '8px', alignItems: 'flex-end' }}>
                  <textarea
                    value={conversationInput}
                    onChange={(e) => setConversationInput(e.target.value)}
                    onKeyPress={(e) => {
                      if (e.key === 'Enter' && !e.shiftKey) {
                        e.preventDefault()
                        handleSendMessage()
                      }
                    }}
                    placeholder="Continue the conversation..."
                    disabled={isSendingMessage}
                    style={{
                      flex: 1,
                      minHeight: '100px',
                      maxHeight: '200px',
                      padding: '14px',
                      background: currentTheme.buttonBackground,
                      border: `1px solid ${currentTheme.borderLight}`,
                      borderRadius: '10px',
                      color: currentTheme.text,
                      fontSize: '1rem',
                      resize: 'vertical',
                      fontFamily: 'inherit',
                      outline: 'none',
                    }}
                  />
                  <button
                    onClick={handleSendMessage}
                    disabled={!conversationInput.trim() || isSendingMessage}
                    style={{
                      padding: '12px 24px',
                      background: conversationInput.trim() && !isSendingMessage ? currentTheme.accentGradient : 'rgba(128, 128, 128, 0.3)',
                      border: 'none',
                      borderRadius: '8px',
                      color: conversationInput.trim() && !isSendingMessage ? (theme === 'light' ? '#ffffff' : '#000000') : currentTheme.textMuted,
                      fontSize: '0.9rem',
                      fontWeight: '500',
                      cursor: conversationInput.trim() && !isSendingMessage ? 'pointer' : 'not-allowed',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '8px',
                      whiteSpace: 'nowrap',
                    }}
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
        maxWidth: '550px', // Wider for conversation view
        maxHeight: '70vh', // Taller for conversation history
        background: currentTheme.backgroundOverlay,
        border: `1px solid ${currentTheme.border}`,
        borderRadius: '16px',
        padding: '30px',
        zIndex: 300,
        boxShadow: `0 0 40px ${currentTheme.shadow}`,
        overflowY: 'auto',
        cursor: isDragging ? 'grabbing' : 'default',
        transform: 'none', // Override Framer Motion's transform
      }}
    >
      {/* Header - Draggable Area */}
      <div
        onMouseDown={handleDragStart}
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: '24px',
          paddingBottom: '16px',
          borderBottom: `1px solid ${currentTheme.borderLight}`,
          cursor: isDragging ? 'grabbing' : 'grab',
          userSelect: 'none',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <Move size={20} color={currentTheme.accent} style={{ opacity: 0.6 }} />
          <FileText size={28} color={currentTheme.accent} />
          <h2
            key={`summary-conv-title-${theme}`}
            style={{
              fontSize: '1.8rem',
              margin: 0,
              background: currentTheme.accentGradient,
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
            }}
          >
            {summary.singleModel ? 'Model Response' : 'Response Summary'}
          </h2>
        </div>
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
          <button
            onClick={(e) => {
              e.stopPropagation()
              setIsMaximized(true)
            }}
            onMouseDown={(e) => e.stopPropagation()} // Prevent dragging when clicking maximize button
            style={{
              background: currentTheme.buttonBackground,
              border: `1px solid ${currentTheme.borderLight}`,
              borderRadius: '8px',
              padding: '8px',
              color: currentTheme.accent,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              zIndex: 10,
            }}
            title="Maximize"
          >
            <Maximize2 size={20} />
          </button>
          <button
            onClick={(e) => {
              e.stopPropagation()
              setSummaryMinimized(true)
            }}
            onMouseDown={(e) => e.stopPropagation()} // Prevent dragging when clicking minimize button
            style={{
              background: currentTheme.buttonBackground,
              border: `1px solid ${currentTheme.borderLight}`,
              borderRadius: '8px',
              padding: '8px',
              color: currentTheme.accent,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              zIndex: 10,
            }}
            title="Minimize"
          >
            <Minimize2 size={20} />
          </button>
          <button
            onClick={(e) => {
              e.stopPropagation()
              handleClearSummary()
            }}
            onMouseDown={(e) => e.stopPropagation()} // Prevent dragging when clicking close button
            style={{
              background: 'rgba(255, 0, 0, 0.1)',
              border: '1px solid rgba(255, 0, 0, 0.3)',
              borderRadius: '8px',
              padding: '8px',
              color: '#FF0000',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              zIndex: 10,
            }}
            title="Close"
          >
            <X size={20} />
          </button>
        </div>
      </div>

      {/* Summary Content */}
      <div
        style={{
          padding: '20px',
          background: currentTheme.buttonBackground,
          border: `1px solid ${currentTheme.borderLight}`,
          borderRadius: '12px',
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
              borderRadius: '10px 10px 4px 10px',
              padding: '10px 14px',
              maxWidth: '85%',
            }}>
              <div style={{
                fontSize: '0.7rem',
                fontWeight: '600',
                color: theme === 'light' ? 'rgba(255,255,255,0.8)' : 'rgba(0,0,0,0.6)',
                marginBottom: '4px',
                textTransform: 'uppercase',
                letterSpacing: '0.5px',
              }}>
                You
              </div>
              <p style={{
                color: theme === 'light' ? '#ffffff' : '#000000',
                lineHeight: '1.5',
                fontSize: '0.9rem',
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
          borderRadius: '10px 10px 10px 4px',
          padding: '14px',
          marginBottom: '14px',
          border: `1px solid ${currentTheme.borderLight}`,
          maxWidth: '90%',
        }}>
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            marginBottom: '8px',
          }}>
            <span style={{
              fontSize: '0.75rem',
              fontWeight: '600',
              color: currentTheme.accent,
              textTransform: 'uppercase',
              letterSpacing: '0.5px',
            }}>
              {summary.singleModel ? (summary.modelName || 'Model') : 'Summary'}
            </span>
          </div>
          <p
            style={{
              color: currentTheme.textSecondary,
              lineHeight: '1.7',
              fontSize: '0.95rem',
              whiteSpace: 'pre-wrap',
              margin: 0,
              fontStyle: 'normal',
            }}
          >
            {summary.singleModel && summary.summary ? summary.summary : (summary.initialSummary || summary.text || 'No summary content available.')}
          </p>
        </div>

        {/* Initial Sources — shown with the first prompt+response pair (minimized) */}
        {(() => {
          if (!searchSources || !Array.isArray(searchSources) || searchSources.length === 0) return null
          const toggleKey = 'initial'
          return (
            <div style={{ marginTop: '8px', marginBottom: '12px' }}>
              <button
                onClick={() => setShowConvoSources(prev => ({ ...prev, [toggleKey]: !prev[toggleKey] }))}
                style={{
                  display: 'flex', alignItems: 'center', gap: '6px', padding: '5px 10px',
                  background: showConvoSources[toggleKey] ? `${currentTheme.accent}15` : currentTheme.buttonBackground,
                  border: `1px solid ${showConvoSources[toggleKey] ? currentTheme.accent : currentTheme.borderLight}`,
                  borderRadius: '8px', color: currentTheme.accent, fontSize: '0.75rem', fontWeight: '500',
                  cursor: 'pointer', transition: 'all 0.2s ease',
                }}
              >
                <Globe size={12} />
                Sources ({searchSources.length})
                <ChevronDown size={12} style={{ transform: showConvoSources[toggleKey] ? 'rotate(180deg)' : 'rotate(0deg)', transition: 'transform 0.2s' }} />
              </button>
              {showConvoSources[toggleKey] && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }}
                  style={{ marginTop: '6px', display: 'flex', flexDirection: 'column', gap: '4px', maxHeight: '180px', overflowY: 'auto' }}
                >
                  {searchSources.map((source, sIdx) => (
                    <a key={sIdx} href={source.link} target="_blank" rel="noopener noreferrer"
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
        
        {/* Conversation History */}
        {summary.conversationHistory && summary.conversationHistory.length > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '14px', marginBottom: '14px' }}>
            {summary.conversationHistory.map((exchange, index) => (
              <div key={index} style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                {/* User Message */}
                <div style={{
                  display: 'flex',
                  justifyContent: 'flex-end',
                }}>
                  <div style={{
                    background: currentTheme.accentGradient,
                    borderRadius: '10px 10px 4px 10px',
                    padding: '10px 14px',
                    maxWidth: '85%',
                  }}>
                    <div style={{
                      fontSize: '0.7rem',
                      fontWeight: '600',
                      color: theme === 'light' ? 'rgba(255,255,255,0.8)' : 'rgba(0,0,0,0.6)',
                      marginBottom: '4px',
                      textTransform: 'uppercase',
                      letterSpacing: '0.5px',
                    }}>
                      You
                    </div>
                    <p style={{
                      color: theme === 'light' ? '#ffffff' : '#000000',
                      lineHeight: '1.5',
                      fontSize: '0.9rem',
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
                    borderRadius: '10px 10px 10px 4px',
                    padding: '10px 14px',
                    maxWidth: '90%',
                    border: `1px solid ${currentTheme.borderLight}`,
                  }}>
                    <div style={{
                      fontSize: '0.7rem',
                      fontWeight: '600',
                      color: currentTheme.accent,
                      marginBottom: '4px',
                      textTransform: 'uppercase',
                      letterSpacing: '0.5px',
                    }}>
                      Assistant
                    </div>
                    <p style={{
                      color: currentTheme.textSecondary,
                      lineHeight: '1.6',
                      fontSize: '0.9rem',
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
                    <div style={{ marginTop: '6px', marginBottom: '4px' }}>
                      <button
                        onClick={() => setShowConvoSources(prev => ({ ...prev, [index]: !prev[index] }))}
                        style={{
                          display: 'flex', alignItems: 'center', gap: '5px', padding: '4px 8px',
                          background: showConvoSources[index] ? `${currentTheme.accent}15` : currentTheme.buttonBackground,
                          border: `1px solid ${showConvoSources[index] ? currentTheme.accent : currentTheme.borderLight}`,
                          borderRadius: '6px', color: currentTheme.accent, fontSize: '0.7rem', fontWeight: '500',
                          cursor: 'pointer', transition: 'all 0.2s ease',
                        }}
                      >
                        <Globe size={11} />
                        Sources ({turnSources.length})
                        <ChevronDown size={11} style={{ transform: showConvoSources[index] ? 'rotate(180deg)' : 'rotate(0deg)', transition: 'transform 0.2s' }} />
                      </button>
                      {showConvoSources[index] && (
                        <motion.div
                          initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }}
                          style={{ marginTop: '4px', display: 'flex', flexDirection: 'column', gap: '3px', maxHeight: '150px', overflowY: 'auto' }}
                        >
                          {turnSources.map((source, sIdx) => (
                            <a key={sIdx} href={source.link} target="_blank" rel="noopener noreferrer"
                              style={{ display: 'block', padding: '5px 8px', background: currentTheme.buttonBackground, border: `1px solid ${currentTheme.borderLight}`, borderRadius: '5px', textDecoration: 'none', transition: 'border-color 0.2s' }}
                              onMouseEnter={(e) => { e.currentTarget.style.borderColor = currentTheme.accent }}
                              onMouseLeave={(e) => { e.currentTarget.style.borderColor = currentTheme.borderLight }}
                            >
                              <div style={{ fontSize: '0.7rem', fontWeight: '600', color: currentTheme.accent, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{source.title}</div>
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
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '10px',
              padding: '12px 16px',
              marginTop: '12px',
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

        {/* Scroll anchor for auto-scroll on new message (minimized view) */}
        <div ref={convoEndRef} />

        {/* Conversation Input */}
        {!summary.singleModel && (
          <div style={{ paddingTop: '14px', borderTop: `1px solid ${currentTheme.borderLight}` }}>
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
                  borderRadius: '6px',
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
                  transition={{
                    duration: 1.5,
                    repeat: Infinity,
                    ease: 'easeInOut'
                  }}
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
            <div style={{ display: 'flex', gap: '8px', alignItems: 'flex-end' }}>
              <textarea
                value={conversationInput}
                onChange={(e) => setConversationInput(e.target.value)}
                onKeyPress={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault()
                    handleSendMessage()
                  }
                }}
                placeholder="Continue the conversation..."
                disabled={isSendingMessage}
                style={{
                  flex: 1,
                  minHeight: '100px',
                  maxHeight: '200px',
                  padding: '14px',
                  background: currentTheme.buttonBackground,
                  border: `1px solid ${currentTheme.borderLight}`,
                  borderRadius: '10px',
                  color: currentTheme.text,
                  fontSize: '1rem',
                  resize: 'vertical',
                  fontFamily: 'inherit',
                  outline: 'none',
                }}
              />
              <button
                onClick={handleSendMessage}
                disabled={!conversationInput.trim() || isSendingMessage}
                style={{
                  padding: '12px 24px',
                  background: conversationInput.trim() && !isSendingMessage ? currentTheme.accentGradient : 'rgba(128, 128, 128, 0.3)',
                  border: 'none',
                  borderRadius: '8px',
                  color: conversationInput.trim() && !isSendingMessage ? '#000000' : currentTheme.textMuted,
                  fontSize: '0.9rem',
                  fontWeight: '500',
                  cursor: conversationInput.trim() && !isSendingMessage ? 'pointer' : 'not-allowed',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  whiteSpace: 'nowrap',
                }}
              >
                <Send size={18} />
                {isSendingMessage ? 'Sending...' : 'Send'}
              </button>
              {/* Save Summary/Judge Response Button */}
              <div style={{ position: 'relative' }}>
                <button
                  onClick={handleSaveSummary}
                  disabled={savingState === 'saving' || savingState === 'saved'}
                  style={{
                    padding: '12px 16px',
                    background: savingState === 'saved' ? 'rgba(0, 200, 100, 0.2)' : currentTheme.buttonBackground,
                    border: `1px solid ${savingState === 'saved' ? 'rgba(0, 200, 100, 0.5)' : currentTheme.borderLight}`,
                    borderRadius: '8px',
                    color: savingState === 'saved' ? '#00c864' : currentTheme.accent,
                    fontSize: '0.9rem',
                    fontWeight: '500',
                    cursor: (savingState === 'saving' || savingState === 'saved') ? 'not-allowed' : 'pointer',
                    opacity: savingState === 'saving' ? 0.6 : 1,
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                    whiteSpace: 'nowrap',
                  }}
                  title={savingState === 'saved' ? 'Already saved' : undefined}
                >
                  <Save size={18} />
                  {savingState === 'saving'
                    ? 'Saving...'
                    : savingState === 'saved'
                    ? 'Saved!'
                    : summary?.singleModel
                    ? `Save ${getProviderName(summary?.modelName)} Convo`
                    : 'Save Summary Convo'}
                </button>
                <div
                  style={{ position: 'absolute', top: '-6px', right: '-6px', cursor: 'help' }}
                  onMouseEnter={() => setShowSaveTooltip(true)}
                  onMouseLeave={() => setShowSaveTooltip(false)}
                >
                  <Info size={14} color={currentTheme.textMuted} />
                  {showSaveTooltip && (
                    <div style={{
                      position: 'absolute',
                      bottom: '20px',
                      right: 0,
                      background: currentTheme.backgroundOverlay,
                      border: `1px solid ${currentTheme.borderLight}`,
                      borderRadius: '8px',
                      padding: '8px 12px',
                      fontSize: '0.75rem',
                      color: currentTheme.textSecondary,
                      width: '200px',
                      boxShadow: '0 4px 12px rgba(0,0,0,0.3)',
                      zIndex: 100,
                    }}>
                      Save this {summary?.singleModel ? "model's response" : 'judge summary'} and conversation history.
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}
        {/* Save button for single-model responses (no conversation input area) */}
        {summary?.singleModel && (
          <div style={{ paddingTop: '14px', borderTop: `1px solid ${currentTheme.borderLight}`, display: 'flex', justifyContent: 'flex-end' }}>
            <div style={{ position: 'relative' }}>
              <button
                onClick={handleSaveSummary}
                disabled={savingState === 'saving' || savingState === 'saved'}
                style={{
                  padding: '10px 16px',
                  background: savingState === 'saved' ? 'rgba(0, 200, 100, 0.2)' : currentTheme.buttonBackground,
                  border: `1px solid ${savingState === 'saved' ? 'rgba(0, 200, 100, 0.5)' : currentTheme.borderLight}`,
                  borderRadius: '8px',
                  color: savingState === 'saved' ? '#00c864' : currentTheme.accent,
                  fontSize: '0.85rem',
                  fontWeight: '500',
                  cursor: (savingState === 'saving' || savingState === 'saved') ? 'not-allowed' : 'pointer',
                  opacity: savingState === 'saving' ? 0.6 : 1,
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                }}
                title={savingState === 'saved' ? 'Already saved' : undefined}
              >
                <Save size={16} />
                {savingState === 'saving'
                  ? 'Saving...'
                  : savingState === 'saved'
                  ? 'Saved!'
                  : summary?.singleModel
                  ? `Save ${getProviderName(summary?.modelName)} Convo`
                  : 'Save Summary Convo'}
              </button>
              <div
                style={{ position: 'absolute', top: '-6px', right: '-6px', cursor: 'help' }}
                onMouseEnter={() => setShowSaveTooltip(true)}
                onMouseLeave={() => setShowSaveTooltip(false)}
              >
                <Info size={14} color={currentTheme.textMuted} />
                {showSaveTooltip && (
                  <div style={{
                    position: 'absolute',
                    bottom: '20px',
                    right: 0,
                    background: currentTheme.backgroundOverlay,
                    border: `1px solid ${currentTheme.borderLight}`,
                    borderRadius: '8px',
                    padding: '8px 12px',
                    fontSize: '0.75rem',
                    color: currentTheme.textSecondary,
                    width: '200px',
                    boxShadow: '0 4px 12px rgba(0,0,0,0.3)',
                    zIndex: 100,
                  }}>
                    Save this model's response to your saved conversations.
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </motion.div>
  )
}

export default SummaryWindow

