#!/usr/bin/env node
/**
 * Tier C polygon derivation — final attempt to pull real polygons from
 * existing data sources for Lake Tahoe Basin, Hetch Hetchy Valley, and
 * Sierra Valley before falling back to coarse approximations.
 *
 * Derivation strategy per curator direction (2026-05-14):
 *   Lake Tahoe Basin
 *     1. Try OSM boundary=protected_area name~"Lake Tahoe Basin Management Unit"
 *        (USFS LTBMU)
 *     2. Fallback: OSM natural=water name="Lake Tahoe" + 5km buffer
 *   Hetch Hetchy Valley
 *     1. OSM natural=water name~"Hetch Hetchy" reservoir + 2km buffer
 *   Sierra Valley
 *     1. OSM tag-fallback already failed in Phase 2
 *     2. Final: bbox rectangle ~40km E-W × 25km N-S around Wikidata centroid
 *
 * Output: data/editorial-named-valleys.geojson as a draft FeatureCollection.
 * DOES NOT touch the regions table — that's a separate live-run step after
 * curator greenlight.
 */
import { config as dotenvConfig } from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';
import path from 'node:path';
import fs from 'node:fs';
import chalk from 'chalk';
import osmtogeojson from 'osmtogeojson';

import { getPgPool } from './lib/supabase.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
dotenvConfig({ path: resolve(__dirname, '../../.env') });

const OUTPUT_FILE = path.join(__dirname, 'data', 'editorial-named-valleys.geojson');
const OVERPASS_URL = 'https://overpass-api.de/api/interpreter';
const USER_AGENT = 'XRoad-Region-Import/0.1 (https://github.com/johnhollis99-lgtm/crossroad-ws; contact: john)';

// ───────────────────────── helpers ─────────────────────────

async function fetchOverpass(query: string, label: string): Promise<{ elements: unknown[] }> {
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
        console.warn(chalk.yellow(`  [${label}] Overpass ${res.status} — retrying in ${wait}ms`));
        await new Promise((r) => setTimeout(r, wait));
        continue;
      }
      if (!res.ok) throw new Error(`Overpass HTTP ${res.status}`);
      return (await res.json()) as { elements: unknown[] };
    } catch (err) {
      lastErr = err as Error;
      await new Promise((r) => setTimeout(r, 3000 * (attempt + 1)));
    }
  }
  throw lastErr ?? new Error(`Overpass failed for ${label}`);
}

async function bufferGeoJsonViaPostgis(geojson: GeoJSON.Polygon | GeoJSON.MultiPolygon, radiusM: number): Promise<GeoJSON.Polygon | GeoJSON.MultiPolygon> {
  const pool = getPgPool();
  const client = await pool.connect();
  try {
    // ST_Buffer on geography is geodesic, returns geometry, we serialize to GeoJSON.
    // ST_MakeValid wraps in case the input is mildly broken.
    const res = await client.query<{ geojson: string }>(
      `SELECT ST_AsGeoJSON(
                ST_Buffer(
                  ST_MakeValid(ST_GeomFromGeoJSON($1))::geography,
                  $2
                )::geometry
              ) AS geojson`,
      [JSON.stringify(geojson), radiusM],
    );
    return JSON.parse(res.rows[0]!.geojson) as GeoJSON.Polygon | GeoJSON.MultiPolygon;
  } finally {
    client.release();
  }
}

async function computeAreaKm2(geojson: GeoJSON.Polygon | GeoJSON.MultiPolygon): Promise<number> {
  const pool = getPgPool();
  const client = await pool.connect();
  try {
    const res = await client.query<{ area: string }>(
      `SELECT (ST_Area(ST_GeomFromGeoJSON($1)::geography) / 1000000.0)::numeric(10,2)::text AS area`,
      [JSON.stringify(geojson)],
    );
    return Number(res.rows[0]!.area);
  } finally {
    client.release();
  }
}

function bbox(g: GeoJSON.Polygon | GeoJSON.MultiPolygon): { minLat: number; minLon: number; maxLat: number; maxLon: number } {
  let minLat = Infinity, minLon = Infinity, maxLat = -Infinity, maxLon = -Infinity;
  const visit = (coord: number[]) => {
    const [lon, lat] = coord as [number, number];
    if (lat < minLat) minLat = lat;
    if (lat > maxLat) maxLat = lat;
    if (lon < minLon) minLon = lon;
    if (lon > maxLon) maxLon = lon;
  };
  const visitRing = (ring: number[][]) => ring.forEach(visit);
  const visitPoly = (poly: number[][][]) => poly.forEach(visitRing);
  if (g.type === 'Polygon') visitPoly(g.coordinates);
  else g.coordinates.forEach(visitPoly);
  return { minLat, minLon, maxLat, maxLon };
}

function extractFeatureWithGeom(
  osmJson: { elements: unknown[] },
  predicate: (feat: GeoJSON.Feature) => boolean,
  label: string,
): GeoJSON.Polygon | GeoJSON.MultiPolygon | null {
  const fc = osmtogeojson(osmJson as never) as GeoJSON.FeatureCollection;
  const match = fc.features.find(predicate);
  if (!match) {
    console.warn(chalk.yellow(`  [${label}] no feature matched predicate in ${fc.features.length} features`));
    return null;
  }
  if (match.geometry.type === 'Polygon' || match.geometry.type === 'MultiPolygon') {
    return match.geometry;
  }
  console.warn(chalk.yellow(`  [${label}] matched feature has geometry type ${match.geometry.type} (not polygonal)`));
  return null;
}

// ───────────────────────── per-region derivation ─────────────────────────

interface DerivedRegion {
  name: string;
  source_id: string;
  geometry: GeoJSON.Polygon | GeoJSON.MultiPolygon;
  polygon_source: string;
  polygon_source_method: string;
  notes: string;
  area_km2: number;
  bbox: { minLat: number; minLon: number; maxLat: number; maxLon: number };
}

async function deriveLakeTahoeBasin(): Promise<DerivedRegion> {
  console.log(chalk.bold('\nLake Tahoe Basin'));

  // 1. Try LTBMU
  console.log(chalk.gray('  1. Querying OSM for Lake Tahoe Basin Management Unit (USFS LTBMU)…'));
  const ltbmuQuery =
    `[out:json][timeout:60];` +
    `(relation["boundary"="protected_area"]["name"~"Lake Tahoe Basin",i](38.5,-120.5,39.5,-119.5);` +
    ` relation["boundary"="national_forest"]["name"~"Lake Tahoe Basin",i](38.5,-120.5,39.5,-119.5);` +
    ` relation["boundary"="protected_area"]["operator"~"Forest Service",i]["name"~"Tahoe",i](38.5,-120.5,39.5,-119.5););` +
    `out body;>;out skel qt;`;
  let ltbmuJson: { elements: unknown[] };
  try {
    ltbmuJson = await fetchOverpass(ltbmuQuery, 'Lake Tahoe LTBMU');
  } catch (err) {
    console.warn(chalk.yellow(`  LTBMU query failed: ${(err as Error).message}`));
    ltbmuJson = { elements: [] };
  }
  const ltbmuGeom = ltbmuJson.elements.length > 0
    ? extractFeatureWithGeom(
        ltbmuJson,
        (f) => {
          const props = f.properties as Record<string, string> | null;
          const name = props?.name?.toLowerCase() ?? '';
          return name.includes('lake tahoe') && (name.includes('basin') || name.includes('management'));
        },
        'Lake Tahoe LTBMU',
      )
    : null;

  if (ltbmuGeom) {
    const area = await computeAreaKm2(ltbmuGeom);
    console.log(chalk.green(`  ✓ Found LTBMU polygon — ${area} km²`));
    return {
      name: 'Lake Tahoe Basin',
      source_id: 'valley-lake-tahoe-basin',
      geometry: ltbmuGeom,
      polygon_source: 'derived_osm_ltbmu',
      polygon_source_method: 'osm_protected_area_ltbmu',
      notes: 'USFS Lake Tahoe Basin Management Unit boundary — co-extensive with the basin landform',
      area_km2: area,
      bbox: bbox(ltbmuGeom),
    };
  }

  // 2. Fallback: Lake Tahoe lake + 5km buffer
  console.log(chalk.gray('  2. LTBMU not found — falling back to Lake Tahoe lake polygon + 5km buffer'));
  const lakeQuery =
    `[out:json][timeout:60];` +
    `(relation["natural"="water"]["name"="Lake Tahoe"](38.8,-120.3,39.3,-119.8);` +
    ` way["natural"="water"]["name"="Lake Tahoe"](38.8,-120.3,39.3,-119.8););` +
    `(._;>;);out body geom qt;`;
  const lakeJson = await fetchOverpass(lakeQuery, 'Lake Tahoe lake');
  const lakeGeom = extractFeatureWithGeom(
    lakeJson,
    (f) => (f.properties as Record<string, string> | null)?.name === 'Lake Tahoe',
    'Lake Tahoe lake',
  );
  if (!lakeGeom) throw new Error('Lake Tahoe lake polygon not found in OSM');
  const lakeArea = await computeAreaKm2(lakeGeom);
  console.log(chalk.gray(`    Lake polygon area: ${lakeArea} km² (expected ~500 km²)`));

  const buffered = await bufferGeoJsonViaPostgis(lakeGeom, 5000);
  const bufferedArea = await computeAreaKm2(buffered);
  console.log(chalk.green(`  ✓ Lake + 5km buffer — ${bufferedArea} km²`));
  return {
    name: 'Lake Tahoe Basin',
    source_id: 'valley-lake-tahoe-basin',
    geometry: buffered,
    polygon_source: 'derived_osm_lake_buffer',
    polygon_source_method: 'osm_natural_water_5km_buffer',
    notes: `Lake Tahoe polygon (${lakeArea} km²) + 5km geodesic buffer as basin proxy. LTBMU polygon was queried first but not found in OSM.`,
    area_km2: bufferedArea,
    bbox: bbox(buffered),
  };
}

async function deriveHetchHetchy(): Promise<DerivedRegion> {
  console.log(chalk.bold('\nHetch Hetchy Valley'));
  console.log(chalk.gray('  1. Querying OSM for Hetch Hetchy Reservoir…'));
  // Hetch Hetchy is in Yosemite NP at roughly 37.95°N -119.78°W
  const query =
    `[out:json][timeout:60];` +
    `(relation["natural"="water"]["name"~"Hetch Hetchy",i](37.8,-119.95,38.1,-119.6);` +
    ` way["natural"="water"]["name"~"Hetch Hetchy",i](37.8,-119.95,38.1,-119.6););` +
    `(._;>;);out body geom qt;`;
  const osmJson = await fetchOverpass(query, 'Hetch Hetchy');
  const reservoirGeom = extractFeatureWithGeom(
    osmJson,
    (f) => {
      const props = f.properties as Record<string, string> | null;
      const name = props?.name?.toLowerCase() ?? '';
      return name.includes('hetch hetchy');
    },
    'Hetch Hetchy Reservoir',
  );
  if (!reservoirGeom) throw new Error('Hetch Hetchy Reservoir polygon not found in OSM');
  const reservoirArea = await computeAreaKm2(reservoirGeom);
  console.log(chalk.gray(`    Reservoir polygon area: ${reservoirArea} km²`));

  const buffered = await bufferGeoJsonViaPostgis(reservoirGeom, 2000);
  const bufferedArea = await computeAreaKm2(buffered);
  console.log(chalk.green(`  ✓ Reservoir + 2km buffer — ${bufferedArea} km²`));
  return {
    name: 'Hetch Hetchy Valley',
    source_id: 'valley-hetch-hetchy',
    geometry: buffered,
    polygon_source: 'derived_osm_reservoir_buffer',
    polygon_source_method: 'osm_natural_water_2km_buffer',
    notes: `Hetch Hetchy Reservoir polygon (${reservoirArea} km²) + 2km geodesic buffer to capture the valley floor surrounding the reservoir.`,
    area_km2: bufferedArea,
    bbox: bbox(buffered),
  };
}

async function deriveSierraValley(): Promise<DerivedRegion> {
  console.log(chalk.bold('\nSierra Valley'));
  console.log(chalk.gray('  1. Tag-fallback already failed in Phase 2 (no usable natural=valley or landuse=meadow polygon).'));
  console.log(chalk.gray('  2. Final fallback: bbox rectangle around Wikidata centroid (~40km E-W × 25km N-S)'));

  // Sierra Valley is in Plumas/Sierra counties, eastern slope of Sierra Nevada.
  // Wikidata Q15277726 centroid roughly (39.70, -120.40) — between Loyalton and
  // Sierraville. The valley is ~40km E-W (from Sierraville to Beckwourth) and
  // ~25km N-S (Loyalton to Calpine).
  //
  // Centroid sourced from Wikidata cache (Q15277726) if available; else
  // hardcode-of-knowledge.
  let centroid: { lat: number; lon: number } = { lat: 39.70, lon: -120.40 };
  try {
    const wd = JSON.parse(fs.readFileSync(path.join(__dirname, 'cache', 'wikidata-regions', 'Q15277726.json'), 'utf-8')) as { centroid?: { lat: number; lon: number } };
    if (wd?.centroid) centroid = wd.centroid;
  } catch {
    // Fall through to hardcoded
  }
  console.log(chalk.gray(`    Centroid: (${centroid.lat.toFixed(4)}°N, ${centroid.lon.toFixed(4)}°W)`));

  // Convert km to degrees:
  //   lat: 1° ≈ 111 km → 25 km / (111 km/°) ≈ 0.2252° → ±0.1126° from centroid
  //   lon: 1° lon ≈ 111 km × cos(lat). At 39.7° lat, cos ≈ 0.770, so 1° lon ≈ 85.5 km
  //   → 40 km / (85.5 km/°) ≈ 0.468° → ±0.234° from centroid
  const halfDLat = 25 / 2 / 111;
  const halfDLon = 40 / 2 / (111 * Math.cos((centroid.lat * Math.PI) / 180));
  const minLat = centroid.lat - halfDLat;
  const maxLat = centroid.lat + halfDLat;
  const minLon = centroid.lon - halfDLon;
  const maxLon = centroid.lon + halfDLon;

  const geometry: GeoJSON.Polygon = {
    type: 'Polygon',
    coordinates: [[
      [minLon, minLat],
      [maxLon, minLat],
      [maxLon, maxLat],
      [minLon, maxLat],
      [minLon, minLat],
    ]],
  };
  const area = await computeAreaKm2(geometry);
  console.log(chalk.green(`  ✓ Centroid-bbox rectangle (40km × 25km) — ${area} km²`));
  return {
    name: 'Sierra Valley',
    source_id: 'valley-sierra-valley',
    geometry,
    polygon_source: 'editorial_approximation',
    polygon_source_method: 'centroid_bbox_40x25km',
    notes:
      'Sierra Valley is a clearly visible flat region spanning the Plumas/Sierra county boundary in the eastern slope of the Sierra Nevada. ' +
      'OSM tag-fallback within 30km of Wikidata Q15277726 centroid (Phase 2) returned no usable natural=valley or landuse=meadow polygon. ' +
      'Final approximation: 40km E-W × 25km N-S rectangle centered on the Wikidata centroid. ' +
      'Coarse — covers the valley floor plus some ridge margin. Precision tolerance ±10 km. Replace with an editorial digitization at v1.1 if precision warrants.',
    area_km2: area,
    bbox: bbox(geometry),
  };
}

// ───────────────────────── main ─────────────────────────

async function main(): Promise<void> {
  console.log(chalk.bold('Tier C polygon derivation — E1d follow-up (DRAFT)\n'));

  const regions: DerivedRegion[] = [];
  regions.push(await deriveLakeTahoeBasin());
  regions.push(await deriveHetchHetchy());
  regions.push(await deriveSierraValley());

  // Build FeatureCollection
  const fc: GeoJSON.FeatureCollection = {
    type: 'FeatureCollection',
    features: regions.map((r) => ({
      type: 'Feature',
      geometry: r.geometry,
      properties: {
        name: r.name,
        source_id: r.source_id,
        region_type: 'named_valley_or_basin',
        significance_tier: 75,
        polygon_source: r.polygon_source,
        polygon_source_method: r.polygon_source_method,
        precision_tolerance_km: r.polygon_source === 'editorial_approximation' ? 10 : 5,
        notes: r.notes,
        digitized_at: new Date().toISOString().slice(0, 10),
      },
    })),
  };

  fs.mkdirSync(path.dirname(OUTPUT_FILE), { recursive: true });
  fs.writeFileSync(OUTPUT_FILE, JSON.stringify(fc, null, 2));
  console.log(chalk.bold.green(`\nWrote ${OUTPUT_FILE}`));

  // Final report
  console.log('');
  console.log(chalk.bold('═══════════════════════════════════════════════════════════════════'));
  console.log(chalk.bold('TIER C DERIVATION DRAFT — per-region summary'));
  console.log(chalk.bold('═══════════════════════════════════════════════════════════════════'));
  for (const r of regions) {
    console.log('');
    console.log(chalk.bold(`──── ${r.name} ────`));
    console.log(`  Source method      : ${r.polygon_source} / ${r.polygon_source_method}`);
    console.log(`  Polygon area       : ${r.area_km2.toFixed(1)} km²`);
    console.log(`  Bbox               : (${r.bbox.minLat.toFixed(3)}°N, ${r.bbox.minLon.toFixed(3)}°W) – (${r.bbox.maxLat.toFixed(3)}°N, ${r.bbox.maxLon.toFixed(3)}°W)`);
    console.log(`  Bbox extent        : ${((r.bbox.maxLat - r.bbox.minLat) * 111).toFixed(1)} km N-S × ${((r.bbox.maxLon - r.bbox.minLon) * 111 * Math.cos(((r.bbox.minLat + r.bbox.maxLat) / 2) * Math.PI / 180)).toFixed(1)} km E-W`);
    console.log(`  Rationale          : ${r.notes}`);
  }

  console.log('');
  console.log(chalk.gray('This is a DRAFT. No DB writes. Review the polygons + greenlight before live import.'));
  console.log(chalk.gray(`Output: ${OUTPUT_FILE}`));
}

main().catch((err: unknown) => {
  const msg = err instanceof Error ? err.message : String(err);
  console.error(chalk.red(`Fatal: ${msg}`));
  process.exit(1);
});
