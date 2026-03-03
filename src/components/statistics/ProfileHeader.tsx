import React, { useState, useRef, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { ArrowLeft, User, Edit3, Star, Flame, Zap, HelpCircle, X } from 'lucide-react'
import { spacing, fontSize, fontWeight, radius } from '../../utils/styles'
import { getLevelFromXP, getLevelTitle, getStreakMultiplier } from '../../utils/xpConstants'

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

  const xpData = stats?.xp || { totalXP: 0, level: 1, currentLevelXP: 0, nextLevelXP: 100, levelTitle: 'Apprentice' }
  const level = xpData.level || 1
  const levelTitle = xpData.levelTitle || getLevelTitle(level)
  const currentLevelXP = xpData.currentLevelXP || 0
  const nextLevelXP = xpData.nextLevelXP || 100
  const totalXP = xpData.totalXP || 0
  const xpProgress = nextLevelXP > 0 ? Math.min((currentLevelXP / nextLevelXP) * 100, 100) : 0

  const streakDays = stats?.streakDays || 0
  const streakInfo = getStreakMultiplier(streakDays)

  const [showXpGuide, setShowXpGuide] = useState(false)
  const xpGuideRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!showXpGuide) return
    const handleClickOutside = (e: MouseEvent) => {
      if (xpGuideRef.current && !xpGuideRef.current.contains(e.target as Node)) {
        setShowXpGuide(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [showXpGuide])

  const xpActions = [
    { action: 'Send a prompt', xp: 10 },
    { action: 'Send a follow-up', xp: 15 },
    { action: 'Rate a response', xp: 20 },
    { action: 'First prompt of the day', xp: 25 },
    { action: 'Complete a daily challenge', xp: 50 },
    { action: 'Use Council mode', xp: 15 },
    { action: 'Use Debate mode', xp: 20 },
    { action: 'Discover a new category', xp: 75 },
    { action: 'Discover a new model', xp: 100 },
  ]

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
          <div style={{ position: 'relative', flexShrink: 0 }}>
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
            }}>
              {displayImage ? (
                <img src={displayImage} alt="Profile" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
              ) : (
                <User size={36} color="#fff" />
              )}
            </div>
          </div>

          {/* Info + Stats */}
          <div style={{ flex: 1, minWidth: '200px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: spacing.lg, flexWrap: 'wrap', marginBottom: spacing.sm }}>
              <h2 style={{
                fontSize: fontSize['6xl'],
                fontWeight: fontWeight.bold,
                margin: 0,
                color: currentTheme.text,
              }}>
                {displayUsername}
              </h2>

              {/* Level title pill */}
              <span style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '4px',
                padding: '3px 10px',
                background: `${currentTheme.accent}18`,
                border: `1px solid ${currentTheme.accent}30`,
                borderRadius: radius.lg,
                color: currentTheme.accent,
                fontSize: fontSize.sm,
                fontWeight: fontWeight.semibold,
                letterSpacing: '0.3px',
              }}>
                <Star size={12} />
                {levelTitle}
              </span>

              {/* How to Gain XP button */}
              <div style={{ position: 'relative' }} ref={xpGuideRef}>
                <motion.button
                  onClick={() => setShowXpGuide(!showXpGuide)}
                  whileHover={{ scale: 1.03 }}
                  whileTap={{ scale: 0.97 }}
                  style={{
                    padding: `${spacing.sm} ${spacing.xl}`,
                    background: `${currentTheme.accent}12`,
                    border: `1px solid ${currentTheme.accent}30`,
                    borderRadius: radius.md,
                    color: currentTheme.accent,
                    fontSize: fontSize.base,
                    fontWeight: fontWeight.medium,
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: spacing.sm,
                  }}
                >
                  <HelpCircle size={14} /> How to Gain XP
                </motion.button>

                <AnimatePresence>
                  {showXpGuide && (
                    <motion.div
                      initial={{ opacity: 0, y: -8, scale: 0.96 }}
                      animate={{ opacity: 1, y: 0, scale: 1 }}
                      exit={{ opacity: 0, y: -8, scale: 0.96 }}
                      transition={{ duration: 0.18 }}
                      style={{
                        position: 'absolute',
                        top: 'calc(100% + 8px)',
                        left: 0,
                        zIndex: 100,
                        minWidth: '300px',
                        background: currentTheme.cardBg || currentTheme.buttonBackground,
                        border: `1px solid ${currentTheme.borderLight}`,
                        borderRadius: radius.xl,
                        boxShadow: `0 8px 32px rgba(0,0,0,0.25)`,
                        padding: spacing['2xl'],
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: spacing.lg }}>
                        <span style={{
                          color: currentTheme.text,
                          fontSize: fontSize.lg,
                          fontWeight: fontWeight.bold,
                          display: 'flex',
                          alignItems: 'center',
                          gap: spacing.sm,
                        }}>
                          <Zap size={16} color={currentTheme.accent} />
                          Ways to Earn XP
                        </span>
                        <motion.button
                          onClick={() => setShowXpGuide(false)}
                          whileHover={{ scale: 1.1 }}
                          whileTap={{ scale: 0.9 }}
                          style={{
                            background: 'transparent',
                            border: 'none',
                            color: currentTheme.textMuted,
                            cursor: 'pointer',
                            padding: '4px',
                            display: 'flex',
                            alignItems: 'center',
                          }}
                        >
                          <X size={16} />
                        </motion.button>
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: spacing.sm }}>
                        {xpActions.map((item, i) => (
                          <div
                            key={i}
                            style={{
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'space-between',
                              padding: `${spacing.sm} ${spacing.md}`,
                              background: `${currentTheme.accent}08`,
                              borderRadius: radius.md,
                            }}
                          >
                            <span style={{ color: currentTheme.text, fontSize: fontSize.base }}>
                              {item.action}
                            </span>
                            <span style={{
                              color: currentTheme.accent,
                              fontSize: fontSize.sm,
                              fontWeight: fontWeight.bold,
                              whiteSpace: 'nowrap',
                              marginLeft: spacing.lg,
                            }}>
                              +{item.xp} XP
                            </span>
                          </div>
                        ))}
                      </div>
                      {streakDays >= 3 && (
                        <div style={{
                          marginTop: spacing.lg,
                          padding: `${spacing.sm} ${spacing.md}`,
                          background: '#FF634712',
                          borderRadius: radius.md,
                          display: 'flex',
                          alignItems: 'center',
                          gap: spacing.sm,
                        }}>
                          <Flame size={14} color="#FF6347" />
                          <span style={{ color: currentTheme.text, fontSize: fontSize.sm }}>
                            Streak bonus active: <strong style={{ color: '#FF6347' }}>{streakInfo.label}</strong> multiplier on all XP
                          </span>
                        </div>
                      )}
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>

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

            {/* XP Progress Bar */}
            <div style={{ marginBottom: spacing.md }}>
              <div style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                marginBottom: '4px',
              }}>
                <span style={{
                  color: currentTheme.textSecondary,
                  fontSize: fontSize.sm,
                  fontWeight: fontWeight.medium,
                  display: 'flex',
                  alignItems: 'center',
                  gap: '4px',
                }}>
                  <Zap size={12} color={currentTheme.accent} />
                  Level {level}
                </span>
                <div style={{ display: 'flex', alignItems: 'center', gap: spacing.lg }}>
                  {streakDays >= 3 && (
                    <span style={{
                      color: '#FF6347',
                      fontSize: fontSize.xs,
                      fontWeight: fontWeight.semibold,
                      display: 'flex',
                      alignItems: 'center',
                      gap: '3px',
                    }}>
                      <Flame size={11} />
                      {streakInfo.label} XP
                    </span>
                  )}
                  <span style={{
                    color: currentTheme.textMuted,
                    fontSize: fontSize.xs,
                  }}>
                    {currentLevelXP.toLocaleString()} / {nextLevelXP.toLocaleString()} XP
                  </span>
                </div>
              </div>
              <div style={{
                width: '100%',
                height: '6px',
                background: `${currentTheme.accent}15`,
                borderRadius: '3px',
                overflow: 'hidden',
              }}>
                <motion.div
                  initial={{ width: 0 }}
                  animate={{ width: `${xpProgress}%` }}
                  transition={{ duration: 0.8, ease: 'easeOut' }}
                  style={{
                    height: '100%',
                    background: currentTheme.accentGradient,
                    borderRadius: '3px',
                  }}
                />
              </div>
              <div style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                marginTop: '3px',
              }}>
                <span style={{
                  color: currentTheme.textMuted,
                  fontSize: fontSize['2xs'],
                }}>
                  {totalXP.toLocaleString()} total XP
                </span>
                <span style={{
                  color: currentTheme.textMuted,
                  fontSize: fontSize['2xs'],
                }}>
                  Level {level + 1}
                </span>
              </div>
            </div>

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
