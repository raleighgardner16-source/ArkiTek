// Theme configuration for light and dark modes
export const themes = {
  dark: {
    name: 'dark',
    // Backgrounds
    background: '#000000',
    backgroundSecondary: '#0a0a0a',
    backgroundTertiary: '#1a1a1a',
    backgroundOverlay: 'rgba(0, 0, 0, 0.95)',
    backgroundOverlayLight: 'rgba(0, 0, 0, 0.9)',
    backgroundOverlayLighter: 'rgba(0, 0, 0, 0.1)',
    
    // Text
    text: '#ffffff',
    textSecondary: '#cccccc',
    textMuted: '#666666',
    
    // Borders
    border: 'rgba(0, 255, 255, 0.2)',
    borderActive: 'rgba(0, 255, 255, 0.8)',
    borderLight: 'rgba(0, 255, 255, 0.3)',
    
    // Accent colors (cyan/green gradient)
    accent: '#00FFFF',
    accentSecondary: '#00FF00',
    accentGradient: 'linear-gradient(90deg, #00FFFF, #00FF00)',
    
    // UI elements
    buttonBackground: 'rgba(0, 255, 255, 0.05)',
    buttonBackgroundActive: 'rgba(0, 255, 255, 0.3)',
    buttonBackgroundHover: 'rgba(0, 255, 255, 0.1)',
    
    // Scrollbar
    scrollbarTrack: 'rgba(0, 255, 255, 0.1)',
    scrollbarThumb: 'linear-gradient(180deg, #00FFFF, #00FF00)',
    
    // Shadows
    shadow: 'rgba(0, 255, 255, 0.3)',
    shadowLight: 'rgba(0, 255, 255, 0.2)',
  },
  light: {
    name: 'light',
    // Backgrounds
    background: '#f5f5f5',
    backgroundSecondary: '#e8e8e8',
    backgroundTertiary: '#dddddd',
    backgroundOverlay: 'rgba(255, 255, 255, 0.95)',
    backgroundOverlayLight: 'rgba(255, 255, 255, 0.9)',
    backgroundOverlayLighter: 'rgba(0, 0, 0, 0.05)',
    
    // Text
    text: '#000000',
    textSecondary: '#333333',
    textMuted: '#666666',
    
    // Borders
    border: 'rgba(0, 150, 200, 0.3)',
    borderActive: 'rgba(0, 150, 200, 0.8)',
    borderLight: 'rgba(0, 150, 200, 0.2)',
    
    // Accent colors (blue/teal gradient for light mode)
    accent: '#0088cc',
    accentSecondary: '#00aa88',
    accentGradient: 'linear-gradient(90deg, #0088cc, #00aa88)',
    
    // UI elements
    buttonBackground: 'rgba(0, 150, 200, 0.1)',
    buttonBackgroundActive: 'rgba(0, 150, 200, 0.25)',
    buttonBackgroundHover: 'rgba(0, 150, 200, 0.15)',
    
    // Scrollbar
    scrollbarTrack: 'rgba(0, 150, 200, 0.1)',
    scrollbarThumb: 'linear-gradient(180deg, #0088cc, #00aa88)',
    
    // Shadows
    shadow: 'rgba(0, 150, 200, 0.3)',
    shadowLight: 'rgba(0, 150, 200, 0.2)',
  }
}

export const getTheme = (themeName = 'dark') => {
  return themes[themeName] || themes.dark
}

