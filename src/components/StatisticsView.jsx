import React, { useEffect, useState, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { TrendingUp, Database, BarChart3, MessageSquare, ChevronDown, ChevronRight, Search, Star, X, Cpu, Trophy, Bell, Heart, ShoppingCart, Zap, Flame, Globe, Award, User, Lock, Crown, Rocket, Shield, Trash2, ArrowLeft, Camera, Edit3, UserPlus, UserCheck, Users, Calendar, Swords, MessageCircle } from 'lucide-react'
import { useStore } from '../store/useStore'
import { getTheme } from '../utils/theme'
import axios from 'axios'
import { API_URL } from '../utils/config'
import BuyUsageModal from './BuyUsageModal'
import ConfirmationModal from './ConfirmationModal'
import { LLM_PROVIDERS } from '../services/llmProviders'
import MessagingView from './MessagingView'

// ==================== BADGE DEFINITIONS ====================
const BADGE_CATEGORIES = [
  {
    id: 'tokens',
    name: 'Token Titan',
    icon: Zap,
    description: 'Process tokens to unlock these badges',
    statKey: 'totalTokens',
    unit: 'tokens',
    badges: [
      { name: 'First Spark', threshold: 1000, emoji: '⚡', color: '#FFD700', desc: '1K tokens' },
      { name: 'Kindling', threshold: 10000, emoji: '🔥', color: '#FF8C00', desc: '10K tokens' },
      { name: 'Torch Bearer', threshold: 100000, emoji: '🔦', color: '#FF6347', desc: '100K tokens' },
      { name: 'Inferno', threshold: 1000000, emoji: '🌋', color: '#FF4500', desc: '1M tokens' },
      { name: 'Supernova', threshold: 5000000, emoji: '💥', color: '#DC143C', desc: '5M tokens' },
      { name: 'Cosmic Force', threshold: 10000000, emoji: '🌌', color: '#9400D3', desc: '10M tokens' },
      { name: 'Void Walker', threshold: 25000000, emoji: '🕳️', color: '#6A0DAD', desc: '25M tokens' },
      { name: 'Galactic Mind', threshold: 50000000, emoji: '🪐', color: '#4B0082', desc: '50M tokens' },
      { name: 'Nebula Architect', threshold: 100000000, emoji: '✨', color: '#00CED1', desc: '100M tokens' },
      { name: 'Star Forger', threshold: 250000000, emoji: '⭐', color: '#00BFFF', desc: '250M tokens' },
      { name: 'Dimension Breaker', threshold: 500000000, emoji: '🔮', color: '#5B5EA6', desc: '500M tokens' },
      { name: 'Universal Consciousness', threshold: 1000000000, emoji: '🌀', color: '#7B68EE', desc: '1B tokens' },
    ]
  },
  {
    id: 'prompts',
    name: 'Prompt Pioneer',
    icon: MessageSquare,
    description: 'Send prompts to unlock these badges',
    statKey: 'totalPrompts',
    unit: 'prompts',
    badges: [
      { name: 'First Words', threshold: 1, emoji: '💬', color: '#32CD32', desc: '1 prompt' },
      { name: 'Curious Mind', threshold: 10, emoji: '🧠', color: '#00FA9A', desc: '10 prompts' },
      { name: 'Explorer', threshold: 25, emoji: '🧭', color: '#20B2AA', desc: '25 prompts' },
      { name: 'Trailblazer', threshold: 50, emoji: '🚀', color: '#1E90FF', desc: '50 prompts' },
      { name: 'Pathfinder', threshold: 100, emoji: '🗺️', color: '#4169E1', desc: '100 prompts' },
      { name: 'Wayfinder', threshold: 250, emoji: '🔮', color: '#8A2BE2', desc: '250 prompts' },
      { name: 'Sage', threshold: 500, emoji: '📜', color: '#9370DB', desc: '500 prompts' },
      { name: 'Oracle', threshold: 1000, emoji: '🏛️', color: '#BA55D3', desc: '1K prompts' },
      { name: 'Visionary', threshold: 5000, emoji: '👁️', color: '#FF69B4', desc: '5K prompts' },
      { name: 'Transcendent', threshold: 10000, emoji: '🌟', color: '#FFD700', desc: '10K prompts' },
      { name: 'Enlightened', threshold: 50000, emoji: '🧿', color: '#E0115F', desc: '50K prompts' },
      { name: 'Omniscient', threshold: 100000, emoji: '👑', color: '#FF4500', desc: '100K prompts' },
    ]
  },
  {
    id: 'streaks',
    name: 'Streak Warrior',
    icon: Flame,
    description: 'Maintain daily usage streaks',
    statKey: 'streakDays',
    unit: 'days',
    badges: [
      { name: 'Getting Warm', threshold: 3, emoji: '🕯️', color: '#FFA07A', desc: '3-day streak' },
      { name: 'Week Warrior', threshold: 7, emoji: '⚔️', color: '#FF7F50', desc: '7-day streak' },
      { name: 'Fortnight Force', threshold: 14, emoji: '🛡️', color: '#FF6347', desc: '14-day streak' },
      { name: 'Monthly Machine', threshold: 30, emoji: '⚙️', color: '#FF4500', desc: '30-day streak' },
      { name: 'Iron Will', threshold: 60, emoji: '🔩', color: '#DC143C', desc: '60-day streak' },
      { name: 'Centurion', threshold: 100, emoji: '🏛️', color: '#B22222', desc: '100-day streak' },
      { name: 'Unbreakable', threshold: 150, emoji: '💎', color: '#C41E3A', desc: '150-day streak' },
      { name: 'Legendary', threshold: 200, emoji: '🐉', color: '#8B0000', desc: '200-day streak' },
      { name: 'Eternal Flame', threshold: 365, emoji: '🔥', color: '#FFD700', desc: '365-day streak' },
      { name: 'Immortal', threshold: 500, emoji: '♾️', color: '#9400D3', desc: '500-day streak' },
      { name: 'Titan of Will', threshold: 750, emoji: '🏔️', color: '#4B0082', desc: '750-day streak' },
      { name: 'Unkillable', threshold: 1000, emoji: '💀', color: '#FF0000', desc: '1000-day streak' },
    ]
  },
  // DISABLED: Community Champion and Social Butterfly badge categories temporarily removed (social media features)
  // {
  //   id: 'community',
  //   name: 'Community Champion',
  //   ...
  // },
  // {
  //   id: 'social',
  //   name: 'Social Butterfly',
  //   ...
  // },
  {
    id: 'ratings',
    name: 'Rating Guru',
    icon: Star,
    description: 'Rate AI responses to unlock these badges',
    statKey: 'totalRatings',
    unit: 'ratings',
    badges: [
      { name: 'First Critic', threshold: 1, emoji: '📝', color: '#FFD700', desc: '1 rating' },
      { name: 'Reviewer', threshold: 5, emoji: '📋', color: '#FFA500', desc: '5 ratings' },
      { name: 'Connoisseur', threshold: 25, emoji: '🍷', color: '#FF8C00', desc: '25 ratings' },
      { name: 'Appraiser', threshold: 50, emoji: '🔍', color: '#FF6347', desc: '50 ratings' },
      { name: 'Expert Judge', threshold: 100, emoji: '⚖️', color: '#DC143C', desc: '100 ratings' },
      { name: 'Grand Arbiter', threshold: 250, emoji: '🔱', color: '#8B0000', desc: '250 ratings' },
      { name: 'Supreme Arbiter', threshold: 500, emoji: '👑', color: '#660000', desc: '500 ratings' },
      { name: 'Verdict King', threshold: 750, emoji: '🏰', color: '#4A0000', desc: '750 ratings' },
      { name: 'Omnijudge', threshold: 1000, emoji: '⚖️', color: '#330000', desc: '1,000 ratings' },
      { name: 'The Arbiter', threshold: 1500, emoji: '🔮', color: '#1A0000', desc: '1,500 ratings' },
    ]
  },
  {
    id: 'council',
    name: 'Council Mastery',
    icon: Shield,
    description: 'Use the Council of LLMs (3+ models at once)',
    statKey: 'councilPrompts',
    unit: 'assemblies',
    badges: [
      { name: 'First Assembly', threshold: 1, emoji: '🏛️', color: '#2E86C1', desc: '1 council assembly' },
      { name: 'Council Initiate', threshold: 25, emoji: '⚖️', color: '#2874A6', desc: '25 assemblies' },
      { name: 'Grand Councilor', threshold: 100, emoji: '🏆', color: '#21618C', desc: '100 assemblies' },
      { name: 'Senate Leader', threshold: 250, emoji: '👑', color: '#1B4F72', desc: '250 assemblies' },
      { name: 'Council Sovereign', threshold: 1000, emoji: '🔱', color: '#154360', desc: '1K assemblies' },
      { name: 'Council Overlord', threshold: 5000, emoji: '⚡', color: '#0E3B54', desc: '5K assemblies' },
      { name: 'Council Immortal', threshold: 10000, emoji: '💎', color: '#082E44', desc: '10K assemblies' },
      { name: 'Eternal Arbiter', threshold: 25000, emoji: '🌌', color: '#041E2E', desc: '25K assemblies' },
    ]
  },
  {
    id: 'debate',
    name: 'Debate Master',
    icon: Swords,
    description: 'Use Debate Mode to pit models against each other',
    statKey: 'debatePrompts',
    unit: 'debates',
    badges: [
      { name: 'Opening Statement', threshold: 1, emoji: '🎤', color: '#E74C3C', desc: '1 debate' },
      { name: 'Devil\'s Advocate', threshold: 25, emoji: '😈', color: '#C0392B', desc: '25 debates' },
      { name: 'Cross-Examiner', threshold: 100, emoji: '🔍', color: '#A93226', desc: '100 debates' },
      { name: 'Rhetorician', threshold: 250, emoji: '📜', color: '#922B21', desc: '250 debates' },
      { name: 'Master Debater', threshold: 1000, emoji: '🎯', color: '#7B241C', desc: '1K debates' },
      { name: 'Grand Orator', threshold: 5000, emoji: '🏛️', color: '#641E16', desc: '5K debates' },
      { name: 'Supreme Dialectician', threshold: 10000, emoji: '⚔️', color: '#4A1711', desc: '10K debates' },
      { name: 'Eternal Challenger', threshold: 25000, emoji: '🔥', color: '#30100B', desc: '25K debates' },
    ]
  },
  {
    id: 'provider-openai',
    name: 'ChatGPT Explorer',
    icon: Cpu,
    description: 'Send prompts using ChatGPT models',
    statKey: 'provider_openai_prompts',
    unit: 'prompts',
    badges: [
      { name: 'GPT Regular', threshold: 100, emoji: '💬', color: '#1a7f64', desc: '100 prompts' },
      { name: 'GPT Enthusiast', threshold: 500, emoji: '🔥', color: '#0d8c6d', desc: '500 prompts' },
      { name: 'GPT Power User', threshold: 1000, emoji: '⚡', color: '#0a6e55', desc: '1K prompts' },
      { name: 'GPT Expert', threshold: 5000, emoji: '🏆', color: '#085c47', desc: '5K prompts' },
      { name: 'GPT Master', threshold: 10000, emoji: '👑', color: '#064a39', desc: '10K prompts' },
      { name: 'GPT Legend', threshold: 25000, emoji: '🌟', color: '#04382b', desc: '25K prompts' },
    ]
  },
  {
    id: 'provider-anthropic',
    name: 'Claude Explorer',
    icon: Cpu,
    description: 'Send prompts using Claude models',
    statKey: 'provider_anthropic_prompts',
    unit: 'prompts',
    badges: [
      { name: 'Claude Regular', threshold: 100, emoji: '💬', color: '#c4956a', desc: '100 prompts' },
      { name: 'Claude Enthusiast', threshold: 500, emoji: '🔥', color: '#b48560', desc: '500 prompts' },
      { name: 'Claude Power User', threshold: 1000, emoji: '⚡', color: '#a47556', desc: '1K prompts' },
      { name: 'Claude Expert', threshold: 5000, emoji: '🏆', color: '#94654c', desc: '5K prompts' },
      { name: 'Claude Master', threshold: 10000, emoji: '👑', color: '#845542', desc: '10K prompts' },
      { name: 'Claude Legend', threshold: 25000, emoji: '🌟', color: '#744538', desc: '25K prompts' },
    ]
  },
  {
    id: 'provider-google',
    name: 'Gemini Explorer',
    icon: Cpu,
    description: 'Send prompts using Gemini models',
    statKey: 'provider_google_prompts',
    unit: 'prompts',
    badges: [
      { name: 'Gemini Regular', threshold: 100, emoji: '💬', color: '#3B78DB', desc: '100 prompts' },
      { name: 'Gemini Enthusiast', threshold: 500, emoji: '🔥', color: '#346BC2', desc: '500 prompts' },
      { name: 'Gemini Power User', threshold: 1000, emoji: '⚡', color: '#2D5EA9', desc: '1K prompts' },
      { name: 'Gemini Expert', threshold: 5000, emoji: '🏆', color: '#265190', desc: '5K prompts' },
      { name: 'Gemini Master', threshold: 10000, emoji: '👑', color: '#1F4477', desc: '10K prompts' },
      { name: 'Gemini Legend', threshold: 25000, emoji: '🌟', color: '#18375E', desc: '25K prompts' },
    ]
  },
  {
    id: 'provider-xai',
    name: 'Grok Explorer',
    icon: Cpu,
    description: 'Send prompts using Grok models',
    statKey: 'provider_xai_prompts',
    unit: 'prompts',
    badges: [
      { name: 'Grok Regular', threshold: 100, emoji: '💬', color: '#1A91D9', desc: '100 prompts' },
      { name: 'Grok Enthusiast', threshold: 500, emoji: '🔥', color: '#1781C0', desc: '500 prompts' },
      { name: 'Grok Power User', threshold: 1000, emoji: '⚡', color: '#1471A7', desc: '1K prompts' },
      { name: 'Grok Expert', threshold: 5000, emoji: '🏆', color: '#11618E', desc: '5K prompts' },
      { name: 'Grok Master', threshold: 10000, emoji: '👑', color: '#0E5175', desc: '10K prompts' },
      { name: 'Grok Legend', threshold: 25000, emoji: '🌟', color: '#0B415C', desc: '25K prompts' },
    ]
  },
]

const formatBadgeNumber = (num) => {
  if (num >= 1000000000) return `${(num / 1000000000).toFixed(num % 1000000000 === 0 ? 0 : 1)}B`
  if (num >= 1000000) return `${(num / 1000000).toFixed(num % 1000000 === 0 ? 0 : 1)}M`
  if (num >= 1000) return `${(num / 1000).toFixed(num % 1000 === 0 ? 0 : 1)}K`
  return num.toLocaleString()
}

const StatisticsView = () => {
  const currentUser = useStore((state) => state.currentUser)
  const isFreePlan = currentUser?.plan === 'free_trial' && !currentUser?.stripeSubscriptionId
  const theme = useStore((state) => state.theme || 'dark')
  const currentTheme = getTheme(theme)
  const statsRefreshTrigger = useStore((state) => state.statsRefreshTrigger)
  const leaderboardRefreshTrigger = useStore((state) => state.leaderboardRefreshTrigger)
  const setWinningPrompts = useStore((state) => state.setWinningPrompts)
  const winningPrompts = useStore((state) => state.winningPrompts)
  const isNavExpanded = useStore((state) => state.isNavExpanded)
  const viewingProfile = useStore((state) => state.viewingProfile)
  const clearViewingProfile = useStore((state) => state.clearViewingProfile)
  const notificationCount = useStore((state) => state.notificationCount)
  const setNotificationCount = useStore((state) => state.setNotificationCount)
  const isViewingOther = viewingProfile && viewingProfile.userId !== currentUser?.id
  const [stats, setStats] = useState(null)
  const [loading, setLoading] = useState(true)
  const [expandedProviders, setExpandedProviders] = useState({})
  const [expandedModels, setExpandedModels] = useState({})
  const [activeTab, setActiveTab] = useState('tokens') // 'tokens', 'ratings', 'leaderboard'
  const [ratingsData, setRatingsData] = useState(null)
  const [hoveredDay, setHoveredDay] = useState(null) // Track which day is being hovered
  const [leaderboardStats, setLeaderboardStats] = useState(null)
  const [loadingLeaderboardStats, setLoadingLeaderboardStats] = useState(false)
  const [showBuyUsageModal, setShowBuyUsageModal] = useState(false)
  const [userPlan, setUserPlan] = useState(currentUser?.plan || 'free_trial')
  const [profilePrompts, setProfilePrompts] = useState([])
  const [loadingProfile, setLoadingProfile] = useState(false)
  const [hasLoadedProfile, setHasLoadedProfile] = useState(false)
  const [deletingPostId, setDeletingPostId] = useState(null)
  const [confirmDeleteId, setConfirmDeleteId] = useState(null)
  const [expandedBadgeCategory, setExpandedBadgeCategory] = useState(null)
  const [hoveredBadge, setHoveredBadge] = useState(null)
  const [showBadgeScrollHint, setShowBadgeScrollHint] = useState(true)
  const badgeCategoriesRef = useRef(null)
  const [hasLoadedLeaderboard, setHasLoadedLeaderboard] = useState(false)
  // Public profile data for another user
  const [publicProfile, setPublicProfile] = useState(null)
  const [loadingPublicProfile, setLoadingPublicProfile] = useState(false)
  // Profile editing state
  const [showEditProfile, setShowEditProfile] = useState(false)
  const [editBio, setEditBio] = useState('')
  const [editIsAnonymous, setEditIsAnonymous] = useState(false)
  const [editProfileImage, setEditProfileImage] = useState(null)
  const [savingProfile, setSavingProfile] = useState(false)
  const [ownProfileData, setOwnProfileData] = useState(null)
  const [followLoading, setFollowLoading] = useState(false)
  const [showFollowersList, setShowFollowersList] = useState(null)
  const [followersListData, setFollowersListData] = useState([])
  const [dailyChallengeData, setDailyChallengeData] = useState(null)
  const [claimingChallenge, setClaimingChallenge] = useState(false)
  const [challengeClaimedAnim, setChallengeClaimedAnim] = useState(false)
  const [loadingFollowersList, setLoadingFollowersList] = useState(false)
  const [showUnfollowConfirm, setShowUnfollowConfirm] = useState(false)
  const [editIsPrivate, setEditIsPrivate] = useState(false)
  const [notifications, setNotifications] = useState([])
  const [unreadNotifCount, setUnreadNotifCount] = useState(0)
  const [loadingNotifications, setLoadingNotifications] = useState(false)
  const [hasLoadedNotifications, setHasLoadedNotifications] = useState(false)
  const [followingSet, setFollowingSet] = useState(new Set())
  const [followBackLoading, setFollowBackLoading] = useState(null)
  const [followRequests, setFollowRequests] = useState([])
  const [loadingFollowRequests, setLoadingFollowRequests] = useState(false)
  const [processingRequestId, setProcessingRequestId] = useState(null)
  const [notifSubTab, setNotifSubTab] = useState('notifications')
  const fileInputRef = useRef(null)

  // Handle successful usage purchase
  const handleUsagePurchaseSuccess = (data) => {
    // Refresh stats to show new balance
    fetchStats()
    // Close modal immediately — success checkmark was already shown in the modal
    setShowBuyUsageModal(false)
  }

  // Helper function to handle tab switching and reset expanded states
  const handleTabChange = (newTab) => {
    setExpandedProviders({})
    setExpandedModels({})
    if (newTab === 'leaderboard') {
      setNotificationCount(0)
      if (currentUser?.id) {
        axios.post(`${API_URL}/api/notifications/mark-read`, { userId: currentUser.id }).catch(() => {})
      }
    }
    setActiveTab(newTab)
  }

  // When viewing another user, fetch public profile (social tabs disabled)
  useEffect(() => {
    if (isViewingOther) {
      setActiveTab('tokens') // Default to tokens (social posts tab disabled)
      setLoading(false) // Don't wait for own stats — public profile fetch handles this view
      setHasLoadedProfile(false)
      setProfilePrompts([])
      fetchPublicProfile(viewingProfile.userId)
    } else {
      setPublicProfile(null)
      setHasLoadedProfile(false)
      setProfilePrompts([])
    }
  }, [viewingProfile?.userId])

  useEffect(() => {
    setHasLoadedLeaderboard(false)
    setLeaderboardStats(null)
  }, [currentUser?.id])

  const fetchPublicProfile = async (userId) => {
    try {
      if (!hasLoadedProfile) {
        setLoadingPublicProfile(true)
      }
      const viewerId = currentUser?.id || ''
      const response = await axios.get(`${API_URL}/api/profile/${userId}?viewerId=${viewerId}`)
      setPublicProfile(response.data)
      setProfilePrompts(response.data.posts || [])
    } catch (error) {
      console.error('Error fetching public profile:', error)
      setPublicProfile(null)
      setProfilePrompts([])
    } finally {
      setLoadingPublicProfile(false)
      setLoadingProfile(false)
      setHasLoadedProfile(true)
    }
  }

  const fetchOwnProfile = async () => {
    if (!currentUser?.id) return
    try {
      const response = await axios.get(`${API_URL}/api/profile/${currentUser.id}?viewerId=${currentUser.id}`)
      setOwnProfileData(response.data)
    } catch (error) {
      console.error('Error fetching own profile:', error)
    }
  }

  useEffect(() => {
    if (currentUser?.id && !isViewingOther) {
      fetchOwnProfile()
    }
  }, [currentUser?.id, isViewingOther, statsRefreshTrigger])

  const handleFollow = async (targetUserId) => {
    if (!currentUser?.id || followLoading) return
    setFollowLoading(true)
    try {
      await axios.post(`${API_URL}/api/users/${targetUserId}/follow`, { userId: currentUser.id })
      await fetchPublicProfile(targetUserId)
    } catch (error) {
      console.error('Error following user:', error)
    } finally {
      setFollowLoading(false)
    }
  }

  const handleUnfollow = async (targetUserId) => {
    if (!currentUser?.id || followLoading) return
    setFollowLoading(true)
    try {
      await axios.post(`${API_URL}/api/users/${targetUserId}/unfollow`, { userId: currentUser.id })
      await fetchPublicProfile(targetUserId)
    } catch (error) {
      console.error('Error unfollowing user:', error)
    } finally {
      setFollowLoading(false)
    }
  }

  const handleSaveProfile = async () => {
    if (!currentUser?.id || savingProfile) return
    setSavingProfile(true)
    try {
      await axios.put(`${API_URL}/api/profile/${currentUser.id}`, {
        bio: editBio,
        isAnonymous: editIsAnonymous,
        isPrivate: editIsPrivate,
        profileImage: editProfileImage,
      })
      await fetchOwnProfile()
      setShowEditProfile(false)
    } catch (error) {
      console.error('Error saving profile:', error)
      alert(error.response?.data?.error || 'Failed to save profile')
    } finally {
      setSavingProfile(false)
    }
  }

  const fetchNotifications = async () => {
    if (!currentUser?.id) return
    if (!hasLoadedNotifications) setLoadingNotifications(true)
    try {
      const [notifRes, followingRes] = await Promise.all([
        axios.get(`${API_URL}/api/notifications/${currentUser.id}?limit=50`),
        axios.get(`${API_URL}/api/users/${currentUser.id}/following`).catch(() => ({ data: { following: [] } })),
      ])
      const twoDaysAgo = Date.now() - 2 * 24 * 60 * 60 * 1000
      const filtered = (notifRes.data.notifications || []).filter(n =>
        !n.read || new Date(n.createdAt).getTime() > twoDaysAgo
      )
      setNotifications(filtered)
      setUnreadNotifCount(notifRes.data.unreadCount || 0)
      const ids = (followingRes.data.following || []).map(u => u.userId || u._id)
      setFollowingSet(new Set(ids))
    } catch (err) {
      console.error('Error fetching notifications:', err)
    } finally {
      setLoadingNotifications(false)
      setHasLoadedNotifications(true)
    }
  }

  const handleFollowBack = async (targetUserId) => {
    if (!currentUser?.id || followBackLoading) return
    setFollowBackLoading(targetUserId)
    try {
      await axios.post(`${API_URL}/api/users/${targetUserId}/follow`, { userId: currentUser.id })
      setFollowingSet(prev => new Set([...prev, targetUserId]))
    } catch (error) {
      console.error('Error following back:', error)
    } finally {
      setFollowBackLoading(null)
    }
  }

  const fetchFollowRequests = async () => {
    if (!currentUser?.id) return
    setLoadingFollowRequests(true)
    try {
      const res = await axios.get(`${API_URL}/api/users/${currentUser.id}/follow-requests`)
      setFollowRequests(res.data.requests || [])
    } catch (err) {
      console.error('Error fetching follow requests:', err)
    } finally {
      setLoadingFollowRequests(false)
    }
  }

  const handleAcceptFollowRequest = async (requesterId) => {
    setProcessingRequestId(requesterId)
    try {
      await axios.post(`${API_URL}/api/users/${currentUser.id}/follow/accept`, { requesterId })
      setFollowRequests(prev => prev.filter(r => r.userId !== requesterId))
      await fetchOwnProfile()
    } catch (err) {
      console.error('Error accepting follow request:', err)
    } finally {
      setProcessingRequestId(null)
    }
  }

  const handleDenyFollowRequest = async (requesterId) => {
    setProcessingRequestId(requesterId)
    try {
      await axios.post(`${API_URL}/api/users/${currentUser.id}/follow/deny`, { requesterId })
      setFollowRequests(prev => prev.filter(r => r.userId !== requesterId))
    } catch (err) {
      console.error('Error denying follow request:', err)
    } finally {
      setProcessingRequestId(null)
    }
  }

  const handleMarkAllNotificationsRead = async () => {
    if (!currentUser?.id) return
    try {
      await axios.post(`${API_URL}/api/notifications/mark-read`, { userId: currentUser.id })
      setNotifications(prev => prev.map(n => ({ ...n, read: true })))
      setUnreadNotifCount(0)
    } catch (err) {
      console.error('Error marking notifications read:', err)
    }
  }

  const handleImageUpload = (e) => {
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
        const sx = (img.width - min) / 2
        const sy = (img.height - min) / 2
        ctx.drawImage(img, sx, sy, min, min, 0, 0, size, size)
        setEditProfileImage(canvas.toDataURL('image/jpeg', 0.8))
      }
      img.src = reader.result
    }
    reader.readAsDataURL(file)
  }

  const fetchFollowersList = async (userId, type) => {
    setShowFollowersList(type)
    setLoadingFollowersList(true)
    try {
      const response = await axios.get(`${API_URL}/api/users/${userId}/${type}`)
      setFollowersListData(response.data[type] || [])
    } catch (error) {
      console.error(`Error fetching ${type}:`, error)
      setFollowersListData([])
    } finally {
      setLoadingFollowersList(false)
    }
  }

  // Fetch core stats (not dependent on which tab is active)
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
      const response = await axios.get(`${API_URL}/api/daily-challenge/${currentUser.id}/status`)
      setDailyChallengeData(response.data)
    } catch (error) {
      console.error('Error fetching daily challenge:', error)
    }
  }

  const claimDailyChallenge = async () => {
    if (!currentUser?.id || claimingChallenge) return
    setClaimingChallenge(true)
    try {
      const response = await axios.post(`${API_URL}/api/daily-challenge/${currentUser.id}/claim`)
      if (response.data.success) {
        setChallengeClaimedAnim(true)
        setTimeout(() => setChallengeClaimedAnim(false), 2000)
        fetchDailyChallenge()
        fetchStats()
      }
    } catch (error) {
      console.error('Error claiming daily challenge:', error)
    } finally {
      setClaimingChallenge(false)
    }
  }

  // Fetch tab-specific data only when that tab is active
  useEffect(() => {
    if (isViewingOther || !currentUser?.id) return
    if (activeTab === 'leaderboard' || activeTab === 'badges') {
      fetchLeaderboardStats()
    }
    if (activeTab === 'badges') {
      fetchDailyChallenge()
    }
    if (activeTab === 'leaderboard') {
      fetchNotifications()
      if (ownProfileData?.isPrivate) fetchFollowRequests()
    }
    if (activeTab === 'profile') {
      fetchProfilePrompts()
    }
  }, [currentUser?.id, activeTab, isViewingOther])

  // Re-fetch profile and leaderboard data when a prompt is deleted from either view
  useEffect(() => {
    if (!leaderboardRefreshTrigger || isViewingOther || !currentUser?.id) return
    fetchLeaderboardStats()
    if (activeTab === 'profile') {
      fetchProfilePrompts()
    }
  }, [leaderboardRefreshTrigger])

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
      const response = await axios.get(`${API_URL}/api/leaderboard/user-stats/${currentUser.id}`)
      setLeaderboardStats(response.data)
      if (response.data.wins?.length > 0) {
        setWinningPrompts(response.data.wins)
      }
    } catch (error) {
      console.error('Error fetching leaderboard stats:', error)
      setLeaderboardStats(null)
    } finally {
      setLoadingLeaderboardStats(false)
      setHasLoadedLeaderboard(true)
    }
  }

  const fetchProfilePrompts = async () => {
    if (!currentUser?.id) return
    try {
      if (!hasLoadedProfile) {
        setLoadingProfile(true)
      }
      const response = await axios.get(`${API_URL}/api/leaderboard?filter=profile&userId=${currentUser.id}`)
      setProfilePrompts(response.data.prompts || [])
    } catch (error) {
      console.error('Error fetching profile prompts:', error)
      setProfilePrompts([])
    } finally {
      setLoadingProfile(false)
      setHasLoadedProfile(true)
    }
  }

  const handleDeletePost = async (promptId) => {
    if (!currentUser?.id || !promptId) return
    try {
      setDeletingPostId(promptId)
      await axios.delete(`${API_URL}/api/leaderboard/delete/${promptId}`, {
        data: { userId: currentUser.id }
      })
      // Remove from local state immediately
      setProfilePrompts(prev => prev.filter(p => p.id !== promptId))
      setConfirmDeleteId(null)
      // Refresh leaderboard stats (updates "Total Prompts Submitted", badges, etc.)
      fetchLeaderboardStats()
      // Notify other views (e.g. prompt feed) so they drop the deleted prompt
      useStore.getState().triggerLeaderboardRefresh()
    } catch (error) {
      console.error('Error deleting post:', error)
    } finally {
      setDeletingPostId(null)
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

  const fetchStats = async () => {
    try {
      // Only show full-page loading spinner on the very first load
      if (!stats) setLoading(true)
      const response = await axios.get(`${API_URL}/api/stats/${currentUser.id}`)
      setStats(response.data)
      setUserPlan(response.data.userPlan || currentUser?.plan || 'free_trial')
    } catch (error) {
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
      const response = await axios.get(`${API_URL}/api/stats/${currentUser.id}/ratings`)
      setRatingsData(response.data.ratings || {})
    } catch (error) {
      console.error('Error fetching ratings:', error)
      setRatingsData({})
    }
  }


  const formatNumber = (num) => {
    if (num >= 1000000) return (num / 1000000).toFixed(2) + 'M'
    if (num >= 1000) return (num / 1000).toFixed(2) + 'K'
    return num.toLocaleString()
  }

  const formatTokens = (num) => {
    if (num === 0) return '0'
    // Show full number with commas for readability
    return num.toLocaleString('en-US')
  }

  const formatAccountAge = (createdAt) => {
    if (!createdAt) return 'N/A'
    
    const now = new Date()
    const created = new Date(createdAt)
    const diffTime = Math.abs(now - created)
    const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24))
    // Add 1 to diffDays so today shows as "1 day", tomorrow as "2 days", etc.
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

  if (loading) {
    return (
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        style={{
          position: 'fixed',
          top: '0',
          left: isNavExpanded ? '240px' : '60px',
          width: `calc(100% - ${isNavExpanded ? '240px' : '60px'})`,
          height: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 10,
          transition: 'left 0.3s ease, width 0.3s ease',
        }}
      >
        <p style={{ color: currentTheme.text, fontSize: '1.2rem' }}>Loading statistics...</p>
      </motion.div>
    )
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

  // Calculate ratings stats
  const ratingsStats = ratingsData ? (() => {
    const ratingValues = Object.values(ratingsData)
    const totalRatings = ratingValues.length
    const averageRating = totalRatings > 0 
      ? ratingValues.reduce((sum, r) => sum + (typeof r === 'number' ? r : 0), 0) / totalRatings 
      : 0
    const ratingDistribution = {}
    ratingValues.forEach(r => {
      const rating = typeof r === 'number' ? r : 0
      ratingDistribution[rating] = (ratingDistribution[rating] || 0) + 1
    })

    // Calculate favorite provider and favorite model
    // Ratings are stored with keys like "provider-model-timestamp-random"
    // ResponseId format: `${modelId}-${Date.now()}-${random}`
    // where modelId is "provider-model"
    // Extract provider and model from rating keys
    const providerRatings = {}
    const modelRatings = {}
    
    Object.entries(ratingsData).forEach(([key, rating]) => {
      if (typeof rating !== 'number') return
      
      // Extract model identifier from key (format: "provider-model-timestamp-random")
      // The timestamp is a long number (13 digits), and the random part is alphanumeric
      // So we can find the timestamp by looking for a long numeric part
      const parts = key.split('-')
      if (parts.length >= 2) {
        // Find the timestamp (long numeric part, typically 13 digits)
        let timestampIndex = -1
        for (let i = 0; i < parts.length; i++) {
          if (/^\d{10,}$/.test(parts[i])) {
            // Found a long numeric part (timestamp)
            timestampIndex = i
            break
          }
        }
        
        if (timestampIndex > 0) {
          // We found a timestamp, so everything before it is the model identifier
          const modelId = parts.slice(0, timestampIndex).join('-')
          const firstDashIndex = modelId.indexOf('-')
          if (firstDashIndex > 0) {
            const provider = modelId.substring(0, firstDashIndex)
            const modelName = modelId.substring(firstDashIndex + 1)
            const modelKey = `${provider}-${modelName}`
            
            // Add to provider ratings
            if (!providerRatings[provider]) {
              providerRatings[provider] = []
            }
            providerRatings[provider].push(rating)
            
            // Add to model ratings
            if (!modelRatings[modelKey]) {
              modelRatings[modelKey] = []
            }
            modelRatings[modelKey].push(rating)
          }
        } else if (parts.length >= 2) {
          // Fallback: assume format is "provider-model-..." and take first two parts
          const provider = parts[0]
          const modelName = parts[1]
          const modelKey = `${provider}-${modelName}`
          
          // Add to provider ratings
          if (!providerRatings[provider]) {
            providerRatings[provider] = []
          }
          providerRatings[provider].push(rating)
          
          // Add to model ratings
          if (!modelRatings[modelKey]) {
            modelRatings[modelKey] = []
          }
          modelRatings[modelKey].push(rating)
        }
      }
    })
    
    // Calculate average rating per provider
    const providerAverages = {}
    Object.entries(providerRatings).forEach(([provider, ratings]) => {
      const avg = ratings.reduce((sum, r) => sum + r, 0) / ratings.length
      providerAverages[provider] = avg
    })
    
    // Calculate average rating per model
    const modelAverages = {}
    Object.entries(modelRatings).forEach(([modelKey, ratings]) => {
      const avg = ratings.reduce((sum, r) => sum + r, 0) / ratings.length
      modelAverages[modelKey] = avg
    })
    
    // Find favorite provider (highest average rating)
    let favoriteProvider = null
    let favoriteProviderAvg = 0
    Object.entries(providerAverages).forEach(([provider, avg]) => {
      if (avg > favoriteProviderAvg) {
        favoriteProviderAvg = avg
        favoriteProvider = provider
      }
    })
    
    // Find favorite model (highest average rating)
    let favoriteModel = null
    let favoriteModelAvg = 0
    Object.entries(modelAverages).forEach(([modelKey, avg]) => {
      if (avg > favoriteModelAvg) {
        favoriteModelAvg = avg
        favoriteModel = modelKey
      }
    })
    
    return { 
      totalRatings, 
      averageRating, 
      distribution: ratingDistribution,
      favoriteProvider,
      favoriteProviderAvg,
      favoriteModel,
      favoriteModelAvg
    }
  })() : { 
    totalRatings: 0, 
    averageRating: 0, 
    distribution: {},
    favoriteProvider: null,
    favoriteProviderAvg: 0,
    favoriteModel: null,
    favoriteModelAvg: 0
  }

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      style={{
        position: 'fixed',
        top: '0',
        left: isNavExpanded ? '240px' : '60px',
        width: `calc(100% - ${isNavExpanded ? '240px' : '60px'})`,
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        padding: '40px',
        overflowY: 'auto',
        zIndex: 10,
        color: currentTheme.text,
        transition: 'left 0.3s ease, width 0.3s ease',
      }}
    >
      <div
        style={{
          width: '100%',
          maxWidth: '1200px',
          margin: '0 auto',
        }}
      >
        {/* Profile Header */}
        <div style={{ marginBottom: '32px' }}>
          {isViewingOther && (
            <motion.button
              onClick={() => clearViewingProfile()}
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                padding: '8px 16px',
                background: currentTheme.buttonBackground,
                border: `1px solid ${currentTheme.borderLight}`,
                borderRadius: '10px',
                color: currentTheme.accent,
                fontSize: '0.9rem',
                fontWeight: '500',
                cursor: 'pointer',
                marginBottom: '16px',
              }}
            >
              <ArrowLeft size={16} />
              Back to My Profile
            </motion.button>
          )}

          {/* Instagram-style profile card */}
          {(() => {
            const profileData = isViewingOther ? publicProfile : ownProfileData
            const displayUsername = isViewingOther
              ? (publicProfile?.username || viewingProfile?.username || 'User')
              : (currentUser?.username || 'You')
            const displayBio = profileData?.bio || ''
            const displayImage = profileData?.profileImage || null
            const followersCount = profileData?.followersCount || 0
            const followingCount = profileData?.followingCount || 0
            const postsCount = profileData?.leaderboard?.totalPosts || 0
            const isFollowing = publicProfile?.isFollowing || false
            const memberSince = profileData?.createdAt || stats?.createdAt

            return (
              <div style={{
                display: 'flex',
                flexDirection: 'column',
                gap: '20px',
                padding: '28px',
                background: currentTheme.buttonBackground,
                border: `1px solid ${currentTheme.borderLight}`,
                borderRadius: '16px',
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '24px', flexWrap: 'wrap' }}>
                  {/* Avatar */}
                  <div style={{
                    width: '88px',
                    height: '88px',
                    borderRadius: '50%',
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
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap', marginBottom: '8px' }}>
                      <h2 style={{
                        fontSize: '1.5rem',
                        fontWeight: '700',
                        margin: 0,
                        color: currentTheme.text,
                      }}>
                        {displayUsername}
                      </h2>

                      {/* Follow button disabled - social features temporarily removed */}
                      {isViewingOther ? null : (
                        <motion.button
                          onClick={() => {
                            setEditBio(ownProfileData?.bio || '')
                            setEditIsAnonymous(ownProfileData?.isAnonymous || false)
                            setEditIsPrivate(ownProfileData?.isPrivate || false)
                            setEditProfileImage(ownProfileData?.profileImage || null)
                            setShowEditProfile(true)
                          }}
                          whileHover={{ scale: 1.03 }}
                          whileTap={{ scale: 0.97 }}
                          style={{
                            padding: '6px 16px',
                            background: 'transparent',
                            border: `1px solid ${currentTheme.borderLight}`,
                            borderRadius: '8px',
                            color: currentTheme.textSecondary,
                            fontSize: '0.85rem',
                            fontWeight: '500',
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '6px',
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
                        fontSize: '0.9rem',
                        lineHeight: '1.5',
                        margin: 0,
                        whiteSpace: 'pre-wrap',
                        wordBreak: 'break-word',
                      }}>
                        {displayBio}
                      </p>
                    )}

                    {memberSince && (
                      <p style={{ color: currentTheme.textMuted || currentTheme.textSecondary, fontSize: '0.78rem', margin: '4px 0 0 0' }}>
                        Member for {formatAccountAge(memberSince)}
                      </p>
                    )}
                  </div>
                </div>
              </div>
            )
          })()}
        </div>

        {/* Tab Buttons — evenly distributed (hidden when viewing another user's profile) */}
        {!isViewingOther && (
        <div
          style={{
            display: 'flex',
            marginBottom: '32px',
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
              fontSize: '1rem',
              fontWeight: activeTab === 'tokens' ? '600' : '400',
              cursor: 'pointer',
              transition: 'all 0.2s ease',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '8px',
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
              fontSize: '1rem',
              fontWeight: activeTab === 'badges' ? '600' : '400',
              cursor: 'pointer',
              transition: 'all 0.2s ease',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '8px',
            }}
          >
            <Award size={20} />
            Badges
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
              fontSize: '1rem',
              fontWeight: activeTab === 'ratings' ? '600' : '400',
              cursor: 'pointer',
              transition: 'all 0.2s ease',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '8px',
            }}
          >
            <Star size={20} />
            Ratings & Models
          </button>
          {/* DISABLED: Messages & Notifications tab temporarily removed (social media feature) */}
          {/* DISABLED: My Posts tab temporarily removed (social media feature) */}
        </div>
        )}

        {/* Tab Content */}
        <AnimatePresence mode="popLayout">
          {activeTab === 'tokens' && (
            <motion.div
              key="tokens"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.15 }}
            >
        {/* Remaining Free Allocation with Counters */}
        <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '40px' }}>
          <div
            style={{
              background: currentTheme.backgroundOverlay,
              border: `1px solid ${currentTheme.borderLight}`,
              borderRadius: '16px',
              padding: '30px',
              display: 'flex',
              flexDirection: 'column',
              width: '100%',
              maxWidth: '1200px',
            }}
          >
            {/* Header with Percentage */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '24px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                <TrendingUp size={32} color={currentTheme.accentSecondary} />
                <div>
                  <h2 style={{ fontSize: '1.2rem', color: currentTheme.text, margin: '0 0 4px 0' }}>
                    Monthly Usage
                  </h2>
                  <p style={{ fontSize: '0.85rem', color: (userStats.usagePercentUsed || 0) > 0 ? '#f0a050' : currentTheme.textMuted, margin: '0 0 4px 0', fontStyle: 'italic' }}>
                    {(userStats.usagePercentUsed || 0).toFixed(1)}% of allocation used
                  </p>
                  {(userStats.usagePercentUsed || 0) > 100 && (
                    <p style={{ fontSize: '0.85rem', color: '#ff6b6b', margin: '0 0 4px 0', fontStyle: 'italic' }}>
                      Over allocation
                    </p>
                  )}
                  {(userStats.purchasedCreditsPercent || 0) > 0 && (
                    <p style={{ fontSize: '0.85rem', color: '#00cc66', margin: 0, fontStyle: 'italic' }}>
                      Includes {(userStats.purchasedCreditsPercent || 0).toFixed(1)}% from purchased credits
                    </p>
                  )}
                </div>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '8px' }}>
                <p
                  key={`usage-balance-${theme}`}
                  style={{
                    fontSize: '3rem',
                    fontWeight: 'bold',
                    background: currentTheme.accentGradient,
                    WebkitBackgroundClip: 'text',
                    WebkitTextFillColor: 'transparent',
                    margin: 0,
                    whiteSpace: 'nowrap',
                    display: 'flex',
                    alignItems: 'baseline',
                    gap: '8px',
                  }}
                >
                  {Math.max(0, userStats.usagePercentRemaining ?? 100).toFixed(1)}%
                  <span style={{ fontSize: '1.2rem', fontWeight: '500' }}>remaining</span>
                </p>
                
                {userPlan !== 'free_trial' && (
                  <button
                    onClick={() => setShowBuyUsageModal(true)}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '8px',
                      padding: '10px 16px',
                      borderRadius: '8px',
                      border: `1px solid ${currentTheme.accent}`,
                      background: currentTheme.buttonBackground,
                      color: currentTheme.accent,
                      fontSize: '0.85rem',
                      fontWeight: '500',
                      cursor: 'pointer',
                      transition: 'all 0.2s ease',
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.background = currentTheme.buttonBackgroundHover
                      e.currentTarget.style.borderColor = currentTheme.accentSecondary
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.background = currentTheme.buttonBackground
                      e.currentTarget.style.borderColor = currentTheme.accent
                    }}
                  >
                    <ShoppingCart size={16} />
                    Buy More Usage
                  </button>
                )}
                {userPlan === 'free_trial' && (userStats.totalAvailableBalance ?? userStats.remainingFreeAllocation ?? 0) <= 0 && (
                  <div style={{
                    padding: '10px 16px',
                    borderRadius: '8px',
                    background: 'rgba(255, 170, 0, 0.1)',
                    border: '1px solid rgba(255, 170, 0, 0.3)',
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    gap: '6px',
                  }}>
                    <span style={{ color: '#ffaa00', fontSize: '0.8rem', fontWeight: '600', textAlign: 'center' }}>
                      Usage limit reached — upgrade to Pro or Premium
                    </span>
                  </div>
                )}
                
                {/* Extra Purchased Credits Balance */}
                {(userStats.purchasedCreditsPercent || 0) > 0 && (
                  <div
                    style={{
                      background: 'rgba(0, 200, 100, 0.15)',
                      border: '1px solid rgba(0, 200, 100, 0.3)',
                      borderRadius: '8px',
                      padding: '8px 12px',
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'flex-end',
                    }}
                  >
                    <p style={{ fontSize: '0.7rem', color: currentTheme.textSecondary, margin: '0 0 2px 0' }}>
                      Extra Purchased Credits
                    </p>
                    <p
                      key={`purchased-credits-${theme}`}
                      style={{
                        fontSize: '1.2rem',
                        fontWeight: 'bold',
                        background: 'linear-gradient(90deg, #00cc66, #00aa88)',
                        WebkitBackgroundClip: 'text',
                        WebkitTextFillColor: 'transparent',
                        margin: 0,
                      }}
                    >
                      {(userStats.purchasedCreditsPercent || 0).toFixed(1)}%
                    </p>
                  </div>
                )}
                
              </div>
            </div>

            {/* Main Content: Counters and Bar Graph */}
            <div style={{ display: 'flex', gap: '24px', alignItems: 'flex-start' }}>
              {/* Left Side: Token Counters */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', minWidth: '200px' }}>
                {/* Total Tokens */}
                <div
                  style={{
                    background: currentTheme.backgroundOverlay,
                    border: `1px solid ${currentTheme.borderLight}`,
                    borderRadius: '12px',
                    padding: '20px',
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
                    <Database size={20} color={currentTheme.accent} />
                    <h3 style={{ fontSize: '0.9rem', color: currentTheme.textSecondary, margin: 0 }}>Total Tokens</h3>
                  </div>
                  <p
                    key={`total-tokens-${theme}`}
                    style={{
                      fontSize: '1.5rem',
                      fontWeight: 'bold',
                      background: currentTheme.accentGradient,
                      WebkitBackgroundClip: 'text',
                      WebkitTextFillColor: 'transparent',
                      color: currentTheme.accent,
                      margin: 0,
                      display: 'inline-block',
                    }}
                  >
                    {formatTokens(userStats.totalTokens)}
                  </p>
                </div>

                {/* Tokens This Month */}
                <div
                  style={{
                    background: currentTheme.backgroundOverlay,
                    border: '1px solid rgba(72, 201, 176, 0.3)',
                    borderRadius: '12px',
                    padding: '20px',
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
                    <Database size={20} color={currentTheme.accentSecondary} />
                    <h3 style={{ fontSize: '0.9rem', color: currentTheme.textSecondary, margin: 0 }}>Tokens This Month</h3>
                  </div>
                  <p
                    key={`tokens-this-month-${theme}`}
                    style={{
                      fontSize: '1.5rem',
                      fontWeight: 'bold',
                      background: currentTheme.accentGradient,
                      WebkitBackgroundClip: 'text',
                      WebkitTextFillColor: 'transparent',
                      color: currentTheme.accent,
                      margin: 0,
                      display: 'inline-block',
                    }}
                  >
                    {formatTokens(userStats.monthlyTokens)}
                  </p>
                </div>
              </div>

              {/* Center: Daily Usage Bar Graph */}
              <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
                <p style={{ fontSize: '0.9rem', color: currentTheme.textSecondary, marginBottom: '4px', textAlign: 'center' }}>
                  Daily Usage Percentage (This Month)
                </p>
                {(userStats.usagePercentUsed || 0) > 0 && (
                  <p style={{ fontSize: '0.7rem', color: currentTheme.textMuted, marginBottom: '10px', textAlign: 'center' }}>
                    {(userStats.usagePercentUsed || 0).toFixed(1)}% used this month
                    {(userStats.purchasedCreditsPercent || 0) > 0 && (
                      <span style={{ color: '#00cc66' }}> (includes purchased credits)</span>
                    )}
                  </p>
                )}
                <div style={{ display: 'flex', gap: '8px', height: '220px' }}>
                  {/* Y-axis labels (percentage scale) */}
                  <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'space-between', paddingRight: '8px', minWidth: '40px' }}>
                    {[100, 75, 50, 25, 0].map((value) => (
                      <span
                        key={value}
                        style={{
                          fontSize: '0.7rem',
                          color: currentTheme.textMuted,
                          textAlign: 'right',
                        }}
                      >
                        {value}%
                      </span>
                    ))}
                  </div>

                  {/* Bar Graph Container */}
                  <div
                    style={{
                      flex: 1,
                      display: 'flex',
                      flexDirection: 'column',
                      position: 'relative',
                    }}
                  >
                    {/* Bars Area */}
                    <div
                      style={{
                        display: 'flex',
                        alignItems: 'flex-end',
                        justifyContent: 'space-between',
                        gap: '4px',
                        height: '180px',
                        padding: '12px',
                        background: currentTheme.backgroundSecondary,
                        borderRadius: '8px',
                        position: 'relative',
                      }}
                    >
                      {(userStats.dailyUsage || []).map((day, index) => {
                        const percentage = day.percentage || 0
                        const barHeight = Math.max(2, (percentage / 100) * 156) // Max height 156px (180px - 24px padding), min 2px
                        const nowLocal = new Date()
                        const localToday = `${nowLocal.getFullYear()}-${String(nowLocal.getMonth() + 1).padStart(2, '0')}-${String(nowLocal.getDate()).padStart(2, '0')}`
                        const isToday = localToday === day.date
                        const isHovered = hoveredDay === day.date
                        
                        return (
                          <div
                            key={day.date || index}
                            style={{
                              flex: 1,
                              display: 'flex',
                              flexDirection: 'column',
                              alignItems: 'center',
                              justifyContent: 'flex-end',
                              gap: '2px',
                              minWidth: '0',
                              position: 'relative',
                            }}
                            onMouseEnter={() => setHoveredDay(day.date)}
                            onMouseLeave={() => setHoveredDay(null)}
                          >
                            {/* Hover Tooltip */}
                            {isHovered && (
                              <div
                                style={{
                                  position: 'absolute',
                                  bottom: `${barHeight + 8}px`,
                                  left: '50%',
                                  transform: 'translateX(-50%)',
                                  background: currentTheme.backgroundOverlay,
                                  border: `1px solid ${currentTheme.borderActive}`,
                                  borderRadius: '6px',
                                  padding: '6px 10px',
                                  fontSize: '0.75rem',
                                  color: currentTheme.accent,
                                  fontWeight: 'bold',
                                  whiteSpace: 'nowrap',
                                  zIndex: 20,
                                  pointerEvents: 'none',
                                  boxShadow: `0 4px 12px ${currentTheme.shadow}`,
                                  textAlign: 'center',
                                }}
                              >
                                <div>{percentage.toFixed(1)}% used</div>
                              </div>
                            )}
                            
                            {/* Percentage label at top of bar */}
                            {percentage > 0 && !isHovered && (
                              <div
                                style={{
                                  position: 'absolute',
                                  bottom: `${barHeight + 4}px`,
                                  left: '50%',
                                  transform: 'translateX(-50%)',
                                  fontSize: '0.65rem',
                                  color: isToday ? currentTheme.accentSecondary : currentTheme.accent,
                                  fontWeight: 'bold',
                                  whiteSpace: 'nowrap',
                                  zIndex: 10,
                                }}
                              >
                                {percentage.toFixed(1)}%
                              </div>
                            )}
                            
                            {/* Bar */}
                            <div
                              style={{
                                width: '100%',
                                height: `${barHeight}px`,
                                background: percentage > 0
                                  ? isToday
                                    ? currentTheme.accentGradient
                                    : currentTheme.accentGradient
                                  : currentTheme.backgroundOverlayLighter,
                                borderRadius: '2px 2px 0 0',
                                transition: 'all 0.3s ease',
                                cursor: 'pointer',
                                position: 'relative',
                              }}
                              onMouseEnter={(e) => {
                                if (percentage > 0) {
                                  e.currentTarget.style.opacity = '0.8'
                                  e.currentTarget.style.transform = 'scaleY(1.1)'
                                }
                              }}
                              onMouseLeave={(e) => {
                                e.currentTarget.style.opacity = '1'
                                e.currentTarget.style.transform = 'scaleY(1)'
                              }}
                            />
                          </div>
                        )
                      })}
                    </div>

                    {/* X-axis labels (days) */}
                    <div
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        gap: '4px',
                        padding: '8px 12px 0 12px',
                        marginTop: '4px',
                      }}
                    >
                      {(userStats.dailyUsage || []).map((day, index) => {
                        const nowLocal = new Date()
                        const localToday = `${nowLocal.getFullYear()}-${String(nowLocal.getMonth() + 1).padStart(2, '0')}-${String(nowLocal.getDate()).padStart(2, '0')}`
                        const isToday = localToday === day.date
                        return (
                          <span
                            key={day.date || index}
                            style={{
                              flex: 1,
                              fontSize: '0.65rem',
                              color: isToday ? currentTheme.accentSecondary : currentTheme.textMuted,
                              fontWeight: isToday ? 'bold' : 'normal',
                              textAlign: 'center',
                              minWidth: '0',
                            }}
                          >
                            {day.day}
                          </span>
                        )
                      })}
                    </div>
                  </div>
                </div>
              </div>

              {/* Right Side: Prompt Counters */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', minWidth: '200px' }}>
                {/* Total Prompts */}
                <div
                  style={{
                    background: currentTheme.backgroundOverlay,
                    border: `1px solid ${currentTheme.borderLight}`,
                    borderRadius: '12px',
                    padding: '20px',
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
                    <MessageSquare size={20} color={currentTheme.accent} />
                    <h3 style={{ fontSize: '0.9rem', color: currentTheme.textSecondary, margin: 0 }}>Total Prompts</h3>
                  </div>
                  <p
                    key={`total-prompts-${theme}`}
                    style={{
                      fontSize: '2rem',
                      fontWeight: 'bold',
                      background: currentTheme.accentGradient,
                      WebkitBackgroundClip: 'text',
                      WebkitTextFillColor: 'transparent',
                      color: currentTheme.accent,
                      margin: 0,
                      display: 'inline-block',
                    }}
                  >
                    {formatNumber(userStats.totalPrompts || 0)}
                  </p>
                </div>

                {/* Prompts This Month */}
                <div
                  style={{
                    background: currentTheme.backgroundOverlay,
                    border: '1px solid rgba(72, 201, 176, 0.3)',
                    borderRadius: '12px',
                    padding: '20px',
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
                    <MessageSquare size={20} color={currentTheme.accentSecondary} />
                    <h3 style={{ fontSize: '0.9rem', color: currentTheme.textSecondary, margin: 0 }}>Prompts This Month</h3>
                  </div>
                  <p
                    key={`prompts-this-month-${theme}`}
                    style={{
                      fontSize: '2rem',
                      fontWeight: 'bold',
                      background: currentTheme.accentGradient,
                      WebkitBackgroundClip: 'text',
                      WebkitTextFillColor: 'transparent',
                      color: currentTheme.accent,
                      margin: 0,
                      display: 'inline-block',
                    }}
                  >
                    {formatNumber(userStats.monthlyPrompts || 0)}
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>

            </motion.div>
          )}

          {activeTab === 'ratings' && (
            <motion.div
              key="ratings"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.15 }}
            >
              {/* Ratings Section */}
              <div style={{ display: 'flex', gap: '20px', flexDirection: 'row', flexWrap: 'nowrap', marginBottom: '40px' }}>
                {/* Favorite Provider - Separate container */}
                <div style={{ 
                  background: currentTheme.backgroundOverlay, 
                  border: `1px solid ${currentTheme.borderLight}`,
                  padding: '28px', 
                  borderRadius: '16px',
                  flex: 1,
                  minWidth: '400px',
                  color: currentTheme.text,
                }}>
                  <p style={{ color: currentTheme.text, fontSize: '1rem', marginBottom: '16px' }}>Your Favorite Provider:</p>
                  {ratingsStats.totalRatings > 0 && ratingsStats.favoriteProvider ? (
                    <>
                      <p style={{ 
                        fontSize: '2rem', 
                        fontWeight: 'bold', 
                        margin: '0 0 12px 0',
                        color: currentTheme.text,
                      }}>
                        {LLM_PROVIDERS[ratingsStats.favoriteProvider]?.name || ratingsStats.favoriteProvider}
                      </p>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                        <p style={{ color: currentTheme.textSecondary, fontSize: '0.85rem', margin: 0 }}>Average Score:</p>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <p style={{ 
                            fontSize: '1.1rem', 
                            margin: 0,
                            color: currentTheme.text,
                          }}>
                            {ratingsStats.favoriteProviderAvg.toFixed(2)}
                          </p>
                          <Star size={20} fill="#FFD700" color="#FFD700" />
                          <p style={{ color: currentTheme.textSecondary, fontSize: '1.1rem', margin: 0 }}>
                            / 5
                          </p>
                        </div>
                      </div>
                    </>
                  ) : (
                    <>
                      <p style={{ color: currentTheme.textMuted, fontSize: '1.5rem', margin: '0 0 12px 0' }}>
                        Rate models first
                      </p>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                        <p style={{ color: currentTheme.textSecondary, fontSize: '0.85rem', margin: 0 }}>Average Score:</p>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <p style={{ color: currentTheme.textMuted, fontSize: '1.1rem', margin: 0 }}>
                            —
                          </p>
                          <Star size={20} fill="#FFD700" color="#FFD700" />
                          <p style={{ color: currentTheme.textSecondary, fontSize: '1.1rem', margin: 0 }}>
                            / 5
                          </p>
                        </div>
                      </div>
                    </>
                  )}
                </div>
                
                {/* Favorite Model - Separate container */}
                <div style={{ 
                  background: currentTheme.backgroundOverlay, 
                  border: `1px solid ${currentTheme.borderLight}`,
                  padding: '28px', 
                  borderRadius: '16px',
                  flex: 1,
                  minWidth: '400px',
                  color: currentTheme.text,
                }}>
                  <p style={{ color: currentTheme.text, fontSize: '1rem', marginBottom: '16px' }}>Your Favorite Model:</p>
                  {ratingsStats.totalRatings > 0 && ratingsStats.favoriteModel ? (
                    <>
                      <p style={{ 
                        fontSize: '2rem', 
                        fontWeight: 'bold', 
                        margin: '0 0 12px 0',
                        color: currentTheme.text,
                      }}>
                        {(() => {
                          const parts = ratingsStats.favoriteModel.split('-')
                          if (parts.length >= 2) {
                            const provider = parts[0]
                            const modelName = parts.slice(1).join('-')
                            return `${LLM_PROVIDERS[provider]?.name || provider} - ${modelName}`
                          }
                          return ratingsStats.favoriteModel
                        })()}
                      </p>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                        <p style={{ color: currentTheme.textSecondary, fontSize: '0.85rem', margin: 0 }}>Average Score:</p>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <p style={{ 
                            fontSize: '1.1rem', 
                            margin: 0,
                            color: currentTheme.text,
                          }}>
                            {ratingsStats.favoriteModelAvg.toFixed(2)}
                          </p>
                          <Star size={20} fill="#FFD700" color="#FFD700" />
                          <p style={{ color: currentTheme.textSecondary, fontSize: '1.1rem', margin: 0 }}>
                            / 5
                          </p>
                        </div>
                      </div>
                    </>
                  ) : (
                    <>
                      <p style={{ color: currentTheme.textMuted, fontSize: '1.5rem', margin: '0 0 12px 0' }}>
                        Rate models first
                      </p>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                        <p style={{ color: currentTheme.textSecondary, fontSize: '0.85rem', margin: 0 }}>Average Score:</p>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <p style={{ color: currentTheme.textMuted, fontSize: '1.1rem', margin: 0 }}>
                            —
                          </p>
                          <Star size={20} fill="#FFD700" color="#FFD700" />
                          <p style={{ color: currentTheme.textSecondary, fontSize: '1.1rem', margin: 0 }}>
                            / 5
                          </p>
                        </div>
                      </div>
                    </>
                  )}
                </div>
              </div>

              {/* Models Section - Merged from Models tab */}
              {Object.keys(userStats.providers || {}).length > 0 && (
                <div
                  style={{
                    background: currentTheme.backgroundOverlay,
                    border: `1px solid ${currentTheme.borderLight}`,
                    borderRadius: '16px',
                    padding: '30px',
                  }}
                >
                  <h2 key={`model-usage-title-${theme}`} style={{ color: currentTheme.accent, fontSize: '1.5rem', marginBottom: '24px', display: 'flex', alignItems: 'center', gap: '12px' }}>
                    <Cpu size={24} />
                    Model Usage
                  </h2>
                  <div key={`providers-list-${theme}`} style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    {Object.entries(userStats.providers)
                      .sort((a, b) => b[1].totalTokens - a[1].totalTokens)
                      .map(([provider, data]) => {
                        const isProviderExpanded = expandedProviders[provider]
                        const providerModels = Object.entries(userStats.models || {})
                          .filter(([modelKey]) => modelKey.startsWith(`${provider}-`))
                          .sort((a, b) => b[1].totalTokens - a[1].totalTokens)

                        return (
                          <div
                            key={`${provider}-${theme}`}
                            style={{
                              background: currentTheme.backgroundSecondary,
                              border: `1px solid ${currentTheme.borderLight}`,
                              borderRadius: '12px',
                              overflow: 'hidden',
                            }}
                          >
                            {/* Provider Header - Clickable */}
                            <div
                              key={`provider-header-${provider}-${theme}`}
                              onClick={() => {
                                setExpandedProviders((prev) => ({
                                  ...prev,
                                  [provider]: !prev[provider],
                                }))
                              }}
                              style={{
                                padding: '16px 20px',
                                cursor: 'pointer',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'space-between',
                                transition: 'background 0.2s',
                              }}
                              onMouseEnter={(e) => {
                                e.currentTarget.style.background = currentTheme.buttonBackgroundHover
                              }}
                              onMouseLeave={(e) => {
                                e.currentTarget.style.background = currentTheme.backgroundSecondary
                              }}
                            >
                              <div key={`provider-info-${provider}-${theme}`} style={{ display: 'flex', alignItems: 'center', gap: '12px', flex: 1 }}>
                                {isProviderExpanded ? (
                                  <ChevronDown size={20} color={currentTheme.accent} />
                                ) : (
                                  <ChevronRight size={20} color={currentTheme.accent} />
                                )}
                                <h3 key={`provider-name-${provider}-${theme}`} style={{ fontSize: '1.1rem', color: currentTheme.accent, margin: 0, textTransform: 'capitalize' }}>
                                  {provider}
                                </h3>
                                <span key={`provider-models-count-${provider}-${theme}`} style={{ color: currentTheme.textMuted, fontSize: '0.85rem', marginLeft: '8px' }}>
                                  ({providerModels.length} {providerModels.length === 1 ? 'model' : 'models'})
                                </span>
                              </div>
                              <div key={`provider-stats-${provider}-${theme}`} style={{ display: 'flex', gap: '24px', alignItems: 'center' }}>
                                <div style={{ textAlign: 'right' }}>
                                  <p key={`provider-prompts-label-${provider}-${theme}`} style={{ color: currentTheme.textSecondary, fontSize: '0.75rem', margin: 0 }}>Prompts</p>
                                  <p key={`provider-prompts-value-${provider}-${theme}`} style={{ color: currentTheme.accentSecondary, fontSize: '1rem', fontWeight: 'bold', margin: 0 }}>
                                    {formatNumber(data.totalPrompts || 0)}
                                  </p>
                                </div>
                                <div style={{ textAlign: 'right' }}>
                                  <p key={`provider-tokens-label-${provider}-${theme}`} style={{ color: currentTheme.textSecondary, fontSize: '0.75rem', margin: 0 }}>Tokens</p>
                                  <p key={`provider-tokens-value-${provider}-${theme}`} style={{ color: currentTheme.accent, fontSize: '1rem', fontWeight: 'bold', margin: 0 }}>
                                    {formatTokens((data.totalInputTokens || 0) + (data.totalOutputTokens || 0))}
                                  </p>
                                </div>
                              </div>
                            </div>

                            {/* Models List - Collapsible */}
                            <AnimatePresence>
                              {isProviderExpanded && providerModels.length > 0 && (
                                <motion.div
                                  key={`provider-models-expanded-${provider}-${theme}`}
                                  initial={{ height: 0, opacity: 0 }}
                                  animate={{ height: 'auto', opacity: 1 }}
                                  exit={{ height: 0, opacity: 0 }}
                                  transition={{ duration: 0.2 }}
                                  style={{ overflow: 'hidden' }}
                                >
                                  <div key={`provider-models-content-${provider}-${theme}`} style={{ padding: '12px 20px 20px 20px', borderTop: `1px solid ${currentTheme.borderLight}` }}>
                                    <div key={`provider-models-list-${provider}-${theme}`} style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                      {providerModels.map(([modelKey, modelData]) => {
                                        const isModelExpanded = expandedModels[modelKey]
                                        return (
                                          <div
                                            key={`${modelKey}-${theme}`}
                                            style={{
                                              background: currentTheme.buttonBackground,
                                              border: `1px solid ${currentTheme.borderLight}`,
                                              borderRadius: '8px',
                                              overflow: 'hidden',
                                            }}
                                          >
                                            {/* Model Header - Clickable */}
                                            <div
                                              key={`model-header-${modelKey}-${theme}`}
                                              onClick={(e) => {
                                                e.stopPropagation()
                                                setExpandedModels((prev) => ({
                                                  ...prev,
                                                  [modelKey]: !prev[modelKey],
                                                }))
                                              }}
                                              style={{
                                                padding: '12px 16px',
                                                cursor: 'pointer',
                                                display: 'flex',
                                                alignItems: 'center',
                                                justifyContent: 'space-between',
                                                transition: 'background 0.2s',
                                              }}
                                              onMouseEnter={(e) => {
                                                e.currentTarget.style.background = currentTheme.buttonBackgroundHover
                                              }}
                                              onMouseLeave={(e) => {
                                                e.currentTarget.style.background = currentTheme.backgroundSecondary
                                              }}
                                            >
                                              <div key={`model-info-${modelKey}-${theme}`} style={{ display: 'flex', alignItems: 'center', gap: '8px', flex: 1 }}>
                                                {isModelExpanded ? (
                                                  <ChevronDown size={16} color={currentTheme.textSecondary} />
                                                ) : (
                                                  <ChevronRight size={16} color={currentTheme.textSecondary} />
                                                )}
                                                <span key={`model-name-${modelKey}-${theme}`} style={{ color: currentTheme.textSecondary, fontSize: '0.9rem', fontWeight: '500' }}>
                                                  {modelData.model}
                                                </span>
                                              </div>
                                            </div>

                                            {/* Model Stats - Collapsible */}
                                            <AnimatePresence>
                                              {isModelExpanded && (
                                                <motion.div
                                                  key={`model-stats-expanded-${modelKey}-${theme}`}
                                                  initial={{ height: 0, opacity: 0 }}
                                                  animate={{ height: 'auto', opacity: 1 }}
                                                  exit={{ height: 0, opacity: 0 }}
                                                  transition={{ duration: 0.2 }}
                                                  style={{ overflow: 'hidden' }}
                                                >
                                                  <div
                                                    key={`model-stats-content-${modelKey}-${theme}`}
                                                    style={{
                                                      padding: '12px 16px 16px 40px',
                                                      background: currentTheme.backgroundSecondary,
                                                      borderTop: `1px solid ${currentTheme.borderLight}`,
                                                    }}
                                                  >
                                                    <div key={`model-stats-list-${modelKey}-${theme}`} style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                                      <div key={`model-prompts-row-${modelKey}-${theme}`} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                                        <span key={`model-prompts-label-${modelKey}-${theme}`} style={{ color: currentTheme.textSecondary, fontSize: '0.85rem' }}>Total Prompts:</span>
                                                        <span key={`model-prompts-value-${modelKey}-${theme}`} style={{ color: currentTheme.accentSecondary, fontSize: '0.9rem', fontWeight: 'bold' }}>
                                                          {formatNumber(modelData.totalPrompts || 0)}
                                                        </span>
                                                      </div>
                                                      <div key={`model-tokens-row-${modelKey}-${theme}`} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                                        <span key={`model-tokens-label-${modelKey}-${theme}`} style={{ color: currentTheme.textSecondary, fontSize: '0.85rem' }}>Total Tokens:</span>
                                                        <span key={`model-tokens-value-${modelKey}-${theme}`} style={{ color: currentTheme.accent, fontSize: '0.9rem', fontWeight: 'bold' }}>
                                                          {formatTokens((modelData.totalInputTokens || 0) + (modelData.totalOutputTokens || 0))}
                                                        </span>
                                                      </div>
                                                      <div key={`model-pricing-row-${modelKey}-${theme}`} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                                        <span key={`model-pricing-label-${modelKey}-${theme}`} style={{ color: currentTheme.textSecondary, fontSize: '0.85rem' }}>Pricing:</span>
                                                        <span
                                                          key={`model-pricing-value-${modelKey}-${theme}`}
                                                          style={{
                                                            color: modelData.pricing ? '#FFD700' : currentTheme.textMuted,
                                                            fontSize: '0.9rem',
                                                            fontWeight: modelData.pricing ? 'bold' : 'normal',
                                                          }}
                                                        >
                                                          {modelData.pricing !== null && modelData.pricing !== undefined
                                                            ? `$${modelData.pricing}`
                                                            : 'TBD'}
                                                        </span>
                                                      </div>
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
                              )}
                            </AnimatePresence>
                          </div>
                        )
                      })}
                  </div>
                </div>
              )}

              {Object.keys(userStats.providers || {}).length === 0 && (
                <div
                  style={{
                    background: currentTheme.backgroundOverlay,
                    border: `1px solid ${currentTheme.borderLight}`,
                    borderRadius: '16px',
                    padding: '40px',
                    textAlign: 'center',
                  }}
                >
                  <p style={{ color: currentTheme.textSecondary, fontSize: '1.1rem' }}>
                    No model statistics yet. Start using ArkiTek to see your usage data!
                  </p>
                </div>
              )}
            </motion.div>
          )}

          {activeTab === 'leaderboard' && !isFreePlan && (
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
                marginBottom: '24px',
                borderBottom: `1px solid ${currentTheme.borderLight}`,
              }}>
                <button
                  onClick={() => setNotifSubTab('messages')}
                  style={{
                    flex: 1,
                    padding: '12px',
                    background: notifSubTab === 'messages' ? currentTheme.buttonBackgroundActive : 'transparent',
                    border: 'none',
                    borderBottom: notifSubTab === 'messages' ? `2px solid ${currentTheme.accent}` : '2px solid transparent',
                    color: notifSubTab === 'messages' ? currentTheme.accent : currentTheme.textSecondary,
                    fontSize: '0.95rem',
                    fontWeight: notifSubTab === 'messages' ? '600' : '400',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '8px',
                    transition: 'all 0.2s ease',
                  }}
                >
                  <MessageCircle size={18} />
                  Messages / Groups
                </button>
                <button
                  onClick={() => setNotifSubTab('notifications')}
                  style={{
                    flex: 1,
                    padding: '12px',
                    background: notifSubTab === 'notifications' ? currentTheme.buttonBackgroundActive : 'transparent',
                    border: 'none',
                    borderBottom: notifSubTab === 'notifications' ? `2px solid ${currentTheme.accent}` : '2px solid transparent',
                    color: notifSubTab === 'notifications' ? currentTheme.accent : currentTheme.textSecondary,
                    fontSize: '0.95rem',
                    fontWeight: notifSubTab === 'notifications' ? '600' : '400',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '8px',
                    transition: 'all 0.2s ease',
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
                        fontWeight: '700',
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
                  borderRadius: '16px',
                  padding: '40px',
                  textAlign: 'center',
                }}>
                  <p style={{ color: currentTheme.textSecondary, fontSize: '1.1rem' }}>
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
                      borderRadius: '16px',
                      padding: '20px',
                      marginBottom: '20px',
                    }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '16px' }}>
                        <UserPlus size={20} color={currentTheme.accent} />
                        <h3 style={{ color: currentTheme.accent, fontSize: '1.1rem', margin: 0 }}>
                          Follow Requests
                        </h3>
                        <span style={{
                          background: currentTheme.accent,
                          color: '#fff',
                          fontSize: '0.75rem',
                          fontWeight: '700',
                          padding: '2px 8px',
                          borderRadius: '10px',
                          minWidth: '20px',
                          textAlign: 'center',
                        }}>
                          {followRequests.length}
                        </span>
                      </div>
                      {loadingFollowRequests ? (
                        <p style={{ color: currentTheme.textSecondary, fontSize: '0.9rem' }}>Loading...</p>
                      ) : (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                          {followRequests.map(req => (
                            <div key={req.userId} style={{
                              display: 'flex', alignItems: 'center', gap: '12px',
                              padding: '12px', borderRadius: '10px',
                              background: `${currentTheme.accent}08`,
                            }}>
                              <div style={{
                                width: '40px', height: '40px', borderRadius: '50%',
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
                                <p style={{ color: currentTheme.text, fontSize: '0.9rem', fontWeight: '600', margin: 0 }}>
                                  {req.username}
                                </p>
                                {req.bio && (
                                  <p style={{ color: currentTheme.textSecondary, fontSize: '0.78rem', margin: '2px 0 0 0', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                    {req.bio}
                                  </p>
                                )}
                              </div>
                              <div style={{ display: 'flex', gap: '8px', flexShrink: 0 }}>
                                <motion.button
                                  onClick={() => handleAcceptFollowRequest(req.userId)}
                                  disabled={processingRequestId === req.userId}
                                  whileHover={{ scale: 1.05 }}
                                  whileTap={{ scale: 0.95 }}
                                  style={{
                                    padding: '6px 16px', background: currentTheme.accentGradient,
                                    border: 'none', borderRadius: '8px', color: '#fff',
                                    fontSize: '0.8rem', fontWeight: '600', cursor: 'pointer',
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
                                    padding: '6px 16px', background: 'transparent',
                                    border: `1px solid ${currentTheme.borderLight}`, borderRadius: '8px',
                                    color: currentTheme.textSecondary, fontSize: '0.8rem', fontWeight: '500', cursor: 'pointer',
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
                    marginBottom: '16px',
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                      <Bell size={22} color={currentTheme.accent} />
                      <h3 style={{ color: currentTheme.text, fontSize: '1.2rem', margin: 0 }}>Notifications</h3>
                      {unreadNotifCount > 0 && (
                        <span style={{
                          background: '#ff6b6b',
                          color: '#fff',
                          fontSize: '0.72rem',
                          fontWeight: '700',
                          padding: '2px 7px',
                          borderRadius: '10px',
                        }}>
                          {unreadNotifCount} new
                        </span>
                      )}
                    </div>
                  </div>

                  {loadingNotifications ? (
                    <div style={{ textAlign: 'center', padding: '40px' }}>
                      <p style={{ color: currentTheme.textSecondary, fontSize: '1rem' }}>Loading notifications...</p>
                    </div>
                  ) : notifications.length === 0 ? (
                    <div style={{
                      background: currentTheme.backgroundOverlay,
                      border: `1px solid ${currentTheme.borderLight}`,
                      borderRadius: '16px',
                      padding: '40px',
                      textAlign: 'center',
                    }}>
                      <Bell size={40} color={currentTheme.textMuted} style={{ marginBottom: '12px', opacity: 0.4 }} />
                      <p style={{ color: currentTheme.textSecondary, fontSize: '1rem', margin: '0 0 6px 0' }}>No notifications yet</p>
                      <p style={{ color: currentTheme.textMuted, fontSize: '0.85rem', margin: 0 }}>
                        When people like, comment on, or follow you, you'll see it here.
                      </p>
                    </div>
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                      {notifications.map((notif) => {
                        const notifIcon = {
                          like: <Heart size={16} color="#ff6b6b" fill="#ff6b6b" />,
                          comment: <MessageSquare size={16} color={currentTheme.accent} />,
                          reply: <MessageSquare size={16} color="#a78bfa" />,
                          follow: <UserPlus size={16} color="#22c55e" />,
                          follow_request: <UserPlus size={16} color={currentTheme.accent} />,
                          follow_accepted: <UserCheck size={16} color="#22c55e" />,
                        }[notif.type] || <Bell size={16} color={currentTheme.textSecondary} />

                        const notifText = {
                          like: 'liked your prompt',
                          comment: 'commented on your prompt',
                          reply: 'replied to your comment',
                          follow: 'started following you',
                          follow_request: 'requested to follow you',
                          follow_accepted: 'accepted your follow request',
                        }[notif.type] || 'interacted with you'

                        return (
                          <div key={notif._id} style={{
                            display: 'flex', alignItems: 'flex-start', gap: '12px',
                            padding: '14px 16px', borderRadius: '12px',
                            background: notif.read ? 'transparent' : `${currentTheme.accent}08`,
                            border: notif.read ? 'none' : `1px solid ${currentTheme.accent}15`,
                            transition: 'background 0.2s',
                          }}>
                            <div style={{
                              width: '36px', height: '36px', borderRadius: '50%',
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
                                <span style={{ fontWeight: '600' }}>{notif.fromUsername}</span>{' '}
                                {notifText}
                              </p>
                              {notif.promptText && (
                                <p style={{ color: currentTheme.textSecondary, fontSize: '0.8rem', margin: '4px 0 0 0', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                  "{notif.promptText}"
                                </p>
                              )}
                              {notif.commentText && (
                                <p style={{ color: currentTheme.textSecondary, fontSize: '0.8rem', margin: '4px 0 0 0', fontStyle: 'italic' }}>
                                  "{notif.commentText}"
                                </p>
                              )}
                              <p style={{ color: currentTheme.textMuted, fontSize: '0.72rem', margin: '4px 0 0 0' }}>
                                {(() => {
                                  const d = new Date(notif.createdAt)
                                  const now = new Date()
                                  const diff = now - d
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
                                  borderRadius: '8px',
                                  color: '#fff',
                                  fontSize: '0.76rem',
                                  fontWeight: '600',
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
                                fontWeight: '500',
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
          )}

          {activeTab === 'badges' && !isViewingOther && (
            <motion.div
              key="badges"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.15 }}
            >
              {(() => {
                // Compute badge progress from all available stats
                const providers = isViewingOther ? {} : (userStats.providers || {})
                const earnedBadgesList = isViewingOther ? (publicProfile?.earnedBadges || []) : (userStats.earnedBadges || [])
                const persistedBadges = new Set(earnedBadgesList)
                const badgeStats = {
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

                const newlyEarned = [] // Track badges earned this render to persist

                const badgeProgress = BADGE_CATEGORIES.map(category => {
                  const currentValue = badgeStats[category.statKey] || 0
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

                // Save any newly earned badges to backend (fire-and-forget) — only for own profile, not free plan
                if (newlyEarned.length > 0 && currentUser?.id && !isViewingOther && !isFreePlan) {
                  axios.post(`${API_URL}/api/stats/${currentUser.id}/badges`, { newBadges: newlyEarned })
                    .then(() => console.log(`[Badges] Persisted ${newlyEarned.length} new badges`))
                    .catch(err => console.error('[Badges] Error saving badges:', err))
                }

                const totalEarned = badgeProgress.reduce((sum, cat) => sum + cat.earnedCount, 0)
                const totalBadges = badgeProgress.reduce((sum, cat) => sum + cat.totalCount, 0)

                // The ultimate 100th badge - "The Architect" - earned by collecting all 99 other badges
                const allOtherBadgesEarned = totalEarned >= (totalBadges)
                const ultimateBadge = {
                  name: 'The Architect',
                  emoji: '🌌',
                  color: '#FFD700',
                  desc: 'Earn all badges to become The Architect',
                  earned: allOtherBadgesEarned,
                }

                return (
                  <>
                    {/* Daily Challenge Card */}
                    <div style={{
                      background: isFreePlan ? 'rgba(255,255,255,0.02)' : 'linear-gradient(135deg, rgba(255, 170, 0, 0.08), rgba(255, 100, 0, 0.05))',
                      border: `1px solid ${isFreePlan ? 'rgba(255,255,255,0.06)' : 'rgba(255, 170, 0, 0.25)'}`,
                      borderRadius: '16px',
                      padding: '24px',
                      marginBottom: '24px',
                      position: 'relative',
                      overflow: 'hidden',
                    }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '16px' }}>
                        <div style={{
                          width: '44px',
                          height: '44px',
                          borderRadius: '50%',
                          background: isFreePlan ? 'rgba(255,255,255,0.05)' : 'rgba(255, 170, 0, 0.15)',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                        }}>
                          <Zap size={22} color={isFreePlan ? '#666' : '#ffaa00'} />
                        </div>
                        <div>
                          <h3 style={{ fontSize: '1.1rem', fontWeight: '700', color: isFreePlan ? '#666' : '#ffaa00', margin: 0 }}>
                            Daily Challenge
                          </h3>
                          <p style={{ fontSize: '0.8rem', color: currentTheme.textMuted, margin: 0 }}>
                            Complete the challenge to earn bonus usage
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
                              borderRadius: '8px',
                              background: 'rgba(0, 200, 100, 0.15)',
                              border: '1px solid rgba(0, 200, 100, 0.3)',
                              color: '#00cc66',
                              fontSize: '0.85rem',
                              fontWeight: '600',
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
                          gap: '12px',
                          padding: '20px',
                          background: 'rgba(255,255,255,0.02)',
                          borderRadius: '12px',
                          border: '1px solid rgba(255,255,255,0.06)',
                        }}>
                          <Lock size={28} color="#666" />
                          <p style={{ color: '#888', fontSize: '0.9rem', textAlign: 'center', margin: 0 }}>
                            Upgrade to Pro or Premium to participate in daily challenges and earn bonus usage
                          </p>
                          {dailyChallengeData?.challenge && (
                            <div style={{ opacity: 0.4, textAlign: 'center', marginTop: '8px' }}>
                              <p style={{ color: currentTheme.textSecondary, fontSize: '0.85rem', fontWeight: '600', margin: '0 0 4px 0' }}>
                                Today's Challenge: {dailyChallengeData.challenge.title}
                              </p>
                              <p style={{ color: currentTheme.textMuted, fontSize: '0.8rem', margin: 0 }}>
                                {dailyChallengeData.challenge.description}
                              </p>
                            </div>
                          )}
                        </div>
                      ) : dailyChallengeData?.challenge ? (
                        <div style={{
                          background: 'rgba(255, 170, 0, 0.06)',
                          borderRadius: '12px',
                          padding: '20px',
                          border: '1px solid rgba(255, 170, 0, 0.12)',
                        }}>
                          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
                            <div>
                              <p style={{ color: '#ffaa00', fontSize: '1rem', fontWeight: '700', margin: '0 0 4px 0' }}>
                                {dailyChallengeData.challenge.title}
                              </p>
                              <p style={{ color: currentTheme.textSecondary, fontSize: '0.85rem', margin: 0 }}>
                                {dailyChallengeData.challenge.description}
                              </p>
                            </div>
                            <div style={{ textAlign: 'right', flexShrink: 0, marginLeft: '16px' }}>
                              <p style={{ color: '#00cc66', fontSize: '0.85rem', fontWeight: '600', margin: '0 0 2px 0' }}>
                                +{dailyChallengeData.percentageReward || 0}% usage
                              </p>
                              <p style={{ color: currentTheme.textMuted, fontSize: '0.7rem', margin: 0 }}>
                                reward
                              </p>
                            </div>
                          </div>
                          {/* Progress bar */}
                          <div style={{
                            width: '100%',
                            height: '8px',
                            background: 'rgba(255,255,255,0.06)',
                            borderRadius: '4px',
                            overflow: 'hidden',
                            marginBottom: '12px',
                          }}>
                            <div style={{
                              width: `${Math.min(100, (dailyChallengeData.challenge.progress / dailyChallengeData.challenge.threshold) * 100)}%`,
                              height: '100%',
                              background: dailyChallengeData.challenge.met ? 'linear-gradient(90deg, #00cc66, #00e676)' : 'linear-gradient(90deg, #ffaa00, #ff8800)',
                              borderRadius: '4px',
                              transition: 'width 0.5s ease',
                            }} />
                          </div>
                          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                            <span style={{ color: currentTheme.textMuted, fontSize: '0.8rem' }}>
                              {dailyChallengeData.challenge.progress} / {dailyChallengeData.challenge.threshold}
                            </span>
                            {dailyChallengeData.claimed ? (
                              <div style={{
                                padding: '8px 18px',
                                borderRadius: '8px',
                                background: 'rgba(0, 200, 100, 0.1)',
                                border: '1px solid rgba(0, 200, 100, 0.3)',
                                color: '#00cc66',
                                fontSize: '0.85rem',
                                fontWeight: '600',
                              }}>
                                Claimed
                              </div>
                            ) : (
                              <button
                                onClick={claimDailyChallenge}
                                disabled={!dailyChallengeData.challenge.met || claimingChallenge}
                                style={{
                                  padding: '8px 18px',
                                  borderRadius: '8px',
                                  background: dailyChallengeData.challenge.met ? 'linear-gradient(135deg, #ffaa00, #ff8800)' : 'rgba(255,255,255,0.05)',
                                  border: 'none',
                                  color: dailyChallengeData.challenge.met ? '#000' : '#666',
                                  fontSize: '0.85rem',
                                  fontWeight: '600',
                                  cursor: dailyChallengeData.challenge.met ? 'pointer' : 'not-allowed',
                                  opacity: claimingChallenge ? 0.6 : 1,
                                  transition: 'all 0.2s ease',
                                }}
                              >
                                {claimingChallenge ? 'Claiming...' : dailyChallengeData.challenge.met ? 'Claim Reward' : 'In Progress'}
                              </button>
                            )}
                          </div>
                        </div>
                      ) : (
                        <div style={{ textAlign: 'center', padding: '16px', color: currentTheme.textMuted, fontSize: '0.9rem' }}>
                          Loading challenge...
                        </div>
                      )}
                    </div>

                    {/* Free Plan Overlay for Badge Content */}
                    {isFreePlan && (
                      <div style={{
                        background: 'rgba(255, 170, 0, 0.06)',
                        border: '1px solid rgba(255, 170, 0, 0.2)',
                        borderRadius: '12px',
                        padding: '20px',
                        marginBottom: '24px',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '16px',
                        textAlign: 'center',
                        flexDirection: 'column',
                      }}>
                        <Lock size={24} color="#ffaa00" />
                        <div>
                          <p style={{ color: '#ffaa00', fontSize: '1rem', fontWeight: '600', margin: '0 0 6px 0' }}>
                            Upgrade to Earn Badges & Rewards
                          </p>
                          <p style={{ color: currentTheme.textMuted, fontSize: '0.85rem', margin: 0, lineHeight: 1.5 }}>
                            Free plan users can preview badges and tiers below, but you need a Pro or Premium plan to earn badges, unlock tier rewards, receive monthly gifts, and complete daily challenges.
                          </p>
                        </div>
                      </div>
                    )}

                    {/* Badge content wrapper — greyed out for free plan */}
                    <div style={{
                      ...(isFreePlan ? { opacity: 0.45, filter: 'grayscale(70%)', pointerEvents: 'none', userSelect: 'none' } : {}),
                    }}>

                    {/* Overall Badge Summary with Ultimate Badge */}
                    <div style={{
                      background: currentTheme.backgroundOverlay,
                      border: `1px solid ${allOtherBadgesEarned ? '#FFD700' : currentTheme.borderLight}`,
                      borderRadius: '16px',
                      padding: '30px',
                      marginBottom: '32px',
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

                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '16px', marginBottom: '16px' }}>
                        <Award size={36} color={currentTheme.accent} />
                        <h2 style={{
                          fontSize: '1.8rem',
                          margin: 0,
                          background: currentTheme.accentGradient,
                          WebkitBackgroundClip: 'text',
                          WebkitTextFillColor: 'transparent',
                        }}>
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
                          borderRadius: '50%',
                          background: allOtherBadgesEarned
                            ? 'radial-gradient(circle, rgba(255,215,0,0.4), rgba(255,165,0,0.15))'
                            : currentTheme.backgroundTertiary,
                          border: `4px solid ${allOtherBadgesEarned ? '#FFD700' : currentTheme.borderLight}`,
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          fontSize: '2.5rem',
                          opacity: allOtherBadgesEarned ? 1 : 0.3,
                          transition: 'all 0.3s ease',
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
                          fontSize: '1.1rem',
                          fontWeight: '700',
                          margin: '0 0 2px 0',
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

                      <p style={{ color: currentTheme.textSecondary, fontSize: '1rem', margin: '0 0 20px 0' }}>
                        Unlock badges by using ArkiTek. The more badges you earn, the greater the rewards.
                      </p>

                      {/* Rewards tier indicator */}
                      {(() => {
                        const TIERS = [
                          { name: 'Bronze', min: 0, max: 25, color: '#CD7F32', glow: 'rgba(205,127,50,0.12)', reward: 0.25 },
                          { name: 'Silver', min: 26, max: 50, color: '#C0C0C0', glow: 'rgba(192,192,192,0.12)', reward: 0.50 },
                          { name: 'Gold', min: 51, max: 75, color: '#FFD700', glow: 'rgba(255,215,0,0.12)', reward: 0.75 },
                          { name: 'Platinum', min: 76, max: Infinity, color: '#00E5FF', glow: 'rgba(0,229,255,0.15)', reward: 1.00 },
                        ]
                        const currentTier = TIERS.find(t => totalEarned >= t.min && totalEarned <= t.max) || TIERS[0]
                        const currentTierIndex = TIERS.indexOf(currentTier)
                        const nextTier = currentTierIndex < TIERS.length - 1 ? TIERS[currentTierIndex + 1] : null
                        const badgesToNext = nextTier ? nextTier.min - totalEarned : 0

                        return (
                          <div style={{
                            width: '100%',
                            marginBottom: '24px',
                          }}>
                            {/* Current tier badge */}
                            <div style={{
                              display: 'inline-flex',
                              flexDirection: 'column',
                              alignItems: 'center',
                              gap: '6px',
                              padding: '14px 28px',
                              borderRadius: '12px',
                              background: currentTier.glow,
                              border: `1px solid ${currentTier.color}50`,
                              marginBottom: '16px',
                            }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                <Trophy size={18} color={currentTier.color} />
                                <span style={{
                                  fontSize: '1rem',
                                  fontWeight: '700',
                                  color: currentTier.color,
                                  letterSpacing: '1px',
                                  textTransform: 'uppercase',
                                }}>
                                  {currentTier.name} Tier
                                </span>
                                <Trophy size={18} color={currentTier.color} />
                              </div>
                              <span style={{ fontSize: '0.8rem', color: currentTheme.textSecondary }}>
                                Monthly usage bonus
                              </span>
                              {nextTier && (
                                <span style={{ fontSize: '0.7rem', color: currentTheme.textMuted, fontStyle: 'italic' }}>
                                  {badgesToNext} more badge{badgesToNext !== 1 ? 's' : ''} to reach {nextTier.name}
                                </span>
                              )}
                            </div>

                            {/* All tiers overview */}
                            <div style={{
                              display: 'grid',
                              gridTemplateColumns: 'repeat(4, 1fr)',
                              gap: '10px',
                            }}>
                              {TIERS.map((tier) => {
                                const isActive = tier.name === currentTier.name
                                return (
                                  <div
                                    key={tier.name}
                                    style={{
                                      padding: '12px 10px',
                                      borderRadius: '10px',
                                      background: isActive ? tier.glow : 'transparent',
                                      border: `1.5px solid ${isActive ? tier.color : `${tier.color}40`}`,
                                      textAlign: 'center',
                                      transition: 'all 0.3s ease',
                                    }}
                                  >
                                    <Trophy size={16} color={tier.color} style={{ marginBottom: '4px' }} />
                                    <p style={{
                                      fontSize: '0.8rem',
                                      fontWeight: '700',
                                      color: currentTheme.text,
                                      margin: '0 0 2px 0',
                                    }}>
                                      {tier.name}
                                    </p>
                                    <p style={{
                                      fontSize: '0.65rem',
                                      color: currentTheme.text,
                                      margin: '0 0 4px 0',
                                    }}>
                                      {tier.max === Infinity ? `${tier.min}+ badges` : `${tier.min}–${tier.max} badges`}
                                    </p>
                                    <p style={{
                                      fontSize: '0.75rem',
                                      fontWeight: '600',
                                      color: currentTheme.text,
                                      margin: 0,
                                    }}>
                                      Usage bonus
                                    </p>
                                  </div>
                                )
                              })}
                            </div>
                          </div>
                        )
                      })()}

                      <div style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: '16px',
                      }}>
                        <div style={{
                          fontSize: '3rem',
                          fontWeight: 'bold',
                          background: currentTheme.accentGradient,
                          WebkitBackgroundClip: 'text',
                          WebkitTextFillColor: 'transparent',
                        }}>
                          {totalEarned}
                        </div>
                        <div style={{ textAlign: 'left' }}>
                          <p style={{ color: currentTheme.textSecondary, fontSize: '0.9rem', margin: 0 }}>
                            of {totalBadges} badges earned
                          </p>
                          <div style={{
                            width: '200px',
                            height: '8px',
                            background: currentTheme.backgroundTertiary,
                            borderRadius: '4px',
                            marginTop: '6px',
                            overflow: 'hidden',
                          }}>
                            <div style={{
                              width: `${(totalEarned / totalBadges) * 100}%`,
                              height: '100%',
                              background: allOtherBadgesEarned
                                ? 'linear-gradient(90deg, #FFD700, #FFA500, #FFD700)'
                                : currentTheme.accentGradient,
                              borderRadius: '4px',
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
                          gap: '6px',
                          color: currentTheme.accent,
                          fontSize: '0.8rem',
                          fontWeight: '500',
                          opacity: 0.8,
                          animation: 'badgeScrollBounce 1.5s ease-in-out infinite',
                        }}>
                          <span>Scroll down for badges</span>
                          <ChevronDown size={16} />
                          <style>{`@keyframes badgeScrollBounce { 0%,100% { transform: translateY(0); } 50% { transform: translateY(4px); } }`}</style>
                        </div>
                      )}
                    </div>

                    {/* Badge Categories */}
                    <div ref={badgeCategoriesRef} style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
                      {badgeProgress.map((category) => {
                        const CategoryIcon = category.icon
                        const isExpanded = expandedBadgeCategory === category.id

                        return (
                          <div
                            key={category.id}
                            style={{
                              background: currentTheme.backgroundOverlay,
                              border: `1px solid ${category.earnedCount > 0 ? currentTheme.borderActive : currentTheme.borderLight}`,
                              borderRadius: '16px',
                              overflow: 'hidden',
                              transition: 'border-color 0.3s ease',
                            }}
                          >
                            {/* Category Header */}
                            <div
                              onClick={() => setExpandedBadgeCategory(isExpanded ? null : category.id)}
                              style={{
                                padding: '20px 24px',
                                cursor: 'pointer',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'space-between',
                                transition: 'background 0.2s ease',
                              }}
                              onMouseEnter={(e) => { e.currentTarget.style.background = currentTheme.buttonBackgroundHover }}
                              onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent' }}
                            >
                              <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
                                {isExpanded ? <ChevronDown size={20} color={currentTheme.accent} /> : <ChevronRight size={20} color={currentTheme.accent} />}
                                <CategoryIcon size={24} color={currentTheme.accent} />
                                <div>
                                  <h3 style={{
                                    fontSize: '1.15rem',
                                    color: currentTheme.accent,
                                    margin: 0,
                                    fontWeight: '600',
                                  }}>
                                    {category.name}
                                  </h3>
                                  <p style={{ color: currentTheme.textMuted, fontSize: '0.8rem', margin: '2px 0 0 0' }}>
                                    {category.description}
                                  </p>
                                </div>
                              </div>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                                {/* Mini badge preview - show earned badges */}
                                <div style={{ display: 'flex', gap: '4px' }}>
                                  {category.badges.slice(0, 5).map((badge, i) => (
                                    <div
                                      key={i}
                                      style={{
                                        width: '28px',
                                        height: '28px',
                                        borderRadius: '50%',
                                        background: badge.earned
                                          ? `radial-gradient(circle, ${badge.color}40, ${badge.color}15)`
                                          : currentTheme.backgroundTertiary,
                                        border: `2px solid ${badge.earned ? badge.color : currentTheme.borderLight}`,
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                        fontSize: '0.75rem',
                                        opacity: badge.earned ? 1 : 0.3,
                                        transition: 'all 0.3s ease',
                                      }}
                                    >
                                      {badge.emoji}
                                    </div>
                                  ))}
                                  {category.badges.length > 5 && (
                                    <span style={{ color: currentTheme.textMuted, fontSize: '0.75rem', alignSelf: 'center', marginLeft: '4px' }}>
                                      +{category.badges.length - 5}
                                    </span>
                                  )}
                                </div>
                                <span style={{
                                  background: category.earnedCount > 0 ? currentTheme.accentGradient : 'none',
                                  WebkitBackgroundClip: category.earnedCount > 0 ? 'text' : 'unset',
                                  WebkitTextFillColor: category.earnedCount > 0 ? 'transparent' : 'unset',
                                  color: category.earnedCount > 0 ? currentTheme.accent : currentTheme.textMuted,
                                  fontSize: '0.9rem',
                                  fontWeight: '600',
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
                                    {/* Total stat display */}
                                    <div style={{
                                      display: 'flex',
                                      alignItems: 'center',
                                      justifyContent: 'center',
                                      padding: '12px 16px',
                                      marginBottom: '16px',
                                      background: currentTheme.backgroundSecondary,
                                      borderRadius: '10px',
                                      border: `1px solid ${currentTheme.borderLight}`,
                                    }}>
                                      <span style={{
                                        fontSize: '1.4rem',
                                        fontWeight: '700',
                                        background: currentTheme.accentGradient,
                                        WebkitBackgroundClip: 'text',
                                        WebkitTextFillColor: 'transparent',
                                        marginRight: '8px',
                                      }}>
                                        {formatBadgeNumber(category.currentValue)}
                                      </span>
                                      <span style={{ color: currentTheme.textSecondary, fontSize: '0.9rem' }}>
                                        {category.unit || category.statKey} total
                                      </span>
                                    </div>

                                    {/* Next badge progress bar */}
                                    <div style={{
                                      marginBottom: '20px',
                                    }}>
                                      <div style={{
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'space-between',
                                        marginBottom: '6px',
                                      }}>
                                        <span style={{ color: currentTheme.textMuted, fontSize: '0.8rem' }}>
                                          {category.nextBadge
                                            ? `Next: ${category.nextBadge.name} (${category.nextBadge.desc})`
                                            : 'All badges earned!'
                                          }
                                        </span>
                                        <span style={{ color: currentTheme.textSecondary, fontSize: '0.8rem', fontWeight: '600' }}>
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
                                        borderRadius: '4px',
                                        overflow: 'hidden',
                                      }}>
                                        <div style={{
                                          width: `${category.nextBadge ? (category.nextBadgeProgress * 100) : 100}%`,
                                          height: '100%',
                                          background: category.nextBadge
                                            ? `${category.nextBadge.color}CC`
                                            : currentTheme.accentGradient,
                                          borderRadius: '4px',
                                          transition: 'width 0.5s ease',
                                        }} />
                                      </div>
                                      <div style={{
                                        display: 'flex',
                                        justifyContent: 'flex-end',
                                        marginTop: '4px',
                                      }}>
                                        <span style={{ color: currentTheme.textSecondary, fontSize: '0.75rem' }}>
                                          {category.nextBadge
                                            ? `${Math.round(category.nextBadgeProgress * 100)}%`
                                            : '100%'
                                          }
                                        </span>
                                      </div>
                                    </div>

                                    {/* Badge Grid - even rows: <=6 badges = 1 row, >6 = 2 even rows */}
                                    <div style={{
                                      display: 'grid',
                                      gridTemplateColumns: `repeat(${category.badges.length <= 6 ? category.badges.length : Math.ceil(category.badges.length / 2)}, 1fr)`,
                                      gap: '16px',
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
                                              borderRadius: '14px',
                                              background: badge.earned
                                                ? `radial-gradient(ellipse at center, ${badge.color}12, transparent 70%)`
                                                : currentTheme.backgroundSecondary,
                                              border: `1px solid ${badge.earned ? `${badge.color}50` : currentTheme.borderLight}`,
                                              transition: 'all 0.3s ease',
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
                                              borderRadius: '50%',
                                              background: badge.earned
                                                ? `radial-gradient(circle, ${badge.color}35, ${badge.color}10)`
                                                : currentTheme.backgroundTertiary,
                                              border: `3px solid ${badge.earned ? badge.color : currentTheme.borderLight}`,
                                              display: 'flex',
                                              alignItems: 'center',
                                              justifyContent: 'center',
                                              fontSize: '1.5rem',
                                              marginBottom: '10px',
                                              opacity: badge.earned ? 1 : 0.35,
                                              transition: 'all 0.3s ease',
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
                                              fontSize: '0.8rem',
                                              fontWeight: badge.earned ? '600' : '400',
                                              color: badge.earned ? badge.color : currentTheme.textMuted,
                                              margin: '0 0 4px 0',
                                              textAlign: 'center',
                                              lineHeight: '1.2',
                                            }}>
                                              {badge.name}
                                            </p>

                                            {/* Badge Requirement */}
                                            <p style={{
                                              fontSize: '0.7rem',
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
                                                marginTop: '8px',
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
                                                borderRadius: '50%',
                                                background: badge.color,
                                                display: 'flex',
                                                alignItems: 'center',
                                                justifyContent: 'center',
                                                fontSize: '0.65rem',
                                                color: '#000',
                                                fontWeight: 'bold',
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
                  </>
                )
              })()}
            </motion.div>
          )}

          {activeTab === 'profile' && !isFreePlan && (
            <motion.div
              key="profile"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.15 }}
            >
              {/* Stats Summary Row */}
              {!isViewingOther && leaderboardStats && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '14px', marginBottom: '24px' }}>
                  <div style={{ display: 'flex', gap: '14px', flexWrap: 'wrap' }}>
                    <div style={{
                      flex: 1, minWidth: '140px',
                      background: currentTheme.backgroundOverlay,
                      border: `1px solid ${currentTheme.borderLight}`,
                      borderRadius: '14px', padding: '18px 20px',
                      display: 'flex', alignItems: 'center', gap: '14px',
                    }}>
                      <Rocket size={22} color={currentTheme.accent} />
                      <div>
                        <p style={{ color: currentTheme.textSecondary, fontSize: '0.78rem', margin: 0 }}>Total Prompts</p>
                        <p key={`stat-prompts-${theme}`} style={{
                          fontSize: '1.4rem', fontWeight: '700', margin: 0,
                          background: currentTheme.accentGradient,
                          WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent',
                          color: currentTheme.accent, display: 'inline-block',
                        }}>{leaderboardStats.totalPrompts || 0}</p>
                      </div>
                    </div>
                    <div style={{
                      flex: 1, minWidth: '140px',
                      background: currentTheme.backgroundOverlay,
                      border: `1px solid ${currentTheme.borderLight}`,
                      borderRadius: '14px', padding: '18px 20px',
                      display: 'flex', alignItems: 'center', gap: '14px',
                    }}>
                      <Heart size={22} color="#ff6b6b" />
                      <div>
                        <p style={{ color: currentTheme.textSecondary, fontSize: '0.78rem', margin: 0 }}>Total Likes</p>
                        <p key={`stat-likes-${theme}`} style={{
                          fontSize: '1.4rem', fontWeight: '700', margin: 0,
                          background: currentTheme.accentGradient,
                          WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent',
                          color: currentTheme.accent, display: 'inline-block',
                        }}>{leaderboardStats.totalLikes || 0}</p>
                      </div>
                    </div>
                  </div>

                  {/* Wins in Prompt Feed Favorites */}
                  <div style={{
                    background: currentTheme.backgroundOverlay,
                    border: `1px solid ${(leaderboardStats.wins?.length > 0) ? '#FFD70040' : currentTheme.borderLight}`,
                    borderRadius: '14px',
                    padding: '20px 24px',
                    ...(leaderboardStats.wins?.length > 0 ? {
                      background: `linear-gradient(135deg, ${currentTheme.backgroundOverlay}, rgba(255, 215, 0, 0.03))`,
                    } : {}),
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: leaderboardStats.wins?.length > 0 ? '16px' : '0' }}>
                      <Trophy size={24} color="#FFD700" />
                      <div style={{ flex: 1 }}>
                        <p style={{ color: currentTheme.text, fontSize: '1rem', fontWeight: '600', margin: 0 }}>
                          Wins in Prompt Feed Favorites
                        </p>
                        <p style={{ color: currentTheme.textMuted, fontSize: '0.8rem', margin: '2px 0 0 0' }}>
                          {leaderboardStats.wins?.length > 0
                            ? `${leaderboardStats.winCount} winning ${leaderboardStats.winCount === 1 ? 'prompt' : 'prompts'}`
                            : 'No wins yet — get the most likes on a prompt to win!'}
                        </p>
                      </div>
                      <p key={`stat-wins-${theme}`} style={{
                        fontSize: '2rem', fontWeight: '800', margin: 0,
                        background: leaderboardStats.wins?.length > 0 ? 'linear-gradient(135deg, #FFD700, #FFA500)' : currentTheme.accentGradient,
                        WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent',
                        color: currentTheme.accent, display: 'inline-block',
                      }}>{leaderboardStats.winCount || 0}</p>
                    </div>

                    {leaderboardStats.wins?.length > 0 && (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                        {leaderboardStats.wins.map((win, idx) => (
                          <div
                            key={win.promptId || idx}
                            style={{
                              background: theme === 'light' ? 'rgba(255, 215, 0, 0.06)' : 'rgba(255, 215, 0, 0.04)',
                              border: `1px solid rgba(255, 215, 0, 0.15)`,
                              borderRadius: '10px',
                              padding: '14px 16px',
                            }}
                          >
                            <div style={{ display: 'flex', alignItems: 'flex-start', gap: '10px' }}>
                              <Trophy size={16} color="#FFD700" style={{ marginTop: '2px', flexShrink: 0 }} />
                              <div style={{ flex: 1, minWidth: 0 }}>
                                <p style={{
                                  color: currentTheme.text, fontSize: '0.92rem', fontWeight: '500',
                                  margin: '0 0 6px 0', lineHeight: '1.4',
                                  wordBreak: 'break-word',
                                }}>
                                  {win.promptTextShort || win.promptText}
                                </p>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
                                  {win.category && (
                                    <span style={{
                                      padding: '2px 8px', borderRadius: '10px',
                                      background: `${currentTheme.accent}15`,
                                      border: `1px solid ${currentTheme.accent}30`,
                                      color: currentTheme.accent, fontSize: '0.7rem', fontWeight: '500',
                                    }}>
                                      {win.category}
                                    </span>
                                  )}
                                  <span style={{ color: currentTheme.textMuted, fontSize: '0.75rem', display: 'flex', alignItems: 'center', gap: '4px' }}>
                                    <Calendar size={11} />
                                    {new Date(win.date).toLocaleDateString('en-US', {
                                      month: 'short', day: 'numeric', year: 'numeric',
                                    })}
                                  </span>
                                  <span style={{ color: '#ff6b6b', fontSize: '0.75rem', display: 'flex', alignItems: 'center', gap: '4px' }}>
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

              <div style={{ marginBottom: '24px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '8px' }}>
                  <User size={28} color={currentTheme.accent} />
                  <h2 style={{
                    fontSize: '1.5rem',
                    margin: 0,
                    background: currentTheme.accentGradient,
                    WebkitBackgroundClip: 'text',
                    WebkitTextFillColor: 'transparent',
                  }}>
                    {isViewingOther ? `${viewingProfile.username}'s Posts` : 'My Prompt Feed Posts'}
                  </h2>
                </div>
                <p style={{ color: currentTheme.textSecondary, fontSize: '0.95rem', margin: 0 }}>
                  {isViewingOther
                    ? `All prompts ${viewingProfile.username} has submitted to the Prompt Feed.`
                    : 'All prompts you have submitted to the Prompt Feed.'}
                </p>
              </div>

              {(loadingProfile || loadingPublicProfile) ? (
                <div style={{ textAlign: 'center', padding: '40px' }}>
                  <p style={{ color: currentTheme.textSecondary, fontSize: '1.1rem' }}>
                    {isViewingOther ? `Loading ${viewingProfile.username}'s posts...` : 'Loading your prompts...'}
                  </p>
                </div>
              ) : profilePrompts.length === 0 ? (
                <div style={{
                  background: currentTheme.backgroundOverlay,
                  border: `1px solid ${currentTheme.borderLight}`,
                  borderRadius: '16px',
                  padding: '50px',
                  textAlign: 'center',
                }}>
                  <Rocket size={48} color={currentTheme.textMuted} style={{ marginBottom: '16px', opacity: 0.5 }} />
                  <p style={{ color: currentTheme.textSecondary, fontSize: '1.1rem', margin: '0 0 8px 0' }}>
                    {isViewingOther
                      ? `${viewingProfile.username} hasn't submitted any prompts to the Prompt Feed yet.`
                      : "You haven't submitted any prompts to the Prompt Feed yet."}
                  </p>
                  {!isViewingOther && (
                  <p style={{ color: currentTheme.textMuted, fontSize: '0.9rem', margin: 0 }}>
                    Submit your first prompt from the home tab to see it here!
                  </p>
                  )}
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                  {/* Prompt Cards */}
                  {profilePrompts.map((prompt, index) => (
                    <div
                      key={prompt.id || index}
                      style={{
                        background: currentTheme.backgroundOverlay,
                        border: `1px solid ${currentTheme.borderLight}`,
                        borderRadius: '14px',
                        padding: '20px 24px',
                        transition: 'border-color 0.2s ease',
                      }}
                      onMouseEnter={(e) => { e.currentTarget.style.borderColor = currentTheme.borderActive }}
                      onMouseLeave={(e) => { e.currentTarget.style.borderColor = currentTheme.borderLight }}
                    >
                      {/* Prompt Header */}
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '12px' }}>
                        <div style={{ flex: 1 }}>
                          <p style={{
                            color: currentTheme.text,
                            fontSize: '1rem',
                            margin: '0 0 8px 0',
                            lineHeight: '1.5',
                            paddingRight: '36px',
                          }}>
                            {prompt.promptText}
                          </p>
                          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center' }}>
                            {prompt.category && (
                              <span style={{
                                padding: '3px 10px',
                                borderRadius: '12px',
                                background: `${currentTheme.accent}15`,
                                border: `1px solid ${currentTheme.accent}30`,
                                color: currentTheme.accent,
                                fontSize: '0.75rem',
                                fontWeight: '500',
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
                            {winningPrompts?.some(w => w.promptId === prompt.id) && (
                              <span style={{
                                padding: '2px 8px', borderRadius: '10px', fontSize: '0.7rem', fontWeight: '700',
                                background: 'linear-gradient(135deg, rgba(255, 215, 0, 0.15), rgba(255, 165, 0, 0.15))',
                                border: '1px solid rgba(255, 215, 0, 0.3)',
                                color: '#FFD700',
                                display: 'inline-flex', alignItems: 'center', gap: '4px',
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
                              transition: 'all 0.15s ease',
                              opacity: deletingPostId === prompt.id ? 0.5 : confirmDeleteId === prompt.id ? 1 : 0.5,
                              color: '#ff6b6b',
                              fontSize: '0.75rem',
                              fontWeight: '600',
                              display: 'flex',
                              alignItems: 'center',
                              gap: '6px',
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
                        gap: '20px',
                        paddingTop: '12px',
                        borderTop: `1px solid ${currentTheme.borderLight}`,
                      }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                          <Heart size={16} color="#ff6b6b" fill={prompt.likeCount > 0 ? '#ff6b6b' : 'none'} />
                          <span style={{ color: currentTheme.textSecondary, fontSize: '0.85rem' }}>
                            {prompt.likeCount || 0} {(prompt.likeCount || 0) === 1 ? 'like' : 'likes'}
                          </span>
                        </div>
                        {prompt.comments && prompt.comments.length > 0 && (
                          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                            <MessageSquare size={16} color={currentTheme.textSecondary} />
                            <span style={{ color: currentTheme.textSecondary, fontSize: '0.85rem' }}>
                              {prompt.comments.length} {prompt.comments.length === 1 ? 'comment' : 'comments'}
                            </span>
                          </div>
                        )}
                        {prompt.responses && prompt.responses.length > 0 && (
                          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                            <Cpu size={16} color={currentTheme.textSecondary} />
                            <span style={{ color: currentTheme.textSecondary, fontSize: '0.85rem' }}>
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
          )}
        </AnimatePresence>

        {/* Confirmation Modal */}
        {/* Buy Usage Modal */}
        <BuyUsageModal
          isOpen={showBuyUsageModal}
          onClose={() => setShowBuyUsageModal(false)}
          onSuccess={handleUsagePurchaseSuccess}
        />

        {/* Edit Profile Modal */}
        <AnimatePresence>
          {showEditProfile && (
            <div
              onClick={() => !savingProfile && setShowEditProfile(false)}
              style={{
                position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, zIndex: 10000,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                background: 'rgba(0, 0, 0, 0.5)', backdropFilter: 'blur(4px)',
              }}
            >
              <motion.div
                onClick={(e) => e.stopPropagation()}
                initial={{ scale: 0.9, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 0.9, opacity: 0 }}
                style={{
                  background: currentTheme.backgroundOverlay,
                  border: `1px solid ${currentTheme.border}`,
                  borderRadius: '16px',
                  padding: '30px',
                  maxWidth: '480px',
                  width: 'calc(100% - 40px)',
                  maxHeight: '85vh',
                  overflowY: 'auto',
                  position: 'relative',
                }}
              >
                <h2 style={{
                  fontSize: '1.3rem', margin: '0 0 20px 0',
                  background: currentTheme.accentGradient,
                  WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent',
                }}>
                  Edit Profile
                </h2>

                {/* Profile image */}
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '12px', marginBottom: '20px' }}>
                  <div
                    onClick={() => fileInputRef.current?.click()}
                    style={{
                      width: '100px', height: '100px', borderRadius: '50%',
                      background: editProfileImage ? 'none' : currentTheme.accentGradient,
                      border: `3px solid ${currentTheme.accent}40`,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      overflow: 'hidden', cursor: 'pointer', position: 'relative',
                    }}
                  >
                    {editProfileImage ? (
                      <img src={editProfileImage} alt="Profile" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                    ) : (
                      <User size={40} color="#fff" />
                    )}
                    <div style={{
                      position: 'absolute', bottom: 0, left: 0, right: 0,
                      background: 'rgba(0,0,0,0.5)', padding: '4px 0',
                      display: 'flex', justifyContent: 'center',
                    }}>
                      <Camera size={14} color="#fff" />
                    </div>
                  </div>
                  <input ref={fileInputRef} type="file" accept="image/*" onChange={handleImageUpload} style={{ display: 'none' }} />
                  <div style={{ display: 'flex', gap: '8px' }}>
                    <button
                      onClick={() => fileInputRef.current?.click()}
                      style={{
                        padding: '6px 14px', background: 'transparent',
                        border: `1px solid ${currentTheme.borderLight}`, borderRadius: '8px',
                        color: currentTheme.accent, fontSize: '0.8rem', cursor: 'pointer',
                      }}
                    >
                      Upload Photo
                    </button>
                    {editProfileImage && (
                      <button
                        onClick={() => setEditProfileImage(null)}
                        style={{
                          padding: '6px 14px', background: 'transparent',
                          border: `1px solid ${currentTheme.borderLight}`, borderRadius: '8px',
                          color: '#ff6b6b', fontSize: '0.8rem', cursor: 'pointer',
                        }}
                      >
                        Remove
                      </button>
                    )}
                  </div>
                </div>

                {/* Bio */}
                <div style={{ marginBottom: '16px' }}>
                  <label style={{
                    color: currentTheme.textSecondary, fontSize: '0.75rem', fontWeight: '500',
                    textTransform: 'uppercase', letterSpacing: '0.5px', display: 'block', marginBottom: '6px',
                  }}>Bio</label>
                  <textarea
                    value={editBio}
                    onChange={(e) => setEditBio(e.target.value)}
                    placeholder="Tell people about yourself..."
                    maxLength={300}
                    style={{
                      width: '100%', minHeight: '80px', padding: '10px 12px',
                      background: currentTheme.buttonBackground, border: `1px solid ${currentTheme.borderLight}`,
                      borderRadius: '10px', color: currentTheme.text, fontSize: '0.9rem',
                      lineHeight: '1.5', resize: 'vertical', outline: 'none', fontFamily: 'inherit',
                      boxSizing: 'border-box',
                    }}
                    onFocus={(e) => { e.target.style.borderColor = currentTheme.accent }}
                    onBlur={(e) => { e.target.style.borderColor = currentTheme.borderLight }}
                  />
                  <p style={{ color: currentTheme.textMuted || currentTheme.textSecondary, fontSize: '0.72rem', margin: '4px 0 0 0', textAlign: 'right' }}>
                    {editBio.length}/300
                  </p>
                </div>

                {/* Anonymous toggle */}
                <div style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  padding: '12px 14px', background: currentTheme.buttonBackground,
                  border: `1px solid ${currentTheme.borderLight}`, borderRadius: '10px', marginBottom: '12px',
                }}>
                  <div>
                    <p style={{ color: currentTheme.text, fontSize: '0.9rem', fontWeight: '500', margin: 0 }}>Anonymous Mode</p>
                    <p style={{ color: currentTheme.textSecondary, fontSize: '0.78rem', margin: '2px 0 0 0' }}>
                      Hide your name and username from other users
                    </p>
                  </div>
                  <button
                    onClick={() => setEditIsAnonymous(!editIsAnonymous)}
                    style={{
                      width: '44px', height: '24px', borderRadius: '12px', border: 'none', cursor: 'pointer',
                      background: editIsAnonymous ? currentTheme.accent : (currentTheme.borderLight || '#444'),
                      position: 'relative', transition: 'background 0.2s', flexShrink: 0,
                    }}
                  >
                    <div style={{
                      width: '20px', height: '20px', borderRadius: '50%', background: '#fff',
                      position: 'absolute', top: '2px',
                      left: editIsAnonymous ? '22px' : '2px',
                      transition: 'left 0.2s',
                    }} />
                  </button>
                </div>

                {/* Private Account toggle */}
                <div style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  padding: '12px 14px', background: currentTheme.buttonBackground,
                  border: `1px solid ${currentTheme.borderLight}`, borderRadius: '10px', marginBottom: '20px',
                }}>
                  <div>
                    <p style={{ color: currentTheme.text, fontSize: '0.9rem', fontWeight: '500', margin: 0 }}>Private Account</p>
                    <p style={{ color: currentTheme.textSecondary, fontSize: '0.78rem', margin: '2px 0 0 0' }}>
                      Require approval before others can follow you
                    </p>
                  </div>
                  <button
                    onClick={() => setEditIsPrivate(!editIsPrivate)}
                    style={{
                      width: '44px', height: '24px', borderRadius: '12px', border: 'none', cursor: 'pointer',
                      background: editIsPrivate ? currentTheme.accent : (currentTheme.borderLight || '#444'),
                      position: 'relative', transition: 'background 0.2s', flexShrink: 0,
                    }}
                  >
                    <div style={{
                      width: '20px', height: '20px', borderRadius: '50%', background: '#fff',
                      position: 'absolute', top: '2px',
                      left: editIsPrivate ? '22px' : '2px',
                      transition: 'left 0.2s',
                    }} />
                  </button>
                </div>

                {/* Save / Cancel */}
                <div style={{ display: 'flex', gap: '10px' }}>
                  <motion.button
                    onClick={() => setShowEditProfile(false)}
                    whileHover={{ scale: 1.02 }}
                    style={{
                      flex: 1, padding: '10px', background: 'transparent',
                      border: `1px solid ${currentTheme.borderLight}`, borderRadius: '10px',
                      color: currentTheme.textSecondary, fontSize: '0.9rem', cursor: 'pointer',
                    }}
                  >
                    Cancel
                  </motion.button>
                  <motion.button
                    onClick={handleSaveProfile}
                    disabled={savingProfile}
                    whileHover={{ scale: 1.02 }}
                    style={{
                      flex: 1, padding: '10px', background: currentTheme.accentGradient,
                      border: 'none', borderRadius: '10px', color: '#fff',
                      fontSize: '0.9rem', fontWeight: '600', cursor: savingProfile ? 'wait' : 'pointer',
                      opacity: savingProfile ? 0.7 : 1,
                    }}
                  >
                    {savingProfile ? 'Saving...' : 'Save Profile'}
                  </motion.button>
                </div>
              </motion.div>
            </div>
          )}
        </AnimatePresence>

        {/* Unfollow Confirmation Modal */}
        <ConfirmationModal
          isOpen={showUnfollowConfirm}
          onClose={() => setShowUnfollowConfirm(false)}
          onConfirm={() => handleUnfollow(viewingProfile?.userId)}
          title="Unfollow User"
          message={`Are you sure you want to unfollow ${viewingProfile?.username || 'this user'}?`}
          confirmText="Unfollow"
          cancelText="Cancel"
          confirmColor="#ff6b6b"
        />

        {/* Followers / Following List Modal */}
        <AnimatePresence>
          {showFollowersList && (
            <div
              onClick={() => setShowFollowersList(null)}
              style={{
                position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, zIndex: 10000,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                background: 'rgba(0, 0, 0, 0.5)', backdropFilter: 'blur(4px)',
              }}
            >
              <motion.div
                onClick={(e) => e.stopPropagation()}
                initial={{ scale: 0.9, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 0.9, opacity: 0 }}
                style={{
                  background: currentTheme.backgroundOverlay,
                  border: `1px solid ${currentTheme.border}`,
                  borderRadius: '16px',
                  padding: '24px',
                  maxWidth: '400px',
                  width: 'calc(100% - 40px)',
                  maxHeight: '70vh',
                  overflowY: 'auto',
                  position: 'relative',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
                  <h3 style={{ margin: 0, color: currentTheme.text, fontSize: '1.1rem', textTransform: 'capitalize' }}>
                    {showFollowersList}
                  </h3>
                  <button
                    onClick={() => setShowFollowersList(null)}
                    style={{ background: 'none', border: 'none', color: currentTheme.textSecondary, cursor: 'pointer', padding: '4px' }}
                  >
                    <X size={18} />
                  </button>
                </div>
                {loadingFollowersList ? (
                  <p style={{ color: currentTheme.textSecondary, textAlign: 'center', padding: '20px 0' }}>Loading...</p>
                ) : followersListData.length === 0 ? (
                  <p style={{ color: currentTheme.textSecondary, textAlign: 'center', padding: '20px 0', fontSize: '0.9rem' }}>
                    No {showFollowersList} yet
                  </p>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    {followersListData.map((person) => (
                      <div
                        key={person.userId}
                        onClick={() => {
                          setShowFollowersList(null)
                          if (person.userId === currentUser?.id) {
                            clearViewingProfile()
                          } else {
                            const setViewingProfile = useStore.getState().setViewingProfile
                            const setActiveTab = useStore.getState().setActiveTab
                            setViewingProfile({ userId: person.userId, username: person.username })
                            setActiveTab('statistics')
                          }
                        }}
                        style={{
                          display: 'flex', alignItems: 'center', gap: '12px',
                          padding: '10px 12px', borderRadius: '10px', cursor: 'pointer',
                          background: currentTheme.buttonBackground,
                          border: `1px solid ${currentTheme.borderLight}`,
                        }}
                      >
                        <div style={{
                          width: '40px', height: '40px', borderRadius: '50%',
                          background: person.profileImage ? 'none' : currentTheme.accentGradient,
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                          overflow: 'hidden', flexShrink: 0,
                        }}>
                          {person.profileImage ? (
                            <img src={person.profileImage} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                          ) : (
                            <User size={18} color="#fff" />
                          )}
                        </div>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <p style={{ color: currentTheme.text, fontSize: '0.9rem', fontWeight: '500', margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {person.username}
                          </p>
                          {person.bio && (
                            <p style={{ color: currentTheme.textSecondary, fontSize: '0.78rem', margin: '2px 0 0 0', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                              {person.bio}
                            </p>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </motion.div>
            </div>
          )}
        </AnimatePresence>
      </div>
    </motion.div>
  )
}

export default StatisticsView
