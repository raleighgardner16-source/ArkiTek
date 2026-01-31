import React, { useState, useEffect } from 'react'
import { motion } from 'framer-motion'
import { AlertTriangle } from 'lucide-react'
import { useStore } from '../store/useStore'
import axios from 'axios'

// Custom ArkTek "A" Icon Component
const ArkTekAIcon = ({ size = 32, color = '#ffffff', fillColor = null }) => {
  const iconSize = size
  const fill = fillColor || color
  
  return (
    <svg
      width={iconSize}
      height={iconSize}
      viewBox="0 0 32 32"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      style={{ filter: `drop-shadow(0 0 4px ${color})` }}
    >
      {/* Main A shape - faceted/architectural style */}
      <path
        d="M16 4 L24 28 L20 28 L18 22 L14 22 L12 28 L8 28 L16 4 Z"
        fill={fill}
        opacity="0.9"
      />
      {/* Crossbar of A */}
      <path
        d="M13 16 L19 16 L18 12 L14 12 Z"
        fill={fill}
        opacity="0.7"
      />
      {/* Geometric construction lines - top left */}
      <line
        x1="16"
        y1="4"
        x2="12"
        y2="4"
        stroke={color}
        strokeWidth="0.5"
        opacity="0.4"
      />
      <line
        x1="16"
        y1="4"
        x2="20"
        y2="4"
        stroke={color}
        strokeWidth="0.5"
        opacity="0.4"
      />
      {/* Geometric construction lines - bottom right */}
      <line
        x1="24"
        y1="28"
        x2="26"
        y2="30"
        stroke={color}
        strokeWidth="0.5"
        opacity="0.4"
      />
      <line
        x1="8"
        y1="28"
        x2="6"
        y2="30"
        stroke={color}
        strokeWidth="0.5"
        opacity="0.4"
      />
      {/* Small construction dot */}
      <circle
        cx="16"
        cy="2"
        r="1"
        fill={color}
        opacity="0.6"
      />
      <line
        x1="16"
        y1="2"
        x2="14"
        y2="6"
        stroke={color}
        strokeWidth="0.5"
        opacity="0.4"
      />
      <line
        x1="16"
        y1="2"
        x2="18"
        y2="6"
        stroke={color}
        strokeWidth="0.5"
        opacity="0.4"
      />
    </svg>
  )
}

const UsageIndicator = () => {
  const currentUser = useStore((state) => state.currentUser)
  const statsRefreshTrigger = useStore((state) => state.statsRefreshTrigger)
  const [usageStats, setUsageStats] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (currentUser?.id) {
      fetchUsageStats()
    }
  }, [currentUser, statsRefreshTrigger])

  const fetchUsageStats = async () => {
    if (!currentUser?.id) {
      setLoading(false)
      return
    }
    
    try {
      setLoading(true)
      const response = await axios.get(`http://localhost:3001/api/stats/${currentUser.id}`)
      setUsageStats(response.data)
    } catch (error) {
      console.error('Error fetching usage stats:', error)
      setUsageStats({
        freeUsagePercentage: 100,
        remainingFreeAllocation: 5.00,
        monthlyCost: 0,
      })
    } finally {
      setLoading(false)
    }
  }

  if (!currentUser || loading) {
    return null
  }

  const freeUsagePercentage = usageStats?.freeUsagePercentage || 100
  const remainingFreeAllocation = usageStats?.remainingFreeAllocation || 5.00
  const monthlyCost = usageStats?.monthlyCost || 0
  const usedPercentage = 100 - freeUsagePercentage
  const usedAmount = 5.00 - remainingFreeAllocation

  // Determine color based on usage level (every 20% of usage left)
  const getFillColor = () => {
    if (freeUsagePercentage >= 80) return '#00FF00' // Green (80-100% left)
    if (freeUsagePercentage >= 60) return '#0080FF' // Blue (60-80% left)
    if (freeUsagePercentage >= 40) return '#FFFF00' // Yellow (40-60% left)
    if (freeUsagePercentage >= 20) return '#FFA500' // Orange (20-40% left)
    return '#FF4444' // Red (0-20% left)
  }

  const fillColor = getFillColor()
  const isCritical = freeUsagePercentage < 20

  return (
    <div
      style={{
        position: 'fixed',
        top: '20px',
        right: '100px',
        zIndex: 200,
        display: 'flex',
        alignItems: 'center',
        gap: '12px',
      }}
    >
      {/* Icon Container */}
      <div
        style={{
          width: '64px',
          height: '64px',
          position: 'relative',
          filter: isCritical ? 'drop-shadow(0 0 12px rgba(255, 68, 68, 0.6))' : 'drop-shadow(0 0 8px rgba(0, 255, 255, 0.4))',
        }}
      >
        {/* Icon Container with Fill Effect */}
        <div
          style={{
            position: 'relative',
            width: '100%',
            height: '100%',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          {/* Base Icon (unfilled portion) */}
          <div
            style={{
              position: 'absolute',
              top: '50%',
              left: '50%',
              transform: 'translate(-50%, -50%)',
              zIndex: 1,
            }}
          >
            {isCritical ? (
              <AlertTriangle size={32} color="rgba(255, 255, 255, 0.3)" style={{ filter: 'drop-shadow(0 0 4px currentColor)' }} />
            ) : (
              <ArkTekAIcon size={32} color="rgba(255, 255, 255, 0.3)" />
            )}
          </div>

          {/* Filled Icon (clipped from bottom to top) */}
          <div
            style={{
              position: 'absolute',
              top: '50%',
              left: '50%',
              transform: 'translate(-50%, -50%)',
              zIndex: 2,
              clipPath: `inset(${100 - usedPercentage}% 0% 0% 0%)`,
              transition: 'clip-path 1s ease-out',
            }}
          >
            {isCritical ? (
              <AlertTriangle size={32} color={fillColor} style={{ filter: `drop-shadow(0 0 8px ${fillColor})` }} />
            ) : (
              <ArkTekAIcon size={32} color={fillColor} fillColor={fillColor} />
            )}
          </div>

          {/* Percentage Text (small, at bottom) */}
          {usedPercentage > 0 && (
            <div
              style={{
                position: 'absolute',
                bottom: '2px',
                left: '50%',
                transform: 'translateX(-50%)',
                fontSize: '0.65rem',
                fontWeight: 'bold',
                color: fillColor,
                textShadow: `0 0 4px ${fillColor}`,
                zIndex: 10,
              }}
            >
              {Math.round(usedPercentage)}% used
            </div>
          )}
        </div>

        {/* Pulse Animation when critical */}
        {isCritical && (
          <motion.div
            animate={{
              scale: [1, 1.1, 1],
              opacity: [0.5, 0.8, 0.5],
            }}
            transition={{
              duration: 2,
              repeat: Infinity,
              ease: 'easeInOut',
            }}
            style={{
              position: 'absolute',
              top: '50%',
              left: '50%',
              transform: 'translate(-50%, -50%)',
              width: '100%',
              height: '100%',
              borderRadius: '50%',
              border: `2px solid ${fillColor}`,
              pointerEvents: 'none',
            }}
          />
        )}

      </div>

      {/* Buy Usage Button */}
      <div style={{ position: 'relative', display: 'inline-block' }}>
        <button
          onClick={() => {
            // Placeholder for buying usage
            window.open('https://example.com/buy-usage', '_blank')
          }}
          style={{
            padding: 0,
            paddingBottom: '14px',
            background: 'transparent',
            border: 'none',
            color: '#ffffff',
            fontSize: '0.9rem',
            fontWeight: '500',
            cursor: 'pointer',
            transition: 'all 0.2s ease',
            whiteSpace: 'nowrap',
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.opacity = '0.8'
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.opacity = '1'
          }}
        >
          Buy Usage
        </button>
        {/* Multi-line underline effect */}
        <div
          style={{
            position: 'absolute',
            bottom: '0',
            left: '50%',
            transform: 'translateX(-50%)',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: '2px',
            width: '100%',
          }}
        >
          {/* First underline (full width) */}
          <div
            style={{
              width: '100%',
              height: '1px',
              background: '#ffffff',
            }}
          />
          {/* Second underline (slightly shorter) */}
          <div
            style={{
              width: '85%',
              height: '1px',
              background: '#ffffff',
            }}
          />
          {/* Third underline (even shorter) */}
          <div
            style={{
              width: '70%',
              height: '1px',
              background: '#ffffff',
            }}
          />
        </div>
      </div>
    </div>
  )
}

export default UsageIndicator

