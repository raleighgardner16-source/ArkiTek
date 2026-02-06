import React, { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { X, CreditCard, DollarSign, AlertCircle, Check, Loader, Plus } from 'lucide-react'
import { useStore } from '../store/useStore'
import { getTheme } from '../utils/theme'
import axios from 'axios'

const BuyUsageModal = ({ isOpen, onClose, onSuccess }) => {
  const currentUser = useStore((state) => state.currentUser)
  const theme = useStore((state) => state.theme || 'dark')
  const currentTheme = getTheme(theme)
  
  const [selectedAmount, setSelectedAmount] = useState(null)
  const [customAmount, setCustomAmount] = useState('')
  const [isCustom, setIsCustom] = useState(false)
  const [cardInfo, setCardInfo] = useState(null)
  const [loading, setLoading] = useState(false)
  const [loadingCard, setLoadingCard] = useState(true)
  const [addingCard, setAddingCard] = useState(false)
  const [error, setError] = useState(null)
  const [success, setSuccess] = useState(false)
  const [processingStep, setProcessingStep] = useState('')

  const presetAmounts = [5, 10, 15, 20, 25, 50, 100]
  const TRANSACTION_FEE_PERCENT = 5

  // Calculate fee and total
  const getAmount = () => {
    if (isCustom && customAmount) {
      const amount = parseFloat(customAmount)
      return isNaN(amount) ? 0 : amount
    }
    return selectedAmount || 0
  }

  const amount = getAmount()
  const fee = amount * (TRANSACTION_FEE_PERCENT / 100)
  const total = amount + fee

  // Fetch saved card info on mount
  useEffect(() => {
    if (isOpen && currentUser?.id) {
      fetchCardInfo()
    }
  }, [isOpen, currentUser?.id])

  const fetchCardInfo = async () => {
    setLoadingCard(true)
    try {
      const response = await axios.get(`http://localhost:3001/api/stripe/payment-method`, {
        params: { userId: currentUser.id }
      })
      setCardInfo(response.data.paymentMethod)
    } catch (err) {
      console.error('Error fetching card info:', err)
      // If no card on file, that's okay - we'll show a message
      setCardInfo(null)
    } finally {
      setLoadingCard(false)
    }
  }

  // Check URL params for card added success (when returning from Stripe)
  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const cardAddedParam = params.get('card_added')
    
    if (cardAddedParam === 'success' && isOpen) {
      // Card was added, refresh card info
      fetchCardInfo()
      // Clean up URL
      window.history.replaceState({}, document.title, window.location.pathname)
    }
  }, [isOpen])

  const handleAddCard = async () => {
    if (!currentUser?.id) return
    
    setAddingCard(true)
    setError(null)
    
    try {
      const response = await axios.post('http://localhost:3001/api/stripe/setup-card', {
        userId: currentUser.id
      })
      
      // Redirect to Stripe's hosted page to add card
      if (response.data.url) {
        window.location.href = response.data.url
      }
    } catch (err) {
      console.error('Error creating setup session:', err)
      setError(err.response?.data?.error || 'Failed to start card setup. Please try again.')
      setAddingCard(false)
    }
  }

  const handleAmountSelect = (amt) => {
    setSelectedAmount(amt)
    setIsCustom(false)
    setCustomAmount('')
    setError(null)
  }

  const handleCustomClick = () => {
    setIsCustom(true)
    setSelectedAmount(null)
    setError(null)
  }

  const handleCustomChange = (e) => {
    const value = e.target.value.replace(/[^0-9.]/g, '')
    // Only allow one decimal point
    const parts = value.split('.')
    if (parts.length > 2) return
    if (parts[1] && parts[1].length > 2) return
    setCustomAmount(value)
  }

  const handlePurchase = async () => {
    if (amount <= 0) {
      setError('Please select or enter an amount')
      return
    }

    if (amount < 1) {
      setError('Minimum purchase amount is $1.00')
      return
    }

    if (amount > 500) {
      setError('Maximum purchase amount is $500.00')
      return
    }

    if (!cardInfo) {
      setError('No payment method on file. Please add a card first.')
      return
    }

    setLoading(true)
    setError(null)
    setProcessingStep('Initiating transaction...')

    try {
      setProcessingStep('Charging card...')
      
      const response = await axios.post('http://localhost:3001/api/stripe/buy-usage', {
        userId: currentUser.id,
        amount: amount,
        fee: fee,
        total: total
      })

      setProcessingStep('Adding usage credits...')
      
      // Small delay to show the step
      await new Promise(resolve => setTimeout(resolve, 500))

      setSuccess(true)
      setProcessingStep('')
      
      // Notify parent of success after a moment
      setTimeout(() => {
        if (onSuccess) {
          onSuccess(response.data)
        }
      }, 1500)

    } catch (err) {
      console.error('Purchase error:', err)
      setError(err.response?.data?.error || 'Failed to process payment. Please try again.')
      setProcessingStep('')
    } finally {
      setLoading(false)
    }
  }

  const handleClose = () => {
    if (loading || addingCard) return // Prevent closing while processing
    setSelectedAmount(null)
    setCustomAmount('')
    setIsCustom(false)
    setError(null)
    setSuccess(false)
    setAddingCard(false)
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
              disabled={loading || addingCard}
              style={{
                background: 'transparent',
                border: 'none',
                cursor: (loading || addingCard) ? 'not-allowed' : 'pointer',
                padding: '8px',
                borderRadius: '8px',
                display: 'flex',
                opacity: (loading || addingCard) ? 0.5 : 1,
              }}
            >
              <X size={20} color={currentTheme.textMuted} />
            </button>
          </div>

          {success ? (
            // Success State
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
                      disabled={loading}
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
                        cursor: loading ? 'not-allowed' : 'pointer',
                        fontSize: '1rem',
                        fontWeight: selectedAmount === amt ? '600' : '400',
                        transition: 'all 0.2s ease',
                      }}
                    >
                      ${amt}
                    </button>
                  ))}
                  
                  {/* Custom Button */}
                  <button
                    onClick={handleCustomClick}
                    disabled={loading}
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
                      cursor: loading ? 'not-allowed' : 'pointer',
                      fontSize: '0.85rem',
                      fontWeight: isCustom ? '600' : '400',
                      transition: 'all 0.2s ease',
                    }}
                  >
                    Custom
                  </button>
                </div>

                {/* Custom Amount Input */}
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
                          disabled={loading}
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
                    <span style={{ 
                      color: currentTheme.accent, 
                      fontWeight: '600',
                      fontSize: '1.1rem',
                    }}>
                      ${total.toFixed(2)}
                    </span>
                  </div>
                </motion.div>
              )}

              {/* Card Info */}
              <div style={{
                background: currentTheme.backgroundSecondary,
                border: `1px solid ${currentTheme.borderLight}`,
                borderRadius: '12px',
                padding: '16px',
                marginBottom: '20px',
              }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                    <CreditCard size={24} color={currentTheme.accent} />
                    {loadingCard ? (
                      <span style={{ color: currentTheme.textMuted }}>Loading payment method...</span>
                    ) : cardInfo ? (
                      <div>
                        <p style={{ color: currentTheme.text, margin: '0 0 4px 0', fontWeight: '500' }}>
                          {cardInfo.brand?.toUpperCase() || 'Card'} •••• {cardInfo.last4}
                        </p>
                        <p style={{ color: currentTheme.textMuted, margin: 0, fontSize: '0.8rem' }}>
                          Expires {cardInfo.expMonth}/{cardInfo.expYear}
                        </p>
                      </div>
                    ) : (
                      <div>
                        <p style={{ color: currentTheme.textSecondary, margin: '0 0 4px 0' }}>No payment method on file</p>
                        <p style={{ color: currentTheme.textMuted, margin: 0, fontSize: '0.8rem' }}>
                          Add a card to purchase usage credits
                        </p>
                      </div>
                    )}
                  </div>
                  
                  {/* Add/Change Card Button */}
                  {!loadingCard && (
                    <button
                      onClick={handleAddCard}
                      disabled={addingCard}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '6px',
                        padding: cardInfo ? '8px 12px' : '10px 16px',
                        borderRadius: '8px',
                        border: `1px solid ${cardInfo ? currentTheme.borderLight : currentTheme.accent}`,
                        background: currentTheme.buttonBackground,
                        color: cardInfo ? currentTheme.textSecondary : currentTheme.accent,
                        fontSize: '0.85rem',
                        fontWeight: '500',
                        cursor: addingCard ? 'not-allowed' : 'pointer',
                        opacity: addingCard ? 0.7 : 1,
                        transition: 'all 0.2s ease',
                      }}
                      onMouseEnter={(e) => {
                        if (!addingCard) {
                          e.currentTarget.style.borderColor = currentTheme.accent
                          e.currentTarget.style.color = currentTheme.accent
                        }
                      }}
                      onMouseLeave={(e) => {
                        if (!addingCard) {
                          e.currentTarget.style.borderColor = cardInfo ? currentTheme.borderLight : currentTheme.accent
                          e.currentTarget.style.color = cardInfo ? currentTheme.textSecondary : currentTheme.accent
                        }
                      }}
                    >
                      {addingCard ? (
                        <>
                          <Loader size={16} style={{ animation: 'spin 1s linear infinite' }} />
                          {cardInfo ? 'Changing...' : 'Adding...'}
                        </>
                      ) : (
                        <>
                          {cardInfo ? (
                            <>
                              <CreditCard size={14} />
                              Change
                            </>
                          ) : (
                            <>
                              <Plus size={16} />
                              Add Card
                            </>
                          )}
                        </>
                      )}
                    </button>
                  )}
                </div>
              </div>

              {/* Error Message */}
              {error && (
                <motion.div
                  initial={{ opacity: 0, y: -10 }}
                  animate={{ opacity: 1, y: 0 }}
                  style={{
                    background: 'rgba(255, 107, 107, 0.1)',
                    border: '1px solid rgba(255, 107, 107, 0.3)',
                    borderRadius: '8px',
                    padding: '12px',
                    marginBottom: '20px',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                  }}
                >
                  <AlertCircle size={18} color="#ff6b6b" />
                  <span style={{ color: '#ff6b6b', fontSize: '0.9rem' }}>{error}</span>
                </motion.div>
              )}

              {/* Purchase Button */}
              <button
                onClick={handlePurchase}
                disabled={loading || !cardInfo || amount <= 0}
                style={{
                  width: '100%',
                  padding: '16px',
                  borderRadius: '12px',
                  border: 'none',
                  background: loading || !cardInfo || amount <= 0 
                    ? currentTheme.backgroundTertiary 
                    : currentTheme.accentGradient,
                  color: loading || !cardInfo || amount <= 0 
                    ? currentTheme.textMuted 
                    : '#ffffff',
                  fontSize: '1rem',
                  fontWeight: '600',
                  cursor: loading || !cardInfo || amount <= 0 ? 'not-allowed' : 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '8px',
                  transition: 'all 0.2s ease',
                }}
              >
                {loading ? (
                  <>
                    <Loader size={20} style={{ animation: 'spin 1s linear infinite' }} />
                    {processingStep || 'Processing...'}
                  </>
                ) : (
                  <>
                    <DollarSign size={20} />
                    {amount > 0 ? `Buy $${amount.toFixed(2)} Usage` : 'Select an Amount'}
                  </>
                )}
              </button>

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

