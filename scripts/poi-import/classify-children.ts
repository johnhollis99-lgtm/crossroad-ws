#!/usr/bin/env node
// Classify children — Section 7.2 of docs/venue-tour-design.md.
//
// For each non-venue POI: check whether it falls inside any venue polygon,
// apply the standalone-exception rules, and (when not --dry-run) UPDATE its
// parent_poi_id. Designed to run after seed-venues.ts has populated the
// venue catalog.
//
// Two venue catalog sources:
//   --venues-from-file <path>   read polygons from a seed-venues.ts JSON
//                               output (works pre-migration, useful for
//                               end-to-end dry-runs)
//   (default)                   read polygons from pois.venue_polygon (DB)
//
// Run from scripts/poi-import/ :
//   npx tsx classify-children.ts --dry-run --venues-from-file cache/venues-catalog-latest.json
//   npx tsx classify-children.ts --dry-run                          # uses DB venues
//   npx tsx classify-children.ts --county 'Los Angeles'             # county-scoped live run
//   npx tsx classify-children.ts                                    # full live backfill

import { config as dotenvConfig } from 'dotenv';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
dotenvConfig({ path: resolve(__dirname, '../../.env') });

import { promises as fs } from 'node:fs';
import path from 'node:path';
import chalk from 'chalk';
import { Command } from 'commander';
import { getPgPool } from './lib/supabase.js';
import {
  classifyChild,
  polygonAreaM2,
  type VenueCatalogEntry,
  type VenueType,
  type GeoJSONPolygon,
  type ClassificationCandidate,
  type ClassificationResult,
} from './lib/classify-poi.js';

// ===== Catalog loaders =======================================================

interface FileCatalogEntry {
  slug: string;
  name: string;
  venue_type: VenueType;
  group: string;
  wikidata: string | null;
  area_m2: number | null;
  centroid: { lat: number; lng: number } | null;
  polygon: GeoJSONPolygon;
}

async function loadVenuesFromFile(filePath: string): Promise<VenueCatalogEntry[]> {
  const raw = await fs.readFile(filePath, 'utf8');
  const parsed = JSON.parse(raw) as FileCatalogEntry[];
  return parsed.map((v, i) => ({
    id: `file:${v.slug ?? i}`,
    name: v.name,
    venue_type: v.venue_type,
    polygon: v.polygon,
    area_m2: v.area_m2 ?? polygonAreaM2(v.polygon),
    imported_at: undefined,
  }));
}

async function loadVenuesFromDb(): Promise<VenueCatalogEntry[]> {
  const pool = getPgPool();
  const sql = `
    SELECT
      id::text                              AS id,
      name,
      venue_type,
      ST_AsGeoJSON(venue_polygon)::text     AS polygon_geojson,
      ST_Area(venue_polygon)                AS area_m2,
      imported_at::text                     AS imported_at
    FROM pois
    WHERE is_venue = true
      AND merged_into IS NULL
      AND venue_polygon IS NOT NULL
  `;
  const res = await pool.query<{
    id: string;
    name: string;
    venue_type: VenueType;
    polygon_geojson: string;
    area_m2: number;
    imported_at: string | null;
  }>(sql);
  return res.rows.map(r => ({
    id: r.id,
    name: r.name,
    venue_type: r.venue_type,
    polygon: JSON.parse(r.polygon_geojson) as GeoJSONPolygon,
    area_m2: Number(r.area_m2),
    imported_at: r.imported_at ?? undefined,
  }));
}

// ===== Bbox preindex (fast spatial filter) ===================================

interface BboxIndex {
  venue: VenueCatalogEntry;
  minLng: number;
  minLat: number;
  maxLng: number;
  maxLat: number;
}

function buildBboxIndex(venues: VenueCatalogEntry[]): BboxIndex[] {
  return venues.map(v => {
    const ring = v.polygon.coordinates[0]!;
    let minLng = Infinity, minLat = Infinity, maxLng = -Infinity, maxLat = -Infinity;
    for (const p of ring) {
      const lng = p[0]!, lat = p[1]!;
      if (lng < minLng) minLng = lng;
      if (lat < minLat) minLat = lat;
      if (lng > maxLng) maxLng = lng;
      if (lat > maxLat) maxLat = lat;
    }
    return { venue: v, minLng, minLat, maxLng, maxLat };
  });
}

function venuesNearPoint(idx: BboxIndex[], lng: number, lat: number): VenueCatalogEntry[] {
  const out: VenueCatalogEntry[] = [];
  for (const v of idx) {
    if (lng >= v.minLng && lng <= v.maxLng && lat >= v.minLat && lat <= v.maxLat) {
      out.push(v.venue);
    }
  }
  return out;
}

// ===== POI streaming =========================================================

interface POIRow {
  id: string;
  name: string;
  source_type: string;
  confidence_score: number;
  additional_sources_count: number;
  imported_at: string | null;
  lat: number;
  lng: number;
  category_slug: string | null;
}

async function detectColumn(pool: ReturnType<typeof getPgPool>, column: string): Promise<boolean> {
  const r = await pool.query<{ exists: boolean }>(`
    SELECT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema='public' AND table_name='pois' AND column_name=$1
    ) AS exists
  `, [column]);
  return !!r.rows[0]?.exists;
}

async function* streamPOIs(opts: {
  county?: string;
  since?: string;
  bbox?: { minLat: number; minLon: number; maxLat: number; maxLon: number };
  limit?: number;
  hasParentColumn: boolean;
  hasIsVenueColumn: boolean;
}): AsyncGenerator<POIRow> {
  const pool = getPgPool();
  const filters: string[] = ['p.merged_into IS NULL'];
  if (opts.hasParentColumn)  filters.push('p.parent_poi_id IS NULL');
  if (opts.hasIsVenueColumn) filters.push('p.is_venue = false');
  if (opts.since) filters.push(`p.imported_at >= '${opts.since.replace(/'/g, "''")}'`);
  if (opts.bbox) {
    const { minLat, minLon, maxLat, maxLon } = opts.bbox;
    filters.push(`ST_Y(p.location::geometry) BETWEEN ${minLat} AND ${maxLat}`);
    filters.push(`ST_X(p.location::geometry) BETWEEN ${minLon} AND ${maxLon}`);
  }

  const limit = opts.limit ?? 1_000_000;
  const sql = `
    SELECT
      p.id::text                                  AS id,
      p.name                                      AS name,
      p.source_type                               AS source_type,
      p.confidence_score                          AS confidence_score,
      COALESCE(array_length(p.additional_sources, 1), 0) AS additional_sources_count,
      p.imported_at::text                         AS imported_at,
      ST_Y(p.location::geometry)                  AS lat,
      ST_X(p.location::geometry)                  AS lng,
      c.slug                                      AS category_slug
    FROM pois p
    LEFT JOIN poi_categories c ON c.id = p.category_id
    WHERE ${filters.join(' AND ')}
    ORDER BY p.id
    LIMIT ${limit}
  `;
  const res = await pool.query<{
    id: string; name: string; source_type: string;
    confidence_score: number; additional_sources_count: number;
    imported_at: string | null; lat: number; lng: number;
    category_slug: string | null;
  }>(sql);
  for (const row of res.rows) {
    yield {
      ...row,
      confidence_score: Number(row.confidence_score),
      additional_sources_count: Number(row.additional_sources_count),
      lat: Number(row.lat),
      lng: Number(row.lng),
    };
  }
}

// ===== Main classification ===================================================

interface ClassifyTally {
  total: number;
  child: number;
  standalone_no_container: number;
  exceptions: Record<string, number>;
}

interface ClassifyAssignment {
  poi: POIRow;
  result: ClassificationResult;
}

function newTally(): ClassifyTally {
  return {
    total: 0,
    child: 0,
    standalone_no_container: 0,
    exceptions: {
      historic_landmark_in_modern_venue: 0,
      multi_source_independent: 0,
      low_confidence_geocoding: 0,
      imported_before_venue: 0,
    },
  };
}

// ===== CLI ===================================================================

const program = new Command();
program
  .name('classify-children')
  .option('--dry-run', 'Compute classifications, do not write to DB', false)
  .option('--venues-from-file <path>', 'Load venue catalog from JSON (instead of DB)')
  .option('--county <name>', 'Restrict to county bbox (NOT YET IMPLEMENTED — uses imported_at filter only)')
  .option('--bbox <minLat,minLon,maxLat,maxLon>', 'Restrict to an explicit bbox')
  .option('--since <iso8601>', 'Only POIs imported after this date')
  .option('--limit <n>', 'Cap POIs scanned', (v) => Number(v))
  .option('--sample-size <n>', 'Number of random child classifications to print', (v) => Number(v), 30)
  .option('--allow-retroactive', 'Skip Rule 5 (imported_before_venue). REQUIRES --venue-ids — see below', false)
  .option('--venue-ids <comma-separated-uuids>', 'Restrict classifier to a named set of venue POI UUIDs. Required when --allow-retroactive is set so retroactive child claims can only happen against an explicit, named scope.')
  .action(async (opts: {
    dryRun: boolean; venuesFromFile?: string; county?: string; bbox?: string;
    since?: string; limit?: number; sampleSize: number;
    allowRetroactive: boolean;
    venueIds?: string;
  }) => {
    const start = Date.now();

    // Guardrail: --allow-retroactive bypasses the "imported_before_venue"
    // rule that prevents retroactive parentage claims. Without an explicit
    // scope, a habitual run could silently re-parent thousands of POIs.
    // We require --venue-ids so the retroactive scope is always named in
    // the invocation itself.
    const requestedVenueIds = (opts.venueIds ?? '')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
    if (opts.allowRetroactive && requestedVenueIds.length === 0) {
      console.error(chalk.red(
        '--allow-retroactive requires --venue-ids=<comma-separated-uuids>.\n' +
        '  Pass the explicit set of venue POI UUIDs the retroactive backfill\n' +
        '  should be allowed to claim children from, e.g.:\n' +
        '    --allow-retroactive --venue-ids=11111111-...,22222222-...',
      ));
      process.exit(1);
    }

    // 1. Load venues
    let venues: VenueCatalogEntry[];
    if (opts.venuesFromFile) {
      const filePath = path.resolve(opts.venuesFromFile);
      console.log(chalk.cyan(`Loading venues from file: ${filePath}`));
      venues = await loadVenuesFromFile(filePath);
    } else {
      console.log(chalk.cyan('Loading venues from DB (pois WHERE is_venue=true)…'));
      venues = await loadVenuesFromDb();
    }
    console.log(chalk.gray(`  ${venues.length} venues with polygons`));
    if (venues.length === 0) {
      console.log(chalk.red('No venues to classify against. Aborting.'));
      process.exit(1);
    }

    if (requestedVenueIds.length > 0) {
      const requested = new Set(requestedVenueIds);
      const filtered = venues.filter((v) => requested.has(v.id));
      const unmatched = [...requested].filter((id) => !venues.some((v) => v.id === id));
      console.log(chalk.cyan(
        `  --venue-ids scope: ${filtered.length} of ${requestedVenueIds.length} requested venue(s) matched`,
      ));
      if (unmatched.length > 0) {
        console.error(chalk.red(
          `  ${unmatched.length} requested venue id(s) did not match any loaded venue:\n` +
          unmatched.map((id) => `    ${id}`).join('\n'),
        ));
      }
      if (filtered.length === 0) {
        console.log(chalk.red('No venues matched the requested --venue-ids. Aborting.'));
        process.exit(1);
      }
      venues = filtered;
    }

    const idx = buildBboxIndex(venues);

    // 2. Detect schema state
    const pool = getPgPool();
    const hasParentColumn  = await detectColumn(pool, 'parent_poi_id');
    const hasIsVenueColumn = await detectColumn(pool, 'is_venue');
    if (!hasParentColumn || !hasIsVenueColumn) {
      console.log(chalk.yellow(
        `Schema check: parent_poi_id=${hasParentColumn ? 'present' : 'MISSING'}, ` +
        `is_venue=${hasIsVenueColumn ? 'present' : 'MISSING'}`,
      ));
      console.log(chalk.yellow('Migration not yet applied — running in propose-only mode.'));
      if (!opts.dryRun) {
        console.log(chalk.red('Cannot perform live writes without migration. Use --dry-run.'));
        process.exit(1);
      }
    }

    // 3. Stream POIs and classify
    console.log(chalk.cyan(`Scanning POIs${opts.dryRun ? ' (DRY RUN)' : ''}…`));
    const tally = newTally();
    const childAssignments: ClassifyAssignment[] = [];
    const exceptionAssignments: ClassifyAssignment[] = [];
    const venueChildCounts = new Map<string, number>();

    let bbox: { minLat: number; minLon: number; maxLat: number; maxLon: number } | undefined;
    if (opts.bbox) {
      const parts = opts.bbox.split(',').map((p) => Number(p.trim()));
      if (parts.length !== 4 || parts.some((n) => Number.isNaN(n))) {
        throw new Error(`Invalid --bbox "${opts.bbox}". Expected "minLat,minLon,maxLat,maxLon".`);
      }
      const [minLat, minLon, maxLat, maxLon] = parts as [number, number, number, number];
      if (minLat >= maxLat || minLon >= maxLon) {
        throw new Error(`Invalid --bbox: min must be < max.`);
      }
      bbox = { minLat, minLon, maxLat, maxLon };
      console.log(chalk.gray(`  bbox filter: ${minLat.toFixed(2)},${minLon.toFixed(2)} → ${maxLat.toFixed(2)},${maxLon.toFixed(2)}`));
    }

    for await (const poi of streamPOIs({
      county: opts.county,
      since: opts.since,
      bbox,
      limit: opts.limit,
      hasParentColumn,
      hasIsVenueColumn,
    })) {
      tally.total++;
      const candidates = venuesNearPoint(idx, poi.lng, poi.lat);
      if (candidates.length === 0) {
        tally.standalone_no_container++;
        continue;
      }
      const candidate: ClassificationCandidate = {
        source_type: poi.source_type as ClassificationCandidate['source_type'],
        confidence_score: poi.confidence_score,
        additional_sources_count: poi.additional_sources_count,
        imported_at: poi.imported_at ?? undefined,
        lat: poi.lat,
        lng: poi.lng,
      };
      const result = classifyChild(candidate, candidates, { allowRetroactive: opts.allowRetroactive });
      if (result.reason === 'child_of_venue') {
        tally.child++;
        childAssignments.push({ poi, result });
        const venueName = result.matched_venue_name ?? '(unknown)';
        venueChildCounts.set(venueName, (venueChildCounts.get(venueName) ?? 0) + 1);
      } else if (result.reason === 'standalone_no_container') {
        tally.standalone_no_container++;
      } else {
        tally.exceptions[result.reason] = (tally.exceptions[result.reason] ?? 0) + 1;
        exceptionAssignments.push({ poi, result });
      }
      if (tally.total % 5000 === 0) {
        process.stdout.write(chalk.gray(`  …${tally.total} scanned (child=${tally.child})\n`));
      }
    }

    // 4. Report
    console.log('');
    console.log(chalk.bold('── Classification summary ─────────────'));
    console.log(`  scanned:              ${tally.total}`);
    console.log(`  ${chalk.green('proposed children:')}  ${tally.child}`);
    console.log(`  standalone:           ${tally.standalone_no_container}`);
    console.log(`  exception firings:`);
    for (const [rule, count] of Object.entries(tally.exceptions)) {
      console.log(`    • ${rule.padEnd(36)} ${count}`);
    }
    console.log('');

    // Top venues by child count
    const venueRanking = [...venueChildCounts.entries()].sort((a, b) => b[1] - a[1]);
    console.log(chalk.bold('── Top venues by child count ──────────'));
    for (const [name, count] of venueRanking.slice(0, 15)) {
      console.log(`  ${count.toString().padStart(4)}  ${name}`);
    }
    console.log('');

    // Stratified random sample of 30
    const sample = stratifiedSample(childAssignments, venues, opts.sampleSize);
    console.log(chalk.bold(`── Random sample of ${sample.length} child classifications ──`));
    for (const a of sample) {
      const v = venues.find(vv => vv.id === a.result.parent_poi_id);
      const vt = v ? `[${v.venue_type}]` : '';
      console.log(
        `  ${chalk.cyan(a.result.matched_venue_name ?? '?').padEnd(40)}` +
        ` ${vt.padEnd(20)} ← ${a.poi.name} ` +
        chalk.gray(`(${a.poi.source_type}, conf=${a.poi.confidence_score.toFixed(2)})`),
      );
    }
    console.log('');

    // Exception sample (proves all 5 rules are reachable)
    if (exceptionAssignments.length > 0) {
      console.log(chalk.bold('── Exception firings (sample, 1 per rule) ──'));
      const seenRules = new Set<string>();
      for (const a of exceptionAssignments) {
        if (seenRules.has(a.result.reason)) continue;
        seenRules.add(a.result.reason);
        console.log(
          `  [${a.result.reason}] ${a.poi.name} ` +
          chalk.gray(`(in ${a.result.matched_venue_name}, ${a.poi.source_type}, conf=${a.poi.confidence_score})`),
        );
      }
      console.log('');
    }

    // 5. Live write
    if (!opts.dryRun && hasParentColumn && childAssignments.length) {
      console.log(chalk.bold('── Writing parent_poi_id to DB ───────'));
      const BATCH = 500;
      let updated = 0;
      for (let i = 0; i < childAssignments.length; i += BATCH) {
        const batch = childAssignments.slice(i, i + BATCH);
        const ids   = batch.map(a => a.poi.id);
        const parents = batch.map(a => a.result.parent_poi_id!);
        const sql = `
          UPDATE pois SET parent_poi_id = data.parent_id::uuid
          FROM (SELECT unnest($1::uuid[]) AS id, unnest($2::uuid[]) AS parent_id) AS data
          WHERE pois.id = data.id
        `;
        try {
          await pool.query(sql, [ids, parents]);
          updated += batch.length;
        } catch (err) {
          console.error(chalk.red(`  batch error: ${(err as Error).message}`));
        }
      }
      console.log(chalk.green(`  updated ${updated} POIs`));
    }

    // 6. Persist a JSON report
    const ts = new Date().toISOString().replace(/[:.]/g, '-');
    const reportPath = path.join(__dirname, 'cache', `classify-${ts}.json`);
    await fs.writeFile(reportPath, JSON.stringify({
      timestamp: new Date().toISOString(),
      dryRun: opts.dryRun,
      venuesFromFile: opts.venuesFromFile ?? null,
      tally,
      venueRanking: venueRanking.slice(0, 50),
      sample: sample.map(a => ({
        poi_id: a.poi.id, poi_name: a.poi.name,
        source_type: a.poi.source_type, confidence_score: a.poi.confidence_score,
        venue_name: a.result.matched_venue_name, venue_id: a.result.parent_poi_id,
      })),
      elapsedMs: Date.now() - start,
    }, null, 2), 'utf8');
    console.log(chalk.cyan(`Report: ${reportPath}`));
    console.log(`Elapsed: ${((Date.now() - start) / 1000).toFixed(1)}s`);

    await pool.end();
  });

// Stratified random sample by venue (so we get diverse venue_types in the sample)
function stratifiedSample(
  assignments: ClassifyAssignment[],
  venues: VenueCatalogEntry[],
  n: number,
): ClassifyAssignment[] {
  if (assignments.length <= n) return assignments;
  const venueTypeOf = (id: string | null) => venues.find(v => v.id === id)?.venue_type ?? 'unknown';
  const buckets = new Map<string, ClassifyAssignment[]>();
  for (const a of assignments) {
    const t = venueTypeOf(a.result.parent_poi_id);
    if (!buckets.has(t)) buckets.set(t, []);
    buckets.get(t)!.push(a);
  }
  const types = [...buckets.keys()];
  const out: ClassifyAssignment[] = [];
  const perBucket = Math.max(1, Math.floor(n / types.length));
  for (const t of types) {
    const pool = buckets.get(t)!;
    for (let i = 0; i < perBucket && pool.length > 0; i++) {
      const idx = Math.floor(Math.random() * pool.length);
      out.push(pool.splice(idx, 1)[0]!);
    }
  }
  // top up if we have room
  while (out.length < n) {
    const remaining = [...buckets.values()].flat();
    if (remaining.length === 0) break;
    out.push(remaining[Math.floor(Math.random() * remaining.length)]!);
  }
  return out.slice(0, n);
}

program.parseAsync(process.argv).catch((err) => {
  console.error(chalk.red(err instanceof Error ? err.message : String(err)));
  process.exit(1);
});
