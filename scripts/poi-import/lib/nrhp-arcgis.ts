// NRHP coordinate fetch via the NPS ArcGIS FeatureServer.
//
// Lifts the Phase 4 backfill logic (fetch-nrhp-coordinates.mjs) into a
// reusable lib helper. Layer 0 = points, Layer 1 = polygons. Both use
// NRIS_Refnum (string) as the natural key. maxRecordCount = 2000 per layer;
// batches capped at 500 (well under URL/POST limits and within rate budget).
//
// Used by sources/nrhp.ts (live importer) and fetch-nrhp-coordinates.mjs
// (one-off backfill script). The two callers share the same authoritative
// query path so future schema changes only need to land here.
//
// Reject buckets:
//   • unparseable — no geometry on either layer, or geometry that yielded no
//     finite (lat, lon) pair (degenerate polygon, missing rings, etc.)
//   • outside_ca — coords landed outside the California bounding box
//
// "at_placeholder" / "bad_accuracy" rejections from the backfill script are
// not relevant to fresh imports (a fresh row has no prior coords to compare,
// and the catalog rarely lists accuracy worse than 10 km), so they're not
// modeled here. Re-introduce as separate buckets if a fresh import surfaces
// the need.

import { promises as fs } from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';

const ARCGIS_BASE =
  'https://mapservices.nps.gov/arcgis/rest/services/Cultural_Resources/nrhp_locations/MapServer';
const USER_AGENT = 'XRoad-POI-Import/0.1 (johnhollis99@gmail.com)';
const BATCH_SIZE = 500;
const PAUSE_MS = 200;
const RETRY_DELAYS = [1000, 2000, 4000, 8000, 16000];

const CA_BBOX = { minLat: 32.5, maxLat: 42.0, minLon: -124.5, maxLon: -114.0 };

const OUT_FIELDS = [
  'NRIS_Refnum',
  'RESNAME',
  'Address',
  'City',
  'County',
  'BND_TYPE',
  'MAP_METHOD',
  'SRC_ACCU',
  'Is_NHL',
];

export type NrhpStatus = 'resolved' | 'unparseable' | 'outside_ca';

export interface NrhpVenueMetadata {
  geocoding_method: string;
  nrhp_layer: 0 | 1;
  nrhp_bnd_type: string | null;
  nrhp_map_method: string | null;
  nrhp_src_accu: string | null;
  nrhp_src_accu_meters: number | null;
  nrhp_resolved_at: string;
}

export interface NrhpResult {
  refnum: string;
  status: NrhpStatus;
  lat?: number;
  lng?: number;
  layer?: 0 | 1;
  resname?: string | null;
  address?: string | null;
  city?: string | null;
  county?: string | null;
  isNhl?: boolean;
  venueMetadata?: NrhpVenueMetadata;
}

export interface FetchOptions {
  cacheDir: string;
  force?: boolean;
}

interface ArcGisFeature {
  attributes: Record<string, unknown>;
  geometry?:
    | { x?: number; y?: number }
    | { rings?: number[][][] };
}

interface ArcGisResponse {
  features?: ArcGisFeature[];
  error?: { code: number; message: string };
}

const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

function parseSrcAccuMeters(text: string | null): number | null {
  if (!text) return null;
  const m = String(text).match(
    /([0-9]+(?:\.[0-9]+)?)\s*(meter|metre|foot|feet|ft|mile|mi|km|kilometer)/i,
  );
  if (!m || m[1] == null || m[2] == null) return null;
  const n = parseFloat(m[1]);
  if (!Number.isFinite(n)) return null;
  const u = m[2].toLowerCase();
  if (u.startsWith('meter') || u.startsWith('metre')) return n;
  if (u.startsWith('km') || u.startsWith('kilo')) return n * 1000;
  if (u.startsWith('foot') || u === 'feet' || u === 'ft') return n * 0.3048;
  if (u.startsWith('mile') || u === 'mi') return n * 1609.344;
  return null;
}

// Signed-area centroid of an outer ring (rings[0]). Holes are ignored.
// Equivalent to ST_Centroid for the simple convex/lobed shapes typical of
// NRHP boundaries (single-parcel buildings, historic-district outlines).
function ringCentroid(ring: number[][]): { x: number; y: number } | null {
  if (!Array.isArray(ring) || ring.length < 3) return null;
  let area = 0;
  let cx = 0;
  let cy = 0;
  for (let i = 0; i < ring.length - 1; i++) {
    const a = ring[i];
    const b = ring[i + 1];
    if (!a || !b || a.length < 2 || b.length < 2) continue;
    const x0 = a[0]!;
    const y0 = a[1]!;
    const x1 = b[0]!;
    const y1 = b[1]!;
    const cross = x0 * y1 - x1 * y0;
    area += cross;
    cx += (x0 + x1) * cross;
    cy += (y0 + y1) * cross;
  }
  area /= 2;
  if (Math.abs(area) < 1e-12) {
    let sx = 0;
    let sy = 0;
    let count = 0;
    for (const p of ring) {
      if (p && p.length >= 2 && p[0] != null && p[1] != null) {
        sx += p[0];
        sy += p[1];
        count++;
      }
    }
    if (count === 0) return null;
    return { x: sx / count, y: sy / count };
  }
  return { x: cx / (6 * area), y: cy / (6 * area) };
}

function batchHash(refnums: string[]): string {
  return createHash('sha1')
    .update(refnums.slice().sort().join('|'))
    .digest('hex')
    .slice(0, 12);
}

async function requestWithRetry(
  url: string,
  init: RequestInit = {},
  attempt = 0,
): Promise<ArcGisResponse> {
  try {
    const res = await fetch(url, {
      ...init,
      headers: {
        'User-Agent': USER_AGENT,
        Accept: 'application/json',
        ...(init.headers ?? {}),
      },
    });
    if (res.status === 429 || res.status >= 500) {
      if (attempt >= RETRY_DELAYS.length) {
        throw new Error(`HTTP ${res.status} after ${attempt} retries`);
      }
      const delay = RETRY_DELAYS[attempt]!;
      console.log(
        `  ↻ HTTP ${res.status}, retry in ${delay}ms (attempt ${attempt + 1}/${RETRY_DELAYS.length})`,
      );
      await sleep(delay);
      return requestWithRetry(url, init, attempt + 1);
    }
    if (!res.ok) {
      throw new Error(`HTTP ${res.status}: ${(await res.text()).slice(0, 200)}`);
    }
    const body = (await res.json()) as ArcGisResponse;
    if (body.error) throw new Error(`ESRI error: ${JSON.stringify(body.error)}`);
    return body;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.startsWith('HTTP ')) throw err;
    if (attempt >= RETRY_DELAYS.length) throw err;
    const delay = RETRY_DELAYS[attempt]!;
    console.log(
      `  ↻ ${msg}, retry in ${delay}ms (attempt ${attempt + 1}/${RETRY_DELAYS.length})`,
    );
    await sleep(delay);
    return requestWithRetry(url, init, attempt + 1);
  }
}

async function readCacheOrFetch(
  cachePath: string,
  force: boolean,
  requestBuilder: () => { url: string; init: RequestInit },
): Promise<ArcGisResponse> {
  if (!force) {
    try {
      const cached = await fs.readFile(cachePath, 'utf8');
      return JSON.parse(cached) as ArcGisResponse;
    } catch {
      /* miss */
    }
  }
  const { url, init } = requestBuilder();
  const body = await requestWithRetry(url, init);
  await fs.mkdir(path.dirname(cachePath), { recursive: true });
  await fs.writeFile(cachePath, JSON.stringify(body), 'utf8');
  return body;
}

function buildQueryRequest(
  layerId: 0 | 1,
  refnums: string[],
): { url: string; init: RequestInit } {
  const where = `NRIS_Refnum IN (${refnums
    .map((r) => `'${String(r).replace(/'/g, "''")}'`)
    .join(',')})`;
  const params = new URLSearchParams({
    where,
    outFields: OUT_FIELDS.join(','),
    outSR: '4326',
    returnGeometry: 'true',
    f: 'json',
  });
  return {
    url: `${ARCGIS_BASE}/${layerId}/query`,
    init: {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: params.toString(),
    },
  };
}

function isNhlFlag(v: unknown): boolean {
  if (v == null) return false;
  const s = String(v).trim();
  if (!s) return false;
  return !/^(no|false|0)$/i.test(s);
}

interface FeatureCoords {
  lat: number | null;
  lon: number | null;
}

function extractCoords(layer: 0 | 1, geometry: ArcGisFeature['geometry']): FeatureCoords {
  if (!geometry) return { lat: null, lon: null };
  if (layer === 0) {
    const g = geometry as { x?: number; y?: number };
    return {
      lat: typeof g.y === 'number' ? g.y : null,
      lon: typeof g.x === 'number' ? g.x : null,
    };
  }
  const g = geometry as { rings?: number[][][] };
  const ring = g.rings?.[0];
  if (!ring) return { lat: null, lon: null };
  const c = ringCentroid(ring);
  if (!c) return { lat: null, lon: null };
  return { lat: c.y, lon: c.x };
}

/**
 * Fetch authoritative coordinates for a list of NRHP reference numbers
 * from the NPS ArcGIS FeatureServer. Tries Layer 0 (points) first, then
 * falls back to Layer 1 (polygons). Returns one entry per refnum with a
 * status of resolved | unparseable | outside_ca.
 *
 * Caches each batch's raw ArcGIS response to disk under
 * `<cacheDir>/nrhp-arcgis/`. Set `force: true` to bypass the cache.
 */
export async function fetchNrhpCoordinates(
  refnums: string[],
  opts: FetchOptions,
): Promise<NrhpResult[]> {
  const force = opts.force ?? false;
  const arcgisCacheDir = path.join(opts.cacheDir, 'nrhp-arcgis');
  await fs.mkdir(arcgisCacheDir, { recursive: true });

  const stamp = new Date().toISOString();

  const uniqueRefnums = [...new Set(refnums.filter((r) => r != null && r !== ''))];
  if (uniqueRefnums.length === 0) return [];

  const layer0Hits = new Map<string, ArcGisFeature>();
  const layer1Hits = new Map<string, ArcGisFeature>();

  // Layer 0 (points)
  for (let i = 0; i < uniqueRefnums.length; i += BATCH_SIZE) {
    const slice = uniqueRefnums.slice(i, i + BATCH_SIZE);
    const cachePath = path.join(arcgisCacheDir, `layer-0-${batchHash(slice)}.json`);
    const body = await readCacheOrFetch(cachePath, force, () => buildQueryRequest(0, slice));
    for (const f of body.features ?? []) {
      const ref = f.attributes?.NRIS_Refnum;
      if (ref == null || !f.geometry) continue;
      layer0Hits.set(String(ref), f);
    }
    if (i + BATCH_SIZE < uniqueRefnums.length) await sleep(PAUSE_MS);
  }

  // Layer 1 (polygons) — only for refnums not found on layer 0
  const unresolvedAfter0 = uniqueRefnums.filter((r) => !layer0Hits.has(r));
  for (let i = 0; i < unresolvedAfter0.length; i += BATCH_SIZE) {
    const slice = unresolvedAfter0.slice(i, i + BATCH_SIZE);
    const cachePath = path.join(arcgisCacheDir, `layer-1-${batchHash(slice)}.json`);
    const body = await readCacheOrFetch(cachePath, force, () => buildQueryRequest(1, slice));
    for (const f of body.features ?? []) {
      const ref = f.attributes?.NRIS_Refnum;
      if (ref == null || !f.geometry) continue;
      // Multiple polygons per refnum (boundary increases) — keep the first.
      if (!layer1Hits.has(String(ref))) layer1Hits.set(String(ref), f);
    }
    if (i + BATCH_SIZE < unresolvedAfter0.length) await sleep(PAUSE_MS);
  }

  // Build per-refnum results
  const out: NrhpResult[] = [];
  for (const ref of uniqueRefnums) {
    const layer0 = layer0Hits.get(ref);
    const layer1 = layer1Hits.get(ref);
    const layer: 0 | 1 | null = layer0 ? 0 : layer1 ? 1 : null;
    const feature = layer0 ?? layer1 ?? null;

    if (!feature || layer == null) {
      out.push({ refnum: ref, status: 'unparseable' });
      continue;
    }

    const { lat, lon } = extractCoords(layer, feature.geometry);
    if (lat == null || lon == null || !Number.isFinite(lat) || !Number.isFinite(lon)) {
      out.push({ refnum: ref, status: 'unparseable' });
      continue;
    }
    if (
      lat < CA_BBOX.minLat || lat > CA_BBOX.maxLat ||
      lon < CA_BBOX.minLon || lon > CA_BBOX.maxLon
    ) {
      out.push({ refnum: ref, status: 'outside_ca', lat, lng: lon, layer });
      continue;
    }

    const attrs = feature.attributes ?? {};
    const srcAccu = (attrs['SRC_ACCU'] as string | null | undefined) ?? null;
    const accuMeters = parseSrcAccuMeters(srcAccu);
    const venueMetadata: NrhpVenueMetadata = {
      geocoding_method: 'nrhp_arcgis',
      nrhp_layer: layer,
      nrhp_bnd_type: (attrs['BND_TYPE'] as string | null | undefined) ?? null,
      nrhp_map_method: (attrs['MAP_METHOD'] as string | null | undefined) ?? null,
      nrhp_src_accu: srcAccu,
      nrhp_src_accu_meters: accuMeters,
      nrhp_resolved_at: stamp,
    };

    out.push({
      refnum: ref,
      status: 'resolved',
      lat,
      lng: lon,
      layer,
      resname: (attrs['RESNAME'] as string | null | undefined) ?? null,
      address: (attrs['Address'] as string | null | undefined) ?? null,
      city: (attrs['City'] as string | null | undefined) ?? null,
      county: (attrs['County'] as string | null | undefined) ?? null,
      isNhl: isNhlFlag(attrs['Is_NHL']),
      venueMetadata,
    });
  }

  return out;
}

export function nrhpAssetDetailUrl(refnum: string): string {
  return `https://npgallery.nps.gov/AssetDetail/NRIS/${encodeURIComponent(refnum)}`;
}
