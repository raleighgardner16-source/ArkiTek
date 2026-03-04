import React from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Award, X } from 'lucide-react'
import type { BadgeNotificationData } from '../hooks/useBadgeNotifications'
import type { Theme } from '../utils/theme'

interface BadgeNotificationProps {
  badge: BadgeNotificationData | null
  onDismiss: () => void
  currentTheme: Theme
}

const BadgeNotification: React.FC<BadgeNotificationProps> = ({ badge, onDismiss, currentTheme }) => {
  return (
    <AnimatePresence>
      {badge && (
        <motion.div
          key={badge.id}
          initial={{ opacity: 0, y: -40, scale: 0.85 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: -30, scale: 0.9 }}
          transition={{ type: 'spring', stiffness: 350, damping: 28 }}
          style={{
            position: 'fixed',
            top: '24px',
            right: '24px',
            zIndex: 10000,
            display: 'flex',
            alignItems: 'center',
            gap: '16px',
            padding: '16px 20px',
            borderRadius: '16px',
            background: `linear-gradient(135deg, ${currentTheme.backgroundOverlay}, ${currentTheme.backgroundSecondary})`,
            border: `1px solid ${badge.color}60`,
            boxShadow: `0 8px 32px rgba(0,0,0,0.4), 0 0 20px ${badge.color}25`,
            backdropFilter: 'blur(16px)',
            maxWidth: '380px',
            cursor: 'pointer',
            overflow: 'hidden',
          }}
          onClick={onDismiss}
        >
          {/* Animated shimmer behind badge */}
          <motion.div
            initial={{ x: '-100%' }}
            animate={{ x: '200%' }}
            transition={{ duration: 1.8, delay: 0.3, ease: 'easeInOut' }}
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              width: '50%',
              height: '100%',
              background: `linear-gradient(90deg, transparent, ${badge.color}12, transparent)`,
              pointerEvents: 'none',
            }}
          />

          {/* Badge icon */}
          <motion.div
            initial={{ scale: 0, rotate: -30 }}
            animate={{ scale: 1, rotate: 0 }}
            transition={{ type: 'spring', stiffness: 400, damping: 15, delay: 0.15 }}
            style={{
              width: '52px',
              height: '52px',
              borderRadius: '50%',
              background: `radial-gradient(circle, ${badge.color}35, ${badge.color}10)`,
              border: `2px solid ${badge.color}`,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: '1.6rem',
              flexShrink: 0,
              boxShadow: `0 0 16px ${badge.color}30, inset 0 0 12px ${badge.color}15`,
            }}
          >
            {badge.emoji}
          </motion.div>

          {/* Text content */}
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              marginBottom: '4px',
            }}>
              <Award size={13} color={badge.color} />
              <span style={{
                fontSize: '0.7rem',
                fontWeight: 600,
                color: badge.color,
                textTransform: 'uppercase',
                letterSpacing: '0.8px',
              }}>
                Badge Unlocked
              </span>
            </div>
            <p style={{
              fontSize: '0.95rem',
              fontWeight: 700,
              color: currentTheme.text,
              margin: '0 0 2px 0',
              lineHeight: 1.2,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}>
              {badge.name}
            </p>
            <p style={{
              fontSize: '0.75rem',
              color: currentTheme.textMuted,
              margin: 0,
              lineHeight: 1.3,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}>
              {badge.categoryName} — {badge.desc}
            </p>
          </div>

          {/* Dismiss button */}
          <motion.div
            whileHover={{ scale: 1.15 }}
            whileTap={{ scale: 0.9 }}
            style={{
              width: '24px',
              height: '24px',
              borderRadius: '50%',
              background: 'rgba(255,255,255,0.06)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0,
            }}
            onClick={(e) => {
              e.stopPropagation()
              onDismiss()
            }}
          >
            <X size={13} color={currentTheme.textMuted} />
          </motion.div>

          {/* Auto-dismiss progress bar */}
          <motion.div
            initial={{ scaleX: 1 }}
            animate={{ scaleX: 0 }}
            transition={{ duration: 5, ease: 'linear' }}
            style={{
              position: 'absolute',
              bottom: 0,
              left: 0,
              right: 0,
              height: '2px',
              background: `linear-gradient(90deg, ${badge.color}, ${badge.color}80)`,
              transformOrigin: 'left',
            }}
          />
        </motion.div>
      )}
    </AnimatePresence>
  )
}

export default BadgeNotification
