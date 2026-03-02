import React, { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { 
  Zap, Brain, Globe, Trophy, Shield, CreditCard, 
  ArrowRight, ChevronDown, ChevronUp, MessageSquare, BarChart3, 
  Search, Users, Check, CheckCircle, Swords, Heart, UserPlus,
  Flame, Award, Star, Clock, BookOpen, Lock, Eye,
  TrendingUp, Target, Scale, Lightbulb, Compass, Gauge, Gift
} from 'lucide-react'
import { getTheme } from '../utils/theme'
import { spacing, fontSize, fontWeight, radius, zIndex, transition, layout, sx, createStyles } from '../utils/styles'

interface LandingPageProps {
  onNavigate: (page: string, plan?: string) => void
}

const LandingPage = ({ onNavigate }: LandingPageProps) => {
  const currentTheme = getTheme('dark')
  const s = createStyles(currentTheme)
  const [hoveredFeature, setHoveredFeature] = useState<string | null>(null)
  const [showBackToTop, setShowBackToTop] = useState(false)
  const [activeDebateRole, setActiveDebateRole] = useState(0)
  const [hoveredDebateRole, setHoveredDebateRole] = useState<number | null>(null)

  useEffect(() => {
    document.body.style.overflowY = 'auto'
    document.body.style.overflowX = 'hidden'
    document.getElementById('root')!.style.overflowY = 'auto'
    document.getElementById('root')!.style.overflowX = 'hidden'
    document.getElementById('root')!.style.height = 'auto'
    return () => {
      document.body.style.overflowY = 'hidden'
      document.body.style.overflowX = 'hidden'
      document.getElementById('root')!.style.overflowY = 'hidden'
      document.getElementById('root')!.style.overflowX = 'hidden'
      document.getElementById('root')!.style.height = '100vh'
    }
  }, [])

  useEffect(() => {
    const handleScroll = () => {
      const scrollTop = window.scrollY || document.documentElement.scrollTop || document.body.scrollTop || 0
      setShowBackToTop(scrollTop > 300)
    }
    window.addEventListener('scroll', handleScroll, { passive: true })
    return () => window.removeEventListener('scroll', handleScroll)
  }, [])

  useEffect(() => {
    const interval = setInterval(() => {
      setActiveDebateRole((prev) => (prev + 1) % debateRoles.length)
    }, 3000)
    return () => clearInterval(interval)
  }, [])

  const coreFeatures = [
    {
      icon: <Brain size={32} />,
      title: 'Council of LLMs',
      description: 'Select any combination of AI models from ChatGPT, Claude, Gemini, and Grok. Send a single prompt and watch them all respond side by side in real time — compare reasoning, style, and accuracy across 12+ models from 4 providers.',
    },
    {
      icon: <Swords size={32} />,
      title: 'General & Debate Modes',
      description: 'Switch between two modes right from the prompt box. General mode gives you straightforward answers from every model. Debate mode lets you assign each model a unique role — like Optimist, Skeptic, or Risk Analyst — so they argue from different perspectives.',
    },
    // DISABLED: Prompt Feed feature temporarily removed (social media feature)
    // {
    //   icon: <Globe size={32} />,
    //   title: 'Prompt Feed',
    //   description: '...',
    // },
    {
      icon: <Trophy size={32} />,
      title: 'Rewards & Monthly Gifts',
      description: 'Pro subscribers earn badges across multiple categories — Token Titan, Prompt Pioneer, Streak Warrior, and more — each with multiple unlock tiers. Maintain daily streaks, level up, and receive monthly gifts including bonus usage and exclusive badges.',
    },
    {
      icon: <BookOpen size={32} />,
      title: 'Advanced Saved History',
      description: 'Every session is automatically saved and organized by year, month, and day. Star important conversations for quick access. Each entry shows the prompt, category, models used, and full token breakdown so you can revisit anything.',
    },
    {
      icon: <BarChart3 size={32} />,
      title: 'Tracking for Everything',
      description: 'Your profile tracks total tokens processed, prompts sent, streak length, badges earned, and usage percentages. Every prompt logs per-model token usage so you always know exactly what you\'re using.',
    },
  ]

  const debateRoles = [
    { key: 'optimist', label: 'Optimist / Advocate', color: '#48c9b0', icon: <Lightbulb size={18} />, desc: 'Champions ideas, highlights benefits and best-case outcomes' },
    { key: 'skeptic', label: "Skeptic / Devil's Advocate", color: '#e74c3c', icon: <Target size={18} />, desc: 'Challenges assumptions, stress-tests ideas, highlights risks' },
    { key: 'neutral', label: 'Neutral Analyst', color: '#5dade2', icon: <Scale size={18} />, desc: 'Balanced, objective analysis weighing both sides' },
    { key: 'realist', label: 'Practical Realist', color: '#f39c12', icon: <Compass size={18} />, desc: 'Focuses on feasibility and real-world constraints' },
    { key: 'risk', label: 'Risk Analyst', color: '#e67e22', icon: <Shield size={18} />, desc: 'Identifies and quantifies potential risks' },
    { key: 'long_term', label: 'Long-Term Thinker', color: '#9b59b6', icon: <TrendingUp size={18} />, desc: 'Evaluates sustainability and future implications' },
    { key: 'short_term', label: 'Short-Term Thinker', color: '#1abc9c', icon: <Zap size={18} />, desc: 'Focuses on immediate impact and quick wins' },
    { key: 'probability', label: 'Probability Estimator', color: '#3498db', icon: <Gauge size={18} />, desc: 'Assigns likelihoods and quantifies uncertainty' },
    { key: 'strategic', label: 'Strategic Advisor', color: '#8e44ad', icon: <Star size={18} />, desc: 'High-level strategy, positioning, and sequencing' },
  ]

  const freePlanFeatures = [
    'Access to all AI models',
    'Very limited usage',
    'Preview badges & rewards (upgrade to earn)',
  ]

  const proPlanFeatures = [
    '7.5x more usage than Free',
    'All models & features',
    'Rewards & badge progression',
    'Daily challenges with usage rewards',
    'Monthly gifts: bonus usage & exclusive badges',
    'Priority support',
  ]

  const premiumPlanFeatures = [
    '25x more usage than Free',
    'All models & features',
    'Rewards & badge progression',
    'Daily challenges with usage rewards',
    'Monthly gifts: bonus usage & exclusive badges',
    'Priority support',
  ]

  return (
    <div style={{
      minHeight: '100vh',
      background: 'linear-gradient(135deg, #0a0a0a 0%, #1a1a2e 50%, #0a0a0a 100%)',
      color: '#ffffff',
      overflowX: 'hidden',
    }}>
      {/* Navigation Bar */}
      <nav style={sx(layout.spaceBetween, {
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        padding: `${spacing.xl} ${spacing['5xl']}`,
        background: 'rgba(0, 0, 0, 0.8)',
        backdropFilter: 'blur(20px)',
        borderBottom: '1px solid rgba(93, 173, 226, 0.1)',
        zIndex: zIndex.modal,
      })}>
        <div
          onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
          style={sx(layout.flexRow, { gap: spacing.lg, cursor: 'pointer' })}
        >
          <span style={sx(s.gradientText, {
            fontSize: fontSize['6xl'],
            fontWeight: fontWeight.bold,
          })}>
            ArkitekAI
          </span>
        </div>
        <div style={{ position: 'absolute', left: '50%', transform: 'translateX(-50%)', display: 'flex', gap: spacing.lg, alignItems: 'center' }}>
          {[
            { label: 'Features', href: '#' },
            { label: 'Shop', href: '#' },
            { label: 'Community', href: '#' },
            { label: 'About', href: '#' },
            { label: 'Blog', href: '#' },
            { label: 'API', href: '#' },
            { label: 'Company', href: '#' },
          ].map((link) => (
            <a
              key={link.label}
              href={link.href}
              onClick={(e) => e.preventDefault()}
              style={{
                padding: `${spacing.md} ${spacing.xl}`,
                color: 'rgba(255, 255, 255, 0.6)',
                fontSize: fontSize.xl,
                textDecoration: 'none',
                borderRadius: radius.md,
                transition: transition.normal,
                cursor: 'default',
              }}
              onMouseEnter={(e) => {
                ;(e.target as HTMLElement).style.color = '#fff'
                ;(e.target as HTMLElement).style.background = 'rgba(255, 255, 255, 0.05)'
              }}
              onMouseLeave={(e) => {
                ;(e.target as HTMLElement).style.color = 'rgba(255, 255, 255, 0.6)'
                ;(e.target as HTMLElement).style.background = 'transparent'
              }}
            >
              {link.label}
            </a>
          ))}
        </div>
        <button
          onClick={() => onNavigate('signin')}
          style={{
            padding: `10px ${spacing['3xl']}`,
            background: 'transparent',
            border: `1px solid ${currentTheme.border}`,
            borderRadius: radius.md,
            color: currentTheme.text,
            fontSize: fontSize.xl,
            cursor: 'pointer',
            transition: transition.normal,
          }}
          onMouseEnter={(e) => {
            ;(e.target as HTMLElement).style.borderColor = currentTheme.accent
            ;(e.target as HTMLElement).style.background = 'rgba(93, 173, 226, 0.1)'
          }}
          onMouseLeave={(e) => {
            ;(e.target as HTMLElement).style.borderColor = currentTheme.border
            ;(e.target as HTMLElement).style.background = 'transparent'
          }}
        >
          Sign In
        </button>
      </nav>

      {/* Hero Section */}
      <section style={sx(layout.flexCol, {
        minHeight: '100vh',
        alignItems: 'center',
        justifyContent: 'center',
        textAlign: 'center',
        padding: `120px ${spacing['5xl']} 80px`,
        position: 'relative',
      })}>
        <div style={{
          position: 'absolute',
          top: '20%',
          left: '50%',
          transform: 'translateX(-50%)',
          width: '600px',
          height: '600px',
          background: 'radial-gradient(circle, rgba(93, 173, 226, 0.08) 0%, transparent 70%)',
          pointerEvents: 'none',
        }} />

        <motion.div
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8 }}
          style={sx(layout.flexCol, { alignItems: 'center' })}
        >
          <h1 style={{
            fontSize: 'clamp(2.5rem, 6vw, 4.5rem)',
            fontWeight: fontWeight.extrabold,
            lineHeight: 1.1,
            marginBottom: spacing['3xl'],
            maxWidth: '800px',
            textAlign: 'center',
          }}>
            Create Your Council of
            <br />
            <span style={sx(s.gradientText, { fontSize: 'inherit' })}>
              The World's Best AI Models
            </span>
          </h1>

          <p style={{
            fontSize: 'clamp(1rem, 2vw, 1.25rem)',
            color: 'rgba(255, 255, 255, 0.6)',
            maxWidth: '640px',
            lineHeight: 1.6,
            marginBottom: spacing['5xl'],
          }}>
            Send one prompt to ChatGPT, Claude, Gemini, and Grok. Get an AI-powered consensus. 
            Debate ideas with assigned roles. Earn rewards the more you explore.
          </p>

          <div style={sx(layout.flexCol, { gap: spacing.lg, alignItems: 'center' })}>
            <button
              onClick={() => onNavigate('signup')}
              style={sx(layout.center, {
                padding: `14px 32px`,
                background: currentTheme.accentGradient,
                border: 'none',
                borderRadius: radius.xl,
                color: '#fff',
                fontSize: fontSize['3xl'],
                fontWeight: fontWeight.semibold,
                cursor: 'pointer',
                gap: spacing.md,
                transition: transition.normal,
                width: '220px',
              })}
              onMouseEnter={(e) => (e.target as HTMLElement).style.transform = 'translateY(-2px)'}
              onMouseLeave={(e) => (e.target as HTMLElement).style.transform = 'translateY(0)'}
            >
              Sign Up <ArrowRight size={20} />
            </button>
            <button
              onClick={() => {
                document.getElementById('features')?.scrollIntoView({ behavior: 'smooth' })
              }}
              style={sx(layout.center, {
                padding: `14px 32px`,
                background: 'rgba(255, 255, 255, 0.05)',
                border: '1px solid rgba(255, 255, 255, 0.15)',
                borderRadius: radius.xl,
                color: 'rgba(255, 255, 255, 0.8)',
                fontSize: fontSize['3xl'],
                cursor: 'pointer',
                gap: spacing.md,
                transition: transition.normal,
                width: '220px',
              })}
              onMouseEnter={(e) => {
                ;(e.target as HTMLElement).style.background = 'rgba(255, 255, 255, 0.1)'
                ;(e.target as HTMLElement).style.borderColor = 'rgba(255, 255, 255, 0.3)'
              }}
              onMouseLeave={(e) => {
                ;(e.target as HTMLElement).style.background = 'rgba(255, 255, 255, 0.05)'
                ;(e.target as HTMLElement).style.borderColor = 'rgba(255, 255, 255, 0.15)'
              }}
            >
              Learn More <ChevronDown size={20} />
            </button>
          </div>
        </motion.div>
      </section>

      {/* ==================== CORE FEATURES ==================== */}
      <section id="features" style={{
        padding: `100px ${spacing['5xl']}`,
        maxWidth: '1200px',
        margin: '0 auto',
      }}>
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6 }}
          style={{ textAlign: 'center', marginBottom: '60px' }}
        >
          <h2 style={{
            fontSize: 'clamp(1.8rem, 4vw, 2.8rem)',
            fontWeight: fontWeight.bold,
            marginBottom: spacing.xl,
          }}>
            The{' '}
            <span style={sx(s.gradientText, { fontSize: 'inherit' })}>Core Experience</span>
          </h2>
          <p style={{
            color: 'rgba(255, 255, 255, 0.5)',
            fontSize: fontSize['3xl'],
            maxWidth: '650px',
            margin: '0 auto',
            lineHeight: 1.6,
          }}>
            ArkitekAI brings the world's leading AI models together. Ask once, compare everything, and get a synthesized answer — all in one place.
          </p>
        </motion.div>

        <div style={{
          display: 'flex',
          flexWrap: 'wrap',
          justifyContent: 'center',
          gap: spacing['3xl'],
        }}>
          {coreFeatures.map((feature, idx) => (
            <motion.div
              key={idx}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.5, delay: idx * 0.1 }}
              onMouseEnter={() => setHoveredFeature(`core-${idx}`)}
              onMouseLeave={() => setHoveredFeature(null)}
              style={{
                flex: '0 1 340px',
                padding: '32px',
                background: hoveredFeature === `core-${idx}`
                  ? 'rgba(93, 173, 226, 0.06)'
                  : 'rgba(255, 255, 255, 0.02)',
                border: `1px solid ${hoveredFeature === `core-${idx}` ? 'rgba(93, 173, 226, 0.3)' : 'rgba(255, 255, 255, 0.06)'}`,
                borderRadius: radius['2xl'],
                transition: transition.slow,
                cursor: 'default',
              }}
            >
              <div style={sx(layout.center, {
                width: spacing['6xl'],
                height: spacing['6xl'],
                borderRadius: radius.xl,
                background: 'rgba(93, 173, 226, 0.1)',
                color: currentTheme.accent,
                marginBottom: spacing['2xl'],
              })}>
                {feature.icon}
              </div>
              <h3 style={{
                fontSize: fontSize['4xl'],
                fontWeight: fontWeight.semibold,
                marginBottom: '10px',
              }}>
                {feature.title}
              </h3>
              <p style={{
                color: 'rgba(255, 255, 255, 0.5)',
                lineHeight: 1.6,
                fontSize: fontSize.xl,
              }}>
                {feature.description}
              </p>
            </motion.div>
          ))}
        </div>
      </section>

      {/* ==================== PRICING ==================== */}
      <section id="pricing" style={{
        padding: `100px ${spacing['5xl']}`,
        maxWidth: '900px',
        margin: '0 auto',
      }}>
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          style={{ textAlign: 'center', marginBottom: spacing['5xl'] }}
        >
          <h2 style={{
            fontSize: 'clamp(1.8rem, 4vw, 2.8rem)',
            fontWeight: fontWeight.bold,
          }}>
            <span style={sx(s.gradientText, { fontSize: 'inherit' })}>Pricing</span>
          </h2>
        </motion.div>

        <div style={{
          display: 'flex',
          flexDirection: 'row',
          gap: spacing['3xl'],
          maxWidth: '1100px',
          margin: '0 auto',
        }}>
          {/* Free Plan */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            onClick={() => onNavigate('signup', 'free_trial')}
            style={sx(layout.flexCol, {
              flex: 1,
              padding: '32px',
              background: 'rgba(93, 173, 226, 0.05)',
              border: '1px solid rgba(93, 173, 226, 0.2)',
              borderRadius: radius['2xl'],
              cursor: 'pointer',
              textAlign: 'center',
              transition: transition.normal,
              alignItems: 'center',
            })}
            onMouseEnter={(e) => {
              e.currentTarget.style.borderColor = '#5dade2'
              e.currentTarget.style.background = 'rgba(93, 173, 226, 0.1)'
              e.currentTarget.style.transform = 'translateY(-4px)'
              e.currentTarget.style.boxShadow = '0 8px 30px rgba(93, 173, 226, 0.15)'
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.borderColor = 'rgba(93, 173, 226, 0.2)'
              e.currentTarget.style.background = 'rgba(93, 173, 226, 0.05)'
              e.currentTarget.style.transform = 'translateY(0)'
              e.currentTarget.style.boxShadow = 'none'
            }}
          >
            <span style={{
              display: 'inline-block',
              padding: `${spacing.sm} ${spacing.xl}`,
              background: 'rgba(93, 173, 226, 0.15)',
              borderRadius: radius.full,
              fontSize: fontSize.base,
              color: '#5dade2',
              fontWeight: fontWeight.semibold,
              marginBottom: spacing['2xl'],
            }}>
              Free Plan
            </span>
            <div style={{ marginBottom: spacing['2xl'] }}>
              <span style={{ fontSize: fontSize['8xl'], fontWeight: fontWeight.extrabold, color: '#fff' }}>Free</span>
            </div>
            <div style={sx(layout.flexCol, {
              borderTop: '1px solid rgba(255, 255, 255, 0.08)',
              paddingTop: spacing['2xl'],
              paddingBottom: spacing['3xl'],
              width: '100%',
              gap: spacing.lg,
              textAlign: 'left',
            })}>
              {freePlanFeatures.map((feature, idx) => (
                <div key={idx} style={sx(layout.flexRow, { gap: '10px' })}>
                  <CheckCircle size={16} style={{ color: '#5dade2', flexShrink: 0 }} />
                  <span style={{ color: 'rgba(255, 255, 255, 0.6)', fontSize: fontSize.lg }}>{feature}</span>
                </div>
              ))}
            </div>
            <div style={{
              marginTop: 'auto',
              padding: `${spacing.lg} 0`,
              width: '100%',
              background: 'rgba(93, 173, 226, 0.12)',
              borderRadius: radius.lg,
              color: '#5dade2',
              fontWeight: fontWeight.semibold,
              fontSize: fontSize.xl,
            }}>
              Sign Up Free
            </div>
          </motion.div>

          {/* Pro Plan */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ delay: 0.1 }}
            onClick={() => onNavigate('signup', 'pro')}
            style={sx(layout.flexCol, {
              flex: 1,
              padding: '32px',
              background: 'rgba(72, 201, 176, 0.05)',
              border: '1px solid rgba(72, 201, 176, 0.2)',
              borderRadius: radius['2xl'],
              cursor: 'pointer',
              textAlign: 'center',
              transition: transition.normal,
              alignItems: 'center',
              position: 'relative',
            })}
            onMouseEnter={(e) => {
              e.currentTarget.style.borderColor = '#48c9b0'
              e.currentTarget.style.background = 'rgba(72, 201, 176, 0.1)'
              e.currentTarget.style.transform = 'translateY(-4px)'
              e.currentTarget.style.boxShadow = '0 8px 30px rgba(72, 201, 176, 0.15)'
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.borderColor = 'rgba(72, 201, 176, 0.2)'
              e.currentTarget.style.background = 'rgba(72, 201, 176, 0.05)'
              e.currentTarget.style.transform = 'translateY(0)'
              e.currentTarget.style.boxShadow = 'none'
            }}
          >
            <span style={{
              display: 'inline-block',
              padding: `${spacing.sm} ${spacing.xl}`,
              background: 'rgba(72, 201, 176, 0.15)',
              borderRadius: radius.full,
              fontSize: fontSize.base,
              color: '#48c9b0',
              fontWeight: fontWeight.semibold,
              marginBottom: spacing['2xl'],
            }}>
              Pro
            </span>
            <div style={sx(layout.flexRow, { marginBottom: spacing['2xl'], alignItems: 'baseline', gap: spacing.xs })}>
              <span style={{ fontSize: fontSize['8xl'], fontWeight: fontWeight.extrabold, color: '#fff' }}>$19.95</span>
              <span style={{ fontSize: fontSize['2xl'], color: 'rgba(255, 255, 255, 0.4)' }}>/mo</span>
            </div>
            <div style={sx(layout.flexCol, {
              borderTop: '1px solid rgba(255, 255, 255, 0.08)',
              paddingTop: spacing['2xl'],
              paddingBottom: spacing['3xl'],
              width: '100%',
              gap: spacing.lg,
              textAlign: 'left',
            })}>
              {proPlanFeatures.map((feature, idx) => (
                <div key={idx} style={sx(layout.flexRow, { gap: '10px' })}>
                  <CheckCircle size={16} style={{ color: '#48c9b0', flexShrink: 0 }} />
                  <span style={{ color: 'rgba(255, 255, 255, 0.6)', fontSize: fontSize.lg }}>{feature}</span>
                </div>
              ))}
            </div>
            <div style={{
              marginTop: 'auto',
              padding: `${spacing.lg} 0`,
              width: '100%',
              background: 'rgba(72, 201, 176, 0.12)',
              borderRadius: radius.lg,
              color: '#48c9b0',
              fontWeight: fontWeight.semibold,
              fontSize: fontSize.xl,
            }}>
              Subscribe to Pro
            </div>
          </motion.div>

          {/* Premium Plan */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ delay: 0.2 }}
            onClick={() => onNavigate('signup', 'premium')}
            style={sx(layout.flexCol, {
              flex: 1,
              padding: '32px',
              background: 'rgba(187, 143, 255, 0.05)',
              border: '1px solid rgba(187, 143, 255, 0.2)',
              borderRadius: radius['2xl'],
              cursor: 'pointer',
              textAlign: 'center',
              transition: transition.normal,
              alignItems: 'center',
              position: 'relative',
            })}
            onMouseEnter={(e) => {
              e.currentTarget.style.borderColor = '#bb8fff'
              e.currentTarget.style.background = 'rgba(187, 143, 255, 0.1)'
              e.currentTarget.style.transform = 'translateY(-4px)'
              e.currentTarget.style.boxShadow = '0 8px 30px rgba(187, 143, 255, 0.15)'
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.borderColor = 'rgba(187, 143, 255, 0.2)'
              e.currentTarget.style.background = 'rgba(187, 143, 255, 0.05)'
              e.currentTarget.style.transform = 'translateY(0)'
              e.currentTarget.style.boxShadow = 'none'
            }}
          >
            <span style={{
              display: 'inline-block',
              padding: `${spacing.sm} ${spacing.xl}`,
              background: 'rgba(187, 143, 255, 0.15)',
              borderRadius: radius.full,
              fontSize: fontSize.base,
              color: '#bb8fff',
              fontWeight: fontWeight.semibold,
              marginBottom: spacing['2xl'],
            }}>
              Premium
            </span>
            <div style={sx(layout.flexRow, { marginBottom: spacing['2xl'], alignItems: 'baseline', gap: spacing.xs })}>
              <span style={{ fontSize: fontSize['8xl'], fontWeight: fontWeight.extrabold, color: '#fff' }}>$49.95</span>
              <span style={{ fontSize: fontSize['2xl'], color: 'rgba(255, 255, 255, 0.4)' }}>/mo</span>
            </div>
            <div style={sx(layout.flexCol, {
              borderTop: '1px solid rgba(255, 255, 255, 0.08)',
              paddingTop: spacing['2xl'],
              paddingBottom: spacing['3xl'],
              width: '100%',
              gap: spacing.lg,
              textAlign: 'left',
            })}>
              {premiumPlanFeatures.map((feature, idx) => (
                <div key={idx} style={sx(layout.flexRow, { gap: '10px' })}>
                  <CheckCircle size={16} style={{ color: '#bb8fff', flexShrink: 0 }} />
                  <span style={{ color: 'rgba(255, 255, 255, 0.6)', fontSize: fontSize.lg }}>{feature}</span>
                </div>
              ))}
            </div>
            <div style={{
              marginTop: 'auto',
              padding: `${spacing.lg} 0`,
              width: '100%',
              background: 'rgba(187, 143, 255, 0.12)',
              borderRadius: radius.lg,
              color: '#bb8fff',
              fontWeight: fontWeight.semibold,
              fontSize: fontSize.xl,
            }}>
              Subscribe to Premium
            </div>
          </motion.div>
        </div>
      </section>

      {/* ==================== DEBATE MODE ==================== */}
      <section style={{
        padding: `100px ${spacing['5xl']}`,
        background: 'rgba(93, 173, 226, 0.02)',
        borderTop: '1px solid rgba(93, 173, 226, 0.08)',
        borderBottom: '1px solid rgba(93, 173, 226, 0.08)',
      }}>
        <div style={{ maxWidth: '1100px', margin: '0 auto' }}>
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            style={{ textAlign: 'center', marginBottom: '50px' }}
          >
            <div style={sx(layout.flexRow, {
              display: 'inline-flex',
              gap: spacing.md,
              padding: `${spacing.sm} ${spacing.xl}`,
              background: 'rgba(231, 76, 60, 0.1)',
              border: '1px solid rgba(231, 76, 60, 0.2)',
              borderRadius: radius.full,
              marginBottom: spacing['2xl'],
            })}>
              <Swords size={14} style={{ color: '#e74c3c' }} />
              <span style={{ color: '#e74c3c', fontSize: fontSize.base, fontWeight: fontWeight.semibold }}>Debate Mode</span>
            </div>
            <h2 style={{
              fontSize: 'clamp(1.8rem, 4vw, 2.8rem)',
              fontWeight: fontWeight.bold,
              marginBottom: spacing.xl,
            }}>
              Make AI Models{' '}
              <span style={{
                background: 'linear-gradient(135deg, #e74c3c, #f39c12)',
                WebkitBackgroundClip: 'text',
                WebkitTextFillColor: 'transparent',
              }}>Debate Each Other</span>
            </h2>
            <p style={{
              color: 'rgba(255, 255, 255, 0.5)',
              fontSize: fontSize['3xl'],
              maxWidth: '700px',
              margin: '0 auto',
              lineHeight: 1.6,
            }}>
              Assign unique perspectives to each AI model and watch them argue from different angles.
              The AI Judge then scores the debate, identifies the strongest arguments, and highlights key tensions.
            </p>
          </motion.div>

          <div style={{
            display: 'grid',
            gridTemplateColumns: '1fr 1fr',
            gap: spacing['5xl'],
            alignItems: 'start',
          }}>
            {/* Role list */}
            <motion.div
              initial={{ opacity: 0, x: -20 }}
              whileInView={{ opacity: 1, x: 0 }}
              viewport={{ once: true }}
            >
              <h3 style={{ fontSize: fontSize['3xl'], fontWeight: fontWeight.semibold, marginBottom: spacing['2xl'], color: 'rgba(255,255,255,0.8)' }}>
                9 Unique Perspectives
              </h3>
              <div style={sx(layout.flexCol, { gap: spacing.md })}>
                {debateRoles.map((role, idx) => {
                  const isActive = activeDebateRole === idx
                  const isHovered = hoveredDebateRole === idx
                  return (
                    <div
                      key={role.key}
                      onClick={() => setActiveDebateRole(idx)}
                      onMouseEnter={() => setHoveredDebateRole(idx)}
                      onMouseLeave={() => setHoveredDebateRole(null)}
                      style={sx(layout.flexRow, {
                        padding: `${spacing.lg} ${spacing.xl}`,
                        borderRadius: radius.lg,
                        background: isActive ? `${role.color}15` : isHovered ? 'rgba(255,255,255,0.06)' : 'rgba(255,255,255,0.02)',
                        border: `1px solid ${isActive ? `${role.color}40` : isHovered ? `${role.color}25` : 'rgba(255,255,255,0.04)'}`,
                        cursor: 'pointer',
                        transition: transition.normal,
                        gap: spacing.lg,
                        transform: isHovered && !isActive ? 'translateX(6px)' : 'translateX(0)',
                      })}
                    >
                      <span style={sx(layout.flexRow, { color: role.color, transition: transition.normal, transform: isHovered ? 'scale(1.15)' : 'scale(1)' })}>{role.icon}</span>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontSize: fontSize.lg, fontWeight: fontWeight.semibold, color: isActive ? role.color : isHovered ? role.color : 'rgba(255,255,255,0.7)', transition: 'color 0.2s' }}>
                          {role.label}
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            </motion.div>

            {/* Active role detail */}
            <motion.div
              initial={{ opacity: 0, x: 20 }}
              whileInView={{ opacity: 1, x: 0 }}
              viewport={{ once: true }}
              style={{ position: 'sticky', top: '100px' }}
            >
              <div style={{
                padding: '32px',
                borderRadius: radius['2xl'],
                background: 'rgba(255,255,255,0.02)',
                border: `1px solid ${debateRoles[activeDebateRole].color}30`,
                transition: transition.slow,
              }}>
                <div style={sx(layout.flexRow, {
                  gap: spacing.lg,
                  marginBottom: spacing.xl,
                })}>
                  <div style={sx(layout.center, {
                    width: '44px',
                    height: '44px',
                    borderRadius: radius.lg,
                    background: `${debateRoles[activeDebateRole].color}15`,
                    color: debateRoles[activeDebateRole].color,
                  })}>
                    {debateRoles[activeDebateRole].icon}
                  </div>
                  <h3 style={{ fontSize: fontSize['4xl'], fontWeight: fontWeight.bold, color: debateRoles[activeDebateRole].color }}>
                    {debateRoles[activeDebateRole].label}
                  </h3>
                </div>
                <p style={{ color: 'rgba(255,255,255,0.6)', lineHeight: 1.7, fontSize: fontSize.xl, marginBottom: spacing['3xl'] }}>
                  {debateRoles[activeDebateRole].desc}
                </p>
                <div style={{
                  padding: spacing.xl,
                  borderRadius: radius.lg,
                  background: 'rgba(0,0,0,0.3)',
                  border: '1px solid rgba(255,255,255,0.06)',
                }}>
                  <div style={{ fontSize: fontSize.md, color: 'rgba(255,255,255,0.3)', marginBottom: spacing.md, fontWeight: fontWeight.semibold, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                    How it works
                  </div>
                  <p style={{ color: 'rgba(255,255,255,0.5)', fontSize: fontSize.lg, lineHeight: 1.6 }}>
                    Assign this role to any model in the council. When you send your prompt, that model will respond 
                    entirely from this perspective. The AI Judge then evaluates the full debate — 
                    surfacing the strongest arguments and pinpointing where perspectives clash.
                  </p>
                </div>
              </div>

              <div style={{
                marginTop: spacing['2xl'],
                padding: spacing['2xl'],
                borderRadius: radius.xl,
                background: 'rgba(255,255,255,0.02)',
                border: '1px solid rgba(255,255,255,0.06)',
              }}>
                <div style={sx(layout.flexRow, { gap: spacing.md, marginBottom: spacing.lg })}>
                  <MessageSquare size={16} style={{ color: currentTheme.accent }} />
                  <span style={{ fontSize: fontSize.base, fontWeight: fontWeight.semibold, color: 'rgba(255,255,255,0.6)' }}>Debate Judge Analysis</span>
                </div>
                <div style={sx(layout.flexCol, { gap: spacing.md })}>
                  {['Strongest Arguments — the most compelling points from each side', 'Key Tensions — where perspectives directly conflict', 'Debate Overview — full synthesis of the discussion'].map((item, i) => (
                    <div key={i} style={sx(layout.flexRow, { gap: spacing.md })}>
                      <CheckCircle size={14} style={{ color: currentTheme.accent, flexShrink: 0 }} />
                      <span style={{ color: 'rgba(255,255,255,0.5)', fontSize: fontSize.base }}>{item}</span>
                    </div>
                  ))}
                </div>
              </div>
            </motion.div>
          </div>
        </div>
      </section>

      {/* DISABLED: Social & Community section temporarily removed (social media feature) */}

      {/* ==================== REWARDS & PROGRESSION ==================== */}
      <section style={{
        padding: `100px ${spacing['5xl']}`,
        background: 'rgba(93, 173, 226, 0.02)',
        borderTop: '1px solid rgba(93, 173, 226, 0.08)',
        borderBottom: '1px solid rgba(93, 173, 226, 0.08)',
      }}>
        <div style={{ maxWidth: '1100px', margin: '0 auto' }}>
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            style={{ textAlign: 'center', marginBottom: '60px' }}
          >
            <div style={sx(layout.flexRow, {
              display: 'inline-flex',
              gap: spacing.md,
              padding: `${spacing.sm} ${spacing.xl}`,
              background: 'rgba(255, 215, 0, 0.1)',
              border: '1px solid rgba(255, 215, 0, 0.2)',
              borderRadius: radius.full,
              marginBottom: spacing['2xl'],
            })}>
              <Trophy size={14} style={{ color: '#FFD700' }} />
              <span style={{ color: '#FFD700', fontSize: fontSize.base, fontWeight: fontWeight.semibold }}>Rewards</span>
            </div>
            <h2 style={{
              fontSize: 'clamp(1.8rem, 4vw, 2.8rem)',
              fontWeight: fontWeight.bold,
              marginBottom: spacing.xl,
            }}>
              Level Up as You{' '}
              <span style={{
                background: 'linear-gradient(135deg, #FFD700, #FF4500)',
                WebkitBackgroundClip: 'text',
                WebkitTextFillColor: 'transparent',
              }}>Explore</span>
            </h2>
            <p style={{
              color: 'rgba(255, 255, 255, 0.5)',
              fontSize: fontSize['3xl'],
              maxWidth: '650px',
              margin: '0 auto',
              lineHeight: 1.6,
            }}>
              Every prompt and every streak counts. Earn badges to unlock new tiers and rewards!
            </p>
          </motion.div>

          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(3, 1fr)',
            gap: spacing['3xl'],
          }}>
            {[
              {
                icon: <Award size={28} />,
                title: 'Badges',
                desc: 'Earn badges across multiple categories — Token Titan, Prompt Pioneer, Streak Warrior, and more. Each badge you unlock contributes to your tier and earns you rewards like bonus monthly usage. The more you explore, the more you\'re rewarded.',
                color: '#FFD700',
              },
              {
                icon: <Trophy size={28} />,
                title: 'Tiers',
                desc: 'Progress through Bronze, Silver, Gold, and Platinum tiers as you earn badges. Each tier unlocks bonus monthly usage — and paid plan subscribers get even more. The higher your tier, the more free usage you receive every month.',
                color: '#FF4500',
              },
              {
                icon: <Gift size={28} />,
                title: 'Monthly Rewards',
                desc: 'Every month, paid subscribers receive rewards based on their tier. The higher you climb, the more bonus usage you unlock — on top of what your plan already includes. Rewards reset monthly, so there\'s always something new to earn.',
                color: '#48c9b0',
              },
            ].map((item, idx) => (
              <motion.div
                key={idx}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: idx * 0.1 }}
                onMouseEnter={() => setHoveredFeature(`reward-${idx}`)}
                onMouseLeave={() => setHoveredFeature(null)}
                style={sx(layout.flexCol, {
                  padding: '28px',
                  borderRadius: '14px',
                  background: hoveredFeature === `reward-${idx}` ? `${item.color}12` : 'rgba(255,255,255,0.02)',
                  border: `1px solid ${hoveredFeature === `reward-${idx}` ? `${item.color}50` : 'rgba(255,255,255,0.06)'}`,
                  transition: transition.slow,
                  transform: hoveredFeature === `reward-${idx}` ? 'translateY(-6px)' : 'translateY(0)',
                  boxShadow: hoveredFeature === `reward-${idx}` ? `0 12px 35px ${item.color}20` : 'none',
                  alignItems: 'center',
                  textAlign: 'center',
                  cursor: 'default',
                })}
              >
                <div style={sx(layout.center, {
                  width: spacing['6xl'],
                  height: spacing['6xl'],
                  borderRadius: radius.circle,
                  background: `${item.color}15`,
                  color: item.color,
                  marginBottom: spacing.xl,
                  transition: transition.slow,
                  transform: hoveredFeature === `reward-${idx}` ? 'scale(1.1)' : 'scale(1)',
                })}>
                  {item.icon}
                </div>
                <h4 style={{ fontSize: fontSize['3xl'], fontWeight: fontWeight.bold, marginBottom: '10px', color: item.color }}>{item.title}</h4>
                <p style={{ color: 'rgba(255,255,255,0.5)', fontSize: fontSize.lg, lineHeight: 1.6 }}>{item.desc}</p>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* ==================== FOLLOW-UPS, HISTORY & PROFILE ==================== */}
      <section style={{
        padding: `100px ${spacing['5xl']}`,
        maxWidth: '1100px',
        margin: '0 auto',
      }}>
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          style={{ textAlign: 'center', marginBottom: '60px' }}
        >
          <h2 style={{
            fontSize: 'clamp(1.8rem, 4vw, 2.8rem)',
            fontWeight: fontWeight.bold,
            marginBottom: spacing.xl,
          }}>
            Built to{' '}
            <span style={sx(s.gradientText, { fontSize: 'inherit' })}>Keep You Organized</span>
          </h2>
          <p style={{
            color: 'rgba(255, 255, 255, 0.5)',
            fontSize: fontSize['3xl'],
            maxWidth: '600px',
            margin: '0 auto',
            lineHeight: 1.6,
          }}>
            Continue conversations, revisit past sessions, and track everything in one place.
          </p>
        </motion.div>

        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))',
          gap: spacing['3xl'],
        }}>
          {[
            {
              icon: <MessageSquare size={28} />,
              title: 'Follow-Up Conversations',
              desc: 'Click on any model\'s response or the judge summary to continue the conversation. Full context is maintained — ask follow-up questions, request clarification, or dive deeper into a specific angle.',
              color: currentTheme.accent,
            },
            {
              icon: <BookOpen size={28} />,
              title: 'Conversation History',
              desc: 'Every session is automatically saved and organized by date. Browse by year, month, and day. Star important conversations for quick access. Each entry shows the prompt, category, models used, and token usage.',
              color: '#48c9b0',
            },
            {
              icon: <BarChart3 size={28} />,
              title: 'Your Profile & Stats',
              desc: 'Your profile tracks everything — total tokens processed, prompts sent, streak length, and badges earned. All your progress in one place.',
              color: '#9b59b6',
            },
          ].map((item, idx) => (
            <motion.div
              key={idx}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: idx * 0.1 }}
              onMouseEnter={() => setHoveredFeature(`org-${idx}`)}
              onMouseLeave={() => setHoveredFeature(null)}
              style={{
                padding: '32px',
                borderRadius: radius['2xl'],
                background: hoveredFeature === `org-${idx}` ? `${item.color}08` : 'rgba(255,255,255,0.02)',
                border: `1px solid ${hoveredFeature === `org-${idx}` ? `${item.color}30` : 'rgba(255,255,255,0.06)'}`,
                transition: transition.slow,
              }}
            >
              <div style={sx(layout.center, {
                width: spacing['6xl'],
                height: spacing['6xl'],
                borderRadius: radius.xl,
                background: `${item.color}12`,
                color: item.color,
                marginBottom: spacing['2xl'],
              })}>
                {item.icon}
              </div>
              <h3 style={{ fontSize: '1.15rem', fontWeight: fontWeight.semibold, marginBottom: '10px' }}>{item.title}</h3>
              <p style={{ color: 'rgba(255,255,255,0.5)', lineHeight: 1.6, fontSize: fontSize.xl }}>{item.desc}</p>
            </motion.div>
          ))}
        </div>
      </section>

      {/* ==================== HOW IT WORKS ==================== */}
      <section style={{
        padding: `100px ${spacing['5xl']}`,
        background: 'rgba(93, 173, 226, 0.02)',
        borderTop: '1px solid rgba(93, 173, 226, 0.08)',
        borderBottom: '1px solid rgba(93, 173, 226, 0.08)',
      }}>
        <div style={{ maxWidth: '900px', margin: '0 auto' }}>
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            style={{ textAlign: 'center', marginBottom: '60px' }}
          >
            <h2 style={{
              fontSize: 'clamp(1.8rem, 4vw, 2.8rem)',
              fontWeight: fontWeight.bold,
              marginBottom: spacing.xl,
            }}>
              How It Works
            </h2>
            <p style={{
              color: 'rgba(255, 255, 255, 0.5)',
              fontSize: fontSize['3xl'],
            }}>
            </p>
          </motion.div>

          {[
            {
              step: '1',
              title: 'Pick Your Models & Mode',
              description: 'Select which AI models you want in your council. Choose General mode for straightforward answers, or switch to Debate mode and assign each model a unique perspective.',
            },
            {
              step: '2',
              title: 'Send Your Prompt',
              description: 'Type your question and hit send. Every selected model receives your prompt and responds in parallel.',
            },
            {
              step: '3',
              title: 'Compare & Get the Consensus',
              description: 'See every model\'s response side by side. The AI Judge analyzes them all and delivers a consensus summary — or in debate mode, a full debate analysis with strongest arguments and key tensions.',
            },
            {
              step: '4',
              title: 'Continue & Save',
              description: 'Follow up on any conversation — continue chats with individual models or the judge summary for deeper answers. All conversations are saved to your history, where you can revisit and pick up right where you left off.',
            },
          ].map((item, idx) => (
            <motion.div
              key={idx}
              initial={{ opacity: 0, x: -20 }}
              whileInView={{ opacity: 1, x: 0 }}
              viewport={{ once: true }}
              transition={{ delay: idx * 0.12 }}
              style={{
                display: 'flex',
                gap: spacing['3xl'],
                alignItems: 'flex-start',
                marginBottom: idx < 3 ? spacing['5xl'] : 0,
              }}
            >
              <div style={sx(layout.center, {
                minWidth: '48px',
                height: '48px',
                borderRadius: radius.circle,
                background: currentTheme.accentGradient,
                fontWeight: fontWeight.bold,
                fontSize: fontSize['4xl'],
              })}>
                {item.step}
              </div>
              <div>
                <h3 style={{ fontSize: fontSize['4xl'], fontWeight: fontWeight.semibold, marginBottom: spacing.md }}>
                  {item.title}
                </h3>
                <p style={{ color: 'rgba(255, 255, 255, 0.5)', lineHeight: 1.6 }}>
                  {item.description}
                </p>
              </div>
            </motion.div>
          ))}
        </div>
      </section>

      {/* ==================== FOOTER ==================== */}
      <footer style={{
        borderTop: '1px solid rgba(255, 255, 255, 0.06)',
        background: 'rgba(0, 0, 0, 0.3)',
        padding: '60px 40px 40px',
      }}>
        <div style={{
          maxWidth: '1200px',
          margin: '0 auto',
          display: 'grid',
          gridTemplateColumns: '1.5fr 1fr 1fr 1fr',
          gap: '40px',
        }}>
          {/* Brand */}
          <div>
            <span style={sx(s.gradientText, {
              fontSize: fontSize['3xl'],
              fontWeight: fontWeight.bold,
              marginBottom: spacing.lg,
              display: 'inline-block',
            })}>
              ArkitekAI
            </span>
            <p style={{ color: 'rgba(255, 255, 255, 0.4)', fontSize: fontSize.lg, lineHeight: 1.6, maxWidth: '280px' }}>
              Compare responses from the world's best AI models side by side. Get AI-powered consensus summaries.
            </p>
          </div>

          {/* Product */}
          <div>
            <h4 style={{ fontSize: fontSize.base, fontWeight: fontWeight.semibold, textTransform: 'uppercase', letterSpacing: '0.5px', color: 'rgba(255, 255, 255, 0.6)', marginBottom: spacing.xl }}>
              Product
            </h4>
            {['Features', 'Shop', 'API'].map((label) => (
              <span
                key={label}
                style={{ display: 'block', padding: '4px 0', color: 'rgba(255, 255, 255, 0.4)', fontSize: fontSize.lg }}
              >
                {label}
              </span>
            ))}
          </div>

          {/* Community */}
          <div>
            <h4 style={{ fontSize: fontSize.base, fontWeight: fontWeight.semibold, textTransform: 'uppercase', letterSpacing: '0.5px', color: 'rgba(255, 255, 255, 0.6)', marginBottom: spacing.xl }}>
              Community
            </h4>
            {['Reviews', 'Blog'].map((label) => (
              <span
                key={label}
                style={{ display: 'block', padding: '4px 0', color: 'rgba(255, 255, 255, 0.4)', fontSize: fontSize.lg }}
              >
                {label}
              </span>
            ))}
          </div>

          {/* Company */}
          <div>
            <h4 style={{ fontSize: fontSize.base, fontWeight: fontWeight.semibold, textTransform: 'uppercase', letterSpacing: '0.5px', color: 'rgba(255, 255, 255, 0.6)', marginBottom: spacing.xl }}>
              Company
            </h4>
            {['About'].map((label) => (
              <span
                key={label}
                style={{ display: 'block', padding: '4px 0', color: 'rgba(255, 255, 255, 0.4)', fontSize: fontSize.lg }}
              >
                {label}
              </span>
            ))}
            <button
              onClick={() => onNavigate('terms')}
              style={{ display: 'block', padding: '4px 0', color: 'rgba(255, 255, 255, 0.4)', fontSize: fontSize.lg, background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left' }}
              onMouseEnter={(e) => (e.target as HTMLElement).style.color = '#fff'}
              onMouseLeave={(e) => (e.target as HTMLElement).style.color = 'rgba(255, 255, 255, 0.4)'}
            >
              Terms
            </button>
            <button
              onClick={() => onNavigate('privacy')}
              style={{ display: 'block', padding: '4px 0', color: 'rgba(255, 255, 255, 0.4)', fontSize: fontSize.lg, background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left' }}
              onMouseEnter={(e) => (e.target as HTMLElement).style.color = '#fff'}
              onMouseLeave={(e) => (e.target as HTMLElement).style.color = 'rgba(255, 255, 255, 0.4)'}
            >
              Privacy
            </button>
          </div>
        </div>

        {/* Footer bottom */}
        <div style={{
          maxWidth: '1200px',
          margin: '40px auto 0',
          paddingTop: '24px',
          borderTop: '1px solid rgba(255, 255, 255, 0.06)',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          fontSize: fontSize.base,
          color: 'rgba(255, 255, 255, 0.3)',
        }}>
          <span>&copy; {new Date().getFullYear()} ArkitekAI. All rights reserved.</span>
          <div style={{ display: 'flex', gap: spacing['2xl'] }}>
            <button
              onClick={() => onNavigate('terms')}
              style={{ background: 'none', border: 'none', color: 'rgba(255, 255, 255, 0.3)', fontSize: fontSize.base, cursor: 'pointer' }}
              onMouseEnter={(e) => (e.target as HTMLElement).style.color = '#fff'}
              onMouseLeave={(e) => (e.target as HTMLElement).style.color = 'rgba(255, 255, 255, 0.3)'}
            >
              Terms
            </button>
            <button
              onClick={() => onNavigate('privacy')}
              style={{ background: 'none', border: 'none', color: 'rgba(255, 255, 255, 0.3)', fontSize: fontSize.base, cursor: 'pointer' }}
              onMouseEnter={(e) => (e.target as HTMLElement).style.color = '#fff'}
              onMouseLeave={(e) => (e.target as HTMLElement).style.color = 'rgba(255, 255, 255, 0.4)'}
            >
              Privacy
            </button>
          </div>
        </div>
      </footer>

      {/* Floating Back to Top Button */}
      <AnimatePresence>
        {showBackToTop && (
          <motion.button
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.8 }}
            transition={{ duration: 0.2 }}
            onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
            style={sx(layout.center, {
              position: 'fixed',
              bottom: '32px',
              right: '32px',
              width: '48px',
              height: '48px',
              borderRadius: radius.circle,
              background: currentTheme.accentGradient,
              border: 'none',
              color: '#fff',
              cursor: 'pointer',
              boxShadow: '0 4px 20px rgba(93, 173, 226, 0.3)',
              zIndex: zIndex.popup,
              transition: transition.normal,
            })}
            onMouseEnter={(e) => e.currentTarget.style.transform = 'translateY(-3px)'}
            onMouseLeave={(e) => e.currentTarget.style.transform = 'translateY(0)'}
            title="Back to top"
          >
            <ChevronUp size={24} />
          </motion.button>
        )}
      </AnimatePresence>
    </div>
  )
}

export default LandingPage
