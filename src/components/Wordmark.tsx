import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Svg, { Circle, Path } from 'react-native-svg';
import { useTheme } from '../design/theme';

export type WordmarkSize = 'm' | 'l' | 'xl';
export type WordmarkTone = 'ink' | 'paper';

export interface WordmarkProps {
  size?:   WordmarkSize;
  tone?:   WordmarkTone;
  testID?: string;
}

// Cap height (font-size for X / road), horizon width, and center-dot radius
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

export function Wordmark({ size = 'm', tone = 'ink', testID }: WordmarkProps) {
  const { theme } = useTheme();
  const { capPx, horizonW, dotR, gap } = SIZE_MAP[size];

  // Bicolor: X always carries the ink-red accent; "road" + horizon stroke
  // follow `tone` (ink on paper bg, paper on ink bg). Dot is always accent.
  const wordColor   = tone === 'ink' ? theme.colors.ink : theme.colors.paper;
  const accentColor = theme.colors.accent;

  const wavePath = React.useMemo(() => buildWavePath(horizonW), [horizonW]);

  return (
    <View testID={testID} style={styles.wrap}>
      <Svg width={horizonW} height={12} viewBox={`0 0 ${horizonW} 12`}>
        <Path
          d={wavePath}
          stroke={wordColor}
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
          road
        </Text>
      </View>
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
});
