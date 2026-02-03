import React, { useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import { Trophy, Heart, MessageSquare, Send, ChevronDown, ChevronUp } from 'lucide-react'
import { useStore } from '../store/useStore'
import axios from 'axios'

const LeaderboardView = () => {
  const currentUser = useStore((state) => state.currentUser)
  const [leaderboardPrompts, setLeaderboardPrompts] = useState([])
  const [loading, setLoading] = useState(true)
  const [expandedComments, setExpandedComments] = useState({})
  const [expandedReplies, setExpandedReplies] = useState({})
  const [commentTexts, setCommentTexts] = useState({})
  const [replyTexts, setReplyTexts] = useState({})

  useEffect(() => {
    if (currentUser?.id) {
      fetchLeaderboard()
    }
  }, [currentUser])

  const fetchLeaderboard = async () => {
    try {
      setLoading(true)
      const response = await axios.get('http://localhost:3001/api/leaderboard')
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
        color: '#ffffff',
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
            style={{
              fontSize: '2.5rem',
              marginBottom: '12px',
              background: 'linear-gradient(90deg, #00FFFF, #00FF00)',
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
              display: 'flex',
              alignItems: 'center',
              gap: '16px',
            }}
          >
            <Trophy size={32} />
            Community Leaderboard
          </h1>
          <p style={{ color: '#aaaaaa', fontSize: '1.1rem', marginBottom: '8px' }}>
            Vote on prompts submitted by the community. The most liked prompts appear at the top!
          </p>
        </div>


        {/* Leaderboard Content */}
        {loading ? (
          <div style={{ textAlign: 'center', padding: '40px' }}>
            <p style={{ color: '#aaaaaa', fontSize: '1.1rem' }}>Loading leaderboard...</p>
          </div>
        ) : leaderboardPrompts.length === 0 ? (
          <div
            style={{
              background: 'rgba(0, 255, 255, 0.1)',
              border: '1px solid rgba(0, 255, 255, 0.3)',
              borderRadius: '16px',
              padding: '40px',
              textAlign: 'center',
            }}
          >
            <p style={{ color: '#888888', fontSize: '1.1rem' }}>
              No prompts on the leaderboard yet. Be the first to submit one!
            </p>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
            {leaderboardPrompts.map((prompt) => {
              const isLiked = currentUser?.id && prompt.likes?.includes(currentUser.id)
              const isOwnPrompt = currentUser?.id === prompt.userId
              const comments = prompt.comments || []
              const isCommentsExpanded = expandedComments[prompt.id]
              
              return (
                <div
                  key={prompt.id}
                  style={{
                    background: 'rgba(0, 255, 255, 0.1)',
                    border: '1px solid rgba(0, 255, 255, 0.3)',
                    borderRadius: '16px',
                    padding: '24px',
                  }}
                >
                  {/* Username and Like Count */}
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
                    <p style={{ color: '#00FFFF', fontSize: '1rem', fontWeight: '600', margin: 0 }}>
                      {prompt.username}
                    </p>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <Heart 
                        size={20} 
                        fill={isLiked ? '#ff6b6b' : 'transparent'} 
                        color={isLiked ? '#ff6b6b' : '#aaaaaa'} 
                      />
                      <span style={{ color: '#aaaaaa', fontSize: '1rem', fontWeight: '600' }}>
                        {prompt.likeCount || 0}
                      </span>
                    </div>
                  </div>
                  
                  {/* Prompt Text */}
                  <p style={{ color: '#cccccc', fontSize: '1.1rem', margin: '0 0 16px 0', lineHeight: '1.6' }}>
                    {prompt.promptText}
                  </p>
                  
                  {/* Action Buttons */}
                  <div style={{ display: 'flex', gap: '12px', marginBottom: '16px' }}>
                    {!isOwnPrompt && (
                      <button
                        onClick={() => handleLikePrompt(prompt.id)}
                        style={{
                          padding: '10px 20px',
                          background: isLiked ? 'rgba(255, 107, 107, 0.2)' : 'rgba(0, 255, 255, 0.1)',
                          border: `1px solid ${isLiked ? 'rgba(255, 107, 107, 0.5)' : 'rgba(0, 255, 255, 0.3)'}`,
                          borderRadius: '8px',
                          color: isLiked ? '#ff6b6b' : '#00FFFF',
                          fontSize: '0.95rem',
                          fontWeight: '500',
                          cursor: 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '8px',
                          transition: 'all 0.2s ease',
                        }}
                        onMouseEnter={(e) => {
                          e.currentTarget.style.background = isLiked ? 'rgba(255, 107, 107, 0.3)' : 'rgba(0, 255, 255, 0.2)'
                        }}
                        onMouseLeave={(e) => {
                          e.currentTarget.style.background = isLiked ? 'rgba(255, 107, 107, 0.2)' : 'rgba(0, 255, 255, 0.1)'
                        }}
                      >
                        <Heart 
                          size={18} 
                          fill={isLiked ? '#ff6b6b' : 'transparent'} 
                          color={isLiked ? '#ff6b6b' : '#00FFFF'} 
                        />
                        {isLiked ? 'Liked' : 'Like'}
                      </button>
                    )}
                    
                    {currentUser && (
                      <button
                        onClick={() => setExpandedComments({ ...expandedComments, [prompt.id]: !isCommentsExpanded })}
                        style={{
                          padding: '10px 20px',
                          background: 'rgba(0, 255, 255, 0.1)',
                          border: '1px solid rgba(0, 255, 255, 0.3)',
                          borderRadius: '8px',
                          color: '#00FFFF',
                          fontSize: '0.95rem',
                          fontWeight: '500',
                          cursor: 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '8px',
                          transition: 'all 0.2s ease',
                        }}
                        onMouseEnter={(e) => {
                          e.currentTarget.style.background = 'rgba(0, 255, 255, 0.2)'
                        }}
                        onMouseLeave={(e) => {
                          e.currentTarget.style.background = 'rgba(0, 255, 255, 0.1)'
                        }}
                      >
                        <MessageSquare size={18} />
                        Comments ({comments.length})
                        {isCommentsExpanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                      </button>
                    )}
                  </div>

                  {isOwnPrompt && (
                    <p style={{ color: '#888888', fontSize: '0.9rem', fontStyle: 'italic', marginBottom: '16px' }}>
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
                            background: 'rgba(0, 0, 0, 0.3)',
                            border: '1px solid rgba(0, 255, 255, 0.3)',
                            borderRadius: '8px',
                            color: '#ffffff',
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
                            background: commentTexts[prompt.id]?.trim() ? 'rgba(0, 255, 255, 0.2)' : 'rgba(0, 255, 255, 0.05)',
                            border: '1px solid rgba(0, 255, 255, 0.3)',
                            borderRadius: '6px',
                            color: commentTexts[prompt.id]?.trim() ? '#00FFFF' : '#666666',
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
                            const isCommentOwner = currentUser?.id === comment.userId
                            
                            return (
                              <div
                                key={comment.id}
                                style={{
                                  background: 'rgba(0, 255, 255, 0.05)',
                                  border: '1px solid rgba(0, 255, 255, 0.2)',
                                  borderRadius: '8px',
                                  padding: '16px',
                                }}
                              >
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '8px' }}>
                                  <div>
                                    <p style={{ color: '#00FFFF', fontSize: '0.9rem', fontWeight: '600', margin: '0 0 4px 0' }}>
                                      {comment.username}
                                    </p>
                                    <p style={{ color: '#cccccc', fontSize: '0.85rem', margin: 0, lineHeight: '1.5' }}>
                                      {comment.text}
                                    </p>
                                  </div>
                                  <p style={{ color: '#888888', fontSize: '0.75rem', margin: 0 }}>
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
                                      color: '#00FFFF',
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
                                      <div key={reply.id} style={{ marginBottom: '12px', padding: '12px', background: 'rgba(0, 0, 0, 0.2)', borderRadius: '6px' }}>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '4px' }}>
                                          <p style={{ color: '#00FF00', fontSize: '0.85rem', fontWeight: '600', margin: 0 }}>
                                            {reply.username}
                                          </p>
                                          <p style={{ color: '#888888', fontSize: '0.7rem', margin: 0 }}>
                                            {formatDate(reply.createdAt)}
                                          </p>
                                        </div>
                                        <p style={{ color: '#cccccc', fontSize: '0.8rem', margin: 0, lineHeight: '1.4' }}>
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
                                        background: 'rgba(0, 0, 0, 0.3)',
                                        border: '1px solid rgba(0, 255, 255, 0.3)',
                                        borderRadius: '6px',
                                        color: '#ffffff',
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
                                        background: replyTexts[comment.id]?.trim() ? 'rgba(0, 255, 0, 0.2)' : 'rgba(0, 255, 0, 0.05)',
                                        border: '1px solid rgba(0, 255, 0, 0.3)',
                                        borderRadius: '6px',
                                        color: replyTexts[comment.id]?.trim() ? '#00FF00' : '#666666',
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
                        <p style={{ color: '#888888', fontSize: '0.9rem', fontStyle: 'italic', textAlign: 'center', padding: '20px' }}>
                          No comments yet. Be the first to comment!
                        </p>
                      )}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>
    </motion.div>
  )
}

export default LeaderboardView
