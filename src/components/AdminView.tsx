import type React from 'react';
import { useEffect, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Shield, ArrowLeft } from 'lucide-react'
import { useStore } from '../store/useStore'
import { getTheme } from '../utils/theme'
import { spacing, fontSize, fontWeight, radius, zIndex, transition, layout, sx, createStyles } from '../utils/styles'
import api from '../utils/api'
import { getAllModels, LLM_PROVIDERS } from '../services/llmProviders'

import AdminLoginForm from './admin/AdminLoginForm'
import AdminMainDashboard from './admin/AdminMainDashboard'
import AdminUsersSection from './admin/AdminUsersSection'
import AdminModelsSection from './admin/AdminModelsSection'
import AdminPricingSection from './admin/AdminPricingSection'
import AdminRevenueExpenses from './admin/AdminRevenueExpenses'

const AdminView = () => {
  const currentUser = useStore((state) => state.currentUser)
  const setCurrentUser = useStore((state) => state.setCurrentUser)
  const theme = useStore((state) => state.theme || 'dark')
  const currentTheme = getTheme(theme)
  const s = createStyles(currentTheme)
  const [usersData, setUsersData] = useState<any>(null)
  const [pricingData, setPricingData] = useState<any>(null)
  const [costsData, setCostsData] = useState<any>(null)
  const [isAdmin, setIsAdmin] = useState(false)
  const [loading, setLoading] = useState(false)
  const [expandedProviders, setExpandedProviders] = useState<Record<string, boolean>>({})
  const [expandedUsers, setExpandedUsers] = useState<Record<string, boolean>>({})
  const [expandedUserProviders, setExpandedUserProviders] = useState<Record<string, boolean>>({})
  const [expandedUserModels, setExpandedUserModels] = useState<Record<string, boolean>>({})

  const [showLogin, setShowLogin] = useState(true)
  const [adminCheckComplete, setAdminCheckComplete] = useState(false)
  const [loginData, setLoginData] = useState({ username: '', password: '' })
  const [loginError, setLoginError] = useState('')
  const [loginLoading, setLoginLoading] = useState(false)
  const [activeSection, setActiveSection] = useState('main')
  const [userSearchQuery, setUserSearchQuery] = useState('')
  const [userStatsData, setUserStatsData] = useState<Record<string, any>>({})
  const [loadingUserStats, setLoadingUserStats] = useState<Record<string, boolean>>({})

  const [userFilter, setUserFilter] = useState('all')
  const [expenses, setExpenses] = useState<Record<string, string>>({
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
  const [expenseSaveTimer, setExpenseSaveTimer] = useState<ReturnType<typeof setTimeout> | null>(null)
  const [revenueData, setRevenueData] = useState<any>(null)
  const [loadingRevenue, setLoadingRevenue] = useState(false)
  const [timePeriod, setTimePeriod] = useState('month')
  const [periodDropdownOpen, setPeriodDropdownOpen] = useState(false)
  const [referenceDate, setReferenceDate] = useState(() => {
    const now = new Date()
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
  })
  const [aggregatedExpenses, setAggregatedExpenses] = useState<any>(null)
  const [loadingAggExpenses, setLoadingAggExpenses] = useState(false)
  const [expensesSubSection, setExpensesSubSection] = useState<string | null>(null)
  const [userListTab, setUserListTab] = useState<string | null>(null)
  const [userListVisibleCount, setUserListVisibleCount] = useState<Record<string, number>>({ active: 5, freeTrial: 5, inactive: 5 })
  const [revenueListOpen, setRevenueListOpen] = useState<Record<string, boolean>>({})
  const [revenueListVisible, setRevenueListVisible] = useState<Record<string, number>>({})

  const periodOptions = [
    { value: 'day', label: 'Day' },
    { value: 'week', label: 'Week' },
    { value: 'month', label: 'Month' },
    { value: 'quarter', label: 'Quarter' },
    { value: 'year', label: 'Year' },
    { value: 'all', label: 'All Time' },
  ]

  const getPeriodLabel = () => {
    const ref = new Date(`${referenceDate  }T00:00:00`)
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

  const shiftPeriod = (direction: string) => {
    if (timePeriod === 'all') return
    const ref = new Date(`${referenceDate  }T00:00:00`)
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

  const totalApiCost = ['openaiCost', 'anthropicCost', 'googleCost', 'xaiCost']
    .reduce((sum, key) => sum + (parseFloat(expenses[key]) || 0), 0)

  const grandTotal = Object.values(expenses)
    .reduce((sum, val) => sum + (parseFloat(val) || 0), 0)

  const effectiveGrandTotal = timePeriod === 'month' ? grandTotal : (aggregatedExpenses?.grandTotal || 0)

  const dailyFavoritesRewardPerDay = 25
  const dailyFavoritesDaysMultiplier: Record<string, number> = { day: 1, week: 7, month: 30, quarter: 90, year: 365, all: 365 }
  const dailyFavoritesHypothetical = dailyFavoritesRewardPerDay * (dailyFavoritesDaysMultiplier[timePeriod] || 30)

  const loadExpenses = async (month: string) => {
    try {
      const adminParams = { month }
      const response = await api.get('/admin/expenses', { params: adminParams })
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
    } catch (error: any) {
      console.error('Error loading expenses:', error)
      setExpensesLoaded(true)
    }
  }

  const loadAggregatedExpenses = async (period: string, date: string) => {
    try {
      setLoadingAggExpenses(true)
      const adminParams = { period, date }
      const response = await api.get('/admin/expenses/aggregate', { params: adminParams })
      if (response.data.success) {
        setAggregatedExpenses(response.data)
      }
    } catch (error: any) {
      console.error('Error loading aggregated expenses:', error)
    } finally {
      setLoadingAggExpenses(false)
    }
  }

  const loadRevenue = async (period: string, date: string) => {
    try {
      setLoadingRevenue(true)
      const adminParams = { period, date }
      const response = await api.get('/admin/revenue', { params: adminParams })
      if (response.data.success) {
        setRevenueData(response.data.revenue)
        setUserListTab(null)
        setUserListVisibleCount({ active: 5, freeTrial: 5, inactive: 5 })
      }
    } catch (error: any) {
      console.error('Error loading revenue:', error)
    } finally {
      setLoadingRevenue(false)
    }
  }

  const loadPeriodData = (period?: string, dateVal?: string) => {
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

  const saveExpenses = async (expenseData: any) => {
    try {
      setExpensesSaving(true)
      await api.post('/admin/expenses', {
        month: expenseMonth,
        expenses: expenseData,
      })
    } catch (error: any) {
      console.error('Error saving expenses:', error)
    } finally {
      setExpensesSaving(false)
    }
  }

  const handleExpenseChange = (field: string, value: string) => {
    if (value === '' || /^\d*\.?\d*$/.test(value)) {
      setExpenses(prev => {
        const updated = { ...prev, [field]: value }
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

  const handleLogin = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    setLoginError('')
    setLoginLoading(true)

    try {
      const response = await api.post('/auth/signin', {
        username: loginData.username,
        password: loginData.password,
      })
      
      if (response.data.success) {
        setCurrentUser(response.data.user)
        setShowLogin(false)
        setLoginData({ username: '', password: '' })
      } else {
        setLoginError('Login failed. Please try again.')
      }
    } catch (err: any) {
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
      const response = await api.get('/admin/check')
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
    } catch (error: any) {
      console.error('[AdminView] ❌ Error checking admin status:', error)
      console.error('[AdminView] Error details:', {
        status: error.response?.status,
        data: error.response?.data,
        message: error.message
      })
      setIsAdmin(false)
      setAdminCheckComplete(true)
      setLoading(false)
      setLoginError(`Error checking admin status: ${error.response?.data?.error || error.message}`)
      setShowLogin(true)
    }
  }

  const fetchAdminData = async (forceLoading = false) => {
    try {
      if (forceLoading || (!usersData && !pricingData && !costsData)) {
        setLoading(true)
      }
      const adminParams = {}
      const [usersResponse, pricingResponse, costsResponse] = await Promise.all([
        api.get('/admin/users', { params: adminParams }),
        api.get('/admin/pricing', { params: adminParams }),
        api.get('/admin/costs', { params: adminParams }),
      ])
      setUsersData(usersResponse.data)
      setPricingData(pricingResponse.data)
      setCostsData(costsResponse.data)
      if (!expensesLoaded) {
        await loadExpenses(expenseMonth)
      }
    } catch (error: any) {
      console.error('Error fetching admin data:', error)
      if (error.response?.status === 403 || error.response?.status === 401) {
        setIsAdmin(false)
        setLoginError('Admin access required. Please log in with an admin account.')
      }
    } finally {
      setLoading(false)
    }
  }

  const fetchUserStats = async (userId: string) => {
    setLoadingUserStats((prev) => ({ ...prev, [userId]: true }))
    try {
      const response = await api.get(`/admin/users/${userId}/stats`)
      setUserStatsData((prev) => ({ ...prev, [userId]: response.data }))
    } catch (error: any) {
      console.error('Error fetching user stats:', error)
    } finally {
      setLoadingUserStats((prev) => ({ ...prev, [userId]: false }))
    }
  }

  const formatCurrency = (amount: number) => {
    if (amount === 0) return '$0.00'
    return `$${amount.toFixed(2)}`
  }

  const formatNumber = (num: any) => {
    if (num === null || num === undefined) return '0'
    return new Intl.NumberFormat('en-US').format(num)
  }

  const formatTokens = (num: number) => {
    if (num >= 1000000) return `${(num / 1000000).toFixed(2)  }M`
    if (num >= 1000) return `${(num / 1000).toFixed(2)  }K`
    return num.toLocaleString()
  }

  if (showLogin) {
    return (
      <AdminLoginForm
        loginData={loginData}
        setLoginData={setLoginData}
        loginError={loginError}
        loginLoading={loginLoading}
        handleLogin={handleLogin}
      />
    )
  }

  if (!isAdmin || !currentUser) {
    return null
  }

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      style={sx(layout.fixedFill, layout.flexCol, {
        padding: spacing['5xl'],
        overflowY: 'auto',
        zIndex: zIndex.base,
        color: '#ffffff',
        background: 'rgba(0, 0, 0, 0.95)',
      })}
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
            style={sx(layout.flexRow, {
              gap: spacing.md,
              padding: `${spacing.lg} ${spacing['2xl']}`,
              background: 'rgba(93, 173, 226, 0.1)',
              border: '1px solid rgba(93, 173, 226, 0.3)',
              borderRadius: radius.md,
              color: '#ffffff',
              cursor: 'pointer',
              fontSize: fontSize['2xl'],
              marginBottom: spacing['4xl'],
              transition: transition.normal,
            })}
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
          <AdminMainDashboard
            setActiveSection={setActiveSection}
            setExpensesSubSection={setExpensesSubSection}
            fetchAdminData={fetchAdminData}
            loadPeriodData={loadPeriodData}
            usersData={usersData}
            costsData={costsData}
            pricingData={pricingData}
          />
        ) : (
          <>
            {/* Header */}
            <div style={{ marginBottom: spacing['5xl'] }}>
              <div style={sx(layout.flexRow, { gap: spacing.xl, marginBottom: spacing.lg })}>
                <Shield size={40} color="#5dade2" />
                <h1
                  style={{
                    fontSize: fontSize['7xl'],
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
              <p style={{ color: '#aaaaaa', fontSize: fontSize['3xl'] }}>
                {activeSection === 'users' && 'Manage users and monitor usage'}
                {activeSection === 'models' && 'View available models and releases'}
                {activeSection === 'prices' && 'Manage model pricing'}
                {activeSection === 'expenses' && 'Track revenue streams and monitor costs'}
              </p>
            </div>

            {/* Section-specific content */}
            {activeSection === 'users' && usersData && costsData && (
              <AdminUsersSection
                usersData={usersData}
                costsData={costsData}
                userFilter={userFilter}
                setUserFilter={setUserFilter}
                userSearchQuery={userSearchQuery}
                setUserSearchQuery={setUserSearchQuery}
                expandedUsers={expandedUsers}
                setExpandedUsers={setExpandedUsers}
                expandedUserProviders={expandedUserProviders}
                setExpandedUserProviders={setExpandedUserProviders}
                expandedUserModels={expandedUserModels}
                setExpandedUserModels={setExpandedUserModels}
                userStatsData={userStatsData}
                loadingUserStats={loadingUserStats}
                fetchUserStats={fetchUserStats}
                formatCurrency={formatCurrency}
                formatNumber={formatNumber}
                formatTokens={formatTokens}
              />
            )}

            {activeSection === 'models' && (
              <AdminModelsSection
                expandedProviders={expandedProviders}
                setExpandedProviders={setExpandedProviders}
              />
            )}

            {activeSection === 'prices' && pricingData && (
              <AdminPricingSection
                pricingData={pricingData}
                expandedProviders={expandedProviders}
                setExpandedProviders={setExpandedProviders}
              />
            )}

            {activeSection === 'expenses' && (
              <AdminRevenueExpenses
                expensesSubSection={expensesSubSection}
                setExpensesSubSection={setExpensesSubSection}
                timePeriod={timePeriod}
                setTimePeriod={setTimePeriod}
                periodDropdownOpen={periodDropdownOpen}
                setPeriodDropdownOpen={setPeriodDropdownOpen}
                referenceDate={referenceDate}
                setReferenceDate={setReferenceDate}
                expenseMonth={expenseMonth}
                setExpenseMonth={setExpenseMonth}
                setExpensesLoaded={setExpensesLoaded}
                expenses={expenses}
                handleExpenseChange={handleExpenseChange}
                loadingRevenue={loadingRevenue}
                revenueData={revenueData}
                totalApiCost={totalApiCost}
                grandTotal={grandTotal}
                effectiveGrandTotal={effectiveGrandTotal}
                dailyFavoritesHypothetical={dailyFavoritesHypothetical}
                loadPeriodData={loadPeriodData}
                shiftPeriod={shiftPeriod}
                getPeriodLabel={getPeriodLabel}
                periodOptions={periodOptions}
                expensesSaving={expensesSaving}
                expensesLoaded={expensesLoaded}
                loadingAggExpenses={loadingAggExpenses}
                aggregatedExpenses={aggregatedExpenses}
                userListTab={userListTab}
                setUserListTab={setUserListTab}
                userListVisibleCount={userListVisibleCount}
                setUserListVisibleCount={setUserListVisibleCount}
                revenueListOpen={revenueListOpen}
                setRevenueListOpen={setRevenueListOpen}
                revenueListVisible={revenueListVisible}
                setRevenueListVisible={setRevenueListVisible}
              />
            )}

          </>
        )}
      </div>
    </motion.div>
  )
}

export default AdminView
