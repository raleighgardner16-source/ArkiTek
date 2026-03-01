import type { CSSProperties } from 'react'
import type { Theme } from './theme'

// ============================================================================
// DESIGN TOKENS
// ============================================================================

export const spacing = {
  none: '0',
  px: '1px',
  '2xs': '2px',
  xs: '4px',
  sm: '6px',
  md: '8px',
  lg: '12px',
  xl: '16px',
  '2xl': '20px',
  '3xl': '24px',
  '4xl': '30px',
  '5xl': '40px',
  '6xl': '56px',
} as const

export const fontSize = {
  '2xs': '0.65rem',
  xs: '0.7rem',
  sm: '0.76rem',
  md: '0.8rem',
  base: '0.85rem',
  lg: '0.9rem',
  xl: '0.95rem',
  '2xl': '1rem',
  '3xl': '1.1rem',
  '4xl': '1.2rem',
  '5xl': '1.3rem',
  '6xl': '1.5rem',
  '7xl': '2.5rem',
  '8xl': '2.8rem',
} as const

export const fontWeight = {
  normal: '400',
  medium: '500',
  semibold: '600',
  bold: '700',
  extrabold: '800',
} as const

export const radius = {
  xs: '4px',
  sm: '6px',
  md: '8px',
  lg: '10px',
  xl: '12px',
  '2xl': '16px',
  '3xl': '20px',
  full: '9999px',
  circle: '50%',
} as const

export const zIndex = {
  base: 10,
  dropdown: 30,
  sticky: 100,
  nav: 150,
  tooltip: 200,
  popup: 300,
  modal: 10000,
} as const

export const transition = {
  fast: 'all 0.15s ease',
  normal: 'all 0.2s ease',
  slow: 'all 0.3s ease',
  navResize: 'left 0.3s ease, width 0.3s ease',
} as const

// ============================================================================
// STYLE MERGE UTILITY
// ============================================================================

/** Merge multiple CSSProperties objects. Falsy values are skipped. */
export const sx = (
  ...styles: Array<CSSProperties | false | null | undefined>
): CSSProperties => Object.assign({}, ...styles.filter(Boolean))

// ============================================================================
// LAYOUT PRIMITIVES (theme-independent)
// ============================================================================

export const layout = {
  flexRow: {
    display: 'flex',
    alignItems: 'center',
  } as CSSProperties,

  flexCol: {
    display: 'flex',
    flexDirection: 'column',
  } as CSSProperties,

  center: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  } as CSSProperties,

  spaceBetween: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
  } as CSSProperties,

  absoluteFill: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  } as CSSProperties,

  fixedFill: {
    position: 'fixed',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  } as CSSProperties,
}

// ============================================================================
// THEME-AWARE PRESETS
// ============================================================================

export const createStyles = (t: Theme) => ({
  // ---- Cards / Panels ----
  card: {
    background: t.buttonBackground,
    border: `1px solid ${t.borderLight}`,
    borderRadius: radius['2xl'],
    padding: spacing['3xl'],
  } as CSSProperties,

  cardElevated: {
    background: t.backgroundOverlay,
    border: `1px solid ${t.borderLight}`,
    borderRadius: radius.xl,
    padding: spacing['2xl'],
    boxShadow: `0 8px 32px ${t.shadow}`,
    backdropFilter: 'blur(20px)',
  } as CSSProperties,

  // ---- Overlays / Modals ----
  overlay: sx(layout.fixedFill, layout.center, {
    backgroundColor: 'rgba(0, 0, 0, 0.8)',
    zIndex: zIndex.modal,
    backdropFilter: 'blur(4px)',
  }),

  modal: {
    background: t.backgroundTertiary,
    border: `2px solid ${t.border}`,
    borderRadius: radius['2xl'],
    padding: spacing['3xl'],
    boxShadow: `0 8px 32px ${t.shadow}`,
  } as CSSProperties,

  // ---- Tooltip ----
  tooltip: {
    position: 'absolute' as const,
    background: 'rgba(0, 0, 0, 0.85)',
    border: '1px solid rgba(255, 255, 255, 0.1)',
    borderRadius: radius.sm,
    padding: `${spacing.xs} ${spacing.md}`,
    whiteSpace: 'nowrap' as const,
    zIndex: zIndex.tooltip,
    color: '#ffffff',
    fontSize: fontSize.xs,
    pointerEvents: 'none' as const,
  } as CSSProperties,

  // ---- Typography ----
  gradientText: {
    background: t.accentGradient,
    WebkitBackgroundClip: 'text',
    WebkitTextFillColor: 'transparent',
    backgroundClip: 'text',
    color: t.accent,
    display: 'inline-block',
  } as CSSProperties,

  pageTitle: {
    fontSize: fontSize['7xl'],
    fontWeight: fontWeight.bold,
    background: t.accentGradient,
    WebkitBackgroundClip: 'text',
    WebkitTextFillColor: 'transparent',
    backgroundClip: 'text',
    color: t.accent,
    display: 'inline-block',
  } as CSSProperties,

  sectionTitle: {
    fontSize: fontSize['6xl'],
    fontWeight: fontWeight.bold,
    color: t.accent,
  } as CSSProperties,

  subtitle: {
    color: t.textSecondary,
    fontSize: fontSize['3xl'],
  } as CSSProperties,

  bodyText: {
    color: t.textSecondary,
    lineHeight: '1.6',
  } as CSSProperties,

  mutedText: {
    color: t.textMuted,
    fontSize: fontSize.md,
  } as CSSProperties,

  // ---- Buttons ----
  iconButton: {
    background: 'none',
    border: 'none',
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.xs,
    borderRadius: radius.xs,
    transition: transition.normal,
  } as CSSProperties,

  buttonPrimary: {
    display: 'flex',
    alignItems: 'center',
    gap: spacing.md,
    padding: `${spacing.md} ${spacing.xl}`,
    borderRadius: radius.md,
    border: 'none',
    background: t.accentGradient,
    color: '#ffffff',
    fontSize: fontSize.lg,
    fontWeight: fontWeight.semibold,
    cursor: 'pointer',
    transition: transition.normal,
  } as CSSProperties,

  buttonSecondary: {
    display: 'flex',
    alignItems: 'center',
    gap: spacing.md,
    padding: `${spacing.md} ${spacing.xl}`,
    borderRadius: radius.md,
    border: `1px solid ${t.borderLight}`,
    background: t.buttonBackground,
    color: t.text,
    fontSize: fontSize.lg,
    fontWeight: fontWeight.medium,
    cursor: 'pointer',
    transition: transition.normal,
  } as CSSProperties,

  buttonGhost: {
    display: 'flex',
    alignItems: 'center',
    gap: spacing.md,
    padding: `${spacing.md} ${spacing.xl}`,
    borderRadius: radius.md,
    border: 'none',
    background: 'transparent',
    color: t.textSecondary,
    fontSize: fontSize.lg,
    fontWeight: fontWeight.medium,
    cursor: 'pointer',
    transition: transition.normal,
  } as CSSProperties,

  // ---- Navigation ----
  navItem: {
    display: 'flex',
    alignItems: 'center',
    gap: spacing.xl,
    padding: `14px ${spacing['2xl']}`,
    background: 'transparent',
    border: 'none',
    cursor: 'pointer',
    textAlign: 'left' as const,
    width: '100%',
    transition: transition.normal,
  } as CSSProperties,

  // ---- Form inputs ----
  input: {
    background: t.buttonBackground,
    border: `1px solid ${t.borderLight}`,
    borderRadius: radius.md,
    padding: `${spacing.md} ${spacing.lg}`,
    color: t.text,
    fontSize: fontSize.lg,
    outline: 'none',
    transition: transition.normal,
    width: '100%',
  } as CSSProperties,

  // ---- Badge ----
  badge: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: spacing.xs,
    padding: `${spacing.xs} ${spacing.md}`,
    borderRadius: radius.full,
    fontSize: fontSize.xs,
    fontWeight: fontWeight.semibold,
  } as CSSProperties,

  // ---- Divider ----
  divider: {
    width: '100%',
    height: spacing.px,
    background: t.borderLight,
    border: 'none',
  } as CSSProperties,

  // ---- Page container (panels offset by nav width) ----
  pageContainer: (navWidth: string): CSSProperties => ({
    position: 'fixed',
    top: 0,
    left: navWidth,
    width: `calc(100% - ${navWidth})`,
    height: '100%',
    display: 'flex',
    flexDirection: 'column',
    transition: transition.navResize,
    zIndex: zIndex.base,
  }),
})

/** Convenience type for the return of createStyles */
export type Styles = ReturnType<typeof createStyles>
