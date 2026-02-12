import React, { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { X, Search, FileText, ChevronDown, ChevronUp, Brain, Users, Gavel, Code } from 'lucide-react'
import TokenUsageWindow from './TokenUsageWindow'
import CostBreakdownWindow from './CostBreakdownWindow'
import CategoryDetectionWindow from './CategoryDetectionWindow'

const PipelineDebugWindow = ({ debugData, onClose, geminiDetectionResponse, tokenData, queryCount, categoryDetectionData }) => {
  const [isMinimized, setIsMinimized] = useState(false) // Start expanded by default
  const [expandedSection, setExpandedSection] = useState('refiner') // Start with refiner expanded

  if (!debugData) {
    return null
  }

  const sections = [
    { key: 'categoryDetection', label: 'Category Detection', icon: Code, color: '#00aaff' },
    { key: 'search', label: 'Search (Serper)', icon: Search, color: '#00ff88' },
    { key: 'refiner', label: 'Refiner Models', icon: FileText, color: '#ffaa00' },
    { key: 'council', label: 'Council Models', icon: Users, color: '#aa00ff' },
    { key: 'judgeFinalization', label: 'Judge Finalization', icon: Gavel, color: '#ff0088' },
    { key: 'conversationContext', label: 'Conversation Context (5 Summaries)', icon: Brain, color: '#5dade2' }
  ]

  const renderCategoryDetection = () => {
    if (!debugData.categoryDetection) return null
    
    const { prompt, response, category, needsSearch } = debugData.categoryDetection
    
    return (
      <div style={{ marginBottom: '16px' }}>
        <div style={{ color: '#00aaff', fontWeight: 'bold', marginBottom: '8px' }}>Model: Gemini 2.5 Flash Lite</div>
        <div style={{ marginBottom: '12px' }}>
          <div style={{ color: '#888', fontSize: '12px', marginBottom: '4px' }}>Category: {category}</div>
          <div style={{ color: '#888', fontSize: '12px' }}>Needs Search: {needsSearch ? 'Yes' : 'No'}</div>
        </div>
        <div style={{ marginBottom: '12px' }}>
          <div style={{ color: '#00aaff', fontSize: '12px', marginBottom: '4px', fontWeight: 'bold' }}>Prompt Sent:</div>
          <div style={{ 
            padding: '8px', 
            backgroundColor: '#0a0a0a', 
            borderRadius: '6px', 
            fontSize: '11px', 
            color: '#ccc',
            maxHeight: '150px',
            overflowY: 'auto',
            fontFamily: 'monospace',
            whiteSpace: 'pre-wrap'
          }}>
            {prompt.substring(0, 500)}...
          </div>
        </div>
        <div>
          <div style={{ color: '#00ff88', fontSize: '12px', marginBottom: '4px', fontWeight: 'bold' }}>Response:</div>
          <div style={{ 
            padding: '8px', 
            backgroundColor: '#0a0a0a', 
            borderRadius: '6px', 
            fontSize: '11px', 
            color: '#ccc',
            maxHeight: '200px',
            overflowY: 'auto',
            fontFamily: 'monospace',
            whiteSpace: 'pre-wrap'
          }}>
            {response}
          </div>
        </div>
      </div>
    )
  }

  const renderSearch = () => {
    if (!debugData.search) return null
    
    const { query, results } = debugData.search
    
    return (
      <div style={{ marginBottom: '16px' }}>
        <div style={{ color: '#00ff88', fontWeight: 'bold', marginBottom: '8px' }}>Query: {query}</div>
        <div style={{ color: '#888', fontSize: '12px', marginBottom: '8px' }}>Results: {results?.length || 0}</div>
        {results && results.length > 0 && (
          <div style={{ maxHeight: '200px', overflowY: 'auto' }}>
            {results.map((result, index) => (
              <div key={index} style={{ marginBottom: '12px', padding: '8px', backgroundColor: '#0a0a0a', borderRadius: '6px' }}>
                <div style={{ color: '#00ff88', fontSize: '12px', fontWeight: 'bold', marginBottom: '4px' }}>
                  {index + 1}. {result.title}
                </div>
                <div style={{ color: '#00aaff', fontSize: '11px', marginBottom: '4px' }}>{result.link}</div>
                <div style={{ color: '#ccc', fontSize: '11px' }}>{result.snippet}</div>
              </div>
            ))}
          </div>
        )}
      </div>
    )
  }

  const renderRefiner = () => {
    if (!debugData.refiner) return null
    
    const { primary, backup, judgeSelection } = debugData.refiner
    
    return (
      <div style={{ marginBottom: '16px' }}>
        {/* Primary Refiner */}
        {primary && (
          <div style={{ marginBottom: '16px', padding: '12px', backgroundColor: '#0a0a0a', borderRadius: '8px', border: '1px solid #333' }}>
            <div style={{ color: '#ffaa00', fontWeight: 'bold', marginBottom: '8px' }}>Primary Refiner: {primary.model}</div>
            <div style={{ marginBottom: '12px' }}>
              <div style={{ color: '#ffaa00', fontSize: '12px', marginBottom: '4px', fontWeight: 'bold' }}>Prompt:</div>
              <div style={{ 
                padding: '8px', 
                backgroundColor: '#000', 
                borderRadius: '4px', 
                fontSize: '10px', 
                color: '#ccc',
                maxHeight: '400px',
                overflowY: 'auto',
                fontFamily: 'monospace',
                whiteSpace: 'pre-wrap'
              }}>
                {primary.prompt || 'No prompt available'}
              </div>
            </div>
            <div style={{ marginBottom: '12px' }}>
              <div style={{ color: '#00ff88', fontSize: '12px', marginBottom: '4px', fontWeight: 'bold' }}>Response:</div>
              <div style={{ 
                padding: '8px', 
                backgroundColor: '#000', 
                borderRadius: '4px', 
                fontSize: '10px', 
                color: '#ccc',
                maxHeight: '400px',
                overflowY: 'auto',
                fontFamily: 'monospace',
                whiteSpace: 'pre-wrap'
              }}>
                {primary.response || 'No response available'}
              </div>
            </div>
            <div style={{ color: '#888', fontSize: '11px' }}>
              Discard Rate: {(primary.discard_rate * 100).toFixed(1)}% | Facts: {primary.facts_with_citations?.length || 0}
            </div>
          </div>
        )}
        
        {/* Backup Refiner */}
        {backup && (
          <div style={{ marginBottom: '16px', padding: '12px', backgroundColor: '#0a0a0a', borderRadius: '8px', border: '1px solid #333' }}>
            <div style={{ color: '#ffaa00', fontWeight: 'bold', marginBottom: '8px' }}>Backup Refiner: {backup.model}</div>
            <div style={{ marginBottom: '12px' }}>
              <div style={{ color: '#ffaa00', fontSize: '12px', marginBottom: '4px', fontWeight: 'bold' }}>Prompt:</div>
              <div style={{ 
                padding: '8px', 
                backgroundColor: '#000', 
                borderRadius: '4px', 
                fontSize: '10px', 
                color: '#ccc',
                maxHeight: '400px',
                overflowY: 'auto',
                fontFamily: 'monospace',
                whiteSpace: 'pre-wrap'
              }}>
                {backup.prompt || 'No prompt available'}
              </div>
            </div>
            <div style={{ marginBottom: '12px' }}>
              <div style={{ color: '#00ff88', fontSize: '12px', marginBottom: '4px', fontWeight: 'bold' }}>Response:</div>
              <div style={{ 
                padding: '8px', 
                backgroundColor: '#000', 
                borderRadius: '4px', 
                fontSize: '10px', 
                color: '#ccc',
                maxHeight: '400px',
                overflowY: 'auto',
                fontFamily: 'monospace',
                whiteSpace: 'pre-wrap'
              }}>
                {backup.response || 'No response available'}
              </div>
            </div>
            <div style={{ color: '#888', fontSize: '11px' }}>
              Discard Rate: {(backup.discard_rate * 100).toFixed(1)}% | Facts: {backup.facts_with_citations?.length || 0}
            </div>
          </div>
        )}
        
        {/* Judge Selection */}
        {judgeSelection && (
          <div style={{ padding: '12px', backgroundColor: '#0a0a0a', borderRadius: '8px', border: '1px solid #333' }}>
            <div style={{ color: '#ff0088', fontWeight: 'bold', marginBottom: '8px' }}>Judge Refiner Selection: Grok 4-1-fast-reasoning</div>
            <div style={{ marginBottom: '12px' }}>
              <div style={{ color: '#ff0088', fontSize: '12px', marginBottom: '4px', fontWeight: 'bold' }}>Prompt:</div>
              <div style={{ 
                padding: '8px', 
                backgroundColor: '#000', 
                borderRadius: '4px', 
                fontSize: '10px', 
                color: '#ccc',
                maxHeight: '150px',
                overflowY: 'auto',
                fontFamily: 'monospace',
                whiteSpace: 'pre-wrap'
              }}>
                {judgeSelection.prompt?.substring(0, 800)}...
              </div>
            </div>
            <div style={{ marginBottom: '12px' }}>
              <div style={{ color: '#00ff88', fontSize: '12px', marginBottom: '4px', fontWeight: 'bold' }}>Response:</div>
              <div style={{ 
                padding: '8px', 
                backgroundColor: '#000', 
                borderRadius: '4px', 
                fontSize: '10px', 
                color: '#ccc',
                maxHeight: '150px',
                overflowY: 'auto',
                fontFamily: 'monospace',
                whiteSpace: 'pre-wrap'
              }}>
                {judgeSelection.response}
              </div>
            </div>
            <div style={{ color: '#888', fontSize: '11px' }}>
              Selected: {judgeSelection.selected} | Reasoning: {judgeSelection.reasoning}
            </div>
          </div>
        )}
      </div>
    )
  }

  const renderCouncil = () => {
    if (!debugData.council || !Array.isArray(debugData.council)) return null
    
    return (
      <div style={{ marginBottom: '16px' }}>
        {debugData.council.map((council, index) => (
          <div key={index} style={{ marginBottom: '16px', padding: '12px', backgroundColor: '#0a0a0a', borderRadius: '8px', border: '1px solid #333' }}>
            <div style={{ color: '#aa00ff', fontWeight: 'bold', marginBottom: '8px' }}>
              {council.model} {council.actual_model && council.actual_model !== council.model && `(${council.actual_model})`}
            </div>
            {council.error ? (
              <div style={{ color: '#ff4444', fontSize: '12px' }}>Error: {council.error}</div>
            ) : (
              <>
                <div style={{ marginBottom: '12px' }}>
                  <div style={{ color: '#aa00ff', fontSize: '12px', marginBottom: '4px', fontWeight: 'bold' }}>Prompt:</div>
                  <div style={{ 
                    padding: '8px', 
                    backgroundColor: '#000', 
                    borderRadius: '4px', 
                    fontSize: '10px', 
                    color: '#ccc',
                    maxHeight: '150px',
                    overflowY: 'auto',
                    fontFamily: 'monospace',
                    whiteSpace: 'pre-wrap'
                  }}>
                    {council.prompt?.substring(0, 800)}...
                  </div>
                </div>
                <div>
                  <div style={{ color: '#00ff88', fontSize: '12px', marginBottom: '4px', fontWeight: 'bold' }}>Response:</div>
                  <div style={{ 
                    padding: '8px', 
                    backgroundColor: '#000', 
                    borderRadius: '4px', 
                    fontSize: '10px', 
                    color: '#ccc',
                    maxHeight: '200px',
                    overflowY: 'auto',
                    fontFamily: 'monospace',
                    whiteSpace: 'pre-wrap'
                  }}>
                    {council.response?.substring(0, 1000)}...
                  </div>
                </div>
              </>
            )}
          </div>
        ))}
      </div>
    )
  }

  const renderJudgeFinalization = () => {
    if (!debugData.judgeFinalization) return null
    
    const { prompt, response, summary, agreements, disagreements } = debugData.judgeFinalization
    
    return (
      <div style={{ marginBottom: '16px' }}>
        <div style={{ color: '#ff0088', fontWeight: 'bold', marginBottom: '8px' }}>Model: Grok 4-1-fast-reasoning</div>
        <div style={{ marginBottom: '12px' }}>
          <div style={{ color: '#ff0088', fontSize: '12px', marginBottom: '4px', fontWeight: 'bold' }}>Prompt:</div>
          <div style={{ 
            padding: '8px', 
            backgroundColor: '#0a0a0a', 
            borderRadius: '6px', 
            fontSize: '11px', 
            color: '#ccc',
            maxHeight: '200px',
            overflowY: 'auto',
            fontFamily: 'monospace',
            whiteSpace: 'pre-wrap'
          }}>
            {prompt?.substring(0, 1000)}...
          </div>
        </div>
        <div style={{ marginBottom: '12px' }}>
          <div style={{ color: '#00ff88', fontSize: '12px', marginBottom: '4px', fontWeight: 'bold' }}>Response:</div>
          <div style={{ 
            padding: '8px', 
            backgroundColor: '#0a0a0a', 
            borderRadius: '6px', 
            fontSize: '11px', 
            color: '#ccc',
            maxHeight: '300px',
            overflowY: 'auto',
            fontFamily: 'monospace',
            whiteSpace: 'pre-wrap'
          }}>
            {response}
          </div>
        </div>
        {summary && (
          <div style={{ marginTop: '12px', padding: '8px', backgroundColor: '#111', borderRadius: '6px' }}>
            <div style={{ color: '#00ff88', fontSize: '12px', fontWeight: 'bold', marginBottom: '4px' }}>Parsed Summary:</div>
            <div style={{ color: '#ccc', fontSize: '11px', marginBottom: '8px' }}>{summary}</div>
            {agreements && agreements.length > 0 && (
              <div style={{ marginBottom: '8px' }}>
                <div style={{ color: '#00ff88', fontSize: '11px', fontWeight: 'bold', marginBottom: '4px' }}>Agreements:</div>
                {agreements.map((agreement, idx) => (
                  <div key={idx} style={{ color: '#ccc', fontSize: '10px', marginLeft: '12px' }}>• {agreement}</div>
                ))}
              </div>
            )}
            {disagreements && disagreements.length > 0 && (
              <div>
                <div style={{ color: '#ff4444', fontSize: '11px', fontWeight: 'bold', marginBottom: '4px' }}>Disagreements:</div>
                {disagreements.map((disagreement, idx) => (
                  <div key={idx} style={{ color: '#ccc', fontSize: '10px', marginLeft: '12px' }}>• {disagreement}</div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    )
  }

  const renderConversationContext = () => {
    if (!debugData.conversationContext || !Array.isArray(debugData.conversationContext)) return null
    
    const context = debugData.conversationContext
    
    if (context.length === 0) {
      return (
        <div style={{ color: '#888', fontSize: '12px', fontStyle: 'italic' }}>
          No conversation context available (no previous judge conversations)
        </div>
      )
    }
    
    return (
      <div style={{ marginBottom: '16px' }}>
        <div style={{ color: '#5dade2', fontWeight: 'bold', marginBottom: '8px' }}>
          Last {context.length} Summary{context.length !== 1 ? 'ies' : ''} (Max 5):
        </div>
        {context.map((ctx, index) => (
          <div key={index} style={{ 
            marginBottom: '12px', 
            padding: '12px', 
            backgroundColor: '#0a0a0a', 
            borderRadius: '6px',
            border: '1px solid rgba(93, 173, 226, 0.2)'
          }}>
            <div style={{ 
              display: 'flex', 
              justifyContent: 'space-between', 
              alignItems: 'center',
              marginBottom: '6px'
            }}>
              <div style={{ color: '#5dade2', fontSize: '11px', fontWeight: 'bold' }}>
                Summary #{index + 1} ({ctx.tokens || 'N/A'} tokens)
              </div>
              {ctx.timestamp && (
                <div style={{ color: '#888', fontSize: '10px' }}>
                  {new Date(ctx.timestamp).toLocaleString()}
                </div>
              )}
            </div>
            <div style={{ 
              color: '#ccc', 
              fontSize: '11px',
              lineHeight: '1.5',
              whiteSpace: 'pre-wrap',
              fontFamily: 'monospace'
            }}>
              {ctx.summary || 'No summary available'}
            </div>
          </div>
        ))}
      </div>
    )
  }

  const renderSectionContent = (sectionKey) => {
    switch (sectionKey) {
      case 'categoryDetection':
        return renderCategoryDetection()
      case 'search':
        return renderSearch()
      case 'refiner':
        return renderRefiner()
      case 'council':
        return renderCouncil()
      case 'judgeFinalization':
        return renderJudgeFinalization()
      case 'conversationContext':
        return renderConversationContext()
      default:
        return null
    }
  }

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: 20 }}
        style={{
          position: 'fixed',
          top: '20px',
          left: '280px', // Moved right to avoid nav bar (nav bar is ~250px wide)
          width: isMinimized ? '300px' : '500px',
          maxHeight: isMinimized ? '60px' : '500px',
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
            fontWeight: 'bold',
            fontSize: '14px',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Brain size={16} />
            <span>Pipeline Debug Window (Temporary)</span>
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
              maxHeight: 'calc(85vh - 60px)',
            }}
          >
            {/* Token Usage, Cost Breakdown, and Category Detection Windows */}
            <div style={{ marginBottom: '24px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
              {tokenData && tokenData.length > 0 && (
                <div style={{ 
                  border: '1px solid rgba(93, 173, 226, 0.3)', 
                  borderRadius: '8px', 
                  overflow: 'hidden',
                  backgroundColor: '#0a0a0a',
                  position: 'relative',
                  zIndex: 1
                }}>
                  <div style={{ position: 'relative', zIndex: 1 }}>
                  <TokenUsageWindow
                    isOpen={true}
                    onClose={() => {}}
                    tokenData={tokenData}
                    inline={true}
                  />
                  </div>
                </div>
              )}
              {tokenData && tokenData.length > 0 && (
                <div style={{ 
                  border: '1px solid rgba(255, 215, 0, 0.3)', 
                  borderRadius: '8px', 
                  overflow: 'hidden',
                  backgroundColor: '#0a0a0a',
                  position: 'relative',
                  zIndex: 1
                }}>
                  <div style={{ position: 'relative', zIndex: 1 }}>
                  <CostBreakdownWindow
                    isOpen={true}
                    onClose={() => {}}
                    tokenData={tokenData}
                    queryCount={queryCount || 0}
                    inline={true}
                  />
                  </div>
                </div>
              )}
              {categoryDetectionData && (
                <div style={{ 
                  border: '1px solid rgba(93, 173, 226, 0.3)', 
                  borderRadius: '8px', 
                  overflow: 'hidden',
                  backgroundColor: '#0a0a0a',
                  position: 'relative',
                  zIndex: 1
                }}>
                  <div style={{ position: 'relative', zIndex: 1 }}>
                  <CategoryDetectionWindow
                    isOpen={true}
                    onClose={() => {}}
                    detectionData={categoryDetectionData}
                    inline={true}
                  />
                  </div>
                </div>
              )}
            </div>

            {sections.map((section) => {
              const Icon = section.icon
              const isExpanded = expandedSection === section.key
              const hasData = debugData[section.key]
              
              if (!hasData) return null
              
              return (
                <div key={section.key} style={{ marginBottom: '16px' }}>
                  <button
                    onClick={() => setExpandedSection(isExpanded ? null : section.key)}
                    style={{
                      width: '100%',
                      padding: '12px',
                      backgroundColor: isExpanded ? '#2a2a2a' : '#1a1a1a',
                      border: `1px solid ${section.color}`,
                      borderRadius: '8px',
                      color: section.color,
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      marginBottom: '8px',
                      fontWeight: 'bold',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <Icon size={16} />
                      <span>{section.label}</span>
                    </div>
                    {isExpanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                  </button>

                  {isExpanded && (
                    <div
                      style={{
                        padding: '12px',
                        backgroundColor: '#0a0a0a',
                        borderRadius: '8px',
                        border: `1px solid #333`,
                      }}
                    >
                      {renderSectionContent(section.key)}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </motion.div>
    </AnimatePresence>
  )
}

export default PipelineDebugWindow
