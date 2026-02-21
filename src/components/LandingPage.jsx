import React, { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { 
  Zap, Brain, Globe, Trophy, Shield, CreditCard, 
  ArrowRight, ChevronDown, ChevronUp, MessageSquare, BarChart3, 
  Search, Users, Check, CheckCircle 
} from 'lucide-react'
import { getTheme } from '../utils/theme'

const LandingPage = ({ onNavigate }) => {
  const currentTheme = getTheme('dark')
  const [hoveredFeature, setHoveredFeature] = useState(null)
  const [showBackToTop, setShowBackToTop] = useState(false)

  // Allow page scrolling on the landing page (body & #root normally have overflow:hidden)
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

  // Show/hide "back to top" button based on scroll position
  useEffect(() => {
    const handleScroll = () => {
      const scrollTop = window.scrollY || document.documentElement.scrollTop || document.body.scrollTop || 0
      setShowBackToTop(scrollTop > 300)
    }
    window.addEventListener('scroll', handleScroll, { passive: true })
    return () => window.removeEventListener('scroll', handleScroll)
  }, [])

  const features = [
    {
      icon: <Brain size={32} />,
      title: 'Council of LLMs',
      description: 'Select any combination of models from ChatGPT, Claude, Gemini, and Grok — send one prompt and compare their responses side by side in real time.',
    },
    {
      icon: <Search size={32} />,
      title: 'Web Search',
      description: 'Automatic web search integration fetches and verifies real-time information, so every model responds with current, sourced data.',
    },
    {
      icon: <MessageSquare size={32} />,
      title: 'AI Judge',
      description: 'An AI judge analyzes all council responses and delivers a consensus summary — highlighting agreements, disagreements, and key insights.',
    },
    {
      icon: <Trophy size={32} />,
      title: 'Rewards & Achievements',
      description: 'Level up as you prompt! Earn badges, unlock streaks, and climb the ranks the more you use the council. Your curiosity pays off.',
    },
    {
      icon: <BarChart3 size={32} />,
      title: 'Prompt Feed',
      description: 'Share your best prompts and responses with the community. Like and discover interesting conversations from other users.',
    },
    {
      icon: <Users size={32} />,
      title: 'Follow-Up Conversations',
      description: 'Continue the conversation with any individual model or the judge. Full context is maintained across follow-up messages.',
    },
  ]

  const freePlanFeatures = [
    'Limited free usage',
    'Access to all models',
  ]

  const proPlanFeatures = [
    '15x more usage',
    'All models & features',
    'Monthly rewards: usage bonuses, badges & collectible icons',
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
        {/* Background glow effect */}
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
            maxWidth: '600px',
            lineHeight: 1.6,
            marginBottom: '40px',
          }}>
            Send one prompt to ChatGPT, Claude, Gemini, and Grok. Get an AI-powered consensus summary. 
            Make smarter decisions with the Council of LLMs.
          </p>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', alignItems: 'center' }}>
            <button
              onClick={() => onNavigate('select-plan')}
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

      {/* Features Section */}
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
            Everything You Need to{' '}
            <span style={{
              background: currentTheme.accentGradient,
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
            }}>Compare AI</span>
          </h2>
          <p style={{
            color: 'rgba(255, 255, 255, 0.5)',
            fontSize: '1.1rem',
            maxWidth: '600px',
            margin: '0 auto',
          }}>
            ArkitekAI brings the world's leading AI models together in one platform, so you get the best answer every time.
          </p>
        </motion.div>

        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))',
          gap: '24px',
        }}>
          {features.map((feature, idx) => (
            <motion.div
              key={idx}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.5, delay: idx * 0.1 }}
              onMouseEnter={() => setHoveredFeature(idx)}
              onMouseLeave={() => setHoveredFeature(null)}
              style={{
                padding: '32px',
                background: hoveredFeature === idx
                  ? 'rgba(93, 173, 226, 0.06)'
                  : 'rgba(255, 255, 255, 0.02)',
                border: `1px solid ${hoveredFeature === idx ? 'rgba(93, 173, 226, 0.3)' : 'rgba(255, 255, 255, 0.06)'}`,
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

      {/* How It Works Section */}
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
              Three simple steps to smarter AI responses
            </p>
          </motion.div>

          {[
            {
              step: '1',
              title: 'Enter Your Prompt',
              description: 'Type any prompt in and hit send.',
            },
            {
              step: '2',
              title: 'Council of LLM(s) Respond',
              description: 'All selected models from before you sent in the prompt will provide a response for you to see.',
            },
            {
              step: '3',
              title: 'Get the Prompt Consensus',
              description: 'An AI judge will analyze the Council of LLMs\'s responses and deliver a consensus summary of model agreements, disagreements, and key insights.',
            },
          ].map((item, idx) => (
            <motion.div
              key={idx}
              initial={{ opacity: 0, x: -20 }}
              whileInView={{ opacity: 1, x: 0 }}
              viewport={{ once: true }}
              transition={{ delay: idx * 0.15 }}
              style={{
                display: 'flex',
                gap: '24px',
                alignItems: 'flex-start',
                marginBottom: idx < 2 ? '40px' : 0,
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

      {/* Pricing Section */}
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
          maxWidth: '700px',
          margin: '0 auto',
        }}>
          {/* Free Plan */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            onClick={() => onNavigate('select-plan')}
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
            onClick={() => onNavigate('select-plan')}
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

      {/* Security / Trust Section */}
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

      {/* Footer */}
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

