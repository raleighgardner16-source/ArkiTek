/**
 * Browser-side WebSocket client for OpenClaw Gateway Protocol v3.
 *
 * Handles connection, handshake, message sending/receiving, streaming,
 * reconnection, and exposes connection status for React components.
 */

export type ConnectionStatus = 'disconnected' | 'connecting' | 'handshaking' | 'connected' | 'error'

export interface AgentMessage {
  id: string
  role: 'user' | 'assistant' | 'tool' | 'system'
  content: string
  toolName?: string
  toolInput?: string
  toolOutput?: string
  isStreaming?: boolean
  timestamp: Date
}

export interface OCClientEvent {
  type: 'status' | 'message' | 'token' | 'tool_start' | 'tool_result' | 'error' | 'done'
  data?: unknown
}

type EventHandler = (event: OCClientEvent) => void

interface OCProtocolMessage {
  type: 'req' | 'res' | 'evt'
  id?: string
  method?: string
  params?: Record<string, unknown>
  result?: Record<string, unknown>
  error?: { code: number; message: string }
  event?: string
  data?: Record<string, unknown>
}

let requestCounter = 0
function nextId(): string {
  return `arkitek-${Date.now()}-${++requestCounter}`
}

export class OpenClawClient {
  private ws: WebSocket | null = null
  private gatewayUrl: string
  private gatewayToken: string
  private status: ConnectionStatus = 'disconnected'
  private listeners: Set<EventHandler> = new Set()
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null
  private reconnectAttempts = 0
  private maxReconnectAttempts = 5
  private intentionalClose = false
  private currentStreamingMessageId: string | null = null

  constructor(gatewayUrl: string, gatewayToken: string) {
    this.gatewayUrl = gatewayUrl
    this.gatewayToken = gatewayToken
  }

  getStatus(): ConnectionStatus {
    return this.status
  }

  on(handler: EventHandler): () => void {
    this.listeners.add(handler)
    return () => this.listeners.delete(handler)
  }

  private emit(event: OCClientEvent) {
    for (const handler of this.listeners) {
      try {
        handler(event)
      } catch {
        // Listener errors should not break the client
      }
    }
  }

  private setStatus(status: ConnectionStatus) {
    this.status = status
    this.emit({ type: 'status', data: status })
  }

  connect() {
    if (this.ws && (this.ws.readyState === WebSocket.CONNECTING || this.ws.readyState === WebSocket.OPEN)) {
      return
    }

    this.intentionalClose = false
    this.setStatus('connecting')

    let wsUrl = this.gatewayUrl
    if (wsUrl.startsWith('http://')) wsUrl = wsUrl.replace('http://', 'ws://')
    if (wsUrl.startsWith('https://')) wsUrl = wsUrl.replace('https://', 'wss://')
    if (!wsUrl.endsWith('/ws') && !wsUrl.endsWith('/ws/')) {
      wsUrl = wsUrl.replace(/\/$/, '') + '/ws'
    }

    try {
      this.ws = new WebSocket(wsUrl)
    } catch {
      this.setStatus('error')
      this.emit({ type: 'error', data: 'Failed to create WebSocket connection' })
      this.scheduleReconnect()
      return
    }

    this.ws.onopen = () => {
      this.setStatus('handshaking')
      this.reconnectAttempts = 0
    }

    this.ws.onmessage = (event: MessageEvent) => {
      try {
        const msg: OCProtocolMessage = JSON.parse(event.data as string)
        this.handleMessage(msg)
      } catch {
        // Ignore unparseable messages
      }
    }

    this.ws.onerror = () => {
      this.setStatus('error')
      this.emit({ type: 'error', data: 'WebSocket connection error' })
    }

    this.ws.onclose = () => {
      const wasConnected = this.status === 'connected'
      this.setStatus('disconnected')
      if (!this.intentionalClose && wasConnected) {
        this.scheduleReconnect()
      }
    }
  }

  disconnect() {
    this.intentionalClose = true
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer)
      this.reconnectTimer = null
    }
    if (this.ws) {
      this.ws.close()
      this.ws = null
    }
    this.setStatus('disconnected')
  }

  private scheduleReconnect() {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      this.setStatus('error')
      this.emit({ type: 'error', data: 'Max reconnection attempts reached' })
      return
    }
    const delay = Math.min(1000 * Math.pow(2, this.reconnectAttempts), 30000)
    this.reconnectAttempts++
    this.reconnectTimer = setTimeout(() => this.connect(), delay)
  }

  private handleMessage(msg: OCProtocolMessage) {
    if (msg.event === 'connect.challenge') {
      this.sendHandshake(msg.data as Record<string, unknown>)
      return
    }

    if (msg.method === 'hello-ok' || msg.event === 'hello-ok' || (msg.type === 'res' && msg.result && !msg.error && this.status === 'handshaking')) {
      this.setStatus('connected')
      return
    }

    if (msg.error) {
      this.emit({ type: 'error', data: msg.error.message })
      return
    }

    if (msg.event === 'token' || msg.event === 'text_delta' || msg.event === 'content_block_delta') {
      const token = (msg.data?.token || msg.data?.text || msg.data?.delta || '') as string
      if (token) {
        this.emit({ type: 'token', data: token })
      }
      return
    }

    if (msg.event === 'tool_use' || msg.event === 'tool_start' || msg.event === 'tool_call') {
      this.emit({
        type: 'tool_start',
        data: {
          toolName: msg.data?.name || msg.data?.tool || 'unknown',
          toolInput: msg.data?.input || msg.data?.arguments || '',
        },
      })
      return
    }

    if (msg.event === 'tool_result' || msg.event === 'tool_output') {
      this.emit({
        type: 'tool_result',
        data: {
          toolName: msg.data?.name || msg.data?.tool || 'unknown',
          toolOutput: msg.data?.output || msg.data?.result || '',
        },
      })
      return
    }

    if (msg.event === 'done' || msg.event === 'message_stop' || msg.event === 'response.completed') {
      this.currentStreamingMessageId = null
      this.emit({ type: 'done', data: msg.data })
      return
    }

    if (msg.event === 'message' || msg.event === 'response') {
      this.emit({
        type: 'message',
        data: {
          content: msg.data?.text || msg.data?.content || '',
          role: msg.data?.role || 'assistant',
        },
      })
      return
    }
  }

  private sendHandshake(challengeData?: Record<string, unknown>) {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return

    const connectReq: OCProtocolMessage = {
      type: 'req',
      id: nextId(),
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
        auth: { token: this.gatewayToken },
        ...(challengeData?.nonce ? { nonce: challengeData.nonce } : {}),
      },
    }

    this.ws.send(JSON.stringify(connectReq))
  }

  sendMessage(text: string) {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN || this.status !== 'connected') {
      this.emit({ type: 'error', data: 'Not connected to gateway' })
      return
    }

    this.currentStreamingMessageId = nextId()

    const chatReq: OCProtocolMessage = {
      type: 'req',
      id: this.currentStreamingMessageId,
      method: 'chat',
      params: {
        text,
        stream: true,
      },
    }

    this.ws.send(JSON.stringify(chatReq))
  }

  updateUrl(gatewayUrl: string, gatewayToken: string) {
    this.disconnect()
    this.gatewayUrl = gatewayUrl
    this.gatewayToken = gatewayToken
    this.reconnectAttempts = 0
  }

  destroy() {
    this.disconnect()
    this.listeners.clear()
  }
}
