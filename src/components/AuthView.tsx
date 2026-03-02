import type React from 'react';
import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { LogIn, UserPlus, Mail, Lock, User, CreditCard, ArrowLeft, CheckCircle, KeyRound, Eye, EyeOff, ShieldCheck, Loader } from 'lucide-react'
import { useStore } from '../store/useStore'
import { getTheme } from '../utils/theme'
import { spacing, fontSize, fontWeight, radius, zIndex, transition, layout, sx, createStyles } from '../utils/styles'
import api from '../utils/api'
import { API_URL } from '../utils/config'
import FingerprintJS from '@fingerprintjs/fingerprintjs'

// Possible views: 'select-plan' | 'signin' | 'signup' | 'forgot-username' | 'forgot-password' | 'reset-password' | 'verification-pending' | 'verify-email'

interface AuthViewProps {
  initialView?: string
  initialPlan?: string | null
  onNavigate?: (page: string, plan?: string) => void
}

const AuthView = ({ initialView, initialPlan, onNavigate }: AuthViewProps) => {
  const [view, setView] = useState(initialView || 'signin')
  const [formData, setFormData] = useState({
    firstName: '',
    lastName: '',
    username: '',
    email: '',
    password: '',
    confirmPassword: '',
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
  const [showConfirmSignupPassword, setShowConfirmSignupPassword] = useState(false)
  const [selectedPlan, setSelectedPlan] = useState(initialPlan || 'free_trial')
  const [fingerprint, setFingerprint] = useState<string | null>(null)
  const [verificationEmail, setVerificationEmail] = useState('')
  const [verificationUserId, setVerificationUserId] = useState('')
  const [verifyingEmail, setVerifyingEmail] = useState(false)
  const [returningUserMessage, setReturningUserMessage] = useState('')
  const [resendCooldown, setResendCooldown] = useState(0)
  // Always use dark theme for the auth page
  const currentTheme = getTheme('dark')
  const s = createStyles(currentTheme)
  const setCurrentUser = useStore((state) => state.setCurrentUser)
  const setAuthToken = useStore((state) => state.setAuthToken)
  const setShowWelcome = useStore((state) => state.setShowWelcome)
  const clearSelectedModels = useStore((state) => state.clearSelectedModels)
  const setSelectedModels = useStore((state) => state.setSelectedModels)
  const setAutoSmartProviders = useStore((state) => state.setAutoSmartProviders)
  const setActiveTab = useStore((state) => state.setActiveTab)

  const isSignUp = view === 'signup'

  const extractErrorMessage = (err: any): string => {
    const dataError = err.response?.data?.error
    if (typeof dataError === 'string') return dataError
    if (dataError && typeof dataError === 'object' && typeof dataError.message === 'string') return dataError.message
    return err.response?.data?.message || err.message || 'An error occurred. Please try again.'
  }

  // Initialize FingerprintJS for device fingerprinting (free trial abuse prevention)
  useEffect(() => {
    const loadFingerprint = async () => {
      try {
        const fp = await FingerprintJS.load()
        const result = await fp.get()
        setFingerprint(result.visitorId)
      } catch (err: any) {
        console.warn('Fingerprint not available:', err)
      }
    }
    loadFingerprint()
  }, [])

  // Detect /reset-password?token=xxx or /verify-email?token=xxx in the URL on mount
  // Also supports legacy hash-based routes for backwards compatibility
  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const hash = window.location.hash
    const pathname = window.location.pathname

    if (pathname === '/reset-password' || hash.startsWith('#reset-password')) {
      const token = params.get('token') || new URLSearchParams(hash.split('?')[1] || '').get('token')
      if (token) {
        setResetToken(token)
        setView('reset-password')
      }
    } else if (pathname === '/verify-email' || hash.startsWith('#verify-email')) {
      const token = params.get('token') || new URLSearchParams(hash.split('?')[1] || '').get('token')
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
      const response = await api.post('/auth/check-verification', {
        userId: verificationUserId,
      })

      if (response.data.success && response.data.verified && response.data.user) {
        console.log('[Auth] Email verified — auto-logging in')
        const user = response.data.user
        if (response.data.token) setAuthToken(response.data.token)

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
    } catch (err: any) {
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


  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setFormData({
      ...formData,
      [e.target.name]: e.target.value,
    })
    setError('')
    setSuccessMessage('')
  }

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
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

      if (isSignUp && formData.password !== formData.confirmPassword) {
        setError('Passwords do not match')
        setLoading(false)
        return
      }

      const endpoint = isSignUp ? '/auth/signup' : '/auth/signin'
      const userTimezone = Intl.DateTimeFormat().resolvedOptions().timeZone
      const { confirmPassword: _, ...submitData } = formData
      const payload = isSignUp
        ? { ...submitData, plan: selectedPlan, fingerprint, timezone: userTimezone }
        : { ...submitData, timezone: userTimezone }
      const response = await api.post(endpoint, payload)

      if (response.data.success) {
        const user = response.data.user
        if (response.data.token) setAuthToken(response.data.token)

        // Check if email verification is required (both plans require email verification on signup)
        if (response.data.requiresVerification) {
          setVerificationEmail(user.email)
          setVerificationUserId(user.id)
          setReturningUserMessage(response.data.returningUserMessage || '')
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
    } catch (err: any) {
      console.error('Auth error:', err)
      setError(extractErrorMessage(err))
    } finally {
      setLoading(false)
    }
  }

  // Verify email token (called when user clicks verification link)
  const handleVerifyEmail = async (token: string) => {
    setVerifyingEmail(true)
    setError('')
    setSuccessMessage('')

    try {
      const response = await api.post('/auth/verify-email', { token })

      if (response.data.success) {
        const user = response.data.user
        if (response.data.token) setAuthToken(response.data.token)
        // Clear verification URL params
        window.history.replaceState({}, '', '/signin')

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
    } catch (err: any) {
      console.error('Email verification error:', err)
      setError(extractErrorMessage(err) || 'Verification failed. Please try again or request a new link.')
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
      const response = await api.post('/auth/resend-verification', {
        userId: verificationUserId,
        email: verificationEmail,
      })

      if (response.data.success) {
        setSuccessMessage(response.data.message || 'A new verification email has been sent!')
        setResendCooldown(120) // 2-minute cooldown
      }
    } catch (err: any) {
      console.error('Resend verification error:', err)
      setError(extractErrorMessage(err) || 'Failed to resend. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  // Forgot Username handler
  const handleForgotUsername = async (e: React.FormEvent<HTMLFormElement>) => {
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

      const response = await api.post('/auth/forgot-username', {
        email: resetEmail.trim(),
      })

      if (response.data.success) {
        setSuccessMessage(response.data.message || 'If an account exists with that email, your username has been sent.')
      }
    } catch (err: any) {
      console.error('Forgot username error:', err)
      setError(extractErrorMessage(err))
    } finally {
      setLoading(false)
    }
  }

  // Forgot Password handler
  const handleForgotPassword = async (e: React.FormEvent<HTMLFormElement>) => {
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

      const response = await api.post('/auth/forgot-password', {
        email: resetEmail.trim(),
      })

      if (response.data.success) {
        setSuccessMessage(response.data.message || 'If an account exists with that email, a reset link has been sent.')
      }
    } catch (err: any) {
      console.error('Forgot password error:', err)
      setError(extractErrorMessage(err))
    } finally {
      setLoading(false)
    }
  }

  // Reset Password handler
  const handleResetPassword = async (e: React.FormEvent<HTMLFormElement>) => {
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

      const response = await api.post('/auth/reset-password', {
        token: resetToken,
        newPassword,
      })

      if (response.data.success) {
        setSuccessMessage(response.data.message || 'Your password has been reset. You can now sign in.')
        // Clear reset URL params
        window.history.replaceState({}, '', '/signin')
        // After 3 seconds, switch to sign-in view
        setTimeout(() => {
          setView('signin')
          setSuccessMessage('')
          setNewPassword('')
          setConfirmPassword('')
          setResetToken('')
        }, 3000)
      }
    } catch (err: any) {
      console.error('Reset password error:', err)
      setError(extractErrorMessage(err))
    } finally {
      setLoading(false)
    }
  }

  // Navigate between views
  const goToView = (newView: string) => {
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
        confirmPassword: '',
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
    padding: spacing.lg,
    background: 'rgba(93, 173, 226, 0.05)',
    border: '1px solid rgba(93, 173, 226, 0.3)',
    borderRadius: radius.md,
    color: '#ffffff',
    fontSize: fontSize['2xl'],
    outline: 'none',
    WebkitTextFillColor: '#ffffff',
    WebkitBoxShadow: '0 0 0 1000px rgba(93, 173, 226, 0.05) inset',
  }

  const handleFocus = (e: React.FocusEvent<HTMLInputElement>) => {
    ;(e.target as HTMLElement).style.background = 'rgba(93, 173, 226, 0.05)'
    ;(e.target as HTMLElement).style.borderColor = 'rgba(93, 173, 226, 0.5)'
    ;(e.target as HTMLElement).style.webkitBoxShadow = '0 0 0 1000px rgba(93, 173, 226, 0.05) inset'
  }

  const handleBlur = (e: React.FocusEvent<HTMLInputElement>) => {
    ;(e.target as HTMLElement).style.background = 'rgba(93, 173, 226, 0.05)'
    ;(e.target as HTMLElement).style.borderColor = 'rgba(93, 173, 226, 0.3)'
    ;(e.target as HTMLElement).style.webkitBoxShadow = '0 0 0 1000px rgba(93, 173, 226, 0.05) inset'
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
        style={sx(layout.fixedFill, layout.center, {
          background: 'linear-gradient(135deg, #0a0a0a 0%, #1a1a2e 100%)',
          zIndex: zIndex.modal,
        })}
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
          maxWidth: view === 'select-plan' ? '1100px' : '450px',
          padding: spacing['5xl'],
          background: currentTheme.backgroundOverlay,
          border: `1px solid ${currentTheme.borderLight}`,
          borderRadius: radius['3xl'],
          boxShadow: `0 0 40px ${currentTheme.shadowLight}`,
          transition: 'max-width 0.3s ease',
        }}
      >
        {/* Back button for forgot/reset/verification views */}
        {(view === 'forgot-username' || view === 'forgot-password' || view === 'reset-password' || view === 'verification-pending' || view === 'verify-email') && (
          <button
            onClick={() => goToView('signin')}
            style={sx(layout.flexRow, {
              gap: spacing.sm,
              background: 'none',
              border: 'none',
              color: currentTheme.textSecondary,
              cursor: 'pointer',
              fontSize: fontSize.base,
              marginBottom: spacing.xl,
              padding: 0,
            })}
          >
            <ArrowLeft size={16} />
            Back to sign in
          </button>
        )}

        {/* Header */}
        <div style={{ textAlign: 'center', marginBottom: spacing['4xl'] }}>
          <h1
            style={sx(s.gradientText, {
              fontSize: (view === 'signin' || view === 'signup' || view === 'select-plan') ? fontSize['7xl'] : '1.8rem',
              marginBottom: '10px',
            })}
          >
            {viewInfo.title}
          </h1>
          <p style={{ color: currentTheme.textSecondary, fontSize: fontSize['2xl'] }}>
            {viewInfo.subtitle}
          </p>
        </div>

        {/* Error Message */}
        {error && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            style={{
              padding: spacing.lg,
              marginBottom: spacing['2xl'],
              background: 'rgba(255, 0, 0, 0.2)',
              border: '1px solid rgba(255, 0, 0, 0.5)',
              borderRadius: radius.md,
              color: currentTheme.error,
              fontSize: fontSize.lg,
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
            style={sx(layout.flexRow, {
              padding: spacing.lg,
              marginBottom: spacing['2xl'],
              background: 'rgba(72, 201, 176, 0.15)',
              border: '1px solid rgba(72, 201, 176, 0.4)',
              borderRadius: radius.md,
              color: '#48c9b0',
              fontSize: fontSize.lg,
              gap: spacing.md,
            })}
          >
            <CheckCircle size={18} />
            {successMessage}
          </motion.div>
        )}

        {/* ==================== PLAN SELECTION ==================== */}
        {view === 'select-plan' && (
          <div>
            <div style={{ display: 'flex', flexDirection: 'row', gap: spacing['3xl'], marginBottom: spacing['3xl'] }}>
              {/* Free Plan Card */}
              <button
                type="button"
                onClick={() => {
                  setSelectedPlan('free_trial')
                  goToView('signup')
                }}
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
                  {['Standard monthly usage', 'Access to all models', 'No rewards or badges'].map((feature, idx) => (
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
              </button>

              {/* Pro Card */}
              <button
                type="button"
                onClick={() => {
                  setSelectedPlan('pro')
                  goToView('signup')
                }}
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
                  {['15x more usage', 'All models & features', 'Monthly rewards: usage bonuses & badges'].map((feature, idx) => (
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
              </button>

              {/* Premium Card */}
              <button
                type="button"
                onClick={() => {
                  setSelectedPlan('premium')
                  goToView('signup')
                }}
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
                  {['50x more usage than Free', 'All models & features', 'Monthly rewards: usage bonuses & badges'].map((feature, idx) => (
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
                  fontSize: fontSize.lg,
                  textDecoration: 'underline',
                }}
              >
                Already have an account? Sign in
              </button>
            </div>

            {/* Back to Home */}
            {onNavigate && (
              <div style={{ textAlign: 'center', marginTop: spacing.lg }}>
                <button
                  type="button"
                  onClick={() => onNavigate('landing')}
                  style={{
                    background: 'none',
                    border: 'none',
                    color: currentTheme.textSecondary,
                    cursor: 'pointer',
                    fontSize: fontSize.lg,
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
                <div style={{ marginBottom: spacing['2xl'] }}>
                  <label
                    style={sx(layout.flexRow, {
                      gap: spacing.md,
                      marginBottom: spacing.md,
                      color: currentTheme.text,
                      fontSize: fontSize.lg,
                    })}
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

                <div style={{ marginBottom: spacing['2xl'] }}>
                  <label
                    style={sx(layout.flexRow, {
                      gap: spacing.md,
                      marginBottom: spacing.md,
                      color: currentTheme.text,
                      fontSize: fontSize.lg,
                    })}
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

            <div style={{ marginBottom: spacing['2xl'] }}>
              <label
                style={sx(layout.flexRow, {
                  gap: spacing.md,
                  marginBottom: spacing.md,
                  color: '#ffffff',
                  fontSize: fontSize.lg,
                })}
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
              <div style={{ marginBottom: spacing['2xl'] }}>
                <label
                  style={sx(layout.flexRow, {
                    gap: spacing.md,
                    marginBottom: spacing.md,
                    color: '#ffffff',
                    fontSize: fontSize.lg,
                  })}
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
                    ;(e.target as HTMLElement).style.background = 'rgba(93, 173, 226, 0.1)'
                    ;(e.target as HTMLElement).style.borderColor = 'rgba(93, 173, 226, 0.5)'
                    ;(e.target as HTMLElement).style.webkitBoxShadow = '0 0 0 1000px rgba(93, 173, 226, 0.1) inset'
                  }}
                  onBlur={handleBlur}
                />
              </div>
            )}

            <div style={{ marginBottom: spacing['2xl'] }}>
              <label
                style={sx(layout.flexRow, {
                  gap: spacing.md,
                  marginBottom: spacing.md,
                  color: '#ffffff',
                  fontSize: fontSize.lg,
                })}
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
                  style={sx(layout.center, {
                    position: 'absolute',
                    right: spacing.lg,
                    top: '50%',
                    transform: 'translateY(-50%)',
                    background: 'none',
                    border: 'none',
                    cursor: 'pointer',
                    padding: spacing.xs,
                    color: currentTheme.textMuted,
                  })}
                  tabIndex={-1}
                >
                  {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
            </div>

            {isSignUp && (
              <div style={{ marginBottom: spacing['2xl'] }}>
                <label
                  style={sx(layout.flexRow, {
                    gap: spacing.md,
                    marginBottom: spacing.md,
                    color: '#ffffff',
                    fontSize: fontSize.lg,
                  })}
                >
                  <Lock size={16} />
                  Confirm Password
                </label>
                <div style={{ position: 'relative' }}>
                  <input
                    type={showConfirmSignupPassword ? "text" : "password"}
                    name="confirmPassword"
                    value={formData.confirmPassword}
                    onChange={handleChange}
                    required
                    minLength={8}
                    autoComplete="new-password"
                    placeholder="Re-enter your password"
                    style={{
                      ...inputStyle,
                      paddingRight: '44px',
                      ...(formData.confirmPassword ? {
                        borderColor: formData.password === formData.confirmPassword
                          ? 'rgba(72, 201, 176, 0.6)'
                          : 'rgba(255, 80, 80, 0.7)',
                        boxShadow: formData.password === formData.confirmPassword
                          ? '0 0 0 1px rgba(72, 201, 176, 0.3)'
                          : '0 0 0 1px rgba(255, 80, 80, 0.3)',
                      } : {}),
                    }}
                    onFocus={(e) => {
                      ;(e.target as HTMLElement).style.background = 'rgba(93, 173, 226, 0.05)'
                      ;(e.target as HTMLElement).style.webkitBoxShadow = '0 0 0 1000px rgba(93, 173, 226, 0.05) inset'
                      if (!formData.confirmPassword) {
                        ;(e.target as HTMLElement).style.borderColor = 'rgba(93, 173, 226, 0.5)'
                      }
                    }}
                    onBlur={(e) => {
                      ;(e.target as HTMLElement).style.background = 'rgba(93, 173, 226, 0.05)'
                      ;(e.target as HTMLElement).style.webkitBoxShadow = '0 0 0 1000px rgba(93, 173, 226, 0.05) inset'
                      if (!formData.confirmPassword) {
                        ;(e.target as HTMLElement).style.borderColor = 'rgba(93, 173, 226, 0.3)'
                      }
                    }}
                  />
                  <button
                    type="button"
                    onClick={() => setShowConfirmSignupPassword(!showConfirmSignupPassword)}
                    style={sx(layout.center, {
                      position: 'absolute',
                      right: spacing.lg,
                      top: '50%',
                      transform: 'translateY(-50%)',
                      background: 'none',
                      border: 'none',
                      cursor: 'pointer',
                      padding: spacing.xs,
                      color: currentTheme.textMuted,
                    })}
                    tabIndex={-1}
                  >
                    {showConfirmSignupPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                  </button>
                </div>
                {formData.confirmPassword && (
                  <p style={{
                    fontSize: fontSize.md,
                    marginTop: spacing.sm,
                    marginBottom: 0,
                    color: formData.password === formData.confirmPassword ? '#48c9b0' : currentTheme.error,
                  }}>
                    {formData.password === formData.confirmPassword ? '✓ Passwords match' : '✗ Passwords must match'}
                  </p>
                )}
              </div>
            )}

            {/* Forgot links (only on sign in) */}
            {!isSignUp && (
              <div style={sx(layout.spaceBetween, {
                marginBottom: spacing['3xl'],
                marginTop: `-${spacing.md}`,
              })}>
                <button
                  type="button"
                  onClick={() => goToView('forgot-username')}
                  style={{
                    background: 'none',
                    border: 'none',
                    color: currentTheme.textMuted,
                    cursor: 'pointer',
                    fontSize: fontSize.md,
                    padding: 0,
                    textDecoration: 'none',
                  }}
                  onMouseEnter={(e) => (e.target as HTMLElement).style.color = currentTheme.accent}
                  onMouseLeave={(e) => (e.target as HTMLElement).style.color = currentTheme.textMuted}
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
                    fontSize: fontSize.md,
                    padding: 0,
                    textDecoration: 'none',
                  }}
                  onMouseEnter={(e) => (e.target as HTMLElement).style.color = currentTheme.accent}
                  onMouseLeave={(e) => (e.target as HTMLElement).style.color = currentTheme.textMuted}
                >
                  Forgot password?
                </button>
              </div>
            )}

            {isSignUp && (
              <div style={sx(layout.spaceBetween, {
                marginBottom: spacing.xl,
                padding: `${spacing.lg} ${spacing.xl}`,
                background: selectedPlan === 'pro' ? 'rgba(72, 201, 176, 0.08)' : 'rgba(93, 173, 226, 0.08)',
                border: `1px solid ${selectedPlan === 'pro' ? 'rgba(72, 201, 176, 0.25)' : 'rgba(93, 173, 226, 0.25)'}`,
                borderRadius: radius.lg,
              })}>
                <div>
                  <span style={{ fontSize: fontSize.lg, fontWeight: fontWeight.semibold, color: selectedPlan === 'pro' ? '#48c9b0' : '#5dade2' }}>
                    {selectedPlan === 'premium' ? 'Premium Plan' : selectedPlan === 'pro' ? 'Pro Plan' : 'Free Plan'}
                  </span>
                  <span style={{ fontSize: fontSize.md, color: 'rgba(255, 255, 255, 0.4)', marginLeft: spacing.md }}>
                    {selectedPlan === 'premium' ? '$49.95/mo' : selectedPlan === 'pro' ? '$19.95/mo' : 'Free'}
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
                    fontSize: fontSize.md,
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
              style={sx(layout.center, {
                width: '100%',
                padding: '14px',
                background: loading
                  ? 'rgba(128, 128, 128, 0.3)'
                  : 'linear-gradient(135deg, #5dade2, #48c9b0)',
                border: 'none',
                borderRadius: radius.md,
                color: loading ? '#666666' : '#000000',
                fontSize: fontSize['2xl'],
                fontWeight: fontWeight.bold,
                cursor: loading ? 'not-allowed' : 'pointer',
                gap: spacing.md,
                marginBottom: spacing['2xl'],
              })}
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
                  fontSize: fontSize.lg,
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
              <div style={{ textAlign: 'center', marginTop: spacing.lg }}>
                <button
                  type="button"
                  onClick={() => onNavigate('landing')}
                  style={{
                    background: 'none',
                    border: 'none',
                    color: 'rgba(255, 255, 255, 0.4)',
                    cursor: 'pointer',
                    fontSize: fontSize.base,
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
              marginBottom: spacing['3xl'],
              padding: spacing.xl,
              background: 'rgba(93, 173, 226, 0.05)',
              border: '1px solid rgba(93, 173, 226, 0.15)',
              borderRadius: radius.lg,
            }}>
              <Mail size={32} style={{ color: currentTheme.accent, marginBottom: spacing.md }} />
              <p style={{ color: currentTheme.textSecondary, fontSize: fontSize.base, margin: 0, lineHeight: 1.5 }}>
                Enter the email address associated with your account and we'll send you your username.
              </p>
            </div>

            <div style={{ marginBottom: spacing['3xl'] }}>
              <label
                style={sx(layout.flexRow, {
                  gap: spacing.md,
                  marginBottom: spacing.md,
                  color: currentTheme.text,
                  fontSize: fontSize.lg,
                })}
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
              style={sx(layout.center, {
                width: '100%',
                padding: '14px',
                background: (loading || successMessage)
                  ? 'rgba(128, 128, 128, 0.3)'
                  : 'linear-gradient(135deg, #5dade2, #48c9b0)',
                border: 'none',
                borderRadius: radius.md,
                color: (loading || successMessage) ? '#666666' : '#000000',
                fontSize: fontSize['2xl'],
                fontWeight: fontWeight.bold,
                cursor: (loading || successMessage) ? 'not-allowed' : 'pointer',
                gap: spacing.md,
                marginBottom: spacing['2xl'],
              })}
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
                  fontSize: fontSize.lg,
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
              marginBottom: spacing['3xl'],
              padding: spacing.xl,
              background: 'rgba(93, 173, 226, 0.05)',
              border: '1px solid rgba(93, 173, 226, 0.15)',
              borderRadius: radius.lg,
            }}>
              <KeyRound size={32} style={{ color: currentTheme.accent, marginBottom: spacing.md }} />
              <p style={{ color: currentTheme.textSecondary, fontSize: fontSize.base, margin: 0, lineHeight: 1.5 }}>
                Enter the email address associated with your account. We'll send you a link to reset your password. The link expires in 1 hour.
              </p>
            </div>

            <div style={{ marginBottom: spacing['3xl'] }}>
              <label
                style={sx(layout.flexRow, {
                  gap: spacing.md,
                  marginBottom: spacing.md,
                  color: currentTheme.text,
                  fontSize: fontSize.lg,
                })}
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
              style={sx(layout.center, {
                width: '100%',
                padding: '14px',
                background: (loading || successMessage)
                  ? 'rgba(128, 128, 128, 0.3)'
                  : 'linear-gradient(135deg, #5dade2, #48c9b0)',
                border: 'none',
                borderRadius: radius.md,
                color: (loading || successMessage) ? '#666666' : '#000000',
                fontSize: fontSize['2xl'],
                fontWeight: fontWeight.bold,
                cursor: (loading || successMessage) ? 'not-allowed' : 'pointer',
                gap: spacing.md,
                marginBottom: spacing['2xl'],
              })}
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
                  fontSize: fontSize.lg,
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
              marginBottom: spacing['3xl'],
              padding: spacing.xl,
              background: 'rgba(93, 173, 226, 0.05)',
              border: '1px solid rgba(93, 173, 226, 0.15)',
              borderRadius: radius.lg,
            }}>
              <Lock size={32} style={{ color: currentTheme.accent, marginBottom: spacing.md }} />
              <p style={{ color: currentTheme.textSecondary, fontSize: fontSize.base, margin: 0, lineHeight: 1.5 }}>
                Choose a new password for your account. Must be at least 8 characters.
              </p>
            </div>

            <div style={{ marginBottom: spacing['2xl'] }}>
              <label
                style={sx(layout.flexRow, {
                  gap: spacing.md,
                  marginBottom: spacing.md,
                  color: currentTheme.text,
                  fontSize: fontSize.lg,
                })}
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
                  style={sx(layout.center, {
                    position: 'absolute',
                    right: spacing.lg,
                    top: '50%',
                    transform: 'translateY(-50%)',
                    background: 'none',
                    border: 'none',
                    cursor: 'pointer',
                    padding: spacing.xs,
                    color: currentTheme.textMuted,
                  })}
                  tabIndex={-1}
                >
                  {showNewPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
            </div>

            <div style={{ marginBottom: spacing['3xl'] }}>
              <label
                style={sx(layout.flexRow, {
                  gap: spacing.md,
                  marginBottom: spacing.md,
                  color: currentTheme.text,
                  fontSize: fontSize.lg,
                })}
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
                  style={sx(layout.center, {
                    position: 'absolute',
                    right: spacing.lg,
                    top: '50%',
                    transform: 'translateY(-50%)',
                    background: 'none',
                    border: 'none',
                    cursor: 'pointer',
                    padding: spacing.xs,
                    color: currentTheme.textMuted,
                  })}
                  tabIndex={-1}
                >
                  {showConfirmPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
              {/* Password match indicator */}
              {confirmPassword && (
                <p style={{
                  fontSize: fontSize.md,
                  marginTop: spacing.sm,
                  color: newPassword === confirmPassword ? '#48c9b0' : currentTheme.error,
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
              style={sx(layout.center, {
                width: '100%',
                padding: '14px',
                background: (loading || successMessage)
                  ? 'rgba(128, 128, 128, 0.3)'
                  : 'linear-gradient(135deg, #5dade2, #48c9b0)',
                border: 'none',
                borderRadius: radius.md,
                color: (loading || successMessage) ? '#666666' : '#000000',
                fontSize: fontSize['2xl'],
                fontWeight: fontWeight.bold,
                cursor: (loading || successMessage) ? 'not-allowed' : 'pointer',
                gap: spacing.md,
                marginBottom: spacing['2xl'],
              })}
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
              marginBottom: spacing['3xl'],
              padding: spacing['3xl'],
              background: 'rgba(93, 173, 226, 0.05)',
              border: '1px solid rgba(93, 173, 226, 0.15)',
              borderRadius: '14px',
            }}>
              <Mail size={48} style={{ color: '#5dade2', marginBottom: spacing.xl }} />
              <h3 style={{ color: '#fff', fontSize: fontSize['3xl'], marginBottom: spacing.lg }}>
                Verification Email Sent
              </h3>
              <p style={{ color: 'rgba(255, 255, 255, 0.6)', fontSize: fontSize.lg, lineHeight: 1.6, margin: 0 }}>
                We sent a verification link to:
              </p>
              <p style={{ color: '#5dade2', fontWeight: fontWeight.semibold, fontSize: fontSize['2xl'], margin: `${spacing.md} 0 ${spacing.xl}` }}>
                {verificationEmail}
              </p>
              <p style={{ color: 'rgba(255, 255, 255, 0.5)', fontSize: fontSize.base, lineHeight: 1.5, margin: 0 }}>
                Click the link in your email to verify your account. The link expires in 24 hours.
              </p>
              {returningUserMessage && (
                <p style={{ color: '#48c9b0', fontSize: fontSize.lg, fontWeight: fontWeight.semibold, margin: `${spacing.lg} 0 0`, lineHeight: 1.4 }}>
                  {returningUserMessage}
                </p>
              )}
              {!pollFailed && (
                <div style={sx(layout.center, { marginTop: spacing.xl, gap: spacing.md })}>
                  <Loader size={14} style={{ color: 'rgba(93, 173, 226, 0.6)', animation: 'spin 1s linear infinite' }} />
                  <p style={{ color: 'rgba(255, 255, 255, 0.4)', fontSize: fontSize.md, margin: 0 }}>
                    Waiting for verification — this page will update automatically
                  </p>
                  <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
                </div>
              )}

              {pollFailed && (
                <div style={{ marginTop: spacing.xl }}>
                  <motion.button
                    type="button"
                    onClick={handleManualCheck}
                    disabled={manualChecking}
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                    style={{
                      padding: `10px ${spacing['3xl']}`,
                      background: 'rgba(72, 201, 176, 0.15)',
                      border: '1px solid rgba(72, 201, 176, 0.3)',
                      borderRadius: radius.md,
                      color: '#48c9b0',
                      fontSize: fontSize.lg,
                      fontWeight: fontWeight.semibold,
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
              padding: spacing.xl,
              background: 'rgba(255, 255, 255, 0.03)',
              borderRadius: radius.lg,
              marginBottom: spacing['2xl'],
            }}>
              <p style={{ color: 'rgba(255, 255, 255, 0.4)', fontSize: fontSize.base, margin: `0 0 ${spacing.lg}` }}>
                Didn't receive the email? Check your spam folder or:
              </p>
              <motion.button
                type="button"
                onClick={handleResendVerification}
                disabled={loading || resendCooldown > 0}
                whileHover={{ scale: resendCooldown > 0 ? 1 : 1.02 }}
                whileTap={{ scale: resendCooldown > 0 ? 1 : 0.98 }}
                style={{
                  padding: `10px ${spacing['3xl']}`,
                  background: (loading || resendCooldown > 0) ? 'rgba(128, 128, 128, 0.2)' : 'rgba(93, 173, 226, 0.15)',
                  border: `1px solid ${(loading || resendCooldown > 0) ? 'rgba(128, 128, 128, 0.3)' : 'rgba(93, 173, 226, 0.3)'}`,
                  borderRadius: radius.md,
                  color: (loading || resendCooldown > 0) ? 'rgba(255, 255, 255, 0.3)' : '#5dade2',
                  fontSize: fontSize.lg,
                  fontWeight: fontWeight.semibold,
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
                fontSize: fontSize.lg,
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
              <div style={{ padding: `${spacing['5xl']} 0` }}>
                <Loader size={40} style={{ color: '#5dade2', animation: 'spin 1s linear infinite', marginBottom: spacing.xl }} />
                <p style={{ color: 'rgba(255, 255, 255, 0.6)', fontSize: fontSize['2xl'] }}>
                  Verifying your email address...
                </p>
                <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
              </div>
            ) : successMessage ? (
              <div style={{ padding: `${spacing['3xl']} 0` }}>
                <ShieldCheck size={48} style={{ color: '#48c9b0', marginBottom: spacing.xl }} />
                <h3 style={{ color: '#48c9b0', fontSize: fontSize['3xl'], marginBottom: spacing.lg }}>
                  Email Verified!
                </h3>
                <p style={{ color: 'rgba(255, 255, 255, 0.6)', fontSize: fontSize.lg, lineHeight: 1.6 }}>
                  {successMessage}
                </p>
              </div>
            ) : error ? (
              <div style={{ padding: `${spacing['3xl']} 0` }}>
                <Mail size={48} style={{ color: currentTheme.error, marginBottom: spacing.xl }} />
                <h3 style={{ color: currentTheme.error, fontSize: fontSize['3xl'], marginBottom: spacing.lg }}>
                  Verification Failed
                </h3>
                <p style={{ color: 'rgba(255, 255, 255, 0.5)', fontSize: fontSize.lg, lineHeight: 1.6, marginBottom: spacing['2xl'] }}>
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
                    fontSize: fontSize.lg,
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
