import React, { useEffect, useState } from 'react'
import { useStore } from '../store/useStore'
import { getTheme } from '../utils/theme'
import { spacing, fontSize, fontWeight, radius, zIndex, transition, layout, sx, createStyles } from '../utils/styles'
import SubscriptionManager from './SubscriptionManager'

const SettingsView = () => {
  const currentUser = useStore((state) => state.currentUser)
  const theme = useStore((state) => state.theme || 'dark')
  const currentTheme = getTheme(theme)
  const s = createStyles(currentTheme)
  const isNavExpanded = useStore((state) => state.isNavExpanded)
  const [mountReady, setMountReady] = useState(false)
  useEffect(() => { const id = requestAnimationFrame(() => setMountReady(true)); return () => cancelAnimationFrame(id) }, [])

  const navWidth = isNavExpanded ? '240px' : '60px'

  return (
    <div
      className={mountReady ? undefined : 'no-mount-transition'}
      style={sx(layout.flexCol, s.pageContainer(navWidth), {
        alignItems: 'center',
        justifyContent: 'flex-start',
        paddingTop: spacing['5xl'],
        paddingBottom: spacing['5xl'],
        overflowY: 'auto',
      })}
    >
      <div
        style={sx(layout.flexCol, {
          width: '100%',
          maxWidth: '600px',
          alignItems: 'center',
          margin: '0 auto',
        })}
      >
        {/* Header */}
        <div style={{ marginBottom: spacing['5xl'], textAlign: 'center' }}>
          <h1
            key={`title-${theme}`}
            style={sx(s.pageTitle, { marginBottom: spacing.lg })}
          >
            ArkiTek Settings
          </h1>
          <p style={s.subtitle}>
            {currentUser ? `Signed in as ${currentUser.username}` : 'Manage your ArkiTek account and settings'}
          </p>
        </div>

        {/* Application Summary */}
        <div
          style={sx(s.card, {
            background: currentTheme.backgroundOverlay,
            marginBottom: spacing['5xl'],
            width: '100%',
            maxWidth: '600px',
          })}
        >
          <h3
            style={{
              fontSize: fontSize['6xl'],
              marginBottom: spacing.xl,
              color: currentTheme.accent,
              textAlign: 'center',
            }}
          >
            About ArkiTek
          </h3>
          <p style={sx(s.bodyText, { textAlign: 'left' })}>
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
