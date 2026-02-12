import React from 'react'
import { motion } from 'framer-motion'
import { X } from 'lucide-react'
import { useStore } from '../store/useStore'
import logoImage from '../../ARKTEK_LOGO.png'

const WelcomeScreen = () => {
  const setShowWelcome = useStore((state) => state.setShowWelcome)

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="welcome-screen"
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        width: '100vw',
        height: '100vh',
        background: 'linear-gradient(135deg, #000000 0%, #0a0a1a 50%, #000000 100%)',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 1000,
        overflow: 'hidden',
      }}
    >
      {/* Close Button */}
      <motion.button
        onClick={() => setShowWelcome(false)}
        style={{
          position: 'absolute',
          top: '20px',
          right: '20px',
          width: '40px',
          height: '40px',
          background: 'rgba(0, 0, 0, 0.5)',
          border: '1px solid rgba(255, 255, 255, 0.3)',
          borderRadius: '50%',
          color: '#ffffff',
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 1001,
          transition: 'all 0.3s ease',
        }}
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
      <div
        style={{
          position: 'absolute',
          width: '100%',
          height: '100%',
          overflow: 'hidden',
        }}
      >
        {[...Array(50)].map((_, i) => (
          <motion.div
            key={i}
            style={{
              position: 'absolute',
              width: '2px',
              height: '2px',
              background: i % 2 === 0 ? '#5dade2' : '#48c9b0',
              borderRadius: '50%',
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
      <motion.img
        src={logoImage}
        alt="ArkiTek Logo"
        style={{
          width: '300px',
          height: 'auto',
          marginBottom: '40px',
          filter: 'drop-shadow(0 0 20px rgba(93, 173, 226, 0.5))',
        }}
        animate={{
          scale: [1, 1.05, 1],
        }}
        transition={{
          duration: 3,
          repeat: Infinity,
        }}
      />

      {/* Slogan */}
      <motion.h1
        style={{
          fontSize: '2.5rem',
          fontWeight: 'bold',
          background: 'linear-gradient(90deg, #5dade2, #48c9b0)',
          WebkitBackgroundClip: 'text',
          WebkitTextFillColor: 'transparent',
          marginBottom: '20px',
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
          padding: '0 40px',
          textAlign: 'center',
          marginBottom: '40px',
        }}
        initial={{ y: 20, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ delay: 0.5 }}
      >
        <p
          style={{
            fontSize: '1.2rem',
            lineHeight: '1.8',
            color: '#cccccc',
            marginBottom: '20px',
          }}
        >
          ArkiTek is the ultimate multi-LLM comparison platform. Experience
          responses from the world's leading AI models side-by-side, rate their
          performance, and discover which model excels at different tasks.
        </p>
        <p
          style={{
            fontSize: '1.1rem',
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
          borderRadius: '12px',
          padding: '24px 40px',
          marginBottom: '40px',
          textAlign: 'center',
        }}
        initial={{ y: 20, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ delay: 0.7 }}
      >
        <h2
          style={{
            fontSize: '1.5rem',
            marginBottom: '12px',
            background: 'linear-gradient(90deg, #5dade2, #48c9b0)',
            WebkitBackgroundClip: 'text',
            WebkitTextFillColor: 'transparent',
          }}
        >
          Subscription Pricing
        </h2>
        <p style={{ fontSize: '1rem', color: '#cccccc' }}>
          Base subscription: <strong style={{ color: '#48c9b0' }}>$15/month</strong>
        </p>
        <p style={{ fontSize: '0.9rem', color: '#aaaaaa', marginTop: '8px' }}>
          Additional charges apply based on token usage when using our API keys.
          <br />
          You can also use your own API keys to avoid additional charges.
        </p>
      </motion.div>

      {/* Get Started Button */}
      <motion.button
        onClick={() => setShowWelcome(false)}
        style={{
          padding: '16px 48px',
          fontSize: '1.2rem',
          fontWeight: 'bold',
          background: 'linear-gradient(90deg, #5dade2, #48c9b0)',
          border: 'none',
          borderRadius: '8px',
          color: '#000000',
          cursor: 'pointer',
          boxShadow: '0 0 20px rgba(93, 173, 226, 0.5)',
          transition: 'all 0.3s ease',
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

