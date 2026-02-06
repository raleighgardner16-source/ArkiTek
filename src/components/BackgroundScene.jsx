import React, { useRef, useEffect } from 'react'
import { useStore } from '../store/useStore'
import { getTheme } from '../utils/theme'

const BackgroundScene = () => {
  const canvasRef = useRef(null)
  const vrMode = useStore((state) => state.vrMode)
  const setCameraPosition = useStore((state) => state.setCameraPosition)
  const cameraPosition = useStore((state) => state.cameraPosition)
  const theme = useStore((state) => state.theme || 'dark')
  const currentTheme = getTheme(theme)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    const ctx = canvas.getContext('2d')
    canvas.width = window.innerWidth
    canvas.height = window.innerHeight

    // Particle system
    const particles = []
    const particleCount = 50

    const particleColor = theme === 'dark' ? '#FFFFFF' : '#000000'
    for (let i = 0; i < particleCount; i++) {
      particles.push({
        x: Math.random() * canvas.width,
        y: Math.random() * canvas.height,
        radius: Math.random() * 2 + 1,
        speedX: (Math.random() - 0.5) * 0.5,
        speedY: (Math.random() - 0.5) * 0.5,
        color: particleColor,
        opacity: Math.random() * 0.5 + 0.3,
      })
    }

    let animationFrameId

    const animate = () => {
      ctx.fillStyle = currentTheme.background
      ctx.fillRect(0, 0, canvas.width, canvas.height)

      // Update and draw particles
      particles.forEach((particle) => {
        particle.x += particle.speedX
        particle.y += particle.speedY

        if (particle.x < 0 || particle.x > canvas.width) particle.speedX *= -1
        if (particle.y < 0 || particle.y > canvas.height) particle.speedY *= -1

        ctx.beginPath()
        ctx.arc(particle.x, particle.y, particle.radius, 0, Math.PI * 2)
        ctx.fillStyle = particle.color + Math.floor(particle.opacity * 255).toString(16).padStart(2, '0')
        ctx.fill()
      })

      animationFrameId = requestAnimationFrame(animate)
    }

    animate()

    // Handle VR navigation
    let isDragging = false
    let lastMouseX = 0
    let lastMouseY = 0

    const handleMouseDown = (e) => {
      if (vrMode) {
        isDragging = true
        lastMouseX = e.clientX
        lastMouseY = e.clientY
      }
    }

    const handleMouseMove = (e) => {
      if (vrMode && isDragging) {
        const deltaX = (e.clientX - lastMouseX) * 0.01
        const deltaY = (e.clientY - lastMouseY) * 0.01

        setCameraPosition({
          x: cameraPosition.x + deltaX,
          y: cameraPosition.y + deltaY,
          z: cameraPosition.z,
        })

        lastMouseX = e.clientX
        lastMouseY = e.clientY
      }
    }

    const handleMouseUp = () => {
      isDragging = false
    }

    if (vrMode) {
      canvas.addEventListener('mousedown', handleMouseDown)
      canvas.addEventListener('mousemove', handleMouseMove)
      canvas.addEventListener('mouseup', handleMouseUp)
    }

    const handleResize = () => {
      canvas.width = window.innerWidth
      canvas.height = window.innerHeight
    }

    window.addEventListener('resize', handleResize)

    return () => {
      cancelAnimationFrame(animationFrameId)
      canvas.removeEventListener('mousedown', handleMouseDown)
      canvas.removeEventListener('mousemove', handleMouseMove)
      canvas.removeEventListener('mouseup', handleMouseUp)
      window.removeEventListener('resize', handleResize)
    }
  }, [vrMode, cameraPosition, setCameraPosition, theme, currentTheme])

  return (
    <div style={{ position: 'fixed', top: 0, left: 0, width: '100%', height: '100%', zIndex: 0 }}>
      <canvas
        ref={canvasRef}
        style={{
          width: '100%',
          height: '100%',
          cursor: vrMode ? 'grab' : 'default',
        }}
      />
    </div>
  )
}

export default BackgroundScene

