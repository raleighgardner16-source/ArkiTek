import React, { useState, useEffect, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { X, DollarSign, AlertCircle, Check, Loader, CreditCard, Shield, Trash2 } from 'lucide-react'
import { useStore } from '../store/useStore'
import { API_URL } from '../utils/config'
import { getTheme } from '../utils/theme'
import axios from 'axios'
import { loadStripe } from '@stripe/stripe-js'
import { Elements, PaymentElement, useStripe, useElements } from '@stripe/react-stripe-js'

// Stripe promise — loaded once
let stripePromise = null

const getStripePromise = async () => {
  if (!stripePromise) {
    const response = await axios.get(`${API_URL}/api/stripe/config`)
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

const getBrandName = (brand) => brandNames[brand] || brand?.charAt(0).toUpperCase() + brand?.slice(1) || 'Card'

// Inner payment form using Stripe hooks
const InlinePaymentForm = ({ onSuccess, onError, total, processing, setProcessing, saveCard }) => {
  const stripe = useStripe()
  const elements = useElements()
  const [ready, setReady] = useState(false)
  const [error, setError] = useState(null)
  const theme = useStore((state) => state.theme || 'dark')
  const currentTheme = getTheme(theme)

  const handleSubmit = async (e) => {
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
        setError(stripeError.message)
        onError?.(stripeError.message)
      } else if (paymentIntent && paymentIntent.status === 'succeeded') {
        onSuccess?.()
      } else {
        setError('Payment was not completed. Please try again.')
        onError?.('Payment was not completed.')
      }
    } catch (err) {
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
        marginBottom: '16px',
        padding: '14px',
        background: currentTheme.backgroundSecondary,
        borderRadius: '10px',
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
        <div style={{
          padding: '10px 14px',
          marginBottom: '12px',
          background: 'rgba(255, 107, 107, 0.1)',
          border: '1px solid rgba(255, 107, 107, 0.3)',
          borderRadius: '8px',
          color: '#ff6b6b',
          fontSize: '0.85rem',
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
        }}>
          <AlertCircle size={16} />
          {error}
        </div>
      )}

      <button
        type="submit"
        disabled={!stripe || !elements || !ready || processing}
        style={{
          width: '100%',
          padding: '14px',
          borderRadius: '10px',
          border: 'none',
          background: (!stripe || !elements || !ready || processing)
            ? currentTheme.backgroundTertiary
            : currentTheme.accentGradient,
          color: (!stripe || !elements || !ready || processing)
            ? currentTheme.textMuted
            : '#ffffff',
          fontSize: '1rem',
          fontWeight: '600',
          cursor: (!stripe || !elements || !ready || processing) ? 'not-allowed' : 'pointer',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: '8px',
        }}
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

      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: '6px',
        marginTop: '10px',
        color: currentTheme.textMuted,
        fontSize: '0.72rem',
      }}>
        <Shield size={11} />
        Secured by Stripe
      </div>
    </form>
  )
}

// Main modal
const BuyUsageModal = ({ isOpen, onClose, onSuccess }) => {
  const currentUser = useStore((state) => state.currentUser)
  const theme = useStore((state) => state.theme || 'dark')
  const currentTheme = getTheme(theme)
  
  const [selectedAmount, setSelectedAmount] = useState(null)
  const [customAmount, setCustomAmount] = useState('')
  const [isCustom, setIsCustom] = useState(false)
  const [error, setError] = useState(null)
  const [success, setSuccess] = useState(false)
  const [processing, setProcessing] = useState(false)

  // Stripe inline payment state
  const [clientSecret, setClientSecret] = useState(null)
  const [paymentIntentId, setPaymentIntentId] = useState(null)
  const [loadingIntent, setLoadingIntent] = useState(false)
  const [resolvedStripe, setResolvedStripe] = useState(null)
  const [stripeLoaded, setStripeLoaded] = useState(false)

  // Saved cards
  const [savedCards, setSavedCards] = useState([])
  const [loadingCards, setLoadingCards] = useState(false)
  const [selectedCard, setSelectedCard] = useState(null) // null = new card, or card id
  const [saveCard, setSaveCard] = useState(false)
  const [deletingCard, setDeletingCard] = useState(null)

  const presetAmounts = [5, 10, 15, 20, 25, 50, 100]
  const TRANSACTION_FEE_PERCENT = 3.5

  const getAmount = () => {
    if (isCustom && customAmount) {
      const val = parseFloat(customAmount)
      return isNaN(val) ? 0 : val
    }
    return selectedAmount || 0
  }

  const amount = getAmount()
  const fee = Math.round(amount * (TRANSACTION_FEE_PERCENT / 100) * 100) / 100
  const total = amount + fee

  // Fetch saved cards on open
  useEffect(() => {
    if (isOpen && currentUser?.id) {
      setLoadingCards(true)
      axios.get(`${API_URL}/api/stripe/saved-cards`, { params: { userId: currentUser.id } })
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
        const response = await axios.post(`${API_URL}/api/stripe/create-usage-intent`, {
          userId: currentUser.id,
          amount,
          saveCard,
        })
        setClientSecret(response.data.clientSecret)
        setPaymentIntentId(response.data.paymentIntentId)
    } catch (err) {
        console.error('Error creating usage intent:', err)
        setError(err.response?.data?.error || 'Failed to initialize payment.')
      } finally {
        setLoadingIntent(false)
      }
    }, isCustom ? 600 : 100)

    return () => clearTimeout(timer)
  }, [isOpen, currentUser?.id, amount, isCustom, selectedCard, saveCard])

  const handleAmountSelect = (amt) => {
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

  const handleCustomChange = (e) => {
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
      const response = await axios.post(`${API_URL}/api/stripe/charge-saved-card`, {
        userId: currentUser.id,
        paymentMethodId: selectedCard,
        amount,
      })

      setSuccess(true)
      setTimeout(() => {
        if (onSuccess) onSuccess(response.data)
      }, 1500)
    } catch (err) {
      console.error('Error charging saved card:', err)
      setError(err.response?.data?.error || 'Failed to charge card. Please try again.')
    } finally {
      setProcessing(false)
    }
  }

  // Pay with new card (via Stripe Elements)
  const handlePaymentSuccess = useCallback(async () => {
    try {
      const response = await axios.post(`${API_URL}/api/stripe/confirm-usage-purchase`, {
        userId: currentUser.id,
        paymentIntentId,
        amount,
      })

      setSuccess(true)
      setError(null)
      
      // Refresh saved cards if they saved the card
      if (saveCard) {
        try {
          const cardsRes = await axios.get(`${API_URL}/api/stripe/saved-cards`, { params: { userId: currentUser.id } })
          setSavedCards(cardsRes.data.cards || [])
        } catch {}
      }

      setTimeout(() => {
        if (onSuccess) onSuccess(response.data)
      }, 1500)
    } catch (err) {
      console.error('Error confirming purchase:', err)
      setSuccess(true)
      setTimeout(() => {
        if (onSuccess) onSuccess({ creditsAdded: amount })
      }, 1500)
    }
  }, [currentUser?.id, paymentIntentId, amount, onSuccess, saveCard])

  const handlePaymentError = useCallback((msg) => {
    setError(msg)
  }, [])

  const handleDeleteCard = async (cardId) => {
    setDeletingCard(cardId)
    try {
      await axios.delete(`${API_URL}/api/stripe/saved-cards/${cardId}`)
      setSavedCards(prev => prev.filter(c => c.id !== cardId))
      if (selectedCard === cardId) {
        const remaining = savedCards.filter(c => c.id !== cardId)
        setSelectedCard(remaining.length > 0 ? remaining[0].id : null)
      }
    } catch (err) {
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
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: 'rgba(0, 0, 0, 0.7)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 10000,
            backdropFilter: 'blur(4px)',
          }}
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
            borderRadius: '16px',
            padding: '24px',
            width: '90%',
            maxWidth: '450px',
            maxHeight: '90vh',
            overflow: 'auto',
            boxShadow: `0 20px 60px ${currentTheme.shadow}`,
          }}
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <DollarSign size={24} color={currentTheme.accent} />
              <h2 style={{ color: currentTheme.text, margin: 0, fontSize: '1.3rem' }}>Buy More Usage</h2>
            </div>
            <button
              onClick={handleClose}
                disabled={processing}
              style={{
                background: 'transparent',
                border: 'none',
                  cursor: processing ? 'not-allowed' : 'pointer',
                padding: '8px',
                borderRadius: '8px',
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
              style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                padding: '40px 20px',
                gap: '16px',
              }}
            >
              <motion.div
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                transition={{ type: 'spring', damping: 15, delay: 0.1 }}
              >
                <Check size={64} color="#00cc66" />
              </motion.div>
              <h3 style={{ color: currentTheme.text, margin: 0, fontSize: '1.2rem' }}>Purchase Successful!</h3>
              <p style={{ color: currentTheme.textSecondary, margin: 0, textAlign: 'center' }}>
                ${amount.toFixed(2)} has been added to your usage balance.
              </p>
            </motion.div>
          ) : (
            <>
              {/* Amount Selection */}
              <div style={{ marginBottom: '20px' }}>
                <p style={{ color: currentTheme.textSecondary, margin: '0 0 12px 0', fontSize: '0.9rem' }}>
                  Select an amount to add to your usage balance:
                </p>
                
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '8px', marginBottom: '12px' }}>
                  {presetAmounts.map((amt) => (
                    <button
                      key={amt}
                      onClick={() => handleAmountSelect(amt)}
                        disabled={processing}
                      style={{
                        padding: '12px 8px',
                        borderRadius: '8px',
                        border: selectedAmount === amt 
                          ? `2px solid ${currentTheme.accent}` 
                          : `1px solid ${currentTheme.borderLight}`,
                        background: selectedAmount === amt 
                          ? currentTheme.buttonBackgroundActive 
                          : currentTheme.buttonBackground,
                        color: currentTheme.text,
                          cursor: processing ? 'not-allowed' : 'pointer',
                        fontSize: '1rem',
                        fontWeight: selectedAmount === amt ? '600' : '400',
                        transition: 'all 0.2s ease',
                      }}
                    >
                      ${amt}
                    </button>
                  ))}
                  
                  <button
                    onClick={handleCustomClick}
                      disabled={processing}
                    style={{
                      padding: '12px 8px',
                      borderRadius: '8px',
                      border: isCustom 
                        ? `2px solid ${currentTheme.accent}` 
                        : `1px solid ${currentTheme.borderLight}`,
                      background: isCustom 
                        ? currentTheme.buttonBackgroundActive 
                        : currentTheme.buttonBackground,
                      color: currentTheme.text,
                        cursor: processing ? 'not-allowed' : 'pointer',
                      fontSize: '0.85rem',
                      fontWeight: isCustom ? '600' : '400',
                      transition: 'all 0.2s ease',
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
                      <div style={{ 
                        display: 'flex', 
                        alignItems: 'center', 
                        gap: '8px',
                        background: currentTheme.backgroundSecondary,
                        border: `1px solid ${currentTheme.borderLight}`,
                        borderRadius: '8px',
                        padding: '12px',
                        marginTop: '8px',
                      }}>
                        <span style={{ color: currentTheme.textSecondary, fontSize: '1.2rem' }}>$</span>
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
                            fontSize: '1.2rem',
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
                    borderRadius: '12px',
                    padding: '16px',
                    marginBottom: '20px',
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
                    <span style={{ color: currentTheme.textSecondary }}>Usage Credits</span>
                    <span style={{ color: currentTheme.text }}>${amount.toFixed(2)}</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
                    <span style={{ color: currentTheme.textSecondary }}>Transaction Fee ({TRANSACTION_FEE_PERCENT}%)</span>
                    <span style={{ color: currentTheme.textMuted }}>${fee.toFixed(2)}</span>
                  </div>
                  <div style={{ 
                    borderTop: `1px solid ${currentTheme.borderLight}`, 
                    paddingTop: '8px', 
                    marginTop: '8px',
                    display: 'flex', 
                    justifyContent: 'space-between',
                  }}>
                    <span style={{ color: currentTheme.text, fontWeight: '600' }}>Total</span>
                      <span style={{ color: currentTheme.accent, fontWeight: '600', fontSize: '1.1rem' }}>
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
                  style={{
                    background: 'rgba(255, 107, 107, 0.1)',
                    border: '1px solid rgba(255, 107, 107, 0.3)',
                    borderRadius: '8px',
                    padding: '12px',
                      marginBottom: '16px',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                  }}
                >
                  <AlertCircle size={18} color="#ff6b6b" />
                  <span style={{ color: '#ff6b6b', fontSize: '0.9rem' }}>{error}</span>
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
                      <div style={{ marginBottom: '16px' }}>
                        <p style={{ color: currentTheme.textSecondary, fontSize: '0.85rem', margin: '0 0 10px 0' }}>
                          Payment Method
                        </p>

                        {/* Saved card options */}
                        {savedCards.map(card => (
                          <div
                            key={card.id}
                            onClick={() => !processing && setSelectedCard(card.id)}
                            style={{
                              display: 'flex',
                              alignItems: 'center',
                              gap: '12px',
                              padding: '12px 14px',
                              marginBottom: '8px',
                              borderRadius: '10px',
                              border: selectedCard === card.id
                                ? `2px solid ${currentTheme.accent}`
                                : `1px solid ${currentTheme.borderLight}`,
                              background: selectedCard === card.id
                                ? currentTheme.buttonBackgroundActive
                                : currentTheme.buttonBackground,
                              cursor: processing ? 'not-allowed' : 'pointer',
                              transition: 'all 0.2s ease',
                            }}
                          >
                            <CreditCard size={20} color={selectedCard === card.id ? currentTheme.accent : currentTheme.textSecondary} />
                            <div style={{ flex: 1 }}>
                              <span style={{ color: currentTheme.text, fontWeight: '500' }}>
                                {getBrandName(card.brand)} •••• {card.last4}
                              </span>
                              <span style={{ color: currentTheme.textMuted, fontSize: '0.8rem', marginLeft: '10px' }}>
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
                                padding: '4px',
                                borderRadius: '4px',
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
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: '12px',
                            padding: '12px 14px',
                            borderRadius: '10px',
                            border: selectedCard === null
                              ? `2px solid ${currentTheme.accent}`
                              : `1px solid ${currentTheme.borderLight}`,
                            background: selectedCard === null
                              ? currentTheme.buttonBackgroundActive
                              : currentTheme.buttonBackground,
                            cursor: processing ? 'not-allowed' : 'pointer',
                            transition: 'all 0.2s ease',
                          }}
                        >
                          <CreditCard size={20} color={selectedCard === null ? currentTheme.accent : currentTheme.textSecondary} />
                          <span style={{ color: currentTheme.text, fontWeight: '500' }}>Use a new card</span>
                        </div>
                      </div>
                    )}

                    {/* Saved card — Pay button */}
                    {selectedCard !== null ? (
              <button
                        onClick={handleChargeSavedCard}
                        disabled={processing || amount < 1}
                style={{
                  width: '100%',
                          padding: '14px',
                          borderRadius: '10px',
                  border: 'none',
                          background: processing ? currentTheme.backgroundTertiary : currentTheme.accentGradient,
                          color: processing ? currentTheme.textMuted : '#ffffff',
                  fontSize: '1rem',
                  fontWeight: '600',
                          cursor: processing ? 'not-allowed' : 'pointer',
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
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: '8px',
                            marginBottom: '14px',
                            cursor: 'pointer',
                            color: currentTheme.textSecondary,
                            fontSize: '0.85rem',
                          }}
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
                                  colorDanger: '#ff6b6b',
                                  fontFamily: 'system-ui, -apple-system, sans-serif',
                                  borderRadius: '8px',
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
                            <Loader size={24} color={currentTheme.accent} style={{ animation: 'spin 1s linear infinite', marginBottom: '8px' }} />
                            <p style={{ color: currentTheme.textMuted, fontSize: '0.85rem', margin: 0 }}>
                              Preparing payment...
                            </p>
                          </div>
                        ) : null}
                      </>
                    )}
                  </>
                )}

                {amount > 0 && amount < 1 && (
                  <p style={{ color: currentTheme.textMuted, fontSize: '0.85rem', textAlign: 'center', margin: '16px 0' }}>
                    Minimum purchase amount is $1.00
                  </p>
                )}

              {/* Footer Note */}
              <p style={{ 
                color: currentTheme.textMuted, 
                fontSize: '0.75rem', 
                textAlign: 'center',
                marginTop: '16px',
                marginBottom: 0,
              }}>
                A {TRANSACTION_FEE_PERCENT}% transaction fee is applied to all usage purchases.
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
