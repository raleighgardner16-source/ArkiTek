import React from 'react'
import { motion } from 'framer-motion'
import { ArrowLeft, User, Edit3 } from 'lucide-react'
import { spacing, fontSize, fontWeight, radius } from '../../utils/styles'

interface ProfileHeaderProps {
  isViewingOther: boolean
  publicProfile: any
  ownProfileData: any
  viewingProfile: any
  currentUser: any
  stats: any
  currentTheme: any
  formatAccountAge: (date: string) => string
  clearViewingProfile: () => void
  onEditProfile: () => void
}

const ProfileHeader = ({
  isViewingOther,
  publicProfile,
  ownProfileData,
  viewingProfile,
  currentUser,
  stats,
  currentTheme,
  formatAccountAge,
  clearViewingProfile,
  onEditProfile,
}: ProfileHeaderProps) => {
  const profileData = isViewingOther ? publicProfile : ownProfileData
  const displayUsername = isViewingOther
    ? (publicProfile?.username || viewingProfile?.username || 'User')
    : (currentUser?.username || 'You')
  const displayBio = profileData?.bio || ''
  const displayImage = profileData?.profileImage || null
  const memberSince = profileData?.createdAt || stats?.createdAt || currentUser?.createdAt

  return (
    <div style={{ marginBottom: spacing['4xl'] }}>
      {isViewingOther && (
        <motion.button
          onClick={() => clearViewingProfile()}
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.98 }}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: spacing.md,
            padding: '8px 16px',
            background: currentTheme.buttonBackground,
            border: `1px solid ${currentTheme.borderLight}`,
            borderRadius: radius.lg,
            color: currentTheme.accent,
            fontSize: fontSize.lg,
            fontWeight: fontWeight.medium,
            cursor: 'pointer',
            marginBottom: spacing.xl,
          }}
        >
          <ArrowLeft size={16} />
          Back to My Profile
        </motion.button>
      )}

      <div style={{
        display: 'flex',
        flexDirection: 'column',
        gap: spacing['2xl'],
        padding: spacing['3xl'],
        background: currentTheme.buttonBackground,
        border: `1px solid ${currentTheme.borderLight}`,
        borderRadius: radius['2xl'],
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: spacing['3xl'], flexWrap: 'wrap' }}>
          {/* Avatar */}
          <div style={{
            width: '88px',
            height: '88px',
            borderRadius: radius.circle,
            background: displayImage ? 'none' : currentTheme.accentGradient,
            border: `3px solid ${currentTheme.accent}40`,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            overflow: 'hidden',
            flexShrink: 0,
          }}>
            {displayImage ? (
              <img src={displayImage} alt="Profile" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
            ) : (
              <User size={36} color="#fff" />
            )}
          </div>

          {/* Info + Stats */}
          <div style={{ flex: 1, minWidth: '200px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: spacing.lg, flexWrap: 'wrap', marginBottom: spacing.md }}>
              <h2 style={{
                fontSize: fontSize['6xl'],
                fontWeight: fontWeight.bold,
                margin: 0,
                color: currentTheme.text,
              }}>
                {displayUsername}
              </h2>

              {/* Follow button disabled - social features temporarily removed */}
              {isViewingOther ? null : (
                <motion.button
                  onClick={onEditProfile}
                  whileHover={{ scale: 1.03 }}
                  whileTap={{ scale: 0.97 }}
                  style={{
                    padding: `${spacing.sm} ${spacing.xl}`,
                    background: 'transparent',
                    border: `1px solid ${currentTheme.borderLight}`,
                    borderRadius: radius.md,
                    color: currentTheme.textSecondary,
                    fontSize: fontSize.base,
                    fontWeight: fontWeight.medium,
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: spacing.sm,
                  }}
                >
                  <Edit3 size={14} /> Edit Profile
                </motion.button>
              )}
            </div>

            {/* DISABLED: Social stats row (posts, followers, following) temporarily removed */}

            {/* Bio */}
            {displayBio && (
              <p style={{
                color: currentTheme.text,
                fontSize: fontSize.lg,
                lineHeight: '1.5',
                margin: 0,
                whiteSpace: 'pre-wrap',
                wordBreak: 'break-word',
              }}>
                {displayBio}
              </p>
            )}

            <p style={{ color: currentTheme.textMuted || currentTheme.textSecondary, fontSize: '0.78rem', margin: `${spacing.xs} 0 0 0`, minHeight: '1.2em' }}>
              {memberSince ? `Member for ${formatAccountAge(memberSince)}` : '\u00A0'}
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}

export default ProfileHeader
