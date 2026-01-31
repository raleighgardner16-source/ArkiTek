import React, { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { BarChart3, X, TrendingUp } from 'lucide-react'
import { useStore } from '../store/useStore'

const StatsPanel = () => {
  const [isOpen, setIsOpen] = useState(false)
  const stats = useStore((state) => state.stats)

  return (
    <>
      <motion.button
        data-stats-button
        onClick={() => setIsOpen(true)}
        style={{
          position: 'fixed',
          top: '20px',
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
        <BarChart3 size={20} />
        Stats
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
                maxWidth: '800px',
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
                Your Statistics
              </h2>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
                {/* Total Prompts */}
                <div
                  style={{
                    background: 'rgba(0, 255, 255, 0.1)',
                    border: '1px solid rgba(0, 255, 255, 0.3)',
                    borderRadius: '12px',
                    padding: '20px',
                  }}
                >
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '12px',
                      marginBottom: '12px',
                    }}
                  >
                    <TrendingUp size={24} color="#00FF00" />
                    <h3 style={{ fontSize: '1.3rem', color: '#ffffff' }}>
                      Total Prompts
                    </h3>
                  </div>
                  <p
                    style={{
                      fontSize: '2.5rem',
                      fontWeight: 'bold',
                      background: 'linear-gradient(90deg, #00FFFF, #00FF00)',
                      WebkitBackgroundClip: 'text',
                      WebkitTextFillColor: 'transparent',
                    }}
                  >
                    {stats.totalPrompts}
                  </p>
                </div>

                {/* Average Rating */}
                <div
                  style={{
                    background: 'rgba(0, 255, 255, 0.1)',
                    border: '1px solid rgba(0, 255, 255, 0.3)',
                    borderRadius: '12px',
                    padding: '20px',
                  }}
                >
                  <h3 style={{ fontSize: '1.3rem', color: '#ffffff', marginBottom: '12px' }}>
                    Average Rating
                  </h3>
                  <p
                    style={{
                      fontSize: '2.5rem',
                      fontWeight: 'bold',
                      background: 'linear-gradient(90deg, #00FFFF, #00FF00)',
                      WebkitBackgroundClip: 'text',
                      WebkitTextFillColor: 'transparent',
                    }}
                  >
                    {stats.averageRating.toFixed(2)} / 5.00
                  </p>
                </div>

                {/* Prompts by Model */}
                <div
                  style={{
                    background: 'rgba(0, 255, 255, 0.1)',
                    border: '1px solid rgba(0, 255, 255, 0.3)',
                    borderRadius: '12px',
                    padding: '20px',
                  }}
                >
                  <h3 style={{ fontSize: '1.3rem', color: '#ffffff', marginBottom: '16px' }}>
                    Prompts by Model
                  </h3>
                  {Object.keys(stats.promptsByModel).length > 0 ? (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                      {Object.entries(stats.promptsByModel)
                        .sort((a, b) => b[1] - a[1])
                        .map(([model, count]) => (
                          <div
                            key={model}
                            style={{
                              display: 'flex',
                              justifyContent: 'space-between',
                              alignItems: 'center',
                            }}
                          >
                            <span style={{ color: '#cccccc' }}>{model}</span>
                            <span
                              style={{
                                color: '#00FF00',
                                fontWeight: 'bold',
                              }}
                            >
                              {count}
                            </span>
                          </div>
                        ))}
                    </div>
                  ) : (
                    <p style={{ color: '#666' }}>No data yet</p>
                  )}
                </div>

                {/* Prompts by Category */}
                <div
                  style={{
                    background: 'rgba(0, 255, 255, 0.1)',
                    border: '1px solid rgba(0, 255, 255, 0.3)',
                    borderRadius: '12px',
                    padding: '20px',
                  }}
                >
                  <h3 style={{ fontSize: '1.3rem', color: '#ffffff', marginBottom: '16px' }}>
                    Prompts by Category
                  </h3>
                  {Object.keys(stats.promptsByCategory).length > 0 ? (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                      {Object.entries(stats.promptsByCategory)
                        .sort((a, b) => b[1] - a[1])
                        .map(([category, count]) => (
                          <div
                            key={category}
                            style={{
                              display: 'flex',
                              justifyContent: 'space-between',
                              alignItems: 'center',
                            }}
                          >
                            <span style={{ color: '#cccccc' }}>
                              {category.charAt(0).toUpperCase() + category.slice(1)}
                            </span>
                            <span
                              style={{
                                color: '#00FF00',
                                fontWeight: 'bold',
                              }}
                            >
                              {count}
                            </span>
                          </div>
                        ))}
                    </div>
                  ) : (
                    <p style={{ color: '#666' }}>No data yet</p>
                  )}
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  )
}

export default StatsPanel

