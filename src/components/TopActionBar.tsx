import type React from 'react'
import { motion } from 'framer-motion'
import { Coins, DollarSign, Sparkles, Share2, Check } from 'lucide-react'
import { spacing, fontSize, fontWeight, radius, zIndex, transition, layout, sx, createStyles } from '../utils/styles'

interface Props {
  canGenerateSummary: boolean
  canToggleResultViews: boolean
  canShowCouncilSideBySideButton: boolean
  theme: string
  currentTheme: any
  resultViewMode: string
  setResultViewMode: (mode: string) => void
  setShowSingleTokenUsage: (v: boolean) => void
  setShowTopCostBreakdown: (v: boolean) => void
  triggerGenerateSummary: () => void
  isCancelledPrompt?: boolean
  onShare?: () => void
  sharingPrompt?: boolean
  shareSuccess?: boolean
  canShare?: boolean
}

const TopActionBar = ({
  canGenerateSummary,
  canToggleResultViews,
  canShowCouncilSideBySideButton,
  theme,
  currentTheme,
  resultViewMode,
  setResultViewMode,
  setShowSingleTokenUsage,
  setShowTopCostBreakdown,
  triggerGenerateSummary,
  isCancelledPrompt = false,
  onShare,
  sharingPrompt = false,
  shareSuccess = false,
  canShare = false,
}: Props) => {
  const s = createStyles(currentTheme)

  const barContainer: React.CSSProperties = {
    position: 'absolute',
    top: spacing.xl,
    left: 0,
    right: 0,
    zIndex: zIndex.dropdown,
    pointerEvents: 'none',
  }

  const pillBar = sx(layout.flexRow, {
    gap: spacing.sm,
    padding: `${spacing.md} ${spacing.lg}`,
    borderRadius: radius['2xl'],
    border: theme === 'light' ? '1px solid rgba(0, 0, 0, 0.1)' : '1px solid rgba(255, 255, 255, 0.12)',
    background: theme === 'light' ? '#ffffff' : '#111827',
    boxShadow: theme === 'light'
      ? '0 4px 20px rgba(0, 0, 0, 0.12), 0 1px 4px rgba(0, 0, 0, 0.06)'
      : '0 4px 24px rgba(0, 0, 0, 0.6), 0 1px 3px rgba(0, 0, 0, 0.4)',
    pointerEvents: 'auto' as const,
  })

  const pillButton = sx(layout.flexRow, {
    gap: spacing.sm,
    padding: `${spacing.md} ${spacing.lg}`,
    borderRadius: radius.lg,
    border: 'none',
    background: theme === 'light' ? '#f3f4f6' : '#1f2937',
    color: currentTheme.accent,
    fontSize: fontSize.sm,
    fontWeight: fontWeight.semibold,
    cursor: 'pointer',
  })

  const divider: React.CSSProperties = {
    width: '1px',
    height: spacing['3xl'],
    background: theme === 'light' ? 'rgba(0, 0, 0, 0.1)' : 'rgba(255, 255, 255, 0.1)',
    margin: `0 ${spacing['2xs']}`,
  }

  const viewToggleButton: React.CSSProperties = {
    padding: `${spacing.sm} ${spacing.xl}`,
    borderRadius: radius.md,
    border: 'none',
    background: theme === 'light' ? '#f3f4f6' : '#1f2937',
    color: currentTheme.textSecondary,
    fontSize: fontSize.sm,
    fontWeight: fontWeight.semibold,
    cursor: 'pointer',
    transition: transition.normal,
  }

  return (
    <>
      {canGenerateSummary && (
        <motion.div
          initial={{ opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
          style={sx(layout.center, barContainer, {
            flexDirection: 'column',
            gap: spacing.sm,
          })}
        >
          <div style={pillBar}>
            <motion.button
              onClick={() => setShowSingleTokenUsage(true)}
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              style={pillButton}
              title="Open prompt token usage"
            >
              <Coins size={13} />
              Prompt Token Usage
            </motion.button>

            <div style={divider} />

            <motion.button
              onClick={() => triggerGenerateSummary()}
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              style={sx(layout.flexRow, {
                gap: spacing.sm,
                padding: `${spacing.md} ${spacing.xl}`,
                borderRadius: radius.lg,
                border: 'none',
                background: currentTheme.accentGradient,
                color: '#ffffff',
                fontSize: fontSize.sm,
                fontWeight: fontWeight.bold,
                cursor: 'pointer',
                letterSpacing: '0.3px',
              })}
              title="Generate summary from the current council responses (Enter)"
            >
              <Sparkles size={14} />
              Generate Summary
            </motion.button>

            {canShare && (
              <>
                <div style={divider} />
                <motion.button
                  onClick={onShare}
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                  style={{
                    ...pillButton,
                    opacity: sharingPrompt ? 0.6 : 1,
                    cursor: sharingPrompt ? 'wait' : 'pointer',
                    color: shareSuccess ? '#00cc66' : currentTheme.accent,
                  }}
                  title="Share this prompt and responses"
                >
                  {shareSuccess ? <Check size={13} /> : <Share2 size={13} />}
                  {sharingPrompt ? 'Sharing...' : shareSuccess ? 'Link Copied!' : 'Share'}
                </motion.button>
              </>
            )}

            <div style={divider} />

            <motion.button
              onClick={() => setShowTopCostBreakdown(true)}
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              style={pillButton}
              title="Open prompt cost breakdown"
            >
              <DollarSign size={13} />
              Prompt Cost Breakdown
            </motion.button>
          </div>
          <span
            style={{
              fontSize: fontSize['2xs'],
              color: theme === 'light' ? currentTheme.textMuted : 'rgba(255, 255, 255, 0.4)',
              textAlign: 'center',
              pointerEvents: 'auto',
            }}
          >
            PRESS ENTER TO GENERATE
          </span>
        </motion.div>
      )}
      {(canToggleResultViews || canShowCouncilSideBySideButton) && (
        <motion.div
          initial={{ opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
          style={sx(layout.center, barContainer)}
        >
          <div style={pillBar}>
            <motion.button
              onClick={() => setShowSingleTokenUsage(true)}
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              style={pillButton}
              title="Open prompt token usage"
            >
              <Coins size={13} />
              Prompt Token Usage
            </motion.button>
            <motion.button
              onClick={() => setShowTopCostBreakdown(true)}
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              style={pillButton}
              title="Open prompt cost breakdown"
            >
              <DollarSign size={13} />
              Prompt Cost Breakdown
            </motion.button>

            <div style={divider} />

            {resultViewMode === 'summary' ? (
              <motion.button
                onClick={() => setResultViewMode('council')}
                whileHover={{ scale: 1.03 }}
                whileTap={{ scale: 0.95 }}
                style={viewToggleButton}
                title="Show side-by-side model responses"
              >
                Council Side by Side View
              </motion.button>
            ) : (
              <motion.button
                onClick={() => setResultViewMode('summary')}
                whileHover={{ scale: 1.03 }}
                whileTap={{ scale: 0.95 }}
                style={viewToggleButton}
                title="Show summary response"
              >
                Summary View
              </motion.button>
            )}

            {canShare && (
              <>
                <div style={divider} />
                <motion.button
                  onClick={onShare}
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                  style={{
                    ...pillButton,
                    opacity: sharingPrompt ? 0.6 : 1,
                    cursor: sharingPrompt ? 'wait' : 'pointer',
                    color: shareSuccess ? '#00cc66' : currentTheme.accent,
                  }}
                  title="Share this prompt and responses"
                >
                  {shareSuccess ? <Check size={13} /> : <Share2 size={13} />}
                  {sharingPrompt ? 'Sharing...' : shareSuccess ? 'Link Copied!' : 'Share'}
                </motion.button>
              </>
            )}

          </div>
        </motion.div>
      )}
      {isCancelledPrompt && !canGenerateSummary && !canToggleResultViews && !canShowCouncilSideBySideButton && (
        <motion.div
          initial={{ opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
          style={sx(layout.center, barContainer)}
        >
          <div style={pillBar}>
            <motion.button
              onClick={() => setShowSingleTokenUsage(true)}
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              style={pillButton}
              title="Open prompt token usage"
            >
              <Coins size={13} />
              Prompt Token Usage
            </motion.button>

            <div style={divider} />

            <motion.button
              onClick={() => setShowTopCostBreakdown(true)}
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              style={pillButton}
              title="Open prompt cost breakdown"
            >
              <DollarSign size={13} />
              Prompt Cost Breakdown
            </motion.button>

            {canShare && (
              <>
                <div style={divider} />
                <motion.button
                  onClick={onShare}
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                  style={{
                    ...pillButton,
                    opacity: sharingPrompt ? 0.6 : 1,
                    cursor: sharingPrompt ? 'wait' : 'pointer',
                    color: shareSuccess ? '#00cc66' : currentTheme.accent,
                  }}
                  title="Share this prompt and responses"
                >
                  {shareSuccess ? <Check size={13} /> : <Share2 size={13} />}
                  {sharingPrompt ? 'Sharing...' : shareSuccess ? 'Link Copied!' : 'Share'}
                </motion.button>
              </>
            )}
          </div>
        </motion.div>
      )}
    </>
  )
}

export default TopActionBar
