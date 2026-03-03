import React, { useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import { Trophy, Zap, MessageSquare, Flame, User, ChevronRight, Crown, Cpu } from 'lucide-react'
import { useStore } from '../store/useStore'
import { getTheme } from '../utils/theme'
import { spacing, fontSize, fontWeight, radius, transition, layout, sx, createStyles } from '../utils/styles'
import api from '../utils/api'

type TabType = 'tokens' | 'prompts' | 'streak' | 'providers' | 'models'

interface UserRankingEntry {
  rank: number
  userId: string
  username: string
  profileImage: string | null
  value: number
}

interface ProviderRanking {
  rank: number
  provider: string
  name: string
  wins: number
}

interface ModelRanking {
  rank: number
  model: string
  provider: string
  providerName: string
  wins: number
}

const TABS: Array<{ id: TabType; label: string; icon: any }> = [
  { id: 'tokens', label: 'Most Tokens', icon: Zap },
  { id: 'prompts', label: 'Most Prompts', icon: MessageSquare },
  { id: 'streak', label: 'Longest Streak', icon: Flame },
  { id: 'providers', label: 'Provider of the Week', icon: Crown },
  { id: 'models', label: 'Model of the Week', icon: Cpu },
]

const USER_TAB_UNITS: Record<string, string> = {
  tokens: 'tokens',
  prompts: 'prompts',
  streak: 'days',
}

const MEDAL_COLORS: Record<number, string> = {
  1: '#FFD700',
  2: '#C0C0C0',
  3: '#CD7F32',
}

const PROVIDER_COLORS: Record<string, string> = {
  openai: '#10a37f',
  anthropic: '#d4a574',
  google: '#4285f4',
  meta: '#0668E1',
  deepseek: '#5b6abf',
  mistral: '#ff7000',
  xai: '#1DA1F2',
}

function formatValue(value: number, type: TabType): string {
  if (type === 'tokens') {
    if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`
    if (value >= 1_000) return `${(value / 1_000).toFixed(1)}K`
    return value.toLocaleString()
  }
  return value.toLocaleString()
}

const LeaderboardView = () => {
  const currentUser = useStore((state: any) => state.currentUser)
  const setViewingProfile = useStore((state: any) => state.setViewingProfile)
  const clearViewingProfile = useStore((state: any) => state.clearViewingProfile)
  const setActiveTab = useStore((state: any) => state.setActiveTab)
  const theme = useStore((state: any) => state.theme || 'dark')
  const isNavExpanded = useStore((state: any) => state.isNavExpanded)
  const currentTheme = getTheme(theme)
  const s = createStyles(currentTheme)

  const [activeType, setActiveType] = useState<TabType>('tokens')
  const [userRankings, setUserRankings] = useState<UserRankingEntry[]>([])
  const [myRank, setMyRank] = useState<number | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [providerRankings, setProviderRankings] = useState<ProviderRanking[]>([])
  const [modelRankings, setModelRankings] = useState<ModelRanking[]>([])
  const [totalVotes, setTotalVotes] = useState(0)
  const [loadingVotes, setLoadingVotes] = useState(true)

  const isUserTab = activeType === 'tokens' || activeType === 'prompts' || activeType === 'streak'

  useEffect(() => {
    if (isUserTab) {
      fetchUserRankings()
    }
  }, [activeType])

  useEffect(() => {
    fetchProviderModelRankings()
  }, [])

  const fetchUserRankings = async () => {
    try {
      setLoading(true)
      setError(null)
      const res = await api.get(`/leaderboard/rankings?type=${activeType}`)
      setUserRankings(res.data.rankings || [])
      setMyRank(res.data.myRank ?? null)
    } catch (err: any) {
      console.error('[Leaderboard] Error:', err)
      setError('Failed to load leaderboard')
      setUserRankings([])
    } finally {
      setLoading(false)
    }
  }

  const fetchProviderModelRankings = async () => {
    try {
      setLoadingVotes(true)
      const res = await api.get('/leaderboard/provider-rankings')
      setProviderRankings(res.data.providerRankings || [])
      setModelRankings(res.data.modelRankings || [])
      setTotalVotes(res.data.totalVotes || 0)
    } catch (err: any) {
      console.error('[Leaderboard] Provider rankings error:', err)
    } finally {
      setLoadingVotes(false)
    }
  }

  const handleUserClick = (userId: string, username: string) => {
    if (userId === currentUser?.id) {
      clearViewingProfile()
    } else {
      setViewingProfile({ userId, username })
    }
    setActiveTab('statistics')
  }

  const navWidth = isNavExpanded ? '240px' : '60px'

  const renderRankBadge = (rank: number, large: boolean) => {
    const medalColor = MEDAL_COLORS[rank]
    const isTop3 = rank <= 3

    if (isTop3) {
      return (
        <div style={{
          width: large ? '36px' : '36px',
          height: large ? '36px' : '36px',
          borderRadius: radius.circle,
          background: `${medalColor}20`,
          border: `2px solid ${medalColor}`,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          margin: '0 auto',
        }}>
          <span style={{
            color: medalColor,
            fontSize: fontSize['3xl'],
            fontWeight: fontWeight.bold,
          }}>
            {rank}
          </span>
        </div>
      )
    }

    return (
      <span style={{
        color: currentTheme.textMuted,
        fontSize: fontSize['2xl'],
        fontWeight: fontWeight.medium,
      }}>
        {rank}
      </span>
    )
  }

  const renderUserRankings = () => {
    if (loading) {
      return (
        <div style={{ textAlign: 'center', padding: spacing['5xl'] }}>
          <p style={{ color: currentTheme.textSecondary, fontSize: fontSize['3xl'] }}>
            Loading leaderboard...
          </p>
        </div>
      )
    }

    if (error) {
      return (
        <div style={{ textAlign: 'center', padding: spacing['5xl'], color: currentTheme.error, fontSize: fontSize['2xl'] }}>
          {error}
        </div>
      )
    }

    if (userRankings.length === 0) {
      return (
        <div style={{
          textAlign: 'center',
          padding: `60px ${spacing['2xl']}`,
          background: currentTheme.backgroundOverlay,
          border: `1px solid ${currentTheme.borderLight}`,
          borderRadius: radius.xl,
        }}>
          <Trophy size={40} color={currentTheme.textMuted} style={{ opacity: 0.4, marginBottom: spacing.lg }} />
          <p style={{ color: currentTheme.textMuted, fontSize: fontSize['2xl'], margin: 0, lineHeight: '1.6' }}>
            No users on the leaderboard yet.<br />
            Enable "Show on Leaderboard" in your profile to join!
          </p>
        </div>
      )
    }

    const unit = USER_TAB_UNITS[activeType] || ''

    return (
      <>
        {myRank !== null && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: `${spacing.xl} ${spacing['2xl']}`,
              marginBottom: spacing['2xl'],
              background: theme === 'light' ? 'rgba(0, 136, 204, 0.08)' : 'rgba(93, 173, 226, 0.08)',
              border: `1px solid ${theme === 'light' ? 'rgba(0, 136, 204, 0.25)' : 'rgba(93, 173, 226, 0.25)'}`,
              borderRadius: radius.xl,
            }}
          >
            <span style={{ color: currentTheme.textSecondary, fontSize: fontSize['2xl'] }}>Your rank</span>
            <span style={{ color: currentTheme.accent, fontSize: fontSize['4xl'], fontWeight: fontWeight.bold }}>
              #{myRank}
              <span style={{ color: currentTheme.textSecondary, fontSize: fontSize.lg, fontWeight: fontWeight.normal, marginLeft: spacing.sm }}>
                of {userRankings.length}
              </span>
            </span>
          </motion.div>
        )}

        <div style={{ display: 'flex', flexDirection: 'column', gap: spacing.md }}>
          {userRankings.map((entry) => {
            const isMe = entry.userId === currentUser?.id
            const isTop3 = entry.rank <= 3

            return (
              <motion.div
                key={entry.userId}
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: Math.min(entry.rank * 0.02, 0.5) }}
                onClick={() => handleUserClick(entry.userId, entry.username)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: spacing.xl,
                  padding: `${isTop3 ? spacing.xl : '10px'} ${spacing['2xl']}`,
                  background: isMe
                    ? (theme === 'light' ? 'rgba(0, 136, 204, 0.06)' : 'rgba(93, 173, 226, 0.06)')
                    : currentTheme.backgroundOverlay,
                  border: `1px solid ${isMe
                    ? (theme === 'light' ? 'rgba(0, 136, 204, 0.3)' : 'rgba(93, 173, 226, 0.3)')
                    : currentTheme.borderLight
                  }`,
                  borderRadius: radius.lg,
                  cursor: 'pointer',
                  transition: 'border-color 0.2s, background 0.2s',
                }}
                onMouseEnter={(e) => { e.currentTarget.style.borderColor = `${currentTheme.accent}55` }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.borderColor = isMe
                    ? (theme === 'light' ? 'rgba(0, 136, 204, 0.3)' : 'rgba(93, 173, 226, 0.3)')
                    : currentTheme.borderLight
                }}
              >
                <div style={{ width: '44px', textAlign: 'center', flexShrink: 0 }}>
                  {renderRankBadge(entry.rank, true)}
                </div>
                <div style={sx(layout.center, {
                  width: isTop3 ? '44px' : '36px', height: isTop3 ? '44px' : '36px',
                  borderRadius: radius.circle, background: entry.profileImage ? 'none' : currentTheme.accentGradient,
                  overflow: 'hidden', flexShrink: 0,
                })}>
                  {entry.profileImage ? (
                    <img src={entry.profileImage} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                  ) : (
                    <User size={isTop3 ? 20 : 16} color="#fff" />
                  )}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: spacing.sm }}>
                    <span style={{
                      color: isMe ? currentTheme.accent : currentTheme.text,
                      fontSize: isTop3 ? fontSize['3xl'] : fontSize['2xl'],
                      fontWeight: isTop3 ? fontWeight.semibold : fontWeight.medium,
                      overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                    }}>
                      {entry.username}
                    </span>
                    {isMe && (
                      <span style={{
                        fontSize: fontSize.base, color: currentTheme.accent, fontWeight: fontWeight.medium,
                        padding: `${spacing['2xs']} ${spacing.md}`,
                        background: theme === 'light' ? 'rgba(0, 136, 204, 0.1)' : 'rgba(93, 173, 226, 0.1)',
                        borderRadius: radius.lg, flexShrink: 0,
                      }}>
                        You
                      </span>
                    )}
                  </div>
                </div>
                <div style={{ textAlign: 'right', flexShrink: 0 }}>
                  <span style={{
                    color: isTop3 ? currentTheme.accent : currentTheme.text,
                    fontSize: isTop3 ? fontSize['3xl'] : fontSize['2xl'],
                    fontWeight: fontWeight.semibold,
                  }}>
                    {formatValue(entry.value, activeType)}
                  </span>
                  <span style={{ color: currentTheme.textMuted, fontSize: fontSize.base, marginLeft: spacing.xs }}>
                    {unit}
                  </span>
                </div>
                <ChevronRight size={16} color={currentTheme.textMuted} style={{ flexShrink: 0, opacity: 0.5 }} />
              </motion.div>
            )
          })}

          <div style={{ textAlign: 'center', padding: `${spacing['3xl']} 0`, color: currentTheme.textMuted, fontSize: fontSize.lg }}>
            End of leaderboard &middot; {userRankings.length} {userRankings.length === 1 ? 'user' : 'users'}
          </div>
        </div>
      </>
    )
  }

  const renderProviderRankings = () => {
    if (loadingVotes) {
      return (
        <div style={{ textAlign: 'center', padding: spacing['5xl'] }}>
          <p style={{ color: currentTheme.textSecondary, fontSize: fontSize['3xl'] }}>Loading rankings...</p>
        </div>
      )
    }

    if (providerRankings.length === 0) {
      return (
        <div style={{
          textAlign: 'center', padding: `60px ${spacing['2xl']}`,
          background: currentTheme.backgroundOverlay, border: `1px solid ${currentTheme.borderLight}`,
          borderRadius: radius.xl,
        }}>
          <Crown size={40} color={currentTheme.textMuted} style={{ opacity: 0.4, marginBottom: spacing.lg }} />
          <p style={{ color: currentTheme.textMuted, fontSize: fontSize['2xl'], margin: 0, lineHeight: '1.6' }}>
            No votes cast this week yet.<br />
            Pick your favorite response after submitting a prompt to vote!
          </p>
        </div>
      )
    }

    return (
      <>
        {totalVotes > 0 && (
          <div style={{
            padding: `${spacing.lg} ${spacing['2xl']}`,
            marginBottom: spacing['2xl'],
            background: theme === 'light' ? 'rgba(0, 136, 204, 0.05)' : 'rgba(93, 173, 226, 0.05)',
            border: `1px solid ${currentTheme.borderLight}`,
            borderRadius: radius.xl,
            color: currentTheme.textSecondary,
            fontSize: fontSize.lg,
            textAlign: 'center',
          }}>
            {totalVotes} {totalVotes === 1 ? 'vote' : 'votes'} cast this week &middot; Resets every Monday
          </div>
        )}

        <div style={{ display: 'flex', flexDirection: 'column', gap: spacing.md }}>
          {providerRankings.map((entry) => {
            const providerColor = PROVIDER_COLORS[entry.provider] || currentTheme.accent
            const isTop3 = entry.rank <= 3
            const pct = totalVotes > 0 ? Math.round((entry.wins / totalVotes) * 100) : 0

            return (
              <motion.div
                key={entry.provider}
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: entry.rank * 0.06 }}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: spacing.xl,
                  padding: `${isTop3 ? spacing.xl : '10px'} ${spacing['2xl']}`,
                  background: currentTheme.backgroundOverlay,
                  border: `1px solid ${isTop3 ? `${providerColor}30` : currentTheme.borderLight}`,
                  borderRadius: radius.lg,
                  position: 'relative',
                  overflow: 'hidden',
                }}
              >
                {entry.rank === 1 && (
                  <div style={{
                    position: 'absolute', top: 0, left: 0, right: 0, height: '3px',
                    background: `linear-gradient(90deg, ${providerColor}, ${providerColor}60)`,
                  }} />
                )}

                <div style={{ width: '44px', textAlign: 'center', flexShrink: 0 }}>
                  {renderRankBadge(entry.rank, true)}
                </div>

                {/* Provider color dot */}
                <div style={{
                  width: isTop3 ? '44px' : '36px', height: isTop3 ? '44px' : '36px',
                  borderRadius: radius.circle, flexShrink: 0,
                  background: `${providerColor}18`, border: `2px solid ${providerColor}40`,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>
                  <div style={{
                    width: isTop3 ? '16px' : '12px', height: isTop3 ? '16px' : '12px',
                    borderRadius: radius.circle, background: providerColor,
                  }} />
                </div>

                <div style={{ flex: 1, minWidth: 0 }}>
                  <span style={{
                    color: providerColor,
                    fontSize: isTop3 ? fontSize['3xl'] : fontSize['2xl'],
                    fontWeight: isTop3 ? fontWeight.bold : fontWeight.semibold,
                    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                  }}>
                    {entry.name}
                  </span>
                </div>

                <div style={{ textAlign: 'right', flexShrink: 0 }}>
                  <span style={{
                    color: isTop3 ? providerColor : currentTheme.text,
                    fontSize: isTop3 ? fontSize['3xl'] : fontSize['2xl'],
                    fontWeight: fontWeight.semibold,
                  }}>
                    {entry.wins}
                  </span>
                  <span style={{ color: currentTheme.textMuted, fontSize: fontSize.base, marginLeft: spacing.xs }}>
                    {entry.wins === 1 ? 'vote' : 'votes'}
                  </span>
                  <span style={{
                    color: currentTheme.textMuted, fontSize: fontSize.base,
                    marginLeft: spacing.md,
                  }}>
                    ({pct}%)
                  </span>
                </div>
              </motion.div>
            )
          })}

          <div style={{ textAlign: 'center', padding: `${spacing['3xl']} 0`, color: currentTheme.textMuted, fontSize: fontSize.lg }}>
            End of rankings &middot; {providerRankings.length} {providerRankings.length === 1 ? 'provider' : 'providers'}
          </div>
        </div>
      </>
    )
  }

  const renderModelRankings = () => {
    if (loadingVotes) {
      return (
        <div style={{ textAlign: 'center', padding: spacing['5xl'] }}>
          <p style={{ color: currentTheme.textSecondary, fontSize: fontSize['3xl'] }}>Loading rankings...</p>
        </div>
      )
    }

    if (modelRankings.length === 0) {
      return (
        <div style={{
          textAlign: 'center', padding: `60px ${spacing['2xl']}`,
          background: currentTheme.backgroundOverlay, border: `1px solid ${currentTheme.borderLight}`,
          borderRadius: radius.xl,
        }}>
          <Cpu size={40} color={currentTheme.textMuted} style={{ opacity: 0.4, marginBottom: spacing.lg }} />
          <p style={{ color: currentTheme.textMuted, fontSize: fontSize['2xl'], margin: 0, lineHeight: '1.6' }}>
            No votes cast this week yet.<br />
            Pick your favorite response after submitting a prompt to vote!
          </p>
        </div>
      )
    }

    return (
      <>
        {totalVotes > 0 && (
          <div style={{
            padding: `${spacing.lg} ${spacing['2xl']}`,
            marginBottom: spacing['2xl'],
            background: theme === 'light' ? 'rgba(0, 136, 204, 0.05)' : 'rgba(93, 173, 226, 0.05)',
            border: `1px solid ${currentTheme.borderLight}`,
            borderRadius: radius.xl,
            color: currentTheme.textSecondary,
            fontSize: fontSize.lg,
            textAlign: 'center',
          }}>
            {totalVotes} {totalVotes === 1 ? 'vote' : 'votes'} cast this week &middot; Resets every Monday
          </div>
        )}

        <div style={{ display: 'flex', flexDirection: 'column', gap: spacing.md }}>
          {modelRankings.map((entry) => {
            const providerColor = PROVIDER_COLORS[entry.provider] || currentTheme.accent
            const isTop3 = entry.rank <= 3
            const pct = totalVotes > 0 ? Math.round((entry.wins / totalVotes) * 100) : 0

            return (
              <motion.div
                key={entry.model}
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: entry.rank * 0.06 }}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: spacing.xl,
                  padding: `${isTop3 ? spacing.xl : '10px'} ${spacing['2xl']}`,
                  background: currentTheme.backgroundOverlay,
                  border: `1px solid ${isTop3 ? `${providerColor}30` : currentTheme.borderLight}`,
                  borderRadius: radius.lg,
                  position: 'relative',
                  overflow: 'hidden',
                }}
              >
                {entry.rank === 1 && (
                  <div style={{
                    position: 'absolute', top: 0, left: 0, right: 0, height: '3px',
                    background: `linear-gradient(90deg, ${providerColor}, ${providerColor}60)`,
                  }} />
                )}

                <div style={{ width: '44px', textAlign: 'center', flexShrink: 0 }}>
                  {renderRankBadge(entry.rank, true)}
                </div>

                <div style={{
                  width: isTop3 ? '44px' : '36px', height: isTop3 ? '44px' : '36px',
                  borderRadius: radius.circle, flexShrink: 0,
                  background: `${providerColor}18`, border: `2px solid ${providerColor}40`,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>
                  <Cpu size={isTop3 ? 18 : 14} color={providerColor} />
                </div>

                <div style={{ flex: 1, minWidth: 0 }}>
                  <span style={{
                    color: currentTheme.text,
                    fontSize: isTop3 ? fontSize['3xl'] : fontSize['2xl'],
                    fontWeight: isTop3 ? fontWeight.bold : fontWeight.semibold,
                    display: 'block',
                    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                  }}>
                    {entry.model}
                  </span>
                  <span style={{
                    color: providerColor,
                    fontSize: fontSize.base,
                    fontWeight: fontWeight.medium,
                  }}>
                    {entry.providerName}
                  </span>
                </div>

                <div style={{ textAlign: 'right', flexShrink: 0 }}>
                  <span style={{
                    color: isTop3 ? providerColor : currentTheme.text,
                    fontSize: isTop3 ? fontSize['3xl'] : fontSize['2xl'],
                    fontWeight: fontWeight.semibold,
                  }}>
                    {entry.wins}
                  </span>
                  <span style={{ color: currentTheme.textMuted, fontSize: fontSize.base, marginLeft: spacing.xs }}>
                    {entry.wins === 1 ? 'vote' : 'votes'}
                  </span>
                  <span style={{
                    color: currentTheme.textMuted, fontSize: fontSize.base,
                    marginLeft: spacing.md,
                  }}>
                    ({pct}%)
                  </span>
                </div>
              </motion.div>
            )
          })}

          <div style={{ textAlign: 'center', padding: `${spacing['3xl']} 0`, color: currentTheme.textMuted, fontSize: fontSize.lg }}>
            End of rankings &middot; {modelRankings.length} {modelRankings.length === 1 ? 'model' : 'models'}
          </div>
        </div>
      </>
    )
  }

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
      <div style={{ width: '100%', maxWidth: '800px', margin: '0 auto' }}>
        {/* Header */}
        <div style={{ marginBottom: spacing['4xl'] }}>
          <div style={sx(layout.flexRow, { gap: spacing.lg, marginBottom: spacing.lg, alignItems: 'center' })}>
            <Trophy size={28} color={currentTheme.accent} />
            <h1 style={sx(s.pageTitle, { margin: 0 })}>Leaderboard</h1>
          </div>
          <p style={sx(s.subtitle, { margin: 0 })}>
            See how you stack up against other ArkiTek users.
          </p>
        </div>

        {/* Tabs */}
        <div
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            marginBottom: spacing['3xl'],
            borderBottom: `1px solid ${currentTheme.borderLight}`,
          }}
        >
          {TABS.map((tab) => {
            const Icon = tab.icon
            const isActive = activeType === tab.id
            return (
              <button
                key={tab.id}
                onClick={() => setActiveType(tab.id)}
                style={sx(layout.center, {
                  flex: '1 1 auto',
                  minWidth: '120px',
                  padding: `14px ${spacing.lg}`,
                  background: isActive ? currentTheme.buttonBackgroundActive : 'transparent',
                  border: 'none',
                  borderBottom: isActive
                    ? `2px solid ${currentTheme.accent}`
                    : '2px solid transparent',
                  color: isActive ? currentTheme.accent : currentTheme.textSecondary,
                  fontSize: fontSize['2xl'],
                  fontWeight: isActive ? fontWeight.semibold : fontWeight.normal,
                  cursor: 'pointer',
                  transition: transition.normal,
                  gap: spacing.md,
                })}
              >
                <Icon size={20} />
                {tab.label}
              </button>
            )
          })}
        </div>

        {/* Tab Content */}
        {isUserTab && renderUserRankings()}
        {activeType === 'providers' && renderProviderRankings()}
        {activeType === 'models' && renderModelRankings()}
      </div>
    </motion.div>
  )
}

export default LeaderboardView
