import React, { useState, useEffect } from 'react'
import { motion } from 'framer-motion'
import { Home, Settings, Eye, BarChart3, LogOut, Clock, X } from 'lucide-react'
import { useStore } from '../store/useStore'
import axios from 'axios'
import ConfirmationModal from './ConfirmationModal'

const NavigationBar = () => {
  const activeTab = useStore((state) => state.activeTab || 'home')
  const setActiveTab = useStore((state) => state.setActiveTab)
  const currentUser = useStore((state) => state.currentUser)
  const clearCurrentUser = useStore((state) => state.clearCurrentUser)
  const clearSelectedModels = useStore((state) => state.clearSelectedModels)
  const clearResponses = useStore((state) => state.clearResponses)
  const setCurrentPrompt = useStore((state) => state.setCurrentPrompt)
  const statsRefreshTrigger = useStore((state) => state.statsRefreshTrigger)
  const [isHovered, setIsHovered] = useState(false)
  const [isExpanded, setIsExpanded] = useState(false)
  const [promptHistory, setPromptHistory] = useState([])
  const [showClearConfirm, setShowClearConfirm] = useState(false)

  // Debug: Log when tab changes
  React.useEffect(() => {
    console.log('Active tab:', activeTab)
  }, [activeTab])

  // Fetch prompt history
  useEffect(() => {
    if (currentUser?.id) {
      fetchPromptHistory()
    }
  }, [currentUser, statsRefreshTrigger])

  const fetchPromptHistory = async () => {
    try {
      const response = await axios.get(`http://localhost:3001/api/stats/${currentUser.id}/history`)
      setPromptHistory(response.data.prompts || [])
    } catch (error) {
      console.error('Error fetching prompt history:', error)
      setPromptHistory([])
    }
  }

  const handleClearPromptHistory = () => {
    setShowClearConfirm(true)
  }

  const clearPromptHistory = async () => {
    if (!currentUser?.id) {
      console.error('Cannot clear history: No user ID')
      return
    }
    
    try {
      console.log(`[Clear History] Clearing history for user: ${currentUser.id}`)
      const response = await axios.delete(`http://localhost:3001/api/stats/${currentUser.id}/history`)
      console.log('[Clear History] Response:', response.data)
      setPromptHistory([])
      console.log('[Clear History] Prompt history cleared successfully')
    } catch (error) {
      console.error('[Clear History] Error clearing prompt history:', error)
      console.error('[Clear History] Error details:', {
        message: error.message,
        response: error.response?.data,
        status: error.response?.status,
        statusText: error.response?.statusText
      })
      alert(`Failed to clear search history: ${error.response?.data?.error || error.message || 'Unknown error'}`)
    }
  }

  const tabs = [
    {
      id: 'home',
      icon: Home,
      label: 'Home',
    },
    {
      id: 'settings',
      icon: Settings,
      label: 'Settings',
    },
    {
      id: 'vr',
      icon: Eye,
      label: 'VR',
    },
    {
      id: 'statistics',
      icon: BarChart3,
      label: 'Statistics',
    },
  ]

  return (
    <motion.div
      onMouseEnter={() => {
        setIsHovered(true)
        setIsExpanded(true)
      }}
      onMouseLeave={() => {
        setIsHovered(false)
        setTimeout(() => setIsExpanded(false), 300)
      }}
      style={{
        position: 'fixed',
        left: 0,
        top: 0,
        height: '100vh',
        width: isExpanded ? '240px' : '60px',
        background: 'rgba(0, 0, 0, 0.9)',
        borderRight: '1px solid rgba(0, 255, 255, 0.3)',
        zIndex: 150,
        display: 'flex',
        flexDirection: 'column',
        padding: '20px 0',
        transition: 'width 0.3s ease',
        backdropFilter: 'blur(10px)',
      }}
    >
      {/* Logo/Header */}
      <div
        style={{
          padding: '0 20px',
          marginBottom: '30px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: isExpanded ? 'flex-start' : 'center',
        }}
      >
        {isExpanded ? (
          <div
            style={{
              fontSize: '1.3rem',
              fontWeight: 'bold',
              background: 'linear-gradient(90deg, #00FFFF, #00FF00)',
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
            }}
          >
            ArkTek
          </div>
        ) : (
          <div
            style={{
              width: '36px',
              height: '36px',
              borderRadius: '50%',
              background: 'linear-gradient(90deg, #00FFFF, #00FF00)',
            }}
          />
        )}
      </div>

      {/* Tabs */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '8px' }}>
        {tabs.map((tab) => {
          const Icon = tab.icon
          const isActive = activeTab === tab.id
          return (
            <motion.button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '16px',
                padding: '14px 20px',
                background: isActive
                  ? 'rgba(0, 255, 255, 0.2)'
                  : 'transparent',
                border: 'none',
                borderLeft: isActive
                  ? '3px solid #00FFFF'
                  : '3px solid transparent',
                color: isActive ? '#00FFFF' : '#ffffff',
                cursor: 'pointer',
                textAlign: 'left',
                width: '100%',
                position: 'relative',
                transition: 'all 0.2s ease',
              }}
              whileHover={{
                background: isActive
                  ? 'rgba(0, 255, 255, 0.25)'
                  : 'rgba(0, 255, 255, 0.1)',
              }}
              whileTap={{ scale: 0.95 }}
            >
              <Icon size={24} style={{ flexShrink: 0 }} />
              {isExpanded && (
                <motion.span
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -10 }}
                  style={{ fontSize: '1rem', fontWeight: isActive ? '600' : '400' }}
                >
                  {tab.label}
                </motion.span>
              )}
              {isHovered && !isExpanded && (
                <motion.div
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  style={{
                    position: 'absolute',
                    left: '70px',
                    background: 'rgba(0, 0, 0, 0.95)',
                    border: '1px solid rgba(0, 255, 255, 0.3)',
                    borderRadius: '6px',
                    padding: '8px 12px',
                    whiteSpace: 'nowrap',
                    pointerEvents: 'none',
                    zIndex: 200,
                  }}
                >
                  {tab.label}
                </motion.div>
              )}
            </motion.button>
          )
        })}
      </div>

      {/* Search History Section */}
      {currentUser && isExpanded && (
        <div
          style={{
            marginTop: 'auto',
            marginBottom: '16px',
            padding: '0 20px',
            borderTop: '1px solid rgba(0, 255, 255, 0.2)',
            paddingTop: '16px',
            maxHeight: '300px',
            overflowY: 'auto',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Clock size={18} color="#00FFFF" />
              <h3 style={{ fontSize: '0.9rem', color: '#00FFFF', fontWeight: '600', margin: 0 }}>
                Search History
              </h3>
            </div>
            {promptHistory.length > 0 && (
              <button
                onClick={(e) => {
                  e.preventDefault()
                  e.stopPropagation()
                  handleClearPromptHistory()
                }}
                type="button"
                style={{
                  background: 'transparent',
                  border: '1px solid rgba(255, 107, 107, 0.3)',
                  borderRadius: '4px',
                  padding: '4px 8px',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '4px',
                  transition: 'all 0.2s ease',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = 'rgba(255, 107, 107, 0.1)'
                  e.currentTarget.style.borderColor = 'rgba(255, 107, 107, 0.5)'
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = 'transparent'
                  e.currentTarget.style.borderColor = 'rgba(255, 107, 107, 0.3)'
                }}
                title="Clear search history"
              >
                <X size={14} color="#ff6b6b" />
                <span style={{ color: '#ff6b6b', fontSize: '0.7rem' }}>Clear</span>
              </button>
            )}
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
            {promptHistory.length > 0 ? (
              promptHistory.slice(0, 12).map((prompt, index) => (
                <div
                  key={index}
                  style={{
                    padding: '8px 12px',
                    background: 'rgba(0, 255, 255, 0.05)',
                    border: '1px solid rgba(0, 255, 255, 0.1)',
                    borderRadius: '6px',
                    fontSize: '0.75rem',
                    color: '#cccccc',
                    cursor: 'pointer',
                    transition: 'all 0.2s ease',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.background = 'rgba(0, 255, 255, 0.1)'
                    e.currentTarget.style.whiteSpace = 'normal'
                    e.currentTarget.style.overflow = 'visible'
                    e.currentTarget.style.zIndex = '1000'
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.background = 'rgba(0, 255, 255, 0.05)'
                    e.currentTarget.style.whiteSpace = 'nowrap'
                    e.currentTarget.style.overflow = 'hidden'
                    e.currentTarget.style.zIndex = 'auto'
                  }}
                  onClick={() => {
                    setActiveTab('home')
                    // Set the prompt in the store
                    useStore.getState().setCurrentPrompt(prompt.text)
                  }}
                >
                  {prompt.text || 'No text'}
                </div>
              ))
            ) : (
              <p style={{ color: '#888888', fontSize: '0.75rem', fontStyle: 'italic', textAlign: 'center', padding: '8px' }}>
                No search history yet
              </p>
            )}
          </div>
        </div>
      )}

      {/* Sign Out Button */}
      {currentUser && (
        <motion.button
          onClick={() => {
            clearCurrentUser()
            clearSelectedModels()
            clearResponses()
            setCurrentPrompt('')
            window.location.reload()
          }}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '16px',
            padding: '14px 20px',
            background: 'transparent',
            border: 'none',
            borderTop: '1px solid rgba(0, 255, 255, 0.2)',
            color: '#ff6b6b',
            cursor: 'pointer',
            textAlign: 'left',
            width: '100%',
            marginTop: 'auto',
            transition: 'all 0.2s ease',
          }}
          whileHover={{
            background: 'rgba(255, 107, 107, 0.1)',
          }}
          whileTap={{ scale: 0.95 }}
        >
          <LogOut size={24} style={{ flexShrink: 0 }} />
          {isExpanded && (
            <motion.span
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -10 }}
              style={{ fontSize: '1rem' }}
            >
              Sign Out
            </motion.span>
          )}
        </motion.button>
      )}

      {/* Confirmation Modal */}
      <ConfirmationModal
        isOpen={showClearConfirm}
        onClose={() => setShowClearConfirm(false)}
        onConfirm={clearPromptHistory}
        title="Clear Search History"
        message="Are you sure you want to clear your search history? This action cannot be undone."
        confirmText="Clear History"
        cancelText="Cancel"
        confirmColor="#ff6b6b"
      />
    </motion.div>
  )
}

export default NavigationBar
