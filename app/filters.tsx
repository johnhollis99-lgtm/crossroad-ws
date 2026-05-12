/**
 * RoadStory — Filters.tsx
 *
 * NOTES:
 *   - Uses PanResponder-based pure RN slider (no native module) — avoids findDOMNode crash
 *   - Route params passed as JSON strings
 */

import React, { useState, useRef, useEffect } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  Platform,
  PanResponder,
  LayoutChangeEvent,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation, useRoute } from '@react-navigation/native';
import { getCategories } from '../lib/supabase';
import { XRoadLogo } from '../components/XRoadLogo';
import type { POICategory } from '../lib/supabase';
import { useTTS } from '../hooks/useTTS';

// ── Types ──────────────────────────────────────────────────────────────────
type FilterPreset = 'casual' | 'deep' | 'quiet';
type DepthKey = 'glance' | 'ride_along' | 'deep_dive';
type ToneKey = 'warm' | 'adventurous' | 'sarcastic' | 'adult';
type VoiceKey = 'canyon_guide' | 'trail_poet' | 'leo' | 'rex';

interface FiltersState {
  preset: FilterPreset;
  categoryFilter: string[];
  depth: DepthKey;
  tone: ToneKey;
  voice: VoiceKey;
  corridorMi: number;
}

// ── Pure RN Slider — no native module needed ───────────────────────────────
function RNSlider({ min, max, value, onChange }: { min: number; max: number; value: number; onChange: (v: number) => void }) {
  const trackWidth = useRef(0);
  const pct = (value - min) / (max - min);

  const pan = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: (e) => {
        const x = e.nativeEvent.locationX;
        const ratio = Math.max(0, Math.min(1, x / (trackWidth.current || 1)));
        onChange(Math.round(min + ratio * (max - min)));
      },
      onPanResponderMove: (e) => {
        const x = e.nativeEvent.locationX;
        const ratio = Math.max(0, Math.min(1, x / (trackWidth.current || 1)));
        onChange(Math.round(min + ratio * (max - min)));
      },
    })
  ).current;

  return (
    <View
      style={ss.track}
      onLayout={(e: LayoutChangeEvent) => { trackWidth.current = e.nativeEvent.layout.width; }}
      {...pan.panHandlers}
      hitSlop={{ top: 16, bottom: 16 }}
    >
      <View style={[ss.fill, { width: `${pct * 100}%` as any }]} />
      <View style={[ss.thumb, { left: `${pct * 100}%` as any }]} />
    </View>
  );
}

const ss = StyleSheet.create({
  track: { flex: 1, height: 4, backgroundColor: '#21262d', borderRadius: 2, position: 'relative', justifyContent: 'center' },
  fill: { height: 4, backgroundColor: '#388bfd', borderRadius: 2, position: 'absolute', left: 0 },
  thumb: { width: 18, height: 18, borderRadius: 9, backgroundColor: '#58a6ff', position: 'absolute', marginLeft: -9, top: -7, elevation: 3 },
});

// ── Data ───────────────────────────────────────────────────────────────────
const PRESETS: Record<FilterPreset, { label: string; sub: string; patch: Partial<FiltersState> }> = {
  casual: { label: 'Casual',    sub: 'Short stories, warm tone',    patch: { depth: 'glance',    tone: 'warm', corridorMi: 1 } },
  deep:   { label: 'Deep dive', sub: 'Full context, deep dive mode', patch: { depth: 'deep_dive', tone: 'warm', corridorMi: 2 } },
  quiet:  { label: 'Quiet',     sub: 'Only major landmarks',         patch: { depth: 'glance',    tone: 'warm', corridorMi: 1 } },
};


const DEPTHS: { key: DepthKey; label: string; sub: string }[] = [
  { key: 'glance',     label: 'Glance',     sub: 'Short, bright stories for quick drives' },
  { key: 'ride_along', label: 'Ride Along', sub: 'Balanced context with a warm companion feel' },
  { key: 'deep_dive',  label: 'Deep Dive',  sub: 'Richer detail, deeper context, and hidden gems' },
];

const TONES: { key: ToneKey; label: string }[] = [
  { key: 'warm', label: 'Warm' }, { key: 'adventurous', label: 'Adventurous' },
  { key: 'sarcastic', label: 'Sarcastic' }, { key: 'adult', label: 'Adult / X-Rated' },
];

const VOICES: { key: VoiceKey; label: string; sub: string }[] = [
  { key: 'canyon_guide', label: 'Canyon Guide', sub: 'Warm, conversational (Ara)' },
  { key: 'trail_poet',   label: 'Trail Poet',   sub: 'Energetic, upbeat' },
  { key: 'leo',          label: 'Leo',           sub: 'Playful instructor' },
  { key: 'rex',          label: 'Rex',           sub: 'Bold adventurer' },
];


const PREVIEW_TEXT: Record<DepthKey, string> = {
  glance:     "Welcome to XRoad. Let's hit the road.",
  ride_along: "Welcome to XRoad. Your route is packed with stories — volcanic history, water wars, ghost towns, and hidden gems. Let's hit the road.",
  deep_dive:  "Welcome to XRoad. From the aqueducts that drained a valley to the supervolcano sleeping beneath your wheels, your route is alive with stories most people never hear. I'll be with you for every mile, every layer, every secret the road holds. Let's hit the road.",
};

// ── Component ──────────────────────────────────────────────────────────────
export default function Filters() {
  const navigation = useNavigation<any>();
  const route = useRoute<any>();
  const params = route.params ?? {};
  const { destination, routePreview, turnByTurn, originLocation, mode } = params;

  const [filters, setFilters] = useState<FiltersState>({
    preset: 'casual', categoryFilter: [],
    depth: 'ride_along', tone: 'warm', voice: 'canyon_guide', corridorMi: 1,
  });
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [dbCategories, setDbCategories] = useState<POICategory[]>([]);
  const [previewingVoice, setPreviewingVoice] = useState<VoiceKey | null>(null);

  useEffect(() => {
    getCategories().then(setDbCategories);
  }, []);

  const tts = useTTS({
    mode: 'driving',
    depth: filters.depth,
  });

  // Stop preview when user taps a different voice card (not the preview button)
  useEffect(() => {
    if (previewingVoice !== null && previewingVoice !== filters.voice) {
      tts.stop();
      setPreviewingVoice(null);
    }
  }, [filters.voice]);

  // Clear previewingVoice once audio finishes
  useEffect(() => {
    if (!tts.speaking && !tts.loading && previewingVoice !== null) {
      setPreviewingVoice(null);
    }
  }, [tts.speaking, tts.loading]);

  const handlePreview = (voiceKey: VoiceKey) => {
    if (previewingVoice === voiceKey) {
      tts.stop();
      setPreviewingVoice(null);
    } else {
      tts.stop();
      set('voice', voiceKey);
      setPreviewingVoice(voiceKey);
      tts.speakText(PREVIEW_TEXT[filters.depth]);
    }
  };

  const set = <K extends keyof FiltersState>(key: K, val: FiltersState[K]) =>
    setFilters(f => ({ ...f, [key]: val }));

  const applyPreset = (preset: FilterPreset) =>
    setFilters(f => ({ ...f, preset, ...PRESETS[preset].patch }));

  const toggleCategory = (slug: string) =>
    set('categoryFilter', filters.categoryFilter.includes(slug)
      ? filters.categoryFilter.filter(s => s !== slug)
      : [...filters.categoryFilter, slug]);

  const handleConfirm = () => {
    const targetScreen = mode === 'hiking' ? 'trail' : 'driving';
    navigation.navigate(targetScreen, {
      destination,
      routePreview: typeof routePreview === 'string' ? routePreview : JSON.stringify(routePreview ?? {}),
      originLocation: typeof originLocation === 'string' ? originLocation : JSON.stringify(originLocation ?? {}),
      turnByTurn: turnByTurn ?? 'false',
      filters: JSON.stringify(filters),
      mode: mode ?? 'driving',
    });
  };

  return (
    <SafeAreaView style={s.safe}>
      <View style={s.container}>

        <View style={s.header}>
          <TouchableOpacity style={s.backBtn} onPress={() => navigation.goBack()}>
            <Text style={s.backText}>←</Text>
          </TouchableOpacity>
          <View style={{ flex: 1 }}>
            <Text style={s.headerTitle} numberOfLines={1}>{destination ?? 'Your route'}</Text>
            <Text style={s.headerSub}>Story customization</Text>
          </View>
          <XRoadLogo size="sm" />
        </View>

        <ScrollView style={{ flex: 1 }} contentContainerStyle={s.scrollContent} showsVerticalScrollIndicator={false}>

          <Text style={s.sectionLabel}>Story mode</Text>
          <View style={s.presetRow}>
            {(Object.keys(PRESETS) as FilterPreset[]).map(key => (
              <TouchableOpacity key={key} style={[s.presetCard, filters.preset === key && s.presetCardActive]} onPress={() => applyPreset(key)}>
                <Text style={[s.presetLabel, filters.preset === key && s.presetLabelActive]}>{PRESETS[key].label}</Text>
                <Text style={s.presetSub}>{PRESETS[key].sub}</Text>
              </TouchableOpacity>
            ))}
          </View>

          <Text style={s.sectionLabel}>POI distance from route</Text>
          <View style={s.sliderRow}>
            <Text style={s.sliderEdge}>1 mi</Text>
            <RNSlider min={1} max={5} value={filters.corridorMi} onChange={v => set('corridorMi', v)} />
            <Text style={s.sliderEdge}>5 mi</Text>
            <Text style={s.sliderVal}>{filters.corridorMi} mi</Text>
          </View>

          <TouchableOpacity style={s.advancedToggle} onPress={() => setShowAdvanced(v => !v)}>
            <Text style={s.advancedToggleText}>Customize further</Text>
            <Text style={s.advancedChevron}>{showAdvanced ? '▲' : '▼'}</Text>
          </TouchableOpacity>

          {showAdvanced && (<>
            <Text style={s.sectionLabel}>Categories</Text>
            <View style={s.chipWrap}>
              <TouchableOpacity
                style={[s.chip, filters.categoryFilter.length === 0 && s.chipActive]}
                onPress={() => set('categoryFilter', [])}
              >
                <Text style={[s.chipText, filters.categoryFilter.length === 0 && s.chipTextActive]}>All</Text>
              </TouchableOpacity>
              {dbCategories.map(c => (
                <TouchableOpacity
                  key={c.slug}
                  style={[s.chip, filters.categoryFilter.includes(c.slug) && s.chipActive]}
                  onPress={() => toggleCategory(c.slug)}
                >
                  <Text style={[s.chipText, filters.categoryFilter.includes(c.slug) && s.chipTextActive]}>{c.display_name}</Text>
                </TouchableOpacity>
              ))}
            </View>

            <Text style={s.sectionLabel}>Narration depth</Text>
            {DEPTHS.map(d => (
              <TouchableOpacity key={d.key} style={[s.depthRow, filters.depth === d.key && s.depthRowActive]} onPress={() => set('depth', d.key)}>
                <View style={[s.radio, filters.depth === d.key && s.radioActive]}>
                  {filters.depth === d.key && <View style={s.radioDot} />}
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[s.depthLabel, filters.depth === d.key && s.depthLabelActive]}>{d.label}</Text>
                  <Text style={s.depthSub}>{d.sub}</Text>
                </View>
              </TouchableOpacity>
            ))}

            <Text style={s.sectionLabel}>Tone</Text>
            <View style={s.chipWrap}>
              {TONES.map(t => (
                <TouchableOpacity key={t.key} style={[s.chip, filters.tone === t.key && s.chipGreen]} onPress={() => set('tone', t.key)}>
                  <Text style={[s.chipText, filters.tone === t.key && s.chipTextGreen]}>{t.label}</Text>
                </TouchableOpacity>
              ))}
            </View>

            <Text style={s.sectionLabel}>Guide voice</Text>
            <View style={s.voiceGrid}>
              {VOICES.map(v => (
                <TouchableOpacity key={v.key} style={[s.voiceCard, filters.voice === v.key && s.voiceCardActive]} onPress={() => set('voice', v.key)}>
                  <Text style={[s.voiceLabel, filters.voice === v.key && s.voiceLabelActive]}>{v.label}</Text>
                  <Text style={s.voiceSub}>{v.sub}</Text>
                  <TouchableOpacity
                    style={s.previewBtn}
                    onPress={e => { e.stopPropagation?.(); handlePreview(v.key); }}
                  >
                    {previewingVoice === v.key
                      ? <ActivityIndicator size="small" color="#58a6ff" />
                      : <Text style={s.previewBtnText}>▶ Preview</Text>}
                  </TouchableOpacity>
                </TouchableOpacity>
              ))}
            </View>
          </>)}

          <View style={{ height: 120 }} />
        </ScrollView>

        <View style={s.confirmBar}>
          <TouchableOpacity style={s.confirmBtn} onPress={handleConfirm}>
            <Text style={s.confirmBtnText}>{mode === 'hiking' ? 'Confirm & Hike' : 'Confirm & Drive'}</Text>
          </TouchableOpacity>
        </View>

      </View>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#0d1117' },
  container: { flex: 1, backgroundColor: '#0d1117' },
  header: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1, borderColor: 'rgba(255,255,255,0.06)' },
  backBtn: { width: 34, height: 34, backgroundColor: '#21262d', borderRadius: 8, borderWidth: 1, borderColor: 'rgba(255,255,255,0.06)', alignItems: 'center', justifyContent: 'center' },
  backText: { fontSize: 16, color: '#e6edf3' },
  headerTitle: { fontSize: 15, fontWeight: '600', color: '#e6edf3' },
  headerSub: { fontSize: 12, color: '#8b949e', marginTop: 1 },
  scrollContent: { paddingHorizontal: 16, paddingTop: 16 },
  sectionLabel: { fontSize: 11, color: '#8b949e', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 10, marginTop: 16 },
  presetRow: { flexDirection: 'row', gap: 8 },
  presetCard: { flex: 1, backgroundColor: '#161b22', borderRadius: 10, borderWidth: 1, borderColor: 'rgba(255,255,255,0.06)', padding: 12 },
  presetCardActive: { borderColor: '#388bfd', borderWidth: 2, backgroundColor: 'rgba(56,139,253,0.06)' },
  presetLabel: { fontSize: 13, fontWeight: '600', color: '#8b949e' },
  presetLabelActive: { color: '#58a6ff' },
  presetSub: { fontSize: 11, color: '#8b949e', marginTop: 3, lineHeight: 15 },
  sliderRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  sliderEdge: { fontSize: 11, color: '#8b949e' },
  sliderVal: { fontSize: 13, fontWeight: '600', color: '#58a6ff', minWidth: 40, textAlign: 'right' },
  advancedToggle: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: '#161b22', borderRadius: 10, borderWidth: 1, borderColor: 'rgba(255,255,255,0.06)', paddingHorizontal: 14, paddingVertical: 11, marginTop: 14 },
  advancedToggleText: { fontSize: 13, color: '#8b949e', fontWeight: '500' },
  advancedChevron: { fontSize: 11, color: '#8b949e' },
  chipWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  chip: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20, backgroundColor: '#21262d', borderWidth: 1, borderColor: 'rgba(255,255,255,0.06)' },
  chipActive: { backgroundColor: 'rgba(56,139,253,0.1)', borderColor: '#388bfd' },
  chipGreen: { backgroundColor: 'rgba(63,185,80,0.1)', borderColor: '#3fb950' },
  chipText: { fontSize: 12, color: '#8b949e' },
  chipTextActive: { color: '#58a6ff' },
  chipTextGreen: { color: '#3fb950' },
  depthRow: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: '#161b22', borderRadius: 10, borderWidth: 1, borderColor: 'rgba(255,255,255,0.06)', padding: 12, marginBottom: 6 },
  depthRowActive: { borderColor: '#388bfd' },
  radio: { width: 18, height: 18, borderRadius: 9, borderWidth: 1.5, borderColor: '#8b949e', alignItems: 'center', justifyContent: 'center' },
  radioActive: { borderColor: '#388bfd' },
  radioDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#388bfd' },
  depthLabel: { fontSize: 13, fontWeight: '600', color: '#8b949e' },
  depthLabelActive: { color: '#58a6ff' },
  depthSub: { fontSize: 11, color: '#8b949e', marginTop: 2 },
  voiceGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  voiceCard: { width: '48%', backgroundColor: '#161b22', borderRadius: 10, borderWidth: 1, borderColor: 'rgba(255,255,255,0.06)', padding: 12 },
  voiceCardActive: { borderColor: '#388bfd', borderWidth: 2 },
  voiceLabel: { fontSize: 13, fontWeight: '600', color: '#8b949e' },
  voiceLabelActive: { color: '#58a6ff' },
  voiceSub: { fontSize: 11, color: '#8b949e', marginTop: 2, marginBottom: 8 },
  previewBtn: { backgroundColor: 'rgba(88,166,255,0.1)', borderRadius: 6, paddingHorizontal: 8, paddingVertical: 4, alignSelf: 'flex-start' },
  previewBtnText: { fontSize: 11, color: '#58a6ff', fontWeight: '500' },
  confirmBar: { position: 'absolute', bottom: 0, left: 0, right: 0, padding: 16, paddingBottom: Platform.OS === 'ios' ? 28 : 16, backgroundColor: 'rgba(13,17,23,0.96)', borderTopWidth: 1, borderColor: 'rgba(255,255,255,0.06)' },
  confirmBtn: { backgroundColor: '#3fb950', borderRadius: 12, paddingVertical: 15, alignItems: 'center' },
  confirmBtnText: { fontSize: 16, fontWeight: '700', color: '#0d1117' },
});