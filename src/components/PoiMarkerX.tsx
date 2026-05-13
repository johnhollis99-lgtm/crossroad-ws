/**
 * X-shaped POI marker — visual primitive only, NOT a react-native-maps
 * Marker. The caller wraps it in a <Marker> with the coordinate + onPress,
 * and this component renders the X glyph as the Marker's child.
 *
 * Two sizes:
 *   curated — high-relevance corridor / route-curated POIs (larger X)
 *   reveal  — viewport-reveal low-relevance POIs (smaller X)
 *
 * Always rendered inside a 32×32 invisible View so the hitbox stays
 * comfortable even on the smaller reveal size. The X glyph is centered
 * within the wrapper and pulls its color from lightTheme.colors.accent
 * (ink-red, locked to light-mode constant — does not theme-flip; the X is
 * a branded element echoing the Wordmark glyph).
 *
 * tracksViewChanges discipline: when the Marker on the caller's side wraps
 * a custom View child, react-native-maps captures a bitmap. Toggling
 * tracksViewChanges from true → false after the first render rasterizes
 * the SVG once then stops re-snapshotting on every prop change. This
 * component exposes a `tracking` state via the `useMarkerTracking` hook
 * so the parent Marker can wire it directly.
 */

import React from 'react';
import { StyleSheet, View } from 'react-native';
import Svg, { Line } from 'react-native-svg';

import { lightTheme } from '../design/theme';

export type PoiMarkerXSize = 'curated' | 'reveal';

export interface PoiMarkerXProps {
  size?: PoiMarkerXSize;
}

const WRAPPER_PX = 32;

// X glyph extents inside the 32-wrapper:
//   curated → glyph 18×18, drawn from 7→25 on both axes
//   reveal  → glyph 12×12, drawn from 10→22 on both axes
const GLYPH: Record<PoiMarkerXSize, { x1: number; x2: number; stroke: number }> = {
  curated: { x1: 7,  x2: 25, stroke: 2.5 },
  reveal:  { x1: 10, x2: 22, stroke: 1.8 },
};

export function PoiMarkerX({ size = 'curated' }: PoiMarkerXProps) {
  const { x1, x2, stroke } = GLYPH[size];
  const accent = lightTheme.colors.accent;

  return (
    <View style={styles.wrap} pointerEvents="none">
      <Svg width={WRAPPER_PX} height={WRAPPER_PX} viewBox={`0 0 ${WRAPPER_PX} ${WRAPPER_PX}`}>
        <Line
          x1={x1} y1={x1} x2={x2} y2={x2}
          stroke={accent}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <Line
          x1={x2} y1={x1} x2={x1} y2={x2}
          stroke={accent}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </Svg>
    </View>
  );
}

/**
 * Hook for the Marker-side tracksViewChanges discipline. Starts true so the
 * first frame rasterizes the SVG child; flips to false after 1s to stop the
 * native re-snapshot churn. Same pattern as the existing ClusterMarker.
 *
 * Usage at the call site (inside the parent screen):
 *
 *   const tracking = usePoiMarkerTracking();
 *   return (
 *     <Marker coordinate={...} tracksViewChanges={tracking} onPress={...}>
 *       <PoiMarkerX size="curated" />
 *     </Marker>
 *   );
 */
export function usePoiMarkerTracking(): boolean {
  const [tracking, setTracking] = React.useState(true);
  React.useEffect(() => {
    const t = setTimeout(() => setTracking(false), 1000);
    return () => clearTimeout(t);
  }, []);
  return tracking;
}

const styles = StyleSheet.create({
  wrap: {
    width:          WRAPPER_PX,
    height:         WRAPPER_PX,
    alignItems:     'center',
    justifyContent: 'center',
  },
});
