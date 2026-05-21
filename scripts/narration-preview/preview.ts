/**
 * scripts/narration-preview/preview.ts
 *
 * Curator preview tool: synthesizes audio for Tier 1 (and future Tier 2 /
 * audience-tuning) sources via Claude Sonnet 4.6 + Google Chirp 3 HD TTS.
 *
 * Pipeline:
 *   curator-authored source → Claude (cadence rewrite or synthesis)
 *   → ssmlize() → Google TTS → local .opus + .txt
 *
 * Local artifact only — does NOT write to narration_audio or upload to
 * Supabase Storage. Two files per run, both gitignored:
 *   scripts/narration-preview/output/<source>-<mode>-<timestamp>.opus
 *   scripts/narration-preview/output/<source>-<mode>-<timestamp>.txt
 *
 * v1 supports --mode tier1 (locked to narrator_b/family — Sadachbia via
 * voice_configs DB lookup). --mode standard is reserved for future Tier 2
 * + audience-tuning work and currently exits with a "not yet wired" message.
 *
 * Run (from project root):
 *   npx tsx scripts/narration-preview/preview.ts --source madonna-inn
 *   npx tsx scripts/narration-preview/preview.ts --source madonna-inn --dry-run
 */

import { readFileSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { registerProvider, generateNarration } from '../lib/tts/index.js';
import { GoogleTTSProvider } from '../lib/tts/providers/google.js';
import { ssmlize, stripMarkersAndTags } from '../../server/lib/ssml.js';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import {
  TIER1_SOUL_FULL_SYSTEM_PROMPT,
  buildTier1UserPrompt,
} from './prompts/tier1-soul-full.js';
import { MADONNA_INN_SOURCE, type SourceRecord } from './sources/madonna-inn.js';

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = resolve(SCRIPT_DIR, '..', '..');
const ENV_PATH = resolve(PROJECT_ROOT, '.env');
const OUTPUT_DIR = resolve(SCRIPT_DIR, 'output');

// ── dotenv (matches scripts/spot-check-3-pois.ts pattern) ──────────────────
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
const DEFAULT_MODEL = 'claude-sonnet-4-6';
const DEFAULT_COST_CEILING_USD = 1.0;
const MAX_TOKENS = 1500;

const PRICING: Record<string, { in_per_tok: number; out_per_tok: number }> = {
  // claude-sonnet-4-6 pricing: $3/M input, $15/M output
  'claude-sonnet-4-6': { in_per_tok: 3.0 / 1_000_000, out_per_tok: 15.0 / 1_000_000 },
  // claude-haiku-4-5 pricing: $1/M input, $5/M output
  'claude-haiku-4-5-20251001': { in_per_tok: 1.0 / 1_000_000, out_per_tok: 5.0 / 1_000_000 },
};

const SOURCES: Record<string, SourceRecord> = {
  'madonna-inn': MADONNA_INN_SOURCE,
};

function fail(msg: string): never {
  console.error(`FATAL: ${msg}`);
  process.exit(1);
}

// ── CLI parsing ────────────────────────────────────────────────────────────
type Mode = 'tier1' | 'standard';
type Audience = 'family' | 'kids' | 'unfiltered' | 'local';

interface CliArgs {
  source: string;
  mode: Mode;
  audience: Audience;
  model: string;
  costCeiling: number;
  dryRun: boolean;
}

function parseArgs(): CliArgs {
  const out: CliArgs = {
    source: '',
    mode: 'tier1',
    audience: 'family',
    model: DEFAULT_MODEL,
    costCeiling: DEFAULT_COST_CEILING_USD,
    dryRun: false,
  };
  const args = process.argv.slice(2);
  for (let i = 0; i < args.length; i++) {
    const a = args[i]!;
    if (a === '--source') out.source = args[++i] ?? '';
    else if (a === '--mode') out.mode = (args[++i] as Mode) ?? 'tier1';
    else if (a === '--audience') out.audience = (args[++i] as Audience) ?? 'family';
    else if (a === '--model') out.model = args[++i] ?? DEFAULT_MODEL;
    else if (a === '--cost-ceiling') out.costCeiling = parseFloat(args[++i] ?? '1');
    else if (a === '--dry-run') out.dryRun = true;
    else if (a === '--help' || a === '-h') {
      console.log(
        `Usage: npx tsx scripts/narration-preview/preview.ts --source <id> [--mode tier1|standard] [--audience family|kids|unfiltered|local] [--model <id>] [--cost-ceiling <usd>] [--dry-run]\n\nAvailable sources: ${Object.keys(SOURCES).join(', ')}`,
      );
      process.exit(0);
    } else {
      fail(`unknown flag: ${a}`);
    }
  }
  if (!out.source) {
    fail(`--source <id> required. Available: ${Object.keys(SOURCES).join(', ')}`);
  }
  if (!(out.source in SOURCES)) {
    fail(`unknown source '${out.source}'. Available: ${Object.keys(SOURCES).join(', ')}`);
  }
  if (out.mode !== 'tier1' && out.mode !== 'standard') {
    fail(`--mode must be tier1 or standard, got '${out.mode}'`);
  }
  if (out.mode === 'standard') {
    fail(`--mode standard not yet wired — reserved for Tier 2 + audience-tuning work. Use --mode tier1 (default) for v1.`);
  }
  return out;
}

// ── Main ───────────────────────────────────────────────────────────────────
async function main(): Promise<void> {
  const args = parseArgs();
  const source = SOURCES[args.source]!;
  console.log(`=== Narration preview — ${source.name} ===`);
  console.log(`Mode: ${args.mode}  ·  Model: ${args.model}  ·  Cost ceiling: $${args.costCeiling.toFixed(2)}`);
  console.log('');

  // Tier 1 locks to family/narrator_b
  if (args.audience !== 'family') {
    console.warn(
      `(Note: --audience ${args.audience} ignored in --mode tier1. v1 Tier 1 locks to narrator_b/family via voice_configs.)`,
    );
  }
  const AUDIENCE_MODE = 'family' as const;
  const NARRATOR_SLUG = 'narrator_b' as const;

  // Env
  if (!process.env['ANTHROPIC_API_KEY']) fail('ANTHROPIC_API_KEY not set in root .env');
  if (!process.env['GOOGLE_APPLICATION_CREDENTIALS']) fail('GOOGLE_APPLICATION_CREDENTIALS not set');
  if (!process.env['SUPABASE_URL']) fail('SUPABASE_URL not set');
  if (!process.env['SUPABASE_SERVICE_ROLE_KEY']) fail('SUPABASE_SERVICE_ROLE_KEY not set');

  const supabase: SupabaseClient = createClient(
    process.env['SUPABASE_URL']!,
    process.env['SUPABASE_SERVICE_ROLE_KEY']!,
    { auth: { persistSession: false } },
  );

  // Voice resolution via voice_configs
  const { data: voiceRows, error: vcErr } = await supabase
    .from('voice_configs')
    .select('voice_id, voice_settings, display_name')
    .eq('mode', AUDIENCE_MODE)
    .eq('narrator_slug', NARRATOR_SLUG)
    .eq('is_active', true)
    .limit(1);
  if (vcErr) fail(`voice_configs query: ${vcErr.message}`);
  if (!voiceRows || voiceRows.length === 0) {
    fail(`no active voice_configs row for ${NARRATOR_SLUG} × ${AUDIENCE_MODE}`);
  }
  const voice = voiceRows[0] as {
    voice_id: string;
    voice_settings: { speakingRate?: number; pitch?: number };
    display_name: string;
  };
  const speakingRate = voice.voice_settings?.speakingRate ?? 1.0;
  console.log(`Voice: ${voice.voice_id} @ rate ${speakingRate}  (${voice.display_name})`);
  console.log('');

  // Build prompts
  const systemPrompt = TIER1_SOUL_FULL_SYSTEM_PROMPT;
  const userPrompt = buildTier1UserPrompt({
    name: source.name,
    description: source.description,
    sourceCitation: source.source_citation,
  });

  if (args.dryRun) {
    console.log('=== DRY RUN — prompts only, no API spend ===');
    console.log('');
    console.log('--- system prompt ---');
    console.log(systemPrompt);
    console.log('');
    console.log('--- user prompt ---');
    console.log(userPrompt);
    console.log('');
    return;
  }

  // Cost projection (rough, defensive guardrail)
  const pricing = PRICING[args.model] ?? PRICING['claude-sonnet-4-6']!;
  const estimatedInputTokens = Math.ceil((systemPrompt.length + userPrompt.length) / 4);
  const estimatedOutputTokens = Math.ceil(source.description.length / 4);
  const estimatedTtsChars = source.description.length;
  const estClaudeCost = estimatedInputTokens * pricing.in_per_tok + estimatedOutputTokens * pricing.out_per_tok;
  const estTtsCost = (estimatedTtsChars / 1_000_000) * 16;
  const estTotal = estClaudeCost + estTtsCost;
  console.log(
    `Projected: ~${estimatedInputTokens} in tok, ~${estimatedOutputTokens} out tok, ~${estimatedTtsChars} TTS chars`,
  );
  console.log(
    `Projected cost: $${estTotal.toFixed(4)} (claude $${estClaudeCost.toFixed(4)} + tts $${estTtsCost.toFixed(4)})`,
  );
  if (estTotal > args.costCeiling) {
    fail(`projected $${estTotal.toFixed(2)} exceeds ceiling $${args.costCeiling.toFixed(2)} — aborting`);
  }
  console.log('');

  // Claude call
  console.log(`▶ Calling ${args.model}...`);
  const t0 = Date.now();
  const hr = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-api-key': process.env['ANTHROPIC_API_KEY']!,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: args.model,
      max_tokens: MAX_TOKENS,
      system: systemPrompt,
      messages: [{ role: 'user', content: userPrompt }],
    }),
  });
  if (!hr.ok) {
    const errText = await hr.text().catch(() => '');
    fail(`Claude HTTP ${hr.status}: ${errText.slice(0, 400)}`);
  }
  const hj = (await hr.json()) as {
    content?: Array<{ type: string; text?: string }>;
    usage?: { input_tokens?: number; output_tokens?: number };
  };
  const inTok = hj.usage?.input_tokens ?? 0;
  const outTok = hj.usage?.output_tokens ?? 0;
  const claudeCost = +(inTok * pricing.in_per_tok + outTok * pricing.out_per_tok).toFixed(6);
  const claudeElapsedMs = Date.now() - t0;
  console.log(`  ✓ ${inTok} in tok / ${outTok} out tok / $${claudeCost.toFixed(4)} / ${(claudeElapsedMs / 1000).toFixed(1)}s`);

  const raw = (hj.content ?? [])
    .filter((b) => b.type === 'text')
    .map((b) => b.text ?? '')
    .join('')
    .trim();

  // Delimiter-marked protocol (robust to embedded double-quotes from
  // verbatim source quoted material — see prompts/tier1-soul-full.ts
  // OUTPUT section for rationale).
  const narrationMatch = raw.match(/<<<NARRATION>>>\s*([\s\S]+?)\s*<<<END_NARRATION>>>/);
  const themesMatch = raw.match(/<<<KEY_THEMES>>>\s*([\s\S]+?)\s*<<<END_KEY_THEMES>>>/);
  if (!narrationMatch) {
    fail(`Claude output missing <<<NARRATION>>> delimiter block.\n  raw: ${raw.slice(0, 400)}`);
  }
  const narrationText = narrationMatch[1]!.trim();
  const keyThemes = themesMatch
    ? themesMatch[1]!
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean)
    : [];
  const parsed = { narration: narrationText, key_themes: keyThemes };
  if (!parsed.narration) fail('Claude returned empty narration');
  const cleanedTextForCount = stripMarkersAndTags(narrationText);
  const approxWordCount = cleanedTextForCount.split(/\s+/).filter(Boolean).length;
  const markerCounts = {
    pause500: (narrationText.match(/\{\{PAUSE_500\}\}/g) ?? []).length,
    pause250: (narrationText.match(/\{\{PAUSE_250\}\}/g) ?? []).length,
  };
  console.log(
    `  narration: ~${approxWordCount} words / ${narrationText.length} chars raw / markers: ${markerCounts.pause500}×PAUSE_500 + ${markerCounts.pause250}×PAUSE_250`,
  );
  console.log('');

  // SSML + TTS
  console.log(`▶ Synthesizing audio (Google Chirp 3 HD)...`);
  registerProvider(new GoogleTTSProvider());
  const { ssml } = ssmlize(narrationText);
  let ttsOutput;
  let usedPlainFallback = false;
  try {
    ttsOutput = await generateNarration({
      text: ssml,
      voiceConfigOverride: { provider: 'google', voiceId: voice.voice_id, speakingRate },
    });
  } catch {
    ttsOutput = null;
  }
  if (!ttsOutput) {
    console.log('  (SSML failed — falling back to plain text)');
    usedPlainFallback = true;
    ttsOutput = await generateNarration({
      text: cleanedTextForCount,
      voiceConfigOverride: { provider: 'google', voiceId: voice.voice_id, speakingRate },
    });
    if (!ttsOutput) fail('TTS failed (both SSML and plain text paths)');
  }
  const ttsCost = ttsOutput.costUsd;
  const durationSec = ttsOutput.durationMs / 1000;
  console.log(
    `  ✓ ${ttsOutput.characterCount} chars / $${ttsCost.toFixed(4)} / ${durationSec.toFixed(1)}s audio`,
  );
  console.log('');

  // Write output artifacts (gitignored)
  if (!existsSync(OUTPUT_DIR)) mkdirSync(OUTPUT_DIR, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const baseName = `${args.source}-${args.mode}-${stamp}`;
  const opusPath = resolve(OUTPUT_DIR, `${baseName}.opus`);
  const txtPath = resolve(OUTPUT_DIR, `${baseName}.txt`);

  const audioBuffer = Buffer.isBuffer(ttsOutput.audioBuffer)
    ? ttsOutput.audioBuffer
    : Buffer.from(ttsOutput.audioBuffer);
  writeFileSync(opusPath, audioBuffer);

  const totalCost = claudeCost + ttsCost;
  const txtHeader = [
    `# ${source.name} — Tier 1 preview`,
    `# ----------------------------------------------------------------------`,
    `# source:            ${args.source}`,
    `# mode:              ${args.mode}`,
    `# model:             ${args.model}`,
    `# voice_id:          ${voice.voice_id}`,
    `# speaking_rate:     ${speakingRate}`,
    `# voice_display:     ${voice.display_name}`,
    `# duration_s:        ${durationSec.toFixed(1)}`,
    `# word_count_approx: ${approxWordCount}`,
    `# pause_500_markers: ${markerCounts.pause500}`,
    `# pause_250_markers: ${markerCounts.pause250}`,
    `# claude_tokens:     in=${inTok}  out=${outTok}`,
    `# claude_cost_usd:   ${claudeCost.toFixed(6)}`,
    `# tts_chars:         ${ttsOutput.characterCount}`,
    `# tts_cost_usd:      ${ttsCost.toFixed(6)}`,
    `# total_cost_usd:    ${totalCost.toFixed(6)}`,
    `# fallback_to_plain: ${usedPlainFallback ? 'YES' : 'no'}`,
    `# generated_at:      ${new Date().toISOString()}`,
    `# key_themes:        ${(parsed.key_themes ?? []).join(', ')}`,
    `# ----------------------------------------------------------------------`,
    ``,
  ].join('\n');
  writeFileSync(txtPath, txtHeader + narrationText + '\n');

  console.log('═══════════════════════════════════════════════════════════════════');
  console.log('  Preview generated');
  console.log('═══════════════════════════════════════════════════════════════════');
  console.log('');
  console.log(`Audio:      ${opusPath}`);
  console.log(`Transcript: ${txtPath}`);
  console.log(`Duration:   ${durationSec.toFixed(1)}s (~${(durationSec / 60).toFixed(2)} min)`);
  console.log(`Words:      ~${approxWordCount}`);
  console.log(`Total cost: $${totalCost.toFixed(4)} (claude $${claudeCost.toFixed(4)} + tts $${ttsCost.toFixed(4)})`);
  console.log('');
  console.log('--- synthesized narration (read along while listening) ---');
  console.log('');
  console.log(narrationText);
  console.log('');
}

main().catch((err: unknown) => {
  const msg = err instanceof Error ? err.message : String(err);
  console.error(`FATAL: ${msg}`);
  process.exit(1);
});
