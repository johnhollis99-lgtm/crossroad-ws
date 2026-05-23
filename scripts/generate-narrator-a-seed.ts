/**
 * scripts/generate-narrator-a-seed.ts
 *
 * Migration Batch 2 / Track E (2026-05-22) — narrator_a seed generation.
 *
 * Generates narrator_a × standard-depth audio for soul-doctrine POIs along
 * the LA → Mammoth demo route. Pipeline-wise this delegates the heavy
 * lifting to the existing `/api/narration/generate` route (Move 3b.2 +
 * later Track C wiring): one POST per POI gets Haiku-text + Google TTS
 * + Storage upload + narration_audio row in one round-trip.
 *
 * Selection (per the curator's Track E spec):
 *   - within 1km of the LA-Mammoth simulator route polyline
 *   - merged_into IS NULL
 *   - confidence_score >= 0.5 (drive-by surface)
 *   - significance_score >= 75
 *   - intrinsic_depth IN ('brief', 'standard', 'long')
 *   - iconic_local = TRUE OR category.slug IN (
 *       'geology', 'nature', 'history', 'native_history',
 *       'volcanic', 'hot_springs', 'viewpoint'
 *     )
 *   - NOT EXISTS narration_audio at narrator_slug='narrator_a',
 *                                  status='ready'
 *   - LIMIT 30, ORDER BY significance_score DESC
 *
 * Budget: $5 lifetime cap. After each successful generation, sum
 * `llm_calls.cost_usd` for rows created since the script start; bail
 * if the running total exceeds $5.
 *
 * Run (from project root) — STAGED, DO NOT RUN until curator greenlight:
 *   npx tsx scripts/generate-narrator-a-seed.ts                # dry-run (default)
 *   npx tsx scripts/generate-narrator-a-seed.ts --live         # actually generate
 *
 * Output: markdown report at
 *   scripts/cache/narrator-a-seed-<ISO-timestamp>.md
 * with the POIs generated, POIs failed, total cost, and 3 sample audio URLs.
 *
 * Pre-requisites for --live:
 *   * Server running on EXPO_PUBLIC_SERVER_URL or 'http://localhost:3001'
 *     (the route fetches POI fields itself + resolves voice from voice_configs).
 *   * voice_configs has an is_active row for narrator_slug='narrator_a'
 *     at voice_slot=1 (per Batch 1 Migration 2 backfill: Iapetus).
 *   * ANTHROPIC_API_KEY + GOOGLE_APPLICATION_CREDENTIALS in root .env
 *     (read by the server, not by this script).
 */

import { mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Client } from 'pg';

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const ENV_PATH = resolve(SCRIPT_DIR, '..', '.env');
const CACHE_DIR = resolve(SCRIPT_DIR, 'cache');

// ── Config ────────────────────────────────────────────────────────────────
const NARRATOR_SLUG = 'narrator_a';
const DEPTH = 'standard';
const TRIP_MODE = 'driving';
const ROUTE_BUFFER_M = 1000;
const SIGNIFICANCE_FLOOR = 75;
const POI_LIMIT = 30;
const INTER_CALL_PAUSE_MS = 500;
const BUDGET_CEILING_USD = 5.00;
const SOUL_CATEGORY_SLUGS = [
  'geology', 'nature', 'history', 'native_history',
  'volcanic', 'hot_springs', 'viewpoint',
];

// LA → Mammoth route polyline, copied verbatim from
// scripts/simulate-trip/routes.ts LA_MAMMOTH.waypoints (20 waypoints).
// Inlined here so this script stays self-contained — no cross-package
// import (simulate-trip is its own pnpm workspace with its own deps).
const LA_MAMMOTH_WAYPOINTS: Array<{ lat: number; lon: number; label: string }> = [
  { lat: 34.0522, lon: -118.2437, label: 'Downtown LA' },
  { lat: 34.1840, lon: -118.3260, label: 'I-5 / Burbank' },
  { lat: 34.3061, lon: -118.4501, label: 'Sylmar' },
  { lat: 34.3650, lon: -118.5050, label: 'I-5 / CA-14 split (Newhall Pass)' },
  { lat: 34.4700, lon: -118.1968, label: 'Acton (CA-14)' },
  { lat: 34.5794, lon: -118.1165, label: 'Palmdale' },
  { lat: 34.6868, lon: -118.1542, label: 'Lancaster' },
  { lat: 35.0525, lon: -118.1739, label: 'Mojave (CA-14/US-58 jct)' },
  { lat: 35.4660, lon: -117.9080, label: 'Red Rock Canyon SP area' },
  { lat: 35.6481, lon: -117.8211, label: 'Inyokern (CA-14 → US-395)' },
  { lat: 35.7600, lon: -117.8800, label: 'Pearsonville' },
  { lat: 36.2880, lon: -118.0011, label: 'Olancha' },
  { lat: 36.6063, lon: -118.0593, label: 'Lone Pine' },
  { lat: 36.8027, lon: -118.2003, label: 'Independence' },
  { lat: 37.1652, lon: -118.2916, label: 'Big Pine' },
  { lat: 37.3635, lon: -118.3953, label: 'Bishop' },
  { lat: 37.5650, lon: -118.6700, label: "Tom's Place" },
  { lat: 37.6500, lon: -118.7400, label: 'Crowley Lake' },
  { lat: 37.6485, lon: -118.9712, label: 'US-395 / CA-203 (Mammoth jct)' },
  { lat: 37.6485, lon: -118.9721, label: 'Mammoth Lakes' },
];

const SERVER_URL = process.env['EXPO_PUBLIC_SERVER_URL'] ?? 'http://localhost:3001';

// ── dotenv loader (matches the precache scripts' conventional pattern) ───
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

// ── Types ────────────────────────────────────────────────────────────────
interface PoiRow {
  id: string;
  name: string;
  significance_score: number;
  category_slug: string | null;
  iconic_local: boolean;
}

interface Args {
  live: boolean;
}

interface GenerateResponse {
  audio_url: string;
}

// ── Helpers ──────────────────────────────────────────────────────────────
function fail(msg: string): never {
  console.error(`FATAL: ${msg}`);
  process.exit(1);
}

async function sleep(ms: number): Promise<void> {
  return new Promise(r => setTimeout(r, ms));
}

function parseArgs(): Args {
  const argv = process.argv.slice(2);
  return { live: argv.includes('--live') };
}

function buildRouteWkt(): string {
  const coords = LA_MAMMOTH_WAYPOINTS
    .map(w => `${w.lon} ${w.lat}`)
    .join(',');
  return `SRID=4326;LINESTRING(${coords})`;
}

// ── Main ─────────────────────────────────────────────────────────────────
async function main(): Promise<void> {
  const args = parseArgs();
  const startedAt = new Date();
  const startedIso = startedAt.toISOString();

  console.log('=== narrator_a seed generation — LA → Mammoth corridor ===');
  console.log(`  Mode: ${args.live ? 'LIVE (will call /api/narration/generate)' : 'DRY-RUN'}`);
  console.log(`  Route: LA-Mammoth, ${LA_MAMMOTH_WAYPOINTS.length} waypoints`);
  console.log(`  Buffer: ${ROUTE_BUFFER_M}m (~0.6mi each side of the polyline)`);
  console.log(`  Floor:  significance_score >= ${SIGNIFICANCE_FLOOR}`);
  console.log(`  Depth filter: intrinsic_depth IN (brief, standard, long)`);
  console.log(`  Category soul-doctrine list: ${SOUL_CATEGORY_SLUGS.join(', ')}`);
  console.log(`  Excludes: POIs already with narrator_a status=ready`);
  console.log(`  Limit:  ${POI_LIMIT}`);
  console.log(`  Budget cap: $${BUDGET_CEILING_USD.toFixed(2)} total Claude+TTS`);
  console.log(`  Server: ${SERVER_URL}`);
  console.log('');

  // Env preflight
  const DATABASE_URL = process.env['DATABASE_URL'];
  if (!DATABASE_URL) fail('DATABASE_URL not set in .env (direct connection string required for geography queries)');

  // Direct pg connection — PostgREST cannot read the geography `location` column.
  const pg = new Client({ connectionString: DATABASE_URL });
  await pg.connect();

  const routeWkt = buildRouteWkt();

  // ── 1. Selection query ────────────────────────────────────────────────
  // Mirrors the COUNT query the curator validated at $count=8 against the
  // current catalog. ORDER BY significance_score DESC; LIMIT POI_LIMIT.
  const selectSql = `
    SELECT
      p.id::text                          AS id,
      p.name                              AS name,
      p.significance_score                AS significance_score,
      c.slug                              AS category_slug,
      p.iconic_local                      AS iconic_local
    FROM public.pois p
    LEFT JOIN public.poi_categories c ON c.id = p.category_id
    WHERE p.merged_into IS NULL
      AND p.confidence_score >= 0.5
      AND p.significance_score >= $1
      AND p.intrinsic_depth IN ('brief', 'standard', 'long')
      AND (p.iconic_local = TRUE OR c.slug = ANY($2))
      AND ST_DWithin(p.location, ST_GeogFromText($3), $4)
      AND NOT EXISTS (
        SELECT 1
          FROM public.narration_audio na
         WHERE na.poi_id = p.id
           AND na.narrator_slug = $5
           AND na.status = 'ready'
      )
    ORDER BY p.significance_score DESC, p.name ASC
    LIMIT $6
  `;
  const { rows: rawPois } = await pg.query<PoiRow>(selectSql, [
    SIGNIFICANCE_FLOOR,
    SOUL_CATEGORY_SLUGS,
    routeWkt,
    ROUTE_BUFFER_M,
    NARRATOR_SLUG,
    POI_LIMIT,
  ]);

  console.log(`  POIs in scope: ${rawPois.length}`);
  console.log('');
  console.log('  === First 10 in scope ===');
  for (const p of rawPois.slice(0, 10)) {
    const iconic = p.iconic_local ? ' [iconic]' : '';
    console.log(`    ${String(p.significance_score).padStart(3)}  ${(p.category_slug ?? '—').padEnd(16)} ${p.name}${iconic}`);
  }
  if (rawPois.length > 10) console.log(`    ... and ${rawPois.length - 10} more`);
  console.log('');

  // Rough cost estimate — calibrated from CLAUDE.md "Per-narration cost averages
  // ~$0.053" (catalog v1 closing total of $15.64 / 295 narrations) but the
  // per-call numbers from the curated POI runs ran ~$0.022 (Haiku + TTS;
  // see precache-curated-pois.ts EST_COST_PER_POI). Use the precache figure
  // as the dry-run baseline since the route shape is identical here.
  const estPerPoi = 0.022;
  const estTotal = rawPois.length * estPerPoi;
  console.log(`  Estimated spend: $${estTotal.toFixed(4)} (~$${estPerPoi.toFixed(3)} × ${rawPois.length})`);
  console.log(`  Budget headroom: $${(BUDGET_CEILING_USD - estTotal).toFixed(2)} remaining at ceiling`);
  console.log('');

  if (!args.live) {
    console.log('  Dry-run only. Pass --live to actually generate.');
    await pg.end();
    return;
  }

  if (estTotal > BUDGET_CEILING_USD) {
    fail(`projected spend $${estTotal.toFixed(2)} exceeds $${BUDGET_CEILING_USD} cap before any API call`);
  }

  // ── 2. LIVE generation loop ───────────────────────────────────────────
  const stats = {
    generated: 0,
    failed: 0,
    bailedOnBudget: false,
    runningCost: 0,
  };
  const results: Array<{ poi: PoiRow; audioUrl: string }> = [];
  const failures: Array<{ poi: PoiRow; reason: string }> = [];

  console.log('=== Generation loop ===');
  for (let i = 0; i < rawPois.length; i++) {
    const poi = rawPois[i]!;
    const label = `[${String(i + 1).padStart(2)}/${rawPois.length}] ${poi.name.slice(0, 38).padEnd(38)} sig=${poi.significance_score}`;
    process.stdout.write(`  ${label} `);

    try {
      // Delegate to the server's /api/narration/generate route. The route
      // resolves voice + writes Storage + narration_audio + narration_cache
      // + llm_calls itself; this script just orchestrates the per-POI calls
      // and budgets across them.
      const res = await fetch(`${SERVER_URL}/api/narration/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          poi_id:        poi.id,
          mode:          TRIP_MODE,
          depth:         DEPTH,
          narrator_slug: NARRATOR_SLUG,
        }),
      });
      if (!res.ok) {
        const errText = await res.text().catch(() => '');
        throw new Error(`HTTP ${res.status}: ${errText.slice(0, 200)}`);
      }
      const { audio_url } = (await res.json()) as GenerateResponse;
      if (!audio_url) throw new Error('server returned no audio_url');

      stats.generated++;
      results.push({ poi, audioUrl: audio_url });
      console.log(`OK ${audio_url.slice(audio_url.lastIndexOf('/') + 1, audio_url.lastIndexOf('/') + 28)}…`);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      stats.failed++;
      failures.push({ poi, reason: msg });
      console.log(`FAIL ${msg.slice(0, 60)}`);
    }

    // Budget check — sum llm_calls.cost_usd for everything since script start.
    // Costs are logged by the server's narration route on Claude+TTS return,
    // so by now this query reflects everything we've spent (including the
    // current iteration's failed attempts since the route logs even on
    // generation failure).
    const { rows: costRows } = await pg.query<{ sum: string | null }>(
      `SELECT COALESCE(SUM(cost_usd), 0)::text AS sum
         FROM public.llm_calls
        WHERE created_at >= $1`,
      [startedIso],
    );
    stats.runningCost = Number(costRows[0]?.sum ?? '0');
    if (stats.runningCost > BUDGET_CEILING_USD) {
      console.log('');
      console.log(`  BUDGET BAIL: running cost $${stats.runningCost.toFixed(4)} > cap $${BUDGET_CEILING_USD}`);
      stats.bailedOnBudget = true;
      break;
    }

    if (i < rawPois.length - 1) await sleep(INTER_CALL_PAUSE_MS);
  }

  await pg.end();

  // ── 3. Markdown report ─────────────────────────────────────────────────
  mkdirSync(CACHE_DIR, { recursive: true });
  const reportPath = resolve(
    CACHE_DIR,
    `narrator-a-seed-${startedIso.replace(/[:]/g, '-')}.md`,
  );

  const samples = results.slice(0, 3);
  const md = [
    `# narrator_a seed run — ${startedIso}`,
    '',
    `Route: LA → Mammoth (${LA_MAMMOTH_WAYPOINTS.length} waypoints; ${ROUTE_BUFFER_M}m buffer)`,
    '',
    '## Stats',
    '',
    `- POIs in scope: ${rawPois.length}`,
    `- Generated: ${stats.generated}`,
    `- Failed: ${stats.failed}`,
    `- Running cost (llm_calls sum since start): $${stats.runningCost.toFixed(4)} / $${BUDGET_CEILING_USD.toFixed(2)} cap`,
    stats.bailedOnBudget ? '- **Bailed on budget cap.**' : '',
    '',
    '## Generated',
    '',
    ...results.map(r => `- [${r.poi.significance_score}] **${r.poi.name}** (${r.poi.category_slug ?? '—'}) — ${r.audioUrl}`),
    '',
    '## Failed',
    '',
    ...(failures.length > 0
      ? failures.map(f => `- **${f.poi.name}** — ${f.reason}`)
      : ['(none)']),
    '',
    '## Sample audio URLs (first 3)',
    '',
    ...samples.map(s => `- ${s.poi.name}: ${s.audioUrl}`),
    '',
  ].join('\n');

  writeFileSync(reportPath, md);

  console.log('');
  console.log('=== SUMMARY ===');
  console.log(`  Generated: ${stats.generated}`);
  console.log(`  Failed:    ${stats.failed}`);
  console.log(`  Running cost: $${stats.runningCost.toFixed(4)}`);
  console.log(`  Bailed on budget: ${stats.bailedOnBudget ? 'YES' : 'no'}`);
  console.log(`  Report: ${reportPath}`);
}

main().catch((err: unknown) => {
  const msg = err instanceof Error ? err.message : String(err);
  console.error(`FATAL: ${msg}`);
  process.exit(1);
});
