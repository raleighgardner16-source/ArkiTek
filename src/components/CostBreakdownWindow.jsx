import React, { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { X, DollarSign } from 'lucide-react'
import api from '../utils/api'
import { API_URL } from '../utils/config'

const CostBreakdownWindow = ({ isOpen, onClose, tokenData, queryCount = 0, inline = false }) => {
  const [pricingData, setPricingData] = useState(null)
  const [loading, setLoading] = useState(true)

  // Fetch pricing data
  useEffect(() => {
    const fetchPricing = async () => {
      try {
        const response = await api.get(`${API_URL}/api/pricing`)
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

  // Separate judge items from regular council items
  const judgeTokenData = tokenData.filter(item => item.isJudge)
  const councilTokenData = tokenData.filter(item => !item.isJudge && !item.isPipeline)

  // Process token data and calculate costs (council models only)
  const costBreakdown = councilTokenData.map((item) => {
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

  // Process judge model costs separately
  const judgeCostBreakdown = judgeTokenData.map((item) => {
    if (!item.tokens) return null
    const provider = item.tokens.provider || 'google'
    const model = item.tokens.model || 'unknown'
    const inputTokens = item.tokens.input || 0
    const outputTokens = item.tokens.output || 0
    const costs = calculateModelCost(provider, model, inputTokens, outputTokens)
    return {
      modelName: 'Judge Model',
      provider,
      model,
      inputTokens,
      outputTokens,
      reasoningTokens: 0,
      totalTokens: inputTokens + outputTokens,
      inputPrice: costs.inputPrice,
      outputPrice: costs.outputPrice,
      inputCost: costs.inputCost,
      outputCost: costs.outputCost,
      totalCost: costs.totalCost,
    }
  }).filter(item => item !== null)

  // Calculate totals (council + judge)
  const judgeTotalCost = judgeCostBreakdown.reduce((sum, item) => sum + item.totalCost, 0)
  const judgeTotalInputTokens = judgeCostBreakdown.reduce((sum, item) => sum + item.inputTokens, 0)
  const judgeTotalOutputTokens = judgeCostBreakdown.reduce((sum, item) => sum + item.outputTokens, 0)
  const judgeTotalTokens = judgeTotalInputTokens + judgeTotalOutputTokens

  const totalInputTokens = costBreakdown.reduce((sum, item) => sum + item.inputTokens, 0) + judgeTotalInputTokens
  const totalOutputTokens = costBreakdown.reduce((sum, item) => sum + item.outputTokens, 0) + judgeTotalOutputTokens
  const totalTokens = totalInputTokens + totalOutputTokens
  const totalModelCost = costBreakdown.reduce((sum, item) => sum + item.totalCost, 0) + judgeTotalCost
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

  // If inline mode, render without modal overlay (full pricing detail like the modal)
  if (inline) {
    return (
      <div style={{ padding: '20px' }}>
        {loading ? (
          <div style={{ color: '#aaaaaa', textAlign: 'center', padding: '20px' }}>Loading pricing data...</div>
        ) : (
          <>
            {/* Total Cost Summary */}
            <div
              style={{
                background: 'rgba(93, 173, 226, 0.1)',
                border: '1px solid rgba(93, 173, 226, 0.3)',
                borderRadius: '12px',
                padding: '16px',
                marginBottom: '20px',
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                <span style={{ color: '#ffffff', fontSize: '1rem', fontWeight: '600' }}>Total Cost</span>
                <span style={{ color: '#5dade2', fontSize: '1.4rem', fontWeight: 'bold' }}>
                  ${totalCost.toFixed(4)}
                </span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem', color: '#aaaaaa' }}>
                <span>Model Costs: ${totalModelCost.toFixed(4)}</span>
                {queryCount > 0 && <span>Query Costs: ${queryCost.toFixed(4)} ({queryCount} queries)</span>}
              </div>
            </div>

            {/* Cost Breakdown by Provider */}
            {Object.entries(groupedByProvider).map(([provider, providerData]) => (
              <div
                key={provider}
                style={{
                  background: 'rgba(93, 173, 226, 0.05)',
                  border: '1px solid rgba(93, 173, 226, 0.2)',
                  borderRadius: '12px',
                  padding: '16px',
                  marginBottom: '12px',
                }}
              >
                <h4
                  style={{
                    color: '#5dade2',
                    fontSize: '1rem',
                    margin: '0 0 12px 0',
                    fontWeight: '600',
                    textTransform: 'capitalize',
                  }}
                >
                  {provider === 'openai' ? 'ChatGPT' : provider === 'anthropic' ? 'Claude' : provider === 'google' ? 'Gemini' : provider === 'xai' ? 'Grok' : provider}
                </h4>

                {/* Provider Total */}
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    marginBottom: '12px',
                    paddingBottom: '10px',
                    borderBottom: '1px solid rgba(93, 173, 226, 0.2)',
                  }}
                >
                  <span style={{ color: '#ffffff', fontWeight: '600', fontSize: '0.9rem' }}>Provider Total</span>
                  <span style={{ color: '#5dade2', fontWeight: 'bold', fontSize: '1rem' }}>
                    ${providerData.totalCost.toFixed(4)}
                  </span>
                </div>

                {/* Models with full pricing detail */}
                {providerData.models.map((item, index) => (
                  <div
                    key={index}
                    style={{
                      background: 'rgba(0, 0, 0, 0.3)',
                      borderRadius: '8px',
                      padding: '14px',
                      marginBottom: '10px',
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                      <span style={{ color: '#ffffff', fontWeight: '600', fontSize: '0.9rem' }}>{item.modelName}</span>
                      <span style={{ color: '#5dade2', fontWeight: 'bold' }}>
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
                          <div style={{ color: '#5dade2', marginBottom: '4px', fontWeight: '500' }}>Reasoning Tokens</div>
                          <div style={{ color: '#5dade2', fontWeight: 'bold' }}>
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

            {/* Judge Model */}
            {judgeCostBreakdown.length > 0 && judgeTotalTokens > 0 && (
              <div
                style={{
                  background: 'rgba(168, 85, 247, 0.05)',
                  border: '1px solid rgba(168, 85, 247, 0.2)',
                  borderRadius: '12px',
                  padding: '16px',
                  marginBottom: '12px',
                }}
              >
                <h4 style={{ color: '#a855f7', fontSize: '1rem', margin: '0 0 12px 0', fontWeight: '600' }}>
                  Judge Model
                </h4>
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    marginBottom: '12px',
                    paddingBottom: '10px',
                    borderBottom: '1px solid rgba(168, 85, 247, 0.2)',
                  }}
                >
                  <span style={{ color: '#ffffff', fontWeight: '600', fontSize: '0.9rem' }}>Judge Total</span>
                  <span style={{ color: '#a855f7', fontWeight: 'bold', fontSize: '1rem' }}>
                    ${judgeTotalCost.toFixed(4)}
                  </span>
                </div>
                {judgeCostBreakdown.map((item, index) => (
                  <div
                    key={`judge-${index}`}
                    style={{
                      background: 'rgba(0, 0, 0, 0.3)',
                      borderRadius: '8px',
                      padding: '14px',
                      marginBottom: '10px',
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                      <span style={{ color: '#ffffff', fontWeight: '600', fontSize: '0.9rem' }}>Judge Model</span>
                      <span style={{ color: '#a855f7', fontWeight: 'bold' }}>
                        ${item.totalCost.toFixed(4)}
                      </span>
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', fontSize: '0.85rem' }}>
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
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Query Costs */}
            {queryCount > 0 && (
              <div
                style={{
                  background: 'rgba(93, 173, 226, 0.05)',
                  border: '1px solid rgba(93, 173, 226, 0.2)',
                  borderRadius: '12px',
                  padding: '16px',
                }}
              >
                <h4 style={{ color: '#5dade2', fontSize: '1rem', margin: '0 0 10px 0', fontWeight: '600' }}>
                  Serper Search Queries
                </h4>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div>
                    <div style={{ color: '#ffffff', fontWeight: '600', marginBottom: '4px', fontSize: '0.9rem' }}>
                      {queryCount} {queryCount === 1 ? 'query' : 'queries'}
                    </div>
                    <div style={{ color: '#888888', fontSize: '0.8rem' }}>
                      @ $1.00 per 1,000 queries
                    </div>
                  </div>
                  <span style={{ color: '#5dade2', fontWeight: 'bold', fontSize: '1.1rem' }}>
                    ${queryCost.toFixed(4)}
                  </span>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    )
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
              border: '2px solid #5dade2',
              borderRadius: '16px',
              padding: '30px',
              maxWidth: '900px',
              width: '90%',
              maxHeight: '85vh',
              overflowY: 'auto',
              position: 'relative',
              boxShadow: '0 8px 32px rgba(93, 173, 226, 0.3)',
            }}
          >
            {/* Header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <DollarSign size={28} color="#5dade2" />
                <h2
                  style={{
                    fontSize: '1.8rem',
                    margin: 0,
                    color: '#5dade2',
                    fontWeight: 'bold',
                  }}
                >
                  Prompt Cost Breakdown
                </h2>
              </div>
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

            {loading ? (
              <div style={{ textAlign: 'center', padding: '40px', color: '#aaaaaa' }}>
                Loading pricing data...
              </div>
            ) : (
              <>
                {/* Total Cost Summary */}
                <div
                  style={{
                    background: 'rgba(93, 173, 226, 0.1)',
                    border: '1px solid rgba(93, 173, 226, 0.3)',
                    borderRadius: '12px',
                    padding: '20px',
                    marginBottom: '24px',
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                    <span style={{ color: '#ffffff', fontSize: '1.1rem', fontWeight: '600' }}>Total Cost</span>
                    <span
                      style={{
                        color: '#5dade2',
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
                      background: 'rgba(93, 173, 226, 0.05)',
                      border: '1px solid rgba(93, 173, 226, 0.2)',
                      borderRadius: '12px',
                      padding: '20px',
                      marginBottom: '16px',
                    }}
                  >
                    <h3
                      style={{
                        color: '#5dade2',
                        fontSize: '1.2rem',
                        margin: '0 0 16px 0',
                        textTransform: 'capitalize',
                      }}
                    >
                      {provider === 'openai' ? 'ChatGPT' : provider === 'anthropic' ? 'Claude' : provider === 'google' ? 'Gemini' : provider === 'xai' ? 'Grok' : provider}
                    </h3>
                    
                    {/* Provider Total */}
                    <div
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        marginBottom: '12px',
                        paddingBottom: '12px',
                        borderBottom: '1px solid rgba(93, 173, 226, 0.2)',
                      }}
                    >
                      <span style={{ color: '#ffffff', fontWeight: '600' }}>Provider Total</span>
                      <span style={{ color: '#5dade2', fontWeight: 'bold', fontSize: '1.1rem' }}>
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
                          <span style={{ color: '#5dade2', fontWeight: 'bold' }}>
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
                              <div style={{ color: '#5dade2', marginBottom: '4px', fontWeight: '500' }}>Reasoning Tokens</div>
                              <div style={{ color: '#5dade2', fontWeight: 'bold' }}>
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

                {/* Judge Model */}
                {judgeCostBreakdown.length > 0 && judgeTotalTokens > 0 && (
                  <div
                    style={{
                      background: 'rgba(168, 85, 247, 0.05)',
                      border: '1px solid rgba(168, 85, 247, 0.2)',
                      borderRadius: '12px',
                      padding: '20px',
                      marginBottom: '16px',
                    }}
                  >
                    <h3
                      style={{
                        color: '#a855f7',
                        fontSize: '1.2rem',
                        margin: '0 0 16px 0',
                      }}
                    >
                      Judge Model
                    </h3>
                    <div
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        marginBottom: '12px',
                        paddingBottom: '12px',
                        borderBottom: '1px solid rgba(168, 85, 247, 0.2)',
                      }}
                    >
                      <span style={{ color: '#ffffff', fontWeight: '600' }}>Judge Total</span>
                      <span style={{ color: '#a855f7', fontWeight: 'bold', fontSize: '1.1rem' }}>
                        ${judgeTotalCost.toFixed(4)}
                      </span>
                    </div>
                    {judgeCostBreakdown.map((item, index) => (
                      <div
                        key={`judge-${index}`}
                        style={{
                          background: 'rgba(0, 0, 0, 0.3)',
                          borderRadius: '8px',
                          padding: '16px',
                          marginBottom: '12px',
                        }}
                      >
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                          <span style={{ color: '#ffffff', fontWeight: '600' }}>Judge Model</span>
                          <span style={{ color: '#a855f7', fontWeight: 'bold' }}>
                            ${item.totalCost.toFixed(4)}
                          </span>
                        </div>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', fontSize: '0.85rem' }}>
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
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {/* Query Costs */}
                {queryCount > 0 && (
                  <div
                    style={{
                      background: 'rgba(93, 173, 226, 0.05)',
                      border: '1px solid rgba(93, 173, 226, 0.2)',
                      borderRadius: '12px',
                      padding: '20px',
                      marginTop: '16px',
                    }}
                  >
                    <h3 style={{ color: '#5dade2', fontSize: '1.2rem', margin: '0 0 12px 0' }}>
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
                      <span style={{ color: '#5dade2', fontWeight: 'bold', fontSize: '1.2rem' }}>
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

