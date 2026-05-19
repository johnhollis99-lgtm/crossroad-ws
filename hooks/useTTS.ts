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
  // Reads the active voice for a given mode from voice_configs.
  // Throws — never silently falls back — to prevent generating audio under the
  // wrong voice_id and producing orphaned Storage objects.
  const lookupVoiceConfig = async (mode: NarrationMode): Promise<VoiceConfigRow> => {
    const cached = voiceConfigRef.current.get(mode);
    if (cached) return cached;

    const { data, error: dbErr } = await supabase
      .from('voice_configs')
      .select('voice_id, provider, voice_settings')
      .eq('mode', mode)
      .eq('is_active', true)
      .single();

    if (dbErr) {
      throw new Error(`[useTTS] voice_configs query failed for mode '${mode}': ${dbErr.message}`);
    }
    if (!data) {
      throw new Error(
        `[useTTS] no active voice configured for mode '${mode}' — run pnpm audition --commit to set one`,
      );
    }

    const config: VoiceConfigRow = {
      voiceId: data.voice_id,
      provider: data.provider,
      speakingRate: (data.voice_settings as Record<string, number> | null)?.speakingRate,
    };
    voiceConfigRef.current.set(mode, config);
    return config;
  };

  // ── Cache key ─────────────────────────────────────────────────────────────
  const buildCacheKey = (mode: NarrationMode, depth: NarrationDepth, voiceId: string): string =>
    `${mode}-${depth}-${voiceId}`;

  // ── Step 1: pois.narration_cache (O(1), same row) ────────────────────────
  const checkPoiJsonCache = (poi: POI, cacheKey: string): string | null =>
    poi.narration_cache?.[cacheKey] ?? null;

  // ── Step 2: narration_audio table (authoritative, includes prompt_version) ─
  // audience_mode filter added 2026-05-19 (H1.6.2) — two audiences can now
  // share the same narrator_slug (e.g. kids + local both at narrator_a in the
  // current voice_configs), so the audience_mode column disambiguates which
  // narration to return.
  const checkNarrationAudioTable = async (
    poiId: string,
    depth: NarrationDepth,
    voiceId: string,
    audienceMode: AudienceMode,
  ): Promise<string | null> => {
    const { data } = await supabase
      .from('narration_audio')
      .select('audio_url')
      .eq('poi_id', poiId)
      .eq('narrator_slug', voiceId)
      .eq('audience_mode', audienceMode)
      .eq('depth', depth)
      .eq('status', 'ready')
      .order('generated_at', { ascending: false })
      .limit(1)
      .single();

    return data?.audio_url ?? null;
  };

  // ── Step 3: server generation (only when generateIfMissing=true) ──────────
  // audience_mode added 2026-05-19 (H1.6.2) so the server can write the new
  // narration_audio.audience_mode column.
  const generateOnServer = async (
    poi: POI,
    depth: NarrationDepth,
    voiceId: string,
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
        poi_name:      poi.name,
        poi_category:  poi.category,
        poi_tags:      poi.tags ?? [],
        mode:          options.mode,
        depth,
        voice_id:      voiceId,
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
      const voiceConfig = await lookupVoiceConfig(options.mode);
      const voiceId = voiceConfig.voiceId;
      const cacheKey = buildCacheKey(options.mode, depth, voiceId);
      const audienceMode: AudienceMode = options.audienceMode ?? 'family';

      // 1. JSON cache on the POI row (fastest path — no extra query)
      if (poi) {
        const cached = checkPoiJsonCache(poi, cacheKey);
        if (cached) return cached;
      }

      // 2. narration_audio table (authoritative — used for prompt_version invalidation)
      const fromTable = await checkNarrationAudioTable(poiId, depth, voiceId, audienceMode);
      if (fromTable) return fromTable;

      // 3. Generate on server (opt-in)
      if (!generateIfMissing || !poi) return null;
      return generateOnServer(poi, depth, voiceId, audienceMode);
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
        const voiceConfig = await lookupVoiceConfig(options.mode);
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
    [options.mode],
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
