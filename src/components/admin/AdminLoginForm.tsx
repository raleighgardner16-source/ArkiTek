import React from 'react'
import { motion } from 'framer-motion'
import { Shield, User, Lock } from 'lucide-react'
import { useStore } from '../../store/useStore'
import { getTheme } from '../../utils/theme'
import { spacing, fontSize, fontWeight, radius, zIndex, transition, layout, sx } from '../../utils/styles'

interface AdminLoginFormProps {
  loginData: { username: string; password: string }
  setLoginData: (data: any) => void
  loginError: string
  loginLoading: boolean
  handleLogin: (e: React.FormEvent<HTMLFormElement>) => void
}

const AdminLoginForm = ({ loginData, setLoginData, loginError, loginLoading, handleLogin }: AdminLoginFormProps) => {
  const theme = useStore((state) => state.theme || 'dark')
  const currentTheme = getTheme(theme)

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      style={sx(layout.fixedFill, layout.center, {
        zIndex: zIndex.modal,
        background: 'rgba(0, 0, 0, 0.95)',
      })}
    >
      <motion.div
        initial={{ scale: 0.9, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        style={{
          background: 'rgba(93, 173, 226, 0.1)',
          border: '1px solid rgba(93, 173, 226, 0.3)',
          borderRadius: radius['2xl'],
          padding: spacing['5xl'],
          width: '100%',
          maxWidth: '400px',
        }}
      >
        <div style={{ textAlign: 'center', marginBottom: spacing['4xl'] }}>
          <Shield size={48} color="#5dade2" style={{ marginBottom: spacing.xl }} />
          <h2 style={{ color: '#ffffff', fontSize: '1.8rem', marginBottom: spacing.md }}>
            Admin Login
          </h2>
          <p style={{ color: '#aaaaaa', fontSize: fontSize.xl }}>
            Enter your credentials to access the admin panel
          </p>
        </div>

        <form onSubmit={handleLogin}>
          <div style={{ marginBottom: spacing['2xl'] }}>
            <label
              style={sx(layout.flexRow, {
                gap: spacing.md,
                color: '#ffffff',
                fontSize: fontSize.lg,
                marginBottom: spacing.md,
              })}
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
                padding: `${spacing.lg} ${spacing.xl}`,
                background: 'rgba(0, 0, 0, 0.5)',
                border: '1px solid rgba(93, 173, 226, 0.3)',
                borderRadius: radius.md,
                color: '#ffffff',
                fontSize: fontSize['2xl'],
                boxSizing: 'border-box',
              }}
              placeholder="Enter username"
            />
          </div>

          <div style={{ marginBottom: spacing['3xl'] }}>
            <label
              style={sx(layout.flexRow, {
                gap: spacing.md,
                color: '#ffffff',
                fontSize: fontSize.lg,
                marginBottom: spacing.md,
              })}
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
                padding: `${spacing.lg} ${spacing.xl}`,
                background: 'rgba(0, 0, 0, 0.5)',
                border: '1px solid rgba(93, 173, 226, 0.3)',
                borderRadius: radius.md,
                color: '#ffffff',
                fontSize: fontSize['2xl'],
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
                borderRadius: radius.md,
                padding: spacing.lg,
                marginBottom: spacing['2xl'],
                color: currentTheme.error,
                fontSize: fontSize.lg,
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
              padding: spacing.lg,
              background: loginLoading
                ? 'rgba(93, 173, 226, 0.3)'
                : 'linear-gradient(90deg, #5dade2, #48c9b0)',
              color: '#000000',
              border: 'none',
              borderRadius: radius.md,
              fontSize: fontSize['2xl'],
              fontWeight: fontWeight.semibold,
              cursor: loginLoading ? 'not-allowed' : 'pointer',
              transition: transition.normal,
            }}
          >
            {loginLoading ? 'Logging in...' : 'Login'}
          </button>

          <button
            type="button"
            onClick={() => (window.location.href = '/')}
            style={{
              width: '100%',
              marginTop: spacing.lg,
              padding: spacing.lg,
              background: 'transparent',
              border: '1px solid rgba(93, 173, 226, 0.3)',
              borderRadius: radius.md,
              color: '#aaaaaa',
              fontSize: fontSize.lg,
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

export default AdminLoginForm
