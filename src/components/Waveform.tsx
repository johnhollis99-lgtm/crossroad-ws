import React from 'react';
import { View } from 'react-native';
import Svg, { Rect } from 'react-native-svg';
import { useTheme } from '../design/theme';

export interface WaveformProps {
  /** 0..1 progress along the waveform. */
  progress: number;
  bars?:    number;
  height?:  number;
  /** Deterministic seed (POI id, narration id, etc.) — same seed yields identical bar heights every render. */
  seed?:    string;
  testID?:  string;
}

// FNV-1a 32-bit hash. Stable across platforms; no Math.random dependency.
function hashSeed(s: string): number {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h >>> 0;
}

function barHeightAt(seed: string, index: number, min: number, max: number): number {
  const h = hashSeed(`${seed}|${index}`);
  const range = max - min;
  return min + (h % range);
}

export function Waveform({
  progress,
  bars = 30,
  height = 14,
  seed = 'xroad',
  testID,
}: WaveformProps) {
  const { theme } = useTheme();
  const clamped = Math.max(0, Math.min(1, progress));
  const playedCount = Math.round(clamped * bars);

  const barWidth = 2;
  const gap = 2;
  const totalWidth = bars * barWidth + (bars - 1) * gap;
  const minBar = 4;

  return (
    <View testID={testID}>
      <Svg width={totalWidth} height={height}>
        {Array.from({ length: bars }, (_, i) => {
          const h = barHeightAt(seed, i, minBar, height);
          const x = i * (barWidth + gap);
          const y = (height - h) / 2;
          const fill = i < playedCount ? theme.colors.primary : theme.colors.line;
          return (
            <Rect
              key={i}
              x={x}
              y={y}
              width={barWidth}
              height={h}
              fill={fill}
              rx={1}
              ry={1}
            />
          );
        })}
      </Svg>
    </View>
  );
}
