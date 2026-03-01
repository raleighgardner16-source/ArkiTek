import React, { useState, useEffect, useCallback, useRef } from 'react'
import { motion } from 'framer-motion'
import { CreditCard, LogOut, CheckCircle, AlertCircle, Shield, Loader } from 'lucide-react'
import { loadStripe } from '@stripe/stripe-js'
import { Elements, PaymentElement, useStripe, useElements } from '@stripe/react-stripe-js'
import { useStore } from '../store/useStore'
import { getTheme } from '../utils/theme'
import { spacing, fontSize, fontWeight, radius, zIndex, layout, sx, createStyles } from '../utils/styles'
import api from '../utils/api'

// Stripe promise — loaded once
let stripePromise: any = null

const getStripePromise = async () => {
  if (!stripePromise) {
    const response = await api.get('/stripe/config')
    stripePromise = loadStripe(response.data.publishableKey)
  }
  return stripePromise
}

interface InlineCheckoutFormProps {
  onSuccess?: () => void
  onError?: (msg: string) => void
}

const InlineCheckoutForm = ({ onSuccess, onError }: InlineCheckoutFormProps) => {
  const stripe = useStripe()
  const elements = useElements()
  const currentUser = useStore((state: any) => state.currentUser)
  const [processing, setProcessing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [ready, setReady] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!stripe || !elements) return

    setProcessing(true)
    setError(null)

    try {
      const { error: stripeError, paymentIntent } = await stripe.confirmPayment({
        elements,
        confirmParams: {
          return_url: window.location.origin,
        },
        redirect: 'if_required',
      })

      if (stripeError) {
        console.error('[Payment] Stripe error:', stripeError)
        setError(stripeError.message || null)
        onError?.(stripeError.message || 'Payment failed')
      } else if (paymentIntent) {
        console.log('[Payment] PaymentIntent status:', paymentIntent.status)
        if (paymentIntent.status === 'succeeded') {
          onSuccess?.()
        } else if (paymentIntent.status === 'processing') {
          setError('Payment is processing. Please wait a moment and check your status.')
          onError?.('Payment is still processing.')
        } else if (paymentIntent.status === 'requires_action') {
          setError('Additional authentication required. Please complete the verification.')
          onError?.('Additional authentication required.')
        } else {
          setError(`Payment not completed (status: ${paymentIntent.status}). Please try again.`)
          onError?.(`Payment status: ${paymentIntent.status}`)
        }
      } else {
        setError('No payment response received. Please try again.')
        onError?.('No payment response received.')
      }
    } catch (err: any) {
      console.error('[Payment] Error:', err)
      const msg = err.message || 'Payment failed. Please try again.'
      setError(msg)
      onError?.(msg)
    } finally {
      setProcessing(false)
    }
  }

  return (
    <form onSubmit={handleSubmit}>
      {/* Payment Element */}
      <div style={{
        marginBottom: spacing.xl,
        padding: spacing.xl,
        background: 'rgba(0, 0, 0, 0.3)',
        borderRadius: radius.lg,
        border: '1px solid rgba(93, 173, 226, 0.1)',
      }}>
        <PaymentElement
          onReady={() => setReady(true)}
          options={{
            layout: 'accordion',
            wallets: {
              applePay: 'never',
              googlePay: 'never',
            },
            paymentMethodOrder: ['card'],
          }}
        />
      </div>

      {error && (
        <div style={{
          padding: '10px 14px',
          marginBottom: spacing.xl,
          background: 'rgba(255, 0, 0, 0.1)',
          border: '1px solid rgba(255, 0, 0, 0.3)',
          borderRadius: radius.md,
          color: '#FF6B6B',
          fontSize: fontSize.base,
        }}>
          {error}
        </div>
      )}

      {/* Subscribe Button */}
      <motion.button
        type="submit"
        disabled={!stripe || !elements || processing || !ready}
        whileHover={{ scale: processing ? 1 : 1.02 }}
        whileTap={{ scale: processing ? 1 : 0.98 }}
        style={sx(layout.center, {
          width: '100%',
          padding: '14px',
          background: (!stripe || !elements || processing || !ready)
            ? 'rgba(128, 128, 128, 0.3)'
            : 'linear-gradient(135deg, #5dade2, #48c9b0)',
          border: 'none',
          borderRadius: radius.md,
          color: (!stripe || !elements || processing || !ready) ? '#666666' : '#000000',
          fontSize: fontSize['2xl'],
          fontWeight: fontWeight.bold,
          cursor: (!stripe || !elements || processing || !ready) ? 'not-allowed' : 'pointer',
          gap: spacing.md,
          marginBottom: spacing.md,
        })}
      >
        {processing ? (
          <>
            <Loader size={18} style={{ animation: 'spin 1s linear infinite' }} />
            Processing payment...
          </>
        ) : !ready ? (
          <>
            <Loader size={18} style={{ animation: 'spin 1s linear infinite' }} />
            Loading...
          </>
        ) : (
          <>
            <CreditCard size={18} />
            {currentUser?.plan === 'premium' ? 'Subscribe Now — $49.95/month' : 'Subscribe Now — $19.95/month'}
          </>
        )}
      </motion.button>

      <div style={sx(layout.center, {
        gap: spacing.sm,
        marginTop: spacing.md,
        color: 'rgba(255, 255, 255, 0.3)',
        fontSize: '0.75rem',
      })}>
        <Shield size={12} />
        Secured by Stripe. Your card info never touches our servers.
      </div>
    </form>
  )
}

interface SubscriptionGateProps {
  currentUser: any
}

const SubscriptionGate = ({ currentUser }: SubscriptionGateProps) => {
  const [checking, setChecking] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [successMessage, setSuccessMessage] = useState<string | null>(null)
  const [clientSecret, setClientSecret] = useState<string | null>(null)
  const [loadingPayment, setLoadingPayment] = useState(true)
  const [resolvedStripe, setResolvedStripe] = useState<any>(null)
  const setCurrentUser = useStore((state) => state.setCurrentUser)
  const clearCurrentUser = useStore((state) => state.clearCurrentUser)
  const currentTheme = getTheme('dark')
  const s = createStyles(currentTheme)
  const initCalledRef = useRef(false) // Guard against double-call from React Strict Mode

  // Check subscription status
  const checkSubscriptionStatus = useCallback(async () => {
    if (!currentUser?.id) return

    try {
      setChecking(true)
      const response = await api.get('/stripe/subscription-status', {
        params: { sync: 'true' },
      })

      const newStatus = response.data.subscriptionStatus
      if (newStatus === 'active' || newStatus === 'trialing') {
        setCurrentUser({
          ...currentUser,
          subscriptionStatus: newStatus,
          subscriptionRenewalDate: response.data.subscriptionRenewalDate,
        })
        setSuccessMessage('Subscription activated! Redirecting...')
      }
    } catch (err: any) {
      console.error('[SubscriptionGate] Error checking status:', err)
    } finally {
      setChecking(false)
    }
  }, [currentUser, setCurrentUser])

  // On mount: check status, load Stripe, and create subscription intent
  useEffect(() => {
    checkSubscriptionStatus()
  }, [checkSubscriptionStatus])

  useEffect(() => {
    if (!currentUser?.id) return
    // Prevent double-call from React 18 Strict Mode (which double-fires effects in dev)
    if (initCalledRef.current) return
    initCalledRef.current = true

    const initPayment = async () => {
      setLoadingPayment(true)
      try {
        const response = await api.post('/stripe/create-subscription-intent')

        // If the server says user already has an active subscription, update and pass through
        if (response.data.alreadyActive) {
          console.log('[SubscriptionGate] User already has active subscription, activating...')
          setCurrentUser({
            ...currentUser,
            subscriptionStatus: 'active',
          })
          setSuccessMessage('Subscription already active! Redirecting...')
          return
        }

        const stripeInstance = await getStripePromise()
        setResolvedStripe(stripeInstance)
        setClientSecret(response.data.clientSecret)
      } catch (err: any) {
        console.error('[SubscriptionGate] Error initializing payment:', err)
        setError(err.response?.data?.error || 'Failed to initialize payment. Please try again.')
      } finally {
        setLoadingPayment(false)
      }
    }

    initPayment()
  }, [currentUser?.id])

  const handlePaymentSuccess = async () => {
    setSuccessMessage('Payment successful! Activating your subscription...')

    // Call the server's confirm-subscription endpoint which checks Stripe directly
    const maxAttempts = 5
    let activated = false

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        // Wait before retries (give Stripe time to process)
        if (attempt > 1) {
          await new Promise(resolve => setTimeout(resolve, 2000))
        }

        const response = await api.post('/stripe/confirm-subscription')

        const { subscriptionStatus, subscriptionRenewalDate } = response.data
        console.log(`[SubscriptionGate] Confirm attempt ${attempt}: status=${subscriptionStatus}`)

        if (subscriptionStatus === 'active' || subscriptionStatus === 'trialing') {
          setCurrentUser({
            ...currentUser,
            subscriptionStatus,
            subscriptionRenewalDate,
          })
          activated = true
          break
        }
      } catch (err: any) {
        console.error(`[SubscriptionGate] Confirm attempt ${attempt} error:`, err)
      }
    }

    if (activated) {
      setSuccessMessage('Payment successful! Welcome to ArkiTek...')
    } else {
      setSuccessMessage(null)
      setError('Payment was processed but subscription activation is taking longer than expected. Please click "Check status" below or refresh the page.')
    }
  }

  const handlePaymentError = (msg: string) => {
    setError(msg)
  }

  const handleSignOut = () => {
    clearCurrentUser()
  }

  return (
    <div
      style={sx(layout.fixedFill, layout.center, {
        background: 'linear-gradient(135deg, #0a0a0a 0%, #1a1a2e 100%)',
        zIndex: zIndex.modal,
        overflowY: 'auto',
        padding: `${spacing['2xl']} 0`,
      })}
    >
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        style={{
          width: '100%',
          maxWidth: '500px',
          padding: '36px',
          background: currentTheme.backgroundOverlay,
          border: `1px solid ${currentTheme.borderLight}`,
          borderRadius: radius['3xl'],
          boxShadow: `0 0 40px ${currentTheme.shadowLight}`,
          margin: 'auto',
        }}
      >
        {/* Header */}
        <div style={{ textAlign: 'center', marginBottom: spacing['3xl'] }}>
          <h1
            style={sx(s.pageTitle, { marginBottom: spacing.md })}
          >
            ArkiTek
          </h1>
          <p style={{ color: currentTheme.textSecondary, fontSize: fontSize['2xl'], marginBottom: spacing.xs }}>
            Welcome, {currentUser.firstName || currentUser.username}!
          </p>
          <p style={{ color: currentTheme.textMuted, fontSize: fontSize.base }}>
            Subscribe to start using ArkiTek.
          </p>
        </div>

        {/* Success Message */}
        {successMessage && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            style={sx(layout.flexRow, {
              padding: spacing.lg,
              marginBottom: spacing['2xl'],
              background: 'rgba(72, 201, 176, 0.1)',
              border: '1px solid rgba(72, 201, 176, 0.3)',
              borderRadius: radius.md,
              color: '#00FF88',
              fontSize: fontSize.lg,
              gap: spacing.md,
            })}
          >
            <CheckCircle size={16} />
            {successMessage}
          </motion.div>
        )}

        {/* Error Message */}
        {error && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            style={sx(layout.flexRow, {
              padding: spacing.lg,
              marginBottom: spacing['2xl'],
              background: 'rgba(255, 0, 0, 0.1)',
              border: '1px solid rgba(255, 0, 0, 0.3)',
              borderRadius: radius.md,
              color: currentTheme.error,
              fontSize: fontSize.lg,
              gap: spacing.md,
            })}
          >
            <AlertCircle size={16} />
            {error}
          </motion.div>
        )}

        {/* Subscription Info */}
        <div style={{
          padding: spacing.xl,
          marginBottom: spacing['2xl'],
          background: 'rgba(93, 173, 226, 0.05)',
          border: '1px solid rgba(93, 173, 226, 0.15)',
          borderRadius: radius.xl,
        }}>
          <h3 style={{ color: '#ffffff', fontSize: '1.05rem', marginBottom: '10px', marginTop: 0 }}>
            {currentUser?.plan === 'premium' ? 'ArkiTek Premium — $49.95/month' : 'ArkiTek Pro — $19.95/month'}
          </h3>
          <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
            {(currentUser?.plan === 'premium'
              ? ['$25/month in usage (50x more)', 'All models & features', 'Monthly rewards: usage bonuses & badges']
              : ['$7.50/month in usage (15x more)', 'All models & features', 'Monthly rewards: usage bonuses & badges']
            ).map((feature, i) => (
              <li key={i} style={sx(layout.flexRow, {
                color: 'rgba(255, 255, 255, 0.7)',
                fontSize: fontSize.base,
                padding: '3px 0',
                gap: spacing.md,
              })}>
                <CheckCircle size={13} color="#00FF88" />
                {feature}
              </li>
            ))}
          </ul>
        </div>

        {/* Inline Payment Form */}
        {loadingPayment && !successMessage && (
          <div style={{ textAlign: 'center', padding: `${spacing['4xl']} 0` }}>
            <Loader
              size={32}
              color="#5dade2"
              style={{ animation: 'spin 1s linear infinite', marginBottom: spacing.lg }}
            />
            <p style={{ color: 'rgba(255, 255, 255, 0.5)', fontSize: fontSize.base, margin: 0 }}>
              Loading payment form...
            </p>
          </div>
        )}

        {clientSecret && resolvedStripe && !loadingPayment && !successMessage && (
          <Elements
            stripe={resolvedStripe}
            options={{
              clientSecret,
              appearance: {
                theme: 'night',
                variables: {
                  colorPrimary: '#5dade2',
                  colorBackground: '#0a0a1a',
                  colorText: '#ffffff',
                  colorTextSecondary: 'rgba(255, 255, 255, 0.6)',
                  colorDanger: '#FF6B6B',
                  fontFamily: 'system-ui, -apple-system, sans-serif',
                  borderRadius: '8px',
                  spacingUnit: '4px',
                },
                rules: {
                  '.Input': {
                    backgroundColor: 'rgba(93, 173, 226, 0.05)',
                    border: '1px solid rgba(93, 173, 226, 0.2)',
                    color: '#ffffff',
                  },
                  '.Input:focus': {
                    border: '1px solid rgba(93, 173, 226, 0.5)',
                    boxShadow: '0 0 8px rgba(93, 173, 226, 0.15)',
                  },
                  '.Label': {
                    color: 'rgba(255, 255, 255, 0.7)',
                  },
                  '.Tab': {
                    backgroundColor: 'rgba(93, 173, 226, 0.05)',
                    border: '1px solid rgba(93, 173, 226, 0.15)',
                    color: 'rgba(255, 255, 255, 0.6)',
                  },
                  '.Tab--selected': {
                    backgroundColor: 'rgba(93, 173, 226, 0.15)',
                    border: '1px solid rgba(93, 173, 226, 0.4)',
                    color: '#5dade2',
                  },
                },
              },
            }}
          >
            <InlineCheckoutForm
              onSuccess={handlePaymentSuccess}
              onError={handlePaymentError}
            />
          </Elements>
        )}

        {/* Retry / Check Status buttons */}
        {!loadingPayment && !successMessage && (
          <div style={{ textAlign: 'center', marginBottom: spacing.xl, display: 'flex', gap: spacing.lg, justifyContent: 'center' }}>
            {!clientSecret && (
              <motion.button
                onClick={() => window.location.reload()}
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                style={{
                  padding: `${spacing.lg} ${spacing['3xl']}`,
                  background: 'rgba(93, 173, 226, 0.1)',
                  border: '1px solid rgba(93, 173, 226, 0.3)',
                  borderRadius: radius.md,
                  color: '#5dade2',
                  cursor: 'pointer',
                  fontSize: fontSize.lg,
                }}
              >
                Retry
              </motion.button>
            )}
            {error && (
              <motion.button
                onClick={() => { setError(null); checkSubscriptionStatus() }}
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                disabled={checking}
                style={{
                  padding: `${spacing.lg} ${spacing['3xl']}`,
                  background: 'rgba(93, 173, 226, 0.1)',
                  border: '1px solid rgba(93, 173, 226, 0.3)',
                  borderRadius: radius.md,
                  color: '#5dade2',
                  cursor: checking ? 'not-allowed' : 'pointer',
                  fontSize: fontSize.lg,
                  opacity: checking ? 0.5 : 1,
                }}
              >
                {checking ? 'Checking...' : 'Check status'}
              </motion.button>
            )}
          </div>
        )}

        {/* Sign Out Button */}
        <button
          onClick={handleSignOut}
          style={sx(layout.center, {
            width: '100%',
            padding: '10px',
            marginTop: spacing.md,
            background: 'none',
            border: 'none',
            color: 'rgba(255, 255, 255, 0.4)',
            cursor: 'pointer',
            fontSize: fontSize.base,
            gap: spacing.sm,
          })}
        >
          <LogOut size={14} />
          Sign out
        </button>
      </motion.div>

      <style>{`
        @keyframes spin {
          0% { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  )
}

export default SubscriptionGate
