import React, { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Trophy, ChevronDown, ChevronUp, ChevronRight, Maximize2, X, Trash2, Move, Send, Info, FileText, RotateCcw, Search, Globe, Coins, Bug, DollarSign } from 'lucide-react'
import { useStore } from '../store/useStore'
import { getTheme } from '../utils/theme'
import { spacing, fontSize, fontWeight, radius, zIndex, transition, layout, sx, createStyles } from '../utils/styles'
import api from '../utils/api'
import { API_URL, API_PREFIX } from '../utils/config'
import { streamFetch } from '../utils/streamFetch'
import MarkdownRenderer from './MarkdownRenderer'
import TokenUsageWindow from './TokenUsageWindow'
import CostBreakdownWindow from './CostBreakdownWindow'
import PipelineDebugWindow from './PipelineDebugWindow'

const ResponseComparison = () => {
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
  const responses = useStore((state) => state.responses)
  const currentPromptFavorite = useStore((state) => state.currentPromptFavorite)
  const setCurrentPromptFavorite = useStore((state) => state.setCurrentPromptFavorite)
  const currentPromptSessionId = useStore((state) => state.currentPromptSessionId)
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
  const theme = useStore((state) => state.theme || 'dark')
  const currentTheme = getTheme(theme)
  const s = createStyles(currentTheme)
  const [expandedCards, setExpandedCards] = useState<Record<string, boolean>>({})
  // sourcesMinimized/sourcesMaximized removed — sources are now shown inside each model's conversation area
  const [maximizedCard, setMaximizedCard] = useState<string | null>(null)
  const [isMinimized, setIsMinimized] = useState(true) // Start minimized by default
  const [minimizedCards, setMinimizedCards] = useState<Record<string, boolean>>({}) // Track which individual cards are minimized - all start minimized
  const [hiddenCards, setHiddenCards] = useState<Record<string, boolean>>({}) // Track which cards the user has closed (hidden but not removed)
  const [cardPositions, setCardPositions] = useState<Record<string, { x: number; y: number }>>({})
  const [draggedCard, setDraggedCard] = useState<string | null>(null)
  const [borderHovered, setBorderHovered] = useState<string | null>(null)
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 }) // Store mouse offset from card origin
  const hasAutoMinimized = React.useRef(false) // Track if we've already auto-minimized
  const convoEndRefs = React.useRef<Record<string, HTMLDivElement>>({}) // Scroll anchors for auto-scrolling conversation windows
  const convoContainerRefs = React.useRef<Record<string, HTMLDivElement>>({}) // Scrollable container refs for auto-scrolling
  const prevConvoLengths = React.useRef<Record<string, number>>({}) // Track previous conversation lengths for scroll detection
  const [singleResponseMinimized, setSingleResponseMinimized] = useState(false) // Track if single response popup is minimized
  const [singleResponseMaximized, setSingleResponseMaximized] = useState(true) // Start maximized by default
  const [singleResponsePosition, setSingleResponsePosition] = useState({ x: 0, y: 0 })
  const [isDraggingSingleResponse, setIsDraggingSingleResponse] = useState(false)
  const [singleResponseDragOffset, setSingleResponseDragOffset] = useState({ x: 0, y: 0 })
  
  // Conversation state for each response window
  const [conversationInputs, setConversationInputs] = useState<Record<string, string>>({}) // { responseId: 'input text' }
  const [conversationHistories, setConversationHistories] = useState<Record<string, any[]>>({}) // { responseId: [{ user, assistant, timestamp }] }
  const [sendingMessages, setSendingMessages] = useState<Record<string, boolean>>({}) // { responseId: true/false }
  const [searchingInConvo, setSearchingInConvo] = useState<Record<string, boolean>>({}) // { responseId: true/false }
  const [convoSources, setConvoSources] = useState<Record<string, Record<number, any[]>>>({}) // { responseId: { turnIndex: [...sources] } } — per-turn follow-up search results
  const [showConvoSources, setShowConvoSources] = useState<Record<string, boolean>>({}) // { "responseId_turnIndex": true/false } — per-turn toggle
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
    const handleMouseMove = (e: MouseEvent) => {
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

    const handleMouseUp = (e: MouseEvent) => {
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

  const handleFavorite = async (responseId: string) => {
    const isAlreadyFavorite = currentPromptFavorite === responseId
    const newFavorite = isAlreadyFavorite ? null : responseId
    setCurrentPromptFavorite(newFavorite)

    if (currentUser?.id && currentPromptSessionId) {
      try {
        const response = responses.find(r => r.id === responseId)
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

        // Trigger stats refresh so the stats page updates
        const triggerStatsRefresh = useStore.getState().triggerStatsRefresh
        if (triggerStatsRefresh) {
          triggerStatsRefresh()
        }
      } catch (error: any) {
        console.error('[Favorite] Error saving model win:', error)
      }
    }
  }

  const toggleCard = (responseId: string) => {
    setExpandedCards((prev) => ({
      ...prev,
      [responseId]: !prev[responseId],
    }))
    setMaximizedCard(null) // Close maximized view when toggling
  }

  const toggleMaximize = (responseId: string, e: React.MouseEvent) => {
    e.stopPropagation()
    setMaximizedCard(maximizedCard === responseId ? null : responseId)
  }

  const toggleMinimizeCard = (responseId: string, e?: React.MouseEvent) => {
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
  const formatModelName = (modelName: string) => {
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
        const grokVersion = grokParts.map((word, idx) => {
          if (/^\d+$/.test(word) && idx < grokParts.length - 1 && /^\d+$/.test(grokParts[idx + 1])) {
            return `${word  }.` // Join consecutive numbers with dot
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
  const handleSendConversationMessage = async (responseId: string, modelName: string, originalResponse: string) => {
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
      const finalData = await streamFetch(`${API_URL}${API_PREFIX}/model/conversation/stream`, {
        modelName,
        userMessage: input,
        originalResponse,
        responseId
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

      // Token counting is handled server-side — just refresh stats display
      if (currentUser?.id && finalData?.tokens?.total > 0) {
        useStore.getState().triggerStatsRefresh()
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
        api.post('/history/update-conversation', {
          historyId: activeHistoryId,
          turn: {
            type: 'model',
            modelName,
            user: input,
            assistant: finalData?.response || '',
            sources: finalData?.searchResults || [],
          }
        }).then(() => useStore.getState().triggerHistoryRefresh())
          .catch(err => console.error('[History] Error updating model conversation turn:', err.message))
      }
    } catch (error: any) {
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
  const clearConversationForResponse = (responseId: string) => {
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
  const lastResponseIdsRef = React.useRef<string[]>([])

  // Auto-minimize individual cards when they first appear (except when there's only one response)
  useEffect(() => {
    if (responses.length > 0) {
      const newMinimizedCards: Record<string, boolean> = {}
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
    const handleMouseMove = (e: MouseEvent) => {
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
      responseText = response.text.map((item: any) => {
        if (typeof item === 'string') return item
        if (item && typeof item === 'object' && item.text) return item.text
        return JSON.stringify(item)
      }).join(' ')
    } else if (response.text && typeof response.text === 'object') {
      responseText = (response.text as any).text || (response.text as any).content || (response.text as any).message || JSON.stringify(response.text)
    } else {
      responseText = String(response.text || '')
    }

    const handleSingleResponseDragStart = (e: React.MouseEvent) => {
      const rect = e.currentTarget.getBoundingClientRect()
      setSingleResponseDragOffset({
        x: e.clientX - rect.left,
        y: e.clientY - rect.top
      })
      setIsDraggingSingleResponse(true)
    }

    // Show MAXIMIZED view (full-screen overlay) by default
    if (singleResponseMaximized) {
      return (
        <div
          onClick={() => {
            setSingleResponseMaximized(false)
            setHiddenCards(prev => ({ ...prev, [response.id]: true }))
          }}
          style={sx(layout.fixedFill, layout.center, {
            zIndex: zIndex.modal,
            background: theme === 'light' ? 'rgba(0, 0, 0, 0.4)' : 'rgba(0, 0, 0, 0.7)',
            backdropFilter: 'blur(4px)',
          })}
        >
        <motion.div
          ref={el => { if (el) convoContainerRefs.current[response.id] = el }}
          onClick={(e) => e.stopPropagation()}
          initial={{ scale: 0.9, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          style={sx(s.modal, {
            background: theme === 'light' ? '#ffffff' : 'rgba(20, 20, 35, 0.98)',
            padding: spacing['4xl'],
            maxWidth: '900px',
            width: 'calc(100% - 80px)',
            maxHeight: '80vh',
            overflowY: 'auto',
          })}
        >
            {/* Close button */}
            <button
              onClick={() => {
                setSingleResponseMaximized(false)
                setHiddenCards(prev => ({ ...prev, [response.id]: true }))
              }}
              style={{
                position: 'absolute',
                top: '20px',
                right: '20px',
                background: 'rgba(255, 0, 0, 0.1)',
                border: '1px solid rgba(255, 0, 0, 0.3)',
                borderRadius: radius.md,
                padding: spacing.md,
                color: currentTheme.error,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                zIndex: zIndex.base,
              }}
              title="Close"
            >
              <X size={20} />
            </button>

            <div style={{ marginBottom: spacing['3xl'], paddingRight: spacing['5xl'] }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: spacing.lg }}>
                {response.debateRole ? (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: spacing['2xs'] }}>
                    <h2
                      key={`single-response-maximized-title-${theme}`}
                      style={sx(s.gradientText, { fontSize: '1.8rem', margin: 0 })}
                    >
                      {response.debateRole.label}
                    </h2>
                    <span style={{
                      fontSize: fontSize.base,
                      color: currentTheme.textMuted,
                      fontWeight: fontWeight.normal,
                    }}>
                      {formatModelName(response.modelName)}
                    </span>
                  </div>
                ) : (
                  <h2
                    key={`single-response-maximized-title-${theme}`}
                    style={sx(s.gradientText, { fontSize: '1.8rem', margin: 0 })}
                  >
                    {formatModelName(response.modelName)}
                  </h2>
                )}
                {responses.length > 1 && (
                  <button
                    onClick={() => handleFavorite(response.id)}
                    style={{
                      background: currentPromptFavorite === response.id ? currentTheme.accentSecondary : currentTheme.buttonBackground,
                      border: `1px solid ${currentPromptFavorite === response.id ? currentTheme.accentSecondary : currentTheme.borderLight}`,
                      borderRadius: radius.md,
                      padding: `${spacing.xs} ${spacing.lg}`,
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: spacing.xs,
                      color: currentPromptFavorite === response.id ? '#fff' : currentTheme.textSecondary,
                      fontSize: fontSize.sm,
                      fontWeight: currentPromptFavorite === response.id ? fontWeight.semibold : fontWeight.normal,
                      transition: transition.normal,
                      flexShrink: 0,
                    }}
                  >
                    <Trophy size={14} fill={currentPromptFavorite === response.id ? '#fff' : 'transparent'} />
                    Favorite Response
                  </button>
                )}
              </div>
            </div>

            <div
              style={{
                padding: spacing['2xl'],
                background: currentTheme.buttonBackground,
                border: `1px solid ${currentTheme.borderLight}`,
                borderRadius: radius.xl,
              }}
            >
              <MarkdownRenderer content={responseText} theme={currentTheme} fontSize="1rem" lineHeight="1.8" />
            </div>

            {/* Initial Sources — shown with the first prompt+response pair */}
            {(() => {
              const initialSources = Array.isArray(response.sources) ? response.sources : []
              if (initialSources.length === 0) return null
              const toggleKey = `${response.id}_initial`
              return (
                <div style={{ marginTop: spacing.lg }}>
                  <button
                    onClick={() => setShowConvoSources(prev => ({ ...prev, [toggleKey]: !prev[toggleKey] }))}
                    style={{
                      display: 'flex', alignItems: 'center', gap: spacing.sm, padding: `${spacing.sm} ${spacing.lg}`,
                      background: showConvoSources[toggleKey] ? `${currentTheme.accent}15` : currentTheme.buttonBackground,
                      border: `1px solid ${showConvoSources[toggleKey] ? currentTheme.accent : currentTheme.borderLight}`,
                      borderRadius: radius.md, color: currentTheme.accent, fontSize: fontSize.md, fontWeight: fontWeight.medium,
                      cursor: 'pointer', transition: transition.normal,
                    }}
                  >
                    <Globe size={14} />
                    Sources ({initialSources.length})
                    <ChevronDown size={14} style={{ transform: showConvoSources[toggleKey] ? 'rotate(180deg)' : 'rotate(0deg)', transition: 'transform 0.2s' }} />
                  </button>
                  {showConvoSources[toggleKey] && (
                    <motion.div
                      initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }}
                      style={{ marginTop: spacing.md, display: 'flex', flexDirection: 'column', gap: spacing.sm, maxHeight: '200px', overflowY: 'auto' }}
                    >
                      {initialSources.map((source: any, sIdx: number) => (
                        <a key={sIdx} href={source.link} target="_blank" rel="noopener noreferrer"
                          style={{ display: 'block', padding: `${spacing.md} ${spacing.lg}`, background: currentTheme.buttonBackground, border: `1px solid ${currentTheme.borderLight}`, borderRadius: radius.md, textDecoration: 'none', transition: 'border-color 0.2s' }}
                          onMouseEnter={(e) => { e.currentTarget.style.borderColor = currentTheme.accent }}
                          onMouseLeave={(e) => { e.currentTarget.style.borderColor = currentTheme.borderLight }}
                        >
                          <div style={{ fontSize: fontSize.md, fontWeight: fontWeight.semibold, color: currentTheme.accent, marginBottom: spacing['2xs'], overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{source.title}</div>
                          <div style={{ fontSize: fontSize.xs, color: currentTheme.textMuted, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{source.link}</div>
                          {source.snippet && (<div style={{ fontSize: fontSize.sm, color: currentTheme.textSecondary, marginTop: spacing.xs, lineHeight: '1.4', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{source.snippet}</div>)}
                        </a>
                      ))}
                    </motion.div>
                  )}
                </div>
              )
            })()}

            {/* Conversation History */}
            {conversationHistories[response.id]?.length > 0 && (
              <div
                style={{
                  marginTop: spacing['3xl'],
                  paddingTop: spacing['3xl'],
                  borderTop: `1px solid ${currentTheme.borderLight}`,
                }}
              >
                <h3 style={{ 
                  color: currentTheme.text, 
                  fontSize: fontSize['2xl'], 
                  marginBottom: spacing.xl,
                  fontWeight: fontWeight.medium
                }}>
                  Conversation
                </h3>
                <div style={{ display: 'flex', flexDirection: 'column', gap: spacing.xl }}>
                  {conversationHistories[response.id].map((exchange, idx) => (
                    <React.Fragment key={idx}>
                      {/* User follow-up — in a container */}
                      <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                        <div style={{
                          maxWidth: '75%',
                          background: currentTheme.buttonBackground,
                          border: `1px solid ${currentTheme.borderLight}`,
                          borderRadius: '16px 16px 4px 16px',
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
                            fontSize: fontSize.lg,
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
                          marginBottom: spacing.sm,
                          display: 'flex',
                          alignItems: 'center',
                          gap: spacing.sm,
                        }}>
                          <span style={{
                            color: currentTheme.accent,
                            fontSize: fontSize.sm,
                            fontWeight: fontWeight.semibold,
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
                          <div style={{ marginTop: spacing.md, marginBottom: spacing.xs }}>
                            <button
                              onClick={() => setShowConvoSources(prev => ({ ...prev, [toggleKey]: !prev[toggleKey] }))}
                              style={{
                                display: 'flex', alignItems: 'center', gap: spacing.sm, padding: '5px 10px',
                                background: showConvoSources[toggleKey] ? `${currentTheme.accent}15` : currentTheme.buttonBackground,
                                border: `1px solid ${showConvoSources[toggleKey] ? currentTheme.accent : currentTheme.borderLight}`,
                                borderRadius: radius.md, color: currentTheme.accent, fontSize: fontSize.sm, fontWeight: fontWeight.medium,
                                cursor: 'pointer', transition: transition.normal,
                              }}
                            >
                              <Globe size={12} />
                              Sources ({turnSources.length})
                              <ChevronDown size={12} style={{ transform: showConvoSources[toggleKey] ? 'rotate(180deg)' : 'rotate(0deg)', transition: 'transform 0.2s' }} />
                            </button>
                            {showConvoSources[toggleKey] && (
                              <motion.div
                                initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }}
                                style={{ marginTop: spacing.sm, display: 'flex', flexDirection: 'column', gap: spacing.xs, maxHeight: '180px', overflowY: 'auto' }}
                              >
                                {turnSources.map((source, sIdx) => (
                                  <a key={sIdx} href={source.link} target="_blank" rel="noopener noreferrer"
                                    style={{ display: 'block', padding: '6px 10px', background: currentTheme.buttonBackground, border: `1px solid ${currentTheme.borderLight}`, borderRadius: radius.sm, textDecoration: 'none', transition: 'border-color 0.2s' }}
                                    onMouseEnter={(e) => { e.currentTarget.style.borderColor = currentTheme.accent }}
                                    onMouseLeave={(e) => { e.currentTarget.style.borderColor = currentTheme.borderLight }}
                                  >
                                    <div style={{ fontSize: fontSize.sm, fontWeight: fontWeight.semibold, color: currentTheme.accent, marginBottom: spacing['2xs'], overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{source.title}</div>
                                    <div style={{ fontSize: fontSize['2xs'], color: currentTheme.textMuted, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{source.link}</div>
                                    {source.snippet && (<div style={{ fontSize: fontSize.xs, color: currentTheme.textSecondary, marginTop: '3px', lineHeight: '1.4', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{source.snippet}</div>)}
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
                  gap: spacing.sm,
                  padding: `${spacing.sm} ${spacing.lg}`,
                  marginTop: spacing.md,
                  background: currentTheme.buttonBackground,
                  borderRadius: radius['3xl'],
                  width: 'fit-content',
                }}
              >
                <Search size={14} color={currentTheme.accent} />
                <span style={sx(s.gradientText, { fontSize: fontSize.base })}>
                  Searching the web
                </span>
                <motion.span
                  animate={{ opacity: [1, 0.3, 1] }}
                  transition={{ duration: 1.5, repeat: Infinity, ease: 'easeInOut' }}
                  style={s.gradientText}
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
                  gap: spacing.lg,
                  padding: `${spacing.lg} ${spacing.xl}`,
                  marginTop: spacing.xl,
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
                    borderRadius: radius.circle,
                    flexShrink: 0,
                  }}
                />
                <span style={{
                  fontSize: fontSize.base,
                  color: currentTheme.textMuted,
                  fontStyle: 'italic',
                }}>
                  Loading {formatModelName(response.modelName)}'s response...
                </span>
              </motion.div>
            )}

            {/* Scroll anchor for auto-scroll on new message */}
            <div ref={el => { if (el) convoEndRefs.current[response.id] = el }} />

            {/* Conversation Input */}
            <div
              style={{
                marginTop: spacing['3xl'],
                paddingTop: spacing['3xl'],
                borderTop: `1px solid ${currentTheme.borderLight}`,
              }}
            >
              <div style={{ display: 'flex', gap: spacing.lg, alignItems: 'flex-end' }}>
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
                    padding: `${spacing.lg} ${spacing.xl}`,
                    background: currentTheme.buttonBackground,
                    border: `1px solid ${currentTheme.borderLight}`,
                    borderRadius: radius.xl,
                    color: currentTheme.text,
                    fontSize: fontSize.xl,
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
                    borderRadius: radius.xl,
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
                fontSize: fontSize.sm, 
                color: currentTheme.textMuted, 
                marginTop: spacing.md,
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
          borderRadius: radius['2xl'],
          padding: spacing['3xl'],
          zIndex: zIndex.popup,
          boxShadow: `0 0 40px ${currentTheme.shadow}`,
          overflowY: 'auto',
          cursor: isDraggingSingleResponse ? 'grabbing' : 'default',
        }}
      >
        {/* Header - Draggable Area */}
        <div
          onMouseDown={handleSingleResponseDragStart}
          style={sx(layout.spaceBetween, {
            marginBottom: spacing.xl,
            paddingBottom: spacing.lg,
            borderBottom: `1px solid ${currentTheme.borderLight}`,
            cursor: isDraggingSingleResponse ? 'grabbing' : 'grab',
            userSelect: 'none',
          })}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: spacing.lg }}>
            <Move size={20} color={currentTheme.accent} style={{ opacity: 0.6 }} />
            {response.debateRole ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '1px' }}>
                <h2
                  key={`single-response-popup-title-${theme}`}
                  style={sx(s.gradientText, { fontSize: '1.4rem', margin: 0 })}
                >
                  {response.debateRole.label}
                </h2>
                <span style={{
                  fontSize: '0.78rem',
                  color: currentTheme.textMuted,
                  fontWeight: fontWeight.normal,
                }}>
                  {formatModelName(response.modelName)}
                </span>
              </div>
            ) : (
              <h2
                key={`single-response-popup-title-${theme}`}
                style={sx(s.gradientText, { fontSize: '1.4rem', margin: 0 })}
              >
                {formatModelName(response.modelName)}
              </h2>
            )}
          </div>
          <div style={{ display: 'flex', gap: spacing.md, alignItems: 'center' }}>
            {!response.isStreaming && responses.length > 1 && (
              <button
                onClick={(e) => {
                  e.stopPropagation()
                  handleFavorite(response.id)
                }}
                onMouseDown={(e) => e.stopPropagation()}
                style={{
                  background: currentPromptFavorite === response.id ? currentTheme.accentSecondary : currentTheme.buttonBackground,
                  border: `1px solid ${currentPromptFavorite === response.id ? currentTheme.accentSecondary : currentTheme.borderLight}`,
                  borderRadius: radius.md,
                  padding: `${spacing['2xs']} ${spacing.lg}`,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: spacing.xs,
                  color: currentPromptFavorite === response.id ? '#fff' : currentTheme.textSecondary,
                  fontSize: fontSize.sm,
                  fontWeight: currentPromptFavorite === response.id ? fontWeight.semibold : fontWeight.normal,
                  transition: transition.normal,
                }}
              >
                <Trophy size={14} fill={currentPromptFavorite === response.id ? '#fff' : 'transparent'} />
                Favorite Response
              </button>
            )}
            <button
              onClick={(e) => {
                e.stopPropagation()
                setHiddenCards(prev => ({ ...prev, [response.id]: true }))
              }}
              onMouseDown={(e) => e.stopPropagation()}
              style={{
                background: 'rgba(255, 0, 0, 0.1)',
                border: '1px solid rgba(255, 0, 0, 0.3)',
                borderRadius: radius.md,
                padding: spacing.md,
                color: currentTheme.error,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
              title="Close"
            >
              <X size={18} />
            </button>
            <button
              onClick={(e) => {
                e.stopPropagation()
                // Finalize the active history entry before clearing
                const activeHistoryId = useStore.getState().currentHistoryId
                if (activeHistoryId && currentUser?.id) {
                  api.post('/history/finalize', {
                    historyId: activeHistoryId,
                  }).catch(err => console.error('[History] Error finalizing:', err.message))
                }
                clearResponses()
                clearLastSubmittedPrompt()
                // Clear judge and model conversation context
                if (currentUser?.id) {
                  api.post('/judge/clear-context').catch(err => console.error('[Clear Context] Error:', err))
                  api.post('/model/clear-context').catch(err => console.error('[Clear Model Context] Error:', err))
                }
              }}
              onMouseDown={(e) => e.stopPropagation()}
              style={{
                background: 'rgba(255, 0, 0, 0.1)',
                border: '1px solid rgba(255, 0, 0, 0.3)',
                borderRadius: radius.md,
                padding: spacing.md,
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
            padding: spacing.xl,
            background: currentTheme.buttonBackground,
            border: `1px solid ${currentTheme.borderLight}`,
            borderRadius: radius.xl,
          }}
        >
          <MarkdownRenderer content={responseText} theme={currentTheme} fontSize="1rem" lineHeight="1.8" />
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
      responseText = response.text.map((item: any) => {
        if (typeof item === 'string') return item
        if (item && typeof item === 'object' && item.text) return item.text
        return JSON.stringify(item)
      }).join(' ')
    } else if (response.text && typeof response.text === 'object') {
      // Try to extract text from object
      responseText = (response.text as any).text || (response.text as any).content || (response.text as any).message || JSON.stringify(response.text)
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
        style={sx(layout.fixedFill, layout.center, {
          zIndex: zIndex.popup,
          background: theme === 'light' ? 'rgba(0, 0, 0, 0.4)' : 'rgba(0, 0, 0, 0.7)',
          backdropFilter: 'blur(4px)',
        })}
      >
        <motion.div
          ref={el => { if (el) convoContainerRefs.current[response.id] = el }}
          onClick={(e) => e.stopPropagation()}
          initial={{ scale: 0.9, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          style={sx(s.modal, {
            background: theme === 'light' ? '#ffffff' : 'rgba(20, 20, 35, 0.98)',
            border: `1px solid ${currentTheme.borderLight}`,
            padding: spacing['4xl'],
            width: '90%',
            maxWidth: '900px',
            maxHeight: '80vh',
            overflowY: 'auto',
            position: 'relative',
            boxShadow: theme === 'light' 
              ? '0 8px 40px rgba(0, 0, 0, 0.2)' 
              : '0 8px 40px rgba(0, 0, 0, 0.6)',
          })}
        >
          <button
            onClick={() => {
              const cardId = maximizedCard
              setMaximizedCard(null)
              setHiddenCards(prev => ({ ...prev, [cardId]: true }))
            }}
            style={{
              position: 'absolute',
              top: '20px',
              right: '20px',
              background: 'rgba(255, 0, 0, 0.1)',
              border: '1px solid rgba(255, 0, 0, 0.3)',
              borderRadius: radius.md,
              padding: spacing.md,
              color: currentTheme.error,
              cursor: 'pointer',
            }}
            title="Close"
          >
            <X size={20} />
          </button>

          <div style={{ marginBottom: spacing['2xl'] }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: spacing.lg }}>
              {response.debateRole ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '1px' }}>
                  <h3
                    key={`maximized-model-name-${response.id}-${theme}`}
                    style={sx(s.gradientText, { fontSize: fontSize['6xl'], marginBottom: '0' })}
                  >
                    {response.debateRole.label}
                  </h3>
                  <span style={{
                    fontSize: fontSize.md,
                    color: currentTheme.textMuted,
                    fontWeight: fontWeight.normal,
                  }}>
                    {formatModelName(response.modelName)}
                  </span>
                </div>
              ) : (
                <h3
                  key={`maximized-model-name-${response.id}-${theme}`}
                  style={sx(s.gradientText, { fontSize: fontSize['6xl'], marginBottom: '0' })}
                >
                  {formatModelName(response.modelName)}
                </h3>
              )}
              {responses.length > 1 && (
                <button
                  onClick={() => handleFavorite(response.id)}
                  style={{
                    background: currentPromptFavorite === response.id ? currentTheme.accentSecondary : currentTheme.buttonBackground,
                    border: `1px solid ${currentPromptFavorite === response.id ? currentTheme.accentSecondary : currentTheme.borderLight}`,
                    borderRadius: radius.md,
                    padding: `${spacing['2xs']} ${spacing.lg}`,
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: spacing.xs,
                    color: currentPromptFavorite === response.id ? '#fff' : currentTheme.textSecondary,
                    fontSize: fontSize.sm,
                    fontWeight: currentPromptFavorite === response.id ? fontWeight.semibold : fontWeight.normal,
                    transition: transition.normal,
                    flexShrink: 0,
                  }}
                >
                  <Trophy size={14} fill={currentPromptFavorite === response.id ? '#fff' : 'transparent'} />
                  Favorite Response
                </button>
              )}
            </div>
          </div>

          <MarkdownRenderer content={responseText} theme={currentTheme} fontSize="1.1rem" lineHeight="1.8" />

          {/* Initial Sources — shown with the first prompt+response pair */}
          {(() => {
            const initialSources = Array.isArray(response.sources) ? response.sources : []
            if (initialSources.length === 0) return null
            const toggleKey = `${response.id}_initial`
            return (
              <div style={{ marginTop: spacing.lg }}>
                <button
                  onClick={() => setShowConvoSources(prev => ({ ...prev, [toggleKey]: !prev[toggleKey] }))}
                  style={{
                    display: 'flex', alignItems: 'center', gap: spacing.sm, padding: `${spacing.sm} ${spacing.lg}`,
                    background: showConvoSources[toggleKey] ? `${currentTheme.accent}15` : currentTheme.buttonBackground,
                    border: `1px solid ${showConvoSources[toggleKey] ? currentTheme.accent : currentTheme.borderLight}`,
                    borderRadius: radius.md, color: currentTheme.accent, fontSize: fontSize.md, fontWeight: fontWeight.medium,
                    cursor: 'pointer', transition: transition.normal,
                  }}
                >
                  <Globe size={14} />
                  Sources ({initialSources.length})
                  <ChevronDown size={14} style={{ transform: showConvoSources[toggleKey] ? 'rotate(180deg)' : 'rotate(0deg)', transition: 'transform 0.2s' }} />
                </button>
                {showConvoSources[toggleKey] && (
                  <motion.div
                    initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }}
                    style={{ marginTop: spacing.md, display: 'flex', flexDirection: 'column', gap: spacing.sm, maxHeight: '200px', overflowY: 'auto' }}
                  >
                    {initialSources.map((source: any, sIdx: number) => (
                      <a key={sIdx} href={source.link} target="_blank" rel="noopener noreferrer"
                        style={{ display: 'block', padding: `${spacing.md} ${spacing.lg}`, background: currentTheme.buttonBackground, border: `1px solid ${currentTheme.borderLight}`, borderRadius: radius.md, textDecoration: 'none', transition: 'border-color 0.2s' }}
                        onMouseEnter={(e) => { e.currentTarget.style.borderColor = currentTheme.accent }}
                        onMouseLeave={(e) => { e.currentTarget.style.borderColor = currentTheme.borderLight }}
                      >
                        <div style={{ fontSize: fontSize.md, fontWeight: fontWeight.semibold, color: currentTheme.accent, marginBottom: spacing['2xs'], overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{source.title}</div>
                        <div style={{ fontSize: fontSize.xs, color: currentTheme.textMuted, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{source.link}</div>
                        {source.snippet && (<div style={{ fontSize: fontSize.sm, color: currentTheme.textSecondary, marginTop: spacing.xs, lineHeight: '1.4', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{source.snippet}</div>)}
                      </a>
                    ))}
                  </motion.div>
                )}
              </div>
            )
          })()}

          {/* Conversation History */}
          {conversationHistories[response.id]?.length > 0 && (
            <div
              style={{
                marginTop: spacing['3xl'],
                paddingTop: spacing['3xl'],
                borderTop: `1px solid ${currentTheme.borderLight}`,
              }}
            >
              <h3 style={{ 
                color: currentTheme.text, 
                fontSize: fontSize['2xl'], 
                marginBottom: spacing.xl,
                fontWeight: fontWeight.medium
              }}>
                Conversation
              </h3>
              <div style={{ display: 'flex', flexDirection: 'column', gap: spacing.xl }}>
                {conversationHistories[response.id].map((exchange, idx) => (
                  <React.Fragment key={idx}>
                    {/* User follow-up — in a container */}
                    <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                      <div style={{
                        maxWidth: '75%',
                        background: currentTheme.buttonBackground,
                        border: `1px solid ${currentTheme.borderLight}`,
                        borderRadius: '16px 16px 4px 16px',
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
                          {exchange.user}
                        </p>
                      </div>
                    </div>

                    {/* Assistant response — free flowing, no container */}
                    <div style={{ padding: '4px 0 0 4px' }}>
                      <div style={{
                        marginBottom: spacing.md,
                        display: 'flex',
                        alignItems: 'center',
                        gap: spacing.sm,
                      }}>
                        <span style={{
                          color: currentTheme.accent,
                          fontSize: fontSize.md,
                          fontWeight: fontWeight.semibold,
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
                        <div style={{ marginTop: spacing.md, marginBottom: spacing.xs }}>
                          <button
                            onClick={() => setShowConvoSources(prev => ({ ...prev, [toggleKey]: !prev[toggleKey] }))}
                            style={{
                              display: 'flex', alignItems: 'center', gap: spacing.sm, padding: '5px 10px',
                              background: showConvoSources[toggleKey] ? `${currentTheme.accent}15` : currentTheme.buttonBackground,
                              border: `1px solid ${showConvoSources[toggleKey] ? currentTheme.accent : currentTheme.borderLight}`,
                              borderRadius: radius.md, color: currentTheme.accent, fontSize: fontSize.sm, fontWeight: fontWeight.medium,
                              cursor: 'pointer', transition: transition.normal,
                            }}
                          >
                            <Globe size={12} />
                            Sources ({turnSources.length})
                            <ChevronDown size={12} style={{ transform: showConvoSources[toggleKey] ? 'rotate(180deg)' : 'rotate(0deg)', transition: 'transform 0.2s' }} />
                          </button>
                          {showConvoSources[toggleKey] && (
                            <motion.div
                              initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }}
                              style={{ marginTop: spacing.sm, display: 'flex', flexDirection: 'column', gap: spacing.xs, maxHeight: '180px', overflowY: 'auto' }}
                            >
                              {turnSources.map((source, sIdx) => (
                                <a key={sIdx} href={source.link} target="_blank" rel="noopener noreferrer"
                                  style={{ display: 'block', padding: '6px 10px', background: currentTheme.buttonBackground, border: `1px solid ${currentTheme.borderLight}`, borderRadius: radius.sm, textDecoration: 'none', transition: 'border-color 0.2s' }}
                                  onMouseEnter={(e) => { e.currentTarget.style.borderColor = currentTheme.accent }}
                                  onMouseLeave={(e) => { e.currentTarget.style.borderColor = currentTheme.borderLight }}
                                >
                                  <div style={{ fontSize: fontSize.sm, fontWeight: fontWeight.semibold, color: currentTheme.accent, marginBottom: spacing['2xs'], overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{source.title}</div>
                                  <div style={{ fontSize: fontSize['2xs'], color: currentTheme.textMuted, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{source.link}</div>
                                  {source.snippet && (<div style={{ fontSize: fontSize.xs, color: currentTheme.textSecondary, marginTop: '3px', lineHeight: '1.4', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{source.snippet}</div>)}
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
                gap: spacing.sm,
                padding: `${spacing.sm} ${spacing.lg}`,
                marginTop: spacing.md,
                background: currentTheme.buttonBackground,
                borderRadius: radius['3xl'],
                width: 'fit-content',
              }}
            >
              <Search size={14} color={currentTheme.accent} />
              <span style={sx(s.gradientText, { fontSize: fontSize.base })}>
                Searching the web
              </span>
              <motion.span
                animate={{ opacity: [1, 0.3, 1] }}
                transition={{ duration: 1.5, repeat: Infinity, ease: 'easeInOut' }}
                style={s.gradientText}
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
                gap: spacing.lg,
                padding: `${spacing.lg} ${spacing.xl}`,
                marginTop: spacing.xl,
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
                  borderRadius: radius.circle,
                  flexShrink: 0,
                }}
              />
              <span style={{
                fontSize: fontSize.base,
                color: currentTheme.textMuted,
                fontStyle: 'italic',
              }}>
                Loading {formatModelName(response.modelName)}'s response...
              </span>
            </motion.div>
          )}

          {/* Scroll anchor for auto-scroll on new message */}
          <div ref={el => { if (el) convoEndRefs.current[response.id] = el }} />

          {/* Conversation Input */}
          <div
            style={{
              marginTop: spacing['3xl'],
              paddingTop: spacing['3xl'],
              borderTop: `1px solid ${currentTheme.borderLight}`,
            }}
          >
            <div style={{ display: 'flex', gap: spacing.lg, alignItems: 'flex-end' }}>
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
                  padding: `${spacing.lg} ${spacing.xl}`,
                  background: currentTheme.buttonBackground,
                  border: `1px solid ${currentTheme.borderLight}`,
                  borderRadius: radius.xl,
                  color: currentTheme.text,
                  fontSize: fontSize.xl,
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
                  borderRadius: radius.xl,
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
              fontSize: fontSize.sm, 
              color: currentTheme.textMuted, 
              marginTop: spacing.md,
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
        zIndex: zIndex.tooltip,
        overflowY: 'auto',
        overflowX: 'hidden',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'flex-end',
        paddingLeft: spacing.lg,
        paddingBottom: spacing['2xl'],
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
          style={sx(layout.fixedFill, layout.center, {
            zIndex: zIndex.popup,
            background: theme === 'light' ? 'rgba(0, 0, 0, 0.4)' : 'rgba(0, 0, 0, 0.7)',
            backdropFilter: 'blur(4px)',
          })}
        >
          <motion.div
            onClick={(e) => e.stopPropagation()}
            initial={{ scale: 0.9, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            style={sx(s.modal, {
              background: theme === 'light' ? '#ffffff' : 'rgba(20, 20, 35, 0.98)',
              border: `1px solid ${currentTheme.borderLight}`,
              width: '90%',
              maxWidth: '900px',
              maxHeight: '80vh',
              overflowY: 'auto',
              position: 'relative',
              boxShadow: theme === 'light'
                ? '0 8px 40px rgba(0, 0, 0, 0.2)'
                : '0 8px 40px rgba(0, 0, 0, 0.6)',
            })}
          >
            <button
              onClick={() => setShowPipelineModal(false)}
              style={{
                position: 'absolute',
                top: '12px',
                right: '12px',
                background: currentTheme.buttonBackground,
                border: `1px solid ${currentTheme.borderLight}`,
                borderRadius: radius.md,
                padding: spacing.sm,
                cursor: 'pointer',
                color: currentTheme.text,
                zIndex: zIndex.base,
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
          gap: spacing.lg,
          paddingBottom: spacing.lg,
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
            responseText = response.text.map((item: any) => {
              if (typeof item === 'string') return item
              if (item && typeof item === 'object' && item.text) return item.text
              return JSON.stringify(item)
            }).join(' ')
          } else if (response.text && typeof response.text === 'object') {
            // Try to extract text from object
            responseText = (response.text as any).text || (response.text as any).content || (response.text as any).message || JSON.stringify(response.text)
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
                    borderRadius: radius.circle,
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
                {/* Expand Badge - shown once model response is finished */}
                {!response.isStreaming && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation()
                      setMinimizedCards((prev) => ({
                        ...prev,
                        [response.id]: false,
                      }))
                      setMaximizedCard(response.id)
                    }}
                    style={{
                      position: 'absolute',
                      top: '-6px',
                      right: '22px',
                      width: '24px',
                      height: '24px',
                      borderRadius: radius.circle,
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
                      e.currentTarget.style.background = theme === 'light' ? currentTheme.buttonBackgroundHover : 'rgba(93, 173, 226, 0.3)'
                      e.currentTarget.style.boxShadow = theme === 'light' ? '0 0 15px rgba(0, 0, 0, 0.3)' : '0 0 15px rgba(255, 255, 255, 0.5)'
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.background = theme === 'light' ? '#ffffff' : 'rgba(0, 0, 0, 0.9)'
                      e.currentTarget.style.boxShadow = theme === 'light' ? '0 0 10px rgba(0, 0, 0, 0.2)' : '0 0 10px rgba(255, 255, 255, 0.4)'
                    }}
                    title="Expand response"
                  >
                    <Maximize2 size={13} color={currentTheme.text} />
                  </button>
                )}
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
                    borderRadius: radius.md,
                    padding: '0',
                    boxShadow: 'none',
                    cursor: 'pointer',
                    pointerEvents: 'auto',
                    position: 'relative',
                    zIndex: 1000,
                    transition: transition.normal,
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
                    style={sx(layout.spaceBetween, {
                      padding: `${spacing.lg} ${spacing.xl}`,
                    })}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: spacing.md }}>
                      {response.debateRole ? (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0px' }}>
                          <h3
                            key={`model-name-${response.id}-${theme}`}
                            style={sx(s.gradientText, { fontSize: fontSize.lg, margin: 0, fontWeight: fontWeight.medium })}
                          >
                            {response.debateRole.label}
                          </h3>
                          <span style={{
                            fontSize: fontSize.xs,
                            color: currentTheme.textMuted,
                            fontWeight: fontWeight.normal,
                          }}>
                            {formatModelName(response.modelName)}
                          </span>
                        </div>
                      ) : (
                        <h3
                          key={`model-name-${response.id}-${theme}`}
                          style={sx(s.gradientText, { fontSize: fontSize.lg, margin: 0, fontWeight: fontWeight.medium })}
                        >
                          {formatModelName(response.modelName)}
                        </h3>
                      )}
                    </div>
                    <ChevronRight size={16} color={currentTheme.accent} style={{ marginRight: spacing['2xl'] }} />
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
                  borderRadius: radius.xl,
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
                  zIndex: zIndex.dropdown,
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
                  zIndex: zIndex.dropdown,
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
                  zIndex: zIndex.dropdown,
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
                  zIndex: zIndex.dropdown,
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
                  padding: spacing.xl,
                  pointerEvents: 'auto', // Always allow pointer events for buttons and text selection
                }}
                onClick={(e) => {
                  // Only toggle if clicking on the content area, not on buttons
                  if (draggedCard !== response.id && !(e.target as any).closest('button')) {
                    toggleCard(response.id)
                  }
                }}
              >
              <div
                style={sx(layout.spaceBetween, {
                  marginBottom: spacing.lg,
                })}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: spacing.md }}>
                  <span title="Drag to move">
                    <Move 
                      size={14} 
                      style={{ 
                        color: currentTheme.accent, 
                        opacity: 0.6,
                        cursor: 'grab'
                      }} 
                    />
                  </span>
                  {response.debateRole ? (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0px' }}>
                      <h3
                        key={`expanded-model-name-${response.id}-${theme}`}
                        style={sx(s.gradientText, { fontSize: fontSize['2xl'], margin: 0 })}
                      >
                        {response.debateRole.label}
                      </h3>
                      <span style={{
                        fontSize: fontSize.sm,
                        color: currentTheme.textMuted,
                        fontWeight: fontWeight.normal,
                      }}>
                        {formatModelName(response.modelName)}
                      </span>
                    </div>
                  ) : (
                    <h3
                      key={`expanded-model-name-${response.id}-${theme}`}
                      style={sx(s.gradientText, { fontSize: fontSize['2xl'], margin: 0 })}
                    >
                      {formatModelName(response.modelName)}
                    </h3>
                  )}
                </div>
                <div style={{ display: 'flex', gap: spacing.md, alignItems: 'center' }}>
                  {!response.isStreaming && responses.length > 1 && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation()
                        handleFavorite(response.id)
                      }}
                      style={{
                        background: currentPromptFavorite === response.id ? currentTheme.accentSecondary : currentTheme.buttonBackground,
                        border: `1px solid ${currentPromptFavorite === response.id ? currentTheme.accentSecondary : currentTheme.borderLight}`,
                        borderRadius: radius.md,
                        padding: `${spacing['2xs']} ${spacing.lg}`,
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        gap: spacing.xs,
                        color: currentPromptFavorite === response.id ? '#fff' : currentTheme.textSecondary,
                        fontSize: fontSize.sm,
                        fontWeight: currentPromptFavorite === response.id ? fontWeight.semibold : fontWeight.normal,
                        transition: transition.normal,
                      }}
                      title="Favorite Response"
                    >
                      <Trophy size={14} fill={currentPromptFavorite === response.id ? '#fff' : 'transparent'} />
                      Favorite Response
                    </button>
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
                      borderRadius: radius.xs,
                      padding: spacing.xs,
                      color: '#FF0000',
                      cursor: 'pointer',
                    }}
                    title="Hide response"
                  >
                    <X size={14} />
                  </button>
                  {!response.isStreaming && (
                    <button
                      onClick={(e) => toggleMaximize(response.id, e)}
                      style={{
                        background: currentTheme.buttonBackground,
                        border: `1px solid ${currentTheme.borderLight}`,
                        borderRadius: radius.xs,
                        padding: spacing.xs,
                        color: currentTheme.text,
                        cursor: 'pointer',
                      }}
                      title="Expand response"
                    >
                      <Maximize2 size={14} />
                    </button>
                  )}
                  {hasMoreText && (
                    <button
                      style={{
                        background: 'transparent',
                        border: 'none',
                        color: currentTheme.accent,
                        cursor: 'pointer',
                        padding: spacing.xs,
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
                  marginBottom: spacing.lg,
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
                    fontSize: fontSize.lg,
                    whiteSpace: 'pre-wrap',
                    margin: 0,
                  }}>
                    {displayText}
                    <span style={{
                      display: 'inline-block',
                      width: '6px',
                      height: '14px',
                      background: currentTheme.accent,
                      marginLeft: spacing['2xs'],
                      animation: 'blink 1s step-end infinite',
                      verticalAlign: 'text-bottom',
                    }} />
                  </p>
                ) : (
                  <MarkdownRenderer content={displayText} theme={currentTheme} fontSize="0.9rem" />
                )}
              </div>

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
              borderRadius: radius.xl,
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
              style={sx(layout.spaceBetween, { padding: `${spacing.lg} ${spacing.xl}` })}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: spacing.md }}>
                <RotateCcw size={16} color={currentTheme.accent} />
                <h3
                  style={sx(s.gradientText, { fontSize: fontSize.lg, margin: 0, fontWeight: fontWeight.medium })}
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
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.97 }}
            style={{
              width: '100%',
              minWidth: cardWidth,
              maxWidth: cardWidth,
              background: theme === 'light' ? '#ffffff' : '#0d1520',
              border: theme === 'light' ? '1px solid rgba(0, 150, 200, 0.3)' : '1px solid rgba(93, 173, 226, 0.4)',
              borderRadius: radius.lg,
              padding: '0',
              boxShadow: theme === 'light'
                ? '0 3px 12px rgba(0, 0, 0, 0.1)'
                : '0 3px 16px rgba(0, 0, 0, 0.4), 0 0 10px rgba(93, 173, 226, 0.1)',
              cursor: 'pointer',
              pointerEvents: 'auto',
              position: 'relative',
              zIndex: 1000,
              transition: transition.normal,
            }}
            onClick={() => setShowTokenUsageModal(true)}
            onMouseEnter={(e) => {
              e.currentTarget.style.borderColor = currentTheme.borderActive
              e.currentTarget.style.boxShadow = theme === 'light'
                ? '0 4px 20px rgba(0, 0, 0, 0.15), 0 0 10px rgba(0, 150, 200, 0.15)'
                : '0 4px 24px rgba(0, 0, 0, 0.5), 0 0 20px rgba(93, 173, 226, 0.2)'
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.borderColor = theme === 'light' ? 'rgba(0, 150, 200, 0.3)' : 'rgba(93, 173, 226, 0.4)'
              e.currentTarget.style.boxShadow = theme === 'light'
                ? '0 3px 12px rgba(0, 0, 0, 0.1)'
                : '0 3px 16px rgba(0, 0, 0, 0.4), 0 0 10px rgba(93, 173, 226, 0.1)'
            }}
          >
            <div
              style={sx(layout.spaceBetween, { padding: `${spacing.lg} ${spacing.xl}` })}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: spacing.md }}>
                <Coins size={16} color={currentTheme.accent} />
                <h3
                  style={sx(s.gradientText, { fontSize: fontSize.lg, margin: 0, fontWeight: fontWeight.semibold })}
                >
                  Prompt Token Usage
                </h3>
              </div>
              <ChevronRight size={16} color={currentTheme.accent} style={{ marginRight: spacing['2xl'] }} />
            </div>
          </motion.div>
        )}

        {/* Cost Breakdown Card - clickable tab like a model response */}
        {tokenData && tokenData.length > 0 && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.97 }}
            style={{
              width: '100%',
              minWidth: cardWidth,
              maxWidth: cardWidth,
              background: theme === 'light' ? '#ffffff' : '#0d1520',
              border: theme === 'light' ? '1px solid rgba(0, 150, 200, 0.3)' : '1px solid rgba(93, 173, 226, 0.4)',
              borderRadius: radius.lg,
              padding: '0',
              boxShadow: theme === 'light'
                ? '0 3px 12px rgba(0, 0, 0, 0.1)'
                : '0 3px 16px rgba(0, 0, 0, 0.4), 0 0 10px rgba(93, 173, 226, 0.1)',
              cursor: 'pointer',
              pointerEvents: 'auto',
              position: 'relative',
              zIndex: 1000,
              transition: transition.normal,
            }}
            onClick={() => setShowCostModal(true)}
            onMouseEnter={(e) => {
              e.currentTarget.style.borderColor = currentTheme.borderActive
              e.currentTarget.style.boxShadow = theme === 'light'
                ? '0 4px 20px rgba(0, 0, 0, 0.15), 0 0 10px rgba(0, 150, 200, 0.15)'
                : '0 4px 24px rgba(0, 0, 0, 0.5), 0 0 20px rgba(93, 173, 226, 0.2)'
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.borderColor = theme === 'light' ? 'rgba(0, 150, 200, 0.3)' : 'rgba(93, 173, 226, 0.4)'
              e.currentTarget.style.boxShadow = theme === 'light'
                ? '0 3px 12px rgba(0, 0, 0, 0.1)'
                : '0 3px 16px rgba(0, 0, 0, 0.4), 0 0 10px rgba(93, 173, 226, 0.1)'
            }}
          >
            <div
              style={sx(layout.spaceBetween, { padding: `${spacing.lg} ${spacing.xl}` })}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: spacing.md }}>
                <DollarSign size={16} color={currentTheme.accent} />
                <h3
                  style={sx(s.gradientText, { fontSize: fontSize.lg, margin: 0, fontWeight: fontWeight.semibold })}
                >
                  Prompt Cost Breakdown
                </h3>
              </div>
              <ChevronRight size={16} color={currentTheme.accent} style={{ marginRight: spacing['2xl'] }} />
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
