import React, { useState, useEffect } from 'react'
import { motion } from 'framer-motion'
import { Home, Settings, User, LogOut, Clock, X, Trophy, Sun, Moon, BookmarkCheck } from 'lucide-react'
import { useStore } from '../store/useStore'
import { getTheme } from '../utils/theme'
import axios from 'axios'
import { API_URL } from '../utils/config'
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
  const theme = useStore((state) => state.theme || 'dark')
  const toggleTheme = useStore((state) => state.toggleTheme)
  const setNavExpanded = useStore((state) => state.setNavExpanded)
  const clearViewingProfile = useStore((state) => state.clearViewingProfile)
  const [isHovered, setIsHovered] = useState(false)
  const [isExpanded, setIsExpanded] = useState(false)
  const [promptHistory, setPromptHistory] = useState([])
  const [showClearConfirm, setShowClearConfirm] = useState(false)
  
  const currentTheme = getTheme(theme)

  // Debug: Log when tab changes

  // Fetch prompt history
  useEffect(() => {
    if (currentUser?.id) {
      fetchPromptHistory()
    }
  }, [currentUser, statsRefreshTrigger])

  const fetchPromptHistory = async () => {
    try {
      const response = await axios.get(`${API_URL}/api/stats/${currentUser.id}/history`)
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
      await axios.delete(`${API_URL}/api/stats/${currentUser.id}/history`)
      setPromptHistory([])
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
      id: 'leaderboard',
      icon: Trophy,
      label: 'Leaderboard',
    },
    {
      id: 'saved',
      icon: BookmarkCheck,
      label: 'Saved',
    },
    {
      id: 'statistics',
      icon: User,
      label: 'Profile',
    },
    {
      id: 'settings',
      icon: Settings,
      label: 'Settings',
    },
  ]

  return (
    <motion.div
      onMouseEnter={() => {
        setIsHovered(true)
        setIsExpanded(true)
        setNavExpanded(true)
      }}
      onMouseLeave={() => {
        setIsHovered(false)
        setNavExpanded(false)
        setTimeout(() => setIsExpanded(false), 300)
      }}
      style={{
        position: 'fixed',
        left: 0,
        top: 0,
        height: '100vh',
        width: isExpanded ? '240px' : '60px',
        background: currentTheme.backgroundOverlay,
        borderRight: `1px solid ${currentTheme.borderLight}`,
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
            key={`nav-title-${theme}`}
            style={{
              fontSize: '1.3rem',
              fontWeight: 'bold',
              background: currentTheme.accentGradient,
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
              backgroundClip: 'text',
              color: currentTheme.accent,
              display: 'inline-block',
            }}
          >
            ArkiTek
          </div>
        ) : (
          <div
            style={{
              width: '36px',
              height: '36px',
              borderRadius: '50%',
              background: currentTheme.accentGradient,
            }}
          />
        )}
      </div>

      {/* Tabs */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '8px' }}>
        {tabs.map((tab) => {
          const Icon = tab.icon
          const isActive = activeTab === tab.id
          const [isTabHovered, setIsTabHovered] = useState(false)
          const shouldHighlight = isActive || isTabHovered
          
          return (
            <motion.button
              key={tab.id}
              onClick={() => {
                // Clear any viewed profile when navigating away from statistics
                if (tab.id !== 'statistics') clearViewingProfile()
                setActiveTab(tab.id)
              }}
              onMouseEnter={() => setIsTabHovered(true)}
              onMouseLeave={() => setIsTabHovered(false)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '16px',
                padding: '14px 20px',
                background: shouldHighlight
                  ? currentTheme.buttonBackgroundActive
                  : 'transparent',
                border: 'none',
                borderLeft: shouldHighlight
                  ? `3px solid ${currentTheme.accent}`
                  : '3px solid transparent',
                color: shouldHighlight ? currentTheme.accent : currentTheme.text,
                cursor: 'pointer',
                textAlign: 'left',
                width: '100%',
                position: 'relative',
                transition: 'all 0.2s ease',
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
                    background: currentTheme.backgroundOverlay,
                    border: `1px solid ${currentTheme.borderLight}`,
                    borderRadius: '6px',
                    padding: '8px 12px',
                    whiteSpace: 'nowrap',
                    pointerEvents: 'none',
                    zIndex: 200,
                    color: currentTheme.text,
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
            borderTop: `1px solid ${currentTheme.border}`,
            paddingTop: '16px',
            maxHeight: '300px',
            overflowY: 'auto',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Clock size={18} color={currentTheme.accent} />
              <h3 style={{ fontSize: '0.9rem', color: currentTheme.accent, fontWeight: '600', margin: 0 }}>
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
              promptHistory.slice(0, 10).map((prompt, index) => (
                <div
                  key={index}
                  style={{
                    padding: '8px 12px',
                    background: currentTheme.buttonBackground,
                    border: `1px solid ${currentTheme.border}`,
                    borderRadius: '6px',
                    fontSize: '0.75rem',
                    color: currentTheme.textSecondary,
                    cursor: 'pointer',
                    transition: 'all 0.2s ease',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.background = currentTheme.buttonBackgroundHover
                    e.currentTarget.style.whiteSpace = 'normal'
                    e.currentTarget.style.overflow = 'visible'
                    e.currentTarget.style.zIndex = '1000'
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.background = 'rgba(93, 173, 226, 0.05)'
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
              <p style={{ color: currentTheme.textMuted, fontSize: '0.75rem', fontStyle: 'italic', textAlign: 'center', padding: '8px' }}>
                No search history yet
              </p>
            )}
          </div>
        </div>
      )}

      {/* Theme Toggle Button */}
      <motion.button
        onClick={toggleTheme}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '16px',
          padding: '14px 20px',
          background: 'transparent',
          border: 'none',
          borderTop: `1px solid ${currentTheme.border}`,
          color: currentTheme.accent,
          cursor: 'pointer',
          textAlign: 'left',
          width: '100%',
          marginTop: 'auto',
          transition: 'all 0.2s ease',
        }}
        whileHover={{
          background: currentTheme.buttonBackgroundHover,
        }}
        whileTap={{ scale: 0.95 }}
      >
        {theme === 'dark' ? (
          <Sun size={24} style={{ flexShrink: 0 }} />
        ) : (
          <Moon size={24} style={{ flexShrink: 0 }} />
        )}
        {isExpanded && (
          <motion.span
            initial={{ opacity: 0, x: -10 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -10 }}
            style={{ fontSize: '1rem' }}
          >
            {theme === 'dark' ? 'Light Mode' : 'Dark Mode'}
          </motion.span>
        )}
      </motion.button>

      {/* Sign Out Button */}
      {currentUser && (
        <motion.button
          onClick={() => {
            // Clear server-side conversation context before signing out
            if (currentUser?.id) {
              axios.post(`${API_URL}/api/judge/clear-context`, {
                userId: currentUser.id
              }).catch(() => {})
              axios.post(`${API_URL}/api/model/clear-context`, {
                userId: currentUser.id
              }).catch(() => {})
            }
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
            borderTop: `1px solid ${currentTheme.border}`,
            color: '#ff6b6b',
            cursor: 'pointer',
            textAlign: 'left',
            width: '100%',
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
