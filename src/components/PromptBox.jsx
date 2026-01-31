import React, { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { X, Send, ChevronDown } from 'lucide-react'
import { useStore } from '../store/useStore'
import { getAllModels } from '../services/llmProviders'

const PromptBox = () => {
  const showPromptBox = useStore((state) => state.showPromptBox)
  const setShowPromptBox = useStore((state) => state.setShowPromptBox)
  const selectedModels = useStore((state) => state.selectedModels)
  const setSelectedModels = useStore((state) => state.setSelectedModels)
  const currentPrompt = useStore((state) => state.currentPrompt)
  const setCurrentPrompt = useStore((state) => state.setCurrentPrompt)
  const triggerSubmit = useStore((state) => state.triggerSubmit)
  const [showModelDropdown, setShowModelDropdown] = useState(false)
  // Mode selection removed - always use Independent Research Mode

  const allModels = getAllModels()

  const toggleModel = (modelId) => {
    if (selectedModels.includes(modelId)) {
      setSelectedModels(selectedModels.filter((id) => id !== modelId))
    } else {
      setSelectedModels([...selectedModels, modelId])
    }
  }

  const handleSubmit = () => {
    if (currentPrompt.trim() && selectedModels.length > 0) {
      triggerSubmit()
      setShowPromptBox(false)
    }
  }

  if (!showPromptBox) return null

  return (
    <AnimatePresence>
      <motion.div
        initial={{ y: 100, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        exit={{ y: 100, opacity: 0 }}
        style={{
          position: 'fixed',
          bottom: '20px',
          left: '50%',
          transform: 'translateX(-50%)',
          width: '90%',
          maxWidth: '800px',
          background: 'rgba(0, 0, 0, 0.9)',
          border: '1px solid rgba(0, 255, 255, 0.3)',
          borderRadius: '16px',
          padding: '24px',
          zIndex: 1000,
          boxShadow: '0 0 30px rgba(0, 255, 255, 0.3)',
        }}
      >
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: '16px',
          }}
        >
          <h3
            style={{
              fontSize: '1.2rem',
              background: 'linear-gradient(90deg, #00FFFF, #00FF00)',
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
            }}
          >
            Select Models & Enter Prompt
          </h3>
          <button
            onClick={() => setShowPromptBox(false)}
            style={{
              background: 'transparent',
              border: 'none',
              color: '#ffffff',
              cursor: 'pointer',
              padding: '4px',
            }}
          >
            <X size={20} />
          </button>
        </div>

        {/* Model Selection Dropdown */}
        <div style={{ marginBottom: '16px', position: 'relative' }}>
          <button
            onClick={() => setShowModelDropdown(!showModelDropdown)}
            style={{
              width: '100%',
              padding: '12px',
              background: 'rgba(0, 255, 255, 0.1)',
              border: '1px solid rgba(0, 255, 255, 0.3)',
              borderRadius: '8px',
              color: '#ffffff',
              cursor: 'pointer',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
            }}
          >
            <span>
              {selectedModels.length > 0
                ? `${selectedModels.length} model(s) selected`
                : 'Select models...'}
            </span>
            <ChevronDown
              size={20}
              style={{
                transform: showModelDropdown ? 'rotate(180deg)' : 'rotate(0deg)',
                transition: 'transform 0.3s ease',
              }}
            />
          </button>

          <AnimatePresence>
            {showModelDropdown && (
              <motion.div
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                style={{
                  position: 'absolute',
                  top: '100%',
                  left: 0,
                  right: 0,
                  marginTop: '8px',
                  background: 'rgba(0, 0, 0, 0.95)',
                  border: '1px solid rgba(0, 255, 255, 0.3)',
                  borderRadius: '8px',
                  maxHeight: '300px',
                  overflowY: 'auto',
                  zIndex: 1001,
                }}
              >
                {allModels.map((model) => (
                  <label
                    key={model.id}
                    style={{
                      display: 'block',
                      padding: '12px',
                      cursor: 'pointer',
                      borderBottom: '1px solid rgba(0, 255, 255, 0.1)',
                    }}
                    onMouseEnter={(e) => {
                      e.target.style.background = 'rgba(0, 255, 255, 0.1)'
                    }}
                    onMouseLeave={(e) => {
                      e.target.style.background = 'transparent'
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={selectedModels.includes(model.id)}
                      onChange={() => toggleModel(model.id)}
                      style={{ marginRight: '8px' }}
                    />
                    <span style={{ color: '#ffffff' }}>{model.displayName}</span>
                  </label>
                ))}
              </motion.div>
            )}
          </AnimatePresence>
        </div>


        {/* Prompt Input */}
        <textarea
          value={currentPrompt}
          onChange={(e) => setCurrentPrompt(e.target.value)}
          placeholder="Enter your prompt here..."
          style={{
            width: '100%',
            minHeight: '120px',
            padding: '12px',
            background: 'rgba(0, 255, 255, 0.05)',
            border: '1px solid rgba(0, 255, 255, 0.3)',
            borderRadius: '8px',
            color: '#ffffff',
            fontSize: '1rem',
            fontFamily: 'inherit',
            resize: 'vertical',
            marginBottom: '16px',
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && e.ctrlKey) {
              handleSubmit()
            }
          }}
        />

        {/* Submit Button */}
        <button
          onClick={handleSubmit}
          disabled={!currentPrompt.trim() || selectedModels.length === 0}
          style={{
            width: '100%',
            padding: '12px',
            background:
              currentPrompt.trim() && selectedModels.length > 0
                ? 'linear-gradient(90deg, #00FFFF, #00FF00)'
                : 'rgba(128, 128, 128, 0.3)',
            border: 'none',
            borderRadius: '8px',
            color: '#000000',
            fontSize: '1rem',
            fontWeight: 'bold',
            cursor:
              currentPrompt.trim() && selectedModels.length > 0
                ? 'pointer'
                : 'not-allowed',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '8px',
          }}
        >
          <Send size={20} />
          Submit Prompt (Ctrl+Enter)
        </button>

        {/* Mode selection removed */}
        <AnimatePresence>
          {false && (
            <motion.div
              initial={{ opacity: 0, scale: 0.8, y: -20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.8, y: -20 }}
              style={{
                position: 'fixed',
                top: '50%',
                left: '50%',
                transform: 'translate(-50%, -50%)',
                background: 'rgba(0, 0, 0, 0.95)',
                border: '2px solid rgba(0, 255, 255, 0.5)',
                borderRadius: '12px',
                padding: '20px 24px',
                zIndex: 10002,
                boxShadow: '0 8px 32px rgba(0, 255, 255, 0.3)',
                minWidth: '280px',
                maxWidth: '320px',
                textAlign: 'center',
              }}
              onClick={(e) => e.stopPropagation()}
            >
              <div style={{ color: '#ffffff', fontSize: '1rem', lineHeight: '1.5' }}>
                <div style={{ marginBottom: '12px', color: '#00FFFF', fontSize: '1.1rem', fontWeight: '600' }}>
                  Mode Required
                </div>
                <div style={{ color: '#cccccc' }}>
                  Please select a mode before submitting your prompt.
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>
    </AnimatePresence>
  )
}

export default PromptBox
