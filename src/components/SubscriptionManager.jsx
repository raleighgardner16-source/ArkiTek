import React, { useState, useEffect, useCallback, useRef } from 'react'
import axios from 'axios'
import { API_URL } from '../utils/config'
import { useStore } from '../store/useStore'
import { getTheme } from '../utils/theme'
import { CreditCard, CheckCircle, XCircle, AlertCircle, Loader, Pause, Trash2, X } from 'lucide-react'

const SubscriptionManager = () => {
  const currentUser = useStore((state) => state.currentUser)
  const theme = useStore((state) => state.theme || 'dark')
  const currentTheme = getTheme(theme)
  const [subscriptionStatus, setSubscriptionStatus] = useState(null)
  const [subscriptionRenewalDate, setSubscriptionRenewalDate] = useState(null)
  const [loading, setLoading] = useState(true)
  const [processing, setProcessing] = useState(false)
  const [error, setError] = useState(null)
  const [successMessage, setSuccessMessage] = useState(null)
  const [isRetrying, setIsRetrying] = useState(false)
  const [showPauseConfirm, setShowPauseConfirm] = useState(false)
  const [showCancelConfirm, setShowCancelConfirm] = useState(false)
  const retryCountRef = useRef(0)
  const retryTimeoutRef = useRef(null)

  const fetchSubscriptionStatus = useCallback(async (forceSync = false) => {
    if (!currentUser?.id) return

    try {
      setLoading(true)
      const response = await axios.get(`${API_URL}/api/stripe/subscription-status`, {
        params: { 
          userId: currentUser.id,
          sync: forceSync ? 'true' : undefined
        },
      })

      const newStatus = response.data.subscriptionStatus
      setSubscriptionStatus(newStatus)
      setSubscriptionRenewalDate(response.data.subscriptionRenewalDate)
      setError(null)
      
      // If status was synced and is now active, show success message
      if (response.data.synced && newStatus === 'active') {
        setSuccessMessage('Subscription status synced from Stripe!')
        setTimeout(() => setSuccessMessage(null), 5000)
      }
      
      // If we got an active subscription, reset retry count
      if (newStatus === 'active') {
        retryCountRef.current = 0
        if (retryTimeoutRef.current) {
          clearTimeout(retryTimeoutRef.current)
          retryTimeoutRef.current = null
        }
      } else if (newStatus === 'inactive' && !forceSync) {
        // If status is inactive, try syncing once from Stripe
        const syncResponse = await axios.get(`${API_URL}/api/stripe/subscription-status`, {
          params: { 
            userId: currentUser.id,
            sync: 'true'
          },
        })
        
        if (syncResponse.data.subscriptionStatus !== newStatus) {
          // Status changed after sync
          setSubscriptionStatus(syncResponse.data.subscriptionStatus)
          setSubscriptionRenewalDate(syncResponse.data.subscriptionRenewalDate)
          if (syncResponse.data.subscriptionStatus === 'active') {
            setSuccessMessage('Subscription found and activated!')
            setTimeout(() => setSuccessMessage(null), 5000)
          }
        }
      }
    } catch (err) {
      console.error('[Subscription] Error fetching status:', err)
      console.error('[Subscription] Error details:', {
        message: err.message,
        response: err.response?.data,
        status: err.response?.status,
        code: err.code,
        config: err.config
      })
      setError(err.response?.data?.error || err.message || 'Failed to load subscription status')
    } finally {
      setLoading(false)
    }
  }, [currentUser?.id])

  // Check subscription status on mount and when user changes
  useEffect(() => {
    if (currentUser?.id) {
      fetchSubscriptionStatus()
    }
  }, [currentUser?.id, fetchSubscriptionStatus])

  // Check URL params for subscription success/cancel
  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const subscriptionParam = params.get('subscription')
    
    if (subscriptionParam === 'success') {
      setSuccessMessage('Subscription activated successfully!')
      // Clean up URL immediately
      window.history.replaceState({}, '', window.location.pathname)
      
      // Fetch status immediately
      fetchSubscriptionStatus()
      
      // Retry fetching status in case webhook hasn't processed yet
      // Retry up to 5 times with increasing delays
      retryCountRef.current = 0
      setIsRetrying(true)
      const retryWithBackoff = async () => {
        if (retryCountRef.current >= 5) {
          setIsRetrying(false)
          return
        }
        
        retryTimeoutRef.current = setTimeout(async () => {
          retryCountRef.current++
          
          try {
            const response = await axios.get(`${API_URL}/api/stripe/subscription-status`, {
              params: { userId: currentUser.id },
            })
            
            const newStatus = response.data.subscriptionStatus
            setSubscriptionStatus(newStatus)
            setSubscriptionRenewalDate(response.data.subscriptionRenewalDate)
            
            // If still not active, schedule another retry
            if (newStatus !== 'active' && retryCountRef.current < 5) {
              retryWithBackoff()
            } else if (newStatus === 'active') {
              retryCountRef.current = 0
              setIsRetrying(false)
            }
          } catch (err) {
            console.error('[Subscription] Error during retry:', err)
            // Continue retrying even on error
            if (retryCountRef.current < 5) {
              retryWithBackoff()
            } else {
              setIsRetrying(false)
            }
          }
        }, 2000 * retryCountRef.current) // 2s, 4s, 6s, 8s, 10s
      }
      
      // Start retry after initial fetch (give webhook time to process)
      setTimeout(() => {
        retryWithBackoff()
      }, 2000)
    } else if (subscriptionParam === 'canceled') {
      setError('Subscription checkout was canceled.')
      window.history.replaceState({}, '', window.location.pathname)
    }
    
    // Cleanup timeout on unmount
    return () => {
      if (retryTimeoutRef.current) {
        clearTimeout(retryTimeoutRef.current)
        retryTimeoutRef.current = null
      }
    }
  }, [fetchSubscriptionStatus, currentUser?.id])

  const handleSubscribe = async () => {
    
    // Debug: Show alert if button is clicked
    if (!currentUser?.id) {
      alert('No user ID found. Please make sure you are logged in.')
    }
    
    if (!currentUser?.id) {
      console.error('[Subscription] No user ID found')
      setError('Please sign in to subscribe')
      return
    }

    try {
      setProcessing(true)
      setError(null)
      const response = await axios.post(`${API_URL}/api/stripe/create-checkout-session`, {
        userId: currentUser.id,
      })

      if (response.data.url) {
        // Redirect to Stripe Checkout
        window.location.href = response.data.url
      } else {
        console.error('[Subscription] No URL in response:', response.data)
        setError('Failed to create checkout session')
      }
    } catch (err) {
      console.error('[Subscription] Error creating checkout:', err)
      console.error('[Subscription] Error details:', {
        message: err.message,
        response: err.response?.data,
        status: err.response?.status,
        code: err.code,
        config: err.config
      })
      const errorMessage = err.response?.data?.error || err.message || 'Failed to start subscription process'
      if (err.code === 'ECONNREFUSED' || err.message?.includes('Network Error')) {
        setError('Cannot connect to server. Make sure the backend server is running (npm run dev:server)')
      } else {
        setError(errorMessage)
      }
    } finally {
      setProcessing(false)
    }
  }

  const handleResubscribe = async () => {
    if (!currentUser?.id) {
      setError('Please sign in to resubscribe')
      return
    }

    try {
      setProcessing(true)
      setError(null)

      const response = await axios.post(`${API_URL}/api/stripe/resume-subscription`, {
        userId: currentUser.id,
      })

      if (response.data.success) {
        // Subscription reactivated seamlessly — update local state
        setSuccessMessage(response.data.message || 'Subscription reactivated!')
        setSubscriptionStatus(response.data.subscriptionStatus)
        setSubscriptionRenewalDate(response.data.subscriptionRenewalDate)
        
        // Update the global store so the app knows immediately
        const currentUserData = useStore.getState().currentUser
        if (currentUserData) {
          useStore.getState().setCurrentUser({
            ...currentUserData,
            subscriptionStatus: response.data.subscriptionStatus,
            subscriptionRenewalDate: response.data.subscriptionRenewalDate,
          })
        }

        setTimeout(() => setSuccessMessage(null), 5000)
      }
    } catch (err) {
      console.error('[Subscription] Error resubscribing:', err)
      
      if (err.response?.data?.needsCheckout) {
        // No saved payment method — fall back to Stripe Checkout
        console.log('[Subscription] No saved card, falling back to checkout')
        try {
          const checkoutResponse = await axios.post(`${API_URL}/api/stripe/create-checkout-session`, {
            userId: currentUser.id,
          })
          if (checkoutResponse.data.url) {
            window.location.href = checkoutResponse.data.url
          } else {
            setError('Failed to create checkout session')
          }
        } catch (checkoutErr) {
          setError(checkoutErr.response?.data?.error || 'Failed to start checkout')
        }
      } else {
        setError(err.response?.data?.error || 'Failed to resubscribe. Please try again.')
      }
    } finally {
      setProcessing(false)
    }
  }

  const handlePauseSubscription = async () => {
    if (!currentUser?.id) {
      setError('Please sign in to pause subscription')
      return
    }

    try {
      setProcessing(true)
      setError(null)
      setShowPauseConfirm(false)
      
      const response = await axios.post(`${API_URL}/api/stripe/pause-subscription`, {
        userId: currentUser.id,
      })

      if (response.data.success) {
        setSuccessMessage('Subscription paused successfully. You still have full access until the end of your current billing period.')
        // Update the user's subscription status in the store so the app knows it's paused
        const currentUserData = useStore.getState().currentUser
        if (currentUserData) {
          useStore.getState().setCurrentUser({
            ...currentUserData,
            subscriptionStatus: 'paused',
          })
        }
        // Refresh subscription status
        await fetchSubscriptionStatus()
      } else {
        setError('Failed to pause subscription')
      }
    } catch (err) {
      console.error('[Subscription] Error pausing subscription:', err)
      setError(err.response?.data?.error || 'Failed to pause subscription')
    } finally {
      setProcessing(false)
    }
  }

  const handleCancelSubscription = async () => {
    if (!currentUser?.id) {
      setError('Please sign in to cancel subscription')
      return
    }

    try {
      setProcessing(true)
      setError(null)
      setShowCancelConfirm(false)
      
      const response = await axios.post(`${API_URL}/api/stripe/cancel-subscription-delete-account`, {
        userId: currentUser.id,
      })

      if (response.data.success) {
        setSuccessMessage('Account and subscription deleted successfully.')
        // Log out user and redirect to signup
        setTimeout(() => {
          useStore.getState().setCurrentUser(null)
          window.location.href = '/'
        }, 2000)
      } else {
        setError('Failed to cancel subscription and delete account')
      }
    } catch (err) {
      console.error('[Subscription] Error canceling subscription:', err)
      setError(err.response?.data?.error || 'Failed to cancel subscription and delete account')
    } finally {
      setProcessing(false)
    }
  }

  const getStatusIcon = () => {
    switch (subscriptionStatus) {
      case 'active':
        return <CheckCircle size={24} color={theme === 'dark' ? '#00cc88' : '#008855'} />
      case 'canceled':
      case 'inactive':
        return <XCircle size={24} color="#ff6b6b" />
      case 'paused':
        return <Pause size={24} color="#ffaa00" />
      case 'past_due':
        return <AlertCircle size={24} color="#ffaa00" />
      default:
        return <AlertCircle size={24} color="#aaaaaa" />
    }
  }

  const getStatusText = () => {
    switch (subscriptionStatus) {
      case 'active':
        return 'Active'
      case 'canceled':
        return 'Canceled'
      case 'inactive':
        return 'Inactive'
      case 'paused':
        return 'Paused'
      case 'past_due':
        return 'Past Due'
      default:
        return 'Unknown'
    }
  }

  const getStatusColor = () => {
    switch (subscriptionStatus) {
      case 'active':
        return theme === 'dark' ? '#00cc88' : '#008855'
      case 'canceled':
      case 'inactive':
        return '#ff6b6b'
      case 'past_due':
        return '#ffaa00'
      default:
        return '#aaaaaa'
    }
  }

  const formatDate = (dateString) => {
    if (!dateString) return 'N/A'
    try {
      const date = new Date(dateString)
      return date.toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
      })
    } catch {
      return dateString
    }
  }

  if (loading) {
    return (
      <div
        style={{
          background: currentTheme.backgroundOverlay,
          border: `1px solid ${currentTheme.borderLight}`,
          borderRadius: '16px',
          padding: '30px',
          marginBottom: '40px',
          width: '100%',
          maxWidth: '600px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: '12px',
        }}
      >
        <Loader size={24} className="spin" color={currentTheme.accent} />
        <span style={{ color: currentTheme.textSecondary }}>Loading subscription status...</span>
      </div>
    )
  }

  return (
    <div
      style={{
        background: currentTheme.backgroundOverlay,
        border: `1px solid ${currentTheme.borderLight}`,
        borderRadius: '16px',
        padding: '30px',
        marginBottom: '40px',
        width: '100%',
        maxWidth: '600px',
      }}
    >
      <h3
        style={{
          fontSize: '1.5rem',
          marginBottom: '20px',
          color: currentTheme.accent,
          textAlign: 'center',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: '12px',
        }}
      >
        <CreditCard size={24} />
        Subscription
      </h3>

      {error && (
        <div
          style={{
            padding: '12px',
            background: 'rgba(255, 0, 0, 0.2)',
            border: '1px solid rgba(255, 0, 0, 0.5)',
            borderRadius: '8px',
            marginBottom: '16px',
            color: '#ff6b6b',
            textAlign: 'center',
          }}
        >
          {error}
        </div>
      )}

      {successMessage && (
        <div
          style={{
            padding: '12px',
            background: 'rgba(72, 201, 176, 0.2)',
            border: '1px solid rgba(72, 201, 176, 0.5)',
            borderRadius: '8px',
            marginBottom: '16px',
            color: theme === 'dark' ? '#00cc88' : '#008855',
            textAlign: 'center',
          }}
        >
          {successMessage}
        </div>
      )}

      {/* Subscription Status */}
      <div
        style={{
          background: currentTheme.backgroundSecondary,
          border: `1px solid ${currentTheme.borderLight}`,
          borderRadius: '12px',
          padding: '20px',
          marginBottom: '20px',
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            marginBottom: '12px',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            {getStatusIcon()}
            <span style={{ color: currentTheme.text, fontSize: '1.1rem', fontWeight: 'bold' }}>
              Status: <span style={{ color: getStatusColor() }}>{getStatusText()}</span>
            </span>
          </div>
        </div>

        {subscriptionRenewalDate && (
          <div style={{ color: currentTheme.textSecondary, fontSize: '0.9rem', marginTop: '8px' }}>
            {subscriptionStatus === 'active' ? 'Renews on' : 'Expires on'}:{' '}
            <span style={{ color: currentTheme.accent }}>{formatDate(subscriptionRenewalDate)}</span>
          </div>
        )}

        <div
          style={{
            marginTop: '16px',
            padding: '12px',
            background: currentTheme.backgroundTertiary,
            border: `1px solid ${currentTheme.borderLight}`,
            borderRadius: '8px',
            textAlign: 'center',
          }}
        >
          <div style={{ color: currentTheme.accent, fontSize: '1.2rem', fontWeight: 'bold', marginBottom: '4px' }}>
            $19.95/month
          </div>
          <div style={{ color: currentTheme.textSecondary, fontSize: '0.9rem' }}>Full access to all features</div>
        </div>
      </div>

      {/* Action Buttons */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
        {subscriptionStatus === 'active' ? (
          <>
            {/* Pause Subscription Button */}
            <button
              onClick={() => setShowPauseConfirm(true)}
              disabled={processing}
              style={{
                padding: '14px 24px',
                background: processing
                  ? currentTheme.buttonBackground
                  : currentTheme.buttonBackgroundHover,
                border: `1px solid ${currentTheme.borderActive}`,
                borderRadius: '8px',
                color: processing ? currentTheme.textMuted : currentTheme.accent,
                fontSize: '1rem',
                fontWeight: 'bold',
                cursor: processing ? 'not-allowed' : 'pointer',
                transition: 'all 0.3s ease',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '8px',
              }}
            >
              {processing ? (
                <>
                  <Loader size={18} className="spin" />
                  Processing...
                </>
              ) : (
                <>
                  <Pause size={18} />
                  Pause Subscription
                </>
              )}
            </button>

            {/* Cancel Subscription / Delete Account Button */}
            <button
              onClick={() => setShowCancelConfirm(true)}
              disabled={processing}
              style={{
                padding: '14px 24px',
                background: processing
                  ? currentTheme.buttonBackground
                  : 'rgba(255, 107, 107, 0.2)',
                border: '1px solid rgba(255, 107, 107, 0.5)',
                borderRadius: '8px',
                color: processing ? currentTheme.textMuted : '#ff6b6b',
                fontSize: '1rem',
                fontWeight: 'bold',
                cursor: processing ? 'not-allowed' : 'pointer',
                transition: 'all 0.3s ease',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '8px',
              }}
            >
              {processing ? (
                <>
                  <Loader size={18} className="spin" />
                  Processing...
                </>
              ) : (
                <>
                  <Trash2 size={18} />
                  Cancel Subscription / Delete Account
                </>
              )}
            </button>
          </>
        ) : (subscriptionStatus === 'paused' || subscriptionStatus === 'canceled') ? (
          <>
            {/* Resume / Resubscribe Button for paused/canceled users */}
            {(successMessage && isRetrying) ? (
              <button
                disabled
                style={{
                  padding: '14px 24px',
                  background: 'rgba(128, 128, 128, 0.3)',
                  border: 'none',
                  borderRadius: '8px',
                  color: '#666666',
                  fontSize: '1rem',
                  fontWeight: 'bold',
                  cursor: 'not-allowed',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '8px',
                }}
              >
                <Loader size={18} className="spin" />
                Activating subscription...
              </button>
            ) : (
              <button
                onClick={handleResubscribe}
                disabled={processing}
                style={{
                  padding: '14px 24px',
                  background: processing
                    ? currentTheme.buttonBackground
                    : currentTheme.accentGradient,
                  border: 'none',
                  borderRadius: '8px',
                  color: processing ? currentTheme.textMuted : (theme === 'dark' ? '#000000' : '#ffffff'),
                  fontSize: '1rem',
                  fontWeight: 'bold',
                  cursor: processing ? 'not-allowed' : 'pointer',
                  transition: 'all 0.3s ease',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '8px',
                }}
              >
                {processing ? (
                  <>
                    <Loader size={18} className="spin" />
                    Reactivating...
                  </>
                ) : (
                  <>
                    <CreditCard size={18} />
                    Resubscribe
                  </>
                )}
              </button>
            )}

            {/* Delete Account Button for paused/canceled users */}
            <button
              onClick={() => setShowCancelConfirm(true)}
              disabled={processing}
              style={{
                padding: '14px 24px',
                background: processing
                  ? currentTheme.buttonBackground
                  : 'rgba(255, 107, 107, 0.2)',
                border: '1px solid rgba(255, 107, 107, 0.5)',
                borderRadius: '8px',
                color: processing ? currentTheme.textMuted : '#ff6b6b',
                fontSize: '1rem',
                fontWeight: 'bold',
                cursor: processing ? 'not-allowed' : 'pointer',
                transition: 'all 0.3s ease',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '8px',
              }}
            >
              {processing ? (
                <>
                  <Loader size={18} className="spin" />
                  Processing...
                </>
              ) : (
                <>
                  <Trash2 size={18} />
                  Delete Account
                </>
              )}
            </button>
          </>
        ) : (
          // Inactive / incomplete / other - show Subscribe Now
          (successMessage && isRetrying && subscriptionStatus !== 'active') ? (
            <button
              disabled
              style={{
                padding: '14px 24px',
                background: 'rgba(128, 128, 128, 0.3)',
                border: 'none',
                borderRadius: '8px',
                color: '#666666',
                fontSize: '1rem',
                fontWeight: 'bold',
                cursor: 'not-allowed',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '8px',
              }}
            >
              <Loader size={18} className="spin" />
              Activating subscription...
            </button>
          ) : (
            <button
              onClick={handleSubscribe}
              disabled={processing}
              style={{
                padding: '14px 24px',
                background: processing
                  ? currentTheme.buttonBackground
                  : currentTheme.accentGradient,
                border: 'none',
                borderRadius: '8px',
                color: processing ? currentTheme.textMuted : (theme === 'dark' ? '#000000' : '#ffffff'),
                fontSize: '1rem',
                fontWeight: 'bold',
                cursor: processing ? 'not-allowed' : 'pointer',
                transition: 'all 0.3s ease',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '8px',
              }}
            >
              {processing ? (
                <>
                  <Loader size={18} className="spin" />
                  Processing...
                </>
              ) : (
                <>
                  <CreditCard size={18} />
                  Subscribe Now - $19.95/month
                </>
              )}
            </button>
          )
        )}
        
        {/* Sync Status Button - Show when status is inactive but user might have subscribed */}
        {subscriptionStatus === 'inactive' && (
            <button
            onClick={() => fetchSubscriptionStatus(true)}
            disabled={loading || processing}
            style={{
              padding: '10px 20px',
              background: loading || processing
                ? currentTheme.buttonBackground
                : currentTheme.buttonBackgroundActive,
              border: `1px solid ${currentTheme.borderActive}`,
              borderRadius: '8px',
              color: loading || processing ? currentTheme.textMuted : currentTheme.accent,
              fontSize: '0.9rem',
              fontWeight: 'normal',
              cursor: loading || processing ? 'not-allowed' : 'pointer',
              transition: 'all 0.3s ease',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '8px',
            }}
          >
            {loading ? (
              <>
                <Loader size={16} className="spin" />
                Syncing...
              </>
            ) : (
              <>
                <AlertCircle size={16} />
                Sync Status from Stripe
              </>
            )}
          </button>
        )}
      </div>

      {/* Pause Subscription Confirmation Modal */}
      {showPauseConfirm && (
        <div
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: currentTheme.backgroundOverlayLight,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 10000,
          }}
          onClick={() => setShowPauseConfirm(false)}
        >
          <div
            style={{
              background: currentTheme.backgroundOverlay,
              border: `2px solid ${currentTheme.borderActive}`,
              borderRadius: '16px',
              padding: '30px',
              maxWidth: '500px',
              width: '90%',
              position: 'relative',
              boxShadow: `0 0 30px ${currentTheme.shadow}`,
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <button
              onClick={() => setShowPauseConfirm(false)}
              style={{
                position: 'absolute',
                top: '15px',
                right: '15px',
                background: 'transparent',
                border: 'none',
                color: currentTheme.text,
                cursor: 'pointer',
                padding: '5px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <X size={24} />
            </button>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '20px', justifyContent: 'center' }}>
              <Pause size={24} color="#ffaa00" />
              <h4 style={{ color: currentTheme.text, margin: 0, fontSize: '1.3rem' }}>
                Pause Subscription
              </h4>
            </div>
            <p style={{ color: currentTheme.textSecondary, marginBottom: '14px', lineHeight: '1.7', textAlign: 'center' }}>
              If you pause your account, you will <span style={{ color: '#ffaa00', fontWeight: '600' }}>not be charged</span> for the next billing cycle.
            </p>
            {subscriptionRenewalDate && (
              <p style={{ color: currentTheme.textSecondary, marginBottom: '14px', lineHeight: '1.7', textAlign: 'center' }}>
                You'll still have <span style={{ color: currentTheme.accent, fontWeight: '600' }}>full access</span> until{' '}
                <span style={{ color: currentTheme.accent, fontWeight: '600' }}>
                  {new Date(subscriptionRenewalDate).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}
                </span>.
              </p>
            )}
            <p style={{ color: currentTheme.textSecondary, marginBottom: '14px', lineHeight: '1.7', textAlign: 'center' }}>
              You can always come back and unpause your account — <span style={{ color: '#00cc88', fontWeight: '600' }}>all your data will still be here</span>.
            </p>
            <p style={{ color: '#ffaa00', marginBottom: '24px', lineHeight: '1.6', textAlign: 'center', fontWeight: 'bold' }}>
              Are you sure you want to pause your subscription?
            </p>
            <div style={{ display: 'flex', gap: '12px', justifyContent: 'center' }}>
              <button
                onClick={() => setShowPauseConfirm(false)}
                style={{
                  padding: '10px 24px',
                  background: '#ffffff',
                  border: '1px solid rgba(255, 255, 255, 0.8)',
                  borderRadius: '8px',
                  color: '#000000',
                  cursor: 'pointer',
                  fontSize: '0.9rem',
                  fontWeight: '600',
                }}
              >
                No
              </button>
              <button
                onClick={handlePauseSubscription}
                disabled={processing}
                style={{
                  padding: '10px 24px',
                  background: processing ? 'rgba(128, 128, 128, 0.3)' : 'rgba(255, 170, 0, 0.3)',
                  border: '1px solid rgba(255, 170, 0, 0.5)',
                  borderRadius: '8px',
                  color: processing ? '#666666' : '#ffaa00',
                  cursor: processing ? 'not-allowed' : 'pointer',
                  fontSize: '0.9rem',
                  fontWeight: 'bold',
                }}
              >
                {processing ? 'Processing...' : 'Yes, Pause Subscription'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Cancel Subscription / Delete Account Confirmation Modal */}
      {showCancelConfirm && (
        <div
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: currentTheme.backgroundOverlayLight,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 10000,
          }}
          onClick={() => setShowCancelConfirm(false)}
        >
          <div
            style={{
              background: currentTheme.backgroundOverlay,
              border: `2px solid ${currentTheme.borderActive}`,
              borderRadius: '16px',
              padding: '30px',
              maxWidth: '500px',
              width: '90%',
              position: 'relative',
              boxShadow: `0 0 30px ${currentTheme.shadow}`,
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <button
              onClick={() => setShowCancelConfirm(false)}
              style={{
                position: 'absolute',
                top: '15px',
                right: '15px',
                background: 'transparent',
                border: 'none',
                color: currentTheme.text,
                cursor: 'pointer',
                padding: '5px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <X size={24} />
            </button>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '20px', justifyContent: 'center' }}>
              <Trash2 size={24} color="#ff6b6b" />
              <h4 style={{ color: currentTheme.text, margin: 0, fontSize: '1.3rem' }}>
                Delete Account
              </h4>
            </div>
            <div
              style={{
                padding: '14px 18px',
                borderRadius: '10px',
                background: 'rgba(255, 59, 48, 0.1)',
                border: '1px solid rgba(255, 59, 48, 0.3)',
                marginBottom: '18px',
              }}
            >
              <p style={{ color: '#ff6b6b', margin: '0 0 8px 0', lineHeight: '1.7', textAlign: 'center', fontWeight: '600', fontSize: '0.95rem' }}>
                ⚠️ If you delete your account, all data from this account will be permanently lost and cannot be recovered.
              </p>
              <p style={{ color: '#ff6b6b', margin: 0, lineHeight: '1.7', textAlign: 'center', fontSize: '0.9rem' }}>
                Your subscription will be canceled for good. This includes all your statistics, saved conversations, usage history, and leaderboard posts.
            </p>
            </div>
            <div
              style={{
                padding: '14px 18px',
                borderRadius: '10px',
                background: 'rgba(255, 170, 0, 0.08)',
                border: '1px solid rgba(255, 170, 0, 0.3)',
                marginBottom: '20px',
              }}
            >
              <p style={{ color: '#ffaa00', margin: 0, lineHeight: '1.7', textAlign: 'center', fontSize: '0.9rem' }}>
                💡 Want to take a break instead? You can <strong>pause your account</strong> — your data will be saved and you can come back anytime.
            </p>
            </div>
            <p style={{ color: '#ff6b6b', marginBottom: '24px', lineHeight: '1.6', textAlign: 'center', fontWeight: 'bold' }}>
              This action cannot be undone. Are you absolutely sure?
            </p>
            <div style={{ display: 'flex', gap: '12px', justifyContent: 'center', flexWrap: 'wrap' }}>
              <button
                onClick={() => setShowCancelConfirm(false)}
                style={{
                  padding: '10px 24px',
                  background: '#ffffff',
                  border: '1px solid rgba(255, 255, 255, 0.8)',
                  borderRadius: '8px',
                  color: '#000000',
                  cursor: 'pointer',
                  fontSize: '0.9rem',
                  fontWeight: '600',
                }}
              >
                No
              </button>
              <button
                onClick={() => {
                  setShowCancelConfirm(false)
                  setShowPauseConfirm(true)
                }}
                style={{
                  padding: '10px 24px',
                  background: 'rgba(255, 170, 0, 0.2)',
                  border: '1px solid rgba(255, 170, 0, 0.5)',
                  borderRadius: '8px',
                  color: '#ffaa00',
                  cursor: 'pointer',
                  fontSize: '0.9rem',
                  fontWeight: '500',
                }}
              >
                Pause Instead
              </button>
              <button
                onClick={handleCancelSubscription}
                disabled={processing}
                style={{
                  padding: '10px 24px',
                  background: processing ? 'rgba(128, 128, 128, 0.3)' : 'rgba(255, 59, 48, 0.3)',
                  border: '1px solid rgba(255, 59, 48, 0.5)',
                  borderRadius: '8px',
                  color: processing ? '#666666' : '#ff6b6b',
                  cursor: processing ? 'not-allowed' : 'pointer',
                  fontSize: '0.9rem',
                  fontWeight: 'bold',
                }}
              >
                {processing ? 'Deleting...' : 'Confirm Delete Account'}
              </button>
            </div>
          </div>
        </div>
      )}

      <style>{`
        @keyframes spin {
          0% { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }
        .spin {
          animation: spin 1s linear infinite;
        }
      `}</style>
    </div>
  )
}

export default SubscriptionManager

