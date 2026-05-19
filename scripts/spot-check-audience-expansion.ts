/**
 * scripts/spot-check-audience-expansion.ts
 *
 * Phase H Block H1.5.3 — audience-mode prompt template regen for a SINGLE POI
 * (Vasquez Rocks, source_id editorial:la-mammoth-2026-05-18:01) across the
 * 4 active audience templates after the narrator-collapse (H1.5.1).
 *
 * Active templates (1 voice per audience post-collapse):
 *   family     → narrator_b / Sadachbia
 *   kids       → narrator_a / Sulafat
 *   local      → narrator_a / Iapetus
 *   unfiltered → narrator_b / Schedar
 *
 * Pipeline (same shape as spot-check-3-pois.ts):
 *   Haiku → ssmlize() → Google TTS → Storage upload → narration_audio upsert
 *
 * Storage path: pois/{poi_id}/{narrator_slug}_{audience_mode}_{depth}.opus
 *
 * Cost guardrail: aborts before any API spend if projected cost > $3.
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
import { ssmlize, stripMarkersAndTags } from './lib/tts/ssml.js';
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

// 4 active audience templates after the H1.5.1 narrator-collapse. The narrator
// field is no longer used for template lookup (pickPoiPrompt is audience-keyed
// now) but is preserved here for voice_configs.eq('narrator_slug',...) lookup
// and for the Storage-path filename pattern {narrator}_{audience}_{depth}.opus.
const COMBOS: Array<{ narrator: string; audience: string }> = [
  { narrator: 'narrator_b', audience: 'family'     },
  { narrator: 'narrator_a', audience: 'kids'       },
  { narrator: 'narrator_a', audience: 'local'      },
  { narrator: 'narrator_b', audience: 'unfiltered' },
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

  // Template selector. Signature changed in H1.5.1 (2026-05-19) — flat
  // audience-keyed registry; narrator_slug derivable from template.narratorSlug.
  const { pickPoiPrompt } = require(POI_TEMPLATES_PATH) as {
    pickPoiPrompt: (a: string, d: string) => {
      systemPrompt: string;
      buildUserPrompt: (poi: any) => string;
      narratorSlug: string;
      audienceMode: string;
      depth: string;
    };
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

  // Voice config preload — one row per combo
  const voiceByCombo = new Map<string, VoiceRow>();
  for (const { narrator, audience } of COMBOS) {
    const { data: rows, error: vErr } = await supabase
      .from('voice_configs')
      .select('voice_id, voice_settings')
      .eq('mode', audience)
      .eq('narrator_slug', narrator)
      .eq('is_active', true)
      .limit(1);
    if (vErr) fail(`voice_configs (${narrator}/${audience}): ${vErr.message}`);
    if (!rows || rows.length === 0) fail(`no active voice_configs row for ${narrator}/${audience}`);
    voiceByCombo.set(`${narrator}/${audience}`, rows[0] as VoiceRow);
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
  for (const { narrator, audience } of COMBOS) {
    const v = voiceByCombo.get(`${narrator}/${audience}`)!;
    console.log(`  ${narrator}/${audience}  voice=${v.voice_id}  rate=${v.voice_settings?.speakingRate ?? 1.0}`);
  }
  console.log('');

  registerProvider(new GoogleTTSProvider());
  const ANTHROPIC_API_KEY = process.env['ANTHROPIC_API_KEY']!;

  interface Result {
    narrator: string;
    audience: string;
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

  for (const { narrator, audience } of COMBOS) {
    const label = `${narrator}/${audience}`;
    console.log(`▶ ${label}`);

    const template = pickPoiPrompt(audience, DEPTH);
    const voice = voiceByCombo.get(label)!;

    const userPrompt = template.buildUserPrompt({
      name: poi.name,
      description: poi.description,
      category_display: poi.category_display,
      tags: poi.tags,
      source_citation: poi.source_citation,
      off_route_landmark_hint: poi.off_route_landmark_hint,
    });

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
        system: template.systemPrompt,
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

    // Canonical storage path: pois/{poi_id}/{narrator}_{audience}_{depth}.opus
    const fileSuffix = `${narrator}_${audience}_${DEPTH}`;
    const storagePath = `${STORAGE_PREFIX}/${poi.id}/${fileSuffix}.opus`;
    const { error: upErr } = await supabase.storage
      .from(STORAGE_BUCKET)
      .upload(storagePath, audioBuffer, { contentType: 'audio/ogg; codecs=opus', upsert: true });
    if (upErr) fail(`Storage upload for ${label}: ${upErr.message}`);
    const { data: { publicUrl } } = supabase.storage.from(STORAGE_BUCKET).getPublicUrl(storagePath);

    // audience_mode added 2026-05-19 (H1.6.2) — disambiguates rows that share
    // a narrator_slug across audiences. Unique index na_unique widened to
    // include audience_mode by migration 20260519000002.
    const { error: naErr } = await supabase
      .from('narration_audio')
      .upsert({
        poi_id: poi.id,
        region_id: null,
        narrator_slug: narrator,
        audience_mode: audience,
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
      audience,
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
  console.log('  Audience-expansion spot-check results');
  console.log('═══════════════════════════════════════════════════════════════════');
  console.log('');
  for (let i = 0; i < results.length; i++) {
    const r = results[i]!;
    console.log(`── ${r.narrator} / ${r.audience} ──`);
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
