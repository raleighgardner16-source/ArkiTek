import React, { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { X, Search, FileText, ChevronDown, ChevronUp } from 'lucide-react'

const RAGDebugWindow = ({ searchResults, refinedData, onClose }) => {
  const [isMinimized, setIsMinimized] = useState(false)
  const [expandedSection, setExpandedSection] = useState('search') // 'search' or 'refiner'

  if (!searchResults && !refinedData) {
    return null
  }

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: 20 }}
        style={{
          position: 'fixed',
          bottom: '20px',
          left: '20px',
          width: isMinimized ? '300px' : '600px',
          maxHeight: isMinimized ? '60px' : '80vh',
          backgroundColor: '#1a1a1a',
          border: '2px solid #00ff88',
          borderRadius: '12px',
          boxShadow: '0 8px 32px rgba(0, 255, 136, 0.3)',
          zIndex: 10000,
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
        }}
      >
        {/* Header */}
        <div
          style={{
            padding: '12px 16px',
            backgroundColor: '#00ff88',
            color: '#000',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            cursor: 'move',
            fontWeight: 'bold',
            fontSize: '14px',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Search size={16} />
            <span>RAG Pipeline Debug (Temporary)</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <button
              onClick={() => setIsMinimized(!isMinimized)}
              style={{
                background: 'transparent',
                border: 'none',
                color: '#000',
                cursor: 'pointer',
                padding: '4px',
                display: 'flex',
                alignItems: 'center',
              }}
            >
              {isMinimized ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
            </button>
            <button
              onClick={onClose}
              style={{
                background: 'transparent',
                border: 'none',
                color: '#000',
                cursor: 'pointer',
                padding: '4px',
                display: 'flex',
                alignItems: 'center',
              }}
            >
              <X size={16} />
            </button>
          </div>
        </div>

        {!isMinimized && (
          <div
            style={{
              padding: '16px',
              overflowY: 'auto',
              maxHeight: 'calc(80vh - 60px)',
            }}
          >
            {/* Search Results Section */}
            {searchResults && searchResults.length > 0 && (
              <div style={{ marginBottom: '20px' }}>
                <button
                  onClick={() => setExpandedSection(expandedSection === 'search' ? null : 'search')}
                  style={{
                    width: '100%',
                    padding: '12px',
                    backgroundColor: expandedSection === 'search' ? '#2a2a2a' : '#1a1a1a',
                    border: '1px solid #00ff88',
                    borderRadius: '8px',
                    color: '#00ff88',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    marginBottom: '8px',
                    fontWeight: 'bold',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <Search size={16} />
                    <span>Serper Search Results ({searchResults.length} results)</span>
                  </div>
                  {expandedSection === 'search' ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                </button>

                {expandedSection === 'search' && (
                  <div
                    style={{
                      padding: '12px',
                      backgroundColor: '#0a0a0a',
                      borderRadius: '8px',
                      border: '1px solid #333',
                    }}
                  >
                    {searchResults.map((result, index) => {
                      const isLast = index === searchResults.length - 1
                      return (
                        <div
                          key={index}
                          style={{
                            marginBottom: isLast ? '0' : '16px',
                            paddingBottom: isLast ? '0' : '16px',
                            borderBottom: isLast ? 'none' : '1px solid #333',
                          }}
                        >
                        <div style={{ color: '#00ff88', fontWeight: 'bold', marginBottom: '4px' }}>
                          {index + 1}. {result.title}
                        </div>
                        <div style={{ color: '#00aaff', fontSize: '12px', marginBottom: '4px' }}>
                          {result.link}
                        </div>
                        <div style={{ color: '#ccc', fontSize: '13px', lineHeight: '1.5' }}>
                          {result.snippet}
                        </div>
                      </div>
                      )
                    })}
                  </div>
                )}
              </div>
            )}

            {/* Refiner Summary Section */}
            {refinedData && (
              <div>
                <button
                  onClick={() => setExpandedSection(expandedSection === 'refiner' ? null : 'refiner')}
                  style={{
                    width: '100%',
                    padding: '12px',
                    backgroundColor: expandedSection === 'refiner' ? '#2a2a2a' : '#1a1a1a',
                    border: '1px solid #00ff88',
                    borderRadius: '8px',
                    color: '#00ff88',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    marginBottom: '8px',
                    fontWeight: 'bold',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <FileText size={16} />
                    <span>
                      Refiner Summary ({refinedData.facts_with_citations?.length || 0} facts)
                      {refinedData.discard_rate !== undefined && (
                        <span style={{ fontSize: '12px', marginLeft: '8px', opacity: 0.8 }}>
                          ({((1 - refinedData.discard_rate) * 100).toFixed(1)}% verified)
                        </span>
                      )}
                    </span>
                  </div>
                  {expandedSection === 'refiner' ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                </button>

                {expandedSection === 'refiner' && (
                  <div
                    style={{
                      padding: '12px',
                      backgroundColor: '#0a0a0a',
                      borderRadius: '8px',
                      border: '1px solid #333',
                    }}
                  >
                    {/* Data Points (for council) */}
                    {refinedData.data_points && refinedData.data_points.length > 0 && (
                      <div style={{ marginBottom: '16px' }}>
                        <div style={{ color: '#00ff88', fontWeight: 'bold', marginBottom: '8px' }}>
                          Data Points Sent to Council:
                        </div>
                        <div style={{ color: '#ccc', fontSize: '13px', lineHeight: '1.6' }}>
                          {refinedData.data_points.map((point, index) => (
                            <div key={index} style={{ marginBottom: '8px' }}>
                              • {point}
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Facts with Citations */}
                    {refinedData.facts_with_citations && refinedData.facts_with_citations.length > 0 && (
                      <div>
                        <div style={{ color: '#00ff88', fontWeight: 'bold', marginBottom: '8px' }}>
                          Facts with Citations:
                        </div>
                        {refinedData.facts_with_citations.map((fact, index) => (
                          <div
                            key={index}
                            style={{
                              marginBottom: '12px',
                              padding: '8px',
                              backgroundColor: '#111',
                              borderRadius: '6px',
                              border: '1px solid #333',
                            }}
                          >
                            <div style={{ color: '#fff', marginBottom: '4px', fontWeight: '500' }}>
                              {fact.fact}
                            </div>
                            <div
                              style={{
                                color: '#00aaff',
                                fontSize: '12px',
                                fontStyle: 'italic',
                                paddingLeft: '12px',
                                borderLeft: '2px solid #00aaff',
                              }}
                            >
                              Source: "{fact.source_quote}"
                            </div>
                          </div>
                        ))}
                      </div>
                    )}

                    {/* Stats */}
                    <div
                      style={{
                        marginTop: '16px',
                        padding: '8px',
                        backgroundColor: '#111',
                        borderRadius: '6px',
                        fontSize: '12px',
                        color: '#888',
                      }}
                    >
                      {refinedData.backup_used && (
                        <div>⚠️ Backup refiner (Gemini 1.5 Flash) was used</div>
                      )}
                      {refinedData.discard_rate !== undefined && (
                        <div>
                          Discard Rate: {(refinedData.discard_rate * 100).toFixed(1)}% (
                          {refinedData.facts_with_citations?.length || 0} verified facts)
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            )}

            {!searchResults && !refinedData && (
              <div style={{ color: '#888', textAlign: 'center', padding: '20px' }}>
                No debug data available
              </div>
            )}
          </div>
        )}
      </motion.div>
    </AnimatePresence>
  )
}

export default RAGDebugWindow

