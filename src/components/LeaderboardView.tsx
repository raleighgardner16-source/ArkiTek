import React, { useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import { Trophy, Zap, MessageSquare, Flame, User, ChevronRight, Crown } from 'lucide-react'
import { useStore } from '../store/useStore'
import { getTheme } from '../utils/theme'
import { spacing, fontSize, fontWeight, radius, transition, layout, sx, createStyles } from '../utils/styles'
import api from '../utils/api'

type LeaderboardType = 'tokens' | 'prompts' | 'streak'

interface RankingEntry {
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

const TABS: Array<{ id: LeaderboardType; label: string; icon: any; unit: string }> = [
  { id: 'tokens', label: 'Most Tokens', icon: Zap, unit: 'tokens' },
  { id: 'prompts', label: 'Most Prompts', icon: MessageSquare, unit: 'prompts' },
  { id: 'streak', label: 'Longest Streak', icon: Flame, unit: 'days' },
]

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

function formatValue(value: number, type: LeaderboardType): string {
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

  const [activeType, setActiveType] = useState<LeaderboardType>('tokens')
  const [rankings, setRankings] = useState<RankingEntry[]>([])
  const [myRank, setMyRank] = useState<number | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [providerRankings, setProviderRankings] = useState<ProviderRanking[]>([])
  const [providerTotalVotes, setProviderTotalVotes] = useState(0)
  const [providerWeekStart, setProviderWeekStart] = useState<string | null>(null)

  useEffect(() => {
    fetchRankings()
  }, [activeType])

  useEffect(() => {
    fetchProviderRankings()
  }, [])

  const fetchRankings = async () => {
    try {
      setLoading(true)
      setError(null)
      const res = await api.get(`/leaderboard/rankings?type=${activeType}`)
      setRankings(res.data.rankings || [])
      setMyRank(res.data.myRank ?? null)
    } catch (err: any) {
      console.error('[Leaderboard] Error:', err)
      setError('Failed to load leaderboard')
      setRankings([])
    } finally {
      setLoading(false)
    }
  }

  const fetchProviderRankings = async () => {
    try {
      const res = await api.get('/leaderboard/provider-rankings')
      setProviderRankings(res.data.rankings || [])
      setProviderTotalVotes(res.data.totalVotes || 0)
      setProviderWeekStart(res.data.weekStart || null)
    } catch (err: any) {
      console.error('[Leaderboard] Provider rankings error:', err)
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
  const activeTabMeta = TABS.find((t) => t.id === activeType)!

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

        {/* Weekly Provider Rankings */}
        {providerRankings.length > 0 && (
          <div style={{ marginBottom: spacing['4xl'] }}>
            <div style={sx(layout.flexRow, {
              gap: spacing.md,
              marginBottom: spacing.xl,
              alignItems: 'center',
            })}>
              <Crown size={20} color={currentTheme.accent} />
              <h2 style={{
                color: currentTheme.text,
                fontSize: fontSize['4xl'],
                fontWeight: fontWeight.bold,
                margin: 0,
              }}>
                Provider of the Week
              </h2>
            </div>
            <p style={{
              color: currentTheme.textSecondary,
              fontSize: fontSize.lg,
              margin: `0 0 ${spacing.xl} 0`,
            }}>
              Ranked by community votes this week
              {providerTotalVotes > 0 && (
                <span style={{ color: currentTheme.textMuted }}>
                  {' '}&middot; {providerTotalVotes} {providerTotalVotes === 1 ? 'vote' : 'votes'} cast
                </span>
              )}
            </p>

            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
              gap: spacing.lg,
            }}>
              {providerRankings.map((p) => {
                const providerColor = PROVIDER_COLORS[p.provider] || currentTheme.accent
                const medalColor = MEDAL_COLORS[p.rank]
                const isFirst = p.rank === 1
                const pct = providerTotalVotes > 0 ? Math.round((p.wins / providerTotalVotes) * 100) : 0

                return (
                  <motion.div
                    key={p.provider}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: p.rank * 0.08 }}
                    style={{
                      position: 'relative',
                      padding: isFirst ? spacing['2xl'] : spacing.xl,
                      background: currentTheme.backgroundOverlay,
                      border: `1px solid ${isFirst ? `${providerColor}40` : currentTheme.borderLight}`,
                      borderRadius: radius.xl,
                      textAlign: 'center',
                      overflow: 'hidden',
                    }}
                  >
                    {isFirst && (
                      <div style={{
                        position: 'absolute',
                        top: 0,
                        left: 0,
                        right: 0,
                        height: '3px',
                        background: `linear-gradient(90deg, ${providerColor}, ${providerColor}80)`,
                      }} />
                    )}

                    {/* Rank badge */}
                    <div style={{
                      display: 'flex',
                      justifyContent: 'center',
                      marginBottom: spacing.lg,
                    }}>
                      <div style={{
                        width: isFirst ? '40px' : '32px',
                        height: isFirst ? '40px' : '32px',
                        borderRadius: radius.circle,
                        background: medalColor ? `${medalColor}20` : `${currentTheme.textMuted}15`,
                        border: `2px solid ${medalColor || currentTheme.textMuted}`,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                      }}>
                        <span style={{
                          color: medalColor || currentTheme.textMuted,
                          fontSize: isFirst ? fontSize['3xl'] : fontSize['2xl'],
                          fontWeight: fontWeight.bold,
                        }}>
                          {p.rank}
                        </span>
                      </div>
                    </div>

                    {/* Provider name */}
                    <div style={{
                      color: providerColor,
                      fontSize: isFirst ? fontSize['4xl'] : fontSize['2xl'],
                      fontWeight: fontWeight.bold,
                      marginBottom: spacing.sm,
                    }}>
                      {p.name}
                    </div>

                    {/* Votes & percentage */}
                    <div style={{
                      color: currentTheme.textSecondary,
                      fontSize: fontSize.lg,
                      marginBottom: spacing.lg,
                    }}>
                      {p.wins} {p.wins === 1 ? 'vote' : 'votes'}
                    </div>

                    {/* Progress bar */}
                    <div style={{
                      height: '6px',
                      borderRadius: '3px',
                      background: `${currentTheme.textMuted}20`,
                      overflow: 'hidden',
                    }}>
                      <motion.div
                        initial={{ width: 0 }}
                        animate={{ width: `${pct}%` }}
                        transition={{ duration: 0.6, delay: p.rank * 0.1 }}
                        style={{
                          height: '100%',
                          borderRadius: '3px',
                          background: providerColor,
                        }}
                      />
                    </div>
                    <div style={{
                      color: currentTheme.textMuted,
                      fontSize: fontSize.base,
                      marginTop: spacing.xs,
                    }}>
                      {pct}%
                    </div>
                  </motion.div>
                )
              })}
            </div>
          </div>
        )}

        {/* User Rankings Section Header */}
        <div style={sx(layout.flexRow, {
          gap: spacing.md,
          marginBottom: spacing.xl,
          alignItems: 'center',
        })}>
          <Trophy size={20} color={currentTheme.accent} />
          <h2 style={{
            color: currentTheme.text,
            fontSize: fontSize['4xl'],
            fontWeight: fontWeight.bold,
            margin: 0,
          }}>
            User Rankings
          </h2>
        </div>

        {/* Tabs */}
        <div
          style={{
            display: 'flex',
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
                  flex: 1,
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

        {/* My Rank Banner */}
        {myRank !== null && !loading && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: `${spacing.xl} ${spacing['2xl']}`,
              marginBottom: spacing['2xl'],
              background: theme === 'light'
                ? 'rgba(0, 136, 204, 0.08)'
                : 'rgba(93, 173, 226, 0.08)',
              border: `1px solid ${theme === 'light' ? 'rgba(0, 136, 204, 0.25)' : 'rgba(93, 173, 226, 0.25)'}`,
              borderRadius: radius.xl,
            }}
          >
            <span style={{ color: currentTheme.textSecondary, fontSize: fontSize['2xl'] }}>
              Your rank
            </span>
            <span style={{
              color: currentTheme.accent,
              fontSize: fontSize['4xl'],
              fontWeight: fontWeight.bold,
            }}>
              #{myRank}
              <span style={{ color: currentTheme.textSecondary, fontSize: fontSize.lg, fontWeight: fontWeight.normal, marginLeft: spacing.sm }}>
                of {rankings.length}
              </span>
            </span>
          </motion.div>
        )}

        {/* Rankings List */}
        {loading ? (
          <div style={{ textAlign: 'center', padding: spacing['5xl'] }}>
            <p style={{ color: currentTheme.textSecondary, fontSize: fontSize['3xl'] }}>
              Loading leaderboard...
            </p>
          </div>
        ) : error ? (
          <div style={{
            textAlign: 'center',
            padding: spacing['5xl'],
            color: currentTheme.error,
            fontSize: fontSize['2xl'],
          }}>
            {error}
          </div>
        ) : rankings.length === 0 ? (
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
              Enable "Show on Leaderboard" in Settings to join!
            </p>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: spacing.md }}>
            {rankings.map((entry) => {
              const isMe = entry.userId === currentUser?.id
              const medalColor = MEDAL_COLORS[entry.rank]
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
                    border: `1px solid ${
                      isMe
                        ? (theme === 'light' ? 'rgba(0, 136, 204, 0.3)' : 'rgba(93, 173, 226, 0.3)')
                        : currentTheme.borderLight
                    }`,
                    borderRadius: radius.lg,
                    cursor: 'pointer',
                    transition: 'border-color 0.2s, background 0.2s',
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.borderColor = `${currentTheme.accent}55`
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.borderColor = isMe
                      ? (theme === 'light' ? 'rgba(0, 136, 204, 0.3)' : 'rgba(93, 173, 226, 0.3)')
                      : currentTheme.borderLight
                  }}
                >
                  {/* Rank */}
                  <div style={{
                    width: '44px',
                    textAlign: 'center',
                    flexShrink: 0,
                  }}>
                    {isTop3 ? (
                      <div style={{
                        width: '36px',
                        height: '36px',
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
                          {entry.rank}
                        </span>
                      </div>
                    ) : (
                      <span style={{
                        color: currentTheme.textMuted,
                        fontSize: fontSize['2xl'],
                        fontWeight: fontWeight.medium,
                      }}>
                        {entry.rank}
                      </span>
                    )}
                  </div>

                  {/* Avatar */}
                  <div style={sx(layout.center, {
                    width: isTop3 ? '44px' : '36px',
                    height: isTop3 ? '44px' : '36px',
                    borderRadius: radius.circle,
                    background: entry.profileImage ? 'none' : currentTheme.accentGradient,
                    overflow: 'hidden',
                    flexShrink: 0,
                  })}>
                    {entry.profileImage ? (
                      <img
                        src={entry.profileImage}
                        alt=""
                        style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                      />
                    ) : (
                      <User size={isTop3 ? 20 : 16} color="#fff" />
                    )}
                  </div>

                  {/* Username */}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: spacing.sm,
                    }}>
                      <span style={{
                        color: isMe ? currentTheme.accent : currentTheme.text,
                        fontSize: isTop3 ? fontSize['3xl'] : fontSize['2xl'],
                        fontWeight: isTop3 ? fontWeight.semibold : fontWeight.medium,
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                      }}>
                        {entry.username}
                      </span>
                      {isMe && (
                        <span style={{
                          fontSize: fontSize.base,
                          color: currentTheme.accent,
                          fontWeight: fontWeight.medium,
                          padding: `${spacing['2xs']} ${spacing.md}`,
                          background: theme === 'light' ? 'rgba(0, 136, 204, 0.1)' : 'rgba(93, 173, 226, 0.1)',
                          borderRadius: radius.lg,
                          flexShrink: 0,
                        }}>
                          You
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Value */}
                  <div style={{
                    textAlign: 'right',
                    flexShrink: 0,
                  }}>
                    <span style={{
                      color: isTop3 ? currentTheme.accent : currentTheme.text,
                      fontSize: isTop3 ? fontSize['3xl'] : fontSize['2xl'],
                      fontWeight: fontWeight.semibold,
                    }}>
                      {formatValue(entry.value, activeType)}
                    </span>
                    <span style={{
                      color: currentTheme.textMuted,
                      fontSize: fontSize.base,
                      marginLeft: spacing.xs,
                    }}>
                      {activeTabMeta.unit}
                    </span>
                  </div>

                  {/* Arrow */}
                  <ChevronRight size={16} color={currentTheme.textMuted} style={{ flexShrink: 0, opacity: 0.5 }} />
                </motion.div>
              )
            })}

            {/* End of list indicator */}
            <div style={{
              textAlign: 'center',
              padding: `${spacing['3xl']} 0`,
              color: currentTheme.textMuted,
              fontSize: fontSize.lg,
            }}>
              End of leaderboard &middot; {rankings.length} {rankings.length === 1 ? 'user' : 'users'}
            </div>
          </div>
        )}
      </div>
    </motion.div>
  )
}

export default LeaderboardView
