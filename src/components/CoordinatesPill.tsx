/**
 * Floating coordinates pill — displays lat/lng for a map point above its
 * pin. Sibling of MapView, anchored via pointForCoordinate (caller resolves
 * + passes `screenPosition`).
 *
 * Pine palette: paperWarm chip backing + JetBrains Mono uppercase coord
 * text ("35.564°N · 121.094°W"); optional Fraunces—now Instrument Serif—
 * italic sublabel (geocoded address on web).
 *
 * The pill is informational — no interactive children. The caller renders
 * the confirm / dismiss action menu separately.
 */

import React, { useState } from 'react';
import {
  LayoutChangeEvent,
  Platform,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { useTheme } from '../design/theme';
import { shadows } from '../design/tokens';

export interface CoordinatesPillProps {
  coordinate:      { latitude: number; longitude: number };
  screenPosition:  { x: number; y: number };
  sublabel?:       string;
  testID?:         string;
}

const PIN_GAP_PX = 14;

const PILL_SHADOW = Platform.OS === 'android'
  ? ({ elevation: 4 } as const)
  : shadows.control;

function formatCoord(lat: number, lng: number): string {
  const ns = lat >= 0 ? 'N' : 'S';
  const ew = lng >= 0 ? 'E' : 'W';
  return `${Math.abs(lat).toFixed(3)}°${ns} · ${Math.abs(lng).toFixed(3)}°${ew}`;
}

export function CoordinatesPill({
  coordinate, screenPosition, sublabel, testID,
}: CoordinatesPillProps) {
  const { theme } = useTheme();
  const [size, setSize] = useState<{ w: number; h: number } | null>(null);

  const onLayout = (e: LayoutChangeEvent) => {
    const { width, height } = e.nativeEvent.layout;
    if (size && size.w === width && size.h === height) return;
    setSize({ w: width, h: height });
  };

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
        style={[
          styles.pill,
          PILL_SHADOW,
          {
            backgroundColor: theme.colors.paperWarm,
            borderColor:     theme.colors.paperEdge,
            left,
            top,
          },
        ]}
      >
        <Text
          allowFontScaling={false}
          style={[
            styles.coords,
            {
              fontFamily: theme.fontFamilies.mono,
              color:      theme.colors.ink,
            },
          ]}
          numberOfLines={1}
        >
          {formatCoord(coordinate.latitude, coordinate.longitude)}
        </Text>
        {sublabel ? (
          <Text
            allowFontScaling={false}
            style={[
              theme.textVariants.title,
              {
                color:    theme.colors.inkSoft,
                fontSize: 12,
                lineHeight: 15.6,
                marginTop: 2,
              },
            ]}
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
    paddingVertical:   8,
    paddingHorizontal: 14,
    borderRadius:      999,
    borderWidth:       1,
    alignItems:        'center',
    maxWidth:          280,
  },
  coords: {
    fontWeight:    '400',
    fontSize:      11,
    lineHeight:    15.4,
    letterSpacing: 1.6,
    textTransform: 'uppercase',
  },
});
