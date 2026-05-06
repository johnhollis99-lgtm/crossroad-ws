import { promises as fs } from 'node:fs';
import path from 'node:path';
import chalk from 'chalk';
import { classifyOSM } from '../lib/category-map.js';
import { upsertPOIs } from '../lib/upsert.js';
import {
  emptyResult,
  type BoundingBox,
  type ImportOptions,
  type ImportResult,
  type NormalizedPOI,
} from '../lib/types.js';

export const SOURCE_NAME = 'osm' as const;

const CA_BBOX: BoundingBox = { minLat: 32.5, minLon: -124.5, maxLat: 42.0, maxLon: -114.1 };
const TILE_DEG = 1;
const TILE_THRESHOLD_SQ_DEG = 4;
const OVERPASS_ENDPOINT = process.env['OVERPASS_URL'] ?? 'https://overpass-api.de/api/interpreter';
const FETCH_INTERVAL_MS = 2000;
const MAX_RETRIES = 5;

// ---- Overpass types --------------------------------------------------------

interface OverpassElement {
  type: 'node' | 'way' | 'relation';
  id: number;
  lat?: number;
  lon?: number;
  center?: { lat: number; lon: number };
  tags?: Record<string, string>;
}

interface OverpassResponse {
  elements: OverpassElement[];
}

// ---- Skip tracking ---------------------------------------------------------

interface SkipCounts {
  noName: number;
  noCategory: number;
  excluded: number;
}

interface CellResult {
  data: OverpassResponse;
  fromCache: boolean;
}

// ---- Rate limiting + fetch --------------------------------------------------

let lastFetchAt = 0;

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

async function rateLimit(): Promise<void> {
  const wait = lastFetchAt + FETCH_INTERVAL_MS - Date.now();
  if (wait > 0) await sleep(wait);
  lastFetchAt = Date.now();
}

async function fetchOverpass(query: string): Promise<OverpassResponse> {
  let backoff = 2000;
  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    await rateLimit();
    let res: Response;
    try {
      res = await fetch(OVERPASS_ENDPOINT, {
        method: 'POST',
        body: new URLSearchParams({ data: query }),
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      });
    } catch (err) {
      console.warn(chalk.yellow(`[osm] network error (attempt ${attempt + 1}): ${err}`));
      await sleep(backoff);
      backoff = Math.min(backoff * 2, 32000);
      continue;
    }
    if (res.ok) return res.json() as Promise<OverpassResponse>;
    if (res.status === 429 || res.status === 504) {
      console.warn(chalk.yellow(`[osm] HTTP ${res.status}, backing off ${backoff / 1000}s…`));
      await sleep(backoff);
      backoff = Math.min(backoff * 2, 32000);
      continue;
    }
    const body = await res.text();
    throw new Error(`Overpass HTTP ${res.status}: ${body.slice(0, 300)}`);
  }
  throw new Error('Overpass: max retries exceeded');
}

// ---- Query builder ---------------------------------------------------------

function buildQuery(cell: BoundingBox): string {
  // south,west,north,east
  const bb = `${cell.minLat},${cell.minLon},${cell.maxLat},${cell.maxLon}`;
  const tv = 'attraction|museum|viewpoint|monument|gallery|artwork|archaeological_site|theme_park|zoo|aquarium';
  const nv = 'peak|waterfall|hot_spring|geyser|arch|cave_entrance|volcano';
  const mv = 'lighthouse|observatory|tower';
  const types = ['node', 'way', 'relation'];
  const lines = types.flatMap((t) => [
    `${t}[historic][historic!=yes](${bb});`,
    `${t}[tourism~"^(${tv})$"](${bb});`,
    `${t}[natural~"^(${nv})$"](${bb});`,
    `${t}[leisure=park][~"^(wikipedia|wikidata)$"~"."](${bb});`,
    `${t}[amenity=place_of_worship][~"^(heritage|wikidata)$"~"."](${bb});`,
    `${t}[man_made~"^(${mv})$"][name](${bb});`,
  ]);
  return `[out:json][timeout:60];\n(\n  ${lines.join('\n  ')}\n);\nout center tags;`;
}

// ---- Tiling ----------------------------------------------------------------

function tileBbox(bbox: BoundingBox): BoundingBox[] {
  const area = (bbox.maxLat - bbox.minLat) * (bbox.maxLon - bbox.minLon);
  if (area <= TILE_THRESHOLD_SQ_DEG) return [bbox];

  const cells: BoundingBox[] = [];
  for (let lat = Math.floor(bbox.minLat); lat < bbox.maxLat; lat += TILE_DEG) {
    for (let lon = Math.floor(bbox.minLon); lon < bbox.maxLon; lon += TILE_DEG) {
      cells.push({
        minLat: Math.max(lat, bbox.minLat),
        minLon: Math.max(lon, bbox.minLon),
        maxLat: Math.min(lat + TILE_DEG, bbox.maxLat),
        maxLon: Math.min(lon + TILE_DEG, bbox.maxLon),
      });
    }
  }
  return cells;
}

// ---- County bbox via Nominatim ---------------------------------------------

async function getCountyBbox(county: string, cacheDir: string): Promise<BoundingBox> {
  const slug = county.toLowerCase().replace(/\s+/g, '-');
  const cacheFile = path.join(cacheDir, 'geocode', `county-bbox-${slug}.json`);
  try {
    return JSON.parse(await fs.readFile(cacheFile, 'utf8')) as BoundingBox;
  } catch { /* not cached */ }

  await sleep(1100); // Nominatim rate limit
  const params = new URLSearchParams({
    q: `${county} County, California, USA`,
    format: 'jsonv2',
    limit: '1',
  });
  const res = await fetch(`https://nominatim.openstreetmap.org/search?${params}`, {
    headers: {
      'User-Agent': 'XRoad-POI-Import/0.1 (johnhollis99@gmail.com)',
      Accept: 'application/json',
    },
  });
  if (!res.ok) throw new Error(`Nominatim ${res.status}`);
  const data = (await res.json()) as Array<{ boundingbox?: [string, string, string, string] }>;
  const first = data[0];
  if (!first?.boundingbox) throw new Error(`No bbox found for county: ${county}`);
  // Nominatim returns [south, north, west, east]
  const [south, north, west, east] = first.boundingbox;
  const bbox: BoundingBox = {
    minLat: Number(south),
    maxLat: Number(north),
    minLon: Number(west),
    maxLon: Number(east),
  };
  await fs.mkdir(path.dirname(cacheFile), { recursive: true });
  await fs.writeFile(cacheFile, JSON.stringify(bbox, null, 2), 'utf8');
  return bbox;
}

// ---- Significance ----------------------------------------------------------

function osmSignificance(tags: Record<string, string>): number {
  let s = 0;
  if (tags['wikipedia']) s += 0.20;
  if (tags['wikidata']) s += 0.10;
  if (tags['heritage']) s += 0.15;
  if (tags['tourism'] === 'attraction') s += 0.10;
  if (tags['image']) s += 0.05;
  return Math.min(1.0, s);
}

// ---- Element normalization -------------------------------------------------

function normalizeElement(el: OverpassElement, skips: SkipCounts): NormalizedPOI | null {
  const tags = el.tags ?? {};
  const name = tags['name'];
  if (!name) { skips.noName++; return null; }

  // Memorial without a cross-reference link carries no verifiable information
  if (tags['historic'] === 'memorial' && !tags['wikidata'] && !tags['wikipedia']) {
    skips.excluded++;
    return null;
  }

  let lat: number;
  let lng: number;
  if (el.type === 'node') {
    if (el.lat == null || el.lon == null) return null;
    lat = el.lat;
    lng = el.lon;
  } else {
    if (!el.center) return null;
    lat = el.center.lat;
    lng = el.center.lon;
  }

  const cls = classifyOSM(tags);
  if (!cls) { skips.noCategory++; return null; }

  return {
    name,
    category_slug: cls.slug,
    lat,
    lng,
    tags: cls.tags,
    significance_score: osmSignificance(tags),
    trip_mode: cls.trip_mode,
    source_type: 'osm',
    source_id: `${el.type}/${el.id}`,
    source_citation: `https://www.openstreetmap.org/${el.type}/${el.id}`,
    confidence_score: 0.75,
    verified: true,
    description: tags['description'] ?? null,
  };
}

// ---- Cell loader -----------------------------------------------------------

async function loadCell(
  cell: BoundingBox,
  cacheFile: string,
  opts: Pick<ImportOptions, 'force'>,
): Promise<CellResult> {
  if (!opts.force) {
    try {
      const data = JSON.parse(await fs.readFile(cacheFile, 'utf8')) as OverpassResponse;
      return { data, fromCache: true };
    } catch { /* not cached */ }
  }
  const data = await fetchOverpass(buildQuery(cell));
  await fs.writeFile(cacheFile, JSON.stringify(data), 'utf8');
  return { data, fromCache: false };
}

// ---- Main ------------------------------------------------------------------

export async function runImport(opts: ImportOptions): Promise<ImportResult> {
  const start = Date.now();
  const result = emptyResult(SOURCE_NAME);

  let bbox: BoundingBox;
  if (opts.bbox) {
    bbox = opts.bbox;
  } else if (opts.county) {
    console.log(chalk.cyan(`[osm] geocoding county: ${opts.county}…`));
    bbox = await getCountyBbox(opts.county, opts.cacheDir);
  } else {
    bbox = CA_BBOX;
    console.log(chalk.cyan('[osm] defaulting to California bbox'));
  }

  const cells = tileBbox(bbox);
  console.log(chalk.cyan(
    `[osm] bbox ${bbox.minLat},${bbox.minLon} → ${bbox.maxLat},${bbox.maxLon}` +
    `  (${cells.length} tile${cells.length === 1 ? '' : 's'})`,
  ));

  const cellCacheDir = path.join(opts.cacheDir, 'osm-cells');
  await fs.mkdir(cellCacheDir, { recursive: true });

  const allPois: NormalizedPOI[] = [];
  const skips: SkipCounts = { noName: 0, noCategory: 0, excluded: 0 };
  let cellsFetched = 0;
  let cellsCached = 0;
  let cellIndex = 0;

  for (const cell of cells) {
    cellIndex++;
    const cellKey = `${cell.minLat.toFixed(2)}_${cell.minLon.toFixed(2)}`;
    const cacheFile = path.join(cellCacheDir, `cell-${cellKey}.json`);

    let cellResult: CellResult;
    try {
      cellResult = await loadCell(cell, cacheFile, opts);
    } catch (err) {
      console.error(chalk.red(`[osm] cell ${cellKey} failed: ${err}`));
      result.errors++;
      continue;
    }

    if (cellResult.fromCache) {
      cellsCached++;
    } else {
      cellsFetched++;
      console.log(chalk.gray(
        `[osm] tile ${cellIndex}/${cells.length}` +
        ` (${cell.minLat.toFixed(1)},${cell.minLon.toFixed(1)})` +
        ` — ${cellResult.data.elements.length} elements`,
      ));
    }

    for (const el of cellResult.data.elements) {
      result.fetched++;
      const poi = normalizeElement(el, skips);
      if (poi) allPois.push(poi);
    }
  }

  // Dedup within batch by source_id (tiles are non-overlapping, but guard anyway)
  const seen = new Map<string, NormalizedPOI>();
  for (const poi of allPois) {
    if (!seen.has(poi.source_id)) seen.set(poi.source_id, poi);
  }
  const deduped = [...seen.values()];
  result.normalized = deduped.length;

  const toUpsert = opts.limit != null ? deduped.slice(0, opts.limit) : deduped;
  const limitTrimmed = deduped.length - toUpsert.length;

  const totalSkipped = skips.noName + skips.noCategory + skips.excluded;
  console.log(chalk.cyan(
    `[osm] ${cells.length} tiles (${cellsFetched} fetched, ${cellsCached} cached)` +
    ` | ${result.fetched} raw → ${result.normalized} normalized` +
    ` | skipped: no-name=${skips.noName} no-cat=${skips.noCategory} excluded=${skips.excluded}`,
  ));

  const outcome = await upsertPOIs(toUpsert, { dryRun: opts.dryRun });
  result.inserted = outcome.inserted;
  result.updated = outcome.updated;
  result.skipped = totalSkipped + outcome.skipped + limitTrimmed;
  result.errors += outcome.errors;
  result.durationMs = Date.now() - start;

  const ts = new Date().toISOString().replace(/[:.]/g, '-');
  const summaryPath = path.join(opts.cacheDir, `osm-${ts}.json`);
  await fs.writeFile(summaryPath, JSON.stringify({
    timestamp: new Date().toISOString(),
    bbox,
    tiles: { total: cells.length, fetched: cellsFetched, cached: cellsCached },
    pois: {
      fetched: result.fetched,
      normalized: result.normalized,
      inserted: result.inserted,
      updated: result.updated,
      skipped: {
        total: result.skipped,
        breakdown: {
          noName: skips.noName,
          noCategory: skips.noCategory,
          excluded: skips.excluded,
          upsertSkipped: outcome.skipped,
          limitTrimmed,
        },
      },
      errors: result.errors,
    },
    elapsedMs: result.durationMs,
  }, null, 2), 'utf8');

  console.log(chalk.green(
    `[osm] done in ${(result.durationMs / 1000).toFixed(1)}s — summary: ${summaryPath}`,
  ));
  return result;
}
