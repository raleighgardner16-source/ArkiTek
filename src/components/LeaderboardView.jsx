import React, { useEffect, useState, useRef } from 'react'
import { motion } from 'framer-motion'
import { Heart, MessageSquare, Send, ChevronDown, ChevronUp, Calendar, Star, Trash2, Layers, Lock, Globe, Search, User, Users, Compass, X, Trophy, MessageCircle } from 'lucide-react'
import { useStore } from '../store/useStore'
import { getTheme } from '../utils/theme'
import axios from 'axios'
import { API_URL } from '../utils/config'
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

const LeaderboardView = ({ subscriptionRestricted = false }) => {
  const currentUser = useStore((state) => state.currentUser)
  const setViewingProfile = useStore((state) => state.setViewingProfile)
  const clearViewingProfile = useStore((state) => state.clearViewingProfile)
  const setActiveTab = useStore((state) => state.setActiveTab)
  const theme = useStore((state) => state.theme || 'dark')
  const currentTheme = getTheme(theme)
  const isNavExpanded = useStore((state) => state.isNavExpanded)
  const winningPrompts = useStore((state) => state.winningPrompts)
  const [activeSection, setActiveSection] = useState('myfeed') // 'myfeed', 'browse', 'search'
  const [selectedCategory, setSelectedCategory] = useState('All') // Category filter
  const [userSearchQuery, setUserSearchQuery] = useState('')
  const [userSearchResults, setUserSearchResults] = useState([])
  const [searchingUsers, setSearchingUsers] = useState(false)
  const [showSearchResults, setShowSearchResults] = useState(false)
  const searchTimeoutRef = useRef(null)
  const searchContainerRef = useRef(null)
  const [leaderboardPrompts, setLeaderboardPrompts] = useState([])
  const [loading, setLoading] = useState(true)
  const [expandedComments, setExpandedComments] = useState({})
  const [expandedReplies, setExpandedReplies] = useState({})
  const [commentTexts, setCommentTexts] = useState({})
  const [replyTexts, setReplyTexts] = useState({})
  const [expandedResponses, setExpandedResponses] = useState({})
  const [expandedSummary, setExpandedSummary] = useState({})
  const [expandedFacts, setExpandedFacts] = useState({})
  const [showResponseSection, setShowResponseSection] = useState({}) // Track which prompts have responses visible
  const [hoveredOwnLike, setHoveredOwnLike] = useState(null) // Track which own-prompt like button is hovered
  const [expandedPromptText, setExpandedPromptText] = useState({}) // Track which prompt texts are fully expanded
  const [deleteConfirm, setDeleteConfirm] = useState(null) // Track which prompt is being confirmed for deletion
  const [deleting, setDeleting] = useState(false)
  const [showReplyInput, setShowReplyInput] = useState({}) // Track which comments have reply input visible
  const [deleteCommentConfirm, setDeleteCommentConfirm] = useState(null) // Track which comment is being confirmed for deletion
  const [deleteReplyConfirm, setDeleteReplyConfirm] = useState(null) // Track which reply is being confirmed for deletion

  // Force to search section when subscription is restricted
  useEffect(() => {
    if (subscriptionRestricted && activeSection !== 'search') {
      setActiveSection('search')
    }
  }, [subscriptionRestricted, activeSection])

  const leaderboardRefreshTrigger = useStore((state) => state.leaderboardRefreshTrigger)

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
        const response = await axios.get(`${API_URL}/api/users/search?q=${encodeURIComponent(userSearchQuery.trim())}`)
        setUserSearchResults(response.data.users || [])
      } catch (error) {
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
    const handleClickOutside = (e) => {
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
      let url = `${API_URL}/api/leaderboard`
      
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
      
      const response = await axios.get(url)
      setLeaderboardPrompts(response.data.prompts || [])
    } catch (error) {
      console.error('Error fetching leaderboard:', error)
      setLeaderboardPrompts([])
    } finally {
      setLoading(false)
    }
  }

  const handleLikePrompt = async (promptId) => {
    if (!currentUser?.id) return
    
    try {
      const response = await axios.post(`${API_URL}/api/leaderboard/like`, {
        userId: currentUser.id,
        promptId: promptId,
      })
      
      if (response.data.success) {
        await fetchLeaderboard()
      }
    } catch (error) {
      console.error('Error liking prompt:', error)
      if (error.response?.data?.error) {
        alert(error.response.data.error)
      }
    }
  }

  const handleDeletePrompt = async (promptId) => {
    if (!currentUser?.id) return
    
    setDeleting(true)
    try {
      const response = await axios.delete(`${API_URL}/api/leaderboard/delete/${promptId}`, {
        data: { userId: currentUser.id }
      })
      
      if (response.data.success) {
        setDeleteConfirm(null)
        await fetchLeaderboard()
        // Notify other views (e.g. profile) so they drop the deleted prompt
        useStore.getState().triggerLeaderboardRefresh()
      }
    } catch (error) {
      console.error('Error deleting prompt:', error)
      if (error.response?.data?.error) {
        alert(error.response.data.error)
      }
    } finally {
      setDeleting(false)
    }
  }

  const handleAddComment = async (promptId) => {
    if (!currentUser?.id || !commentTexts[promptId]?.trim()) return
    
    try {
      const response = await axios.post(`${API_URL}/api/leaderboard/comment`, {
        userId: currentUser.id,
        promptId: promptId,
        commentText: commentTexts[promptId],
      })
      
      if (response.data.success) {
        setCommentTexts({ ...commentTexts, [promptId]: '' })
        await fetchLeaderboard()
      }
    } catch (error) {
      console.error('Error adding comment:', error)
      if (error.response?.data?.error) {
        alert(error.response.data.error)
      }
    }
  }

  const handleReplyToComment = async (promptId, commentId) => {
    if (!currentUser?.id || !replyTexts[`${commentId}`]?.trim()) return
    
    try {
      const response = await axios.post(`${API_URL}/api/leaderboard/comment/reply`, {
        userId: currentUser.id,
        promptId: promptId,
        commentId: commentId,
        replyText: replyTexts[commentId],
      })
      
      if (response.data.success) {
        setReplyTexts({ ...replyTexts, [commentId]: '' })
        await fetchLeaderboard()
      }
    } catch (error) {
      console.error('Error adding reply:', error)
      if (error.response?.data?.error) {
        alert(error.response.data.error)
      }
    }
  }

  const handleLikeComment = async (promptId, commentId) => {
    if (!currentUser?.id) return
    
    try {
      const response = await axios.post(`${API_URL}/api/leaderboard/comment/like`, {
        userId: currentUser.id,
        promptId: promptId,
        commentId: commentId,
      })
      
      if (response.data.success) {
        await fetchLeaderboard()
      }
    } catch (error) {
      console.error('Error liking comment:', error)
      if (error.response?.data?.error) {
        alert(error.response.data.error)
      }
    }
  }

  const handleDeleteComment = async (promptId, commentId) => {
    if (!currentUser?.id) return
    
    try {
      const response = await axios.delete(`${API_URL}/api/leaderboard/comment/delete/${commentId}`, {
        data: { userId: currentUser.id, promptId: promptId }
      })
      
      if (response.data.success) {
        setDeleteCommentConfirm(null)
        await fetchLeaderboard()
      }
    } catch (error) {
      console.error('Error deleting comment:', error)
      if (error.response?.data?.error) {
        alert(error.response.data.error)
      }
    }
  }

  const handleDeleteReply = async (promptId, commentId, replyId) => {
    if (!currentUser?.id) return
    
    try {
      const response = await axios.delete(`${API_URL}/api/leaderboard/comment/reply/delete/${replyId}`, {
        data: { userId: currentUser.id, promptId: promptId, commentId: commentId }
      })
      
      if (response.data.success) {
        setDeleteReplyConfirm(null)
        await fetchLeaderboard()
      }
    } catch (error) {
      console.error('Error deleting reply:', error)
      if (error.response?.data?.error) {
        alert(error.response.data.error)
      }
    }
  }

  const formatDate = (dateString) => {
    const date = new Date(dateString)
    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    })
  }

  const renderPromptCard = (prompt) => {
    const isLiked = currentUser?.id && prompt.likes?.includes(currentUser.id)
    const isOwnPrompt = currentUser?.id === prompt.userId
    const comments = prompt.comments || []
    const isCommentsExpanded = expandedComments[prompt.id]
    
    return (
      <div
        key={prompt.id}
        style={{
          background: currentTheme.backgroundOverlay,
          border: `1px solid ${currentTheme.borderLight}`,
          borderRadius: '16px',
          padding: '24px',
        }}
      >
        {/* Username, Category, and Date */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
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
              style={{
                width: '32px', height: '32px', borderRadius: '50%',
                background: prompt.profileImage ? 'none' : currentTheme.accentGradient,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                overflow: 'hidden', flexShrink: 0, cursor: 'pointer',
              }}
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
              style={{ color: currentTheme.accent, fontSize: '1rem', fontWeight: '600', margin: 0, cursor: 'pointer' }}
              onMouseEnter={(e) => { e.currentTarget.style.textDecoration = 'underline' }}
              onMouseLeave={(e) => { e.currentTarget.style.textDecoration = 'none' }}
            >
              {prompt.username}
            </p>
            {prompt.category && (
              <span
                style={{
                  padding: '4px 10px',
                  background: theme === 'light' ? 'rgba(0, 150, 150, 0.1)' : 'rgba(93, 173, 226, 0.1)',
                  border: `1px solid ${theme === 'light' ? 'rgba(0, 150, 150, 0.3)' : 'rgba(93, 173, 226, 0.3)'}`,
                  borderRadius: '12px',
                  color: currentTheme.accent,
                  fontSize: '0.75rem',
                  fontWeight: '500',
                }}
              >
                {prompt.category}
              </span>
            )}
            {winningPrompts?.some(w => w.promptId === prompt.id) && (
              <span style={{
                padding: '3px 9px', borderRadius: '10px', fontSize: '0.7rem', fontWeight: '700',
                background: 'linear-gradient(135deg, rgba(255, 215, 0, 0.15), rgba(255, 165, 0, 0.15))',
                border: '1px solid rgba(255, 215, 0, 0.3)',
                color: '#FFD700',
                display: 'inline-flex', alignItems: 'center', gap: '4px',
                textTransform: 'uppercase', letterSpacing: '0.5px',
              }}>
                <Trophy size={11} /> Winning Chat
              </span>
            )}
          </div>
          <span style={{ color: currentTheme.textMuted, fontSize: '0.85rem' }}>
            {formatDate(prompt.createdAt)}
          </span>
        </div>
        
        {/* Description — shown above prompt */}
        {prompt.description && (
          <p style={{ 
            color: currentTheme.textSecondary, 
            fontSize: '0.9rem', 
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
            <p style={{ color: currentTheme.text, fontSize: '1.1rem', margin: '0 0 16px 0', lineHeight: '1.6' }}>
              {displayText}
              {isTruncated && !isExpanded && (
                <span
                  onClick={() => setExpandedPromptText(prev => ({ ...prev, [prompt.id]: true }))}
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
              {isTruncated && isExpanded && (
                <span
                  onClick={() => setExpandedPromptText(prev => ({ ...prev, [prompt.id]: false }))}
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
          )
        })()}
        
        {/* See Responses Button and Content */}
        {(prompt.responses || prompt.summary || prompt.sources) && (
          <div style={{ marginBottom: '16px' }}>
            {/* See Responses Toggle Button */}
            <button
              onClick={() => setShowResponseSection({ ...showResponseSection, [prompt.id]: !showResponseSection[prompt.id] })}
              style={{
                padding: '10px 20px',
                background: showResponseSection[prompt.id] ? currentTheme.buttonBackgroundHover : currentTheme.buttonBackground,
                border: `1px solid ${currentTheme.borderLight}`,
                borderRadius: '8px',
                color: currentTheme.accent,
                fontSize: '0.95rem',
                fontWeight: '500',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                marginBottom: showResponseSection[prompt.id] ? '12px' : '0',
                transition: 'all 0.2s ease',
              }}
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
            
            {/* Responses, Summary, and Facts/Sources - Only shown when expanded */}
            {showResponseSection[prompt.id] && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {/* Summary */}
            {prompt.summary && (
              <div
                style={{
                  background: currentTheme.backgroundSecondary,
                  border: `1px solid ${currentTheme.borderLight}`,
                  borderRadius: '8px',
                  overflow: 'hidden',
                }}
              >
                <button
                  onClick={() => setExpandedSummary({ ...expandedSummary, [prompt.id]: !expandedSummary[prompt.id] })}
                  style={{
                    width: '100%',
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
                  <span style={{ fontSize: '0.9rem', fontWeight: '500' }}>Summary</span>
                  {expandedSummary[prompt.id] ? (
                    <ChevronUp size={16} color={currentTheme.accent} />
                  ) : (
                    <ChevronDown size={16} color={currentTheme.accent} />
                  )}
                </button>
                {expandedSummary[prompt.id] && (
                  <div style={{ padding: '12px', borderTop: `1px solid ${currentTheme.borderLight}` }}>
                    <div style={{ color: currentTheme.textSecondary, fontSize: '0.85rem', lineHeight: '1.5', whiteSpace: 'pre-wrap' }}>
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
                      borderRadius: '8px',
                      overflow: 'hidden',
                    }}
                  >
                    <button
                      onClick={() => setExpandedResponses({ ...expandedResponses, [prompt.id]: !expandedResponses[prompt.id] })}
                      style={{
                        width: '100%',
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
                      <span style={{ fontSize: '0.9rem', fontWeight: '500' }}>
                        Council Responses ({prompt.responses.length})
                      </span>
                      {expandedResponses[prompt.id] ? (
                        <ChevronUp size={16} color={currentTheme.accent} />
                      ) : (
                        <ChevronDown size={16} color={currentTheme.accent} />
                      )}
                    </button>
                    {expandedResponses[prompt.id] && (
                      <div style={{ padding: '12px', borderTop: `1px solid ${currentTheme.borderLight}` }}>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                          {prompt.responses.map((response, idx) => (
                            <div
                              key={idx}
                              style={{
                                background: currentTheme.backgroundTertiary,
                                border: `1px solid ${currentTheme.borderLight}`,
                                borderRadius: '6px',
                                padding: '12px',
                              }}
                            >
                              <div style={{ color: currentTheme.accent, fontSize: '0.85rem', fontWeight: '600', marginBottom: '6px' }}>
                                {response.modelName}
                              </div>
                              <div style={{ color: currentTheme.textSecondary, fontSize: '0.85rem', lineHeight: '1.5', whiteSpace: 'pre-wrap' }}>
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
                  borderRadius: '8px',
                  overflow: 'hidden',
                }}
              >
                <button
                  onClick={() => setExpandedFacts({ ...expandedFacts, [prompt.id]: !expandedFacts[prompt.id] })}
                  style={{
                    width: '100%',
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
                  <span style={{ fontSize: '0.9rem', fontWeight: '500', display: 'flex', alignItems: 'center', gap: '6px' }}>
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
                  <div style={{ padding: '12px', borderTop: `1px solid ${currentTheme.borderLight}` }}>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                      {prompt.sources.map((source, idx) => (
                        <div
                          key={idx}
                          style={{
                            background: currentTheme.backgroundTertiary,
                            border: `1px solid ${currentTheme.borderLight}`,
                            borderRadius: '6px',
                            padding: '10px',
                          }}
                        >
                          <a
                            href={source.link}
                            target="_blank"
                            rel="noopener noreferrer"
                            style={{ color: currentTheme.accent, fontSize: '0.85rem', fontWeight: '600', textDecoration: 'none' }}
                          >
                            {source.title}
                          </a>
                          {source.snippet && (
                            <div style={{ color: currentTheme.textSecondary, fontSize: '0.75rem', marginTop: '4px' }}>
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
        <div style={{ display: 'flex', gap: '12px', marginBottom: '16px' }}>
          {isOwnPrompt ? (
            <div 
              style={{ position: 'relative' }}
              onMouseEnter={() => setHoveredOwnLike(`button-${prompt.id}`)}
              onMouseLeave={() => setHoveredOwnLike(null)}
            >
              <button
                disabled
                style={{
                  padding: '10px 20px',
                  background: 'rgba(128, 128, 128, 0.1)',
                  border: `1px solid rgba(128, 128, 128, 0.3)`,
                  borderRadius: '8px',
                  color: currentTheme.textMuted,
                  fontSize: '0.95rem',
                  fontWeight: '500',
                  cursor: 'not-allowed',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  opacity: 0.6,
                  pointerEvents: 'none',
                }}
              >
                <Heart 
                  size={18} 
                  fill="transparent" 
                  color={currentTheme.textMuted} 
                />
                Like
                {(prompt.likes?.length || 0) > 0 && (
                  <span style={{ 
                    marginLeft: '2px',
                    fontSize: '0.85rem',
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
                    marginBottom: '8px',
                    padding: '8px 12px',
                    background: 'rgba(0, 0, 0, 0.9)',
                    border: '1px solid rgba(255, 255, 255, 0.2)',
                    borderRadius: '6px',
                    color: '#fff',
                    fontSize: '0.85rem',
                    whiteSpace: 'nowrap',
                    zIndex: 100,
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
              style={{
                padding: '10px 20px',
                background: isLiked ? 'rgba(255, 107, 107, 0.2)' : currentTheme.buttonBackground,
                border: `1px solid ${isLiked ? 'rgba(255, 107, 107, 0.5)' : currentTheme.borderLight}`,
                borderRadius: '8px',
                color: isLiked ? '#ff6b6b' : currentTheme.accent,
                fontSize: '0.95rem',
                fontWeight: '500',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                transition: 'all 0.2s ease',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = isLiked ? 'rgba(255, 107, 107, 0.3)' : currentTheme.buttonBackgroundHover
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = isLiked ? 'rgba(255, 107, 107, 0.2)' : currentTheme.buttonBackground
              }}
            >
              <Heart 
                size={18} 
                fill={isLiked ? '#ff6b6b' : 'transparent'} 
                color={isLiked ? '#ff6b6b' : currentTheme.accent} 
              />
              {isLiked ? 'Liked' : 'Like'}
              {(prompt.likes?.length || 0) > 0 && (
                <span style={{ 
                  marginLeft: '2px',
                  fontSize: '0.85rem',
                  color: isLiked ? '#ff6b6b' : currentTheme.accent,
                }}>
                  ({prompt.likes.length})
                </span>
              )}
            </button>
          )}
          
          {currentUser && (
            <button
              onClick={() => setExpandedComments({ ...expandedComments, [prompt.id]: !isCommentsExpanded })}
              style={{
                padding: '10px 20px',
                background: currentTheme.buttonBackground,
                border: `1px solid ${currentTheme.borderLight}`,
                borderRadius: '8px',
                color: currentTheme.accent,
                fontSize: '0.95rem',
                fontWeight: '500',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                transition: 'all 0.2s ease',
              }}
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
          
          {/* Delete Button - Only for own prompts (inline confirm) */}
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
              style={{
                padding: '10px 20px',
                background: deleteConfirm === prompt.id ? 'rgba(255, 80, 80, 0.25)' : 'rgba(255, 80, 80, 0.1)',
                border: `1px solid ${deleteConfirm === prompt.id ? 'rgba(255, 80, 80, 0.6)' : 'rgba(255, 80, 80, 0.3)'}`,
                borderRadius: '8px',
                color: '#ff5050',
                fontSize: '0.95rem',
                fontWeight: '500',
                cursor: deleting ? 'not-allowed' : 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                transition: 'all 0.2s ease',
                opacity: deleting ? 0.7 : 1,
              }}
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
          <div style={{ marginTop: '20px', paddingTop: '20px', borderTop: '1px solid rgba(93, 173, 226, 0.2)' }}>
            {/* Add Comment */}
            <div style={{ marginBottom: '20px', position: 'relative' }}>
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
                  padding: '12px 45px 12px 12px',
                  background: currentTheme.backgroundSecondary,
                  border: `1px solid ${currentTheme.borderLight}`,
                  borderRadius: '8px',
                  color: currentTheme.text,
                  fontSize: '0.9rem',
                  resize: 'vertical',
                  fontFamily: 'inherit',
                }}
              />
              <button
                onClick={() => handleAddComment(prompt.id)}
                disabled={!commentTexts[prompt.id]?.trim()}
                style={{
                  position: 'absolute',
                  right: '10px',
                  bottom: '10px',
                  padding: '6px',
                  background: 'transparent',
                  border: 'none',
                  borderRadius: '50%',
                  color: commentTexts[prompt.id]?.trim() ? currentTheme.accent : currentTheme.textMuted,
                  cursor: commentTexts[prompt.id]?.trim() ? 'pointer' : 'not-allowed',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  transition: 'all 0.2s ease',
                }}
                title="Send (Enter)"
              >
                <Send size={18} />
              </button>
            </div>

            {/* Display Comments */}
            {comments.length > 0 ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                {comments.map((comment) => {
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
                        borderRadius: '8px',
                        padding: '16px',
                      }}
                    >
                      <div style={{ display: 'flex', gap: '10px', marginBottom: '8px' }}>
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
                          style={{
                            width: '28px', height: '28px', borderRadius: '50%',
                            background: comment.profileImage ? 'none' : currentTheme.accentGradient,
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            overflow: 'hidden', flexShrink: 0, cursor: 'pointer', marginTop: '2px',
                          }}
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
                              style={{ color: currentTheme.accent, fontSize: '0.9rem', fontWeight: '600', margin: '0 0 4px 0', cursor: 'pointer' }}
                              onMouseEnter={(e) => { e.currentTarget.style.textDecoration = 'underline' }}
                              onMouseLeave={(e) => { e.currentTarget.style.textDecoration = 'none' }}
                            >
                              {comment.username}
                            </p>
                            <p style={{ color: currentTheme.textMuted, fontSize: '0.75rem', margin: 0, whiteSpace: 'nowrap', marginLeft: '12px' }}>
                              {formatDate(comment.createdAt)}
                            </p>
                          </div>
                          <p style={{ color: currentTheme.textSecondary, fontSize: '0.85rem', margin: 0, lineHeight: '1.5' }}>
                            {comment.text}
                          </p>
                        </div>
                      </div>

                      {/* Comment Actions - Like, Reply, Delete */}
                      <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginTop: '10px' }}>
                        {/* Like */}
                        <button
                          onClick={() => !isOwnComment && handleLikeComment(prompt.id, comment.id)}
                          disabled={isOwnComment}
                          style={{
                            padding: '0',
                            background: 'transparent',
                            border: 'none',
                            color: isCommentLiked ? '#ff6b6b' : isOwnComment ? currentTheme.textMuted : currentTheme.textSecondary,
                            fontSize: '0.8rem',
                            cursor: isOwnComment ? 'not-allowed' : 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '4px',
                            opacity: isOwnComment ? 0.5 : 1,
                            transition: 'all 0.2s ease',
                          }}
                          title={isOwnComment ? "You can't like your own comment" : (isCommentLiked ? 'Unlike' : 'Like')}
                        >
                          <Heart 
                            size={14} 
                            fill={isCommentLiked ? '#ff6b6b' : 'transparent'} 
                            color={isCommentLiked ? '#ff6b6b' : currentTheme.textSecondary} 
                          />
                          {commentLikeCount > 0 ? commentLikeCount : 'Like'}
                        </button>

                        {/* Reply Toggle */}
                        <button
                          onClick={() => setShowReplyInput({ ...showReplyInput, [comment.id]: !showReplyInput[comment.id] })}
                          style={{
                            padding: '0',
                            background: 'transparent',
                            border: 'none',
                            color: currentTheme.textSecondary,
                            fontSize: '0.8rem',
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '4px',
                          }}
                        >
                          Reply
                        </button>

                        {/* View Replies */}
                        {comment.replies && comment.replies.length > 0 && (
                          <button
                            onClick={() => setExpandedReplies({ ...expandedReplies, [comment.id]: !isRepliesExpanded })}
                            style={{
                              padding: '0',
                              background: 'transparent',
                              border: 'none',
                              color: currentTheme.accent,
                              fontSize: '0.8rem',
                              cursor: 'pointer',
                              display: 'flex',
                              alignItems: 'center',
                              gap: '4px',
                            }}
                          >
                            {isRepliesExpanded ? 'Hide' : 'View'} {comment.replies.length} {comment.replies.length === 1 ? 'reply' : 'replies'}
                          </button>
                        )}

                        {/* Delete (only for own comments) */}
                        {isOwnComment && (
                          <button
                            onClick={() => setDeleteCommentConfirm(comment.id)}
                            style={{
                              padding: '0',
                              background: 'transparent',
                              border: 'none',
                              color: '#ff5050',
                              fontSize: '0.8rem',
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
                        <div style={{ 
                          marginTop: '10px', 
                          padding: '10px', 
                          background: 'rgba(255, 80, 80, 0.1)', 
                          borderRadius: '6px',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '10px',
                        }}>
                          <span style={{ color: currentTheme.text, fontSize: '0.8rem' }}>Delete this comment?</span>
                          <button
                            onClick={() => handleDeleteComment(prompt.id, comment.id)}
                            style={{
                              padding: '4px 10px',
                              background: 'rgba(255, 80, 80, 0.2)',
                              border: 'none',
                              borderRadius: '4px',
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
                              padding: '4px 10px',
                              background: currentTheme.buttonBackground,
                              border: 'none',
                              borderRadius: '4px',
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
                        <div style={{ marginTop: '12px', paddingLeft: '16px', borderLeft: '2px solid rgba(93, 173, 226, 0.3)' }}>
                          {comment.replies.map((reply) => {
                            const isOwnReply = currentUser?.id === reply.userId
                            
                            return (
                              <div key={reply.id} style={{ marginBottom: '12px', padding: '12px', background: currentTheme.backgroundTertiary, borderRadius: '6px' }}>
                                <div style={{ display: 'flex', gap: '8px' }}>
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
                                    style={{
                                      width: '22px', height: '22px', borderRadius: '50%',
                                      background: reply.profileImage ? 'none' : currentTheme.accentGradient,
                                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                                      overflow: 'hidden', flexShrink: 0, cursor: 'pointer', marginTop: '1px',
                                    }}
                                  >
                                    {reply.profileImage ? (
                                      <img src={reply.profileImage} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                                    ) : (
                                      <User size={10} color="#fff" />
                                    )}
                                  </div>
                                  <div style={{ flex: 1 }}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '4px' }}>
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
                                        style={{ color: currentTheme.accentSecondary, fontSize: '0.85rem', fontWeight: '600', margin: 0, cursor: 'pointer' }}
                                        onMouseEnter={(e) => { e.currentTarget.style.textDecoration = 'underline' }}
                                        onMouseLeave={(e) => { e.currentTarget.style.textDecoration = 'none' }}
                                      >
                                        {reply.username}
                                      </p>
                                      <p style={{ color: currentTheme.textMuted, fontSize: '0.7rem', margin: 0 }}>
                                        {formatDate(reply.createdAt)}
                                      </p>
                                    </div>
                                    <p style={{ color: currentTheme.textSecondary, fontSize: '0.8rem', margin: 0, lineHeight: '1.4' }}>
                                      {reply.text}
                                    </p>
                                  </div>
                                </div>
                                
                                {/* Reply Actions */}
                                {isOwnReply && (
                                  <div style={{ marginTop: '8px' }}>
                                    {deleteReplyConfirm === reply.id ? (
                                      <div style={{ 
                                        display: 'flex',
                                        alignItems: 'center',
                                        gap: '8px',
                                      }}>
                                        <span style={{ color: currentTheme.textMuted, fontSize: '0.75rem' }}>Delete?</span>
                                        <button
                                          onClick={() => handleDeleteReply(prompt.id, comment.id, reply.id)}
                                          style={{
                                            padding: '2px 8px',
                                            background: 'rgba(255, 80, 80, 0.2)',
                                            border: 'none',
                                            borderRadius: '4px',
                                            color: '#ff5050',
                                            fontSize: '0.7rem',
                                            cursor: 'pointer',
                                          }}
                                        >
                                          Yes
                                        </button>
                                        <button
                                          onClick={() => setDeleteReplyConfirm(null)}
                                          style={{
                                            padding: '2px 8px',
                                            background: currentTheme.buttonBackground,
                                            border: 'none',
                                            borderRadius: '4px',
                                            color: currentTheme.text,
                                            fontSize: '0.7rem',
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

                      {/* Reply Input - Only shown when Reply is clicked */}
                      {currentUser && showReplyInput[comment.id] && (
                        <div style={{ marginTop: '12px', position: 'relative' }}>
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
                              padding: '10px 40px 10px 12px',
                              background: currentTheme.backgroundTertiary,
                              border: `1px solid ${currentTheme.borderLight}`,
                              borderRadius: '20px',
                              color: currentTheme.text,
                              fontSize: '0.85rem',
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
                            style={{
                              position: 'absolute',
                              right: '8px',
                              top: '50%',
                              transform: 'translateY(-50%)',
                              padding: '4px',
                              background: 'transparent',
                              border: 'none',
                              color: replyTexts[comment.id]?.trim() ? currentTheme.accent : currentTheme.textMuted,
                              cursor: replyTexts[comment.id]?.trim() ? 'pointer' : 'not-allowed',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                            }}
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
              <p style={{ color: currentTheme.textMuted, fontSize: '0.9rem', fontStyle: 'italic', textAlign: 'center', padding: '20px' }}>
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

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      style={{
        position: 'fixed',
        top: '0',
        left: isNavExpanded ? '240px' : '60px',
        width: `calc(100% - ${isNavExpanded ? '240px' : '60px'})`,
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        padding: '40px',
        overflowY: 'auto',
        zIndex: 10,
        color: currentTheme.text,
        transition: 'left 0.3s ease, width 0.3s ease',
      }}
    >
      <div
        style={{
          width: '100%',
          maxWidth: '1200px',
          margin: '0 auto',
        }}
      >
        {/* Header */}
        <div style={{ marginBottom: '40px' }}>
          <h1
            key={`title-${theme}`}
            style={{
              fontSize: '2.5rem',
              marginBottom: '12px',
              background: currentTheme.accentGradient,
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
              color: currentTheme.accent,
              display: 'inline-block',
            }}
          >
            {getSectionTitle()}
          </h1>
          <p style={{ color: currentTheme.textSecondary, fontSize: '1.1rem', marginBottom: '16px' }}>
            {getSectionDescription()}
          </p>

          {/* Restricted mode notice */}
          {subscriptionRestricted && (
            <div
              style={{
                padding: '12px 18px',
                borderRadius: '10px',
                background: 'rgba(255, 59, 48, 0.1)',
                border: '1px solid rgba(255, 59, 48, 0.3)',
                display: 'flex',
                alignItems: 'center',
                gap: '10px',
                marginBottom: '16px',
              }}
            >
              <Lock size={16} color="#ff6b6b" />
              <span style={{ color: '#ff6b6b', fontSize: '0.85rem' }}>
                Your subscription has expired. The Prompt Feed is limited. Resubscribe to view the full Prompt Feed.
              </span>
            </div>
          )}
          
          {/* Section Tabs — evenly distributed */}
          <div
            style={{
              display: 'flex',
              marginTop: '24px',
              marginBottom: '32px',
              borderBottom: `1px solid ${currentTheme.borderLight}`,
            }}
          >
            {!subscriptionRestricted && (
              <>
            <button
              onClick={() => setActiveSection('myfeed')}
              style={{
                flex: 1,
                padding: '14px 12px',
                background: activeSection === 'myfeed' ? currentTheme.buttonBackgroundActive : 'transparent',
                border: 'none',
                borderBottom: activeSection === 'myfeed' ? `2px solid ${currentTheme.accent}` : '2px solid transparent',
                color: activeSection === 'myfeed' ? currentTheme.accent : currentTheme.textSecondary,
                fontSize: '1rem',
                fontWeight: activeSection === 'myfeed' ? '600' : '400',
                cursor: 'pointer',
                transition: 'all 0.2s ease',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '8px',
              }}
            >
              <Users size={20} />
              My Feed
            </button>
            
            <button
              onClick={() => setActiveSection('browse')}
              style={{
                flex: 1,
                padding: '14px 12px',
                background: activeSection === 'browse' ? currentTheme.buttonBackgroundActive : 'transparent',
                border: 'none',
                borderBottom: activeSection === 'browse' ? `2px solid ${currentTheme.accent}` : '2px solid transparent',
                color: activeSection === 'browse' ? currentTheme.accent : currentTheme.textSecondary,
                fontSize: '1rem',
                fontWeight: activeSection === 'browse' ? '600' : '400',
                cursor: 'pointer',
                transition: 'all 0.2s ease',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '8px',
              }}
            >
              <Compass size={20} />
              Browse
            </button>

            <button
              onClick={() => setActiveSection('today')}
              style={{
                flex: 1,
                padding: '14px 12px',
                background: activeSection === 'today' ? currentTheme.buttonBackgroundActive : 'transparent',
                border: 'none',
                borderBottom: activeSection === 'today' ? `2px solid ${currentTheme.accent}` : '2px solid transparent',
                color: activeSection === 'today' ? currentTheme.accent : currentTheme.textSecondary,
                fontSize: '1rem',
                fontWeight: activeSection === 'today' ? '600' : '400',
                cursor: 'pointer',
                transition: 'all 0.2s ease',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '8px',
              }}
            >
              <Calendar size={20} />
              Today's Favorites
            </button>

            <button
              onClick={() => setActiveSection('alltime')}
              style={{
                flex: 1,
                padding: '14px 12px',
                background: activeSection === 'alltime' ? currentTheme.buttonBackgroundActive : 'transparent',
                border: 'none',
                borderBottom: activeSection === 'alltime' ? `2px solid ${currentTheme.accent}` : '2px solid transparent',
                color: activeSection === 'alltime' ? currentTheme.accent : currentTheme.textSecondary,
                fontSize: '1rem',
                fontWeight: activeSection === 'alltime' ? '600' : '400',
                cursor: 'pointer',
                transition: 'all 0.2s ease',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '8px',
              }}
            >
              <Star size={20} />
              All Time Favorites
            </button>
              </>
            )}
            <button
              onClick={() => setActiveSection('search')}
              style={{
                flex: 1,
                padding: '14px 12px',
                background: activeSection === 'search' ? currentTheme.buttonBackgroundActive : 'transparent',
                border: 'none',
                borderBottom: activeSection === 'search' ? `2px solid ${currentTheme.accent}` : '2px solid transparent',
                color: activeSection === 'search' ? currentTheme.accent : currentTheme.textSecondary,
                fontSize: '1rem',
                fontWeight: activeSection === 'search' ? '600' : '400',
                cursor: 'pointer',
                transition: 'all 0.2s ease',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '8px',
              }}
            >
              <Search size={20} />
              Search Users
            </button>
            <button
              onClick={() => setActiveSection('messages')}
              style={{
                flex: 1,
                padding: '14px 12px',
                background: activeSection === 'messages' ? currentTheme.buttonBackgroundActive : 'transparent',
                border: 'none',
                borderBottom: activeSection === 'messages' ? `2px solid ${currentTheme.accent}` : '2px solid transparent',
                color: activeSection === 'messages' ? currentTheme.accent : currentTheme.textSecondary,
                fontSize: '1rem',
                fontWeight: activeSection === 'messages' ? '600' : '400',
                cursor: 'pointer',
                transition: 'all 0.2s ease',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '8px',
              }}
            >
              <MessageCircle size={20} />
              Messages
            </button>
          </div>
          
          {/* Category Filter Tabs — shown for Browse, Today's, and All Time */}
          {activeSection !== 'search' && activeSection !== 'myfeed' && activeSection !== 'messages' && (
          <div
            style={{
              display: 'flex',
              flexWrap: 'wrap',
              gap: '8px',
              marginBottom: '24px',
              padding: '16px',
              background: theme === 'light' ? 'rgba(255, 255, 255, 0.7)' : 'rgba(0, 0, 0, 0.2)',
              borderRadius: '12px',
              border: `1px solid ${currentTheme.borderLight}`,
            }}
          >
            <div style={{ 
              display: 'flex', 
              alignItems: 'center', 
              gap: '8px', 
              marginRight: '8px',
              paddingRight: '16px',
              borderRight: `1px solid ${currentTheme.borderLight}`,
            }}>
              <Layers size={18} color={currentTheme.accent} />
              <span style={{ color: currentTheme.textSecondary, fontSize: '0.9rem', fontWeight: '500' }}>
                Filter by Category:
              </span>
            </div>
            {CATEGORIES.map((category) => (
              <button
                key={category}
                onClick={() => setSelectedCategory(category)}
                style={{
                  padding: '6px 14px',
                  background: selectedCategory === category 
                    ? (theme === 'light' ? 'rgba(0, 180, 180, 0.2)' : 'rgba(93, 173, 226, 0.15)')
                    : 'transparent',
                  border: `1px solid ${selectedCategory === category ? currentTheme.accent : currentTheme.borderLight}`,
                  borderRadius: '20px',
                  color: selectedCategory === category ? currentTheme.accent : currentTheme.textSecondary,
                  fontSize: '0.85rem',
                  fontWeight: selectedCategory === category ? '600' : '400',
                  cursor: 'pointer',
                  transition: 'all 0.2s ease',
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
            <div style={{
              display: 'flex', alignItems: 'center', gap: '10px',
              padding: '12px 16px', marginBottom: '20px',
              background: currentTheme.buttonBackground,
              border: `1px solid ${currentTheme.borderLight}`,
              borderRadius: '12px',
            }}>
              <Search size={20} color={currentTheme.textSecondary} />
              <input
                value={userSearchQuery}
                onChange={(e) => setUserSearchQuery(e.target.value)}
                placeholder="Search by username or name..."
                style={{
                  flex: 1, background: 'transparent', border: 'none', outline: 'none',
                  color: currentTheme.text, fontSize: '1rem', fontFamily: 'inherit',
                }}
              />
              {userSearchQuery && (
                <button
                  onClick={() => { setUserSearchQuery(''); setUserSearchResults([]) }}
                  style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '4px', display: 'flex' }}
                >
                  <X size={18} color={currentTheme.textSecondary} />
                </button>
              )}
            </div>

            {/* Search Results */}
            {searchingUsers ? (
              <div style={{ textAlign: 'center', padding: '40px' }}>
                <p style={{ color: currentTheme.textSecondary, fontSize: '1rem' }}>Searching...</p>
              </div>
            ) : userSearchQuery.trim() && userSearchResults.length === 0 ? (
              <div style={{
                background: currentTheme.buttonBackground,
                border: `1px solid ${currentTheme.borderLight}`,
                borderRadius: '16px',
                padding: '40px',
                textAlign: 'center',
              }}>
                <User size={32} color={currentTheme.textMuted || currentTheme.textSecondary} style={{ marginBottom: '12px' }} />
                <p style={{ color: currentTheme.textMuted || currentTheme.textSecondary, fontSize: '1rem', margin: 0 }}>
                  No users found for "{userSearchQuery}"
                </p>
              </div>
            ) : userSearchResults.length > 0 ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                {userSearchResults.map((u) => (
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
                    style={{
                      display: 'flex', alignItems: 'center', gap: '14px',
                      padding: '16px 18px', cursor: 'pointer',
                      background: currentTheme.backgroundOverlay || currentTheme.buttonBackground,
                      border: `1px solid ${currentTheme.borderLight}`,
                      borderRadius: '14px',
                      transition: 'border-color 0.2s',
                    }}
                    onMouseEnter={(e) => { e.currentTarget.style.borderColor = currentTheme.accent + '55' }}
                    onMouseLeave={(e) => { e.currentTarget.style.borderColor = currentTheme.borderLight }}
                  >
                    <div style={{
                      width: '48px', height: '48px', borderRadius: '50%',
                      background: u.profileImage ? 'none' : currentTheme.accentGradient,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      overflow: 'hidden', flexShrink: 0,
                    }}>
                      {u.profileImage ? (
                        <img src={u.profileImage} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                      ) : (
                        <User size={22} color="#fff" />
                      )}
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <p style={{ color: currentTheme.text, fontSize: '1rem', fontWeight: '600', margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {u.username}
                      </p>
                      {u.bio && (
                        <p style={{ color: currentTheme.textSecondary, fontSize: '0.85rem', margin: '3px 0 0 0', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {u.bio}
                        </p>
                      )}
                    </div>
                    <span style={{ color: currentTheme.textMuted || currentTheme.textSecondary, fontSize: '0.8rem', flexShrink: 0 }}>
                      {u.followersCount} {u.followersCount === 1 ? 'follower' : 'followers'}
                    </span>
                  </motion.div>
                ))}
              </div>
            ) : (
              <div style={{
                background: currentTheme.buttonBackground,
                border: `1px solid ${currentTheme.borderLight}`,
                borderRadius: '16px',
                padding: '50px 20px',
                textAlign: 'center',
              }}>
                <Search size={36} color={currentTheme.textMuted || currentTheme.textSecondary} />
                <p style={{ color: currentTheme.textMuted || currentTheme.textSecondary, fontSize: '1rem', margin: '12px 0 0 0' }}>
                  Type a username or name to find people
                </p>
              </div>
            )}
          </div>
        )}

        {/* Leaderboard Content — only for My Feed/Browse */}
        {activeSection !== 'search' && activeSection !== 'messages' && (
          <>
        {loading ? (
          <div style={{ textAlign: 'center', padding: '40px' }}>
            <p style={{ color: currentTheme.textSecondary, fontSize: '1.1rem' }}>Loading Prompt Feed...</p>
          </div>
        ) : (() => {
          const filteredPrompts = selectedCategory === 'All' 
            ? leaderboardPrompts 
            : leaderboardPrompts.filter(prompt => prompt.category === selectedCategory)
          
          return filteredPrompts.length === 0 ? (
            <div
              style={{
                background: currentTheme.buttonBackground,
                border: `1px solid ${currentTheme.borderLight}`,
                borderRadius: '16px',
                padding: '40px',
                textAlign: 'center',
              }}
            >
              <p style={{ color: currentTheme.textMuted, fontSize: '1.1rem' }}>
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
            <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
              {selectedCategory !== 'All' && (
                <p style={{ color: currentTheme.textSecondary, fontSize: '0.9rem', margin: '0 0 8px 0' }}>
                  Showing {filteredPrompts.length} prompt{filteredPrompts.length !== 1 ? 's' : ''} in "{selectedCategory}"
                </p>
              )}
              {filteredPrompts.map((prompt) => renderPromptCard(prompt))}
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
