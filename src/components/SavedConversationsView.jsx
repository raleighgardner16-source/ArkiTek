import React, { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Trash2, ChevronRight, ChevronDown, ChevronUp, MessageCircle, X, Layers, Calendar } from 'lucide-react'
import { useStore } from '../store/useStore'
import { getTheme } from '../utils/theme'
import axios from 'axios'
import { API_URL } from '../utils/config'

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

const SavedConversationsView = () => {
  const currentUser = useStore((state) => state.currentUser)
  const theme = useStore((state) => state.theme || 'dark')
  const currentTheme = getTheme(theme)

  const [conversations, setConversations] = useState([])
  const [loading, setLoading] = useState(true)
  const [selectedConvo, setSelectedConvo] = useState(null) // full detail of selected conversation
  const [loadingDetail, setLoadingDetail] = useState(false)
  const [confirmDeleteId, setConfirmDeleteId] = useState(null) // id of card showing inline confirm
  const [deletingId, setDeletingId] = useState(null) // id currently being deleted
  const [filter, setFilter] = useState('individual') // 'individual', 'full'
  const [selectedProvider, setSelectedProvider] = useState(null) // provider key for individual tab
  const [expandedMonths, setExpandedMonths] = useState({}) // Track which month/year groups are expanded

  useEffect(() => {
    if (currentUser?.id) {
      fetchConversations()
    }
  }, [currentUser])

  const fetchConversations = async () => {
    setLoading(true)
    try {
      const res = await axios.get(`${API_URL}/api/conversations/${currentUser.id}`)
      setConversations(res.data.conversations || [])
    } catch (error) {
      console.error('[Saved] Error fetching conversations:', error)
    }
    setLoading(false)
  }

  const fetchDetail = async (convoId) => {
    setLoadingDetail(true)
    try {
      const res = await axios.get(`${API_URL}/api/conversations/detail/${convoId}`)
      setSelectedConvo(res.data.conversation)
    } catch (error) {
      console.error('[Saved] Error fetching detail:', error)
      alert('Failed to load conversation details.')
    }
    setLoadingDetail(false)
  }

  const handleDelete = async (convoId, convoType) => {
    try {
      setDeletingId(convoId)
      await axios.delete(`${API_URL}/api/conversations/${convoId}`, {
        data: { userId: currentUser.id, type: convoType }
      })
      setConversations(prev => prev.filter(c => c.id !== convoId))
      if (selectedConvo?.id === convoId) {
        setSelectedConvo(null)
      }
      setConfirmDeleteId(null)
    } catch (error) {
      console.error('[Saved] Error deleting:', error)
      alert('Failed to delete conversation.')
    } finally {
      setDeletingId(null)
    }
  }

  const filteredConversations = conversations.filter(c => {
    if (c.type !== filter) return false
    if (filter === 'individual' && selectedProvider) {
      return getProviderFromModelName(c.modelName) === selectedProvider
    }
    return true
  })

  // Build provider counts for individual responses
  const individualConvos = conversations.filter(c => c.type === 'individual')
  const providerCounts = {}
  individualConvos.forEach(c => {
    const provider = getProviderFromModelName(c.modelName)
    providerCounts[provider] = (providerCounts[provider] || 0) + 1
  })
  // Sort providers alphabetically by display name
  const availableProviders = Object.keys(providerCounts).sort((a, b) => {
    const nameA = PROVIDER_MAP[a]?.name || a
    const nameB = PROVIDER_MAP[b]?.name || b
    return nameA.localeCompare(nameB)
  })

  const formatDate = (dateStr) => {
    const d = new Date(dateStr)
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) +
      ' at ' + d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })
  }

  const formatDayOnly = (dateStr) => {
    const d = new Date(dateStr)
    return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' }) +
      ' at ' + d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })
  }

  const getMonthYearKey = (dateStr) => {
    const d = new Date(dateStr)
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
  }

  const getMonthYearLabel = (key) => {
    const [year, month] = key.split('-')
    const d = new Date(parseInt(year), parseInt(month) - 1)
    return d.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
  }

  // Group filtered conversations by month/year
  const groupedConversations = filteredConversations.reduce((groups, convo) => {
    const key = getMonthYearKey(convo.savedAt)
    if (!groups[key]) groups[key] = []
    groups[key].push(convo)
    return groups
  }, {})

  // Sort month keys in descending order (newest first)
  const sortedMonthKeys = Object.keys(groupedConversations).sort((a, b) => b.localeCompare(a))

  // Reset expanded months when filter or provider changes so all tabs start closed
  useEffect(() => {
    setExpandedMonths({})
  }, [filter, selectedProvider])

  const toggleMonth = (monthKey) => {
    setExpandedMonths(prev => ({ ...prev, [monthKey]: !prev[monthKey] }))
  }

  const renderConvoCard = (convo) => (
    <motion.div
      key={convo.id}
      onClick={() => fetchDetail(convo.id)}
      style={{
        background: selectedConvo?.id === convo.id
          ? `${currentTheme.accent}15`
          : currentTheme.backgroundOverlay,
        border: `1px solid ${selectedConvo?.id === convo.id ? currentTheme.accent + '40' : currentTheme.borderLight}`,
        borderRadius: '12px',
        padding: '16px',
        marginBottom: '10px',
        cursor: 'pointer',
        transition: 'all 0.2s ease',
      }}
      whileHover={{
        background: `${currentTheme.accent}10`,
        borderColor: `${currentTheme.accent}30`,
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
            {convo.type === 'full' ? (
              <Layers size={16} color="#60a5fa" />
            ) : (
              <MessageCircle size={16} color="#a855f7" />
            )}
            <span style={{
              fontSize: '0.7rem',
              fontWeight: '600',
              color: convo.type === 'full' ? '#60a5fa' : '#a855f7',
              textTransform: 'uppercase',
              letterSpacing: '0.5px',
            }}>
              {convo.type === 'full' ? 'All Council Responses' : convo.modelName || 'Individual'}
            </span>
          </div>
          <p style={{
            color: currentTheme.text,
            fontSize: '0.95rem',
            fontWeight: '500',
            margin: '0 0 6px 0',
            lineHeight: '1.3',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}>
            {convo.title}
          </p>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={{ fontSize: '0.75rem', color: currentTheme.textMuted }}>
              {formatDayOnly(convo.savedAt)}
            </span>
            {convo.category && convo.category !== 'General' && (
              <span style={{
                padding: '2px 6px',
                background: currentTheme.buttonBackground,
                borderRadius: '4px',
                fontSize: '0.7rem',
                color: currentTheme.textMuted,
              }}>
                {convo.category}
              </span>
            )}
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
          {confirmDeleteId === convo.id ? (
            <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }} onClick={(e) => e.stopPropagation()}>
              <button
                onClick={(e) => {
                  e.stopPropagation()
                  handleDelete(convo.id, convo.type)
                }}
                disabled={deletingId === convo.id}
                style={{
                  background: 'rgba(255, 107, 107, 0.15)',
                  border: '1px solid rgba(255, 107, 107, 0.4)',
                  borderRadius: '8px',
                  padding: '5px 10px',
                  color: '#ff6b6b',
                  fontSize: '0.72rem',
                  fontWeight: '600',
                  cursor: deletingId === convo.id ? 'default' : 'pointer',
                  opacity: deletingId === convo.id ? 0.5 : 1,
                  transition: 'all 0.15s ease',
                  whiteSpace: 'nowrap',
                }}
              >
                {deletingId === convo.id ? 'Deleting...' : 'Delete'}
              </button>
              <button
                onClick={(e) => {
                  e.stopPropagation()
                  setConfirmDeleteId(null)
                }}
                style={{
                  background: currentTheme.buttonBackground,
                  border: `1px solid ${currentTheme.borderLight}`,
                  borderRadius: '8px',
                  padding: '5px 10px',
                  color: currentTheme.textSecondary,
                  fontSize: '0.72rem',
                  fontWeight: '500',
                  cursor: 'pointer',
                  transition: 'all 0.15s ease',
                  whiteSpace: 'nowrap',
                }}
              >
                Cancel
              </button>
            </div>
          ) : (
            <>
              <button
                onClick={(e) => {
                  e.stopPropagation()
                  setConfirmDeleteId(convo.id)
                }}
                style={{
                  background: 'transparent',
                  border: 'none',
                  cursor: 'pointer',
                  padding: '6px',
                  borderRadius: '6px',
                  transition: 'all 0.15s ease',
                  opacity: 0.5,
                }}
                onMouseEnter={(e) => { e.currentTarget.style.opacity = '1'; e.currentTarget.style.background = 'rgba(255, 107, 107, 0.1)' }}
                onMouseLeave={(e) => { e.currentTarget.style.opacity = '0.5'; e.currentTarget.style.background = 'transparent' }}
                title="Delete this conversation"
              >
                <Trash2 size={16} color="#ff6b6b" />
              </button>
              <ChevronRight size={16} color={currentTheme.textMuted} />
            </>
          )}
        </div>
      </div>
    </motion.div>
  )

  // Detail view of a single conversation
  const renderDetail = () => {
    if (!selectedConvo) return null

    return (
      <motion.div
        initial={{ opacity: 0, x: 20 }}
        animate={{ opacity: 1, x: 0 }}
        exit={{ opacity: 0, x: 20 }}
        style={{
          flex: 1,
          background: currentTheme.backgroundOverlay,
          border: `1px solid ${currentTheme.borderLight}`,
          borderRadius: '16px',
          padding: '24px',
          overflowY: 'auto',
          maxHeight: 'calc(100vh - 220px)',
        }}
      >
        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '20px' }}>
          <div style={{ flex: 1 }}>
            <h2 style={{
              fontSize: '1.4rem',
              color: currentTheme.text,
              margin: '0 0 8px 0',
              lineHeight: '1.3',
            }}>
              {selectedConvo.title}
            </h2>
            <div style={{ display: 'flex', gap: '12px', alignItems: 'center', flexWrap: 'wrap' }}>
              <span style={{
                padding: '4px 10px',
                background: selectedConvo.type === 'full' ? 'rgba(59, 130, 246, 0.15)' : 'rgba(168, 85, 247, 0.15)',
                border: `1px solid ${selectedConvo.type === 'full' ? 'rgba(59, 130, 246, 0.4)' : 'rgba(168, 85, 247, 0.4)'}`,
                borderRadius: '6px',
                fontSize: '0.75rem',
                color: selectedConvo.type === 'full' ? '#60a5fa' : '#a855f7',
                fontWeight: '600',
              }}>
                {selectedConvo.type === 'full' ? 'All Council Responses' : 'Individual'}
              </span>
              {selectedConvo.modelName && (
                <span style={{ fontSize: '0.85rem', color: currentTheme.textSecondary }}>
                  {selectedConvo.modelName}
                </span>
              )}
              <span style={{ fontSize: '0.8rem', color: currentTheme.textMuted }}>
                {formatDate(selectedConvo.savedAt)}
              </span>
              {selectedConvo.category && (
                <span style={{
                  padding: '3px 8px',
                  background: currentTheme.buttonBackground,
                  borderRadius: '4px',
                  fontSize: '0.75rem',
                  color: currentTheme.textSecondary,
                }}>
                  {selectedConvo.category}
                </span>
              )}
            </div>
          </div>
          <button
            onClick={() => setSelectedConvo(null)}
            style={{
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              padding: '8px',
              color: currentTheme.textMuted,
            }}
          >
            <X size={20} />
          </button>
        </div>

        {/* Original Prompt */}
        {selectedConvo.originalPrompt && (
          <div style={{
            background: currentTheme.buttonBackground,
            border: `1px solid ${currentTheme.borderLight}`,
            borderRadius: '12px',
            padding: '16px',
            marginBottom: '20px',
          }}>
            <div style={{ fontSize: '0.75rem', color: currentTheme.accent, fontWeight: '600', marginBottom: '6px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
              Original Prompt
            </div>
            <p style={{ color: currentTheme.text, margin: 0, lineHeight: '1.6', whiteSpace: 'pre-wrap' }}>
              {selectedConvo.originalPrompt}
            </p>
          </div>
        )}

        {/* Individual model response */}
        {selectedConvo.type === 'individual' && (
          <>
            <div style={{
              background: currentTheme.buttonBackground,
              border: `1px solid ${currentTheme.borderLight}`,
              borderRadius: '12px',
              padding: '16px',
              marginBottom: '16px',
            }}>
              <div style={{ fontSize: '0.75rem', color: currentTheme.accent, fontWeight: '600', marginBottom: '6px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                {selectedConvo.modelName || 'Model'} Response
              </div>
              <p style={{ color: currentTheme.textSecondary, margin: 0, lineHeight: '1.6', whiteSpace: 'pre-wrap', fontSize: '0.95rem' }}>
                {selectedConvo.modelResponse}
              </p>
            </div>

            {/* Conversation history */}
            {selectedConvo.conversation && selectedConvo.conversation.length > 0 && (
              <div style={{ marginTop: '16px' }}>
                <h3 style={{ fontSize: '1rem', color: currentTheme.text, marginBottom: '12px' }}>
                  Conversation History ({selectedConvo.conversation.length} messages)
                </h3>
                {selectedConvo.conversation.map((msg, idx) => (
                  <div
                    key={idx}
                    style={{
                      display: 'flex',
                      justifyContent: msg.role === 'user' ? 'flex-end' : 'flex-start',
                      marginBottom: '10px',
                    }}
                  >
                    <div style={{
                      maxWidth: '80%',
                      padding: '12px 16px',
                      borderRadius: '12px',
                      background: msg.role === 'user'
                        ? currentTheme.accentGradient
                        : currentTheme.buttonBackground,
                      border: msg.role === 'user' ? 'none' : `1px solid ${currentTheme.borderLight}`,
                      color: msg.role === 'user' ? '#000' : currentTheme.textSecondary,
                    }}>
                      <div style={{ fontSize: '0.7rem', fontWeight: '600', marginBottom: '4px', textTransform: 'uppercase', opacity: 0.7 }}>
                        {msg.role === 'user' ? 'You' : selectedConvo.modelName || 'Assistant'}
                      </div>
                      <p style={{ margin: 0, lineHeight: '1.5', whiteSpace: 'pre-wrap', fontSize: '0.9rem' }}>
                        {msg.text}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </>
        )}

        {/* Full session responses */}
        {selectedConvo.type === 'full' && (
          <>
            {/* All model responses */}
            {selectedConvo.responses && selectedConvo.responses.length > 0 && (
              <div style={{ marginBottom: '20px' }}>
                <h3 style={{ fontSize: '1rem', color: currentTheme.text, marginBottom: '12px' }}>
                  Council Responses ({selectedConvo.responses.length} models)
                </h3>
                {selectedConvo.responses.map((resp, idx) => (
                  <ExpandableResponse
                    key={idx}
                    resp={resp}
                    idx={idx}
                    currentTheme={currentTheme}
                  />
                ))}
              </div>
            )}

            {/* Summary / Judge */}
            {selectedConvo.summary && (
              <div style={{
                background: currentTheme.buttonBackground,
                border: `1px solid ${currentTheme.borderLight}`,
                borderRadius: '12px',
                padding: '16px',
                marginBottom: '16px',
              }}>
                <div style={{ fontSize: '0.75rem', color: currentTheme.accent, fontWeight: '600', marginBottom: '6px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                  {selectedConvo.summary.singleModel ? `${selectedConvo.summary.modelName || 'Model'} Response` : 'Judge Summary'}
                </div>
                <p style={{ color: currentTheme.textSecondary, margin: 0, lineHeight: '1.6', whiteSpace: 'pre-wrap', fontSize: '0.95rem' }}>
                  {selectedConvo.summary.text}
                </p>
              </div>
            )}

            {/* Sources */}
            {selectedConvo.sources && selectedConvo.sources.length > 0 && (
              <div style={{
                background: currentTheme.buttonBackground,
                border: `1px solid ${currentTheme.borderLight}`,
                borderRadius: '12px',
                padding: '16px',
                marginBottom: '16px',
              }}>
                <div style={{ fontSize: '0.75rem', color: currentTheme.accent, fontWeight: '600', marginBottom: '10px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                  Sources ({selectedConvo.sources.length})
                </div>
                {selectedConvo.sources.map((source, idx) => (
                  <div key={idx} style={{ marginBottom: '8px' }}>
                    <a
                      href={source.link || source.url || '#'}
                      target="_blank"
                      rel="noopener noreferrer"
                      style={{
                        color: currentTheme.accent,
                        fontSize: '0.9rem',
                        textDecoration: 'none',
                      }}
                    >
                      {source.title || source.link || source.url || `Source ${idx + 1}`}
                    </a>
                    {source.snippet && (
                      <p style={{ color: currentTheme.textMuted, fontSize: '0.8rem', margin: '4px 0 0 0', lineHeight: '1.4' }}>
                        {source.snippet}
                      </p>
                    )}
                  </div>
                ))}
              </div>
            )}

            {/* Facts */}
            {selectedConvo.facts && selectedConvo.facts.length > 0 && (
              <div style={{
                background: currentTheme.buttonBackground,
                border: `1px solid ${currentTheme.borderLight}`,
                borderRadius: '12px',
                padding: '16px',
              }}>
                <div style={{ fontSize: '0.75rem', color: currentTheme.accent, fontWeight: '600', marginBottom: '10px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                  Facts ({selectedConvo.facts.length})
                </div>
                {selectedConvo.facts.map((fact, idx) => (
                  <p key={idx} style={{ color: currentTheme.textSecondary, fontSize: '0.85rem', margin: '0 0 6px 0', lineHeight: '1.5' }}>
                    • {typeof fact === 'string' ? fact : fact.text || JSON.stringify(fact)}
                  </p>
                ))}
              </div>
            )}
          </>
        )}
      </motion.div>
    )
  }

  return (
    <div style={{
      position: 'fixed',
      top: 0,
      left: '240px',
      width: 'calc(100% - 240px)',
      height: '100%',
      overflowY: 'auto',
      zIndex: 10,
      padding: '40px',
    }}>
      <div style={{ maxWidth: '1200px', margin: '0 auto' }}>
      {/* Header */}
      <h1
        key={`title-${theme}`}
        style={{
          fontSize: '2.5rem',
          marginBottom: '12px',
          background: currentTheme.accentGradient,
          WebkitBackgroundClip: 'text',
          WebkitTextFillColor: 'transparent',
          color: currentTheme.accent,
          display: 'inline-block',
        }}
      >
        Saved Conversations
      </h1>
      <p style={{ color: currentTheme.textSecondary, marginBottom: '24px', fontSize: '1rem' }}>
        {conversations.length} saved conversation{conversations.length !== 1 ? 's' : ''}
      </p>

      {/* Filter tabs */}
      <div style={{ display: 'flex', gap: '8px', marginBottom: '24px' }}>
        {[
          { id: 'individual', label: 'Individual Responses' },
          { id: 'full', label: 'All Council Responses' },
        ].map(f => (
          <button
            key={f.id}
            onClick={() => { setFilter(f.id); if (f.id === 'full') setSelectedProvider(null) }}
            style={{
              padding: '8px 16px',
              background: 'transparent',
              border: 'none',
              borderBottom: filter === f.id ? `2px solid ${currentTheme.accent}` : '2px solid transparent',
              borderRadius: '0',
              color: filter === f.id ? currentTheme.accent : currentTheme.textSecondary,
              fontSize: '0.85rem',
              fontWeight: filter === f.id ? '600' : '400',
              cursor: 'pointer',
              transition: 'all 0.2s ease',
            }}
          >
            {f.label}
          </button>
        ))}
      </div>

      {/* Provider sub-tabs for Individual Responses */}
      {filter === 'individual' && availableProviders.length > 0 && (
        <div style={{ display: 'flex', gap: '8px', marginBottom: '20px', flexWrap: 'wrap' }}>
          <button
            onClick={() => setSelectedProvider(null)}
            style={{
              padding: '6px 14px',
              background: selectedProvider === null
                ? `${currentTheme.accent}20`
                : currentTheme.buttonBackground,
              border: `1px solid ${selectedProvider === null ? currentTheme.accent + '60' : currentTheme.borderLight}`,
              borderRadius: '20px',
              color: selectedProvider === null ? currentTheme.accent : currentTheme.textSecondary,
              fontSize: '0.8rem',
              fontWeight: selectedProvider === null ? '600' : '400',
              cursor: 'pointer',
              transition: 'all 0.2s ease',
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
            }}
          >
            All
            <span style={{
              padding: '1px 7px',
              background: selectedProvider === null ? currentTheme.accent + '30' : currentTheme.backgroundOverlay,
              borderRadius: '10px',
              fontSize: '0.7rem',
              fontWeight: '600',
              color: selectedProvider === null ? currentTheme.accent : currentTheme.textMuted,
              minWidth: '20px',
              textAlign: 'center',
            }}>
              {individualConvos.length}
            </span>
          </button>
          {availableProviders.map(providerKey => {
            const info = PROVIDER_MAP[providerKey] || { name: providerKey, color: '#888' }
            const isActive = selectedProvider === providerKey
            return (
              <button
                key={providerKey}
                onClick={() => setSelectedProvider(isActive ? null : providerKey)}
                style={{
                  padding: '6px 14px',
                  background: isActive
                    ? `${info.color}20`
                    : currentTheme.buttonBackground,
                  border: `1px solid ${isActive ? info.color + '60' : currentTheme.borderLight}`,
                  borderRadius: '20px',
                  color: isActive ? info.color : currentTheme.textSecondary,
                  fontSize: '0.8rem',
                  fontWeight: isActive ? '600' : '400',
                  cursor: 'pointer',
                  transition: 'all 0.2s ease',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                }}
              >
                {info.name}
                <span style={{
                  padding: '1px 7px',
                  background: isActive ? info.color + '30' : currentTheme.backgroundOverlay,
                  borderRadius: '10px',
                  fontSize: '0.7rem',
                  fontWeight: '600',
                  color: isActive ? info.color : currentTheme.textMuted,
                  minWidth: '20px',
                  textAlign: 'center',
                }}>
                  {providerCounts[providerKey]}
                </span>
              </button>
            )
          })}
        </div>
      )}

      {loading ? (
        <div style={{ textAlign: 'center', padding: '60px', color: currentTheme.textMuted }}>
          Loading saved conversations...
        </div>
      ) : filteredConversations.length === 0 ? (
        <div style={{ 
          textAlign: 'center', 
          padding: '60px',
          background: currentTheme.backgroundOverlay,
          border: `1px solid ${currentTheme.borderLight}`,
          borderRadius: '16px',
        }}>
          <MessageCircle size={48} color={currentTheme.textMuted} style={{ marginBottom: '16px', opacity: 0.5 }} />
          <p style={{ color: currentTheme.textMuted, fontSize: '1.1rem', margin: '0 0 8px 0' }}>
            No saved conversations yet
          </p>
          <p style={{ color: currentTheme.textMuted, fontSize: '0.85rem', margin: 0, opacity: 0.7 }}>
            Use the save buttons in model responses or the "Save All" button to save conversations.
          </p>
        </div>
      ) : (
        <div style={{ display: 'flex', gap: '24px' }}>
          {/* Conversation list grouped by month/year */}
          <div style={{
            width: selectedConvo ? '340px' : '100%',
            minWidth: selectedConvo ? '340px' : undefined,
            transition: 'width 0.3s ease',
          }}>
            {sortedMonthKeys.map((monthKey) => {
              const isExpanded = expandedMonths[monthKey]
              const convosInMonth = groupedConversations[monthKey]
              return (
                <div key={monthKey} style={{ marginBottom: '12px' }}>
                  {/* Month/Year Header */}
                  <button
                    onClick={() => toggleMonth(monthKey)}
                    style={{
                      width: '100%',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      padding: '12px 16px',
                      background: isExpanded
                        ? `${currentTheme.accent}12`
                        : currentTheme.backgroundOverlay,
                      border: `1px solid ${isExpanded ? currentTheme.accent + '30' : currentTheme.borderLight}`,
                      borderRadius: isExpanded ? '12px 12px 0 0' : '12px',
                      cursor: 'pointer',
                      transition: 'all 0.2s ease',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                      <Calendar size={16} color={currentTheme.accent} />
                      <span style={{
                        fontSize: '0.95rem',
                        fontWeight: '600',
                        color: currentTheme.text,
                      }}>
                        {getMonthYearLabel(monthKey)}
                      </span>
                      <span style={{
                        padding: '2px 8px',
                        background: currentTheme.buttonBackground,
                        borderRadius: '10px',
                        fontSize: '0.75rem',
                        color: currentTheme.textMuted,
                        fontWeight: '500',
                      }}>
                        {convosInMonth.length}
                      </span>
                    </div>
                    {isExpanded ? (
                      <ChevronUp size={18} color={currentTheme.textMuted} />
                    ) : (
                      <ChevronDown size={18} color={currentTheme.textMuted} />
                    )}
                  </button>

                  {/* Expanded month content */}
                  <AnimatePresence>
                    {isExpanded && (
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
                          borderRadius: '0 0 12px 12px',
                          padding: '8px',
                        }}
                      >
                        {convosInMonth.map((convo) => renderConvoCard(convo))}
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              )
            })}
          </div>

          {/* Detail panel */}
          <AnimatePresence mode="wait">
            {loadingDetail ? (
              <div style={{
                flex: 1,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: currentTheme.textMuted,
              }}>
                Loading...
              </div>
            ) : selectedConvo ? (
              renderDetail()
            ) : null}
          </AnimatePresence>
        </div>
      )}

      </div>
    </div>
  )
}

// Expandable model response for full session view
const ExpandableResponse = ({ resp, idx, currentTheme }) => {
  const [expanded, setExpanded] = useState(idx === 0)

  return (
    <div style={{
      background: currentTheme.buttonBackground,
      border: `1px solid ${currentTheme.borderLight}`,
      borderRadius: '12px',
      marginBottom: '10px',
      overflow: 'hidden',
    }}>
      <button
        onClick={() => setExpanded(!expanded)}
        style={{
          width: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '14px 16px',
          background: 'none',
          border: 'none',
          cursor: 'pointer',
          color: currentTheme.text,
        }}
      >
        <span style={{ fontWeight: '600', fontSize: '0.9rem' }}>
          {resp.modelName || `Model ${idx + 1}`}
        </span>
        {expanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
      </button>
      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            style={{ overflow: 'hidden' }}
          >
            <div style={{ padding: '0 16px 16px 16px' }}>
              <p style={{ color: currentTheme.textSecondary, margin: 0, lineHeight: '1.6', whiteSpace: 'pre-wrap', fontSize: '0.9rem' }}>
                {resp.modelResponse}
              </p>
              {/* Conversation history for this model */}
              {resp.conversation && resp.conversation.length > 0 && (
                <div style={{ marginTop: '14px', paddingTop: '14px', borderTop: `1px solid ${currentTheme.borderLight}` }}>
                  <div style={{ fontSize: '0.75rem', color: currentTheme.textMuted, marginBottom: '8px', fontWeight: '600' }}>
                    Conversation ({resp.conversation.length} messages)
                  </div>
                  {resp.conversation.map((msg, msgIdx) => (
                    <div
                      key={msgIdx}
                      style={{
                        display: 'flex',
                        justifyContent: msg.role === 'user' ? 'flex-end' : 'flex-start',
                        marginBottom: '8px',
                      }}
                    >
                      <div style={{
                        maxWidth: '85%',
                        padding: '10px 14px',
                        borderRadius: '10px',
                        background: msg.role === 'user' ? 'rgba(59, 130, 246, 0.15)' : currentTheme.backgroundOverlay,
                        border: `1px solid ${msg.role === 'user' ? 'rgba(59, 130, 246, 0.3)' : currentTheme.borderLight}`,
                      }}>
                        <div style={{ fontSize: '0.65rem', fontWeight: '600', marginBottom: '3px', textTransform: 'uppercase', color: currentTheme.textMuted }}>
                          {msg.role === 'user' ? 'You' : resp.modelName || 'Assistant'}
                        </div>
                        <p style={{ margin: 0, color: currentTheme.textSecondary, fontSize: '0.85rem', lineHeight: '1.5', whiteSpace: 'pre-wrap' }}>
                          {msg.text}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

export default SavedConversationsView

