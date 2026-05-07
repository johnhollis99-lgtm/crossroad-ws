#!/usr/bin/env node
/**
 * Recomputes significance_score and significance_breakdown for every active POI.
 *
 * Score components (all integer points, cap 100):
 *   source_base      – existing import score preserved (0-100)
 *   cross_source     – +10 per additional_sources entry, max 30
 *   pageviews        – Wikipedia 30-day views on log scale, 0-20
 *   route_adjacency  – PostGIS proximity to major CA highways, 0 or 5 or 10
 *
 * Safe to rerun (idempotent: source_base is read from breakdown if present).
 * Wikipedia pageviews are cached for 7 days in cache/pageviews/.
 * highway_routes table must be populated for route adjacency to score > 0.
 */

import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';
dotenv.config({ path: path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../.env') });
import { promises as fs } from 'node:fs';
import { createHash } from 'node:crypto';
import { Command } from 'commander';
import chalk from 'chalk';
import { getAdminClient } from './lib/supabase.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);

const PAGEVIEW_CACHE_DIR = path.join(__dirname, 'cache', 'pageviews');
const PAGEVIEW_TTL_MS    = 7 * 24 * 60 * 60 * 1000;  // 7 days
const WIKI_RATE_MS       = 100;                         // 10 req/sec
const WIKI_USER_AGENT    = 'XRoad-POI-Import/0.1 (johnhollis99@gmail.com)';

// ── Types ────────────────────────────────────────────────────────────────────

interface SignificanceBreakdown {
  source_base:     number;
  cross_source:    number;
  pageviews:       number;
  route_adjacency: number;
  total:           number;
}

interface PoiRow {
  id:                      string;
  significance_score:      number | string;
  significance_breakdown:  Partial<SignificanceBreakdown> | null;
  additional_sources:      string[] | null;
  source_citation:         string | null;
}

interface BatchUpdate {
  id:                     string;
  significance_score:     number;
  significance_breakdown: SignificanceBreakdown;
}

// ── Source-base derivation ───────────────────────────────────────────────────

/**
 * Converts the stored significance_score to an integer 0-100 point value.
 * Idempotent: if the row already has a breakdown, returns breakdown.source_base.
 * Otherwise normalises the raw DB value:
 *   ≤ 1.0  → importer stored a 0-1 fraction (e.g. 0.30 → 30 pts)
 *   > 1.0  → already on the 0-100 scale (e.g. editorial default 5.0 → 5 pts)
 */
function deriveSourceBase(poi: PoiRow): number {
  if (poi.significance_breakdown?.source_base != null) {
    return poi.significance_breakdown.source_base;
  }
  const raw = typeof poi.significance_score === 'number'
    ? poi.significance_score
    : parseFloat(String(poi.significance_score));
  return raw <= 1.0
    ? Math.min(100, Math.round(raw * 100))
    : Math.min(100, Math.round(raw));
}

// ── Cross-source points ──────────────────────────────────────────────────────

function crossSourcePoints(additionalSources: string[] | null): number {
  return Math.min(30, (additionalSources?.length ?? 0) * 10);
}

// ── Wikipedia pageview helpers ───────────────────────────────────────────────

interface PageviewCache {
  views:     number;
  fetchedAt: string;
}

async function readPageviewCache(title: string): Promise<number | null> {
  const hash = createHash('sha1').update(title).digest('hex').slice(0, 16);
  try {
    const raw     = await fs.readFile(path.join(PAGEVIEW_CACHE_DIR, `${hash}.json`), 'utf8');
    const cached  = JSON.parse(raw) as PageviewCache;
    const ageMs   = Date.now() - new Date(cached.fetchedAt).getTime();
    if (ageMs < PAGEVIEW_TTL_MS) return cached.views;
  } catch { /* miss */ }
  return null;
}

async function writePageviewCache(title: string, views: number): Promise<void> {
  const hash = createHash('sha1').update(title).digest('hex').slice(0, 16);
  const entry: PageviewCache = { views, fetchedAt: new Date().toISOString() };
  await fs.writeFile(path.join(PAGEVIEW_CACHE_DIR, `${hash}.json`), JSON.stringify(entry), 'utf8');
}

let lastWikiAt = 0;
async function wikiRateLimit(): Promise<void> {
  const wait = lastWikiAt + WIKI_RATE_MS - Date.now();
  if (wait > 0) await new Promise<void>((r) => setTimeout(r, wait));
  lastWikiAt = Date.now();
}

/** Returns the YYYYMMDD00 timestamp for the first day of a given month. */
function monthStamp(d: Date): string {
  return `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}0100`;
}

/**
 * Fetches 30-day Wikipedia pageviews for an article title.
 * Uses Wikimedia REST monthly endpoint for the most recent complete month.
 * Returns null on network failure (caller uses 0 pts).
 */
async function fetchPageviews(title: string, force: boolean): Promise<number | null> {
  if (!force) {
    const cached = await readPageviewCache(title);
    if (cached !== null) return cached;
  }

  await wikiRateLimit();

  const now       = new Date();
  const lastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const stamp     = monthStamp(lastMonth);
  const encoded   = encodeURIComponent(title.replace(/ /g, '_'));
  const url       =
    `https://wikimedia.org/api/rest_v1/metrics/pageviews/per-article/` +
    `en.wikipedia.org/all-access/all-agents/${encoded}/monthly/${stamp}/${stamp}`;

  try {
    const res = await fetch(url, { headers: { 'User-Agent': WIKI_USER_AGENT } });
    if (res.status === 404) {
      await writePageviewCache(title, 0);
      return 0;
    }
    if (!res.ok) {
      console.warn(chalk.yellow(`[pageviews] HTTP ${res.status} for "${title}" — skipping`));
      return null;
    }
    const data   = await res.json() as { items?: { views: number }[] };
    const views  = data.items?.reduce((s, item) => s + (item.views ?? 0), 0) ?? 0;
    await writePageviewCache(title, views);
    return views;
  } catch (err) {
    console.warn(chalk.yellow(`[pageviews] fetch error for "${title}": ${(err as Error).message}`));
    return null;
  }
}

/**
 * Normalises pageview counts to 0-20 integer points on a log scale:
 *   100 views → 5 pts, 1 k → 10, 10 k → 15, 100 k+ → 20.
 */
function pageviewPoints(views: number): number {
  if (views <= 0) return 0;
  return Math.min(20, Math.max(0, Math.round(5 * (Math.log10(views) - 1))));
}

/**
 * Extracts the Wikipedia article title from a source_citation URL.
 * e.g. "https://en.wikipedia.org/wiki/Yosemite_National_Park" → "Yosemite National Park"
 */
function extractWikipediaTitle(citation: string | null): string | null {
  if (!citation?.startsWith('https://en.wikipedia.org/wiki/')) return null;
  const encoded = citation.slice('https://en.wikipedia.org/wiki/'.length);
  try {
    return decodeURIComponent(encoded).replace(/_/g, ' ');
  } catch {
    return null;
  }
}

// ── Route adjacency ──────────────────────────────────────────────────────────

// Sub-batch size for adjacency RPC — smaller batches avoid statement timeout
// on complex highway geometries (100 POIs × 221 routes is well within limits).
const ADJACENCY_SUB_BATCH = 100;

async function fetchAdjacencyScores(
  supabase: ReturnType<typeof getAdminClient>,
  poiIds: string[],
): Promise<Map<string, number>> {
  const map = new Map<string, number>();

  for (let i = 0; i < poiIds.length; i += ADJACENCY_SUB_BATCH) {
    const chunk = poiIds.slice(i, i + ADJACENCY_SUB_BATCH);
    const { data, error } = await supabase.rpc('batch_route_adjacency_scores', {
      poi_ids: chunk,
    });
    if (error) {
      console.warn(chalk.yellow(`[adjacency] RPC failed: ${error.message} — using 0 for this sub-batch`));
      continue;
    }
    for (const row of (data ?? []) as { poi_id: string; adjacency_points: number }[]) {
      map.set(row.poi_id, row.adjacency_points);
    }
  }

  return map;
}

// ── Batch DB update ──────────────────────────────────────────────────────────

async function flushUpdates(
  supabase: ReturnType<typeof getAdminClient>,
  updates: BatchUpdate[],
  dryRun: boolean,
): Promise<void> {
  if (updates.length === 0) return;

  if (dryRun) {
    console.log(chalk.cyan(`[recompute] DRY RUN — would update ${updates.length} rows`));
    for (const u of updates.slice(0, 3)) {
      const b = u.significance_breakdown;
      console.log(
        chalk.gray(`  • ${u.id.slice(0, 8)}… → ${b.total} pts`),
        chalk.gray(`(base=${b.source_base} xs=${b.cross_source} pv=${b.pageviews} ra=${b.route_adjacency})`),
      );
    }
    if (updates.length > 3) console.log(chalk.gray(`  …and ${updates.length - 3} more`));
    return;
  }

  const { error } = await supabase.rpc('batch_update_significance', {
    p_ids:        updates.map((u) => u.id),
    p_scores:     updates.map((u) => u.significance_score),
    p_breakdowns: updates.map((u) => u.significance_breakdown),
  });

  if (error) {
    console.error(chalk.red(`[recompute] batch_update_significance failed: ${error.message}`));
  } else {
    console.log(chalk.green(`[recompute] updated ${updates.length} rows`));
  }
}

// ── Histogram ────────────────────────────────────────────────────────────────

function logHistogram(buckets: number[], total: number): void {
  const maxCount = Math.max(1, ...buckets);
  const BAR      = 40;
  console.log(chalk.bold('── Score distribution (0–100) ──────────────────────────────'));
  for (let i = 0; i < buckets.length; i++) {
    const lo    = i * 10;
    const hi    = i === 10 ? 100 : lo + 9;
    const count = buckets[i] ?? 0;
    const bar   = '█'.repeat(Math.round((count / maxCount) * BAR)).padEnd(BAR);
    const pct   = total > 0 ? ((count / total) * 100).toFixed(1) : '0.0';
    console.log(
      `  ${String(lo).padStart(3)}–${String(hi).padEnd(3)}  ${bar}  ${String(count).padStart(5)}  (${pct}%)`,
    );
  }
}

// ── Main ─────────────────────────────────────────────────────────────────────

interface CliOpts {
  dryRun:       boolean;
  forcePageviews: boolean;
  skipPageviews:  boolean;
  batchSize:    string;
}

async function main(opts: CliOpts): Promise<void> {
  const BATCH_SIZE = Math.max(1, Number(opts.batchSize));
  const supabase   = getAdminClient();

  await fs.mkdir(PAGEVIEW_CACHE_DIR, { recursive: true });

  if (opts.dryRun) console.log(chalk.yellow('DRY RUN — no DB writes'));

  console.log(chalk.bold('XRoad — recompute-significance'));
  console.log(chalk.gray(
    `batch=${BATCH_SIZE}  pageviews=${opts.skipPageviews ? 'skip' : opts.forcePageviews ? 'force' : 'cached'}`,
  ));

  let offset         = 0;
  let totalProcessed = 0;
  const histBuckets  = new Array<number>(11).fill(0);  // [0-9, 10-19, …, 100]

  for (;;) {
    // ── Fetch batch ────────────────────────────────────────────────────────
    const { data: pois, error: fetchErr } = await supabase
      .from('pois')
      .select('id, significance_score, significance_breakdown, additional_sources, source_citation')
      .is('merged_into', null)
      .range(offset, offset + BATCH_SIZE - 1)
      .order('id');

    if (fetchErr) throw new Error(`fetch failed: ${fetchErr.message}`);
    if (!pois || pois.length === 0) break;

    console.log(chalk.cyan(`[recompute] batch offset=${offset}, count=${pois.length}`));

    // ── Route adjacency (one RPC for the whole batch) ──────────────────────
    const adjacencyMap = await fetchAdjacencyScores(supabase, pois.map((p) => p.id as string));

    // ── Per-POI scoring ────────────────────────────────────────────────────
    const updates: BatchUpdate[] = [];

    for (const poi of pois as unknown as PoiRow[]) {
      const source_base     = deriveSourceBase(poi);
      const cross_source    = crossSourcePoints(poi.additional_sources);
      const route_adjacency = adjacencyMap.get(poi.id) ?? 0;

      // Wikipedia pageviews (rate-limited, cached)
      let pageviews = 0;
      if (!opts.skipPageviews) {
        const title = extractWikipediaTitle(poi.source_citation);
        if (title) {
          const views = await fetchPageviews(title, opts.forcePageviews);
          if (views !== null) pageviews = pageviewPoints(views);
        }
      }

      const total = Math.min(100, source_base + cross_source + pageviews + route_adjacency);

      const breakdown: SignificanceBreakdown = {
        source_base,
        cross_source,
        pageviews,
        route_adjacency,
        total,
      };

      updates.push({ id: poi.id, significance_score: total, significance_breakdown: breakdown });

      // Histogram bucket: score 100 → bucket 10, others → floor(score/10)
      const bucket = Math.min(10, Math.floor(total / 10));
      histBuckets[bucket] = (histBuckets[bucket] ?? 0) + 1;
    }

    // ── Write batch ────────────────────────────────────────────────────────
    await flushUpdates(supabase, updates, opts.dryRun);

    totalProcessed += pois.length;

    if (pois.length < BATCH_SIZE) break;
    offset += BATCH_SIZE;
  }

  console.log('');
  logHistogram(histBuckets, totalProcessed);
  console.log(chalk.bold.green(`\n✓ Recomputed ${totalProcessed} POIs`));
}

// ── CLI ───────────────────────────────────────────────────────────────────────

const program = new Command();

program
  .name('recompute-significance')
  .description('Recompute POI significance scores with cross-source, pageview, and route-adjacency signals')
  .option('--dry-run',         'Compute scores but do not write to DB', false)
  .option('--force-pageviews', 'Bypass 7-day Wikipedia pageview cache', false)
  .option('--skip-pageviews',  'Skip Wikipedia pageview lookups entirely', false)
  .option('--batch-size <n>',  'POIs fetched per DB round-trip', '1000')
  .action((cliOpts: CliOpts) => {
    main(cliOpts).catch((err: unknown) => {
      console.error(chalk.red(err instanceof Error ? err.message : String(err)));
      process.exit(1);
    });
  });

program.parseAsync(process.argv).catch((err: unknown) => {
  console.error(chalk.red(err instanceof Error ? err.message : String(err)));
  process.exit(1);
});
