// Generates production-shape audition cuts for Family mode
// voice selection. Reads two locked paragraphs from
// audition-text/, generates Opus through the curated
// Chirp 3 HD shortlist at two speaking rates, builds a
// blinded HTML comparison page.
//
// Run: npx tsx scripts/voice-audition/audition-family-realistic.ts
// Listen: open scripts/audition-output/family-realistic/index.html
// Commit a winner: pnpm audition --commit --mode=family --voice=<id>
//
// Cost: ~$0.32 Google TTS at HD pricing for ~20k chars total
// across 5 voices × 2 paragraphs × 2 rates. No Claude API calls.
// Cost per llm_calls row uses call_type='tts'; the schema
// CHECK constraint blocks adding a discriminator like
// 'tts_audition', so audition rows are not separable from
// production TTS rows in cost analytics. Future migration
// could add a `purpose` column for filtering.

import { mkdir, writeFile, access, readFile } from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import { resolve, join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
// scripts/lib/tts is a CommonJS package; this script's own package
// (scripts/voice-audition) is "type": "module". Cross-boundary named
// imports return only `default` at runtime under tsx, so we import the
// namespace and pull through `.default` if present.
import type {
  GenerateNarrationOptions,
  TTSOutput,
  VoiceConfig,
  TTSProvider,
} from '../lib/tts/types.js';
import * as _ttsIndex from '../lib/tts/index.js';
import * as _googleModule from '../lib/tts/providers/google.js';

interface TtsIndexExports {
  registerProvider: (p: TTSProvider) => void;
  generateNarration: (opts: GenerateNarrationOptions) => Promise<TTSOutput | null>;
}
interface GoogleProviderExports {
  GoogleTTSProvider: new (config?: VoiceConfig) => TTSProvider;
}

const ttsIndex = ((_ttsIndex as { default?: TtsIndexExports }).default
  ?? (_ttsIndex as unknown as TtsIndexExports));
const googleModule = ((_googleModule as { default?: GoogleProviderExports }).default
  ?? (_googleModule as unknown as GoogleProviderExports));

const { registerProvider, generateNarration } = ttsIndex;
const { GoogleTTSProvider } = googleModule;

// ── Bootstrap ──────────────────────────────────────────────────────────────

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));    // scripts/voice-audition
const REPO_ROOT  = resolve(SCRIPT_DIR, '..', '..');             // project root
const OUTPUT_DIR = join(SCRIPT_DIR, '..', 'audition-output', 'family-realistic');
const TEXT_DIR   = join(SCRIPT_DIR, 'audition-text');

// Manual dotenv — same pattern as audition-voices.ts.
function loadEnv(): void {
  try {
    const raw = readFileSync(resolve(REPO_ROOT, '.env'), 'utf8');
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

// ── Voice shortlist ────────────────────────────────────────────────────────
//
// Hardcoded for reproducibility. List of all en-US Chirp 3 HD voices is
// available via `pnpm audition --list` (in this same folder). Picks below
// deliberately exclude voices already used as DEFAULT_CANDIDATES in
// audition-voices.ts (Aoede/Charon/Kore for family, plus the kids/
// unfiltered/local picks) — this audition is meant to broaden beyond the
// prior curator's defaults, not duplicate them.
//
// Goal: variety across gender, register, and vocal quality so the listener
// has real alternatives, not five takes on the same profile.

interface VoicePick {
  id: string;
  /** One-line note on why this voice is in the shortlist. */
  rationale: string;
}

const VOICES: readonly VoicePick[] = [
  { id: 'en-US-Chirp3-HD-Achernar',     rationale: 'female, bright/clear mid-range — warm doc-narrator alternative to default Aoede' },
  { id: 'en-US-Chirp3-HD-Erinome',      rationale: 'female, gentler/softer register — PBS-style soft documentary voice' },
  { id: 'en-US-Chirp3-HD-Enceladus',    rationale: 'male, deeper baritone — authoritative narrator with weight' },
  { id: 'en-US-Chirp3-HD-Iapetus',      rationale: 'male, conversational mid-range — younger, approachable doc voice' },
  { id: 'en-US-Chirp3-HD-Vindemiatrix', rationale: 'female, measured lower register — Ken-Burns-style storyteller' },
];

interface Paragraph {
  slug: string;
  file: string;
  label: string;
}

const PARAGRAPHS: readonly Paragraph[] = [
  { slug: 'mission',    file: 'family-mission.txt',    label: 'Mission San Juan Capistrano' },
  { slug: 'lighthouse', file: 'family-lighthouse.txt', label: 'Old Point Loma Lighthouse' },
];

// Three rates spanning the documentary-pacing range. Order is ascending so
// the HTML row's audio cells read left-to-right slowest → fastest.
//   0.92 — gentler / slower (added first round)
//   1.0  — natural default
//   1.1  — modestly faster for finalists comparing pace
const RATES: readonly number[] = [0.92, 1.0, 1.1];

const HD_PRICE_PER_CHAR = 16 / 1_000_000;

// ── Utilities ──────────────────────────────────────────────────────────────

async function fileExists(p: string): Promise<boolean> {
  try { await access(p); return true; } catch { return false; }
}

function rateTag(rate: number): string {
  // 1.0 → "rate1.0", 0.92 → "rate0.92"
  // (Number.toString strips trailing zeros, so synthesize ".0" when needed.)
  const s = rate.toString();
  return `rate${s.includes('.') ? s : `${s}.0`}`;
}

function fileNameFor(voiceId: string, paragraphSlug: string, rate: number): string {
  return `${voiceId}__${paragraphSlug}__${rateTag(rate)}.opus`;
}

// ── Main ───────────────────────────────────────────────────────────────────

interface GenResult {
  voiceId: string;
  paragraphSlug: string;
  rate: number;
  fileName: string;
  status: 'ok' | 'skipped' | 'error';
  error?: string;
  costUsd?: number;
}

async function main(): Promise<void> {
  loadEnv();

  if (!process.env['GOOGLE_APPLICATION_CREDENTIALS']) {
    console.error('\nError: GOOGLE_APPLICATION_CREDENTIALS not set in environment or .env\n');
    process.exit(1);
  }

  registerProvider(new GoogleTTSProvider());

  // Read paragraphs.
  const paragraphTexts = new Map<string, string>();
  for (const p of PARAGRAPHS) {
    const fullPath = join(TEXT_DIR, p.file);
    const text = (await readFile(fullPath, 'utf8')).trim();
    if (!text) {
      console.error(`\nError: ${fullPath} is empty\n`);
      process.exit(1);
    }
    paragraphTexts.set(p.slug, text);
  }

  // Print plan.
  console.log('\n━━━ Family voice audition (production-shape) ━━━\n');
  console.log('Voices:');
  for (const v of VOICES) {
    console.log(`  • ${v.id}`);
    console.log(`      ${v.rationale}`);
  }
  console.log('\nParagraphs:');
  for (const p of PARAGRAPHS) {
    const text = paragraphTexts.get(p.slug)!;
    console.log(`  • ${p.label}  (${text.length} chars)  → ${p.slug}`);
  }
  console.log(`\nRates: ${RATES.join(', ')}`);

  await mkdir(OUTPUT_DIR, { recursive: true });

  // Plan and cost estimate (count only files we'll actually generate).
  const plan: Array<{ voice: VoicePick; para: Paragraph; rate: number; outPath: string }> = [];
  for (const voice of VOICES) {
    for (const para of PARAGRAPHS) {
      for (const rate of RATES) {
        const outPath = join(OUTPUT_DIR, fileNameFor(voice.id, para.slug, rate));
        plan.push({ voice, para, rate, outPath });
      }
    }
  }
  const existsFlags = await Promise.all(plan.map(p => fileExists(p.outPath)));
  const toGenerate = plan.filter((_, i) => !(existsFlags[i] ?? false));
  const costEstimate = toGenerate.reduce(
    (sum, p) => sum + (paragraphTexts.get(p.para.slug)?.length ?? 0) * HD_PRICE_PER_CHAR,
    0,
  );

  console.log(`\nTotal cuts:  ${plan.length}`);
  console.log(`To generate: ${toGenerate.length}  (skipping ${plan.length - toGenerate.length} existing)`);
  console.log(`Cost est.:   $${costEstimate.toFixed(4)}\n`);

  // Generate.
  const results: GenResult[] = [];
  for (let i = 0; i < plan.length; i++) {
    const item = plan[i]!;
    const exists = existsFlags[i] ?? false;
    const fileName = fileNameFor(item.voice.id, item.para.slug, item.rate);

    if (exists) {
      process.stdout.write(`  ↷ ${fileName} (skip)\n`);
      results.push({
        voiceId: item.voice.id,
        paragraphSlug: item.para.slug,
        rate: item.rate,
        fileName,
        status: 'skipped',
      });
      continue;
    }

    process.stdout.write(`  ⟳ ${fileName} … `);
    try {
      const text = paragraphTexts.get(item.para.slug)!;
      const output = await generateNarration({
        text,
        mode: 'driving',
        depth: 'ride_along',
        voiceConfigOverride: {
          provider: 'google',
          voiceId: item.voice.id,
          speakingRate: item.rate,
          pitch: 0,
        },
      });

      if (!output) {
        process.stdout.write('✗ failed (generateNarration returned null)\n');
        results.push({
          voiceId: item.voice.id,
          paragraphSlug: item.para.slug,
          rate: item.rate,
          fileName,
          status: 'error',
          error: 'generateNarration returned null after retries',
        });
        continue;
      }

      await writeFile(item.outPath, output.audioBuffer);
      const kb  = (output.audioBuffer.length / 1024).toFixed(0);
      const sec = (output.durationMs / 1000).toFixed(1);
      process.stdout.write(`✓  ${kb} KB  ~${sec}s  $${output.costUsd.toFixed(5)}\n`);
      results.push({
        voiceId: item.voice.id,
        paragraphSlug: item.para.slug,
        rate: item.rate,
        fileName,
        status: 'ok',
        costUsd: output.costUsd,
      });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      process.stdout.write(`✗ ${msg}\n`);
      results.push({
        voiceId: item.voice.id,
        paragraphSlug: item.para.slug,
        rate: item.rate,
        fileName,
        status: 'error',
        error: msg,
      });
    }
  }

  // Per-voice success summary so a single bad voice doesn't kill HTML output.
  console.log('\n━━━ Per-voice summary ━━━');
  for (const v of VOICES) {
    const rows = results.filter(r => r.voiceId === v.id);
    const ok      = rows.filter(r => r.status === 'ok').length;
    const skipped = rows.filter(r => r.status === 'skipped').length;
    const errs    = rows.filter(r => r.status === 'error').length;
    const errSuffix = errs > 0 ? `  (${errs} failed)` : '';
    console.log(`  ${v.id}: ${ok} generated · ${skipped} skipped · ${errs} errors${errSuffix}`);
  }
  const totalCost = results.reduce((sum, r) => sum + (r.costUsd ?? 0), 0);
  console.log(`\nTotal new cost: $${totalCost.toFixed(5)}`);

  // Build HTML page from voices that have all 4 files (some via skip, some via ok).
  // A voice with any 'error' for any of its 4 files is still included if other
  // cuts exist — we still want to compare the cuts that did succeed.
  const voicesWithAnyAudio = VOICES.filter(v =>
    results.some(r => r.voiceId === v.id && (r.status === 'ok' || r.status === 'skipped')),
  );

  const htmlPath = join(OUTPUT_DIR, 'index.html');
  await writeFile(htmlPath, buildHtml(voicesWithAnyAudio, results));

  console.log(`\n✓ HTML written to: ${htmlPath}`);
  console.log('\nListen with Chrome or Firefox (Safari does not support OGG/Opus).');
  console.log('When ready to commit a pick:');
  console.log('  cd scripts/voice-audition');
  console.log('  pnpm audition --commit --mode=family --voice=<VOICE_ID> [--rate=1.0]\n');
}

// ── HTML generation ────────────────────────────────────────────────────────

function buildHtml(voices: readonly VoicePick[], results: readonly GenResult[]): string {
  // For each voice, gather the four expected files (status: ok/skipped → playable).
  type VoiceData = {
    id: string;
    rationale: string;
    cuts: Record<string, { fileName: string; available: boolean }>;
  };

  const voiceData: VoiceData[] = voices.map(v => {
    const cuts: VoiceData['cuts'] = {};
    for (const para of PARAGRAPHS) {
      for (const rate of RATES) {
        const key = `${para.slug}_${rate}`;
        const fileName = fileNameFor(v.id, para.slug, rate);
        const r = results.find(x =>
          x.voiceId === v.id && x.paragraphSlug === para.slug && x.rate === rate,
        );
        const available = r ? (r.status === 'ok' || r.status === 'skipped') : false;
        cuts[key] = { fileName, available };
      }
    }
    return { id: v.id, rationale: v.rationale, cuts };
  });

  // Cell labels (in fixed order — randomization is row-order, not cell-order).
  const cellOrder: Array<{ key: string; label: string; paraSlug: string; rate: number }> = [];
  for (const para of PARAGRAPHS) {
    for (const rate of RATES) {
      const rateStr = rate.toString().includes('.') ? rate.toString() : `${rate}.0`;
      cellOrder.push({
        key: `${para.slug}_${rate}`,
        label: `${para.label} — ${rateStr}×`,
        paraSlug: para.slug,
        rate,
      });
    }
  }

  // Inject as JSON for the page-side JS.
  // Escape `</` so the literal '</script>' can never appear inside this string
  // and prematurely close the surrounding <script> block.
  const dataJson = JSON.stringify({ voices: voiceData, cellOrder }, null, 2)
    .replace(/<\//g, '<\\/');

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Family Voice Audition — Realistic</title>
<style>
  :root {
    --bg: #1a1a1a;
    --bg-row: #242424;
    --bg-row-alt: #2a2a2a;
    --fg: #e8e8e8;
    --fg-muted: #999;
    --accent: #2EC4B6;
    --border: #333;
    --warn: #c66;
  }
  * { box-sizing: border-box; }
  body {
    margin: 0; padding: 0;
    background: var(--bg); color: var(--fg);
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif;
    line-height: 1.5;
  }
  header {
    padding: 20px 24px;
    border-bottom: 1px solid var(--border);
    position: sticky; top: 0; z-index: 10;
    background: var(--bg);
  }
  header h1 {
    margin: 0 0 8px 0;
    font-size: 22px;
    font-weight: 600;
  }
  header h1 .accent { color: var(--accent); }
  .controls {
    display: flex; gap: 12px; align-items: center; flex-wrap: wrap;
    font-size: 13px; color: var(--fg-muted);
  }
  .controls button {
    background: var(--bg-row); color: var(--fg); border: 1px solid var(--border);
    padding: 6px 12px; border-radius: 4px; cursor: pointer; font-size: 13px;
  }
  .controls button:hover { background: var(--bg-row-alt); }
  .seed-info { margin-left: auto; font-size: 12px; }
  main { padding: 24px; max-width: 1200px; margin: 0 auto; }
  #summary {
    margin-bottom: 32px; padding: 16px;
    background: var(--bg-row); border: 1px solid var(--border); border-radius: 6px;
  }
  #summary h2 {
    margin: 0 0 12px 0; font-size: 14px; font-weight: 600;
    text-transform: uppercase; letter-spacing: 0.5px; color: var(--fg-muted);
  }
  #summaryContent { font-size: 13px; }
  #summaryContent .empty { color: var(--fg-muted); font-style: italic; }
  #summaryContent .summary-entry {
    padding: 8px 0; border-bottom: 1px solid var(--border);
  }
  #summaryContent .summary-entry:last-child { border-bottom: 0; }
  #summaryContent .summary-label {
    font-weight: 600; color: var(--accent); margin-right: 8px;
  }
  .voice-row {
    background: var(--bg-row);
    border: 1px solid var(--border); border-radius: 6px;
    margin-bottom: 16px; padding: 16px;
  }
  .voice-header {
    display: flex; justify-content: space-between; align-items: baseline;
    margin-bottom: 12px;
  }
  .voice-label {
    font-size: 18px; font-weight: 600; color: var(--accent);
  }
  .voice-rationale {
    font-size: 12px; color: var(--fg-muted); font-style: italic;
    display: none;  /* hidden until reveal */
  }
  .voice-rationale.revealed { display: inline; }
  .cuts {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(260px, 1fr));
    gap: 12px;
    margin-bottom: 12px;
  }
  .cut {
    background: var(--bg-row-alt); padding: 10px; border-radius: 4px;
  }
  .cut-label {
    font-size: 12px; color: var(--fg-muted);
    text-transform: uppercase; letter-spacing: 0.5px;
    margin-bottom: 6px;
  }
  .cut audio { width: 100%; }
  .cut.unavailable {
    color: var(--warn); font-size: 13px;
    padding: 16px 10px; text-align: center;
  }
  .notes-area {
    width: 100%; background: var(--bg); color: var(--fg);
    border: 1px solid var(--border); border-radius: 4px;
    padding: 8px; font-family: inherit; font-size: 13px;
    resize: vertical; min-height: 60px;
  }
  .notes-area:focus { outline: 1px solid var(--accent); border-color: var(--accent); }
  @media (max-width: 600px) {
    main { padding: 12px; }
    header { padding: 12px; }
    .cuts { grid-template-columns: 1fr; }
  }
</style>
</head>
<body>
<header>
  <h1><span class="accent">X</span>Road · Family voice audition</h1>
  <div class="controls">
    <button id="reveal-btn">Reveal voice IDs</button>
    <button id="clear-btn">Clear all notes</button>
    <span class="seed-info">Row order seeded by date — refresh to keep order; new day reshuffles.</span>
  </div>
</header>

<main>
  <section id="summary">
    <h2>Notes summary</h2>
    <div id="summaryContent"><span class="empty">Notes you write below will aggregate here.</span></div>
  </section>

  <div id="voices"></div>
</main>

<script>
const DATA = ${dataJson};
const STORAGE_PREFIX = 'audition-notes-family-realistic-voice-';

// FNV-1a hash → 32-bit seed
function hash32(str) {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

// Mulberry32 PRNG
function mulberry32(seed) {
  return function() {
    let t = seed += 0x6D2B79F5;
    t = Math.imul(t ^ t >>> 15, t | 1);
    t ^= t + Math.imul(t ^ t >>> 7, t | 61);
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}

function shuffle(arr, rng) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    const tmp = a[i]; a[i] = a[j]; a[j] = tmp;
  }
  return a;
}

function blindLabel(i) {
  return 'Voice ' + String.fromCharCode(65 + i);  // A, B, C, ...
}

const today = new Date().toISOString().slice(0, 10);
const seed  = hash32(today);
const rng   = mulberry32(seed);
const order = shuffle(DATA.voices.map((_, i) => i), rng);

let revealed = false;

function render() {
  const root = document.getElementById('voices');
  root.innerHTML = '';

  order.forEach((origIdx, displayIdx) => {
    const voice = DATA.voices[origIdx];
    const blindKey = blindLabel(displayIdx);
    const storageKey = STORAGE_PREFIX + blindKey.replace(/\\s+/g, '-').toLowerCase();

    const row = document.createElement('div');
    row.className = 'voice-row';

    // Header
    const header = document.createElement('div');
    header.className = 'voice-header';
    const label = document.createElement('div');
    label.className = 'voice-label';
    label.textContent = revealed ? voice.id : blindKey;
    const rationale = document.createElement('div');
    rationale.className = 'voice-rationale' + (revealed ? ' revealed' : '');
    rationale.textContent = voice.rationale;
    header.appendChild(label);
    header.appendChild(rationale);
    row.appendChild(header);

    // Cuts grid
    const cuts = document.createElement('div');
    cuts.className = 'cuts';
    DATA.cellOrder.forEach(cell => {
      const cutDiv = document.createElement('div');
      cutDiv.className = 'cut';
      const cl = document.createElement('div');
      cl.className = 'cut-label';
      cl.textContent = cell.label;
      cutDiv.appendChild(cl);

      const cutMeta = voice.cuts[cell.key];
      if (cutMeta && cutMeta.available) {
        const audio = document.createElement('audio');
        audio.controls = true;
        audio.preload = 'none';
        audio.src = cutMeta.fileName;
        cutDiv.appendChild(audio);
      } else {
        cutDiv.classList.add('unavailable');
        cutDiv.textContent = '(generation failed)';
      }
      cuts.appendChild(cutDiv);
    });
    row.appendChild(cuts);

    // Notes textarea
    const notes = document.createElement('textarea');
    notes.className = 'notes-area';
    notes.placeholder = 'Your notes on ' + blindKey + '...';
    notes.value = localStorage.getItem(storageKey) || '';
    notes.addEventListener('input', () => {
      localStorage.setItem(storageKey, notes.value);
      renderSummary();
    });
    row.appendChild(notes);

    root.appendChild(row);
  });

  renderSummary();
}

function renderSummary() {
  const root = document.getElementById('summaryContent');
  const entries = [];
  order.forEach((origIdx, displayIdx) => {
    const voice = DATA.voices[origIdx];
    const blindKey = blindLabel(displayIdx);
    const storageKey = STORAGE_PREFIX + blindKey.replace(/\\s+/g, '-').toLowerCase();
    const note = localStorage.getItem(storageKey);
    if (note && note.trim()) {
      const labelText = revealed ? (blindKey + ' = ' + voice.id) : blindKey;
      entries.push({ label: labelText, body: note.trim() });
    }
  });
  if (entries.length === 0) {
    root.innerHTML = '<span class="empty">Notes you write below will aggregate here.</span>';
    return;
  }
  root.innerHTML = entries.map(e =>
    '<div class="summary-entry"><span class="summary-label">' +
    escapeHtml(e.label) + '</span>' + escapeHtml(e.body) + '</div>'
  ).join('');
}

function escapeHtml(s) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
          .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

document.getElementById('reveal-btn').addEventListener('click', () => {
  revealed = !revealed;
  document.getElementById('reveal-btn').textContent =
    revealed ? 'Hide voice IDs' : 'Reveal voice IDs';
  render();
});

document.getElementById('clear-btn').addEventListener('click', () => {
  if (!confirm('Clear all listener notes from this page? This cannot be undone.')) return;
  for (let i = 0; i < DATA.voices.length; i++) {
    const blindKey = blindLabel(i);
    localStorage.removeItem(STORAGE_PREFIX + blindKey.replace(/\\s+/g, '-').toLowerCase());
  }
  render();
});

render();
</script>
</body>
</html>
`;
}

main().catch((err: unknown) => {
  console.error(err);
  process.exit(1);
});
