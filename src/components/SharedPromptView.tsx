import React, { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { ChevronDown, ChevronUp, Maximize2, Minimize2, FileText, MessageSquare, AlertCircle } from 'lucide-react'
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
}

const SharedPromptView = () => {
  const { token } = useParams<{ token: string }>()
  const navigate = useNavigate()
  const currentTheme = getTheme('dark')
  const [data, setData] = useState<SharedData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [activeView, setActiveView] = useState<'responses' | 'summary'>('responses')
  const [minimizedCards, setMinimizedCards] = useState<Record<string, boolean>>({})
  const [maximizedCard, setMaximizedCard] = useState<string | null>(null)

  useEffect(() => {
    if (!token) return
    fetch(`${API_URL}${API_PREFIX}/share/${token}`)
      .then(res => res.json())
      .then(json => {
        if (json.success && json.data) {
          setData(json.data)
          if (!json.data.summary) setActiveView('responses')
        } else {
          setError(json.error || 'Share not found')
        }
      })
      .catch(() => setError('Failed to load shared content'))
      .finally(() => setLoading(false))
  }, [token])

  const toggleMinimize = (id: string) => {
    setMinimizedCards(prev => ({ ...prev, [id]: !prev[id] }))
  }

  const toggleMaximize = (id: string) => {
    setMaximizedCard(prev => prev === id ? null : id)
  }

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

    if (summary.disagreements && summary.disagreements.length > 0) {
      sections.push(
        <div key="disagreements" style={{ marginBottom: spacing.xl }}>
          <h4 style={{ color: '#ff6b6b', fontSize: fontSize.lg, fontWeight: fontWeight.semibold, marginBottom: spacing.md }}>
            Points of Disagreement
          </h4>
          {summary.disagreements.map((point, i) => (
            <p key={i} style={{ color: currentTheme.textSecondary, fontSize: fontSize.base, margin: `0 0 ${spacing.sm} 0`, paddingLeft: spacing.lg, borderLeft: '2px solid #ff6b6b40' }}>
              {point}
            </p>
          ))}
        </div>
      )
    }

    return sections
  }

  return (
    <div style={{
      width: '100vw',
      minHeight: '100vh',
      background: currentTheme.background,
      color: currentTheme.text,
      overflowY: 'auto',
    }}>
      {/* Header */}
      <div style={{
        padding: `${spacing['2xl']} ${spacing['4xl']}`,
        borderBottom: `1px solid ${currentTheme.borderLight}`,
        background: currentTheme.backgroundOverlay,
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
            <span style={{
              color: currentTheme.textMuted,
              fontSize: fontSize.md,
            }}>
              Shared on {new Date(data.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
            </span>
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
      <div style={{ maxWidth: '1200px', margin: '0 auto', padding: spacing['4xl'] }}>
        <AnimatePresence mode="wait">
          {activeView === 'responses' ? (
            <motion.div
              key="responses"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.15 }}
              style={{ display: 'flex', flexDirection: 'column', gap: spacing.xl }}
            >
              {data.responses.map((response, index) => {
                const id = `response-${index}`
                const isMinimized = minimizedCards[id]
                const isMaximized = maximizedCard === id
                const providerColor = getProviderColor(response.modelName)

                if (isMaximized) {
                  return (
                    <motion.div
                      key={id}
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
                          <div style={{
                            width: '10px',
                            height: '10px',
                            borderRadius: radius.circle,
                            background: providerColor,
                          }} />
                          <span style={{ color: providerColor, fontSize: fontSize.xl, fontWeight: fontWeight.semibold }}>
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
                            padding: spacing.sm,
                          }}
                        >
                          <Minimize2 size={20} />
                        </button>
                      </div>
                      <MarkdownRenderer content={typeof response.text === 'string' ? response.text : ''} theme={currentTheme} />
                    </motion.div>
                  )
                }

                return (
                  <div
                    key={id}
                    style={{
                      background: currentTheme.backgroundOverlay,
                      border: `1px solid ${currentTheme.borderLight}`,
                      borderRadius: radius['2xl'],
                      overflow: 'hidden',
                      transition: 'border-color 0.2s ease',
                    }}
                  >
                    {/* Card Header */}
                    <div
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        padding: `${spacing.lg} ${spacing.xl}`,
                        borderBottom: isMinimized ? 'none' : `1px solid ${currentTheme.borderLight}`,
                        cursor: 'pointer',
                      }}
                      onClick={() => toggleMinimize(id)}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: spacing.md }}>
                        <div style={{
                          width: '10px',
                          height: '10px',
                          borderRadius: radius.circle,
                          background: providerColor,
                        }} />
                        <span style={{ color: providerColor, fontSize: fontSize.lg, fontWeight: fontWeight.semibold }}>
                          {formatModelName(response.modelName)}
                        </span>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: spacing.sm }}>
                        <button
                          onClick={(e) => { e.stopPropagation(); toggleMaximize(id) }}
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
                          <Maximize2 size={16} />
                        </button>
                        {isMinimized ? <ChevronDown size={18} color={currentTheme.textMuted} /> : <ChevronUp size={18} color={currentTheme.textMuted} />}
                      </div>
                    </div>

                    {/* Card Body */}
                    <AnimatePresence>
                      {!isMinimized && (
                        <motion.div
                          initial={{ height: 0, opacity: 0 }}
                          animate={{ height: 'auto', opacity: 1 }}
                          exit={{ height: 0, opacity: 0 }}
                          transition={{ duration: 0.2 }}
                          style={{ overflow: 'hidden' }}
                        >
                          <div style={{ padding: spacing.xl }}>
                            {response.error ? (
                              <p style={{ color: '#ff6b6b', fontStyle: 'italic' }}>This response encountered an error.</p>
                            ) : (
                              <MarkdownRenderer content={typeof response.text === 'string' ? response.text : ''} theme={currentTheme} />
                            )}
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                )
              })}
            </motion.div>
          ) : (
            <motion.div
              key="summary"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.15 }}
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
      </div>

      {/* Footer */}
      <div style={{
        textAlign: 'center',
        padding: `${spacing['3xl']} ${spacing['4xl']}`,
        borderTop: `1px solid ${currentTheme.borderLight}`,
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
