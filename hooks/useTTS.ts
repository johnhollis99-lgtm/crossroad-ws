/**
 * hooks/useTTS.ts
 *
 * Cache-first narration lookup + playback.
 *
 * Lookup order (fastest → authoritative):
 *   1. poi.narration_cache["{mode}-{depth}-{voice_id}"]
 *   2. narration_audio table row
 *   3. Server generation (only when generateIfMissing=true)
 *
 * Generation is intentionally off by default — the lookahead precache service
 * (scripts/precache-popular-routes.ts) fills the cache ahead of the user.
 * Set generateIfMissing=true only as a fallback when the lookahead missed.
 */

import { useRef, useCallback, useState } from 'react';
import { Platform } from 'react-native';
import { Audio } from 'expo-av';
import NetInfo from '@react-native-community/netinfo';
import { supabase } from '../lib/supabase';
import type { POI } from '../lib/supabase';

const SERVER = process.env.EXPO_PUBLIC_SERVER_URL ?? 'http://localhost:3001';

export type NarrationDepth = 'glance' | 'ride_along' | 'deep_dive';
export type NarrationMode = 'driving' | 'hiking' | 'city';
export type AudienceMode = 'family' | 'kids' | 'unfiltered' | 'local';

interface VoiceConfigRow {
  voiceId: string;
  provider: string;
  speakingRate?: number;
}

export interface TTSOptions {
  /** Trip mode — drives voice_configs lookup */
  mode: NarrationMode;
  /** Default depth applied when narratePOI is called without an explicit depth */
  depth: NarrationDepth;
  /**
   * Audience mode — added 2026-05-19 alongside the narrator collapse + na_unique
   * widening (migration 20260519000002). Required for correct narration_audio
   * lookup now that two audiences can share a narrator_slug. Defaults to 'family'
   * if not supplied so legacy callers (driving.tsx, trail.tsx, filters.tsx)
   * keep working until the trip-setup audience picker lands.
   */
  audienceMode?: AudienceMode;
}

export function useTTS(options: TTSOptions) {
  const soundRef = useRef<Audio.Sound | null>(null);
  // In-session voice config cache — avoids repeated DB hits per mode
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
  // Reads the active voice for a given audience_mode from voice_configs.
  // Axis fixed 2026-05-20 (Move 3b.2 / drift 5.41) — `voice_configs.mode` is
  // the audience-mode column (family/kids/unfiltered/local), NOT the trip
  // mode (driving/hiking/city). The prior code queried by trip mode and
  // always returned zero rows in production; the bug was masked because
  // mobile pre-supplied voice_id to the route, which made its own lookup
  // unnecessary. Now that the route does its own (correctly-axis'd) lookup,
  // mobile's lookup is only used by `speakText` (filters-screen preview).
  // Throws — never silently falls back — to prevent generating audio under
  // the wrong voice_id and producing orphaned Storage objects.
  const lookupVoiceConfig = async (audienceMode: AudienceMode): Promise<VoiceConfigRow> => {
    const cached = voiceConfigRef.current.get(audienceMode);
    if (cached) return cached;

    const { data, error: dbErr } = await supabase
      .from('voice_configs')
      .select('voice_id, provider, voice_settings')
      .eq('mode', audienceMode)
      .eq('is_active', true)
      .single();

    if (dbErr) {
      throw new Error(`[useTTS] voice_configs query failed for audience '${audienceMode}': ${dbErr.message}`);
    }
    if (!data) {
      throw new Error(
        `[useTTS] no active voice configured for audience '${audienceMode}' — run pnpm audition --commit to set one`,
      );
    }

    const config: VoiceConfigRow = {
      voiceId: data.voice_id,
      provider: data.provider,
      speakingRate: (data.voice_settings as Record<string, number> | null)?.speakingRate,
    };
    voiceConfigRef.current.set(audienceMode, config);
    return config;
  };

  // ── Cache key ─────────────────────────────────────────────────────────────
  // Shape changed 2026-05-20 (Move 3b.2): {mode}-{depth}-{audience_mode}.
  // Voice_id dropped — post-H1.5.1 narrator collapse, audience_mode is the
  // semantic cache discriminator and voice_id is redundant. Route writes the
  // same shape via update_poi_narration_cache RPC. Stale {mode}-{depth}-{voiceId}
  // keys in existing pois.narration_cache rows become unread (deferred to
  // Move 3b.3 cleanup); narration_audio table fallback handles them.
  const buildCacheKey = (mode: NarrationMode, depth: NarrationDepth, audienceMode: AudienceMode): string =>
    `${mode}-${depth}-${audienceMode}`;

  // ── Step 1: pois.narration_cache (O(1), same row) ────────────────────────
  const checkPoiJsonCache = (poi: POI, cacheKey: string): string | null =>
    poi.narration_cache?.[cacheKey] ?? null;

  // ── Step 2: narration_audio table (authoritative, includes prompt_version) ─
  // WHERE shape changed 2026-05-20 (Move 3b.2): drop narrator_slug filter.
  // Post-H1.5.1 narrator collapse, audience_mode is sufficient to disambiguate
  // — narrator_slug is 1:1 with audience_mode (Sadachbia=family, Sulafat=kids,
  // Iapetus=local, Schedar=unfiltered). Also tightens the lookup with the
  // mode (trip-mode) filter for completeness.
  // The `.order(generated_at desc).limit(1)` handles the transition window —
  // if both an old voice_id-keyed row AND a new logical-slug row exist for
  // the same POI, the newer one sorts first and we return its audio_url.
  const checkNarrationAudioTable = async (
    poiId: string,
    depth: NarrationDepth,
    audienceMode: AudienceMode,
    mode: NarrationMode,
  ): Promise<string | null> => {
    const { data } = await supabase
      .from('narration_audio')
      .select('audio_url')
      .eq('poi_id', poiId)
      .eq('audience_mode', audienceMode)
      .eq('depth', depth)
      .eq('mode', mode)
      .eq('status', 'ready')
      .order('generated_at', { ascending: false })
      .limit(1)
      .single();

    return data?.audio_url ?? null;
  };

  // ── Step 3: server generation (only when generateIfMissing=true) ──────────
  // Request body simplified 2026-05-20 (Move 3b.2). Route now fetches POI
  // fields from DB by poi_id and resolves voice_id from voice_configs by
  // audience_mode — mobile no longer needs to pre-supply poi_name /
  // poi_category / poi_tags / voice_id. Sending audience_mode + mode + depth
  // is sufficient. The route's loose body validation tolerates extra fields
  // for any legacy mobile builds still in flight.
  const generateOnServer = async (
    poi: POI,
    depth: NarrationDepth,
    audienceMode: AudienceMode,
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
        audience_mode: audienceMode,
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
      const audienceMode: AudienceMode = options.audienceMode ?? 'family';
      const cacheKey = buildCacheKey(options.mode, depth, audienceMode);

      // 1. JSON cache on the POI row (fastest path — no extra query)
      if (poi) {
        const cached = checkPoiJsonCache(poi, cacheKey);
        if (cached) return cached;
      }

      // 2. narration_audio table (authoritative — used for prompt_version invalidation)
      const fromTable = await checkNarrationAudioTable(poiId, depth, audienceMode, options.mode);
      if (fromTable) return fromTable;

      // 3. Generate on server (opt-in)
      if (!generateIfMissing || !poi) return null;
      return generateOnServer(poi, depth, audienceMode);
    },
    [options.mode, options.audienceMode],
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

  // ── PUBLIC: Speak arbitrary text (voice preview on Filters screen) ────────
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
        const audienceMode: AudienceMode = options.audienceMode ?? 'family';
        const voiceConfig = await lookupVoiceConfig(audienceMode);
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
    [options.mode, options.audienceMode],
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
