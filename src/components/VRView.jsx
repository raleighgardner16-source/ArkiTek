import React from 'react'

const VRView = () => {
  return (
    <div
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        width: '100%',
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '40px',
        paddingLeft: '260px', // Account for nav bar
        zIndex: 10,
        overflowY: 'auto',
      }}
    >
      <div
        style={{
          width: '100%',
          maxWidth: '800px',
          textAlign: 'center',
        }}
      >
        <h1
          style={{
            fontSize: '2.5rem',
            marginBottom: '20px',
            background: 'linear-gradient(90deg, #00FFFF, #00FF00)',
            WebkitBackgroundClip: 'text',
            WebkitTextFillColor: 'transparent',
          }}
        >
          VR Experience
        </h1>
        <p style={{ color: '#aaaaaa', fontSize: '1.2rem', lineHeight: '1.8' }}>
          Immersive VR experience coming soon...
        </p>
        <div
          style={{
            marginTop: '40px',
            padding: '40px',
            background: 'rgba(0, 255, 255, 0.05)',
            border: '1px solid rgba(0, 255, 255, 0.3)',
            borderRadius: '16px',
          }}
        >
          <p style={{ color: '#cccccc', fontSize: '1rem' }}>
            This section will feature customizable VR-like environments where you
            can navigate and interact with the interface in immersive 3D spaces.
          </p>
        </div>
      </div>
    </div>
  )
}

export default VRView

