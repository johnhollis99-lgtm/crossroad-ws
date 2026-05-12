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

// cap height → font-size and horizon-line width. Wave width is a function of
// cap height so the horizon scales with the wordmark.
const SIZE_MAP: Record<WordmarkSize, { capPx: number; waveW: number; waveGap: number }> = {
  m:  { capPx: 24, waveW:  90, waveGap: 4 },
  l:  { capPx: 40, waveW: 150, waveGap: 6 },
  xl: { capPx: 56, waveW: 210, waveGap: 8 },
};

function buildWavePath(width: number): string {
  // 4 humps across `width`. Path lives in a 6px-high band; y=3 is the
  // baseline. Q control points alternate above/below for the wave.
  const segments = 4;
  const step = width / segments;
  let d = 'M 0 3';
  for (let i = 0; i < segments; i++) {
    const x0 = step * i;
    const x1 = x0 + step;
    const cx = x0 + step / 2;
    const cy = i % 2 === 0 ? 0 : 6;
    d += ` Q ${cx.toFixed(2)} ${cy} ${x1.toFixed(2)} 3`;
  }
  return d;
}

export function Wordmark({ size = 'm', tone = 'ink', testID }: WordmarkProps) {
  const { theme } = useTheme();
  const { capPx, waveW, waveGap } = SIZE_MAP[size];
  const color = tone === 'ink' ? theme.colors.ink : theme.colors.paper;
  const wavePath = React.useMemo(() => buildWavePath(waveW), [waveW]);

  return (
    <View testID={testID} style={styles.wrap}>
      <Svg width={waveW} height={6} viewBox={`0 0 ${waveW} 6`}>
        <Path d={wavePath} stroke={color} strokeWidth={1} fill="none" strokeLinecap="round" />
        <Circle cx={waveW / 2} cy={3} r={1.5} fill={color} />
      </Svg>
      {/* The fontSize literals here (capPx = 24 | 40 | 56) are structural
          brand-mark dimensions driven by the `size` prop, not typographic
          variants. This is the one intentional exception to "no fontSize
          literals outside textVariants" in the component library. */}
      <View style={[styles.row, { marginTop: waveGap }]}>
        <Text
          style={{
            fontFamily:    theme.fontFamilies.serif,
            fontWeight:    '600',
            fontSize:      capPx,
            lineHeight:    capPx,
            color,
          }}
        >
          X
        </Text>
        <Text
          style={{
            fontFamily:    theme.fontFamilies.serifItalic,
            fontWeight:    '500',
            fontStyle:     'italic',
            fontSize:      capPx,
            lineHeight:    capPx,
            color,
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
