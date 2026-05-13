/**
 * Drive | Hike-or-Walk mode selector. Two equal-flex pills in a row; active
 * pill fills with ink-red and shows paper-cream label + icons (constants so
 * the contrast holds in both light and dark schemes), inactive pill is an
 * outlined chip whose stroke + label follow the active theme's ink color.
 *
 * The visible Hike pill label reads "Hike / Walk" to broaden the mode beyond
 * pure hiking. The underlying state value space stays 'driving' | 'hiking' —
 * this component is a visual/control layer only.
 */

import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Svg, { Circle, Path } from 'react-native-svg';

import { lightTheme, useTheme } from '../design/theme';

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

function MountainIcon({ color }: IconProps) {
  return (
    <Svg width={16} height={16} viewBox="0 0 24 24" fill="none">
      <Path
        d="M3 19l5-9 4 6 3-4 6 7H3z"
        stroke={color}
        strokeWidth={1.8}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
}

function WalkerIcon({ color }: IconProps) {
  return (
    <Svg width={16} height={16} viewBox="0 0 24 24" fill="none">
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

export function ModePillRow({ value, onChange, testID }: ModePillRowProps) {
  const { theme } = useTheme();

  const driveActive = value === 'driving';
  const hikeActive  = value === 'hiking';

  // Active state colors are locked to light-mode paper-cream so the contrast
  // against the ink-red fill is preserved when the system flips to dark mode.
  const activeFg   = lightTheme.colors.paper;
  const activeBg   = theme.colors.accent;
  const inactiveFg = theme.colors.ink;

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
            ? { backgroundColor: activeBg, borderWidth: 0 }
            : { backgroundColor: 'transparent', borderWidth: 1, borderColor: inactiveFg },
        ]}
      >
        <CarIcon color={driveFg} />
        <Text
          allowFontScaling={false}
          style={[
            styles.label,
            {
              color:      driveFg,
              fontFamily: theme.fontFamilies.serifItalic,
              fontWeight: driveActive ? '600' : '500',
            },
          ]}
        >
          Drive
        </Text>
      </Pressable>

      <Pressable
        accessibilityRole="button"
        accessibilityState={{ selected: hikeActive }}
        accessibilityLabel="Hike or walk mode"
        hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
        onPress={() => onChange('hiking')}
        style={[
          styles.pill,
          hikeActive
            ? { backgroundColor: activeBg, borderWidth: 0 }
            : { backgroundColor: 'transparent', borderWidth: 1, borderColor: inactiveFg },
        ]}
      >
        <MountainIcon color={hikeFg} />
        <Text
          allowFontScaling={false}
          style={[
            styles.label,
            {
              color:      hikeFg,
              fontFamily: theme.fontFamilies.serifItalic,
              fontWeight: hikeActive ? '600' : '500',
            },
          ]}
        >
          Hike / Walk
        </Text>
        <WalkerIcon color={hikeFg} />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection:     'row',
    gap:               8,
    paddingHorizontal: 14,
  },
  pill: {
    flex:              1,
    flexDirection:     'row',
    alignItems:        'center',
    justifyContent:    'center',
    gap:               6,
    paddingVertical:   12,
    paddingHorizontal: 12,
    borderRadius:      999,
  },
  label: {
    fontSize:  15,
    fontStyle: 'italic',
  },
});
