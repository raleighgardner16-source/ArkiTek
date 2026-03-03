import React, { useState, useEffect, useRef, useCallback } from 'react'
import ReactDOM from 'react-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { Trash2, ChevronRight, ChevronDown, ChevronUp, MessageCircle, X, Layers, Calendar, Globe, Clock, FolderOpen, MessageSquare, Coins, DollarSign, Star, Play, Trophy, Swords, ArrowRightLeft } from 'lucide-react'
import { useStore } from '../store/useStore'
import { getTheme } from '../utils/theme'
import { spacing, fontSize, fontWeight, radius, zIndex, transition, layout, sx, createStyles } from '../utils/styles'
import api from '../utils/api'
import ConfirmationModal from './ConfirmationModal'
import MarkdownRenderer from './MarkdownRenderer'
import TokenUsageWindow from './TokenUsageWindow'
import CostBreakdownWindow from './CostBreakdownWindow'

// Map provider key from modelName to display info
const PROVIDER_MAP: Record<string, { name: string; color: string }> = {
  openai: { name: 'ChatGPT', color: '#10a37f' },
  anthropic: { name: 'Claude', color: '#d4a574' },
  google: { name: 'Gemini', color: '#4285f4' },
  xai: { name: 'Grok', color: '#ffffff' },
  meta: { name: 'Meta', color: '#0668e1' },
  deepseek: { name: 'DeepSeek', color: '#4d6bfe' },
  mistral: { name: 'Mistral', color: '#f7d046' },
}

const getProviderFromModelName = (modelName: any) => {
  if (!modelName) return 'unknown'
  return modelName.split('-')[0].toLowerCase()
}

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'
]

const SavedConversationsView = () => {
  const currentUser = useStore((state: any) => state.currentUser)
  const theme = useStore((state: any) => state.theme || 'dark')
  const currentTheme = getTheme(theme)
  const s = createStyles(currentTheme)
  const isNavExpanded = useStore((state: any) => state.isNavExpanded)
  const setActiveTab = useStore((state: any) => state.setActiveTab)
  const clearResponses = useStore((state: any) => state.clearResponses)
  const addResponse = useStore((state: any) => state.addResponse)
  const setSummary = useStore((state: any) => state.setSummary)
  const setCurrentPrompt = useStore((state: any) => state.setCurrentPrompt)
  const setCurrentHistoryId = useStore((state: any) => state.setCurrentHistoryId)
  const setIsReopenedHistoryChat = useStore((state: any) => state.setIsReopenedHistoryChat)
  const setSearchSources = useStore((state: any) => state.setSearchSources)
  const setLastSubmittedPrompt = useStore((state: any) => state.setLastSubmittedPrompt)
  const setLastSubmittedCategory = useStore((state: any) => state.setLastSubmittedCategory)
  const setSummaryMinimized = useStore((state: any) => state.setSummaryMinimized)
  const winningPrompts = useStore((state: any) => state.winningPrompts)
  const historyRefreshTrigger = useStore((state: any) => state.historyRefreshTrigger)

  // Sub-tab state: 'history' or 'categories'
  const [activeSubTab, setActiveSubTab] = useState('history')
  const [mountReady, setMountReady] = useState(false)
  useEffect(() => { const id = requestAnimationFrame(() => setMountReady(true)); return () => cancelAnimationFrame(id) }, [])

  const [history, setHistory] = useState<any[]>([])
  const [loading, setLoading] = useState(false)
  const [selectedConvo, setSelectedConvo] = useState<any | null>(null)
  const [loadingDetail, setLoadingDetail] = useState(false)
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [expandedYears, setExpandedYears] = useState<Record<string, any>>({})
  const [expandedMonths, setExpandedMonths] = useState<Record<string, any>>({})
  const [expandedDays, setExpandedDays] = useState<Record<string, any>>({})
  const [expandedSources, setExpandedSources] = useState<Record<string, any>>({})
  const [expandedTitles, setExpandedTitles] = useState<Record<string, any>>({})
  const [expandAllDetailSections, setExpandAllDetailSections] = useState(false)
  const [detailTokenTab, setDetailTokenTab] = useState<string | null>(null)
  const detailPanelRef = useRef<HTMLDivElement | null>(null)
  const convoCardClickedRef = useRef(false)

  // Categories state
  const [categoriesData, setCategoriesData] = useState<any | null>(null)
  const [expandedCategories, setExpandedCategories] = useState<Record<string, any>>({})
  const [showClearCategoryConfirm, setShowClearCategoryConfirm] = useState(false)
  const [categoryToClear, setCategoryToClear] = useState<string | null>(null)

  // Track how many prompts are visible per category (default 5)
  const [categoryVisibleCount, setCategoryVisibleCount] = useState<Record<string, any>>({})

  // Move-to-category dropdown state: key + fixed position for portal
  const [movingPromptKey, setMovingPromptKey] = useState<string | null>(null)
  const [moveDropdownPos, setMoveDropdownPos] = useState<{ top: number; left: number } | null>(null)

  const openMoveDropdown = useCallback((key: string, buttonEl: HTMLElement) => {
    if (movingPromptKey === key) {
      setMovingPromptKey(null)
      setMoveDropdownPos(null)
      return
    }
    const rect = buttonEl.getBoundingClientRect()
    const dropdownHeight = 320
    const spaceBelow = window.innerHeight - rect.bottom
    const top = spaceBelow < dropdownHeight ? Math.max(8, rect.top - dropdownHeight + rect.height) : rect.bottom + 4
    const left = Math.max(8, rect.right - 210)
    setMoveDropdownPos({ top, left })
    setMovingPromptKey(key)
  }, [movingPromptKey])

  useEffect(() => {
    if (!movingPromptKey) return
    const close = () => { setMovingPromptKey(null); setMoveDropdownPos(null) }
    document.addEventListener('click', close)
    return () => document.removeEventListener('click', close)
  }, [movingPromptKey])

  // Starred section expanded + visible count (show 5 at a time)
  const [starredExpanded, setStarredExpanded] = useState(true)
  const [starredVisibleCount, setStarredVisibleCount] = useState(5)

  useEffect(() => {
    if (currentUser?.id) {
      fetchHistory()
      fetchCategories()
    }
  }, [currentUser, historyRefreshTrigger])

  // Refetch selected convo detail when history was updated (e.g. new follow-ups added)
  useEffect(() => {
    if (historyRefreshTrigger > 0 && selectedConvo?.id) {
      fetchDetail(selectedConvo.id)
    }
  }, [historyRefreshTrigger])

  // Close selected chat when clicking outside the open detail panel.
  useEffect(() => {
    if (activeSubTab !== 'history' || !selectedConvo) return

    const handleOutsideClick = (event: MouseEvent) => {
      if (convoCardClickedRef.current) {
        convoCardClickedRef.current = false
        return
      }
      if (!detailPanelRef.current) return
      if (detailPanelRef.current.contains(event.target as Node)) return
      setSelectedConvo(null)
      setExpandAllDetailSections(false)
      setDetailTokenTab(null)
    }

    document.addEventListener('mousedown', handleOutsideClick)
    return () => {
      document.removeEventListener('mousedown', handleOutsideClick)
    }
  }, [activeSubTab, selectedConvo])

  // --- Categories data fetching ---
  const fetchCategories = async () => {
    try {
      const response = await api.get(`/stats/${currentUser.id}/categories`)
      setCategoriesData(response.data.categories || {})
    } catch (error: any) {
      console.error('Error fetching categories:', error)
      setCategoriesData({})
    }
  }

  const handleClearCategoryPrompts = (category: string, e?: any) => {
    if (e) {
      e.preventDefault()
      e.stopPropagation()
    }
    setCategoryToClear(category)
    setShowClearCategoryConfirm(true)
  }

  const clearCategoryPrompts = async () => {
    if (!currentUser?.id || !categoryToClear) return
    try {
      const encodedCategory = encodeURIComponent(categoryToClear)
      await api.delete(`/stats/${currentUser.id}/categories/${encodedCategory}/prompts`)
      await fetchCategories()
    } catch (error: any) {
      console.error('[Clear Category] Error:', error)
      alert(`Failed to clear category prompts: ${error.response?.data?.error || error.message || 'Unknown error'}`)
    } finally {
      setCategoryToClear(null)
    }
  }

  const handleDeleteSinglePrompt = async (category: string, promptIndex: number) => {
    if (!currentUser?.id) return
    try {
      const encodedCategory = encodeURIComponent(category)
      await api.delete(`/stats/${currentUser.id}/categories/${encodedCategory}/prompts/${promptIndex}`)
      await fetchCategories()
    } catch (error: any) {
      console.error('[Delete Prompt] Error:', error)
      alert(`Failed to delete prompt: ${error.response?.data?.error || error.message || 'Unknown error'}`)
    }
  }

  const handleMovePrompt = async (sourceCategory: string, promptIndex: number, targetCategory: string) => {
    if (!currentUser?.id || sourceCategory === targetCategory) return
    setMovingPromptKey(null)
    try {
      const encodedCategory = encodeURIComponent(sourceCategory)
      await api.post(`/stats/${currentUser.id}/categories/${encodedCategory}/prompts/${promptIndex}/move`, { targetCategory })
      await Promise.all([fetchCategories(), fetchHistory()])
    } catch (error: any) {
      console.error('[Move Prompt] Error:', error)
      alert(`Failed to move prompt: ${error.response?.data?.error || error.message || 'Unknown error'}`)
    }
  }

  const formatNumber = (num: number) => {
    if (num >= 1000000) return `${(num / 1000000).toFixed(2)  }M`
    if (num >= 1000) return `${(num / 1000).toFixed(2)  }K`
    return num.toLocaleString()
  }

  const hasSummaryForConversation = (convo: any) => {
    if (!convo) return false
    if (typeof convo.hasSummary === 'boolean') return convo.hasSummary
    if (typeof convo.summaryText === 'string' && convo.summaryText.trim().length > 0) return true
    if (!convo.summary) return false
    if (typeof convo.summary === 'string') return convo.summary.trim().length > 0
    return !!(
      (typeof convo.summary.text === 'string' && convo.summary.text.trim().length > 0) ||
      (typeof convo.summary.summary === 'string' && convo.summary.summary.trim().length > 0) ||
      (typeof convo.summary.initialSummary === 'string' && convo.summary.initialSummary.trim().length > 0)
    )
  }

  const isWinningChat = (convo: any) => {
    if (!winningPrompts || winningPrompts.length === 0) return false
    const convoPrompt = (convo.originalPrompt || convo.title || '').trim().toLowerCase()
    if (!convoPrompt) return false
    return winningPrompts.some((win: any) => {
      const winPrompt = (win.promptText || '').trim().toLowerCase()
      if (!winPrompt) return false
      return convoPrompt === winPrompt || winPrompt.includes(convoPrompt) || convoPrompt.includes(winPrompt)
    })
  }

  const fetchHistory = async () => {
    setLoading(true)
    try {
      const res = await api.get(`/history/${currentUser.id}`)
      setHistory(res.data.history || [])
    } catch (error: any) {
      console.error('[History] Error fetching:', error)
    }
    setLoading(false)
  }

  const fetchDetail = async (historyId: string) => {
    setLoadingDetail(true)
    setExpandedSources({})
    setDetailTokenTab(null)
    try {
      const res = await api.get(`/history/detail/${historyId}`)
      setSelectedConvo(res.data.conversation)
    } catch (error: any) {
      console.error('[History] Error fetching detail:', error)
      alert('Failed to load conversation details.')
    }
    setLoadingDetail(false)
  }

  const normalizeText = (text: any) => (text || '').toString().trim().replace(/\s+/g, ' ').toLowerCase()

  const findBestHistoryMatchForPrompt = (prompt: any) => {
    if (!prompt || history.length === 0) return null

    const promptTextNorm = normalizeText(prompt.text)
    const promptTimestamp = prompt.timestamp ? new Date(prompt.timestamp).getTime() : null

    let best: any = null
    let bestScore = -1

    history.forEach((convo) => {
      const convoPromptNorm = normalizeText(convo.originalPrompt)
      const convoTitleNorm = normalizeText(convo.title)
      let score = 0

      if (promptTextNorm) {
        if (convoPromptNorm && convoPromptNorm === promptTextNorm) score += 120
        else if (convoPromptNorm && convoPromptNorm.includes(promptTextNorm)) score += 90
        else if (convoPromptNorm && promptTextNorm.includes(convoPromptNorm) && convoPromptNorm.length > 16) score += 70

        if (convoTitleNorm && convoTitleNorm === promptTextNorm) score += 100
        else if (convoTitleNorm && (convoTitleNorm.includes(promptTextNorm) || promptTextNorm.includes(convoTitleNorm))) score += 55
      }

      if (promptTimestamp && convo.savedAt) {
        const convoTime = new Date(convo.savedAt).getTime()
        const diffMinutes = Math.abs(convoTime - promptTimestamp) / 60000
        if (diffMinutes <= 2) score += 35
        else if (diffMinutes <= 15) score += 20
        else if (diffMinutes <= 60) score += 10
      }

      if (score > bestScore) {
        bestScore = score
        best = convo
      }
    })

    return bestScore > 0 ? best : null
  }

  const handleOpenPromptInHistory = async (prompt: any) => {
    setPromptTooltip({ visible: false, x: 0, y: 0 })

    const matchedConvo = findBestHistoryMatchForPrompt(prompt)
    if (!matchedConvo) {
      alert('Could not find this prompt in Chat History yet.')
      return
    }

    setActiveSubTab('history')

    // Ensure the matching year/month/day are expanded so the selected convo is visible in the list.
    const year = getYear(matchedConvo.savedAt)
    const monthKey = getMonthKey(matchedConvo.savedAt)
    const dayKey = getDayKey(matchedConvo.savedAt)
    setExpandedYears((prev) => ({ ...prev, [year]: true }))
    setExpandedMonths((prev) => ({ ...prev, [monthKey]: true }))
    setExpandedDays((prev) => ({ ...prev, [dayKey]: true }))

    // Open detail but keep sections collapsed — user clicks to expand, same as normal history flow.
    setExpandAllDetailSections(false)
    setDetailTokenTab(null)
    await fetchDetail(matchedConvo.id)
  }

  const handleDelete = async (historyId: string) => {
    try {
      setDeletingId(historyId)
      await api.delete(`/history/${historyId}`)
      setHistory(prev => prev.filter(c => c.id !== historyId))
      if (selectedConvo?.id === historyId) {
        setSelectedConvo(null)
        setDetailTokenTab(null)
      }
      setConfirmDeleteId(null)
      fetchCategories()
    } catch (error: any) {
      console.error('[History] Error deleting:', error)
      alert('Failed to delete conversation.')
    } finally {
      setDeletingId(null)
    }
  }

  const handleToggleStar = async (convoId: string, e?: any) => {
    if (e) { e.stopPropagation(); e.preventDefault() }
    const convo = history.find(c => c.id === convoId)
    if (!convo) return
    const newStarred = !convo.starred
    setHistory(prev => prev.map(c => c.id === convoId ? { ...c, starred: newStarred } : c))
    try {
      await api.post('/history/star', {
        historyId: convoId,
        starred: newStarred,
      })
    } catch (error: any) {
      console.error('[History] Error toggling star:', error)
      setHistory(prev => prev.map(c => c.id === convoId ? { ...c, starred: !newStarred } : c))
    }
  }

  const handleContinueConversation = async (convoId: string, e?: any) => {
    if (e) { e.stopPropagation(); e.preventDefault() }
    try {
      const res = await api.get(`/history/detail/${convoId}`)
      const convo = res.data.conversation
      if (!convo) return

      // Clear current state first
      clearResponses()

      // Restore server-side conversation context
      await api.post('/history/restore-context', {
        historyId: convoId,
      })

      // Restore responses into the store (keep modelName->responseId map for restoring follow-up turns)
      const modelNameToResponseId: Record<string, any> = {}
      ;(convo.responses || []).forEach((r: any) => {
        const id = `${r.modelName}-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`
        modelNameToResponseId[r.modelName] = id
        addResponse({
          id,
          modelName: r.modelName,
          actualModelName: r.actualModelName || r.modelName,
          originalModelName: r.modelName,
          text: r.text || '',
          error: r.error || false,
          tokens: r.tokens || null,
          isStreaming: false,
          sources: convo.sources || [],
        })
      })

      // Restore council column follow-up turns so they appear when continuing
      const modelTurns = (convo.conversationTurns || []).filter((t: any) => t.type !== 'judge' && t.modelName)
      const initialCouncilConvo: Record<string, any> = {}
      modelTurns.forEach((turn: any) => {
        const responseId = modelNameToResponseId[turn.modelName]
        if (responseId) {
          if (!initialCouncilConvo[responseId]) initialCouncilConvo[responseId] = []
          initialCouncilConvo[responseId].push({
            user: turn.user,
            assistant: turn.assistant,
            timestamp: turn.timestamp ? new Date(turn.timestamp).getTime() : Date.now(),
          })
        }
      })
      useStore.getState().setCouncilColumnConvoHistory(initialCouncilConvo)

      // Restore summary
      if (convo.summary) {
        const judgeTurns = (convo.conversationTurns || []).filter((t: any) => t.type === 'judge')
        setSummary({
          text: convo.summary.text || '',
          consensus: convo.summary.consensus || null,
          agreements: convo.summary.agreements || [],
          disagreements: convo.summary.disagreements || [],
          differences: convo.summary.differences || [],
          singleModel: convo.summary.singleModel || false,
          modelName: convo.summary.modelName || null,
          conversationHistory: judgeTurns.map((t: any) => ({
            user: t.user,
            assistant: t.assistant,
            timestamp: t.timestamp,
          })),
        })
      }

      // Restore sources
      if (convo.sources && convo.sources.length > 0) {
        setSearchSources(convo.sources)
      }

      // Set prompt and history tracking
      setLastSubmittedPrompt(convo.originalPrompt || '')
      setLastSubmittedCategory(convo.category || '')
      setCurrentHistoryId(convoId)
      setIsReopenedHistoryChat(true)
      setCurrentPrompt('')
      setSummaryMinimized(false)

      // Navigate to chat
      setActiveTab('home')
    } catch (error: any) {
      console.error('[History] Error continuing conversation:', error)
      alert('Failed to load conversation. Please try again.')
    }
  }

  // --- Date helpers ---
  const getYear = (dateStr: string) => new Date(dateStr).getFullYear()
  const getMonthKey = (dateStr: string) => {
    const d = new Date(dateStr)
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
  }
  const getDayKey = (dateStr: string) => new Date(dateStr).toISOString().split('T')[0]
  const getMonthLabel = (monthKey: string) => {
    const [, month] = monthKey.split('-')
    return MONTH_NAMES[parseInt(month, 10) - 1]
  }
  const getDayLabel = (dayKey: string) => {
    const d = new Date(`${dayKey  }T12:00:00`)
    return d.toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' })
  }
  const formatTime = (dateStr: string) => {
    const d = new Date(dateStr)
    return d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })
  }

  // --- Build hierarchy: Year → Month → Day → convos ---
  const buildHierarchy = () => {
    const years: Record<string, any> = {}
    history.forEach((convo: any) => {
      const year = getYear(convo.savedAt)
      const monthKey = getMonthKey(convo.savedAt)
      const dayKey = getDayKey(convo.savedAt)
      if (!years[year]) years[year] = {}
      if (!years[year][monthKey]) years[year][monthKey] = {}
      if (!years[year][monthKey][dayKey]) years[year][monthKey][dayKey] = []
      years[year][monthKey][dayKey].push(convo)
    })
    return years
  }

  const hierarchy = buildHierarchy()
  const sortedYears = Object.keys(hierarchy).sort((a, b) => Number(b) - Number(a))

  // Auto-expand all years, and today's month + day so current chats are visible immediately
  useEffect(() => {
    if (sortedYears.length > 0) {
      const now = new Date()
      const todayYear = now.getFullYear()
      const todayMonthKey = `${todayYear}-${String(now.getMonth() + 1).padStart(2, '0')}`
      const todayDayKey = now.toISOString().split('T')[0]

      setExpandedYears(prev => {
        const updated = { ...prev }
        sortedYears.forEach(year => {
          if (updated[year] === undefined) updated[year] = true
        })
        return updated
      })
      setExpandedMonths(prev => {
        if (prev[todayMonthKey] === undefined) return { ...prev, [todayMonthKey]: true }
        return prev
      })
      setExpandedDays(prev => {
        if (prev[todayDayKey] === undefined) return { ...prev, [todayDayKey]: true }
        return prev
      })
    }
  }, [history])

  const toggleYear = (year: string) => setExpandedYears(prev => ({ ...prev, [year]: !prev[year] }))
  const toggleMonth = (monthKey: string) => setExpandedMonths(prev => ({ ...prev, [monthKey]: !prev[monthKey] }))
  const toggleDay = (dayKey: string) => setExpandedDays(prev => ({ ...prev, [dayKey]: !prev[dayKey] }))

  // Count convos in a given scope
  const countInYear = (yearData: any) => Object.values(yearData).reduce((sum: number, months: any) => sum + Object.values(months).reduce((s: number, days: any) => s + days.length, 0), 0)
  const countInMonth = (monthData: any) => Object.values(monthData).reduce((sum: number, days: any) => sum + days.length, 0)

  // --- Render a conversation card ---
  const renderConvoCard = (convo: any) => {
    const modelCount = convo.modelCount || convo.responses?.length || 0
    const hasSummary = hasSummaryForConversation(convo)

    return (
      <motion.div
      key={convo.id}
      onMouseDown={() => { convoCardClickedRef.current = true }}
      onClick={() => {
        if (selectedConvo?.id === convo.id) {
          setSelectedConvo(null)
          setExpandAllDetailSections(false)
          setDetailTokenTab(null)
        } else {
          setExpandAllDetailSections(false)
          fetchDetail(convo.id)
        }
      }}
      style={{
        background: selectedConvo?.id === convo.id
          ? `${currentTheme.accent}15`
          : 'transparent',
        border: `1px solid ${selectedConvo?.id === convo.id ? `${currentTheme.accent  }40` : currentTheme.borderLight}`,
        borderRadius: radius.lg,
        padding: `${spacing.lg} 14px`,
        marginBottom: spacing.sm,
        cursor: 'pointer',
        transition: transition.normal,
      }}
      whileHover={{
        background: `${currentTheme.accent}08`,
        borderColor: `${currentTheme.accent}30`,
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          {/* Model chips */}
          <div style={sx(layout.flexRow, { gap: spacing.sm, marginBottom: '5px', flexWrap: 'wrap' })}>
            {convo.isSingleModel ? (
              <span style={sx(layout.flexRow, {
                fontSize: fontSize['2xs'], fontWeight: fontWeight.semibold, color: '#a855f7',
                textTransform: 'uppercase', letterSpacing: '0.5px',
                gap: spacing.xs,
              })}>
                <MessageCircle size={12} /> Single Model
              </span>
            ) : (
              <span style={sx(layout.flexRow, {
                fontSize: fontSize['2xs'], fontWeight: fontWeight.semibold, color: '#60a5fa',
                textTransform: 'uppercase', letterSpacing: '0.5px',
                gap: spacing.xs,
              })}>
                <Layers size={12} /> Council ({modelCount} models {hasSummary ? 'and summary' : 'no summary'})
              </span>
            )}
            <span style={sx(layout.flexRow, {
              fontSize: fontSize['2xs'], fontWeight: fontWeight.semibold, color: (convo.promptMode || 'general') === 'debate' ? '#E74C3C' : currentTheme.textMuted,
              textTransform: 'uppercase', letterSpacing: '0.5px',
              gap: spacing.xs,
            })}>
              {(convo.promptMode || 'general') === 'debate' ? <Swords size={12} /> : <MessageCircle size={12} />}
              {(convo.promptMode || 'general') === 'debate' ? 'Debate Mode' : 'General Mode'}
            </span>
            {convo.consensus !== null && (
              <span style={{
                padding: `${spacing.px} ${spacing.sm}`, borderRadius: radius.md, fontSize: fontSize['2xs'], fontWeight: fontWeight.semibold,
                background: convo.consensus >= 80 ? 'rgba(72, 201, 176, 0.15)' : convo.consensus >= 50 ? 'rgba(241, 196, 15, 0.15)' : 'rgba(255, 107, 107, 0.15)',
                color: convo.consensus >= 80 ? '#48c9b0' : convo.consensus >= 50 ? '#f1c40f' : currentTheme.error,
              }}>
                {convo.consensus}%
              </span>
            )}
            {isWinningChat(convo) && (
              <span style={{
                padding: `${spacing['2xs']} ${spacing.md}`, borderRadius: radius.md, fontSize: fontSize['2xs'], fontWeight: fontWeight.bold,
                background: 'linear-gradient(135deg, rgba(255, 215, 0, 0.15), rgba(255, 165, 0, 0.15))',
                border: '1px solid rgba(255, 215, 0, 0.3)',
                color: '#FFD700',
                display: 'flex', alignItems: 'center', gap: spacing.xs,
                textTransform: 'uppercase', letterSpacing: '0.5px',
              }}>
                <Trophy size={10} /> Winning Chat
              </span>
            )}
          </div>
          {/* Title / prompt - click to expand full text */}
          <p
            style={{
              color: currentTheme.text, fontSize: '0.88rem', fontWeight: fontWeight.medium,
              margin: `0 0 ${spacing.xs} 0`, lineHeight: '1.3',
              overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
            }}
          >
            {convo.title}
          </p>
          <div style={sx(layout.flexRow, { gap: spacing.md })}>
            <span style={sx(layout.flexRow, { fontSize: fontSize.xs, color: currentTheme.textMuted, gap: '3px' })}>
              <Clock size={10} /> {formatTime(convo.savedAt)}
            </span>
            {convo.category && (
              <span style={{
                padding: `${spacing.px} ${spacing.sm}`, background: currentTheme.buttonBackground,
                borderRadius: radius.xs, fontSize: fontSize['2xs'], color: currentTheme.textMuted,
              }}>
                {convo.category}
              </span>
            )}
          </div>
        </div>
        {/* Actions: star, continue, delete */}
        <div style={sx(layout.flexRow, { gap: spacing['2xs'], flexShrink: 0 })}>
          {confirmDeleteId === convo.id ? (
            <div style={{ display: 'flex', gap: spacing.xs, alignItems: 'center' }} onClick={(e) => e.stopPropagation()}>
              <button
                onClick={(e) => { e.stopPropagation(); handleDelete(convo.id) }}
                disabled={deletingId === convo.id}
                style={{
                  background: 'rgba(255, 107, 107, 0.15)', border: '1px solid rgba(255, 107, 107, 0.4)',
                  borderRadius: radius.sm, padding: `${spacing.xs} ${spacing.md}`, color: currentTheme.error,
                  fontSize: '0.68rem', fontWeight: fontWeight.semibold, cursor: deletingId === convo.id ? 'default' : 'pointer',
                  opacity: deletingId === convo.id ? 0.5 : 1, whiteSpace: 'nowrap',
                }}
              >
                {deletingId === convo.id ? '...' : 'Delete'}
              </button>
              <button
                onClick={(e) => { e.stopPropagation(); setConfirmDeleteId(null) }}
                style={{
                  background: currentTheme.buttonBackground, border: `1px solid ${currentTheme.borderLight}`,
                  borderRadius: radius.sm, padding: `${spacing.xs} ${spacing.md}`, color: currentTheme.textSecondary,
                  fontSize: '0.68rem', cursor: 'pointer', whiteSpace: 'nowrap',
                }}
              >
                No
              </button>
            </div>
          ) : (
            <>
              <button
                onClick={(e) => handleToggleStar(convo.id, e)}
                style={{
                  background: 'transparent', border: 'none', cursor: 'pointer',
                  padding: spacing.xs, borderRadius: radius.xs, opacity: convo.starred ? 1 : 0.55,
                  transition: transition.fast,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}
                onMouseEnter={(e) => { e.currentTarget.style.opacity = '1'; e.currentTarget.style.transform = 'scale(1.15)' }}
                onMouseLeave={(e) => { e.currentTarget.style.opacity = convo.starred ? '1' : '0.55'; e.currentTarget.style.transform = 'scale(1)' }}
                title={convo.starred ? 'Unstar' : 'Star'}
              >
                <Star size={16} color="#f59e0b" fill={convo.starred ? '#f59e0b' : 'none'} />
              </button>
              <button
                onClick={(e) => handleContinueConversation(convo.id, e)}
                style={{
                  background: `${currentTheme.accent}12`, border: `1px solid ${currentTheme.accent}30`,
                  cursor: 'pointer',
                  padding: '3px 8px', borderRadius: radius.sm,
                  color: currentTheme.accent,
                  fontSize: '0.68rem', fontWeight: fontWeight.semibold,
                  whiteSpace: 'nowrap',
                  transition: transition.fast,
                  display: 'flex', alignItems: 'center',
                }}
                onMouseEnter={(e) => { e.currentTarget.style.background = `${currentTheme.accent}25`; e.currentTarget.style.borderColor = `${currentTheme.accent}50` }}
                onMouseLeave={(e) => { e.currentTarget.style.background = `${currentTheme.accent}12`; e.currentTarget.style.borderColor = `${currentTheme.accent}30` }}
              >
                Continue
              </button>
              <button
                onClick={(e) => { e.stopPropagation(); setConfirmDeleteId(convo.id) }}
                style={{
                  background: 'transparent', border: 'none', cursor: 'pointer',
                  padding: spacing.xs, borderRadius: radius.xs, opacity: 0.4, transition: 'opacity 0.15s',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}
                onMouseEnter={(e) => { e.currentTarget.style.opacity = '1' }}
                onMouseLeave={(e) => { e.currentTarget.style.opacity = '0.4' }}
                title="Delete"
              >
                <Trash2 size={14} color={currentTheme.error} />
              </button>
              <ChevronRight size={14} color={currentTheme.textMuted} />
            </>
          )}
        </div>
      </div>
      </motion.div>
    )
  }

  // --- Render sources section ---
  const renderSourcesSection = (sources: any[], toggleKey: string, label = 'Sources') => {
    if (!sources || !Array.isArray(sources) || sources.length === 0) return null
    const isOpen = expandedSources[toggleKey]
    return (
      <div style={{ marginTop: spacing.md, marginBottom: spacing.md }}>
        <button
          onClick={() => setExpandedSources(prev => ({ ...prev, [toggleKey]: !prev[toggleKey] }))}
          style={{
            display: 'flex', alignItems: 'center', gap: spacing.sm, padding: `${spacing.sm} ${spacing.lg}`,
            background: isOpen ? `${currentTheme.accent}15` : currentTheme.buttonBackground,
            border: `1px solid ${isOpen ? currentTheme.accent : currentTheme.borderLight}`,
            borderRadius: radius.md, color: currentTheme.accent, fontSize: '0.78rem', fontWeight: fontWeight.medium,
            cursor: 'pointer', transition: transition.normal,
          }}
        >
          <Globe size={13} />
          {label} ({sources.length})
          <ChevronDown size={13} style={{ transform: isOpen ? 'rotate(180deg)' : 'rotate(0deg)', transition: 'transform 0.2s' }} />
        </button>
        {isOpen && (
          <div style={{ marginTop: spacing.sm, display: 'flex', flexDirection: 'column', gap: spacing.xs, maxHeight: '200px', overflowY: 'auto' }}>
            {sources.map((source, sIdx) => (
              <a key={sIdx} href={source.link || source.url || '#'} target="_blank" rel="noopener noreferrer"
                style={{
                  display: 'block', padding: `${spacing.md} ${spacing.lg}`,
                  background: currentTheme.buttonBackground,
                  border: `1px solid ${currentTheme.borderLight}`,
                  borderRadius: radius.sm, textDecoration: 'none', transition: 'border-color 0.2s',
                }}
                onMouseEnter={(e) => { e.currentTarget.style.borderColor = currentTheme.accent }}
                onMouseLeave={(e) => { e.currentTarget.style.borderColor = currentTheme.borderLight }}
              >
                <div style={{ color: currentTheme.accent, fontSize: '0.82rem', fontWeight: fontWeight.medium }}>
                  {source.title || source.link || source.url || `Source ${sIdx + 1}`}
                </div>
                {source.snippet && (
                  <div style={{ color: currentTheme.textMuted, fontSize: fontSize.sm, marginTop: '3px', lineHeight: '1.4' }}>
                    {source.snippet.substring(0, 120)}{source.snippet.length > 120 ? '...' : ''}
                  </div>
                )}
              </a>
            ))}
          </div>
        )}
      </div>
    )
  }

  // --- Detail view ---
  const renderDetail = () => {
    if (!selectedConvo) return null
    const selectedModelCount = selectedConvo.modelCount || selectedConvo.responses?.length || 0
    const selectedHasSummary = hasSummaryForConversation(selectedConvo)
    const formatDate = (dateStr: string) => {
      const d = new Date(dateStr)
      return `${d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) 
        } at ${  d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}`
    }

    return (
      <motion.div
        ref={detailPanelRef}
        initial={{ opacity: 0, x: 16 }}
        animate={{ opacity: 1, x: 0 }}
        exit={{ opacity: 0, x: 16 }}
        transition={{ duration: 0.2, ease: [0.25, 0.1, 0.25, 1] }}
        style={{
          background: currentTheme.backgroundOverlay,
          border: `1px solid ${currentTheme.borderLight}`,
          borderRadius: radius['2xl'],
          padding: `${spacing['3xl']} ${spacing['3xl']} 14px ${spacing['3xl']}`,
          overflowY: 'auto',
          maxHeight: 'calc(100vh - 100px)',
          willChange: 'transform, opacity',
        }}
      >
        {/* Sticky close button — stays visible while scrolling through responses */}
        <div style={{
          position: 'sticky',
          top: '0px',
          zIndex: 10,
          display: 'flex',
          justifyContent: 'flex-end',
          pointerEvents: 'none',
          marginBottom: '-34px',
        }}>
          <button
            onClick={() => {
              setSelectedConvo(null)
              setExpandAllDetailSections(false)
              setDetailTokenTab(null)
            }}
            style={sx(layout.center, {
              background: 'rgba(255, 107, 107, 0.12)',
              border: '1px solid rgba(255, 107, 107, 0.35)',
              borderRadius: radius.md,
              cursor: 'pointer',
              padding: spacing.sm,
              color: currentTheme.error,
              transition: transition.normal,
              flexShrink: 0,
              pointerEvents: 'auto',
              backdropFilter: 'blur(8px)',
              boxShadow: '0 2px 8px rgba(0, 0, 0, 0.2)',
            })}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = 'rgba(255, 107, 107, 0.28)'
              e.currentTarget.style.borderColor = 'rgba(255, 107, 107, 0.6)'
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = 'rgba(255, 107, 107, 0.12)'
              e.currentTarget.style.borderColor = 'rgba(255, 107, 107, 0.35)'
            }}
            title="Close"
          >
            <X size={18} />
          </button>
        </div>

        {/* Header */}
        <div style={{ marginBottom: spacing['2xl'], paddingRight: '36px' }}>
          <h2 style={{ fontSize: '1.4rem', color: currentTheme.text, margin: `0 0 ${spacing.md} 0`, lineHeight: '1.3' }}>
            {selectedConvo.title}
          </h2>
          <div style={sx(layout.flexRow, { gap: spacing.lg, flexWrap: 'wrap' })}>
            <span style={{
              padding: '4px 10px',
              background: selectedConvo.responses?.length > 1 ? 'rgba(59, 130, 246, 0.15)' : 'rgba(168, 85, 247, 0.15)',
              border: `1px solid ${selectedConvo.responses?.length > 1 ? 'rgba(59, 130, 246, 0.4)' : 'rgba(168, 85, 247, 0.4)'}`,
              borderRadius: radius.sm, fontSize: fontSize.sm,
              color: selectedConvo.responses?.length > 1 ? '#60a5fa' : '#a855f7',
              fontWeight: fontWeight.semibold,
            }}>
              {selectedConvo.responses?.length > 1
                ? `Council (${selectedModelCount} models ${selectedHasSummary ? 'and summary' : 'no summary'})`
                : 'Single Model'}
            </span>
            <span style={{
              padding: '4px 10px',
              background: (selectedConvo.promptMode || 'general') === 'debate' ? 'rgba(231, 76, 60, 0.15)' : currentTheme.buttonBackground,
              border: `1px solid ${(selectedConvo.promptMode || 'general') === 'debate' ? 'rgba(231, 76, 60, 0.4)' : currentTheme.borderLight}`,
              borderRadius: radius.sm, fontSize: fontSize.sm,
              color: (selectedConvo.promptMode || 'general') === 'debate' ? '#E74C3C' : currentTheme.textSecondary,
              fontWeight: fontWeight.semibold,
              display: 'flex', alignItems: 'center', gap: spacing.xs,
            }}>
              {(selectedConvo.promptMode || 'general') === 'debate' ? <Swords size={12} /> : <MessageCircle size={12} />}
              {(selectedConvo.promptMode || 'general') === 'debate' ? 'Debate Mode' : 'General Mode'}
            </span>
            <span style={{ fontSize: fontSize.md, color: currentTheme.textMuted }}>
              {formatDate(selectedConvo.savedAt)}
            </span>
            {selectedConvo.category && (
              <span style={{
                padding: '3px 8px', background: currentTheme.buttonBackground,
                borderRadius: radius.xs, fontSize: fontSize.sm, color: currentTheme.textSecondary,
              }}>
                {selectedConvo.category}
              </span>
            )}
            {selectedConvo.postedToFeed ? (
              <span style={{
                padding: '3px 8px',
                background: 'rgba(72, 201, 176, 0.12)',
                border: '1px solid rgba(72, 201, 176, 0.35)',
                borderRadius: radius.sm, fontSize: fontSize.xs, fontWeight: fontWeight.semibold,
                color: '#48c9b0',
                display: 'flex', alignItems: 'center', gap: spacing.xs,
              }}>
                <Globe size={11} /> Posted to Feed
              </span>
            ) : (
              <span style={{
                padding: '3px 8px',
                background: 'rgba(255, 255, 255, 0.04)',
                border: '1px solid rgba(255, 255, 255, 0.08)',
                borderRadius: radius.sm, fontSize: fontSize.xs, fontWeight: fontWeight.medium,
                color: currentTheme.textMuted,
              }}>
                Not Posted
              </span>
            )}
          </div>
          {/* Continue Conversation button */}
          <button
            onClick={() => handleContinueConversation(selectedConvo._id || selectedConvo.id)}
            style={sx(layout.flexRow, {
              marginTop: spacing.lg,
              gap: spacing.md,
              padding: `10px ${spacing['2xl']}`,
              background: `${currentTheme.accent}15`,
              border: `1px solid ${currentTheme.accent}40`,
              borderRadius: radius.lg,
              color: currentTheme.accent,
              fontSize: fontSize.base,
              fontWeight: fontWeight.semibold,
              cursor: 'pointer',
              transition: transition.normal,
            })}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = `${currentTheme.accent}25`
              e.currentTarget.style.borderColor = `${currentTheme.accent}60`
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = `${currentTheme.accent}15`
              e.currentTarget.style.borderColor = `${currentTheme.accent}40`
            }}
          >
            <Play size={16} />
            Continue Conversation
          </button>
        </div>

        {/* Original Prompt */}
        {selectedConvo.originalPrompt && (
          <div style={{
            background: currentTheme.buttonBackground,
            border: `1px solid ${currentTheme.borderLight}`,
            borderRadius: radius.xl, padding: spacing.xl, marginBottom: spacing['2xl'],
          }}>
            <div style={{ fontSize: fontSize.sm, color: currentTheme.accent, fontWeight: fontWeight.semibold, marginBottom: spacing.sm, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
              Your Prompt
            </div>
            <p style={{ color: currentTheme.text, margin: 0, lineHeight: '1.6', whiteSpace: 'pre-wrap' }}>
              {selectedConvo.originalPrompt}
            </p>
          </div>
        )}

        {/* Summary / Judge — includes judge conversation turns inside */}
        {selectedConvo.summary && selectedConvo.summary.text && (
          <ExpandableSummary
            summary={selectedConvo.summary}
            currentTheme={currentTheme}
            judgeTurns={(selectedConvo.conversationTurns || []).filter((t: any) => t.type === 'judge')}
            defaultExpanded={expandAllDetailSections}
          />
        )}

        {/* Model Responses + Continued Conversations (grouped per model) */}
        {selectedConvo.responses && selectedConvo.responses.length > 0 && (() => {
          // Group conversation turns by modelName so they appear under their model
          const turnsByModel: Record<string, any[]> = {}
          ;(selectedConvo.conversationTurns || []).forEach((turn: any) => {
            if (turn.type !== 'judge') {
              const key = turn.modelName || 'Unknown'
              if (!turnsByModel[key]) turnsByModel[key] = []
              turnsByModel[key].push(turn)
            }
          })

          // Sort: models that have continued conversations come first
          const sortedResponses = [...selectedConvo.responses].sort((a, b) => {
            const aName = a.modelName || a.actualModelName || ''
            const bName = b.modelName || b.actualModelName || ''
            const aHasTurns = turnsByModel[aName] ? 1 : 0
            const bHasTurns = turnsByModel[bName] ? 1 : 0
            return bHasTurns - aHasTurns
          })

          return (
            <div style={{ marginBottom: '0' }}>
              <h3 style={{ fontSize: fontSize['2xl'], color: currentTheme.text, marginBottom: spacing.lg }}>
                {selectedConvo.responses.length > 1 ? `Council Responses (${selectedConvo.responses.length} models)` : 'Model Response'}
              </h3>
              {sortedResponses.map((resp, idx) => {
                const modelName = resp.modelName || resp.actualModelName || `Model ${idx + 1}`
                const modelTurns = turnsByModel[modelName] || []
                return (
                  <ExpandableResponse
                    key={idx}
                    resp={resp}
                    idx={idx}
                    currentTheme={currentTheme}
                    conversationTurns={modelTurns}
                    defaultExpanded={expandAllDetailSections}
                  />
                )
              })}
            </div>
          )
        })()}

        {/* Token Usage & Cost Breakdown Tabs */}
        {selectedConvo.responses && selectedConvo.responses.some((r: any) => r.tokens) && (() => {
          const historyTokenData = selectedConvo.responses
            .filter((r: any) => r.tokens)
            .map((r: any) => {
              const providerKey = getProviderFromModelName(r.modelName || r.actualModelName)
              const modelName = r.modelName || r.actualModelName || 'Unknown'
              const modelPart = modelName.includes('-') ? modelName.substring(modelName.indexOf('-') + 1) : modelName
              return {
                modelName,
                isPipeline: false,
                isJudge: false,
                tokens: {
                  provider: providerKey,
                  model: modelPart,
                  input: r.tokens.input || 0,
                  output: r.tokens.output || 0,
                  total: r.tokens.total || ((r.tokens.input || 0) + (r.tokens.output || 0)),
                  reasoningTokens: r.tokens.reasoningTokens || 0,
                  source: r.tokens.source || 'api_response',
                  breakdown: r.tokens.breakdown || null,
                },
              }
            })

          return (
            <div style={{ marginBottom: spacing.xl }}>
              <div style={{
                display: 'flex', gap: spacing.md, marginBottom: spacing.lg,
              }}>
                <motion.button
                  onClick={() => setDetailTokenTab(detailTokenTab === 'tokens' ? null : 'tokens')}
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.97 }}
                  style={{
                    flex: 1,
                    padding: '10px 14px',
                    background: detailTokenTab === 'tokens' ? 'rgba(93, 173, 226, 0.15)' : currentTheme.buttonBackground,
                    border: `1px solid ${detailTokenTab === 'tokens' ? 'rgba(93, 173, 226, 0.5)' : currentTheme.borderLight}`,
                    borderRadius: radius.lg,
                    color: detailTokenTab === 'tokens' ? '#5dade2' : currentTheme.textSecondary,
                    fontSize: '0.82rem',
                    fontWeight: fontWeight.semibold,
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: spacing.sm,
                    transition: transition.normal,
                  }}
                >
                  <Coins size={14} />
                  Prompt Token Usage
                </motion.button>
                <motion.button
                  onClick={() => setDetailTokenTab(detailTokenTab === 'cost' ? null : 'cost')}
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.97 }}
                  style={{
                    flex: 1,
                    padding: '10px 14px',
                    background: detailTokenTab === 'cost' ? 'rgba(255, 215, 0, 0.12)' : currentTheme.buttonBackground,
                    border: `1px solid ${detailTokenTab === 'cost' ? 'rgba(255, 215, 0, 0.4)' : currentTheme.borderLight}`,
                    borderRadius: radius.lg,
                    color: detailTokenTab === 'cost' ? '#ffd700' : currentTheme.textSecondary,
                    fontSize: '0.82rem',
                    fontWeight: fontWeight.semibold,
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: spacing.sm,
                    transition: transition.normal,
                  }}
                >
                  <DollarSign size={14} />
                  Prompt Cost Breakdown
                </motion.button>
              </div>

              <AnimatePresence mode="wait">
                {detailTokenTab === 'tokens' && (
                  <motion.div
                    key="token-usage"
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: 'auto', opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={{ duration: 0.2 }}
                    style={{
                      overflow: 'hidden',
                      border: '1px solid rgba(93, 173, 226, 0.3)',
                      borderRadius: radius.xl,
                      background: 'rgba(0, 0, 0, 0.4)',
                    }}
                  >
                    <TokenUsageWindow
                      isOpen={true}
                      onClose={() => setDetailTokenTab(null)}
                      tokenData={historyTokenData}
                      inline={true}
                    />
                  </motion.div>
                )}
                {detailTokenTab === 'cost' && (
                  <motion.div
                    key="cost-breakdown"
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: 'auto', opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={{ duration: 0.2 }}
                    style={{
                      overflow: 'hidden',
                      border: '1px solid rgba(255, 215, 0, 0.3)',
                      borderRadius: radius.xl,
                      background: 'rgba(0, 0, 0, 0.4)',
                    }}
                  >
                    <CostBreakdownWindow
                      isOpen={true}
                      onClose={() => setDetailTokenTab(null)}
                      tokenData={historyTokenData}
                      queryCount={0}
                      inline={true}
                    />
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          )
        })()}

        {/* Sources */}
        {renderSourcesSection(selectedConvo.sources, 'detail_sources', 'Sources')}

        {/* Facts */}
        {selectedConvo.facts && selectedConvo.facts.length > 0 && (
          <div style={{
            background: currentTheme.buttonBackground,
            border: `1px solid ${currentTheme.borderLight}`,
            borderRadius: radius.xl, padding: spacing.xl,
          }}>
            <div style={{ fontSize: fontSize.sm, color: currentTheme.accent, fontWeight: fontWeight.semibold, marginBottom: '10px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
              Facts ({selectedConvo.facts.length})
            </div>
            {selectedConvo.facts.map((fact: any, idx: number) => (
              <p key={idx} style={{ color: currentTheme.textSecondary, fontSize: fontSize.base, margin: '0 0 6px 0', lineHeight: '1.5' }}>
                • {typeof fact === 'string' ? fact : fact.fact || fact.text || JSON.stringify(fact)}
              </p>
            ))}
          </div>
        )}
      </motion.div>
    )
  }

  // --- Categories render ---
  const renderCategories = () => {
    const allCategories = [
      'Science', 'Tech', 'Business', 'Health', 'Politics/Law',
      'History/Geography', 'Philosophy/Religion', 'Arts/Culture',
      'Lifestyle/Self-Improvement', 'General Knowledge/Other',
    ]

    // Build a lookup of prompts per category from the history data so that
    // conversations visible in the History sub-tab also appear here even when
    // the separate stats endpoint didn't capture them.
    const historyByCategory: Record<string, any[]> = {}
    ;(history || []).forEach((convo: any) => {
      const cat = convo.category
      if (!cat) return
      const matched = allCategories.find(c => c.toLowerCase() === cat.toLowerCase())
      if (!matched) return
      if (!historyByCategory[matched]) historyByCategory[matched] = []
      historyByCategory[matched].push({
        text: convo.title || convo.originalPrompt || '',
        timestamp: convo.savedAt || convo.createdAt || new Date().toISOString(),
      })
    })

    const allDataCategories = Object.keys(categoriesData || {})
    const categoriesWithData = allCategories.map((category) => {
      let categoryInfo = categoriesData?.[category]
      if (!categoryInfo) {
        const matchedKey = allDataCategories.find(key => key.toLowerCase() === category.toLowerCase())
        if (matchedKey) categoryInfo = categoriesData[matchedKey]
      }
      const statsPrompts = categoryInfo?.recentPrompts || []
      const statsCount = categoryInfo?.count || (typeof categoryInfo === 'number' ? categoryInfo : 0)

      // Merge history-derived prompts that aren't already in the stats list
      const historyPrompts = historyByCategory[category] || []
      const statsTexts = new Set(statsPrompts.map((p: any) => (p.text || '').trim().toLowerCase()))
      const extraFromHistory = historyPrompts.filter(hp => !statsTexts.has((hp.text || '').trim().toLowerCase()))
      const recentPrompts = [...statsPrompts, ...extraFromHistory].sort((a: any, b: any) =>
        new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
      )
      const count = Math.max(statsCount, recentPrompts.length)

      return { category, count, recentPrompts }
    })
    categoriesWithData.sort((a, b) => {
      if (b.count !== a.count) return b.count - a.count
      return a.category.localeCompare(b.category)
    })

    return (
    <>
      <div style={{
        background: currentTheme.backgroundOverlay,
        border: `1px solid ${currentTheme.borderLight}`,
        borderRadius: radius['2xl'],
        padding: spacing['4xl'],
      }}>
        <div style={sx(layout.flexCol, { gap: spacing.lg })}>
          {categoriesWithData.map(({ category, count, recentPrompts }) => {
            const isExpanded = expandedCategories[category]
            const hasPrompts = recentPrompts && recentPrompts.length > 0

            return (
              <div
                key={`${category}-${theme}`}
                style={{
                  background: count > 0 ? currentTheme.backgroundSecondary : currentTheme.backgroundTertiary,
                  border: `1px solid ${currentTheme.borderLight}`,
                  borderRadius: radius.xl,
                  overflow: 'hidden',
                  opacity: count > 0 ? 1 : 0.6,
                }}
              >
                {/* Category Header */}
                <div
                  key={`category-clickable-${category}-${theme}`}
                  onClick={() => {
                    setExpandedCategories((prev) => {
                      const wasExpanded = prev[category]
                      if (wasExpanded) {
                        setCategoryVisibleCount(prev2 => ({ ...prev2, [category]: 5 }))
                      }
                      return { ...prev, [category]: !wasExpanded }
                    })
                  }}
                  style={{
                    padding: `${spacing.xl} ${spacing['2xl']}`,
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    cursor: 'pointer',
                    transition: transition.normal,
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.background = count > 0 ? currentTheme.buttonBackgroundHover : currentTheme.backgroundTertiary
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.background = count > 0 ? currentTheme.backgroundSecondary : currentTheme.backgroundTertiary
                  }}
                >
                  <div key={`category-header-${category}-${theme}`} style={sx(layout.flexRow, { gap: spacing.lg, flex: 1 })}>
                    {isExpanded ? (
                      <ChevronDown size={20} color={count > 0 ? currentTheme.accent : currentTheme.textMuted} />
                    ) : (
                      <ChevronRight size={20} color={count > 0 ? currentTheme.accent : currentTheme.textMuted} />
                    )}
                    <span key={`category-title-${category}-${theme}`} style={{ color: count > 0 ? currentTheme.accent : currentTheme.textMuted, fontSize: fontSize['3xl'], textTransform: 'capitalize', fontWeight: fontWeight.medium }}>
                      {category}
                    </span>
                    {hasPrompts && (
                      <span key={`category-prompts-count-${category}-${theme}`} style={{ color: currentTheme.textMuted, fontSize: fontSize.base, marginLeft: spacing.md }}>
                        ({recentPrompts.length} {recentPrompts.length === 1 ? 'prompt' : 'prompts'}{isExpanded ? ' · double-click a chat to open in history' : ''})
                      </span>
                    )}
                    {!hasPrompts && count === 0 && (
                      <span key={`category-no-prompts-${category}-${theme}`} style={{ color: currentTheme.textMuted, fontSize: fontSize.base, marginLeft: spacing.md, fontStyle: 'italic' }}>
                        (no prompts yet)
                      </span>
                    )}
                  </div>
                  <span
                    key={`category-count-${category}-${theme}`}
                    style={{
                      fontSize: fontSize['4xl'],
                      fontWeight: fontWeight.bold,
                      background: count > 0 ? currentTheme.accentGradient : 'none',
                      WebkitBackgroundClip: count > 0 ? 'text' : 'unset',
                      WebkitTextFillColor: count > 0 ? 'transparent' : 'unset',
                      color: count > 0 ? currentTheme.accent : currentTheme.textMuted,
                      display: count > 0 ? 'inline-block' : 'inline',
                    }}
                  >
                    {formatNumber(count)}
                  </span>
                </div>

                {/* Recent Prompts List */}
                <AnimatePresence>
                  {isExpanded && (
                    <motion.div
                      key={`category-expanded-${category}-${theme}`}
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: 'auto', opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={{ duration: 0.2 }}
                      style={{ overflow: 'hidden' }}
                    >
                      <div key={`category-content-${category}-${theme}`} style={{ padding: `${spacing.lg} ${spacing['2xl']} ${spacing['2xl']} ${spacing['5xl']}`, borderTop: `1px solid ${currentTheme.borderLight}` }}>
                        {hasPrompts ? (
                          <div key={`prompts-list-${category}-${theme}`} style={{ display: 'flex', flexDirection: 'column', gap: spacing.md }}>
                            {/* Clear button */}
                            <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: spacing.md }}>
                              <button
                                onClick={(e) => handleClearCategoryPrompts(category, e)}
                                type="button"
                                style={{
                                  background: 'transparent',
                                  border: '1px solid rgba(255, 107, 107, 0.3)',
                                  borderRadius: radius.sm,
                                  padding: `${spacing.sm} ${spacing.lg}`,
                                  cursor: 'pointer',
                                  display: 'flex',
                                  alignItems: 'center',
                                  gap: spacing.sm,
                                  transition: transition.normal,
                                }}
                                onMouseEnter={(e) => {
                                  e.currentTarget.style.background = 'rgba(255, 107, 107, 0.1)'
                                  e.currentTarget.style.borderColor = 'rgba(255, 107, 107, 0.5)'
                                }}
                                onMouseLeave={(e) => {
                                  e.currentTarget.style.background = 'transparent'
                                  e.currentTarget.style.borderColor = 'rgba(255, 107, 107, 0.3)'
                                }}
                                title={`Clear all prompts for ${category}`}
                              >
                                <X size={14} color={currentTheme.error} />
                                <span style={{ color: currentTheme.error, fontSize: fontSize.sm }}>Clear Prompts</span>
                              </button>
                            </div>
                            {(() => {
                              const visibleCount = categoryVisibleCount[category] || 5
                              const visiblePrompts = recentPrompts.slice(0, visibleCount)
                              const hasMore = recentPrompts.length > visibleCount
                              const remaining = recentPrompts.length - visibleCount
                              const isShowingExtra = visibleCount > 5

                              return (
                                <>
                                  {visiblePrompts.map((prompt, index) => {
                                    const promptDate = new Date(prompt.timestamp)
                                    const formattedDate = promptDate.toLocaleDateString('en-US', {
                                      month: 'short', day: 'numeric', year: 'numeric',
                                      hour: '2-digit', minute: '2-digit',
                                    })
                                    return (
                                      <div
                                        key={`${category}-prompt-${index}-${theme}`}
                                        onDoubleClick={() => handleOpenPromptInHistory(prompt)}
                                        style={{
                                          background: theme === 'light' ? '#ffffff' : 'rgba(20, 20, 30, 0.9)',
                                          border: `1px solid ${currentTheme.borderLight}`,
                                          borderRadius: radius.md,
                                          padding: `${spacing.lg} ${spacing.xl}`,
                                          boxShadow: theme === 'light'
                                            ? '0 2px 8px rgba(0, 0, 0, 0.1), 0 1px 3px rgba(0, 0, 0, 0.06)'
                                            : '0 2px 8px rgba(0, 0, 0, 0.4), 0 1px 3px rgba(0, 0, 0, 0.3)',
                                          position: 'relative',
                                          cursor: 'pointer',
                                        }}
                                      >
                                        {/* Top-right action buttons */}
                                        <div style={{ position: 'absolute', top: '8px', right: '8px', display: 'flex', alignItems: 'center', gap: '2px' }}>
                                          <button
                                            onClick={(e) => {
                                              e.stopPropagation()
                                              const key = `${category}-${index}`
                                              openMoveDropdown(key, e.currentTarget)
                                            }}
                                            style={{
                                              background: movingPromptKey === `${category}-${index}` ? `${currentTheme.accent}20` : 'transparent',
                                              border: 'none', cursor: 'pointer',
                                              padding: spacing.xs, borderRadius: radius.xs,
                                              display: 'flex', alignItems: 'center', justifyContent: 'center',
                                              opacity: movingPromptKey === `${category}-${index}` ? 1 : 0.4, transition: transition.normal,
                                            }}
                                            onMouseEnter={(e) => {
                                              e.currentTarget.style.opacity = '1'
                                              e.currentTarget.style.background = `${currentTheme.accent}20`
                                            }}
                                            onMouseLeave={(e) => {
                                              if (movingPromptKey !== `${category}-${index}`) {
                                                e.currentTarget.style.opacity = '0.4'
                                                e.currentTarget.style.background = 'transparent'
                                              }
                                            }}
                                            title="Move to another category"
                                          >
                                            <ArrowRightLeft size={13} color={currentTheme.accent} />
                                          </button>
                                          <button
                                            onClick={(e) => {
                                              e.stopPropagation()
                                              handleDeleteSinglePrompt(category, index)
                                            }}
                                            style={{
                                              background: 'transparent', border: 'none', cursor: 'pointer',
                                              padding: spacing.xs, borderRadius: radius.xs,
                                              display: 'flex', alignItems: 'center', justifyContent: 'center',
                                              opacity: 0.4, transition: transition.normal,
                                            }}
                                            onMouseEnter={(e) => {
                                              e.currentTarget.style.opacity = '1'
                                              e.currentTarget.style.background = 'rgba(255, 107, 107, 0.15)'
                                            }}
                                            onMouseLeave={(e) => {
                                              e.currentTarget.style.opacity = '0.4'
                                              e.currentTarget.style.background = 'transparent'
                                            }}
                                            title="Delete this prompt"
                                          >
                                            <X size={14} color={currentTheme.error} />
                                          </button>
                                        </div>

                                        <p key={`${category}-prompt-text-${index}-${theme}`} style={{ color: currentTheme.textSecondary, fontSize: fontSize.lg, margin: '0 0 6px 0', lineHeight: '1.4', paddingRight: '50px' }}>
                                          {prompt.text}
                                        </p>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: spacing.md }}>
                                          <p key={`${category}-prompt-date-${index}-${theme}`} style={{ color: currentTheme.textMuted, fontSize: fontSize.sm, margin: 0 }}>
                                            {formattedDate}
                                          </p>
                                          {(() => {
                                            const promptNorm = (prompt.text || '').trim().toLowerCase()
                                            const isWin = promptNorm && winningPrompts?.some((win: any) => {
                                              const winNorm = (win.promptText || '').trim().toLowerCase()
                                              return winNorm && (promptNorm === winNorm || winNorm.includes(promptNorm) || promptNorm.includes(winNorm))
                                            })
                                            return isWin ? (
                                              <span style={{
                                                padding: '1px 7px', borderRadius: radius.md, fontSize: fontSize['2xs'], fontWeight: fontWeight.bold,
                                                background: 'linear-gradient(135deg, rgba(255, 215, 0, 0.15), rgba(255, 165, 0, 0.15))',
                                                border: '1px solid rgba(255, 215, 0, 0.3)',
                                                color: '#FFD700',
                                                display: 'inline-flex', alignItems: 'center', gap: '3px',
                                                textTransform: 'uppercase', letterSpacing: '0.5px',
                                              }}>
                                                <Trophy size={9} /> Winning Chat
                                              </span>
                                            ) : null
                                          })()}
                                        </div>
                                      </div>
                                    )
                                  })}

                                  {/* View more / Close buttons */}
                                  <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: spacing.xl, marginTop: spacing.md }}>
                                    {hasMore && (
                                      <button
                                        onClick={(e) => {
                                          e.stopPropagation()
                                          setCategoryVisibleCount(prev => ({
                                            ...prev,
                                            [category]: visibleCount + 5,
                                          }))
                                        }}
                                        style={{
                                          background: 'transparent',
                                          border: 'none',
                                          cursor: 'pointer',
                                          color: currentTheme.accent,
                                          fontSize: '0.82rem',
                                          fontWeight: fontWeight.medium,
                                          padding: `${spacing.sm} ${spacing.lg}`,
                                        }}
                                        onMouseEnter={(e) => { e.currentTarget.style.opacity = '0.7' }}
                                        onMouseLeave={(e) => { e.currentTarget.style.opacity = '1' }}
                                      >
                                        View {Math.min(5, remaining)} more
                                      </button>
                                    )}
                                    {isShowingExtra && (
                                      <button
                                        onClick={(e) => {
                                          e.stopPropagation()
                                          setCategoryVisibleCount(prev => ({
                                            ...prev,
                                            [category]: 5,
                                          }))
                                        }}
                                        style={{
                                          background: 'transparent',
                                          border: 'none',
                                          cursor: 'pointer',
                                          color: currentTheme.textMuted,
                                          fontSize: '0.78rem',
                                          fontWeight: fontWeight.normal,
                                          padding: `${spacing.sm} ${spacing.md}`,
                                        }}
                                        onMouseEnter={(e) => { e.currentTarget.style.opacity = '0.7' }}
                                        onMouseLeave={(e) => { e.currentTarget.style.opacity = '1' }}
                                      >
                                        Close
                                      </button>
                                    )}
                                  </div>
                                </>
                              )
                            })()}
                          </div>
                        ) : (
                          <p key={`${category}-no-prompts-msg-${theme}`} style={{ color: currentTheme.textMuted, fontSize: fontSize.lg, textAlign: 'center', padding: spacing['2xl'], fontStyle: 'italic' }}>
                            No prompts in this category yet.
                          </p>
                        )}
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            )
          })}
        </div>
      </div>

      {/* Portal-based move dropdown — renders outside all overflow:hidden containers */}
      {movingPromptKey && moveDropdownPos && (() => {
        const [sourceCat, idxStr] = [movingPromptKey.substring(0, movingPromptKey.lastIndexOf('-')), movingPromptKey.substring(movingPromptKey.lastIndexOf('-') + 1)]
        const promptIdx = parseInt(idxStr, 10)
        return ReactDOM.createPortal(
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              position: 'fixed',
              top: moveDropdownPos.top,
              left: moveDropdownPos.left,
              zIndex: 99999,
              background: theme === 'light' ? '#ffffff' : 'rgba(30, 30, 45, 0.98)',
              border: `1px solid ${currentTheme.accent}40`,
              borderRadius: radius.md,
              boxShadow: '0 8px 24px rgba(0, 0, 0, 0.4)',
              padding: '4px 0',
              minWidth: '210px',
              maxHeight: '320px',
              overflowY: 'auto',
            }}
          >
            <div style={{ padding: '6px 12px 4px', fontSize: fontSize.xs, color: currentTheme.textMuted, fontWeight: fontWeight.semibold, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
              Move to...
            </div>
            {[
              'Science', 'Tech', 'Business', 'Health', 'Politics/Law',
              'History/Geography', 'Philosophy/Religion', 'Arts/Culture',
              'Lifestyle/Self-Improvement', 'General Knowledge/Other',
            ].filter(c => c !== sourceCat).map((targetCat) => (
              <button
                key={targetCat}
                onClick={(e) => {
                  e.stopPropagation()
                  handleMovePrompt(sourceCat, promptIdx, targetCat)
                }}
                style={{
                  display: 'block', width: '100%', textAlign: 'left',
                  background: 'transparent', border: 'none', cursor: 'pointer',
                  padding: '7px 14px',
                  color: currentTheme.textSecondary,
                  fontSize: fontSize.sm,
                  transition: transition.normal,
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = `${currentTheme.accent}15`
                  e.currentTarget.style.color = currentTheme.accent
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = 'transparent'
                  e.currentTarget.style.color = currentTheme.textSecondary
                }}
              >
                {targetCat}
              </button>
            ))}
          </div>,
          document.body,
        )
      })()}
    </>
    )
  }

  // --- Main render ---
  return (
    <div
      className={mountReady ? undefined : 'no-mount-transition'}
      style={sx(s.pageContainer(isNavExpanded ? '240px' : '60px'), {
        overflowY: 'auto',
        padding: spacing['5xl'],
      })}
    >
      <div style={{ width: '100%', maxWidth: '1200px', margin: '0 auto' }}>
        {/* Header */}
        <h1
          key={`title-${theme}`}
          style={sx(s.pageTitle, { marginBottom: spacing.lg })}
        >
          History
        </h1>

        {/* Sub-tabs: Chat History | Categories */}
        <div style={{
          display: 'flex',
          gap: '0',
          marginBottom: spacing['3xl'],
          borderBottom: `1px solid ${currentTheme.borderLight}`,
        }}>
          <button
            onClick={() => { setActiveSubTab('history'); setSelectedConvo(null); setExpandAllDetailSections(false); setDetailTokenTab(null) }}
            style={sx(layout.center, {
              flex: 1,
              padding: `${spacing.lg} ${spacing['3xl']}`,
              background: activeSubTab === 'history' ? currentTheme.buttonBackgroundActive : 'transparent',
              border: 'none',
              borderBottom: activeSubTab === 'history' ? `2px solid ${currentTheme.accent}` : '2px solid transparent',
              color: activeSubTab === 'history' ? currentTheme.accent : currentTheme.textSecondary,
              fontSize: fontSize['2xl'],
              fontWeight: activeSubTab === 'history' ? fontWeight.semibold : fontWeight.normal,
              cursor: 'pointer',
              transition: transition.normal,
              gap: spacing.md,
            })}
          >
            <MessageSquare size={20} />
            Chat History
          </button>
          <button
            onClick={() => { setActiveSubTab('categories'); setSelectedConvo(null); setExpandAllDetailSections(false); setDetailTokenTab(null) }}
            style={sx(layout.center, {
              flex: 1,
              padding: `${spacing.lg} ${spacing['3xl']}`,
              background: activeSubTab === 'categories' ? currentTheme.buttonBackgroundActive : 'transparent',
              border: 'none',
              borderBottom: activeSubTab === 'categories' ? `2px solid ${currentTheme.accent}` : '2px solid transparent',
              color: activeSubTab === 'categories' ? currentTheme.accent : currentTheme.textSecondary,
              fontSize: fontSize['2xl'],
              fontWeight: activeSubTab === 'categories' ? fontWeight.semibold : fontWeight.normal,
              cursor: 'pointer',
              transition: transition.normal,
              gap: spacing.md,
            })}
          >
            <FolderOpen size={20} />
            Categories
          </button>
        </div>

        {/* Chat History Sub-Tab */}
        {activeSubTab === 'history' && (
          <>
        <p style={{ color: currentTheme.textSecondary, marginBottom: spacing['3xl'], fontSize: fontSize['2xl'] }}>
          {history.length} conversation{history.length !== 1 ? 's' : ''}
        </p>

        {loading ? (
          <div style={{ textAlign: 'center', padding: '60px', color: currentTheme.textMuted }}>
            Loading conversation history...
          </div>
        ) : history.length === 0 ? (
          <div style={{
            textAlign: 'center', padding: '60px',
            background: currentTheme.backgroundOverlay,
            border: `1px solid ${currentTheme.borderLight}`, borderRadius: radius['2xl'],
          }}>
            <Clock size={48} color={currentTheme.textMuted} style={{ marginBottom: spacing.xl, opacity: 0.5 }} />
            <p style={{ color: currentTheme.textMuted, fontSize: fontSize['3xl'], margin: `0 0 ${spacing.md} 0` }}>
              No conversation history yet
            </p>
            <p style={{ color: currentTheme.textMuted, fontSize: fontSize.base, margin: 0, opacity: 0.7 }}>
              Your conversations will automatically appear here after each prompt.
            </p>
          </div>
        ) : (
          <div style={sx(layout.flexRow, { gap: spacing['3xl'], alignItems: 'flex-start' })}>
            {/* Left: Starred + Year → Month → Day hierarchy */}
            <div style={{
              width: selectedConvo ? '360px' : '100%',
              minWidth: selectedConvo ? '360px' : undefined,
              flexShrink: 0,
            }}>
              {/* Starred / Favorites section */}
              {history.some(c => c.starred) && (
                <div style={{ marginBottom: spacing.lg }}>
                  <button
                    onClick={() => {
                      setStarredExpanded(prev => {
                        if (prev) setStarredVisibleCount(5)
                        return !prev
                      })
                    }}
                    style={{
                      width: '100%', display: 'flex', alignItems: 'center',
                      justifyContent: 'space-between', padding: '14px 18px',
                      background: starredExpanded ? 'rgba(245, 158, 11, 0.08)' : 'transparent',
                      border: `1px solid ${starredExpanded ? 'rgba(245, 158, 11, 0.3)' : currentTheme.borderLight}`,
                      borderRadius: starredExpanded ? '14px 14px 0 0' : '14px',
                      cursor: 'pointer', transition: transition.normal,
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                      <Star size={18} color="#f59e0b" fill="#f59e0b" />
                      <span style={{ fontSize: fontSize['3xl'], fontWeight: fontWeight.bold, color: currentTheme.text }}>
                        Starred
                      </span>
                      <span style={{
                        padding: '2px 10px', background: 'rgba(245, 158, 11, 0.12)',
                        borderRadius: radius.lg, fontSize: fontSize.sm, color: '#f59e0b', fontWeight: fontWeight.semibold,
                      }}>
                        {history.filter(c => c.starred).length}
                      </span>
                    </div>
                    {starredExpanded ? <ChevronUp size={18} color={currentTheme.textMuted} /> : <ChevronDown size={18} color={currentTheme.textMuted} />}
                  </button>
                  <AnimatePresence>
                    {starredExpanded && (
                      <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: 'auto', opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: 0.2 }}
                        style={{
                          overflow: 'hidden',
                          borderLeft: '1px solid rgba(245, 158, 11, 0.2)',
                          borderRight: '1px solid rgba(245, 158, 11, 0.2)',
                          borderBottom: '1px solid rgba(245, 158, 11, 0.2)',
                          borderRadius: '0 0 14px 14px',
                          padding: spacing.md,
                        }}
                      >
                        {(() => {
                          const starredChats = history.filter(c => c.starred)
                          const visible = starredChats.slice(0, starredVisibleCount)
                          const hasMore = starredChats.length > starredVisibleCount
                          const remaining = starredChats.length - starredVisibleCount
                          const isShowingExtra = starredVisibleCount > 5
                          return (
                            <>
                              {visible.map(convo => renderConvoCard(convo))}
                              {(hasMore || isShowingExtra) && (
                                <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: spacing.xl, marginTop: spacing.xs }}>
                                  {hasMore && (
                                    <button
                                      onClick={() => setStarredVisibleCount(prev => prev + 5)}
                                      style={{
                                        background: 'transparent', border: 'none', cursor: 'pointer',
                                        color: '#f59e0b', fontSize: '0.82rem', fontWeight: fontWeight.medium, padding: `${spacing.sm} ${spacing.lg}`,
                                      }}
                                      onMouseEnter={(e) => { e.currentTarget.style.opacity = '0.7' }}
                                      onMouseLeave={(e) => { e.currentTarget.style.opacity = '1' }}
                                    >
                                      Show {Math.min(5, remaining)} more
                                    </button>
                                  )}
                                  {isShowingExtra && (
                                    <button
                                      onClick={() => setStarredVisibleCount(5)}
                                      style={{
                                        background: 'transparent', border: 'none', cursor: 'pointer',
                                        color: currentTheme.textMuted, fontSize: '0.78rem', fontWeight: fontWeight.normal, padding: `${spacing.sm} ${spacing.md}`,
                                      }}
                                      onMouseEnter={(e) => { e.currentTarget.style.opacity = '0.7' }}
                                      onMouseLeave={(e) => { e.currentTarget.style.opacity = '1' }}
                                    >
                                      Show less
                                    </button>
                                  )}
                                </div>
                              )}
                            </>
                          )
                        })()}
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              )}

              {sortedYears.map((year) => {
                const yearData = hierarchy[year]
                const isYearOpen = expandedYears[year]
                const yearCount = countInYear(yearData)
                const sortedMonthKeys = Object.keys(yearData).sort((a, b) => b.localeCompare(a))

                return (
                  <div key={year} style={{ marginBottom: spacing.md }}>
                    {/* Year header */}
                    <button
                      onClick={() => toggleYear(year)}
                      style={{
                        width: '100%', display: 'flex', alignItems: 'center',
                        justifyContent: 'space-between', padding: '14px 18px',
                        background: isYearOpen ? `${currentTheme.accent}12` : 'transparent',
                        border: `1px solid ${isYearOpen ? `${currentTheme.accent  }30` : currentTheme.borderLight}`,
                        borderRadius: isYearOpen ? '14px 14px 0 0' : '14px',
                        cursor: 'pointer', transition: transition.normal,
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                        <Calendar size={18} color={currentTheme.accent} />
                        <span style={{ fontSize: fontSize['3xl'], fontWeight: fontWeight.bold, color: currentTheme.text }}>
                          {year}
                        </span>
                        <span style={{
                          padding: '2px 10px', background: currentTheme.buttonBackground,
                          borderRadius: radius.lg, fontSize: fontSize.sm, color: currentTheme.textMuted, fontWeight: fontWeight.semibold,
                        }}>
                          {yearCount}
                        </span>
                      </div>
                      {isYearOpen ? <ChevronUp size={18} color={currentTheme.textMuted} /> : <ChevronDown size={18} color={currentTheme.textMuted} />}
                    </button>

                    {/* Months within year */}
                    <AnimatePresence>
                      {isYearOpen && (
                        <motion.div
                          initial={{ height: 0, opacity: 0 }}
                          animate={{ height: 'auto', opacity: 1 }}
                          exit={{ height: 0, opacity: 0 }}
                          transition={{ duration: 0.2 }}
                          style={{
                            overflow: 'hidden',
                            borderLeft: `1px solid ${currentTheme.borderLight}`,
                            borderRight: `1px solid ${currentTheme.borderLight}`,
                            borderBottom: `1px solid ${currentTheme.borderLight}`,
                            borderRadius: '0 0 14px 14px',
                            padding: spacing.sm,
                          }}
                        >
                          {sortedMonthKeys.map((monthKey) => {
                            const monthData = yearData[monthKey]
                            const isMonthOpen = expandedMonths[monthKey]
                            const monthCount = countInMonth(monthData)
                            const sortedDayKeys = Object.keys(monthData).sort((a, b) => b.localeCompare(a))

                            return (
                              <div key={monthKey} style={{ marginBottom: spacing.xs }}>
                                {/* Month header */}
                                <button
                                  onClick={() => toggleMonth(monthKey)}
                                  style={{
                                    width: '100%', display: 'flex', alignItems: 'center',
                                    justifyContent: 'space-between', padding: '10px 14px',
                                    background: isMonthOpen ? `${currentTheme.accentSecondary}10` : 'transparent',
                                    border: `1px solid ${isMonthOpen ? `${currentTheme.accentSecondary  }25` : 'transparent'}`,
                                    borderRadius: isMonthOpen ? '10px 10px 0 0' : '10px',
                                    cursor: 'pointer', transition: transition.normal,
                                  }}
                                >
                                  <div style={{ display: 'flex', alignItems: 'center', gap: spacing.md }}>
                                    <span style={{ fontSize: fontSize.xl, fontWeight: fontWeight.semibold, color: currentTheme.text }}>
                                      {getMonthLabel(monthKey)}
                                    </span>
                                    <span style={{
                                      padding: `${spacing.px} ${spacing.md}`, background: currentTheme.buttonBackground,
                                      borderRadius: radius.md, fontSize: fontSize.xs, color: currentTheme.textMuted, fontWeight: fontWeight.medium,
                                    }}>
                                      {monthCount}
                                    </span>
                                  </div>
                                  {isMonthOpen ? <ChevronUp size={16} color={currentTheme.textMuted} /> : <ChevronDown size={16} color={currentTheme.textMuted} />}
                                </button>

                                {/* Days within month */}
                                <AnimatePresence>
                                  {isMonthOpen && (
                                    <motion.div
                                      initial={{ height: 0, opacity: 0 }}
                                      animate={{ height: 'auto', opacity: 1 }}
                                      exit={{ height: 0, opacity: 0 }}
                                      transition={{ duration: 0.15 }}
                                      style={{
                                        overflow: 'hidden',
                                        borderLeft: `1px solid ${currentTheme.borderLight}`,
                                        borderRight: `1px solid ${currentTheme.borderLight}`,
                                        borderBottom: `1px solid ${currentTheme.borderLight}`,
                                        borderRadius: '0 0 10px 10px',
                                        padding: `${spacing.xs} ${spacing.sm}`,
                                      }}
                                    >
                                      {sortedDayKeys.map((dayKey) => {
                                        const dayConvos = monthData[dayKey]
                                        const isDayOpen = expandedDays[dayKey]

                                        return (
                                          <div key={dayKey} style={{ marginBottom: '3px' }}>
                                            {/* Day header */}
                                            <button
                                              onClick={() => toggleDay(dayKey)}
                                              style={{
                                                width: '100%', display: 'flex', alignItems: 'center',
                                                justifyContent: 'space-between', padding: `${spacing.md} ${spacing.lg}`,
                                                background: isDayOpen ? `${currentTheme.accent}08` : 'transparent',
                                                border: 'none',
                                                borderRadius: isDayOpen ? '8px 8px 0 0' : '8px',
                                                cursor: 'pointer', transition: transition.fast,
                                              }}
                                            >
                                              <div style={{ display: 'flex', alignItems: 'center', gap: spacing.md }}>
                                                <Clock size={13} color={currentTheme.accentSecondary} />
                                                <span style={{ fontSize: fontSize.base, fontWeight: fontWeight.medium, color: currentTheme.text }}>
                                                  {getDayLabel(dayKey)}
                                                </span>
                                                <span style={{
                                                  padding: `${spacing.px} ${spacing.sm}`, background: currentTheme.buttonBackground,
                                                  borderRadius: radius.sm, fontSize: fontSize['2xs'], color: currentTheme.textMuted, fontWeight: fontWeight.medium,
                                                }}>
                                                  {dayConvos.length}
                                                </span>
                                              </div>
                                              {isDayOpen ? <ChevronUp size={14} color={currentTheme.textMuted} /> : <ChevronDown size={14} color={currentTheme.textMuted} />}
                                            </button>

                                            {/* Conversations within day */}
                                            <AnimatePresence>
                                              {isDayOpen && (
                                                <motion.div
                                                  initial={{ height: 0, opacity: 0 }}
                                                  animate={{ height: 'auto', opacity: 1 }}
                                                  exit={{ height: 0, opacity: 0 }}
                                                  transition={{ duration: 0.12 }}
                                                  style={{ overflow: 'hidden', padding: `${spacing.xs} ${spacing.xs} ${spacing.xs} ${spacing.xl}` }}
                                                >
                                                  {dayConvos.map((convo: any) => renderConvoCard(convo))}
                                                </motion.div>
                                              )}
                                            </AnimatePresence>
                                          </div>
                                        )
                                      })}
                                    </motion.div>
                                  )}
                                </AnimatePresence>
                              </div>
                            )
                          })}
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                )
              })}
            </div>

            {/* Right: Detail panel — sticky so it stays visible while scrolling the list */}
            <div style={{
              flex: 1,
              position: 'sticky',
              top: '40px',
              alignSelf: 'flex-start',
              maxHeight: 'calc(100vh - 80px)',
            }}>
              <AnimatePresence>
                {loadingDetail ? (
                  <div style={{
                    flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center',
                    color: currentTheme.textMuted,
                  }}>
                    Loading...
                  </div>
                ) : selectedConvo ? (
                  renderDetail()
                ) : null}
              </AnimatePresence>
            </div>
          </div>
        )}
          </>
        )}

        {/* Floating close button for open chat detail */}
        {activeSubTab === 'history' && selectedConvo && (
          <motion.button
            initial={{ opacity: 0, scale: 0.92 }}
            animate={{ opacity: 1, scale: 1 }}
            onClick={() => {
              setSelectedConvo(null)
              setExpandAllDetailSections(false)
              setDetailTokenTab(null)
            }}
            style={{
              position: 'fixed',
              right: '26px',
              bottom: '26px',
              zIndex: zIndex.nav,
              width: '42px',
              height: '42px',
              borderRadius: radius.full,
              border: '1px solid rgba(255, 107, 107, 0.55)',
              background: 'rgba(255, 107, 107, 0.18)',
              color: currentTheme.error,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              boxShadow: '0 8px 18px rgba(0, 0, 0, 0.35)',
              backdropFilter: 'blur(6px)',
            }}
            whileHover={{ scale: 1.06, background: 'rgba(255, 107, 107, 0.28)' }}
            whileTap={{ scale: 0.95 }}
            title="Close open chat"
          >
            <X size={18} />
          </motion.button>
        )}

        {/* Categories Sub-Tab */}
        {activeSubTab === 'categories' && (
          <motion.div
            key="categories"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            transition={{ duration: 0.3 }}
          >
            {renderCategories()}
          </motion.div>
        )}
      </div>

      {/* Confirmation Modal for clearing category prompts */}
      <ConfirmationModal
        isOpen={showClearCategoryConfirm}
        onClose={() => {
          setShowClearCategoryConfirm(false)
          setCategoryToClear(null)
        }}
        onConfirm={clearCategoryPrompts}
        title="Clear Category Prompts"
        message={categoryToClear
          ? `Are you sure you want to clear all prompts for "${categoryToClear}"? This action cannot be undone.`
          : 'Are you sure you want to clear these prompts? This action cannot be undone.'}
        confirmText="Clear Prompts"
        cancelText="Cancel"
        confirmColor={currentTheme.error}
      />
    </div>
  )
}

interface ExpandableSummaryProps {
  summary: any
  currentTheme: any
  judgeTurns?: any[]
  defaultExpanded?: boolean
}

const ExpandableSummary = ({ summary, currentTheme, judgeTurns = [], defaultExpanded = false }: ExpandableSummaryProps) => {
  const [expanded, setExpanded] = useState(defaultExpanded)
  useEffect(() => {
    setExpanded(defaultExpanded)
  }, [defaultExpanded, summary?.timestamp, summary?.text])
  const label = summary.singleModel
    ? `${summary.modelName || 'Model'} Response`
    : 'Judge Summary'
  const turnCount = judgeTurns.length

  return (
    <div style={{ marginBottom: spacing.xl }}>
      <button
        onClick={() => setExpanded(!expanded)}
        style={{
          display: 'flex', alignItems: 'center', gap: spacing.md,
          padding: '0 0 6px 0', marginBottom: spacing.md,
          background: 'none', border: 'none', cursor: 'pointer', color: currentTheme.text,
          borderBottom: '1.5px solid rgba(96, 165, 250, 0.3)',
          width: '100%',
        }}
      >
        <span style={{
          fontWeight: fontWeight.semibold, fontSize: fontSize.lg,
          textDecoration: 'underline',
          textDecorationColor: '#60a5fa',
          textUnderlineOffset: '4px',
        }}>{label}</span>
        {turnCount > 0 && (
          <span style={{ fontSize: fontSize.xs, color: currentTheme.textMuted, fontWeight: fontWeight.medium }}>
            ({turnCount} follow-up{turnCount !== 1 ? 's' : ''})
          </span>
        )}
        <span style={{ marginLeft: 'auto' }}>
          {expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
        </span>
      </button>
      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            style={{ overflow: 'hidden' }}
          >
            {/* Initial summary text */}
            <div style={{ padding: '0 0 8px 0' }}>
              <MarkdownRenderer content={summary.text} theme={currentTheme} fontSize="0.9rem" lineHeight="1.6" />
            </div>

            {/* Continued conversation turns with the judge */}
            {judgeTurns.length > 0 && (
              <div style={{ marginTop: spacing.md }}>
                {judgeTurns.map((turn, tIdx) => (
                  <div key={`judge-convo-${tIdx}`} style={{ marginBottom: spacing.lg }}>
                    {/* User message */}
                    <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: spacing.md }}>
                      <div style={{ maxWidth: '80%', padding: '10px 14px' }}>
                        <div style={{
                          fontSize: fontSize['2xs'], fontWeight: fontWeight.semibold, color: currentTheme.accent,
                          marginBottom: spacing.xs, textTransform: 'uppercase', letterSpacing: '0.5px',
                        }}>You</div>
                        <p style={{
                          color: currentTheme.text, margin: 0, lineHeight: '1.5',
                          fontSize: fontSize.lg, whiteSpace: 'pre-wrap',
                        }}>{turn.user}</p>
                      </div>
                    </div>
                    {/* Judge follow-up response */}
                    {turn.assistant && (
                      <div style={{ padding: '0 0 8px 0' }}>
                        <div style={{
                          fontSize: fontSize.xs, fontWeight: fontWeight.semibold,
                          color: '#60a5fa',
                          marginBottom: spacing.sm,
                          textDecoration: 'underline',
                          textDecorationColor: 'rgba(96, 165, 250, 0.4)',
                          textUnderlineOffset: '3px',
                        }}>
                          Judge (Summary)
                        </div>
                        <MarkdownRenderer
                          content={turn.assistant}
                          theme={currentTheme}
                          fontSize="0.9rem"
                          lineHeight="1.6"
                        />
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

interface ExpandableResponseProps {
  resp: any
  idx: number
  currentTheme: any
  conversationTurns?: any[]
  defaultExpanded?: boolean
}

const ExpandableResponse = ({ resp, idx, currentTheme, conversationTurns = [], defaultExpanded = false }: ExpandableResponseProps) => {
  const [expanded, setExpanded] = useState(defaultExpanded)
  useEffect(() => {
    setExpanded(defaultExpanded)
  }, [defaultExpanded, resp?.id, resp?.modelName, resp?.actualModelName, resp?.text])
  const providerKey = getProviderFromModelName(resp.modelName || resp.actualModelName)
  const providerInfo = PROVIDER_MAP[providerKey] || { name: providerKey, color: '#888' }
  const modelName = resp.modelName || resp.actualModelName || `Model ${idx + 1}`

  return (
    <div style={{ marginBottom: spacing.xl }}>
      {/* Model name header — underlined, clickable to expand */}
      <button
        onClick={() => setExpanded(!expanded)}
        style={{
          display: 'flex', alignItems: 'center', gap: spacing.md,
          padding: '0 0 6px 0', marginBottom: spacing.md,
          background: 'none', border: 'none', cursor: 'pointer', color: currentTheme.text,
          borderBottom: `1.5px solid ${providerInfo.color}40`,
          width: '100%',
        }}
      >
        <div style={{
          width: '8px', height: '8px', borderRadius: radius.circle,
          background: providerInfo.color, flexShrink: 0,
        }} />
        <span style={{
          fontWeight: fontWeight.semibold, fontSize: fontSize.lg,
          textDecoration: 'underline',
          textDecorationColor: providerInfo.color,
          textUnderlineOffset: '4px',
        }}>
          {modelName}
        </span>
        {resp.error && (
          <span style={{ fontSize: fontSize.xs, color: currentTheme.error, fontWeight: fontWeight.medium }}>Error</span>
        )}
        <span style={{ marginLeft: 'auto' }}>
          {expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
        </span>
      </button>

      {/* Response text — no border container */}
      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            style={{ overflow: 'hidden' }}
          >
            <div style={{ padding: '0 0 8px 0' }}>
              <MarkdownRenderer
                content={resp.text || resp.modelResponse || (resp.error ? 'This model encountered an error.' : 'No response.')}
                theme={currentTheme}
                fontSize="0.9rem"
                lineHeight="1.6"
              />
            </div>

            {/* Continued conversation turns for this model */}
            {conversationTurns.length > 0 && (
              <div style={{ marginTop: spacing.md }}>
                {conversationTurns.map((turn, tIdx) => (
                  <div key={`convo-${tIdx}`} style={{ marginBottom: spacing.lg }}>
                    {/* User follow-up message */}
                    <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: spacing.md }}>
                      <div style={{ maxWidth: '80%', padding: '10px 14px' }}>
                        <div style={{
                          fontSize: fontSize['2xs'], fontWeight: fontWeight.semibold, color: currentTheme.accent,
                          marginBottom: spacing.xs, textTransform: 'uppercase', letterSpacing: '0.5px',
                        }}>You</div>
                        <p style={{
                          color: currentTheme.text, margin: 0, lineHeight: '1.5',
                          fontSize: fontSize.lg, whiteSpace: 'pre-wrap',
                        }}>{turn.user}</p>
                      </div>
                    </div>
                    {/* Model follow-up response */}
                    {turn.assistant && (
                      <div style={{ padding: '0 0 8px 0' }}>
                        <div style={{
                          fontSize: fontSize.xs, fontWeight: fontWeight.semibold,
                          color: providerInfo.color,
                          marginBottom: spacing.sm,
                          textDecoration: 'underline',
                          textDecorationColor: `${providerInfo.color}60`,
                          textUnderlineOffset: '3px',
                        }}>
                          {modelName}
                        </div>
                        <MarkdownRenderer
                          content={turn.assistant}
                          theme={currentTheme}
                          fontSize="0.9rem"
                          lineHeight="1.6"
                        />
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

export default SavedConversationsView
