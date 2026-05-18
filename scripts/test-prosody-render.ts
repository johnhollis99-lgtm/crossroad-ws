/**
 * scripts/test-prosody-render.ts
 *
 * Tier 2 SSML pipeline test renders. Generates fresh narrator_b × Family
 * narrations for Sierra Nevada + Mono Basin with:
 *   - speakingRate 1.0 (no override; voice_configs default respected)
 *   - Modified narrator_b_family.js template emitting {{PAUSE_500}} /
 *     {{PAUSE_250}} marker tokens (E — same punctuation discipline +
 *     marker rules + auto-wrapped numbers)
 *   - scripts/lib/tts/ssml.ts post-processor converts markers + digits
 *     to <break/> + <say-as interpret-as="cardinal"> SSML; wraps in
 *     <speak> doc; XML-escapes the body
 *   - SSML auto-detected by scripts/lib/tts/providers/google.ts via
 *     leading <speak> token
 *
 * Side-channel ONLY (curator hard rule: do not rewrite existing 108
 * production narrations):
 *   - Storage path: regions-prosody-test/{region_id}/narrator_b_ssml_rate1.0.opus
 *   - NO narration_audio row writes
 *   - NO voice_configs mutation
 *
 * Robustness:
 *   - On SSML synthesis failure, falls back to stripMarkersAndTags()
 *     plain-text and retries
 *   - Failure marker logged to llm_calls with model_or_voice suffix
 *     "__SSML_PARSE_FAILED" + cost_usd=0
 *
 * Cost-logging discipline (per CLAUDE.md "Three audit / display quirks" §3):
 *   - Claude logged to llm_calls IMMEDIATELY on return, BEFORE TTS
 *   - TTS auto-logged by the abstraction (scripts/lib/tts/cost-tracker.ts)
 *
 * Run (from project root):
 *   npx tsx scripts/test-prosody-render.ts
 *
 * Decision doc: docs/decisions/2026-05-15-narrator-b-prosody.md
 */

import { readFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { registerProvider, generateNarration } from './lib/tts/index.js';
import { GoogleTTSProvider } from './lib/tts/providers/google.js';
import { ssmlize, stripMarkersAndTags, tallyMarkers } from './lib/tts/ssml.js';
import { createClient, SupabaseClient } from '@supabase/supabase-js';

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const ENV_PATH = resolve(SCRIPT_DIR, '..', '.env');
const REGION_TEMPLATES_PATH = resolve(SCRIPT_DIR, '..', 'server', 'prompts', 'regions', 'index.js');

const require = createRequire(import.meta.url);

// ── Manual dotenv (matches precache-region-narrations.ts pattern) ──────────
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

// ── Test config ────────────────────────────────────────────────────────────
const TEST_REGION_NAMES = ['Sierra Nevada', 'Mono Basin'] as const;
const NARRATOR_SLUG = 'narrator_b' as const;
const AUDIENCE_MODE = 'family' as const;
const TRIP_MODE = 'driving' as const;
const DEPTH = 'standard' as const;
const HAIKU_MODEL = 'claude-haiku-4-5-20251001';
const HAIKU_MAX_TOKENS = 900;
const HAIKU_IN_PER_TOK = 1.00 / 1_000_000;
const HAIKU_OUT_PER_TOK = 5.00 / 1_000_000;
const TEST_BUCKET_PREFIX = 'regions-prosody-test';
const STORAGE_BUCKET = 'narration-audio';
const TEST_FILE_SUFFIX = 'narrator_b_ssml_rate1.0';
const INTER_CALL_PAUSE_MS = 500;

// ── Types ──────────────────────────────────────────────────────────────────
interface RegionRow {
  id: string;
  name: string;
  display_name: string | null;
  description: string;
  region_type: string;
}

interface VoiceRow {
  voice_id: string;
  voice_settings: { speakingRate?: number; pitch?: number };
}

interface RegionTemplate {
  systemPrompt: string;
  buildUserPrompt: (region: { name: string; display_name: string | null; description: string }) => string;
}

interface LeverStats {
  emDashes: number;
  commas: number;
  periods: number;
  wordCount: number;
  charCount: number;
  numericTokens: string[];
  namedEpochs: string[];
}

// ── Helpers ────────────────────────────────────────────────────────────────
function fail(msg: string): never {
  console.error(`FATAL: ${msg}`);
  process.exit(1);
}

async function sleep(ms: number): Promise<void> {
  return new Promise(r => setTimeout(r, ms));
}

function analyzeLevers(text: string): LeverStats {
  const emDashes = (text.match(/—/g) ?? []).length;
  const commas = (text.match(/,/g) ?? []).length;
  const periods = (text.match(/\./g) ?? []).length;
  const wordCount = text.trim().split(/\s+/).length;
  const charCount = text.length;

  const numericPatterns = [
    /\d[\d,]*\.?\d*\s*million\s*years?/gi,
    /\d[\d,]*\.?\d*\s*(?:Myr|Ma)\b/gi,
    /\d[\d,]*\.?\d*\s*(?:feet|ft)\b/gi,
    /\d[\d,]*\.?\d*\s*(?:miles?|mi)\b/gi,
    /\d[\d,]*\.?\d*\s*(?:square\s*miles?|sq\s*mi)\b/gi,
    /\d[\d,]*\.?\d*\s*(?:meters?|m)\s+(?:tall|high|deep|wide|long)/gi,
    /\d[\d,]*\.?\d*\s*(?:years?\s*ago)/gi,
    /\d[\d,]*\.?\d*\s*(?:years?\s*old)/gi,
    /\d[\d,]*\s*(?:people|residents|inhabitants)/gi,
  ];
  const numericTokens = new Set<string>();
  for (const pat of numericPatterns) {
    for (const m of text.matchAll(pat)) {
      numericTokens.add(m[0].trim());
    }
  }

  const epochPattern = /\b(?:Cretaceous|Jurassic|Triassic|Permian|Cambrian|Ordovician|Silurian|Devonian|Carboniferous|Pleistocene|Holocene|Pliocene|Miocene|Oligocene|Eocene|Paleocene|Mesozoic|Cenozoic|Paleozoic|Precambrian|Archean|Proterozoic|Quaternary|Tertiary|Neogene|Paleogene|Anthropocene)\b/gi;
  const namedEpochs = Array.from(new Set(Array.from(text.matchAll(epochPattern)).map(m => m[0])));

  return { emDashes, commas, periods, wordCount, charCount, numericTokens: Array.from(numericTokens), namedEpochs };
}

function formatStats(s: LeverStats): string {
  const lines = [
    `  em-dashes: ${s.emDashes}`,
    `  commas: ${s.commas}`,
    `  periods: ${s.periods}`,
    `  words: ${s.wordCount}`,
    `  chars: ${s.charCount}`,
  ];
  if (s.numericTokens.length > 0) {
    lines.push(`  numeric tokens (${s.numericTokens.length}): ${s.numericTokens.join(' | ')}`);
  } else {
    lines.push(`  numeric tokens: (none detected)`);
  }
  if (s.namedEpochs.length > 0) {
    lines.push(`  named epochs (${s.namedEpochs.length}): ${s.namedEpochs.join(', ')}`);
  } else {
    lines.push(`  named epochs: (none detected)`);
  }
  return lines.join('\n');
}

function ssmlPreview(ssml: string, maxChars = 280): string {
  if (ssml.length <= maxChars) return ssml;
  return ssml.slice(0, maxChars) + ' …(truncated)';
}

// ── Main ───────────────────────────────────────────────────────────────────
async function main(): Promise<void> {
  console.log('=== Prosody Tier 2 SSML test render — narrator_b × Family ===');
  console.log(`  Regions: ${TEST_REGION_NAMES.join(', ')}`);
  console.log(`  Pipeline: Haiku (markers + digits) → ssmlize() → <speak> SSML → Google TTS @ 1.0`);
  console.log(`  Storage path: ${TEST_BUCKET_PREFIX}/{region_id}/${TEST_FILE_SUFFIX}.opus (side-channel)`);
  console.log('');

  if (!process.env['ANTHROPIC_API_KEY']) fail('ANTHROPIC_API_KEY not set');
  if (!process.env['GOOGLE_APPLICATION_CREDENTIALS']) fail('GOOGLE_APPLICATION_CREDENTIALS not set');
  if (!process.env['SUPABASE_URL']) fail('SUPABASE_URL not set');
  if (!process.env['SUPABASE_SERVICE_ROLE_KEY']) fail('SUPABASE_SERVICE_ROLE_KEY not set');

  const supabase: SupabaseClient = createClient(
    process.env['SUPABASE_URL']!,
    process.env['SUPABASE_SERVICE_ROLE_KEY']!,
    { auth: { persistSession: false } },
  );

  // 1. Load region templates (feature-branch narrator_b_family with Tier 2 markers)
  const { pickRegionPrompt } = require(REGION_TEMPLATES_PATH) as {
    pickRegionPrompt: (n: string, a: string) => RegionTemplate;
  };
  const template = pickRegionPrompt(NARRATOR_SLUG, AUDIENCE_MODE);

  // 2. Look up narrator_b family voice from voice_configs (read-only)
  const { data: voiceRows, error: vcErr } = await supabase
    .from('voice_configs')
    .select('voice_id, voice_settings')
    .eq('mode', AUDIENCE_MODE)
    .eq('narrator_slug', NARRATOR_SLUG)
    .eq('is_active', true)
    .limit(1);
  if (vcErr) fail(`voice_configs query: ${vcErr.message}`);
  if (!voiceRows || voiceRows.length === 0) {
    fail(`no active voice_configs row for ${NARRATOR_SLUG} × ${AUDIENCE_MODE}`);
  }
  const voice = voiceRows[0] as VoiceRow;
  const productionRate = voice.voice_settings?.speakingRate ?? 1.0;
  console.log(`  Voice: ${voice.voice_id} (voice_configs rate ${productionRate}; runtime override REMOVED — provider default 1.0)`);
  console.log('');

  // 3. Look up regions by name
  const { data: regions, error: regErr } = await supabase
    .from('regions')
    .select('id, name, display_name, description, region_type')
    .in('name', TEST_REGION_NAMES as unknown as string[]);
  if (regErr) fail(`regions query: ${regErr.message}`);
  if (!regions || regions.length === 0) fail('no test regions matched by name');
  if (regions.length < TEST_REGION_NAMES.length) {
    const got = new Set(regions.map((r: RegionRow) => r.name));
    const missing = TEST_REGION_NAMES.filter(n => !got.has(n));
    fail(`missing regions: ${missing.join(', ')}`);
  }

  // 4. Register TTS provider
  registerProvider(new GoogleTTSProvider());
  const ANTHROPIC_API_KEY = process.env['ANTHROPIC_API_KEY']!;

  interface Result {
    region: RegionRow;
    productionText: string | null;
    productionStats: LeverStats | null;
    newText: string;             // raw LLM output (with {{PAUSE}} markers)
    newStats: LeverStats;        // computed on raw LLM output
    ssml: string;                // post-processed SSML <speak> doc
    markerStats: ReturnType<typeof tallyMarkers>;
    storageUrl: string;
    haikuCost: number;
    ttsCost: number;
    fallbackUsed: boolean;
  }
  const results: Result[] = [];

  for (let i = 0; i < regions.length; i++) {
    const region = regions[i] as RegionRow;
    console.log(`[${i + 1}/${regions.length}] ${region.name} (${region.id})`);

    // 5a. Fetch production narration_text for baseline diff
    const { data: prodRows } = await supabase
      .from('narration_audio')
      .select('narration_text')
      .eq('region_id', region.id)
      .eq('narrator_slug', NARRATOR_SLUG)
      .eq('mode', TRIP_MODE)
      .eq('depth', DEPTH)
      .eq('status', 'ready')
      .limit(1);
    const productionText = (prodRows && prodRows.length > 0 ? prodRows[0]!.narration_text : null) as string | null;
    const productionStats = productionText ? analyzeLevers(productionText) : null;

    // 5b. Generate via Haiku — log cost IMMEDIATELY on return
    const userPrompt = template.buildUserPrompt(region);
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
      fail(`Haiku HTTP ${hr.status}: ${errText.slice(0, 200)}`);
    }
    const hj = (await hr.json()) as {
      content?: Array<{ type: string; text?: string }>;
      usage?: { input_tokens?: number; output_tokens?: number };
    };
    const inTok = hj.usage?.input_tokens ?? 0;
    const outTok = hj.usage?.output_tokens ?? 0;
    const haikuCost = +(inTok * HAIKU_IN_PER_TOK + outTok * HAIKU_OUT_PER_TOK).toFixed(6);

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
    const newText = parsed.narration;
    if (!newText) fail(`Haiku returned empty narration for ${region.name}`);

    const newStats = analyzeLevers(newText);

    // 5c. Post-process to SSML
    const ssml = ssmlize(newText);
    const markerStats = tallyMarkers(newText, ssml);

    // 5d. TTS via abstraction. Auto-detects SSML via leading <speak>.
    //     speakingRate omitted → provider default 1.0.
    let ttsOutput;
    let fallbackUsed = false;
    try {
      ttsOutput = await generateNarration({
        text: ssml,
        voiceConfigOverride: {
          provider: 'google',
          voiceId: voice.voice_id,
        },
      });
    } catch (err) {
      console.log(`  SSML synthesis threw: ${err instanceof Error ? err.message : String(err)}`);
      ttsOutput = null;
    }

    if (!ttsOutput) {
      console.log(`  SSML synthesis returned null — falling back to plain text`);
      fallbackUsed = true;
      await supabase.from('llm_calls').insert({
        call_type: 'tts',
        provider: 'google',
        model_or_voice: `${voice.voice_id}__SSML_PARSE_FAILED`,
        input_chars: ssml.length,
        cost_usd: 0,
        related_id: null,
      });
      const plain = stripMarkersAndTags(newText);
      ttsOutput = await generateNarration({
        text: plain,
        voiceConfigOverride: {
          provider: 'google',
          voiceId: voice.voice_id,
        },
      });
      if (!ttsOutput) fail(`Plain-text TTS retry also failed for ${region.name}`);
    }

    const audioBuffer = Buffer.isBuffer(ttsOutput.audioBuffer)
      ? ttsOutput.audioBuffer
      : Buffer.from(ttsOutput.audioBuffer);
    const ttsCost = ttsOutput.costUsd;

    // 5e. Upload to side-channel Storage path
    const storagePath = `${TEST_BUCKET_PREFIX}/${region.id}/${TEST_FILE_SUFFIX}.opus`;
    const { error: upErr } = await supabase.storage
      .from(STORAGE_BUCKET)
      .upload(storagePath, audioBuffer, { contentType: 'audio/ogg; codecs=opus', upsert: true });
    if (upErr) fail(`Storage upload (${region.name}): ${upErr.message}`);
    const { data: { publicUrl } } = supabase.storage.from(STORAGE_BUCKET).getPublicUrl(storagePath);

    console.log(`  rendered: ${newStats.wordCount} words, markers ${markerStats.pause500}×500ms + ${markerStats.pause250}×250ms (${markerStats.pauseOther} other), SSML ${markerStats.ssmlBreaks} <break/>, ${markerStats.ssmlSayAs} <say-as>, ${(audioBuffer.length / 1024).toFixed(0)}KB${fallbackUsed ? ' [FALLBACK USED]' : ''}`);
    console.log(`  cost: Claude $${haikuCost.toFixed(4)} + TTS $${ttsCost.toFixed(4)} = $${(haikuCost + ttsCost).toFixed(4)}`);
    console.log(`  URL: ${publicUrl}`);

    results.push({
      region, productionText, productionStats,
      newText, newStats, ssml, markerStats,
      storageUrl: publicUrl, haikuCost, ttsCost, fallbackUsed,
    });

    if (i < regions.length - 1) await sleep(INTER_CALL_PAUSE_MS);
  }

  // 6. Per-region detail dump for curator A/B review
  console.log('');
  console.log('═══════════════════════════════════════════════════════════════════');
  console.log('  PER-REGION LEVER DIFF — for chat post to curator');
  console.log('═══════════════════════════════════════════════════════════════════');

  for (const r of results) {
    console.log('');
    console.log(`── ${r.region.name} ${'─'.repeat(Math.max(0, 60 - r.region.name.length))}`);
    console.log('');
    console.log(`URL: ${r.storageUrl}`);
    if (r.fallbackUsed) console.log(`!! FALLBACK USED — SSML failed, plain text retry succeeded`);
    console.log('');
    if (r.productionStats) {
      console.log(`PRODUCTION (existing cut at regions/${r.region.id}/narrator_b.opus, speakingRate 1.0, no SSML):`);
      console.log(formatStats(r.productionStats));
      console.log('');
    }
    console.log(`NEW Tier 2 (speakingRate 1.0, SSML pipeline + markers):`);
    console.log(formatStats(r.newStats));
    console.log(`  pause markers emitted: ${r.markerStats.pause500}×{{PAUSE_500}} + ${r.markerStats.pause250}×{{PAUSE_250}}${r.markerStats.pauseOther ? ` + ${r.markerStats.pauseOther} other` : ''}`);
    console.log(`  SSML tags inserted: ${r.markerStats.ssmlBreaks} <break/>, ${r.markerStats.ssmlSayAs} <say-as>`);
    console.log('');
    if (r.productionStats) {
      const dEm = r.newStats.emDashes - r.productionStats.emDashes;
      const dCom = r.newStats.commas - r.productionStats.commas;
      const dPer = r.newStats.periods - r.productionStats.periods;
      const dWord = r.newStats.wordCount - r.productionStats.wordCount;
      const newNumeric = r.newStats.numericTokens.filter(t => !r.productionStats!.numericTokens.includes(t));
      const droppedNumeric = r.productionStats.numericTokens.filter(t => !r.newStats.numericTokens.includes(t));
      const newEpochs = r.newStats.namedEpochs.filter(e => !r.productionStats!.namedEpochs.includes(e));
      console.log(`DELTA vs production:`);
      console.log(`  em-dashes ${dEm >= 0 ? '+' : ''}${dEm}, commas ${dCom >= 0 ? '+' : ''}${dCom}, periods ${dPer >= 0 ? '+' : ''}${dPer}, words ${dWord >= 0 ? '+' : ''}${dWord}`);
      if (newNumeric.length > 0) console.log(`  NEW numeric tokens: ${newNumeric.join(' | ')}`);
      if (droppedNumeric.length > 0) console.log(`  dropped numeric tokens: ${droppedNumeric.join(' | ')}`);
      if (newEpochs.length > 0) console.log(`  NEW named epochs: ${newEpochs.join(', ')}`);
      console.log('');
    }
    console.log(`SSML PREVIEW (first 280 chars):`);
    console.log(ssmlPreview(r.ssml));
    console.log('');
    console.log(`NEW NARRATION TEXT (with markers shown verbatim):`);
    console.log(r.newText);
    console.log('');
    if (r.productionText) {
      console.log(`PRODUCTION NARRATION TEXT (for reference):`);
      console.log(r.productionText);
      console.log('');
    }
  }

  // 7. Summary
  const totalHaiku = results.reduce((s, r) => s + r.haikuCost, 0);
  const totalTts = results.reduce((s, r) => s + r.ttsCost, 0);
  const fallbackCount = results.filter(r => r.fallbackUsed).length;
  console.log('═══════════════════════════════════════════════════════════════════');
  console.log(`  TOTAL SPEND: $${(totalHaiku + totalTts).toFixed(4)} (Claude $${totalHaiku.toFixed(4)} + TTS $${totalTts.toFixed(4)})`);
  if (fallbackCount > 0) console.log(`  FALLBACK USED: ${fallbackCount}/${results.length} renders`);
  console.log('═══════════════════════════════════════════════════════════════════');
}

main().catch((err: unknown) => {
  const msg = err instanceof Error ? err.message : String(err);
  console.error(`FATAL: ${msg}`);
  process.exit(1);
});
