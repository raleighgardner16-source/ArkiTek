import React, { useState, useEffect, useCallback, useRef } from 'react'
import { motion } from 'framer-motion'
import { CreditCard, LogOut, CheckCircle, AlertCircle, Shield, Loader } from 'lucide-react'
import { loadStripe } from '@stripe/stripe-js'
import { Elements, PaymentElement, useStripe, useElements } from '@stripe/react-stripe-js'
import { useStore } from '../store/useStore'
import { getTheme } from '../utils/theme'
import axios from 'axios'
import { API_URL } from '../utils/config'

// Stripe promise — loaded once
let stripePromise = null

const getStripePromise = async () => {
  if (!stripePromise) {
    const response = await axios.get(`${API_URL}/api/stripe/config`)
    stripePromise = loadStripe(response.data.publishableKey)
  }
  return stripePromise
}

// Inner checkout form that uses Stripe hooks
const InlineCheckoutForm = ({ onSuccess, onError }) => {
  const stripe = useStripe()
  const elements = useElements()
  const [processing, setProcessing] = useState(false)
  const [error, setError] = useState(null)
  const [ready, setReady] = useState(false)

  const handleSubmit = async (e) => {
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
        setError(stripeError.message)
        onError?.(stripeError.message)
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
    } catch (err) {
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
        marginBottom: '16px',
        padding: '16px',
        background: 'rgba(0, 0, 0, 0.3)',
        borderRadius: '10px',
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
          marginBottom: '16px',
          background: 'rgba(255, 0, 0, 0.1)',
          border: '1px solid rgba(255, 0, 0, 0.3)',
          borderRadius: '8px',
          color: '#FF6B6B',
          fontSize: '0.85rem',
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
        style={{
          width: '100%',
          padding: '14px',
          background: (!stripe || !elements || processing || !ready)
            ? 'rgba(128, 128, 128, 0.3)'
            : 'linear-gradient(135deg, #5dade2, #48c9b0)',
          border: 'none',
          borderRadius: '8px',
          color: (!stripe || !elements || processing || !ready) ? '#666666' : '#000000',
          fontSize: '1rem',
          fontWeight: 'bold',
          cursor: (!stripe || !elements || processing || !ready) ? 'not-allowed' : 'pointer',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: '8px',
          marginBottom: '8px',
        }}
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

      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: '6px',
        marginTop: '8px',
        color: 'rgba(255, 255, 255, 0.3)',
        fontSize: '0.75rem',
      }}>
        <Shield size={12} />
        Secured by Stripe. Your card info never touches our servers.
      </div>
    </form>
  )
}

// Main gate component
const SubscriptionGate = ({ currentUser }) => {
  const [checking, setChecking] = useState(false)
  const [error, setError] = useState(null)
  const [successMessage, setSuccessMessage] = useState(null)
  const [clientSecret, setClientSecret] = useState(null)
  const [loadingPayment, setLoadingPayment] = useState(true)
  const [resolvedStripe, setResolvedStripe] = useState(null)
  const setCurrentUser = useStore((state) => state.setCurrentUser)
  const clearCurrentUser = useStore((state) => state.clearCurrentUser)
  const currentTheme = getTheme('dark')
  const initCalledRef = useRef(false) // Guard against double-call from React Strict Mode

  // Check subscription status
  const checkSubscriptionStatus = useCallback(async () => {
    if (!currentUser?.id) return

    try {
      setChecking(true)
      const response = await axios.get(`${API_URL}/api/stripe/subscription-status`, {
        params: { userId: currentUser.id, sync: 'true' },
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
    } catch (err) {
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
        const response = await axios.post(`${API_URL}/api/stripe/create-subscription-intent`, {
          userId: currentUser.id,
        })

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
      } catch (err) {
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

        const response = await axios.post(`${API_URL}/api/stripe/confirm-subscription`, {
          userId: currentUser.id,
        })

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
      } catch (err) {
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

  const handlePaymentError = (msg) => {
    setError(msg)
  }

  const handleSignOut = () => {
    clearCurrentUser()
  }

  return (
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
        overflowY: 'auto',
        padding: '20px 0',
      }}
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
          borderRadius: '20px',
          boxShadow: `0 0 40px ${currentTheme.shadowLight}`,
          margin: 'auto',
        }}
      >
        {/* Header */}
        <div style={{ textAlign: 'center', marginBottom: '24px' }}>
          <h1
            style={{
              fontSize: '2.5rem',
              marginBottom: '8px',
              background: currentTheme.accentGradient,
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
              display: 'inline-block',
            }}
          >
            ArkiTek
          </h1>
          <p style={{ color: currentTheme.textSecondary, fontSize: '1rem', marginBottom: '4px' }}>
            Welcome, {currentUser.firstName || currentUser.username}!
          </p>
          <p style={{ color: currentTheme.textMuted, fontSize: '0.85rem' }}>
            Subscribe to start using ArkiTek.
          </p>
        </div>

        {/* Success Message */}
        {successMessage && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            style={{
              padding: '12px',
              marginBottom: '20px',
              background: 'rgba(72, 201, 176, 0.1)',
              border: '1px solid rgba(72, 201, 176, 0.3)',
              borderRadius: '8px',
              color: '#00FF88',
              fontSize: '0.9rem',
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
            }}
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
            style={{
              padding: '12px',
              marginBottom: '20px',
              background: 'rgba(255, 0, 0, 0.1)',
              border: '1px solid rgba(255, 0, 0, 0.3)',
              borderRadius: '8px',
              color: '#FF6B6B',
              fontSize: '0.9rem',
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
            }}
          >
            <AlertCircle size={16} />
            {error}
          </motion.div>
        )}

        {/* Subscription Info */}
        <div style={{
          padding: '16px',
          marginBottom: '20px',
          background: 'rgba(93, 173, 226, 0.05)',
          border: '1px solid rgba(93, 173, 226, 0.15)',
          borderRadius: '12px',
        }}>
          <h3 style={{ color: '#ffffff', fontSize: '1.05rem', marginBottom: '10px', marginTop: 0 }}>
            {currentUser?.plan === 'premium' ? 'ArkiTek Premium — $49.95/month' : 'ArkiTek Pro — $19.95/month'}
          </h3>
          <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
            {(currentUser?.plan === 'premium'
              ? ['$25/month in usage (50x more)', 'All models & features', 'Monthly rewards: usage bonuses & badges']
              : ['$7.50/month in usage (15x more)', 'All models & features', 'Monthly rewards: usage bonuses & badges']
            ).map((feature, i) => (
              <li key={i} style={{
                color: 'rgba(255, 255, 255, 0.7)',
                fontSize: '0.85rem',
                padding: '3px 0',
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
              }}>
                <CheckCircle size={13} color="#00FF88" />
                {feature}
              </li>
            ))}
          </ul>
        </div>

        {/* Inline Payment Form */}
        {loadingPayment && !successMessage && (
          <div style={{ textAlign: 'center', padding: '30px 0' }}>
            <Loader
              size={32}
              color="#5dade2"
              style={{ animation: 'spin 1s linear infinite', marginBottom: '12px' }}
            />
            <p style={{ color: 'rgba(255, 255, 255, 0.5)', fontSize: '0.85rem', margin: 0 }}>
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
          <div style={{ textAlign: 'center', marginBottom: '16px', display: 'flex', gap: '12px', justifyContent: 'center' }}>
            {!clientSecret && (
              <motion.button
                onClick={() => window.location.reload()}
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                style={{
                  padding: '12px 24px',
                  background: 'rgba(93, 173, 226, 0.1)',
                  border: '1px solid rgba(93, 173, 226, 0.3)',
                  borderRadius: '8px',
                  color: '#5dade2',
                  cursor: 'pointer',
                  fontSize: '0.9rem',
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
                  padding: '12px 24px',
                  background: 'rgba(93, 173, 226, 0.1)',
                  border: '1px solid rgba(93, 173, 226, 0.3)',
                  borderRadius: '8px',
                  color: '#5dade2',
                  cursor: checking ? 'not-allowed' : 'pointer',
                  fontSize: '0.9rem',
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
          style={{
            width: '100%',
            padding: '10px',
            marginTop: '8px',
            background: 'none',
            border: 'none',
            color: 'rgba(255, 255, 255, 0.4)',
            cursor: 'pointer',
            fontSize: '0.85rem',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '6px',
          }}
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

