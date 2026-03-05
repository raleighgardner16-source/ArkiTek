import React, { useState } from 'react'
import { X, Wifi, CheckCircle, AlertCircle, ChevronDown, ChevronUp, DollarSign } from 'lucide-react'
import { motion } from 'framer-motion'
import { useStore } from '../../store/useStore'
import { getTheme } from '../../utils/theme'
import { spacing, fontSize, fontWeight, radius, transition } from '../../utils/styles'
import api from '../../utils/api'
import { testGatewayConnection } from '../../utils/gatewayTest'

const ConnectAgentModal = () => {
  const theme = useStore((state) => state.theme || 'dark')
  const currentTheme = getTheme(theme)
  const setShowConnectAgentModal = useStore((state) => state.setShowConnectAgentModal)
  const addAgent = useStore((state) => state.addAgent)
  const setActiveAgentId = useStore((state) => state.setActiveAgentId)
  const agentLimits = useStore((state) => state.agentLimits)
  const setAgentLimits = useStore((state) => state.setAgentLimits)

  const [name, setName] = useState('')
  const [gatewayUrl, setGatewayUrl] = useState('')
  const [gatewayToken, setGatewayToken] = useState('')
  const [testStatus, setTestStatus] = useState<'idle' | 'testing' | 'success' | 'error'>('idle')
  const [testInfo, setTestInfo] = useState<{ model?: string; skills?: string[] } | null>(null)
  const [testError, setTestError] = useState('')
  const [saving, setSaving] = useState(false)
  const [showSetupGuide, setShowSetupGuide] = useState(false)
  const [billingStep, setBillingStep] = useState(false)
  const [billingInProgress, setBillingInProgress] = useState(false)
  const [focusedInput, setFocusedInput] = useState<string | null>(null)

  const requiresPayment = agentLimits ? !agentLimits.canAddFree : false
  const canTest = gatewayUrl.trim().length > 0 && gatewayToken.trim().length > 0
  const canSave = name.trim().length > 0 && canTest && testStatus === 'success'

  const handleTest = async () => {
    setTestStatus('testing')
    setTestError('')
    setTestInfo(null)

    try {
      const info = await testGatewayConnection(gatewayUrl.trim(), gatewayToken.trim())

      if (info.connected) {
        setTestStatus('success')
        setTestInfo(info)
      } else {
        setTestStatus('error')
        setTestError('Gateway did not confirm connection')
      }
    } catch (err: any) {
      setTestStatus('error')
      setTestError(err.message || 'Connection failed')
    }
  }

  const handleSave = async () => {
    if (!canSave) return

    if (requiresPayment && !billingStep) {
      setBillingStep(true)
      return
    }

    setSaving(true)

    try {
      if (requiresPayment) {
        setBillingInProgress(true)
        try {
          await api.post('/stripe/add-extra-agent')
        } catch (err: any) {
          const msg = err.response?.data?.message || 'Failed to set up billing for extra agent'
          setTestError(msg)
          setBillingStep(false)
          setSaving(false)
          setBillingInProgress(false)
          return
        }
        setBillingInProgress(false)
      }

      const res = await api.post('/agents', {
        name: name.trim(),
        gatewayUrl: gatewayUrl.trim(),
        gatewayToken: gatewayToken.trim(),
      })

      const agent = res.data?.data?.agent
      if (agent) {
        if (testInfo?.model) {
          agent.currentModel = testInfo.model
        }
        addAgent(agent)
        setActiveAgentId(agent._id)
      }
      if (res.data?.data?.limits) {
        setAgentLimits(res.data.data.limits)
      }
      setShowConnectAgentModal(false)
    } catch (err: any) {
      setTestError(err.response?.data?.message || 'Failed to save agent')
    } finally {
      setSaving(false)
      setBillingInProgress(false)
    }
  }

  const getInputStyle = (field: string): React.CSSProperties => ({
    width: '100%', padding: `${spacing.sm} ${spacing.md}`,
    background: currentTheme.backgroundTertiary,
    border: `1px solid ${focusedInput === field ? currentTheme.borderActive : currentTheme.border}`,
    borderRadius: radius.md, color: currentTheme.text,
    fontSize: fontSize.sm, outline: 'none',
    transition: transition.default,
    boxSizing: 'border-box',
    caretColor: currentTheme.accent,
  })

  const labelStyle: React.CSSProperties = {
    display: 'block', marginBottom: spacing.xs,
    fontSize: fontSize.xs, fontWeight: fontWeight.medium,
    color: currentTheme.textMuted,
  }

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      style={{
        position: 'fixed', inset: 0, zIndex: 1000,
        background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: spacing.xl,
      }}
      onClick={() => setShowConnectAgentModal(false)}
    >
      <motion.div
        initial={{ scale: 0.95, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0.95, opacity: 0 }}
        onClick={e => e.stopPropagation()}
        style={{
          width: '100%', maxWidth: 480,
          background: currentTheme.background,
          borderRadius: radius.xl, border: `1px solid ${currentTheme.border}`,
          boxShadow: '0 24px 48px rgba(0,0,0,0.3)',
          overflow: 'hidden',
        }}
      >
        {/* Header */}
        <div style={{
          padding: `${spacing.lg} ${spacing.xl}`,
          borderBottom: `1px solid ${currentTheme.border}`,
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        }}>
          <h3 style={{
            margin: 0, fontSize: fontSize.lg, fontWeight: fontWeight.semibold,
            color: currentTheme.text,
          }}>
            Connect Agent
          </h3>
          <motion.button
            whileHover={{ scale: 1.1 }}
            whileTap={{ scale: 0.9 }}
            onClick={() => setShowConnectAgentModal(false)}
            style={{
              width: 32, height: 32, borderRadius: radius.md,
              background: 'transparent', border: 'none',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              cursor: 'pointer', color: currentTheme.textMuted,
            }}
          >
            <X size={18} />
          </motion.button>
        </div>

        {/* Body */}
        <div style={{ padding: spacing.xl, display: 'flex', flexDirection: 'column', gap: spacing.lg }}>
          {/* Agent name */}
          <div>
            <label style={labelStyle}>Agent Name</label>
            <input
              type="text"
              value={name}
              onChange={e => setName(e.target.value)}
              onFocus={() => setFocusedInput('name')}
              onBlur={() => setFocusedInput(null)}
              placeholder="e.g. My Research Assistant"
              maxLength={100}
              style={getInputStyle('name')}
            />
          </div>

          {/* Gateway URL */}
          <div>
            <label style={labelStyle}>Gateway URL</label>
            <input
              type="text"
              value={gatewayUrl}
              onChange={e => { setGatewayUrl(e.target.value); setTestStatus('idle') }}
              onFocus={() => setFocusedInput('gatewayUrl')}
              onBlur={() => setFocusedInput(null)}
              placeholder="wss://my-macmini.tail12345.ts.net"
              style={getInputStyle('gatewayUrl')}
            />
          </div>

          {/* Gateway token */}
          <div>
            <label style={labelStyle}>Gateway Token</label>
            <input
              type="password"
              value={gatewayToken}
              onChange={e => { setGatewayToken(e.target.value); setTestStatus('idle') }}
              onFocus={() => setFocusedInput('gatewayToken')}
              onBlur={() => setFocusedInput(null)}
              placeholder="Your gateway auth token"
              style={getInputStyle('gatewayToken')}
            />
          </div>

          {/* Test connection button + result */}
          <div>
            <motion.button
              whileHover={{ scale: canTest ? 1.02 : 1 }}
              whileTap={{ scale: canTest ? 0.98 : 1 }}
              onClick={handleTest}
              disabled={!canTest || testStatus === 'testing'}
              style={{
                width: '100%', padding: `${spacing.sm} ${spacing.md}`,
                background: testStatus === 'success'
                  ? 'rgba(34,197,94,0.15)'
                  : currentTheme.backgroundOverlay,
                border: `1px solid ${testStatus === 'success' ? 'rgba(34,197,94,0.4)' : currentTheme.border}`,
                borderRadius: radius.md, color: currentTheme.text,
                fontSize: fontSize.sm, fontWeight: fontWeight.medium,
                cursor: canTest ? 'pointer' : 'not-allowed',
                opacity: canTest ? 1 : 0.5,
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: spacing.sm,
                transition: transition.default,
              }}
            >
              {testStatus === 'testing' ? (
                <>Testing connection...</>
              ) : testStatus === 'success' ? (
                <><CheckCircle size={16} style={{ color: '#22c55e' }} /> Connected</>
              ) : (
                <><Wifi size={16} /> Test Connection</>
              )}
            </motion.button>

            {testStatus === 'success' && testInfo && (
              <div style={{
                marginTop: spacing.sm, padding: spacing.md,
                background: 'rgba(34,197,94,0.08)', borderRadius: radius.md,
                border: '1px solid rgba(34,197,94,0.2)',
              }}>
                <div style={{ fontSize: fontSize.xs, color: '#22c55e', fontWeight: fontWeight.medium }}>
                  Gateway connected successfully
                </div>
                {testInfo.model && (
                  <div style={{ fontSize: fontSize.xs, color: currentTheme.textMuted, marginTop: 4 }}>
                    Model: {testInfo.model}
                  </div>
                )}
                {testInfo.skills && testInfo.skills.length > 0 && (
                  <div style={{ fontSize: fontSize.xs, color: currentTheme.textMuted, marginTop: 2 }}>
                    Skills: {testInfo.skills.join(', ')}
                  </div>
                )}
              </div>
            )}

            {testStatus === 'error' && (
              <div style={{
                marginTop: spacing.sm, padding: spacing.md,
                background: 'rgba(239,68,68,0.08)', borderRadius: radius.md,
                border: '1px solid rgba(239,68,68,0.2)',
                display: 'flex', alignItems: 'flex-start', gap: spacing.sm,
              }}>
                <AlertCircle size={14} style={{ color: '#ef4444', marginTop: 2, flexShrink: 0 }} />
                <div style={{ fontSize: fontSize.xs, color: '#ef4444', lineHeight: 1.5 }}>
                  {testError}
                </div>
              </div>
            )}
          </div>

          {/* Setup guide accordion */}
          <div>
            <button
              onClick={() => setShowSetupGuide(!showSetupGuide)}
              style={{
                width: '100%', padding: `${spacing.sm} 0`,
                background: 'transparent', border: 'none',
                color: currentTheme.textMuted, fontSize: fontSize.xs,
                cursor: 'pointer', display: 'flex', alignItems: 'center', gap: spacing.xs,
                textAlign: 'left',
              }}
            >
              {showSetupGuide ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
              How to get your gateway URL & token
            </button>

            {showSetupGuide && (
              <div style={{
                padding: spacing.md, background: currentTheme.backgroundOverlay,
                borderRadius: radius.md, border: `1px solid ${currentTheme.border}`,
                fontSize: fontSize.xs, color: currentTheme.textMuted, lineHeight: 1.7,
              }}>
                <p style={{ margin: `0 0 ${spacing.sm}`, fontWeight: fontWeight.semibold, color: currentTheme.text }}>
                  Agent on a cloud server or VPS?
                </p>
                <p style={{ margin: `0 0 ${spacing.sm}` }}>
                  Your agent already has a public URL. Just ask your agent in Telegram or WhatsApp:
                  {' '}<code style={{ background: currentTheme.backgroundElevated, padding: '1px 4px', borderRadius: 3 }}>
                  What's my gateway URL and token?</code>{' '}
                  Then paste them above.
                </p>

                <div style={{ borderTop: `1px solid ${currentTheme.border}`, margin: `${spacing.sm} 0`, opacity: 0.5 }} />

                <p style={{ margin: `0 0 ${spacing.sm}`, fontWeight: fontWeight.semibold, color: currentTheme.text }}>
                  Agent running on your own computer?
                </p>
                <p style={{ margin: `0 0 ${spacing.xs}` }}>
                  1. Download{' '}
                  <a href="https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/downloads/" target="_blank" rel="noopener noreferrer" style={{ color: currentTheme.accent, textDecoration: 'none' }}>
                    Cloudflare Tunnel (cloudflared)
                  </a>
                </p>
                <p style={{ margin: `0 0 ${spacing.xs}` }}>
                  2. Run this command in your terminal:
                </p>
                <code style={{
                  display: 'block', background: currentTheme.backgroundElevated,
                  padding: `${spacing.sm} ${spacing.md}`, borderRadius: radius.sm,
                  margin: `${spacing.xs} 0 ${spacing.sm}`, fontSize: '11px',
                  fontFamily: 'monospace', wordBreak: 'break-all',
                }}>
                  cloudflared tunnel --url http://localhost:18789
                </code>
                <p style={{ margin: `0 0 ${spacing.xs}` }}>
                  3. Copy the URL it prints (looks like <code style={{ background: currentTheme.backgroundElevated, padding: '1px 4px', borderRadius: 3 }}>
                  https://random-words.trycloudflare.com</code>)
                </p>
                <p style={{ margin: 0 }}>
                  4. Paste that URL above. No account needed, free forever, secure by default.
                </p>
              </div>
            )}
          </div>
        </div>

        {/* Billing confirmation step */}
        {billingStep && requiresPayment && agentLimits && (
          <div style={{
            margin: `0 ${spacing.xl}`, padding: spacing.lg,
            background: 'rgba(234,179,8,0.08)',
            borderRadius: radius.md,
            border: '1px solid rgba(234,179,8,0.25)',
          }}>
            <div style={{
              display: 'flex', alignItems: 'center', gap: spacing.sm,
              marginBottom: spacing.sm,
            }}>
              <DollarSign size={16} style={{ color: '#eab308' }} />
              <span style={{
                fontSize: fontSize.sm, fontWeight: fontWeight.semibold,
                color: currentTheme.text,
              }}>
                Extra Agent Add-on
              </span>
            </div>
            <p style={{
              fontSize: fontSize.xs, color: currentTheme.textMuted,
              lineHeight: 1.6, margin: `0 0 ${spacing.sm}`,
            }}>
              You've used all {agentLimits.included} agent{agentLimits.included !== 1 ? 's' : ''} included
              with your plan. Adding this agent will cost an additional
              <strong style={{ color: currentTheme.text }}> ${agentLimits.extraAgentPrice.toFixed(2)}/month</strong>,
              prorated to your current billing cycle.
            </p>
            {agentLimits.paidExtras > 0 && (
              <p style={{
                fontSize: fontSize.xs, color: currentTheme.textMuted,
                margin: `0 0 ${spacing.sm}`, lineHeight: 1.5,
              }}>
                You currently have {agentLimits.paidExtras} extra agent{agentLimits.paidExtras !== 1 ? 's' : ''} at ${agentLimits.extrasCost.toFixed(2)}/mo.
                This will bring your total to ${(agentLimits.extrasCost + agentLimits.extraAgentPrice).toFixed(2)}/mo for extras.
              </p>
            )}
            {billingInProgress && (
              <p style={{ fontSize: fontSize.xs, color: '#eab308', margin: 0 }}>
                Setting up billing...
              </p>
            )}
          </div>
        )}

        {/* Pricing hint when extra agent is needed but billing step not yet shown */}
        {requiresPayment && !billingStep && canSave && agentLimits && (
          <div style={{
            margin: `0 ${spacing.xl}`, padding: `${spacing.sm} ${spacing.md}`,
            background: 'rgba(234,179,8,0.06)',
            borderRadius: radius.md,
            border: '1px solid rgba(234,179,8,0.15)',
            fontSize: fontSize.xs, color: currentTheme.textMuted, lineHeight: 1.5,
          }}>
            This will be an extra agent at ${agentLimits.extraAgentPrice.toFixed(2)}/mo ({agentLimits.included} included with your plan).
          </div>
        )}

        {/* Footer */}
        <div style={{
          padding: `${spacing.md} ${spacing.xl} ${spacing.lg}`,
          borderTop: `1px solid ${currentTheme.border}`,
          display: 'flex', justifyContent: 'flex-end', gap: spacing.sm,
        }}>
          {billingStep && (
            <motion.button
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              onClick={() => setBillingStep(false)}
              style={{
                padding: `${spacing.sm} ${spacing.lg}`,
                background: 'transparent',
                border: `1px solid ${currentTheme.border}`,
                borderRadius: radius.md, color: currentTheme.textMuted,
                fontSize: fontSize.sm, cursor: 'pointer',
              }}
            >
              Back
            </motion.button>
          )}
          <motion.button
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            onClick={() => setShowConnectAgentModal(false)}
            style={{
              padding: `${spacing.sm} ${spacing.lg}`,
              background: 'transparent',
              border: `1px solid ${currentTheme.border}`,
              borderRadius: radius.md, color: currentTheme.textMuted,
              fontSize: fontSize.sm, cursor: 'pointer',
            }}
          >
            Cancel
          </motion.button>
          <motion.button
            whileHover={{ scale: canSave ? 1.02 : 1 }}
            whileTap={{ scale: canSave ? 0.98 : 1 }}
            onClick={handleSave}
            disabled={!canSave || saving}
            style={{
              padding: `${spacing.sm} ${spacing.lg}`,
              background: canSave ? currentTheme.accentGradient : currentTheme.backgroundOverlay,
              border: 'none', borderRadius: radius.md, color: canSave ? '#fff' : currentTheme.textMuted,
              fontSize: fontSize.sm, fontWeight: fontWeight.semibold,
              cursor: canSave ? 'pointer' : 'not-allowed',
              opacity: canSave ? 1 : 0.5,
            }}
          >
            {saving
              ? (billingInProgress ? 'Setting up billing...' : 'Saving...')
              : billingStep
                ? `Confirm & Connect ($${agentLimits?.extraAgentPrice.toFixed(2)}/mo)`
                : 'Connect Agent'}
          </motion.button>
        </div>
      </motion.div>
    </motion.div>
  )
}

export default ConnectAgentModal
