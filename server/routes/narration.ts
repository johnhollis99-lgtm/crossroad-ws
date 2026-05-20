'use strict';

/**
 * Production narration route — Phase 06 rewrite (Move 3b.2, 2026-05-20).
 *
 * POST /api/narration/generate
 *   Body: { poi_id, mode, depth, audience_mode? } + ignored legacy fields
 *   Returns: { audio_url }
 *
 * POST /api/narration/preview
 *   Body: { text, voice_id }
 *   Returns: { audio_url }
 *
 * /generate pipeline (matches the curator-approved precache pattern):
 *   POI fetch → voice_configs lookup (axis-fixed: audience_mode + narrator_slug)
 *     → pickPoiPrompt(audience, depth)           — server/prompts/pois registry
 *     → Haiku (claude-haiku-4-5-20251001), JSON parse with single retry
 *     → ssmlize() (server/lib/ssml.ts)
 *     → generateNarration() via scripts/lib/tts/ provider abstraction
 *         (handles SSML auto-detection, HD→Neural2 fallback, retry, TTS cost logging)
 *     → Storage upload at pois/{poi_id}/{narrator_slug}_{audience_mode}_{depth}.opus
 *     → narration_audio 2-phase write (pending → ready, or → failed on exception)
 *     → llm_calls per-Claude-attempt + per-ssml-skip + per-ssml-fallback marker
 *         (TTS rows logged automatically by the abstraction; route does NOT log them)
 *     → pois.narration_cache jsonb merge with new key shape {mode}-{depth}-{audience_mode}
 *
 * /preview is unchanged from the pre-rewrite route — direct Google TTS client,
 * no registry, no narration_audio row, no llm_calls (preview is treated as
 * non-billable user-facing voice audition surface).
 */

import express, { Request, Response, Router } from 'express';
import { TextToSpeechClient } from '@google-cloud/text-to-speech';
import { supabase } from '../lib/supabase';
import { ssmlize, stripMarkersAndTags } from '../lib/ssml.js';
import { registerProvider, generateNarration } from '../../scripts/lib/tts/index.js';
import { GoogleTTSProvider } from '../../scripts/lib/tts/providers/google.js';
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { pickPoiPrompt } = require('../prompts/pois') as {
  pickPoiPrompt: (audienceMode: string, depth: string) => {
    systemPrompt: string;
    buildUserPrompt: (poi: Record<string, unknown>) => string;
    narratorSlug: string;
    audienceMode?: string;
    depth?: string;
  };
};

const router: Router = express.Router();

// Provider registry — idempotent; same registry the precache scripts populate.
registerProvider(new GoogleTTSProvider());

// ── Constants ───────────────────────────────────────────────────────────────
const ANTHROPIC_BASE = 'https://api.anthropic.com/v1';
const STORAGE_BUCKET = 'narration-audio';
const STORAGE_PREFIX = 'pois';
const PROMPT_VERSION = 2; // bumped from 1 in Move 3b.2 — registry-shaped narrations
const HAIKU_MODEL = 'claude-haiku-4-5-20251001';
const HAIKU_MAX_TOKENS = 900;
const HAIKU_IN_PER_TOK = 1.0 / 1_000_000;
const HAIKU_OUT_PER_TOK = 5.0 / 1_000_000;

const ALLOWED_AUDIENCES = ['family', 'kids', 'unfiltered', 'local'] as const;
type AudienceMode = typeof ALLOWED_AUDIENCES[number];
const ALLOWED_MODES = ['driving', 'hiking', 'city'] as const;
type TripMode = typeof ALLOWED_MODES[number];
const ALLOWED_DEPTHS = ['standard'] as const;
type Depth = typeof ALLOWED_DEPTHS[number];

// ── Types ───────────────────────────────────────────────────────────────────
interface PoiForPrompt {
  id: string;
  name: string;
  description: string | null;
  category_display: string | null;
  tags: string[];
  source_citation: string | null;
  off_route_landmark_hint: string | null;
}

interface VoiceConfig {
  voiceId: string;
  speakingRate: number;
  narratorSlug: string;
}

// ── Google TTS client (lazy init — only used by /preview now) ───────────────
let ttsClient: TextToSpeechClient | null = null;
function getTTSClient(): TextToSpeechClient {
  if (!ttsClient) ttsClient = new TextToSpeechClient();
  return ttsClient;
}

// ── Voice config lookup (drift-5.41 axis fix: audience_mode + narrator_slug) ──
async function lookupVoiceConfig(audienceMode: AudienceMode): Promise<VoiceConfig> {
  const { data, error } = await supabase
    .from('voice_configs')
    .select('voice_id, narrator_slug, voice_settings')
    .eq('mode', audienceMode)
    .eq('is_active', true)
    .single();
  if (error || !data) {
    throw new Error(
      `[narration] voice_configs has no active row for audience '${audienceMode}' — run pnpm audition --commit to set one`,
    );
  }
  const settings = (data.voice_settings as { speakingRate?: number } | null) ?? {};
  return {
    voiceId: data.voice_id as string,
    speakingRate: settings.speakingRate ?? 1.0,
    narratorSlug: data.narrator_slug as string,
  };
}

// ── POI fetch (one round-trip, includes everything the registry needs) ──────
async function fetchPoiForNarration(poiId: string): Promise<PoiForPrompt> {
  const { data, error } = await supabase
    .from('pois')
    .select(`
      id, name, description, tags, source_citation,
      off_route_landmark_hint, category_id,
      poi_categories!inner(slug, display_name)
    `)
    .eq('id', poiId)
    .is('merged_into', null)
    .single();
  if (error || !data) {
    throw new Error(`POI not found or merged: ${poiId}`);
  }
  const cat = (data as { poi_categories?: { display_name?: string } }).poi_categories;
  return {
    id: data.id as string,
    name: data.name as string,
    description: (data.description as string | null) ?? null,
    category_display: cat?.display_name ?? null,
    tags: (data.tags as string[] | null) ?? [],
    source_citation: (data.source_citation as string | null) ?? null,
    off_route_landmark_hint: (data.off_route_landmark_hint as string | null) ?? null,
  };
}

// ── Haiku narration generation (JSON output + single parse-retry) ───────────
async function generateNarrationViaHaiku(
  template: ReturnType<typeof pickPoiPrompt>,
  poi: PoiForPrompt,
  pendingId: string,
): Promise<{ narrationText: string; haikuCost: number; retryUsed: boolean }> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY not set');

  const userPrompt = template.buildUserPrompt({
    name: poi.name,
    description: poi.description,
    category_display: poi.category_display,
    tags: poi.tags,
    source_citation: poi.source_citation,
    off_route_landmark_hint: poi.off_route_landmark_hint,
  });

  let narrationText: string | null = null;
  let haikuCost = 0;
  let retryUsed = false;
  let lastParseErr: string | null = null;

  for (let attempt = 1; attempt <= 2; attempt++) {
    const systemForAttempt =
      attempt === 1
        ? template.systemPrompt
        : template.systemPrompt +
          '\n\nRETRY NOTE: The previous response could not be parsed as JSON. ' +
          'Return ONLY a single valid JSON object exactly matching the schema {"narration": "...", "key_themes": [...]}. ' +
          'No prose outside the JSON, no markdown fences, no commentary. ' +
          'Escape any embedded newlines or quotes inside the narration string.';

    const res = await fetch(`${ANTHROPIC_BASE}/messages`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: HAIKU_MODEL,
        max_tokens: HAIKU_MAX_TOKENS,
        system: systemForAttempt,
        messages: [{ role: 'user', content: userPrompt }],
      }),
    });
    if (!res.ok) {
      const body = await res.text().catch(() => '');
      throw new Error(`Haiku HTTP ${res.status} (attempt ${attempt}): ${body.slice(0, 200)}`);
    }
    const json = (await res.json()) as {
      content?: Array<{ type: string; text?: string }>;
      usage?: { input_tokens?: number; output_tokens?: number };
    };
    const inTok = json.usage?.input_tokens ?? 0;
    const outTok = json.usage?.output_tokens ?? 0;
    const attemptCost = +(inTok * HAIKU_IN_PER_TOK + outTok * HAIKU_OUT_PER_TOK).toFixed(6);
    haikuCost += attemptCost;

    logCost({
      callType: 'claude',
      provider: 'anthropic',
      modelOrVoice: attempt === 1 ? HAIKU_MODEL : `${HAIKU_MODEL}__parse_retry`,
      inputChars: userPrompt.length,
      inputTokens: inTok,
      outputTokens: outTok,
      costUsd: attemptCost,
      relatedId: pendingId,
    }).catch(err => console.error('[narration] logCost(claude) failed:', err));

    const raw = (json.content ?? [])
      .filter(b => b.type === 'text')
      .map(b => b.text ?? '')
      .join('')
      .trim();
    const cleaned = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
    try {
      const parsed = JSON.parse(cleaned) as { narration?: string };
      if (!parsed.narration) {
        lastParseErr = 'empty narration field';
        continue;
      }
      narrationText = parsed.narration;
      if (attempt === 2) retryUsed = true;
      break;
    } catch (e) {
      lastParseErr = e instanceof Error ? e.message : String(e);
    }
  }

  if (!narrationText) {
    throw new Error(`Haiku JSON parse failed after retry: ${lastParseErr ?? 'unknown'}`);
  }
  return { narrationText, haikuCost, retryUsed };
}

// ── Storage upload ──────────────────────────────────────────────────────────
async function uploadAudio(
  poiId: string,
  narratorSlug: string,
  audienceMode: string,
  depth: string,
  audioBuffer: Buffer,
): Promise<{ audioUrl: string; storagePath: string }> {
  const storagePath = `${STORAGE_PREFIX}/${poiId}/${narratorSlug}_${audienceMode}_${depth}.opus`;
  const { error } = await supabase.storage
    .from(STORAGE_BUCKET)
    .upload(storagePath, audioBuffer, {
      contentType: 'audio/ogg; codecs=opus',
      upsert: true,
    });
  if (error) throw new Error(`Storage upload failed: ${error.message}`);
  const { data } = supabase.storage.from(STORAGE_BUCKET).getPublicUrl(storagePath);
  return { audioUrl: data.publicUrl, storagePath };
}

// ── Phase 1: insert pending row before generation begins ────────────────────
async function insertNarrationAudioPending(args: {
  poiId: string;
  narratorSlug: string;
  audienceMode: AudienceMode;
  depth: Depth;
  mode: TripMode;
}): Promise<string> {
  const { data, error } = await supabase
    .from('narration_audio')
    .upsert(
      {
        poi_id: args.poiId,
        region_id: null,
        narrator_slug: args.narratorSlug,
        audience_mode: args.audienceMode,
        depth: args.depth,
        mode: args.mode,
        audio_url: null,
        status: 'pending',
        provider: 'google',
        prompt_version: PROMPT_VERSION,
        generated_at: new Date().toISOString(),
      },
      { onConflict: 'poi_id,region_id,narrator_slug,audience_mode,depth,mode', ignoreDuplicates: false },
    )
    .select('id')
    .single();
  if (error || !data) throw new Error(`narration_audio pending insert failed: ${error?.message ?? 'no row returned'}`);
  return data.id as string;
}

// ── Phase 2: promote pending row to ready after upload completes ────────────
async function updateNarrationAudioReady(args: {
  id: string;
  audioUrl: string;
  charCount: number;
  costUsd: number;
  durationMs: number;
  narrationText: string;
}): Promise<void> {
  const { error } = await supabase
    .from('narration_audio')
    .update({
      status: 'ready',
      audio_url: args.audioUrl,
      character_count: args.charCount,
      cost_usd: args.costUsd,
      duration_ms: args.durationMs,
      narration_text: args.narrationText,
    })
    .eq('id', args.id);
  if (error) throw new Error(`narration_audio ready update failed: ${error.message}`);
}

// ── pois.narration_cache jsonb merge ─────────────────────────────────────────
// Cache key shape changed in Move 3b.2: {mode}-{depth}-{audience_mode}.
// Mobile's buildCacheKey + checkPoiJsonCache use the same shape.
async function updatePoiNarrationCache(
  poiId: string,
  mode: string,
  depth: string,
  audienceMode: string,
  audioUrl: string,
): Promise<void> {
  const cacheKey = `${mode}-${depth}-${audienceMode}`;
  const { error } = await supabase.rpc('update_poi_narration_cache', {
    p_poi_id: poiId,
    p_cache_key: cacheKey,
    p_audio_url: audioUrl,
  });
  if (error) {
    // RPC unavailable — fall back to direct UPDATE with jsonb merge
    const { data: existing } = await supabase
      .from('pois')
      .select('narration_cache')
      .eq('id', poiId)
      .single();
    const cur = (existing?.narration_cache as Record<string, string> | null) ?? {};
    const merged = { ...cur, [cacheKey]: audioUrl };
    await supabase.from('pois').update({ narration_cache: merged }).eq('id', poiId);
  }
}

// ── llm_calls logger ────────────────────────────────────────────────────────
interface CostRecord {
  callType: 'claude' | 'tts';
  provider: string;
  modelOrVoice: string;
  inputChars?: number;
  inputTokens?: number;
  outputTokens?: number;
  costUsd: number;
  relatedId?: string;
}
async function logCost(record: CostRecord): Promise<void> {
  await supabase.from('llm_calls').insert({
    call_type: record.callType,
    provider: record.provider,
    model_or_voice: record.modelOrVoice,
    input_chars: record.inputChars ?? null,
    input_tokens: record.inputTokens ?? null,
    output_tokens: record.outputTokens ?? null,
    cost_usd: record.costUsd,
    related_id: record.relatedId ?? null,
  });
}

// ── POST /api/narration/generate ────────────────────────────────────────────
router.post('/generate', async (req: Request, res: Response) => {
  // Loose validation — unknown fields silently ignored. Deprecated voice_id
  // tolerated (legacy mobile clients) with a debug log.
  const body = req.body as Record<string, unknown>;
  if (body.voice_id !== undefined) {
    console.debug('[narration] /generate ignoring deprecated voice_id field');
  }

  const poi_id = body.poi_id as string | undefined;
  const mode = body.mode as string | undefined;
  const depth = body.depth as string | undefined;
  const audience_mode_raw = (body.audience_mode as string | undefined) ?? 'family';

  if (!poi_id || !mode || !depth) {
    return res.status(400).json({ error: 'poi_id, mode, depth are required' });
  }
  if (!ALLOWED_AUDIENCES.includes(audience_mode_raw as AudienceMode)) {
    return res.status(400).json({ error: `audience_mode must be one of ${ALLOWED_AUDIENCES.join(', ')}` });
  }
  if (!ALLOWED_MODES.includes(mode as TripMode)) {
    return res.status(400).json({ error: `mode must be one of ${ALLOWED_MODES.join(', ')}` });
  }
  if (!ALLOWED_DEPTHS.includes(depth as Depth)) {
    return res.status(400).json({ error: `depth must be one of ${ALLOWED_DEPTHS.join(', ')}` });
  }
  const audience_mode = audience_mode_raw as AudienceMode;
  const tripMode = mode as TripMode;
  const narrationDepth = depth as Depth;

  // 1. Voice config (axis-fixed: audience_mode + narrator_slug + is_active)
  let voice: VoiceConfig;
  try {
    voice = await lookupVoiceConfig(audience_mode);
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'voice lookup failed';
    return res.status(500).json({ error: msg });
  }

  // 2. POI fetch (single round-trip, includes registry-required fields)
  let poi: PoiForPrompt;
  try {
    poi = await fetchPoiForNarration(poi_id);
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'POI fetch failed';
    return res.status(500).json({ error: msg });
  }

  // 3. Template selection (registry — throws on unknown audience/depth)
  let template: ReturnType<typeof pickPoiPrompt>;
  try {
    template = pickPoiPrompt(audience_mode, narrationDepth);
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'template lookup failed';
    return res.status(500).json({ error: msg });
  }

  // 4. Insert pending narration_audio row (stable id for cost-tracking)
  let pendingId: string;
  try {
    pendingId = await insertNarrationAudioPending({
      poiId: poi_id,
      narratorSlug: voice.narratorSlug,
      audienceMode: audience_mode,
      depth: narrationDepth,
      mode: tripMode,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'pending insert failed';
    console.error('[narration] pending insert failed:', err);
    return res.status(500).json({ error: msg });
  }

  try {
    // 5. Haiku narration text (with single parse-retry)
    const { narrationText, haikuCost } = await generateNarrationViaHaiku(template, poi, pendingId);

    // 6. SSML post-processing — skip events logged for adherence audit
    const { ssml, skips } = ssmlize(narrationText);
    for (const skip of skips) {
      logCost({
        callType: 'tts',
        provider: 'google',
        modelOrVoice: `ssmlize_skip_${skip.type}`,
        inputChars: skip.value.length,
        costUsd: 0,
        relatedId: pendingId,
      }).catch(err => console.error('[narration] logCost(skip) failed:', err));
    }

    // 7. TTS via the abstraction (HD→Neural2 fallback + retry + cost log
    //    all owned by the provider/abstraction).
    let ttsOutput = await generateNarration({
      text: ssml,
      mode: tripMode,
      depth: narrationDepth,
      voiceConfigOverride: {
        provider: 'google',
        voiceId: voice.voiceId,
        speakingRate: voice.speakingRate,
      },
    });
    if (!ttsOutput) {
      // SSML synthesis failed — log a marker and retry with plain text
      logCost({
        callType: 'tts',
        provider: 'google',
        modelOrVoice: `${voice.voiceId}__SSML_PARSE_FAILED`,
        inputChars: ssml.length,
        costUsd: 0,
        relatedId: pendingId,
      }).catch(err => console.error('[narration] logCost(ssml-fallback) failed:', err));
      const plain = stripMarkersAndTags(narrationText);
      ttsOutput = await generateNarration({
        text: plain,
        mode: tripMode,
        depth: narrationDepth,
        voiceConfigOverride: {
          provider: 'google',
          voiceId: voice.voiceId,
          speakingRate: voice.speakingRate,
        },
      });
      if (!ttsOutput) throw new Error('TTS failed (both SSML and plain text)');
    }

    const audioBuffer = Buffer.isBuffer(ttsOutput.audioBuffer)
      ? ttsOutput.audioBuffer
      : Buffer.from(ttsOutput.audioBuffer);

    // 8. Storage upload — precache path shape
    const { audioUrl } = await uploadAudio(
      poi_id,
      voice.narratorSlug,
      audience_mode,
      narrationDepth,
      audioBuffer,
    );

    // 9. Promote pending row to ready
    await updateNarrationAudioReady({
      id: pendingId,
      audioUrl,
      charCount: narrationText.length,
      costUsd: +(haikuCost + ttsOutput.costUsd).toFixed(6),
      durationMs: ttsOutput.durationMs,
      narrationText,
    });

    // 10. Patch pois.narration_cache (fire-and-forget — JSON cache is best-effort)
    updatePoiNarrationCache(poi_id, tripMode, narrationDepth, audience_mode, audioUrl).catch(err =>
      console.error('[narration] narration_cache update failed:', err),
    );

    return res.json({ audio_url: audioUrl });
  } catch (err) {
    // Mark row failed so the sweeper can clean up Storage if needed
    await supabase
      .from('narration_audio')
      .update({ status: 'failed' })
      .eq('id', pendingId)
      .then(() => undefined, e => console.error('[narration] failed to mark row failed:', e));

    const msg = err instanceof Error ? err.message : 'Narration generation failed';
    console.error('[narration] /generate error:', err);
    return res.status(500).json({ error: msg });
  }
});

// ── POST /api/narration/preview ─────────────────────────────────────────────
// Unchanged from pre-rewrite: direct Google TTS, no narration_audio row,
// no llm_calls. Voice-preview surface on the filters screen.
router.post('/preview', async (req: Request, res: Response) => {
  const { text, voice_id } = req.body as { text?: string; voice_id?: string };
  if (!text || !voice_id) {
    return res.status(400).json({ error: 'text and voice_id are required' });
  }

  try {
    const client = getTTSClient();
    const audioConfig = { audioEncoding: 'OGG_OPUS' as const, speakingRate: 1.0 };
    let audioContent: Uint8Array | string;
    let usedVoiceId = voice_id;
    try {
      const [response] = await client.synthesizeSpeech({
        input: { text },
        voice: { languageCode: 'en-US', name: voice_id },
        audioConfig,
      });
      if (!response.audioContent) throw new Error('Empty audioContent from Google TTS');
      audioContent = response.audioContent as Uint8Array | string;
    } catch {
      if (voice_id.includes('Chirp3-HD')) {
        const fallbackName = 'en-US-Neural2-D';
        const [fallback] = await client.synthesizeSpeech({
          input: { text },
          voice: { languageCode: 'en-US', name: fallbackName },
          audioConfig,
        });
        if (!fallback.audioContent) throw new Error('Google TTS fallback returned empty audioContent');
        audioContent = fallback.audioContent as Uint8Array | string;
        usedVoiceId = fallbackName;
      } else {
        throw new Error(`Google TTS failed for voice ${voice_id}`);
      }
    }
    const audioBuffer = Buffer.from(audioContent as Uint8Array);

    const storagePath = `preview/${usedVoiceId}.opus`;
    const { error } = await supabase.storage
      .from(STORAGE_BUCKET)
      .upload(storagePath, audioBuffer, {
        contentType: 'audio/ogg; codecs=opus',
        upsert: true,
      });
    if (error) throw new Error(`Preview upload failed: ${error.message}`);

    const { data } = supabase.storage.from(STORAGE_BUCKET).getPublicUrl(storagePath);
    return res.json({ audio_url: data.publicUrl });
  } catch (err) {
    console.error('[narration] /preview error:', err);
    const msg = err instanceof Error ? err.message : 'Preview generation failed';
    return res.status(500).json({ error: msg });
  }
});

module.exports = router;
