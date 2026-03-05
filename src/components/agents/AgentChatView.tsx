import React, { useEffect, useRef, useState, useCallback } from 'react'
import { Send, Settings, RotateCw, Wrench, ChevronDown, ChevronUp } from 'lucide-react'
import { motion } from 'framer-motion'
import { useStore } from '../../store/useStore'
import { getTheme } from '../../utils/theme'
import { spacing, fontSize, fontWeight, radius } from '../../utils/styles'
import { OpenClawClient, type OCClientEvent } from '../../services/openclawClient'
import { getClient, setClient } from '../../services/agentClientCache'
import MarkdownRenderer from '../MarkdownRenderer'
import api from '../../utils/api'

interface AgentChatViewProps {
  agent: {
    _id: string
    name: string
    gatewayUrl: string
    currentModel: string | null
    currentProvider: string | null
    status: string
  }
}

const AgentChatView: React.FC<AgentChatViewProps> = ({ agent }) => {
  const theme = useStore((state) => state.theme || 'dark')
  const currentTheme = getTheme(theme)

  const agentMessages = useStore((state) => state.agentMessages[agent._id] || [])
  const addAgentMessage = useStore((state) => state.addAgentMessage)
  const appendToLastAgentMessage = useStore((state) => state.appendToLastAgentMessage)
  const finishAgentStreaming = useStore((state) => state.finishAgentStreaming)
  const agentConnectionStatus = useStore((state) => state.agentConnectionStatus[agent._id] || 'disconnected')
  const setAgentConnectionStatus = useStore((state) => state.setAgentConnectionStatus)
  const setAgentSettingsOpen = useStore((state) => state.setAgentSettingsOpen)

  const [input, setInput] = useState('')
  const [isAgentTyping, setIsAgentTyping] = useState(false)
  const [expandedTools, setExpandedTools] = useState<Set<string>>(new Set())
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const clientRef = useRef<OpenClawClient | null>(null)

  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [])

  useEffect(() => {
    scrollToBottom()
  }, [agentMessages, scrollToBottom])

  useEffect(() => {
    let client = getClient(agent._id)
    let unsubscribe: (() => void) | null = null

    const fetchTokenAndConnect = async () => {
      try {
        const res = await api.get(`/agents/${agent._id}/token`)
        const gatewayToken = res.data?.data?.gatewayToken
        if (!gatewayToken) return

        if (client) {
          client.updateUrl(agent.gatewayUrl, gatewayToken)
        } else {
          client = new OpenClawClient(agent.gatewayUrl, gatewayToken)
          setClient(agent._id, client)
        }

        clientRef.current = client

        unsubscribe = client.on((event: OCClientEvent) => {
          switch (event.type) {
            case 'status':
              setAgentConnectionStatus(agent._id, event.data as string)
              break
            case 'token':
              appendToLastAgentMessage(agent._id, event.data as string)
              break
            case 'tool_start': {
              const toolData = event.data as { toolName: string; toolInput: string }
              addAgentMessage(agent._id, {
                id: `tool-${Date.now()}`,
                role: 'tool',
                content: `Using ${toolData.toolName}...`,
                toolName: toolData.toolName,
                toolInput: typeof toolData.toolInput === 'string' ? toolData.toolInput : JSON.stringify(toolData.toolInput, null, 2),
                timestamp: new Date().toISOString(),
              })
              break
            }
            case 'tool_result': {
              const resultData = event.data as { toolName: string; toolOutput: string }
              const msgs = useStore.getState().agentMessages[agent._id] || []
              const lastTool = [...msgs].reverse().find(m => m.role === 'tool' && m.toolName === resultData.toolName)
              if (lastTool) {
                const updatedMsgs = msgs.map(m =>
                  m.id === lastTool.id
                    ? { ...m, content: `Completed ${resultData.toolName}`, toolOutput: typeof resultData.toolOutput === 'string' ? resultData.toolOutput : JSON.stringify(resultData.toolOutput, null, 2) }
                    : m
                )
                useStore.setState(state => ({
                  agentMessages: { ...state.agentMessages, [agent._id]: updatedMsgs },
                }))
              }
              break
            }
            case 'done':
              finishAgentStreaming(agent._id)
              setIsAgentTyping(false)
              break
            case 'error':
              setIsAgentTyping(false)
              break
          }
        })

        client.connect()
      } catch {
        setAgentConnectionStatus(agent._id, 'error')
      }
    }

    fetchTokenAndConnect()

    return () => {
      if (unsubscribe) unsubscribe()
    }
  }, [agent._id, agent.gatewayUrl])

  const handleSend = () => {
    const text = input.trim()
    if (!text || isAgentTyping) return

    addAgentMessage(agent._id, {
      id: `user-${Date.now()}`,
      role: 'user',
      content: text,
      timestamp: new Date().toISOString(),
    })

    addAgentMessage(agent._id, {
      id: `assistant-${Date.now()}`,
      role: 'assistant',
      content: '',
      isStreaming: true,
      timestamp: new Date().toISOString(),
    })

    setIsAgentTyping(true)
    setInput('')

    if (clientRef.current) {
      clientRef.current.sendMessage(text)
    }

    if (inputRef.current) {
      inputRef.current.style.height = 'auto'
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  const handleReconnect = () => {
    clientRef.current?.disconnect()
    clientRef.current?.connect()
  }

  const toggleToolExpanded = (msgId: string) => {
    setExpandedTools(prev => {
      const next = new Set(prev)
      if (next.has(msgId)) next.delete(msgId)
      else next.add(msgId)
      return next
    })
  }

  const isConnected = agentConnectionStatus === 'connected'
  const isConnecting = agentConnectionStatus === 'connecting' || agentConnectionStatus === 'handshaking'

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', background: currentTheme.background }}>
      {/* Header */}
      <div style={{
        padding: `${spacing.md} ${spacing.lg}`,
        borderBottom: `1px solid ${currentTheme.border}`,
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        background: currentTheme.background,
        flexShrink: 0,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: spacing.md }}>
          <h3 style={{
            margin: 0, fontSize: fontSize.md, fontWeight: fontWeight.semibold,
            color: currentTheme.text,
          }}>
            {agent.name}
          </h3>

          <div style={{
            display: 'flex', alignItems: 'center', gap: 6,
            padding: `2px ${spacing.sm}`, borderRadius: radius.full,
            background: currentTheme.backgroundOverlay,
            border: `1px solid ${currentTheme.border}`,
          }}>
            <div style={{
              width: 6, height: 6, borderRadius: '50%',
              background: isConnected ? '#22c55e' : isConnecting ? '#f59e0b' : '#ef4444',
            }} />
            <span style={{ fontSize: fontSize.xs, color: currentTheme.textMuted }}>
              {isConnected ? 'Connected' : isConnecting ? 'Connecting...' : 'Offline'}
            </span>
          </div>

          {agent.currentModel && (
            <div style={{
              padding: `2px ${spacing.sm}`, borderRadius: radius.full,
              background: currentTheme.backgroundOverlay,
              border: `1px solid ${currentTheme.border}`,
              fontSize: fontSize.xs, color: currentTheme.textMuted,
            }}>
              {agent.currentModel}
            </div>
          )}
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: spacing.sm }}>
          {!isConnected && !isConnecting && (
            <motion.button
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              onClick={handleReconnect}
              style={{
                width: 32, height: 32, borderRadius: radius.md,
                background: currentTheme.backgroundOverlay,
                border: `1px solid ${currentTheme.border}`,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                cursor: 'pointer', color: currentTheme.textMuted,
              }}
              title="Reconnect"
            >
              <RotateCw size={14} />
            </motion.button>
          )}
          <motion.button
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            onClick={() => setAgentSettingsOpen(true)}
            style={{
              width: 32, height: 32, borderRadius: radius.md,
              background: currentTheme.backgroundOverlay,
              border: `1px solid ${currentTheme.border}`,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              cursor: 'pointer', color: currentTheme.textMuted,
            }}
            title="Agent settings"
          >
            <Settings size={14} />
          </motion.button>
        </div>
      </div>

      {/* Messages */}
      <div style={{
        flex: 1, overflowY: 'auto', padding: spacing.lg,
        display: 'flex', flexDirection: 'column', gap: spacing.md,
      }}>
        {agentMessages.length === 0 && (
          <div style={{
            flex: 1, display: 'flex', flexDirection: 'column',
            alignItems: 'center', justifyContent: 'center', gap: spacing.md,
            color: currentTheme.textMuted, textAlign: 'center', padding: spacing['2xl'],
          }}>
            <p style={{ fontSize: fontSize.sm, margin: 0, maxWidth: 360, lineHeight: 1.6 }}>
              {isConnected
                ? `Send a message to start chatting with ${agent.name}`
                : 'Waiting for connection to your OpenClaw gateway...'}
            </p>
          </div>
        )}

        {agentMessages.map(msg => {
          if (msg.role === 'user') {
            return (
              <div key={msg.id} style={{ display: 'flex', justifyContent: 'flex-end' }}>
                <div style={{
                  maxWidth: '70%', padding: `${spacing.sm} ${spacing.md}`,
                  background: currentTheme.accentGradient,
                  borderRadius: `${radius.lg} ${radius.lg} 4px ${radius.lg}`,
                  color: '#fff', fontSize: fontSize.sm, lineHeight: 1.6,
                  wordBreak: 'break-word',
                }}>
                  {msg.content}
                </div>
              </div>
            )
          }

          if (msg.role === 'tool') {
            const isExpanded = expandedTools.has(msg.id)
            return (
              <div key={msg.id} style={{
                maxWidth: '80%', padding: `${spacing.xs} ${spacing.md}`,
                background: currentTheme.backgroundOverlay,
                borderRadius: radius.md, border: `1px solid ${currentTheme.border}`,
                fontSize: fontSize.xs,
              }}>
                <button
                  onClick={() => toggleToolExpanded(msg.id)}
                  style={{
                    width: '100%', background: 'transparent', border: 'none',
                    color: currentTheme.textMuted, display: 'flex', alignItems: 'center',
                    gap: spacing.xs, cursor: 'pointer', padding: `${spacing.xs} 0`,
                    fontSize: fontSize.xs, textAlign: 'left',
                  }}
                >
                  <Wrench size={12} />
                  <span style={{ flex: 1 }}>{msg.content}</span>
                  {isExpanded ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
                </button>
                {isExpanded && (
                  <div style={{
                    marginTop: spacing.xs, padding: spacing.sm,
                    background: currentTheme.backgroundElevated,
                    borderRadius: radius.sm, fontFamily: 'monospace',
                    fontSize: '11px', lineHeight: 1.5, whiteSpace: 'pre-wrap',
                    wordBreak: 'break-all', color: currentTheme.textMuted,
                    maxHeight: 200, overflowY: 'auto',
                  }}>
                    {msg.toolInput && (
                      <div>
                        <div style={{ fontWeight: fontWeight.semibold, marginBottom: 2, color: currentTheme.text }}>Input:</div>
                        {msg.toolInput}
                      </div>
                    )}
                    {msg.toolOutput && (
                      <div style={{ marginTop: spacing.xs }}>
                        <div style={{ fontWeight: fontWeight.semibold, marginBottom: 2, color: currentTheme.text }}>Output:</div>
                        {msg.toolOutput}
                      </div>
                    )}
                  </div>
                )}
              </div>
            )
          }

          // Assistant message
          return (
            <div key={msg.id} style={{ display: 'flex', justifyContent: 'flex-start' }}>
              <div style={{
                maxWidth: '80%', padding: `${spacing.sm} ${spacing.md}`,
                background: currentTheme.backgroundOverlay,
                borderRadius: `${radius.lg} ${radius.lg} ${radius.lg} 4px`,
                border: `1px solid ${currentTheme.border}`,
                fontSize: fontSize.sm, lineHeight: 1.7,
                color: currentTheme.text, wordBreak: 'break-word',
              }}>
                {msg.content ? (
                  <MarkdownRenderer content={msg.content} theme={currentTheme} />
                ) : msg.isStreaming ? (
                  <span style={{ color: currentTheme.textMuted }}>
                    <motion.span
                      animate={{ opacity: [0.4, 1, 0.4] }}
                      transition={{ repeat: Infinity, duration: 1.5 }}
                    >
                      Thinking...
                    </motion.span>
                  </span>
                ) : null}
                {msg.isStreaming && msg.content && (
                  <motion.span
                    animate={{ opacity: [0, 1, 0] }}
                    transition={{ repeat: Infinity, duration: 0.8 }}
                    style={{
                      display: 'inline-block', width: 2, height: 14,
                      background: currentTheme.text, marginLeft: 2, verticalAlign: 'text-bottom',
                    }}
                  />
                )}
              </div>
            </div>
          )
        })}
        <div ref={messagesEndRef} />
      </div>

      {/* Input bar */}
      <div style={{
        padding: `${spacing.md} ${spacing.lg}`,
        borderTop: `1px solid ${currentTheme.border}`,
        background: currentTheme.background,
        flexShrink: 0,
      }}>
        <div style={{
          display: 'flex', alignItems: 'flex-end', gap: spacing.sm,
          background: currentTheme.backgroundOverlay,
          borderRadius: radius.lg, border: `1px solid ${currentTheme.border}`,
          padding: `${spacing.sm} ${spacing.sm} ${spacing.sm} ${spacing.md}`,
        }}>
          <textarea
            ref={inputRef}
            value={input}
            onChange={e => {
              setInput(e.target.value)
              e.target.style.height = 'auto'
              e.target.style.height = Math.min(e.target.scrollHeight, 120) + 'px'
            }}
            onKeyDown={handleKeyDown}
            placeholder={isConnected ? `Message ${agent.name}...` : 'Connect to send messages...'}
            disabled={!isConnected}
            rows={1}
            style={{
              flex: 1, background: 'transparent', border: 'none',
              color: currentTheme.text, fontSize: fontSize.sm,
              outline: 'none', resize: 'none',
              lineHeight: 1.5, padding: `${spacing.xs} 0`,
              minHeight: 24, maxHeight: 120,
              opacity: isConnected ? 1 : 0.5,
            }}
          />
          <motion.button
            whileHover={{ scale: input.trim() && isConnected ? 1.05 : 1 }}
            whileTap={{ scale: input.trim() && isConnected ? 0.95 : 1 }}
            onClick={handleSend}
            disabled={!input.trim() || !isConnected || isAgentTyping}
            style={{
              width: 36, height: 36, borderRadius: radius.md,
              background: input.trim() && isConnected
                ? currentTheme.accentGradient
                : currentTheme.backgroundElevated,
              border: 'none',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              cursor: input.trim() && isConnected ? 'pointer' : 'not-allowed',
              flexShrink: 0,
            }}
          >
            <Send size={16} style={{
              color: input.trim() && isConnected ? '#fff' : currentTheme.textMuted,
            }} />
          </motion.button>
        </div>
      </div>
    </div>
  )
}

export default AgentChatView
