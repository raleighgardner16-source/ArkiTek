import React from 'react'
import { DollarSign } from 'lucide-react'
import { spacing, fontSize, fontWeight, radius, transition } from '../../utils/styles'

interface AdminPricingSectionProps {
  pricingData: any
  expandedProviders: Record<string, boolean>
  setExpandedProviders: (fn: any) => void
}

const AdminPricingSection = ({ pricingData, expandedProviders, setExpandedProviders }: AdminPricingSectionProps) => {
  return (
    <div
      style={{
        background: 'rgba(93, 173, 226, 0.1)',
        border: '1px solid rgba(93, 173, 226, 0.3)',
        borderRadius: radius['2xl'],
        padding: spacing['4xl'],
      }}
    >
      <h2 style={{ fontSize: '1.8rem', color: '#ffffff', marginBottom: spacing['3xl'], display: 'flex', alignItems: 'center', gap: spacing.lg }}>
        <DollarSign size={28} color="#5dade2" />
        Model Pricing (per 1M tokens)
      </h2>
      <div style={{ display: 'flex', flexDirection: 'column', gap: spacing.lg }}>
        {(Object.entries(pricingData) as Array<[string, any]>).map(([providerKey, providerData]) => {
          const isExpanded = expandedProviders[providerKey]
          
          if (providerData.queryTiers) {
            return (
              <div
                key={providerKey}
                style={{
                  background: 'rgba(93, 173, 226, 0.05)',
                  border: '1px solid rgba(93, 173, 226, 0.2)',
                  borderRadius: radius.xl,
                  overflow: 'hidden',
                }}
              >
                {/* Provider Header */}
                <div
                  onClick={() => {
                    setExpandedProviders((prev: any) => ({
                      ...prev,
                      [providerKey]: !prev[providerKey],
                    }))
                  }}
                  style={{
                    padding: `${spacing.xl} ${spacing['2xl']}`,
                    cursor: 'pointer',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    transition: 'background 0.2s',
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.background = 'rgba(93, 173, 226, 0.1)'
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.background = 'rgba(93, 173, 226, 0.05)'
                  }}
                >
                  <h3 style={{ fontSize: fontSize['3xl'], color: '#5dade2', margin: 0, textTransform: 'capitalize' }}>
                    {providerData.name}
                  </h3>
                  <span style={{ color: '#888888', fontSize: fontSize.base }}>
                    {providerData.queryTiers.length} tiers
                    {isExpanded ? ' ▲' : ' ▼'}
                  </span>
                </div>

                {/* Query Tiers List */}
                {isExpanded && (
                  <div style={{ padding: `${spacing.lg} ${spacing['2xl']} ${spacing['2xl']} ${spacing['2xl']}`, borderTop: '1px solid rgba(93, 173, 226, 0.2)' }}>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: spacing.md }}>
                      {providerData.queryTiers.map((tier: any, index: number) => (
                        <div
                          key={index}
                          style={{
                            background: 'rgba(93, 173, 226, 0.03)',
                            border: '1px solid rgba(93, 173, 226, 0.15)',
                            borderRadius: radius.md,
                            padding: `${spacing.lg} ${spacing.xl}`,
                            display: 'flex',
                            justifyContent: 'space-between',
                            alignItems: 'center',
                          }}
                        >
                          <div>
                            <p style={{ color: '#ffffff', fontSize: fontSize.xl, fontWeight: fontWeight.medium, margin: 0 }}>
                              {tier.note || `${tier.credits.toLocaleString()} credits`}
                            </p>
                          </div>
                          <div style={{ textAlign: 'right' }}>
                            <p style={{ color: '#aaaaaa', fontSize: fontSize.sm, margin: 0 }}>Price per 1k credits</p>
                            <p style={{ color: '#5dade2', fontSize: fontSize['2xl'], fontWeight: fontWeight.bold, margin: 0 }}>
                              ${tier.pricePer1k.toFixed(2)}
                            </p>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )
          }
          
          return (
            <div
              key={providerKey}
              style={{
                background: 'rgba(93, 173, 226, 0.05)',
                border: '1px solid rgba(93, 173, 226, 0.2)',
                borderRadius: radius.xl,
                overflow: 'hidden',
              }}
            >
              {/* Provider Header */}
              <div
                onClick={() => {
                  setExpandedProviders((prev: any) => ({
                    ...prev,
                    [providerKey]: !prev[providerKey],
                  }))
                }}
                style={{
                  padding: `${spacing.xl} ${spacing['2xl']}`,
                  cursor: 'pointer',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  transition: 'background 0.2s',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = 'rgba(93, 173, 226, 0.1)'
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = 'rgba(93, 173, 226, 0.05)'
                }}
              >
                <h3 style={{ fontSize: fontSize['3xl'], color: '#5dade2', margin: 0, textTransform: 'capitalize' }}>
                  {providerData.name}
                </h3>
                <span style={{ color: '#888888', fontSize: fontSize.base }}>
                  {providerData.models ? Object.keys(providerData.models).length : 0} models
                  {isExpanded ? ' ▲' : ' ▼'}
                </span>
              </div>

              {/* Models List */}
              {isExpanded && providerData.models && (
                <div style={{ padding: `${spacing.lg} ${spacing['2xl']} ${spacing['2xl']} ${spacing['2xl']}`, borderTop: '1px solid rgba(93, 173, 226, 0.2)' }}>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: spacing.md }}>
                    {(Object.entries(providerData.models) as Array<[string, any]>).map(([modelName, pricing]) => (
                      <div
                        key={modelName}
                        style={{
                          background: 'rgba(93, 173, 226, 0.03)',
                          border: '1px solid rgba(93, 173, 226, 0.15)',
                          borderRadius: radius.md,
                          padding: `${spacing.lg} ${spacing.xl}`,
                          display: 'flex',
                          justifyContent: 'space-between',
                          alignItems: 'center',
                        }}
                      >
                        <div>
                          <p style={{ color: '#ffffff', fontSize: fontSize.xl, fontWeight: fontWeight.medium, margin: 0 }}>
                            {modelName}
                          </p>
                          {pricing.note && (
                            <p style={{ color: '#888888', fontSize: fontSize.sm, margin: `${spacing.xs} 0 0 0` }}>
                              {pricing.note}
                            </p>
                          )}
                        </div>
                        <div style={{ display: 'flex', gap: spacing['3xl'], alignItems: 'center' }}>
                          <div style={{ textAlign: 'right' }}>
                            <p style={{ color: '#aaaaaa', fontSize: fontSize.sm, margin: `0 0 ${spacing.xs} 0` }}>Input</p>
                            <input
                              type="text"
                              defaultValue={pricing.input !== null && pricing.input !== undefined ? pricing.input.toFixed(2) : '0.10'}
                              placeholder="0.10"
                              style={{
                                background: 'rgba(93, 173, 226, 0.1)',
                                border: '1px solid rgba(93, 173, 226, 0.3)',
                                borderRadius: radius.sm,
                                padding: `${spacing.sm} 10px`,
                                color: '#5dade2',
                                fontSize: fontSize['2xl'],
                                fontWeight: fontWeight.bold,
                                width: '80px',
                                textAlign: 'right',
                              }}
                            />
                          </div>
                          <div style={{ textAlign: 'right' }}>
                            <p style={{ color: '#aaaaaa', fontSize: fontSize.sm, margin: `0 0 ${spacing.xs} 0` }}>Output</p>
                            <input
                              type="text"
                              defaultValue={pricing.output !== null && pricing.output !== undefined ? pricing.output.toFixed(2) : '0.40'}
                              placeholder="0.40"
                              style={{
                                background: 'rgba(72, 201, 176, 0.1)',
                                border: '1px solid rgba(72, 201, 176, 0.3)',
                                borderRadius: radius.sm,
                                padding: `${spacing.sm} 10px`,
                                color: '#48c9b0',
                                fontSize: fontSize['2xl'],
                                fontWeight: fontWeight.bold,
                                width: '80px',
                                textAlign: 'right',
                              }}
                            />
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

export default AdminPricingSection
