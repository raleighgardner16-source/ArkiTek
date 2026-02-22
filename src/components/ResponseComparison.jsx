import React, { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Star, ChevronDown, ChevronUp, ChevronRight, Maximize2, Minimize2, X, Trash2, Move, Send, Info, FileText, RotateCcw, Search, Globe, Coins, Bug, DollarSign } from 'lucide-react'
import { useStore } from '../store/useStore'
import { getTheme } from '../utils/theme'
import axios from 'axios'
import { API_URL } from '../utils/config'
import { streamFetch } from '../utils/streamFetch'
import MarkdownRenderer from './MarkdownRenderer'
import TokenUsageWindow from './TokenUsageWindow'
import CostBreakdownWindow from './CostBreakdownWindow'
import PipelineDebugWindow from './PipelineDebugWindow'

const ResponseComparison = () => {
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
  const responses = useStore((state) => state.responses)
  const ratings = useStore((state) => state.ratings)
  const setRating = useStore((state) => state.setRating)
  const removeResponse = useStore((state) => state.removeResponse)
  const clearResponses = useStore((state) => state.clearResponses)
  const clearLastSubmittedPrompt = useStore((state) => state.clearLastSubmittedPrompt)
  const setShowFactsWindow = useStore((state) => state.setShowFactsWindow)
  const setSummaryMinimized = useStore((state) => state.setSummaryMinimized)
  const setSummary = useStore((state) => state.setSummary)
  const currentUser = useStore((state) => state.currentUser)
  const activeTab = useStore((state) => state.activeTab)
  const showCouncilPanel = useStore((state) => state.showCouncilPanel)
  const setShowCouncilPanel = useStore((state) => state.setShowCouncilPanel)
  const isNavExpanded = useStore((state) => state.isNavExpanded)
  const ragDebugData = useStore((state) => state.ragDebugData)
  const searchSources = useStore((state) => state.searchSources)
  const theme = useStore((state) => state.theme || 'dark')
  const currentTheme = getTheme(theme)
  const [expandedCards, setExpandedCards] = useState({})
  // sourcesMinimized/sourcesMaximized removed — sources are now shown inside each model's conversation area
  const [maximizedCard, setMaximizedCard] = useState(null)
  const [isMinimized, setIsMinimized] = useState(true) // Start minimized by default
  const [minimizedCards, setMinimizedCards] = useState({}) // Track which individual cards are minimized - all start minimized
  const [hiddenCards, setHiddenCards] = useState({}) // Track which cards the user has closed (hidden but not removed)
  const [cardPositions, setCardPositions] = useState({})
  const [draggedCard, setDraggedCard] = useState(null)
  const [borderHovered, setBorderHovered] = useState(null)
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 }) // Store mouse offset from card origin
  const hasAutoMinimized = React.useRef(false) // Track if we've already auto-minimized
  const convoEndRefs = React.useRef({}) // Scroll anchors for auto-scrolling conversation windows
  const convoContainerRefs = React.useRef({}) // Scrollable container refs for auto-scrolling
  const prevConvoLengths = React.useRef({}) // Track previous conversation lengths for scroll detection
  const [singleResponseMinimized, setSingleResponseMinimized] = useState(false) // Track if single response popup is minimized
  const [singleResponseMaximized, setSingleResponseMaximized] = useState(true) // Start maximized by default
  const [singleResponsePosition, setSingleResponsePosition] = useState({ x: 0, y: 0 })
  const [isDraggingSingleResponse, setIsDraggingSingleResponse] = useState(false)
  const [singleResponseDragOffset, setSingleResponseDragOffset] = useState({ x: 0, y: 0 })
  
  // Conversation state for each response window
  const [conversationInputs, setConversationInputs] = useState({}) // { responseId: 'input text' }
  const [conversationHistories, setConversationHistories] = useState({}) // { responseId: [{ user, assistant, timestamp }] }
  const [sendingMessages, setSendingMessages] = useState({}) // { responseId: true/false }
  const [searchingInConvo, setSearchingInConvo] = useState({}) // { responseId: true/false }
  const [convoSources, setConvoSources] = useState({}) // { responseId: { turnIndex: [...sources] } } — per-turn follow-up search results
  const [showConvoSources, setShowConvoSources] = useState({}) // { "responseId_turnIndex": true/false } — per-turn toggle
  const [showTokenUsageModal, setShowTokenUsageModal] = useState(false)
  const [showCostModal, setShowCostModal] = useState(false)
  const [showPipelineModal, setShowPipelineModal] = useState(false)
  const tokenData = useStore((state) => state.tokenData)
  const lastSubmittedPrompt = useStore((state) => state.lastSubmittedPrompt || '')
  const lastSubmittedCategory = useStore((state) => state.lastSubmittedCategory || '')
  const geminiDetectionResponse = useStore((state) => state.geminiDetectionResponse)
  const queryCount = useStore((state) => state.queryCount || 0)
  const showPipelineDebugWindow = useStore((state) => state.showPipelineDebugWindow)

  // Auto-scroll conversation containers when new messages are added
  React.useEffect(() => {
    Object.entries(conversationHistories).forEach(([responseId, history]) => {
      const prevLen = prevConvoLengths.current[responseId] || 0
      if (history.length > prevLen) {
        // New message added — scroll the container to bottom after render
        setTimeout(() => {
          const container = convoContainerRefs.current[responseId]
          if (container) {
            container.scrollTo({ top: container.scrollHeight, behavior: 'smooth' })
          }
        }, 150)
      }
      prevConvoLengths.current[responseId] = history.length
    })
  }, [conversationHistories])

  // Calculate width based on available space (15px padding from nav bar and prompt window)
  // Nav bar is 60px, prompt window starts at 260px (paddingLeft: '260px')
  // Left: 60px + 15px = 75px
  // Right: 260px - 15px = 245px
  // Available width: 245px - 75px = 170px
  // User wants them to stretch further right, so use 270px to maximize the space
  const cardWidth = '270px' // Wider width with 15px left padding, 15px from prompt window

  // Handle mouse move for dragging
  useEffect(() => {
    const handleMouseMove = (e) => {
      if (draggedCard && dragOffset.x !== undefined && dragOffset.y !== undefined) {
        // Calculate new position: mouse position minus the offset
        // This keeps the clicked spot under the mouse
        const newX = e.clientX - dragOffset.x
        const newY = e.clientY - dragOffset.y
        
        setCardPositions(prev => ({
          ...prev,
          [draggedCard]: {
            ...prev[draggedCard],
            x: newX,
            y: newY,
          }
        }))
      }
    }

    const handleMouseUp = (e) => {
      // Always cleanup, even if draggedCard is null (in case of race conditions)
      setDraggedCard(null)
      setBorderHovered(null)
      setDragOffset({ x: 0, y: 0 })
      // Always restore cursor and user selection
      document.body.style.userSelect = ''
      document.body.style.cursor = ''
    }

    if (draggedCard) {
      // Use capture phase to ensure we catch events even if they bubble
      window.addEventListener('mousemove', handleMouseMove, true)
      window.addEventListener('mouseup', handleMouseUp, true)
      // Also listen on document to catch mouseup anywhere
      document.addEventListener('mouseup', handleMouseUp, true)
      // Prevent text selection while dragging
      document.body.style.userSelect = 'none'
      document.body.style.cursor = 'grabbing'
      
      return () => {
        window.removeEventListener('mousemove', handleMouseMove, true)
        window.removeEventListener('mouseup', handleMouseUp, true)
        document.removeEventListener('mouseup', handleMouseUp, true)
        // Ensure cleanup happens
        document.body.style.userSelect = ''
        document.body.style.cursor = ''
        setDraggedCard(null)
        setBorderHovered(null)
        setDragOffset({ x: 0, y: 0 })
      }
    } else {
      // If no card is being dragged, ensure cursor is normal
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
    }
  }, [draggedCard, dragOffset])

  const handleRating = async (responseId, rating) => {
    // Update local state immediately for responsive UI
    setRating(responseId, rating)
    
    // Send rating to backend immediately
    if (currentUser?.id) {
      try {
        const response = responses.find(r => r.id === responseId)
        const modelName = response?.modelName || responseId.split('-').slice(0, 2).join('-')
        
        await axios.post(`${API_URL}/api/ratings`, {
          userId: currentUser.id,
          responseId: responseId,
          rating: rating,
          modelName: modelName
        })
        
        // Trigger stats refresh so the stats page updates
        const triggerStatsRefresh = useStore.getState().triggerStatsRefresh
        if (triggerStatsRefresh) {
          triggerStatsRefresh()
        }
      } catch (error) {
        console.error('[Rating] Error saving rating:', error)
        // Optionally show an error message to the user
      }
    } else {
      console.warn('[Rating] No user ID available, rating not saved to backend')
    }
  }

  const toggleCard = (responseId) => {
    setExpandedCards((prev) => ({
      ...prev,
      [responseId]: !prev[responseId],
    }))
    setMaximizedCard(null) // Close maximized view when toggling
  }

  const toggleMaximize = (responseId, e) => {
    e.stopPropagation()
    setMaximizedCard(maximizedCard === responseId ? null : responseId)
  }

  const toggleMinimizeCard = (responseId, e) => {
    if (e) {
      e.stopPropagation()
    }
    setMinimizedCards((prev) => ({
      ...prev,
      [responseId]: !prev[responseId],
    }))
    // If minimizing, also close maximized view
    if (maximizedCard === responseId) {
      setMaximizedCard(null)
    }
  }

  // Format model name for display (e.g., "openai-gpt-5.2" -> "Chatgpt 5.2")
  const formatModelName = (modelName) => {
    if (!modelName) return modelName
    
    // Split by provider and model
    const parts = modelName.toLowerCase().split('-')
    if (parts.length < 2) return modelName
    
    const provider = parts[0]
    const modelParts = parts.slice(1)
    
    // Format provider name
    let formattedProvider = ''
    switch (provider) {
      case 'openai':
        formattedProvider = 'Chatgpt'
        // Skip "gpt" and show version (e.g., "5.2")
        const versionParts = modelParts.slice(1) // Skip "gpt"
        return `${formattedProvider} ${versionParts.join(' ')}`.trim()
      case 'anthropic':
        formattedProvider = 'Claude'
        // Skip "claude" and format the rest (e.g., "4.5-opus" -> "4.5 Opus")
        const claudeParts = modelParts.slice(1) // Skip "claude"
        const claudeVersion = claudeParts.map(word => 
          word.charAt(0).toUpperCase() + word.slice(1)
        ).join(' ')
        return `${formattedProvider} ${claudeVersion}`.trim()
      case 'google':
        formattedProvider = 'Gemini'
        // Skip "gemini" and format the rest (e.g., "3-pro" -> "3 Pro")
        const geminiParts = modelParts.slice(1) // Skip "gemini"
        const geminiVersion = geminiParts.map(word => 
          word.charAt(0).toUpperCase() + word.slice(1)
        ).join(' ')
        return `${formattedProvider} ${geminiVersion}`.trim()
      case 'xai':
        formattedProvider = 'Grok'
        // Skip "grok" and format the rest (e.g., "4-1-fast-reasoning" -> "4.1 Fast Reasoning")
        const grokParts = modelParts.slice(1) // Skip "grok"
        // Join numbers with dots, capitalize words
        let grokVersion = grokParts.map((word, idx) => {
          if (/^\d+$/.test(word) && idx < grokParts.length - 1 && /^\d+$/.test(grokParts[idx + 1])) {
            return word + '.' // Join consecutive numbers with dot
          }
          return word.charAt(0).toUpperCase() + word.slice(1)
        }).join(' ').replace(/(\d+)\.\s*(\d+)/g, '$1.$2') // Fix number.number spacing
        return `${formattedProvider} ${grokVersion}`.trim()
      case 'mistral':
        formattedProvider = 'Mistral'
        break
      case 'deepseek':
        formattedProvider = 'DeepSeek'
        break
      case 'meta':
        formattedProvider = 'Meta'
        break
      default:
        formattedProvider = provider.charAt(0).toUpperCase() + provider.slice(1)
    }
    
    // For other providers, capitalize model parts
    const modelVersion = modelParts.map(word => 
      word.charAt(0).toUpperCase() + word.slice(1)
    ).join(' ')
    
    return `${formattedProvider} ${modelVersion}`.trim()
  }

  // Handle sending a conversation message to a specific model
  // Context is managed server-side (rolling window of 5 summaries, same as judge conversation)
  // Now uses SSE streaming for real-time token display
  const handleSendConversationMessage = async (responseId, modelName, originalResponse) => {
    const input = conversationInputs[responseId]?.trim()
    if (!input || !currentUser?.id || sendingMessages[responseId]) return
    
    setSendingMessages(prev => ({ ...prev, [responseId]: true }))
    setSearchingInConvo(prev => ({ ...prev, [responseId]: false }))
    setConversationInputs(prev => ({ ...prev, [responseId]: '' }))
    
    // Add user message with empty assistant placeholder immediately
    setConversationHistories(prev => ({
      ...prev,
      [responseId]: [
        ...(prev[responseId] || []),
        { user: input, assistant: '', timestamp: Date.now() }
      ]
    }))
    
    try {
      const finalData = await streamFetch(`${API_URL}/api/model/conversation/stream`, {
        userId: currentUser.id,
        modelName: modelName,
        userMessage: input,
        originalResponse: originalResponse,
        responseId: responseId
      }, {
        onToken: (token) => {
          setSearchingInConvo(prev => ({ ...prev, [responseId]: false }))
          setConversationHistories(prev => {
            const history = [...(prev[responseId] || [])]
            if (history.length > 0) {
              history[history.length - 1] = {
                ...history[history.length - 1],
                assistant: (history[history.length - 1].assistant || '') + token
              }
            }
            return { ...prev, [responseId]: history }
          })
        },
        onStatus: (message) => {
          if (message.toLowerCase().includes('search')) {
            setSearchingInConvo(prev => ({ ...prev, [responseId]: true }))
          }
        },
        onError: (message) => {
          console.error('[ResponseComparison] Stream error:', message)
        }
      })
      
      // Capture search results from follow-up conversation, keyed by turn index
      // NOTE: conversationHistories in closure still has the OLD length (before the new turn was added)
      // so the new turn's index = oldLength (not oldLength - 1)
      if (finalData?.searchResults && finalData.searchResults.length > 0) {
        const turnIndex = (conversationHistories[responseId] || []).length
        setConvoSources(prev => {
          const existing = prev[responseId] || {}
          return { ...prev, [responseId]: { ...existing, [turnIndex]: finalData.searchResults } }
        })
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
        }).catch(err => console.error('[Token Update] Model conversation token update failed:', err.message))
      }

      // Append conversation token data to the token usage display so it updates in real-time
      if (finalData?.tokens) {
        const provider = modelName.substring(0, modelName.indexOf('-')) || 'unknown'
        const model = modelName.substring(modelName.indexOf('-') + 1)
        useStore.getState().appendTokenData({
          modelName: `${modelName} (follow-up)`,
          tokens: {
            input: finalData.tokens.input || 0,
            output: finalData.tokens.output || 0,
            inputTokens: finalData.tokens.input || 0,
            outputTokens: finalData.tokens.output || 0,
            total: finalData.tokens.total || 0,
            provider,
            model,
            source: 'conversation',
          },
          isFollowUp: true,
        })
      }

      // Push this conversation turn to the active history entry
      const activeHistoryId = useStore.getState().currentHistoryId
      if (activeHistoryId && currentUser?.id) {
        axios.post(`${API_URL}/api/history/update-conversation`, {
          historyId: activeHistoryId,
          turn: {
            type: 'model',
            modelName: modelName,
            user: input,
            assistant: finalData?.response || '',
            sources: finalData?.searchResults || [],
          }
        }).catch(err => console.error('[History] Error updating model conversation turn:', err.message))
      }
    } catch (error) {
      console.error('[ResponseComparison] Error sending conversation message:', error)
      // Remove the placeholder on error
      setConversationHistories(prev => {
        const history = [...(prev[responseId] || [])]
        history.pop()
        return { ...prev, [responseId]: history }
      })
      setConversationInputs(prev => ({ ...prev, [responseId]: input }))
      alert('Failed to send message. Please try again.')
    } finally {
      setSendingMessages(prev => ({ ...prev, [responseId]: false }))
      setSearchingInConvo(prev => ({ ...prev, [responseId]: false }))
    }
  }
  
  // Clear conversation history for a response when it's removed
  const clearConversationForResponse = (responseId) => {
    setConversationHistories(prev => {
      const newHistories = { ...prev }
      delete newHistories[responseId]
      return newHistories
    })
    setConversationInputs(prev => {
      const newInputs = { ...prev }
      delete newInputs[responseId]
      return newInputs
    })
  }

  // Auto-minimize only once when responses first appear (so summary is seen first)
  useEffect(() => {
    if (responses.length > 0 && !hasAutoMinimized.current) {
      // Auto-minimize council responses so summary is seen first (only once)
      setIsMinimized(true)
      hasAutoMinimized.current = true
    } else if (responses.length === 0) {
      // Reset when responses clear
      hasAutoMinimized.current = false
    }
  }, [responses.length])

  // Track last response IDs to detect truly new responses
  const lastResponseIdsRef = React.useRef([])

  // Auto-minimize individual cards when they first appear (except when there's only one response)
  useEffect(() => {
    if (responses.length > 0) {
      const newMinimizedCards = {}
      const isSingleResponse = responses.length === 1
      const currentResponseIds = responses.map(r => r.id).sort().join(',')
      const previousResponseIds = lastResponseIdsRef.current.join(',')
      const isNewResponseSet = currentResponseIds !== previousResponseIds
      
      // Update tracked response IDs
      lastResponseIdsRef.current = responses.map(r => r.id).sort()
      
      // Reset single response state when new responses come in
      if (isSingleResponse && isNewResponseSet) {
        setSingleResponseMinimized(false) // Show popup by default for single response
        setSingleResponseMaximized(true) // Start in maximized view by default (centered)
      }
      
      responses.forEach(response => {
        if (minimizedCards[response.id] === undefined) {
          // If only one response, we'll show it as a popup, so mark it minimized in the cards list
          // If multiple responses, start minimized
          newMinimizedCards[response.id] = true
        } else {
          newMinimizedCards[response.id] = minimizedCards[response.id]
        }
      })
      if (Object.keys(newMinimizedCards).length > 0 && Object.keys(newMinimizedCards).some(id => minimizedCards[id] === undefined)) {
        setMinimizedCards(prev => ({ ...prev, ...newMinimizedCards }))
      }
    } else {
      // Clear tracked IDs when responses are cleared
      lastResponseIdsRef.current = []
    }
  }, [responses, minimizedCards])

  // Initialize single response popup position
  useEffect(() => {
    if (responses.length === 1 && !singleResponseMinimized) {
      // Center the popup on screen
      const windowWidth = window.innerWidth
      const windowHeight = window.innerHeight
      const popupWidth = 500
      const popupHeight = 400
      setSingleResponsePosition({
        x: Math.max(280, (windowWidth - popupWidth) / 2),
        y: Math.max(100, (windowHeight - popupHeight) / 3)
      })
    }
  }, [responses.length, singleResponseMinimized])

  // Clear all conversation histories when responses are cleared
  useEffect(() => {
    if (responses.length === 0) {
      setConversationHistories({})
      setConversationInputs({})
    }
  }, [responses.length])

  // Handle dragging for single response popup
  useEffect(() => {
    const handleMouseMove = (e) => {
      if (isDraggingSingleResponse) {
        setSingleResponsePosition({
          x: e.clientX - singleResponseDragOffset.x,
          y: e.clientY - singleResponseDragOffset.y
        })
      }
    }

    const handleMouseUp = () => {
      setIsDraggingSingleResponse(false)
    }

    if (isDraggingSingleResponse) {
      window.addEventListener('mousemove', handleMouseMove)
      window.addEventListener('mouseup', handleMouseUp)
    }

    return () => {
      window.removeEventListener('mousemove', handleMouseMove)
      window.removeEventListener('mouseup', handleMouseUp)
    }
  }, [isDraggingSingleResponse, singleResponseDragOffset])


  // Early return check - must be after all hooks
  if (responses.length === 0) {
    return null
  }

  // When on home tab, MainView handles inline display - don't show popup
  if (activeTab === 'home' && responses.length === 1) {
    return null
  }

  // Handle single response as a popup (like Summary window)
  if (responses.length === 1) {
    const response = responses[0]
    let responseText = ''
    if (typeof response.text === 'string') {
      responseText = response.text
    } else if (Array.isArray(response.text)) {
      responseText = response.text.map(item => {
        if (typeof item === 'string') return item
        if (item && typeof item === 'object' && item.text) return item.text
        return JSON.stringify(item)
      }).join(' ')
    } else if (response.text && typeof response.text === 'object') {
      responseText = response.text.text || response.text.content || response.text.message || JSON.stringify(response.text)
    } else {
      responseText = String(response.text || '')
    }

    const handleSingleResponseDragStart = (e) => {
      const rect = e.currentTarget.getBoundingClientRect()
      setSingleResponseDragOffset({
        x: e.clientX - rect.left,
        y: e.clientY - rect.top
      })
      setIsDraggingSingleResponse(true)
    }

    // Show minimized card if minimized
    if (singleResponseMinimized) {
      return (
        <div
          style={{
            position: 'fixed',
            top: 'calc(50% - 44px)', // Position after Summary spot
            left: '75px',
            zIndex: 200,
            display: 'flex',
            flexDirection: 'column',
            gap: '15px',
            pointerEvents: 'none',
          }}
        >
          <motion.div
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            style={{
              width: cardWidth,
              cursor: 'pointer',
              pointerEvents: 'auto',
            }}
            onClick={() => {
              setSingleResponseMinimized(false)
              setSingleResponseMaximized(true) // Re-open in maximized view
            }}
          >
            <div
              style={{
                background: currentTheme.backgroundOverlayLight,
                border: `1px solid ${currentTheme.borderLight}`,
                borderRadius: '12px',
                boxShadow: `0 4px 12px ${currentTheme.shadowLight}`,
                padding: '12px 16px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
              }}
            >
              <h3
                key={`single-response-title-${theme}`}
                style={{
                  fontSize: '0.9rem',
                  background: currentTheme.accentGradient,
                  WebkitBackgroundClip: 'text',
                  WebkitTextFillColor: 'transparent',
                  color: currentTheme.accent,
                  margin: 0,
                  fontWeight: '500',
                }}
              >
                {formatModelName(response.modelName)}
              </h3>
              <ChevronRight size={16} color={currentTheme.accent} style={{ marginRight: '20px' }} />
            </div>
          </motion.div>

          {/* Clear All removed per user request */}
        </div>
      )
    }

    // Show MAXIMIZED view (full-screen overlay) by default
    if (singleResponseMaximized) {
      return (
        <div
          onClick={() => {
            setSingleResponseMaximized(false)
            setSingleResponseMinimized(true)
          }}
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
            background: theme === 'light' ? 'rgba(0, 0, 0, 0.4)' : 'rgba(0, 0, 0, 0.7)',
            backdropFilter: 'blur(4px)',
          }}
        >
        <motion.div
          ref={el => { if (el) convoContainerRefs.current[response.id] = el }}
          onClick={(e) => e.stopPropagation()}
          initial={{ scale: 0.9, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          style={{
            background: theme === 'light' ? '#ffffff' : 'rgba(20, 20, 35, 0.98)',
            border: `1px solid ${currentTheme.border}`,
            borderRadius: '16px',
            padding: '30px',
            maxWidth: '900px',
            width: 'calc(100% - 80px)',
            maxHeight: '80vh',
            overflowY: 'auto',
            boxShadow: `0 0 40px ${currentTheme.shadow}`,
          }}
        >
            {/* Minimize button */}
            <button
              onClick={() => {
                setSingleResponseMaximized(false)
                setSingleResponseMinimized(true)
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
                <h2
                  key={`single-response-maximized-title-${theme}`}
                  style={{
                    fontSize: '1.8rem',
                    margin: 0,
                    background: currentTheme.accentGradient,
                    WebkitBackgroundClip: 'text',
                    WebkitTextFillColor: 'transparent',
                  }}
                >
                  {formatModelName(response.modelName)}
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
              <MarkdownRenderer content={responseText} theme={currentTheme} fontSize="1rem" lineHeight="1.8" />
            </div>

            {/* Initial Sources — shown with the first prompt+response pair */}
            {(() => {
              if (!searchSources || !Array.isArray(searchSources) || searchSources.length === 0) return null
              const toggleKey = `${response.id}_initial`
              return (
                <div style={{ marginTop: '12px' }}>
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

            {/* Rating */}
            <div
              style={{
                marginTop: '24px',
                paddingTop: '24px',
                borderTop: `1px solid ${currentTheme.borderLight}`,
                display: 'flex',
                gap: '8px',
                alignItems: 'center',
              }}
            >
              <span style={{ fontSize: '0.9rem', color: currentTheme.textSecondary }}>Rate:</span>
              {[1, 2, 3, 4, 5].map((rating) => (
                <button
                  key={rating}
                  onClick={() => handleRating(response.id, rating)}
                  style={{
                    background: 'transparent',
                    border: 'none',
                    cursor: 'pointer',
                    padding: '4px',
                  }}
                >
                  <Star
                    size={24}
                    fill={ratings[response.id] >= rating ? currentTheme.accentSecondary : 'transparent'}
                    color={ratings[response.id] >= rating ? currentTheme.accentSecondary : currentTheme.textMuted}
                  />
                </button>
              ))}
            </div>

            {/* Conversation History */}
            {conversationHistories[response.id]?.length > 0 && (
              <div
                style={{
                  marginTop: '24px',
                  paddingTop: '24px',
                  borderTop: `1px solid ${currentTheme.borderLight}`,
                }}
              >
                <h3 style={{ 
                  color: currentTheme.text, 
                  fontSize: '1rem', 
                  marginBottom: '16px',
                  fontWeight: '500'
                }}>
                  Conversation
                </h3>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                  {conversationHistories[response.id].map((exchange, idx) => (
                    <React.Fragment key={idx}>
                      {/* User follow-up — in a container */}
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
                            fontSize: '0.9rem',
                            whiteSpace: 'pre-wrap',
                            margin: 0,
                          }}>
                            {exchange.user}
                          </p>
                        </div>
                      </div>

                      {/* Assistant response — free flowing, no container */}
                      <div style={{ padding: '4px 0 0 4px' }}>
                        <div style={{
                          marginBottom: '6px',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '6px',
                        }}>
                          <span style={{
                            color: currentTheme.accent,
                            fontSize: '0.75rem',
                            fontWeight: '600',
                            textTransform: 'uppercase',
                            letterSpacing: '0.5px',
                          }}>
                            {formatModelName(response.modelName)}
                          </span>
                        </div>
                        <div style={{
                        }}>
                          <MarkdownRenderer content={exchange.assistant} theme={currentTheme} fontSize="0.9rem" lineHeight="1.8" />
                        </div>
                      </div>
                      {/* Per-turn Sources Tab (maximized) */}
                      {(() => {
                        const turnSources = convoSources[response.id]?.[idx]
                        if (!turnSources || turnSources.length === 0) return null
                        const toggleKey = `${response.id}_${idx}`
                        return (
                          <div style={{ marginTop: '8px', marginBottom: '4px' }}>
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
                              Sources ({turnSources.length})
                              <ChevronDown size={12} style={{ transform: showConvoSources[toggleKey] ? 'rotate(180deg)' : 'rotate(0deg)', transition: 'transform 0.2s' }} />
                            </button>
                            {showConvoSources[toggleKey] && (
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
                    </React.Fragment>
                  ))}
                </div>
              </div>
            )}

            {/* Web Search Indicator */}
            {searchingInConvo[response.id] && (
              <motion.div
                initial={{ opacity: 0, y: 5 }}
                animate={{ opacity: 1, y: 0 }}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  padding: '6px 12px',
                  marginTop: '8px',
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

            {/* Fetching Response Indicator */}
            {sendingMessages[response.id] && (
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
                  Loading {formatModelName(response.modelName)}'s response...
                </span>
              </motion.div>
            )}

            {/* Scroll anchor for auto-scroll on new message */}
            <div ref={el => { convoEndRefs.current[response.id] = el }} />

            {/* Conversation Input */}
            <div
              style={{
                marginTop: '24px',
                paddingTop: '24px',
                borderTop: `1px solid ${currentTheme.borderLight}`,
              }}
            >
              <div style={{ display: 'flex', gap: '12px', alignItems: 'flex-end' }}>
                <textarea
                  value={conversationInputs[response.id] || ''}
                  onChange={(e) => setConversationInputs(prev => ({ 
                    ...prev, 
                    [response.id]: e.target.value 
                  }))}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault()
                      handleSendConversationMessage(response.id, response.modelName, responseText)
                    }
                  }}
                  placeholder={`Continue conversation with ${formatModelName(response.modelName)}...`}
                  style={{
                    flex: 1,
                    minHeight: '60px',
                    maxHeight: '120px',
                    padding: '12px 16px',
                    background: currentTheme.buttonBackground,
                    border: `1px solid ${currentTheme.borderLight}`,
                    borderRadius: '12px',
                    color: currentTheme.text,
                    fontSize: '0.95rem',
                    resize: 'none',
                    outline: 'none',
                    fontFamily: 'inherit',
                  }}
                />
                <motion.button
                  onClick={() => handleSendConversationMessage(response.id, response.modelName, responseText)}
                  disabled={!conversationInputs[response.id]?.trim() || sendingMessages[response.id]}
                  style={{
                    padding: '14px',
                    background: conversationInputs[response.id]?.trim() 
                      ? currentTheme.accentGradient 
                      : currentTheme.buttonBackground,
                    border: `1px solid ${conversationInputs[response.id]?.trim() ? 'transparent' : currentTheme.borderLight}`,
                    borderRadius: '12px',
                    cursor: conversationInputs[response.id]?.trim() && !sendingMessages[response.id] ? 'pointer' : 'not-allowed',
                    opacity: sendingMessages[response.id] ? 0.6 : 1,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                  whileHover={conversationInputs[response.id]?.trim() && !sendingMessages[response.id] ? { scale: 1.05 } : {}}
                  whileTap={conversationInputs[response.id]?.trim() && !sendingMessages[response.id] ? { scale: 0.95 } : {}}
                >
                  <Send 
                    size={20} 
                    color={conversationInputs[response.id]?.trim() ? '#fff' : currentTheme.textMuted} 
                  />
                </motion.button>
              </div>
              <p style={{ 
                fontSize: '0.75rem', 
                color: currentTheme.textMuted, 
                marginTop: '8px',
                fontStyle: 'italic'
              }}>
                Press Enter to send, Shift+Enter for new line. Context: last 5 exchanges.
              </p>
            </div>
          </motion.div>
        </div>
      )
    }

    // Show regular popup (non-maximized, non-minimized) - this shouldn't normally be reached
    return (
      <motion.div
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        style={{
          position: 'fixed',
          left: `${singleResponsePosition.x}px`,
          top: `${singleResponsePosition.y}px`,
          width: '90%',
          maxWidth: '500px',
          maxHeight: '400px',
          background: currentTheme.backgroundOverlay,
          border: `1px solid ${currentTheme.border}`,
          borderRadius: '16px',
          padding: '24px',
          zIndex: 300,
          boxShadow: `0 0 40px ${currentTheme.shadow}`,
          overflowY: 'auto',
          cursor: isDraggingSingleResponse ? 'grabbing' : 'default',
        }}
      >
        {/* Header - Draggable Area */}
        <div
          onMouseDown={handleSingleResponseDragStart}
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: '16px',
            paddingBottom: '12px',
            borderBottom: `1px solid ${currentTheme.borderLight}`,
            cursor: isDraggingSingleResponse ? 'grabbing' : 'grab',
            userSelect: 'none',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <Move size={20} color={currentTheme.accent} style={{ opacity: 0.6 }} />
            <h2
              key={`single-response-popup-title-${theme}`}
              style={{
                fontSize: '1.4rem',
                margin: 0,
                background: currentTheme.accentGradient,
                WebkitBackgroundClip: 'text',
                WebkitTextFillColor: 'transparent',
              }}
            >
              {formatModelName(response.modelName)}
            </h2>
          </div>
          <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
            <button
              onClick={(e) => {
                e.stopPropagation()
                setSingleResponseMinimized(true)
              }}
              onMouseDown={(e) => e.stopPropagation()}
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
              }}
              title="Minimize"
            >
              <Minimize2 size={18} />
            </button>
            <button
              onClick={(e) => {
                e.stopPropagation()
                // Finalize the active history entry before clearing
                const activeHistoryId = useStore.getState().currentHistoryId
                if (activeHistoryId && currentUser?.id) {
                  axios.post(`${API_URL}/api/history/finalize`, {
                    historyId: activeHistoryId,
                    userId: currentUser.id,
                  }).catch(err => console.error('[History] Error finalizing:', err.message))
                }
                clearResponses()
                clearLastSubmittedPrompt()
                // Clear judge and model conversation context
                if (currentUser?.id) {
                  axios.post(`${API_URL}/api/judge/clear-context`, {
                    userId: currentUser.id
                  }).catch(err => console.error('[Clear Context] Error:', err))
                  axios.post(`${API_URL}/api/model/clear-context`, {
                    userId: currentUser.id
                  }).catch(err => console.error('[Clear Model Context] Error:', err))
                }
              }}
              onMouseDown={(e) => e.stopPropagation()}
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
              }}
              title="Close"
            >
              <X size={18} />
            </button>
          </div>
        </div>

        {/* Response Content */}
        <div
          style={{
            padding: '16px',
            background: currentTheme.buttonBackground,
            border: `1px solid ${currentTheme.borderLight}`,
            borderRadius: '12px',
          }}
        >
          <MarkdownRenderer content={responseText} theme={currentTheme} fontSize="1rem" lineHeight="1.8" />
        </div>

        {/* Rating */}
        <div
          style={{
            marginTop: '16px',
            paddingTop: '16px',
            borderTop: `1px solid ${currentTheme.borderLight}`,
            display: 'flex',
            gap: '8px',
            alignItems: 'center',
          }}
        >
          <span style={{ fontSize: '0.9rem', color: currentTheme.textSecondary }}>Rate:</span>
          {[1, 2, 3, 4, 5].map((rating) => (
            <button
              key={rating}
              onClick={() => handleRating(response.id, rating)}
              style={{
                background: 'transparent',
                border: 'none',
                cursor: 'pointer',
                padding: '4px',
              }}
            >
              <Star
                size={24}
                fill={ratings[response.id] >= rating ? currentTheme.accentSecondary : 'transparent'}
                color={ratings[response.id] >= rating ? currentTheme.accentSecondary : currentTheme.textMuted}
              />
            </button>
          ))}
        </div>
      </motion.div>
    )
  }

  // Always show individual cards (no "Council Responses" button)
  // Individual cards will be minimized by default

  // If a card is maximized, show only that one
  if (maximizedCard) {
    const response = responses.find((r) => r.id === maximizedCard)
    if (!response) return null

    // Ensure response.text is a string - handle objects and arrays
    let responseText = ''
    if (typeof response.text === 'string') {
      responseText = response.text
    } else if (Array.isArray(response.text)) {
      responseText = response.text.map(item => {
        if (typeof item === 'string') return item
        if (item && typeof item === 'object' && item.text) return item.text
        return JSON.stringify(item)
      }).join(' ')
    } else if (response.text && typeof response.text === 'object') {
      // Try to extract text from object
      responseText = response.text.text || response.text.content || response.text.message || JSON.stringify(response.text)
    } else {
      responseText = String(response.text || '')
    }

    return (
      <div
        onClick={() => {
          setMaximizedCard(null)
          setMinimizedCards((prev) => ({
            ...prev,
            [maximizedCard]: true
          }))
        }}
        style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          zIndex: 300,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: theme === 'light' ? 'rgba(0, 0, 0, 0.4)' : 'rgba(0, 0, 0, 0.7)',
          backdropFilter: 'blur(4px)',
        }}
      >
        <motion.div
          ref={el => { if (el) convoContainerRefs.current[response.id] = el }}
          onClick={(e) => e.stopPropagation()}
          initial={{ scale: 0.9, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          style={{
            background: theme === 'light' ? '#ffffff' : 'rgba(20, 20, 35, 0.98)',
            border: `1px solid ${currentTheme.borderLight}`,
            borderRadius: '16px',
            padding: '30px',
            width: '90%',
            maxWidth: '900px',
            maxHeight: '80vh',
            overflowY: 'auto',
            position: 'relative',
            boxShadow: theme === 'light' 
              ? '0 8px 40px rgba(0, 0, 0, 0.2)' 
              : '0 8px 40px rgba(0, 0, 0, 0.6)',
          }}
        >
          <button
            onClick={() => {
              setMaximizedCard(null)
              // Return card to minimized state
              setMinimizedCards((prev) => ({
                ...prev,
                [maximizedCard]: true
              }))
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
            }}
          >
            <Minimize2 size={20} />
          </button>

          <div style={{ marginBottom: '20px' }}>
            <h3
              key={`maximized-model-name-${response.id}-${theme}`}
              style={{
                fontSize: '1.5rem',
                marginBottom: '8px',
                background: currentTheme.accentGradient,
                WebkitBackgroundClip: 'text',
                WebkitTextFillColor: 'transparent',
              }}
            >
              {formatModelName(response.modelName)}
            </h3>
          </div>

          <MarkdownRenderer content={responseText} theme={currentTheme} fontSize="1.1rem" lineHeight="1.8" />

          {/* Initial Sources — shown with the first prompt+response pair */}
          {(() => {
            if (!searchSources || !Array.isArray(searchSources) || searchSources.length === 0) return null
            const toggleKey = `${response.id}_initial`
            return (
              <div style={{ marginTop: '12px' }}>
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

          <div
            style={{
              marginTop: '24px',
              paddingTop: '24px',
              borderTop: `1px solid ${currentTheme.borderLight}`,
              display: 'flex',
              gap: '8px',
              alignItems: 'center',
            }}
          >
            <span style={{ fontSize: '0.9rem', color: currentTheme.textSecondary }}>Rate:</span>
            {[1, 2, 3, 4, 5].map((rating) => (
              <button
                key={rating}
                onClick={() => handleRating(response.id, rating)}
                style={{
                  background: 'transparent',
                  border: 'none',
                  cursor: 'pointer',
                  padding: '4px',
                }}
              >
                <Star
                  size={24}
                  fill={ratings[response.id] >= rating ? currentTheme.accentSecondary : 'transparent'}
                  color={ratings[response.id] >= rating ? currentTheme.accentSecondary : currentTheme.textMuted}
                />
              </button>
            ))}
          </div>

          {/* Conversation History */}
          {conversationHistories[response.id]?.length > 0 && (
            <div
              style={{
                marginTop: '24px',
                paddingTop: '24px',
                borderTop: `1px solid ${currentTheme.borderLight}`,
              }}
            >
              <h3 style={{ 
                color: currentTheme.text, 
                fontSize: '1rem', 
                marginBottom: '16px',
                fontWeight: '500'
              }}>
                Conversation
              </h3>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                {conversationHistories[response.id].map((exchange, idx) => (
                  <React.Fragment key={idx}>
                    {/* User follow-up — in a container */}
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

                    {/* Assistant response — free flowing, no container */}
                    <div style={{ padding: '4px 0 0 4px' }}>
                      <div style={{
                        marginBottom: '8px',
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
                          {formatModelName(response.modelName)}
                        </span>
                      </div>
                      <div>
                        <MarkdownRenderer content={exchange.assistant} theme={currentTheme} fontSize="1.05rem" lineHeight="1.85" />
                      </div>
                    </div>
                    {/* Per-turn Sources Tab (non-maximized) */}
                    {(() => {
                      const turnSources = convoSources[response.id]?.[idx]
                      if (!turnSources || turnSources.length === 0) return null
                      const toggleKey = `${response.id}_${idx}`
                      return (
                        <div style={{ marginTop: '8px', marginBottom: '4px' }}>
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
                            Sources ({turnSources.length})
                            <ChevronDown size={12} style={{ transform: showConvoSources[toggleKey] ? 'rotate(180deg)' : 'rotate(0deg)', transition: 'transform 0.2s' }} />
                          </button>
                          {showConvoSources[toggleKey] && (
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
                  </React.Fragment>
                ))}
              </div>
            </div>
          )}

          {/* Web Search Indicator */}
          {searchingInConvo[response.id] && (
            <motion.div
              initial={{ opacity: 0, y: 5 }}
              animate={{ opacity: 1, y: 0 }}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                padding: '6px 12px',
                marginTop: '8px',
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

          {/* Fetching Response Indicator */}
          {sendingMessages[response.id] && (
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
                Loading {formatModelName(response.modelName)}'s response...
              </span>
            </motion.div>
          )}

          {/* Scroll anchor for auto-scroll on new message */}
          <div ref={el => { convoEndRefs.current[response.id] = el }} />

          {/* Conversation Input */}
          <div
            style={{
              marginTop: '24px',
              paddingTop: '24px',
              borderTop: `1px solid ${currentTheme.borderLight}`,
            }}
          >
            <div style={{ display: 'flex', gap: '12px', alignItems: 'flex-end' }}>
              <textarea
                value={conversationInputs[response.id] || ''}
                onChange={(e) => setConversationInputs(prev => ({ 
                  ...prev, 
                  [response.id]: e.target.value 
                }))}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault()
                    handleSendConversationMessage(response.id, response.modelName, responseText)
                  }
                }}
                placeholder={`Continue conversation with ${formatModelName(response.modelName)}...`}
                style={{
                  flex: 1,
                  minHeight: '60px',
                  maxHeight: '120px',
                  padding: '12px 16px',
                  background: currentTheme.buttonBackground,
                  border: `1px solid ${currentTheme.borderLight}`,
                  borderRadius: '12px',
                  color: currentTheme.text,
                  fontSize: '0.95rem',
                  resize: 'none',
                  outline: 'none',
                  fontFamily: 'inherit',
                }}
              />
              <motion.button
                onClick={() => handleSendConversationMessage(response.id, response.modelName, responseText)}
                disabled={!conversationInputs[response.id]?.trim() || sendingMessages[response.id]}
                style={{
                  padding: '14px',
                  background: conversationInputs[response.id]?.trim() 
                    ? currentTheme.accentGradient 
                    : currentTheme.buttonBackground,
                  border: `1px solid ${conversationInputs[response.id]?.trim() ? 'transparent' : currentTheme.borderLight}`,
                  borderRadius: '12px',
                  cursor: conversationInputs[response.id]?.trim() && !sendingMessages[response.id] ? 'pointer' : 'not-allowed',
                  opacity: sendingMessages[response.id] ? 0.6 : 1,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
                whileHover={conversationInputs[response.id]?.trim() && !sendingMessages[response.id] ? { scale: 1.05 } : {}}
                whileTap={conversationInputs[response.id]?.trim() && !sendingMessages[response.id] ? { scale: 0.95 } : {}}
              >
                <Send 
                  size={20} 
                  color={conversationInputs[response.id]?.trim() ? '#fff' : currentTheme.textMuted} 
                />
              </motion.button>
            </div>
            <p style={{ 
              fontSize: '0.75rem', 
              color: currentTheme.textMuted, 
              marginTop: '8px',
              fontStyle: 'italic'
            }}>
              Press Enter to send, Shift+Enter for new line. Context: last 5 exchanges.
            </p>
          </div>
        </motion.div>
      </div>
    )
  }

  // If the panel is not open, don't render the cards container
  if (!showCouncilPanel) return null

  return (
    <AnimatePresence>
      {showCouncilPanel && (
    <motion.div
      initial={{ opacity: 0, x: 40 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: 40 }}
      transition={{ duration: 0.25, ease: 'easeOut' }}
      style={{
        position: 'fixed',
        top: '80px',
        right: '20px',
        width: `calc(${cardWidth} + 12px)`,
        maxHeight: 'calc(100vh - 120px)',
        zIndex: 200,
        overflowY: 'auto',
        overflowX: 'hidden',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'flex-end',
        paddingLeft: '12px',
        paddingBottom: '20px',
      }}
    >
      {/* Token Usage Modal */}
      {showTokenUsageModal && tokenData && tokenData.length > 0 && (
        <TokenUsageWindow
          isOpen={true}
          onClose={() => setShowTokenUsageModal(false)}
          tokenData={tokenData}
        />
      )}

      {/* Cost Breakdown Modal */}
      {showCostModal && tokenData && tokenData.length > 0 && (
        <CostBreakdownWindow
          isOpen={true}
          onClose={() => setShowCostModal(false)}
          tokenData={tokenData}
          queryCount={queryCount}
        />
      )}

      {/* Pipeline Debug Modal */}
      {showPipelineModal && ragDebugData && (
        <div
          onClick={() => setShowPipelineModal(false)}
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            zIndex: 300,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: theme === 'light' ? 'rgba(0, 0, 0, 0.4)' : 'rgba(0, 0, 0, 0.7)',
            backdropFilter: 'blur(4px)',
          }}
        >
          <motion.div
            onClick={(e) => e.stopPropagation()}
            initial={{ scale: 0.9, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            style={{
              background: theme === 'light' ? '#ffffff' : 'rgba(20, 20, 35, 0.98)',
              border: `1px solid ${currentTheme.borderLight}`,
              borderRadius: '16px',
              width: '90%',
              maxWidth: '900px',
              maxHeight: '80vh',
              overflowY: 'auto',
              position: 'relative',
              boxShadow: theme === 'light'
                ? '0 8px 40px rgba(0, 0, 0, 0.2)'
                : '0 8px 40px rgba(0, 0, 0, 0.6)',
            }}
          >
            <button
              onClick={() => setShowPipelineModal(false)}
              style={{
                position: 'absolute',
                top: '12px',
                right: '12px',
                background: currentTheme.buttonBackground,
                border: `1px solid ${currentTheme.borderLight}`,
                borderRadius: '8px',
                padding: '6px',
                cursor: 'pointer',
                color: currentTheme.text,
                zIndex: 10,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <X size={18} />
            </button>
            <PipelineDebugWindow
              debugData={ragDebugData}
              onClose={() => setShowPipelineModal(false)}
              geminiDetectionResponse={geminiDetectionResponse}
              tokenData={tokenData}
              queryCount={queryCount}
              categoryDetectionData={null}
              inline={true}
            />
          </motion.div>
        </div>
      )}

      {/* Response cards (always visible) */}
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: '12px',
          paddingBottom: '10px',
          alignItems: 'flex-end',
          position: 'relative',
          width: '100%',
          overflow: 'visible',
        }}
      >
        {responses.map((response, index) => {
          // Skip hidden cards (closed by user but conversation preserved)
          if (hiddenCards[response.id]) return null
          
          const isExpanded = expandedCards[response.id]
          const isCardMinimized = minimizedCards[response.id]
          const previewLength = 150
          // Ensure response.text is a string - handle objects and arrays
          let responseText = ''
          if (typeof response.text === 'string') {
            responseText = response.text
          } else if (Array.isArray(response.text)) {
            responseText = response.text.map(item => {
              if (typeof item === 'string') return item
              if (item && typeof item === 'object' && item.text) return item.text
              return JSON.stringify(item)
            }).join(' ')
          } else if (response.text && typeof response.text === 'object') {
            // Try to extract text from object
            responseText = response.text.text || response.text.content || response.text.message || JSON.stringify(response.text)
          } else {
            responseText = String(response.text || '')
          }
          const hasMoreText = responseText.length > previewLength
          const displayText = isExpanded
            ? responseText
            : responseText.substring(0, previewLength) + (hasMoreText ? '...' : '')
          const position = cardPositions[response.id]
          const hasCustomPosition = position !== undefined
          const isBorderActive = borderHovered === response.id || draggedCard === response.id
          const isBeingDragged = draggedCard === response.id

          // If card is minimized, show only model name with arrow (matching Facts and Sources style)
          if (isCardMinimized) {
            return (
              <div
                key={response.id}
                style={{
                  position: 'relative',
                  width: '100%',
                  minWidth: cardWidth,
                  maxWidth: cardWidth,
                  overflow: 'visible', // Allow badge to extend outside
                }}
              >
                {/* X Badge - hides card (preserves conversation history) */}
                <button
                  onClick={(e) => {
                    e.stopPropagation()
                    setHiddenCards(prev => ({ ...prev, [response.id]: true }))
                  }}
                  style={{
                    position: 'absolute',
                    top: '-6px',
                    right: '-6px',
                    width: '24px',
                    height: '24px',
                    borderRadius: '50%',
                    border: 'none',
                    background: theme === 'light' ? '#ffffff' : 'rgba(0, 0, 0, 0.9)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    cursor: 'pointer',
                    padding: 0,
                    zIndex: 1001,
                    pointerEvents: 'auto',
                    boxShadow: theme === 'light' ? '0 0 10px rgba(0, 0, 0, 0.2)' : '0 0 10px rgba(255, 255, 255, 0.4)',
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.background = 'rgba(255, 0, 0, 0.3)'
                    e.currentTarget.style.boxShadow = theme === 'light' ? '0 0 15px rgba(0, 0, 0, 0.3)' : '0 0 15px rgba(255, 255, 255, 0.5)'
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.background = theme === 'light' ? '#ffffff' : 'rgba(0, 0, 0, 0.9)'
                    e.currentTarget.style.boxShadow = theme === 'light' ? '0 0 10px rgba(0, 0, 0, 0.2)' : '0 0 10px rgba(255, 255, 255, 0.4)'
                  }}
                  title="Hide response"
                >
                  <X size={16} color={currentTheme.text} />
                </button>
                <motion.div
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: index * 0.1 }}
                  style={{
                    width: '100%',
                    minWidth: cardWidth,
                    maxWidth: cardWidth,
                    background: theme === 'light' ? '#ffffff' : 'rgba(93, 173, 226, 0.05)',
                    border: `1px solid ${currentTheme.borderLight}`,
                    borderRadius: '8px',
                    padding: '0',
                    boxShadow: 'none',
                    cursor: 'pointer',
                    pointerEvents: 'auto',
                    position: 'relative',
                    zIndex: 1000,
                    transition: 'all 0.2s ease',
                  }}
                  onClick={(e) => {
                    e.stopPropagation()
                    // Un-minimize and maximize directly
                    setMinimizedCards((prev) => ({
                      ...prev,
                      [response.id]: false
                    }))
                    toggleMaximize(response.id, e) // Directly maximize instead of just expanding
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.borderColor = currentTheme.borderActive
                    e.currentTarget.style.background = theme === 'light' ? currentTheme.buttonBackgroundHover : 'rgba(93, 173, 226, 0.3)'
                    e.currentTarget.style.boxShadow = `0 0 15px ${currentTheme.shadow}, 0 0 30px ${currentTheme.shadowLight}`
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.borderColor = currentTheme.borderLight
                    e.currentTarget.style.background = theme === 'light' ? '#ffffff' : 'rgba(93, 173, 226, 0.05)'
                    e.currentTarget.style.boxShadow = 'none'
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
                    <h3
                      key={`model-name-${response.id}-${theme}`}
                      style={{
                        fontSize: '0.9rem',
                        background: currentTheme.accentGradient,
                        WebkitBackgroundClip: 'text',
                        WebkitTextFillColor: 'transparent',
                        color: currentTheme.accent,
                        margin: 0,
                        fontWeight: '500',
                      }}
                    >
                      {formatModelName(response.modelName)}
                    </h3>
                    <ChevronRight size={16} color={currentTheme.accent} style={{ marginRight: '20px' }} />
                  </div>
                </motion.div>
              </div>
            )
          }

          return (
            <React.Fragment key={response.id}>
              {/* Placeholder to maintain space when card is fixed (hasCustomPosition) */}
              {hasCustomPosition && (
                <div
                  style={{
                    width: cardWidth,
                    minWidth: cardWidth,
                    maxWidth: cardWidth, // Match new card size
                    height: '180px', // Approximate height to maintain space
                    flexShrink: 0,
                    pointerEvents: 'none',
                    visibility: 'hidden', // Invisible but maintains space in flex container
                  }}
                  aria-hidden="true"
                />
              )}
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ 
                  opacity: 1,
                }}
                transition={{ delay: index * 0.1 }}
                whileDrag={{ 
                  scale: 1.02,
                  zIndex: 1000, // High z-index when dragging
                }}
                data-response-id={response.id}
                style={{
                  width: '100%',
                  minWidth: cardWidth,
                  maxWidth: cardWidth, // Fixed width to match Facts and Sources
                  background: theme === 'light' ? '#ffffff' : 'rgba(0, 0, 0, 0.9)',
                  border: `1px solid ${currentTheme.borderLight}`,
                  borderRadius: '12px',
                  padding: '0',
                  boxShadow: `0 0 20px ${currentTheme.shadowLight}`,
                  transition: isBeingDragged ? 'none' : (hasCustomPosition ? 'none' : 'all 0.2s ease'),
                  position: hasCustomPosition ? 'fixed' : 'relative', // Fixed if dragged, relative if in container
                  left: hasCustomPosition && position ? `${position.x}px` : undefined,
                  top: hasCustomPosition && position ? `${position.y}px` : undefined,
                  overflow: 'hidden',
                  zIndex: isBeingDragged ? 1000 : (hasCustomPosition ? 200 : 100), // Higher z-index for fixed cards
                  pointerEvents: hasCustomPosition ? 'none' : 'auto', // Disable pointer events on flex container card when fixed
                  // Disable Framer Motion's transform for fixed cards - we use left/top instead
                  transform: hasCustomPosition ? 'none' : undefined,
                  // Make the card invisible in flex container when fixed (placeholder maintains space)
                  opacity: hasCustomPosition ? 0 : 1,
                }}
              onMouseEnter={(e) => {
                if (draggedCard !== response.id) {
                  e.currentTarget.style.borderColor = currentTheme.borderActive
                  e.currentTarget.style.boxShadow = `0 0 30px ${currentTheme.shadow}`
                }
              }}
              onMouseLeave={(e) => {
                if (draggedCard !== response.id) {
                  e.currentTarget.style.borderColor = currentTheme.borderLight
                  e.currentTarget.style.boxShadow = `0 0 20px ${currentTheme.shadowLight}`
                  setBorderHovered(null)
                }
              }}
            >
              {/* Border Drag Handles - Separate divs for each border edge */}
              {/* Top border */}
              <div
                onMouseDown={(e) => {
                  e.preventDefault()
                  e.stopPropagation()
                  const cardElement = e.currentTarget.closest('[data-response-id]')
                  if (!cardElement) return
                  
                  const rect = cardElement.getBoundingClientRect()
                  const mouseX = e.clientX
                  const mouseY = e.clientY
                  const offsetX = mouseX - rect.left
                  const offsetY = mouseY - rect.top
                  
                  setDraggedCard(response.id)
                  
                  if (!hasCustomPosition) {
                    setCardPositions(prev => ({
                      ...prev,
                      [response.id]: {
                        x: rect.left,
                        y: rect.top,
                      }
                    }))
                  }
                  
                  setDragOffset({ x: offsetX, y: offsetY })
                  setBorderHovered(response.id)
                }}
                onMouseEnter={() => {
                  if (draggedCard !== response.id) {
                    setBorderHovered(response.id)
                  }
                }}
                onMouseLeave={() => {
                  if (draggedCard !== response.id) {
                    setBorderHovered(null)
                  }
                }}
                style={{
                  position: 'absolute',
                  top: 0,
                  left: 0,
                  right: 0,
                  height: '24px',
                  cursor: draggedCard === response.id ? 'grabbing' : (isBorderActive ? 'grab' : 'default'),
                  zIndex: 30,
                  pointerEvents: 'auto',
                  userSelect: 'none',
                  WebkitUserSelect: 'none',
                }}
              />
              {/* Bottom border */}
              <div
                onMouseDown={(e) => {
                  e.preventDefault()
                  e.stopPropagation()
                  const cardElement = e.currentTarget.closest('[data-response-id]')
                  if (!cardElement) return
                  
                  const rect = cardElement.getBoundingClientRect()
                  const mouseX = e.clientX
                  const mouseY = e.clientY
                  const offsetX = mouseX - rect.left
                  const offsetY = mouseY - rect.top
                  
                  setDraggedCard(response.id)
                  
                  if (!hasCustomPosition) {
                    setCardPositions(prev => ({
                      ...prev,
                      [response.id]: {
                        x: rect.left,
                        y: rect.top,
                      }
                    }))
                  }
                  
                  setDragOffset({ x: offsetX, y: offsetY })
                  setBorderHovered(response.id)
                }}
                onMouseEnter={() => {
                  if (draggedCard !== response.id) {
                    setBorderHovered(response.id)
                  }
                }}
                onMouseLeave={() => {
                  if (draggedCard !== response.id) {
                    setBorderHovered(null)
                  }
                }}
                style={{
                  position: 'absolute',
                  bottom: 0,
                  left: 0,
                  right: 0,
                  height: '24px',
                  cursor: draggedCard === response.id ? 'grabbing' : (isBorderActive ? 'grab' : 'default'),
                  zIndex: 30,
                  pointerEvents: 'auto',
                  userSelect: 'none',
                  WebkitUserSelect: 'none',
                }}
              />
              {/* Left border */}
              <div
                onMouseDown={(e) => {
                  e.preventDefault()
                  e.stopPropagation()
                  const cardElement = e.currentTarget.closest('[data-response-id]')
                  if (!cardElement) return
                  
                  const rect = cardElement.getBoundingClientRect()
                  const mouseX = e.clientX
                  const mouseY = e.clientY
                  const offsetX = mouseX - rect.left
                  const offsetY = mouseY - rect.top
                  
                  setDraggedCard(response.id)
                  
                  if (!hasCustomPosition) {
                    setCardPositions(prev => ({
                      ...prev,
                      [response.id]: {
                        x: rect.left,
                        y: rect.top,
                      }
                    }))
                  }
                  
                  setDragOffset({ x: offsetX, y: offsetY })
                  setBorderHovered(response.id)
                }}
                onMouseEnter={() => {
                  if (draggedCard !== response.id) {
                    setBorderHovered(response.id)
                  }
                }}
                onMouseLeave={() => {
                  if (draggedCard !== response.id) {
                    setBorderHovered(null)
                  }
                }}
                style={{
                  position: 'absolute',
                  top: 0,
                  left: 0,
                  bottom: 0,
                  width: '24px',
                  cursor: draggedCard === response.id ? 'grabbing' : (isBorderActive ? 'grab' : 'default'),
                  zIndex: 30,
                  pointerEvents: 'auto',
                  userSelect: 'none',
                  WebkitUserSelect: 'none',
                }}
              />
              {/* Right border */}
              <div
                onMouseDown={(e) => {
                  e.preventDefault()
                  e.stopPropagation()
                  const cardElement = e.currentTarget.closest('[data-response-id]')
                  if (!cardElement) return
                  
                  const rect = cardElement.getBoundingClientRect()
                  const mouseX = e.clientX
                  const mouseY = e.clientY
                  const offsetX = mouseX - rect.left
                  const offsetY = mouseY - rect.top
                  
                  setDraggedCard(response.id)
                  
                  if (!hasCustomPosition) {
                    setCardPositions(prev => ({
                      ...prev,
                      [response.id]: {
                        x: rect.left,
                        y: rect.top,
                      }
                    }))
                  }
                  
                  setDragOffset({ x: offsetX, y: offsetY })
                  setBorderHovered(response.id)
                }}
                onMouseEnter={() => {
                  if (draggedCard !== response.id) {
                    setBorderHovered(response.id)
                  }
                }}
                onMouseLeave={() => {
                  if (draggedCard !== response.id) {
                    setBorderHovered(null)
                  }
                }}
                style={{
                  position: 'absolute',
                  top: 0,
                  right: 0,
                  bottom: 0,
                  width: '24px',
                  cursor: draggedCard === response.id ? 'grabbing' : (isBorderActive ? 'grab' : 'default'),
                  zIndex: 30,
                  pointerEvents: 'auto',
                  userSelect: 'none',
                  WebkitUserSelect: 'none',
                }}
              />

              {/* Content Area - Not draggable, allows text selection */}
              <div
                style={{
                  position: 'relative',
                  zIndex: 1, // Lower than border z-index (30)
                  padding: '16px',
                  pointerEvents: 'auto', // Always allow pointer events for buttons and text selection
                }}
                onClick={(e) => {
                  // Only toggle if clicking on the content area, not on buttons
                  if (draggedCard !== response.id && !e.target.closest('button')) {
                    toggleCard(response.id)
                  }
                }}
              >
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  marginBottom: '12px',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <Move 
                    size={14} 
                    style={{ 
                      color: currentTheme.accent, 
                      opacity: 0.6,
                      cursor: 'grab'
                    }} 
                    title="Drag to move"
                  />
                  <h3
                    key={`expanded-model-name-${response.id}-${theme}`}
                    style={{
                      fontSize: '1rem',
                      background: currentTheme.accentGradient,
                      WebkitBackgroundClip: 'text',
                      WebkitTextFillColor: 'transparent',
                      margin: 0,
                    }}
                  >
                    {formatModelName(response.modelName)}
                  </h3>
                </div>
                <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                  {ratings[response.id] && (
                    <div
                      style={{
                        display: 'flex',
                        gap: '2px',
                        alignItems: 'center',
                      }}
                    >
                      {[...Array(5)].map((_, i) => (
                        <Star
                          key={i}
                          size={12}
                          fill={i < ratings[response.id] ? currentTheme.accentSecondary : 'transparent'}
                          color={i < ratings[response.id] ? currentTheme.accentSecondary : currentTheme.textMuted}
                        />
                      ))}
                    </div>
                  )}
                  <button
                    onClick={(e) => {
                      e.stopPropagation()
                      // Hide the card (preserve conversation history)
                      setHiddenCards(prev => ({ ...prev, [response.id]: true }))
                      setMaximizedCard(null)
                    }}
                    style={{
                      background: 'rgba(255, 0, 0, 0.1)',
                      border: '1px solid rgba(255, 0, 0, 0.3)',
                      borderRadius: '4px',
                      padding: '4px',
                      color: '#FF0000',
                      cursor: 'pointer',
                    }}
                    title="Hide response"
                  >
                    <X size={14} />
                  </button>
                  <button
                    onClick={(e) => toggleMinimizeCard(response.id, e)}
                    style={{
                      background: currentTheme.buttonBackground,
                      border: `1px solid ${currentTheme.borderLight}`,
                      borderRadius: '4px',
                      padding: '4px',
                      color: currentTheme.text,
                      cursor: 'pointer',
                    }}
                    title="Minimize"
                  >
                    <Minimize2 size={14} />
                  </button>
                  <button
                    onClick={(e) => toggleMaximize(response.id, e)}
                    style={{
                      background: currentTheme.buttonBackground,
                      border: `1px solid ${currentTheme.borderLight}`,
                      borderRadius: '4px',
                      padding: '4px',
                      color: currentTheme.text,
                      cursor: 'pointer',
                    }}
                    title="Maximize"
                  >
                    <Maximize2 size={14} />
                  </button>
                  {hasMoreText && (
                    <button
                      style={{
                        background: 'transparent',
                        border: 'none',
                        color: currentTheme.accent,
                        cursor: 'pointer',
                        padding: '4px',
                      }}
                    >
                      {isExpanded ? (
                        <ChevronUp size={16} />
                      ) : (
                        <ChevronDown size={16} />
                      )}
                    </button>
                  )}
                </div>
              </div>

              <div
                style={{
                  maxHeight: isExpanded ? '400px' : 'auto',
                  overflowY: isExpanded ? 'auto' : 'visible',
                  marginBottom: '12px',
                  userSelect: 'text',
                  WebkitUserSelect: 'text',
                  cursor: 'text',
                  wordBreak: 'break-word',
                }}
              >
                {response.isStreaming ? (
                  <p style={{
                    color: currentTheme.textSecondary,
                    lineHeight: '1.5',
                    fontSize: '0.9rem',
                    whiteSpace: 'pre-wrap',
                    margin: 0,
                  }}>
                    {displayText}
                    <span style={{
                      display: 'inline-block',
                      width: '6px',
                      height: '14px',
                      background: currentTheme.accent,
                      marginLeft: '2px',
                      animation: 'blink 1s step-end infinite',
                      verticalAlign: 'text-bottom',
                    }} />
                  </p>
                ) : (
                  <MarkdownRenderer content={displayText} theme={currentTheme} fontSize="0.9rem" />
                )}
              </div>

              {!response.isStreaming && (
              <div
                style={{
                  display: 'flex',
                  gap: '4px',
                  alignItems: 'center',
                  flexWrap: 'wrap',
                }}
              >
                <span style={{ fontSize: '0.75rem', color: currentTheme.textSecondary }}>Rate:</span>
                {[1, 2, 3, 4, 5].map((rating) => (
                  <button
                    key={rating}
                    onClick={(e) => {
                      e.stopPropagation()
                      handleRating(response.id, rating)
                    }}
                    style={{
                      background: 'transparent',
                      border: 'none',
                      cursor: 'pointer',
                      padding: '2px',
                    }}
                  >
                    <Star
                      size={16}
                      fill={ratings[response.id] >= rating ? currentTheme.accentSecondary : 'transparent'}
                      color={ratings[response.id] >= rating ? currentTheme.accentSecondary : currentTheme.textMuted}
                    />
                  </button>
                ))}
              </div>
              )}
              </div>
            </motion.div>
            </React.Fragment>
          )
        })}
        
        {/* Sources Card removed — sources are now shown inside each model's conversation area */}

        {/* Sources Maximized View removed — sources are now shown inside each model's conversation area */}

        {/* Restore Hidden Cards Button */}
        {Object.values(hiddenCards).some(Boolean) && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            onClick={() => setHiddenCards({})}
            style={{
              width: '100%',
              minWidth: cardWidth,
              maxWidth: cardWidth,
              background: theme === 'light' ? '#ffffff' : currentTheme.buttonBackground,
              border: `1px solid ${currentTheme.borderLight}`,
              borderRadius: '12px',
              padding: '0',
              cursor: 'pointer',
              pointerEvents: 'auto',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.borderColor = currentTheme.borderActive
              e.currentTarget.style.boxShadow = `0 0 15px ${currentTheme.shadow}`
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.borderColor = currentTheme.borderLight
              e.currentTarget.style.boxShadow = 'none'
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
                <RotateCcw size={16} color={currentTheme.accent} />
                <h3
                  style={{
                    fontSize: '0.9rem',
                    background: currentTheme.accentGradient,
                    WebkitBackgroundClip: 'text',
                    WebkitTextFillColor: 'transparent',
                    margin: 0,
                    fontWeight: '500',
                  }}
                >
                  Restore Hidden ({Object.values(hiddenCards).filter(Boolean).length})
                </h3>
              </div>
              <ChevronRight size={16} color={currentTheme.accent} />
            </div>
          </motion.div>
        )}

        {/* Token Usage Card - clickable tab like a model response */}
        {tokenData && tokenData.length > 0 && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            style={{
              width: '100%',
              minWidth: cardWidth,
              maxWidth: cardWidth,
              background: theme === 'light' ? '#ffffff' : 'rgba(93, 173, 226, 0.05)',
              border: `1px solid ${theme === 'light' ? currentTheme.borderLight : 'rgba(93, 173, 226, 0.2)'}`,
              borderRadius: '8px',
              padding: '0',
              boxShadow: 'none',
              cursor: 'pointer',
              pointerEvents: 'auto',
              position: 'relative',
              zIndex: 1000,
              transition: 'all 0.2s ease',
            }}
            onClick={() => setShowTokenUsageModal(true)}
            onMouseEnter={(e) => {
              e.currentTarget.style.borderColor = currentTheme.borderActive
              e.currentTarget.style.background = theme === 'light' ? currentTheme.buttonBackgroundHover : 'rgba(93, 173, 226, 0.3)'
              e.currentTarget.style.boxShadow = `0 0 15px ${currentTheme.shadow}, 0 0 30px ${currentTheme.shadowLight}`
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.borderColor = theme === 'light' ? currentTheme.borderLight : 'rgba(93, 173, 226, 0.2)'
              e.currentTarget.style.background = theme === 'light' ? '#ffffff' : 'rgba(93, 173, 226, 0.05)'
              e.currentTarget.style.boxShadow = 'none'
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
                <Coins size={16} color={currentTheme.accent} />
                <h3
                  style={{
                    fontSize: '0.9rem',
                    background: currentTheme.accentGradient,
                    WebkitBackgroundClip: 'text',
                    WebkitTextFillColor: 'transparent',
                    color: currentTheme.accent,
                    margin: 0,
                    fontWeight: '500',
                  }}
                >
                  Token Usage
                </h3>
              </div>
              <ChevronRight size={16} color={currentTheme.accent} style={{ marginRight: '20px' }} />
            </div>
          </motion.div>
        )}

        {/* Cost Breakdown Card - clickable tab like a model response */}
        {tokenData && tokenData.length > 0 && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            style={{
              width: '100%',
              minWidth: cardWidth,
              maxWidth: cardWidth,
              background: theme === 'light' ? '#ffffff' : 'rgba(255, 215, 0, 0.03)',
              border: `1px solid ${theme === 'light' ? currentTheme.borderLight : 'rgba(255, 215, 0, 0.15)'}`,
              borderRadius: '8px',
              padding: '0',
              boxShadow: 'none',
              cursor: 'pointer',
              pointerEvents: 'auto',
              position: 'relative',
              zIndex: 1000,
              transition: 'all 0.2s ease',
            }}
            onClick={() => setShowCostModal(true)}
            onMouseEnter={(e) => {
              e.currentTarget.style.borderColor = 'rgba(255, 215, 0, 0.5)'
              e.currentTarget.style.background = theme === 'light' ? 'rgba(255, 215, 0, 0.08)' : 'rgba(255, 215, 0, 0.15)'
              e.currentTarget.style.boxShadow = '0 0 15px rgba(255, 215, 0, 0.15), 0 0 30px rgba(255, 215, 0, 0.08)'
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.borderColor = theme === 'light' ? currentTheme.borderLight : 'rgba(255, 215, 0, 0.15)'
              e.currentTarget.style.background = theme === 'light' ? '#ffffff' : 'rgba(255, 215, 0, 0.03)'
              e.currentTarget.style.boxShadow = 'none'
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
                <DollarSign size={16} color="#FFD700" />
                <h3
                  style={{
                    fontSize: '0.9rem',
                    background: 'linear-gradient(90deg, #FFD700, #FFA500)',
                    WebkitBackgroundClip: 'text',
                    WebkitTextFillColor: 'transparent',
                    color: '#FFD700',
                    margin: 0,
                    fontWeight: '500',
                  }}
                >
                  Cost Breakdown
                </h3>
              </div>
              <ChevronRight size={16} color="#FFD700" style={{ marginRight: '20px' }} />
            </div>
          </motion.div>
        )}

        {/* Pipeline and Clear All removed per user request */}
      </div>
    </motion.div>
      )}
    </AnimatePresence>
  )
}

export default ResponseComparison
