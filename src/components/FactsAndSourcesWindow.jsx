import React, { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { X, ChevronDown, ChevronUp, ChevronRight, FileText, Maximize2, Minimize2 } from 'lucide-react'
import { useStore } from '../store/useStore'
import { getTheme } from '../utils/theme'

const FactsAndSourcesWindow = ({ debugData, onClose }) => {
  const [isMinimized, setIsMinimized] = useState(true) // Start minimized by default
  const [isMaximized, setIsMaximized] = useState(false)
  const activeTab = useStore((state) => state.activeTab)
  const theme = useStore((state) => state.theme || 'dark')
  const currentTheme = getTheme(theme)

  // Reset maximized state when minimized
  useEffect(() => {
    if (isMinimized && isMaximized) {
      setIsMaximized(false)
    }
  }, [isMinimized, isMaximized])

  if (!debugData) {
    return null
  }

  // Only show on home tab
  if (activeTab !== 'home') {
    return null
  }

  const cardWidth = '270px' // Wider width with 15px left padding, 15px from prompt window

  // If maximized, show full-screen overlay
  if (isMaximized && !isMinimized) {
    return (
      <div
        style={{
          position: 'fixed',
          top: 0,
          left: 0,
          width: '100vw',
          height: '100vh',
          background: theme === 'light' ? 'rgba(255, 255, 255, 0.95)' : 'rgba(0, 0, 0, 0.95)',
          zIndex: 300,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '40px',
        }}
        onClick={() => {
          setIsMaximized(false)
          setIsMinimized(true) // Return to minimized state
        }}
      >
        <motion.div
          initial={{ scale: 0.9, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          onClick={(e) => e.stopPropagation()}
          style={{
            background: theme === 'light' ? '#ffffff' : 'rgba(0, 0, 0, 0.95)',
            border: `1px solid ${currentTheme.borderLight}`,
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
              setIsMinimized(true) // Return to minimized state
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
                key={`sources-title-maximized-${theme}`}
                style={{
                  fontSize: '1.8rem',
                  margin: 0,
                  background: currentTheme.accentGradient,
                  WebkitBackgroundClip: 'text',
                  WebkitTextFillColor: 'transparent',
                }}
              >
                Sources
              </h2>
            </div>
          </div>

          {/* Search Results Section */}
          {debugData.search && debugData.search.results && debugData.search.results.length > 0 ? (
            <div>
              <div style={{ color: currentTheme.accentSecondary, fontSize: '16px', fontWeight: 'bold', marginBottom: '16px' }}>
                Search Results ({debugData.search.results.length})
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                {debugData.search.results.map((result, index) => (
                  <div
                    key={index}
                    style={{
                      padding: '16px',
                      backgroundColor: theme === 'light' ? currentTheme.backgroundSecondary : '#0a0a0a',
                      borderRadius: '8px',
                      border: `1px solid ${currentTheme.border}`,
                    }}
                  >
                    <div style={{ color: currentTheme.text, marginBottom: '12px', fontWeight: '500', fontSize: '16px' }}>
                      {result.title || 'No title'}
                    </div>
                    {result.snippet && (
                      <div style={{ color: currentTheme.textSecondary, fontSize: '14px', marginBottom: '12px', lineHeight: '1.6' }}>
                        {result.snippet}
                      </div>
                    )}
                    {result.link && (
                      <a
                        href={result.link}
                        target="_blank"
                        rel="noopener noreferrer"
                        style={{
                          color: currentTheme.accent,
                          fontSize: '13px',
                          textDecoration: 'underline',
                          wordBreak: 'break-all',
                        }}
                        onMouseEnter={(e) => e.target.style.color = currentTheme.accentSecondary}
                        onMouseLeave={(e) => e.target.style.color = currentTheme.accent}
                      >
                        🔗 {result.link}
                      </a>
                    )}
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div style={{ 
              padding: '32px', 
              backgroundColor: theme === 'light' ? currentTheme.backgroundSecondary : '#1a0a0a', 
              borderRadius: '8px', 
              border: '1px solid rgba(255, 68, 68, 0.5)',
              textAlign: 'center'
            }}>
              <div style={{ color: '#ff4444', fontSize: '16px', fontWeight: 'bold' }}>
                ⚠️ No sources found
              </div>
            </div>
          )}
        </motion.div>
      </div>
    )
  }

  return (
    <AnimatePresence>
      <div
        style={{
          position: 'fixed',
          top: 'calc(50% - 145px)', // Center vertically - position so middle window is centered
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
          {isMinimized && (
            <button
              onClick={(e) => {
                e.stopPropagation()
                onClose()
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
                e.currentTarget.style.background = currentTheme.backgroundOverlayLight
                e.currentTarget.style.boxShadow = theme === 'light' ? '0 0 10px rgba(0, 0, 0, 0.2)' : '0 0 10px rgba(255, 255, 255, 0.4)'
              }}
              title="Close"
            >
              <X size={16} color={currentTheme.text} />
            </button>
          )}
          <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -20 }}
          onClick={(e) => {
            if (isMinimized) {
              e.stopPropagation()
              setIsMinimized(false)
              setIsMaximized(true) // Directly maximize instead of just expanding
            }
          }}
          style={{
            width: cardWidth,
            maxWidth: cardWidth,
            maxHeight: isMinimized ? 'auto' : 'calc(85vh - 40px)',
            backgroundColor: theme === 'light' ? '#ffffff' : currentTheme.backgroundOverlayLight,
            border: `1px solid ${currentTheme.borderLight}`,
            borderRadius: '12px',
            boxShadow: `0 0 20px ${currentTheme.shadowLight}`,
            zIndex: 1000, // Below the badge
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden',
            transition: 'all 0.3s ease',
            cursor: isMinimized ? 'pointer' : 'default',
            position: 'relative',
            pointerEvents: 'auto',
          }}
        onMouseEnter={(e) => {
          if (isMinimized) {
            e.currentTarget.style.borderColor = currentTheme.borderActive
            e.currentTarget.style.boxShadow = `0 0 30px ${currentTheme.shadow}`
          }
        }}
        onMouseLeave={(e) => {
          if (isMinimized) {
            e.currentTarget.style.borderColor = currentTheme.borderLight
            e.currentTarget.style.boxShadow = `0 0 20px ${currentTheme.shadowLight}`
          }
        }}
      >
        {/* Header - matches council response card style */}
        <div
          style={{
            padding: '12px 16px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            cursor: isMinimized ? 'pointer' : 'default',
            pointerEvents: 'auto',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <FileText size={16} color={currentTheme.accent} />
            <h3
              key={`sources-title-${theme}`}
              style={{
                fontSize: '0.9rem',
                background: currentTheme.accentGradient,
                WebkitBackgroundClip: 'text',
                WebkitTextFillColor: 'transparent',
                margin: 0,
                fontWeight: '500',
              }}
            >
              Sources
            </h3>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            {isMinimized ? (
              <ChevronRight size={16} color={currentTheme.accent} style={{ marginRight: '20px' }} />
            ) : (
              <>
                <button
                  onClick={(e) => {
                    e.stopPropagation()
                    setIsMaximized(true)
                  }}
                  style={{
                    background: currentTheme.buttonBackground,
                    border: `1px solid ${currentTheme.borderLight}`,
                    borderRadius: '4px',
                    padding: '4px',
                    color: currentTheme.accent,
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                  }}
                  title="Maximize"
                >
                  <Maximize2 size={14} />
                </button>
                <button
                  onClick={(e) => {
                    e.stopPropagation()
                    setIsMinimized(true)
                  }}
                  style={{
                    background: currentTheme.buttonBackground,
                    border: `1px solid ${currentTheme.borderLight}`,
                    borderRadius: '4px',
                    padding: '4px',
                    color: currentTheme.accent,
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                  }}
                  title="Minimize"
                >
                  <ChevronUp size={14} />
                </button>
                <button
                  onClick={(e) => {
                    e.stopPropagation()
                    onClose()
                  }}
                  style={{
                    background: 'rgba(255, 0, 0, 0.1)',
                    border: '1px solid rgba(255, 0, 0, 0.3)',
                    borderRadius: '4px',
                    padding: '4px',
                    color: '#FF0000',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                  }}
                  title="Close"
                >
                  <X size={14} />
                </button>
              </>
            )}
          </div>
        </div>

        {!isMinimized && (
          <div
            style={{
              padding: '16px',
              overflowY: 'auto',
              maxHeight: 'calc(85vh - 60px)',
            }}
          >
            {/* Search Results Section */}
            {debugData.search && debugData.search.results && debugData.search.results.length > 0 ? (
              <div>
                <div style={{ color: currentTheme.accentSecondary, fontSize: '14px', fontWeight: 'bold', marginBottom: '12px' }}>
                  Search Results ({debugData.search.results.length})
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                  {debugData.search.results.map((result, index) => (
                    <div
                      key={index}
                      style={{
                        padding: '12px',
                        backgroundColor: theme === 'light' ? currentTheme.backgroundSecondary : '#0a0a0a',
                        borderRadius: '8px',
                        border: `1px solid ${currentTheme.border}`,
                      }}
                    >
                      <div style={{ color: currentTheme.text, marginBottom: '8px', fontWeight: '500', fontSize: '13px' }}>
                        {result.title || 'No title'}
                      </div>
                      {result.snippet && (
                        <div style={{ color: currentTheme.textSecondary, fontSize: '12px', marginBottom: '8px', lineHeight: '1.5' }}>
                          {result.snippet}
                        </div>
                      )}
                      {result.link && (
                        <a
                          href={result.link}
                          target="_blank"
                          rel="noopener noreferrer"
                          style={{
                            color: currentTheme.accent,
                            fontSize: '11px',
                            textDecoration: 'underline',
                            wordBreak: 'break-all',
                          }}
                          onMouseEnter={(e) => e.target.style.color = currentTheme.accentSecondary}
                          onMouseLeave={(e) => e.target.style.color = currentTheme.accent}
                        >
                          🔗 {result.link}
                        </a>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <div style={{ 
                padding: '24px', 
                backgroundColor: theme === 'light' ? currentTheme.backgroundSecondary : '#1a0a0a', 
                borderRadius: '8px', 
                border: '1px solid rgba(255, 68, 68, 0.5)',
                textAlign: 'center'
              }}>
                <div style={{ color: '#ff4444', fontSize: '14px', fontWeight: 'bold' }}>
                  ⚠️ No sources found
                </div>
              </div>
            )}
          </div>
        )}
        </motion.div>
        </div>
      </div>
    </AnimatePresence>
  )
}

export default FactsAndSourcesWindow

