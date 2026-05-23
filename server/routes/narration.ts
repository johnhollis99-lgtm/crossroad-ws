'use strict';

/**
 * Production narration route — Migration Batch 1 rewrite (2026-05-22).
 *
 * POST /api/narration/generate
 *   Body: { poi_id, mode, depth, narrator_slug? } + ignored legacy fields
 *   Returns: { audio_url }
 *
 * POST /api/narration/preview
 *   Body: { text, voice_id }
 *   Returns: { audio_url }
 *
 * /generate pipeline:
 *   POI fetch → voice_configs lookup by (narrator_slug, is_active) — random
 *               slot pick when both slots are active for the narrator
 *     → pickPoiPrompt(narratorSlug, depth, poi, sources) — server/prompts/pois
 *       (narrator-keyed registry; returns Anthropic messages array directly)
 *     → Haiku (claude-haiku-4-5-20251001), plain-prose output (no JSON parse)
 *     → ssmlize() (server/lib/ssml.ts)
 *     → generateNarration() via scripts/lib/tts/ provider abstraction
 *         (handles SSML auto-detection, HD→Neural2 fallback, retry, TTS cost logging)
 *     → Storage upload at pois/{poi_id}/{narrator_slug}_{voice_slot}_{depth}.opus
 *     → narration_audio 2-phase write (pending → ready, or → failed on exception)
 *         (audience_mode written as NULL — collapsed per Migration 3)
 *     → llm_calls per-Claude-attempt + per-ssml-skip + per-ssml-fallback marker
 *         (TTS rows logged automatically by the abstraction; route does NOT log them)
 *     → pois.narration_cache jsonb merge with key shape {mode}-{depth}-{narrator_slug}
 *
 * PROMPT_VERSION bumped 2→3 to mark the registry shape change.
 *
 * /preview is unchanged — direct Google TTS client, no registry, no
 * narration_audio row, no llm_calls.
 */

import express, { Request, Response, Router } from 'express';
import { TextToSpeechClient } from '@google-cloud/text-to-speech';
import { supabase } from '../lib/supabase';
import { ssmlize, stripMarkersAndTags } from '../lib/ssml.js';
import { registerProvider, generateNarration } from '../../scripts/lib/tts/index.js';
import { GoogleTTSProvider } from '../../scripts/lib/tts/providers/google.js';
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { pickPoiPrompt } = require('../prompts/pois') as {
  pickPoiPrompt: (
    narratorSlug: string,
    depth: string,
    poi: Record<string, unknown>,
    sources: Array<{ type: string; text: string }>,
  ) => Array<{ role: 'system' | 'user' | 'assistant'; content: string }>;
};

const router: Router = express.Router();

// Provider registry — idempotent; same registry the precache scripts populate.
registerProvider(new GoogleTTSProvider());

// ── Constants ───────────────────────────────────────────────────────────────
const ANTHROPIC_BASE = 'https://api.anthropic.com/v1';
const STORAGE_BUCKET = 'narration-audio';
const STORAGE_PREFIX = 'pois';
const PROMPT_VERSION = 3; // bumped 2→3 in Migration Batch 1 — narrator-keyed registry
const HAIKU_MODEL = 'claude-haiku-4-5-20251001';
const HAIKU_MAX_TOKENS = 900;
const HAIKU_IN_PER_TOK = 1.0 / 1_000_000;
const HAIKU_OUT_PER_TOK = 5.0 / 1_000_000;

const ALLOWED_NARRATORS = ['narrator_a', 'narrator_b'] as const;
type NarratorSlug = typeof ALLOWED_NARRATORS[number];
const DEFAULT_NARRATOR_SLUG: NarratorSlug = 'narrator_a'; // Default per soul-doctrine bias of the catalog (most narrating-eligible POIs are soul-tier).
const ALLOWED_MODES = ['driving', 'hiking', 'city'] as const;
type TripMode = typeof ALLOWED_MODES[number];
const ALLOWED_DEPTHS = ['standard'] as const;
type Depth = typeof ALLOWED_DEPTHS[number];

// ── Types ───────────────────────────────────────────────────────────────────
interface PoiForPrompt {
  id: string;
  name: string;
  description: string | null;
  category_slug: string | null;
  category_display: string | null;
  tags: string[];
  source_citation: string | null;
  off_route_landmark_hint: string | null;
  significance_score: number | null;
  signature_hook: string | null;
  iconic_local: boolean;
}

interface VoiceConfig {
  voiceId: string;
  speakingRate: number;
  narratorSlug: string;
  voiceSlot: number;
}

// ── Google TTS client (lazy init — only used by /preview now) ───────────────
let ttsClient: TextToSpeechClient | null = null;
function getTTSClient(): TextToSpeechClient {
  if (!ttsClient) ttsClient = new TextToSpeechClient();
  return ttsClient;
}

// ── Voice config lookup (narrator-keyed; random slot pick if both active) ──
// Migration Batch 1: dispatch axis changed from audience_mode to narrator_slug.
// voice_configs may carry 1 or 2 active rows per narrator (slot 1 + slot 2);
// when both are active we pick at random — slot semantics are equivalent at
// the runtime level (curator-controlled variant, not audience-targeted).
async function lookupVoiceConfig(narratorSlug: NarratorSlug): Promise<VoiceConfig> {
  const { data, error } = await supabase
    .from('voice_configs')
    .select('voice_id, narrator_slug, voice_slot, voice_settings')
    .eq('narrator_slug', narratorSlug)
    .eq('is_active', true);
  if (error || !data || data.length === 0) {
    throw new Error(
      `[narration] voice_configs has no active row for narrator '${narratorSlug}' — run pnpm audition --commit to set one`,
    );
  }
  // Random pick across active slots (1 or 2 rows post-Migration-2).
  const picked = data[Math.floor(Math.random() * data.length)];
  const settings = (picked.voice_settings as { speakingRate?: number } | null) ?? {};
  return {
    voiceId: picked.voice_id as string,
    speakingRate: settings.speakingRate ?? 1.0,
    narratorSlug: picked.narrator_slug as string,
    voiceSlot: (picked.voice_slot as number | null) ?? 1,
  };
}

// ── POI fetch (one round-trip, includes everything the registry needs) ──────
async function fetchPoiForNarration(poiId: string): Promise<PoiForPrompt> {
  const { data, error } = await supabase
    .from('pois')
    .select(`
      id, name, description, tags, source_citation,
      off_route_landmark_hint, significance_score,
      signature_hook, iconic_local, category_id,
      poi_categories!inner(slug, display_name)
    `)
    .eq('id', poiId)
    .is('merged_into', null)
    .single();
  if (error || !data) {
    throw new Error(`POI not found or merged: ${poiId}`);
  }
  const cat = (data as { poi_categories?: { slug?: string; display_name?: string } }).poi_categories;
  return {
    id: data.id as string,
    name: data.name as string,
    description: (data.description as string | null) ?? null,
    category_slug: cat?.slug ?? null,
    category_display: cat?.display_name ?? null,
    tags: (data.tags as string[] | null) ?? [],
    source_citation: (data.source_citation as string | null) ?? null,
    off_route_landmark_hint: (data.off_route_landmark_hint as string | null) ?? null,
    significance_score: (data.significance_score as number | null) ?? null,
    signature_hook: (data.signature_hook as string | null) ?? null,
    iconic_local: Boolean(data.iconic_local),
  };
}

// ── Sources derivation for the new registry ─────────────────────────────────
// Migration Batch 1: pickPoiPrompt now takes a structured `sources` array
// (shape: [{type, text}]). The curator workflow will refine source aggregation
// in Batch 2; v1 derives a minimal single-item source from the POI's existing
// description + source_citation. Empty array is the safe fallback when neither
// is set — the templates handle the empty-sources case gracefully (the mapped
// join just produces an empty string).
function buildSourcesForPrompt(poi: PoiForPrompt): Array<{ type: string; text: string }> {
  const sources: Array<{ type: string; text: string }> = [];
  if (poi.description) {
    sources.push({
      type: poi.source_citation ? 'description' : 'description (no citation)',
      text: poi.description,
    });
  }
  if (poi.source_citation && !poi.description) {
    sources.push({ type: 'citation', text: poi.source_citation });
  }
  return sources;
}

// ── Haiku narration generation (plain prose — registry returns messages array) ─
// Migration Batch 1: the JSON parse-retry loop is gone. Templates output
// plain prose (per their OUTPUT directive); we read content[0].text (or the
// concatenated text-type content blocks) directly as the narration string.
async function generateNarrationViaHaiku(
  messages: ReturnType<typeof pickPoiPrompt>,
  pendingId: string,
): Promise<{ narrationText: string; haikuCost: number; userPromptLen: number }> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY not set');

  // Split the system message off the front (Anthropic API takes `system` as
  // a top-level string param, not as a role-tagged messages entry).
  if (messages.length === 0 || messages[0].role !== 'system') {
    throw new Error('pickPoiPrompt must return a messages array with role:system at index 0');
  }
  const systemPrompt = messages[0].content;
  const conversation = messages.slice(1);
  const userPromptLen = conversation.map(m => m.content.length).reduce((a, b) => a + b, 0);

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
      system: systemPrompt,
      messages: conversation,
    }),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`Haiku HTTP ${res.status}: ${body.slice(0, 200)}`);
  }
  const json = (await res.json()) as {
    content?: Array<{ type: string; text?: string }>;
    usage?: { input_tokens?: number; output_tokens?: number };
  };
  const inTok = json.usage?.input_tokens ?? 0;
  const outTok = json.usage?.output_tokens ?? 0;
  const haikuCost = +(inTok * HAIKU_IN_PER_TOK + outTok * HAIKU_OUT_PER_TOK).toFixed(6);

  logCost({
    callType: 'claude',
    provider: 'anthropic',
    modelOrVoice: HAIKU_MODEL,
    inputChars: userPromptLen,
    inputTokens: inTok,
    outputTokens: outTok,
    costUsd: haikuCost,
    relatedId: pendingId,
  }).catch(err => console.error('[narration] logCost(claude) failed:', err));

  const narrationText = (json.content ?? [])
    .filter(b => b.type === 'text')
    .map(b => b.text ?? '')
    .join('')
    .trim();

  if (!narrationText) {
    throw new Error('Haiku returned empty narration text');
  }
  return { narrationText, haikuCost, userPromptLen };
}

// ── Storage upload ──────────────────────────────────────────────────────────
// Migration Batch 1: audience_mode dropped from Storage path. New shape is
// pois/{poi_id}/{narratorSlug}_{voiceSlot}_{depth}.opus, mirroring the new
// voice_configs (narrator_slug, voice_slot) addressability key.
async function uploadAudio(
  poiId: string,
  narratorSlug: string,
  voiceSlot: number,
  depth: string,
  audioBuffer: Buffer,
): Promise<{ audioUrl: string; storagePath: string }> {
  const storagePath = `${STORAGE_PREFIX}/${poiId}/${narratorSlug}_${voiceSlot}_${depth}.opus`;
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
// Migration Batch 1: audience_mode written as NULL. The na_unique constraint
// is UNIQUE NULLS NOT DISTINCT, so NULL values collide-as-equal under the
// onConflict shape — one new-schema row per (poi, narrator, depth, mode).
async function insertNarrationAudioPending(args: {
  poiId: string;
  narratorSlug: string;
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
        audience_mode: null,
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
// Cache key shape (Migration Batch 1): {mode}-{depth}-{narrator_slug}.
// Audience_mode is no longer a dispatch axis; narrator_slug carries the
// per-trip variant identity. Mobile's checkPoiJsonCache should match this
// shape after the Batch 2 mobile refit.
async function updatePoiNarrationCache(
  poiId: string,
  mode: string,
  depth: string,
  narratorSlug: string,
  audioUrl: string,
): Promise<void> {
  const cacheKey = `${mode}-${depth}-${narratorSlug}`;
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
  // and audience_mode tolerated (legacy mobile clients) with a debug log.
  const body = req.body as Record<string, unknown>;
  if (body.voice_id !== undefined) {
    console.debug('[narration] /generate ignoring deprecated voice_id field');
  }
  if (body.audience_mode !== undefined) {
    console.debug('[narration] /generate ignoring deprecated audience_mode field — narrator_slug is the dispatch axis');
  }

  const poi_id = body.poi_id as string | undefined;
  const mode = body.mode as string | undefined;
  const depth = body.depth as string | undefined;
  const narrator_slug_raw = (body.narrator_slug as string | undefined) ?? DEFAULT_NARRATOR_SLUG;

  if (!poi_id || !mode || !depth) {
    return res.status(400).json({ error: 'poi_id, mode, depth are required' });
  }
  if (!ALLOWED_NARRATORS.includes(narrator_slug_raw as NarratorSlug)) {
    return res.status(400).json({ error: `narrator_slug must be one of ${ALLOWED_NARRATORS.join(', ')}` });
  }
  if (!ALLOWED_MODES.includes(mode as TripMode)) {
    return res.status(400).json({ error: `mode must be one of ${ALLOWED_MODES.join(', ')}` });
  }
  if (!ALLOWED_DEPTHS.includes(depth as Depth)) {
    return res.status(400).json({ error: `depth must be one of ${ALLOWED_DEPTHS.join(', ')}` });
  }
  const narratorSlug = narrator_slug_raw as NarratorSlug;
  const tripMode = mode as TripMode;
  const narrationDepth = depth as Depth;

  // 1. Voice config (narrator-keyed; random slot pick across active rows)
  let voice: VoiceConfig;
  try {
    voice = await lookupVoiceConfig(narratorSlug);
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

  // 3. Template selection (registry returns full messages array)
  // Includes derived sources from POI description + citation; Batch 2 will
  // refine source aggregation (curator-curated source lists per POI).
  let messages: ReturnType<typeof pickPoiPrompt>;
  try {
    const poiForPrompt = {
      name: poi.name,
      category_slug: poi.category_slug ?? 'unknown',
      location_description: null, // Reserved for Batch 2 (geocoded address etc.)
      significance_score: poi.significance_score ?? 0,
      signature_hook: poi.signature_hook,
      iconic_local: poi.iconic_local,
    };
    const sources = buildSourcesForPrompt(poi);
    messages = pickPoiPrompt(narratorSlug, narrationDepth, poiForPrompt, sources);
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
      depth: narrationDepth,
      mode: tripMode,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'pending insert failed';
    console.error('[narration] pending insert failed:', err);
    return res.status(500).json({ error: msg });
  }

  try {
    // 5. Haiku narration text (plain prose, no JSON parse)
    const { narrationText, haikuCost } = await generateNarrationViaHaiku(messages, pendingId);

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

    // 8. Storage upload — narrator-keyed path (Migration Batch 1)
    const { audioUrl } = await uploadAudio(
      poi_id,
      voice.narratorSlug,
      voice.voiceSlot,
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
    updatePoiNarrationCache(poi_id, tripMode, narrationDepth, voice.narratorSlug, audioUrl).catch(err =>
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
