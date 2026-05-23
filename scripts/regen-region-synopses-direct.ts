/**
 * scripts/regen-region-synopses-direct.ts
 *
 * One-off: regenerate audio for SFV + LA Basin region narrations from the
 * description column verbatim. BYPASSES the standard region prompt
 * template + Haiku rewrite — descriptions are hand-crafted finished
 * narrations, not seed text. The whole point of this script is to feed
 * raw description text into Google TTS unchanged, then overwrite the
 * existing Storage objects + narration_audio rows.
 *
 * Voice plan (mirrors the existing v1 narrator-collapse cohort):
 *   narrator_b / family / Sadachbia 1.0×   — active production family voice
 *   narrator_a / family / Iapetus  1.0×   — historical narrator_a/family voice
 *                                           (now narrator_a/local). Used here
 *                                           so the regen overwrites with the
 *                                           same voice identity as the v1
 *                                           narrator_a.opus files. The
 *                                           narrator_a/family combo is
 *                                           orphaned from production lookup
 *                                           post-H1.5 collapse; the audio is
 *                                           generated so the curator can
 *                                           A/B-listen, not because runtime
 *                                           plays it.
 *
 * SSML — explicitly NOT applied. Existing 108 region narrations (54 × narrator
 * _a/b family) shipped as plain text per the existing precache pipeline.
 * Applying ssmlize() here would diverge the two test regions from the 52
 * siblings in catalog v1. Year-reading behavior tracks Google Chirp 3 HD's
 * native handling for both narrators. If curator wants SSML on narrator_b,
 * flip APPLY_SSML_NARRATOR_B = true and re-run.
 *
 * Run:
 *   cd scripts
 *   npx tsx regen-region-synopses-direct.ts                 # dry-run (default)
 *   npx tsx regen-region-synopses-direct.ts --live          # actually generate
 *
 * Idempotent: each run upserts Storage + narration_audio for the same
 * (region_id, narrator_slug, audience='family', depth='standard',
 * mode='driving') tuple. Safe to re-run after curator listen.
 */

import { readFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { registerProvider, generateNarration } from './lib/tts/index.js';
import { GoogleTTSProvider } from './lib/tts/providers/google.js';
import { createClient } from '@supabase/supabase-js';

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const ENV_PATH = resolve(SCRIPT_DIR, '..', '.env');

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

// ── Targets ───────────────────────────────────────────────────────────────
// Migration Batch 2 (Track C, 2026-05-22): AUDIENCE constant retired —
// narration_audio rows now write audience_mode: null and the narrator_slug
// (already present per VOICES entries) carries the disambiguation.
const STORAGE_BUCKET = 'narration-audio';
const TRIP_MODE = 'driving' as const;
const DEPTH = 'standard' as const;

interface VoicePick {
  narrator_slug: 'narrator_a' | 'narrator_b';
  voice_id: string;
  speaking_rate: number;
}

const VOICES: VoicePick[] = [
  { narrator_slug: 'narrator_a', voice_id: 'en-US-Chirp3-HD-Iapetus',   speaking_rate: 1.0 },
  { narrator_slug: 'narrator_b', voice_id: 'en-US-Chirp3-HD-Sadachbia', speaking_rate: 1.0 },
];

const REGION_IDS = [
  { id: '733e4582-bb39-48d1-8dc3-f6911d360bf1', label: 'San Fernando Valley' },
  { id: 'f63e48f5-2cef-4112-8639-a54b65fffd20', label: 'Los Angeles Basin'   },
];

// ── Main ──────────────────────────────────────────────────────────────────
async function main() {
  const argv = process.argv.slice(2);
  const live = argv.includes('--live');

  const SUPABASE_URL = process.env['SUPABASE_URL'];
  const SUPABASE_SERVICE_ROLE_KEY = process.env['SUPABASE_SERVICE_ROLE_KEY'];
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env');
  }
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  });

  registerProvider(new GoogleTTSProvider());

  console.log(`=== Region synopses direct-text-to-TTS regen ===`);
  console.log(`Mode: ${live ? 'LIVE' : 'dry-run'}`);
  console.log('');

  // Fetch the two region rows' descriptions.
  const { data: regions, error: regErr } = await supabase
    .from('regions')
    .select('id, name, description')
    .in('id', REGION_IDS.map(r => r.id));
  if (regErr) throw new Error(`regions fetch: ${regErr.message}`);
  if (!regions || regions.length !== REGION_IDS.length) {
    throw new Error(`expected ${REGION_IDS.length} regions, got ${regions?.length ?? 0}`);
  }

  // Plan: cross-product (region × voice) = 4 generations total.
  const plan: Array<{
    region_id:   string;
    region_name: string;
    description: string;
    voice:       VoicePick;
    storagePath: string;
  }> = [];
  for (const r of regions) {
    const text = (r.description ?? '').trim();
    if (!text) throw new Error(`region ${r.id} (${r.name}) has empty description`);
    for (const v of VOICES) {
      plan.push({
        region_id:   r.id,
        region_name: r.name,
        description: text,
        voice:       v,
        storagePath: `regions/${r.id}/${v.narrator_slug}.opus`,
      });
    }
  }

  console.log(`Plan: ${plan.length} generations`);
  for (const p of plan) {
    const words = p.description.split(/\s+/).length;
    console.log(`  ${p.region_name.padEnd(22)} ${p.voice.narrator_slug.padEnd(11)} ${p.voice.voice_id.padEnd(32)} ${words}w → ${p.storagePath}`);
  }
  console.log('');

  if (!live) {
    console.log('Dry-run. Pass --live to actually generate.');
    return;
  }

  // LIVE: TTS + upload + DB upsert
  const stats = { ok: 0, fail: 0, totalCost: 0, totalBytes: 0, startedAt: Date.now() };
  const failures: Array<{ region: string; narrator: string; reason: string }> = [];

  for (let i = 0; i < plan.length; i++) {
    const p = plan[i]!;
    const label = `[${i + 1}/${plan.length}] ${p.region_name.padEnd(22)} ${p.voice.narrator_slug}`;
    process.stdout.write(`  ${label} `);

    try {
      // 1. Insert pending narration_audio row first so a failure leaves
      //    a row the sweeper can clean up. Migration Batch 2 (Track C,
      //    2026-05-22): audience_mode written as NULL — narrator_slug
      //    fully disambiguates rows post-collapse. The column stays in
      //    the schema (defer-drop with the audience-mode cleanup in a
      //    future batch); the na_unique constraint's NULLS NOT DISTINCT
      //    semantics treat NULL as a stable value.
      const { data: pendingRow, error: insErr } = await supabase
        .from('narration_audio')
        .upsert({
          region_id:     p.region_id,
          poi_id:        null,
          narrator_slug: p.voice.narrator_slug,
          audience_mode: null,
          depth:         DEPTH,
          mode:          TRIP_MODE,
          audio_url:     null,
          status:        'pending',
          provider:      'google',
          prompt_version: 1,
          generated_at:  new Date().toISOString(),
        }, { onConflict: 'poi_id,region_id,narrator_slug,audience_mode,depth,mode', ignoreDuplicates: false })
        .select('id')
        .single();
      if (insErr || !pendingRow) throw new Error(`narration_audio pending: ${insErr?.message ?? 'no row'}`);
      const audioRowId = pendingRow.id;

      // 2. TTS the description text verbatim. The TTS abstraction's
      //    generateNarration auto-logs the cost to llm_calls on return
      //    (before Storage upload, before DB ready-update).
      const ttsOutput = await generateNarration({
        text: p.description,
        voiceConfigOverride: {
          provider:     'google',
          voiceId:      p.voice.voice_id,
          speakingRate: p.voice.speaking_rate,
        },
      });
      if (!ttsOutput) throw new Error('TTS returned null after all retries');
      const audioBuffer = Buffer.isBuffer(ttsOutput.audioBuffer)
        ? ttsOutput.audioBuffer
        : Buffer.from(ttsOutput.audioBuffer);

      // 3. Storage upload — upsert overwrites existing v1 file.
      const { error: upErr } = await supabase.storage
        .from(STORAGE_BUCKET)
        .upload(p.storagePath, audioBuffer, {
          contentType: 'audio/ogg; codecs=opus',
          upsert: true,
        });
      if (upErr) {
        await supabase.from('narration_audio').update({ status: 'failed' }).eq('id', audioRowId);
        throw new Error(`Storage upload: ${upErr.message}`);
      }

      const { data: { publicUrl } } = supabase.storage.from(STORAGE_BUCKET).getPublicUrl(p.storagePath);

      // 4. Flip narration_audio to ready.
      const { error: readyErr } = await supabase
        .from('narration_audio')
        .update({
          audio_url:       publicUrl,
          status:          'ready',
          character_count: p.description.length,
          cost_usd:        ttsOutput.costUsd,
          narration_text:  p.description,
        })
        .eq('id', audioRowId);
      if (readyErr) throw new Error(`narration_audio ready: ${readyErr.message}`);

      stats.ok++;
      stats.totalCost += ttsOutput.costUsd;
      stats.totalBytes += audioBuffer.length;
      console.log(`OK $${ttsOutput.costUsd.toFixed(4)} ${(audioBuffer.length / 1024).toFixed(0)}KB`);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      console.log(`FAIL ${msg}`);
      stats.fail++;
      failures.push({ region: p.region_name, narrator: p.voice.narrator_slug, reason: msg });
    }
  }

  const runtimeMin = ((Date.now() - stats.startedAt) / 1000 / 60).toFixed(1);
  console.log('');
  console.log('=== SUMMARY ===');
  console.log(`  Generated: ${stats.ok}/${plan.length}`);
  console.log(`  Failed:    ${stats.fail}`);
  console.log(`  Bytes:     ${(stats.totalBytes / 1024).toFixed(0)}KB total`);
  console.log(`  Spend:     $${stats.totalCost.toFixed(4)}`);
  console.log(`  Runtime:   ${runtimeMin} min`);
  if (failures.length > 0) {
    console.log('');
    console.log('  === FAILURES ===');
    for (const f of failures) console.log(`    ${f.region.padEnd(22)} ${f.narrator.padEnd(11)} ${f.reason}`);
  }
}

main().catch((err: unknown) => {
  const msg = err instanceof Error ? err.message : String(err);
  console.error(`FATAL: ${msg}`);
  process.exit(1);
});
