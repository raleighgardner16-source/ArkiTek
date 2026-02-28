import React from 'react'
import { motion, AnimatePresence } from 'framer-motion'

const getModelTypeTooltip = (type) => {
  switch (type) {
    case 'reasoning':
      return 'Reasoning models excel at complex problem-solving, logical analysis, and step-by-step thinking. Best for math, coding, and analytical tasks.'
    case 'versatile':
      return 'Versatile models are well-rounded and handle a wide variety of tasks effectively. Good for general conversation, writing, and multi-purpose use.'
    case 'fast':
      return 'Fast models prioritize speed and efficiency. Ideal for quick responses, simple queries, text processing, and when speed is more important than depth.'
    default:
      return ''
  }
}

const ModelTypeTooltip = ({
  tooltipState,
  currentTheme,
  onMouseEnter,
  onMouseLeave,
}) => {
  return (
    <AnimatePresence>
      {tooltipState.show && tooltipState.type && (
        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.9 }}
          transition={{ duration: 0.15 }}
          style={{
            position: 'fixed',
            left: `${tooltipState.x}px`,
            top: `${tooltipState.y}px`,
            background: 'rgba(0, 0, 0, 0.95)',
            border: '1px solid rgba(93, 173, 226, 0.5)',
            borderRadius: '8px',
            padding: '12px 16px',
            zIndex: 10001,
            maxWidth: '280px',
            boxShadow: '0 4px 20px rgba(93, 173, 226, 0.3)',
            pointerEvents: 'none',
          }}
          onMouseEnter={onMouseEnter}
          onMouseLeave={onMouseLeave}
        >
          <div style={{ color: currentTheme.text, fontSize: '0.85rem', lineHeight: '1.5' }}>
            {getModelTypeTooltip(tooltipState.type)}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}

export default ModelTypeTooltip
