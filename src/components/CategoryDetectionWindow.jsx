import React, { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { X, Minimize2, Maximize2, Brain } from 'lucide-react'
import { useStore } from '../store/useStore'

const CategoryDetectionWindow = ({ isOpen, onClose, detectionData, inline = false }) => {
  const [isMinimized, setIsMinimized] = useState(false)
  const activeTab = useStore((state) => state.activeTab)

  // Reset minimized state when window is closed
  useEffect(() => {
    if (!isOpen) {
      setIsMinimized(false)
    }
  }, [isOpen])

  if (!isOpen || !detectionData) return null

  const { prompt, response, category, needsSearch, recommendedModelType } = detectionData

  // If inline mode, render without modal overlay
  if (inline) {
    return (
      <div style={{ padding: '16px' }}>
        <h3 style={{ color: '#00aaff', fontSize: '1.2rem', margin: '0 0 16px 0', fontWeight: 'bold' }}>
          Category Detection
        </h3>
        <div style={{ marginBottom: '12px' }}>
          <div style={{ color: '#888', fontSize: '0.9rem', marginBottom: '8px' }}>
            <strong style={{ color: '#00aaff' }}>Category:</strong> {category}
          </div>
          <div style={{ color: '#888', fontSize: '0.9rem', marginBottom: '8px' }}>
            <strong style={{ color: '#00aaff' }}>Needs Search:</strong> {needsSearch ? 'Yes' : 'No'}
          </div>
          {recommendedModelType && (
            <div style={{ color: '#888', fontSize: '0.9rem', marginBottom: '8px' }}>
              <strong style={{ color: '#00aaff' }}>Recommended Model Type:</strong> {recommendedModelType}
            </div>
          )}
        </div>
        <div style={{ marginBottom: '12px' }}>
          <div style={{ color: '#00aaff', fontSize: '0.9rem', marginBottom: '4px', fontWeight: 'bold' }}>Prompt Sent:</div>
          <div style={{ 
            padding: '8px', 
            backgroundColor: '#0a0a0a', 
            borderRadius: '6px', 
            fontSize: '0.85rem', 
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
          <div style={{ color: '#00ff88', fontSize: '0.9rem', marginBottom: '4px', fontWeight: 'bold' }}>Response:</div>
          <div style={{ 
            padding: '8px', 
            backgroundColor: '#0a0a0a', 
            borderRadius: '6px', 
            fontSize: '0.85rem', 
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

  // Show minimized state
  // Only show on home tab
  if (isMinimized && activeTab === 'home') {
    return (
      <motion.button
        initial={{ opacity: 0, scale: 0.8 }}
        animate={{ opacity: 1, scale: 1 }}
        onClick={() => setIsMinimized(false)}
        style={{
          position: 'fixed',
          bottom: '200px',
          right: '20px', // Position in bottom-right, stacked above cost breakdown
          background: 'rgba(93, 173, 226, 0.2)',
          border: '1px solid rgba(93, 173, 226, 0.5)',
          borderRadius: '12px',
          padding: '12px 20px',
          color: '#00aaff',
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          zIndex: 10000,
          fontSize: '0.9rem',
          fontWeight: '500',
          boxShadow: '0 0 20px rgba(93, 173, 226, 0.3)',
        }}
        whileHover={{ background: 'rgba(93, 173, 226, 0.3)', scale: 1.05 }}
        whileTap={{ scale: 0.95 }}
      >
        <Maximize2 size={16} />
        Category Detection
      </motion.button>
    )
  }
  
  // Don't show anything if minimized and not on home tab
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
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: 'rgba(0, 0, 0, 0.8)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 10000,
            backdropFilter: 'blur(4px)',
          }}
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.9, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.9, y: 20 }}
            onClick={(e) => e.stopPropagation()}
            style={{
              background: 'rgba(0, 0, 0, 0.95)',
              border: '2px solid #00aaff',
              borderRadius: '16px',
              padding: '24px',
              maxWidth: '800px',
              width: '90%',
              maxHeight: '80vh',
              overflowY: 'auto',
              position: 'relative',
              boxShadow: '0 8px 32px rgba(93, 173, 226, 0.3)',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <Brain size={24} color="#00aaff" />
                <div>
                  <h2 style={{ color: '#00aaff', fontSize: '1.5rem', margin: 0, fontWeight: 'bold' }}>
                    Category Detection
                  </h2>
                  <div style={{ color: '#888', fontSize: '0.75rem', marginTop: '4px' }}>
                    Model: Gemini 2.5 Flash Lite (category detection)
                  </div>
                </div>
              </div>
              <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                <button
                  onClick={(e) => {
                    e.stopPropagation()
                    setIsMinimized(true)
                  }}
                  style={{
                    background: 'rgba(93, 173, 226, 0.1)',
                    border: '1px solid rgba(93, 173, 226, 0.3)',
                    borderRadius: '8px',
                    padding: '8px',
                    color: '#00aaff',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    transition: 'background 0.2s',
                  }}
                  onMouseEnter={(e) => e.target.style.background = 'rgba(93, 173, 226, 0.2)'}
                  onMouseLeave={(e) => e.target.style.background = 'rgba(93, 173, 226, 0.1)'}
                  title="Minimize"
                >
                  <Minimize2 size={20} />
                </button>
                <button
                  onClick={onClose}
                  style={{
                    background: 'transparent',
                    border: 'none',
                    color: '#ff6b6b',
                    cursor: 'pointer',
                    padding: '8px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    borderRadius: '8px',
                    transition: 'background 0.2s',
                  }}
                  onMouseEnter={(e) => e.target.style.background = 'rgba(255, 107, 107, 0.2)'}
                  onMouseLeave={(e) => e.target.style.background = 'transparent'}
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
                borderRadius: '12px',
                padding: '16px',
                marginBottom: '20px',
              }}
            >
              <h3 style={{ color: '#00aaff', fontSize: '1.1rem', margin: '0 0 12px 0', fontWeight: 'bold' }}>
                Detection Results
              </h3>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '12px' }}>
                <div>
                  <div style={{ color: '#888', fontSize: '0.85rem', marginBottom: '4px' }}>Category</div>
                  <div style={{ color: '#fff', fontSize: '1.1rem', fontWeight: 'bold' }}>
                    {category || 'N/A'}
                  </div>
                </div>
                <div>
                  <div style={{ color: '#888', fontSize: '0.85rem', marginBottom: '4px' }}>Needs Search</div>
                  <div style={{ color: needsSearch ? '#00ff88' : '#ffaa00', fontSize: '1.1rem', fontWeight: 'bold' }}>
                    {needsSearch ? 'Yes' : 'No'}
                  </div>
                </div>
                <div>
                  <div style={{ color: '#888', fontSize: '0.85rem', marginBottom: '4px' }}>Recommended Model Type</div>
                  <div style={{ color: '#00aaff', fontSize: '1.1rem', fontWeight: 'bold', textTransform: 'capitalize' }}>
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
                borderRadius: '12px',
                padding: '16px',
                marginBottom: '20px',
              }}
            >
              <h3 style={{ color: '#00aaff', fontSize: '1rem', margin: '0 0 12px 0', fontWeight: 'bold' }}>
                Category Detection Prompt (Gemini 2.5 Flash Lite)
              </h3>
              <div style={{ color: '#888', fontSize: '0.75rem', marginBottom: '8px', fontStyle: 'italic' }}>
                Note: This is the category detection step using Gemini 2.5 Flash Lite. The refiner step also uses Gemini 2.5 Flash Lite (with GPT-4o-mini as backup if fact check fails).
              </div>
              <div
                style={{
                  padding: '12px',
                  backgroundColor: '#000',
                  borderRadius: '8px',
                  fontSize: '0.85rem',
                  color: '#ccc',
                  maxHeight: '300px',
                  overflowY: 'auto',
                  fontFamily: 'monospace',
                  whiteSpace: 'pre-wrap',
                  wordBreak: 'break-word',
                }}
              >
                {prompt || 'No prompt available'}
              </div>
            </div>

            {/* Response */}
            <div
              style={{
                background: 'rgba(93, 173, 226, 0.05)',
                border: '1px solid rgba(93, 173, 226, 0.2)',
                borderRadius: '12px',
                padding: '16px',
              }}
            >
              <h3 style={{ color: '#00ff88', fontSize: '1rem', margin: '0 0 12px 0', fontWeight: 'bold' }}>
                Gemini 2.5 Flash Lite Response
              </h3>
              <div
                style={{
                  padding: '12px',
                  backgroundColor: '#000',
                  borderRadius: '8px',
                  fontSize: '0.85rem',
                  color: '#ccc',
                  maxHeight: '300px',
                  overflowY: 'auto',
                  fontFamily: 'monospace',
                  whiteSpace: 'pre-wrap',
                  wordBreak: 'break-word',
                }}
              >
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

