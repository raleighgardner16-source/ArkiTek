import React, { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { X, ChevronDown, ChevronUp, ChevronRight, FileText, Maximize2, Minimize2 } from 'lucide-react'
import { useStore } from '../store/useStore'
import { getTheme } from '../utils/theme'
import { spacing, fontSize, fontWeight, radius, zIndex, transition, layout, sx, createStyles } from '../utils/styles'

interface Props {
  debugData: any
  onClose: () => void
}

const FactsAndSourcesWindow = ({ debugData, onClose }: Props) => {
  const [isMinimized, setIsMinimized] = useState<boolean>(true)
  const [isMaximized, setIsMaximized] = useState<boolean>(false)
  const activeTab = useStore((state) => state.activeTab)
  const theme = useStore((state) => state.theme || 'dark')
  const currentTheme = getTheme(theme)
  const s = createStyles(currentTheme)

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

  const cardWidth = '270px'

  // If maximized, show full-screen overlay
  if (isMaximized && !isMinimized) {
    return (
      <div
        style={sx(layout.fixedFill, layout.center, {
          background: theme === 'light' ? 'rgba(255, 255, 255, 0.95)' : 'rgba(0, 0, 0, 0.95)',
          zIndex: zIndex.popup,
          padding: spacing['5xl'],
        })}
        onClick={() => {
          setIsMaximized(false)
          setIsMinimized(true)
        }}
      >
        <motion.div
          initial={{ scale: 0.9, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          onClick={(e) => e.stopPropagation()}
          style={{
            background: theme === 'light' ? '#ffffff' : 'rgba(0, 0, 0, 0.95)',
            border: `1px solid ${currentTheme.borderLight}`,
            borderRadius: radius['2xl'],
            padding: spacing['4xl'],
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
              setIsMinimized(true)
            }}
            style={sx(s.iconButton, {
              position: 'absolute',
              top: spacing['2xl'],
              right: spacing['2xl'],
              background: currentTheme.buttonBackground,
              border: `1px solid ${currentTheme.borderLight}`,
              borderRadius: radius.md,
              padding: spacing.md,
              color: currentTheme.accent,
              zIndex: zIndex.base,
            })}
            title="Minimize"
          >
            <Minimize2 size={20} />
          </button>

          <div style={{ marginBottom: spacing['3xl'], paddingRight: spacing['5xl'] }}>
            <div style={sx(layout.flexRow, { gap: spacing.lg })}>
              <FileText size={28} color={currentTheme.accent} />
              <h2
                key={`sources-title-maximized-${theme}`}
                style={sx(s.gradientText, {
                  fontSize: '1.8rem',
                  margin: 0,
                })}
              >
                Sources
              </h2>
            </div>
          </div>

          {/* Search Results Section */}
          {debugData.search && debugData.search.results && debugData.search.results.length > 0 ? (
            <div>
              <div style={{ color: currentTheme.accentSecondary, fontSize: fontSize['2xl'], fontWeight: fontWeight.bold, marginBottom: spacing.xl }}>
                Search Results ({debugData.search.results.length})
              </div>
              <div style={sx(layout.flexCol, { gap: spacing.xl })}>
                {debugData.search.results.map((result: any, index: number) => (
                  <div
                    key={index}
                    style={{
                      padding: spacing.xl,
                      backgroundColor: theme === 'light' ? currentTheme.backgroundSecondary : '#0a0a0a',
                      borderRadius: radius.md,
                      border: `1px solid ${currentTheme.border}`,
                    }}
                  >
                    <div style={{ color: currentTheme.text, marginBottom: spacing.lg, fontWeight: fontWeight.medium, fontSize: fontSize['2xl'] }}>
                      {result.title || 'No title'}
                    </div>
                    {result.snippet && (
                      <div style={{ color: currentTheme.textSecondary, fontSize: '14px', marginBottom: spacing.lg, lineHeight: '1.6' }}>
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
                        onMouseEnter={(e) => (e.target as HTMLElement).style.color = currentTheme.accentSecondary}
                        onMouseLeave={(e) => (e.target as HTMLElement).style.color = currentTheme.accent}
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
              borderRadius: radius.md, 
              border: '1px solid rgba(255, 68, 68, 0.5)',
              textAlign: 'center'
            }}>
              <div style={{ color: '#ff4444', fontSize: fontSize['2xl'], fontWeight: fontWeight.bold }}>
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
          top: 'calc(50% - 145px)',
          left: '75px',
          width: `calc(${cardWidth} + 12px)`,
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
          {/* X Badge */}
          {isMinimized && (
            <button
              onClick={(e) => {
                e.stopPropagation()
                onClose()
              }}
              style={sx(layout.center, {
                position: 'absolute',
                top: '-6px',
                right: '-6px',
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
              setIsMaximized(true)
            }
          }}
          style={sx(layout.flexCol, {
            width: cardWidth,
            maxWidth: cardWidth,
            maxHeight: isMinimized ? 'auto' : 'calc(85vh - 40px)',
            backgroundColor: theme === 'light' ? '#ffffff' : currentTheme.backgroundOverlayLight,
            border: `1px solid ${currentTheme.borderLight}`,
            borderRadius: radius.xl,
            boxShadow: `0 0 20px ${currentTheme.shadowLight}`,
            zIndex: 1000,
            overflow: 'hidden',
            transition: transition.slow,
            cursor: isMinimized ? 'pointer' : 'default',
            position: 'relative',
            pointerEvents: 'auto',
          })}
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
        {/* Header */}
        <div
          style={sx(layout.spaceBetween, {
            padding: `${spacing.lg} ${spacing.xl}`,
            cursor: isMinimized ? 'pointer' : 'default',
            pointerEvents: 'auto',
          })}
        >
          <div style={sx(layout.flexRow, { gap: spacing.md })}>
            <FileText size={16} color={currentTheme.accent} />
            <h3
              key={`sources-title-${theme}`}
              style={sx(s.gradientText, {
                fontSize: fontSize.lg,
                margin: 0,
                fontWeight: fontWeight.medium,
              })}
            >
              Sources
            </h3>
          </div>
          <div style={sx(layout.flexRow, { gap: spacing.md })}>
            {isMinimized ? (
              <ChevronRight size={16} color={currentTheme.accent} style={{ marginRight: spacing['2xl'] }} />
            ) : (
              <>
                <button
                  onClick={(e) => {
                    e.stopPropagation()
                    setIsMaximized(true)
                  }}
                  style={sx(s.iconButton, {
                    background: currentTheme.buttonBackground,
                    border: `1px solid ${currentTheme.borderLight}`,
                    borderRadius: radius.xs,
                    padding: spacing.xs,
                    color: currentTheme.accent,
                  })}
                  title="Maximize"
                >
                  <Maximize2 size={14} />
                </button>
                <button
                  onClick={(e) => {
                    e.stopPropagation()
                    setIsMinimized(true)
                  }}
                  style={sx(s.iconButton, {
                    background: currentTheme.buttonBackground,
                    border: `1px solid ${currentTheme.borderLight}`,
                    borderRadius: radius.xs,
                    padding: spacing.xs,
                    color: currentTheme.accent,
                  })}
                  title="Minimize"
                >
                  <ChevronUp size={14} />
                </button>
                <button
                  onClick={(e) => {
                    e.stopPropagation()
                    onClose()
                  }}
                  style={sx(s.iconButton, {
                    background: 'rgba(255, 0, 0, 0.1)',
                    border: '1px solid rgba(255, 0, 0, 0.3)',
                    borderRadius: radius.xs,
                    padding: spacing.xs,
                    color: '#FF0000',
                  })}
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
              padding: spacing.xl,
              overflowY: 'auto',
              maxHeight: 'calc(85vh - 60px)',
            }}
          >
            {/* Search Results Section */}
            {debugData.search && debugData.search.results && debugData.search.results.length > 0 ? (
              <div>
                <div style={{ color: currentTheme.accentSecondary, fontSize: '14px', fontWeight: fontWeight.bold, marginBottom: spacing.lg }}>
                  Search Results ({debugData.search.results.length})
                </div>
                <div style={sx(layout.flexCol, { gap: spacing.lg })}>
                  {debugData.search.results.map((result: any, index: number) => (
                    <div
                      key={index}
                      style={{
                        padding: spacing.lg,
                        backgroundColor: theme === 'light' ? currentTheme.backgroundSecondary : '#0a0a0a',
                        borderRadius: radius.md,
                        border: `1px solid ${currentTheme.border}`,
                      }}
                    >
                      <div style={{ color: currentTheme.text, marginBottom: spacing.md, fontWeight: fontWeight.medium, fontSize: '13px' }}>
                        {result.title || 'No title'}
                      </div>
                      {result.snippet && (
                        <div style={{ color: currentTheme.textSecondary, fontSize: '12px', marginBottom: spacing.md, lineHeight: '1.5' }}>
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
                      onMouseEnter={(e) => (e.target as HTMLElement).style.color = currentTheme.accentSecondary}
                      onMouseLeave={(e) => (e.target as HTMLElement).style.color = currentTheme.accent}
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
            padding: spacing['3xl'], 
            backgroundColor: theme === 'light' ? currentTheme.backgroundSecondary : '#1a0a0a',
                borderRadius: radius.md, 
                border: '1px solid rgba(255, 68, 68, 0.5)',
                textAlign: 'center'
              }}>
                <div style={{ color: '#ff4444', fontSize: '14px', fontWeight: fontWeight.bold }}>
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
