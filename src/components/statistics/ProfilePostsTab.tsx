import React from 'react'
import { motion } from 'framer-motion'
import { Heart, MessageSquare, Cpu, Trophy, Rocket, User, Calendar, Trash2 } from 'lucide-react'
import { spacing, fontSize, fontWeight, radius, transition } from '../../utils/styles'
import { sx } from '../../utils/styles'

interface ProfilePostsTabProps {
  isViewingOther: boolean
  viewingProfile: any
  leaderboardStats: any
  profilePrompts: any[]
  loadingProfile: boolean
  loadingPublicProfile: boolean
  winningPrompts: any
  currentUser: any
  currentTheme: any
  theme: string
  s: any
  deletingPostId: string | null
  confirmDeleteId: string | null
  setConfirmDeleteId: (id: string | null) => void
  handleDeletePost: (id: string) => void
}

const ProfilePostsTab = ({
  isViewingOther,
  viewingProfile,
  leaderboardStats,
  profilePrompts,
  loadingProfile,
  loadingPublicProfile,
  winningPrompts,
  currentUser,
  currentTheme,
  theme,
  s,
  deletingPostId,
  confirmDeleteId,
  setConfirmDeleteId,
  handleDeletePost,
}: ProfilePostsTabProps) => {
  return (
    <motion.div
      key="profile"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.15 }}
    >
      {/* Stats Summary Row */}
      {!isViewingOther && leaderboardStats && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: spacing.xl, marginBottom: spacing['3xl'] }}>
          <div style={{ display: 'flex', gap: spacing.xl, flexWrap: 'wrap' }}>
            <div style={{
              flex: 1, minWidth: '140px',
              background: currentTheme.backgroundOverlay,
              border: `1px solid ${currentTheme.borderLight}`,
              borderRadius: radius.xl, padding: '18px 20px',
              display: 'flex', alignItems: 'center', gap: spacing.xl,
            }}>
              <Rocket size={22} color={currentTheme.accent} />
              <div>
                <p style={{ color: currentTheme.textSecondary, fontSize: '0.78rem', margin: 0 }}>Total Prompts</p>
                <p key={`stat-prompts-${theme}`} style={sx(s.gradientText, {
                  fontSize: '1.4rem', fontWeight: fontWeight.bold, margin: 0,
                })}>{leaderboardStats.totalPrompts || 0}</p>
              </div>
            </div>
            <div style={{
              flex: 1, minWidth: '140px',
              background: currentTheme.backgroundOverlay,
              border: `1px solid ${currentTheme.borderLight}`,
              borderRadius: radius.xl, padding: '18px 20px',
              display: 'flex', alignItems: 'center', gap: spacing.xl,
            }}>
              <Heart size={22} color="#ff6b6b" />
              <div>
                <p style={{ color: currentTheme.textSecondary, fontSize: '0.78rem', margin: 0 }}>Total Likes</p>
                <p key={`stat-likes-${theme}`} style={sx(s.gradientText, {
                  fontSize: '1.4rem', fontWeight: fontWeight.bold, margin: 0,
                })}>{leaderboardStats.totalLikes || 0}</p>
              </div>
            </div>
          </div>

          {/* Wins in Prompt Feed Favorites */}
          <div style={{
            background: currentTheme.backgroundOverlay,
            border: `1px solid ${(leaderboardStats.wins?.length > 0) ? '#FFD70040' : currentTheme.borderLight}`,
            borderRadius: radius.xl,
            padding: `${spacing['2xl']} ${spacing['3xl']}`,
            ...(leaderboardStats.wins?.length > 0 ? {
              background: `linear-gradient(135deg, ${currentTheme.backgroundOverlay}, rgba(255, 215, 0, 0.03))`,
            } : {}),
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: spacing.lg, marginBottom: leaderboardStats.wins?.length > 0 ? '16px' : '0' }}>
              <Trophy size={24} color="#FFD700" />
              <div style={{ flex: 1 }}>
                <p style={{ color: currentTheme.text, fontSize: fontSize['2xl'], fontWeight: fontWeight.semibold, margin: 0 }}>
                  Wins in Prompt Feed Favorites
                </p>
                <p style={{ color: currentTheme.textMuted, fontSize: fontSize.md, margin: `${spacing['2xs']} 0 0 0` }}>
                  {leaderboardStats.wins?.length > 0
                    ? `${leaderboardStats.winCount} winning ${leaderboardStats.winCount === 1 ? 'prompt' : 'prompts'}`
                    : 'No wins yet — get the most likes on a prompt to win!'}
                </p>
              </div>
              <p key={`stat-wins-${theme}`} style={{
                fontSize: '2rem', fontWeight: fontWeight.extrabold, margin: 0,
                background: leaderboardStats.wins?.length > 0 ? 'linear-gradient(135deg, #FFD700, #FFA500)' : currentTheme.accentGradient,
                WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent',
                color: currentTheme.accent, display: 'inline-block',
              }}>{leaderboardStats.winCount || 0}</p>
            </div>

            {leaderboardStats.wins?.length > 0 && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: spacing.lg }}>
                {leaderboardStats.wins.map((win: any, idx: number) => (
                  <div
                    key={win.promptId || idx}
                    style={{
                      background: theme === 'light' ? 'rgba(255, 215, 0, 0.06)' : 'rgba(255, 215, 0, 0.04)',
                      border: `1px solid rgba(255, 215, 0, 0.15)`,
                      borderRadius: radius.lg,
                      padding: `14px ${spacing.xl}`,
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'flex-start', gap: spacing.lg }}>
                      <Trophy size={16} color="#FFD700" style={{ marginTop: spacing['2xs'], flexShrink: 0 }} />
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <p style={{
                          color: currentTheme.text, fontSize: '0.92rem', fontWeight: fontWeight.medium,
                          margin: `0 0 ${spacing.sm} 0`, lineHeight: '1.4',
                          wordBreak: 'break-word',
                        }}>
                          {win.promptTextShort || win.promptText}
                        </p>
                        <div style={{ display: 'flex', alignItems: 'center', gap: spacing.lg, flexWrap: 'wrap' }}>
                          {win.category && (
                            <span style={{
                              padding: `${spacing['2xs']} ${spacing.md}`, borderRadius: radius.lg,
                              background: `${currentTheme.accent}15`,
                              border: `1px solid ${currentTheme.accent}30`,
                              color: currentTheme.accent, fontSize: fontSize.xs, fontWeight: fontWeight.medium,
                            }}>
                              {win.category}
                            </span>
                          )}
                          <span style={{ color: currentTheme.textMuted, fontSize: '0.75rem', display: 'flex', alignItems: 'center', gap: spacing.xs }}>
                            <Calendar size={11} />
                            {new Date(win.date).toLocaleDateString('en-US', {
                              month: 'short', day: 'numeric', year: 'numeric',
                            })}
                          </span>
                          <span style={{ color: currentTheme.error, fontSize: '0.75rem', display: 'flex', alignItems: 'center', gap: spacing.xs }}>
                            <Heart size={11} fill="#ff6b6b" />
                            {win.likes} {win.likes === 1 ? 'like' : 'likes'}
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      <div style={{ marginBottom: spacing['3xl'] }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: spacing.lg, marginBottom: spacing.md }}>
          <User size={28} color={currentTheme.accent} />
          <h2 style={{
            fontSize: fontSize['6xl'],
            margin: 0,
            background: currentTheme.accentGradient,
            WebkitBackgroundClip: 'text',
            WebkitTextFillColor: 'transparent',
          }}>
            {isViewingOther ? `${viewingProfile.username}'s Posts` : 'My Prompt Feed Posts'}
          </h2>
        </div>
        <p style={{ color: currentTheme.textSecondary, fontSize: fontSize.xl, margin: 0 }}>
          {isViewingOther
            ? `All prompts ${viewingProfile.username} has submitted to the Prompt Feed.`
            : 'All prompts you have submitted to the Prompt Feed.'}
        </p>
      </div>

      {(loadingProfile || loadingPublicProfile) ? (
        <div style={{ textAlign: 'center', padding: spacing['5xl'] }}>
          <p style={{ color: currentTheme.textSecondary, fontSize: fontSize['3xl'] }}>
            {isViewingOther ? `Loading ${viewingProfile.username}'s posts...` : 'Loading your prompts...'}
          </p>
        </div>
      ) : profilePrompts.length === 0 ? (
        <div style={{
          background: currentTheme.backgroundOverlay,
          border: `1px solid ${currentTheme.borderLight}`,
          borderRadius: radius['2xl'],
          padding: '50px',
          textAlign: 'center',
        }}>
          <Rocket size={48} color={currentTheme.textMuted} style={{ marginBottom: spacing.xl, opacity: 0.5 }} />
          <p style={{ color: currentTheme.textSecondary, fontSize: fontSize['3xl'], margin: `0 0 ${spacing.md} 0` }}>
            {isViewingOther
              ? `${viewingProfile.username} hasn't submitted any prompts to the Prompt Feed yet.`
              : "You haven't submitted any prompts to the Prompt Feed yet."}
          </p>
          {!isViewingOther && (
          <p style={{ color: currentTheme.textMuted, fontSize: fontSize.lg, margin: 0 }}>
            Submit your first prompt from the home tab to see it here!
          </p>
          )}
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: spacing.xl }}>
          {/* Prompt Cards */}
          {profilePrompts.map((prompt, index) => (
            <div
              key={prompt.id || index}
              style={{
                background: currentTheme.backgroundOverlay,
                border: `1px solid ${currentTheme.borderLight}`,
                borderRadius: radius.xl,
                padding: `${spacing['2xl']} ${spacing['3xl']}`,
                transition: 'border-color 0.2s ease',
              }}
              onMouseEnter={(e) => { e.currentTarget.style.borderColor = currentTheme.borderActive }}
              onMouseLeave={(e) => { e.currentTarget.style.borderColor = currentTheme.borderLight }}
            >
              {/* Prompt Header */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: spacing.lg }}>
                <div style={{ flex: 1 }}>
                  <p style={{
                    color: currentTheme.text,
                    fontSize: fontSize['2xl'],
                    margin: `0 0 ${spacing.md} 0`,
                    lineHeight: '1.5',
                    paddingRight: '36px',
                  }}>
                    {prompt.promptText}
                  </p>
                  <div style={{ display: 'flex', gap: spacing.md, flexWrap: 'wrap', alignItems: 'center' }}>
                    {prompt.category && (
                      <span style={{
                        padding: '3px 10px',
                        borderRadius: radius.xl,
                        background: `${currentTheme.accent}15`,
                        border: `1px solid ${currentTheme.accent}30`,
                        color: currentTheme.accent,
                        fontSize: '0.75rem',
                        fontWeight: fontWeight.medium,
                      }}>
                        {prompt.category}
                      </span>
                    )}
                    <span style={{ color: currentTheme.textMuted, fontSize: '0.75rem' }}>
                      {new Date(prompt.createdAt).toLocaleDateString('en-US', {
                        month: 'short',
                        day: 'numeric',
                        year: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </span>
                    {winningPrompts?.some((w: any) => w.promptId === prompt.id) && (
                      <span style={{
                        padding: `${spacing['2xs']} ${spacing.md}`, borderRadius: radius.lg, fontSize: fontSize.xs, fontWeight: fontWeight.bold,
                        background: 'linear-gradient(135deg, rgba(255, 215, 0, 0.15), rgba(255, 165, 0, 0.15))',
                        border: '1px solid rgba(255, 215, 0, 0.3)',
                        color: '#FFD700',
                        display: 'inline-flex', alignItems: 'center', gap: spacing.xs,
                        textTransform: 'uppercase', letterSpacing: '0.5px',
                      }}>
                        <Trophy size={10} /> Winning Chat
                      </span>
                    )}
                  </div>
                </div>
                {/* Delete button — only on own profile (inline confirm) */}
                {!isViewingOther && (
                <div style={{ position: 'relative', flexShrink: 0 }}>
                  <button
                    onClick={() => {
                      if (confirmDeleteId === prompt.id) {
                        handleDeletePost(prompt.id)
                      } else {
                        setConfirmDeleteId(prompt.id)
                      }
                    }}
                    onBlur={() => { if (deletingPostId !== prompt.id) setConfirmDeleteId(null) }}
                    disabled={deletingPostId === prompt.id}
                    style={{
                      background: confirmDeleteId === prompt.id ? 'rgba(255, 107, 107, 0.15)' : 'transparent',
                      border: confirmDeleteId === prompt.id ? '1px solid rgba(255, 107, 107, 0.4)' : '1px solid transparent',
                      padding: confirmDeleteId === prompt.id ? '6px 12px' : '6px',
                      cursor: deletingPostId === prompt.id ? 'default' : 'pointer',
                      borderRadius: confirmDeleteId === prompt.id ? '8px' : '6px',
                      transition: transition.fast,
                      opacity: deletingPostId === prompt.id ? 0.5 : confirmDeleteId === prompt.id ? 1 : 0.5,
                      color: currentTheme.error,
                      fontSize: '0.75rem',
                      fontWeight: fontWeight.semibold,
                      display: 'flex',
                      alignItems: 'center',
                      gap: spacing.sm,
                    }}
                    onMouseEnter={(e) => { if (deletingPostId !== prompt.id) { e.currentTarget.style.opacity = '1'; e.currentTarget.style.background = confirmDeleteId === prompt.id ? 'rgba(255, 107, 107, 0.25)' : 'rgba(255, 107, 107, 0.1)' } }}
                    onMouseLeave={(e) => { if (deletingPostId !== prompt.id) { e.currentTarget.style.opacity = confirmDeleteId === prompt.id ? '1' : '0.5'; e.currentTarget.style.background = confirmDeleteId === prompt.id ? 'rgba(255, 107, 107, 0.15)' : 'transparent' } }}
                    title={confirmDeleteId === prompt.id ? 'Click again to confirm deletion' : 'Delete this post'}
                  >
                    <Trash2 size={16} />
                    {deletingPostId === prompt.id ? 'Deleting...' : confirmDeleteId === prompt.id ? 'Confirm' : ''}
                  </button>
                </div>
                )}
              </div>

              {/* Prompt Stats */}
              <div style={{
                display: 'flex',
                gap: spacing['2xl'],
                paddingTop: '12px',
                borderTop: `1px solid ${currentTheme.borderLight}`,
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: spacing.sm }}>
                  <Heart size={16} color="#ff6b6b" fill={prompt.likeCount > 0 ? '#ff6b6b' : 'none'} />
                  <span style={{ color: currentTheme.textSecondary, fontSize: fontSize.base }}>
                    {prompt.likeCount || 0} {(prompt.likeCount || 0) === 1 ? 'like' : 'likes'}
                  </span>
                </div>
                {prompt.comments && prompt.comments.length > 0 && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: spacing.sm }}>
                    <MessageSquare size={16} color={currentTheme.textSecondary} />
                    <span style={{ color: currentTheme.textSecondary, fontSize: fontSize.base }}>
                      {prompt.comments.length} {prompt.comments.length === 1 ? 'comment' : 'comments'}
                    </span>
                  </div>
                )}
                {prompt.responses && prompt.responses.length > 0 && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: spacing.sm }}>
                    <Cpu size={16} color={currentTheme.textSecondary} />
                    <span style={{ color: currentTheme.textSecondary, fontSize: fontSize.base }}>
                      {prompt.responses.length} {prompt.responses.length === 1 ? 'response' : 'responses'}
                    </span>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </motion.div>
  )
}

export default ProfilePostsTab
