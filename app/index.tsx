/**
 * RoadStory — Map screen (entry point)
 *
 * Full-screen map with floating top search pills and dark bottom sheet.
 * Navigates to: customize (with selected route data as JSON params)
 *
 * Nav params are JSON strings; no native modules beyond react-native-maps + expo-location.
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Animated,
  Dimensions,
  Keyboard,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  useWindowDimensions,
  View,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import MapView, { Marker, Polyline, PROVIDER_GOOGLE } from 'react-native-maps';
import ClusteredMapView from 'react-native-map-clustering';
import Svg, {
  Circle as SvgCircle,
  Path as SvgPath,
  Rect as SvgRect,
  Text as SvgText,
} from 'react-native-svg';
import * as Location from 'expo-location';
import { useNavigation } from '@react-navigation/native';
import {
  countPOIsAlongRoute,
  getPOIsAlongRoute,
  getNearbyPOIs,
  getRecentLocations,
  saveRecentLocation,
} from '../lib/supabase';
import type { POI, RecentLocation } from '../lib/supabase';
import { useTheme } from '../src/design/theme';
import { computeBadges, computeRouteTags } from '../lib/routeBadges';
import { useSheetSnap, type SnapPoints } from '../hooks/useSheetSnap';
import { MapStyleId, MAP_STYLES, loadMapStyle, saveMapStyle } from '../lib/mapStyle';
import { MapStylePicker } from '../components/MapStylePicker';
import {
  CoordinatesPill,
  ModePillRow,
  PoiCallout,
  PoiMarkerX,
  Wordmark,
} from '../src/components';
import { useTripStore } from '../src/store/tripStore';
import { curateRoutePOIs } from '../src/lib/curation/curateRoutePOIs';

// ── Route line colors per map style ──────────────────────────────────────────
const ROUTE_COLOR: Record<string, string> = {
  dark:      'rgba(56,139,253,0.92)',   // bright blue on dark streets
  satellite: 'rgba(255,220,40,0.95)',   // yellow on satellite imagery
  topo:      'rgba(255,80,50,0.95)',    // red-orange on terrain
  standard:  'rgba(20,90,210,0.92)',    // deep blue on light map
};
const ROUTE_ALT_COLOR: Record<string, string> = {
  dark:      'rgba(80,130,220,0.30)',
  satellite: 'rgba(255,220,40,0.28)',
  topo:      'rgba(255,80,50,0.28)',
  standard:  'rgba(20,90,210,0.28)',
};

// ── Category slug mapping ─────────────────────────────────────────────────────
// UI labels ≠ DB slugs. Home's `selectedCategories` (Zustand) is set by the
// customize screen's chip grid; home consumes the same state to filter its
// route-POI overlay and `get_corridor_pois` RPC params. The chip rail
// previously rendered at the top of the home screen was removed — customize
// is now the sole UI for category selection app-wide.
const CAT_SLUG: Record<string,string> = {
  History:'history', Nature:'nature', Architecture:'architecture',
  Food:'food_drink', Music:'local_culture', Weird:'hidden_gems',
  Roadside:'local_culture', Film:'art', Science:'geology',
};

// ── Config ────────────────────────────────────────────────────────────────────

const MAPS_KEY     = process.env.EXPO_PUBLIC_GOOGLE_MAPS_KEY!;
const MAPBOX_TOKEN = process.env.EXPO_PUBLIC_MAPBOX_TOKEN!;

const { height: SCREEN_H } = Dimensions.get('window');
const DESKTOP_BP = 768;

const INITIAL_REGION = { latitude: 34.18, longitude: -118.33, latitudeDelta: 0.12, longitudeDelta: 0.12 };

// Browse-mode POI fetch: zoom-aware radius, debounced. Radius derived from
// the larger of latitudeDelta/longitudeDelta (each ° ≈ 111 km at the
// equator; longitude scales by cos(lat) but max-delta dominates anyway).
// 1000 km ceiling lets state-wide views actually fetch state-wide data.
const BROWSE_FETCH_DEBOUNCE_MS = 250;
const BROWSE_MAX_RADIUS_M = 1_000_000;
const BROWSE_MAX_RESULTS  = 500;
const SNAP_PTS = {
  peek:     Math.round(SCREEN_H * 0.18),
  default:  Math.round(SCREEN_H * 0.38),
  expanded: Math.round(SCREEN_H * 0.85),
};

// ── Types ─────────────────────────────────────────────────────────────────────

interface RouteOption {
  index: number;
  distanceMi: number;
  durationMin: number;
  summary: string;
  polylineCoords: { latitude: number; longitude: number }[];
  destLat: number;
  destLng: number;
  poiCount: number | null;
}

interface Waypoint {
  text: string;
  coords?: { latitude: number; longitude: number };
}

type Suggestion = {
  description: string;
  place_id: string;
  coords?: { latitude: number; longitude: number };
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function decodePolyline(encoded: string): { latitude: number; longitude: number }[] {
  const pts: { latitude: number; longitude: number }[] = [];
  let idx = 0, lat = 0, lng = 0;
  while (idx < encoded.length) {
    let b, shift = 0, result = 0;
    do { b = encoded.charCodeAt(idx++) - 63; result |= (b & 0x1f) << shift; shift += 5; } while (b >= 0x20);
    lat += result & 1 ? ~(result >> 1) : result >> 1;
    shift = 0; result = 0;
    do { b = encoded.charCodeAt(idx++) - 63; result |= (b & 0x1f) << shift; shift += 5; } while (b >= 0x20);
    lng += result & 1 ? ~(result >> 1) : result >> 1;
    pts.push({ latitude: lat / 1e5, longitude: lng / 1e5 });
  }
  return pts;
}

// ── POI marker integration with react-native-map-clustering ──────────────────
// The clusterer's `isMarker()` helper (node_modules/react-native-map-clustering/
// lib/helpers.js:6) tests `child.props.coordinate` on the direct JSX child of
// <ClusteredMapView>. Function-component wrappers around <Marker> hide that
// prop from React.Children.toArray and the clusterer silently drops them.
//
// So POI markers below are inlined as <Marker> elements directly under
// <ClusteredMapView>, with <PoiMarkerX> as the visual child. A single shared
// `initialTracking` state in MapScreen drives the tracksViewChanges flip for
// every POI marker at once (start true so the native bitmap snapshot picks
// up the SVG child after rasterization, flip false at 1s to bound
// re-snapshot cost when many markers are on screen). One timer for all
// markers is simpler and sufficient — the clusterer needs the first frame
// to register positions, not per-marker isolation.

// ── Cluster marker (drift 5.72 / C1, sub-drift PNG path) ─────────────────────
// Cluster marker — rasterized PNG via react-native-svg toDataURL().
//
// History: we iterated four View-based compositions (pin, View-pill, SVG-pill
// inline, StyleSheet+fixed-dims pin) and all four reproduced the same
// quarter-circle / sliver clipping on Android. The bug is below the React
// View layer in react-native-maps' native Marker.captureView() — we can't
// reach it from JS-land styling. Pivoting to <Marker image={{ uri }}/> with
// a client-rasterized PNG bypasses captureView entirely: the native side
// receives a static bitmap, no React subtree to capture, no race.
//
// Architecture:
//   1. Module-level cache (clusterPngCache) keyed by count → data: URI.
//      Outlives MapScreen lifecycle so navigating away doesn't lose
//      pre-warm. LRU cap 500.
//   2. ClusterPngRasterizer — one hidden <Svg ref> positioned off-screen
//      that takes turns rendering each requested count, calls toDataURL
//      after a two-RAF layout settle, and notifies listeners.
//   3. useClusterPng(count) hook — returns cached URI or null. Subscribes
//      to cache updates so the marker re-renders when its PNG arrives.
//   4. preWarmClusterPngs — pre-rasterizes counts 5-50 on mount.
//
// Tradeoff (documented in the arc that led here): cluster animation is
// lost. The previous pulsing emerald glow becomes a static layer at
// opacity 0.30 (midpoint of the 0.18-0.42 pulse range). Acceptable per
// the cluster bug arc — correctness over kinetics.
//
// Marker anchor: { x: 0.5, y: 0.92 } preserved exactly — same on-screen
// pixel position as the pre-PNG pin so cluster screen positions are
// bit-stable across the migration.

// ── PNG cache + listeners (module scope) ──────────────────────────────
const CLUSTER_LRU_CAP = 500;
const clusterPngCache    = new Map<number, string>();   // count → data: URI
const clusterPngLruTouch = new Map<number, number>();   // count → last-access ms
const clusterPngListeners = new Set<() => void>();

function touchClusterPng(count: number): void {
  clusterPngLruTouch.set(count, Date.now());
}

function evictClusterPngIfNeeded(): void {
  if (clusterPngCache.size <= CLUSTER_LRU_CAP) return;
  let oldestCount: number | null = null;
  let oldestTime = Infinity;
  clusterPngLruTouch.forEach((time, c) => {
    if (time < oldestTime) { oldestTime = time; oldestCount = c; }
  });
  if (oldestCount !== null) {
    clusterPngCache.delete(oldestCount);
    clusterPngLruTouch.delete(oldestCount);
  }
}

// rasterizeClusterPng is set by ClusterPngRasterizer on mount. Null when
// no rasterizer is mounted (e.g. MapScreen not currently mounted).
let rasterizeClusterPng: ((count: number) => Promise<string>) | null = null;

// ── Cluster PNG SVG composition ──────────────────────────────────────
// Pin shape rendered as static SVG: paperSoft halo + static emerald glow +
// emerald pill head + paperSoft hairline border + paperSoft inner highlight
// + mono count text + downward triangle pointer. Bit-for-bit visual parity
// with the pre-PNG pin, minus the glow's opacity pulse.
const CLUSTER_PNG_W = 80;
const CLUSTER_PNG_H = 71;   // matches old wrapperH so anchor (0.5, 0.92) lands at same px
const CLUSTER_HEAD_H_PX = 62;
const CLUSTER_PILL_H = 46;
const CLUSTER_PILL_Y = (CLUSTER_HEAD_H_PX - CLUSTER_PILL_H) / 2;  // = 8

function ClusterPngSvg({
  count, primary, paperSoft, paper, fontFamily, svgRef,
}: {
  count:      number;
  primary:    string;
  paperSoft:  string;
  paper:      string;
  fontFamily: string;
  svgRef:     React.Ref<any>;
}) {
  const digits    = String(count).length;
  const FONT_SZ   = digits >= 6 ? 12 : digits >= 4 ? 13 : 14;
  const CHAR_W    = FONT_SZ * 0.62;
  const textWidth = Math.ceil(digits * CHAR_W);
  const PILL_MIN_W = 46;
  const pillWidth  = Math.max(PILL_MIN_W, textWidth + 36);
  const pillX      = (CLUSTER_PNG_W - pillWidth) / 2;
  const cx         = CLUSTER_PNG_W / 2;
  const cy         = CLUSTER_PILL_Y + CLUSTER_PILL_H / 2;  // pill vertical center

  return (
    <Svg
      ref={svgRef}
      width={CLUSTER_PNG_W}
      height={CLUSTER_PNG_H}
      viewBox={`0 0 ${CLUSTER_PNG_W} ${CLUSTER_PNG_H}`}
    >
      {/* Halo — paperSoft, full canvas width, low opacity. */}
      <SvgRect
        x={0}
        y={0}
        width={CLUSTER_PNG_W}
        height={CLUSTER_HEAD_H_PX}
        rx={CLUSTER_HEAD_H_PX / 2}
        ry={CLUSTER_HEAD_H_PX / 2}
        fill={paperSoft}
        opacity={0.22}
      />
      {/* Static glow — primary, same shape, midpoint opacity of the
          retired 0.18-0.42 pulse. */}
      <SvgRect
        x={0}
        y={0}
        width={CLUSTER_PNG_W}
        height={CLUSTER_HEAD_H_PX}
        rx={CLUSTER_HEAD_H_PX / 2}
        ry={CLUSTER_HEAD_H_PX / 2}
        fill={primary}
        opacity={0.30}
      />
      {/* Pill head. */}
      <SvgRect
        x={pillX}
        y={CLUSTER_PILL_Y}
        width={pillWidth}
        height={CLUSTER_PILL_H}
        rx={CLUSTER_PILL_H / 2}
        ry={CLUSTER_PILL_H / 2}
        fill={primary}
        stroke={paperSoft}
        strokeWidth={0.5}
      />
      {/* Top-left highlight — paperSoft ellipse for the 3D feel. */}
      <SvgCircle
        cx={pillX + 20}
        cy={CLUSTER_PILL_Y + 8}
        r={4}
        fill={paperSoft}
        opacity={0.28}
      />
      {/* Count digits — mono, paper-cream, centered. */}
      <SvgText
        x={cx}
        y={cy}
        textAnchor="middle"
        dy={FONT_SZ * 0.34}
        fontSize={FONT_SZ}
        fontFamily={fontFamily}
        fontWeight="700"
        fill={paper}
      >
        {count}
      </SvgText>
      {/* Triangle pointer — base at y=59 (overlaps head by 3px), apex at
          y=71 (canvas bottom). Half-width 8. Anchor (0.5, 0.92) lands the
          GPS coord ~5.7px above the apex, matching the pre-PNG pin's
          on-screen position bit-for-bit. */}
      <SvgPath
        d={`M ${cx - 8} 59 L ${cx + 8} 59 L ${cx} 71 Z`}
        fill={primary}
      />
    </Svg>
  );
}

// ── Cluster PNG rasterizer ────────────────────────────────────────────
// One hidden <Svg> takes turns rendering each requested count, calls
// toDataURL after a two-RAF layout settle, caches the result, and
// advances the queue. Mounts as a sibling of the MapView inside the
// MapScreen root View.
function ClusterPngRasterizer() {
  const { theme } = useTheme();
  const svgRef    = useRef<any>(null);
  const [currentCount, setCurrentCount] = useState<number | null>(null);
  const queueRef    = useRef<{ count: number; resolve: (uri: string) => void }[]>([]);
  const busyRef     = useRef(false);
  const currentResolveRef = useRef<((uri: string) => void) | null>(null);

  const processNext = useCallback(() => {
    const item = queueRef.current.shift();
    if (!item) { busyRef.current = false; setCurrentCount(null); return; }
    busyRef.current = true;
    currentResolveRef.current = item.resolve;
    setCurrentCount(item.count);
  }, []);

  // After the SVG renders (post-commit), wait two RAFs for native layout,
  // then call toDataURL. Two RAFs is the empirically-safe pattern for
  // react-native-svg + Android.
  useEffect(() => {
    if (currentCount === null) return;
    const count = currentCount;
    let cancelled = false;
    const t1 = requestAnimationFrame(() => {
      const t2 = requestAnimationFrame(() => {
        if (cancelled || !svgRef.current) { processNext(); return; }
        try {
          svgRef.current.toDataURL((base64: string) => {
            if (cancelled) return;
            const uri = `data:image/png;base64,${base64}`;
            clusterPngCache.set(count, uri);
            touchClusterPng(count);
            evictClusterPngIfNeeded();
            const resolve = currentResolveRef.current;
            currentResolveRef.current = null;
            resolve?.(uri);
            clusterPngListeners.forEach(fn => fn());
            processNext();
          });
        } catch (err) {
          if (__DEV__) console.warn('[cluster] rasterize:fail', { count, err });
          processNext();
        }
      });
      return () => cancelAnimationFrame(t2);
    });
    return () => { cancelled = true; cancelAnimationFrame(t1); };
  }, [currentCount, processNext]);

  // Expose the rasterize function via module-level slot while mounted.
  useEffect(() => {
    rasterizeClusterPng = (count: number) => new Promise<string>((resolve) => {
      const cached = clusterPngCache.get(count);
      if (cached) { touchClusterPng(count); resolve(cached); return; }
      queueRef.current.push({ count, resolve });
      if (!busyRef.current) processNext();
    });
    return () => { rasterizeClusterPng = null; };
  }, [processNext]);

  return (
    <View
      pointerEvents="none"
      style={{ position: 'absolute', top: -1000, left: -1000, opacity: 0 }}
    >
      {currentCount !== null && (
        <ClusterPngSvg
          count={currentCount}
          primary={theme.colors.primary}
          paperSoft={theme.colors.paperSoft}
          paper={theme.colors.paper}
          fontFamily={theme.fontFamilies.mono}
          svgRef={svgRef}
        />
      )}
    </View>
  );
}

// ── useClusterPng hook ────────────────────────────────────────────────
// Returns the cached PNG URI for `count`, or null if not yet rasterized.
// Triggers rasterization on miss and subscribes to cache updates so the
// consumer re-renders when its PNG arrives.
function useClusterPng(count: number): string | null {
  const [, forceRender] = useState(0);

  useEffect(() => {
    const listener = () => forceRender(v => v + 1);
    clusterPngListeners.add(listener);
    return () => { clusterPngListeners.delete(listener); };
  }, []);

  useEffect(() => {
    if (clusterPngCache.has(count)) { touchClusterPng(count); return; }
    rasterizeClusterPng?.(count);
  }, [count]);

  const uri = clusterPngCache.get(count);
  if (uri) touchClusterPng(count);
  return uri ?? null;
}

// ── Cluster marker (consumer) ─────────────────────────────────────────
// Renders nothing while the PNG is being rasterized (≤1 frame in the common
// pre-warmed case, ≤20ms for first-sight counts >50). tracksViewChanges is
// permanently false — the image is a static bitmap, no view tree to track.
function ClusterMarker({
  coordinate, count, onPress,
}: {
  coordinate: { latitude: number; longitude: number };
  count: number;
  onPress: () => void;
}) {
  const uri = useClusterPng(count);
  if (!uri) return null;
  return (
    <Marker
      coordinate={coordinate}
      onPress={onPress}
      anchor={{ x: 0.5, y: 0.92 }}
      image={{ uri }}
      tracksViewChanges={false}
    />
  );
}

function formatDuration(min: number): string {
  if (min < 60) return `${min}m`;
  const h = Math.floor(min / 60);
  const m = min % 60;
  return m > 0 ? `${h}h ${m}m` : `${h}h`;
}


async function geocodePlaceId(placeId: string): Promise<{ latitude: number; longitude: number } | undefined> {
  try {
    const res  = await fetch(
      `https://maps.googleapis.com/maps/api/place/details/json?place_id=${placeId}&fields=geometry&key=${MAPS_KEY}`
    );
    const data = await res.json();
    const loc  = data.result?.geometry?.location;
    if (loc) return { latitude: loc.lat, longitude: loc.lng };
  } catch {}
  return undefined;
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function MapScreen() {
  const { theme }   = useTheme();
  const navigation  = useNavigation<any>();
  const insets      = useSafeAreaInsets();
  const mapRef      = useRef<MapView>(null);
  const locTimer    = useRef<ReturnType<typeof setTimeout> | null>(null);

  const badgeStyle = useCallback((badge: 'Fastest' | 'Scenic' | 'Shortest') => {
    if (badge === 'Fastest')  return { bg: 'rgba(99,153,34,0.20)',  fg: theme.colors.primary };
    if (badge === 'Shortest') return { bg: 'rgba(186,117,23,0.20)', fg: theme.colors.primary  };
    return { bg: 'rgba(216,90,48,0.20)', fg: theme.colors.primary };
  }, [theme]);

  // GPS position
  const [userLocation,    setUserLocation]    = useState<{ latitude: number; longitude: number } | null>(null);

  // Origin: GPS or manually chosen address
  const [originMode,   setOriginMode]   = useState<'gps' | 'manual'>('gps');
  const [originName,   setOriginName]   = useState('Current location');
  const [originCoords, setOriginCoords] = useState<{ latitude: number; longitude: number } | null>(null);

  // Destination
  const [destination,  setDestination]  = useState('');
  const [destCoords,   setDestCoords]   = useState<{ latitude: number; longitude: number } | null>(null);

  // Routes
  const [routes,           setRoutes]           = useState<RouteOption[]>([]);
  const [selectedRouteIdx, setSelectedRouteIdx] = useState(0);
  const [routePOIs,        setRoutePOIs]        = useState<POI[]>([]);
  const [waypoints,        setWaypoints]        = useState<Waypoint[]>([]);
  const [loadingRoute,     setLoadingRoute]     = useState(false);
  // Pre-route browse POIs — fetched from get_nearby_pois based on the
  // visible map region. Cleared when a route is selected.
  const [browsePOIs,       setBrowsePOIs]       = useState<POI[]>([]);
  const browseFetchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastRegionRef    = useRef(INITIAL_REGION);
  // Category filter — sourced from Zustand session store (drift 5.80).
  // The customize screen's chip grid is the sole UI for setting this; home
  // consumes it to filter route-POI overlay and `get_corridor_pois` params.
  const selectedCategories = useTripStore(s => s.selectedCategories);

  // Active trip mode (Drive | Hike) — drift 5.82. Persisted in Zustand.
  const activeTripMode    = useTripStore(s => s.activeTripMode);
  const setActiveTripMode = useTripStore(s => s.setActiveTripMode);

  // Pending pin (map-tap to drop a stop)
  const [pendingPin,        setPendingPin]        = useState<{ latitude: number; longitude: number } | null>(null);
  const [pendingPinName,    setPendingPinName]    = useState('');
  const [pendingPinLoading, setPendingPinLoading] = useState(false);
  // Screen-space anchor for the floating CoordinatesPill (drift 5.99).
  // Resolved via mapRef.pointForCoordinate after the pin is dropped, then
  // refreshed inside onRegionChangeComplete so the pill stays glued to the
  // pin as the user pans / zooms.
  const [pendingPinScreenPos, setPendingPinScreenPos] = useState<{ x: number; y: number } | null>(null);

  // Shared tracksViewChanges flag for inline POI markers — start true so the
  // first render captures the SVG bitmap, flip false at 1s to stop the
  // native re-snapshot churn. One state for all markers in this screen;
  // the clusterer's first-pass registration only needs the initial frame
  // to be view-tracking-true (drift 5.94 follow-up — see the
  // PoiMarkerX-integration comment block at the top of the file).
  const [initialTracking, setInitialTracking] = useState(true);
  useEffect(() => {
    const t = setTimeout(() => setInitialTracking(false), 1000);
    return () => clearTimeout(t);
  }, []);

  // Cluster PNG pre-warm — rasterize counts 5..50 on mount to cover the
  // ~95% of real-world cluster counts on this map. Lazy-rasterizes counts
  // above 50 on first sight (≤20ms per PNG, one-frame flicker tolerated).
  // Sequential queue inside ClusterPngRasterizer means this runs in the
  // background without blocking the first map paint.
  useEffect(() => {
    if (!rasterizeClusterPng) return;
    for (let i = 5; i <= 50; i++) rasterizeClusterPng(i);
  }, []);

  // Tapped existing stop marker — shows remove callout
  const [pressedStopIdx, setPressedStopIdx] = useState<number | null>(null);

  // Tapped POI marker — drives the floating PoiCallout overlay (drift 5.97).
  // Sticky selection: tap a marker to show; tap the SAME marker to hide;
  // tap a DIFFERENT marker to switch. Pan / zoom repositions the callout
  // (via onRegionChangeComplete) but does NOT dismiss. Map-background tap
  // is a no-op for this overlay.
  const [selectedPoi, setSelectedPoi] = useState<
    (POI & { screenPosition: { x: number; y: number } }) | null
  >(null);

  const dismissCallout = useCallback((reason: 'tap-same' | 'unmount') => {
    setSelectedPoi(prev => {
      if (prev && __DEV__) console.info('[home] callout:dismiss', { reason, poi: prev.name });
      return null;
    });
  }, []);

  const handleMarkerPress = useCallback(async (
    poi: POI,
    screenLabel: 'browse' | 'curated' | 'extra',
  ) => {
    // Same-marker re-tap toggles off. Different-marker tap falls through
    // and replaces selectedPoi (the existing switch behavior).
    if (selectedPoi?.id === poi.id) {
      dismissCallout('tap-same');
      return;
    }
    try {
      const screenPos = await (mapRef.current as any)?.pointForCoordinate?.({
        latitude:  poi.lat,
        longitude: poi.lng,
      });
      if (!screenPos) return;
      setSelectedPoi({ ...poi, screenPosition: screenPos });
      if (__DEV__) {
        console.info('[home] callout:show', { poi: poi.name, screen: screenLabel, screenPos });
      }
    } catch (err) {
      if (__DEV__) console.warn('[home] callout:show-fail', err);
    }
  }, [selectedPoi, dismissCallout]);

  useEffect(() => () => { dismissCallout('unmount'); }, [dismissCallout]);

  // Location search overlay (shared for origin + dest + stop)
  const [locTarget,  setLocTarget]  = useState<'origin' | 'dest' | 'stop' | null>(null);
  const [locQuery,   setLocQuery]   = useState('');
  const [locSuggs,   setLocSuggs]   = useState<Suggestion[]>([]);
  const [recentLocs, setRecentLocs] = useState<RecentLocation[]>([]);
  const [locLoading, setLocLoading] = useState(false);

  const { width: winW }                         = useWindowDimensions();
  const isDesktop                               = Platform.OS === 'web' && winW > DESKTOP_BP;

  // Dynamic snap points (drift 5.87) — `expanded` must leave room for the
  // top header (safe area + mode pill + logo + search pill + chip row + buffer),
  // otherwise the sheet's drag handle sits behind the search pill on Android
  // and the user can't drag the sheet back down. We measure the SafeAreaView
  // wrapper's height on layout and recompute snap points reactively. Fallback
  // estimate (220) is used before layout fires so the first paint is sane.
  const HEADER_BUFFER_PX = 16;
  const [headerHeight, setHeaderHeight] = useState<number>(220);
  const snapPoints = useMemo<SnapPoints>(() => {
    const maxExpanded = Math.max(
      Math.round(SCREEN_H * 0.40),
      SCREEN_H - headerHeight - HEADER_BUFFER_PX,
    );
    return {
      peek:     Math.round(SCREEN_H * 0.18),
      default:  Math.min(Math.round(SCREEN_H * 0.38), maxExpanded),
      expanded: maxExpanded,
    };
  }, [headerHeight]);
  const { anim: sheetAnim, panHandlers: sheetPan, snapTo: snapSheet, level: snapLevel } =
    useSheetSnap(snapPoints, 'peek');

  const [mapStyleId, setMapStyleId] = useState<MapStyleId>('dark');

  // Load persisted map style on mount
  useEffect(() => { loadMapStyle().then(setMapStyleId); }, []);

  const handleMapStyleChange = (id: MapStyleId) => {
    setMapStyleId(id);
    saveMapStyle(id);
  };

  const activeMapStyle = MAP_STYLES[mapStyleId];

  const selectedRoute = routes[selectedRouteIdx] ?? null;
  const badges        = computeBadges(routes);
  // Translate display-label chip selections to DB slugs once per render.
  // poi.category comes back as a slug from get_corridor_pois; selectedCategories
  // holds chip labels ('History', 'Nature', …) for parity with customize.tsx's
  // chip row. Empty = include all.
  const activeSlugSet = useMemo(
    () => new Set(selectedCategories.map(label => CAT_SLUG[label] ?? label.toLowerCase())),
    [selectedCategories],
  );
  const filteredRoutePOIs = selectedCategories.length === 0
    ? routePOIs
    : routePOIs.filter(poi => activeSlugSet.has(poi.category));

  // ── Curation on home post-route (B7 / drift 5.74 / 5.76) ──────────────────
  // Home pre-route browse stays uncurated. Post-route uses mode-default
  // density (balanced for driving, dense for hiking), minRelevance 0. The
  // user can refine on customize; this is the preview render.
  const homeCuration = useMemo(() => {
    if (!selectedRoute || filteredRoutePOIs.length === 0) {
      return { curated: [] as POI[], extras: [] as POI[] };
    }
    const slugs = selectedCategories.map(label => CAT_SLUG[label] ?? label.toLowerCase());
    const result = curateRoutePOIs({
      rawPOIs:         filteredRoutePOIs,
      routePolyline:   selectedRoute.polylineCoords,
      durationMinutes: selectedRoute.durationMin,
      tripMode:        activeTripMode,
      density:         activeTripMode === 'hiking' ? 'dense' : 'balanced',
      minRelevance:    0,
      activeCategories: slugs,
    });
    const curatedIds = new Set(result.curatedPOIs.map(p => p.id));
    return {
      curated: result.curatedPOIs,
      extras:  filteredRoutePOIs.filter(p => !curatedIds.has(p.id)),
    };
  }, [filteredRoutePOIs, selectedRoute, activeTripMode, selectedCategories]);

  // Browse mode = no routes selected yet. POIs come from get_nearby_pois,
  // clustered. Post-route mode renders along-corridor POIs uncluttered.
  const browseMode = routes.length === 0;

  // ── Viewport-aware extra reveal (B8 / drift 5.79) ─────────────────────────
  // When zoomed in past the threshold, supplement the curated set with
  // non-curated POIs that fall inside the visible region. Rendered dimmed
  // and smaller; tappable but NOT in the narration queue.
  const VIEWPORT_REVEAL_DELTA = 0.05; // ~5 km vertical span
  const VIEWPORT_REVEAL_MAX   = 80;
  const [mapRegion, setMapRegion] = useState<typeof INITIAL_REGION>(INITIAL_REGION);
  const visibleExtras = useMemo<POI[]>(() => {
    if (browseMode) return [];
    if (mapRegion.latitudeDelta >= VIEWPORT_REVEAL_DELTA) return [];
    const minLat = mapRegion.latitude - mapRegion.latitudeDelta / 2;
    const maxLat = mapRegion.latitude + mapRegion.latitudeDelta / 2;
    const minLng = mapRegion.longitude - mapRegion.longitudeDelta / 2;
    const maxLng = mapRegion.longitude + mapRegion.longitudeDelta / 2;
    const inside: POI[] = [];
    for (const p of homeCuration.extras) {
      if (p.lat >= minLat && p.lat <= maxLat && p.lng >= minLng && p.lng <= maxLng) {
        inside.push(p);
        if (inside.length >= VIEWPORT_REVEAL_MAX) break;
      }
    }
    return inside;
  }, [browseMode, mapRegion, homeCuration.extras]);

  const fetchBrowsePOIs = useCallback(async (region: {
    latitude: number; longitude: number; latitudeDelta: number; longitudeDelta: number;
  }) => {
    // Radius derived from the larger of the two viewport half-spans, so
    // state-wide zoom fetches state-wide data instead of a small central
    // disc that misses most of the visible map. 1° ≈ 111 km.
    const halfLatKm = (region.latitudeDelta / 2) * 111;
    const halfLngKm = (region.longitudeDelta / 2) * 111 * Math.cos(region.latitude * Math.PI / 180);
    const radiusKm = Math.max(halfLatKm, halfLngKm);
    const radiusM = Math.min(radiusKm * 1000, BROWSE_MAX_RADIUS_M);
    try {
      const pois = await getNearbyPOIs(region.latitude, region.longitude, radiusM, null, 'driving');
      // RPC returns distance-sorted (closest first). Cap at 500 to keep
      // the cluster engine + render path bounded at very wide zoom.
      setBrowsePOIs(pois.slice(0, BROWSE_MAX_RESULTS));
    } catch (err) {
      console.error('[home] browse POI fetch failed:', err);
    }
  }, []);

  // Initial browse fetch on mount + clear when transitioning to a route.
  // On mode flip back to browse, fetch the last-seen region (not INITIAL_REGION)
  // so the user doesn't see the map snap back to LA when they clear a route.
  useEffect(() => {
    if (!browseMode) { setBrowsePOIs([]); return; }
    fetchBrowsePOIs(lastRegionRef.current);
  }, [browseMode, fetchBrowsePOIs]);

  const handleRegionChangeComplete = useCallback(async (region: {
    latitude: number; longitude: number; latitudeDelta: number; longitudeDelta: number;
  }) => {
    lastRegionRef.current = region;
    setMapRegion(region); // B8 viewport reveal depends on this
    // Reposition the POI callout (if any) so it stays glued to its POI as
    // the user pans/zooms. NOT a dismiss — the selection is sticky.
    if (selectedPoi) {
      try {
        const screenPos = await (mapRef.current as any)?.pointForCoordinate?.({
          latitude:  selectedPoi.lat,
          longitude: selectedPoi.lng,
        });
        if (screenPos) {
          setSelectedPoi(prev => (prev ? { ...prev, screenPosition: screenPos } : null));
        }
      } catch {
        // pointForCoordinate can throw if the map handle is gone (e.g. mid-unmount);
        // swallow — the callout will redraw on the next region change.
      }
    }
    // Same reposition pass for the pending-pin CoordinatesPill (drift 5.99) —
    // keeps the floating coordinate readout glued to the dropped pin.
    if (pendingPin) {
      try {
        const screenPos = await (mapRef.current as any)?.pointForCoordinate?.({
          latitude:  pendingPin.latitude,
          longitude: pendingPin.longitude,
        });
        if (screenPos) setPendingPinScreenPos(screenPos);
      } catch { /* same swallow as above */ }
    }
    if (!browseMode) return;
    if (browseFetchTimer.current) clearTimeout(browseFetchTimer.current);
    browseFetchTimer.current = setTimeout(() => {
      fetchBrowsePOIs(region);
    }, BROWSE_FETCH_DEBOUNCE_MS);
  }, [browseMode, fetchBrowsePOIs, selectedPoi, pendingPin]);

  const clearRoutes = () => { setRoutes([]); setSelectedRouteIdx(0); setRoutePOIs([]); };

  // ── GPS ────────────────────────────────────────────────────────────────────
  useEffect(() => {
    (async () => {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') return;
      const loc   = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      const coord = { latitude: loc.coords.latitude, longitude: loc.coords.longitude };
      setUserLocation(coord);
      mapRef.current?.animateToRegion({ ...coord, latitudeDelta: 0.08, longitudeDelta: 0.08 }, 800);
    })();
  }, []);

  // ── POI dots for selected route ────────────────────────────────────────────
  // Mode-aware corridor: driving 1 mi, hiking 0.25 mi (matches customize's
  // mode-default poiDist). User can override via customize's slider.
  // Result is fetched significance-desc and capped server-side at 500 rows;
  // curation downstream picks the right-sized subset for rendering.
  useEffect(() => {
    if (!selectedRoute || selectedRoute.polylineCoords.length < 2) {
      if (__DEV__) {
        console.info('[home] fetch:skip',
          'selectedRoute=' + (selectedRoute ? 'present' : 'null'),
          'polyline=' + (selectedRoute?.polylineCoords.length ?? 0),
        );
      }
      setRoutePOIs([]);
      return;
    }
    const fetchMode = activeTripMode;
    const corridor = fetchMode === 'hiking' ? 0.25 : 1;
    if (__DEV__) {
      console.info('[home] fetch:start',
        'polyline=' + selectedRoute.polylineCoords.length,
        'corridorMi=' + corridor,
        'mode=' + fetchMode,
        'routeIdx=' + selectedRouteIdx,
      );
    }
    getPOIsAlongRoute(
      selectedRoute.polylineCoords, corridor, null, fetchMode,
      { sortMode: 'significance_desc', resultLimit: 500 },
    ).then(pois => {
      if (__DEV__) {
        console.info('[home] fetch:state-set count=' + pois.length);
      }
      setRoutePOIs(pois);
    });
  }, [selectedRouteIdx, routes, activeTripMode]);

  // ── Diagnostic: render-side observability for post-route POI markers ───────
  useEffect(() => {
    if (__DEV__ && !browseMode) {
      console.info('[home] render:markers',
        'routePOIs=' + routePOIs.length,
        'filtered=' + filteredRoutePOIs.length,
        'curated=' + homeCuration.curated.length,
        'extrasReady=' + homeCuration.extras.length,
        'extrasVisible=' + visibleExtras.length,
        'activeChips=' + selectedCategories.length,
        'latDelta=' + mapRegion.latitudeDelta.toFixed(4),
      );
    }
  }, [routePOIs, filteredRoutePOIs.length, browseMode, selectedCategories.length, homeCuration.curated.length, homeCuration.extras.length, visibleExtras.length, mapRegion.latitudeDelta]);

  // ── Diagnostic (drift 5.89) — one-shot per curation result ─────────────────
  // Dumps top10 / bottom5 / stats so user can decide whether the obscure-POI
  // tail comes from broken significance scoring (top picks aren't actually
  // famous) or too-permissive min_relevance default (tail is dragging in
  // noise). Diagnostic only this commit — defaults are NOT changed here.
  // Drop after the user reviews logs and picks a tuning direction.
  useEffect(() => {
    if (!__DEV__ || browseMode) return;
    const list = homeCuration.curated;
    if (list.length === 0) return;
    const summary = (p: POI) => ({
      name:               p.name,
      significance_score: p.significance_score ?? null,
      dist_from_route_m:  p.dist_from_route_m ?? null,
      category:           p.category,
    });
    const scores = list
      .map(p => p.significance_score)
      .filter((s): s is number => typeof s === 'number');
    const stats = {
      total_curated: list.length,
      min_score:     scores.length ? Math.min(...scores) : null,
      max_score:     scores.length ? Math.max(...scores) : null,
      avg_score:     scores.length
        ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length * 10) / 10
        : null,
    };
    console.info('[home] curation:top10', list.slice(0, 10).map(summary));
    console.info('[home] curation:bottom5', list.slice(-5).map(summary));
    console.info('[home] curation:stats', stats);
  }, [homeCuration.curated, browseMode]);

  // ── Fetch routes ───────────────────────────────────────────────────────────
  // oCoords: explicit origin override — pass null to force GPS, omit to use current state.
  // Needed because setOriginCoords is async; callers that just set it must pass the new
  // value directly to avoid the stale-closure window.
  const fetchRoute = async (
    destText: string,
    dCoords?: { latitude: number; longitude: number },
    wps: Waypoint[] = waypoints,
    oCoords?: { latitude: number; longitude: number } | null,
  ) => {
    const resolvedOrigin = (oCoords !== undefined ? oCoords : originCoords) ?? userLocation;
    if (!resolvedOrigin) return;
    setLoadingRoute(true);
    clearRoutes();
    Keyboard.dismiss();
    if (dCoords) setDestCoords(dCoords);

    try {
      let fetched: RouteOption[] = [];

      if (Platform.OS === 'web' && dCoords) {
        const resolved: { latitude: number; longitude: number }[] = [];
        for (const wp of wps) {
          if (!wp.text.trim()) continue;
          if (wp.coords) { resolved.push(wp.coords); continue; }
          try {
            const r = await fetch(
              `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(wp.text)}.json?access_token=${MAPBOX_TOKEN}&limit=1`
            );
            const d = await r.json();
            if (d.features?.[0]) {
              const [wLng, wLat] = d.features[0].center;
              resolved.push({ latitude: wLat, longitude: wLng });
            }
          } catch {}
        }
        const coords = [
          `${resolvedOrigin.longitude},${resolvedOrigin.latitude}`,
          ...resolved.map(w => `${w.longitude},${w.latitude}`),
          `${dCoords.longitude},${dCoords.latitude}`,
        ].join(';');
        const res  = await fetch(
          `https://api.mapbox.com/directions/v5/mapbox/driving/${coords}.json` +
          `?access_token=${MAPBOX_TOKEN}&geometries=geojson&overview=full&alternatives=true`
        );
        const data = await res.json();
        if (!data.routes?.length) return;

        fetched = (data.routes as any[]).slice(0, 3).map((route, i) => ({
          index: i,
          polylineCoords: (route.geometry.coordinates as [number, number][]).map(
            ([lng, lat]) => ({ latitude: lat, longitude: lng })
          ),
          distanceMi: Math.round(
            route.legs.reduce((s: number, l: any) => s + l.distance, 0) / 1609.34 * 10
          ) / 10,
          durationMin: Math.round(
            route.legs.reduce((s: number, l: any) => s + l.duration, 0) / 60
          ),
          summary: (route.legs[0]?.summary as string) ?? '',
          destLat: dCoords.latitude,
          destLng: dCoords.longitude,
          poiCount: null,
        }));
      } else {
        const originParam = `${resolvedOrigin.latitude},${resolvedOrigin.longitude}`;
        const wpParam     = wps.filter(w => w.coords).length
          ? `&waypoints=${wps.filter(w => w.coords).map(w => `${w.coords!.latitude},${w.coords!.longitude}`).join('|')}`
          : '';
        const res  = await fetch(
          `https://maps.googleapis.com/maps/api/directions/json` +
          `?origin=${originParam}&destination=${encodeURIComponent(destText)}${wpParam}&alternatives=true&key=${MAPS_KEY}`
        );
        const data = await res.json();
        if (data.status !== 'OK' || !data.routes?.length) return;

        fetched = (data.routes as any[]).slice(0, 3).map((route, i) => {
          const last = route.legs[route.legs.length - 1];
          return {
            index: i,
            polylineCoords: decodePolyline(route.overview_polyline.points),
            distanceMi: Math.round(
              route.legs.reduce((s: number, l: any) => s + l.distance.value, 0) / 1609.34 * 10
            ) / 10,
            durationMin: Math.round(
              route.legs.reduce((s: number, l: any) => s + l.duration.value, 0) / 60
            ),
            summary: (route.summary as string) ?? '',
            destLat: last.end_location.lat,
            destLng: last.end_location.lng,
            poiCount: null,
          };
        });
      }

      setRoutes(fetched);
      setSelectedRouteIdx(0);
      snapSheet('expanded');
      mapRef.current?.fitToCoordinates(fetched.flatMap(r => r.polylineCoords), {
        edgePadding: { top: 140, right: 40, bottom: SNAP_PTS.default + 40, left: 40 },
        animated: true,
      });

      fetched.forEach((r, i) => {
        countPOIsAlongRoute(r.polylineCoords, 1, 'driving').then(count => {
          if (count !== null)
            setRoutes(prev => prev.map((opt, j) => j === i ? { ...opt, poiCount: count } : opt));
        });
      });
    } catch (err) {
      console.error('[MapScreen] fetchRoute error:', err);
    } finally {
      setLoadingRoute(false);
    }
  };

  // ── Location search overlay ────────────────────────────────────────────────

  const openLocOverlay = async (target: 'origin' | 'dest' | 'stop') => {
    Keyboard.dismiss();
    const initialQuery = target === 'dest' ? destination : '';
    setLocTarget(target);
    setLocQuery(initialQuery);
    setLocSuggs([]);
    setLocLoading(true);
    const recents = await getRecentLocations(target === 'origin' ? 'origin' : 'destination');
    setRecentLocs(recents);
    setLocLoading(false);
    if (initialQuery.length >= 3) fetchLocSuggestions(initialQuery);
  };

  const closeLocOverlay = () => {
    setLocTarget(null);
    setLocQuery('');
    setLocSuggs([]);
    setRecentLocs([]);
    if (locTimer.current) clearTimeout(locTimer.current);
  };

  const handleLocQueryChange = (text: string) => {
    setLocQuery(text);
    setLocSuggs([]);
    if (locTimer.current) clearTimeout(locTimer.current);
    if (text.length >= 3) {
      locTimer.current = setTimeout(() => fetchLocSuggestions(text), 400);
    }
  };

  const fetchLocSuggestions = async (text: string) => {
    try {
      let results: Suggestion[] = [];
      if (Platform.OS === 'web') {
        const prox = userLocation
          ? `&proximity=${userLocation.longitude},${userLocation.latitude}` : '';
        const res  = await fetch(
          `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(text)}.json` +
          `?access_token=${MAPBOX_TOKEN}&limit=5&types=place,address,poi${prox}`
        );
        const data = await res.json();
        results = (data.features ?? []).map((f: any) => ({
          description: f.place_name, place_id: f.id,
          coords: { latitude: f.center[1], longitude: f.center[0] },
        }));
      } else {
        const prox = userLocation
          ? `&location=${userLocation.latitude},${userLocation.longitude}&radius=50000` : '';
        const res  = await fetch(
          `https://maps.googleapis.com/maps/api/place/autocomplete/json` +
          `?input=${encodeURIComponent(text)}${prox}&key=${MAPS_KEY}`
        );
        const data = await res.json();
        results = (data.predictions ?? []).slice(0, 5).map((p: any) => ({
          description: p.description, place_id: p.place_id,
        }));
      }
      setLocSuggs(results);
    } catch {
      setLocSuggs([]);
    }
  };

  const selectLocResult = async (sg: Suggestion) => {
    let coords = sg.coords;
    if (!coords && Platform.OS !== 'web') coords = await geocodePlaceId(sg.place_id);

    if (locTarget === 'origin') {
      if (coords) {
        setOriginMode('manual');
        setOriginName(sg.description);
        setOriginCoords(coords);
        saveRecentLocation({
          placeId: sg.place_id, displayName: sg.description,
          lat: coords.latitude, lng: coords.longitude, type: 'origin',
        });
        closeLocOverlay();
        if (destination) fetchRoute(destination, destCoords ?? undefined, waypoints, coords);
      }
    } else if (locTarget === 'stop') {
      const updated: Waypoint[] = [...waypoints, { text: sg.description, coords }];
      setWaypoints(updated);
      closeLocOverlay();
      if (destination) fetchRoute(destination, destCoords ?? undefined, updated);
    } else {
      setDestination(sg.description);
      if (coords) {
        setDestCoords(coords);
        saveRecentLocation({
          placeId: sg.place_id, displayName: sg.description,
          lat: coords.latitude, lng: coords.longitude, type: 'destination',
        });
      }
      closeLocOverlay();
      fetchRoute(sg.description, coords, waypoints);
    }
  };

  const selectRecentLoc = (loc: RecentLocation) => {
    const coords = { latitude: loc.lat, longitude: loc.lng };
    if (locTarget === 'origin') {
      setOriginMode('manual');
      setOriginName(loc.display_name);
      setOriginCoords(coords);
      closeLocOverlay();
      if (destination) fetchRoute(destination, destCoords ?? undefined, waypoints, coords);
    } else if (locTarget === 'stop') {
      const updated: Waypoint[] = [...waypoints, { text: loc.display_name, coords }];
      setWaypoints(updated);
      closeLocOverlay();
      if (destination) fetchRoute(destination, destCoords ?? undefined, updated);
    } else {
      setDestination(loc.display_name);
      setDestCoords(coords);
      closeLocOverlay();
      fetchRoute(loc.display_name, coords, waypoints);
    }
  };

  const resetToGPS = () => {
    setOriginMode('gps');
    setOriginName('Current location');
    setOriginCoords(null);
    closeLocOverlay();
    if (destination) fetchRoute(destination, destCoords ?? undefined, waypoints, null);
  };

  const removeWaypoint = (i: number) => {
    const updated = waypoints.filter((_, j) => j !== i);
    setWaypoints(updated);
    if (destination) fetchRoute(destination, destCoords ?? undefined, updated);
  };

  // Cluster bubble (drift 5.72 / C1) — ink-red accent fill, paper outline,
  // Fraunces italic count. Sizes step at 50 and 500.
  //
  // tracksViewChanges starts true so the bitmap snapshot captures after
  // the View child rasterizes (same root cause as the per-marker 5.66
  // invisibility), then flips false 1s post-mount to drop re-snapshot
  // cost at scale. Per-cluster state because the flip is per-instance.
  const renderCluster = useCallback((cluster: any) => {
    const { id, geometry, onPress, properties } = cluster;
    const count: number = properties?.point_count ?? 0;
    return (
      <ClusterMarker
        key={`cluster-${id}`}
        coordinate={{ longitude: geometry.coordinates[0], latitude: geometry.coordinates[1] }}
        count={count}
        onPress={onPress}
      />
    );
  }, []);

  const handleMapPress = useCallback(async (e: any) => {
    // Map-background tap drops a pending-pin (stop candidate). The POI
    // callout overlay is intentionally NOT dismissed here — the selection
    // is sticky and only toggles off via a same-marker re-tap (drift 5.97
    // follow-up).
    const coord = e?.nativeEvent?.coordinate ?? e?.coordinate;
    if (!coord) return;
    setPendingPin(coord);
    setPendingPinName('');
    setPendingPinLoading(true);
    // Resolve the floating CoordinatesPill anchor (drift 5.99). Fire-and-
    // forget; on failure the pill simply won't render until the next pan.
    (mapRef.current as any)?.pointForCoordinate?.({
      latitude:  coord.latitude,
      longitude: coord.longitude,
    }).then((pt: { x: number; y: number }) => {
      if (pt) setPendingPinScreenPos(pt);
    }).catch(() => { /* swallow — repositioned on next region change */ });
    try {
      if (Platform.OS === 'web') {
        const res  = await fetch(
          `https://api.mapbox.com/geocoding/v5/mapbox.places/${coord.longitude},${coord.latitude}.json` +
          `?access_token=${MAPBOX_TOKEN}&limit=1&types=place,address,poi`
        );
        const data = await res.json();
        setPendingPinName(
          data.features?.[0]?.place_name ??
          `${coord.latitude.toFixed(5)}, ${coord.longitude.toFixed(5)}`
        );
      } else {
        setPendingPinName(`${coord.latitude.toFixed(5)}, ${coord.longitude.toFixed(5)}`);
      }
    } catch {
      setPendingPinName(`${coord.latitude.toFixed(5)}, ${coord.longitude.toFixed(5)}`);
    } finally {
      setPendingPinLoading(false);
    }
  }, []);

  const confirmPinAsStop = useCallback(() => {
    if (!pendingPin) return;
    const name = pendingPinName || `${pendingPin.latitude.toFixed(5)}, ${pendingPin.longitude.toFixed(5)}`;
    const updated = [...waypoints, { text: name, coords: pendingPin }];
    setWaypoints(updated);
    setPendingPin(null);
    setPendingPinName('');
    setPendingPinScreenPos(null);
    if (destination) fetchRoute(destination, destCoords ?? undefined, updated);
  }, [pendingPin, pendingPinName, waypoints, destination, destCoords]);


  // ── Navigate to Customize ─────────────────────────────────────────────────
  const handleCustomizeTrip = () => {
    if (!selectedRoute) return;
    const activeOrigin = originCoords ?? userLocation;
    navigation.navigate('customize', {
      route: JSON.stringify({
        name: `Route ${selectedRoute.index + 1}`,
        distance_mi: selectedRoute.distanceMi,
        duration_minutes: selectedRoute.durationMin,
        story_count: selectedRoute.poiCount ?? 0,
        origin: originName,
        destination,
      }),
      routePreview: JSON.stringify({
        polylineCoords: selectedRoute.polylineCoords,
        distanceMi: selectedRoute.distanceMi,
        durationMin: selectedRoute.durationMin,
        destLat: selectedRoute.destLat,
        destLng: selectedRoute.destLng,
      }),
      originLocation: JSON.stringify(activeOrigin ?? {}),
      destination,
      turnByTurn: 'false',
    });
  };

  // ── Styles (theme-aware; rebuilt when color scheme changes) ──────────────
  const s = useMemo(() => StyleSheet.create({
    root: { flex: 1, backgroundColor: theme.colors.paper },
    desktopSidebar: {
      position: 'absolute', left: 0, top: 0, bottom: 0, width: 320,
      backgroundColor: theme.colors.paperWarm,
      borderRightWidth: 1, borderColor: theme.colors.line,
    },

    // Map markers
    destPin: {
      width: 22, height: 22, borderRadius: 11,
      backgroundColor: `${theme.colors.primary}44`, alignItems: 'center', justifyContent: 'center',
    },
    destPinDot: {
      width: 11, height: 11, borderRadius: 6,
      backgroundColor: theme.colors.primary, borderWidth: 2, borderColor: theme.colors.paper,
    },
    originPin: {
      width: 22, height: 22, borderRadius: 11,
      backgroundColor: `${theme.colors.primary}44`, alignItems: 'center', justifyContent: 'center',
    },
    originPinDot: {
      width: 11, height: 11, borderRadius: 6,
      backgroundColor: theme.colors.primary, borderWidth: 2, borderColor: theme.colors.paper,
    },
    stopDot:       { width: 10, height: 10, borderRadius: 5, backgroundColor: theme.colors.primary, borderWidth: 1.5, borderColor: theme.colors.paper },
    stopDotActive: { width: 14, height: 14, borderRadius: 7, backgroundColor: theme.colors.primary, borderWidth: 2.5, borderColor: theme.colors.paper },

    // Top gradient overlay (translucent fade — kept rgba, not a panel)
    topGradient: {
      position: 'absolute', top: 0, left: 0, right: 0, height: 200,
      backgroundColor: 'rgba(26,18,8,0.72)',
    },

    // Bottom sheet
    sheet: {
      position: 'absolute', bottom: 0, left: 0, right: 0,
      backgroundColor: theme.colors.paperWarm,
      borderTopLeftRadius: 20, borderTopRightRadius: 20,
      borderTopWidth: 1, borderColor: theme.colors.line,
      overflow: 'hidden',
    },
    dragHandleWrap: {
      width: '100%', alignItems: 'center', paddingVertical: 10,
    },
    dragHandle: {
      width: 36, height: 4, backgroundColor: theme.colors.paperEdge,
      borderRadius: 2,
    },
    sheetContent: { paddingHorizontal: 16, paddingTop: 4, paddingBottom: 28, gap: 10 },

    // Top safe area + search
    topSafe:  { position: 'absolute', top: 0, left: 0, right: 0 },

    // Single rounded header card (Pine spec section 3 home header layout)
    // — replaces the three previously-floating chips (Wordmark pill +
    // ModePillRow + searchPill) with one contained box. Card has paperSoft
    // bg, paperEdge border, rounded corners, padding sufficient for all
    // three internal rows.
    headerCard: {
      marginTop:         8,
      marginHorizontal:  12,
      backgroundColor:   theme.colors.paperSoft,
      borderRadius:      26,
      borderWidth:       1,
      borderColor:       theme.colors.paperEdge,
      paddingTop:        14,
      paddingBottom:     12,
      paddingHorizontal: 14,
      gap:               12,
      ...Platform.select({
        ios: {
          shadowColor:   '#000',
          shadowOffset:  { width: 0, height: 8 },
          shadowOpacity: 0.4,
          shadowRadius:  20,
        },
        android: { elevation: 10 },
        default: {},
      }),
    },
    headerRow1: {
      flexDirection:  'row',
      alignItems:     'center',
      justifyContent: 'space-between',
    },
    headerAvatar: {
      width:           34,
      height:          34,
      borderRadius:    17,
      backgroundColor: theme.colors.paperWarm,
      borderWidth:     1,
      borderColor:     theme.colors.paperEdge,
      alignItems:      'center',
      justifyContent:  'center',
    },
    // Search field inside the header card — paperWarm pill (deeper than
    // the surrounding paperSoft card so the field visibly recedes).
    headerSearch: {
      flexDirection:     'row',
      alignItems:        'center',
      gap:               10,
      height:            42,
      borderRadius:      999,
      backgroundColor:   theme.colors.paperWarm,
      borderWidth:       1,
      borderColor:       theme.colors.paperEdge,
      paddingHorizontal: 14,
    },
    devNavRow: {
      position: 'absolute', top: 4, right: 20,
      flexDirection: 'row', gap: 8, zIndex: 100,
    },
    // Dev-only nav buttons — deliberately NOT migrated to Field Notes per CLAUDE.md.
    devNavLabel: {
      fontFamily: Platform.select({ ios: 'Menlo', android: 'monospace', default: 'monospace' }),
      fontSize: 16,
      color: theme.colors.inkSoft,
    },
    topBar: {
      flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
      paddingHorizontal: 16, paddingTop: 6, paddingBottom: 8,
    },
    logoRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    logoIconWrap: { width: 28, height: 28, alignItems: 'center', justifyContent: 'center' },
    logoX: { position: 'absolute', width: 22, height: 22, alignItems: 'center', justifyContent: 'center' },
    logoXBar1: {
      position: 'absolute', width: 20, height: 5, borderRadius: 2,
      backgroundColor: theme.colors.ink, transform: [{ rotate: '45deg' }],
    },
    logoXBar2: {
      position: 'absolute', width: 20, height: 5, borderRadius: 2,
      backgroundColor: theme.colors.ink, transform: [{ rotate: '-45deg' }],
    },
    // Brand-teal + legacy-base literals kept per drift catalog 5.44 (replaced wholesale in Layer 2).
    logoPinOuter: {
      width: 12, height: 12, borderRadius: 6, backgroundColor: '#2EC4B6',
      alignItems: 'center', justifyContent: 'center',
    },
    logoPinInner: { width: 4, height: 4, borderRadius: 2, backgroundColor: '#1a1208' },
    brand:  { ...theme.textVariants.titleSmall, color: theme.colors.ink },
    brandX: { ...theme.textVariants.titleSmall, color: '#2EC4B6' },
    settingsBtn: {
      width: 36, height: 36, borderRadius: 10,
      backgroundColor: theme.colors.paperEdge, borderWidth: 1, borderColor: theme.colors.line,
      alignItems: 'center', justifyContent: 'center',
    },
    settingsIcon: { fontSize: 16 },

    // Search card (floating pill)
    searchCard: {
      marginHorizontal: 16,
      backgroundColor: theme.colors.paperWarm,
      borderRadius: 14,
      borderWidth: 1, borderColor: theme.colors.line,
      overflow: 'visible',
    },
    searchRow: {
      flexDirection: 'row', alignItems: 'center', gap: 10,
      paddingHorizontal: 14, paddingVertical: 11,
    },
    searchDot:     { width: 8, height: 8, borderRadius: 4, flexShrink: 0 },
    searchDivider: { height: 1, backgroundColor: theme.colors.line, marginLeft: 32 },
    originText:    { ...theme.textVariants.body, color: theme.colors.inkSoft, flex: 1 },
    destText:      { ...theme.textVariants.body, color: theme.colors.ink,     flex: 1 },
    destPlaceholder: { color: theme.colors.inkSoft },
    gpsPill: {
      ...theme.textVariants.eyebrow,
      color: theme.colors.primary,
      borderWidth: 1, borderColor: theme.colors.primary, borderRadius: 4,
      paddingHorizontal: 4, paddingVertical: 1,
    },
    clearBtn: { ...theme.textVariants.meta, color: theme.colors.inkSoft, paddingHorizontal: 4 },

    // Shared suggestion items
    suggIcon: { fontSize: 12 },
    suggText: { ...theme.textVariants.body, color: theme.colors.inkSoft, flex: 1 },

    // Routes header
    routesHeader: {
      flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
      paddingTop: 4,
    },
    routesLabel: { ...theme.textVariants.meta, color: theme.colors.ink },
    addStopText: { ...theme.textVariants.body, color: theme.colors.primary },

    // Route cards
    routeCard: {
      backgroundColor: theme.colors.paperEdge,
      borderRadius: 12,
      borderWidth: 1.5, borderColor: theme.colors.line,
      padding: 14, gap: 8,
    },
    routeCardSel: { borderColor: theme.colors.primary, backgroundColor: `${theme.colors.primary}26` },
    routeCardTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
    routeCardTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1 },
    routeCardName:    { ...theme.textVariants.body, color: theme.colors.inkSoft },
    routeCardNameSel: { color: theme.colors.primary },
    badge:     { borderRadius: 4, paddingHorizontal: 6, paddingVertical: 2 },
    badgeText: { ...theme.textVariants.meta },
    routeDuration:    { ...theme.textVariants.title, color: theme.colors.inkSoft },
    routeDurationSel: { color: theme.colors.ink },
    routeCardBottom:  { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
    routeMeta:        { ...theme.textVariants.body, color: theme.colors.inkSoft, flex: 1 },
    storiesText:      { ...theme.textVariants.body, color: theme.colors.primary },
    storiesTextSel:   { color: theme.colors.primary },

    emptyState: { paddingVertical: 20, alignItems: 'center' },
    emptyText:  { ...theme.textVariants.body, color: theme.colors.inkSoft },

    // Legend row
    legendRow: {
      flexDirection: 'row', alignItems: 'center', gap: 6,
      paddingHorizontal: 4, paddingVertical: 4,
    },
    legendDot:  { width: 8, height: 8, borderRadius: 4 },
    legendText: { ...theme.textVariants.meta, color: theme.colors.inkSoft, marginRight: 8 },

    // Customize CTA
    customizeBtn: {
      backgroundColor: theme.colors.paperWarm,
      borderRadius: 12,
      paddingVertical: 16, alignItems: 'center',
      borderWidth: 1, borderColor: theme.colors.paperEdge,
    },
    customizeBtnDisabled: { opacity: 0.4 },
    customizeBtnText: { ...theme.textVariants.label, color: theme.colors.ink },

    // Location search overlay (modal scrim kept as opaque-black dim)
    locOverlay: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.6)' },
    locSheet: {
      backgroundColor: theme.colors.paperWarm,
      borderTopLeftRadius: 20, borderTopRightRadius: 20,
      borderTopWidth: 1, borderColor: theme.colors.line,
      paddingHorizontal: 16, paddingBottom: 44, paddingTop: 8,
      maxHeight: '85%',
    },
    locHeader: {
      flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
      marginBottom: 12,
    },
    locTitle:  { ...theme.textVariants.titleSmall, color: theme.colors.ink },
    locCancel: { ...theme.textVariants.body, color: theme.colors.primary },
    locInputRow: {
      flexDirection: 'row', alignItems: 'center', gap: 8,
      backgroundColor: theme.colors.paperEdge,
      borderRadius: 10, borderWidth: 1, borderColor: theme.colors.line,
      paddingHorizontal: 12, paddingVertical: 10, marginBottom: 8,
    },
    locInputIcon: { fontSize: 14 },
    locInput:     { ...theme.textVariants.body, color: theme.colors.ink, flex: 1 },
    locGpsRow: {
      flexDirection: 'row', alignItems: 'center', gap: 12,
      paddingVertical: 14,
      borderBottomWidth: 1, borderColor: theme.colors.line,
    },
    locGpsIconWrap: {
      width: 32, height: 32, borderRadius: 16,
      backgroundColor: `${theme.colors.primary}22`,
      alignItems: 'center', justifyContent: 'center',
    },
    locGpsLabel:    { ...theme.textVariants.body, color: theme.colors.ink },
    locGpsSub:      { ...theme.textVariants.meta, color: theme.colors.inkSoft, marginTop: 1 },
    locActiveCheck: { ...theme.textVariants.body, color: theme.colors.primary },
    locDivider:     { height: 1, backgroundColor: theme.colors.line, marginVertical: 6 },
    locSectionLabel: { ...theme.textVariants.meta, color: theme.colors.inkSoft, marginBottom: 4 },
    locResultRow:    { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 13, paddingHorizontal: 2 },
    locResultBorder: { borderTopWidth: 1, borderColor: theme.colors.line },
    locEmptyState:   { paddingVertical: 20, alignItems: 'center' },

    // Add stop modal (modal scrim kept as opaque-black dim)
    modalOverlay: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.6)' },
    modalSheet: {
      backgroundColor: theme.colors.paperWarm,
      borderTopLeftRadius: 20, borderTopRightRadius: 20,
      borderTopWidth: 1, borderColor: theme.colors.line,
      paddingHorizontal: 16, paddingBottom: 44, paddingTop: 8,
      zIndex: 1,
    },
    modalHandle: {
      width: 36, height: 4, backgroundColor: theme.colors.paperEdge,
      borderRadius: 2, alignSelf: 'center', marginBottom: 16,
    },
    modalTitle: { ...theme.textVariants.titleSmall, color: theme.colors.ink, marginBottom: 12 },
    modalInputRow: {
      flexDirection: 'row', alignItems: 'center',
      backgroundColor: theme.colors.paperEdge,
      borderRadius: 10, borderWidth: 1, borderColor: theme.colors.line,
      paddingHorizontal: 12, paddingVertical: 10, marginBottom: 8,
    },
    modalInput:   { ...theme.textVariants.body, color: theme.colors.ink, flex: 1 },
    modalSuggRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 13, paddingHorizontal: 2 },

    // Pending pin (map-tap to drop a stop)
    pendingPinWrap: { alignItems: 'center' },
    pendingPinDot: {
      width: 14, height: 14, borderRadius: 7,
      backgroundColor: theme.colors.primary, borderWidth: 2.5, borderColor: theme.colors.paper,
    },
    pendingPinStem: { width: 2.5, height: 10, backgroundColor: theme.colors.primary, borderRadius: 1.5 },
    pendingPinCallout: {
      position: 'absolute',
      backgroundColor: theme.colors.paperWarm,
      borderRadius: 12, borderWidth: 1, borderColor: theme.colors.line,
      flexDirection: 'row', alignItems: 'center', gap: 10,
      paddingHorizontal: 14, paddingVertical: 12,
      zIndex: 30,
    },
    // Pin-drop action row (drift 5.99) — compact variant of pendingPinCallout
    // without the coords text slot (coords moved to the floating
    // CoordinatesPill above the pin). Used only by the pin-drop flow; the
    // stop-remove callout below continues to use the full pendingPinCallout
    // since its label IS the stop name, not a redundant coord string.
    pendingPinActionRow: {
      position: 'absolute',
      backgroundColor: theme.colors.paperWarm,
      borderRadius: 12, borderWidth: 1, borderColor: theme.colors.line,
      flexDirection: 'row', alignItems: 'center', gap: 10,
      paddingHorizontal: 14, paddingVertical: 10,
      zIndex: 30,
      justifyContent: 'flex-end',
    },
    pendingPinIcon: {
      width: 30, height: 30, borderRadius: 15,
      backgroundColor: `${theme.colors.primary}22`,
      alignItems: 'center', justifyContent: 'center',
    },
    pendingPinAddr: { ...theme.textVariants.body, color: theme.colors.ink },
    pendingPinAddBtn: {
      backgroundColor: `${theme.colors.primary}26`, borderRadius: 8,
      borderWidth: 1, borderColor: theme.colors.primary,
      paddingHorizontal: 12, paddingVertical: 7,
    },
    pendingPinAddText: { ...theme.textVariants.meta, color: theme.colors.primary },
    removeStopBtn: {
      backgroundColor: `${theme.colors.primary}26`, borderRadius: 8,
      borderWidth: 1, borderColor: theme.colors.primary,
      paddingHorizontal: 12, paddingVertical: 7,
    },
    removeStopText: { ...theme.textVariants.meta, color: theme.colors.primary },

    // Route attribute tags
    tagRow:         { flexDirection: 'row', flexWrap: 'wrap', gap: 5, marginTop: 4 },
    tagChip:        { borderRadius: 5, borderWidth: 1, paddingHorizontal: 6, paddingVertical: 2 },
    tagChipPro:     { borderColor: theme.colors.primary, backgroundColor: `${theme.colors.primary}1f` },
    tagChipCon:     { borderColor: theme.colors.primary,  backgroundColor: `${theme.colors.primary}1f`  },
    tagChipNeutral: { borderColor: theme.colors.paperEdge, backgroundColor: `${theme.colors.ink}0a`    },
    tagTextPro:     { ...theme.textVariants.meta, color: theme.colors.primary },
    tagTextCon:     { ...theme.textVariants.meta, color: theme.colors.primary  },
    tagTextNeutral: { ...theme.textVariants.meta, color: theme.colors.inkSoft },

    // North button pill
    northBtn: {
      position: 'absolute',
      flexDirection: 'row', alignItems: 'center', gap: 5,
      paddingHorizontal: 13, height: 36, borderRadius: 10,
      backgroundColor: theme.colors.paperWarm,
      borderWidth: 1.5, borderColor: theme.colors.paperEdge,
      shadowColor: theme.colors.ink,
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.35,
      shadowRadius: 5,
      elevation: 5,
    },
    northBtnArrow: { ...theme.textVariants.body,      color: theme.colors.inkSoft },
    northBtnLabel: { ...theme.textVariants.meta, color: theme.colors.inkSoft },

    // Add stop inline panel
    addStopPanel: {
      position: 'absolute',
      backgroundColor: theme.colors.paperWarm,
      borderRadius: 12, borderWidth: 1, borderColor: theme.colors.line,
      overflow: 'hidden', zIndex: 25,
    },
    addStopRow: {
      flexDirection: 'row', alignItems: 'center', gap: 8,
      paddingHorizontal: 12, paddingVertical: 10,
    },
    addStopIcon:    { fontSize: 13, color: theme.colors.inkSoft },
    addStopInput:   { ...theme.textVariants.body, color: theme.colors.ink, flex: 1 },
    addStopSuggs:   { maxHeight: 180, borderTopWidth: 1, borderColor: theme.colors.line },
    addStopSuggRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 12, paddingVertical: 10 },

    // Search pill + chips
    desktopPillWrap: {
      position: 'absolute', top: 12, left: 332, right: 72,
      gap: 8,
    },
    searchPill: {
      flexDirection: 'row', alignItems: 'center', gap: 10,
      height: 40, borderRadius: 20,
      backgroundColor: theme.colors.paperWarm,
      borderWidth: 1, borderColor: theme.colors.line,
      paddingHorizontal: 14,
      marginHorizontal: 12,
      shadowColor: theme.colors.ink, shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.3, shadowRadius: 4,
      elevation: 4,
    },
    searchPillIcon:        { fontSize: 14 },
    searchPillText:        { ...theme.textVariants.body, color: theme.colors.ink, flex: 1 },
    searchPillPlaceholder: { color: theme.colors.inkSoft },
    searchPillAvatar: {
      width: 28, height: 28, borderRadius: 14,
      backgroundColor: theme.colors.paperEdge,
      borderWidth: 1, borderColor: theme.colors.paperEdge,
      alignItems: 'center', justifyContent: 'center',
    },
    // Cluster bubble — ink-red accent fill, tabular mono count in paper.
    // Drift 5.94 polish: size steps bumped 36/44/52 → 40/48/56 for extra
    // interior room (Fraunces italic 16px in a 36px circle read as cramped
    // and slightly off-center because the italic glyphs lean — symptoms
    // the user described as "overlapping and incomplete"); paper border
    // dropped in favor of a soft drop shadow that lifts the bubble off
    // dense map content and visually separates adjacent clusters; count
    // text switched to JetBrains Mono 600 14px (tabular figures align
    // cleanly inside a tight circle, no italic lean). includeFontPadding +
    // textAlignVertical handle Android's built-in font-padding so centered
    // numerals don't sit a hair high in the bubble.
  }), [theme]);

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <View style={s.root}>

      {/* Hidden cluster PNG rasterizer — sibling of the MapView so it
          shares MapScreen's theme context but doesn't compete for layout.
          Renders one cluster count at a time off-screen and rasterizes
          via toDataURL. See ClusterPngRasterizer definition for arch. */}
      <ClusterPngRasterizer />

      {/* ── FULL-SCREEN MAP ─────────────────────────────────────────────── */}
      <ClusteredMapView
        key={mapStyleId}
        ref={mapRef as any}
        style={StyleSheet.absoluteFillObject}
        provider={PROVIDER_GOOGLE}
        mapType={activeMapStyle.mapType}
        customMapStyle={activeMapStyle.customMapStyle as any}
        showsUserLocation
        showsMyLocationButton={false}
        showsCompass={false}
        toolbarEnabled={false}
        initialRegion={INITIAL_REGION}
        onPress={handleMapPress}
        onRegionChangeComplete={handleRegionChangeComplete}
        clusteringEnabled
        minPoints={5}
        // Pixel-space radius for marker merging (drift 5.94 polish). 80px is
        // larger than the library's 60px default so clusters absorb more
        // aggressively at every zoom level; the effect compounds at low zoom
        // since 80 pixels covers a much wider world-space slice when the
        // camera is far out. At high zoom, POIs spread far enough apart that
        // they still resolve to individual X marks. Tune up (100+) if dense
        // corridors still feel cluttered at mid-zoom, or down (70) if regions
        // condense too eagerly.
        radius={80}
        renderCluster={renderCluster}
      >
        {/* Alternative routes — dimmed dashes */}
        {routes
          .filter(r => r.index !== selectedRouteIdx)
          .map(r => r.polylineCoords.length > 1 && (
            <Polyline
              key={`alt-${r.index}`}
              coordinates={r.polylineCoords}
              strokeColor={ROUTE_ALT_COLOR[mapStyleId] ?? 'rgba(160,124,82,0.35)'}
              strokeWidth={2}
              lineDashPattern={[8, 5]}
              tappable
              onPress={() => setSelectedRouteIdx(r.index)}
            />
          ))
        }

        {/* Selected route */}
        {selectedRoute && selectedRoute.polylineCoords.length > 1 && (
          <Polyline
            coordinates={selectedRoute.polylineCoords}
            strokeColor={ROUTE_COLOR[mapStyleId] ?? 'rgba(56,139,253,0.90)'}
            strokeWidth={3}
          />
        )}

        {/* Destination marker — never clustered. */}
        {selectedRoute && (
          <Marker
            coordinate={{ latitude: selectedRoute.destLat, longitude: selectedRoute.destLng }}
            anchor={{ x: 0.5, y: 1 }}
            {...({ cluster: false } as any)}
          >
            <View style={s.destPin}><View style={s.destPinDot} /></View>
          </Marker>
        )}

        {/* Manual origin marker — never clustered. */}
        {originMode === 'manual' && originCoords && (
          <Marker
            coordinate={originCoords}
            anchor={{ x: 0.5, y: 0.5 }}
            tracksViewChanges={false}
            {...({ cluster: false } as any)}
          >
            <View style={s.originPin}><View style={s.originPinDot} /></View>
          </Marker>
        )}

        {/* Browse / curated / extras POI markers are inlined as <Marker>
            elements (drift 5.94) so react-native-map-clustering's
            isMarker(child) helper — which inspects `child.props.coordinate`
            on the direct JSX child — sees them as cluster-eligible. A
            function-component wrapper would hide the coordinate prop and
            the clusterer would silently drop the marker. Taps route to
            handleMarkerPress, which drives the sibling-of-MapView
            PoiCallout overlay (drift 5.97). */}
        {browseMode && browsePOIs.map(poi => (
          <Marker
            key={`browse-${poi.id}`}
            coordinate={{ latitude: poi.lat, longitude: poi.lng }}
            anchor={{ x: 0.5, y: 0.5 }}
            tappable
            tracksViewChanges={initialTracking}
            onPress={(e) => {
              // Halt so MapView.onPress (which would dismiss the overlay)
              // doesn't also fire on the same gesture.
              e?.stopPropagation?.();
              if (__DEV__) console.info('[home] marker:tap', { poi: poi.name, id: poi.id, screen: 'browse' });
              handleMarkerPress(poi, 'browse');
            }}
          >
            <PoiMarkerX size="curated" />
          </Marker>
        ))}

        {/* Post-route curated POI dots (B7 / drift 5.74). Cap-by-curation
            upstream — no slice here. */}
        {!browseMode && homeCuration.curated.map(poi => (
          <Marker
            key={poi.id}
            coordinate={{ latitude: poi.lat, longitude: poi.lng }}
            anchor={{ x: 0.5, y: 0.5 }}
            tappable
            tracksViewChanges={initialTracking}
            onPress={(e) => {
              e?.stopPropagation?.();
              if (__DEV__) console.info('[home] marker:tap', { poi: poi.name, id: poi.id, screen: 'curated' });
              handleMarkerPress(poi, 'curated');
            }}
          >
            <PoiMarkerX size="curated" />
          </Marker>
        ))}

        {/* Viewport-reveal extras (B8 / drift 5.79) — smaller X, same
            callout overlay. Renders only when zoomed past the threshold. */}
        {!browseMode && visibleExtras.map(poi => (
          <Marker
            key={`extra-${poi.id}`}
            coordinate={{ latitude: poi.lat, longitude: poi.lng }}
            anchor={{ x: 0.5, y: 0.5 }}
            tappable
            tracksViewChanges={initialTracking}
            onPress={(e) => {
              e?.stopPropagation?.();
              if (__DEV__) console.info('[home] marker:tap', { poi: poi.name, id: poi.id, screen: 'extra' });
              handleMarkerPress(poi, 'extra');
            }}
          >
            <PoiMarkerX size="reveal" />
          </Marker>
        ))}

        {/* Stop dots — teal, tappable to remove. Never clustered. */}
        {waypoints.map((wp, i) => wp.coords && (
          <Marker
            key={`stop-${i}`}
            coordinate={wp.coords}
            anchor={{ x: 0.5, y: 0.5 }}
            tracksViewChanges={false}
            onPress={() => setPressedStopIdx(i === pressedStopIdx ? null : i)}
            {...({ cluster: false } as any)}
          >
            <View style={[s.stopDot, pressedStopIdx === i && s.stopDotActive]} />
          </Marker>
        ))}

        {/* Pending pin — dropped by tapping the map. Never clustered. */}
        {pendingPin && (
          <Marker
            coordinate={pendingPin}
            anchor={{ x: 0.5, y: 1 }}
            {...({ cluster: false } as any)}
          >
            <View style={s.pendingPinWrap}>
              <View style={s.pendingPinDot} />
              <View style={s.pendingPinStem} />
            </View>
          </Marker>
        )}
      </ClusteredMapView>

      {/* ── POI CALLOUT OVERLAY (drift 5.97) ────────────────────────────── */}
      {/* Floating cream pill anchored above the tapped X marker. Rendered as
          a sibling of ClusteredMapView so it bypasses the clusterer's Marker
          subtree (which silently drops the built-in Callout tap-flow). */}
      {selectedPoi && (
        <PoiCallout
          poi={selectedPoi}
          screenPosition={selectedPoi.screenPosition}
        />
      )}

      {/* ── BOTTOM SHEET — route picker (mobile only) ───────────────────── */}
      {!isDesktop && <Animated.View style={[s.sheet, { height: sheetAnim, paddingBottom: insets.bottom + 16 }]}>
        <View {...sheetPan} style={s.dragHandleWrap}>
          <View style={s.dragHandle} />
        </View>

        <ScrollView
          contentContainerStyle={s.sheetContent}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
          scrollEnabled={snapLevel === 'expanded'}
        >
          {/* Routes header */}
          <View style={s.routesHeader}>
            <Text style={s.routesLabel}>Routes</Text>
            <TouchableOpacity onPress={() => openLocOverlay('stop')}>
              <Text style={s.addStopText}>+ Add stop</Text>
            </TouchableOpacity>
          </View>

          {/* Route cards */}
          {routes.map(r => {
            const isSelected = r.index === selectedRouteIdx;
            const badge = badges[r.index];
            const tags  = computeRouteTags(r, routes);
            return (
              <TouchableOpacity
                key={r.index}
                style={[s.routeCard, isSelected && s.routeCardSel]}
                onPress={() => setSelectedRouteIdx(r.index)}
                activeOpacity={0.75}
              >
                <View style={s.routeCardTop}>
                  <View style={s.routeCardTitleRow}>
                    <Text style={[s.routeCardName, isSelected && s.routeCardNameSel]}>
                      Route {r.index + 1}
                    </Text>
                    {badge && (() => {
                      const { bg, fg } = badgeStyle(badge);
                      return (
                        <View style={[s.badge, { backgroundColor: bg }]}>
                          <Text style={[s.badgeText, { color: fg }]}>{badge}</Text>
                        </View>
                      );
                    })()}
                  </View>
                  <Text style={[s.routeDuration, isSelected && s.routeDurationSel]}>
                    {formatDuration(r.durationMin)}
                  </Text>
                </View>

                <View style={s.routeCardBottom}>
                  <Text style={s.routeMeta}>
                    {r.distanceMi} mi{r.summary ? ` · ${r.summary}` : ''}
                  </Text>
                  {r.poiCount === null
                    ? <ActivityIndicator size="small" color={theme.colors.primary} />
                    : <Text style={[s.storiesText, isSelected && s.storiesTextSel]}>
                        {r.poiCount} {r.poiCount === 1 ? 'story' : 'stories'}
                      </Text>
                  }
                </View>

                {tags.length > 0 && (
                  <View style={s.tagRow}>
                    {tags.map(tag => (
                      <View key={tag.label} style={[s.tagChip,
                        tag.type === 'pro'     ? s.tagChipPro :
                        tag.type === 'con'     ? s.tagChipCon :
                                                 s.tagChipNeutral]}>
                        <Text style={
                          tag.type === 'pro'   ? s.tagTextPro :
                          tag.type === 'con'   ? s.tagTextCon :
                                                 s.tagTextNeutral}>
                          {tag.label}
                        </Text>
                      </View>
                    ))}
                  </View>
                )}
              </TouchableOpacity>
            );
          })}

          {!loadingRoute && destination.length > 0 && routes.length === 0 && (
            <View style={s.emptyState}>
              <Text style={s.emptyText}>No routes found. Try a different destination.</Text>
            </View>
          )}

          {/* Legend */}
          <View style={s.legendRow}>
            <View style={[s.legendDot, { backgroundColor: theme.colors.primary }]} />
            <Text style={s.legendText}>POIs</Text>
            <View style={[s.legendDot, { backgroundColor: theme.colors.primary }]} />
            <Text style={s.legendText}>Stops</Text>
          </View>

          {/* Customize trip CTA */}
          <TouchableOpacity
            style={[s.customizeBtn, !selectedRoute && s.customizeBtnDisabled]}
            onPress={handleCustomizeTrip}
            disabled={!selectedRoute}
            activeOpacity={0.85}
          >
            <Text style={s.customizeBtnText}>
              {selectedRoute ? 'Customize trip' : 'Enter a destination to start'}
            </Text>
          </TouchableOpacity>

          <View style={{ height: 12 }} />
        </ScrollView>
      </Animated.View>}

      {/* ── SEARCH PILL + CHIPS — mobile ────────────────────────────────── */}
      {!isDesktop && (
        <SafeAreaView
          style={s.topSafe}
          pointerEvents="box-none"
          onLayout={e => {
            const h = e.nativeEvent.layout.height;
            // Avoid spurious re-renders on sub-pixel layout changes.
            if (Math.abs(h - headerHeight) > 1) setHeaderHeight(h);
          }}
        >
          {__DEV__ && (
            <View style={s.devNavRow}>
              <TouchableOpacity
                onPress={() => navigation.navigate('design-system')}
                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                style={{ paddingHorizontal: 8, paddingVertical: 4 }}
              >
                <Text style={s.devNavLabel}>[DS]</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => navigation.navigate('components-demo')}
                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                style={{ paddingHorizontal: 8, paddingVertical: 4 }}
              >
                <Text style={s.devNavLabel}>[CD]</Text>
              </TouchableOpacity>
            </View>
          )}
          {/* Header card — single rounded box containing wordmark + avatar
              row, mode toggle, and search field. Matches Pine spec section
              3 home header layout (originally 3 stacked floating chips). */}
          <View style={s.headerCard}>
            {/* Row 1: squiggle + wordmark on the left, avatar on the right */}
            <View style={s.headerRow1}>
              <Wordmark size="m" squiggle />
              <View style={s.headerAvatar}>
                <Text style={{ fontSize: 14 }}>👤</Text>
              </View>
            </View>

            {/* Row 2: Drive | Walk mode toggle (drift 5.93). Persists via
                tripStore. Tapping Walk navigates to /hiking. */}
            <ModePillRow
              value={activeTripMode}
              onChange={(next) => {
                setActiveTripMode(next);
                if (next === 'hiking') navigation.navigate('hiking');
              }}
            />

            {/* Row 3: Search field */}
            <TouchableOpacity
              style={s.headerSearch}
              onPress={() => openLocOverlay('dest')}
              activeOpacity={0.85}
            >
              <Text style={s.searchPillIcon}>🔍</Text>
              <Text style={[s.searchPillText, !destination && s.searchPillPlaceholder]} numberOfLines={1}>
                {destination || 'Where to?'}
              </Text>
              {loadingRoute
                ? <ActivityIndicator size="small" color={theme.colors.primary} style={{ marginRight: 4 }} />
                : destination.length > 0 && (
                  <TouchableOpacity
                    onPress={() => { setDestination(''); setDestCoords(null); clearRoutes(); }}
                    hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                  >
                    <Text style={s.clearBtn}>✕</Text>
                  </TouchableOpacity>
                )
              }
            </TouchableOpacity>
          </View>
        </SafeAreaView>
      )}

      {/* ── DESKTOP SIDEBAR ─────────────────────────────────────────────── */}
      {isDesktop && (
        <View style={s.desktopSidebar}>
          <SafeAreaView style={{ flex: 1 }}>
            {/* Brand + settings */}
            <View style={s.topBar}>
              <View style={s.logoRow}>
                <View style={s.logoIconWrap}>
                  <View style={s.logoX}>
                    <View style={s.logoXBar1} />
                    <View style={s.logoXBar2} />
                  </View>
                  <View style={s.logoPinOuter}>
                    <View style={s.logoPinInner} />
                  </View>
                </View>
                <View style={{ flexDirection: 'row', alignItems: 'baseline' }}>
                  <Text style={s.brandX}>X</Text>
                  <Text style={s.brand}>Road</Text>
                </View>
              </View>
            </View>

            {/* Search card */}
            <View style={[s.searchCard, { marginBottom: 12 }]}>
              <TouchableOpacity style={s.searchRow} onPress={() => openLocOverlay('origin')} activeOpacity={0.7}>
                <View style={[s.searchDot, { backgroundColor: originMode === 'gps' ? theme.colors.primary : theme.colors.primary }]} />
                <Text style={s.originText} numberOfLines={1}>{originName}</Text>
                {originMode === 'gps'
                  ? <Text style={s.gpsPill}>GPS</Text>
                  : <TouchableOpacity onPress={resetToGPS} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                      <Text style={s.clearBtn}>✕</Text>
                    </TouchableOpacity>
                }
              </TouchableOpacity>
              {waypoints.map((wp, i) => (
                <View key={`swp-${i}`}>
                  <View style={s.searchDivider} />
                  <View style={s.searchRow}>
                    <View style={[s.searchDot, { backgroundColor: theme.colors.primary }]} />
                    <Text style={s.originText} numberOfLines={1}>{wp.text}</Text>
                    <TouchableOpacity onPress={() => removeWaypoint(i)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                      <Text style={s.clearBtn}>✕</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              ))}
              <View style={s.searchDivider} />
              <TouchableOpacity style={s.searchRow} onPress={() => openLocOverlay('dest')} activeOpacity={0.7}>
                <View style={[s.searchDot, { backgroundColor: theme.colors.primary }]} />
                <Text style={[s.destText, !destination && s.destPlaceholder]} numberOfLines={1}>
                  {destination || 'Where to?'}
                </Text>
                {loadingRoute
                  ? <ActivityIndicator size="small" color={theme.colors.primary} />
                  : destination.length > 0 && (
                    <TouchableOpacity onPress={() => { setDestination(''); setDestCoords(null); clearRoutes(); }} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                      <Text style={s.clearBtn}>✕</Text>
                    </TouchableOpacity>
                  )
                }
              </TouchableOpacity>
            </View>

            {/* Route content */}
            <ScrollView contentContainerStyle={s.sheetContent} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
              <View style={s.routesHeader}>
                <Text style={s.routesLabel}>Routes</Text>
                <TouchableOpacity onPress={() => openLocOverlay('stop')}>
                  <Text style={s.addStopText}>+ Add stop</Text>
                </TouchableOpacity>
              </View>
              {routes.map(r => {
                const isSelected = r.index === selectedRouteIdx;
                const badge = badges[r.index];
                const tags  = computeRouteTags(r, routes);
                return (
                  <TouchableOpacity key={r.index} style={[s.routeCard, isSelected && s.routeCardSel]} onPress={() => setSelectedRouteIdx(r.index)} activeOpacity={0.75}>
                    <View style={s.routeCardTop}>
                      <View style={s.routeCardTitleRow}>
                        <Text style={[s.routeCardName, isSelected && s.routeCardNameSel]}>Route {r.index + 1}</Text>
                        {badge && (() => { const { bg, fg } = badgeStyle(badge); return <View style={[s.badge, { backgroundColor: bg }]}><Text style={[s.badgeText, { color: fg }]}>{badge}</Text></View>; })()}
                      </View>
                      <Text style={[s.routeDuration, isSelected && s.routeDurationSel]}>{formatDuration(r.durationMin)}</Text>
                    </View>
                    <View style={s.routeCardBottom}>
                      <Text style={s.routeMeta}>{r.distanceMi} mi{r.summary ? ` · ${r.summary}` : ''}</Text>
                      {r.poiCount === null ? <ActivityIndicator size="small" color={theme.colors.primary} /> : <Text style={[s.storiesText, isSelected && s.storiesTextSel]}>{r.poiCount} {r.poiCount === 1 ? 'story' : 'stories'}</Text>}
                    </View>
                    {tags.length > 0 && (
                      <View style={s.tagRow}>
                        {tags.map(tag => (
                          <View key={tag.label} style={[s.tagChip,
                            tag.type === 'pro'     ? s.tagChipPro :
                            tag.type === 'con'     ? s.tagChipCon :
                                                     s.tagChipNeutral]}>
                            <Text style={
                              tag.type === 'pro'   ? s.tagTextPro :
                              tag.type === 'con'   ? s.tagTextCon :
                                                     s.tagTextNeutral}>
                              {tag.label}
                            </Text>
                          </View>
                        ))}
                      </View>
                    )}
                  </TouchableOpacity>
                );
              })}
              {!loadingRoute && destination.length > 0 && routes.length === 0 && (
                <View style={s.emptyState}><Text style={s.emptyText}>No routes found. Try a different destination.</Text></View>
              )}
              <View style={s.legendRow}>
                <View style={[s.legendDot, { backgroundColor: theme.colors.primary }]} />
                <Text style={s.legendText}>POIs</Text>
                <View style={[s.legendDot, { backgroundColor: theme.colors.primary }]} />
                <Text style={s.legendText}>Stops</Text>
              </View>
              <TouchableOpacity style={[s.customizeBtn, !selectedRoute && s.customizeBtnDisabled]} onPress={handleCustomizeTrip} disabled={!selectedRoute} activeOpacity={0.85}>
                <Text style={s.customizeBtnText}>{selectedRoute ? 'Customize trip' : 'Enter a destination to start'}</Text>
              </TouchableOpacity>
              <View style={{ height: 12 }} />
            </ScrollView>
          </SafeAreaView>
        </View>
      )}

      {/* ── SEARCH PILL + CHIPS — desktop (floats over map area) ──────── */}
      {isDesktop && (
        <View style={s.desktopPillWrap} pointerEvents="box-none">
          <TouchableOpacity
            style={s.searchPill}
            onPress={() => openLocOverlay('dest')}
            activeOpacity={0.85}
          >
            <Text style={s.searchPillIcon}>🔍</Text>
            <Text style={[s.searchPillText, !destination && s.searchPillPlaceholder]} numberOfLines={1}>
              {destination || 'Where to?'}
            </Text>
            {loadingRoute
              ? <ActivityIndicator size="small" color={theme.colors.primary} style={{ marginRight: 4 }} />
              : destination.length > 0 && (
                <TouchableOpacity
                  onPress={() => { setDestination(''); setDestCoords(null); clearRoutes(); }}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                >
                  <Text style={s.clearBtn}>✕</Text>
                </TouchableOpacity>
              )
            }
            <View style={s.searchPillAvatar}>
              <Text style={{ fontSize: 13 }}>👤</Text>
            </View>
          </TouchableOpacity>
        </View>
      )}

      {/* ── NORTH BUTTON ────────────────────────────────────────────────── */}
      <TouchableOpacity
        style={[s.northBtn, isDesktop ? { bottom: 68, right: 12 } : { bottom: 248, right: 12 }]}
        onPress={() => mapRef.current?.animateCamera({ heading: 0 }, { duration: 500 })}
        activeOpacity={0.8}
      >
        <Text style={s.northBtnArrow}>↑</Text>
        <Text style={s.northBtnLabel}>N</Text>
      </TouchableOpacity>

      {/* ── MAP STYLE PICKER ────────────────────────────────────────────── */}
      <MapStylePicker
        value={mapStyleId}
        onChange={handleMapStyleChange}
        mapboxToken={MAPBOX_TOKEN}
        buttonBottom={isDesktop ? 20 : 200}
        buttonRight={12}
      />

      {/* ── PENDING PIN COORDINATES PILL (drift 5.99) ───────────────────── */}
      {/* Floating cream pill anchored above the dropped pin. Replaces the
          coords-text-line that used to live inside the bottom action row
          (which overlapped with the route list + POI legend in the bottom
          sheet at expanded snap state). Same posture as PoiCallout. */}
      {pendingPin && pendingPinScreenPos && (
        <CoordinatesPill
          coordinate={pendingPin}
          screenPosition={pendingPinScreenPos}
          sublabel={
            pendingPinLoading
              ? 'Finding address…'
              : (pendingPinName && !/^-?\d/.test(pendingPinName.trim())
                  ? pendingPinName       // geocoded address (web)
                  : undefined)          // native fallback is raw coords; coords are already in the primary line, suppress
          }
        />
      )}

      {/* ── PENDING PIN ACTION ROW (drift 5.99) ──────────────────────────── */}
      {/* Compact: just 📍 + Add stop + ✕. Coordinates moved to the floating
          CoordinatesPill above the pin so the bottom row no longer carries
          the redundant lat/lng text. The row is narrower and the existing
          bottom position remains; the route legend below the route list is
          now reachable past the action row. */}
      {pendingPin && (
        <View style={[
          s.pendingPinActionRow,
          isDesktop ? { left: 332, right: 12, bottom: 20 } : { left: 12, right: 12, bottom: 110 },
        ]}>
          <View style={s.pendingPinIcon}>
            <Text style={{ fontSize: 14 }}>📍</Text>
          </View>
          <TouchableOpacity style={s.pendingPinAddBtn} onPress={confirmPinAsStop}>
            <Text style={s.pendingPinAddText}>Add stop</Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => { setPendingPin(null); setPendingPinName(''); setPendingPinScreenPos(null); }}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          >
            <Text style={s.clearBtn}>✕</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* ── STOP REMOVE CALLOUT ─────────────────────────────────────────── */}
      {pressedStopIdx !== null && waypoints[pressedStopIdx]?.coords && (
        <View style={[
          s.pendingPinCallout,
          isDesktop ? { left: 332, right: 12, bottom: 20 } : { left: 12, right: 12, bottom: 110 },
        ]}>
          <View style={s.pendingPinIcon}>
            <Text style={{ fontSize: 14 }}>📍</Text>
          </View>
          <Text style={[s.pendingPinAddr, { flex: 1 }]} numberOfLines={2}>
            {waypoints[pressedStopIdx].text}
          </Text>
          <TouchableOpacity
            style={s.removeStopBtn}
            onPress={() => { removeWaypoint(pressedStopIdx); setPressedStopIdx(null); }}
          >
            <Text style={s.removeStopText}>Remove stop</Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => setPressedStopIdx(null)}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          >
            <Text style={s.clearBtn}>✕</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* ══ LOCATION SEARCH OVERLAY ════════════════════════════════════════ */}
      <Modal
        visible={locTarget !== null}
        transparent
        animationType="slide"
        onRequestClose={closeLocOverlay}
      >
        <View style={s.locOverlay}>
          <TouchableOpacity style={StyleSheet.absoluteFillObject} onPress={closeLocOverlay} />
          <View style={s.locSheet}>
            <View style={s.modalHandle} />

            {/* Header */}
            <View style={s.locHeader}>
              <Text style={s.locTitle}>
                {locTarget === 'origin' ? 'Choose start' : locTarget === 'stop' ? 'Add a stop' : 'Where to?'}
              </Text>
              <TouchableOpacity onPress={closeLocOverlay} hitSlop={{ top: 8, bottom: 8, left: 16, right: 8 }}>
                <Text style={s.locCancel}>Cancel</Text>
              </TouchableOpacity>
            </View>

            {/* Search input */}
            <View style={s.locInputRow}>
              <Text style={s.locInputIcon}>🔍</Text>
              <TextInput
                style={s.locInput}
                placeholder={locTarget === 'origin' ? 'Search starting location…' : 'Search destination…'}
                placeholderTextColor={theme.colors.inkSoft}
                value={locQuery}
                onChangeText={handleLocQueryChange}
                autoFocus
                autoCorrect={false}
                autoCapitalize="words"
              />
              {locQuery.length > 0 && (
                <TouchableOpacity
                  onPress={() => { setLocQuery(''); setLocSuggs([]); }}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                >
                  <Text style={s.clearBtn}>✕</Text>
                </TouchableOpacity>
              )}
            </View>

            <ScrollView keyboardShouldPersistTaps="handled" style={{ maxHeight: 420 }}>
              {/* Use current location */}
              <TouchableOpacity
                style={s.locGpsRow}
                onPress={() => {
                  if (locTarget === 'origin') {
                    resetToGPS();
                  } else if (userLocation) {
                    setDestination('Current location');
                    setDestCoords(userLocation);
                    closeLocOverlay();
                  }
                }}
              >
                <View style={s.locGpsIconWrap}>
                  <Text style={{ fontSize: 13 }}>📡</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={s.locGpsLabel}>Use current location</Text>
                  {userLocation && (
                    <Text style={s.locGpsSub}>
                      {userLocation?.latitude.toFixed(4)}, {userLocation?.longitude.toFixed(4)}
                    </Text>
                  )}
                </View>
                {originMode === 'gps' && locTarget === 'origin' && (
                  <Text style={s.locActiveCheck}>✓</Text>
                )}
              </TouchableOpacity>

              {/* Autocomplete suggestions (typing) */}
              {locQuery.length >= 3 && locSuggs.length > 0 && (
                <>
                  <View style={s.locDivider} />
                  <Text style={s.locSectionLabel}>Suggestions</Text>
                  {locSuggs.map((sg, i) => (
                    <TouchableOpacity
                      key={sg.place_id}
                      style={[s.locResultRow, i > 0 && s.locResultBorder]}
                      onPress={() => selectLocResult(sg)}
                    >
                      <Text style={s.suggIcon}>📍</Text>
                      <Text style={s.suggText} numberOfLines={2}>{sg.description}</Text>
                    </TouchableOpacity>
                  ))}
                </>
              )}

              {/* Recent locations (no query) */}
              {locQuery.length < 3 && recentLocs.length > 0 && (
                <>
                  <View style={s.locDivider} />
                  <Text style={s.locSectionLabel}>Recent</Text>
                  {recentLocs.map((loc, i) => (
                    <TouchableOpacity
                      key={loc.id}
                      style={[s.locResultRow, i > 0 && s.locResultBorder]}
                      onPress={() => selectRecentLoc(loc)}
                    >
                      <Text style={s.suggIcon}>🕐</Text>
                      <Text style={s.suggText} numberOfLines={1}>{loc.display_name}</Text>
                    </TouchableOpacity>
                  ))}
                </>
              )}

              {/* Loading state */}
              {locLoading && (
                <View style={s.locEmptyState}>
                  <ActivityIndicator size="small" color={theme.colors.primary} />
                </View>
              )}

              {/* Empty search */}
              {!locLoading && locQuery.length >= 3 && locSuggs.length === 0 && (
                <View style={s.locEmptyState}>
                  <Text style={s.emptyText}>No results found</Text>
                </View>
              )}
            </ScrollView>
          </View>
        </View>
      </Modal>

    </View>
  );
}
