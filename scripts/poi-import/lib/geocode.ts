import { promises as fs } from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';

const NOMINATIM_URL = 'https://nominatim.openstreetmap.org/search';
const MIN_INTERVAL_MS = 1100;

export interface GeocodeResult {
  lat: number;
  lng: number;
  displayName: string;
  osmType?: string;
  osmId?: number;
}

export interface GeocodeOptions {
  cacheDir: string;
  userAgent?: string;
  countrycodes?: string;
  limit?: number;
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

  const raw = (await res.json()) as Array<{
    lat: string; lon: string; display_name: string;
    osm_type?: string; osm_id?: number;
  }>;

  const results: GeocodeResult[] = raw.map((r) => ({
    lat: Number(r.lat),
    lng: Number(r.lon),
    displayName: r.display_name,
    osmType: r.osm_type,
    osmId: r.osm_id,
  }));

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
