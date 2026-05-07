import { promises as fs } from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import chalk from 'chalk';
import { upsertPOIs } from '../lib/upsert.js';
import { classifyPOI } from '../lib/classify-poi.js';
import {
  emptyResult,
  type BoundingBox,
  type ImportOptions,
  type ImportResult,
  type NormalizedPOI,
} from '../lib/types.js';
import { WIKIDATA_CLASSES, CLASS_BY_QID, ALL_QIDS } from '../lib/wikidata-types.js';

export const SOURCE_NAME = 'wikidata' as const;

const SPARQL_ENDPOINT = 'https://query.wikidata.org/sparql';
const WIKIPEDIA_API  = 'https://en.wikipedia.org/api/rest_v1/page/summary';
const USER_AGENT     = 'XRoad-POI-Import/0.1 (johnhollis99@gmail.com)';
const CA_BBOX: BoundingBox = { minLat: 32.5, minLon: -124.5, maxLat: 42.0, maxLon: -114.1 };
const PAGE_SIZE          = 1000;
const SPARQL_INTERVAL_MS = 1000;
const WIKI_INTERVAL_MS   = 1000;

// ---- SPARQL types ----------------------------------------------------------

interface SparqlBinding { type: string; value: string; }

interface SparqlRow {
  item:          SparqlBinding;
  itemLabel:     SparqlBinding;
  coord:         SparqlBinding;
  class:         SparqlBinding;
  enWikiTitle?:  SparqlBinding;
  schemaDesc?:   SparqlBinding;
  image?:        SparqlBinding;
}

interface SparqlResponse {
  results: { bindings: SparqlRow[] };
}

// ---- Aggregated item (one per Q-id) ----------------------------------------

interface ItemData {
  qid:          string;
  label:        string;
  lat:          number;
  lng:          number;
  classQids:    string[];
  enWikiTitle?: string;
  schemaDesc?:  string;
  hasImage:     boolean;
}

// ---- Rate limiters ---------------------------------------------------------

let lastSparqlAt = 0;
let lastWikiAt   = 0;

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

async function sparqlLimit(): Promise<void> {
  const wait = lastSparqlAt + SPARQL_INTERVAL_MS - Date.now();
  if (wait > 0) await sleep(wait);
  lastSparqlAt = Date.now();
}

async function wikiLimit(): Promise<void> {
  const wait = lastWikiAt + WIKI_INTERVAL_MS - Date.now();
  if (wait > 0) await sleep(wait);
  lastWikiAt = Date.now();
}

// ---- SPARQL query builder --------------------------------------------------

function buildQuery(qids: string[], bbox: BoundingBox, offset: number): string {
  const values = qids.map((q) => `wd:${q}`).join(' ');
  // wikibase:box uses the native geospatial index; cornerWest=SW, cornerEast=NE, WKT lon-lat order.
  // geof:latitude/longitude (GeoSPARQL functions) are not supported on Wikidata's Blazegraph.
  return [
    'PREFIX wd:        <http://www.wikidata.org/entity/>',
    'PREFIX wdt:       <http://www.wikidata.org/prop/direct/>',
    'PREFIX wikibase:  <http://wikiba.se/ontology#>',
    'PREFIX bd:        <http://www.bigdata.com/rdf#>',
    'PREFIX schema:    <https://schema.org/>',
    'PREFIX geo:       <http://www.opengis.net/ont/geosparql#>',
    '',
    'SELECT ?item ?itemLabel ?coord ?class ?enWikiTitle ?schemaDesc ?image WHERE {',
    `  VALUES ?class { ${values} }`,
    '  ?item wdt:P31 ?class.',
    '  SERVICE wikibase:box {',
    '    ?item wdt:P625 ?coord.',
    `    bd:serviceParam wikibase:cornerWest "Point(${bbox.minLon} ${bbox.minLat})"^^geo:wktLiteral .`,
    `    bd:serviceParam wikibase:cornerEast "Point(${bbox.maxLon} ${bbox.maxLat})"^^geo:wktLiteral .`,
    '  }',
    '  OPTIONAL { ?item wdt:P18 ?image. }',
    '  OPTIONAL {',
    '    ?enWikiArticle schema:about ?item;',
    '                   schema:isPartOf <https://en.wikipedia.org/>;',
    '                   schema:name ?enWikiTitle.',
    '  }',
    '  OPTIONAL { ?item schema:description ?schemaDesc. FILTER(LANG(?schemaDesc) = "en") }',
    '  SERVICE wikibase:label { bd:serviceParam wikibase:language "en". }',
    '}',
    'ORDER BY ?item',
    `LIMIT ${PAGE_SIZE}`,
    `OFFSET ${offset}`,
  ].join('\n');
}

// ---- Single-page fetch -----------------------------------------------------

interface PageResult {
  bindings:  SparqlRow[];
  timedOut:  boolean;
}

async function fetchPage(
  query:     string,
  cacheFile: string,
  force:     boolean,
): Promise<PageResult> {
  if (!force) {
    try {
      const cached = JSON.parse(await fs.readFile(cacheFile, 'utf8')) as SparqlResponse;
      return { bindings: cached.results.bindings, timedOut: false };
    } catch { /* not cached */ }
  }

  await sparqlLimit();

  const res = await fetch(SPARQL_ENDPOINT, {
    method: 'POST',
    body:   new URLSearchParams({ query }),
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'Accept':       'application/sparql-results+json',
      'User-Agent':   USER_AGENT,
    },
  });

  if (!res.ok) {
    const body = await res.text();
    // 502/503/504 = nginx killed the backend (query too expensive); treat as timeout so
    // the per-class fallback kicks in rather than aborting the whole run.
    if (res.status === 502 || res.status === 503 || res.status === 504) {
      return { bindings: [], timedOut: true };
    }
    if (res.status === 500 && /timeout|TimeoutException/i.test(body)) {
      return { bindings: [], timedOut: true };
    }
    throw new Error(`SPARQL ${res.status}: ${body.slice(0, 300)}`);
  }

  const data = await res.json() as SparqlResponse;
  await fs.writeFile(cacheFile, JSON.stringify(data), 'utf8');
  return { bindings: data.results.bindings, timedOut: false };
}

// ---- Paginated fetch -------------------------------------------------------

interface AllPagesResult {
  rows:     SparqlRow[];
  timedOut: boolean;
}

async function fetchAllPages(
  qids:          string[],
  bbox:          BoundingBox,
  sparqlCacheDir: string,
  prefix:        string,
  force:         boolean,
): Promise<AllPagesResult> {
  const rows: SparqlRow[] = [];
  let page = 0;

  for (;;) {
    const offset    = page * PAGE_SIZE;
    const cacheFile = path.join(sparqlCacheDir, `${prefix}-p${page}.json`);
    const query     = buildQuery(qids, bbox, offset);

    const { bindings, timedOut } = await fetchPage(query, cacheFile, force);
    if (timedOut) return { rows, timedOut: true };

    rows.push(...bindings);
    console.log(chalk.gray(`[wikidata] ${prefix} page ${page + 1}: ${bindings.length} rows`));

    if (bindings.length < PAGE_SIZE) break;
    page++;
  }

  return { rows, timedOut: false };
}

// ---- Coordinate parser (WKT "Point(lon lat)") ------------------------------

function parseCoord(wkt: string): { lat: number; lng: number } | null {
  const m = /Point\(\s*([+-]?\d+\.?\d*)\s+([+-]?\d+\.?\d*)\s*\)/i.exec(wkt);
  if (!m) return null;
  const lngStr = m[1];
  const latStr = m[2];
  if (lngStr == null || latStr == null) return null;
  return { lng: Number(lngStr), lat: Number(latStr) };
}

function extractQid(uri: string): string {
  return uri.split('/').pop() ?? uri;
}

// ---- Batch Wikipedia-title lookup via MediaWiki API (wbgetentities) ---------
// Uses api.php instead of SPARQL — far more permissive rate limits; 50 QIDs per call (hard limit).

const WIKI_TITLE_BATCH       = 50;   // hard wbgetentities limit
const MWAPI_ENDPOINT         = 'https://www.wikidata.org/w/api.php';
const WIKI_TITLE_DELAYS      = [2_000, 4_000, 8_000, 16_000, 32_000] as const;
const WIKI_TITLE_INTER_BATCH = 200;  // ms between batches

interface MwApiResponse {
  entities: Record<string, {
    sitelinks?: { enwiki?: { title: string } };
  }>;
}

function parseMwEntities(data: MwApiResponse): Map<string, string> {
  const out = new Map<string, string>();
  for (const [qid, entity] of Object.entries(data.entities)) {
    const title = entity.sitelinks?.enwiki?.title;
    if (title) out.set(qid, title);
  }
  return out;
}

async function fetchWikiTitleBatch(qids: string[], cacheFile: string): Promise<Map<string, string>> {
  const url = new URL(MWAPI_ENDPOINT);
  url.searchParams.set('action', 'wbgetentities');
  url.searchParams.set('ids', qids.join('|'));
  url.searchParams.set('props', 'sitelinks/urls');
  url.searchParams.set('sitefilter', 'enwiki');
  url.searchParams.set('format', 'json');

  for (let attempt = 0; attempt <= WIKI_TITLE_DELAYS.length; attempt++) {
    const res = await fetch(url.toString(), {
      headers: { 'User-Agent': USER_AGENT },
    });
    if (res.ok) {
      const data = await res.json() as MwApiResponse;
      await fs.writeFile(cacheFile, JSON.stringify(data), 'utf8');
      return parseMwEntities(data);
    }
    if (attempt < WIKI_TITLE_DELAYS.length) {
      const retryAfterHeader = res.headers.get('Retry-After');
      const delay = retryAfterHeader
        ? Number(retryAfterHeader) * 1000
        : WIKI_TITLE_DELAYS[attempt]!;
      console.warn(chalk.yellow(
        `[wikidata] mw-api title batch ${res.status} — retry ${attempt + 1}/${WIKI_TITLE_DELAYS.length} in ${delay / 1000}s`,
      ));
      await sleep(delay);
    } else {
      console.warn(chalk.yellow(
        `[wikidata] mw-api title batch failed after all retries (${res.status}) — continuing with partial results`,
      ));
    }
  }
  return new Map();
}

async function fetchWikiTitles(
  qids:           string[],
  sparqlCacheDir: string,
  bbHash:         string,
  force:          boolean,
): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  for (let i = 0; i < qids.length; i += WIKI_TITLE_BATCH) {
    const batch     = qids.slice(i, i + WIKI_TITLE_BATCH);
    const bHash     = createHash('sha1').update(batch.join(',')).digest('hex').slice(0, 8);
    const cacheFile = path.join(sparqlCacheDir, `api-wt-${bbHash}-${bHash}.json`);
    let batchMap: Map<string, string>;
    if (!force) {
      try {
        const cached = JSON.parse(await fs.readFile(cacheFile, 'utf8')) as MwApiResponse;
        batchMap = parseMwEntities(cached);
      } catch {
        batchMap = await fetchWikiTitleBatch(batch, cacheFile);
      }
    } else {
      batchMap = await fetchWikiTitleBatch(batch, cacheFile);
    }
    for (const [qid, title] of batchMap) out.set(qid, title);
    if (i + WIKI_TITLE_BATCH < qids.length) await sleep(WIKI_TITLE_INTER_BATCH);
  }
  return out;
}

// ---- Accumulate rows by Q-id -----------------------------------------------

function accumulateRows(bindings: SparqlRow[]): Map<string, ItemData> {
  const items = new Map<string, ItemData>();

  for (const row of bindings) {
    const qid    = extractQid(row.item.value);
    const coords = parseCoord(row.coord.value);
    if (!coords) continue;

    const classQid = extractQid(row.class.value);
    const existing = items.get(qid);

    if (existing) {
      if (!existing.classQids.includes(classQid)) existing.classQids.push(classQid);
      if (row.enWikiTitle && !existing.enWikiTitle) existing.enWikiTitle = row.enWikiTitle.value;
      if (row.schemaDesc  && !existing.schemaDesc)  existing.schemaDesc  = row.schemaDesc.value;
      if (row.image) existing.hasImage = true;
    } else {
      items.set(qid, {
        qid,
        label:       row.itemLabel.value,
        lat:         coords.lat,
        lng:         coords.lng,
        classQids:   [classQid],
        enWikiTitle: row.enWikiTitle?.value,
        schemaDesc:  row.schemaDesc?.value,
        hasImage:    !!row.image,
      });
    }
  }

  return items;
}

// ---- Best class (WIKIDATA_CLASSES is bonus-desc, first match wins) ----------

function bestClass(item: ItemData) {
  for (const cls of WIKIDATA_CLASSES) {
    if (item.classQids.includes(cls.qid)) return cls;
  }
  return null;
}

// ---- Significance ----------------------------------------------------------

function wikidataSignificance(item: ItemData): number {
  let s = 0;
  if (item.enWikiTitle) s += 0.25;
  if (item.hasImage)    s += 0.05;

  let bestBonus = 0;
  for (const qid of item.classQids) {
    const cls = CLASS_BY_QID.get(qid);
    if (cls && cls.bonus > bestBonus) bestBonus = cls.bonus;
  }
  s += bestBonus / 100;

  return Math.min(1.0, s);
}

// ---- Wikipedia lead extract ------------------------------------------------

async function fetchWikipediaSummary(
  title:    string,
  wikiDir:  string,
  force:    boolean,
): Promise<string | null> {
  const hash      = createHash('sha1').update(title).digest('hex').slice(0, 16);
  const cacheFile = path.join(wikiDir, `${hash}.json`);

  if (!force) {
    try {
      const cached = JSON.parse(await fs.readFile(cacheFile, 'utf8')) as { extract: string | null };
      return cached.extract;
    } catch { /* not cached */ }
  }

  await wikiLimit();

  const encoded = encodeURIComponent(title.replace(/ /g, '_'));
  const res = await fetch(`${WIKIPEDIA_API}/${encoded}`, {
    headers: { 'User-Agent': USER_AGENT, Accept: 'application/json' },
  });

  if (res.status === 404) {
    await fs.writeFile(cacheFile, JSON.stringify({ extract: null }), 'utf8');
    return null;
  }
  if (!res.ok) {
    console.warn(chalk.yellow(`[wikidata] Wikipedia ${res.status} for "${title}"`));
    return null;
  }

  const data     = await res.json() as { extract?: string };
  const extract  = data.extract ?? null;
  await fs.writeFile(cacheFile, JSON.stringify({ extract }), 'utf8');
  return extract;
}

// ---- Normalize a single item to NormalizedPOI ------------------------------

function normalizeItem(item: ItemData, description: string | null): NormalizedPOI | null {
  const cls = bestClass(item);
  if (!cls) return null;

  const wikiTitle = item.enWikiTitle;
  const citation  = wikiTitle
    ? `https://en.wikipedia.org/wiki/${encodeURIComponent(wikiTitle.replace(/ /g, '_'))}`
    : `https://www.wikidata.org/wiki/${item.qid}`;

  const poi: NormalizedPOI = {
    name:              item.label,
    category_slug:     cls.slug,
    lat:               item.lat,
    lng:               item.lng,
    tags:              cls.tags,
    significance_score: wikidataSignificance(item),
    trip_mode:         cls.tripMode,
    source_type:       'wikidata',
    source_id:         item.qid,
    source_citation:   citation,
    confidence_score:  1.0,
    verified:          true,
    description:       description ?? item.schemaDesc ?? null,
  };

  const venueDetect = classifyPOI(poi, { wikidata_p31: item.classQids });
  if (venueDetect.is_venue) {
    poi.tags = [...poi.tags, 'venue-candidate', `venue-type:${venueDetect.venue_type}`];
  }

  return poi;
}

// ---- Main ------------------------------------------------------------------

export async function runImport(opts: ImportOptions): Promise<ImportResult> {
  const start  = Date.now();
  const result = emptyResult(SOURCE_NAME);

  const bbox = opts.bbox ?? CA_BBOX;
  if (!opts.bbox) {
    if (opts.county) {
      console.log(chalk.yellow(`[wikidata] county filtering is not supported — using California bbox`));
    } else {
      console.log(chalk.cyan('[wikidata] defaulting to California bbox'));
    }
  }
  console.log(chalk.cyan(
    `[wikidata] bbox ${bbox.minLat},${bbox.minLon} → ${bbox.maxLat},${bbox.maxLon}  (${ALL_QIDS.length} classes)`,
  ));

  const sparqlCacheDir = path.join(opts.cacheDir, 'wikidata-sparql');
  const wikiCacheDir   = path.join(opts.cacheDir, 'wikipedia');
  await fs.mkdir(sparqlCacheDir, { recursive: true });
  await fs.mkdir(wikiCacheDir,   { recursive: true });

  // 1. Fetch SPARQL rows — combined first, per-class on timeout ---------------

  const bbHash  = createHash('sha1')
    .update(`${bbox.minLat},${bbox.minLon},${bbox.maxLat},${bbox.maxLon}`)
    .digest('hex').slice(0, 8);

  let allRows: SparqlRow[];

  console.log(chalk.cyan(`[wikidata] combined SPARQL query (bbox=${bbHash})…`));
  const combined = await fetchAllPages(
    ALL_QIDS, bbox, sparqlCacheDir, `all-${bbHash}`, opts.force,
  );

  if (combined.timedOut) {
    console.warn(chalk.yellow('[wikidata] combined query timed out — switching to per-class'));
    allRows = [];
    for (const cls of WIKIDATA_CLASSES) {
      console.log(chalk.gray(`[wikidata] class ${cls.qid} (${cls.label})…`));
      try {
        const { rows } = await fetchAllPages(
          [cls.qid], bbox, sparqlCacheDir, `${cls.qid}-${bbHash}`, opts.force,
        );
        allRows.push(...rows);
      } catch (err) {
        console.error(chalk.red(`[wikidata] class ${cls.qid} failed: ${err}`));
        result.errors++;
      }
    }
  } else {
    allRows = combined.rows;
  }

  result.fetched = allRows.length;
  console.log(chalk.cyan(`[wikidata] ${result.fetched} raw SPARQL rows`));

  // 2. Aggregate by Q-id -------------------------------------------------------

  const items = accumulateRows(allRows);
  console.log(chalk.cyan(`[wikidata] ${items.size} unique items`));

  // wikibase:box blocks the sitelinks graph — fetch Wikipedia titles in a separate query
  const allQids    = [...items.keys()];
  const wikiTitles = await fetchWikiTitles(allQids, sparqlCacheDir, bbHash, opts.force);
  console.log(chalk.cyan(`[wikidata] ${wikiTitles.size} items have English Wikipedia articles`));
  for (const [qid, title] of wikiTitles) {
    const item = items.get(qid);
    if (item && !item.enWikiTitle) item.enWikiTitle = title;
  }

  // 3. Fetch Wikipedia lead extracts ------------------------------------------

  const wikiItems = [...items.values()].filter((i) => !!i.enWikiTitle);
  console.log(chalk.cyan(`[wikidata] fetching ${wikiItems.length} Wikipedia summaries…`));

  const descriptions = new Map<string, string | null>();
  let wikiFetched = 0;

  for (const item of wikiItems) {
    const title = item.enWikiTitle;
    if (!title) continue;
    try {
      const extract = await fetchWikipediaSummary(title, wikiCacheDir, opts.force);
      descriptions.set(item.qid, extract);
      wikiFetched++;
      if (wikiFetched % 100 === 0) {
        console.log(chalk.gray(`[wikidata] Wikipedia summaries: ${wikiFetched}/${wikiItems.length}`));
      }
    } catch (err) {
      console.warn(chalk.yellow(`[wikidata] Wikipedia fetch failed for "${title}": ${err}`));
      result.errors++;
    }
  }

  console.log(chalk.cyan(`[wikidata] fetched ${wikiFetched} Wikipedia summaries`));

  // 4. Normalize ---------------------------------------------------------------

  let noClass = 0;
  const pois: NormalizedPOI[] = [];

  for (const item of items.values()) {
    const desc = descriptions.get(item.qid) ?? null;
    const poi  = normalizeItem(item, desc);
    if (!poi) { noClass++; continue; }
    pois.push(poi);
  }

  result.normalized = pois.length;
  console.log(chalk.cyan(
    `[wikidata] ${result.normalized} normalized | skipped: no-class=${noClass}`,
  ));

  // 5. Apply limit & upsert ----------------------------------------------------

  const toUpsert     = opts.limit != null ? pois.slice(0, opts.limit) : pois;
  const limitTrimmed = pois.length - toUpsert.length;

  const outcome = await upsertPOIs(toUpsert, { dryRun: opts.dryRun });
  result.inserted  = outcome.inserted;
  result.updated   = outcome.updated;
  result.skipped   = noClass + outcome.skipped + limitTrimmed;
  result.errors   += outcome.errors;
  result.durationMs = Date.now() - start;

  // 6. JSON summary ------------------------------------------------------------

  const ts          = new Date().toISOString().replace(/[:.]/g, '-');
  const summaryPath = path.join(opts.cacheDir, `wikidata-${ts}.json`);
  await fs.writeFile(summaryPath, JSON.stringify({
    timestamp: new Date().toISOString(),
    bbox,
    sparqlRows: result.fetched,
    uniqueItems: items.size,
    wikipediaSummariesFetched: wikiFetched,
    pois: {
      normalized: result.normalized,
      inserted:   result.inserted,
      updated:    result.updated,
      skipped: {
        total:         result.skipped,
        breakdown: {
          noClass,
          upsertSkipped: outcome.skipped,
          limitTrimmed,
        },
      },
      errors: result.errors,
    },
    elapsedMs: result.durationMs,
  }, null, 2), 'utf8');

  console.log(chalk.green(
    `[wikidata] done in ${(result.durationMs / 1000).toFixed(1)}s — summary: ${summaryPath}`,
  ));
  return result;
}
