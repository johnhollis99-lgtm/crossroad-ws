/**
 * Wikidata Q-number → P31 (instance-of) class list resolver.
 *
 * Used by recompute-significance.ts for the A1 soul-doctrine misalignment
 * fix: when a geology or nature POI's Wikidata source_id has a P31 claim
 * matching the soul-doctrine-relevant class set
 * (Q8502 mountain, Q60504 lake, Q34038 waterfall, Q1437459 volcano,
 *  Q35509 cave, Q190429 fault, Q133056 hot spring, Q170583 valley,
 *  Q160091 plateau, Q35666 island), award +10 pts to significance_score.
 *
 * Implementation uses Wikidata SPARQL (faster + smaller responses than
 * wbgetentities/claims for batch P31 lookup). Disk-cached for 30 days
 * per QID — including resolved-empty results so we don't refetch misses.
 *
 * Decision doc: docs/decisions/2026-05-15-top-tier-poi-first-run.md
 *               §Curator decision on Track 2 proposals → A1.
 */

import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { promises as fs } from 'node:fs';
import chalk from 'chalk';

const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);

const CACHE_DIR       = path.join(__dirname, '..', 'cache', 'wikidata-p31');
const CACHE_TTL_MS    = 30 * 24 * 60 * 60 * 1000;  // 30 days
const SPARQL_ENDPOINT = 'https://query.wikidata.org/sparql';
const USER_AGENT      = 'XRoad-POI-Import/0.1 (johnhollis99@gmail.com)';
const SPARQL_INTERVAL_MS = 1000;   // 1 req/sec — Wikidata's documented soft limit
const BATCH_SIZE      = 500;       // QIDs per SPARQL VALUES block (well under 60s timeout)
const RETRY_DELAYS_MS = [2_000, 4_000, 8_000, 16_000, 32_000] as const;

/** The soul-doctrine-relevant P31 class set per A1 decision-doc §Curator decision. */
export const SOUL_DOCTRINE_CLASSES = new Set<string>([
  'Q8502',     // mountain
  'Q60504',    // lake
  'Q34038',    // waterfall
  'Q1437459',  // volcano
  'Q35509',    // cave
  'Q190429',   // fault
  'Q133056',   // hot spring
  'Q170583',   // valley
  'Q160091',   // plateau
  'Q35666',    // island
]);

interface P31CacheEntry {
  classes:   string[];   // Q-numbers; empty array = resolved, no P31 found
  fetchedAt: string;
}

let lastSparqlAt = 0;
async function rateLimit(): Promise<void> {
  const wait = lastSparqlAt + SPARQL_INTERVAL_MS - Date.now();
  if (wait > 0) await new Promise<void>((r) => setTimeout(r, wait));
  lastSparqlAt = Date.now();
}

function cachePath(qid: string): string {
  return path.join(CACHE_DIR, `${qid}.json`);
}

async function readCache(qid: string): Promise<P31CacheEntry | null> {
  try {
    const raw    = await fs.readFile(cachePath(qid), 'utf8');
    const cached = JSON.parse(raw) as P31CacheEntry;
    if (Date.now() - new Date(cached.fetchedAt).getTime() < CACHE_TTL_MS) {
      return cached;
    }
  } catch { /* miss */ }
  return null;
}

async function writeCache(qid: string, classes: string[]): Promise<void> {
  await fs.mkdir(CACHE_DIR, { recursive: true });
  const entry: P31CacheEntry = { classes, fetchedAt: new Date().toISOString() };
  await fs.writeFile(cachePath(qid), JSON.stringify(entry), 'utf8');
}

interface SparqlBinding { type: string; value: string; }
interface SparqlRow { item: SparqlBinding; class: SparqlBinding; }
interface SparqlResponse { results: { bindings: SparqlRow[] }; }

/** Strip the wikidata entity URL prefix from a SPARQL binding value. */
function unwrapEntity(uri: string): string | null {
  const m = uri.match(/Q\d+$/);
  return m ? m[0] : null;
}

async function fetchBatch(qids: string[]): Promise<Map<string, string[]>> {
  const values = qids.map((q) => `wd:${q}`).join(' ');
  const query = `
SELECT ?item ?class WHERE {
  VALUES ?item { ${values} }
  ?item wdt:P31 ?class .
}
  `.trim();

  const url = new URL(SPARQL_ENDPOINT);
  url.searchParams.set('query',  query);
  url.searchParams.set('format', 'json');

  for (let attempt = 0; attempt <= RETRY_DELAYS_MS.length; attempt++) {
    let res: Response;
    try {
      res = await fetch(url.toString(), {
        headers: {
          'User-Agent': USER_AGENT,
          'Accept':     'application/sparql-results+json',
        },
      });
    } catch (err) {
      if (attempt < RETRY_DELAYS_MS.length) {
        await new Promise<void>((r) => setTimeout(r, RETRY_DELAYS_MS[attempt]!));
        continue;
      }
      throw err;
    }

    if (res.status === 429 || res.status === 502 || res.status === 503 || res.status === 504) {
      if (attempt < RETRY_DELAYS_MS.length) {
        await new Promise<void>((r) => setTimeout(r, RETRY_DELAYS_MS[attempt]!));
        continue;
      }
    }
    if (!res.ok) {
      const body = await res.text().catch(() => '');
      throw new Error(`Wikidata SPARQL P31 HTTP ${res.status}: ${body.slice(0, 200)}`);
    }

    const data = (await res.json()) as SparqlResponse;
    const result = new Map<string, string[]>();
    for (const q of qids) result.set(q, []);
    for (const row of data.results.bindings) {
      const itemQ  = unwrapEntity(row.item.value);
      const classQ = unwrapEntity(row.class.value);
      if (itemQ && classQ) {
        result.get(itemQ)!.push(classQ);
      }
    }
    return result;
  }
  throw new Error('Wikidata SPARQL P31 — retries exhausted');
}

/**
 * Resolve P31 claims for a batch of Q-numbers. Returns a map keyed by QID
 * containing the array of P31 class Q-numbers (empty if no P31 claim).
 *
 * Uses disk cache; only QIDs that miss the cache are sent to SPARQL.
 * Caller is expected to pre-filter to QIDs of interest.
 */
export async function resolveQidsToP31(qids: string[]): Promise<Map<string, string[]>> {
  const result = new Map<string, string[]>();
  const toFetch: string[] = [];

  for (const qid of qids) {
    const cached = await readCache(qid);
    if (cached) {
      result.set(qid, cached.classes);
    } else {
      toFetch.push(qid);
    }
  }

  if (toFetch.length === 0) return result;

  console.log(chalk.gray(`[wikidata-p31] cache hit ${qids.length - toFetch.length} / fetch ${toFetch.length}`));

  for (let i = 0; i < toFetch.length; i += BATCH_SIZE) {
    const slice = toFetch.slice(i, i + BATCH_SIZE);
    await rateLimit();
    try {
      const batch = await fetchBatch(slice);
      for (const [qid, classes] of batch) {
        result.set(qid, classes);
        await writeCache(qid, classes);
      }
    } catch (err) {
      console.warn(chalk.yellow(`[wikidata-p31] batch failed: ${(err as Error).message}`));
      // Leave these QIDs as unknown — caller must handle missing keys
    }
    if (toFetch.length > BATCH_SIZE) {
      const done = Math.min(i + BATCH_SIZE, toFetch.length);
      console.log(chalk.gray(`[wikidata-p31] ${done}/${toFetch.length} fetched`));
    }
  }

  return result;
}

/** Returns +10 if any P31 class is in the soul-doctrine set, else 0. */
export function p31BonusForClasses(classes: string[] | undefined): number {
  if (!classes || classes.length === 0) return 0;
  for (const c of classes) {
    if (SOUL_DOCTRINE_CLASSES.has(c)) return 10;
  }
  return 0;
}
