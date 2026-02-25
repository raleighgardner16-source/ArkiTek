import React, { useState, useEffect, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Trash2, ChevronRight, ChevronDown, ChevronUp, MessageCircle, X, Layers, Calendar, Globe, Clock, FolderOpen, MessageSquare, Coins, DollarSign, Star, Play, Trophy } from 'lucide-react'
import { useStore } from '../store/useStore'
import { getTheme } from '../utils/theme'
import axios from 'axios'
import { API_URL } from '../utils/config'
import ConfirmationModal from './ConfirmationModal'
import MarkdownRenderer from './MarkdownRenderer'
import TokenUsageWindow from './TokenUsageWindow'
import CostBreakdownWindow from './CostBreakdownWindow'

// Map provider key from modelName to display info
const PROVIDER_MAP = {
  openai: { name: 'ChatGPT', color: '#10a37f' },
  anthropic: { name: 'Claude', color: '#d4a574' },
  google: { name: 'Gemini', color: '#4285f4' },
  xai: { name: 'Grok', color: '#ffffff' },
  meta: { name: 'Meta', color: '#0668e1' },
  deepseek: { name: 'DeepSeek', color: '#4d6bfe' },
  mistral: { name: 'Mistral', color: '#f7d046' },
}

const getProviderFromModelName = (modelName) => {
  if (!modelName) return 'unknown'
  return modelName.split('-')[0].toLowerCase()
}

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'
]

const SavedConversationsView = () => {
  const currentUser = useStore((state) => state.currentUser)
  const theme = useStore((state) => state.theme || 'dark')
  const currentTheme = getTheme(theme)
  const setActiveTab = useStore((state) => state.setActiveTab)
  const clearResponses = useStore((state) => state.clearResponses)
  const addResponse = useStore((state) => state.addResponse)
  const setSummary = useStore((state) => state.setSummary)
  const setCurrentPrompt = useStore((state) => state.setCurrentPrompt)
  const setCurrentHistoryId = useStore((state) => state.setCurrentHistoryId)
  const setSearchSources = useStore((state) => state.setSearchSources)
  const setLastSubmittedPrompt = useStore((state) => state.setLastSubmittedPrompt)
  const setLastSubmittedCategory = useStore((state) => state.setLastSubmittedCategory)
  const setSummaryMinimized = useStore((state) => state.setSummaryMinimized)
  const winningPrompts = useStore((state) => state.winningPrompts)

  // Sub-tab state: 'history' or 'categories'
  const [activeSubTab, setActiveSubTab] = useState('history')

  const [history, setHistory] = useState([])
  const [loading, setLoading] = useState(true)
  const [selectedConvo, setSelectedConvo] = useState(null)
  const [loadingDetail, setLoadingDetail] = useState(false)
  const [confirmDeleteId, setConfirmDeleteId] = useState(null)
  const [deletingId, setDeletingId] = useState(null)
  const [expandedYears, setExpandedYears] = useState({})
  const [expandedMonths, setExpandedMonths] = useState({})
  const [expandedDays, setExpandedDays] = useState({})
  const [expandedSources, setExpandedSources] = useState({})
  const [expandedTitles, setExpandedTitles] = useState({})
  const [expandAllDetailSections, setExpandAllDetailSections] = useState(false)
  const [detailTokenTab, setDetailTokenTab] = useState(null)
  const detailPanelRef = useRef(null)
  const convoCardClickedRef = useRef(false)

  // Categories state
  const [categoriesData, setCategoriesData] = useState(null)
  const [expandedCategories, setExpandedCategories] = useState({})
  const [showClearCategoryConfirm, setShowClearCategoryConfirm] = useState(false)
  const [categoryToClear, setCategoryToClear] = useState(null)

  // Tooltip that follows cursor on category prompt hover
  const [promptTooltip, setPromptTooltip] = useState({ visible: false, x: 0, y: 0 })

  // Track how many prompts are visible per category (default 5)
  const [categoryVisibleCount, setCategoryVisibleCount] = useState({})

  // Starred section expanded + visible count (show 5 at a time)
  const [starredExpanded, setStarredExpanded] = useState(true)
  const [starredVisibleCount, setStarredVisibleCount] = useState(5)

  useEffect(() => {
    if (currentUser?.id) {
      fetchHistory()
      fetchCategories()
    }
  }, [currentUser])

  // Close selected chat when clicking outside the open detail panel.
  useEffect(() => {
    if (activeSubTab !== 'history' || !selectedConvo) return

    const handleOutsideClick = (event) => {
      if (convoCardClickedRef.current) {
        convoCardClickedRef.current = false
        return
      }
      if (!detailPanelRef.current) return
      if (detailPanelRef.current.contains(event.target)) return
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
      const response = await axios.get(`${API_URL}/api/stats/${currentUser.id}/categories`)
      setCategoriesData(response.data.categories || {})
    } catch (error) {
      console.error('Error fetching categories:', error)
      setCategoriesData({})
    }
  }

  const handleClearCategoryPrompts = (category, e) => {
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
      await axios.delete(`${API_URL}/api/stats/${currentUser.id}/categories/${encodedCategory}/prompts`)
      await fetchCategories()
    } catch (error) {
      console.error('[Clear Category] Error:', error)
      alert(`Failed to clear category prompts: ${error.response?.data?.error || error.message || 'Unknown error'}`)
    } finally {
      setCategoryToClear(null)
    }
  }

  const handleDeleteSinglePrompt = async (category, promptIndex) => {
    if (!currentUser?.id) return
    try {
      const encodedCategory = encodeURIComponent(category)
      await axios.delete(`${API_URL}/api/stats/${currentUser.id}/categories/${encodedCategory}/prompts/${promptIndex}`)
      await fetchCategories()
    } catch (error) {
      console.error('[Delete Prompt] Error:', error)
      alert(`Failed to delete prompt: ${error.response?.data?.error || error.message || 'Unknown error'}`)
    }
  }

  const formatNumber = (num) => {
    if (num >= 1000000) return (num / 1000000).toFixed(2) + 'M'
    if (num >= 1000) return (num / 1000).toFixed(2) + 'K'
    return num.toLocaleString()
  }

  const hasSummaryForConversation = (convo) => {
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

  const isWinningChat = (convo) => {
    if (!winningPrompts || winningPrompts.length === 0) return false
    const convoPrompt = (convo.originalPrompt || convo.title || '').trim().toLowerCase()
    if (!convoPrompt) return false
    return winningPrompts.some(win => {
      const winPrompt = (win.promptText || '').trim().toLowerCase()
      if (!winPrompt) return false
      return convoPrompt === winPrompt || winPrompt.includes(convoPrompt) || convoPrompt.includes(winPrompt)
    })
  }

  const fetchHistory = async () => {
    setLoading(true)
    try {
      const res = await axios.get(`${API_URL}/api/history/${currentUser.id}`)
      setHistory(res.data.history || [])
    } catch (error) {
      console.error('[History] Error fetching:', error)
    }
    setLoading(false)
  }

  const fetchDetail = async (historyId) => {
    setLoadingDetail(true)
    setExpandedSources({})
    setDetailTokenTab(null)
    try {
      const res = await axios.get(`${API_URL}/api/history/detail/${historyId}`)
      setSelectedConvo(res.data.conversation)
    } catch (error) {
      console.error('[History] Error fetching detail:', error)
      alert('Failed to load conversation details.')
    }
    setLoadingDetail(false)
  }

  const normalizeText = (text) => (text || '').toString().trim().replace(/\s+/g, ' ').toLowerCase()

  const findBestHistoryMatchForPrompt = (prompt) => {
    if (!prompt || history.length === 0) return null

    const promptTextNorm = normalizeText(prompt.text)
    const promptTimestamp = prompt.timestamp ? new Date(prompt.timestamp).getTime() : null

    let best = null
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

  const handleOpenPromptInHistory = async (prompt) => {
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

  const handleDelete = async (historyId) => {
    try {
      setDeletingId(historyId)
      await axios.delete(`${API_URL}/api/history/${historyId}`, {
        data: { userId: currentUser.id }
      })
      setHistory(prev => prev.filter(c => c.id !== historyId))
      if (selectedConvo?.id === historyId) {
        setSelectedConvo(null)
        setDetailTokenTab(null)
      }
      setConfirmDeleteId(null)
    } catch (error) {
      console.error('[History] Error deleting:', error)
      alert('Failed to delete conversation.')
    } finally {
      setDeletingId(null)
    }
  }

  const handleToggleStar = async (convoId, e) => {
    if (e) { e.stopPropagation(); e.preventDefault() }
    const convo = history.find(c => c.id === convoId)
    if (!convo) return
    const newStarred = !convo.starred
    setHistory(prev => prev.map(c => c.id === convoId ? { ...c, starred: newStarred } : c))
    try {
      await axios.post(`${API_URL}/api/history/star`, {
        historyId: convoId,
        userId: currentUser.id,
        starred: newStarred,
      })
    } catch (error) {
      console.error('[History] Error toggling star:', error)
      setHistory(prev => prev.map(c => c.id === convoId ? { ...c, starred: !newStarred } : c))
    }
  }

  const handleContinueConversation = async (convoId, e) => {
    if (e) { e.stopPropagation(); e.preventDefault() }
    try {
      const res = await axios.get(`${API_URL}/api/history/detail/${convoId}`)
      const convo = res.data.conversation
      if (!convo) return

      // Clear current state first
      clearResponses()

      // Restore server-side conversation context
      await axios.post(`${API_URL}/api/history/restore-context`, {
        historyId: convoId,
        userId: currentUser.id,
      })

      // Restore responses into the store
      ;(convo.responses || []).forEach(r => {
        addResponse({
          id: `${r.modelName}-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
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

      // Restore summary
      if (convo.summary) {
        const judgeTurns = (convo.conversationTurns || []).filter(t => t.type === 'judge')
        setSummary({
          text: convo.summary.text || '',
          consensus: convo.summary.consensus || null,
          agreements: convo.summary.agreements || [],
          disagreements: convo.summary.disagreements || [],
          differences: convo.summary.differences || [],
          singleModel: convo.summary.singleModel || false,
          modelName: convo.summary.modelName || null,
          conversationHistory: judgeTurns.map(t => ({
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
      setCurrentPrompt('')
      setSummaryMinimized(false)

      // Navigate to chat
      setActiveTab('home')
    } catch (error) {
      console.error('[History] Error continuing conversation:', error)
      alert('Failed to load conversation. Please try again.')
    }
  }

  // --- Date helpers ---
  const getYear = (dateStr) => new Date(dateStr).getFullYear()
  const getMonthKey = (dateStr) => {
    const d = new Date(dateStr)
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
  }
  const getDayKey = (dateStr) => new Date(dateStr).toISOString().split('T')[0]
  const getMonthLabel = (monthKey) => {
    const [, month] = monthKey.split('-')
    return MONTH_NAMES[parseInt(month, 10) - 1]
  }
  const getDayLabel = (dayKey) => {
    const d = new Date(dayKey + 'T12:00:00')
    return d.toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' })
  }
  const formatTime = (dateStr) => {
    const d = new Date(dateStr)
    return d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })
  }

  // --- Build hierarchy: Year → Month → Day → convos ---
  const buildHierarchy = () => {
    const years = {}
    history.forEach(convo => {
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
  const sortedYears = Object.keys(hierarchy).sort((a, b) => b - a)

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

  const toggleYear = (year) => setExpandedYears(prev => ({ ...prev, [year]: !prev[year] }))
  const toggleMonth = (monthKey) => setExpandedMonths(prev => ({ ...prev, [monthKey]: !prev[monthKey] }))
  const toggleDay = (dayKey) => setExpandedDays(prev => ({ ...prev, [dayKey]: !prev[dayKey] }))

  // Count convos in a given scope
  const countInYear = (yearData) => Object.values(yearData).reduce((sum, months) => sum + Object.values(months).reduce((s, days) => s + days.length, 0), 0)
  const countInMonth = (monthData) => Object.values(monthData).reduce((sum, days) => sum + days.length, 0)

  // --- Render a conversation card ---
  const renderConvoCard = (convo) => {
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
        border: `1px solid ${selectedConvo?.id === convo.id ? currentTheme.accent + '40' : currentTheme.borderLight}`,
        borderRadius: '10px',
        padding: '12px 14px',
        marginBottom: '6px',
        cursor: 'pointer',
        transition: 'all 0.2s ease',
      }}
      whileHover={{
        background: `${currentTheme.accent}08`,
        borderColor: `${currentTheme.accent}30`,
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          {/* Model chips */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '5px', flexWrap: 'wrap' }}>
            {convo.isSingleModel ? (
              <span style={{
                fontSize: '0.65rem', fontWeight: '600', color: '#a855f7',
                textTransform: 'uppercase', letterSpacing: '0.5px',
                display: 'flex', alignItems: 'center', gap: '4px',
              }}>
                <MessageCircle size={12} /> Single Model
              </span>
            ) : (
              <span style={{
                fontSize: '0.65rem', fontWeight: '600', color: '#60a5fa',
                textTransform: 'uppercase', letterSpacing: '0.5px',
                display: 'flex', alignItems: 'center', gap: '4px',
              }}>
                <Layers size={12} /> Council ({modelCount} models {hasSummary ? 'and summary' : 'no summary'})
              </span>
            )}
            {convo.consensus !== null && (
              <span style={{
                padding: '1px 6px', borderRadius: '8px', fontSize: '0.65rem', fontWeight: '600',
                background: convo.consensus >= 80 ? 'rgba(72, 201, 176, 0.15)' : convo.consensus >= 50 ? 'rgba(241, 196, 15, 0.15)' : 'rgba(255, 107, 107, 0.15)',
                color: convo.consensus >= 80 ? '#48c9b0' : convo.consensus >= 50 ? '#f1c40f' : '#ff6b6b',
              }}>
                {convo.consensus}%
              </span>
            )}
            {isWinningChat(convo) && (
              <span style={{
                padding: '2px 8px', borderRadius: '8px', fontSize: '0.65rem', fontWeight: '700',
                background: 'linear-gradient(135deg, rgba(255, 215, 0, 0.15), rgba(255, 165, 0, 0.15))',
                border: '1px solid rgba(255, 215, 0, 0.3)',
                color: '#FFD700',
                display: 'flex', alignItems: 'center', gap: '4px',
                textTransform: 'uppercase', letterSpacing: '0.5px',
              }}>
                <Trophy size={10} /> Winning Chat
              </span>
            )}
          </div>
          {/* Title / prompt - click to expand full text */}
          <p
            onClick={(e) => {
              e.stopPropagation()
              setExpandedTitles(prev => ({ ...prev, [convo.id]: !prev[convo.id] }))
            }}
            title={expandedTitles[convo.id] ? 'Click to collapse' : 'Click to see full prompt'}
            style={{
              color: currentTheme.text, fontSize: '0.88rem', fontWeight: '500',
              margin: '0 0 4px 0', lineHeight: '1.3',
              cursor: 'pointer',
              ...(expandedTitles[convo.id]
                ? { whiteSpace: 'pre-wrap', wordBreak: 'break-word' }
                : { overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }
              ),
              transition: 'all 0.2s ease',
            }}
          >
            {convo.title}
          </p>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={{ fontSize: '0.7rem', color: currentTheme.textMuted, display: 'flex', alignItems: 'center', gap: '3px' }}>
              <Clock size={10} /> {formatTime(convo.savedAt)}
            </span>
            {convo.category && (
              <span style={{
                padding: '1px 6px', background: currentTheme.buttonBackground,
                borderRadius: '4px', fontSize: '0.65rem', color: currentTheme.textMuted,
              }}>
                {convo.category}
              </span>
            )}
          </div>
        </div>
        {/* Actions: star, continue, delete */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '2px', flexShrink: 0 }}>
          {confirmDeleteId === convo.id ? (
            <div style={{ display: 'flex', gap: '4px', alignItems: 'center' }} onClick={(e) => e.stopPropagation()}>
              <button
                onClick={(e) => { e.stopPropagation(); handleDelete(convo.id) }}
                disabled={deletingId === convo.id}
                style={{
                  background: 'rgba(255, 107, 107, 0.15)', border: '1px solid rgba(255, 107, 107, 0.4)',
                  borderRadius: '6px', padding: '4px 8px', color: '#ff6b6b',
                  fontSize: '0.68rem', fontWeight: '600', cursor: deletingId === convo.id ? 'default' : 'pointer',
                  opacity: deletingId === convo.id ? 0.5 : 1, whiteSpace: 'nowrap',
                }}
              >
                {deletingId === convo.id ? '...' : 'Delete'}
              </button>
              <button
                onClick={(e) => { e.stopPropagation(); setConfirmDeleteId(null) }}
                style={{
                  background: currentTheme.buttonBackground, border: `1px solid ${currentTheme.borderLight}`,
                  borderRadius: '6px', padding: '4px 8px', color: currentTheme.textSecondary,
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
                  padding: '4px', borderRadius: '4px', opacity: convo.starred ? 1 : 0.55,
                  transition: 'all 0.15s ease',
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
                  padding: '3px 8px', borderRadius: '6px',
                  color: currentTheme.accent,
                  fontSize: '0.68rem', fontWeight: '600',
                  whiteSpace: 'nowrap',
                  transition: 'all 0.15s ease',
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
                  padding: '4px', borderRadius: '4px', opacity: 0.4, transition: 'opacity 0.15s',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}
                onMouseEnter={(e) => { e.currentTarget.style.opacity = '1' }}
                onMouseLeave={(e) => { e.currentTarget.style.opacity = '0.4' }}
                title="Delete"
              >
                <Trash2 size={14} color="#ff6b6b" />
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
  const renderSourcesSection = (sources, toggleKey, label = 'Sources') => {
    if (!sources || !Array.isArray(sources) || sources.length === 0) return null
    const isOpen = expandedSources[toggleKey]
    return (
      <div style={{ marginTop: '8px', marginBottom: '8px' }}>
        <button
          onClick={() => setExpandedSources(prev => ({ ...prev, [toggleKey]: !prev[toggleKey] }))}
          style={{
            display: 'flex', alignItems: 'center', gap: '6px', padding: '6px 12px',
            background: isOpen ? `${currentTheme.accent}15` : currentTheme.buttonBackground,
            border: `1px solid ${isOpen ? currentTheme.accent : currentTheme.borderLight}`,
            borderRadius: '8px', color: currentTheme.accent, fontSize: '0.78rem', fontWeight: '500',
            cursor: 'pointer', transition: 'all 0.2s ease',
          }}
        >
          <Globe size={13} />
          {label} ({sources.length})
          <ChevronDown size={13} style={{ transform: isOpen ? 'rotate(180deg)' : 'rotate(0deg)', transition: 'transform 0.2s' }} />
        </button>
        {isOpen && (
          <div style={{ marginTop: '6px', display: 'flex', flexDirection: 'column', gap: '4px', maxHeight: '200px', overflowY: 'auto' }}>
            {sources.map((source, sIdx) => (
              <a key={sIdx} href={source.link || source.url || '#'} target="_blank" rel="noopener noreferrer"
                style={{
                  display: 'block', padding: '8px 12px',
                  background: currentTheme.buttonBackground,
                  border: `1px solid ${currentTheme.borderLight}`,
                  borderRadius: '6px', textDecoration: 'none', transition: 'border-color 0.2s',
                }}
                onMouseEnter={(e) => { e.currentTarget.style.borderColor = currentTheme.accent }}
                onMouseLeave={(e) => { e.currentTarget.style.borderColor = currentTheme.borderLight }}
              >
                <div style={{ color: currentTheme.accent, fontSize: '0.82rem', fontWeight: '500' }}>
                  {source.title || source.link || source.url || `Source ${sIdx + 1}`}
                </div>
                {source.snippet && (
                  <div style={{ color: currentTheme.textMuted, fontSize: '0.75rem', marginTop: '3px', lineHeight: '1.4' }}>
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
    const formatDate = (dateStr) => {
      const d = new Date(dateStr)
      return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) +
        ' at ' + d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })
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
          borderRadius: '16px',
          padding: '24px 24px 14px 24px',
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
            style={{
              background: 'rgba(255, 107, 107, 0.12)',
              border: '1px solid rgba(255, 107, 107, 0.35)',
              borderRadius: '8px',
              cursor: 'pointer',
              padding: '6px',
              color: '#ff6b6b',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              transition: 'all 0.2s ease',
              flexShrink: 0,
              pointerEvents: 'auto',
              backdropFilter: 'blur(8px)',
              boxShadow: '0 2px 8px rgba(0, 0, 0, 0.2)',
            }}
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
        <div style={{ marginBottom: '20px', paddingRight: '36px' }}>
          <h2 style={{ fontSize: '1.4rem', color: currentTheme.text, margin: '0 0 8px 0', lineHeight: '1.3' }}>
            {selectedConvo.title}
          </h2>
          <div style={{ display: 'flex', gap: '12px', alignItems: 'center', flexWrap: 'wrap' }}>
            <span style={{
              padding: '4px 10px',
              background: selectedConvo.responses?.length > 1 ? 'rgba(59, 130, 246, 0.15)' : 'rgba(168, 85, 247, 0.15)',
              border: `1px solid ${selectedConvo.responses?.length > 1 ? 'rgba(59, 130, 246, 0.4)' : 'rgba(168, 85, 247, 0.4)'}`,
              borderRadius: '6px', fontSize: '0.75rem',
              color: selectedConvo.responses?.length > 1 ? '#60a5fa' : '#a855f7',
              fontWeight: '600',
            }}>
              {selectedConvo.responses?.length > 1
                ? `Council (${selectedModelCount} models ${selectedHasSummary ? 'and summary' : 'no summary'})`
                : 'Single Model'}
            </span>
            <span style={{ fontSize: '0.8rem', color: currentTheme.textMuted }}>
              {formatDate(selectedConvo.savedAt)}
            </span>
            {selectedConvo.category && (
              <span style={{
                padding: '3px 8px', background: currentTheme.buttonBackground,
                borderRadius: '4px', fontSize: '0.75rem', color: currentTheme.textSecondary,
              }}>
                {selectedConvo.category}
              </span>
            )}
            {selectedConvo.postedToFeed ? (
              <span style={{
                padding: '3px 8px',
                background: 'rgba(72, 201, 176, 0.12)',
                border: '1px solid rgba(72, 201, 176, 0.35)',
                borderRadius: '6px', fontSize: '0.7rem', fontWeight: '600',
                color: '#48c9b0',
                display: 'flex', alignItems: 'center', gap: '4px',
              }}>
                <Globe size={11} /> Posted to Feed
              </span>
            ) : (
              <span style={{
                padding: '3px 8px',
                background: 'rgba(255, 255, 255, 0.04)',
                border: '1px solid rgba(255, 255, 255, 0.08)',
                borderRadius: '6px', fontSize: '0.7rem', fontWeight: '500',
                color: currentTheme.textMuted,
              }}>
                Not Posted
              </span>
            )}
          </div>
          {/* Continue Conversation button */}
          <button
            onClick={() => handleContinueConversation(selectedConvo._id || selectedConvo.id)}
            style={{
              marginTop: '12px',
              display: 'flex', alignItems: 'center', gap: '8px',
              padding: '10px 20px',
              background: `${currentTheme.accent}15`,
              border: `1px solid ${currentTheme.accent}40`,
              borderRadius: '10px',
              color: currentTheme.accent,
              fontSize: '0.85rem',
              fontWeight: '600',
              cursor: 'pointer',
              transition: 'all 0.2s ease',
            }}
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
            borderRadius: '12px', padding: '16px', marginBottom: '20px',
          }}>
            <div style={{ fontSize: '0.75rem', color: currentTheme.accent, fontWeight: '600', marginBottom: '6px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
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
            judgeTurns={(selectedConvo.conversationTurns || []).filter(t => t.type === 'judge')}
            defaultExpanded={expandAllDetailSections}
          />
        )}

        {/* Model Responses + Continued Conversations (grouped per model) */}
        {selectedConvo.responses && selectedConvo.responses.length > 0 && (() => {
          // Group conversation turns by modelName so they appear under their model
          const turnsByModel = {}
          ;(selectedConvo.conversationTurns || []).forEach(turn => {
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
              <h3 style={{ fontSize: '1rem', color: currentTheme.text, marginBottom: '12px' }}>
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
        {selectedConvo.responses && selectedConvo.responses.some(r => r.tokens) && (() => {
          const historyTokenData = selectedConvo.responses
            .filter(r => r.tokens)
            .map(r => {
              const providerKey = getProviderFromModelName(r.modelName || r.actualModelName)
              const modelName = r.modelName || r.actualModelName || 'Unknown'
              const modelPart = modelName.includes('-') ? modelName.substring(modelName.indexOf('-') + 1) : modelName
              return {
                modelName: modelName,
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
            <div style={{ marginBottom: '16px' }}>
              <div style={{
                display: 'flex', gap: '8px', marginBottom: '12px',
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
                    borderRadius: '10px',
                    color: detailTokenTab === 'tokens' ? '#5dade2' : currentTheme.textSecondary,
                    fontSize: '0.82rem',
                    fontWeight: '600',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '6px',
                    transition: 'all 0.2s ease',
                  }}
                >
                  <Coins size={14} />
                  Token Usage
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
                    borderRadius: '10px',
                    color: detailTokenTab === 'cost' ? '#ffd700' : currentTheme.textSecondary,
                    fontSize: '0.82rem',
                    fontWeight: '600',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '6px',
                    transition: 'all 0.2s ease',
                  }}
                >
                  <DollarSign size={14} />
                  Cost Breakdown
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
                      borderRadius: '12px',
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
                      borderRadius: '12px',
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
            borderRadius: '12px', padding: '16px',
          }}>
            <div style={{ fontSize: '0.75rem', color: currentTheme.accent, fontWeight: '600', marginBottom: '10px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
              Facts ({selectedConvo.facts.length})
            </div>
            {selectedConvo.facts.map((fact, idx) => (
              <p key={idx} style={{ color: currentTheme.textSecondary, fontSize: '0.85rem', margin: '0 0 6px 0', lineHeight: '1.5' }}>
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
    const allDataCategories = Object.keys(categoriesData || {})
    const categoriesWithData = allCategories.map((category) => {
      let categoryInfo = categoriesData?.[category]
      if (!categoryInfo) {
        const matchedKey = allDataCategories.find(key => key.toLowerCase() === category.toLowerCase())
        if (matchedKey) categoryInfo = categoriesData[matchedKey]
      }
      const recentPrompts = categoryInfo?.recentPrompts || []
      const count = categoryInfo?.count || (typeof categoryInfo === 'number' ? categoryInfo : 0)
      return { category, count, recentPrompts }
    })
    categoriesWithData.sort((a, b) => {
      if (b.count !== a.count) return b.count - a.count
      return a.category.localeCompare(b.category)
    })

    return (
      <div style={{
        background: currentTheme.backgroundOverlay,
        border: `1px solid ${currentTheme.borderLight}`,
        borderRadius: '16px',
        padding: '30px',
      }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          {categoriesWithData.map(({ category, count, recentPrompts }) => {
            const isExpanded = expandedCategories[category]
            const hasPrompts = recentPrompts && recentPrompts.length > 0

            return (
              <div
                key={`${category}-${theme}`}
                style={{
                  background: count > 0 ? currentTheme.backgroundSecondary : currentTheme.backgroundTertiary,
                  border: `1px solid ${currentTheme.borderLight}`,
                  borderRadius: '12px',
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
                    padding: '16px 20px',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    cursor: 'pointer',
                    transition: 'background 0.2s',
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.background = count > 0 ? currentTheme.buttonBackgroundHover : currentTheme.backgroundTertiary
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.background = count > 0 ? currentTheme.backgroundSecondary : currentTheme.backgroundTertiary
                  }}
                >
                  <div key={`category-header-${category}-${theme}`} style={{ display: 'flex', alignItems: 'center', gap: '12px', flex: 1 }}>
                    {isExpanded ? (
                      <ChevronDown size={20} color={count > 0 ? currentTheme.accent : currentTheme.textMuted} />
                    ) : (
                      <ChevronRight size={20} color={count > 0 ? currentTheme.accent : currentTheme.textMuted} />
                    )}
                    <span key={`category-title-${category}-${theme}`} style={{ color: count > 0 ? currentTheme.accent : currentTheme.textMuted, fontSize: '1.1rem', textTransform: 'capitalize', fontWeight: '500' }}>
                      {category}
                    </span>
                    {hasPrompts && (
                      <span key={`category-prompts-count-${category}-${theme}`} style={{ color: currentTheme.textMuted, fontSize: '0.85rem', marginLeft: '8px' }}>
                        ({recentPrompts.length} {recentPrompts.length === 1 ? 'prompt' : 'prompts'})
                      </span>
                    )}
                    {!hasPrompts && count === 0 && (
                      <span key={`category-no-prompts-${category}-${theme}`} style={{ color: currentTheme.textMuted, fontSize: '0.85rem', marginLeft: '8px', fontStyle: 'italic' }}>
                        (no prompts yet)
                      </span>
                    )}
                  </div>
                  <span
                    key={`category-count-${category}-${theme}`}
                    style={{
                      fontSize: '1.2rem',
                      fontWeight: 'bold',
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
                      <div key={`category-content-${category}-${theme}`} style={{ padding: '12px 20px 20px 40px', borderTop: `1px solid ${currentTheme.borderLight}` }}>
                        {hasPrompts ? (
                          <div key={`prompts-list-${category}-${theme}`} style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                            {/* Clear button */}
                            <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '8px' }}>
                              <button
                                onClick={(e) => handleClearCategoryPrompts(category, e)}
                                type="button"
                                style={{
                                  background: 'transparent',
                                  border: '1px solid rgba(255, 107, 107, 0.3)',
                                  borderRadius: '6px',
                                  padding: '6px 12px',
                                  cursor: 'pointer',
                                  display: 'flex',
                                  alignItems: 'center',
                                  gap: '6px',
                                  transition: 'all 0.2s ease',
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
                                <X size={14} color="#ff6b6b" />
                                <span style={{ color: '#ff6b6b', fontSize: '0.75rem' }}>Clear Prompts</span>
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
                                        onMouseEnter={() => setPromptTooltip(prev => ({ ...prev, visible: true }))}
                                        onMouseMove={(e) => setPromptTooltip({ visible: true, x: e.clientX, y: e.clientY })}
                                        onMouseLeave={() => setPromptTooltip({ visible: false, x: 0, y: 0 })}
                                        style={{
                                          background: theme === 'light' ? '#ffffff' : 'rgba(20, 20, 30, 0.9)',
                                          border: `1px solid ${currentTheme.borderLight}`,
                                          borderRadius: '8px',
                                          padding: '12px 16px',
                                          boxShadow: theme === 'light'
                                            ? '0 2px 8px rgba(0, 0, 0, 0.1), 0 1px 3px rgba(0, 0, 0, 0.06)'
                                            : '0 2px 8px rgba(0, 0, 0, 0.4), 0 1px 3px rgba(0, 0, 0, 0.3)',
                                          position: 'relative',
                                          cursor: 'pointer',
                                        }}
                                      >
                                        <button
                                          onClick={(e) => {
                                            e.stopPropagation()
                                            handleDeleteSinglePrompt(category, index)
                                          }}
                                          style={{
                                            position: 'absolute', top: '8px', right: '8px',
                                            background: 'transparent', border: 'none', cursor: 'pointer',
                                            padding: '4px', borderRadius: '4px',
                                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                                            opacity: 0.4, transition: 'all 0.2s ease',
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
                                          <X size={14} color="#ff6b6b" />
                                        </button>
                                        <p key={`${category}-prompt-text-${index}-${theme}`} style={{ color: currentTheme.textSecondary, fontSize: '0.9rem', margin: '0 0 6px 0', lineHeight: '1.4', paddingRight: '24px' }}>
                                          {prompt.text}
                                        </p>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                          <p key={`${category}-prompt-date-${index}-${theme}`} style={{ color: currentTheme.textMuted, fontSize: '0.75rem', margin: 0 }}>
                                            {formattedDate}
                                          </p>
                                          {(() => {
                                            const promptNorm = (prompt.text || '').trim().toLowerCase()
                                            const isWin = promptNorm && winningPrompts?.some(win => {
                                              const winNorm = (win.promptText || '').trim().toLowerCase()
                                              return winNorm && (promptNorm === winNorm || winNorm.includes(promptNorm) || promptNorm.includes(winNorm))
                                            })
                                            return isWin ? (
                                              <span style={{
                                                padding: '1px 7px', borderRadius: '8px', fontSize: '0.65rem', fontWeight: '700',
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
                                  <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '16px', marginTop: '8px' }}>
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
                                          fontWeight: '500',
                                          padding: '6px 12px',
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
                                          fontWeight: '400',
                                          padding: '6px 8px',
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
                          <p key={`${category}-no-prompts-msg-${theme}`} style={{ color: currentTheme.textMuted, fontSize: '0.9rem', textAlign: 'center', padding: '20px', fontStyle: 'italic' }}>
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
    )
  }

  // --- Main render ---
  return (
    <div style={{
      position: 'fixed', top: 0, left: '240px',
      width: 'calc(100% - 240px)', height: '100%',
      overflowY: 'auto', zIndex: 10, padding: '40px',
    }}>
      <div style={{ maxWidth: '1200px', margin: '0 auto' }}>
        {/* Header */}
        <h1
          key={`title-${theme}`}
          style={{
            fontSize: '2.5rem', marginBottom: '12px',
            background: currentTheme.accentGradient,
            WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent',
            color: currentTheme.accent, display: 'inline-block',
          }}
        >
          History
        </h1>

        {/* Sub-tabs: Chat History | Categories */}
        <div style={{
          display: 'flex',
          gap: '0',
          marginBottom: '24px',
          borderBottom: `1px solid ${currentTheme.borderLight}`,
        }}>
          <button
            onClick={() => { setActiveSubTab('history'); setSelectedConvo(null); setExpandAllDetailSections(false); setDetailTokenTab(null) }}
            style={{
              flex: 1,
              padding: '12px 24px',
              background: activeSubTab === 'history' ? currentTheme.buttonBackgroundActive : 'transparent',
              border: 'none',
              borderBottom: activeSubTab === 'history' ? `2px solid ${currentTheme.accent}` : '2px solid transparent',
              color: activeSubTab === 'history' ? currentTheme.accent : currentTheme.textSecondary,
              fontSize: '1rem',
              fontWeight: activeSubTab === 'history' ? '600' : '400',
              cursor: 'pointer',
              transition: 'all 0.2s ease',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '8px',
            }}
          >
            <MessageSquare size={20} />
            Chat History
          </button>
          <button
            onClick={() => { setActiveSubTab('categories'); setSelectedConvo(null); setExpandAllDetailSections(false); setDetailTokenTab(null) }}
            style={{
              flex: 1,
              padding: '12px 24px',
              background: activeSubTab === 'categories' ? currentTheme.buttonBackgroundActive : 'transparent',
              border: 'none',
              borderBottom: activeSubTab === 'categories' ? `2px solid ${currentTheme.accent}` : '2px solid transparent',
              color: activeSubTab === 'categories' ? currentTheme.accent : currentTheme.textSecondary,
              fontSize: '1rem',
              fontWeight: activeSubTab === 'categories' ? '600' : '400',
              cursor: 'pointer',
              transition: 'all 0.2s ease',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '8px',
            }}
          >
            <FolderOpen size={20} />
            Categories
          </button>
        </div>

        {/* Chat History Sub-Tab */}
        {activeSubTab === 'history' && (
          <>
        <p style={{ color: currentTheme.textSecondary, marginBottom: '24px', fontSize: '1rem' }}>
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
            border: `1px solid ${currentTheme.borderLight}`, borderRadius: '16px',
          }}>
            <Clock size={48} color={currentTheme.textMuted} style={{ marginBottom: '16px', opacity: 0.5 }} />
            <p style={{ color: currentTheme.textMuted, fontSize: '1.1rem', margin: '0 0 8px 0' }}>
              No conversation history yet
            </p>
            <p style={{ color: currentTheme.textMuted, fontSize: '0.85rem', margin: 0, opacity: 0.7 }}>
              Your conversations will automatically appear here after each prompt.
            </p>
          </div>
        ) : (
          <div style={{ display: 'flex', gap: '24px' }}>
            {/* Left: Starred + Year → Month → Day hierarchy */}
            <div style={{
              width: selectedConvo ? '360px' : '100%',
              minWidth: selectedConvo ? '360px' : undefined,
              flexShrink: 0,
            }}>
              {/* Starred / Favorites section */}
              {history.some(c => c.starred) && (
                <div style={{ marginBottom: '12px' }}>
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
                      cursor: 'pointer', transition: 'all 0.2s ease',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                      <Star size={18} color="#f59e0b" fill="#f59e0b" />
                      <span style={{ fontSize: '1.1rem', fontWeight: '700', color: currentTheme.text }}>
                        Starred
                      </span>
                      <span style={{
                        padding: '2px 10px', background: 'rgba(245, 158, 11, 0.12)',
                        borderRadius: '10px', fontSize: '0.75rem', color: '#f59e0b', fontWeight: '600',
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
                          padding: '8px',
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
                                <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '16px', marginTop: '4px' }}>
                                  {hasMore && (
                                    <button
                                      onClick={() => setStarredVisibleCount(prev => prev + 5)}
                                      style={{
                                        background: 'transparent', border: 'none', cursor: 'pointer',
                                        color: '#f59e0b', fontSize: '0.82rem', fontWeight: '500', padding: '6px 12px',
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
                                        color: currentTheme.textMuted, fontSize: '0.78rem', fontWeight: '400', padding: '6px 8px',
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
                  <div key={year} style={{ marginBottom: '8px' }}>
                    {/* Year header */}
                    <button
                      onClick={() => toggleYear(year)}
                      style={{
                        width: '100%', display: 'flex', alignItems: 'center',
                        justifyContent: 'space-between', padding: '14px 18px',
                        background: isYearOpen ? `${currentTheme.accent}12` : 'transparent',
                        border: `1px solid ${isYearOpen ? currentTheme.accent + '30' : currentTheme.borderLight}`,
                        borderRadius: isYearOpen ? '14px 14px 0 0' : '14px',
                        cursor: 'pointer', transition: 'all 0.2s ease',
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                        <Calendar size={18} color={currentTheme.accent} />
                        <span style={{ fontSize: '1.1rem', fontWeight: '700', color: currentTheme.text }}>
                          {year}
                        </span>
                        <span style={{
                          padding: '2px 10px', background: currentTheme.buttonBackground,
                          borderRadius: '10px', fontSize: '0.75rem', color: currentTheme.textMuted, fontWeight: '600',
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
                            padding: '6px',
                          }}
                        >
                          {sortedMonthKeys.map((monthKey) => {
                            const monthData = yearData[monthKey]
                            const isMonthOpen = expandedMonths[monthKey]
                            const monthCount = countInMonth(monthData)
                            const sortedDayKeys = Object.keys(monthData).sort((a, b) => b.localeCompare(a))

                            return (
                              <div key={monthKey} style={{ marginBottom: '4px' }}>
                                {/* Month header */}
                                <button
                                  onClick={() => toggleMonth(monthKey)}
                                  style={{
                                    width: '100%', display: 'flex', alignItems: 'center',
                                    justifyContent: 'space-between', padding: '10px 14px',
                                    background: isMonthOpen ? `${currentTheme.accentSecondary}10` : 'transparent',
                                    border: `1px solid ${isMonthOpen ? currentTheme.accentSecondary + '25' : 'transparent'}`,
                                    borderRadius: isMonthOpen ? '10px 10px 0 0' : '10px',
                                    cursor: 'pointer', transition: 'all 0.2s ease',
                                  }}
                                >
                                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                    <span style={{ fontSize: '0.95rem', fontWeight: '600', color: currentTheme.text }}>
                                      {getMonthLabel(monthKey)}
                                    </span>
                                    <span style={{
                                      padding: '1px 8px', background: currentTheme.buttonBackground,
                                      borderRadius: '8px', fontSize: '0.7rem', color: currentTheme.textMuted, fontWeight: '500',
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
                                        padding: '4px 6px',
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
                                                justifyContent: 'space-between', padding: '8px 12px',
                                                background: isDayOpen ? `${currentTheme.accent}08` : 'transparent',
                                                border: 'none',
                                                borderRadius: isDayOpen ? '8px 8px 0 0' : '8px',
                                                cursor: 'pointer', transition: 'all 0.15s ease',
                                              }}
                                            >
                                              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                                <Clock size={13} color={currentTheme.accentSecondary} />
                                                <span style={{ fontSize: '0.85rem', fontWeight: '500', color: currentTheme.text }}>
                                                  {getDayLabel(dayKey)}
                                                </span>
                                                <span style={{
                                                  padding: '1px 6px', background: currentTheme.buttonBackground,
                                                  borderRadius: '6px', fontSize: '0.65rem', color: currentTheme.textMuted, fontWeight: '500',
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
                                                  style={{ overflow: 'hidden', padding: '4px 4px 4px 16px' }}
                                                >
                                                  {dayConvos.map(convo => renderConvoCard(convo))}
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
              zIndex: 120,
              width: '42px',
              height: '42px',
              borderRadius: '999px',
              border: '1px solid rgba(255, 107, 107, 0.55)',
              background: 'rgba(255, 107, 107, 0.18)',
              color: '#ff6b6b',
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

      {/* Cursor-following tooltip for category prompts */}
      {promptTooltip.visible && (
        <div
          style={{
            position: 'fixed',
            left: promptTooltip.x + 14,
            top: promptTooltip.y - 36,
            background: 'rgba(0, 0, 0, 0.88)',
            border: `1px solid ${currentTheme.accent}40`,
            borderRadius: '8px',
            padding: '6px 12px',
            pointerEvents: 'none',
            zIndex: 9999,
            whiteSpace: 'nowrap',
            boxShadow: '0 4px 12px rgba(0, 0, 0, 0.4)',
            backdropFilter: 'blur(8px)',
          }}
        >
          <span style={{ color: '#ffffff', fontSize: '0.75rem', fontWeight: '500' }}>
            Double-click to view in Chat History
          </span>
        </div>
      )}

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
        confirmColor="#ff6b6b"
      />
    </div>
  )
}

// Expandable summary/judge for detail view
const ExpandableSummary = ({ summary, currentTheme, judgeTurns = [], defaultExpanded = false }) => {
  const [expanded, setExpanded] = useState(defaultExpanded)
  useEffect(() => {
    setExpanded(defaultExpanded)
  }, [defaultExpanded, summary?.timestamp, summary?.text])
  const label = summary.singleModel
    ? `${summary.modelName || 'Model'} Response`
    : 'Judge Summary'
  const turnCount = judgeTurns.length

  return (
    <div style={{ marginBottom: '16px' }}>
      <button
        onClick={() => setExpanded(!expanded)}
        style={{
          display: 'flex', alignItems: 'center', gap: '8px',
          padding: '0 0 6px 0', marginBottom: '8px',
          background: 'none', border: 'none', cursor: 'pointer', color: currentTheme.text,
          borderBottom: '1.5px solid rgba(96, 165, 250, 0.3)',
          width: '100%',
        }}
      >
        <span style={{
          fontWeight: '600', fontSize: '0.9rem',
          textDecoration: 'underline',
          textDecorationColor: '#60a5fa',
          textUnderlineOffset: '4px',
        }}>{label}</span>
        {turnCount > 0 && (
          <span style={{ fontSize: '0.7rem', color: currentTheme.textMuted, fontWeight: '500' }}>
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
              <div style={{ marginTop: '8px' }}>
                {judgeTurns.map((turn, tIdx) => (
                  <div key={`judge-convo-${tIdx}`} style={{ marginBottom: '12px' }}>
                    {/* User message */}
                    <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '8px' }}>
                      <div style={{ maxWidth: '80%', padding: '10px 14px' }}>
                        <div style={{
                          fontSize: '0.65rem', fontWeight: '600', color: currentTheme.accent,
                          marginBottom: '4px', textTransform: 'uppercase', letterSpacing: '0.5px',
                        }}>You</div>
                        <p style={{
                          color: currentTheme.text, margin: 0, lineHeight: '1.5',
                          fontSize: '0.9rem', whiteSpace: 'pre-wrap',
                        }}>{turn.user}</p>
                      </div>
                    </div>
                    {/* Judge follow-up response */}
                    {turn.assistant && (
                      <div style={{ padding: '0 0 8px 0' }}>
                        <div style={{
                          fontSize: '0.7rem', fontWeight: '600',
                          color: '#60a5fa',
                          marginBottom: '6px',
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

// Expandable model response for detail view
const ExpandableResponse = ({ resp, idx, currentTheme, conversationTurns = [], defaultExpanded = false }) => {
  const [expanded, setExpanded] = useState(defaultExpanded)
  useEffect(() => {
    setExpanded(defaultExpanded)
  }, [defaultExpanded, resp?.id, resp?.modelName, resp?.actualModelName, resp?.text])
  const providerKey = getProviderFromModelName(resp.modelName || resp.actualModelName)
  const providerInfo = PROVIDER_MAP[providerKey] || { name: providerKey, color: '#888' }
  const modelName = resp.modelName || resp.actualModelName || `Model ${idx + 1}`

  return (
    <div style={{ marginBottom: '16px' }}>
      {/* Model name header — underlined, clickable to expand */}
      <button
        onClick={() => setExpanded(!expanded)}
        style={{
          display: 'flex', alignItems: 'center', gap: '8px',
          padding: '0 0 6px 0', marginBottom: '8px',
          background: 'none', border: 'none', cursor: 'pointer', color: currentTheme.text,
          borderBottom: `1.5px solid ${providerInfo.color}40`,
          width: '100%',
        }}
      >
        <div style={{
          width: '8px', height: '8px', borderRadius: '50%',
          background: providerInfo.color, flexShrink: 0,
        }} />
        <span style={{
          fontWeight: '600', fontSize: '0.9rem',
          textDecoration: 'underline',
          textDecorationColor: providerInfo.color,
          textUnderlineOffset: '4px',
        }}>
          {modelName}
        </span>
        {resp.error && (
          <span style={{ fontSize: '0.7rem', color: '#ff6b6b', fontWeight: '500' }}>Error</span>
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
              <div style={{ marginTop: '8px' }}>
                {conversationTurns.map((turn, tIdx) => (
                  <div key={`convo-${tIdx}`} style={{ marginBottom: '12px' }}>
                    {/* User follow-up message */}
                    <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '8px' }}>
                      <div style={{ maxWidth: '80%', padding: '10px 14px' }}>
                        <div style={{
                          fontSize: '0.65rem', fontWeight: '600', color: currentTheme.accent,
                          marginBottom: '4px', textTransform: 'uppercase', letterSpacing: '0.5px',
                        }}>You</div>
                        <p style={{
                          color: currentTheme.text, margin: 0, lineHeight: '1.5',
                          fontSize: '0.9rem', whiteSpace: 'pre-wrap',
                        }}>{turn.user}</p>
                      </div>
                    </div>
                    {/* Model follow-up response */}
                    {turn.assistant && (
                      <div style={{ padding: '0 0 8px 0' }}>
                        <div style={{
                          fontSize: '0.7rem', fontWeight: '600',
                          color: providerInfo.color,
                          marginBottom: '6px',
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
