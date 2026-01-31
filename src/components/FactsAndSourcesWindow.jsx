import React, { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { X, ChevronDown, ChevronUp, ChevronRight, FileText, Maximize2, Minimize2 } from 'lucide-react'
import { useStore } from '../store/useStore'

const FactsAndSourcesWindow = ({ debugData, onClose }) => {
  const [isMinimized, setIsMinimized] = useState(true) // Start minimized by default
  const [isMaximized, setIsMaximized] = useState(false)
  const activeTab = useStore((state) => state.activeTab)

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

  // Get the facts from the selected refiner (or primary if no judge selection)
  const getFactsWithCitations = () => {
    if (!debugData.refiner) return null
    
    const { primary, backup, judgeSelection } = debugData.refiner
    
    // If judge selected a refiner, use that one; otherwise use primary
    let selectedRefiner = primary
    if (judgeSelection && judgeSelection.selected === 'backup' && backup) {
      selectedRefiner = backup
    }
    
    return selectedRefiner?.facts_with_citations || null
  }

  const factsWithCitations = getFactsWithCitations()
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
          background: 'rgba(0, 0, 0, 0.95)',
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
              setIsMinimized(true) // Return to minimized state
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
                Facts & Sources
              </h2>
            </div>
          </div>

          {/* Serper Search Results Section */}
          {debugData.search && debugData.search.results && debugData.search.results.length > 0 && (
            <div style={{ marginBottom: '24px' }}>
              <div style={{ color: '#00ff88', fontSize: '16px', fontWeight: 'bold', marginBottom: '16px' }}>
                Serper Search Results ({debugData.search.results.length})
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                {debugData.search.results.map((result, index) => (
                  <div
                    key={index}
                    style={{
                      padding: '16px',
                      backgroundColor: '#0a0a0a',
                      borderRadius: '8px',
                      border: '1px solid #333',
                    }}
                  >
                    <div style={{ color: '#fff', marginBottom: '12px', fontWeight: '500', fontSize: '16px' }}>
                      {result.title || 'No title'}
                    </div>
                    {result.snippet && (
                      <div style={{ color: '#aaa', fontSize: '14px', marginBottom: '12px', lineHeight: '1.6' }}>
                        {result.snippet}
                      </div>
                    )}
                    {result.link && (
                      <a
                        href={result.link}
                        target="_blank"
                        rel="noopener noreferrer"
                        style={{
                          color: '#00FFFF',
                          fontSize: '13px',
                          textDecoration: 'underline',
                          wordBreak: 'break-all',
                        }}
                        onMouseEnter={(e) => e.target.style.color = '#00FF88'}
                        onMouseLeave={(e) => e.target.style.color = '#00FFFF'}
                      >
                        🔗 {result.link}
                      </a>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
          
          {factsWithCitations && factsWithCitations.length > 0 ? (
            <div>
              <div style={{ color: '#00aaff', fontSize: '16px', fontWeight: 'bold', marginBottom: '20px' }}>
                Extracted Facts & Sources ({factsWithCitations.length})
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                {factsWithCitations.map((factObj, index) => {
                  const fact = factObj.fact || factObj
                  const sourceQuote = factObj.source_quote || ''
                  const sourceUrl = factObj.source_url || ''
                  
                  return (
                    <div
                      key={index}
                      style={{
                        padding: '20px',
                        backgroundColor: '#0a0a0a',
                        borderRadius: '8px',
                        border: '1px solid #333',
                      }}
                    >
                      <div style={{ color: '#fff', marginBottom: '16px', fontWeight: '500', fontSize: '16px', lineHeight: '1.6' }}>
                        {fact}
                      </div>
                      {sourceQuote && (
                        <div
                          style={{
                            color: '#00aaff',
                            fontSize: '14px',
                            fontStyle: 'italic',
                            paddingLeft: '20px',
                            borderLeft: '3px solid #00aaff',
                            lineHeight: '1.8',
                            marginBottom: '12px',
                          }}
                        >
                          Source: "{sourceQuote}"
                        </div>
                      )}
                      {sourceUrl && (
                        <div style={{ marginTop: '12px', paddingLeft: '20px' }}>
                          <a
                            href={sourceUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            style={{
                              color: '#00FFFF',
                              fontSize: '14px',
                              textDecoration: 'underline',
                              wordBreak: 'break-all',
                            }}
                            onMouseEnter={(e) => e.target.style.color = '#00FF88'}
                            onMouseLeave={(e) => e.target.style.color = '#00FFFF'}
                          >
                            🔗 View Source: {sourceUrl}
                          </a>
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            </div>
          ) : (
            <div style={{ 
              padding: '32px', 
              backgroundColor: '#1a0a0a', 
              borderRadius: '8px', 
              border: '1px solid #ff4444',
              textAlign: 'center'
            }}>
              <div style={{ color: '#ff4444', fontSize: '16px', fontWeight: 'bold' }}>
                ⚠️ No facts found - Refiner returned NOT_FOUND or no relevant data
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
            backgroundColor: 'rgba(0, 0, 0, 0.9)',
            border: '1px solid rgba(0, 255, 255, 0.3)',
            borderRadius: '12px',
            boxShadow: '0 0 20px rgba(0, 255, 255, 0.2)',
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
            e.currentTarget.style.borderColor = 'rgba(0, 255, 255, 0.5)'
            e.currentTarget.style.boxShadow = '0 0 30px rgba(0, 255, 255, 0.3)'
          }
        }}
        onMouseLeave={(e) => {
          if (isMinimized) {
            e.currentTarget.style.borderColor = 'rgba(0, 255, 255, 0.3)'
            e.currentTarget.style.boxShadow = '0 0 20px rgba(0, 255, 255, 0.2)'
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
              Facts & Sources
            </h3>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            {isMinimized ? (
              <ChevronRight size={16} color="#00FFFF" style={{ marginRight: '20px' }} />
            ) : (
              <>
                <button
                  onClick={(e) => {
                    e.stopPropagation()
                    setIsMaximized(true)
                  }}
                  style={{
                    background: 'rgba(0, 255, 255, 0.1)',
                    border: '1px solid rgba(0, 255, 255, 0.3)',
                    borderRadius: '4px',
                    padding: '4px',
                    color: '#00FFFF',
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
                    background: 'rgba(0, 255, 255, 0.1)',
                    border: '1px solid rgba(0, 255, 255, 0.3)',
                    borderRadius: '4px',
                    padding: '4px',
                    color: '#00FFFF',
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
            {/* Serper Search Results Section */}
            {debugData.search && debugData.search.results && debugData.search.results.length > 0 && (
              <div style={{ marginBottom: '24px' }}>
                <div style={{ color: '#00ff88', fontSize: '14px', fontWeight: 'bold', marginBottom: '12px' }}>
                  Serper Search Results ({debugData.search.results.length})
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                  {debugData.search.results.map((result, index) => (
                    <div
                      key={index}
                      style={{
                        padding: '12px',
                        backgroundColor: '#0a0a0a',
                        borderRadius: '8px',
                        border: '1px solid #333',
                      }}
                    >
                      <div style={{ color: '#fff', marginBottom: '8px', fontWeight: '500', fontSize: '13px' }}>
                        {result.title || 'No title'}
                      </div>
                      {result.snippet && (
                        <div style={{ color: '#aaa', fontSize: '12px', marginBottom: '8px', lineHeight: '1.5' }}>
                          {result.snippet}
                        </div>
                      )}
                      {result.link && (
                        <a
                          href={result.link}
                          target="_blank"
                          rel="noopener noreferrer"
                          style={{
                            color: '#00FFFF',
                            fontSize: '11px',
                            textDecoration: 'underline',
                            wordBreak: 'break-all',
                          }}
                          onMouseEnter={(e) => e.target.style.color = '#00FF88'}
                          onMouseLeave={(e) => e.target.style.color = '#00FFFF'}
                        >
                          🔗 {result.link}
                        </a>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}
            
            {factsWithCitations && factsWithCitations.length > 0 ? (
              <div>
                <div style={{ color: '#00aaff', fontSize: '14px', fontWeight: 'bold', marginBottom: '16px' }}>
                  Extracted Facts & Sources ({factsWithCitations.length})
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                  {factsWithCitations.map((factObj, index) => {
                    const fact = factObj.fact || factObj
                    const sourceQuote = factObj.source_quote || ''
                    const sourceUrl = factObj.source_url || ''
                    
                    return (
                      <div
                        key={index}
                        style={{
                          padding: '16px',
                          backgroundColor: '#0a0a0a',
                          borderRadius: '8px',
                          border: '1px solid #333',
                        }}
                      >
                        <div style={{ color: '#fff', marginBottom: '12px', fontWeight: '500', fontSize: '14px', lineHeight: '1.5' }}>
                          {fact}
                        </div>
                        {sourceQuote && (
                          <div
                            style={{
                              color: '#00aaff',
                              fontSize: '12px',
                              fontStyle: 'italic',
                              paddingLeft: '16px',
                              borderLeft: '3px solid #00aaff',
                              lineHeight: '1.6',
                              marginBottom: '8px',
                            }}
                          >
                            Source: "{sourceQuote}"
                          </div>
                        )}
                        {sourceUrl && (
                          <div style={{ marginTop: '8px', paddingLeft: '16px' }}>
                            <a
                              href={sourceUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              style={{
                                color: '#00FFFF',
                                fontSize: '12px',
                                textDecoration: 'underline',
                                wordBreak: 'break-all',
                              }}
                              onMouseEnter={(e) => e.target.style.color = '#00FF88'}
                              onMouseLeave={(e) => e.target.style.color = '#00FFFF'}
                            >
                              🔗 View Source: {sourceUrl}
                            </a>
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
              </div>
            ) : (
              <div style={{ 
                padding: '24px', 
                backgroundColor: '#1a0a0a', 
                borderRadius: '8px', 
                border: '1px solid #ff4444',
                textAlign: 'center'
              }}>
                <div style={{ color: '#ff4444', fontSize: '14px', fontWeight: 'bold' }}>
                  ⚠️ No facts found - Refiner returned NOT_FOUND or no relevant data
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

