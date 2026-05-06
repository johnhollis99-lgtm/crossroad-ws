/**
 * XRoad Voice Audition Tool
 *
 * Usage:
 *   npm run audition           — generate samples for recommended candidates + build HTML
 *   npm run audition:all       — generate samples for ALL Chirp3-HD + Neural2 en-US voices
 *   npm run list               — list available voices (no generation)
 *   npm run html               — rebuild index.html from existing output files
 *   tsx run.ts --force         — regenerate even if output files already exist
 *
 * Requires: GOOGLE_APPLICATION_CREDENTIALS in root .env or environment.
 * Output:   scripts/voice-audition/output/{mode}/{voice_id}.opus
 *           scripts/voice-audition/output/index.html
 */

import { config as dotenvConfig } from 'dotenv';
import { resolve, join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { TextToSpeechClient } from '@google-cloud/text-to-speech';
import { mkdir, writeFile, access } from 'fs/promises';
import {
  MODES,
  MODE_META,
  PASSAGES,
  CANDIDATES,
  generateHTML,
  type VoiceInfo,
  type Mode,
} from './html.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

// Load GOOGLE_APPLICATION_CREDENTIALS and SUPABASE_* from project root
dotenvConfig({ path: resolve(__dirname, '..', '..', '.env') });

// ── Constants ─────────────────────────────────────────────────────────────

const SPEAKING_RATES: Record<Mode, number> = {
  family:     1.0,
  kids:       1.1,
  unfiltered: 0.95,
  local:      1.0,
};

const OUTPUT_DIR = join(__dirname, 'output');

// ── Helpers ───────────────────────────────────────────────────────────────

function tierFromName(name: string): VoiceInfo['tier'] {
  if (name.includes('Chirp3-HD')) return 'chirp3-hd';
  if (name.includes('Neural2'))   return 'neural2';
  if (name.includes('WaveNet'))   return 'wavenet';
  return 'standard';
}

async function fileExists(p: string): Promise<boolean> {
  try { await access(p); return true; } catch { return false; }
}

// ── API calls ─────────────────────────────────────────────────────────────

async function listVoices(client: TextToSpeechClient): Promise<VoiceInfo[]> {
  const [res] = await client.listVoices({ languageCode: 'en-US' });
  return (res.voices ?? [])
    .filter(v => v.name && (v.name.includes('Chirp3-HD') || v.name.includes('Neural2')))
    .map(v => ({
      voiceId: v.name!,
      tier:    tierFromName(v.name!),
      gender:  v.ssmlGender === 1 ? 'MALE' : v.ssmlGender === 2 ? 'FEMALE' : 'NEUTRAL',
    }))
    .sort((a, b) => {
      // Chirp3-HD first, then Neural2; alphabetical within tier
      if (a.tier === 'chirp3-hd' && b.tier !== 'chirp3-hd') return -1;
      if (b.tier === 'chirp3-hd' && a.tier !== 'chirp3-hd') return 1;
      return a.voiceId.localeCompare(b.voiceId);
    });
}

async function generateSample(
  client:  TextToSpeechClient,
  voiceId: string,
  mode:    Mode,
  force:   boolean,
): Promise<'generated' | 'skipped' | 'error'> {
  const outPath = join(OUTPUT_DIR, mode, `${voiceId}.opus`);
  if (!force && await fileExists(outPath)) return 'skipped';

  try {
    await mkdir(join(OUTPUT_DIR, mode), { recursive: true });

    const [res] = await client.synthesizeSpeech({
      input:       { text: PASSAGES[mode] },
      voice:       { languageCode: 'en-US', name: voiceId },
      audioConfig: { audioEncoding: 'OGG_OPUS', speakingRate: SPEAKING_RATES[mode] },
    });

    if (!res.audioContent) throw new Error('empty audioContent from API');
    await writeFile(outPath, Buffer.from(res.audioContent as Uint8Array));
    return 'generated';
  } catch (err) {
    // Log inline so the progress row stays readable; ✗ in the row indicates failure
    process.stdout.write(`\n    ✗ ${voiceId}/${mode}: ${(err as Error).message}\n    `);
    return 'error';
  }
}

async function buildHTML(voiceMap: Map<string, VoiceInfo>): Promise<void> {
  await mkdir(OUTPUT_DIR, { recursive: true });
  const html     = await generateHTML(OUTPUT_DIR, voiceMap);
  const htmlPath = join(OUTPUT_DIR, 'index.html');
  await writeFile(htmlPath, html, 'utf8');
  console.log(`\nHTML → ${htmlPath}`);
  console.log('Open in Chrome or Firefox (OGG/Opus — Safari not supported)');
}

// ── Main ──────────────────────────────────────────────────────────────────

const args      = new Set(process.argv.slice(2));
const listOnly  = args.has('--list');
const allVoices = args.has('--all');
const htmlOnly  = args.has('--html-only');
const force     = args.has('--force');

// Guard: credentials must be present for any API call
const hasCreds = !!process.env['GOOGLE_APPLICATION_CREDENTIALS'];
if (!listOnly && !htmlOnly && !hasCreds) {
  console.error(
    '\nError: GOOGLE_APPLICATION_CREDENTIALS is not set.\n' +
    'Add it to the project root .env:\n' +
    '  GOOGLE_APPLICATION_CREDENTIALS=C:\\path\\to\\service-account.json\n',
  );
  process.exit(1);
}

const client = new TextToSpeechClient();

if (listOnly) {
  if (!hasCreds) {
    console.error('\nError: GOOGLE_APPLICATION_CREDENTIALS required for --list\n');
    process.exit(1);
  }
  const voices      = await listVoices(client);
  const allCandidates = new Set(Object.values(CANDIDATES).flat());
  console.log('\nen-US Chirp3-HD and Neural2 voices:\n');
  for (const v of voices) {
    const star = allCandidates.has(v.voiceId) ? ' ★' : '';
    console.log(`  ${v.tier.padEnd(12)} ${v.gender.padEnd(8)} ${v.voiceId}${star}`);
  }
  console.log(`\nTotal: ${voices.length}  (★ = recommended candidate)\n`);

} else if (htmlOnly) {
  // Rebuild HTML without touching the API — derive tier from filename
  await buildHTML(new Map());
  console.log('(Voice metadata omitted — run without --html-only to include gender/tier from API)');

} else {
  const voices   = await listVoices(client);
  const voiceMap = new Map(voices.map(v => [v.voiceId, v]));

  // Build candidate union (unique voice IDs across all modes)
  const candidateIds = [...new Set(Object.values(CANDIDATES).flat())];
  const targetIds    = allVoices ? voices.map(v => v.voiceId) : candidateIds;

  console.log(`\nGenerating ${targetIds.length} voice${targetIds.length === 1 ? '' : 's'} × 4 modes`);
  if (!allVoices) {
    console.log('(candidates only — use --all to generate all matching voices)');
  }
  console.log('');

  let generated = 0, skipped = 0, errors = 0;

  for (const voiceId of targetIds) {
    process.stdout.write(`  ${voiceId.padEnd(38)}`);
    for (const mode of MODES) {
      const result = await generateSample(client, voiceId, mode, force);
      if (result === 'generated') { process.stdout.write('✓'); generated++; }
      else if (result === 'skipped') { process.stdout.write('·'); skipped++; }
      else { process.stdout.write('✗'); errors++; }
    }
    // Label the mode columns on the first voice only
    if (targetIds.indexOf(voiceId) === 0) {
      process.stdout.write('  ← fam/kid/unf/loc');
    }
    console.log();
  }

  const costEstimate = (generated * 200 / 1_000_000 * 16).toFixed(4);
  console.log(`\n  ${generated} generated · ${skipped} skipped · ${errors} errors`);
  console.log(`  Estimated cost (Chirp3-HD rate): ~$${costEstimate}`);

  await buildHTML(voiceMap);
  console.log('\nNext step: open output/index.html in Chrome or Firefox and pick one voice per mode.');
  console.log('Then run: npx supabase db push  (to apply migration 20260504000012)');
}
