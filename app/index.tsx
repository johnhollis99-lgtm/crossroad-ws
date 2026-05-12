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
import * as Location from 'expo-location';
import { useNavigation } from '@react-navigation/native';
import {
  countPOIsAlongRoute,
  getPOIsAlongRoute,
  getRecentLocations,
  saveRecentLocation,
} from '../lib/supabase';
import type { POI, RecentLocation } from '../lib/supabase';
import { useTheme } from '../src/design/theme';
import { computeBadges, computeRouteTags } from '../lib/routeBadges';
import { useSheetSnap } from '../hooks/useSheetSnap';
import { MapStyleId, MAP_STYLES, loadMapStyle, saveMapStyle } from '../lib/mapStyle';
import { MapStylePicker } from '../components/MapStylePicker';
import { XRoadLogo } from '../components/XRoadLogo';

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

// ── Category chips ────────────────────────────────────────────────────────────
const CAT_CHIPS = ['History','Nature','Architecture','Food','Music','Weird','Roadside','Film','Science'] as const;
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
    if (badge === 'Fastest')  return { bg: 'rgba(99,153,34,0.20)',  fg: theme.colors.accent2 };
    if (badge === 'Shortest') return { bg: 'rgba(186,117,23,0.20)', fg: theme.colors.accent  };
    return { bg: 'rgba(216,90,48,0.20)', fg: theme.colors.accent };
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
  // Category chip filter
  const [activeCatChips, setActiveCatChips] = useState<Set<string>>(new Set());

  // Pending pin (map-tap to drop a stop)
  const [pendingPin,        setPendingPin]        = useState<{ latitude: number; longitude: number } | null>(null);
  const [pendingPinName,    setPendingPinName]    = useState('');
  const [pendingPinLoading, setPendingPinLoading] = useState(false);

  // Tapped existing stop marker — shows remove callout
  const [pressedStopIdx, setPressedStopIdx] = useState<number | null>(null);

  // Location search overlay (shared for origin + dest + stop)
  const [locTarget,  setLocTarget]  = useState<'origin' | 'dest' | 'stop' | null>(null);
  const [locQuery,   setLocQuery]   = useState('');
  const [locSuggs,   setLocSuggs]   = useState<Suggestion[]>([]);
  const [recentLocs, setRecentLocs] = useState<RecentLocation[]>([]);
  const [locLoading, setLocLoading] = useState(false);

  const { width: winW }                         = useWindowDimensions();
  const isDesktop                               = Platform.OS === 'web' && winW > DESKTOP_BP;
  const { anim: sheetAnim, panHandlers: sheetPan, snapTo: snapSheet, level: snapLevel } =
    useSheetSnap(SNAP_PTS, 'peek');

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
  const filteredRoutePOIs = activeCatChips.size === 0
    ? routePOIs
    : routePOIs.filter(poi => activeCatChips.has(CAT_SLUG[poi.category] ?? poi.category));

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
  useEffect(() => {
    if (!selectedRoute || selectedRoute.polylineCoords.length < 2) { setRoutePOIs([]); return; }
    getPOIsAlongRoute(
      selectedRoute.polylineCoords, 1, null, 'driving'
    ).then(pois => setRoutePOIs(pois));
  }, [selectedRouteIdx, routes]);

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

  const handleMapPress = useCallback(async (e: any) => {
    const coord = e?.nativeEvent?.coordinate ?? e?.coordinate;
    if (!coord) return;
    setPendingPin(coord);
    setPendingPinName('');
    setPendingPinLoading(true);
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
      backgroundColor: theme.colors.paperDeep,
      borderRightWidth: 1, borderColor: theme.colors.rule,
    },

    // Map markers
    destPin: {
      width: 22, height: 22, borderRadius: 11,
      backgroundColor: `${theme.colors.accent}44`, alignItems: 'center', justifyContent: 'center',
    },
    destPinDot: {
      width: 11, height: 11, borderRadius: 6,
      backgroundColor: theme.colors.accent, borderWidth: 2, borderColor: theme.colors.paper,
    },
    originPin: {
      width: 22, height: 22, borderRadius: 11,
      backgroundColor: `${theme.colors.accent2}44`, alignItems: 'center', justifyContent: 'center',
    },
    originPinDot: {
      width: 11, height: 11, borderRadius: 6,
      backgroundColor: theme.colors.accent2, borderWidth: 2, borderColor: theme.colors.paper,
    },
    poiDot:        { width: 10, height: 10, borderRadius: 5, backgroundColor: theme.colors.accent,  borderWidth: 1.5, borderColor: theme.colors.paper },
    stopDot:       { width: 10, height: 10, borderRadius: 5, backgroundColor: theme.colors.accent2, borderWidth: 1.5, borderColor: theme.colors.paper },
    stopDotActive: { width: 14, height: 14, borderRadius: 7, backgroundColor: theme.colors.accent2, borderWidth: 2.5, borderColor: theme.colors.paper },

    // Top gradient overlay (translucent fade — kept rgba, not a panel)
    topGradient: {
      position: 'absolute', top: 0, left: 0, right: 0, height: 200,
      backgroundColor: 'rgba(26,18,8,0.72)',
    },

    // Bottom sheet
    sheet: {
      position: 'absolute', bottom: 0, left: 0, right: 0,
      backgroundColor: theme.colors.paperDeep,
      borderTopLeftRadius: 20, borderTopRightRadius: 20,
      borderTopWidth: 1, borderColor: theme.colors.rule,
      overflow: 'hidden',
    },
    dragHandleWrap: {
      width: '100%', alignItems: 'center', paddingVertical: 10,
    },
    dragHandle: {
      width: 36, height: 4, backgroundColor: theme.colors.cardEdge,
      borderRadius: 2,
    },
    sheetContent: { paddingHorizontal: 16, paddingTop: 4, paddingBottom: 28, gap: 10 },

    // Top safe area + search
    topSafe:  { position: 'absolute', top: 0, left: 0, right: 0 },
    logoWrap: { alignItems: 'center', paddingVertical: 4 },
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
    brand:  { ...theme.textVariants.h3, color: theme.colors.ink },
    brandX: { ...theme.textVariants.h3, color: '#2EC4B6' },
    settingsBtn: {
      width: 36, height: 36, borderRadius: 10,
      backgroundColor: theme.colors.cardEdge, borderWidth: 1, borderColor: theme.colors.rule,
      alignItems: 'center', justifyContent: 'center',
    },
    settingsIcon: { fontSize: 16 },

    // Search card (floating pill)
    searchCard: {
      marginHorizontal: 16,
      backgroundColor: theme.colors.paperDeep,
      borderRadius: 14,
      borderWidth: 1, borderColor: theme.colors.rule,
      overflow: 'visible',
    },
    searchRow: {
      flexDirection: 'row', alignItems: 'center', gap: 10,
      paddingHorizontal: 14, paddingVertical: 11,
    },
    searchDot:     { width: 8, height: 8, borderRadius: 4, flexShrink: 0 },
    searchDivider: { height: 1, backgroundColor: theme.colors.rule, marginLeft: 32 },
    originText:    { ...theme.textVariants.ui, color: theme.colors.inkSoft, flex: 1 },
    destText:      { ...theme.textVariants.ui, color: theme.colors.ink,     flex: 1 },
    destPlaceholder: { color: theme.colors.inkSoft },
    gpsPill: {
      ...theme.textVariants.metaSmall,
      color: theme.colors.accent2,
      borderWidth: 1, borderColor: theme.colors.accent2, borderRadius: 4,
      paddingHorizontal: 4, paddingVertical: 1,
    },
    clearBtn: { ...theme.textVariants.uiSmall, color: theme.colors.inkSoft, paddingHorizontal: 4 },

    // Shared suggestion items
    suggIcon: { fontSize: 12 },
    suggText: { ...theme.textVariants.ui, color: theme.colors.inkSoft, flex: 1 },

    // Routes header
    routesHeader: {
      flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
      paddingTop: 4,
    },
    routesLabel: { ...theme.textVariants.meta, color: theme.colors.ink },
    addStopText: { ...theme.textVariants.ui, color: theme.colors.accent2 },

    // Route cards
    routeCard: {
      backgroundColor: theme.colors.cardEdge,
      borderRadius: 12,
      borderWidth: 1.5, borderColor: theme.colors.rule,
      padding: 14, gap: 8,
    },
    routeCardSel: { borderColor: theme.colors.accent2, backgroundColor: `${theme.colors.accent2}26` },
    routeCardTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
    routeCardTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1 },
    routeCardName:    { ...theme.textVariants.ui, color: theme.colors.inkSoft },
    routeCardNameSel: { color: theme.colors.accent2 },
    badge:     { borderRadius: 4, paddingHorizontal: 6, paddingVertical: 2 },
    badgeText: { ...theme.textVariants.meta },
    routeDuration:    { ...theme.textVariants.h2, color: theme.colors.inkSoft },
    routeDurationSel: { color: theme.colors.ink },
    routeCardBottom:  { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
    routeMeta:        { ...theme.textVariants.uiSmall, color: theme.colors.inkSoft, flex: 1 },
    storiesText:      { ...theme.textVariants.uiSmall, color: theme.colors.accent },
    storiesTextSel:   { color: theme.colors.accent },

    emptyState: { paddingVertical: 20, alignItems: 'center' },
    emptyText:  { ...theme.textVariants.ui, color: theme.colors.inkSoft },

    // Legend row
    legendRow: {
      flexDirection: 'row', alignItems: 'center', gap: 6,
      paddingHorizontal: 4, paddingVertical: 4,
    },
    legendDot:  { width: 8, height: 8, borderRadius: 4 },
    legendText: { ...theme.textVariants.meta, color: theme.colors.inkSoft, marginRight: 8 },

    // Customize CTA
    customizeBtn: {
      backgroundColor: theme.colors.paperDeep,
      borderRadius: 12,
      paddingVertical: 16, alignItems: 'center',
      borderWidth: 1, borderColor: theme.colors.cardEdge,
    },
    customizeBtnDisabled: { opacity: 0.4 },
    customizeBtnText: { ...theme.textVariants.buttonStrong, color: theme.colors.ink },

    // Location search overlay (modal scrim kept as opaque-black dim)
    locOverlay: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.6)' },
    locSheet: {
      backgroundColor: theme.colors.paperDeep,
      borderTopLeftRadius: 20, borderTopRightRadius: 20,
      borderTopWidth: 1, borderColor: theme.colors.rule,
      paddingHorizontal: 16, paddingBottom: 44, paddingTop: 8,
      maxHeight: '85%',
    },
    locHeader: {
      flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
      marginBottom: 12,
    },
    locTitle:  { ...theme.textVariants.h3, color: theme.colors.ink },
    locCancel: { ...theme.textVariants.ui, color: theme.colors.accent2 },
    locInputRow: {
      flexDirection: 'row', alignItems: 'center', gap: 8,
      backgroundColor: theme.colors.cardEdge,
      borderRadius: 10, borderWidth: 1, borderColor: theme.colors.rule,
      paddingHorizontal: 12, paddingVertical: 10, marginBottom: 8,
    },
    locInputIcon: { fontSize: 14 },
    locInput:     { ...theme.textVariants.ui, color: theme.colors.ink, flex: 1 },
    locGpsRow: {
      flexDirection: 'row', alignItems: 'center', gap: 12,
      paddingVertical: 14,
      borderBottomWidth: 1, borderColor: theme.colors.rule,
    },
    locGpsIconWrap: {
      width: 32, height: 32, borderRadius: 16,
      backgroundColor: `${theme.colors.accent2}22`,
      alignItems: 'center', justifyContent: 'center',
    },
    locGpsLabel:    { ...theme.textVariants.ui, color: theme.colors.ink },
    locGpsSub:      { ...theme.textVariants.uiSmall, color: theme.colors.inkSoft, marginTop: 1 },
    locActiveCheck: { ...theme.textVariants.ui, color: theme.colors.accent2 },
    locDivider:     { height: 1, backgroundColor: theme.colors.rule, marginVertical: 6 },
    locSectionLabel: { ...theme.textVariants.meta, color: theme.colors.inkSoft, marginBottom: 4 },
    locResultRow:    { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 13, paddingHorizontal: 2 },
    locResultBorder: { borderTopWidth: 1, borderColor: theme.colors.rule },
    locEmptyState:   { paddingVertical: 20, alignItems: 'center' },

    // Add stop modal (modal scrim kept as opaque-black dim)
    modalOverlay: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.6)' },
    modalSheet: {
      backgroundColor: theme.colors.paperDeep,
      borderTopLeftRadius: 20, borderTopRightRadius: 20,
      borderTopWidth: 1, borderColor: theme.colors.rule,
      paddingHorizontal: 16, paddingBottom: 44, paddingTop: 8,
      zIndex: 1,
    },
    modalHandle: {
      width: 36, height: 4, backgroundColor: theme.colors.cardEdge,
      borderRadius: 2, alignSelf: 'center', marginBottom: 16,
    },
    modalTitle: { ...theme.textVariants.h3, color: theme.colors.ink, marginBottom: 12 },
    modalInputRow: {
      flexDirection: 'row', alignItems: 'center',
      backgroundColor: theme.colors.cardEdge,
      borderRadius: 10, borderWidth: 1, borderColor: theme.colors.rule,
      paddingHorizontal: 12, paddingVertical: 10, marginBottom: 8,
    },
    modalInput:   { ...theme.textVariants.ui, color: theme.colors.ink, flex: 1 },
    modalSuggRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 13, paddingHorizontal: 2 },

    // Pending pin (map-tap to drop a stop)
    pendingPinWrap: { alignItems: 'center' },
    pendingPinDot: {
      width: 14, height: 14, borderRadius: 7,
      backgroundColor: theme.colors.accent2, borderWidth: 2.5, borderColor: theme.colors.paper,
    },
    pendingPinStem: { width: 2.5, height: 10, backgroundColor: theme.colors.accent2, borderRadius: 1.5 },
    pendingPinCallout: {
      position: 'absolute',
      backgroundColor: theme.colors.paperDeep,
      borderRadius: 12, borderWidth: 1, borderColor: theme.colors.rule,
      flexDirection: 'row', alignItems: 'center', gap: 10,
      paddingHorizontal: 14, paddingVertical: 12,
      zIndex: 30,
    },
    pendingPinIcon: {
      width: 30, height: 30, borderRadius: 15,
      backgroundColor: `${theme.colors.accent2}22`,
      alignItems: 'center', justifyContent: 'center',
    },
    pendingPinAddr: { ...theme.textVariants.ui, color: theme.colors.ink },
    pendingPinAddBtn: {
      backgroundColor: `${theme.colors.accent2}26`, borderRadius: 8,
      borderWidth: 1, borderColor: theme.colors.accent2,
      paddingHorizontal: 12, paddingVertical: 7,
    },
    pendingPinAddText: { ...theme.textVariants.uiSmall, color: theme.colors.accent2 },
    removeStopBtn: {
      backgroundColor: `${theme.colors.accent}26`, borderRadius: 8,
      borderWidth: 1, borderColor: theme.colors.accent,
      paddingHorizontal: 12, paddingVertical: 7,
    },
    removeStopText: { ...theme.textVariants.uiSmall, color: theme.colors.accent },

    // Route attribute tags
    tagRow:         { flexDirection: 'row', flexWrap: 'wrap', gap: 5, marginTop: 4 },
    tagChip:        { borderRadius: 5, borderWidth: 1, paddingHorizontal: 6, paddingVertical: 2 },
    tagChipPro:     { borderColor: theme.colors.accent2, backgroundColor: `${theme.colors.accent2}1f` },
    tagChipCon:     { borderColor: theme.colors.accent,  backgroundColor: `${theme.colors.accent}1f`  },
    tagChipNeutral: { borderColor: theme.colors.cardEdge, backgroundColor: `${theme.colors.ink}0a`    },
    tagTextPro:     { ...theme.textVariants.meta, color: theme.colors.accent2 },
    tagTextCon:     { ...theme.textVariants.meta, color: theme.colors.accent  },
    tagTextNeutral: { ...theme.textVariants.meta, color: theme.colors.inkSoft },

    // North button pill
    northBtn: {
      position: 'absolute',
      flexDirection: 'row', alignItems: 'center', gap: 5,
      paddingHorizontal: 13, height: 36, borderRadius: 10,
      backgroundColor: theme.colors.paperDeep,
      borderWidth: 1.5, borderColor: theme.colors.cardEdge,
      shadowColor: theme.colors.ink,
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.35,
      shadowRadius: 5,
      elevation: 5,
    },
    northBtnArrow: { ...theme.textVariants.ui,      color: theme.colors.inkSoft },
    northBtnLabel: { ...theme.textVariants.uiSmall, color: theme.colors.inkSoft },

    // Add stop inline panel
    addStopPanel: {
      position: 'absolute',
      backgroundColor: theme.colors.paperDeep,
      borderRadius: 12, borderWidth: 1, borderColor: theme.colors.rule,
      overflow: 'hidden', zIndex: 25,
    },
    addStopRow: {
      flexDirection: 'row', alignItems: 'center', gap: 8,
      paddingHorizontal: 12, paddingVertical: 10,
    },
    addStopIcon:    { fontSize: 13, color: theme.colors.inkSoft },
    addStopInput:   { ...theme.textVariants.ui, color: theme.colors.ink, flex: 1 },
    addStopSuggs:   { maxHeight: 180, borderTopWidth: 1, borderColor: theme.colors.rule },
    addStopSuggRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 12, paddingVertical: 10 },

    // Search pill + chips
    desktopPillWrap: {
      position: 'absolute', top: 12, left: 332, right: 72,
      gap: 8, pointerEvents: 'box-none',
    } as any,
    searchPill: {
      flexDirection: 'row', alignItems: 'center', gap: 10,
      height: 40, borderRadius: 20,
      backgroundColor: theme.colors.paperDeep,
      borderWidth: 1, borderColor: theme.colors.rule,
      paddingHorizontal: 14,
      marginHorizontal: 12,
      shadowColor: theme.colors.ink, shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.3, shadowRadius: 4,
      elevation: 4,
    },
    searchPillIcon:        { fontSize: 14 },
    searchPillText:        { ...theme.textVariants.ui, color: theme.colors.ink, flex: 1 },
    searchPillPlaceholder: { color: theme.colors.inkSoft },
    searchPillAvatar: {
      width: 28, height: 28, borderRadius: 14,
      backgroundColor: theme.colors.cardEdge,
      borderWidth: 1, borderColor: theme.colors.cardEdge,
      alignItems: 'center', justifyContent: 'center',
    },
    chipRow: { paddingHorizontal: 12, paddingVertical: 2, gap: 8, flexDirection: 'row' },
    chip: {
      height: 30, borderRadius: 15,
      paddingHorizontal: 12, justifyContent: 'center',
      backgroundColor: theme.colors.paperDeep,
      borderWidth: 1, borderColor: theme.colors.cardEdge,
    },
    chipActive:     { backgroundColor: `${theme.colors.accent2}26`, borderColor: theme.colors.accent2 },
    chipText:       { ...theme.textVariants.uiSmall, color: theme.colors.inkSoft },
    chipTextActive: { color: theme.colors.accent2 },
  }), [theme]);

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <View style={s.root}>

      {/* ── FULL-SCREEN MAP ─────────────────────────────────────────────── */}
      <MapView
        key={mapStyleId}
        ref={mapRef}
        style={StyleSheet.absoluteFillObject}
        provider={PROVIDER_GOOGLE}
        mapType={activeMapStyle.mapType}
        customMapStyle={activeMapStyle.customMapStyle as any}
        showsUserLocation
        showsMyLocationButton={false}
        showsCompass={false}
        toolbarEnabled={false}
        initialRegion={{ latitude: 34.18, longitude: -118.33, latitudeDelta: 0.12, longitudeDelta: 0.12 }}
        onPress={handleMapPress}
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

        {/* Destination marker */}
        {selectedRoute && (
          <Marker
            coordinate={{ latitude: selectedRoute.destLat, longitude: selectedRoute.destLng }}
            anchor={{ x: 0.5, y: 1 }}
          >
            <View style={s.destPin}><View style={s.destPinDot} /></View>
          </Marker>
        )}

        {/* Manual origin marker (only shown when GPS overridden) */}
        {originMode === 'manual' && originCoords && (
          <Marker coordinate={originCoords} anchor={{ x: 0.5, y: 0.5 }} tracksViewChanges={false}>
            <View style={s.originPin}><View style={s.originPinDot} /></View>
          </Marker>
        )}

        {/* POI dots — amber, capped at 40 */}
        {filteredRoutePOIs.slice(0, 40).map(poi => (
          <Marker
            key={poi.id}
            coordinate={{ latitude: poi.lat, longitude: poi.lng }}
            anchor={{ x: 0.5, y: 0.5 }}
            tracksViewChanges={false}
          >
            <View style={s.poiDot} />
          </Marker>
        ))}

        {/* Stop dots — teal, tappable to remove */}
        {waypoints.map((wp, i) => wp.coords && (
          <Marker
            key={`stop-${i}`}
            coordinate={wp.coords}
            anchor={{ x: 0.5, y: 0.5 }}
            tracksViewChanges={false}
            onPress={() => setPressedStopIdx(i === pressedStopIdx ? null : i)}
          >
            <View style={[s.stopDot, pressedStopIdx === i && s.stopDotActive]} />
          </Marker>
        ))}

        {/* Pending pin — dropped by tapping the map */}
        {pendingPin && (
          <Marker coordinate={pendingPin} anchor={{ x: 0.5, y: 1 }}>
            <View style={s.pendingPinWrap}>
              <View style={s.pendingPinDot} />
              <View style={s.pendingPinStem} />
            </View>
          </Marker>
        )}
      </MapView>

      {/* ── BOTTOM SHEET — route picker (mobile only) ───────────────────── */}
      {!isDesktop && <Animated.View style={[s.sheet, { height: sheetAnim }]}>
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
                    ? <ActivityIndicator size="small" color={theme.colors.accent} />
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
            <View style={[s.legendDot, { backgroundColor: theme.colors.accent }]} />
            <Text style={s.legendText}>POIs</Text>
            <View style={[s.legendDot, { backgroundColor: theme.colors.accent2 }]} />
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

          {/* Absorbs Android system-nav inset so the CTA clears the back-gesture / 3-button bar. */}
          <View style={{ height: 12 + insets.bottom }} />
        </ScrollView>
      </Animated.View>}

      {/* ── SEARCH PILL + CHIPS — mobile ────────────────────────────────── */}
      {!isDesktop && (
        <SafeAreaView style={s.topSafe} pointerEvents="box-none">
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
          <View style={s.logoWrap} pointerEvents="none">
            <XRoadLogo size="sm" />
          </View>
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
              ? <ActivityIndicator size="small" color={theme.colors.accent2} style={{ marginRight: 4 }} />
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
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={s.chipRow}
            style={{ pointerEvents: 'box-none' } as any}
          >
            {CAT_CHIPS.map(chip => {
              const active = activeCatChips.has(chip);
              return (
                <TouchableOpacity
                  key={chip}
                  style={[s.chip, active && s.chipActive]}
                  onPress={() => setActiveCatChips(prev => {
                    const next = new Set(prev);
                    active ? next.delete(chip) : next.add(chip);
                    return next;
                  })}
                  activeOpacity={0.8}
                >
                  <Text style={[s.chipText, active && s.chipTextActive]}>{chip}</Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>
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
                <View style={[s.searchDot, { backgroundColor: originMode === 'gps' ? theme.colors.accent2 : theme.colors.accent2 }]} />
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
                    <View style={[s.searchDot, { backgroundColor: theme.colors.accent2 }]} />
                    <Text style={s.originText} numberOfLines={1}>{wp.text}</Text>
                    <TouchableOpacity onPress={() => removeWaypoint(i)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                      <Text style={s.clearBtn}>✕</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              ))}
              <View style={s.searchDivider} />
              <TouchableOpacity style={s.searchRow} onPress={() => openLocOverlay('dest')} activeOpacity={0.7}>
                <View style={[s.searchDot, { backgroundColor: theme.colors.accent }]} />
                <Text style={[s.destText, !destination && s.destPlaceholder]} numberOfLines={1}>
                  {destination || 'Where to?'}
                </Text>
                {loadingRoute
                  ? <ActivityIndicator size="small" color={theme.colors.accent2} />
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
                      {r.poiCount === null ? <ActivityIndicator size="small" color={theme.colors.accent} /> : <Text style={[s.storiesText, isSelected && s.storiesTextSel]}>{r.poiCount} {r.poiCount === 1 ? 'story' : 'stories'}</Text>}
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
                <View style={[s.legendDot, { backgroundColor: theme.colors.accent }]} />
                <Text style={s.legendText}>POIs</Text>
                <View style={[s.legendDot, { backgroundColor: theme.colors.accent2 }]} />
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
              ? <ActivityIndicator size="small" color={theme.colors.accent2} style={{ marginRight: 4 }} />
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
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={s.chipRow}
          >
            {CAT_CHIPS.map(chip => {
              const active = activeCatChips.has(chip);
              return (
                <TouchableOpacity
                  key={chip}
                  style={[s.chip, active && s.chipActive]}
                  onPress={() => setActiveCatChips(prev => {
                    const next = new Set(prev);
                    active ? next.delete(chip) : next.add(chip);
                    return next;
                  })}
                  activeOpacity={0.8}
                >
                  <Text style={[s.chipText, active && s.chipTextActive]}>{chip}</Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>
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

      {/* ── PENDING PIN CALLOUT ──────────────────────────────────────────── */}
      {pendingPin && (
        <View style={[
          s.pendingPinCallout,
          isDesktop ? { left: 332, right: 12, bottom: 20 } : { left: 12, right: 12, bottom: 110 },
        ]}>
          <View style={s.pendingPinIcon}>
            <Text style={{ fontSize: 14 }}>📍</Text>
          </View>
          <View style={{ flex: 1 }}>
            {pendingPinLoading
              ? <Text style={s.pendingPinAddr}>Finding address…</Text>
              : <Text style={s.pendingPinAddr} numberOfLines={2}>{pendingPinName}</Text>
            }
          </View>
          <TouchableOpacity style={s.pendingPinAddBtn} onPress={confirmPinAsStop}>
            <Text style={s.pendingPinAddText}>Add stop</Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => { setPendingPin(null); setPendingPinName(''); }}
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
                  <ActivityIndicator size="small" color={theme.colors.accent2} />
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
