import React, { useEffect, useState, useRef } from 'react'
import { AnimatePresence } from 'framer-motion'
import { Database, Trophy, Award, Zap, MessageSquare, Flame } from 'lucide-react'
import { useStore } from '../store/useStore'
import { getTheme } from '../utils/theme'
import { spacing, fontSize, fontWeight, radius, transition, layout, sx, createStyles } from '../utils/styles'
import api from '../utils/api'
import BuyUsageModal from './BuyUsageModal'
import { LLM_PROVIDERS } from '../services/llmProviders'
import ProfileHeader from './statistics/ProfileHeader'
import TokenUsageTab from './statistics/TokenUsageTab'
import RatingsTab from './statistics/RatingsTab'
import BadgesTab from './statistics/BadgesTab'
import EditProfileModal from './statistics/EditProfileModal'

const StatisticsView = () => {
  const currentUser = useStore((state: any) => state.currentUser)
  const isFreePlan = currentUser?.plan === 'free_trial' && !currentUser?.stripeSubscriptionId
  const theme = useStore((state: any) => state.theme || 'dark')
  const currentTheme = getTheme(theme)
  const s = createStyles(currentTheme)
  const statsRefreshTrigger = useStore((state: any) => state.statsRefreshTrigger)
  const isNavExpanded = useStore((state: any) => state.isNavExpanded)
  const viewingProfile = useStore((state: any) => state.viewingProfile)
  const clearViewingProfile = useStore((state: any) => state.clearViewingProfile)
  const isViewingOther = viewingProfile && viewingProfile.userId !== currentUser?.id
  const [stats, setStats] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [expandedProviders, setExpandedProviders] = useState<Record<string, any>>({})
  const [expandedModels, setExpandedModels] = useState<Record<string, any>>({})
  const [activeTab, setActiveTab] = useState('tokens')
  const [ratingsData, setRatingsData] = useState<any>(null)
  const [hoveredDay, setHoveredDay] = useState<string | null>(null)
  const [leaderboardStats, setLeaderboardStats] = useState<any>(null)
  const [loadingLeaderboardStats, setLoadingLeaderboardStats] = useState(false)
  const [showBuyUsageModal, setShowBuyUsageModal] = useState(false)
  const [userPlan, setUserPlan] = useState(currentUser?.plan || 'free_trial')
  const [expandedBadgeCategory, setExpandedBadgeCategory] = useState<string | null>(null)
  const [hoveredBadge, setHoveredBadge] = useState<string | null>(null)
  const [showBadgeScrollHint, setShowBadgeScrollHint] = useState(true)
  const badgeCategoriesRef = useRef<HTMLDivElement | null>(null)
  const [hasLoadedLeaderboard, setHasLoadedLeaderboard] = useState(false)
  const [publicProfile, setPublicProfile] = useState<any>(null)
  const [loadingPublicProfile, setLoadingPublicProfile] = useState(false)
  const [showEditProfile, setShowEditProfile] = useState(false)
  const [editBio, setEditBio] = useState('')
  const [editProfileImage, setEditProfileImage] = useState<string | null>(null)
  const [savingProfile, setSavingProfile] = useState(false)
  const [ownProfileData, setOwnProfileData] = useState<any>(null)
  const [dailyChallengeData, setDailyChallengeData] = useState<any>(null)
  const [claimingChallenge, setClaimingChallenge] = useState(false)
  const [challengeClaimedAnim, setChallengeClaimedAnim] = useState(false)
  const [editIsPrivate, setEditIsPrivate] = useState(false)
  const [editShowOnLeaderboard, setEditShowOnLeaderboard] = useState(true)
  const [myRanks, setMyRanks] = useState<{ tokens: number | null; prompts: number | null; streak: number | null; totalParticipants: number } | null>(null)
  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const [mountReady, setMountReady] = useState(false)
  useEffect(() => { const id = requestAnimationFrame(() => setMountReady(true)); return () => cancelAnimationFrame(id) }, [])

  const handleUsagePurchaseSuccess = (data: any) => {
    fetchStats()
    setShowBuyUsageModal(false)
  }

  const handleTabChange = (newTab: string) => {
    setExpandedProviders({})
    setExpandedModels({})
    setActiveTab(newTab)
  }

  useEffect(() => {
    if (isViewingOther) {
      setActiveTab('tokens')
      setLoading(false)
      fetchPublicProfile(viewingProfile.userId)
    } else {
      setPublicProfile(null)
    }
  }, [viewingProfile?.userId])

  const publicStats = publicProfile?.publicStats || {}
  const viewedUserStats = isViewingOther ? {
    totalTokens: publicStats.totalTokens || 0,
    totalPrompts: publicStats.totalPrompts || 0,
    monthlyTokens: publicStats.monthlyTokens || 0,
    monthlyPrompts: publicStats.monthlyPrompts || 0,
    dailyUsage: publicStats.dailyUsage || [],
    providers: publicStats.providers || {},
    models: publicStats.models || {},
    streakDays: publicStats.streakDays || 0,
    councilPrompts: publicStats.councilPrompts || 0,
    debatePrompts: publicStats.debatePrompts || 0,
    usagePercentUsed: 0,
    usagePercentRemaining: 0,
    purchasedCreditsPercent: 0,
    totalAvailableBalance: 0,
    effectiveAllocation: 0,
    remainingFreeAllocation: 0,
  } : null

  const viewedRatingsStats = isViewingOther ? (() => {
    const wins = Object.values(publicStats.modelWins || {}) as Array<{ provider: string; model: string; responseId: string }>
    const totalWins = wins.length
    const providerWins: Record<string, number> = {}
    const modelWins: Record<string, number> = {}
    wins.forEach((win) => {
      if (!win || !win.provider) return
      providerWins[win.provider] = (providerWins[win.provider] || 0) + 1
      const modelKey = `${win.provider}-${win.model}`
      modelWins[modelKey] = (modelWins[modelKey] || 0) + 1
    })
    return {
      totalRatings: totalWins,
      totalWins,
      providerLeaderboard: Object.entries(providerWins).sort((a, b) => b[1] - a[1]),
      modelLeaderboard: Object.entries(modelWins).sort((a, b) => b[1] - a[1]),
      topProvider: Object.entries(providerWins).sort((a, b) => b[1] - a[1])[0] || null,
      topModel: Object.entries(modelWins).sort((a, b) => b[1] - a[1])[0] || null,
    }
  })() : null

  useEffect(() => {
    setHasLoadedLeaderboard(false)
    setLeaderboardStats(null)
  }, [currentUser?.id])

  const fetchPublicProfile = async (userId: string) => {
    try {
      setLoadingPublicProfile(true)
      const viewerId = currentUser?.id || ''
      const response = await api.get(`/profile/${userId}?viewerId=${viewerId}`)
      setPublicProfile(response.data)
    } catch (error: any) {
      console.error('Error fetching public profile:', error)
      setPublicProfile(null)
    } finally {
      setLoadingPublicProfile(false)
    }
  }

  const fetchOwnProfile = async () => {
    if (!currentUser?.id) return
    try {
      const response = await api.get(`/profile/${currentUser.id}?viewerId=${currentUser.id}`)
      setOwnProfileData(response.data)
    } catch (error: any) {
      console.error('Error fetching own profile:', error)
    }
  }

  useEffect(() => {
    if (currentUser?.id && !isViewingOther) {
      fetchOwnProfile()
      api.get('/leaderboard/my-ranks')
        .then((res) => setMyRanks(res.data))
        .catch(() => setMyRanks(null))
    }
  }, [currentUser?.id, isViewingOther, statsRefreshTrigger])

  const handleSaveProfile = async () => {
    if (!currentUser?.id || savingProfile) return
    setSavingProfile(true)
    try {
      await api.put(`/profile/${currentUser.id}`, {
        bio: editBio,
        isPrivate: editIsPrivate,
        showOnLeaderboard: editShowOnLeaderboard,
        profileImage: editProfileImage,
      })
      await fetchOwnProfile()
      setShowEditProfile(false)
    } catch (error: any) {
      console.error('Error saving profile:', error)
      alert(error.response?.data?.error || 'Failed to save profile')
    } finally {
      setSavingProfile(false)
    }
  }

  const handleImageUpload = (e: any) => {
    const file = e.target.files?.[0]
    if (!file) return
    if (file.size > 500000) {
      alert('Image too large. Please use an image under 500KB.')
      return
    }
    const reader = new FileReader()
    reader.onload = () => {
      const img = new Image()
      img.onload = () => {
        const canvas = document.createElement('canvas')
        const size = 200
        canvas.width = size
        canvas.height = size
        const ctx = canvas.getContext('2d')
        const min = Math.min(img.width, img.height)
        const sxVal = (img.width - min) / 2
        const sy = (img.height - min) / 2
        ctx?.drawImage(img, sxVal, sy, min, min, 0, 0, size, size)
        setEditProfileImage(canvas.toDataURL('image/jpeg', 0.8))
      }
      img.src = reader.result as string
    }
    reader.readAsDataURL(file)
  }

  useEffect(() => {
    if (isViewingOther) return
    if (currentUser?.id) {
      fetchStats()
      fetchRatings()
    }
  }, [currentUser, statsRefreshTrigger, isViewingOther])

  const fetchDailyChallenge = async () => {
    if (!currentUser?.id) return
    try {
      const response = await api.get(`/daily-challenge/${currentUser.id}/status`)
      setDailyChallengeData(response.data)
    } catch (error: any) {
      console.error('Error fetching daily challenge:', error)
    }
  }

  const claimDailyChallenge = async () => {
    if (!currentUser?.id || claimingChallenge) return
    setClaimingChallenge(true)
    try {
      const response = await api.post(`/daily-challenge/${currentUser.id}/claim`)
      if (response.data.success) {
        setChallengeClaimedAnim(true)
        setTimeout(() => setChallengeClaimedAnim(false), 2000)
        fetchDailyChallenge()
        fetchStats()
      }
    } catch (error: any) {
      console.error('Error claiming daily challenge:', error)
    } finally {
      setClaimingChallenge(false)
    }
  }

  useEffect(() => {
    if (isViewingOther || !currentUser?.id) return
    if (activeTab === 'badges') {
      fetchLeaderboardStats()
      fetchDailyChallenge()
    }
  }, [currentUser?.id, activeTab, isViewingOther])

  useEffect(() => {
    if (activeTab !== 'badges' || !badgeCategoriesRef.current) {
      setShowBadgeScrollHint(true)
      return
    }
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) setShowBadgeScrollHint(false)
        else setShowBadgeScrollHint(true)
      },
      { threshold: 0.05 }
    )
    observer.observe(badgeCategoriesRef.current)
    return () => observer.disconnect()
  }, [activeTab])

  const fetchLeaderboardStats = async () => {
    if (!currentUser?.id) return
    try {
      if (!hasLoadedLeaderboard) {
        setLoadingLeaderboardStats(true)
      }
      const response = await api.get(`/leaderboard/user-stats/${currentUser.id}`)
      setLeaderboardStats(response.data)
      if (response.data.wins?.length > 0) {
        setWinningPrompts(response.data.wins)
      }
    } catch (error: any) {
      console.error('Error fetching leaderboard stats:', error)
      setLeaderboardStats(null)
    } finally {
      setLoadingLeaderboardStats(false)
      setHasLoadedLeaderboard(true)
    }
  }

  const formatDate = (dateString: string) => {
    const date = new Date(dateString)
    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    })
  }

  const fetchStats = async () => {
    try {
      if (!stats) setLoading(true)
      const response = await api.get(`/stats/${currentUser.id}`)
      setStats(response.data)
      setUserPlan(response.data.userPlan || currentUser?.plan || 'free_trial')
    } catch (error: any) {
      console.error('Error fetching stats:', error)
      if (!stats) {
        setStats({
          totalTokens: 0,
          totalPrompts: 0,
          monthlyTokens: 0,
          monthlyPrompts: 0,
          monthlyCost: 0,
          freeMonthlyAllocation: 0,
          remainingFreeAllocation: 0,
          freeUsagePercentage: 100,
          usagePercentUsed: 0,
          usagePercentRemaining: 100,
          purchasedCreditsPercent: 0,
          dailyUsage: [],
          providers: {},
          models: {},
        })
      }
    } finally {
      setLoading(false)
    }
  }

  const fetchRatings = async () => {
    try {
      const response = await api.get(`/stats/${currentUser.id}/ratings`)
      setRatingsData(response.data.modelWins || {})
    } catch (error: any) {
      console.error('Error fetching model wins:', error)
      setRatingsData({})
    }
  }

  const formatNumber = (num: number) => {
    if (num >= 1000000) return `${(num / 1000000).toFixed(2)  }M`
    if (num >= 1000) return `${(num / 1000).toFixed(2)  }K`
    return num.toLocaleString()
  }

  const formatTokens = (num: number) => {
    if (num === 0) return '0'
    return num.toLocaleString('en-US')
  }

  const formatAccountAge = (createdAt: string) => {
    if (!createdAt) return 'N/A'
    const now = new Date()
    const created = new Date(createdAt)
    const diffTime = Math.abs(now.getTime() - created.getTime())
    const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24))
    const displayDays = diffDays + 1
    const diffYears = Math.floor(displayDays / 365)
    const remainingDays = displayDays % 365
    if (diffYears > 0) {
      if (remainingDays > 0) {
        return `${diffYears} ${diffYears === 1 ? 'year' : 'years'} ${remainingDays} ${remainingDays === 1 ? 'day' : 'days'}`
      } else {
        return `${diffYears} ${diffYears === 1 ? 'year' : 'years'}`
      }
    } else {
      return `${displayDays} ${displayDays === 1 ? 'day' : 'days'}`
    }
  }

  const userStats = stats || {
    totalTokens: 0,
    totalInputTokens: 0,
    totalOutputTokens: 0,
    totalPrompts: 0,
    monthlyTokens: 0,
    monthlyInputTokens: 0,
    monthlyOutputTokens: 0,
    monthlyPrompts: 0,
    monthlyCost: 0,
    freeMonthlyAllocation: 0,
    remainingFreeAllocation: 0,
    freeUsagePercentage: 100,
    usagePercentUsed: 0,
    usagePercentRemaining: 100,
    purchasedCreditsPercent: 0,
    totalAvailableBalance: 0,
    effectiveAllocation: 0,
    purchasedCredits: { total: 0, remaining: 0, purchaseCount: 0, lastPurchase: null },
    dailyUsage: [],
    providers: {},
    models: {},
  }

  const ratingsStats = ratingsData ? (() => {
    const wins = Object.values(ratingsData) as Array<{ provider: string; model: string; responseId: string }>
    const totalWins = wins.length

    const providerWins: Record<string, number> = {}
    const modelWins: Record<string, number> = {}

    wins.forEach((win) => {
      if (!win || !win.provider) return
      providerWins[win.provider] = (providerWins[win.provider] || 0) + 1
      const modelKey = `${win.provider}-${win.model}`
      modelWins[modelKey] = (modelWins[modelKey] || 0) + 1
    })

    const providerLeaderboard = Object.entries(providerWins)
      .sort((a, b) => b[1] - a[1])
    const modelLeaderboard = Object.entries(modelWins)
      .sort((a, b) => b[1] - a[1])

    const topProvider = providerLeaderboard[0] || null
    const topModel = modelLeaderboard[0] || null

    return {
      totalRatings: totalWins,
      totalWins,
      providerLeaderboard,
      modelLeaderboard,
      topProvider,
      topModel,
    }
  })() : {
    totalRatings: 0,
    totalWins: 0,
    providerLeaderboard: [] as [string, number][],
    modelLeaderboard: [] as [string, number][],
    topProvider: null as [string, number] | null,
    topModel: null as [string, number] | null,
  }

  const onEditProfile = () => {
    setEditBio(ownProfileData?.bio || '')
    setEditIsPrivate(ownProfileData?.isPrivate || false)
    setEditShowOnLeaderboard(ownProfileData?.showOnLeaderboard !== false)
    setEditProfileImage(ownProfileData?.profileImage || null)
    setShowEditProfile(true)
  }

  return (
    <div
      className={mountReady ? undefined : 'no-mount-transition'}
      style={sx(s.pageContainer(isNavExpanded ? '240px' : '60px'), {
        padding: spacing['5xl'],
        overflowY: 'auto',
        color: currentTheme.text,
      })}
    >
      <div
        style={{
          width: '100%',
          maxWidth: '1200px',
          margin: '0 auto',
        }}
      >
        <ProfileHeader
          isViewingOther={isViewingOther}
          publicProfile={publicProfile}
          ownProfileData={ownProfileData}
          viewingProfile={viewingProfile}
          currentUser={currentUser}
          stats={isViewingOther ? publicStats : stats}
          currentTheme={currentTheme}
          formatAccountAge={formatAccountAge}
          clearViewingProfile={clearViewingProfile}
          onEditProfile={onEditProfile}
        />

        {/* Leaderboard Ranking Card */}
        {!isViewingOther && myRanks && (myRanks.tokens || myRanks.prompts || myRanks.streak) && (
          <div style={{ marginBottom: spacing['3xl'] }}>
            <div style={{
              display: 'flex', alignItems: 'center', gap: spacing.md,
              marginBottom: spacing.lg,
            }}>
              <Trophy size={16} color={currentTheme.accent} />
              <span style={{
                color: currentTheme.textSecondary, fontSize: fontSize.lg,
                fontWeight: fontWeight.semibold, textTransform: 'uppercase', letterSpacing: '0.5px',
              }}>
                Leaderboard Rankings
              </span>
            </div>
            <div style={{
              display: 'flex',
              gap: spacing.lg,
              flexWrap: 'wrap',
            }}>
            {[
              { label: 'Tokens', rank: myRanks.tokens, icon: Zap, color: '#5dade2' },
              { label: 'Prompts', rank: myRanks.prompts, icon: MessageSquare, color: '#48c9b0' },
              { label: 'Streak', rank: myRanks.streak, icon: Flame, color: '#f39c12' },
            ].map((item) => {
              const Icon = item.icon
              return (
                <div
                  key={item.label}
                  onClick={() => useStore.getState().setActiveTab('leaderboard')}
                  style={{
                    flex: 1,
                    minWidth: '160px',
                    display: 'flex',
                    alignItems: 'center',
                    gap: spacing.lg,
                    padding: `${spacing.xl} ${spacing['2xl']}`,
                    background: currentTheme.backgroundOverlay,
                    border: `1px solid ${currentTheme.borderLight}`,
                    borderRadius: radius.xl,
                    cursor: 'pointer',
                    transition: 'border-color 0.2s',
                  }}
                  onMouseEnter={(e) => { e.currentTarget.style.borderColor = `${item.color}55` }}
                  onMouseLeave={(e) => { e.currentTarget.style.borderColor = currentTheme.borderLight }}
                >
                  <div style={{
                    width: '36px', height: '36px', borderRadius: radius.circle,
                    background: `${item.color}15`, display: 'flex', alignItems: 'center', justifyContent: 'center',
                    flexShrink: 0,
                  }}>
                    <Icon size={18} color={item.color} />
                  </div>
                  <div>
                    <div style={{ color: currentTheme.textSecondary, fontSize: fontSize.base, marginBottom: '2px' }}>
                      {item.label}
                    </div>
                    <div style={{ color: currentTheme.text, fontSize: fontSize['3xl'], fontWeight: fontWeight.bold }}>
                      {item.rank ? `Rank #${item.rank}` : 'Unranked'}
                    </div>
                    <div style={{ color: currentTheme.textMuted, fontSize: fontSize.xs, marginTop: '2px' }}>
                      {item.rank ? `out of ${myRanks.totalParticipants} users` : 'Not enough data'}
                    </div>
                  </div>
                </div>
              )
            })}
            </div>
          </div>
        )}

        {/* Tab Buttons — evenly distributed */}
        <div
          style={{
            display: 'flex',
            marginBottom: spacing['4xl'],
            borderBottom: `1px solid ${currentTheme.borderLight}`,
          }}
        >
          <button
            onClick={() => handleTabChange('tokens')}
            style={{
              flex: 1,
              padding: '14px 12px',
              background: activeTab === 'tokens' ? currentTheme.buttonBackgroundActive : 'transparent',
              border: 'none',
              borderBottom: activeTab === 'tokens' ? `2px solid ${currentTheme.accent}` : '2px solid transparent',
              color: activeTab === 'tokens' ? currentTheme.accent : currentTheme.textSecondary,
              fontSize: fontSize['2xl'],
              fontWeight: activeTab === 'tokens' ? fontWeight.semibold : fontWeight.normal,
              cursor: 'pointer',
              transition: transition.normal,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: spacing.md,
            }}
          >
            <Database size={20} />
            Token Usage
          </button>
          <button
            onClick={() => handleTabChange('badges')}
            style={{
              flex: 1,
              padding: '14px 12px',
              background: activeTab === 'badges' ? currentTheme.buttonBackgroundActive : 'transparent',
              border: 'none',
              borderBottom: activeTab === 'badges' ? `2px solid ${currentTheme.accent}` : '2px solid transparent',
              color: activeTab === 'badges' ? currentTheme.accent : currentTheme.textSecondary,
              fontSize: fontSize['2xl'],
              fontWeight: activeTab === 'badges' ? fontWeight.semibold : fontWeight.normal,
              cursor: 'pointer',
              transition: transition.normal,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: spacing.md,
            }}
          >
            <Award size={20} />
            Badges/Rewards
          </button>
          <button
            onClick={() => handleTabChange('ratings')}
            style={{
              flex: 1,
              padding: '14px 12px',
              background: activeTab === 'ratings' ? currentTheme.buttonBackgroundActive : 'transparent',
              border: 'none',
              borderBottom: activeTab === 'ratings' ? `2px solid ${currentTheme.accent}` : '2px solid transparent',
              color: activeTab === 'ratings' ? currentTheme.accent : currentTheme.textSecondary,
              fontSize: fontSize['2xl'],
              fontWeight: activeTab === 'ratings' ? fontWeight.semibold : fontWeight.normal,
              cursor: 'pointer',
              transition: transition.normal,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: spacing.md,
            }}
          >
            <Trophy size={20} />
            Wins & Models
          </button>
        </div>

        {/* Tab Content */}
        <AnimatePresence mode="wait" initial={false}>
          {activeTab === 'tokens' && !isViewingOther && loading && !stats && (
            <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', padding: spacing['5xl'], minHeight: '300px' }}>
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: spacing.lg }}>
                <div style={{
                  width: '36px', height: '36px', border: `3px solid ${currentTheme.borderLight}`,
                  borderTop: `3px solid ${currentTheme.accent}`, borderRadius: '50%',
                  animation: 'spin 0.8s linear infinite',
                }} />
                <span style={{ color: currentTheme.textMuted, fontSize: fontSize.base }}>Loading usage data...</span>
                <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
              </div>
            </div>
          )}
          {activeTab === 'tokens' && isViewingOther && loadingPublicProfile && (
            <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', padding: spacing['5xl'], minHeight: '300px' }}>
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: spacing.lg }}>
                <div style={{
                  width: '36px', height: '36px', border: `3px solid ${currentTheme.borderLight}`,
                  borderTop: `3px solid ${currentTheme.accent}`, borderRadius: '50%',
                  animation: 'spin 0.8s linear infinite',
                }} />
                <span style={{ color: currentTheme.textMuted, fontSize: fontSize.base }}>Loading profile data...</span>
                <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
              </div>
            </div>
          )}
          {activeTab === 'tokens' && !isViewingOther && !(loading && !stats) && (
            <TokenUsageTab
              userStats={userStats}
              userPlan={userPlan}
              theme={theme}
              currentTheme={currentTheme}
              s={s}
              hoveredDay={hoveredDay}
              setHoveredDay={setHoveredDay}
              showBuyUsageModal={showBuyUsageModal}
              setShowBuyUsageModal={setShowBuyUsageModal}
              formatNumber={formatNumber}
              formatTokens={formatTokens}
              isViewingOther={false}
            />
          )}
          {activeTab === 'tokens' && isViewingOther && !loadingPublicProfile && viewedUserStats && (
            <TokenUsageTab
              userStats={viewedUserStats}
              userPlan={'hidden'}
              theme={theme}
              currentTheme={currentTheme}
              s={s}
              hoveredDay={hoveredDay}
              setHoveredDay={setHoveredDay}
              showBuyUsageModal={false}
              setShowBuyUsageModal={() => {}}
              formatNumber={formatNumber}
              formatTokens={formatTokens}
              isViewingOther={true}
            />
          )}

          {activeTab === 'ratings' && !isViewingOther && (
            <RatingsTab
              ratingsStats={ratingsStats}
              userStats={userStats}
              currentTheme={currentTheme}
              theme={theme}
              s={s}
              expandedProviders={expandedProviders}
              setExpandedProviders={setExpandedProviders}
              expandedModels={expandedModels}
              setExpandedModels={setExpandedModels}
              LLM_PROVIDERS={LLM_PROVIDERS}
              formatNumber={formatNumber}
              formatTokens={formatTokens}
            />
          )}
          {activeTab === 'ratings' && isViewingOther && viewedUserStats && (
            <RatingsTab
              ratingsStats={viewedRatingsStats || { totalRatings: 0, totalWins: 0, providerLeaderboard: [], modelLeaderboard: [], topProvider: null, topModel: null }}
              userStats={viewedUserStats}
              currentTheme={currentTheme}
              theme={theme}
              s={s}
              expandedProviders={expandedProviders}
              setExpandedProviders={setExpandedProviders}
              expandedModels={expandedModels}
              setExpandedModels={setExpandedModels}
              LLM_PROVIDERS={LLM_PROVIDERS}
              formatNumber={formatNumber}
              formatTokens={formatTokens}
            />
          )}

          {activeTab === 'badges' && (
            <BadgesTab
              isFreePlan={isViewingOther ? false : isFreePlan}
              isViewingOther={!!isViewingOther}
              userStats={isViewingOther ? (viewedUserStats || userStats) : userStats}
              publicProfile={publicProfile}
              leaderboardStats={leaderboardStats}
              ratingsStats={isViewingOther ? (viewedRatingsStats || ratingsStats) : ratingsStats}
              currentUser={currentUser}
              currentTheme={currentTheme}
              theme={theme}
              s={s}
              expandedBadgeCategory={expandedBadgeCategory}
              setExpandedBadgeCategory={setExpandedBadgeCategory}
              hoveredBadge={hoveredBadge}
              setHoveredBadge={setHoveredBadge}
              showBadgeScrollHint={showBadgeScrollHint}
              badgeCategoriesRef={badgeCategoriesRef}
              dailyChallengeData={isViewingOther ? null : dailyChallengeData}
              claimingChallenge={claimingChallenge}
              challengeClaimedAnim={challengeClaimedAnim}
              claimDailyChallenge={claimDailyChallenge}
            />
          )}

        </AnimatePresence>

        {/* Buy Usage Modal */}
        <BuyUsageModal
          isOpen={showBuyUsageModal}
          onClose={() => setShowBuyUsageModal(false)}
          onSuccess={handleUsagePurchaseSuccess}
        />

        <EditProfileModal
          showEditProfile={showEditProfile}
          savingProfile={savingProfile}
          currentTheme={currentTheme}
          s={s}
          editBio={editBio}
          setEditBio={setEditBio}
          editIsPrivate={editIsPrivate}
          setEditIsPrivate={setEditIsPrivate}
          editShowOnLeaderboard={editShowOnLeaderboard}
          setEditShowOnLeaderboard={setEditShowOnLeaderboard}
          editProfileImage={editProfileImage}
          setEditProfileImage={setEditProfileImage}
          fileInputRef={fileInputRef}
          handleImageUpload={handleImageUpload}
          handleSaveProfile={handleSaveProfile}
          setShowEditProfile={setShowEditProfile}
        />

      </div>
    </div>
  )
}

export default StatisticsView
