import React, { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { XCircle, Check, ChevronDown, ChevronUp, Trophy, Lock } from 'lucide-react'
import api from '../utils/api'
import { API_URL } from '../utils/config'
import MarkdownRenderer from './MarkdownRenderer'

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
}) => {
  const [isSubmittingToVote, setIsSubmittingToVote] = useState(false)
  const [promptPostedSuccess, setPromptPostedSuccess] = useState(false)
  const [postDescription, setPostDescription] = useState('')
  const [postPromptExpanded, setPostPromptExpanded] = useState(false)
  const [postActiveTab, setPostActiveTab] = useState(null)
  const [postIncludeSummary, setPostIncludeSummary] = useState(true)
  const [postExcludedResponses, setPostExcludedResponses] = useState(new Set())
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
        sources = responseBoundSources.map(s => ({
          title: s.title,
          link: s.link || s.url,
          snippet: s.snippet,
        }))
      } else if (ragDebugData?.search?.results && Array.isArray(ragDebugData.search.results)) {
        sources = ragDebugData.search.results.map(s => ({
          title: s.title,
          link: s.link,
          snippet: s.snippet,
        }))
      }

      const response = await api.post(`${API_URL}/api/leaderboard/submit`, {
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
    } catch (error) {
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

  return (
    <AnimatePresence>
      {isOpen && (
        <div
          onClick={handleClose}
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            zIndex: 10000,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: 'rgba(0, 0, 0, 0.5)',
            backdropFilter: 'blur(4px)',
          }}
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
              borderRadius: '16px',
              padding: '30px',
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
              style={{
                position: 'absolute',
                top: '16px',
                right: '16px',
                background: currentTheme.buttonBackground,
                border: `1px solid ${currentTheme.borderLight}`,
                borderRadius: '8px',
                padding: '6px',
                color: currentTheme.textSecondary,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <XCircle size={18} />
            </button>

            {promptPostedSuccess ? (
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '16px', padding: '20px 0' }}>
                <div style={{
                  width: '48px',
                  height: '48px',
                  borderRadius: '50%',
                  background: 'rgba(34, 197, 94, 0.15)',
                  border: '2px solid rgba(34, 197, 94, 0.5)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}>
                  <Check size={26} color="#22c55e" />
                </div>
                <p style={{ color: '#22c55e', margin: 0, fontSize: '1.1rem', fontWeight: '600' }}>
                  Posted to Prompt Feed!
                </p>
                <motion.button
                  onClick={handleClose}
                  style={{
                    marginTop: '4px',
                    padding: '10px 28px',
                    background: 'rgba(34, 197, 94, 0.15)',
                    border: '1px solid rgba(34, 197, 94, 0.4)',
                    borderRadius: '10px',
                    color: '#22c55e',
                    fontSize: '0.9rem',
                    fontWeight: '500',
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
                <h2 style={{
                  fontSize: '1.4rem',
                  margin: '0 0 6px 0',
                  background: currentTheme.accentGradient,
                  WebkitBackgroundClip: 'text',
                  WebkitTextFillColor: 'transparent',
                  paddingRight: '30px',
                }}>
                  Post to Prompt Feed
                </h2>

                {/* Description textarea */}
                <div style={{ marginBottom: '16px', marginTop: '16px' }}>
                  <label style={{
                    color: currentTheme.textSecondary,
                    fontSize: '0.75rem',
                    fontWeight: '500',
                    textTransform: 'uppercase',
                    letterSpacing: '0.5px',
                    display: 'block',
                    marginBottom: '8px',
                  }}>
                    Description (optional)
                  </label>
                  <textarea
                    value={postDescription}
                    onChange={(e) => setPostDescription(e.target.value)}
                    placeholder="Add context or thoughts about this prompt..."
                    maxLength={500}
                    style={{
                      width: '100%',
                      minHeight: '90px',
                      padding: '12px 14px',
                      background: currentTheme.buttonBackground,
                      border: `1px solid ${currentTheme.borderLight}`,
                      borderRadius: '10px',
                      color: currentTheme.text,
                      fontSize: '0.9rem',
                      lineHeight: '1.5',
                      resize: 'vertical',
                      outline: 'none',
                      fontFamily: 'inherit',
                      boxSizing: 'border-box',
                      transition: 'border-color 0.2s',
                    }}
                    onFocus={(e) => { e.target.style.borderColor = currentTheme.accent }}
                    onBlur={(e) => { e.target.style.borderColor = currentTheme.borderLight }}
                  />
                  <p style={{
                    color: currentTheme.textMuted || currentTheme.textSecondary,
                    fontSize: '0.72rem',
                    margin: '4px 0 0 0',
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
                    <div style={{
                      padding: '14px 16px',
                      background: currentTheme.buttonBackground,
                      border: `1px solid ${currentTheme.borderLight}`,
                      borderRadius: '10px',
                      marginBottom: '16px',
                    }}>
                      <p style={{
                        color: currentTheme.textSecondary,
                        fontSize: '0.75rem',
                        fontWeight: '500',
                        margin: '0 0 6px 0',
                        textTransform: 'uppercase',
                        letterSpacing: '0.5px',
                      }}>
                        Prompt
                      </p>
                      <p style={{
                        color: currentTheme.text,
                        fontSize: '0.95rem',
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
                              fontSize: '0.85rem',
                              fontWeight: '500',
                              marginLeft: '4px',
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
                              fontSize: '0.85rem',
                              fontWeight: '500',
                              marginLeft: '4px',
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
                  <div style={{ marginBottom: '20px' }}>
                    <label style={{
                      color: currentTheme.textSecondary,
                      fontSize: '0.75rem',
                      fontWeight: '500',
                      textTransform: 'uppercase',
                      letterSpacing: '0.5px',
                      display: 'block',
                      marginBottom: '8px',
                    }}>
                      Include in Post
                    </label>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    {/* Summary pull-down */}
                    {summary && (
                      <div style={{
                        background: currentTheme.buttonBackground,
                        border: `1px solid ${postIncludeSummary ? currentTheme.accent + '55' : currentTheme.borderLight}`,
                        borderRadius: '8px',
                        overflow: 'hidden',
                        opacity: postIncludeSummary ? 1 : 0.5,
                        transition: 'opacity 0.2s, border-color 0.2s',
                      }}>
                        <div style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: '0',
                        }}>
                          <button
                            onClick={() => setPostIncludeSummary(!postIncludeSummary)}
                            style={{
                              padding: '10px 0 10px 12px',
                              background: 'transparent',
                              border: 'none',
                              cursor: 'pointer',
                              display: 'flex',
                              alignItems: 'center',
                              flexShrink: 0,
                            }}
                          >
                            <div style={{
                              width: '20px',
                              height: '20px',
                              borderRadius: '5px',
                              border: postIncludeSummary ? 'none' : `2px solid ${currentTheme.textMuted || currentTheme.textSecondary}`,
                              background: postIncludeSummary ? currentTheme.accentGradient : 'transparent',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              transition: 'all 0.15s',
                            }}>
                              {postIncludeSummary && <Check size={14} color="#fff" strokeWidth={3} />}
                            </div>
                          </button>
                          <button
                            onClick={() => setPostActiveTab(postActiveTab === 'summary' ? null : 'summary')}
                            style={{
                              flex: 1,
                              padding: '10px 12px',
                              background: 'transparent',
                              border: 'none',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'space-between',
                              cursor: 'pointer',
                              color: currentTheme.text,
                            }}
                          >
                            <span style={{ fontSize: '0.9rem', fontWeight: '500' }}>Summary Response</span>
                            {postActiveTab === 'summary' ? (
                              <ChevronUp size={16} color={currentTheme.accent} />
                            ) : (
                              <ChevronDown size={16} color={currentTheme.accent} />
                            )}
                          </button>
                        </div>
                        {postActiveTab === 'summary' && (
                          <div style={{ padding: '12px', borderTop: `1px solid ${currentTheme.borderLight}`, maxHeight: '200px', overflowY: 'auto' }}>
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
                        borderRadius: '8px',
                        overflow: 'hidden',
                        opacity: isIncluded ? 1 : 0.5,
                        transition: 'opacity 0.2s, border-color 0.2s',
                      }}>
                        <div style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: '0',
                        }}>
                          <button
                            onClick={() => {
                              setPostExcludedResponses(prev => {
                                const next = new Set(prev)
                                if (next.has(idx)) next.delete(idx)
                                else next.add(idx)
                                return next
                              })
                            }}
                            style={{
                              padding: '10px 0 10px 12px',
                              background: 'transparent',
                              border: 'none',
                              cursor: 'pointer',
                              display: 'flex',
                              alignItems: 'center',
                              flexShrink: 0,
                            }}
                          >
                            <div style={{
                              width: '20px',
                              height: '20px',
                              borderRadius: '5px',
                              border: isIncluded ? 'none' : `2px solid ${currentTheme.textMuted || currentTheme.textSecondary}`,
                              background: isIncluded ? currentTheme.accentGradient : 'transparent',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              transition: 'all 0.15s',
                            }}>
                              {isIncluded && <Check size={14} color="#fff" strokeWidth={3} />}
                            </div>
                          </button>
                          <button
                            onClick={() => setPostActiveTab(postActiveTab === idx ? null : idx)}
                            style={{
                              flex: 1,
                              padding: '10px 12px',
                              background: 'transparent',
                              border: 'none',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'space-between',
                              cursor: 'pointer',
                              color: currentTheme.text,
                            }}
                          >
                            <span style={{ fontSize: '0.9rem', fontWeight: '500' }}>{r.modelName || `Model ${idx + 1}`} Response</span>
                            {postActiveTab === idx ? (
                              <ChevronUp size={16} color={currentTheme.accent} />
                            ) : (
                              <ChevronDown size={16} color={currentTheme.accent} />
                            )}
                          </button>
                        </div>
                        {postActiveTab === idx && (
                          <div style={{ padding: '12px', borderTop: `1px solid ${currentTheme.borderLight}`, maxHeight: '200px', overflowY: 'auto' }}>
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
                  <div style={{
                    display: 'flex', alignItems: 'center', gap: '8px',
                    marginBottom: '12px', padding: '10px 12px',
                    background: currentTheme.buttonBackground,
                    border: `1px solid ${currentTheme.borderLight}`,
                    borderRadius: '10px',
                  }}>
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
                          borderRadius: '8px',
                          color: postVisibility === v ? '#fff' : currentTheme.textSecondary,
                          fontSize: '0.8rem',
                          fontWeight: postVisibility === v ? '600' : '400',
                          cursor: 'pointer',
                          transition: 'all 0.15s',
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
                      color: '#ff6b6b',
                      fontSize: '0.78rem',
                      textAlign: 'center',
                      margin: '0 0 8px 0',
                    }}>
                      Select at least one response or the summary to include in your post
                    </p>
                  ) : null
                })()}
                <motion.button
                  onClick={handleSubmit}
                  disabled={isSubmittingToVote}
                  style={{
                    width: '100%',
                    padding: '12px',
                    background: currentTheme.accentGradient,
                    border: 'none',
                    borderRadius: '10px',
                    color: '#fff',
                    fontSize: '0.95rem',
                    fontWeight: '600',
                    cursor: isSubmittingToVote ? 'wait' : 'pointer',
                    opacity: isSubmittingToVote ? 0.7 : 1,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '8px',
                  }}
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
