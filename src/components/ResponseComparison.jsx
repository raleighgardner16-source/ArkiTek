import React, { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Star, ChevronDown, ChevronUp, ChevronRight, Maximize2, Minimize2, X, Trash2, Move } from 'lucide-react'
import { useStore } from '../store/useStore'
import axios from 'axios'

const ResponseComparison = () => {
  const responses = useStore((state) => state.responses)
  const ratings = useStore((state) => state.ratings)
  const setRating = useStore((state) => state.setRating)
  const removeResponse = useStore((state) => state.removeResponse)
  const clearResponses = useStore((state) => state.clearResponses)
  const currentUser = useStore((state) => state.currentUser)
  const [expandedCards, setExpandedCards] = useState({})
  const [maximizedCard, setMaximizedCard] = useState(null)
  const [isMinimized, setIsMinimized] = useState(true) // Start minimized by default
  const [minimizedCards, setMinimizedCards] = useState({}) // Track which individual cards are minimized - all start minimized
  const [cardPositions, setCardPositions] = useState({})
  const [draggedCard, setDraggedCard] = useState(null)
  const [borderHovered, setBorderHovered] = useState(null)
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 }) // Store mouse offset from card origin
  const hasAutoMinimized = React.useRef(false) // Track if we've already auto-minimized

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
        
        await axios.post('http://localhost:3001/api/ratings', {
          userId: currentUser.id,
          responseId: responseId,
          rating: rating,
          modelName: modelName
        })
        
        console.log('[Rating] Rating saved successfully:', { responseId, rating })
        
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

  // Format model name for display (e.g., "openai-gpt-5.2" -> "OpenAI ChatGPT 5.2")
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
        formattedProvider = 'OpenAI ChatGPT'
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

  if (responses.length === 0) {
    hasAutoMinimized.current = false // Reset when responses clear
    return null
  }

  // Auto-minimize only once when responses first appear (so summary is seen first)
  useEffect(() => {
    if (responses.length > 0 && !hasAutoMinimized.current) {
      // Auto-minimize council responses so summary is seen first (only once)
      setIsMinimized(true)
      hasAutoMinimized.current = true
    }
  }, [responses.length])

  // Auto-minimize all individual cards when they first appear
  useEffect(() => {
    if (responses.length > 0) {
      const newMinimizedCards = {}
      responses.forEach(response => {
        if (minimizedCards[response.id] === undefined) {
          newMinimizedCards[response.id] = true // Start minimized
        } else {
          newMinimizedCards[response.id] = minimizedCards[response.id]
        }
      })
      if (Object.keys(newMinimizedCards).length > 0 && Object.keys(newMinimizedCards).some(id => minimizedCards[id] === undefined)) {
        setMinimizedCards(prev => ({ ...prev, ...newMinimizedCards }))
      }
    }
  }, [responses.length])

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
          setMaximizedCard(null)
          // Return card to minimized state
          setMinimizedCards((prev) => ({
            ...prev,
            [maximizedCard]: true
          }))
        }}
      >
        <motion.div
          initial={{ scale: 0.9, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          onClick={(e) => e.stopPropagation()}
          style={{
            background: 'rgba(0, 0, 0, 0.95)',
            border: '1px solid rgba(0, 255, 255, 0.3)',
            borderRadius: '16px',
            padding: '30px',
            maxWidth: '900px',
            width: '100%',
            maxHeight: '80vh',
            overflowY: 'auto',
            position: 'relative',
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
              background: 'rgba(0, 255, 255, 0.1)',
              border: '1px solid rgba(0, 255, 255, 0.3)',
              borderRadius: '8px',
              padding: '8px',
              color: '#ffffff',
              cursor: 'pointer',
            }}
          >
            <Minimize2 size={20} />
          </button>

          <div style={{ marginBottom: '20px' }}>
            <h3
              style={{
                fontSize: '1.5rem',
                marginBottom: '8px',
                background: 'linear-gradient(90deg, #00FFFF, #00FF00)',
                WebkitBackgroundClip: 'text',
                WebkitTextFillColor: 'transparent',
              }}
            >
              {formatModelName(response.modelName)}
            </h3>
          </div>

          <p
            style={{
              color: '#cccccc',
              lineHeight: '1.8',
              fontSize: '1.1rem',
              whiteSpace: 'pre-wrap',
            }}
          >
            {responseText}
          </p>

          <div
            style={{
              marginTop: '24px',
              paddingTop: '24px',
              borderTop: '1px solid rgba(0, 255, 255, 0.2)',
              display: 'flex',
              gap: '8px',
              alignItems: 'center',
            }}
          >
            <span style={{ fontSize: '0.9rem', color: '#aaaaaa' }}>Rate:</span>
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
                  fill={ratings[response.id] >= rating ? '#00FF00' : 'transparent'}
                  color={ratings[response.id] >= rating ? '#00FF00' : '#666'}
                />
              </button>
            ))}
          </div>
        </motion.div>
      </div>
    )
  }

  return (
    <div
      style={{
        position: 'fixed',
        top: 'calc(50% - 39px)', // Position below Summary (50% - 87px + 48px Summary height + 0px gap, then marginTop adds spacing)
        left: '75px', // 15px padding from nav bar (60px nav + 15px)
        width: `calc(${cardWidth} + 12px)`, // Add space for badge extension
        maxHeight: 'calc(100vh - 100px)', // Leave space for top and bottom
        zIndex: 100,
        overflowY: 'auto', // Allow vertical scrolling if needed
        overflowX: 'visible', // Allow badges to extend horizontally
        pointerEvents: 'none', // Don't block pointer events for cards outside
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'flex-start', // Align to left
        paddingRight: '25px', // Increased padding to accommodate badge extension
        paddingTop: '0px', // No padding - marginTop on inner div handles spacing
      }}
    >
      <div
        style={{
          display: 'flex',
          flexDirection: 'column', // Stack vertically
          gap: '15px', // 15px vertical gap between cards (same as between last card and Clear All)
          paddingBottom: '10px',
          marginTop: '10px', // Gap between Summary and first Council response
          alignItems: 'flex-start',
          pointerEvents: 'none', // Don't block pointer events
          position: 'relative', // Make this a positioning context
          width: '100%', // Full width of container
          overflow: 'visible', // Allow badges to extend outside
        }}
      >
        {responses.map((response, index) => {
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
                {/* X Badge - positioned outside container, overlapping top-right corner, fully visible */}
                <button
                  onClick={(e) => {
                    e.stopPropagation()
                    removeResponse(response.id)
                  }}
                  style={{
                    position: 'absolute',
                    top: '-6px', // Position so full badge is visible, overlapping corner
                    right: '-6px', // Position so full badge is visible, overlapping corner
                    width: '24px',
                    height: '24px',
                    borderRadius: '50%',
                    border: 'none', // No border
                    background: 'rgba(0, 0, 0, 0.9)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    cursor: 'pointer',
                    padding: 0,
                    zIndex: 1001, // Above the container
                    pointerEvents: 'auto',
                    boxShadow: '0 0 10px rgba(255, 255, 255, 0.4)',
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.background = 'rgba(255, 0, 0, 0.3)'
                    e.currentTarget.style.boxShadow = '0 0 15px rgba(255, 255, 255, 0.5)'
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.background = 'rgba(0, 0, 0, 0.9)'
                    e.currentTarget.style.boxShadow = '0 0 10px rgba(255, 255, 255, 0.4)'
                  }}
                  title="Remove response"
                >
                  <X size={16} color="#ffffff" />
                </button>
                <motion.div
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: index * 0.1 }}
                  style={{
                    width: '100%',
                    minWidth: cardWidth,
                    maxWidth: cardWidth,
                    background: 'rgba(0, 0, 0, 0.9)',
                    border: '1px solid rgba(0, 255, 255, 0.3)',
                    borderRadius: '12px',
                    padding: '0',
                    boxShadow: '0 0 20px rgba(0, 255, 255, 0.2)',
                    cursor: 'pointer',
                    pointerEvents: 'auto',
                    position: 'relative',
                    zIndex: 1000,
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
                    e.currentTarget.style.borderColor = 'rgba(0, 255, 255, 0.5)'
                    e.currentTarget.style.boxShadow = '0 0 30px rgba(0, 255, 255, 0.3)'
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.borderColor = 'rgba(0, 255, 255, 0.3)'
                    e.currentTarget.style.boxShadow = '0 0 20px rgba(0, 255, 255, 0.2)'
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
                      style={{
                        fontSize: '0.9rem',
                        background: 'linear-gradient(90deg, #00FFFF, #00FF00)',
                        WebkitBackgroundClip: 'text',
                        WebkitTextFillColor: 'transparent',
                        margin: 0,
                        fontWeight: '500',
                      }}
                    >
                      {formatModelName(response.modelName)}
                    </h3>
                    <ChevronRight size={16} color="#00FFFF" style={{ marginRight: '20px' }} />
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
                  background: 'rgba(0, 0, 0, 0.9)',
                  border: '1px solid rgba(0, 255, 255, 0.3)',
                  borderRadius: '12px',
                  padding: '0',
                  boxShadow: '0 0 20px rgba(0, 255, 255, 0.2)',
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
                  e.currentTarget.style.borderColor = 'rgba(0, 255, 255, 0.5)'
                  e.currentTarget.style.boxShadow = '0 0 30px rgba(0, 255, 255, 0.3)'
                }
              }}
              onMouseLeave={(e) => {
                if (draggedCard !== response.id) {
                  e.currentTarget.style.borderColor = 'rgba(0, 255, 255, 0.3)'
                  e.currentTarget.style.boxShadow = '0 0 20px rgba(0, 255, 255, 0.2)'
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
                      color: '#00FFFF', 
                      opacity: 0.6,
                      cursor: 'grab'
                    }} 
                    title="Drag to move"
                  />
                  <h3
                    style={{
                      fontSize: '1rem',
                      background: 'linear-gradient(90deg, #00FFFF, #00FF00)',
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
                          fill={i < ratings[response.id] ? '#00FF00' : 'transparent'}
                          color={i < ratings[response.id] ? '#00FF00' : '#666'}
                        />
                      ))}
                    </div>
                  )}
                  <button
                    onClick={(e) => {
                      e.stopPropagation()
                      removeResponse(response.id)
                    }}
                    style={{
                      background: 'rgba(255, 0, 0, 0.1)',
                      border: '1px solid rgba(255, 0, 0, 0.3)',
                      borderRadius: '4px',
                      padding: '4px',
                      color: '#FF0000',
                      cursor: 'pointer',
                    }}
                    title="Delete response"
                  >
                    <X size={14} />
                  </button>
                  <button
                    onClick={(e) => toggleMinimizeCard(response.id, e)}
                    style={{
                      background: 'rgba(0, 255, 255, 0.1)',
                      border: '1px solid rgba(0, 255, 255, 0.3)',
                      borderRadius: '4px',
                      padding: '4px',
                      color: '#ffffff',
                      cursor: 'pointer',
                    }}
                    title="Minimize"
                  >
                    <Minimize2 size={14} />
                  </button>
                  <button
                    onClick={(e) => toggleMaximize(response.id, e)}
                    style={{
                      background: 'rgba(0, 255, 255, 0.1)',
                      border: '1px solid rgba(0, 255, 255, 0.3)',
                      borderRadius: '4px',
                      padding: '4px',
                      color: '#ffffff',
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
                        color: '#00FFFF',
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
                }}
              >
                <p
                  style={{
                    color: '#cccccc',
                    lineHeight: '1.5',
                    fontSize: '0.9rem',
                    whiteSpace: 'pre-wrap',
                    wordBreak: 'break-word',
                    margin: 0,
                    userSelect: 'text', // Allow text selection for copying
                    WebkitUserSelect: 'text',
                    cursor: 'text',
                  }}
                >
                  {displayText}
                </p>
              </div>

              <div
                style={{
                  display: 'flex',
                  gap: '4px',
                  alignItems: 'center',
                  flexWrap: 'wrap',
                }}
              >
                <span style={{ fontSize: '0.75rem', color: '#aaaaaa' }}>Rate:</span>
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
                      fill={ratings[response.id] >= rating ? '#00FF00' : 'transparent'}
                      color={ratings[response.id] >= rating ? '#00FF00' : '#666'}
                    />
                  </button>
                ))}
              </div>
              </div>
            </motion.div>
            </React.Fragment>
          )
        })}
        
        {/* Clear All Response Windows Button - Underneath minimized windows */}
        {responses.length > 0 && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            style={{
              width: '100%',
              minWidth: cardWidth,
              maxWidth: cardWidth,
              background: 'rgba(0, 0, 0, 0.9)',
              border: '1px solid rgba(255, 0, 0, 0.3)',
              borderRadius: '12px',
              padding: '0',
              boxShadow: '0 0 20px rgba(255, 0, 0, 0.2)',
              cursor: 'pointer',
              pointerEvents: 'auto',
              // Gap from flex container handles spacing
            }}
            onClick={(e) => {
              e.preventDefault()
              e.stopPropagation()
              // Only clear the Council response windows, not Facts and Sources or Summary
              // Clear responses array directly without clearing other data
              useStore.setState({ responses: [] })
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.borderColor = 'rgba(255, 0, 0, 0.5)'
              e.currentTarget.style.boxShadow = '0 0 30px rgba(255, 0, 0, 0.3)'
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.borderColor = 'rgba(255, 0, 0, 0.3)'
              e.currentTarget.style.boxShadow = '0 0 20px rgba(255, 0, 0, 0.2)'
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
                <Trash2 size={16} color="#FF0000" />
                <h3
                  style={{
                    fontSize: '0.9rem',
                    color: '#FF0000',
                    margin: 0,
                    fontWeight: '500',
                  }}
                >
                  Clear All ({responses.length})
                </h3>
              </div>
              <ChevronRight size={16} color="#FF0000" />
            </div>
          </motion.div>
        )}
      </div>
    </div>
  )
}

export default ResponseComparison
