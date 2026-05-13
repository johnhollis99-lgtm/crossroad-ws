/**
 * Canonical XRoad wordmark — Pine type stack.
 *
 * Reads "XRoad" with Instrument Serif roman X (cap, weight 400) followed by
 * italic "Road" (Instrument Serif italic, weight 400). Bicolor: the X paints
 * with `theme.colors.primary` (emerald — same brand mark used on POI markers
 * and the cluster bubble count) and "Road" paints with the active text tone.
 *
 * Sizes m / l / xl drive the cap height (22 / 26 / 32 px). The Pine spec
 * places the wordmark at 20–22px in the home header card (size 'm'); larger
 * sizes exist for feature headlines and the demo screen.
 *
 * `background="pill"` adds a paperWarm pill backing with a control-style
 * shadow — used by sibling screens that overlay the wordmark on a map.
 * Pine collapses the light/dark posture of the old "cream chip" pattern;
 * the pill now uses theme-aware paperWarm directly.
 */

import React from 'react';
import { Platform, StyleSheet, Text, View } from 'react-native';
import Svg, { Circle, Path } from 'react-native-svg';
import { useTheme } from '../design/theme';
import { shadows } from '../design/tokens';

export type WordmarkSize       = 'm' | 'l' | 'xl';
export type WordmarkTone       = 'ink' | 'paper';
export type WordmarkBackground = 'none' | 'pill';

export interface WordmarkProps {
  size?:       WordmarkSize;
  tone?:       WordmarkTone;
  background?: WordmarkBackground;
  /**
   * When true, render the Pine "Squiggle" decoration (36px wide cream wavy
   * line + small accent dot) above the wordmark text. Used on the home
   * header card per Pine spec section 3.
   */
  squiggle?:   boolean;
  testID?:     string;
}

function Squiggle({ wave, dot }: { wave: string; dot: string }) {
  return (
    <Svg width={36} height={10} viewBox="0 0 36 10">
      <Path
        d="M2,5 Q9,1 18,5 T34,5"
        stroke={wave}
        strokeWidth={1.3}
        fill="none"
        strokeLinecap="round"
      />
      <Circle cx={31} cy={3} r={1.6} fill={dot} />
    </Svg>
  );
}

// Cap height per size step. These are structural brand-mark dimensions
// driven by the `size` prop, not typographic variants — the documented
// exception to "no fontSize literals outside textVariants."
const SIZE_MAP: Record<WordmarkSize, { capPx: number; trackingPx: number }> = {
  m:  { capPx: 22, trackingPx: -0.4 },
  l:  { capPx: 26, trackingPx: -0.5 },
  xl: { capPx: 32, trackingPx: -0.7 },
};

const PILL_PADDING: Record<WordmarkSize, { v: number; h: number }> = {
  m:  { v:  6, h: 14 },
  l:  { v:  7, h: 16 },
  xl: { v:  8, h: 18 },
};

// shadows.control sourced at module scope so non-component contexts can
// reference the same drop shadow without invoking useTheme().
const PILL_SHADOW = Platform.OS === 'android'
  ? ({ elevation: 4 } as const)
  : shadows.control;

export function Wordmark({
  size       = 'm',
  tone       = 'ink',
  background = 'none',
  squiggle   = false,
  testID,
}: WordmarkProps) {
  const { theme } = useTheme();
  const { capPx, trackingPx } = SIZE_MAP[size];

  // Bicolor: X always emerald (brand mark continuity with POI markers).
  // "Road" follows tone — ink for default surfaces, paperSoft for emerald
  // backgrounds where ink would disappear.
  const xColor    = theme.colors.primary;
  const wordColor = tone === 'paper' ? theme.colors.paperSoft : theme.colors.ink;
  const waveColor = tone === 'paper' ? theme.colors.paperSoft : theme.colors.inkSoft;
  const dotColor  = theme.colors.accent;

  const inner = (
    <View style={styles.wrap}>
      {squiggle ? (
        <View style={{ marginBottom: 2 }}>
          <Squiggle wave={waveColor} dot={dotColor} />
        </View>
      ) : null}
      <View style={styles.row}>
      <Text
        allowFontScaling={false}
        style={{
          fontFamily:    theme.fontFamilies.serif,
          fontWeight:    '400',
          fontSize:      capPx,
          lineHeight:    capPx * 1.1,
          letterSpacing: trackingPx,
          color:         xColor,
        }}
      >
        X
      </Text>
      <Text
        allowFontScaling={false}
        style={{
          fontFamily:    theme.fontFamilies.serifItalic,
          fontWeight:    '400',
          fontStyle:     'italic',
          fontSize:      capPx,
          lineHeight:    capPx * 1.1,
          letterSpacing: trackingPx,
          color:         wordColor,
        }}
      >
        Road
      </Text>
      </View>
    </View>
  );

  if (background === 'none') {
    return <View testID={testID}>{inner}</View>;
  }

  const pad = PILL_PADDING[size];
  return (
    <View
      testID={testID}
      style={[
        styles.pill,
        {
          backgroundColor:   theme.colors.paperWarm,
          borderColor:       theme.colors.paperEdge,
          paddingVertical:   pad.v,
          paddingHorizontal: pad.h,
        },
        PILL_SHADOW,
      ]}
    >
      {inner}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    alignItems: 'center',
  },
  row: {
    flexDirection: 'row',
    alignItems:    'baseline',
  },
  pill: {
    alignSelf:     'flex-start',
    borderRadius:  999,
    borderWidth:   1,
  },
});
