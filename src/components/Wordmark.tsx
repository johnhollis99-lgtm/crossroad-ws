import React from 'react';
import { Platform, StyleSheet, Text, View } from 'react-native';
import Svg, { Circle, Path } from 'react-native-svg';
import { lightTheme, useTheme } from '../design/theme';

export type WordmarkSize       = 'm' | 'l' | 'xl';
export type WordmarkTone       = 'ink' | 'paper';
export type WordmarkBackground = 'none' | 'pill';

export interface WordmarkProps {
  size?:       WordmarkSize;
  tone?:       WordmarkTone;
  background?: WordmarkBackground;
  testID?:     string;
}

// Cap height (font-size for X / Road), horizon width, and center-dot radius
// per size step. These literals are structural brand-mark dimensions driven
// by the `size` prop, not typographic variants — the one documented exception
// to "no fontSize literals outside textVariants" in the component library.
const SIZE_MAP: Record<
  WordmarkSize,
  { capPx: number; horizonW: number; dotR: number; gap: number }
> = {
  m:  { capPx: 22, horizonW:  80, dotR: 1.6, gap: 6 },
  l:  { capPx: 32, horizonW: 110, dotR: 2.2, gap: 7 },
  xl: { capPx: 56, horizonW: 180, dotR: 3.4, gap: 8 },
};

// Pill padding scales ~30% per step. Top/bottom asymmetric — extra bottom
// padding visually balances the descender-light "Road" baseline against
// the horizon above.
const PILL_PADDING: Record<WordmarkSize, { top: number; bottom: number; h: number }> = {
  m:  { top:  8, bottom: 10, h: 14 },
  l:  { top: 10, bottom: 13, h: 18 },
  xl: { top: 13, bottom: 16, h: 22 },
};

function buildWavePath(width: number): string {
  // Four-hump horizon: first quadratic hump above the baseline (control y=2),
  // then three smooth T continuations that reflect through baseline endpoints
  // for alternating up/down humps. ViewBox is 12 high; baseline sits at y=6.
  const W = width;
  return (
    `M0,6 ` +
    `Q${(W * 0.125).toFixed(2)},2 ${(W * 0.25).toFixed(2)},6 ` +
    `T${(W * 0.5).toFixed(2)},6 ` +
    `T${(W * 0.75).toFixed(2)},6 ` +
    `T${W.toFixed(2)},6`
  );
}

export function Wordmark({
  size       = 'm',
  tone       = 'ink',
  background = 'none',
  testID,
}: WordmarkProps) {
  const { theme } = useTheme();
  const { capPx, horizonW, dotR, gap } = SIZE_MAP[size];

  // Pill is a branded chip — colors are locked to light-mode constants
  // regardless of system scheme, so the mark reads as XRoad-on-cream
  // when overlaying a dark map even in dark-mode UI. Outside the pill,
  // colors follow the active theme + `tone`.
  const isPill = background === 'pill';
  const wordColor = isPill
    ? lightTheme.colors.ink
    : (tone === 'ink' ? theme.colors.ink : theme.colors.paper);
  const accentColor = isPill ? lightTheme.colors.accent : theme.colors.accent;
  const strokeColor = wordColor;

  const wavePath = React.useMemo(() => buildWavePath(horizonW), [horizonW]);

  const inner = (
    <View style={styles.wrap}>
      <Svg width={horizonW} height={12} viewBox={`0 0 ${horizonW} 12`}>
        <Path
          d={wavePath}
          stroke={strokeColor}
          strokeWidth={1}
          fill="none"
          strokeLinecap="round"
        />
        <Circle cx={horizonW / 2} cy={6} r={dotR} fill={accentColor} />
      </Svg>
      <View style={[styles.row, { marginTop: gap }]}>
        <Text
          allowFontScaling={false}
          style={{
            fontFamily:    theme.fontFamilies.serif,
            fontWeight:    '600',
            fontSize:      capPx,
            lineHeight:    capPx,
            letterSpacing: -0.5,
            color:         accentColor,
          }}
        >
          X
        </Text>
        <Text
          allowFontScaling={false}
          style={{
            fontFamily:    theme.fontFamilies.serifItalic,
            fontWeight:    '500',
            fontStyle:     'italic',
            fontSize:      capPx,
            lineHeight:    capPx,
            letterSpacing: -0.5,
            color:         wordColor,
          }}
        >
          Road
        </Text>
      </View>
    </View>
  );

  if (!isPill) {
    return <View testID={testID}>{inner}</View>;
  }

  const pad = PILL_PADDING[size];
  // iOS pulls shadow values from lightTheme.elevation.e2 (same source as the
  // ink shadow token). Android gets a lighter elevation: 4 since the e2 token
  // value (8) over-darkens this chip-sized surface.
  return (
    <View
      testID={testID}
      style={[
        styles.pill,
        {
          backgroundColor: lightTheme.colors.paper,
          paddingTop:      pad.top,
          paddingBottom:   pad.bottom,
          paddingLeft:     pad.h,
          paddingRight:    pad.h,
        },
        Platform.OS === 'android'
          ? { elevation: 4 }
          : lightTheme.elevation.e2,
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
    borderRadius: 999,
    alignSelf:    'flex-start',
  },
});
