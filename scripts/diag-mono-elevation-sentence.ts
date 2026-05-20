/**
 * scripts/diag-mono-elevation-sentence.ts
 *
 * Focused diagnostic for the curator-reported "between feet and feet"
 * omission in the Mono Basin re-render #3.
 *
 * Tests three variants of the exact elevation sentence from the 3rd
 * cycle, with byte-size comparison to determine whether numbers are
 * being spoken or silently dropped:
 *
 *   V1: Pipeline output — what ssmlize() produces now (sanitized cardinals).
 *   V2: Plain SSML, no say-as wrap — Google's default digit reading.
 *   V3: Numbers REMOVED from prose — establishes "all numbers dropped"
 *       baseline so we can compare V1 against it.
 *
 * If V1 ≈ V2 (full reading) and V3 << V1 (numbers absent), pipeline is
 * working — curator may have hit a stale cache. Tell them to hard-refresh.
 *
 * If V1 ≈ V3 (numbers absent in pipeline output), the sanitization fix
 * is NOT taking effect at render time, despite the build-time test
 * showing bare digits. Investigate further.
 *
 * If V2 < V1, the say-as wrap is somehow worse than plain prose. Drop
 * the wrap entirely and rely on Google's default digit reading.
 *
 * Cost: 3 × ~$0.001 = ~$0.003. ~5 seconds.
 */

import { readFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { registerProvider, generateNarration } from './lib/tts/index.js';
import { GoogleTTSProvider } from './lib/tts/providers/google.js';
import { ssmlize } from '../server/lib/ssml.js';

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

async function synth(label: string, input: string): Promise<number> {
  const out = await generateNarration({
    text: input,
    voiceConfigOverride: { provider: 'google', voiceId: VOICE },
  });
  if (!out) {
    console.log(`  ${label}: NULL`);
    return 0;
  }
  const bytes = (Buffer.isBuffer(out.audioBuffer) ? out.audioBuffer : Buffer.from(out.audioBuffer)).length;
  console.log(`  ${label}: ${bytes} bytes`);
  return bytes;
}

async function main(): Promise<void> {
  if (!process.env['GOOGLE_APPLICATION_CREDENTIALS']) {
    console.error('FATAL: GOOGLE_APPLICATION_CREDENTIALS not set');
    process.exit(1);
  }
  registerProvider(new GoogleTTSProvider());

  // The exact sentence from Mono Basin re-render #3 that curator flagged.
  const prose = 'The basin floor sits at 6,380 feet around Mono Lake itself, but Mount Dana rises to 13,061 feet just to the west.';
  const proseNoNumbers = 'The basin floor sits at feet around Mono Lake itself, but Mount Dana rises to feet just to the west.';

  console.log('=== Mono Basin elevation-sentence omission diagnostic ===');
  console.log(`  Voice: ${VOICE}`);
  console.log(`  Prose: "${prose}"`);
  console.log('');

  // V1: Pipeline output
  const { ssml: v1ssml } = ssmlize(prose);
  console.log('V1 — current pipeline output (sanitized SSML):');
  console.log(`  SSML: ${v1ssml}`);
  const v1bytes = await synth('  AUDIO', v1ssml);
  console.log('');

  // V2: Plain SSML, no say-as, no markers
  const v2ssml = `<speak>${prose.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;')}</speak>`;
  console.log('V2 — plain SSML (no say-as wrap, Google default digit reading):');
  console.log(`  SSML: ${v2ssml}`);
  const v2bytes = await synth('  AUDIO', v2ssml);
  console.log('');

  // V3: Numbers removed from prose (baseline for "all numbers dropped")
  const v3ssml = `<speak>${proseNoNumbers.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;')}</speak>`;
  console.log('V3 — numbers REMOVED from prose (baseline: "feet" and "feet" with no number):');
  console.log(`  SSML: ${v3ssml}`);
  const v3bytes = await synth('  AUDIO', v3ssml);
  console.log('');

  console.log('=== VERDICT ===');
  console.log(`  V1 (sanitized pipeline):       ${v1bytes} bytes`);
  console.log(`  V2 (plain SSML, default read): ${v2bytes} bytes`);
  console.log(`  V3 (numbers removed):          ${v3bytes} bytes`);
  console.log('');

  const v1MinusV3 = v1bytes - v3bytes;
  const v2MinusV3 = v2bytes - v3bytes;
  console.log(`  V1 - V3 (bytes added by sanitized cardinals): ${v1MinusV3}`);
  console.log(`  V2 - V3 (bytes added by default digit reading): ${v2MinusV3}`);
  console.log('');

  if (v1bytes <= v3bytes * 1.05) {
    console.log('  >> V1 ~= V3: sanitized cardinals NOT being read. Sanitization fix not active at render time, or has a different bug.');
  } else if (v1bytes < v2bytes * 0.85) {
    console.log('  >> V1 << V2: sanitized cardinals read SOMETHING but less than default digit reading. Investigate <say-as> behavior on this voice.');
  } else if (Math.abs(v1bytes - v2bytes) < v1bytes * 0.1) {
    console.log('  >> V1 ~= V2: sanitized cardinals read at the same length as default. Pipeline working; curator likely on stale cache.');
  } else {
    console.log('  >> V1 > V2: sanitized cardinals adding MORE audio than default. Numbers definitely being read.');
  }
}

main().catch((err: unknown) => {
  console.error('FATAL:', err instanceof Error ? err.message : String(err));
  process.exit(1);
});
