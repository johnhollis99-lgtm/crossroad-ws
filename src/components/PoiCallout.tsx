/**
 * Floating POI callout — appears above a tapped X marker on home. Rendered
 * as a SIBLING of MapView (never a child Marker / Callout) to bypass
 * react-native-map-clustering's interception of the built-in Callout tap
 * flow (drift 5.97).
 *
 * The parent captures the marker's screen coordinate via
 * `mapRef.current.pointForCoordinate(...)`, stashes it in state, and renders
 * <PoiCallout poi={...} screenPosition={...} onDismiss={...} />. Dismissal
 * is the parent's responsibility — wire onPress / onRegionChangeComplete on
 * MapView to call setSelectedPoi(null).
 *
 * Visual: cream paper pill, ink-italic POI name, optional miles sublabel.
 * Colors are LIGHT-THEME CONSTANTS regardless of the active scheme — the
 * callout is a branded chip, same posture as the Wordmark pill + ModePillRow
 * (always cream-on-map). Centers horizontally over the marker; sits 12px
 * above the pin to clear the X glyph.
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

const SHADOW = Platform.OS === 'android'
  ? ({ elevation: 4 } as const)
  : lightTheme.elevation.e2;

export function PoiCallout({ poi, screenPosition, testID }: PoiCalloutProps) {
  const [size, setSize] = useState<{ w: number; h: number } | null>(null);

  const onLayout = (e: LayoutChangeEvent) => {
    const { width, height } = e.nativeEvent.layout;
    if (size && size.w === width && size.h === height) return;
    setSize({ w: width, h: height });
  };

  // Pre-layout pass: render off-screen so onLayout captures the natural
  // dimensions before we position. Once size is known, anchor the pill
  // horizontally over the marker and 12px above the pin.
  const left = size ? screenPosition.x - size.w / 2     : -9999;
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
        style={[styles.pill, SHADOW, { left, top }]}
      >
        <Text
          allowFontScaling={false}
          style={styles.name}
          numberOfLines={1}
        >
          {poi.name}
        </Text>
        {miles && (
          <Text
            allowFontScaling={false}
            style={styles.sublabel}
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
    backgroundColor:   lightTheme.colors.paper,
    paddingVertical:   8,
    paddingHorizontal: 14,
    borderRadius:      999,
    alignItems:        'center',
    maxWidth:          260,
  },
  name: {
    fontFamily: lightTheme.fontFamilies.serifItalic,
    fontStyle:  'italic',
    fontWeight: '500',
    fontSize:   15,
    color:      lightTheme.colors.ink,
  },
  sublabel: {
    marginTop:     2,
    fontFamily:    lightTheme.fontFamilies.mono,
    fontWeight:    '400',
    fontSize:      9,
    lineHeight:    12.6,
    letterSpacing: 1.6,
    textTransform: 'uppercase',
    color:         lightTheme.colors.inkSoft,
  },
});
