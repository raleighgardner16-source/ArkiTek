import React, { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { X, Minimize2, Maximize2 } from 'lucide-react'
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

  // Group tokens by provider and aggregate totals
  const groupedByProvider = {}
  tokenData.forEach((item) => {
    if (!item.tokens) return
    const provider = item.tokens.provider || 'unknown'
    if (!groupedByProvider[provider]) {
      groupedByProvider[provider] = {
        totalInput: 0,
        totalOutput: 0,
        totalReasoning: 0,
        totalTokens: 0, // Sum of input + output only (excludes reasoning tokens)
        models: []
      }
    }
    const input = item.tokens.input || 0
    const output = item.tokens.output || 0
    const reasoning = item.tokens.reasoningTokens || 0
    // Calculate total as input + output only (excludes reasoning/computing tokens)
    const total = input + output
    
    groupedByProvider[provider].totalInput += input
    groupedByProvider[provider].totalOutput += output
    groupedByProvider[provider].totalReasoning += reasoning
    groupedByProvider[provider].totalTokens += total // Just input + output
    groupedByProvider[provider].models.push({
      model: item.modelName || item.tokens.model || 'unknown',
      input: input,
      output: output,
      reasoning: reasoning,
      total: total, // Just input + output
      source: item.tokens.source || 'unknown'
    })
  })

  // Calculate totals - only count input + output tokens (exclude reasoning/computing tokens)
  const totalInput = tokenData.reduce((sum, item) => sum + (item.tokens?.input || 0), 0)
  const totalOutput = tokenData.reduce((sum, item) => sum + (item.tokens?.output || 0), 0)
  const totalReasoning = tokenData.reduce((sum, item) => sum + (item.tokens?.reasoningTokens || 0), 0)
  // Total is simply input + output (excludes reasoning tokens)
  const totalTokens = totalInput + totalOutput

  // If inline mode, render without modal overlay
  if (inline) {
    // Group tokens by provider and aggregate totals
    const groupedByProvider = {}
    tokenData.forEach((item) => {
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
      groupedByProvider[provider].totalInput += item.tokens.inputTokens || 0
      groupedByProvider[provider].totalOutput += item.tokens.outputTokens || 0
      groupedByProvider[provider].totalReasoning += item.tokens.reasoningTokens || 0
      groupedByProvider[provider].totalTokens += (item.tokens.inputTokens || 0) + (item.tokens.outputTokens || 0)
      groupedByProvider[provider].models.push(item)
    })

    const totalTokens = Object.values(groupedByProvider).reduce((sum, provider) => sum + provider.totalTokens, 0)
    const totalReasoning = Object.values(groupedByProvider).reduce((sum, provider) => sum + provider.totalReasoning, 0)

    return (
      <div style={{ padding: '16px' }}>
        <h3 style={{ color: '#00FFFF', fontSize: '1.2rem', margin: '0 0 16px 0', fontWeight: 'bold' }}>
          Token Usage by Model/Provider
        </h3>
        {/* Content from the original component */}
        <div style={{ marginBottom: '16px' }}>
          <div style={{ display: 'flex', gap: '16px', marginBottom: '16px', flexWrap: 'wrap' }}>
            <div style={{ color: '#aaaaaa', fontSize: '0.9rem' }}>
              <strong style={{ color: '#00FFFF' }}>Total Tokens:</strong> {totalTokens.toLocaleString()}
            </div>
            {totalReasoning > 0 && (
              <div style={{ color: '#aaaaaa', fontSize: '0.9rem' }}>
                <strong style={{ color: '#ffaa00' }}>Reasoning Tokens:</strong> {totalReasoning.toLocaleString()}
              </div>
            )}
          </div>
          {Object.entries(groupedByProvider).map(([provider, data]) => (
            <div key={provider} style={{ marginBottom: '20px', padding: '12px', background: 'rgba(0, 255, 255, 0.05)', borderRadius: '8px', border: '1px solid rgba(0, 255, 255, 0.2)' }}>
              <h4 style={{ color: '#00FFFF', fontSize: '1rem', margin: '0 0 12px 0', fontWeight: '600' }}>
                {provider === 'openai' ? 'Chatgpt' : provider === 'anthropic' ? 'Claude' : provider === 'google' ? 'Gemini' : provider === 'xai' ? 'Grok' : provider}
              </h4>
              <div style={{ display: 'flex', gap: '16px', marginBottom: '12px', flexWrap: 'wrap', fontSize: '0.85rem', color: '#aaaaaa' }}>
                <div><strong style={{ color: '#00FFFF' }}>Input:</strong> {data.totalInput.toLocaleString()}</div>
                <div><strong style={{ color: '#00FF00' }}>Output:</strong> {data.totalOutput.toLocaleString()}</div>
                {data.totalReasoning > 0 && (
                  <div><strong style={{ color: '#ffaa00' }}>Reasoning:</strong> {data.totalReasoning.toLocaleString()}</div>
                )}
                <div><strong style={{ color: '#ffffff' }}>Total:</strong> {data.totalTokens.toLocaleString()}</div>
              </div>
              {data.models.map((item, idx) => (
                <div key={idx} style={{ marginLeft: '12px', marginBottom: '8px', fontSize: '0.8rem', color: '#cccccc' }}>
                  {item.modelName}: {((item.tokens?.inputTokens || 0) + (item.tokens?.outputTokens || 0)).toLocaleString()} tokens
                  {item.tokens?.reasoningTokens > 0 && ` (+${item.tokens.reasoningTokens.toLocaleString()} reasoning)`}
                </div>
              ))}
            </div>
          ))}
        </div>
      </div>
    )
  }

  // Show minimized state - just a small button to restore
  // Stacked above Summary window (60px offset for button height + gap)
  // Only show on home tab
  if (isMinimized && activeTab === 'home') {
    return (
      <motion.button
        initial={{ opacity: 0, scale: 0.8 }}
        animate={{ opacity: 1, scale: 1 }}
        onClick={() => setIsMinimized(false)}
        style={{
          position: 'fixed',
          bottom: '80px',
          right: '20px', // Position in bottom-right, stacked above summary
          background: 'rgba(0, 255, 255, 0.2)',
          border: '1px solid rgba(0, 255, 255, 0.5)',
          borderRadius: '12px',
          padding: '12px 20px',
          color: '#00FFFF',
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          zIndex: 140,
          fontSize: '0.9rem',
          fontWeight: '500',
          boxShadow: '0 0 20px rgba(0, 255, 255, 0.3)',
        }}
        whileHover={{ background: 'rgba(0, 255, 255, 0.3)', scale: 1.05 }}
        whileTap={{ scale: 0.95 }}
      >
        <Maximize2 size={16} />
        Token Usage ({totalTokens.toLocaleString()})
      </motion.button>
    )
  }
  
  // Don't show anything if minimized and not on home tab
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
              border: '2px solid #00FFFF',
              borderRadius: '16px',
              padding: '24px',
              maxWidth: '800px',
              width: '90%',
              maxHeight: '80vh',
              overflowY: 'auto',
              position: 'relative',
              boxShadow: '0 8px 32px rgba(0, 255, 255, 0.3)',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
              <h2 style={{ color: '#00FFFF', fontSize: '1.5rem', margin: 0, fontWeight: 'bold' }}>
                Token Usage by Model/Provider
              </h2>
              <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                <button
                  onClick={(e) => {
                    e.stopPropagation()
                    setIsMinimized(true)
                  }}
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
                    transition: 'background 0.2s',
                  }}
                  onMouseEnter={(e) => e.target.style.background = 'rgba(0, 255, 255, 0.2)'}
                  onMouseLeave={(e) => e.target.style.background = 'rgba(0, 255, 255, 0.1)'}
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

            {/* Summary */}
            <div
              style={{
                background: 'rgba(0, 255, 255, 0.1)',
                border: '1px solid rgba(0, 255, 255, 0.3)',
                borderRadius: '12px',
                padding: '16px',
                marginBottom: '24px',
              }}
            >
              <h3 style={{ color: '#00FFFF', fontSize: '1.1rem', margin: '0 0 12px 0', fontWeight: 'bold' }}>
                Total Usage
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
                  <div style={{ color: '#00FFFF', fontSize: '1.2rem', fontWeight: 'bold' }}>
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
                  background: 'rgba(0, 255, 255, 0.05)',
                  border: '1px solid rgba(0, 255, 255, 0.2)',
                  borderRadius: '12px',
                  padding: '16px',
                  marginBottom: '16px',
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                  <h3 style={{ color: '#00FFFF', fontSize: '1rem', margin: 0, fontWeight: 'bold', textTransform: 'capitalize' }}>
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
                      <div style={{ color: '#00FFFF', fontSize: '1rem', fontWeight: 'bold' }}>
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
                        border: '1px solid rgba(0, 255, 255, 0.1)',
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
                          color: '#888', 
                          fontSize: '0.7rem',
                          background: 'rgba(0, 255, 255, 0.1)',
                          padding: '2px 6px',
                          borderRadius: '4px',
                        }}>
                          {modelData.source === 'api_response' ? 'API' : 'Estimated'}
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
                          <div style={{ color: '#00FFFF', fontWeight: 'bold' }}>
                            {modelData.total.toLocaleString()}
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}

export default TokenUsageWindow

