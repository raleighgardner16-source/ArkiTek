import { Router, type Request, type Response } from 'express'
import crypto from 'crypto'
import db from '../../database/db.js'
import { sendSuccess, sendError } from '../types/api.js'
import { encryptToken, decryptToken, testGatewayConnection } from '../services/openclawProtocol.js'
import type { AgentDoc } from '../../database/types.js'
import { createLogger } from '../config/logger.js'
import { getAgentLimits, MAX_AGENTS_ABSOLUTE } from '../helpers/pricing.js'

const log = createLogger('agents')
const router = Router()

router.get('/', async (req: Request, res: Response) => {
  try {
    const userId = req.userId
    if (!userId) return sendError(res, 'Authentication required', 401)

    const [agents, user] = await Promise.all([
      db.agents.getByUserId(userId),
      db.users.get(userId),
    ])

    const safeAgents = agents.map(a => ({
      _id: a._id,
      userId: a.userId,
      name: a.name,
      gatewayUrl: a.gatewayUrl,
      status: a.status,
      currentModel: a.currentModel,
      currentProvider: a.currentProvider,
      createdAt: a.createdAt,
      updatedAt: a.updatedAt,
      lastConnectedAt: a.lastConnectedAt,
    }))

    const limits = getAgentLimits(user as any, agents.length)

    sendSuccess(res, { agents: safeAgents, limits })
  } catch (error: any) {
    log.error({ err: error }, 'Error listing agents')
    sendError(res, 'Failed to list agents')
  }
})

router.get('/limits', async (req: Request, res: Response) => {
  try {
    const userId = req.userId
    if (!userId) return sendError(res, 'Authentication required', 401)

    const [count, user] = await Promise.all([
      db.agents.countForUser(userId),
      db.users.get(userId),
    ])

    const limits = getAgentLimits(user as any, count)
    sendSuccess(res, { limits })
  } catch (error: any) {
    log.error({ err: error }, 'Error fetching agent limits')
    sendError(res, 'Failed to fetch agent limits')
  }
})

router.post('/', async (req: Request, res: Response) => {
  try {
    const userId = req.userId
    if (!userId) return sendError(res, 'Authentication required', 401)

    const { name, gatewayUrl, gatewayToken } = req.body
    if (!name || !gatewayUrl || !gatewayToken) {
      return sendError(res, 'name, gatewayUrl, and gatewayToken are required', 400)
    }

    if (typeof name !== 'string' || name.length > 100) {
      return sendError(res, 'Agent name must be a string under 100 characters', 400)
    }
    if (typeof gatewayUrl !== 'string' || gatewayUrl.length > 500) {
      return sendError(res, 'Gateway URL must be a string under 500 characters', 400)
    }
    if (typeof gatewayToken !== 'string' || gatewayToken.length > 500) {
      return sendError(res, 'Gateway token must be a string under 500 characters', 400)
    }

    const [count, user] = await Promise.all([
      db.agents.countForUser(userId),
      db.users.get(userId),
    ])
    if (count >= MAX_AGENTS_ABSOLUTE) {
      return sendError(res, `Maximum of ${MAX_AGENTS_ABSOLUTE} agents allowed`, 400)
    }

    const limits = getAgentLimits(user as any, count)
    const requiresPayment = !limits.canAddFree

    const doc: AgentDoc = {
      _id: crypto.randomUUID(),
      userId,
      name: name.trim(),
      gatewayUrl: gatewayUrl.trim(),
      gatewayToken: encryptToken(gatewayToken),
      status: 'active',
      currentModel: null,
      currentProvider: null,
      createdAt: new Date(),
      updatedAt: new Date(),
      lastConnectedAt: null,
    }

    await db.agents.create(doc)

    log.info({ userId, agentId: doc._id, name: doc.name, requiresPayment }, 'Agent created')

    const updatedLimits = getAgentLimits(user as any, count + 1)

    sendSuccess(res, {
      agent: {
        _id: doc._id,
        userId: doc.userId,
        name: doc.name,
        gatewayUrl: doc.gatewayUrl,
        status: doc.status,
        currentModel: doc.currentModel,
        currentProvider: doc.currentProvider,
        createdAt: doc.createdAt,
        updatedAt: doc.updatedAt,
        lastConnectedAt: doc.lastConnectedAt,
      },
      requiresPayment,
      limits: updatedLimits,
    })
  } catch (error: any) {
    log.error({ err: error }, 'Error creating agent')
    sendError(res, 'Failed to create agent')
  }
})

router.patch('/:id', async (req: Request, res: Response) => {
  try {
    const userId = req.userId
    if (!userId) return sendError(res, 'Authentication required', 401)

    const id = req.params.id as string
    const { name, gatewayUrl, gatewayToken, currentModel, currentProvider, status } = req.body

    const updates: Partial<AgentDoc> = {}
    if (name !== undefined) updates.name = String(name).trim().slice(0, 100)
    if (gatewayUrl !== undefined) updates.gatewayUrl = String(gatewayUrl).trim().slice(0, 500)
    if (gatewayToken !== undefined) updates.gatewayToken = encryptToken(String(gatewayToken))
    if (currentModel !== undefined) updates.currentModel = currentModel
    if (currentProvider !== undefined) updates.currentProvider = currentProvider
    if (status !== undefined && ['active', 'offline', 'error'].includes(status)) {
      updates.status = status
    }

    if (Object.keys(updates).length === 0) {
      return sendError(res, 'No valid fields to update', 400)
    }

    const updated = await db.agents.update(id, userId, updates)
    if (!updated) {
      return sendError(res, 'Agent not found', 404)
    }

    sendSuccess(res, { updated: true })
  } catch (error: any) {
    log.error({ err: error }, 'Error updating agent')
    sendError(res, 'Failed to update agent')
  }
})

router.delete('/:id', async (req: Request, res: Response) => {
  try {
    const userId = req.userId
    if (!userId) return sendError(res, 'Authentication required', 401)

    const id = req.params.id as string
    const deleted = await db.agents.delete(id, userId)
    if (!deleted) {
      return sendError(res, 'Agent not found', 404)
    }

    const [count, user] = await Promise.all([
      db.agents.countForUser(userId),
      db.users.get(userId),
    ])
    const limits = getAgentLimits(user as any, count)

    log.info({ userId, agentId: id }, 'Agent deleted')
    sendSuccess(res, { deleted: true, limits })
  } catch (error: any) {
    log.error({ err: error }, 'Error deleting agent')
    sendError(res, 'Failed to delete agent')
  }
})

router.post('/:id/test', async (req: Request, res: Response) => {
  try {
    const userId = req.userId
    if (!userId) return sendError(res, 'Authentication required', 401)

    const id = req.params.id as string

    let gatewayUrl: string
    let gatewayToken: string

    if (id === 'new') {
      gatewayUrl = req.body.gatewayUrl
      gatewayToken = req.body.gatewayToken
      if (!gatewayUrl || !gatewayToken) {
        return sendError(res, 'gatewayUrl and gatewayToken are required', 400)
      }
    } else {
      const agent = await db.agents.getByIdAndUser(id, userId)
      if (!agent) return sendError(res, 'Agent not found', 404)
      gatewayUrl = agent.gatewayUrl
      gatewayToken = decryptToken(agent.gatewayToken)
    }

    const info = await testGatewayConnection(gatewayUrl, gatewayToken)

    if (id !== 'new') {
      const updates: Partial<AgentDoc> = { lastConnectedAt: new Date(), status: 'active' }
      if (info.model) updates.currentModel = info.model
      await db.agents.update(id, userId, updates)
    }

    sendSuccess(res, { gateway: info })
  } catch (error: any) {
    log.warn({ err: error }, 'Gateway connection test failed')
    sendError(res, error.message || 'Failed to connect to gateway', 502)
  }
})

router.get('/:id/token', async (req: Request, res: Response) => {
  try {
    const userId = req.userId
    if (!userId) return sendError(res, 'Authentication required', 401)

    const id = req.params.id as string
    const agent = await db.agents.getByIdAndUser(id, userId)
    if (!agent) return sendError(res, 'Agent not found', 404)

    const token = decryptToken(agent.gatewayToken)

    sendSuccess(res, { gatewayToken: token })
  } catch (error: any) {
    log.error({ err: error }, 'Error retrieving agent token')
    sendError(res, 'Failed to retrieve agent token')
  }
})

export default router
