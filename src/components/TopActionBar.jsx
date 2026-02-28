import React from 'react'
import { motion } from 'framer-motion'
import { Coins, DollarSign, Sparkles } from 'lucide-react'

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
}) => {
  return (
    <>
      {canGenerateSummary && (
        <motion.div
          initial={{ opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
          style={{
            position: 'absolute',
            top: '16px',
            left: 0,
            right: 0,
            zIndex: 30,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexDirection: 'column',
            gap: '6px',
            pointerEvents: 'none',
          }}
        >
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              padding: '8px 12px',
              borderRadius: '16px',
              border: theme === 'light' ? '1px solid rgba(0, 0, 0, 0.1)' : '1px solid rgba(255, 255, 255, 0.12)',
              background: theme === 'light' ? '#ffffff' : '#111827',
              boxShadow: theme === 'light'
                ? '0 4px 20px rgba(0, 0, 0, 0.12), 0 1px 4px rgba(0, 0, 0, 0.06)'
                : '0 4px 24px rgba(0, 0, 0, 0.6), 0 1px 3px rgba(0, 0, 0, 0.4)',
              pointerEvents: 'auto',
            }}
          >
            <motion.button
              onClick={() => setShowSingleTokenUsage(true)}
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '5px',
                padding: '8px 12px',
                borderRadius: '10px',
                border: 'none',
                background: theme === 'light' ? '#f3f4f6' : '#1f2937',
                color: currentTheme.accent,
                fontSize: '0.76rem',
                fontWeight: '600',
                cursor: 'pointer',
              }}
              title="Open prompt token usage"
            >
              <Coins size={13} />
              Prompt Token Usage
            </motion.button>

            <div style={{
              width: '1px',
              height: '24px',
              background: theme === 'light' ? 'rgba(0, 0, 0, 0.1)' : 'rgba(255, 255, 255, 0.1)',
              margin: '0 2px',
            }} />

            <motion.button
              onClick={() => triggerGenerateSummary()}
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                padding: '8px 16px',
                borderRadius: '10px',
                border: 'none',
                background: currentTheme.accentGradient,
                color: '#ffffff',
                fontSize: '0.76rem',
                fontWeight: '700',
                cursor: 'pointer',
                letterSpacing: '0.3px',
              }}
              title="Generate summary from the current council responses (Enter)"
            >
              <Sparkles size={14} />
              Generate Summary
            </motion.button>

            <div style={{
              width: '1px',
              height: '24px',
              background: theme === 'light' ? 'rgba(0, 0, 0, 0.1)' : 'rgba(255, 255, 255, 0.1)',
              margin: '0 2px',
            }} />

            <motion.button
              onClick={() => setShowTopCostBreakdown(true)}
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '5px',
                padding: '8px 12px',
                borderRadius: '10px',
                border: 'none',
                background: theme === 'light' ? '#f3f4f6' : '#1f2937',
                color: currentTheme.accent,
                fontSize: '0.76rem',
                fontWeight: '600',
                cursor: 'pointer',
              }}
              title="Open prompt cost breakdown"
            >
              <DollarSign size={13} />
              Prompt Cost Breakdown
            </motion.button>
          </div>
          <span
            style={{
              fontSize: '0.68rem',
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
          style={{
            position: 'absolute',
            top: '16px',
            left: 0,
            right: 0,
            zIndex: 30,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            pointerEvents: 'none',
          }}
        >
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              padding: '8px 12px',
              borderRadius: '16px',
              border: theme === 'light' ? '1px solid rgba(0, 0, 0, 0.1)' : '1px solid rgba(255, 255, 255, 0.12)',
              background: theme === 'light' ? '#ffffff' : '#111827',
              boxShadow: theme === 'light'
                ? '0 4px 20px rgba(0, 0, 0, 0.12), 0 1px 4px rgba(0, 0, 0, 0.06)'
                : '0 4px 24px rgba(0, 0, 0, 0.6), 0 1px 3px rgba(0, 0, 0, 0.4)',
              pointerEvents: 'auto',
            }}
          >
            <motion.button
              onClick={() => setShowSingleTokenUsage(true)}
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '5px',
                padding: '8px 12px',
                borderRadius: '10px',
                border: 'none',
                background: theme === 'light' ? '#f3f4f6' : '#1f2937',
                color: currentTheme.accent,
                fontSize: '0.76rem',
                fontWeight: '600',
                cursor: 'pointer',
              }}
              title="Open prompt token usage"
            >
              <Coins size={13} />
              Prompt Token Usage
            </motion.button>
            <motion.button
              onClick={() => setShowTopCostBreakdown(true)}
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '5px',
                padding: '8px 12px',
                borderRadius: '10px',
                border: 'none',
                background: theme === 'light' ? '#f3f4f6' : '#1f2937',
                color: currentTheme.accent,
                fontSize: '0.76rem',
                fontWeight: '600',
                cursor: 'pointer',
              }}
              title="Open prompt cost breakdown"
            >
              <DollarSign size={13} />
              Prompt Cost Breakdown
            </motion.button>

            <div style={{
              width: '1px',
              height: '24px',
              background: theme === 'light' ? 'rgba(0, 0, 0, 0.1)' : 'rgba(255, 255, 255, 0.1)',
              margin: '0 2px',
            }} />

            {resultViewMode === 'summary' ? (
              <motion.button
                onClick={() => setResultViewMode('council')}
                whileHover={{ scale: 1.03 }}
                whileTap={{ scale: 0.95 }}
                style={{
                  padding: '6px 14px',
                  borderRadius: '8px',
                  border: 'none',
                  background: theme === 'light' ? '#f3f4f6' : '#1f2937',
                  color: currentTheme.textSecondary,
                  fontSize: '0.76rem',
                  fontWeight: '600',
                  cursor: 'pointer',
                  transition: 'all 0.2s ease',
                }}
                title="Show side-by-side model responses"
              >
                Council Side by Side View
              </motion.button>
            ) : (
              <motion.button
                onClick={() => setResultViewMode('summary')}
                whileHover={{ scale: 1.03 }}
                whileTap={{ scale: 0.95 }}
                style={{
                  padding: '6px 14px',
                  borderRadius: '8px',
                  border: 'none',
                  background: theme === 'light' ? '#f3f4f6' : '#1f2937',
                  color: currentTheme.textSecondary,
                  fontSize: '0.76rem',
                  fontWeight: '600',
                  cursor: 'pointer',
                  transition: 'all 0.2s ease',
                }}
                title="Show summary response"
              >
                Summary View
              </motion.button>
            )}

            {/* DISABLED: Post to Prompt Feed button temporarily removed (social media feature) */}
          </div>
        </motion.div>
      )}
    </>
  )
}

export default TopActionBar
