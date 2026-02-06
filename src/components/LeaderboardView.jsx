import React, { useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import { Heart, MessageSquare, Send, ChevronDown, ChevronUp, User, Calendar, Star } from 'lucide-react'
import { useStore } from '../store/useStore'
import { getTheme } from '../utils/theme'
import axios from 'axios'

const LeaderboardView = () => {
  const currentUser = useStore((state) => state.currentUser)
  const theme = useStore((state) => state.theme || 'dark')
  const currentTheme = getTheme(theme)
  const [activeSection, setActiveSection] = useState('today') // 'today', 'alltime', 'profile'
  const [leaderboardPrompts, setLeaderboardPrompts] = useState([])
  const [loading, setLoading] = useState(true)
  const [expandedComments, setExpandedComments] = useState({})
  const [expandedReplies, setExpandedReplies] = useState({})
  const [commentTexts, setCommentTexts] = useState({})
  const [replyTexts, setReplyTexts] = useState({})
  const [expandedResponses, setExpandedResponses] = useState({})
  const [expandedSummary, setExpandedSummary] = useState({})
  const [expandedFacts, setExpandedFacts] = useState({})

  useEffect(() => {
    if (currentUser?.id || activeSection !== 'profile') {
      fetchLeaderboard()
    }
  }, [currentUser, activeSection])

  const fetchLeaderboard = async () => {
    try {
      setLoading(true)
      let url = 'http://localhost:3001/api/leaderboard'
      
      if (activeSection === 'today') {
        url += '?filter=today'
      } else if (activeSection === 'alltime') {
        url += '?filter=alltime'
      } else if (activeSection === 'profile' && currentUser?.id) {
        url += `?filter=profile&userId=${currentUser.id}`
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
      const response = await axios.post('http://localhost:3001/api/leaderboard/like', {
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

  const handleAddComment = async (promptId) => {
    if (!currentUser?.id || !commentTexts[promptId]?.trim()) return
    
    try {
      const response = await axios.post('http://localhost:3001/api/leaderboard/comment', {
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
      const response = await axios.post('http://localhost:3001/api/leaderboard/comment/reply', {
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
        {/* Username and Like Count */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
          <p style={{ color: currentTheme.accent, fontSize: '1rem', fontWeight: '600', margin: 0 }}>
            {prompt.username}
          </p>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Heart 
              size={20} 
              fill={isLiked ? '#ff6b6b' : 'transparent'} 
              color={isLiked ? '#ff6b6b' : currentTheme.textSecondary} 
            />
            <span style={{ color: currentTheme.textSecondary, fontSize: '1rem', fontWeight: '600' }}>
              {prompt.likeCount || 0}
            </span>
          </div>
        </div>
        
        {/* Prompt Text */}
        <p style={{ color: currentTheme.text, fontSize: '1.1rem', margin: '0 0 16px 0', lineHeight: '1.6' }}>
          {prompt.promptText}
        </p>
        
        {/* Responses, Summary, and Facts/Sources - Minimized Format */}
        {(prompt.responses || prompt.summary || prompt.facts || prompt.sources) && (
          <div style={{ marginBottom: '16px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
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
            
            {/* Facts and Sources */}
            {(prompt.facts || prompt.sources) && (
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
                  <span style={{ fontSize: '0.9rem', fontWeight: '500' }}>
                    Facts & Sources {prompt.facts ? `(${prompt.facts.length})` : ''} {prompt.sources ? `(${prompt.sources.length} sources)` : ''}
                  </span>
                  {expandedFacts[prompt.id] ? (
                    <ChevronUp size={16} color={currentTheme.accent} />
                  ) : (
                    <ChevronDown size={16} color={currentTheme.accent} />
                  )}
                </button>
                {expandedFacts[prompt.id] && (
                  <div style={{ padding: '12px', borderTop: `1px solid ${currentTheme.borderLight}` }}>
                    {prompt.facts && prompt.facts.length > 0 && (
                      <div style={{ marginBottom: '12px' }}>
                        <div style={{ color: currentTheme.accent, fontSize: '0.85rem', fontWeight: '600', marginBottom: '8px' }}>Facts:</div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                          {prompt.facts.map((fact, idx) => (
                            <div
                              key={idx}
                              style={{
                                background: currentTheme.backgroundTertiary,
                                border: `1px solid ${currentTheme.borderLight}`,
                                borderRadius: '6px',
                                padding: '10px',
                              }}
                            >
                              <div style={{ color: currentTheme.textSecondary, fontSize: '0.85rem', lineHeight: '1.4' }}>
                                {fact.fact || fact}
                              </div>
                              {fact.source_quote && (
                                <div style={{ color: currentTheme.textMuted, fontSize: '0.75rem', marginTop: '4px', fontStyle: 'italic' }}>
                                  Source: {fact.source_quote}
                                </div>
                              )}
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                    {prompt.sources && prompt.sources.length > 0 && (
                      <div>
                        <div style={{ color: currentTheme.accent, fontSize: '0.85rem', fontWeight: '600', marginBottom: '8px' }}>Sources:</div>
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
          {!isOwnPrompt && (
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
        </div>

        {isOwnPrompt && (
          <p style={{ color: currentTheme.textMuted, fontSize: '0.9rem', fontStyle: 'italic', marginBottom: '16px' }}>
            Your prompt
          </p>
        )}

        {/* Comments Section */}
        {isCommentsExpanded && currentUser && (
          <div style={{ marginTop: '20px', paddingTop: '20px', borderTop: '1px solid rgba(0, 255, 255, 0.2)' }}>
            {/* Add Comment */}
            <div style={{ marginBottom: '20px' }}>
              <textarea
                value={commentTexts[prompt.id] || ''}
                onChange={(e) => setCommentTexts({ ...commentTexts, [prompt.id]: e.target.value })}
                placeholder="Add a comment..."
                style={{
                  width: '100%',
                  minHeight: '80px',
                  padding: '12px',
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
                  marginTop: '8px',
                  padding: '8px 16px',
                  background: commentTexts[prompt.id]?.trim() ? currentTheme.buttonBackgroundHover : currentTheme.buttonBackground,
                  border: `1px solid ${currentTheme.borderLight}`,
                  borderRadius: '6px',
                  color: commentTexts[prompt.id]?.trim() ? currentTheme.accent : currentTheme.textMuted,
                  fontSize: '0.85rem',
                  cursor: commentTexts[prompt.id]?.trim() ? 'pointer' : 'not-allowed',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                }}
              >
                <Send size={14} />
                Post Comment
              </button>
            </div>

            {/* Display Comments */}
            {comments.length > 0 ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                {comments.map((comment) => {
                  const isRepliesExpanded = expandedReplies[comment.id]
                  
                  return (
                    <div
                      key={comment.id}
                      style={{
                        background: currentTheme.backgroundSecondary,
                        border: '1px solid rgba(0, 255, 255, 0.2)',
                        borderRadius: '8px',
                        padding: '16px',
                      }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '8px' }}>
                        <div>
                          <p style={{ color: currentTheme.accent, fontSize: '0.9rem', fontWeight: '600', margin: '0 0 4px 0' }}>
                            {comment.username}
                          </p>
                          <p style={{ color: currentTheme.textSecondary, fontSize: '0.85rem', margin: 0, lineHeight: '1.5' }}>
                            {comment.text}
                          </p>
                        </div>
                        <p style={{ color: currentTheme.textMuted, fontSize: '0.75rem', margin: 0 }}>
                          {formatDate(comment.createdAt)}
                        </p>
                      </div>

                      {/* Replies */}
                      {comment.replies && comment.replies.length > 0 && (
                        <button
                          onClick={() => setExpandedReplies({ ...expandedReplies, [comment.id]: !isRepliesExpanded })}
                          style={{
                            marginTop: '8px',
                            padding: '4px 8px',
                            background: 'transparent',
                            border: 'none',
                            color: currentTheme.accent,
                            fontSize: '0.75rem',
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '4px',
                          }}
                        >
                          {isRepliesExpanded ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
                          {comment.replies.length} {comment.replies.length === 1 ? 'reply' : 'replies'}
                        </button>
                      )}

                      {isRepliesExpanded && comment.replies && (
                        <div style={{ marginTop: '12px', paddingLeft: '16px', borderLeft: '2px solid rgba(0, 255, 255, 0.3)' }}>
                          {comment.replies.map((reply) => (
                            <div key={reply.id} style={{ marginBottom: '12px', padding: '12px', background: currentTheme.backgroundSecondary, borderRadius: '6px' }}>
                              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '4px' }}>
                                <p style={{ color: currentTheme.accentSecondary, fontSize: '0.85rem', fontWeight: '600', margin: 0 }}>
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
                          ))}
                        </div>
                      )}

                      {/* Reply Input - Anyone can reply */}
                      {currentUser && (
                        <div style={{ marginTop: '12px' }}>
                          <input
                            type="text"
                            value={replyTexts[comment.id] || ''}
                            onChange={(e) => setReplyTexts({ ...replyTexts, [comment.id]: e.target.value })}
                            placeholder="Reply to this comment..."
                            onKeyPress={(e) => {
                              if (e.key === 'Enter' && replyTexts[comment.id]?.trim()) {
                                handleReplyToComment(prompt.id, comment.id)
                              }
                            }}
                            style={{
                              width: '100%',
                              padding: '8px 12px',
                              background: currentTheme.backgroundSecondary,
                              border: `1px solid ${currentTheme.borderLight}`,
                              borderRadius: '6px',
                              color: currentTheme.text,
                              fontSize: '0.85rem',
                              fontFamily: 'inherit',
                            }}
                          />
                          <button
                            onClick={() => handleReplyToComment(prompt.id, comment.id)}
                            disabled={!replyTexts[comment.id]?.trim()}
                            style={{
                              marginTop: '6px',
                              padding: '6px 12px',
                              background: replyTexts[comment.id]?.trim() ? currentTheme.buttonBackgroundHover : currentTheme.buttonBackground,
                              border: '1px solid rgba(0, 255, 0, 0.3)',
                              borderRadius: '6px',
                              color: replyTexts[comment.id]?.trim() ? currentTheme.accentSecondary : currentTheme.textMuted,
                              fontSize: '0.8rem',
                              cursor: replyTexts[comment.id]?.trim() ? 'pointer' : 'not-allowed',
                              display: 'flex',
                              alignItems: 'center',
                              gap: '4px',
                            }}
                          >
                            <Send size={12} />
                            Reply
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
      case 'today':
        return "Today's Favorites"
      case 'alltime':
        return 'All Time Favorites'
      case 'profile':
        return 'My Profile'
      default:
        return 'Community Leaderboard'
    }
  }

  const getSectionDescription = () => {
    switch (activeSection) {
      case 'today':
        return "All prompts submitted today. Vote on your favorites!"
      case 'alltime':
        return 'The top 15 most liked prompts of all time.'
      case 'profile':
        return 'All prompts you have submitted to the leaderboard.'
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
        left: '240px',
        width: 'calc(100% - 240px)',
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        padding: '40px',
        overflowY: 'auto',
        zIndex: 10,
        color: currentTheme.text,
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
          
          {/* Section Tabs */}
          <div
            style={{
              display: 'flex',
              gap: '16px',
              marginTop: '24px',
              marginBottom: '32px',
              borderBottom: `1px solid ${currentTheme.borderLight}`,
            }}
          >
            <button
              onClick={() => setActiveSection('today')}
              style={{
                padding: '12px 24px',
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
                gap: '8px',
              }}
            >
              <Calendar size={20} />
              Today's Favorites
            </button>
            
            <button
              onClick={() => setActiveSection('alltime')}
              style={{
                padding: '12px 24px',
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
                gap: '8px',
              }}
            >
              <Star size={20} />
              All Time Favorites
            </button>
            
            {currentUser && (
              <button
                onClick={() => setActiveSection('profile')}
                style={{
                  padding: '12px 24px',
                  background: activeSection === 'profile' ? currentTheme.buttonBackgroundActive : 'transparent',
                  border: 'none',
                  borderBottom: activeSection === 'profile' ? `2px solid ${currentTheme.accent}` : '2px solid transparent',
                  color: activeSection === 'profile' ? currentTheme.accent : currentTheme.textSecondary,
                  fontSize: '1rem',
                  fontWeight: activeSection === 'profile' ? '600' : '400',
                  cursor: 'pointer',
                  transition: 'all 0.2s ease',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                }}
              >
                <User size={20} />
                My Profile
              </button>
            )}
          </div>
          
          {/* Daily Reward Notice - Only show on Today's Favorites */}
          {activeSection === 'today' && (
            <div
              style={{
                marginTop: '20px',
              }}
            >
              <div style={{
                background: theme === 'dark' ? 'rgba(255, 255, 255, 0.15)' : 'rgba(255, 255, 255, 0.9)',
                padding: '12px 16px',
                borderRadius: '8px',
              }}>
                <p style={{ color: currentTheme.text, fontSize: '1rem', margin: 0, lineHeight: '1.6' }}>
                  <span style={{ color: currentTheme.accent, fontWeight: '600' }}>Daily Rewards:</span> At the end of each day at 12:00 AM, the top 5 most liked prompts will be selected. 
                  Users who submitted these winning prompts will receive $10 of token usage credit added to their account!
                </p>
              </div>
            </div>
          )}
        </div>

        {/* Leaderboard Content */}
        {loading ? (
          <div style={{ textAlign: 'center', padding: '40px' }}>
            <p style={{ color: currentTheme.textSecondary, fontSize: '1.1rem' }}>Loading leaderboard...</p>
          </div>
        ) : leaderboardPrompts.length === 0 ? (
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
              {activeSection === 'today' && "No prompts submitted today yet. Be the first!"}
              {activeSection === 'alltime' && "No prompts on the leaderboard yet. Be the first to submit one!"}
              {activeSection === 'profile' && "You haven't submitted any prompts yet. Submit your first prompt from the home tab!"}
            </p>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
            {leaderboardPrompts.map((prompt) => renderPromptCard(prompt))}
          </div>
        )}
      </div>
    </motion.div>
  )
}

export default LeaderboardView
