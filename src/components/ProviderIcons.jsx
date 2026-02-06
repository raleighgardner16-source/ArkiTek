import React, { useState, useRef, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { useStore } from '../store/useStore'
import { getTheme } from '../utils/theme'
import chameleonIcon from '../assets/icons/chameleon.svg'
import foxIcon from '../assets/icons/fox.svg'
import octopusIcon from '../assets/icons/octopus.svg'
import owlIcon from '../assets/icons/owl.svg'

const mascotMessages = {
  openai: {
    name: 'Milo',
    provider: 'Chatgpt',
    message: "Hey! I'm Milo at Chatgpt! Click me and enter a prompt above to get an awesome response! 🤖"
  },
  anthropic: {
    name: 'Quill',
    provider: 'Claude',
    message: "Hey! I'm Quill at Claude! Click me and enter a prompt above to get an awesome response! 🦉"
  },
  google: {
    name: 'Lumen',
    provider: 'Gemini',
    message: "Hey! I'm Lumen at Gemini! Click me and enter a prompt above to get an awesome response! 🦊"
  },
  xai: {
    name: 'Flux',
    provider: 'Grok',
    message: "Hey! I'm Flux at Grok! Click me and enter a prompt above to get an awesome response! 🐙"
  }
}

export const ProviderIcon = ({ provider, style }) => {
  const [isHovered, setIsHovered] = useState(false)
  const [tooltipPosition, setTooltipPosition] = useState({ top: 0, left: 0, transform: 'translate(-50%, -100%)', arrowOffset: 0 })
  const iconRef = useRef(null)
  const theme = useStore((state) => state.theme || 'dark')
  const currentTheme = getTheme(theme)

  const defaultStyle = {
    width: '28px',
    height: '28px',
    flexShrink: 0,
    objectFit: 'contain',
    cursor: 'pointer',
    transition: 'transform 0.2s ease',
    transform: isHovered ? 'scale(1.1)' : 'scale(1)',
    ...style,
  }

  const mascotInfo = mascotMessages[provider]

  const updateTooltipPosition = () => {
    if (iconRef.current) {
      const rect = iconRef.current.getBoundingClientRect()
      const tooltipMaxWidth = 280 // maxWidth from tooltip style
      const tooltipHalfWidth = tooltipMaxWidth / 2
      const viewportWidth = window.innerWidth
      const padding = 10 // Padding from viewport edges
      
      // Calculate center position
      const iconCenterX = rect.left + rect.width / 2
      
      // Calculate where tooltip would be if centered on icon
      const tooltipRightEdge = iconCenterX + tooltipHalfWidth
      const tooltipLeftEdge = iconCenterX - tooltipHalfWidth
      
      let leftPosition = iconCenterX
      let transform = 'translate(-50%, -100%)'
      let arrowOffset = 0
      
      // If tooltip would overflow right edge, shift left to fit
      if (tooltipRightEdge > viewportWidth - padding) {
        // Position so right edge is at viewport edge minus padding
        leftPosition = viewportWidth - padding - tooltipHalfWidth
        // Calculate how much we shifted from icon center
        const shiftAmount = iconCenterX - leftPosition
        // Adjust transform to account for the shift
        transform = `translate(calc(-50% + ${shiftAmount}px), -100%)`
        // Arrow should point to icon center, so offset it right
        arrowOffset = shiftAmount
      }
      // If tooltip would overflow left edge, shift right to fit
      else if (tooltipLeftEdge < padding) {
        // Position so left edge is at padding
        leftPosition = padding + tooltipHalfWidth
        // Calculate how much we shifted from icon center
        const shiftAmount = iconCenterX - leftPosition
        transform = `translate(calc(-50% + ${shiftAmount}px), -100%)`
        arrowOffset = shiftAmount
      }
      
      setTooltipPosition({
        top: rect.top - 8, // Position above the icon
        left: leftPosition,
        transform: transform,
        arrowOffset: arrowOffset,
      })
    }
  }

  useEffect(() => {
    if (isHovered) {
      updateTooltipPosition()
      // Update position on scroll/resize
      window.addEventListener('scroll', updateTooltipPosition, true)
      window.addEventListener('resize', updateTooltipPosition)
      return () => {
        window.removeEventListener('scroll', updateTooltipPosition, true)
        window.removeEventListener('resize', updateTooltipPosition)
      }
    }
  }, [isHovered])

  const handleMouseEnter = () => {
    setIsHovered(true)
  }

  const handleMouseLeave = () => {
    setIsHovered(false)
  }

  const getIcon = () => {
    // For Grok (xai), apply filter to make it black in light mode, white in dark mode
    const grokIconStyle = {
      ...defaultStyle,
      filter: theme === 'light' ? 'brightness(0)' : 'none',
    }
    
    switch (provider) {
      case 'openai':
        return (
          <span style={{
            ...defaultStyle,
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: '28px',
            lineHeight: '1',
          }}>
            🤖
          </span>
        )
      case 'anthropic':
        return <img src={owlIcon} alt="Claude" style={defaultStyle} />
      case 'google':
        return <img src={foxIcon} alt="Gemini" style={defaultStyle} />
      case 'xai':
        return <img src={octopusIcon} alt="Grok" style={grokIconStyle} />
      default:
        return null
    }
  }

  if (!mascotInfo) {
    return getIcon()
  }

  const tooltip = isHovered ? (
    createPortal(
      <div
        style={{
          position: 'fixed',
          top: `${tooltipPosition.top}px`,
          left: `${tooltipPosition.left}px`,
          transform: tooltipPosition.transform,
          marginBottom: '4px',
          padding: '10px 12px',
          background: currentTheme.backgroundOverlay,
          border: `1.5px solid ${currentTheme.borderActive}`,
          borderRadius: '6px',
          color: currentTheme.text,
          fontSize: '0.75rem',
          fontWeight: '500',
          maxWidth: '280px',
          lineHeight: '1.4',
          textAlign: 'center',
          zIndex: 10000,
          boxShadow: '0 2px 8px rgba(0, 255, 255, 0.4)',
          pointerEvents: 'none',
          animation: 'tooltipFadeIn 0.15s ease-out',
        }}
      >
        {mascotInfo.message}
        <div
          style={{
            position: 'absolute',
            top: '100%',
            left: '50%',
            transform: `translateX(calc(-50% + ${tooltipPosition.arrowOffset}px))`,
            width: 0,
            height: 0,
            borderLeft: '5px solid transparent',
            borderRight: '5px solid transparent',
            borderTop: `5px solid ${currentTheme.borderActive}`,
          }}
        />
        <style>{`
          @keyframes tooltipFadeIn {
            from {
              opacity: 0;
              transform: ${tooltipPosition.transform} translateY(4px);
            }
            to {
              opacity: 1;
              transform: ${tooltipPosition.transform} translateY(0);
            }
          }
        `}</style>
      </div>,
      document.body
    )
  ) : null

  return (
    <>
      <div
        ref={iconRef}
        style={{
          position: 'relative',
          display: 'inline-block',
        }}
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
      >
        {getIcon()}
      </div>
      {tooltip}
    </>
  )
}

