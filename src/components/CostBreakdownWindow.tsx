import React, { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { X, DollarSign } from 'lucide-react'
import api from '../utils/api'
import { spacing, fontSize, fontWeight, radius, zIndex, layout, sx } from '../utils/styles'

interface Props {
  isOpen: boolean
  onClose: () => void
  tokenData: any[]
  queryCount?: number
  inline?: boolean
}

const CostBreakdownWindow = ({ isOpen, onClose, tokenData, queryCount = 0, inline = false }: Props) => {
  const [pricingData, setPricingData] = useState<Record<string, any> | null>(null)
  const [loading, setLoading] = useState(true)

  // Fetch pricing data
  useEffect(() => {
    const fetchPricing = async () => {
      try {
        const response = await api.get('/pricing')
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
  const calculateModelCost = (provider: string, model: string, inputTokens: number, outputTokens: number) => {
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
  const calculateQueryCost = (numQueries: number) => {
    if (!pricingData || !pricingData.serper || !pricingData.serper.queryTiers || numQueries === 0) {
      return 0
    }
    
    const tier = pricingData.serper.queryTiers[0]
    const pricePer1k = tier.pricePer1k || 1.00
    return (numQueries / 1000) * pricePer1k
  }

  // Separate judge items, cancelled summary/prompt, from regular council items
  const judgeTokenData = tokenData.filter(item => item.isJudge)
  const cancelledSummaryItems = tokenData.filter(item => item.isCancelledSummary)
  const cancelledPromptItems = tokenData.filter(item => item.isCancelledPrompt)
  const councilTokenData = tokenData.filter(item => !item.isJudge && !item.isPipeline && !item.isCancelledSummary && !item.isCancelledPrompt)

  // Process token data and calculate costs (council models only)
  const costBreakdown = councilTokenData.map((item: any) => {
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
  const judgeCostBreakdown = judgeTokenData.map((item: any) => {
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
  const groupedByProvider: Record<string, any> = {}
  costBreakdown.forEach((item: any) => {
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
      <div style={{ padding: spacing['2xl'] }}>
        {loading ? (
          <div style={{ color: '#aaaaaa', textAlign: 'center', padding: spacing['2xl'] }}>Loading pricing data...</div>
        ) : (
          <>
            {/* Total Cost Summary */}
            <div
              style={{
                background: 'rgba(93, 173, 226, 0.1)',
                border: '1px solid rgba(93, 173, 226, 0.3)',
                borderRadius: radius.xl,
                padding: spacing.xl,
                marginBottom: spacing['2xl'],
              }}
            >
              <div style={sx(layout.spaceBetween, { marginBottom: spacing.md })}>
                <span style={{ color: '#ffffff', fontSize: fontSize['2xl'], fontWeight: fontWeight.semibold }}>Total Cost</span>
                <span style={{ color: '#5dade2', fontSize: '1.4rem', fontWeight: fontWeight.bold }}>
                  ${totalCost.toFixed(4)}
                </span>
              </div>
              <div style={sx(layout.spaceBetween, { fontSize: fontSize.base, color: '#aaaaaa' })}>
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
                  borderRadius: radius.xl,
                  padding: spacing.xl,
                  marginBottom: spacing.lg,
                }}
              >
                <h4
                  style={{
                    color: '#5dade2',
                    fontSize: fontSize['2xl'],
                    margin: `0 0 ${spacing.lg} 0`,
                    fontWeight: fontWeight.semibold,
                    textTransform: 'capitalize',
                  }}
                >
                  {provider === 'openai' ? 'ChatGPT' : provider === 'anthropic' ? 'Claude' : provider === 'google' ? 'Gemini' : provider === 'xai' ? 'Grok' : provider === 'judge' ? 'Judge' : provider}
                </h4>

                {/* Provider Total */}
                <div
                  style={sx(layout.spaceBetween, {
                    marginBottom: spacing.lg,
                    paddingBottom: '10px',
                    borderBottom: '1px solid rgba(93, 173, 226, 0.2)',
                  })}
                >
                  <span style={{ color: '#ffffff', fontWeight: fontWeight.semibold, fontSize: fontSize.lg }}>Provider Total</span>
                  <span style={{ color: '#5dade2', fontWeight: fontWeight.bold, fontSize: fontSize['2xl'] }}>
                    ${providerData.totalCost.toFixed(4)}
                  </span>
                </div>

                {/* Models with full pricing detail */}
                {providerData.models.map((item: any, index: number) => (
                  <div
                    key={index}
                    style={{
                      background: 'rgba(0, 0, 0, 0.3)',
                      borderRadius: radius.md,
                      padding: '14px',
                      marginBottom: '10px',
                    }}
                  >
                    <div style={sx(layout.spaceBetween, { marginBottom: spacing.md })}>
                      <span style={{ color: '#ffffff', fontWeight: fontWeight.semibold, fontSize: fontSize.lg }}>{item.modelName}</span>
                      <span style={{ color: '#5dade2', fontWeight: fontWeight.bold }}>
                        ${item.totalCost.toFixed(4)}
                      </span>
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: item.reasoningTokens > 0 ? '1fr 1fr 1fr' : '1fr 1fr', gap: spacing.lg, fontSize: fontSize.base }}>
                      <div>
                        <div style={{ color: '#aaaaaa', marginBottom: spacing.xs }}>Input Tokens</div>
                        <div style={{ color: '#ffffff' }}>
                          {item.inputTokens.toLocaleString()} tokens
                        </div>
                        <div style={{ color: '#888888', fontSize: '0.75rem', marginTop: spacing['2xs'] }}>
                          @ ${item.inputPrice.toFixed(2)}/1M = ${item.inputCost.toFixed(4)}
                        </div>
                      </div>
                      <div>
                        <div style={{ color: '#aaaaaa', marginBottom: spacing.xs }}>Output Tokens</div>
                        <div style={{ color: '#ffffff' }}>
                          {item.outputTokens.toLocaleString()} tokens
                        </div>
                        <div style={{ color: '#888888', fontSize: '0.75rem', marginTop: spacing['2xs'] }}>
                          @ ${item.outputPrice.toFixed(2)}/1M = ${item.outputCost.toFixed(4)}
                        </div>
                      </div>
                      {item.reasoningTokens > 0 && (
                        <div>
                          <div style={{ color: '#5dade2', marginBottom: spacing.xs, fontWeight: fontWeight.medium }}>Reasoning Tokens</div>
                          <div style={{ color: '#5dade2', fontWeight: fontWeight.bold }}>
                            {item.reasoningTokens.toLocaleString()} tokens
                          </div>
                          <div style={{ color: '#888888', fontSize: '0.75rem', marginTop: spacing['2xs'], fontStyle: 'italic' }}>
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
                  borderRadius: radius.xl,
                  padding: spacing.xl,
                  marginBottom: spacing.lg,
                }}
              >
                <h4 style={{ color: '#a855f7', fontSize: fontSize['2xl'], margin: `0 0 ${spacing.lg} 0`, fontWeight: fontWeight.semibold }}>
                  Judge Model
                </h4>
                <div
                  style={sx(layout.spaceBetween, {
                    marginBottom: spacing.lg,
                    paddingBottom: '10px',
                    borderBottom: '1px solid rgba(168, 85, 247, 0.2)',
                  })}
                >
                  <span style={{ color: '#ffffff', fontWeight: fontWeight.semibold, fontSize: fontSize.lg }}>Judge Total</span>
                  <span style={{ color: '#a855f7', fontWeight: fontWeight.bold, fontSize: fontSize['2xl'] }}>
                    ${judgeTotalCost.toFixed(4)}
                  </span>
                </div>
                {judgeCostBreakdown.map((item, index) => (
                  <div
                    key={`judge-${index}`}
                    style={{
                      background: 'rgba(0, 0, 0, 0.3)',
                      borderRadius: radius.md,
                      padding: '14px',
                      marginBottom: '10px',
                    }}
                  >
                    <div style={sx(layout.spaceBetween, { marginBottom: spacing.md })}>
                      <span style={{ color: '#ffffff', fontWeight: fontWeight.semibold, fontSize: fontSize.lg }}>Judge Model</span>
                      <span style={{ color: '#a855f7', fontWeight: fontWeight.bold }}>
                        ${item.totalCost.toFixed(4)}
                      </span>
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: spacing.lg, fontSize: fontSize.base }}>
                      <div>
                        <div style={{ color: '#aaaaaa', marginBottom: spacing.xs }}>Input Tokens</div>
                        <div style={{ color: '#ffffff' }}>
                          {item.inputTokens.toLocaleString()} tokens
                        </div>
                        <div style={{ color: '#888888', fontSize: '0.75rem', marginTop: spacing['2xs'] }}>
                          @ ${item.inputPrice.toFixed(2)}/1M = ${item.inputCost.toFixed(4)}
                        </div>
                      </div>
                      <div>
                        <div style={{ color: '#aaaaaa', marginBottom: spacing.xs }}>Output Tokens</div>
                        <div style={{ color: '#ffffff' }}>
                          {item.outputTokens.toLocaleString()} tokens
                        </div>
                        <div style={{ color: '#888888', fontSize: '0.75rem', marginTop: spacing['2xs'] }}>
                          @ ${item.outputPrice.toFixed(2)}/1M = ${item.outputCost.toFixed(4)}
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Cancelled Summary Cost */}
            {cancelledSummaryItems.length > 0 && (() => {
              const cancelledHasTokens = cancelledSummaryItems.some(item => item.tokens && ((item.tokens.input || 0) + (item.tokens.output || 0)) > 0)
              return (
                <div
                  style={{
                    background: 'rgba(239, 68, 68, 0.05)',
                    border: '1px solid rgba(239, 68, 68, 0.2)',
                    borderRadius: radius.xl,
                    padding: spacing.xl,
                    marginBottom: spacing.lg,
                  }}
                >
                  <div style={sx(layout.spaceBetween, { marginBottom: spacing.md })}>
                    <div style={sx(layout.flexRow, { gap: spacing.md })}>
                      <h4 style={{ color: '#ef4444', fontSize: fontSize['2xl'], margin: 0, fontWeight: fontWeight.semibold }}>
                        Cancelled Summary Cost
                      </h4>
                      <span style={{
                        fontSize: fontSize['2xs'],
                        color: '#ef4444',
                        background: 'rgba(239, 68, 68, 0.15)',
                        padding: `${spacing['2xs']} ${spacing.md}`,
                        borderRadius: radius.xs,
                        fontWeight: fontWeight.semibold,
                      }}>
                        Cancelled
                      </span>
                    </div>
                  </div>
                  <div style={{ fontSize: fontSize.sm, color: '#999', lineHeight: '1.4' }}>
                    {cancelledHasTokens
                      ? 'Summary generation was cancelled. Any cost incurred before cancellation is still counted toward your usage.'
                      : 'Summary generation was cancelled before any tokens were used. No cost was incurred.'}
                  </div>
                </div>
              )
            })()}

            {/* Cancelled Prompt Cost */}
            {cancelledPromptItems.length > 0 && (
              <div
                style={{
                  background: 'rgba(239, 68, 68, 0.05)',
                  border: '1px solid rgba(239, 68, 68, 0.2)',
                  borderRadius: radius.xl,
                  padding: spacing.xl,
                  marginBottom: spacing.lg,
                }}
              >
                <div style={sx(layout.spaceBetween, { marginBottom: spacing.md })}>
                  <div style={sx(layout.flexRow, { gap: spacing.md })}>
                    <h4 style={{ color: '#ef4444', fontSize: fontSize['2xl'], margin: 0, fontWeight: fontWeight.semibold }}>
                      Cancelled Prompt Cost
                    </h4>
                    <span style={{
                      fontSize: fontSize['2xs'],
                      color: '#ef4444',
                      background: 'rgba(239, 68, 68, 0.15)',
                      padding: `${spacing['2xs']} ${spacing.md}`,
                      borderRadius: radius.xs,
                      fontWeight: fontWeight.semibold,
                    }}>
                      Cancelled
                    </span>
                  </div>
                </div>
                <div style={{ fontSize: fontSize.sm, color: '#999', lineHeight: '1.4' }}>
                  {costBreakdown.length > 0
                    ? 'Prompt was cancelled. Any cost incurred by models that completed before cancellation is shown above and still counts toward your usage.'
                    : 'Prompt was cancelled before any model responses completed. No cost was incurred.'}
                </div>
              </div>
            )}

            {/* Query Costs */}
            {queryCount > 0 && (
              <div
                style={{
                  background: 'rgba(93, 173, 226, 0.05)',
                  border: '1px solid rgba(93, 173, 226, 0.2)',
                  borderRadius: radius.xl,
                  padding: spacing.xl,
                }}
              >
                <h4 style={{ color: '#5dade2', fontSize: fontSize['2xl'], margin: `0 0 10px 0`, fontWeight: fontWeight.semibold }}>
                  Serper Search Queries
                </h4>
                <div style={sx(layout.spaceBetween)}>
                  <div>
                    <div style={{ color: '#ffffff', fontWeight: fontWeight.semibold, marginBottom: spacing.xs, fontSize: fontSize.lg }}>
                      {queryCount} {queryCount === 1 ? 'query' : 'queries'}
                    </div>
                    <div style={{ color: '#888888', fontSize: fontSize.md }}>
                      @ $1.00 per 1,000 queries
                    </div>
                  </div>
                  <span style={{ color: '#5dade2', fontWeight: fontWeight.bold, fontSize: fontSize['3xl'] }}>
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
          style={sx(layout.fixedFill, layout.center, {
            backgroundColor: 'rgba(0, 0, 0, 0.8)',
            zIndex: zIndex.modal,
          })}
        >
          <motion.div
            initial={{ scale: 0.9, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.9, opacity: 0 }}
            onClick={(e) => e.stopPropagation()}
            style={{
              background: 'rgba(0, 0, 0, 0.95)',
              border: '2px solid #5dade2',
              borderRadius: radius['2xl'],
              padding: spacing['4xl'],
              maxWidth: '900px',
              width: '90%',
              maxHeight: '85vh',
              overflowY: 'auto',
              position: 'relative',
              boxShadow: '0 8px 32px rgba(93, 173, 226, 0.3)',
            }}
          >
            {/* Header */}
            <div style={sx(layout.spaceBetween, { marginBottom: spacing['3xl'] })}>
              <div style={sx(layout.flexRow, { gap: spacing.lg })}>
                <DollarSign size={28} color="#5dade2" />
                <h2
                  style={{
                    fontSize: '1.8rem',
                    margin: 0,
                    color: '#5dade2',
                    fontWeight: fontWeight.bold,
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
                style={sx(layout.center, {
                  background: 'rgba(255, 0, 0, 0.1)',
                  border: '1px solid rgba(255, 0, 0, 0.3)',
                  borderRadius: radius.md,
                  padding: spacing.md,
                  color: '#FF0000',
                  cursor: 'pointer',
                })}
                title="Close"
              >
                <X size={20} />
              </button>
            </div>

            {loading ? (
              <div style={{ textAlign: 'center', padding: spacing['5xl'], color: '#aaaaaa' }}>
                Loading pricing data...
              </div>
            ) : (
              <>
                {/* Total Cost Summary */}
                <div
                  style={{
                    background: 'rgba(93, 173, 226, 0.1)',
                    border: '1px solid rgba(93, 173, 226, 0.3)',
                    borderRadius: radius.xl,
                    padding: spacing['2xl'],
                    marginBottom: spacing['3xl'],
                  }}
                >
                  <div style={sx(layout.spaceBetween, { marginBottom: spacing.lg })}>
                    <span style={{ color: '#ffffff', fontSize: fontSize['3xl'], fontWeight: fontWeight.semibold }}>Total Cost</span>
                    <span
                      style={{
                        color: '#5dade2',
                        fontSize: '1.8rem',
                        fontWeight: fontWeight.bold,
                      }}
                    >
                      ${totalCost.toFixed(4)}
                    </span>
                  </div>
                  <div style={sx(layout.spaceBetween, { fontSize: fontSize.lg, color: '#aaaaaa' })}>
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
                      borderRadius: radius.xl,
                      padding: spacing['2xl'],
                      marginBottom: spacing.xl,
                    }}
                  >
                    <h3
                      style={{
                        color: '#5dade2',
                        fontSize: fontSize['4xl'],
                        margin: `0 0 ${spacing.xl} 0`,
                        textTransform: 'capitalize',
                      }}
                    >
                      {provider === 'openai' ? 'ChatGPT' : provider === 'anthropic' ? 'Claude' : provider === 'google' ? 'Gemini' : provider === 'xai' ? 'Grok' : provider === 'judge' ? 'Judge' : provider}
                    </h3>
                    
                    {/* Provider Total */}
                    <div
                      style={sx(layout.spaceBetween, {
                        marginBottom: spacing.lg,
                        paddingBottom: spacing.lg,
                        borderBottom: '1px solid rgba(93, 173, 226, 0.2)',
                      })}
                    >
                      <span style={{ color: '#ffffff', fontWeight: fontWeight.semibold }}>Provider Total</span>
                      <span style={{ color: '#5dade2', fontWeight: fontWeight.bold, fontSize: fontSize['3xl'] }}>
                        ${providerData.totalCost.toFixed(4)}
                      </span>
                    </div>

                    {/* Models */}
                    {providerData.models.map((item: any, index: number) => (
                      <div
                        key={index}
                        style={{
                          background: 'rgba(0, 0, 0, 0.3)',
                          borderRadius: radius.md,
                          padding: spacing.xl,
                          marginBottom: spacing.lg,
                        }}
                      >
                        <div style={sx(layout.spaceBetween, { marginBottom: spacing.md })}>
                          <span style={{ color: '#ffffff', fontWeight: fontWeight.semibold }}>{item.modelName}</span>
                          <span style={{ color: '#5dade2', fontWeight: fontWeight.bold }}>
                            ${item.totalCost.toFixed(4)}
                          </span>
                        </div>
                        
                        <div style={{ display: 'grid', gridTemplateColumns: item.reasoningTokens > 0 ? '1fr 1fr 1fr' : '1fr 1fr', gap: spacing.lg, fontSize: fontSize.base }}>
                          <div>
                            <div style={{ color: '#aaaaaa', marginBottom: spacing.xs }}>Input Tokens</div>
                            <div style={{ color: '#ffffff' }}>
                              {item.inputTokens.toLocaleString()} tokens
                            </div>
                            <div style={{ color: '#888888', fontSize: '0.75rem', marginTop: spacing['2xs'] }}>
                              @ ${item.inputPrice.toFixed(2)}/1M = ${item.inputCost.toFixed(4)}
                            </div>
                          </div>
                          <div>
                            <div style={{ color: '#aaaaaa', marginBottom: spacing.xs }}>Output Tokens</div>
                            <div style={{ color: '#ffffff' }}>
                              {item.outputTokens.toLocaleString()} tokens
                            </div>
                            <div style={{ color: '#888888', fontSize: '0.75rem', marginTop: spacing['2xs'] }}>
                              @ ${item.outputPrice.toFixed(2)}/1M = ${item.outputCost.toFixed(4)}
                            </div>
                          </div>
                          {item.reasoningTokens > 0 && (
                            <div>
                              <div style={{ color: '#5dade2', marginBottom: spacing.xs, fontWeight: fontWeight.medium }}>Reasoning Tokens</div>
                              <div style={{ color: '#5dade2', fontWeight: fontWeight.bold }}>
                                {item.reasoningTokens.toLocaleString()} tokens
                              </div>
                              <div style={{ color: '#888888', fontSize: '0.75rem', marginTop: spacing['2xs'], fontStyle: 'italic' }}>
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
                      borderRadius: radius.xl,
                      padding: spacing['2xl'],
                      marginBottom: spacing.xl,
                    }}
                  >
                    <h3
                      style={{
                        color: '#a855f7',
                        fontSize: fontSize['4xl'],
                        margin: `0 0 ${spacing.xl} 0`,
                      }}
                    >
                      Judge Model
                    </h3>
                    <div
                      style={sx(layout.spaceBetween, {
                        marginBottom: spacing.lg,
                        paddingBottom: spacing.lg,
                        borderBottom: '1px solid rgba(168, 85, 247, 0.2)',
                      })}
                    >
                      <span style={{ color: '#ffffff', fontWeight: fontWeight.semibold }}>Judge Total</span>
                      <span style={{ color: '#a855f7', fontWeight: fontWeight.bold, fontSize: fontSize['3xl'] }}>
                        ${judgeTotalCost.toFixed(4)}
                      </span>
                    </div>
                    {judgeCostBreakdown.map((item, index) => (
                      <div
                        key={`judge-${index}`}
                        style={{
                          background: 'rgba(0, 0, 0, 0.3)',
                          borderRadius: radius.md,
                          padding: spacing.xl,
                          marginBottom: spacing.lg,
                        }}
                      >
                        <div style={sx(layout.spaceBetween, { marginBottom: spacing.md })}>
                          <span style={{ color: '#ffffff', fontWeight: fontWeight.semibold }}>Judge Model</span>
                          <span style={{ color: '#a855f7', fontWeight: fontWeight.bold }}>
                            ${item.totalCost.toFixed(4)}
                          </span>
                        </div>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: spacing.lg, fontSize: fontSize.base }}>
                          <div>
                            <div style={{ color: '#aaaaaa', marginBottom: spacing.xs }}>Input Tokens</div>
                            <div style={{ color: '#ffffff' }}>
                              {item.inputTokens.toLocaleString()} tokens
                            </div>
                            <div style={{ color: '#888888', fontSize: '0.75rem', marginTop: spacing['2xs'] }}>
                              @ ${item.inputPrice.toFixed(2)}/1M = ${item.inputCost.toFixed(4)}
                            </div>
                          </div>
                          <div>
                            <div style={{ color: '#aaaaaa', marginBottom: spacing.xs }}>Output Tokens</div>
                            <div style={{ color: '#ffffff' }}>
                              {item.outputTokens.toLocaleString()} tokens
                            </div>
                            <div style={{ color: '#888888', fontSize: '0.75rem', marginTop: spacing['2xs'] }}>
                              @ ${item.outputPrice.toFixed(2)}/1M = ${item.outputCost.toFixed(4)}
                            </div>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {/* Cancelled Summary Cost */}
                {cancelledSummaryItems.length > 0 && (() => {
                  const cancelledHasTokens = cancelledSummaryItems.some(item => item.tokens && ((item.tokens.input || 0) + (item.tokens.output || 0)) > 0)
                  return (
                    <div
                      style={{
                        background: 'rgba(239, 68, 68, 0.05)',
                        border: '1px solid rgba(239, 68, 68, 0.2)',
                        borderRadius: radius.xl,
                        padding: spacing['2xl'],
                        marginBottom: spacing.xl,
                      }}
                    >
                      <div style={sx(layout.spaceBetween, { marginBottom: spacing.lg })}>
                        <div style={sx(layout.flexRow, { gap: spacing.md })}>
                          <h3 style={{ color: '#ef4444', fontSize: fontSize['4xl'], margin: 0, fontWeight: fontWeight.bold }}>
                            Cancelled Summary Cost
                          </h3>
                          <span style={{
                            fontSize: fontSize['2xs'],
                            color: '#ef4444',
                            background: 'rgba(239, 68, 68, 0.15)',
                            padding: `${spacing['2xs']} ${spacing.md}`,
                            borderRadius: radius.xs,
                            fontWeight: fontWeight.semibold,
                          }}>
                            Cancelled
                          </span>
                        </div>
                      </div>
                      <div style={{ fontSize: '0.78rem', color: '#999', lineHeight: '1.5' }}>
                        {cancelledHasTokens
                          ? 'Summary generation was cancelled before completion. Any cost incurred before cancellation is still counted toward your usage on the server.'
                          : 'Summary generation was cancelled before any tokens were used. No cost was incurred.'}
                      </div>
                    </div>
                  )
                })()}

                {/* Cancelled Prompt Cost */}
                {cancelledPromptItems.length > 0 && (
                  <div
                    style={{
                      background: 'rgba(239, 68, 68, 0.05)',
                      border: '1px solid rgba(239, 68, 68, 0.2)',
                      borderRadius: radius.xl,
                      padding: spacing['2xl'],
                      marginBottom: spacing.xl,
                    }}
                  >
                    <div style={sx(layout.spaceBetween, { marginBottom: spacing.lg })}>
                      <div style={sx(layout.flexRow, { gap: spacing.md })}>
                        <h3 style={{ color: '#ef4444', fontSize: fontSize['4xl'], margin: 0, fontWeight: fontWeight.bold }}>
                          Cancelled Prompt Cost
                        </h3>
                        <span style={{
                          fontSize: fontSize['2xs'],
                          color: '#ef4444',
                          background: 'rgba(239, 68, 68, 0.15)',
                          padding: `${spacing['2xs']} ${spacing.md}`,
                          borderRadius: radius.xs,
                          fontWeight: fontWeight.semibold,
                        }}>
                          Cancelled
                        </span>
                      </div>
                    </div>
                    <div style={{ fontSize: '0.78rem', color: '#999', lineHeight: '1.5' }}>
                      {costBreakdown.length > 0
                        ? 'Prompt was cancelled. Any cost incurred by models that completed before cancellation is shown above and still counts toward your usage.'
                        : 'Prompt was cancelled before any model responses completed. No cost was incurred.'}
                    </div>
                  </div>
                )}

                {/* Query Costs */}
                {queryCount > 0 && (
                  <div
                    style={{
                      background: 'rgba(93, 173, 226, 0.05)',
                      border: '1px solid rgba(93, 173, 226, 0.2)',
                      borderRadius: radius.xl,
                      padding: spacing['2xl'],
                      marginTop: spacing.xl,
                    }}
                  >
                    <h3 style={{ color: '#5dade2', fontSize: fontSize['4xl'], margin: `0 0 ${spacing.lg} 0` }}>
                      Serper Search Queries
                    </h3>
                    <div style={sx(layout.spaceBetween)}>
                      <div>
                        <div style={{ color: '#ffffff', fontWeight: fontWeight.semibold, marginBottom: spacing.xs }}>
                          {queryCount} {queryCount === 1 ? 'query' : 'queries'}
                        </div>
                        <div style={{ color: '#888888', fontSize: fontSize.base }}>
                          @ $1.00 per 1,000 queries
                        </div>
                      </div>
                      <span style={{ color: '#5dade2', fontWeight: fontWeight.bold, fontSize: fontSize['4xl'] }}>
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
