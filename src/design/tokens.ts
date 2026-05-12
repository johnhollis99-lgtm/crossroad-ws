/**
 * Xroad design tokens — Field Notes (editorial / NatGeo travel journal).
 *
 * Sole source of color, type, spacing, radius, and elevation values for the
 * new design system. The legacy palette in lib/theme.ts (dark earthy) stays
 * in place for screens that haven't migrated; new screens import from here.
 *
 * Values are exact — do not invent new constants without an update prompt.
 */

import type { TextStyle, ViewStyle } from 'react-native';

// ── COLORS ────────────────────────────────────────────────────────────────

export const lightColors = {
  paper:     '#f5efe2',
  paperDeep: '#ece4d2',
  ink:       '#1a1814',
  inkSoft:   '#6b6557',
  rule:      'rgba(26,24,20,0.18)',
  accent:    '#c0451d',                           // ink-red — primary CTA, "now playing", route line
  accent2:   '#3d5a3a',                           // forest — offline / cached / success
  glassTint:        'rgba(245,239,226,0.7)',      // GlassPill default fill (paper-translucent)
  glassTintInverse: 'rgba(14,13,10,0.6)',         // GlassPill `dark` fill (ink-translucent)
} as const;

export const darkColors = {
  paper:     '#15130f',
  paperDeep: '#0c0b09',
  ink:       '#f0e9d8',
  inkSoft:   'rgba(240,233,216,0.55)',
  rule:      'rgba(240,233,216,0.16)',
  card:      '#1c1914',
  cardEdge:  'rgba(240,233,216,0.12)',
  accent:    '#e07a4f',
  accent2:   '#7ba074',
  glassTint:        'rgba(28,25,20,0.7)',         // GlassPill default fill in dark (card-translucent)
  glassTintInverse: 'rgba(240,233,216,0.6)',      // GlassPill `dark`-prop fill in dark (ink-translucent)
} as const;

// ── TYPOGRAPHY ────────────────────────────────────────────────────────────

// fontFamily strings here must match the keys registered in src/design/fonts.ts.
// On iOS, "family + fontWeight + fontStyle" resolves to the matching face when
// every face is registered under the family name. On Android, per-weight
// family names may be needed — adjust here when font loading goes live.
export const fontFamilies = {
  serif:       'Fraunces',
  serifItalic: 'Fraunces-Italic',
  sans:        'Inter Tight',
  mono:        'JetBrains Mono',
} as const;

export type TextVariantName =
  | 'display'
  | 'h1'
  | 'h2'
  | 'h3'
  | 'body'
  | 'bodyItalic'
  | 'button'
  | 'buttonStrong'
  | 'ui'
  | 'uiSmall'
  | 'meta'
  | 'metaSmall';

export const textVariants: Record<TextVariantName, TextStyle> = {
  display: {
    fontFamily:    fontFamilies.serif,
    fontWeight:    '500',
    fontSize:      56,
    lineHeight:    64,           // 1.15 — clears Fraunces descenders on Android
    letterSpacing: -1.6,
  },
  h1: {
    fontFamily:    fontFamilies.serif,
    fontWeight:    '500',
    fontSize:      32,
    lineHeight:    38,           // 1.19 — clears Fraunces descenders on Android
    letterSpacing: -0.6,
  },
  h2: {
    fontFamily:    fontFamilies.serif,
    fontWeight:    '600',
    fontSize:      22,
    lineHeight:    25.3,         // 1.15
    letterSpacing: -0.4,
  },
  h3: {
    fontFamily:    fontFamilies.serif,
    fontWeight:    '600',
    fontSize:      17,
    lineHeight:    20.4,         // 1.2
    letterSpacing: -0.3,
  },
  body: {
    fontFamily:    fontFamilies.serif,
    fontWeight:    '400',
    fontSize:      15,
    lineHeight:    22.5,         // 1.5
  },
  bodyItalic: {
    fontFamily:    fontFamilies.serifItalic,
    fontWeight:    '400',
    fontStyle:     'italic',
    fontSize:      15,
    lineHeight:    22.5,
  },
  // Button-label variants bake italic + tightened tracking into the ramp so
  // PrimaryButton / DangerButton / NarrationCard titles no longer need inline
  // fontStyle overrides. 16/1.3 lands between body (15) and h3 (17).
  button: {
    fontFamily:    fontFamilies.serifItalic,
    fontWeight:    '500',
    fontStyle:     'italic',
    fontSize:      16,
    lineHeight:    20.8,         // 1.3
    letterSpacing: -0.2,
  },
  buttonStrong: {
    fontFamily:    fontFamilies.serifItalic,
    fontWeight:    '600',
    fontStyle:     'italic',
    fontSize:      16,
    lineHeight:    20.8,         // 1.3
    letterSpacing: -0.2,
  },
  ui: {
    fontFamily:    fontFamilies.sans,
    fontWeight:    '500',
    fontSize:      14,
    lineHeight:    19.6,         // 1.4
  },
  uiSmall: {
    fontFamily:    fontFamilies.sans,
    fontWeight:    '500',
    fontSize:      12,
    lineHeight:    16.8,
  },
  meta: {
    fontFamily:    fontFamilies.mono,
    fontWeight:    '400',
    fontSize:      10,
    lineHeight:    14,
    letterSpacing: 1.6,
    textTransform: 'uppercase',
  },
  metaSmall: {
    fontFamily:    fontFamilies.mono,
    fontWeight:    '400',
    fontSize:      9,
    lineHeight:    12.6,
    letterSpacing: 1.6,
    textTransform: 'uppercase',
  },
};

// ── SPACING (4px scale) ───────────────────────────────────────────────────

export const spacing = {
  xs:    4,
  s:     8,
  m:    12,
  l:    16,
  xl:   20,
  '2xl': 24,
  '3xl': 32,
  '4xl': 48,
} as const;

export type SpacingName = keyof typeof spacing;

// ── RADIUS ────────────────────────────────────────────────────────────────

export const radii = {
  s:     8,
  m:    14,
  l:    18,
  xl:   26,
  pill: 999,
} as const;

export type RadiusName = keyof typeof radii;

// ── ELEVATION (light mode only — dark mode uses borders, not shadow) ──────

// Translates the CSS shadow shorthand from the spec to RN's shadow* + Android
// elevation props. Color is the ink hex; alpha is split out into shadowOpacity
// so Android (which only honors `elevation`) still renders a comparable depth.
export const elevation: Record<'e1' | 'e2', ViewStyle> = {
  e1: {
    shadowColor:   '#1a1814',
    shadowOffset:  { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius:  3,
    elevation:     2,
  },
  e2: {
    shadowColor:   '#1a1814',
    shadowOffset:  { width: 0, height: 6 },
    shadowOpacity: 0.12,
    shadowRadius:  20,
    elevation:     8,
  },
};
