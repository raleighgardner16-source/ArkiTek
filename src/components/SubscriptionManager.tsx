import React, { useState, useEffect, useCallback, useRef } from 'react'
import api from '../utils/api'
import { useStore } from '../store/useStore'
import { getTheme } from '../utils/theme'
import { spacing, fontSize, fontWeight, radius, zIndex, transition, layout, sx, createStyles } from '../utils/styles'
import { CreditCard, CheckCircle, XCircle, AlertCircle, Loader, Pause, Trash2, X, ArrowUpCircle, Zap, Crown } from 'lucide-react'

const SubscriptionManager = () => {
  const currentUser = useStore((state: any) => state.currentUser)
  const theme = useStore((state: any) => state.theme || 'dark')
  const currentTheme = getTheme(theme)
  const s = createStyles(currentTheme)
  const [subscriptionStatus, setSubscriptionStatus] = useState<string | null>(currentUser?.subscriptionStatus || null)
  const [subscriptionRenewalDate, setSubscriptionRenewalDate] = useState<string | null>(null)
  const [loading, setLoading] = useState(!currentUser?.subscriptionStatus)
  const [processing, setProcessing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [successMessage, setSuccessMessage] = useState<string | null>(null)
  const [isRetrying, setIsRetrying] = useState(false)
  const [showPauseConfirm, setShowPauseConfirm] = useState(false)
  const [showCancelConfirm, setShowCancelConfirm] = useState(false)
  const retryCountRef = useRef(0)
  const retryTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const hasInitialStatus = useRef(!!currentUser?.subscriptionStatus)

  const fetchSubscriptionStatus = useCallback(async (forceSync = false) => {
    if (!currentUser?.id) return

    try {
      if (!hasInitialStatus.current) setLoading(true)
      const response = await api.get('/stripe/subscription-status', {
        params: { 
          sync: forceSync ? 'true' : undefined
        },
      })

      const newStatus = response.data.subscriptionStatus
      setSubscriptionStatus(newStatus)
      setSubscriptionRenewalDate(response.data.subscriptionRenewalDate)
      setError(null)
      hasInitialStatus.current = true
      // Merge plan and stripeSubscriptionId from server so free-plan Delete button works even with stale store
      const cu = useStore.getState().currentUser
      if (cu && (response.data.plan !== undefined || response.data.stripeSubscriptionId !== undefined)) {
        useStore.getState().setCurrentUser({
          ...cu,
          ...(response.data.plan !== undefined && { plan: response.data.plan }),
          ...(response.data.stripeSubscriptionId !== undefined && { stripeSubscriptionId: response.data.stripeSubscriptionId }),
        })
      }
      
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
        const syncResponse = await api.get('/stripe/subscription-status', {
          params: { 
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
    } catch (err: any) {
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
            const response = await api.get('/stripe/subscription-status')
            
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
          } catch (err: any) {
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

  const handleSubscribe = async (plan: string | null = null) => {
    
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
      const body: Record<string, any> = {}
      if (plan === 'premium' || plan === 'pro') body.plan = plan
      const response = await api.post('/stripe/create-checkout-session', body)

      if (response.data.url) {
        // Redirect to Stripe Checkout
        window.location.href = response.data.url
      } else {
        console.error('[Subscription] No URL in response:', response.data)
        setError('Failed to create checkout session')
      }
    } catch (err: any) {
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

      const response = await api.post('/stripe/resume-subscription', {})

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
    } catch (err: any) {
      console.error('[Subscription] Error resubscribing:', err)
      
      if (err.response?.data?.needsCheckout) {
        // No saved payment method — fall back to Stripe Checkout
        console.log('[Subscription] No saved card, falling back to checkout')
        try {
          const checkoutResponse = await api.post('/stripe/create-checkout-session', {
            plan: currentUser.plan === 'premium' ? 'premium' : 'pro',
          })
          if (checkoutResponse.data.url) {
            window.location.href = checkoutResponse.data.url
          } else {
            setError('Failed to create checkout session')
          }
        } catch (checkoutErr: any) {
          setError(checkoutErr.response?.data?.error || 'Failed to start checkout')
        }
      } else {
        setError(err.response?.data?.error || 'Failed to resubscribe. Please try again.')
      }
    } finally {
      setProcessing(false)
    }
  }

  const handleUpgradeToPremium = async () => {
    if (!currentUser?.id) {
      setError('Please sign in to upgrade')
      return
    }

    try {
      setProcessing(true)
      setError(null)

      const response = await api.post('/stripe/upgrade-to-premium', {})

      if (response.data.success) {
        setSuccessMessage(response.data.message || 'Upgraded to Premium!')
        const currentUserData = useStore.getState().currentUser
        if (currentUserData) {
          useStore.getState().setCurrentUser({
            ...currentUserData,
            plan: 'premium',
          })
        }
        await fetchSubscriptionStatus()
        setTimeout(() => setSuccessMessage(null), 5000)
      }
    } catch (err: any) {
      console.error('[Subscription] Error upgrading:', err)
      setError(err.response?.data?.error || 'Failed to upgrade to Premium. Please try again.')
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
      
      const response = await api.post('/stripe/pause-subscription', {})

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
    } catch (err: any) {
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
      
      const response = await api.post('/stripe/cancel-subscription-delete-account', {})

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
    } catch (err: any) {
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
        return <XCircle size={24} color={currentTheme.error} />
      case 'paused':
        return <Pause size={24} color={currentTheme.warning} />
      case 'past_due':
        return <AlertCircle size={24} color={currentTheme.warning} />
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
        return currentTheme.error
      case 'past_due':
        return currentTheme.warning
      default:
        return '#aaaaaa'
    }
  }

  const formatDate = (dateString: string) => {
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
        style={sx(layout.center, {
          background: currentTheme.backgroundOverlay,
          border: `1px solid ${currentTheme.borderLight}`,
          borderRadius: radius['2xl'],
          padding: spacing['4xl'],
          marginBottom: spacing['5xl'],
          width: '100%',
          maxWidth: '600px',
          gap: spacing.lg,
        })}
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
        borderRadius: radius['2xl'],
        padding: spacing['4xl'],
        marginBottom: spacing['5xl'],
        width: '100%',
        maxWidth: '600px',
      }}
    >
      <h3
        style={sx(layout.center, {
          fontSize: fontSize['6xl'],
          marginBottom: spacing['2xl'],
          color: currentTheme.accent,
          textAlign: 'center',
          gap: spacing.lg,
        })}
      >
        <CreditCard size={24} />
        Subscription
      </h3>

      {error && (
        <div
          style={{
            padding: spacing.lg,
            background: 'rgba(255, 0, 0, 0.2)',
            border: '1px solid rgba(255, 0, 0, 0.5)',
            borderRadius: radius.md,
            marginBottom: spacing.xl,
            color: currentTheme.error,
            textAlign: 'center',
          }}
        >
          {error}
        </div>
      )}

      {successMessage && (
        <div
          style={{
            padding: spacing.lg,
            background: 'rgba(72, 201, 176, 0.2)',
            border: '1px solid rgba(72, 201, 176, 0.5)',
            borderRadius: radius.md,
            marginBottom: spacing.xl,
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
          borderRadius: radius.xl,
          padding: spacing['2xl'],
          marginBottom: spacing['2xl'],
        }}
      >
        <div
          style={sx(layout.spaceBetween, {
            marginBottom: spacing.lg,
          })}
        >
          <div style={sx(layout.flexRow, { gap: spacing.lg })}>
            {getStatusIcon()}
            <span style={{ color: currentTheme.text, fontSize: fontSize['3xl'], fontWeight: fontWeight.bold }}>
              Status: <span style={{ color: getStatusColor() }}>{getStatusText()}</span>
            </span>
          </div>
        </div>

        {subscriptionRenewalDate && (
          <div style={{ color: currentTheme.textSecondary, fontSize: fontSize.lg, marginTop: spacing.md }}>
            {subscriptionStatus === 'active' ? 'Renews on' : 'Expires on'}:{' '}
            <span style={{ color: currentTheme.accent }}>{formatDate(subscriptionRenewalDate)}</span>
          </div>
        )}

        <div
          style={{
            marginTop: spacing.xl,
            padding: spacing.lg,
            background: currentTheme.backgroundTertiary,
            border: `1px solid ${currentTheme.borderLight}`,
            borderRadius: radius.md,
            textAlign: 'center',
          }}
        >
          <div style={{ color: currentTheme.accent, fontSize: fontSize['4xl'], fontWeight: fontWeight.bold, marginBottom: spacing.xs }}>
            {currentUser?.plan === 'premium' ? '$49.95/month' : currentUser?.plan === 'free_trial' ? 'Free Plan' : '$19.95/month'}
          </div>
          <div style={{ color: currentTheme.textSecondary, fontSize: fontSize.lg }}>
            {currentUser?.plan === 'premium' ? '50x usage — Premium' : currentUser?.plan === 'free_trial' ? 'Standard usage' : '15x usage — Pro'}
          </div>
        </div>
      </div>

      {/* Upgrade Plans Section */}
      <div
        style={{
          marginBottom: spacing['2xl'],
          padding: spacing['2xl'],
          background: currentTheme.backgroundSecondary,
          border: `1px solid ${currentTheme.borderLight}`,
          borderRadius: radius.xl,
        }}
      >
        <h4 style={sx(layout.flexRow, { color: currentTheme.text, marginBottom: spacing.xl, fontSize: fontSize['3xl'], gap: spacing.md })}>
          <ArrowUpCircle size={20} color={currentTheme.accent} />
          Upgrade your plan
        </h4>

        {currentUser?.plan === 'premium' && (subscriptionStatus === 'active' || subscriptionStatus === 'trialing') ? (
          <div style={sx(layout.flexRow, {
            gap: spacing.lg,
            padding: spacing.xl,
            background: 'rgba(72, 201, 176, 0.08)',
            border: '1px solid rgba(72, 201, 176, 0.3)',
            borderRadius: radius.lg,
          })}>
            <Crown size={32} color="#48c9b0" />
            <div>
              <div style={{ color: currentTheme.text, fontWeight: fontWeight.semibold, marginBottom: spacing.xs }}>You're on our best plan</div>
              <div style={{ color: currentTheme.textSecondary, fontSize: fontSize.lg }}>Premium includes 50x usage and all features.</div>
            </div>
          </div>
        ) : (subscriptionStatus === 'active' || subscriptionStatus === 'trialing') && currentUser?.plan === 'pro' ? (
          <div style={sx(layout.flexCol, {
            gap: spacing.lg,
          })}>
            <div style={sx(layout.spaceBetween, {
              padding: spacing.xl,
              background: 'rgba(168, 85, 247, 0.08)',
              border: '1px solid rgba(168, 85, 247, 0.3)',
              borderRadius: radius.lg,
              flexWrap: 'wrap',
              gap: spacing.lg,
            })}>
              <div>
                <div style={sx(layout.flexRow, { color: currentTheme.text, fontWeight: fontWeight.semibold, marginBottom: spacing.xs, gap: spacing.md })}>
                  <Crown size={20} color="#a855f7" /> Premium — $49.95/month
                </div>
                <div style={{ color: currentTheme.textSecondary, fontSize: fontSize.lg }}>50x usage • All features • Priority support</div>
              </div>
              <button
                onClick={handleUpgradeToPremium}
                disabled={processing}
                style={sx(layout.flexRow, {
                  padding: `10px ${spacing['2xl']}`,
                  background: processing ? currentTheme.buttonBackground : 'rgba(168, 85, 247, 0.25)',
                  border: '1px solid rgba(168, 85, 247, 0.5)',
                  borderRadius: radius.md,
                  color: processing ? currentTheme.textMuted : '#a855f7',
                  fontWeight: fontWeight.semibold,
                  cursor: processing ? 'not-allowed' : 'pointer',
                  gap: spacing.md,
                })}
              >
                {processing ? <Loader size={18} className="spin" /> : <ArrowUpCircle size={18} />}
                Upgrade to Premium
              </button>
            </div>
          </div>
        ) : (subscriptionStatus !== 'active' && subscriptionStatus !== 'trialing') || currentUser?.plan === 'free_trial' ? (
          <div style={sx(layout.flexCol, { gap: spacing.lg })}>
            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
              gap: spacing.lg,
            }}>
              <div style={sx(layout.flexCol, {
                padding: spacing.xl,
                background: 'rgba(93, 173, 226, 0.08)',
                border: '1px solid rgba(93, 173, 226, 0.3)',
                borderRadius: radius.lg,
                gap: spacing.md,
              })}>
                <div style={sx(layout.flexRow, { gap: spacing.md })}>
                  <Zap size={20} color="#5dade2" />
                  <span style={{ color: currentTheme.text, fontWeight: fontWeight.semibold }}>Pro</span>
                </div>
                <div style={{ color: currentTheme.accent, fontWeight: fontWeight.bold }}>$19.95/month</div>
                <div style={{ color: currentTheme.textSecondary, fontSize: fontSize.base }}>15x usage • All features</div>
                <button
                  onClick={() => handleSubscribe('pro')}
                  disabled={processing}
                  style={{
                    marginTop: spacing.md,
                    padding: `10px ${spacing.xl}`,
                    background: processing ? currentTheme.buttonBackground : 'rgba(93, 173, 226, 0.25)',
                    border: '1px solid rgba(93, 173, 226, 0.5)',
                    borderRadius: radius.md,
                    color: processing ? currentTheme.textMuted : '#5dade2',
                    fontWeight: fontWeight.semibold,
                    cursor: processing ? 'not-allowed' : 'pointer',
                  }}
                >
                  {processing ? 'Processing...' : 'Subscribe to Pro'}
                </button>
              </div>
              <div style={sx(layout.flexCol, {
                padding: spacing.xl,
                background: 'rgba(168, 85, 247, 0.08)',
                border: '1px solid rgba(168, 85, 247, 0.3)',
                borderRadius: radius.lg,
                gap: spacing.md,
              })}>
                <div style={sx(layout.flexRow, { gap: spacing.md })}>
                  <Crown size={20} color="#a855f7" />
                  <span style={{ color: currentTheme.text, fontWeight: fontWeight.semibold }}>Premium</span>
                </div>
                <div style={{ color: currentTheme.accent, fontWeight: fontWeight.bold }}>$49.95/month</div>
                <div style={{ color: currentTheme.textSecondary, fontSize: fontSize.base }}>50x usage • All features</div>
                <button
                  onClick={() => handleSubscribe('premium')}
                  disabled={processing}
                  style={{
                    marginTop: spacing.md,
                    padding: `10px ${spacing.xl}`,
                    background: processing ? currentTheme.buttonBackground : 'rgba(168, 85, 247, 0.25)',
                    border: '1px solid rgba(168, 85, 247, 0.5)',
                    borderRadius: radius.md,
                    color: processing ? currentTheme.textMuted : '#a855f7',
                    fontWeight: fontWeight.semibold,
                    cursor: processing ? 'not-allowed' : 'pointer',
                  }}
                >
                  {processing ? 'Processing...' : 'Subscribe to Premium'}
                </button>
              </div>
            </div>
          </div>
        ) : null}
      </div>

      {/* Action Buttons */}
      <div style={sx(layout.flexCol, { gap: spacing.lg })}>
        {subscriptionStatus === 'active' ? (
          <>
            {/* Pause Subscription Button */}
            <button
              onClick={() => setShowPauseConfirm(true)}
              disabled={processing}
              style={sx(layout.center, {
                padding: `14px ${spacing['3xl']}`,
                background: processing
                  ? currentTheme.buttonBackground
                  : currentTheme.buttonBackgroundHover,
                border: `1px solid ${currentTheme.borderActive}`,
                borderRadius: radius.md,
                color: processing ? currentTheme.textMuted : currentTheme.accent,
                fontSize: fontSize['2xl'],
                fontWeight: fontWeight.bold,
                cursor: processing ? 'not-allowed' : 'pointer',
                transition: transition.slow,
                gap: spacing.md,
              })}
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
              style={sx(layout.center, {
                padding: `14px ${spacing['3xl']}`,
                background: processing
                  ? currentTheme.buttonBackground
                  : 'rgba(255, 107, 107, 0.2)',
                border: '1px solid rgba(255, 107, 107, 0.5)',
                borderRadius: radius.md,
                color: processing ? currentTheme.textMuted : currentTheme.error,
                fontSize: fontSize['2xl'],
                fontWeight: fontWeight.bold,
                cursor: processing ? 'not-allowed' : 'pointer',
                transition: transition.slow,
                gap: spacing.md,
              })}
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
                style={sx(layout.center, {
                  padding: `14px ${spacing['3xl']}`,
                  background: 'rgba(128, 128, 128, 0.3)',
                  border: 'none',
                  borderRadius: radius.md,
                  color: '#666666',
                  fontSize: fontSize['2xl'],
                  fontWeight: fontWeight.bold,
                  cursor: 'not-allowed',
                  gap: spacing.md,
                })}
              >
                <Loader size={18} className="spin" />
                Activating subscription...
              </button>
            ) : (
              <button
                onClick={handleResubscribe}
                disabled={processing}
                style={sx(layout.center, {
                  padding: `14px ${spacing['3xl']}`,
                  background: processing
                    ? currentTheme.buttonBackground
                    : currentTheme.accentGradient,
                  border: 'none',
                  borderRadius: radius.md,
                  color: processing ? currentTheme.textMuted : (theme === 'dark' ? '#000000' : '#ffffff'),
                  fontSize: fontSize['2xl'],
                  fontWeight: fontWeight.bold,
                  cursor: processing ? 'not-allowed' : 'pointer',
                  transition: transition.slow,
                  gap: spacing.md,
                })}
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
              style={sx(layout.center, {
                padding: `14px ${spacing['3xl']}`,
                background: processing
                  ? currentTheme.buttonBackground
                  : 'rgba(255, 107, 107, 0.2)',
                border: '1px solid rgba(255, 107, 107, 0.5)',
                borderRadius: radius.md,
                color: processing ? currentTheme.textMuted : currentTheme.error,
                fontSize: fontSize['2xl'],
                fontWeight: fontWeight.bold,
                cursor: processing ? 'not-allowed' : 'pointer',
                transition: transition.slow,
                gap: spacing.md,
              })}
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
              style={sx(layout.center, {
                padding: `14px ${spacing['3xl']}`,
                background: 'rgba(128, 128, 128, 0.3)',
                border: 'none',
                borderRadius: radius.md,
                color: '#666666',
                fontSize: fontSize['2xl'],
                fontWeight: fontWeight.bold,
                cursor: 'not-allowed',
                gap: spacing.md,
              })}
            >
              <Loader size={18} className="spin" />
              Activating subscription...
            </button>
          ) : (
            <>
              <button
                onClick={() => handleSubscribe()}
                disabled={processing}
                style={sx(layout.center, {
                  padding: `14px ${spacing['3xl']}`,
                  background: processing
                    ? currentTheme.buttonBackground
                    : currentTheme.accentGradient,
                  border: 'none',
                  borderRadius: radius.md,
                  color: processing ? currentTheme.textMuted : (theme === 'dark' ? '#000000' : '#ffffff'),
                  fontSize: fontSize['2xl'],
                  fontWeight: fontWeight.bold,
                  cursor: processing ? 'not-allowed' : 'pointer',
                  transition: transition.slow,
                  gap: spacing.md,
                })}
              >
                {processing ? (
                  <>
                    <Loader size={18} className="spin" />
                    Processing...
                  </>
                ) : (
                  <>
                    <CreditCard size={18} />
                    Subscribe Now
                  </>
                )}
              </button>
              {((currentUser?.plan === 'free_trial' || subscriptionStatus === 'trialing') && !currentUser?.stripeSubscriptionId) && (
                <button
                  onClick={() => setShowCancelConfirm(true)}
                  disabled={processing}
                  style={sx(layout.center, {
                    padding: `14px ${spacing['3xl']}`,
                    background: processing ? currentTheme.buttonBackground : 'rgba(255, 107, 107, 0.2)',
                    border: '1px solid rgba(255, 107, 107, 0.5)',
                    borderRadius: radius.md,
                    color: processing ? currentTheme.textMuted : currentTheme.error,
                    fontSize: fontSize['2xl'],
                    fontWeight: fontWeight.bold,
                    cursor: processing ? 'not-allowed' : 'pointer',
                    gap: spacing.md,
                  })}
                >
                  {processing ? (
                    <>
                      <Loader size={18} className="spin" />
                      Deleting...
                    </>
                  ) : (
                    <>
                      <Trash2 size={18} />
                      Delete Account
                    </>
                  )}
                </button>
              )}
            </>
          )
        )}
        
        {/* Sync Status Button - Show when status is inactive but user might have subscribed */}
        {subscriptionStatus === 'inactive' && (
            <button
            onClick={() => fetchSubscriptionStatus(true)}
            disabled={loading || processing}
            style={sx(layout.center, {
              padding: `10px ${spacing['2xl']}`,
              background: loading || processing
                ? currentTheme.buttonBackground
                : currentTheme.buttonBackgroundActive,
              border: `1px solid ${currentTheme.borderActive}`,
              borderRadius: radius.md,
              color: loading || processing ? currentTheme.textMuted : currentTheme.accent,
              fontSize: fontSize.lg,
              fontWeight: fontWeight.normal,
              cursor: loading || processing ? 'not-allowed' : 'pointer',
              transition: transition.slow,
              gap: spacing.md,
            })}
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
          style={sx(layout.fixedFill, layout.center, {
            background: currentTheme.backgroundOverlayLight,
            zIndex: zIndex.modal,
          })}
          onClick={() => setShowPauseConfirm(false)}
        >
          <div
            style={{
              background: currentTheme.backgroundOverlay,
              border: `2px solid ${currentTheme.borderActive}`,
              borderRadius: radius['2xl'],
              padding: spacing['4xl'],
              maxWidth: '500px',
              width: '90%',
              position: 'relative',
              boxShadow: `0 0 30px ${currentTheme.shadow}`,
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <button
              onClick={() => setShowPauseConfirm(false)}
              style={sx(layout.center, {
                position: 'absolute',
                top: '15px',
                right: '15px',
                background: 'transparent',
                border: 'none',
                color: currentTheme.text,
                cursor: 'pointer',
                padding: '5px',
              })}
            >
              <X size={24} />
            </button>
            <div style={sx(layout.center, { gap: spacing.lg, marginBottom: spacing['2xl'] })}>
              <Pause size={24} color={currentTheme.warning} />
              <h4 style={{ color: currentTheme.text, margin: 0, fontSize: fontSize['5xl'] }}>
                Pause Subscription
              </h4>
            </div>
            <p style={{ color: currentTheme.textSecondary, marginBottom: '14px', lineHeight: '1.7', textAlign: 'center' }}>
              If you pause your account, you will <span style={{ color: currentTheme.warning, fontWeight: fontWeight.semibold }}>not be charged</span> for the next billing cycle.
            </p>
            {subscriptionRenewalDate && (
              <p style={{ color: currentTheme.textSecondary, marginBottom: '14px', lineHeight: '1.7', textAlign: 'center' }}>
                You'll still have <span style={{ color: currentTheme.accent, fontWeight: fontWeight.semibold }}>full access</span> until{' '}
                <span style={{ color: currentTheme.accent, fontWeight: fontWeight.semibold }}>
                  {new Date(subscriptionRenewalDate).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}
                </span>.
              </p>
            )}
            <p style={{ color: currentTheme.textSecondary, marginBottom: '14px', lineHeight: '1.7', textAlign: 'center' }}>
              You can always come back and unpause your account — <span style={{ color: '#00cc88', fontWeight: fontWeight.semibold }}>all your data will still be here</span>.
            </p>
            <p style={{ color: currentTheme.warning, marginBottom: spacing['3xl'], lineHeight: '1.6', textAlign: 'center', fontWeight: fontWeight.bold }}>
              Are you sure you want to pause your subscription?
            </p>
            <div style={sx(layout.center, { gap: spacing.lg })}>
              <button
                onClick={() => setShowPauseConfirm(false)}
                style={{
                  padding: `10px ${spacing['3xl']}`,
                  background: '#ffffff',
                  border: '1px solid rgba(255, 255, 255, 0.8)',
                  borderRadius: radius.md,
                  color: '#000000',
                  cursor: 'pointer',
                  fontSize: fontSize.lg,
                  fontWeight: fontWeight.semibold,
                }}
              >
                No
              </button>
              <button
                onClick={handlePauseSubscription}
                disabled={processing}
                style={{
                  padding: `10px ${spacing['3xl']}`,
                  background: processing ? 'rgba(128, 128, 128, 0.3)' : 'rgba(255, 170, 0, 0.3)',
                  border: '1px solid rgba(255, 170, 0, 0.5)',
                  borderRadius: radius.md,
                  color: processing ? '#666666' : currentTheme.warning,
                  cursor: processing ? 'not-allowed' : 'pointer',
                  fontSize: fontSize.lg,
                  fontWeight: fontWeight.bold,
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
          style={sx(layout.fixedFill, layout.center, {
            background: currentTheme.backgroundOverlayLight,
            zIndex: zIndex.modal,
          })}
          onClick={() => setShowCancelConfirm(false)}
        >
          <div
            style={{
              background: currentTheme.backgroundOverlay,
              border: `2px solid ${currentTheme.borderActive}`,
              borderRadius: radius['2xl'],
              padding: spacing['4xl'],
              maxWidth: '500px',
              width: '90%',
              position: 'relative',
              boxShadow: `0 0 30px ${currentTheme.shadow}`,
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <button
              onClick={() => setShowCancelConfirm(false)}
              style={sx(layout.center, {
                position: 'absolute',
                top: '15px',
                right: '15px',
                background: 'transparent',
                border: 'none',
                color: currentTheme.text,
                cursor: 'pointer',
                padding: '5px',
              })}
            >
              <X size={24} />
            </button>
            <div style={sx(layout.center, { gap: spacing.lg, marginBottom: spacing['2xl'] })}>
              <Trash2 size={24} color={currentTheme.error} />
              <h4 style={{ color: currentTheme.text, margin: 0, fontSize: fontSize['5xl'] }}>
                Delete Account
              </h4>
            </div>
            <div
              style={{
                padding: '14px 18px',
                borderRadius: radius.lg,
                background: 'rgba(255, 59, 48, 0.1)',
                border: '1px solid rgba(255, 59, 48, 0.3)',
                marginBottom: '18px',
              }}
            >
              <p style={{ color: currentTheme.error, margin: `0 0 ${spacing.md} 0`, lineHeight: '1.7', textAlign: 'center', fontWeight: fontWeight.semibold, fontSize: fontSize.xl }}>
                ⚠️ If you delete your account, all data from this account will be permanently lost and cannot be recovered.
              </p>
              <p style={{ color: currentTheme.error, margin: 0, lineHeight: '1.7', textAlign: 'center', fontSize: fontSize.lg }}>
                Your subscription will be canceled for good. This includes all your statistics, saved conversations, and usage history.
            </p>
            </div>
            {subscriptionStatus === 'active' && (
              <div
                style={{
                  padding: '14px 18px',
                  borderRadius: radius.lg,
                  background: 'rgba(255, 170, 0, 0.08)',
                  border: '1px solid rgba(255, 170, 0, 0.3)',
                  marginBottom: spacing['2xl'],
                }}
              >
                <p style={{ color: currentTheme.warning, margin: 0, lineHeight: '1.7', textAlign: 'center', fontSize: fontSize.lg }}>
                  💡 Want to take a break instead? You can <strong>pause your account</strong> — your data will be saved and you can come back anytime.
                </p>
              </div>
            )}
            <p style={{ color: currentTheme.error, marginBottom: spacing['3xl'], lineHeight: '1.6', textAlign: 'center', fontWeight: fontWeight.bold }}>
              This action cannot be undone. Are you absolutely sure?
            </p>
            <div style={sx(layout.center, { gap: spacing.lg, flexWrap: 'wrap' })}>
              <button
                onClick={() => setShowCancelConfirm(false)}
                style={{
                  padding: `10px ${spacing['3xl']}`,
                  background: '#ffffff',
                  border: '1px solid rgba(255, 255, 255, 0.8)',
                  borderRadius: radius.md,
                  color: '#000000',
                  cursor: 'pointer',
                  fontSize: fontSize.lg,
                  fontWeight: fontWeight.semibold,
                }}
              >
                No
              </button>
              {subscriptionStatus === 'active' && (
                <button
                  onClick={() => {
                    setShowCancelConfirm(false)
                    setShowPauseConfirm(true)
                  }}
                  style={{
                    padding: `10px ${spacing['3xl']}`,
                    background: 'rgba(255, 170, 0, 0.2)',
                    border: '1px solid rgba(255, 170, 0, 0.5)',
                    borderRadius: radius.md,
                    color: currentTheme.warning,
                    cursor: 'pointer',
                    fontSize: fontSize.lg,
                    fontWeight: fontWeight.medium,
                  }}
                >
                  Pause Instead
                </button>
              )}
              <button
                onClick={handleCancelSubscription}
                disabled={processing}
                style={{
                  padding: `10px ${spacing['3xl']}`,
                  background: processing ? 'rgba(128, 128, 128, 0.3)' : 'rgba(255, 59, 48, 0.3)',
                  border: '1px solid rgba(255, 59, 48, 0.5)',
                  borderRadius: radius.md,
                  color: processing ? '#666666' : currentTheme.error,
                  cursor: processing ? 'not-allowed' : 'pointer',
                  fontSize: fontSize.lg,
                  fontWeight: fontWeight.bold,
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
