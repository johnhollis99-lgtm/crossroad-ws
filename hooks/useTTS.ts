/**
 * hooks/useTTS.ts
 *
 * Cache-first narration lookup + playback.
 *
 * Lookup order (fastest → authoritative):
 *   1. poi.narration_cache["{mode}-{depth}-{narrator_slug}"]
 *   2. narration_audio table row
 *   3. Server generation (only when generateIfMissing=true)
 *
 * Generation is intentionally off by default — the lookahead precache service
 * (scripts/precache-popular-routes.ts) fills the cache ahead of the user.
 * Set generateIfMissing=true only as a fallback when the lookahead missed.
 *
 * Migration Batch 2 (Track C, 2026-05-22): audience-mode axis collapsed to
 * narrator_slug. The `AudienceMode` type ('family'|'kids'|'unfiltered'|'local')
 * + the `voice_configs.mode` lookup is retired alongside the legacy
 * 4-narrator preset model. The narration_audio cache discriminator is now
 * `narrator_slug` directly (post-H1.5.1 narrator collapse, audience_mode
 * was already 1:1 with narrator_slug — this just promotes the canonical
 * key). NarrationDepth tracks addendum §4.2 intrinsic-depth values.
 */

import { useRef, useCallback, useState } from 'react';
import { Platform } from 'react-native';
import { Audio } from 'expo-av';
import NetInfo from '@react-native-community/netinfo';
import { supabase } from '../lib/supabase';
import type { POI } from '../lib/supabase';

const SERVER = process.env.EXPO_PUBLIC_SERVER_URL ?? 'http://localhost:3001';

export type NarrationDepth = 'brief' | 'standard' | 'long' | 'long_compressed';
export type NarrationMode = 'driving' | 'hiking' | 'city';
export type NarratorSlug = 'narrator_a' | 'narrator_b';

interface VoiceConfigRow {
  voiceId: string;
  provider: string;
  speakingRate?: number;
}

export interface TTSOptions {
  /** Trip mode — drives narration_audio row filter */
  mode: NarrationMode;
  /** Default depth applied when narratePOI is called without an explicit depth */
  depth: NarrationDepth;
  /**
   * Narrator slug — addendum §5 two-narrator model. Defaults to 'narrator_a'
   * (Window Seat) when not supplied. Post-Batch-2, voice_configs lookup is
   * keyed by narrator_slug instead of audience_mode (column rename pending
   * Phase D3 — voice_configs.narrator_slug + partial unique index on
   * (mode, narrator_slug) WHERE is_active = true).
   */
  narratorSlug?: NarratorSlug;
}

export function useTTS(options: TTSOptions) {
  const soundRef = useRef<Audio.Sound | null>(null);
  // In-session voice config cache — avoids repeated DB hits per narrator
  const voiceConfigRef = useRef<Map<string, VoiceConfigRow>>(new Map());
  const [speaking, setSpeaking] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // ── Network ──────────────────────────────────────────────────────────────
  const hasSignal = async (): Promise<boolean> => {
    const net = await NetInfo.fetch();
    return net.isConnected === true && net.isInternetReachable !== false;
  };

  // ── Voice config lookup ───────────────────────────────────────────────────
  // Migration Batch 2 (Track C, 2026-05-22): queries voice_configs by
  // narrator_slug (the post-collapse canonical key) instead of the legacy
  // audience-mode `mode` column. Phase D3 lands the `narrator_slug` column
  // on voice_configs + the partial unique index `(mode, narrator_slug)
  // WHERE is_active = true`; until then, this query relies on
  // voice_configs already carrying a `narrator_slug` column (added by
  // Track D migration 20260522000010's coordinated partner work, or by
  // a separate D3 prep migration).
  //
  // Throws — never silently falls back — to prevent generating audio under
  // the wrong voice_id and producing orphaned Storage objects.
  const lookupVoiceConfig = async (narratorSlug: NarratorSlug): Promise<VoiceConfigRow> => {
    const cached = voiceConfigRef.current.get(narratorSlug);
    if (cached) return cached;

    const { data, error: dbErr } = await supabase
      .from('voice_configs')
      .select('voice_id, provider, voice_settings')
      .eq('narrator_slug', narratorSlug)
      .eq('is_active', true)
      .single();

    if (dbErr) {
      throw new Error(`[useTTS] voice_configs query failed for narrator '${narratorSlug}': ${dbErr.message}`);
    }
    if (!data) {
      throw new Error(
        `[useTTS] no active voice configured for narrator '${narratorSlug}' — run pnpm audition --commit to set one`,
      );
    }

    const config: VoiceConfigRow = {
      voiceId: data.voice_id,
      provider: data.provider,
      speakingRate: (data.voice_settings as Record<string, number> | null)?.speakingRate,
    };
    voiceConfigRef.current.set(narratorSlug, config);
    return config;
  };

  // ── Cache key ─────────────────────────────────────────────────────────────
  // Shape: {mode}-{depth}-{narrator_slug}. Discriminator is narrator_slug
  // post-Track-C; matches the server narration route's update_poi_narration_cache
  // RPC call shape.
  const buildCacheKey = (mode: NarrationMode, depth: NarrationDepth, narratorSlug: NarratorSlug): string =>
    `${mode}-${depth}-${narratorSlug}`;

  // ── Step 1: pois.narration_cache (O(1), same row) ────────────────────────
  const checkPoiJsonCache = (poi: POI, cacheKey: string): string | null =>
    poi.narration_cache?.[cacheKey] ?? null;

  // ── Step 2: narration_audio table (authoritative, includes prompt_version) ─
  // Filter by narrator_slug directly (post-Track-C). The `audience_mode`
  // column on narration_audio (added in 20260519000002 to disambiguate
  // shared-narrator-slug rows under the H1.5.1 collapse) is no longer needed
  // here — narrator_slug is unambiguous now.
  const checkNarrationAudioTable = async (
    poiId: string,
    depth: NarrationDepth,
    narratorSlug: NarratorSlug,
    mode: NarrationMode,
  ): Promise<string | null> => {
    const { data } = await supabase
      .from('narration_audio')
      .select('audio_url')
      .eq('poi_id', poiId)
      .eq('narrator_slug', narratorSlug)
      .eq('depth', depth)
      .eq('mode', mode)
      .eq('status', 'ready')
      .order('generated_at', { ascending: false })
      .limit(1)
      .single();

    return data?.audio_url ?? null;
  };

  // ── Step 3: server generation (only when generateIfMissing=true) ──────────
  // Sends narrator_slug instead of audience_mode (Track C). Server route
  // (server/routes/narration.ts) updated in lockstep to read narrator_slug
  // from the request body and route to the matching prompt template via
  // pickPoiPrompt(narratorSlug).
  const generateOnServer = async (
    poi: POI,
    depth: NarrationDepth,
    narratorSlug: NarratorSlug,
  ): Promise<string | null> => {
    if (!(await hasSignal())) {
      console.warn('[useTTS] no signal — skipping server generation');
      return null;
    }

    const res = await fetch(`${SERVER}/api/narration/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        poi_id:        poi.id,
        mode:          options.mode,
        depth,
        narrator_slug: narratorSlug,
      }),
    });

    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new Error(`Generation failed ${res.status}: ${(body as { error?: string }).error ?? ''}`);
    }

    const { audio_url } = (await res.json()) as { audio_url: string };
    return audio_url ?? null;
  };

  // ── PUBLIC: get narration URL (fetch-only by default) ────────────────────
  const getNarrationUrl = useCallback(
    async (
      poiId: string,
      depth: NarrationDepth,
      poi?: POI,
      generateIfMissing = false,
    ): Promise<string | null> => {
      const narratorSlug: NarratorSlug = options.narratorSlug ?? 'narrator_a';
      const cacheKey = buildCacheKey(options.mode, depth, narratorSlug);

      // 1. JSON cache on the POI row (fastest path — no extra query)
      if (poi) {
        const cached = checkPoiJsonCache(poi, cacheKey);
        if (cached) return cached;
      }

      // 2. narration_audio table (authoritative — used for prompt_version invalidation)
      const fromTable = await checkNarrationAudioTable(poiId, depth, narratorSlug, options.mode);
      if (fromTable) return fromTable;

      // 3. Generate on server (opt-in)
      if (!generateIfMissing || !poi) return null;
      return generateOnServer(poi, depth, narratorSlug);
    },
    [options.mode, options.narratorSlug],
  );

  // ── Audio playback ────────────────────────────────────────────────────────
  const stop = useCallback(async () => {
    if (soundRef.current) {
      await soundRef.current.stopAsync().catch(() => {});
      await soundRef.current.unloadAsync().catch(() => {});
      soundRef.current = null;
    }
    setSpeaking(false);
  }, []);

  const playUrl = async (url: string): Promise<void> => {
    await stop();
    if (Platform.OS !== 'web') {
      await Audio.setAudioModeAsync({
        allowsRecordingIOS:     false,
        playsInSilentModeIOS:   true,
        staysActiveInBackground: true,
        shouldDuckAndroid:      true,
      });
    }
    const { sound } = await Audio.Sound.createAsync({ uri: url });
    soundRef.current = sound;
    setSpeaking(true);
    await sound.playAsync();
    sound.setOnPlaybackStatusUpdate(status => {
      if (status.isLoaded && status.didJustFinish) setSpeaking(false);
    });
  };

  // ── PUBLIC: Narrate a POI ─────────────────────────────────────────────────
  const narratePOI = useCallback(
    async (
      poi: POI,
      depth: NarrationDepth = options.depth,
      generateIfMissing = false,
    ): Promise<void> => {
      setError(null);
      setLoading(true);
      try {
        const url = await getNarrationUrl(poi.id, depth, poi, generateIfMissing);
        if (!url) {
          setError('No narration cached for this stop');
          return;
        }
        await playUrl(url);
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : 'Narration error';
        setError(msg);
        setSpeaking(false);
      } finally {
        setLoading(false);
      }
    },
    [options.depth, getNarrationUrl],
  );

  // ── PUBLIC: Pre-warm upcoming POIs (fire-and-forget URL resolution) ───────
  // Checks cache for the next N POIs so the URLs are ready before the user
  // arrives. Does NOT generate — the server precache job handles that.
  const prefetchPOIs = useCallback(
    async (upcomingPOIs: POI[], depth: NarrationDepth = options.depth): Promise<void> => {
      if (!(await hasSignal())) return;
      const slice = upcomingPOIs.slice(0, 5);
      for (const poi of slice) {
        await getNarrationUrl(poi.id, depth, poi, false).catch(err =>
          console.warn(`[useTTS] prefetch failed for ${poi.name}:`, err),
        );
      }
    },
    [options.depth, getNarrationUrl],
  );

  // ── PUBLIC: Cache all POIs for offline use (hiking flow) ──────────────────
  // Generates if missing (the hiking offline-first flow needs all audio before
  // the hiker loses signal). Reports progress via onProgress callback.
  const cacheAllPOIs = useCallback(
    async (
      pois: POI[],
      onProgress?: (done: number, total: number) => void,
      depth: NarrationDepth = options.depth,
    ): Promise<void> => {
      if (!(await hasSignal())) return;
      let done = 0;
      for (const poi of pois) {
        try {
          await getNarrationUrl(poi.id, depth, poi, true);
        } catch (err) {
          console.warn(`[useTTS] cacheAllPOIs failed for ${poi.name}:`, err);
        }
        done++;
        onProgress?.(done, pois.length);
      }
    },
    [options.depth, getNarrationUrl],
  );

  // ── PUBLIC: Speak arbitrary text (voice preview) ─────────────────────────
  // Delegates TTS to the server so credentials stay server-side.
  const speakText = useCallback(
    async (text: string): Promise<void> => {
      setError(null);
      setLoading(true);
      try {
        if (!(await hasSignal())) {
          setError('No signal — preview unavailable');
          return;
        }
        const narratorSlug: NarratorSlug = options.narratorSlug ?? 'narrator_a';
        const voiceConfig = await lookupVoiceConfig(narratorSlug);
        const res = await fetch(`${SERVER}/api/narration/preview`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ text, voice_id: voiceConfig.voiceId }),
        });
        if (!res.ok) throw new Error(`Preview failed: ${res.status}`);
        const { audio_url } = (await res.json()) as { audio_url: string };
        await playUrl(audio_url);
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : 'Preview error';
        setError(msg);
        setSpeaking(false);
      } finally {
        setLoading(false);
      }
    },
    [options.mode, options.narratorSlug],
  );

  return {
    narratePOI,
    getNarrationUrl,
    prefetchPOIs,
    cacheAllPOIs,
    speakText,
    stop,
    speaking,
    loading,
    error,
  };
}
