import React from 'react'
import { motion } from 'framer-motion'
import { X } from 'lucide-react'
import { useStore } from '../store/useStore'
import { spacing, fontSize, fontWeight, radius, zIndex, transition, layout, sx, createStyles } from '../utils/styles'
import { getTheme } from '../utils/theme'

const WelcomeScreen = () => {
  const setShowWelcome = useStore((state) => state.setShowWelcome)
  const s = createStyles(getTheme('dark'))

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="welcome-screen"
      style={sx(layout.center, {
        position: 'fixed',
        top: 0,
        left: 0,
        width: '100vw',
        height: '100vh',
        background: 'linear-gradient(135deg, #000000 0%, #0a0a1a 50%, #000000 100%)',
        flexDirection: 'column',
        zIndex: zIndex.modal,
        overflow: 'hidden',
      })}
    >
      {/* Close Button */}
      <motion.button
        onClick={() => setShowWelcome(false)}
        style={sx(layout.center, {
          position: 'absolute',
          top: spacing['2xl'],
          right: spacing['2xl'],
          width: spacing['5xl'],
          height: spacing['5xl'],
          background: 'rgba(0, 0, 0, 0.5)',
          border: '1px solid rgba(255, 255, 255, 0.3)',
          borderRadius: radius.circle,
          color: '#ffffff',
          cursor: 'pointer',
          zIndex: zIndex.modal,
          transition: transition.slow,
        })}
        whileHover={{
          background: 'rgba(255, 255, 255, 0.2)',
          border: '1px solid rgba(255, 255, 255, 0.5)',
          scale: 1.1,
        }}
        whileTap={{ scale: 0.9 }}
        initial={{ opacity: 0, scale: 0.8 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ delay: 1 }}
      >
        <X size={24} />
      </motion.button>

      {/* Animated background particles */}
      <div style={sx(layout.absoluteFill, { overflow: 'hidden' })}>
        {[...Array(50)].map((_, i) => (
          <motion.div
            key={i}
            style={{
              position: 'absolute',
              width: '2px',
              height: '2px',
              background: i % 2 === 0 ? '#5dade2' : '#48c9b0',
              borderRadius: radius.circle,
              left: `${Math.random() * 100}%`,
              top: `${Math.random() * 100}%`,
            }}
            animate={{
              y: [0, -100, 0],
              x: [0, Math.random() * 50 - 25, 0],
              opacity: [0, 1, 0],
            }}
            transition={{
              duration: 3 + Math.random() * 2,
              repeat: Infinity,
              delay: Math.random() * 2,
            }}
          />
        ))}
      </div>

      {/* Logo */}
      <motion.span
        style={sx(s.gradientText, {
          fontSize: 'clamp(2.5rem, 6vw, 4rem)',
          fontWeight: fontWeight.extrabold,
          marginBottom: spacing['5xl'],
          filter: 'drop-shadow(0 0 20px rgba(93, 173, 226, 0.5))',
        })}
        animate={{
          scale: [1, 1.05, 1],
        }}
        transition={{
          duration: 3,
          repeat: Infinity,
        }}
      >
        ArkitekAI
      </motion.span>

      {/* Slogan */}
      <motion.h1
        style={{
          fontSize: fontSize['7xl'],
          fontWeight: fontWeight.bold,
          background: 'linear-gradient(90deg, #5dade2, #48c9b0)',
          WebkitBackgroundClip: 'text',
          WebkitTextFillColor: 'transparent',
          marginBottom: spacing['2xl'],
          textAlign: 'center',
        }}
        initial={{ y: 20, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ delay: 0.3 }}
      >
        Compare. Rate. Optimize.
      </motion.h1>

      {/* Description */}
      <motion.div
        style={{
          maxWidth: '800px',
          padding: `0 ${spacing['5xl']}`,
          textAlign: 'center',
          marginBottom: spacing['5xl'],
        }}
        initial={{ y: 20, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ delay: 0.5 }}
      >
        <p
          style={{
            fontSize: fontSize['4xl'],
            lineHeight: '1.8',
            color: '#cccccc',
            marginBottom: spacing['2xl'],
          }}
        >
          ArkiTek is the ultimate multi-LLM comparison platform. Experience
          responses from the world's leading AI models side-by-side, rate their
          performance, and discover which model excels at different tasks.
        </p>
        <p
          style={{
            fontSize: fontSize['3xl'],
            lineHeight: '1.8',
            color: '#aaaaaa',
          }}
        >
          Immerse yourself in customizable VR-like environments, track your
          progress through gamified statistics, and let the interface adapt to
          your queries with intelligent theme generation.
        </p>
      </motion.div>

      {/* Pricing Info */}
      <motion.div
        style={{
          background: 'rgba(93, 173, 226, 0.1)',
          border: '1px solid rgba(93, 173, 226, 0.3)',
          borderRadius: radius.xl,
          padding: `${spacing['3xl']} ${spacing['5xl']}`,
          marginBottom: spacing['5xl'],
          textAlign: 'center',
        }}
        initial={{ y: 20, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ delay: 0.7 }}
      >
        <h2
          style={{
            fontSize: fontSize['6xl'],
            marginBottom: spacing.lg,
            background: 'linear-gradient(90deg, #5dade2, #48c9b0)',
            WebkitBackgroundClip: 'text',
            WebkitTextFillColor: 'transparent',
          }}
        >
          Subscription Pricing
        </h2>
        <p style={{ fontSize: fontSize['2xl'], color: '#cccccc' }}>
          Base subscription: <strong style={{ color: '#48c9b0' }}>$19.95/month</strong>
        </p>
        <p style={{ fontSize: fontSize.lg, color: '#aaaaaa', marginTop: spacing.md }}>
          Additional charges apply based on token usage when using our API keys.
          <br />
          You can also use your own API keys to avoid additional charges.
        </p>
      </motion.div>

      {/* Get Started Button */}
      <motion.button
        onClick={() => setShowWelcome(false)}
        style={{
          padding: `${spacing.xl} 48px`,
          fontSize: fontSize['4xl'],
          fontWeight: fontWeight.bold,
          background: 'linear-gradient(90deg, #5dade2, #48c9b0)',
          border: 'none',
          borderRadius: radius.md,
          color: '#000000',
          cursor: 'pointer',
          boxShadow: '0 0 20px rgba(93, 173, 226, 0.5)',
          transition: transition.slow,
        }}
        initial={{ y: 20, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ delay: 0.9 }}
        whileHover={{
          scale: 1.05,
          boxShadow: '0 0 30px rgba(93, 173, 226, 0.8)',
        }}
        whileTap={{ scale: 0.95 }}
      >
        Get Started
      </motion.button>
    </motion.div>
  )
}

export default WelcomeScreen
