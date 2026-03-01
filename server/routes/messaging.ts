import { Router, type Request, type Response } from 'express'
import db from '../../database/db.js'
import { createLogger } from '../config/logger.js'
import { sendSuccess, sendError } from '../types/api.js'
import type { ConversationDoc, MessageDoc, ConversationParticipant } from '../../database/types.js'

const log = createLogger('messaging')
const router = Router()

// GET /api/messages/conversations/:userId
router.get('/conversations/:userId', async (req: Request, res: Response) => {
  try {
    const userId = req.userId
    const { type } = req.query

    const conversations = await db.conversations.listForUser(userId!, type as 'dm' | 'group' | undefined)

    sendSuccess(res, { conversations })
  } catch (error: any) {
    log.error({ err: error }, 'Error fetching conversations')
    sendError(res, 'Failed to fetch conversations')
  }
})

// GET /api/messages/conversation/:conversationId
router.get('/conversation/:conversationId', async (req: Request, res: Response) => {
  try {
    const conversationId = req.params.conversationId as string
    const userId = req.userId
    if (!conversationId) return sendError(res, 'conversationId is required', 400)

    const messages = await db.messages.listForConversation(conversationId, 200)

    await db.messages.markRead(conversationId, userId!)

    sendSuccess(res, { messages })
  } catch (error: any) {
    log.error({ err: error }, 'Error fetching messages')
    sendError(res, 'Failed to fetch messages')
  }
})

// POST /api/messages/send
router.post('/send', async (req: Request, res: Response) => {
  try {
    const senderId = req.userId
    const { conversationId, text } = req.body
    if (!conversationId || !text?.trim()) {
      return sendError(res, 'conversationId and text are required', 400)
    }

    const conv = await db.conversations.getById(conversationId)
    if (!conv) return sendError(res, 'Conversation not found', 404)
    if (!conv.participants.some((p: ConversationParticipant) => p.userId === senderId)) {
      return sendError(res, 'Not a participant', 403)
    }

    const sender = conv.participants.find((p: ConversationParticipant) => p.userId === senderId)
    const message: MessageDoc = {
      _id: `msg_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      conversationId,
      senderId: senderId!,
      senderUsername: sender?.username || 'Unknown',
      senderProfileImage: sender?.profileImage || null,
      text: text.trim(),
      createdAt: new Date().toISOString(),
      readBy: [senderId!],
    }

    await db.messages.create(message)

    await db.conversations.updateLastMessage(conversationId, {
      lastMessage: text.trim().substring(0, 100),
      lastMessageAt: message.createdAt,
      lastMessageBy: senderId!,
    })

    sendSuccess(res, { message })
  } catch (error: any) {
    log.error({ err: error }, 'Error sending message')
    sendError(res, 'Failed to send message')
  }
})

// POST /api/messages/conversation/create
router.post('/conversation/create', async (req: Request, res: Response) => {
  try {
    const creatorId = req.userId
    const { type, participantIds } = req.body
    if (!participantIds?.length) {
      return sendError(res, 'participantIds are required', 400)
    }

    if (type === 'dm' && participantIds.length === 1) {
      const existing = await db.conversations.findDm(creatorId!, participantIds[0])
      if (existing) return sendSuccess(res, { conversation: existing, existing: true })
    }

    const allUserIds = [creatorId, ...participantIds]
    const participants: ConversationParticipant[] = []
    for (const uid of allUserIds) {
      const user = await db.users.get(uid!)
      participants.push({
        userId: uid!,
        username: user?.username || 'Unknown',
        profileImage: user?.profileImage || null,
      })
    }

    const conversation: ConversationDoc = {
      _id: `conv_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      type: type || 'dm',
      name: null,
      description: null,
      participants,
      createdBy: creatorId!,
      createdAt: new Date().toISOString(),
      lastMessage: null,
      lastMessageAt: new Date().toISOString(),
      lastMessageBy: null,
    }

    await db.conversations.create(conversation)
    sendSuccess(res, { conversation })
  } catch (error: any) {
    log.error({ err: error }, 'Error creating conversation')
    sendError(res, 'Failed to create conversation')
  }
})

// POST /api/messages/group/create
router.post('/group/create', async (req: Request, res: Response) => {
  try {
    const creatorId = req.userId
    const { name, description, memberIds } = req.body
    if (!name?.trim()) {
      return sendError(res, 'name is required', 400)
    }

    const allUserIds = [creatorId, ...(memberIds || [])]
    const participants: ConversationParticipant[] = []
    for (const uid of [...new Set(allUserIds)]) {
      const user = await db.users.get(uid!)
      participants.push({
        userId: uid!,
        username: user?.username || 'Unknown',
        profileImage: user?.profileImage || null,
      })
    }

    const conversation: ConversationDoc = {
      _id: `grp_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      type: 'group' as const,
      name: name.trim(),
      description: description?.trim() || null,
      participants,
      createdBy: creatorId!,
      createdAt: new Date().toISOString(),
      lastMessage: null,
      lastMessageAt: new Date().toISOString(),
      lastMessageBy: null,
    }

    await db.conversations.create(conversation)
    sendSuccess(res, { conversation })
  } catch (error: any) {
    log.error({ err: error }, 'Error creating group')
    sendError(res, 'Failed to create group')
  }
})

// GET /api/messages/unread/:userId
router.get('/unread/:userId', async (req: Request, res: Response) => {
  try {
    const userId = req.userId

    const convos = await db.conversations.listForUser(userId!)
    const convoIds = convos.map((c: ConversationDoc) => c._id)
    if (convoIds.length === 0) return sendSuccess(res, { unreadCount: 0 })

    const unreadCount = await db.messages.countUnread(userId!, convoIds)

    sendSuccess(res, { unreadCount })
  } catch (error: any) {
    log.error({ err: error }, 'Error getting unread count')
    sendError(res, 'Failed to get unread count')
  }
})

export default router
