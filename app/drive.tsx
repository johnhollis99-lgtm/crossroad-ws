/**
 * RoadStory — Drive screen
 *
 * Full-screen map with dark earthy bottom sheet overlay.
 * Audio narration via socket.io. GPS tracking with location emit.
 *
 * INSTALL: npm install socket.io-client
 *
 * Receives (all JSON strings):
 *   narrator, filters, routePreview, originLocation, destination, tripId
 */

import React, {
  useCallback, useEffect, useMemo, useRef, useState,
} from 'react';
import {
  Alert, Animated, Dimensions, LayoutChangeEvent, PanResponder,
  Platform, ScrollView, Share, StatusBar,
  StyleSheet, Text, TouchableOpacity, View,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import MapView, { Marker, Polyline, PROVIDER_GOOGLE } from 'react-native-maps';
import { CommonActions, useNavigation, useRoute } from '@react-navigation/native';
import { Audio, AVPlaybackStatus } from 'expo-av';
import * as Location from 'expo-location';
import type { LocationSubscription } from 'expo-location';
import { getPOIsAlongRoute, submitContribution } from '../lib/supabase';
import type { POI, NarratorRecord } from '../lib/supabase';
import { C } from '../lib/theme';
import { MapStyleId, MAP_STYLES, loadMapStyle, saveMapStyle } from '../lib/mapStyle';
import { MapStylePicker } from '../components/MapStylePicker';
import { useSheetSnap } from '../hooks/useSheetSnap';
import { PoiMarkerX, usePoiMarkerTracking, Wordmark } from '../src/components';
import { haversineM, arcLengthAlongRoute } from '../src/lib/geo';
import { curateRoutePOIs, type Density } from '../src/lib/curation/curateRoutePOIs';

let ioConnect: ((url: string, opts: object) => any) | null = null;
try { ioConnect = require('socket.io-client').io; } catch { /* real-time disabled */ }

// ── Constants ────────────────────────────────────────────────────────────────

const { height: SCREEN_H } = Dimensions.get('window');
const DRIVE_SNAPS = {
  peek:     96,
  default:  Math.round(SCREEN_H * 0.82),
  expanded: Math.round(SCREEN_H * 0.82),
};
const GPS_EMIT_MS    = 5000;
const STATUS_BAR_PAD = Platform.OS === 'ios' ? 52 : ((StatusBar.currentHeight ?? 24) + 10);
const POI_MIN  = 0;
const POI_MAX  = 20;
const POI_STEP = 0.5;

const SERVER_URL   = process.env.EXPO_PUBLIC_SERVER_URL ?? 'http://localhost:3001';
const MAPBOX_TOKEN = process.env.EXPO_PUBLIC_MAPBOX_TOKEN!;

// ── Types ────────────────────────────────────────────────────────────────────

interface NowPlayingData {
  poi_id: string;
  poi_name: string;
  audio_url: string;
  estimated_seconds: number;
}

interface QueueItem {
  id: string;
  name: string;
  distanceMi: number;
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function parse<T>(s: string | undefined, fallback: T): T {
  try { return s ? (JSON.parse(s) as T) : fallback; } catch { return fallback; }
}

function fmtSeconds(s: number): string {
  const m   = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  return `${m}:${sec.toString().padStart(2, '0')}`;
}

function fmtMiles(mi: number | undefined | null): string {
  if (mi == null || !Number.isFinite(mi)) return '—';
  return mi < 0.1 ? `${Math.round(mi * 5280)} ft` : `${mi.toFixed(1)} mi`;
}

// haversineM + arcLengthAlongRoute lifted to src/lib/geo so the curation
// function (src/lib/curation/) shares the same implementation.

// ── POI distance slider ───────────────────────────────────────────────────────

function PoiSlider({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  const trackWidth = useRef(0);
  const pct = (value - POI_MIN) / (POI_MAX - POI_MIN);
  const pan = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder:  () => true,
      onPanResponderGrant: (e) => snap(e.nativeEvent.locationX),
      onPanResponderMove:  (e) => snap(e.nativeEvent.locationX),
    })
  ).current;
  function snap(x: number) {
    const ratio = Math.max(0, Math.min(1, x / (trackWidth.current || 1)));
    const raw   = POI_MIN + ratio * (POI_MAX - POI_MIN);
    onChange(Math.round(raw / POI_STEP) * POI_STEP);
  }
  return (
    <View
      style={sl.track}
      onLayout={(e: LayoutChangeEvent) => { trackWidth.current = e.nativeEvent.layout.width; }}
      {...pan.panHandlers}
      hitSlop={{ top: 16, bottom: 16 }}
    >
      <View style={[sl.fill, { width: `${pct * 100}%` as any }]} />
      <View style={[sl.thumb, { left: `${pct * 100}%` as any }]} />
    </View>
  );
}
const sl = StyleSheet.create({
  track: { flex: 1, height: 4, backgroundColor: C.BORDER_SUBTLE, borderRadius: 2, position: 'relative', justifyContent: 'center' },
  fill:  { height: 4, backgroundColor: C.ACCENT, borderRadius: 2, position: 'absolute', left: 0 },
  thumb: { width: 22, height: 22, borderRadius: 11, backgroundColor: C.BG_BASE, borderWidth: 2.5, borderColor: C.ACCENT_TEXT, position: 'absolute', marginLeft: -11, top: -9, elevation: 4, ...Platform.select({ web: { boxShadow: '0 2px 4px rgba(0,0,0,0.4)' }, default: { shadowColor: '#000', shadowOpacity: 0.4, shadowRadius: 4, shadowOffset: { width: 0, height: 2 } } }) },
});

// ── POI marker (drift 5.94) ───────────────────────────────────────────────────
// Inactive corridor POIs render as ink-red X marks via PoiMarkerX (shared with
// home). Active = currently-narrating POI keeps the legacy halo + inner-dot
// visual since it functions as a now-playing indicator distinct from the
// generic POI marker. tracksViewChanges flips true → false after 1s.
function DrivePoiMarker({
  poi, isActive, onPress, activeStyle, activeDotStyle,
}: {
  poi: POI;
  isActive: boolean;
  onPress: () => void;
  activeStyle: any;
  activeDotStyle: any;
}) {
  const tracking = usePoiMarkerTracking();
  return (
    <Marker
      coordinate={{ latitude: poi.lat, longitude: poi.lng }}
      anchor={{ x: 0.5, y: 0.5 }}
      tracksViewChanges={tracking}
      onPress={onPress}
    >
      {isActive
        ? <View style={activeStyle}><View style={activeDotStyle} /></View>
        : <PoiMarkerX size="curated" />}
    </Marker>
  );
}

// ── Main screen ───────────────────────────────────────────────────────────────

export default function Drive() {
  const navigation = useNavigation<any>();
  const route      = useRoute<any>();
  const params     = route.params ?? {};

  const narrator      = parse<NarratorRecord | null>(params.narrator, null);
  const filters       = parse<Record<string, any>>(params.filters, {});
  const routePreview  = parse<Record<string, any>>(params.routePreview, {});
  const origin        = parse<Record<string, any>>(params.originLocation, {});
  const destination   = params.destination ?? 'Destination';
  const tripId        = params.tripId ?? null;
  const totalStories  = routePreview.storyCount ?? 0;
  const routeId       = tripId ?? 'default';

  // ── Refs ──────────────────────────────────────────────────────────────────
  const mapRef         = useRef<MapView>(null);
  const soundRef       = useRef<Audio.Sound | null>(null);
  const socketRef      = useRef<any>(null);
  const locationSub    = useRef<LocationSubscription | null>(null);
  const locationRef    = useRef<{ latitude: number; longitude: number } | null>(null);
  const emitTimer      = useRef<ReturnType<typeof setInterval> | null>(null);
  const cardAnim       = useRef(new Animated.Value(0)).current;
  const pulseAnim      = useRef(new Animated.Value(1)).current;
  const pulseLoop      = useRef<Animated.CompositeAnimation | null>(null);
  const nowPlayingRef  = useRef<NowPlayingData | null>(null);
  const playHistoryRef = useRef<NowPlayingData[]>([]);
  const poiArcMapRef   = useRef<Map<string, number>>(new Map());

  // ── State ─────────────────────────────────────────────────────────────────
  const [pois,         setPois]         = useState<POI[]>([]);
  const [queue,        setQueue]        = useState<QueueItem[]>([]);
  const [nowPlaying,   setNowPlaying]   = useState<NowPlayingData | null>(null);
  const [showCard,     setShowCard]     = useState(false);
  const [playProgress, setPlayProgress] = useState(0);
  const [playElapsed,  setPlayElapsed]  = useState(0);
  const [playDuration, setPlayDuration] = useState(0);
  const [isPlaying,    setIsPlaying]    = useState(false);
  const [quietMode,    setQuietMode]    = useState(false);
  const [trailMode,    setTrailMode]    = useState(false);
  const [userLocation, setUserLocation] = useState<{ latitude: number; longitude: number } | null>(null);
  const [mapStyleId,   setMapStyleId]   = useState<MapStyleId>('dark');
  const [elapsedMin,   setElapsedMin]   = useState(0);
  const [selectedPoi,  setSelectedPoi]  = useState<POI | null>(null);
  const [ratedPois,    setRatedPois]    = useState<Set<string>>(new Set());
  const [poiDist,      setPoiDist]      = useState<number>(filters.corridorMi ?? 1);

  // Peek must clear Android nav / gesture zone — base 96 + insets.bottom + 16
  // safety buffer so the End trip button never sits inside the system overlay.
  const insets = useSafeAreaInsets();
  const driveSnaps = useMemo(() => ({
    peek:     DRIVE_SNAPS.peek + insets.bottom + 16,
    default:  DRIVE_SNAPS.default,
    expanded: DRIVE_SNAPS.expanded,
  }), [insets.bottom]);

  const { anim: sheetAnim, panHandlers: sheetPan, level: snapLevel } =
    useSheetSnap(driveSnaps, 'expanded');

  useEffect(() => { loadMapStyle().then(setMapStyleId); }, []);
  const handleMapStyleChange = (id: MapStyleId) => { setMapStyleId(id); saveMapStyle(id); };

  // Trail mode auto-switches to Topo; restores previous style when toggled off
  const prevStyleRef = useRef<MapStyleId>('dark');
  useEffect(() => {
    if (trailMode) {
      if (mapStyleId !== 'topo') prevStyleRef.current = mapStyleId;
      handleMapStyleChange('topo');
    } else {
      handleMapStyleChange(prevStyleRef.current);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [trailMode]);

  // Fit map to full route on mount so the polyline is visible before GPS starts
  useEffect(() => {
    const coords = routePreview.polylineCoords;
    if (!coords?.length) return;
    const timer = setTimeout(() => {
      mapRef.current?.fitToCoordinates(coords, {
        edgePadding: { top: 120, right: 32, bottom: DRIVE_SNAPS.default + 32, left: 32 },
        animated: true,
      });
    }, 400);
    return () => clearTimeout(timer);
  }, []);

  // Elapsed-minutes timer for ETA countdown
  useEffect(() => {
    const t = setInterval(() => setElapsedMin(m => m + 1), 60_000);
    return () => clearInterval(t);
  }, []);
  const activeMapStyle = MAP_STYLES[mapStyleId];

  const initialRegion = useMemo(() => ({
    latitude:      origin.latitude  ?? routePreview.polylineCoords?.[0]?.latitude  ?? 34.05,
    longitude:     origin.longitude ?? routePreview.polylineCoords?.[0]?.longitude ?? -118.24,
    latitudeDelta: 0.05,
    longitudeDelta: 0.05,
  }), []);

  // ── Audio ─────────────────────────────────────────────────────────────────
  const stopAudio = useCallback(async () => {
    if (!soundRef.current) return;
    try {
      await soundRef.current.stopAsync();
      await soundRef.current.unloadAsync();
    } catch { /* already unloaded */ }
    soundRef.current = null;
    setIsPlaying(false);
  }, []);

  const onAudioStatus = useCallback((status: AVPlaybackStatus) => {
    if (!status.isLoaded) return;
    const elapsed  = (status.positionMillis ?? 0) / 1000;
    const duration = (status.durationMillis ?? 0) / 1000;
    setPlayElapsed(elapsed);
    setPlayDuration(duration);
    setPlayProgress(duration > 0 ? elapsed / duration : 0);
    setIsPlaying(status.isPlaying ?? false);
    if (status.didJustFinish) {
      setNowPlaying(null);
      setPlayProgress(0);
      setPlayElapsed(0);
    }
  }, []);

  const playAudio = useCallback(async (url: string) => {
    await stopAudio();
    await Audio.setAudioModeAsync({ playsInSilentModeIOS: true, staysActiveInBackground: true });
    const { sound } = await Audio.Sound.createAsync(
      { uri: url },
      { shouldPlay: true },
      onAudioStatus
    );
    soundRef.current = sound;
  }, [stopAudio, onAudioStatus]);

  const togglePlayPause = useCallback(async () => {
    if (!soundRef.current) return;
    try {
      if (isPlaying) {
        await soundRef.current.pauseAsync();
      } else {
        await soundRef.current.playAsync();
      }
    } catch {}
  }, [isPlaying]);

  // Sync shadow ref so socket handler + skip controls always see current track
  useEffect(() => { nowPlayingRef.current = nowPlaying; }, [nowPlaying]);

  // ── Skip back — replay from 0:00, or jump to previous if < 3s in ─────────
  const handleSkipBack = useCallback(async () => {
    if (playElapsed < 3 && playHistoryRef.current.length > 0) {
      const prev = playHistoryRef.current[playHistoryRef.current.length - 1];
      playHistoryRef.current = playHistoryRef.current.slice(0, -1);
      setNowPlaying(prev);
      await playAudio(prev.audio_url);
    } else if (soundRef.current) {
      try {
        await soundRef.current.setPositionAsync(0);
        if (!isPlaying) await soundRef.current.playAsync();
      } catch {}
    }
  }, [playElapsed, isPlaying, playAudio]);

  // ── Skip forward — stop current, emit analytics, advance queue ───────────
  const handleSkipForward = useCallback(async () => {
    const current = nowPlayingRef.current;
    if (!current) return;

    socketRef.current?.emit('trip:narration_skipped', {
      trip_id:            tripId,
      poi_id:             current.poi_id,
      skipped_at_seconds: Math.round(playElapsed),
    });

    await stopAudio();
    setNowPlaying(null);
    setPlayProgress(0);
    setPlayElapsed(0);
    setStoryCount(n => n + 1);
    setQueue(q => q.filter(item => item.id !== current.poi_id));
  }, [playElapsed, tripId, stopAudio]);

  // ── Now-playing card animation ────────────────────────────────────────────
  useEffect(() => {
    if (nowPlaying) {
      setShowCard(true);
      Animated.spring(cardAnim, { toValue: 1, useNativeDriver: true, tension: 80, friction: 12 }).start();
    } else {
      Animated.timing(cardAnim, { toValue: 0, duration: 220, useNativeDriver: true })
        .start(() => setShowCard(false));
    }
  }, [nowPlaying, cardAnim]);

  // ── Narrator pulse ────────────────────────────────────────────────────────
  useEffect(() => {
    if (isPlaying) {
      pulseLoop.current = Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, { toValue: 0.25, duration: 650, useNativeDriver: true }),
          Animated.timing(pulseAnim, { toValue: 1,    duration: 650, useNativeDriver: true }),
        ])
      );
      pulseLoop.current.start();
    } else {
      pulseLoop.current?.stop();
      pulseAnim.setValue(1);
    }
  }, [isPlaying, pulseAnim]);

  // ── Socket.io ─────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!ioConnect) return;
    const sock = ioConnect(SERVER_URL, { transports: ['websocket'] });
    socketRef.current = sock;
    sock.emit('join_room', `route-${routeId}`);

    sock.on('play_narration', (data: NowPlayingData) => {
      if (quietRef.current) return;
      // Save outgoing track to history before replacing (capped at 5)
      if (nowPlayingRef.current) {
        playHistoryRef.current = [
          ...playHistoryRef.current.slice(-4),
          nowPlayingRef.current,
        ];
      }
      setNowPlaying(data);
      playAudio(data.audio_url);
    });

    sock.on('narration_queued', (data: { next_pois: QueueItem[] }) => {
      setQueue(data.next_pois ?? []);
    });

    return () => { sock.disconnect(); socketRef.current = null; };
  }, [routeId, playAudio]);

  const quietRef = useRef(quietMode);
  useEffect(() => { quietRef.current = quietMode; }, [quietMode]);

  // ── GPS tracking ──────────────────────────────────────────────────────────
  useEffect(() => {
    (async () => {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') return;

      locationSub.current = await Location.watchPositionAsync(
        { accuracy: Location.Accuracy.BestForNavigation, distanceInterval: 30, timeInterval: 3000 },
        loc => {
          const coords = { latitude: loc.coords.latitude, longitude: loc.coords.longitude };
          locationRef.current = coords;
          setUserLocation(coords);
          mapRef.current?.animateCamera({ center: coords, zoom: 15 }, { duration: 600 });
        }
      );

      emitTimer.current = setInterval(() => {
        if (locationRef.current && socketRef.current) {
          socketRef.current.emit('update_location', {
            room: `route-${routeId}`,
            lat:  locationRef.current.latitude,
            lng:  locationRef.current.longitude,
          });
        }
      }, GPS_EMIT_MS);
    })();

    return () => {
      locationSub.current?.remove();
      if (emitTimer.current) clearInterval(emitTimer.current);
    };
  }, [routeId]);

  // ── POI load ──────────────────────────────────────────────────────────────
  useEffect(() => {
    (async () => {
      const polyline   = routePreview.polylineCoords ?? [];
      const cats: string[] | null = filters.categoryFilter?.length ? filters.categoryFilter : null;
      const mode = trailMode ? 'hiking' : 'driving';
      // Curation params come from customize via filters (drift 5.75 / 5.77 / 5.76).
      const density:      Density = (filters.density as Density) ?? 'balanced';
      const minRelevance: number  = filters.minRelevance ?? 0;

      if (__DEV__) {
        console.info('[drive] fetch:start',
          'polyline=' + polyline.length,
          'corridorMi=' + poiDist,
          'mode=' + mode,
          'density=' + density,
          'minRelevance=' + minRelevance,
          'categories=' + (cats?.join(',') ?? 'all'),
        );
      }

      // Pull the corridor sorted by significance DESC so curation's per-bin
      // pass picks the most-relevant POI in each bin. Server-side LIMIT 500
      // bounds round-trip size; curation trims further client-side.
      const fetched = await getPOIsAlongRoute(
        polyline, poiDist, cats, mode,
        { sortMode: 'significance_desc', minSignificance: minRelevance, resultLimit: 500 },
      );

      // B7 (drift 5.74 + 5.76) — curate the fetched corridor down to a
      // right-sized set. Drive consumes the curated array directly; no
      // separate slice cap (the 40-marker cap on home is also gone).
      const durationMin = (routePreview.durationMin as number | undefined) ?? 0;
      const tripModeForCuration = mode === 'hiking' ? 'hiking' : 'driving';
      const HIKING_PACE_MIN_PER_MI = 20;
      const effectiveDuration = durationMin > 0
        ? durationMin
        : ((routePreview.distanceMi as number | undefined) ?? 0) *
          (tripModeForCuration === 'hiking' ? HIKING_PACE_MIN_PER_MI : 1);
      const curated = curateRoutePOIs({
        rawPOIs: fetched,
        routePolyline: polyline,
        durationMinutes: effectiveDuration,
        tripMode: tripModeForCuration,
        density,
        minRelevance,
        activeCategories: cats ?? [],
      });

      if (__DEV__) {
        console.info('[drive] fetch:state-set',
          'fetched=' + fetched.length,
          'curated=' + curated.count,
          'avgPaceMin=' + curated.avgPaceMinutes.toFixed(1),
        );
      }

      // Project each curated POI onto the route polyline to get
      // sequential arc-distance from start (used for queue ordering,
      // map marker draw order, and the drive stats strip's
      // POIs-ahead computation).
      const withArc = curated.curatedPOIs.map(p => ({
        poi: p,
        arc: arcLengthAlongRoute(p.lat, p.lng, polyline),
      }));
      withArc.sort((a, b) => a.arc - b.arc);

      const sorted = withArc.map(w => w.poi);
      const arcMap = new Map(withArc.map(w => [w.poi.id, w.arc]));
      poiArcMapRef.current = arcMap;

      setPois(sorted);
      setQueue(sorted.slice(0, 5).map(p => ({
        id:         p.id,
        name:       p.name,
        distanceMi: (arcMap.get(p.id) ?? 0) / 1609,
      })));
    })();
  }, [params.routePreview, trailMode, poiDist]);

  // ── Diagnostic: render-side observability for corridor POI markers ─────────
  // Persistent observability — pois is the curated set (B7). Count here
  // mirrors curation output for cross-check against `[drive] fetch:state-set`.
  useEffect(() => {
    if (__DEV__) {
      console.info('[drive] render:markers source=pois count=' + pois.length);
    }
  }, [pois.length]);

  // ── Re-center ─────────────────────────────────────────────────────────────
  const recenter = useCallback(() => {
    const loc = locationRef.current;
    if (loc) mapRef.current?.animateCamera({ center: loc, zoom: 15 }, { duration: 500 });
  }, []);

  // ── End trip ──────────────────────────────────────────────────────────────
  const doEndTrip = useCallback(() => {
    stopAudio().catch(() => {});
    socketRef.current?.disconnect();
    navigation.dispatch(CommonActions.reset({ index: 0, routes: [{ name: 'index' }] }));
  }, [stopAudio, navigation]);

  const handleEndTrip = useCallback(() => {
    if (Platform.OS === 'web') {
      if (window.confirm('End trip?')) doEndTrip();
      return;
    }
    Alert.alert(
      'End trip?', '',
      [
        { text: 'Keep driving', style: 'cancel' },
        { text: 'End trip', style: 'destructive', onPress: doEndTrip },
      ],
      { cancelable: true }
    );
  }, [doEndTrip]);

  const handleGoBack = useCallback(() => {
    if (Platform.OS === 'web') {
      if (window.confirm('Leave trip and go back?')) {
        stopAudio().catch(() => {});
        socketRef.current?.disconnect();
        navigation.goBack();
      }
      return;
    }
    Alert.alert(
      'Leave trip?', '',
      [
        { text: 'Stay', style: 'cancel' },
        { text: 'Go back', onPress: () => {
          stopAudio().catch(() => {});
          socketRef.current?.disconnect();
          navigation.goBack();
        }},
      ],
      { cancelable: true }
    );
  }, [stopAudio, navigation]);

  // ── Render ────────────────────────────────────────────────────────────────
  const avatarBg    = narrator?.avatar_color_bg  ?? '#1E3A5F';
  const avatarTxt   = narrator?.avatar_color_text ?? C.WHITE;
  const cardBg      = narratorCardBg(avatarBg);
  const activePoiId = nowPlaying?.poi_id;

  const remainingMin  = Math.max(0, (routePreview.durationMin ?? 0) - elapsedMin);
  const remainingMi   = routePreview.distanceMi ?? 0;

  // Live queue — distances update from GPS position when available.
  // Falls back to arc-length distances (from route start) before GPS is acquired.
  const liveQueue = useMemo(() => {
    if (!userLocation) return queue;
    return queue.map(item => {
      const poi = pois.find(p => p.id === item.id);
      if (!poi) return item;
      return { ...item, distanceMi: haversineM(userLocation.latitude, userLocation.longitude, poi.lat, poi.lng) / 1609 };
    });
  }, [queue, pois, userLocation]);

  const nextPoiDist      = liveQueue[0]?.distanceMi;
  const storiesAvailable = pois.length > 0 ? pois.length : totalStories;

  // ── Stats strip (B6 / drift 5.78) ────────────────────────────────────────
  // "POIs ahead · 1 every Xm" — recomputes as user advances along the route.
  const poisAhead = useMemo(() => {
    if (!userLocation || pois.length === 0) return pois.length;
    const userArc = arcLengthAlongRoute(
      userLocation.latitude, userLocation.longitude,
      routePreview.polylineCoords ?? [],
    );
    let n = 0;
    for (const p of pois) {
      const arc = poiArcMapRef.current.get(p.id) ?? 0;
      if (arc > userArc) n++;
    }
    return n;
  }, [pois, userLocation, routePreview.polylineCoords]);

  const avgPaceAheadMin = useMemo(() => {
    if (poisAhead === 0) return 0;
    return Math.max(1, Math.round(Math.max(0, remainingMin) / poisAhead));
  }, [poisAhead, remainingMin]);

  const handleFeedback = async (poiId: string, rating: 'up' | 'down') => {
    setRatedPois(prev => new Set(prev).add(poiId));
    await submitContribution({
      userId: tripId ?? 'anonymous',
      type:   'narration_rating',
      poiId,
      details: { rating, narrator_slug: narrator?.slug ?? '' },
    });
  };

  const handleShare = () => {
    const msg = nowPlaying
      ? `Just heard about "${nowPlaying.poi_name}" on my XRoad trip to ${params.destination ?? 'my destination'}!`
      : `Exploring ${params.destination ?? 'somewhere new'} with XRoad!`;
    Share.share({ message: msg });
  };

  return (
    <View style={s.root}>
      <StatusBar translucent barStyle="light-content" backgroundColor="transparent" />

      {/* ── FULL-SCREEN MAP ─────────────────────────────────────────────── */}
      <MapView
        key={mapStyleId}
        ref={mapRef}
        style={StyleSheet.absoluteFillObject}
        provider={PROVIDER_GOOGLE}
        mapType={activeMapStyle.mapType}
        customMapStyle={activeMapStyle.customMapStyle as any}
        initialRegion={initialRegion}
        showsUserLocation={false}
        showsMyLocationButton={false}
        showsCompass={false}
        toolbarEnabled={false}
      >
        {routePreview.polylineCoords?.length > 1 && (
          <Polyline
            coordinates={routePreview.polylineCoords}
            strokeColor="#4A90D9"
            strokeWidth={5}
            lineCap="round"
            lineJoin="round"
          />
        )}

        {userLocation && (
          <Marker coordinate={userLocation} anchor={{ x: 0.5, y: 0.5 }}>
            <View style={s.userLocOuter}>
              <View style={s.userLocInner} />
            </View>
          </Marker>
        )}

        {/* Corridor POI dots — tracksViewChanges omitted (drift 5.66): on
            react-native-maps 1.20.1 + Android, setting tracksViewChanges={false}
            on a Marker with a custom View child captures an empty bitmap before
            the child renders, leaving the marker invisible. Default true is the
            visibility-safe choice. Perf note: 1000-marker corridors re-snapshot
            on each prop change; if pan/zoom jitters at scale, switch to a
            delayed-flip pattern (track=true initially, flip false after mount). */}
        {pois.map(poi => (
          <DrivePoiMarker
            key={poi.id}
            poi={poi}
            isActive={poi.id === activePoiId}
            onPress={() => setSelectedPoi(prev => prev?.id === poi.id ? null : poi)}
            activeStyle={s.poiActive}
            activeDotStyle={s.poiActiveDot}
          />
        ))}
      </MapView>

      {/* ── TOP OVERLAYS ─────────────────────────────────────────────────── */}

      {/* Top-left: back button + narrator chip */}
      <View style={[s.overlayTL, { top: STATUS_BAR_PAD }]}>
        <TouchableOpacity style={s.topBackBtn} onPress={handleGoBack} activeOpacity={0.7}>
          <Text style={s.topBackArrow}>←</Text>
        </TouchableOpacity>
        <View style={[s.avatarCircle, { backgroundColor: avatarBg }]}>
          <Text style={[s.avatarInitials, { color: avatarTxt }]}>
            {narrator?.avatar_initials ?? '??'}
          </Text>
        </View>
        <View>
          <Text style={s.overlayName} numberOfLines={1}>
            {narrator?.name ?? 'Narrator'}
          </Text>
          <View style={s.statusRow}>
            <Animated.View style={[s.statusDot, { opacity: isPlaying ? pulseAnim : 0 }]} />
            <Text style={s.statusText}>{isPlaying ? 'Narrating' : ' '}</Text>
          </View>
        </View>
      </View>

      {/* Top-right: total stories available along route */}
      <View style={[s.overlayTR, { top: STATUS_BAR_PAD }]}>
        <Text style={s.storyCountLabel}>{storiesAvailable}</Text>
        <Text style={s.storyCountUnit}>{storiesAvailable === 1 ? 'story' : 'stories'}</Text>
      </View>

      {/* ETA card — full-width, below top overlays */}
      <View style={[s.etaCard, { top: STATUS_BAR_PAD + 56 }]}>
        <View style={s.etaCell}>
          <Text style={s.etaValue}>
            {remainingMin < 60
              ? `${remainingMin}m`
              : `${Math.floor(remainingMin / 60)}h ${remainingMin % 60}m`}
          </Text>
          <Text style={s.etaLabel}>remaining</Text>
        </View>
        <View style={s.etaDivider} />
        <View style={s.etaCell}>
          <Text style={s.etaValue}>{fmtMiles(remainingMi)}</Text>
          <Text style={s.etaLabel}>distance</Text>
        </View>
        <View style={s.etaDivider} />
        <View style={s.etaCell}>
          <Text style={s.etaValue}>
            {nextPoiDist !== undefined ? fmtMiles(nextPoiDist) : '—'}
          </Text>
          <Text style={s.etaLabel}>next story</Text>
        </View>
      </View>

      {/* Quiet mode badge */}
      {quietMode && (
        <View style={[s.quietBadge, { top: STATUS_BAR_PAD + 126 }]}>
          <Text style={s.quietBadgeText}>🔇 Quiet mode</Text>
        </View>
      )}

      {/* Map style picker — bottom-right, above peeked sheet */}
      <MapStylePicker
        value={mapStyleId}
        onChange={handleMapStyleChange}
        mapboxToken={MAPBOX_TOKEN}
        buttonBottom={driveSnaps.peek + 16}
        buttonRight={12}
      />

      {/* Recenter button — above map style picker */}
      <TouchableOpacity
        style={[s.recenterBtn, { bottom: driveSnaps.peek + 64 }]}
        onPress={recenter}
        hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        activeOpacity={0.7}
      >
        <CompassIcon />
      </TouchableOpacity>

      {/* ── POI callout card ─────────────────────────────────────────────── */}
      {selectedPoi && (
        <View style={[s.poiCallout, { bottom: driveSnaps.peek + 20 }]}>
          <View style={s.poiCalloutHeader}>
            <Text style={s.poiCalloutName} numberOfLines={2}>{selectedPoi.name}</Text>
            <TouchableOpacity
              style={s.poiCalloutClose}
              onPress={() => setSelectedPoi(null)}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <Text style={s.poiCalloutCloseIcon}>×</Text>
            </TouchableOpacity>
          </View>
          {!!selectedPoi.category && (
            <Text style={s.poiCalloutCategory}>{selectedPoi.category}</Text>
          )}
          {selectedPoi.tags?.length > 0 && (
            <View style={s.poiCalloutTags}>
              {selectedPoi.tags.slice(0, 5).map((tag, i) => (
                <View key={i} style={s.poiCalloutTag}>
                  <Text style={s.poiCalloutTagText}>{tag.replace(/_/g, ' ')}</Text>
                </View>
              ))}
            </View>
          )}
        </View>
      )}

      {/* ── DRAGGABLE BOTTOM SHEET ───────────────────────────────────────── */}
      <Animated.View style={[s.bottomSheet, { height: sheetAnim }]}>

        {/* Drag handle */}
        <View {...sheetPan} style={s.dragHandleWrap}>
          <View style={s.dragHandle} />
          <View style={s.driveLogoWrap}>
            <Wordmark size="m" />
          </View>
        </View>

        {/* ── Stats strip (B6 / drift 5.78) — visible in peek + expanded. */}
        <View style={s.driveStatsStrip}>
          <Text style={s.driveStatsText} numberOfLines={1}>
            {poisAhead} {poisAhead === 1 ? 'POI' : 'POIs'} ahead
            {poisAhead > 0 ? `  ·  1 every ${avgPaceAheadMin}m` : ''}
          </Text>
        </View>

        {/* ── PEEK: play/pause + skip forward + end trip ────────────── */}
        {snapLevel === 'peek' && (
          <View style={s.peekRow}>
            <TouchableOpacity style={s.audioPlayBtn} onPress={togglePlayPause} activeOpacity={0.8}>
              <Text style={s.audioPlayIcon}>{isPlaying ? '⏸' : '▶'}</Text>
            </TouchableOpacity>
            <TouchableOpacity style={s.audioSkipBtn} onPress={handleSkipForward} activeOpacity={0.7} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
              <Text style={s.audioSkipIcon}>⏭</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[s.endTripBtn, { flex: 1 }]} onPress={handleEndTrip} activeOpacity={0.8}>
              <Text style={s.endTripBtnText}>End trip</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* ── EXPANDED: all controls locked together ────────────────── */}
        {snapLevel !== 'peek' && (
          <>
            {/* Scrollable middle — now playing + controls + queue + slider */}
            <ScrollView style={s.sheetMiddle} showsVerticalScrollIndicator={false} bounces={false}>

              {/* Now playing card */}
              {showCard && (
                <Animated.View style={[
                  s.nowPlayingCard,
                  { backgroundColor: cardBg, opacity: cardAnim,
                    transform: [{ translateY: cardAnim.interpolate({ inputRange: [0, 1], outputRange: [12, 0] }) }] },
                ]}>
                  <View style={s.nowPlayingHeader}>
                    <View style={[s.nowPlayingDot, { backgroundColor: avatarBg }]} />
                    <Text style={s.nowPlayingBadge}>Now playing</Text>
                  </View>
                  <Text style={s.nowPlayingName} numberOfLines={1}>
                    {nowPlaying?.poi_name ?? ''}
                  </Text>
                  <View style={s.progressRail}>
                    <View style={[s.progressFill, { width: `${Math.min(playProgress * 100, 100)}%` as any }]} />
                  </View>
                  <View style={s.progressLabels}>
                    <Text style={s.progressTime}>{fmtSeconds(playElapsed)}</Text>
                    <Text style={s.progressTime}>
                      {fmtSeconds(playDuration || (nowPlaying?.estimated_seconds ?? 0))}
                    </Text>
                  </View>
                </Animated.View>
              )}

              {/* Feedback card (when narrating) */}
              {nowPlaying && (
                <View style={s.feedbackCard}>
                  <Text style={s.feedbackTitle} numberOfLines={2}>{nowPlaying.poi_name}</Text>
                  <Text style={s.feedbackQuestion}>Rate this story</Text>
                  {ratedPois.has(nowPlaying.poi_id) ? (
                    <Text style={s.feedbackThanks}>Thanks for your feedback!</Text>
                  ) : (
                    <View style={s.feedbackBtns}>
                      <TouchableOpacity style={s.feedbackBtn} onPress={() => handleFeedback(nowPlaying.poi_id, 'up')} activeOpacity={0.75}>
                        <Text style={s.feedbackBtnIcon}>👍</Text>
                        <Text style={s.feedbackBtnLabel}>Loved it</Text>
                      </TouchableOpacity>
                      <TouchableOpacity style={s.feedbackBtn} onPress={() => handleFeedback(nowPlaying.poi_id, 'down')} activeOpacity={0.75}>
                        <Text style={s.feedbackBtnIcon}>👎</Text>
                        <Text style={s.feedbackBtnLabel}>Not for me</Text>
                      </TouchableOpacity>
                    </View>
                  )}
                  <TouchableOpacity style={s.shareBtn} onPress={handleShare} activeOpacity={0.8}>
                    <Text style={s.shareBtnText}>Share this story</Text>
                  </TouchableOpacity>
                </View>
              )}

              {/* Playback controls */}
              <View style={s.audioControls}>
                <TouchableOpacity style={s.audioSkipBtn} onPress={handleSkipBack} activeOpacity={0.7} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                  <Text style={s.audioSkipIcon}>⏮</Text>
                </TouchableOpacity>
                <TouchableOpacity style={s.audioPlayBtn} onPress={togglePlayPause} activeOpacity={0.8}>
                  <Text style={s.audioPlayIcon}>{isPlaying ? '⏸' : '▶'}</Text>
                </TouchableOpacity>
                <TouchableOpacity style={s.audioSkipBtn} onPress={handleSkipForward} activeOpacity={0.7} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                  <Text style={s.audioSkipIcon}>⏭</Text>
                </TouchableOpacity>
              </View>

              {/* Up next queue — sorted closest first.
                  liveQueue (not queue) so distances update with GPS movement
                  and survive server-pushed items that omit distanceMi. */}
              <View style={s.upNext}>
                <Text style={s.upNextLabel}>Up next</Text>
                {liveQueue.slice(0, 5).map((item, idx) => (
                  <View key={`${item.id}-${idx}`} style={s.queueRow}>
                    <View style={s.queueDot} />
                    <Text style={s.queueName} numberOfLines={1}>{item.name}</Text>
                    <Text style={s.queueDist}>{fmtMiles(item.distanceMi)}</Text>
                  </View>
                ))}
                {liveQueue.length === 0 && (
                  <Text style={s.queueEmpty}>Loading stories…</Text>
                )}
              </View>

              {/* Story corridor slider */}
              <View style={s.sliderLabelRow}>
                <Text style={s.sliderLabelKey}>Story corridor</Text>
                <Text style={s.sliderLabelVal}>{fmtMiles(poiDist)}</Text>
              </View>
              <View style={s.sliderRow}>
                <Text style={s.sliderEdge}>{fmtMiles(POI_MIN)}</Text>
                <PoiSlider value={poiDist} onChange={setPoiDist} />
                <Text style={s.sliderEdge}>{fmtMiles(POI_MAX)}</Text>
              </View>

            </ScrollView>

            {/* Mode segment — pinned above action row */}
            <View style={s.modeSegment}>
              <TouchableOpacity style={[s.modeSeg, !trailMode && s.modeSegActive]} onPress={() => setTrailMode(false)} activeOpacity={0.8}>
                <Text style={[s.modeSegText, !trailMode && s.modeSegTextActive]}>🚗 Driving</Text>
              </TouchableOpacity>
              <View style={s.modeSegDivider} />
              <TouchableOpacity style={[s.modeSeg, trailMode && s.modeSegActive]} onPress={() => setTrailMode(true)} activeOpacity={0.8}>
                <Text style={[s.modeSegText, trailMode && s.modeSegTextActive]}>🥾 Hiking</Text>
              </TouchableOpacity>
            </View>

            {/* Action row — always at bottom */}
            <View style={s.actions}>
              <TouchableOpacity style={[s.quietBtn, quietMode && s.quietBtnActive]} onPress={() => setQuietMode(q => !q)} activeOpacity={0.8}>
                <Text style={[s.quietBtnText, quietMode && s.quietBtnTextActive]}>
                  {quietMode ? '▶ Resume' : '🔇 Quiet'}
                </Text>
              </TouchableOpacity>
              <TouchableOpacity style={s.endTripBtn} onPress={handleEndTrip} activeOpacity={0.8}>
                <Text style={s.endTripBtnText}>End trip</Text>
              </TouchableOpacity>
            </View>
          </>
        )}

        <SafeAreaView edges={['bottom']} />
      </Animated.View>
    </View>
  );
}

// ── Compass icon (recenter button) ───────────────────────────────────────────
function CompassIcon() {
  return (
    <View style={ci.wrap}>
      {/* North tip — filled teal */}
      <View style={ci.tipNorth} />
      {/* South tip — muted */}
      <View style={ci.tipSouth} />
      {/* Center dot */}
      <View style={ci.dot} />
      {/* N label */}
      <Text style={ci.nLabel}>N</Text>
    </View>
  );
}
const ci = StyleSheet.create({
  wrap:      { width: 22, height: 22, alignItems: 'center', justifyContent: 'center' },
  tipNorth:  {
    position: 'absolute', top: 0,
    width: 0, height: 0,
    borderLeftWidth: 5, borderRightWidth: 5, borderBottomWidth: 11,
    borderLeftColor: 'transparent', borderRightColor: 'transparent',
    borderBottomColor: '#2EC4B6',
  },
  tipSouth:  {
    position: 'absolute', bottom: 0,
    width: 0, height: 0,
    borderLeftWidth: 5, borderRightWidth: 5, borderTopWidth: 11,
    borderLeftColor: 'transparent', borderRightColor: 'transparent',
    borderTopColor: 'rgba(160,124,82,0.5)',
  },
  dot:       {
    width: 5, height: 5, borderRadius: 2.5,
    backgroundColor: C.BG_BASE,
  },
  nLabel:    {
    position: 'absolute', top: -5,
    fontSize: 7, fontWeight: '800', color: '#2EC4B6',
    letterSpacing: 0,
  },
});

// ── Narrator card tint ────────────────────────────────────────────────────────
function narratorCardBg(hex: string): string {
  try {
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    const mix = (c: number) => Math.round(c * 0.18 + 26 * 0.82);
    return `rgb(${mix(r)},${mix(g)},${mix(b)})`;
  } catch {
    return C.BG_SURFACE;
  }
}

// ── Styles ────────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: C.BG_BASE },

  // User location dot — green pulsing
  userLocOuter: { width: 22, height: 22, borderRadius: 11, backgroundColor: `${C.ACCENT}33`, alignItems: 'center', justifyContent: 'center' },
  userLocInner: { width: 12, height: 12, borderRadius: 6, backgroundColor: C.ACCENT_TEXT, borderWidth: 2, borderColor: C.BG_BASE },

  // POI markers — inactive POIs render via PoiMarkerX (drift 5.94). The
  // active = currently-narrating halo + inner dot stays as a distinct
  // now-playing visual.
  poiActive:    { width: 32, height: 32, borderRadius: 16, backgroundColor: `${C.WARNING_BRIGHT}40`, alignItems: 'center', justifyContent: 'center' },
  poiActiveDot: { width: 18, height: 18, borderRadius: 9, backgroundColor: C.WARNING_BRIGHT, borderWidth: 2, borderColor: C.BG_BASE },

  // Overlays
  overlayTL: {
    position: 'absolute', left: 14,
    flexDirection: 'row', alignItems: 'center', gap: 10,
    backgroundColor: 'rgba(38,26,12,0.88)',
    borderRadius: 24, paddingHorizontal: 10, paddingVertical: 7,
    borderWidth: 1, borderColor: C.BORDER_SUBTLE,
  },
  overlayTR: {
    position: 'absolute', right: 14,
    alignItems: 'center',
    backgroundColor: 'rgba(38,26,12,0.88)',
    borderRadius: 16, paddingHorizontal: 12, paddingVertical: 7,
    borderWidth: 1, borderColor: C.BORDER_SUBTLE,
  },
  avatarCircle:   { width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center' },
  avatarInitials: { fontSize: 13, fontWeight: '700' },
  overlayName:    { fontSize: 12, fontWeight: '600', color: C.TEXT_PRIMARY, maxWidth: 110 },
  statusRow:      { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 2 },
  statusDot:      { width: 7, height: 7, borderRadius: 3.5, backgroundColor: C.ACCENT_TEXT },
  statusText:     { fontSize: 11, color: C.ACCENT_TEXT, fontWeight: '500' },

  storyCountLabel: { fontSize: 16, fontWeight: '800', color: C.TEXT_PRIMARY, textAlign: 'center' },
  storyCountUnit:  { fontSize: 10, color: C.TEXT_TERTIARY, textTransform: 'uppercase', letterSpacing: 0.5, textAlign: 'center' },

  // ETA card
  etaCard: {
    position: 'absolute', left: 12, right: 12,
    height: 56,
    backgroundColor: 'rgba(245,240,232,0.97)',
    borderRadius: 14,
    borderWidth: 1, borderColor: 'rgba(160,124,82,0.20)',
    flexDirection: 'row', alignItems: 'center',
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.18, shadowRadius: 6,
    elevation: 4,
  },
  etaCell:    { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 1 },
  etaValue:   { fontSize: 15, fontWeight: '800', color: '#1a1208' },
  etaLabel:   { fontSize: 9, fontWeight: '600', color: 'rgba(26,18,8,0.45)', textTransform: 'uppercase', letterSpacing: 0.5 },
  etaDivider: { width: StyleSheet.hairlineWidth, height: 28, backgroundColor: 'rgba(160,124,82,0.30)' },

  quietBadge: {
    position: 'absolute', alignSelf: 'center',
    backgroundColor: 'rgba(38,26,12,0.90)',
    borderRadius: 20, paddingHorizontal: 14, paddingVertical: 5,
    borderWidth: 1, borderColor: C.BORDER_SUBTLE,
  },
  quietBadgeText: { fontSize: 12, color: C.TEXT_PRIMARY, fontWeight: '600' },

  // POI callout card
  poiCallout: {
    position: 'absolute', left: 16, right: 16,
    backgroundColor: 'rgba(38,26,12,0.97)',
    borderRadius: 14, borderWidth: 1, borderColor: C.BORDER_SUBTLE,
    padding: 14,
    ...Platform.select({
      ios:     { shadowColor: '#000', shadowOpacity: 0.45, shadowRadius: 12, shadowOffset: { width: 0, height: 4 } },
      android: { elevation: 8 },
      default: {},
    }),
  },
  poiCalloutHeader:    { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  poiCalloutName:      { flex: 1, fontSize: 15, fontWeight: '700', color: C.TEXT_PRIMARY },
  poiCalloutClose:     { width: 28, height: 28, alignItems: 'center', justifyContent: 'center' },
  poiCalloutCloseIcon: { fontSize: 22, color: C.TEXT_TERTIARY, lineHeight: 24 },
  poiCalloutCategory:  { fontSize: 11, fontWeight: '600', color: C.ACCENT_TEXT, textTransform: 'uppercase', letterSpacing: 0.6, marginTop: 5 },
  poiCalloutTags:      { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 8 },
  poiCalloutTag:       { backgroundColor: C.BG_ELEVATED, borderRadius: 6, borderWidth: 1, borderColor: C.BORDER_SUBTLE, paddingHorizontal: 8, paddingVertical: 3 },
  poiCalloutTagText:   { fontSize: 11, fontWeight: '500', color: C.TEXT_SECONDARY },

  recenterBtn: {
    position: 'absolute', right: 14, width: 38, height: 38, borderRadius: 19,
    backgroundColor: 'rgba(38,26,12,0.90)',
    borderWidth: 1, borderColor: C.BORDER_SUBTLE,
    alignItems: 'center', justifyContent: 'center',
  },

  // Draggable bottom sheet
  bottomSheet: {
    position: 'absolute', bottom: 0, left: 0, right: 0,
    backgroundColor: 'rgba(38,26,12,0.97)',
    borderTopLeftRadius: 20, borderTopRightRadius: 20,
    borderTopWidth: 1, borderColor: C.BORDER_SUBTLE,
    paddingHorizontal: 16,
    overflow: 'hidden',
  },
  dragHandleWrap: { alignItems: 'center', paddingVertical: 10 },
  dragHandle:     { width: 36, height: 4, backgroundColor: C.BORDER_STRONG, borderRadius: 2 },
  sheetMiddle:    { flex: 1 },

  // Drive stats strip (B6 / drift 5.78) — compact single-line under the
  // drag handle; visible in both peek and expanded sheet states.
  driveStatsStrip: {
    alignItems: 'center', paddingTop: 2, paddingBottom: 8,
    borderBottomWidth: StyleSheet.hairlineWidth, borderColor: C.BORDER_SUBTLE,
    marginBottom: 6,
  },
  driveStatsText: { fontSize: 12, color: C.TEXT_SECONDARY, fontWeight: '600' },

  // Peek: minimal controls row
  peekRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingBottom: 6 },

  // Now playing
  nowPlayingCard:   { borderRadius: 14, paddingHorizontal: 14, paddingTop: 11, paddingBottom: 13, marginBottom: 8 },
  nowPlayingHeader: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 4 },
  nowPlayingDot:    { width: 8, height: 8, borderRadius: 4 },
  nowPlayingBadge:  { fontSize: 10, fontWeight: '700', color: C.TEXT_TERTIARY, textTransform: 'uppercase', letterSpacing: 0.6 },
  nowPlayingName:   { fontSize: 15, fontWeight: '700', color: C.TEXT_PRIMARY, marginBottom: 10 },
  progressRail:     { height: 4, backgroundColor: C.BORDER_SUBTLE, borderRadius: 2 },
  progressFill:     { height: 4, backgroundColor: C.ACCENT_TEXT, borderRadius: 2, position: 'absolute', left: 0 },
  progressLabels:   { flexDirection: 'row', justifyContent: 'space-between', marginTop: 5 },
  progressTime:     { fontSize: 11, color: C.TEXT_TERTIARY, fontWeight: '500' },

  // Audio controls
  audioControls: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 28, marginBottom: 10 },
  audioSkipBtn:  { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center', backgroundColor: C.BG_ELEVATED, borderWidth: 1, borderColor: C.BORDER_SUBTLE },
  audioSkipIcon: { fontSize: 18, color: C.TEXT_SECONDARY },
  audioPlayBtn:  { width: 52, height: 52, borderRadius: 26, alignItems: 'center', justifyContent: 'center', backgroundColor: C.TEXT_PRIMARY },
  audioPlayIcon: { fontSize: 22, color: C.BG_BASE },

  // Top-left back button (map overlay)
  topBackBtn:   { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(38,26,12,0.80)', marginRight: 2 },
  topBackArrow: { fontSize: 20, color: C.TEXT_PRIMARY },

  // Up next
  upNext:      { marginBottom: 6 },

  // POI slider
  sliderLabelRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', marginTop: 14, marginBottom: 10 },
  sliderLabelKey: { fontSize: 10, fontWeight: '700', color: C.TEXT_TERTIARY, textTransform: 'uppercase', letterSpacing: 0.8 },
  sliderLabelVal: { fontSize: 14, fontWeight: '700', color: C.ACCENT_TEXT },
  sliderRow:      { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 12 },
  sliderEdge:     { fontSize: 11, color: C.TEXT_TERTIARY, minWidth: 36, textAlign: 'center' },
  upNextLabel: { fontSize: 10, fontWeight: '700', color: C.TEXT_TERTIARY, textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 8 },
  queueRow:    { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 7, borderBottomWidth: StyleSheet.hairlineWidth, borderColor: C.BORDER_SUBTLE },
  queueDot:    { width: 8, height: 8, borderRadius: 4, backgroundColor: C.WARNING_BRIGHT, flexShrink: 0 },
  queueName:   { flex: 1, fontSize: 13, fontWeight: '500', color: C.TEXT_SECONDARY },
  queueDist:   { fontSize: 12, color: C.TEXT_TERTIARY, fontWeight: '500' },
  queueEmpty:  { fontSize: 13, color: C.TEXT_TERTIARY, textAlign: 'center', paddingVertical: 10 },

  // Mode segmented control
  modeSegment: {
    flexDirection: 'row', height: 40,
    borderRadius: 10, borderWidth: 1.5, borderColor: C.BORDER_STRONG,
    overflow: 'hidden', marginBottom: 10,
  },
  modeSeg: {
    flex: 1, alignItems: 'center', justifyContent: 'center',
    backgroundColor: 'transparent',
  },
  modeSegActive:    { backgroundColor: C.ACCENT_LIGHT },
  modeSegText:      { fontSize: 13, fontWeight: '600', color: C.TEXT_TERTIARY },
  modeSegTextActive:{ color: C.ACCENT_TEXT },
  modeSegDivider:   { width: 1.5, backgroundColor: C.BORDER_STRONG },

  // Actions row — paddingBottom 16 ensures End trip CTA stays ≥16px above the
  // SafeAreaView inset edge in expanded state, clearing Android nav / gesture
  // zone. Peek state clearance comes from driveSnaps.peek (insets.bottom + 16).
  actions:      { flexDirection: 'row', gap: 10, paddingTop: 0, paddingBottom: 16 },

  // Quiet mode — ghost/secondary
  quietBtn:         { borderRadius: 12, borderWidth: 1.5, borderColor: C.BORDER_STRONG, paddingHorizontal: 18, height: 48, alignItems: 'center', justifyContent: 'center', backgroundColor: 'transparent' },
  quietBtnActive:   { borderColor: C.ACCENT_BORDER, backgroundColor: C.ACCENT_LIGHT },
  quietBtnText:     { fontSize: 13, fontWeight: '600', color: C.TEXT_SECONDARY },
  quietBtnTextActive: { color: C.ACCENT_TEXT },

  // End trip — primary destructive
  endTripBtn:     { flex: 1, height: 48, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: C.DANGER },
  endTripBtnText: { fontSize: 15, fontWeight: '700', color: '#FFFFFF' },

  feedbackCard: {
    backgroundColor: C.BG_ELEVATED,
    borderRadius: 14, borderWidth: 1, borderColor: C.BORDER_SUBTLE,
    padding: 16, gap: 10, marginBottom: 12,
  },
  feedbackTitle:    { fontSize: 14, fontWeight: '700', color: C.TEXT_PRIMARY },
  feedbackQuestion: { fontSize: 12, color: C.TEXT_TERTIARY, fontWeight: '500' },
  feedbackThanks:   { fontSize: 13, color: C.ACCENT_TEXT, fontWeight: '600' },
  feedbackBtns:     { flexDirection: 'row', gap: 10 },
  feedbackBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    borderRadius: 10, borderWidth: 1, borderColor: C.BORDER_STRONG,
    paddingVertical: 10, backgroundColor: C.BG_ELEVATED,
  },
  feedbackBtnIcon:  { fontSize: 16 },
  feedbackBtnLabel: { fontSize: 13, fontWeight: '600', color: C.TEXT_SECONDARY },
  shareBtn: {
    borderRadius: 10, borderWidth: 1, borderColor: C.BORDER_STRONG,
    paddingVertical: 11, alignItems: 'center', backgroundColor: C.BG_ELEVATED,
  },
  shareBtnText:  { fontSize: 13, fontWeight: '600', color: C.TEXT_SECONDARY },
  driveLogoWrap: { marginTop: 4, opacity: 0.5 },
});
