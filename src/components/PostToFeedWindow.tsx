import React, { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { XCircle, Check, ChevronDown, ChevronUp, Trophy, Lock } from 'lucide-react'
import api from '../utils/api'
import MarkdownRenderer from './MarkdownRenderer'
import { spacing, fontSize, fontWeight, radius, zIndex, transition, layout, sx, createStyles } from '../utils/styles'

interface Props {
  isOpen: boolean
  onClose: () => void
  currentTheme: any
  lastSubmittedPrompt: string
  lastSubmittedCategory: string
  responses: any[]
  summary: any
  ragDebugData: any
  userIsPrivate: boolean
}

const PostToFeedWindow = ({
  isOpen,
  onClose,
  currentTheme,
  lastSubmittedPrompt,
  lastSubmittedCategory,
  responses,
  summary,
  ragDebugData,
  userIsPrivate,
}: Props) => {
  const s = createStyles(currentTheme)
  const [isSubmittingToVote, setIsSubmittingToVote] = useState(false)
  const [promptPostedSuccess, setPromptPostedSuccess] = useState(false)
  const [postDescription, setPostDescription] = useState('')
  const [postPromptExpanded, setPostPromptExpanded] = useState(false)
  const [postActiveTab, setPostActiveTab] = useState<string | number | null>(null)
  const [postIncludeSummary, setPostIncludeSummary] = useState(true)
  const [postExcludedResponses, setPostExcludedResponses] = useState<Set<number>>(new Set())
  const [postVisibility, setPostVisibility] = useState(userIsPrivate ? 'followers' : 'public')

  const handleClose = () => {
    if (isSubmittingToVote) return
    setPromptPostedSuccess(false)
    setPostDescription('')
    setPostPromptExpanded(false)
    setPostActiveTab(null)
    setPostIncludeSummary(true)
    setPostExcludedResponses(new Set())
    setPostVisibility(userIsPrivate ? 'followers' : 'public')
    onClose()
  }

  const handleSubmit = async () => {
    const includedResponseCount = responses ? responses.filter((_, idx) => !postExcludedResponses.has(idx)).length : 0
    const includedSummary = summary && postIncludeSummary
    if (includedResponseCount === 0 && !includedSummary) return
    setIsSubmittingToVote(true)
    try {
      let facts = null
      let sources = null

      const responseBoundSources = Array.isArray(summary?.sources) && summary.sources.length > 0
        ? summary.sources
        : (responses.find(r => Array.isArray(r.sources) && r.sources.length > 0)?.sources || null)

      if (responseBoundSources) {
        sources = responseBoundSources.map((s: any) => ({
          title: s.title,
          link: s.link || s.url,
          snippet: s.snippet,
        }))
      } else if (ragDebugData?.search?.results && Array.isArray(ragDebugData.search.results)) {
        sources = ragDebugData.search.results.map((s: any) => ({
          title: s.title,
          link: s.link,
          snippet: s.snippet,
        }))
      }

      const response = await api.post('/leaderboard/submit', {
        promptText: lastSubmittedPrompt.trim(),
        category: lastSubmittedCategory || 'General Knowledge/Other',
        description: postDescription.trim() || null,
        visibility: userIsPrivate ? postVisibility : 'public',
        responses: (() => {
          const filtered = responses ? responses.filter((_, idx) => !postExcludedResponses.has(idx)) : []
          return filtered.length > 0 ? filtered.map(r => ({
            modelName: r.modelName,
            actualModelName: r.actualModelName,
            originalModelName: r.originalModelName,
            text: r.text,
            error: r.error || false,
            tokens: r.tokens || null,
          })) : null
        })(),
        summary: (summary && postIncludeSummary) ? summary : null,
        facts: facts,
        sources: sources,
      })

      if (response.data.success) {
        setPromptPostedSuccess(true)
      }
    } catch (error: any) {
      console.error('Error submitting to leaderboard:', error)
      if (error.response?.data?.alreadyPosted) {
        alert('This prompt has already been posted to the Prompt Feed.')
      } else {
        alert(error.response?.data?.error || 'Failed to submit prompt to Prompt Feed')
      }
    } finally {
      setIsSubmittingToVote(false)
    }
  }

  const labelStyle = {
    color: currentTheme.textSecondary,
    fontSize: '0.75rem',
    fontWeight: fontWeight.medium,
    textTransform: 'uppercase' as const,
    letterSpacing: '0.5px',
    display: 'block' as const,
    marginBottom: spacing.md,
  }

  const checkboxButtonStyle = sx(layout.flexRow, {
    padding: `10px 0 10px ${spacing.lg}`,
    background: 'transparent',
    border: 'none',
    cursor: 'pointer',
    flexShrink: 0,
  })

  const expandButtonStyle = sx(layout.spaceBetween, {
    flex: 1,
    padding: `10px ${spacing.lg}`,
    background: 'transparent',
    border: 'none',
    cursor: 'pointer',
    color: currentTheme.text,
  })

  const codeBlockStyle = {
    padding: spacing.lg,
    borderTop: `1px solid ${currentTheme.borderLight}`,
    maxHeight: '200px',
    overflowY: 'auto' as const,
  }

  return (
    <AnimatePresence>
      {isOpen && (
        <div
          onClick={handleClose}
          style={sx(s.overlay, { backgroundColor: 'rgba(0, 0, 0, 0.5)' })}
        >
          <motion.div
            onClick={(e) => e.stopPropagation()}
            initial={{ scale: 0.9, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.9, opacity: 0 }}
            transition={{ duration: 0.2 }}
            style={{
              background: currentTheme.backgroundOverlay,
              border: `1px solid ${currentTheme.border}`,
              borderRadius: radius['2xl'],
              padding: spacing['4xl'],
              maxWidth: '600px',
              width: 'calc(100% - 80px)',
              maxHeight: '80vh',
              overflowY: 'auto',
              position: 'relative',
              boxShadow: `0 0 40px ${currentTheme.shadow}`,
            }}
          >
            {/* Close button */}
            <button
              onClick={handleClose}
              style={sx(s.iconButton, {
                position: 'absolute',
                top: spacing.xl,
                right: spacing.xl,
                background: currentTheme.buttonBackground,
                border: `1px solid ${currentTheme.borderLight}`,
                borderRadius: radius.md,
                padding: spacing.sm,
                color: currentTheme.textSecondary,
              })}
            >
              <XCircle size={18} />
            </button>

            {promptPostedSuccess ? (
              <div style={sx(layout.flexCol, { alignItems: 'center', gap: spacing.xl, padding: `${spacing['2xl']} 0` })}>
                <div style={sx(layout.center, {
                  width: '48px',
                  height: '48px',
                  borderRadius: radius.circle,
                  background: 'rgba(34, 197, 94, 0.15)',
                  border: '2px solid rgba(34, 197, 94, 0.5)',
                })}>
                  <Check size={26} color={currentTheme.success} />
                </div>
                <p style={{ color: currentTheme.success, margin: 0, fontSize: fontSize['3xl'], fontWeight: fontWeight.semibold }}>
                  Posted to Prompt Feed!
                </p>
                <motion.button
                  onClick={handleClose}
                  style={{
                    marginTop: spacing.xs,
                    padding: '10px 28px',
                    background: 'rgba(34, 197, 94, 0.15)',
                    border: '1px solid rgba(34, 197, 94, 0.4)',
                    borderRadius: radius.lg,
                    color: currentTheme.success,
                    fontSize: fontSize.lg,
                    fontWeight: fontWeight.medium,
                    cursor: 'pointer',
                  }}
                  whileHover={{ background: 'rgba(34, 197, 94, 0.25)' }}
                >
                  Close
                </motion.button>
              </div>
            ) : (
              <>
                {/* Title */}
                <h2 style={sx(s.gradientText, {
                  fontSize: '1.4rem',
                  margin: `0 0 ${spacing.sm} 0`,
                  paddingRight: spacing['4xl'],
                })}>
                  Post to Prompt Feed
                </h2>

                {/* Description textarea */}
                <div style={{ marginBottom: spacing.xl, marginTop: spacing.xl }}>
                  <label style={labelStyle}>
                    Description (optional)
                  </label>
                  <textarea
                    value={postDescription}
                    onChange={(e) => setPostDescription(e.target.value)}
                    placeholder="Add context or thoughts about this prompt..."
                    maxLength={500}
                    style={sx(s.input, {
                      minHeight: '90px',
                      padding: `${spacing.lg} 14px`,
                      borderRadius: radius.lg,
                      lineHeight: '1.5',
                      resize: 'vertical',
                      fontFamily: 'inherit',
                      boxSizing: 'border-box',
                      transition: 'border-color 0.2s',
                    })}
                    onFocus={(e) => { e.target.style.borderColor = currentTheme.accent }}
                    onBlur={(e) => { e.target.style.borderColor = currentTheme.borderLight }}
                  />
                  <p style={{
                    color: currentTheme.textMuted || currentTheme.textSecondary,
                    fontSize: '0.72rem',
                    margin: `${spacing.xs} 0 0 0`,
                    textAlign: 'right',
                  }}>
                    {postDescription.length}/500
                  </p>
                </div>

                {/* Prompt preview with 50-word truncation */}
                {(() => {
                  const promptText = lastSubmittedPrompt?.trim() || 'No prompt'
                  const words = promptText.split(/\s+/)
                  const isTruncated = words.length > 50
                  const displayText = (!postPromptExpanded && isTruncated) ? words.slice(0, 50).join(' ') : promptText
                  return (
                    <div style={sx(s.card, {
                      padding: `14px ${spacing.xl}`,
                      borderRadius: radius.lg,
                      marginBottom: spacing.xl,
                    })}>
                      <p style={{
                        color: currentTheme.textSecondary,
                        fontSize: '0.75rem',
                        fontWeight: fontWeight.medium,
                        margin: `0 0 ${spacing.sm} 0`,
                        textTransform: 'uppercase',
                        letterSpacing: '0.5px',
                      }}>
                        Prompt
                      </p>
                      <p style={{
                        color: currentTheme.text,
                        fontSize: fontSize.xl,
                        margin: 0,
                        lineHeight: '1.5',
                        whiteSpace: 'pre-wrap',
                        wordBreak: 'break-word',
                      }}>
                        {displayText}
                        {isTruncated && !postPromptExpanded && (
                          <span
                            onClick={() => setPostPromptExpanded(true)}
                            style={{
                              color: currentTheme.accent,
                              cursor: 'pointer',
                              fontSize: fontSize.base,
                              fontWeight: fontWeight.medium,
                              marginLeft: spacing.xs,
                            }}
                          >
                            ... show more
                          </span>
                        )}
                        {isTruncated && postPromptExpanded && (
                          <span
                            onClick={() => setPostPromptExpanded(false)}
                            style={{
                              color: currentTheme.accent,
                              cursor: 'pointer',
                              fontSize: fontSize.base,
                              fontWeight: fontWeight.medium,
                              marginLeft: spacing.xs,
                            }}
                          >
                            {' '}show less
                          </span>
                        )}
                      </p>
                    </div>
                  )
                })()}

                {/* Response pull-down containers with include/exclude toggle */}
                {(summary || (responses && responses.length > 0)) && (
                  <div style={{ marginBottom: spacing['2xl'] }}>
                    <label style={labelStyle}>
                      Include in Post
                    </label>
                    <div style={sx(layout.flexCol, { gap: spacing.md })}>
                    {/* Summary pull-down */}
                    {summary && (
                      <div style={{
                        background: currentTheme.buttonBackground,
                        border: `1px solid ${postIncludeSummary ? currentTheme.accent + '55' : currentTheme.borderLight}`,
                        borderRadius: radius.md,
                        overflow: 'hidden',
                        opacity: postIncludeSummary ? 1 : 0.5,
                        transition: 'opacity 0.2s, border-color 0.2s',
                      }}>
                        <div style={sx(layout.flexRow, { gap: '0' })}>
                          <button
                            onClick={() => setPostIncludeSummary(!postIncludeSummary)}
                            style={checkboxButtonStyle}
                          >
                            <div style={sx(layout.center, {
                              width: spacing['2xl'],
                              height: spacing['2xl'],
                              borderRadius: '5px',
                              border: postIncludeSummary ? 'none' : `2px solid ${currentTheme.textMuted || currentTheme.textSecondary}`,
                              background: postIncludeSummary ? currentTheme.accentGradient : 'transparent',
                              transition: transition.fast,
                            })}>
                              {postIncludeSummary && <Check size={14} color="#fff" strokeWidth={3} />}
                            </div>
                          </button>
                          <button
                            onClick={() => setPostActiveTab(postActiveTab === 'summary' ? null : 'summary')}
                            style={expandButtonStyle}
                          >
                            <span style={{ fontSize: fontSize.lg, fontWeight: fontWeight.medium }}>Summary Response</span>
                            {postActiveTab === 'summary' ? (
                              <ChevronUp size={16} color={currentTheme.accent} />
                            ) : (
                              <ChevronDown size={16} color={currentTheme.accent} />
                            )}
                          </button>
                        </div>
                        {postActiveTab === 'summary' && (
                          <div style={codeBlockStyle}>
                            <MarkdownRenderer
                              content={typeof summary === 'string' ? summary : (summary.text || summary.initialSummary || '')}
                              theme={currentTheme}
                              fontSize="0.85rem"
                              lineHeight="1.5"
                            />
                          </div>
                        )}
                      </div>
                    )}
                    {/* Individual model pull-downs */}
                    {responses && responses.map((r, idx) => {
                      const isIncluded = !postExcludedResponses.has(idx)
                      return (
                      <div key={idx} style={{
                        background: currentTheme.buttonBackground,
                        border: `1px solid ${isIncluded ? currentTheme.accent + '55' : currentTheme.borderLight}`,
                        borderRadius: radius.md,
                        overflow: 'hidden',
                        opacity: isIncluded ? 1 : 0.5,
                        transition: 'opacity 0.2s, border-color 0.2s',
                      }}>
                        <div style={sx(layout.flexRow, { gap: '0' })}>
                          <button
                            onClick={() => {
                              setPostExcludedResponses(prev => {
                                const next = new Set(prev)
                                if (next.has(idx)) next.delete(idx)
                                else next.add(idx)
                                return next
                              })
                            }}
                            style={checkboxButtonStyle}
                          >
                            <div style={sx(layout.center, {
                              width: spacing['2xl'],
                              height: spacing['2xl'],
                              borderRadius: '5px',
                              border: isIncluded ? 'none' : `2px solid ${currentTheme.textMuted || currentTheme.textSecondary}`,
                              background: isIncluded ? currentTheme.accentGradient : 'transparent',
                              transition: transition.fast,
                            })}>
                              {isIncluded && <Check size={14} color="#fff" strokeWidth={3} />}
                            </div>
                          </button>
                          <button
                            onClick={() => setPostActiveTab(postActiveTab === idx ? null : idx)}
                            style={expandButtonStyle}
                          >
                            <span style={{ fontSize: fontSize.lg, fontWeight: fontWeight.medium }}>{r.modelName || `Model ${idx + 1}`} Response</span>
                            {postActiveTab === idx ? (
                              <ChevronUp size={16} color={currentTheme.accent} />
                            ) : (
                              <ChevronDown size={16} color={currentTheme.accent} />
                            )}
                          </button>
                        </div>
                        {postActiveTab === idx && (
                          <div style={codeBlockStyle}>
                            <MarkdownRenderer
                              content={r.text || 'No response text'}
                              theme={currentTheme}
                              fontSize="0.85rem"
                              lineHeight="1.5"
                            />
                          </div>
                        )}
                      </div>
                      )
                    })}
                    </div>
                  </div>
                )}

                {/* Post Visibility Selector (for private accounts) */}
                {userIsPrivate && (
                  <div style={sx(layout.flexRow, {
                    gap: spacing.md,
                    marginBottom: spacing.lg,
                    padding: `10px ${spacing.lg}`,
                    background: currentTheme.buttonBackground,
                    border: `1px solid ${currentTheme.borderLight}`,
                    borderRadius: radius.lg,
                  })}>
                    <Lock size={15} color={currentTheme.textSecondary} />
                    <span style={{ color: currentTheme.textSecondary, fontSize: '0.82rem', marginRight: 'auto' }}>Visibility:</span>
                    {['public', 'followers'].map(v => (
                      <button
                        key={v}
                        onClick={() => setPostVisibility(v)}
                        style={{
                          padding: '5px 14px',
                          background: postVisibility === v ? currentTheme.accentGradient : 'transparent',
                          border: postVisibility === v ? 'none' : `1px solid ${currentTheme.borderLight}`,
                          borderRadius: radius.md,
                          color: postVisibility === v ? '#fff' : currentTheme.textSecondary,
                          fontSize: fontSize.md,
                          fontWeight: postVisibility === v ? fontWeight.semibold : fontWeight.normal,
                          cursor: 'pointer',
                          transition: transition.fast,
                        }}
                      >
                        {v === 'public' ? 'Public' : 'Followers Only'}
                      </button>
                    ))}
                  </div>
                )}

                {/* Validation message */}
                {(() => {
                  const includedResponseCount = responses ? responses.filter((_, idx) => !postExcludedResponses.has(idx)).length : 0
                  const includedSummary = summary && postIncludeSummary
                  const nothingIncluded = includedResponseCount === 0 && !includedSummary
                  return nothingIncluded ? (
                    <p style={{
                      color: currentTheme.error,
                      fontSize: '0.78rem',
                      textAlign: 'center',
                      margin: `0 0 ${spacing.md} 0`,
                    }}>
                      Select at least one response or the summary to include in your post
                    </p>
                  ) : null
                })()}
                <motion.button
                  onClick={handleSubmit}
                  disabled={isSubmittingToVote}
                  style={sx(s.buttonPrimary, {
                    width: '100%',
                    padding: spacing.lg,
                    borderRadius: radius.lg,
                    fontSize: fontSize.xl,
                    justifyContent: 'center',
                    cursor: isSubmittingToVote ? 'wait' : 'pointer',
                    opacity: isSubmittingToVote ? 0.7 : 1,
                  })}
                  whileHover={!isSubmittingToVote ? { scale: 1.01 } : {}}
                  whileTap={!isSubmittingToVote ? { scale: 0.99 } : {}}
                >
                  <Trophy size={18} />
                  {isSubmittingToVote ? 'Posting...' : 'Submit to Prompt Feed'}
                </motion.button>
              </>
            )}
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  )
}

export default PostToFeedWindow
