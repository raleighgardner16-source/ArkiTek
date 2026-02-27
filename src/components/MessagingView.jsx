import React, { useEffect, useState, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Send, Search, Users, User, Plus, ArrowLeft, X, Hash, MessageCircle, UserPlus } from 'lucide-react'
import { useStore } from '../store/useStore'
import { getTheme } from '../utils/theme'
import axios from 'axios'
import { API_URL } from '../utils/config'

const MessagingView = ({ embedded = false }) => {
  const currentUser = useStore((state) => state.currentUser)
  const theme = useStore((state) => state.theme || 'dark')
  const currentTheme = getTheme(theme)
  const setViewingProfile = useStore((state) => state.setViewingProfile)
  const clearViewingProfile = useStore((state) => state.clearViewingProfile)
  const setActiveTab = useStore((state) => state.setActiveTab)
  const setUnreadMessageCount = useStore((state) => state.setUnreadMessageCount)

  const [activeMessageTab, setActiveMessageTab] = useState('private')
  const [conversations, setConversations] = useState([])
  const [activeConversation, setActiveConversation] = useState(null)
  const [messages, setMessages] = useState([])
  const [messageText, setMessageText] = useState('')
  const [loading, setLoading] = useState(true)
  const [loadingMessages, setLoadingMessages] = useState(false)
  const [showNewConversation, setShowNewConversation] = useState(false)
  const [showNewGroup, setShowNewGroup] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [searchResults, setSearchResults] = useState([])
  const [searchingUsers, setSearchingUsers] = useState(false)
  const [newGroupName, setNewGroupName] = useState('')
  const [newGroupDescription, setNewGroupDescription] = useState('')
  const [selectedMembers, setSelectedMembers] = useState([])
  const [conversationSearch, setConversationSearch] = useState('')
  const messagesEndRef = useRef(null)
  const searchTimeoutRef = useRef(null)
  const pollIntervalRef = useRef(null)

  useEffect(() => {
    if (!currentUser?.id) return
    fetchConversations()
    pollIntervalRef.current = setInterval(fetchConversations, 10000)
    return () => clearInterval(pollIntervalRef.current)
  }, [currentUser?.id, activeMessageTab])

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  const fetchConversations = async () => {
    if (!currentUser?.id) return
    try {
      const type = activeMessageTab === 'private' ? 'dm' : 'group'
      const response = await axios.get(`${API_URL}/api/messages/conversations/${currentUser.id}?type=${type}`)
      setConversations(response.data.conversations || [])
    } catch (error) {
      console.error('Error fetching conversations:', error)
    } finally {
      setLoading(false)
    }
  }

  const fetchMessages = async (conversationId) => {
    if (!currentUser?.id) return
    setLoadingMessages(true)
    try {
      const response = await axios.get(`${API_URL}/api/messages/conversation/${conversationId}?userId=${currentUser.id}`)
      setMessages(response.data.messages || [])
    } catch (error) {
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
      await axios.post(`${API_URL}/api/messages/send`, {
        conversationId: activeConversation._id,
        senderId: currentUser.id,
        text,
      })
      await fetchMessages(activeConversation._id)
      fetchConversations()
    } catch (error) {
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
        const response = await axios.get(`${API_URL}/api/users/search?q=${encodeURIComponent(searchQuery.trim())}`)
        setSearchResults((response.data.users || []).filter(u => u.userId !== currentUser?.id))
      } catch (error) {
        setSearchResults([])
      } finally {
        setSearchingUsers(false)
      }
    }, 300)
    return () => { if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current) }
  }, [searchQuery])

  const handleStartDM = async (targetUser) => {
    if (!currentUser?.id) return
    try {
      const response = await axios.post(`${API_URL}/api/messages/conversation/create`, {
        type: 'dm',
        creatorId: currentUser.id,
        participantIds: [targetUser.userId],
      })
      setShowNewConversation(false)
      setSearchQuery('')
      setActiveMessageTab('private')
      await fetchConversations()
      setActiveConversation(response.data.conversation)
      await fetchMessages(response.data.conversation._id)
    } catch (error) {
      console.error('Error creating DM:', error)
    }
  }

  const handleCreateGroup = async () => {
    if (!currentUser?.id || !newGroupName.trim()) return
    try {
      const response = await axios.post(`${API_URL}/api/messages/group/create`, {
        creatorId: currentUser.id,
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
    } catch (error) {
      console.error('Error creating group:', error)
    }
  }

  const handleOpenConversation = async (conversation) => {
    setActiveConversation(conversation)
    await fetchMessages(conversation._id)
  }

  useEffect(() => {
    if (!activeConversation?._id) return
    const interval = setInterval(() => fetchMessages(activeConversation._id), 5000)
    return () => clearInterval(interval)
  }, [activeConversation?._id])

  const formatTime = (dateStr) => {
    const d = new Date(dateStr)
    const now = new Date()
    const diff = now - d
    if (diff < 60000) return 'Just now'
    if (diff < 3600000) return `${Math.floor(diff / 60000)}m`
    if (diff < 86400000) return `${Math.floor(diff / 3600000)}h`
    if (diff < 604800000) return `${Math.floor(diff / 86400000)}d`
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
  }

  const getConversationName = (conv) => {
    if (conv.type === 'group') return conv.name || 'Unnamed Group'
    const other = conv.participants?.find(p => p.userId !== currentUser?.id)
    return other?.username || 'Unknown User'
  }

  const getConversationAvatar = (conv) => {
    if (conv.type === 'group') return null
    const other = conv.participants?.find(p => p.userId !== currentUser?.id)
    return other?.profileImage || null
  }

  const filteredConversations = conversationSearch.trim()
    ? conversations.filter(c => getConversationName(c).toLowerCase().includes(conversationSearch.toLowerCase()))
    : conversations

  if (!currentUser) {
    return (
      <div style={{ padding: '40px', textAlign: 'center' }}>
        <MessageCircle size={48} color={currentTheme.textMuted} style={{ marginBottom: '16px', opacity: 0.4 }} />
        <p style={{ color: currentTheme.textSecondary, fontSize: '1.1rem' }}>Sign in to use messaging</p>
      </div>
    )
  }

  const containerHeight = embedded ? '600px' : '100%'

  const renderNewConversationModal = () => (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      style={{
        position: 'absolute',
        inset: 0,
        background: 'rgba(0, 0, 0, 0.6)',
        backdropFilter: 'blur(4px)',
        zIndex: 50,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '20px',
      }}
      onClick={() => { setShowNewConversation(false); setSearchQuery(''); setSearchResults([]) }}
    >
      <motion.div
        initial={{ scale: 0.95, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0.95, opacity: 0 }}
        onClick={(e) => e.stopPropagation()}
        style={{
          background: currentTheme.backgroundOverlay,
          border: `1px solid ${currentTheme.borderLight}`,
          borderRadius: '16px',
          width: '100%',
          maxWidth: '440px',
          maxHeight: '500px',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
        }}
      >
        <div style={{
          padding: '20px',
          borderBottom: `1px solid ${currentTheme.borderLight}`,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}>
          <h3 style={{ color: currentTheme.text, fontSize: '1.1rem', margin: 0 }}>New Message</h3>
          <button
            onClick={() => { setShowNewConversation(false); setSearchQuery(''); setSearchResults([]) }}
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: currentTheme.textSecondary, padding: '4px', display: 'flex' }}
          >
            <X size={20} />
          </button>
        </div>

        <div style={{ padding: '16px' }}>
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: '10px',
            padding: '10px 14px',
            background: currentTheme.backgroundSecondary,
            border: `1px solid ${currentTheme.borderLight}`,
            borderRadius: '10px',
          }}>
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
                fontSize: '0.95rem',
                fontFamily: 'inherit',
              }}
            />
          </div>
        </div>

        <div style={{ flex: 1, overflowY: 'auto', padding: '0 16px 16px' }}>
          {searchingUsers ? (
            <p style={{ color: currentTheme.textSecondary, fontSize: '0.9rem', textAlign: 'center', padding: '20px' }}>Searching...</p>
          ) : searchQuery.trim() && searchResults.length === 0 ? (
            <p style={{ color: currentTheme.textMuted, fontSize: '0.9rem', textAlign: 'center', padding: '20px' }}>No users found</p>
          ) : searchResults.length > 0 ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
              {searchResults.map((u) => (
                <button
                  key={u.userId}
                  onClick={() => handleStartDM(u)}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '12px',
                    padding: '12px',
                    background: 'transparent',
                    border: 'none',
                    borderRadius: '10px',
                    cursor: 'pointer',
                    width: '100%',
                    textAlign: 'left',
                    transition: 'background 0.15s',
                    color: currentTheme.text,
                  }}
                  onMouseEnter={(e) => { e.currentTarget.style.background = currentTheme.buttonBackgroundHover }}
                  onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent' }}
                >
                  <div style={{
                    width: '40px', height: '40px', borderRadius: '50%',
                    background: u.profileImage ? 'none' : currentTheme.accentGradient,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    overflow: 'hidden', flexShrink: 0,
                  }}>
                    {u.profileImage ? (
                      <img src={u.profileImage} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                    ) : (
                      <User size={18} color="#fff" />
                    )}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p style={{ fontSize: '0.95rem', fontWeight: '600', margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {u.username}
                    </p>
                    {u.bio && (
                      <p style={{ color: currentTheme.textSecondary, fontSize: '0.8rem', margin: '2px 0 0 0', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {u.bio}
                      </p>
                    )}
                  </div>
                </button>
              ))}
            </div>
          ) : (
            <div style={{ textAlign: 'center', padding: '30px' }}>
              <Search size={32} color={currentTheme.textMuted} style={{ opacity: 0.3, marginBottom: '10px' }} />
              <p style={{ color: currentTheme.textMuted, fontSize: '0.9rem', margin: 0 }}>Search for someone to message</p>
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
      style={{
        position: 'absolute',
        inset: 0,
        background: 'rgba(0, 0, 0, 0.6)',
        backdropFilter: 'blur(4px)',
        zIndex: 50,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '20px',
      }}
      onClick={() => { setShowNewGroup(false); setSearchQuery(''); setSelectedMembers([]); setNewGroupName(''); setNewGroupDescription('') }}
    >
      <motion.div
        initial={{ scale: 0.95, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0.95, opacity: 0 }}
        onClick={(e) => e.stopPropagation()}
        style={{
          background: currentTheme.backgroundOverlay,
          border: `1px solid ${currentTheme.borderLight}`,
          borderRadius: '16px',
          width: '100%',
          maxWidth: '480px',
          maxHeight: '600px',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
        }}
      >
        <div style={{
          padding: '20px',
          borderBottom: `1px solid ${currentTheme.borderLight}`,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}>
          <h3 style={{ color: currentTheme.text, fontSize: '1.1rem', margin: 0 }}>Create Group</h3>
          <button
            onClick={() => { setShowNewGroup(false); setSearchQuery(''); setSelectedMembers([]); setNewGroupName(''); setNewGroupDescription('') }}
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: currentTheme.textSecondary, padding: '4px', display: 'flex' }}
          >
            <X size={20} />
          </button>
        </div>

        <div style={{ flex: 1, overflowY: 'auto', padding: '16px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <div>
            <label style={{ color: currentTheme.textSecondary, fontSize: '0.85rem', marginBottom: '6px', display: 'block' }}>Group Name *</label>
            <input
              value={newGroupName}
              onChange={(e) => setNewGroupName(e.target.value)}
              placeholder="e.g. AI Enthusiasts"
              style={{
                width: '100%',
                padding: '10px 14px',
                background: currentTheme.backgroundSecondary,
                border: `1px solid ${currentTheme.borderLight}`,
                borderRadius: '10px',
                color: currentTheme.text,
                fontSize: '0.95rem',
                fontFamily: 'inherit',
              }}
            />
          </div>

          <div>
            <label style={{ color: currentTheme.textSecondary, fontSize: '0.85rem', marginBottom: '6px', display: 'block' }}>Description (optional)</label>
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
                borderRadius: '10px',
                color: currentTheme.text,
                fontSize: '0.9rem',
                fontFamily: 'inherit',
                resize: 'vertical',
              }}
            />
          </div>

          {selectedMembers.length > 0 && (
            <div>
              <label style={{ color: currentTheme.textSecondary, fontSize: '0.85rem', marginBottom: '8px', display: 'block' }}>
                Members ({selectedMembers.length + 1})
              </label>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                <span style={{
                  padding: '4px 10px',
                  background: `${currentTheme.accent}20`,
                  border: `1px solid ${currentTheme.accent}40`,
                  borderRadius: '16px',
                  color: currentTheme.accent,
                  fontSize: '0.8rem',
                  fontWeight: '500',
                }}>
                  You (creator)
                </span>
                {selectedMembers.map((m) => (
                  <span
                    key={m.userId}
                    style={{
                      padding: '4px 10px',
                      background: currentTheme.backgroundSecondary,
                      border: `1px solid ${currentTheme.borderLight}`,
                      borderRadius: '16px',
                      color: currentTheme.text,
                      fontSize: '0.8rem',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '6px',
                    }}
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
            <label style={{ color: currentTheme.textSecondary, fontSize: '0.85rem', marginBottom: '6px', display: 'block' }}>Add Members</label>
            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: '10px',
              padding: '10px 14px',
              background: currentTheme.backgroundSecondary,
              border: `1px solid ${currentTheme.borderLight}`,
              borderRadius: '10px',
            }}>
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
                  fontSize: '0.9rem',
                  fontFamily: 'inherit',
                }}
              />
            </div>
            {searchResults.length > 0 && (
              <div style={{ marginTop: '8px', maxHeight: '150px', overflowY: 'auto' }}>
                {searchResults.filter(u => !selectedMembers.some(m => m.userId === u.userId)).map((u) => (
                  <button
                    key={u.userId}
                    onClick={() => {
                      setSelectedMembers(prev => [...prev, u])
                      setSearchQuery('')
                      setSearchResults([])
                    }}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '10px',
                      padding: '8px 10px',
                      background: 'transparent',
                      border: 'none',
                      borderRadius: '8px',
                      cursor: 'pointer',
                      width: '100%',
                      textAlign: 'left',
                      color: currentTheme.text,
                    }}
                    onMouseEnter={(e) => { e.currentTarget.style.background = currentTheme.buttonBackgroundHover }}
                    onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent' }}
                  >
                    <div style={{
                      width: '30px', height: '30px', borderRadius: '50%',
                      background: u.profileImage ? 'none' : currentTheme.accentGradient,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      overflow: 'hidden', flexShrink: 0,
                    }}>
                      {u.profileImage ? (
                        <img src={u.profileImage} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                      ) : (
                        <User size={14} color="#fff" />
                      )}
                    </div>
                    <span style={{ fontSize: '0.9rem', fontWeight: '500' }}>{u.username}</span>
                    <UserPlus size={14} color={currentTheme.accent} style={{ marginLeft: 'auto' }} />
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        <div style={{
          padding: '16px 20px',
          borderTop: `1px solid ${currentTheme.borderLight}`,
        }}>
          <button
            onClick={handleCreateGroup}
            disabled={!newGroupName.trim()}
            style={{
              width: '100%',
              padding: '12px',
              background: newGroupName.trim() ? currentTheme.accentGradient : currentTheme.buttonBackground,
              border: 'none',
              borderRadius: '10px',
              color: newGroupName.trim() ? '#fff' : currentTheme.textMuted,
              fontSize: '0.95rem',
              fontWeight: '600',
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
    <div style={{
      width: embedded ? '100%' : '320px',
      minWidth: embedded ? undefined : '280px',
      borderRight: embedded ? 'none' : `1px solid ${currentTheme.borderLight}`,
      display: 'flex',
      flexDirection: 'column',
      height: '100%',
    }}>
      {/* Private/Group toggle tabs */}
      <div style={{
        display: 'flex',
        borderBottom: `1px solid ${currentTheme.borderLight}`,
        flexShrink: 0,
      }}>
        <button
          onClick={() => { setActiveMessageTab('private'); setActiveConversation(null); setMessages([]) }}
          style={{
            flex: 1,
            padding: '12px',
            background: activeMessageTab === 'private' ? currentTheme.buttonBackgroundActive : 'transparent',
            border: 'none',
            borderBottom: activeMessageTab === 'private' ? `2px solid ${currentTheme.accent}` : '2px solid transparent',
            color: activeMessageTab === 'private' ? currentTheme.accent : currentTheme.textSecondary,
            fontSize: '0.9rem',
            fontWeight: activeMessageTab === 'private' ? '600' : '400',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '6px',
            transition: 'all 0.2s ease',
          }}
        >
          <MessageCircle size={16} />
          Private Messages
        </button>
        <button
          onClick={() => { setActiveMessageTab('group'); setActiveConversation(null); setMessages([]) }}
          style={{
            flex: 1,
            padding: '12px',
            background: activeMessageTab === 'group' ? currentTheme.buttonBackgroundActive : 'transparent',
            border: 'none',
            borderBottom: activeMessageTab === 'group' ? `2px solid ${currentTheme.accent}` : '2px solid transparent',
            color: activeMessageTab === 'group' ? currentTheme.accent : currentTheme.textSecondary,
            fontSize: '0.9rem',
            fontWeight: activeMessageTab === 'group' ? '600' : '400',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '6px',
            transition: 'all 0.2s ease',
          }}
        >
          <Users size={16} />
          Group Messages
        </button>
      </div>

      {/* Search + New button */}
      <div style={{ padding: '12px', display: 'flex', gap: '8px', flexShrink: 0 }}>
        <div style={{
          flex: 1,
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          padding: '8px 12px',
          background: currentTheme.backgroundSecondary,
          border: `1px solid ${currentTheme.borderLight}`,
          borderRadius: '8px',
        }}>
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
              fontSize: '0.85rem',
              fontFamily: 'inherit',
            }}
          />
        </div>
        <button
          onClick={() => activeMessageTab === 'private' ? setShowNewConversation(true) : setShowNewGroup(true)}
          style={{
            padding: '8px 12px',
            background: currentTheme.accentGradient,
            border: 'none',
            borderRadius: '8px',
            color: '#fff',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: '4px',
            fontSize: '0.8rem',
            fontWeight: '600',
            flexShrink: 0,
          }}
        >
          <Plus size={16} />
          New
        </button>
      </div>

      {/* Conversation list */}
      <div style={{ flex: 1, overflowY: 'auto' }}>
        {loading ? (
          <div style={{ padding: '30px', textAlign: 'center' }}>
            <p style={{ color: currentTheme.textSecondary, fontSize: '0.9rem' }}>Loading...</p>
          </div>
        ) : filteredConversations.length === 0 ? (
          <div style={{ padding: '30px 20px', textAlign: 'center' }}>
            {activeMessageTab === 'private' ? (
              <MessageCircle size={36} color={currentTheme.textMuted} style={{ opacity: 0.3, marginBottom: '10px' }} />
            ) : (
              <Users size={36} color={currentTheme.textMuted} style={{ opacity: 0.3, marginBottom: '10px' }} />
            )}
            <p style={{ color: currentTheme.textMuted, fontSize: '0.9rem', margin: '0 0 4px 0' }}>
              {activeMessageTab === 'private' ? 'No conversations yet' : 'No groups yet'}
            </p>
            <p style={{ color: currentTheme.textMuted, fontSize: '0.8rem', margin: 0 }}>
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
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '12px',
                  padding: '12px 16px',
                  background: isActive ? currentTheme.buttonBackgroundActive : 'transparent',
                  border: 'none',
                  borderLeft: isActive ? `3px solid ${currentTheme.accent}` : '3px solid transparent',
                  cursor: 'pointer',
                  width: '100%',
                  textAlign: 'left',
                  transition: 'background 0.15s',
                  color: currentTheme.text,
                }}
                onMouseEnter={(e) => { if (!isActive) e.currentTarget.style.background = currentTheme.buttonBackgroundHover }}
                onMouseLeave={(e) => { if (!isActive) e.currentTarget.style.background = 'transparent' }}
              >
                <div style={{
                  width: '44px', height: '44px', borderRadius: '50%',
                  background: avatar ? 'none' : (conv.type === 'group' ? 'linear-gradient(135deg, #667eea, #764ba2)' : currentTheme.accentGradient),
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  overflow: 'hidden', flexShrink: 0,
                }}>
                  {avatar ? (
                    <img src={avatar} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                  ) : conv.type === 'group' ? (
                    <Hash size={20} color="#fff" />
                  ) : (
                    <User size={20} color="#fff" />
                  )}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2px' }}>
                    <p style={{
                      fontSize: '0.92rem',
                      fontWeight: '600',
                      margin: 0,
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                      color: isActive ? currentTheme.accent : currentTheme.text,
                    }}>
                      {name}
                    </p>
                    {conv.lastMessageAt && (
                      <span style={{ color: currentTheme.textMuted, fontSize: '0.72rem', flexShrink: 0, marginLeft: '8px' }}>
                        {formatTime(conv.lastMessageAt)}
                      </span>
                    )}
                  </div>
                  {conv.lastMessage && (
                    <p style={{
                      color: currentTheme.textSecondary,
                      fontSize: '0.8rem',
                      margin: 0,
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                    }}>
                      {conv.lastMessage}
                    </p>
                  )}
                  {conv.type === 'group' && conv.participants && (
                    <p style={{ color: currentTheme.textMuted, fontSize: '0.72rem', margin: '2px 0 0 0' }}>
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
        <div style={{
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          color: currentTheme.textMuted,
        }}>
          <MessageCircle size={56} style={{ opacity: 0.2, marginBottom: '16px' }} />
          <p style={{ fontSize: '1.1rem', margin: '0 0 6px 0' }}>Select a conversation</p>
          <p style={{ fontSize: '0.85rem', margin: 0 }}>Choose a chat or start a new one</p>
        </div>
      )
    }

    const isGroup = activeConversation.type === 'group'
    const chatName = getConversationName(activeConversation)
    const chatAvatar = getConversationAvatar(activeConversation)

    return (
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', height: '100%' }}>
        {/* Chat header */}
        <div style={{
          padding: '14px 20px',
          borderBottom: `1px solid ${currentTheme.borderLight}`,
          display: 'flex',
          alignItems: 'center',
          gap: '12px',
          flexShrink: 0,
        }}>
          {embedded && (
            <button
              onClick={() => { setActiveConversation(null); setMessages([]) }}
              style={{
                background: 'none', border: 'none', cursor: 'pointer',
                color: currentTheme.textSecondary, padding: '4px', display: 'flex',
              }}
            >
              <ArrowLeft size={20} />
            </button>
          )}
          <div style={{
            width: '36px', height: '36px', borderRadius: '50%',
            background: chatAvatar ? 'none' : (isGroup ? 'linear-gradient(135deg, #667eea, #764ba2)' : currentTheme.accentGradient),
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            overflow: 'hidden', flexShrink: 0,
          }}>
            {chatAvatar ? (
              <img src={chatAvatar} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
            ) : isGroup ? (
              <Hash size={18} color="#fff" />
            ) : (
              <User size={18} color="#fff" />
            )}
          </div>
          <div>
            <p style={{ color: currentTheme.text, fontSize: '1rem', fontWeight: '600', margin: 0 }}>{chatName}</p>
            {isGroup && activeConversation.participants && (
              <p style={{ color: currentTheme.textMuted, fontSize: '0.75rem', margin: 0 }}>
                {activeConversation.participants.length} members
                {activeConversation.description && ` · ${activeConversation.description}`}
              </p>
            )}
          </div>
        </div>

        {/* Messages */}
        <div style={{
          flex: 1,
          overflowY: 'auto',
          padding: '16px 20px',
          display: 'flex',
          flexDirection: 'column',
          gap: '4px',
        }}>
          {loadingMessages ? (
            <div style={{ textAlign: 'center', padding: '40px' }}>
              <p style={{ color: currentTheme.textSecondary, fontSize: '0.9rem' }}>Loading messages...</p>
            </div>
          ) : messages.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '40px', marginTop: 'auto' }}>
              <MessageCircle size={40} color={currentTheme.textMuted} style={{ opacity: 0.2, marginBottom: '10px' }} />
              <p style={{ color: currentTheme.textMuted, fontSize: '0.9rem', margin: 0 }}>
                No messages yet. Say hello!
              </p>
            </div>
          ) : (
            messages.map((msg, idx) => {
              const isMine = msg.senderId === currentUser?.id
              const showAvatar = !isMine && (idx === 0 || messages[idx - 1]?.senderId !== msg.senderId)
              const showName = isGroup && showAvatar

              return (
                <div key={msg._id} style={{
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: isMine ? 'flex-end' : 'flex-start',
                  marginTop: showAvatar ? '8px' : '1px',
                }}>
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
                        fontWeight: '600',
                        margin: '0 0 2px 44px',
                        cursor: 'pointer',
                      }}
                    >
                      {msg.senderUsername}
                    </p>
                  )}
                  <div style={{
                    display: 'flex',
                    alignItems: 'flex-end',
                    gap: '8px',
                    flexDirection: isMine ? 'row-reverse' : 'row',
                    maxWidth: '75%',
                  }}>
                    {!isMine && (
                      <div style={{
                        width: '30px', height: '30px', borderRadius: '50%',
                        background: msg.senderProfileImage ? 'none' : currentTheme.accentGradient,
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        overflow: 'hidden', flexShrink: 0,
                        visibility: showAvatar ? 'visible' : 'hidden',
                      }}>
                        {msg.senderProfileImage ? (
                          <img src={msg.senderProfileImage} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                        ) : (
                          <User size={14} color="#fff" />
                        )}
                      </div>
                    )}
                    <div style={{
                      padding: '10px 14px',
                      borderRadius: isMine ? '16px 16px 4px 16px' : '16px 16px 16px 4px',
                      background: isMine
                        ? (theme === 'light' ? 'linear-gradient(135deg, #00b4b4, #009090)' : 'linear-gradient(135deg, #5dade2, #3498db)')
                        : currentTheme.backgroundSecondary,
                      border: isMine ? 'none' : `1px solid ${currentTheme.borderLight}`,
                      color: isMine ? '#fff' : currentTheme.text,
                      maxWidth: '100%',
                      opacity: msg.pending ? 0.7 : 1,
                    }}>
                      <p style={{
                        fontSize: '0.9rem',
                        margin: 0,
                        lineHeight: '1.45',
                        whiteSpace: 'pre-wrap',
                        wordBreak: 'break-word',
                      }}>
                        {msg.text}
                      </p>
                      <p style={{
                        fontSize: '0.65rem',
                        margin: '4px 0 0 0',
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
          padding: '12px 20px',
          borderTop: `1px solid ${currentTheme.borderLight}`,
          flexShrink: 0,
        }}>
          <div style={{
            display: 'flex',
            alignItems: 'flex-end',
            gap: '10px',
            background: currentTheme.backgroundSecondary,
            border: `1px solid ${currentTheme.borderLight}`,
            borderRadius: '12px',
            padding: '8px 12px',
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
                fontSize: '0.9rem',
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
              style={{
                padding: '8px',
                background: messageText.trim() ? currentTheme.accentGradient : 'transparent',
                border: 'none',
                borderRadius: '8px',
                color: messageText.trim() ? '#fff' : currentTheme.textMuted,
                cursor: messageText.trim() ? 'pointer' : 'not-allowed',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0,
                transition: 'all 0.2s',
              }}
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
      <div style={{
        height: containerHeight,
        display: 'flex',
        flexDirection: 'column',
        position: 'relative',
        borderRadius: '12px',
        border: `1px solid ${currentTheme.borderLight}`,
        background: currentTheme.backgroundOverlay,
        overflow: 'hidden',
      }}>
        {renderChatArea()}
      </div>
    )
  }

  if (embedded) {
    return (
      <div style={{
        height: containerHeight,
        display: 'flex',
        flexDirection: 'column',
        position: 'relative',
        borderRadius: '12px',
        border: `1px solid ${currentTheme.borderLight}`,
        background: currentTheme.backgroundOverlay,
        overflow: 'hidden',
      }}>
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
      borderRadius: '16px',
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
