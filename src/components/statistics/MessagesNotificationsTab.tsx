import React from 'react'
import { motion } from 'framer-motion'
import { Bell, Heart, MessageSquare, UserPlus, UserCheck, User, MessageCircle } from 'lucide-react'
import { spacing, fontSize, fontWeight, radius, transition } from '../../utils/styles'
import MessagingView from '../MessagingView'

interface MessagesNotificationsTabProps {
  currentUser: any
  currentTheme: any
  ownProfileData: any
  notifSubTab: string
  setNotifSubTab: (tab: string) => void
  notifications: any[]
  unreadNotifCount: number
  loadingNotifications: boolean
  followingSet: Set<string>
  followBackLoading: string | null
  handleFollowBack: (targetUserId: string) => void
  followRequests: any[]
  loadingFollowRequests: boolean
  processingRequestId: string | null
  handleAcceptFollowRequest: (requesterId: string) => void
  handleDenyFollowRequest: (requesterId: string) => void
}

const MessagesNotificationsTab = ({
  currentUser,
  currentTheme,
  ownProfileData,
  notifSubTab,
  setNotifSubTab,
  notifications,
  unreadNotifCount,
  loadingNotifications,
  followingSet,
  followBackLoading,
  handleFollowBack,
  followRequests,
  loadingFollowRequests,
  processingRequestId,
  handleAcceptFollowRequest,
  handleDenyFollowRequest,
}: MessagesNotificationsTabProps) => {
  return (
    <motion.div
      key="leaderboard"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.15 }}
    >
      {/* Sub-tabs: Messages/Groups | Notifications */}
      <div style={{
        display: 'flex',
        marginBottom: spacing['3xl'],
        borderBottom: `1px solid ${currentTheme.borderLight}`,
      }}>
        <button
          onClick={() => setNotifSubTab('messages')}
          style={{
            flex: 1,
            padding: spacing.lg,
            background: notifSubTab === 'messages' ? currentTheme.buttonBackgroundActive : 'transparent',
            border: 'none',
            borderBottom: notifSubTab === 'messages' ? `2px solid ${currentTheme.accent}` : '2px solid transparent',
            color: notifSubTab === 'messages' ? currentTheme.accent : currentTheme.textSecondary,
            fontSize: fontSize.xl,
            fontWeight: notifSubTab === 'messages' ? fontWeight.semibold : fontWeight.normal,
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: spacing.md,
            transition: transition.normal,
          }}
        >
          <MessageCircle size={18} />
          Messages / Groups
        </button>
        <button
          onClick={() => setNotifSubTab('notifications')}
          style={{
            flex: 1,
            padding: spacing.lg,
            background: notifSubTab === 'notifications' ? currentTheme.buttonBackgroundActive : 'transparent',
            border: 'none',
            borderBottom: notifSubTab === 'notifications' ? `2px solid ${currentTheme.accent}` : '2px solid transparent',
            color: notifSubTab === 'notifications' ? currentTheme.accent : currentTheme.textSecondary,
            fontSize: fontSize.xl,
            fontWeight: notifSubTab === 'notifications' ? fontWeight.semibold : fontWeight.normal,
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: spacing.md,
            transition: transition.normal,
          }}
        >
          <div style={{ position: 'relative', display: 'inline-flex' }}>
            <Bell size={18} />
            {unreadNotifCount > 0 && notifSubTab !== 'notifications' && (
              <div style={{
                position: 'absolute',
                top: '-5px',
                right: '-7px',
                minWidth: '14px',
                height: '14px',
                borderRadius: '7px',
                background: '#ff4757',
                color: '#fff',
                fontSize: '0.55rem',
                fontWeight: fontWeight.bold,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                padding: '0 3px',
                lineHeight: 1,
              }}>
                {unreadNotifCount > 9 ? '9+' : unreadNotifCount}
              </div>
            )}
          </div>
          Notifications
        </button>
      </div>

      {/* Messages/Groups sub-tab */}
      {notifSubTab === 'messages' && (
        <div style={{ minHeight: '500px' }}>
          <MessagingView embedded />
        </div>
      )}

      {/* Notifications sub-tab */}
      {notifSubTab === 'notifications' && (
      <>
      {!currentUser ? (
        <div style={{
          background: currentTheme.backgroundOverlay,
          border: `1px solid ${currentTheme.borderLight}`,
          borderRadius: radius['2xl'],
          padding: spacing['5xl'],
          textAlign: 'center',
        }}>
          <p style={{ color: currentTheme.textSecondary, fontSize: fontSize['3xl'] }}>
            Please sign in to view your notifications.
          </p>
        </div>
      ) : (
        <div>
          {/* Follow Requests Section (only for private accounts with pending requests) */}
          {ownProfileData?.isPrivate && followRequests.length > 0 && (
            <div style={{
              background: currentTheme.backgroundOverlay,
              border: `1px solid ${currentTheme.accent}30`,
              borderRadius: radius['2xl'],
              padding: spacing['2xl'],
              marginBottom: spacing['2xl'],
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: spacing.lg, marginBottom: spacing.xl }}>
                <UserPlus size={20} color={currentTheme.accent} />
                <h3 style={{ color: currentTheme.accent, fontSize: fontSize['3xl'], margin: 0 }}>
                  Follow Requests
                </h3>
                <span style={{
                  background: currentTheme.accent,
                  color: '#fff',
                  fontSize: '0.75rem',
                  fontWeight: fontWeight.bold,
                  padding: `${spacing['2xs']} ${spacing.md}`,
                  borderRadius: radius.lg,
                  minWidth: '20px',
                  textAlign: 'center',
                }}>
                  {followRequests.length}
                </span>
              </div>
              {loadingFollowRequests ? (
                <p style={{ color: currentTheme.textSecondary, fontSize: fontSize.lg }}>Loading...</p>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: spacing.lg }}>
                  {followRequests.map(req => (
                    <div key={req.userId} style={{
                      display: 'flex', alignItems: 'center', gap: spacing.lg,
                      padding: spacing.lg, borderRadius: radius.lg,
                      background: `${currentTheme.accent}08`,
                    }}>
                      <div style={{
                        width: '40px', height: '40px', borderRadius: radius.circle,
                        background: req.profileImage ? 'none' : currentTheme.accentGradient,
                        overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                      }}>
                        {req.profileImage ? (
                          <img src={req.profileImage} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                        ) : (
                          <User size={18} color="#fff" />
                        )}
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <p style={{ color: currentTheme.text, fontSize: fontSize.lg, fontWeight: fontWeight.semibold, margin: 0 }}>
                          {req.username}
                        </p>
                        {req.bio && (
                          <p style={{ color: currentTheme.textSecondary, fontSize: '0.78rem', margin: `${spacing['2xs']} 0 0 0`, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {req.bio}
                          </p>
                        )}
                      </div>
                      <div style={{ display: 'flex', gap: spacing.md, flexShrink: 0 }}>
                        <motion.button
                          onClick={() => handleAcceptFollowRequest(req.userId)}
                          disabled={processingRequestId === req.userId}
                          whileHover={{ scale: 1.05 }}
                          whileTap={{ scale: 0.95 }}
                          style={{
                            padding: `${spacing.sm} ${spacing.xl}`, background: currentTheme.accentGradient,
                            border: 'none', borderRadius: radius.md, color: '#fff',
                            fontSize: fontSize.md, fontWeight: fontWeight.semibold, cursor: 'pointer',
                            opacity: processingRequestId === req.userId ? 0.6 : 1,
                          }}
                        >
                          Accept
                        </motion.button>
                        <motion.button
                          onClick={() => handleDenyFollowRequest(req.userId)}
                          disabled={processingRequestId === req.userId}
                          whileHover={{ scale: 1.05 }}
                          whileTap={{ scale: 0.95 }}
                          style={{
                            padding: `${spacing.sm} ${spacing.xl}`, background: 'transparent',
                            border: `1px solid ${currentTheme.borderLight}`, borderRadius: radius.md,
                            color: currentTheme.textSecondary, fontSize: fontSize.md, fontWeight: fontWeight.medium, cursor: 'pointer',
                            opacity: processingRequestId === req.userId ? 0.6 : 1,
                          }}
                        >
                          Deny
                        </motion.button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* All Notifications */}
          <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            marginBottom: spacing.xl,
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: spacing.lg }}>
              <Bell size={22} color={currentTheme.accent} />
              <h3 style={{ color: currentTheme.text, fontSize: fontSize['4xl'], margin: 0 }}>Notifications</h3>
              {unreadNotifCount > 0 && (
                <span style={{
                  background: '#ff6b6b',
                  color: '#fff',
                  fontSize: '0.72rem',
                  fontWeight: fontWeight.bold,
                  padding: '2px 7px',
                  borderRadius: radius.lg,
                }}>
                  {unreadNotifCount} new
                </span>
              )}
            </div>
          </div>

          {loadingNotifications ? (
            <div style={{ textAlign: 'center', padding: spacing['5xl'] }}>
              <p style={{ color: currentTheme.textSecondary, fontSize: fontSize['2xl'] }}>Loading notifications...</p>
            </div>
          ) : notifications.length === 0 ? (
            <div style={{
              background: currentTheme.backgroundOverlay,
              border: `1px solid ${currentTheme.borderLight}`,
              borderRadius: radius['2xl'],
              padding: spacing['5xl'],
              textAlign: 'center',
            }}>
              <Bell size={40} color={currentTheme.textMuted} style={{ marginBottom: spacing.lg, opacity: 0.4 }} />
              <p style={{ color: currentTheme.textSecondary, fontSize: fontSize['2xl'], margin: `0 0 ${spacing.sm} 0` }}>No notifications yet</p>
              <p style={{ color: currentTheme.textMuted, fontSize: fontSize.base, margin: 0 }}>
                When people like, comment on, or follow you, you'll see it here.
              </p>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: spacing.xs }}>
              {notifications.map((notif) => {
                const notifIcon = ({
                  like: <Heart size={16} color="#ff6b6b" fill="#ff6b6b" />,
                  comment: <MessageSquare size={16} color={currentTheme.accent} />,
                  reply: <MessageSquare size={16} color="#a78bfa" />,
                  follow: <UserPlus size={16} color="#22c55e" />,
                  follow_request: <UserPlus size={16} color={currentTheme.accent} />,
                  follow_accepted: <UserCheck size={16} color="#22c55e" />,
                } as Record<string, any>)[notif.type] || <Bell size={16} color={currentTheme.textSecondary} />

                const notifText = ({
                  like: 'liked your prompt',
                  comment: 'commented on your prompt',
                  reply: 'replied to your comment',
                  follow: 'started following you',
                  follow_request: 'requested to follow you',
                  follow_accepted: 'accepted your follow request',
                } as Record<string, any>)[notif.type] || 'interacted with you'

                return (
                  <div key={notif._id} style={{
                    display: 'flex', alignItems: 'flex-start', gap: spacing.lg,
                    padding: `14px ${spacing.xl}`, borderRadius: radius.xl,
                    background: notif.read ? 'transparent' : `${currentTheme.accent}08`,
                    border: notif.read ? 'none' : `1px solid ${currentTheme.accent}15`,
                    transition: 'background 0.2s',
                  }}>
                    <div style={{
                      width: '36px', height: '36px', borderRadius: radius.circle,
                      background: notif.fromProfileImage ? 'none' : currentTheme.accentGradient,
                      overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                    }}>
                      {notif.fromProfileImage ? (
                        <img src={notif.fromProfileImage} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                      ) : (
                        <User size={16} color="#fff" />
                      )}
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <p style={{ color: currentTheme.text, fontSize: '0.88rem', margin: 0, lineHeight: '1.4' }}>
                        <span style={{ fontWeight: fontWeight.semibold }}>{notif.fromUsername}</span>{' '}
                        {notifText}
                      </p>
                      {notif.promptText && (
                        <p style={{ color: currentTheme.textSecondary, fontSize: fontSize.md, margin: `${spacing.xs} 0 0 0`, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          "{notif.promptText}"
                        </p>
                      )}
                      {notif.commentText && (
                        <p style={{ color: currentTheme.textSecondary, fontSize: fontSize.md, margin: `${spacing.xs} 0 0 0`, fontStyle: 'italic' }}>
                          "{notif.commentText}"
                        </p>
                      )}
                      <p style={{ color: currentTheme.textMuted, fontSize: '0.72rem', margin: `${spacing.xs} 0 0 0` }}>
                        {(() => {
                          const d = new Date(notif.createdAt)
                          const now = new Date()
                          const diff = now.getTime() - d.getTime()
                          if (diff < 60000) return 'Just now'
                          if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`
                          if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`
                          if (diff < 604800000) return `${Math.floor(diff / 86400000)}d ago`
                          return d.toLocaleDateString()
                        })()}
                      </p>
                    </div>
                    {(notif.type === 'follow' || notif.type === 'follow_accepted') && notif.fromUserId && !followingSet.has(notif.fromUserId) && (
                      <motion.button
                        onClick={() => handleFollowBack(notif.fromUserId)}
                        disabled={followBackLoading === notif.fromUserId}
                        whileHover={{ scale: 1.05 }}
                        whileTap={{ scale: 0.95 }}
                        style={{
                          padding: '5px 14px',
                          background: currentTheme.accentGradient,
                          border: 'none',
                          borderRadius: radius.md,
                          color: '#fff',
                          fontSize: fontSize.sm,
                          fontWeight: fontWeight.semibold,
                          cursor: 'pointer',
                          flexShrink: 0,
                          alignSelf: 'center',
                          opacity: followBackLoading === notif.fromUserId ? 0.6 : 1,
                        }}
                      >
                        Follow back
                      </motion.button>
                    )}
                    {(notif.type === 'follow' || notif.type === 'follow_accepted') && notif.fromUserId && followingSet.has(notif.fromUserId) && (
                      <span style={{
                        fontSize: '0.72rem',
                        color: currentTheme.textMuted,
                        flexShrink: 0,
                        alignSelf: 'center',
                        fontWeight: fontWeight.medium,
                      }}>
                        Following
                      </span>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </div>
      )}
      </>
      )}
    </motion.div>
  )
}

export default MessagesNotificationsTab
