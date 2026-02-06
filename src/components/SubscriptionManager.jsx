import React, { useState, useEffect, useCallback, useRef } from 'react'
import axios from 'axios'
import { useStore } from '../store/useStore'
import { getTheme } from '../utils/theme'
import { CreditCard, CheckCircle, XCircle, AlertCircle, Loader, Pause, Trash2, X } from 'lucide-react'

const SubscriptionManager = () => {
  const currentUser = useStore((state) => state.currentUser)
  const theme = useStore((state) => state.theme || 'dark')
  const currentTheme = getTheme(theme)
  const [subscriptionStatus, setSubscriptionStatus] = useState(null)
  const [subscriptionEndDate, setSubscriptionEndDate] = useState(null)
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
      const response = await axios.get('http://localhost:3001/api/stripe/subscription-status', {
        params: { 
          userId: currentUser.id,
          sync: forceSync ? 'true' : undefined
        },
      })

      const newStatus = response.data.subscriptionStatus
      setSubscriptionStatus(newStatus)
      setSubscriptionEndDate(response.data.subscriptionEndDate)
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
        console.log('[Subscription] Status is inactive, attempting to sync from Stripe...')
        const syncResponse = await axios.get('http://localhost:3001/api/stripe/subscription-status', {
          params: { 
            userId: currentUser.id,
            sync: 'true'
          },
        })
        
        if (syncResponse.data.subscriptionStatus !== newStatus) {
          // Status changed after sync
          setSubscriptionStatus(syncResponse.data.subscriptionStatus)
          setSubscriptionEndDate(syncResponse.data.subscriptionEndDate)
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
          console.log(`[Subscription] Retrying status fetch (attempt ${retryCountRef.current})...`)
          
          try {
            const response = await axios.get('http://localhost:3001/api/stripe/subscription-status', {
              params: { userId: currentUser.id },
            })
            
            const newStatus = response.data.subscriptionStatus
            setSubscriptionStatus(newStatus)
            setSubscriptionEndDate(response.data.subscriptionEndDate)
            
            // If still not active, schedule another retry
            if (newStatus !== 'active' && retryCountRef.current < 5) {
              retryWithBackoff()
            } else if (newStatus === 'active') {
              retryCountRef.current = 0
              setIsRetrying(false)
              console.log('[Subscription] Subscription status updated to active!')
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
    console.log('[Subscription] Subscribe button clicked')
    console.log('[Subscription] Current user:', currentUser)
    
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
      console.log('[Subscription] Creating checkout session for user:', currentUser.id)
      setProcessing(true)
      setError(null)
      const response = await axios.post('http://localhost:3001/api/stripe/create-checkout-session', {
        userId: currentUser.id,
      })
      
      console.log('[Subscription] Checkout session response:', response.data)

      if (response.data.url) {
        console.log('[Subscription] Redirecting to Stripe Checkout:', response.data.url)
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

  const handlePauseSubscription = async () => {
    if (!currentUser?.id) {
      setError('Please sign in to pause subscription')
      return
    }

    try {
      setProcessing(true)
      setError(null)
      setShowPauseConfirm(false)
      
      const response = await axios.post('http://localhost:3001/api/stripe/pause-subscription', {
        userId: currentUser.id,
      })

      if (response.data.success) {
        setSuccessMessage('Subscription paused successfully. You can reactivate it anytime from the signup page.')
        // Refresh subscription status
        await fetchSubscriptionStatus()
        // Log out user since they can't use the app anymore
        setTimeout(() => {
          useStore.getState().setCurrentUser(null)
          window.location.href = '/'
        }, 3000)
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
      
      const response = await axios.post('http://localhost:3001/api/stripe/cancel-subscription-delete-account', {
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
            background: 'rgba(0, 255, 0, 0.2)',
            border: '1px solid rgba(0, 255, 0, 0.5)',
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

        {subscriptionEndDate && (
          <div style={{ color: currentTheme.textSecondary, fontSize: '0.9rem', marginTop: '8px' }}>
            {subscriptionStatus === 'active' ? 'Renews on' : 'Expires on'}:{' '}
            <span style={{ color: currentTheme.accent }}>{formatDate(subscriptionEndDate)}</span>
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
            $25/month
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
                  : 'rgba(255, 107, 107, 0.2)', // Keep red for danger action
                border: '1px solid rgba(255, 107, 107, 0.5)', // Keep red for danger action
                borderRadius: '8px',
                color: processing ? currentTheme.textMuted : '#ff6b6b', // Keep red for danger action
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
        ) : (
          // Show loading state if we're retrying after successful checkout
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
                  Subscribe Now - $25/month
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
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '16px', justifyContent: 'center' }}>
              <Pause size={24} color="#ffaa00" />
              <h4 style={{ color: currentTheme.text, margin: 0, fontSize: '1.3rem' }}>
                Pause Subscription
              </h4>
            </div>
            <p style={{ color: currentTheme.textSecondary, marginBottom: '12px', lineHeight: '1.6', textAlign: 'center' }}>
              Pausing your subscription will stop all recurring payments and prevent you from using the app.
            </p>
            <p style={{ color: currentTheme.textSecondary, marginBottom: '12px', lineHeight: '1.6', textAlign: 'center' }}>
              Your account will be kept in our database. If you decide to come back, you can reactivate your subscription from the signup page without creating a new account.
            </p>
            <p style={{ color: '#ffaa00', marginBottom: '20px', lineHeight: '1.6', textAlign: 'center', fontWeight: 'bold' }}>
              Are you sure you want to pause your subscription?
            </p>
            <div style={{ display: 'flex', gap: '12px', justifyContent: 'center' }}>
              <button
                onClick={() => setShowPauseConfirm(false)}
                style={{
                  padding: '10px 20px',
                  background: 'rgba(128, 128, 128, 0.3)',
                  border: '1px solid rgba(128, 128, 128, 0.5)',
                  borderRadius: '8px',
                  color: currentTheme.text,
                  cursor: 'pointer',
                  fontSize: '0.9rem',
                }}
              >
                Cancel
              </button>
              <button
                onClick={handlePauseSubscription}
                disabled={processing}
                style={{
                  padding: '10px 20px',
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
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '16px', justifyContent: 'center' }}>
              <Trash2 size={24} color="#ff6b6b" />
              <h4 style={{ color: currentTheme.text, margin: 0, fontSize: '1.3rem' }}>
                Cancel Subscription / Delete Account
              </h4>
            </div>
            <p style={{ color: currentTheme.textSecondary, marginBottom: '12px', lineHeight: '1.6', textAlign: 'center' }}>
              This action will permanently delete your account and cancel your subscription. All your data will be removed from our database.
            </p>
            <p style={{ color: currentTheme.textSecondary, marginBottom: '12px', lineHeight: '1.6', textAlign: 'center' }}>
              If you want to use the app again in the future, you will need to sign up as a new user.
            </p>
            <p style={{ color: '#ff6b6b', marginBottom: '20px', lineHeight: '1.6', textAlign: 'center', fontWeight: 'bold' }}>
              This action cannot be undone. Are you absolutely sure?
            </p>
            <div style={{ display: 'flex', gap: '12px', justifyContent: 'center' }}>
              <button
                onClick={() => setShowCancelConfirm(false)}
                style={{
                  padding: '10px 20px',
                  background: 'rgba(128, 128, 128, 0.3)',
                  border: '1px solid rgba(128, 128, 128, 0.5)',
                  borderRadius: '8px',
                  color: currentTheme.text,
                  cursor: 'pointer',
                  fontSize: '0.9rem',
                }}
              >
                Cancel
              </button>
              <button
                onClick={handleCancelSubscription}
                disabled={processing}
                style={{
                  padding: '10px 20px',
                  background: processing ? 'rgba(128, 128, 128, 0.3)' : 'rgba(255, 107, 107, 0.3)',
                  border: '1px solid rgba(255, 107, 107, 0.5)',
                  borderRadius: '8px',
                  color: processing ? '#666666' : '#ff6b6b',
                  cursor: processing ? 'not-allowed' : 'pointer',
                  fontSize: '0.9rem',
                  fontWeight: 'bold',
                }}
              >
                {processing ? 'Processing...' : 'Yes, Delete Everything'}
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

