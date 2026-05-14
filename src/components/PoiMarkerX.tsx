/**
 * X-shaped POI marker — Pine serif-X glyph layered over a thin emerald
 * "target" ring with a cream halo (Pine spec section 4 + visual upgrade).
 *
 * Composition (centered in a 40×40 wrapper):
 *   1. Static outer emerald ring (frames the glyph, gives a "target" feel)
 *   2. Bicolor X glyph — emerald fill with a thin cobalt outline (two-color
 *      punch) and a cream halo from the paintOrder="stroke" trick (legible
 *      on every map style — dark, satellite, streets, terrain).
 *
 * Two size variants:
 *   curated — high-relevance corridor / route-curated POIs (larger)
 *   reveal  — viewport-reveal low-relevance POIs (smaller)
 *
 * Always rendered inside a 40×40 wrapper so the hitbox stays comfortable
 * even on the smaller reveal size.
 *
 * Clusterer rule (drift 5.94): react-native-map-clustering's `isMarker`
 * helper reads `child.props.coordinate` directly on JSX children passed
 * to <ClusteredMapView>. Function-component wrappers around <Marker>
 * hide that prop. POI markers MUST be inlined as <Marker> directly under
 * <ClusteredMapView>; <PoiMarkerX> is the child of each.
 */

import React from 'react';
import { StyleSheet, View } from 'react-native';
import Svg, { Circle, Text as SvgText } from 'react-native-svg';

import { useTheme } from '../design/theme';

export type PoiMarkerXSize = 'curated' | 'reveal';

export interface PoiMarkerXProps {
  size?: PoiMarkerXSize;
}

const WRAPPER_PX = 40;

interface GlyphCfg {
  fontSize:    number;
  haloWidth:   number;
  ringRadius:  number;
  ringStroke:  number;
  outlineWidth: number;
}

const GLYPH: Record<PoiMarkerXSize, GlyphCfg> = {
  curated: { fontSize: 20, haloWidth: 3.0, ringRadius: 15, ringStroke: 1.3, outlineWidth: 0.5 },
  reveal:  { fontSize: 14, haloWidth: 2.2, ringRadius: 11, ringStroke: 1.0, outlineWidth: 0.4 },
};

export function PoiMarkerX({ size = 'curated' }: PoiMarkerXProps) {
  const { theme } = useTheme();
  const { fontSize, haloWidth, ringRadius, ringStroke, outlineWidth } = GLYPH[size];
  const center = WRAPPER_PX / 2;

  return (
    <View style={styles.wrap} pointerEvents="none">
      <Svg width={WRAPPER_PX} height={WRAPPER_PX} viewBox={`0 0 ${WRAPPER_PX} ${WRAPPER_PX}`}>
        {/* Outer target ring — emerald, thin, framing the glyph. */}
        <Circle
          cx={center}
          cy={center}
          r={ringRadius}
          stroke={theme.colors.primary}
          strokeWidth={ringStroke}
          fill="none"
          opacity={0.9}
        />
        {/* Halo X — cream stroke renders behind the fill via paintOrder, giving
            the glyph a cream outline that pops on dark maps + edges on light. */}
        <SvgText
          x={center}
          y={center}
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
          paintOrder="stroke"
        >
          X
        </SvgText>
        {/* Outline X — thin cobalt outline ON TOP of the fill for two-color
            punch (subtle but distinguishes the marker from "plain white X"). */}
        <SvgText
          x={center}
          y={center}
          textAnchor="middle"
          dy={fontSize * 0.32}
          fontSize={fontSize}
          fontFamily={theme.fontFamilies.serif}
          fontWeight="700"
          fill="none"
          stroke={theme.colors.secondary}
          strokeWidth={outlineWidth}
          strokeLinejoin="round"
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
