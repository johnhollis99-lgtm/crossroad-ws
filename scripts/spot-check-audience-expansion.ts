/**
 * scripts/spot-check-audience-expansion.ts
 *
 * Migration Batch 2 (Track C, 2026-05-22): repurposed from the prior
 * audience-mode expansion (4 audiences × narrator-collapse) to the new
 * NARRATOR-mode expansion (2 narrators × voice-slot 1). The 4-audience
 * comparison is obsolete post-Track-C — audience-mode addressability is
 * collapsed into voice_configs.narrator_slug per addendum §5.
 *
 * The script still spot-checks a SINGLE POI (Vasquez Rocks,
 * source_id editorial:la-mammoth-2026-05-18:01) but now across the 2
 * narrator templates instead of 4 audiences — same POI, side-by-side
 * tonal comparison for narrator_a (Window Seat) vs narrator_b (Shotgun).
 *
 * Active combos:
 *   narrator_a / voice_slot=1   (Window Seat — reverent / contemplative)
 *   narrator_b / voice_slot=1   (Shotgun — conversational / Tier-2 SSML)
 *
 * Pipeline (same shape as spot-check-3-pois.ts):
 *   Haiku → ssmlize() → Google TTS → Storage upload → narration_audio upsert
 *
 * Storage path: pois/{poi_id}/{narrator_slug}_v{voice_slot}_{depth}.opus
 *
 * Cost guardrail: aborts before any API spend if projected cost > $3.
 *
 * File name retained for git-history continuity; consider renaming to
 * `spot-check-narrator-expansion.ts` in a follow-up commit if the
 * disconnect surfaces in future code review.
 *
 * Run (from project root):
 *   npx tsx scripts/spot-check-audience-expansion.ts
 */

import { readFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { registerProvider, generateNarration } from './lib/tts/index.js';
import { GoogleTTSProvider } from './lib/tts/providers/google.js';
import { ssmlize, stripMarkersAndTags } from '../server/lib/ssml.js';
import { createClient, SupabaseClient } from '@supabase/supabase-js';

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const ENV_PATH = resolve(SCRIPT_DIR, '..', '.env');
const POI_TEMPLATES_PATH = resolve(SCRIPT_DIR, '..', 'server', 'prompts', 'pois', 'index.js');

const require = createRequire(import.meta.url);

// ── dotenv ─────────────────────────────────────────────────────────────────
function loadEnv(): void {
  if (!existsSync(ENV_PATH)) return;
  const raw = readFileSync(ENV_PATH, 'utf-8');
  for (const line of raw.split('\n')) {
    const t = line.trim();
    if (!t || t.startsWith('#')) continue;
    const eq = t.indexOf('=');
    if (eq === -1) continue;
    const k = t.slice(0, eq).trim();
    let v = t.slice(eq + 1).trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
      v = v.slice(1, -1);
    }
    if (k && !(k in process.env)) process.env[k] = v;
  }
}
loadEnv();

// ── Config ─────────────────────────────────────────────────────────────────
const TARGET_SOURCE_ID = 'editorial:la-mammoth-2026-05-18:01';
const DEPTH = 'standard';
const TRIP_MODE = 'driving';
const STORAGE_BUCKET = 'narration-audio';
const STORAGE_PREFIX = 'pois';
const HAIKU_MODEL = 'claude-haiku-4-5-20251001';
const HAIKU_MAX_TOKENS = 900;
const HAIKU_IN_PER_TOK = 1.0 / 1_000_000;
const HAIKU_OUT_PER_TOK = 5.0 / 1_000_000;
const COST_CEILING_USD = 3.00;
const EST_COST_PER_NARRATION = 0.022;

// Migration Batch 2 (Track C, 2026-05-22): 2 narrator combos at voice
// slot 1. The audience-mode axis is gone; voice_slot is pinned to 1 for
// determinism (matches the precache scripts' FILE_SUFFIX convention).
const VOICE_SLOT = 1;
const COMBOS: Array<{ narrator: string }> = [
  { narrator: 'narrator_a' },
  { narrator: 'narrator_b' },
];

interface PoiRow {
  id: string;
  source_id: string;
  name: string;
  description: string | null;
  category_id: string | null;
  category_slug: string | null;
  category_display: string | null;
  tags: string[];
  source_citation: string | null;
  off_route_landmark_hint: string | null;
}

interface VoiceRow {
  voice_id: string;
  voice_settings: { speakingRate?: number; pitch?: number };
}

function fail(msg: string): never {
  console.error(`FATAL: ${msg}`);
  process.exit(1);
}

async function main(): Promise<void> {
  console.log('=== Spot-check — Vasquez Rocks across 4 active audience templates (post-H1.5.1) ===');

  if (!process.env['ANTHROPIC_API_KEY']) fail('ANTHROPIC_API_KEY not set');
  if (!process.env['GOOGLE_APPLICATION_CREDENTIALS']) fail('GOOGLE_APPLICATION_CREDENTIALS not set');
  if (!process.env['SUPABASE_URL']) fail('SUPABASE_URL not set');
  if (!process.env['SUPABASE_SERVICE_ROLE_KEY']) fail('SUPABASE_SERVICE_ROLE_KEY not set');

  const supabase: SupabaseClient = createClient(
    process.env['SUPABASE_URL']!,
    process.env['SUPABASE_SERVICE_ROLE_KEY']!,
    { auth: { persistSession: false } },
  );

  // Template selector — Batch 1 narrator-keyed registry. Track C drops
  // the audience-mode arg; signature is (narratorSlug, depth, poi, sources)
  // returning an Anthropic Messages array.
  const { pickPoiPrompt } = require(POI_TEMPLATES_PATH) as {
    pickPoiPrompt: (
      narratorSlug: string,
      depth: string,
      poi: any,
      sources: Array<{ type: string; text: string }>,
    ) => Array<{ role: 'system' | 'user'; content: string }>;
  };

  // POI fetch
  const { data: rawRows, error: pErr } = await supabase
    .from('pois')
    .select(`
      id,
      source_id,
      name,
      description,
      tags,
      source_citation,
      category_id,
      off_route_landmark_hint
    `)
    .eq('source_id', TARGET_SOURCE_ID)
    .is('merged_into', null)
    .limit(1);
  if (pErr) fail(`pois query: ${pErr.message}`);
  if (!rawRows || rawRows.length !== 1) fail(`expected 1 POI, got ${rawRows?.length ?? 0}`);
  const r = rawRows[0] as any;

  // Category enrichment
  let category_slug: string | null = null;
  let category_display: string | null = null;
  if (r.category_id) {
    const { data: cat, error: cErr } = await supabase
      .from('poi_categories')
      .select('slug, display_name')
      .eq('id', r.category_id)
      .single();
    if (cErr) fail(`poi_categories query: ${cErr.message}`);
    category_slug = cat?.slug ?? null;
    category_display = cat?.display_name ?? null;
  }

  const poi: PoiRow = {
    id: r.id,
    source_id: r.source_id,
    name: r.name,
    description: r.description,
    category_id: r.category_id,
    category_slug,
    category_display,
    tags: r.tags ?? [],
    source_citation: r.source_citation,
    off_route_landmark_hint: r.off_route_landmark_hint ?? null,
  };

  // Voice config preload — one row per narrator (Track C: narrator_slug
  // is the canonical key; voice_configs.mode column dropped by Track D).
  const voiceByCombo = new Map<string, VoiceRow>();
  for (const { narrator } of COMBOS) {
    const { data: rows, error: vErr } = await supabase
      .from('voice_configs')
      .select('voice_id, voice_settings')
      .eq('narrator_slug', narrator)
      .eq('is_active', true)
      .limit(1);
    if (vErr) fail(`voice_configs (${narrator}): ${vErr.message}`);
    if (!rows || rows.length === 0) fail(`no active voice_configs row for ${narrator}`);
    voiceByCombo.set(narrator, rows[0] as VoiceRow);
  }

  // Cost projection + guardrail
  const projectedCost = COMBOS.length * EST_COST_PER_NARRATION;
  console.log(`Projected spend: $${projectedCost.toFixed(4)} (~$${EST_COST_PER_NARRATION}/combo × ${COMBOS.length}). Ceiling: $${COST_CEILING_USD.toFixed(2)}`);
  if (projectedCost > COST_CEILING_USD) {
    fail(`projected cost $${projectedCost.toFixed(2)} exceeds ceiling $${COST_CEILING_USD.toFixed(2)} — aborting before any API spend`);
  }
  console.log('');
  console.log(`POI: ${poi.name}  (id=${poi.id}, source_id=${poi.source_id})`);
  console.log(`  hint=${poi.off_route_landmark_hint ? 'yes' : 'no'}`);
  console.log('');
  console.log('Combos:');
  for (const { narrator } of COMBOS) {
    const v = voiceByCombo.get(narrator)!;
    console.log(`  ${narrator}  voice=${v.voice_id}  rate=${v.voice_settings?.speakingRate ?? 1.0}`);
  }
  console.log('');

  registerProvider(new GoogleTTSProvider());
  const ANTHROPIC_API_KEY = process.env['ANTHROPIC_API_KEY']!;

  interface Result {
    narrator: string;
    voiceId: string;
    url: string;
    narration: string;
    durationMs: number;
    haikuCost: number;
    ttsCost: number;
    usedSsml: boolean;
  }
  const results: Result[] = [];
  let totalHaikuCost = 0;
  let totalTtsCost = 0;

  // Track C: synthesize sources once — same POI across both narrators.
  const sources: Array<{ type: string; text: string }> = [];
  if (poi.description) sources.push({ type: 'description', text: poi.description });
  if (poi.source_citation) sources.push({ type: 'citation', text: poi.source_citation });
  if (poi.off_route_landmark_hint) sources.push({ type: 'landmark_hint', text: poi.off_route_landmark_hint });
  if (poi.tags?.length) sources.push({ type: 'tags', text: poi.tags.join(', ') });

  for (const { narrator } of COMBOS) {
    const label = narrator;
    console.log(`▶ ${label}`);

    const messages = pickPoiPrompt(narrator, DEPTH, {
      name: poi.name,
      category_slug: poi.category_slug,
      category_display: poi.category_display,
      significance_score: null,
      location_description: null,
      signature_hook: null,
      iconic_local: false,
    }, sources);
    const systemPrompt = messages.find(m => m.role === 'system')?.content ?? '';
    const userPrompt = messages.find(m => m.role === 'user')?.content ?? '';
    const voice = voiceByCombo.get(narrator)!;

    // Haiku call (single attempt — no parse-retry, this is a spot check)
    const hr = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: HAIKU_MODEL,
        max_tokens: HAIKU_MAX_TOKENS,
        system: systemPrompt,
        messages: [{ role: 'user', content: userPrompt }],
      }),
    });
    if (!hr.ok) {
      const errText = await hr.text().catch(() => '');
      fail(`Haiku HTTP ${hr.status} for ${label}: ${errText.slice(0, 200)}`);
    }
    const hj = (await hr.json()) as {
      content?: Array<{ type: string; text?: string }>;
      usage?: { input_tokens?: number; output_tokens?: number };
    };
    const inTok = hj.usage?.input_tokens ?? 0;
    const outTok = hj.usage?.output_tokens ?? 0;
    const haikuCost = +(inTok * HAIKU_IN_PER_TOK + outTok * HAIKU_OUT_PER_TOK).toFixed(6);
    totalHaikuCost += haikuCost;

    await supabase.from('llm_calls').insert({
      call_type: 'claude',
      provider: 'anthropic',
      model_or_voice: HAIKU_MODEL,
      input_chars: userPrompt.length,
      input_tokens: inTok,
      output_tokens: outTok,
      cost_usd: haikuCost,
      related_id: null,
    });

    const raw = (hj.content ?? [])
      .filter(b => b.type === 'text')
      .map(b => b.text ?? '')
      .join('')
      .trim();
    const cleanedJson = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
    let parsed: { narration: string; key_themes?: string[] };
    try {
      parsed = JSON.parse(cleanedJson);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      fail(`Haiku JSON parse failed for ${label}: ${msg}\n  raw: ${raw.slice(0, 300)}`);
    }
    if (!parsed.narration) fail(`Haiku returned empty narration for ${label}`);
    const narrationText = parsed.narration;

    // SSML + TTS with plain-text fallback
    const { ssml } = ssmlize(narrationText);
    const speakingRate = voice.voice_settings?.speakingRate ?? 1.0;
    let ttsOutput;
    let usedSsml = true;
    try {
      ttsOutput = await generateNarration({
        text: ssml,
        mode: TRIP_MODE,
        depth: DEPTH,
        voiceConfigOverride: {
          provider: 'google',
          voiceId: voice.voice_id,
          speakingRate,
        },
      });
    } catch {
      ttsOutput = null;
    }
    if (!ttsOutput) {
      console.log('  (SSML failed — falling back to plain text)');
      usedSsml = false;
      const plain = stripMarkersAndTags(narrationText);
      ttsOutput = await generateNarration({
        text: plain,
        mode: TRIP_MODE,
        depth: DEPTH,
        voiceConfigOverride: {
          provider: 'google',
          voiceId: voice.voice_id,
          speakingRate,
        },
      });
      if (!ttsOutput) fail(`TTS failed (both SSML and plain) for ${label}`);
    }
    const audioBuffer = Buffer.isBuffer(ttsOutput.audioBuffer)
      ? ttsOutput.audioBuffer
      : Buffer.from(ttsOutput.audioBuffer);
    const ttsCost = ttsOutput.costUsd;
    totalTtsCost += ttsCost;

    // Canonical storage path (Track C): pois/{poi_id}/{narrator}_v{slot}_{depth}.opus
    const fileSuffix = `${narrator}_v${VOICE_SLOT}_${DEPTH}`;
    const storagePath = `${STORAGE_PREFIX}/${poi.id}/${fileSuffix}.opus`;
    const { error: upErr } = await supabase.storage
      .from(STORAGE_BUCKET)
      .upload(storagePath, audioBuffer, { contentType: 'audio/ogg; codecs=opus', upsert: true });
    if (upErr) fail(`Storage upload for ${label}: ${upErr.message}`);
    const { data: { publicUrl } } = supabase.storage.from(STORAGE_BUCKET).getPublicUrl(storagePath);

    // Migration Batch 2 (Track C, 2026-05-22): audience_mode written as
    // NULL — narrator_slug fully disambiguates rows post-collapse. The
    // column stays in the schema (defer-drop with the audience-mode
    // cleanup); the na_unique constraint's NULLS NOT DISTINCT semantics
    // treat NULL as a stable value.
    const { error: naErr } = await supabase
      .from('narration_audio')
      .upsert({
        poi_id: poi.id,
        region_id: null,
        narrator_slug: narrator,
        audience_mode: null,
        depth: DEPTH,
        mode: TRIP_MODE,
        audio_url: publicUrl,
        status: 'ready',
        provider: 'google',
        character_count: narrationText.length,
        duration_ms: ttsOutput.durationMs,
        cost_usd: +(haikuCost + ttsCost).toFixed(6),
        prompt_version: 1,
        narration_text: narrationText,
      }, { onConflict: 'poi_id,region_id,narrator_slug,audience_mode,depth,mode' });
    if (naErr) fail(`narration_audio upsert for ${label}: ${naErr.message}`);

    results.push({
      narrator,
      voiceId: voice.voice_id,
      url: publicUrl,
      narration: narrationText,
      durationMs: ttsOutput.durationMs,
      haikuCost,
      ttsCost,
      usedSsml,
    });

    console.log(`  ✓ ${publicUrl}`);
    console.log(`    ${(ttsOutput.durationMs / 1000).toFixed(1)}s · $${(haikuCost + ttsCost).toFixed(4)} (claude $${haikuCost.toFixed(4)} + tts $${ttsCost.toFixed(4)}) · ${usedSsml ? 'ssml' : 'plain'}`);
    console.log('');
  }

  // Final report
  console.log('═══════════════════════════════════════════════════════════════════');
  console.log('  Narrator-expansion spot-check results (Track C)');
  console.log('═══════════════════════════════════════════════════════════════════');
  console.log('');
  for (let i = 0; i < results.length; i++) {
    const r = results[i]!;
    console.log(`── ${r.narrator} ──`);
    console.log(`  voice:     ${r.voiceId}`);
    console.log(`  audio_url: ${r.url}`);
    console.log(`  duration:  ${(r.durationMs / 1000).toFixed(1)}s`);
    console.log(`  cost:      $${(r.haikuCost + r.ttsCost).toFixed(4)} (claude $${r.haikuCost.toFixed(4)} + tts $${r.ttsCost.toFixed(4)})`);
    console.log(`  ssml:      ${r.usedSsml}`);
    console.log(`  text:      ${r.narration}`);
    console.log('');
  }
  const totalCost = totalHaikuCost + totalTtsCost;
  console.log(`Total cost: $${totalCost.toFixed(4)} (claude $${totalHaikuCost.toFixed(4)} + tts $${totalTtsCost.toFixed(4)})`);
}

main().catch((err: unknown) => {
  const msg = err instanceof Error ? err.message : String(err);
  console.error(`FATAL: ${msg}`);
  process.exit(1);
});
