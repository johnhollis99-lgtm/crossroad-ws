import { promises as fs } from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';

const NOMINATIM_URL = 'https://nominatim.openstreetmap.org/search';
const MIN_INTERVAL_MS = 1100;

// Precision-validation thresholds. Reject Nominatim results that resolve
// to administrative areas, cities, counties, or anything with a county-sized
// bounding box — these are the "city centroid" fallbacks that produced the
// Tijuana-border placeholder bug for NRHP imports.
const REJECT_TYPES = new Set([
  'administrative',
  'city',
  'town',
  'village',
  'county',
]);
const REJECT_CLASSES = new Set(['boundary', 'place']);
const MAX_BBOX_AXIS_KM = 5;

export interface GeocodeResult {
  lat: number;
  lng: number;
  displayName: string;
  osmType?: string;
  osmId?: number;
  osmClass?: string;
  type?: string;
  boundingbox?: [number, number, number, number]; // [minLat, maxLat, minLon, maxLon]
}

export interface GeocodeOptions {
  cacheDir: string;
  userAgent?: string;
  countrycodes?: string;
  limit?: number;
}

export interface NominatimRaw {
  lat: string;
  lon: string;
  display_name: string;
  osm_type?: string;
  osm_id?: number;
  class?: string;
  type?: string;
  boundingbox?: [string, string, string, string];
}

export type PrecisionRejection =
  | 'no_coords'
  | 'reject_type'
  | 'reject_class'
  | 'reject_bbox';

export interface PrecisionCheck {
  ok: boolean;
  reason?: PrecisionRejection;
  detail?: string;
}

let lastRequestAt = 0;

async function rateLimit(): Promise<void> {
  const now = Date.now();
  const wait = lastRequestAt + MIN_INTERVAL_MS - now;
  if (wait > 0) await new Promise((r) => setTimeout(r, wait));
  lastRequestAt = Date.now();
}

function cacheKey(query: string, opts: GeocodeOptions): string {
  const hash = createHash('sha1')
    .update(JSON.stringify({ query, cc: opts.countrycodes, limit: opts.limit }))
    .digest('hex')
    .slice(0, 16);
  return `geocode-${hash}.json`;
}

async function readCache(file: string): Promise<GeocodeResult[] | null> {
  try {
    const raw = await fs.readFile(file, 'utf8');
    return JSON.parse(raw) as GeocodeResult[];
  } catch {
    return null;
  }
}

async function writeCache(file: string, data: GeocodeResult[]): Promise<void> {
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, JSON.stringify(data, null, 2), 'utf8');
}

function haversineKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const R = 6371;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

/**
 * Reject Nominatim results that resolve to administrative areas, cities,
 * towns, villages, counties, or anything with a bounding box larger than
 * 5 km on either axis. These are the imprecise fallbacks that produced the
 * original NRHP Tijuana-border placeholder bug.
 *
 * The lat/lon-axis dimensions of the bbox are computed via haversine on
 * the bbox edges (not the diagonal) so that a long-thin shape — like a
 * wide-but-short city — still trips the precision gate on its long axis.
 */
export function checkResultPrecision(raw: NominatimRaw): PrecisionCheck {
  const lat = Number(raw.lat);
  const lon = Number(raw.lon);
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
    return { ok: false, reason: 'no_coords', detail: `lat=${raw.lat} lon=${raw.lon}` };
  }
  if (raw.type && REJECT_TYPES.has(raw.type)) {
    return { ok: false, reason: 'reject_type', detail: `type=${raw.type}` };
  }
  if (raw.class && REJECT_CLASSES.has(raw.class)) {
    return { ok: false, reason: 'reject_class', detail: `class=${raw.class}` };
  }
  if (raw.boundingbox && raw.boundingbox.length === 4) {
    const minLat = Number(raw.boundingbox[0]);
    const maxLat = Number(raw.boundingbox[1]);
    const minLon = Number(raw.boundingbox[2]);
    const maxLon = Number(raw.boundingbox[3]);
    if (
      Number.isFinite(minLat) && Number.isFinite(maxLat) &&
      Number.isFinite(minLon) && Number.isFinite(maxLon)
    ) {
      const midLat = (minLat + maxLat) / 2;
      const midLon = (minLon + maxLon) / 2;
      const latKm = haversineKm(minLat, midLon, maxLat, midLon);
      const lonKm = haversineKm(midLat, minLon, midLat, maxLon);
      if (latKm > MAX_BBOX_AXIS_KM || lonKm > MAX_BBOX_AXIS_KM) {
        return {
          ok: false,
          reason: 'reject_bbox',
          detail: `latKm=${latKm.toFixed(2)} lonKm=${lonKm.toFixed(2)}`,
        };
      }
    }
  }
  return { ok: true };
}

function normalizeRaw(raw: NominatimRaw): GeocodeResult {
  const result: GeocodeResult = {
    lat: Number(raw.lat),
    lng: Number(raw.lon),
    displayName: raw.display_name,
  };
  if (raw.osm_type !== undefined) result.osmType = raw.osm_type;
  if (raw.osm_id !== undefined) result.osmId = raw.osm_id;
  if (raw.class !== undefined) result.osmClass = raw.class;
  if (raw.type !== undefined) result.type = raw.type;
  if (raw.boundingbox && raw.boundingbox.length === 4) {
    const minLat = Number(raw.boundingbox[0]);
    const maxLat = Number(raw.boundingbox[1]);
    const minLon = Number(raw.boundingbox[2]);
    const maxLon = Number(raw.boundingbox[3]);
    if (
      Number.isFinite(minLat) && Number.isFinite(maxLat) &&
      Number.isFinite(minLon) && Number.isFinite(maxLon)
    ) {
      result.boundingbox = [minLat, maxLat, minLon, maxLon];
    }
  }
  return result;
}

export async function geocode(
  query: string,
  opts: GeocodeOptions,
): Promise<GeocodeResult[]> {
  const cacheFile = path.join(opts.cacheDir, 'geocode', cacheKey(query, opts));
  const cached = await readCache(cacheFile);
  if (cached) return cached;

  await rateLimit();

  const params = new URLSearchParams({
    q: query,
    format: 'jsonv2',
    limit: String(opts.limit ?? 1),
    addressdetails: '0',
  });
  if (opts.countrycodes) params.set('countrycodes', opts.countrycodes);

  const res = await fetch(`${NOMINATIM_URL}?${params.toString()}`, {
    headers: {
      'User-Agent': opts.userAgent ?? 'XRoad-POI-Import/0.1 (johnhollis99@gmail.com)',
      'Accept': 'application/json',
    },
  });
  if (!res.ok) throw new Error(`Nominatim ${res.status}: ${await res.text()}`);

  const raw = (await res.json()) as NominatimRaw[];

  const results: GeocodeResult[] = [];
  for (const r of raw) {
    const check = checkResultPrecision(r);
    if (!check.ok) {
      console.warn(
        `[geocode] rejected for "${query}": ${check.reason} (${check.detail ?? ''}) — display_name="${r.display_name}"`,
      );
      continue;
    }
    results.push(normalizeRaw(r));
  }

  await writeCache(cacheFile, results);
  return results;
}

export async function geocodeOne(
  query: string,
  opts: GeocodeOptions,
): Promise<GeocodeResult | null> {
  const all = await geocode(query, { ...opts, limit: 1 });
  return all[0] ?? null;
}
