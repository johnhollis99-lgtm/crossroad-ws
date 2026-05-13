/**
 * X-shaped POI marker — Pine serif-X glyph via SVG <Text> with the
 * paintOrder="stroke" halo trick (Pine spec section 4). NOT a Marker —
 * the caller wraps it in a <Marker> with the coordinate + onPress and
 * this component renders the X glyph as the Marker's child.
 *
 * Two sizes:
 *   curated — high-relevance corridor / route-curated POIs (larger X)
 *   reveal  — viewport-reveal low-relevance POIs (smaller X)
 *
 * Always rendered inside a 32×32 invisible View so the hitbox stays
 * comfortable on the smaller reveal size. Fill is `theme.colors.primary`
 * (emerald — same brand mark used on the Wordmark X). Halo is paperSoft
 * via the paintOrder stroke trick: the stroke renders behind the fill,
 * creating a soft ring that keeps the glyph legible on any map color.
 *
 * tracksViewChanges discipline: when a Marker wraps a custom View child,
 * react-native-maps captures a bitmap. `usePoiMarkerTracking()` starts
 * true so the first frame rasterizes the SVG once then flips to false
 * after 1s to stop the native re-snapshot churn.
 *
 * Clusterer rule (drift 5.94): react-native-map-clustering's `isMarker`
 * helper reads `child.props.coordinate` directly on JSX children passed
 * to <ClusteredMapView>. Function-component wrappers around <Marker>
 * hide that prop. POI markers MUST be inlined as <Marker> directly under
 * <ClusteredMapView>; <PoiMarkerX> is the child of each.
 */

import React from 'react';
import { StyleSheet, View } from 'react-native';
import Svg, { Text as SvgText } from 'react-native-svg';

import { useTheme } from '../design/theme';

export type PoiMarkerXSize = 'curated' | 'reveal';

export interface PoiMarkerXProps {
  size?: PoiMarkerXSize;
}

const WRAPPER_PX = 32;

// Halo color is `ink` (cream), NOT `paperSoft` (near-black per Pine spec
// section 4). The spec assumed lighter map tiles (streets / satellite) where
// a dark halo separates the emerald X. On Pine's dark map style the dark
// halo disappears into the tile. Cream halo keeps the marker visible on
// every map style — high contrast on dark, subtle edge on light.
const GLYPH: Record<PoiMarkerXSize, { fontSize: number; haloWidth: number }> = {
  curated: { fontSize: 18, haloWidth: 2.8 },
  reveal:  { fontSize: 12, haloWidth: 2.0 },
};

export function PoiMarkerX({ size = 'curated' }: PoiMarkerXProps) {
  const { theme } = useTheme();
  const { fontSize, haloWidth } = GLYPH[size];

  return (
    <View style={styles.wrap} pointerEvents="none">
      <Svg width={WRAPPER_PX} height={WRAPPER_PX} viewBox={`0 0 ${WRAPPER_PX} ${WRAPPER_PX}`}>
        <SvgText
          x={WRAPPER_PX / 2}
          y={WRAPPER_PX / 2}
          textAnchor="middle"
          dy={fontSize * 0.32}
          fontSize={fontSize}
          fontFamily={theme.fontFamilies.serif}
          fontWeight="700"
          fill={theme.colors.primary}
          stroke={theme.colors.ink}
          strokeWidth={haloWidth}
          strokeLinejoin="round"
          // @ts-expect-error react-native-svg supports paintOrder at runtime
          // but its TS types omit the attribute; rendering still respects it.
          paintOrder="stroke"
        >
          X
        </SvgText>
      </Svg>
    </View>
  );
}

/**
 * Hook for the Marker-side tracksViewChanges discipline. Starts true so the
 * first frame rasterizes the SVG child; flips to false after 1s to stop the
 * native re-snapshot churn.
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
