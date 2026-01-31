import React, { useState, useEffect } from 'react'
import { motion } from 'framer-motion'
import { X, FileText, Move, Minimize2, Maximize2, ChevronRight } from 'lucide-react'
import { useStore } from '../store/useStore'

const SummaryWindow = () => {
  const summary = useStore((state) => state.summary)
  const clearSummary = useStore((state) => state.clearSummary)
  const isSummaryMinimized = useStore((state) => state.isSummaryMinimized)
  const setSummaryMinimized = useStore((state) => state.setSummaryMinimized)
  const activeTab = useStore((state) => state.activeTab)
  const [position, setPosition] = useState({ x: 0, y: 0 })
  const [isDragging, setIsDragging] = useState(false)
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 })
  const [isInitialized, setIsInitialized] = useState(false)
  const [isMaximized, setIsMaximized] = useState(false)
  
  // Auto-minimize when user navigates away from home tab
  useEffect(() => {
    if (activeTab !== 'home' && summary) {
      setSummaryMinimized(true)
    }
  }, [activeTab, summary, setSummaryMinimized])

  // When summary first appears with multiple models, show it (don't auto-minimize)
  useEffect(() => {
    if (summary && !summary.singleModel && !isSummaryMinimized && activeTab === 'home') {
      // Summary is visible and should stay visible initially
      // User can minimize it if they want
    }
  }, [summary, isSummaryMinimized, activeTab])

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
              clearSummary()
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
            title="Close"
          >
            <X size={16} color="#ffffff" />
          </button>
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
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
              setSummaryMinimized(false)
              setIsMaximized(true) // Directly maximize instead of just expanding
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
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <FileText size={16} color="#00FFFF" />
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
                  Summary
                </h3>
              </div>
              <ChevronRight size={16} color="#00FFFF" style={{ marginRight: '20px' }} />
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
            background: 'rgba(0, 0, 0, 0.95)',
            border: '1px solid rgba(0, 255, 255, 0.3)',
            borderRadius: '16px',
            padding: '30px',
            maxWidth: '900px',
            width: '100%',
            maxHeight: '80vh',
            overflowY: 'auto',
            position: 'relative',
            boxShadow: '0 0 40px rgba(0, 255, 255, 0.4)',
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
              background: 'rgba(0, 255, 255, 0.1)',
              border: '1px solid rgba(0, 255, 255, 0.3)',
              borderRadius: '8px',
              padding: '8px',
              color: '#00FFFF',
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
              <FileText size={28} color="#00FFFF" />
              <h2
                style={{
                  fontSize: '1.8rem',
                  margin: 0,
                  background: 'linear-gradient(90deg, #00FFFF, #00FF00)',
                  WebkitBackgroundClip: 'text',
                  WebkitTextFillColor: 'transparent',
                }}
              >
                Response Summary
              </h2>
            </div>
          </div>

          <div
            style={{
              padding: '20px',
              background: 'rgba(0, 255, 255, 0.05)',
              border: '1px solid rgba(0, 255, 255, 0.2)',
              borderRadius: '12px',
            }}
          >
            <p
              style={{
                color: summary.singleModel ? '#888' : '#cccccc',
                lineHeight: '1.8',
                fontSize: '1rem',
                whiteSpace: 'pre-wrap',
                margin: 0,
                fontStyle: summary.singleModel ? 'italic' : 'normal',
              }}
            >
              {summary.text || 'No summary content available. Check console for errors.'}
            </p>
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
        maxWidth: '500px', // Smaller width for bottom-right positioning
        maxHeight: '400px', // Smaller height for bottom-right positioning
        background: 'rgba(0, 0, 0, 0.95)',
        border: '1px solid rgba(0, 255, 255, 0.3)',
        borderRadius: '16px',
        padding: '30px',
        zIndex: 300,
        boxShadow: '0 0 40px rgba(0, 255, 255, 0.4)',
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
          borderBottom: '1px solid rgba(0, 255, 255, 0.2)',
          cursor: isDragging ? 'grabbing' : 'grab',
          userSelect: 'none',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <Move size={20} color="#00FFFF" style={{ opacity: 0.6 }} />
          <FileText size={28} color="#00FFFF" />
          <h2
            style={{
              fontSize: '1.8rem',
              margin: 0,
              background: 'linear-gradient(90deg, #00FFFF, #00FF00)',
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
            }}
          >
            Response Summary
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
              background: 'rgba(0, 255, 255, 0.1)',
              border: '1px solid rgba(0, 255, 255, 0.3)',
              borderRadius: '8px',
              padding: '8px',
              color: '#00FFFF',
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
              background: 'rgba(0, 255, 255, 0.1)',
              border: '1px solid rgba(0, 255, 255, 0.3)',
              borderRadius: '8px',
              padding: '8px',
              color: '#00FFFF',
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
              clearSummary()
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
          background: 'rgba(0, 255, 255, 0.05)',
          border: '1px solid rgba(0, 255, 255, 0.2)',
          borderRadius: '12px',
        }}
      >
        <p
          style={{
            color: summary.singleModel ? '#888' : '#cccccc',
            lineHeight: '1.8',
            fontSize: '1rem',
            whiteSpace: 'pre-wrap',
            margin: 0,
            fontStyle: summary.singleModel ? 'italic' : 'normal',
          }}
        >
          {summary.text || 'No summary content available. Check console for errors.'}
        </p>
      </div>
    </motion.div>
  )
}

export default SummaryWindow

