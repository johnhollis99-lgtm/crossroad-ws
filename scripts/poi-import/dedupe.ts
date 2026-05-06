#!/usr/bin/env node
/**
 * Spatial deduplication pass — run after all sources are imported.
 *
 * Algorithm:
 *   1. Load all active POIs (merged_into IS NULL) from DB.
 *   2. Build an in-memory spatial grid; find candidate pairs within 50 m.
 *   3. Confirm pairs by name similarity (token-set, Levenshtein, substring).
 *   4. Merge: lower-priority source is soft-deleted via merged_into; primary
 *      gains additional_sources entry, best description, significance boost.
 *
 * Usage:
 *   npx tsx dedupe.ts [--dry-run] [--county <name>] [--limit <n>] [--cache-dir <path>]
 */
import 'dotenv/config';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Command } from 'commander';
import chalk from 'chalk';
import { getAdminClient } from './lib/supabase.js';
import {
  normalizeName,
  tokenSetRatio,
  levenshteinRatio,
  haversineMeters,
} from './lib/dedupe.js';

// ---- Config -----------------------------------------------------------------

const USER_AGENT  = 'XRoad-POI-Import/0.1 (johnhollis99@gmail.com)';
const PROXIMITY_M = 50;    // spatial candidate threshold
const GRID_DEG    = 0.001; // ~111 m grid cells; 50 m pairs are always in adjacent cells
const PAGE_SIZE   = 2000;  // DB read page size
const WRITE_CONCURRENCY = 50; // parallel DB writes per batch

// ---- Source priority (higher number = preferred primary in merge) -----------

const SOURCE_PRIORITY: Record<string, number> = {
  editorial:          10,
  state_landmark:      9,
  nrhp:                8,
  wikidata:            7,
  osm:                 6,
  gnis:                5,
  narrative_extracted: 4,
  user_contributed:    3,
};

function priority(sourceType: string): number {
  return SOURCE_PRIORITY[sourceType] ?? 0;
}

// ---- Types ------------------------------------------------------------------

interface ActivePoi {
  id:                 string;
  name:               string;
  source_type:        string;
  source_id:          string;
  lat:                number;
  lng:                number;
  significance_score: number;
  description:        string | null;
  verified:           boolean;
  additional_sources: string[];
}

interface MergeGroup {
  primary:     ActivePoi;
  secondaries: ActivePoi[];
}

interface ConfirmedPair {
  primary:   ActivePoi;
  secondary: ActivePoi;
  distanceM: number;
  reason:    string;
}

// ---- Geom parser ------------------------------------------------------------
// PostgREST returns geography::text as EWKT "SRID=4326;POINT(lng lat)".
// Fall back to GeoJSON object or EWKB hex for older PostgREST versions.

function parseGeom(raw: unknown): { lat: number; lng: number } | null {
  if (typeof raw === 'string') {
    // WKT / EWKT: POINT(lng lat)
    const m = /POINT\s*\(\s*([\d.+-]+)\s+([\d.+-]+)\s*\)/i.exec(raw);
    if (m) return { lng: parseFloat(m[1]!), lat: parseFloat(m[2]!) };

    // EWKB hex (little-endian, with SRID flag): at least 50 hex chars for a 2D point
    if (/^[0-9a-fA-F]{50,}$/.test(raw)) {
      try {
        const buf     = Buffer.from(raw, 'hex');
        const hasSRID = !!(buf.readUInt32LE(1) & 0x20000000);
        const offset  = 5 + (hasSRID ? 4 : 0);
        const lng     = buf.readDoubleLE(offset);
        const lat     = buf.readDoubleLE(offset + 8);
        if (isFinite(lat) && isFinite(lng)) return { lat, lng };
      } catch { /* fall through */ }
    }
  }

  // GeoJSON object
  if (typeof raw === 'object' && raw !== null) {
    const geo = raw as { type?: string; coordinates?: number[] };
    if (geo.type === 'Point' && Array.isArray(geo.coordinates) && geo.coordinates.length >= 2) {
      return { lng: geo.coordinates[0]!, lat: geo.coordinates[1]! };
    }
  }

  return null;
}

// ---- DB read ----------------------------------------------------------------

async function fetchAllActivePois(
  bbox?: { minLat: number; maxLat: number; minLon: number; maxLon: number },
): Promise<ActivePoi[]> {
  const supabase = getAdminClient();
  const pois: ActivePoi[] = [];
  let page  = 0;
  let total = 0;

  process.stdout.write(chalk.cyan('[dedupe] loading POIs…'));

  for (;;) {
    const { data, error } = await supabase
      .from('pois')
      // geom::text triggers PostgREST's column-cast to return EWKT instead of binary
      .select('id, name, source_type, source_id, significance_score, description, verified, additional_sources, geom::text')
      .is('merged_into', null)
      .range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1)
      .order('id');

    if (error) throw new Error(`fetch page ${page}: ${error.message}`);
    if (!data || data.length === 0) break;

    for (const row of data) {
      const r      = row as Record<string, unknown>;
      const coords = parseGeom(r['geom']);
      if (!coords) continue;

      if (bbox) {
        const { minLat, maxLat, minLon, maxLon } = bbox;
        if (
          coords.lat < minLat || coords.lat > maxLat ||
          coords.lng < minLon || coords.lng > maxLon
        ) continue;
      }

      pois.push({
        id:                 String(r['id']),
        name:               String(r['name']),
        source_type:        String(r['source_type']),
        source_id:          String(r['source_id']),
        lat:                coords.lat,
        lng:                coords.lng,
        significance_score: Number(r['significance_score']),
        description:        (r['description'] as string | null) ?? null,
        verified:           Boolean(r['verified']),
        additional_sources: (r['additional_sources'] as string[] | null) ?? [],
      });
    }

    total += data.length;
    process.stdout.write('.');
    page++;
    if (data.length < PAGE_SIZE) break;
  }

  console.log(` ${pois.length.toLocaleString()} active POIs loaded (${total.toLocaleString()} DB rows scanned)`);
  return pois;
}

// ---- Spatial grid -----------------------------------------------------------

type Grid = Map<string, ActivePoi[]>;

function gk(lat: number, lng: number): string {
  return `${Math.floor(lat / GRID_DEG)},${Math.floor(lng / GRID_DEG)}`;
}

function buildGrid(pois: ActivePoi[]): Grid {
  const grid: Grid = new Map();
  for (const poi of pois) {
    const key  = gk(poi.lat, poi.lng);
    const cell = grid.get(key) ?? [];
    cell.push(poi);
    grid.set(key, cell);
  }
  return grid;
}

function neighbors(grid: Grid, lat: number, lng: number): ActivePoi[] {
  const lr = Math.floor(lat / GRID_DEG);
  const lc = Math.floor(lng / GRID_DEG);
  const out: ActivePoi[] = [];
  for (let dr = -1; dr <= 1; dr++) {
    for (let dc = -1; dc <= 1; dc++) {
      const cell = grid.get(`${lr + dr},${lc + dc}`);
      if (cell) out.push(...cell);
    }
  }
  return out;
}

// ---- Name matching ----------------------------------------------------------

function matchReason(a: ActivePoi, b: ActivePoi): string | null {
  const na = normalizeName(a.name);
  const nb = normalizeName(b.name);

  // Substring (skip trivially short names to avoid false positives)
  if (na.length > 5 && nb.length > 5 && (na.includes(nb) || nb.includes(na))) {
    return 'substring';
  }

  const tsr = tokenSetRatio(a.name, b.name);
  if (tsr > 0.9) return `token-set=${tsr.toFixed(2)}`;

  const lev = levenshteinRatio(a.name, b.name);
  if (lev > 0.85) return `lev=${lev.toFixed(2)}`;

  return null;
}

// ---- Primary selection ------------------------------------------------------

function pickPrimary(
  a: ActivePoi,
  b: ActivePoi,
): { primary: ActivePoi; secondary: ActivePoi } {
  const pa = priority(a.source_type);
  const pb = priority(b.source_type);
  if (pa !== pb) return pa > pb ? { primary: a, secondary: b } : { primary: b, secondary: a };
  if (a.significance_score !== b.significance_score) {
    return a.significance_score > b.significance_score
      ? { primary: a, secondary: b }
      : { primary: b, secondary: a };
  }
  // Deterministic tiebreak: lexicographically smaller UUID wins
  return a.id < b.id ? { primary: a, secondary: b } : { primary: b, secondary: a };
}

// ---- Pair discovery ---------------------------------------------------------

function findConfirmedPairs(pois: ActivePoi[], dryRun: boolean): ConfirmedPair[] {
  console.log(chalk.cyan('[dedupe] building spatial index…'));
  const grid = buildGrid(pois);

  console.log(chalk.cyan('[dedupe] scanning for candidate pairs…'));
  const confirmed: ConfirmedPair[] = [];
  // Track IDs designated as secondary in this run to prevent chains
  const alreadySecondary = new Set<string>();

  for (const poi of pois) {
    if (alreadySecondary.has(poi.id)) continue;

    for (const other of neighbors(grid, poi.lat, poi.lng)) {
      // Process each unordered pair once: handle only when other.id > poi.id
      if (other.id <= poi.id) continue;
      if (alreadySecondary.has(other.id)) continue;

      const dist = haversineMeters(poi.lat, poi.lng, other.lat, other.lng);
      if (dist > PROXIMITY_M) continue;

      const reason = matchReason(poi, other);
      if (!reason) continue;

      const { primary, secondary } = pickPrimary(poi, other);

      if (dryRun) {
        console.log(chalk.gray(
          `  MERGE ${dist.toFixed(0).padStart(3)}m` +
          `  "${primary.name}" [${primary.source_type}]` +
          `  ← "${secondary.name}" [${secondary.source_type}]` +
          `  (${reason})`,
        ));
      }

      confirmed.push({ primary, secondary, distanceM: dist, reason });
      alreadySecondary.add(secondary.id);

      // If the current outer POI was just designated as secondary, stop
      // processing its neighbors to prevent chain merges.
      if (secondary.id === poi.id) break;
    }
  }

  return confirmed;
}

// ---- Group merges by primary -------------------------------------------------

function groupByPrimary(pairs: ConfirmedPair[]): MergeGroup[] {
  const map = new Map<string, MergeGroup>();
  for (const { primary, secondary } of pairs) {
    const g = map.get(primary.id) ?? { primary, secondaries: [] };
    g.secondaries.push(secondary);
    map.set(primary.id, g);
  }
  return [...map.values()];
}

// ---- DB updates -------------------------------------------------------------

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

async function applyMergeGroups(
  groups: MergeGroup[],
): Promise<{ applied: number; errors: number }> {
  const supabase = getAdminClient();
  let applied = 0;
  let errors  = 0;

  for (let i = 0; i < groups.length; i += WRITE_CONCURRENCY) {
    const batch = groups.slice(i, i + WRITE_CONCURRENCY);

    await Promise.all(batch.map(async ({ primary, secondaries }) => {
      const newAdditional = [
        ...primary.additional_sources,
        ...secondaries.map((s) => `${s.source_type}:${s.source_id}`),
      ];

      // Longest non-null description wins
      const bestDesc = [primary.description, ...secondaries.map((s) => s.description)]
        .filter((d): d is string => d != null && d.length > 0)
        .sort((a, b) => b.length - a.length)[0] ?? null;

      // Significance: incremental bonus delta (max +0.30 across all merged sources, capped at 1.0)
      const prevBonus = Math.min(0.30, primary.additional_sources.length * 0.10);
      const newBonus  = Math.min(0.30, newAdditional.length * 0.10);
      const newSig    = Math.min(1.0, primary.significance_score + (newBonus - prevBonus));

      const newVerified = primary.verified || secondaries.some((s) => s.verified);

      // 1. Update primary
      const { error: pErr } = await supabase
        .from('pois')
        .update({
          additional_sources: newAdditional,
          description:        bestDesc,
          significance_score: newSig,
          verified:           newVerified,
        })
        .eq('id', primary.id);

      if (pErr) {
        console.error(chalk.red(`[dedupe] update primary ${primary.id}: ${pErr.message}`));
        errors++;
        return;
      }

      // 2. Soft-delete each secondary
      for (const sec of secondaries) {
        const { error: sErr } = await supabase
          .from('pois')
          .update({ merged_into: primary.id })
          .eq('id', sec.id);

        if (sErr) {
          console.error(chalk.red(`[dedupe] set merged_into ${sec.id}: ${sErr.message}`));
          errors++;
        } else {
          applied++;
        }
      }
    }));

    if (i + WRITE_CONCURRENCY < groups.length) await sleep(50);
  }

  return { applied, errors };
}

// ---- County bbox via Nominatim ----------------------------------------------

interface BBox { minLat: number; maxLat: number; minLon: number; maxLon: number; }

async function getCountyBbox(county: string, cacheDir: string): Promise<BBox> {
  const slug      = county.toLowerCase().replace(/\s+/g, '-');
  const cacheFile = path.join(cacheDir, 'geocode', `county-bbox-${slug}.json`);

  try {
    return JSON.parse(await fs.readFile(cacheFile, 'utf8')) as BBox;
  } catch { /* not cached */ }

  await sleep(1100); // Nominatim 1 req/sec
  const params = new URLSearchParams({
    q: `${county} County, California, USA`, format: 'jsonv2', limit: '1',
  });
  const res = await fetch(`https://nominatim.openstreetmap.org/search?${params}`, {
    headers: { 'User-Agent': USER_AGENT, Accept: 'application/json' },
  });
  if (!res.ok) throw new Error(`Nominatim ${res.status}`);
  const data = (await res.json()) as Array<{ boundingbox?: [string, string, string, string] }>;
  const bb = data[0]?.boundingbox;
  if (!bb) throw new Error(`No bbox found for county: ${county}`);

  // Nominatim: [south, north, west, east]
  const bbox: BBox = {
    minLat: Number(bb[0]), maxLat: Number(bb[1]),
    minLon: Number(bb[2]), maxLon: Number(bb[3]),
  };
  await fs.mkdir(path.dirname(cacheFile), { recursive: true });
  await fs.writeFile(cacheFile, JSON.stringify(bbox, null, 2), 'utf8');
  return bbox;
}

// ---- Final report -----------------------------------------------------------

function printReport(opts: {
  poisLoaded:  number;
  confirmed:   ConfirmedPair[];
  applied:     number;
  errors:      number;
  dryRun:      boolean;
  elapsedMs:   number;
}): void {
  const { poisLoaded, confirmed, applied, errors, dryRun, elapsedMs } = opts;

  // Count merges by source-pair type
  const pairCounts = new Map<string, number>();
  for (const { primary, secondary } of confirmed) {
    const key = [primary.source_type, secondary.source_type].sort().join(' × ');
    pairCounts.set(key, (pairCounts.get(key) ?? 0) + 1);
  }

  console.log('');
  console.log(chalk.bold('── Dedupe report ───────────────────────────────────'));
  console.log(`  POIs loaded:         ${poisLoaded.toLocaleString()}`);
  console.log(`  Confirmed merges:    ${confirmed.length.toLocaleString()}` + (dryRun ? chalk.yellow(' (dry run)') : ''));
  if (!dryRun) {
    console.log(`  Merges applied:      ${applied.toLocaleString()}`);
    console.log(`  Errors:              ${errors > 0 ? chalk.red(String(errors)) : '0'}`);
    console.log(`  POIs after:          ${(poisLoaded - applied).toLocaleString()}`);
  }

  if (pairCounts.size > 0) {
    console.log('');
    console.log('  Merges by source pair:');
    const sorted = [...pairCounts.entries()].sort((a, b) => b[1] - a[1]);
    for (const [pair, count] of sorted) {
      console.log(`    ${pair.padEnd(40)} ${count.toLocaleString()}`);
    }
  }

  console.log('');
  console.log(chalk.gray([
    '  Suggested partial index (add to a migration if not yet present):',
    '    CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_pois_geom_active',
    '      ON pois USING GIST(geom) WHERE merged_into IS NULL;',
  ].join('\n')));
  console.log('');
  console.log(chalk.green(`  Done in ${(elapsedMs / 1000).toFixed(1)}s`));
}

// ---- Main -------------------------------------------------------------------

const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);

async function main(): Promise<void> {
  const program = new Command();
  program
    .name('dedupe')
    .description('Spatial deduplication pass — merge near-duplicate POIs across sources')
    .option('--dry-run',          'Log proposed merges without applying to DB',     false)
    .option('--county <name>',    'Restrict to one California county (Nominatim geocoded)')
    .option('--limit <n>',        'Cap the number of merges applied', (v) => parseInt(v, 10))
    .option('--cache-dir <path>', 'Cache directory for Nominatim results',
      path.join(__dirname, 'cache'));

  await program.parseAsync(process.argv);

  const opts = program.opts<{
    dryRun:   boolean;
    county?:  string;
    limit?:   number;
    cacheDir: string;
  }>();

  console.log(chalk.bold('XRoad POI deduplication'));
  if (opts.dryRun) console.log(chalk.yellow('DRY RUN — no DB writes'));

  const start = Date.now();

  // Resolve county → bbox if requested
  let bbox: BBox | undefined;
  if (opts.county) {
    console.log(chalk.cyan(`[dedupe] geocoding county: ${opts.county}…`));
    bbox = await getCountyBbox(opts.county, opts.cacheDir);
    console.log(chalk.gray(
      `[dedupe] county bbox: ${bbox.minLat.toFixed(2)},${bbox.minLon.toFixed(2)}` +
      ` → ${bbox.maxLat.toFixed(2)},${bbox.maxLon.toFixed(2)}`,
    ));
  }

  const allPois = await fetchAllActivePois(bbox);
  if (allPois.length === 0) {
    console.log(chalk.yellow('[dedupe] no active POIs found — nothing to do'));
    return;
  }

  const confirmed = findConfirmedPairs(allPois, opts.dryRun);
  console.log(chalk.cyan(
    `[dedupe] ${confirmed.length.toLocaleString()} confirmed merge${confirmed.length === 1 ? '' : 's'}`,
  ));

  let applied = 0;
  let errors  = 0;

  if (!opts.dryRun && confirmed.length > 0) {
    let toApply = confirmed;
    if (opts.limit != null && confirmed.length > opts.limit) {
      toApply = confirmed.slice(0, opts.limit);
      console.log(chalk.yellow(
        `[dedupe] --limit ${opts.limit}: applying ${toApply.length} of ${confirmed.length} merges`,
      ));
    }

    const groups = groupByPrimary(toApply);
    console.log(chalk.cyan(
      `[dedupe] applying merges across ${groups.length} primary POI${groups.length === 1 ? '' : 's'}…`,
    ));
    ({ applied, errors } = await applyMergeGroups(groups));
  }

  printReport({ poisLoaded: allPois.length, confirmed, applied, errors, dryRun: opts.dryRun, elapsedMs: Date.now() - start });
}

main().catch((err: unknown) => {
  console.error(chalk.red(err instanceof Error ? err.message : String(err)));
  process.exit(1);
});
