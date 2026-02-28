import { Router } from 'express'
import db from '../../database/db.js'

const router = Router()

// GET /api/messages/conversations/:userId
router.get('/conversations/:userId', async (req, res) => {
  try {
    const userId = req.userId
    const { type } = req.query

    const dbInstance = await db.getDb()
    const filter = { 'participants.userId': userId }
    if (type === 'dm' || type === 'group') filter.type = type

    const conversations = await dbInstance.collection('conversations')
      .find(filter)
      .sort({ lastMessageAt: -1 })
      .toArray()

    res.json({ conversations })
  } catch (error) {
    console.error('[Messages] Error fetching conversations:', error)
    res.status(500).json({ error: 'Failed to fetch conversations' })
  }
})

// GET /api/messages/conversation/:conversationId
router.get('/conversation/:conversationId', async (req, res) => {
  try {
    const { conversationId } = req.params
    const userId = req.userId
    if (!conversationId) return res.status(400).json({ error: 'conversationId is required' })

    const dbInstance = await db.getDb()
    const messages = await dbInstance.collection('messages')
      .find({ conversationId })
      .sort({ createdAt: 1 })
      .limit(200)
      .toArray()

    await dbInstance.collection('messages').updateMany(
      { conversationId, readBy: { $ne: userId } },
      { $addToSet: { readBy: userId } }
    )

    res.json({ messages })
  } catch (error) {
    console.error('[Messages] Error fetching messages:', error)
    res.status(500).json({ error: 'Failed to fetch messages' })
  }
})

// POST /api/messages/send
router.post('/send', async (req, res) => {
  try {
    const senderId = req.userId
    const { conversationId, text } = req.body
    if (!conversationId || !text?.trim()) {
      return res.status(400).json({ error: 'conversationId and text are required' })
    }

    const dbInstance = await db.getDb()

    const conv = await dbInstance.collection('conversations').findOne({ _id: conversationId })
    if (!conv) return res.status(404).json({ error: 'Conversation not found' })
    if (!conv.participants.some(p => p.userId === senderId)) {
      return res.status(403).json({ error: 'Not a participant' })
    }

    const sender = conv.participants.find(p => p.userId === senderId)
    const message = {
      _id: `msg_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      conversationId,
      senderId,
      senderUsername: sender?.username || 'Unknown',
      senderProfileImage: sender?.profileImage || null,
      text: text.trim(),
      createdAt: new Date().toISOString(),
      readBy: [senderId],
    }

    await dbInstance.collection('messages').insertOne(message)

    await dbInstance.collection('conversations').updateOne(
      { _id: conversationId },
      {
        $set: {
          lastMessage: text.trim().substring(0, 100),
          lastMessageAt: message.createdAt,
          lastMessageBy: senderId,
        },
      }
    )

    res.json({ success: true, message })
  } catch (error) {
    console.error('[Messages] Error sending message:', error)
    res.status(500).json({ error: 'Failed to send message' })
  }
})

// POST /api/messages/conversation/create
router.post('/conversation/create', async (req, res) => {
  try {
    const creatorId = req.userId
    const { type, participantIds } = req.body
    if (!participantIds?.length) {
      return res.status(400).json({ error: 'participantIds are required' })
    }

    const dbInstance = await db.getDb()

    if (type === 'dm' && participantIds.length === 1) {
      const allIds = [creatorId, participantIds[0]].sort()
      const existing = await dbInstance.collection('conversations').findOne({
        type: 'dm',
        'participants.userId': { $all: allIds },
        $expr: { $eq: [{ $size: '$participants' }, 2] },
      })
      if (existing) return res.json({ conversation: existing, existing: true })
    }

    const allUserIds = [creatorId, ...participantIds]
    const usersCol = dbInstance.collection('users')
    const participants = []
    for (const uid of allUserIds) {
      const user = await usersCol.findOne({ uniqueId: uid })
      participants.push({
        userId: uid,
        username: user?.username || 'Unknown',
        profileImage: user?.profileImage || null,
      })
    }

    const conversation = {
      _id: `conv_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      type: type || 'dm',
      name: null,
      description: null,
      participants,
      createdBy: creatorId,
      createdAt: new Date().toISOString(),
      lastMessage: null,
      lastMessageAt: new Date().toISOString(),
      lastMessageBy: null,
    }

    await dbInstance.collection('conversations').insertOne(conversation)
    res.json({ conversation })
  } catch (error) {
    console.error('[Messages] Error creating conversation:', error)
    res.status(500).json({ error: 'Failed to create conversation' })
  }
})

// POST /api/messages/group/create
router.post('/group/create', async (req, res) => {
  try {
    const creatorId = req.userId
    const { name, description, memberIds } = req.body
    if (!name?.trim()) {
      return res.status(400).json({ error: 'name is required' })
    }

    const dbInstance = await db.getDb()
    const allUserIds = [creatorId, ...(memberIds || [])]
    const usersCol = dbInstance.collection('users')
    const participants = []
    for (const uid of [...new Set(allUserIds)]) {
      const user = await usersCol.findOne({ uniqueId: uid })
      participants.push({
        userId: uid,
        username: user?.username || 'Unknown',
        profileImage: user?.profileImage || null,
      })
    }

    const conversation = {
      _id: `grp_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      type: 'group',
      name: name.trim(),
      description: description?.trim() || null,
      participants,
      createdBy: creatorId,
      createdAt: new Date().toISOString(),
      lastMessage: null,
      lastMessageAt: new Date().toISOString(),
      lastMessageBy: null,
    }

    await dbInstance.collection('conversations').insertOne(conversation)
    res.json({ conversation })
  } catch (error) {
    console.error('[Messages] Error creating group:', error)
    res.status(500).json({ error: 'Failed to create group' })
  }
})

// GET /api/messages/unread/:userId
router.get('/unread/:userId', async (req, res) => {
  try {
    const userId = req.userId

    const dbInstance = await db.getDb()
    const convos = await dbInstance.collection('conversations')
      .find({ 'participants.userId': userId })
      .project({ _id: 1 })
      .toArray()

    const convoIds = convos.map(c => c._id)
    if (convoIds.length === 0) return res.json({ unreadCount: 0 })

    const unreadCount = await dbInstance.collection('messages').countDocuments({
      conversationId: { $in: convoIds },
      senderId: { $ne: userId },
      readBy: { $ne: userId },
    })

    res.json({ unreadCount })
  } catch (error) {
    console.error('[Messages] Error getting unread count:', error)
    res.status(500).json({ error: 'Failed to get unread count' })
  }
})

export default router
