/**
 * XRoad design tokens — Pine (dark forest-green + emerald + cobalt).
 *
 * Sole source of color, type, spacing, radius, and shadow values.
 * Single dark theme; CVD-safe mode swaps the icon `accent` color from
 * cobalt → amber at the theme-provider level (see theme.ts).
 *
 * No hardcoded hex or fontFamily/fontSize literals outside this file.
 */

import type { TextStyle, ViewStyle } from 'react-native';

// ── COLORS (single dark palette) ──────────────────────────────────────────

export const pineColors = {
  paper:             '#08160F',   // primary surface — header card, sheet, FAB
  paperSoft:         '#0F1F18',   // text color on primary-accent backgrounds
  paperWarm:         '#142922',   // secondary surface — search field, avatar, active tab pill
  paperEdge:         '#2A4035',   // border / divider on opaque surfaces

  ink:               '#E8FAEF',   // body text, icon primary stroke
  inkSoft:           '#9ACCB0',   // secondary text, meta labels
  inkFaint:          '#5E907C',   // tertiary — decorative only, never content

  line:              'rgba(232,250,239,0.22)',
  lineSoft:          'rgba(232,250,239,0.10)',

  primary:           '#10B981',   // EMERALD — chips selected, Drive, route stops, rating chip
  primaryDeep:       '#059669',
  primaryTint:       'rgba(16,185,129,0.14)',
  primaryTintEdge:   'rgba(16,185,129,0.28)',

  secondary:         '#60A5FA',   // COBALT — icon accent dots, Add stop pill
  secondaryDeep:     '#3B82F6',
  secondaryTint:     'rgba(96,165,250,0.14)',
  secondaryTintEdge: 'rgba(96,165,250,0.28)',

  cvdSafe:           '#F59E0B',   // amber — replaces icon accent when CVD-safe is on

  danger:            '#E11D48',   // rose — End trip / destructive CTAs
  dangerDeep:        '#BE123C',
  dangerTint:        'rgba(225,29,72,0.16)',
} as const;

// ── TYPOGRAPHY ────────────────────────────────────────────────────────────

export const fontFamilies = {
  serif:       'Instrument Serif',
  serifItalic: 'Instrument Serif-Italic',
  sans:        'DM Sans',
  mono:        'JetBrains Mono',
} as const;

export type TextVariantName =
  | 'display'        // 32 italic serif — feature headlines
  | 'displaySmall'   // 26 italic serif — route hero "1h 12m"
  | 'title'          // 22 italic serif — wordmark Road
  | 'titleSmall'     // 20 italic serif — secondary titles
  | 'label'          // 14 DM Sans 700 — buttons, tab labels, chip labels
  | 'body'           // 14 DM Sans 600 — stop titles, primary text
  | 'meta'           // 12 DM Sans 500 — stop subtitles, distance, sub-labels
  | 'eyebrow';       // 10 DM Sans 700 uppercase 0.18em — section headers

export const textVariants: Record<TextVariantName, TextStyle> = {
  display: {
    fontFamily:    fontFamilies.serifItalic,
    fontWeight:    '400',
    fontStyle:     'italic',
    fontSize:      32,
    lineHeight:    38,
  },
  displaySmall: {
    fontFamily:    fontFamilies.serifItalic,
    fontWeight:    '400',
    fontStyle:     'italic',
    fontSize:      26,
    lineHeight:    32,
  },
  title: {
    fontFamily:    fontFamilies.serifItalic,
    fontWeight:    '400',
    fontStyle:     'italic',
    fontSize:      22,
    lineHeight:    26,
  },
  titleSmall: {
    fontFamily:    fontFamilies.serifItalic,
    fontWeight:    '400',
    fontStyle:     'italic',
    fontSize:      20,
    lineHeight:    24,
  },
  label: {
    fontFamily:    fontFamilies.sans,
    fontWeight:    '700',
    fontSize:      14,
    lineHeight:    19,
  },
  body: {
    fontFamily:    fontFamilies.sans,
    fontWeight:    '600',
    fontSize:      14,
    lineHeight:    20,
  },
  meta: {
    fontFamily:    fontFamilies.sans,
    fontWeight:    '500',
    fontSize:      12,
    lineHeight:    16,
  },
  eyebrow: {
    fontFamily:    fontFamilies.sans,
    fontWeight:    '700',
    fontSize:      10,
    lineHeight:    13,
    letterSpacing: 1.8,            // 0.18em at 10px
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
  s:        8,
  control: 12,    // tab pills, secondary buttons
  button:  14,    // primary CTAs, Add stop, tab pills (upper bound)
  segment: 16,    // MapRail segments
  sheet:   24,    // bottom sheet (all 4 corners when floating)
  card:    26,    // top header card
  pill:   999,    // chips, mode toggle, search field, rating chip, FAB
} as const;

export type RadiusName = keyof typeof radii;

// ── SHADOW ────────────────────────────────────────────────────────────────

// Shadows use straight black (#000000) with alpha — not theme ink — since Pine
// is dark-only and the spec's CSS shadows are alpha-on-black, not alpha-on-paper.
// `sheet` uses #141008 (warm-tinted black) to match the spec's `rgba(20,16,8,0.18)`.

export const shadows: Record<'card' | 'control' | 'sheet', ViewStyle> = {
  card: {
    shadowColor:   '#000000',
    shadowOffset:  { width: 0, height: 10 },
    shadowOpacity: 0.5,
    shadowRadius:  28,
    elevation:     12,
  },
  control: {
    shadowColor:   '#000000',
    shadowOffset:  { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius:  14,
    elevation:     6,
  },
  sheet: {
    shadowColor:   '#141008',
    shadowOffset:  { width: 0, height: -8 },
    shadowOpacity: 0.18,
    shadowRadius:  24,
    elevation:     10,
  },
};
