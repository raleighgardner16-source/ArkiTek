import React, { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { X, Search, FileText, ChevronDown, ChevronUp, Brain, Users, Gavel, Code, MessageSquare, Database } from 'lucide-react'
import TokenUsageWindow from './TokenUsageWindow'
import CostBreakdownWindow from './CostBreakdownWindow'
import CategoryDetectionWindow from './CategoryDetectionWindow'
import { useStore } from '../store/useStore'
import axios from 'axios'
import { API_URL } from '../utils/config'

const PipelineDebugWindow = ({ debugData, onClose, geminiDetectionResponse, tokenData, queryCount, categoryDetectionData, inline = false }) => {
  const [isMinimized, setIsMinimized] = useState(false) // Start expanded by default
  const [expandedSection, setExpandedSection] = useState('memoryContext') // Start with memory context expanded
  const [modelContexts, setModelContexts] = useState({}) // { modelName: [contextEntries] }
  const [loadingModelContexts, setLoadingModelContexts] = useState(false)
  const [liveJudgeContext, setLiveJudgeContext] = useState(null) // live-polled judge context
  const [loadingJudgeContext, setLoadingJudgeContext] = useState(false)
  const currentUser = useStore((state) => state.currentUser)
  const responses = useStore((state) => state.responses || [])

  if (!debugData) {
    return null
  }

  // Fetch both judge + model conversation contexts with live polling
  useEffect(() => {
    if (!currentUser?.id) return
    
    const fetchAllContexts = async () => {
      // Fetch judge context
      setLoadingJudgeContext(true)
      try {
        const judgeRes = await axios.get(`${API_URL}/api/judge/context`, {
          params: { userId: currentUser.id }
        })
        setLiveJudgeContext(judgeRes.data.context || [])
      } catch (err) {
        console.error('[PipelineDebug] Error fetching judge context:', err)
      }
      setLoadingJudgeContext(false)
      
      // Fetch per-model contexts
      if (responses.length > 0) {
        setLoadingModelContexts(true)
        const contexts = {}
        
        for (const resp of responses) {
          const modelName = resp.modelName || resp.actualModelName
          if (!modelName) continue
          try {
            const res = await axios.get(`${API_URL}/api/model/context`, {
              params: { userId: currentUser.id, modelName }
            })
            contexts[modelName] = res.data.context || []
          } catch (err) {
            console.error(`[PipelineDebug] Error fetching context for ${modelName}:`, err)
            contexts[modelName] = []
          }
        }
        
        setModelContexts(contexts)
        setLoadingModelContexts(false)
      }
    }
    
    fetchAllContexts()
    // Poll every 5 seconds so context updates are visible in real time
    const interval = setInterval(fetchAllContexts, 5000)
    return () => clearInterval(interval)
  }, [currentUser?.id, responses.length])

  const sections = [
    { key: 'categoryDetection', label: 'Category Detection', icon: Code, color: '#00aaff' },
    { key: 'memoryContext', label: 'Embedded Memory (Long-Term)', icon: Database, color: '#f39c12' },
    { key: 'search', label: 'Search (Serper)', icon: Search, color: '#00ff88' },
    { key: 'refiner', label: 'Source Processing (Raw)', icon: FileText, color: '#ffaa00' },
    { key: 'council', label: 'Council Models', icon: Users, color: '#aa00ff' },
    { key: 'judgeFinalization', label: 'Judge Finalization', icon: Gavel, color: '#ff0088' },
    { key: 'conversationContext', label: 'Judge Conversation Context (5 Summaries)', icon: Brain, color: '#5dade2' },
    { key: 'modelConversationContext', label: 'Model Conversation Context (per model)', icon: MessageSquare, color: '#48c9b0' }
  ]

  const renderCategoryDetection = () => {
    if (!debugData.categoryDetection) return null
    
    const { prompt, response, category, needsSearch, needsContext } = debugData.categoryDetection
    
    return (
      <div style={{ marginBottom: '16px' }}>
        <div style={{ color: '#00aaff', fontWeight: 'bold', marginBottom: '8px' }}>Model: Gemini 2.5 Flash Lite</div>
        <div style={{ marginBottom: '12px' }}>
          <div style={{ color: '#888', fontSize: '12px', marginBottom: '4px' }}>Category: {category || 'N/A'}</div>
          <div style={{ color: '#888', fontSize: '12px', marginBottom: '4px' }}>Needs Search: {needsSearch ? 'Yes' : 'No'}</div>
          <div style={{ color: '#888', fontSize: '12px' }}>Needs Context: {needsContext ? 'Yes' : 'No'}</div>
        </div>
        {prompt && (
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
            {(prompt || '').substring(0, 500)}...
          </div>
        </div>
        )}
        {response && (
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
        )}
        {!prompt && !response && (
          <div style={{ color: '#888', fontSize: '12px', fontStyle: 'italic' }}>
            Category detection prompt and response details are available in the RAG pipeline path only.
          </div>
        )}
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
    // Refiner no longer processes sources — raw source content is sent directly to council models
    return (
      <div style={{ marginBottom: '16px' }}>
        <div style={{ padding: '12px', backgroundColor: '#0a0a0a', borderRadius: '8px', border: '1px solid #333' }}>
          <div style={{ color: '#ffaa00', fontSize: '12px', fontStyle: 'italic' }}>
            No refiner for source processing — raw scraped source content (up to 2000 chars per source) is sent directly to each council model for interpretation.
          </div>
        </div>
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
    
    const { prompt, response, summary, agreements, disagreements, differences } = debugData.judgeFinalization
    
    return (
      <div style={{ marginBottom: '16px' }}>
        <div style={{ color: '#ff0088', fontWeight: 'bold', marginBottom: '8px' }}>Model: Gemini 3 Flash</div>
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
                <div style={{ color: '#ff4444', fontSize: '11px', fontWeight: 'bold', marginBottom: '4px' }}>Contradictions:</div>
                {disagreements.map((disagreement, idx) => (
                  <div key={idx} style={{ color: '#ccc', fontSize: '10px', marginLeft: '12px' }}>• {disagreement}</div>
                ))}
              </div>
            )}
            {differences && differences.length > 0 && (
              <div>
                <div style={{ color: '#88aaff', fontSize: '11px', fontWeight: 'bold', marginBottom: '4px' }}>Differences:</div>
                {differences.map((diff, idx) => (
                  <div key={idx} style={{ color: '#ccc', fontSize: '10px', marginLeft: '12px' }}>• {diff}</div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    )
  }

  const renderConversationContext = () => {
    // Prefer live-polled context, fall back to debugData snapshot
    const context = liveJudgeContext || debugData.conversationContext || []
    
    if (!Array.isArray(context) || context.length === 0) {
      return (
        <div style={{ color: '#888', fontSize: '12px', fontStyle: 'italic' }}>
          No judge conversation context available (no previous judge conversations)
          {loadingJudgeContext && <span style={{ marginLeft: '8px' }}>(loading...)</span>}
        </div>
      )
    }
    
    return (
      <div style={{ marginBottom: '16px' }}>
        <div style={{ color: '#5dade2', fontWeight: 'bold', marginBottom: '8px', fontSize: '12px' }}>
          Judge rolling window — {context.length} / 5 entries. Position 0 = full response, 1-4 = summarized.
          {loadingJudgeContext && <span style={{ color: '#888', marginLeft: '8px', fontWeight: 'normal' }}>(refreshing...)</span>}
        </div>
        {context.map((ctx, index) => (
          <div key={index} style={{ 
            marginBottom: '12px', 
            padding: '12px', 
            backgroundColor: '#0a0a0a', 
            borderRadius: '6px',
            border: ctx.isFull 
              ? '1px solid rgba(93, 173, 226, 0.5)' 
              : '1px solid rgba(93, 173, 226, 0.2)'
          }}>
            <div style={{ 
              display: 'flex', 
              justifyContent: 'space-between', 
              alignItems: 'center',
              marginBottom: '6px'
            }}>
              <div style={{ 
                color: ctx.isFull ? '#5dade2' : '#48c9b0', 
                fontSize: '11px', 
                fontWeight: 'bold' 
              }}>
                #{index} — {ctx.isFull ? '🟢 FULL RESPONSE' : `📝 SUMMARIZED (${ctx.tokens || 'N/A'} tokens)`}
              </div>
              {ctx.timestamp && (
                <div style={{ color: '#666', fontSize: '10px' }}>
                  {new Date(ctx.timestamp).toLocaleTimeString()}
                </div>
              )}
            </div>
            
            {ctx.originalPrompt && (
              <div style={{ marginBottom: '6px' }}>
                <div style={{ color: '#ffaa00', fontSize: '10px', fontWeight: 'bold', marginBottom: '2px' }}>
                  User prompt:
                </div>
                <div style={{ 
                  color: '#ccc', 
                  fontSize: '10px', 
                  fontFamily: 'monospace',
                  whiteSpace: 'pre-wrap',
                  maxHeight: '60px',
                  overflowY: 'auto'
                }}>
                  {(ctx.originalPrompt || '').substring(0, 300)}{(ctx.originalPrompt || '').length > 300 ? '...' : ''}
                </div>
              </div>
            )}
            
            <div>
              <div style={{ color: '#00ff88', fontSize: '10px', fontWeight: 'bold', marginBottom: '2px' }}>
                {ctx.isFull ? 'Full response:' : 'Summary:'}
              </div>
              <div style={{ 
                color: '#ccc', 
                fontSize: '11px',
                lineHeight: '1.5',
                whiteSpace: 'pre-wrap',
                fontFamily: 'monospace',
                maxHeight: ctx.isFull ? '150px' : '80px',
                overflowY: 'auto'
              }}>
                {ctx.isFull 
                  ? (ctx.response || 'N/A').substring(0, 500) + ((ctx.response || '').length > 500 ? '...' : '')
                  : (ctx.summary || 'No summary available')
                }
              </div>
            </div>
          </div>
        ))}
      </div>
    )
  }

  const renderModelConversationContext = () => {
    const modelNames = Object.keys(modelContexts)
    
    if (loadingModelContexts && modelNames.length === 0) {
      return (
        <div style={{ color: '#888', fontSize: '12px', fontStyle: 'italic' }}>
          Loading model conversation contexts...
        </div>
      )
    }
    
    if (modelNames.length === 0) {
      return (
        <div style={{ color: '#888', fontSize: '12px', fontStyle: 'italic' }}>
          No model conversation contexts available yet. Send a prompt to see context being stored.
        </div>
      )
    }
    
    return (
      <div style={{ marginBottom: '16px' }}>
        <div style={{ color: '#48c9b0', fontWeight: 'bold', marginBottom: '12px', fontSize: '12px' }}>
          Context is stored per-model, server-side. Position 0 = full response, 1-4 = summarized.
          {loadingModelContexts && <span style={{ color: '#888', marginLeft: '8px' }}>(refreshing...)</span>}
        </div>
        
        {modelNames.map(modelName => {
          const context = modelContexts[modelName] || []
          
          return (
            <div key={modelName} style={{ 
              marginBottom: '16px', 
              padding: '12px', 
              backgroundColor: '#111', 
              borderRadius: '8px',
              border: '1px solid rgba(72, 201, 176, 0.3)'
            }}>
              <div style={{ 
                color: '#48c9b0', 
                fontWeight: 'bold', 
                marginBottom: '8px',
                fontSize: '13px',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center'
              }}>
                <span>{modelName}</span>
                <span style={{ fontSize: '11px', color: '#888', fontWeight: 'normal' }}>
                  {context.length} / 5 entries
                </span>
              </div>
              
              {context.length === 0 ? (
                <div style={{ color: '#888', fontSize: '11px', fontStyle: 'italic' }}>
                  No context entries yet
                </div>
              ) : (
                context.map((ctx, idx) => (
                  <div key={idx} style={{ 
                    marginBottom: '8px', 
                    padding: '10px', 
                    backgroundColor: '#0a0a0a', 
                    borderRadius: '6px',
                    border: ctx.isFull 
                      ? '1px solid rgba(72, 201, 176, 0.5)' 
                      : '1px solid rgba(72, 201, 176, 0.15)'
                  }}>
                    <div style={{ 
                      display: 'flex', 
                      justifyContent: 'space-between', 
                      alignItems: 'center',
                      marginBottom: '6px'
                    }}>
                      <div style={{ 
                        color: ctx.isFull ? '#48c9b0' : '#5dade2', 
                        fontSize: '11px', 
                        fontWeight: 'bold' 
                      }}>
                        #{idx} — {ctx.isFull ? '🟢 FULL RESPONSE' : `📝 SUMMARIZED (${ctx.tokens || 'N/A'} tokens)`}
                      </div>
                      {ctx.timestamp && (
                        <div style={{ color: '#666', fontSize: '10px' }}>
                          {new Date(ctx.timestamp).toLocaleTimeString()}
                        </div>
                      )}
                    </div>
                    
                    {ctx.originalPrompt && (
                      <div style={{ marginBottom: '6px' }}>
                        <div style={{ color: '#ffaa00', fontSize: '10px', fontWeight: 'bold', marginBottom: '2px' }}>
                          User prompt:
                        </div>
                        <div style={{ 
                          color: '#ccc', 
                          fontSize: '10px', 
                          fontFamily: 'monospace',
                          whiteSpace: 'pre-wrap',
                          maxHeight: '60px',
                          overflowY: 'auto'
                        }}>
                          {ctx.originalPrompt.substring(0, 300)}{ctx.originalPrompt.length > 300 ? '...' : ''}
                        </div>
                      </div>
                    )}
                    
                    <div>
                      <div style={{ color: '#00ff88', fontSize: '10px', fontWeight: 'bold', marginBottom: '2px' }}>
                        {ctx.isFull ? 'Full response:' : 'Summary:'}
                      </div>
                      <div style={{ 
                        color: '#ccc', 
                        fontSize: '10px',
                        lineHeight: '1.5',
                        whiteSpace: 'pre-wrap',
                        fontFamily: 'monospace',
                        maxHeight: ctx.isFull ? '150px' : '80px',
                        overflowY: 'auto'
                      }}>
                        {ctx.isFull 
                          ? (ctx.response || 'N/A').substring(0, 500) + ((ctx.response || '').length > 500 ? '...' : '')
                          : (ctx.summary || 'No summary available')
                        }
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          )
        })}
      </div>
    )
  }

  const renderMemoryContext = () => {
    const memCtx = debugData.memoryContext
    
    if (!memCtx) {
      return (
        <div style={{ color: '#888', fontSize: '12px', fontStyle: 'italic' }}>
          No memory context data available for this prompt.
        </div>
      )
    }

    return (
      <div style={{ marginBottom: '16px' }}>
        {/* Status Banner */}
        <div style={{ 
          padding: '10px 12px', 
          backgroundColor: memCtx.injected ? 'rgba(243, 156, 18, 0.15)' : 'rgba(136, 136, 136, 0.1)', 
          borderRadius: '8px', 
          marginBottom: '12px',
          border: `1px solid ${memCtx.injected ? 'rgba(243, 156, 18, 0.4)' : 'rgba(136, 136, 136, 0.3)'}`
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
            <span style={{ fontSize: '14px' }}>{memCtx.injected ? '🧠' : '💤'}</span>
            <span style={{ color: memCtx.injected ? '#f39c12' : '#888', fontWeight: 'bold', fontSize: '12px' }}>
              {memCtx.injected 
                ? `${memCtx.items.length} past conversation${memCtx.items.length > 1 ? 's' : ''} injected as context` 
                : 'No relevant past conversations found'}
            </span>
          </div>
          <div style={{ display: 'flex', gap: '16px', fontSize: '11px', color: '#aaa' }}>
            <span>needsContext: <span style={{ color: memCtx.needsContextHint ? '#27ae60' : '#e74c3c', fontWeight: 'bold' }}>
              {memCtx.needsContextHint ? 'true' : 'false'}
            </span></span>
            <span>Score threshold: <span style={{ color: '#f39c12', fontWeight: 'bold' }}>
              {memCtx.scoreThreshold || (memCtx.needsContextHint ? '0.70' : '0.82')}
            </span></span>
          </div>
        </div>

        {/* Individual Memory Items */}
        {memCtx.items && memCtx.items.length > 0 ? (
          memCtx.items.map((item, index) => (
            <div key={item._id || index} style={{ 
              marginBottom: '10px', 
              padding: '12px', 
              backgroundColor: '#0a0a0a', 
              borderRadius: '8px',
              border: '1px solid rgba(243, 156, 18, 0.25)'
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                <div style={{ color: '#f39c12', fontSize: '12px', fontWeight: 'bold' }}>
                  #{index + 1} — Score: {typeof item.score === 'number' ? item.score.toFixed(4) : 'N/A'}
                </div>
                {item.savedAt && (
                  <div style={{ color: '#666', fontSize: '10px' }}>
                    {new Date(item.savedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                  </div>
                )}
              </div>
              
              {item.originalPrompt && (
                <div style={{ marginBottom: '8px' }}>
                  <div style={{ color: '#ffaa00', fontSize: '10px', fontWeight: 'bold', marginBottom: '3px' }}>
                    Original User Prompt:
                  </div>
                  <div style={{ 
                    color: '#ddd', 
                    fontSize: '11px', 
                    fontFamily: 'monospace',
                    whiteSpace: 'pre-wrap',
                    padding: '6px 8px',
                    backgroundColor: '#111',
                    borderRadius: '4px',
                    maxHeight: '60px',
                    overflowY: 'auto'
                  }}>
                    {item.originalPrompt}
                  </div>
                </div>
              )}
              
              {item.title && (
                <div style={{ marginBottom: '6px' }}>
                  <div style={{ color: '#888', fontSize: '10px', fontWeight: 'bold', marginBottom: '2px' }}>Title:</div>
                  <div style={{ color: '#ccc', fontSize: '11px' }}>{item.title}</div>
                </div>
              )}
              
              {item.summary && (
                <div>
                  <div style={{ color: '#00ff88', fontSize: '10px', fontWeight: 'bold', marginBottom: '3px' }}>
                    Summary Injected:
                  </div>
                  <div style={{ 
                    color: '#ccc', 
                    fontSize: '11px',
                    lineHeight: '1.5',
                    whiteSpace: 'pre-wrap',
                    fontFamily: 'monospace',
                    padding: '6px 8px',
                    backgroundColor: '#111',
                    borderRadius: '4px',
                    maxHeight: '120px',
                    overflowY: 'auto'
                  }}>
                    {item.summary}
                  </div>
                </div>
              )}
            </div>
          ))
        ) : (
          <div style={{ 
            padding: '12px', 
            backgroundColor: '#0a0a0a', 
            borderRadius: '8px', 
            border: '1px solid #333',
            color: '#888',
            fontSize: '12px',
            fontStyle: 'italic',
            textAlign: 'center'
          }}>
            {memCtx.needsContextHint 
              ? `Context was requested but no past conversations scored above the threshold (${memCtx.scoreThreshold || '0.70'}).${memCtx.diagnostics ? ` (${memCtx.diagnostics.totalDocs} saved convos, ${memCtx.diagnostics.docsWithEmbedding} have embeddings)` : ''} ${memCtx.diagnostics && memCtx.diagnostics.docsWithEmbedding === 0 ? '⚠️ No embeddings found — the Vector Search index may be missing or building. Check server logs.' : memCtx.diagnostics && memCtx.diagnostics.totalDocs === 0 ? 'No conversation history found yet.' : ''}`
              : 'Context was not explicitly needed — higher threshold (0.82) applied. No past conversations were similar enough to inject.'}
          </div>
        )}
      </div>
    )
  }

  const renderSectionContent = (sectionKey) => {
    switch (sectionKey) {
      case 'categoryDetection':
        return renderCategoryDetection()
      case 'memoryContext':
        return renderMemoryContext()
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
      case 'modelConversationContext':
        return renderModelConversationContext()
      default:
        return null
    }
  }

  // Inline mode: render without fixed positioning or outer shell
  if (inline) {
    return (
      <div
        style={{
          padding: '16px',
          overflowY: 'auto',
          maxHeight: 'calc(85vh - 120px)',
        }}
      >
        {sections.map((section) => {
          const Icon = section.icon
          const isExpanded = expandedSection === section.key
          const alwaysShow = section.key === 'modelConversationContext' || section.key === 'conversationContext' || section.key === 'memoryContext'
          const hasData = alwaysShow ? true : debugData[section.key]
          
          if (!hasData) return null
          
          return (
            <div key={section.key} style={{ marginBottom: '12px' }}>
              <button
                onClick={() => setExpandedSection(isExpanded ? null : section.key)}
                style={{
                  width: '100%',
                  padding: '10px 12px',
                  backgroundColor: isExpanded ? '#2a2a2a' : '#1a1a1a',
                  border: `1px solid ${section.color}`,
                  borderRadius: '8px',
                  color: section.color,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  marginBottom: '6px',
                  fontWeight: 'bold',
                  fontSize: '12px',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <Icon size={14} />
                  <span>{section.label}</span>
                </div>
                {isExpanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
              </button>

              {isExpanded && (
                <div
                  style={{
                    padding: '12px',
                    backgroundColor: '#0a0a0a',
                    borderRadius: '8px',
                    border: '1px solid #333',
                  }}
                >
                  {renderSectionContent(section.key)}
                </div>
              )}
            </div>
          )
        })}
      </div>
    )
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
            <span>Pipeline Debug Window</span>
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
              // These sections are always shown (data comes from separate live-polled APIs, not debugData)
              const alwaysShow = section.key === 'modelConversationContext' || section.key === 'conversationContext' || section.key === 'memoryContext'
              const hasData = alwaysShow ? true : debugData[section.key]
              
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
