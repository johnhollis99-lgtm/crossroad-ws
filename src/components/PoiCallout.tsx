/**
 * Floating POI callout — appears above a tapped X marker on home. Rendered
 * as a SIBLING of MapView (never a child Marker / Callout) to bypass
 * react-native-map-clustering's interception of the built-in Callout tap
 * flow (drift 5.97).
 *
 * Pine palette: paperWarm chip backing, italic-serif POI name, mono uppercase
 * miles sublabel. Centered horizontally over the marker; sits 12px above the
 * pin to clear the X glyph.
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

export interface PoiCalloutPoi {
  id:          string;
  name:        string;
  lat:         number;
  lng:         number;
  distance_m?: number;
}

export interface PoiCalloutProps {
  poi:            PoiCalloutPoi;
  screenPosition: { x: number; y: number };
  onDismiss?:     () => void;
  testID?:        string;
}

const PIN_GAP_PX = 12;

const CALLOUT_SHADOW = Platform.OS === 'android'
  ? ({ elevation: 4 } as const)
  : shadows.control;

export function PoiCallout({ poi, screenPosition, testID }: PoiCalloutProps) {
  const { theme } = useTheme();
  const [size, setSize] = useState<{ w: number; h: number } | null>(null);

  const onLayout = (e: LayoutChangeEvent) => {
    const { width, height } = e.nativeEvent.layout;
    if (size && size.w === width && size.h === height) return;
    setSize({ w: width, h: height });
  };

  // Pre-layout pass: render off-screen so onLayout captures the natural
  // dimensions before we position. Once size is known, anchor the pill
  // horizontally over the marker and 12px above the pin.
  const left = size ? screenPosition.x - size.w / 2          : -9999;
  const top  = size ? screenPosition.y - size.h - PIN_GAP_PX : -9999;

  const miles = typeof poi.distance_m === 'number'
    ? `${(poi.distance_m / 1609).toFixed(1)} MI`
    : null;

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
          CALLOUT_SHADOW,
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
          style={[theme.textVariants.title, { color: theme.colors.ink, fontSize: 16, lineHeight: 19 }]}
          numberOfLines={1}
        >
          {poi.name}
        </Text>
        {miles && (
          <Text
            allowFontScaling={false}
            style={[theme.textVariants.eyebrow, { color: theme.colors.inkSoft, marginTop: 2 }]}
            numberOfLines={1}
          >
            {miles}
          </Text>
        )}
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
    maxWidth:          260,
  },
});
