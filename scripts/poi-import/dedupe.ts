#!/usr/bin/env node
/**
 * Spatial deduplication pass — run after all sources are imported.
 *
 * Algorithm:
 *   1. Load all active POIs (merged_into IS NULL) from DB.
 *   2. Build an in-memory spatial grid; find candidate pairs within 50 m.
 *   3. Confirm pairs by name similarity (token-set, Levenshtein, substring).
 *   4. Merge: lower-priority source is soft-deleted via merged_into; primary
 *      gains additional_sources entry, best description, significance boost.
 *
 * Usage:
 *   npx tsx dedupe.ts [--dry-run] [--county <name>] [--limit <n>] [--cache-dir <path>]
 */
import { config as dotenvConfig } from 'dotenv';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Command } from 'commander';
import chalk from 'chalk';
import { getPgPool } from './lib/supabase.js';
import {
  normalizeName,
  tokenSetRatio,
  levenshteinRatio,
  haversineMeters,
} from './lib/dedupe.js';

// ---- Config -----------------------------------------------------------------

const USER_AGENT  = 'XRoad-POI-Import/0.1 (johnhollis99@gmail.com)';
const PROXIMITY_M = 50;    // spatial fuzzy-name pass: substring / token-set / Levenshtein
const GRID_DEG    = 0.001; // ~111 m grid cells; 50 m pairs are always in adjacent cells
const PAGE_SIZE   = 2000;  // DB read page size
const WRITE_CONCURRENCY = 50; // parallel DB writes per batch

// ---- Phase 2: name-collapse pass --------------------------------------------
const NAME_COLLAPSE_RADIUS_M = 2000;
const MAX_CLUSTER_SIZE       = 50;

// Categories that legitimately repeat names (peaks, lakes, waterfalls, caves).
const COLLAPSE_EXCLUDED_CATEGORIES = new Set<string>([
  'nature', 'geology', 'natural_feature',
]);

// Names where collapse-by-coincidence is too likely to be a real duplicate.
const COLLAPSE_GENERIC_NAMES = new Set<string>([
  'mural', 'statue', 'memorial', 'plaza', 'park', 'sculpture',
  'fountain', 'bench', 'marker', 'tree', 'rock', 'garden',
  'viewpoint', 'overlook', 'trail', 'sign', 'art',
  'public art', 'mural art', 'painting', 'installation', 'monument',
]);

// ---- Guard constants --------------------------------------------------------

const CARDINAL_TOKENS = new Set(
  ['north', 'south', 'east', 'west', 'central', 'nw', 'ne', 'sw', 'se'],
);
const CULTURAL_TOKENS = new Set([
  'chinese', 'japanese', 'mexican', 'italian', 'korean', 'filipino',
  'hispanic', 'african', 'native', 'indigenous',
]);

// Letter-coded building patterns where the alpha suffix is the only
// discriminator (e.g. military barracks "Quarters SF" vs "Quarters SN"
// at MCRD San Diego — 54 distinct OSM ways, mostly within 50 m of each
// other). The Levenshtein/substring matchers happily collapse these
// because only 1–2 letters differ, but they are distinct buildings.
const LETTER_CODE_PREFIX_PATTERNS: RegExp[] = [
  /^Quarters\s+([A-Z]+)(?=$|[\s-])/i,
];

interface RejectedPair {
  a: ActivePoi;
  b: ActivePoi;
  guard: 'digit' | 'sensitive' | 'letter-code';
  differing: string[];
}
interface GuardCounters {
  digitMismatch:  number;
  sensitiveToken: number;
  letterCode:     number;
  rejected:       RejectedPair[];
}

function nameTokens(name: string): Set<string> {
  return new Set(
    name.toLowerCase().replace(/[^a-z0-9\s]/g, ' ').split(/\s+/).filter(Boolean),
  );
}

// ---- Source priority (higher number = preferred primary in merge) -----------

const SOURCE_PRIORITY: Record<string, number> = {
  editorial:          10,
  state_landmark:      9,
  nrhp:                8,
  wikidata:            7,
  osm:                 6,
  gnis:                5,
  narrative_extracted: 4,
  user_contributed:    3,
};

function priority(sourceType: string): number {
  return SOURCE_PRIORITY[sourceType] ?? 0;
}

// ---- Types ------------------------------------------------------------------

interface ActivePoi {
  id:                 string;
  name:               string;
  source_type:        string;
  source_id:          string;
  lat:                number;
  lng:                number;
  significance_score: number;
  confidence_score:   number;
  description:        string | null;
  verified:           boolean;
  additional_sources: string[];
  category_slug:      string | null;
  is_venue:           boolean;
  // For editorial venues, the Wikidata Q-number stored in
  // venue_metadata.wikidata. Used by Phase C (wikidata-twin pass) to
  // dedupe an editorial venue against any wikidata POI that has the
  // same Q-number as source_id.
  wikidata_q:         string | null;
}

// Rows below this threshold (e.g. NRHP listings that geocoded only to a city
// or county centroid) must never become a merge primary — otherwise their
// placeholder coords + low confidence would propagate into the canonical row
// and the result would be filtered out by get_nearby_pois (which requires
// confidence >= 0.5). They can still be merged INTO higher-confidence rows so
// their source_id flows into additional_sources.
const HIGH_CONFIDENCE_THRESHOLD = 0.5;
function confidenceTier(p: ActivePoi): number {
  return p.confidence_score >= HIGH_CONFIDENCE_THRESHOLD ? 1 : 0;
}

interface MergeGroup {
  primary:     ActivePoi;
  secondaries: ActivePoi[];
}

type Phase = 'spatial' | 'name-collapse' | 'wikidata-twin';

interface ConfirmedPair {
  primary:   ActivePoi;
  secondary: ActivePoi;
  distanceM: number;
  reason:    string;
  phase:     Phase;
}

// ---- DB read ----------------------------------------------------------------

async function fetchAllActivePois(
  bbox?: BBox,
): Promise<ActivePoi[]> {
  const pool = getPgPool();
  const pois: ActivePoi[] = [];
  let offset = 0;
  let total  = 0;

  const conditions: string[] = ['p.merged_into IS NULL'];
  const params: unknown[] = [];
  let pidx = 1;

  if (bbox) {
    conditions.push(`ST_Y(p.location::geometry) BETWEEN $${pidx++} AND $${pidx++}`);
    conditions.push(`ST_X(p.location::geometry) BETWEEN $${pidx++} AND $${pidx++}`);
    params.push(bbox.minLat, bbox.maxLat, bbox.minLon, bbox.maxLon);
  }

  const baseWhere = conditions.join(' AND ');

  process.stdout.write(chalk.cyan('[dedupe] loading POIs…'));

  for (;;) {
    const sql = `
      SELECT p.id, p.name, p.source_type, p.source_id, p.significance_score, p.confidence_score, p.description,
             p.verified, p.additional_sources, p.is_venue,
             p.venue_metadata->>'wikidata' AS wikidata_q,
             ST_X(p.location::geometry) AS lng,
             ST_Y(p.location::geometry) AS lat,
             c.slug AS category_slug
      FROM pois p
      LEFT JOIN poi_categories c ON c.id = p.category_id
      WHERE ${baseWhere}
      ORDER BY p.id
      LIMIT ${PAGE_SIZE} OFFSET ${offset}
    `;

    const result = await pool.query<{
      id: string;
      name: string;
      source_type: string;
      source_id: string;
      significance_score: string;
      confidence_score: string | null;
      description: string | null;
      verified: boolean;
      additional_sources: string[] | null;
      is_venue: boolean | null;
      wikidata_q: string | null;
      lng: number;
      lat: number;
      category_slug: string | null;
    }>(sql, params);

    if (result.rows.length === 0) break;

    for (const row of result.rows) {
      pois.push({
        id:                 row.id,
        name:               row.name,
        source_type:        row.source_type,
        source_id:          row.source_id,
        lat:                Number(row.lat),
        lng:                Number(row.lng),
        significance_score: Number(row.significance_score),
        confidence_score:   row.confidence_score == null ? 1.0 : Number(row.confidence_score),
        description:        row.description,
        verified:           row.verified,
        additional_sources: row.additional_sources ?? [],
        category_slug:      row.category_slug,
        is_venue:           row.is_venue ?? false,
        wikidata_q:         row.wikidata_q,
      });
    }

    total  += result.rows.length;
    offset += PAGE_SIZE;
    process.stdout.write('.');
    if (result.rows.length < PAGE_SIZE) break;
  }

  console.log(` ${pois.length.toLocaleString()} active POIs loaded (${total.toLocaleString()} DB rows scanned)`);
  return pois;
}

// ---- Spatial grid -----------------------------------------------------------

type Grid = Map<string, ActivePoi[]>;

function gk(lat: number, lng: number): string {
  return `${Math.floor(lat / GRID_DEG)},${Math.floor(lng / GRID_DEG)}`;
}

function buildGrid(pois: ActivePoi[]): Grid {
  const grid: Grid = new Map();
  for (const poi of pois) {
    const key  = gk(poi.lat, poi.lng);
    const cell = grid.get(key) ?? [];
    cell.push(poi);
    grid.set(key, cell);
  }
  return grid;
}

function neighbors(grid: Grid, lat: number, lng: number): ActivePoi[] {
  const lr = Math.floor(lat / GRID_DEG);
  const lc = Math.floor(lng / GRID_DEG);
  const out: ActivePoi[] = [];
  for (let dr = -1; dr <= 1; dr++) {
    for (let dc = -1; dc <= 1; dc++) {
      const cell = grid.get(`${lr + dr},${lc + dc}`);
      if (cell) out.push(...cell);
    }
  }
  return out;
}

// ---- Name matching ----------------------------------------------------------

function similarityReason(a: ActivePoi, b: ActivePoi): string | null {
  const na = normalizeName(a.name);
  const nb = normalizeName(b.name);

  // Substring (skip trivially short names to avoid false positives)
  if (na.length > 5 && nb.length > 5 && (na.includes(nb) || nb.includes(na))) {
    return 'substring';
  }

  const tsr = tokenSetRatio(a.name, b.name);
  if (tsr > 0.9) return `token-set=${tsr.toFixed(2)}`;

  const lev = levenshteinRatio(a.name, b.name);
  if (lev > 0.85) return `lev=${lev.toFixed(2)}`;

  return null;
}

function passesGuards(
  a: ActivePoi,
  b: ActivePoi,
  counters: GuardCounters,
): boolean {
  // NRHP boundary-increase amendments are always the same site — skip guards
  const isBoundaryIncrease =
    a.name.toLowerCase().includes('boundary increase') ||
    b.name.toLowerCase().includes('boundary increase');
  if (isBoundaryIncrease) return true;

  // Guard 1: both names have digit sequences and they differ → reject
  const digitsA = a.name.match(/\d+/g) ?? [];
  const digitsB = b.name.match(/\d+/g) ?? [];
  if (digitsA.length > 0 && digitsB.length > 0) {
    const setA = new Set(digitsA);
    const setB = new Set(digitsB);
    const same =
      [...setA].every((d) => setB.has(d)) &&
      [...setB].every((d) => setA.has(d));
    if (!same) {
      counters.digitMismatch++;
      counters.rejected.push({ a, b, guard: 'digit', differing: [...setA].filter((d) => !setB.has(d)).concat([...setB].filter((d) => !setA.has(d))) });
      return false;
    }
  }

  // Guard 2: differing tokens include a cardinal direction or cultural marker → reject
  const toksA = nameTokens(a.name);
  const toksB = nameTokens(b.name);
  const differing = new Set([
    ...[...toksA].filter((t) => !toksB.has(t)),
    ...[...toksB].filter((t) => !toksA.has(t)),
  ]);
  const sensitiveHits = [...differing].filter((t) => CARDINAL_TOKENS.has(t) || CULTURAL_TOKENS.has(t));
  if (sensitiveHits.length > 0) {
    counters.sensitiveToken++;
    counters.rejected.push({ a, b, guard: 'sensitive', differing: sensitiveHits });
    return false;
  }

  // Guard 3: letter-coded buildings (e.g. "Quarters SF" vs "Quarters SN")
  // where the alpha suffix is the only discriminator → reject. Same name +
  // same suffix is fine (still merges); only mismatched suffixes are blocked.
  for (const pat of LETTER_CODE_PREFIX_PATTERNS) {
    const ma = a.name.match(pat);
    const mb = b.name.match(pat);
    if (ma && mb && ma[1] && mb[1] && ma[1].toUpperCase() !== mb[1].toUpperCase()) {
      counters.letterCode++;
      counters.rejected.push({ a, b, guard: 'letter-code', differing: [ma[1], mb[1]] });
      return false;
    }
  }

  return true;
}

function matchReason(
  a: ActivePoi,
  b: ActivePoi,
  counters: GuardCounters,
): string | null {
  // Run similarity first — guards only apply to pairs that would otherwise merge
  const reason = similarityReason(a, b);
  if (!reason) return null;
  if (!passesGuards(a, b, counters)) return null;
  return reason;
}

// ---- Primary selection ------------------------------------------------------

function pickPrimary(
  a: ActivePoi,
  b: ActivePoi,
): { primary: ActivePoi; secondary: ActivePoi } {
  // Confidence tier dominates: a defanged row (confidence < 0.5) can never
  // outrank a high-confidence row, regardless of source priority.
  const ca = confidenceTier(a);
  const cb = confidenceTier(b);
  if (ca !== cb) return ca > cb ? { primary: a, secondary: b } : { primary: b, secondary: a };
  const pa = priority(a.source_type);
  const pb = priority(b.source_type);
  if (pa !== pb) return pa > pb ? { primary: a, secondary: b } : { primary: b, secondary: a };
  if (a.significance_score !== b.significance_score) {
    return a.significance_score > b.significance_score
      ? { primary: a, secondary: b }
      : { primary: b, secondary: a };
  }
  // Deterministic tiebreak: lexicographically smaller UUID wins
  return a.id < b.id ? { primary: a, secondary: b } : { primary: b, secondary: a };
}

// ---- Pair discovery ---------------------------------------------------------

function findConfirmedPairs(
  pois: ActivePoi[],
  dryRun: boolean,
): { pairs: ConfirmedPair[]; counters: GuardCounters; alreadySecondary: Set<string> } {
  console.log(chalk.cyan('[dedupe] building spatial index…'));
  const grid = buildGrid(pois);

  console.log(chalk.cyan('[dedupe] scanning for candidate pairs…'));
  const confirmed: ConfirmedPair[] = [];
  const counters: GuardCounters = { digitMismatch: 0, sensitiveToken: 0, letterCode: 0, rejected: [] };
  // Track IDs designated as secondary in this run to prevent chains
  const alreadySecondary = new Set<string>();

  for (const poi of pois) {
    if (alreadySecondary.has(poi.id)) continue;

    for (const other of neighbors(grid, poi.lat, poi.lng)) {
      // Process each unordered pair once: handle only when other.id > poi.id
      if (other.id <= poi.id) continue;
      if (alreadySecondary.has(other.id)) continue;

      const dist = haversineMeters(poi.lat, poi.lng, other.lat, other.lng);
      if (dist > PROXIMITY_M) continue;

      const reason = matchReason(poi, other, counters);
      if (!reason) continue;

      const { primary, secondary } = pickPrimary(poi, other);

      if (dryRun) {
        console.log(chalk.gray(
          `  MERGE ${dist.toFixed(0).padStart(3)}m` +
          `  "${primary.name}" [${primary.source_type}]` +
          `  ← "${secondary.name}" [${secondary.source_type}]` +
          `  (${reason})`,
        ));
      }

      confirmed.push({ primary, secondary, distanceM: dist, reason, phase: 'spatial' });
      alreadySecondary.add(secondary.id);

      // If the current outer POI was just designated as secondary, stop
      // processing its neighbors to prevent chain merges.
      if (secondary.id === poi.id) break;
    }
  }

  return { pairs: confirmed, counters, alreadySecondary };
}

// ---- Phase 2: name-collapse pass --------------------------------------------

interface NameCollapseResult {
  pairs:            ConfirmedPair[];
  counters:         GuardCounters;
  cappedClusters:   Array<{ name: string; size: number }>;
  rejectedGeneric:  Map<string, number>; // normalized-name → count of POIs skipped
  groupSummary:     Array<{ name: string; merges: number }>;
}

function findNameCollapsePairs(
  pois:             ActivePoi[],
  alreadySecondary: Set<string>,
  dryRun:           boolean,
): NameCollapseResult {
  console.log(chalk.cyan('[dedupe] phase 2: name-collapse pass…'));

  const counters:        GuardCounters = { digitMismatch: 0, sensitiveToken: 0, letterCode: 0, rejected: [] };
  const cappedClusters:  Array<{ name: string; size: number }> = [];
  const rejectedGeneric: Map<string, number> = new Map();
  const confirmed:       ConfirmedPair[] = [];

  // Group by normalized name (cross-category — only the POI-level category filter applies)
  const groups = new Map<string, ActivePoi[]>();
  for (const poi of pois) {
    if (alreadySecondary.has(poi.id)) continue;
    const cat = poi.category_slug ?? '';
    if (COLLAPSE_EXCLUDED_CATEGORIES.has(cat)) continue;

    const norm = normalizeName(poi.name);
    if (norm.length < 3) continue;

    if (COLLAPSE_GENERIC_NAMES.has(norm)) {
      rejectedGeneric.set(norm, (rejectedGeneric.get(norm) ?? 0) + 1);
      continue;
    }

    if (!groups.has(norm)) groups.set(norm, []);
    groups.get(norm)!.push(poi);
  }

  // Sort each group: highest confidence tier first, then highest source
  // priority, so we pick stable medoids that are never defanged rows.
  function poiSortKey(p: ActivePoi): [number, number, number, string] {
    return [-confidenceTier(p), -priority(p.source_type), -p.significance_score, p.id];
  }

  // Per-name local secondary tracker (Phase 2 only)
  const localSecondary = new Set<string>();
  const groupSummary: Array<{ name: string; merges: number }> = [];

  for (const [norm, list] of groups) {
    if (list.length < 2) continue;

    // Sort by confidence tier, priority, significance for stable medoid
    list.sort((a, b) => {
      const ka = poiSortKey(a);
      const kb = poiSortKey(b);
      if (ka[0] !== kb[0]) return ka[0] - kb[0];
      if (ka[1] !== kb[1]) return ka[1] - kb[1];
      if (ka[2] !== kb[2]) return ka[2] - kb[2];
      return ka[3] < kb[3] ? -1 : 1;
    });

    let groupMergeCount = 0;

    // Medoid-based clustering with 2 km radius from medoid
    const used = new Set<number>();
    for (let i = 0; i < list.length; i++) {
      if (used.has(i)) continue;
      const medoid = list[i]!;
      if (localSecondary.has(medoid.id)) continue;

      const cluster: ActivePoi[] = [medoid];
      used.add(i);

      for (let j = 0; j < list.length; j++) {
        if (i === j) continue;
        if (used.has(j)) continue;
        const cand = list[j]!;
        if (localSecondary.has(cand.id)) continue;

        const d = haversineMeters(medoid.lat, medoid.lng, cand.lat, cand.lng);
        if (d > NAME_COLLAPSE_RADIUS_M) continue;

        // Same guards as Phase 1 (digit, sensitive)
        if (!passesGuards(medoid, cand, counters)) continue;

        cluster.push(cand);
        used.add(j);
      }

      if (cluster.length < 2) continue;

      // Cluster cap — never merge more than MAX_CLUSTER_SIZE secondaries into one primary
      const maxAllowed = MAX_CLUSTER_SIZE + 1;
      if (cluster.length > maxAllowed) {
        cappedClusters.push({ name: norm, size: cluster.length });
        cluster.length = maxAllowed;
      }

      // Medoid is the primary (already highest priority by sort order)
      const primary = medoid;
      for (const sec of cluster) {
        if (sec.id === primary.id) continue;
        const distM = haversineMeters(primary.lat, primary.lng, sec.lat, sec.lng);
        const reason = `name-collapse@${distM.toFixed(0)}m`;
        confirmed.push({ primary, secondary: sec, distanceM: distM, reason, phase: 'name-collapse' });
        localSecondary.add(sec.id);
        // Propagate to the shared set so Phase C (wikidata-twin) skips pairs
        // that Phase B already merged (e.g. editorial venue + wikidata twin
        // with matching normalized names within 2 km).
        alreadySecondary.add(sec.id);
        groupMergeCount++;

        if (dryRun) {
          console.log(chalk.gray(
            `  COLLAPSE ${distM.toFixed(0).padStart(4)}m` +
            `  "${primary.name}" [${primary.source_type}]` +
            `  ← "${sec.name}" [${sec.source_type}]`,
          ));
        }
      }
    }

    if (groupMergeCount > 0) {
      groupSummary.push({ name: norm, merges: groupMergeCount });
    }
  }

  groupSummary.sort((a, b) => b.merges - a.merges);
  return { pairs: confirmed, counters, cappedClusters, rejectedGeneric, groupSummary };
}

// ---- Group merges by primary -------------------------------------------------

// ---- Phase C: wikidata-twin pass --------------------------------------------
// Editorial venues store their canonical Wikidata Q-number in
// venue_metadata.wikidata. Phase B's exact-name match misses pairs like
// "Disneyland Park" [editorial] vs "Disneyland" [wikidata] because the
// names normalize differently. The Q-number is the trust anchor — if an
// editorial venue's QID matches a wikidata POI's source_id, they are
// canonical twins by definition. Editorial wins primary regardless of
// source priority because editorial venues ARE the curated canonical row.
function findWikidataTwins(
  pois: ActivePoi[],
  alreadySecondary: Set<string>,
): ConfirmedPair[] {
  const wikidataByQ = new Map<string, ActivePoi>();
  for (const p of pois) {
    if (p.source_type === 'wikidata' && !alreadySecondary.has(p.id)) {
      wikidataByQ.set(p.source_id, p);
    }
  }

  const pairs: ConfirmedPair[] = [];
  for (const venue of pois) {
    if (venue.source_type !== 'editorial') continue;
    if (!venue.wikidata_q) continue;
    if (alreadySecondary.has(venue.id)) continue;
    const twin = wikidataByQ.get(venue.wikidata_q);
    if (!twin || twin.id === venue.id) continue;
    if (alreadySecondary.has(twin.id)) continue;

    const distM = haversineMeters(venue.lat, venue.lng, twin.lat, twin.lng);
    pairs.push({
      primary:   venue,
      secondary: twin,
      distanceM: distM,
      reason:    `wikidata-twin:${venue.wikidata_q}`,
      phase:     'wikidata-twin',
    });
    alreadySecondary.add(twin.id);
  }
  return pairs;
}

function groupByPrimary(pairs: ConfirmedPair[]): MergeGroup[] {
  const map = new Map<string, MergeGroup>();
  for (const { primary, secondary } of pairs) {
    const g = map.get(primary.id) ?? { primary, secondaries: [] };
    g.secondaries.push(secondary);
    map.set(primary.id, g);
  }
  return [...map.values()];
}

// ---- DB updates -------------------------------------------------------------

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

async function applyMergeGroups(
  groups: MergeGroup[],
): Promise<{ applied: number; errors: number }> {
  const pool = getPgPool();
  let applied = 0;
  let errors  = 0;

  for (let i = 0; i < groups.length; i += WRITE_CONCURRENCY) {
    const batch = groups.slice(i, i + WRITE_CONCURRENCY);

    await Promise.all(batch.map(async ({ primary, secondaries }) => {
      const newAdditional = [
        ...primary.additional_sources,
        ...secondaries.map((s) => `${s.source_type}:${s.source_id}`),
      ];

      // Longest non-null description wins
      const bestDesc = [primary.description, ...secondaries.map((s) => s.description)]
        .filter((d): d is string => d != null && d.length > 0)
        .sort((a, b) => b.length - a.length)[0] ?? null;

      // Significance scoring is now the responsibility of recompute-significance,
      // which is always run after dedup in the standard pipeline. The previous
      // in-dedup score update assumed a 0-1 scale and clamped 0-100-scale
      // editorial scores to 1.0, which then caused recompute to lock
      // breakdown.source_base = 100. Dedup now writes structural fields only;
      // recompute owns the score total.
      const newVerified = primary.verified || secondaries.some((s) => s.verified);

      const client = await pool.connect();
      try {
        await client.query('BEGIN');

        // 1. Update primary
        await client.query(
          `UPDATE pois
           SET additional_sources = $1,
               description        = $2,
               verified           = $3
           WHERE id = $4`,
          [newAdditional, bestDesc, newVerified, primary.id],
        );

        // 2. Soft-delete each secondary
        for (const sec of secondaries) {
          await client.query(
            `UPDATE pois SET merged_into = $1 WHERE id = $2`,
            [primary.id, sec.id],
          );
          applied++;
        }

        await client.query('COMMIT');
      } catch (err) {
        await client.query('ROLLBACK').catch(() => undefined);
        console.error(chalk.red(`[dedupe] merge ${primary.id}: ${(err as Error).message}`));
        errors++;
      } finally {
        client.release();
      }
    }));

    if (i + WRITE_CONCURRENCY < groups.length) await sleep(50);
  }

  return { applied, errors };
}

// ---- County bbox via Nominatim ----------------------------------------------

interface BBox { minLat: number; maxLat: number; minLon: number; maxLon: number; }

async function getCountyBbox(county: string, cacheDir: string): Promise<BBox> {
  const slug      = county.toLowerCase().replace(/\s+/g, '-');
  const cacheFile = path.join(cacheDir, 'geocode', `county-bbox-${slug}.json`);

  try {
    return JSON.parse(await fs.readFile(cacheFile, 'utf8')) as BBox;
  } catch { /* not cached */ }

  await sleep(1100); // Nominatim 1 req/sec
  const params = new URLSearchParams({
    q: `${county} County, California, USA`, format: 'jsonv2', limit: '1',
  });
  const res = await fetch(`https://nominatim.openstreetmap.org/search?${params}`, {
    headers: { 'User-Agent': USER_AGENT, Accept: 'application/json' },
  });
  if (!res.ok) throw new Error(`Nominatim ${res.status}`);
  const data = (await res.json()) as Array<{ boundingbox?: [string, string, string, string] }>;
  const bb = data[0]?.boundingbox;
  if (!bb) throw new Error(`No bbox found for county: ${county}`);

  // Nominatim: [south, north, west, east]
  const bbox: BBox = {
    minLat: Number(bb[0]), maxLat: Number(bb[1]),
    minLon: Number(bb[2]), maxLon: Number(bb[3]),
  };
  await fs.mkdir(path.dirname(cacheFile), { recursive: true });
  await fs.writeFile(cacheFile, JSON.stringify(bbox, null, 2), 'utf8');
  return bbox;
}

// ---- Missions consolidation simulation --------------------------------------

const CALIFORNIA_MISSIONS: Array<{ canonical: string; matchers: string[] }> = [
  { canonical: 'San Diego de Alcalá',          matchers: ['san diego de alcala'] },
  { canonical: 'San Carlos Borromeo de Carmelo', matchers: ['san carlos borromeo', 'carmel mission'] },
  { canonical: 'San Antonio de Padua',         matchers: ['san antonio de padua'] },
  { canonical: 'San Gabriel Arcángel',         matchers: ['san gabriel arc', 'san gabriel mission'] },
  { canonical: 'San Luis Obispo de Tolosa',    matchers: ['san luis obispo de tolosa'] },
  { canonical: 'San Francisco de Asís',        matchers: ['san francisco de asis', 'mission dolores'] },
  { canonical: 'San Juan Capistrano',          matchers: ['san juan capistrano'] },
  { canonical: 'Santa Clara de Asís',          matchers: ['santa clara de asis'] },
  { canonical: 'San Buenaventura',             matchers: ['san buenaventura'] },
  { canonical: 'Santa Bárbara',                matchers: ['santa barbara'] },
  { canonical: 'La Purísima Concepción',       matchers: ['la purisima'] },
  { canonical: 'Santa Cruz',                   matchers: ['santa cruz'] },
  { canonical: 'Nuestra Señora de la Soledad', matchers: ['nuestra senora', 'soledad'] },
  { canonical: 'San José',                     matchers: ['san jose'] },
  { canonical: 'San Juan Bautista',            matchers: ['san juan bautista'] },
  { canonical: 'San Miguel Arcángel',          matchers: ['san miguel arc'] },
  { canonical: 'San Fernando Rey de España',   matchers: ['san fernando rey', 'san fernando mission'] },
  { canonical: 'San Luis Rey de Francia',      matchers: ['san luis rey'] },
  { canonical: 'Santa Inés',                   matchers: ['santa ines', 'santa ynez'] },
  { canonical: 'San Rafael Arcángel',          matchers: ['san rafael arc'] },
  { canonical: 'San Francisco Solano',         matchers: ['san francisco solano', 'sonoma mission'] },
];

async function printMissionConsolidation(pairs: ConfirmedPair[]): Promise<void> {
  const pool = getPgPool();
  const { rows } = await pool.query<{
    id: string; name: string; source_type: string;
  }>(`
    SELECT id, name, source_type
    FROM pois
    WHERE merged_into IS NULL
      AND (name ILIKE 'Mission %' OR name ILIKE 'Old Mission %')
  `);

  // Build union-find over confirmed pairs (transitive merging)
  const parent = new Map<string, string>();
  function find(x: string): string {
    let p = parent.get(x) ?? x;
    while (p !== (parent.get(p) ?? p)) p = parent.get(p) ?? p;
    parent.set(x, p);
    return p;
  }
  function union(a: string, b: string): void {
    const ra = find(a);
    const rb = find(b);
    if (ra !== rb) parent.set(ra, rb);
  }
  for (const { primary, secondary } of pairs) union(primary.id, secondary.id);

  function isMission(name: string, matchers: string[]): boolean {
    const n = normalizeName(name);
    if (!n.startsWith('mission ') && !n.startsWith('old mission ')) return false;
    return matchers.some((m) => n.includes(m));
  }

  console.log('');
  console.log(chalk.bold('  21 California Missions consolidation:'));
  console.log(
    '    ' +
    'mission'.padEnd(34) +
    'before'.padStart(7) +
    'after'.padStart(7) +
    '   sources kept',
  );
  console.log('    ' + '─'.repeat(85));

  let okSingle = 0;
  let multi = 0;
  for (const m of CALIFORNIA_MISSIONS) {
    const matched = rows.filter((r) => isMission(r.name, m.matchers));
    if (matched.length === 0) {
      console.log('    ' +
        m.canonical.slice(0, 33).padEnd(34) +
        '0'.padStart(7) + '0'.padStart(7) +
        chalk.gray('   (none in DB)'));
      continue;
    }
    const components = new Set<string>(matched.map((r) => find(r.id)));
    const after = components.size;
    const sources = [...new Set(matched.map((r) => r.source_type))].sort().join(',');
    const flag = after === 1 ? chalk.green(' ✓ single') :
                 chalk.red(` ✗ ${after} groups`);
    console.log('    ' +
      m.canonical.slice(0, 33).padEnd(34) +
      String(matched.length).padStart(7) +
      String(after).padStart(7) +
      '   ' + sources.slice(0, 36).padEnd(38) +
      flag,
    );
    if (after === 1) okSingle++;
    else multi++;
  }
  const inDB = CALIFORNIA_MISSIONS.length - CALIFORNIA_MISSIONS.filter(
    (m) => rows.filter((r) => isMission(r.name, m.matchers)).length === 0,
  ).length;
  console.log('');
  console.log('    ' + chalk.bold(`Single active row after merge: ${okSingle} / ${inDB} (in DB)`));
  if (multi > 0) console.log('    ' + chalk.red(`Still multiple: ${multi}`));
}

// ---- Final report -----------------------------------------------------------

function printReport(opts: {
  poisLoaded:    number;
  confirmed:     ConfirmedPair[];
  counters:      GuardCounters;
  applied:       number;
  errors:        number;
  dryRun:        boolean;
  elapsedMs:     number;
  collapseInfo?: NameCollapseResult;
}): void {
  const { poisLoaded, confirmed, counters, applied, errors, dryRun, elapsedMs, collapseInfo } = opts;

  // Count merges by source-pair type
  const pairCounts = new Map<string, number>();
  for (const { primary, secondary } of confirmed) {
    const key = [primary.source_type, secondary.source_type].sort().join(' × ');
    pairCounts.set(key, (pairCounts.get(key) ?? 0) + 1);
  }

  const phaseACount = confirmed.filter((p) => p.phase === 'spatial').length;
  const phaseBCount = confirmed.filter((p) => p.phase === 'name-collapse').length;
  const phaseCCount = confirmed.filter((p) => p.phase === 'wikidata-twin').length;

  console.log('');
  console.log(chalk.bold('── Dedupe report ───────────────────────────────────'));
  console.log(`  POIs loaded:         ${poisLoaded.toLocaleString()}`);
  console.log(`  Confirmed merges:    ${confirmed.length.toLocaleString()}` + (dryRun ? chalk.yellow(' (dry run)') : ''));
  console.log(`    Phase A (50 m fuzzy):       ${phaseACount.toLocaleString()}`);
  console.log(`    Phase B (name-collapse 2km): ${phaseBCount.toLocaleString()}`);
  console.log(`    Phase C (wikidata Q twin):  ${phaseCCount.toLocaleString()}`);
  if (!dryRun) {
    console.log(`  Merges applied:      ${applied.toLocaleString()}`);
    console.log(`  Errors:              ${errors > 0 ? chalk.red(String(errors)) : '0'}`);
    console.log(`  POIs after:          ${(poisLoaded - applied).toLocaleString()}`);
  }

  if (pairCounts.size > 0) {
    console.log('');
    console.log('  Merges by source pair:');
    const sorted = [...pairCounts.entries()].sort((a, b) => b[1] - a[1]);
    for (const [pair, count] of sorted) {
      console.log(`    ${pair.padEnd(40)} ${count.toLocaleString()}`);
    }
  }

  const totalRejected = counters.digitMismatch + counters.sensitiveToken + counters.letterCode;
  console.log('');
  console.log('  Guard rejections:');
  console.log(`    Digit mismatch:           ${counters.digitMismatch.toLocaleString()}`);
  console.log(`    Sensitive token mismatch: ${counters.sensitiveToken.toLocaleString()}`);
  console.log(`    Letter-code mismatch:     ${counters.letterCode.toLocaleString()}`);
  console.log(`    Total rejected:           ${totalRejected.toLocaleString()}`);
  if (counters.rejected.length > 0) {
    console.log('');
    console.log('  Rejected pairs:');
    for (const { a, b, guard, differing } of counters.rejected) {
      const { primary, secondary } = pickPrimary(a, b);
      console.log(chalk.yellow(
        `    [${guard}] "${primary.name}" [${primary.source_type}]` +
        ` ✗ "${secondary.name}" [${secondary.source_type}]` +
        `  (trigger: ${differing.join(', ')})`,
      ));
    }
  }

  if (confirmed.length > 0) {
    const SAMPLE_N = 30;
    const sampleSize = Math.min(SAMPLE_N, confirmed.length);
    // Random sample without replacement
    const shuffled = confirmed.map((p) => p);
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      const tmp = shuffled[i]!;
      shuffled[i] = shuffled[j]!;
      shuffled[j] = tmp;
    }
    const sample = shuffled.slice(0, sampleSize);

    console.log('');
    console.log(`  Random sample (${sample.length} of ${confirmed.length}):`);
    for (const { primary, secondary, distanceM, reason, phase } of sample) {
      const tag = phase === 'wikidata-twin'
        ? chalk.green('[C]')
        : phase === 'name-collapse'
          ? chalk.magenta('[B]')
          : chalk.cyan('[A]');
      console.log(chalk.gray(
        `    ${tag} ${distanceM.toFixed(0).padStart(4)}m` +
        `  "${primary.name}" [${primary.source_type}]` +
        `  ← "${secondary.name}" [${secondary.source_type}]` +
        `  (${reason})`,
      ));
    }
  }


  // Phase B–specific sections
  if (collapseInfo) {
    const { groupSummary, cappedClusters, rejectedGeneric, counters: collapseCounters } = collapseInfo;

    if (groupSummary.length > 0) {
      console.log('');
      console.log(chalk.bold('  Phase B — top 20 names by merge count:'));
      for (const g of groupSummary.slice(0, 20)) {
        console.log(`    ${String(g.merges).padStart(4)}  "${g.name}"`);
      }
      if (groupSummary.length > 20) {
        console.log(chalk.gray(`    … and ${groupSummary.length - 20} more name-groups with ≥1 merge`));
      }
    }

    if (cappedClusters.length > 0) {
      console.log('');
      console.log(chalk.yellow('  Phase B — cluster cap fired:'));
      for (const c of cappedClusters) {
        console.log(chalk.yellow(`    "${c.name}" had ${c.size} POIs (truncated to ${MAX_CLUSTER_SIZE} merges + 1 primary)`));
      }
    } else {
      console.log('');
      console.log(chalk.gray(`  Phase B — cluster cap (${MAX_CLUSTER_SIZE}) did not fire on any group`));
    }

    if (rejectedGeneric.size > 0) {
      console.log('');
      console.log(chalk.bold('  Phase B — generic-name reject hits:'));
      const sorted = [...rejectedGeneric.entries()].sort((a, b) => b[1] - a[1]);
      for (const [name, n] of sorted) {
        console.log(`    ${String(n).padStart(4)} POIs skipped under name "${name}"`);
      }
    }

    if (collapseCounters.rejected.length > 0) {
      console.log('');
      console.log(chalk.bold('  Phase B — guard rejections (digit/sensitive):'));
      console.log(`    Digit mismatch:           ${collapseCounters.digitMismatch.toLocaleString()}`);
      console.log(`    Sensitive token mismatch: ${collapseCounters.sensitiveToken.toLocaleString()}`);
    }
  }

  console.log('');
  console.log(chalk.gray([
    '  Suggested partial index (add to a migration if not yet present):',
    '    CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_pois_geom_active',
    '      ON pois USING GIST(geom) WHERE merged_into IS NULL;',
  ].join('\n')));
  console.log('');
  console.log(chalk.green(`  Done in ${(elapsedMs / 1000).toFixed(1)}s`));
}

// ---- Main -------------------------------------------------------------------

const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);
dotenvConfig({ path: path.resolve(__dirname, '../../.env') });

async function main(): Promise<void> {
  const program = new Command();
  program
    .name('dedupe')
    .description('Spatial deduplication pass — merge near-duplicate POIs across sources')
    .option('--dry-run',          'Log proposed merges without applying to DB',     false)
    .option('--county <name>',    'Restrict to one California county (Nominatim geocoded)')
    .option('--bbox <minLat,minLon,maxLat,maxLon>', 'Restrict to an explicit bbox (overrides --county if both given)')
    .option('--limit <n>',        'Cap the number of merges applied', (v) => parseInt(v, 10))
    .option('--cache-dir <path>', 'Cache directory for Nominatim results',
      path.join(__dirname, 'cache'));

  await program.parseAsync(process.argv);

  const opts = program.opts<{
    dryRun:   boolean;
    county?:  string;
    bbox?:    string;
    limit?:   number;
    cacheDir: string;
  }>();

  console.log(chalk.bold('XRoad POI deduplication'));
  if (opts.dryRun) console.log(chalk.yellow('DRY RUN — no DB writes'));

  const start = Date.now();

  // Resolve --bbox or --county → bbox (--bbox wins if both supplied)
  let bbox: BBox | undefined;
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
    console.log(chalk.gray(
      `[dedupe] explicit bbox: ${bbox.minLat.toFixed(2)},${bbox.minLon.toFixed(2)}` +
      ` → ${bbox.maxLat.toFixed(2)},${bbox.maxLon.toFixed(2)}`,
    ));
  } else if (opts.county) {
    console.log(chalk.cyan(`[dedupe] geocoding county: ${opts.county}…`));
    bbox = await getCountyBbox(opts.county, opts.cacheDir);
    console.log(chalk.gray(
      `[dedupe] county bbox: ${bbox.minLat.toFixed(2)},${bbox.minLon.toFixed(2)}` +
      ` → ${bbox.maxLat.toFixed(2)},${bbox.maxLon.toFixed(2)}`,
    ));
  }

  const allPois = await fetchAllActivePois(bbox);
  if (allPois.length === 0) {
    console.log(chalk.yellow('[dedupe] no active POIs found — nothing to do'));
    return;
  }

  // Phase A: 50 m fuzzy spatial pass
  const { pairs: phaseA, counters: countersA, alreadySecondary } = findConfirmedPairs(allPois, opts.dryRun);
  console.log(chalk.cyan(
    `[dedupe] phase A: ${phaseA.length.toLocaleString()} merge${phaseA.length === 1 ? '' : 's'}` +
    ` (${countersA.digitMismatch + countersA.sensitiveToken + countersA.letterCode} rejected by guards)`,
  ));

  // Phase B: name-collapse pass (excludes anything already merged in Phase A)
  const collapseInfo = findNameCollapsePairs(allPois, alreadySecondary, opts.dryRun);
  console.log(chalk.cyan(
    `[dedupe] phase B: ${collapseInfo.pairs.length.toLocaleString()} name-collapse merge${collapseInfo.pairs.length === 1 ? '' : 's'}` +
    ` (${collapseInfo.counters.digitMismatch + collapseInfo.counters.sensitiveToken + collapseInfo.counters.letterCode} rejected by guards,` +
    ` ${collapseInfo.cappedClusters.length} clusters capped,` +
    ` ${collapseInfo.rejectedGeneric.size} generic name${collapseInfo.rejectedGeneric.size === 1 ? '' : 's'} skipped)`,
  ));

  // Phase C: wikidata-twin pass (Q-number match between editorial venues
  // and wikidata POIs). Editorial wins primary regardless of source
  // priority — editorial venues are by definition the curated canonical.
  const phaseC = findWikidataTwins(allPois, alreadySecondary);
  console.log(chalk.cyan(
    `[dedupe] phase C: ${phaseC.length.toLocaleString()} wikidata-twin merge${phaseC.length === 1 ? '' : 's'}`,
  ));
  if (opts.dryRun) {
    for (const p of phaseC) {
      console.log(chalk.gray(
        `  TWIN  Q=${p.secondary.source_id.padEnd(10)}  ` +
        `"${p.primary.name}" [editorial]  ← "${p.secondary.name}" [wikidata]`,
      ));
    }
  }

  // Combined pairs and guard counters for the unified report
  const confirmed: ConfirmedPair[] = [...phaseA, ...collapseInfo.pairs, ...phaseC];
  const counters: GuardCounters = {
    digitMismatch:  countersA.digitMismatch  + collapseInfo.counters.digitMismatch,
    sensitiveToken: countersA.sensitiveToken + collapseInfo.counters.sensitiveToken,
    letterCode:     countersA.letterCode     + collapseInfo.counters.letterCode,
    rejected:       [...countersA.rejected,  ...collapseInfo.counters.rejected],
  };

  let applied = 0;
  let errors  = 0;

  if (!opts.dryRun && confirmed.length > 0) {
    let toApply = confirmed;
    if (opts.limit != null && confirmed.length > opts.limit) {
      toApply = confirmed.slice(0, opts.limit);
      console.log(chalk.yellow(
        `[dedupe] --limit ${opts.limit}: applying ${toApply.length} of ${confirmed.length} merges`,
      ));
    }

    const groups = groupByPrimary(toApply);
    console.log(chalk.cyan(
      `[dedupe] applying merges across ${groups.length} primary POI${groups.length === 1 ? '' : 's'}…`,
    ));
    ({ applied, errors } = await applyMergeGroups(groups));
  }

  printReport({
    poisLoaded: allPois.length,
    confirmed, counters, applied, errors,
    dryRun: opts.dryRun,
    elapsedMs: Date.now() - start,
    collapseInfo,
  });

  await printMissionConsolidation(confirmed);
}

main()
  .finally(async () => { try { await getPgPool().end(); } catch { /* noop */ } })
  .catch((err: unknown) => {
    console.error(chalk.red(err instanceof Error ? err.message : String(err)));
    process.exit(1);
  });
