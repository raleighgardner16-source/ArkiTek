import React, { useState } from 'react'
import { ArrowLeft, Trash2, Save, Wifi, RefreshCw } from 'lucide-react'
import { motion } from 'framer-motion'
import { useStore } from '../../store/useStore'
import { getTheme } from '../../utils/theme'
import { spacing, fontSize, fontWeight, radius, transition } from '../../utils/styles'
import api from '../../utils/api'

interface AgentSettingsPanelProps {
  agent: {
    _id: string
    name: string
    gatewayUrl: string
    currentModel: string | null
    currentProvider: string | null
    status: string
    createdAt: string
    lastConnectedAt: string | null
  }
}

const AgentSettingsPanel: React.FC<AgentSettingsPanelProps> = ({ agent }) => {
  const theme = useStore((state) => state.theme || 'dark')
  const currentTheme = getTheme(theme)
  const setAgentSettingsOpen = useStore((state) => state.setAgentSettingsOpen)
  const updateAgent = useStore((state) => state.updateAgent)
  const removeAgent = useStore((state) => state.removeAgent)
  const setActiveAgentId = useStore((state) => state.setActiveAgentId)
  const agentConnectionStatus = useStore((state) => state.agentConnectionStatus[agent._id] || 'disconnected')
  const agentLimits = useStore((state) => state.agentLimits)
  const setAgentLimits = useStore((state) => state.setAgentLimits)

  const [name, setName] = useState(agent.name)
  const [gatewayUrl, setGatewayUrl] = useState(agent.gatewayUrl)
  const [newToken, setNewToken] = useState('')
  const [saving, setSaving] = useState(false)
  const [testing, setTesting] = useState(false)
  const [testResult, setTestResult] = useState<'success' | 'error' | null>(null)
  const [deleting, setDeleting] = useState(false)
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const [saveMessage, setSaveMessage] = useState('')

  const hasChanges = name !== agent.name || gatewayUrl !== agent.gatewayUrl || newToken.length > 0

  const handleSave = async () => {
    setSaving(true)
    setSaveMessage('')
    try {
      const updates: Record<string, string> = {}
      if (name !== agent.name) updates.name = name.trim()
      if (gatewayUrl !== agent.gatewayUrl) updates.gatewayUrl = gatewayUrl.trim()
      if (newToken) updates.gatewayToken = newToken

      await api.patch(`/agents/${agent._id}`, updates)
      updateAgent(agent._id, {
        ...(updates.name && { name: updates.name }),
        ...(updates.gatewayUrl && { gatewayUrl: updates.gatewayUrl }),
      })
      setNewToken('')
      setSaveMessage('Saved')
      setTimeout(() => setSaveMessage(''), 2000)
    } catch (err: any) {
      setSaveMessage(err.response?.data?.message || 'Save failed')
    } finally {
      setSaving(false)
    }
  }

  const handleTestConnection = async () => {
    setTesting(true)
    setTestResult(null)
    try {
      const res = await api.post(`/agents/${agent._id}/test`)
      if (res.data?.data?.gateway?.connected) {
        setTestResult('success')
        const info = res.data.data.gateway
        if (info.model) {
          updateAgent(agent._id, { currentModel: info.model })
        }
      } else {
        setTestResult('error')
      }
    } catch {
      setTestResult('error')
    } finally {
      setTesting(false)
      setTimeout(() => setTestResult(null), 3000)
    }
  }

  const handleDelete = async () => {
    setDeleting(true)
    try {
      const wasPaidExtra = agentLimits && agentLimits.paidExtras > 0

      const res = await api.delete(`/agents/${agent._id}`)

      if (wasPaidExtra) {
        try {
          await api.post('/stripe/remove-extra-agent')
        } catch {
          // Billing adjustment failed but agent is already removed
        }
      }

      if (res.data?.data?.limits) {
        setAgentLimits(res.data.data.limits)
      }

      removeAgent(agent._id)
      setActiveAgentId(null)
      setAgentSettingsOpen(false)
    } catch {
      setDeleting(false)
    }
  }

  const inputStyle: React.CSSProperties = {
    width: '100%', padding: `${spacing.sm} ${spacing.md}`,
    background: currentTheme.backgroundElevated,
    border: `1px solid ${currentTheme.border}`,
    borderRadius: radius.md, color: currentTheme.text,
    fontSize: fontSize.sm, outline: 'none',
    transition: transition.default,
    boxSizing: 'border-box',
  }

  const labelStyle: React.CSSProperties = {
    display: 'block', marginBottom: spacing.xs,
    fontSize: fontSize.xs, fontWeight: fontWeight.medium,
    color: currentTheme.textMuted,
  }

  const sectionStyle: React.CSSProperties = {
    padding: spacing.lg,
    background: currentTheme.backgroundOverlay,
    borderRadius: radius.lg,
    border: `1px solid ${currentTheme.border}`,
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', background: currentTheme.background }}>
      {/* Header */}
      <div style={{
        padding: `${spacing.md} ${spacing.lg}`,
        borderBottom: `1px solid ${currentTheme.border}`,
        display: 'flex', alignItems: 'center', gap: spacing.md,
        flexShrink: 0,
      }}>
        <motion.button
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.95 }}
          onClick={() => setAgentSettingsOpen(false)}
          style={{
            width: 32, height: 32, borderRadius: radius.md,
            background: currentTheme.backgroundOverlay,
            border: `1px solid ${currentTheme.border}`,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            cursor: 'pointer', color: currentTheme.textMuted,
          }}
        >
          <ArrowLeft size={16} />
        </motion.button>
        <h3 style={{
          margin: 0, fontSize: fontSize.md, fontWeight: fontWeight.semibold,
          color: currentTheme.text,
        }}>
          Agent Settings
        </h3>
      </div>

      {/* Content */}
      <div style={{
        flex: 1, overflowY: 'auto', padding: spacing.xl,
        display: 'flex', flexDirection: 'column', gap: spacing.lg,
        maxWidth: 520,
      }}>
        {/* General settings */}
        <div style={sectionStyle}>
          <h4 style={{
            margin: `0 0 ${spacing.lg}`, fontSize: fontSize.sm,
            fontWeight: fontWeight.semibold, color: currentTheme.text,
          }}>
            General
          </h4>

          <div style={{ marginBottom: spacing.lg }}>
            <label style={labelStyle}>Agent Name</label>
            <input
              type="text"
              value={name}
              onChange={e => setName(e.target.value)}
              maxLength={100}
              style={inputStyle}
            />
          </div>

          <div>
            <label style={labelStyle}>Current Model</label>
            <div style={{
              padding: `${spacing.sm} ${spacing.md}`,
              background: currentTheme.backgroundElevated,
              border: `1px solid ${currentTheme.border}`,
              borderRadius: radius.md, fontSize: fontSize.sm,
              color: agent.currentModel ? currentTheme.text : currentTheme.textMuted,
            }}>
              {agent.currentModel || 'Unknown — test connection to detect'}
            </div>
            <p style={{
              margin: `${spacing.xs} 0 0`, fontSize: fontSize.xs,
              color: currentTheme.textMuted, lineHeight: 1.5,
            }}>
              To change the model, update it in your OpenClaw gateway config and reconnect.
            </p>
          </div>
        </div>

        {/* Connection settings */}
        <div style={sectionStyle}>
          <h4 style={{
            margin: `0 0 ${spacing.lg}`, fontSize: fontSize.sm,
            fontWeight: fontWeight.semibold, color: currentTheme.text,
          }}>
            Connection
          </h4>

          <div style={{ marginBottom: spacing.lg }}>
            <label style={labelStyle}>Gateway URL</label>
            <input
              type="text"
              value={gatewayUrl}
              onChange={e => setGatewayUrl(e.target.value)}
              style={inputStyle}
            />
          </div>

          <div style={{ marginBottom: spacing.lg }}>
            <label style={labelStyle}>Gateway Token (leave empty to keep current)</label>
            <input
              type="password"
              value={newToken}
              onChange={e => setNewToken(e.target.value)}
              placeholder="••••••••"
              style={inputStyle}
            />
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: spacing.sm }}>
            <motion.button
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              onClick={handleTestConnection}
              disabled={testing}
              style={{
                padding: `${spacing.sm} ${spacing.md}`,
                background: testResult === 'success'
                  ? 'rgba(34,197,94,0.15)'
                  : testResult === 'error'
                  ? 'rgba(239,68,68,0.15)'
                  : currentTheme.backgroundElevated,
                border: `1px solid ${
                  testResult === 'success' ? 'rgba(34,197,94,0.4)'
                  : testResult === 'error' ? 'rgba(239,68,68,0.4)'
                  : currentTheme.border
                }`,
                borderRadius: radius.md, fontSize: fontSize.xs,
                fontWeight: fontWeight.medium, color: currentTheme.text,
                cursor: 'pointer', display: 'flex', alignItems: 'center', gap: spacing.xs,
              }}
            >
              {testing ? (
                <><RefreshCw size={12} className="animate-spin" /> Testing...</>
              ) : testResult === 'success' ? (
                <>Connected</>
              ) : testResult === 'error' ? (
                <>Failed</>
              ) : (
                <><Wifi size={12} /> Test Connection</>
              )}
            </motion.button>

            <div style={{
              display: 'flex', alignItems: 'center', gap: 6,
              fontSize: fontSize.xs, color: currentTheme.textMuted,
            }}>
              <div style={{
                width: 6, height: 6, borderRadius: '50%',
                background: agentConnectionStatus === 'connected' ? '#22c55e'
                  : agentConnectionStatus === 'connecting' || agentConnectionStatus === 'handshaking' ? '#f59e0b'
                  : currentTheme.textMuted,
                opacity: agentConnectionStatus === 'connected' ? 1 : 0.5,
              }} />
              {agentConnectionStatus === 'connected' ? 'Live' : agentConnectionStatus}
            </div>
          </div>
        </div>

        {/* Info */}
        <div style={sectionStyle}>
          <h4 style={{
            margin: `0 0 ${spacing.md}`, fontSize: fontSize.sm,
            fontWeight: fontWeight.semibold, color: currentTheme.text,
          }}>
            Info
          </h4>
          <div style={{ fontSize: fontSize.xs, color: currentTheme.textMuted, lineHeight: 2 }}>
            <div>Created: {new Date(agent.createdAt).toLocaleDateString()}</div>
            {agent.lastConnectedAt && (
              <div>Last connected: {new Date(agent.lastConnectedAt).toLocaleString()}</div>
            )}
          </div>
        </div>

        {/* Save button */}
        {hasChanges && (
          <motion.button
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            onClick={handleSave}
            disabled={saving}
            style={{
              padding: `${spacing.sm} ${spacing.lg}`,
              background: currentTheme.accentGradient,
              border: 'none', borderRadius: radius.md,
              color: '#fff', fontSize: fontSize.sm, fontWeight: fontWeight.semibold,
              cursor: 'pointer', display: 'flex', alignItems: 'center',
              justifyContent: 'center', gap: spacing.sm,
            }}
          >
            <Save size={14} />
            {saving ? 'Saving...' : 'Save Changes'}
          </motion.button>
        )}

        {saveMessage && (
          <div style={{
            fontSize: fontSize.xs, textAlign: 'center',
            color: saveMessage === 'Saved' ? '#22c55e' : '#ef4444',
          }}>
            {saveMessage}
          </div>
        )}

        {/* Danger zone */}
        <div style={{
          ...sectionStyle,
          borderColor: 'rgba(239,68,68,0.2)',
          marginTop: spacing.lg,
        }}>
          <h4 style={{
            margin: `0 0 ${spacing.md}`, fontSize: fontSize.sm,
            fontWeight: fontWeight.semibold, color: '#ef4444',
          }}>
            Danger Zone
          </h4>
          <p style={{
            fontSize: fontSize.xs, color: currentTheme.textMuted,
            lineHeight: 1.6, margin: `0 0 ${spacing.md}`,
          }}>
            Disconnect this agent from ArkiTek. Your OpenClaw agent and its data are not
            affected — only the connection to this UI is removed.
            {agentLimits && agentLimits.paidExtras > 0 && (
              <span style={{ display: 'block', marginTop: 4, color: '#eab308' }}>
                This will reduce your extra agent billing by ${agentLimits.extraAgentPrice.toFixed(2)}/mo.
              </span>
            )}
          </p>

          {!showDeleteConfirm ? (
            <motion.button
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              onClick={() => setShowDeleteConfirm(true)}
              style={{
                padding: `${spacing.sm} ${spacing.md}`,
                background: 'rgba(239,68,68,0.1)',
                border: '1px solid rgba(239,68,68,0.3)',
                borderRadius: radius.md, color: '#ef4444',
                fontSize: fontSize.xs, fontWeight: fontWeight.medium,
                cursor: 'pointer', display: 'flex', alignItems: 'center', gap: spacing.xs,
              }}
            >
              <Trash2 size={12} />
              Disconnect Agent
            </motion.button>
          ) : (
            <div style={{ display: 'flex', gap: spacing.sm }}>
              <motion.button
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                onClick={handleDelete}
                disabled={deleting}
                style={{
                  padding: `${spacing.sm} ${spacing.md}`,
                  background: '#ef4444', border: 'none',
                  borderRadius: radius.md, color: '#fff',
                  fontSize: fontSize.xs, fontWeight: fontWeight.semibold,
                  cursor: 'pointer',
                }}
              >
                {deleting ? 'Removing...' : 'Yes, disconnect'}
              </motion.button>
              <motion.button
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                onClick={() => setShowDeleteConfirm(false)}
                style={{
                  padding: `${spacing.sm} ${spacing.md}`,
                  background: 'transparent',
                  border: `1px solid ${currentTheme.border}`,
                  borderRadius: radius.md, color: currentTheme.textMuted,
                  fontSize: fontSize.xs, cursor: 'pointer',
                }}
              >
                Cancel
              </motion.button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

export default AgentSettingsPanel
