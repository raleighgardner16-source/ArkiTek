import React, { useState } from 'react'
import { motion } from 'framer-motion'
import { LogIn, UserPlus, Mail, Lock, User, CreditCard } from 'lucide-react'
import { useStore } from '../store/useStore'
import { getTheme } from '../utils/theme'
import axios from 'axios'
import { API_URL } from '../utils/config'

const AuthView = () => {
  const [isSignUp, setIsSignUp] = useState(false)
  const [formData, setFormData] = useState({
    firstName: '',
    lastName: '',
    username: '',
    email: '',
    password: '',
  })
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  // Always use dark theme for the auth page
  const currentTheme = getTheme('dark')
  const setCurrentUser = useStore((state) => state.setCurrentUser)
  const setShowWelcome = useStore((state) => state.setShowWelcome)
  const clearSelectedModels = useStore((state) => state.clearSelectedModels)

  const handleChange = (e) => {
    setFormData({
      ...formData,
      [e.target.name]: e.target.value,
    })
    setError('')
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')
    setLoading(true)

    try {
      // Validate password length on frontend
      if (isSignUp && formData.password.length < 8) {
        setError('Password must be at least 8 characters')
        setLoading(false)
        return
      }

      const endpoint = isSignUp ? '/api/auth/signup' : '/api/auth/signin'
      const response = await axios.post(`${API_URL}${endpoint}`, formData)

      if (response.data.success) {
        const user = response.data.user

        // Clear selected models when user signs in/up
        clearSelectedModels()
        // Store user data in the store
        setCurrentUser(user)
        // App.jsx subscription gate will handle showing the payment form for new users
        setShowWelcome(false)
      }
    } catch (err) {
      console.error('Auth error:', err)
      const errorMessage = err.response?.data?.error || err.message || 'An error occurred. Please try again.'
      setError(errorMessage)
    } finally {
      setLoading(false)
    }
  }

  return (
    <>
      <style>
        {`
          input[name="firstName"],
          input[name="lastName"],
          input[name="username"],
          input[name="email"],
          input[name="password"] {
            background: ${currentTheme.buttonBackground} !important;
            color: ${currentTheme.text} !important;
          }
          input[name="firstName"]:-webkit-autofill,
          input[name="firstName"]:-webkit-autofill:hover,
          input[name="firstName"]:-webkit-autofill:focus,
          input[name="firstName"]:-webkit-autofill:active,
          input[name="lastName"]:-webkit-autofill,
          input[name="lastName"]:-webkit-autofill:hover,
          input[name="lastName"]:-webkit-autofill:focus,
          input[name="lastName"]:-webkit-autofill:active,
          input[name="username"]:-webkit-autofill,
          input[name="username"]:-webkit-autofill:hover,
          input[name="username"]:-webkit-autofill:focus,
          input[name="username"]:-webkit-autofill:active,
          input[name="email"]:-webkit-autofill,
          input[name="email"]:-webkit-autofill:hover,
          input[name="email"]:-webkit-autofill:focus,
          input[name="email"]:-webkit-autofill:active,
          input[name="password"]:-webkit-autofill,
          input[name="password"]:-webkit-autofill:hover,
          input[name="password"]:-webkit-autofill:focus,
          input[name="password"]:-webkit-autofill:active {
            -webkit-box-shadow: 0 0 0 1000px ${currentTheme.buttonBackground} inset !important;
            -webkit-text-fill-color: ${currentTheme.text} !important;
            background-color: ${currentTheme.buttonBackground} !important;
            caret-color: ${currentTheme.text} !important;
            transition: background-color 5000s ease-in-out 0s !important;
          }
          input[name="firstName"]:focus,
          input[name="lastName"]:focus,
          input[name="username"]:focus,
          input[name="email"]:focus,
          input[name="password"]:focus {
            background: ${currentTheme.buttonBackground} !important;
            border-color: ${currentTheme.borderActive} !important;
            -webkit-box-shadow: 0 0 0 1000px ${currentTheme.buttonBackground} inset !important;
          }
          input[name="firstName"]::selection,
          input[name="lastName"]::selection,
          input[name="username"]::selection,
          input[name="email"]::selection,
          input[name="password"]::selection {
            background: ${currentTheme.buttonBackgroundActive} !important;
            color: ${currentTheme.text} !important;
          }
          input[name="firstName"]::placeholder,
          input[name="lastName"]::placeholder,
          input[name="username"]::placeholder,
          input[name="email"]::placeholder,
          input[name="password"]::placeholder {
            color: rgba(255, 255, 255, 0.35) !important;
            -webkit-text-fill-color: rgba(255, 255, 255, 0.35) !important;
          }
        `}
      </style>
      <div
        style={{
          position: 'fixed',
          top: 0,
          left: 0,
          width: '100%',
          height: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: 'linear-gradient(135deg, #0a0a0a 0%, #1a1a2e 100%)',
          zIndex: 1000,
        }}
      >
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        style={{
          width: '100%',
          maxWidth: '450px',
          padding: '40px',
          background: currentTheme.backgroundOverlay,
          border: `1px solid ${currentTheme.borderLight}`,
          borderRadius: '20px',
          boxShadow: `0 0 40px ${currentTheme.shadowLight}`,
        }}
      >
        {/* Header */}
        <div style={{ textAlign: 'center', marginBottom: '30px' }}>
          <h1
            key="title-dark"
            style={{
              fontSize: '2.5rem',
              marginBottom: '10px',
              background: currentTheme.accentGradient,
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
              color: currentTheme.accent,
              display: 'inline-block',
            }}
          >
            ArkiTek
          </h1>
          <p style={{ color: currentTheme.textSecondary, fontSize: '1rem' }}>
            {isSignUp ? 'Create your account' : 'Sign in to your account'}
          </p>
        </div>

        {/* Error Message */}
        {error && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            style={{
              padding: '12px',
              marginBottom: '20px',
              background: 'rgba(255, 0, 0, 0.2)',
              border: '1px solid rgba(255, 0, 0, 0.5)',
              borderRadius: '8px',
              color: '#FF6B6B',
              fontSize: '0.9rem',
            }}
          >
            {error}
          </motion.div>
        )}

        {/* Form */}
        <form onSubmit={handleSubmit}>
          {isSignUp && (
            <>
              <div style={{ marginBottom: '20px' }}>
                <label
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                    marginBottom: '8px',
                    color: currentTheme.text,
                    fontSize: '0.9rem',
                  }}
                >
                  <User size={16} />
                  First Name
                </label>
                <input
                  type="text"
                  name="firstName"
                  value={formData.firstName}
                  onChange={handleChange}
                  required
                  autoComplete="given-name"
                  placeholder="Enter your first name"
                  style={{
                    width: '100%',
                    padding: '12px',
                    background: 'rgba(93, 173, 226, 0.05) !important',
                    border: '1px solid rgba(93, 173, 226, 0.3)',
                    borderRadius: '8px',
                    color: '#ffffff !important',
                    fontSize: '1rem',
                    outline: 'none',
                    WebkitTextFillColor: '#ffffff',
                    WebkitBoxShadow: '0 0 0 1000px rgba(93, 173, 226, 0.05) inset',
                  }}
                  onFocus={(e) => {
                    e.target.style.background = 'rgba(93, 173, 226, 0.05) !important'
                    e.target.style.borderColor = 'rgba(93, 173, 226, 0.5)'
                    e.target.style.WebkitBoxShadow = '0 0 0 1000px rgba(93, 173, 226, 0.05) inset'
                  }}
                  onBlur={(e) => {
                    e.target.style.background = 'rgba(93, 173, 226, 0.05) !important'
                    e.target.style.borderColor = 'rgba(93, 173, 226, 0.3)'
                    e.target.style.WebkitBoxShadow = '0 0 0 1000px rgba(93, 173, 226, 0.05) inset'
                  }}
                />
              </div>

              <div style={{ marginBottom: '20px' }}>
                <label
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                    marginBottom: '8px',
                    color: currentTheme.text,
                    fontSize: '0.9rem',
                  }}
                >
                  <User size={16} />
                  Last Name
                </label>
                <input
                  type="text"
                  name="lastName"
                  value={formData.lastName}
                  onChange={handleChange}
                  required
                  autoComplete="family-name"
                  placeholder="Enter your last name"
                  style={{
                    width: '100%',
                    padding: '12px',
                    background: 'rgba(93, 173, 226, 0.05) !important',
                    border: '1px solid rgba(93, 173, 226, 0.3)',
                    borderRadius: '8px',
                    color: '#ffffff !important',
                    fontSize: '1rem',
                    outline: 'none',
                    WebkitTextFillColor: '#ffffff',
                    WebkitBoxShadow: '0 0 0 1000px rgba(93, 173, 226, 0.05) inset',
                  }}
                  onFocus={(e) => {
                    e.target.style.background = 'rgba(93, 173, 226, 0.05) !important'
                    e.target.style.borderColor = 'rgba(93, 173, 226, 0.5)'
                    e.target.style.WebkitBoxShadow = '0 0 0 1000px rgba(93, 173, 226, 0.05) inset'
                  }}
                  onBlur={(e) => {
                    e.target.style.background = 'rgba(93, 173, 226, 0.05) !important'
                    e.target.style.borderColor = 'rgba(93, 173, 226, 0.3)'
                    e.target.style.WebkitBoxShadow = '0 0 0 1000px rgba(93, 173, 226, 0.05) inset'
                  }}
                />
              </div>
            </>
          )}

          <div style={{ marginBottom: '20px' }}>
            <label
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                marginBottom: '8px',
                color: '#ffffff',
                fontSize: '0.9rem',
              }}
            >
              <User size={16} />
              Username
            </label>
            <input
              type="text"
              name="username"
              value={formData.username}
              onChange={handleChange}
              required
              autoComplete="username"
              placeholder={isSignUp ? "Choose a username" : "Enter your username"}
              style={{
                width: '100%',
                padding: '12px',
                background: 'rgba(93, 173, 226, 0.05) !important',
                border: '1px solid rgba(93, 173, 226, 0.3)',
                borderRadius: '8px',
                color: '#ffffff !important',
                fontSize: '1rem',
                outline: 'none',
                WebkitTextFillColor: '#ffffff',
                WebkitBoxShadow: '0 0 0 1000px rgba(93, 173, 226, 0.05) inset',
              }}
              onFocus={(e) => {
                e.target.style.background = 'rgba(93, 173, 226, 0.05) !important'
                e.target.style.borderColor = 'rgba(93, 173, 226, 0.5)'
                e.target.style.WebkitBoxShadow = '0 0 0 1000px rgba(93, 173, 226, 0.05) inset'
              }}
              onBlur={(e) => {
                e.target.style.background = 'rgba(93, 173, 226, 0.05) !important'
                e.target.style.borderColor = 'rgba(93, 173, 226, 0.3)'
                e.target.style.WebkitBoxShadow = '0 0 0 1000px rgba(93, 173, 226, 0.05) inset'
              }}
            />
          </div>

          {isSignUp && (
            <div style={{ marginBottom: '20px' }}>
              <label
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  marginBottom: '8px',
                  color: '#ffffff',
                  fontSize: '0.9rem',
                }}
              >
                <Mail size={16} />
                Email
              </label>
              <input
                type="email"
                name="email"
                value={formData.email}
                onChange={handleChange}
                required
                autoComplete="email"
                placeholder="Enter your email address"
                style={{
                  width: '100%',
                  padding: '12px',
                  background: 'rgba(93, 173, 226, 0.05) !important',
                  border: '1px solid rgba(93, 173, 226, 0.3)',
                  borderRadius: '8px',
                  color: '#ffffff !important',
                  fontSize: '1rem',
                  outline: 'none',
                  WebkitTextFillColor: '#ffffff',
                  WebkitBoxShadow: '0 0 0 1000px rgba(93, 173, 226, 0.05) inset',
                }}
                onFocus={(e) => {
                  e.target.style.background = 'rgba(93, 173, 226, 0.1) !important'
                  e.target.style.borderColor = 'rgba(93, 173, 226, 0.5)'
                  e.target.style.WebkitBoxShadow = '0 0 0 1000px rgba(93, 173, 226, 0.1) inset'
                }}
                onBlur={(e) => {
                  e.target.style.background = 'rgba(93, 173, 226, 0.05) !important'
                  e.target.style.borderColor = 'rgba(93, 173, 226, 0.3)'
                  e.target.style.WebkitBoxShadow = '0 0 0 1000px rgba(93, 173, 226, 0.05) inset'
                }}
              />
            </div>
          )}

          <div style={{ marginBottom: '30px' }}>
            <label
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                marginBottom: '8px',
                color: '#ffffff',
                fontSize: '0.9rem',
              }}
            >
              <Lock size={16} />
              Password
            </label>
            <input
              type="password"
              name="password"
              value={formData.password}
              onChange={handleChange}
              required
              minLength={8}
              autoComplete={isSignUp ? "new-password" : "current-password"}
              placeholder={isSignUp ? "Create a password (min. 8 characters)" : "Enter your password"}
              style={{
                width: '100%',
                padding: '12px',
                background: 'rgba(93, 173, 226, 0.05) !important',
                border: '1px solid rgba(93, 173, 226, 0.3)',
                borderRadius: '8px',
                color: '#ffffff !important',
                fontSize: '1rem',
                outline: 'none',
                WebkitTextFillColor: '#ffffff',
                WebkitBoxShadow: '0 0 0 1000px rgba(93, 173, 226, 0.05) inset',
              }}
              onFocus={(e) => {
                e.target.style.background = 'rgba(93, 173, 226, 0.05) !important'
                e.target.style.borderColor = 'rgba(93, 173, 226, 0.5)'
                e.target.style.WebkitBoxShadow = '0 0 0 1000px rgba(93, 173, 226, 0.05) inset'
              }}
              onBlur={(e) => {
                e.target.style.background = 'rgba(93, 173, 226, 0.05) !important'
                e.target.style.borderColor = 'rgba(93, 173, 226, 0.3)'
                e.target.style.WebkitBoxShadow = '0 0 0 1000px rgba(93, 173, 226, 0.05) inset'
              }}
            />
          </div>

          <motion.button
            type="submit"
            disabled={loading}
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            style={{
              width: '100%',
              padding: '14px',
              background: loading
                ? 'rgba(128, 128, 128, 0.3)'
                : 'linear-gradient(135deg, #5dade2, #48c9b0)',
              border: 'none',
              borderRadius: '8px',
              color: loading ? '#666666' : '#000000',
              fontSize: '1rem',
              fontWeight: 'bold',
              cursor: loading ? 'not-allowed' : 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '8px',
              marginBottom: '20px',
            }}
          >
            {loading ? (
              <>Loading...</>
            ) : isSignUp ? (
              <>
                <UserPlus size={18} />
                Create Account
              </>
            ) : (
              <>
                <LogIn size={18} />
                Sign In
              </>
            )}
          </motion.button>

          {isSignUp && (
            <div style={{
              textAlign: 'center',
              marginBottom: '16px',
              padding: '12px',
              background: 'rgba(93, 173, 226, 0.05)',
              border: '1px solid rgba(93, 173, 226, 0.15)',
              borderRadius: '8px',
            }}>
              <p style={{
                color: 'rgba(255, 255, 255, 0.6)',
                fontSize: '0.8rem',
                margin: 0,
                lineHeight: 1.5,
              }}>
                <CreditCard size={14} style={{ verticalAlign: 'middle', marginRight: '6px' }} />
                A subscription ($15/mo) is required to use ArkiTek. You'll enter your payment info after creating your account. Includes $5/mo in usage credits.
              </p>
            </div>
          )}
        </form>

        {/* Toggle Sign In/Sign Up */}
        <div style={{ textAlign: 'center' }}>
          <button
            onClick={() => {
              setIsSignUp(!isSignUp)
              setError('')
              setFormData({
                firstName: '',
                lastName: '',
                username: '',
                email: '',
                password: '',
              })
            }}
            style={{
              background: 'none',
              border: 'none',
              color: '#5dade2',
              cursor: 'pointer',
              fontSize: '0.9rem',
              textDecoration: 'underline',
            }}
          >
            {isSignUp
              ? 'Already have an account? Sign in'
              : "Don't have an account? Sign up"}
          </button>
        </div>
      </motion.div>
    </div>
    </>
  )
}

export default AuthView

