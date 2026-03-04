import { useEffect, useRef, useCallback, useState } from 'react'
import { useStore } from '../store/useStore'
import { BADGE_CATEGORIES } from '../components/statistics/badgeConstants'
import api from '../utils/api'

export interface BadgeNotificationData {
  id: string
  name: string
  emoji: string
  color: string
  desc: string
  categoryName: string
}

const NOTIFIED_BADGES_KEY = 'arkitek_notified_badges'

function getNotifiedBadges(): Set<string> {
  try {
    const raw = localStorage.getItem(NOTIFIED_BADGES_KEY)
    return raw ? new Set(JSON.parse(raw)) : new Set()
  } catch {
    return new Set()
  }
}

function saveNotifiedBadges(badges: Set<string>) {
  localStorage.setItem(NOTIFIED_BADGES_KEY, JSON.stringify([...badges]))
}

function computeEarnedBadgeIds(stats: any): string[] {
  const earned: string[] = []
  const providers = stats.providers || {}
  const secretStats = stats.secretStats || {}
  const persistedBadges = new Set(stats.earnedBadges || [])

  const badgeStats: Record<string, number> = {
    totalTokens: stats.totalTokens || 0,
    totalPrompts: stats.totalPrompts || 0,
    streakDays: stats.streakDays || 0,
    totalLikes: 0,
    totalRatings: stats.totalRatings || 0,
    totalComments: 0,
    councilPrompts: stats.councilPrompts || 0,
    debatePrompts: stats.debatePrompts || 0,
    provider_openai_prompts: providers.openai?.totalPrompts || 0,
    provider_anthropic_prompts: providers.anthropic?.totalPrompts || 0,
    provider_google_prompts: providers.google?.totalPrompts || 0,
    provider_xai_prompts: providers.xai?.totalPrompts || 0,
    lateNightPrompts: secretStats.lateNightPrompts || 0,
    longPrompts: secretStats.longPrompts || 0,
    revisitedOldConversations: secretStats.revisitedOldConversations || 0,
    starredConversations: secretStats.starredConversations || 0,
    maxPromptsInDay: secretStats.maxPromptsInDay || 0,
    factsWindowOpened: secretStats.factsWindowOpened || 0,
    longestConversation: secretStats.longestConversation || 0,
    totalFavorites: secretStats.totalFavorites || 0,
    uniqueCategories: secretStats.uniqueCategories || 0,
    multiTurnConversations: secretStats.multiTurnConversations || 0,
    weekendDaysUsed: secretStats.weekendDaysUsed || 0,
    comebackAfterBreak: secretStats.comebackAfterBreak || 0,
    uniqueModelsUsed: secretStats.uniqueModelsUsed || 0,
    totalShares: secretStats.totalShares || 0,
  }

  for (const category of BADGE_CATEGORIES) {
    const isSecret = category.secret === true
    const categoryValue = isSecret ? 0 : (badgeStats[category.statKey] || 0)

    category.badges.forEach((badge: any, badgeIndex: number) => {
      const badgeId = `${category.id}-${badgeIndex}`
      const badgeValue = isSecret
        ? (badgeStats[badge.secretStatKey] || 0)
        : categoryValue
      const meetsThreshold = badgeValue >= badge.threshold
      const wasPreviouslyEarned = persistedBadges.has(badgeId)
      if (meetsThreshold || wasPreviouslyEarned) {
        earned.push(badgeId)
      }
    })
  }

  return earned
}

function getBadgeDetails(badgeId: string): BadgeNotificationData | null {
  const [catId, indexStr] = badgeId.split('-')
  const index = parseInt(indexStr, 10)
  const category = BADGE_CATEGORIES.find(c => c.id === catId)
  if (!category || !category.badges[index]) return null
  const badge = category.badges[index] as any
  return {
    id: badgeId,
    name: badge.name,
    emoji: badge.emoji,
    color: badge.color,
    desc: badge.desc,
    categoryName: category.name,
  }
}

export function useBadgeNotifications() {
  const currentUser = useStore((state) => state.currentUser)
  const statsRefreshTrigger = useStore((state: any) => state.statsRefreshTrigger)
  const [queue, setQueue] = useState<BadgeNotificationData[]>([])
  const [visible, setVisible] = useState<BadgeNotificationData | null>(null)
  const isFreePlan = currentUser?.plan === 'free_trial' && !currentUser?.stripeSubscriptionId
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const hasFetchedOnce = useRef(false)

  const showNext = useCallback(() => {
    setQueue(prev => {
      if (prev.length === 0) {
        setVisible(null)
        return prev
      }
      const [next, ...rest] = prev
      setVisible(next)
      return rest
    })
  }, [])

  const dismiss = useCallback(() => {
    setVisible(null)
    if (timerRef.current) clearTimeout(timerRef.current)
    timerRef.current = setTimeout(showNext, 400)
  }, [showNext])

  useEffect(() => {
    if (!visible && queue.length > 0) {
      const t = setTimeout(showNext, 300)
      return () => clearTimeout(t)
    }
  }, [visible, queue, showNext])

  useEffect(() => {
    if (visible) {
      timerRef.current = setTimeout(dismiss, 5000)
      return () => { if (timerRef.current) clearTimeout(timerRef.current) }
    }
  }, [visible, dismiss])

  useEffect(() => {
    if (!currentUser?.id || isFreePlan) return

    const checkBadges = async () => {
      try {
        const response = await api.get(`/stats/${currentUser.id}`)
        const stats = response.data
        const earnedIds = computeEarnedBadgeIds(stats)
        const notified = getNotifiedBadges()

        // On first fetch, seed the notified set so we don't spam old badges
        if (!hasFetchedOnce.current) {
          hasFetchedOnce.current = true
          const missing = earnedIds.filter(id => !notified.has(id))
          if (missing.length > 0) {
            missing.forEach(id => notified.add(id))
            saveNotifiedBadges(notified)
          }
          return
        }

        const newBadges: BadgeNotificationData[] = []
        for (const id of earnedIds) {
          if (!notified.has(id)) {
            const details = getBadgeDetails(id)
            if (details) newBadges.push(details)
            notified.add(id)
          }
        }

        if (newBadges.length > 0) {
          saveNotifiedBadges(notified)
          setQueue(prev => [...prev, ...newBadges])
        }
      } catch (err) {
        // silently ignore - badge notification is non-critical
      }
    }

    checkBadges()
  }, [currentUser?.id, isFreePlan, statsRefreshTrigger])

  return { visible, dismiss }
}
