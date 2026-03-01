import React, { useEffect, useState, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Send, Search, Users, User, Plus, ArrowLeft, X, Hash, MessageCircle, UserPlus } from 'lucide-react'
import { useStore } from '../store/useStore'
import { getTheme } from '../utils/theme'
import api from '../utils/api'
import { spacing, fontSize, fontWeight, radius, transition, layout, sx, createStyles } from '../utils/styles'

interface Props {
  embedded?: boolean
}

const MessagingView = ({ embedded = false }: Props) => {
  const currentUser = useStore((state: any) => state.currentUser)
  const theme = useStore((state: any) => state.theme || 'dark')
  const currentTheme = getTheme(theme)
  const s = createStyles(currentTheme)
  const setViewingProfile = useStore((state: any) => state.setViewingProfile)
  const clearViewingProfile = useStore((state: any) => state.clearViewingProfile)
  const setActiveTab = useStore((state: any) => state.setActiveTab)
  const setUnreadMessageCount = useStore((state: any) => state.setUnreadMessageCount)

  const [activeMessageTab, setActiveMessageTab] = useState('private')
  const [conversations, setConversations] = useState<any[]>([])
  const [activeConversation, setActiveConversation] = useState<any>(null)
  const [messages, setMessages] = useState<any[]>([])
  const [messageText, setMessageText] = useState('')
  const [loading, setLoading] = useState(true)
  const [loadingMessages, setLoadingMessages] = useState(false)
  const [showNewConversation, setShowNewConversation] = useState(false)
  const [showNewGroup, setShowNewGroup] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [searchResults, setSearchResults] = useState<any[]>([])
  const [searchingUsers, setSearchingUsers] = useState(false)
  const [newGroupName, setNewGroupName] = useState('')
  const [newGroupDescription, setNewGroupDescription] = useState('')
  const [selectedMembers, setSelectedMembers] = useState<any[]>([])
  const [conversationSearch, setConversationSearch] = useState('')
  const messagesEndRef = useRef<HTMLDivElement | null>(null)
  const searchTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const pollIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

  useEffect(() => {
    if (!currentUser?.id) return
    fetchConversations()
    pollIntervalRef.current = setInterval(fetchConversations, 10000)
    return () => { if (pollIntervalRef.current) clearInterval(pollIntervalRef.current) }
  }, [currentUser?.id, activeMessageTab])

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  const fetchConversations = async () => {
    if (!currentUser?.id) return
    try {
      const type = activeMessageTab === 'private' ? 'dm' : 'group'
      const response = await api.get(`/messages/conversations/${currentUser.id}?type=${type}`)
      setConversations(response.data.conversations || [])
    } catch (error: any) {
      console.error('Error fetching conversations:', error)
    } finally {
      setLoading(false)
    }
  }

  const fetchMessages = async (conversationId: string) => {
    if (!currentUser?.id) return
    setLoadingMessages(true)
    try {
      const response = await api.get(`/messages/conversation/${conversationId}?userId=${currentUser.id}`)
      setMessages(response.data.messages || [])
    } catch (error: any) {
      console.error('Error fetching messages:', error)
    } finally {
      setLoadingMessages(false)
    }
  }

  const handleSendMessage = async () => {
    if (!messageText.trim() || !activeConversation || !currentUser?.id) return
    const text = messageText.trim()
    setMessageText('')

    const tempMessage = {
      _id: `temp-${Date.now()}`,
      conversationId: activeConversation._id,
      senderId: currentUser.id,
      senderUsername: currentUser.username,
      senderProfileImage: currentUser.profileImage,
      text,
      createdAt: new Date().toISOString(),
      pending: true,
    }
    setMessages(prev => [...prev, tempMessage])

    try {
      await api.post('/messages/send', {
        conversationId: activeConversation._id,
        text,
      })
      await fetchMessages(activeConversation._id)
      fetchConversations()
    } catch (error: any) {
      console.error('Error sending message:', error)
      setMessages(prev => prev.filter(m => m._id !== tempMessage._id))
      setMessageText(text)
    }
  }

  useEffect(() => {
    if (!searchQuery.trim()) {
      setSearchResults([])
      return
    }
    setSearchingUsers(true)
    if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current)
    searchTimeoutRef.current = setTimeout(async () => {
      try {
        const response = await api.get(`/users/search?q=${encodeURIComponent(searchQuery.trim())}`)
        setSearchResults((response.data.users || []).filter((u: any) => u.userId !== currentUser?.id))
      } catch (error: any) {
        setSearchResults([])
      } finally {
        setSearchingUsers(false)
      }
    }, 300)
    return () => { if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current) }
  }, [searchQuery])

  const handleStartDM = async (targetUser: any) => {
    if (!currentUser?.id) return
    try {
      const response = await api.post('/messages/conversation/create', {
        type: 'dm',
        participantIds: [targetUser.userId],
      })
      setShowNewConversation(false)
      setSearchQuery('')
      setActiveMessageTab('private')
      await fetchConversations()
      setActiveConversation(response.data.conversation)
      await fetchMessages(response.data.conversation._id)
    } catch (error: any) {
      console.error('Error creating DM:', error)
    }
  }

  const handleCreateGroup = async () => {
    if (!currentUser?.id || !newGroupName.trim()) return
    try {
      const response = await api.post('/messages/group/create', {
        name: newGroupName.trim(),
        description: newGroupDescription.trim(),
        memberIds: selectedMembers.map(m => m.userId),
      })
      setShowNewGroup(false)
      setNewGroupName('')
      setNewGroupDescription('')
      setSelectedMembers([])
      setSearchQuery('')
      setActiveMessageTab('group')
      await fetchConversations()
      setActiveConversation(response.data.conversation)
      await fetchMessages(response.data.conversation._id)
    } catch (error: any) {
      console.error('Error creating group:', error)
    }
  }

  const handleOpenConversation = async (conversation: any) => {
    setActiveConversation(conversation)
    await fetchMessages(conversation._id)
  }

  useEffect(() => {
    if (!activeConversation?._id) return
    const interval = setInterval(() => fetchMessages(activeConversation._id), 5000)
    return () => clearInterval(interval)
  }, [activeConversation?._id])

  const formatTime = (dateStr: string) => {
    const d = new Date(dateStr)
    const now = new Date()
    const diff = now.getTime() - d.getTime()
    if (diff < 60000) return 'Just now'
    if (diff < 3600000) return `${Math.floor(diff / 60000)}m`
    if (diff < 86400000) return `${Math.floor(diff / 3600000)}h`
    if (diff < 604800000) return `${Math.floor(diff / 86400000)}d`
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
  }

  const getConversationName = (conv: any) => {
    if (conv.type === 'group') return conv.name || 'Unnamed Group'
    const other = conv.participants?.find((p: any) => p.userId !== currentUser?.id)
    return other?.username || 'Unknown User'
  }

  const getConversationAvatar = (conv: any) => {
    if (conv.type === 'group') return null
    const other = conv.participants?.find((p: any) => p.userId !== currentUser?.id)
    return other?.profileImage || null
  }

  const filteredConversations = conversationSearch.trim()
    ? conversations.filter(c => getConversationName(c).toLowerCase().includes(conversationSearch.toLowerCase()))
    : conversations

  if (!currentUser) {
    return (
      <div style={{ padding: spacing['5xl'], textAlign: 'center' }}>
        <MessageCircle size={48} color={currentTheme.textMuted} style={{ marginBottom: spacing.xl, opacity: 0.4 }} />
        <p style={{ color: currentTheme.textSecondary, fontSize: fontSize['3xl'] }}>Sign in to use messaging</p>
      </div>
    )
  }

  const containerHeight = embedded ? '600px' : '100%'

  const renderNewConversationModal = () => (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      style={sx(layout.center, {
        position: 'absolute',
        inset: 0,
        background: 'rgba(0, 0, 0, 0.6)',
        backdropFilter: 'blur(4px)',
        zIndex: 50,
        padding: spacing['2xl'],
      })}
      onClick={() => { setShowNewConversation(false); setSearchQuery(''); setSearchResults([]) }}
    >
      <motion.div
        initial={{ scale: 0.95, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0.95, opacity: 0 }}
        onClick={(e) => e.stopPropagation()}
        style={sx(layout.flexCol, {
          background: currentTheme.backgroundOverlay,
          border: `1px solid ${currentTheme.borderLight}`,
          borderRadius: radius['2xl'],
          width: '100%',
          maxWidth: '440px',
          maxHeight: '500px',
          overflow: 'hidden',
        })}
      >
        <div style={sx(layout.spaceBetween, {
          padding: spacing['2xl'],
          borderBottom: `1px solid ${currentTheme.borderLight}`,
        })}>
          <h3 style={{ color: currentTheme.text, fontSize: fontSize['3xl'], margin: 0 }}>New Message</h3>
          <button
            onClick={() => { setShowNewConversation(false); setSearchQuery(''); setSearchResults([]) }}
            style={sx(s.iconButton, { color: currentTheme.textSecondary })}
          >
            <X size={20} />
          </button>
        </div>

        <div style={{ padding: spacing.xl }}>
          <div style={sx(layout.flexRow, {
            gap: '10px',
            padding: '10px 14px',
            background: currentTheme.backgroundSecondary,
            border: `1px solid ${currentTheme.borderLight}`,
            borderRadius: radius.lg,
          })}>
            <Search size={18} color={currentTheme.textSecondary} />
            <input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search for a user..."
              autoFocus
              style={{
                flex: 1,
                background: 'transparent',
                border: 'none',
                outline: 'none',
                color: currentTheme.text,
                fontSize: fontSize.xl,
                fontFamily: 'inherit',
              }}
            />
          </div>
        </div>

        <div style={{ flex: 1, overflowY: 'auto', padding: `0 ${spacing.xl} ${spacing.xl}` }}>
          {searchingUsers ? (
            <p style={{ color: currentTheme.textSecondary, fontSize: fontSize.lg, textAlign: 'center', padding: spacing['2xl'] }}>Searching...</p>
          ) : searchQuery.trim() && searchResults.length === 0 ? (
            <p style={{ color: currentTheme.textMuted, fontSize: fontSize.lg, textAlign: 'center', padding: spacing['2xl'] }}>No users found</p>
          ) : searchResults.length > 0 ? (
            <div style={sx(layout.flexCol, { gap: spacing.xs })}>
              {searchResults.map((u) => (
                <button
                  key={u.userId}
                  onClick={() => handleStartDM(u)}
                  style={sx(layout.flexRow, {
                    gap: spacing.lg,
                    padding: spacing.lg,
                    background: 'transparent',
                    border: 'none',
                    borderRadius: radius.lg,
                    cursor: 'pointer',
                    width: '100%',
                    textAlign: 'left',
                    transition: 'background 0.15s',
                    color: currentTheme.text,
                  })}
                  onMouseEnter={(e) => { e.currentTarget.style.background = currentTheme.buttonBackgroundHover }}
                  onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent' }}
                >
                  <div style={sx(layout.center, {
                    width: spacing['5xl'], height: spacing['5xl'], borderRadius: radius.circle,
                    background: u.profileImage ? 'none' : currentTheme.accentGradient,
                    overflow: 'hidden', flexShrink: 0,
                  })}>
                    {u.profileImage ? (
                      <img src={u.profileImage} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                    ) : (
                      <User size={18} color="#fff" />
                    )}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p style={{ fontSize: fontSize.xl, fontWeight: fontWeight.semibold, margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {u.username}
                    </p>
                    {u.bio && (
                      <p style={{ color: currentTheme.textSecondary, fontSize: fontSize.md, margin: `${spacing['2xs']} 0 0 0`, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {u.bio}
                      </p>
                    )}
                  </div>
                </button>
              ))}
            </div>
          ) : (
            <div style={{ textAlign: 'center', padding: spacing['4xl'] }}>
              <Search size={32} color={currentTheme.textMuted} style={{ opacity: 0.3, marginBottom: '10px' }} />
              <p style={{ color: currentTheme.textMuted, fontSize: fontSize.lg, margin: 0 }}>Search for someone to message</p>
            </div>
          )}
        </div>
      </motion.div>
    </motion.div>
  )

  const renderNewGroupModal = () => (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      style={sx(layout.center, {
        position: 'absolute',
        inset: 0,
        background: 'rgba(0, 0, 0, 0.6)',
        backdropFilter: 'blur(4px)',
        zIndex: 50,
        padding: spacing['2xl'],
      })}
      onClick={() => { setShowNewGroup(false); setSearchQuery(''); setSelectedMembers([]); setNewGroupName(''); setNewGroupDescription('') }}
    >
      <motion.div
        initial={{ scale: 0.95, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0.95, opacity: 0 }}
        onClick={(e) => e.stopPropagation()}
        style={sx(layout.flexCol, {
          background: currentTheme.backgroundOverlay,
          border: `1px solid ${currentTheme.borderLight}`,
          borderRadius: radius['2xl'],
          width: '100%',
          maxWidth: '480px',
          maxHeight: '600px',
          overflow: 'hidden',
        })}
      >
        <div style={sx(layout.spaceBetween, {
          padding: spacing['2xl'],
          borderBottom: `1px solid ${currentTheme.borderLight}`,
        })}>
          <h3 style={{ color: currentTheme.text, fontSize: fontSize['3xl'], margin: 0 }}>Create Group</h3>
          <button
            onClick={() => { setShowNewGroup(false); setSearchQuery(''); setSelectedMembers([]); setNewGroupName(''); setNewGroupDescription('') }}
            style={sx(s.iconButton, { color: currentTheme.textSecondary })}
          >
            <X size={20} />
          </button>
        </div>

        <div style={sx(layout.flexCol, { flex: 1, overflowY: 'auto', padding: spacing.xl, gap: spacing.xl })}>
          <div>
            <label style={{ color: currentTheme.textSecondary, fontSize: fontSize.base, marginBottom: spacing.sm, display: 'block' }}>Group Name *</label>
            <input
              value={newGroupName}
              onChange={(e) => setNewGroupName(e.target.value)}
              placeholder="e.g. AI Enthusiasts"
              style={{
                width: '100%',
                padding: '10px 14px',
                background: currentTheme.backgroundSecondary,
                border: `1px solid ${currentTheme.borderLight}`,
                borderRadius: radius.lg,
                color: currentTheme.text,
                fontSize: fontSize.xl,
                fontFamily: 'inherit',
              }}
            />
          </div>

          <div>
            <label style={{ color: currentTheme.textSecondary, fontSize: fontSize.base, marginBottom: spacing.sm, display: 'block' }}>Description (optional)</label>
            <textarea
              value={newGroupDescription}
              onChange={(e) => setNewGroupDescription(e.target.value)}
              placeholder="What's this group about?"
              style={{
                width: '100%',
                minHeight: '60px',
                padding: '10px 14px',
                background: currentTheme.backgroundSecondary,
                border: `1px solid ${currentTheme.borderLight}`,
                borderRadius: radius.lg,
                color: currentTheme.text,
                fontSize: fontSize.lg,
                fontFamily: 'inherit',
                resize: 'vertical',
              }}
            />
          </div>

          {selectedMembers.length > 0 && (
            <div>
              <label style={{ color: currentTheme.textSecondary, fontSize: fontSize.base, marginBottom: spacing.md, display: 'block' }}>
                Members ({selectedMembers.length + 1})
              </label>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: spacing.sm }}>
                <span style={{
                  padding: `${spacing.xs} 10px`,
                  background: `${currentTheme.accent}20`,
                  border: `1px solid ${currentTheme.accent}40`,
                  borderRadius: radius['2xl'],
                  color: currentTheme.accent,
                  fontSize: fontSize.md,
                  fontWeight: fontWeight.medium,
                }}>
                  You (creator)
                </span>
                {selectedMembers.map((m) => (
                  <span
                    key={m.userId}
                    style={sx(layout.flexRow, {
                      padding: `${spacing.xs} 10px`,
                      background: currentTheme.backgroundSecondary,
                      border: `1px solid ${currentTheme.borderLight}`,
                      borderRadius: radius['2xl'],
                      color: currentTheme.text,
                      fontSize: fontSize.md,
                      gap: spacing.sm,
                    })}
                  >
                    {m.username}
                    <button
                      onClick={() => setSelectedMembers(prev => prev.filter(x => x.userId !== m.userId))}
                      style={{ background: 'none', border: 'none', cursor: 'pointer', color: currentTheme.textMuted, padding: '0', display: 'flex' }}
                    >
                      <X size={12} />
                    </button>
                  </span>
                ))}
              </div>
            </div>
          )}

          <div>
            <label style={{ color: currentTheme.textSecondary, fontSize: fontSize.base, marginBottom: spacing.sm, display: 'block' }}>Add Members</label>
            <div style={sx(layout.flexRow, {
              gap: '10px',
              padding: '10px 14px',
              background: currentTheme.backgroundSecondary,
              border: `1px solid ${currentTheme.borderLight}`,
              borderRadius: radius.lg,
            })}>
              <Search size={16} color={currentTheme.textSecondary} />
              <input
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search users to add..."
                style={{
                  flex: 1,
                  background: 'transparent',
                  border: 'none',
                  outline: 'none',
                  color: currentTheme.text,
                  fontSize: fontSize.lg,
                  fontFamily: 'inherit',
                }}
              />
            </div>
            {searchResults.length > 0 && (
              <div style={{ marginTop: spacing.md, maxHeight: '150px', overflowY: 'auto' }}>
                {searchResults.filter(u => !selectedMembers.some(m => m.userId === u.userId)).map((u) => (
                  <button
                    key={u.userId}
                    onClick={() => {
                      setSelectedMembers(prev => [...prev, u])
                      setSearchQuery('')
                      setSearchResults([])
                    }}
                    style={sx(layout.flexRow, {
                      gap: '10px',
                      padding: `${spacing.md} 10px`,
                      background: 'transparent',
                      border: 'none',
                      borderRadius: radius.md,
                      cursor: 'pointer',
                      width: '100%',
                      textAlign: 'left',
                      color: currentTheme.text,
                    })}
                    onMouseEnter={(e) => { e.currentTarget.style.background = currentTheme.buttonBackgroundHover }}
                    onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent' }}
                  >
                    <div style={sx(layout.center, {
                      width: '30px', height: '30px', borderRadius: radius.circle,
                      background: u.profileImage ? 'none' : currentTheme.accentGradient,
                      overflow: 'hidden', flexShrink: 0,
                    })}>
                      {u.profileImage ? (
                        <img src={u.profileImage} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                      ) : (
                        <User size={14} color="#fff" />
                      )}
                    </div>
                    <span style={{ fontSize: fontSize.lg, fontWeight: fontWeight.medium }}>{u.username}</span>
                    <UserPlus size={14} color={currentTheme.accent} style={{ marginLeft: 'auto' }} />
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        <div style={{
          padding: `${spacing.xl} ${spacing['2xl']}`,
          borderTop: `1px solid ${currentTheme.borderLight}`,
        }}>
          <button
            onClick={handleCreateGroup}
            disabled={!newGroupName.trim()}
            style={{
              width: '100%',
              padding: spacing.lg,
              background: newGroupName.trim() ? currentTheme.accentGradient : currentTheme.buttonBackground,
              border: 'none',
              borderRadius: radius.lg,
              color: newGroupName.trim() ? '#fff' : currentTheme.textMuted,
              fontSize: fontSize.xl,
              fontWeight: fontWeight.semibold,
              cursor: newGroupName.trim() ? 'pointer' : 'not-allowed',
              transition: 'opacity 0.2s',
            }}
          >
            Create Group
          </button>
        </div>
      </motion.div>
    </motion.div>
  )

  const renderConversationList = () => (
    <div style={sx(layout.flexCol, {
      width: embedded ? '100%' : '320px',
      minWidth: embedded ? undefined : '280px',
      borderRight: embedded ? 'none' : `1px solid ${currentTheme.borderLight}`,
      height: '100%',
    })}>
      {/* Private/Group toggle tabs */}
      <div style={{
        display: 'flex',
        borderBottom: `1px solid ${currentTheme.borderLight}`,
        flexShrink: 0,
      }}>
        <button
          onClick={() => { setActiveMessageTab('private'); setActiveConversation(null); setMessages([]) }}
          style={sx(layout.center, {
            flex: 1,
            padding: spacing.lg,
            background: activeMessageTab === 'private' ? currentTheme.buttonBackgroundActive : 'transparent',
            border: 'none',
            borderBottom: activeMessageTab === 'private' ? `2px solid ${currentTheme.accent}` : '2px solid transparent',
            color: activeMessageTab === 'private' ? currentTheme.accent : currentTheme.textSecondary,
            fontSize: fontSize.lg,
            fontWeight: activeMessageTab === 'private' ? fontWeight.semibold : fontWeight.normal,
            cursor: 'pointer',
            gap: spacing.sm,
            transition: transition.normal,
          })}
        >
          <MessageCircle size={16} />
          Private Messages
        </button>
        <button
          onClick={() => { setActiveMessageTab('group'); setActiveConversation(null); setMessages([]) }}
          style={sx(layout.center, {
            flex: 1,
            padding: spacing.lg,
            background: activeMessageTab === 'group' ? currentTheme.buttonBackgroundActive : 'transparent',
            border: 'none',
            borderBottom: activeMessageTab === 'group' ? `2px solid ${currentTheme.accent}` : '2px solid transparent',
            color: activeMessageTab === 'group' ? currentTheme.accent : currentTheme.textSecondary,
            fontSize: fontSize.lg,
            fontWeight: activeMessageTab === 'group' ? fontWeight.semibold : fontWeight.normal,
            cursor: 'pointer',
            gap: spacing.sm,
            transition: transition.normal,
          })}
        >
          <Users size={16} />
          Group Messages
        </button>
      </div>

      {/* Search + New button */}
      <div style={sx(layout.flexRow, { padding: spacing.lg, gap: spacing.md, flexShrink: 0 })}>
        <div style={sx(layout.flexRow, {
          flex: 1,
          gap: spacing.md,
          padding: `${spacing.md} ${spacing.lg}`,
          background: currentTheme.backgroundSecondary,
          border: `1px solid ${currentTheme.borderLight}`,
          borderRadius: radius.md,
        })}>
          <Search size={15} color={currentTheme.textMuted} />
          <input
            value={conversationSearch}
            onChange={(e) => setConversationSearch(e.target.value)}
            placeholder="Search chats..."
            style={{
              flex: 1,
              background: 'transparent',
              border: 'none',
              outline: 'none',
              color: currentTheme.text,
              fontSize: fontSize.base,
              fontFamily: 'inherit',
            }}
          />
        </div>
        <button
          onClick={() => activeMessageTab === 'private' ? setShowNewConversation(true) : setShowNewGroup(true)}
          style={sx(layout.flexRow, {
            padding: `${spacing.md} ${spacing.lg}`,
            background: currentTheme.accentGradient,
            border: 'none',
            borderRadius: radius.md,
            color: '#fff',
            cursor: 'pointer',
            gap: spacing.xs,
            fontSize: fontSize.md,
            fontWeight: fontWeight.semibold,
            flexShrink: 0,
          })}
        >
          <Plus size={16} />
          New
        </button>
      </div>

      {/* Conversation list */}
      <div style={{ flex: 1, overflowY: 'auto' }}>
        {loading ? (
          <div style={{ padding: spacing['4xl'], textAlign: 'center' }}>
            <p style={{ color: currentTheme.textSecondary, fontSize: fontSize.lg }}>Loading...</p>
          </div>
        ) : filteredConversations.length === 0 ? (
          <div style={{ padding: `${spacing['4xl']} ${spacing['2xl']}`, textAlign: 'center' }}>
            {activeMessageTab === 'private' ? (
              <MessageCircle size={36} color={currentTheme.textMuted} style={{ opacity: 0.3, marginBottom: '10px' }} />
            ) : (
              <Users size={36} color={currentTheme.textMuted} style={{ opacity: 0.3, marginBottom: '10px' }} />
            )}
            <p style={{ color: currentTheme.textMuted, fontSize: fontSize.lg, margin: `0 0 ${spacing.xs} 0` }}>
              {activeMessageTab === 'private' ? 'No conversations yet' : 'No groups yet'}
            </p>
            <p style={{ color: currentTheme.textMuted, fontSize: fontSize.md, margin: 0 }}>
              {activeMessageTab === 'private' ? 'Start a new message to get chatting!' : 'Create a group to start a community chat!'}
            </p>
          </div>
        ) : (
          filteredConversations.map((conv) => {
            const isActive = activeConversation?._id === conv._id
            const avatar = getConversationAvatar(conv)
            const name = getConversationName(conv)

            return (
              <button
                key={conv._id}
                onClick={() => handleOpenConversation(conv)}
                style={sx(layout.flexRow, {
                  gap: spacing.lg,
                  padding: `${spacing.lg} ${spacing.xl}`,
                  background: isActive ? currentTheme.buttonBackgroundActive : 'transparent',
                  border: 'none',
                  borderLeft: isActive ? `3px solid ${currentTheme.accent}` : '3px solid transparent',
                  cursor: 'pointer',
                  width: '100%',
                  textAlign: 'left',
                  transition: 'background 0.15s',
                  color: currentTheme.text,
                })}
                onMouseEnter={(e) => { if (!isActive) e.currentTarget.style.background = currentTheme.buttonBackgroundHover }}
                onMouseLeave={(e) => { if (!isActive) e.currentTarget.style.background = 'transparent' }}
              >
                <div style={sx(layout.center, {
                  width: '44px', height: '44px', borderRadius: radius.circle,
                  background: avatar ? 'none' : (conv.type === 'group' ? 'linear-gradient(135deg, #667eea, #764ba2)' : currentTheme.accentGradient),
                  overflow: 'hidden', flexShrink: 0,
                })}>
                  {avatar ? (
                    <img src={avatar} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                  ) : conv.type === 'group' ? (
                    <Hash size={20} color="#fff" />
                  ) : (
                    <User size={20} color="#fff" />
                  )}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={sx(layout.spaceBetween, { marginBottom: spacing['2xs'] })}>
                    <p style={{
                      fontSize: '0.92rem',
                      fontWeight: fontWeight.semibold,
                      margin: 0,
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                      color: isActive ? currentTheme.accent : currentTheme.text,
                    }}>
                      {name}
                    </p>
                    {conv.lastMessageAt && (
                      <span style={{ color: currentTheme.textMuted, fontSize: '0.72rem', flexShrink: 0, marginLeft: spacing.md }}>
                        {formatTime(conv.lastMessageAt)}
                      </span>
                    )}
                  </div>
                  {conv.lastMessage && (
                    <p style={{
                      color: currentTheme.textSecondary,
                      fontSize: fontSize.md,
                      margin: 0,
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                    }}>
                      {conv.lastMessage}
                    </p>
                  )}
                  {conv.type === 'group' && conv.participants && (
                    <p style={{ color: currentTheme.textMuted, fontSize: '0.72rem', margin: `${spacing['2xs']} 0 0 0` }}>
                      {conv.participants.length} member{conv.participants.length !== 1 ? 's' : ''}
                    </p>
                  )}
                </div>
              </button>
            )
          })
        )}
      </div>
    </div>
  )

  const renderChatArea = () => {
    if (!activeConversation) {
      return (
        <div style={sx(layout.flexCol, {
          flex: 1,
          alignItems: 'center',
          justifyContent: 'center',
          color: currentTheme.textMuted,
        })}>
          <MessageCircle size={56} style={{ opacity: 0.2, marginBottom: spacing.xl }} />
          <p style={{ fontSize: fontSize['3xl'], margin: `0 0 ${spacing.sm} 0` }}>Select a conversation</p>
          <p style={{ fontSize: fontSize.base, margin: 0 }}>Choose a chat or start a new one</p>
        </div>
      )
    }

    const isGroup = activeConversation.type === 'group'
    const chatName = getConversationName(activeConversation)
    const chatAvatar = getConversationAvatar(activeConversation)

    return (
      <div style={sx(layout.flexCol, { flex: 1, height: '100%' })}>
        {/* Chat header */}
        <div style={sx(layout.flexRow, {
          padding: `14px ${spacing['2xl']}`,
          borderBottom: `1px solid ${currentTheme.borderLight}`,
          gap: spacing.lg,
          flexShrink: 0,
        })}>
          {embedded && (
            <button
              onClick={() => { setActiveConversation(null); setMessages([]) }}
              style={sx(s.iconButton, { color: currentTheme.textSecondary })}
            >
              <ArrowLeft size={20} />
            </button>
          )}
          <div style={sx(layout.center, {
            width: '36px', height: '36px', borderRadius: radius.circle,
            background: chatAvatar ? 'none' : (isGroup ? 'linear-gradient(135deg, #667eea, #764ba2)' : currentTheme.accentGradient),
            overflow: 'hidden', flexShrink: 0,
          })}>
            {chatAvatar ? (
              <img src={chatAvatar} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
            ) : isGroup ? (
              <Hash size={18} color="#fff" />
            ) : (
              <User size={18} color="#fff" />
            )}
          </div>
          <div>
            <p style={{ color: currentTheme.text, fontSize: fontSize['2xl'], fontWeight: fontWeight.semibold, margin: 0 }}>{chatName}</p>
            {isGroup && activeConversation.participants && (
              <p style={{ color: currentTheme.textMuted, fontSize: '0.75rem', margin: 0 }}>
                {activeConversation.participants.length} members
                {activeConversation.description && ` · ${activeConversation.description}`}
              </p>
            )}
          </div>
        </div>

        {/* Messages */}
        <div style={sx(layout.flexCol, {
          flex: 1,
          overflowY: 'auto',
          padding: `${spacing.xl} ${spacing['2xl']}`,
          gap: spacing.xs,
        })}>
          {loadingMessages ? (
            <div style={{ textAlign: 'center', padding: spacing['5xl'] }}>
              <p style={{ color: currentTheme.textSecondary, fontSize: fontSize.lg }}>Loading messages...</p>
            </div>
          ) : messages.length === 0 ? (
            <div style={{ textAlign: 'center', padding: spacing['5xl'], marginTop: 'auto' }}>
              <MessageCircle size={40} color={currentTheme.textMuted} style={{ opacity: 0.2, marginBottom: '10px' }} />
              <p style={{ color: currentTheme.textMuted, fontSize: fontSize.lg, margin: 0 }}>
                No messages yet. Say hello!
              </p>
            </div>
          ) : (
            messages.map((msg, idx) => {
              const isMine = msg.senderId === currentUser?.id
              const showAvatar = !isMine && (idx === 0 || messages[idx - 1]?.senderId !== msg.senderId)
              const showName = isGroup && showAvatar

              return (
                <div key={msg._id} style={sx(layout.flexCol, {
                  alignItems: isMine ? 'flex-end' : 'flex-start',
                  marginTop: showAvatar ? spacing.md : spacing.px,
                })}>
                  {showName && (
                    <p
                      onClick={() => {
                        if (msg.senderId === currentUser?.id) {
                          clearViewingProfile()
                        } else {
                          setViewingProfile({ userId: msg.senderId, username: msg.senderUsername })
                        }
                        setActiveTab('statistics')
                      }}
                      style={{
                        color: currentTheme.accent,
                        fontSize: '0.72rem',
                        fontWeight: fontWeight.semibold,
                        margin: `0 0 ${spacing['2xs']} 44px`,
                        cursor: 'pointer',
                      }}
                    >
                      {msg.senderUsername}
                    </p>
                  )}
                  <div style={sx(layout.flexRow, {
                    alignItems: 'flex-end',
                    gap: spacing.md,
                    flexDirection: isMine ? 'row-reverse' : 'row',
                    maxWidth: '75%',
                  })}>
                    {!isMine && (
                      <div style={sx(layout.center, {
                        width: '30px', height: '30px', borderRadius: radius.circle,
                        background: msg.senderProfileImage ? 'none' : currentTheme.accentGradient,
                        overflow: 'hidden', flexShrink: 0,
                        visibility: showAvatar ? 'visible' : 'hidden',
                      })}>
                        {msg.senderProfileImage ? (
                          <img src={msg.senderProfileImage} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                        ) : (
                          <User size={14} color="#fff" />
                        )}
                      </div>
                    )}
                    <div style={{
                      padding: '10px 14px',
                      borderRadius: isMine ? `${radius['2xl']} ${radius['2xl']} ${radius.xs} ${radius['2xl']}` : `${radius['2xl']} ${radius['2xl']} ${radius['2xl']} ${radius.xs}`,
                      background: isMine
                        ? (theme === 'light' ? 'linear-gradient(135deg, #00b4b4, #009090)' : 'linear-gradient(135deg, #5dade2, #3498db)')
                        : currentTheme.backgroundSecondary,
                      border: isMine ? 'none' : `1px solid ${currentTheme.borderLight}`,
                      color: isMine ? '#fff' : currentTheme.text,
                      maxWidth: '100%',
                      opacity: msg.pending ? 0.7 : 1,
                    }}>
                      <p style={{
                        fontSize: fontSize.lg,
                        margin: 0,
                        lineHeight: '1.45',
                        whiteSpace: 'pre-wrap',
                        wordBreak: 'break-word',
                      }}>
                        {msg.text}
                      </p>
                      <p style={{
                        fontSize: fontSize['2xs'],
                        margin: `${spacing.xs} 0 0 0`,
                        opacity: 0.7,
                        textAlign: 'right',
                      }}>
                        {formatTime(msg.createdAt)}
                      </p>
                    </div>
                  </div>
                </div>
              )
            })
          )}
          <div ref={messagesEndRef} />
        </div>

        {/* Message input */}
        <div style={{
          padding: `${spacing.lg} ${spacing['2xl']}`,
          borderTop: `1px solid ${currentTheme.borderLight}`,
          flexShrink: 0,
        }}>
          <div style={{
            display: 'flex',
            alignItems: 'flex-end',
            gap: '10px',
            background: currentTheme.backgroundSecondary,
            border: `1px solid ${currentTheme.borderLight}`,
            borderRadius: radius.xl,
            padding: `${spacing.md} ${spacing.lg}`,
          }}>
            <textarea
              value={messageText}
              onChange={(e) => setMessageText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault()
                  handleSendMessage()
                }
              }}
              placeholder="Type a message..."
              rows={1}
              style={{
                flex: 1,
                background: 'transparent',
                border: 'none',
                outline: 'none',
                color: currentTheme.text,
                fontSize: fontSize.lg,
                fontFamily: 'inherit',
                resize: 'none',
                maxHeight: '100px',
                overflowY: 'auto',
                lineHeight: '1.4',
              }}
            />
            <button
              onClick={handleSendMessage}
              disabled={!messageText.trim()}
              style={sx(layout.center, {
                padding: spacing.md,
                background: messageText.trim() ? currentTheme.accentGradient : 'transparent',
                border: 'none',
                borderRadius: radius.md,
                color: messageText.trim() ? '#fff' : currentTheme.textMuted,
                cursor: messageText.trim() ? 'pointer' : 'not-allowed',
                flexShrink: 0,
                transition: transition.normal,
              })}
            >
              <Send size={18} />
            </button>
          </div>
        </div>
      </div>
    )
  }

  if (embedded && activeConversation) {
    return (
      <div style={sx(layout.flexCol, {
        height: containerHeight,
        position: 'relative',
        borderRadius: radius.xl,
        border: `1px solid ${currentTheme.borderLight}`,
        background: currentTheme.backgroundOverlay,
        overflow: 'hidden',
      })}>
        {renderChatArea()}
      </div>
    )
  }

  if (embedded) {
    return (
      <div style={sx(layout.flexCol, {
        height: containerHeight,
        position: 'relative',
        borderRadius: radius.xl,
        border: `1px solid ${currentTheme.borderLight}`,
        background: currentTheme.backgroundOverlay,
        overflow: 'hidden',
      })}>
        {renderConversationList()}
        <AnimatePresence>
          {showNewConversation && renderNewConversationModal()}
          {showNewGroup && renderNewGroupModal()}
        </AnimatePresence>
      </div>
    )
  }

  return (
    <div style={{
      height: containerHeight,
      display: 'flex',
      position: 'relative',
      borderRadius: radius['2xl'],
      border: `1px solid ${currentTheme.borderLight}`,
      background: currentTheme.backgroundOverlay,
      overflow: 'hidden',
    }}>
      {renderConversationList()}
      {renderChatArea()}
      <AnimatePresence>
        {showNewConversation && renderNewConversationModal()}
        {showNewGroup && renderNewGroupModal()}
      </AnimatePresence>
    </div>
  )
}

export default MessagingView
