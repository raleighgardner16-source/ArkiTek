import React, { useState, useEffect } from 'react'
import { motion } from 'framer-motion'
import { MessageSquare, Settings, User, LogOut, Trophy, Sun, Moon, History, MessageSquarePlus, ChevronLeft, ChevronRight, ShoppingBag, Info, Mail, X } from 'lucide-react'
import { useStore } from '../store/useStore'
import { getTheme } from '../utils/theme'
import { spacing, fontSize, fontWeight, radius, zIndex, transition, layout, sx, createStyles } from '../utils/styles'
import api from '../utils/api'

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
  const s = createStyles(currentTheme)

  // DISABLED: Social media notification/message count fetching temporarily removed
  // useEffect(() => {
  //   if (!currentUser?.id) return
  //   const fetchCounts = () => {
  //     api.get(`/notifications/${currentUser.id}?limit=1`)
  //       .then(res => { setNotificationCount(res.data?.unreadCount || 0) }).catch(() => {})
  //     api.get(`/messages/unread/${currentUser.id}`)
  //       .then(res => { setUnreadMessageCount(res.data?.unreadCount || 0) }).catch(() => {})
  //   }
  //   fetchCounts()
  //   const interval = setInterval(fetchCounts, 30000)
  //   return () => clearInterval(interval)
  // }, [currentUser?.id])

  // Debug: Log when tab changes

  const setSummaryMinimized = useStore((state) => state.setSummaryMinimized)

  // When user is already on the home (chat) tab, clicking it again starts a fresh chat
  const handleNewChat = (): void => {
    // Finalize the active history entry before clearing (regenerates embedding with full conversation)
    const activeHistoryId = useStore.getState().currentHistoryId
    if (activeHistoryId && currentUser?.id) {
      api.post('/history/finalize', {
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
      api.post('/judge/clear-context', {}).catch(() => {})
      api.post('/model/clear-context', {}).catch(() => {})
    }
    setActiveTab('home')
  }

  // Dynamic label/icon: show "New Chat" when already on home tab, "Chat" otherwise
  const isOnChat = activeTab === 'home'

  const isFreePlan = currentUser?.plan === 'free_trial' && !currentUser?.stripeSubscriptionId

  const allTabs: Array<{ id: string; icon: any; label: string; proOnly?: boolean; action?: boolean }> = [
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
      style={sx(layout.flexCol, {
        position: 'fixed',
        left: 0,
        top: 0,
        height: '100vh',
        width: isExpanded ? '240px' : '60px',
        background: currentTheme.backgroundOverlay,
        borderRight: `1px solid ${currentTheme.borderLight}`,
        zIndex: zIndex.nav,
        padding: `${spacing['2xl']} 0`,
        transition: 'width 0.3s ease',
        backdropFilter: 'blur(10px)',
      })}
    >
      {/* Logo/Header + Collapse Toggle */}
      <div
        style={sx(layout.flexRow, {
          padding: `0 ${spacing['2xl']}`,
          marginBottom: spacing['4xl'],
          justifyContent: isExpanded ? 'space-between' : 'center',
        })}
      >
        {isExpanded ? (
          <>
            <div
              key={`nav-title-${theme}`}
              style={sx(s.gradientText, { fontSize: fontSize['5xl'], fontWeight: fontWeight.bold })}
            >
              ArkiTek
            </div>
            {/* Collapse arrow */}
            <div style={{ position: 'relative', display: 'inline-flex' }}>
              <button
                onClick={toggleNavExpanded}
                onMouseEnter={() => setShowCollapseTooltip(true)}
                onMouseLeave={() => setShowCollapseTooltip(false)}
                style={sx(s.iconButton, { color: currentTheme.textSecondary, borderRadius: radius.sm })}
              >
                <ChevronLeft size={20} />
              </button>
              {showCollapseTooltip && (
                <div style={sx(s.tooltip, {
                  top: '100%',
                  left: '50%',
                  transform: 'translateX(-50%)',
                  marginTop: spacing.sm,
                })}>
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
              style={sx(s.iconButton, { color: currentTheme.textSecondary, borderRadius: radius.sm })}
            >
              <ChevronRight size={20} />
            </button>
            {showExpandTooltip && (
              <div style={sx(s.tooltip, {
                left: '100%',
                top: '50%',
                transform: 'translateY(-50%)',
                marginLeft: spacing.md,
              })}>
                Expand sidebar
              </div>
            )}
          </div>
        )}
      </div>

      {/* Tabs */}
      <div style={sx(layout.flexCol, { flex: 1, gap: spacing.md })}>
        {tabs.map((tab) => {
          const Icon = tab.icon
          const isActive = tab.action ? false : activeTab === tab.id
          const [isTabHovered, setIsTabHovered] = useState(false)
          const shouldHighlight = isActive || isTabHovered
          
          return (
            <motion.button
              key={tab.id}
              onClick={() => {
                if (tab.id === 'home' && activeTab === 'home') {
                  handleNewChat()
                  return
                }
                if (tab.id !== 'statistics') clearViewingProfile()
                setActiveTab(tab.id)
              }}
              onMouseEnter={() => setIsTabHovered(true)}
              onMouseLeave={() => setIsTabHovered(false)}
              style={sx(s.navItem, {
                background: shouldHighlight
                  ? currentTheme.buttonBackgroundActive
                  : 'transparent',
                borderLeft: shouldHighlight
                  ? `3px solid ${currentTheme.accent}`
                  : '3px solid transparent',
                color: shouldHighlight ? currentTheme.accent : currentTheme.text,
                position: 'relative',
              })}
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
                  style={{ fontSize: fontSize['2xl'], fontWeight: isActive ? fontWeight.semibold : fontWeight.normal }}
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
                    borderRadius: radius.sm,
                    padding: `${spacing.md} ${spacing.lg}`,
                    whiteSpace: 'nowrap',
                    pointerEvents: 'none',
                    zIndex: zIndex.tooltip,
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
          style={sx(s.navItem, {
            background: showSupportPopup ? currentTheme.buttonBackgroundActive : 'transparent',
            borderTop: `1px solid ${currentTheme.border}`,
            color: currentTheme.accent,
          })}
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
              style={{ fontSize: fontSize['2xl'] }}
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
            style={sx(s.cardElevated, {
              position: 'absolute',
              bottom: '100%',
              left: isExpanded ? '10px' : '60px',
              marginBottom: spacing.md,
              width: '300px',
              zIndex: zIndex.popup,
              borderRadius: radius.xl,
              padding: spacing['2xl'],
            })}
          >
            <div style={sx(layout.spaceBetween, { marginBottom: spacing.lg })}>
              <span style={sx(s.gradientText, { fontSize: fontSize.xl, fontWeight: fontWeight.semibold })}>
                Customer Support
              </span>
              <button
                onClick={() => setShowSupportPopup(false)}
                style={sx(s.iconButton, { color: currentTheme.textSecondary, padding: spacing['2xs'] })}
              >
                <X size={16} />
              </button>
            </div>
            <p style={{
              color: currentTheme.textSecondary,
              fontSize: fontSize.base,
              lineHeight: '1.5',
              margin: `0 0 ${spacing.xl} 0`,
            }}>
              Please contact us if you have any issues or questions or want to tell us your experience so far! Feel free to give us any feedback on how we can make ArkiTek better!
            </p>
            <a
              href="mailto:support@arkitek.site"
              style={sx(layout.flexRow, {
                gap: spacing.md,
                color: currentTheme.accent,
                fontSize: fontSize.base,
                fontWeight: fontWeight.medium,
                textDecoration: 'none',
                padding: `10px 14px`,
                borderRadius: radius.md,
                background: currentTheme.buttonBackgroundActive,
                transition: transition.normal,
              })}
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
        style={sx(s.navItem, {
          borderTop: `1px solid ${currentTheme.border}`,
          color: currentTheme.accent,
        })}
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
            style={{ fontSize: fontSize['2xl'] }}
          >
            {theme === 'dark' ? 'Light Mode' : 'Dark Mode'}
          </motion.span>
        )}
      </motion.button>

      {/* Sign Out Button */}
      {currentUser && (
        <motion.button
          onClick={() => {
            if (currentUser?.id) {
              api.post('/judge/clear-context', {}).catch(() => {})
              api.post('/model/clear-context', {}).catch(() => {})
            }
            clearCurrentUser()
            clearResponses()
            setCurrentPrompt('')
            window.location.reload()
          }}
          style={sx(s.navItem, {
            borderTop: `1px solid ${currentTheme.border}`,
            color: currentTheme.error,
          })}
          whileHover={{
            background: currentTheme.errorMuted,
          }}
          whileTap={{ scale: 0.95 }}
        >
          <LogOut size={24} style={{ flexShrink: 0 }} />
          {isExpanded && (
            <motion.span
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -10 }}
              style={{ fontSize: fontSize['2xl'] }}
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
