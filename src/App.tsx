import React, { useEffect, useState } from 'react'
import { Routes, Route, Navigate, useNavigate, useLocation } from 'react-router-dom'
import { AnimatePresence, motion } from 'framer-motion'
import { ShoppingBag } from 'lucide-react'
import { useStore } from './store/useStore'
import { usePromptSubmission } from './hooks/usePromptSubmission'
import { useSummaryGeneration } from './hooks/useSummaryGeneration'
import { getTheme } from './utils/theme'
import api from './utils/api'
import WelcomeScreen from './components/WelcomeScreen'
import ResponseComparison from './components/ResponseComparison'
import NavigationBar from './components/NavigationBar'
import MainView from './components/MainView'
import SettingsView from './components/SettingsView'
import StatisticsView from './components/StatisticsView'
import SummaryWindow from './components/SummaryWindow'
import AuthView from './components/AuthView'
import SubscriptionGate from './components/SubscriptionGate'
import AdminView from './components/AdminView'
import { SectionErrorBoundary } from './components/SectionErrorBoundary'
import SavedConversationsView from './components/SavedConversationsView'
import LeaderboardView from './components/LeaderboardView'
import LandingPage from './components/LandingPage'
import TermsOfService from './components/TermsOfService'
import PrivacyPolicy from './components/PrivacyPolicy'

function App() {
  // Track store hydration from localStorage — prevents flash of wrong page on load
  const [hasHydrated, setHasHydrated] = useState(useStore.persist.hasHydrated())
  useEffect(() => {
    const unsub = useStore.persist.onFinishHydration(() => setHasHydrated(true))
    return unsub
  }, [])

  const navigate = useNavigate()
  const location = useLocation()

  const showWelcome = useStore((state) => state.showWelcome)
  const currentUser = useStore((state) => state.currentUser)
  const clearCurrentUser = useStore((state) => state.clearCurrentUser)
  const theme = useStore((state) => state.theme || 'dark')
  const currentTheme = getTheme(theme)
  const activeTab = useStore((state) => state.activeTab || 'home')
  const setActiveTab = useStore((state) => state.setActiveTab)
  const isNavExpanded = useStore((state) => state.isNavExpanded)

  const isAdminRoute = location.pathname === '/admin' || location.pathname === '/admin/'

  const [landingPlan, setLandingPlan] = useState<string | null>(null)
  const [isUserAdmin, setIsUserAdmin] = useState(false)

  // ── Hooks for prompt submission & summary generation ──────────────
  const { isLoading, handleCancelPrompt: cancelSubmission, clearAllWindows } = usePromptSubmission()
  const { isGeneratingSummary, resetSummaryState } = useSummaryGeneration({ isLoading })

  const handleCancelPrompt = () => {
    cancelSubmission()
    resetSummaryState()
  }

  // ── Navigation helper for public pages ────────────────────────────
  const navigatePublic = (page: string, plan?: string) => {
    if (plan) setLandingPlan(plan)
    const pathMap: Record<string, string> = {
      landing: '/',
      signin: '/signin',
      signup: '/signup',
      terms: '/terms',
      privacy: '/privacy',
    }
    navigate(pathMap[page] || '/')
    window.scrollTo(0, 0)
  }

  // Handle verify-email links even when a user is already logged in
  useEffect(() => {
    if (location.pathname === '/verify-email' && currentUser) {
      console.log('[App] Verification link detected while logged in — signing out stale session')
      clearCurrentUser()
    }
  }, [location.pathname])

  // Sync user timezone to the server on mount
  useEffect(() => {
    if (!currentUser?.id) return
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone
    if (!tz) return
    api.post('/auth/update-timezone', { timezone: tz }).catch(() => {})
  }, [currentUser?.id])

  // Check if current user is an admin
  useEffect(() => {
    if (currentUser?.id) {
      api
        .get('/admin/check')
        .then((res) => setIsUserAdmin(res.data.isAdmin === true))
        .catch(() => setIsUserAdmin(false))
    } else {
      setIsUserAdmin(false)
    }
  }, [currentUser?.id])

  // Keep body styled to match the active theme
  useEffect(() => {
    document.body.style.background = currentTheme.background
    document.body.style.color = currentTheme.text
  }, [theme, currentTheme])

  // ── Loading screen while store rehydrates ─────────────────────────
  if (!hasHydrated) {
    return (
      <div style={{
        width: '100vw', height: '100vh', display: 'flex',
        alignItems: 'center', justifyContent: 'center',
        background: 'linear-gradient(135deg, #0a0a0a 0%, #1a1a2e 100%)',
      }}>
        <div style={{
          width: '40px', height: '40px',
          border: '3px solid rgba(255, 255, 255, 0.1)',
          borderTopColor: 'rgba(255, 255, 255, 0.6)',
          borderRadius: '50%', animation: 'spin 0.8s linear infinite',
        }} />
        <style>{`@keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }`}</style>
      </div>
    )
  }

  // ── Authenticated app shell ───────────────────────────────────────
  const renderAuthenticatedApp = () => {
    if (!currentUser) return null

    if (isAdminRoute) {
      return (
        <div style={{ width: '100vw', height: '100vh', background: 'rgba(0, 0, 0, 0.95)' }}>
          <SectionErrorBoundary sectionName="Admin"><AdminView /></SectionErrorBoundary>
        </div>
      )
    }

    const subStatus = currentUser.subscriptionStatus
    const isWithinPaidPeriod = currentUser.subscriptionRenewalDate && new Date(currentUser.subscriptionRenewalDate) > new Date()
    const isCanceledOrPaused = subStatus === 'canceled' || subStatus === 'paused'

    if (subStatus === 'pending_verification' && !isUserAdmin) {
      clearCurrentUser()
      return null
    }

    const needsSubscriptionGate = !isCanceledOrPaused && subStatus !== 'active' && subStatus !== 'trialing'
    if (needsSubscriptionGate && !isUserAdmin) {
      return (
        <SectionErrorBoundary sectionName="Subscription">
          <SubscriptionGate currentUser={currentUser} />
        </SectionErrorBoundary>
      )
    }

    const subscriptionRestricted = isCanceledOrPaused && !isWithinPaidPeriod && !isUserAdmin
    const subscriptionExpiring = isCanceledOrPaused && isWithinPaidPeriod && !isUserAdmin
    const subscriptionPaused = subStatus === 'paused' && !isWithinPaidPeriod && !isUserAdmin

    return (
      <div style={{ width: '100vw', height: '100vh', overflow: 'hidden', background: currentTheme.background }}>
        <AnimatePresence>
          {showWelcome && (
            <SectionErrorBoundary sectionName="Welcome" key="welcome">
              <WelcomeScreen />
            </SectionErrorBoundary>
          )}
        </AnimatePresence>

        {!showWelcome && (
          <>
            <NavigationBar />

            {subscriptionRestricted && (
              <motion.div
                initial={{ opacity: 0, y: -20 }}
                animate={{ opacity: 1, y: 0 }}
                style={{
                  position: 'fixed', top: '70px', left: '50%', transform: 'translateX(-50%)',
                  zIndex: 300, padding: '12px 24px', borderRadius: '12px',
                  background: 'linear-gradient(135deg, rgba(255, 59, 48, 0.15), rgba(255, 59, 48, 0.08))',
                  border: '1px solid rgba(255, 59, 48, 0.4)', backdropFilter: 'blur(12px)',
                  display: 'flex', alignItems: 'center', gap: '12px', maxWidth: '600px',
                  boxShadow: '0 4px 20px rgba(0, 0, 0, 0.3)',
                }}
              >
                <span style={{ fontSize: '0.9rem', color: '#ff6b6b', lineHeight: '1.4' }}>
                  {`Your subscription has ${subStatus === 'paused' ? 'been paused' : 'expired'}. You can view your profile, saved conversations, and settings, but prompts are unavailable.`}
                </span>
                <motion.button
                  onClick={() => setActiveTab('settings')}
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                  style={{
                    padding: '6px 16px', background: currentTheme.accentGradient,
                    border: 'none', borderRadius: '8px', color: '#fff',
                    fontSize: '0.8rem', fontWeight: '600', cursor: 'pointer', whiteSpace: 'nowrap',
                  }}
                >
                  Resubscribe
                </motion.button>
              </motion.div>
            )}

            {activeTab === 'home' && (
              <SectionErrorBoundary sectionName="Council">
                <MainView
                  onClearAll={clearAllWindows}
                  subscriptionRestricted={subscriptionRestricted}
                  subscriptionPaused={subscriptionPaused}
                  subscriptionExpiring={subscriptionExpiring}
                  subscriptionRenewalDate={currentUser.subscriptionRenewalDate}
                  isLoading={isLoading}
                  isGeneratingSummary={isGeneratingSummary}
                  onCancelPrompt={handleCancelPrompt}
                />
              </SectionErrorBoundary>
            )}
            {activeTab === 'leaderboard' && (
              <SectionErrorBoundary sectionName="Leaderboard">
                <LeaderboardView />
              </SectionErrorBoundary>
            )}
            {activeTab === 'saved' && (
              <SectionErrorBoundary sectionName="Saved Conversations">
                <SavedConversationsView />
              </SectionErrorBoundary>
            )}
            {activeTab === 'settings' && (
              <SectionErrorBoundary sectionName="Settings">
                <SettingsView />
              </SectionErrorBoundary>
            )}
            {activeTab === 'statistics' && (
              <SectionErrorBoundary sectionName="Statistics">
                <StatisticsView />
              </SectionErrorBoundary>
            )}
            {activeTab === 'store' && (
              <div style={{
                position: 'fixed', top: 0,
                left: isNavExpanded ? '240px' : '60px',
                width: `calc(100% - ${isNavExpanded ? '240px' : '60px'})`,
                height: '100%', display: 'flex', flexDirection: 'column',
                alignItems: 'center', justifyContent: 'center',
                gap: '16px', padding: '40px', zIndex: 10,
                transition: 'left 0.3s ease, width 0.3s ease',
              }}>
                <ShoppingBag size={48} style={{ color: currentTheme.textMuted, opacity: 0.5 }} />
                <h2 style={{ fontSize: '1.8rem', fontWeight: '700', color: currentTheme.textMuted, margin: 0 }}>
                  Store
                </h2>
                <p style={{ color: currentTheme.textMuted, fontSize: '1rem', margin: 0 }}>
                  Coming soon
                </p>
              </div>
            )}

            {!isAdminRoute && activeTab === 'home' && (
              <SectionErrorBoundary sectionName="Response comparison">
                <ResponseComparison />
              </SectionErrorBoundary>
            )}
            {!isAdminRoute && (
              <SectionErrorBoundary sectionName="Summary">
                <SummaryWindow />
              </SectionErrorBoundary>
            )}
          </>
        )}

        <style>{`
          @keyframes spin {
            0% { transform: rotate(0deg); }
            100% { transform: rotate(360deg); }
          }
        `}</style>
      </div>
    )
  }

  // ── Routes ────────────────────────────────────────────────────────
  return (
    <Routes>
      <Route path="/" element={currentUser ? renderAuthenticatedApp() : <SectionErrorBoundary sectionName="Landing"><LandingPage onNavigate={navigatePublic} /></SectionErrorBoundary>} />
      <Route path="/signin" element={currentUser ? <Navigate to="/" replace /> : <SectionErrorBoundary sectionName="Sign in"><AuthView initialView="signin" initialPlan={landingPlan} onNavigate={navigatePublic} /></SectionErrorBoundary>} />
      <Route path="/login" element={<Navigate to="/signin" replace />} />
      <Route path="/signup" element={currentUser ? <Navigate to="/" replace /> : <SectionErrorBoundary sectionName="Sign up"><AuthView initialView="signup" initialPlan={landingPlan} onNavigate={navigatePublic} /></SectionErrorBoundary>} />
      <Route path="/register" element={<Navigate to="/signup" replace />} />
      <Route path="/terms" element={<SectionErrorBoundary sectionName="Terms of Service"><TermsOfService onNavigate={navigatePublic} /></SectionErrorBoundary>} />
      <Route path="/terms-of-service" element={<Navigate to="/terms" replace />} />
      <Route path="/privacy" element={<SectionErrorBoundary sectionName="Privacy Policy"><PrivacyPolicy onNavigate={navigatePublic} /></SectionErrorBoundary>} />
      <Route path="/privacy-policy" element={<Navigate to="/privacy" replace />} />
      <Route path="/verify-email" element={<SectionErrorBoundary sectionName="Email verification"><AuthView initialView="signin" onNavigate={navigatePublic} /></SectionErrorBoundary>} />
      <Route path="/reset-password" element={<SectionErrorBoundary sectionName="Password reset"><AuthView initialView="signin" onNavigate={navigatePublic} /></SectionErrorBoundary>} />
      <Route path="/admin" element={currentUser ? renderAuthenticatedApp() : <Navigate to="/signin" replace />} />
      <Route path="*" element={currentUser ? renderAuthenticatedApp() : <Navigate to="/" replace />} />
    </Routes>
  )
}

export default App
