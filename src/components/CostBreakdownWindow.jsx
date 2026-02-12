import React, { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { X, Minimize2, Maximize2, DollarSign } from 'lucide-react'
import axios from 'axios'
import { API_URL } from '../utils/config'
import { useStore } from '../store/useStore'

const CostBreakdownWindow = ({ isOpen, onClose, tokenData, queryCount = 0, inline = false }) => {
  const [isMinimized, setIsMinimized] = useState(false)
  const [pricingData, setPricingData] = useState(null)
  const [loading, setLoading] = useState(true)
  const activeTab = useStore((state) => state.activeTab)

  // Fetch pricing data
  useEffect(() => {
    const fetchPricing = async () => {
      try {
        const response = await axios.get(`${API_URL}/api/admin/pricing`)
        setPricingData(response.data)
      } catch (error) {
        console.error('Error fetching pricing data:', error)
      } finally {
        setLoading(false)
      }
    }
    
    if (isOpen) {
      fetchPricing()
    }
  }, [isOpen])

  // Reset minimized state when window is closed
  useEffect(() => {
    if (!isOpen) {
      setIsMinimized(false)
    }
  }, [isOpen])

  if (!isOpen || !tokenData || tokenData.length === 0) return null

  // Calculate costs for each model
  const calculateModelCost = (provider, model, inputTokens, outputTokens) => {
    if (!pricingData || !pricingData[provider] || !pricingData[provider].models || !pricingData[provider].models[model]) {
      return { inputCost: 0, outputCost: 0, totalCost: 0, inputPrice: 0, outputPrice: 0 }
    }
    
    const modelPricing = pricingData[provider].models[model]
    const inputPrice = modelPricing.input || 0
    const outputPrice = modelPricing.output || 0
    const inputCost = (inputTokens / 1000000) * inputPrice
    const outputCost = (outputTokens / 1000000) * outputPrice
    const totalCost = inputCost + outputCost
    
    return { inputCost, outputCost, totalCost, inputPrice, outputPrice }
  }

  // Calculate Serper query cost
  const calculateQueryCost = (numQueries) => {
    if (!pricingData || !pricingData.serper || !pricingData.serper.queryTiers || numQueries === 0) {
      return 0
    }
    
    // Use first tier pricing (50k credits, $1.00 per 1k queries)
    const tier = pricingData.serper.queryTiers[0]
    const pricePer1k = tier.pricePer1k || 1.00
    return (numQueries / 1000) * pricePer1k
  }

  // Process token data and calculate costs
  const costBreakdown = tokenData.map((item) => {
    if (!item.tokens) return null
    
    const provider = item.tokens.provider || 'unknown'
    const model = item.tokens.model || 'unknown'
    const inputTokens = item.tokens.input || 0
    const outputTokens = item.tokens.output || 0
    const reasoningTokens = item.tokens.reasoningTokens || 0
    
    const costs = calculateModelCost(provider, model, inputTokens, outputTokens)
    
    return {
      modelName: item.modelName || model,
      provider,
      model,
      inputTokens,
      outputTokens,
      reasoningTokens,
      totalTokens: inputTokens + outputTokens,
      inputPrice: costs.inputPrice,
      outputPrice: costs.outputPrice,
      inputCost: costs.inputCost,
      outputCost: costs.outputCost,
      totalCost: costs.totalCost
    }
  }).filter(item => item !== null)

  // Calculate totals
  const totalInputTokens = costBreakdown.reduce((sum, item) => sum + item.inputTokens, 0)
  const totalOutputTokens = costBreakdown.reduce((sum, item) => sum + item.outputTokens, 0)
  const totalTokens = totalInputTokens + totalOutputTokens
  const totalModelCost = costBreakdown.reduce((sum, item) => sum + item.totalCost, 0)
  const queryCost = calculateQueryCost(queryCount)
  const totalCost = totalModelCost + queryCost

  // Group by provider
  const groupedByProvider = {}
  costBreakdown.forEach((item) => {
    if (!groupedByProvider[item.provider]) {
      groupedByProvider[item.provider] = {
        models: [],
        totalInputTokens: 0,
        totalOutputTokens: 0,
        totalTokens: 0,
        totalCost: 0
      }
    }
    groupedByProvider[item.provider].models.push(item)
    groupedByProvider[item.provider].totalInputTokens += item.inputTokens
    groupedByProvider[item.provider].totalOutputTokens += item.outputTokens
    groupedByProvider[item.provider].totalTokens += item.totalTokens
    groupedByProvider[item.provider].totalCost += item.totalCost
  })

  // If inline mode, render without modal overlay
  if (inline) {
    return (
      <div style={{ padding: '16px' }}>
        <h3 style={{ color: '#FFD700', fontSize: '1.2rem', margin: '0 0 16px 0', fontWeight: 'bold' }}>
          Cost Breakdown
        </h3>
        {loading ? (
          <div style={{ color: '#aaaaaa', textAlign: 'center', padding: '20px' }}>Loading pricing data...</div>
        ) : (
          <>
            <div style={{ marginBottom: '16px' }}>
              <div style={{ display: 'flex', gap: '16px', marginBottom: '16px', flexWrap: 'wrap' }}>
                <div style={{ color: '#aaaaaa', fontSize: '0.9rem' }}>
                  <strong style={{ color: '#FFD700' }}>Total Cost:</strong> ${totalCost.toFixed(4)}
                </div>
                <div style={{ color: '#aaaaaa', fontSize: '0.9rem' }}>
                  <strong style={{ color: '#5dade2' }}>Model Cost:</strong> ${totalModelCost.toFixed(4)}
                </div>
                {queryCost > 0 && (
                  <div style={{ color: '#aaaaaa', fontSize: '0.9rem' }}>
                    <strong style={{ color: '#48c9b0' }}>Search Queries ({queryCount}):</strong> ${queryCost.toFixed(4)}
                  </div>
                )}
              </div>
              {Object.entries(groupedByProvider).map(([provider, data]) => (
                <div key={provider} style={{ marginBottom: '20px', padding: '12px', background: 'rgba(255, 215, 0, 0.05)', borderRadius: '8px', border: '1px solid rgba(255, 215, 0, 0.2)' }}>
                  <h4 style={{ color: '#FFD700', fontSize: '1rem', margin: '0 0 12px 0', fontWeight: '600' }}>
                    {provider === 'openai' ? 'Chatgpt' : provider === 'anthropic' ? 'Claude' : provider === 'google' ? 'Gemini' : provider === 'xai' ? 'Grok' : provider}
                  </h4>
                  <div style={{ display: 'flex', gap: '16px', marginBottom: '12px', flexWrap: 'wrap', fontSize: '0.85rem', color: '#aaaaaa' }}>
                    <div><strong style={{ color: '#FFD700' }}>Total Cost:</strong> ${data.totalCost.toFixed(4)}</div>
                    <div><strong style={{ color: '#5dade2' }}>Tokens:</strong> {data.totalTokens.toLocaleString()}</div>
                  </div>
                  {data.models.map((item, idx) => (
                    <div key={idx} style={{ marginLeft: '12px', marginBottom: '8px', fontSize: '0.8rem', color: '#cccccc' }}>
                      {item.modelName}: ${item.totalCost.toFixed(4)} ({item.totalTokens.toLocaleString()} tokens)
                    </div>
                  ))}
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    )
  }

  // Show minimized state
  // Stacked above Token Usage window (60px offset for button height + gap)
  // Only show on home tab
  if (isMinimized && activeTab === 'home') {
    return (
      <motion.button
        initial={{ opacity: 0, scale: 0.8 }}
        animate={{ opacity: 1, scale: 1 }}
        onClick={() => setIsMinimized(false)}
        style={{
          position: 'fixed',
          bottom: '140px',
          right: '20px', // Position in bottom-right, stacked above token usage
          background: 'rgba(255, 215, 0, 0.2)',
          border: '1px solid rgba(255, 215, 0, 0.5)',
          borderRadius: '12px',
          padding: '12px 20px',
          color: '#FFD700',
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          zIndex: 140,
          fontSize: '0.9rem',
          fontWeight: '500',
          boxShadow: '0 0 20px rgba(255, 215, 0, 0.3)',
        }}
        whileHover={{ background: 'rgba(255, 215, 0, 0.3)', scale: 1.05 }}
        whileTap={{ scale: 0.95 }}
      >
        <Maximize2 size={16} />
        Cost Breakdown (${totalCost.toFixed(4)})
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
          }}
        >
          <motion.div
            initial={{ scale: 0.9, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.9, opacity: 0 }}
            onClick={(e) => e.stopPropagation()}
            style={{
              background: 'rgba(0, 0, 0, 0.95)',
              border: '1px solid rgba(255, 215, 0, 0.3)',
              borderRadius: '16px',
              padding: '30px',
              maxWidth: '900px',
              width: '90%',
              maxHeight: '85vh',
              overflowY: 'auto',
              position: 'relative',
              boxShadow: '0 0 40px rgba(255, 215, 0, 0.4)',
            }}
          >
            {/* Header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <DollarSign size={28} color="#FFD700" />
                <h2
                  style={{
                    fontSize: '1.8rem',
                    margin: 0,
                    background: 'linear-gradient(90deg, #FFD700, #FFA500)',
                    WebkitBackgroundClip: 'text',
                    WebkitTextFillColor: 'transparent',
                  }}
                >
                  Cost Breakdown
                </h2>
              </div>
              <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                <button
                  onClick={(e) => {
                    e.stopPropagation()
                    setIsMinimized(true)
                  }}
                  style={{
                    background: 'rgba(255, 215, 0, 0.1)',
                    border: '1px solid rgba(255, 215, 0, 0.3)',
                    borderRadius: '8px',
                    padding: '8px',
                    color: '#FFD700',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                  title="Minimize"
                >
                  <Minimize2 size={20} />
                </button>
                <button
                  onClick={(e) => {
                    e.stopPropagation()
                    onClose()
                  }}
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
                  }}
                  title="Close"
                >
                  <X size={20} />
                </button>
              </div>
            </div>

            {loading ? (
              <div style={{ textAlign: 'center', padding: '40px', color: '#aaaaaa' }}>
                Loading pricing data...
              </div>
            ) : (
              <>
                {/* Total Cost Summary */}
                <div
                  style={{
                    background: 'rgba(255, 215, 0, 0.1)',
                    border: '1px solid rgba(255, 215, 0, 0.3)',
                    borderRadius: '12px',
                    padding: '20px',
                    marginBottom: '24px',
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                    <span style={{ color: '#ffffff', fontSize: '1.1rem', fontWeight: '600' }}>Total Cost</span>
                    <span
                      style={{
                        color: '#FFD700',
                        fontSize: '1.8rem',
                        fontWeight: 'bold',
                      }}
                    >
                      ${totalCost.toFixed(4)}
                    </span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.9rem', color: '#aaaaaa' }}>
                    <span>Model Costs: ${totalModelCost.toFixed(4)}</span>
                    {queryCount > 0 && <span>Query Costs: ${queryCost.toFixed(4)} ({queryCount} queries)</span>}
                  </div>
                </div>

                {/* Cost Breakdown by Provider */}
                {Object.entries(groupedByProvider).map(([provider, providerData]) => (
                  <div
                    key={provider}
                    style={{
                      background: 'rgba(255, 215, 0, 0.05)',
                      border: '1px solid rgba(255, 215, 0, 0.2)',
                      borderRadius: '12px',
                      padding: '20px',
                      marginBottom: '16px',
                    }}
                  >
                    <h3
                      style={{
                        color: '#FFD700',
                        fontSize: '1.2rem',
                        margin: '0 0 16px 0',
                        textTransform: 'capitalize',
                      }}
                    >
                      {provider === 'openai' ? 'Chatgpt' : provider === 'anthropic' ? 'Claude' : provider === 'google' ? 'Gemini' : provider === 'xai' ? 'Grok' : provider}
                    </h3>
                    
                    {/* Provider Total */}
                    <div
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        marginBottom: '12px',
                        paddingBottom: '12px',
                        borderBottom: '1px solid rgba(255, 215, 0, 0.2)',
                      }}
                    >
                      <span style={{ color: '#ffffff', fontWeight: '600' }}>Provider Total</span>
                      <span style={{ color: '#FFD700', fontWeight: 'bold', fontSize: '1.1rem' }}>
                        ${providerData.totalCost.toFixed(4)}
                      </span>
                    </div>

                    {/* Models */}
                    {providerData.models.map((item, index) => (
                      <div
                        key={index}
                        style={{
                          background: 'rgba(0, 0, 0, 0.3)',
                          borderRadius: '8px',
                          padding: '16px',
                          marginBottom: '12px',
                        }}
                      >
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                          <span style={{ color: '#ffffff', fontWeight: '600' }}>{item.modelName}</span>
                          <span style={{ color: '#FFD700', fontWeight: 'bold' }}>
                            ${item.totalCost.toFixed(4)}
                          </span>
                        </div>
                        
                        <div style={{ display: 'grid', gridTemplateColumns: item.reasoningTokens > 0 ? '1fr 1fr 1fr' : '1fr 1fr', gap: '12px', fontSize: '0.85rem' }}>
                          <div>
                            <div style={{ color: '#aaaaaa', marginBottom: '4px' }}>Input Tokens</div>
                            <div style={{ color: '#ffffff' }}>
                              {item.inputTokens.toLocaleString()} tokens
                            </div>
                            <div style={{ color: '#888888', fontSize: '0.75rem', marginTop: '2px' }}>
                              @ ${item.inputPrice.toFixed(2)}/1M = ${item.inputCost.toFixed(4)}
                            </div>
                          </div>
                          <div>
                            <div style={{ color: '#aaaaaa', marginBottom: '4px' }}>Output Tokens</div>
                            <div style={{ color: '#ffffff' }}>
                              {item.outputTokens.toLocaleString()} tokens
                            </div>
                            <div style={{ color: '#888888', fontSize: '0.75rem', marginTop: '2px' }}>
                              @ ${item.outputPrice.toFixed(2)}/1M = ${item.outputCost.toFixed(4)}
                            </div>
                          </div>
                          {item.reasoningTokens > 0 && (
                            <div>
                              <div style={{ color: '#FFD700', marginBottom: '4px', fontWeight: '500' }}>Reasoning Tokens</div>
                              <div style={{ color: '#FFD700', fontWeight: 'bold' }}>
                                {item.reasoningTokens.toLocaleString()} tokens
                              </div>
                              <div style={{ color: '#888888', fontSize: '0.75rem', marginTop: '2px', fontStyle: 'italic' }}>
                                (included in API total, not billed separately)
                              </div>
                            </div>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                ))}

                {/* Query Costs */}
                {queryCount > 0 && (
                  <div
                    style={{
                      background: 'rgba(255, 215, 0, 0.05)',
                      border: '1px solid rgba(255, 215, 0, 0.2)',
                      borderRadius: '12px',
                      padding: '20px',
                      marginTop: '16px',
                    }}
                  >
                    <h3 style={{ color: '#FFD700', fontSize: '1.2rem', margin: '0 0 12px 0' }}>
                      Serper Search Queries
                    </h3>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <div>
                        <div style={{ color: '#ffffff', fontWeight: '600', marginBottom: '4px' }}>
                          {queryCount} {queryCount === 1 ? 'query' : 'queries'}
                        </div>
                        <div style={{ color: '#888888', fontSize: '0.85rem' }}>
                          @ $1.00 per 1,000 queries
                        </div>
                      </div>
                      <span style={{ color: '#FFD700', fontWeight: 'bold', fontSize: '1.2rem' }}>
                        ${queryCost.toFixed(4)}
                      </span>
                    </div>
                  </div>
                )}
              </>
            )}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}

export default CostBreakdownWindow

