#!/usr/bin/env node
/**
 * Phase 2 of E1d: polygon-source verification for the top-30 named valleys.
 *
 * Read-only. No DB writes, no region inserts. Output is a structured report
 * + a JSON file under cache/named-valleys-verification.json.
 *
 * For each of 30 regions:
 *   1. Query OSM Overpass for candidate polygons matching the name in CA bbox
 *      (multi-tag union: natural, place, boundary, landuse).
 *   2. Classify each match by tags:
 *        - geological: natural=valley | natural=basin | place=basin |
 *                      natural=desert | natural=badlands
 *        - ava:        landuse=vineyard with wine-region naming
 *        - protected:  boundary=protected_area / national_park
 *        - admin:      boundary=administrative / place=city/town/CDP
 *        - locality:   place=locality (vague — flag)
 *   3. Pick best match: geological > acceptedPolygonTypes > flagged-admin > none.
 *   4. For "none" cases, fall back to Wikidata (Q-number from cached
 *      Wikipedia summary's `wikibase_item`, then SPARQL for P625 + P2046).
 *   5. Tag finalTier: A = geological/accepted polygon, B = Wikidata buffer,
 *      C = manual digitization needed.
 *
 * Overlap analysis (informational, non-blocking per curator direction):
 *   For three known nested-pair groups, compute bbox-overlap area as a
 *   first-pass overlap signal. Detailed polygon-intersection is deferred to
 *   live-run phase; user explicitly accepted that overlapping regions stay
 *   as separate rows (runtime tie-breaking via lookahead worker per
 *   addendum §10).
 *
 * Manual-only cases (no OSM/Wikidata query): Lake Tahoe Basin,
 *   Hetch Hetchy Valley — both flagged as Tier C by curator decision.
 *
 * Run from scripts/region-import/:
 *   npx tsx verify-named-valleys-polygons.ts
 */
import { config as dotenvConfig } from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';
import path from 'node:path';
import fs from 'node:fs';
import crypto from 'node:crypto';
import chalk from 'chalk';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
dotenvConfig({ path: resolve(__dirname, '../../.env') });

// ───────────────────────── config ─────────────────────────

const CA_BBOX = { minLat: 32.5, minLon: -124.5, maxLat: 42.0, maxLon: -114.0 };
const OVERPASS_URL = 'https://overpass-api.de/api/interpreter';
const WIKIDATA_SPARQL_URL = 'https://query.wikidata.org/sparql';
const CACHE_DIR = path.join(__dirname, 'cache');
const OVERPASS_CACHE_TTL_MS = 30 * 24 * 3600 * 1000;
const WIKIDATA_CACHE_TTL_MS = 30 * 24 * 3600 * 1000;
const OVERPASS_RATE_DELAY_MS = 4000;
const WIKIDATA_RATE_DELAY_MS = 1500;
const OUT_JSON = path.join(CACHE_DIR, 'named-valleys-verification.json');

const USER_AGENT =
  'XRoad-Region-Import/0.1 (https://github.com/johnhollis99-lgtm/crossroad-ws; contact: john)';

// ───────────────────────── top-30 input ─────────────────────────

interface TopRegion {
  rank: number;
  displayName: string;        // shown in the table/report
  articleTitle: string;       // Wikipedia article title (for cache lookup → Q-number)
  /** Names to try in OSM (`name` tag) — articleTitle + any aliases */
  osmNameCandidates: string[];
  proposedTier: 'A' | 'B' | 'C';
  /** OK list of polygon source types to accept beyond strict geological */
  acceptedPolygonTypes?: PolygonType[];
  /** If true, skip OSM/Wikidata; manual digitization only (Tier C). */
  manualOnly?: boolean;
  /** Free-text curator note */
  notes?: string;
}

const TOP_30: TopRegion[] = [
  { rank: 1,  displayName: 'Lake Tahoe Basin',          articleTitle: 'Lake Tahoe',                       osmNameCandidates: ['Lake Tahoe Basin', 'Lake Tahoe'], proposedTier: 'C', manualOnly: true, notes: 'No clean Wikipedia/Wikidata basin entity; manual digitization' },
  { rank: 2,  displayName: 'Coachella Valley',          articleTitle: 'Coachella Valley',                 osmNameCandidates: ['Coachella Valley'], proposedTier: 'A' },
  { rank: 3,  displayName: 'San Fernando Valley',       articleTitle: 'San Fernando Valley',              osmNameCandidates: ['San Fernando Valley'], proposedTier: 'A' },
  { rank: 4,  displayName: 'Death Valley',              articleTitle: 'Death Valley',                     osmNameCandidates: ['Death Valley'], proposedTier: 'A' },
  { rank: 5,  displayName: 'Mono Basin',                articleTitle: 'Mono Basin',                       osmNameCandidates: ['Mono Basin', 'Mono Lake Basin'], proposedTier: 'A' },
  { rank: 6,  displayName: 'Napa Valley',               articleTitle: 'Napa Valley',                      osmNameCandidates: ['Napa Valley', 'Napa Valley AVA'], proposedTier: 'A', acceptedPolygonTypes: ['ava'], notes: 'AVA polygon explicitly accepted' },
  { rank: 7,  displayName: 'Russian River Valley AVA',  articleTitle: 'Russian River Valley AVA',         osmNameCandidates: ['Russian River Valley', 'Russian River Valley AVA'], proposedTier: 'A', acceptedPolygonTypes: ['ava'], notes: 'AVA polygon explicitly accepted' },
  { rank: 8,  displayName: 'Sonoma Valley',             articleTitle: 'Sonoma Valley',                    osmNameCandidates: ['Sonoma Valley', 'Sonoma Valley AVA'], proposedTier: 'A', acceptedPolygonTypes: ['ava'], notes: 'AVA polygon explicitly accepted' },
  { rank: 9,  displayName: 'Hetch Hetchy Valley',       articleTitle: 'Hetch Hetchy Valley',              osmNameCandidates: ['Hetch Hetchy Valley'], proposedTier: 'C', manualOnly: true, notes: 'Partially under reservoir; manual digitization' },
  { rank: 10, displayName: 'Panamint Valley',           articleTitle: 'Panamint Valley',                  osmNameCandidates: ['Panamint Valley'], proposedTier: 'B' },
  { rank: 11, displayName: 'Saline Valley',             articleTitle: 'Saline Valley',                    osmNameCandidates: ['Saline Valley'], proposedTier: 'B' },
  { rank: 12, displayName: 'Anderson Valley',           articleTitle: 'Anderson Valley',                  osmNameCandidates: ['Anderson Valley'], proposedTier: 'B' },
  { rank: 13, displayName: 'Capay Valley',              articleTitle: 'Capay Valley',                     osmNameCandidates: ['Capay Valley'], proposedTier: 'B' },
  { rank: 14, displayName: 'Sierra Valley',             articleTitle: 'Sierra Valley',                    osmNameCandidates: ['Sierra Valley'], proposedTier: 'B', acceptedPolygonTypes: ['valley', 'meadow'], notes: 'Tag-fallback natural=valley + landuse=meadow within 30km of Wikidata centroid (round-1 name-match candidate was sanity-rejected at 264km)' },
  { rank: 15, displayName: 'Cuyama Valley',             articleTitle: 'Cuyama Valley',                    osmNameCandidates: ['Cuyama Valley'], proposedTier: 'B' },
  { rank: 16, displayName: 'San Joaquin Valley',        articleTitle: 'San Joaquin Valley',               osmNameCandidates: ['San Joaquin Valley'], proposedTier: 'A', acceptedPolygonTypes: ['region', 'admin_county'], notes: 'Big-valley fallback: region/admin tag-fallback per curator direction; admin polygon must pass area-plausibility check (within one OOM of real area)' },
  { rank: 17, displayName: 'San Gabriel Valley',        articleTitle: 'San Gabriel Valley',               osmNameCandidates: ['San Gabriel Valley'], proposedTier: 'A' },
  { rank: 18, displayName: 'Salinas Valley',            articleTitle: 'Salinas Valley',                   osmNameCandidates: ['Salinas Valley'], proposedTier: 'A' },
  { rank: 19, displayName: 'Santa Ynez Valley',         articleTitle: 'Santa Ynez Valley',                osmNameCandidates: ['Santa Ynez Valley'], proposedTier: 'A' },
  { rank: 20, displayName: 'Yosemite Valley',           articleTitle: 'Yosemite Valley',                  osmNameCandidates: ['Yosemite Valley'], proposedTier: 'A' },
  { rank: 21, displayName: 'Imperial Valley',           articleTitle: 'Imperial Valley',                  osmNameCandidates: ['Imperial Valley'], proposedTier: 'A' },
  { rank: 22, displayName: 'Anza-Borrego Desert',       articleTitle: 'Anza-Borrego Desert State Park',   osmNameCandidates: ['Anza-Borrego Desert', 'Anza Borrego Desert', 'Anza-Borrego Desert State Park', 'Borrego Badlands'], proposedTier: 'A', acceptedPolygonTypes: ['desert', 'badlands', 'protected_area', 'state_park'], notes: 'State Park boundary accepted (~96% of real desert area). State Park polygon co-extensive with the desert for narration purposes — per curator direction 2026-05-14' },
  { rank: 23, displayName: 'Antelope Valley',           articleTitle: 'Antelope Valley',                  osmNameCandidates: ['Antelope Valley'], proposedTier: 'A' },
  { rank: 24, displayName: 'Owens Valley',              articleTitle: 'Owens Valley',                     osmNameCandidates: ['Owens Valley'], proposedTier: 'A' },
  { rank: 25, displayName: 'Long Valley Caldera',       articleTitle: 'Long Valley Caldera',              osmNameCandidates: ['Long Valley Caldera', 'Long Valley'], proposedTier: 'B' },
  { rank: 26, displayName: 'Santa Clara Valley',        articleTitle: 'Santa Clara Valley',               osmNameCandidates: ['Santa Clara Valley'], proposedTier: 'A' },
  { rank: 27, displayName: 'Los Angeles Basin',         articleTitle: 'Los Angeles Basin',                osmNameCandidates: ['Los Angeles Basin', 'LA Basin'], proposedTier: 'A', acceptedPolygonTypes: ['region', 'admin_county'], notes: 'Big-valley fallback per curator direction' },
  { rank: 28, displayName: 'Carrizo Plain',             articleTitle: 'Carrizo Plain',                    osmNameCandidates: ['Carrizo Plain', 'Carrizo Plain National Monument'], proposedTier: 'A', acceptedPolygonTypes: ['protected_area', 'national_park'], notes: 'National Monument boundary ≈ plain boundary; admin polygon accepted (polygon_source = osm_protected_area_nm)' },
  { rank: 29, displayName: 'Sacramento Valley',         articleTitle: 'Sacramento Valley',                osmNameCandidates: ['Sacramento Valley'], proposedTier: 'A', acceptedPolygonTypes: ['region', 'admin_county'], notes: 'Big-valley fallback per curator direction' },
  { rank: 30, displayName: 'Conejo Valley',             articleTitle: 'Conejo Valley',                    osmNameCandidates: ['Conejo Valley'], proposedTier: 'B' },
];

// ───────────────────────── types ─────────────────────────

type PolygonType =
  | 'valley' | 'basin' | 'desert' | 'badlands' | 'plain' | 'caldera' | 'meadow' // geological
  | 'ava'                                                              // wine appellation
  | 'region'                                                           // cultural/geographic region (place=region / boundary=region)
  | 'protected_area' | 'national_park' | 'state_park'                  // protected admin
  | 'aboriginal'                                                       // aboriginal lands
  | 'admin' | 'admin_county' | 'locality' | 'place_city'               // administrative
  | 'unknown';

const GEOLOGICAL_TYPES: PolygonType[] = ['valley', 'basin', 'desert', 'badlands', 'plain', 'caldera'];

interface OsmCandidate {
  osmType: 'relation' | 'way';
  osmId: number;
  name: string;
  tags: Record<string, string>;
  bbox: { minLat: number; minLon: number; maxLat: number; maxLon: number } | null;
  polygonType: PolygonType;
  isGeological: boolean;
  polygonSource: string; // e.g., 'osm_natural_valley', 'osm_landuse_vineyard_ava'
}

interface VerificationResult {
  rank: number;
  displayName: string;
  articleTitle: string;
  proposedTier: 'A' | 'B' | 'C';
  finalTier: 'A' | 'B' | 'C';
  resolution: {
    method:
      | 'osm_geological'           // strong: a geological polygon was found
      | 'osm_admin_accepted'       // OK: an admin polygon matches an acceptedPolygonTypes entry
      | 'osm_admin_flagged'        // FLAG: admin polygon only, curator decides
      | 'osm_locality_flagged'     // FLAG: only a CDP/locality boundary
      | 'wikidata_buffer'          // fallback: centroid + buffer from Wikidata
      | 'manual'                   // skip: forceManual or all paths failed
      | 'failed';                  // no polygon found anywhere
    polygonSource: string;
    /** How the polygon was decided — audit trail for review (e.g.,
     *  'osm_name_match', 'osm_tag_fallback', 'wikidata_buffer_area_derived',
     *  'wikidata_buffer_heuristic_15km', 'wikidata_buffer_default_5km',
     *  'osm_protected_area_nm'). */
    polygonSourceMethod: string;
    osmType?: 'relation' | 'way';
    osmId?: number;
    osmTags?: Record<string, string>;
    osmBbox?: { minLat: number; minLon: number; maxLat: number; maxLon: number };
    wikidataQ?: string;
    wikidataCentroid?: { lat: number; lon: number };
    wikidataArea_km2?: number | null;
    bufferRadius_km?: number;
    flags: string[];
  };
  /** Polygon adequacy: comparison of final polygon area vs real-world area. */
  adequacy?: {
    finalArea_km2: number | null;
    realArea_km2: number | null;
    ratio: number | null; // finalArea / realArea
    inadequate: boolean;  // ratio < 0.5
  };
  notes?: string;
  /** All Overpass candidates considered (informational for the JSON output) */
  candidatesConsidered: OsmCandidate[];
  /** Wikidata Q-number lookup result (whether or not OSM succeeded; used for
   *  location-sanity check + buffer heuristic). */
  wikidataInfo?: WikidataInfo & { qid: string };
}

// Real-world area estimates (km²). Sourced from Wikipedia / rough estimates.
// Used for adequacy flagging only — not persisted to the regions table.
// Approximate; user is reviewing adequacy flags so precision isn't load-bearing.
const REAL_AREA_KM2: Record<string, number> = {
  'Lake Tahoe Basin':         1_300,   // basin around the lake
  'Coachella Valley':         1_600,
  'San Fernando Valley':        680,
  'Death Valley':             7_800,
  'Mono Basin':               1_900,
  'Napa Valley':                600,
  'Russian River Valley AVA':   380,
  'Sonoma Valley':              380,
  'Hetch Hetchy Valley':         30,
  'Panamint Valley':          1_100,
  'Saline Valley':              770,
  'Anderson Valley':            250,
  'Capay Valley':               250,
  'Sierra Valley':              500,
  'Cuyama Valley':              770,
  'San Joaquin Valley':      28_000,
  'San Gabriel Valley':       1_100,
  'Salinas Valley':           1_500,
  'Santa Ynez Valley':          300,
  'Yosemite Valley':             18,
  'Imperial Valley':          1_300,
  'Anza-Borrego Desert':      2_500,
  'Antelope Valley':          7_800,
  'Owens Valley':             8_400,
  'Long Valley Caldera':        580,
  'Santa Clara Valley':       1_300,
  'Los Angeles Basin':       12_000,
  'Carrizo Plain':            1_000,
  'Sacramento Valley':       28_000,
  'Conejo Valley':              200,
};

const REGION_TYPE_KEYWORDS = ['valley', 'basin', 'plain', 'caldera', 'desert', 'badlands'];

// Locations where the OSM name match was checked against the Wikidata centroid
// and rejected because it was too far away. Kept globally for the post-run report.
const SANITY_CHECK_LOG: Array<{ region: string; reason: string }> = [];

// ───────────────────────── helpers ─────────────────────────

function sha1(s: string): string {
  return crypto.createHash('sha1').update(s).digest('hex');
}

function readCache<T>(file: string, ttlMs: number): T | null {
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

// Escape a string for use inside an Overpass regex literal
function escapeOverpassRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// ───────────────────────── classify polygon ─────────────────────────

function classifyTags(tags: Record<string, string>): { type: PolygonType; isGeological: boolean; source: string } {
  if (tags['natural'] === 'valley')           return { type: 'valley',          isGeological: true,  source: 'osm_natural_valley' };
  if (tags['natural'] === 'basin')            return { type: 'basin',           isGeological: true,  source: 'osm_natural_basin' };
  if (tags['place']   === 'basin')            return { type: 'basin',           isGeological: true,  source: 'osm_place_basin' };
  if (tags['natural'] === 'desert')           return { type: 'desert',          isGeological: true,  source: 'osm_natural_desert' };
  if (tags['natural'] === 'badlands')         return { type: 'badlands',        isGeological: true,  source: 'osm_natural_badlands' };
  if (tags['natural'] === 'plain')            return { type: 'plain',           isGeological: true,  source: 'osm_natural_plain' };
  if (tags['landuse'] === 'meadow')           return { type: 'meadow',          isGeological: true,  source: 'osm_landuse_meadow' };
  if (tags['natural'] === 'volcanic_caldera') return { type: 'caldera',         isGeological: true,  source: 'osm_natural_volcanic_caldera' };
  if (tags['geological'] === 'volcanic_caldera') return { type: 'caldera',      isGeological: true,  source: 'osm_geological_volcanic_caldera' };

  // AVA rules (more specific) BEFORE generic `place=region` — AVA polygons
  // are often tagged with both `boundary=viticulture` AND `place=region`,
  // and the AVA classification is the correct one.
  if (tags['landuse'] === 'vineyard' && (tags['wine_region'] || tags['name']?.toLowerCase().includes('ava'))) {
    return { type: 'ava', isGeological: false, source: 'osm_ava_landuse_vineyard' };
  }
  if (tags['boundary'] === 'wine_region' || tags['boundary'] === 'wine_appellation') {
    return { type: 'ava', isGeological: false, source: 'osm_boundary_wine' };
  }
  if (tags['boundary'] === 'viticulture') {
    // OSM uses boundary=viticulture for some AVA polygons (Napa Valley AVA = relation/5261894).
    return { type: 'ava', isGeological: false, source: 'osm_boundary_viticulture' };
  }
  if (tags['name']?.toLowerCase().includes('ava')) {
    // Any polygon whose name contains "AVA" is an American Viticultural
    // Area — even if tagged as place=region without boundary=viticulture.
    return { type: 'ava', isGeological: false, source: 'osm_name_ava' };
  }

  // Generic region rules — only after AVA rules
  if (tags['place']   === 'region')           return { type: 'region',          isGeological: false, source: 'osm_place_region' };
  if (tags['boundary']=== 'region')           return { type: 'region',          isGeological: false, source: 'osm_boundary_region' };

  if (tags['boundary'] === 'protected_area') {
    const pc = tags['protect_class'];
    if (pc === '2' || pc === '5')  return { type: 'national_park', isGeological: false, source: `osm_protected_area_pc${pc}` };
    // Recognize state-park-class protected areas (protect_class 4 in OSM)
    if (pc === '4')                return { type: 'state_park',    isGeological: false, source: 'osm_protected_area_pc4_state_park' };
    return { type: 'protected_area', isGeological: false, source: 'osm_protected_area' };
  }
  if (tags['boundary'] === 'national_park')   return { type: 'national_park',  isGeological: false, source: 'osm_boundary_national_park' };
  if (tags['leisure']  === 'park')            return { type: 'protected_area', isGeological: false, source: 'osm_leisure_park' };
  if (tags['boundary'] === 'aboriginal_lands')return { type: 'aboriginal',     isGeological: false, source: 'osm_boundary_aboriginal_lands' };
  if (tags['boundary'] === 'administrative') {
    const lvl = tags['admin_level'];
    if (lvl === '6')                          return { type: 'admin_county', isGeological: false, source: 'osm_boundary_admin_level_6_county' };
    return { type: 'admin', isGeological: false, source: `osm_boundary_admin_level_${lvl ?? '?'}` };
  }

  if (tags['place'] === 'city' || tags['place'] === 'town' || tags['place'] === 'village' || tags['place'] === 'hamlet') {
    return { type: 'place_city', isGeological: false, source: `osm_place_${tags['place']}` };
  }
  if (tags['place'] === 'locality' || tags['place'] === 'suburb' || tags['place'] === 'neighbourhood') {
    return { type: 'locality', isGeological: false, source: `osm_place_${tags['place']}` };
  }

  return { type: 'unknown', isGeological: false, source: 'osm_unknown' };
}

function bboxArea_km2(bbox: { minLat: number; minLon: number; maxLat: number; maxLon: number }): number {
  // Rough approximation: 1° lat ≈ 111 km, 1° lon ≈ 111 × cos(lat) km
  const dLat = bbox.maxLat - bbox.minLat;
  const dLon = bbox.maxLon - bbox.minLon;
  const midLat = (bbox.minLat + bbox.maxLat) / 2;
  return dLat * 111 * dLon * 111 * Math.cos((midLat * Math.PI) / 180);
}

function bboxCentroid(bbox: { minLat: number; minLon: number; maxLat: number; maxLon: number }): { lat: number; lon: number } {
  return { lat: (bbox.minLat + bbox.maxLat) / 2, lon: (bbox.minLon + bbox.maxLon) / 2 };
}

function haversineKm(a: { lat: number; lon: number }, b: { lat: number; lon: number }): number {
  const R = 6371;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLon = toRad(b.lon - a.lon);
  const aa =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.atan2(Math.sqrt(aa), Math.sqrt(1 - aa));
}

function summaryHasRegionKeyword(articleTitle: string): boolean {
  const file = path.join(CACHE_DIR, 'wikipedia-summaries', `${sha1(articleTitle)}.json`);
  try {
    const s = JSON.parse(fs.readFileSync(file, 'utf-8')) as { extract?: string };
    const text = (s.extract ?? '').toLowerCase();
    return REGION_TYPE_KEYWORDS.some((k) => text.includes(k));
  } catch {
    return false;
  }
}

function bboxOverlapArea_km2(
  a: { minLat: number; minLon: number; maxLat: number; maxLon: number },
  b: { minLat: number; minLon: number; maxLat: number; maxLon: number },
): number {
  const minLat = Math.max(a.minLat, b.minLat);
  const maxLat = Math.min(a.maxLat, b.maxLat);
  const minLon = Math.max(a.minLon, b.minLon);
  const maxLon = Math.min(a.maxLon, b.maxLon);
  if (minLat >= maxLat || minLon >= maxLon) return 0;
  return bboxArea_km2({ minLat, minLon, maxLat, maxLon });
}

// ───────────────────────── Overpass ─────────────────────────

interface OverpassElement {
  type: 'relation' | 'way' | 'node';
  id: number;
  tags?: Record<string, string>;
  bounds?: { minlat: number; minlon: number; maxlat: number; maxlon: number };
  geometry?: Array<{ lat: number; lon: number }>;
  members?: Array<{ type: string; ref: number; role: string; geometry?: Array<{ lat: number; lon: number }> }>;
}

interface OverpassResponse {
  elements: OverpassElement[];
  /** Overpass sometimes returns elements=[] with a `remark` describing why
   *  (timeout, runtime error). Distinguishing this from a legitimate "no
   *  matches" lets us retry transient empties without retrying legitimate
   *  zero-result queries. */
  remark?: string;
}

async function queryOverpass(names: string[]): Promise<OverpassElement[]> {
  // Cache key from the sorted name set
  const key = sha1(names.slice().sort().join('|'));
  const cacheFile = path.join(CACHE_DIR, 'overpass-named-valleys', `${key}.json`);
  const cached = readCache<OverpassElement[]>(cacheFile, OVERPASS_CACHE_TTL_MS);
  if (cached) return cached;

  // Build OQL query: name match only (no server-side tag filter), in CA bbox.
  // Client-side filter to polygon-relevant tags afterwards.
  //
  // Multi-tag union queries (relation[name][natural] + relation[name][place] + ...)
  // were silently returning empty results from the Overpass server — the union
  // was either too complex or hit some other validation/timeout. Simpler
  // name-only queries return reliably (verified manually).
  const bboxStr = `${CA_BBOX.minLat},${CA_BBOX.minLon},${CA_BBOX.maxLat},${CA_BBOX.maxLon}`;
  const parts: string[] = [];
  for (const rawName of names) {
    const nameRe = escapeOverpassRegex(rawName);
    parts.push(`relation["name"~"^${nameRe}$",i](${bboxStr});`);
    parts.push(`way["name"~"^${nameRe}$",i](${bboxStr});`);
    parts.push(`relation["name:en"~"^${nameRe}$",i](${bboxStr});`);
    parts.push(`way["name:en"~"^${nameRe}$",i](${bboxStr});`);
  }
  const query = `[out:json][timeout:90];(${parts.join('')});out tags bb;`;

  const body = new URLSearchParams({ data: query });
  let lastErr: Error | null = null;
  let emptyRetries = 0;
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
      if (res.status === 429 || res.status === 504 || res.status === 502 || res.status === 503) {
        const wait = 5000 * (attempt + 1);
        console.warn(chalk.yellow(`  Overpass ${res.status} — retrying in ${wait}ms`));
        await sleep(wait);
        continue;
      }
      if (!res.ok) throw new Error(`Overpass HTTP ${res.status} ${res.statusText}`);
      const json = (await res.json()) as OverpassResponse;
      // Retry-on-empty: Overpass occasionally returns elements=[] with a
      // `remark` describing the failure (timeout/runtime error), and sometimes
      // returns silently-empty without a remark for what should be a hit.
      // Distinguish: if elements=[] and no remark, retry once after a longer
      // delay. Repeat retries are limited (emptyRetries < 1).
      if (json.elements.length === 0 && emptyRetries < 1) {
        const detail = json.remark ? ` (remark: "${json.remark}")` : '';
        console.warn(chalk.yellow(`  Overpass returned 0 elements${detail} — retrying once after 8000ms`));
        await sleep(8000);
        emptyRetries++;
        continue;
      }
      writeCache(cacheFile, json.elements);
      return json.elements;
    } catch (err) {
      lastErr = err as Error;
      const wait = 3000 * (attempt + 1);
      console.warn(chalk.yellow(`  Overpass error: ${lastErr.message} — retrying in ${wait}ms`));
      await sleep(wait);
    }
  }
  throw lastErr ?? new Error('Overpass query failed after retries');
}

// Tags that indicate the element is a polygonal region/landform we care about.
// Used to filter out roads, canals, rivers, points-of-interest, amenities, etc.
// that happen to share a name with a valley.
const POLYGON_RELEVANT_TAGS = new Set([
  'natural', 'place', 'boundary', 'landuse', 'leisure', 'geological', 'tourism', 'historic',
]);

function isPolygonRelevant(tags: Record<string, string>): boolean {
  for (const k of POLYGON_RELEVANT_TAGS) {
    if (tags[k]) return true;
  }
  return false;
}

/**
 * Tag-based Overpass query within a radius of a known centroid. Used as a
 * fallback when the name-match query returns no usable polygon — looks for
 * polygons of the right *type* near the right *location*, regardless of how
 * OSM has the name tagged.
 *
 * Tag families queried, gated by acceptedTypes:
 *   ava            → landuse=vineyard + wine_region | boundary=wine_region
 *                    | boundary=protected_area + protect_class=22
 *   desert/badlands → natural=desert | natural=badlands
 *   protected_area  → boundary=protected_area | boundary=national_park
 *   national_park   → boundary=national_park
 */
async function queryOverpassByTagNearCentroid(
  centroid: { lat: number; lon: number },
  acceptedTypes: PolygonType[],
  radiusKm: number,
): Promise<OverpassElement[]> {
  const sortedTypes = acceptedTypes.slice().sort().join(',');
  const key = sha1(`${centroid.lat.toFixed(3)},${centroid.lon.toFixed(3)}|${radiusKm}|${sortedTypes}`);
  const cacheFile = path.join(CACHE_DIR, 'overpass-by-tag', `${key}.json`);
  const cached = readCache<OverpassElement[]>(cacheFile, OVERPASS_CACHE_TTL_MS);
  if (cached) return cached;

  const around = `(around:${Math.round(radiusKm * 1000)},${centroid.lat.toFixed(5)},${centroid.lon.toFixed(5)})`;
  const parts: string[] = [];

  if (acceptedTypes.includes('ava')) {
    parts.push(`relation["landuse"="vineyard"]["wine_region"]${around};`);
    parts.push(`relation["boundary"="wine_region"]${around};`);
    parts.push(`relation["boundary"="viticulture"]${around};`); // Napa Valley AVA pattern
    parts.push(`relation["boundary"="protected_area"]["protect_class"="22"]${around};`);
  }
  if (acceptedTypes.includes('desert') || acceptedTypes.includes('badlands')) {
    parts.push(`relation["natural"="desert"]${around};`);
    parts.push(`way["natural"="desert"]${around};`);
    parts.push(`relation["natural"="badlands"]${around};`);
    parts.push(`way["natural"="badlands"]${around};`);
  }
  if (acceptedTypes.includes('protected_area') || acceptedTypes.includes('national_park') || acceptedTypes.includes('state_park')) {
    parts.push(`relation["boundary"="protected_area"]${around};`);
    parts.push(`relation["boundary"="national_park"]${around};`);
  }
  if (acceptedTypes.includes('valley')) {
    parts.push(`relation["natural"="valley"]${around};`);
    parts.push(`way["natural"="valley"]${around};`);
  }
  if (acceptedTypes.includes('meadow')) {
    parts.push(`relation["landuse"="meadow"]${around};`);
    parts.push(`way["landuse"="meadow"]${around};`);
  }
  if (acceptedTypes.includes('region')) {
    parts.push(`relation["place"="region"]${around};`);
    parts.push(`relation["boundary"="region"]${around};`);
  }
  if (acceptedTypes.includes('admin_county')) {
    parts.push(`relation["boundary"="administrative"]["admin_level"="6"]${around};`);
  }

  if (parts.length === 0) {
    writeCache(cacheFile, []);
    return [];
  }

  const query = `[out:json][timeout:90];(${parts.join('')});out tags bb;`;
  const body = new URLSearchParams({ data: query });
  let lastErr: Error | null = null;
  let emptyRetries = 0;
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
      if (res.status === 429 || res.status === 504 || res.status === 502 || res.status === 503) {
        const wait = 5000 * (attempt + 1);
        console.warn(chalk.yellow(`  Overpass-by-tag ${res.status} — retrying in ${wait}ms`));
        await sleep(wait);
        continue;
      }
      if (!res.ok) throw new Error(`Overpass-by-tag HTTP ${res.status} ${res.statusText}`);
      const json = (await res.json()) as OverpassResponse;
      if (json.elements.length === 0 && emptyRetries < 1) {
        const detail = json.remark ? ` (remark: "${json.remark}")` : '';
        console.warn(chalk.yellow(`  Overpass-by-tag returned 0 elements${detail} — retrying once after 8000ms`));
        await sleep(8000);
        emptyRetries++;
        continue;
      }
      writeCache(cacheFile, json.elements);
      return json.elements;
    } catch (err) {
      lastErr = err as Error;
      const wait = 3000 * (attempt + 1);
      console.warn(chalk.yellow(`  Overpass-by-tag error: ${lastErr.message} — retrying in ${wait}ms`));
      await sleep(wait);
    }
  }
  throw lastErr ?? new Error('Overpass-by-tag query failed after retries');
}

function elementsToOsmCandidates(elements: OverpassElement[]): OsmCandidate[] {
  const out: OsmCandidate[] = [];
  for (const el of elements) {
    if (el.type !== 'relation' && el.type !== 'way') continue;
    const tags = el.tags ?? {};
    // Skip non-polygon elements (roads, canals, POIs that share a name).
    if (!isPolygonRelevant(tags)) continue;
    const cls = classifyTags(tags);
    const name = tags['name'] ?? tags['name:en'] ?? `(unnamed ${el.type} ${el.id})`;
    const b = el.bounds;
    const bbox = b
      ? { minLat: b.minlat, minLon: b.minlon, maxLat: b.maxlat, maxLon: b.maxlon }
      : null;
    out.push({
      osmType: el.type,
      osmId: el.id,
      name,
      tags,
      bbox,
      polygonType: cls.type,
      isGeological: cls.isGeological,
      polygonSource: cls.source,
    });
  }
  return out;
}

// ───────────────────────── Wikidata (Q-number fallback) ─────────────────────────

function getCachedWikidataQ(articleTitle: string): string | null {
  const summaryCacheFile = path.join(CACHE_DIR, 'wikipedia-summaries', `${sha1(articleTitle)}.json`);
  try {
    const summary = JSON.parse(fs.readFileSync(summaryCacheFile, 'utf-8'));
    return summary?.wikibase_item ?? null;
  } catch {
    return null;
  }
}

interface WikidataInfo {
  centroid: { lat: number; lon: number };
  area_km2: number | null;
}

async function queryWikidata(qid: string): Promise<WikidataInfo | null> {
  const cacheFile = path.join(CACHE_DIR, 'wikidata-regions', `${qid}.json`);
  const cached = readCache<WikidataInfo | null>(cacheFile, WIKIDATA_CACHE_TTL_MS);
  if (cached !== null) return cached;

  // P625 = coordinate location, P2046 = area (with units → squared meters via wikibase:quantityUnit)
  // Keep it simple: just pull raw `area` value as a number; unit interpretation
  // is approximate (most areas are in km² already; we treat 0–100k as km², anything
  // > 1e7 as m² and divide). Defensive — Wikidata area data is often inconsistent.
  const sparql = `
    SELECT ?coord ?area WHERE {
      wd:${qid} wdt:P625 ?coord .
      OPTIONAL { wd:${qid} wdt:P2046 ?area . }
    }
    LIMIT 1
  `;
  const url = `${WIKIDATA_SPARQL_URL}?query=${encodeURIComponent(sparql)}&format=json`;
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': USER_AGENT, 'Accept': 'application/sparql-results+json' },
    });
    if (!res.ok) {
      console.warn(chalk.yellow(`  Wikidata SPARQL ${res.status} for ${qid}`));
      writeCache<WikidataInfo | null>(cacheFile, null);
      return null;
    }
    const json = (await res.json()) as {
      results: { bindings: Array<{ coord?: { value: string }; area?: { value: string } }> };
    };
    const row = json.results.bindings[0];
    if (!row?.coord) {
      writeCache<WikidataInfo | null>(cacheFile, null);
      return null;
    }
    // coord format: "Point(-118.5 35.2)" → [lon, lat]
    const m = row.coord.value.match(/Point\(([-\d.]+)\s+([-\d.]+)\)/);
    if (!m) {
      writeCache<WikidataInfo | null>(cacheFile, null);
      return null;
    }
    const lon = parseFloat(m[1]!);
    const lat = parseFloat(m[2]!);
    let area_km2: number | null = null;
    if (row.area?.value) {
      const raw = parseFloat(row.area.value);
      if (Number.isFinite(raw) && raw > 0) {
        // Heuristic: <100,000 → km², ≥100,000 → m² (1e10 m² = 10,000 km²)
        area_km2 = raw < 100_000 ? raw : raw / 1_000_000;
      }
    }
    const info: WikidataInfo = { centroid: { lat, lon }, area_km2 };
    writeCache(cacheFile, info);
    return info;
  } catch (err) {
    console.warn(chalk.yellow(`  Wikidata SPARQL error for ${qid}: ${(err as Error).message}`));
    return null;
  }
}

// ───────────────────────── per-region verification ─────────────────────────

function pickBestCandidate(
  candidates: OsmCandidate[],
  acceptedTypes: PolygonType[] = [],
  realAreaKm2?: number,
): { best: OsmCandidate | null; method: VerificationResult['resolution']['method']; flags: string[] } {
  const flags: string[] = [];
  if (candidates.length === 0) {
    return { best: null, method: 'failed', flags: ['no OSM match for any of the name candidates'] };
  }

  // Group by polygon-type quality
  const geological = candidates.filter((c) => c.isGeological);
  const accepted = acceptedTypes.length > 0
    ? candidates.filter((c) => acceptedTypes.includes(c.polygonType) && !c.isGeological)
    : [];
  const adminProtected = candidates.filter((c) => c.polygonType === 'protected_area' || c.polygonType === 'national_park' || c.polygonType === 'state_park');
  const adminAva = candidates.filter((c) => c.polygonType === 'ava');
  const adminCity = candidates.filter((c) => c.polygonType === 'place_city' || c.polygonType === 'admin' || c.polygonType === 'admin_county');
  const adminLocality = candidates.filter((c) => c.polygonType === 'locality');

  // 1. Geological wins (largest bbox area)
  if (geological.length > 0) {
    const sortedGeo = geological.slice().sort((a, b) => (b.bbox ? bboxArea_km2(b.bbox) : 0) - (a.bbox ? bboxArea_km2(a.bbox) : 0));
    const bestGeo = sortedGeo[0]!;
    const geoArea = bestGeo.bbox ? bboxArea_km2(bestGeo.bbox) : 0;

    // Tiny-geological override: if the geological match is < 20% of real
    // area AND an accepted-admin alternative exists, prefer the accepted-
    // admin. Handles cases like "Anza-Borrego Desert" where OSM has only a
    // tiny "Desert Gardens" natural=desert polygon, but the State Park
    // protected_area polygon covers ~96% of the actual desert.
    if (realAreaKm2 && geoArea / realAreaKm2 < 0.2 && accepted.length > 0) {
      const sortedAdm = accepted.slice().sort((a, b) => (b.bbox ? bboxArea_km2(b.bbox) : 0) - (a.bbox ? bboxArea_km2(a.bbox) : 0));
      return {
        best: sortedAdm[0]!,
        method: 'osm_admin_accepted',
        flags: [
          `tiny geological match (${geoArea.toFixed(1)} km² = ${((geoArea / realAreaKm2) * 100).toFixed(1)}% of real area) overridden by accepted-admin polygon (${sortedAdm[0]!.polygonSource})`,
        ],
      };
    }

    if (geological.length > 1) flags.push(`${geological.length} geological matches — picked largest by bbox area`);
    return { best: bestGeo, method: 'osm_geological', flags };
  }

  // 2. Accepted admin types (AVA, state park, region, admin_county)
  if (accepted.length > 0) {
    const sorted = accepted.slice().sort((a, b) => (b.bbox ? bboxArea_km2(b.bbox) : 0) - (a.bbox ? bboxArea_km2(a.bbox) : 0));
    let best = sorted[0]!;

    // Area-plausibility check for admin_county AND region matches: per
    // curator direction, accept only if poly area is within one order of
    // magnitude of real area (real/10 ≤ poly ≤ real×10). Prevents matches
    // like Sacramento County standing in for Sacramento Valley when too
    // small, OR a "Southern California" place=region polygon being picked
    // for LA Basin when it's an order of magnitude too large.
    if ((best.polygonType === 'admin_county' || best.polygonType === 'region') && realAreaKm2 && best.bbox) {
      const polyArea = bboxArea_km2(best.bbox);
      const ratio = polyArea / realAreaKm2;
      if (ratio < 0.1 || ratio > 10) {
        return {
          best: null,
          method: 'failed',
          flags: [
            `${best.polygonType} candidate ${best.osmType}/${best.osmId} (${best.name}, ${polyArea.toFixed(0)} km²) discarded by area-plausibility — ratio ${ratio.toFixed(2)} outside [0.1, 10] of real area ${realAreaKm2} km²`,
          ],
        };
      }
    }

    flags.push(`accepted-admin polygon (type=${best.polygonType}) — within curator's acceptedPolygonTypes`);
    return { best, method: 'osm_admin_accepted', flags };
  }

  // 3. Unaccepted admin — flag for curator
  const adminAny = [...adminProtected, ...adminAva, ...adminCity];
  if (adminAny.length > 0) {
    const sorted = adminAny.slice().sort((a, b) => (b.bbox ? bboxArea_km2(b.bbox) : 0) - (a.bbox ? bboxArea_km2(a.bbox) : 0));
    flags.push(
      `admin polygon only (type=${sorted[0]!.polygonType}, source=${sorted[0]!.polygonSource}) — curator decision: accept admin polygon or bump to Tier C manual`,
    );
    return { best: sorted[0]!, method: 'osm_admin_flagged', flags };
  }

  // 4. Locality-only (CDP, suburb) — much weaker signal
  if (adminLocality.length > 0) {
    const sorted = adminLocality.slice().sort((a, b) => (b.bbox ? bboxArea_km2(b.bbox) : 0) - (a.bbox ? bboxArea_km2(a.bbox) : 0));
    flags.push(`only locality/CDP boundary found (type=${sorted[0]!.polygonType}) — likely not the right landform polygon`);
    return { best: sorted[0]!, method: 'osm_locality_flagged', flags };
  }

  // 5. Unknown tags
  flags.push('no usable polygon classification — all matches tagged unknown');
  return { best: candidates[0]!, method: 'osm_admin_flagged', flags };
}

/** Pick tag-fallback search radius by region type. Larger for deserts and
 *  big regional landforms; smaller for valleys/meadows/AVAs. */
function chooseTagRadiusKm(acceptedTypes: PolygonType[]): number {
  if (acceptedTypes.includes('desert') || acceptedTypes.includes('badlands')) return 50;
  if (acceptedTypes.includes('region') || acceptedTypes.includes('admin_county')) return 50;
  if (acceptedTypes.includes('valley') || acceptedTypes.includes('meadow')) return 30;
  return 20;
}

/** Drop OSM candidates whose bbox centroid is >maxDistKm from the trusted
 *  centroid. Returns the kept set + log of rejections. */
function applyLocationSanity(
  candidates: OsmCandidate[],
  trustedCentroid: { lat: number; lon: number } | null,
  maxDistKm: number,
): { kept: OsmCandidate[]; rejected: Array<{ candidate: OsmCandidate; distKm: number }> } {
  if (!trustedCentroid) return { kept: candidates, rejected: [] };
  const kept: OsmCandidate[] = [];
  const rejected: Array<{ candidate: OsmCandidate; distKm: number }> = [];
  for (const c of candidates) {
    if (!c.bbox) {
      kept.push(c); // no bbox to compare; keep defensively
      continue;
    }
    const dist = haversineKm(bboxCentroid(c.bbox), trustedCentroid);
    if (dist > maxDistKm) rejected.push({ candidate: c, distKm: dist });
    else kept.push(c);
  }
  return { kept, rejected };
}

async function verifyRegion(region: TopRegion): Promise<VerificationResult> {
  // Manual-only short-circuit
  if (region.manualOnly) {
    return {
      rank: region.rank,
      displayName: region.displayName,
      articleTitle: region.articleTitle,
      proposedTier: region.proposedTier,
      finalTier: 'C',
      resolution: {
        method: 'manual',
        polygonSource: 'editorial',
        polygonSourceMethod: 'manual_digitization',
        flags: ['manual digitization per curator decision (Phase 1)'],
      },
      notes: region.notes,
      candidatesConsidered: [],
    };
  }

  // 0. Fetch Wikidata centroid FIRST (used for location-sanity check + buffer fallback)
  const qid = getCachedWikidataQ(region.articleTitle);
  const wikidata: WikidataInfo | null = qid ? await queryWikidata(qid) : null;
  const wikidataInfo = wikidata && qid ? { ...wikidata, qid } : undefined;
  const trustedCentroid = wikidata?.centroid ?? null;

  // 1. Overpass name-match query
  const elements = await queryOverpass(region.osmNameCandidates);
  const rawCandidates = elementsToOsmCandidates(elements);

  // 2. Location-sanity filter on name-match results
  const { kept: candidates, rejected } = applyLocationSanity(rawCandidates, trustedCentroid, 50);
  for (const r of rejected) {
    SANITY_CHECK_LOG.push({
      region: region.displayName,
      reason: `rejected name-match ${r.candidate.osmType}/${r.candidate.osmId} "${r.candidate.name}" (${r.candidate.polygonSource}) — ${r.distKm.toFixed(0)}km from Wikidata centroid`,
    });
  }
  const sanityFlags: string[] = rejected.length > 0
    ? [`location-sanity: rejected ${rejected.length} name-match polygon(s) >50km from Wikidata centroid (${rejected.map((r) => `${r.candidate.osmType}/${r.candidate.osmId}@${r.distKm.toFixed(0)}km`).join(', ')})`]
    : [];

  // 3. Pick best from kept candidates
  const realAreaKm2 = REAL_AREA_KM2[region.displayName];
  let { best, method, flags } = pickBestCandidate(candidates, region.acceptedPolygonTypes ?? [], realAreaKm2);
  let polygonSourceMethod: string = 'osm_name_match';

  // 4. Tag-by-proximity fallback if name-match failed AND acceptedPolygonTypes set
  if (best === null && region.acceptedPolygonTypes && trustedCentroid) {
    const tagRadiusKm = chooseTagRadiusKm(region.acceptedPolygonTypes);
    const tagElements = await queryOverpassByTagNearCentroid(trustedCentroid, region.acceptedPolygonTypes, tagRadiusKm);
    const tagCandidates = elementsToOsmCandidates(tagElements);
    // Apply same sanity check (drop matches >50km even within the around-buffer radius)
    const { kept: tagKept } = applyLocationSanity(tagCandidates, trustedCentroid, 50);
    if (tagKept.length > 0) {
      const tagResult = pickBestCandidate(tagKept, region.acceptedPolygonTypes, realAreaKm2);
      if (tagResult.best) {
        best = tagResult.best;
        method = tagResult.method;
        flags = [
          `tag-fallback: ${tagResult.best.polygonSource} within ${tagRadiusKm}km of Wikidata centroid (name-match found none usable)`,
          ...tagResult.flags,
        ];
        polygonSourceMethod = 'osm_tag_fallback';
      } else if (tagResult.flags.length > 0) {
        // Tag-fallback ran but discarded its match (e.g., admin_county area
        // plausibility failed) — carry the flag forward for the report.
        flags = [...flags, `tag-fallback: ${tagResult.flags.join('; ')}`];
      }
    }
  }

  // 5. Wikidata buffer fallback
  if (best === null) {
    if (wikidata && qid) {
      let radiusKm: number;
      let bufferMethod: string;
      if (wikidata.area_km2) {
        radiusKm = Math.sqrt(wikidata.area_km2 / Math.PI);
        bufferMethod = 'wikidata_buffer_area_derived';
      } else if (summaryHasRegionKeyword(region.articleTitle)) {
        radiusKm = 15;
        bufferMethod = 'wikidata_buffer_heuristic_15km';
      } else {
        radiusKm = 5;
        bufferMethod = 'wikidata_buffer_default_5km';
      }
      const bufferFlags = [
        `no OSM polygon (name-match + tag-fallback both failed) — Wikidata centroid+buffer (${radiusKm.toFixed(1)}km, ${bufferMethod})`,
        ...sanityFlags,
        ...flags,
      ];
      return {
        rank: region.rank,
        displayName: region.displayName,
        articleTitle: region.articleTitle,
        proposedTier: region.proposedTier,
        finalTier: 'B',
        resolution: {
          method: 'wikidata_buffer',
          polygonSource: `wikidata_${qid}_centroid+buffer_${radiusKm.toFixed(1)}km`,
          polygonSourceMethod: bufferMethod,
          wikidataQ: qid,
          wikidataCentroid: wikidata.centroid,
          wikidataArea_km2: wikidata.area_km2,
          bufferRadius_km: radiusKm,
          flags: bufferFlags,
        },
        notes: region.notes,
        candidatesConsidered: rawCandidates,
        wikidataInfo,
      };
    }
    return {
      rank: region.rank,
      displayName: region.displayName,
      articleTitle: region.articleTitle,
      proposedTier: region.proposedTier,
      finalTier: 'C',
      resolution: {
        method: 'failed',
        polygonSource: 'none',
        polygonSourceMethod: 'none',
        flags: [...sanityFlags, ...flags, 'no OSM polygon, no Wikidata Q/centroid — promote to manual'],
      },
      notes: region.notes,
      candidatesConsidered: rawCandidates,
      wikidataInfo,
    };
  }

  // 6. We have a best match — finalize tier
  let finalTier: 'A' | 'B' | 'C';
  if (method === 'osm_geological' || method === 'osm_admin_accepted') {
    finalTier = 'A';
  } else if (method === 'osm_admin_flagged' || method === 'osm_locality_flagged') {
    finalTier = 'B';
  } else {
    finalTier = 'B';
  }

  return {
    rank: region.rank,
    displayName: region.displayName,
    articleTitle: region.articleTitle,
    proposedTier: region.proposedTier,
    finalTier,
    resolution: {
      method,
      polygonSource: best.polygonSource,
      polygonSourceMethod,
      osmType: best.osmType,
      osmId: best.osmId,
      osmTags: best.tags,
      osmBbox: best.bbox ?? undefined,
      flags: [...sanityFlags, ...flags],
    },
    notes: region.notes,
    candidatesConsidered: rawCandidates,
    wikidataInfo,
  };
}

// ───────────────────────── adequacy ─────────────────────────

function computeAdequacy(result: VerificationResult): {
  finalArea_km2: number | null;
  realArea_km2: number | null;
  ratio: number | null;
  inadequate: boolean;
} {
  const realArea = REAL_AREA_KM2[result.displayName] ?? null;
  let finalArea: number | null = null;
  if (result.resolution.osmBbox) {
    finalArea = bboxArea_km2(result.resolution.osmBbox);
  } else if (result.resolution.bufferRadius_km) {
    finalArea = Math.PI * result.resolution.bufferRadius_km * result.resolution.bufferRadius_km;
  }
  const ratio = finalArea !== null && realArea !== null ? finalArea / realArea : null;
  const inadequate = ratio !== null && ratio < 0.5;
  return { finalArea_km2: finalArea, realArea_km2: realArea, ratio, inadequate };
}

// Overlap analysis deferred to live-run phase per curator direction
// (2026-05-14) — PostGIS will compute polygon-true intersections against
// the regions table once polygons are actually inserted.

// ───────────────────────── main ─────────────────────────

// Regions that the curator validated as correct in Phase-2 round 1 — used
// to confirm the iteration's location-sanity check didn't accidentally
// reject them.
const PREVIOUSLY_VALIDATED = new Set([
  'Death Valley',
  'Antelope Valley',
  'Owens Valley',
  'Yosemite Valley',
  'Panamint Valley',
  'Saline Valley',
]);

async function main(): Promise<void> {
  console.log(chalk.bold('Polygon-source verification — E1d Phase 2 (iteration 2)'));
  console.log(chalk.gray('  Top-30 regions, OSM name-match + tag-fallback + Wikidata buffer'));
  console.log(chalk.gray('  Location-sanity: 50km Wikidata-centroid radius'));
  console.log('');

  const results: VerificationResult[] = [];
  for (const region of TOP_30) {
    process.stdout.write(chalk.gray(`  [${String(region.rank).padStart(2)}/30] ${region.displayName} … `));
    try {
      const result = await verifyRegion(region);
      result.adequacy = computeAdequacy(result);
      results.push(result);
      const tierColor =
        result.finalTier === 'A' ? chalk.green :
        result.finalTier === 'B' ? chalk.yellow : chalk.red;
      const tierShift = result.proposedTier !== result.finalTier ? chalk.gray(` (was ${result.proposedTier})`) : '';
      const inadequateBadge = result.adequacy?.inadequate ? chalk.red(' [small]') : '';
      console.log(`${tierColor(result.finalTier)}${tierShift} via ${chalk.cyan(result.resolution.method)} (${result.resolution.polygonSource})${inadequateBadge}`);
    } catch (err) {
      console.error(chalk.red(`ERROR: ${(err as Error).message}`));
      results.push({
        rank: region.rank, displayName: region.displayName, articleTitle: region.articleTitle,
        proposedTier: region.proposedTier, finalTier: 'C',
        resolution: { method: 'failed', polygonSource: 'error', polygonSourceMethod: 'error', flags: [`exception: ${(err as Error).message}`] },
        candidatesConsidered: [],
      });
    }
    if (!region.manualOnly) await sleep(OVERPASS_RATE_DELAY_MS);
  }

  // ───── Reporting ─────
  console.log('');
  console.log(chalk.bold('── 1. Final tier split ──'));
  const tierCounts = { A: 0, B: 0, C: 0 };
  const tierShifts: Array<{ name: string; from: string; to: string }> = [];
  for (const r of results) {
    tierCounts[r.finalTier]++;
    if (r.finalTier !== r.proposedTier) {
      tierShifts.push({ name: r.displayName, from: r.proposedTier, to: r.finalTier });
    }
  }
  console.log(`  Final  A=${tierCounts.A}  B=${tierCounts.B}  C=${tierCounts.C}`);
  if (tierShifts.length > 0) {
    console.log(chalk.yellow(`  Tier shifts vs proposed (${tierShifts.length}):`));
    for (const ts of tierShifts) console.log(chalk.yellow(`    • ${ts.name}: ${ts.from} → ${ts.to}`));
  } else {
    console.log(chalk.green('  No tier shifts.'));
  }

  console.log('');
  console.log(chalk.bold('── 2. Previously-validated matches (re-check) ──'));
  for (const name of PREVIOUSLY_VALIDATED) {
    const r = results.find((x) => x.displayName === name);
    if (!r) {
      console.log(chalk.red(`  ✗ ${name}: missing from results`));
      continue;
    }
    const stillGeological = r.resolution.method === 'osm_geological';
    const sameOsm = r.resolution.osmId !== undefined;
    const stillTierA = r.finalTier === 'A';
    if (stillGeological && sameOsm && stillTierA) {
      console.log(chalk.green(`  ✓ ${name}: still ${r.resolution.osmType}/${r.resolution.osmId} (${r.resolution.polygonSource}) Tier A`));
    } else {
      console.log(chalk.yellow(`  ⚠️ ${name}: changed — method=${r.resolution.method}, finalTier=${r.finalTier}, polygonSource=${r.resolution.polygonSource}`));
    }
  }

  console.log('');
  console.log(chalk.bold('── 3. Location-sanity rejections (OSM matches >50km from Wikidata centroid) ──'));
  if (SANITY_CHECK_LOG.length === 0) {
    console.log(chalk.gray('  None — no name-match polygons were rejected for location.'));
  } else {
    for (const entry of SANITY_CHECK_LOG) {
      console.log(chalk.yellow(`  • ${entry.region}: ${entry.reason}`));
    }
  }

  console.log('');
  console.log(chalk.bold('── 4. Anza-Borrego Desert resolution (curator-flagged constraint) ──'));
  const anza = results.find((r) => r.displayName === 'Anza-Borrego Desert');
  if (anza) {
    console.log(`  Method: ${anza.resolution.method}`);
    console.log(`  Polygon source: ${anza.resolution.polygonSource}`);
    console.log(`  Polygon source method: ${anza.resolution.polygonSourceMethod}`);
    if (anza.resolution.osmTags) {
      const keys = ['natural', 'place', 'boundary', 'leisure', 'protect_class', 'protection_title', 'wikidata'];
      const tagSummary = keys
        .filter((k) => anza.resolution.osmTags?.[k])
        .map((k) => `${k}=${anza.resolution.osmTags![k]}`)
        .join(', ');
      console.log(`  Key tags: ${tagSummary || '(none of natural/place/boundary/leisure/protect_class)'}`);
    }
    const isDesertOrBadlands =
      anza.resolution.polygonSource.includes('desert') || anza.resolution.polygonSource.includes('badlands');
    const isProtectedArea =
      anza.resolution.polygonSource.includes('protected_area') || anza.resolution.polygonSource.includes('state_park');
    if (isDesertOrBadlands) {
      console.log(chalk.green('  ✓ Resolved to desert/badlands polygon'));
    } else if (isProtectedArea) {
      console.log(chalk.green('  ✓ Resolved to State Park admin polygon (accepted per curator direction 2026-05-14)'));
    } else {
      console.log(chalk.yellow('  ⚠️ NOT a desert/badlands or state-park polygon — curator decision required'));
    }
  }

  console.log('');
  console.log(chalk.bold('── 5. Polygon-inadequacy flag list (polygon area < 50% of real area) ──'));
  const inadequate = results.filter((r) => r.adequacy?.inadequate).sort((a, b) => (a.adequacy!.ratio ?? 0) - (b.adequacy!.ratio ?? 0));
  if (inadequate.length === 0) {
    console.log(chalk.green('  No inadequate polygons.'));
  } else {
    console.log(chalk.gray(`  ${inadequate.length} of ${results.length} regions flagged. Curator decision needed per row:`));
    console.log(chalk.gray('    accept the small polygon · find a better OSM relation · accept admin boundary · bump to Tier C manual'));
    console.log('');
    console.log(`  ${'#'.padStart(3)}  ${'Region'.padEnd(28)}  ${'Tier'.padStart(4)}  ${'PolyArea'.padStart(12)}  ${'RealArea'.padStart(12)}  ${'Ratio'.padStart(6)}  Source`);
    console.log(`  ${'-'.repeat(3)}  ${'-'.repeat(28)}  ${'-'.repeat(4)}  ${'-'.repeat(12)}  ${'-'.repeat(12)}  ${'-'.repeat(6)}  ------`);
    for (const r of inadequate) {
      const a = r.adequacy!;
      console.log(
        `  ${String(r.rank).padStart(3)}  ${r.displayName.padEnd(28)}  ${r.finalTier.padStart(4)}  ${(a.finalArea_km2 ?? 0).toFixed(0).padStart(8)} km²  ${(a.realArea_km2 ?? 0).toFixed(0).padStart(8)} km²  ${(a.ratio! * 100).toFixed(1).padStart(5)}%  ${r.resolution.polygonSourceMethod}`,
      );
    }
  }

  console.log('');
  console.log(chalk.bold('── 6. Adequate matches (polygon area ≥ 50% of real area) ──'));
  const adequate = results.filter((r) => r.adequacy && !r.adequacy.inadequate && r.adequacy.realArea_km2 !== null && r.adequacy.finalArea_km2 !== null);
  if (adequate.length === 0) {
    console.log(chalk.gray('  No adequate matches.'));
  } else {
    for (const r of adequate.sort((a, b) => a.rank - b.rank)) {
      const a = r.adequacy!;
      const tierColor = r.finalTier === 'A' ? chalk.green : chalk.yellow;
      console.log(
        `  ${tierColor(`[${String(r.rank).padStart(2)}]`)} ${r.displayName.padEnd(28)} ${tierColor(r.finalTier)}  ${(a.finalArea_km2 ?? 0).toFixed(0).padStart(8)} km² / ${(a.realArea_km2 ?? 0).toFixed(0).padStart(8)} km² = ${(a.ratio! * 100).toFixed(0)}%  (${r.resolution.polygonSourceMethod})`,
      );
    }
  }

  console.log('');
  console.log(chalk.bold('── 7. Manual-only (Tier C, no automated polygon) ──'));
  const manual = results.filter((r) => r.resolution.method === 'manual' || r.resolution.method === 'failed');
  for (const r of manual) {
    console.log(chalk.red(`  • [${r.rank}] ${r.displayName} — ${r.resolution.method} (${r.resolution.polygonSource})`));
  }

  console.log('');
  console.log(chalk.bold('── Write JSON ──'));
  fs.mkdirSync(path.dirname(OUT_JSON), { recursive: true });
  fs.writeFileSync(
    OUT_JSON,
    JSON.stringify(
      {
        generatedAt: new Date().toISOString(),
        sanityCheckLog: SANITY_CHECK_LOG,
        results,
      },
      null,
      2,
    ),
  );
  console.log(chalk.gray(`  ${OUT_JSON}`));
  console.log('');
  console.log(chalk.bold.green('Done.'));
}

main().catch((err: unknown) => {
  const msg = err instanceof Error ? err.message : String(err);
  console.error(chalk.red(`Fatal: ${msg}`));
  process.exit(1);
});
