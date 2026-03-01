import React from 'react'
import { Users, TrendingUp, User, Lock, Search, ChevronDown, ChevronRight, BarChart3 } from 'lucide-react'
import { spacing, fontSize, fontWeight, radius, transition, layout, sx } from '../../utils/styles'

interface AdminUsersSectionProps {
  usersData: any
  costsData: any
  userFilter: string
  setUserFilter: (filter: string) => void
  userSearchQuery: string
  setUserSearchQuery: (query: string) => void
  expandedUsers: Record<string, boolean>
  setExpandedUsers: (fn: any) => void
  expandedUserProviders: Record<string, boolean>
  setExpandedUserProviders: (fn: any) => void
  expandedUserModels: Record<string, boolean>
  setExpandedUserModels: (fn: any) => void
  userStatsData: Record<string, any>
  loadingUserStats: Record<string, boolean>
  fetchUserStats: (userId: string) => void
  formatCurrency: (amount: number) => string
  formatNumber: (num: any) => string
  formatTokens: (num: number) => string
}

const AdminUsersSection = ({
  usersData,
  costsData,
  userFilter,
  setUserFilter,
  userSearchQuery,
  setUserSearchQuery,
  expandedUsers,
  setExpandedUsers,
  expandedUserProviders,
  setExpandedUserProviders,
  expandedUserModels,
  setExpandedUserModels,
  userStatsData,
  loadingUserStats,
  fetchUserStats,
  formatCurrency,
  formatNumber,
  formatTokens,
}: AdminUsersSectionProps) => {
  return (
    <>
      {/* Stats Cards */}
      {(() => {
        const totalUsers = usersData?.totalUsers || 0
        const activeUsers = usersData?.users?.filter((user: any) => user.status === 'active').length || 0
        const canceledUsers = usersData?.users?.filter((user: any) => user.status === 'canceled').length || 0
        const notActiveUsers = usersData?.users?.filter((user: any) => user.status === 'inactive').length || 0

        return (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: spacing['3xl'], marginBottom: spacing['5xl'] }}>
            {/* Total Users */}
            <div
              onClick={() => setUserFilter('all')}
                style={sx(layout.flexCol, {
                background: userFilter === 'all' ? 'rgba(93, 173, 226, 0.2)' : 'rgba(93, 173, 226, 0.1)',
                border: userFilter === 'all' ? '2px solid rgba(93, 173, 226, 0.6)' : '1px solid rgba(93, 173, 226, 0.3)',
                borderRadius: radius['2xl'],
                padding: spacing['4xl'],
                gap: spacing.xl,
                cursor: 'pointer',
                transition: transition.normal,
              })}
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
              <div style={sx(layout.flexRow, { gap: spacing.lg })}>
                <Users size={32} color="#5dade2" />
                <h2 style={{ fontSize: fontSize['4xl'], color: '#ffffff', margin: 0 }}>Total Users</h2>
              </div>
              <p
                style={{
                  fontSize: '3rem',
                  fontWeight: fontWeight.bold,
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
                ...layout.flexCol,
                background: userFilter === 'active' ? 'rgba(72, 201, 176, 0.2)' : 'rgba(72, 201, 176, 0.1)',
                border: userFilter === 'active' ? '2px solid rgba(72, 201, 176, 0.6)' : '1px solid rgba(72, 201, 176, 0.3)',
                borderRadius: radius['2xl'],
                padding: spacing['4xl'],
                gap: spacing.xl,
                cursor: 'pointer',
                transition: transition.normal,
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
              <div style={sx(layout.flexRow, { gap: spacing.lg })}>
                <TrendingUp size={32} color="#48c9b0" />
                <h2 style={{ fontSize: fontSize['4xl'], color: '#ffffff', margin: 0 }}>Active Users</h2>
              </div>
              <p
                style={{
                  fontSize: '3rem',
                  fontWeight: fontWeight.bold,
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
                ...layout.flexCol,
                background: userFilter === 'notActive' ? 'rgba(255, 165, 0, 0.2)' : 'rgba(255, 165, 0, 0.1)',
                border: userFilter === 'notActive' ? '2px solid rgba(255, 165, 0, 0.6)' : '1px solid rgba(255, 165, 0, 0.3)',
                borderRadius: radius['2xl'],
                padding: spacing['4xl'],
                gap: spacing.xl,
                cursor: 'pointer',
                transition: transition.normal,
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
              <div style={sx(layout.flexRow, { gap: spacing.lg })}>
                <User size={32} color="#FFA500" />
                <h2 style={{ fontSize: fontSize['4xl'], color: '#ffffff', margin: 0 }}>Not Active Users</h2>
              </div>
              <p
                style={{
                  fontSize: '3rem',
                  fontWeight: fontWeight.bold,
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
                ...layout.flexCol,
                background: userFilter === 'canceled' ? 'rgba(255, 0, 0, 0.2)' : 'rgba(255, 0, 0, 0.1)',
                border: userFilter === 'canceled' ? '2px solid rgba(255, 0, 0, 0.6)' : '1px solid rgba(255, 0, 0, 0.3)',
                borderRadius: radius['2xl'],
                padding: spacing['4xl'],
                gap: spacing.xl,
                cursor: 'pointer',
                transition: transition.normal,
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
              <div style={sx(layout.flexRow, { gap: spacing.lg })}>
                <Lock size={32} color="#FF0000" />
                <h2 style={{ fontSize: fontSize['4xl'], color: '#ffffff', margin: 0 }}>Canceled Users</h2>
              </div>
              <p
                style={{
                  fontSize: '3rem',
                  fontWeight: fontWeight.bold,
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
                ...layout.flexCol,
                background: 'rgba(128, 128, 128, 0.1)',
                border: '1px solid rgba(128, 128, 128, 0.3)',
                borderRadius: radius['2xl'],
                padding: spacing['4xl'],
                gap: spacing.xl,
              }}
            >
              <div style={sx(layout.flexRow, { gap: spacing.lg })}>
                <User size={32} color="#808080" />
                <h2 style={{ fontSize: fontSize['4xl'], color: '#ffffff', margin: 0 }}>Deleted Users</h2>
              </div>
              <p
                style={{
                  fontSize: '3rem',
                  fontWeight: fontWeight.bold,
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
            borderRadius: radius['2xl'],
            padding: spacing['4xl'],
            marginBottom: spacing['5xl'],
          }}
        >
          <h2 style={sx(layout.flexRow, { fontSize: '1.8rem', color: '#ffffff', marginBottom: spacing['3xl'], gap: spacing.lg })}>
            <Users size={28} color="#5dade2" />
            Users Usage & Costs ({usersData.totalUsers})
          </h2>
          
          {/* Search Bar */}
          <div style={{ marginBottom: spacing['2xl'] }}>
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
                  left: spacing.xl,
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
                  padding: `${spacing.lg} ${spacing.xl} ${spacing.lg} 48px`,
                  background: 'rgba(0, 0, 0, 0.3)',
                  border: '1px solid rgba(93, 173, 226, 0.3)',
                  borderRadius: radius.md,
                  color: '#ffffff',
                  fontSize: fontSize.xl,
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

          <div style={sx(layout.flexCol, { gap: spacing.lg, maxHeight: '600px', overflowY: 'auto' })}>
            {(() => {
              let usersToDisplay = []
              
              if (userFilter === 'active') {
                const activeUserIds = new Set(
                  usersData.users
                    .filter((user: any) => user.status === 'active')
                    .map((user: any) => user.id)
                )
                const activeFromCosts = costsData.userCosts.filter((userCost: any) => 
                  activeUserIds.has(userCost.userId)
                )
                const activeWithoutCosts = usersData.users
                  .filter((user: any) => user.status === 'active' && !activeFromCosts.find((uc: any) => uc.userId === user.id))
                  .map((user: any) => ({
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
                const inactiveUserIds = new Set(
                  usersData.users
                    .filter((user: any) => user.status === 'inactive')
                    .map((user: any) => user.id)
                )
                const inactiveFromCosts = costsData.userCosts.filter((userCost: any) => 
                  inactiveUserIds.has(userCost.userId)
                )
                const inactiveWithoutCosts = usersData.users
                  .filter((user: any) => user.status === 'inactive' && !inactiveFromCosts.find((uc: any) => uc.userId === user.id))
                  .map((user: any) => ({
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
                const canceledUserIds = new Set(
                  usersData.users
                    .filter((user: any) => user.status === 'canceled')
                    .map((user: any) => user.id)
                )
                const canceledFromCosts = costsData.userCosts.filter((userCost: any) => 
                  canceledUserIds.has(userCost.userId)
                )
                const canceledWithoutCosts = usersData.users
                  .filter((user: any) => user.status === 'canceled' && !canceledFromCosts.find((uc: any) => uc.userId === user.id))
                  .map((user: any) => ({
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
                const allUserIds = new Set(usersData.users.map((u: any) => u.id))
                const costUserIds = new Set(costsData.userCosts.map((uc: any) => uc.userId))
                
                usersToDisplay = usersData.users.map((user: any) => {
                  const userCost = costsData.userCosts.find((uc: any) => uc.userId === user.id)
                  if (userCost) {
                    return userCost
                  } else {
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
                usersToDisplay = costsData.userCosts
              }
              
              const filteredUsers = usersToDisplay.filter((userCost: any) => {
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
              
              return filteredUsers.map((userCost: any) => {
                const user = usersData.users.find((u: any) => u.id === userCost.userId) || {} as any
                const isExpanded = expandedUsers[userCost.userId]
                const userStatus = user.status || 'inactive'
                return (
                  <div
                    key={userCost.userId}
                    style={{
                      background: 'rgba(93, 173, 226, 0.05)',
                      border: '1px solid rgba(93, 173, 226, 0.2)',
                      borderRadius: radius.xl,
                      overflow: 'hidden',
                    }}
                  >
                  {/* User Header */}
                  <div
                    onClick={() => {
                      const newExpanded = !isExpanded
                      setExpandedUsers((prev: any) => ({
                        ...prev,
                        [userCost.userId]: newExpanded,
                      }))
                      if (newExpanded) {
                        fetchUserStats(userCost.userId)
                      }
                    }}
                    style={sx(layout.spaceBetween, {
                      padding: `${spacing.xl} ${spacing['2xl']}`,
                      cursor: 'pointer',
                      transition: 'background 0.2s',
                    })}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.background = 'rgba(93, 173, 226, 0.1)'
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.background = 'rgba(93, 173, 226, 0.05)'
                    }}
                  >
                    <div style={{ flex: 1 }}>
                      <div style={sx(layout.flexRow, { gap: spacing.lg, marginBottom: spacing.xs })}>
                        <p style={{ color: '#ffffff', fontSize: fontSize['2xl'], fontWeight: fontWeight.semibold, margin: 0 }}>
                          {userCost.firstName} {userCost.lastName}
                        </p>
                        {user?.isAdmin && (
                          <span
                            style={{
                              background: 'rgba(72, 201, 176, 0.2)',
                              border: '1px solid rgba(72, 201, 176, 0.5)',
                              borderRadius: radius.xs,
                              padding: `${spacing['2xs']} ${spacing.md}`,
                              fontSize: fontSize.sm,
                              color: '#48c9b0',
                              fontWeight: fontWeight.semibold,
                            }}
                          >
                            ADMIN
                          </span>
                        )}
                        <span
                          style={{
                            background: userStatus === 'active' ? 'rgba(72, 201, 176, 0.2)' : userStatus === 'canceled' ? 'rgba(255, 0, 0, 0.2)' : 'rgba(255, 165, 0, 0.2)',
                            border: userStatus === 'active' ? '1px solid rgba(72, 201, 176, 0.5)' : userStatus === 'canceled' ? '1px solid rgba(255, 0, 0, 0.5)' : '1px solid rgba(255, 165, 0, 0.5)',
                            borderRadius: radius.xs,
                            padding: `${spacing['2xs']} ${spacing.md}`,
                            fontSize: fontSize.sm,
                            color: userStatus === 'active' ? '#48c9b0' : userStatus === 'canceled' ? '#FF0000' : '#FFA500',
                            fontWeight: fontWeight.semibold,
                            textTransform: 'capitalize',
                          }}
                        >
                          {userStatus}
                        </span>
                      </div>
                      <p style={{ color: '#aaaaaa', fontSize: fontSize.base, margin: `${spacing.xs} 0` }}>
                        @{userCost.username} • {userCost.email}
                      </p>
                      {user?.lastActiveAt && (
                        <p style={{ color: '#888888', fontSize: fontSize.sm, margin: `${spacing.xs} 0 0 0` }}>
                          Last Active: {new Date(user.lastActiveAt).toLocaleString()}
                        </p>
                      )}
                    </div>
                    <div style={sx(layout.flexRow, { gap: spacing.xl })}>
                      {/* User Usage Summary */}
                      <div style={sx(layout.flexRow, { gap: spacing.xl })}>
                        <div style={{ textAlign: 'right' }}>
                          <p style={{ color: '#aaaaaa', fontSize: fontSize.xs, margin: `0 0 ${spacing['2xs']} 0` }}>Total Queries</p>
                          <p style={{ color: '#5dade2', fontSize: fontSize['2xl'], fontWeight: fontWeight.bold, margin: 0 }}>
                            {formatNumber(userCost.totalQueries || 0)}
                          </p>
                        </div>
                        <div style={{ textAlign: 'right' }}>
                          <p style={{ color: '#aaaaaa', fontSize: fontSize.xs, margin: `0 0 ${spacing['2xs']} 0` }}>Total Tokens</p>
                          <p style={{ color: '#5dade2', fontSize: fontSize['2xl'], fontWeight: fontWeight.bold, margin: 0 }}>
                            {formatTokens(userCost.totalTokens || 0)}
                          </p>
                        </div>
                        <div style={{ textAlign: 'right' }}>
                          <p style={{ color: '#aaaaaa', fontSize: fontSize.xs, margin: `0 0 ${spacing['2xs']} 0` }}>Total API Cost</p>
                          <p style={{ color: '#FFD700', fontSize: fontSize['2xl'], fontWeight: fontWeight.bold, margin: 0 }}>
                            ${(userCost.cost || 0).toFixed(2)}
                          </p>
                        </div>
                        <div style={{ textAlign: 'right' }}>
                          <p style={{ color: '#aaaaaa', fontSize: fontSize.xs, margin: `0 0 ${spacing['2xs']} 0` }}>End of Month Price</p>
                          <p
                            style={{
                              color: (userCost.cost || 0) > (userCost.plan === 'free_trial' ? 1.00 : 7.50) ? '#ff6b6b' : '#48c9b0',
                              fontSize: fontSize['2xl'],
                              fontWeight: fontWeight.bold,
                              margin: 0,
                            }}
                          >
                            ${Math.max(0, (userCost.cost || 0) - (userCost.plan === 'free_trial' ? 1.00 : 7.50)).toFixed(2)}
                          </p>
                        </div>
                      </div>
                      <span style={{ color: '#888888', fontSize: fontSize.sm }}>
                        {isExpanded ? '▼' : '▶'} View Details
                      </span>
                    </div>
                  </div>

                  {/* User Stats Details */}
                  {isExpanded && (
                    <div style={{ padding: spacing['2xl'], borderTop: '1px solid rgba(93, 173, 226, 0.2)', background: 'rgba(0, 0, 0, 0.2)' }}>
                      {loadingUserStats[userCost.userId] ? (
                        <div style={{ textAlign: 'center', padding: spacing['5xl'] }}>
                          <p style={{ color: '#aaaaaa', fontSize: fontSize['2xl'] }}>Loading statistics...</p>
                        </div>
                      ) : userStatsData[userCost.userId] ? (
                        (() => {
                          const stats = userStatsData[userCost.userId]
                          
                          return (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: spacing['3xl'] }}>
                              {/* Overview Stats */}
                              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: spacing.xl }}>
                                <div style={{ background: 'rgba(93, 173, 226, 0.05)', padding: spacing.xl, borderRadius: radius.md, textAlign: 'center' }}>
                                  <p style={{ color: '#aaaaaa', fontSize: fontSize.sm, margin: `0 0 ${spacing.md} 0` }}>Total Tokens</p>
                                  <p style={{ color: '#5dade2', fontSize: fontSize['6xl'], fontWeight: fontWeight.bold, margin: 0 }}>
                                    {formatTokens(stats.totalTokens || 0)}
                                  </p>
                                </div>
                                <div style={{ background: 'rgba(93, 173, 226, 0.05)', padding: spacing.xl, borderRadius: radius.md, textAlign: 'center' }}>
                                  <p style={{ color: '#aaaaaa', fontSize: fontSize.sm, margin: `0 0 ${spacing.md} 0` }}>Input Tokens</p>
                                  <p style={{ color: '#5dade2', fontSize: fontSize['6xl'], fontWeight: fontWeight.bold, margin: 0 }}>
                                    {formatTokens(stats.totalInputTokens || 0)}
                                  </p>
                                </div>
                                <div style={{ background: 'rgba(93, 173, 226, 0.05)', padding: spacing.xl, borderRadius: radius.md, textAlign: 'center' }}>
                                  <p style={{ color: '#aaaaaa', fontSize: fontSize.sm, margin: `0 0 ${spacing.md} 0` }}>Output Tokens</p>
                                  <p style={{ color: '#5dade2', fontSize: fontSize['6xl'], fontWeight: fontWeight.bold, margin: 0 }}>
                                    {formatTokens(stats.totalOutputTokens || 0)}
                                  </p>
                                </div>
                                <div style={{ background: 'rgba(93, 173, 226, 0.05)', padding: spacing.xl, borderRadius: radius.md, textAlign: 'center' }}>
                                  <p style={{ color: '#aaaaaa', fontSize: fontSize.sm, margin: `0 0 ${spacing.md} 0` }}>Total Prompts</p>
                                  <p style={{ color: '#48c9b0', fontSize: fontSize['6xl'], fontWeight: fontWeight.bold, margin: 0 }}>
                                    {formatNumber(stats.totalPrompts || 0)}
                                  </p>
                                </div>
                                <div style={{ background: 'rgba(93, 173, 226, 0.05)', padding: spacing.xl, borderRadius: radius.md, textAlign: 'center' }}>
                                  <p style={{ color: '#aaaaaa', fontSize: fontSize.sm, margin: `0 0 ${spacing.md} 0` }}>Total Queries</p>
                                  <p style={{ color: '#48c9b0', fontSize: fontSize['6xl'], fontWeight: fontWeight.bold, margin: 0 }}>
                                    {formatNumber(stats.totalQueries || 0)}
                                  </p>
                                </div>
                              </div>

                              {/* Monthly Stats */}
                              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: spacing.xl }}>
                                <div style={{ background: 'rgba(72, 201, 176, 0.05)', padding: spacing.xl, borderRadius: radius.md, textAlign: 'center' }}>
                                  <p style={{ color: '#aaaaaa', fontSize: fontSize.sm, margin: `0 0 ${spacing.md} 0` }}>Monthly Tokens</p>
                                  <p style={{ color: '#48c9b0', fontSize: fontSize['6xl'], fontWeight: fontWeight.bold, margin: 0 }}>
                                    {formatTokens(stats.monthlyTokens || 0)}
                                  </p>
                                </div>
                                <div style={{ background: 'rgba(72, 201, 176, 0.05)', padding: spacing.xl, borderRadius: radius.md, textAlign: 'center' }}>
                                  <p style={{ color: '#aaaaaa', fontSize: fontSize.sm, margin: `0 0 ${spacing.md} 0` }}>Monthly Input</p>
                                  <p style={{ color: '#48c9b0', fontSize: fontSize['6xl'], fontWeight: fontWeight.bold, margin: 0 }}>
                                    {formatTokens(stats.monthlyInputTokens || 0)}
                                  </p>
                                </div>
                                <div style={{ background: 'rgba(72, 201, 176, 0.05)', padding: spacing.xl, borderRadius: radius.md, textAlign: 'center' }}>
                                  <p style={{ color: '#aaaaaa', fontSize: fontSize.sm, margin: `0 0 ${spacing.md} 0` }}>Monthly Output</p>
                                  <p style={{ color: '#48c9b0', fontSize: fontSize['6xl'], fontWeight: fontWeight.bold, margin: 0 }}>
                                    {formatTokens(stats.monthlyOutputTokens || 0)}
                                  </p>
                                </div>
                                <div style={{ background: 'rgba(72, 201, 176, 0.05)', padding: spacing.xl, borderRadius: radius.md, textAlign: 'center' }}>
                                  <p style={{ color: '#aaaaaa', fontSize: fontSize.sm, margin: `0 0 ${spacing.md} 0` }}>Monthly Prompts</p>
                                  <p style={{ color: '#48c9b0', fontSize: fontSize['6xl'], fontWeight: fontWeight.bold, margin: 0 }}>
                                    {formatNumber(stats.monthlyPrompts || 0)}
                                  </p>
                                </div>
                                <div style={{ background: 'rgba(72, 201, 176, 0.05)', padding: spacing.xl, borderRadius: radius.md, textAlign: 'center' }}>
                                  <p style={{ color: '#aaaaaa', fontSize: fontSize.sm, margin: `0 0 ${spacing.md} 0` }}>Monthly Queries</p>
                                  <p style={{ color: '#48c9b0', fontSize: fontSize['6xl'], fontWeight: fontWeight.bold, margin: 0 }}>
                                    {formatNumber(stats.monthlyQueries || 0)}
                                  </p>
                                </div>
                              </div>

                              {/* Provider Breakdown */}
                              {Object.keys(stats.providers || {}).length > 0 && (
                                <div>
                                  <h3 style={{ color: '#5dade2', fontSize: fontSize['2xl'], marginBottom: spacing.lg, fontWeight: fontWeight.semibold, display: 'flex', alignItems: 'center', gap: spacing.md }}>
                                    <BarChart3 size={20} />
                                    Provider Statistics
                                  </h3>
                                  <div style={{ display: 'flex', flexDirection: 'column', gap: spacing.md }}>
                                    {Object.entries(stats.providers)
                                      .sort((a, b) => (b[1] as any).totalQueries - (a[1] as any).totalQueries)
                                      .map(([provider, data]: [string, any]) => {
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
                                              borderRadius: radius.md,
                                              overflow: 'hidden',
                                            }}
                                          >
                                            <div
                                              onClick={() => {
                                                setExpandedUserProviders((prev: any) => ({ ...prev, [providerKey]: !prev[providerKey] }))
                                              }}
                                              style={{
                                                padding: `${spacing.lg} ${spacing.xl}`,
                                                cursor: 'pointer',
                                                display: 'flex',
                                                justifyContent: 'space-between',
                                                alignItems: 'center',
                                              }}
                                            >
                                              <div style={{ display: 'flex', alignItems: 'center', gap: spacing.md }}>
                                                {isProviderExpanded ? <ChevronDown size={16} color="#5dade2" /> : <ChevronRight size={16} color="#5dade2" />}
                                                <span style={{ color: '#5dade2', fontSize: fontSize.lg, textTransform: 'capitalize' }}>{provider}</span>
                                              </div>
                                              <div style={{ display: 'flex', gap: spacing.xl }}>
                                                <span style={{ color: '#aaaaaa', fontSize: fontSize.sm }}>Tokens: {formatTokens(data.totalTokens)}</span>
                                                <span style={{ color: '#aaaaaa', fontSize: fontSize.sm }}>Queries: {formatNumber(data.totalQueries)}</span>
                                              </div>
                                            </div>
                                            {isProviderExpanded && providerModels.length > 0 && (
                                              <div style={{ padding: '12px 16px 12px 32px', borderTop: '1px solid rgba(93, 173, 226, 0.2)' }}>
                                                {providerModels.map(([modelKey, modelData]: [string, any]) => (
                                                  <div
                                                    key={modelKey}
                                                    style={{
                                                      background: 'rgba(93, 173, 226, 0.03)',
                                                      padding: `${spacing.md} ${spacing.lg}`,
                                                      borderRadius: radius.sm,
                                                      marginBottom: spacing.sm,
                                                      display: 'flex',
                                                      justifyContent: 'space-between',
                                                    }}
                                                  >
                                                    <span style={{ color: '#cccccc', fontSize: fontSize.base }}>{modelData.model}</span>
                                                    <div style={{ display: 'flex', gap: spacing.lg }}>
                                                      <span style={{ color: '#aaaaaa', fontSize: fontSize.sm }}>Tokens: {formatTokens(modelData.totalTokens || 0)}</span>
                                                      <span style={{ color: '#aaaaaa', fontSize: fontSize.sm }}>Queries: {formatNumber(modelData.totalQueries || 0)}</span>
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
                                <div style={{ background: 'rgba(72, 201, 176, 0.1)', padding: spacing.xl, borderRadius: radius.md, border: '1px solid rgba(72, 201, 176, 0.3)' }}>
                                  <h3 style={{ color: '#48c9b0', fontSize: fontSize['2xl'], marginBottom: spacing.lg, fontWeight: fontWeight.semibold }}>
                                    Total Cost: {formatCurrency(userCost.cost)}
                                  </h3>
                                  {Object.keys(userCost.modelCosts || {}).length > 0 && (
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: spacing.md }}>
                                      {(Object.entries(userCost.modelCosts) as [string, any][]).map(([modelKey, modelCost]) => (
                                        <div
                                          key={modelKey}
                                          style={{
                                            display: 'flex',
                                            justifyContent: 'space-between',
                                            padding: `${spacing.md} ${spacing.lg}`,
                                            background: 'rgba(72, 201, 176, 0.05)',
                                            borderRadius: radius.sm,
                                          }}
                                        >
                                          <span style={{ color: '#cccccc', fontSize: fontSize.base }}>
                                            {modelCost.provider} - {modelCost.model}
                                          </span>
                                          <span style={{ color: '#48c9b0', fontSize: fontSize.lg, fontWeight: fontWeight.bold }}>
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
                        <div style={{ textAlign: 'center', padding: spacing['5xl'] }}>
                          <p style={{ color: '#aaaaaa', fontSize: fontSize['2xl'] }}>No statistics available</p>
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
  )
}

export default AdminUsersSection
