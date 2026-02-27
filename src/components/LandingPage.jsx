import React, { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { 
  Zap, Brain, Globe, Trophy, Shield, CreditCard, 
  ArrowRight, ChevronDown, ChevronUp, MessageSquare, BarChart3, 
  Search, Users, Check, CheckCircle, Swords, Heart, UserPlus,
  Flame, Award, Star, Clock, BookOpen, Lock, Eye,
  TrendingUp, Target, Scale, Lightbulb, Compass, Gauge
} from 'lucide-react'
import { getTheme } from '../utils/theme'

const LandingPage = ({ onNavigate }) => {
  const currentTheme = getTheme('dark')
  const [hoveredFeature, setHoveredFeature] = useState(null)
  const [showBackToTop, setShowBackToTop] = useState(false)
  const [activeDebateRole, setActiveDebateRole] = useState(0)
  const [hoveredDebateRole, setHoveredDebateRole] = useState(null)

  useEffect(() => {
    document.body.style.overflowY = 'auto'
    document.body.style.overflowX = 'hidden'
    document.getElementById('root').style.overflowY = 'auto'
    document.getElementById('root').style.overflowX = 'hidden'
    document.getElementById('root').style.height = 'auto'
    return () => {
      document.body.style.overflowY = 'hidden'
      document.body.style.overflowX = 'hidden'
      document.getElementById('root').style.overflowY = 'hidden'
      document.getElementById('root').style.overflowX = 'hidden'
      document.getElementById('root').style.height = '100vh'
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
      description: 'Pro subscribers earn badges across multiple categories — Token Titan, Prompt Pioneer, Streak Warrior, and more — each with multiple unlock tiers. Maintain daily streaks, level up, and receive monthly gifts including bonus usage, exclusive badges, and collectible icons.',
    },
    {
      icon: <BookOpen size={32} />,
      title: 'Advanced Saved History',
      description: 'Every session is automatically saved and organized by year, month, and day. Star important conversations for quick access. Each entry shows the prompt, category, models used, and full token breakdown so you can revisit anything.',
    },
    {
      icon: <BarChart3 size={32} />,
      title: 'Tracking for Everything',
      description: 'Your profile tracks total tokens processed, prompts sent, streak length, badges earned, and cost breakdowns. Every prompt logs per-model token usage so you always know exactly what you\'re using.',
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
    'Standard monthly usage',
    'No rewards or badges',
  ]

  const proPlanFeatures = [
    '15x more usage than Free',
    'All models & features',
    'Rewards & badge progression',
    'Monthly gifts: bonus usage, exclusive badges & collectible icons',
    'Priority support',
  ]

  const premiumPlanFeatures = [
    '50x more usage than Free',
    'All models & features',
    'Rewards & badge progression',
    'Monthly gifts: bonus usage, exclusive badges & collectible icons',
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
      <nav style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        padding: '16px 40px',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        background: 'rgba(0, 0, 0, 0.8)',
        backdropFilter: 'blur(20px)',
        borderBottom: '1px solid rgba(93, 173, 226, 0.1)',
        zIndex: 1000,
      }}>
        <div
          onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
          style={{ display: 'flex', alignItems: 'center', gap: '12px', cursor: 'pointer' }}
        >
          <span style={{
            fontSize: '1.5rem',
            fontWeight: 700,
            background: currentTheme.accentGradient,
            WebkitBackgroundClip: 'text',
            WebkitTextFillColor: 'transparent',
          }}>
            ArkitekAI
          </span>
        </div>
        <div style={{ display: 'flex', gap: '12px' }}>
          <button
            onClick={() => onNavigate('signin')}
            style={{
              padding: '10px 24px',
              background: 'transparent',
              border: `1px solid ${currentTheme.border}`,
              borderRadius: '8px',
              color: currentTheme.text,
              fontSize: '0.95rem',
              cursor: 'pointer',
              transition: 'all 0.2s',
            }}
            onMouseEnter={(e) => {
              e.target.style.borderColor = currentTheme.accent
              e.target.style.background = 'rgba(93, 173, 226, 0.1)'
            }}
            onMouseLeave={(e) => {
              e.target.style.borderColor = currentTheme.border
              e.target.style.background = 'transparent'
            }}
          >
            Sign In
          </button>
        </div>
      </nav>

      {/* Hero Section */}
      <section style={{
        minHeight: '100vh',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        textAlign: 'center',
        padding: '120px 40px 80px',
        position: 'relative',
      }}>
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
          style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}
        >
          <h1 style={{
            fontSize: 'clamp(2.5rem, 6vw, 4.5rem)',
            fontWeight: 800,
            lineHeight: 1.1,
            marginBottom: '24px',
            maxWidth: '800px',
            textAlign: 'center',
          }}>
            Compare the World's
            <br />
            <span style={{
              background: currentTheme.accentGradient,
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
            }}>
              Best AI Models
            </span>
            <br />
            Side by Side
          </h1>

          <p style={{
            fontSize: 'clamp(1rem, 2vw, 1.25rem)',
            color: 'rgba(255, 255, 255, 0.6)',
            maxWidth: '640px',
            lineHeight: 1.6,
            marginBottom: '40px',
          }}>
            Send one prompt to ChatGPT, Claude, Gemini, and Grok. Get an AI-powered consensus. 
            Debate ideas with assigned roles. Earn rewards the more you explore.
          </p>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', alignItems: 'center' }}>
            <button
              onClick={() => onNavigate('signup')}
              style={{
                padding: '14px 32px',
                background: currentTheme.accentGradient,
                border: 'none',
                borderRadius: '12px',
                color: '#fff',
                fontSize: '1.1rem',
                fontWeight: 600,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                transition: 'all 0.2s',
                width: '220px',
                justifyContent: 'center',
              }}
              onMouseEnter={(e) => e.target.style.transform = 'translateY(-2px)'}
              onMouseLeave={(e) => e.target.style.transform = 'translateY(0)'}
            >
              Sign Up <ArrowRight size={20} />
            </button>
            <button
              onClick={() => {
                document.getElementById('features')?.scrollIntoView({ behavior: 'smooth' })
              }}
              style={{
                padding: '14px 32px',
                background: 'rgba(255, 255, 255, 0.05)',
                border: '1px solid rgba(255, 255, 255, 0.15)',
                borderRadius: '12px',
                color: 'rgba(255, 255, 255, 0.8)',
                fontSize: '1.1rem',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                transition: 'all 0.2s',
                width: '220px',
                justifyContent: 'center',
              }}
              onMouseEnter={(e) => {
                e.target.style.background = 'rgba(255, 255, 255, 0.1)'
                e.target.style.borderColor = 'rgba(255, 255, 255, 0.3)'
              }}
              onMouseLeave={(e) => {
                e.target.style.background = 'rgba(255, 255, 255, 0.05)'
                e.target.style.borderColor = 'rgba(255, 255, 255, 0.15)'
              }}
            >
              Learn More <ChevronDown size={20} />
            </button>
          </div>
        </motion.div>
      </section>

      {/* ==================== CORE FEATURES ==================== */}
      <section id="features" style={{
        padding: '100px 40px',
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
            fontWeight: 700,
            marginBottom: '16px',
          }}>
            The{' '}
            <span style={{
              background: currentTheme.accentGradient,
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
            }}>Core Experience</span>
          </h2>
          <p style={{
            color: 'rgba(255, 255, 255, 0.5)',
            fontSize: '1.1rem',
            maxWidth: '650px',
            margin: '0 auto',
            lineHeight: 1.6,
          }}>
            ArkitekAI brings the world's leading AI models together. Ask once, compare everything, and get a synthesized answer — all in one place.
          </p>
        </motion.div>

        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))',
          gap: '24px',
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
                padding: '32px',
                background: hoveredFeature === `core-${idx}`
                  ? 'rgba(93, 173, 226, 0.06)'
                  : 'rgba(255, 255, 255, 0.02)',
                border: `1px solid ${hoveredFeature === `core-${idx}` ? 'rgba(93, 173, 226, 0.3)' : 'rgba(255, 255, 255, 0.06)'}`,
                borderRadius: '16px',
                transition: 'all 0.3s',
                cursor: 'default',
              }}
            >
              <div style={{
                width: '56px',
                height: '56px',
                borderRadius: '12px',
                background: 'rgba(93, 173, 226, 0.1)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: currentTheme.accent,
                marginBottom: '20px',
              }}>
                {feature.icon}
              </div>
              <h3 style={{
                fontSize: '1.2rem',
                fontWeight: 600,
                marginBottom: '10px',
              }}>
                {feature.title}
              </h3>
              <p style={{
                color: 'rgba(255, 255, 255, 0.5)',
                lineHeight: 1.6,
                fontSize: '0.95rem',
              }}>
                {feature.description}
              </p>
            </motion.div>
          ))}
        </div>
      </section>

      {/* ==================== DEBATE MODE ==================== */}
      <section style={{
        padding: '100px 40px',
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
            <div style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '8px',
              padding: '6px 16px',
              background: 'rgba(231, 76, 60, 0.1)',
              border: '1px solid rgba(231, 76, 60, 0.2)',
              borderRadius: '100px',
              marginBottom: '20px',
            }}>
              <Swords size={14} style={{ color: '#e74c3c' }} />
              <span style={{ color: '#e74c3c', fontSize: '0.85rem', fontWeight: 600 }}>Debate Mode</span>
            </div>
            <h2 style={{
              fontSize: 'clamp(1.8rem, 4vw, 2.8rem)',
              fontWeight: 700,
              marginBottom: '16px',
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
              fontSize: '1.1rem',
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
            gap: '40px',
            alignItems: 'start',
          }}>
            {/* Role list */}
            <motion.div
              initial={{ opacity: 0, x: -20 }}
              whileInView={{ opacity: 1, x: 0 }}
              viewport={{ once: true }}
            >
              <h3 style={{ fontSize: '1.1rem', fontWeight: 600, marginBottom: '20px', color: 'rgba(255,255,255,0.8)' }}>
                9 Unique Perspectives
              </h3>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {debateRoles.map((role, idx) => {
                  const isActive = activeDebateRole === idx
                  const isHovered = hoveredDebateRole === idx
                  return (
                    <div
                      key={role.key}
                      onClick={() => setActiveDebateRole(idx)}
                      onMouseEnter={() => setHoveredDebateRole(idx)}
                      onMouseLeave={() => setHoveredDebateRole(null)}
                      style={{
                        padding: '12px 16px',
                        borderRadius: '10px',
                        background: isActive ? `${role.color}15` : isHovered ? 'rgba(255,255,255,0.06)' : 'rgba(255,255,255,0.02)',
                        border: `1px solid ${isActive ? `${role.color}40` : isHovered ? `${role.color}25` : 'rgba(255,255,255,0.04)'}`,
                        cursor: 'pointer',
                        transition: 'all 0.2s',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '12px',
                        transform: isHovered && !isActive ? 'translateX(6px)' : 'translateX(0)',
                      }}
                    >
                      <span style={{ color: role.color, display: 'flex', alignItems: 'center', transition: 'transform 0.2s', transform: isHovered ? 'scale(1.15)' : 'scale(1)' }}>{role.icon}</span>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontSize: '0.9rem', fontWeight: 600, color: isActive ? role.color : isHovered ? role.color : 'rgba(255,255,255,0.7)', transition: 'color 0.2s' }}>
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
                borderRadius: '16px',
                background: 'rgba(255,255,255,0.02)',
                border: `1px solid ${debateRoles[activeDebateRole].color}30`,
                transition: 'all 0.3s',
              }}>
                <div style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '12px',
                  marginBottom: '16px',
                }}>
                  <div style={{
                    width: '44px',
                    height: '44px',
                    borderRadius: '10px',
                    background: `${debateRoles[activeDebateRole].color}15`,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: debateRoles[activeDebateRole].color,
                  }}>
                    {debateRoles[activeDebateRole].icon}
                  </div>
                  <h3 style={{ fontSize: '1.2rem', fontWeight: 700, color: debateRoles[activeDebateRole].color }}>
                    {debateRoles[activeDebateRole].label}
                  </h3>
                </div>
                <p style={{ color: 'rgba(255,255,255,0.6)', lineHeight: 1.7, fontSize: '0.95rem', marginBottom: '24px' }}>
                  {debateRoles[activeDebateRole].desc}
                </p>
                <div style={{
                  padding: '16px',
                  borderRadius: '10px',
                  background: 'rgba(0,0,0,0.3)',
                  border: '1px solid rgba(255,255,255,0.06)',
                }}>
                  <div style={{ fontSize: '0.8rem', color: 'rgba(255,255,255,0.3)', marginBottom: '8px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                    How it works
                  </div>
                  <p style={{ color: 'rgba(255,255,255,0.5)', fontSize: '0.9rem', lineHeight: 1.6 }}>
                    Assign this role to any model in the council. When you send your prompt, that model will respond 
                    entirely from this perspective. The AI Judge then evaluates the full debate — scoring balance, 
                    surfacing the strongest arguments, and pinpointing where perspectives clash.
                  </p>
                </div>
              </div>

              <div style={{
                marginTop: '20px',
                padding: '20px',
                borderRadius: '12px',
                background: 'rgba(255,255,255,0.02)',
                border: '1px solid rgba(255,255,255,0.06)',
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px' }}>
                  <MessageSquare size={16} style={{ color: currentTheme.accent }} />
                  <span style={{ fontSize: '0.85rem', fontWeight: 600, color: 'rgba(255,255,255,0.6)' }}>Debate Judge Analysis</span>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  {['Balance Score — how evenly perspectives are represented', 'Strongest Arguments — the most compelling points from each side', 'Key Tensions — where perspectives directly conflict', 'Debate Overview — full synthesis of the discussion'].map((item, i) => (
                    <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <CheckCircle size={14} style={{ color: currentTheme.accent, flexShrink: 0 }} />
                      <span style={{ color: 'rgba(255,255,255,0.5)', fontSize: '0.85rem' }}>{item}</span>
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
        padding: '100px 40px',
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
            <div style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '8px',
              padding: '6px 16px',
              background: 'rgba(255, 215, 0, 0.1)',
              border: '1px solid rgba(255, 215, 0, 0.2)',
              borderRadius: '100px',
              marginBottom: '20px',
            }}>
              <Trophy size={14} style={{ color: '#FFD700' }} />
              <span style={{ color: '#FFD700', fontSize: '0.85rem', fontWeight: 600 }}>Rewards</span>
            </div>
            <h2 style={{
              fontSize: 'clamp(1.8rem, 4vw, 2.8rem)',
              fontWeight: 700,
              marginBottom: '16px',
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
              fontSize: '1.1rem',
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
            gap: '24px',
          }}>
            {[
              {
                icon: <Award size={28} />,
                title: 'Badges',
                desc: 'Earn badges across multiple categories — Token Titan, Prompt Pioneer, Streak Warrior, and more. Each category has unique badges unlocked by hitting milestones like processing tokens, sending prompts, and maintaining streaks.',
                color: '#FFD700',
              },
              {
                icon: <Trophy size={28} />,
                title: 'Tiers',
                desc: 'Every badge category has 12 tiers that get progressively harder to reach. Start at the bottom and work your way up — from First Spark to Universal Consciousness, from First Words to Omniscient, from Getting Warm to Unkillable. Each tier is a new milestone to chase.',
                color: '#FF4500',
              },
              {
                icon: <TrendingUp size={28} />,
                title: 'Level Progression',
                desc: 'Your overall level is calculated from total tokens processed, prompts sent, and streak length. As you use ArkitekAI, your level climbs — reflecting everything you\'ve accomplished across the platform.',
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
                style={{
                  padding: '28px',
                  borderRadius: '14px',
                  background: hoveredFeature === `reward-${idx}` ? `${item.color}12` : 'rgba(255,255,255,0.02)',
                  border: `1px solid ${hoveredFeature === `reward-${idx}` ? `${item.color}50` : 'rgba(255,255,255,0.06)'}`,
                  transition: 'all 0.3s ease',
                  transform: hoveredFeature === `reward-${idx}` ? 'translateY(-6px)' : 'translateY(0)',
                  boxShadow: hoveredFeature === `reward-${idx}` ? `0 12px 35px ${item.color}20` : 'none',
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  textAlign: 'center',
                  cursor: 'default',
                }}
              >
                <div style={{
                  width: '56px',
                  height: '56px',
                  borderRadius: '50%',
                  background: `${item.color}15`,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: item.color,
                  marginBottom: '16px',
                  transition: 'transform 0.3s ease',
                  transform: hoveredFeature === `reward-${idx}` ? 'scale(1.1)' : 'scale(1)',
                }}>
                  {item.icon}
                </div>
                <h4 style={{ fontSize: '1.1rem', fontWeight: 700, marginBottom: '10px', color: item.color }}>{item.title}</h4>
                <p style={{ color: 'rgba(255,255,255,0.5)', fontSize: '0.9rem', lineHeight: 1.6 }}>{item.desc}</p>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* ==================== FOLLOW-UPS, HISTORY & PROFILE ==================== */}
      <section style={{
        padding: '100px 40px',
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
            fontWeight: 700,
            marginBottom: '16px',
          }}>
            Built to{' '}
            <span style={{
              background: currentTheme.accentGradient,
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
            }}>Keep You Organized</span>
          </h2>
          <p style={{
            color: 'rgba(255, 255, 255, 0.5)',
            fontSize: '1.1rem',
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
          gap: '24px',
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
                borderRadius: '16px',
                background: hoveredFeature === `org-${idx}` ? `${item.color}08` : 'rgba(255,255,255,0.02)',
                border: `1px solid ${hoveredFeature === `org-${idx}` ? `${item.color}30` : 'rgba(255,255,255,0.06)'}`,
                transition: 'all 0.3s',
              }}
            >
              <div style={{
                width: '56px',
                height: '56px',
                borderRadius: '12px',
                background: `${item.color}12`,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: item.color,
                marginBottom: '20px',
              }}>
                {item.icon}
              </div>
              <h3 style={{ fontSize: '1.15rem', fontWeight: 600, marginBottom: '10px' }}>{item.title}</h3>
              <p style={{ color: 'rgba(255,255,255,0.5)', lineHeight: 1.6, fontSize: '0.95rem' }}>{item.desc}</p>
            </motion.div>
          ))}
        </div>
      </section>

      {/* ==================== HOW IT WORKS ==================== */}
      <section style={{
        padding: '100px 40px',
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
              fontWeight: 700,
              marginBottom: '16px',
            }}>
              How It Works
            </h2>
            <p style={{
              color: 'rgba(255, 255, 255, 0.5)',
              fontSize: '1.1rem',
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
              description: 'See every model\'s response side by side. The AI Judge analyzes them all and delivers a consensus summary — or in debate mode, a full debate analysis with balance scores and strongest arguments.',
            },
            {
              step: '4',
              title: 'Continue & Save',
              description: 'Follow up with any model for deeper answers. Your session is auto-saved to history so you can revisit any conversation.',
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
                gap: '24px',
                alignItems: 'flex-start',
                marginBottom: idx < 3 ? '40px' : 0,
              }}
            >
              <div style={{
                minWidth: '48px',
                height: '48px',
                borderRadius: '50%',
                background: currentTheme.accentGradient,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontWeight: 700,
                fontSize: '1.2rem',
              }}>
                {item.step}
              </div>
              <div>
                <h3 style={{ fontSize: '1.2rem', fontWeight: 600, marginBottom: '8px' }}>
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

      {/* ==================== PRICING ==================== */}
      <section id="pricing" style={{
        padding: '100px 40px',
        maxWidth: '900px',
        margin: '0 auto',
      }}>
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          style={{ textAlign: 'center', marginBottom: '40px' }}
        >
          <h2 style={{
            fontSize: 'clamp(1.8rem, 4vw, 2.8rem)',
            fontWeight: 700,
          }}>
            <span style={{
              background: currentTheme.accentGradient,
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
            }}>Pricing</span>
          </h2>
        </motion.div>

        <div style={{
          display: 'flex',
          flexDirection: 'row',
          gap: '24px',
          maxWidth: '1100px',
          margin: '0 auto',
        }}>
          {/* Free Plan */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            onClick={() => onNavigate('signup', 'free_trial')}
            style={{
              flex: 1,
              padding: '32px',
              background: 'rgba(93, 173, 226, 0.05)',
              border: '1px solid rgba(93, 173, 226, 0.2)',
              borderRadius: '16px',
              cursor: 'pointer',
              textAlign: 'center',
              transition: 'all 0.2s',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
            }}
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
              padding: '6px 16px',
              background: 'rgba(93, 173, 226, 0.15)',
              borderRadius: '100px',
              fontSize: '0.85rem',
              color: '#5dade2',
              fontWeight: 600,
              marginBottom: '20px',
            }}>
              Free Plan
            </span>
            <div style={{ marginBottom: '20px' }}>
              <span style={{ fontSize: '2.8rem', fontWeight: 800, color: '#fff' }}>Free</span>
            </div>
            <div style={{
              borderTop: '1px solid rgba(255, 255, 255, 0.08)',
              paddingTop: '20px',
              paddingBottom: '24px',
              width: '100%',
              display: 'flex',
              flexDirection: 'column',
              gap: '12px',
              textAlign: 'left',
            }}>
              {freePlanFeatures.map((feature, idx) => (
                <div key={idx} style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <CheckCircle size={16} style={{ color: '#5dade2', flexShrink: 0 }} />
                  <span style={{ color: 'rgba(255, 255, 255, 0.6)', fontSize: '0.9rem' }}>{feature}</span>
                </div>
              ))}
            </div>
            <div style={{
              marginTop: 'auto',
              padding: '12px 0',
              width: '100%',
              background: 'rgba(93, 173, 226, 0.12)',
              borderRadius: '10px',
              color: '#5dade2',
              fontWeight: 600,
              fontSize: '0.95rem',
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
            style={{
              flex: 1,
              padding: '32px',
              background: 'rgba(72, 201, 176, 0.05)',
              border: '1px solid rgba(72, 201, 176, 0.2)',
              borderRadius: '16px',
              cursor: 'pointer',
              textAlign: 'center',
              transition: 'all 0.2s',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              position: 'relative',
            }}
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
              padding: '6px 16px',
              background: 'rgba(72, 201, 176, 0.15)',
              borderRadius: '100px',
              fontSize: '0.85rem',
              color: '#48c9b0',
              fontWeight: 600,
              marginBottom: '20px',
            }}>
              Pro
            </span>
            <div style={{ marginBottom: '20px', display: 'flex', alignItems: 'baseline', gap: '4px' }}>
              <span style={{ fontSize: '2.8rem', fontWeight: 800, color: '#fff' }}>$19.95</span>
              <span style={{ fontSize: '1rem', color: 'rgba(255, 255, 255, 0.4)' }}>/mo</span>
            </div>
            <div style={{
              borderTop: '1px solid rgba(255, 255, 255, 0.08)',
              paddingTop: '20px',
              paddingBottom: '24px',
              width: '100%',
              display: 'flex',
              flexDirection: 'column',
              gap: '12px',
              textAlign: 'left',
            }}>
              {proPlanFeatures.map((feature, idx) => (
                <div key={idx} style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <CheckCircle size={16} style={{ color: '#48c9b0', flexShrink: 0 }} />
                  <span style={{ color: 'rgba(255, 255, 255, 0.6)', fontSize: '0.9rem' }}>{feature}</span>
                </div>
              ))}
            </div>
            <div style={{
              marginTop: 'auto',
              padding: '12px 0',
              width: '100%',
              background: 'rgba(72, 201, 176, 0.12)',
              borderRadius: '10px',
              color: '#48c9b0',
              fontWeight: 600,
              fontSize: '0.95rem',
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
            style={{
              flex: 1,
              padding: '32px',
              background: 'rgba(187, 143, 255, 0.05)',
              border: '1px solid rgba(187, 143, 255, 0.2)',
              borderRadius: '16px',
              cursor: 'pointer',
              textAlign: 'center',
              transition: 'all 0.2s',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              position: 'relative',
            }}
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
              padding: '6px 16px',
              background: 'rgba(187, 143, 255, 0.15)',
              borderRadius: '100px',
              fontSize: '0.85rem',
              color: '#bb8fff',
              fontWeight: 600,
              marginBottom: '20px',
            }}>
              Premium
            </span>
            <div style={{ marginBottom: '20px', display: 'flex', alignItems: 'baseline', gap: '4px' }}>
              <span style={{ fontSize: '2.8rem', fontWeight: 800, color: '#fff' }}>$49.95</span>
              <span style={{ fontSize: '1rem', color: 'rgba(255, 255, 255, 0.4)' }}>/mo</span>
            </div>
            <div style={{
              borderTop: '1px solid rgba(255, 255, 255, 0.08)',
              paddingTop: '20px',
              paddingBottom: '24px',
              width: '100%',
              display: 'flex',
              flexDirection: 'column',
              gap: '12px',
              textAlign: 'left',
            }}>
              {premiumPlanFeatures.map((feature, idx) => (
                <div key={idx} style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <CheckCircle size={16} style={{ color: '#bb8fff', flexShrink: 0 }} />
                  <span style={{ color: 'rgba(255, 255, 255, 0.6)', fontSize: '0.9rem' }}>{feature}</span>
                </div>
              ))}
            </div>
            <div style={{
              marginTop: 'auto',
              padding: '12px 0',
              width: '100%',
              background: 'rgba(187, 143, 255, 0.12)',
              borderRadius: '10px',
              color: '#bb8fff',
              fontWeight: 600,
              fontSize: '0.95rem',
            }}>
              Subscribe to Premium
            </div>
          </motion.div>
        </div>
      </section>

      {/* ==================== FOOTER ==================== */}
      <footer style={{
        padding: '40px',
        borderTop: '1px solid rgba(255, 255, 255, 0.06)',
        background: 'rgba(0, 0, 0, 0.3)',
        textAlign: 'center',
      }}>
        <div style={{
          maxWidth: '1200px',
          margin: '0 auto',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: '16px',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={{
              fontSize: '1.1rem',
              fontWeight: 600,
              background: currentTheme.accentGradient,
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
            }}>
              ArkitekAI
            </span>
            <span style={{ color: 'rgba(255, 255, 255, 0.3)', fontSize: '0.85rem' }}>
              &copy; {new Date().getFullYear()}
            </span>
          </div>
          <div style={{ display: 'flex', gap: '24px' }}>
            <button
              onClick={() => onNavigate('terms')}
              style={{
                background: 'none',
                border: 'none',
                color: 'rgba(255, 255, 255, 0.4)',
                fontSize: '0.9rem',
                cursor: 'pointer',
                textDecoration: 'none',
              }}
              onMouseEnter={(e) => e.target.style.color = 'rgba(255, 255, 255, 0.7)'}
              onMouseLeave={(e) => e.target.style.color = 'rgba(255, 255, 255, 0.4)'}
            >
              Terms of Service
            </button>
            <button
              onClick={() => onNavigate('privacy')}
              style={{
                background: 'none',
                border: 'none',
                color: 'rgba(255, 255, 255, 0.4)',
                fontSize: '0.9rem',
                cursor: 'pointer',
                textDecoration: 'none',
              }}
              onMouseEnter={(e) => e.target.style.color = 'rgba(255, 255, 255, 0.7)'}
              onMouseLeave={(e) => e.target.style.color = 'rgba(255, 255, 255, 0.4)'}
            >
              Privacy Policy
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
            style={{
              position: 'fixed',
              bottom: '32px',
              right: '32px',
              width: '48px',
              height: '48px',
              borderRadius: '50%',
              background: currentTheme.accentGradient,
              border: 'none',
              color: '#fff',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              boxShadow: '0 4px 20px rgba(93, 173, 226, 0.3)',
              zIndex: 999,
              transition: 'transform 0.2s',
            }}
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
