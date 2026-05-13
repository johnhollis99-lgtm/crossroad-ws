/**
 * LabeledSlider — Pine spec section 3.
 *
 * Header row: eyebrow label on the left, large primary value on the right.
 * Track: 4px paperWarm, primary fill to the value %.
 * Thumb:  22×22, paper bg, 2px primary border, control shadow.
 * Min/max labels below in meta inkSoft.
 *
 * Range / step / value formatting are all configurable. Used for Min
 * relevance (0–100), POI distance (0–20 mi), and Story corridor (0–20 mi).
 */

import React, { useRef } from 'react';
import {
  LayoutChangeEvent,
  PanResponder,
  Platform,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useTheme } from '../design/theme';
import { shadows } from '../design/tokens';

export interface LabeledSliderProps {
  label:        string;
  value:        number;
  onChange:     (v: number) => void;
  min:          number;
  max:          number;
  step?:        number;
  /** Optional formatter for the big value readout — defaults to integer string. */
  formatValue?: (v: number) => string;
  /** Optional formatter for the min/max edge labels — defaults to integer string. */
  formatEdge?:  (v: number) => string;
  testID?:      string;
}

const THUMB_SHADOW = Platform.OS === 'android'
  ? ({ elevation: 3 } as const)
  : shadows.control;

export function LabeledSlider({
  label,
  value,
  onChange,
  min,
  max,
  step = 1,
  formatValue,
  formatEdge,
  testID,
}: LabeledSliderProps) {
  const { theme } = useTheme();
  const trackWidth = useRef(0);
  const maxRef = useRef(max);
  const minRef = useRef(min);
  maxRef.current = max;
  minRef.current = min;

  const pct = max > min ? (value - min) / (max - min) : 0;

  const pan = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder:  () => true,
      onPanResponderGrant: (e) => snap(e.nativeEvent.locationX),
      onPanResponderMove:  (e) => snap(e.nativeEvent.locationX),
    }),
  ).current;

  function snap(x: number) {
    const ratio = Math.max(0, Math.min(1, x / (trackWidth.current || 1)));
    const raw = minRef.current + ratio * (maxRef.current - minRef.current);
    const snapped = step > 0 ? Math.round(raw / step) * step : raw;
    onChange(snapped);
  }

  const valueText = formatValue ? formatValue(value) : String(Math.round(value));
  const minText   = formatEdge  ? formatEdge(min)    : String(min);
  const maxText   = formatEdge  ? formatEdge(max)    : String(max);

  return (
    <View testID={testID}>
      <View style={styles.header}>
        <Text style={[theme.textVariants.eyebrow, { color: theme.colors.inkSoft }]}>
          {label}
        </Text>
        <Text
          allowFontScaling={false}
          style={{
            fontFamily: theme.fontFamilies.sans,
            fontWeight: '700',
            fontSize:   20,
            lineHeight: 24,
            color:      theme.colors.primary,
          }}
        >
          {valueText}
        </Text>
      </View>
      <View
        style={styles.trackWrap}
        onLayout={(e: LayoutChangeEvent) => { trackWidth.current = e.nativeEvent.layout.width; }}
        {...pan.panHandlers}
        hitSlop={{ top: 16, bottom: 16 }}
      >
        <View style={[styles.track, { backgroundColor: theme.colors.paperWarm }]} />
        <View
          style={[
            styles.fill,
            { backgroundColor: theme.colors.primary, width: `${pct * 100}%` as any },
          ]}
        />
        <View
          style={[
            styles.thumb,
            THUMB_SHADOW,
            {
              left:            `${pct * 100}%` as any,
              backgroundColor: theme.colors.paper,
              borderColor:     theme.colors.primary,
            },
          ]}
        />
      </View>
      <View style={styles.edgeRow}>
        <Text style={[theme.textVariants.meta, { color: theme.colors.inkSoft, fontSize: 11 }]}>
          {minText}
        </Text>
        <Text style={[theme.textVariants.meta, { color: theme.colors.inkSoft, fontSize: 11 }]}>
          {maxText}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection:  'row',
    justifyContent: 'space-between',
    alignItems:     'baseline',
    marginBottom:   10,
  },
  trackWrap: {
    height:         22,
    justifyContent: 'center',
    position:       'relative',
  },
  track: {
    height:       4,
    borderRadius: 2,
    width:        '100%',
  },
  fill: {
    position:     'absolute',
    height:       4,
    borderRadius: 2,
    left:         0,
  },
  thumb: {
    position:     'absolute',
    width:        22,
    height:       22,
    borderRadius: 11,
    borderWidth:  2,
    marginLeft:   -11,
    top:          0,
  },
  edgeRow: {
    flexDirection:  'row',
    justifyContent: 'space-between',
    marginTop:      6,
  },
});
