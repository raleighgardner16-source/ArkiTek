import React, { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Settings, X, Eye, EyeOff } from 'lucide-react'
import { useStore } from '../store/useStore'
import { LLM_PROVIDERS } from '../services/llmProviders'

const ApiKeyManager = () => {
  const [isOpen, setIsOpen] = useState(false)
  const [visibleKeys, setVisibleKeys] = useState({})
  const apiKeys = useStore((state) => state.apiKeys)
  const setApiKey = useStore((state) => state.setApiKey)

  const toggleKeyVisibility = (provider) => {
    setVisibleKeys((prev) => ({
      ...prev,
      [provider]: !prev[provider],
    }))
  }

  return (
    <>
      <motion.button
        data-api-keys-button
        onClick={() => setIsOpen(true)}
        style={{
          position: 'fixed',
          bottom: '20px',
          right: '20px',
          padding: '12px 20px',
          background: 'rgba(0, 255, 255, 0.2)',
          border: '1px solid rgba(0, 255, 255, 0.3)',
          borderRadius: '8px',
          color: '#ffffff',
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          zIndex: 99,
        }}
        whileHover={{ background: 'rgba(0, 255, 255, 0.3)' }}
      >
        <Settings size={20} />
        API Keys
      </motion.button>

      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            style={{
              position: 'fixed',
              top: 0,
              left: 0,
              width: '100vw',
              height: '100vh',
              background: 'rgba(0, 0, 0, 0.95)',
              zIndex: 200,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
            onClick={() => setIsOpen(false)}
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              onClick={(e) => e.stopPropagation()}
              style={{
                background: 'rgba(0, 0, 0, 0.9)',
                border: '1px solid rgba(0, 255, 255, 0.3)',
                borderRadius: '16px',
                padding: '40px',
                maxWidth: '600px',
                width: '90%',
                maxHeight: '80vh',
                overflowY: 'auto',
                position: 'relative',
              }}
            >
              <button
                onClick={() => setIsOpen(false)}
                style={{
                  position: 'absolute',
                  top: '20px',
                  right: '20px',
                  background: 'transparent',
                  border: 'none',
                  color: '#ffffff',
                  cursor: 'pointer',
                }}
              >
                <X size={24} />
              </button>

              <h2
                style={{
                  fontSize: '2rem',
                  marginBottom: '30px',
                  background: 'linear-gradient(90deg, #00FFFF, #00FF00)',
                  WebkitBackgroundClip: 'text',
                  WebkitTextFillColor: 'transparent',
                }}
              >
                API Key Management
              </h2>

              <p
                style={{
                  color: '#aaaaaa',
                  marginBottom: '24px',
                  lineHeight: '1.6',
                }}
              >
                Enter your API keys for each provider. Your keys are stored
                locally and never shared. Using your own keys avoids additional
                charges.
              </p>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                {Object.entries(LLM_PROVIDERS).map(([providerKey, provider]) => (
                  <div
                    key={providerKey}
                    style={{
                      background: 'rgba(0, 255, 255, 0.05)',
                      border: '1px solid rgba(0, 255, 255, 0.2)',
                      borderRadius: '8px',
                      padding: '16px',
                    }}
                  >
                    <label
                      style={{
                        display: 'block',
                        marginBottom: '8px',
                        color: '#ffffff',
                        fontWeight: 'bold',
                      }}
                    >
                      {provider.name}
                    </label>
                    <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                      <input
                        type={visibleKeys[providerKey] ? 'text' : 'password'}
                        value={apiKeys[providerKey] || ''}
                        onChange={(e) => setApiKey(providerKey, e.target.value)}
                        placeholder={`Enter ${provider.name} API key...`}
                        style={{
                          flex: 1,
                          padding: '10px',
                          background: 'rgba(0, 0, 0, 0.5)',
                          border: '1px solid rgba(0, 255, 255, 0.3)',
                          borderRadius: '6px',
                          color: '#ffffff',
                          fontSize: '0.9rem',
                        }}
                      />
                      <button
                        onClick={() => toggleKeyVisibility(providerKey)}
                        style={{
                          background: 'transparent',
                          border: 'none',
                          color: '#ffffff',
                          cursor: 'pointer',
                          padding: '8px',
                        }}
                      >
                        {visibleKeys[providerKey] ? (
                          <EyeOff size={20} />
                        ) : (
                          <Eye size={20} />
                        )}
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  )
}

export default ApiKeyManager

