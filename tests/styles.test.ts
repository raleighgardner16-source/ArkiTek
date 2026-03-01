import { describe, it, expect } from 'vitest'
import { spacing, fontSize, fontWeight, radius, zIndex, transition, sx, layout, createStyles } from '../src/utils/styles.js'
import { themes } from '../src/utils/theme.js'

describe('design tokens', () => {
  it('spacing has expected keys', () => {
    expect(spacing.none).toBe('0')
    expect(spacing.md).toBe('8px')
    expect(spacing.xl).toBe('16px')
  })

  it('fontSize has expected range', () => {
    expect(fontSize['2xs']).toBeTruthy()
    expect(fontSize['8xl']).toBeTruthy()
  })

  it('fontWeight has standard weights', () => {
    expect(fontWeight.normal).toBe('400')
    expect(fontWeight.bold).toBe('700')
  })

  it('radius has xs through full', () => {
    expect(radius.xs).toBeTruthy()
    expect(radius.full).toBe('9999px')
    expect(radius.circle).toBe('50%')
  })

  it('zIndex values increase in order', () => {
    expect(zIndex.base).toBeLessThan(zIndex.dropdown)
    expect(zIndex.dropdown).toBeLessThan(zIndex.sticky)
    expect(zIndex.sticky).toBeLessThan(zIndex.nav)
    expect(zIndex.nav).toBeLessThan(zIndex.tooltip)
    expect(zIndex.tooltip).toBeLessThan(zIndex.popup)
    expect(zIndex.popup).toBeLessThan(zIndex.modal)
  })

  it('transition has expected keys', () => {
    expect(transition.fast).toContain('0.15s')
    expect(transition.normal).toContain('0.2s')
    expect(transition.slow).toContain('0.3s')
  })
})

describe('sx', () => {
  it('merges multiple style objects', () => {
    const result = sx({ color: 'red' }, { fontSize: '14px' })
    expect(result).toEqual({ color: 'red', fontSize: '14px' })
  })

  it('later styles override earlier ones', () => {
    const result = sx({ color: 'red' }, { color: 'blue' })
    expect(result.color).toBe('blue')
  })

  it('filters out falsy values', () => {
    const result = sx({ color: 'red' }, false, null, undefined, { fontSize: '14px' })
    expect(result).toEqual({ color: 'red', fontSize: '14px' })
  })

  it('returns empty object for no args', () => {
    expect(sx()).toEqual({})
  })

  it('returns empty object for all falsy args', () => {
    expect(sx(false, null, undefined)).toEqual({})
  })
})

describe('layout', () => {
  it('flexRow has display flex and alignItems center', () => {
    expect(layout.flexRow.display).toBe('flex')
    expect(layout.flexRow.alignItems).toBe('center')
  })

  it('flexCol has display flex and column direction', () => {
    expect(layout.flexCol.display).toBe('flex')
    expect(layout.flexCol.flexDirection).toBe('column')
  })

  it('center has centered alignment', () => {
    expect(layout.center.alignItems).toBe('center')
    expect(layout.center.justifyContent).toBe('center')
  })
})

describe('createStyles', () => {
  it('returns an object with theme-dependent styles', () => {
    const styles = createStyles(themes.dark)
    expect(styles).toHaveProperty('card')
    expect(styles).toHaveProperty('pageContainer')
  })

  it('pageContainer returns CSSProperties with left offset', () => {
    const styles = createStyles(themes.dark)
    const container = styles.pageContainer('250px')
    expect(container.left).toBe('250px')
  })

  it('works with both dark and light themes', () => {
    const darkStyles = createStyles(themes.dark)
    const lightStyles = createStyles(themes.light)
    expect(darkStyles.card).toBeTruthy()
    expect(lightStyles.card).toBeTruthy()
  })
})
