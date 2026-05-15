#!/usr/bin/env node
/**
 * Phase 4 of E1d: live import of the 27 non-Tier-C named valleys.
 *
 * Loads the verification result JSON, then for each region:
 *   1. Fetches/builds the polygon geometry
 *      - OSM matches → Overpass `out body geom;` + osmtogeojson → GeoJSON
 *      - Wikidata-buffer → 64-point geodesic circle around the centroid
 *      - Pre-generated samples (Owens Valley, Long Valley Caldera) → same path
 *        as their resolved source (Owens=OSM, LVC=Wikidata buffer)
 *   2. Generates seed text via Haiku (or uses cached for the 2 samples)
 *      - Wikipedia MediaWiki extracts API as source context
 *      - draftRegionSeedText() logs to llm_calls fire-and-forget
 *   3. Resolves parent_region_id via ST_Within(centroid, geomorphic_province)
 *   4. Upserts to public.regions with full metadata
 *
 * Tier C (Lake Tahoe Basin, Hetch Hetchy Valley, Sierra Valley) is skipped
 * — handled in a separate commit after this one ships.
 *
 * Run from scripts/region-import/:
 *   npx tsx live-import-named-valleys.ts             # dry-run by default
 *   npx tsx live-import-named-valleys.ts --commit    # actually write
 */
import { config as dotenvConfig } from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';
import path from 'node:path';
import fs from 'node:fs';
import crypto from 'node:crypto';
import chalk from 'chalk';
import osmtogeojson from 'osmtogeojson';

import { callHaiku, SEED_TEXT_SYSTEM_PROMPT, buildSeedTextUserPrompt, logLlmCall } from './lib/anthropic.js';
import { geoJsonToEwktMultiPolygon } from './lib/polygons.js';
import { getPgPool } from './lib/supabase.js';
import type { NormalizedRegion, RegionSource } from './lib/types.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
dotenvConfig({ path: resolve(__dirname, '../../.env') });

const CACHE_DIR = path.join(__dirname, 'cache');
const VERIFICATION_JSON = path.join(CACHE_DIR, 'named-valleys-verification.json');
const SAMPLES_JSON = path.join(CACHE_DIR, 'seed-samples-owens-and-lvc.json');
const OUT_JSON = path.join(CACHE_DIR, 'live-import-result.json');
const SUMMARY_CACHE = path.join(CACHE_DIR, 'wikipedia-summaries');
const OVERPASS_GEOM_CACHE = path.join(CACHE_DIR, 'overpass-osm-geom');
const EXTRACT_CACHE = path.join(CACHE_DIR, 'wikipedia-extracts');

const OVERPASS_URL = 'https://overpass-api.de/api/interpreter';
const USER_AGENT = 'XRoad-Region-Import/0.1 (https://github.com/johnhollis99-lgtm/crossroad-ws; contact: john)';
const OVERPASS_RATE_DELAY_MS = 4000;
const CACHE_TTL_MS = 30 * 24 * 3600 * 1000;

// Skip these — Tier C, handled separately
const TIER_C_SKIP = new Set(['Lake Tahoe Basin', 'Hetch Hetchy Valley', 'Sierra Valley']);

// ───────────────────────── helpers ─────────────────────────

function sha1(s: string): string {
  return crypto.createHash('sha1').update(s).digest('hex');
}

function readCacheTtl<T>(file: string, ttlMs = CACHE_TTL_MS): T | null {
  try {
    const stat = fs.statSync(file);
    if (Date.now() - stat.mtimeMs > ttlMs) return null;
    return JSON.parse(fs.readFileSync(file, 'utf-8')) as T;
  } catch {
    return null;
  }
}

function writeCache<T>(file: string, value: T): void {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(value, null, 2));
}

async function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

function kebab(name: string): string {
  return name
    .toLowerCase()
    .replace(/[()]/g, '')
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9-]/g, '');
}

// ───────────────────────── OSM geometry fetch ─────────────────────────

interface OsmGeometryResult {
  geom: GeoJSON.Polygon | GeoJSON.MultiPolygon;
  /** 'osm_full' = osmtogeojson produced a Polygon/MultiPolygon directly.
   *  'osm_bbox_fallback' = OSM had an unclosed LineString; we built a
   *  rectangle polygon from the way's bbox as a coarse approximation. */
  method: 'osm_full' | 'osm_bbox_fallback';
}

function bboxToRectanglePolygon(bbox: {
  minLat: number; minLon: number; maxLat: number; maxLon: number;
}): GeoJSON.Polygon {
  return {
    type: 'Polygon',
    coordinates: [[
      [bbox.minLon, bbox.minLat],
      [bbox.maxLon, bbox.minLat],
      [bbox.maxLon, bbox.maxLat],
      [bbox.minLon, bbox.maxLat],
      [bbox.minLon, bbox.minLat],
    ]],
  };
}

async function fetchOsmGeometry(
  osmType: 'relation' | 'way',
  osmId: number,
  regionLabel: string,
  bboxFallback?: { minLat: number; minLon: number; maxLat: number; maxLon: number },
): Promise<OsmGeometryResult | null> {
  const cacheFile = path.join(OVERPASS_GEOM_CACHE, `${osmType}-${osmId}.json`);
  let osmJson: { elements: unknown[] } | null = readCacheTtl(cacheFile);

  if (!osmJson) {
    // Overpass query: full geometry with recursive member resolution
    const query =
      osmType === 'relation'
        ? `[out:json][timeout:120];relation(${osmId});out body;>;out skel qt;`
        : `[out:json][timeout:60];way(${osmId});(._;>;);out body geom qt;`;
    const body = new URLSearchParams({ data: query });
    let lastErr: Error | null = null;
    for (let attempt = 0; attempt < 4; attempt++) {
      try {
        const res = await fetch(OVERPASS_URL, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            'User-Agent': USER_AGENT,
            'Accept': 'application/json',
          },
          body: body.toString(),
        });
        if (res.status === 429 || res.status >= 500) {
          const wait = 5000 * (attempt + 1);
          console.warn(chalk.yellow(`    [${regionLabel}] Overpass ${res.status} — retrying in ${wait}ms`));
          await sleep(wait);
          continue;
        }
        if (!res.ok) throw new Error(`Overpass HTTP ${res.status} ${res.statusText}`);
        osmJson = await res.json() as { elements: unknown[] };
        writeCache(cacheFile, osmJson);
        break;
      } catch (err) {
        lastErr = err as Error;
        const wait = 3000 * (attempt + 1);
        console.warn(chalk.yellow(`    [${regionLabel}] Overpass error: ${lastErr.message} — retrying in ${wait}ms`));
        await sleep(wait);
      }
    }
    if (!osmJson) throw lastErr ?? new Error(`Overpass geometry fetch failed for ${osmType}/${osmId}`);
    await sleep(OVERPASS_RATE_DELAY_MS);
  }

  // Convert OSM → GeoJSON via osmtogeojson
  // (cast is intentional — osmtogeojson typings are loose)
  const fc = osmtogeojson(osmJson as never) as GeoJSON.FeatureCollection;

  // Find the feature matching our target ID
  const wantId = `${osmType === 'relation' ? 'relation/' : 'way/'}${osmId}`;
  const feat = fc.features.find((f) => f.id === wantId || String(f.id) === String(osmId));
  if (!feat) {
    console.warn(chalk.yellow(`    [${regionLabel}] osmtogeojson produced no feature for ${wantId} — features: ${fc.features.map((x) => x.id).slice(0, 5).join(', ')}`));
    return null;
  }
  const g = feat.geometry;
  if (g.type === 'Polygon' || g.type === 'MultiPolygon') {
    return { geom: g, method: 'osm_full' };
  }
  if (g.type === 'LineString') {
    // Closed line → wrap as Polygon if coordinates close
    const coords = g.coordinates;
    const first = coords[0];
    const last = coords[coords.length - 1];
    if (first && last && first[0] === last[0] && first[1] === last[1]) {
      return { geom: { type: 'Polygon', coordinates: [coords] }, method: 'osm_full' };
    }
    // Unclosed LineString — OSM has only a linear feature for this region
    // (e.g., Panamint Valley way/163728245 is the valley's central axis,
    // not a closed boundary polygon). Fall back to bbox rectangle.
    if (bboxFallback) {
      console.warn(chalk.yellow(`    [${regionLabel}] unclosed LineString — falling back to bbox rectangle (${bboxFallback.maxLon - bboxFallback.minLon}° × ${bboxFallback.maxLat - bboxFallback.minLat}°)`));
      return { geom: bboxToRectanglePolygon(bboxFallback), method: 'osm_bbox_fallback' };
    }
    console.warn(chalk.yellow(`    [${regionLabel}] feature is unclosed LineString and no bbox fallback — cannot polygonize`));
    return null;
  }
  console.warn(chalk.yellow(`    [${regionLabel}] unexpected geometry type ${g.type}`));
  return null;
}

// ───────────────────────── geodesic circle (Wikidata buffer) ─────────────────────────

function buildGeodesicCircle(
  center: { lat: number; lon: number },
  radiusKm: number,
  points = 64,
): GeoJSON.Polygon {
  const ring: number[][] = [];
  const R = 6371; // Earth radius km
  const angular = radiusKm / R;
  const latRad = (center.lat * Math.PI) / 180;
  const lonRad = (center.lon * Math.PI) / 180;
  for (let i = 0; i < points; i++) {
    const bearing = (2 * Math.PI * i) / points;
    const lat = Math.asin(
      Math.sin(latRad) * Math.cos(angular) +
        Math.cos(latRad) * Math.sin(angular) * Math.cos(bearing),
    );
    const lon = lonRad + Math.atan2(
      Math.sin(bearing) * Math.sin(angular) * Math.cos(latRad),
      Math.cos(angular) - Math.sin(latRad) * Math.sin(lat),
    );
    ring.push([(lon * 180) / Math.PI, (lat * 180) / Math.PI]);
  }
  ring.push(ring[0]!.slice()); // close
  return { type: 'Polygon', coordinates: [ring] };
}

// ───────────────────────── seed text generation ─────────────────────────

async function fetchWikipediaExtract(title: string): Promise<string> {
  const cacheFile = path.join(EXTRACT_CACHE, `${sha1(title)}.json`);
  const cached = readCacheTtl<{ extract: string }>(cacheFile);
  if (cached) return cached.extract;

  const safe = encodeURIComponent(title);
  const url = `https://en.wikipedia.org/w/api.php?action=query&prop=extracts&titles=${safe}&exintro=true&explaintext=true&format=json&redirects=1`;
  const res = await fetch(url, { headers: { 'User-Agent': USER_AGENT } });
  if (!res.ok) throw new Error(`Wikipedia extracts HTTP ${res.status} for ${title}`);
  const json = (await res.json()) as { query: { pages: Record<string, { extract?: string }> } };
  const pages = Object.values(json.query.pages);
  const extract = pages[0]?.extract ?? '';
  writeCache(cacheFile, { extract });
  return extract;
}

async function generateSeedText(regionName: string, articleTitle: string): Promise<{
  text: string;
  sourceLength: number;
  inputTokens: number;
  outputTokens: number;
  costUsd: number;
}> {
  const extract = await fetchWikipediaExtract(articleTitle);
  let sourceContext = extract;
  if (sourceContext.length < 200) {
    // Augment with cached summary if extract is thin
    try {
      const summary = JSON.parse(fs.readFileSync(path.join(SUMMARY_CACHE, `${sha1(articleTitle)}.json`), 'utf-8'));
      sourceContext = (summary.extract ?? '') + '\n\n' + sourceContext;
    } catch { /* no summary cached, proceed with what we have */ }
  }
  const userPrompt = buildSeedTextUserPrompt(regionName, sourceContext);
  const resp = await callHaiku(SEED_TEXT_SYSTEM_PROMPT, userPrompt, regionName);
  // Log to llm_calls (fire-and-forget — keep going even if DB log fails)
  logLlmCall(sourceContext.length, resp).catch((err) => {
    console.warn(chalk.yellow(`    log warn: ${(err as Error).message}`));
  });
  return {
    text: resp.text,
    sourceLength: sourceContext.length,
    inputTokens: resp.inputTokens,
    outputTokens: resp.outputTokens,
    costUsd: resp.costUsd,
  };
}

// ───────────────────────── pre-generated sample loader ─────────────────────────

interface PreGeneratedSample {
  regionName: string;
  seedText: string;
  inputTokens: number;
  outputTokens: number;
  costUsd: number;
}

function loadPreGeneratedSamples(): Map<string, PreGeneratedSample> {
  const m = new Map<string, PreGeneratedSample>();
  try {
    const data = JSON.parse(fs.readFileSync(SAMPLES_JSON, 'utf-8')) as {
      samples: Array<{ regionName: string; seedText: string; inputTokens: number; outputTokens: number; costUsd: number }>;
    };
    for (const s of data.samples) m.set(s.regionName, s);
  } catch (err) {
    console.warn(chalk.yellow(`  pre-generated samples not loaded: ${(err as Error).message}`));
  }
  return m;
}

// ───────────────────────── verification result loader ─────────────────────────

interface VerificationEntry {
  rank: number;
  displayName: string;
  articleTitle: string;
  finalTier: 'A' | 'B' | 'C';
  resolution: {
    method: string;
    polygonSource: string;
    polygonSourceMethod: string;
    osmType?: 'relation' | 'way';
    osmId?: number;
    wikidataQ?: string;
    wikidataCentroid?: { lat: number; lon: number };
    bufferRadius_km?: number;
    flags: string[];
  };
  adequacy?: {
    finalArea_km2: number | null;
    realArea_km2: number | null;
    ratio: number | null;
    inadequate: boolean;
  };
  notes?: string;
}

interface VerificationDoc {
  results: VerificationEntry[];
}

function loadVerification(): VerificationEntry[] {
  const doc = JSON.parse(fs.readFileSync(VERIFICATION_JSON, 'utf-8')) as VerificationDoc;
  return doc.results;
}

// ───────────────────────── parent_region_id resolution ─────────────────────────

async function resolveParentRegionId(polygonEwkt: string): Promise<string | null> {
  const pool = getPgPool();
  const client = await pool.connect();
  try {
    // Centroid-first: which geomorphic province contains the region centroid?
    const centroidRes = await client.query<{ lon: number; lat: number }>(
      `SELECT ST_X(ST_Centroid(ST_GeomFromEWKT($1))) AS lon,
              ST_Y(ST_Centroid(ST_GeomFromEWKT($1))) AS lat`,
      [polygonEwkt],
    );
    const c = centroidRes.rows[0]!;
    const byCentroid = await client.query<{ id: string }>(
      `SELECT id FROM public.regions
        WHERE region_type = 'geomorphic_province'
          AND ST_Within(ST_SetSRID(ST_MakePoint($1, $2), 4326), polygon::geometry)
        LIMIT 1`,
      [c.lon, c.lat],
    );
    if (byCentroid.rows.length > 0) return byCentroid.rows[0]!.id;

    // Area-intersection fallback
    const byArea = await client.query<{ id: string }>(
      `SELECT id FROM public.regions
        WHERE region_type = 'geomorphic_province'
          AND ST_Intersects(ST_GeomFromEWKT($1), polygon::geometry)
        ORDER BY ST_Area(ST_Intersection(ST_GeomFromEWKT($1), polygon::geometry)) DESC
        LIMIT 1`,
      [polygonEwkt],
    );
    if (byArea.rows.length > 0) return byArea.rows[0]!.id;

    return null;
  } finally {
    client.release();
  }
}

// ───────────────────────── per-region pipeline ─────────────────────────

interface BuildResult {
  region: NormalizedRegion;
  parentResolutionMethod: 'centroid' | 'area_intersection' | 'no_parent' | 'deferred';
  costUsd: number;
  inputTokens: number;
  outputTokens: number;
  seedReused: boolean;
}

async function buildRegion(
  entry: VerificationEntry,
  preSamples: Map<string, PreGeneratedSample>,
): Promise<BuildResult> {
  // 1. Build polygon
  let polygon_geojson: GeoJSON.Polygon | GeoJSON.MultiPolygon | null = null;
  let source: RegionSource;
  let source_id: string;
  const metadata: Record<string, unknown> = {
    polygon_source: entry.resolution.polygonSource,
    polygon_source_method: entry.resolution.polygonSourceMethod,
  };

  const usedOsm =
    entry.resolution.method === 'osm_geological' ||
    entry.resolution.method === 'osm_admin_accepted';

  if (usedOsm && entry.resolution.osmType && entry.resolution.osmId !== undefined) {
    const result = await fetchOsmGeometry(
      entry.resolution.osmType,
      entry.resolution.osmId,
      entry.displayName,
      entry.resolution.osmBbox,
    );
    if (!result) {
      throw new Error(`OSM polygon assembly failed for ${entry.displayName} (${entry.resolution.osmType}/${entry.resolution.osmId})`);
    }
    polygon_geojson = result.geom;
    if (result.method === 'osm_bbox_fallback') {
      metadata['polygon_quality'] = 'osm_linear_to_bbox_v1';
      metadata['polygon_quality_note'] = 'OSM way is an unclosed LineString (linear feature); bbox rectangle used as approximation';
    }
    source = 'osm';
    source_id = `osm-${entry.resolution.osmType}-${entry.resolution.osmId}`;
    metadata['osm_type'] = entry.resolution.osmType;
    metadata['osm_id'] = entry.resolution.osmId;
  } else if (entry.resolution.method === 'wikidata_buffer' && entry.resolution.wikidataCentroid && entry.resolution.bufferRadius_km !== undefined) {
    polygon_geojson = buildGeodesicCircle(entry.resolution.wikidataCentroid, entry.resolution.bufferRadius_km, 64);
    source = 'wikidata';
    source_id = entry.resolution.wikidataQ ?? `wikidata-buffer-${kebab(entry.displayName)}`;
    metadata['wikidata_q'] = entry.resolution.wikidataQ;
    metadata['buffer_radius_km'] = entry.resolution.bufferRadius_km;
    metadata['centroid'] = entry.resolution.wikidataCentroid;
  } else {
    throw new Error(`Unsupported resolution for ${entry.displayName}: method=${entry.resolution.method}`);
  }

  // 2. Polygon-quality flag for the v1.1 followups
  if (entry.adequacy?.inadequate) {
    metadata['polygon_quality'] = 'inadequate_buffer_v1';
    metadata['adequacy_ratio'] = entry.adequacy.ratio;
    metadata['real_area_km2_estimate'] = entry.adequacy.realArea_km2;
  }

  // 3. Notes
  if (entry.notes) metadata['notes'] = entry.notes;
  if (entry.resolution.flags.length > 0) metadata['verification_flags'] = entry.resolution.flags;

  // 4. Seed text
  let description: string;
  let costUsd = 0;
  let inputTokens = 0;
  let outputTokens = 0;
  let seedReused = false;
  const pre = preSamples.get(entry.displayName);
  if (pre) {
    description = pre.seedText;
    costUsd = 0; // already spent in Phase 3
    inputTokens = pre.inputTokens;
    outputTokens = pre.outputTokens;
    seedReused = true;
  } else {
    const seed = await generateSeedText(entry.displayName, entry.articleTitle);
    description = seed.text;
    costUsd = seed.costUsd;
    inputTokens = seed.inputTokens;
    outputTokens = seed.outputTokens;
  }

  // 5. NormalizedRegion (parent_region_id resolved post-EWKT-build, in main loop)
  const region: NormalizedRegion = {
    region_type: 'named_valley_or_basin',
    name: entry.displayName,
    display_name: null,
    description,
    polygon_geojson,
    polygon_srid: 4326,
    significance_tier: 75,
    source,
    source_id,
    parent_region_id: null, // resolved next
    metadata,
  };

  return {
    region,
    parentResolutionMethod: 'deferred',
    costUsd,
    inputTokens,
    outputTokens,
    seedReused,
  };
}

// ───────────────────────── main ─────────────────────────

async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  const dryRun = !argv.includes('--commit');

  console.log(chalk.bold('E1d Phase 4 — live import of 27 non-Tier-C named valleys'));
  console.log(chalk.gray(`  Mode: ${dryRun ? 'DRY-RUN (no DB writes)' : 'LIVE (will upsert)'}`));
  console.log('');

  const verification = loadVerification();
  const preSamples = loadPreGeneratedSamples();
  console.log(chalk.gray(`  Loaded ${verification.length} verification entries, ${preSamples.size} pre-generated samples`));
  console.log('');

  // Filter to the 27 we're importing (skip Tier C)
  const targets = verification.filter((v) => !TIER_C_SKIP.has(v.displayName));
  console.log(chalk.gray(`  Importing ${targets.length} regions (skipping ${verification.length - targets.length} Tier-C)`));
  console.log('');

  // Phase A: build all NormalizedRegions (polygon + seed text)
  console.log(chalk.bold('── A. Build polygons + seed text ──'));
  const builds: BuildResult[] = [];
  let totalCost = 0;
  let llmCalls = 0;
  for (const entry of targets) {
    process.stdout.write(chalk.gray(`  [${String(entry.rank).padStart(2)}/${verification.length}] ${entry.displayName.padEnd(28)} `));
    try {
      const result = await buildRegion(entry, preSamples);
      builds.push(result);
      totalCost += result.costUsd;
      if (!result.seedReused) llmCalls++;
      const reusedBadge = result.seedReused ? chalk.gray('reused') : chalk.cyan(`$${result.costUsd.toFixed(4)}`);
      console.log(`${chalk.green('✓')} ${reusedBadge}  ${result.region.source}:${result.region.source_id}`);
    } catch (err) {
      console.log(chalk.red(`✗ ${(err as Error).message}`));
      throw err;
    }
  }
  console.log('');
  console.log(chalk.gray(`  Haiku spend this run: $${totalCost.toFixed(4)} across ${llmCalls} calls`));
  console.log('');

  // Phase B: resolve parent_region_id
  console.log(chalk.bold('── B. Resolve parent_region_id (centroid → geomorphic_province) ──'));
  for (const b of builds) {
    const ewkt = geoJsonToEwktMultiPolygon(b.region.polygon_geojson, 4326);
    try {
      const parentId = await resolveParentRegionId(ewkt);
      b.region.parent_region_id = parentId;
      const status = parentId ? chalk.green(`✓ parent=${parentId.slice(0, 8)}`) : chalk.gray('(no parent)');
      console.log(`  [${String(b.region.name.padEnd(28))}] ${status}`);
    } catch (err) {
      console.log(chalk.yellow(`  [${b.region.name}] parent-resolve failed: ${(err as Error).message}`));
    }
  }
  console.log('');

  if (dryRun) {
    // Dry-run report
    console.log(chalk.bold('── DRY-RUN — would upsert ──'));
    for (const b of builds) {
      console.log(
        chalk.gray(
          `  ${b.region.name.padEnd(28)} ` +
            `source=${b.region.source.padEnd(10)} ` +
            `desc=${String(b.region.description.length).padStart(4)}c ` +
            `seed=${b.seedReused ? 'reused' : `${b.outputTokens}tok`} ` +
            `meta.quality=${(b.region.metadata as Record<string, unknown>)['polygon_quality'] ?? '-'} ` +
            `parent=${b.region.parent_region_id?.slice(0, 8) ?? '-'}`,
        ),
      );
    }
    console.log('');
    console.log(chalk.yellow('  [DRY-RUN] Run with --commit to actually upsert.'));
    writeCache(OUT_JSON, { generatedAt: new Date().toISOString(), dryRun, builds: builds.map((b) => ({ ...b.region, _adequacy_note: b.region.metadata })) });
    return;
  }

  // Phase C: live upsert
  console.log(chalk.bold('── C. Upsert to regions table ──'));
  const { upsertRegions } = await import('./lib/upsert.js');
  const regions = builds.map((b) => b.region);
  const result = await upsertRegions(regions, { dryRun: false });
  console.log(chalk.gray(`  inserted=${result.inserted} updated=${result.updated} errors=${result.errors}`));
  console.log('');

  // Phase D: per-row verification
  console.log(chalk.bold('── D. Per-row verification ──'));
  await verifyInsertedRows(builds.map((b) => b.region));

  writeCache(OUT_JSON, {
    generatedAt: new Date().toISOString(),
    dryRun,
    upsertResult: result,
    totalHaikuSpendUsd: totalCost,
    llmCalls,
    regions: builds.map((b) => ({
      name: b.region.name,
      source: b.region.source,
      source_id: b.region.source_id,
      parent_region_id: b.region.parent_region_id,
      description_length: b.region.description.length,
      seed_reused: b.seedReused,
    })),
  });

  console.log('');
  console.log(chalk.bold.green(`Done. ${result.inserted} inserted, ${result.updated} updated, ${result.errors} errors. Total spend $${totalCost.toFixed(4)}.`));
}

async function verifyInsertedRows(regions: NormalizedRegion[]): Promise<void> {
  const pool = getPgPool();
  const client = await pool.connect();
  try {
    // Row count of named_valley_or_basin
    const countRes = await client.query<{ n: string }>(
      `SELECT COUNT(*)::text AS n FROM public.regions WHERE region_type = 'named_valley_or_basin'`,
    );
    console.log(`  Total named_valley_or_basin rows: ${countRes.rows[0]!.n}`);

    // Description char range
    const descRes = await client.query<{ minlen: string; maxlen: string; avglen: string }>(
      `SELECT MIN(LENGTH(description))::text AS minlen,
              MAX(LENGTH(description))::text AS maxlen,
              AVG(LENGTH(description))::int::text AS avglen
         FROM public.regions WHERE region_type = 'named_valley_or_basin'`,
    );
    const d = descRes.rows[0]!;
    console.log(`  Description length: min=${d.minlen} avg=${d.avglen} max=${d.maxlen} chars`);

    // Polygon area sanity (geography → m² → km²)
    const areaRes = await client.query<{ name: string; area_km2: string }>(
      `SELECT name, (ST_Area(polygon) / 1000000.0)::numeric(10,1)::text AS area_km2
         FROM public.regions
        WHERE region_type = 'named_valley_or_basin'
        ORDER BY ST_Area(polygon) DESC
        LIMIT 5`,
    );
    console.log(`  Top 5 by area:`);
    for (const r of areaRes.rows) console.log(`    - ${r.name}: ${r.area_km2} km²`);

    // parent_region_id coverage
    const parentRes = await client.query<{ with_parent: string; without_parent: string }>(
      `SELECT
         COUNT(*) FILTER (WHERE parent_region_id IS NOT NULL)::text AS with_parent,
         COUNT(*) FILTER (WHERE parent_region_id IS NULL)::text AS without_parent
       FROM public.regions WHERE region_type = 'named_valley_or_basin'`,
    );
    const p = parentRes.rows[0]!;
    console.log(`  parent_region_id coverage: ${p.with_parent} with parent, ${p.without_parent} without`);

    // Polygon validity (ST_IsValid)
    const validRes = await client.query<{ valid: string; invalid: string }>(
      `SELECT
         COUNT(*) FILTER (WHERE ST_IsValid(polygon::geometry))::text AS valid,
         COUNT(*) FILTER (WHERE NOT ST_IsValid(polygon::geometry))::text AS invalid
       FROM public.regions WHERE region_type = 'named_valley_or_basin'`,
    );
    const v = validRes.rows[0]!;
    console.log(`  Polygon validity (ST_IsValid): ${v.valid} valid, ${v.invalid} invalid`);

    // Total regions in DB (E1a + E1b + E1d)
    const allRes = await client.query<{ region_type: string; n: string }>(
      `SELECT region_type, COUNT(*)::text AS n FROM public.regions GROUP BY region_type ORDER BY region_type`,
    );
    console.log('');
    console.log(`  All regions in DB:`);
    let total = 0;
    for (const r of allRes.rows) {
      total += Number(r.n);
      console.log(`    ${r.region_type.padEnd(24)} ${r.n}`);
    }
    console.log(`    ${'TOTAL'.padEnd(24)} ${total}`);

    void regions;
  } finally {
    client.release();
  }
}

main().catch((err: unknown) => {
  const msg = err instanceof Error ? err.message : String(err);
  console.error(chalk.red(`Fatal: ${msg}`));
  process.exit(1);
});
