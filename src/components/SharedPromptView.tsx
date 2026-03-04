import React, { useEffect, useState, useRef, useCallback } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { Maximize2, Minimize2, FileText, MessageSquare, AlertCircle } from 'lucide-react'
import MarkdownRenderer from './MarkdownRenderer'
import { getTheme } from '../utils/theme'
import { spacing, fontSize, fontWeight, radius, transition } from '../utils/styles'
import { API_URL, API_PREFIX } from '../utils/config'

interface SharedResponse {
  modelName: string
  actualModelName?: string
  originalModelName?: string
  text: string
  error?: boolean
}

interface SharedSummary {
  text: string
  consensus?: number | null
  summary?: string
  agreements?: string[]
  disagreements?: string[]
  differences?: string[]
  singleModel?: boolean
  modelName?: string | null
}

interface SharedData {
  prompt: string
  category: string
  responses: SharedResponse[]
  summary: SharedSummary | null
  createdAt: string
  expiresAt: string | null
}

const SharedPromptView = () => {
  const { token } = useParams<{ token: string }>()
  const navigate = useNavigate()
  const currentTheme = getTheme('dark')
  const [data, setData] = useState<SharedData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [activeView, setActiveView] = useState<'responses' | 'summary'>('responses')
  const [maximizedCard, setMaximizedCard] = useState<string | null>(null)

  useEffect(() => {
    if (!token) return
    fetch(`${API_URL}${API_PREFIX}/share/${token}`)
      .then(res => res.json())
      .then(json => {
        if (json.success && json.prompt && json.responses) {
          setData({
            prompt: json.prompt,
            category: json.category,
            responses: json.responses,
            summary: json.summary || null,
            createdAt: json.createdAt,
            expiresAt: json.expiresAt || null,
          })
          if (!json.summary) setActiveView('responses')
        } else {
          setError(json.error || 'Share not found')
        }
      })
        .catch(() => setError('This share link has expired or could not be loaded'))
      .finally(() => setLoading(false))
  }, [token])

  const toggleMaximize = (id: string) => {
    setMaximizedCard(prev => prev === id ? null : id)
  }

  const handleContainerWheel = useCallback((e: React.WheelEvent) => {
    const target = e.target as HTMLElement
    if (target.closest('[data-shared-col]')) return
    const columns = document.querySelectorAll('[data-shared-col]')
    columns.forEach(col => { col.scrollTop += e.deltaY })
  }, [])

  const formatModelName = (name: string) => {
    return name
      .replace(/^(openai|anthropic|google|xai)-/, '')
      .replace(/-/g, ' ')
      .replace(/\b\w/g, c => c.toUpperCase())
  }

  const getProviderColor = (modelName: string) => {
    if (modelName.startsWith('openai')) return '#10a37f'
    if (modelName.startsWith('anthropic')) return '#d4a574'
    if (modelName.startsWith('google')) return '#4285f4'
    if (modelName.startsWith('xai')) return '#1da1f2'
    return currentTheme.accent
  }

  if (loading) {
    return (
      <div style={{
        width: '100vw',
        height: '100vh',
        background: currentTheme.background,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        color: currentTheme.textSecondary,
        fontSize: fontSize['3xl'],
      }}>
        Loading shared content...
      </div>
    )
  }

  if (error || !data) {
    return (
      <div style={{
        width: '100vw',
        height: '100vh',
        background: currentTheme.background,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: spacing.xl,
        color: currentTheme.textSecondary,
      }}>
        <AlertCircle size={48} color={currentTheme.textMuted} />
        <p style={{ fontSize: fontSize['3xl'], margin: 0 }}>{error || 'Share not found'}</p>
        <button
          onClick={() => navigate('/')}
          style={{
            padding: '10px 24px',
            background: currentTheme.accentGradient,
            border: 'none',
            borderRadius: radius.lg,
            color: '#fff',
            fontSize: fontSize.lg,
            fontWeight: fontWeight.semibold,
            cursor: 'pointer',
          }}
        >
          Go to ArkiTek
        </button>
      </div>
    )
  }

  const renderSummaryContent = (summary: SharedSummary) => {
    const sections: React.ReactNode[] = []

    if (summary.consensus != null) {
      sections.push(
        <div key="consensus" style={{
          display: 'flex',
          alignItems: 'center',
          gap: spacing.lg,
          padding: spacing.xl,
          background: currentTheme.backgroundTertiary,
          borderRadius: radius.lg,
          marginBottom: spacing.xl,
        }}>
          <div style={{
            width: '56px',
            height: '56px',
            borderRadius: radius.circle,
            background: `conic-gradient(${currentTheme.accent} ${summary.consensus}%, ${currentTheme.backgroundSecondary} 0%)`,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexShrink: 0,
          }}>
            <div style={{
              width: '44px',
              height: '44px',
              borderRadius: radius.circle,
              background: currentTheme.backgroundTertiary,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: fontSize.lg,
              fontWeight: fontWeight.bold,
              color: currentTheme.text,
            }}>
              {summary.consensus}%
            </div>
          </div>
          <div>
            <p style={{ color: currentTheme.textSecondary, fontSize: fontSize.md, margin: 0 }}>Consensus Score</p>
            <p style={{ color: currentTheme.text, fontSize: fontSize.lg, fontWeight: fontWeight.semibold, margin: 0 }}>
              {summary.consensus >= 80 ? 'Strong Agreement' : summary.consensus >= 50 ? 'Moderate Agreement' : 'Diverse Perspectives'}
            </p>
          </div>
        </div>
      )
    }

    if (summary.summary || summary.text) {
      sections.push(
        <div key="summary" style={{ marginBottom: spacing.xl }}>
          <MarkdownRenderer content={summary.summary || summary.text} theme={currentTheme} />
        </div>
      )
    }

    if (summary.agreements && summary.agreements.length > 0) {
      sections.push(
        <div key="agreements" style={{ marginBottom: spacing.xl }}>
          <h4 style={{ color: '#00cc66', fontSize: fontSize.lg, fontWeight: fontWeight.semibold, marginBottom: spacing.md }}>
            Points of Agreement
          </h4>
          {summary.agreements.map((point, i) => (
            <p key={i} style={{ color: currentTheme.textSecondary, fontSize: fontSize.base, margin: `0 0 ${spacing.sm} 0`, paddingLeft: spacing.lg, borderLeft: '2px solid #00cc6640' }}>
              {point}
            </p>
          ))}
        </div>
      )
    }

    sections.push(
      <div key="disagreements" style={{ marginBottom: spacing.xl }}>
        <h4 style={{ color: '#ff6b6b', fontSize: fontSize.lg, fontWeight: fontWeight.semibold, marginBottom: spacing.md }}>
          Contradictions
        </h4>
        {summary.disagreements && summary.disagreements.length > 0 ? (
          summary.disagreements.map((point, i) => (
            <p key={i} style={{ color: currentTheme.textSecondary, fontSize: fontSize.base, margin: `0 0 ${spacing.sm} 0`, paddingLeft: spacing.lg, borderLeft: '2px solid #ff6b6b40' }}>
              {point}
            </p>
          ))
        ) : (
          <p style={{ color: currentTheme.textMuted, fontSize: fontSize.base, margin: 0, paddingLeft: spacing.lg, borderLeft: '2px solid #ff6b6b40', fontStyle: 'italic' }}>
            No contradictions in model responses
          </p>
        )}
      </div>
    )

    sections.push(
      <div key="differences" style={{ marginBottom: spacing.xl }}>
        <h4 style={{ color: '#88aaff', fontSize: fontSize.lg, fontWeight: fontWeight.semibold, marginBottom: spacing.md }}>
          Differences
        </h4>
        {summary.differences && summary.differences.length > 0 ? (
          summary.differences.map((point, i) => (
            <p key={i} style={{ color: currentTheme.textSecondary, fontSize: fontSize.base, margin: `0 0 ${spacing.sm} 0`, paddingLeft: spacing.lg, borderLeft: '2px solid #88aaff40' }}>
              {point}
            </p>
          ))
        ) : (
          <p style={{ color: currentTheme.textMuted, fontSize: fontSize.base, margin: 0, paddingLeft: spacing.lg, borderLeft: '2px solid #88aaff40', fontStyle: 'italic' }}>
            No notable differences in model responses
          </p>
        )}
      </div>
    )

    return sections
  }

  return (
    <div style={{
      width: '100vw',
      height: '100vh',
      background: currentTheme.background,
      color: currentTheme.text,
      display: 'flex',
      flexDirection: 'column',
      overflow: 'hidden',
    }}>
      <style>{`
        .shared-column-scroll::-webkit-scrollbar { width: 6px; }
        .shared-column-scroll::-webkit-scrollbar-track { background: transparent; }
        .shared-column-scroll::-webkit-scrollbar-thumb { background: rgba(93, 173, 226, 0.35); border-radius: 6px; }
        .shared-column-scroll::-webkit-scrollbar-thumb:hover { background: rgba(93, 173, 226, 0.55); }
      `}</style>
      {/* Header */}
      <div style={{
        padding: `${spacing['2xl']} ${spacing['4xl']}`,
        borderBottom: `1px solid ${currentTheme.borderLight}`,
        background: currentTheme.backgroundOverlay,
        flexShrink: 0,
      }}>
        <div style={{ maxWidth: '1200px', margin: '0 auto' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: spacing.lg }}>
            <h1 style={{
              fontSize: fontSize['4xl'],
              fontWeight: fontWeight.bold,
              background: currentTheme.accentGradient,
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
              margin: 0,
            }}>
              ArkiTek
            </h1>
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '2px' }}>
              <span style={{
                color: currentTheme.textMuted,
                fontSize: fontSize.md,
              }}>
                Shared on {new Date(data.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
              </span>
              {data.expiresAt && (
                <span style={{
                  color: new Date(data.expiresAt).getTime() - Date.now() < 24 * 60 * 60 * 1000
                    ? '#ff6b6b'
                    : currentTheme.textMuted,
                  fontSize: fontSize.sm,
                }}>
                  Expires {new Date(data.expiresAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                </span>
              )}
            </div>
          </div>
          <div style={{
            padding: spacing.xl,
            background: currentTheme.backgroundSecondary,
            borderRadius: radius.xl,
            border: `1px solid ${currentTheme.borderLight}`,
          }}>
            <p style={{ color: currentTheme.textMuted, fontSize: fontSize.md, margin: `0 0 ${spacing.xs} 0` }}>
              Prompt · {data.category}
            </p>
            <p style={{ color: currentTheme.text, fontSize: fontSize.xl, margin: 0, lineHeight: 1.5 }}>
              {data.prompt}
            </p>
          </div>
        </div>
      </div>

      {/* Tab Switcher */}
      {data.summary && (
        <div style={{
          display: 'flex',
          maxWidth: '1200px',
          margin: '0 auto',
          padding: `${spacing.xl} ${spacing['4xl']} 0`,
          gap: spacing.md,
          flexShrink: 0,
        }}>
          <button
            onClick={() => setActiveView('responses')}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: spacing.sm,
              padding: `${spacing.md} ${spacing.xl}`,
              background: activeView === 'responses' ? currentTheme.backgroundOverlay : 'transparent',
              border: `1px solid ${activeView === 'responses' ? currentTheme.accent : currentTheme.borderLight}`,
              borderRadius: radius.lg,
              color: activeView === 'responses' ? currentTheme.accent : currentTheme.textSecondary,
              fontSize: fontSize.lg,
              fontWeight: fontWeight.semibold,
              cursor: 'pointer',
              transition: transition.normal,
            }}
          >
            <MessageSquare size={16} />
            Responses ({data.responses.length})
          </button>
          <button
            onClick={() => setActiveView('summary')}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: spacing.sm,
              padding: `${spacing.md} ${spacing.xl}`,
              background: activeView === 'summary' ? currentTheme.backgroundOverlay : 'transparent',
              border: `1px solid ${activeView === 'summary' ? currentTheme.accent : currentTheme.borderLight}`,
              borderRadius: radius.lg,
              color: activeView === 'summary' ? currentTheme.accent : currentTheme.textSecondary,
              fontSize: fontSize.lg,
              fontWeight: fontWeight.semibold,
              cursor: 'pointer',
              transition: transition.normal,
            }}
          >
            <FileText size={16} />
            Summary
          </button>
        </div>
      )}

      {/* Content */}
      <AnimatePresence mode="wait">
        {activeView === 'responses' ? (
          <motion.div
            key="responses"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
            onWheel={handleContainerWheel}
            style={{
              flex: 1,
              minHeight: 0,
              paddingLeft: 125,
              paddingRight: 125,
            }}
          >
            <div style={{
              display: 'flex',
              width: '100%',
              height: '100%',
              overflow: 'hidden',
            }}>
            {/* Maximized overlay */}
            {maximizedCard && (() => {
              const idx = parseInt(maximizedCard.replace('response-', ''))
              const response = data.responses[idx]
              if (!response) return null
              const providerColor = getProviderColor(response.modelName)
              return (
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  style={{
                    position: 'fixed',
                    top: 0,
                    left: 0,
                    right: 0,
                    bottom: 0,
                    zIndex: 1000,
                    background: currentTheme.background,
                    overflowY: 'auto',
                    padding: spacing['4xl'],
                  }}
                >
                  <div style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    marginBottom: spacing['2xl'],
                    padding: `${spacing.lg} ${spacing.xl}`,
                    background: currentTheme.backgroundOverlay,
                    borderRadius: radius.xl,
                    border: `1px solid ${providerColor}40`,
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: spacing.md }}>
                      <div style={{ width: '10px', height: '10px', borderRadius: radius.circle, background: providerColor }} />
                      <span style={{ color: providerColor, fontSize: fontSize.xl, fontWeight: fontWeight.semibold }}>
                        {formatModelName(response.modelName)}
                      </span>
                    </div>
                    <button
                      onClick={() => toggleMaximize(maximizedCard)}
                      style={{ background: 'none', border: 'none', color: currentTheme.textMuted, cursor: 'pointer', padding: spacing.sm }}
                    >
                      <Minimize2 size={20} />
                    </button>
                  </div>
                  <MarkdownRenderer content={typeof response.text === 'string' ? response.text : ''} theme={currentTheme} />
                </motion.div>
              )
            })()}

            {data.responses.map((response, index) => {
              const id = `response-${index}`
              const providerColor = getProviderColor(response.modelName)
              return (
                <React.Fragment key={id}>
                  {index > 0 && (
                    <div style={{
                      width: '1px',
                      background: 'rgba(255, 255, 255, 0.12)',
                      flexShrink: 0,
                      alignSelf: 'stretch',
                    }} />
                  )}
                  <div
                    className="shared-column-scroll"
                    data-shared-col
                    style={{
                      flex: 1,
                      minWidth: 0,
                      height: '100%',
                      overflowY: 'auto',
                      overflowX: 'hidden',
                      padding: `0 ${spacing.xl} ${spacing['4xl']}`,
                    }}
                  >
                    {/* Column header */}
                    <div style={{
                      position: 'sticky',
                      top: 0,
                      zIndex: 10,
                      background: currentTheme.background,
                      padding: `${spacing.lg} 0`,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      borderBottom: `1px solid ${currentTheme.borderLight}`,
                      marginBottom: spacing.lg,
                    }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: spacing.sm }}>
                        <div style={{ width: '8px', height: '8px', borderRadius: radius.circle, background: providerColor }} />
                        <span style={{ color: providerColor, fontSize: fontSize.md, fontWeight: fontWeight.semibold }}>
                          {formatModelName(response.modelName)}
                        </span>
                      </div>
                      <button
                        onClick={() => toggleMaximize(id)}
                        style={{
                          background: 'none',
                          border: 'none',
                          color: currentTheme.textMuted,
                          cursor: 'pointer',
                          padding: spacing.xs,
                          display: 'flex',
                          alignItems: 'center',
                        }}
                      >
                        <Maximize2 size={14} />
                      </button>
                    </div>

                    {/* Column content */}
                    {response.error ? (
                      <p style={{ color: '#ff6b6b', fontStyle: 'italic' }}>This response encountered an error.</p>
                    ) : (
                      <MarkdownRenderer content={typeof response.text === 'string' ? response.text : ''} theme={currentTheme} />
                    )}
                  </div>
                </React.Fragment>
              )
            })}
            </div>
          </motion.div>
        ) : (
          <motion.div
            key="summary"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
            className="shared-column-scroll"
            style={{ flex: 1, minHeight: 0, overflowY: 'auto', maxWidth: '1200px', margin: '0 auto', padding: spacing['4xl'], width: '100%' }}
          >
            <div style={{
              background: currentTheme.backgroundOverlay,
              border: `1px solid ${currentTheme.borderLight}`,
              borderRadius: radius['2xl'],
              padding: spacing['3xl'],
            }}>
              {data.summary && renderSummaryContent(data.summary)}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Footer */}
      <div style={{
        textAlign: 'center',
        padding: `${spacing.lg} ${spacing['4xl']}`,
        borderTop: `1px solid ${currentTheme.borderLight}`,
        flexShrink: 0,
      }}>
        <p style={{ color: currentTheme.textMuted, fontSize: fontSize.md, margin: 0 }}>
          Shared via{' '}
          <a
            href="/"
            style={{ color: currentTheme.accent, textDecoration: 'none' }}
          >
            ArkiTek
          </a>
          {' '}— Compare AI models side by side
        </p>
      </div>
    </div>
  )
}

export default SharedPromptView
