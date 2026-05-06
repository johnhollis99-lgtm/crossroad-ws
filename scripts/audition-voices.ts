/**
 * XRoad Voice Audition CLI
 *
 * Synthesizes mode-appropriate passages through each candidate voice,
 * saves Opus files to scripts/audition-output/{mode}/{voice_id}.opus,
 * and writes chosen voices to the voice_configs Supabase table.
 *
 * Run from scripts/voice-audition/:
 *   pnpm audition --mode=family
 *   pnpm audition --mode=family --voices=en-US-Chirp3-HD-Aoede,en-US-Chirp3-HD-Charon
 *   pnpm audition --commit --mode=family --voice=en-US-Chirp3-HD-Aoede --rate=1.0 --pitch=0
 *   pnpm audition --list
 *   pnpm audition --mode=family --dry-run
 *   pnpm audition --mode=family --force   (regenerate even if .opus already exists)
 */

import { mkdir, writeFile, access } from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import { resolve, join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { registerProvider, generateNarration } from './lib/tts/index.js';
import { GoogleTTSProvider } from './lib/tts/providers/google.js';
import { getAdminClient } from './lib/tts/supabase-admin.js';

// ── Bootstrap ──────────────────────────────────────────────────────────────

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url)); // e.g. …/scripts
const OUTPUT_DIR = join(SCRIPT_DIR, 'audition-output');

// Manual dotenv — avoids package-boundary dependency issues at the scripts/ root.
function loadEnv(): void {
  try {
    const raw = readFileSync(resolve(SCRIPT_DIR, '..', '.env'), 'utf8');
    for (const line of raw.split('\n')) {
      const t = line.trim();
      if (!t || t.startsWith('#')) continue;
      const eq = t.indexOf('=');
      if (eq === -1) continue;
      const k = t.slice(0, eq).trim();
      let v = t.slice(eq + 1).trim();
      if ((v.startsWith('"') && v.endsWith('"')) ||
          (v.startsWith("'") && v.endsWith("'"))) {
        v = v.slice(1, -1);
      }
      if (k && !(k in process.env)) process.env[k] = v;
    }
  } catch { /* rely on environment variables already set */ }
}

// ── Types & constants ──────────────────────────────────────────────────────

type Mode = 'family' | 'kids' | 'unfiltered' | 'local';
const MODES: readonly Mode[] = ['family', 'kids', 'unfiltered', 'local'];

const MODE_DESCRIPTIONS: Record<Mode, string> = {
  family:     'Warm documentary-narrator voice',
  kids:       'Enthusiastic Junior Explorer voice',
  unfiltered: 'Deadpan sardonic narrator',
  local:      'Conversational insider narrator',
};

// ~100-word audition passages, one per mode.
// Each exercises the tonal range the mode requires.
const PASSAGES: Record<Mode, string> = {
  family: `Point Reyes Lighthouse has stood at the edge of the continent for over a hundred and fifty years. Built in 1870, it sits atop one of the foggiest and windiest points on the entire Pacific coast. On the roughest days, the lighthouse keeper had to descend three hundred and eight steps just to reach the lamp. The light itself was a Fresnel lens, hand-ground in Paris, sending a beam visible twenty-four miles out to sea. Today the lighthouse is retired, but it still draws visitors from across the country who come to watch gray whales pass just offshore on their ancient migration south.`,

  kids: `Okay explorers, get ready because what is happening inside a volcano is absolutely bananas in the best way! Deep underground, there is something called magma, which is basically rock so hot it has turned completely into liquid. When magma builds up pressure, imagine squeezing a ketchup packet really really hard, it forces its way up through cracks in the earth and blasts through the surface as lava. And here is the wildest part: as that lava cools down it actually becomes brand new rock. Scientists call it igneous rock, which comes from the Latin word for fire. Volcanoes are literally building new land right before our eyes!`,

  unfiltered: `Welcome to Cabazon, California, home to two enormous concrete dinosaurs that have been standing in the desert since 1964. The Brontosaurus, technically an Apatosaurus but apparently nobody got the memo, houses a gift shop inside its stomach. The Tyrannosaurus contains a small creationism museum, because sure, why not. Originally built by Claude Bell, a former Knott's Berry Farm artist, the dinosaurs have since appeared in Pee-Wee's Big Adventure, which is honestly the career highlight you would expect. Entry is free, which tracks. The surrounding parking lot is massive, as if the owners anticipated crowd sizes they have not, in practice, experienced.`,

  local: `Most people drive straight through Boyle Heights without stopping, which is their loss. If you get off the freeway and walk down Cesar Chavez, you will find the Breed Street Shul, an old synagogue built in 1923 when this neighborhood was entirely Jewish. Then it was not. Then it became something else entirely. The building is still there, beautifully restored, sitting right next to a taqueria. That is kind of the whole story of Boyle Heights in one block. There are murals here that national galleries would pay for, and a bakery on Soto that has been making pan dulce since 1928. Go on a Saturday morning. You will understand.`,
};

const DEFAULT_CANDIDATES: Record<Mode, readonly string[]> = {
  family:     ['en-US-Chirp3-HD-Aoede', 'en-US-Chirp3-HD-Charon', 'en-US-Chirp3-HD-Kore'],
  kids:       ['en-US-Chirp3-HD-Puck', 'en-US-Chirp3-HD-Zephyr', 'en-US-Chirp3-HD-Leda'],
  unfiltered: ['en-US-Chirp3-HD-Fenrir', 'en-US-Chirp3-HD-Orus', 'en-US-Neural2-D'],
  local:      ['en-US-Chirp3-HD-Umbriel', 'en-US-Chirp3-HD-Sulafat', 'en-US-Chirp3-HD-Schedar'],
};

const DEFAULT_RATES: Record<Mode, number> = {
  family:     1.0,
  kids:       1.1,
  unfiltered: 0.95,
  local:      1.0,
};

// HD and Neural2 both billed at $16/M chars; Standard at $4/M
function pricePerChar(voiceId: string): number {
  return (voiceId.includes('Chirp3-HD') || voiceId.includes('Neural2'))
    ? 16 / 1_000_000
    : 4 / 1_000_000;
}

function tierLabel(voiceId: string): string {
  if (voiceId.includes('Chirp3-HD')) return 'chirp3-hd';
  if (voiceId.includes('Neural2'))   return 'neural2';
  return 'standard';
}

function shortName(voiceId: string): string {
  const parts = voiceId.split('-');
  return parts[parts.length - 1] ?? voiceId;
}

// ── Arg parsing ────────────────────────────────────────────────────────────

interface Args {
  mode?: Mode;
  voices?: string[];
  voice?: string;
  rate?: number;
  pitch?: number;
  commit: boolean;
  force: boolean;
  dryRun: boolean;
  list: boolean;
}

function parseArgs(): Args {
  const argv = process.argv.slice(2);
  const flag = (name: string): string | undefined => {
    for (const a of argv) {
      if (a.startsWith(`--${name}=`)) return a.slice(name.length + 3);
    }
    return undefined;
  };
  const bool = (name: string): boolean => argv.includes(`--${name}`);

  const modeRaw  = flag('mode');
  const rateRaw  = flag('rate');
  const pitchRaw = flag('pitch');
  const voicesRaw = flag('voices');

  const mode: Mode | undefined = (MODES as readonly string[]).includes(modeRaw ?? '')
    ? (modeRaw as Mode)
    : undefined;

  return {
    mode,
    voices: voicesRaw ? voicesRaw.split(',').map(v => v.trim()) : undefined,
    voice:  flag('voice'),
    rate:   rateRaw  !== undefined ? parseFloat(rateRaw)  : undefined,
    pitch:  pitchRaw !== undefined ? parseFloat(pitchRaw) : undefined,
    commit: bool('commit'),
    force:  bool('force'),
    dryRun: bool('dry-run'),
    list:   bool('list'),
  };
}

function requireMode(args: Args): Mode {
  if (!args.mode) {
    console.error(`\nError: --mode is required. One of: ${MODES.join(', ')}\n`);
    process.exit(1);
  }
  return args.mode;
}

// ── Utilities ──────────────────────────────────────────────────────────────

async function fileExists(p: string): Promise<boolean> {
  try { await access(p); return true; } catch { return false; }
}

function formatTable(rows: string[][]): string {
  if (rows.length === 0) return '';
  const first = rows[0];
  if (!first) return '';
  const cols = first.length;
  const widths = Array.from({ length: cols }, (_, i) =>
    Math.max(...rows.map(r => (r[i] ?? '').length)),
  );
  return rows
    .map(r => r.map((c, i) => c.padEnd(widths[i] ?? 0)).join('  '))
    .join('\n');
}

// ── Main ───────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  loadEnv();

  const googleProvider = new GoogleTTSProvider();
  registerProvider(googleProvider);

  const args = parseArgs();

  // ── --list ──────────────────────────────────────────────────────────────

  if (args.list) {
    if (!process.env['GOOGLE_APPLICATION_CREDENTIALS']) {
      console.error('\nError: GOOGLE_APPLICATION_CREDENTIALS not set\n');
      process.exit(1);
    }
    const voices = await googleProvider.getAvailableVoices();
    const hd3 = voices.filter(v =>
      v.voiceId.startsWith('en-US-') &&
      (v.voiceId.includes('Chirp3-HD') || v.voiceId.includes('Neural2')),
    );
    const allCandidates = new Set(Object.values(DEFAULT_CANDIDATES).flat());
    const rows: string[][] = [['TIER', 'VOICE ID', 'GENDER', 'DEFAULT CANDIDATE FOR']];
    for (const v of hd3) {
      const modes = MODES.filter(m => DEFAULT_CANDIDATES[m].includes(v.voiceId)).join(', ');
      const star = allCandidates.has(v.voiceId) ? ' ★' : '';
      rows.push([tierLabel(v.voiceId), v.voiceId + star, v.gender, modes]);
    }
    console.log(`\n${formatTable(rows)}`);
    console.log(`\nTotal: ${hd3.length}  (★ = default candidate)\n`);
    return;
  }

  // ── --commit ─────────────────────────────────────────────────────────────

  if (args.commit) {
    const mode  = requireMode(args);
    const voice = args.voice;
    if (!voice) {
      console.error('\nError: --voice=<voice_id> is required for --commit\n');
      process.exit(1);
    }

    const rate  = args.rate  ?? DEFAULT_RATES[mode];
    const pitch = args.pitch ?? 0;
    const db    = getAdminClient();

    // Deactivate any existing active row for this mode
    const { error: deactivateErr } = await db
      .from('voice_configs')
      .update({ is_active: false })
      .eq('mode', mode)
      .eq('is_active', true);

    if (deactivateErr) {
      console.error(`\nFailed to deactivate existing voice: ${deactivateErr.message}\n`);
      process.exit(1);
    }

    // Next version = max existing + 1 (or 1 if no rows yet for this mode)
    const { data: existing } = await db
      .from('voice_configs')
      .select('version')
      .eq('mode', mode)
      .order('version', { ascending: false })
      .limit(1);

    const prevVersion: number =
      (existing?.[0] as { version?: number } | undefined)?.version ?? 0;
    const nextVersion = prevVersion + 1;

    const modeLabel = mode.charAt(0).toUpperCase() + mode.slice(1);

    const { data: inserted, error: insertErr } = await db
      .from('voice_configs')
      .insert({
        mode,
        provider:       'google',
        voice_id:       voice,
        voice_settings: { speakingRate: rate, pitch, volumeGainDb: 0 },
        display_name:   `${modeLabel} — ${shortName(voice)}`,
        description:    MODE_DESCRIPTIONS[mode],
        is_active:      true,
        version:        nextVersion,
      })
      .select()
      .single();

    if (insertErr) {
      console.error(`\nFailed to insert voice_configs row: ${insertErr.message}`);
      if (insertErr.message.includes('does not exist')) {
        console.error('(Has migration 20260504000012 been applied to Supabase?)');
      }
      console.error();
      process.exit(1);
    }

    console.log('\n✓ Committed to voice_configs:\n');
    console.log(JSON.stringify(inserted, null, 2));
    console.log();
    return;
  }

  // ── Generate auditions ──────────────────────────────────────────────────

  if (!process.env['GOOGLE_APPLICATION_CREDENTIALS']) {
    console.error('\nError: GOOGLE_APPLICATION_CREDENTIALS not set.\n');
    process.exit(1);
  }

  const mode         = requireMode(args);
  const targetVoices = args.voices ?? [...DEFAULT_CANDIDATES[mode]];
  const speakingRate = args.rate  ?? DEFAULT_RATES[mode];
  const pitch        = args.pitch ?? 0;
  const passage      = PASSAGES[mode];

  // Cost estimate — count only voices that will actually be generated
  const existingFlags = await Promise.all(
    targetVoices.map(v => fileExists(join(OUTPUT_DIR, mode, `${v}.opus`))),
  );
  const toGenerate = targetVoices.filter((_, i) => args.force || !(existingFlags[i] ?? false));
  const costEstimate = toGenerate.reduce((sum, v) => sum + passage.length * pricePerChar(v), 0);

  console.log(`\nMode         : ${mode}`);
  console.log(`Passage      : ${passage.length} chars`);
  console.log(`Speaking rate: ${speakingRate}  |  Pitch: ${pitch} semitones`);
  console.log(`Candidates   : ${targetVoices.join(', ')}`);
  console.log(`To generate  : ${toGenerate.length} file(s)${args.force ? ' (--force)' : ' (skipping existing)'}`);
  console.log(`Cost estimate: $${costEstimate.toFixed(5)}`);

  if (args.dryRun) {
    console.log('\n[dry-run] Would write:');
    for (const v of targetVoices) {
      const p = join(OUTPUT_DIR, mode, `${v}.opus`);
      const exists = await fileExists(p);
      console.log(`  ${exists && !args.force ? '(skip)' : '(gen) '} ${p}`);
    }
    console.log();
    return;
  }

  await mkdir(join(OUTPUT_DIR, mode), { recursive: true });

  interface Result {
    voiceId: string;
    tier: string;
    rate: number;
    pitch: number;
    path: string;
    status: 'ok' | 'skipped' | 'error';
  }

  const results: Result[] = [];

  for (const voiceId of targetVoices) {
    const outPath = join(OUTPUT_DIR, mode, `${voiceId}.opus`);

    if (!args.force && (await fileExists(outPath))) {
      process.stdout.write(`  ↷ ${voiceId} (skipped)\n`);
      results.push({ voiceId, tier: tierLabel(voiceId), rate: speakingRate, pitch, path: outPath, status: 'skipped' });
      continue;
    }

    process.stdout.write(`  ⟳ ${voiceId} … `);

    const output = await generateNarration({
      text:  passage,
      mode,
      depth: 'ride_along',
      voiceConfigOverride: {
        provider:     'google',
        voiceId,
        speakingRate,
        pitch,
      },
    });

    if (!output) {
      process.stdout.write('✗ failed (generateNarration returned null)\n');
      results.push({ voiceId, tier: tierLabel(voiceId), rate: speakingRate, pitch, path: outPath, status: 'error' });
      continue;
    }

    await writeFile(outPath, output.audioBuffer);
    const kb  = (output.audioBuffer.length / 1024).toFixed(0);
    const sec = (output.durationMs / 1000).toFixed(1);
    process.stdout.write(`✓  ${kb} KB  ~${sec}s  $${output.costUsd.toFixed(5)}\n`);
    results.push({ voiceId, tier: tierLabel(voiceId), rate: speakingRate, pitch, path: outPath, status: 'ok' });
  }

  // Summary table
  console.log('\n');
  const tableRows: string[][] = [
    ['VOICE ID', 'TIER', 'RATE', 'PITCH', 'STATUS', 'FILE'],
    ...results.map(r => [
      r.voiceId, r.tier, String(r.rate), String(r.pitch), r.status, r.path,
    ]),
  ];
  console.log(formatTable(tableRows));

  const generated = results.filter(r => r.status === 'ok').length;
  const skipped   = results.filter(r => r.status === 'skipped').length;
  const errors    = results.filter(r => r.status === 'error').length;
  console.log(`\n${generated} generated · ${skipped} skipped · ${errors} errors`);
  console.log(`Output dir: ${join(OUTPUT_DIR, mode, '')}`);
  console.log('Listen with any OGG/Opus player (Chrome or Firefox for file:// URLs).\n');
  console.log('When ready to commit a pick:');
  console.log(`  pnpm audition --commit --mode=${mode} --voice=<VOICE_ID> [--rate=${speakingRate}] [--pitch=0]\n`);
}

main().catch((err: unknown) => {
  console.error(err);
  process.exit(1);
});
