import React from 'react'
import { useStore } from '../store/useStore'
import { getTheme } from '../utils/theme'
import SubscriptionManager from './SubscriptionManager'

const SettingsView = () => {
  const currentUser = useStore((state) => state.currentUser)
  const theme = useStore((state) => state.theme || 'dark')
  const currentTheme = getTheme(theme)
  const isNavExpanded = useStore((state) => state.isNavExpanded)

  return (
    <div
      style={{
        position: 'fixed',
        top: 0,
        left: isNavExpanded ? '240px' : '60px',
        width: `calc(100% - ${isNavExpanded ? '240px' : '60px'})`,
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'flex-start',
        paddingTop: '40px',
        paddingBottom: '40px',
        overflowY: 'auto',
        zIndex: 10,
        transition: 'left 0.3s ease, width 0.3s ease',
      }}
    >
      <div
        style={{
          width: '100%',
          maxWidth: '600px',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          margin: '0 auto',
        }}
      >
        {/* Header */}
        <div style={{ marginBottom: '40px', textAlign: 'center' }}>
          <h1
            key={`title-${theme}`}
            style={{
              fontSize: '2.5rem',
              marginBottom: '12px',
              background: currentTheme.accentGradient,
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
              color: currentTheme.accent,
              fontWeight: 'bold',
              display: 'inline-block',
            }}
          >
            ArkiTek Settings
          </h1>
          <p style={{ color: currentTheme.textSecondary, fontSize: '1.1rem' }}>
            {currentUser ? `Signed in as ${currentUser.username}` : 'Manage your ArkiTek account and settings'}
          </p>
        </div>

        {/* Application Summary */}
        <div
          style={{
            background: currentTheme.backgroundOverlay,
            border: `1px solid ${currentTheme.borderLight}`,
            borderRadius: '16px',
            padding: '30px',
            marginBottom: '40px',
            width: '100%',
            maxWidth: '600px',
          }}
        >
          <h3
            style={{
              fontSize: '1.5rem',
              marginBottom: '16px',
              color: currentTheme.accent,
              textAlign: 'center',
            }}
          >
            About ArkiTek
          </h3>
          <p style={{ color: currentTheme.textSecondary, lineHeight: '1.6', textAlign: 'left' }}>
            <strong style={{ color: currentTheme.accentSecondary }}>Our Mission:</strong> ArkiTek provides unified access to multiple AI providers through a single platform, eliminating the complexity of managing multiple AIs, platforms, and subscriptions. Send your prompt to multiple AI models simultaneously, compare their responses side-by-side, and receive an intelligent summary that combines all responses into one comprehensive answer. This aggregation helps identify commonalities and reduces hallucinations, giving you greater confidence that the information you receive is accurate and reliable — all backed by comprehensive analytics, usage tracking, and intelligent response aggregation.
          </p>
        </div>

        {/* Subscription Management - Only show if user is logged in */}
        {currentUser && <SubscriptionManager />}

      </div>
    </div>
  )
}

export default SettingsView

