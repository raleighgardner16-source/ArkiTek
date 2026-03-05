import crypto from 'crypto'
import { WebSocket } from 'ws'
import env from '../config/env.js'
import { createLogger } from '../config/logger.js'

const log = createLogger('openclaw')

// ============================================================================
// Token encryption (AES-256-GCM for storing gateway tokens in MongoDB)
// ============================================================================

const ENCRYPTION_KEY_SOURCE = env.JWT_SECRET
const ALGORITHM = 'aes-256-gcm'

function deriveKey(): Buffer {
  return crypto.scryptSync(ENCRYPTION_KEY_SOURCE, 'openclaw-agent-tokens', 32)
}

export function encryptToken(plaintext: string): string {
  const key = deriveKey()
  const iv = crypto.randomBytes(16)
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv)
  let encrypted = cipher.update(plaintext, 'utf8', 'hex')
  encrypted += cipher.final('hex')
  const tag = cipher.getAuthTag().toString('hex')
  return `${iv.toString('hex')}:${tag}:${encrypted}`
}

export function decryptToken(ciphertext: string): string {
  const key = deriveKey()
  const [ivHex, tagHex, encrypted] = ciphertext.split(':')
  if (!ivHex || !tagHex || !encrypted) throw new Error('Invalid encrypted token format')
  const iv = Buffer.from(ivHex, 'hex')
  const tag = Buffer.from(tagHex, 'hex')
  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv)
  decipher.setAuthTag(tag)
  let decrypted = decipher.update(encrypted, 'hex', 'utf8')
  decrypted += decipher.final('utf8')
  return decrypted
}

// ============================================================================
// OpenClaw Gateway Protocol v3 types
// ============================================================================

export interface OCMessage {
  type: 'req' | 'res' | 'evt'
  id?: string
  method?: string
  params?: Record<string, unknown>
  result?: Record<string, unknown>
  error?: { code: number; message: string }
  event?: string
  data?: Record<string, unknown>
}

export interface GatewayInfo {
  connected: boolean
  protocolVersion?: number
  model?: string
  skills?: string[]
  agentName?: string
}

// ============================================================================
// Gateway test connection
// ============================================================================

function generateRequestId(): string {
  return crypto.randomBytes(8).toString('hex')
}

/**
 * Performs a quick v3 handshake + status query against an OpenClaw gateway,
 * then disconnects. Returns gateway info on success or throws on failure.
 * Timeout: 8 seconds.
 */
export async function testGatewayConnection(
  gatewayUrl: string,
  gatewayToken: string,
): Promise<GatewayInfo> {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      ws.close()
      reject(new Error('Connection timed out after 8 seconds'))
    }, 8000)

    let wsUrl = gatewayUrl
    if (wsUrl.startsWith('http://')) wsUrl = wsUrl.replace('http://', 'ws://')
    if (wsUrl.startsWith('https://')) wsUrl = wsUrl.replace('https://', 'wss://')
    if (!wsUrl.endsWith('/ws') && !wsUrl.endsWith('/ws/')) {
      wsUrl = wsUrl.replace(/\/$/, '') + '/ws'
    }

    const ws = new WebSocket(wsUrl)
    let handshakeComplete = false

    ws.on('error', (err: Error) => {
      clearTimeout(timeout)
      reject(new Error(`WebSocket error: ${err.message}`))
    })

    ws.on('close', () => {
      clearTimeout(timeout)
      if (!handshakeComplete) {
        reject(new Error('Connection closed before handshake completed'))
      }
    })

    ws.on('message', (raw: Buffer | string) => {
      try {
        const msg: OCMessage = JSON.parse(raw.toString())

        if (msg.event === 'connect.challenge') {
          const connectReq: OCMessage = {
            type: 'req',
            id: generateRequestId(),
            method: 'connect',
            params: {
              minProtocol: 3,
              maxProtocol: 3,
              client: {
                id: 'arkitek',
                version: '1.0.0',
                platform: 'web',
                mode: 'operator',
              },
              role: 'operator',
              scopes: ['operator.read'],
              auth: { token: gatewayToken },
              nonce: (msg.data as Record<string, unknown>)?.nonce,
            },
          }
          ws.send(JSON.stringify(connectReq))
          return
        }

        if (msg.method === 'hello-ok' || msg.event === 'hello-ok' || (msg.type === 'res' && !msg.error)) {
          if (!handshakeComplete) {
            handshakeComplete = true
            const info: GatewayInfo = {
              connected: true,
              protocolVersion: (msg.result?.protocol as number) || (msg.data?.protocol as number) || 3,
            }

            if (msg.result?.model || msg.data?.model) {
              info.model = (msg.result?.model || msg.data?.model) as string
            }
            if (msg.result?.skills || msg.data?.skills) {
              info.skills = (msg.result?.skills || msg.data?.skills) as string[]
            }
            if (msg.result?.agentName || msg.data?.agentName) {
              info.agentName = (msg.result?.agentName || msg.data?.agentName) as string
            }

            clearTimeout(timeout)
            ws.close()
            resolve(info)
          }
          return
        }

        if (msg.error) {
          clearTimeout(timeout)
          ws.close()
          reject(new Error(`Gateway error: ${msg.error.message}`))
          return
        }
      } catch (parseErr) {
        log.warn({ err: parseErr }, 'Failed to parse gateway message')
      }
    })
  })
}
