/**
 * RoadStory — Customize screen
 *
 * Layout: 220px non-interactive map preview at top, dark scrollable sheet below.
 *
 * Receives from Map screen (params):
 *   route: JSON string { id, name, distance_mi, duration_minutes, story_count, origin, destination }
 *   routePreview, originLocation — forwarded to Drive screen
 *
*/

import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
  Alert,
  KeyboardAvoidingView,
  LayoutChangeEvent,
  Modal,
  PanResponder,
  Platform,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import MapView, { Marker, Polyline, PROVIDER_GOOGLE } from 'react-native-maps';
import { useNavigation, useRoute } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { countPOIsAlongRoute, getAvailableNarrators, getPOIsAlongRoute, saveTrip } from '../lib/supabase';
import type { NarratorRecord, POI } from '../lib/supabase';
import { C } from '../lib/theme';
import { MapStyleId, MAP_STYLES, loadMapStyle, saveMapStyle } from '../lib/mapStyle';
import { MapStylePicker } from '../components/MapStylePicker';
import { Wordmark } from '../src/components';
import { useTripStore } from '../src/store/tripStore';
import { curateRoutePOIs, type Density } from '../src/lib/curation/curateRoutePOIs';

// ── Constants ────────────────────────────────────────────────────────────────

const MAP_PREVIEW_H = 150;
const STATUS_TOP    = Platform.OS === 'ios' ? 50 : ((StatusBar.currentHeight ?? 24) + 8);
const MAPBOX_TOKEN  = process.env.EXPO_PUBLIC_MAPBOX_TOKEN!;

const DEPTH_OPTIONS = [
  { key: 'glance'     as const, label: 'Glance',     sub: '1-2 lines'       },
  { key: 'ride_along' as const, label: 'Ride along', sub: 'Short paragraph' },
  { key: 'deep_dive'  as const, label: 'Deep dive',  sub: 'Full story'      },
];

const ALL_CATEGORIES = [
  'History', 'Nature', 'Architecture', 'Food',
  'Music', 'Weird', 'Roadside', 'Film', 'Science',
];
const DEFAULT_CATEGORIES = ['History', 'Nature', 'Food', 'Roadside'];

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

// POI slider range depends on trip mode (drift 5.81). Driving covers
// regional / interstate corridors, hiking covers single-trail corridors.
const POI_MIN          = 0;
const POI_MAX_DRIVING  = 20;
const POI_MAX_HIKING   = 2;
const POI_STEP         = 0.5;
const POI_DEFAULT_DRV  = 1;
const POI_DEFAULT_HIKE = 0.5;

const SERVER_URL = (process.env.EXPO_PUBLIC_SERVER_URL ?? 'http://localhost:3001');

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
    avatar_color_bg: '#1E3A5F',
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
    avatar_color_bg: '#2D2D2D',
    avatar_color_text: '#FFD700',
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
    avatar_color_bg: '#2E7D32',
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
    avatar_color_bg: '#5D4037',
    avatar_color_text: '#FFFFFF',
    avatar_initials: 'TL',
    is_preset: true,
    source: 'preset',
  },
];

// ── Types ────────────────────────────────────────────────────────────────────

type Depth = 'glance' | 'ride_along' | 'deep_dive';

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

// ── POI distance slider ───────────────────────────────────────────────────────

function PoiSlider({ value, onChange, max }: { value: number; onChange: (v: number) => void; max: number }) {
  const trackWidth = useRef(0);
  const maxRef = useRef(max);
  maxRef.current = max;
  const pct = (value - POI_MIN) / (max - POI_MIN);

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
    const raw   = POI_MIN + ratio * (maxRef.current - POI_MIN);
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
  marker: { position: 'absolute', top: -3, width: 2, height: 10, marginLeft: -1, backgroundColor: C.BORDER_STRONG, borderRadius: 1 },
});

// ── Relevance slider (B4 / drift 5.77) ────────────────────────────────────────
// 0..100 continuous slider with implicit-only markers at 0/50/70/85/95.
// Snaps to whole integers. Marker ticks render faintly under the track so
// users can hit canonical thresholds without a dropdown.

const RELEVANCE_MIN = 0;
const RELEVANCE_MAX = 100;
const RELEVANCE_MARKERS = [0, 50, 70, 85, 95] as const;

function RelevanceSlider({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  const trackWidth = useRef(0);
  const pct = (value - RELEVANCE_MIN) / (RELEVANCE_MAX - RELEVANCE_MIN);

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
    const raw   = RELEVANCE_MIN + ratio * (RELEVANCE_MAX - RELEVANCE_MIN);
    onChange(Math.round(raw));
  }

  return (
    <View
      style={sl.track}
      onLayout={(e: LayoutChangeEvent) => { trackWidth.current = e.nativeEvent.layout.width; }}
      {...pan.panHandlers}
      hitSlop={{ top: 16, bottom: 16 }}
    >
      {RELEVANCE_MARKERS.map(m => (
        <View key={m} style={[sl.marker, { left: `${((m - RELEVANCE_MIN) / (RELEVANCE_MAX - RELEVANCE_MIN)) * 100}%` as any }]} />
      ))}
      <View style={[sl.fill, { width: `${pct * 100}%` as any }]} />
      <View style={[sl.thumb, { left: `${pct * 100}%` as any }]} />
    </View>
  );
}

// ── Create Narrator Modal ─────────────────────────────────────────────────────

function CreateNarratorModal({
  visible,
  onClose,
  onCreated,
  depth,
  categories,
}: {
  visible: boolean;
  onClose: () => void;
  onCreated: (n: NarratorRecord) => void;
  depth: Depth;
  categories: string[];
}) {
  const [vibes, setVibes]   = useState('');
  const [rating, setRating] = useState<'everyone' | 'rated_r'>('everyone');
  const [loading, setLoading] = useState(false);
  const [error, setError]   = useState('');

  const handleGenerate = async () => {
    const vibeWords = vibes.split(',').map(w => w.trim()).filter(Boolean);
    if (!vibeWords.length) { setError('Add at least one vibe word.'); return; }
    setError('');
    setLoading(true);
    try {
      const res = await fetch(`${SERVER_URL}/api/narrators/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mode: 'custom',
          user_id: '00000000-0000-0000-0000-000000000000',
          depth,
          categories,
          content_rating: rating,
          vibe_words: vibeWords,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? 'Generation failed');
      onCreated(json.narrator as NarratorRecord);
      setVibes('');
      onClose();
    } catch (e: any) {
      setError(e.message ?? 'Something went wrong');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <KeyboardAvoidingView
        style={md.overlay}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <View style={md.sheet}>
          <View style={md.handle} />
          <Text style={md.title}>Create your narrator</Text>

          <Text style={md.label}>Personality vibes</Text>
          <TextInput
            style={md.input}
            placeholder="mysterious, dry humor, conspiracy theorist"
            placeholderTextColor={C.TEXT_TERTIARY}
            value={vibes}
            onChangeText={t => { setVibes(t); setError(''); }}
            returnKeyType="done"
            autoCorrect={false}
          />

          <Text style={md.label}>Content rating</Text>
          <View style={md.ratingRow}>
            {(['everyone', 'rated_r'] as const).map(r => (
              <TouchableOpacity
                key={r}
                style={[md.ratingBtn, rating === r && md.ratingBtnOn]}
                onPress={() => setRating(r)}
                activeOpacity={0.8}
              >
                <Text style={[md.ratingText, rating === r && md.ratingTextOn]}>
                  {r === 'everyone' ? 'Everyone' : '18+'}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          {!!error && <Text style={md.errorText}>{error}</Text>}

          <TouchableOpacity
            style={[md.genBtn, loading && { opacity: 0.6 }]}
            onPress={handleGenerate}
            disabled={loading}
            activeOpacity={0.85}
          >
            <Text style={md.genBtnText}>{loading ? 'Generating…' : 'Generate narrator'}</Text>
          </TouchableOpacity>

          <TouchableOpacity onPress={onClose} style={md.cancelBtn} activeOpacity={0.7}>
            <Text style={md.cancelText}>Cancel</Text>
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const md = StyleSheet.create({
  overlay:      { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end' },
  sheet:        { backgroundColor: C.BG_SURFACE, borderTopLeftRadius: 20, borderTopRightRadius: 20, borderTopWidth: 1, borderColor: C.BORDER_SUBTLE, padding: 24, paddingBottom: Platform.OS === 'ios' ? 40 : 24 },
  handle:       { width: 36, height: 4, backgroundColor: C.BORDER_STRONG, borderRadius: 2, alignSelf: 'center', marginBottom: 20 },
  title:        { fontSize: 18, fontWeight: '700', color: C.TEXT_PRIMARY, marginBottom: 20 },
  label:        { fontSize: 10, fontWeight: '700', color: C.TEXT_TERTIARY, textTransform: 'uppercase', letterSpacing: 0.8, marginTop: 18, marginBottom: 8 },
  input:        { borderWidth: 1.5, borderColor: C.BORDER_SUBTLE, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 13, fontSize: 14, color: C.TEXT_PRIMARY, minHeight: 44, backgroundColor: C.BG_ELEVATED },
  ratingRow:    { flexDirection: 'row', gap: 10 },
  ratingBtn:    { flex: 1, paddingVertical: 13, borderRadius: 10, borderWidth: 1.5, borderColor: C.BORDER_SUBTLE, alignItems: 'center', minHeight: 44, backgroundColor: C.BG_ELEVATED },
  ratingBtnOn:  { backgroundColor: C.ACCENT_LIGHT, borderColor: C.ACCENT_BORDER },
  ratingText:   { fontSize: 14, fontWeight: '600', color: C.TEXT_SECONDARY },
  ratingTextOn: { color: C.ACCENT_TEXT },
  errorText:    { fontSize: 13, color: C.DANGER, marginTop: 12 },
  genBtn:       { backgroundColor: C.ACCENT, borderRadius: 12, paddingVertical: 16, alignItems: 'center', marginTop: 20, minHeight: 52 },
  genBtnText:   { fontSize: 16, fontWeight: '700', color: C.WHITE },
  cancelBtn:    { paddingVertical: 16, alignItems: 'center', minHeight: 52 },
  cancelText:   { fontSize: 15, color: C.TEXT_TERTIARY },
});

// ── Main screen ───────────────────────────────────────────────────────────────

export default function CustomizeScreen() {
  const navigation = useNavigation<any>();
  const route      = useRoute<any>();
  const insets     = useSafeAreaInsets();
  const params     = route.params ?? {};

  const routeInfo: RouteInfo = params.route
    ? (typeof params.route === 'string' ? JSON.parse(params.route) : params.route)
    : { id: '', name: 'Your route', distance_mi: 0, duration_minutes: 0, story_count: 0, origin: '—', destination: '—' };

  const routePreview = params.routePreview
    ? (typeof params.routePreview === 'string' ? JSON.parse(params.routePreview) : params.routePreview)
    : { polylineCoords: [], destLat: null, destLng: null };

  const polylineCoords: { latitude: number; longitude: number }[] = routePreview.polylineCoords ?? [];
  const midIdx = Math.floor(polylineCoords.length / 2);
  const midPoint = polylineCoords[midIdx] ?? { latitude: 34.05, longitude: -118.24 };

  // ── Trip-mode awareness (drift 5.81) ─────────────────────────────────────
  // Read activeTripMode from the Zustand store. Drives POI slider range,
  // density default (B3), and the pace divisor used by the stats strip
  // when it lands in commit 3.
  const activeTripMode = useTripStore(s => s.activeTripMode);
  const isHiking       = activeTripMode === 'hiking';
  const poiMax         = isHiking ? POI_MAX_HIKING : POI_MAX_DRIVING;
  const poiDefault     = isHiking ? POI_DEFAULT_HIKE : POI_DEFAULT_DRV;

  // ── Category state (drift 5.80) ───────────────────────────────────────────
  // Lifted to the Zustand store so home and customize stay in sync.
  // Empty = include all (B2 curation convention).
  const selectedCats      = useTripStore(s => s.selectedCategories);
  const toggleCategory    = useTripStore(s => s.toggleCategory);

  // ── State ────────────────────────────────────────────────────────────────
  const [narrators,        setNarrators]        = useState<NarratorRecord[]>([]);
  const [loadingNarrators, setLoadingNarrators] = useState(true);
  const [selectedNarrator, setSelectedNarrator] = useState<NarratorRecord | null>(null);
  const [selectedDepth,    setSelectedDepth]    = useState<Depth>('ride_along');
  const [catsScrolled,     setCatsScrolled]     = useState(false);
  const [poiDist,          setPoiDist]          = useState(poiDefault);
  const [saving,           setSaving]           = useState(false);
  const [mapStyleId,       setMapStyleId]       = useState<MapStyleId>('dark');
  const [liveStoryCount,   setLiveStoryCount]   = useState<number | null>(routeInfo.story_count);
  // B3 density (drift 5.75): balanced for driving, dense for hiking by default.
  const [density,          setDensity]          = useState<Density>(isHiking ? 'dense' : 'balanced');
  // B4 relevance threshold (drift 5.77): 0..100, default 0 = no filter.
  const [minRelevance,     setMinRelevance]     = useState<number>(0);
  // B5 curated count + avg pace for the stats strip. Refreshed on slider /
  // category / distance / density / relevance changes via the effect below.
  const [curatedCount,     setCuratedCount]     = useState<number | null>(null);
  const [avgPaceMin,       setAvgPaceMin]       = useState<number | null>(null);

  // Clamp current poiDist if the mode-driven max shrinks beneath it
  // (e.g. user toggles from Drive 20mi → Hike 2mi). Without this the
  // slider thumb would render past the track end.
  useEffect(() => {
    if (poiDist > poiMax) setPoiDist(poiMax);
  }, [poiMax]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { loadMapStyle().then(setMapStyleId); }, []);

  // ── Stats / curation refresh (drift 5.75 / 5.76 / 5.77 / 5.78) ────────────
  // 150ms debounce per spec B5. Fetches the corridor with significance-desc
  // sort, runs the pure curation function, and updates the stats strip's
  // count + pace. Replaces the prior count-only `countPOIsAlongRoute` call.
  //
  // Pace divisor (drift 5.81 follow-up): driving uses route duration as-is;
  // hiking estimates 20 min/mi when the route record has no native hike
  // duration. Drift 5.85 tracks adding a real hike-duration field.
  const HIKING_PACE_MIN_PER_MI = 20;
  const tripDurationMin = isHiking
    ? routeInfo.distance_mi * HIKING_PACE_MIN_PER_MI
    : routeInfo.duration_minutes;

  useEffect(() => {
    if (polylineCoords.length < 2) {
      setLiveStoryCount(null);
      setCuratedCount(null);
      setAvgPaceMin(null);
      return;
    }
    setLiveStoryCount(null);
    setCuratedCount(null);
    const handle = setTimeout(() => {
      const slugs = selectedCats.map(c => CAT_SLUG[c] ?? c.toLowerCase());
      const mode = isHiking ? 'hiking' : 'driving';
      countPOIsAlongRoute(polylineCoords, Math.max(0.1, poiDist), mode, slugs.length ? slugs : null)
        .then(n => setLiveStoryCount(n));
      getPOIsAlongRoute(
        polylineCoords, Math.max(0.1, poiDist), slugs.length ? slugs : null, mode,
        { sortMode: 'significance_desc', minSignificance: minRelevance, resultLimit: 500 },
      ).then(rawPOIs => {
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
      });
    }, 150);
    return () => clearTimeout(handle);
  }, [selectedCats, poiDist, isHiking, density, minRelevance, tripDurationMin]); // eslint-disable-line react-hooks/exhaustive-deps
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
  // Note: Roll-the-dice + Create-your-own narrator flows removed per
  // drift 5.83. The 4 narrator cards are the supported selection surface.
  const handleStartTrip = useCallback(async () => {
    if (saving) return;

    if (!selectedNarrator) {
      Alert.alert('Select a narrator', 'Choose a narrator before starting your trip.');
      return;
    }
    // Empty categories = include all (B2 curation convention) — no alert here.
    if (poiDist < POI_MIN || poiDist > poiMax) {
      Alert.alert('Invalid distance', `POI distance must be between ${POI_MIN} and ${poiMax} miles.`);
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
      depth:           selectedDepth,
      categoryFilter:  selectedCats,
      poiDistanceM:    Math.round(poiDist * 1609.34),
      density,                                  // drift 5.75
      minRelevance,                             // drift 5.77
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
        depth:          selectedDepth,
        categoryFilter: selectedCats.map(c => CAT_SLUG[c] ?? c.toLowerCase()),
        corridorMi:     Math.max(0.1, poiDist),
        tone:           'warm',
        voice:          selectedNarrator.slug ?? 'canyon_guide',
        density,                                // drift 5.75 — drive curates with this
        minRelevance,                           // drift 5.77 — drive curates with this
        tripMode:       isHiking ? 'hiking' : 'driving',
      }),
    });
  }, [selectedNarrator, saving, selectedDepth, selectedCats, poiDist, routeInfo, params, navigation]);

  // ── Narrator grid: chunk into rows of 2 ──────────────────────────────────
  const narratorRows: NarratorRecord[][] = [];
  for (let i = 0; i < narrators.length; i += 2) narratorRows.push(narrators.slice(i, i + 2));

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <View style={s.root}>

      {/* ── MAP PREVIEW — top 220px ──────────────────────────────────────── */}
      <View style={s.mapWrap}>
        <MapView
          style={StyleSheet.absoluteFillObject}
          provider={PROVIDER_GOOGLE}
          mapType={activeMapStyle.mapType}
          customMapStyle={activeMapStyle.customMapStyle as any}
          scrollEnabled={false}
          zoomEnabled={false}
          rotateEnabled={false}
          pitchEnabled={false}
          toolbarEnabled={false}
          initialRegion={{
            latitude:      midPoint.latitude,
            longitude:     midPoint.longitude,
            latitudeDelta: 0.10,
            longitudeDelta: 0.10,
          }}
        >
          {polylineCoords.length > 1 && (
            <Polyline
              coordinates={polylineCoords}
              strokeColor="rgba(245,240,232,0.85)"
              strokeWidth={3}
            />
          )}
          {routePreview.destLat != null && (
            <Marker
              coordinate={{ latitude: routePreview.destLat, longitude: routePreview.destLng }}
              anchor={{ x: 0.5, y: 0.5 }}
            >
              <View style={s.destMarkerOuter}><View style={s.destMarkerInner} /></View>
            </Marker>
          )}
        </MapView>

        {/* Dark gradient at bottom of map — blends into sheet */}
        <View style={[s.mapFade, { pointerEvents: 'none' }]} />

        {/* Header overlay on map */}
        <View style={[s.mapHeader, { paddingTop: STATUS_TOP }]}>
          <TouchableOpacity style={s.backBtn} onPress={() => navigation.goBack()} activeOpacity={0.7}>
            <Text style={s.backArrow}>←</Text>
          </TouchableOpacity>
          <Wordmark size="m" />
          <View style={{ width: 44 }} />
        </View>

        <MapStylePicker
          value={mapStyleId}
          onChange={handleMapStyleChange}
          mapboxToken={MAPBOX_TOKEN}
          buttonTop={STATUS_TOP + 6}
          buttonRight={10}
        />
      </View>

      {/* ── BOTTOM SHEET — scrollable ────────────────────────────────────── */}
      {/* C3 / drift 5.69 (correct-file fix): explicit paddingBottom on the
          scroll content so the Start trip CTA always clears the Android
          system nav by ≥16px above insets.bottom. Replaces the prior
          `<View height={40+insets.bottom}/>` sibling spacer pattern. */}
      <ScrollView
        style={s.sheet}
        contentContainerStyle={[s.sheetContent, { paddingBottom: insets.bottom + 16 }]}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {/* Context bar */}
        <View style={s.contextBar}>
          <Text style={s.contextText} numberOfLines={1}>
            <Text style={s.contextDim}>{routeInfo.origin}</Text>
            <Text style={s.contextSep}> → </Text>
            <Text style={s.contextBright}>{routeInfo.destination}</Text>
            <Text style={s.contextSep}>  ·  </Text>
            <Text style={s.contextDim}>{fmtDuration(routeInfo.duration_minutes)}</Text>
            <Text style={s.contextSep}>  ·  </Text>
            <Text style={[s.contextDim, { color: C.WARNING }]}>
              {liveStoryCount === null ? '…' : liveStoryCount} {liveStoryCount === 1 ? 'story' : 'stories'}
            </Text>
          </Text>
        </View>

        {/* ── Stats strip (B5 / drift 5.75) ────────────────────────────────
            Distance · Duration · Curated POIs · Average pace.
            Updates 150ms after density / relevance / category / distance
            changes via the curation effect above. */}
        <View style={s.statsStrip}>
          <Text style={s.statsNum}>{fmtMiles(routeInfo.distance_mi)}</Text>
          <Text style={s.statsDot}>·</Text>
          <Text style={s.statsNum}>{fmtDuration(Math.round(tripDurationMin))}</Text>
          <Text style={s.statsDot}>·</Text>
          <Text style={s.statsNum}>{curatedCount === null ? '…' : curatedCount} POIs</Text>
          <Text style={s.statsDot}>·</Text>
          <Text style={s.statsNum}>
            {avgPaceMin === null || avgPaceMin === 0
              ? '—'
              : `1 every ${Math.max(1, Math.round(avgPaceMin))}m`}
          </Text>
        </View>

        {/* ── Narration depth ────────────────────────────────────────────── */}
        <Text style={s.sectionLabel}>Narration depth</Text>
        <View style={s.depthRow}>
          {DEPTH_OPTIONS.map(opt => {
            const sel = selectedDepth === opt.key;
            return (
              <TouchableOpacity
                key={opt.key}
                style={[s.depthBtn, sel && s.depthBtnSel]}
                onPress={() => setSelectedDepth(opt.key)}
                activeOpacity={0.8}
              >
                <Text style={[s.depthBtnLabel, sel && s.depthBtnLabelSel]}>{opt.label}</Text>
                <Text style={[s.depthBtnSub,   sel && s.depthBtnSubSel]}>{opt.sub}</Text>
              </TouchableOpacity>
            );
          })}
        </View>

        {/* ── Narrator grid ──────────────────────────────────────────────── */}
        <Text style={s.sectionLabel}>Your narrator</Text>

        {loadingNarrators ? (
          <View style={s.narratorGrid}>
            {[0, 1].map(r => (
              <View key={r} style={s.narratorRow}>
                <View style={[s.narratorCard, s.narratorCardSkeleton]} />
                <View style={[s.narratorCard, s.narratorCardSkeleton]} />
              </View>
            ))}
          </View>
        ) : (
          <View style={s.narratorGrid}>
            {narratorRows.map((row, ri) => (
              <View key={ri} style={s.narratorRow}>
                {row.map(narrator => {
                  const sel = selectedNarrator?.id === narrator.id;
                  return (
                    <TouchableOpacity
                      key={narrator.id}
                      style={[s.narratorCard, sel && s.narratorCardSel]}
                      onPress={() => setSelectedNarrator(narrator)}
                      activeOpacity={0.8}
                    >
                      <View style={[s.avatar, { backgroundColor: narrator.avatar_color_bg ?? C.ACCENT }]}>
                        <Text style={[s.avatarText, { color: narrator.avatar_color_text ?? C.WHITE }]}>
                          {narrator.avatar_initials ?? '??'}
                        </Text>
                      </View>
                      <Text style={[s.narratorName, sel && s.narratorNameSel]} numberOfLines={1}>
                        {narrator.name}
                      </Text>
                      <Text style={s.narratorSub} numberOfLines={1}>{narrator.subtitle}</Text>
                    </TouchableOpacity>
                  );
                })}
                {row.length === 1 && <View style={s.narratorGhost} />}
              </View>
            ))}
          </View>
        )}

        {/* Roll-the-dice + Create-your-own removed per drift 5.83.
            CreateNarratorModal definition remains in this file as a carrier
            item against future re-enablement; it is not rendered here. */}

        {/* ── Categories ───────────────────────────────────────────────────── */}
        <Text style={s.sectionLabel}>Categories</Text>
        <View style={s.pillRowWrap}>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={s.pillScroll}
            scrollEventThrottle={60}
            onScroll={e => {
              const scrolled = e.nativeEvent.contentOffset.x > 0;
              if (scrolled !== catsScrolled) setCatsScrolled(scrolled);
            }}
          >
            {ALL_CATEGORIES.map(cat => {
              const on = selectedCats.includes(cat);
              return (
                <TouchableOpacity
                  key={cat}
                  style={[s.pill, on && s.pillOn]}
                  onPress={() => toggleCategory(cat)}
                  activeOpacity={0.8}
                >
                  <Text style={[s.pillText, on && s.pillTextOn]}>{cat}</Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>
          {catsScrolled && (
            <LinearGradient
              pointerEvents="none"
              colors={[C.BG_SURFACE, 'transparent']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={s.pillFadeLeft}
            />
          )}
          <LinearGradient
            pointerEvents="none"
            colors={['transparent', C.BG_SURFACE]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={s.pillFadeRight}
          />
        </View>

        {/* ── Density (B3 / drift 5.75) ───────────────────────────────────── */}
        <Text style={s.sectionLabel}>Density</Text>
        <View style={s.densityRow}>
          {(['sparse', 'balanced', 'dense'] as const).map(d => {
            const sel = density === d;
            return (
              <TouchableOpacity
                key={d}
                style={[s.densitySeg, sel && s.densitySegSel]}
                onPress={() => setDensity(d)}
                activeOpacity={0.8}
              >
                <Text style={[s.densitySegText, sel && s.densitySegTextSel]}>
                  {d.charAt(0).toUpperCase() + d.slice(1)}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>

        {/* ── Relevance threshold (B4 / drift 5.77) ───────────────────────── */}
        <View style={s.sliderLabelRow}>
          <Text style={s.sliderLabelKey}>Min relevance</Text>
          <Text style={s.sliderLabelVal}>{minRelevance}</Text>
        </View>
        <View style={s.sliderRow}>
          <Text style={s.sliderEdge}>0</Text>
          <RelevanceSlider value={minRelevance} onChange={setMinRelevance} />
          <Text style={s.sliderEdge}>100</Text>
        </View>

        {/* ── POI distance slider ───────────────────────────────────────────── */}
        <View style={s.sliderLabelRow}>
          <Text style={s.sliderLabelKey}>POI distance</Text>
          <Text style={s.sliderLabelVal}>{fmtMiles(poiDist)}</Text>
        </View>
        <View style={s.sliderRow}>
          <Text style={s.sliderEdge}>{fmtMiles(POI_MIN)}</Text>
          <PoiSlider value={poiDist} onChange={setPoiDist} max={poiMax} />
          <Text style={s.sliderEdge}>{fmtMiles(poiMax)}</Text>
        </View>

        {/* ── Start trip CTA ────────────────────────────────────────────────── */}
        <TouchableOpacity
          style={[s.startBtn, saving && { opacity: 0.55 }]}
          onPress={handleStartTrip}
          disabled={saving}
          activeOpacity={0.85}
        >
          <Text style={s.startBtnText}>{saving ? 'Starting…' : 'Start trip'}</Text>
        </TouchableOpacity>

        {/* (Prior `<View height={40+insets.bottom}/>` removed — see C3 above:
            contentContainerStyle.paddingBottom now carries the gesture-zone buffer.) */}
      </ScrollView>

      {/* CreateNarratorModal not rendered (drift 5.83) — kept in module
          as a carrier for future re-enablement. */}
    </View>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: C.BG_BASE },

  // Map preview
  mapWrap:    { height: MAP_PREVIEW_H, overflow: 'hidden' },
  mapFade:    { position: 'absolute', bottom: 0, left: 0, right: 0, height: 60, backgroundColor: 'rgba(38,26,12,0.85)' },
  mapHeader:  { position: 'absolute', top: 0, left: 0, right: 0, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 12, paddingBottom: 12 },
  backBtn:    { width: 44, height: 44, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(38,26,12,0.75)', borderRadius: 22 },
  backArrow:  { fontSize: 22, color: C.TEXT_PRIMARY },
  headerTitle: { fontSize: 15, fontWeight: '600', color: C.TEXT_PRIMARY },

  destMarkerOuter: { width: 20, height: 20, borderRadius: 10, backgroundColor: `${C.DANGER}40`, alignItems: 'center', justifyContent: 'center' },
  destMarkerInner: { width: 10, height: 10, borderRadius: 5, backgroundColor: C.DANGER, borderWidth: 2, borderColor: C.BG_BASE },

  // Sheet
  sheet:        { flex: 1, backgroundColor: C.BG_SURFACE },
  sheetContent: { paddingHorizontal: 20, paddingTop: 12, paddingBottom: 16 },

  // Context bar
  contextBar:   { paddingBottom: 10, borderBottomWidth: 1, borderColor: C.BORDER_SUBTLE },
  contextText:  { fontSize: 13, lineHeight: 20 },
  contextDim:   { color: C.TEXT_SECONDARY },
  contextBright:{ color: C.TEXT_PRIMARY, fontWeight: '600' },
  contextSep:   { color: C.BORDER_STRONG },

  // Section labels
  sectionLabel: { fontSize: 10, fontWeight: '700', color: C.TEXT_TERTIARY, textTransform: 'uppercase', letterSpacing: 0.8, marginTop: 16, marginBottom: 8 },

  // Depth buttons
  depthRow:         { flexDirection: 'row', gap: 8 },
  depthBtn:         { flex: 1, paddingVertical: 8, paddingHorizontal: 6, borderRadius: 12, borderWidth: 1.5, borderColor: C.BORDER_SUBTLE, backgroundColor: C.BG_ELEVATED, alignItems: 'center', minHeight: 50 },
  depthBtnSel:      { borderColor: C.ACCENT_BORDER, backgroundColor: C.ACCENT_LIGHT },
  depthBtnLabel:    { fontSize: 13, fontWeight: '600', color: C.TEXT_SECONDARY, textAlign: 'center' },
  depthBtnLabelSel: { color: C.ACCENT_TEXT },
  depthBtnSub:      { fontSize: 11, color: C.TEXT_TERTIARY, textAlign: 'center', marginTop: 2, lineHeight: 14 },
  depthBtnSubSel:   { color: C.ACCENT_TEXT },

  // Narrator grid
  narratorGrid:        { gap: 8 },
  narratorRow:         { flexDirection: 'row', gap: 8 },
  narratorCard:        { flex: 1, borderRadius: 14, borderWidth: 1.5, borderColor: C.BORDER_SUBTLE, backgroundColor: C.BG_ELEVATED, padding: 10 },
  narratorCardSel:     { borderColor: C.ACCENT_BORDER, backgroundColor: C.ACCENT_LIGHT },
  narratorCardSkeleton:{ height: 90, opacity: 0.2, backgroundColor: C.BORDER_SUBTLE },
  narratorGhost:       { flex: 1 },
  avatar:     { width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center', marginBottom: 6 },
  avatarText: { fontSize: 13, fontWeight: '700' },
  narratorName:    { fontSize: 13, fontWeight: '700', color: C.TEXT_PRIMARY },
  narratorNameSel: { color: C.ACCENT_TEXT },
  narratorSub:     { fontSize: 11, color: C.TEXT_TERTIARY, marginTop: 1 },
  narratorDesc:    { fontSize: 11, color: C.TEXT_TERTIARY, marginTop: 4, lineHeight: 16 },

  // Narrator actions
  actionRow:  { flexDirection: 'row', gap: 10, marginTop: 8 },
  actionBtn:  { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 10, borderRadius: 12, borderWidth: 1.5, borderColor: C.BORDER_SUBTLE, borderStyle: 'dashed', minHeight: 44 },
  actionIcon: { fontSize: 16 },
  actionText: { fontSize: 12, fontWeight: '600', color: C.TEXT_SECONDARY },
  ratingNote: { fontSize: 12, color: C.TEXT_TERTIARY, textAlign: 'center', marginTop: 10, lineHeight: 18 },

  // Categories
  pillRowWrap:   { position: 'relative' },
  pillFadeLeft:  { position: 'absolute', left: 0,  top: 0, bottom: 0, width: 20 },
  pillFadeRight: { position: 'absolute', right: 0, top: 0, bottom: 0, width: 20 },
  pillWrap:   { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  pillScroll: { gap: 8, flexDirection: 'row', paddingRight: 20 },
  pill:       { paddingHorizontal: 12, paddingVertical: 7, borderRadius: 20, borderWidth: 2, borderColor: C.BORDER_STRONG, backgroundColor: C.BG_ELEVATED, minHeight: 38, alignItems: 'center', justifyContent: 'center' },
  pillOn:     { backgroundColor: C.ACCENT, borderColor: C.ACCENT, borderWidth: 0 },
  pillText:   { fontSize: 13, color: C.TEXT_PRIMARY, fontWeight: '600' },
  pillTextOn: { color: C.WHITE, fontWeight: '700' },

  // POI slider
  sliderLabelRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', marginTop: 16, marginBottom: 10 },
  sliderLabelKey: { fontSize: 10, fontWeight: '700', color: C.TEXT_TERTIARY, textTransform: 'uppercase', letterSpacing: 0.8 },
  sliderLabelVal: { fontSize: 14, fontWeight: '700', color: C.ACCENT_TEXT },
  sliderRow:  { flexDirection: 'row', alignItems: 'center', gap: 10 },
  sliderEdge: { fontSize: 11, color: C.TEXT_TERTIARY, minWidth: 36, textAlign: 'center' },

  // Start trip CTA
  startBtn:     { backgroundColor: C.ACCENT, borderRadius: 14, paddingVertical: 13, alignItems: 'center', marginTop: 16, minHeight: 50 },
  startBtnText: { fontSize: 17, fontWeight: '700', color: C.WHITE },

  // Stats strip (B5 / drift 5.75)
  statsStrip: {
    flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between',
    paddingVertical: 10,
    borderTopWidth: StyleSheet.hairlineWidth, borderBottomWidth: StyleSheet.hairlineWidth,
    borderColor: C.BORDER_SUBTLE,
    marginTop: 8,
  },
  statsNum: { fontSize: 14, fontWeight: '600', color: C.TEXT_PRIMARY, fontStyle: 'italic' },
  statsDot: { fontSize: 14, color: C.TEXT_TERTIARY, paddingHorizontal: 6 },

  // Density segmented control (B3 / drift 5.75)
  densityRow: {
    flexDirection: 'row', gap: 8, marginBottom: 4,
  },
  densitySeg: {
    flex: 1, paddingVertical: 10, borderRadius: 10,
    borderWidth: 1.5, borderColor: C.BORDER_SUBTLE,
    backgroundColor: C.BG_ELEVATED, alignItems: 'center', minHeight: 44,
  },
  densitySegSel:     { borderColor: C.ACCENT_BORDER, backgroundColor: C.ACCENT_LIGHT },
  densitySegText:    { fontSize: 13, fontWeight: '600', color: C.TEXT_SECONDARY },
  densitySegTextSel: { color: C.ACCENT_TEXT },
});
