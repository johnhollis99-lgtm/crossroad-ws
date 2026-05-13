/**
 * Floating coordinates pill — displays lat/lng for a map point above its
 * pin. Sibling of MapView, anchored via pointForCoordinate (caller resolves
 * + passes `screenPosition`). Same visual posture as PoiCallout from drift
 * 5.97: cream paper chip locked to light-theme constants regardless of
 * system scheme, e2 shadow.
 *
 * Primary text is JetBrains Mono in the project's `meta`-style ramp:
 * uppercase, 11px, letter-spacing 1.6. Formatted as "35.564°N · 121.094°W"
 * so the coordinate reads at a glance.
 *
 * Optional `sublabel` (Fraunces italic 12px) carries a short prompt or a
 * geocoded address; omit it when there's nothing to say.
 *
 * The pill is informational — no interactive children. The caller renders
 * the confirm / dismiss action menu separately (see app/index.tsx's
 * pin-drop action row).
 */

import React, { useState } from 'react';
import {
  LayoutChangeEvent,
  Platform,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { lightTheme } from '../design/theme';

export interface CoordinatesPillProps {
  coordinate:      { latitude: number; longitude: number };
  screenPosition:  { x: number; y: number };
  sublabel?:       string;
  testID?:         string;
}

const PIN_GAP_PX = 14;

const SHADOW = Platform.OS === 'android'
  ? ({ elevation: 4 } as const)
  : lightTheme.elevation.e2;

function formatCoord(lat: number, lng: number): string {
  const ns = lat >= 0 ? 'N' : 'S';
  const ew = lng >= 0 ? 'E' : 'W';
  return `${Math.abs(lat).toFixed(3)}°${ns} · ${Math.abs(lng).toFixed(3)}°${ew}`;
}

export function CoordinatesPill({
  coordinate, screenPosition, sublabel, testID,
}: CoordinatesPillProps) {
  const [size, setSize] = useState<{ w: number; h: number } | null>(null);

  const onLayout = (e: LayoutChangeEvent) => {
    const { width, height } = e.nativeEvent.layout;
    if (size && size.w === width && size.h === height) return;
    setSize({ w: width, h: height });
  };

  // Pre-layout pass: render off-screen so onLayout captures natural
  // dimensions before positioning.
  const left = size ? screenPosition.x - size.w / 2          : -9999;
  const top  = size ? screenPosition.y - size.h - PIN_GAP_PX : -9999;

  return (
    <View
      testID={testID}
      pointerEvents="box-none"
      style={StyleSheet.absoluteFill}
    >
      <View
        onLayout={onLayout}
        style={[styles.pill, SHADOW, { left, top }]}
      >
        <Text
          allowFontScaling={false}
          style={styles.coords}
          numberOfLines={1}
        >
          {formatCoord(coordinate.latitude, coordinate.longitude)}
        </Text>
        {sublabel ? (
          <Text
            allowFontScaling={false}
            style={styles.sublabel}
            numberOfLines={1}
          >
            {sublabel}
          </Text>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  pill: {
    position:          'absolute',
    backgroundColor:   lightTheme.colors.paper,
    paddingVertical:   8,
    paddingHorizontal: 14,
    borderRadius:      999,
    alignItems:        'center',
    maxWidth:          280,
  },
  coords: {
    fontFamily:    lightTheme.fontFamilies.mono,
    fontWeight:    '400',
    fontSize:      11,
    lineHeight:    15.4,
    letterSpacing: 1.6,
    textTransform: 'uppercase',
    color:         lightTheme.colors.ink,
  },
  sublabel: {
    marginTop:   2,
    fontFamily:  lightTheme.fontFamilies.serifItalic,
    fontStyle:   'italic',
    fontWeight:  '500',
    fontSize:    12,
    lineHeight:  15.6,
    color:       lightTheme.colors.inkSoft,
  },
});
