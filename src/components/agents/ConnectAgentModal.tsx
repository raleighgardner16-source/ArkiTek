import React, { useState } from 'react'
import { X, Wifi, CheckCircle, AlertCircle, ChevronLeft, DollarSign, Server, Monitor, Smartphone, Apple, Terminal } from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'
import { useStore } from '../../store/useStore'
import { getTheme } from '../../utils/theme'
import { spacing, fontSize, fontWeight, radius, transition } from '../../utils/styles'
import api from '../../utils/api'
import { testGatewayConnection } from '../../utils/gatewayTest'

type HostingType = 'server' | 'device' | null
type Platform = 'macos' | 'windows' | 'linux' | 'ios' | 'android' | null
type Step = 'choose-hosting' | 'server-guide' | 'choose-platform' | 'platform-guide' | 'connect-form' | 'billing'

const ConnectAgentModal = () => {
  const theme = useStore((state) => state.theme || 'dark')
  const currentTheme = getTheme(theme)
  const setShowConnectAgentModal = useStore((state) => state.setShowConnectAgentModal)
  const addAgent = useStore((state) => state.addAgent)
  const setActiveAgentId = useStore((state) => state.setActiveAgentId)
  const agentLimits = useStore((state) => state.agentLimits)
  const setAgentLimits = useStore((state) => state.setAgentLimits)

  const [step, setStep] = useState<Step>('choose-hosting')
  const [hostingType, setHostingType] = useState<HostingType>(null)
  const [platform, setPlatform] = useState<Platform>(null)

  const [name, setName] = useState('')
  const [gatewayUrl, setGatewayUrl] = useState('')
  const [gatewayToken, setGatewayToken] = useState('')
  const [testStatus, setTestStatus] = useState<'idle' | 'testing' | 'success' | 'error'>('idle')
  const [testInfo, setTestInfo] = useState<{ model?: string; skills?: string[] } | null>(null)
  const [testError, setTestError] = useState('')
  const [saving, setSaving] = useState(false)
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
    if (requiresPayment && step !== 'billing') {
      setStep('billing')
      return
    }
    setSaving(true)
    try {
      if (requiresPayment) {
        setBillingInProgress(true)
        try {
          await api.post('/stripe/add-extra-agent')
        } catch (err: any) {
          setTestError(err.response?.data?.message || 'Failed to set up billing for extra agent')
          setStep('connect-form')
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
        if (testInfo?.model) agent.currentModel = testInfo.model
        addAgent(agent)
        setActiveAgentId(agent._id)
      }
      if (res.data?.data?.limits) setAgentLimits(res.data.data.limits)
      setShowConnectAgentModal(false)
    } catch (err: any) {
      setTestError(err.response?.data?.message || 'Failed to save agent')
    } finally {
      setSaving(false)
      setBillingInProgress(false)
    }
  }

  const goBack = () => {
    switch (step) {
      case 'server-guide': setStep('choose-hosting'); break
      case 'choose-platform': setStep('choose-hosting'); break
      case 'platform-guide': setStep('choose-platform'); break
      case 'connect-form':
        if (hostingType === 'server') setStep('server-guide')
        else if (platform) setStep('platform-guide')
        else setStep('choose-hosting')
        break
      case 'billing': setStep('connect-form'); break
      default: setShowConnectAgentModal(false)
    }
  }

  const getStepTitle = (): string => {
    switch (step) {
      case 'choose-hosting': return 'Connect Your Agent'
      case 'server-guide': return 'Cloud / Server Setup'
      case 'choose-platform': return 'Select Your Device'
      case 'platform-guide':
        const names: Record<string, string> = { macos: 'macOS', windows: 'Windows', linux: 'Linux', ios: 'iOS', android: 'Android' }
        return `${names[platform || ''] || ''} Setup`
      case 'connect-form': return 'Enter Connection Details'
      case 'billing': return 'Confirm Extra Agent'
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

  const cardStyle = (isComingSoon = false): React.CSSProperties => ({
    padding: spacing.xl,
    background: currentTheme.backgroundOverlay,
    border: `1px solid ${currentTheme.border}`,
    borderRadius: radius.lg,
    cursor: isComingSoon ? 'default' : 'pointer',
    opacity: isComingSoon ? 0.5 : 1,
    transition: transition.default,
    display: 'flex', alignItems: 'center', gap: spacing.lg,
    textAlign: 'left' as const,
    width: '100%',
    color: currentTheme.text,
  })

  const codeBlockStyle: React.CSSProperties = {
    display: 'block', background: currentTheme.backgroundElevated,
    padding: `${spacing.md} ${spacing.lg}`, borderRadius: radius.sm,
    margin: `${spacing.sm} 0`, fontSize: '11px',
    fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
    wordBreak: 'break-all', lineHeight: 1.6,
    color: currentTheme.text, border: `1px solid ${currentTheme.border}`,
    userSelect: 'all' as const,
  }

  const inlineCodeStyle: React.CSSProperties = {
    background: currentTheme.backgroundElevated,
    padding: '1px 5px', borderRadius: 3,
    fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
    fontSize: '11px',
  }

  const stepNumberStyle: React.CSSProperties = {
    width: 22, height: 22, borderRadius: radius.full,
    background: currentTheme.accent, color: '#fff',
    display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
    fontSize: '11px', fontWeight: fontWeight.bold,
    flexShrink: 0,
  }

  const stepRowStyle: React.CSSProperties = {
    display: 'flex', alignItems: 'flex-start', gap: spacing.md,
    margin: `0 0 ${spacing.lg}`,
  }

  const linkStyle: React.CSSProperties = {
    color: currentTheme.accent, textDecoration: 'none',
  }

  const guideContainerStyle: React.CSSProperties = {
    fontSize: fontSize.xs, color: currentTheme.textMuted, lineHeight: 1.7,
  }

  // ======================= STEP RENDERERS =======================

  const renderChooseHosting = () => (
    <div style={{ display: 'flex', flexDirection: 'column', gap: spacing.lg }}>
      <p style={{ margin: 0, fontSize: fontSize.sm, color: currentTheme.textMuted, lineHeight: 1.6 }}>
        Where is your OpenClaw agent currently running?
      </p>

      <motion.button
        whileHover={{ scale: 1.01, borderColor: currentTheme.accent }}
        whileTap={{ scale: 0.99 }}
        onClick={() => { setHostingType('server'); setStep('server-guide') }}
        style={cardStyle()}
      >
        <div style={{
          width: 44, height: 44, borderRadius: radius.lg,
          background: 'rgba(99,102,241,0.12)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
        }}>
          <Server size={22} style={{ color: '#6366f1' }} />
        </div>
        <div>
          <div style={{ fontWeight: fontWeight.semibold, marginBottom: spacing.xs, fontSize: fontSize.sm }}>
            Hosted on a Server
          </div>
          <div style={{ fontSize: fontSize.xs, color: currentTheme.textMuted, lineHeight: 1.5 }}>
            Cloud VPS, AWS, Railway, DigitalOcean, or any remote server
          </div>
        </div>
      </motion.button>

      <motion.button
        whileHover={{ scale: 1.01, borderColor: currentTheme.accent }}
        whileTap={{ scale: 0.99 }}
        onClick={() => { setHostingType('device'); setStep('choose-platform') }}
        style={cardStyle()}
      >
        <div style={{
          width: 44, height: 44, borderRadius: radius.lg,
          background: 'rgba(34,197,94,0.12)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
        }}>
          <Monitor size={22} style={{ color: '#22c55e' }} />
        </div>
        <div>
          <div style={{ fontWeight: fontWeight.semibold, marginBottom: spacing.xs, fontSize: fontSize.sm }}>
            On My Desktop / Laptop
          </div>
          <div style={{ fontSize: fontSize.xs, color: currentTheme.textMuted, lineHeight: 1.5 }}>
            Running locally on your Mac, Windows PC, or Linux machine
          </div>
        </div>
      </motion.button>
    </div>
  )

  const renderServerGuide = () => (
    <div style={guideContainerStyle}>
      <p style={{ margin: `0 0 ${spacing.lg}`, fontSize: fontSize.sm, color: currentTheme.textMuted, lineHeight: 1.6 }}>
        Since your agent is on a cloud server, it already has a public URL. Here's how to get the info you need:
      </p>

      <div style={stepRowStyle}>
        <span style={stepNumberStyle}>1</span>
        <div>
          <div style={{ color: currentTheme.text, fontWeight: fontWeight.medium, marginBottom: spacing.xs }}>
            Ask your agent for its connection details
          </div>
          <p style={{ margin: 0 }}>
            Message your agent in Telegram, WhatsApp, or wherever you chat with it and ask:
          </p>
          <code style={{ ...codeBlockStyle, cursor: 'text' }}>
            What's my gateway URL and gateway token?
          </code>
        </div>
      </div>

      <div style={stepRowStyle}>
        <span style={stepNumberStyle}>2</span>
        <div>
          <div style={{ color: currentTheme.text, fontWeight: fontWeight.medium, marginBottom: spacing.xs }}>
            Or find it in your config
          </div>
          <p style={{ margin: 0 }}>
            Check your OpenClaw gateway config file. The URL is typically your server's
            address with port <code style={inlineCodeStyle}>18789</code> (e.g.,{' '}
            <code style={inlineCodeStyle}>https://your-server.com:18789</code>).
            The token is in the <code style={inlineCodeStyle}>auth.token</code> field of your gateway config.
          </p>
        </div>
      </div>

      <div style={stepRowStyle}>
        <span style={stepNumberStyle}>3</span>
        <div>
          <div style={{ color: currentTheme.text, fontWeight: fontWeight.medium }}>
            That's it — continue to enter your details
          </div>
        </div>
      </div>

      <motion.button
        whileHover={{ scale: 1.02 }}
        whileTap={{ scale: 0.98 }}
        onClick={() => setStep('connect-form')}
        style={{
          width: '100%', marginTop: spacing.md,
          padding: `${spacing.md} ${spacing.lg}`,
          background: currentTheme.accentGradient,
          border: 'none', borderRadius: radius.md,
          color: '#fff', fontSize: fontSize.sm, fontWeight: fontWeight.semibold,
          cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: spacing.sm,
        }}
      >
        I have my details — Continue
      </motion.button>
    </div>
  )

  const renderChoosePlatform = () => (
    <div style={{ display: 'flex', flexDirection: 'column', gap: spacing.md }}>
      <p style={{ margin: 0, fontSize: fontSize.sm, color: currentTheme.textMuted, lineHeight: 1.6 }}>
        Select your operating system for setup instructions:
      </p>

      {[
        { id: 'macos' as Platform, label: 'macOS', sub: 'MacBook, iMac, Mac Mini, Mac Pro', icon: <Apple size={20} />, color: '#a3a3a3' },
        { id: 'windows' as Platform, label: 'Windows', sub: 'Windows 10 / 11', icon: <Monitor size={20} />, color: '#0ea5e9' },
        { id: 'linux' as Platform, label: 'Linux', sub: 'Ubuntu, Debian, Fedora, Arch, etc.', icon: <Terminal size={20} />, color: '#f97316' },
      ].map(p => (
        <motion.button
          key={p.id}
          whileHover={{ scale: 1.01, borderColor: currentTheme.accent }}
          whileTap={{ scale: 0.99 }}
          onClick={() => { setPlatform(p.id); setStep('platform-guide') }}
          style={cardStyle()}
        >
          <div style={{
            width: 40, height: 40, borderRadius: radius.md,
            background: `${p.color}18`,
            display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
            color: p.color,
          }}>
            {p.icon}
          </div>
          <div>
            <div style={{ fontWeight: fontWeight.semibold, fontSize: fontSize.sm }}>{p.label}</div>
            <div style={{ fontSize: fontSize.xs, color: currentTheme.textMuted }}>{p.sub}</div>
          </div>
        </motion.button>
      ))}

      <div style={{ borderTop: `1px solid ${currentTheme.border}`, margin: `${spacing.sm} 0`, opacity: 0.4 }} />

      <p style={{ margin: 0, fontSize: fontSize.xs, color: currentTheme.textMuted, fontWeight: fontWeight.medium }}>
        Coming Soon
      </p>

      {[
        { id: 'ios' as Platform, label: 'iOS', sub: 'iPhone & iPad — coming soon', icon: <Smartphone size={20} />, color: '#6366f1' },
        { id: 'android' as Platform, label: 'Android', sub: 'Android phones & tablets — coming soon', icon: <Smartphone size={20} />, color: '#22c55e' },
      ].map(p => (
        <div key={p.id} style={cardStyle(true)}>
          <div style={{
            width: 40, height: 40, borderRadius: radius.md,
            background: `${p.color}18`,
            display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
            color: p.color, opacity: 0.5,
          }}>
            {p.icon}
          </div>
          <div>
            <div style={{ fontWeight: fontWeight.semibold, fontSize: fontSize.sm }}>{p.label}</div>
            <div style={{ fontSize: fontSize.xs, color: currentTheme.textMuted }}>{p.sub}</div>
          </div>
        </div>
      ))}
    </div>
  )

  const renderPlatformGuide = () => {
    const guides: Record<string, React.ReactNode> = {
      macos: (
        <>
          <div style={stepRowStyle}>
            <span style={stepNumberStyle}>1</span>
            <div>
              <div style={{ color: currentTheme.text, fontWeight: fontWeight.medium, marginBottom: spacing.xs }}>
                Create a free Cloudflare account
              </div>
              <p style={{ margin: 0 }}>
                Go to{' '}
                <a href="https://dash.cloudflare.com/sign-up" target="_blank" rel="noopener noreferrer" style={linkStyle}>
                  dash.cloudflare.com/sign-up
                </a>{' '}
                and create a free account. This gives you a permanent URL that never changes.
              </p>
            </div>
          </div>

          <div style={stepRowStyle}>
            <span style={stepNumberStyle}>2</span>
            <div>
              <div style={{ color: currentTheme.text, fontWeight: fontWeight.medium, marginBottom: spacing.xs }}>
                Install Cloudflare Tunnel
              </div>
              <p style={{ margin: `0 0 ${spacing.xs}` }}>
                Open <strong style={{ color: currentTheme.text }}>Terminal</strong> and run:
              </p>
              <code style={codeBlockStyle}>brew install cloudflared</code>
              <p style={{ margin: `${spacing.sm} 0 0`, fontSize: '11px' }}>
                Don't have Homebrew?{' '}
                <a href="https://brew.sh" target="_blank" rel="noopener noreferrer" style={linkStyle}>
                  Install it here
                </a>
                {' '}first, or{' '}
                <a href="https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/downloads/" target="_blank" rel="noopener noreferrer" style={linkStyle}>
                  download cloudflared directly
                </a>.
              </p>
            </div>
          </div>

          <div style={stepRowStyle}>
            <span style={stepNumberStyle}>3</span>
            <div>
              <div style={{ color: currentTheme.text, fontWeight: fontWeight.medium, marginBottom: spacing.xs }}>
                Log in to Cloudflare from your terminal
              </div>
              <p style={{ margin: `0 0 ${spacing.xs}` }}>
                This links your machine to your Cloudflare account (one-time step):
              </p>
              <code style={codeBlockStyle}>cloudflared login</code>
              <p style={{ margin: `${spacing.sm} 0 0`, fontSize: '11px' }}>
                A browser window will open — select your Cloudflare account and authorize.
              </p>
            </div>
          </div>

          <div style={stepRowStyle}>
            <span style={stepNumberStyle}>4</span>
            <div>
              <div style={{ color: currentTheme.text, fontWeight: fontWeight.medium, marginBottom: spacing.xs }}>
                Create a named tunnel
              </div>
              <p style={{ margin: `0 0 ${spacing.xs}` }}>
                Pick any name you like (e.g. "my-agent"):
              </p>
              <code style={codeBlockStyle}>cloudflared tunnel create my-agent</code>
              <p style={{ margin: `${spacing.sm} 0 0`, fontSize: '11px' }}>
                This creates a permanent tunnel with a fixed ID. Write down the tunnel UUID it prints.
              </p>
            </div>
          </div>

          <div style={stepRowStyle}>
            <span style={stepNumberStyle}>5</span>
            <div>
              <div style={{ color: currentTheme.text, fontWeight: fontWeight.medium, marginBottom: spacing.xs }}>
                Make sure your OpenClaw agent is running
              </div>
              <p style={{ margin: 0 }}>
                Your agent's gateway should already be running on port{' '}
                <code style={inlineCodeStyle}>18789</code> (the default). If you're not sure, check that you can chat with it in Telegram or your terminal.
              </p>
            </div>
          </div>

          <div style={stepRowStyle}>
            <span style={stepNumberStyle}>6</span>
            <div>
              <div style={{ color: currentTheme.text, fontWeight: fontWeight.medium, marginBottom: spacing.xs }}>
                Start the tunnel
              </div>
              <code style={codeBlockStyle}>cloudflared tunnel run --url http://localhost:18789 my-agent</code>
              <p style={{ margin: `${spacing.sm} 0 0` }}>
                Your permanent URL will be:{' '}
                <code style={inlineCodeStyle}>https://TUNNEL_UUID.cfargotunnel.com</code>
              </p>
            </div>
          </div>

          <div style={stepRowStyle}>
            <span style={stepNumberStyle}>7</span>
            <div>
              <div style={{ color: currentTheme.text, fontWeight: fontWeight.medium, marginBottom: spacing.xs }}>
                (Recommended) Install as a service
              </div>
              <p style={{ margin: `0 0 ${spacing.xs}` }}>
                So the tunnel auto-starts on boot and survives reboots:
              </p>
              <code style={codeBlockStyle}>sudo cloudflared service install</code>
            </div>
          </div>

          <div style={stepRowStyle}>
            <span style={stepNumberStyle}>8</span>
            <div>
              <div style={{ color: currentTheme.text, fontWeight: fontWeight.medium, marginBottom: spacing.xs }}>
                Get your gateway token
              </div>
              <p style={{ margin: 0 }}>
                Ask your agent in Telegram or WhatsApp:{' '}
                <code style={inlineCodeStyle}>What's my gateway token?</code>{' '}
                Or find it in your OpenClaw gateway config file under{' '}
                <code style={inlineCodeStyle}>auth.token</code>.
              </p>
            </div>
          </div>
        </>
      ),

      windows: (
        <>
          <div style={stepRowStyle}>
            <span style={stepNumberStyle}>1</span>
            <div>
              <div style={{ color: currentTheme.text, fontWeight: fontWeight.medium, marginBottom: spacing.xs }}>
                Create a free Cloudflare account
              </div>
              <p style={{ margin: 0 }}>
                Go to{' '}
                <a href="https://dash.cloudflare.com/sign-up" target="_blank" rel="noopener noreferrer" style={linkStyle}>
                  dash.cloudflare.com/sign-up
                </a>{' '}
                and create a free account. This gives you a permanent URL that never changes.
              </p>
            </div>
          </div>

          <div style={stepRowStyle}>
            <span style={stepNumberStyle}>2</span>
            <div>
              <div style={{ color: currentTheme.text, fontWeight: fontWeight.medium, marginBottom: spacing.xs }}>
                Install Cloudflare Tunnel
              </div>
              <p style={{ margin: 0 }}>
                Download the Windows installer from the{' '}
                <a href="https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/downloads/" target="_blank" rel="noopener noreferrer" style={linkStyle}>
                  Cloudflare Tunnel downloads page
                </a>{' '}
                and run it.
              </p>
              <p style={{ margin: `${spacing.sm} 0 0` }}>
                Or install via <strong style={{ color: currentTheme.text }}>winget</strong>:
              </p>
              <code style={codeBlockStyle}>winget install Cloudflare.cloudflared</code>
            </div>
          </div>

          <div style={stepRowStyle}>
            <span style={stepNumberStyle}>3</span>
            <div>
              <div style={{ color: currentTheme.text, fontWeight: fontWeight.medium, marginBottom: spacing.xs }}>
                Log in to Cloudflare from your terminal
              </div>
              <p style={{ margin: `0 0 ${spacing.xs}` }}>
                Open <strong style={{ color: currentTheme.text }}>PowerShell</strong> and run:
              </p>
              <code style={codeBlockStyle}>cloudflared login</code>
              <p style={{ margin: `${spacing.sm} 0 0`, fontSize: '11px' }}>
                A browser window will open — select your Cloudflare account and authorize.
              </p>
            </div>
          </div>

          <div style={stepRowStyle}>
            <span style={stepNumberStyle}>4</span>
            <div>
              <div style={{ color: currentTheme.text, fontWeight: fontWeight.medium, marginBottom: spacing.xs }}>
                Create a named tunnel
              </div>
              <p style={{ margin: `0 0 ${spacing.xs}` }}>
                Pick any name you like (e.g. "my-agent"):
              </p>
              <code style={codeBlockStyle}>cloudflared tunnel create my-agent</code>
              <p style={{ margin: `${spacing.sm} 0 0`, fontSize: '11px' }}>
                This creates a permanent tunnel with a fixed ID. Write down the tunnel UUID it prints.
              </p>
            </div>
          </div>

          <div style={stepRowStyle}>
            <span style={stepNumberStyle}>5</span>
            <div>
              <div style={{ color: currentTheme.text, fontWeight: fontWeight.medium, marginBottom: spacing.xs }}>
                Make sure your OpenClaw agent is running
              </div>
              <p style={{ margin: 0 }}>
                Your agent's gateway should already be running on port{' '}
                <code style={inlineCodeStyle}>18789</code> (the default). If you're not sure, check that you can chat with it in Telegram or your terminal.
              </p>
            </div>
          </div>

          <div style={stepRowStyle}>
            <span style={stepNumberStyle}>6</span>
            <div>
              <div style={{ color: currentTheme.text, fontWeight: fontWeight.medium, marginBottom: spacing.xs }}>
                Start the tunnel
              </div>
              <code style={codeBlockStyle}>cloudflared tunnel run --url http://localhost:18789 my-agent</code>
              <p style={{ margin: `${spacing.sm} 0 0` }}>
                Your permanent URL will be:{' '}
                <code style={inlineCodeStyle}>https://TUNNEL_UUID.cfargotunnel.com</code>
              </p>
            </div>
          </div>

          <div style={stepRowStyle}>
            <span style={stepNumberStyle}>7</span>
            <div>
              <div style={{ color: currentTheme.text, fontWeight: fontWeight.medium, marginBottom: spacing.xs }}>
                (Recommended) Install as a Windows service
              </div>
              <p style={{ margin: `0 0 ${spacing.xs}` }}>
                So the tunnel auto-starts on boot (run PowerShell as Administrator):
              </p>
              <code style={codeBlockStyle}>cloudflared service install</code>
            </div>
          </div>

          <div style={stepRowStyle}>
            <span style={stepNumberStyle}>8</span>
            <div>
              <div style={{ color: currentTheme.text, fontWeight: fontWeight.medium, marginBottom: spacing.xs }}>
                Get your gateway token
              </div>
              <p style={{ margin: 0 }}>
                Ask your agent in Telegram or WhatsApp:{' '}
                <code style={inlineCodeStyle}>What's my gateway token?</code>{' '}
                Or find it in your OpenClaw gateway config file under{' '}
                <code style={inlineCodeStyle}>auth.token</code>.
              </p>
            </div>
          </div>
        </>
      ),

      linux: (
        <>
          <div style={stepRowStyle}>
            <span style={stepNumberStyle}>1</span>
            <div>
              <div style={{ color: currentTheme.text, fontWeight: fontWeight.medium, marginBottom: spacing.xs }}>
                Create a free Cloudflare account
              </div>
              <p style={{ margin: 0 }}>
                Go to{' '}
                <a href="https://dash.cloudflare.com/sign-up" target="_blank" rel="noopener noreferrer" style={linkStyle}>
                  dash.cloudflare.com/sign-up
                </a>{' '}
                and create a free account. This gives you a permanent URL that never changes.
              </p>
            </div>
          </div>

          <div style={stepRowStyle}>
            <span style={stepNumberStyle}>2</span>
            <div>
              <div style={{ color: currentTheme.text, fontWeight: fontWeight.medium, marginBottom: spacing.xs }}>
                Install Cloudflare Tunnel
              </div>
              <p style={{ margin: `0 0 ${spacing.xs}` }}>
                Open your terminal and run:
              </p>
              <code style={codeBlockStyle}>
                # Debian / Ubuntu{'\n'}
                curl -L https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64.deb -o cloudflared.deb{'\n'}
                sudo dpkg -i cloudflared.deb
              </code>
              <code style={{ ...codeBlockStyle, marginTop: spacing.sm }}>
                # Fedora / RHEL{'\n'}
                curl -L https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64.rpm -o cloudflared.rpm{'\n'}
                sudo rpm -i cloudflared.rpm
              </code>
              <p style={{ margin: `${spacing.sm} 0 0`, fontSize: '11px' }}>
                Other distros:{' '}
                <a href="https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/downloads/" target="_blank" rel="noopener noreferrer" style={linkStyle}>
                  see all download options
                </a>
              </p>
            </div>
          </div>

          <div style={stepRowStyle}>
            <span style={stepNumberStyle}>3</span>
            <div>
              <div style={{ color: currentTheme.text, fontWeight: fontWeight.medium, marginBottom: spacing.xs }}>
                Log in to Cloudflare from your terminal
              </div>
              <code style={codeBlockStyle}>cloudflared login</code>
              <p style={{ margin: `${spacing.sm} 0 0`, fontSize: '11px' }}>
                A browser window will open — select your Cloudflare account and authorize.
              </p>
            </div>
          </div>

          <div style={stepRowStyle}>
            <span style={stepNumberStyle}>4</span>
            <div>
              <div style={{ color: currentTheme.text, fontWeight: fontWeight.medium, marginBottom: spacing.xs }}>
                Create a named tunnel
              </div>
              <p style={{ margin: `0 0 ${spacing.xs}` }}>
                Pick any name you like (e.g. "my-agent"):
              </p>
              <code style={codeBlockStyle}>cloudflared tunnel create my-agent</code>
              <p style={{ margin: `${spacing.sm} 0 0`, fontSize: '11px' }}>
                This creates a permanent tunnel with a fixed ID. Write down the tunnel UUID it prints.
              </p>
            </div>
          </div>

          <div style={stepRowStyle}>
            <span style={stepNumberStyle}>5</span>
            <div>
              <div style={{ color: currentTheme.text, fontWeight: fontWeight.medium, marginBottom: spacing.xs }}>
                Make sure your OpenClaw agent is running
              </div>
              <p style={{ margin: 0 }}>
                Your agent's gateway should already be running on port{' '}
                <code style={inlineCodeStyle}>18789</code>. Verify by checking that you can chat with it via Telegram or terminal.
              </p>
            </div>
          </div>

          <div style={stepRowStyle}>
            <span style={stepNumberStyle}>6</span>
            <div>
              <div style={{ color: currentTheme.text, fontWeight: fontWeight.medium, marginBottom: spacing.xs }}>
                Start the tunnel
              </div>
              <code style={codeBlockStyle}>cloudflared tunnel run --url http://localhost:18789 my-agent</code>
              <p style={{ margin: `${spacing.sm} 0 0` }}>
                Your permanent URL will be:{' '}
                <code style={inlineCodeStyle}>https://TUNNEL_UUID.cfargotunnel.com</code>
              </p>
            </div>
          </div>

          <div style={stepRowStyle}>
            <span style={stepNumberStyle}>7</span>
            <div>
              <div style={{ color: currentTheme.text, fontWeight: fontWeight.medium, marginBottom: spacing.xs }}>
                (Recommended) Install as a system service
              </div>
              <p style={{ margin: `0 0 ${spacing.xs}` }}>
                So the tunnel auto-starts on boot and survives reboots:
              </p>
              <code style={codeBlockStyle}>sudo cloudflared service install</code>
            </div>
          </div>

          <div style={stepRowStyle}>
            <span style={stepNumberStyle}>8</span>
            <div>
              <div style={{ color: currentTheme.text, fontWeight: fontWeight.medium, marginBottom: spacing.xs }}>
                Get your gateway token
              </div>
              <p style={{ margin: 0 }}>
                Ask your agent in Telegram or WhatsApp:{' '}
                <code style={inlineCodeStyle}>What's my gateway token?</code>{' '}
                Or find it in your OpenClaw config under{' '}
                <code style={inlineCodeStyle}>auth.token</code>.
              </p>
            </div>
          </div>
        </>
      ),

      ios: (
        <div style={{ textAlign: 'center', padding: `${spacing['3xl']} 0` }}>
          <Smartphone size={36} style={{ color: currentTheme.textMuted, opacity: 0.4, marginBottom: spacing.lg }} />
          <p style={{ color: currentTheme.text, fontWeight: fontWeight.semibold, fontSize: fontSize.sm, margin: `0 0 ${spacing.sm}` }}>
            iOS Support Coming Soon
          </p>
          <p style={{ color: currentTheme.textMuted, fontSize: fontSize.xs, lineHeight: 1.6, margin: 0, maxWidth: 320, marginLeft: 'auto', marginRight: 'auto' }}>
            We're working on allowing you to run and connect OpenClaw agents directly from your iPhone or iPad. Stay tuned for updates!
          </p>
        </div>
      ),

      android: (
        <div style={{ textAlign: 'center', padding: `${spacing['3xl']} 0` }}>
          <Smartphone size={36} style={{ color: currentTheme.textMuted, opacity: 0.4, marginBottom: spacing.lg }} />
          <p style={{ color: currentTheme.text, fontWeight: fontWeight.semibold, fontSize: fontSize.sm, margin: `0 0 ${spacing.sm}` }}>
            Android Support Coming Soon
          </p>
          <p style={{ color: currentTheme.textMuted, fontSize: fontSize.xs, lineHeight: 1.6, margin: 0, maxWidth: 320, marginLeft: 'auto', marginRight: 'auto' }}>
            We're working on allowing you to run and connect OpenClaw agents directly from your Android device. Stay tuned for updates!
          </p>
        </div>
      ),
    }

    const isComingSoon = platform === 'ios' || platform === 'android'

    return (
      <div style={guideContainerStyle}>
        {guides[platform || ''] || null}

        {!isComingSoon && (
          <>
            <div style={{
              marginTop: spacing.md, padding: spacing.lg,
              background: 'rgba(99,102,241,0.06)',
              borderRadius: radius.md, border: '1px solid rgba(99,102,241,0.15)',
              fontSize: fontSize.xs, color: currentTheme.textMuted, lineHeight: 1.6,
            }}>
              <strong style={{ color: currentTheme.text }}>Tip:</strong> Installing as a service (step 7) means your tunnel
              starts automatically when your computer boots — you never have to think about it again. Your URL is permanent and will
              never change.{' '}
              <a href="https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/get-started/" target="_blank" rel="noopener noreferrer" style={linkStyle}>
                Learn more about Cloudflare Tunnel
              </a>
            </div>

            <motion.button
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              onClick={() => setStep('connect-form')}
              style={{
                width: '100%', marginTop: spacing.lg,
                padding: `${spacing.md} ${spacing.lg}`,
                background: currentTheme.accentGradient,
                border: 'none', borderRadius: radius.md,
                color: '#fff', fontSize: fontSize.sm, fontWeight: fontWeight.semibold,
                cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: spacing.sm,
              }}
            >
              I'm ready — Enter my connection details
            </motion.button>
          </>
        )}
      </div>
    )
  }

  const renderConnectForm = () => (
    <div style={{ display: 'flex', flexDirection: 'column', gap: spacing.lg }}>
      <div>
        <label style={labelStyle}>Agent Name</label>
        <input
          type="text" value={name} onChange={e => setName(e.target.value)}
          onFocus={() => setFocusedInput('name')} onBlur={() => setFocusedInput(null)}
          placeholder="e.g. My Research Assistant" maxLength={100}
          style={getInputStyle('name')}
        />
      </div>

      <div>
        <label style={labelStyle}>Gateway URL</label>
        <input
          type="text" value={gatewayUrl}
          onChange={e => { setGatewayUrl(e.target.value); setTestStatus('idle') }}
          onFocus={() => setFocusedInput('gatewayUrl')} onBlur={() => setFocusedInput(null)}
          placeholder={hostingType === 'server' ? 'https://your-server.com:18789' : 'https://your-tunnel-id.cfargotunnel.com'}
          style={getInputStyle('gatewayUrl')}
        />
      </div>

      <div>
        <label style={labelStyle}>Gateway Token</label>
        <input
          type="password" value={gatewayToken}
          onChange={e => { setGatewayToken(e.target.value); setTestStatus('idle') }}
          onFocus={() => setFocusedInput('gatewayToken')} onBlur={() => setFocusedInput(null)}
          placeholder="Your gateway auth token"
          style={getInputStyle('gatewayToken')}
        />
      </div>

      {/* Test connection */}
      <div>
        <motion.button
          whileHover={{ scale: canTest ? 1.02 : 1 }}
          whileTap={{ scale: canTest ? 0.98 : 1 }}
          onClick={handleTest}
          disabled={!canTest || testStatus === 'testing'}
          style={{
            width: '100%', padding: `${spacing.sm} ${spacing.md}`,
            background: testStatus === 'success' ? 'rgba(34,197,94,0.15)' : currentTheme.backgroundOverlay,
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

      {/* Pricing hint */}
      {requiresPayment && canSave && agentLimits && (
        <div style={{
          padding: `${spacing.sm} ${spacing.md}`,
          background: 'rgba(234,179,8,0.06)', borderRadius: radius.md,
          border: '1px solid rgba(234,179,8,0.15)',
          fontSize: fontSize.xs, color: currentTheme.textMuted, lineHeight: 1.5,
        }}>
          This will be an extra agent at ${agentLimits.extraAgentPrice.toFixed(2)}/mo ({agentLimits.included} included with your plan).
        </div>
      )}
    </div>
  )

  const renderBilling = () => (
    <div>
      {agentLimits && (
        <div style={{
          padding: spacing.xl,
          background: 'rgba(234,179,8,0.08)', borderRadius: radius.lg,
          border: '1px solid rgba(234,179,8,0.25)',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: spacing.sm, marginBottom: spacing.md }}>
            <DollarSign size={18} style={{ color: '#eab308' }} />
            <span style={{ fontSize: fontSize.sm, fontWeight: fontWeight.semibold, color: currentTheme.text }}>
              Extra Agent Add-on
            </span>
          </div>
          <p style={{ fontSize: fontSize.xs, color: currentTheme.textMuted, lineHeight: 1.6, margin: `0 0 ${spacing.sm}` }}>
            You've used all {agentLimits.included} agent{agentLimits.included !== 1 ? 's' : ''} included
            with your plan. Adding this agent will cost an additional
            <strong style={{ color: currentTheme.text }}> ${agentLimits.extraAgentPrice.toFixed(2)}/month</strong>,
            prorated to your current billing cycle.
          </p>
          {agentLimits.paidExtras > 0 && (
            <p style={{ fontSize: fontSize.xs, color: currentTheme.textMuted, margin: 0, lineHeight: 1.5 }}>
              You currently have {agentLimits.paidExtras} extra agent{agentLimits.paidExtras !== 1 ? 's' : ''} at ${agentLimits.extrasCost.toFixed(2)}/mo.
              This will bring your total to ${(agentLimits.extrasCost + agentLimits.extraAgentPrice).toFixed(2)}/mo for extras.
            </p>
          )}
          {billingInProgress && (
            <p style={{ fontSize: fontSize.xs, color: '#eab308', margin: `${spacing.sm} 0 0` }}>
              Setting up billing...
            </p>
          )}
        </div>
      )}
    </div>
  )

  const showFooterActions = step !== 'choose-hosting' && step !== 'choose-platform'
  const showConnectButton = step === 'connect-form' || step === 'billing'

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
          width: '100%', maxWidth: 560,
          maxHeight: '90vh',
          background: currentTheme.background,
          borderRadius: radius.xl, border: `1px solid ${currentTheme.border}`,
          boxShadow: '0 24px 48px rgba(0,0,0,0.3)',
          overflow: 'hidden',
          display: 'flex', flexDirection: 'column',
        }}
      >
        {/* Header */}
        <div style={{
          padding: `${spacing.lg} ${spacing.xl}`,
          borderBottom: `1px solid ${currentTheme.border}`,
          display: 'flex', alignItems: 'center', gap: spacing.md,
          flexShrink: 0,
        }}>
          {step !== 'choose-hosting' && (
            <motion.button
              whileHover={{ scale: 1.1 }}
              whileTap={{ scale: 0.9 }}
              onClick={goBack}
              style={{
                width: 32, height: 32, borderRadius: radius.md,
                background: currentTheme.backgroundOverlay, border: `1px solid ${currentTheme.border}`,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                cursor: 'pointer', color: currentTheme.textMuted, flexShrink: 0,
              }}
            >
              <ChevronLeft size={16} />
            </motion.button>
          )}
          <h3 style={{
            margin: 0, fontSize: fontSize.lg, fontWeight: fontWeight.semibold,
            color: currentTheme.text, flex: 1,
          }}>
            {getStepTitle()}
          </h3>
          <motion.button
            whileHover={{ scale: 1.1 }}
            whileTap={{ scale: 0.9 }}
            onClick={() => setShowConnectAgentModal(false)}
            style={{
              width: 32, height: 32, borderRadius: radius.md,
              background: 'transparent', border: 'none',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              cursor: 'pointer', color: currentTheme.textMuted, flexShrink: 0,
            }}
          >
            <X size={18} />
          </motion.button>
        </div>

        {/* Body */}
        <div style={{ padding: spacing.xl, overflowY: 'auto', flex: 1 }}>
          <AnimatePresence mode="wait">
            <motion.div
              key={step + (platform || '')}
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              transition={{ duration: 0.2 }}
            >
              {step === 'choose-hosting' && renderChooseHosting()}
              {step === 'server-guide' && renderServerGuide()}
              {step === 'choose-platform' && renderChoosePlatform()}
              {step === 'platform-guide' && renderPlatformGuide()}
              {step === 'connect-form' && renderConnectForm()}
              {step === 'billing' && renderBilling()}
            </motion.div>
          </AnimatePresence>
        </div>

        {/* Footer */}
        {showFooterActions && (
          <div style={{
            padding: `${spacing.md} ${spacing.xl} ${spacing.lg}`,
            borderTop: `1px solid ${currentTheme.border}`,
            display: 'flex', justifyContent: 'flex-end', gap: spacing.sm,
            flexShrink: 0,
          }}>
            {step === 'billing' && (
              <motion.button
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                onClick={() => setStep('connect-form')}
                style={{
                  padding: `${spacing.sm} ${spacing.lg}`,
                  background: 'transparent', border: `1px solid ${currentTheme.border}`,
                  borderRadius: radius.md, color: currentTheme.textMuted,
                  fontSize: fontSize.sm, cursor: 'pointer',
                }}
              >
                Back
              </motion.button>
            )}
            {showConnectButton && (
              <>
                <motion.button
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  onClick={() => setShowConnectAgentModal(false)}
                  style={{
                    padding: `${spacing.sm} ${spacing.lg}`,
                    background: 'transparent', border: `1px solid ${currentTheme.border}`,
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
                    border: 'none', borderRadius: radius.md,
                    color: canSave ? '#fff' : currentTheme.textMuted,
                    fontSize: fontSize.sm, fontWeight: fontWeight.semibold,
                    cursor: canSave ? 'pointer' : 'not-allowed',
                    opacity: canSave ? 1 : 0.5,
                  }}
                >
                  {saving
                    ? (billingInProgress ? 'Setting up billing...' : 'Saving...')
                    : step === 'billing'
                      ? `Confirm & Connect ($${agentLimits?.extraAgentPrice.toFixed(2)}/mo)`
                      : 'Connect Agent'}
                </motion.button>
              </>
            )}
          </div>
        )}
      </motion.div>
    </motion.div>
  )
}

export default ConnectAgentModal
