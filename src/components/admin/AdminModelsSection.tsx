import React from 'react'
import { Package } from 'lucide-react'
import { LLM_PROVIDERS } from '../../services/llmProviders'
import { spacing, fontSize, fontWeight, radius, transition } from '../../utils/styles'

interface AdminModelsSectionProps {
  expandedProviders: Record<string, boolean>
  setExpandedProviders: (fn: any) => void
}

const AdminModelsSection = ({ expandedProviders, setExpandedProviders }: AdminModelsSectionProps) => {
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
        <Package size={28} color="#5dade2" />
        Models & Releases
      </h2>
      <div style={{ display: 'flex', flexDirection: 'column', gap: spacing['2xl'] }}>
        {Object.entries(LLM_PROVIDERS).map(([providerKey, provider]) => {
          const isExpanded = expandedProviders[providerKey]
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
                <h3 style={{ fontSize: fontSize['3xl'], color: '#5dade2', margin: 0 }}>
                  {provider.name}
                </h3>
                <span style={{ color: '#888888', fontSize: fontSize.base }}>
                  {provider.models.length} models
                  {isExpanded ? ' ▲' : ' ▼'}
                </span>
              </div>

              {/* Models List */}
              {isExpanded && (
                <div style={{ padding: `${spacing.lg} ${spacing['2xl']} ${spacing['2xl']} ${spacing['2xl']}`, borderTop: '1px solid rgba(93, 173, 226, 0.2)' }}>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: spacing.lg }}>
                    {provider.models.map((model) => (
                      <div
                        key={model.id}
                        style={{
                          background: 'rgba(93, 173, 226, 0.03)',
                          border: '1px solid rgba(93, 173, 226, 0.15)',
                          borderRadius: radius.md,
                          padding: spacing.xl,
                          display: 'grid',
                          gridTemplateColumns: '2fr 1fr 1fr',
                          gap: spacing.xl,
                          alignItems: 'center',
                        }}
                      >
                        {/* Current Model */}
                        <div>
                          <p style={{ color: '#888888', fontSize: fontSize.sm, margin: `0 0 ${spacing.xs} 0` }}>Current Model</p>
                          <p style={{ color: '#ffffff', fontSize: fontSize['2xl'], fontWeight: fontWeight.medium, margin: 0 }}>
                            {model.id}
                          </p>
                          <p style={{ color: '#aaaaaa', fontSize: fontSize.md, margin: `${spacing.xs} 0 0 0` }}>
                            {model.label} ({model.type})
                          </p>
                        </div>

                        {/* Replacement Model Placeholder */}
                        <div
                          style={{
                            background: 'rgba(72, 201, 176, 0.05)',
                            border: '1px dashed rgba(72, 201, 176, 0.3)',
                            borderRadius: radius.md,
                            padding: spacing.lg,
                            minHeight: '60px',
                            display: 'flex',
                            flexDirection: 'column',
                            justifyContent: 'center',
                          }}
                        >
                          <p style={{ color: '#888888', fontSize: fontSize.xs, margin: `0 0 ${spacing.xs} 0` }}>Replacement Model</p>
                          <p style={{ color: '#aaaaaa', fontSize: fontSize.base, margin: 0, fontStyle: 'italic' }}>
                            TBD
                          </p>
                        </div>

                        {/* Release Date Placeholder */}
                        <div
                          style={{
                            background: 'rgba(255, 165, 0, 0.05)',
                            border: '1px dashed rgba(255, 165, 0, 0.3)',
                            borderRadius: radius.md,
                            padding: spacing.lg,
                            minHeight: '60px',
                            display: 'flex',
                            flexDirection: 'column',
                            justifyContent: 'center',
                          }}
                        >
                          <p style={{ color: '#888888', fontSize: fontSize.xs, margin: `0 0 ${spacing.xs} 0` }}>Release Date</p>
                          <p style={{ color: '#aaaaaa', fontSize: fontSize.base, margin: 0, fontStyle: 'italic' }}>
                            TBD
                          </p>
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

export default AdminModelsSection
