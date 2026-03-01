import React from 'react'
import { TrendingUp, Receipt, Users, User, CreditCard, DollarSign, ChevronDown, ChevronRight, ChevronLeft, BarChart3, Package, Award, Trophy } from 'lucide-react'
import { spacing, fontSize, fontWeight, radius, zIndex, transition, layout, sx } from '../../utils/styles'

interface AdminRevenueExpensesProps {
  expensesSubSection: string | null
  setExpensesSubSection: (section: string) => void
  timePeriod: string
  setTimePeriod: (period: string) => void
  periodDropdownOpen: boolean
  setPeriodDropdownOpen: (open: boolean) => void
  referenceDate: string
  setReferenceDate: (date: string) => void
  expenseMonth: string
  setExpenseMonth: (month: string) => void
  setExpensesLoaded: (loaded: boolean) => void
  expenses: Record<string, string>
  handleExpenseChange: (field: string, value: string) => void
  loadingRevenue: boolean
  revenueData: any
  totalApiCost: number
  grandTotal: number
  effectiveGrandTotal: number
  dailyFavoritesHypothetical: number
  loadPeriodData: (period?: string, dateVal?: string) => void
  shiftPeriod: (direction: string) => void
  getPeriodLabel: () => string
  periodOptions: Array<{ value: string; label: string }>
  expensesSaving: boolean
  expensesLoaded: boolean
  loadingAggExpenses: boolean
  aggregatedExpenses: any
  userListTab: string | null
  setUserListTab: (tab: string | null) => void
  userListVisibleCount: Record<string, number>
  setUserListVisibleCount: (fn: any) => void
  revenueListOpen: Record<string, boolean>
  setRevenueListOpen: (fn: any) => void
  revenueListVisible: Record<string, number>
  setRevenueListVisible: (fn: any) => void
}

const AdminRevenueExpenses = ({
  expensesSubSection,
  setExpensesSubSection,
  timePeriod,
  setTimePeriod,
  periodDropdownOpen,
  setPeriodDropdownOpen,
  referenceDate,
  setReferenceDate,
  expenseMonth,
  setExpenseMonth,
  setExpensesLoaded,
  expenses,
  handleExpenseChange,
  loadingRevenue,
  revenueData,
  totalApiCost,
  grandTotal,
  effectiveGrandTotal,
  dailyFavoritesHypothetical,
  loadPeriodData,
  shiftPeriod,
  getPeriodLabel,
  periodOptions,
  expensesSaving,
  expensesLoaded,
  loadingAggExpenses,
  aggregatedExpenses,
  userListTab,
  setUserListTab,
  userListVisibleCount,
  setUserListVisibleCount,
  revenueListOpen,
  setRevenueListOpen,
  revenueListVisible,
  setRevenueListVisible,
}: AdminRevenueExpensesProps) => {
  return (
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
            padding: `14px ${spacing.lg}`,
            background: expensesSubSection === 'revenue' ? 'rgba(93, 173, 226, 0.08)' : 'transparent',
            border: 'none',
            borderBottom: expensesSubSection === 'revenue' ? '2px solid #5dade2' : '2px solid transparent',
            color: expensesSubSection === 'revenue' ? '#5dade2' : '#6b7280',
            fontSize: fontSize['2xl'],
            fontWeight: expensesSubSection === 'revenue' ? fontWeight.semibold : fontWeight.normal,
            cursor: 'pointer',
            transition: transition.normal,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: spacing.md,
          }}
        >
          <TrendingUp size={18} />
          Revenue
        </button>
        <button
          onClick={() => setExpensesSubSection('expenses')}
          style={{
            flex: 1,
            padding: `14px ${spacing.lg}`,
            background: expensesSubSection === 'expenses' ? 'rgba(93, 173, 226, 0.08)' : 'transparent',
            border: 'none',
            borderBottom: expensesSubSection === 'expenses' ? '2px solid #5dade2' : '2px solid transparent',
            color: expensesSubSection === 'expenses' ? '#5dade2' : '#6b7280',
            fontSize: fontSize['2xl'],
            fontWeight: expensesSubSection === 'expenses' ? fontWeight.semibold : fontWeight.normal,
            cursor: 'pointer',
            transition: transition.normal,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: spacing.md,
          }}
        >
          <Receipt size={18} />
          Expenses
        </button>
      </div>

      {/* ═══════════════════ REVENUE TAB ═══════════════════ */}
      {expensesSubSection === 'revenue' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: spacing['3xl'] }}>

          {loadingRevenue ? (
            <div style={{ textAlign: 'center', padding: spacing['5xl'], color: '#cccccc' }}>Loading revenue data...</div>
          ) : !revenueData ? (
            <div style={{ textAlign: 'center', padding: spacing['5xl'], color: '#cccccc' }}>No revenue data available for this period</div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: spacing['2xl'] }}>

              {/* Current Totals (always global) */}
              <div style={{
                background: 'rgba(93, 173, 226, 0.04)',
                border: '1px solid rgba(93, 173, 226, 0.15)',
                borderRadius: radius.xl,
                padding: `${spacing.xl} ${spacing['3xl']}`,
                display: 'flex',
                justifyContent: 'space-around',
                alignItems: 'center',
                gap: spacing.xl,
                flexWrap: 'wrap',
              }}>
                <span style={{ color: '#6b7280', fontSize: fontSize.base }}>Current totals:</span>
                {[
                  { label: 'Total Active', value: (revenueData.activeSubscriptions ?? 0) + (revenueData.activeFreeTrials ?? 0) },
                  { label: 'Paid', value: revenueData.activeSubscriptions ?? 0 },
                  { label: 'Free Plan', value: revenueData.activeFreeTrials ?? 0 },
                ].map(({ label, value }) => (
                  <div key={label} style={{ display: 'flex', alignItems: 'center', gap: spacing.md }}>
                    <span style={{ color: '#999999', fontSize: fontSize.md }}>{label}</span>
                    <span style={{ color: '#ffffff', fontSize: '1.4rem', fontWeight: fontWeight.bold, fontFamily: 'monospace' }}>{value}</span>
                  </div>
                ))}
              </div>

              {/* Period Selector */}
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: spacing.xl, flexWrap: 'wrap' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: spacing.lg, flexWrap: 'wrap' }}>
                  <div style={{ position: 'relative' }}>
                    <div
                      onClick={() => setPeriodDropdownOpen(!periodDropdownOpen)}
                      style={{
                        background: 'rgba(93, 173, 226, 0.1)',
                        border: '1px solid rgba(93, 173, 226, 0.3)',
                        borderRadius: radius.lg,
                        padding: `10px ${spacing.xl}`,
                        color: '#ffffff',
                        fontSize: fontSize['2xl'],
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        gap: spacing.md,
                        minWidth: '130px',
                        justifyContent: 'space-between',
                        transition: transition.normal,
                      }}
                    >
                      <span>{periodOptions.find(o => o.value === timePeriod)?.label}</span>
                      <ChevronDown size={16} style={{ transition: 'transform 0.2s ease', transform: periodDropdownOpen ? 'rotate(180deg)' : 'rotate(0deg)' }} />
                    </div>
                    {periodDropdownOpen && (
                      <>
                        <div onClick={() => setPeriodDropdownOpen(false)} style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, zIndex: 99 }} />
                        <div style={{ position: 'absolute', top: 'calc(100% + 6px)', left: 0, background: '#0a0a0a', border: '1px solid rgba(93, 173, 226, 0.2)', borderRadius: radius.xl, padding: spacing.sm, zIndex: zIndex.sticky, minWidth: '160px', boxShadow: '0 12px 40px rgba(0,0,0,0.5)' }}>
                          {periodOptions.map(opt => (
                            <div
                              key={opt.value}
                              onClick={() => { setTimePeriod(opt.value); setPeriodDropdownOpen(false); loadPeriodData(opt.value, referenceDate) }}
                              style={{ padding: '10px 14px', borderRadius: radius.md, cursor: 'pointer', color: timePeriod === opt.value ? '#ffffff' : '#cccccc', background: timePeriod === opt.value ? 'rgba(93, 173, 226, 0.25)' : 'transparent', fontSize: fontSize.xl, transition: transition.fast }}
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
                      style={{ background: 'rgba(93, 173, 226, 0.06)', border: '1px solid rgba(93, 173, 226, 0.2)', borderRadius: radius.lg, padding: `10px ${spacing.xl}`, color: '#ffffff', fontSize: fontSize['2xl'], outline: 'none', cursor: 'pointer', colorScheme: 'dark' }} />
                  )}
                  {timePeriod === 'week' && (
                    <input type="date" value={referenceDate} onChange={(e) => { setReferenceDate(e.target.value); loadPeriodData('week', e.target.value) }}
                      style={{ background: 'rgba(93, 173, 226, 0.06)', border: '1px solid rgba(93, 173, 226, 0.2)', borderRadius: radius.lg, padding: `10px ${spacing.xl}`, color: '#ffffff', fontSize: fontSize['2xl'], outline: 'none', cursor: 'pointer', colorScheme: 'dark' }} />
                  )}
                  {timePeriod === 'month' && (
                    <input type="month" value={expenseMonth} onChange={(e) => { const m = e.target.value; setExpenseMonth(m); setReferenceDate(`${m  }-01`); setExpensesLoaded(false); loadPeriodData('month', `${m  }-01`) }}
                      style={{ background: 'rgba(93, 173, 226, 0.06)', border: '1px solid rgba(93, 173, 226, 0.2)', borderRadius: radius.lg, padding: `10px ${spacing.xl}`, color: '#ffffff', fontSize: fontSize['2xl'], outline: 'none', cursor: 'pointer', colorScheme: 'dark' }} />
                  )}
                  {timePeriod === 'quarter' && (() => {
                    const ref = new Date(`${referenceDate  }T00:00:00`)
                    const currentQ = Math.ceil((ref.getMonth() + 1) / 3)
                    const currentY = ref.getFullYear()
                    return (
                      <div style={{ display: 'flex', gap: spacing.md }}>
                        <select value={currentQ} onChange={(e) => { const q = parseInt(e.target.value); const nd = `${currentY}-${String((q - 1) * 3 + 1).padStart(2, '0')}-01`; setReferenceDate(nd); loadPeriodData('quarter', nd) }}
                          style={{ background: 'rgba(93, 173, 226, 0.06)', border: '1px solid rgba(93, 173, 226, 0.2)', borderRadius: radius.lg, padding: `10px ${spacing.xl}`, color: '#ffffff', fontSize: fontSize['2xl'], outline: 'none', cursor: 'pointer', colorScheme: 'dark' }}>
                          <option value={1} style={{ background: '#0a0a0a' }}>Q1 (Jan–Mar)</option>
                          <option value={2} style={{ background: '#0a0a0a' }}>Q2 (Apr–Jun)</option>
                          <option value={3} style={{ background: '#0a0a0a' }}>Q3 (Jul–Sep)</option>
                          <option value={4} style={{ background: '#0a0a0a' }}>Q4 (Oct–Dec)</option>
                        </select>
                        <input type="number" value={currentY} min={2024} max={2035} onChange={(e) => { const nd = `${e.target.value}-${String((currentQ - 1) * 3 + 1).padStart(2, '0')}-01`; setReferenceDate(nd); loadPeriodData('quarter', nd) }}
                          style={{ background: 'rgba(93, 173, 226, 0.06)', border: '1px solid rgba(93, 173, 226, 0.2)', borderRadius: radius.lg, padding: `10px ${spacing.xl}`, color: '#ffffff', fontSize: fontSize['2xl'], width: '100px', outline: 'none', colorScheme: 'dark' }} />
                      </div>
                    )
                  })()}
                  {timePeriod === 'year' && (
                    <input type="number" value={new Date(`${referenceDate  }T00:00:00`).getFullYear()} min={2024} max={2035} onChange={(e) => { const nd = `${e.target.value}-01-01`; setReferenceDate(nd); loadPeriodData('year', nd) }}
                      style={{ background: 'rgba(93, 173, 226, 0.06)', border: '1px solid rgba(93, 173, 226, 0.2)', borderRadius: radius.lg, padding: `10px ${spacing.xl}`, color: '#ffffff', fontSize: fontSize['2xl'], width: '110px', outline: 'none', colorScheme: 'dark' }} />
                  )}

                  {timePeriod !== 'all' && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: spacing.sm }}>
                      <div
                        onClick={() => shiftPeriod('prev')}
                        style={{ width: '32px', height: '32px', borderRadius: radius.md, background: 'rgba(93, 173, 226, 0.08)', border: '1px solid rgba(93, 173, 226, 0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', transition: transition.fast }}
                        onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(93, 173, 226, 0.2)' }}
                        onMouseLeave={(e) => { e.currentTarget.style.background = 'rgba(93, 173, 226, 0.08)' }}
                      >
                        <ChevronLeft size={16} color="#5dade2" />
                      </div>
                      <span style={{ color: '#6b7280', fontSize: fontSize.lg, fontStyle: 'italic', minWidth: '120px', textAlign: 'center' }}>{getPeriodLabel()}</span>
                      <div
                        onClick={() => shiftPeriod('next')}
                        style={{ width: '32px', height: '32px', borderRadius: radius.md, background: 'rgba(93, 173, 226, 0.08)', border: '1px solid rgba(93, 173, 226, 0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', transition: transition.fast }}
                        onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(93, 173, 226, 0.2)' }}
                        onMouseLeave={(e) => { e.currentTarget.style.background = 'rgba(93, 173, 226, 0.08)' }}
                      >
                        <ChevronRight size={16} color="#5dade2" />
                      </div>
                    </div>
                  )}
                  {timePeriod === 'all' && (
                    <span style={{ color: '#6b7280', fontSize: fontSize.lg, fontStyle: 'italic' }}>{getPeriodLabel()}</span>
                  )}
                </div>
              </div>

              {/* Subscriptions Revenue */}
              <div style={{ background: 'rgba(93, 173, 226, 0.06)', border: '1px solid rgba(93, 173, 226, 0.15)', borderRadius: radius.xl, padding: spacing['3xl'] }}>
                <h3 style={{ fontSize: '1.15rem', color: '#5dade2', marginBottom: spacing.xl, display: 'flex', alignItems: 'center', gap: spacing.lg }}>
                  <Users size={20} color="#5dade2" />
                  Subscription Revenue
                </h3>
                <div style={{ display: 'flex', flexDirection: 'column', gap: spacing.lg }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 14px', background: 'rgba(93, 173, 226, 0.04)', borderRadius: radius.lg }}>
                    <span style={{ color: '#cccccc', fontSize: fontSize.xl }}>
                      {revenueData.newSubscriptions} new subscription{revenueData.newSubscriptions !== 1 ? 's' : ''} @ ${revenueData.subscriptionPrice}/mo
                    </span>
                    <span style={{ color: '#ffffff', fontSize: fontSize['4xl'], fontWeight: fontWeight.bold, fontFamily: 'monospace' }}>
                      ${(revenueData.newSubscriptionRevenue ?? 0).toFixed(2)}
                    </span>
                  </div>
                  {revenueData.subscriptionUsers?.length > 0 && (() => {
                    const isOpen = revenueListOpen.newSubs
                    const visible = revenueListVisible.newSubs ?? 10
                    const users = revenueData.subscriptionUsers
                    const shown = users.slice(0, visible)
                    return (
                      <div style={{ marginLeft: spacing.md }}>
                        <div
                          onClick={() => setRevenueListOpen((prev: any) => ({ ...prev, newSubs: !prev.newSubs }))}
                          style={{ display: 'flex', alignItems: 'center', gap: spacing.sm, cursor: 'pointer', userSelect: 'none' }}
                          onMouseEnter={(e) => e.currentTarget.style.opacity = '0.8'}
                          onMouseLeave={(e) => e.currentTarget.style.opacity = '1'}
                        >
                          {isOpen ? <ChevronDown size={14} color="#6b7280" /> : <ChevronRight size={14} color="#6b7280" />}
                          <p style={{ color: '#6b7280', fontSize: fontSize.md, margin: 0, textTransform: 'uppercase', letterSpacing: '1px' }}>New subscribers ({users.length})</p>
                        </div>
                        {isOpen && (
                          <div style={{ display: 'flex', flexDirection: 'column', gap: spacing.md, marginTop: spacing.md }}>
                            {shown.map((u: any, i: number) => (
                              <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: `${spacing.md} ${spacing.lg}`, background: 'rgba(93, 173, 226, 0.06)', borderRadius: radius.md }}>
                                <span style={{ color: '#cccccc', fontSize: fontSize.lg }}>
                                  <User size={14} style={{ marginRight: spacing.sm, verticalAlign: 'middle', opacity: 0.6 }} />
                                  {u.username}
                                </span>
                                <span style={{ color: '#666666', fontSize: fontSize.md }}>{new Date(u.date).toLocaleDateString()}</span>
                              </div>
                            ))}
                            <div style={{ display: 'flex', justifyContent: 'center', gap: spacing.lg, marginTop: spacing.sm }}>
                              {visible < users.length && (
                                <div onClick={() => setRevenueListVisible((prev: any) => ({ ...prev, newSubs: (prev.newSubs ?? 10) + 10 }))}
                                style={{ padding: `${spacing.sm} ${spacing.xl}`, borderRadius: radius.md, background: 'rgba(93, 173, 226, 0.1)', border: '1px solid rgba(93, 173, 226, 0.2)', color: '#5dade2', fontSize: fontSize.md, cursor: 'pointer' }}>
                                Show More ({users.length - visible} remaining)
                              </div>
                            )}
                            {visible > 10 && (
                              <div onClick={() => setRevenueListVisible((prev: any) => ({ ...prev, newSubs: 10 }))}
                                style={{ padding: `${spacing.sm} ${spacing.xl}`, borderRadius: radius.md, background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', color: '#999999', fontSize: fontSize.md, cursor: 'pointer' }}>
                                Show Less
                                </div>
                              )}
                            </div>
                          </div>
                        )}
                      </div>
                    )
                  })()}
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 14px', background: 'rgba(93, 173, 226, 0.04)', borderRadius: radius.lg }}>
                    <span style={{ color: '#cccccc', fontSize: fontSize.xl }}>
                      {revenueData.renewedSubscriptions ?? 0} renewed subscription{(revenueData.renewedSubscriptions ?? 0) !== 1 ? 's' : ''} @ ${revenueData.subscriptionPrice}/mo
                    </span>
                    <span style={{ color: '#ffffff', fontSize: fontSize['4xl'], fontWeight: fontWeight.bold, fontFamily: 'monospace' }}>
                      ${(revenueData.renewalRevenue ?? 0).toFixed(2)}
                    </span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 14px', borderTop: '1px solid rgba(93, 173, 226, 0.15)', marginTop: spacing.xs }}>
                    <span style={{ color: '#5dade2', fontSize: '1.05rem', fontWeight: fontWeight.semibold }}>Total Subscription Revenue</span>
                    <span style={{ color: '#ffffff', fontSize: fontSize['5xl'], fontWeight: fontWeight.bold, fontFamily: 'monospace' }}>
                      ${(revenueData.totalSubscriptionRevenue ?? 0).toFixed(2)}
                    </span>
                  </div>
                </div>
              </div>

              {/* Free Plan Users */}
              <div style={{ background: 'rgba(93, 173, 226, 0.06)', border: '1px solid rgba(93, 173, 226, 0.15)', borderRadius: radius.xl, padding: spacing['3xl'] }}>
                <h3 style={{ fontSize: '1.15rem', color: '#5dade2', marginBottom: spacing.xl, display: 'flex', alignItems: 'center', gap: spacing.lg }}>
                  <User size={20} color="#5dade2" />
                  Free Plan Users
                </h3>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ color: '#cccccc', fontSize: fontSize.xl }}>
                    {revenueData.newFreeTrials ?? 0} new trial{(revenueData.newFreeTrials ?? 0) !== 1 ? 's' : ''} this period
                  </span>
                </div>
                {revenueData.freeTrialUsers?.length > 0 && (() => {
                  const isOpen = revenueListOpen.freeTrials
                  const visible = revenueListVisible.freeTrials ?? 10
                  const users = revenueData.freeTrialUsers
                  const shown = users.slice(0, visible)
                  return (
                    <div style={{ marginLeft: spacing.md, marginTop: spacing.lg }}>
                      <div
                        onClick={() => setRevenueListOpen((prev: any) => ({ ...prev, freeTrials: !prev.freeTrials }))}
                        style={{ display: 'flex', alignItems: 'center', gap: spacing.sm, cursor: 'pointer', userSelect: 'none' }}
                        onMouseEnter={(e) => e.currentTarget.style.opacity = '0.8'}
                        onMouseLeave={(e) => e.currentTarget.style.opacity = '1'}
                      >
                        {isOpen ? <ChevronDown size={14} color="#6b7280" /> : <ChevronRight size={14} color="#6b7280" />}
                        <p style={{ color: '#6b7280', fontSize: fontSize.md, margin: 0, textTransform: 'uppercase', letterSpacing: '1px' }}>New trial users ({users.length})</p>
                      </div>
                      {isOpen && (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: spacing.md, marginTop: spacing.md }}>
                          {shown.map((u: any, i: number) => (
                            <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: `${spacing.md} ${spacing.lg}`, background: 'rgba(93, 173, 226, 0.06)', borderRadius: radius.md }}>
                              <span style={{ color: '#cccccc', fontSize: fontSize.lg }}>
                                <User size={14} style={{ marginRight: spacing.sm, verticalAlign: 'middle', opacity: 0.6 }} />
                                {u.username}
                              </span>
                              <span style={{ color: '#666666', fontSize: fontSize.md }}>{new Date(u.date).toLocaleDateString()}</span>
                            </div>
                          ))}
                          <div style={{ display: 'flex', justifyContent: 'center', gap: spacing.lg, marginTop: spacing.sm }}>
                            {visible < users.length && (
                              <div onClick={() => setRevenueListVisible((prev: any) => ({ ...prev, freeTrials: (prev.freeTrials ?? 10) + 10 }))}
                                style={{ padding: `${spacing.sm} ${spacing.xl}`, borderRadius: radius.md, background: 'rgba(93, 173, 226, 0.1)', border: '1px solid rgba(93, 173, 226, 0.2)', color: '#5dade2', fontSize: fontSize.md, cursor: 'pointer' }}>
                                Show More ({users.length - visible} remaining)
                              </div>
                            )}
                            {visible > 10 && (
                              <div onClick={() => setRevenueListVisible((prev: any) => ({ ...prev, freeTrials: 10 }))}
                                style={{ padding: `${spacing.sm} ${spacing.xl}`, borderRadius: radius.md, background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', color: '#999999', fontSize: fontSize.md, cursor: 'pointer' }}>
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
              <div style={{ background: 'rgba(93, 173, 226, 0.06)', border: '1px solid rgba(93, 173, 226, 0.15)', borderRadius: radius.xl, padding: spacing['3xl'] }}>
                <h3 style={{ fontSize: '1.15rem', color: '#5dade2', marginBottom: spacing.xl, display: 'flex', alignItems: 'center', gap: spacing.lg }}>
                  <CreditCard size={20} color="#5dade2" />
                  Extra Usage / Credit Purchases
                </h3>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.lg }}>
                  <span style={{ color: '#cccccc', fontSize: fontSize.xl }}>
                    {revenueData.creditPurchaseCount} purchase{revenueData.creditPurchaseCount !== 1 ? 's' : ''} this period
                  </span>
                  <span style={{ color: '#ffffff', fontSize: fontSize['5xl'], fontWeight: fontWeight.bold, fontFamily: 'monospace' }}>
                    ${revenueData.totalCreditRevenue?.toFixed(2)}
                  </span>
                </div>
                {revenueData.creditPurchases?.length > 0 && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: spacing.md, marginTop: spacing.lg, paddingTop: spacing.lg, borderTop: '1px solid rgba(93, 173, 226, 0.1)' }}>
                    {revenueData.creditPurchases.map((p: any, i: number) => (
                      <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: `${spacing.md} ${spacing.lg}`, background: 'rgba(93, 173, 226, 0.06)', borderRadius: radius.md }}>
                        <span style={{ color: '#cccccc', fontSize: fontSize.lg }}>
                          <User size={14} style={{ marginRight: spacing.sm, verticalAlign: 'middle', opacity: 0.6 }} />
                          {p.username}
                        </span>
                        <div style={{ display: 'flex', alignItems: 'center', gap: spacing.lg }}>
                          <span style={{ color: '#ffffff', fontSize: fontSize.lg, fontWeight: fontWeight.semibold, fontFamily: 'monospace' }}>${p.total?.toFixed(2)}</span>
                          <span style={{ color: '#666666', fontSize: fontSize.md }}>{new Date(p.date).toLocaleDateString()}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Store Purchases */}
              <div style={{ background: 'rgba(93, 173, 226, 0.06)', border: '1px solid rgba(93, 173, 226, 0.15)', borderRadius: radius.xl, padding: spacing['3xl'] }}>
                <h3 style={{ fontSize: '1.15rem', color: '#5dade2', marginBottom: spacing.xl, display: 'flex', alignItems: 'center', gap: spacing.lg }}>
                  <DollarSign size={20} color="#5dade2" />
                  Store Purchases
                </h3>
                {(revenueData.storePurchaseCount ?? 0) === 0 ? (
                  <div style={{ textAlign: 'center', padding: spacing['3xl'], color: '#6b7280', fontSize: fontSize.xl }}>
                    No store purchases this period
                  </div>
                ) : (
                  <>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.lg }}>
                      <span style={{ color: '#cccccc', fontSize: fontSize.xl }}>
                        {revenueData.storePurchaseCount} purchase{revenueData.storePurchaseCount !== 1 ? 's' : ''} this period
                      </span>
                      <span style={{ color: '#ffffff', fontSize: fontSize['5xl'], fontWeight: fontWeight.bold, fontFamily: 'monospace' }}>
                        ${(revenueData.totalStoreRevenue ?? 0).toFixed(2)}
                      </span>
                    </div>
                    {revenueData.storePurchases?.length > 0 && (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: spacing.md, marginTop: spacing.lg, paddingTop: spacing.lg, borderTop: '1px solid rgba(93, 173, 226, 0.1)' }}>
                        {revenueData.storePurchases.map((p: any, i: number) => (
                          <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: `${spacing.md} ${spacing.lg}`, background: 'rgba(93, 173, 226, 0.06)', borderRadius: radius.md }}>
                            <span style={{ color: '#cccccc', fontSize: fontSize.lg }}>
                              <User size={14} style={{ marginRight: spacing.sm, verticalAlign: 'middle', opacity: 0.6 }} />
                              {p.username} — {p.item}
                            </span>
                            <div style={{ display: 'flex', alignItems: 'center', gap: spacing.lg }}>
                              <span style={{ color: '#ffffff', fontSize: fontSize.lg, fontWeight: fontWeight.semibold, fontFamily: 'monospace' }}>${p.total?.toFixed(2)}</span>
                              <span style={{ color: '#666666', fontSize: fontSize.md }}>{new Date(p.date).toLocaleDateString()}</span>
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
                borderRadius: radius.xl,
                padding: spacing['3xl'],
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: spacing.lg }}>
                  <TrendingUp size={24} color="#5dade2" />
                  <span style={{ color: '#5dade2', fontSize: '1.25rem', fontWeight: fontWeight.bold }}>Total Revenue</span>
                </div>
                <span style={{ color: '#ffffff', fontSize: '1.6rem', fontWeight: fontWeight.extrabold, fontFamily: 'monospace' }}>
                  ${revenueData.totalRevenue?.toFixed(2)}
                </span>
              </div>

              {/* ── User Lists ── */}
              <div style={{ background: 'rgba(93, 173, 226, 0.04)', border: '1px solid rgba(93, 173, 226, 0.12)', borderRadius: radius.xl, overflow: 'hidden' }}>
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
                            setUserListVisibleCount((prev: any) => ({ ...prev, [key]: 5 }))
                          }
                        }}
                        style={{
                          flex: 1,
                          padding: `14px ${spacing.lg}`,
                          textAlign: 'center',
                          cursor: 'pointer',
                          background: isOpen ? `${color}18` : 'transparent',
                          borderBottom: isOpen ? `2px solid ${color}` : '2px solid transparent',
                          transition: transition.normal,
                        }}
                        onMouseEnter={(e) => { if (!isOpen) e.currentTarget.style.background = 'rgba(93, 173, 226, 0.06)' }}
                        onMouseLeave={(e) => { if (!isOpen) e.currentTarget.style.background = 'transparent' }}
                      >
                        <span style={{ color: isOpen ? color : '#999999', fontSize: fontSize.base, fontWeight: isOpen ? fontWeight.semibold : fontWeight.normal, transition: 'color 0.2s ease' }}>
                          {label}
                        </span>
                        <span style={{ color: isOpen ? color : '#666666', fontSize: fontSize.sm, marginLeft: spacing.sm, fontFamily: 'monospace' }}>({count})</span>
                      </div>
                    )
                  })}
                </div>

                {userListTab && (() => {
                  const listMap: Record<string, any[]> = {
                    active: revenueData.activeUsersList ?? [],
                    freeTrial: revenueData.freeTrialUsersList ?? [],
                    inactive: revenueData.inactiveUsersList ?? [],
                  }
                  const users = listMap[userListTab as keyof typeof listMap]
                  const color = '#5dade2'
                  const visibleCount = userListVisibleCount[userListTab] ?? 5
                  const visibleUsers = users.slice(0, visibleCount)
                  const hasMore = visibleCount < users.length
                  const isExpanded = visibleCount > 5

                  return (
                    <div style={{ padding: `${spacing.xl} ${spacing['2xl']}` }}>
                      {users.length === 0 ? (
                        <div style={{ textAlign: 'center', padding: spacing['3xl'], color: '#6b7280', fontSize: fontSize.lg }}>
                          No users in this category
                        </div>
                      ) : (
                        <>
                          <div style={{ display: 'flex', flexDirection: 'column', gap: spacing.sm }}>
                            {visibleUsers.map((u: any, i: number) => (
                              <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 14px', background: 'rgba(93, 173, 226, 0.04)', borderRadius: radius.lg, transition: 'background 0.15s ease' }}
                                onMouseEnter={(e) => e.currentTarget.style.background = 'rgba(93, 173, 226, 0.08)'}
                                onMouseLeave={(e) => e.currentTarget.style.background = 'rgba(93, 173, 226, 0.04)'}
                              >
                                <div style={{ display: 'flex', alignItems: 'center', gap: spacing.lg }}>
                                  <User size={14} style={{ color, opacity: 0.7 }} />
                                  <span style={{ color: '#dddddd', fontSize: fontSize.lg }}>{u.username}</span>
                                  {u.email && <span style={{ color: '#555555', fontSize: fontSize.sm }}>{u.email}</span>}
                                  {u.status && <span style={{ color: u.status === 'canceled' ? '#f87171' : '#999999', fontSize: '0.72rem', background: 'rgba(255,255,255,0.04)', padding: `${spacing['2xs']} ${spacing.md}`, borderRadius: radius.sm }}>{u.status}</span>}
                                </div>
                                <span style={{ color: '#555555', fontSize: '0.78rem' }}>{u.date ? new Date(u.date).toLocaleDateString() : '—'}</span>
                              </div>
                            ))}
                          </div>
                          <div style={{ display: 'flex', justifyContent: 'center', gap: spacing.lg, marginTop: spacing.xl }}>
                            {hasMore && (
                              <div
                                onClick={() => setUserListVisibleCount((prev: any) => ({ ...prev, [userListTab]: prev[userListTab] + 10 }))}
                                style={{ padding: `${spacing.md} ${spacing['2xl']}`, borderRadius: radius.md, background: `${color}15`, border: `1px solid ${color}30`, color, fontSize: fontSize.base, cursor: 'pointer', transition: transition.normal }}
                                onMouseEnter={(e) => { e.currentTarget.style.background = `${color}25` }}
                                onMouseLeave={(e) => { e.currentTarget.style.background = `${color}15` }}
                              >
                                View More ({users.length - visibleCount} remaining)
                              </div>
                            )}
                            {isExpanded && (
                              <div
                                onClick={() => setUserListVisibleCount((prev: any) => ({ ...prev, [userListTab]: 5 }))}
                                style={{ padding: `${spacing.md} ${spacing['2xl']}`, borderRadius: radius.md, background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', color: '#999999', fontSize: fontSize.base, cursor: 'pointer', transition: transition.normal }}
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
                    borderRadius: radius['3xl'],
                    padding: spacing['4xl'],
                  }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: spacing.xs }}>
                        <span style={{ color: '#5dade2', fontSize: fontSize['6xl'], fontWeight: fontWeight.bold, display: 'flex', alignItems: 'center', gap: spacing.lg }}>
                          <TrendingUp size={28} color="#5dade2" style={!isProfit ? { transform: 'scaleY(-1)' } : {}} />
                          Net {isProfit ? 'Profit' : 'Loss'}
                        </span>
                        <span style={{ color: '#666666', fontSize: fontSize.lg }}>
                          Revenue ${revenueData.totalRevenue?.toFixed(2)} − Expenses ${totalExpensesWithTrials.toFixed(2)}
                        </span>
                      </div>
                      <span style={{ color: '#ffffff', fontSize: '2rem', fontWeight: fontWeight.extrabold, fontFamily: 'monospace' }}>
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
        <div style={{ display: 'flex', flexDirection: 'column', gap: spacing['3xl'] }}>

          {/* Period Selector */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: spacing.xl, flexWrap: 'wrap' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: spacing.lg, flexWrap: 'wrap' }}>
              <div style={{ position: 'relative' }}>
                <div
                  onClick={() => setPeriodDropdownOpen(!periodDropdownOpen)}
                  style={{
                    background: 'rgba(93, 173, 226, 0.1)',
                    border: '1px solid rgba(93, 173, 226, 0.3)',
                    borderRadius: radius.lg,
                    padding: `10px ${spacing.xl}`,
                    color: '#ffffff',
                    fontSize: fontSize['2xl'],
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: spacing.md,
                    minWidth: '130px',
                    justifyContent: 'space-between',
                    transition: transition.normal,
                  }}
                >
                  <span>{periodOptions.find(o => o.value === timePeriod)?.label}</span>
                  <ChevronDown size={16} style={{ transition: 'transform 0.2s ease', transform: periodDropdownOpen ? 'rotate(180deg)' : 'rotate(0deg)' }} />
                </div>
                {periodDropdownOpen && (
                  <>
                    <div onClick={() => setPeriodDropdownOpen(false)} style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, zIndex: 99 }} />
                    <div style={{ position: 'absolute', top: 'calc(100% + 6px)', left: 0, background: '#0a0a0a', border: '1px solid rgba(93, 173, 226, 0.2)', borderRadius: radius.xl, padding: spacing.sm, zIndex: zIndex.sticky, minWidth: '160px', boxShadow: '0 12px 40px rgba(0,0,0,0.5)' }}>
                      {periodOptions.map(opt => (
                        <div
                          key={opt.value}
                          onClick={() => { setTimePeriod(opt.value); setPeriodDropdownOpen(false); loadPeriodData(opt.value, referenceDate) }}
                          style={{ padding: '10px 14px', borderRadius: radius.md, cursor: 'pointer', color: timePeriod === opt.value ? '#ffffff' : '#cccccc', background: timePeriod === opt.value ? 'rgba(93, 173, 226, 0.25)' : 'transparent', fontSize: fontSize.xl, transition: transition.fast }}
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
                  style={{ background: 'rgba(93, 173, 226, 0.06)', border: '1px solid rgba(93, 173, 226, 0.2)', borderRadius: radius.lg, padding: `10px ${spacing.xl}`, color: '#ffffff', fontSize: fontSize['2xl'], outline: 'none', cursor: 'pointer', colorScheme: 'dark' }} />
              )}
              {timePeriod === 'week' && (
                <input type="date" value={referenceDate} onChange={(e) => { setReferenceDate(e.target.value); loadPeriodData('week', e.target.value) }}
                  style={{ background: 'rgba(93, 173, 226, 0.06)', border: '1px solid rgba(93, 173, 226, 0.2)', borderRadius: radius.lg, padding: `10px ${spacing.xl}`, color: '#ffffff', fontSize: fontSize['2xl'], outline: 'none', cursor: 'pointer', colorScheme: 'dark' }} />
              )}
              {timePeriod === 'month' && (
                <input type="month" value={expenseMonth} onChange={(e) => { const m = e.target.value; setExpenseMonth(m); setReferenceDate(`${m  }-01`); setExpensesLoaded(false); loadPeriodData('month', `${m  }-01`) }}
                  style={{ background: 'rgba(93, 173, 226, 0.06)', border: '1px solid rgba(93, 173, 226, 0.2)', borderRadius: radius.lg, padding: `10px ${spacing.xl}`, color: '#ffffff', fontSize: fontSize['2xl'], outline: 'none', cursor: 'pointer', colorScheme: 'dark' }} />
              )}
              {timePeriod === 'quarter' && (() => {
                const ref = new Date(`${referenceDate  }T00:00:00`)
                const currentQ = Math.ceil((ref.getMonth() + 1) / 3)
                const currentY = ref.getFullYear()
                return (
                  <div style={{ display: 'flex', gap: spacing.md }}>
                    <select value={currentQ} onChange={(e) => { const q = parseInt(e.target.value); const nd = `${currentY}-${String((q - 1) * 3 + 1).padStart(2, '0')}-01`; setReferenceDate(nd); loadPeriodData('quarter', nd) }}
                      style={{ background: 'rgba(93, 173, 226, 0.06)', border: '1px solid rgba(93, 173, 226, 0.2)', borderRadius: radius.lg, padding: `10px ${spacing.xl}`, color: '#ffffff', fontSize: fontSize['2xl'], outline: 'none', cursor: 'pointer', colorScheme: 'dark' }}>
                      <option value={1} style={{ background: '#0a0a0a' }}>Q1 (Jan–Mar)</option>
                      <option value={2} style={{ background: '#0a0a0a' }}>Q2 (Apr–Jun)</option>
                      <option value={3} style={{ background: '#0a0a0a' }}>Q3 (Jul–Sep)</option>
                      <option value={4} style={{ background: '#0a0a0a' }}>Q4 (Oct–Dec)</option>
                    </select>
                    <input type="number" value={currentY} min={2024} max={2035} onChange={(e) => { const nd = `${e.target.value}-${String((currentQ - 1) * 3 + 1).padStart(2, '0')}-01`; setReferenceDate(nd); loadPeriodData('quarter', nd) }}
                      style={{ background: 'rgba(93, 173, 226, 0.06)', border: '1px solid rgba(93, 173, 226, 0.2)', borderRadius: radius.lg, padding: `10px ${spacing.xl}`, color: '#ffffff', fontSize: fontSize['2xl'], width: '100px', outline: 'none', colorScheme: 'dark' }} />
                  </div>
                )
              })()}
              {timePeriod === 'year' && (
                <input type="number" value={new Date(`${referenceDate  }T00:00:00`).getFullYear()} min={2024} max={2035} onChange={(e) => { const nd = `${e.target.value}-01-01`; setReferenceDate(nd); loadPeriodData('year', nd) }}
                  style={{ background: 'rgba(93, 173, 226, 0.06)', border: '1px solid rgba(93, 173, 226, 0.2)', borderRadius: radius.lg, padding: `10px ${spacing.xl}`, color: '#ffffff', fontSize: fontSize['2xl'], width: '110px', outline: 'none', colorScheme: 'dark' }} />
              )}

              {timePeriod !== 'all' && (
                <div style={{ display: 'flex', alignItems: 'center', gap: spacing.sm }}>
                  <div
                    onClick={() => shiftPeriod('prev')}
                    style={{ width: '32px', height: '32px', borderRadius: radius.md, background: 'rgba(93, 173, 226, 0.08)', border: '1px solid rgba(93, 173, 226, 0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', transition: transition.fast }}
                    onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(93, 173, 226, 0.2)' }}
                    onMouseLeave={(e) => { e.currentTarget.style.background = 'rgba(93, 173, 226, 0.08)' }}
                  >
                    <ChevronLeft size={16} color="#5dade2" />
                  </div>
                  <span style={{ color: '#6b7280', fontSize: fontSize.lg, fontStyle: 'italic', minWidth: '120px', textAlign: 'center' }}>{getPeriodLabel()}</span>
                  <div
                    onClick={() => shiftPeriod('next')}
                    style={{ width: '32px', height: '32px', borderRadius: radius.md, background: 'rgba(93, 173, 226, 0.08)', border: '1px solid rgba(93, 173, 226, 0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', transition: transition.fast }}
                    onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(93, 173, 226, 0.2)' }}
                    onMouseLeave={(e) => { e.currentTarget.style.background = 'rgba(93, 173, 226, 0.08)' }}
                  >
                    <ChevronRight size={16} color="#5dade2" />
                  </div>
                </div>
              )}
              {timePeriod === 'all' && (
                <span style={{ color: '#6b7280', fontSize: fontSize.lg, fontStyle: 'italic' }}>{getPeriodLabel()}</span>
              )}
            </div>

            {timePeriod === 'month' && (
              <span style={{ color: expensesSaving ? '#5dade2' : '#48c9b0', fontSize: fontSize.base, opacity: 0.8, transition: transition.slow }}>
                {expensesSaving ? '⏳ Saving...' : expensesLoaded ? '✅ Auto-saved' : ''}
              </span>
            )}
          </div>

          {/* MONTH VIEW: Editable expense inputs */}
          {timePeriod === 'month' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: spacing['2xl'] }}>
              <div style={{ background: 'rgba(93, 173, 226, 0.06)', border: '1px solid rgba(93, 173, 226, 0.15)', borderRadius: radius.xl, padding: spacing['3xl'] }}>
                <h3 style={{ fontSize: '1.15rem', color: '#5dade2', marginBottom: spacing['2xl'], display: 'flex', alignItems: 'center', gap: spacing.lg }}>
                  <BarChart3 size={20} color="#5dade2" />
                  API Costs Per Provider
                </h3>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: spacing.xl }}>
                  {[
                    { key: 'openaiCost', label: 'OpenAI (ChatGPT)' },
                    { key: 'anthropicCost', label: 'Anthropic (Claude)' },
                    { key: 'googleCost', label: 'Google (Gemini)' },
                    { key: 'xaiCost', label: 'xAI (Grok)' },
                  ].map(({ key, label }) => (
                    <div key={key} style={{ background: 'rgba(255, 255, 255, 0.03)', border: '1px solid rgba(93, 173, 226, 0.15)', borderRadius: radius.xl, padding: spacing.xl, display: 'flex', flexDirection: 'column', gap: spacing.md }}>
                      <label style={{ color: '#ffffff', fontSize: fontSize.xl, fontWeight: fontWeight.medium }}>{label}</label>
                      <div style={{ display: 'flex', alignItems: 'center', gap: spacing.md }}>
                        <span style={{ color: '#aaaaaa', fontSize: fontSize['2xl'] }}>$</span>
                        <input type="text" value={expenses[key]} onChange={(e) => handleExpenseChange(key, e.target.value)} placeholder="0.00"
                          style={{ background: 'rgba(255, 255, 255, 0.06)', border: '1px solid rgba(93, 173, 226, 0.25)', borderRadius: radius.md, padding: '10px 14px', color: '#ffffff', fontSize: fontSize['2xl'], width: '100%', outline: 'none', transition: 'border-color 0.2s ease' }}
                          onFocus={(e) => e.target.style.borderColor = 'rgba(93, 173, 226, 0.6)'} onBlur={(e) => e.target.style.borderColor = 'rgba(93, 173, 226, 0.25)'} />
                      </div>
                    </div>
                  ))}
                </div>
                <div style={{ marginTop: spacing['2xl'], paddingTop: spacing['2xl'], borderTop: '1px solid rgba(93, 173, 226, 0.15)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ color: '#5dade2', fontSize: '1.15rem', fontWeight: fontWeight.semibold }}>Total API Cost</span>
                  <span style={{ color: '#ffffff', fontSize: fontSize['5xl'], fontWeight: fontWeight.bold, fontFamily: 'monospace' }}>${totalApiCost.toFixed(2)}</span>
                </div>
              </div>

              <div style={{ background: 'rgba(93, 173, 226, 0.06)', border: '1px solid rgba(93, 173, 226, 0.15)', borderRadius: radius.xl, padding: spacing['3xl'] }}>
                <h3 style={{ fontSize: '1.15rem', color: '#5dade2', marginBottom: spacing.xl, display: 'flex', alignItems: 'center', gap: spacing.lg }}>
                  <CreditCard size={20} color="#5dade2" />
                  Stripe Fees
                </h3>
                <div style={{ display: 'flex', alignItems: 'center', gap: spacing.lg }}>
                  <span style={{ color: '#cccccc', fontSize: fontSize['3xl'] }}>$</span>
                  <input type="text" value={expenses.stripeFees} onChange={(e) => handleExpenseChange('stripeFees', e.target.value)} placeholder="0.00"
                    style={{ background: 'rgba(255, 255, 255, 0.06)', border: '1px solid rgba(93, 173, 226, 0.3)', borderRadius: radius.lg, padding: `${spacing.lg} ${spacing.xl}`, color: '#ffffff', fontSize: fontSize['3xl'], width: '200px', outline: 'none', transition: 'border-color 0.2s ease' }}
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
                <div key={key} style={{ background: 'rgba(255, 255, 255, 0.03)', border: '1px solid rgba(93, 173, 226, 0.15)', borderRadius: radius.xl, padding: spacing['3xl'] }}>
                  <h3 style={{ fontSize: '1.15rem', color: '#ffffff', marginBottom: spacing.xl, display: 'flex', alignItems: 'center', gap: spacing.lg }}>
                    <Package size={20} color="#ffffff" />
                    {label}
                  </h3>
                  <div style={{ display: 'flex', alignItems: 'center', gap: spacing.lg }}>
                    <span style={{ color: '#cccccc', fontSize: fontSize['3xl'] }}>$</span>
                    <input type="text" value={expenses[key]} onChange={(e) => handleExpenseChange(key, e.target.value)} placeholder="0.00"
                      style={{ background: 'rgba(255, 255, 255, 0.06)', border: '1px solid rgba(93, 173, 226, 0.25)', borderRadius: radius.lg, padding: `${spacing.lg} ${spacing.xl}`, color: '#ffffff', fontSize: fontSize['3xl'], width: '200px', outline: 'none', transition: 'border-color 0.2s ease' }}
                      onFocus={(e) => e.target.style.borderColor = 'rgba(93, 173, 226, 0.6)'} onBlur={(e) => e.target.style.borderColor = 'rgba(93, 173, 226, 0.25)'} />
                  </div>
                </div>
              ))}

              {/* Free Plan Costs */}
              {revenueData && (revenueData.activeFreeTrials ?? 0) > 0 && (
                <div style={{ background: 'rgba(251, 191, 36, 0.08)', border: '1px solid rgba(251, 191, 36, 0.20)', borderRadius: radius.xl, padding: spacing['3xl'] }}>
                  <h3 style={{ fontSize: '1.15rem', color: '#fbbf24', marginBottom: spacing.xl, display: 'flex', alignItems: 'center', gap: spacing.lg }}>
                    <User size={20} color="#fbbf24" />
                    Free Plan Costs
                    <span style={{ fontSize: fontSize.sm, color: '#a08520', fontWeight: fontWeight.medium }}>(per month)</span>
                  </h3>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 14px', background: 'rgba(251, 191, 36, 0.04)', borderRadius: radius.lg }}>
                    <span style={{ color: '#cccccc', fontSize: fontSize.xl }}>
                      Trial Users: {revenueData.newFreeTrials} at $1
                    </span>
                    <span style={{ color: '#ffffff', fontSize: fontSize['4xl'], fontWeight: fontWeight.bold, fontFamily: 'monospace' }}>
                      ${(revenueData.totalFreeTrialCost ?? 0).toFixed(2)}
                    </span>
                  </div>
                </div>
              )}

              {revenueData?.badgeTierUsers?.length > 0 && (
                <div style={{ background: 'rgba(205, 127, 50, 0.08)', border: '1px solid rgba(205, 127, 50, 0.20)', borderRadius: radius.xl, padding: spacing['3xl'] }}>
                  <h3 style={{ fontSize: '1.15rem', color: '#CD7F32', marginBottom: spacing.xl, display: 'flex', alignItems: 'center', gap: spacing.lg }}>
                    <Award size={20} color="#CD7F32" />
                    Badge Tier Rewards
                  </h3>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: spacing.md, marginBottom: spacing.lg }}>
                    {[
                      { name: 'Bronze', color: '#CD7F32', count: revenueData.badgeTierSummary?.Bronze ?? 0, reward: '$0.25' },
                      { name: 'Silver', color: '#C0C0C0', count: revenueData.badgeTierSummary?.Silver ?? 0, reward: '$0.50' },
                      { name: 'Gold', color: '#FFD700', count: revenueData.badgeTierSummary?.Gold ?? 0, reward: '$0.75' },
                      { name: 'Platinum', color: '#E5E4E2', count: revenueData.badgeTierSummary?.Platinum ?? 0, reward: '$1.00' },
                    ].map(({ name, color, count, reward }) => (
                      <div key={name} style={{ padding: spacing.md, background: `${color}08`, border: `1px solid ${color}25`, borderRadius: radius.md, textAlign: 'center' }}>
                        <p style={{ color, fontSize: fontSize.sm, fontWeight: fontWeight.bold, margin: 0 }}>{name}</p>
                        <p style={{ color: '#ffffff', fontSize: fontSize['3xl'], fontWeight: fontWeight.bold, margin: '2px 0' }}>{count}</p>
                        <p style={{ color: '#888888', fontSize: fontSize['2xs'], margin: 0 }}>{reward}/mo</p>
                      </div>
                    ))}
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 14px', background: 'rgba(205, 127, 50, 0.04)', borderRadius: radius.lg }}>
                    <span style={{ color: '#cccccc', fontSize: fontSize.xl }}>
                      {revenueData.badgeTierUsers.length} user{revenueData.badgeTierUsers.length !== 1 ? 's' : ''} with rewards
                    </span>
                    <span style={{ color: '#ffffff', fontSize: fontSize['4xl'], fontWeight: fontWeight.bold, fontFamily: 'monospace' }}>
                      ${(revenueData.totalBadgeTierCost ?? 0).toFixed(2)}/mo
                    </span>
                  </div>
                </div>
              )}

              <div style={{ background: 'rgba(168, 85, 247, 0.06)', border: '1px solid rgba(168, 85, 247, 0.20)', borderRadius: radius.xl, padding: spacing['3xl'], position: 'relative', opacity: 0.7 }}>
                <div style={{ position: 'absolute', top: spacing.lg, right: spacing.xl, background: 'rgba(168, 85, 247, 0.15)', border: '1px solid rgba(168, 85, 247, 0.3)', borderRadius: radius.sm, padding: '3px 10px' }}>
                  <span style={{ color: '#a855f7', fontSize: fontSize.xs, fontWeight: fontWeight.semibold, textTransform: 'uppercase', letterSpacing: '0.5px' }}>Not Yet Enabled</span>
                </div>
                <h3 style={{ fontSize: '1.15rem', color: '#a855f7', marginBottom: spacing.xl, display: 'flex', alignItems: 'center', gap: spacing.lg }}>
                  <Trophy size={20} color="#a855f7" />
                  Daily Favorites Rewards
                  <span style={{ fontSize: fontSize.sm, color: '#7c3aed', fontWeight: fontWeight.medium }}>(hypothetical)</span>
                </h3>
                <div style={{ display: 'flex', flexDirection: 'column', gap: spacing.md }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 14px', background: 'rgba(168, 85, 247, 0.04)', borderRadius: radius.lg }}>
                    <span style={{ color: '#cccccc', fontSize: fontSize.xl }}>
                      Top 5 users × $5.00/day free usage
                    </span>
                    <span style={{ color: '#cccccc', fontSize: fontSize['2xl'], fontWeight: fontWeight.semibold, fontFamily: 'monospace' }}>
                      $25.00/day
                    </span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 14px', background: 'rgba(168, 85, 247, 0.06)', borderRadius: radius.lg }}>
                    <span style={{ color: '#cccccc', fontSize: fontSize.xl }}>
                      Projected for this {timePeriod === 'month' ? 'month (~30 days)' : 'period'}
                    </span>
                    <span style={{ color: '#a855f7', fontSize: fontSize['4xl'], fontWeight: fontWeight.bold, fontFamily: 'monospace' }}>
                      ${dailyFavoritesHypothetical.toFixed(2)}
                    </span>
                  </div>
                </div>
              </div>

              <div style={{
                background: 'linear-gradient(135deg, rgba(93, 173, 226, 0.12), rgba(72, 201, 176, 0.08))',
                border: '1px solid rgba(93, 173, 226, 0.3)',
                borderRadius: radius.xl,
                padding: spacing['3xl'],
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: spacing.lg }}>
                  <Receipt size={24} color="#5dade2" />
                  <span style={{ color: '#5dade2', fontSize: '1.25rem', fontWeight: fontWeight.bold }}>Total Expenses</span>
                </div>
                <span style={{ color: '#ffffff', fontSize: '1.6rem', fontWeight: fontWeight.extrabold, fontFamily: 'monospace' }}>${(grandTotal + (revenueData?.totalFreeTrialCost ?? 0) + (revenueData?.totalBadgeTierCost ?? 0)).toFixed(2)}</span>
              </div>
            </div>
          )}

          {/* NON-MONTH VIEW: Read-only aggregated expenses */}
          {timePeriod !== 'month' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: spacing['2xl'] }}>
              {loadingAggExpenses ? (
                <div style={{ textAlign: 'center', padding: spacing['5xl'], color: '#aaaaaa' }}>Loading expense data...</div>
              ) : !aggregatedExpenses ? (
                <div style={{ textAlign: 'center', padding: spacing['5xl'], color: '#aaaaaa' }}>No expense data available for this period</div>
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
                    <div style={{ background: 'rgba(93, 173, 226, 0.06)', border: '1px solid rgba(93, 173, 226, 0.15)', borderRadius: radius.xl, padding: spacing['3xl'] }}>
                      <h3 style={{ fontSize: '1.15rem', color: '#5dade2', marginBottom: spacing['2xl'], display: 'flex', alignItems: 'center', gap: spacing.lg }}>
                        <BarChart3 size={20} color="#5dade2" />
                        API Costs Per Provider
                      </h3>
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: spacing.lg }}>
                        {apiProviders.map(({ key, label }) => (
                          <div key={key} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: `${spacing.lg} ${spacing.xl}`, background: 'rgba(255, 255, 255, 0.03)', border: '1px solid rgba(93, 173, 226, 0.15)', borderRadius: radius.lg }}>
                            <span style={{ color: '#ffffff', fontSize: fontSize.xl, fontWeight: fontWeight.medium }}>{label}</span>
                            <span style={{ color: '#ffffff', fontSize: '1.05rem', fontWeight: fontWeight.semibold, fontFamily: 'monospace' }}>${(agg[key] || 0).toFixed(2)}</span>
                          </div>
                        ))}
                      </div>
                      <div style={{ marginTop: spacing['2xl'], paddingTop: spacing['2xl'], borderTop: '1px solid rgba(93, 173, 226, 0.15)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span style={{ color: '#5dade2', fontSize: '1.15rem', fontWeight: fontWeight.semibold }}>Total API Cost</span>
                        <span style={{ color: '#ffffff', fontSize: fontSize['5xl'], fontWeight: fontWeight.bold, fontFamily: 'monospace' }}>${aggApiTotal.toFixed(2)}</span>
                      </div>
                    </div>

                    {(agg.stripeFees || 0) > 0 && (
                      <div style={{ background: 'rgba(93, 173, 226, 0.06)', border: '1px solid rgba(93, 173, 226, 0.15)', borderRadius: radius.xl, padding: spacing['3xl'] }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <h3 style={{ fontSize: '1.15rem', color: '#5dade2', margin: 0, display: 'flex', alignItems: 'center', gap: spacing.lg }}>
                            <CreditCard size={20} color="#5dade2" />
                            Stripe Fees
                          </h3>
                          <span style={{ color: '#ffffff', fontSize: fontSize['4xl'], fontWeight: fontWeight.bold, fontFamily: 'monospace' }}>${(agg.stripeFees || 0).toFixed(2)}</span>
                        </div>
                      </div>
                    )}

                    {otherServices.map(({ key, label }) => (
                      <div key={key} style={{ background: 'rgba(255, 255, 255, 0.03)', border: '1px solid rgba(93, 173, 226, 0.15)', borderRadius: radius.xl, padding: spacing['3xl'] }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <h3 style={{ fontSize: '1.15rem', color: '#ffffff', margin: 0, display: 'flex', alignItems: 'center', gap: spacing.lg }}>
                            <Package size={20} color="#ffffff" />
                            {label}
                          </h3>
                          <span style={{ color: '#ffffff', fontSize: fontSize['4xl'], fontWeight: fontWeight.bold, fontFamily: 'monospace' }}>${(agg[key] || 0).toFixed(2)}</span>
                        </div>
                      </div>
                    ))}

                    {/* Free Plan Costs */}
                    {revenueData && (revenueData.activeFreeTrials ?? 0) > 0 && (
                      <div style={{ background: 'rgba(251, 191, 36, 0.08)', border: '1px solid rgba(251, 191, 36, 0.20)', borderRadius: radius.xl, padding: spacing['3xl'] }}>
                        <h3 style={{ fontSize: '1.15rem', color: '#fbbf24', marginBottom: spacing.xl, display: 'flex', alignItems: 'center', gap: spacing.lg }}>
                          <User size={20} color="#fbbf24" />
                          Free Plan Costs
                          <span style={{ fontSize: fontSize.sm, color: '#a08520', fontWeight: fontWeight.medium }}>(per month)</span>
                        </h3>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 14px', background: 'rgba(251, 191, 36, 0.04)', borderRadius: radius.lg }}>
                          <span style={{ color: '#cccccc', fontSize: fontSize.xl }}>
                            Trial Users: {revenueData.newFreeTrials} at $1
                          </span>
                          <span style={{ color: '#ffffff', fontSize: fontSize['4xl'], fontWeight: fontWeight.bold, fontFamily: 'monospace' }}>
                            ${(revenueData.totalFreeTrialCost ?? 0).toFixed(2)}
                          </span>
                        </div>
                      </div>
                    )}

                    {/* Badge Tier Rewards Cost (aggregated) */}
                    {revenueData?.badgeTierUsers?.length > 0 && (
                      <div style={{ background: 'rgba(205, 127, 50, 0.08)', border: '1px solid rgba(205, 127, 50, 0.20)', borderRadius: radius.xl, padding: spacing['3xl'] }}>
                        <h3 style={{ fontSize: '1.15rem', color: '#CD7F32', marginBottom: spacing.xl, display: 'flex', alignItems: 'center', gap: spacing.lg }}>
                          <Award size={20} color="#CD7F32" />
                          Badge Tier Rewards
                        </h3>
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: spacing.md, marginBottom: spacing.lg }}>
                          {[
                            { name: 'Bronze', color: '#CD7F32', count: revenueData.badgeTierSummary?.Bronze ?? 0, reward: '$0.25' },
                            { name: 'Silver', color: '#C0C0C0', count: revenueData.badgeTierSummary?.Silver ?? 0, reward: '$0.50' },
                            { name: 'Gold', color: '#FFD700', count: revenueData.badgeTierSummary?.Gold ?? 0, reward: '$0.75' },
                            { name: 'Platinum', color: '#E5E4E2', count: revenueData.badgeTierSummary?.Platinum ?? 0, reward: '$1.00' },
                          ].map(({ name, color, count, reward }) => (
                            <div key={name} style={{ padding: spacing.md, background: `${color}08`, border: `1px solid ${color}25`, borderRadius: radius.md, textAlign: 'center' }}>
                              <p style={{ color, fontSize: fontSize.sm, fontWeight: fontWeight.bold, margin: 0 }}>{name}</p>
                              <p style={{ color: '#ffffff', fontSize: fontSize['3xl'], fontWeight: fontWeight.bold, margin: '2px 0' }}>{count}</p>
                              <p style={{ color: '#888888', fontSize: fontSize['2xs'], margin: 0 }}>{reward}/mo</p>
                            </div>
                          ))}
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 14px', background: 'rgba(205, 127, 50, 0.04)', borderRadius: radius.lg }}>
                          <span style={{ color: '#cccccc', fontSize: fontSize.xl }}>
                            {revenueData.badgeTierUsers.length} user{revenueData.badgeTierUsers.length !== 1 ? 's' : ''} with rewards
                          </span>
                          <span style={{ color: '#ffffff', fontSize: fontSize['4xl'], fontWeight: fontWeight.bold, fontFamily: 'monospace' }}>
                            ${(revenueData.totalBadgeTierCost ?? 0).toFixed(2)}/mo
                          </span>
                        </div>
                      </div>
                    )}

                    <div style={{ background: 'rgba(168, 85, 247, 0.06)', border: '1px solid rgba(168, 85, 247, 0.20)', borderRadius: radius.xl, padding: spacing['3xl'], position: 'relative', opacity: 0.7 }}>
                      <div style={{ position: 'absolute', top: spacing.lg, right: spacing.xl, background: 'rgba(168, 85, 247, 0.15)', border: '1px solid rgba(168, 85, 247, 0.3)', borderRadius: radius.sm, padding: '3px 10px' }}>
                        <span style={{ color: '#a855f7', fontSize: fontSize.xs, fontWeight: fontWeight.semibold, textTransform: 'uppercase', letterSpacing: '0.5px' }}>Not Yet Enabled</span>
                      </div>
                      <h3 style={{ fontSize: '1.15rem', color: '#a855f7', marginBottom: spacing.xl, display: 'flex', alignItems: 'center', gap: spacing.lg }}>
                        <Trophy size={20} color="#a855f7" />
                        Daily Favorites Rewards
                        <span style={{ fontSize: fontSize.sm, color: '#7c3aed', fontWeight: fontWeight.medium }}>(hypothetical)</span>
                      </h3>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: spacing.md }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 14px', background: 'rgba(168, 85, 247, 0.04)', borderRadius: radius.lg }}>
                          <span style={{ color: '#cccccc', fontSize: fontSize.xl }}>
                            Top 5 users × $5.00/day free usage
                          </span>
                          <span style={{ color: '#cccccc', fontSize: fontSize['2xl'], fontWeight: fontWeight.semibold, fontFamily: 'monospace' }}>
                            $25.00/day
                          </span>
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 14px', background: 'rgba(168, 85, 247, 0.06)', borderRadius: radius.lg }}>
                          <span style={{ color: '#cccccc', fontSize: fontSize.xl }}>
                            Projected for this {timePeriod === 'day' ? 'day' : timePeriod === 'week' ? 'week (~7 days)' : timePeriod === 'quarter' ? 'quarter (~90 days)' : timePeriod === 'year' ? 'year (~365 days)' : 'period'}
                          </span>
                          <span style={{ color: '#a855f7', fontSize: fontSize['4xl'], fontWeight: fontWeight.bold, fontFamily: 'monospace' }}>
                            ${dailyFavoritesHypothetical.toFixed(2)}
                          </span>
                        </div>
                      </div>
                    </div>

                    <div style={{
                      background: 'linear-gradient(135deg, rgba(93, 173, 226, 0.12), rgba(72, 201, 176, 0.08))',
                      border: '1px solid rgba(93, 173, 226, 0.3)',
                      borderRadius: radius.xl,
                      padding: spacing['3xl'],
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                    }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: spacing.lg }}>
                        <Receipt size={24} color="#5dade2" />
                        <span style={{ color: '#5dade2', fontSize: '1.25rem', fontWeight: fontWeight.bold }}>Total Expenses</span>
                      </div>
                      <span style={{ color: '#ffffff', fontSize: '1.6rem', fontWeight: fontWeight.extrabold, fontFamily: 'monospace' }}>${(aggGrand + (revenueData?.totalFreeTrialCost ?? 0) + (revenueData?.totalBadgeTierCost ?? 0)).toFixed(2)}</span>
                    </div>

                    {aggregatedExpenses?.months?.length > 0 && (
                      <div style={{ textAlign: 'center', color: '#6b7280', fontSize: fontSize.base }}>
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
  )
}

export default AdminRevenueExpenses
