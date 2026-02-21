import React, { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { LogIn, UserPlus, Mail, Lock, User, CreditCard, ArrowLeft, CheckCircle, KeyRound, Eye, EyeOff, ShieldCheck, Loader } from 'lucide-react'
import { useStore } from '../store/useStore'
import { getTheme } from '../utils/theme'
import axios from 'axios'
import { API_URL } from '../utils/config'
import FingerprintJS from '@fingerprintjs/fingerprintjs'

// Possible views: 'select-plan' | 'signin' | 'signup' | 'forgot-username' | 'forgot-password' | 'reset-password' | 'verification-pending' | 'verify-email'

const AuthView = ({ initialView, initialPlan, onNavigate }) => {
  const [view, setView] = useState(initialView || 'signin')
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
  const [selectedPlan, setSelectedPlan] = useState(initialPlan || 'free_trial')
  const [fingerprint, setFingerprint] = useState(null)
  const [verificationEmail, setVerificationEmail] = useState('')
  const [verificationUserId, setVerificationUserId] = useState('')
  const [verifyingEmail, setVerifyingEmail] = useState(false)
  const [resendCooldown, setResendCooldown] = useState(0)
  // Always use dark theme for the auth page
  const currentTheme = getTheme('dark')
  const setCurrentUser = useStore((state) => state.setCurrentUser)
  const setShowWelcome = useStore((state) => state.setShowWelcome)
  const clearSelectedModels = useStore((state) => state.clearSelectedModels)
  const setSelectedModels = useStore((state) => state.setSelectedModels)
  const setAutoSmartProviders = useStore((state) => state.setAutoSmartProviders)
  const setActiveTab = useStore((state) => state.setActiveTab)

  const isSignUp = view === 'signup'

  // Initialize FingerprintJS for device fingerprinting (free trial abuse prevention)
  useEffect(() => {
    const loadFingerprint = async () => {
      try {
        const fp = await FingerprintJS.load()
        const result = await fp.get()
        setFingerprint(result.visitorId)
      } catch (err) {
        console.warn('Fingerprint not available:', err)
      }
    }
    loadFingerprint()
  }, [])

  // Detect #reset-password?token=xxx or #verify-email?token=xxx in the URL on mount
  useEffect(() => {
    const hash = window.location.hash
    if (hash.startsWith('#reset-password')) {
      const params = new URLSearchParams(hash.split('?')[1] || '')
      const token = params.get('token')
      if (token) {
        setResetToken(token)
        setView('reset-password')
      }
    } else if (hash.startsWith('#verify-email')) {
      const params = new URLSearchParams(hash.split('?')[1] || '')
      const token = params.get('token')
      if (token) {
        setView('verify-email')
        handleVerifyEmail(token)
      }
    }
  }, [])

  // Resend cooldown timer
  useEffect(() => {
    if (resendCooldown > 0) {
      const timer = setTimeout(() => setResendCooldown(resendCooldown - 1), 1000)
      return () => clearTimeout(timer)
    }
  }, [resendCooldown])

  // Poll for email verification status when on verification-pending view
  // This auto-detects when the user verifies on another device (e.g. phone)
  const [pollFailed, setPollFailed] = useState(false)
  const [manualChecking, setManualChecking] = useState(false)

  const checkVerificationStatus = async () => {
    try {
      const response = await axios.post(`${API_URL}/api/auth/check-verification`, {
        userId: verificationUserId,
      })

      if (response.data.success && response.data.verified && response.data.user) {
        console.log('[Auth] Email verified — auto-logging in')
        const user = response.data.user

        // New user — clear model prefs so MainView sets Auto Smart defaults
        clearSelectedModels()
        setAutoSmartProviders({})
        localStorage.removeItem('arktek-models-initialized')

        setCurrentUser(user)
        setActiveTab('home')
        setShowWelcome(false)
        return true // verified
      }
      return false // not yet verified
    } catch (err) {
      console.warn('[Auth] Verification poll error:', err.message)
      return false
    }
  }

  useEffect(() => {
    if (view !== 'verification-pending' || !verificationUserId) return

    let failCount = 0

    const pollInterval = setInterval(async () => {
      const verified = await checkVerificationStatus()
      if (verified) {
        clearInterval(pollInterval)
      } else {
        failCount++
        // After 12 failed polls (60 seconds), show a manual check button
        if (failCount >= 12) {
          setPollFailed(true)
        }
      }
    }, 5000) // Check every 5 seconds

    return () => clearInterval(pollInterval)
  }, [view, verificationUserId])

  const handleManualCheck = async () => {
    setManualChecking(true)
    const verified = await checkVerificationStatus()
    if (!verified) {
      setError('Email not verified yet. Please check your inbox and click the verification link.')
    }
    setManualChecking(false)
  }


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
      const userTimezone = Intl.DateTimeFormat().resolvedOptions().timeZone
      const payload = isSignUp
        ? { ...formData, plan: selectedPlan, fingerprint, timezone: userTimezone }
        : { ...formData, timezone: userTimezone }
      const response = await axios.post(`${API_URL}${endpoint}`, payload)

      if (response.data.success) {
        const user = response.data.user

        // Check if email verification is required (both plans require email verification on signup)
        if (response.data.requiresVerification) {
          setVerificationEmail(user.email)
          setVerificationUserId(user.id)
          setView('verification-pending')
          return
        }

        // Restore model preferences from server (if returning user has saved prefs)
        if (user.modelPreferences) {
          const { selectedModels: savedModels, autoSmartProviders: savedAutoSmart } = user.modelPreferences
          if (savedModels) setSelectedModels(savedModels)
          if (savedAutoSmart) setAutoSmartProviders(savedAutoSmart)
          localStorage.setItem('arktek-models-initialized', 'true')
          console.log('[Auth] Restored model preferences from server')
        } else {
          // New user with no saved prefs — clear and let MainView set Auto Smart defaults
          clearSelectedModels()
          setAutoSmartProviders({})
          localStorage.removeItem('arktek-models-initialized')
        }
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

  // Verify email token (called when user clicks verification link)
  const handleVerifyEmail = async (token) => {
    setVerifyingEmail(true)
    setError('')
    setSuccessMessage('')

    try {
      const response = await axios.post(`${API_URL}/api/auth/verify-email`, { token })

      if (response.data.success) {
        const user = response.data.user
        // Clear hash from URL
        window.location.hash = ''

        // If server returned full user data, auto-login the user
        if (user && user.firstName && user.username) {
          setSuccessMessage('Email verified! Signing you in...')

          // New user — clear model prefs so MainView sets Auto Smart defaults
          clearSelectedModels()
          setAutoSmartProviders({})
          localStorage.removeItem('arktek-models-initialized')

          // Brief delay so user sees the success message, then auto-login
          setTimeout(() => {
            setCurrentUser(user)
            setActiveTab('home')
            setShowWelcome(false)
          }, 1500)
        } else {
          // Fallback: show success message and switch to signin
          setSuccessMessage(response.data.message || 'Email verified! You can now sign in.')
          setTimeout(() => {
            setView('signin')
            setSuccessMessage('')
          }, 3000)
        }
      }
    } catch (err) {
      console.error('Email verification error:', err)
      setError(err.response?.data?.error || 'Verification failed. Please try again or request a new link.')
    } finally {
      setVerifyingEmail(false)
    }
  }

  // Resend verification email
  const handleResendVerification = async () => {
    if (resendCooldown > 0) return
    setError('')
    setSuccessMessage('')
    setLoading(true)

    try {
      const response = await axios.post(`${API_URL}/api/auth/resend-verification`, {
        userId: verificationUserId,
        email: verificationEmail,
      })

      if (response.data.success) {
        setSuccessMessage(response.data.message || 'A new verification email has been sent!')
        setResendCooldown(120) // 2-minute cooldown
      }
    } catch (err) {
      console.error('Resend verification error:', err)
      setError(err.response?.data?.error || 'Failed to resend. Please try again.')
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
    if (newView === 'signin' || newView === 'signup' || newView === 'select-plan') {
      setFormData({
        firstName: '',
        lastName: '',
        username: '',
        email: '',
        password: '',
      })
    }
    // Update URL
    if (newView === 'signin') {
      window.history.replaceState({}, '', '/signin')
    } else if (newView === 'signup' || newView === 'select-plan') {
      window.history.replaceState({}, '', '/signup')
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
      case 'select-plan':
        return { title: 'ArkiTek', subtitle: 'Choose your plan to get started' }
      case 'signup':
        return { title: 'ArkiTek', subtitle: 'Create your account' }
      case 'forgot-username':
        return { title: 'Forgot Username', subtitle: 'Enter your email to receive your username' }
      case 'forgot-password':
        return { title: 'Forgot Password', subtitle: 'Enter your email to receive a reset link' }
      case 'reset-password':
        return { title: 'Reset Password', subtitle: 'Enter your new password' }
      case 'verification-pending':
        return { title: 'Check Your Email', subtitle: 'We sent you a verification link' }
      case 'verify-email':
        return { title: 'Verifying Email', subtitle: 'Please wait while we verify your email' }
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
          maxWidth: view === 'select-plan' ? '860px' : '450px',
          padding: '40px',
          background: currentTheme.backgroundOverlay,
          border: `1px solid ${currentTheme.borderLight}`,
          borderRadius: '20px',
          boxShadow: `0 0 40px ${currentTheme.shadowLight}`,
          transition: 'max-width 0.3s ease',
        }}
      >
        {/* Back button for forgot/reset/verification views */}
        {(view === 'forgot-username' || view === 'forgot-password' || view === 'reset-password' || view === 'verification-pending' || view === 'verify-email') && (
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
              fontSize: view === 'signin' || view === 'signup' || view === 'select-plan' ? '2.5rem' : '1.8rem',
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

        {/* ==================== PLAN SELECTION ==================== */}
        {view === 'select-plan' && (
          <div>
            <div style={{ display: 'flex', flexDirection: 'row', gap: '24px', marginBottom: '24px' }}>
              {/* Free Trial Card */}
              <button
                type="button"
                onClick={() => {
                  setSelectedPlan('free_trial')
                  goToView('signup')
                }}
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
                  {['Limited free usage', 'Access to all models'].map((feature, idx) => (
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
              </button>

              {/* Pro Card */}
              <button
                type="button"
                onClick={() => {
                  setSelectedPlan('pro')
                  goToView('signup')
                }}
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
                  {['15x more usage', 'All models & features', 'Monthly rewards: usage bonuses, badges & collectible icons'].map((feature, idx) => (
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
              </button>
            </div>

            {/* Already have an account? */}
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
                Already have an account? Sign in
              </button>
            </div>

            {/* Back to Home */}
            {onNavigate && (
              <div style={{ textAlign: 'center', marginTop: '12px' }}>
                <button
                  type="button"
                  onClick={() => onNavigate('landing')}
                  style={{
                    background: 'none',
                    border: 'none',
                    color: currentTheme.textSecondary,
                    cursor: 'pointer',
                    fontSize: '0.9rem',
                    textDecoration: 'underline',
                  }}
                >
                  ← Back to Home
                </button>
              </div>
            )}
          </div>
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

            {isSignUp && (
              <div style={{
                marginBottom: '16px',
                padding: '12px 16px',
                background: selectedPlan === 'pro' ? 'rgba(72, 201, 176, 0.08)' : 'rgba(93, 173, 226, 0.08)',
                border: `1px solid ${selectedPlan === 'pro' ? 'rgba(72, 201, 176, 0.25)' : 'rgba(93, 173, 226, 0.25)'}`,
                borderRadius: '10px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
              }}>
                <div>
                  <span style={{ fontSize: '0.9rem', fontWeight: 600, color: selectedPlan === 'pro' ? '#48c9b0' : '#5dade2' }}>
                    {selectedPlan === 'pro' ? 'Pro Plan' : 'Free Trial'}
                  </span>
                  <span style={{ fontSize: '0.8rem', color: 'rgba(255, 255, 255, 0.4)', marginLeft: '8px' }}>
                    {selectedPlan === 'pro' ? '$19.95/mo' : 'Free'}
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => goToView('select-plan')}
                  style={{
                    background: 'none',
                    border: 'none',
                    color: currentTheme.textSecondary,
                    cursor: 'pointer',
                    fontSize: '0.8rem',
                    textDecoration: 'underline',
                  }}
                >
                  Change
                </button>
              </div>
            )}

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


            {/* Toggle Sign In/Sign Up */}
            <div style={{ textAlign: 'center' }}>
              <button
                type="button"
                onClick={() => goToView(isSignUp ? 'signin' : 'select-plan')}
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

            {/* Back to Home */}
            {onNavigate && (
              <div style={{ textAlign: 'center', marginTop: '12px' }}>
                <button
                  type="button"
                  onClick={() => onNavigate('landing')}
                  style={{
                    background: 'none',
                    border: 'none',
                    color: 'rgba(255, 255, 255, 0.4)',
                    cursor: 'pointer',
                    fontSize: '0.85rem',
                  }}
                >
                  ← Back to Home
                </button>
              </div>
            )}
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

        {/* ==================== VERIFICATION PENDING ==================== */}
        {view === 'verification-pending' && (
          <div style={{ textAlign: 'center' }}>
            <div style={{
              marginBottom: '24px',
              padding: '24px',
              background: 'rgba(93, 173, 226, 0.05)',
              border: '1px solid rgba(93, 173, 226, 0.15)',
              borderRadius: '14px',
            }}>
              <Mail size={48} style={{ color: '#5dade2', marginBottom: '16px' }} />
              <h3 style={{ color: '#fff', fontSize: '1.1rem', marginBottom: '12px' }}>
                Verification Email Sent
              </h3>
              <p style={{ color: 'rgba(255, 255, 255, 0.6)', fontSize: '0.9rem', lineHeight: 1.6, margin: 0 }}>
                We sent a verification link to:
              </p>
              <p style={{ color: '#5dade2', fontWeight: 600, fontSize: '1rem', margin: '8px 0 16px' }}>
                {verificationEmail}
              </p>
              <p style={{ color: 'rgba(255, 255, 255, 0.5)', fontSize: '0.85rem', lineHeight: 1.5, margin: 0 }}>
                Click the link in your email to verify your account. The link expires in 24 hours.
              </p>
              {!pollFailed && (
                <div style={{ marginTop: '16px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}>
                  <Loader size={14} style={{ color: 'rgba(93, 173, 226, 0.6)', animation: 'spin 1s linear infinite' }} />
                  <p style={{ color: 'rgba(255, 255, 255, 0.4)', fontSize: '0.8rem', margin: 0 }}>
                    Waiting for verification — this page will update automatically
                  </p>
                  <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
                </div>
              )}

              {pollFailed && (
                <div style={{ marginTop: '16px' }}>
                  <motion.button
                    type="button"
                    onClick={handleManualCheck}
                    disabled={manualChecking}
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                    style={{
                      padding: '10px 24px',
                      background: 'rgba(72, 201, 176, 0.15)',
                      border: '1px solid rgba(72, 201, 176, 0.3)',
                      borderRadius: '8px',
                      color: '#48c9b0',
                      fontSize: '0.9rem',
                      fontWeight: 600,
                      cursor: manualChecking ? 'not-allowed' : 'pointer',
                      opacity: manualChecking ? 0.6 : 1,
                    }}
                  >
                    {manualChecking ? 'Checking...' : "I've verified my email — check now"}
                  </motion.button>
                </div>
              )}
            </div>

            <div style={{
              padding: '16px',
              background: 'rgba(255, 255, 255, 0.03)',
              borderRadius: '10px',
              marginBottom: '20px',
            }}>
              <p style={{ color: 'rgba(255, 255, 255, 0.4)', fontSize: '0.85rem', margin: '0 0 12px' }}>
                Didn't receive the email? Check your spam folder or:
              </p>
              <motion.button
                type="button"
                onClick={handleResendVerification}
                disabled={loading || resendCooldown > 0}
                whileHover={{ scale: resendCooldown > 0 ? 1 : 1.02 }}
                whileTap={{ scale: resendCooldown > 0 ? 1 : 0.98 }}
                style={{
                  padding: '10px 24px',
                  background: (loading || resendCooldown > 0) ? 'rgba(128, 128, 128, 0.2)' : 'rgba(93, 173, 226, 0.15)',
                  border: `1px solid ${(loading || resendCooldown > 0) ? 'rgba(128, 128, 128, 0.3)' : 'rgba(93, 173, 226, 0.3)'}`,
                  borderRadius: '8px',
                  color: (loading || resendCooldown > 0) ? 'rgba(255, 255, 255, 0.3)' : '#5dade2',
                  fontSize: '0.9rem',
                  fontWeight: 600,
                  cursor: (loading || resendCooldown > 0) ? 'not-allowed' : 'pointer',
                }}
              >
                {loading ? 'Sending...' : resendCooldown > 0 ? `Resend in ${resendCooldown}s` : 'Resend Verification Email'}
              </motion.button>
            </div>

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
        )}

        {/* ==================== VERIFY EMAIL (from email link) ==================== */}
        {view === 'verify-email' && (
          <div style={{ textAlign: 'center' }}>
            {verifyingEmail ? (
              <div style={{ padding: '40px 0' }}>
                <Loader size={40} style={{ color: '#5dade2', animation: 'spin 1s linear infinite', marginBottom: '16px' }} />
                <p style={{ color: 'rgba(255, 255, 255, 0.6)', fontSize: '1rem' }}>
                  Verifying your email address...
                </p>
                <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
              </div>
            ) : successMessage ? (
              <div style={{ padding: '24px 0' }}>
                <ShieldCheck size={48} style={{ color: '#48c9b0', marginBottom: '16px' }} />
                <h3 style={{ color: '#48c9b0', fontSize: '1.1rem', marginBottom: '12px' }}>
                  Email Verified!
                </h3>
                <p style={{ color: 'rgba(255, 255, 255, 0.6)', fontSize: '0.9rem', lineHeight: 1.6 }}>
                  {successMessage}
                </p>
              </div>
            ) : error ? (
              <div style={{ padding: '24px 0' }}>
                <Mail size={48} style={{ color: '#FF6B6B', marginBottom: '16px' }} />
                <h3 style={{ color: '#FF6B6B', fontSize: '1.1rem', marginBottom: '12px' }}>
                  Verification Failed
                </h3>
                <p style={{ color: 'rgba(255, 255, 255, 0.5)', fontSize: '0.9rem', lineHeight: 1.6, marginBottom: '20px' }}>
                  {error}
                </p>
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
            ) : null}
          </div>
        )}

      </motion.div>
      </AnimatePresence>
    </div>
    </>
  )
}

export default AuthView
