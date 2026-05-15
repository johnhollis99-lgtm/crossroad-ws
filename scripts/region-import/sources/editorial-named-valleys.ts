#!/usr/bin/env node
/**
 * E1d Tier C — editorial named valleys (Lake Tahoe Basin, Hetch Hetchy
 * Valley, Sierra Valley).
 *
 * Reads pre-derived polygons from data/editorial-named-valleys.geojson
 * (produced by derive-tier-c-polygons.ts; greenlit by curator 2026-05-15
 * with all three polygons accepted as-is).
 *
 * Mirrors the Phase 4 (live-import-named-valleys.ts) pipeline shape, with
 * three simplifications:
 *
 *   1. Polygons are not fetched from OSM/Wikidata at run time — they come
 *      straight from the FeatureCollection. The derivation already happened
 *      in derive-tier-c-polygons.ts and was reviewed by the curator.
 *   2. There's no verification result JSON to load — `data/editorial-
 *      named-valleys.geojson` is the input.
 *   3. There are no pre-generated seed-text samples to reuse — all three
 *      seed texts are drafted in this run (3 × ~$0.0023 ≈ $0.007).
 *
 * Everything else (Wikipedia extract → Haiku seed text via
 * SEED_TEXT_SYSTEM_PROMPT, centroid → geomorphic_province parent
 * resolution, upsertRegions with source='editorial') is identical to
 * Phase 4.
 *
 * Placement: per user direction (2026-05-15), this lives in sources/
 * alongside the registered-source files, but it follows the standalone-
 * runner convention (dry-run by default, --commit to write) inherited
 * from live-import-named-valleys.ts. It is NOT registered in run.ts —
 * Phase 4's defensive default-to-dry-run posture for Haiku-spending
 * writes is preserved.
 *
 * Run from scripts/region-import/:
 *   npx tsx sources/editorial-named-valleys.ts          # dry-run by default
 *   npx tsx sources/editorial-named-valleys.ts --commit # actually write
 */
import { config as dotenvConfig } from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';
import path from 'node:path';
import fs from 'node:fs';
import crypto from 'node:crypto';
import chalk from 'chalk';

import {
  callHaiku,
  SEED_TEXT_SYSTEM_PROMPT,
  buildSeedTextUserPrompt,
  logLlmCall,
} from '../lib/anthropic.js';
import { upsertRegions } from '../lib/upsert.js';
import { geoJsonToEwktMultiPolygon } from '../lib/polygons.js';
import { getPgPool } from '../lib/supabase.js';
import type { NormalizedRegion } from '../lib/types.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
dotenvConfig({ path: resolve(__dirname, '../../../.env') });

const PKG_ROOT = path.resolve(__dirname, '..');
const GEOJSON_FILE = path.join(PKG_ROOT, 'data', 'editorial-named-valleys.geojson');
const CACHE_DIR = path.join(PKG_ROOT, 'cache');
const EXTRACT_CACHE = path.join(CACHE_DIR, 'wikipedia-extracts');
const OUT_JSON = path.join(CACHE_DIR, 'live-import-tier-c-result.json');

const USER_AGENT = 'XRoad-Region-Import/0.1 (https://github.com/johnhollis99-lgtm/crossroad-ws; contact: john)';
const CACHE_TTL_MS = 30 * 24 * 3600 * 1000;

/**
 * Hardcoded Wikipedia article-title map. The descriptive landform article
 * for each Tier C region — these were the source articles for the
 * pageview rankings in the candidate worksheet, so the extract is the
 * right factual context for Haiku.
 *
 * Note: "Lake Tahoe Basin" itself has no Wikipedia article — the lake
 * article covers the basin landform.
 */
const ARTICLE_TITLES: Record<string, string> = {
  'Lake Tahoe Basin': 'Lake Tahoe',
  'Hetch Hetchy Valley': 'Hetch Hetchy',
  'Sierra Valley': 'Sierra Valley',
};

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

// ───────────────────────── GeoJSON loader ─────────────────────────

interface TierCFeatureProperties {
  name: string;
  source_id: string;
  region_type: string;
  significance_tier: number;
  polygon_source: string;
  polygon_source_method: string;
  precision_tolerance_km?: number;
  notes: string;
  digitized_at: string;
}

interface TierCFeature {
  type: 'Feature';
  geometry: GeoJSON.Polygon | GeoJSON.MultiPolygon;
  properties: TierCFeatureProperties;
}

function loadTierCFeatures(): TierCFeature[] {
  const fc = JSON.parse(fs.readFileSync(GEOJSON_FILE, 'utf-8')) as GeoJSON.FeatureCollection;
  return fc.features.map((f) => {
    const g = f.geometry;
    if (g.type !== 'Polygon' && g.type !== 'MultiPolygon') {
      throw new Error(`Feature "${(f.properties as Record<string, unknown>)?.['name']}" has non-polygonal geometry ${g.type}`);
    }
    return { type: 'Feature', geometry: g, properties: f.properties as TierCFeatureProperties };
  });
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

interface SeedTextResult {
  text: string;
  sourceLength: number;
  inputTokens: number;
  outputTokens: number;
  costUsd: number;
}

async function generateSeedText(regionName: string, articleTitle: string): Promise<SeedTextResult> {
  const extract = await fetchWikipediaExtract(articleTitle);
  if (extract.length < 100) {
    throw new Error(`Wikipedia extract for "${articleTitle}" too short (${extract.length} chars) — verify article title`);
  }
  const userPrompt = buildSeedTextUserPrompt(regionName, extract);
  const resp = await callHaiku(SEED_TEXT_SYSTEM_PROMPT, userPrompt, regionName);
  logLlmCall(extract.length, resp).catch((err) => {
    console.warn(chalk.yellow(`    log warn: ${(err as Error).message}`));
  });
  return {
    text: resp.text,
    sourceLength: extract.length,
    inputTokens: resp.inputTokens,
    outputTokens: resp.outputTokens,
    costUsd: resp.costUsd,
  };
}

// ───────────────────────── geometry sanitization ─────────────────────────

/**
 * Run a polygon through ST_MakeValid via PostGIS, returning the cleaned
 * GeoJSON. Repairs ring self-intersections (the LTBMU polygon has one at
 * -120.122484, 39.0128796 — a single defect across 259 rings) without
 * changing the polygon's area or topology elsewhere.
 *
 * One DB round-trip per region; cheap given the 3-row Tier C scope.
 * Adding this here (rather than in lib/upsert.ts) keeps the change local
 * to the importer that introduces the LTBMU-class polygons; if other
 * importers hit the same defect, lift this helper into the upsert path.
 */
async function makeValidViaPostgis(
  geom: GeoJSON.Polygon | GeoJSON.MultiPolygon,
): Promise<GeoJSON.Polygon | GeoJSON.MultiPolygon> {
  const pool = getPgPool();
  const client = await pool.connect();
  try {
    const res = await client.query<{ geojson: string }>(
      `SELECT ST_AsGeoJSON(ST_MakeValid(ST_GeomFromGeoJSON($1))) AS geojson`,
      [JSON.stringify(geom)],
    );
    return JSON.parse(res.rows[0]!.geojson) as GeoJSON.Polygon | GeoJSON.MultiPolygon;
  } finally {
    client.release();
  }
}

// ───────────────────────── parent_region_id resolution ─────────────────────────

async function resolveParentRegionId(polygonEwkt: string): Promise<{ id: string | null; method: 'centroid' | 'area_intersection' | 'no_parent' }> {
  const pool = getPgPool();
  const client = await pool.connect();
  try {
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
    if (byCentroid.rows.length > 0) return { id: byCentroid.rows[0]!.id, method: 'centroid' };

    const byArea = await client.query<{ id: string }>(
      `SELECT id FROM public.regions
        WHERE region_type = 'geomorphic_province'
          AND ST_Intersects(ST_GeomFromEWKT($1), polygon::geometry)
        ORDER BY ST_Area(ST_Intersection(ST_GeomFromEWKT($1), polygon::geometry)) DESC
        LIMIT 1`,
      [polygonEwkt],
    );
    if (byArea.rows.length > 0) return { id: byArea.rows[0]!.id, method: 'area_intersection' };

    return { id: null, method: 'no_parent' };
  } finally {
    client.release();
  }
}

// ───────────────────────── per-region pipeline ─────────────────────────

interface BuildResult {
  region: NormalizedRegion;
  parentResolutionMethod: 'centroid' | 'area_intersection' | 'no_parent';
  costUsd: number;
  inputTokens: number;
  outputTokens: number;
}

async function buildRegion(feat: TierCFeature): Promise<BuildResult> {
  const props = feat.properties;

  const articleTitle = ARTICLE_TITLES[props.name];
  if (!articleTitle) {
    throw new Error(`No Wikipedia article title mapped for region "${props.name}" — add to ARTICLE_TITLES`);
  }

  const seed = await generateSeedText(props.name, articleTitle);

  // ST_MakeValid the polygon before EWKT serialization. The LTBMU
  // multipolygon has a single ring self-intersection that ::geography cast
  // does not auto-repair; without this, the row lands with
  // ST_IsValid = false and breaks the verification step.
  const sanitizedGeom = await makeValidViaPostgis(feat.geometry);

  const metadata: Record<string, unknown> = {
    polygon_source: props.polygon_source,
    polygon_source_method: props.polygon_source_method,
    notes: props.notes,
    digitized_at: props.digitized_at,
  };
  if (props.precision_tolerance_km !== undefined) {
    metadata['precision_tolerance_km'] = props.precision_tolerance_km;
  }

  const region: NormalizedRegion = {
    region_type: 'named_valley_or_basin',
    name: props.name,
    display_name: null,
    description: seed.text,
    polygon_geojson: sanitizedGeom,
    polygon_srid: 4326,
    significance_tier: props.significance_tier ?? 75,
    source: 'editorial',
    source_id: props.source_id,
    parent_region_id: null, // resolved next, in main loop
    metadata,
  };

  return {
    region,
    parentResolutionMethod: 'no_parent', // placeholder; reassigned post-resolve
    costUsd: seed.costUsd,
    inputTokens: seed.inputTokens,
    outputTokens: seed.outputTokens,
  };
}

// ───────────────────────── verification ─────────────────────────

async function verifyInsertedRows(regions: NormalizedRegion[]): Promise<void> {
  const pool = getPgPool();
  const client = await pool.connect();
  try {
    const sourceIds = regions.map((r) => r.source_id).filter((s): s is string => s !== null);

    // Per-row verification: region_type, source, parent_region_id, ST_IsValid, desc length
    const rowRes = await client.query<{
      name: string;
      region_type: string;
      source: string;
      source_id: string;
      has_parent: boolean;
      parent_name: string | null;
      desc_chars: string;
      st_isvalid: boolean;
      area_km2: string;
      polygon_source: string | null;
    }>(
      `SELECT r.name,
              r.region_type,
              r.source,
              r.source_id,
              (r.parent_region_id IS NOT NULL) AS has_parent,
              parent.name AS parent_name,
              LENGTH(r.description)::text AS desc_chars,
              ST_IsValid(r.polygon::geometry) AS st_isvalid,
              (ST_Area(r.polygon) / 1000000.0)::numeric(10,2)::text AS area_km2,
              r.metadata->>'polygon_source' AS polygon_source
         FROM public.regions r
         LEFT JOIN public.regions parent ON parent.id = r.parent_region_id
        WHERE r.source = 'editorial' AND r.source_id = ANY($1)
        ORDER BY r.name`,
      [sourceIds],
    );
    console.log('');
    console.log(chalk.bold('  Per-row verification:'));
    for (const r of rowRes.rows) {
      const checks = [
        r.region_type === 'named_valley_or_basin' ? chalk.green('type✓') : chalk.red(`type✗(${r.region_type})`),
        r.source === 'editorial' ? chalk.green('src✓') : chalk.red(`src✗(${r.source})`),
        r.has_parent ? chalk.green(`parent✓(${r.parent_name})`) : chalk.red('parent✗'),
        r.st_isvalid ? chalk.green('valid✓') : chalk.red('valid✗'),
        Number(r.desc_chars) >= 1500 && Number(r.desc_chars) <= 2100
          ? chalk.green(`desc✓(${r.desc_chars}c)`)
          : chalk.yellow(`desc⚠(${r.desc_chars}c — expected 1500–2100)`),
      ];
      console.log(`    ${r.name.padEnd(22)} ${r.area_km2.padStart(8)} km²  ${checks.join(' ')}`);
    }

    // Totals across the regions table
    const allRes = await client.query<{ region_type: string; n: string }>(
      `SELECT region_type, COUNT(*)::text AS n FROM public.regions GROUP BY region_type ORDER BY region_type`,
    );
    console.log('');
    console.log(chalk.bold('  Regions table totals by region_type:'));
    let total = 0;
    for (const r of allRes.rows) {
      total += Number(r.n);
      console.log(`    ${r.region_type.padEnd(24)} ${r.n}`);
    }
    console.log(`    ${chalk.bold('TOTAL'.padEnd(24))} ${total}`);

    // Cumulative Haiku spend across E1a + E1b + E1d (all claude calls; logged via lib/anthropic.ts)
    const spendRes = await client.query<{ n: string; cost: string }>(
      `SELECT COUNT(*)::text AS n, SUM(cost_usd)::numeric(10,4)::text AS cost
         FROM public.llm_calls
        WHERE call_type = 'claude'
          AND provider = 'anthropic'
          AND model_or_voice = 'claude-haiku-4-5-20251001'`,
    );
    const sp = spendRes.rows[0]!;
    console.log('');
    console.log(chalk.bold(`  Cumulative Haiku spend across E1a + E1b + E1d: $${sp.cost} across ${sp.n} calls`));
  } finally {
    client.release();
  }
}

// ───────────────────────── main ─────────────────────────

async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  const dryRun = !argv.includes('--commit');

  console.log(chalk.bold('E1d Tier C — editorial named valleys live import'));
  console.log(chalk.gray(`  Mode: ${dryRun ? 'DRY-RUN (no DB writes, NO Haiku spend)' : 'LIVE (will upsert + spend Haiku)'}`));
  console.log(chalk.gray(`  Input: ${path.relative(process.cwd(), GEOJSON_FILE)}`));
  console.log('');

  const features = loadTierCFeatures();
  console.log(chalk.gray(`  Loaded ${features.length} Tier C features`));
  for (const f of features) {
    console.log(chalk.gray(`    - ${f.properties.name.padEnd(22)} ${f.properties.source_id.padEnd(28)} ${f.properties.polygon_source}`));
  }
  console.log('');

  if (dryRun) {
    // Dry-run skips Haiku entirely — print what would happen and exit
    console.log(chalk.bold('── DRY-RUN — would generate seed text + upsert ──'));
    for (const f of features) {
      const articleTitle = ARTICLE_TITLES[f.properties.name];
      const ewkt = geoJsonToEwktMultiPolygon(f.geometry, 4326);
      const parent = await resolveParentRegionId(ewkt);
      const parentInfo = parent.id
        ? `parent=${parent.id.slice(0, 8)} (method=${parent.method})`
        : chalk.yellow('parent=NONE');
      console.log(`  ${f.properties.name.padEnd(22)}  article="${articleTitle}"  ${parentInfo}`);
    }
    console.log('');
    console.log(chalk.yellow('  [DRY-RUN] Run with --commit to spend Haiku and upsert (estimated ~$0.007).'));
    return;
  }

  // Phase A — build (Haiku + seed text + metadata)
  console.log(chalk.bold('── A. Build polygons + seed text ──'));
  const builds: BuildResult[] = [];
  let totalCost = 0;
  for (const feat of features) {
    process.stdout.write(chalk.gray(`  ${feat.properties.name.padEnd(22)} `));
    try {
      const result = await buildRegion(feat);
      builds.push(result);
      totalCost += result.costUsd;
      console.log(`${chalk.green('✓')} ${chalk.cyan(`$${result.costUsd.toFixed(4)}`)}  desc=${result.region.description.length}c  ${result.outputTokens}out_tok`);
    } catch (err) {
      console.log(chalk.red(`✗ ${(err as Error).message}`));
      throw err;
    }
  }
  console.log('');
  console.log(chalk.gray(`  Haiku spend this run: $${totalCost.toFixed(4)} across ${builds.length} calls`));
  console.log('');

  // Phase B — resolve parent_region_id
  console.log(chalk.bold('── B. Resolve parent_region_id (centroid → geomorphic_province) ──'));
  for (const b of builds) {
    const ewkt = geoJsonToEwktMultiPolygon(b.region.polygon_geojson, 4326);
    try {
      const parent = await resolveParentRegionId(ewkt);
      b.region.parent_region_id = parent.id;
      b.parentResolutionMethod = parent.method;
      const status = parent.id ? chalk.green(`✓ parent=${parent.id.slice(0, 8)} (${parent.method})`) : chalk.yellow('✗ no parent');
      console.log(`  ${b.region.name.padEnd(22)} ${status}`);
    } catch (err) {
      console.log(chalk.yellow(`  ${b.region.name} parent-resolve failed: ${(err as Error).message}`));
    }
  }
  console.log('');

  // Phase C — upsert
  console.log(chalk.bold('── C. Upsert to regions table ──'));
  const regions = builds.map((b) => b.region);
  const result = await upsertRegions(regions, { dryRun: false });
  console.log(chalk.gray(`  inserted=${result.inserted} updated=${result.updated} errors=${result.errors}`));

  // Phase D — verification
  console.log('');
  console.log(chalk.bold('── D. Verification ──'));
  await verifyInsertedRows(regions);

  writeCache(OUT_JSON, {
    generatedAt: new Date().toISOString(),
    dryRun: false,
    upsertResult: result,
    totalHaikuSpendUsd: totalCost,
    regions: builds.map((b) => ({
      name: b.region.name,
      source: b.region.source,
      source_id: b.region.source_id,
      parent_region_id: b.region.parent_region_id,
      parent_resolution_method: b.parentResolutionMethod,
      description_length: b.region.description.length,
      input_tokens: b.inputTokens,
      output_tokens: b.outputTokens,
      cost_usd: b.costUsd,
    })),
  });

  console.log('');
  console.log(chalk.bold.green(
    `Done. ${result.inserted} inserted, ${result.updated} updated, ${result.errors} errors. ` +
    `Spend $${totalCost.toFixed(4)}.`,
  ));
}

main().catch((err: unknown) => {
  const msg = err instanceof Error ? err.message : String(err);
  console.error(chalk.red(`Fatal: ${msg}`));
  process.exit(1);
});
