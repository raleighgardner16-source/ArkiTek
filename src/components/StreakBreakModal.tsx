import React, { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Flame, X, Zap, Shield, AlertTriangle, ChevronDown } from 'lucide-react'
import { spacing, fontSize, fontWeight, radius, zIndex, transition, layout, sx, createStyles } from '../utils/styles'
import { getTheme } from '../utils/theme'
import { useStore } from '../store/useStore'
import { STREAK_SAVE_LEVEL_COST } from '../utils/xpConstants'

interface StreakBreakData {
  previousStreak: number
  brokenAt: string
  hasPass: boolean
  passCount: number
  xpCost: number
  newLevelAfterXP: number
  canAffordXP: boolean
  currentLevel: number
}

interface Props {
  isOpen: boolean
  streakBreak: StreakBreakData
  onRecover: (method: 'pass' | 'xp' | 'decline') => Promise<void>
}

const StreakBreakModal = ({ isOpen, streakBreak, onRecover }: Props) => {
  const theme = useStore((state) => state.theme || 'dark')
  const currentTheme = getTheme(theme)
  const s = createStyles(currentTheme)
  const [recovering, setRecovering] = useState<string | null>(null)

  if (!isOpen || !streakBreak) return null

  const { previousStreak, hasPass, passCount, xpCost, newLevelAfterXP, canAffordXP, currentLevel } = streakBreak

  const handleRecover = async (method: 'pass' | 'xp' | 'decline') => {
    setRecovering(method)
    try {
      await onRecover(method)
    } finally {
      setRecovering(null)
    }
  }

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        style={s.overlay}
      >
        <motion.div
          initial={{ opacity: 0, scale: 0.9, y: 20 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.9, y: 20 }}
          onClick={(e) => e.stopPropagation()}
          style={sx(s.modal, {
            maxWidth: '440px',
            width: '90%',
            padding: 0,
            overflow: 'hidden',
          })}
        >
          {/* Top banner */}
          <div style={{
            background: 'linear-gradient(135deg, #FF4500 0%, #FF6347 50%, #FF8C00 100%)',
            padding: `${spacing['3xl']} ${spacing['3xl']} ${spacing['2xl']}`,
            textAlign: 'center',
          }}>
            <motion.div
              animate={{ scale: [1, 1.15, 1], rotate: [0, -8, 8, 0] }}
              transition={{ duration: 1.5, repeat: Infinity, repeatDelay: 2 }}
              style={{ marginBottom: spacing.lg }}
            >
              <Flame size={48} color="#fff" strokeWidth={2.5} />
            </motion.div>
            <h2 style={{
              color: '#fff',
              fontSize: '1.4rem',
              fontWeight: fontWeight.bold,
              margin: 0,
              marginBottom: spacing.sm,
            }}>
              Streak Lost!
            </h2>
            <p style={{
              color: 'rgba(255,255,255,0.85)',
              fontSize: fontSize.xl,
              margin: 0,
            }}>
              Your <strong>{previousStreak}-day</strong> streak has been broken
            </p>
          </div>

          {/* Body */}
          <div style={{ padding: spacing['3xl'] }}>
            <p style={{
              color: currentTheme.textSecondary,
              fontSize: fontSize.lg,
              lineHeight: '1.6',
              margin: `0 0 ${spacing.lg} 0`,
              textAlign: 'center',
            }}>
              You missed a day. Save your streak before it's gone!
            </p>
            <div style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '6px',
              padding: `${spacing.sm} ${spacing.xl}`,
              background: 'rgba(255, 68, 0, 0.08)',
              border: '1px solid rgba(255, 68, 0, 0.2)',
              borderRadius: radius.md,
              marginBottom: spacing['2xl'],
            }}>
              <AlertTriangle size={13} color="#FF4400" />
              <span style={{
                color: '#FF6347',
                fontSize: fontSize.sm,
                fontWeight: fontWeight.semibold,
              }}>
                Expires at end of today
              </span>
            </div>

            {/* Option 1: Use Streak Pass */}
            <motion.button
              whileHover={hasPass ? { scale: 1.01 } : undefined}
              whileTap={hasPass ? { scale: 0.99 } : undefined}
              disabled={!hasPass || recovering !== null}
              onClick={() => handleRecover('pass')}
              style={{
                width: '100%',
                padding: `${spacing.xl} ${spacing['2xl']}`,
                background: hasPass ? `${currentTheme.accent}12` : `${currentTheme.textMuted}08`,
                border: `1px solid ${hasPass ? currentTheme.accent + '40' : currentTheme.borderLight}`,
                borderRadius: radius.lg,
                cursor: hasPass ? 'pointer' : 'not-allowed',
                opacity: hasPass ? 1 : 0.5,
                display: 'flex',
                alignItems: 'center',
                gap: spacing.xl,
                marginBottom: spacing.lg,
                transition: transition.normal,
                textAlign: 'left',
              }}
            >
              <div style={{
                width: '42px',
                height: '42px',
                borderRadius: radius.circle,
                background: hasPass ? `${currentTheme.accent}20` : `${currentTheme.textMuted}15`,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0,
              }}>
                <Shield size={20} color={hasPass ? currentTheme.accent : currentTheme.textMuted} />
              </div>
              <div style={{ flex: 1 }}>
                <div style={{
                  color: hasPass ? currentTheme.text : currentTheme.textMuted,
                  fontSize: fontSize.xl,
                  fontWeight: fontWeight.semibold,
                  marginBottom: '2px',
                }}>
                  {recovering === 'pass' ? 'Recovering...' : 'Use Streak Pass'}
                </div>
                <div style={{
                  color: currentTheme.textSecondary,
                  fontSize: fontSize.sm,
                }}>
                  {hasPass ? `${passCount} pass${passCount !== 1 ? 'es' : ''} available — keeps your streak for free` : 'No passes available'}
                </div>
              </div>
            </motion.button>

            {/* Option 2: Spend XP */}
            <motion.button
              whileHover={canAffordXP ? { scale: 1.01 } : undefined}
              whileTap={canAffordXP ? { scale: 0.99 } : undefined}
              disabled={!canAffordXP || recovering !== null}
              onClick={() => handleRecover('xp')}
              style={{
                width: '100%',
                padding: `${spacing.xl} ${spacing['2xl']}`,
                background: canAffordXP ? 'rgba(255, 165, 0, 0.08)' : `${currentTheme.textMuted}08`,
                border: `1px solid ${canAffordXP ? 'rgba(255, 165, 0, 0.3)' : currentTheme.borderLight}`,
                borderRadius: radius.lg,
                cursor: canAffordXP ? 'pointer' : 'not-allowed',
                opacity: canAffordXP ? 1 : 0.5,
                display: 'flex',
                alignItems: 'center',
                gap: spacing.xl,
                marginBottom: spacing['2xl'],
                transition: transition.normal,
                textAlign: 'left',
              }}
            >
              <div style={{
                width: '42px',
                height: '42px',
                borderRadius: radius.circle,
                background: canAffordXP ? 'rgba(255, 165, 0, 0.15)' : `${currentTheme.textMuted}15`,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0,
              }}>
                <Zap size={20} color={canAffordXP ? '#FFA500' : currentTheme.textMuted} />
              </div>
              <div style={{ flex: 1 }}>
                <div style={{
                  color: canAffordXP ? currentTheme.text : currentTheme.textMuted,
                  fontSize: fontSize.xl,
                  fontWeight: fontWeight.semibold,
                  marginBottom: '2px',
                }}>
                  {recovering === 'xp' ? 'Recovering...' : `Spend ${xpCost.toLocaleString()} XP`}
                </div>
                <div style={{
                  color: currentTheme.textSecondary,
                  fontSize: fontSize.sm,
                }}>
                  {canAffordXP
                    ? `Drop ${STREAK_SAVE_LEVEL_COST} levels (Lv.${currentLevel} → Lv.${newLevelAfterXP})`
                    : `Requires level ${STREAK_SAVE_LEVEL_COST}+ (you're level ${currentLevel})`
                  }
                </div>
              </div>
            </motion.button>

            {/* Decline button */}
            <button
              disabled={recovering !== null}
              onClick={() => handleRecover('decline')}
              style={{
                width: '100%',
                padding: `10px ${spacing['2xl']}`,
                background: 'transparent',
                border: `1px solid ${currentTheme.borderLight}`,
                borderRadius: radius.md,
                color: currentTheme.textMuted,
                fontSize: fontSize.base,
                fontWeight: fontWeight.medium,
                cursor: recovering ? 'not-allowed' : 'pointer',
                transition: transition.normal,
              }}
              onMouseEnter={(e) => {
                if (!recovering) {
                  e.currentTarget.style.background = currentTheme.buttonBackgroundHover || currentTheme.buttonBackground
                  e.currentTarget.style.color = currentTheme.textSecondary
                }
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = 'transparent'
                e.currentTarget.style.color = currentTheme.textMuted
              }}
            >
              {recovering === 'decline' ? 'Resetting...' : 'Let it go — reset my streak'}
            </button>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  )
}

export default StreakBreakModal
