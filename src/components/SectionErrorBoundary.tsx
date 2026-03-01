import * as Sentry from '@sentry/react'
import { spacing, fontSize, fontWeight, radius, layout, sx } from '../utils/styles'

interface Props {
  children: React.ReactNode
  sectionName?: string
}

/**
 * Section-level error boundary — catches errors in child components and shows
 * a compact fallback UI. Use around major views/features so one crash doesn't
 * take down the whole app. Errors are still reported to Sentry.
 */
export function SectionErrorBoundary({ children, sectionName = 'This section' }: Props) {
  return (
    <Sentry.ErrorBoundary
      fallback={({ error, resetError }: { error: any; resetError: () => void }) => (
        <div
          style={sx(layout.center, {
            flexDirection: 'column',
            minHeight: '200px',
            padding: '32px',
            background: 'rgba(0, 0, 0, 0.4)',
            borderRadius: radius.xl,
            border: '1px solid rgba(255, 255, 255, 0.08)',
            margin: spacing['3xl'],
          })}
        >
          <p style={{ color: '#999', marginBottom: spacing.md, fontSize: fontSize.lg }}>
            {sectionName} encountered an error
          </p>
          <p style={{ color: '#666', marginBottom: spacing['2xl'], fontSize: fontSize.md, maxWidth: '400px', textAlign: 'center' }}>
            {error?.message || 'Something went wrong. Our team has been notified.'}
          </p>
          <div style={sx(layout.center, { gap: spacing.lg, flexWrap: 'wrap' })}>
            <button
              onClick={() => resetError()}
              style={{
                padding: `${spacing.md} ${spacing['2xl']}`,
                background: 'linear-gradient(135deg, #6366f1, #8b5cf6)',
                border: 'none',
                borderRadius: radius.md,
                color: '#fff',
                fontSize: '0.875rem',
                fontWeight: fontWeight.semibold,
                cursor: 'pointer',
              }}
            >
              Try again
            </button>
            <button
              onClick={() => {
                resetError()
                window.location.href = '/'
              }}
              style={{
                padding: `${spacing.md} ${spacing['2xl']}`,
                background: 'rgba(255, 255, 255, 0.08)',
                border: '1px solid rgba(255, 255, 255, 0.2)',
                borderRadius: radius.md,
                color: '#ccc',
                fontSize: '0.875rem',
                cursor: 'pointer',
              }}
            >
              Go to Home
            </button>
          </div>
        </div>
      )}
    >
      {children}
    </Sentry.ErrorBoundary>
  )
}
