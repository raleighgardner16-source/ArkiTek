import { describe, it, expect } from 'vitest'
import { themes, getTheme } from '../src/utils/theme.js'
import type { Theme } from '../src/utils/theme.js'

describe('themes', () => {
  it('has dark and light themes', () => {
    expect(themes).toHaveProperty('dark')
    expect(themes).toHaveProperty('light')
  })

  it('dark theme has correct name', () => {
    expect(themes.dark.name).toBe('dark')
  })

  it('light theme has correct name', () => {
    expect(themes.light.name).toBe('light')
  })

  const requiredKeys: (keyof Theme)[] = [
    'name', 'background', 'backgroundSecondary', 'backgroundTertiary',
    'text', 'textSecondary', 'textMuted',
    'border', 'borderActive', 'borderLight',
    'accent', 'accentSecondary', 'accentGradient',
    'buttonBackground', 'buttonBackgroundActive', 'buttonBackgroundHover',
    'scrollbarTrack', 'scrollbarThumb',
    'shadow', 'shadowLight',
    'error', 'errorMuted', 'warning', 'warningMuted', 'success', 'successMuted',
  ]

  it('dark theme has all required properties', () => {
    for (const key of requiredKeys) {
      expect(themes.dark[key], `dark.${key}`).toBeTruthy()
    }
  })

  it('light theme has all required properties', () => {
    for (const key of requiredKeys) {
      expect(themes.light[key], `light.${key}`).toBeTruthy()
    }
  })

  it('dark theme uses dark background', () => {
    expect(themes.dark.background).toBe('#000000')
  })

  it('light theme uses light background', () => {
    expect(themes.light.background).toBe('#f5f5f5')
  })
})

describe('getTheme', () => {
  it('returns dark theme by default', () => {
    expect(getTheme().name).toBe('dark')
  })

  it('returns dark theme when explicitly requested', () => {
    expect(getTheme('dark').name).toBe('dark')
  })

  it('returns light theme when requested', () => {
    expect(getTheme('light').name).toBe('light')
  })

  it('falls back to dark for unknown theme name', () => {
    expect(getTheme('neon').name).toBe('dark')
  })

  it('falls back to dark for empty string', () => {
    expect(getTheme('').name).toBe('dark')
  })
})
