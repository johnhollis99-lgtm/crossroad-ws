import { promises as fs } from 'node:fs';
import path from 'node:path';
import chalk from 'chalk';
import * as XLSX from 'xlsx';
import {
  fetchNrhpCoordinates,
  nrhpAssetDetailUrl,
  type NrhpResult,
} from '../lib/nrhp-arcgis.js';
import { upsertPOIs } from '../lib/upsert.js';
import { classifyPOI } from '../lib/classify-poi.js';
import {
  emptyResult,
  type CategorySlug,
  type ImportOptions,
  type ImportResult,
  type NormalizedPOI,
} from '../lib/types.js';

export const SOURCE_NAME = 'nrhp' as const;

const NPS_PAGE_URL    = 'https://www.nps.gov/subjects/nationalregister/data-downloads.htm';
const CACHE_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000; // 30 days
const USER_AGENT      = 'XRoad-POI-Import/0.1 (johnhollis99@gmail.com)';

// ---- Resource Type → CategorySlug ------------------------------------------
// NRHP classifies properties as: Building, Structure, Object, Site, District

const RESOURCE_TYPE_SLUG: Record<string, CategorySlug> = {
  building:  'architecture',
  structure: 'architecture',
  district:  'history',
  site:      'history',
  object:    'history',
};

function slugFromType(resourceType: string): CategorySlug {
  const first = resourceType.trim().toLowerCase().split(/[\s(]/)[0] ?? '';
  return RESOURCE_TYPE_SLUG[first] ?? 'history';
}

// ---- Significance ----------------------------------------------------------
// Base +30 for any NRHP listing; +10 bonus if also a National Historic Landmark

function nrhpSignificance(isNhl: boolean): number {
  return Math.min(1.0, 0.30 + (isNhl ? 0.10 : 0));
}

// ---- Description builder ---------------------------------------------------

function buildDesc(
  resourceType: string,
  period:       string,
  areas:        string,
  city:         string,
  county:       string,
  dateListed:   string,
): string | null {
  const parts: string[] = [];

  if (areas)  parts.push(`Significant for: ${areas}.`);
  if (period) parts.push(`Period of significance: ${period}.`);

  if (!parts.length) {
    if (resourceType) {
      parts.push(`${resourceType}${dateListed ? ` listed ${dateListed}` : ''}.`);
    }
    const loc = [city, county ? `${county} County` : ''].filter(Boolean).join(', ');
    if (loc) parts.push(`Located in ${loc}, California.`);
  }

  return parts.length ? parts.join(' ') : null;
}

// ---- NPS page scraper — find current XLSX URL ------------------------------

async function findXlsxUrl(): Promise<string> {
  const res = await fetch(NPS_PAGE_URL, { headers: { 'User-Agent': USER_AGENT } });
  if (!res.ok) throw new Error(`NPS page returned HTTP ${res.status}`);
  const html = await res.text();

  // Prefer the "listed" file; fall back to any national-register XLSX
  const m = /href="([^"]*national-register-listed[^"]*\.xlsx)"/i.exec(html)
         ?? /href="([^"]*national-register[^"]*\.xlsx)"/i.exec(html);
  if (!m) throw new Error('No XLSX link found on NPS downloads page');
  const href = m[1];
  if (!href) throw new Error('No XLSX link found on NPS downloads page');
  return href.startsWith('http') ? href : `https://www.nps.gov${href}`;
}

// ---- 30-day file cache -----------------------------------------------------

interface CacheMeta { downloadedAt: number; url: string; bytes: number; }

async function downloadWithCache(
  url:      string,
  cacheDir: string,
  force:    boolean,
): Promise<Buffer> {
  const filename = path.basename(new URL(url).pathname);
  const dataFile = path.join(cacheDir, filename);
  const metaFile = path.join(cacheDir, `${filename}.meta.json`);

  if (!force) {
    try {
      const meta   = JSON.parse(await fs.readFile(metaFile, 'utf8')) as CacheMeta;
      const ageMs  = Date.now() - meta.downloadedAt;
      if (ageMs < CACHE_MAX_AGE_MS) {
        console.log(chalk.gray(
          `[nrhp] cached file (${Math.floor(ageMs / 86_400_000)}d old): ${filename}`,
        ));
        return fs.readFile(dataFile);
      }
    } catch { /* not cached or stale */ }
  }

  console.log(chalk.cyan(`[nrhp] downloading ${filename}…`));
  const res = await fetch(url, { headers: { 'User-Agent': USER_AGENT } });
  if (!res.ok) throw new Error(`download HTTP ${res.status}`);

  const buf  = Buffer.from(await res.arrayBuffer());
  await fs.writeFile(dataFile, buf);
  const meta: CacheMeta = { downloadedAt: Date.now(), url, bytes: buf.length };
  await fs.writeFile(metaFile, JSON.stringify(meta, null, 2), 'utf8');
  console.log(chalk.gray(`[nrhp] downloaded ${buf.length.toLocaleString()} bytes`));
  return buf;
}

// ---- Column detection ------------------------------------------------------

function detectCol(keys: string[], candidates: string[]): string {
  // 1. Exact match
  for (const c of candidates) {
    const found = keys.find((k) => k === c);
    if (found) return found;
  }
  // 2. Case-insensitive match
  for (const c of candidates) {
    const cl = c.toLowerCase();
    const found = keys.find((k) => k.toLowerCase() === cl);
    if (found) return found;
  }
  // 3. Substring match (column name contains candidate)
  for (const c of candidates) {
    const cl = c.toLowerCase();
    const found = keys.find((k) => k.toLowerCase().includes(cl));
    if (found) return found;
  }
  return '';
}

// ---- Parsed NRHP row -------------------------------------------------------

interface NrhpRow {
  refNum:       string;
  name:         string;
  county:       string;
  city:         string;
  address:      string;
  dateListed:   string;
  isNhl:        boolean;
  resourceType: string;
  period:       string;
  areas:        string;
}

// ---- XLSX parsing ----------------------------------------------------------

function parseNrhpXlsx(buf: Buffer): NrhpRow[] {
  const wb = XLSX.read(buf, { type: 'buffer', cellDates: false });

  const sheetName = wb.SheetNames[0];
  if (!sheetName) throw new Error('XLSX has no sheets');
  const ws = wb.Sheets[sheetName];
  if (!ws) throw new Error('Worksheet missing');

  const raw = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, {
    defval: '',
    raw:    false,
  });
  if (raw.length === 0) throw new Error('XLSX has no data rows');

  const firstRow = raw[0];
  if (!firstRow) throw new Error('XLSX has no data rows');
  const keys = Object.keys(firstRow);

  const C = {
    refNum:     detectCol(keys, ['Ref#', 'Reference Number', 'REFNUM', 'Ref Num', 'ref_num']),
    name:       detectCol(keys, ['Resource Name', 'Property Name', 'Name']),
    state:      detectCol(keys, ['State']),
    county:     detectCol(keys, ['County']),
    city:       detectCol(keys, ['City', 'Municipality']),
    address:    detectCol(keys, ['Address', 'Street Address', 'Street']),
    dateListed: detectCol(keys, ['Date Listed', 'DateListed', 'Listed Date']),
    nhl:        detectCol(keys, ['NHL Designation Date', 'NHL', 'National Historic Landmark']),
    resType:    detectCol(keys, ['Resource Type', 'Category of Property', 'Category', 'Type']),
    period:     detectCol(keys, ['Period of Significance', 'Period']),
    areas:      detectCol(keys, ['Areas of Significance', 'Area of Significance', 'Significance']),
  };

  console.log(chalk.gray(
    `[nrhp] detected columns — refNum="${C.refNum}" name="${C.name}"` +
    ` state="${C.state}" nhl="${C.nhl}" type="${C.resType}"`,
  ));

  const get = (row: Record<string, unknown>, col: string): string =>
    col ? String(row[col] ?? '').trim() : '';

  const rows: NrhpRow[] = [];
  for (const row of raw) {
    const stateVal = get(row, C.state).toUpperCase();
    if (stateVal !== 'CA' && stateVal !== 'CALIFORNIA') continue;

    const refNum = get(row, C.refNum);
    const name   = get(row, C.name);
    if (!refNum || !name) continue;

    const nhlVal = get(row, C.nhl);
    const isNhl  = nhlVal !== '' && !/^(no|false|0)$/i.test(nhlVal);

    rows.push({
      refNum,
      name,
      county:       get(row, C.county),
      city:         get(row, C.city),
      address:      get(row, C.address),
      dateListed:   get(row, C.dateListed),
      isNhl,
      resourceType: get(row, C.resType),
      period:       get(row, C.period),
      areas:        get(row, C.areas),
    });
  }
  return rows;
}

// ---- Main ------------------------------------------------------------------

export async function runImport(opts: ImportOptions): Promise<ImportResult> {
  const start  = Date.now();
  const result = emptyResult(SOURCE_NAME);

  const nrhpCacheDir = path.join(opts.cacheDir, 'nrhp');
  await fs.mkdir(nrhpCacheDir, { recursive: true });

  // 1. Find + download XLSX ---------------------------------------------------

  let xlsxUrl: string;
  try {
    xlsxUrl = await findXlsxUrl();
    console.log(chalk.cyan(`[nrhp] source: ${xlsxUrl}`));
  } catch (err) {
    console.error(chalk.red(`[nrhp] could not locate download URL: ${err}`));
    result.errors++;
    result.durationMs = Date.now() - start;
    return result;
  }

  let buf: Buffer;
  try {
    buf = await downloadWithCache(xlsxUrl, nrhpCacheDir, opts.force);
  } catch (err) {
    console.error(chalk.red(`[nrhp] download failed: ${err}`));
    result.errors++;
    result.durationMs = Date.now() - start;
    return result;
  }

  // 2. Parse + filter to California ------------------------------------------

  let caRows: NrhpRow[];
  try {
    caRows = parseNrhpXlsx(buf);
  } catch (err) {
    console.error(chalk.red(`[nrhp] parse failed: ${err}`));
    result.errors++;
    result.durationMs = Date.now() - start;
    return result;
  }

  if (opts.county) {
    const target = opts.county.toLowerCase();
    caRows = caRows.filter((r) => r.county.toLowerCase().includes(target));
    console.log(chalk.cyan(`[nrhp] county filter "${opts.county}": ${caRows.length} rows`));
  }

  result.fetched = caRows.length;
  console.log(chalk.cyan(`[nrhp] ${result.fetched} California listings`));
  console.log(chalk.cyan(
    '[nrhp] resolving coordinates via NPS ArcGIS FeatureServer (authoritative)…',
  ));

  // 3. Fetch ArcGIS coords up-front for every refnum -------------------------

  const refnumsToFetch = caRows.map((r) => r.refNum);
  const arcgisResults: NrhpResult[] = await fetchNrhpCoordinates(refnumsToFetch, {
    cacheDir: opts.cacheDir,
    force:    opts.force,
  });
  const byRefnum = new Map(arcgisResults.map((r) => [r.refnum, r]));

  let resolved      = 0;
  let unparseable   = 0;
  let outsideCa     = 0;
  let bboxSkip      = 0;

  // 4. Normalize each row using ArcGIS coords -------------------------------

  const pois: NormalizedPOI[] = [];
  for (const row of caRows) {
    if (opts.limit != null && pois.length >= opts.limit) break;

    const arc = byRefnum.get(row.refNum);
    if (!arc || arc.status !== 'resolved' || arc.lat == null || arc.lng == null) {
      if (!arc || arc.status === 'unparseable') {
        unparseable++;
        console.log(chalk.gray(`[nrhp] unparseable — skip: ${row.refNum} ${row.name}`));
      } else if (arc.status === 'outside_ca') {
        outsideCa++;
        console.log(chalk.yellow(
          `[nrhp] outside CA bbox — skip: ${row.refNum} ${row.name} ` +
          `at (${arc.lat ?? '?'}, ${arc.lng ?? '?'})`,
        ));
      }
      continue;
    }
    resolved++;

    if (opts.bbox) {
      const { minLat, maxLat, minLon, maxLon } = opts.bbox;
      if (
        arc.lat < minLat || arc.lat > maxLat ||
        arc.lng < minLon || arc.lng > maxLon
      ) {
        bboxSkip++;
        continue;
      }
    }

    const resType = row.resourceType;
    const tag     = resType ? resType.toLowerCase().replace(/\s+/g, '_') : 'historic';

    const poi: NormalizedPOI = {
      name:               row.name,
      category_slug:      slugFromType(resType),
      lat:                arc.lat,
      lng:                arc.lng,
      tags:               [tag],
      significance_score: nrhpSignificance(row.isNhl),
      trip_mode:          'all',
      source_type:        'nrhp',
      source_id:          row.refNum,
      // GetAsset URLs are dead — use AssetDetail (Phase 4 fix).
      source_citation:    nrhpAssetDetailUrl(row.refNum),
      confidence_score:   1.0,
      verified:           true,
      description:        buildDesc(
        resType, row.period, row.areas, row.city, row.county, row.dateListed,
      ),
      venue_metadata:     arc.venueMetadata
        ? (arc.venueMetadata as unknown as Record<string, unknown>)
        : null,
    };
    classifyPOI(poi);
    pois.push(poi);
  }

  result.normalized = pois.length;
  console.log(chalk.cyan(
    `[nrhp] ${result.normalized} normalized` +
    ` | arcgis: resolved=${resolved} unparseable=${unparseable} outside_ca=${outsideCa}` +
    (bboxSkip ? ` bbox-skip=${bboxSkip}` : ''),
  ));

  // 5. Sample log — confirm shape matches Phase 4's pattern -----------------

  if (pois.length > 0) {
    console.log(chalk.gray('[nrhp] sample (first 5):'));
    for (const p of pois.slice(0, 5)) {
      console.log(chalk.gray(
        `  • ${p.source_id} ${p.name} → (${p.lat.toFixed(5)}, ${p.lng.toFixed(5)}) ` +
        `layer=${(p.venue_metadata as Record<string, unknown> | null)?.['nrhp_layer'] ?? '?'} ` +
        `bnd=${(p.venue_metadata as Record<string, unknown> | null)?.['nrhp_bnd_type'] ?? '?'} ` +
        `accu=${(p.venue_metadata as Record<string, unknown> | null)?.['nrhp_src_accu'] ?? '?'}`,
      ));
    }
  }

  // 6. Upsert ----------------------------------------------------------------

  const outcome    = await upsertPOIs(pois, { dryRun: opts.dryRun });
  result.inserted  = outcome.inserted;
  result.updated   = outcome.updated;
  result.skipped   = unparseable + outsideCa + bboxSkip + outcome.skipped;
  result.errors   += outcome.errors;
  result.durationMs = Date.now() - start;

  // 7. Summary JSON ----------------------------------------------------------

  const ts          = new Date().toISOString().replace(/[:.]/g, '-');
  const summaryPath = path.join(opts.cacheDir, `nrhp-${ts}.json`);
  await fs.writeFile(summaryPath, JSON.stringify({
    timestamp:    new Date().toISOString(),
    sourceUrl:    xlsxUrl,
    caListings:   result.fetched,
    arcgis:       { resolved, unparseable, outside_ca: outsideCa, bboxSkip },
    pois: {
      normalized: result.normalized,
      inserted:   result.inserted,
      updated:    result.updated,
      skipped:    result.skipped,
      errors:     result.errors,
    },
    elapsedMs:    result.durationMs,
  }, null, 2), 'utf8');

  console.log(chalk.green(
    `[nrhp] done in ${(result.durationMs / 1000).toFixed(1)}s — summary: ${summaryPath}`,
  ));
  return result;
}
