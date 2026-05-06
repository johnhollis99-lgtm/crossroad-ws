import { promises as fs } from 'node:fs';
import path from 'node:path';
import chalk from 'chalk';
import { geocodeOne } from '../lib/geocode.js';
import { upsertPOIs } from '../lib/upsert.js';
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
  const m = /class="geo"[^>]*>([\d.+-]+);([\d.+-]+)/.exec(cellHtml);
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

function parseWikiHtml(html: string): ChlEntry[] {
  const entries: ChlEntry[] = [];
  let currentCounty = 'Unknown';
  let i = 0;

  while (i < html.length) {
    const h2Start    = html.indexOf('<h2', i);
    const tableStart = findNextWikitable(html, i);

    if (h2Start === -1 && tableStart === -1) break;

    const takeH2 = h2Start !== -1 && (tableStart === -1 || h2Start < tableStart);

    if (takeH2) {
      const h2End = html.indexOf('</h2>', h2Start);
      if (h2End === -1) { i = html.length; continue; }
      const h2Text = stripTags(html.slice(h2Start, h2End + 5));
      if (h2Text && h2Text !== 'Contents' && h2Text !== 'References') {
        currentCounty = h2Text;
      }
      i = h2End + 5;
    } else {
      const tableEnd = findTableEnd(html, tableStart);
      if (tableEnd === -1) { i = html.length; continue; }
      const tableHtml = html.slice(tableStart, tableEnd);

      const trRe = /<tr(?:\s[^>]*)?>(?:\s*)([\s\S]*?)(?:\s*)<\/tr>/gi;
      let trMatch: RegExpExecArray | null;
      while ((trMatch = trRe.exec(tableHtml)) !== null) {
        const rowHtml = trMatch[1]!;
        // Skip header rows (contain <th> cells)
        if (/<th[\s>]/i.test(rowHtml)) continue;

        const cells = parseTdCells(rowHtml);
        if (cells.length < 2) continue;

        // Cell 0: CHL number (1–1500)
        const numText = stripTags(cells[0]!).replace(/,/g, '').trim();
        const num = parseInt(numText, 10);
        if (isNaN(num) || num < 1 || num > 1500) continue;

        // Cell 1: landmark name
        const nameCell = cells[1]!;
        const name = stripTags(nameCell).replace(/\[[\d\s]*\]/g, '').trim();
        if (!name || name.length > 250) continue;

        const wikiPath = extractWikiPath(nameCell);

        // Scan remaining cells for embedded geo coordinates
        let geo: { lat: number; lng: number } | null = null;
        let locationText = '';
        let descText: string | null = null;

        for (let ci = 2; ci < cells.length; ci++) {
          const g = extractGeo(cells[ci]!);
          if (g) {
            geo          = g;
            locationText = stripTags(cells[ci]!);
            // Collect all subsequent cells as description text
            const parts: string[] = [];
            for (let di = ci + 1; di < cells.length; di++) {
              const t = stripTags(cells[di]!).replace(/\[[\d\s]*\]/g, '').trim();
              if (t) parts.push(t);
            }
            descText = parts.join(' ') || null;
            break;
          }
        }

        // No embedded geo: assume last cell = description, second-to-last = location
        if (geo === null && cells.length >= 3) {
          locationText = stripTags(cells[cells.length - 2]!);
          descText     = stripTags(cells[cells.length - 1]!).replace(/\[[\d\s]*\]/g, '').trim() || null;
        }

        entries.push({
          number: num,
          name,
          county:      currentCounty,
          lat:         geo?.lat ?? null,
          lng:         geo?.lng ?? null,
          description: descText,
          locationText,
          wikiPath,
        });
      }

      i = tableEnd;
    }
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

  // 1. Fetch Wikipedia article ------------------------------------------------

  const cacheFile = path.join(chlCacheDir, 'chl-list.html');
  let html: string;
  try {
    html = await fetchWithCache(WIKI_LIST_URL, cacheFile, opts.force);
  } catch (err) {
    console.error(chalk.red(`[ca-landmarks] fetch failed: ${err}`));
    result.errors++;
    result.durationMs = Date.now() - start;
    return result;
  }

  // 2. Parse tables from Wikipedia HTML --------------------------------------

  let entries: ChlEntry[];
  try {
    entries = parseWikiHtml(html);
  } catch (err) {
    console.error(chalk.red(`[ca-landmarks] parse failed: ${err}`));
    result.errors++;
    result.durationMs = Date.now() - start;
    return result;
  }

  // Dedup by CHL number (should be unique, but guard in case of parse artifacts)
  const seen = new Map<number, ChlEntry>();
  for (const e of entries) {
    if (!seen.has(e.number)) seen.set(e.number, e);
  }
  entries = [...seen.values()].sort((a, b) => a.number - b.number);

  if (opts.county) {
    const target = opts.county.toLowerCase();
    entries = entries.filter((e) => e.county.toLowerCase().includes(target));
    console.log(chalk.cyan(`[ca-landmarks] county filter "${opts.county}": ${entries.length} entries`));
  }

  result.fetched = entries.length;
  console.log(chalk.cyan(`[ca-landmarks] parsed ${result.fetched} CHL entries`));

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

    pois.push({
      name:               entry.name,
      category_slug:      slug,
      lat,
      lng,
      tags:               [sourceId.toLowerCase(), ...tags],
      significance_score: BASE_SIGNIFICANCE,
      trip_mode:          'all',
      source_type:        'state_landmark',
      source_id:          sourceId,
      source_citation:    citation,
      confidence_score:   1.0,
      verified:           true,
      description:        entry.description,
    });
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
    timestamp:  new Date().toISOString(),
    sourceUrl:  WIKI_LIST_URL,
    fetched:    result.fetched,
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
