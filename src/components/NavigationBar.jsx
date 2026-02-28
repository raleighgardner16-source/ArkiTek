import React, { useState, useEffect } from 'react'
import { motion } from 'framer-motion'
import { MessageSquare, Settings, User, LogOut, Trophy, Sun, Moon, History, MessageSquarePlus, ChevronLeft, ChevronRight, ShoppingBag, Info, Mail, X } from 'lucide-react'
import { useStore } from '../store/useStore'
import { getTheme } from '../utils/theme'
import api from '../utils/api'
import { API_URL } from '../utils/config'

const NavigationBar = () => {
  const activeTab = useStore((state) => state.activeTab || 'home')
  const setActiveTab = useStore((state) => state.setActiveTab)
  const currentUser = useStore((state) => state.currentUser)
  const clearCurrentUser = useStore((state) => state.clearCurrentUser)
  const clearResponses = useStore((state) => state.clearResponses)
  const clearLastSubmittedPrompt = useStore((state) => state.clearLastSubmittedPrompt)
  const setCurrentPrompt = useStore((state) => state.setCurrentPrompt)
  const theme = useStore((state) => state.theme || 'dark')
  const toggleTheme = useStore((state) => state.toggleTheme)
  const setNavExpanded = useStore((state) => state.setNavExpanded)
  const clearViewingProfile = useStore((state) => state.clearViewingProfile)
  // DISABLED: Social media features temporarily removed
  // const notificationCount = useStore((state) => state.notificationCount)
  // const setNotificationCount = useStore((state) => state.setNotificationCount)
  // const unreadMessageCount = useStore((state) => state.unreadMessageCount)
  // const setUnreadMessageCount = useStore((state) => state.setUnreadMessageCount)
  const [isExpanded, setIsExpanded] = useState(() => useStore.getState().isNavExpanded ?? true)
  const [showCollapseTooltip, setShowCollapseTooltip] = useState(false)
  const [showExpandTooltip, setShowExpandTooltip] = useState(false)
  const [showSupportPopup, setShowSupportPopup] = useState(false)
  
  const currentTheme = getTheme(theme)

  // DISABLED: Social media notification/message count fetching temporarily removed
  // useEffect(() => {
  //   if (!currentUser?.id) return
  //   const fetchCounts = () => {
  //     api.get(`${API_URL}/api/notifications/${currentUser.id}?limit=1`)
  //       .then(res => { setNotificationCount(res.data?.unreadCount || 0) }).catch(() => {})
  //     api.get(`${API_URL}/api/messages/unread/${currentUser.id}`)
  //       .then(res => { setUnreadMessageCount(res.data?.unreadCount || 0) }).catch(() => {})
  //   }
  //   fetchCounts()
  //   const interval = setInterval(fetchCounts, 30000)
  //   return () => clearInterval(interval)
  // }, [currentUser?.id])

  // Debug: Log when tab changes

  const setSummaryMinimized = useStore((state) => state.setSummaryMinimized)

  // When user is already on the home (chat) tab, clicking it again starts a fresh chat
  const handleNewChat = () => {
    // Finalize the active history entry before clearing (regenerates embedding with full conversation)
    const activeHistoryId = useStore.getState().currentHistoryId
    if (activeHistoryId && currentUser?.id) {
      api.post(`${API_URL}/api/history/finalize`, {
        historyId: activeHistoryId,
      }).catch(err => console.error('[History] Error finalizing:', err.message))
    }
    clearResponses()
    clearLastSubmittedPrompt()
    setCurrentPrompt('')
    // Minimize summary window
    if (setSummaryMinimized) setSummaryMinimized(true)
    // Clear server-side conversation context
    if (currentUser?.id) {
      api.post(`${API_URL}/api/judge/clear-context`, {}).catch(() => {})
      api.post(`${API_URL}/api/model/clear-context`, {}).catch(() => {})
    }
    setActiveTab('home')
  }

  // Dynamic label/icon: show "New Chat" when already on home tab, "Chat" otherwise
  const isOnChat = activeTab === 'home'

  const isFreePlan = currentUser?.plan === 'free_trial' && !currentUser?.stripeSubscriptionId

  const allTabs = [
    {
      id: 'home',
      icon: isOnChat ? MessageSquarePlus : MessageSquare,
      label: isOnChat ? 'New Chat' : 'Chat',
    },
    // DISABLED: Prompt Feed tab temporarily removed (social media feature)
    // {
    //   id: 'leaderboard',
    //   icon: Trophy,
    //   label: 'Prompt Feed',
    //   proOnly: true,
    // },
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
      id: 'store',
      icon: ShoppingBag,
      label: 'Store',
    },
    {
      id: 'settings',
      icon: Settings,
      label: 'Settings',
    },
  ]

  const tabs = isFreePlan ? allTabs.filter(t => !t.proOnly) : allTabs

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
              <div style={{ position: 'relative', flexShrink: 0 }}>
                <Icon size={24} />
                {/* DISABLED: Social media notification/message badges temporarily removed */}
              </div>
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

      {/* Customer Support Button */}
      <div style={{ position: 'relative', marginTop: 'auto' }}>
        <motion.button
          onClick={() => setShowSupportPopup(!showSupportPopup)}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '16px',
            padding: '14px 20px',
            background: showSupportPopup ? currentTheme.buttonBackgroundActive : 'transparent',
            border: 'none',
            borderTop: `1px solid ${currentTheme.border}`,
            color: currentTheme.accent,
            cursor: 'pointer',
            textAlign: 'left',
            width: '100%',
            transition: 'all 0.2s ease',
          }}
          whileHover={{
            background: currentTheme.buttonBackgroundHover,
          }}
          whileTap={{ scale: 0.95 }}
        >
          <Info size={24} style={{ flexShrink: 0 }} />
          {isExpanded && (
            <motion.span
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -10 }}
              style={{ fontSize: '1rem' }}
            >
              Support
            </motion.span>
          )}
        </motion.button>

        {showSupportPopup && (
          <motion.div
            initial={{ opacity: 0, y: 10, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 10, scale: 0.95 }}
            style={{
              position: 'absolute',
              bottom: '100%',
              left: isExpanded ? '10px' : '60px',
              marginBottom: '8px',
              width: '300px',
              background: currentTheme.backgroundOverlay,
              border: `1px solid ${currentTheme.borderLight}`,
              borderRadius: '12px',
              padding: '20px',
              zIndex: 300,
              backdropFilter: 'blur(20px)',
              boxShadow: '0 8px 32px rgba(0, 0, 0, 0.3)',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
              <span style={{
                fontSize: '0.95rem',
                fontWeight: '600',
                background: currentTheme.accentGradient,
                WebkitBackgroundClip: 'text',
                WebkitTextFillColor: 'transparent',
                backgroundClip: 'text',
              }}>
                Customer Support
              </span>
              <button
                onClick={() => setShowSupportPopup(false)}
                style={{
                  background: 'none',
                  border: 'none',
                  cursor: 'pointer',
                  color: currentTheme.textSecondary,
                  padding: '2px',
                  display: 'flex',
                  alignItems: 'center',
                  borderRadius: '4px',
                }}
              >
                <X size={16} />
              </button>
            </div>
            <p style={{
              color: currentTheme.textSecondary,
              fontSize: '0.85rem',
              lineHeight: '1.5',
              margin: '0 0 16px 0',
            }}>
              Please contact us if you have any issues or questions or want to tell us your experience so far! Feel free to give us any feedback on how we can make ArkiTek better!
            </p>
            <a
              href="mailto:support@arkitek.site"
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                color: currentTheme.accent,
                fontSize: '0.85rem',
                fontWeight: '500',
                textDecoration: 'none',
                padding: '10px 14px',
                borderRadius: '8px',
                background: currentTheme.buttonBackgroundActive,
                transition: 'opacity 0.2s ease',
              }}
              onMouseEnter={(e) => e.currentTarget.style.opacity = '0.8'}
              onMouseLeave={(e) => e.currentTarget.style.opacity = '1'}
            >
              <Mail size={16} />
              support@arkitek.site
            </a>
          </motion.div>
        )}
      </div>

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
              api.post(`${API_URL}/api/judge/clear-context`, {}).catch(() => {})
              api.post(`${API_URL}/api/model/clear-context`, {}).catch(() => {})
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

    </motion.div>
  )
}

export default NavigationBar
