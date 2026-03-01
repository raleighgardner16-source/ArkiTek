import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import * as Sentry from '@sentry/react'
import App from './App'
import './index.css'

const SENTRY_DSN = import.meta.env.VITE_SENTRY_DSN
if (SENTRY_DSN) {
  Sentry.init({
    dsn: SENTRY_DSN,
    environment: import.meta.env.MODE,
    enabled: import.meta.env.PROD,
    integrations: [
      Sentry.browserTracingIntegration(),
      Sentry.replayIntegration({ maskAllText: false, blockAllMedia: false }),
    ],
    tracesSampleRate: 0.2,
    replaysSessionSampleRate: 0,
    replaysOnErrorSampleRate: 1.0,
  })
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <BrowserRouter>
      <Sentry.ErrorBoundary
        fallback={({ error, resetError }: { error: unknown; resetError: () => void }) => (
          <div style={{
            display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
            height: '100vh', background: '#0a0a0a', color: '#fff', fontFamily: 'system-ui, sans-serif',
            padding: '40px', textAlign: 'center',
          }}>
            <h1 style={{ fontSize: '1.5rem', marginBottom: '12px' }}>Something went wrong</h1>
            <p style={{ color: '#999', marginBottom: '24px', maxWidth: '500px' }}>
              An unexpected error occurred. Our team has been notified.
            </p>
            <button
              onClick={() => { resetError(); window.location.href = '/' }}
              style={{
                padding: '10px 24px', background: 'linear-gradient(135deg, #6366f1, #8b5cf6)',
                border: 'none', borderRadius: '8px', color: '#fff', fontSize: '0.95rem',
                fontWeight: '600', cursor: 'pointer',
              }}
            >
              Return to Home
            </button>
          </div>
        )}
      >
        <App />
      </Sentry.ErrorBoundary>
    </BrowserRouter>
  </React.StrictMode>,
)

