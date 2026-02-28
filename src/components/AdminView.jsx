import React, { useEffect, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Users, DollarSign, Shield, TrendingUp, Database, CreditCard, Lock, User, Package, Receipt, ArrowLeft, Search, ChevronDown, ChevronRight, ChevronLeft, BarChart3, MessageSquare, Award, Trophy } from 'lucide-react'
import { useStore } from '../store/useStore'
import api from '../utils/api'
import { API_URL } from '../utils/config'
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
  const [expenses, setExpenses] = useState({
    stripeFees: '',
    openaiCost: '',
    anthropicCost: '',
    googleCost: '',
    xaiCost: '',
    serperCost: '',
    resendCost: '',
    mongoDbCost: '',
    vercelCost: '',
    domainCost: '',
  })
  const [expenseMonth, setExpenseMonth] = useState(() => {
    const now = new Date()
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
  })
  const [expensesLoaded, setExpensesLoaded] = useState(false)
  const [expensesSaving, setExpensesSaving] = useState(false)
  const [expenseSaveTimer, setExpenseSaveTimer] = useState(null)
  const [revenueData, setRevenueData] = useState(null)
  const [loadingRevenue, setLoadingRevenue] = useState(false)
  const [timePeriod, setTimePeriod] = useState('month')
  const [periodDropdownOpen, setPeriodDropdownOpen] = useState(false)
  const [referenceDate, setReferenceDate] = useState(() => {
    const now = new Date()
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
  })
  const [aggregatedExpenses, setAggregatedExpenses] = useState(null)
  const [loadingAggExpenses, setLoadingAggExpenses] = useState(false)
  const [expensesSubSection, setExpensesSubSection] = useState(null)
  const [userListTab, setUserListTab] = useState(null)
  const [userListVisibleCount, setUserListVisibleCount] = useState({ active: 5, freeTrial: 5, inactive: 5 })
  const [revenueListOpen, setRevenueListOpen] = useState({})
  const [revenueListVisible, setRevenueListVisible] = useState({})

  const periodOptions = [
    { value: 'day', label: 'Day' },
    { value: 'week', label: 'Week' },
    { value: 'month', label: 'Month' },
    { value: 'quarter', label: 'Quarter' },
    { value: 'year', label: 'Year' },
    { value: 'all', label: 'All Time' },
  ]

  const getPeriodLabel = () => {
    const ref = new Date(referenceDate + 'T00:00:00')
    switch (timePeriod) {
      case 'day': return ref.toLocaleDateString('en-US', { weekday: 'short', month: 'long', day: 'numeric', year: 'numeric' })
      case 'week': {
        const dow = ref.getDay()
        const diff = dow === 0 ? 6 : dow - 1
        const monday = new Date(ref)
        monday.setDate(ref.getDate() - diff)
        const sunday = new Date(monday)
        sunday.setDate(monday.getDate() + 6)
        return `${monday.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} – ${sunday.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`
      }
      case 'month': return ref.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
      case 'quarter': {
        const q = Math.ceil((ref.getMonth() + 1) / 3)
        const qStart = new Date(ref.getFullYear(), (q - 1) * 3, 1)
        const qEnd = new Date(ref.getFullYear(), q * 3 - 1, 1)
        return `Q${q} ${ref.getFullYear()} (${qStart.toLocaleDateString('en-US', { month: 'short' })} – ${qEnd.toLocaleDateString('en-US', { month: 'short' })})`
      }
      case 'year': return `${ref.getFullYear()}`
      case 'all': return 'All Time'
      default: return ''
    }
  }

  const shiftPeriod = (direction) => {
    if (timePeriod === 'all') return
    const ref = new Date(referenceDate + 'T00:00:00')
    const d = direction === 'next' ? 1 : -1
    switch (timePeriod) {
      case 'day': ref.setDate(ref.getDate() + d); break
      case 'week': ref.setDate(ref.getDate() + (7 * d)); break
      case 'month': ref.setMonth(ref.getMonth() + d); break
      case 'quarter': ref.setMonth(ref.getMonth() + (3 * d)); break
      case 'year': ref.setFullYear(ref.getFullYear() + d); break
      default: break
    }
    const y = ref.getFullYear()
    const m = String(ref.getMonth() + 1).padStart(2, '0')
    const dd = String(ref.getDate()).padStart(2, '0')
    const newRef = `${y}-${m}-${dd}`
    setReferenceDate(newRef)
    if (timePeriod === 'month') {
      setExpenseMonth(`${y}-${m}`)
      setExpensesLoaded(false)
    }
    loadPeriodData(timePeriod, newRef)
  }

  // Calculate total API cost (sum of all provider costs)
  const totalApiCost = ['openaiCost', 'anthropicCost', 'googleCost', 'xaiCost']
    .reduce((sum, key) => sum + (parseFloat(expenses[key]) || 0), 0)

  // Calculate grand total (all expenses)
  const grandTotal = Object.values(expenses)
    .reduce((sum, val) => sum + (parseFloat(val) || 0), 0)

  // Effective grand total: use aggregated for non-month periods, calculated for month
  const effectiveGrandTotal = timePeriod === 'month' ? grandTotal : (aggregatedExpenses?.grandTotal || 0)

  const dailyFavoritesRewardPerDay = 25
  const dailyFavoritesDaysMultiplier = { day: 1, week: 7, month: 30, quarter: 90, year: 365, all: 365 }
  const dailyFavoritesHypothetical = dailyFavoritesRewardPerDay * (dailyFavoritesDaysMultiplier[timePeriod] || 30)

  // Load expenses from ADMIN database for the selected month (editable, month view only)
  const loadExpenses = async (month) => {
    try {
      const adminParams = { month }
      const response = await api.get(`${API_URL}/api/admin/expenses`, { params: adminParams })
      if (response.data.success && response.data.expenses) {
        const data = response.data.expenses
        setExpenses({
          stripeFees: data.stripeFees ? String(data.stripeFees) : '',
          openaiCost: data.openaiCost ? String(data.openaiCost) : '',
          anthropicCost: data.anthropicCost ? String(data.anthropicCost) : '',
          googleCost: data.googleCost ? String(data.googleCost) : '',
          xaiCost: data.xaiCost ? String(data.xaiCost) : '',
          serperCost: data.serperCost ? String(data.serperCost) : '',
          resendCost: data.resendCost ? String(data.resendCost) : '',
          mongoDbCost: data.mongoDbCost ? String(data.mongoDbCost) : '',
          vercelCost: data.vercelCost ? String(data.vercelCost) : '',
          domainCost: data.domainCost ? String(data.domainCost) : '',
        })
      }
      setExpensesLoaded(true)
    } catch (error) {
      console.error('Error loading expenses:', error)
      setExpensesLoaded(true)
    }
  }

  // Load aggregated expenses for non-month periods (read-only)
  const loadAggregatedExpenses = async (period, date) => {
    try {
      setLoadingAggExpenses(true)
      const adminParams = { period, date }
      const response = await api.get(`${API_URL}/api/admin/expenses/aggregate`, { params: adminParams })
      if (response.data.success) {
        setAggregatedExpenses(response.data)
      }
    } catch (error) {
      console.error('Error loading aggregated expenses:', error)
    } finally {
      setLoadingAggExpenses(false)
    }
  }

  const loadRevenue = async (period, date) => {
    try {
      setLoadingRevenue(true)
      const adminParams = { period, date }
      const response = await api.get(`${API_URL}/api/admin/revenue`, { params: adminParams })
      if (response.data.success) {
        setRevenueData(response.data.revenue)
        setUserListTab(null)
        setUserListVisibleCount({ active: 5, freeTrial: 5, inactive: 5 })
      }
    } catch (error) {
      console.error('Error loading revenue:', error)
    } finally {
      setLoadingRevenue(false)
    }
  }

  // Unified loader: loads both revenue and expenses for the current period
  const loadPeriodData = (period, dateVal) => {
    const p = period || timePeriod
    const d = dateVal || referenceDate
    if (p === 'month') {
      const monthStr = d.slice(0, 7)
      setExpenseMonth(monthStr)
      setExpensesLoaded(false)
      loadExpenses(monthStr)
      loadRevenue(p, d)
    } else {
      loadAggregatedExpenses(p, d)
      loadRevenue(p, d)
    }
  }

  // Save expenses to ADMIN database (debounced)
  const saveExpenses = async (expenseData) => {
    try {
      setExpensesSaving(true)
      await api.post(`${API_URL}/api/admin/expenses`, {
        month: expenseMonth,
        expenses: expenseData,
      })
    } catch (error) {
      console.error('Error saving expenses:', error)
    } finally {
      setExpensesSaving(false)
    }
  }

  const handleExpenseChange = (field, value) => {
    // Allow empty string, numbers, and decimal points
    if (value === '' || /^\d*\.?\d*$/.test(value)) {
      setExpenses(prev => {
        const updated = { ...prev, [field]: value }
        // Debounced auto-save: wait 1.5s after last change
        if (expenseSaveTimer) clearTimeout(expenseSaveTimer)
        const timer = setTimeout(() => saveExpenses(updated), 1500)
        setExpenseSaveTimer(timer)
        return updated
      })
    }
  }

  useEffect(() => {
    if (!currentUser?.id) {
      setLoading(false)
      setShowLogin(true)
      setIsAdmin(false)
      setAdminCheckComplete(false)
      return
    }
    
    setShowLogin(false)
    setAdminCheckComplete(false)
    checkAdminStatus()
  }, [currentUser])

  const handleLogin = async (e) => {
    e.preventDefault()
    setLoginError('')
    setLoginLoading(true)

    try {
      const response = await api.post(`${API_URL}/api/auth/signin`, {
        username: loginData.username,
        password: loginData.password,
      })
      
      if (response.data.success) {
        setCurrentUser(response.data.user)
        setShowLogin(false)
        setLoginData({ username: '', password: '' })
        // checkAdminStatus will be called automatically via useEffect when currentUser changes
      } else {
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
    
    setAdminCheckComplete(false)
    try {
      const response = await api.get(`${API_URL}/api/admin/check`)
      const userIsAdmin = response.data.isAdmin === true
      setIsAdmin(userIsAdmin)
      setAdminCheckComplete(true)
      if (!userIsAdmin) {
        setLoading(false)
        setShowLogin(true)
        setLoginError('This account does not have admin access. Sign in with an admin account.')
      } else {
        fetchAdminData(false)
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

  const fetchAdminData = async (forceLoading = false) => {
    try {
      // Only show full-page loading on initial load, not section switches
      if (forceLoading || (!usersData && !pricingData && !costsData)) {
        setLoading(true)
      }
      const adminParams = {}
      const [usersResponse, pricingResponse, costsResponse] = await Promise.all([
        api.get(`${API_URL}/api/admin/users`, { params: adminParams }),
        api.get(`${API_URL}/api/admin/pricing`, { params: adminParams }),
        api.get(`${API_URL}/api/admin/costs`, { params: adminParams }),
      ])
      setUsersData(usersResponse.data)
      setPricingData(pricingResponse.data)
      setCostsData(costsResponse.data)
      if (!expensesLoaded) {
        await loadExpenses(expenseMonth)
      }
    } catch (error) {
      console.error('Error fetching admin data:', error)
      if (error.response?.status === 403 || error.response?.status === 401) {
        setIsAdmin(false)
        setLoginError('Admin access required. Please log in with an admin account.')
      }
    } finally {
      setLoading(false)
    }
  }

  const formatCurrency = (amount) => {
    if (amount === 0) return '$0.00'
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

  // Show login modal if not logged in or not admin
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
            background: 'rgba(93, 173, 226, 0.1)',
            border: '1px solid rgba(93, 173, 226, 0.3)',
            borderRadius: '16px',
            padding: '40px',
            width: '100%',
            maxWidth: '400px',
          }}
        >
          <div style={{ textAlign: 'center', marginBottom: '30px' }}>
            <Shield size={48} color="#5dade2" style={{ marginBottom: '16px' }} />
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
                <User size={16} color="#5dade2" />
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
                  border: '1px solid rgba(93, 173, 226, 0.3)',
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
                <Lock size={16} color="#5dade2" />
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
                  border: '1px solid rgba(93, 173, 226, 0.3)',
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
                  ? 'rgba(93, 173, 226, 0.3)'
                  : 'linear-gradient(90deg, #5dade2, #48c9b0)',
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

            <button
              type="button"
              onClick={() => (window.location.href = '/')}
              style={{
                width: '100%',
                marginTop: '12px',
                padding: '10px',
                background: 'transparent',
                border: '1px solid rgba(93, 173, 226, 0.3)',
                borderRadius: '8px',
                color: '#aaaaaa',
                fontSize: '0.9rem',
                cursor: 'pointer',
              }}
            >
              Back to Home
            </button>
          </form>
        </motion.div>
      </motion.div>
    )
  }

  // If not admin or no user, show login (handled above) or nothing
  if (!isAdmin || !currentUser) {
    return null
  }

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
      {/* ArkiTek Logo */}
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
            background: 'linear-gradient(135deg, #5dade2, #48c9b0)',
            WebkitBackgroundClip: 'text',
            WebkitTextFillColor: 'transparent',
            letterSpacing: '4px',
          }}
        >
          ArkiTek
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
            if (!usersData || !costsData) fetchAdminData()
          }}
          style={{
            background: 'rgba(93, 173, 226, 0.1)',
            border: '2px solid rgba(93, 173, 226, 0.3)',
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
            e.currentTarget.style.border = '2px solid rgba(93, 173, 226, 0.6)'
            e.currentTarget.style.background = 'rgba(93, 173, 226, 0.15)'
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.border = '2px solid rgba(93, 173, 226, 0.3)'
            e.currentTarget.style.background = 'rgba(93, 173, 226, 0.1)'
          }}
        >
          <Users size={64} color="#5dade2" />
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
            if (!pricingData) fetchAdminData()
          }}
          style={{
            background: 'rgba(93, 173, 226, 0.1)',
            border: '2px solid rgba(93, 173, 226, 0.3)',
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
            e.currentTarget.style.border = '2px solid rgba(93, 173, 226, 0.6)'
            e.currentTarget.style.background = 'rgba(93, 173, 226, 0.15)'
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.border = '2px solid rgba(93, 173, 226, 0.3)'
            e.currentTarget.style.background = 'rgba(93, 173, 226, 0.1)'
          }}
        >
          <Package size={64} color="#5dade2" />
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
            if (!pricingData) fetchAdminData()
          }}
          style={{
            background: 'rgba(72, 201, 176, 0.1)',
            border: '2px solid rgba(72, 201, 176, 0.3)',
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
            e.currentTarget.style.border = '2px solid rgba(72, 201, 176, 0.6)'
            e.currentTarget.style.background = 'rgba(72, 201, 176, 0.15)'
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.border = '2px solid rgba(72, 201, 176, 0.3)'
            e.currentTarget.style.background = 'rgba(72, 201, 176, 0.1)'
          }}
        >
          <DollarSign size={64} color="#48c9b0" />
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

        {/* Revenue/Expenses Card */}
        <motion.div
          whileHover={{ scale: 1.05, y: -5 }}
          whileTap={{ scale: 0.95 }}
          onClick={() => {
            setActiveSection('expenses')
            setExpensesSubSection('revenue')
            loadPeriodData()
          }}
          style={{
            background: 'rgba(72, 201, 176, 0.1)',
            border: '2px solid rgba(72, 201, 176, 0.3)',
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
            e.currentTarget.style.border = '2px solid rgba(72, 201, 176, 0.6)'
            e.currentTarget.style.background = 'rgba(72, 201, 176, 0.15)'
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.border = '2px solid rgba(72, 201, 176, 0.3)'
            e.currentTarget.style.background = 'rgba(72, 201, 176, 0.1)'
          }}
        >
          <Receipt size={64} color="#48c9b0" />
          <h2
            style={{
              fontSize: '1.8rem',
              color: '#ffffff',
              margin: 0,
              fontWeight: '600',
            }}
          >
            Revenue / Expenses
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
            onClick={() => {
              setActiveSection('main')
              setExpensesSubSection(null)
            }}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              padding: '12px 20px',
              background: 'rgba(93, 173, 226, 0.1)',
              border: '1px solid rgba(93, 173, 226, 0.3)',
              borderRadius: '8px',
              color: '#ffffff',
              cursor: 'pointer',
              fontSize: '1rem',
              marginBottom: '30px',
              transition: 'all 0.2s ease',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = 'rgba(93, 173, 226, 0.2)'
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = 'rgba(93, 173, 226, 0.1)'
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
                <Shield size={40} color="#5dade2" />
                <h1
                  style={{
                    fontSize: '2.5rem',
                    margin: 0,
                    background: 'linear-gradient(90deg, #5dade2, #48c9b0)',
                    WebkitBackgroundClip: 'text',
                    WebkitTextFillColor: 'transparent',
                  }}
                >
                  {activeSection === 'users' && 'Users'}
                  {activeSection === 'models' && 'Models & Releases'}
                  {activeSection === 'prices' && 'Prices'}
                  {activeSection === 'expenses' && 'Revenue / Expenses'}
                </h1>
              </div>
              <p style={{ color: '#aaaaaa', fontSize: '1.1rem' }}>
                {activeSection === 'users' && 'Manage users and monitor usage'}
                {activeSection === 'models' && 'View available models and releases'}
                {activeSection === 'prices' && 'Manage model pricing'}
                {activeSection === 'expenses' && 'Track revenue streams and monitor costs'}
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
                          background: userFilter === 'all' ? 'rgba(93, 173, 226, 0.2)' : 'rgba(93, 173, 226, 0.1)',
                          border: userFilter === 'all' ? '2px solid rgba(93, 173, 226, 0.6)' : '1px solid rgba(93, 173, 226, 0.3)',
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
                            e.currentTarget.style.background = 'rgba(93, 173, 226, 0.15)'
                          }
                        }}
                        onMouseLeave={(e) => {
                          if (userFilter !== 'all') {
                            e.currentTarget.style.background = 'rgba(93, 173, 226, 0.1)'
                          }
                        }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                          <Users size={32} color="#5dade2" />
                          <h2 style={{ fontSize: '1.2rem', color: '#ffffff', margin: 0 }}>Total Users</h2>
                        </div>
                        <p
                          style={{
                            fontSize: '3rem',
                            fontWeight: 'bold',
                            background: 'linear-gradient(90deg, #5dade2, #48c9b0)',
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
                          background: userFilter === 'active' ? 'rgba(72, 201, 176, 0.2)' : 'rgba(72, 201, 176, 0.1)',
                          border: userFilter === 'active' ? '2px solid rgba(72, 201, 176, 0.6)' : '1px solid rgba(72, 201, 176, 0.3)',
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
                            e.currentTarget.style.background = 'rgba(72, 201, 176, 0.15)'
                          }
                        }}
                        onMouseLeave={(e) => {
                          if (userFilter !== 'active') {
                            e.currentTarget.style.background = 'rgba(72, 201, 176, 0.1)'
                          }
                        }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                          <TrendingUp size={32} color="#48c9b0" />
                          <h2 style={{ fontSize: '1.2rem', color: '#ffffff', margin: 0 }}>Active Users</h2>
                        </div>
                        <p
                          style={{
                            fontSize: '3rem',
                            fontWeight: 'bold',
                            background: 'linear-gradient(90deg, #5dade2, #48c9b0)',
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
                            background: 'linear-gradient(90deg, #5dade2, #48c9b0)',
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
                            background: 'linear-gradient(90deg, #5dade2, #48c9b0)',
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
                            background: 'linear-gradient(90deg, #5dade2, #48c9b0)',
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
              background: 'rgba(93, 173, 226, 0.1)',
              border: '1px solid rgba(93, 173, 226, 0.3)',
              borderRadius: '16px',
              padding: '30px',
              marginBottom: '40px',
            }}
          >
            <h2 style={{ fontSize: '1.8rem', color: '#ffffff', marginBottom: '24px', display: 'flex', alignItems: 'center', gap: '12px' }}>
              <Users size={28} color="#5dade2" />
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
                  color="#5dade2"
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
                    border: '1px solid rgba(93, 173, 226, 0.3)',
                    borderRadius: '8px',
                    color: '#ffffff',
                    fontSize: '0.95rem',
                    outline: 'none',
                    transition: 'border-color 0.2s',
                  }}
                  onFocus={(e) => {
                    e.target.style.borderColor = 'rgba(93, 173, 226, 0.6)'
                  }}
                  onBlur={(e) => {
                    e.target.style.borderColor = 'rgba(93, 173, 226, 0.3)'
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
                        background: 'rgba(93, 173, 226, 0.05)',
                        border: '1px solid rgba(93, 173, 226, 0.2)',
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
                        e.currentTarget.style.background = 'rgba(93, 173, 226, 0.1)'
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.background = 'rgba(93, 173, 226, 0.05)'
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
                                background: 'rgba(72, 201, 176, 0.2)',
                                border: '1px solid rgba(72, 201, 176, 0.5)',
                                borderRadius: '4px',
                                padding: '2px 8px',
                                fontSize: '0.75rem',
                                color: '#48c9b0',
                                fontWeight: '600',
                              }}
                            >
                              ADMIN
                            </span>
                          )}
                          <span
                            style={{
                              background: userStatus === 'active' ? 'rgba(72, 201, 176, 0.2)' : userStatus === 'canceled' ? 'rgba(255, 0, 0, 0.2)' : 'rgba(255, 165, 0, 0.2)',
                              border: userStatus === 'active' ? '1px solid rgba(72, 201, 176, 0.5)' : userStatus === 'canceled' ? '1px solid rgba(255, 0, 0, 0.5)' : '1px solid rgba(255, 165, 0, 0.5)',
                              borderRadius: '4px',
                              padding: '2px 8px',
                              fontSize: '0.75rem',
                              color: userStatus === 'active' ? '#48c9b0' : userStatus === 'canceled' ? '#FF0000' : '#FFA500',
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
                        {user?.lastActiveAt && (
                          <p style={{ color: '#888888', fontSize: '0.75rem', margin: '4px 0 0 0' }}>
                            Last Active: {new Date(user.lastActiveAt).toLocaleString()}
                          </p>
                        )}
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                        {/* User Usage Summary */}
                        <div style={{ display: 'flex', gap: '16px', alignItems: 'center' }}>
                          <div style={{ textAlign: 'right' }}>
                            <p style={{ color: '#aaaaaa', fontSize: '0.7rem', margin: '0 0 2px 0' }}>Total Queries</p>
                            <p style={{ color: '#5dade2', fontSize: '1rem', fontWeight: 'bold', margin: 0 }}>
                              {formatNumber(userCost.totalQueries || 0)}
                            </p>
                          </div>
                          <div style={{ textAlign: 'right' }}>
                            <p style={{ color: '#aaaaaa', fontSize: '0.7rem', margin: '0 0 2px 0' }}>Total Tokens</p>
                            <p style={{ color: '#5dade2', fontSize: '1rem', fontWeight: 'bold', margin: 0 }}>
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
                                color: (userCost.cost || 0) > (userCost.plan === 'free_trial' ? 1.00 : 7.50) ? '#ff6b6b' : '#48c9b0',
                                fontSize: '1rem',
                                fontWeight: 'bold',
                                margin: 0,
                              }}
                            >
                              ${Math.max(0, ((userCost.cost || 0) - (userCost.plan === 'free_trial' ? 1.00 : 7.50)).toFixed(2))}
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
                      <div style={{ padding: '20px', borderTop: '1px solid rgba(93, 173, 226, 0.2)', background: 'rgba(0, 0, 0, 0.2)' }}>
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
                                  <div style={{ background: 'rgba(93, 173, 226, 0.05)', padding: '16px', borderRadius: '8px', textAlign: 'center' }}>
                                    <p style={{ color: '#aaaaaa', fontSize: '0.75rem', margin: '0 0 8px 0' }}>Total Tokens</p>
                                    <p style={{ color: '#5dade2', fontSize: '1.5rem', fontWeight: 'bold', margin: 0 }}>
                                      {formatTokens(stats.totalTokens || 0)}
                                    </p>
                                  </div>
                                  <div style={{ background: 'rgba(93, 173, 226, 0.05)', padding: '16px', borderRadius: '8px', textAlign: 'center' }}>
                                    <p style={{ color: '#aaaaaa', fontSize: '0.75rem', margin: '0 0 8px 0' }}>Input Tokens</p>
                                    <p style={{ color: '#5dade2', fontSize: '1.5rem', fontWeight: 'bold', margin: 0 }}>
                                      {formatTokens(stats.totalInputTokens || 0)}
                                    </p>
                                  </div>
                                  <div style={{ background: 'rgba(93, 173, 226, 0.05)', padding: '16px', borderRadius: '8px', textAlign: 'center' }}>
                                    <p style={{ color: '#aaaaaa', fontSize: '0.75rem', margin: '0 0 8px 0' }}>Output Tokens</p>
                                    <p style={{ color: '#5dade2', fontSize: '1.5rem', fontWeight: 'bold', margin: 0 }}>
                                      {formatTokens(stats.totalOutputTokens || 0)}
                                    </p>
                                  </div>
                                  <div style={{ background: 'rgba(93, 173, 226, 0.05)', padding: '16px', borderRadius: '8px', textAlign: 'center' }}>
                                    <p style={{ color: '#aaaaaa', fontSize: '0.75rem', margin: '0 0 8px 0' }}>Total Prompts</p>
                                    <p style={{ color: '#48c9b0', fontSize: '1.5rem', fontWeight: 'bold', margin: 0 }}>
                                      {formatNumber(stats.totalPrompts || 0)}
                                    </p>
                                  </div>
                                  <div style={{ background: 'rgba(93, 173, 226, 0.05)', padding: '16px', borderRadius: '8px', textAlign: 'center' }}>
                                    <p style={{ color: '#aaaaaa', fontSize: '0.75rem', margin: '0 0 8px 0' }}>Total Queries</p>
                                    <p style={{ color: '#48c9b0', fontSize: '1.5rem', fontWeight: 'bold', margin: 0 }}>
                                      {formatNumber(stats.totalQueries || 0)}
                                    </p>
                                  </div>
                                </div>

                                {/* Monthly Stats */}
                                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: '16px' }}>
                                  <div style={{ background: 'rgba(72, 201, 176, 0.05)', padding: '16px', borderRadius: '8px', textAlign: 'center' }}>
                                    <p style={{ color: '#aaaaaa', fontSize: '0.75rem', margin: '0 0 8px 0' }}>Monthly Tokens</p>
                                    <p style={{ color: '#48c9b0', fontSize: '1.5rem', fontWeight: 'bold', margin: 0 }}>
                                      {formatTokens(stats.monthlyTokens || 0)}
                                    </p>
                                  </div>
                                  <div style={{ background: 'rgba(72, 201, 176, 0.05)', padding: '16px', borderRadius: '8px', textAlign: 'center' }}>
                                    <p style={{ color: '#aaaaaa', fontSize: '0.75rem', margin: '0 0 8px 0' }}>Monthly Input</p>
                                    <p style={{ color: '#48c9b0', fontSize: '1.5rem', fontWeight: 'bold', margin: 0 }}>
                                      {formatTokens(stats.monthlyInputTokens || 0)}
                                    </p>
                                  </div>
                                  <div style={{ background: 'rgba(72, 201, 176, 0.05)', padding: '16px', borderRadius: '8px', textAlign: 'center' }}>
                                    <p style={{ color: '#aaaaaa', fontSize: '0.75rem', margin: '0 0 8px 0' }}>Monthly Output</p>
                                    <p style={{ color: '#48c9b0', fontSize: '1.5rem', fontWeight: 'bold', margin: 0 }}>
                                      {formatTokens(stats.monthlyOutputTokens || 0)}
                                    </p>
                                  </div>
                                  <div style={{ background: 'rgba(72, 201, 176, 0.05)', padding: '16px', borderRadius: '8px', textAlign: 'center' }}>
                                    <p style={{ color: '#aaaaaa', fontSize: '0.75rem', margin: '0 0 8px 0' }}>Monthly Prompts</p>
                                    <p style={{ color: '#48c9b0', fontSize: '1.5rem', fontWeight: 'bold', margin: 0 }}>
                                      {formatNumber(stats.monthlyPrompts || 0)}
                                    </p>
                                  </div>
                                  <div style={{ background: 'rgba(72, 201, 176, 0.05)', padding: '16px', borderRadius: '8px', textAlign: 'center' }}>
                                    <p style={{ color: '#aaaaaa', fontSize: '0.75rem', margin: '0 0 8px 0' }}>Monthly Queries</p>
                                    <p style={{ color: '#48c9b0', fontSize: '1.5rem', fontWeight: 'bold', margin: 0 }}>
                                      {formatNumber(stats.monthlyQueries || 0)}
                                    </p>
                                  </div>
                                </div>

                                {/* Provider Breakdown */}
                                {Object.keys(stats.providers || {}).length > 0 && (
                                  <div>
                                    <h3 style={{ color: '#5dade2', fontSize: '1rem', marginBottom: '12px', fontWeight: '600', display: 'flex', alignItems: 'center', gap: '8px' }}>
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
                                                background: 'rgba(93, 173, 226, 0.05)',
                                                border: '1px solid rgba(93, 173, 226, 0.2)',
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
                                                  {isProviderExpanded ? <ChevronDown size={16} color="#5dade2" /> : <ChevronRight size={16} color="#5dade2" />}
                                                  <span style={{ color: '#5dade2', fontSize: '0.9rem', textTransform: 'capitalize' }}>{provider}</span>
                                                </div>
                                                <div style={{ display: 'flex', gap: '16px' }}>
                                                  <span style={{ color: '#aaaaaa', fontSize: '0.75rem' }}>Tokens: {formatTokens(data.totalTokens)}</span>
                                                  <span style={{ color: '#aaaaaa', fontSize: '0.75rem' }}>Queries: {formatNumber(data.totalQueries)}</span>
                                                </div>
                                              </div>
                                              {isProviderExpanded && providerModels.length > 0 && (
                                                <div style={{ padding: '12px 16px 12px 32px', borderTop: '1px solid rgba(93, 173, 226, 0.2)' }}>
                                                  {providerModels.map(([modelKey, modelData]) => (
                                                    <div
                                                      key={modelKey}
                                                      style={{
                                                        background: 'rgba(93, 173, 226, 0.03)',
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
                                  <div style={{ background: 'rgba(72, 201, 176, 0.1)', padding: '16px', borderRadius: '8px', border: '1px solid rgba(72, 201, 176, 0.3)' }}>
                                    <h3 style={{ color: '#48c9b0', fontSize: '1rem', marginBottom: '12px', fontWeight: '600' }}>
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
                                              background: 'rgba(72, 201, 176, 0.05)',
                                              borderRadius: '6px',
                                            }}
                                          >
                                            <span style={{ color: '#cccccc', fontSize: '0.85rem' }}>
                                              {modelCost.provider} - {modelCost.model}
                                            </span>
                                            <span style={{ color: '#48c9b0', fontSize: '0.9rem', fontWeight: 'bold' }}>
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
                  background: 'rgba(93, 173, 226, 0.1)',
                  border: '1px solid rgba(93, 173, 226, 0.3)',
                  borderRadius: '16px',
                  padding: '30px',
                }}
              >
                <h2 style={{ fontSize: '1.8rem', color: '#ffffff', marginBottom: '24px', display: 'flex', alignItems: 'center', gap: '12px' }}>
                  <Package size={28} color="#5dade2" />
                  Models & Releases
                </h2>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                  {Object.entries(LLM_PROVIDERS).map(([providerKey, provider]) => {
                    const isExpanded = expandedProviders[providerKey]
                    return (
                      <div
                        key={providerKey}
                        style={{
                          background: 'rgba(93, 173, 226, 0.05)',
                          border: '1px solid rgba(93, 173, 226, 0.2)',
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
                            e.currentTarget.style.background = 'rgba(93, 173, 226, 0.1)'
                          }}
                          onMouseLeave={(e) => {
                            e.currentTarget.style.background = 'rgba(93, 173, 226, 0.05)'
                          }}
                        >
                          <h3 style={{ fontSize: '1.1rem', color: '#5dade2', margin: 0 }}>
                            {provider.name}
                          </h3>
                          <span style={{ color: '#888888', fontSize: '0.85rem' }}>
                            {provider.models.length} models
                            {isExpanded ? ' ▲' : ' ▼'}
                          </span>
                        </div>

                        {/* Models List */}
                        {isExpanded && (
                          <div style={{ padding: '12px 20px 20px 20px', borderTop: '1px solid rgba(93, 173, 226, 0.2)' }}>
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '12px' }}>
                              {provider.models.map((model) => (
                                <div
                                  key={model.id}
                                  style={{
                                    background: 'rgba(93, 173, 226, 0.03)',
                                    border: '1px solid rgba(93, 173, 226, 0.15)',
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
                                      background: 'rgba(72, 201, 176, 0.05)',
                                      border: '1px dashed rgba(72, 201, 176, 0.3)',
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
                  background: 'rgba(93, 173, 226, 0.1)',
                  border: '1px solid rgba(93, 173, 226, 0.3)',
                  borderRadius: '16px',
                  padding: '30px',
                }}
              >
            <h2 style={{ fontSize: '1.8rem', color: '#ffffff', marginBottom: '24px', display: 'flex', alignItems: 'center', gap: '12px' }}>
              <DollarSign size={28} color="#5dade2" />
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
                        background: 'rgba(93, 173, 226, 0.05)',
                        border: '1px solid rgba(93, 173, 226, 0.2)',
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
                          e.currentTarget.style.background = 'rgba(93, 173, 226, 0.1)'
                        }}
                        onMouseLeave={(e) => {
                          e.currentTarget.style.background = 'rgba(93, 173, 226, 0.05)'
                        }}
                      >
                        <h3 style={{ fontSize: '1.1rem', color: '#5dade2', margin: 0, textTransform: 'capitalize' }}>
                          {providerData.name}
                        </h3>
                        <span style={{ color: '#888888', fontSize: '0.85rem' }}>
                          {providerData.queryTiers.length} tiers
                          {isExpanded ? ' ▲' : ' ▼'}
                        </span>
                      </div>

                      {/* Query Tiers List */}
                      {isExpanded && (
                        <div style={{ padding: '12px 20px 20px 20px', borderTop: '1px solid rgba(93, 173, 226, 0.2)' }}>
                          <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '8px' }}>
                            {providerData.queryTiers.map((tier, index) => (
                              <div
                                key={index}
                                style={{
                                  background: 'rgba(93, 173, 226, 0.03)',
                                  border: '1px solid rgba(93, 173, 226, 0.15)',
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
                                  <p style={{ color: '#5dade2', fontSize: '1rem', fontWeight: 'bold', margin: 0 }}>
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
                      background: 'rgba(93, 173, 226, 0.05)',
                      border: '1px solid rgba(93, 173, 226, 0.2)',
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
                        e.currentTarget.style.background = 'rgba(93, 173, 226, 0.1)'
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.background = 'rgba(93, 173, 226, 0.05)'
                      }}
                    >
                      <h3 style={{ fontSize: '1.1rem', color: '#5dade2', margin: 0, textTransform: 'capitalize' }}>
                        {providerData.name}
                      </h3>
                      <span style={{ color: '#888888', fontSize: '0.85rem' }}>
                        {providerData.models ? Object.keys(providerData.models).length : 0} models
                        {isExpanded ? ' ▲' : ' ▼'}
                      </span>
                    </div>

                    {/* Models List */}
                    {isExpanded && providerData.models && (
                      <div style={{ padding: '12px 20px 20px 20px', borderTop: '1px solid rgba(93, 173, 226, 0.2)' }}>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '8px' }}>
                          {Object.entries(providerData.models).map(([modelName, pricing]) => (
                            <div
                              key={modelName}
                              style={{
                                background: 'rgba(93, 173, 226, 0.03)',
                                border: '1px solid rgba(93, 173, 226, 0.15)',
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
                                      background: 'rgba(93, 173, 226, 0.1)',
                                      border: '1px solid rgba(93, 173, 226, 0.3)',
                                      borderRadius: '6px',
                                      padding: '6px 10px',
                                      color: '#5dade2',
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
                                      background: 'rgba(72, 201, 176, 0.1)',
                                      border: '1px solid rgba(72, 201, 176, 0.3)',
                                      borderRadius: '6px',
                                      padding: '6px 10px',
                                      color: '#48c9b0',
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

            {/* Revenue / Expenses Section */}
            {activeSection === 'expenses' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0' }}>

                {/* Tab Bar */}
                <div style={{
                  display: 'flex',
                  marginBottom: '28px',
                  borderBottom: '1px solid rgba(93, 173, 226, 0.2)',
                }}>
                  <button
                    onClick={() => setExpensesSubSection('revenue')}
                    style={{
                      flex: 1,
                      padding: '14px 12px',
                      background: expensesSubSection === 'revenue' ? 'rgba(93, 173, 226, 0.08)' : 'transparent',
                      border: 'none',
                      borderBottom: expensesSubSection === 'revenue' ? '2px solid #5dade2' : '2px solid transparent',
                      color: expensesSubSection === 'revenue' ? '#5dade2' : '#6b7280',
                      fontSize: '1rem',
                      fontWeight: expensesSubSection === 'revenue' ? '600' : '400',
                      cursor: 'pointer',
                      transition: 'all 0.2s ease',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: '8px',
                    }}
                  >
                    <TrendingUp size={18} />
                    Revenue
                  </button>
                  <button
                    onClick={() => setExpensesSubSection('expenses')}
                    style={{
                      flex: 1,
                      padding: '14px 12px',
                      background: expensesSubSection === 'expenses' ? 'rgba(93, 173, 226, 0.08)' : 'transparent',
                      border: 'none',
                      borderBottom: expensesSubSection === 'expenses' ? '2px solid #5dade2' : '2px solid transparent',
                      color: expensesSubSection === 'expenses' ? '#5dade2' : '#6b7280',
                      fontSize: '1rem',
                      fontWeight: expensesSubSection === 'expenses' ? '600' : '400',
                      cursor: 'pointer',
                      transition: 'all 0.2s ease',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: '8px',
                    }}
                  >
                    <Receipt size={18} />
                    Expenses
                  </button>
                </div>

            {/* ═══════════════════ REVENUE TAB ═══════════════════ */}
            {expensesSubSection === 'revenue' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>

                {loadingRevenue ? (
                  <div style={{ textAlign: 'center', padding: '40px', color: '#cccccc' }}>Loading revenue data...</div>
                ) : !revenueData ? (
                  <div style={{ textAlign: 'center', padding: '40px', color: '#cccccc' }}>No revenue data available for this period</div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>

                    {/* Current Totals (always global) */}
                    <div style={{
                      background: 'rgba(93, 173, 226, 0.04)',
                      border: '1px solid rgba(93, 173, 226, 0.15)',
                      borderRadius: '12px',
                      padding: '16px 24px',
                      display: 'flex',
                      justifyContent: 'space-around',
                      alignItems: 'center',
                      gap: '16px',
                      flexWrap: 'wrap',
                    }}>
                      <span style={{ color: '#6b7280', fontSize: '0.85rem' }}>Current totals:</span>
                      {[
                        { label: 'Total Active', value: (revenueData.activeSubscriptions ?? 0) + (revenueData.activeFreeTrials ?? 0) },
                        { label: 'Paid', value: revenueData.activeSubscriptions ?? 0 },
                        { label: 'Free Plan', value: revenueData.activeFreeTrials ?? 0 },
                      ].map(({ label, value }) => (
                        <div key={label} style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <span style={{ color: '#999999', fontSize: '0.8rem' }}>{label}</span>
                          <span style={{ color: '#ffffff', fontSize: '1.4rem', fontWeight: '700', fontFamily: 'monospace' }}>{value}</span>
                        </div>
                      ))}
                    </div>

                    {/* Period Selector */}
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '16px', flexWrap: 'wrap' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
                        <div style={{ position: 'relative' }}>
                          <div
                            onClick={() => setPeriodDropdownOpen(!periodDropdownOpen)}
                            style={{
                              background: 'rgba(93, 173, 226, 0.1)',
                              border: '1px solid rgba(93, 173, 226, 0.3)',
                              borderRadius: '10px',
                              padding: '10px 16px',
                              color: '#ffffff',
                              fontSize: '1rem',
                              cursor: 'pointer',
                              display: 'flex',
                              alignItems: 'center',
                              gap: '8px',
                              minWidth: '130px',
                              justifyContent: 'space-between',
                              transition: 'all 0.2s ease',
                            }}
                          >
                            <span>{periodOptions.find(o => o.value === timePeriod)?.label}</span>
                            <ChevronDown size={16} style={{ transition: 'transform 0.2s ease', transform: periodDropdownOpen ? 'rotate(180deg)' : 'rotate(0deg)' }} />
                          </div>
                          {periodDropdownOpen && (
                            <>
                              <div onClick={() => setPeriodDropdownOpen(false)} style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, zIndex: 99 }} />
                              <div style={{ position: 'absolute', top: 'calc(100% + 6px)', left: 0, background: '#0a0a0a', border: '1px solid rgba(93, 173, 226, 0.2)', borderRadius: '12px', padding: '6px', zIndex: 100, minWidth: '160px', boxShadow: '0 12px 40px rgba(0,0,0,0.5)' }}>
                                {periodOptions.map(opt => (
                                  <div
                                    key={opt.value}
                                    onClick={() => { setTimePeriod(opt.value); setPeriodDropdownOpen(false); loadPeriodData(opt.value, referenceDate) }}
                                    style={{ padding: '10px 14px', borderRadius: '8px', cursor: 'pointer', color: timePeriod === opt.value ? '#ffffff' : '#cccccc', background: timePeriod === opt.value ? 'rgba(93, 173, 226, 0.25)' : 'transparent', fontSize: '0.95rem', transition: 'all 0.15s ease' }}
                                    onMouseEnter={(e) => { if (timePeriod !== opt.value) e.currentTarget.style.background = 'rgba(93, 173, 226, 0.1)' }}
                                    onMouseLeave={(e) => { if (timePeriod !== opt.value) e.currentTarget.style.background = 'transparent' }}
                                  >
                                    {opt.label}
                                  </div>
                                ))}
                              </div>
                            </>
                          )}
                        </div>

                        {timePeriod === 'day' && (
                          <input type="date" value={referenceDate} onChange={(e) => { setReferenceDate(e.target.value); loadPeriodData('day', e.target.value) }}
                            style={{ background: 'rgba(93, 173, 226, 0.06)', border: '1px solid rgba(93, 173, 226, 0.2)', borderRadius: '10px', padding: '10px 16px', color: '#ffffff', fontSize: '1rem', outline: 'none', cursor: 'pointer', colorScheme: 'dark' }} />
                        )}
                        {timePeriod === 'week' && (
                          <input type="date" value={referenceDate} onChange={(e) => { setReferenceDate(e.target.value); loadPeriodData('week', e.target.value) }}
                            style={{ background: 'rgba(93, 173, 226, 0.06)', border: '1px solid rgba(93, 173, 226, 0.2)', borderRadius: '10px', padding: '10px 16px', color: '#ffffff', fontSize: '1rem', outline: 'none', cursor: 'pointer', colorScheme: 'dark' }} />
                        )}
                        {timePeriod === 'month' && (
                          <input type="month" value={expenseMonth} onChange={(e) => { const m = e.target.value; setExpenseMonth(m); setReferenceDate(m + '-01'); setExpensesLoaded(false); loadPeriodData('month', m + '-01') }}
                            style={{ background: 'rgba(93, 173, 226, 0.06)', border: '1px solid rgba(93, 173, 226, 0.2)', borderRadius: '10px', padding: '10px 16px', color: '#ffffff', fontSize: '1rem', outline: 'none', cursor: 'pointer', colorScheme: 'dark' }} />
                        )}
                        {timePeriod === 'quarter' && (() => {
                          const ref = new Date(referenceDate + 'T00:00:00')
                          const currentQ = Math.ceil((ref.getMonth() + 1) / 3)
                          const currentY = ref.getFullYear()
                          return (
                            <div style={{ display: 'flex', gap: '8px' }}>
                              <select value={currentQ} onChange={(e) => { const q = parseInt(e.target.value); const nd = `${currentY}-${String((q - 1) * 3 + 1).padStart(2, '0')}-01`; setReferenceDate(nd); loadPeriodData('quarter', nd) }}
                                style={{ background: 'rgba(93, 173, 226, 0.06)', border: '1px solid rgba(93, 173, 226, 0.2)', borderRadius: '10px', padding: '10px 16px', color: '#ffffff', fontSize: '1rem', outline: 'none', cursor: 'pointer', colorScheme: 'dark' }}>
                                <option value={1} style={{ background: '#0a0a0a' }}>Q1 (Jan–Mar)</option>
                                <option value={2} style={{ background: '#0a0a0a' }}>Q2 (Apr–Jun)</option>
                                <option value={3} style={{ background: '#0a0a0a' }}>Q3 (Jul–Sep)</option>
                                <option value={4} style={{ background: '#0a0a0a' }}>Q4 (Oct–Dec)</option>
                              </select>
                              <input type="number" value={currentY} min={2024} max={2035} onChange={(e) => { const nd = `${e.target.value}-${String((currentQ - 1) * 3 + 1).padStart(2, '0')}-01`; setReferenceDate(nd); loadPeriodData('quarter', nd) }}
                                style={{ background: 'rgba(93, 173, 226, 0.06)', border: '1px solid rgba(93, 173, 226, 0.2)', borderRadius: '10px', padding: '10px 16px', color: '#ffffff', fontSize: '1rem', width: '100px', outline: 'none', colorScheme: 'dark' }} />
                            </div>
                          )
                        })()}
                        {timePeriod === 'year' && (
                          <input type="number" value={new Date(referenceDate + 'T00:00:00').getFullYear()} min={2024} max={2035} onChange={(e) => { const nd = `${e.target.value}-01-01`; setReferenceDate(nd); loadPeriodData('year', nd) }}
                            style={{ background: 'rgba(93, 173, 226, 0.06)', border: '1px solid rgba(93, 173, 226, 0.2)', borderRadius: '10px', padding: '10px 16px', color: '#ffffff', fontSize: '1rem', width: '110px', outline: 'none', colorScheme: 'dark' }} />
                        )}

                        {timePeriod !== 'all' && (
                          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                            <div
                              onClick={() => shiftPeriod('prev')}
                              style={{ width: '32px', height: '32px', borderRadius: '8px', background: 'rgba(93, 173, 226, 0.08)', border: '1px solid rgba(93, 173, 226, 0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', transition: 'all 0.15s ease' }}
                              onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(93, 173, 226, 0.2)' }}
                              onMouseLeave={(e) => { e.currentTarget.style.background = 'rgba(93, 173, 226, 0.08)' }}
                            >
                              <ChevronLeft size={16} color="#5dade2" />
                            </div>
                            <span style={{ color: '#6b7280', fontSize: '0.9rem', fontStyle: 'italic', minWidth: '120px', textAlign: 'center' }}>{getPeriodLabel()}</span>
                            <div
                              onClick={() => shiftPeriod('next')}
                              style={{ width: '32px', height: '32px', borderRadius: '8px', background: 'rgba(93, 173, 226, 0.08)', border: '1px solid rgba(93, 173, 226, 0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', transition: 'all 0.15s ease' }}
                              onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(93, 173, 226, 0.2)' }}
                              onMouseLeave={(e) => { e.currentTarget.style.background = 'rgba(93, 173, 226, 0.08)' }}
                            >
                              <ChevronRight size={16} color="#5dade2" />
                            </div>
                          </div>
                        )}
                        {timePeriod === 'all' && (
                          <span style={{ color: '#6b7280', fontSize: '0.9rem', fontStyle: 'italic' }}>{getPeriodLabel()}</span>
                        )}
                      </div>
                    </div>

                    {/* Subscriptions Revenue */}
                    <div style={{ background: 'rgba(93, 173, 226, 0.06)', border: '1px solid rgba(93, 173, 226, 0.15)', borderRadius: '14px', padding: '24px' }}>
                      <h3 style={{ fontSize: '1.15rem', color: '#5dade2', marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '10px' }}>
                        <Users size={20} color="#5dade2" />
                        Subscription Revenue
                      </h3>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 14px', background: 'rgba(93, 173, 226, 0.04)', borderRadius: '10px' }}>
                          <span style={{ color: '#cccccc', fontSize: '0.95rem' }}>
                            {revenueData.newSubscriptions} new subscription{revenueData.newSubscriptions !== 1 ? 's' : ''} @ ${revenueData.subscriptionPrice}/mo
                          </span>
                          <span style={{ color: '#ffffff', fontSize: '1.2rem', fontWeight: '700', fontFamily: 'monospace' }}>
                            ${(revenueData.newSubscriptionRevenue ?? 0).toFixed(2)}
                          </span>
                        </div>
                        {revenueData.subscriptionUsers?.length > 0 && (() => {
                          const isOpen = revenueListOpen.newSubs
                          const visible = revenueListVisible.newSubs ?? 10
                          const users = revenueData.subscriptionUsers
                          const shown = users.slice(0, visible)
                          return (
                            <div style={{ marginLeft: '8px' }}>
                              <div
                                onClick={() => setRevenueListOpen(prev => ({ ...prev, newSubs: !prev.newSubs }))}
                                style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer', userSelect: 'none' }}
                                onMouseEnter={(e) => e.currentTarget.style.opacity = '0.8'}
                                onMouseLeave={(e) => e.currentTarget.style.opacity = '1'}
                              >
                                {isOpen ? <ChevronDown size={14} color="#6b7280" /> : <ChevronRight size={14} color="#6b7280" />}
                                <p style={{ color: '#6b7280', fontSize: '0.8rem', margin: 0, textTransform: 'uppercase', letterSpacing: '1px' }}>New subscribers ({users.length})</p>
                              </div>
                              {isOpen && (
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginTop: '8px' }}>
                                  {shown.map((u, i) => (
                                    <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 12px', background: 'rgba(93, 173, 226, 0.06)', borderRadius: '8px' }}>
                                      <span style={{ color: '#cccccc', fontSize: '0.9rem' }}>
                                        <User size={14} style={{ marginRight: '6px', verticalAlign: 'middle', opacity: 0.6 }} />
                                        {u.username}
                                      </span>
                                      <span style={{ color: '#666666', fontSize: '0.8rem' }}>{new Date(u.date).toLocaleDateString()}</span>
                                    </div>
                                  ))}
                                  <div style={{ display: 'flex', justifyContent: 'center', gap: '12px', marginTop: '6px' }}>
                                    {visible < users.length && (
                                      <div onClick={() => setRevenueListVisible(prev => ({ ...prev, newSubs: (prev.newSubs ?? 10) + 10 }))}
                                      style={{ padding: '6px 16px', borderRadius: '8px', background: 'rgba(93, 173, 226, 0.1)', border: '1px solid rgba(93, 173, 226, 0.2)', color: '#5dade2', fontSize: '0.8rem', cursor: 'pointer' }}>
                                      Show More ({users.length - visible} remaining)
                                    </div>
                                  )}
                                  {visible > 10 && (
                                    <div onClick={() => setRevenueListVisible(prev => ({ ...prev, newSubs: 10 }))}
                                      style={{ padding: '6px 16px', borderRadius: '8px', background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', color: '#999999', fontSize: '0.8rem', cursor: 'pointer' }}>
                                      Show Less
                                      </div>
                                    )}
                                  </div>
                                </div>
                              )}
                            </div>
                          )
                        })()}
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 14px', background: 'rgba(93, 173, 226, 0.04)', borderRadius: '10px' }}>
                          <span style={{ color: '#cccccc', fontSize: '0.95rem' }}>
                            {revenueData.renewedSubscriptions ?? 0} renewed subscription{(revenueData.renewedSubscriptions ?? 0) !== 1 ? 's' : ''} @ ${revenueData.subscriptionPrice}/mo
                          </span>
                          <span style={{ color: '#ffffff', fontSize: '1.2rem', fontWeight: '700', fontFamily: 'monospace' }}>
                            ${(revenueData.renewalRevenue ?? 0).toFixed(2)}
                          </span>
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 14px', borderTop: '1px solid rgba(93, 173, 226, 0.15)', marginTop: '4px' }}>
                          <span style={{ color: '#5dade2', fontSize: '1.05rem', fontWeight: '600' }}>Total Subscription Revenue</span>
                          <span style={{ color: '#ffffff', fontSize: '1.3rem', fontWeight: '700', fontFamily: 'monospace' }}>
                            ${(revenueData.totalSubscriptionRevenue ?? 0).toFixed(2)}
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* Free Plan Users */}
                    <div style={{ background: 'rgba(93, 173, 226, 0.06)', border: '1px solid rgba(93, 173, 226, 0.15)', borderRadius: '14px', padding: '24px' }}>
                      <h3 style={{ fontSize: '1.15rem', color: '#5dade2', marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '10px' }}>
                        <User size={20} color="#5dade2" />
                        Free Plan Users
                      </h3>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span style={{ color: '#cccccc', fontSize: '0.95rem' }}>
                          {revenueData.newFreeTrials ?? 0} new trial{(revenueData.newFreeTrials ?? 0) !== 1 ? 's' : ''} this period
                        </span>
                      </div>
                      {revenueData.freeTrialUsers?.length > 0 && (() => {
                        const isOpen = revenueListOpen.freeTrials
                        const visible = revenueListVisible.freeTrials ?? 10
                        const users = revenueData.freeTrialUsers
                        const shown = users.slice(0, visible)
                        return (
                          <div style={{ marginLeft: '8px', marginTop: '10px' }}>
                            <div
                              onClick={() => setRevenueListOpen(prev => ({ ...prev, freeTrials: !prev.freeTrials }))}
                              style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer', userSelect: 'none' }}
                              onMouseEnter={(e) => e.currentTarget.style.opacity = '0.8'}
                              onMouseLeave={(e) => e.currentTarget.style.opacity = '1'}
                            >
                              {isOpen ? <ChevronDown size={14} color="#6b7280" /> : <ChevronRight size={14} color="#6b7280" />}
                              <p style={{ color: '#6b7280', fontSize: '0.8rem', margin: 0, textTransform: 'uppercase', letterSpacing: '1px' }}>New trial users ({users.length})</p>
                            </div>
                            {isOpen && (
                              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginTop: '8px' }}>
                                {shown.map((u, i) => (
                                  <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 12px', background: 'rgba(93, 173, 226, 0.06)', borderRadius: '8px' }}>
                                    <span style={{ color: '#cccccc', fontSize: '0.9rem' }}>
                                      <User size={14} style={{ marginRight: '6px', verticalAlign: 'middle', opacity: 0.6 }} />
                                      {u.username}
                                    </span>
                                    <span style={{ color: '#666666', fontSize: '0.8rem' }}>{new Date(u.date).toLocaleDateString()}</span>
                                  </div>
                                ))}
                                <div style={{ display: 'flex', justifyContent: 'center', gap: '12px', marginTop: '6px' }}>
                                  {visible < users.length && (
                                    <div onClick={() => setRevenueListVisible(prev => ({ ...prev, freeTrials: (prev.freeTrials ?? 10) + 10 }))}
                                      style={{ padding: '6px 16px', borderRadius: '8px', background: 'rgba(93, 173, 226, 0.1)', border: '1px solid rgba(93, 173, 226, 0.2)', color: '#5dade2', fontSize: '0.8rem', cursor: 'pointer' }}>
                                      Show More ({users.length - visible} remaining)
                                    </div>
                                  )}
                                  {visible > 10 && (
                                    <div onClick={() => setRevenueListVisible(prev => ({ ...prev, freeTrials: 10 }))}
                                      style={{ padding: '6px 16px', borderRadius: '8px', background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', color: '#999999', fontSize: '0.8rem', cursor: 'pointer' }}>
                                      Show Less
                                    </div>
                                  )}
                                </div>
                              </div>
                            )}
                          </div>
                        )
                      })()}
                    </div>

                    {/* Credit Purchases Revenue */}
                    <div style={{ background: 'rgba(93, 173, 226, 0.06)', border: '1px solid rgba(93, 173, 226, 0.15)', borderRadius: '14px', padding: '24px' }}>
                      <h3 style={{ fontSize: '1.15rem', color: '#5dade2', marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '10px' }}>
                        <CreditCard size={20} color="#5dade2" />
                        Extra Usage / Credit Purchases
                      </h3>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                        <span style={{ color: '#cccccc', fontSize: '0.95rem' }}>
                          {revenueData.creditPurchaseCount} purchase{revenueData.creditPurchaseCount !== 1 ? 's' : ''} this period
                        </span>
                        <span style={{ color: '#ffffff', fontSize: '1.3rem', fontWeight: '700', fontFamily: 'monospace' }}>
                          ${revenueData.totalCreditRevenue?.toFixed(2)}
                        </span>
                      </div>
                      {revenueData.creditPurchases?.length > 0 && (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginTop: '12px', paddingTop: '12px', borderTop: '1px solid rgba(93, 173, 226, 0.1)' }}>
                          {revenueData.creditPurchases.map((p, i) => (
                            <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 12px', background: 'rgba(93, 173, 226, 0.06)', borderRadius: '8px' }}>
                              <span style={{ color: '#cccccc', fontSize: '0.9rem' }}>
                                <User size={14} style={{ marginRight: '6px', verticalAlign: 'middle', opacity: 0.6 }} />
                                {p.username}
                              </span>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                                <span style={{ color: '#ffffff', fontSize: '0.9rem', fontWeight: '600', fontFamily: 'monospace' }}>${p.total?.toFixed(2)}</span>
                                <span style={{ color: '#666666', fontSize: '0.8rem' }}>{new Date(p.date).toLocaleDateString()}</span>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>

                    {/* Store Purchases */}
                    <div style={{ background: 'rgba(93, 173, 226, 0.06)', border: '1px solid rgba(93, 173, 226, 0.15)', borderRadius: '14px', padding: '24px' }}>
                      <h3 style={{ fontSize: '1.15rem', color: '#5dade2', marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '10px' }}>
                        <DollarSign size={20} color="#5dade2" />
                        Store Purchases
                      </h3>
                      {(revenueData.storePurchaseCount ?? 0) === 0 ? (
                        <div style={{ textAlign: 'center', padding: '24px', color: '#6b7280', fontSize: '0.95rem' }}>
                          No store purchases this period
                        </div>
                      ) : (
                        <>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                            <span style={{ color: '#cccccc', fontSize: '0.95rem' }}>
                              {revenueData.storePurchaseCount} purchase{revenueData.storePurchaseCount !== 1 ? 's' : ''} this period
                            </span>
                            <span style={{ color: '#ffffff', fontSize: '1.3rem', fontWeight: '700', fontFamily: 'monospace' }}>
                              ${(revenueData.totalStoreRevenue ?? 0).toFixed(2)}
                            </span>
                          </div>
                          {revenueData.storePurchases?.length > 0 && (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginTop: '12px', paddingTop: '12px', borderTop: '1px solid rgba(93, 173, 226, 0.1)' }}>
                              {revenueData.storePurchases.map((p, i) => (
                                <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 12px', background: 'rgba(93, 173, 226, 0.06)', borderRadius: '8px' }}>
                                  <span style={{ color: '#cccccc', fontSize: '0.9rem' }}>
                                    <User size={14} style={{ marginRight: '6px', verticalAlign: 'middle', opacity: 0.6 }} />
                                    {p.username} — {p.item}
                                  </span>
                                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                                    <span style={{ color: '#ffffff', fontSize: '0.9rem', fontWeight: '600', fontFamily: 'monospace' }}>${p.total?.toFixed(2)}</span>
                                    <span style={{ color: '#666666', fontSize: '0.8rem' }}>{new Date(p.date).toLocaleDateString()}</span>
                                  </div>
                                </div>
                              ))}
                            </div>
                          )}
                        </>
                      )}
                    </div>

                    {/* Total Revenue */}
                    <div style={{
                      background: 'linear-gradient(135deg, rgba(93, 173, 226, 0.12), rgba(93, 173, 226, 0.08))',
                      border: '1px solid rgba(93, 173, 226, 0.3)',
                      borderRadius: '14px',
                      padding: '24px',
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                    }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                        <TrendingUp size={24} color="#5dade2" />
                        <span style={{ color: '#5dade2', fontSize: '1.25rem', fontWeight: '700' }}>Total Revenue</span>
                      </div>
                      <span style={{ color: '#ffffff', fontSize: '1.6rem', fontWeight: '800', fontFamily: 'monospace' }}>
                        ${revenueData.totalRevenue?.toFixed(2)}
                      </span>
                    </div>

                    {/* ── User Lists ── */}
                    <div style={{ background: 'rgba(93, 173, 226, 0.04)', border: '1px solid rgba(93, 173, 226, 0.12)', borderRadius: '14px', overflow: 'hidden' }}>
                      <div style={{ display: 'flex', borderBottom: '1px solid rgba(93, 173, 226, 0.1)' }}>
                        {[
                          { key: 'active', label: 'Active Paid', count: revenueData.activeUsersList?.length ?? 0 },
                          { key: 'freeTrial', label: 'Free Plan', count: revenueData.freeTrialUsersList?.length ?? 0 },
                          { key: 'inactive', label: 'Inactive / Canceled', count: revenueData.inactiveUsersList?.length ?? 0 },
                        ].map(({ key, label, count }) => {
                          const color = '#5dade2'
                          const isOpen = userListTab === key
                          return (
                            <div
                              key={key}
                              onClick={() => {
                                if (isOpen) {
                                  setUserListTab(null)
                                } else {
                                  setUserListTab(key)
                                  setUserListVisibleCount(prev => ({ ...prev, [key]: 5 }))
                                }
                              }}
                              style={{
                                flex: 1,
                                padding: '14px 12px',
                                textAlign: 'center',
                                cursor: 'pointer',
                                background: isOpen ? `${color}18` : 'transparent',
                                borderBottom: isOpen ? `2px solid ${color}` : '2px solid transparent',
                                transition: 'all 0.2s ease',
                              }}
                              onMouseEnter={(e) => { if (!isOpen) e.currentTarget.style.background = 'rgba(93, 173, 226, 0.06)' }}
                              onMouseLeave={(e) => { if (!isOpen) e.currentTarget.style.background = 'transparent' }}
                            >
                              <span style={{ color: isOpen ? color : '#999999', fontSize: '0.85rem', fontWeight: isOpen ? '600' : '400', transition: 'color 0.2s ease' }}>
                                {label}
                              </span>
                              <span style={{ color: isOpen ? color : '#666666', fontSize: '0.75rem', marginLeft: '6px', fontFamily: 'monospace' }}>({count})</span>
                            </div>
                          )
                        })}
                      </div>

                      {userListTab && (() => {
                        const listMap = {
                          active: revenueData.activeUsersList ?? [],
                          freeTrial: revenueData.freeTrialUsersList ?? [],
                          inactive: revenueData.inactiveUsersList ?? [],
                        }
                        const users = listMap[userListTab]
                        const color = '#5dade2'
                        const visibleCount = userListVisibleCount[userListTab] ?? 5
                        const visibleUsers = users.slice(0, visibleCount)
                        const hasMore = visibleCount < users.length
                        const isExpanded = visibleCount > 5

                        return (
                          <div style={{ padding: '16px 20px' }}>
                            {users.length === 0 ? (
                              <div style={{ textAlign: 'center', padding: '24px', color: '#6b7280', fontSize: '0.9rem' }}>
                                No users in this category
                              </div>
                            ) : (
                              <>
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                                  {visibleUsers.map((u, i) => (
                                    <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 14px', background: 'rgba(93, 173, 226, 0.04)', borderRadius: '10px', transition: 'background 0.15s ease' }}
                                      onMouseEnter={(e) => e.currentTarget.style.background = 'rgba(93, 173, 226, 0.08)'}
                                      onMouseLeave={(e) => e.currentTarget.style.background = 'rgba(93, 173, 226, 0.04)'}
                                    >
                                      <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                        <User size={14} style={{ color: color, opacity: 0.7 }} />
                                        <span style={{ color: '#dddddd', fontSize: '0.9rem' }}>{u.username}</span>
                                        {u.email && <span style={{ color: '#555555', fontSize: '0.75rem' }}>{u.email}</span>}
                                        {u.status && <span style={{ color: u.status === 'canceled' ? '#f87171' : '#999999', fontSize: '0.72rem', background: 'rgba(255,255,255,0.04)', padding: '2px 8px', borderRadius: '6px' }}>{u.status}</span>}
                                      </div>
                                      <span style={{ color: '#555555', fontSize: '0.78rem' }}>{u.date ? new Date(u.date).toLocaleDateString() : '—'}</span>
                                    </div>
                                  ))}
                                </div>
                                <div style={{ display: 'flex', justifyContent: 'center', gap: '12px', marginTop: '14px' }}>
                                  {hasMore && (
                                    <div
                                      onClick={() => setUserListVisibleCount(prev => ({ ...prev, [userListTab]: prev[userListTab] + 10 }))}
                                      style={{ padding: '8px 20px', borderRadius: '8px', background: `${color}15`, border: `1px solid ${color}30`, color, fontSize: '0.85rem', cursor: 'pointer', transition: 'all 0.2s ease' }}
                                      onMouseEnter={(e) => { e.currentTarget.style.background = `${color}25` }}
                                      onMouseLeave={(e) => { e.currentTarget.style.background = `${color}15` }}
                                    >
                                      View More ({users.length - visibleCount} remaining)
                                    </div>
                                  )}
                                  {isExpanded && (
                                    <div
                                      onClick={() => setUserListVisibleCount(prev => ({ ...prev, [userListTab]: 5 }))}
                                      style={{ padding: '8px 20px', borderRadius: '8px', background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', color: '#999999', fontSize: '0.85rem', cursor: 'pointer', transition: 'all 0.2s ease' }}
                                      onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(255,255,255,0.08)' }}
                                      onMouseLeave={(e) => { e.currentTarget.style.background = 'rgba(255,255,255,0.04)' }}
                                    >
                                      Show Less
                                    </div>
                                  )}
                                </div>
                              </>
                            )}
                          </div>
                        )
                      })()}
                    </div>

                    {/* Net Profit / Loss */}
                    {(() => {
                      const totalExpensesWithTrials = effectiveGrandTotal + (revenueData.totalFreeTrialCost ?? 0) + (revenueData.totalBadgeTierCost ?? 0)
                      const netAmount = (revenueData.totalRevenue || 0) - totalExpensesWithTrials
                      const isProfit = netAmount >= 0
                      return (
                        <div style={{
                          background: 'linear-gradient(135deg, rgba(93, 173, 226, 0.12), rgba(93, 173, 226, 0.06))',
                          border: '2px solid rgba(93, 173, 226, 0.4)',
                          borderRadius: '20px',
                          padding: '32px',
                        }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                              <span style={{ color: '#5dade2', fontSize: '1.5rem', fontWeight: '700', display: 'flex', alignItems: 'center', gap: '10px' }}>
                                <TrendingUp size={28} color="#5dade2" style={!isProfit ? { transform: 'scaleY(-1)' } : {}} />
                                Net {isProfit ? 'Profit' : 'Loss'}
                              </span>
                              <span style={{ color: '#666666', fontSize: '0.9rem' }}>
                                Revenue ${revenueData.totalRevenue?.toFixed(2)} − Expenses ${totalExpensesWithTrials.toFixed(2)}
                              </span>
                            </div>
                            <span style={{ color: '#ffffff', fontSize: '2rem', fontWeight: '800', fontFamily: 'monospace' }}>
                              {isProfit ? '+' : '-'}${Math.abs(netAmount).toFixed(2)}
                            </span>
                          </div>
                        </div>
                      )
                    })()}
                  </div>
                )}
              </div>
            )}

            {/* ═══════════════════ EXPENSES TAB ═══════════════════ */}
            {expensesSubSection === 'expenses' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>

                {/* Period Selector */}
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '16px', flexWrap: 'wrap' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
                    <div style={{ position: 'relative' }}>
                      <div
                        onClick={() => setPeriodDropdownOpen(!periodDropdownOpen)}
                        style={{
                          background: 'rgba(93, 173, 226, 0.1)',
                          border: '1px solid rgba(93, 173, 226, 0.3)',
                          borderRadius: '10px',
                          padding: '10px 16px',
                          color: '#ffffff',
                          fontSize: '1rem',
                          cursor: 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '8px',
                          minWidth: '130px',
                          justifyContent: 'space-between',
                          transition: 'all 0.2s ease',
                        }}
                      >
                        <span>{periodOptions.find(o => o.value === timePeriod)?.label}</span>
                        <ChevronDown size={16} style={{ transition: 'transform 0.2s ease', transform: periodDropdownOpen ? 'rotate(180deg)' : 'rotate(0deg)' }} />
                      </div>
                      {periodDropdownOpen && (
                        <>
                          <div onClick={() => setPeriodDropdownOpen(false)} style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, zIndex: 99 }} />
                          <div style={{ position: 'absolute', top: 'calc(100% + 6px)', left: 0, background: '#0a0a0a', border: '1px solid rgba(93, 173, 226, 0.2)', borderRadius: '12px', padding: '6px', zIndex: 100, minWidth: '160px', boxShadow: '0 12px 40px rgba(0,0,0,0.5)' }}>
                            {periodOptions.map(opt => (
                              <div
                                key={opt.value}
                                onClick={() => { setTimePeriod(opt.value); setPeriodDropdownOpen(false); loadPeriodData(opt.value, referenceDate) }}
                                style={{ padding: '10px 14px', borderRadius: '8px', cursor: 'pointer', color: timePeriod === opt.value ? '#ffffff' : '#cccccc', background: timePeriod === opt.value ? 'rgba(93, 173, 226, 0.25)' : 'transparent', fontSize: '0.95rem', transition: 'all 0.15s ease' }}
                                onMouseEnter={(e) => { if (timePeriod !== opt.value) e.currentTarget.style.background = 'rgba(93, 173, 226, 0.1)' }}
                                onMouseLeave={(e) => { if (timePeriod !== opt.value) e.currentTarget.style.background = 'transparent' }}
                              >
                                {opt.label}
                              </div>
                            ))}
                          </div>
                        </>
                      )}
                    </div>

                    {timePeriod === 'day' && (
                      <input type="date" value={referenceDate} onChange={(e) => { setReferenceDate(e.target.value); loadPeriodData('day', e.target.value) }}
                        style={{ background: 'rgba(93, 173, 226, 0.06)', border: '1px solid rgba(93, 173, 226, 0.2)', borderRadius: '10px', padding: '10px 16px', color: '#ffffff', fontSize: '1rem', outline: 'none', cursor: 'pointer', colorScheme: 'dark' }} />
                    )}
                    {timePeriod === 'week' && (
                      <input type="date" value={referenceDate} onChange={(e) => { setReferenceDate(e.target.value); loadPeriodData('week', e.target.value) }}
                        style={{ background: 'rgba(93, 173, 226, 0.06)', border: '1px solid rgba(93, 173, 226, 0.2)', borderRadius: '10px', padding: '10px 16px', color: '#ffffff', fontSize: '1rem', outline: 'none', cursor: 'pointer', colorScheme: 'dark' }} />
                    )}
                    {timePeriod === 'month' && (
                      <input type="month" value={expenseMonth} onChange={(e) => { const m = e.target.value; setExpenseMonth(m); setReferenceDate(m + '-01'); setExpensesLoaded(false); loadPeriodData('month', m + '-01') }}
                        style={{ background: 'rgba(93, 173, 226, 0.06)', border: '1px solid rgba(93, 173, 226, 0.2)', borderRadius: '10px', padding: '10px 16px', color: '#ffffff', fontSize: '1rem', outline: 'none', cursor: 'pointer', colorScheme: 'dark' }} />
                    )}
                    {timePeriod === 'quarter' && (() => {
                      const ref = new Date(referenceDate + 'T00:00:00')
                      const currentQ = Math.ceil((ref.getMonth() + 1) / 3)
                      const currentY = ref.getFullYear()
                      return (
                        <div style={{ display: 'flex', gap: '8px' }}>
                          <select value={currentQ} onChange={(e) => { const q = parseInt(e.target.value); const nd = `${currentY}-${String((q - 1) * 3 + 1).padStart(2, '0')}-01`; setReferenceDate(nd); loadPeriodData('quarter', nd) }}
                            style={{ background: 'rgba(93, 173, 226, 0.06)', border: '1px solid rgba(93, 173, 226, 0.2)', borderRadius: '10px', padding: '10px 16px', color: '#ffffff', fontSize: '1rem', outline: 'none', cursor: 'pointer', colorScheme: 'dark' }}>
                            <option value={1} style={{ background: '#0a0a0a' }}>Q1 (Jan–Mar)</option>
                            <option value={2} style={{ background: '#0a0a0a' }}>Q2 (Apr–Jun)</option>
                            <option value={3} style={{ background: '#0a0a0a' }}>Q3 (Jul–Sep)</option>
                            <option value={4} style={{ background: '#0a0a0a' }}>Q4 (Oct–Dec)</option>
                          </select>
                          <input type="number" value={currentY} min={2024} max={2035} onChange={(e) => { const nd = `${e.target.value}-${String((currentQ - 1) * 3 + 1).padStart(2, '0')}-01`; setReferenceDate(nd); loadPeriodData('quarter', nd) }}
                            style={{ background: 'rgba(93, 173, 226, 0.06)', border: '1px solid rgba(93, 173, 226, 0.2)', borderRadius: '10px', padding: '10px 16px', color: '#ffffff', fontSize: '1rem', width: '100px', outline: 'none', colorScheme: 'dark' }} />
                        </div>
                      )
                    })()}
                    {timePeriod === 'year' && (
                      <input type="number" value={new Date(referenceDate + 'T00:00:00').getFullYear()} min={2024} max={2035} onChange={(e) => { const nd = `${e.target.value}-01-01`; setReferenceDate(nd); loadPeriodData('year', nd) }}
                        style={{ background: 'rgba(93, 173, 226, 0.06)', border: '1px solid rgba(93, 173, 226, 0.2)', borderRadius: '10px', padding: '10px 16px', color: '#ffffff', fontSize: '1rem', width: '110px', outline: 'none', colorScheme: 'dark' }} />
                    )}

                    {timePeriod !== 'all' && (
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <div
                          onClick={() => shiftPeriod('prev')}
                          style={{ width: '32px', height: '32px', borderRadius: '8px', background: 'rgba(93, 173, 226, 0.08)', border: '1px solid rgba(93, 173, 226, 0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', transition: 'all 0.15s ease' }}
                          onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(93, 173, 226, 0.2)' }}
                          onMouseLeave={(e) => { e.currentTarget.style.background = 'rgba(93, 173, 226, 0.08)' }}
                        >
                          <ChevronLeft size={16} color="#5dade2" />
                        </div>
                        <span style={{ color: '#6b7280', fontSize: '0.9rem', fontStyle: 'italic', minWidth: '120px', textAlign: 'center' }}>{getPeriodLabel()}</span>
                        <div
                          onClick={() => shiftPeriod('next')}
                          style={{ width: '32px', height: '32px', borderRadius: '8px', background: 'rgba(93, 173, 226, 0.08)', border: '1px solid rgba(93, 173, 226, 0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', transition: 'all 0.15s ease' }}
                          onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(93, 173, 226, 0.2)' }}
                          onMouseLeave={(e) => { e.currentTarget.style.background = 'rgba(93, 173, 226, 0.08)' }}
                        >
                          <ChevronRight size={16} color="#5dade2" />
                        </div>
                      </div>
                    )}
                    {timePeriod === 'all' && (
                      <span style={{ color: '#6b7280', fontSize: '0.9rem', fontStyle: 'italic' }}>{getPeriodLabel()}</span>
                    )}
                  </div>

                  {timePeriod === 'month' && (
                    <span style={{ color: expensesSaving ? '#5dade2' : '#48c9b0', fontSize: '0.85rem', opacity: 0.8, transition: 'all 0.3s ease' }}>
                      {expensesSaving ? '⏳ Saving...' : expensesLoaded ? '✅ Auto-saved' : ''}
                    </span>
                  )}
                </div>

                {/* MONTH VIEW: Editable expense inputs */}
                {timePeriod === 'month' && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                    <div style={{ background: 'rgba(93, 173, 226, 0.06)', border: '1px solid rgba(93, 173, 226, 0.15)', borderRadius: '14px', padding: '24px' }}>
                      <h3 style={{ fontSize: '1.15rem', color: '#5dade2', marginBottom: '20px', display: 'flex', alignItems: 'center', gap: '10px' }}>
                        <BarChart3 size={20} color="#5dade2" />
                        API Costs Per Provider
                      </h3>
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '16px' }}>
                        {[
                          { key: 'openaiCost', label: 'OpenAI (ChatGPT)' },
                          { key: 'anthropicCost', label: 'Anthropic (Claude)' },
                          { key: 'googleCost', label: 'Google (Gemini)' },
                          { key: 'xaiCost', label: 'xAI (Grok)' },
                        ].map(({ key, label }) => (
                          <div key={key} style={{ background: 'rgba(255, 255, 255, 0.03)', border: '1px solid rgba(93, 173, 226, 0.15)', borderRadius: '12px', padding: '16px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                            <label style={{ color: '#ffffff', fontSize: '0.95rem', fontWeight: '500' }}>{label}</label>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                              <span style={{ color: '#aaaaaa', fontSize: '1rem' }}>$</span>
                              <input type="text" value={expenses[key]} onChange={(e) => handleExpenseChange(key, e.target.value)} placeholder="0.00"
                                style={{ background: 'rgba(255, 255, 255, 0.06)', border: '1px solid rgba(93, 173, 226, 0.25)', borderRadius: '8px', padding: '10px 14px', color: '#ffffff', fontSize: '1rem', width: '100%', outline: 'none', transition: 'border-color 0.2s ease' }}
                                onFocus={(e) => e.target.style.borderColor = 'rgba(93, 173, 226, 0.6)'} onBlur={(e) => e.target.style.borderColor = 'rgba(93, 173, 226, 0.25)'} />
                            </div>
                          </div>
                        ))}
                      </div>
                      <div style={{ marginTop: '20px', paddingTop: '20px', borderTop: '1px solid rgba(93, 173, 226, 0.15)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span style={{ color: '#5dade2', fontSize: '1.15rem', fontWeight: '600' }}>Total API Cost</span>
                        <span style={{ color: '#ffffff', fontSize: '1.3rem', fontWeight: '700', fontFamily: 'monospace' }}>${totalApiCost.toFixed(2)}</span>
                      </div>
                    </div>

                    <div style={{ background: 'rgba(93, 173, 226, 0.06)', border: '1px solid rgba(93, 173, 226, 0.15)', borderRadius: '14px', padding: '24px' }}>
                      <h3 style={{ fontSize: '1.15rem', color: '#5dade2', marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '10px' }}>
                        <CreditCard size={20} color="#5dade2" />
                        Stripe Fees
                      </h3>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                        <span style={{ color: '#cccccc', fontSize: '1.1rem' }}>$</span>
                        <input type="text" value={expenses.stripeFees} onChange={(e) => handleExpenseChange('stripeFees', e.target.value)} placeholder="0.00"
                          style={{ background: 'rgba(255, 255, 255, 0.06)', border: '1px solid rgba(93, 173, 226, 0.3)', borderRadius: '10px', padding: '12px 16px', color: '#ffffff', fontSize: '1.1rem', width: '200px', outline: 'none', transition: 'border-color 0.2s ease' }}
                          onFocus={(e) => e.target.style.borderColor = 'rgba(93, 173, 226, 0.7)'} onBlur={(e) => e.target.style.borderColor = 'rgba(93, 173, 226, 0.3)'} />
                      </div>
                    </div>

                    {[
                      { key: 'serperCost', label: 'Serper API' },
                      { key: 'resendCost', label: 'Resend Email' },
                      { key: 'mongoDbCost', label: 'MongoDB Database' },
                      { key: 'vercelCost', label: 'Vercel Hosting' },
                      { key: 'domainCost', label: 'Domain Name' },
                    ].map(({ key, label }) => (
                      <div key={key} style={{ background: 'rgba(255, 255, 255, 0.03)', border: '1px solid rgba(93, 173, 226, 0.15)', borderRadius: '14px', padding: '24px' }}>
                        <h3 style={{ fontSize: '1.15rem', color: '#ffffff', marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '10px' }}>
                          <Package size={20} color="#ffffff" />
                          {label}
                        </h3>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                          <span style={{ color: '#cccccc', fontSize: '1.1rem' }}>$</span>
                          <input type="text" value={expenses[key]} onChange={(e) => handleExpenseChange(key, e.target.value)} placeholder="0.00"
                            style={{ background: 'rgba(255, 255, 255, 0.06)', border: '1px solid rgba(93, 173, 226, 0.25)', borderRadius: '10px', padding: '12px 16px', color: '#ffffff', fontSize: '1.1rem', width: '200px', outline: 'none', transition: 'border-color 0.2s ease' }}
                            onFocus={(e) => e.target.style.borderColor = 'rgba(93, 173, 226, 0.6)'} onBlur={(e) => e.target.style.borderColor = 'rgba(93, 173, 226, 0.25)'} />
                        </div>
                      </div>
                    ))}

                    {/* Free Plan Costs */}
                    {revenueData && (revenueData.activeFreeTrials ?? 0) > 0 && (
                      <div style={{ background: 'rgba(251, 191, 36, 0.08)', border: '1px solid rgba(251, 191, 36, 0.20)', borderRadius: '14px', padding: '24px' }}>
                        <h3 style={{ fontSize: '1.15rem', color: '#fbbf24', marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '10px' }}>
                          <User size={20} color="#fbbf24" />
                          Free Plan Costs
                          <span style={{ fontSize: '0.75rem', color: '#a08520', fontWeight: '500' }}>(per month)</span>
                        </h3>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 14px', background: 'rgba(251, 191, 36, 0.04)', borderRadius: '10px' }}>
                          <span style={{ color: '#cccccc', fontSize: '0.95rem' }}>
                            Trial Users: {revenueData.newFreeTrials} at $1
                          </span>
                          <span style={{ color: '#ffffff', fontSize: '1.2rem', fontWeight: '700', fontFamily: 'monospace' }}>
                            ${(revenueData.totalFreeTrialCost ?? 0).toFixed(2)}
                          </span>
                        </div>
                      </div>
                    )}

                    {revenueData?.badgeTierUsers?.length > 0 && (
                      <div style={{ background: 'rgba(205, 127, 50, 0.08)', border: '1px solid rgba(205, 127, 50, 0.20)', borderRadius: '14px', padding: '24px' }}>
                        <h3 style={{ fontSize: '1.15rem', color: '#CD7F32', marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '10px' }}>
                          <Award size={20} color="#CD7F32" />
                          Badge Tier Rewards
                        </h3>
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '8px', marginBottom: '12px' }}>
                          {[
                            { name: 'Bronze', color: '#CD7F32', count: revenueData.badgeTierSummary?.Bronze ?? 0, reward: '$0.25' },
                            { name: 'Silver', color: '#C0C0C0', count: revenueData.badgeTierSummary?.Silver ?? 0, reward: '$0.50' },
                            { name: 'Gold', color: '#FFD700', count: revenueData.badgeTierSummary?.Gold ?? 0, reward: '$0.75' },
                            { name: 'Platinum', color: '#E5E4E2', count: revenueData.badgeTierSummary?.Platinum ?? 0, reward: '$1.00' },
                          ].map(({ name, color, count, reward }) => (
                            <div key={name} style={{ padding: '8px', background: `${color}08`, border: `1px solid ${color}25`, borderRadius: '8px', textAlign: 'center' }}>
                              <p style={{ color, fontSize: '0.75rem', fontWeight: '700', margin: 0 }}>{name}</p>
                              <p style={{ color: '#ffffff', fontSize: '1.1rem', fontWeight: '700', margin: '2px 0' }}>{count}</p>
                              <p style={{ color: '#888888', fontSize: '0.6rem', margin: 0 }}>{reward}/mo</p>
                            </div>
                          ))}
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 14px', background: 'rgba(205, 127, 50, 0.04)', borderRadius: '10px' }}>
                          <span style={{ color: '#cccccc', fontSize: '0.95rem' }}>
                            {revenueData.badgeTierUsers.length} user{revenueData.badgeTierUsers.length !== 1 ? 's' : ''} with rewards
                          </span>
                          <span style={{ color: '#ffffff', fontSize: '1.2rem', fontWeight: '700', fontFamily: 'monospace' }}>
                            ${(revenueData.totalBadgeTierCost ?? 0).toFixed(2)}/mo
                          </span>
                        </div>
                      </div>
                    )}

                    <div style={{ background: 'rgba(168, 85, 247, 0.06)', border: '1px solid rgba(168, 85, 247, 0.20)', borderRadius: '14px', padding: '24px', position: 'relative', opacity: 0.7 }}>
                      <div style={{ position: 'absolute', top: '12px', right: '16px', background: 'rgba(168, 85, 247, 0.15)', border: '1px solid rgba(168, 85, 247, 0.3)', borderRadius: '6px', padding: '3px 10px' }}>
                        <span style={{ color: '#a855f7', fontSize: '0.7rem', fontWeight: '600', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Not Yet Enabled</span>
                      </div>
                      <h3 style={{ fontSize: '1.15rem', color: '#a855f7', marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '10px' }}>
                        <Trophy size={20} color="#a855f7" />
                        Daily Favorites Rewards
                        <span style={{ fontSize: '0.75rem', color: '#7c3aed', fontWeight: '500' }}>(hypothetical)</span>
                      </h3>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 14px', background: 'rgba(168, 85, 247, 0.04)', borderRadius: '10px' }}>
                          <span style={{ color: '#cccccc', fontSize: '0.95rem' }}>
                            Top 5 users × $5.00/day free usage
                          </span>
                          <span style={{ color: '#cccccc', fontSize: '1rem', fontWeight: '600', fontFamily: 'monospace' }}>
                            $25.00/day
                          </span>
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 14px', background: 'rgba(168, 85, 247, 0.06)', borderRadius: '10px' }}>
                          <span style={{ color: '#cccccc', fontSize: '0.95rem' }}>
                            Projected for this {timePeriod === 'month' ? 'month (~30 days)' : 'period'}
                          </span>
                          <span style={{ color: '#a855f7', fontSize: '1.2rem', fontWeight: '700', fontFamily: 'monospace' }}>
                            ${dailyFavoritesHypothetical.toFixed(2)}
                          </span>
                        </div>
                      </div>
                    </div>

                    <div style={{
                      background: 'linear-gradient(135deg, rgba(93, 173, 226, 0.12), rgba(72, 201, 176, 0.08))',
                      border: '1px solid rgba(93, 173, 226, 0.3)',
                      borderRadius: '14px',
                      padding: '24px',
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                    }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                        <Receipt size={24} color="#5dade2" />
                        <span style={{ color: '#5dade2', fontSize: '1.25rem', fontWeight: '700' }}>Total Expenses</span>
                      </div>
                      <span style={{ color: '#ffffff', fontSize: '1.6rem', fontWeight: '800', fontFamily: 'monospace' }}>${(grandTotal + (revenueData?.totalFreeTrialCost ?? 0) + (revenueData?.totalBadgeTierCost ?? 0)).toFixed(2)}</span>
                    </div>
                  </div>
                )}

                {/* NON-MONTH VIEW: Read-only aggregated expenses */}
                {timePeriod !== 'month' && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                    {loadingAggExpenses ? (
                      <div style={{ textAlign: 'center', padding: '40px', color: '#aaaaaa' }}>Loading expense data...</div>
                    ) : !aggregatedExpenses ? (
                      <div style={{ textAlign: 'center', padding: '40px', color: '#aaaaaa' }}>No expense data available for this period</div>
                    ) : (() => {
                      const agg = aggregatedExpenses.expenses
                      const aggApiTotal = aggregatedExpenses.totalApiCost || 0
                      const aggGrand = aggregatedExpenses.grandTotal || 0
                      const apiProviders = [
                        { key: 'openaiCost', label: 'OpenAI (ChatGPT)' },
                        { key: 'anthropicCost', label: 'Anthropic (Claude)' },
                        { key: 'googleCost', label: 'Google (Gemini)' },
                        { key: 'xaiCost', label: 'xAI (Grok)' },
                      ]
                      const otherServices = [
                        { key: 'serperCost', label: 'Serper API' },
                        { key: 'resendCost', label: 'Resend Email' },
                        { key: 'mongoDbCost', label: 'MongoDB Database' },
                        { key: 'vercelCost', label: 'Vercel Hosting' },
                        { key: 'domainCost', label: 'Domain Name' },
                      ]
                      return (
                        <>
                          <div style={{ background: 'rgba(93, 173, 226, 0.06)', border: '1px solid rgba(93, 173, 226, 0.15)', borderRadius: '14px', padding: '24px' }}>
                            <h3 style={{ fontSize: '1.15rem', color: '#5dade2', marginBottom: '20px', display: 'flex', alignItems: 'center', gap: '10px' }}>
                              <BarChart3 size={20} color="#5dade2" />
                              API Costs Per Provider
                            </h3>
                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '12px' }}>
                              {apiProviders.map(({ key, label }) => (
                                <div key={key} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 16px', background: 'rgba(255, 255, 255, 0.03)', border: '1px solid rgba(93, 173, 226, 0.15)', borderRadius: '10px' }}>
                                  <span style={{ color: '#ffffff', fontSize: '0.95rem', fontWeight: '500' }}>{label}</span>
                                  <span style={{ color: '#ffffff', fontSize: '1.05rem', fontWeight: '600', fontFamily: 'monospace' }}>${(agg[key] || 0).toFixed(2)}</span>
                                </div>
                              ))}
                            </div>
                            <div style={{ marginTop: '20px', paddingTop: '20px', borderTop: '1px solid rgba(93, 173, 226, 0.15)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                              <span style={{ color: '#5dade2', fontSize: '1.15rem', fontWeight: '600' }}>Total API Cost</span>
                              <span style={{ color: '#ffffff', fontSize: '1.3rem', fontWeight: '700', fontFamily: 'monospace' }}>${aggApiTotal.toFixed(2)}</span>
                            </div>
                          </div>

                          {(agg.stripeFees || 0) > 0 && (
                            <div style={{ background: 'rgba(93, 173, 226, 0.06)', border: '1px solid rgba(93, 173, 226, 0.15)', borderRadius: '14px', padding: '24px' }}>
                              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                <h3 style={{ fontSize: '1.15rem', color: '#5dade2', margin: 0, display: 'flex', alignItems: 'center', gap: '10px' }}>
                                  <CreditCard size={20} color="#5dade2" />
                                  Stripe Fees
                                </h3>
                                <span style={{ color: '#ffffff', fontSize: '1.2rem', fontWeight: '700', fontFamily: 'monospace' }}>${(agg.stripeFees || 0).toFixed(2)}</span>
                              </div>
                            </div>
                          )}

                          {otherServices.map(({ key, label }) => (
                            <div key={key} style={{ background: 'rgba(255, 255, 255, 0.03)', border: '1px solid rgba(93, 173, 226, 0.15)', borderRadius: '14px', padding: '24px' }}>
                              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                <h3 style={{ fontSize: '1.15rem', color: '#ffffff', margin: 0, display: 'flex', alignItems: 'center', gap: '10px' }}>
                                  <Package size={20} color="#ffffff" />
                                  {label}
                                </h3>
                                <span style={{ color: '#ffffff', fontSize: '1.2rem', fontWeight: '700', fontFamily: 'monospace' }}>${(agg[key] || 0).toFixed(2)}</span>
                              </div>
                            </div>
                          ))}

                          {/* Free Plan Costs */}
                          {revenueData && (revenueData.activeFreeTrials ?? 0) > 0 && (
                            <div style={{ background: 'rgba(251, 191, 36, 0.08)', border: '1px solid rgba(251, 191, 36, 0.20)', borderRadius: '14px', padding: '24px' }}>
                              <h3 style={{ fontSize: '1.15rem', color: '#fbbf24', marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '10px' }}>
                                <User size={20} color="#fbbf24" />
                                Free Plan Costs
                                <span style={{ fontSize: '0.75rem', color: '#a08520', fontWeight: '500' }}>(per month)</span>
                              </h3>
                              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 14px', background: 'rgba(251, 191, 36, 0.04)', borderRadius: '10px' }}>
                                <span style={{ color: '#cccccc', fontSize: '0.95rem' }}>
                                  Trial Users: {revenueData.newFreeTrials} at $1
                                </span>
                                <span style={{ color: '#ffffff', fontSize: '1.2rem', fontWeight: '700', fontFamily: 'monospace' }}>
                                  ${(revenueData.totalFreeTrialCost ?? 0).toFixed(2)}
                                </span>
                              </div>
                            </div>
                          )}

                          {/* Badge Tier Rewards Cost (aggregated) */}
                          {revenueData?.badgeTierUsers?.length > 0 && (
                            <div style={{ background: 'rgba(205, 127, 50, 0.08)', border: '1px solid rgba(205, 127, 50, 0.20)', borderRadius: '14px', padding: '24px' }}>
                              <h3 style={{ fontSize: '1.15rem', color: '#CD7F32', marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '10px' }}>
                                <Award size={20} color="#CD7F32" />
                                Badge Tier Rewards
                              </h3>
                              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '8px', marginBottom: '12px' }}>
                                {[
                                  { name: 'Bronze', color: '#CD7F32', count: revenueData.badgeTierSummary?.Bronze ?? 0, reward: '$0.25' },
                                  { name: 'Silver', color: '#C0C0C0', count: revenueData.badgeTierSummary?.Silver ?? 0, reward: '$0.50' },
                                  { name: 'Gold', color: '#FFD700', count: revenueData.badgeTierSummary?.Gold ?? 0, reward: '$0.75' },
                                  { name: 'Platinum', color: '#E5E4E2', count: revenueData.badgeTierSummary?.Platinum ?? 0, reward: '$1.00' },
                                ].map(({ name, color, count, reward }) => (
                                  <div key={name} style={{ padding: '8px', background: `${color}08`, border: `1px solid ${color}25`, borderRadius: '8px', textAlign: 'center' }}>
                                    <p style={{ color, fontSize: '0.75rem', fontWeight: '700', margin: 0 }}>{name}</p>
                                    <p style={{ color: '#ffffff', fontSize: '1.1rem', fontWeight: '700', margin: '2px 0' }}>{count}</p>
                                    <p style={{ color: '#888888', fontSize: '0.6rem', margin: 0 }}>{reward}/mo</p>
                                  </div>
                                ))}
                              </div>
                              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 14px', background: 'rgba(205, 127, 50, 0.04)', borderRadius: '10px' }}>
                                <span style={{ color: '#cccccc', fontSize: '0.95rem' }}>
                                  {revenueData.badgeTierUsers.length} user{revenueData.badgeTierUsers.length !== 1 ? 's' : ''} with rewards
                                </span>
                                <span style={{ color: '#ffffff', fontSize: '1.2rem', fontWeight: '700', fontFamily: 'monospace' }}>
                                  ${(revenueData.totalBadgeTierCost ?? 0).toFixed(2)}/mo
                                </span>
                              </div>
                            </div>
                          )}

                          <div style={{ background: 'rgba(168, 85, 247, 0.06)', border: '1px solid rgba(168, 85, 247, 0.20)', borderRadius: '14px', padding: '24px', position: 'relative', opacity: 0.7 }}>
                            <div style={{ position: 'absolute', top: '12px', right: '16px', background: 'rgba(168, 85, 247, 0.15)', border: '1px solid rgba(168, 85, 247, 0.3)', borderRadius: '6px', padding: '3px 10px' }}>
                              <span style={{ color: '#a855f7', fontSize: '0.7rem', fontWeight: '600', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Not Yet Enabled</span>
                            </div>
                            <h3 style={{ fontSize: '1.15rem', color: '#a855f7', marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '10px' }}>
                              <Trophy size={20} color="#a855f7" />
                              Daily Favorites Rewards
                              <span style={{ fontSize: '0.75rem', color: '#7c3aed', fontWeight: '500' }}>(hypothetical)</span>
                            </h3>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 14px', background: 'rgba(168, 85, 247, 0.04)', borderRadius: '10px' }}>
                                <span style={{ color: '#cccccc', fontSize: '0.95rem' }}>
                                  Top 5 users × $5.00/day free usage
                                </span>
                                <span style={{ color: '#cccccc', fontSize: '1rem', fontWeight: '600', fontFamily: 'monospace' }}>
                                  $25.00/day
                                </span>
                              </div>
                              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 14px', background: 'rgba(168, 85, 247, 0.06)', borderRadius: '10px' }}>
                                <span style={{ color: '#cccccc', fontSize: '0.95rem' }}>
                                  Projected for this {timePeriod === 'day' ? 'day' : timePeriod === 'week' ? 'week (~7 days)' : timePeriod === 'quarter' ? 'quarter (~90 days)' : timePeriod === 'year' ? 'year (~365 days)' : 'period'}
                                </span>
                                <span style={{ color: '#a855f7', fontSize: '1.2rem', fontWeight: '700', fontFamily: 'monospace' }}>
                                  ${dailyFavoritesHypothetical.toFixed(2)}
                                </span>
                              </div>
                            </div>
                          </div>

                          <div style={{
                            background: 'linear-gradient(135deg, rgba(93, 173, 226, 0.12), rgba(72, 201, 176, 0.08))',
                            border: '1px solid rgba(93, 173, 226, 0.3)',
                            borderRadius: '14px',
                            padding: '24px',
                            display: 'flex',
                            justifyContent: 'space-between',
                            alignItems: 'center',
                          }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                              <Receipt size={24} color="#5dade2" />
                              <span style={{ color: '#5dade2', fontSize: '1.25rem', fontWeight: '700' }}>Total Expenses</span>
                            </div>
                            <span style={{ color: '#ffffff', fontSize: '1.6rem', fontWeight: '800', fontFamily: 'monospace' }}>${(aggGrand + (revenueData?.totalFreeTrialCost ?? 0) + (revenueData?.totalBadgeTierCost ?? 0)).toFixed(2)}</span>
                          </div>

                          {aggregatedExpenses?.months?.length > 0 && (
                            <div style={{ textAlign: 'center', color: '#6b7280', fontSize: '0.85rem' }}>
                              Aggregated from {aggregatedExpenses.months.length} month{aggregatedExpenses.months.length !== 1 ? 's' : ''}
                            </div>
                          )}
                        </>
                      )
                    })()}
                  </div>
                )}

              </div>
            )}

              </div>
            )}
          </>
        )}
      </div>
    </motion.div>
  )
}

export default AdminView

