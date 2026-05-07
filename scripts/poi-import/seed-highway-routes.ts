#!/usr/bin/env node
/**
 * seed-highway-routes.ts
 *
 * Fetches California highway geometries from the Overpass API and populates the
 * highway_routes table, enabling route-adjacency scoring in recompute-significance.ts.
 *
 * Run from scripts/poi-import/:
 *   npx tsx seed-highway-routes.ts [--dry-run] [--force]
 *
 * --dry-run   Fetch and process OSM data but do not write to DB.
 * --force     Truncate existing highway_routes data and re-seed.
 *
 * Highway classes written:
 *   major_ca      I-5, US-101, CA-1, I-80, I-15   (+10 pts within 1 km)
 *   interstate    all other CA interstates          (+5 pts within 5 km)
 *   us_highway    all US-route highways in CA       (+5 pts within 5 km)
 *   state_highway CA state routes (informational)
 */

import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';
dotenv.config({ path: path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../.env') });

import { promises as fs } from 'node:fs';
import { createHash } from 'node:crypto';
import { Command } from 'commander';
import chalk from 'chalk';
import { getPgPool } from './lib/supabase.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);

const OVERPASS_ENDPOINT = process.env['OVERPASS_URL'] ?? 'https://overpass-api.de/api/interpreter';
const CACHE_DIR         = path.join(__dirname, 'cache', 'highway-routes');
const FETCH_INTERVAL_MS = 3000;

// ── Types ─────────────────────────────────────────────────────────────────────

type HighwayClass = 'major_ca' | 'interstate' | 'us_highway' | 'state_highway';

interface OverpassNode {
  lat: number;
  lon: number;
}

interface OverpassWay {
  type: 'way';
  id:   number;
  geometry: OverpassNode[];
  tags?: Record<string, string>;
}

interface OverpassResponse {
  elements: OverpassWay[];
}

// ── Major CA highway ref patterns ────────────────────────────────────────────
// OSM typically formats refs as "I 5", "US 101", "CA 1" (space-separated).

const MAJOR_CA: RegExp[] = [
  /^I[\s-]?5$/i,
  /^US[\s-]?101$/i,
  /^(CA|SR)[\s-]?1$/i,
  /^I[\s-]?80$/i,
  /^I[\s-]?15$/i,
];

function classifyRef(ref: string): HighwayClass | null {
  const r = ref.trim();
  if (MAJOR_CA.some((p) => p.test(r))) return 'major_ca';
  if (/^I[\s-]?\d+/i.test(r))                return 'interstate';
  if (/^US[\s-]?\d+/i.test(r))               return 'us_highway';
  if (/^(CA|SR|State Route)[\s-]?\d+/i.test(r)) return 'state_highway';
  return null;
}

function canonicalRef(ref: string): string {
  return ref.trim().toUpperCase().replace(/\s+/g, ' ');
}

// ── Overpass fetch with disk cache ───────────────────────────────────────────

let lastFetchAt = 0;

async function rateLimit(): Promise<void> {
  const wait = lastFetchAt + FETCH_INTERVAL_MS - Date.now();
  if (wait > 0) await new Promise<void>((r) => setTimeout(r, wait));
  lastFetchAt = Date.now();
}

async function fetchOverpass(query: string, cacheKey: string): Promise<OverpassResponse> {
  const cacheFile = path.join(CACHE_DIR, `${cacheKey}.json`);

  try {
    const raw  = await fs.readFile(cacheFile, 'utf8');
    const data = JSON.parse(raw) as OverpassResponse;
    console.log(chalk.gray(`  [cache hit] ${cacheKey} (${data.elements.length} elements)`));
    return data;
  } catch { /* cache miss */ }

  await rateLimit();
  console.log(chalk.cyan(`  [overpass] fetching ${cacheKey}…`));

  const res = await fetch(OVERPASS_ENDPOINT, {
    method: 'POST',
    body:   new URLSearchParams({ data: query }),
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'Accept':       '*/*',
      'User-Agent':   'XRoad-POI-Import/1.0 (johnhollis99@gmail.com)',
    },
  });

  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`Overpass HTTP ${res.status}: ${body.slice(0, 200)}`);
  }

  const data = await res.json() as OverpassResponse;
  await fs.writeFile(cacheFile, JSON.stringify(data), 'utf8');
  console.log(chalk.green(`  [overpass] got ${data.elements.length} ways, cached to ${path.basename(cacheFile)}`));
  return data;
}

// ── WKT helpers ───────────────────────────────────────────────────────────────

// Returns MULTILINESTRING((lon lat, lon lat,...),(lon lat,...))
function buildMultiLineStringWKT(segments: [number, number][][]): string {
  const rings = segments.map(
    (pts) => `(${pts.map(([lon, lat]) => `${lon} ${lat}`).join(',')})`,
  );
  return `MULTILINESTRING(${rings.join(',')})`;
}

// ── Main ──────────────────────────────────────────────────────────────────────

interface CliOpts {
  dryRun: boolean;
  force:  boolean;
}

async function main(opts: CliOpts): Promise<void> {
  await fs.mkdir(CACHE_DIR, { recursive: true });

  if (opts.dryRun) console.log(chalk.yellow('DRY RUN — no DB writes'));

  console.log(chalk.bold('XRoad — seed-highway-routes'));

  // ── 1. Check existing rows ─────────────────────────────────────────────────
  const pool = getPgPool();

  if (!opts.dryRun) {
    const { rows } = await pool.query<{ count: string }>(
      'SELECT COUNT(*)::text AS count FROM highway_routes',
    );
    const existing = parseInt(rows[0]?.count ?? '0', 10);

    if (existing > 0 && !opts.force) {
      console.log(
        chalk.yellow(`highway_routes already has ${existing} rows.`) +
        chalk.gray(' Use --force to repopulate.'),
      );
      await pool.end();
      return;
    }

    if (existing > 0 && opts.force) {
      await pool.query('TRUNCATE TABLE highway_routes RESTART IDENTITY');
      console.log(chalk.gray(`Truncated ${existing} existing rows`));
    }
  }

  // ── 2. Overpass query ──────────────────────────────────────────────────────
  // California bbox: 32.5,-124.5 to 42.0,-114.1
  // motorway = interstates in OSM; trunk = US routes + some state routes
  const query = `[out:json][timeout:600][maxsize:536870912];
(
  way["highway"="motorway"]["ref"](32.5,-124.5,42.0,-114.1);
  way["highway"="trunk"]["ref"](32.5,-124.5,42.0,-114.1);
  way["highway"="primary"]["ref"~"^(I |I-|US |US-)"](32.5,-124.5,42.0,-114.1);
);
out geom;`;

  const hash     = createHash('sha1').update(query).digest('hex').slice(0, 12);
  const cacheKey = `ca-highways-${hash}`;
  const data     = await fetchOverpass(query, cacheKey);

  // ── 3. Group ways by canonical ref ────────────────────────────────────────
  const byRef   = new Map<string, { cls: HighwayClass; segs: [number, number][][] }>();
  const seenWay = new Set<number>();
  let skipped   = 0;

  for (const el of data.elements) {
    if (el.type !== 'way') continue;
    if (!el.geometry?.length)  continue;
    if (!el.tags?.ref)         continue;
    if (seenWay.has(el.id)) continue;
    seenWay.add(el.id);

    // OSM sometimes packs multiple refs in one tag, e.g. "I 5;Business I 5"
    const refs = el.tags.ref.split(';').map((r) => r.trim()).filter(Boolean);

    for (const ref of refs) {
      const cls = classifyRef(ref);
      if (!cls) { skipped++; continue; }

      const key = canonicalRef(ref);
      const seg: [number, number][] = el.geometry.map((n) => [n.lon, n.lat]);

      const entry = byRef.get(key);
      if (entry) {
        entry.segs.push(seg);
      } else {
        byRef.set(key, { cls, segs: [seg] });
      }
    }
  }

  // ── 4. Report ─────────────────────────────────────────────────────────────
  const classCounts: Record<HighwayClass, number> = {
    major_ca: 0, interstate: 0, us_highway: 0, state_highway: 0,
  };
  for (const { cls } of byRef.values()) classCounts[cls]++;

  console.log(chalk.bold(`\nOSM fetch: ${data.elements.length} ways → ${byRef.size} unique refs`));
  console.log(chalk.gray(`  Skipped (unclassified refs): ${skipped}`));
  console.log(chalk.cyan('\nBreakdown by class:'));
  for (const [cls, n] of Object.entries(classCounts)) {
    console.log(chalk.gray(`  ${cls.padEnd(15)} ${n} refs`));
  }

  if (opts.dryRun) {
    console.log(chalk.yellow('\nDRY RUN — skipping DB writes'));
    console.log(chalk.bold.green('\n✓ Done (dry run)'));
    await pool.end();
    return;
  }

  // ── 5. Insert ─────────────────────────────────────────────────────────────
  let inserted = 0;
  let errors   = 0;

  for (const [ref, { cls, segs }] of byRef) {
    const wkt = buildMultiLineStringWKT(segs);
    try {
      await pool.query(
        `INSERT INTO highway_routes (ref, highway_class, geom)
         VALUES ($1, $2, ST_SetSRID(ST_GeomFromText($3), 4326))`,
        [ref, cls, wkt],
      );
      inserted++;
      if (inserted % 25 === 0) {
        process.stdout.write(chalk.gray(`.`));
      }
    } catch (err) {
      console.error(chalk.red(`\n  error inserting "${ref}": ${(err as Error).message}`));
      errors++;
    }
  }

  console.log('');
  console.log(chalk.bold.green(`\n✓ Inserted ${inserted} highway routes into highway_routes`));
  if (errors > 0) console.log(chalk.red(`  ${errors} errors`));

  await pool.end();
}

// ── CLI ───────────────────────────────────────────────────────────────────────

const program = new Command();

program
  .name('seed-highway-routes')
  .description('Populate highway_routes table with California highway geometries from OSM')
  .option('--dry-run', 'Fetch and process OSM data but do not write to DB', false)
  .option('--force',   'Truncate existing rows and re-seed',                 false)
  .action((cliOpts: CliOpts) => {
    main(cliOpts).catch((err: unknown) => {
      console.error(chalk.red(err instanceof Error ? err.message : String(err)));
      process.exit(1);
    });
  });

program.parseAsync(process.argv).catch((err: unknown) => {
  console.error(chalk.red(err instanceof Error ? err.message : String(err)));
  process.exit(1);
});
