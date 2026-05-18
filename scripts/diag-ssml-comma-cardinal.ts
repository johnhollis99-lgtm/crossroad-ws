/**
 * scripts/diag-ssml-comma-cardinal.ts
 *
 * Diagnostic: confirm or falsify the hypothesis that
 * <say-as interpret-as="cardinal">6,380</say-as> silently drops the
 * number content (synthesizes zero audio for it), versus the bare-digit
 * form <say-as interpret-as="cardinal">6380</say-as> which reads
 * "six thousand three hundred eighty".
 *
 * Method: synthesize four short SSML docs — two pairs — at identical
 * speakingRate. Compare the audio buffer sizes (proxy for duration).
 *
 *   Pair A:  "The elevation is 6,380 feet." (comma-wrapped)
 *            "The elevation is 6380 feet."  (bare-wrapped)
 *   Pair B:  "We're talking 100,000 years." (comma-wrapped)
 *            "We're talking 100000 years."  (bare-wrapped)
 *
 * If commas drop: comma version much shorter than bare version.
 * If commas read: both versions ~equal length.
 *
 * One-shot, ~$0.001, no DB writes, no Storage uploads. Just prints
 * buffer sizes + the diff.
 *
 * Run (from project root):
 *   npx tsx scripts/diag-ssml-comma-cardinal.ts
 */

import { readFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { registerProvider, generateNarration } from './lib/tts/index.js';
import { GoogleTTSProvider } from './lib/tts/providers/google.js';

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

const VOICE = 'en-US-Chirp3-HD-Sadachbia';

async function synth(label: string, ssml: string): Promise<{ bytes: number; estMs: number; chars: number }> {
  const out = await generateNarration({
    text: ssml,
    voiceConfigOverride: { provider: 'google', voiceId: VOICE },
  });
  if (!out) {
    console.log(`  ${label}: NULL (synthesis failed)`);
    return { bytes: 0, estMs: 0, chars: ssml.length };
  }
  const buf = Buffer.isBuffer(out.audioBuffer) ? out.audioBuffer : Buffer.from(out.audioBuffer);
  console.log(`  ${label}: ${buf.length} bytes, ${out.durationMs}ms est, ${ssml.length} chars in`);
  return { bytes: buf.length, estMs: out.durationMs, chars: ssml.length };
}

async function main(): Promise<void> {
  if (!process.env['GOOGLE_APPLICATION_CREDENTIALS']) {
    console.error('FATAL: GOOGLE_APPLICATION_CREDENTIALS not set');
    process.exit(1);
  }
  registerProvider(new GoogleTTSProvider());

  console.log('=== SSML cardinal comma-format diagnostic ===');
  console.log(`  Voice: ${VOICE}`);
  console.log(`  Hypothesis: <say-as interpret-as="cardinal">6,380</say-as> silently drops content`);
  console.log('');

  console.log('PAIR A — "The elevation is N feet."');
  const a1 = await synth(
    'comma 6,380 ',
    `<speak>The elevation is <say-as interpret-as="cardinal">6,380</say-as> feet.</speak>`,
  );
  const a2 = await synth(
    'bare  6380  ',
    `<speak>The elevation is <say-as interpret-as="cardinal">6380</say-as> feet.</speak>`,
  );
  console.log('');

  console.log('PAIR B — "We are talking N years."');
  const b1 = await synth(
    'comma 100,000',
    `<speak>We are talking <say-as interpret-as="cardinal">100,000</say-as> years.</speak>`,
  );
  const b2 = await synth(
    'bare  100000 ',
    `<speak>We are talking <say-as interpret-as="cardinal">100000</say-as> years.</speak>`,
  );
  console.log('');

  console.log('PAIR C (control) — small number that fits comma-free, "We are talking 634 things."');
  const c1 = await synth(
    'plain 634   ',
    `<speak>We are talking <say-as interpret-as="cardinal">634</say-as> things.</speak>`,
  );
  console.log('');

  console.log('=== ANALYSIS ===');
  const ratioA = a1.bytes / Math.max(1, a2.bytes);
  const ratioB = b1.bytes / Math.max(1, b2.bytes);
  console.log(`  Pair A ratio (comma/bare):  ${ratioA.toFixed(3)}  (comma ${a1.bytes}B vs bare ${a2.bytes}B)`);
  console.log(`  Pair B ratio (comma/bare):  ${ratioB.toFixed(3)}  (comma ${b1.bytes}B vs bare ${b2.bytes}B)`);
  console.log(`  Pair C plain 634:           ${c1.bytes}B (no comma, control)`);
  console.log('');

  // Heuristic verdict
  // If commas drop, comma-wrapped should be 30%+ shorter than bare-wrapped
  // (the number is the only content with significant variable duration).
  const verdict =
    ratioA < 0.85 || ratioB < 0.85
      ? 'HYPOTHESIS CONFIRMED — commas appear to drop content'
      : ratioA > 1.15 || ratioB > 1.15
        ? 'HYPOTHESIS INVERTED — commas seem to ADD content (unexpected)'
        : 'HYPOTHESIS FALSIFIED — comma vs bare produce similar audio length';
  console.log(`  VERDICT: ${verdict}`);
}

main().catch((err: unknown) => {
  console.error('FATAL:', err instanceof Error ? err.message : String(err));
  process.exit(1);
});
