import type React from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Award, Lock, ChevronDown, ChevronRight, Zap } from 'lucide-react'
import { spacing, fontSize, fontWeight, radius, transition } from '../../utils/styles'
import { sx } from '../../utils/styles'
import { BADGE_CATEGORIES, formatBadgeNumber } from './badgeConstants'
import api from '../../utils/api'

interface BadgesTabProps {
  isFreePlan: boolean
  isViewingOther: boolean
  userStats: any
  publicProfile: any
  leaderboardStats: any
  ratingsStats: any
  currentUser: any
  currentTheme: any
  theme: string
  s: any
  expandedBadgeCategory: string | null
  setExpandedBadgeCategory: (id: string | null) => void
  hoveredBadge: string | null
  setHoveredBadge: (id: string | null) => void
  showBadgeScrollHint: boolean
  badgeCategoriesRef: React.RefObject<HTMLDivElement | null>
  dailyChallengeData: any
  claimingChallenge: boolean
  challengeClaimedAnim: boolean
  claimDailyChallenge: () => void
}

const BadgesTab = ({
  isFreePlan,
  isViewingOther,
  userStats,
  publicProfile,
  leaderboardStats,
  ratingsStats,
  currentUser,
  currentTheme,
  theme,
  s,
  expandedBadgeCategory,
  setExpandedBadgeCategory,
  hoveredBadge,
  setHoveredBadge,
  showBadgeScrollHint,
  badgeCategoriesRef,
  dailyChallengeData,
  claimingChallenge,
  challengeClaimedAnim,
  claimDailyChallenge,
}: BadgesTabProps) => {
  const providers = isViewingOther ? {} : (userStats.providers || {})
  const earnedBadgesList = isFreePlan ? [] : (isViewingOther ? (publicProfile?.earnedBadges || []) : (userStats.earnedBadges || []))
  const persistedBadges = new Set(earnedBadgesList)
  const badgeStats = isFreePlan ? {
    totalTokens: 0,
    totalPrompts: 0,
    streakDays: 0,
    totalLikes: 0,
    totalRatings: 0,
    totalComments: 0,
    councilPrompts: 0,
    debatePrompts: 0,
    provider_openai_prompts: 0,
    provider_anthropic_prompts: 0,
    provider_google_prompts: 0,
    provider_xai_prompts: 0,
  } : {
    totalTokens: userStats.totalTokens || 0,
    totalPrompts: isViewingOther ? (publicProfile?.leaderboard?.totalPosts || 0) : (userStats.totalPrompts || 0),
    streakDays: userStats.streakDays || 0,
    totalLikes: isViewingOther ? (publicProfile?.leaderboard?.totalLikes || 0) : (leaderboardStats?.totalLikes || 0),
    totalRatings: ratingsStats?.totalRatings || 0,
    totalComments: isViewingOther ? (publicProfile?.leaderboard?.totalComments || 0) : (leaderboardStats?.totalComments || 0),
    councilPrompts: userStats.councilPrompts || 0,
    debatePrompts: userStats.debatePrompts || 0,
    provider_openai_prompts: providers.openai?.totalPrompts || 0,
    provider_anthropic_prompts: providers.anthropic?.totalPrompts || 0,
    provider_google_prompts: providers.google?.totalPrompts || 0,
    provider_xai_prompts: providers.xai?.totalPrompts || 0,
  }

  const newlyEarned: any[] = []

  const badgeProgress = BADGE_CATEGORIES.map(category => {
    const currentValue = (badgeStats as Record<string, any>)[category.statKey] || 0
    const badges = category.badges.map((badge, badgeIndex) => {
      const badgeId = `${category.id}-${badgeIndex}`
      const meetsThreshold = currentValue >= badge.threshold
      const wasPreviouslyEarned = persistedBadges.has(badgeId)
      const earned = meetsThreshold || wasPreviouslyEarned
      if (meetsThreshold && !wasPreviouslyEarned) {
        newlyEarned.push(badgeId)
      }
      const prevThreshold = badgeIndex > 0 ? category.badges[badgeIndex - 1].threshold : 0
      const range = badge.threshold - prevThreshold
      const progressInRange = Math.max(0, currentValue - prevThreshold)
      const relativeProgress = range > 0 ? Math.min(1, progressInRange / range) : 0
      const absoluteProgress = Math.min(1, currentValue / badge.threshold)
      return {
        ...badge,
        earned,
        progress: absoluteProgress,
        relativeProgress,
        prevThreshold,
      }
    })
    const earnedCount = badges.filter(b => b.earned).length

    let nextBadge = null
    let nextBadgeProgress = 0
    for (let i = 0; i < badges.length; i++) {
      if (!badges[i].earned) {
        nextBadge = badges[i]
        nextBadgeProgress = badges[i].relativeProgress
        break
      }
    }

    return { ...category, badges, earnedCount, totalCount: badges.length, currentValue, nextBadge, nextBadgeProgress }
  })

  if (newlyEarned.length > 0 && currentUser?.id && !isViewingOther && !isFreePlan) {
    api.post(`/stats/${currentUser.id}/badges`, { newBadges: newlyEarned })
      .then(() => console.log(`[Badges] Persisted ${newlyEarned.length} new badges`))
      .catch(err => console.error('[Badges] Error saving badges:', err))
  }

  const totalEarned = badgeProgress.reduce((sum, cat) => sum + cat.earnedCount, 0)
  const totalBadges = badgeProgress.reduce((sum, cat) => sum + cat.totalCount, 0)

  const allOtherBadgesEarned = totalEarned >= (totalBadges)
  const ultimateBadge = {
    name: 'The Architect',
    emoji: '🌌',
    color: '#FFD700',
    desc: 'Earn all badges to become The Architect',
    earned: allOtherBadgesEarned,
  }

  return (
    <motion.div
      key="badges"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.15 }}
    >
      {/* Daily Challenge Card */}
      <div style={{
        background: isFreePlan ? 'rgba(255,255,255,0.02)' : 'linear-gradient(135deg, rgba(255, 170, 0, 0.08), rgba(255, 100, 0, 0.05))',
        border: `1px solid ${isFreePlan ? 'rgba(255,255,255,0.06)' : 'rgba(255, 170, 0, 0.25)'}`,
        borderRadius: radius['2xl'],
        padding: spacing['3xl'],
        marginBottom: spacing['3xl'],
        position: 'relative',
        overflow: 'hidden',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: spacing.lg, marginBottom: spacing.xl }}>
          <div style={{
            width: '44px',
            height: '44px',
            borderRadius: radius.circle,
            background: isFreePlan ? 'rgba(255,255,255,0.05)' : 'rgba(255, 170, 0, 0.15)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}>
            <Zap size={22} color={isFreePlan ? '#666' : currentTheme.warning} />
          </div>
          <div>
            <h3 style={{ fontSize: fontSize['3xl'], fontWeight: fontWeight.bold, color: isFreePlan ? '#666' : currentTheme.warning, margin: 0 }}>
              Daily Challenge
            </h3>
            <p style={{ fontSize: fontSize.md, color: currentTheme.textMuted, margin: 0 }}>
              {isFreePlan
                ? 'Upgrade to Pro or Premium to earn badges and complete daily challenges.'
                : 'Complete the challenge to earn bonus usage'}
            </p>
          </div>
          {challengeClaimedAnim && (
            <motion.div
              initial={{ opacity: 0, scale: 0.5 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0 }}
              style={{
                marginLeft: 'auto',
                padding: '6px 14px',
                borderRadius: radius.md,
                background: 'rgba(0, 200, 100, 0.15)',
                border: '1px solid rgba(0, 200, 100, 0.3)',
                color: '#00cc66',
                fontSize: fontSize.base,
                fontWeight: fontWeight.semibold,
              }}
            >
              +{dailyChallengeData?.percentageReward || 0}% usage claimed!
            </motion.div>
          )}
        </div>

        {isFreePlan ? (
          <div style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: spacing.lg,
            padding: spacing['2xl'],
            background: 'rgba(255,255,255,0.02)',
            borderRadius: radius.xl,
            border: '1px solid rgba(255,255,255,0.06)',
          }}>
            <Lock size={28} color="#666" />
            <p style={{ color: '#888', fontSize: fontSize.lg, textAlign: 'center', margin: 0 }}>
              Upgrade to Pro or Premium to participate in daily challenges and earn bonus usage
            </p>
            {dailyChallengeData?.challenge && (
              <div style={{ opacity: 0.4, textAlign: 'center', marginTop: spacing.md }}>
                <p style={{ color: currentTheme.textSecondary, fontSize: fontSize.base, fontWeight: fontWeight.semibold, margin: `0 0 ${spacing.xs} 0` }}>
                  Today's Challenge: {dailyChallengeData.challenge.title}
                </p>
                <p style={{ color: currentTheme.textMuted, fontSize: fontSize.md, margin: 0 }}>
                  {dailyChallengeData.challenge.description}
                </p>
              </div>
            )}
          </div>
        ) : dailyChallengeData?.challenge ? (
          <div style={{
            background: 'rgba(255, 170, 0, 0.06)',
            borderRadius: radius.xl,
            padding: spacing['2xl'],
            border: '1px solid rgba(255, 170, 0, 0.12)',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: spacing.lg }}>
              <div>
                <p style={{ color: currentTheme.warning, fontSize: fontSize['2xl'], fontWeight: fontWeight.bold, margin: `0 0 ${spacing.xs} 0` }}>
                  {dailyChallengeData.challenge.title}
                </p>
                <p style={{ color: currentTheme.textSecondary, fontSize: fontSize.base, margin: 0 }}>
                  {dailyChallengeData.challenge.description}
                </p>
              </div>
              <div style={{ textAlign: 'right', flexShrink: 0, marginLeft: spacing.xl }}>
                <p style={{ color: '#00cc66', fontSize: fontSize.base, fontWeight: fontWeight.semibold, margin: `0 0 ${spacing['2xs']} 0` }}>
                  +{dailyChallengeData.percentageReward || 0}% usage
                </p>
                <p style={{ color: currentTheme.textMuted, fontSize: fontSize.xs, margin: 0 }}>
                  reward
                </p>
              </div>
            </div>
            {/* Progress bar */}
            <div style={{
              width: '100%',
              height: '8px',
              background: 'rgba(255,255,255,0.06)',
              borderRadius: radius.xs,
              overflow: 'hidden',
              marginBottom: spacing.lg,
            }}>
              <div style={{
                width: `${Math.min(100, (dailyChallengeData.challenge.progress / dailyChallengeData.challenge.threshold) * 100)}%`,
                height: '100%',
                background: dailyChallengeData.challenge.met ? 'linear-gradient(90deg, #00cc66, #00e676)' : 'linear-gradient(90deg, #ffaa00, #ff8800)',
                borderRadius: radius.xs,
                transition: 'width 0.5s ease',
              }} />
            </div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span style={{ color: currentTheme.textMuted, fontSize: fontSize.md }}>
                {dailyChallengeData.challenge.progress} / {dailyChallengeData.challenge.threshold}
              </span>
              {dailyChallengeData.claimed ? (
                <div style={{
                  padding: '8px 18px',
                  borderRadius: radius.md,
                  background: 'rgba(0, 200, 100, 0.1)',
                  border: '1px solid rgba(0, 200, 100, 0.3)',
                  color: '#00cc66',
                  fontSize: fontSize.base,
                  fontWeight: fontWeight.semibold,
                }}>
                  Claimed
                </div>
              ) : (
                <button
                  onClick={claimDailyChallenge}
                  disabled={!dailyChallengeData.challenge.met || claimingChallenge}
                  style={{
                    padding: '8px 18px',
                    borderRadius: radius.md,
                    background: dailyChallengeData.challenge.met ? 'linear-gradient(135deg, #ffaa00, #ff8800)' : 'rgba(255,255,255,0.05)',
                    border: 'none',
                    color: dailyChallengeData.challenge.met ? '#000' : '#666',
                    fontSize: fontSize.base,
                    fontWeight: fontWeight.semibold,
                    cursor: dailyChallengeData.challenge.met ? 'pointer' : 'not-allowed',
                    opacity: claimingChallenge ? 0.6 : 1,
                    transition: transition.normal,
                  }}
                >
                  {claimingChallenge ? 'Claiming...' : dailyChallengeData.challenge.met ? 'Claim Reward' : 'In Progress'}
                </button>
              )}
            </div>
          </div>
        ) : (
          <div style={{ textAlign: 'center', padding: spacing.xl, color: currentTheme.textMuted, fontSize: fontSize.lg }}>
            Loading challenge...
          </div>
        )}
      </div>

      <div>

      {/* Overall Badge Summary with Ultimate Badge */}
      <div style={{
        background: currentTheme.backgroundOverlay,
        border: `1px solid ${allOtherBadgesEarned ? '#FFD700' : currentTheme.borderLight}`,
        borderRadius: radius['2xl'],
        padding: spacing['4xl'],
        marginBottom: spacing['4xl'],
        textAlign: 'center',
        position: 'relative',
        overflow: 'hidden',
        boxShadow: allOtherBadgesEarned ? '0 0 40px rgba(255, 215, 0, 0.15)' : 'none',
      }}>
        {/* Decorative shimmer for ultimate badge */}
        {allOtherBadgesEarned && (
          <div style={{
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: 'linear-gradient(135deg, rgba(255,215,0,0.05) 0%, transparent 50%, rgba(255,215,0,0.05) 100%)',
            pointerEvents: 'none',
          }} />
        )}

        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: spacing.xl, marginBottom: spacing.xl }}>
          <Award size={36} color={currentTheme.accent} />
          <h2 style={sx(s.gradientText, { fontSize: '1.8rem', margin: 0 })}>
            Achievement Badges
          </h2>
        </div>

        {/* Ultimate 100th Badge - "The Architect" */}
        <div style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          margin: '16px 0 24px 0',
        }}>
          <div style={{
            width: '90px',
            height: '90px',
            borderRadius: radius.circle,
            background: allOtherBadgesEarned
              ? 'radial-gradient(circle, rgba(255,215,0,0.4), rgba(255,165,0,0.15))'
              : currentTheme.backgroundTertiary,
            border: `4px solid ${allOtherBadgesEarned ? '#FFD700' : currentTheme.borderLight}`,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: fontSize['7xl'],
            opacity: allOtherBadgesEarned ? 1 : 0.3,
            transition: transition.slow,
            boxShadow: allOtherBadgesEarned
              ? '0 0 30px rgba(255,215,0,0.3), inset 0 0 20px rgba(255,215,0,0.15)'
              : 'none',
            marginBottom: '10px',
          }}>
            {allOtherBadgesEarned ? '🌌' : (
              <Lock size={28} color={currentTheme.textMuted} style={{ opacity: 0.5 }} />
            )}
          </div>
          <p style={{
            fontSize: fontSize['3xl'],
            fontWeight: fontWeight.bold,
            margin: `0 0 ${spacing['2xs']} 0`,
            color: allOtherBadgesEarned ? '#FFD700' : currentTheme.textMuted,
            letterSpacing: '0.5px',
          }}>
            The ArkiTek
          </p>
          <p style={{
            fontSize: '0.75rem',
            color: currentTheme.textMuted,
            margin: 0,
            fontStyle: 'italic',
          }}>
            {allOtherBadgesEarned ? 'You have mastered all disciplines.' : 'Earn all badges to become The ArkiTek'}
          </p>
        </div>

        <p style={{ color: currentTheme.textSecondary, fontSize: fontSize['2xl'], margin: `0 0 ${spacing['2xl']} 0` }}>
          Unlock badges by using ArkiTek. Collect them all to become The ArkiTek.
        </p>

        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: spacing.xl,
        }}>
          <div style={sx(s.gradientText, { fontSize: '3rem', fontWeight: fontWeight.bold })}>
            {totalEarned}
          </div>
          <div style={{ textAlign: 'left' }}>
            <p style={{ color: currentTheme.textSecondary, fontSize: fontSize.lg, margin: 0 }}>
              of {totalBadges} badges earned
            </p>
            <div style={{
              width: '200px',
              height: '8px',
              background: currentTheme.backgroundTertiary,
              borderRadius: radius.xs,
              marginTop: spacing.sm,
              overflow: 'hidden',
            }}>
              <div style={{
                width: `${(totalEarned / totalBadges) * 100}%`,
                height: '100%',
                background: allOtherBadgesEarned
                  ? 'linear-gradient(90deg, #FFD700, #FFA500, #FFD700)'
                  : currentTheme.accentGradient,
                borderRadius: radius.xs,
                transition: 'width 0.5s ease',
              }} />
            </div>
          </div>
        </div>

        {/* Scroll hint */}
        {showBadgeScrollHint && (
          <div style={{
            position: 'absolute',
            top: '14px',
            left: '20px',
            display: 'flex',
            alignItems: 'center',
            gap: spacing.sm,
            color: currentTheme.accent,
            fontSize: fontSize.md,
            fontWeight: fontWeight.medium,
            opacity: 0.8,
            animation: 'badgeScrollBounce 1.5s ease-in-out infinite',
          }}>
            <span>Scroll down for badges</span>
            <ChevronDown size={16} />
            <style>{`@keyframes badgeScrollBounce { 0%,100% { transform: translateY(0); } 50% { transform: translateY(4px); } }`}</style>
          </div>
        )}
      </div>

      {isFreePlan && (
        <div style={{
          textAlign: 'center',
          padding: spacing['3xl'],
          marginBottom: spacing['3xl'],
          background: 'linear-gradient(135deg, rgba(255, 170, 0, 0.08), rgba(255, 100, 0, 0.04))',
          border: '1px solid rgba(255, 170, 0, 0.25)',
          borderRadius: radius['2xl'],
        }}>
          <Lock size={32} color="#ffaa00" style={{ marginBottom: spacing.lg }} />
          <h3 style={{ fontSize: fontSize['4xl'], fontWeight: fontWeight.bold, color: '#ffaa00', margin: `0 0 ${spacing.md} 0` }}>
            Upgrade to Start Earning
          </h3>
          <p style={{ color: currentTheme.textSecondary, fontSize: fontSize.xl, margin: 0, lineHeight: 1.6, maxWidth: '500px', marginLeft: 'auto', marginRight: 'auto' }}>
            Free trial users can browse all badges below, but you need a Pro or Premium plan to earn badges and complete daily challenges.
          </p>
        </div>
      )}

      {/* Badge Categories */}
      <div ref={badgeCategoriesRef} style={{ display: 'flex', flexDirection: 'column', gap: spacing['3xl'] }}>
        {badgeProgress.map((category) => {
          const CategoryIcon = category.icon
          const isExpanded = expandedBadgeCategory === category.id

          return (
            <div
              key={category.id}
              style={{
                background: currentTheme.backgroundOverlay,
                border: `1px solid ${category.earnedCount > 0 ? currentTheme.borderActive : currentTheme.borderLight}`,
                borderRadius: radius['2xl'],
                overflow: 'hidden',
                transition: 'border-color 0.3s ease',
              }}
            >
              {/* Category Header */}
              <div
                onClick={() => setExpandedBadgeCategory(isExpanded ? null : category.id)}
                style={{
                  padding: `${spacing['2xl']} ${spacing['3xl']}`,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  transition: 'background 0.2s ease',
                }}
                onMouseEnter={(e) => { e.currentTarget.style.background = currentTheme.buttonBackgroundHover }}
                onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent' }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: spacing.xl }}>
                  {isExpanded ? <ChevronDown size={20} color={currentTheme.accent} /> : <ChevronRight size={20} color={currentTheme.accent} />}
                  <CategoryIcon size={24} color={currentTheme.accent} />
                  <div>
                    <h3 style={{
                      fontSize: '1.15rem',
                      color: currentTheme.accent,
                      margin: 0,
                      fontWeight: fontWeight.semibold,
                    }}>
                      {category.name}
                    </h3>
                    <p style={{ color: currentTheme.textMuted, fontSize: fontSize.md, margin: `${spacing['2xs']} 0 0 0` }}>
                      {category.description}
                    </p>
                  </div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: spacing.xl }}>
                  {/* Mini badge preview - show earned badges */}
                  <div style={{ display: 'flex', gap: spacing.xs }}>
                    {category.badges.slice(0, 5).map((badge, i) => (
                      <div
                        key={i}
                        style={{
                          width: '28px',
                          height: '28px',
                          borderRadius: radius.circle,
                          background: badge.earned
                            ? `radial-gradient(circle, ${badge.color}40, ${badge.color}15)`
                            : currentTheme.backgroundTertiary,
                          border: `2px solid ${badge.earned ? badge.color : currentTheme.borderLight}`,
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          fontSize: '0.75rem',
                          opacity: badge.earned ? 1 : 0.3,
                          transition: transition.slow,
                        }}
                      >
                        {badge.emoji}
                      </div>
                    ))}
                    {category.badges.length > 5 && (
                      <span style={{ color: currentTheme.textMuted, fontSize: '0.75rem', alignSelf: 'center', marginLeft: spacing.xs }}>
                        +{category.badges.length - 5}
                      </span>
                    )}
                  </div>
                  <span style={{
                    background: category.earnedCount > 0 ? currentTheme.accentGradient : 'none',
                    WebkitBackgroundClip: category.earnedCount > 0 ? 'text' : 'unset',
                    WebkitTextFillColor: category.earnedCount > 0 ? 'transparent' : 'unset',
                    color: category.earnedCount > 0 ? currentTheme.accent : currentTheme.textMuted,
                    fontSize: fontSize.lg,
                    fontWeight: fontWeight.semibold,
                    display: category.earnedCount > 0 ? 'inline-block' : 'inline',
                  }}>
                    {category.earnedCount}/{category.totalCount}
                  </span>
                </div>
              </div>

              {/* Expanded Badge Grid */}
              <AnimatePresence>
                {isExpanded && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: 'auto', opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={{ duration: 0.25 }}
                    style={{ overflow: 'hidden' }}
                  >
                    <div style={{
                      padding: '0 24px 24px 24px',
                      borderTop: `1px solid ${currentTheme.borderLight}`,
                      paddingTop: '20px',
                    }}>
                      {isFreePlan && (
                        <p style={{
                          color: '#ffaa00',
                          fontSize: fontSize.base,
                          fontWeight: fontWeight.medium,
                          textAlign: 'center',
                          margin: `0 0 ${spacing.lg} 0`,
                        }}>
                          (Upgrade to a paid plan to earn these badges)
                        </p>
                      )}
                      {/* Total stat display */}
                      <div style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        padding: `${spacing.lg} ${spacing.xl}`,
                        marginBottom: spacing.xl,
                        background: currentTheme.backgroundSecondary,
                        borderRadius: radius.lg,
                        border: `1px solid ${currentTheme.borderLight}`,
                      }}>
                        <span style={sx(s.gradientText, { fontSize: '1.4rem', fontWeight: fontWeight.bold, marginRight: spacing.md })}>
                          {formatBadgeNumber(category.currentValue)}
                        </span>
                        <span style={{ color: currentTheme.textSecondary, fontSize: fontSize.lg }}>
                          {category.unit || category.statKey} total
                        </span>
                      </div>

                      {/* Next badge progress bar */}
                      <div style={{
                        marginBottom: spacing['2xl'],
                      }}>
                        <div style={{
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          marginBottom: spacing.sm,
                        }}>
                          <span style={{ color: currentTheme.textMuted, fontSize: fontSize.md }}>
                            {category.nextBadge
                              ? `Next: ${category.nextBadge.name} (${category.nextBadge.desc})`
                              : 'All badges earned!'
                            }
                          </span>
                          <span style={{ color: currentTheme.textSecondary, fontSize: fontSize.md, fontWeight: fontWeight.semibold }}>
                            {category.nextBadge
                              ? `${formatBadgeNumber(category.currentValue)} / ${formatBadgeNumber(category.nextBadge.threshold)}`
                              : `${category.earnedCount}/${category.totalCount}`
                            }
                          </span>
                        </div>
                        <div style={{
                          width: '100%',
                          height: '8px',
                          background: currentTheme.backgroundTertiary,
                          borderRadius: radius.xs,
                          overflow: 'hidden',
                        }}>
                          <div style={{
                            width: `${category.nextBadge ? (category.nextBadgeProgress * 100) : 100}%`,
                            height: '100%',
                            background: category.nextBadge
                              ? `${category.nextBadge.color}CC`
                              : currentTheme.accentGradient,
                            borderRadius: radius.xs,
                            transition: 'width 0.5s ease',
                          }} />
                        </div>
                        <div style={{
                          display: 'flex',
                          justifyContent: 'flex-end',
                          marginTop: spacing.xs,
                        }}>
                          <span style={{ color: currentTheme.textSecondary, fontSize: '0.75rem' }}>
                            {category.nextBadge
                              ? `${Math.round(category.nextBadgeProgress * 100)}%`
                              : '100%'
                            }
                          </span>
                        </div>
                      </div>

                      {/* Badge Grid */}
                      <div style={{
                        display: 'grid',
                        gridTemplateColumns: `repeat(${category.badges.length <= 6 ? category.badges.length : Math.ceil(category.badges.length / 2)}, 1fr)`,
                        gap: spacing.xl,
                      }}>
                        {category.badges.map((badge, index) => {
                          const isHovered = hoveredBadge === `${category.id}-${index}`

                          return (
                            <div
                              key={index}
                              onMouseEnter={() => setHoveredBadge(`${category.id}-${index}`)}
                              onMouseLeave={() => setHoveredBadge(null)}
                              style={{
                                display: 'flex',
                                flexDirection: 'column',
                                alignItems: 'center',
                                padding: '20px 12px',
                                borderRadius: radius.xl,
                                background: badge.earned
                                  ? `radial-gradient(ellipse at center, ${badge.color}12, transparent 70%)`
                                  : currentTheme.backgroundSecondary,
                                border: `1px solid ${badge.earned ? `${badge.color}50` : currentTheme.borderLight}`,
                                transition: transition.slow,
                                transform: isHovered ? 'translateY(-4px)' : 'translateY(0)',
                                boxShadow: badge.earned && isHovered
                                  ? `0 8px 24px ${badge.color}30`
                                  : isHovered
                                    ? `0 4px 16px ${currentTheme.shadow}`
                                    : 'none',
                                position: 'relative',
                                cursor: 'default',
                              }}
                            >
                              {/* Badge Icon Circle */}
                              <div style={{
                                width: '56px',
                                height: '56px',
                                borderRadius: radius.circle,
                                background: badge.earned
                                  ? `radial-gradient(circle, ${badge.color}35, ${badge.color}10)`
                                  : currentTheme.backgroundTertiary,
                                border: `3px solid ${badge.earned ? badge.color : currentTheme.borderLight}`,
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                fontSize: fontSize['6xl'],
                                marginBottom: '10px',
                                opacity: badge.earned ? 1 : 0.35,
                                transition: transition.slow,
                                boxShadow: badge.earned
                                  ? `0 0 20px ${badge.color}25, inset 0 0 15px ${badge.color}10`
                                  : 'none',
                                position: 'relative',
                              }}>
                                {badge.earned ? badge.emoji : (
                                  <Lock size={18} color={currentTheme.textMuted} style={{ opacity: 0.5 }} />
                                )}
                              </div>

                              {/* Badge Name */}
                              <p style={{
                                fontSize: fontSize.md,
                                fontWeight: badge.earned ? '600' : '400',
                                color: badge.earned ? badge.color : currentTheme.textMuted,
                                margin: `0 0 ${spacing.xs} 0`,
                                textAlign: 'center',
                                lineHeight: '1.2',
                              }}>
                                {badge.name}
                              </p>

                              {/* Badge Requirement */}
                              <p style={{
                                fontSize: fontSize.xs,
                                color: currentTheme.textMuted,
                                margin: 0,
                                textAlign: 'center',
                              }}>
                                {badge.desc}
                              </p>

                              {/* Progress for unearned */}
                              {!badge.earned && (
                                <div style={{
                                  width: '100%',
                                  marginTop: spacing.md,
                                }}>
                                  <div style={{
                                    width: '100%',
                                    height: '4px',
                                    background: currentTheme.backgroundTertiary,
                                    borderRadius: '2px',
                                    overflow: 'hidden',
                                  }}>
                                    <div style={{
                                      width: `${badge.progress * 100}%`,
                                      height: '100%',
                                      background: `${badge.color}80`,
                                      borderRadius: '2px',
                                      transition: 'width 0.5s ease',
                                    }} />
                                  </div>
                                  <p style={{
                                    fontSize: '0.6rem',
                                    color: currentTheme.textMuted,
                                    margin: '3px 0 0 0',
                                    textAlign: 'center',
                                  }}>
                                    {formatBadgeNumber(Math.min(category.currentValue, badge.threshold))}/{formatBadgeNumber(badge.threshold)} ({Math.round(badge.progress * 100)}%)
                                  </p>
                                </div>
                              )}

                              {/* Earned checkmark */}
                              {badge.earned && (
                                <div style={{
                                  position: 'absolute',
                                  top: '8px',
                                  right: '8px',
                                  width: '20px',
                                  height: '20px',
                                  borderRadius: radius.circle,
                                  background: badge.color,
                                  display: 'flex',
                                  alignItems: 'center',
                                  justifyContent: 'center',
                                  fontSize: fontSize['2xs'],
                                  color: '#000',
                                  fontWeight: fontWeight.bold,
                                  boxShadow: `0 2px 8px ${badge.color}50`,
                                }}>
                                  ✓
                                </div>
                              )}
                            </div>
                          )
                        })}
                      </div>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          )
        })}
      </div>
      </div>
    </motion.div>
  )
}

export default BadgesTab
