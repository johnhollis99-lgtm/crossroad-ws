/**
 * XRoad — Trip / Drive screen (Pine, Phase 2).
 *
 * Full-screen map with floating chrome (PersonaPill + StoriesBadge top,
 * 3-column TripStat strip below), a recenter puck + MapStylePicker on the
 * right rail (visible only when the sheet is peeked), and a draggable
 * bottom sheet that toggles between retracted (watermark + minimal action
 * row) and deployed (full media controls + Up next + corridor slider +
 * mode toggle + footer) states.
 *
 * Every existing handler / state machine / data binding from the previous
 * earthy-palette version is preserved — Audio, Socket.io, GPS, POI load,
 * curation, queue, skip, end-trip wiring, feedback/share handlers all
 * untouched.
 *
 * Receives (JSON strings):
 *   narrator, filters, routePreview, originLocation, destination, tripId
 */

import React, {
  useCallback, useEffect, useMemo, useRef, useState,
} from 'react';
import {
  Alert, Animated, Dimensions, PanResponder,
  Platform, Pressable, ScrollView, Share, StatusBar,
  StyleSheet, Text, TouchableOpacity, View,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import MapView, { Marker, Polyline, PROVIDER_GOOGLE } from 'react-native-maps';
import { CommonActions, useNavigation, useRoute } from '@react-navigation/native';
import { Audio, AVPlaybackStatus } from 'expo-av';
import * as Location from 'expo-location';
import type { LocationSubscription } from 'expo-location';
import Svg, { Text as SvgText } from 'react-native-svg';

import { getPOIsAlongRoute, submitContribution } from '../lib/supabase';
import type { POI, NarratorRecord } from '../lib/supabase';
import { MapStyleId, MAP_STYLES, loadMapStyle, saveMapStyle } from '../lib/mapStyle';
import { MapStylePicker } from '../components/MapStylePicker';
import { useSheetSnap } from '../hooks/useSheetSnap';
import { useTheme } from '../src/design/theme';
import { shadows } from '../src/design/tokens';
import { useBreath } from '../src/design/motion';
import {
  IconClose,
  IconPause,
  IconPlay,
  IconSkipBack,
  IconSkipFwd,
  IconVolume,
  IconVolumeOff,
  LabeledSlider,
  ModePillRow,
  PersonaPill,
  PoiMarkerX,
  StoriesBadge,
  TripStat,
  usePoiMarkerTracking,
  Wordmark,
} from '../src/components';
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

// Pine-coherent narrator avatar palette (Phase 2 spec). Reused from
// customize.tsx; kept inline here so drive.tsx has no cross-screen import.
const NARRATOR_AVATAR_PALETTE: Record<string, string> = {
  'the-professor':     '#60A5FA',
  'the-local':         '#9F7AEA',
  'the-junior-ranger': '#10B981',
  'the-truck-driver':  '#F59E0B',
};

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

function fmtRemaining(min: number): string {
  if (min < 60) return `${min}m`;
  return `${Math.floor(min / 60)}h ${min % 60}m`;
}

function avatarColorFor(narrator: NarratorRecord | null): string {
  if (!narrator) return '#10B981';
  const slug = narrator.slug ?? '';
  return NARRATOR_AVATAR_PALETTE[slug] ?? narrator.avatar_color_bg ?? '#10B981';
}

// ── Watermark (Pine spec section 4 — breathing X + italic Road) ──────────────

function TripWatermark({ compact }: { compact: boolean }) {
  const { theme } = useTheme();
  const xOpacity = useBreath({ min: 0.55, max: 0.95, duration: 2800 });
  const wrapOpacity = compact ? 0.55 : 0.7;
  const capPx = compact ? 40 : 56;
  const roadCap = compact ? 28 : 38;

  return (
    <View style={{ alignItems: 'center', opacity: wrapOpacity, marginTop: 4, marginBottom: 6 }}>
      <View style={{ flexDirection: 'row', alignItems: 'baseline' }}>
        <Animated.Text
          allowFontScaling={false}
          style={{
            fontFamily: theme.fontFamilies.serif,
            fontWeight: '400',
            fontSize:   capPx,
            lineHeight: capPx,
            color:      theme.colors.primary,
            opacity:    xOpacity,
            letterSpacing: -1,
          }}
        >
          X
        </Animated.Text>
        <Text
          allowFontScaling={false}
          style={{
            fontFamily: theme.fontFamilies.serifItalic,
            fontWeight: '400',
            fontStyle:  'italic',
            fontSize:   roadCap,
            lineHeight: roadCap,
            color:      theme.colors.ink,
            letterSpacing: -0.6,
          }}
        >
          Road
        </Text>
      </View>
    </View>
  );
}

// ── POI marker (active vs inactive) ──────────────────────────────────────────

function DrivePoiMarker({
  poi, isActive, onPress, themeColors,
}: {
  poi: POI;
  isActive: boolean;
  onPress: () => void;
  themeColors: { primary: string; ink: string; paperSoft: string };
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
        ? <ActivePoiMarker themeColors={themeColors} />
        : <PoiMarkerX size="curated" />}
    </Marker>
  );
}

// Active = larger X glyph on a paperSoft pill with a primary border ring —
// visibly distinct from the inactive curated X without changing brand color.
function ActivePoiMarker({
  themeColors,
}: {
  themeColors: { primary: string; ink: string; paperSoft: string };
}) {
  return (
    <View
      style={{
        width:           40,
        height:          40,
        borderRadius:    20,
        backgroundColor: themeColors.paperSoft,
        borderWidth:     2,
        borderColor:     themeColors.primary,
        alignItems:      'center',
        justifyContent:  'center',
      }}
    >
      <Svg width={28} height={28} viewBox="0 0 28 28">
        <SvgText
          x={14}
          y={14}
          textAnchor="middle"
          dy={6}
          fontSize={20}
          fontWeight="700"
          fill={themeColors.primary}
        >
          X
        </SvgText>
      </Svg>
    </View>
  );
}

// ── Main screen ───────────────────────────────────────────────────────────────

export default function Drive() {
  const navigation = useNavigation<any>();
  const route      = useRoute<any>();
  const { theme }  = useTheme();
  const params     = route.params ?? {};

  const narrator      = parse<NarratorRecord | null>(params.narrator, null);
  const filters       = parse<Record<string, any>>(params.filters, {});
  const routePreview  = parse<Record<string, any>>(params.routePreview, {});
  const origin        = parse<Record<string, any>>(params.originLocation, {});
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
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

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
  }), []); // eslint-disable-line react-hooks/exhaustive-deps

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

  useEffect(() => { nowPlayingRef.current = nowPlaying; }, [nowPlaying]);

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
    setQueue(q => q.filter(item => item.id !== current.poi_id));
  }, [playElapsed, tripId, stopAudio]);

  useEffect(() => {
    if (nowPlaying) {
      setShowCard(true);
      Animated.spring(cardAnim, { toValue: 1, useNativeDriver: true, tension: 80, friction: 12 }).start();
    } else {
      Animated.timing(cardAnim, { toValue: 0, duration: 220, useNativeDriver: true })
        .start(() => setShowCard(false));
    }
  }, [nowPlaying, cardAnim]);

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

      const fetched = await getPOIsAlongRoute(
        polyline, poiDist, cats, mode,
        { sortMode: 'significance_desc', minSignificance: minRelevance, resultLimit: 500 },
      );

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
  }, [params.routePreview, trailMode, poiDist]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (__DEV__) {
      console.info('[drive] render:markers source=pois count=' + pois.length);
    }
  }, [pois.length]);

  const recenter = useCallback(() => {
    const loc = locationRef.current;
    if (loc) mapRef.current?.animateCamera({ center: loc, zoom: 15 }, { duration: 500 });
  }, []);

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

  // ── Feedback / share — handlers preserved as carriers; visual surface
  // dropped per Pine spec section 4 (sheet contents). Re-enable from a
  // settings sheet or a long-press affordance in a follow-up.
  const handleFeedback = async (poiId: string, rating: 'up' | 'down') => {
    setRatedPois(prev => new Set(prev).add(poiId));
    await submitContribution({
      userId: tripId ?? 'anonymous',
      type:   'narration_rating',
      poiId,
      details: { rating, narrator_slug: narrator?.slug ?? '' },
    });
  };
  void handleFeedback;

  const handleShare = () => {
    const msg = nowPlaying
      ? `Just heard about "${nowPlaying.poi_name}" on my XRoad trip to ${params.destination ?? 'my destination'}!`
      : `Exploring ${params.destination ?? 'somewhere new'} with XRoad!`;
    Share.share({ message: msg });
  };
  void handleShare;

  // ── Render ────────────────────────────────────────────────────────────────
  const activePoiId = nowPlaying?.poi_id;

  const remainingMin = Math.max(0, (routePreview.durationMin ?? 0) - elapsedMin);
  const remainingMi  = routePreview.distanceMi ?? 0;

  const liveQueue = useMemo(() => {
    if (!userLocation) return queue;
    return queue.map(item => {
      const poi = pois.find(p => p.id === item.id);
      if (!poi) return item;
      return { ...item, distanceMi: haversineM(userLocation.latitude, userLocation.longitude, poi.lat, poi.lng) / 1609 };
    });
  }, [queue, pois, userLocation]);

  const nextPoiDist      = liveQueue[0]?.distanceMi;
  const nextStoryLabel   = nowPlaying?.poi_name
    ?? liveQueue[0]?.name
    ?? '—';
  const storiesAvailable = pois.length > 0 ? pois.length : totalStories;

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

  const isPeek = snapLevel === 'peek';
  const tripModeValue: 'driving' | 'hiking' = trailMode ? 'hiking' : 'driving';

  const markerColors = useMemo(
    () => ({ primary: theme.colors.primary, ink: theme.colors.ink, paperSoft: theme.colors.paperSoft }),
    [theme.colors.primary, theme.colors.ink, theme.colors.paperSoft],
  );

  return (
    <View style={[s.root, { backgroundColor: theme.colors.paper }]}>
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
            strokeColor={theme.colors.primary}
            strokeWidth={5}
            lineCap="round"
            lineJoin="round"
          />
        )}

        {userLocation && (
          <Marker coordinate={userLocation} anchor={{ x: 0.5, y: 0.5 }}>
            <View style={[s.userLocOuter, { backgroundColor: theme.colors.secondaryTint }]}>
              <View style={[s.userLocInner, { backgroundColor: theme.colors.secondaryDeep, borderColor: theme.colors.paper }]} />
            </View>
          </Marker>
        )}

        {pois.map(poi => (
          <DrivePoiMarker
            key={poi.id}
            poi={poi}
            isActive={poi.id === activePoiId}
            onPress={() => setSelectedPoi(prev => prev?.id === poi.id ? null : poi)}
            themeColors={markerColors}
          />
        ))}
      </MapView>

      {/* ── TOP OVERLAYS ─────────────────────────────────────────────────── */}
      <View style={[s.topRow, { top: STATUS_BAR_PAD }]} pointerEvents="box-none">
        <PersonaPill
          initials={narrator?.avatar_initials ?? '??'}
          avatarColor={avatarColorFor(narrator)}
          name={narrator?.name ?? 'Narrator'}
          onBack={handleGoBack}
        />
        <StoriesBadge count={storiesAvailable} />
      </View>

      {/* Stats strip — 3 columns under the top pills */}
      <View
        style={[
          s.statsCard,
          Platform.OS === 'android' ? { elevation: 6 } : shadows.control,
          {
            top:             STATUS_BAR_PAD + 56,
            backgroundColor: theme.colors.paperSoft,
            borderColor:     theme.colors.paperEdge,
          },
        ]}
        pointerEvents="box-none"
      >
        <TripStat label="REMAINING" value={fmtRemaining(remainingMin)} />
        <View style={[s.statsDivider, { backgroundColor: theme.colors.line }]} />
        <TripStat label="DISTANCE"  value={fmtMiles(remainingMi)} />
        <View style={[s.statsDivider, { backgroundColor: theme.colors.line }]} />
        <TripStat
          label="NEXT STORY"
          value={nextPoiDist != null ? fmtMiles(nextPoiDist) : nextStoryLabel}
        />
      </View>

      {/* Quiet mode badge */}
      {quietMode && (
        <View
          style={[
            s.quietBadge,
            {
              top:             STATUS_BAR_PAD + 130,
              backgroundColor: theme.colors.paperSoft,
              borderColor:     theme.colors.paperEdge,
            },
          ]}
        >
          <IconVolumeOff size={14} color={theme.colors.ink} />
          <Text style={[theme.textVariants.label, { color: theme.colors.ink, fontSize: 12 }]}>
            Quiet
          </Text>
        </View>
      )}

      {/* Map controls — visible only when sheet is peeked */}
      {isPeek && (
        <>
          <MapStylePicker
            value={mapStyleId}
            onChange={handleMapStyleChange}
            mapboxToken={MAPBOX_TOKEN}
            buttonBottom={driveSnaps.peek + 16}
            buttonRight={12}
          />

          <TouchableOpacity
            style={[
              s.recenterBtn,
              Platform.OS === 'android' ? { elevation: 6 } : shadows.control,
              {
                bottom:          driveSnaps.peek + 64,
                backgroundColor: theme.colors.paperSoft,
                borderColor:     theme.colors.paperEdge,
              },
            ]}
            onPress={recenter}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            activeOpacity={0.7}
          >
            <CompassPuck color={theme.colors.primary} muted={theme.colors.inkFaint} ink={theme.colors.ink} />
          </TouchableOpacity>
        </>
      )}

      {/* ── POI callout card ─────────────────────────────────────────────── */}
      {selectedPoi && (
        <View
          style={[
            s.poiCallout,
            Platform.OS === 'android' ? { elevation: 10 } : shadows.card,
            {
              bottom:          driveSnaps.peek + 20,
              backgroundColor: theme.colors.paperSoft,
              borderColor:     theme.colors.paperEdge,
            },
          ]}
        >
          <View style={s.poiCalloutHeader}>
            <Text
              style={[theme.textVariants.label, { color: theme.colors.ink, flex: 1, fontSize: 15 }]}
              numberOfLines={2}
            >
              {selectedPoi.name}
            </Text>
            <Pressable
              onPress={() => setSelectedPoi(null)}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              style={{ width: 28, height: 28, alignItems: 'center', justifyContent: 'center' }}
            >
              <IconClose size={20} color={theme.colors.inkSoft} />
            </Pressable>
          </View>
          {!!selectedPoi.category && (
            <Text
              style={[
                theme.textVariants.eyebrow,
                { color: theme.colors.primary, marginTop: 4 },
              ]}
            >
              {selectedPoi.category}
            </Text>
          )}
          {selectedPoi.tags?.length > 0 && (
            <View style={s.poiCalloutTags}>
              {selectedPoi.tags.slice(0, 5).map((tag, i) => (
                <View
                  key={i}
                  style={[
                    s.poiCalloutTag,
                    { backgroundColor: theme.colors.paperWarm, borderColor: theme.colors.paperEdge },
                  ]}
                >
                  <Text style={[theme.textVariants.meta, { color: theme.colors.inkSoft, fontSize: 11 }]}>
                    {tag.replace(/_/g, ' ')}
                  </Text>
                </View>
              ))}
            </View>
          )}
        </View>
      )}

      {/* ── DRAGGABLE BOTTOM SHEET ───────────────────────────────────────── */}
      <Animated.View
        style={[
          s.bottomSheet,
          Platform.OS === 'android' ? { elevation: 16 } : shadows.sheet,
          {
            height:          sheetAnim,
            backgroundColor: theme.colors.paper,
            borderColor:     theme.colors.paperEdge,
          },
        ]}
      >
        {/* Drag handle */}
        <View {...sheetPan} style={s.dragHandleWrap}>
          <View style={[s.dragHandle, { backgroundColor: theme.colors.line }]} />
        </View>

        {/* Watermark — large + breathing when peeked, smaller when expanded */}
        <TripWatermark compact={!isPeek} />

        {/* POIs-ahead line */}
        <Text
          allowFontScaling={false}
          style={[
            theme.textVariants.body,
            { color: theme.colors.inkSoft, textAlign: 'center', fontSize: 13, marginBottom: 8 },
          ]}
          numberOfLines={1}
        >
          {poisAhead} {poisAhead === 1 ? 'POI' : 'POIs'} ahead
          {poisAhead > 0 ? `  ·  1 every ${avgPaceAheadMin}m` : ''}
        </Text>

        {/* ── PEEK: minimal action row ─────────────────────────────────── */}
        {isPeek && (
          <View style={s.peekRow}>
            <TouchableOpacity
              style={[s.bigPlayBtn, { backgroundColor: theme.colors.ink }]}
              onPress={togglePlayPause}
              activeOpacity={0.85}
            >
              {isPlaying
                ? <IconPause size={26} color={theme.colors.paper} accent={theme.colors.paper} />
                : <IconPlay  size={26} color={theme.colors.paper} accent={theme.colors.paper} />}
            </TouchableOpacity>
            <TouchableOpacity
              style={[
                s.skipBtn,
                { backgroundColor: theme.colors.paperWarm, borderColor: theme.colors.paperEdge },
              ]}
              onPress={handleSkipForward}
              activeOpacity={0.7}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <IconSkipFwd size={20} color={theme.colors.ink} accent={theme.colors.accent} />
            </TouchableOpacity>
            <Pressable
              style={({ pressed }) => [
                s.endTripBtn,
                Platform.OS === 'android' ? { elevation: 6 } : null,
                {
                  flex:            1,
                  backgroundColor: pressed ? theme.colors.dangerDeep : theme.colors.danger,
                  shadowColor:     theme.colors.danger,
                  shadowOpacity:   0.45,
                  shadowRadius:    14,
                  shadowOffset:    { width: 0, height: 4 },
                },
              ]}
              onPress={handleEndTrip}
            >
              <IconClose size={18} color="#FFFFFF" />
              <Text style={[theme.textVariants.label, { color: '#FFFFFF', fontSize: 15 }]}>
                End trip
              </Text>
            </Pressable>
          </View>
        )}

        {/* ── EXPANDED: media controls + queue + slider + footer ───────── */}
        {!isPeek && (
          <>
            <View style={[s.expandDivider, { backgroundColor: theme.colors.line }]} />

            <ScrollView style={s.sheetMiddle} showsVerticalScrollIndicator={false} bounces={false}>
              {/* Now playing card (only when narrating) */}
              {showCard && (
                <Animated.View
                  style={[
                    s.nowPlayingCard,
                    {
                      backgroundColor: theme.colors.paperWarm,
                      borderColor:     theme.colors.paperEdge,
                      opacity:         cardAnim,
                      transform: [{ translateY: cardAnim.interpolate({ inputRange: [0, 1], outputRange: [12, 0] }) }],
                    },
                  ]}
                >
                  <View style={s.nowPlayingHeader}>
                    <Animated.View
                      style={[
                        s.statusDot,
                        { backgroundColor: theme.colors.primary, opacity: pulseAnim },
                      ]}
                    />
                    <Text style={[theme.textVariants.eyebrow, { color: theme.colors.inkSoft }]}>
                      Now playing
                    </Text>
                  </View>
                  <Text
                    style={[
                      theme.textVariants.title,
                      { color: theme.colors.ink, fontSize: 17, lineHeight: 22, marginTop: 4 },
                    ]}
                    numberOfLines={1}
                  >
                    {nowPlaying?.poi_name ?? ''}
                  </Text>
                  <View style={[s.progressRail, { backgroundColor: theme.colors.line }]}>
                    <View
                      style={[
                        s.progressFill,
                        {
                          backgroundColor: theme.colors.primary,
                          width:           `${Math.min(playProgress * 100, 100)}%` as any,
                        },
                      ]}
                    />
                  </View>
                  <View style={s.progressLabels}>
                    <Text style={[theme.textVariants.meta, { color: theme.colors.inkSoft, fontSize: 11 }]}>
                      {fmtSeconds(playElapsed)}
                    </Text>
                    <Text style={[theme.textVariants.meta, { color: theme.colors.inkSoft, fontSize: 11 }]}>
                      {fmtSeconds(playDuration || (nowPlaying?.estimated_seconds ?? 0))}
                    </Text>
                  </View>
                </Animated.View>
              )}

              {/* Media controls — 3 circular buttons centered */}
              <View style={s.mediaControls}>
                <TouchableOpacity
                  style={[
                    s.mediaSkipBtn,
                    { backgroundColor: theme.colors.paperWarm, borderColor: theme.colors.paperEdge },
                  ]}
                  onPress={handleSkipBack}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                  activeOpacity={0.75}
                >
                  <IconSkipBack size={22} color={theme.colors.ink} accent={theme.colors.accent} />
                </TouchableOpacity>
                <TouchableOpacity
                  style={[s.mediaPlayBtn, { backgroundColor: theme.colors.ink }]}
                  onPress={togglePlayPause}
                  activeOpacity={0.85}
                >
                  {isPlaying
                    ? <IconPause size={28} color={theme.colors.paper} accent={theme.colors.paper} />
                    : <IconPlay  size={28} color={theme.colors.paper} accent={theme.colors.paper} />}
                </TouchableOpacity>
                <TouchableOpacity
                  style={[
                    s.mediaSkipBtn,
                    { backgroundColor: theme.colors.paperWarm, borderColor: theme.colors.paperEdge },
                  ]}
                  onPress={handleSkipForward}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                  activeOpacity={0.75}
                >
                  <IconSkipFwd size={22} color={theme.colors.ink} accent={theme.colors.accent} />
                </TouchableOpacity>
              </View>

              {/* Up next */}
              <Text
                style={[
                  theme.textVariants.eyebrow,
                  { color: theme.colors.inkSoft, marginTop: 16, marginBottom: 8 },
                ]}
              >
                Up next
              </Text>
              {liveQueue.length === 0 ? (
                <Text
                  style={{
                    fontFamily: theme.fontFamilies.serifItalic,
                    fontStyle:  'italic',
                    fontSize:   13,
                    color:      theme.colors.inkSoft,
                    paddingVertical: 8,
                  }}
                >
                  Loading stories…
                </Text>
              ) : (
                liveQueue.slice(0, 5).map((item, idx) => (
                  <View
                    key={`${item.id}-${idx}`}
                    style={[s.queueRow, { borderBottomColor: theme.colors.line }]}
                  >
                    <View style={[s.queueDot, { backgroundColor: theme.colors.primary }]} />
                    <Text
                      style={[theme.textVariants.body, { color: theme.colors.ink, flex: 1 }]}
                      numberOfLines={1}
                    >
                      {item.name}
                    </Text>
                    <Text style={[theme.textVariants.meta, { color: theme.colors.inkSoft }]}>
                      {fmtMiles(item.distanceMi)}
                    </Text>
                  </View>
                ))
              )}

              {/* Story corridor */}
              <View style={{ marginTop: 18 }}>
                <LabeledSlider
                  label="Story corridor"
                  value={poiDist}
                  onChange={setPoiDist}
                  min={POI_MIN}
                  max={POI_MAX}
                  step={POI_STEP}
                  formatValue={(v) => fmtMiles(v)}
                  formatEdge={(v) => fmtMiles(v)}
                />
              </View>

              {/* Mode toggle */}
              <View style={{ marginTop: 18, marginBottom: 6 }}>
                <ModePillRow
                  value={tripModeValue}
                  onChange={(next) => setTrailMode(next === 'hiking')}
                />
              </View>
            </ScrollView>

            {/* Footer — Quiet + End trip */}
            <View style={s.footer}>
              <Pressable
                style={({ pressed }) => [
                  s.quietBtn,
                  {
                    backgroundColor: quietMode ? theme.colors.primaryTint : theme.colors.paperWarm,
                    borderColor:     quietMode ? theme.colors.primary     : theme.colors.paperEdge,
                    opacity:         pressed ? 0.85 : 1,
                  },
                ]}
                onPress={() => setQuietMode(q => !q)}
              >
                {quietMode
                  ? <IconVolume    size={18} color={theme.colors.primary} accent={theme.colors.primary} />
                  : <IconVolumeOff size={18} color={theme.colors.ink}    accent={theme.colors.accent} />}
                <Text
                  style={[
                    theme.textVariants.label,
                    { color: quietMode ? theme.colors.primary : theme.colors.ink, fontSize: 13 },
                  ]}
                >
                  {quietMode ? 'Resume' : 'Quiet'}
                </Text>
              </Pressable>
              <Pressable
                style={({ pressed }) => [
                  s.footerEndBtn,
                  {
                    backgroundColor: pressed ? theme.colors.dangerDeep : theme.colors.danger,
                    shadowColor:     theme.colors.danger,
                    shadowOpacity:   0.45,
                    shadowRadius:    14,
                    shadowOffset:    { width: 0, height: 4 },
                  },
                  Platform.OS === 'android' ? { elevation: 6 } : null,
                ]}
                onPress={handleEndTrip}
              >
                <IconClose size={18} color="#FFFFFF" />
                <Text style={[theme.textVariants.label, { color: '#FFFFFF', fontSize: 14 }]}>
                  End trip
                </Text>
              </Pressable>
            </View>
          </>
        )}

        <SafeAreaView edges={['bottom']} />
      </Animated.View>
    </View>
  );
}

// ── Compass puck (recenter button glyph) ─────────────────────────────────────

function CompassPuck({ color, muted, ink }: { color: string; muted: string; ink: string }) {
  return (
    <View style={cp.wrap}>
      <View style={[cp.tipNorth, { borderBottomColor: color }]} />
      <View style={[cp.tipSouth, { borderTopColor:    muted }]} />
      <View style={[cp.dot,      { backgroundColor:   ink }]} />
    </View>
  );
}

const cp = StyleSheet.create({
  wrap: { width: 22, height: 22, alignItems: 'center', justifyContent: 'center' },
  tipNorth: {
    position: 'absolute', top: 0,
    width: 0, height: 0,
    borderLeftWidth: 5, borderRightWidth: 5, borderBottomWidth: 11,
    borderLeftColor: 'transparent', borderRightColor: 'transparent',
  },
  tipSouth: {
    position: 'absolute', bottom: 0,
    width: 0, height: 0,
    borderLeftWidth: 5, borderRightWidth: 5, borderTopWidth: 11,
    borderLeftColor: 'transparent', borderRightColor: 'transparent',
  },
  dot: { width: 5, height: 5, borderRadius: 2.5 },
});

// ── Styles ────────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  root: { flex: 1 },

  userLocOuter: { width: 22, height: 22, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
  userLocInner: { width: 12, height: 12, borderRadius: 6,  borderWidth: 2 },

  // Top row — PersonaPill left, StoriesBadge right
  topRow: {
    position:       'absolute',
    left:           12,
    right:          12,
    flexDirection:  'row',
    alignItems:     'flex-start',
    justifyContent: 'space-between',
  },

  // 3-column stats card
  statsCard: {
    position:       'absolute',
    left:           12,
    right:          12,
    flexDirection:  'row',
    alignItems:     'center',
    height:         60,
    borderRadius:   18,
    borderWidth:    1,
    paddingVertical: 8,
  },
  statsDivider: {
    width:   StyleSheet.hairlineWidth,
    height:  32,
  },

  // Quiet badge
  quietBadge: {
    position:          'absolute',
    alignSelf:         'center',
    flexDirection:     'row',
    alignItems:        'center',
    gap:               6,
    paddingHorizontal: 14,
    paddingVertical:   6,
    borderRadius:      999,
    borderWidth:       1,
  },

  // Recenter / map controls
  recenterBtn: {
    position:        'absolute',
    right:           14,
    width:           44,
    height:          44,
    borderRadius:    22,
    borderWidth:     1,
    alignItems:      'center',
    justifyContent:  'center',
  },

  // POI callout
  poiCallout: {
    position:     'absolute',
    left:         16,
    right:        16,
    borderRadius: 18,
    borderWidth:  1,
    padding:      14,
  },
  poiCalloutHeader: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  poiCalloutTags:   { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 8 },
  poiCalloutTag: {
    borderRadius:      8,
    borderWidth:       1,
    paddingHorizontal: 8,
    paddingVertical:   3,
  },

  // Bottom sheet
  bottomSheet: {
    position:           'absolute',
    bottom:             0,
    left:               0,
    right:              0,
    borderTopLeftRadius:  24,
    borderTopRightRadius: 24,
    borderTopWidth:     1,
    paddingHorizontal:  16,
    overflow:           'hidden',
  },
  dragHandleWrap: { alignItems: 'center', paddingVertical: 10 },
  dragHandle:     { width: 40, height: 4, borderRadius: 2 },

  expandDivider: { height: 1, marginVertical: 4 },

  sheetMiddle: { flex: 1 },

  // Peek action row
  peekRow: {
    flexDirection: 'row',
    alignItems:    'center',
    gap:           10,
    paddingBottom: 6,
  },
  bigPlayBtn: {
    width:           52,
    height:          52,
    borderRadius:    26,
    alignItems:      'center',
    justifyContent:  'center',
  },
  skipBtn: {
    width:           44,
    height:          44,
    borderRadius:    22,
    borderWidth:     1,
    alignItems:      'center',
    justifyContent:  'center',
  },
  endTripBtn: {
    flexDirection:     'row',
    alignItems:        'center',
    justifyContent:    'center',
    gap:               8,
    paddingVertical:   14,
    paddingHorizontal: 18,
    borderRadius:      999,
    minHeight:         52,
  },

  // Now playing
  nowPlayingCard: {
    borderRadius: 16,
    borderWidth:  1,
    padding:      14,
    marginBottom: 8,
  },
  nowPlayingHeader: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  statusDot: { width: 8, height: 8, borderRadius: 4 },
  progressRail: { height: 4, borderRadius: 2, marginTop: 10, overflow: 'hidden' },
  progressFill: { height: 4, borderRadius: 2, position: 'absolute', left: 0 },
  progressLabels: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 5 },

  // Media controls — deployed sheet
  mediaControls: {
    flexDirection:  'row',
    alignItems:     'center',
    justifyContent: 'center',
    gap:            28,
    marginTop:      12,
    marginBottom:   4,
  },
  mediaSkipBtn: {
    width:           44,
    height:          44,
    borderRadius:    22,
    borderWidth:     1,
    alignItems:      'center',
    justifyContent:  'center',
  },
  mediaPlayBtn: {
    width:           58,
    height:          58,
    borderRadius:    29,
    alignItems:      'center',
    justifyContent:  'center',
  },

  // Up next
  queueRow: {
    flexDirection:    'row',
    alignItems:       'center',
    gap:              10,
    paddingVertical:  9,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  queueDot: { width: 8, height: 8, borderRadius: 4, flexShrink: 0 },

  // Footer
  footer: {
    flexDirection: 'row',
    gap:           10,
    paddingTop:    8,
    paddingBottom: 16,
  },
  quietBtn: {
    flexDirection:     'row',
    alignItems:        'center',
    justifyContent:    'center',
    gap:               6,
    paddingHorizontal: 14,
    paddingVertical:   10,
    borderRadius:      14,
    borderWidth:       1,
    minHeight:         48,
  },
  footerEndBtn: {
    flex:              1,
    flexDirection:     'row',
    alignItems:        'center',
    justifyContent:    'center',
    gap:               8,
    paddingHorizontal: 14,
    paddingVertical:   12,
    borderRadius:      14,
    minHeight:         48,
  },
});
