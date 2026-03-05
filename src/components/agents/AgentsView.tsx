import React, { useEffect, useState } from 'react'
import { Bot, Plus, ChevronRight } from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'
import { useStore } from '../../store/useStore'
import { getTheme } from '../../utils/theme'
import { spacing, fontSize, fontWeight, radius, transition, layout, sx, createStyles } from '../../utils/styles'
import api from '../../utils/api'
import ConnectAgentModal from './ConnectAgentModal'
import AgentChatView from './AgentChatView'
import AgentSettingsPanel from './AgentSettingsPanel'

const AgentsView = () => {
  const theme = useStore((state) => state.theme || 'dark')
  const currentTheme = getTheme(theme)
  const s = createStyles(currentTheme)
  const isNavExpanded = useStore((state) => state.isNavExpanded)
  const currentUser = useStore((state) => state.currentUser)
  const agents = useStore((state) => state.agents)
  const setAgents = useStore((state) => state.setAgents)
  const activeAgentId = useStore((state) => state.activeAgentId)
  const setActiveAgentId = useStore((state) => state.setActiveAgentId)
  const showConnectAgentModal = useStore((state) => state.showConnectAgentModal)
  const setShowConnectAgentModal = useStore((state) => state.setShowConnectAgentModal)
  const agentConnectionStatus = useStore((state) => state.agentConnectionStatus)
  const agentSettingsOpen = useStore((state) => state.agentSettingsOpen)
  const setAgentSettingsOpen = useStore((state) => state.setAgentSettingsOpen)
  const agentLimits = useStore((state) => state.agentLimits)
  const setAgentLimits = useStore((state) => state.setAgentLimits)

  const [mountReady, setMountReady] = useState(false)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    requestAnimationFrame(() => setMountReady(true))
  }, [])

  useEffect(() => {
    if (!currentUser?.id) return
    const fetchAgents = async () => {
      try {
        const res = await api.get('/agents')
        if (res.data?.data?.agents) {
          setAgents(res.data.data.agents)
        }
        if (res.data?.data?.limits) {
          setAgentLimits(res.data.data.limits)
        }
      } catch {
        // Agents not loaded — that's fine, might be first use
      } finally {
        setLoading(false)
      }
    }
    fetchAgents()
  }, [currentUser?.id])

  const navWidth = isNavExpanded ? '240px' : '60px'
  const activeAgent = agents.find(a => a._id === activeAgentId)

  if (loading) {
    return (
      <div
        style={sx(layout.flexCol, s.pageContainer(navWidth), {
          alignItems: 'center', justifyContent: 'center',
        })}
      >
        <div style={{ color: currentTheme.textMuted, fontSize: fontSize.md }}>Loading agents...</div>
      </div>
    )
  }

  if (agents.length === 0 && !showConnectAgentModal) {
    return (
      <>
        <div
          className={mountReady ? undefined : 'no-mount-transition'}
          style={sx(layout.flexCol, s.pageContainer(navWidth), {
            alignItems: 'center', justifyContent: 'center', gap: spacing['2xl'],
          })}
        >
          <div style={{
            width: 80, height: 80, borderRadius: '50%',
            background: currentTheme.backgroundOverlay,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            border: `1px solid ${currentTheme.border}`,
          }}>
            <Bot size={36} style={{ color: currentTheme.textMuted, opacity: 0.6 }} />
          </div>

          <div style={{ textAlign: 'center', maxWidth: 420 }}>
            <h2 style={sx(s.pageTitle, { marginBottom: spacing.md })}>
              Connect Your Agent
            </h2>
            <p style={{ color: currentTheme.textMuted, fontSize: fontSize.sm, lineHeight: 1.6, margin: 0 }}>
              Connect your self-hosted OpenClaw agent to ArkiTek for a better chat experience.
              Your agent's memory, settings, and context stay on your device.
            </p>
          </div>

          <motion.button
            whileHover={{ scale: 1.03 }}
            whileTap={{ scale: 0.97 }}
            onClick={() => setShowConnectAgentModal(true)}
            style={{
              display: 'flex', alignItems: 'center', gap: spacing.sm,
              padding: `${spacing.md} ${spacing.xl}`,
              background: currentTheme.accentGradient,
              border: 'none', borderRadius: radius.lg, color: '#fff',
              fontSize: fontSize.sm, fontWeight: fontWeight.semibold,
              cursor: 'pointer', transition: transition.default,
            }}
          >
            <Plus size={18} />
            Connect Agent
          </motion.button>

          <div style={{
            maxWidth: 380, padding: spacing.lg,
            background: currentTheme.backgroundOverlay,
            borderRadius: radius.lg, border: `1px solid ${currentTheme.border}`,
          }}>
            <p style={{
              color: currentTheme.textMuted, fontSize: fontSize.xs,
              lineHeight: 1.6, margin: `0 0 ${spacing.sm}`, textAlign: 'center',
            }}>
              You'll need an OpenClaw agent running on your device or server.
              If it's on a cloud server, just ask your agent for its gateway URL and token.
              If it's on your computer, set up a free{' '}
              <a href="https://dash.cloudflare.com/sign-up" target="_blank" rel="noopener noreferrer" style={{ color: currentTheme.accent, textDecoration: 'none' }}>
                Cloudflare Tunnel
              </a>{' '}
              for a permanent, always-on connection.
            </p>
            <div style={{
              borderTop: `1px solid ${currentTheme.border}`,
              paddingTop: spacing.sm, marginTop: spacing.sm,
              fontSize: fontSize.xs, color: currentTheme.textMuted,
              lineHeight: 1.6, textAlign: 'center',
            }}>
              {agentLimits ? (
                agentLimits.included > 0
                  ? <>{agentLimits.included} agent{agentLimits.included > 1 ? 's' : ''} included with your plan. Extra agents ${agentLimits.extraAgentPrice.toFixed(2)}/mo each.</>
                  : <>Agents are ${agentLimits.extraAgentPrice.toFixed(2)}/mo each. Upgrade to Pro for 3 included agents or Premium for 10.</>
              ) : (
                <>Pro includes 3 agents, Premium includes 10. Extra agents $2.95/mo each.</>
              )}
            </div>
          </div>
        </div>

        <AnimatePresence>
          {showConnectAgentModal && <ConnectAgentModal />}
        </AnimatePresence>
      </>
    )
  }

  return (
    <>
      <div
        className={mountReady ? undefined : 'no-mount-transition'}
        style={{
          position: 'fixed', top: 0, left: navWidth,
          width: `calc(100% - ${navWidth})`,
          height: '100%', display: 'flex',
          transition: 'left 0.3s ease, width 0.3s ease',
          zIndex: 10,
        }}
      >
        {/* Agent sidebar */}
        <div style={{
          width: 260, minWidth: 260,
          borderRight: `1px solid ${currentTheme.border}`,
          background: currentTheme.background,
          display: 'flex', flexDirection: 'column',
          overflowY: 'auto',
        }}>
          <div style={{
            padding: `${spacing.lg} ${spacing.lg} ${spacing.md}`,
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          }}>
            <h3 style={{
              margin: 0, fontSize: fontSize.md, fontWeight: fontWeight.semibold,
              color: currentTheme.text,
            }}>
              Agents
            </h3>
            <motion.button
              whileHover={{ scale: 1.1 }}
              whileTap={{ scale: 0.9 }}
              onClick={() => setShowConnectAgentModal(true)}
              style={{
                width: 30, height: 30, borderRadius: radius.md,
                background: currentTheme.backgroundOverlay,
                border: `1px solid ${currentTheme.border}`,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                cursor: 'pointer', color: currentTheme.textMuted,
              }}
              title="Connect new agent"
            >
              <Plus size={16} />
            </motion.button>
          </div>

          {agentLimits && (
            <div style={{
              margin: `0 ${spacing.sm} ${spacing.sm}`,
              padding: `${spacing.sm} ${spacing.md}`,
              background: currentTheme.backgroundOverlay,
              borderRadius: radius.md,
              border: `1px solid ${currentTheme.border}`,
              fontSize: fontSize.xs,
              color: currentTheme.textMuted,
              lineHeight: 1.5,
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span>{agentLimits.currentCount} / {agentLimits.included} included</span>
                {agentLimits.paidExtras > 0 && (
                  <span style={{ color: currentTheme.accent }}>
                    +{agentLimits.paidExtras} extra (${agentLimits.extrasCost.toFixed(2)}/mo)
                  </span>
                )}
              </div>
            </div>
          )}

          <div style={{ padding: `0 ${spacing.sm}`, flex: 1 }}>
            {agents.map(agent => {
              const isActive = agent._id === activeAgentId
              const connStatus = agentConnectionStatus[agent._id] || 'disconnected'
              const isOnline = connStatus === 'connected'

              return (
                <motion.div
                  key={agent._id}
                  whileHover={{ scale: 1.01 }}
                  onClick={() => {
                    setActiveAgentId(agent._id)
                    setAgentSettingsOpen(false)
                  }}
                  style={{
                    padding: `${spacing.md} ${spacing.md}`,
                    borderRadius: radius.md,
                    cursor: 'pointer',
                    background: isActive ? currentTheme.backgroundOverlay : 'transparent',
                    border: isActive ? `1px solid ${currentTheme.border}` : '1px solid transparent',
                    marginBottom: spacing.xs,
                    display: 'flex', alignItems: 'center', gap: spacing.sm,
                    transition: transition.default,
                  }}
                >
                  <div style={{
                    width: 36, height: 36, borderRadius: radius.md,
                    background: isActive ? currentTheme.accentGradient : currentTheme.backgroundElevated,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    flexShrink: 0,
                  }}>
                    <Bot size={18} style={{ color: isActive ? '#fff' : currentTheme.textMuted }} />
                  </div>

                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{
                      fontSize: fontSize.sm, fontWeight: fontWeight.medium,
                      color: currentTheme.text,
                      overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                    }}>
                      {agent.name}
                    </div>
                    <div style={{
                      fontSize: fontSize.xs, color: currentTheme.textMuted,
                      display: 'flex', alignItems: 'center', gap: 4, marginTop: 2,
                    }}>
                      <div style={{
                        width: 6, height: 6, borderRadius: '50%',
                        background: isOnline ? '#22c55e' : currentTheme.textMuted,
                        opacity: isOnline ? 1 : 0.4,
                      }} />
                      {agent.currentModel || 'No model set'}
                    </div>
                  </div>

                  {isActive && (
                    <ChevronRight size={14} style={{ color: currentTheme.textMuted, flexShrink: 0 }} />
                  )}
                </motion.div>
              )
            })}
          </div>
        </div>

        {/* Main content area */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', position: 'relative' }}>
          {activeAgent ? (
            agentSettingsOpen ? (
              <AgentSettingsPanel agent={activeAgent} />
            ) : (
              <AgentChatView agent={activeAgent} />
            )
          ) : (
            <div style={{
              flex: 1, display: 'flex', flexDirection: 'column',
              alignItems: 'center', justifyContent: 'center', gap: spacing.lg,
            }}>
              <Bot size={40} style={{ color: currentTheme.textMuted, opacity: 0.3 }} />
              <p style={{ color: currentTheme.textMuted, fontSize: fontSize.sm, margin: 0 }}>
                Select an agent to start chatting
              </p>
            </div>
          )}
        </div>
      </div>

      <AnimatePresence>
        {showConnectAgentModal && <ConnectAgentModal />}
      </AnimatePresence>
    </>
  )
}

export default AgentsView
