import React, { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { X, Minimize2, Maximize2, Brain } from 'lucide-react'
import { useStore } from '../store/useStore'
import { getTheme } from '../utils/theme'
import { spacing, fontSize, fontWeight, radius, zIndex, transition, layout, sx, createStyles } from '../utils/styles'

interface Props {
  isOpen: boolean
  onClose: () => void
  detectionData: any
  inline?: boolean
}

const CategoryDetectionWindow = ({ isOpen, onClose, detectionData, inline = false }: Props) => {
  const [isMinimized, setIsMinimized] = useState(false)
  const activeTab = useStore((state) => state.activeTab)
  const theme = useStore((state) => state.theme || 'dark')
  const currentTheme = getTheme(theme)
  const s = createStyles(currentTheme)

  useEffect(() => {
    if (!isOpen) {
      setIsMinimized(false)
    }
  }, [isOpen])

  if (!isOpen || !detectionData) return null

  const { prompt, response, category, needsSearch, recommendedModelType } = detectionData

  const codeBlockStyle = {
    padding: spacing.lg,
    backgroundColor: '#000',
    borderRadius: radius.md,
    fontSize: fontSize.base,
    color: '#ccc',
    maxHeight: '300px',
    overflowY: 'auto' as const,
    fontFamily: 'monospace',
    whiteSpace: 'pre-wrap' as const,
    wordBreak: 'break-word' as const,
  }

  if (inline) {
    return (
      <div style={{ padding: spacing.xl }}>
        <h3 style={{ color: '#00aaff', fontSize: fontSize['4xl'], margin: `0 0 ${spacing.xl} 0`, fontWeight: fontWeight.bold }}>
          Category Detection
        </h3>
        <div style={{ marginBottom: spacing.lg }}>
          <div style={{ color: '#888', fontSize: fontSize.lg, marginBottom: spacing.md }}>
            <strong style={{ color: '#00aaff' }}>Category:</strong> {category}
          </div>
          <div style={{ color: '#888', fontSize: fontSize.lg, marginBottom: spacing.md }}>
            <strong style={{ color: '#00aaff' }}>Needs Search:</strong> {needsSearch ? 'Yes' : 'No'}
          </div>
          {recommendedModelType && (
            <div style={{ color: '#888', fontSize: fontSize.lg, marginBottom: spacing.md }}>
              <strong style={{ color: '#00aaff' }}>Recommended Model Type:</strong> {recommendedModelType}
            </div>
          )}
        </div>
        <div style={{ marginBottom: spacing.lg }}>
          <div style={{ color: '#00aaff', fontSize: fontSize.lg, marginBottom: spacing.xs, fontWeight: fontWeight.bold }}>Prompt Sent:</div>
          <div style={{
            padding: spacing.md,
            backgroundColor: '#0a0a0a',
            borderRadius: radius.sm,
            fontSize: fontSize.base,
            color: '#ccc',
            maxHeight: '150px',
            overflowY: 'auto',
            fontFamily: 'monospace',
            whiteSpace: 'pre-wrap'
          }}>
            {prompt}
          </div>
        </div>
        <div>
          <div style={{ color: '#00ff88', fontSize: fontSize.lg, marginBottom: spacing.xs, fontWeight: fontWeight.bold }}>Response:</div>
          <div style={{
            padding: spacing.md,
            backgroundColor: '#0a0a0a',
            borderRadius: radius.sm,
            fontSize: fontSize.base,
            color: '#ccc',
            maxHeight: '200px',
            overflowY: 'auto',
            fontFamily: 'monospace',
            whiteSpace: 'pre-wrap'
          }}>
            {response}
          </div>
        </div>
      </div>
    )
  }

  if (isMinimized && activeTab === 'home') {
    return (
      <motion.button
        initial={{ opacity: 0, scale: 0.8 }}
        animate={{ opacity: 1, scale: 1 }}
        onClick={() => setIsMinimized(false)}
        style={sx(layout.flexRow, {
          position: 'fixed',
          bottom: '200px',
          right: spacing['2xl'],
          background: 'rgba(93, 173, 226, 0.2)',
          border: '1px solid rgba(93, 173, 226, 0.5)',
          borderRadius: radius.xl,
          padding: `${spacing.lg} ${spacing['2xl']}`,
          color: '#00aaff',
          cursor: 'pointer',
          gap: spacing.md,
          zIndex: zIndex.modal,
          fontSize: fontSize.lg,
          fontWeight: fontWeight.medium,
          boxShadow: '0 0 20px rgba(93, 173, 226, 0.3)',
        })}
        whileHover={{ background: 'rgba(93, 173, 226, 0.3)', scale: 1.05 }}
        whileTap={{ scale: 0.95 }}
      >
        <Maximize2 size={16} />
        Category Detection
      </motion.button>
    )
  }

  if (isMinimized && activeTab !== 'home') {
    return null
  }

  return (
    <AnimatePresence>
      {isOpen && (
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
            style={{
              background: 'rgba(0, 0, 0, 0.95)',
              border: '2px solid #00aaff',
              borderRadius: radius['2xl'],
              padding: spacing['3xl'],
              maxWidth: '800px',
              width: '90%',
              maxHeight: '80vh',
              overflowY: 'auto',
              position: 'relative',
              boxShadow: '0 8px 32px rgba(93, 173, 226, 0.3)',
            }}
          >
            <div style={sx(layout.spaceBetween, { marginBottom: spacing['2xl'] })}>
              <div style={sx(layout.flexRow, { gap: spacing.lg })}>
                <Brain size={24} color="#00aaff" />
                <div>
                  <h2 style={{ color: '#00aaff', fontSize: fontSize['6xl'], margin: 0, fontWeight: fontWeight.bold }}>
                    Category Detection
                  </h2>
                  <div style={{ color: '#888', fontSize: '0.75rem', marginTop: spacing.xs }}>
                    Model: Gemini 2.5 Flash Lite (category detection)
                  </div>
                </div>
              </div>
              <div style={sx(layout.flexRow, { gap: spacing.md })}>
                <button
                  onClick={(e) => {
                    e.stopPropagation()
                    setIsMinimized(true)
                  }}
                  style={sx(s.iconButton, {
                    background: 'rgba(93, 173, 226, 0.1)',
                    border: '1px solid rgba(93, 173, 226, 0.3)',
                    borderRadius: radius.md,
                    padding: spacing.md,
                    color: '#00aaff',
                    transition: 'background 0.2s',
                  })}
                  onMouseEnter={(e) => (e.target as HTMLElement).style.background = 'rgba(93, 173, 226, 0.2)'}
                  onMouseLeave={(e) => (e.target as HTMLElement).style.background = 'rgba(93, 173, 226, 0.1)'}
                  title="Minimize"
                >
                  <Minimize2 size={20} />
                </button>
                <button
                  onClick={onClose}
                  style={sx(s.iconButton, {
                    color: currentTheme.error,
                    padding: spacing.md,
                    borderRadius: radius.md,
                    transition: 'background 0.2s',
                  })}
                onMouseEnter={(e) => (e.target as HTMLElement).style.background = 'rgba(255, 107, 107, 0.2)'}
                onMouseLeave={(e) => (e.target as HTMLElement).style.background = 'transparent'}
                  title="Close"
                >
                  <X size={24} />
                </button>
              </div>
            </div>

            {/* Detection Results */}
            <div
              style={{
                background: 'rgba(93, 173, 226, 0.1)',
                border: '1px solid rgba(93, 173, 226, 0.3)',
                borderRadius: radius.xl,
                padding: spacing.xl,
                marginBottom: spacing['2xl'],
              }}
            >
              <h3 style={{ color: '#00aaff', fontSize: fontSize['3xl'], margin: `0 0 ${spacing.lg} 0`, fontWeight: fontWeight.bold }}>
                Detection Results
              </h3>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: spacing.lg }}>
                <div>
                  <div style={{ color: '#888', fontSize: fontSize.base, marginBottom: spacing.xs }}>Category</div>
                  <div style={{ color: '#fff', fontSize: fontSize['3xl'], fontWeight: fontWeight.bold }}>
                    {category || 'N/A'}
                  </div>
                </div>
                <div>
                  <div style={{ color: '#888', fontSize: fontSize.base, marginBottom: spacing.xs }}>Needs Search</div>
                  <div style={{ color: needsSearch ? '#00ff88' : currentTheme.warning, fontSize: fontSize['3xl'], fontWeight: fontWeight.bold }}>
                    {needsSearch ? 'Yes' : 'No'}
                  </div>
                </div>
                <div>
                  <div style={{ color: '#888', fontSize: fontSize.base, marginBottom: spacing.xs }}>Recommended Model Type</div>
                  <div style={{ color: '#00aaff', fontSize: fontSize['3xl'], fontWeight: fontWeight.bold, textTransform: 'capitalize' }}>
                    {recommendedModelType || 'N/A'}
                  </div>
                </div>
              </div>
            </div>

            {/* Default Prompt */}
            <div
              style={{
                background: 'rgba(93, 173, 226, 0.05)',
                border: '1px solid rgba(93, 173, 226, 0.2)',
                borderRadius: radius.xl,
                padding: spacing.xl,
                marginBottom: spacing['2xl'],
              }}
            >
              <h3 style={{ color: '#00aaff', fontSize: fontSize['2xl'], margin: `0 0 ${spacing.lg} 0`, fontWeight: fontWeight.bold }}>
                Category Detection Prompt (Gemini 2.5 Flash Lite)
              </h3>
              <div style={{ color: '#888', fontSize: '0.75rem', marginBottom: spacing.md, fontStyle: 'italic' }}>
                Note: This is the category detection step using Gemini 2.5 Flash Lite. The refiner step also uses Gemini 2.5 Flash Lite (with GPT-4o-mini as backup if fact check fails).
              </div>
              <div style={codeBlockStyle}>
                {prompt || 'No prompt available'}
              </div>
            </div>

            {/* Response */}
            <div
              style={{
                background: 'rgba(93, 173, 226, 0.05)',
                border: '1px solid rgba(93, 173, 226, 0.2)',
                borderRadius: radius.xl,
                padding: spacing.xl,
              }}
            >
              <h3 style={{ color: '#00ff88', fontSize: fontSize['2xl'], margin: `0 0 ${spacing.lg} 0`, fontWeight: fontWeight.bold }}>
                Gemini 2.5 Flash Lite Response
              </h3>
              <div style={codeBlockStyle}>
                {response || 'No response available'}
              </div>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}

export default CategoryDetectionWindow
