/**
 * E1b — EPA Level III Ecoregions of California.
 *
 * Spec: docs/roadstory-narration-curation-addendum.md §3.3 + user direction.
 *
 * Sources:
 *   - Shapefile: https://dmap-prod-oms-edc.s3.us-east-1.amazonaws.com/ORD/Ecoregions/ca/ca_eco_l3.zip
 *     (NAD83 / CONUS Albers Equal Area Conic, EPSG:5070, in meters)
 *   - Descriptions: https://dmap-prod-oms-edc.s3.us-east-1.amazonaws.com/ORD/Ecoregions/ca/CA_eco_PosterText_Final_Feb2016.docx
 *     (USGS Open-File Report 2016–1021, Griffith et al. — public domain)
 *
 * Per-region values:
 *   region_type        = 'ecoregion'
 *   source             = 'epa'
 *   source_id          = `l3-${US_L3CODE}` (e.g. l3-1, l3-78, l3-85)
 *   significance_tier  = 60 (locked in per E1b sketch greenlight)
 *   parent_region_id   = containing CGS province (centroid-first via
 *                        ST_Within; area-intersection fallback if the
 *                        centroid lands outside every province polygon)
 *   metadata           = { source_url, fact_sheet_origin,
 *                          parent_resolution_method }
 *
 * Description: extracted from the EPA descriptions DOCX per US_L3CODE,
 * passed to Claude Haiku as factual context (third-person prompt from
 * lib/anthropic.ts). If a description isn't found in the DOCX for a
 * given L3 code, the importer falls back to attribute-only seeding for
 * that one row (US_L3NAME + NA_L1/L2 hierarchy) and flags it in the
 * dry-run output.
 *
 * Flow (per user direction):
 *   1. Parse shapefile + DOCX
 *   2. Resolve parents for all 13 ecoregions
 *   3. PRINT DRY-RUN REPORT — name + centroid + parent + method per row
 *   4. Continue: Haiku draft + upsert
 *   5. Verification query
 *
 * The dry-run "pause" is informational (no human-in-loop gate); user
 * said "proceed in the same turn" if nothing looks off.
 */
import fs from 'node:fs';
import path from 'node:path';
import AdmZip from 'adm-zip';
import * as shapefile from 'shapefile';
import chalk from 'chalk';

import type { ImportOptions, ImportResult, NormalizedRegion } from '../lib/types.js';
import { emptyResult } from '../lib/types.js';
import { upsertRegions } from '../lib/upsert.js';
import { getPgPool } from '../lib/supabase.js';
import { draftRegionSeedText, SEED_TEXT_SYSTEM_PROMPT, callHaiku, logLlmCall } from '../lib/anthropic.js';

const SHAPEFILE_URL =
  'https://dmap-prod-oms-edc.s3.us-east-1.amazonaws.com/ORD/Ecoregions/ca/ca_eco_l3.zip';
const DESCRIPTIONS_URL =
  'https://dmap-prod-oms-edc.s3.us-east-1.amazonaws.com/ORD/Ecoregions/ca/CA_eco_PosterText_Final_Feb2016.docx';

const SOURCE_SRID = 5070; // NAD83 / CONUS Albers Equal Area Conic
const CACHE_TTL_DAYS = 30;

// EPA Region 9 page that hosts the per-state download links.
const EPA_FACT_SHEET_ORIGIN =
  'https://www.epa.gov/eco-research/ecoregion-download-files-state-region-9';

interface CachedShapefile {
  features: Array<{ properties: Record<string, unknown>; geometry: GeoJSON.Polygon | GeoJSON.MultiPolygon }>;
  fromCache: boolean;
}

async function ensureCached(url: string, file: string, force: boolean): Promise<{ fromCache: boolean }> {
  const meta = `${file}.meta.json`;
  if (!force && fs.existsSync(file) && fs.existsSync(meta)) {
    const m = JSON.parse(fs.readFileSync(meta, 'utf-8')) as { fetchedAt: string };
    const ageMs = Date.now() - new Date(m.fetchedAt).getTime();
    if (ageMs < CACHE_TTL_DAYS * 24 * 3600 * 1000) {
      return { fromCache: true };
    }
  }
  console.log(chalk.gray(`  Fetching ${url}`));
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Fetch failed: HTTP ${res.status} ${url}`);
  const buf = Buffer.from(await res.arrayBuffer());
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, buf);
  fs.writeFileSync(meta, JSON.stringify({ fetchedAt: new Date().toISOString(), source: url }, null, 2));
  return { fromCache: false };
}

async function loadShapefile(cacheDir: string, force: boolean): Promise<CachedShapefile> {
  const epaDir = path.join(cacheDir, 'epa');
  const zipFile = path.join(epaDir, 'ca_eco_l3.zip');
  const unzipDir = path.join(epaDir, 'l3');
  fs.mkdirSync(unzipDir, { recursive: true });

  const { fromCache } = await ensureCached(SHAPEFILE_URL, zipFile, force);
  // Unzip if .shp not yet extracted (or if forced)
  const shp = path.join(unzipDir, 'ca_eco_l3.shp');
  if (force || !fs.existsSync(shp)) {
    const zip = new AdmZip(zipFile);
    zip.extractAllTo(unzipDir, /* overwrite */ true);
  }
  const dbf = path.join(unzipDir, 'ca_eco_l3.dbf');

  const features: CachedShapefile['features'] = [];
  const src = await shapefile.open(shp, dbf);
  while (true) {
    const r = await src.read();
    if (r.done) break;
    features.push({
      properties: r.value.properties as Record<string, unknown>,
      geometry: r.value.geometry as GeoJSON.Polygon | GeoJSON.MultiPolygon,
    });
  }
  return { features, fromCache };
}

interface DescriptionMap {
  // Map US_L3CODE (as string, e.g. "1", "78") to its DOCX description paragraph.
  byCode: Record<string, string>;
  // Map US_L3CODE to its uppercase DOCX header (e.g. "1. COAST RANGE") for reference.
  headerByCode: Record<string, string>;
}

async function loadDescriptions(cacheDir: string, force: boolean): Promise<DescriptionMap> {
  const epaDir = path.join(cacheDir, 'epa');
  const docx = path.join(epaDir, 'factsheets', 'ca-l3-descriptions.docx');
  await ensureCached(DESCRIPTIONS_URL, docx, force);

  // Extract word/document.xml from the .docx (which is a zip).
  const zip = new AdmZip(docx);
  const entry = zip.getEntry('word/document.xml');
  if (!entry) throw new Error('word/document.xml not found in EPA descriptions DOCX');
  const xml = entry.getData().toString('utf-8');

  // Split by <w:p> paragraph marker; per paragraph, concatenate all <w:t> runs.
  const paragraphs: string[] = [];
  const paraSplit = xml.split(/<w:p\b[^>]*>/);
  for (const para of paraSplit) {
    const runs = [...para.matchAll(/<w:t[^>]*>([^<]*)<\/w:t>/g)].map((m) => m[1] ?? '');
    const text = runs.join('').trim();
    if (text) paragraphs.push(text);
  }

  // Scan for L3 section headers matching `${N}. NAME` where N is 1-3 digits.
  // Followed by a single description paragraph.
  const byCode: Record<string, string> = {};
  const headerByCode: Record<string, string> = {};
  const headerRe = /^(\d{1,3})\.\s+[A-Z][A-Z0-9 /\-,'’\(\)]+$/;
  for (let i = 0; i < paragraphs.length - 1; i++) {
    const line = paragraphs[i]!;
    const next = paragraphs[i + 1]!;
    const m = line.match(headerRe);
    if (m && m[1] && next.length > 100 && !next.match(headerRe)) {
      const code = m[1];
      // Only first occurrence — the DOCX has L3 sections first, then L4 sub-sections.
      // L4 sub-codes are like "1a. ..." which won't match `\d{1,3}\.` since `1a` has a letter.
      // The L4 section "1. Coast Range" (without all-caps) won't match the all-caps requirement.
      if (!byCode[code]) {
        byCode[code] = next;
        headerByCode[code] = line;
      }
    }
  }
  return { byCode, headerByCode };
}

function l3ShortName(usL3Name: string): string {
  // The shapefile US_L3NAME is the authoritative name. Use as-is.
  return usL3Name;
}

interface ParentResolution {
  parent_region_id: string | null;
  parent_name: string | null;
  centroid_lon: number;
  centroid_lat: number;
  method: 'centroid' | 'area_intersection' | 'no_parent';
}

async function resolveParent(ewkt5070: string): Promise<ParentResolution> {
  const pool = getPgPool();
  const client = await pool.connect();
  try {
    // Compute centroid in 4326 once
    const centroidRes = await client.query<{ lon: number; lat: number }>(
      `SELECT
         ST_X(ST_Centroid(ST_Transform(ST_GeomFromEWKT($1), 4326))) AS lon,
         ST_Y(ST_Centroid(ST_Transform(ST_GeomFromEWKT($1), 4326))) AS lat`,
      [ewkt5070],
    );
    const lon = Number(centroidRes.rows[0]!.lon);
    const lat = Number(centroidRes.rows[0]!.lat);

    // Centroid-first
    const byCentroid = await client.query<{ id: string; name: string }>(
      `SELECT id, name FROM public.regions
        WHERE region_type = 'geomorphic_province'
          AND ST_Within(
            ST_SetSRID(ST_MakePoint($1, $2), 4326),
            polygon::geometry
          )
        LIMIT 1`,
      [lon, lat],
    );
    if (byCentroid.rows.length > 0) {
      return {
        parent_region_id: byCentroid.rows[0]!.id,
        parent_name: byCentroid.rows[0]!.name,
        centroid_lon: lon,
        centroid_lat: lat,
        method: 'centroid',
      };
    }

    // Area-intersection fallback (transformed ecoregion polygon × each province polygon)
    const byArea = await client.query<{ id: string; name: string }>(
      `SELECT id, name FROM public.regions
        WHERE region_type = 'geomorphic_province'
          AND ST_Intersects(
            ST_Transform(ST_GeomFromEWKT($1), 4326),
            polygon::geometry
          )
        ORDER BY ST_Area(ST_Intersection(
          ST_Transform(ST_GeomFromEWKT($1), 4326),
          polygon::geometry
        )) DESC
        LIMIT 1`,
      [ewkt5070],
    );
    if (byArea.rows.length > 0) {
      return {
        parent_region_id: byArea.rows[0]!.id,
        parent_name: byArea.rows[0]!.name,
        centroid_lon: lon,
        centroid_lat: lat,
        method: 'area_intersection',
      };
    }

    return {
      parent_region_id: null,
      parent_name: null,
      centroid_lon: lon,
      centroid_lat: lat,
      method: 'no_parent',
    };
  } finally {
    client.release();
  }
}

interface PreparedEcoregion {
  l3_code: string;
  l3_name: string;
  na_l2_name: string;
  na_l1_name: string;
  geometry: GeoJSON.Polygon | GeoJSON.MultiPolygon;
  description_source: string;       // Either DOCX paragraph OR attribute-only seed text
  description_origin: 'docx' | 'attribute_fallback';
  parent: ParentResolution;
}

function buildAttributeFallbackSeed(l3_name: string, na_l2: string, na_l1: string, state: string): string {
  return (
    `EPA Level III Ecoregion: ${l3_name}, located in ${state}. ` +
    `Belongs to NA Level II "${na_l2}" within NA Level I "${na_l1}". ` +
    `Detailed description not available from EPA fact sheet for this code; ` +
    `seed from name/hierarchy alone.`
  );
}

export async function runImport(opts: ImportOptions): Promise<ImportResult> {
  const result = emptyResult('epa-ecoregions');
  const t0 = Date.now();

  // 1. Parse inputs
  const [{ features, fromCache: shpCached }, descriptions] = await Promise.all([
    loadShapefile(opts.cacheDir, opts.force),
    loadDescriptions(opts.cacheDir, opts.force),
  ]);
  console.log(chalk.gray(`  Shapefile: ${features.length} features (${shpCached ? 'cache hit' : 'fresh fetch'})`));
  console.log(chalk.gray(`  DOCX descriptions: ${Object.keys(descriptions.byCode).length} L3 sections extracted`));

  // Filter defensively to STATE_NAME=California (file is CA-only, but
  // safe to assert).
  const caFeatures = features.filter((f) => f.properties['STATE_NAME'] === 'California');
  if (caFeatures.length !== features.length) {
    console.log(chalk.yellow(`  ⚠️  Filtered ${features.length - caFeatures.length} non-CA features`));
  }
  result.fetched = caFeatures.length;

  // 2. For each feature: build EWKT-5070, resolve parent
  const prepared: PreparedEcoregion[] = [];
  for (const feat of caFeatures) {
    const l3_code = String(feat.properties['US_L3CODE'] ?? '');
    const l3_name = String(feat.properties['US_L3NAME'] ?? '');
    const na_l2 = String(feat.properties['NA_L2NAME'] ?? '');
    const na_l1 = String(feat.properties['NA_L1NAME'] ?? '');

    // Build EWKT-5070 directly from the shapefile coordinates (no TS-side reprojection).
    // We can't use geoJsonToEwktMultiPolygon here without going through
    // NormalizedRegion; just inline the formatting since we only need it once.
    const fmtCoord = (c: number[]): string => `${c[0]} ${c[1]}`;
    const fmtRing = (r: number[][]): string => `(${r.map(fmtCoord).join(', ')})`;
    const fmtPoly = (p: number[][][]): string => `(${p.map(fmtRing).join(', ')})`;
    let ewkt: string;
    if (feat.geometry.type === 'Polygon') {
      ewkt = `SRID=${SOURCE_SRID};MULTIPOLYGON(${fmtPoly(feat.geometry.coordinates)})`;
    } else {
      ewkt = `SRID=${SOURCE_SRID};MULTIPOLYGON(${feat.geometry.coordinates.map(fmtPoly).join(', ')})`;
    }

    const parent = await resolveParent(ewkt);

    const docxDescription = descriptions.byCode[l3_code];
    let description_source: string;
    let description_origin: 'docx' | 'attribute_fallback';
    if (docxDescription) {
      description_source = docxDescription;
      description_origin = 'docx';
    } else {
      description_source = buildAttributeFallbackSeed(l3_name, na_l2, na_l1, 'California');
      description_origin = 'attribute_fallback';
    }

    prepared.push({
      l3_code,
      l3_name,
      na_l2_name: na_l2,
      na_l1_name: na_l1,
      geometry: feat.geometry,
      description_source,
      description_origin,
      parent,
    });
  }

  // 3. Dry-run report — per user direction §5
  console.log('');
  console.log(chalk.bold('── Dry-run report (parse + parent resolution) ──'));
  console.log(`  Row count: ${prepared.length}`);
  console.log('');
  console.log(`  ${'L3'.padEnd(4)} ${'Name'.padEnd(52)} ${'centroid (lon,lat)'.padEnd(22)} ${'parent'.padEnd(20)} ${'method'.padEnd(18)} desc_origin`);
  console.log(`  ${'-'.repeat(4)} ${'-'.repeat(52)} ${'-'.repeat(22)} ${'-'.repeat(20)} ${'-'.repeat(18)} ${'-'.repeat(20)}`);
  for (const p of prepared.sort((a, b) => Number(a.l3_code) - Number(b.l3_code))) {
    const centroid = `${p.parent.centroid_lon.toFixed(3)}, ${p.parent.centroid_lat.toFixed(3)}`;
    const parent = p.parent.parent_name ?? '(none)';
    const methodColor =
      p.parent.method === 'centroid' ? chalk.green :
      p.parent.method === 'area_intersection' ? chalk.yellow : chalk.red;
    const origin = p.description_origin === 'attribute_fallback' ? chalk.yellow(p.description_origin) : p.description_origin;
    console.log(
      `  ${p.l3_code.padEnd(4)} ${p.l3_name.slice(0, 50).padEnd(52)} ${centroid.padEnd(22)} ${parent.padEnd(20)} ${methodColor(p.parent.method.padEnd(18))} ${origin}`,
    );
  }

  const fallbacks = prepared.filter((p) => p.parent.method !== 'centroid');
  if (fallbacks.length > 0) {
    console.log('');
    console.log(chalk.yellow(`  ${fallbacks.length} row(s) used non-centroid resolution:`));
    for (const p of fallbacks) {
      console.log(chalk.yellow(`    • L${p.l3_code} ${p.l3_name} — ${p.parent.method} → ${p.parent.parent_name ?? 'NO PARENT'}`));
    }
  }
  const fallbackOrigins = prepared.filter((p) => p.description_origin === 'attribute_fallback');
  if (fallbackOrigins.length > 0) {
    console.log('');
    console.log(chalk.yellow(`  ${fallbackOrigins.length} row(s) using attribute-only seed (no DOCX section):`));
    for (const p of fallbackOrigins) {
      console.log(chalk.yellow(`    • L${p.l3_code} ${p.l3_name}`));
    }
  }
  console.log('');

  if (opts.dryRun) {
    console.log(chalk.gray('  [dry-run] Stopping before Haiku calls and DB writes.'));
    result.normalized = prepared.length;
    result.durationMs = Date.now() - t0;
    return result;
  }

  // 4. Haiku draft per L3 using the new third-person seed-text prompt
  console.log(chalk.bold('── Haiku drafts ──'));
  const regions: NormalizedRegion[] = [];
  let totalCostUsd = 0;
  for (const p of prepared) {
    try {
      const t1 = Date.now();
      const haiku = await draftRegionSeedText(p.l3_name, p.description_source);
      totalCostUsd += haiku.costUsd;
      const dt = Date.now() - t1;
      console.log(chalk.gray(
        `  L${p.l3_code} ${p.l3_name}: ${haiku.inputTokens}→${haiku.outputTokens} toks ` +
        `$${haiku.costUsd.toFixed(4)} ${dt}ms`,
      ));

      const region: NormalizedRegion = {
        region_type: 'ecoregion',
        name: p.l3_name,
        display_name: null,
        description: haiku.text,
        polygon_geojson: p.geometry,
        polygon_srid: SOURCE_SRID,
        significance_tier: 60,
        source: 'epa',
        source_id: `l3-${p.l3_code}`,
        parent_region_id: p.parent.parent_region_id,
        metadata: {
          us_l3_code: p.l3_code,
          us_l3_name: p.l3_name,
          na_l2_name: p.na_l2_name,
          na_l1_name: p.na_l1_name,
          source_url: SHAPEFILE_URL,
          fact_sheet_origin: p.description_origin === 'docx' ? DESCRIPTIONS_URL : EPA_FACT_SHEET_ORIGIN,
          fact_sheet_origin_type: p.description_origin,
          parent_resolution_method: p.parent.method,
          centroid: { lon: p.parent.centroid_lon, lat: p.parent.centroid_lat },
        },
      };
      regions.push(region);
      result.normalized++;
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(chalk.red(`  Haiku failed for L${p.l3_code} ${p.l3_name}: ${msg}`));
      result.errors++;
    }
  }
  console.log(chalk.gray(`  Total Haiku spend this run: $${totalCostUsd.toFixed(4)}`));

  // 5. Upsert
  const upsertResult = await upsertRegions(regions, { dryRun: false });
  result.inserted = upsertResult.inserted;
  result.updated = upsertResult.updated;
  result.errors += upsertResult.errors;

  result.durationMs = Date.now() - t0;
  return result;
}

// Touch import so the linter doesn't complain about unused re-exports
void SEED_TEXT_SYSTEM_PROMPT;
void callHaiku;
void logLlmCall;
