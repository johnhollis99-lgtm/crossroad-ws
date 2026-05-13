/**
 * Drive | Hike-or-Walk mode selector. Two equal-flex pills in a row.
 *
 * Colors are LIGHT-THEME CONSTANTS regardless of the active system scheme —
 * the mode pill row is treated as a branded chip, like the Wordmark pill, so
 * it reads identically against any map background in both light and dark
 * mode. Active pill fills with ink-red and shows paper-cream label + icons;
 * inactive pill is a cream chip outlined in ink. Both carry an e2 drop
 * shadow to lift them off map overlays.
 *
 * The visible Hike pill label reads "Hike / Walk" to broaden the mode beyond
 * pure hiking. The underlying state value space stays 'driving' | 'hiking' —
 * this component is a visual/control layer only.
 */

import React from 'react';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import Svg, { Circle, Path } from 'react-native-svg';

import { lightTheme } from '../design/theme';

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

// Both pills carry the same drop shadow. iOS pulls the shadow values from
// lightTheme.elevation.e2 (the canonical token); Android uses elevation: 4
// since the e2 token's elevation: 8 over-darkens these chip-sized surfaces
// (matches the Wordmark pill's Platform-specific override).
const PILL_SHADOW = Platform.OS === 'android'
  ? ({ elevation: 4 } as const)
  : lightTheme.elevation.e2;

export function ModePillRow({ value, onChange, testID }: ModePillRowProps) {
  const driveActive = value === 'driving';
  const hikeActive  = value === 'hiking';

  // All four roles are locked to light-mode constants — the pill row is
  // a branded chip, not a theme-aware surface.
  const activeFg   = lightTheme.colors.paper;
  const activeBg   = lightTheme.colors.accent;
  const inactiveFg = lightTheme.colors.ink;
  const inactiveBg = lightTheme.colors.paper;

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
            : { backgroundColor: inactiveBg, borderWidth: 1, borderColor: inactiveFg },
          PILL_SHADOW,
        ]}
      >
        <CarIcon color={driveFg} />
        <Text
          allowFontScaling={false}
          style={[
            styles.label,
            {
              color:      driveFg,
              fontFamily: lightTheme.fontFamilies.serifItalic,
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
            : { backgroundColor: inactiveBg, borderWidth: 1, borderColor: inactiveFg },
          PILL_SHADOW,
        ]}
      >
        <MountainIcon color={hikeFg} />
        <Text
          allowFontScaling={false}
          style={[
            styles.label,
            {
              color:      hikeFg,
              fontFamily: lightTheme.fontFamilies.serifItalic,
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
