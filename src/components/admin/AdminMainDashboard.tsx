import React from 'react'
import { motion } from 'framer-motion'
import { Users, Package, DollarSign, Receipt } from 'lucide-react'
import { spacing, fontSize, fontWeight, radius, transition, layout, sx } from '../../utils/styles'

interface AdminMainDashboardProps {
  setActiveSection: (section: string) => void
  setExpensesSubSection: (section: string) => void
  fetchAdminData: (force?: boolean) => void
  loadPeriodData: () => void
  usersData: any
  costsData: any
  pricingData: any
}

const AdminMainDashboard = ({ setActiveSection, setExpensesSubSection, fetchAdminData, loadPeriodData, usersData, costsData, pricingData }: AdminMainDashboardProps) => {
  return (
    <div
      style={{
      ...layout.flexCol,
      alignItems: 'center',
      justifyContent: 'center',
      minHeight: '80vh',
      gap: spacing['6xl'],
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
            fontWeight: fontWeight.bold,
            margin: 0,
            background: 'linear-gradient(135deg, #5dade2, #48c9b0)',
            WebkitBackgroundClip: 'text',
            WebkitTextFillColor: 'transparent',
            letterSpacing: '4px',
          }}
        >
          ArkiTek
        </h1>
        <p style={{ color: '#aaaaaa', fontSize: fontSize['4xl'], marginTop: spacing.lg }}>
          Admin Dashboard
        </p>
      </motion.div>

      {/* Navigation Cards */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(2, 1fr)',
          gap: spacing['4xl'],  
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
          style={sx(layout.flexCol, {
            alignItems: 'center',
            background: 'rgba(93, 173, 226, 0.1)',
            border: '2px solid rgba(93, 173, 226, 0.3)',
            borderRadius: radius['3xl'],
            padding: spacing['5xl'],
            cursor: 'pointer',
            transition: transition.slow,
            gap: spacing['2xl'],
          })}
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
              fontWeight: fontWeight.semibold,
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
          style={sx(layout.flexCol, {
            alignItems: 'center',
            background: 'rgba(93, 173, 226, 0.1)',
            border: '2px solid rgba(93, 173, 226, 0.3)',
            borderRadius: radius['3xl'],
            padding: spacing['5xl'],
            cursor: 'pointer',
            transition: transition.slow,
            gap: spacing['2xl'],
          })}
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
              fontWeight: fontWeight.semibold,
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
          style={sx(layout.flexCol, {
            alignItems: 'center',
            background: 'rgba(72, 201, 176, 0.1)',
            border: '2px solid rgba(72, 201, 176, 0.3)',
            borderRadius: radius['3xl'],
            padding: spacing['5xl'],
            cursor: 'pointer',
            transition: transition.slow,
            gap: spacing['2xl'],
          })}
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
              fontWeight: fontWeight.semibold,
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
          style={sx(layout.flexCol, {
            alignItems: 'center',
            background: 'rgba(72, 201, 176, 0.1)',
            border: '2px solid rgba(72, 201, 176, 0.3)',
            borderRadius: radius['3xl'],
            padding: spacing['5xl'],
            cursor: 'pointer',
            transition: transition.slow,
            gap: spacing['2xl'],
          })}
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
              fontWeight: fontWeight.semibold,
            }}
          >
            Revenue / Expenses
          </h2>
        </motion.div>
      </div>
    </div>
  )
}

export default AdminMainDashboard
