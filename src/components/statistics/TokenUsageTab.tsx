import React from 'react'
import { motion } from 'framer-motion'
import { TrendingUp, Database, MessageSquare, ShoppingCart } from 'lucide-react'
import { spacing, fontSize, fontWeight, radius, zIndex, transition } from '../../utils/styles'
import { sx, createStyles } from '../../utils/styles'

interface TokenUsageTabProps {
  userStats: any
  userPlan: string
  theme: string
  currentTheme: any
  s: any
  hoveredDay: string | null
  setHoveredDay: (day: string | null) => void
  showBuyUsageModal: boolean
  setShowBuyUsageModal: (show: boolean) => void
  formatNumber: (num: number) => string
  formatTokens: (num: number) => string
}

const TokenUsageTab = ({
  userStats,
  userPlan,
  theme,
  currentTheme,
  s,
  hoveredDay,
  setHoveredDay,
  showBuyUsageModal,
  setShowBuyUsageModal,
  formatNumber,
  formatTokens,
}: TokenUsageTabProps) => {
  return (
    <motion.div
      key="tokens"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.15 }}
    >
      {/* Remaining Free Allocation with Counters */}
      <div style={{ display: 'flex', justifyContent: 'center', marginBottom: spacing['5xl'] }}>
        <div
          style={{
            background: currentTheme.backgroundOverlay,
            border: `1px solid ${currentTheme.borderLight}`,
            borderRadius: radius['2xl'],
            padding: spacing['4xl'],
            display: 'flex',
            flexDirection: 'column',
            width: '100%',
            maxWidth: '1200px',
          }}
        >
          {/* Header with Percentage */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: spacing['3xl'] }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: spacing.xl }}>
              <TrendingUp size={32} color={currentTheme.accentSecondary} />
              <div>
                <h2 style={{ fontSize: fontSize['4xl'], color: currentTheme.text, margin: `0 0 ${spacing.xs} 0` }}>
                  Monthly Usage
                </h2>
                <p style={{ fontSize: fontSize.base, color: (userStats.usagePercentUsed || 0) > 0 ? '#f0a050' : currentTheme.textMuted, margin: `0 0 ${spacing.xs} 0`, fontStyle: 'italic' }}>
                  {(userStats.usagePercentUsed || 0).toFixed(1)}% of allocation used
                </p>
                {(userStats.usagePercentUsed || 0) > 100 && (
                  <p style={{ fontSize: fontSize.base, color: currentTheme.error, margin: `0 0 ${spacing.xs} 0`, fontStyle: 'italic' }}>
                    Over allocation
                  </p>
                )}
                {(userStats.purchasedCreditsPercent || 0) > 0 && (
                  <p style={{ fontSize: fontSize.base, color: '#00cc66', margin: 0, fontStyle: 'italic' }}>
                    Includes {(userStats.purchasedCreditsPercent || 0).toFixed(1)}% from purchased credits
                  </p>
                )}
              </div>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: spacing.md }}>
              <p
                key={`usage-balance-${theme}`}
                style={{
                  fontSize: '3rem',
                  fontWeight: fontWeight.bold,
                  background: currentTheme.accentGradient,
                  WebkitBackgroundClip: 'text',
                  WebkitTextFillColor: 'transparent',
                  margin: 0,
                  whiteSpace: 'nowrap',
                  display: 'flex',
                  alignItems: 'baseline',
                  gap: spacing.md,
                }}
              >
                {Math.max(0, userStats.usagePercentRemaining ?? 100).toFixed(1)}%
                <span style={{ fontSize: fontSize['4xl'], fontWeight: fontWeight.medium }}>remaining</span>
              </p>
              
              {userPlan !== 'free_trial' && (
                <button
                  onClick={() => setShowBuyUsageModal(true)}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: spacing.md,
                    padding: `10px ${spacing.xl}`,
                    borderRadius: radius.md,
                    border: `1px solid ${currentTheme.accent}`,
                    background: currentTheme.buttonBackground,
                    color: currentTheme.accent,
                    fontSize: fontSize.base,
                    fontWeight: fontWeight.medium,
                    cursor: 'pointer',
                    transition: transition.normal,
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.background = currentTheme.buttonBackgroundHover
                    e.currentTarget.style.borderColor = currentTheme.accentSecondary
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.background = currentTheme.buttonBackground
                    e.currentTarget.style.borderColor = currentTheme.accent
                  }}
                >
                  <ShoppingCart size={16} />
                  Buy More Usage
                </button>
              )}
              {userPlan === 'free_trial' && (userStats.totalAvailableBalance ?? userStats.remainingFreeAllocation ?? 0) <= 0 && (
                <div style={{
                  padding: `10px ${spacing.xl}`,
                  borderRadius: radius.md,
                  background: 'rgba(255, 170, 0, 0.1)',
                  border: '1px solid rgba(255, 170, 0, 0.3)',
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  gap: spacing.sm,
                }}>
                  <span style={{ color: currentTheme.warning, fontSize: fontSize.md, fontWeight: fontWeight.semibold, textAlign: 'center' }}>
                    Usage limit reached — upgrade to Pro or Premium
                  </span>
                </div>
              )}
              
              {/* Extra Purchased Credits Balance */}
              {(userStats.purchasedCreditsPercent || 0) > 0 && (
                <div
                  style={{
                    background: 'rgba(0, 200, 100, 0.15)',
                    border: '1px solid rgba(0, 200, 100, 0.3)',
                    borderRadius: radius.md,
                    padding: `${spacing.md} ${spacing.lg}`,
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'flex-end',
                  }}
                >
                  <p style={{ fontSize: fontSize.xs, color: currentTheme.textSecondary, margin: `0 0 ${spacing['2xs']} 0` }}>
                    Extra Purchased Credits
                  </p>
                  <p
                    key={`purchased-credits-${theme}`}
                    style={{
                      fontSize: fontSize['4xl'],
                      fontWeight: fontWeight.bold,
                      background: 'linear-gradient(90deg, #00cc66, #00aa88)',
                      WebkitBackgroundClip: 'text',
                      WebkitTextFillColor: 'transparent',
                      margin: 0,
                    }}
                  >
                    {(userStats.purchasedCreditsPercent || 0).toFixed(1)}%
                  </p>
                </div>
              )}
              
            </div>
          </div>

          {/* Main Content: Counters and Bar Graph */}
          <div style={{ display: 'flex', gap: spacing['3xl'], alignItems: 'flex-start' }}>
            {/* Left Side: Token Counters */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: spacing.xl, minWidth: '200px' }}>
              {/* Total Tokens */}
              <div
                style={{
                  background: currentTheme.backgroundOverlay,
                  border: `1px solid ${currentTheme.borderLight}`,
                  borderRadius: radius.xl,
                  padding: spacing['2xl'],
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: spacing.md, marginBottom: spacing.md }}>
                  <Database size={20} color={currentTheme.accent} />
                  <h3 style={{ fontSize: fontSize.lg, color: currentTheme.textSecondary, margin: 0 }}>Total Tokens</h3>
                </div>
                <p
                  key={`total-tokens-${theme}`}
                  style={sx(s.gradientText, { fontSize: fontSize['6xl'], fontWeight: fontWeight.bold, margin: 0 })}
                >
                  {formatTokens(userStats.totalTokens)}
                </p>
              </div>

              {/* Tokens This Month */}
              <div
                style={{
                  background: currentTheme.backgroundOverlay,
                  border: '1px solid rgba(72, 201, 176, 0.3)',
                  borderRadius: radius.xl,
                  padding: spacing['2xl'],
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: spacing.md, marginBottom: spacing.md }}>
                  <Database size={20} color={currentTheme.accentSecondary} />
                  <h3 style={{ fontSize: fontSize.lg, color: currentTheme.textSecondary, margin: 0 }}>Tokens This Month</h3>
                </div>
                <p
                  key={`tokens-this-month-${theme}`}
                  style={sx(s.gradientText, { fontSize: fontSize['6xl'], fontWeight: fontWeight.bold, margin: 0 })}
                >
                  {formatTokens(userStats.monthlyTokens)}
                </p>
              </div>
            </div>

            {/* Center: Daily Usage Bar Graph */}
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
              <p style={{ fontSize: fontSize.lg, color: currentTheme.textSecondary, marginBottom: spacing.xs, textAlign: 'center' }}>
                Daily Usage Percentage (This Month)
              </p>
              <p style={{ fontSize: fontSize.xs, color: currentTheme.textMuted, marginBottom: '10px', textAlign: 'center', minHeight: '1em', visibility: (userStats.usagePercentUsed || 0) > 0 ? 'visible' : 'hidden' }}>
                {(userStats.usagePercentUsed || 0).toFixed(1)}% used this month
                {(userStats.purchasedCreditsPercent || 0) > 0 && (
                  <span style={{ color: '#00cc66' }}> (includes purchased credits)</span>
                )}
              </p>
              <div style={{ display: 'flex', gap: spacing.md, height: '220px' }}>
                {/* Y-axis labels (percentage scale) */}
                <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'space-between', paddingRight: '8px', minWidth: '40px' }}>
                  {[100, 75, 50, 25, 0].map((value) => (
                    <span
                      key={value}
                      style={{
                        fontSize: fontSize.xs,
                        color: currentTheme.textMuted,
                        textAlign: 'right',
                      }}
                    >
                      {value}%
                    </span>
                  ))}
                </div>

                {/* Bar Graph Container */}
                <div
                  style={{
                    flex: 1,
                    display: 'flex',
                    flexDirection: 'column',
                    position: 'relative',
                  }}
                >
                  {/* Bars Area */}
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'flex-end',
                      justifyContent: 'space-between',
                      gap: spacing.xs,
                      height: '180px',
                      padding: spacing.lg,
                      background: currentTheme.backgroundSecondary,
                      borderRadius: radius.md,
                      position: 'relative',
                    }}
                  >
                    {(userStats.dailyUsage || []).map((day: any, index: number) => {
                      const percentage = day.percentage || 0
                      const barHeight = Math.max(2, (percentage / 100) * 156)
                      const nowLocal = new Date()
                      const localToday = `${nowLocal.getFullYear()}-${String(nowLocal.getMonth() + 1).padStart(2, '0')}-${String(nowLocal.getDate()).padStart(2, '0')}`
                      const isToday = localToday === day.date
                      const isHovered = hoveredDay === day.date
                      
                      return (
                        <div
                          key={day.date || index}
                          style={{
                            flex: 1,
                            display: 'flex',
                            flexDirection: 'column',
                            alignItems: 'center',
                            justifyContent: 'flex-end',
                            gap: spacing['2xs'],
                            minWidth: '0',
                            position: 'relative',
                          }}
                          onMouseEnter={() => setHoveredDay(day.date)}
                          onMouseLeave={() => setHoveredDay(null)}
                        >
                          {/* Hover Tooltip */}
                          {isHovered && (
                            <div
                              style={{
                                position: 'absolute',
                                bottom: `${barHeight + 8}px`,
                                left: '50%',
                                transform: 'translateX(-50%)',
                                background: currentTheme.backgroundOverlay,
                                border: `1px solid ${currentTheme.borderActive}`,
                                borderRadius: radius.sm,
                                padding: '6px 10px',
                                fontSize: '0.75rem',
                                color: currentTheme.accent,
                                fontWeight: fontWeight.bold,
                                whiteSpace: 'nowrap',
                                zIndex: 20,
                                pointerEvents: 'none',
                                boxShadow: `0 4px 12px ${currentTheme.shadow}`,
                                textAlign: 'center',
                              }}
                            >
                              <div>{percentage.toFixed(1)}% used</div>
                            </div>
                          )}
                          
                          {/* Percentage label at top of bar */}
                          {percentage > 0 && !isHovered && (
                            <div
                              style={{
                                position: 'absolute',
                                bottom: `${barHeight + 4}px`,
                                left: '50%',
                                transform: 'translateX(-50%)',
                                fontSize: fontSize['2xs'],
                                color: isToday ? currentTheme.accentSecondary : currentTheme.accent,
                                fontWeight: fontWeight.bold,
                                whiteSpace: 'nowrap',
                                zIndex: zIndex.base,
                              }}
                            >
                              {percentage.toFixed(1)}%
                            </div>
                          )}
                          
                          {/* Bar */}
                          <div
                            style={{
                              width: '100%',
                              height: `${barHeight}px`,
                              background: percentage > 0
                                ? isToday
                                  ? currentTheme.accentGradient
                                  : currentTheme.accentGradient
                                : currentTheme.backgroundOverlayLighter,
                              borderRadius: '2px 2px 0 0',
                              transition: transition.slow,
                              cursor: 'pointer',
                              position: 'relative',
                            }}
                            onMouseEnter={(e) => {
                              if (percentage > 0) {
                                e.currentTarget.style.opacity = '0.8'
                                e.currentTarget.style.transform = 'scaleY(1.1)'
                              }
                            }}
                            onMouseLeave={(e) => {
                              e.currentTarget.style.opacity = '1'
                              e.currentTarget.style.transform = 'scaleY(1)'
                            }}
                          />
                        </div>
                      )
                    })}
                  </div>

                  {/* X-axis labels (days) */}
                  <div
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      gap: spacing.xs,
                      padding: '8px 12px 0 12px',
                      marginTop: spacing.xs,
                    }}
                  >
                    {(userStats.dailyUsage || []).map((day: any, index: number) => {
                      const nowLocal = new Date()
                      const localToday = `${nowLocal.getFullYear()}-${String(nowLocal.getMonth() + 1).padStart(2, '0')}-${String(nowLocal.getDate()).padStart(2, '0')}`
                      const isToday = localToday === day.date
                      return (
                        <span
                          key={day.date || index}
                          style={{
                            flex: 1,
                            fontSize: fontSize['2xs'],
                            color: isToday ? currentTheme.accentSecondary : currentTheme.textMuted,
                            fontWeight: isToday ? 'bold' : 'normal',
                            textAlign: 'center',
                            minWidth: '0',
                          }}
                        >
                          {day.day}
                        </span>
                      )
                    })}
                  </div>
                </div>
              </div>
            </div>

            {/* Right Side: Prompt Counters */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: spacing.xl, minWidth: '200px' }}>
              {/* Total Prompts */}
              <div
                style={{
                  background: currentTheme.backgroundOverlay,
                  border: `1px solid ${currentTheme.borderLight}`,
                  borderRadius: radius.xl,
                  padding: spacing['2xl'],
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: spacing.md, marginBottom: spacing.md }}>
                  <MessageSquare size={20} color={currentTheme.accent} />
                  <h3 style={{ fontSize: fontSize.lg, color: currentTheme.textSecondary, margin: 0 }}>Total Prompts</h3>
                </div>
                <p
                  key={`total-prompts-${theme}`}
                  style={sx(s.gradientText, { fontSize: '2rem', fontWeight: fontWeight.bold, margin: 0 })}
                >
                  {formatNumber(userStats.totalPrompts || 0)}
                </p>
              </div>

              {/* Prompts This Month */}
              <div
                style={{
                  background: currentTheme.backgroundOverlay,
                  border: '1px solid rgba(72, 201, 176, 0.3)',
                  borderRadius: radius.xl,
                  padding: spacing['2xl'],
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: spacing.md, marginBottom: spacing.md }}>
                  <MessageSquare size={20} color={currentTheme.accentSecondary} />
                  <h3 style={{ fontSize: fontSize.lg, color: currentTheme.textSecondary, margin: 0 }}>Prompts This Month</h3>
                </div>
                <p
                  key={`prompts-this-month-${theme}`}
                  style={sx(s.gradientText, { fontSize: '2rem', fontWeight: fontWeight.bold, margin: 0 })}
                >
                  {formatNumber(userStats.monthlyPrompts || 0)}
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>

    </motion.div>
  )
}

export default TokenUsageTab
