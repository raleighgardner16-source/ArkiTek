import React, { useState, useEffect } from 'react'
import { motion } from 'framer-motion'
import { X, FileText, Move, Minimize2, Maximize2, ChevronRight, Send, Search } from 'lucide-react'
import { useStore } from '../store/useStore'
import { getTheme } from '../utils/theme'
import axios from 'axios'

const SummaryWindow = () => {
  const summary = useStore((state) => state.summary)
  const clearSummary = useStore((state) => state.clearSummary)
  const isSummaryMinimized = useStore((state) => state.isSummaryMinimized)
  const setSummaryMinimized = useStore((state) => state.setSummaryMinimized)
  const activeTab = useStore((state) => state.activeTab)
  const currentUser = useStore((state) => state.currentUser)
  const setSummary = useStore((state) => state.setSummary)
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
  const prevSummaryRef = React.useRef(null)
  
  // Helper function to clear summary and also clear judge context
  const handleClearSummary = () => {
    clearSummary()
    // Clear judge conversation context when closing summary window
    if (currentUser?.id) {
      axios.post('http://localhost:3001/api/judge/clear-context', {
        userId: currentUser.id
      }).catch(err => console.error('[Clear Context] Error:', err))
    }
  }
  
  // Auto-minimize when user navigates away from home tab
  useEffect(() => {
    if (activeTab !== 'home' && summary) {
      setSummaryMinimized(true)
    }
  }, [activeTab, summary, setSummaryMinimized])

  // When summary first appears (new summary), show it in maximized view
  useEffect(() => {
    if (summary && !summary.singleModel && activeTab === 'home') {
      // Check if this is a new summary (different from previous)
      if (prevSummaryRef.current !== summary.text) {
        setIsMaximized(true) // Show in maximized view by default
        setSummaryMinimized(false) // Make sure it's not minimized
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
      const response = await axios.get('http://localhost:3001/api/judge/context', {
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
    setIsSearchingInConvo(false) // Reset search indicator
    
    try {
      // First, check if this query needs web search
      const detectResponse = await axios.post('http://localhost:3001/api/detect-search-needed', {
        query: conversationInput.trim(),
        userId: currentUser.id
      })
      
      // If search is needed, show the indicator
      if (detectResponse.data.needsSearch) {
        console.log('[SummaryWindow] Search needed for conversation query')
        setIsSearchingInConvo(true)
      }
      
      const response = await axios.post('http://localhost:3001/api/judge/conversation', {
        userId: currentUser.id,
        userMessage: conversationInput.trim(),
        conversationContext: conversationContext
      })
      
      // Update summary with new response (now talking to Grok directly, not judge mode)
      // Preserve the initial summary text if this is the first follow-up message
      const initialSummary = summary.initialSummary || summary.text
      
      setSummary({
        ...summary,
        text: response.data.response,
        summary: response.data.response,
        initialSummary: initialSummary, // Keep the original judge summary
        prompt: `${summary.prompt || ''}\n\nUser: ${conversationInput.trim()}`, // Update prompt to show conversation
        conversationHistory: [...(summary.conversationHistory || []), {
          user: conversationInput.trim(),
          assistant: response.data.response, // Changed from 'judge' to 'assistant' since it's now Grok
          timestamp: Date.now()
        }]
      })
      
      setConversationInput('')
      
      // If the conversation used search, update the RAG debug data and show Facts window
      const store = useStore.getState()
      if (response.data.debugData && response.data.usedSearch) {
        console.log('[SummaryWindow] Conversation used search, updating debug data')
        console.log('[SummaryWindow] Search results:', response.data.searchResults?.length || 0)
        console.log('[SummaryWindow] Refined facts:', response.data.refinedData?.facts_with_citations?.length || 0)
        
        // Update RAG debug data with new search results and refined data
        const existingDebugData = store.ragDebugData || {}
        store.setRAGDebugData({
          ...existingDebugData,
          // Update search results
          search: response.data.debugData.search,
          // Update refiner data
          refiner: response.data.debugData.refiner,
          // Update category detection
          categoryDetection: response.data.debugData.categoryDetection,
          // Keep conversation context
          conversationContext: existingDebugData.conversationContext || []
        })
        
        // Show Facts & Sources window if we got search results
        if (response.data.searchResults && response.data.searchResults.length > 0) {
          store.setShowFactsWindow(true)
        }
      }
      
      // Refresh context after a short delay to allow backend to store it
      setTimeout(async () => {
        await fetchConversationContext()
        // Update debug pipeline with new conversation context
        const ragDebugData = store.ragDebugData
        if (ragDebugData && currentUser?.id) {
          try {
            // Use query parameter to handle special characters (colons, etc.) better
            const contextResponse = await axios.get('http://localhost:3001/api/judge/context', {
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
    } catch (error) {
      console.error('[SummaryWindow] Error sending message:', error)
      alert('Failed to send message. Please try again.')
    } finally {
      setIsSendingMessage(false)
      setIsSearchingInConvo(false) // Reset search indicator
    }
  }

  // Reset maximized state when minimized
  useEffect(() => {
    if (isSummaryMinimized && isMaximized) {
      setIsMaximized(false)
    }
  }, [isSummaryMinimized, isMaximized])

  // Initialize position to bottom-right of screen on first render
  useEffect(() => {
    if (summary && !isInitialized) {
      const windowWidth = window.innerWidth
      const windowHeight = window.innerHeight
      const windowMaxWidth = Math.min(500, windowWidth * 0.4) // Smaller width for bottom-right
      const windowMaxHeight = Math.min(400, windowHeight * 0.5) // Smaller height
      const margin = 20
      
      // Position in bottom-right corner
      let rightX = windowWidth - windowMaxWidth - margin
      let bottomY = windowHeight - windowMaxHeight - margin - 80 // Leave space for minimized buttons
      
      // Clamp to ensure window stays within viewport
      rightX = Math.max(margin, Math.min(rightX, windowWidth - windowMaxWidth - margin))
      bottomY = Math.max(margin, Math.min(bottomY, windowHeight - windowMaxHeight - margin))
      
      setPosition({ x: rightX, y: bottomY })
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
    console.log('[SummaryWindow] Summary state:', summary)
    if (summary) {
      console.log('[SummaryWindow] Summary text length:', summary.text?.length)
      console.log('[SummaryWindow] Summary text preview:', summary.text?.substring(0, 200))
    }
  }, [summary])

  if (!summary) {
    console.log('[SummaryWindow] No summary, returning null')
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

  if (!summary.text || summary.text.trim() === '') {
    console.log('[SummaryWindow] Summary text is empty')
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
          background: 'rgba(0, 0, 0, 0.95)',
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
                  </div>
                ))}
              </div>
            )}
            
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
          background: theme === 'light' ? 'rgba(0, 150, 200, 0.05)' : 'rgba(0, 255, 255, 0.05)',
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
                    background: theme === 'light' ? 'rgba(0, 150, 200, 0.05)' : 'rgba(0, 255, 255, 0.05)',
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
              </div>
            ))}
          </div>
        )}
        
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
            </div>
          </div>
        )}
      </div>
    </motion.div>
  )
}

export default SummaryWindow

