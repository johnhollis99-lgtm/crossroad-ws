/**
 * scripts/precache-region-narrations.ts
 *
 * Pre-generates region narration audio for every region in the public.regions
 * table, iterating over the active (audience, narrator) pairs from voice_configs.
 *
 * Per addendum §3.6: regions narrate at depth='standard' in trip_mode='driving'
 * (regions are a parallel narration layer to POIs; v1 ships driving-only).
 * Cache shape: Storage path regions/{region_id}/{narrator_slug}.opus,
 * narration_audio row keyed by the new (poi_id, region_id, narrator_slug,
 * depth, mode) unique tuple (poi_id NULL for region rows; XOR CHECK enforced
 * by migration 20260514000011).
 *
 * Run:
 *   cd scripts
 *   npx tsx precache-region-narrations.ts                # dry-run (default)
 *   npx tsx precache-region-narrations.ts --live         # actually generate
 *   npx tsx precache-region-narrations.ts --audience family  # filter (default: family only)
 *   npx tsx precache-region-narrations.ts --regions Sierra\ Nevada,Mono\ Basin  # subset by name
 *
 * Audience filter:
 *   --audience <list>  Comma-separated audience modes to include.
 *                      Default: family (per curator scope for the initial run;
 *                      kids/unfiltered/local generated in a follow-up turn).
 *
 * Cost-logging discipline (per CLAUDE.md "Three audit / display quirks" §3):
 *   Each Claude + TTS call is logged to llm_calls IMMEDIATELY after the
 *   provider returns, BEFORE the downstream Storage upload. This avoids
 *   the prior precache untracked-spend bug pattern where Storage failures
 *   ate cost-log writes.
 *
 * Skip-if-ready:
 *   For each (region_id, narrator_slug, mode='family') tuple, check
 *   narration_audio for an existing status='ready' row at
 *   depth='standard', trip_mode='driving'. If found, skip (no Haiku spend,
 *   no TTS spend, no Storage call).
 *
 * Telegram pings (T4 hooks per docs/decisions/2026-05-15 Telegram setup):
 *   - After dry-run summary: "Region narration precache dry-run ready..."
 *   - After --live completes: "Region narration precache complete..."
 *   - After sampler URLs picked: "Sampler URLs ready for curator review..."
 *   (Sampler ping fires from Step 8 sampler tooling, not from this script
 *    directly; this script fires the first two.)
 */

import { readFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { registerProvider, generateNarration } from './lib/tts/index.js';
import { GoogleTTSProvider } from './lib/tts/providers/google.js';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { notifyTelegram } from './lib/telegram-notify.js';

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const ENV_PATH = resolve(SCRIPT_DIR, '..', '.env');
const REGION_TEMPLATES_PATH = resolve(SCRIPT_DIR, '..', 'server', 'prompts', 'regions', 'index.js');

const require = createRequire(import.meta.url);

// ── Manual dotenv ──────────────────────────────────────────────────────────
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

// ── Constants ──────────────────────────────────────────────────────────────
const TRIP_MODE = 'driving' as const;
const DEPTH = 'standard' as const;
const HAIKU_MODEL = 'claude-haiku-4-5-20251001';
const HAIKU_MAX_TOKENS = 900;
const HAIKU_IN_PER_TOK = 1.00 / 1_000_000;
const HAIKU_OUT_PER_TOK = 5.00 / 1_000_000;
const INTER_CALL_PAUSE_MS = 500;
const STORAGE_BUCKET = 'narration-audio';

// ── Arg parsing ────────────────────────────────────────────────────────────
interface Args {
  live: boolean;
  audiences: string[];
  regionNames: string[] | null;
}

function parseArgs(): Args {
  const argv = process.argv.slice(2);
  const live = argv.includes('--live');
  const audFlag = argv.find(a => a.startsWith('--audience='));
  const audiences = audFlag
    ? audFlag.slice('--audience='.length).split(',').map(s => s.trim()).filter(Boolean)
    : ['family'];
  const regFlag = argv.find(a => a.startsWith('--regions='));
  const regionNames = regFlag
    ? regFlag.slice('--regions='.length).split(',').map(s => s.trim()).filter(Boolean)
    : null;
  return { live, audiences, regionNames };
}

// ── Types ──────────────────────────────────────────────────────────────────
interface RegionRow {
  id: string;
  name: string;
  display_name: string | null;
  description: string;
  region_type: string;
}

interface VoiceConfigRow {
  mode: string;
  narrator_slug: string;
  voice_id: string;
  voice_settings: { speakingRate?: number; pitch?: number; volumeGainDb?: number };
}

interface RegionTemplate {
  systemPrompt: string;
  buildUserPrompt: (region: { name: string; display_name: string | null; description: string }) => string;
  narratorSlug: string;
  audienceMode: string;
}

interface PerCallStats {
  haikuCost: number;
  ttsCost: number;
  audioBytes: number;
  inputTokens: number;
  outputTokens: number;
  narrationChars: number;
  narrationWords: number;
}

// ── Helpers ────────────────────────────────────────────────────────────────
function fail(msg: string): never {
  console.error(`FATAL: ${msg}`);
  process.exit(1);
}

async function sleep(ms: number): Promise<void> {
  return new Promise(r => setTimeout(r, ms));
}

function storagePathFor(regionId: string, narratorSlug: string): string {
  // Per addendum §3.6: regions/{region_id}/{narrator_slug}.opus
  // Audience is collapsed into narrator_slug via voice_configs (one active
  // voice per (mode, narrator_slug) pair). Opus per spec (small, good
  // quality). When ElevenLabs lands as the production TTS, re-render path
  // is a voice_configs swap-and-deactivate, not a migration — cache key
  // shape unchanged.
  return `regions/${regionId}/${narratorSlug}.opus`;
}

// ── Main ───────────────────────────────────────────────────────────────────
async function main(): Promise<void> {
  const args = parseArgs();
  const isDryRun = !args.live;

  console.log('=== Region narration precache ===');
  console.log(`  Mode: ${isDryRun ? 'DRY-RUN (no Claude/TTS, no Storage, no DB writes)' : 'LIVE'}`);
  console.log(`  Audience filter: ${args.audiences.join(', ')}`);
  if (args.regionNames) console.log(`  Region filter: ${args.regionNames.join(', ')}`);
  console.log('');

  // Env preflight
  if (!isDryRun) {
    if (!process.env['ANTHROPIC_API_KEY']) fail('ANTHROPIC_API_KEY not set');
    if (!process.env['GOOGLE_APPLICATION_CREDENTIALS']) fail('GOOGLE_APPLICATION_CREDENTIALS not set');
  }
  if (!process.env['SUPABASE_URL']) fail('SUPABASE_URL not set');
  if (!process.env['SUPABASE_SERVICE_ROLE_KEY']) fail('SUPABASE_SERVICE_ROLE_KEY not set');

  const supabase: SupabaseClient = createClient(
    process.env['SUPABASE_URL']!,
    process.env['SUPABASE_SERVICE_ROLE_KEY']!,
  );

  // 1. Load region prompt templates
  const { TEMPLATES, pickRegionPrompt } = require(REGION_TEMPLATES_PATH) as {
    TEMPLATES: Record<string, Record<string, RegionTemplate>>;
    pickRegionPrompt: (n: string, a: string) => RegionTemplate;
  };
  console.log(`  Loaded ${Object.values(TEMPLATES).flatMap(o => Object.keys(o)).length} region templates`);

  // 2. Load active voice_configs filtered to requested audiences
  const { data: voices, error: vcErr } = await supabase
    .from('voice_configs')
    .select('mode, narrator_slug, voice_id, voice_settings')
    .eq('is_active', true)
    .in('mode', args.audiences);
  if (vcErr) fail(`voice_configs query: ${vcErr.message}`);
  if (!voices || voices.length === 0) fail(`no active voice_configs rows for audiences=${args.audiences.join(',')}`);

  console.log(`  Active voice_configs rows in scope: ${voices.length}`);
  for (const v of voices as VoiceConfigRow[]) {
    const rate = v.voice_settings?.speakingRate ?? 1.0;
    console.log(`    ${v.mode.padEnd(11)} ${v.narrator_slug.padEnd(11)} ${v.voice_id.padEnd(28)} rate=${rate}`);
  }

  // 3. Load regions (filter by name if requested)
  let regionsQuery = supabase
    .from('regions')
    .select('id, name, display_name, description, region_type')
    .order('region_type', { ascending: true })
    .order('name', { ascending: true });
  if (args.regionNames) {
    regionsQuery = regionsQuery.in('name', args.regionNames);
  }
  const { data: regions, error: regErr } = await regionsQuery;
  if (regErr) fail(`regions query: ${regErr.message}`);
  if (!regions || regions.length === 0) fail('no regions matched');

  console.log(`  Regions in scope: ${regions.length}`);
  console.log('');

  // 4. Build the work plan: regions × voices
  interface PlannedItem {
    region: RegionRow;
    voice: VoiceConfigRow;
    storagePath: string;
  }
  const planned: PlannedItem[] = [];
  for (const r of regions as RegionRow[]) {
    for (const v of voices as VoiceConfigRow[]) {
      planned.push({ region: r, voice: v, storagePath: storagePathFor(r.id, v.narrator_slug) });
    }
  }
  console.log(`  Total planned generations: ${planned.length} (= ${regions.length} regions × ${voices.length} voices)`);

  // 5. Skip-if-ready: query existing narration_audio for these tuples
  const { data: existing, error: exErr } = await supabase
    .from('narration_audio')
    .select('region_id, narrator_slug, mode')
    .in('region_id', regions.map((r: RegionRow) => r.id))
    .eq('mode', TRIP_MODE)
    .eq('depth', DEPTH)
    .eq('status', 'ready');
  if (exErr) fail(`narration_audio query: ${exErr.message}`);

  const existingSet = new Set<string>();
  for (const e of existing || []) {
    existingSet.add(`${e.region_id}|${e.narrator_slug}`);
  }
  const toGenerate = planned.filter(
    p => !existingSet.has(`${p.region.id}|${p.voice.narrator_slug}`)
  );
  const skipped = planned.length - toGenerate.length;
  console.log(`  Already cached (skip-if-ready): ${skipped}`);
  console.log(`  To generate: ${toGenerate.length}`);

  // 6. Rough cost estimate (based on average Mono Basin sample: ~$0.021/region across Haiku + TTS)
  const ESTIMATED_PER_GEN = 0.021; // $/generation, conservative average
  const estCost = toGenerate.length * ESTIMATED_PER_GEN;
  const estMinutes = Math.ceil(toGenerate.length * 6 / 60); // ~6s/gen conservative

  console.log('');
  console.log(`  Estimated spend: $${estCost.toFixed(2)} (~$${ESTIMATED_PER_GEN.toFixed(3)}/gen Haiku+TTS)`);
  console.log(`  Estimated runtime: ~${estMinutes} min`);

  if (isDryRun) {
    console.log('');
    console.log('  === DRY-RUN — first 10 planned generations ===');
    for (const p of toGenerate.slice(0, 10)) {
      console.log(`    ${p.region.region_type.padEnd(20)} ${p.region.name.padEnd(28)} ${p.voice.narrator_slug} (${p.voice.voice_id.replace('en-US-Chirp3-HD-', '').replace('en-US-', '')})`);
    }
    if (toGenerate.length > 10) console.log(`    ... and ${toGenerate.length - 10} more`);
    console.log('');
    console.log(`  Run with --live to actually generate. Skip-if-ready will re-check at start.`);

    // T4 Telegram ping: dry-run summary
    notifyTelegram(`Region narration precache dry-run ready. ${toGenerate.length} generations planned, ~$${estCost.toFixed(2)} estimated. Awaiting --live greenlight.`);
    return;
  }

  // 7. LIVE: generate
  // Register the Google TTS provider with the abstraction; generateNarration
  // returns Opus + auto-logs the TTS cost to llm_calls via cost-tracker.
  registerProvider(new GoogleTTSProvider());
  const ANTHROPIC_API_KEY = process.env['ANTHROPIC_API_KEY']!;
  const stats = {
    generated: 0,
    failed: 0,
    skippedRuntime: 0,
    haikuCostTotal: 0,
    ttsCostTotal: 0,
    startedAt: Date.now(),
  };
  const failures: Array<{ region: string; narrator: string; reason: string }> = [];

  console.log('');
  console.log('=== Generation loop ===');

  for (let i = 0; i < toGenerate.length; i++) {
    const item = toGenerate[i]!;
    const label = `[${String(i + 1).padStart(3)}/${toGenerate.length}] ${item.region.name.padEnd(28)} ${item.voice.narrator_slug}`;
    process.stdout.write(`  ${label} `);

    try {
      const template = pickRegionPrompt(item.voice.narrator_slug, item.voice.mode);
      const userPrompt = template.buildUserPrompt(item.region);

      // a) Haiku — log cost immediately on return, before TTS
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
        throw new Error(`Haiku HTTP ${hr.status}: ${errText.slice(0, 200)}`);
      }
      const hj = (await hr.json()) as {
        content?: Array<{ type: string; text?: string }>;
        usage?: { input_tokens?: number; output_tokens?: number };
      };
      const inTok = hj.usage?.input_tokens ?? 0;
      const outTok = hj.usage?.output_tokens ?? 0;
      const haikuCost = +(inTok * HAIKU_IN_PER_TOK + outTok * HAIKU_OUT_PER_TOK).toFixed(6);

      // LOG IMMEDIATELY — before TTS / Storage / anything else
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

      const haikuRaw = (hj.content ?? []).filter(b => b.type === 'text').map(b => b.text ?? '').join('').trim();
      const cleaned = haikuRaw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
      const parsed = JSON.parse(cleaned) as { narration: string; key_themes?: string[] };
      const narrationText = parsed.narration;
      if (!narrationText) throw new Error('Haiku returned empty narration');

      // b) Insert pending narration_audio row
      const { data: pendingRow, error: insErr } = await supabase
        .from('narration_audio')
        .upsert({
          region_id: item.region.id,
          poi_id: null,
          narrator_slug: item.voice.narrator_slug,
          depth: DEPTH,
          mode: TRIP_MODE,
          audio_url: null,
          status: 'pending',
          provider: 'google',
          prompt_version: 1,
          generated_at: new Date().toISOString(),
        }, { onConflict: 'poi_id,region_id,narrator_slug,depth,mode', ignoreDuplicates: false })
        .select('id')
        .single();
      if (insErr || !pendingRow) throw new Error(`narration_audio pending: ${insErr?.message ?? 'no row returned'}`);
      const audioRowId = pendingRow.id;

      // c) TTS — via the abstraction. The abstraction's generateNarration
      // returns Opus and auto-logs the TTS cost to llm_calls IMMEDIATELY
      // on provider return (before this script's Storage upload), so we
      // skip the explicit manual log here to avoid the double-count bug
      // documented in CLAUDE.md "Three audit / display quirks" §3.
      const rate = item.voice.voice_settings?.speakingRate ?? 1.0;
      const ttsOutput = await generateNarration({
        text: narrationText,
        voiceConfigOverride: {
          provider: 'google',
          voiceId: item.voice.voice_id,
          speakingRate: rate,
        },
      });
      if (!ttsOutput) throw new Error('TTS returned null after all retries');
      const audioBuffer = Buffer.isBuffer(ttsOutput.audioBuffer)
        ? ttsOutput.audioBuffer
        : Buffer.from(ttsOutput.audioBuffer);
      const ttsCost = ttsOutput.costUsd;

      // d) Storage upload — Opus per addendum §3.6 spec
      const { error: upErr } = await supabase.storage
        .from(STORAGE_BUCKET)
        .upload(item.storagePath, audioBuffer, { contentType: 'audio/ogg; codecs=opus', upsert: true });
      if (upErr) {
        // Storage upload failed — flip the row to status=failed but DON'T re-throw
        // since we've already logged the spend
        await supabase
          .from('narration_audio')
          .update({ status: 'failed' })
          .eq('id', audioRowId);
        throw new Error(`Storage upload: ${upErr.message}`);
      }

      const { data: { publicUrl } } = supabase.storage.from(STORAGE_BUCKET).getPublicUrl(item.storagePath);

      // e) Flip narration_audio to ready
      const { error: readyErr } = await supabase
        .from('narration_audio')
        .update({
          audio_url: publicUrl,
          status: 'ready',
          character_count: narrationText.length,
          cost_usd: haikuCost + ttsCost,
          narration_text: narrationText,
        })
        .eq('id', audioRowId);
      if (readyErr) throw new Error(`narration_audio ready update: ${readyErr.message}`);

      stats.generated++;
      stats.haikuCostTotal += haikuCost;
      stats.ttsCostTotal += ttsCost;
      console.log(`OK h=$${haikuCost.toFixed(4)} t=$${ttsCost.toFixed(4)} ${narrationText.split(/\s+/).length}w ${(audioBuffer.length / 1024).toFixed(0)}KB`);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      console.log(`FAIL ${msg}`);
      stats.failed++;
      failures.push({ region: item.region.name, narrator: item.voice.narrator_slug, reason: msg });
    }

    if (i < toGenerate.length - 1) await sleep(INTER_CALL_PAUSE_MS);
  }

  // 8. Summary
  const runtimeMs = Date.now() - stats.startedAt;
  const runtimeMin = (runtimeMs / 1000 / 60).toFixed(1);
  const totalSpend = stats.haikuCostTotal + stats.ttsCostTotal;

  console.log('');
  console.log('=== SUMMARY ===');
  console.log(`  Generated: ${stats.generated}`);
  console.log(`  Failed:    ${stats.failed}`);
  console.log(`  Runtime:   ${runtimeMin} min (${runtimeMs}ms)`);
  console.log(`  Haiku spend: $${stats.haikuCostTotal.toFixed(4)}`);
  console.log(`  TTS spend:   $${stats.ttsCostTotal.toFixed(4)}`);
  console.log(`  TOTAL:       $${totalSpend.toFixed(4)}`);
  if (failures.length > 0) {
    console.log('');
    console.log('  === FAILURES ===');
    for (const f of failures) console.log(`    ${f.region.padEnd(28)} ${f.narrator.padEnd(11)} ${f.reason}`);
  }

  // T4 Telegram ping: --live complete
  notifyTelegram(
    `Region narration precache complete. ${stats.generated} generated, ${stats.failed} failed. ` +
    `Total spend: $${totalSpend.toFixed(2)}. Runtime: ${runtimeMin}min. Sampler URLs incoming.`,
  );
}

main().catch((err: unknown) => {
  const msg = err instanceof Error ? err.message : String(err);
  console.error(`FATAL: ${msg}`);
  process.exit(1);
});
