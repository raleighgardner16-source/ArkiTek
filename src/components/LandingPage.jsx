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
      icon: <Search size={32} />,
      title: 'Live Web Search & Sources',
      description: 'Every prompt is automatically analyzed. When real-time data is needed, ArkitekAI fetches current web results and feeds them to each model — so responses are grounded in verified, up-to-date sources displayed alongside every answer.',
    },
    {
      icon: <MessageSquare size={32} />,
      title: 'AI Judge Consensus',
      description: 'After the council responds, an AI judge analyzes every answer and delivers a consensus summary — highlighting where models agree, where they contradict, and surfacing the key insights you need to make a decision.',
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

  const badgeCategories = [
    { name: 'Token Titan', icon: <Zap size={20} />, color: '#FFD700', desc: 'Process tokens to unlock 12 tiers of badges — from First Spark to Universal Consciousness' },
    { name: 'Prompt Pioneer', icon: <MessageSquare size={20} />, color: '#32CD32', desc: 'Send prompts to climb 12 ranks — from First Words to Omniscient' },
    { name: 'Streak Warrior', icon: <Flame size={20} />, color: '#FF4500', desc: 'Maintain daily streaks and earn badges — from Week Warrior to Unkillable' },
    { name: 'Community Champion', icon: <Heart size={20} />, color: '#FF69B4', desc: 'Engage with the community to unlock social badges — likes, comments, and shares' },
  ]

  const freePlanFeatures = [
    'Access to all AI models',
    'Council of LLMs & AI Judge',
    'Web search & sources',
    'Debate mode with all roles',
    'Prompt Feed access',
    'Limited monthly usage',
  ]

  const proPlanFeatures = [
    '15x more monthly usage',
    'All models & features',
    'Rewards & badge progression',
    'Monthly gifts: bonus usage, exclusive badges & collectible icons',
    'Full social features',
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
        >
          <h1 style={{
            fontSize: 'clamp(2.5rem, 6vw, 4.5rem)',
            fontWeight: 800,
            lineHeight: 1.1,
            marginBottom: '24px',
            maxWidth: '800px',
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
            Debate ideas with assigned roles. Share with the community. Level up as you explore.
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
                {debateRoles.map((role, idx) => (
                  <div
                    key={role.key}
                    onClick={() => setActiveDebateRole(idx)}
                    style={{
                      padding: '12px 16px',
                      borderRadius: '10px',
                      background: activeDebateRole === idx ? `${role.color}15` : 'rgba(255,255,255,0.02)',
                      border: `1px solid ${activeDebateRole === idx ? `${role.color}40` : 'rgba(255,255,255,0.04)'}`,
                      cursor: 'pointer',
                      transition: 'all 0.2s',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '12px',
                    }}
                  >
                    <span style={{ color: role.color, display: 'flex', alignItems: 'center' }}>{role.icon}</span>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: '0.9rem', fontWeight: 600, color: activeDebateRole === idx ? role.color : 'rgba(255,255,255,0.7)' }}>
                        {role.label}
                      </div>
                    </div>
                  </div>
                ))}
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

      {/* ==================== SOCIAL & COMMUNITY ==================== */}
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
          <div style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '8px',
            padding: '6px 16px',
            background: 'rgba(155, 89, 182, 0.1)',
            border: '1px solid rgba(155, 89, 182, 0.2)',
            borderRadius: '100px',
            marginBottom: '20px',
          }}>
            <Users size={14} style={{ color: '#9b59b6' }} />
            <span style={{ color: '#9b59b6', fontSize: '0.85rem', fontWeight: 600 }}>Community</span>
          </div>
          <h2 style={{
            fontSize: 'clamp(1.8rem, 4vw, 2.8rem)',
            fontWeight: 700,
            marginBottom: '16px',
          }}>
            A Social Network for{' '}
            <span style={{
              background: 'linear-gradient(135deg, #9b59b6, #3498db)',
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
            }}>AI Explorers</span>
          </h2>
          <p style={{
            color: 'rgba(255, 255, 255, 0.5)',
            fontSize: '1.1rem',
            maxWidth: '650px',
            margin: '0 auto',
            lineHeight: 1.6,
          }}>
            The Prompt Feed is where you share your best prompts, discover what others are asking,
            and connect with a community that's pushing the limits of AI.
          </p>
        </motion.div>

        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))',
          gap: '20px',
        }}>
          {[
            {
              icon: <Globe size={24} />,
              title: 'Share Prompts & Responses',
              desc: 'Post your prompts along with the full council responses and judge summary. Choose to share publicly or with followers only.',
              color: '#3498db',
            },
            {
              icon: <Heart size={24} />,
              title: 'Like & Comment',
              desc: 'Like interesting prompts, leave comments, and reply to other users. Threaded discussions let conversations go deeper.',
              color: '#e74c3c',
            },
            {
              icon: <UserPlus size={24} />,
              title: 'Follow Users',
              desc: 'Follow other users to see their prompts in your personal feed. Build your own curated network of AI explorers.',
              color: '#48c9b0',
            },
            {
              icon: <Search size={24} />,
              title: 'Discover & Search',
              desc: 'Browse prompts by category — Science, Tech, Business, Health, Philosophy, and more. Search for specific users to follow.',
              color: '#f39c12',
            },
            {
              icon: <Eye size={24} />,
              title: 'Privacy Controls',
              desc: 'Every prompt you share has privacy settings. Choose between public visibility or followers-only. Your conversations are private by default.',
              color: '#9b59b6',
            },
            {
              icon: <Award size={24} />,
              title: 'User Profiles',
              desc: 'Every user gets a profile showcasing their badges, stats, prompt history, and social connections. Visit any user\'s profile from the feed.',
              color: '#1abc9c',
            },
          ].map((item, idx) => (
            <motion.div
              key={idx}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: idx * 0.08 }}
              onMouseEnter={() => setHoveredFeature(`social-${idx}`)}
              onMouseLeave={() => setHoveredFeature(null)}
              style={{
                padding: '28px',
                borderRadius: '14px',
                background: hoveredFeature === `social-${idx}` ? `${item.color}08` : 'rgba(255,255,255,0.02)',
                border: `1px solid ${hoveredFeature === `social-${idx}` ? `${item.color}30` : 'rgba(255,255,255,0.06)'}`,
                transition: 'all 0.3s',
              }}
            >
              <div style={{
                width: '48px',
                height: '48px',
                borderRadius: '10px',
                background: `${item.color}12`,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: item.color,
                marginBottom: '16px',
              }}>
                {item.icon}
              </div>
              <h3 style={{ fontSize: '1.05rem', fontWeight: 600, marginBottom: '8px' }}>{item.title}</h3>
              <p style={{ color: 'rgba(255,255,255,0.5)', fontSize: '0.9rem', lineHeight: 1.6 }}>{item.desc}</p>
            </motion.div>
          ))}
        </div>
      </section>

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
              Every prompt, every streak, every interaction counts. Earn badges across 4 categories, 
              maintain daily streaks, and unlock new tiers as you climb.
            </p>
          </motion.div>

          {/* Badge Categories */}
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
            gap: '20px',
            marginBottom: '40px',
          }}>
            {badgeCategories.map((cat, idx) => (
              <motion.div
                key={idx}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: idx * 0.1 }}
                onMouseEnter={() => setHoveredFeature(`badge-${idx}`)}
                onMouseLeave={() => setHoveredFeature(null)}
                style={{
                  padding: '24px',
                  borderRadius: '14px',
                  background: hoveredFeature === `badge-${idx}` ? `${cat.color}08` : 'rgba(255,255,255,0.02)',
                  border: `1px solid ${hoveredFeature === `badge-${idx}` ? `${cat.color}30` : 'rgba(255,255,255,0.06)'}`,
                  transition: 'all 0.3s',
                  textAlign: 'center',
                }}
              >
                <div style={{
                  width: '48px',
                  height: '48px',
                  borderRadius: '50%',
                  background: `${cat.color}15`,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: cat.color,
                  margin: '0 auto 14px',
                }}>
                  {cat.icon}
                </div>
                <h4 style={{ fontSize: '1rem', fontWeight: 700, marginBottom: '8px', color: cat.color }}>{cat.name}</h4>
                <p style={{ color: 'rgba(255,255,255,0.45)', fontSize: '0.85rem', lineHeight: 1.5 }}>{cat.desc}</p>
              </motion.div>
            ))}
          </div>

          {/* Streak + Progression callout */}
          <div style={{
            display: 'grid',
            gridTemplateColumns: '1fr 1fr 1fr',
            gap: '20px',
          }}>
            {[
              {
                icon: <Flame size={24} />,
                title: 'Daily Streaks',
                desc: 'Use ArkitekAI every day to build your streak. The longer it goes, the higher the badge tier — from 3 days all the way to 1,000.',
                color: '#FF4500',
              },
              {
                icon: <TrendingUp size={24} />,
                title: 'Level Progression',
                desc: 'Your level is calculated from total tokens processed, prompts sent, streak length, and community engagement. Watch it climb over time.',
                color: '#48c9b0',
              },
              {
                icon: <Star size={24} />,
                title: 'Pro Monthly Rewards',
                desc: 'Pro subscribers receive monthly rewards — bonus usage, exclusive badges, and collectible profile icons that rotate each month.',
                color: '#FFD700',
              },
            ].map((item, idx) => (
              <motion.div
                key={idx}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: idx * 0.1 }}
                style={{
                  padding: '24px',
                  borderRadius: '14px',
                  background: 'rgba(255,255,255,0.02)',
                  border: '1px solid rgba(255,255,255,0.06)',
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  textAlign: 'center',
                }}
              >
                <div style={{
                  color: item.color,
                  marginBottom: '12px',
                }}>
                  {item.icon}
                </div>
                <h4 style={{ fontSize: '0.95rem', fontWeight: 600, marginBottom: '8px' }}>{item.title}</h4>
                <p style={{ color: 'rgba(255,255,255,0.45)', fontSize: '0.85rem', lineHeight: 1.5 }}>{item.desc}</p>
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
              desc: 'Your profile tracks everything — total tokens processed, prompts sent, streak length, badges earned, and social stats like likes and followers. Showcase your achievements to the community.',
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
              From prompt to consensus in seconds
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
              description: 'Type your question and hit send. If web search data is needed, it\'s fetched automatically. Every selected model receives your prompt and responds in parallel.',
            },
            {
              step: '3',
              title: 'Compare & Get the Consensus',
              description: 'See every model\'s response side by side. The AI Judge analyzes them all and delivers a consensus summary — or in debate mode, a full debate analysis with balance scores and strongest arguments.',
            },
            {
              step: '4',
              title: 'Continue, Save & Share',
              description: 'Follow up with any model for deeper answers. Your session is auto-saved to history. Share your prompt and responses to the Prompt Feed for the community to see.',
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
          maxWidth: '750px',
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
              Free Trial
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
              Get Started Free
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
        </div>
      </section>

      {/* ==================== TRUST / SECURITY ==================== */}
      <section style={{
        padding: '60px 40px',
        borderTop: '1px solid rgba(93, 173, 226, 0.08)',
      }}>
        <div style={{
          maxWidth: '800px',
          margin: '0 auto',
          display: 'flex',
          justifyContent: 'center',
          gap: '48px',
          flexWrap: 'wrap',
        }}>
          {[
            { icon: <Shield size={20} />, text: 'Secure payments via Stripe' },
            { icon: <Globe size={20} />, text: 'Real-time web search' },
            { icon: <Zap size={20} />, text: '12+ AI models, 4 providers' },
            { icon: <Lock size={20} />, text: 'Private by default' },
          ].map((item, idx) => (
            <div key={idx} style={{
              display: 'flex',
              alignItems: 'center',
              gap: '10px',
              color: 'rgba(255, 255, 255, 0.4)',
              fontSize: '0.95rem',
            }}>
              <span style={{ color: currentTheme.accent }}>{item.icon}</span>
              {item.text}
            </div>
          ))}
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
