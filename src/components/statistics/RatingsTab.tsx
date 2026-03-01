import React from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Star, Cpu, ChevronDown, ChevronRight } from 'lucide-react'
import { spacing, fontSize, fontWeight, radius, transition } from '../../utils/styles'
import { sx } from '../../utils/styles'

interface RatingsTabProps {
  ratingsStats: any
  userStats: any
  currentTheme: any
  theme: string
  s: any
  expandedProviders: Record<string, any>
  setExpandedProviders: React.Dispatch<React.SetStateAction<Record<string, any>>>
  expandedModels: Record<string, any>
  setExpandedModels: React.Dispatch<React.SetStateAction<Record<string, any>>>
  LLM_PROVIDERS: any
  formatNumber: (num: number) => string
  formatTokens: (num: number) => string
}

const RatingsTab = ({
  ratingsStats,
  userStats,
  currentTheme,
  theme,
  s,
  expandedProviders,
  setExpandedProviders,
  expandedModels,
  setExpandedModels,
  LLM_PROVIDERS,
  formatNumber,
  formatTokens,
}: RatingsTabProps) => {
  return (
    <motion.div
      key="ratings"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.15 }}
    >
      {/* Ratings Section */}
      <div style={{ display: 'flex', gap: spacing['2xl'], flexDirection: 'row', flexWrap: 'nowrap', marginBottom: spacing['5xl'] }}>
        {/* Favorite Provider - Separate container */}
        <div style={{ 
          background: currentTheme.backgroundOverlay, 
          border: `1px solid ${currentTheme.borderLight}`,
          padding: spacing['3xl'], 
          borderRadius: radius['2xl'],
          flex: 1,
          minWidth: '400px',
          color: currentTheme.text,
        }}>
          <p style={{ color: currentTheme.text, fontSize: fontSize['2xl'], marginBottom: spacing.xl }}>Your Favorite Provider:</p>
          {ratingsStats.totalRatings > 0 && ratingsStats.favoriteProvider ? (
            <>
              <p style={{ 
                fontSize: '2rem', 
                fontWeight: fontWeight.bold, 
                margin: `0 0 ${spacing.lg} 0`,
                color: currentTheme.text,
              }}>
                {LLM_PROVIDERS[ratingsStats.favoriteProvider]?.name || ratingsStats.favoriteProvider}
              </p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: spacing.md }}>
                <p style={{ color: currentTheme.textSecondary, fontSize: fontSize.base, margin: 0 }}>Average Score:</p>
                  <div style={{ display: 'flex', alignItems: 'center', gap: spacing.md }}>
                  <p style={{ 
                    fontSize: fontSize['3xl'], 
                    margin: 0,
                    color: currentTheme.text,
                  }}>
                    {ratingsStats.favoriteProviderAvg.toFixed(2)}
                  </p>
                  <Star size={20} fill="#FFD700" color="#FFD700" />
                  <p style={{ color: currentTheme.textSecondary, fontSize: fontSize['3xl'], margin: 0 }}>
                    / 5
                  </p>
                </div>
              </div>
            </>
          ) : (
            <>
              <p style={{ color: currentTheme.textMuted, fontSize: fontSize['6xl'], margin: `0 0 ${spacing.lg} 0` }}>
                Rate models first
              </p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: spacing.md }}>
                <p style={{ color: currentTheme.textSecondary, fontSize: fontSize.base, margin: 0 }}>Average Score:</p>
                <div style={{ display: 'flex', alignItems: 'center', gap: spacing.md }}>
                  <p style={{ color: currentTheme.textMuted, fontSize: fontSize['3xl'], margin: 0 }}>
                    —
                  </p>
                  <Star size={20} fill="#FFD700" color="#FFD700" />
                  <p style={{ color: currentTheme.textSecondary, fontSize: fontSize['3xl'], margin: 0 }}>
                    / 5
                  </p>
                </div>
              </div>
            </>
          )}
        </div>
        
        {/* Favorite Model - Separate container */}
        <div style={{ 
          background: currentTheme.backgroundOverlay, 
          border: `1px solid ${currentTheme.borderLight}`,
          padding: spacing['3xl'], 
          borderRadius: radius['2xl'],
          flex: 1,
          minWidth: '400px',
          color: currentTheme.text,
        }}>
          <p style={{ color: currentTheme.text, fontSize: fontSize['2xl'], marginBottom: spacing.xl }}>Your Favorite Model:</p>
          {ratingsStats.totalRatings > 0 && ratingsStats.favoriteModel ? (
            <>
              <p style={{ 
                fontSize: '2rem', 
                fontWeight: fontWeight.bold, 
                margin: `0 0 ${spacing.lg} 0`,
                color: currentTheme.text,
              }}>
                {(() => {
                  const parts = (ratingsStats.favoriteModel as string).split('-')
                  if (parts.length >= 2) {
                    const provider = parts[0]
                    const modelName = parts.slice(1).join('-')
                    return `${LLM_PROVIDERS[provider]?.name || provider} - ${modelName}`
                  }
                  return ratingsStats.favoriteModel
                })()}
              </p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: spacing.md }}>
                <p style={{ color: currentTheme.textSecondary, fontSize: fontSize.base, margin: 0 }}>Average Score:</p>
                <div style={{ display: 'flex', alignItems: 'center', gap: spacing.md }}>
                  <p style={{ 
                    fontSize: fontSize['3xl'], 
                    margin: 0,
                    color: currentTheme.text,
                  }}>
                    {ratingsStats.favoriteModelAvg.toFixed(2)}
                  </p>
                  <Star size={20} fill="#FFD700" color="#FFD700" />
                  <p style={{ color: currentTheme.textSecondary, fontSize: fontSize['3xl'], margin: 0 }}>
                    / 5
                  </p>
                </div>
              </div>
            </>
          ) : (
            <>
              <p style={{ color: currentTheme.textMuted, fontSize: fontSize['6xl'], margin: `0 0 ${spacing.lg} 0` }}>
                Rate models first
              </p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: spacing.md }}>
                <p style={{ color: currentTheme.textSecondary, fontSize: fontSize.base, margin: 0 }}>Average Score:</p>
                <div style={{ display: 'flex', alignItems: 'center', gap: spacing.md }}>
                  <p style={{ color: currentTheme.textMuted, fontSize: fontSize['3xl'], margin: 0 }}>
                    —
                  </p>
                  <Star size={20} fill="#FFD700" color="#FFD700" />
                  <p style={{ color: currentTheme.textSecondary, fontSize: fontSize['3xl'], margin: 0 }}>
                    / 5
                  </p>
                </div>
              </div>
            </>
          )}
        </div>
      </div>

      {/* Models Section - Merged from Models tab */}
      {Object.keys(userStats.providers || {}).length > 0 && (
        <div
          style={{
            background: currentTheme.backgroundOverlay,
            border: `1px solid ${currentTheme.borderLight}`,
            borderRadius: radius['2xl'],
            padding: spacing['4xl'],
          }}
        >
          <h2 key={`model-usage-title-${theme}`} style={{ color: currentTheme.accent, fontSize: fontSize['6xl'], marginBottom: spacing['3xl'], display: 'flex', alignItems: 'center', gap: spacing.lg }}>
            <Cpu size={24} />
            Model Usage
          </h2>
          <div key={`providers-list-${theme}`} style={{ display: 'flex', flexDirection: 'column', gap: spacing.md }}>
            {Object.entries(userStats.providers as Record<string, any>)
              .sort((a, b) => b[1].totalTokens - a[1].totalTokens)
              .map(([provider, data]) => {
                const isProviderExpanded = expandedProviders[provider]
                const providerModels = Object.entries((userStats.models || {}) as Record<string, any>)
                  .filter(([modelKey]) => modelKey.startsWith(`${provider}-`))
                  .sort((a, b) => b[1].totalTokens - a[1].totalTokens)

                return (
                  <div
                    key={`${provider}-${theme}`}
                    style={{
                      background: currentTheme.backgroundSecondary,
                      border: `1px solid ${currentTheme.borderLight}`,
                      borderRadius: radius.xl,
                      overflow: 'hidden',
                    }}
                  >
                    {/* Provider Header - Clickable */}
                    <div
                      key={`provider-header-${provider}-${theme}`}
                      onClick={() => {
                        setExpandedProviders((prev) => ({
                          ...prev,
                          [provider]: !prev[provider],
                        }))
                      }}
                      style={{
                        padding: `${spacing.xl} ${spacing['2xl']}`,
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        transition: 'background 0.2s',
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.background = currentTheme.buttonBackgroundHover
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.background = currentTheme.backgroundSecondary
                      }}
                    >
                      <div key={`provider-info-${provider}-${theme}`} style={{ display: 'flex', alignItems: 'center', gap: spacing.lg, flex: 1 }}>
                        {isProviderExpanded ? (
                          <ChevronDown size={20} color={currentTheme.accent} />
                        ) : (
                          <ChevronRight size={20} color={currentTheme.accent} />
                        )}
                        <h3 key={`provider-name-${provider}-${theme}`} style={{ fontSize: fontSize['3xl'], color: currentTheme.accent, margin: 0, textTransform: 'capitalize' }}>
                          {provider}
                        </h3>
                        <span key={`provider-models-count-${provider}-${theme}`} style={{ color: currentTheme.textMuted, fontSize: fontSize.base, marginLeft: spacing.md }}>
                          ({providerModels.length} {providerModels.length === 1 ? 'model' : 'models'})
                        </span>
                      </div>
                      <div key={`provider-stats-${provider}-${theme}`} style={{ display: 'flex', gap: spacing['3xl'], alignItems: 'center' }}>
                        <div style={{ textAlign: 'right' }}>
                          <p key={`provider-prompts-label-${provider}-${theme}`} style={{ color: currentTheme.textSecondary, fontSize: '0.75rem', margin: 0 }}>Prompts</p>
                          <p key={`provider-prompts-value-${provider}-${theme}`} style={{ color: currentTheme.accentSecondary, fontSize: fontSize['2xl'], fontWeight: fontWeight.bold, margin: 0 }}>
                            {formatNumber(data.totalPrompts || 0)}
                          </p>
                        </div>
                        <div style={{ textAlign: 'right' }}>
                          <p key={`provider-tokens-label-${provider}-${theme}`} style={{ color: currentTheme.textSecondary, fontSize: '0.75rem', margin: 0 }}>Tokens</p>
                          <p key={`provider-tokens-value-${provider}-${theme}`} style={{ color: currentTheme.accent, fontSize: fontSize['2xl'], fontWeight: fontWeight.bold, margin: 0 }}>
                            {formatTokens((data.totalInputTokens || 0) + (data.totalOutputTokens || 0))}
                          </p>
                        </div>
                      </div>
                    </div>

                    {/* Models List - Collapsible */}
                    <AnimatePresence>
                      {isProviderExpanded && providerModels.length > 0 && (
                        <motion.div
                          key={`provider-models-expanded-${provider}-${theme}`}
                          initial={{ height: 0, opacity: 0 }}
                          animate={{ height: 'auto', opacity: 1 }}
                          exit={{ height: 0, opacity: 0 }}
                          transition={{ duration: 0.2 }}
                          style={{ overflow: 'hidden' }}
                        >
                          <div key={`provider-models-content-${provider}-${theme}`} style={{ padding: '12px 20px 20px 20px', borderTop: `1px solid ${currentTheme.borderLight}` }}>
                            <div key={`provider-models-list-${provider}-${theme}`} style={{ display: 'flex', flexDirection: 'column', gap: spacing.md }}>
                              {providerModels.map(([modelKey, modelData]) => {
                                const isModelExpanded = expandedModels[modelKey]
                                return (
                                  <div
                                    key={`${modelKey}-${theme}`}
                                    style={{
                                      background: currentTheme.buttonBackground,
                                      border: `1px solid ${currentTheme.borderLight}`,
                                      borderRadius: radius.md,
                                      overflow: 'hidden',
                                    }}
                                  >
                                    {/* Model Header - Clickable */}
                                    <div
                                      key={`model-header-${modelKey}-${theme}`}
                                      onClick={(e) => {
                                        e.stopPropagation()
                                        setExpandedModels((prev) => ({
                                          ...prev,
                                          [modelKey]: !prev[modelKey],
                                        }))
                                      }}
                                      style={{
                                        padding: `${spacing.lg} ${spacing.xl}`,
                                        cursor: 'pointer',
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'space-between',
                                        transition: 'background 0.2s',
                                      }}
                                      onMouseEnter={(e) => {
                                        e.currentTarget.style.background = currentTheme.buttonBackgroundHover
                                      }}
                                      onMouseLeave={(e) => {
                                        e.currentTarget.style.background = currentTheme.backgroundSecondary
                                      }}
                                    >
                                      <div key={`model-info-${modelKey}-${theme}`} style={{ display: 'flex', alignItems: 'center', gap: spacing.md, flex: 1 }}>
                                        {isModelExpanded ? (
                                          <ChevronDown size={16} color={currentTheme.textSecondary} />
                                        ) : (
                                          <ChevronRight size={16} color={currentTheme.textSecondary} />
                                        )}
                                        <span key={`model-name-${modelKey}-${theme}`} style={{ color: currentTheme.textSecondary, fontSize: fontSize.lg, fontWeight: fontWeight.medium }}>
                                          {modelData.model}
                                        </span>
                                      </div>
                                    </div>

                                    {/* Model Stats - Collapsible */}
                                    <AnimatePresence>
                                      {isModelExpanded && (
                                        <motion.div
                                          key={`model-stats-expanded-${modelKey}-${theme}`}
                                          initial={{ height: 0, opacity: 0 }}
                                          animate={{ height: 'auto', opacity: 1 }}
                                          exit={{ height: 0, opacity: 0 }}
                                          transition={{ duration: 0.2 }}
                                          style={{ overflow: 'hidden' }}
                                        >
                                          <div
                                            key={`model-stats-content-${modelKey}-${theme}`}
                                            style={{
                                              padding: '12px 16px 16px 40px',
                                              background: currentTheme.backgroundSecondary,
                                              borderTop: `1px solid ${currentTheme.borderLight}`,
                                            }}
                                          >
                                            <div key={`model-stats-list-${modelKey}-${theme}`} style={{ display: 'flex', flexDirection: 'column', gap: spacing.md }}>
                                              <div key={`model-prompts-row-${modelKey}-${theme}`} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                                <span key={`model-prompts-label-${modelKey}-${theme}`} style={{ color: currentTheme.textSecondary, fontSize: fontSize.base }}>Total Prompts:</span>
                                                <span key={`model-prompts-value-${modelKey}-${theme}`} style={{ color: currentTheme.accentSecondary, fontSize: fontSize.lg, fontWeight: fontWeight.bold }}>
                                                  {formatNumber(modelData.totalPrompts || 0)}
                                                </span>
                                              </div>
                                              <div key={`model-tokens-row-${modelKey}-${theme}`} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                                <span key={`model-tokens-label-${modelKey}-${theme}`} style={{ color: currentTheme.textSecondary, fontSize: fontSize.base }}>Total Tokens:</span>
                                                <span key={`model-tokens-value-${modelKey}-${theme}`} style={{ color: currentTheme.accent, fontSize: fontSize.lg, fontWeight: fontWeight.bold }}>
                                                  {formatTokens((modelData.totalInputTokens || 0) + (modelData.totalOutputTokens || 0))}
                                                </span>
                                              </div>
                                              <div key={`model-pricing-row-${modelKey}-${theme}`} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                                <span key={`model-pricing-label-${modelKey}-${theme}`} style={{ color: currentTheme.textSecondary, fontSize: fontSize.base }}>Pricing:</span>
                                                <span
                                                  key={`model-pricing-value-${modelKey}-${theme}`}
                                                  style={{
                                                    color: modelData.pricing ? '#FFD700' : currentTheme.textMuted,
                                                    fontSize: fontSize.lg,
                                                    fontWeight: modelData.pricing ? 'bold' : 'normal',
                                                  }}
                                                >
                                                  {modelData.pricing !== null && modelData.pricing !== undefined
                                                    ? `$${modelData.pricing}`
                                                    : 'TBD'}
                                                </span>
                                              </div>
                                            </div>
                                          </div>
                                        </motion.div>
                                      )}
                                    </AnimatePresence>
                                  </div>
                                )
                              })}
                            </div>
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                )
              })}
          </div>
        </div>
      )}

      {Object.keys(userStats.providers || {}).length === 0 && (
        <div
          style={{
            background: currentTheme.backgroundOverlay,
            border: `1px solid ${currentTheme.borderLight}`,
            borderRadius: radius['2xl'],
            padding: spacing['5xl'],
            textAlign: 'center',
          }}
        >
          <p style={{ color: currentTheme.textSecondary, fontSize: fontSize['3xl'] }}>
            No model statistics yet. Start using ArkiTek to see your usage data!
          </p>
        </div>
      )}
    </motion.div>
  )
}

export default RatingsTab
