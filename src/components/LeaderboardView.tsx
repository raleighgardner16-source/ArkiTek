import React, { useEffect, useState, useRef } from 'react'
import { motion } from 'framer-motion'
import { Heart, MessageSquare, Send, ChevronDown, ChevronUp, Calendar, Star, Trash2, Layers, Lock, Globe, Search, User, Users, Compass, X, Trophy, MessageCircle } from 'lucide-react'
import { useStore } from '../store/useStore'
import { getTheme } from '../utils/theme'
import { spacing, fontSize, fontWeight, radius, zIndex, transition, layout, sx, createStyles } from '../utils/styles'
import api from '../utils/api'
import MessagingView from './MessagingView'

// All available categories for filtering
const CATEGORIES = [
  'All',
  'Science',
  'Tech',
  'Business',
  'Health',
  'Politics/Law',
  'History/Geography',
  'Philosophy/Religion',
  'Arts/Culture',
  'Lifestyle/Self-Improvement',
  'General Knowledge/Other',
]

interface Props {
  subscriptionRestricted?: boolean
}

const LeaderboardView = ({ subscriptionRestricted = false }: Props) => {
  const currentUser = useStore((state: any) => state.currentUser)
  const setViewingProfile = useStore((state: any) => state.setViewingProfile)
  const clearViewingProfile = useStore((state: any) => state.clearViewingProfile)
  const setActiveTab = useStore((state: any) => state.setActiveTab)
  const theme = useStore((state: any) => state.theme || 'dark')
  const currentTheme = getTheme(theme)
  const s = createStyles(currentTheme)
  const isNavExpanded = useStore((state: any) => state.isNavExpanded)
  const winningPrompts = useStore((state: any) => state.winningPrompts)
  const [activeSection, setActiveSection] = useState('myfeed') // 'myfeed', 'browse', 'search'
  const [selectedCategory, setSelectedCategory] = useState('All') // Category filter
  const [userSearchQuery, setUserSearchQuery] = useState('')
  const [userSearchResults, setUserSearchResults] = useState<any[]>([])
  const [searchingUsers, setSearchingUsers] = useState(false)
  const [showSearchResults, setShowSearchResults] = useState(false)
  const searchTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const searchContainerRef = useRef<HTMLDivElement | null>(null)
  const [leaderboardPrompts, setLeaderboardPrompts] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [expandedComments, setExpandedComments] = useState<Record<string, any>>({})
  const [expandedReplies, setExpandedReplies] = useState<Record<string, any>>({})
  const [commentTexts, setCommentTexts] = useState<Record<string, any>>({})
  const [replyTexts, setReplyTexts] = useState<Record<string, any>>({})
  const [expandedResponses, setExpandedResponses] = useState<Record<string, any>>({})
  const [expandedSummary, setExpandedSummary] = useState<Record<string, any>>({})
  const [expandedFacts, setExpandedFacts] = useState<Record<string, any>>({})
  const [showResponseSection, setShowResponseSection] = useState<Record<string, any>>({})
  const [hoveredOwnLike, setHoveredOwnLike] = useState<string | null>(null)
  const [expandedPromptText, setExpandedPromptText] = useState<Record<string, any>>({})
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null)
  const [deleting, setDeleting] = useState(false)
  const [showReplyInput, setShowReplyInput] = useState<Record<string, any>>({})
  const [deleteCommentConfirm, setDeleteCommentConfirm] = useState<string | null>(null)
  const [deleteReplyConfirm, setDeleteReplyConfirm] = useState<string | null>(null)

  // Force to search section when subscription is restricted
  useEffect(() => {
    if (subscriptionRestricted && activeSection !== 'search') {
      setActiveSection('search')
    }
  }, [subscriptionRestricted, activeSection])

  const leaderboardRefreshTrigger = useStore((state: any) => state.leaderboardRefreshTrigger)

  useEffect(() => {
    if (activeSection === 'myfeed' || activeSection === 'search') {
      setSelectedCategory('All')
    }
    fetchLeaderboard()
  }, [currentUser, activeSection, leaderboardRefreshTrigger])

  // Debounced user search
  useEffect(() => {
    if (!userSearchQuery.trim()) {
      setUserSearchResults([])
      setShowSearchResults(false)
      return
    }
    setSearchingUsers(true)
    setShowSearchResults(true)
    if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current)
    searchTimeoutRef.current = setTimeout(async () => {
      try {
        const response = await api.get(`/users/search?q=${encodeURIComponent(userSearchQuery.trim())}`)
        setUserSearchResults(response.data.users || [])
      } catch (error: any) {
        console.error('Error searching users:', error)
        setUserSearchResults([])
      } finally {
        setSearchingUsers(false)
      }
    }, 300)
    return () => { if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current) }
  }, [userSearchQuery])

  // Close search dropdown on outside click
  useEffect(() => {
    const handleClickOutside = (e: any) => {
      if (searchContainerRef.current && !searchContainerRef.current.contains(e.target)) {
        setShowSearchResults(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  const fetchLeaderboard = async () => {
    if (activeSection === 'search' || activeSection === 'messages') {
      setLoading(false)
      return
    }
    try {
      setLoading(true)
      let url = '/leaderboard'
      
      if (activeSection === 'myfeed') {
        const params = new URLSearchParams({ filter: 'myfeed' })
        if (currentUser?.id) params.set('userId', currentUser.id)
        url += `?${params.toString()}`
      } else if (activeSection === 'browse') {
        const params = new URLSearchParams({ filter: 'browse' })
        if (currentUser?.id) params.set('userId', currentUser.id)
        url += `?${params.toString()}`
      } else if (activeSection === 'today') {
        url += '?filter=today'
      } else if (activeSection === 'alltime') {
        url += '?filter=alltime'
      }
      
      const response = await api.get(url)
      setLeaderboardPrompts(response.data.prompts || [])
    } catch (error: any) {
      console.error('Error fetching leaderboard:', error)
      setLeaderboardPrompts([])
    } finally {
      setLoading(false)
    }
  }

  const handleLikePrompt = async (promptId: any) => {
    if (!currentUser?.id) return
    
    try {
      const response = await api.post('/leaderboard/like', {
        promptId,
      })
      
      if (response.data.success) {
        await fetchLeaderboard()
      }
    } catch (error: any) {
      console.error('Error liking prompt:', error)
      if (error.response?.data?.error) {
        alert(error.response.data.error)
      }
    }
  }

  const handleDeletePrompt = async (promptId: any) => {
    if (!currentUser?.id) return
    
    setDeleting(true)
    try {
      const response = await api.delete(`/leaderboard/delete/${promptId}`)
      
      if (response.data.success) {
        setDeleteConfirm(null)
        await fetchLeaderboard()
        useStore.getState().triggerLeaderboardRefresh()
      }
    } catch (error: any) {
      console.error('Error deleting prompt:', error)
      if (error.response?.data?.error) {
        alert(error.response.data.error)
      }
    } finally {
      setDeleting(false)
    }
  }

  const handleAddComment = async (promptId: any) => {
    if (!currentUser?.id || !commentTexts[promptId]?.trim()) return
    
    try {
      const response = await api.post('/leaderboard/comment', {
        promptId,
        commentText: commentTexts[promptId],
      })
      
      if (response.data.success) {
        setCommentTexts({ ...commentTexts, [promptId]: '' })
        await fetchLeaderboard()
      }
    } catch (error: any) {
      console.error('Error adding comment:', error)
      if (error.response?.data?.error) {
        alert(error.response.data.error)
      }
    }
  }

  const handleReplyToComment = async (promptId: any, commentId: any) => {
    if (!currentUser?.id || !replyTexts[`${commentId}`]?.trim()) return
    
    try {
      const response = await api.post('/leaderboard/comment/reply', {
        promptId,
        commentId,
        replyText: replyTexts[commentId],
      })
      
      if (response.data.success) {
        setReplyTexts({ ...replyTexts, [commentId]: '' })
        await fetchLeaderboard()
      }
    } catch (error: any) {
      console.error('Error adding reply:', error)
      if (error.response?.data?.error) {
        alert(error.response.data.error)
      }
    }
  }

  const handleLikeComment = async (promptId: any, commentId: any) => {
    if (!currentUser?.id) return
    
    try {
      const response = await api.post('/leaderboard/comment/like', {
        promptId,
        commentId,
      })
      
      if (response.data.success) {
        await fetchLeaderboard()
      }
    } catch (error: any) {
      console.error('Error liking comment:', error)
      if (error.response?.data?.error) {
        alert(error.response.data.error)
      }
    }
  }

  const handleDeleteComment = async (promptId: any, commentId: any) => {
    if (!currentUser?.id) return
    
    try {
      const response = await api.delete(`/leaderboard/comment/delete/${commentId}`, {
        data: { promptId }
      })
      
      if (response.data.success) {
        setDeleteCommentConfirm(null)
        await fetchLeaderboard()
      }
    } catch (error: any) {
      console.error('Error deleting comment:', error)
      if (error.response?.data?.error) {
        alert(error.response.data.error)
      }
    }
  }

  const handleDeleteReply = async (promptId: any, commentId: any, replyId: any) => {
    if (!currentUser?.id) return
    
    try {
      const response = await api.delete(`/leaderboard/comment/reply/delete/${replyId}`, {
        data: { promptId, commentId }
      })
      
      if (response.data.success) {
        setDeleteReplyConfirm(null)
        await fetchLeaderboard()
      }
    } catch (error: any) {
      console.error('Error deleting reply:', error)
      if (error.response?.data?.error) {
        alert(error.response.data.error)
      }
    }
  }

  const formatDate = (dateString: any) => {
    const date = new Date(dateString)
    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    })
  }

  const renderPromptCard = (prompt: any) => {
    const isLiked = currentUser?.id && prompt.likes?.includes(currentUser.id)
    const isOwnPrompt = currentUser?.id === prompt.userId
    const comments = prompt.comments || []
    const isCommentsExpanded = expandedComments[prompt.id]
    
    return (
      <div
        key={prompt.id}
        style={sx(s.card, {
          background: currentTheme.backgroundOverlay,
        })}
      >
        {/* Username, Category, and Date */}
        <div style={sx(layout.spaceBetween, { marginBottom: spacing.xl })}>
          <div style={sx(layout.flexRow, { gap: '10px' })}>
            <div
              onClick={(e) => {
                e.stopPropagation()
                if (prompt.userId === currentUser?.id) {
                  useStore.getState().clearViewingProfile()
                } else {
                  setViewingProfile({ userId: prompt.userId, username: prompt.username })
                }
                setActiveTab('statistics')
              }}
              style={sx(layout.center, {
                width: '32px', height: '32px', borderRadius: radius.circle,
                background: prompt.profileImage ? 'none' : currentTheme.accentGradient,
                overflow: 'hidden', flexShrink: 0, cursor: 'pointer',
              })}
            >
              {prompt.profileImage ? (
                <img src={prompt.profileImage} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
              ) : (
                <User size={14} color="#fff" />
              )}
            </div>
            <p
              onClick={(e) => {
                e.stopPropagation()
                if (prompt.userId === currentUser?.id) {
                  useStore.getState().clearViewingProfile()
                } else {
                  setViewingProfile({ userId: prompt.userId, username: prompt.username })
                }
                setActiveTab('statistics')
              }}
              style={{ color: currentTheme.accent, fontSize: fontSize['2xl'], fontWeight: fontWeight.semibold, margin: 0, cursor: 'pointer' }}
              onMouseEnter={(e) => { e.currentTarget.style.textDecoration = 'underline' }}
              onMouseLeave={(e) => { e.currentTarget.style.textDecoration = 'none' }}
            >
              {prompt.username}
            </p>
            {prompt.category && (
              <span
                style={{
                  padding: `${spacing.xs} 10px`,
                  background: theme === 'light' ? 'rgba(0, 150, 150, 0.1)' : 'rgba(93, 173, 226, 0.1)',
                  border: `1px solid ${theme === 'light' ? 'rgba(0, 150, 150, 0.3)' : 'rgba(93, 173, 226, 0.3)'}`,
                  borderRadius: radius.xl,
                  color: currentTheme.accent,
                  fontSize: '0.75rem',
                  fontWeight: fontWeight.medium,
                }}
              >
                {prompt.category}
              </span>
            )}
            {winningPrompts?.some((w: any) => w.promptId === prompt.id) && (
              <span style={sx(layout.flexRow, {
                padding: '3px 9px', borderRadius: radius.lg, fontSize: fontSize.xs, fontWeight: fontWeight.bold,
                background: 'linear-gradient(135deg, rgba(255, 215, 0, 0.15), rgba(255, 165, 0, 0.15))',
                border: '1px solid rgba(255, 215, 0, 0.3)',
                color: '#FFD700',
                gap: spacing.xs,
                textTransform: 'uppercase', letterSpacing: '0.5px',
              })}>
                <Trophy size={11} /> Winning Chat
              </span>
            )}
          </div>
          <span style={sx(s.mutedText, { fontSize: fontSize.base })}>
            {formatDate(prompt.createdAt)}
          </span>
        </div>
        
        {/* Description */}
        {prompt.description && (
          <p style={{ 
            color: currentTheme.textSecondary, 
            fontSize: fontSize.lg, 
            margin: '0 0 10px 0', 
            lineHeight: '1.5',
            fontStyle: 'italic',
          }}>
            {prompt.description}
          </p>
        )}
        
        {/* Prompt Text — with 50-word truncation */}
        {(() => {
          const words = (prompt.promptText || '').split(/\s+/)
          const isTruncated = words.length > 50
          const isExpanded = expandedPromptText[prompt.id]
          const displayText = (!isExpanded && isTruncated) ? words.slice(0, 50).join(' ') : prompt.promptText
          return (
            <p style={{ color: currentTheme.text, fontSize: fontSize['3xl'], margin: `0 0 ${spacing.xl} 0`, lineHeight: '1.6' }}>
              {displayText}
              {isTruncated && !isExpanded && (
                <span
                  onClick={() => setExpandedPromptText(prev => ({ ...prev, [prompt.id]: true }))}
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
              {isTruncated && isExpanded && (
                <span
                  onClick={() => setExpandedPromptText(prev => ({ ...prev, [prompt.id]: false }))}
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
          )
        })()}
        
        {/* See Responses Button and Content */}
        {(prompt.responses || prompt.summary || prompt.sources) && (
          <div style={{ marginBottom: spacing.xl }}>
            <button
              onClick={() => setShowResponseSection({ ...showResponseSection, [prompt.id]: !showResponseSection[prompt.id] })}
              style={sx(layout.flexRow, {
                padding: `10px ${spacing['2xl']}`,
                background: showResponseSection[prompt.id] ? currentTheme.buttonBackgroundHover : currentTheme.buttonBackground,
                border: `1px solid ${currentTheme.borderLight}`,
                borderRadius: radius.md,
                color: currentTheme.accent,
                fontSize: fontSize.xl,
                fontWeight: fontWeight.medium,
                cursor: 'pointer',
                gap: spacing.md,
                marginBottom: showResponseSection[prompt.id] ? spacing.lg : '0',
                transition: transition.normal,
              })}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = currentTheme.buttonBackgroundHover
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = showResponseSection[prompt.id] ? currentTheme.buttonBackgroundHover : currentTheme.buttonBackground
              }}
            >
              {showResponseSection[prompt.id] ? (
                <>
                  <ChevronUp size={18} />
                  Hide Responses
                </>
              ) : (
                <>
                  <ChevronDown size={18} />
                  See Responses ({prompt.responses?.length || 0})
                </>
              )}
            </button>
            
            {showResponseSection[prompt.id] && (
              <div style={sx(layout.flexCol, { gap: spacing.md })}>
            {/* Summary */}
            {prompt.summary && (
              <div
                style={{
                  background: currentTheme.backgroundSecondary,
                  border: `1px solid ${currentTheme.borderLight}`,
                  borderRadius: radius.md,
                  overflow: 'hidden',
                }}
              >
                <button
                  onClick={() => setExpandedSummary({ ...expandedSummary, [prompt.id]: !expandedSummary[prompt.id] })}
                  style={sx(layout.spaceBetween, {
                    width: '100%',
                    padding: `10px ${spacing.lg}`,
                    background: 'transparent',
                    border: 'none',
                    cursor: 'pointer',
                    color: currentTheme.text,
                  })}
                >
                  <span style={{ fontSize: fontSize.lg, fontWeight: fontWeight.medium }}>Summary</span>
                  {expandedSummary[prompt.id] ? (
                    <ChevronUp size={16} color={currentTheme.accent} />
                  ) : (
                    <ChevronDown size={16} color={currentTheme.accent} />
                  )}
                </button>
                {expandedSummary[prompt.id] && (
                  <div style={{ padding: spacing.lg, borderTop: `1px solid ${currentTheme.borderLight}` }}>
                    <div style={{ color: currentTheme.textSecondary, fontSize: fontSize.base, lineHeight: '1.5', whiteSpace: 'pre-wrap' }}>
                      {typeof prompt.summary === 'string' ? prompt.summary : prompt.summary.text || JSON.stringify(prompt.summary)}
                    </div>
                  </div>
                )}
              </div>
            )}

                {/* Council Responses */}
                {prompt.responses && prompt.responses.length > 0 && (
                  <div
                    style={{
                      background: currentTheme.backgroundSecondary,
                      border: `1px solid ${currentTheme.borderLight}`,
                      borderRadius: radius.md,
                      overflow: 'hidden',
                    }}
                  >
                    <button
                      onClick={() => setExpandedResponses({ ...expandedResponses, [prompt.id]: !expandedResponses[prompt.id] })}
                      style={sx(layout.spaceBetween, {
                        width: '100%',
                        padding: `10px ${spacing.lg}`,
                        background: 'transparent',
                        border: 'none',
                        cursor: 'pointer',
                        color: currentTheme.text,
                      })}
                    >
                      <span style={{ fontSize: fontSize.lg, fontWeight: fontWeight.medium }}>
                        Council Responses ({prompt.responses.length})
                      </span>
                      {expandedResponses[prompt.id] ? (
                        <ChevronUp size={16} color={currentTheme.accent} />
                      ) : (
                        <ChevronDown size={16} color={currentTheme.accent} />
                      )}
                    </button>
                    {expandedResponses[prompt.id] && (
                      <div style={{ padding: spacing.lg, borderTop: `1px solid ${currentTheme.borderLight}` }}>
                        <div style={sx(layout.flexCol, { gap: spacing.lg })}>
                          {prompt.responses.map((response: any, idx: number) => (
                            <div
                              key={idx}
                              style={{
                                background: currentTheme.backgroundTertiary,
                                border: `1px solid ${currentTheme.borderLight}`,
                                borderRadius: radius.sm,
                                padding: spacing.lg,
                              }}
                            >
                              <div style={{ color: currentTheme.accent, fontSize: fontSize.base, fontWeight: fontWeight.semibold, marginBottom: spacing.sm }}>
                                {response.modelName}
                              </div>
                              <div style={{ color: currentTheme.textSecondary, fontSize: fontSize.base, lineHeight: '1.5', whiteSpace: 'pre-wrap' }}>
                                {response.text}
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )}
            
            {/* Sources */}
            {prompt.sources && prompt.sources.length > 0 && (
              <div
                style={{
                  background: currentTheme.backgroundSecondary,
                  border: `1px solid ${currentTheme.borderLight}`,
                  borderRadius: radius.md,
                  overflow: 'hidden',
                }}
              >
                <button
                  onClick={() => setExpandedFacts({ ...expandedFacts, [prompt.id]: !expandedFacts[prompt.id] })}
                  style={sx(layout.spaceBetween, {
                    width: '100%',
                    padding: `10px ${spacing.lg}`,
                    background: 'transparent',
                    border: 'none',
                    cursor: 'pointer',
                    color: currentTheme.text,
                  })}
                >
                  <span style={sx(layout.flexRow, { fontSize: fontSize.lg, fontWeight: fontWeight.medium, gap: spacing.sm })}>
                    <Globe size={14} />
                    Sources ({prompt.sources.length})
                  </span>
                  {expandedFacts[prompt.id] ? (
                    <ChevronUp size={16} color={currentTheme.accent} />
                  ) : (
                    <ChevronDown size={16} color={currentTheme.accent} />
                  )}
                </button>
                {expandedFacts[prompt.id] && (
                  <div style={{ padding: spacing.lg, borderTop: `1px solid ${currentTheme.borderLight}` }}>
                    <div style={sx(layout.flexCol, { gap: spacing.md })}>
                      {prompt.sources.map((source: any, idx: number) => (
                        <div
                          key={idx}
                          style={{
                            background: currentTheme.backgroundTertiary,
                            border: `1px solid ${currentTheme.borderLight}`,
                            borderRadius: radius.sm,
                            padding: '10px',
                          }}
                        >
                          <a
                            href={source.link}
                            target="_blank"
                            rel="noopener noreferrer"
                            style={{ color: currentTheme.accent, fontSize: fontSize.base, fontWeight: fontWeight.semibold, textDecoration: 'none' }}
                          >
                            {source.title}
                          </a>
                          {source.snippet && (
                            <div style={{ color: currentTheme.textSecondary, fontSize: '0.75rem', marginTop: spacing.xs }}>
                              {source.snippet}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
              </div>
            )}
          </div>
        )}
        
        {/* Action Buttons */}
        <div style={sx(layout.flexRow, { gap: spacing.lg, marginBottom: spacing.xl })}>
          {isOwnPrompt ? (
            <div 
              style={{ position: 'relative' }}
              onMouseEnter={() => setHoveredOwnLike(`button-${prompt.id}`)}
              onMouseLeave={() => setHoveredOwnLike(null)}
            >
              <button
                disabled
                style={sx(layout.flexRow, {
                  padding: `10px ${spacing['2xl']}`,
                  background: 'rgba(128, 128, 128, 0.1)',
                  border: '1px solid rgba(128, 128, 128, 0.3)',
                  borderRadius: radius.md,
                  color: currentTheme.textMuted,
                  fontSize: fontSize.xl,
                  fontWeight: fontWeight.medium,
                  cursor: 'not-allowed',
                  gap: spacing.md,
                  opacity: 0.6,
                  pointerEvents: 'none',
                })}
              >
                <Heart 
                  size={18} 
                  fill="transparent" 
                  color={currentTheme.textMuted} 
                />
                Like
                {(prompt.likes?.length || 0) > 0 && (
                  <span style={{ 
                    marginLeft: spacing['2xs'],
                    fontSize: fontSize.base,
                    color: currentTheme.textMuted,
                  }}>
                    ({prompt.likes.length})
                  </span>
                )}
              </button>
              {hoveredOwnLike === `button-${prompt.id}` && (
                <div
                  style={{
                    position: 'absolute',
                    bottom: '100%',
                    left: '50%',
                    transform: 'translateX(-50%)',
                    marginBottom: spacing.md,
                    padding: `${spacing.md} ${spacing.lg}`,
                    background: 'rgba(0, 0, 0, 0.9)',
                    border: '1px solid rgba(255, 255, 255, 0.2)',
                    borderRadius: radius.sm,
                    color: '#fff',
                    fontSize: fontSize.base,
                    whiteSpace: 'nowrap',
                    zIndex: zIndex.sticky,
                    boxShadow: '0 4px 12px rgba(0, 0, 0, 0.3)',
                  }}
                >
                  You can't like your own prompt
                  <div
                    style={{
                      position: 'absolute',
                      top: '100%',
                      left: '50%',
                      transform: 'translateX(-50%)',
                      width: 0,
                      height: 0,
                      borderLeft: '6px solid transparent',
                      borderRight: '6px solid transparent',
                      borderTop: '6px solid rgba(0, 0, 0, 0.9)',
                    }}
                  />
                </div>
              )}
            </div>
          ) : (
            <button
              onClick={() => handleLikePrompt(prompt.id)}
              style={sx(layout.flexRow, {
                padding: `10px ${spacing['2xl']}`,
                background: isLiked ? 'rgba(255, 107, 107, 0.2)' : currentTheme.buttonBackground,
                border: `1px solid ${isLiked ? 'rgba(255, 107, 107, 0.5)' : currentTheme.borderLight}`,
                borderRadius: radius.md,
                color: isLiked ? currentTheme.error : currentTheme.accent,
                fontSize: fontSize.xl,
                fontWeight: fontWeight.medium,
                cursor: 'pointer',
                gap: spacing.md,
                transition: transition.normal,
              })}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = isLiked ? 'rgba(255, 107, 107, 0.3)' : currentTheme.buttonBackgroundHover
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = isLiked ? 'rgba(255, 107, 107, 0.2)' : currentTheme.buttonBackground
              }}
            >
              <Heart 
                size={18} 
                fill={isLiked ? currentTheme.error : 'transparent'} 
                color={isLiked ? currentTheme.error : currentTheme.accent} 
              />
              {isLiked ? 'Liked' : 'Like'}
              {(prompt.likes?.length || 0) > 0 && (
                <span style={{ 
                  marginLeft: spacing['2xs'],
                  fontSize: fontSize.base,
                  color: isLiked ? currentTheme.error : currentTheme.accent,
                }}>
                  ({prompt.likes.length})
                </span>
              )}
            </button>
          )}
          
          {currentUser && (
            <button
              onClick={() => setExpandedComments({ ...expandedComments, [prompt.id]: !isCommentsExpanded })}
              style={sx(layout.flexRow, {
                padding: `10px ${spacing['2xl']}`,
                background: currentTheme.buttonBackground,
                border: `1px solid ${currentTheme.borderLight}`,
                borderRadius: radius.md,
                color: currentTheme.accent,
                fontSize: fontSize.xl,
                fontWeight: fontWeight.medium,
                cursor: 'pointer',
                gap: spacing.md,
                transition: transition.normal,
              })}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = currentTheme.buttonBackgroundHover
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = currentTheme.buttonBackground
              }}
            >
              <MessageSquare size={18} />
              Comments ({comments.length})
              {isCommentsExpanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
            </button>
          )}
          
          {/* Delete Button */}
          {isOwnPrompt && (
            <button
              onClick={() => {
                if (deleteConfirm === prompt.id) {
                  handleDeletePrompt(prompt.id)
                } else {
                  setDeleteConfirm(prompt.id)
                }
              }}
              onBlur={() => { if (!deleting) setDeleteConfirm(null) }}
              disabled={deleting}
              style={sx(layout.flexRow, {
                padding: `10px ${spacing['2xl']}`,
                background: deleteConfirm === prompt.id ? 'rgba(255, 80, 80, 0.25)' : 'rgba(255, 80, 80, 0.1)',
                border: `1px solid ${deleteConfirm === prompt.id ? 'rgba(255, 80, 80, 0.6)' : 'rgba(255, 80, 80, 0.3)'}`,
                borderRadius: radius.md,
                color: '#ff5050',
                fontSize: fontSize.xl,
                fontWeight: fontWeight.medium,
                cursor: deleting ? 'not-allowed' : 'pointer',
                gap: spacing.md,
                transition: transition.normal,
                opacity: deleting ? 0.7 : 1,
              })}
              onMouseEnter={(e) => {
                if (!deleting) e.currentTarget.style.background = 'rgba(255, 80, 80, 0.3)'
              }}
              onMouseLeave={(e) => {
                if (!deleting) e.currentTarget.style.background = deleteConfirm === prompt.id ? 'rgba(255, 80, 80, 0.25)' : 'rgba(255, 80, 80, 0.1)'
              }}
            >
              <Trash2 size={18} />
              {deleting ? 'Deleting...' : deleteConfirm === prompt.id ? 'Confirm Delete' : 'Delete Post'}
            </button>
          )}
        </div>

        {/* Comments Section */}
        {isCommentsExpanded && currentUser && (
          <div style={{ marginTop: spacing['2xl'], paddingTop: spacing['2xl'], borderTop: '1px solid rgba(93, 173, 226, 0.2)' }}>
            {/* Add Comment */}
            <div style={{ marginBottom: spacing['2xl'], position: 'relative' }}>
              <textarea
                value={commentTexts[prompt.id] || ''}
                onChange={(e) => setCommentTexts({ ...commentTexts, [prompt.id]: e.target.value })}
                placeholder="Add a comment..."
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey && commentTexts[prompt.id]?.trim()) {
                    e.preventDefault()
                    handleAddComment(prompt.id)
                  }
                }}
                style={{
                  width: '100%',
                  minHeight: '60px',
                  padding: `${spacing.lg} 45px ${spacing.lg} ${spacing.lg}`,
                  background: currentTheme.backgroundSecondary,
                  border: `1px solid ${currentTheme.borderLight}`,
                  borderRadius: radius.md,
                  color: currentTheme.text,
                  fontSize: fontSize.lg,
                  resize: 'vertical',
                  fontFamily: 'inherit',
                }}
              />
              <button
                onClick={() => handleAddComment(prompt.id)}
                disabled={!commentTexts[prompt.id]?.trim()}
                style={sx(layout.center, {
                  position: 'absolute',
                  right: '10px',
                  bottom: '10px',
                  padding: spacing.sm,
                  background: 'transparent',
                  border: 'none',
                  borderRadius: radius.circle,
                  color: commentTexts[prompt.id]?.trim() ? currentTheme.accent : currentTheme.textMuted,
                  cursor: commentTexts[prompt.id]?.trim() ? 'pointer' : 'not-allowed',
                  transition: transition.normal,
                })}
                title="Send (Enter)"
              >
                <Send size={18} />
              </button>
            </div>

            {/* Display Comments */}
            {comments.length > 0 ? (
              <div style={sx(layout.flexCol, { gap: spacing.xl })}>
                {comments.map((comment: any) => {
                  const isRepliesExpanded = expandedReplies[comment.id]
                  const isCommentLiked = currentUser?.id && comment.likes?.includes(currentUser.id)
                  const isOwnComment = currentUser?.id === comment.userId
                  const commentLikeCount = comment.likes?.length || 0
                  
                  return (
                    <div
                      key={comment.id}
                      style={{
                        background: currentTheme.backgroundSecondary,
                        border: '1px solid rgba(93, 173, 226, 0.2)',
                        borderRadius: radius.md,
                        padding: spacing.xl,
                      }}
                    >
                      <div style={{ display: 'flex', gap: '10px', marginBottom: spacing.md }}>
                        <div
                          onClick={(e) => {
                            e.stopPropagation()
                            if (comment.userId === currentUser?.id) {
                              useStore.getState().clearViewingProfile()
                            } else {
                              setViewingProfile({ userId: comment.userId, username: comment.username })
                            }
                            setActiveTab('statistics')
                          }}
                          style={sx(layout.center, {
                            width: '28px', height: '28px', borderRadius: radius.circle,
                            background: comment.profileImage ? 'none' : currentTheme.accentGradient,
                            overflow: 'hidden', flexShrink: 0, cursor: 'pointer', marginTop: spacing['2xs'],
                          })}
                        >
                          {comment.profileImage ? (
                            <img src={comment.profileImage} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                          ) : (
                            <User size={12} color="#fff" />
                          )}
                        </div>
                        <div style={{ flex: 1 }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                            <p
                              onClick={(e) => {
                                e.stopPropagation()
                                if (comment.userId === currentUser?.id) {
                                  useStore.getState().clearViewingProfile()
                                } else {
                                  setViewingProfile({ userId: comment.userId, username: comment.username })
                                }
                                setActiveTab('statistics')
                              }}
                              style={{ color: currentTheme.accent, fontSize: fontSize.lg, fontWeight: fontWeight.semibold, margin: `0 0 ${spacing.xs} 0`, cursor: 'pointer' }}
                              onMouseEnter={(e) => { e.currentTarget.style.textDecoration = 'underline' }}
                              onMouseLeave={(e) => { e.currentTarget.style.textDecoration = 'none' }}
                            >
                              {comment.username}
                            </p>
                            <p style={{ color: currentTheme.textMuted, fontSize: '0.75rem', margin: 0, whiteSpace: 'nowrap', marginLeft: spacing.lg }}>
                              {formatDate(comment.createdAt)}
                            </p>
                          </div>
                          <p style={{ color: currentTheme.textSecondary, fontSize: fontSize.base, margin: 0, lineHeight: '1.5' }}>
                            {comment.text}
                          </p>
                        </div>
                      </div>

                      {/* Comment Actions */}
                      <div style={sx(layout.flexRow, { gap: spacing.lg, marginTop: '10px' })}>
                        <button
                          onClick={() => !isOwnComment && handleLikeComment(prompt.id, comment.id)}
                          disabled={isOwnComment}
                          style={sx(layout.flexRow, {
                            padding: '0',
                            background: 'transparent',
                            border: 'none',
                            color: isCommentLiked ? currentTheme.error : isOwnComment ? currentTheme.textMuted : currentTheme.textSecondary,
                            fontSize: fontSize.md,
                            cursor: isOwnComment ? 'not-allowed' : 'pointer',
                            gap: spacing.xs,
                            opacity: isOwnComment ? 0.5 : 1,
                            transition: transition.normal,
                          })}
                          title={isOwnComment ? "You can't like your own comment" : (isCommentLiked ? 'Unlike' : 'Like')}
                        >
                          <Heart 
                            size={14} 
                            fill={isCommentLiked ? currentTheme.error : 'transparent'} 
                            color={isCommentLiked ? currentTheme.error : currentTheme.textSecondary} 
                          />
                          {commentLikeCount > 0 ? commentLikeCount : 'Like'}
                        </button>

                        <button
                          onClick={() => setShowReplyInput({ ...showReplyInput, [comment.id]: !showReplyInput[comment.id] })}
                          style={sx(layout.flexRow, {
                            padding: '0',
                            background: 'transparent',
                            border: 'none',
                            color: currentTheme.textSecondary,
                            fontSize: fontSize.md,
                            cursor: 'pointer',
                            gap: spacing.xs,
                          })}
                        >
                          Reply
                        </button>

                        {comment.replies && comment.replies.length > 0 && (
                          <button
                            onClick={() => setExpandedReplies({ ...expandedReplies, [comment.id]: !isRepliesExpanded })}
                            style={sx(layout.flexRow, {
                              padding: '0',
                              background: 'transparent',
                              border: 'none',
                              color: currentTheme.accent,
                              fontSize: fontSize.md,
                              cursor: 'pointer',
                              gap: spacing.xs,
                            })}
                          >
                            {isRepliesExpanded ? 'Hide' : 'View'} {comment.replies.length} {comment.replies.length === 1 ? 'reply' : 'replies'}
                          </button>
                        )}

                        {isOwnComment && (
                          <button
                            onClick={() => setDeleteCommentConfirm(comment.id)}
                            style={{
                              padding: '0',
                              background: 'transparent',
                              border: 'none',
                              color: '#ff5050',
                              fontSize: fontSize.md,
                              cursor: 'pointer',
                              marginLeft: 'auto',
                            }}
                          >
                            Delete
                          </button>
                        )}
                      </div>

                      {/* Delete Confirmation */}
                      {deleteCommentConfirm === comment.id && (
                        <div style={sx(layout.flexRow, { 
                          marginTop: '10px', 
                          padding: '10px', 
                          background: 'rgba(255, 80, 80, 0.1)', 
                          borderRadius: radius.sm,
                          gap: '10px',
                        })}>
                          <span style={{ color: currentTheme.text, fontSize: fontSize.md }}>Delete this comment?</span>
                          <button
                            onClick={() => handleDeleteComment(prompt.id, comment.id)}
                            style={{
                              padding: `${spacing.xs} 10px`,
                              background: 'rgba(255, 80, 80, 0.2)',
                              border: 'none',
                              borderRadius: radius.xs,
                              color: '#ff5050',
                              fontSize: '0.75rem',
                              cursor: 'pointer',
                            }}
                          >
                            Yes
                          </button>
                          <button
                            onClick={() => setDeleteCommentConfirm(null)}
                            style={{
                              padding: `${spacing.xs} 10px`,
                              background: currentTheme.buttonBackground,
                              border: 'none',
                              borderRadius: radius.xs,
                              color: currentTheme.text,
                              fontSize: '0.75rem',
                              cursor: 'pointer',
                            }}
                          >
                            No
                          </button>
                        </div>
                      )}

                      {/* Replies Display */}
                      {isRepliesExpanded && comment.replies && (
                        <div style={{ marginTop: spacing.lg, paddingLeft: spacing.xl, borderLeft: '2px solid rgba(93, 173, 226, 0.3)' }}>
                          {comment.replies.map((reply: any) => {
                            const isOwnReply = currentUser?.id === reply.userId
                            
                            return (
                              <div key={reply.id} style={{ marginBottom: spacing.lg, padding: spacing.lg, background: currentTheme.backgroundTertiary, borderRadius: radius.sm }}>
                                <div style={{ display: 'flex', gap: spacing.md }}>
                                  <div
                                    onClick={(e) => {
                                      e.stopPropagation()
                                      if (reply.userId === currentUser?.id) {
                                        useStore.getState().clearViewingProfile()
                                      } else {
                                        setViewingProfile({ userId: reply.userId, username: reply.username })
                                      }
                                      setActiveTab('statistics')
                                    }}
                                    style={sx(layout.center, {
                                      width: '22px', height: '22px', borderRadius: radius.circle,
                                      background: reply.profileImage ? 'none' : currentTheme.accentGradient,
                                      overflow: 'hidden', flexShrink: 0, cursor: 'pointer', marginTop: '1px',
                                    })}
                                  >
                                    {reply.profileImage ? (
                                      <img src={reply.profileImage} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                                    ) : (
                                      <User size={10} color="#fff" />
                                    )}
                                  </div>
                                  <div style={{ flex: 1 }}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: spacing.xs }}>
                                      <p
                                        onClick={(e) => {
                                          e.stopPropagation()
                                          if (reply.userId === currentUser?.id) {
                                            useStore.getState().clearViewingProfile()
                                          } else {
                                            setViewingProfile({ userId: reply.userId, username: reply.username })
                                          }
                                          setActiveTab('statistics')
                                        }}
                                        style={{ color: currentTheme.accentSecondary, fontSize: fontSize.base, fontWeight: fontWeight.semibold, margin: 0, cursor: 'pointer' }}
                                        onMouseEnter={(e) => { e.currentTarget.style.textDecoration = 'underline' }}
                                        onMouseLeave={(e) => { e.currentTarget.style.textDecoration = 'none' }}
                                      >
                                        {reply.username}
                                      </p>
                                      <p style={{ color: currentTheme.textMuted, fontSize: fontSize.xs, margin: 0 }}>
                                        {formatDate(reply.createdAt)}
                                      </p>
                                    </div>
                                    <p style={{ color: currentTheme.textSecondary, fontSize: fontSize.md, margin: 0, lineHeight: '1.4' }}>
                                      {reply.text}
                                    </p>
                                  </div>
                                </div>
                                
                                {/* Reply Actions */}
                                {isOwnReply && (
                                  <div style={{ marginTop: spacing.md }}>
                                    {deleteReplyConfirm === reply.id ? (
                                      <div style={sx(layout.flexRow, { gap: spacing.md })}>
                                        <span style={{ color: currentTheme.textMuted, fontSize: '0.75rem' }}>Delete?</span>
                                        <button
                                          onClick={() => handleDeleteReply(prompt.id, comment.id, reply.id)}
                                          style={{
                                            padding: `${spacing['2xs']} ${spacing.md}`,
                                            background: 'rgba(255, 80, 80, 0.2)',
                                            border: 'none',
                                            borderRadius: radius.xs,
                                            color: '#ff5050',
                                            fontSize: fontSize.xs,
                                            cursor: 'pointer',
                                          }}
                                        >
                                          Yes
                                        </button>
                                        <button
                                          onClick={() => setDeleteReplyConfirm(null)}
                                          style={{
                                            padding: `${spacing['2xs']} ${spacing.md}`,
                                            background: currentTheme.buttonBackground,
                                            border: 'none',
                                            borderRadius: radius.xs,
                                            color: currentTheme.text,
                                            fontSize: fontSize.xs,
                                            cursor: 'pointer',
                                          }}
                                        >
                                          No
                                        </button>
                                      </div>
                                    ) : (
                                      <button
                                        onClick={() => setDeleteReplyConfirm(reply.id)}
                                        style={{
                                          padding: '0',
                                          background: 'transparent',
                                          border: 'none',
                                          color: '#ff5050',
                                          fontSize: '0.75rem',
                                          cursor: 'pointer',
                                        }}
                                      >
                                        Delete
                                      </button>
                                    )}
                                  </div>
                                )}
                              </div>
                            )
                          })}
                        </div>
                      )}

                      {/* Reply Input */}
                      {currentUser && showReplyInput[comment.id] && (
                        <div style={{ marginTop: spacing.lg, position: 'relative' }}>
                          <input
                            type="text"
                            value={replyTexts[comment.id] || ''}
                            onChange={(e) => setReplyTexts({ ...replyTexts, [comment.id]: e.target.value })}
                            placeholder="Write a reply..."
                            onKeyDown={(e) => {
                              if (e.key === 'Enter' && replyTexts[comment.id]?.trim()) {
                                handleReplyToComment(prompt.id, comment.id)
                                setShowReplyInput({ ...showReplyInput, [comment.id]: false })
                              }
                            }}
                            autoFocus
                            style={{
                              width: '100%',
                              padding: `10px ${spacing['5xl']} 10px ${spacing.lg}`,
                              background: currentTheme.backgroundTertiary,
                              border: `1px solid ${currentTheme.borderLight}`,
                              borderRadius: radius['3xl'],
                              color: currentTheme.text,
                              fontSize: fontSize.base,
                              fontFamily: 'inherit',
                            }}
                          />
                          <button
                            onClick={() => {
                              if (replyTexts[comment.id]?.trim()) {
                                handleReplyToComment(prompt.id, comment.id)
                                setShowReplyInput({ ...showReplyInput, [comment.id]: false })
                              }
                            }}
                            disabled={!replyTexts[comment.id]?.trim()}
                            style={sx(layout.center, {
                              position: 'absolute',
                              right: spacing.md,
                              top: '50%',
                              transform: 'translateY(-50%)',
                              padding: spacing.xs,
                              background: 'transparent',
                              border: 'none',
                              color: replyTexts[comment.id]?.trim() ? currentTheme.accent : currentTheme.textMuted,
                              cursor: replyTexts[comment.id]?.trim() ? 'pointer' : 'not-allowed',
                            })}
                            title="Send reply (Enter)"
                          >
                            <Send size={16} />
                          </button>
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            ) : (
              <p style={{ color: currentTheme.textMuted, fontSize: fontSize.lg, fontStyle: 'italic', textAlign: 'center', padding: spacing['2xl'] }}>
                No comments yet. Be the first to comment!
              </p>
            )}
          </div>
        )}
      </div>
    )
  }

  const getSectionTitle = () => {
    switch (activeSection) {
      case 'myfeed':
        return 'My Feed'
      case 'browse':
        return 'Browse'
      case 'today':
        return "Today's Favorites"
      case 'alltime':
        return 'All Time Favorites'
      case 'search':
        return 'Search Users'
      case 'messages':
        return 'Messages'
      default:
        return 'Prompt Feed'
    }
  }

  const getSectionDescription = () => {
    switch (activeSection) {
      case 'myfeed':
        return 'Posts from the people you follow.'
      case 'browse':
        return 'Discover posts from the community.'
      case 'today':
        return "All prompts submitted today. Vote on your favorites!"
      case 'alltime':
        return 'The top 15 most liked prompts of all time.'
      case 'search':
        return 'Find and connect with other users.'
      case 'messages':
        return 'Private messages and group chats.'
      default:
        return 'Vote on prompts submitted by the community.'
    }
  }

  const navWidth = isNavExpanded ? '240px' : '60px'

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      style={sx(s.pageContainer(navWidth), {
        padding: spacing['5xl'],
        overflowY: 'auto',
        color: currentTheme.text,
      })}
    >
      <div
        style={{
          width: '100%',
          maxWidth: '1200px',
          margin: '0 auto',
        }}
      >
        {/* Header */}
        <div style={{ marginBottom: spacing['5xl'] }}>
          <h1
            key={`title-${theme}`}
            style={sx(s.pageTitle, { marginBottom: spacing.lg })}
          >
            {getSectionTitle()}
          </h1>
          <p style={sx(s.subtitle, { marginBottom: spacing.xl })}>
            {getSectionDescription()}
          </p>

          {/* Restricted mode notice */}
          {subscriptionRestricted && (
            <div
              style={sx(layout.flexRow, {
                padding: `${spacing.lg} 18px`,
                borderRadius: radius.lg,
                background: currentTheme.errorMuted,
                border: '1px solid rgba(255, 59, 48, 0.3)',
                gap: '10px',
                marginBottom: spacing.xl,
              })}
            >
              <Lock size={16} color={currentTheme.error} />
              <span style={{ color: currentTheme.error, fontSize: fontSize.base }}>
                Your subscription has expired. The Prompt Feed is limited. Resubscribe to view the full Prompt Feed.
              </span>
            </div>
          )}
          
          {/* Section Tabs */}
          <div
            style={{
              display: 'flex',
              marginTop: spacing['3xl'],
              marginBottom: '32px',
              borderBottom: `1px solid ${currentTheme.borderLight}`,
            }}
          >
            {!subscriptionRestricted && (
              <>
            <button
              onClick={() => setActiveSection('myfeed')}
              style={sx(layout.center, {
                flex: 1,
                padding: `14px ${spacing.lg}`,
                background: activeSection === 'myfeed' ? currentTheme.buttonBackgroundActive : 'transparent',
                border: 'none',
                borderBottom: activeSection === 'myfeed' ? `2px solid ${currentTheme.accent}` : '2px solid transparent',
                color: activeSection === 'myfeed' ? currentTheme.accent : currentTheme.textSecondary,
                fontSize: fontSize['2xl'],
                fontWeight: activeSection === 'myfeed' ? fontWeight.semibold : fontWeight.normal,
                cursor: 'pointer',
                transition: transition.normal,
                gap: spacing.md,
              })}
            >
              <Users size={20} />
              My Feed
            </button>
            
            <button
              onClick={() => setActiveSection('browse')}
              style={sx(layout.center, {
                flex: 1,
                padding: `14px ${spacing.lg}`,
                background: activeSection === 'browse' ? currentTheme.buttonBackgroundActive : 'transparent',
                border: 'none',
                borderBottom: activeSection === 'browse' ? `2px solid ${currentTheme.accent}` : '2px solid transparent',
                color: activeSection === 'browse' ? currentTheme.accent : currentTheme.textSecondary,
                fontSize: fontSize['2xl'],
                fontWeight: activeSection === 'browse' ? fontWeight.semibold : fontWeight.normal,
                cursor: 'pointer',
                transition: transition.normal,
                gap: spacing.md,
              })}
            >
              <Compass size={20} />
              Browse
            </button>

            <button
              onClick={() => setActiveSection('today')}
              style={sx(layout.center, {
                flex: 1,
                padding: `14px ${spacing.lg}`,
                background: activeSection === 'today' ? currentTheme.buttonBackgroundActive : 'transparent',
                border: 'none',
                borderBottom: activeSection === 'today' ? `2px solid ${currentTheme.accent}` : '2px solid transparent',
                color: activeSection === 'today' ? currentTheme.accent : currentTheme.textSecondary,
                fontSize: fontSize['2xl'],
                fontWeight: activeSection === 'today' ? fontWeight.semibold : fontWeight.normal,
                cursor: 'pointer',
                transition: transition.normal,
                gap: spacing.md,
              })}
            >
              <Calendar size={20} />
              Today's Favorites
            </button>

            <button
              onClick={() => setActiveSection('alltime')}
              style={sx(layout.center, {
                flex: 1,
                padding: `14px ${spacing.lg}`,
                background: activeSection === 'alltime' ? currentTheme.buttonBackgroundActive : 'transparent',
                border: 'none',
                borderBottom: activeSection === 'alltime' ? `2px solid ${currentTheme.accent}` : '2px solid transparent',
                color: activeSection === 'alltime' ? currentTheme.accent : currentTheme.textSecondary,
                fontSize: fontSize['2xl'],
                fontWeight: activeSection === 'alltime' ? fontWeight.semibold : fontWeight.normal,
                cursor: 'pointer',
                transition: transition.normal,
                gap: spacing.md,
              })}
            >
              <Star size={20} />
              All Time Favorites
            </button>
              </>
            )}
            <button
              onClick={() => setActiveSection('search')}
              style={sx(layout.center, {
                flex: 1,
                padding: `14px ${spacing.lg}`,
                background: activeSection === 'search' ? currentTheme.buttonBackgroundActive : 'transparent',
                border: 'none',
                borderBottom: activeSection === 'search' ? `2px solid ${currentTheme.accent}` : '2px solid transparent',
                color: activeSection === 'search' ? currentTheme.accent : currentTheme.textSecondary,
                fontSize: fontSize['2xl'],
                fontWeight: activeSection === 'search' ? fontWeight.semibold : fontWeight.normal,
                cursor: 'pointer',
                transition: transition.normal,
                gap: spacing.md,
              })}
            >
              <Search size={20} />
              Search Users
            </button>
            <button
              onClick={() => setActiveSection('messages')}
              style={sx(layout.center, {
                flex: 1,
                padding: `14px ${spacing.lg}`,
                background: activeSection === 'messages' ? currentTheme.buttonBackgroundActive : 'transparent',
                border: 'none',
                borderBottom: activeSection === 'messages' ? `2px solid ${currentTheme.accent}` : '2px solid transparent',
                color: activeSection === 'messages' ? currentTheme.accent : currentTheme.textSecondary,
                fontSize: fontSize['2xl'],
                fontWeight: activeSection === 'messages' ? fontWeight.semibold : fontWeight.normal,
                cursor: 'pointer',
                transition: transition.normal,
                gap: spacing.md,
              })}
            >
              <MessageCircle size={20} />
              Messages
            </button>
          </div>
          
          {/* Category Filter Tabs */}
          {activeSection !== 'search' && activeSection !== 'myfeed' && activeSection !== 'messages' && (
          <div
            style={{
              display: 'flex',
              flexWrap: 'wrap',
              gap: spacing.md,
              marginBottom: spacing['3xl'],
              padding: spacing.xl,
              background: theme === 'light' ? 'rgba(255, 255, 255, 0.7)' : 'rgba(0, 0, 0, 0.2)',
              borderRadius: radius.xl,
              border: `1px solid ${currentTheme.borderLight}`,
            }}
          >
            <div style={sx(layout.flexRow, { 
              gap: spacing.md, 
              marginRight: spacing.md,
              paddingRight: spacing.xl,
              borderRight: `1px solid ${currentTheme.borderLight}`,
            })}>
              <Layers size={18} color={currentTheme.accent} />
              <span style={{ color: currentTheme.textSecondary, fontSize: fontSize.lg, fontWeight: fontWeight.medium }}>
                Filter by Category:
              </span>
            </div>
            {CATEGORIES.map((category) => (
              <button
                key={category}
                onClick={() => setSelectedCategory(category)}
                style={{
                  padding: `${spacing.sm} 14px`,
                  background: selectedCategory === category 
                    ? (theme === 'light' ? 'rgba(0, 180, 180, 0.2)' : 'rgba(93, 173, 226, 0.15)')
                    : 'transparent',
                  border: `1px solid ${selectedCategory === category ? currentTheme.accent : currentTheme.borderLight}`,
                  borderRadius: radius['3xl'],
                  color: selectedCategory === category ? currentTheme.accent : currentTheme.textSecondary,
                  fontSize: fontSize.base,
                  fontWeight: selectedCategory === category ? fontWeight.semibold : fontWeight.normal,
                  cursor: 'pointer',
                  transition: transition.normal,
                  whiteSpace: 'nowrap',
                }}
                onMouseEnter={(e) => {
                  if (selectedCategory !== category) {
                    e.currentTarget.style.borderColor = currentTheme.accent
                    e.currentTarget.style.color = currentTheme.accent
                  }
                }}
                onMouseLeave={(e) => {
                  if (selectedCategory !== category) {
                    e.currentTarget.style.borderColor = currentTheme.borderLight
                    e.currentTarget.style.color = currentTheme.textSecondary
                  }
                }}
              >
                {category}
              </button>
            ))}
          </div>
          )}
          
        </div>

        {/* Messages Section */}
        {activeSection === 'messages' && (
          <div style={{ height: 'calc(100vh - 320px)', minHeight: '500px' }}>
            <MessagingView />
          </div>
        )}

        {/* Search Users Section */}
        {activeSection === 'search' && (
          <div ref={searchContainerRef}>
            <div style={sx(layout.flexRow, {
              gap: '10px',
              padding: `${spacing.lg} ${spacing.xl}`, marginBottom: spacing['2xl'],
              background: currentTheme.buttonBackground,
              border: `1px solid ${currentTheme.borderLight}`,
              borderRadius: radius.xl,
            })}>
              <Search size={20} color={currentTheme.textSecondary} />
              <input
                value={userSearchQuery}
                onChange={(e) => setUserSearchQuery(e.target.value)}
                placeholder="Search by username or name..."
                style={{
                  flex: 1, background: 'transparent', border: 'none', outline: 'none',
                  color: currentTheme.text, fontSize: fontSize['2xl'], fontFamily: 'inherit',
                }}
              />
              {userSearchQuery && (
                <button
                  onClick={() => { setUserSearchQuery(''); setUserSearchResults([]) }}
                  style={{ background: 'none', border: 'none', cursor: 'pointer', padding: spacing.xs, display: 'flex' }}
                >
                  <X size={18} color={currentTheme.textSecondary} />
                </button>
              )}
            </div>

            {/* Search Results */}
            {searchingUsers ? (
              <div style={{ textAlign: 'center', padding: spacing['5xl'] }}>
                <p style={{ color: currentTheme.textSecondary, fontSize: fontSize['2xl'] }}>Searching...</p>
              </div>
            ) : userSearchQuery.trim() && userSearchResults.length === 0 ? (
              <div style={sx(s.card, {
                padding: spacing['5xl'],
                textAlign: 'center' as const,
              })}>
                <User size={32} color={currentTheme.textMuted || currentTheme.textSecondary} style={{ marginBottom: spacing.lg }} />
                <p style={{ color: currentTheme.textMuted || currentTheme.textSecondary, fontSize: fontSize['2xl'], margin: 0 }}>
                  No users found for "{userSearchQuery}"
                </p>
              </div>
            ) : userSearchResults.length > 0 ? (
              <div style={sx(layout.flexCol, { gap: '10px' })}>
                {userSearchResults.map((u: any) => (
                  <motion.div
                    key={u.userId}
                    whileHover={{ scale: 1.01 }}
                    onClick={() => {
                      if (u.userId === currentUser?.id) {
                        clearViewingProfile()
                      } else {
                        setViewingProfile({ userId: u.userId, username: u.username })
                      }
                      setActiveTab('statistics')
                    }}
                    style={sx(layout.flexRow, {
                      gap: '14px',
                      padding: `${spacing.xl} 18px`, cursor: 'pointer',
                      background: currentTheme.backgroundOverlay || currentTheme.buttonBackground,
                      border: `1px solid ${currentTheme.borderLight}`,
                      borderRadius: '14px',
                      transition: 'border-color 0.2s',
                    })}
                    onMouseEnter={(e) => { e.currentTarget.style.borderColor = `${currentTheme.accent  }55` }}
                    onMouseLeave={(e) => { e.currentTarget.style.borderColor = currentTheme.borderLight }}
                  >
                    <div style={sx(layout.center, {
                      width: '48px', height: '48px', borderRadius: radius.circle,
                      background: u.profileImage ? 'none' : currentTheme.accentGradient,
                      overflow: 'hidden', flexShrink: 0,
                    })}>
                      {u.profileImage ? (
                        <img src={u.profileImage} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                      ) : (
                        <User size={22} color="#fff" />
                      )}
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <p style={{ color: currentTheme.text, fontSize: fontSize['2xl'], fontWeight: fontWeight.semibold, margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {u.username}
                      </p>
                      {u.bio && (
                        <p style={{ color: currentTheme.textSecondary, fontSize: fontSize.base, margin: '3px 0 0 0', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {u.bio}
                        </p>
                      )}
                    </div>
                    <span style={{ color: currentTheme.textMuted || currentTheme.textSecondary, fontSize: fontSize.md, flexShrink: 0 }}>
                      {u.followersCount} {u.followersCount === 1 ? 'follower' : 'followers'}
                    </span>
                  </motion.div>
                ))}
              </div>
            ) : (
              <div style={sx(s.card, {
                padding: `50px ${spacing['2xl']}`,
                textAlign: 'center' as const,
              })}>
                <Search size={36} color={currentTheme.textMuted || currentTheme.textSecondary} />
                <p style={{ color: currentTheme.textMuted || currentTheme.textSecondary, fontSize: fontSize['2xl'], margin: `${spacing.lg} 0 0 0` }}>
                  Type a username or name to find people
                </p>
              </div>
            )}
          </div>
        )}

        {/* Leaderboard Content */}
        {activeSection !== 'search' && activeSection !== 'messages' && (
          <>
        {loading ? (
          <div style={{ textAlign: 'center', padding: spacing['5xl'] }}>
            <p style={{ color: currentTheme.textSecondary, fontSize: fontSize['3xl'] }}>Loading Prompt Feed...</p>
          </div>
        ) : (() => {
          const filteredPrompts = selectedCategory === 'All' 
            ? leaderboardPrompts 
            : leaderboardPrompts.filter((prompt: any) => prompt.category === selectedCategory)
          
          return filteredPrompts.length === 0 ? (
            <div
              style={sx(s.card, {
                padding: spacing['5xl'],
                textAlign: 'center' as const,
              })}
            >
              <p style={{ color: currentTheme.textMuted, fontSize: fontSize['3xl'] }}>
                {selectedCategory !== 'All' ? (
                  `No prompts found in the "${selectedCategory}" category${activeSection === 'today' ? ' today' : ''}.`
                ) : (
                  <>
                    {activeSection === 'myfeed' && "No posts from people you follow yet. Follow users to see their posts here!"}
                    {activeSection === 'browse' && "No posts to browse right now. Check back later!"}
                    {activeSection === 'today' && "No prompts submitted today yet. Be the first!"}
                    {activeSection === 'alltime' && "No prompts on the Prompt Feed yet. Be the first to submit one!"}
                  </>
                )}
              </p>
            </div>
          ) : (
            <div style={sx(layout.flexCol, { gap: spacing['2xl'] })}>
              {selectedCategory !== 'All' && (
                <p style={{ color: currentTheme.textSecondary, fontSize: fontSize.lg, margin: `0 0 ${spacing.md} 0` }}>
                  Showing {filteredPrompts.length} prompt{filteredPrompts.length !== 1 ? 's' : ''} in "{selectedCategory}"
                </p>
              )}
              {filteredPrompts.map((prompt: any) => renderPromptCard(prompt))}
            </div>
          )
        })()}
          </>
        )}
      </div>
    </motion.div>
  )
}

export default LeaderboardView
