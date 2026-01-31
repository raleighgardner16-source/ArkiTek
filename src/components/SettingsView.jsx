import React, { useState, useEffect } from 'react'
import axios from 'axios'
import { useStore } from '../store/useStore'
import { Trash2, AlertTriangle, X } from 'lucide-react'

const SettingsView = () => {
  const [showCancelSubscriptionPopup, setShowCancelSubscriptionPopup] = useState(false)
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const [isDeleting, setIsDeleting] = useState(false)
  const [deleteError, setDeleteError] = useState(null)
  const currentUser = useStore((state) => state.currentUser)
  const clearCurrentUser = useStore((state) => state.clearCurrentUser)
  const clearResponses = useStore((state) => state.clearResponses)
  const clearSelectedModels = useStore((state) => state.clearSelectedModels)
  const setCurrentPrompt = useStore((state) => state.setCurrentPrompt)

  // Debug: Log current user status
  React.useEffect(() => {
    console.log('[SettingsView] Current user:', currentUser)
    console.log('[SettingsView] Show delete confirm:', showDeleteConfirm)
  }, [currentUser, showDeleteConfirm])

  return (
    <div
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        width: '100%',
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'flex-start',
        paddingTop: '40px',
        paddingBottom: '40px',
        overflowY: 'auto',
        zIndex: 10,
      }}
    >
      <div
        style={{
          width: '100%',
          maxWidth: '600px',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          margin: '0 auto',
        }}
      >
        {/* Header */}
        <div style={{ marginBottom: '40px', textAlign: 'center' }}>
          <h1
            style={{
              fontSize: '3rem',
              marginBottom: '12px',
              background: 'linear-gradient(90deg, #00FFFF, #00FF00)',
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
              fontWeight: 'bold',
            }}
          >
            ArkTek
          </h1>
          <h2
            style={{
              fontSize: '2rem',
              marginBottom: '12px',
              background: 'linear-gradient(90deg, #00FFFF, #00FF00)',
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
            }}
          >
            Settings
          </h2>
          <p style={{ color: '#aaaaaa', fontSize: '1.1rem' }}>
            {currentUser ? `Signed in as ${currentUser.username}` : 'Manage your ArkTek account and settings'}
          </p>
        </div>

        {/* Application Summary */}
        <div
          style={{
            background: 'rgba(0, 255, 255, 0.1)',
            border: '1px solid rgba(0, 255, 255, 0.3)',
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
              marginBottom: '16px',
              color: '#00FFFF',
              textAlign: 'center',
            }}
          >
            About ArkTek
          </h3>
          <p style={{ color: '#cccccc', marginBottom: '12px', lineHeight: '1.6', textAlign: 'left' }}>
            <strong style={{ color: '#00FF00' }}>Mission & Goal:</strong> ArkTek provides unified access to multiple AI providers through a single platform, simplifying AI development and research. We eliminate the complexity of working with multiple providers while delivering comprehensive analytics, usage tracking, and intelligent response aggregation to help you make better decisions with confidence.
          </p>
          <p style={{ color: '#cccccc', lineHeight: '1.6', textAlign: 'left' }}>
            <strong style={{ color: '#00FF00' }}>What We Solve:</strong> No more managing multiple AIs, platforms, and subscriptions. Send your prompt to multiple AI models simultaneously, compare their responses side-by-side, and receive an intelligent summary that combines all responses into one comprehensive answer. This aggregation helps identify commonalities and reduces hallucinations, giving you greater confidence that the information you receive is accurate and reliable.
          </p>
        </div>

        {/* Account Management - Only show if user is logged in */}
        {currentUser && (
          <div
            key="account-management"
            style={{
              background: 'rgba(255, 255, 255, 0.1)',
              border: '1px solid rgba(255, 255, 255, 0.3)',
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
                color: '#ffffff',
                textAlign: 'center',
              }}
            >
              Account Management
            </h3>
            
            {deleteError && (
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
                {deleteError}
              </div>
            )}

            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <button
                onClick={() => setShowCancelSubscriptionPopup(true)}
                style={{
                  padding: '12px 24px',
                  background: '#ffffff',
                  border: '1px solid rgba(255, 255, 255, 0.3)',
                  borderRadius: '8px',
                  color: '#000000',
                  fontSize: '1rem',
                  fontWeight: 'bold',
                  cursor: 'pointer',
                  transition: 'all 0.3s ease',
                  boxShadow: 'none',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '8px',
                }}
                onMouseEnter={(e) => {
                  e.target.style.background = 'rgba(255, 255, 255, 0.9)'
                  e.target.style.borderColor = 'rgba(255, 255, 255, 0.5)'
                  e.target.style.boxShadow = '0 0 20px rgba(255, 255, 255, 0.6), 0 0 40px rgba(255, 255, 255, 0.4)'
                  e.target.style.transform = 'scale(1.05)'
                }}
                onMouseLeave={(e) => {
                  e.target.style.background = '#ffffff'
                  e.target.style.borderColor = 'rgba(255, 255, 255, 0.3)'
                  e.target.style.boxShadow = 'none'
                  e.target.style.transform = 'scale(1)'
                }}
              >
                Cancel Subscription
              </button>
              <button
                onClick={() => {
                  console.log('[Delete Account] Button clicked, showing confirmation')
                  setShowDeleteConfirm(true)
                }}
                style={{
                  padding: '12px 24px',
                  background: '#ffffff',
                  border: '1px solid rgba(255, 255, 255, 0.3)',
                  borderRadius: '8px',
                  color: '#000000',
                  fontSize: '1rem',
                  fontWeight: 'bold',
                  cursor: 'pointer',
                  transition: 'all 0.3s ease',
                  boxShadow: 'none',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '8px',
                }}
                onMouseEnter={(e) => {
                  e.target.style.background = 'rgba(255, 255, 255, 0.9)'
                  e.target.style.borderColor = 'rgba(255, 255, 255, 0.5)'
                  e.target.style.boxShadow = '0 0 20px rgba(255, 255, 255, 0.6), 0 0 40px rgba(255, 255, 255, 0.4)'
                  e.target.style.transform = 'scale(1.05)'
                }}
                onMouseLeave={(e) => {
                  e.target.style.background = '#ffffff'
                  e.target.style.borderColor = 'rgba(255, 255, 255, 0.3)'
                  e.target.style.boxShadow = 'none'
                  e.target.style.transform = 'scale(1)'
                }}
              >
                <Trash2 size={20} color="#000000" />
                Delete Your Account
              </button>
            </div>
          </div>
        )}

        {/* Delete Account Popup */}
        {showDeleteConfirm && (
          <div
            style={{
              position: 'fixed',
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              background: 'rgba(0, 0, 0, 0.8)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              zIndex: 1000,
            }}
            onClick={() => {
              setShowDeleteConfirm(false)
              setDeleteError(null)
            }}
          >
            <div
              style={{
                background: '#1a0000',
                border: '2px solid rgba(255, 0, 0, 0.5)',
                borderRadius: '16px',
                padding: '30px',
                maxWidth: '500px',
                width: '90%',
                position: 'relative',
                boxShadow: '0 0 30px rgba(255, 0, 0, 0.5)',
              }}
              onClick={(e) => e.stopPropagation()}
            >
              <button
                onClick={() => {
                  setShowDeleteConfirm(false)
                  setDeleteError(null)
                }}
                style={{
                  position: 'absolute',
                  top: '15px',
                  right: '15px',
                  background: 'transparent',
                  border: 'none',
                  color: '#ff6b6b',
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
                <AlertTriangle size={24} color="#ff6b6b" />
                <h4 style={{ color: '#ff6b6b', margin: 0, fontSize: '1.3rem' }}>
                  Delete Account
                </h4>
              </div>
              {deleteError && (
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
                  {deleteError}
                </div>
              )}
              <p style={{ color: '#cccccc', marginBottom: '12px', textAlign: 'center', lineHeight: '1.6' }}>
                This will permanently delete your account and subscription. You will lose all your usage statistics and account data.
              </p>
              <p style={{ color: '#ff6b6b', marginBottom: '20px', textAlign: 'center', lineHeight: '1.6', fontWeight: 'bold' }}>
                If you decide to come back, you will need to create a new account from scratch.
              </p>
              <div style={{ display: 'flex', gap: '12px', justifyContent: 'center' }}>
                <button
                  onClick={() => {
                    setShowDeleteConfirm(false)
                    setDeleteError(null)
                  }}
                  disabled={isDeleting}
                  style={{
                    padding: '12px 24px',
                    background: 'rgba(128, 128, 128, 0.3)',
                    border: '1px solid rgba(128, 128, 128, 0.5)',
                    borderRadius: '8px',
                    color: '#cccccc',
                    fontSize: '1rem',
                    fontWeight: 'bold',
                    cursor: isDeleting ? 'not-allowed' : 'pointer',
                    transition: 'all 0.3s ease',
                    opacity: isDeleting ? 0.5 : 1,
                  }}
                  onMouseEnter={(e) => {
                    if (!isDeleting) {
                      e.target.style.background = 'rgba(128, 128, 128, 0.5)'
                      e.target.style.borderColor = 'rgba(128, 128, 128, 0.7)'
                      e.target.style.transform = 'scale(1.05)'
                    }
                  }}
                  onMouseLeave={(e) => {
                    if (!isDeleting) {
                      e.target.style.background = 'rgba(128, 128, 128, 0.3)'
                      e.target.style.borderColor = 'rgba(128, 128, 128, 0.5)'
                      e.target.style.transform = 'scale(1)'
                    }
                  }}
                >
                  Cancel
                </button>
                <button
                  onClick={async () => {
                    if (!currentUser?.id) {
                      setDeleteError('No user ID found')
                      return
                    }

                    setIsDeleting(true)
                    setDeleteError(null)

                    try {
                      const response = await axios.delete('http://localhost:3001/api/auth/account', {
                        data: { userId: currentUser.id },
                      })

                      if (response.data.success) {
                        // Clear all user-related state
                        clearCurrentUser()
                        clearResponses()
                        clearSelectedModels()
                        setCurrentPrompt('')
                        // Reset confirmation state
                        setShowDeleteConfirm(false)
                        // Optionally show success message or redirect
                        alert('Account deleted successfully')
                      }
                    } catch (error) {
                      console.error('[Account Deletion] Error:', error)
                      console.error('[Account Deletion] Error response:', error.response)
                      console.error('[Account Deletion] Error message:', error.message)
                      
                      if (error.response?.status === 404) {
                        setDeleteError('Server endpoint not found. Please restart the backend server (npm run dev:server)')
                      } else if (error.code === 'ECONNREFUSED' || error.message.includes('Network Error')) {
                        setDeleteError('Cannot connect to backend server. Make sure the server is running (npm run dev:server)')
                      } else {
                        setDeleteError(
                          error.response?.data?.error || error.message || 'Failed to delete account. Please try again.'
                        )
                      }
                    } finally {
                      setIsDeleting(false)
                    }
                  }}
                  disabled={isDeleting}
                  style={{
                    padding: '12px 24px',
                    background: isDeleting
                      ? 'rgba(255, 0, 0, 0.3)'
                      : 'rgba(255, 0, 0, 0.5)',
                    border: '1px solid rgba(255, 0, 0, 0.7)',
                    borderRadius: '8px',
                    color: '#ffffff',
                    fontSize: '1rem',
                    fontWeight: 'bold',
                    cursor: isDeleting ? 'not-allowed' : 'pointer',
                    transition: 'all 0.3s ease',
                    opacity: isDeleting ? 0.5 : 1,
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                  }}
                  onMouseEnter={(e) => {
                    if (!isDeleting) {
                      e.target.style.background = 'rgba(255, 0, 0, 0.7)'
                      e.target.style.boxShadow = '0 0 20px rgba(255, 0, 0, 0.6)'
                    }
                  }}
                  onMouseLeave={(e) => {
                    if (!isDeleting) {
                      e.target.style.background = 'rgba(255, 0, 0, 0.5)'
                      e.target.style.boxShadow = 'none'
                    }
                  }}
                >
                  <Trash2 size={20} />
                  {isDeleting ? 'Deleting...' : 'Yes, Delete My Account'}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Cancel Subscription Popup */}
        {showCancelSubscriptionPopup && (
          <div
            style={{
              position: 'fixed',
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              background: 'rgba(0, 0, 0, 0.8)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              zIndex: 1000,
            }}
            onClick={() => setShowCancelSubscriptionPopup(false)}
          >
            <div
              style={{
                background: '#1a1a1a',
                border: '2px solid rgba(255, 255, 255, 0.3)',
                borderRadius: '16px',
                padding: '30px',
                maxWidth: '500px',
                width: '90%',
                position: 'relative',
                boxShadow: '0 0 30px rgba(255, 255, 255, 0.3)',
              }}
              onClick={(e) => e.stopPropagation()}
            >
              <button
                onClick={() => setShowCancelSubscriptionPopup(false)}
                style={{
                  position: 'absolute',
                  top: '15px',
                  right: '15px',
                  background: 'transparent',
                  border: 'none',
                  color: '#ffffff',
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
                <AlertTriangle size={24} color="#ffffff" />
                <h4 style={{ color: '#ffffff', margin: 0, fontSize: '1.3rem' }}>
                  Cancel Subscription
                </h4>
              </div>
              <p style={{ color: '#cccccc', marginBottom: '12px', lineHeight: '1.6', textAlign: 'center' }}>
                Canceling your subscription will pause your account and stop all billing after the current billing period.
              </p>
              <p style={{ color: '#cccccc', marginBottom: '12px', lineHeight: '1.6', textAlign: 'center' }}>
                You will continue to have access through the end of the current month, and you will be billed for any usage during that month.
              </p>
              <p style={{ color: '#00FF00', marginBottom: '20px', lineHeight: '1.6', textAlign: 'center', fontWeight: 'bold' }}>
                You can always come back and unfreeze your account without having to create a new one.
              </p>
              <div style={{ display: 'flex', gap: '12px', justifyContent: 'center' }}>
                <button
                  onClick={() => setShowCancelSubscriptionPopup(false)}
                  style={{
                    padding: '12px 24px',
                    background: 'rgba(255, 255, 255, 0.2)',
                    border: '1px solid rgba(255, 255, 255, 0.5)',
                    borderRadius: '8px',
                    color: '#ffffff',
                    fontSize: '1rem',
                    fontWeight: 'bold',
                    cursor: 'pointer',
                    transition: 'all 0.3s ease',
                  }}
                  onMouseEnter={(e) => {
                    e.target.style.background = 'rgba(255, 255, 255, 0.3)'
                    e.target.style.borderColor = 'rgba(255, 255, 255, 0.7)'
                    e.target.style.transform = 'scale(1.05)'
                  }}
                  onMouseLeave={(e) => {
                    e.target.style.background = 'rgba(255, 255, 255, 0.2)'
                    e.target.style.borderColor = 'rgba(255, 255, 255, 0.5)'
                    e.target.style.transform = 'scale(1)'
                  }}
                >
                  Keep Subscription
                </button>
                <button
                  onClick={() => {
                    // TODO: Implement cancel subscription functionality
                    alert('Cancel subscription functionality will be implemented here')
                    setShowCancelSubscriptionPopup(false)
                  }}
                  style={{
                    padding: '12px 24px',
                    background: 'rgba(255, 255, 255, 0.2)',
                    border: '1px solid rgba(255, 255, 255, 0.5)',
                    borderRadius: '8px',
                    color: '#ffffff',
                    fontSize: '1rem',
                    fontWeight: 'bold',
                    cursor: 'pointer',
                    transition: 'all 0.3s ease',
                  }}
                  onMouseEnter={(e) => {
                    e.target.style.background = 'rgba(255, 255, 255, 0.3)'
                    e.target.style.borderColor = 'rgba(255, 255, 255, 0.7)'
                    e.target.style.transform = 'scale(1.05)'
                  }}
                  onMouseLeave={(e) => {
                    e.target.style.background = 'rgba(255, 255, 255, 0.2)'
                    e.target.style.borderColor = 'rgba(255, 255, 255, 0.5)'
                    e.target.style.transform = 'scale(1)'
                  }}
                >
                  Cancel Subscription
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

export default SettingsView

