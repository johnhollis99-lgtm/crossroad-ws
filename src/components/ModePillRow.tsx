/**
 * Drive | Walk mode selector. Two equal-flex pills in a row.
 *
 * Pine palette:
 *   Active   → primary (emerald) fill + paperSoft icon/label
 *   Inactive → paperWarm fill + ink icon/label + paperEdge border
 *
 * Both pills carry a control-style drop shadow on iOS; Android falls back
 * to a lighter `elevation: 4` since the default token over-darkens these
 * chip-sized surfaces.
 *
 * Visible labels are "Drive" and "Walk" per the Pine spec. Underlying state
 * value space stays `'driving' | 'hiking'` so trip-mode wiring downstream
 * is unaffected — this is a label-only change from the drift-5.93 posture.
 */

import React from 'react';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import Svg, { Circle, Path } from 'react-native-svg';

import { useTheme } from '../design/theme';
import { shadows } from '../design/tokens';

export type ModePillValue = 'driving' | 'hiking';

export interface ModePillRowProps {
  value:    ModePillValue;
  onChange: (next: ModePillValue) => void;
  testID?:  string;
}

interface IconProps {
  color: string;
}

function CarIcon({ color }: IconProps) {
  return (
    <Svg width={18} height={18} viewBox="0 0 24 24" fill="none">
      <Path
        d="M3 12l2-5a2 2 0 012-2h10a2 2 0 012 2l2 5v6H3v-6z"
        stroke={color}
        strokeWidth={1.8}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <Path
        d="M6 12h12"
        stroke={color}
        strokeWidth={1.8}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <Circle cx={7.5}  cy={15.5} r={1} stroke={color} strokeWidth={1.8} />
      <Circle cx={16.5} cy={15.5} r={1} stroke={color} strokeWidth={1.8} />
    </Svg>
  );
}

function WalkerIcon({ color }: IconProps) {
  return (
    <Svg width={18} height={18} viewBox="0 0 24 24" fill="none">
      <Circle cx={13} cy={4} r={1.5} stroke={color} strokeWidth={1.8} />
      <Path
        d="M11 22l2-6 -3-3 1-5 -3 2v3"
        stroke={color}
        strokeWidth={1.8}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <Path
        d="M14 10l2 2 4-1"
        stroke={color}
        strokeWidth={1.8}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <Path
        d="M10 16l-3 6"
        stroke={color}
        strokeWidth={1.8}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
}

const PILL_SHADOW = Platform.OS === 'android'
  ? ({ elevation: 4 } as const)
  : shadows.control;

export function ModePillRow({ value, onChange, testID }: ModePillRowProps) {
  const { theme } = useTheme();
  const driveActive = value === 'driving';
  const hikeActive  = value === 'hiking';

  const activeFg   = theme.colors.paperSoft;
  const activeBg   = theme.colors.primary;
  const inactiveFg = theme.colors.ink;
  const inactiveBg = theme.colors.paperWarm;
  const inactiveBd = theme.colors.paperEdge;

  const driveFg = driveActive ? activeFg : inactiveFg;
  const hikeFg  = hikeActive  ? activeFg : inactiveFg;

  return (
    <View testID={testID} style={styles.row}>
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ selected: driveActive }}
        accessibilityLabel="Drive mode"
        hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
        onPress={() => onChange('driving')}
        style={[
          styles.pill,
          driveActive
            ? { backgroundColor: activeBg,   borderWidth: 0 }
            : { backgroundColor: inactiveBg, borderWidth: 1, borderColor: inactiveBd },
          PILL_SHADOW,
        ]}
      >
        <CarIcon color={driveFg} />
        <Text
          allowFontScaling={false}
          style={[theme.textVariants.label, { color: driveFg }]}
        >
          Drive
        </Text>
      </Pressable>

      <Pressable
        accessibilityRole="button"
        accessibilityState={{ selected: hikeActive }}
        accessibilityLabel="Walk mode"
        hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
        onPress={() => onChange('hiking')}
        style={[
          styles.pill,
          hikeActive
            ? { backgroundColor: activeBg,   borderWidth: 0 }
            : { backgroundColor: inactiveBg, borderWidth: 1, borderColor: inactiveBd },
          PILL_SHADOW,
        ]}
      >
        <WalkerIcon color={hikeFg} />
        <Text
          allowFontScaling={false}
          style={[theme.textVariants.label, { color: hikeFg }]}
        >
          Walk
        </Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    gap:           8,
  },
  pill: {
    flex:              1,
    flexDirection:     'row',
    alignItems:        'center',
    justifyContent:    'center',
    gap:               8,
    paddingVertical:   12,
    paddingHorizontal: 12,
    borderRadius:      999,
  },
});
