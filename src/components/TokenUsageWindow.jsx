import React, { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { X, Minimize2, Maximize2, Eye } from 'lucide-react'
import { useStore } from '../store/useStore'

const TokenUsageWindow = ({ isOpen, onClose, tokenData, inline = false }) => {
  const [isMinimized, setIsMinimized] = useState(false)
  const activeTab = useStore((state) => state.activeTab)

  // Reset minimized state when window is closed
  useEffect(() => {
    if (!isOpen) {
      setIsMinimized(false)
    }
  }, [isOpen])

  if (!isOpen || !tokenData || tokenData.length === 0) return null

  // Separate pipeline (category detection), judge, and regular counted items
  const pipelineItems = tokenData.filter(item => item.isPipeline)
  const judgeItems = tokenData.filter(item => item.isJudge)
  const countedItems = tokenData.filter(item => !item.isPipeline && !item.isJudge)

  // Group COUNTED tokens by provider and aggregate totals
  const groupedByProvider = {}
  countedItems.forEach((item) => {
    if (!item.tokens) return
    const provider = item.tokens.provider || 'unknown'
    if (!groupedByProvider[provider]) {
      groupedByProvider[provider] = {
        totalInput: 0,
        totalOutput: 0,
        totalReasoning: 0,
        totalTokens: 0,
        models: []
      }
    }
    const input = item.tokens.input || 0
    const output = item.tokens.output || 0
    const reasoning = item.tokens.reasoningTokens || 0
    const total = input + output
    
    groupedByProvider[provider].totalInput += input
    groupedByProvider[provider].totalOutput += output
    groupedByProvider[provider].totalReasoning += reasoning
    groupedByProvider[provider].totalTokens += total
    groupedByProvider[provider].models.push({
      model: item.modelName || item.tokens.model || 'unknown',
      input: input,
      output: output,
      reasoning: reasoning,
      total: total,
      source: item.tokens.source || 'unknown',
      breakdown: item.tokens.breakdown || null
    })
  })

  // Calculate totals (counted items + judge — excludes pipeline)
  const allCountedItems = [...countedItems, ...judgeItems]
  const totalInput = allCountedItems.reduce((sum, item) => sum + (item.tokens?.input || 0), 0)
  const totalOutput = allCountedItems.reduce((sum, item) => sum + (item.tokens?.output || 0), 0)
  const totalReasoning = allCountedItems.reduce((sum, item) => sum + (item.tokens?.reasoningTokens || 0), 0)
  const totalTokens = totalInput + totalOutput

  // Judge totals (for separate display section)
  const judgeTotalInput = judgeItems.reduce((sum, item) => sum + (item.tokens?.input || 0), 0)
  const judgeTotalOutput = judgeItems.reduce((sum, item) => sum + (item.tokens?.output || 0), 0)
  const judgeTotalTokens = judgeTotalInput + judgeTotalOutput

  // Pipeline totals (for display only — not counted in stats)
  const pipelineTotalInput = pipelineItems.reduce((sum, item) => sum + (item.tokens?.input || 0), 0)
  const pipelineTotalOutput = pipelineItems.reduce((sum, item) => sum + (item.tokens?.output || 0), 0)
  const pipelineTotalTokens = pipelineTotalInput + pipelineTotalOutput

  // Calculate aggregate breakdown (across all counted models that have breakdown data)
  const hasAnyBreakdown = countedItems.some(item => item.tokens?.breakdown)
  let totalUserPrompt = 0
  let totalSourceContext = 0
  let totalSystemOverhead = 0
  let modelsWithSources = 0

  if (hasAnyBreakdown) {
    countedItems.forEach(item => {
      if (item.tokens?.breakdown) {
        totalUserPrompt += item.tokens.breakdown.userPrompt || 0
        totalSourceContext += item.tokens.breakdown.sourceContext || 0
        totalSystemOverhead += item.tokens.breakdown.systemOverhead || 0
        modelsWithSources++
      }
    })
  }

  // All input+output tokens are now counted (except pipeline/category detection calls).
  // The breakdown just shows what makes up the input tokens for transparency.
  const singleUserPromptEstimate = hasAnyBreakdown && modelsWithSources > 0
    ? Math.round(totalUserPrompt / modelsWithSources) // Average since each model gets the same prompt
    : 0

  // Reusable breakdown section for per-model cards
  const renderModelBreakdown = (breakdown) => {
    if (!breakdown) return null
    return (
      <div style={{
        marginTop: '8px',
        padding: '8px 10px',
        background: 'rgba(255, 255, 255, 0.03)',
        borderRadius: '6px',
        border: '1px solid rgba(255, 255, 255, 0.06)',
        fontSize: '0.7rem',
      }}>
        <div style={{ color: '#888', fontWeight: '600', marginBottom: '6px', fontSize: '0.68rem', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
          Input Breakdown (estimated)
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '6px' }}>
          <div>
            <div style={{ color: '#48c9b0', marginBottom: '2px' }}>Your Prompt</div>
            <div style={{ color: '#fff' }}>~{(breakdown.userPrompt || 0).toLocaleString()}</div>
          </div>
          <div>
            <div style={{ color: '#e67e22', marginBottom: '2px' }}>Web Sources</div>
            <div style={{ color: '#fff' }}>~{(breakdown.sourceContext || 0).toLocaleString()}</div>
          </div>
          <div>
            <div style={{ color: '#888', marginBottom: '2px' }}>System</div>
            <div style={{ color: '#fff' }}>~{(breakdown.systemOverhead || 0).toLocaleString()}</div>
          </div>
        </div>
      </div>
    )
  }

  // If inline mode, render without modal overlay
  if (inline) {
    const inlineGrouped = {}
    tokenData.forEach((item) => {
      if (!item.tokens) return
      const provider = item.tokens.provider || 'unknown'
      if (!inlineGrouped[provider]) {
        inlineGrouped[provider] = {
          totalInput: 0,
          totalOutput: 0,
          totalReasoning: 0,
          totalTokens: 0,
          models: []
        }
      }
      inlineGrouped[provider].totalInput += item.tokens.inputTokens || item.tokens.input || 0
      inlineGrouped[provider].totalOutput += item.tokens.outputTokens || item.tokens.output || 0
      inlineGrouped[provider].totalReasoning += item.tokens.reasoningTokens || 0
      inlineGrouped[provider].totalTokens += (item.tokens.inputTokens || item.tokens.input || 0) + (item.tokens.outputTokens || item.tokens.output || 0)
      inlineGrouped[provider].models.push(item)
    })

    const inlineTotalTokens = Object.values(inlineGrouped).reduce((sum, provider) => sum + provider.totalTokens, 0)
    const inlineTotalReasoning = Object.values(inlineGrouped).reduce((sum, provider) => sum + provider.totalReasoning, 0)

    return (
      <div style={{ padding: '16px' }}>
        <h3 style={{ color: '#5dade2', fontSize: '1.2rem', margin: '0 0 16px 0', fontWeight: 'bold' }}>
          Token Usage by Model/Provider
        </h3>
        <div style={{ marginBottom: '16px' }}>
          <div style={{ display: 'flex', gap: '16px', marginBottom: '16px', flexWrap: 'wrap' }}>
            <div style={{ color: '#aaaaaa', fontSize: '0.9rem' }}>
              <strong style={{ color: '#5dade2' }}>Total Tokens:</strong> {inlineTotalTokens.toLocaleString()}
            </div>
            {inlineTotalReasoning > 0 && (
              <div style={{ color: '#aaaaaa', fontSize: '0.9rem' }}>
                <strong style={{ color: '#ffaa00' }}>Reasoning Tokens:</strong> {inlineTotalReasoning.toLocaleString()}
              </div>
            )}
          </div>
          {Object.entries(inlineGrouped).map(([provider, data]) => (
            <div key={provider} style={{ marginBottom: '20px', padding: '12px', background: 'rgba(93, 173, 226, 0.05)', borderRadius: '8px', border: '1px solid rgba(93, 173, 226, 0.2)' }}>
              <h4 style={{ color: '#5dade2', fontSize: '1rem', margin: '0 0 12px 0', fontWeight: '600' }}>
                {provider === 'openai' ? 'Chatgpt' : provider === 'anthropic' ? 'Claude' : provider === 'google' ? 'Gemini' : provider === 'xai' ? 'Grok' : provider}
              </h4>
              <div style={{ display: 'flex', gap: '16px', marginBottom: '12px', flexWrap: 'wrap', fontSize: '0.85rem', color: '#aaaaaa' }}>
                <div><strong style={{ color: '#5dade2' }}>Input:</strong> {data.totalInput.toLocaleString()}</div>
                <div><strong style={{ color: '#48c9b0' }}>Output:</strong> {data.totalOutput.toLocaleString()}</div>
                {data.totalReasoning > 0 && (
                  <div><strong style={{ color: '#ffaa00' }}>Reasoning:</strong> {data.totalReasoning.toLocaleString()}</div>
                )}
                <div><strong style={{ color: '#ffffff' }}>Total:</strong> {data.totalTokens.toLocaleString()}</div>
              </div>
              {data.models.map((item, idx) => (
                <div key={idx} style={{ marginLeft: '12px', marginBottom: '8px', fontSize: '0.8rem', color: '#cccccc' }}>
                  {item.modelName}: {((item.tokens?.inputTokens || item.tokens?.input || 0) + (item.tokens?.outputTokens || item.tokens?.output || 0)).toLocaleString()} tokens
                  {item.tokens?.reasoningTokens > 0 && ` (+${item.tokens.reasoningTokens.toLocaleString()} reasoning)`}
                </div>
              ))}
            </div>
          ))}
        </div>
      </div>
    )
  }

  // Show minimized state
  if (isMinimized && activeTab === 'home') {
    return (
      <motion.button
        initial={{ opacity: 0, scale: 0.8 }}
        animate={{ opacity: 1, scale: 1 }}
        onClick={() => setIsMinimized(false)}
        style={{
          position: 'fixed',
          bottom: '80px',
          right: '20px',
          background: 'rgba(93, 173, 226, 0.2)',
          border: '1px solid rgba(93, 173, 226, 0.5)',
          borderRadius: '12px',
          padding: '12px 20px',
          color: '#5dade2',
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          zIndex: 140,
          fontSize: '0.9rem',
          fontWeight: '500',
          boxShadow: '0 0 20px rgba(93, 173, 226, 0.3)',
        }}
        whileHover={{ background: 'rgba(93, 173, 226, 0.3)', scale: 1.05 }}
        whileTap={{ scale: 0.95 }}
      >
        <Maximize2 size={16} />
        Token Usage ({totalTokens.toLocaleString()})
      </motion.button>
    )
  }
  
  if (isMinimized && activeTab !== 'home') {
    return null
  }

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onClose}
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: 'rgba(0, 0, 0, 0.8)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 10000,
            backdropFilter: 'blur(4px)',
          }}
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.9, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.9, y: 20 }}
            onClick={(e) => e.stopPropagation()}
            style={{
              background: 'rgba(0, 0, 0, 0.95)',
              border: '2px solid #5dade2',
              borderRadius: '16px',
              padding: '24px',
              maxWidth: '800px',
              width: '90%',
              maxHeight: '80vh',
              overflowY: 'auto',
              position: 'relative',
              boxShadow: '0 8px 32px rgba(93, 173, 226, 0.3)',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
              <h2 style={{ color: '#5dade2', fontSize: '1.5rem', margin: 0, fontWeight: 'bold' }}>
                Token Usage
              </h2>
              <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                <button
                  onClick={(e) => {
                    e.stopPropagation()
                    setIsMinimized(true)
                  }}
                  style={{
                    background: 'rgba(93, 173, 226, 0.1)',
                    border: '1px solid rgba(93, 173, 226, 0.3)',
                    borderRadius: '8px',
                    padding: '8px',
                    color: '#5dade2',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    transition: 'background 0.2s',
                  }}
                  onMouseEnter={(e) => e.target.style.background = 'rgba(93, 173, 226, 0.2)'}
                  onMouseLeave={(e) => e.target.style.background = 'rgba(93, 173, 226, 0.1)'}
                  title="Minimize"
                >
                  <Minimize2 size={20} />
                </button>
                <button
                  onClick={onClose}
                  style={{
                    background: 'transparent',
                    border: 'none',
                    color: '#ff6b6b',
                    cursor: 'pointer',
                    padding: '8px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    borderRadius: '8px',
                    transition: 'background 0.2s',
                  }}
                  onMouseEnter={(e) => e.target.style.background = 'rgba(255, 107, 107, 0.2)'}
                  onMouseLeave={(e) => e.target.style.background = 'transparent'}
                  title="Close"
                >
                  <X size={24} />
                </button>
              </div>
            </div>

            {/* Token breakdown — shows what makes up input tokens */}
            {hasAnyBreakdown ? (
              <div style={{
                background: 'rgba(93, 173, 226, 0.06)',
                border: '1px solid rgba(93, 173, 226, 0.2)',
                borderRadius: '12px',
                padding: '14px',
                marginBottom: '16px',
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '10px' }}>
                  <Eye size={14} color="#5dade2" />
                  <span style={{ color: '#5dade2', fontWeight: '700', fontSize: '0.8rem', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                    What's In Your Token Count
                  </span>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', fontSize: '0.8rem' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ color: '#aaa' }}>Your Prompt</span>
                    <span style={{ color: '#fff', fontWeight: '600' }}>~{singleUserPromptEstimate.toLocaleString()}</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ color: '#aaa' }}>Web Sources</span>
                    <span style={{ color: '#e67e22', fontWeight: '600' }}>~{totalSourceContext.toLocaleString()}</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ color: '#aaa' }}>System / Formatting</span>
                    <span style={{ color: '#fff', fontWeight: '600' }}>~{totalSystemOverhead.toLocaleString()}</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ color: '#aaa' }}>Model Output</span>
                    <span style={{ color: '#fff', fontWeight: '600' }}>{totalOutput.toLocaleString()}</span>
                  </div>
                  {totalReasoning > 0 && (
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <span style={{ color: '#aaa' }}>Reasoning</span>
                      <span style={{ color: '#FFD700', fontWeight: '600' }}>{totalReasoning.toLocaleString()}</span>
                    </div>
                  )}
                  <div style={{ borderTop: '1px solid rgba(93, 173, 226, 0.2)', paddingTop: '6px', marginTop: '2px', display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ color: '#5dade2', fontWeight: '600' }}>Total (across {modelsWithSources} model{modelsWithSources !== 1 ? 's' : ''})</span>
                    <span style={{ color: '#5dade2', fontWeight: '700', fontSize: '0.9rem' }}>{totalTokens.toLocaleString()}</span>
                  </div>
                </div>
                <div style={{ marginTop: '10px', fontSize: '0.68rem', color: '#777', lineHeight: '1.4' }}>
                  <span style={{ color: '#e67e22', fontWeight: '600' }}>Not included:</span> Internal pipeline tokens (category detection, search query generation) are not counted toward your stats.
                </div>
              </div>
            ) : (
              /* Info note when no breakdown is available (no RAG/sources used) */
              <div style={{
                background: 'rgba(93, 173, 226, 0.06)',
                border: '1px solid rgba(93, 173, 226, 0.2)',
                borderRadius: '8px',
                padding: '10px 14px',
                marginBottom: '16px',
                fontSize: '0.75rem',
                color: '#ccc',
                lineHeight: '1.4',
              }}>
                <span style={{ color: '#5dade2', fontWeight: '600' }}>Note:</span> No web sources were used for this prompt. Your token count includes your prompt, system formatting, and model output. Internal pipeline tokens (category detection) are not counted.
              </div>
            )}

            {/* Total API Usage bar */}
            <div
              style={{
                background: 'rgba(93, 173, 226, 0.1)',
                border: '1px solid rgba(93, 173, 226, 0.3)',
                borderRadius: '12px',
                padding: '16px',
                marginBottom: '20px',
              }}
            >
              <h3 style={{ color: '#5dade2', fontSize: '1rem', margin: '0 0 12px 0', fontWeight: 'bold' }}>
                Total API Usage
              </h3>
              <div style={{ display: 'grid', gridTemplateColumns: totalReasoning > 0 ? 'repeat(4, 1fr)' : 'repeat(3, 1fr)', gap: '12px' }}>
                <div>
                  <div style={{ color: '#888', fontSize: '0.85rem', marginBottom: '4px' }}>Input Tokens</div>
                  <div style={{ color: '#fff', fontSize: '1.2rem', fontWeight: 'bold' }}>
                    {totalInput.toLocaleString()}
                  </div>
                </div>
                <div>
                  <div style={{ color: '#888', fontSize: '0.85rem', marginBottom: '4px' }}>Output Tokens</div>
                  <div style={{ color: '#fff', fontSize: '1.2rem', fontWeight: 'bold' }}>
                    {totalOutput.toLocaleString()}
                  </div>
                </div>
                {totalReasoning > 0 && (
                  <div>
                    <div style={{ color: '#888', fontSize: '0.85rem', marginBottom: '4px' }}>Reasoning Tokens</div>
                    <div style={{ color: '#FFD700', fontSize: '1.2rem', fontWeight: 'bold' }}>
                      {totalReasoning.toLocaleString()}
                    </div>
                  </div>
                )}
                <div>
                  <div style={{ color: '#888', fontSize: '0.85rem', marginBottom: '4px' }}>Total Tokens</div>
                  <div style={{ color: '#5dade2', fontSize: '1.2rem', fontWeight: 'bold' }}>
                    {totalTokens.toLocaleString()}
                  </div>
                </div>
              </div>
            </div>

            {/* By Provider */}
            {Object.entries(groupedByProvider).map(([provider, providerData]) => (
              <div
                key={provider}
                style={{
                  background: 'rgba(93, 173, 226, 0.05)',
                  border: '1px solid rgba(93, 173, 226, 0.2)',
                  borderRadius: '12px',
                  padding: '16px',
                  marginBottom: '16px',
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                  <h3 style={{ color: '#5dade2', fontSize: '1rem', margin: 0, fontWeight: 'bold', textTransform: 'capitalize' }}>
                    {provider}
                  </h3>
                  <div style={{ display: 'grid', gridTemplateColumns: providerData.totalReasoning > 0 ? 'repeat(4, 1fr)' : 'repeat(3, 1fr)', gap: '12px', fontSize: '0.85rem' }}>
                    <div>
                      <div style={{ color: '#888', fontSize: '0.7rem', marginBottom: '2px' }}>Input</div>
                      <div style={{ color: '#fff', fontSize: '1rem', fontWeight: 'bold' }}>
                        {providerData.totalInput.toLocaleString()}
                      </div>
                    </div>
                    <div>
                      <div style={{ color: '#888', fontSize: '0.7rem', marginBottom: '2px' }}>Output</div>
                      <div style={{ color: '#fff', fontSize: '1rem', fontWeight: 'bold' }}>
                        {providerData.totalOutput.toLocaleString()}
                      </div>
                    </div>
                    {providerData.totalReasoning > 0 && (
                      <div>
                        <div style={{ color: '#888', fontSize: '0.7rem', marginBottom: '2px' }}>Reasoning</div>
                        <div style={{ color: '#FFD700', fontSize: '1rem', fontWeight: 'bold' }}>
                          {providerData.totalReasoning.toLocaleString()}
                        </div>
                      </div>
                    )}
                    <div>
                      <div style={{ color: '#888', fontSize: '0.7rem', marginBottom: '2px' }}>Total</div>
                      <div style={{ color: '#5dade2', fontSize: '1rem', fontWeight: 'bold' }}>
                        {providerData.totalTokens.toLocaleString()}
                      </div>
                    </div>
                  </div>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  {providerData.models.map((modelData, index) => (
                    <div
                      key={index}
                      style={{
                        background: 'rgba(0, 0, 0, 0.3)',
                        border: '1px solid rgba(93, 173, 226, 0.1)',
                        borderRadius: '8px',
                        padding: '10px',
                        fontSize: '0.8rem',
                      }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                        <div style={{ color: '#fff', fontWeight: '500' }}>
                          {modelData.model}
                        </div>
                        <div style={{ 
                          color: modelData.source === 'api_response' ? '#48c9b0' : '#888', 
                          fontSize: '0.7rem',
                          background: modelData.source === 'api_response' ? 'rgba(72, 201, 176, 0.15)' : 'rgba(93, 173, 226, 0.1)',
                          padding: '2px 6px',
                          borderRadius: '4px',
                        }}>
                          {modelData.source === 'api_response' ? 'API Reported' : 'Estimated'}
                        </div>
                      </div>
                      <div style={{ display: 'grid', gridTemplateColumns: modelData.reasoning > 0 ? 'repeat(4, 1fr)' : 'repeat(3, 1fr)', gap: '6px', fontSize: '0.75rem' }}>
                        <div>
                          <div style={{ color: '#888', marginBottom: '2px' }}>Input</div>
                          <div style={{ color: '#fff' }}>{modelData.input.toLocaleString()}</div>
                        </div>
                        <div>
                          <div style={{ color: '#888', marginBottom: '2px' }}>Output</div>
                          <div style={{ color: '#fff' }}>{modelData.output.toLocaleString()}</div>
                        </div>
                        {modelData.reasoning > 0 && (
                          <div>
                            <div style={{ color: '#888', marginBottom: '2px' }}>Reasoning</div>
                            <div style={{ color: '#FFD700', fontWeight: 'bold' }}>
                              {modelData.reasoning.toLocaleString()}
                            </div>
                          </div>
                        )}
                        <div>
                          <div style={{ color: '#888', marginBottom: '2px' }}>Total</div>
                          <div style={{ color: '#5dade2', fontWeight: 'bold' }}>
                            {modelData.total.toLocaleString()}
                          </div>
                        </div>
                      </div>
                      {/* Per-model input breakdown */}
                      {renderModelBreakdown(modelData.breakdown)}
                    </div>
                  ))}
                </div>
              </div>
            ))}

            {/* Judge Model (counted in stats but shown separately) */}
            {judgeItems.length > 0 && (
              <div
                style={{
                  background: 'rgba(168, 85, 247, 0.05)',
                  border: '1px solid rgba(168, 85, 247, 0.2)',
                  borderRadius: '12px',
                  padding: '16px',
                  marginBottom: '16px',
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <h3 style={{ color: '#a855f7', fontSize: '1rem', margin: 0, fontWeight: 'bold' }}>
                      Judge Model
                    </h3>
                    <span style={{
                      fontSize: '0.65rem',
                      color: '#a855f7',
                      background: 'rgba(168, 85, 247, 0.15)',
                      padding: '2px 8px',
                      borderRadius: '4px',
                      fontWeight: '600',
                    }}>
                      Finalization
                    </span>
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '12px', fontSize: '0.85rem' }}>
                    <div>
                      <div style={{ color: '#888', fontSize: '0.7rem', marginBottom: '2px' }}>Input</div>
                      <div style={{ color: '#fff', fontSize: '1rem', fontWeight: 'bold' }}>
                        {judgeTotalInput.toLocaleString()}
                      </div>
                    </div>
                    <div>
                      <div style={{ color: '#888', fontSize: '0.7rem', marginBottom: '2px' }}>Output</div>
                      <div style={{ color: '#fff', fontSize: '1rem', fontWeight: 'bold' }}>
                        {judgeTotalOutput.toLocaleString()}
                      </div>
                    </div>
                    <div>
                      <div style={{ color: '#888', fontSize: '0.7rem', marginBottom: '2px' }}>Total</div>
                      <div style={{ color: '#a855f7', fontSize: '1rem', fontWeight: 'bold' }}>
                        {judgeTotalTokens.toLocaleString()}
                      </div>
                    </div>
                  </div>
                </div>
                <div style={{ marginTop: '4px', fontSize: '0.68rem', color: '#888', fontStyle: 'italic' }}>
                  The judge model synthesizes all council responses into a final summary. These tokens are counted toward your stats.
                </div>
              </div>
            )}

            {/* Pipeline / Internal Models (not counted in stats) */}
            {pipelineItems.length > 0 && (
              <div
                style={{
                  background: 'rgba(255, 170, 0, 0.05)',
                  border: '1px solid rgba(255, 170, 0, 0.2)',
                  borderRadius: '12px',
                  padding: '16px',
                  marginBottom: '16px',
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <h3 style={{ color: '#ffaa00', fontSize: '1rem', margin: 0, fontWeight: 'bold' }}>
                      Pipeline (Not Counted)
                    </h3>
                    <span style={{
                      fontSize: '0.65rem',
                      color: '#ffaa00',
                      background: 'rgba(255, 170, 0, 0.15)',
                      padding: '2px 8px',
                      borderRadius: '4px',
                      fontWeight: '600',
                    }}>
                      Internal
                    </span>
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '12px', fontSize: '0.85rem' }}>
                    <div>
                      <div style={{ color: '#888', fontSize: '0.7rem', marginBottom: '2px' }}>Input</div>
                      <div style={{ color: '#ccc', fontSize: '1rem', fontWeight: 'bold' }}>
                        {pipelineTotalInput.toLocaleString()}
                      </div>
                    </div>
                    <div>
                      <div style={{ color: '#888', fontSize: '0.7rem', marginBottom: '2px' }}>Output</div>
                      <div style={{ color: '#ccc', fontSize: '1rem', fontWeight: 'bold' }}>
                        {pipelineTotalOutput.toLocaleString()}
                      </div>
                    </div>
                    <div>
                      <div style={{ color: '#888', fontSize: '0.7rem', marginBottom: '2px' }}>Total</div>
                      <div style={{ color: '#ffaa00', fontSize: '1rem', fontWeight: 'bold' }}>
                        {pipelineTotalTokens.toLocaleString()}
                      </div>
                    </div>
                  </div>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  {pipelineItems.map((item, index) => (
                    <div
                      key={`pipeline-${index}`}
                      style={{
                        background: 'rgba(0, 0, 0, 0.3)',
                        border: '1px solid rgba(255, 170, 0, 0.1)',
                        borderRadius: '8px',
                        padding: '10px',
                        fontSize: '0.8rem',
                      }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                        <div style={{ color: '#ffaa00', fontWeight: '500' }}>
                          {item.modelName || item.tokens?.model || 'Unknown'}
                        </div>
                        <div style={{ 
                          color: '#ffaa00',
                          fontSize: '0.65rem',
                          background: 'rgba(255, 170, 0, 0.12)',
                          padding: '2px 6px',
                          borderRadius: '4px',
                        }}>
                          Not Counted
                        </div>
                      </div>
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '6px', fontSize: '0.75rem' }}>
                        <div>
                          <div style={{ color: '#888', marginBottom: '2px' }}>Input</div>
                          <div style={{ color: '#ccc' }}>{(item.tokens?.input || 0).toLocaleString()}</div>
                        </div>
                        <div>
                          <div style={{ color: '#888', marginBottom: '2px' }}>Output</div>
                          <div style={{ color: '#ccc' }}>{(item.tokens?.output || 0).toLocaleString()}</div>
                        </div>
                        <div>
                          <div style={{ color: '#888', marginBottom: '2px' }}>Total</div>
                          <div style={{ color: '#ffaa00', fontWeight: 'bold' }}>
                            {((item.tokens?.input || 0) + (item.tokens?.output || 0)).toLocaleString()}
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
                <div style={{ marginTop: '8px', fontSize: '0.68rem', color: '#888', fontStyle: 'italic' }}>
                  These tokens are used internally for category detection and query classification. They are not counted toward your token stats.
                </div>
              </div>
            )}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}

export default TokenUsageWindow
