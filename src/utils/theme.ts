// Theme configuration for light and dark modes

export interface Theme {
  name: string

  // Backgrounds
  background: string
  backgroundSecondary: string
  backgroundTertiary: string
  backgroundOverlay: string
  backgroundOverlayLight: string
  backgroundOverlayLighter: string

  // Text
  text: string
  textSecondary: string
  textMuted: string

  // Borders
  border: string
  borderActive: string
  borderLight: string

  // Accent colors
  accent: string
  accentSecondary: string
  accentGradient: string

  // UI elements
  buttonBackground: string
  buttonBackgroundActive: string
  buttonBackgroundHover: string

  // Scrollbar
  scrollbarTrack: string
  scrollbarThumb: string

  // Shadows
  shadow: string
  shadowLight: string

  // Semantic colors
  error: string
  errorMuted: string
  warning: string
  warningMuted: string
  success: string
  successMuted: string
}

export const themes: Record<string, Theme> = {
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
    border: 'rgba(93, 173, 226, 0.2)',
    borderActive: 'rgba(93, 173, 226, 0.7)',
    borderLight: 'rgba(93, 173, 226, 0.25)',
    
    // Accent colors (muted blue/teal matching light mode family)
    accent: '#5dade2',
    accentSecondary: '#48c9b0',
    accentGradient: 'linear-gradient(90deg, #5dade2, #48c9b0)',
    
    // UI elements
    buttonBackground: 'rgba(93, 173, 226, 0.06)',
    buttonBackgroundActive: 'rgba(93, 173, 226, 0.25)',
    buttonBackgroundHover: 'rgba(93, 173, 226, 0.12)',
    
    // Scrollbar
    scrollbarTrack: 'rgba(93, 173, 226, 0.1)',
    scrollbarThumb: 'linear-gradient(180deg, #5dade2, #48c9b0)',
    
    // Shadows
    shadow: 'rgba(93, 173, 226, 0.2)',
    shadowLight: 'rgba(93, 173, 226, 0.15)',

    // Semantic
    error: '#ff6b6b',
    errorMuted: 'rgba(255, 107, 107, 0.1)',
    warning: '#ffaa00',
    warningMuted: 'rgba(255, 170, 0, 0.1)',
    success: '#22c55e',
    successMuted: 'rgba(34, 197, 94, 0.1)',
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

    // Semantic
    error: '#dc2626',
    errorMuted: 'rgba(220, 38, 38, 0.1)',
    warning: '#d97706',
    warningMuted: 'rgba(217, 119, 6, 0.1)',
    success: '#16a34a',
    successMuted: 'rgba(22, 163, 74, 0.1)',
  }
}

export const getTheme = (themeName: string = 'dark'): Theme => {
  return themes[themeName] || themes.dark
}
