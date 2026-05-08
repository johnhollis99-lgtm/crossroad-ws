/**
 * Wikidata Q-number → English Wikipedia article title resolver.
 *
 * Uses the MediaWiki wbgetentities API (50 IDs per request, ≥1s between calls).
 * Resolved titles are cached on disk for 30 days, including null results
 * (entity has no enwiki sitelink) so we don't refetch known-misses.
 *
 * Used by recompute-significance.ts as a fallback when source_citation
 * does not contain an en.wikipedia.org/wiki/{title} URL — most importantly
 * for editorial venue rows whose citation is the Wikidata entity URL.
 */

import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { promises as fs } from 'node:fs';
import chalk from 'chalk';

const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);

const SITELINK_CACHE_DIR = path.join(__dirname, '..', 'cache', 'wikidata-sitelinks');
const SITELINK_TTL_MS    = 30 * 24 * 60 * 60 * 1000;   // 30 days
const RATE_LIMIT_MS      = 1000;                        // 1 req/sec
const BATCH_SIZE         = 50;                          // wbgetentities hard limit
const RETRY_DELAYS_MS    = [2_000, 4_000, 8_000, 16_000, 32_000] as const;
const USER_AGENT         = 'XRoad-POI-Import/0.1 (johnhollis99@gmail.com)';
const MWAPI_ENDPOINT     = 'https://www.wikidata.org/w/api.php';

interface SitelinkCacheEntry {
  // null means resolved-but-no-enwiki-sitelink. Cached so we skip refetching misses.
  title:     string | null;
  fetchedAt: string;
}

interface WbgetentitiesResponse {
  entities?: Record<string, {
    sitelinks?: { enwiki?: { title?: string } };
    missing?:   string;
  }>;
}

let lastApiAt = 0;
async function rateLimit(): Promise<void> {
  const wait = lastApiAt + RATE_LIMIT_MS - Date.now();
  if (wait > 0) await new Promise<void>((r) => setTimeout(r, wait));
  lastApiAt = Date.now();
}

function cachePath(qid: string): string {
  return path.join(SITELINK_CACHE_DIR, `${qid}.json`);
}

async function readCache(qid: string): Promise<SitelinkCacheEntry | null> {
  try {
    const raw    = await fs.readFile(cachePath(qid), 'utf8');
    const cached = JSON.parse(raw) as SitelinkCacheEntry;
    if (Date.now() - new Date(cached.fetchedAt).getTime() < SITELINK_TTL_MS) {
      return cached;
    }
  } catch { /* miss */ }
  return null;
}

async function writeCache(qid: string, title: string | null): Promise<void> {
  const entry: SitelinkCacheEntry = { title, fetchedAt: new Date().toISOString() };
  await fs.writeFile(cachePath(qid), JSON.stringify(entry), 'utf8');
}

async function fetchBatch(qids: string[]): Promise<Map<string, string | null>> {
  const url = new URL(MWAPI_ENDPOINT);
  url.searchParams.set('action',     'wbgetentities');
  url.searchParams.set('ids',        qids.join('|'));
  url.searchParams.set('props',      'sitelinks');
  url.searchParams.set('sitefilter', 'enwiki');
  url.searchParams.set('format',     'json');

  for (let attempt = 0; attempt <= RETRY_DELAYS_MS.length; attempt++) {
    let res: Response;
    try {
      res = await fetch(url.toString(), { headers: { 'User-Agent': USER_AGENT } });
    } catch (err) {
      if (attempt < RETRY_DELAYS_MS.length) {
        const delay = RETRY_DELAYS_MS[attempt]!;
        console.warn(chalk.yellow(
          `[wikidata-sitelinks] network error: ${(err as Error).message} — retry ${attempt + 1}/${RETRY_DELAYS_MS.length} in ${delay / 1000}s`,
        ));
        await new Promise<void>((r) => setTimeout(r, delay));
        continue;
      }
      console.warn(chalk.yellow(
        `[wikidata-sitelinks] network error after all retries: ${(err as Error).message}`,
      ));
      return new Map(qids.map((q) => [q, null]));
    }

    if (res.ok) {
      const data = await res.json() as WbgetentitiesResponse;
      const out  = new Map<string, string | null>();
      for (const qid of qids) {
        const entity = data.entities?.[qid];
        const title  = entity?.sitelinks?.enwiki?.title;
        out.set(qid, typeof title === 'string' && title.length > 0 ? title : null);
      }
      return out;
    }

    if (attempt < RETRY_DELAYS_MS.length) {
      const retryAfterHeader = res.headers.get('Retry-After');
      const delay = retryAfterHeader
        ? Number(retryAfterHeader) * 1000
        : RETRY_DELAYS_MS[attempt]!;
      console.warn(chalk.yellow(
        `[wikidata-sitelinks] HTTP ${res.status} — retry ${attempt + 1}/${RETRY_DELAYS_MS.length} in ${delay / 1000}s`,
      ));
      await new Promise<void>((r) => setTimeout(r, delay));
    } else {
      console.warn(chalk.yellow(
        `[wikidata-sitelinks] HTTP ${res.status} after all retries — recording nulls for batch`,
      ));
      return new Map(qids.map((q) => [q, null]));
    }
  }

  return new Map(qids.map((q) => [q, null]));
}

/**
 * Resolves a list of Q-numbers to English Wikipedia article titles.
 * Returns a Map<qid, title|null>. null means the entity has no enwiki sitelink
 * (or the request failed) — cached so we don't refetch within the TTL.
 *
 * Caller is responsible for filtering input to valid Q-numbers (/^Q\d+$/).
 */
export async function resolveQidsToTitles(
  qids: string[],
): Promise<Map<string, string | null>> {
  const result = new Map<string, string | null>();
  if (qids.length === 0) return result;

  await fs.mkdir(SITELINK_CACHE_DIR, { recursive: true });

  const unique  = Array.from(new Set(qids));
  const toFetch: string[] = [];

  for (const qid of unique) {
    const cached = await readCache(qid);
    if (cached !== null) {
      result.set(qid, cached.title);
    } else {
      toFetch.push(qid);
    }
  }

  for (let i = 0; i < toFetch.length; i += BATCH_SIZE) {
    const batch = toFetch.slice(i, i + BATCH_SIZE);
    await rateLimit();
    const batchMap = await fetchBatch(batch);
    for (const qid of batch) {
      const title = batchMap.get(qid) ?? null;
      result.set(qid, title);
      await writeCache(qid, title);
    }
  }

  return result;
}

/** Tests whether a string is a well-formed Wikidata Q-number. */
export function isQid(s: string | null | undefined): s is string {
  return typeof s === 'string' && /^Q\d+$/.test(s);
}
