import { promises as fs } from 'node:fs';
import path from 'node:path';
import chalk from 'chalk';
import { geocodeOne } from '../lib/geocode.js';
import { upsertPOIs } from '../lib/upsert.js';
import { classifyPOI } from '../lib/classify-poi.js';
import {
  emptyResult,
  type CategorySlug,
  type ImportOptions,
  type ImportResult,
  type NormalizedPOI,
} from '../lib/types.js';

export const SOURCE_NAME = 'state_landmark' as const;

const USER_AGENT      = 'XRoad-POI-Import/0.1 (johnhollis99@gmail.com)';
const CACHE_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;

// Wikipedia "List of California Historical Landmarks" — one page, all 1100+ CHLs
const WIKI_LIST_URL = 'https://en.wikipedia.org/wiki/List_of_California_Historical_Landmarks';

// Base significance for any California Historical Landmark (+0.05 added later by dedup if also NRHP-listed)
const BASE_SIGNIFICANCE = 0.25;

// ---- Parsed entry -----------------------------------------------------------

interface ChlEntry {
  number:       number;
  name:         string;
  county:       string;
  lat:          number | null;
  lng:          number | null;
  description:  string | null;
  locationText: string;
  wikiPath:     string | null;
}

// ---- Category classifier ----------------------------------------------------

const KEYWORD_RULES: Array<{ re: RegExp; slug: CategorySlug; tags: string[] }> = [
  { re: /\bmission\b/i,
    slug: 'history',      tags: ['mission', 'spanish_colonial'] },
  { re: /\b(rancho|adobe|hacienda|rancheria)\b/i,
    slug: 'history',      tags: ['rancho'] },
  { re: /\b(gold\s*rush|mining|miner|stamp\s*mill|placer|lode)\b/i,
    slug: 'history',      tags: ['gold_rush'] },
  { re: /\b(native american|miwok|ohlone|chumash|pomo|yokuts|maidu|wintu|kumeyaay|luisen[oõ]|cahuilla|tongva|indian village|tribal)\b/i,
    slug: 'history',      tags: ['indigenous'] },
  { re: /\b(lighthouse|presidio|\bfort\b|military|battle|war|barracks|arsenal)\b/i,
    slug: 'history',      tags: ['military'] },
  { re: /\b(church|chapel|cathedral|synagogue|temple|mosque)\b/i,
    slug: 'architecture', tags: ['religious'] },
  { re: /\b(courthouse|capitol|statehouse|city\s*hall|hall\s*of\s*records)\b/i,
    slug: 'architecture', tags: ['government'] },
  { re: /\b(theater|theatre|opera|museum|gallery)\b/i,
    slug: 'art',          tags: ['cultural'] },
  { re: /\b(geyser|hot\s*spring|volcanic|lava\b|cave|geological|fossil|mineral\s*spring)\b/i,
    slug: 'geology',      tags: ['geological'] },
  { re: /\b(redwood|sequoia|giant\s*tree|grove|forest|wildlife|nature)\b/i,
    slug: 'nature',       tags: ['natural'] },
];

function classifyChl(name: string, desc: string | null): { slug: CategorySlug; tags: string[] } {
  const text = `${name} ${desc ?? ''}`;
  for (const { re, slug, tags } of KEYWORD_RULES) {
    if (re.test(text)) return { slug, tags };
  }
  return { slug: 'history', tags: ['state_landmark'] };
}

// ---- HTML utilities ---------------------------------------------------------

function decodeEntities(s: string): string {
  return s
    .replace(/&amp;/g,  '&')
    .replace(/&lt;/g,   '<')
    .replace(/&gt;/g,   '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g,  "'")
    .replace(/&apos;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/&#(\d+);/gi,    (_, n: string) => String.fromCharCode(parseInt(n, 10)))
    .replace(/&#x([0-9a-f]+);/gi, (_, h: string) => String.fromCharCode(parseInt(h, 16)));
}

function stripTags(html: string): string {
  return decodeEntities(html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim());
}

// Wikipedia renders {{Coord|...}} as <span class="geo">lat;lon</span>
function extractGeo(cellHtml: string): { lat: number; lng: number } | null {
  const m = /class="geo"[^>]*>([\d.+-]+);\s*([\d.+-]+)/.exec(cellHtml);
  if (!m) return null;
  const lat = parseFloat(m[1]!);
  const lng = parseFloat(m[2]!);
  return isFinite(lat) && isFinite(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180
    ? { lat, lng }
    : null;
}

function extractWikiPath(cellHtml: string): string | null {
  const m = /href="(\/wiki\/[^"#]+)"/.exec(cellHtml);
  return m ? m[1]! : null;
}

// ---- Table parser -----------------------------------------------------------

function parseTdCells(rowHtml: string): string[] {
  const cells: string[] = [];
  const re = /<td(?:\s[^>]*)?>(?:\s*)([\s\S]*?)(?:\s*)<\/td>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(rowHtml)) !== null) cells.push(m[1]!);
  return cells;
}

// Find the index just past the </table> that matches the <table> at `start`.
function findTableEnd(html: string, start: number): number {
  let depth = 0;
  let i = start;
  while (i < html.length) {
    if (html.startsWith('<table', i)) { depth++; i += 6; }
    else if (html.startsWith('</table>', i)) { depth--; if (depth === 0) return i + 8; i += 8; }
    else { i++; }
  }
  return -1; // unmatched
}

// Find the next wikitable starting at or after `from`.
function findNextWikitable(html: string, from: number): number {
  let p = html.indexOf('<table', from);
  while (p !== -1) {
    const tagEnd = html.indexOf('>', p);
    if (tagEnd === -1) break;
    if (/class="[^"]*wikitable/.test(html.slice(p, tagEnd + 1))) return p;
    p = html.indexOf('<table', p + 1);
  }
  return -1;
}

// ---- Helpers for per-county fetch strategy ----------------------------------

const sleep = (ms: number): Promise<void> =>
  new Promise(resolve => setTimeout(resolve, ms));

async function isCached(cacheFile: string): Promise<boolean> {
  try {
    const meta = JSON.parse(
      await fs.readFile(`${cacheFile}.meta.json`, 'utf8'),
    ) as CacheMeta;
    return Date.now() - meta.fetchedAt < CACHE_MAX_AGE_MS;
  } catch { return false; }
}

function extractCountyUrls(html: string): string[] {
  const re = /href="(\/wiki\/California_Historical_Landmarks_in_[^"#]+)"/g;
  const seen = new Set<string>();
  const urls: string[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null) {
    const p = m[1]!;
    if (!seen.has(p)) {
      seen.add(p);
      urls.push(`https://en.wikipedia.org${p}`);
    }
  }
  return urls;
}

function countySlugFromUrl(url: string): string {
  const m = /California_Historical_Landmarks_in_(.+)$/.exec(url);
  if (!m) return 'unknown';
  return m[1]!.replace(/_County$/i, '').replace(/_/g, '-').toLowerCase();
}

function countyNameFromUrl(url: string): string {
  const m = /California_Historical_Landmarks_in_(.+)$/.exec(url);
  if (!m) return 'Unknown';
  return m[1]!.replace(/_County$/i, '').replace(/_/g, ' ');
}

// ---- Per-county table parser ------------------------------------------------
// County sub-article columns: Image | Name | CHL# | Location+geo | City | Summary
// The CHL# is not always cells[0], so we scan the first 4 cells for a valid number.
function parseCountyHtml(html: string, countyName: string): ChlEntry[] {
  const entries: ChlEntry[] = [];

  let tableStart = findNextWikitable(html, 0);
  while (tableStart !== -1) {
    const tableEnd = findTableEnd(html, tableStart);
    if (tableEnd === -1) break;
    const tableHtml = html.slice(tableStart, tableEnd);

    const trRe = /<tr(?:\s[^>]*)?>(?:\s*)([\s\S]*?)(?:\s*)<\/tr>/gi;
    let trMatch: RegExpExecArray | null;
    while ((trMatch = trRe.exec(tableHtml)) !== null) {
      const rowHtml = trMatch[1]!;
      const hasTd = /<td[\s>]/i.test(rowHtml);
      if (!hasTd) continue;

      const cells = parseTdCells(rowHtml);
      if (cells.length < 3) continue;

      // CHL number is in a <th> cell (yellow badge), not a <td>
      const chlMatch = /<th[^>]*>\s*<small>(\d+)<\/small>\s*<\/th>/i.exec(rowHtml);
      if (!chlMatch) continue;
      const num = parseInt(chlMatch[1]!, 10);
      if (isNaN(num) || num < 1 || num > 1500) continue;

      // Name cell: first cell containing a /wiki/ link
      let nameCell = '';
      let nameCellIdx = -1;
      for (let ci = 0; ci < cells.length; ci++) {
        if (/href="\/wiki\/[^"#]+"/.test(cells[ci]!)) {
          nameCell = cells[ci]!;
          nameCellIdx = ci;
          break;
        }
      }
      if (!nameCell) continue;

      const name = stripTags(nameCell).replace(/\[[\d\s]*\]/g, '').trim();
      if (!name || name.length > 250) continue;

      const wikiPath = extractWikiPath(nameCell);

      // Scan remaining cells for embedded geo coordinates
      let geo: { lat: number; lng: number } | null = null;
      let locationText = '';
      let descText: string | null = null;

      for (let ci = 0; ci < cells.length; ci++) {
        if (ci === nameCellIdx) continue;
        const g = extractGeo(cells[ci]!);
        if (g) {
          geo = g;
          locationText = stripTags(cells[ci]!);
          const parts: string[] = [];
          for (let di = ci + 1; di < cells.length; di++) {
            if (di === nameCellIdx) continue;
            const t = stripTags(cells[di]!).replace(/\[[\d\s]*\]/g, '').trim();
            if (t) parts.push(t);
          }
          descText = parts.join(' ') || null;
          break;
        }
      }

      // No embedded geo: last remaining cell = description, second-to-last = location
      if (geo === null) {
        const rest = cells
          .map((c, i) => ({ c, i }))
          .filter(({ i }) => i !== nameCellIdx);
        if (rest.length >= 2) {
          locationText = stripTags(rest[rest.length - 2]!.c);
          descText = stripTags(rest[rest.length - 1]!.c)
            .replace(/\[[\d\s]*\]/g, '').trim() || null;
        } else if (rest.length === 1) {
          descText = stripTags(rest[0]!.c).replace(/\[[\d\s]*\]/g, '').trim() || null;
        }
      }

      entries.push({
        number: num,
        name,
        county: countyName,
        lat: geo?.lat ?? null,
        lng: geo?.lng ?? null,
        description: descText,
        locationText,
        wikiPath,
      });
    }

    tableStart = findNextWikitable(html, tableEnd);
  }

  return entries;
}

// ---- HTTP fetch + 30-day cache ----------------------------------------------

interface CacheMeta { fetchedAt: number; url: string; byteLength: number; }

async function fetchWithCache(url: string, cacheFile: string, force: boolean): Promise<string> {
  const metaFile = `${cacheFile}.meta.json`;

  if (!force) {
    try {
      const meta  = JSON.parse(await fs.readFile(metaFile, 'utf8')) as CacheMeta;
      const ageMs = Date.now() - meta.fetchedAt;
      if (ageMs < CACHE_MAX_AGE_MS) {
        console.log(chalk.gray(
          `[ca-landmarks] cached HTML (${Math.floor(ageMs / 86_400_000)}d old)`,
        ));
        return fs.readFile(cacheFile, 'utf8');
      }
    } catch { /* not cached or stale */ }
  }

  console.log(chalk.cyan(`[ca-landmarks] fetching ${url}…`));
  const res = await fetch(url, {
    headers: { 'User-Agent': USER_AGENT, 'Accept': 'text/html,application/xhtml+xml' },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} from ${url}`);

  const html = await res.text();
  await fs.mkdir(path.dirname(cacheFile), { recursive: true });
  await fs.writeFile(cacheFile, html, 'utf8');
  const meta: CacheMeta = { fetchedAt: Date.now(), url, byteLength: html.length };
  await fs.writeFile(metaFile, JSON.stringify(meta, null, 2), 'utf8');
  console.log(chalk.gray(`[ca-landmarks] fetched ${html.length.toLocaleString()} chars`));
  return html;
}

// ---- Geocoding fallback for entries without embedded coordinates -------------

async function resolveCoords(
  entry:    ChlEntry,
  cacheDir: string,
): Promise<{ lat: number; lng: number } | null> {
  const queries: string[] = [];

  if (entry.county !== 'Unknown') {
    queries.push(`${entry.name}, ${entry.county}, California, USA`);
  }
  queries.push(`${entry.name}, California, USA`);

  // If location text looks like an address (not numeric coords), try it too
  if (entry.locationText && entry.locationText.length > 5 && !/^\d{1,3}\.\d/.test(entry.locationText)) {
    const loc = entry.county !== 'Unknown'
      ? `${entry.locationText}, ${entry.county}, California, USA`
      : `${entry.locationText}, California, USA`;
    queries.push(loc);
  }

  for (const query of queries) {
    const geo = await geocodeOne(query, { cacheDir, countrycodes: 'us' });
    if (geo) return { lat: geo.lat, lng: geo.lng };
  }
  return null;
}

// ---- Main -------------------------------------------------------------------

export async function runImport(opts: ImportOptions): Promise<ImportResult> {
  const start  = Date.now();
  const result = emptyResult(SOURCE_NAME);

  const chlCacheDir = path.join(opts.cacheDir, 'ca-landmarks');
  await fs.mkdir(chlCacheDir, { recursive: true });

  // 1. Fetch hub page to discover per-county article links --------------------

  const hubCacheFile = path.join(chlCacheDir, 'chl-list.html');
  let hubHtml: string;
  try {
    hubHtml = await fetchWithCache(WIKI_LIST_URL, hubCacheFile, opts.force);
  } catch (err) {
    console.error(chalk.red(`[ca-landmarks] hub fetch failed: ${err}`));
    result.errors++;
    result.durationMs = Date.now() - start;
    return result;
  }

  const countyUrls = extractCountyUrls(hubHtml);
  if (countyUrls.length === 0) {
    console.error(chalk.red(`[ca-landmarks] no county article links found in hub page`));
    result.errors++;
    result.durationMs = Date.now() - start;
    return result;
  }
  console.log(chalk.cyan(`[ca-landmarks] found ${countyUrls.length} county article links`));

  // 2. Fetch + parse each county article (1 req/sec, 30-day cache) -----------

  const allEntries: ChlEntry[] = [];
  let countiesProcessed = 0;
  let didFetch = false;

  for (let ci = 0; ci < countyUrls.length; ci++) {
    const countyUrl  = countyUrls[ci]!;
    const slug       = countySlugFromUrl(countyUrl);
    const countyName = countyNameFromUrl(countyUrl);

    if (opts.county && !countyName.toLowerCase().includes(opts.county.toLowerCase())) continue;

    const countyCacheFile = path.join(chlCacheDir, `county-${slug}.html`);
    const needsFetch = opts.force || !(await isCached(countyCacheFile));
    if (needsFetch && didFetch) await sleep(1000);

    let countyHtml: string;
    try {
      countyHtml = await fetchWithCache(countyUrl, countyCacheFile, opts.force);
      if (needsFetch) didFetch = true;
    } catch (err) {
      console.warn(chalk.yellow(`[ca-landmarks] fetch failed for ${countyName}: ${err}`));
      result.errors++;
      continue;
    }

    const countyEntries = parseCountyHtml(countyHtml, countyName);
    console.log(chalk.gray(`[ca-landmarks] ${countyName}: ${countyEntries.length} landmarks`));
    allEntries.push(...countyEntries);
    countiesProcessed++;
  }

  console.log(chalk.cyan(
    `[ca-landmarks] ${countiesProcessed} counties processed, ` +
    `${allEntries.length} total landmarks parsed`,
  ));

  // Dedup by CHL number (same landmark may appear on multiple county pages)
  const seen = new Map<number, ChlEntry>();
  for (const e of allEntries) {
    if (!seen.has(e.number)) seen.set(e.number, e);
  }
  const entries = [...seen.values()].sort((a, b) => a.number - b.number);

  result.fetched = entries.length;
  console.log(chalk.cyan(`[ca-landmarks] ${result.fetched} unique CHL entries after dedup`));

  // 3. Geocode missing coords + normalize ------------------------------------

  const pois: NormalizedPOI[] = [];
  let geoEmbedded = 0;
  let geoFetched  = 0;
  let geoMiss     = 0;
  let bboxSkip    = 0;

  for (let idx = 0; idx < entries.length; idx++) {
    const entry = entries[idx]!;

    if (opts.limit != null && pois.length >= opts.limit) break;

    if ((idx + 1) % 100 === 0) {
      console.log(chalk.gray(
        `[ca-landmarks] ${idx + 1}/${result.fetched}` +
        ` embedded=${geoEmbedded} geocoded=${geoFetched} miss=${geoMiss}`,
      ));
    }

    let lat = entry.lat;
    let lng = entry.lng;

    if (lat !== null && lng !== null) {
      geoEmbedded++;
    } else {
      let coords: { lat: number; lng: number } | null = null;
      try {
        coords = await resolveCoords(entry, opts.cacheDir);
      } catch (err) {
        console.warn(chalk.yellow(`[ca-landmarks] geocode error for CHL-${entry.number}: ${err}`));
        result.errors++;
      }
      if (!coords) {
        geoMiss++;
        console.log(chalk.gray(`[ca-landmarks] no coords — skip CHL-${entry.number} "${entry.name}"`));
        continue;
      }
      lat = coords.lat;
      lng = coords.lng;
      geoFetched++;
    }

    if (opts.bbox) {
      const { minLat, maxLat, minLon, maxLon } = opts.bbox;
      if (lat < minLat || lat > maxLat || lng < minLon || lng > maxLon) {
        bboxSkip++;
        continue;
      }
    }

    const { slug, tags } = classifyChl(entry.name, entry.description);
    const sourceId = `CHL-${entry.number}`;

    // Prefer the individual landmark's Wikipedia article; fall back to the list page
    const citation = entry.wikiPath
      ? `https://en.wikipedia.org${entry.wikiPath}`
      : `${WIKI_LIST_URL}#${encodeURIComponent(entry.county.replace(/\s+/g, '_'))}`;

    const poi: NormalizedPOI = {
      name:               entry.name,
      category_slug:      slug,
      lat,
      lng,
      tags:               [sourceId.toLowerCase(), ...tags],
      significance_score: BASE_SIGNIFICANCE + (entry.wikiPath ? 0.05 : 0),
      trip_mode:          'all',
      source_type:        'state_landmark',
      source_id:          sourceId,
      source_citation:    citation,
      confidence_score:   1.0,
      verified:           true,
      description:        entry.description,
    };
    // No venue-detecting signals at CHL row level — call exists as a hook;
    // venue/parent assignment is handled by classify-children.ts.
    classifyPOI(poi);
    pois.push(poi);
  }

  result.normalized = pois.length;
  console.log(chalk.cyan(
    `[ca-landmarks] ${result.normalized} normalized` +
    ` | coords: embedded=${geoEmbedded} geocoded=${geoFetched} miss=${geoMiss}` +
    (bboxSkip ? ` bbox-skip=${bboxSkip}` : ''),
  ));

  // 4. Upsert ----------------------------------------------------------------

  const outcome   = await upsertPOIs(pois, { dryRun: opts.dryRun });
  result.inserted  = outcome.inserted;
  result.updated   = outcome.updated;
  result.skipped   = geoMiss + bboxSkip + outcome.skipped;
  result.errors   += outcome.errors;
  result.durationMs = Date.now() - start;

  // 5. Summary JSON ----------------------------------------------------------

  const ts          = new Date().toISOString().replace(/[:.]/g, '-');
  const summaryPath = path.join(opts.cacheDir, `ca-landmarks-${ts}.json`);
  await fs.writeFile(summaryPath, JSON.stringify({
    timestamp:         new Date().toISOString(),
    sourceUrl:         WIKI_LIST_URL,
    countyArticles:    countyUrls.length,
    countiesProcessed,
    fetched:           result.fetched,
    coords: {
      embedded:  geoEmbedded,
      geocoded:  geoFetched,
      miss:      geoMiss,
      bboxSkip,
    },
    pois: {
      normalized: result.normalized,
      inserted:   result.inserted,
      updated:    result.updated,
      skipped:    result.skipped,
      errors:     result.errors,
    },
    elapsedMs: result.durationMs,
  }, null, 2), 'utf8');

  console.log(chalk.green(
    `[ca-landmarks] done in ${(result.durationMs / 1000).toFixed(1)}s — summary: ${summaryPath}`,
  ));
  return result;
}
