export interface GatewayTestResult {
  connected: boolean
  protocolVersion?: number
  model?: string
  skills?: string[]
  agentName?: string
}

interface OCMessage {
  type: 'req' | 'res' | 'evt'
  id?: string
  method?: string
  params?: Record<string, unknown>
  result?: Record<string, unknown>
  error?: { code: number; message: string }
  event?: string
  data?: Record<string, unknown>
}

function generateRequestId(): string {
  const bytes = new Uint8Array(8)
  crypto.getRandomValues(bytes)
  return Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('')
}

/**
 * Tests a gateway connection directly from the browser using the native
 * WebSocket API. This avoids Vercel serverless limitations with outbound
 * WebSocket connections.
 */
export function testGatewayConnection(
  gatewayUrl: string,
  gatewayToken: string,
  timeoutMs = 8000,
): Promise<GatewayTestResult> {
  return new Promise((resolve, reject) => {
    let wsUrl = gatewayUrl.trim()
    if (wsUrl.startsWith('http://')) wsUrl = wsUrl.replace('http://', 'ws://')
    else if (wsUrl.startsWith('https://')) wsUrl = wsUrl.replace('https://', 'wss://')
    else if (!wsUrl.startsWith('ws://') && !wsUrl.startsWith('wss://')) wsUrl = 'wss://' + wsUrl

    if (!wsUrl.endsWith('/ws') && !wsUrl.endsWith('/ws/')) {
      wsUrl = wsUrl.replace(/\/$/, '') + '/ws'
    }

    let ws: WebSocket
    try {
      ws = new WebSocket(wsUrl)
    } catch (err: any) {
      reject(new Error(`Invalid gateway URL: ${err.message}`))
      return
    }

    let handshakeComplete = false

    const timeout = setTimeout(() => {
      ws.close()
      reject(new Error('Connection timed out after ' + (timeoutMs / 1000) + ' seconds'))
    }, timeoutMs)

    ws.onerror = () => {
      clearTimeout(timeout)
      if (!handshakeComplete) {
        reject(new Error('Could not reach the gateway. Check that your tunnel and agent are running.'))
      }
    }

    ws.onclose = () => {
      clearTimeout(timeout)
      if (!handshakeComplete) {
        reject(new Error('Connection closed before handshake completed'))
      }
    }

    ws.onmessage = (event: MessageEvent) => {
      try {
        const msg: OCMessage = JSON.parse(typeof event.data === 'string' ? event.data : '')

        if (msg.event === 'connect.challenge') {
          const connectReq: OCMessage = {
            type: 'req',
            id: generateRequestId(),
            method: 'connect',
            params: {
              minProtocol: 3,
              maxProtocol: 3,
              client: {
                id: 'gateway-client',
                version: '1.0.0',
                platform: 'web',
                mode: 'backend',
              },
              role: 'operator',
              scopes: ['operator.read', 'operator.write'],
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
            const info: GatewayTestResult = {
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
        }
      } catch {
        // ignore unparseable messages
      }
    }
  })
}
