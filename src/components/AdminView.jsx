import React, { useEffect, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Users, DollarSign, Shield, TrendingUp, Database, CreditCard, Lock, User, Package, Receipt, ArrowLeft, Search, ChevronDown, ChevronRight, BarChart3, MessageSquare } from 'lucide-react'
import { useStore } from '../store/useStore'
import axios from 'axios'
import { getAllModels, LLM_PROVIDERS } from '../services/llmProviders'

const AdminView = () => {
  const currentUser = useStore((state) => state.currentUser)
  const setCurrentUser = useStore((state) => state.setCurrentUser)
  const [usersData, setUsersData] = useState(null)
  const [pricingData, setPricingData] = useState(null)
  const [costsData, setCostsData] = useState(null)
  const [isAdmin, setIsAdmin] = useState(false)
  const [loading, setLoading] = useState(false) // Start false - will be set true when checking
  const [expandedProviders, setExpandedProviders] = useState({})
  const [expandedUsers, setExpandedUsers] = useState({})
  const [expandedUserProviders, setExpandedUserProviders] = useState({}) // For provider expansion within user details
  const [expandedUserModels, setExpandedUserModels] = useState({}) // For model expansion within user details
  const [showLogin, setShowLogin] = useState(true) // Show login by default
  const [adminCheckComplete, setAdminCheckComplete] = useState(false)
  const [loginData, setLoginData] = useState({ username: '', password: '' })
  const [loginError, setLoginError] = useState('')
  const [loginLoading, setLoginLoading] = useState(false)
  const [activeSection, setActiveSection] = useState('main') // 'main', 'users', 'models', 'prices', 'expenses'
  const [userSearchQuery, setUserSearchQuery] = useState('')
  const [userStatsData, setUserStatsData] = useState({}) // Store stats for each user
  const [loadingUserStats, setLoadingUserStats] = useState({}) // Track loading state per user
  const [userFilter, setUserFilter] = useState('all') // 'all', 'active', 'notActive', 'canceled'

  useEffect(() => {
    console.log('[AdminView] Mounted, currentUser:', currentUser?.id)
    // If no user, show login
    if (!currentUser?.id) {
      console.log('[AdminView] No currentUser, showing login')
      setLoading(false)
      setShowLogin(true)
      setIsAdmin(false)
      setAdminCheckComplete(false)
      return
    }
    
    // User exists - but we still want to verify they're an admin
    // So we'll check admin status, but keep login hidden for now
    console.log('[AdminView] User exists, checking admin status...')
    setShowLogin(false) // Hide login since user is logged in
    setLoading(true) // Set loading while checking
    setAdminCheckComplete(false) // Reset check completion
    checkAdminStatus()
  }, [currentUser])

  const handleLogin = async (e) => {
    e.preventDefault()
    setLoginError('')
    setLoginLoading(true)

    try {
      console.log('[AdminView] Attempting login with username:', loginData.username)
      const response = await axios.post(`http://localhost:3001/api/auth/signin`, {
        username: loginData.username,
        password: loginData.password,
      })

      console.log('[AdminView] Login response:', response.data)
      
      if (response.data.success) {
        console.log('[AdminView] ✅ Login successful, user:', response.data.user)
        console.log('[AdminView] User ID:', response.data.user?.id, 'Username:', response.data.user?.username)
        setCurrentUser(response.data.user)
        setShowLogin(false)
        setLoginData({ username: '', password: '' })
        // checkAdminStatus will be called automatically via useEffect when currentUser changes
      } else {
        console.log('[AdminView] ⚠️ Login response not successful:', response.data)
        setLoginError('Login failed. Please try again.')
      }
    } catch (err) {
      console.error('[AdminView] ❌ Admin login error:', err)
      console.error('[AdminView] Error response:', err.response?.data)
      const errorMessage = err.response?.data?.error || err.message || 'Invalid credentials. Please try again.'
      setLoginError(errorMessage)
    } finally {
      setLoginLoading(false)
    }
  }

  const checkAdminStatus = async () => {
    if (!currentUser || !currentUser.id) {
      console.error('[AdminView] ❌ Cannot check admin status - no currentUser or user.id')
      setLoading(false)
      setShowLogin(true)
      return
    }
    
    console.log('[AdminView] Checking admin status for user:', currentUser.id, 'username:', currentUser.username)
    setLoading(true) // Set loading to true while checking
    setAdminCheckComplete(false)
    try {
      const response = await axios.get(`http://localhost:3001/api/admin/check`, {
        params: { userId: currentUser.id },
      })
      console.log('[AdminView] Admin check response:', response.data)
      const userIsAdmin = response.data.isAdmin === true
      console.log('[AdminView] User isAdmin:', userIsAdmin)
      setIsAdmin(userIsAdmin)
      setAdminCheckComplete(true)
      if (!userIsAdmin) {
        console.log('[AdminView] ⚠️ User is not admin, will show access denied...')
        setLoading(false)
        // Don't redirect immediately - let the user see the access denied message
      } else {
        console.log('[AdminView] ✅ User is admin, fetching data...')
        // Only fetch data if user is admin
        fetchAdminData()
      }
    } catch (error) {
      console.error('[AdminView] ❌ Error checking admin status:', error)
      console.error('[AdminView] Error details:', {
        status: error.response?.status,
        data: error.response?.data,
        message: error.message
      })
      setIsAdmin(false)
      setAdminCheckComplete(true)
      setLoading(false)
      // Show error message to user
      setLoginError(`Error checking admin status: ${error.response?.data?.error || error.message}`)
      setShowLogin(true) // Show login again on error
    }
  }

  const fetchAdminData = async () => {
    try {
      setLoading(true)
      const [usersResponse, pricingResponse, costsResponse] = await Promise.all([
        axios.get('http://localhost:3001/api/admin/users'),
        axios.get('http://localhost:3001/api/admin/pricing'),
        axios.get('http://localhost:3001/api/admin/costs'),
      ])
      setUsersData(usersResponse.data)
      setPricingData(pricingResponse.data)
      setCostsData(costsResponse.data)
    } catch (error) {
      console.error('Error fetching admin data:', error)
    } finally {
      setLoading(false)
    }
  }

  const formatCurrency = (amount) => {
    if (amount === 0) return '$0.00'
    if (amount < 0.01) return `$${amount.toFixed(4)}`
    return `$${amount.toFixed(2)}`
  }

  const formatNumber = (num) => {
    if (num === null || num === undefined) return '0'
    return new Intl.NumberFormat('en-US').format(num)
  }

  const formatTokens = (num) => {
    if (num >= 1000000) return (num / 1000000).toFixed(2) + 'M'
    if (num >= 1000) return (num / 1000).toFixed(2) + 'K'
    return num.toLocaleString()
  }

  if (loading) {
    return (
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        style={{
          position: 'fixed',
          top: '0',
          left: '0',
          width: '100%',
          height: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 10,
          background: 'rgba(0, 0, 0, 0.95)',
        }}
      >
        <p style={{ color: '#ffffff', fontSize: '1.2rem' }}>Loading admin data...</p>
      </motion.div>
    )
  }

  // Show login modal if not logged in
  if (showLogin) {
    return (
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        style={{
          position: 'fixed',
          top: '0',
          left: '0',
          width: '100%',
          height: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 10000,
          background: 'rgba(0, 0, 0, 0.95)',
        }}
      >
        <motion.div
          initial={{ scale: 0.9, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          style={{
            background: 'rgba(0, 255, 255, 0.1)',
            border: '1px solid rgba(0, 255, 255, 0.3)',
            borderRadius: '16px',
            padding: '40px',
            width: '100%',
            maxWidth: '400px',
          }}
        >
          <div style={{ textAlign: 'center', marginBottom: '30px' }}>
            <Shield size={48} color="#00FFFF" style={{ marginBottom: '16px' }} />
            <h2 style={{ color: '#ffffff', fontSize: '1.8rem', marginBottom: '8px' }}>
              Admin Login
            </h2>
            <p style={{ color: '#aaaaaa', fontSize: '0.95rem' }}>
              Enter your credentials to access the admin panel
            </p>
          </div>

          <form onSubmit={handleLogin}>
            <div style={{ marginBottom: '20px' }}>
              <label
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  color: '#ffffff',
                  fontSize: '0.9rem',
                  marginBottom: '8px',
                }}
              >
                <User size={16} color="#00FFFF" />
                Username
              </label>
              <input
                type="text"
                value={loginData.username}
                onChange={(e) => setLoginData({ ...loginData, username: e.target.value })}
                required
                style={{
                  width: '100%',
                  padding: '12px 16px',
                  background: 'rgba(0, 0, 0, 0.5)',
                  border: '1px solid rgba(0, 255, 255, 0.3)',
                  borderRadius: '8px',
                  color: '#ffffff',
                  fontSize: '1rem',
                  boxSizing: 'border-box',
                }}
                placeholder="Enter username"
              />
            </div>

            <div style={{ marginBottom: '24px' }}>
              <label
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  color: '#ffffff',
                  fontSize: '0.9rem',
                  marginBottom: '8px',
                }}
              >
                <Lock size={16} color="#00FFFF" />
                Password
              </label>
              <input
                type="password"
                value={loginData.password}
                onChange={(e) => setLoginData({ ...loginData, password: e.target.value })}
                required
                style={{
                  width: '100%',
                  padding: '12px 16px',
                  background: 'rgba(0, 0, 0, 0.5)',
                  border: '1px solid rgba(0, 255, 255, 0.3)',
                  borderRadius: '8px',
                  color: '#ffffff',
                  fontSize: '1rem',
                  boxSizing: 'border-box',
                }}
                placeholder="Enter password"
              />
            </div>

            {loginError && (
              <div
                style={{
                  background: 'rgba(255, 0, 0, 0.1)',
                  border: '1px solid rgba(255, 0, 0, 0.3)',
                  borderRadius: '8px',
                  padding: '12px',
                  marginBottom: '20px',
                  color: '#ff6b6b',
                  fontSize: '0.9rem',
                }}
              >
                {loginError}
              </div>
            )}

            <button
              type="submit"
              disabled={loginLoading}
              style={{
                width: '100%',
                padding: '14px',
                background: loginLoading
                  ? 'rgba(0, 255, 255, 0.3)'
                  : 'linear-gradient(90deg, #00FFFF, #00FF00)',
                color: '#000000',
                border: 'none',
                borderRadius: '8px',
                fontSize: '1rem',
                fontWeight: '600',
                cursor: loginLoading ? 'not-allowed' : 'pointer',
                transition: 'all 0.2s ease',
              }}
            >
              {loginLoading ? 'Logging in...' : 'Login'}
            </button>
          </form>
        </motion.div>
      </motion.div>
    )
  }

  // Show access denied if not admin (but logged in and check is complete)
  // Only show this if we've completed the check and user is not admin
  if (currentUser && !loading && !isAdmin && !showLogin && adminCheckComplete) {
    return (
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        style={{
          position: 'fixed',
          top: '0',
          left: '0',
          width: '100%',
          height: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 10,
          background: 'rgba(0, 0, 0, 0.95)',
        }}
      >
        <div
          style={{
            background: 'rgba(0, 255, 255, 0.1)',
            border: '1px solid rgba(0, 255, 255, 0.3)',
            borderRadius: '16px',
            padding: '40px',
            textAlign: 'center',
            maxWidth: '500px',
          }}
        >
          <Shield size={48} color="#FF0000" style={{ marginBottom: '20px' }} />
          <h2 style={{ color: '#ffffff', fontSize: '1.5rem', marginBottom: '12px' }}>
            Access Denied
          </h2>
          <p style={{ color: '#aaaaaa', fontSize: '1rem', marginBottom: '20px' }}>
            You do not have administrator privileges to access this page.
          </p>
          <p style={{ color: '#888888', fontSize: '0.85rem', marginBottom: '20px' }}>
            Redirecting in 2 seconds...
          </p>
          <button
            onClick={() => window.location.href = '/'}
            style={{
              padding: '10px 20px',
              background: 'rgba(0, 255, 255, 0.2)',
              border: '1px solid rgba(0, 255, 255, 0.3)',
              borderRadius: '8px',
              color: '#ffffff',
              cursor: 'pointer',
              fontSize: '0.9rem',
            }}
          >
            Go to Home
          </button>
        </div>
      </motion.div>
    )
  }

  // Main admin dashboard - should only reach here if user is admin, not loading, and logged in
  // Safety check - if we somehow reach here without being ready, show loading
  if (!isAdmin || loading || !currentUser) {
    console.log('[AdminView] ⚠️ Not ready for dashboard, showing loading:', { isAdmin, loading, currentUser: !!currentUser })
    return (
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        style={{
          position: 'fixed',
          top: '0',
          left: '0',
          width: '100%',
          height: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 10,
          background: 'rgba(0, 0, 0, 0.95)',
        }}
      >
        <p style={{ color: '#ffffff', fontSize: '1.2rem' }}>Loading admin data...</p>
      </motion.div>
    )
  }
  
  console.log('[AdminView] ✅ Rendering admin dashboard')

  // Main dashboard view
  const renderMainDashboard = () => (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        minHeight: '80vh',
        gap: '60px',
      }}
    >
      {/* ArkTek Logo */}
      <motion.div
        initial={{ scale: 0.9, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ duration: 0.5 }}
        style={{
          textAlign: 'center',
        }}
      >
        <h1
          style={{
            fontSize: '5rem',
            fontWeight: 'bold',
            margin: 0,
            background: 'linear-gradient(135deg, #00FFFF, #00FF00)',
            WebkitBackgroundClip: 'text',
            WebkitTextFillColor: 'transparent',
            letterSpacing: '4px',
          }}
        >
          ArkTek
        </h1>
        <p style={{ color: '#aaaaaa', fontSize: '1.2rem', marginTop: '12px' }}>
          Admin Dashboard
        </p>
      </motion.div>

      {/* Navigation Cards */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(2, 1fr)',
          gap: '32px',
          width: '100%',
          maxWidth: '800px',
        }}
      >
        {/* Users Card */}
        <motion.div
          whileHover={{ scale: 1.05, y: -5 }}
          whileTap={{ scale: 0.95 }}
          onClick={() => {
            setActiveSection('users')
            fetchAdminData()
          }}
          style={{
            background: 'rgba(0, 255, 255, 0.1)',
            border: '2px solid rgba(0, 255, 255, 0.3)',
            borderRadius: '20px',
            padding: '40px',
            cursor: 'pointer',
            transition: 'all 0.3s ease',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: '20px',
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.border = '2px solid rgba(0, 255, 255, 0.6)'
            e.currentTarget.style.background = 'rgba(0, 255, 255, 0.15)'
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.border = '2px solid rgba(0, 255, 255, 0.3)'
            e.currentTarget.style.background = 'rgba(0, 255, 255, 0.1)'
          }}
        >
          <Users size={64} color="#00FFFF" />
          <h2
            style={{
              fontSize: '1.8rem',
              color: '#ffffff',
              margin: 0,
              fontWeight: '600',
            }}
          >
            Users
          </h2>
        </motion.div>

        {/* Models & Releases Card */}
        <motion.div
          whileHover={{ scale: 1.05, y: -5 }}
          whileTap={{ scale: 0.95 }}
          onClick={() => {
            setActiveSection('models')
            fetchAdminData()
          }}
          style={{
            background: 'rgba(0, 255, 255, 0.1)',
            border: '2px solid rgba(0, 255, 255, 0.3)',
            borderRadius: '20px',
            padding: '40px',
            cursor: 'pointer',
            transition: 'all 0.3s ease',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: '20px',
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.border = '2px solid rgba(0, 255, 255, 0.6)'
            e.currentTarget.style.background = 'rgba(0, 255, 255, 0.15)'
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.border = '2px solid rgba(0, 255, 255, 0.3)'
            e.currentTarget.style.background = 'rgba(0, 255, 255, 0.1)'
          }}
        >
          <Package size={64} color="#00FFFF" />
          <h2
            style={{
              fontSize: '1.8rem',
              color: '#ffffff',
              margin: 0,
              fontWeight: '600',
            }}
          >
            Models & Releases
          </h2>
        </motion.div>

        {/* Prices Card */}
        <motion.div
          whileHover={{ scale: 1.05, y: -5 }}
          whileTap={{ scale: 0.95 }}
          onClick={() => {
            setActiveSection('prices')
            fetchAdminData()
          }}
          style={{
            background: 'rgba(0, 255, 0, 0.1)',
            border: '2px solid rgba(0, 255, 0, 0.3)',
            borderRadius: '20px',
            padding: '40px',
            cursor: 'pointer',
            transition: 'all 0.3s ease',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: '20px',
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.border = '2px solid rgba(0, 255, 0, 0.6)'
            e.currentTarget.style.background = 'rgba(0, 255, 0, 0.15)'
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.border = '2px solid rgba(0, 255, 0, 0.3)'
            e.currentTarget.style.background = 'rgba(0, 255, 0, 0.1)'
          }}
        >
          <DollarSign size={64} color="#00FF00" />
          <h2
            style={{
              fontSize: '1.8rem',
              color: '#ffffff',
              margin: 0,
              fontWeight: '600',
            }}
          >
            Prices
          </h2>
        </motion.div>

        {/* Expenses Card */}
        <motion.div
          whileHover={{ scale: 1.05, y: -5 }}
          whileTap={{ scale: 0.95 }}
          onClick={() => {
            setActiveSection('expenses')
            fetchAdminData()
          }}
          style={{
            background: 'rgba(255, 0, 0, 0.1)',
            border: '2px solid rgba(255, 0, 0, 0.3)',
            borderRadius: '20px',
            padding: '40px',
            cursor: 'pointer',
            transition: 'all 0.3s ease',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: '20px',
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.border = '2px solid rgba(255, 0, 0, 0.6)'
            e.currentTarget.style.background = 'rgba(255, 0, 0, 0.15)'
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.border = '2px solid rgba(255, 0, 0, 0.3)'
            e.currentTarget.style.background = 'rgba(255, 0, 0, 0.1)'
          }}
        >
          <Receipt size={64} color="#FF0000" />
          <h2
            style={{
              fontSize: '1.8rem',
              color: '#ffffff',
              margin: 0,
              fontWeight: '600',
            }}
          >
            Expenses
          </h2>
        </motion.div>
      </div>
    </div>
  )

  // Render admin dashboard
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      style={{
        position: 'fixed',
        top: '0',
        left: '0',
        width: '100%',
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        padding: '40px',
        overflowY: 'auto',
        zIndex: 10,
        color: '#ffffff',
        background: 'rgba(0, 0, 0, 0.95)',
      }}
    >
      <div
        style={{
          width: '100%',
          maxWidth: '1400px',
          margin: '0 auto',
        }}
      >
        {/* Back Button (if not on main page) */}
        {activeSection !== 'main' && (
          <motion.button
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            onClick={() => setActiveSection('main')}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              padding: '12px 20px',
              background: 'rgba(0, 255, 255, 0.1)',
              border: '1px solid rgba(0, 255, 255, 0.3)',
              borderRadius: '8px',
              color: '#ffffff',
              cursor: 'pointer',
              fontSize: '1rem',
              marginBottom: '30px',
              transition: 'all 0.2s ease',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = 'rgba(0, 255, 255, 0.2)'
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = 'rgba(0, 255, 255, 0.1)'
            }}
          >
            <ArrowLeft size={20} />
            Back to Main
          </motion.button>
        )}

        {/* Main Dashboard or Section Content */}
        {activeSection === 'main' ? (
          renderMainDashboard()
        ) : (
          <>
            {/* Header */}
            <div style={{ marginBottom: '40px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '16px', marginBottom: '12px' }}>
                <Shield size={40} color="#00FFFF" />
                <h1
                  style={{
                    fontSize: '2.5rem',
                    margin: 0,
                    background: 'linear-gradient(90deg, #00FFFF, #00FF00)',
                    WebkitBackgroundClip: 'text',
                    WebkitTextFillColor: 'transparent',
                  }}
                >
                  {activeSection === 'users' && 'Users'}
                  {activeSection === 'models' && 'Models & Releases'}
                  {activeSection === 'prices' && 'Prices'}
                  {activeSection === 'expenses' && 'Expenses'}
                </h1>
              </div>
              <p style={{ color: '#aaaaaa', fontSize: '1.1rem' }}>
                {activeSection === 'users' && 'Manage users and monitor usage'}
                {activeSection === 'models' && 'View available models and releases'}
                {activeSection === 'prices' && 'Manage model pricing'}
                {activeSection === 'expenses' && 'Monitor costs and expenses'}
              </p>
            </div>

            {/* Section-specific content */}
            {activeSection === 'users' && usersData && costsData && (
              <>
                {/* Stats Cards */}
                {(() => {
                  // Calculate user statistics based on status from backend
                  const totalUsers = usersData?.totalUsers || 0
                  // Count users by their status field (from backend calculation)
                  const activeUsers = usersData?.users?.filter(user => user.status === 'active').length || 0
                  const canceledUsers = usersData?.users?.filter(user => user.status === 'canceled').length || 0
                  const notActiveUsers = usersData?.users?.filter(user => user.status === 'inactive').length || 0

                  return (
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: '24px', marginBottom: '40px' }}>
                      {/* Total Users */}
                      <div
                        onClick={() => setUserFilter('all')}
                        style={{
                          background: userFilter === 'all' ? 'rgba(0, 255, 255, 0.2)' : 'rgba(0, 255, 255, 0.1)',
                          border: userFilter === 'all' ? '2px solid rgba(0, 255, 255, 0.6)' : '1px solid rgba(0, 255, 255, 0.3)',
                          borderRadius: '16px',
                          padding: '30px',
                          display: 'flex',
                          flexDirection: 'column',
                          gap: '16px',
                          cursor: 'pointer',
                          transition: 'all 0.2s',
                        }}
                        onMouseEnter={(e) => {
                          if (userFilter !== 'all') {
                            e.currentTarget.style.background = 'rgba(0, 255, 255, 0.15)'
                          }
                        }}
                        onMouseLeave={(e) => {
                          if (userFilter !== 'all') {
                            e.currentTarget.style.background = 'rgba(0, 255, 255, 0.1)'
                          }
                        }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                          <Users size={32} color="#00FFFF" />
                          <h2 style={{ fontSize: '1.2rem', color: '#ffffff', margin: 0 }}>Total Users</h2>
                        </div>
                        <p
                          style={{
                            fontSize: '3rem',
                            fontWeight: 'bold',
                            background: 'linear-gradient(90deg, #00FFFF, #00FF00)',
                            WebkitBackgroundClip: 'text',
                            WebkitTextFillColor: 'transparent',
                            margin: 0,
                          }}
                        >
                          {totalUsers}
                        </p>
                      </div>

                      {/* Active Users */}
                      <div
                        onClick={() => setUserFilter('active')}
                        style={{
                          background: userFilter === 'active' ? 'rgba(0, 255, 0, 0.2)' : 'rgba(0, 255, 0, 0.1)',
                          border: userFilter === 'active' ? '2px solid rgba(0, 255, 0, 0.6)' : '1px solid rgba(0, 255, 0, 0.3)',
                          borderRadius: '16px',
                          padding: '30px',
                          display: 'flex',
                          flexDirection: 'column',
                          gap: '16px',
                          cursor: 'pointer',
                          transition: 'all 0.2s',
                        }}
                        onMouseEnter={(e) => {
                          if (userFilter !== 'active') {
                            e.currentTarget.style.background = 'rgba(0, 255, 0, 0.15)'
                          }
                        }}
                        onMouseLeave={(e) => {
                          if (userFilter !== 'active') {
                            e.currentTarget.style.background = 'rgba(0, 255, 0, 0.1)'
                          }
                        }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                          <TrendingUp size={32} color="#00FF00" />
                          <h2 style={{ fontSize: '1.2rem', color: '#ffffff', margin: 0 }}>Active Users</h2>
                        </div>
                        <p
                          style={{
                            fontSize: '3rem',
                            fontWeight: 'bold',
                            background: 'linear-gradient(90deg, #00FFFF, #00FF00)',
                            WebkitBackgroundClip: 'text',
                            WebkitTextFillColor: 'transparent',
                            margin: 0,
                          }}
                        >
                          {activeUsers}
                        </p>
                      </div>

                      {/* Not Active Users */}
                      <div
                        onClick={() => setUserFilter('notActive')}
                        style={{
                          background: userFilter === 'notActive' ? 'rgba(255, 165, 0, 0.2)' : 'rgba(255, 165, 0, 0.1)',
                          border: userFilter === 'notActive' ? '2px solid rgba(255, 165, 0, 0.6)' : '1px solid rgba(255, 165, 0, 0.3)',
                          borderRadius: '16px',
                          padding: '30px',
                          display: 'flex',
                          flexDirection: 'column',
                          gap: '16px',
                          cursor: 'pointer',
                          transition: 'all 0.2s',
                        }}
                        onMouseEnter={(e) => {
                          if (userFilter !== 'notActive') {
                            e.currentTarget.style.background = 'rgba(255, 165, 0, 0.15)'
                          }
                        }}
                        onMouseLeave={(e) => {
                          if (userFilter !== 'notActive') {
                            e.currentTarget.style.background = 'rgba(255, 165, 0, 0.1)'
                          }
                        }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                          <User size={32} color="#FFA500" />
                          <h2 style={{ fontSize: '1.2rem', color: '#ffffff', margin: 0 }}>Not Active Users</h2>
                        </div>
                        <p
                          style={{
                            fontSize: '3rem',
                            fontWeight: 'bold',
                            background: 'linear-gradient(90deg, #00FFFF, #00FF00)',
                            WebkitBackgroundClip: 'text',
                            WebkitTextFillColor: 'transparent',
                            margin: 0,
                          }}
                        >
                          {notActiveUsers}
                        </p>
                      </div>

                      {/* Canceled Users */}
                      <div
                        onClick={() => setUserFilter('canceled')}
                        style={{
                          background: userFilter === 'canceled' ? 'rgba(255, 0, 0, 0.2)' : 'rgba(255, 0, 0, 0.1)',
                          border: userFilter === 'canceled' ? '2px solid rgba(255, 0, 0, 0.6)' : '1px solid rgba(255, 0, 0, 0.3)',
                          borderRadius: '16px',
                          padding: '30px',
                          display: 'flex',
                          flexDirection: 'column',
                          gap: '16px',
                          cursor: 'pointer',
                          transition: 'all 0.2s',
                        }}
                        onMouseEnter={(e) => {
                          if (userFilter !== 'canceled') {
                            e.currentTarget.style.background = 'rgba(255, 0, 0, 0.15)'
                          }
                        }}
                        onMouseLeave={(e) => {
                          if (userFilter !== 'canceled') {
                            e.currentTarget.style.background = 'rgba(255, 0, 0, 0.1)'
                          }
                        }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                          <Lock size={32} color="#FF0000" />
                          <h2 style={{ fontSize: '1.2rem', color: '#ffffff', margin: 0 }}>Canceled Users</h2>
                        </div>
                        <p
                          style={{
                            fontSize: '3rem',
                            fontWeight: 'bold',
                            background: 'linear-gradient(90deg, #00FFFF, #00FF00)',
                            WebkitBackgroundClip: 'text',
                            WebkitTextFillColor: 'transparent',
                            margin: 0,
                          }}
                        >
                          {canceledUsers}
                        </p>
                      </div>

                      {/* Deleted Users */}
                      <div
                        style={{
                          background: 'rgba(128, 128, 128, 0.1)',
                          border: '1px solid rgba(128, 128, 128, 0.3)',
                          borderRadius: '16px',
                          padding: '30px',
                          display: 'flex',
                          flexDirection: 'column',
                          gap: '16px',
                        }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                          <User size={32} color="#808080" />
                          <h2 style={{ fontSize: '1.2rem', color: '#ffffff', margin: 0 }}>Deleted Users</h2>
                        </div>
                        <p
                          style={{
                            fontSize: '3rem',
                            fontWeight: 'bold',
                            background: 'linear-gradient(90deg, #00FFFF, #00FF00)',
                            WebkitBackgroundClip: 'text',
                            WebkitTextFillColor: 'transparent',
                            margin: 0,
                          }}
                        >
                          {usersData?.deletedUsers || 0}
                        </p>
                      </div>
                    </div>
                  )
                })()}

                {/* Users Usage & Costs */}
                {usersData && costsData && (
          <div
            style={{
              background: 'rgba(0, 255, 255, 0.1)',
              border: '1px solid rgba(0, 255, 255, 0.3)',
              borderRadius: '16px',
              padding: '30px',
              marginBottom: '40px',
            }}
          >
            <h2 style={{ fontSize: '1.8rem', color: '#ffffff', marginBottom: '24px', display: 'flex', alignItems: 'center', gap: '12px' }}>
              <Users size={28} color="#00FFFF" />
              Users Usage & Costs ({usersData.totalUsers})
            </h2>
            
            {/* Search Bar */}
            <div style={{ marginBottom: '20px' }}>
              <div
                style={{
                  position: 'relative',
                  display: 'flex',
                  alignItems: 'center',
                }}
              >
                <Search
                  size={20}
                  color="#00FFFF"
                  style={{
                    position: 'absolute',
                    left: '16px',
                    pointerEvents: 'none',
                  }}
                />
                <input
                  type="text"
                  placeholder="Search users by name, username, or email..."
                  value={userSearchQuery}
                  onChange={(e) => setUserSearchQuery(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '12px 16px 12px 48px',
                    background: 'rgba(0, 0, 0, 0.3)',
                    border: '1px solid rgba(0, 255, 255, 0.3)',
                    borderRadius: '8px',
                    color: '#ffffff',
                    fontSize: '0.95rem',
                    outline: 'none',
                    transition: 'border-color 0.2s',
                  }}
                  onFocus={(e) => {
                    e.target.style.borderColor = 'rgba(0, 255, 255, 0.6)'
                  }}
                  onBlur={(e) => {
                    e.target.style.borderColor = 'rgba(0, 255, 255, 0.3)'
                  }}
                />
              </div>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', maxHeight: '600px', overflowY: 'auto' }}>
              {(() => {
                // Build list of users to display based on filter (using status field from backend)
                let usersToDisplay = []
                
                if (userFilter === 'active') {
                  // Show only active users (filter by status field)
                  const activeUserIds = new Set(
                    usersData.users
                      .filter(user => user.status === 'active')
                      .map(user => user.id)
                  )
                  // Get active users from costsData if they exist
                  const activeFromCosts = costsData.userCosts.filter(userCost => 
                    activeUserIds.has(userCost.userId)
                  )
                  // Get active users that don't have cost data yet
                  const activeWithoutCosts = usersData.users
                    .filter(user => user.status === 'active' && !activeFromCosts.find(uc => uc.userId === user.id))
                    .map(user => ({
                      userId: user.id,
                      firstName: user.firstName,
                      lastName: user.lastName,
                      username: user.username,
                      email: user.email,
                      totalTokens: 0,
                      totalQueries: 0,
                      totalPrompts: 0,
                      cost: 0,
                      modelCosts: {},
                    }))
                  usersToDisplay = [...activeFromCosts, ...activeWithoutCosts]
                } else if (userFilter === 'notActive') {
                  // Show only inactive users (filter by status field)
                  const inactiveUserIds = new Set(
                    usersData.users
                      .filter(user => user.status === 'inactive')
                      .map(user => user.id)
                  )
                  // Get inactive users from costsData if they exist
                  const inactiveFromCosts = costsData.userCosts.filter(userCost => 
                    inactiveUserIds.has(userCost.userId)
                  )
                  // Get inactive users that don't have cost data
                  const inactiveWithoutCosts = usersData.users
                    .filter(user => user.status === 'inactive' && !inactiveFromCosts.find(uc => uc.userId === user.id))
                    .map(user => ({
                      userId: user.id,
                      firstName: user.firstName,
                      lastName: user.lastName,
                      username: user.username,
                      email: user.email,
                      totalTokens: 0,
                      totalQueries: 0,
                      totalPrompts: 0,
                      cost: 0,
                      modelCosts: {},
                    }))
                  usersToDisplay = [...inactiveFromCosts, ...inactiveWithoutCosts]
                } else if (userFilter === 'canceled') {
                  // Show only canceled users (filter by status field)
                  const canceledUserIds = new Set(
                    usersData.users
                      .filter(user => user.status === 'canceled')
                      .map(user => user.id)
                  )
                  // Get canceled users from costsData if they exist
                  const canceledFromCosts = costsData.userCosts.filter(userCost => 
                    canceledUserIds.has(userCost.userId)
                  )
                  // Get canceled users that don't have cost data yet
                  const canceledWithoutCosts = usersData.users
                    .filter(user => user.status === 'canceled' && !canceledFromCosts.find(uc => uc.userId === user.id))
                    .map(user => ({
                      userId: user.id,
                      firstName: user.firstName,
                      lastName: user.lastName,
                      username: user.username,
                      email: user.email,
                      totalTokens: 0,
                      totalQueries: 0,
                      totalPrompts: 0,
                      cost: 0,
                      modelCosts: {},
                    }))
                  usersToDisplay = [...canceledFromCosts, ...canceledWithoutCosts]
                } else if (userFilter === 'all') {
                  // Show all users (active, inactive, and canceled)
                  const allUserIds = new Set(usersData.users.map(u => u.id))
                  const costUserIds = new Set(costsData.userCosts.map(uc => uc.userId))
                  
                  // Combine users from costsData and usersData
                  usersToDisplay = usersData.users.map(user => {
                    const userCost = costsData.userCosts.find(uc => uc.userId === user.id)
                    if (userCost) {
                      return userCost
                    } else {
                      // User doesn't have cost data, create a placeholder
                      return {
                        userId: user.id,
                        firstName: user.firstName,
                        lastName: user.lastName,
                        username: user.username,
                        email: user.email,
                        totalTokens: 0,
                        totalQueries: 0,
                        totalPrompts: 0,
                        cost: 0,
                        modelCosts: {},
                      }
                    }
                  })
                } else {
                  // Default: Show all users (active users from costsData)
                  usersToDisplay = costsData.userCosts
                }
                
                const filteredUsers = usersToDisplay.filter((userCost) => {
                  // Apply search filter
                  if (!userSearchQuery.trim()) return true
                  const searchLower = userSearchQuery.toLowerCase()
                  const fullName = `${userCost.firstName} ${userCost.lastName}`.toLowerCase()
                  const username = userCost.username?.toLowerCase() || ''
                  const email = userCost.email?.toLowerCase() || ''
                  return (
                    fullName.includes(searchLower) ||
                    username.includes(searchLower) ||
                    email.includes(searchLower)
                  )
                })
                
                return filteredUsers.map((userCost) => {
                  const user = usersData.users.find(u => u.id === userCost.userId) || {}
                  const isExpanded = expandedUsers[userCost.userId]
                  // Get status from user object (from backend) - backend calculates based on last month activity
                  const userStatus = user.status || 'inactive'
                  return (
                    <div
                      key={userCost.userId}
                      style={{
                        background: 'rgba(0, 255, 255, 0.05)',
                        border: '1px solid rgba(0, 255, 255, 0.2)',
                        borderRadius: '12px',
                        overflow: 'hidden',
                      }}
                    >
                    {/* User Header */}
                    <div
                      onClick={() => {
                        const newExpanded = !isExpanded
                        setExpandedUsers((prev) => ({
                          ...prev,
                          [userCost.userId]: newExpanded,
                        }))
                        if (newExpanded) {
                          fetchUserStats(userCost.userId)
                        }
                      }}
                      style={{
                        padding: '16px 20px',
                        cursor: 'pointer',
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        transition: 'background 0.2s',
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.background = 'rgba(0, 255, 255, 0.1)'
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.background = 'rgba(0, 255, 255, 0.05)'
                      }}
                    >
                      <div style={{ flex: 1 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '4px' }}>
                          <p style={{ color: '#ffffff', fontSize: '1rem', fontWeight: '600', margin: 0 }}>
                            {userCost.firstName} {userCost.lastName}
                          </p>
                          {user?.isAdmin && (
                            <span
                              style={{
                                background: 'rgba(0, 255, 0, 0.2)',
                                border: '1px solid rgba(0, 255, 0, 0.5)',
                                borderRadius: '4px',
                                padding: '2px 8px',
                                fontSize: '0.75rem',
                                color: '#00FF00',
                                fontWeight: '600',
                              }}
                            >
                              ADMIN
                            </span>
                          )}
                          <span
                            style={{
                              background: userStatus === 'active' ? 'rgba(0, 255, 0, 0.2)' : userStatus === 'canceled' ? 'rgba(255, 0, 0, 0.2)' : 'rgba(255, 165, 0, 0.2)',
                              border: userStatus === 'active' ? '1px solid rgba(0, 255, 0, 0.5)' : userStatus === 'canceled' ? '1px solid rgba(255, 0, 0, 0.5)' : '1px solid rgba(255, 165, 0, 0.5)',
                              borderRadius: '4px',
                              padding: '2px 8px',
                              fontSize: '0.75rem',
                              color: userStatus === 'active' ? '#00FF00' : userStatus === 'canceled' ? '#FF0000' : '#FFA500',
                              fontWeight: '600',
                              textTransform: 'capitalize',
                            }}
                          >
                            {userStatus}
                          </span>
                        </div>
                        <p style={{ color: '#aaaaaa', fontSize: '0.85rem', margin: '4px 0' }}>
                          @{userCost.username} • {userCost.email}
                        </p>
                        {(user?.lastActiveDate || user?.lastLoginDate) && (
                          <p style={{ color: '#888888', fontSize: '0.75rem', margin: '4px 0 0 0' }}>
                            {user?.lastActiveDate 
                              ? `Last Active: ${new Date(user.lastActiveDate).toLocaleString()}`
                              : user?.lastLoginDate 
                                ? `Last Login: ${new Date(user.lastLoginDate).toLocaleString()}`
                                : 'Never active'
                            }
                          </p>
                        )}
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                        {/* User Usage Summary */}
                        <div style={{ display: 'flex', gap: '16px', alignItems: 'center' }}>
                          <div style={{ textAlign: 'right' }}>
                            <p style={{ color: '#aaaaaa', fontSize: '0.7rem', margin: '0 0 2px 0' }}>Total Queries</p>
                            <p style={{ color: '#00FFFF', fontSize: '1rem', fontWeight: 'bold', margin: 0 }}>
                              {formatNumber(userCost.totalQueries || 0)}
                            </p>
                          </div>
                          <div style={{ textAlign: 'right' }}>
                            <p style={{ color: '#aaaaaa', fontSize: '0.7rem', margin: '0 0 2px 0' }}>Total Tokens</p>
                            <p style={{ color: '#00FFFF', fontSize: '1rem', fontWeight: 'bold', margin: 0 }}>
                              {formatTokens(userCost.totalTokens || 0)}
                            </p>
                          </div>
                          <div style={{ textAlign: 'right' }}>
                            <p style={{ color: '#aaaaaa', fontSize: '0.7rem', margin: '0 0 2px 0' }}>Total API Cost</p>
                            <p style={{ color: '#FFD700', fontSize: '1rem', fontWeight: 'bold', margin: 0 }}>
                              ${(userCost.cost || 0).toFixed(2)}
                            </p>
                          </div>
                          <div style={{ textAlign: 'right' }}>
                            <p style={{ color: '#aaaaaa', fontSize: '0.7rem', margin: '0 0 2px 0' }}>End of Month Price</p>
                            <p
                              style={{
                                color: (userCost.cost || 0) > 5.00 ? '#ff6b6b' : '#00FF00',
                                fontSize: '1rem',
                                fontWeight: 'bold',
                                margin: 0,
                              }}
                            >
                              ${Math.max(0, ((userCost.cost || 0) - 5.00).toFixed(2))}
                            </p>
                          </div>
                        </div>
                        <span style={{ color: '#888888', fontSize: '0.75rem' }}>
                          {isExpanded ? '▼' : '▶'} View Details
                        </span>
                      </div>
                    </div>

                    {/* User Stats Details */}
                    {isExpanded && (
                      <div style={{ padding: '20px', borderTop: '1px solid rgba(0, 255, 255, 0.2)', background: 'rgba(0, 0, 0, 0.2)' }}>
                        {loadingUserStats[userCost.userId] ? (
                          <div style={{ textAlign: 'center', padding: '40px' }}>
                            <p style={{ color: '#aaaaaa', fontSize: '1rem' }}>Loading statistics...</p>
                          </div>
                        ) : userStatsData[userCost.userId] ? (
                          (() => {
                            const stats = userStatsData[userCost.userId]
                            
                            return (
                              <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
                                {/* Overview Stats */}
                                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: '16px' }}>
                                  <div style={{ background: 'rgba(0, 255, 255, 0.05)', padding: '16px', borderRadius: '8px', textAlign: 'center' }}>
                                    <p style={{ color: '#aaaaaa', fontSize: '0.75rem', margin: '0 0 8px 0' }}>Total Tokens</p>
                                    <p style={{ color: '#00FFFF', fontSize: '1.5rem', fontWeight: 'bold', margin: 0 }}>
                                      {formatTokens(stats.totalTokens || 0)}
                                    </p>
                                  </div>
                                  <div style={{ background: 'rgba(0, 255, 255, 0.05)', padding: '16px', borderRadius: '8px', textAlign: 'center' }}>
                                    <p style={{ color: '#aaaaaa', fontSize: '0.75rem', margin: '0 0 8px 0' }}>Input Tokens</p>
                                    <p style={{ color: '#00FFFF', fontSize: '1.5rem', fontWeight: 'bold', margin: 0 }}>
                                      {formatTokens(stats.totalInputTokens || 0)}
                                    </p>
                                  </div>
                                  <div style={{ background: 'rgba(0, 255, 255, 0.05)', padding: '16px', borderRadius: '8px', textAlign: 'center' }}>
                                    <p style={{ color: '#aaaaaa', fontSize: '0.75rem', margin: '0 0 8px 0' }}>Output Tokens</p>
                                    <p style={{ color: '#00FFFF', fontSize: '1.5rem', fontWeight: 'bold', margin: 0 }}>
                                      {formatTokens(stats.totalOutputTokens || 0)}
                                    </p>
                                  </div>
                                  <div style={{ background: 'rgba(0, 255, 255, 0.05)', padding: '16px', borderRadius: '8px', textAlign: 'center' }}>
                                    <p style={{ color: '#aaaaaa', fontSize: '0.75rem', margin: '0 0 8px 0' }}>Total Prompts</p>
                                    <p style={{ color: '#00FF00', fontSize: '1.5rem', fontWeight: 'bold', margin: 0 }}>
                                      {formatNumber(stats.totalPrompts || 0)}
                                    </p>
                                  </div>
                                  <div style={{ background: 'rgba(0, 255, 255, 0.05)', padding: '16px', borderRadius: '8px', textAlign: 'center' }}>
                                    <p style={{ color: '#aaaaaa', fontSize: '0.75rem', margin: '0 0 8px 0' }}>Total Queries</p>
                                    <p style={{ color: '#00FF00', fontSize: '1.5rem', fontWeight: 'bold', margin: 0 }}>
                                      {formatNumber(stats.totalQueries || 0)}
                                    </p>
                                  </div>
                                </div>

                                {/* Monthly Stats */}
                                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: '16px' }}>
                                  <div style={{ background: 'rgba(0, 255, 0, 0.05)', padding: '16px', borderRadius: '8px', textAlign: 'center' }}>
                                    <p style={{ color: '#aaaaaa', fontSize: '0.75rem', margin: '0 0 8px 0' }}>Monthly Tokens</p>
                                    <p style={{ color: '#00FF00', fontSize: '1.5rem', fontWeight: 'bold', margin: 0 }}>
                                      {formatTokens(stats.monthlyTokens || 0)}
                                    </p>
                                  </div>
                                  <div style={{ background: 'rgba(0, 255, 0, 0.05)', padding: '16px', borderRadius: '8px', textAlign: 'center' }}>
                                    <p style={{ color: '#aaaaaa', fontSize: '0.75rem', margin: '0 0 8px 0' }}>Monthly Input</p>
                                    <p style={{ color: '#00FF00', fontSize: '1.5rem', fontWeight: 'bold', margin: 0 }}>
                                      {formatTokens(stats.monthlyInputTokens || 0)}
                                    </p>
                                  </div>
                                  <div style={{ background: 'rgba(0, 255, 0, 0.05)', padding: '16px', borderRadius: '8px', textAlign: 'center' }}>
                                    <p style={{ color: '#aaaaaa', fontSize: '0.75rem', margin: '0 0 8px 0' }}>Monthly Output</p>
                                    <p style={{ color: '#00FF00', fontSize: '1.5rem', fontWeight: 'bold', margin: 0 }}>
                                      {formatTokens(stats.monthlyOutputTokens || 0)}
                                    </p>
                                  </div>
                                  <div style={{ background: 'rgba(0, 255, 0, 0.05)', padding: '16px', borderRadius: '8px', textAlign: 'center' }}>
                                    <p style={{ color: '#aaaaaa', fontSize: '0.75rem', margin: '0 0 8px 0' }}>Monthly Prompts</p>
                                    <p style={{ color: '#00FF00', fontSize: '1.5rem', fontWeight: 'bold', margin: 0 }}>
                                      {formatNumber(stats.monthlyPrompts || 0)}
                                    </p>
                                  </div>
                                  <div style={{ background: 'rgba(0, 255, 0, 0.05)', padding: '16px', borderRadius: '8px', textAlign: 'center' }}>
                                    <p style={{ color: '#aaaaaa', fontSize: '0.75rem', margin: '0 0 8px 0' }}>Monthly Queries</p>
                                    <p style={{ color: '#00FF00', fontSize: '1.5rem', fontWeight: 'bold', margin: 0 }}>
                                      {formatNumber(stats.monthlyQueries || 0)}
                                    </p>
                                  </div>
                                </div>

                                {/* Provider Breakdown */}
                                {Object.keys(stats.providers || {}).length > 0 && (
                                  <div>
                                    <h3 style={{ color: '#00FFFF', fontSize: '1rem', marginBottom: '12px', fontWeight: '600', display: 'flex', alignItems: 'center', gap: '8px' }}>
                                      <BarChart3 size={20} />
                                      Provider Statistics
                                    </h3>
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                      {Object.entries(stats.providers)
                                        .sort((a, b) => b[1].totalQueries - a[1].totalQueries)
                                        .map(([provider, data]) => {
                                          const providerKey = `${userCost.userId}-${provider}`
                                          const isProviderExpanded = expandedUserProviders[providerKey]
                                          const providerModels = Object.entries(stats.models || {})
                                            .filter(([modelKey]) => modelKey.startsWith(`${provider}-`))
                                          
                                          return (
                                            <div
                                              key={provider}
                                              style={{
                                                background: 'rgba(0, 255, 255, 0.05)',
                                                border: '1px solid rgba(0, 255, 255, 0.2)',
                                                borderRadius: '8px',
                                                overflow: 'hidden',
                                              }}
                                            >
                                              <div
                                                onClick={() => {
                                                  setExpandedUserProviders(prev => ({ ...prev, [providerKey]: !prev[providerKey] }))
                                                }}
                                                style={{
                                                  padding: '12px 16px',
                                                  cursor: 'pointer',
                                                  display: 'flex',
                                                  justifyContent: 'space-between',
                                                  alignItems: 'center',
                                                }}
                                              >
                                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                                  {isProviderExpanded ? <ChevronDown size={16} color="#00FFFF" /> : <ChevronRight size={16} color="#00FFFF" />}
                                                  <span style={{ color: '#00FFFF', fontSize: '0.9rem', textTransform: 'capitalize' }}>{provider}</span>
                                                </div>
                                                <div style={{ display: 'flex', gap: '16px' }}>
                                                  <span style={{ color: '#aaaaaa', fontSize: '0.75rem' }}>Tokens: {formatTokens(data.totalTokens)}</span>
                                                  <span style={{ color: '#aaaaaa', fontSize: '0.75rem' }}>Queries: {formatNumber(data.totalQueries)}</span>
                                                </div>
                                              </div>
                                              {isProviderExpanded && providerModels.length > 0 && (
                                                <div style={{ padding: '12px 16px 12px 32px', borderTop: '1px solid rgba(0, 255, 255, 0.2)' }}>
                                                  {providerModels.map(([modelKey, modelData]) => (
                                                    <div
                                                      key={modelKey}
                                                      style={{
                                                        background: 'rgba(0, 255, 255, 0.03)',
                                                        padding: '8px 12px',
                                                        borderRadius: '6px',
                                                        marginBottom: '6px',
                                                        display: 'flex',
                                                        justifyContent: 'space-between',
                                                      }}
                                                    >
                                                      <span style={{ color: '#cccccc', fontSize: '0.85rem' }}>{modelData.model}</span>
                                                      <div style={{ display: 'flex', gap: '12px' }}>
                                                        <span style={{ color: '#aaaaaa', fontSize: '0.75rem' }}>Tokens: {formatTokens(modelData.totalTokens || 0)}</span>
                                                        <span style={{ color: '#aaaaaa', fontSize: '0.75rem' }}>Queries: {formatNumber(modelData.totalQueries || 0)}</span>
                                                      </div>
                                                    </div>
                                                  ))}
                                                </div>
                                              )}
                                            </div>
                                          )
                                        })}
                                    </div>
                                  </div>
                                )}

                                {/* Cost Information */}
                                {userCost.cost > 0 && (
                                  <div style={{ background: 'rgba(0, 255, 0, 0.1)', padding: '16px', borderRadius: '8px', border: '1px solid rgba(0, 255, 0, 0.3)' }}>
                                    <h3 style={{ color: '#00FF00', fontSize: '1rem', marginBottom: '12px', fontWeight: '600' }}>
                                      Total Cost: {formatCurrency(userCost.cost)}
                                    </h3>
                                    {Object.keys(userCost.modelCosts || {}).length > 0 && (
                                      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                        {Object.entries(userCost.modelCosts).map(([modelKey, modelCost]) => (
                                          <div
                                            key={modelKey}
                                            style={{
                                              display: 'flex',
                                              justifyContent: 'space-between',
                                              padding: '8px 12px',
                                              background: 'rgba(0, 255, 0, 0.05)',
                                              borderRadius: '6px',
                                            }}
                                          >
                                            <span style={{ color: '#cccccc', fontSize: '0.85rem' }}>
                                              {modelCost.provider} - {modelCost.model}
                                            </span>
                                            <span style={{ color: '#00FF00', fontSize: '0.9rem', fontWeight: 'bold' }}>
                                              {formatCurrency(modelCost.cost)}
                                            </span>
                                          </div>
                                        ))}
                                      </div>
                                    )}
                                  </div>
                                )}
                              </div>
                            )
                          })()
                        ) : (
                          <div style={{ textAlign: 'center', padding: '40px' }}>
                            <p style={{ color: '#aaaaaa', fontSize: '1rem' }}>No statistics available</p>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                  )
                })
              })()}
            </div>
          </div>
                )}
              </>
            )}

            {/* Models & Releases Section */}
            {activeSection === 'models' && (
              <div
                style={{
                  background: 'rgba(0, 255, 255, 0.1)',
                  border: '1px solid rgba(0, 255, 255, 0.3)',
                  borderRadius: '16px',
                  padding: '30px',
                }}
              >
                <h2 style={{ fontSize: '1.8rem', color: '#ffffff', marginBottom: '24px', display: 'flex', alignItems: 'center', gap: '12px' }}>
                  <Package size={28} color="#00FFFF" />
                  Models & Releases
                </h2>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                  {Object.entries(LLM_PROVIDERS).map(([providerKey, provider]) => {
                    const isExpanded = expandedProviders[providerKey]
                    return (
                      <div
                        key={providerKey}
                        style={{
                          background: 'rgba(0, 255, 255, 0.05)',
                          border: '1px solid rgba(0, 255, 255, 0.2)',
                          borderRadius: '12px',
                          overflow: 'hidden',
                        }}
                      >
                        {/* Provider Header */}
                        <div
                          onClick={() => {
                            setExpandedProviders((prev) => ({
                              ...prev,
                              [providerKey]: !prev[providerKey],
                            }))
                          }}
                          style={{
                            padding: '16px 20px',
                            cursor: 'pointer',
                            display: 'flex',
                            justifyContent: 'space-between',
                            alignItems: 'center',
                            transition: 'background 0.2s',
                          }}
                          onMouseEnter={(e) => {
                            e.currentTarget.style.background = 'rgba(0, 255, 255, 0.1)'
                          }}
                          onMouseLeave={(e) => {
                            e.currentTarget.style.background = 'rgba(0, 255, 255, 0.05)'
                          }}
                        >
                          <h3 style={{ fontSize: '1.1rem', color: '#00FFFF', margin: 0 }}>
                            {provider.name}
                          </h3>
                          <span style={{ color: '#888888', fontSize: '0.85rem' }}>
                            {provider.models.length} models
                            {isExpanded ? ' ▲' : ' ▼'}
                          </span>
                        </div>

                        {/* Models List */}
                        {isExpanded && (
                          <div style={{ padding: '12px 20px 20px 20px', borderTop: '1px solid rgba(0, 255, 255, 0.2)' }}>
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '12px' }}>
                              {provider.models.map((model) => (
                                <div
                                  key={model.id}
                                  style={{
                                    background: 'rgba(0, 255, 255, 0.03)',
                                    border: '1px solid rgba(0, 255, 255, 0.15)',
                                    borderRadius: '8px',
                                    padding: '16px',
                                    display: 'grid',
                                    gridTemplateColumns: '2fr 1fr 1fr',
                                    gap: '16px',
                                    alignItems: 'center',
                                  }}
                                >
                                  {/* Current Model */}
                                  <div>
                                    <p style={{ color: '#888888', fontSize: '0.75rem', margin: '0 0 4px 0' }}>Current Model</p>
                                    <p style={{ color: '#ffffff', fontSize: '1rem', fontWeight: '500', margin: 0 }}>
                                      {model.id}
                                    </p>
                                    <p style={{ color: '#aaaaaa', fontSize: '0.8rem', margin: '4px 0 0 0' }}>
                                      {model.label} ({model.type})
                                    </p>
                                  </div>

                                  {/* Replacement Model Placeholder */}
                                  <div
                                    style={{
                                      background: 'rgba(0, 255, 0, 0.05)',
                                      border: '1px dashed rgba(0, 255, 0, 0.3)',
                                      borderRadius: '8px',
                                      padding: '12px',
                                      minHeight: '60px',
                                      display: 'flex',
                                      flexDirection: 'column',
                                      justifyContent: 'center',
                                    }}
                                  >
                                    <p style={{ color: '#888888', fontSize: '0.7rem', margin: '0 0 4px 0' }}>Replacement Model</p>
                                    <p style={{ color: '#aaaaaa', fontSize: '0.85rem', margin: 0, fontStyle: 'italic' }}>
                                      TBD
                                    </p>
                                  </div>

                                  {/* Release Date Placeholder */}
                                  <div
                                    style={{
                                      background: 'rgba(255, 165, 0, 0.05)',
                                      border: '1px dashed rgba(255, 165, 0, 0.3)',
                                      borderRadius: '8px',
                                      padding: '12px',
                                      minHeight: '60px',
                                      display: 'flex',
                                      flexDirection: 'column',
                                      justifyContent: 'center',
                                    }}
                                  >
                                    <p style={{ color: '#888888', fontSize: '0.7rem', margin: '0 0 4px 0' }}>Release Date</p>
                                    <p style={{ color: '#aaaaaa', fontSize: '0.85rem', margin: 0, fontStyle: 'italic' }}>
                                      TBD
                                    </p>
                                  </div>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
              </div>
            )}

            {/* Model Pricing */}
            {activeSection === 'prices' && pricingData && (
              <div
                style={{
                  background: 'rgba(0, 255, 255, 0.1)',
                  border: '1px solid rgba(0, 255, 255, 0.3)',
                  borderRadius: '16px',
                  padding: '30px',
                }}
              >
            <h2 style={{ fontSize: '1.8rem', color: '#ffffff', marginBottom: '24px', display: 'flex', alignItems: 'center', gap: '12px' }}>
              <DollarSign size={28} color="#00FFFF" />
              Model Pricing (per 1M tokens)
            </h2>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              {Object.entries(pricingData).map(([providerKey, providerData]) => {
                const isExpanded = expandedProviders[providerKey]
                
                // Handle Serper query tiers differently
                if (providerData.queryTiers) {
                  return (
                    <div
                      key={providerKey}
                      style={{
                        background: 'rgba(0, 255, 255, 0.05)',
                        border: '1px solid rgba(0, 255, 255, 0.2)',
                        borderRadius: '12px',
                        overflow: 'hidden',
                      }}
                    >
                      {/* Provider Header */}
                      <div
                        onClick={() => {
                          setExpandedProviders((prev) => ({
                            ...prev,
                            [providerKey]: !prev[providerKey],
                          }))
                        }}
                        style={{
                          padding: '16px 20px',
                          cursor: 'pointer',
                          display: 'flex',
                          justifyContent: 'space-between',
                          alignItems: 'center',
                          transition: 'background 0.2s',
                        }}
                        onMouseEnter={(e) => {
                          e.currentTarget.style.background = 'rgba(0, 255, 255, 0.1)'
                        }}
                        onMouseLeave={(e) => {
                          e.currentTarget.style.background = 'rgba(0, 255, 255, 0.05)'
                        }}
                      >
                        <h3 style={{ fontSize: '1.1rem', color: '#00FFFF', margin: 0, textTransform: 'capitalize' }}>
                          {providerData.name}
                        </h3>
                        <span style={{ color: '#888888', fontSize: '0.85rem' }}>
                          {providerData.queryTiers.length} tiers
                          {isExpanded ? ' ▲' : ' ▼'}
                        </span>
                      </div>

                      {/* Query Tiers List */}
                      {isExpanded && (
                        <div style={{ padding: '12px 20px 20px 20px', borderTop: '1px solid rgba(0, 255, 255, 0.2)' }}>
                          <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '8px' }}>
                            {providerData.queryTiers.map((tier, index) => (
                              <div
                                key={index}
                                style={{
                                  background: 'rgba(0, 255, 255, 0.03)',
                                  border: '1px solid rgba(0, 255, 255, 0.15)',
                                  borderRadius: '8px',
                                  padding: '12px 16px',
                                  display: 'flex',
                                  justifyContent: 'space-between',
                                  alignItems: 'center',
                                }}
                              >
                                <div>
                                  <p style={{ color: '#ffffff', fontSize: '0.95rem', fontWeight: '500', margin: 0 }}>
                                    {tier.note || `${tier.credits.toLocaleString()} credits`}
                                  </p>
                                </div>
                                <div style={{ textAlign: 'right' }}>
                                  <p style={{ color: '#aaaaaa', fontSize: '0.75rem', margin: 0 }}>Price per 1k credits</p>
                                  <p style={{ color: '#00FFFF', fontSize: '1rem', fontWeight: 'bold', margin: 0 }}>
                                    ${tier.pricePer1k.toFixed(2)}
                                  </p>
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  )
                }
                
                // Regular model providers
                return (
                  <div
                    key={providerKey}
                    style={{
                      background: 'rgba(0, 255, 255, 0.05)',
                      border: '1px solid rgba(0, 255, 255, 0.2)',
                      borderRadius: '12px',
                      overflow: 'hidden',
                    }}
                  >
                    {/* Provider Header */}
                    <div
                      onClick={() => {
                        setExpandedProviders((prev) => ({
                          ...prev,
                          [providerKey]: !prev[providerKey],
                        }))
                      }}
                      style={{
                        padding: '16px 20px',
                        cursor: 'pointer',
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        transition: 'background 0.2s',
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.background = 'rgba(0, 255, 255, 0.1)'
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.background = 'rgba(0, 255, 255, 0.05)'
                      }}
                    >
                      <h3 style={{ fontSize: '1.1rem', color: '#00FFFF', margin: 0, textTransform: 'capitalize' }}>
                        {providerData.name}
                      </h3>
                      <span style={{ color: '#888888', fontSize: '0.85rem' }}>
                        {providerData.models ? Object.keys(providerData.models).length : 0} models
                        {isExpanded ? ' ▲' : ' ▼'}
                      </span>
                    </div>

                    {/* Models List */}
                    {isExpanded && providerData.models && (
                      <div style={{ padding: '12px 20px 20px 20px', borderTop: '1px solid rgba(0, 255, 255, 0.2)' }}>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '8px' }}>
                          {Object.entries(providerData.models).map(([modelName, pricing]) => (
                            <div
                              key={modelName}
                              style={{
                                background: 'rgba(0, 255, 255, 0.03)',
                                border: '1px solid rgba(0, 255, 255, 0.15)',
                                borderRadius: '8px',
                                padding: '12px 16px',
                                display: 'flex',
                                justifyContent: 'space-between',
                                alignItems: 'center',
                              }}
                            >
                              <div>
                                <p style={{ color: '#ffffff', fontSize: '0.95rem', fontWeight: '500', margin: 0 }}>
                                  {modelName}
                                </p>
                                {pricing.note && (
                                  <p style={{ color: '#888888', fontSize: '0.75rem', margin: '4px 0 0 0' }}>
                                    {pricing.note}
                                  </p>
                                )}
                              </div>
                              <div style={{ display: 'flex', gap: '24px', alignItems: 'center' }}>
                                <div style={{ textAlign: 'right' }}>
                                  <p style={{ color: '#aaaaaa', fontSize: '0.75rem', margin: '0 0 4px 0' }}>Input</p>
                                  <input
                                    type="text"
                                    defaultValue={pricing.input !== null && pricing.input !== undefined ? pricing.input.toFixed(2) : '0.10'}
                                    placeholder="0.10"
                                    style={{
                                      background: 'rgba(0, 255, 255, 0.1)',
                                      border: '1px solid rgba(0, 255, 255, 0.3)',
                                      borderRadius: '6px',
                                      padding: '6px 10px',
                                      color: '#00FFFF',
                                      fontSize: '1rem',
                                      fontWeight: 'bold',
                                      width: '80px',
                                      textAlign: 'right',
                                    }}
                                  />
                                </div>
                                <div style={{ textAlign: 'right' }}>
                                  <p style={{ color: '#aaaaaa', fontSize: '0.75rem', margin: '0 0 4px 0' }}>Cache</p>
                                  <input
                                    type="text"
                                    defaultValue={pricing.cachedInput !== null && pricing.cachedInput !== undefined ? pricing.cachedInput.toFixed(2) : ''}
                                    placeholder="TBD"
                                    style={{
                                      background: 'rgba(255, 170, 0, 0.1)',
                                      border: '1px solid rgba(255, 170, 0, 0.3)',
                                      borderRadius: '6px',
                                      padding: '6px 10px',
                                      color: '#FFAA00',
                                      fontSize: '1rem',
                                      fontWeight: 'bold',
                                      width: '80px',
                                      textAlign: 'right',
                                    }}
                                  />
                                </div>
                                <div style={{ textAlign: 'right' }}>
                                  <p style={{ color: '#aaaaaa', fontSize: '0.75rem', margin: '0 0 4px 0' }}>Output</p>
                                  <input
                                    type="text"
                                    defaultValue={pricing.output !== null && pricing.output !== undefined ? pricing.output.toFixed(2) : '0.40'}
                                    placeholder="0.40"
                                    style={{
                                      background: 'rgba(0, 255, 0, 0.1)',
                                      border: '1px solid rgba(0, 255, 0, 0.3)',
                                      borderRadius: '6px',
                                      padding: '6px 10px',
                                      color: '#00FF00',
                                      fontSize: '1rem',
                                      fontWeight: 'bold',
                                      width: '80px',
                                      textAlign: 'right',
                                    }}
                                  />
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          </div>
            )}

            {/* Expenses Section */}
            {activeSection === 'expenses' && costsData && (
              <div
                style={{
                  background: 'rgba(255, 165, 0, 0.1)',
                  border: '1px solid rgba(255, 165, 0, 0.3)',
                  borderRadius: '16px',
                  padding: '30px',
                }}
              >
                <h2 style={{ fontSize: '1.8rem', color: '#ffffff', marginBottom: '24px', display: 'flex', alignItems: 'center', gap: '12px' }}>
                  <TrendingUp size={28} color="#FFA500" />
                  Expenses
                </h2>
                <p style={{ color: '#aaaaaa', fontSize: '1rem' }}>
                  Expense tracking and cost analysis will be available here.
                </p>
              </div>
            )}
          </>
        )}
      </div>
    </motion.div>
  )
}

export default AdminView

