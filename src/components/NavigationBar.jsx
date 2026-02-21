import React, { useState, useEffect } from 'react'
import { motion } from 'framer-motion'
import { MessageSquare, Settings, User, LogOut, Clock, X, Trophy, Sun, Moon, History, MessageSquarePlus, ChevronLeft, ChevronRight } from 'lucide-react'
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
  const clearResponses = useStore((state) => state.clearResponses)
  const setCurrentPrompt = useStore((state) => state.setCurrentPrompt)
  const statsRefreshTrigger = useStore((state) => state.statsRefreshTrigger)
  const theme = useStore((state) => state.theme || 'dark')
  const toggleTheme = useStore((state) => state.toggleTheme)
  const setNavExpanded = useStore((state) => state.setNavExpanded)
  const clearViewingProfile = useStore((state) => state.clearViewingProfile)
  const [isExpanded, setIsExpanded] = useState(true) // Nav starts expanded by default
  const [showCollapseTooltip, setShowCollapseTooltip] = useState(false)
  const [showExpandTooltip, setShowExpandTooltip] = useState(false)
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

  const setSummaryMinimized = useStore((state) => state.setSummaryMinimized)

  // When user is already on the home (chat) tab, clicking it again starts a fresh chat
  const handleNewChat = () => {
    // Finalize the active history entry before clearing (regenerates embedding with full conversation)
    const activeHistoryId = useStore.getState().currentHistoryId
    if (activeHistoryId && currentUser?.id) {
      axios.post(`${API_URL}/api/history/finalize`, {
        historyId: activeHistoryId,
        userId: currentUser.id,
      }).catch(err => console.error('[History] Error finalizing:', err.message))
    }
    clearResponses()
    setCurrentPrompt('')
    // Minimize summary window
    if (setSummaryMinimized) setSummaryMinimized(true)
    // Clear server-side conversation context
    if (currentUser?.id) {
      axios.post(`${API_URL}/api/judge/clear-context`, { userId: currentUser.id }).catch(() => {})
      axios.post(`${API_URL}/api/model/clear-context`, { userId: currentUser.id }).catch(() => {})
    }
    setActiveTab('home')
  }

  // Dynamic label/icon: show "New Chat" when already on home tab, "Chat" otherwise
  const isOnChat = activeTab === 'home'

  const tabs = [
    {
      id: 'home',
      icon: isOnChat ? MessageSquarePlus : MessageSquare,
      label: isOnChat ? 'New Chat' : 'Chat',
    },
    {
      id: 'leaderboard',
      icon: Trophy,
      label: 'Prompt Feed',
    },
    {
      id: 'saved',
      icon: History,
      label: 'History',
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

  const toggleNavExpanded = () => {
    const next = !isExpanded
    setIsExpanded(next)
    setNavExpanded(next)
    // Clear tooltips so they don't stick after the button unmounts mid-hover
    setShowCollapseTooltip(false)
    setShowExpandTooltip(false)
  }

  // Sync store on mount
  useEffect(() => {
    setNavExpanded(isExpanded)
  }, [])

  return (
    <motion.div
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
      {/* Logo/Header + Collapse Toggle */}
      <div
        style={{
          padding: '0 20px',
          marginBottom: '30px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: isExpanded ? 'space-between' : 'center',
        }}
      >
        {isExpanded ? (
          <>
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
            {/* Collapse arrow */}
            <div style={{ position: 'relative', display: 'inline-flex' }}>
              <button
                onClick={toggleNavExpanded}
                onMouseEnter={() => setShowCollapseTooltip(true)}
                onMouseLeave={() => setShowCollapseTooltip(false)}
                style={{
                  background: 'none',
                  border: 'none',
                  cursor: 'pointer',
                  color: currentTheme.textSecondary,
                  padding: '4px',
                  borderRadius: '6px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  transition: 'all 0.2s ease',
                }}
              >
                <ChevronLeft size={20} />
              </button>
              {showCollapseTooltip && (
                <div style={{
                  position: 'absolute',
                  top: '100%',
                  left: '50%',
                  transform: 'translateX(-50%)',
                  marginTop: '6px',
                  background: 'rgba(0, 0, 0, 0.85)',
                  border: '1px solid rgba(255, 255, 255, 0.1)',
                  borderRadius: '6px',
                  padding: '5px 10px',
                  whiteSpace: 'nowrap',
                  zIndex: 200,
                  color: '#ffffff',
                  fontSize: '0.7rem',
                  pointerEvents: 'none',
                }}>
                  Minimize sidebar
                </div>
              )}
            </div>
          </>
        ) : (
          <div style={{ position: 'relative', display: 'inline-flex' }}>
            <button
              onClick={toggleNavExpanded}
              onMouseEnter={() => setShowExpandTooltip(true)}
              onMouseLeave={() => setShowExpandTooltip(false)}
              style={{
                background: 'none',
                border: 'none',
                cursor: 'pointer',
                color: currentTheme.textSecondary,
                padding: '4px',
                borderRadius: '6px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                transition: 'all 0.2s ease',
              }}
            >
              <ChevronRight size={20} />
            </button>
            {showExpandTooltip && (
              <div style={{
                position: 'absolute',
                left: '100%',
                top: '50%',
                transform: 'translateY(-50%)',
                marginLeft: '8px',
                background: 'rgba(0, 0, 0, 0.85)',
                border: '1px solid rgba(255, 255, 255, 0.1)',
                borderRadius: '6px',
                padding: '5px 10px',
                whiteSpace: 'nowrap',
                zIndex: 200,
                color: '#ffffff',
                fontSize: '0.7rem',
                pointerEvents: 'none',
              }}>
                Expand sidebar
              </div>
            )}
          </div>
        )}
      </div>

      {/* Tabs */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '8px' }}>
        {tabs.map((tab) => {
          const Icon = tab.icon
          const isActive = tab.action ? false : activeTab === tab.id
          const [isTabHovered, setIsTabHovered] = useState(false)
          const shouldHighlight = isActive || isTabHovered
          
          return (
            <motion.button
              key={tab.id}
              onClick={() => {
                // If already on chat tab, start a fresh conversation
                if (tab.id === 'home' && activeTab === 'home') {
                  handleNewChat()
                  return
                }
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
              {!isExpanded && isTabHovered && (
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
            clearResponses()
            setCurrentPrompt('')
            // Note: selectedModels and autoSmartProviders are NOT cleared —
            // they are saved on the server and will be restored on next sign-in
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
