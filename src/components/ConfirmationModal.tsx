import React from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { AlertTriangle, X } from 'lucide-react'
import { spacing, fontSize, fontWeight, radius, zIndex, transition, layout, sx, createStyles } from '../utils/styles'
import { getTheme } from '../utils/theme'
import { useStore } from '../store/useStore'

interface Props {
  isOpen: boolean
  onClose: () => void
  onConfirm: () => void
  title: string
  message: string
  confirmText?: string
  cancelText?: string
  confirmColor?: string
}

const ConfirmationModal = ({ isOpen, onClose, onConfirm, title, message, confirmText = 'Confirm', cancelText = 'Cancel', confirmColor }: Props) => {
  const theme = useStore((state) => state.theme || 'dark')
  const currentTheme = getTheme(theme)
  const s = createStyles(currentTheme)

  const dangerColor = confirmColor || currentTheme.error

  if (!isOpen) return null

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={onClose}
        style={s.overlay}
      >
        <motion.div
          initial={{ opacity: 0, scale: 0.9, y: 20 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.9, y: 20 }}
          onClick={(e) => e.stopPropagation()}
          style={sx(s.modal, {
            maxWidth: '400px',
            width: '90%',
          })}
        >
          {/* Header */}
          <div style={sx(layout.spaceBetween, { marginBottom: spacing.xl })}>
            <div style={sx(layout.flexRow, { gap: spacing.lg })}>
              <AlertTriangle size={24} color={currentTheme.warning} />
              <h3 style={{
                fontSize: fontSize['4xl'],
                color: currentTheme.text,
                fontWeight: fontWeight.semibold,
                margin: 0,
              }}>
                {title}
              </h3>
            </div>
            <button
              onClick={onClose}
              style={sx(s.iconButton, { color: currentTheme.textSecondary })}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = currentTheme.backgroundOverlayLighter
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = 'transparent'
              }}
            >
              <X size={20} color={currentTheme.textMuted} />
            </button>
          </div>

          {/* Message */}
          <p style={{
            color: currentTheme.textSecondary,
            fontSize: fontSize.xl,
            lineHeight: '1.5',
            marginBottom: spacing['3xl'],
          }}>
            {message}
          </p>

          {/* Buttons */}
          <div style={sx(layout.flexRow, { gap: spacing.lg, justifyContent: 'flex-end' })}>
            <button
              onClick={onClose}
              style={{
                padding: `10px ${spacing['2xl']}`,
                background: currentTheme.buttonBackground,
                border: `1px solid ${currentTheme.borderLight}`,
                borderRadius: radius.md,
                color: currentTheme.text,
                fontSize: fontSize.lg,
                fontWeight: fontWeight.medium,
                cursor: 'pointer',
                transition: transition.normal,
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = currentTheme.buttonBackgroundHover
                e.currentTarget.style.borderColor = currentTheme.border
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = currentTheme.buttonBackground
                e.currentTarget.style.borderColor = currentTheme.borderLight
              }}
            >
              {cancelText}
            </button>
            <button
              onClick={() => {
                onConfirm()
                onClose()
              }}
              style={{
                padding: `10px ${spacing['2xl']}`,
                background: dangerColor,
                border: `1px solid ${dangerColor}`,
                borderRadius: radius.md,
                color: '#ffffff',
                fontSize: fontSize.lg,
                fontWeight: fontWeight.semibold,
                cursor: 'pointer',
                transition: transition.normal,
                boxShadow: `0 4px 12px ${dangerColor}40`,
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.opacity = '0.9'
                e.currentTarget.style.transform = 'translateY(-1px)'
                e.currentTarget.style.boxShadow = `0 6px 16px ${dangerColor}60`
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.opacity = '1'
                e.currentTarget.style.transform = 'translateY(0)'
                e.currentTarget.style.boxShadow = `0 4px 12px ${dangerColor}40`
              }}
            >
              {confirmText}
            </button>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  )
}

export default ConfirmationModal
