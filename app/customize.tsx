/**
 * XRoad — Customize screen (Pine, Phase 2).
 *
 * Layout: 240px non-interactive map peek at top with a fade-into-paper
 * gradient, scrollable content below, sticky Start trip CTA pinned to the
 * bottom edge. Every handler / state machine / data binding from the
 * previous earthy-palette version is preserved — this is a visual rebuild.
 *
 * Receives from Map screen (params):
 *   route: JSON string { id, name, distance_mi, duration_minutes, story_count, origin, destination }
 *   routePreview, originLocation — forwarded to Drive screen
 */

import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  Alert,
  Animated,
  Dimensions,
  PanResponder,
  Platform,
  Pressable,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import MapView, { Marker, Polyline, PROVIDER_GOOGLE } from 'react-native-maps';
import { useNavigation, useRoute } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';

import {
  countPOIsAlongRoute,
  getAvailableNarrators,
  getPOIsAlongRoute,
  saveTrip,
} from '../lib/supabase';
import type { NarratorRecord, POI } from '../lib/supabase';
import { MapStyleId, MAP_STYLES, loadMapStyle, saveMapStyle } from '../lib/mapStyle';
import { MapStylePicker } from '../components/MapStylePicker';
import { useTheme } from '../src/design/theme';
import { shadows } from '../src/design/tokens';
import {
  CategoryChip,
  IconArrowLeft,
  IconArchitecture,
  IconArt,
  IconCar,
  IconFilm,
  IconFood,
  IconHistory,
  IconMusic,
  IconNature,
  IconRoadside,
  IconScience,
  IconWeird,
  NarratorCard,
  OptionCard,
  PoiMarkerX,
  TripStat,
  Wordmark,
  usePoiMarkerTracking,
} from '../src/components';
import type { IconProps } from '../src/components';
import { useTripStore, ALL_CATEGORY_LABELS } from '../src/store/tripStore';
import { curateRoutePOIs } from '../src/lib/curation/curateRoutePOIs';

// ── Constants ────────────────────────────────────────────────────────────────

const { height: SCREEN_H } = Dimensions.get('window');
const MAP_PEEK_MIN = 200;
const MAP_PEEK_MAX = Math.round(SCREEN_H * 0.55);
const STATUS_TOP   = Platform.OS === 'ios' ? 50 : ((StatusBar.currentHeight ?? 24) + 8);
const MAPBOX_TOKEN = process.env.EXPO_PUBLIC_MAPBOX_TOKEN!;
const PEEK_SPRING  = { useNativeDriver: false as const, friction: 9, tension: 80 };

// J1a (2026-05-19): user-facing depth picker removed. Depth is now intrinsic
// per POI (addendum §4) and the runtime narration route accepts only
// 'standard' anyway. The saveTrip payload still writes 'ride_along' until
// the trips.depth column is dropped — see CLAUDE.md J1a-deferred note.
//
// J1a-followups (2026-05-19): Density, Min relevance, and POI distance
// sliders removed from Trip Setup per curator's Expo walk-through. Density
// and min_relevance hardcoded in the saveTrip payload until trips.density
// + trips.min_relevance CHECK columns are dropped; poi_distance_m has no
// CHECK and is dropped from the payload entirely (DB DEFAULT 500 applies).
// See CLAUDE.md J1a-followups-deferred note. The corridor stays mode-aware
// (0.25mi hiking / 1mi driving) and is still forwarded to Drive as
// filters.corridorMi for the Drive-page corridor slider's initial value.

const ALL_CATEGORIES = ALL_CATEGORY_LABELS;

// Maps UI display labels → category icon component (Pine duotone glyphs).
const CATEGORY_ICONS: Record<string, React.ComponentType<IconProps>> = {
  'History':      IconHistory,
  'Nature':       IconNature,
  'Architecture': IconArchitecture,
  'Food':         IconFood,
  'Music':        IconMusic,
  'Weird':        IconWeird,
  'Roadside':     IconRoadside,
  'Film':         IconFilm,
  'Science':      IconScience,
  'Art':          IconArt,
};

// Maps UI display labels → DB poi_category slugs used in get_corridor_pois
const CAT_SLUG: Record<string, string> = {
  'History':      'history',
  'Nature':       'nature',
  'Architecture': 'architecture',
  'Food':         'food_drink',
  'Music':        'local_culture',
  'Weird':        'hidden_gems',
  'Roadside':     'local_culture',
  'Film':         'art',
  'Science':      'geology',
};

const SERVER_URL = (process.env.EXPO_PUBLIC_SERVER_URL ?? 'http://localhost:3001');

// Per Pine Phase 2 spec: narrator avatar colors constrained to Pine-coherent
// hues. Map slug → avatar bg. Fallback uses the persona's stored color.
const NARRATOR_AVATAR_PALETTE: Record<string, string> = {
  'the-professor':      '#60A5FA', // cobalt — matches secondary
  'the-local':          '#9F7AEA', // lilac — replaces the legacy brown
  'the-junior-ranger':  '#10B981', // emerald — matches primary
  'the-truck-driver':   '#F59E0B', // amber — matches CVD-safe accent
};

// ── Preset narrators (fallback if Supabase RPC not yet migrated) ─────────────

const PRESET_NARRATORS: NarratorRecord[] = [
  {
    id: '00000000-0000-0000-0000-000000000001',
    slug: 'the-professor',
    name: 'The Professor',
    subtitle: 'Knows everything',
    description: 'Your encyclopedic companion for every mile.',
    audience_mode: 'family',
    content_rating: 'everyone',
    content_guardrails: 'Universally appropriate, educational, no profanity.',
    tone_keywords: ['confident', 'encyclopedic', 'warm', 'authoritative'],
    voice_id: null,
    voice_descriptor: 'Male, deep, measured',
    intro_line: "Alright, I've been looking at your route — there's more out here than you'd think. Let me walk you through it.",
    system_prompt_fragment: 'You are The Professor, a confident and encyclopedic road-trip narrator.',
    avatar_color_bg: NARRATOR_AVATAR_PALETTE['the-professor'],
    avatar_color_text: '#FFFFFF',
    avatar_initials: 'TP',
    is_preset: true,
    source: 'preset',
  },
  {
    id: '00000000-0000-0000-0000-000000000002',
    slug: 'the-truck-driver',
    name: 'The Truck Driver',
    subtitle: 'Has driven every highway twice',
    description: 'Real talk from 400,000 miles of American asphalt.',
    audience_mode: 'unfiltered',
    content_rating: 'rated_r',
    content_guardrails: '18+ age-gate required. No slurs, no punching down.',
    tone_keywords: ['irreverent', 'sharp', 'funny', 'opinionated'],
    voice_id: null,
    voice_descriptor: 'Male, gravelly, no-nonsense',
    intro_line: "Alright, I've done this run about 400 times. Let me tell you what's actually worth looking at.",
    system_prompt_fragment: 'You are The Truck Driver, a road-trip narrator who has driven every highway in America.',
    avatar_color_bg: NARRATOR_AVATAR_PALETTE['the-truck-driver'],
    avatar_color_text: '#FFFFFF',
    avatar_initials: 'TD',
    is_preset: true,
    source: 'preset',
  },
  {
    id: '00000000-0000-0000-0000-000000000003',
    slug: 'the-junior-ranger',
    name: 'The Junior Ranger',
    subtitle: 'Explorer for ages 4–12',
    description: "Every road trip is a wild adventure. Let's go!",
    audience_mode: 'kids',
    content_rating: 'everyone',
    content_guardrails: 'Strict. No violence, death, or disturbing content. Everything framed as discovery.',
    tone_keywords: ['enthusiastic', 'wonder', 'encouraging', 'curious'],
    voice_id: null,
    voice_descriptor: 'Youthful, bright, energetic',
    intro_line: "Hey explorer! I'm your Junior Ranger and we've got SO many cool things to find on this trip!",
    system_prompt_fragment: 'You are The Junior Ranger, a road-trip narrator for children ages 4–12.',
    avatar_color_bg: NARRATOR_AVATAR_PALETTE['the-junior-ranger'],
    avatar_color_text: '#FFFFFF',
    avatar_initials: 'JR',
    is_preset: true,
    source: 'preset',
  },
  {
    id: '00000000-0000-0000-0000-000000000004',
    slug: 'the-local',
    name: 'The Local',
    subtitle: 'Skips the tourist traps',
    description: "Deep cuts only. The guidebook doesn't know this.",
    audience_mode: 'local',
    content_rating: 'everyone',
    content_guardrails: 'Appropriate for all ages but tone is adult and insider. No explicit content.',
    tone_keywords: ['insider', 'conversational', 'knowing', 'opinionated', 'dry'],
    voice_id: null,
    voice_descriptor: 'Conversational, relaxed, knowing',
    intro_line: "Look — the guidebook stuff is fine but I'll tell you what the guidebooks don't know.",
    system_prompt_fragment: 'You are The Local, a road-trip narrator who is an insider in every region.',
    avatar_color_bg: NARRATOR_AVATAR_PALETTE['the-local'],
    avatar_color_text: '#FFFFFF',
    avatar_initials: 'TL',
    is_preset: true,
    source: 'preset',
  },
];

// ── Types ────────────────────────────────────────────────────────────────────

interface RouteInfo {
  id: string;
  name: string;
  distance_mi: number;
  duration_minutes: number;
  story_count: number;
  origin: string;
  destination: string;
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function fmtDuration(min: number): string {
  const h = Math.floor(min / 60);
  const m = min % 60;
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

function fmtMiles(mi: number): string {
  if (mi === 0) return '0 mi';
  return mi % 1 === 0 ? `${mi} mi` : `${mi.toFixed(1)} mi`;
}

function avatarColorFor(narrator: NarratorRecord): string {
  const slug = narrator.slug ?? '';
  return NARRATOR_AVATAR_PALETTE[slug] ?? narrator.avatar_color_bg ?? '#10B981';
}

// Per-marker wrapper mirroring drive's DrivePoiMarker pattern (app/drive.tsx).
// Each instance owns its own usePoiMarkerTracking window (start true, flip
// false at 1s), so newly-mounted markers from previewPOIs replacement (pill
// toggles) get a fresh snapshot window even though MapScreen mounted earlier.
// Customize uses plain MapView (no clusterer) — drift 5.94's
// clusterer-traversal rule does not apply, so the wrapper-component
// pattern is safe.
function CustomizePreviewMarker({ poi }: { poi: POI }) {
  const tracking = usePoiMarkerTracking();
  return (
    <Marker
      coordinate={{ latitude: poi.lat, longitude: poi.lng }}
      anchor={{ x: 0.5, y: 0.5 }}
      tracksViewChanges={tracking}
    >
      <PoiMarkerX size="preview" tier={poi.priority_tier ?? 'standard'} />
    </Marker>
  );
}

// ── Main screen ───────────────────────────────────────────────────────────────

export default function CustomizeScreen() {
  const navigation = useNavigation<any>();
  const route      = useRoute<any>();
  const insets     = useSafeAreaInsets();
  const { theme }  = useTheme();
  const params     = route.params ?? {};

  const routeInfo: RouteInfo = params.route
    ? (typeof params.route === 'string' ? JSON.parse(params.route) : params.route)
    : { id: '', name: 'Your route', distance_mi: 0, duration_minutes: 0, story_count: 0, origin: '—', destination: '—' };

  const routePreview = params.routePreview
    ? (typeof params.routePreview === 'string' ? JSON.parse(params.routePreview) : params.routePreview)
    : { polylineCoords: [], destLat: null, destLng: null };

  const polylineCoords: { latitude: number; longitude: number }[] = routePreview.polylineCoords ?? [];

  // ── Trip-mode awareness ──────────────────────────────────────────────────
  const activeTripMode = useTripStore(s => s.activeTripMode);
  const isHiking       = activeTripMode === 'hiking';

  // ── Category state ───────────────────────────────────────────────────────
  const selectedCats         = useTripStore(s => s.selectedCategories);
  const toggleCategoryStore  = useTripStore(s => s.toggleCategory);
  const toggleCategory       = useCallback((cat: string) => {
    const nextActive  = !selectedCats.includes(cat);
    const allActive   = nextActive
      ? [...selectedCats, cat]
      : selectedCats.filter(c => c !== cat);
    if (__DEV__) {
      console.info('[customize] filter:chip-toggle', { id: cat, nextActive, allActive });
    }
    toggleCategoryStore(cat);
  }, [selectedCats, toggleCategoryStore]);

  // ── Trip prefs (J1a — Detail + Narrative Focus from Zustand) ──────────────
  const detail             = useTripStore(s => s.detail);
  const setDetail          = useTripStore(s => s.setDetail);
  const narrativeFocus     = useTripStore(s => s.narrativeFocus);
  const setNarrativeFocus  = useTripStore(s => s.setNarrativeFocus);
  const narratorSlug       = useTripStore(s => s.narratorSlug);

  // J1a-followups (2026-05-19): the live POI / pace stats in the header
  // strip still need values for the corridor query and the curation pass.
  // Now derived from trip mode rather than user-controlled sliders.
  // Matches home's defaults (app/index.tsx) so the customize stats agree
  // with what the user saw on the home preview.
  const corridorMi   = isHiking ? 0.25 : 1;
  const density      = isHiking ? 'dense' : 'balanced';
  const minRelevance = 0;

  // ── State ────────────────────────────────────────────────────────────────
  const [narrators,        setNarrators]        = useState<NarratorRecord[]>([]);
  const [loadingNarrators, setLoadingNarrators] = useState(true);
  const [selectedNarrator, setSelectedNarrator] = useState<NarratorRecord | null>(null);
  const [catsScrolled,     setCatsScrolled]     = useState(false);
  const [saving,           setSaving]           = useState(false);
  const [mapStyleId,       setMapStyleId]       = useState<MapStyleId>('dark');
  const [liveStoryCount,   setLiveStoryCount]   = useState<number | null>(routeInfo.story_count);
  const [curatedCount,     setCuratedCount]     = useState<number | null>(null);
  const [avgPaceMin,       setAvgPaceMin]       = useState<number | null>(null);
  const [previewPOIs,      setPreviewPOIs]      = useState<POI[]>([]);

  // J1a: scroll ref + Categories anchor so the "Customize categories →"
  // link under Narrative Focus scrolls the user to the chip rail.
  const scrollViewRef = useRef<ScrollView | null>(null);
  const [categoriesY, setCategoriesY] = useState(0);
  const scrollToCategories = useCallback(() => {
    scrollViewRef.current?.scrollTo({ y: Math.max(0, categoriesY - 12), animated: true });
  }, [categoriesY]);

  useEffect(() => { loadMapStyle().then(setMapStyleId); }, []);

  // ── Drag-to-expand map peek ──────────────────────────────────────────────
  // Inline PanResponder mirrors hooks/useSheetSnap.ts but with inverted
  // direction: handle sits at the bottom of the peek, so a DOWN drag grows
  // the peek and an UP drag shrinks it. Two snap points only (min / max);
  // release picks by velocity (±0.5 throw) or nearest-snap distance.
  const mapRef     = useRef<MapView | null>(null);
  const peekHeight = useRef(new Animated.Value(MAP_PEEK_MIN)).current;
  const peekStart  = useRef(MAP_PEEK_MIN);
  const peekPan    = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder:  (_e, gs) => Math.abs(gs.dy) > 4,
      onPanResponderGrant: () => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        peekStart.current = (peekHeight as any)._value as number;
      },
      onPanResponderMove: (_e, gs) => {
        const next = Math.max(MAP_PEEK_MIN, Math.min(MAP_PEEK_MAX, peekStart.current + gs.dy));
        peekHeight.setValue(next);
      },
      onPanResponderRelease: (_e, gs) => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const cur = (peekHeight as any)._value as number;
        const vy  = gs.vy;
        let target: number;
        if (vy > 0.5)       target = MAP_PEEK_MAX;
        else if (vy < -0.5) target = MAP_PEEK_MIN;
        else                target = (cur - MAP_PEEK_MIN) < (MAP_PEEK_MAX - cur) ? MAP_PEEK_MIN : MAP_PEEK_MAX;
        Animated.spring(peekHeight, { toValue: target, ...PEEK_SPRING }).start();
      },
    })
  ).current;

  // Fit the polyline on first map ready (and on map-style remounts via
  // key={mapStyleId}). Replaces the old static initialRegion approach so
  // the full trip route is framed by default at any peek size.
  const handleMapReady = useCallback(() => {
    if (polylineCoords.length > 1 && mapRef.current) {
      mapRef.current.fitToCoordinates(polylineCoords, {
        edgePadding: { top: 40, right: 40, bottom: 60, left: 40 },
        animated:    false,
      });
    }
  }, [polylineCoords]);

  // ── Stats / curation refresh ─────────────────────────────────────────────
  const HIKING_PACE_MIN_PER_MI = 20;
  const tripDurationMin = isHiking
    ? routeInfo.distance_mi * HIKING_PACE_MIN_PER_MI
    : routeInfo.duration_minutes;
  const filterRequestVersion = useRef(0);

  useEffect(() => {
    if (polylineCoords.length < 2) {
      setLiveStoryCount(null);
      setCuratedCount(null);
      setAvgPaceMin(null);
      return;
    }
    const myVersion = ++filterRequestVersion.current;
    setLiveStoryCount(null);
    setCuratedCount(null);
    const handle = setTimeout(() => {
      const slugs = selectedCats.map(c => CAT_SLUG[c] ?? c.toLowerCase());
      const mode = isHiking ? 'hiking' : 'driving';
      const rpcParams = {
        corridorMi:       Math.max(0.1, corridorMi),
        mode,
        categories:       slugs,
        minSignificance:  minRelevance,
        density,
        version:          myVersion,
      };
      if (__DEV__) {
        console.info('[customize] filter:rpc-call', rpcParams);
      }
      countPOIsAlongRoute(
        polylineCoords, rpcParams.corridorMi, mode, rpcParams.categories,
        { minSignificance: minRelevance },
      ).then(n => {
        if (myVersion !== filterRequestVersion.current) return;
        if (__DEV__) {
          console.info('[customize] filter:rpc-return', { fn: 'countPOIsAlongRoute', count: n, version: myVersion });
        }
        setLiveStoryCount(n);
      }).catch(err => {
        if (__DEV__) console.warn('[customize] filter:rpc-error', { fn: 'countPOIsAlongRoute', err: String(err) });
      });
      getPOIsAlongRoute(
        polylineCoords, rpcParams.corridorMi, rpcParams.categories, mode,
        { sortMode: 'significance_desc', minSignificance: minRelevance, resultLimit: 500 },
      ).then(rawPOIs => {
        if (myVersion !== filterRequestVersion.current) return;
        if (__DEV__) {
          console.info('[customize] filter:rpc-return', {
            fn:     'getPOIsAlongRoute',
            count:  rawPOIs.length,
            sample: rawPOIs.slice(0, 3).map(p => p.name),
            version: myVersion,
          });
        }
        const r = curateRoutePOIs({
          rawPOIs,
          routePolyline: polylineCoords,
          durationMinutes: tripDurationMin,
          tripMode: isHiking ? 'hiking' : 'driving',
          density,
          minRelevance,
          activeCategories: slugs,
        });
        setCuratedCount(r.count);
        setAvgPaceMin(r.avgPaceMinutes);
        setPreviewPOIs(r.curatedPOIs);
      }).catch(err => {
        if (__DEV__) console.warn('[customize] filter:rpc-error', { fn: 'getPOIsAlongRoute', err: String(err) });
      });
    }, 150);
    return () => clearTimeout(handle);
  }, [selectedCats, isHiking, tripDurationMin]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (__DEV__) {
      console.info('[customize] filter:stats-render', { count: curatedCount, avgPaceMin });
    }
  }, [curatedCount, avgPaceMin]);

  const handleMapStyleChange = (id: MapStyleId) => { setMapStyleId(id); saveMapStyle(id); };
  const activeMapStyle = MAP_STYLES[mapStyleId];

  // ── Load narrators ────────────────────────────────────────────────────────
  useEffect(() => {
    getAvailableNarrators()
      .then(data => {
        const list = data.length > 0 ? data : PRESET_NARRATORS;
        setNarrators(list);
        const prof = list.find(n => n.slug === 'the-professor') ?? list[0] ?? null;
        setSelectedNarrator(prof);
      })
      .catch(() => {
        setNarrators(PRESET_NARRATORS);
        setSelectedNarrator(PRESET_NARRATORS[0]);
      })
      .finally(() => setLoadingNarrators(false));
  }, []);

  // ── Start trip ────────────────────────────────────────────────────────────
  const handleStartTrip = useCallback(async () => {
    if (saving) return;

    if (!selectedNarrator) {
      Alert.alert('Select a narrator', 'Choose a narrator before starting your trip.');
      return;
    }

    setSaving(true);

    const payload = {
      routeName:       routeInfo.name,
      origin:          routeInfo.origin,
      destination:     routeInfo.destination,
      distanceMi:      routeInfo.distance_mi,
      durationMin:     routeInfo.duration_minutes,
      narratorId:      selectedNarrator.is_preset ? selectedNarrator.id : undefined,
      userNarratorId:  !selectedNarrator.is_preset ? selectedNarrator.id : undefined,
      narratorName:    selectedNarrator.name,
      // J1a: depth UI removed; hardcoded until trips.depth column
      // is dropped in a follow-up migration. See CLAUDE.md
      // deferred-migration backlog.
      depth:           'ride_along',
      categoryFilter:  selectedCats,
      // J1a-followups: density + min_relevance UI removed; hardcoded
      // until the trips.density / trips.min_relevance CHECK columns
      // are dropped. Same pattern as `depth` above. poi_distance_m has
      // no CHECK and is omitted from the payload entirely so the DB
      // DEFAULT 500 applies. See CLAUDE.md J1a-followups-deferred note.
      density:         'balanced' as const,
      minRelevance:    0,
      status:          'active',
      startedAt:       new Date().toISOString(),
    };
    console.log('[Customize] saveTrip payload:', JSON.stringify(payload, null, 2));

    let tripId: string | null = null;
    try {
      const saved = await saveTrip(payload);
      console.log('[Customize] saveTrip response:', JSON.stringify(saved));
      tripId = saved!.id;
    } catch (e: any) {
      console.error('[Customize] saveTrip error:', e);
      setSaving(false);
      Alert.alert('Could not start trip', e?.message ?? 'Failed to save trip. Please try again.');
      return;
    }

    setSaving(false);

    navigation.navigate('drive', {
      destination:    routeInfo.destination,
      routePreview:   params.routePreview   ?? '',
      originLocation: params.originLocation ?? '',
      tripId,
      narrator:       JSON.stringify(selectedNarrator),
      filters: JSON.stringify({
        // J1a: legacy `depth` removed from filters payload. drive.tsx
        // never reads it; legacy driving.tsx / trail.tsx fall through
        // their `?? 'ride_along'` defaults inside useTTS.
        // J1a-followups: density/minRelevance still emitted with the
        // mode-aware defaults so drive.tsx's curation pass keeps
        // matching the home preview; corridorMi seeds drive.tsx's
        // story-corridor slider initial value.
        categoryFilter: selectedCats.map(c => CAT_SLUG[c] ?? c.toLowerCase()),
        corridorMi,
        tone:           'warm',
        voice:          selectedNarrator.slug ?? 'canyon_guide',
        density,
        minRelevance,
        tripMode:       isHiking ? 'hiking' : 'driving',
        // J1a additions — detail (was `pace`) + focus + reserved
        // narrator slug.
        detail,
        narrativeFocus,
        narratorSlug,
      }),
    });
  }, [selectedNarrator, saving, selectedCats, routeInfo, params, navigation, isHiking, corridorMi, density, minRelevance, detail, narrativeFocus, narratorSlug]);

  // ── Narrator grid: chunk into rows of 2 ──────────────────────────────────
  const narratorRows: NarratorRecord[][] = [];
  for (let i = 0; i < narrators.length; i += 2) narratorRows.push(narrators.slice(i, i + 2));

  const paceLabel = avgPaceMin === null || avgPaceMin === 0
    ? '—'
    : `1 / ${Math.max(1, Math.round(avgPaceMin))}m`;

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <View style={[styles.root, { backgroundColor: theme.colors.paper }]}>

      {/* ── HEADER CARD — nav row + Strip A + Strip B ─────────────────────
          Mirrors the home page header pattern: paperSoft surface, paperEdge
          hairline border, rounded BOTTOM corners (top squared to screen
          edge so the card touches the status-bar inset). Strips stay pinned
          here so live POI/pace feedback is visible while the curation
          controls below scroll. */}
      <View
        style={[
          styles.headerCard,
          {
            backgroundColor: theme.colors.paperSoft,
            borderColor:     theme.colors.paperEdge,
            paddingTop:      STATUS_TOP,
          },
        ]}
      >
        {/* Row 1 — back arrow · wordmark · map-style-picker spacer */}
        <View style={styles.headerRow1}>
          <Pressable
            style={[
              styles.backBtn,
              {
                backgroundColor: theme.colors.paperSoft,
                borderColor:     theme.colors.paperEdge,
              },
              Platform.OS === 'android' ? { elevation: 4 } : shadows.control,
            ]}
            onPress={() => navigation.goBack()}
            accessibilityRole="button"
            accessibilityLabel="Back"
          >
            <IconArrowLeft size={20} color={theme.colors.ink} />
          </Pressable>
          <Wordmark size="m" />
          {/* Spacer — matches back-btn width so the wordmark stays centered.
              MapStylePicker is rendered as the LAST child of the root View
              (after the Start Trip CTA) with absolute positioning that lands
              over this slot. Last-child paint order keeps the dropdown panel
              above the map peek + ScrollView region it extends into; keeping
              it outside the card preserves the picker's tap-outside-to-dismiss
              overlay (which fills the root View, not just the card). */}
          <View style={{ width: 40 }} />
        </View>

        {/* Row 2 — Strip A: route summary inline (origin → dest · duration) */}
        <Text style={styles.routeSummary} numberOfLines={1}>
          <Text style={[theme.textVariants.meta, { color: theme.colors.inkSoft }]}>
            {routeInfo.origin}
          </Text>
          <Text style={[theme.textVariants.meta, { color: theme.colors.primary }]}>
            {'  →  '}
          </Text>
          <Text style={[theme.textVariants.label, { color: theme.colors.ink }]}>
            {routeInfo.destination}
          </Text>
          <Text style={[theme.textVariants.meta, { color: theme.colors.inkFaint }]}>
            {'  ·  '}
          </Text>
          <Text style={[theme.textVariants.meta, { color: theme.colors.inkSoft }]}>
            {fmtDuration(Math.round(tripDurationMin))}
          </Text>
        </Text>

        {/* Row 3 — Strip B: 4-col stats with hairline borders. POIS +
            STORIES PER are live-bound to curatedCount / avgPaceMin and
            update as the user adjusts filters in the scroll area below. */}
        <View
          style={[
            styles.statsStrip,
            {
              borderTopColor:    theme.colors.line,
              borderBottomColor: theme.colors.line,
            },
          ]}
        >
          <TripStat label="DISTANCE" value={fmtMiles(routeInfo.distance_mi)} />
          <TripStat label="DURATION" value={fmtDuration(Math.round(tripDurationMin))} />
          <TripStat label="POIS"     value={curatedCount === null ? '…' : String(curatedCount)} />
          <TripStat label="STORIES PER" value={paceLabel} />
        </View>
      </View>

      {/* ── MAP PEEK — drag-to-expand interactive map ─────────────────────
          Animated.View height drives the peek. Min 200 / max ~55% screen.
          Drag handle at bottom (paper-cream chip + paperEdge pill) accepts
          vertical pan via inline PanResponder. MapView gestures (pan / zoom
          / rotate) enabled at all sizes so the user can explore inside the
          map body without conflicting with the drag handle (separate touch
          regions). Pitch + toolbar stay disabled. fitToCoordinates on
          map-ready frames the full route by default. */}
      <Animated.View style={[styles.mapWrap, { height: peekHeight }]}>
        <MapView
          ref={mapRef}
          key={mapStyleId}
          style={StyleSheet.absoluteFillObject}
          provider={PROVIDER_GOOGLE}
          mapType={activeMapStyle.mapType}
          customMapStyle={activeMapStyle.customMapStyle as any}
          scrollEnabled
          zoomEnabled
          rotateEnabled
          pitchEnabled={false}
          toolbarEnabled={false}
          onMapReady={handleMapReady}
        >
          {polylineCoords.length > 1 && (
            <Polyline
              coordinates={polylineCoords}
              strokeColor={theme.colors.primary}
              strokeWidth={3}
            />
          )}
          {/* POI preview markers — reuses the proven drive-page PoiMarkerX
              render path at preview scale (size="preview", ~18px ring).
              Tier coloring lives inside PoiMarkerX: gold for curator/iconic
              (server-side bypass POIs via G2 + C1), emerald for standard
              tier; cream halo via paintOrder gives the X a high-contrast
              edge against the emerald route polyline. Capped at 50
              defensively — curateRoutePOIs already caps by trip duration +
              density. Per-marker usePoiMarkerTracking in
              CustomizePreviewMarker handles the snapshot window. */}
          {previewPOIs.slice(0, 50).map(poi => (
            <CustomizePreviewMarker key={poi.id} poi={poi} />
          ))}
          {routePreview.destLat != null && (
            <Marker
              coordinate={{ latitude: routePreview.destLat, longitude: routePreview.destLng }}
              anchor={{ x: 0.5, y: 0.5 }}
            >
              <View style={[styles.destMarkerOuter, { backgroundColor: theme.colors.dangerTint }]}>
                <View style={[styles.destMarkerInner, { backgroundColor: theme.colors.danger, borderColor: theme.colors.paper }]} />
              </View>
            </Marker>
          )}
        </MapView>

        {/* Gradient fade — placed INSIDE Animated.View so it stays anchored
            to the bottom edge of the peek at any height (not the old 200px
            boundary). pointerEvents="none" keeps the drag handle tappable. */}
        <LinearGradient
          pointerEvents="none"
          colors={['transparent', theme.colors.paper]}
          locations={[0, 1]}
          style={styles.mapFade}
        />

        {/* Drag handle — bottom-center, paper-cream chip backing keeps the
            pill visible against bright satellite / topo imagery. Painted
            after the gradient so it sits on top. */}
        <View style={styles.dragHandleAnchor} {...peekPan.panHandlers}>
          <View
            style={[
              styles.dragHandleChip,
              {
                backgroundColor: theme.colors.paperSoft,
                borderColor:     theme.colors.paperEdge,
              },
              Platform.OS === 'android' ? { elevation: 4 } : shadows.control,
            ]}
          >
            <View style={[styles.dragHandlePill, { backgroundColor: theme.colors.paperEdge }]} />
          </View>
        </View>
      </Animated.View>

      {/* ── BOTTOM SHEET — scrollable curation controls only ─────────────── */}
      <ScrollView
        ref={scrollViewRef}
        style={[styles.sheet, { backgroundColor: theme.colors.paper }]}
        contentContainerStyle={[styles.sheetContent, { paddingBottom: insets.bottom + 110 }]}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {/* ── Narrator grid ──────────────────────────────────────────────── */}
        {/* J1a: legacy 4-narrator preset grid. Replaced in J1b with the
            2-card narrator picker (Window Seat / Shotgun) once the second
            narrator's voice_configs rows are seeded (Phase J0). */}
        <Text style={[theme.textVariants.eyebrow, styles.sectionLabel, { color: theme.colors.inkSoft }]}>
          Your narrator
        </Text>

        {loadingNarrators ? (
          <View style={styles.narratorGrid}>
            {[0, 1].map(r => (
              <View key={r} style={styles.narratorRow}>
                <View style={[styles.skel, { backgroundColor: theme.colors.paperWarm }]} />
                <View style={[styles.skel, { backgroundColor: theme.colors.paperWarm }]} />
              </View>
            ))}
          </View>
        ) : (
          <View style={styles.narratorGrid}>
            {narratorRows.map((row, ri) => (
              <View key={ri} style={styles.narratorRow}>
                {row.map(narrator => (
                  <NarratorCard
                    key={narrator.id}
                    initials={narrator.avatar_initials ?? '??'}
                    avatarColor={avatarColorFor(narrator)}
                    name={narrator.name}
                    subtitle={narrator.subtitle ?? ''}
                    selected={selectedNarrator?.id === narrator.id}
                    onSelect={() => setSelectedNarrator(narrator)}
                  />
                ))}
                {row.length === 1 && <View style={{ flex: 1 }} />}
              </View>
            ))}
          </View>
        )}

        {/* ── Narrative Focus (J1a — addendum §1.2) ───────────────────────── */}
        <Text style={[theme.textVariants.eyebrow, styles.sectionLabel, { color: theme.colors.inkSoft }]}>
          Narrative focus
        </Text>
        <View style={styles.optionRow}>
          <OptionCard
            title="The Land Speaks"
            sub="Hear the geology, history, and indigenous stories that shape this landscape."
            selected={narrativeFocus === 'the_land_speaks'}
            onSelect={() => setNarrativeFocus('the_land_speaks')}
            testID="focus-the-land-speaks"
          />
          <OptionCard
            title="+ Local Color"
            sub="Adds restaurants, theme parks, and modern attractions to the surface set."
            selected={narrativeFocus === 'local_color'}
            onSelect={() => setNarrativeFocus('local_color')}
            testID="focus-local-color"
          />
        </View>
        <Pressable
          onPress={scrollToCategories}
          accessibilityRole="link"
          accessibilityLabel="Customize categories"
          style={styles.customizeLinkRow}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <Text style={[theme.textVariants.label, { color: theme.colors.primary, fontSize: 13 }]}>
            Customize categories →
          </Text>
        </Pressable>

        {/* ── Detail (J1a — addendum §6; renamed from "Pace" in J1a-followups) ── */}
        <Text style={[theme.textVariants.eyebrow, styles.sectionLabel, { color: theme.colors.inkSoft }]}>
          Detail
        </Text>
        <View style={styles.optionRow}>
          <OptionCard
            title="Full Drive"
            sub="Hear every story at its full length. Best when the journey is the destination."
            selected={detail === 'full_drive'}
            onSelect={() => setDetail('full_drive')}
            testID="detail-full-drive"
          />
          <OptionCard
            title="Light Touch"
            sub="Hear only the standout moments, compressed. Best for everyday drives and family trips."
            selected={detail === 'light_touch'}
            onSelect={() => setDetail('light_touch')}
            testID="detail-light-touch"
          />
        </View>

        {/* ── Categories ───────────────────────────────────────────────────── */}
        <Text
          onLayout={e => setCategoriesY(e.nativeEvent.layout.y)}
          style={[theme.textVariants.eyebrow, styles.sectionLabel, { color: theme.colors.inkSoft }]}
        >
          Categories
        </Text>
        <View style={styles.pillRowWrap}>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.pillScroll}
            scrollEventThrottle={60}
            onScroll={e => {
              const scrolled = e.nativeEvent.contentOffset.x > 0;
              if (scrolled !== catsScrolled) setCatsScrolled(scrolled);
            }}
          >
            {ALL_CATEGORIES.map(cat => {
              const isActive = selectedCats.includes(cat);
              const Icon = CATEGORY_ICONS[cat];
              return (
                <CategoryChip
                  key={cat}
                  label={cat}
                  active={isActive}
                  onToggle={() => toggleCategory(cat)}
                  icon={Icon ? (
                    <Icon
                      size={14}
                      color={isActive ? theme.colors.paperSoft : theme.colors.ink}
                      accent={isActive ? theme.colors.paperSoft : theme.colors.accent}
                    />
                  ) : undefined}
                />
              );
            })}
          </ScrollView>
          {catsScrolled && (
            <LinearGradient
              pointerEvents="none"
              colors={[theme.colors.paper, 'transparent']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={styles.pillFadeLeft}
            />
          )}
          <LinearGradient
            pointerEvents="none"
            colors={['transparent', theme.colors.paper]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={styles.pillFadeRight}
          />
        </View>

      </ScrollView>

      {/* ── Sticky Start trip CTA ─────────────────────────────────────────── */}
      <Pressable
        onPress={handleStartTrip}
        disabled={saving}
        accessibilityRole="button"
        accessibilityState={{ disabled: saving }}
        style={({ pressed }) => [
          styles.startBtn,
          Platform.OS === 'android' ? { elevation: 8 } : shadows.card,
          {
            bottom:          insets.bottom + 16,
            backgroundColor: pressed ? theme.colors.primaryDeep : theme.colors.primary,
            opacity:         saving ? 0.55 : 1,
          },
        ]}
      >
        <IconCar size={20} color={theme.colors.paper} />
        <Text style={[theme.textVariants.label, { color: theme.colors.paper, fontSize: 16 }]}>
          {saving ? 'Starting…' : 'Start trip'}
        </Text>
      </Pressable>

      {/* MapStylePicker — rendered LAST so its dropdown panel paints above
          the map peek + ScrollView region it extends into. The picker is
          absolute-positioned with `buttonTop: STATUS_TOP + 6` so visually
          it still lands in the header card's right-side Row 1 slot; only
          its position in the JSX paint order changes. Kept outside the
          card so the tap-outside-to-dismiss overlay (absoluteFillObject)
          covers the full screen rather than just the card. */}
      <MapStylePicker
        value={mapStyleId}
        onChange={handleMapStyleChange}
        mapboxToken={MAPBOX_TOKEN}
        buttonTop={STATUS_TOP + 6}
        buttonRight={12}
      />
    </View>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  root: { flex: 1 },

  // Header card — mirrors home's headerCard pattern (paperSoft surface,
  // paperEdge hairline, 26px radius, shadow). Adapted for customize: top
  // corners squared to screen edge and `paddingTop: STATUS_TOP` set inline
  // so the card carries the status-bar inset itself.
  headerCard: {
    borderTopLeftRadius:     0,
    borderTopRightRadius:    0,
    borderBottomLeftRadius:  26,
    borderBottomRightRadius: 26,
    borderWidth:             1,
    paddingHorizontal:       14,
    paddingBottom:           12,
    gap:                     12,
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

  // Map peek — height is supplied by the Animated.Value `peekHeight` inline
  // on the Animated.View; only overflow stays here so children clip to the
  // current peek height as it animates between MIN (200) and MAX (~55% H).
  mapWrap:  { overflow: 'hidden' },
  mapFade:  { position: 'absolute', bottom: 0, left: 0, right: 0, height: 110 },

  // Drag handle for the peek. Anchor wraps a paper-cream chip that backs a
  // small paperEdge pill — chip + shadow keep the handle visible against
  // bright satellite/topo imagery. paddingVertical sized for a ~52pt
  // touch target without making the chip itself bulky.
  dragHandleAnchor: {
    position:        'absolute',
    bottom:          0,
    left:            0,
    right:           0,
    alignItems:      'center',
    paddingVertical: 14,
  },
  dragHandleChip: {
    paddingVertical:   6,
    paddingHorizontal: 14,
    borderRadius:      999,
    borderWidth:       1,
    alignItems:        'center',
    justifyContent:    'center',
  },
  dragHandlePill: {
    width:        36,
    height:       4,
    borderRadius: 2,
  },
  backBtn: {
    width:           40,
    height:          40,
    borderRadius:    20,
    borderWidth:     1,
    alignItems:      'center',
    justifyContent:  'center',
  },

  destMarkerOuter: {
    width:           24,
    height:          24,
    borderRadius:    12,
    alignItems:      'center',
    justifyContent:  'center',
  },
  destMarkerInner: {
    width:           12,
    height:          12,
    borderRadius:    6,
    borderWidth:     2,
  },

  // Sheet
  sheet:        { flex: 1 },
  sheetContent: { paddingHorizontal: 16, paddingTop: 4 },

  routeSummary: {
    paddingVertical: 8,
    lineHeight:      20,
  },

  // Stats strip
  statsStrip: {
    flexDirection:     'row',
    alignItems:        'center',
    paddingVertical:   12,
    borderTopWidth:    StyleSheet.hairlineWidth,
    borderBottomWidth: StyleSheet.hairlineWidth,
    marginTop:         4,
  },

  // Section labels (eyebrow)
  sectionLabel: {
    marginTop:    18,
    marginBottom: 10,
  },

  // Narrator grid
  narratorGrid: { gap: 10 },
  narratorRow:  { flexDirection: 'row', gap: 10 },
  skel:         { flex: 1, height: 96, borderRadius: 16, opacity: 0.3 },

  // Option-card pair row (J1a — used by Narrative Focus + Pace)
  optionRow:         { flexDirection: 'row', gap: 10 },
  customizeLinkRow:  { marginTop: 8, paddingVertical: 4 },

  // Categories scroll fades
  pillRowWrap:   { position: 'relative' },
  pillFadeLeft:  { position: 'absolute', left: 0,  top: 0, bottom: 0, width: 20 },
  pillFadeRight: { position: 'absolute', right: 0, top: 0, bottom: 0, width: 20 },
  pillScroll:    { gap: 8, flexDirection: 'row', paddingRight: 20 },

  // Sticky Start trip CTA
  startBtn: {
    position:          'absolute',
    left:              16,
    right:             16,
    flexDirection:     'row',
    alignItems:        'center',
    justifyContent:    'center',
    gap:               10,
    paddingVertical:   16,
    paddingHorizontal: 18,
    borderRadius:      16,
    minHeight:         56,
  },
});
