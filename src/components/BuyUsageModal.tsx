import React, { useState, useEffect, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { X, DollarSign, AlertCircle, Check, Loader, CreditCard, Shield, Trash2 } from 'lucide-react'
import { useStore } from '../store/useStore'
import { getTheme } from '../utils/theme'
import api from '../utils/api'
import { loadStripe } from '@stripe/stripe-js'
import { Elements, PaymentElement, useStripe, useElements } from '@stripe/react-stripe-js'
import { spacing, fontSize, fontWeight, radius, zIndex, transition, layout, sx, createStyles } from '../utils/styles'

// Stripe promise — loaded once
let stripePromise: any = null

const getStripePromise = async () => {
  if (!stripePromise) {
    const response = await api.get('/stripe/config')
    stripePromise = loadStripe(response.data.publishableKey)
  }
  return stripePromise
}

// Card brand display helpers
const brandNames = {
  visa: 'Visa',
  mastercard: 'Mastercard',
  amex: 'Amex',
  discover: 'Discover',
  diners: 'Diners',
  jcb: 'JCB',
  unionpay: 'UnionPay',
}

const getBrandName = (brand: string) => (brandNames as Record<string, string>)[brand] || brand?.charAt(0).toUpperCase() + brand?.slice(1) || 'Card'

// Inner payment form using Stripe hooks
interface InlinePaymentFormProps {
  onSuccess?: () => void
  onError?: (msg: string) => void
  total: number
  processing: boolean
  setProcessing: (v: boolean) => void
  saveCard: boolean
  amount?: number
  fee?: number
}

const InlinePaymentForm = ({ onSuccess, onError, total, processing, setProcessing, saveCard }: InlinePaymentFormProps) => {
  const stripe = useStripe()
  const elements = useElements()
  const [ready, setReady] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const theme = useStore((state) => state.theme || 'dark')
  const currentTheme = getTheme(theme)
  const s = createStyles(currentTheme)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!stripe || !elements || processing) return

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
        setError(stripeError.message || null)
        onError?.(stripeError.message || 'Payment failed')
      } else if (paymentIntent && paymentIntent.status === 'succeeded') {
        onSuccess?.()
      } else {
        setError('Payment was not completed. Please try again.')
        onError?.('Payment was not completed.')
      }
    } catch (err: any) {
      const msg = err.message || 'Payment failed. Please try again.'
      setError(msg)
      onError?.(msg)
    } finally {
      setProcessing(false)
    }
  }

  return (
    <form onSubmit={handleSubmit}>
      <div style={{
        marginBottom: spacing.xl,
        padding: '14px',
        background: currentTheme.backgroundSecondary,
        borderRadius: radius.lg,
        border: `1px solid ${currentTheme.borderLight}`,
      }}>
        <PaymentElement
          onReady={() => setReady(true)}
          options={{
            layout: 'accordion',
            wallets: { applePay: 'never', googlePay: 'never' },
            paymentMethodOrder: ['card'],
          }}
        />
      </div>

      {error && (
        <div style={sx(layout.flexRow, {
          padding: '10px 14px',
          marginBottom: spacing.lg,
          background: currentTheme.errorMuted,
          border: '1px solid rgba(255, 107, 107, 0.3)',
          borderRadius: radius.md,
          color: currentTheme.error,
          fontSize: fontSize.base,
          gap: spacing.md,
        })}>
          <AlertCircle size={16} />
          {error}
        </div>
      )}

      <button
        type="submit"
        disabled={!stripe || !elements || !ready || processing}
        style={sx(layout.center, {
          width: '100%',
          padding: '14px',
          borderRadius: radius.lg,
          border: 'none',
          background: (!stripe || !elements || !ready || processing)
            ? currentTheme.backgroundTertiary
            : currentTheme.accentGradient,
          color: (!stripe || !elements || !ready || processing)
            ? currentTheme.textMuted
            : '#ffffff',
          fontSize: fontSize['2xl'],
          fontWeight: fontWeight.semibold,
          cursor: (!stripe || !elements || !ready || processing) ? 'not-allowed' : 'pointer',
          gap: spacing.md,
        })}
      >
        {processing ? (
          <>
            <Loader size={18} style={{ animation: 'spin 1s linear infinite' }} />
            Processing...
          </>
        ) : !ready ? (
          <>
            <Loader size={18} style={{ animation: 'spin 1s linear infinite' }} />
            Loading...
          </>
        ) : (
          <>
            <CreditCard size={18} />
            Pay ${total.toFixed(2)}{saveCard ? ' & Save Card' : ''}
          </>
        )}
      </button>

      <div style={sx(layout.center, {
        gap: spacing.sm,
        marginTop: '10px',
        color: currentTheme.textMuted,
        fontSize: '0.72rem',
      })}>
        <Shield size={11} />
        Secured by Stripe
      </div>
    </form>
  )
}

// Main modal
interface BuyUsageModalProps {
  isOpen: boolean
  onClose: () => void
  onSuccess?: (data: any) => void
}

const BuyUsageModal = ({ isOpen, onClose, onSuccess }: BuyUsageModalProps) => {
  const currentUser = useStore((state) => state.currentUser)
  const theme = useStore((state) => state.theme || 'dark')
  const currentTheme = getTheme(theme)
  const s = createStyles(currentTheme)
  
  const [selectedAmount, setSelectedAmount] = useState<number | null>(null)
  const [customAmount, setCustomAmount] = useState('')
  const [isCustom, setIsCustom] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)
  const [processing, setProcessing] = useState(false)

  // Stripe inline payment state
  const [clientSecret, setClientSecret] = useState<string | null>(null)
  const [paymentIntentId, setPaymentIntentId] = useState<string | null>(null)
  const [loadingIntent, setLoadingIntent] = useState(false)
  const [resolvedStripe, setResolvedStripe] = useState<any>(null)
  const [stripeLoaded, setStripeLoaded] = useState(false)

  // Saved cards
  const [savedCards, setSavedCards] = useState<any[]>([])
  const [loadingCards, setLoadingCards] = useState(false)
  const [selectedCard, setSelectedCard] = useState<string | null>(null)
  const [saveCard, setSaveCard] = useState(false)
  const [deletingCard, setDeletingCard] = useState<string | null>(null)

  const presetAmounts = [5, 10, 15, 20, 25, 50, 100]
  const TRANSACTION_FEE_PERCENT = 3.5
  const TRANSACTION_FEE_FLAT = 0.30

  const getAmount = () => {
    if (isCustom && customAmount) {
      const val = parseFloat(customAmount)
      return isNaN(val) ? 0 : val
    }
    return selectedAmount || 0
  }

  const amount = getAmount()
  const percentageFee = Math.round(amount * (TRANSACTION_FEE_PERCENT / 100) * 100) / 100
  const fee = amount > 0 ? Math.round((percentageFee + TRANSACTION_FEE_FLAT) * 100) / 100 : 0
  const total = amount + fee

  // Fetch saved cards on open
  useEffect(() => {
    if (isOpen && currentUser?.id) {
      setLoadingCards(true)
      api.get('/stripe/saved-cards')
        .then(res => {
          setSavedCards(res.data.cards || [])
          // Default to first saved card if available
          if (res.data.cards?.length > 0) {
            setSelectedCard(res.data.cards[0].id)
          }
        })
        .catch(() => setSavedCards([]))
        .finally(() => setLoadingCards(false))
    }
  }, [isOpen, currentUser?.id])

  // Load Stripe on mount
  useEffect(() => {
    if (isOpen && !stripeLoaded) {
      getStripePromise().then((s) => {
        setResolvedStripe(s)
        setStripeLoaded(true)
      })
    }
  }, [isOpen, stripeLoaded])

  // Create PaymentIntent when amount changes, user chose "new card", and amount is valid
  useEffect(() => {
    if (!isOpen || !currentUser?.id || amount < 1 || amount > 500 || selectedCard !== null) {
      setClientSecret(null)
      setPaymentIntentId(null)
      return
    }

    const timer = setTimeout(async () => {
      setLoadingIntent(true)
    setError(null)
    try {
        const response = await api.post('/stripe/create-usage-intent', {
          amount,
          saveCard,
        })
        setClientSecret(response.data.clientSecret)
        setPaymentIntentId(response.data.paymentIntentId)
    } catch (err: any) {
        console.error('Error creating usage intent:', err)
        setError(err.response?.data?.error || 'Failed to initialize payment.')
      } finally {
        setLoadingIntent(false)
      }
    }, isCustom ? 600 : 100)

    return () => clearTimeout(timer)
  }, [isOpen, currentUser?.id, amount, isCustom, selectedCard, saveCard])

  const handleAmountSelect = (amt: number) => {
    setSelectedAmount(amt)
    setIsCustom(false)
    setCustomAmount('')
    setError(null)
    setSuccess(false)
  }

  const handleCustomClick = () => {
    setIsCustom(true)
    setSelectedAmount(null)
    setError(null)
    setSuccess(false)
  }

  const handleCustomChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value.replace(/[^0-9.]/g, '')
    const parts = value.split('.')
    if (parts.length > 2) return
    if (parts[1] && parts[1].length > 2) return
    setCustomAmount(value)
    setSuccess(false)
  }

  // Pay with saved card
  const handleChargeSavedCard = async () => {
    if (!selectedCard || amount < 1 || processing) return

    setProcessing(true)
    setError(null)

    try {
      const response = await api.post('/stripe/charge-saved-card', {
        paymentMethodId: selectedCard,
        amount,
      })

      setSuccess(true)
      setTimeout(() => {
        if (onSuccess) onSuccess(response.data)
      }, 800)
    } catch (err: any) {
      console.error('Error charging saved card:', err)
      setError(err.response?.data?.error || 'Failed to charge card. Please try again.')
    } finally {
      setProcessing(false)
    }
  }

  // Pay with new card (via Stripe Elements)
  const handlePaymentSuccess = useCallback(async () => {
    try {
      const response = await api.post('/stripe/confirm-usage-purchase', {
        paymentIntentId,
        amount,
      })

      setSuccess(true)
      setError(null)
      
      // Refresh saved cards if they saved the card
      if (saveCard) {
        try {
          const cardsRes = await api.get('/stripe/saved-cards')
          setSavedCards(cardsRes.data.cards || [])
        } catch {}
      }

      // Brief delay to show success checkmark, then notify parent
      setTimeout(() => {
        if (onSuccess) onSuccess(response.data)
      }, 800)
    } catch (err: any) {
      console.error('Error confirming purchase:', err)
      setSuccess(true)
      setTimeout(() => {
        if (onSuccess) onSuccess({ creditsAdded: amount })
      }, 800)
    }
  }, [currentUser?.id, paymentIntentId, amount, onSuccess, saveCard])

  const handlePaymentError = useCallback((msg: string) => {
    setError(msg)
  }, [])

  const handleDeleteCard = async (cardId: string) => {
    setDeletingCard(cardId)
    try {
      await api.delete(`/stripe/saved-cards/${cardId}`)
      setSavedCards(prev => prev.filter(c => c.id !== cardId))
      if (selectedCard === cardId) {
        const remaining = savedCards.filter(c => c.id !== cardId)
        setSelectedCard(remaining.length > 0 ? remaining[0].id : null)
      }
    } catch (err: any) {
      setError('Failed to remove card')
    } finally {
      setDeletingCard(null)
    }
  }

  const handleClose = () => {
    if (processing) return
    setSelectedAmount(null)
    setCustomAmount('')
    setIsCustom(false)
    setError(null)
    setSuccess(false)
    setClientSecret(null)
    setPaymentIntentId(null)
    setSelectedCard(savedCards.length > 0 ? savedCards[0].id : null)
    setSaveCard(false)
    onClose()
  }

  if (!isOpen) return null

  return (
    <>
      <style>{`
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
      `}</style>
      <AnimatePresence>
        <motion.div
          key="buy-usage-modal-backdrop"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          style={sx(s.overlay, {
            background: 'rgba(0, 0, 0, 0.7)',
          })}
          onClick={handleClose}
        >
        <motion.div
          initial={{ opacity: 0, scale: 0.9, y: 20 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.9, y: 20 }}
          transition={{ type: 'spring', damping: 25, stiffness: 300 }}
          style={{
            background: currentTheme.background,
            border: `1px solid ${currentTheme.border}`,
            borderRadius: radius['2xl'],
            padding: spacing['3xl'],
            width: '90%',
            maxWidth: '450px',
            maxHeight: '90vh',
            overflow: 'auto',
            boxShadow: `0 20px 60px ${currentTheme.shadow}`,
          }}
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div style={sx(layout.spaceBetween, { marginBottom: spacing['2xl'] })}>
            <div style={sx(layout.flexRow, { gap: spacing.lg })}>
              <DollarSign size={24} color={currentTheme.accent} />
              <h2 style={{ color: currentTheme.text, margin: 0, fontSize: fontSize['5xl'] }}>Buy More Usage</h2>
            </div>
            <button
              onClick={handleClose}
                disabled={processing}
              style={{
                background: 'transparent',
                border: 'none',
                  cursor: processing ? 'not-allowed' : 'pointer',
                padding: spacing.md,
                borderRadius: radius.md,
                display: 'flex',
                  opacity: processing ? 0.5 : 1,
              }}
            >
              <X size={20} color={currentTheme.textMuted} />
            </button>
          </div>

          {success ? (
            <motion.div
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              style={sx(layout.flexCol, {
                alignItems: 'center',
                padding: `${spacing['5xl']} ${spacing['2xl']}`,
                gap: spacing.xl,
              })}
            >
              <motion.div
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                transition={{ type: 'spring', damping: 15, delay: 0.1 }}
              >
                <Check size={64} color="#00cc66" />
              </motion.div>
              <h3 style={{ color: currentTheme.text, margin: 0, fontSize: fontSize['4xl'] }}>Purchase Successful!</h3>
              <p style={{ color: currentTheme.textSecondary, margin: 0, textAlign: 'center' }}>
                ${amount.toFixed(2)} has been added to your usage balance.
              </p>
            </motion.div>
          ) : (
            <>
              {/* Amount Selection */}
              <div style={{ marginBottom: spacing['2xl'] }}>
                <p style={{ color: currentTheme.textSecondary, margin: '0 0 12px 0', fontSize: fontSize.lg }}>
                  Select an amount to add to your usage balance:
                </p>
                
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: spacing.md, marginBottom: spacing.lg }}>
                  {presetAmounts.map((amt) => (
                    <button
                      key={amt}
                      onClick={() => handleAmountSelect(amt)}
                        disabled={processing}
                      style={{
                        padding: `${spacing.lg} ${spacing.md}`,
                        borderRadius: radius.md,
                        border: selectedAmount === amt 
                          ? `2px solid ${currentTheme.accent}` 
                          : `1px solid ${currentTheme.borderLight}`,
                        background: selectedAmount === amt 
                          ? currentTheme.buttonBackgroundActive 
                          : currentTheme.buttonBackground,
                        color: currentTheme.text,
                          cursor: processing ? 'not-allowed' : 'pointer',
                        fontSize: fontSize['2xl'],
                        fontWeight: selectedAmount === amt ? fontWeight.semibold : fontWeight.normal,
                        transition: transition.normal,
                      }}
                    >
                      ${amt}
                    </button>
                  ))}
                  
                  <button
                    onClick={handleCustomClick}
                      disabled={processing}
                    style={{
                      padding: `${spacing.lg} ${spacing.md}`,
                      borderRadius: radius.md,
                      border: isCustom 
                        ? `2px solid ${currentTheme.accent}` 
                        : `1px solid ${currentTheme.borderLight}`,
                      background: isCustom 
                        ? currentTheme.buttonBackgroundActive 
                        : currentTheme.buttonBackground,
                      color: currentTheme.text,
                        cursor: processing ? 'not-allowed' : 'pointer',
                      fontSize: fontSize.base,
                      fontWeight: isCustom ? fontWeight.semibold : fontWeight.normal,
                      transition: transition.normal,
                    }}
                  >
                    Custom
                  </button>
                </div>

                <AnimatePresence>
                  {isCustom && (
                    <motion.div
                      key="custom-amount-input"
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: 'auto' }}
                      exit={{ opacity: 0, height: 0 }}
                      style={{ overflow: 'hidden' }}
                    >
                      <div style={sx(layout.flexRow, {
                        gap: spacing.md,
                        background: currentTheme.backgroundSecondary,
                        border: `1px solid ${currentTheme.borderLight}`,
                        borderRadius: radius.md,
                        padding: spacing.lg,
                        marginTop: spacing.md,
                      })}>
                        <span style={{ color: currentTheme.textSecondary, fontSize: fontSize['4xl'] }}>$</span>
                        <input
                          type="text"
                          value={customAmount}
                          onChange={handleCustomChange}
                          placeholder="Enter amount"
                            disabled={processing}
                          style={{
                            flex: 1,
                            background: 'transparent',
                            border: 'none',
                            color: currentTheme.text,
                            fontSize: fontSize['4xl'],
                            outline: 'none',
                          }}
                          autoFocus
                        />
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>

              {/* Payment Summary */}
              {amount > 0 && (
                <motion.div
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  style={{
                    background: currentTheme.backgroundSecondary,
                    border: `1px solid ${currentTheme.borderLight}`,
                    borderRadius: radius.xl,
                    padding: spacing.xl,
                    marginBottom: spacing['2xl'],
                  }}
                >
                  <div style={sx(layout.spaceBetween, { marginBottom: spacing.md })}>
                    <span style={{ color: currentTheme.textSecondary }}>Usage Credits</span>
                    <span style={{ color: currentTheme.text }}>${amount.toFixed(2)}</span>
                  </div>
                  <div style={sx(layout.spaceBetween, { marginBottom: spacing.md })}>
                    <span style={{ color: currentTheme.textSecondary }}>Transaction Fee ({TRANSACTION_FEE_PERCENT}% + $0.30)</span>
                    <span style={{ color: currentTheme.textMuted }}>${fee.toFixed(2)}</span>
                  </div>
                  <div style={sx(layout.spaceBetween, {
                    borderTop: `1px solid ${currentTheme.borderLight}`, 
                    paddingTop: spacing.md, 
                    marginTop: spacing.md,
                  })}>
                    <span style={{ color: currentTheme.text, fontWeight: fontWeight.semibold }}>Total</span>
                      <span style={{ color: currentTheme.accent, fontWeight: fontWeight.semibold, fontSize: fontSize['3xl'] }}>
                      ${total.toFixed(2)}
                    </span>
                  </div>
                </motion.div>
              )}

                {/* Error */}
              {error && (
                <motion.div
                  initial={{ opacity: 0, y: -10 }}
                  animate={{ opacity: 1, y: 0 }}
                  style={sx(layout.flexRow, {
                    background: currentTheme.errorMuted,
                    border: '1px solid rgba(255, 107, 107, 0.3)',
                    borderRadius: radius.md,
                    padding: spacing.lg,
                    marginBottom: spacing.xl,
                    gap: spacing.md,
                  })}
                >
                  <AlertCircle size={18} color={currentTheme.error} />
                  <span style={{ color: currentTheme.error, fontSize: fontSize.lg }}>{error}</span>
                </motion.div>
              )}

                {/* Payment Method Selection — only show when amount is valid */}
                {amount >= 1 && amount <= 500 && (
                  <>
                    {/* Saved Cards Section */}
                    {loadingCards ? (
                      <div style={{ textAlign: 'center', padding: '12px 0' }}>
                        <Loader size={20} color={currentTheme.accent} style={{ animation: 'spin 1s linear infinite' }} />
                      </div>
                    ) : savedCards.length > 0 && (
                      <div style={{ marginBottom: spacing.xl }}>
                        <p style={{ color: currentTheme.textSecondary, fontSize: fontSize.base, margin: '0 0 10px 0' }}>
                          Payment Method
                        </p>

                        {/* Saved card options */}
                        {savedCards.map(card => (
                          <div
                            key={card.id}
                            onClick={() => !processing && setSelectedCard(card.id)}
                            style={sx(layout.flexRow, {
                              gap: spacing.lg,
                              padding: `${spacing.lg} 14px`,
                              marginBottom: spacing.md,
                              borderRadius: radius.lg,
                              border: selectedCard === card.id
                                ? `2px solid ${currentTheme.accent}`
                                : `1px solid ${currentTheme.borderLight}`,
                              background: selectedCard === card.id
                                ? currentTheme.buttonBackgroundActive
                                : currentTheme.buttonBackground,
                              cursor: processing ? 'not-allowed' : 'pointer',
                              transition: transition.normal,
                            })}
                          >
                            <CreditCard size={20} color={selectedCard === card.id ? currentTheme.accent : currentTheme.textSecondary} />
                            <div style={{ flex: 1 }}>
                              <span style={{ color: currentTheme.text, fontWeight: fontWeight.medium }}>
                                {getBrandName(card.brand)} •••• {card.last4}
                              </span>
                              <span style={{ color: currentTheme.textMuted, fontSize: fontSize.md, marginLeft: '10px' }}>
                                {String(card.expMonth).padStart(2, '0')}/{String(card.expYear).slice(-2)}
                              </span>
                            </div>
                            <button
                              onClick={(e) => {
                                e.stopPropagation()
                                handleDeleteCard(card.id)
                              }}
                              disabled={deletingCard === card.id || processing}
                              style={{
                                background: 'transparent',
                                border: 'none',
                                cursor: 'pointer',
                                padding: spacing.xs,
                                borderRadius: radius.xs,
                                opacity: deletingCard === card.id ? 0.3 : 0.5,
                                display: 'flex',
                              }}
                              title="Remove card"
                            >
                              {deletingCard === card.id ? (
                                <Loader size={14} color={currentTheme.textMuted} style={{ animation: 'spin 1s linear infinite' }} />
                              ) : (
                                <Trash2 size={14} color={currentTheme.textMuted} />
                              )}
                            </button>
                          </div>
                        ))}

                        {/* New card option */}
                        <div
                          onClick={() => !processing && setSelectedCard(null)}
                          style={sx(layout.flexRow, {
                            gap: spacing.lg,
                            padding: `${spacing.lg} 14px`,
                            borderRadius: radius.lg,
                            border: selectedCard === null
                              ? `2px solid ${currentTheme.accent}`
                              : `1px solid ${currentTheme.borderLight}`,
                            background: selectedCard === null
                              ? currentTheme.buttonBackgroundActive
                              : currentTheme.buttonBackground,
                            cursor: processing ? 'not-allowed' : 'pointer',
                            transition: transition.normal,
                          })}
                        >
                          <CreditCard size={20} color={selectedCard === null ? currentTheme.accent : currentTheme.textSecondary} />
                          <span style={{ color: currentTheme.text, fontWeight: fontWeight.medium }}>Use a new card</span>
                        </div>
                      </div>
                    )}

                    {/* Saved card — Pay button */}
                    {selectedCard !== null ? (
              <button
                        onClick={handleChargeSavedCard}
                        disabled={processing || amount < 1}
                style={sx(layout.center, {
                  width: '100%',
                  padding: '14px',
                  borderRadius: radius.lg,
                  border: 'none',
                  background: processing ? currentTheme.backgroundTertiary : currentTheme.accentGradient,
                  color: processing ? currentTheme.textMuted : '#ffffff',
                  fontSize: fontSize['2xl'],
                  fontWeight: fontWeight.semibold,
                  cursor: processing ? 'not-allowed' : 'pointer',
                  gap: spacing.md,
                  marginBottom: spacing.md,
                })}
              >
                        {processing ? (
                  <>
                            <Loader size={18} style={{ animation: 'spin 1s linear infinite' }} />
                            Processing...
                  </>
                ) : (
                  <>
                            <CreditCard size={18} />
                            Pay ${total.toFixed(2)} with {getBrandName(savedCards.find(c => c.id === selectedCard)?.brand)} •••• {savedCards.find(c => c.id === selectedCard)?.last4}
                          </>
                        )}
                      </button>
                    ) : (
                      <>
                        {/* Save card checkbox */}
                        <label
                          style={sx(layout.flexRow, {
                            gap: spacing.md,
                            marginBottom: '14px',
                            cursor: 'pointer',
                            color: currentTheme.textSecondary,
                            fontSize: fontSize.base,
                          })}
                        >
                          <input
                            type="checkbox"
                            checked={saveCard}
                            onChange={(e) => setSaveCard(e.target.checked)}
                            style={{ accentColor: currentTheme.accent, width: '16px', height: '16px' }}
                          />
                          Save this card for future purchases
                        </label>

                        {/* Stripe PaymentElement for new card */}
                        {clientSecret && resolvedStripe && !loadingIntent ? (
                          <Elements
                            key={clientSecret}
                            stripe={resolvedStripe}
                            options={{
                              clientSecret,
                              appearance: {
                                theme: theme === 'dark' ? 'night' : 'stripe',
                                variables: {
                                  colorPrimary: currentTheme.accent,
                                  colorBackground: currentTheme.backgroundSecondary,
                                  colorText: currentTheme.text,
                                  colorDanger: currentTheme.error,
                                  fontFamily: 'system-ui, -apple-system, sans-serif',
                                  borderRadius: radius.md,
                                  spacingUnit: '4px',
                                },
                                rules: {
                                  '.Input': {
                                    backgroundColor: currentTheme.buttonBackground,
                                    border: `1px solid ${currentTheme.borderLight}`,
                                    color: currentTheme.text,
                                  },
                                  '.Input:focus': {
                                    border: `1px solid ${currentTheme.accent}`,
                                  },
                                  '.Label': {
                                    color: currentTheme.textSecondary,
                                  },
                                  '.Tab': {
                                    backgroundColor: currentTheme.backgroundSecondary,
                                    border: `1px solid ${currentTheme.borderLight}`,
                                    color: currentTheme.textSecondary,
                                  },
                                  '.Tab--selected': {
                                    backgroundColor: currentTheme.buttonBackgroundActive,
                                    color: currentTheme.text,
                                  },
                                },
                              },
                            }}
                          >
                            <InlinePaymentForm
                              onSuccess={handlePaymentSuccess}
                              onError={handlePaymentError}
                              amount={amount}
                              fee={fee}
                              total={total}
                              processing={processing}
                              setProcessing={setProcessing}
                              saveCard={saveCard}
                            />
                          </Elements>
                        ) : loadingIntent ? (
                          <div style={{ textAlign: 'center', padding: '20px 0' }}>
                            <Loader size={24} color={currentTheme.accent} style={{ animation: 'spin 1s linear infinite', marginBottom: spacing.md }} />
                            <p style={{ color: currentTheme.textMuted, fontSize: fontSize.base, margin: 0 }}>
                              Preparing payment...
                            </p>
                          </div>
                        ) : null}
                      </>
                    )}
                  </>
                )}

                {amount > 0 && amount < 1 && (
                  <p style={{ color: currentTheme.textMuted, fontSize: fontSize.base, textAlign: 'center', margin: '16px 0' }}>
                    Minimum purchase amount is $1.00
                  </p>
                )}

              {/* Footer Note */}
              <p style={{ 
                color: currentTheme.textMuted, 
                fontSize: '0.75rem', 
                textAlign: 'center',
                marginTop: spacing.xl,
                marginBottom: 0,
              }}>
                A {TRANSACTION_FEE_PERCENT}% + $0.30 transaction fee is applied to all usage purchases.
                <br />
                Credits are added immediately and never expire.
              </p>
            </>
          )}
        </motion.div>
      </motion.div>
    </AnimatePresence>
    </>
  )
}

export default BuyUsageModal
