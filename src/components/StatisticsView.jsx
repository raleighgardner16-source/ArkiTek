import React, { useEffect, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { TrendingUp, Database, BarChart3, MessageSquare, ChevronDown, ChevronRight, Search, Star, FolderOpen, X, Cpu } from 'lucide-react'
import { useStore } from '../store/useStore'
import axios from 'axios'
import ConfirmationModal from './ConfirmationModal'
import { LLM_PROVIDERS } from '../services/llmProviders'

const StatisticsView = () => {
  const currentUser = useStore((state) => state.currentUser)
  const statsRefreshTrigger = useStore((state) => state.statsRefreshTrigger)
  const [stats, setStats] = useState(null)
  const [loading, setLoading] = useState(true)
  const [expandedProviders, setExpandedProviders] = useState({})
  const [expandedModels, setExpandedModels] = useState({})
  const [expandedCategories, setExpandedCategories] = useState({})
  const [activeTab, setActiveTab] = useState('tokens') // 'tokens', 'ratings', 'categories', 'models'
  const [categoriesData, setCategoriesData] = useState(null)
  const [ratingsData, setRatingsData] = useState(null)
  const [showClearConfirm, setShowClearConfirm] = useState(false)
  const [categoryToClear, setCategoryToClear] = useState(null)
  const [hoveredDay, setHoveredDay] = useState(null) // Track which day is being hovered

  useEffect(() => {
    if (currentUser?.id) {
      fetchStats()
      fetchCategories()
      fetchRatings()
    }
  }, [currentUser, statsRefreshTrigger])

  const fetchStats = async () => {
    try {
      setLoading(true)
      const response = await axios.get(`http://localhost:3001/api/stats/${currentUser.id}`)
      console.log('[Stats] Fetched stats:', response.data)
      setStats(response.data)
    } catch (error) {
      console.error('Error fetching stats:', error)
      setStats({
        totalTokens: 0,
        totalQueries: 0,
        totalPrompts: 0,
        monthlyTokens: 0,
        monthlyQueries: 0,
        monthlyPrompts: 0,
        monthlyCost: 0,
        remainingFreeAllocation: 5.00,
        freeUsagePercentage: 100,
        dailyUsage: [],
        providers: {},
        models: {},
      })
    } finally {
      setLoading(false)
    }
  }

  const fetchCategories = async () => {
    try {
      const response = await axios.get(`http://localhost:3001/api/stats/${currentUser.id}/categories`)
      console.log('[Categories] Fetched data:', response.data.categories)
      setCategoriesData(response.data.categories || {})
    } catch (error) {
      console.error('Error fetching categories:', error)
      setCategoriesData({})
    }
  }

  const fetchRatings = async () => {
    try {
      const response = await axios.get(`http://localhost:3001/api/stats/${currentUser.id}/ratings`)
      setRatingsData(response.data.ratings || {})
    } catch (error) {
      console.error('Error fetching ratings:', error)
      setRatingsData({})
    }
  }

  const handleClearCategoryPrompts = (category, e) => {
    if (e) {
      e.preventDefault()
      e.stopPropagation()
    }
    setCategoryToClear(category)
    setShowClearConfirm(true)
  }

  const clearCategoryPrompts = async () => {
    if (!currentUser?.id) {
      console.error('Cannot clear category prompts: No user ID')
      return
    }
    
    if (!categoryToClear) {
      console.error('Cannot clear category prompts: No category provided')
      return
    }
    
    try {
      const encodedCategory = encodeURIComponent(categoryToClear)
      console.log(`[Clear Category] Clearing prompts for category: ${categoryToClear} (encoded: ${encodedCategory})`)
      const response = await axios.delete(`http://localhost:3001/api/stats/${currentUser.id}/categories/${encodedCategory}/prompts`)
      console.log('[Clear Category] Response:', response.data)
      // Refresh categories data
      await fetchCategories()
      console.log(`[Clear Category] Prompts cleared for category: ${categoryToClear}`)
    } catch (error) {
      console.error('[Clear Category] Error clearing category prompts:', error)
      console.error('[Clear Category] Error details:', {
        message: error.message,
        response: error.response?.data,
        status: error.response?.status,
        statusText: error.response?.statusText,
        category: categoryToClear
      })
      alert(`Failed to clear category prompts: ${error.response?.data?.error || error.message || 'Unknown error'}`)
    } finally {
      setCategoryToClear(null)
    }
  }

  const formatNumber = (num) => {
    if (num >= 1000000) return (num / 1000000).toFixed(2) + 'M'
    if (num >= 1000) return (num / 1000).toFixed(2) + 'K'
    return num.toLocaleString()
  }

  const formatTokens = (num) => {
    if (num === 0) return '0'
    // Show full number with commas for readability
    return num.toLocaleString('en-US')
  }

  const formatAccountAge = (createdAt) => {
    if (!createdAt) return 'N/A'
    
    const now = new Date()
    const created = new Date(createdAt)
    const diffTime = Math.abs(now - created)
    const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24))
    // Add 1 to diffDays so today shows as "1 day", tomorrow as "2 days", etc.
    const displayDays = diffDays + 1
    const diffYears = Math.floor(displayDays / 365)
    const remainingDays = displayDays % 365
    
    if (diffYears > 0) {
      if (remainingDays > 0) {
        return `${diffYears} ${diffYears === 1 ? 'year' : 'years'} ${remainingDays} ${remainingDays === 1 ? 'day' : 'days'}`
      } else {
        return `${diffYears} ${diffYears === 1 ? 'year' : 'years'}`
      }
    } else {
      return `${displayDays} ${displayDays === 1 ? 'day' : 'days'}`
    }
  }

  if (loading) {
    return (
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        style={{
          position: 'fixed',
          top: '0',
          left: '240px',
          width: 'calc(100% - 240px)',
          height: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 10,
        }}
      >
        <p style={{ color: '#ffffff', fontSize: '1.2rem' }}>Loading statistics...</p>
      </motion.div>
    )
  }

  const userStats = stats || {
    totalTokens: 0,
    totalInputTokens: 0,
    totalOutputTokens: 0,
    totalQueries: 0,
    totalPrompts: 0,
    monthlyTokens: 0,
    monthlyInputTokens: 0,
    monthlyOutputTokens: 0,
    monthlyQueries: 0,
    monthlyPrompts: 0,
    monthlyCost: 0,
    remainingFreeAllocation: 5.00,
    freeUsagePercentage: 100,
    dailyUsage: [],
    providers: {},
    models: {},
  }

  // Calculate ratings stats
  const ratingsStats = ratingsData ? (() => {
    const ratingValues = Object.values(ratingsData)
    const totalRatings = ratingValues.length
    const averageRating = totalRatings > 0 
      ? ratingValues.reduce((sum, r) => sum + (typeof r === 'number' ? r : 0), 0) / totalRatings 
      : 0
    const ratingDistribution = {}
    ratingValues.forEach(r => {
      const rating = typeof r === 'number' ? r : 0
      ratingDistribution[rating] = (ratingDistribution[rating] || 0) + 1
    })

    // Calculate favorite provider and favorite model
    // Ratings are stored with keys like "provider-model-timestamp-random"
    // ResponseId format: `${modelId}-${Date.now()}-${random}`
    // where modelId is "provider-model"
    // Extract provider and model from rating keys
    const providerRatings = {}
    const modelRatings = {}
    
    Object.entries(ratingsData).forEach(([key, rating]) => {
      if (typeof rating !== 'number') return
      
      // Extract model identifier from key (format: "provider-model-timestamp-random")
      // The timestamp is a long number (13 digits), and the random part is alphanumeric
      // So we can find the timestamp by looking for a long numeric part
      const parts = key.split('-')
      if (parts.length >= 2) {
        // Find the timestamp (long numeric part, typically 13 digits)
        let timestampIndex = -1
        for (let i = 0; i < parts.length; i++) {
          if (/^\d{10,}$/.test(parts[i])) {
            // Found a long numeric part (timestamp)
            timestampIndex = i
            break
          }
        }
        
        if (timestampIndex > 0) {
          // We found a timestamp, so everything before it is the model identifier
          const modelId = parts.slice(0, timestampIndex).join('-')
          const firstDashIndex = modelId.indexOf('-')
          if (firstDashIndex > 0) {
            const provider = modelId.substring(0, firstDashIndex)
            const modelName = modelId.substring(firstDashIndex + 1)
            const modelKey = `${provider}-${modelName}`
            
            // Add to provider ratings
            if (!providerRatings[provider]) {
              providerRatings[provider] = []
            }
            providerRatings[provider].push(rating)
            
            // Add to model ratings
            if (!modelRatings[modelKey]) {
              modelRatings[modelKey] = []
            }
            modelRatings[modelKey].push(rating)
          }
        } else if (parts.length >= 2) {
          // Fallback: assume format is "provider-model-..." and take first two parts
          const provider = parts[0]
          const modelName = parts[1]
          const modelKey = `${provider}-${modelName}`
          
          // Add to provider ratings
          if (!providerRatings[provider]) {
            providerRatings[provider] = []
          }
          providerRatings[provider].push(rating)
          
          // Add to model ratings
          if (!modelRatings[modelKey]) {
            modelRatings[modelKey] = []
          }
          modelRatings[modelKey].push(rating)
        }
      }
    })
    
    // Calculate average rating per provider
    const providerAverages = {}
    Object.entries(providerRatings).forEach(([provider, ratings]) => {
      const avg = ratings.reduce((sum, r) => sum + r, 0) / ratings.length
      providerAverages[provider] = avg
    })
    
    // Calculate average rating per model
    const modelAverages = {}
    Object.entries(modelRatings).forEach(([modelKey, ratings]) => {
      const avg = ratings.reduce((sum, r) => sum + r, 0) / ratings.length
      modelAverages[modelKey] = avg
    })
    
    // Find favorite provider (highest average rating)
    let favoriteProvider = null
    let favoriteProviderAvg = 0
    Object.entries(providerAverages).forEach(([provider, avg]) => {
      if (avg > favoriteProviderAvg) {
        favoriteProviderAvg = avg
        favoriteProvider = provider
      }
    })
    
    // Find favorite model (highest average rating)
    let favoriteModel = null
    let favoriteModelAvg = 0
    Object.entries(modelAverages).forEach(([modelKey, avg]) => {
      if (avg > favoriteModelAvg) {
        favoriteModelAvg = avg
        favoriteModel = modelKey
      }
    })
    
    return { 
      totalRatings, 
      averageRating, 
      distribution: ratingDistribution,
      favoriteProvider,
      favoriteProviderAvg,
      favoriteModel,
      favoriteModelAvg
    }
  })() : { 
    totalRatings: 0, 
    averageRating: 0, 
    distribution: {},
    favoriteProvider: null,
    favoriteProviderAvg: 0,
    favoriteModel: null,
    favoriteModelAvg: 0
  }

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      style={{
        position: 'fixed',
        top: '0',
        left: '240px',
        width: 'calc(100% - 240px)',
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        padding: '40px',
        overflowY: 'auto',
        zIndex: 10,
        color: '#ffffff',
      }}
    >
      <div
        style={{
          width: '100%',
          maxWidth: '1200px',
          margin: '0 auto',
        }}
      >
        {/* Header */}
        <div style={{ marginBottom: '40px' }}>
          <h1
            style={{
              fontSize: '2.5rem',
              marginBottom: '12px',
              background: 'linear-gradient(90deg, #00FFFF, #00FF00)',
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
            }}
          >
            Your ArkTek Statistics
          </h1>
          {stats?.createdAt && (
            <p style={{ color: '#aaaaaa', fontSize: '1rem', marginBottom: '8px' }}>
              Member for: {formatAccountAge(stats.createdAt)}
            </p>
          )}
          <p style={{ color: '#aaaaaa', fontSize: '1.1rem', marginBottom: '8px' }}>
            Track your usage and performance across all providers and models
          </p>
        </div>

        {/* Tab Buttons */}
        <div
          style={{
            display: 'flex',
            gap: '16px',
            marginBottom: '32px',
            borderBottom: '1px solid rgba(0, 255, 255, 0.3)',
          }}
        >
          <button
            onClick={() => setActiveTab('tokens')}
            style={{
              padding: '12px 24px',
              background: activeTab === 'tokens' ? 'rgba(0, 255, 255, 0.2)' : 'transparent',
              border: 'none',
              borderBottom: activeTab === 'tokens' ? '2px solid #00FFFF' : '2px solid transparent',
              color: activeTab === 'tokens' ? '#00FFFF' : '#aaaaaa',
              fontSize: '1rem',
              fontWeight: activeTab === 'tokens' ? '600' : '400',
              cursor: 'pointer',
              transition: 'all 0.2s ease',
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
            }}
          >
            <Database size={20} />
            Token Stats
          </button>
          <button
            onClick={() => setActiveTab('ratings')}
            style={{
              padding: '12px 24px',
              background: activeTab === 'ratings' ? 'rgba(0, 255, 255, 0.2)' : 'transparent',
              border: 'none',
              borderBottom: activeTab === 'ratings' ? '2px solid #00FFFF' : '2px solid transparent',
              color: activeTab === 'ratings' ? '#00FFFF' : '#aaaaaa',
              fontSize: '1rem',
              fontWeight: activeTab === 'ratings' ? '600' : '400',
              cursor: 'pointer',
              transition: 'all 0.2s ease',
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
            }}
          >
            <Star size={20} />
            Ratings
          </button>
          <button
            onClick={() => setActiveTab('categories')}
            style={{
              padding: '12px 24px',
              background: activeTab === 'categories' ? 'rgba(0, 255, 255, 0.2)' : 'transparent',
              border: 'none',
              borderBottom: activeTab === 'categories' ? '2px solid #00FFFF' : '2px solid transparent',
              color: activeTab === 'categories' ? '#00FFFF' : '#aaaaaa',
              fontSize: '1rem',
              fontWeight: activeTab === 'categories' ? '600' : '400',
              cursor: 'pointer',
              transition: 'all 0.2s ease',
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
            }}
          >
            <FolderOpen size={20} />
            Categories
          </button>
          <button
            onClick={() => setActiveTab('models')}
            style={{
              padding: '12px 24px',
              background: activeTab === 'models' ? 'rgba(0, 255, 255, 0.2)' : 'transparent',
              border: 'none',
              borderBottom: activeTab === 'models' ? '2px solid #00FFFF' : '2px solid transparent',
              color: activeTab === 'models' ? '#00FFFF' : '#aaaaaa',
              fontSize: '1rem',
              fontWeight: activeTab === 'models' ? '600' : '400',
              cursor: 'pointer',
              transition: 'all 0.2s ease',
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
            }}
          >
            <Cpu size={20} />
            Models
          </button>
        </div>

        {/* Tab Content */}
        <AnimatePresence mode="wait">
          {activeTab === 'tokens' && (
            <motion.div
              key="tokens"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              transition={{ duration: 0.3 }}
            >
              <p style={{ color: '#888888', fontSize: '0.85rem', fontStyle: 'italic', marginBottom: '24px' }}>
                A token is a unit of text (roughly 4 characters or 0.75 words) that AI models process. Token counts are displayed with full numbers and commas for readability.
              </p>

        {/* Remaining Free Allocation with Counters */}
        <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '40px' }}>
          <div
            style={{
              background: 'rgba(0, 255, 0, 0.1)',
              border: '1px solid rgba(0, 255, 0, 0.3)',
              borderRadius: '16px',
              padding: '30px',
              display: 'flex',
              flexDirection: 'column',
              width: '100%',
              maxWidth: '1200px',
            }}
          >
            {/* Header with Percentage */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '24px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                <TrendingUp size={32} color="#00FF00" />
                <div>
                  <h2 style={{ fontSize: '1.2rem', color: '#ffffff', margin: '0 0 4px 0' }}>No Additional Charge Usage Remaining</h2>
                  <p style={{ fontSize: '0.85rem', color: '#aaaaaa', margin: 0, fontStyle: 'italic' }}>
                    Once usage is up you pay for what you use
                  </p>
                </div>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '8px' }}>
                <p
                  style={{
                    fontSize: '3rem',
                    fontWeight: 'bold',
                    background: 'linear-gradient(90deg, #00FF00, #00FFFF)',
                    WebkitBackgroundClip: 'text',
                    WebkitTextFillColor: 'transparent',
                    margin: 0,
                    whiteSpace: 'nowrap',
                  }}
                >
                  {(userStats.freeUsagePercentage || 100).toFixed(1)}%
                </p>
                {(userStats.monthlyCost || 0) > 5.00 && (
                  <div
                    style={{
                      background: 'rgba(255, 107, 107, 0.15)',
                      border: '1px solid rgba(255, 107, 107, 0.3)',
                      borderRadius: '8px',
                      padding: '8px 12px',
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'flex-end',
                    }}
                  >
                    <p style={{ fontSize: '0.7rem', color: '#aaaaaa', margin: '0 0 2px 0' }}>
                      Extra Usage This Month
                    </p>
                    <p
                      style={{
                        fontSize: '1.2rem',
                        fontWeight: 'bold',
                        color: '#ff6b6b',
                        margin: 0,
                      }}
                    >
                      ${((userStats.monthlyCost || 0) - 5.00).toFixed(2)}
                    </p>
                  </div>
                )}
              </div>
            </div>

            {/* Main Content: Counters and Bar Graph */}
            <div style={{ display: 'flex', gap: '24px', alignItems: 'flex-start' }}>
              {/* Left Side: Token Counters */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', minWidth: '200px' }}>
                {/* Total Tokens */}
                <div
                  style={{
                    background: 'rgba(0, 255, 255, 0.1)',
                    border: '1px solid rgba(0, 255, 255, 0.3)',
                    borderRadius: '12px',
                    padding: '20px',
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
                    <Database size={20} color="#00FFFF" />
                    <h3 style={{ fontSize: '0.9rem', color: '#aaaaaa', margin: 0 }}>Total Tokens</h3>
                  </div>
                  <p
                    style={{
                      fontSize: '1.5rem',
                      fontWeight: 'bold',
                      background: 'linear-gradient(90deg, #00FFFF, #00FF00)',
                      WebkitBackgroundClip: 'text',
                      WebkitTextFillColor: 'transparent',
                      margin: 0,
                    }}
                  >
                    {formatTokens(userStats.totalTokens)}
                  </p>
                </div>

                {/* Tokens This Month */}
                <div
                  style={{
                    background: 'rgba(0, 255, 0, 0.1)',
                    border: '1px solid rgba(0, 255, 0, 0.3)',
                    borderRadius: '12px',
                    padding: '20px',
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
                    <Database size={20} color="#00FF00" />
                    <h3 style={{ fontSize: '0.9rem', color: '#aaaaaa', margin: 0 }}>Tokens This Month</h3>
                  </div>
                  <p
                    style={{
                      fontSize: '1.5rem',
                      fontWeight: 'bold',
                      background: 'linear-gradient(90deg, #00FFFF, #00FF00)',
                      WebkitBackgroundClip: 'text',
                      WebkitTextFillColor: 'transparent',
                      margin: 0,
                    }}
                  >
                    {formatTokens(userStats.monthlyTokens)}
                  </p>
                </div>
              </div>

              {/* Center: Daily Usage Bar Graph */}
              <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
                <p style={{ fontSize: '0.9rem', color: '#aaaaaa', marginBottom: '12px', textAlign: 'center' }}>
                  Daily Usage Percentage (This Month)
                </p>
                <div style={{ display: 'flex', gap: '8px', height: '220px' }}>
                  {/* Y-axis labels (percentage scale) */}
                  <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'space-between', paddingRight: '8px', minWidth: '40px' }}>
                    {[100, 75, 50, 25, 0].map((value) => (
                      <span
                        key={value}
                        style={{
                          fontSize: '0.7rem',
                          color: '#888888',
                          textAlign: 'right',
                        }}
                      >
                        {value}%
                      </span>
                    ))}
                  </div>

                  {/* Bar Graph Container */}
                  <div
                    style={{
                      flex: 1,
                      display: 'flex',
                      flexDirection: 'column',
                      position: 'relative',
                    }}
                  >
                    {/* Bars Area */}
                    <div
                      style={{
                        display: 'flex',
                        alignItems: 'flex-end',
                        justifyContent: 'space-between',
                        gap: '4px',
                        height: '180px',
                        padding: '12px',
                        background: 'rgba(0, 0, 0, 0.2)',
                        borderRadius: '8px',
                        position: 'relative',
                      }}
                    >
                      {(userStats.dailyUsage || []).map((day, index) => {
                        const percentage = day.percentage || 0
                        const barHeight = Math.max(2, (percentage / 100) * 156) // Max height 156px (180px - 24px padding), min 2px
                        const isToday = new Date().toISOString().split('T')[0] === day.date
                        const isHovered = hoveredDay === day.date
                        
                        return (
                          <div
                            key={day.date || index}
                            style={{
                              flex: 1,
                              display: 'flex',
                              flexDirection: 'column',
                              alignItems: 'center',
                              justifyContent: 'flex-end',
                              gap: '2px',
                              minWidth: '0',
                              position: 'relative',
                            }}
                            onMouseEnter={() => setHoveredDay(day.date)}
                            onMouseLeave={() => setHoveredDay(null)}
                          >
                            {/* Hover Tooltip */}
                            {isHovered && (
                              <div
                                style={{
                                  position: 'absolute',
                                  bottom: `${barHeight + 8}px`,
                                  left: '50%',
                                  transform: 'translateX(-50%)',
                                  background: 'rgba(0, 0, 0, 0.95)',
                                  border: '1px solid rgba(0, 255, 255, 0.5)',
                                  borderRadius: '6px',
                                  padding: '6px 10px',
                                  fontSize: '0.75rem',
                                  color: '#00FFFF',
                                  fontWeight: 'bold',
                                  whiteSpace: 'nowrap',
                                  zIndex: 20,
                                  pointerEvents: 'none',
                                  boxShadow: '0 4px 12px rgba(0, 255, 255, 0.3)',
                                }}
                              >
                                {percentage.toFixed(1)}% used
                              </div>
                            )}
                            
                            {/* Percentage label at top of bar */}
                            {percentage > 0 && !isHovered && (
                              <div
                                style={{
                                  position: 'absolute',
                                  top: `${180 - barHeight - 20}px`,
                                  fontSize: '0.65rem',
                                  color: isToday ? '#00FF00' : '#00FFFF',
                                  fontWeight: 'bold',
                                  whiteSpace: 'nowrap',
                                  zIndex: 10,
                                }}
                              >
                                {percentage.toFixed(1)}%
                              </div>
                            )}
                            
                            {/* Bar */}
                            <div
                              style={{
                                width: '100%',
                                height: `${barHeight}px`,
                                background: percentage > 0
                                  ? isToday
                                    ? 'linear-gradient(180deg, #00FF00, #00FFFF)'
                                    : 'linear-gradient(180deg, rgba(0, 255, 0, 0.6), rgba(0, 255, 255, 0.6))'
                                  : 'rgba(255, 255, 255, 0.1)',
                                borderRadius: '2px 2px 0 0',
                                transition: 'all 0.3s ease',
                                cursor: 'pointer',
                                position: 'relative',
                              }}
                              onMouseEnter={(e) => {
                                if (percentage > 0) {
                                  e.currentTarget.style.opacity = '0.8'
                                  e.currentTarget.style.transform = 'scaleY(1.1)'
                                }
                              }}
                              onMouseLeave={(e) => {
                                e.currentTarget.style.opacity = '1'
                                e.currentTarget.style.transform = 'scaleY(1)'
                              }}
                            />
                          </div>
                        )
                      })}
                    </div>

                    {/* X-axis labels (days) */}
                    <div
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        gap: '4px',
                        padding: '8px 12px 0 12px',
                        marginTop: '4px',
                      }}
                    >
                      {(userStats.dailyUsage || []).map((day, index) => {
                        const isToday = new Date().toISOString().split('T')[0] === day.date
                        return (
                          <span
                            key={day.date || index}
                            style={{
                              flex: 1,
                              fontSize: '0.65rem',
                              color: isToday ? '#00FF00' : '#888888',
                              fontWeight: isToday ? 'bold' : 'normal',
                              textAlign: 'center',
                              minWidth: '0',
                            }}
                          >
                            {day.day}
                          </span>
                        )
                      })}
                    </div>
                  </div>
                </div>
              </div>

              {/* Right Side: Prompt Counters */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', minWidth: '200px' }}>
                {/* Total Prompts */}
                <div
                  style={{
                    background: 'rgba(0, 255, 255, 0.1)',
                    border: '1px solid rgba(0, 255, 255, 0.3)',
                    borderRadius: '12px',
                    padding: '20px',
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
                    <MessageSquare size={20} color="#00FFFF" />
                    <h3 style={{ fontSize: '0.9rem', color: '#aaaaaa', margin: 0 }}>Total Prompts</h3>
                  </div>
                  <p
                    style={{
                      fontSize: '2rem',
                      fontWeight: 'bold',
                      background: 'linear-gradient(90deg, #00FFFF, #00FF00)',
                      WebkitBackgroundClip: 'text',
                      WebkitTextFillColor: 'transparent',
                      margin: 0,
                    }}
                  >
                    {formatNumber(userStats.totalPrompts || 0)}
                  </p>
                </div>

                {/* Prompts This Month */}
                <div
                  style={{
                    background: 'rgba(0, 255, 0, 0.1)',
                    border: '1px solid rgba(0, 255, 0, 0.3)',
                    borderRadius: '12px',
                    padding: '20px',
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
                    <MessageSquare size={20} color="#00FF00" />
                    <h3 style={{ fontSize: '0.9rem', color: '#aaaaaa', margin: 0 }}>Prompts This Month</h3>
                  </div>
                  <p
                    style={{
                      fontSize: '2rem',
                      fontWeight: 'bold',
                      background: 'linear-gradient(90deg, #00FFFF, #00FF00)',
                      WebkitBackgroundClip: 'text',
                      WebkitTextFillColor: 'transparent',
                      margin: 0,
                    }}
                  >
                    {formatNumber(userStats.monthlyPrompts || 0)}
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>

            </motion.div>
          )}

          {activeTab === 'ratings' && (
            <motion.div
              key="ratings"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              transition={{ duration: 0.3 }}
              style={{ display: 'flex', gap: '20px', flexDirection: 'row', flexWrap: 'nowrap' }}
            >
              {/* Favorite Provider - Separate container */}
              <div style={{ 
                background: 'rgba(0, 255, 255, 0.1)', 
                border: '1px solid rgba(0, 255, 255, 0.3)',
                padding: '28px', 
                borderRadius: '16px',
                flex: 1,
                minWidth: '400px'
              }}>
                <p style={{ color: '#aaaaaa', fontSize: '1rem', marginBottom: '16px' }}>Your Favorite Provider:</p>
                {ratingsStats.totalRatings > 0 && ratingsStats.favoriteProvider ? (
                  <>
                    <p style={{ color: '#00FFFF', fontSize: '2rem', fontWeight: 'bold', margin: '0 0 12px 0' }}>
                      {LLM_PROVIDERS[ratingsStats.favoriteProvider]?.name || ratingsStats.favoriteProvider}
                    </p>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                      <p style={{ color: '#aaaaaa', fontSize: '0.85rem', margin: 0 }}>Average Score:</p>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <p style={{ color: '#00FF00', fontSize: '1.1rem', margin: 0 }}>
                          {ratingsStats.favoriteProviderAvg.toFixed(2)}
                        </p>
                        <Star size={20} fill="#FFD700" color="#FFD700" />
                        <p style={{ color: '#aaaaaa', fontSize: '1.1rem', margin: 0 }}>
                          / 5
                        </p>
                      </div>
                    </div>
                  </>
                ) : (
                  <>
                    <p style={{ color: '#888888', fontSize: '1.5rem', margin: '0 0 12px 0' }}>
                      Rate models first
                    </p>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                      <p style={{ color: '#aaaaaa', fontSize: '0.85rem', margin: 0 }}>Average Score:</p>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <p style={{ color: '#888888', fontSize: '1.1rem', margin: 0 }}>
                          —
                        </p>
                        <Star size={20} fill="#FFD700" color="#FFD700" />
                        <p style={{ color: '#aaaaaa', fontSize: '1.1rem', margin: 0 }}>
                          / 5
                        </p>
                      </div>
                    </div>
                  </>
                )}
              </div>
              
              {/* Favorite Model - Separate container */}
              <div style={{ 
                background: 'rgba(0, 255, 0, 0.1)', 
                border: '1px solid rgba(0, 255, 0, 0.3)',
                padding: '28px', 
                borderRadius: '16px',
                flex: 1,
                minWidth: '400px'
              }}>
                <p style={{ color: '#aaaaaa', fontSize: '1rem', marginBottom: '16px' }}>Your Favorite Model:</p>
                {ratingsStats.totalRatings > 0 && ratingsStats.favoriteModel ? (
                  <>
                    <p style={{ color: '#00FF00', fontSize: '2rem', fontWeight: 'bold', margin: '0 0 12px 0' }}>
                      {(() => {
                        const parts = ratingsStats.favoriteModel.split('-')
                        if (parts.length >= 2) {
                          const provider = parts[0]
                          const modelName = parts.slice(1).join('-')
                          return `${LLM_PROVIDERS[provider]?.name || provider} - ${modelName}`
                        }
                        return ratingsStats.favoriteModel
                      })()}
                    </p>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                      <p style={{ color: '#aaaaaa', fontSize: '0.85rem', margin: 0 }}>Average Score:</p>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <p style={{ color: '#00FFFF', fontSize: '1.1rem', margin: 0 }}>
                          {ratingsStats.favoriteModelAvg.toFixed(2)}
                        </p>
                        <Star size={20} fill="#FFD700" color="#FFD700" />
                        <p style={{ color: '#aaaaaa', fontSize: '1.1rem', margin: 0 }}>
                          / 5
                        </p>
                      </div>
                    </div>
                  </>
                ) : (
                  <>
                    <p style={{ color: '#888888', fontSize: '1.5rem', margin: '0 0 12px 0' }}>
                      Rate models first
                    </p>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                      <p style={{ color: '#aaaaaa', fontSize: '0.85rem', margin: 0 }}>Average Score:</p>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <p style={{ color: '#888888', fontSize: '1.1rem', margin: 0 }}>
                          —
                        </p>
                        <Star size={20} fill="#FFD700" color="#FFD700" />
                        <p style={{ color: '#aaaaaa', fontSize: '1.1rem', margin: 0 }}>
                          / 5
                        </p>
                      </div>
                    </div>
                  </>
                )}
              </div>
            </motion.div>
          )}

          {activeTab === 'categories' && (
            <motion.div
              key="categories"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              transition={{ duration: 0.3 }}
            >
          <div
            style={{
              background: 'rgba(0, 255, 255, 0.1)',
              border: '1px solid rgba(0, 255, 255, 0.3)',
              borderRadius: '16px',
              padding: '30px',
            }}
          >
                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                  {(() => {
                    // Define all 10 categories
                    const allCategories = [
                      'Science',
                      'Tech',
                      'Business',
                      'Health',
                      'Politics/Law',
                      'History/Geography',
                      'Philosophy/Religion',
                      'Arts/Culture',
                      'Lifestyle/Self-Improvement',
                      'General Knowledge/Other',
                    ]
                    
                    // Merge with actual data, defaulting to 0 for categories with no prompts
                    // First, find all categories that exist in the data (might have different casing or formatting)
                    const allDataCategories = Object.keys(categoriesData || {})
                    console.log('[Categories] All categories in data:', allDataCategories)
                    console.log('[Categories] Full categories data:', categoriesData)
                    
                    const categoriesWithData = allCategories.map((category) => {
                      // Try exact match first
                      let categoryInfo = categoriesData?.[category]
                      
                      // If no exact match, try case-insensitive match
                      if (!categoryInfo) {
                        const matchedKey = allDataCategories.find(key => 
                          key.toLowerCase() === category.toLowerCase()
                        )
                        if (matchedKey) {
                          categoryInfo = categoriesData[matchedKey]
                          console.log(`[Categories] Found case-insensitive match: ${matchedKey} for ${category}`)
                        }
                      }
                      
                      const recentPrompts = categoryInfo?.recentPrompts || []
                      const count = categoryInfo?.count || (typeof categoryInfo === 'number' ? categoryInfo : 0)
                      
                      console.log(`[Categories] Category: ${category}, Count: ${count}, Prompts: ${recentPrompts.length}`, recentPrompts)
                      
                      return {
                        category,
                        count,
                        recentPrompts: recentPrompts.slice(0, 5), // Show only last 5 prompts
                      }
                    })
                    
                    // Sort by count (highest first), then alphabetically for same count
                    categoriesWithData.sort((a, b) => {
                      if (b.count !== a.count) {
                        return b.count - a.count
                      }
                      return a.category.localeCompare(b.category)
                    })
                    
                    return categoriesWithData.map(({ category, count, recentPrompts }) => {
                      const isExpanded = expandedCategories[category]
                      const hasPrompts = recentPrompts && recentPrompts.length > 0

                  return (
                    <div
                          key={category}
                      style={{
                            background: count > 0 ? 'rgba(0, 255, 255, 0.05)' : 'rgba(0, 255, 255, 0.02)',
                        border: '1px solid rgba(0, 255, 255, 0.2)',
                        borderRadius: '12px',
                        overflow: 'hidden',
                            opacity: count > 0 ? 1 : 0.6,
                      }}
                    >
                          {/* Category Header - Always clickable to show/hide prompts */}
                      <div
                        onClick={() => {
                              setExpandedCategories((prev) => ({
                            ...prev,
                                [category]: !prev[category],
                          }))
                        }}
                        style={{
                          padding: '16px 20px',
                          display: 'flex',
                              justifyContent: 'space-between',
                          alignItems: 'center',
                              cursor: 'pointer',
                          transition: 'background 0.2s',
                        }}
                        onMouseEnter={(e) => {
                              e.currentTarget.style.background = count > 0 ? 'rgba(0, 255, 255, 0.1)' : 'rgba(0, 255, 255, 0.05)'
                        }}
                        onMouseLeave={(e) => {
                              e.currentTarget.style.background = count > 0 ? 'rgba(0, 255, 255, 0.05)' : 'rgba(0, 255, 255, 0.02)'
                        }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flex: 1 }}>
                              {isExpanded ? (
                                <ChevronDown size={20} color={count > 0 ? "#00FFFF" : "#888888"} />
                              ) : (
                                <ChevronRight size={20} color={count > 0 ? "#00FFFF" : "#888888"} />
                              )}
                              <span style={{ color: count > 0 ? '#00FFFF' : '#888888', fontSize: '1.1rem', textTransform: 'capitalize', fontWeight: '500' }}>
                                {category}
                              </span>
                              {hasPrompts && (
                          <span style={{ color: '#888888', fontSize: '0.85rem', marginLeft: '8px' }}>
                                  ({recentPrompts.length} {recentPrompts.length === 1 ? 'prompt' : 'prompts'})
                                </span>
                              )}
                              {!hasPrompts && count === 0 && (
                                <span style={{ color: '#666666', fontSize: '0.85rem', marginLeft: '8px', fontStyle: 'italic' }}>
                                  (no prompts yet)
                          </span>
                              )}
                        </div>
                            <span style={{ color: count > 0 ? '#00FF00' : '#666666', fontSize: '1.2rem', fontWeight: 'bold' }}>
                              {formatNumber(count)}
                            </span>
                      </div>

                          {/* Recent Prompts List - Only shown when category is clicked/expanded */}
                      <AnimatePresence>
                            {isExpanded && (
                          <motion.div
                            initial={{ height: 0, opacity: 0 }}
                            animate={{ height: 'auto', opacity: 1 }}
                            exit={{ height: 0, opacity: 0 }}
                            transition={{ duration: 0.2 }}
                            style={{ overflow: 'hidden' }}
                          >
                                <div style={{ padding: '12px 20px 20px 40px', borderTop: '1px solid rgba(0, 255, 255, 0.2)' }}>
                                  {hasPrompts ? (
                              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                      {/* Clear button */}
                                      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '8px' }}>
                                        <button
                                          onClick={(e) => handleClearCategoryPrompts(category, e)}
                                          type="button"
                                      style={{
                                            background: 'transparent',
                                            border: '1px solid rgba(255, 107, 107, 0.3)',
                                            borderRadius: '6px',
                                            padding: '6px 12px',
                                          cursor: 'pointer',
                                          display: 'flex',
                                          alignItems: 'center',
                                            gap: '6px',
                                            transition: 'all 0.2s ease',
                                        }}
                                        onMouseEnter={(e) => {
                                            e.currentTarget.style.background = 'rgba(255, 107, 107, 0.1)'
                                            e.currentTarget.style.borderColor = 'rgba(255, 107, 107, 0.5)'
                                        }}
                                        onMouseLeave={(e) => {
                                            e.currentTarget.style.background = 'transparent'
                                            e.currentTarget.style.borderColor = 'rgba(255, 107, 107, 0.3)'
                                          }}
                                          title={`Clear all prompts for ${category}`}
                                        >
                                          <X size={14} color="#ff6b6b" />
                                          <span style={{ color: '#ff6b6b', fontSize: '0.75rem' }}>Clear Prompts</span>
                                        </button>
                                      </div>
                                      {recentPrompts.slice(0, 5).map((prompt, index) => {
                                        const promptDate = new Date(prompt.timestamp)
                                        const formattedDate = promptDate.toLocaleDateString('en-US', {
                                          month: 'short',
                                          day: 'numeric',
                                          year: 'numeric',
                                          hour: '2-digit',
                                          minute: '2-digit',
                                        })
                                        
                                        return (
                                          <div
                                            key={index}
                                              style={{
                                              background: 'rgba(0, 255, 255, 0.03)',
                                              border: '1px solid rgba(0, 255, 255, 0.15)',
                                              borderRadius: '8px',
                                              padding: '12px 16px',
                                            }}
                                          >
                                            <p style={{ color: '#cccccc', fontSize: '0.9rem', margin: '0 0 6px 0', lineHeight: '1.4' }}>
                                              {prompt.text}
                                            </p>
                                            <p style={{ color: '#888888', fontSize: '0.75rem', margin: 0 }}>
                                              {formattedDate}
                                            </p>
                                                </div>
                                        )
                                      })}
                                                </div>
                                  ) : (
                                    <p style={{ color: '#888888', fontSize: '0.9rem', textAlign: 'center', padding: '20px', fontStyle: 'italic' }}>
                                      No prompts in this category yet.
                                    </p>
                                  )}
                                            </div>
                                          </motion.div>
                                        )}
                                      </AnimatePresence>
                                    </div>
                                  )
                    })
                  })()}
                              </div>
                            </div>
                          </motion.div>
                        )}

          {activeTab === 'models' && (
            <motion.div
              key="models"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              transition={{ duration: 0.3 }}
            >
              {/* Provider Stats */}
              {Object.keys(userStats.providers || {}).length > 0 && (
                <div
                  style={{
                    background: 'rgba(0, 255, 255, 0.1)',
                    border: '1px solid rgba(0, 255, 255, 0.3)',
                    borderRadius: '16px',
                    padding: '30px',
                    marginBottom: '40px',
                  }}
                >
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    {Object.entries(userStats.providers)
                      .sort((a, b) => b[1].totalQueries - a[1].totalQueries)
                      .map(([provider, data]) => {
                        const isProviderExpanded = expandedProviders[provider]
                        const providerModels = Object.entries(userStats.models || {})
                          .filter(([modelKey]) => modelKey.startsWith(`${provider}-`))
                          .sort((a, b) => b[1].totalQueries - a[1].totalQueries)

                        return (
                          <div
                            key={provider}
                            style={{
                              background: 'rgba(0, 255, 255, 0.05)',
                              border: '1px solid rgba(0, 255, 255, 0.2)',
                              borderRadius: '12px',
                              overflow: 'hidden',
                            }}
                          >
                            {/* Provider Header - Clickable */}
                            <div
                              onClick={() => {
                                setExpandedProviders((prev) => ({
                                  ...prev,
                                  [provider]: !prev[provider],
                                }))
                              }}
                              style={{
                                padding: '16px 20px',
                                cursor: 'pointer',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'space-between',
                                transition: 'background 0.2s',
                              }}
                              onMouseEnter={(e) => {
                                e.currentTarget.style.background = 'rgba(0, 255, 255, 0.1)'
                              }}
                              onMouseLeave={(e) => {
                                e.currentTarget.style.background = 'rgba(0, 255, 255, 0.05)'
                              }}
                            >
                              <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flex: 1 }}>
                                {isProviderExpanded ? (
                                  <ChevronDown size={20} color="#00FFFF" />
                                ) : (
                                  <ChevronRight size={20} color="#00FFFF" />
                                )}
                                <h3 style={{ fontSize: '1.1rem', color: '#00FFFF', margin: 0, textTransform: 'capitalize' }}>
                                  {provider}
                                </h3>
                                <span style={{ color: '#888888', fontSize: '0.85rem', marginLeft: '8px' }}>
                                  ({providerModels.length} {providerModels.length === 1 ? 'model' : 'models'})
                                </span>
                              </div>
                              <div style={{ display: 'flex', gap: '24px', alignItems: 'center' }}>
                                <div style={{ textAlign: 'right' }}>
                                  <p style={{ color: '#aaaaaa', fontSize: '0.75rem', margin: 0 }}>Prompts</p>
                                  <p style={{ color: '#00FF00', fontSize: '1rem', fontWeight: 'bold', margin: 0 }}>
                                    {formatNumber(data.totalPrompts || 0)}
                                  </p>
                                </div>
                                <div style={{ textAlign: 'right' }}>
                                  <p style={{ color: '#aaaaaa', fontSize: '0.75rem', margin: 0 }}>Tokens</p>
                                  <p style={{ color: '#00FFFF', fontSize: '1rem', fontWeight: 'bold', margin: 0 }}>
                                    {formatTokens((data.totalInputTokens || 0) + (data.totalOutputTokens || 0))}
                                  </p>
                                </div>
                              </div>
                            </div>

                            {/* Models List - Collapsible */}
                            <AnimatePresence>
                              {isProviderExpanded && providerModels.length > 0 && (
                                <motion.div
                                  initial={{ height: 0, opacity: 0 }}
                                  animate={{ height: 'auto', opacity: 1 }}
                                  exit={{ height: 0, opacity: 0 }}
                                  transition={{ duration: 0.2 }}
                                  style={{ overflow: 'hidden' }}
                                >
                                  <div style={{ padding: '12px 20px 20px 20px', borderTop: '1px solid rgba(0, 255, 255, 0.2)' }}>
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                      {providerModels.map(([modelKey, modelData]) => {
                                        const isModelExpanded = expandedModels[modelKey]
                                        return (
                                          <div
                                            key={modelKey}
                                            style={{
                                              background: 'rgba(0, 255, 255, 0.03)',
                                              border: '1px solid rgba(0, 255, 255, 0.15)',
                                              borderRadius: '8px',
                                              overflow: 'hidden',
                                            }}
                                          >
                                            {/* Model Header - Clickable */}
                                            <div
                                              onClick={(e) => {
                                                e.stopPropagation()
                                                setExpandedModels((prev) => ({
                                                  ...prev,
                                                  [modelKey]: !prev[modelKey],
                                                }))
                                              }}
                                              style={{
                                                padding: '12px 16px',
                                                cursor: 'pointer',
                                                display: 'flex',
                                                alignItems: 'center',
                                                justifyContent: 'space-between',
                                                transition: 'background 0.2s',
                                              }}
                                              onMouseEnter={(e) => {
                                                e.currentTarget.style.background = 'rgba(0, 255, 255, 0.08)'
                                              }}
                                              onMouseLeave={(e) => {
                                                e.currentTarget.style.background = 'rgba(0, 255, 255, 0.03)'
                                              }}
                                            >
                                              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flex: 1 }}>
                                                {isModelExpanded ? (
                                                  <ChevronDown size={16} color="#cccccc" />
                                                ) : (
                                                  <ChevronRight size={16} color="#cccccc" />
                                                )}
                                                <span style={{ color: '#cccccc', fontSize: '0.9rem', fontWeight: '500' }}>
                                                  {modelData.model}
                                                </span>
                                              </div>
                                            </div>

                                            {/* Model Stats - Collapsible */}
                                            <AnimatePresence>
                                              {isModelExpanded && (
                                                <motion.div
                                                  initial={{ height: 0, opacity: 0 }}
                                                  animate={{ height: 'auto', opacity: 1 }}
                                                  exit={{ height: 0, opacity: 0 }}
                                                  transition={{ duration: 0.2 }}
                                                  style={{ overflow: 'hidden' }}
                                                >
                                                  <div
                                                    style={{
                                                      padding: '12px 16px 16px 40px',
                                                      background: 'rgba(0, 0, 0, 0.2)',
                                                      borderTop: '1px solid rgba(0, 255, 255, 0.1)',
                                                    }}
                                                  >
                                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                                        <span style={{ color: '#aaaaaa', fontSize: '0.85rem' }}>Total Prompts:</span>
                                                        <span style={{ color: '#00FF00', fontSize: '0.9rem', fontWeight: 'bold' }}>
                                                          {formatNumber(modelData.totalPrompts || 0)}
                                                        </span>
                                                      </div>
                                                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                                        <span style={{ color: '#aaaaaa', fontSize: '0.85rem' }}>Total Tokens:</span>
                                                        <span style={{ color: '#00FFFF', fontSize: '0.9rem', fontWeight: 'bold' }}>
                                                          {formatTokens((modelData.totalInputTokens || 0) + (modelData.totalOutputTokens || 0))}
                                                        </span>
                                                      </div>
                                                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                                        <span style={{ color: '#aaaaaa', fontSize: '0.85rem' }}>Pricing:</span>
                                                        <span
                                                          style={{
                                                            color: modelData.pricing ? '#FFD700' : '#888888',
                                                            fontSize: '0.9rem',
                                                            fontWeight: modelData.pricing ? 'bold' : 'normal',
                                                          }}
                                                        >
                                                          {modelData.pricing !== null && modelData.pricing !== undefined
                                                            ? `$${modelData.pricing}`
                                                            : 'TBD'}
                                                        </span>
                                                      </div>
                                                    </div>
                                                  </div>
                                                </motion.div>
                                              )}
                                            </AnimatePresence>
                                          </div>
                                        )
                                      })}
                                    </div>
                                  </div>
                                </motion.div>
                              )}
                            </AnimatePresence>
                          </div>
                        )
                      })}
                  </div>
                </div>
              )}

              {Object.keys(userStats.providers || {}).length === 0 && (
                <div
                  style={{
                    background: 'rgba(0, 255, 255, 0.1)',
                    border: '1px solid rgba(0, 255, 255, 0.3)',
                    borderRadius: '16px',
                    padding: '40px',
                    textAlign: 'center',
                  }}
                >
                  <p style={{ color: '#aaaaaa', fontSize: '1.1rem' }}>
                    No statistics yet. Start using ArkTek to see your usage data!
                  </p>
                </div>
              )}
            </motion.div>
          )}
                      </AnimatePresence>

        {/* Confirmation Modal */}
        <ConfirmationModal
          isOpen={showClearConfirm}
          onClose={() => {
            setShowClearConfirm(false)
            setCategoryToClear(null)
          }}
          onConfirm={clearCategoryPrompts}
          title="Clear Category Prompts"
          message={categoryToClear 
            ? `Are you sure you want to clear all prompts for "${categoryToClear}"? This action cannot be undone.`
            : 'Are you sure you want to clear these prompts? This action cannot be undone.'}
          confirmText="Clear Prompts"
          cancelText="Cancel"
          confirmColor="#ff6b6b"
        />
      </div>
    </motion.div>
  )
}

export default StatisticsView
