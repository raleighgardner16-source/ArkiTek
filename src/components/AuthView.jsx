import React, { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { LogIn, UserPlus, Mail, Lock, User, CreditCard, ArrowLeft, CheckCircle, KeyRound, Eye, EyeOff } from 'lucide-react'
import { useStore } from '../store/useStore'
import { getTheme } from '../utils/theme'
import axios from 'axios'
import { API_URL } from '../utils/config'

// Possible views: 'signin' | 'signup' | 'forgot-username' | 'forgot-password' | 'reset-password'

const AuthView = () => {
  const [view, setView] = useState('signin')
  const [formData, setFormData] = useState({
    firstName: '',
    lastName: '',
    username: '',
    email: '',
    password: '',
  })
  const [resetEmail, setResetEmail] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [resetToken, setResetToken] = useState('')
  const [error, setError] = useState('')
  const [successMessage, setSuccessMessage] = useState('')
  const [loading, setLoading] = useState(false)
  const [showPassword, setShowPassword] = useState(false)
  const [showNewPassword, setShowNewPassword] = useState(false)
  const [showConfirmPassword, setShowConfirmPassword] = useState(false)
  // Always use dark theme for the auth page
  const currentTheme = getTheme('dark')
  const setCurrentUser = useStore((state) => state.setCurrentUser)
  const setShowWelcome = useStore((state) => state.setShowWelcome)
  const clearSelectedModels = useStore((state) => state.clearSelectedModels)
  const setActiveTab = useStore((state) => state.setActiveTab)

  const isSignUp = view === 'signup'

  // Detect #reset-password?token=xxx in the URL on mount
  useEffect(() => {
    const hash = window.location.hash
    if (hash.startsWith('#reset-password')) {
      const params = new URLSearchParams(hash.split('?')[1] || '')
      const token = params.get('token')
      if (token) {
        setResetToken(token)
        setView('reset-password')
      }
    }
  }, [])

  const handleChange = (e) => {
    setFormData({
      ...formData,
      [e.target.name]: e.target.value,
    })
    setError('')
    setSuccessMessage('')
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')
    setSuccessMessage('')
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

        // Reset model initialization so MainView enables Auto Smart for all providers fresh
        clearSelectedModels()
        localStorage.removeItem('arktek-models-initialized')
        // Store user data in the store
        setCurrentUser(user)
        // Always start on the main page
        setActiveTab('home')
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

  // Forgot Username handler
  const handleForgotUsername = async (e) => {
    e.preventDefault()
    setError('')
    setSuccessMessage('')
    setLoading(true)

    try {
      if (!resetEmail.trim()) {
        setError('Please enter your email address')
        setLoading(false)
        return
      }

      const response = await axios.post(`${API_URL}/api/auth/forgot-username`, {
        email: resetEmail.trim(),
      })

      if (response.data.success) {
        setSuccessMessage(response.data.message || 'If an account exists with that email, your username has been sent.')
      }
    } catch (err) {
      console.error('Forgot username error:', err)
      setError(err.response?.data?.error || 'An error occurred. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  // Forgot Password handler
  const handleForgotPassword = async (e) => {
    e.preventDefault()
    setError('')
    setSuccessMessage('')
    setLoading(true)

    try {
      if (!resetEmail.trim()) {
        setError('Please enter your email address')
        setLoading(false)
        return
      }

      const response = await axios.post(`${API_URL}/api/auth/forgot-password`, {
        email: resetEmail.trim(),
      })

      if (response.data.success) {
        setSuccessMessage(response.data.message || 'If an account exists with that email, a reset link has been sent.')
      }
    } catch (err) {
      console.error('Forgot password error:', err)
      setError(err.response?.data?.error || 'An error occurred. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  // Reset Password handler
  const handleResetPassword = async (e) => {
    e.preventDefault()
    setError('')
    setSuccessMessage('')
    setLoading(true)

    try {
      if (newPassword.length < 8) {
        setError('Password must be at least 8 characters')
        setLoading(false)
        return
      }

      if (newPassword !== confirmPassword) {
        setError('Passwords do not match')
        setLoading(false)
        return
      }

      const response = await axios.post(`${API_URL}/api/auth/reset-password`, {
        token: resetToken,
        newPassword,
      })

      if (response.data.success) {
        setSuccessMessage(response.data.message || 'Your password has been reset. You can now sign in.')
        // Clear the hash from the URL
        window.location.hash = ''
        // After 3 seconds, switch to sign-in view
        setTimeout(() => {
          setView('signin')
          setSuccessMessage('')
          setNewPassword('')
          setConfirmPassword('')
          setResetToken('')
        }, 3000)
      }
    } catch (err) {
      console.error('Reset password error:', err)
      setError(err.response?.data?.error || 'An error occurred. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  // Navigate between views
  const goToView = (newView) => {
    setView(newView)
    setError('')
    setSuccessMessage('')
    setResetEmail('')
    setNewPassword('')
    setConfirmPassword('')
    if (newView === 'signin' || newView === 'signup') {
      setFormData({
        firstName: '',
        lastName: '',
        username: '',
        email: '',
        password: '',
      })
    }
  }

  // Input style helpers
  const inputStyle = {
    width: '100%',
    padding: '12px',
    background: 'rgba(93, 173, 226, 0.05)',
    border: '1px solid rgba(93, 173, 226, 0.3)',
    borderRadius: '8px',
    color: '#ffffff',
    fontSize: '1rem',
    outline: 'none',
    WebkitTextFillColor: '#ffffff',
    WebkitBoxShadow: '0 0 0 1000px rgba(93, 173, 226, 0.05) inset',
  }

  const handleFocus = (e) => {
    e.target.style.background = 'rgba(93, 173, 226, 0.05)'
    e.target.style.borderColor = 'rgba(93, 173, 226, 0.5)'
    e.target.style.WebkitBoxShadow = '0 0 0 1000px rgba(93, 173, 226, 0.05) inset'
  }

  const handleBlur = (e) => {
    e.target.style.background = 'rgba(93, 173, 226, 0.05)'
    e.target.style.borderColor = 'rgba(93, 173, 226, 0.3)'
    e.target.style.WebkitBoxShadow = '0 0 0 1000px rgba(93, 173, 226, 0.05) inset'
  }

  // Determine the title and subtitle for the current view
  const getViewInfo = () => {
    switch (view) {
      case 'signup':
        return { title: 'ArkiTek', subtitle: 'Create your account' }
      case 'forgot-username':
        return { title: 'Forgot Username', subtitle: 'Enter your email to receive your username' }
      case 'forgot-password':
        return { title: 'Forgot Password', subtitle: 'Enter your email to receive a reset link' }
      case 'reset-password':
        return { title: 'Reset Password', subtitle: 'Enter your new password' }
      default:
        return { title: 'ArkiTek', subtitle: 'Sign in to your account' }
    }
  }

  const viewInfo = getViewInfo()

  return (
    <>
      <style>
        {`
          input[name="firstName"],
          input[name="lastName"],
          input[name="username"],
          input[name="email"],
          input[name="password"],
          input[name="resetEmail"],
          input[name="newPassword"],
          input[name="confirmPassword"] {
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
          input[name="password"]:-webkit-autofill:active,
          input[name="resetEmail"]:-webkit-autofill,
          input[name="resetEmail"]:-webkit-autofill:hover,
          input[name="resetEmail"]:-webkit-autofill:focus,
          input[name="resetEmail"]:-webkit-autofill:active,
          input[name="newPassword"]:-webkit-autofill,
          input[name="newPassword"]:-webkit-autofill:hover,
          input[name="newPassword"]:-webkit-autofill:focus,
          input[name="newPassword"]:-webkit-autofill:active,
          input[name="confirmPassword"]:-webkit-autofill,
          input[name="confirmPassword"]:-webkit-autofill:hover,
          input[name="confirmPassword"]:-webkit-autofill:focus,
          input[name="confirmPassword"]:-webkit-autofill:active {
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
          input[name="password"]:focus,
          input[name="resetEmail"]:focus,
          input[name="newPassword"]:focus,
          input[name="confirmPassword"]:focus {
            background: ${currentTheme.buttonBackground} !important;
            border-color: ${currentTheme.borderActive} !important;
            -webkit-box-shadow: 0 0 0 1000px ${currentTheme.buttonBackground} inset !important;
          }
          input[name="firstName"]::selection,
          input[name="lastName"]::selection,
          input[name="username"]::selection,
          input[name="email"]::selection,
          input[name="password"]::selection,
          input[name="resetEmail"]::selection,
          input[name="newPassword"]::selection,
          input[name="confirmPassword"]::selection {
            background: ${currentTheme.buttonBackgroundActive} !important;
            color: ${currentTheme.text} !important;
          }
          input[name="firstName"]::placeholder,
          input[name="lastName"]::placeholder,
          input[name="username"]::placeholder,
          input[name="email"]::placeholder,
          input[name="password"]::placeholder,
          input[name="resetEmail"]::placeholder,
          input[name="newPassword"]::placeholder,
          input[name="confirmPassword"]::placeholder {
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
      <AnimatePresence mode="wait">
      <motion.div
        key={view}
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -20 }}
        transition={{ duration: 0.2 }}
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
        {/* Back button for forgot/reset views */}
        {(view === 'forgot-username' || view === 'forgot-password' || view === 'reset-password') && (
          <button
            onClick={() => goToView('signin')}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              background: 'none',
              border: 'none',
              color: currentTheme.textSecondary,
              cursor: 'pointer',
              fontSize: '0.85rem',
              marginBottom: '16px',
              padding: 0,
            }}
          >
            <ArrowLeft size={16} />
            Back to sign in
          </button>
        )}

        {/* Header */}
        <div style={{ textAlign: 'center', marginBottom: '30px' }}>
          <h1
            style={{
              fontSize: view === 'signin' || view === 'signup' ? '2.5rem' : '1.8rem',
              marginBottom: '10px',
              background: currentTheme.accentGradient,
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
              color: currentTheme.accent,
              display: 'inline-block',
            }}
          >
            {viewInfo.title}
          </h1>
          <p style={{ color: currentTheme.textSecondary, fontSize: '1rem' }}>
            {viewInfo.subtitle}
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

        {/* Success Message */}
        {successMessage && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            style={{
              padding: '12px',
              marginBottom: '20px',
              background: 'rgba(72, 201, 176, 0.15)',
              border: '1px solid rgba(72, 201, 176, 0.4)',
              borderRadius: '8px',
              color: '#48c9b0',
              fontSize: '0.9rem',
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
            }}
          >
            <CheckCircle size={18} />
            {successMessage}
          </motion.div>
        )}

        {/* ==================== SIGN IN / SIGN UP FORM ==================== */}
        {(view === 'signin' || view === 'signup') && (
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
                    style={inputStyle}
                    onFocus={handleFocus}
                    onBlur={handleBlur}
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
                    style={inputStyle}
                    onFocus={handleFocus}
                    onBlur={handleBlur}
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
                style={inputStyle}
                onFocus={handleFocus}
                onBlur={handleBlur}
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
                  style={inputStyle}
                  onFocus={(e) => {
                    e.target.style.background = 'rgba(93, 173, 226, 0.1)'
                    e.target.style.borderColor = 'rgba(93, 173, 226, 0.5)'
                    e.target.style.WebkitBoxShadow = '0 0 0 1000px rgba(93, 173, 226, 0.1) inset'
                  }}
                  onBlur={handleBlur}
                />
              </div>
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
                <Lock size={16} />
                Password
              </label>
              <div style={{ position: 'relative' }}>
                <input
                  type={showPassword ? "text" : "password"}
                  name="password"
                  value={formData.password}
                  onChange={handleChange}
                  required
                  minLength={8}
                  autoComplete={isSignUp ? "new-password" : "current-password"}
                  placeholder={isSignUp ? "Create a password (min. 8 characters)" : "Enter your password"}
                  style={{ ...inputStyle, paddingRight: '44px' }}
                  onFocus={handleFocus}
                  onBlur={handleBlur}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  style={{
                    position: 'absolute',
                    right: '12px',
                    top: '50%',
                    transform: 'translateY(-50%)',
                    background: 'none',
                    border: 'none',
                    cursor: 'pointer',
                    padding: '4px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: currentTheme.textMuted,
                  }}
                  tabIndex={-1}
                >
                  {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
            </div>

            {/* Forgot links (only on sign in) */}
            {!isSignUp && (
              <div style={{
                display: 'flex',
                justifyContent: 'space-between',
                marginBottom: '24px',
                marginTop: '-8px',
              }}>
                <button
                  type="button"
                  onClick={() => goToView('forgot-username')}
                  style={{
                    background: 'none',
                    border: 'none',
                    color: currentTheme.textMuted,
                    cursor: 'pointer',
                    fontSize: '0.8rem',
                    padding: 0,
                    textDecoration: 'none',
                  }}
                  onMouseEnter={(e) => e.target.style.color = currentTheme.accent}
                  onMouseLeave={(e) => e.target.style.color = currentTheme.textMuted}
                >
                  Forgot username?
                </button>
                <button
                  type="button"
                  onClick={() => goToView('forgot-password')}
                  style={{
                    background: 'none',
                    border: 'none',
                    color: currentTheme.textMuted,
                    cursor: 'pointer',
                    fontSize: '0.8rem',
                    padding: 0,
                    textDecoration: 'none',
                  }}
                  onMouseEnter={(e) => e.target.style.color = currentTheme.accent}
                  onMouseLeave={(e) => e.target.style.color = currentTheme.textMuted}
                >
                  Forgot password?
                </button>
              </div>
            )}

            {isSignUp && <div style={{ marginBottom: '10px' }} />}

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
                  A subscription ($19.95/mo) is required to use ArkiTek. You'll enter your payment info after creating your account. Includes $5/mo in usage credits.
                </p>
              </div>
            )}

            {/* Toggle Sign In/Sign Up */}
            <div style={{ textAlign: 'center' }}>
              <button
                type="button"
                onClick={() => goToView(isSignUp ? 'signin' : 'signup')}
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
          </form>
        )}

        {/* ==================== FORGOT USERNAME ==================== */}
        {view === 'forgot-username' && (
          <form onSubmit={handleForgotUsername}>
            <div style={{
              textAlign: 'center',
              marginBottom: '24px',
              padding: '16px',
              background: 'rgba(93, 173, 226, 0.05)',
              border: '1px solid rgba(93, 173, 226, 0.15)',
              borderRadius: '10px',
            }}>
              <Mail size={32} style={{ color: currentTheme.accent, marginBottom: '8px' }} />
              <p style={{ color: currentTheme.textSecondary, fontSize: '0.85rem', margin: 0, lineHeight: 1.5 }}>
                Enter the email address associated with your account and we'll send you your username.
              </p>
            </div>

            <div style={{ marginBottom: '24px' }}>
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
                <Mail size={16} />
                Email Address
              </label>
              <input
                type="email"
                name="resetEmail"
                value={resetEmail}
                onChange={(e) => { setResetEmail(e.target.value); setError(''); setSuccessMessage('') }}
                required
                autoComplete="email"
                placeholder="Enter your email address"
                style={inputStyle}
                onFocus={handleFocus}
                onBlur={handleBlur}
              />
            </div>

            <motion.button
              type="submit"
              disabled={loading || !!successMessage}
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              style={{
                width: '100%',
                padding: '14px',
                background: (loading || successMessage)
                  ? 'rgba(128, 128, 128, 0.3)'
                  : 'linear-gradient(135deg, #5dade2, #48c9b0)',
                border: 'none',
                borderRadius: '8px',
                color: (loading || successMessage) ? '#666666' : '#000000',
                fontSize: '1rem',
                fontWeight: 'bold',
                cursor: (loading || successMessage) ? 'not-allowed' : 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '8px',
                marginBottom: '20px',
              }}
            >
              {loading ? (
                <>Sending...</>
              ) : successMessage ? (
                <>
                  <CheckCircle size={18} />
                  Email Sent
                </>
              ) : (
                <>
                  <Mail size={18} />
                  Send My Username
                </>
              )}
            </motion.button>

            <div style={{ textAlign: 'center' }}>
              <button
                type="button"
                onClick={() => goToView('signin')}
                style={{
                  background: 'none',
                  border: 'none',
                  color: '#5dade2',
                  cursor: 'pointer',
                  fontSize: '0.9rem',
                  textDecoration: 'underline',
                }}
              >
                Back to sign in
              </button>
            </div>
          </form>
        )}

        {/* ==================== FORGOT PASSWORD ==================== */}
        {view === 'forgot-password' && (
          <form onSubmit={handleForgotPassword}>
            <div style={{
              textAlign: 'center',
              marginBottom: '24px',
              padding: '16px',
              background: 'rgba(93, 173, 226, 0.05)',
              border: '1px solid rgba(93, 173, 226, 0.15)',
              borderRadius: '10px',
            }}>
              <KeyRound size={32} style={{ color: currentTheme.accent, marginBottom: '8px' }} />
              <p style={{ color: currentTheme.textSecondary, fontSize: '0.85rem', margin: 0, lineHeight: 1.5 }}>
                Enter the email address associated with your account. We'll send you a link to reset your password. The link expires in 1 hour.
              </p>
            </div>

            <div style={{ marginBottom: '24px' }}>
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
                <Mail size={16} />
                Email Address
              </label>
              <input
                type="email"
                name="resetEmail"
                value={resetEmail}
                onChange={(e) => { setResetEmail(e.target.value); setError(''); setSuccessMessage('') }}
                required
                autoComplete="email"
                placeholder="Enter your email address"
                style={inputStyle}
                onFocus={handleFocus}
                onBlur={handleBlur}
              />
            </div>

            <motion.button
              type="submit"
              disabled={loading || !!successMessage}
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              style={{
                width: '100%',
                padding: '14px',
                background: (loading || successMessage)
                  ? 'rgba(128, 128, 128, 0.3)'
                  : 'linear-gradient(135deg, #5dade2, #48c9b0)',
                border: 'none',
                borderRadius: '8px',
                color: (loading || successMessage) ? '#666666' : '#000000',
                fontSize: '1rem',
                fontWeight: 'bold',
                cursor: (loading || successMessage) ? 'not-allowed' : 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '8px',
                marginBottom: '20px',
              }}
            >
              {loading ? (
                <>Sending...</>
              ) : successMessage ? (
                <>
                  <CheckCircle size={18} />
                  Reset Link Sent
                </>
              ) : (
                <>
                  <Mail size={18} />
                  Send Reset Link
                </>
              )}
            </motion.button>

            <div style={{ textAlign: 'center' }}>
              <button
                type="button"
                onClick={() => goToView('signin')}
                style={{
                  background: 'none',
                  border: 'none',
                  color: '#5dade2',
                  cursor: 'pointer',
                  fontSize: '0.9rem',
                  textDecoration: 'underline',
                }}
              >
                Back to sign in
              </button>
            </div>
          </form>
        )}

        {/* ==================== RESET PASSWORD (from email link) ==================== */}
        {view === 'reset-password' && (
          <form onSubmit={handleResetPassword}>
            <div style={{
              textAlign: 'center',
              marginBottom: '24px',
              padding: '16px',
              background: 'rgba(93, 173, 226, 0.05)',
              border: '1px solid rgba(93, 173, 226, 0.15)',
              borderRadius: '10px',
            }}>
              <Lock size={32} style={{ color: currentTheme.accent, marginBottom: '8px' }} />
              <p style={{ color: currentTheme.textSecondary, fontSize: '0.85rem', margin: 0, lineHeight: 1.5 }}>
                Choose a new password for your account. Must be at least 8 characters.
              </p>
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
                <Lock size={16} />
                New Password
              </label>
              <div style={{ position: 'relative' }}>
                <input
                  type={showNewPassword ? "text" : "password"}
                  name="newPassword"
                  value={newPassword}
                  onChange={(e) => { setNewPassword(e.target.value); setError(''); setSuccessMessage('') }}
                  required
                  minLength={8}
                  autoComplete="new-password"
                  placeholder="Enter new password (min. 8 characters)"
                  style={{ ...inputStyle, paddingRight: '44px' }}
                  onFocus={handleFocus}
                  onBlur={handleBlur}
                />
                <button
                  type="button"
                  onClick={() => setShowNewPassword(!showNewPassword)}
                  style={{
                    position: 'absolute',
                    right: '12px',
                    top: '50%',
                    transform: 'translateY(-50%)',
                    background: 'none',
                    border: 'none',
                    cursor: 'pointer',
                    padding: '4px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: currentTheme.textMuted,
                  }}
                  tabIndex={-1}
                >
                  {showNewPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
            </div>

            <div style={{ marginBottom: '24px' }}>
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
                <Lock size={16} />
                Confirm Password
              </label>
              <div style={{ position: 'relative' }}>
                <input
                  type={showConfirmPassword ? "text" : "password"}
                  name="confirmPassword"
                  value={confirmPassword}
                  onChange={(e) => { setConfirmPassword(e.target.value); setError(''); setSuccessMessage('') }}
                  required
                  minLength={8}
                  autoComplete="new-password"
                  placeholder="Confirm your new password"
                  style={{ ...inputStyle, paddingRight: '44px' }}
                  onFocus={handleFocus}
                  onBlur={handleBlur}
                />
                <button
                  type="button"
                  onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                  style={{
                    position: 'absolute',
                    right: '12px',
                    top: '50%',
                    transform: 'translateY(-50%)',
                    background: 'none',
                    border: 'none',
                    cursor: 'pointer',
                    padding: '4px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: currentTheme.textMuted,
                  }}
                  tabIndex={-1}
                >
                  {showConfirmPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
              {/* Password match indicator */}
              {confirmPassword && (
                <p style={{
                  fontSize: '0.8rem',
                  marginTop: '6px',
                  color: newPassword === confirmPassword ? '#48c9b0' : '#FF6B6B',
                }}>
                  {newPassword === confirmPassword ? '✓ Passwords match' : '✗ Passwords do not match'}
                </p>
              )}
            </div>

            <motion.button
              type="submit"
              disabled={loading || !!successMessage}
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              style={{
                width: '100%',
                padding: '14px',
                background: (loading || successMessage)
                  ? 'rgba(128, 128, 128, 0.3)'
                  : 'linear-gradient(135deg, #5dade2, #48c9b0)',
                border: 'none',
                borderRadius: '8px',
                color: (loading || successMessage) ? '#666666' : '#000000',
                fontSize: '1rem',
                fontWeight: 'bold',
                cursor: (loading || successMessage) ? 'not-allowed' : 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '8px',
                marginBottom: '20px',
              }}
            >
              {loading ? (
                <>Resetting...</>
              ) : successMessage ? (
                <>
                  <CheckCircle size={18} />
                  Password Reset!
                </>
              ) : (
                <>
                  <KeyRound size={18} />
                  Reset Password
                </>
              )}
            </motion.button>
          </form>
        )}
      </motion.div>
      </AnimatePresence>
    </div>
    </>
  )
}

export default AuthView
