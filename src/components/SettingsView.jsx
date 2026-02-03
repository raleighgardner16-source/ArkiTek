import React from 'react'
import { useStore } from '../store/useStore'
import SubscriptionManager from './SubscriptionManager'

const SettingsView = () => {
  const currentUser = useStore((state) => state.currentUser)

  return (
    <div
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        width: '100%',
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'flex-start',
        paddingTop: '40px',
        paddingBottom: '40px',
        overflowY: 'auto',
        zIndex: 10,
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
            style={{
              fontSize: '3rem',
              marginBottom: '12px',
              background: 'linear-gradient(90deg, #00FFFF, #00FF00)',
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
              fontWeight: 'bold',
            }}
          >
            ArkTek
          </h1>
          <h2
            style={{
              fontSize: '2rem',
              marginBottom: '12px',
              background: 'linear-gradient(90deg, #00FFFF, #00FF00)',
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
            }}
          >
            Settings
          </h2>
          <p style={{ color: '#aaaaaa', fontSize: '1.1rem' }}>
            {currentUser ? `Signed in as ${currentUser.username}` : 'Manage your ArkTek account and settings'}
          </p>
        </div>

        {/* Application Summary */}
        <div
          style={{
            background: 'rgba(0, 255, 255, 0.1)',
            border: '1px solid rgba(0, 255, 255, 0.3)',
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
              color: '#00FFFF',
              textAlign: 'center',
            }}
          >
            About ArkTek
          </h3>
          <p style={{ color: '#cccccc', marginBottom: '12px', lineHeight: '1.6', textAlign: 'left' }}>
            <strong style={{ color: '#00FF00' }}>Mission & Goal:</strong> ArkTek provides unified access to multiple AI providers through a single platform, simplifying AI development and research. We eliminate the complexity of working with multiple providers while delivering comprehensive analytics, usage tracking, and intelligent response aggregation to help you make better decisions with confidence.
          </p>
          <p style={{ color: '#cccccc', lineHeight: '1.6', textAlign: 'left' }}>
            <strong style={{ color: '#00FF00' }}>What We Solve:</strong> No more managing multiple AIs, platforms, and subscriptions. Send your prompt to multiple AI models simultaneously, compare their responses side-by-side, and receive an intelligent summary that combines all responses into one comprehensive answer. This aggregation helps identify commonalities and reduces hallucinations, giving you greater confidence that the information you receive is accurate and reliable.
          </p>
        </div>

        {/* Subscription Management - Only show if user is logged in */}
        {currentUser && <SubscriptionManager />}

      </div>
    </div>
  )
}

export default SettingsView

