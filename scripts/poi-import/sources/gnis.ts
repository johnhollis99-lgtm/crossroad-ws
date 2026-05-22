import { promises as fs } from 'node:fs';
import path from 'node:path';
import { promisify } from 'node:util';
import { inflateRaw } from 'node:zlib';
import chalk from 'chalk';
import { upsertPOIs } from '../lib/upsert.js';
import {
  emptyResult,
  type CategorySlug,
  type ImportOptions,
  type ImportResult,
  type NormalizedPOI,
  type TripMode,
} from '../lib/types.js';

export const SOURCE_NAME = 'gnis' as const;

const USER_AGENT      = 'XRoad-POI-Import/0.1 (johnhollis99@gmail.com)';
const CACHE_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;
const S3_BUCKET       = 'https://prd-tnm.s3.amazonaws.com';
// USGS reorganized the GeographicNames bucket in late 2025: the old
// `State/TXT_FORMAT/CA_Features_YYYYMMDD.zip` layout was replaced by
// `DomesticNames/DomesticNames_<ST>_Text.zip` (no date in filename;
// freshness is tracked via LastModified on the S3 object).
const S3_KEY_CA       = 'StagedProducts/GeographicNames/DomesticNames/DomesticNames_CA_Text.zip';
const GAZ_BASE_URL    = 'https://edits.nationalmap.gov/apps/gaz-domestic/public/summary';

// Low base — silent topographic label layer per curator decision. Written as
// 0.05 on the 0–1 scale; recompute-significance normalises to 5 on the 0–100
// scale (matches the "+5 base" spec in roadstory-poi-pipeline-prompts.md §3e).
// recompute owns the final score; cross-source boosts come from there, not
// from the dedup pass (per drift 5.07 score-clamp fix).
const BASE_SIGNIFICANCE = 0.05;

const inflateRawAsync = promisify(inflateRaw);

// ---- Feature class allowlist ------------------------------------------------

interface ClassSpec {
  slug: CategorySlug;
  trip_mode: TripMode;
  tags: string[];
}

// Categories per curator decision 2026-05-22: GNIS as silent topographic
// label layer. Summit/Range → geology; Crater/Lava → volcanic; Geyser/Hot
// Spring → hot_springs; landscape water/coast features → nature.
const CLASS_MAP: Record<string, ClassSpec> = {
  'Summit':     { slug: 'geology',     trip_mode: 'hiking', tags: ['summit']     },
  'Falls':      { slug: 'nature',      trip_mode: 'all',    tags: ['waterfall']  },
  'Cape':       { slug: 'nature',      trip_mode: 'all',    tags: ['cape']       },
  'Arch':       { slug: 'nature',      trip_mode: 'hiking', tags: ['arch']       },
  'Bay':        { slug: 'nature',      trip_mode: 'all',    tags: ['bay']        },
  'Pillar':     { slug: 'nature',      trip_mode: 'hiking', tags: ['formation']  },
  'Crater':     { slug: 'volcanic',    trip_mode: 'all',    tags: ['crater']     },
  'Geyser':     { slug: 'hot_springs', trip_mode: 'all',    tags: ['geyser']     },
  'Hot Spring': { slug: 'hot_springs', trip_mode: 'all',    tags: ['hot_spring'] },
  'Lava':       { slug: 'volcanic',    trip_mode: 'all',    tags: ['lava']       },
  'Lake':       { slug: 'nature',      trip_mode: 'all',    tags: ['lake']       },
  'Island':     { slug: 'nature',      trip_mode: 'all',    tags: ['island']     },
  'Range':      { slug: 'geology',     trip_mode: 'all',    tags: ['range']      },
};

// ---- Minimal ZIP reader (single-file archives, deflate or stored) ------------
// GNIS state ZIPs contain one pipe-delimited text file compressed with deflate.
// General-purpose bit flag bit 3 (data descriptor) is not set in USGS-generated
// ZIPs, so compressed size is always present in the local file header.

async function extractZipEntry(buf: Buffer): Promise<Buffer> {
  if (buf.length < 30 || buf.readUInt32LE(0) !== 0x04034b50) {
    throw new Error('Not a valid ZIP archive (bad signature)');
  }
  const compressionMethod = buf.readUInt16LE(8);
  const compressedSize    = buf.readUInt32LE(18);
  const fileNameLen       = buf.readUInt16LE(26);
  const extraLen          = buf.readUInt16LE(28);
  const dataOffset        = 30 + fileNameLen + extraLen;

  if (dataOffset + compressedSize > buf.length) {
    throw new Error('ZIP local file header references data beyond buffer bounds');
  }

  const payload = buf.subarray(dataOffset, dataOffset + compressedSize);
  if (compressionMethod === 0) return payload;   // stored
  if (compressionMethod === 8) return inflateRawAsync(payload); // deflated
  throw new Error(`Unsupported ZIP compression method: ${compressionMethod}`);
}

// ---- S3 listing → CA file URL (verifies presence + reports LastModified) -----

async function findLatestCaZipUrl(): Promise<{ url: string; lastModified: string }> {
  // Single-key probe via S3 listing — confirms the object exists and surfaces
  // its LastModified for cache freshness logging.
  const listUrl = `${S3_BUCKET}/?prefix=${S3_KEY_CA}&max-keys=1`;
  const res = await fetch(listUrl, {
    headers: { 'User-Agent': USER_AGENT, Accept: 'application/xml' },
  });
  if (!res.ok) throw new Error(`S3 listing returned HTTP ${res.status}`);
  const xml = await res.text();

  const keyMatch = xml.match(/<Key>([^<]+\.zip)<\/Key>/);
  if (!keyMatch || keyMatch[1] !== S3_KEY_CA) {
    throw new Error(`CA file not found at expected key ${S3_KEY_CA}`);
  }
  const lastModified = xml.match(/<LastModified>([^<]+)<\/LastModified>/)?.[1] ?? 'unknown';
  return { url: `${S3_BUCKET}/${S3_KEY_CA}`, lastModified };
}

// ---- HTTP download + 30-day cache -------------------------------------------

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
      const meta  = JSON.parse(await fs.readFile(metaFile, 'utf8')) as CacheMeta;
      const ageMs = Date.now() - meta.downloadedAt;
      if (ageMs < CACHE_MAX_AGE_MS) {
        console.log(chalk.gray(
          `[gnis] cached (${Math.floor(ageMs / 86_400_000)}d old): ${filename}`,
        ));
        return fs.readFile(dataFile);
      }
    } catch { /* not cached or stale */ }
  }

  console.log(chalk.cyan(`[gnis] downloading ${filename}…`));
  const res = await fetch(url, { headers: { 'User-Agent': USER_AGENT } });
  if (!res.ok) throw new Error(`download HTTP ${res.status} from ${url}`);

  const buf = Buffer.from(await res.arrayBuffer());
  await fs.writeFile(dataFile, buf);
  const meta: CacheMeta = { downloadedAt: Date.now(), url, bytes: buf.length };
  await fs.writeFile(metaFile, JSON.stringify(meta, null, 2), 'utf8');
  console.log(chalk.gray(`[gnis] downloaded ${buf.length.toLocaleString()} bytes`));
  return buf;
}

// ---- Column detection (index-based for pipe-delimited files) ----------------

function detectColIdx(headers: string[], candidates: string[]): number {
  // 1. Exact match (case-insensitive)
  for (const c of candidates) {
    const i = headers.findIndex((h) => h.toLowerCase() === c.toLowerCase());
    if (i !== -1) return i;
  }
  // 2. Substring match
  for (const c of candidates) {
    const cl = c.toLowerCase();
    const i = headers.findIndex((h) => h.toLowerCase().includes(cl));
    if (i !== -1) return i;
  }
  return -1;
}

// ---- Main -------------------------------------------------------------------

export async function runImport(opts: ImportOptions): Promise<ImportResult> {
  const start  = Date.now();
  const result = emptyResult(SOURCE_NAME);

  const gnisCacheDir = path.join(opts.cacheDir, 'gnis');
  await fs.mkdir(gnisCacheDir, { recursive: true });

  // 1. Discover latest CA file on USGS S3 ------------------------------------

  let zipUrl: string;
  try {
    const probe = await findLatestCaZipUrl();
    zipUrl = probe.url;
    console.log(chalk.cyan(`[gnis] source: ${zipUrl}`));
    console.log(chalk.gray(`[gnis] upstream LastModified: ${probe.lastModified}`));
  } catch (err) {
    console.error(chalk.red(`[gnis] could not locate download URL: ${err}`));
    result.errors++;
    result.durationMs = Date.now() - start;
    return result;
  }

  // 2. Download + decompress --------------------------------------------------

  let zipBuf: Buffer;
  try {
    zipBuf = await downloadWithCache(zipUrl, gnisCacheDir, opts.force);
  } catch (err) {
    console.error(chalk.red(`[gnis] download failed: ${err}`));
    result.errors++;
    result.durationMs = Date.now() - start;
    return result;
  }

  let textBuf: Buffer;
  try {
    textBuf = await extractZipEntry(zipBuf);
  } catch (err) {
    console.error(chalk.red(`[gnis] ZIP extraction failed: ${err}`));
    result.errors++;
    result.durationMs = Date.now() - start;
    return result;
  }
  zipBuf = Buffer.alloc(0); // release compressed buffer before inflated copy exists in memory

  // 3. Detect columns from pipe-delimited header line ------------------------

  const text  = textBuf.toString('utf8');
  textBuf     = Buffer.alloc(0); // free before splitting

  const lines = text.split('\n');

  const rawHeader = lines[0] ?? '';
  const headers   = rawHeader
    .split('|')
    .map((h) => h.trim().replace(/^﻿/, '')); // strip UTF-8 BOM if present

  const C = {
    featureId:    detectColIdx(headers, ['FEATURE_ID']),
    featureName:  detectColIdx(headers, ['FEATURE_NAME']),
    featureClass: detectColIdx(headers, ['FEATURE_CLASS']),
    countyName:   detectColIdx(headers, ['COUNTY_NAME']),
    latDec:       detectColIdx(headers, ['PRIM_LAT_DEC', 'PRIMARY_LAT_DEC']),
    lonDec:       detectColIdx(headers, ['PRIM_LONG_DEC', 'PRIMARY_LONG_DEC']),
  };

  console.log(chalk.gray(
    `[gnis] columns — id=${C.featureId} name=${C.featureName}` +
    ` class=${C.featureClass} lat=${C.latDec} lon=${C.lonDec}`,
  ));

  const missing = Object.entries(C).filter(([, v]) => v === -1).map(([k]) => k);
  if (missing.includes('featureId') || missing.includes('featureName') ||
      missing.includes('featureClass') || missing.includes('latDec') ||
      missing.includes('lonDec')) {
    console.error(chalk.red(`[gnis] required column(s) not found: ${missing.join(', ')}`));
    result.errors++;
    result.durationMs = Date.now() - start;
    return result;
  }

  // 4. Parse, filter, normalize ----------------------------------------------

  const pois: NormalizedPOI[] = [];
  let skippedClass  = 0;
  let skippedCoords = 0;
  let skippedBbox   = 0;
  let skippedCounty = 0;

  // USGS DomesticNames county column carries short names ("Mono", "San Bernardino"),
  // not "Mono County". Normalise CLI input by stripping the " County" suffix and
  // doing exact-match comparison instead of substring (avoids "Lake" matching
  // "Lake County" + every county containing "lake" in description).
  const countyTarget = opts.county?.toLowerCase().replace(/\s+county$/i, '').trim();

  // Hot-spring / geyser name-filter regex. USGS rolled both old classes into
  // generic "Spring"; name-matching is the only signal still available.
  const HOT_SPRING_NAME_RE = /\bhot\s+spring|\bgeyser/i;

  for (let li = 1; li < lines.length; li++) {
    const line = lines[li];
    if (!line || line.trim() === '') continue;

    result.fetched++;

    const cols         = line.split('|');
    const featureClass = cols[C.featureClass]?.trim() ?? '';
    const featureName  = cols[C.featureName]?.trim()  ?? '';

    // Spring class is conditionally accepted: only when name carries the
    // "hot spring" / "geyser" signal. All other Springs are ordinary water
    // sources and out of scope for the topographic-label layer.
    let spec = CLASS_MAP[featureClass];
    if (!spec && featureClass === 'Spring' && HOT_SPRING_NAME_RE.test(featureName)) {
      spec = { slug: 'hot_springs', trip_mode: 'all', tags: ['hot_spring'] };
    }
    if (!spec) { skippedClass++; continue; }

    const featureId = cols[C.featureId]?.trim() ?? '';
    if (!featureId || !featureName) continue;

    const lat = parseFloat(cols[C.latDec]?.trim() ?? '');
    const lng = parseFloat(cols[C.lonDec]?.trim() ?? '');
    // Skip zero-zero coords — a known stale-data artifact in old GNIS entries
    if (!isFinite(lat) || !isFinite(lng) || (lat === 0 && lng === 0)) {
      skippedCoords++;
      continue;
    }

    if (opts.bbox) {
      const { minLat, maxLat, minLon, maxLon } = opts.bbox;
      if (lat < minLat || lat > maxLat || lng < minLon || lng > maxLon) {
        skippedBbox++;
        continue;
      }
    }

    if (countyTarget) {
      const county = C.countyName !== -1 ? (cols[C.countyName]?.trim().toLowerCase() ?? '') : '';
      if (county !== countyTarget) { skippedCounty++; continue; }
    }

    if (opts.limit != null && pois.length >= opts.limit) break;

    pois.push({
      name:               featureName,
      category_slug:      spec.slug,
      lat,
      lng,
      tags:               [...spec.tags, featureClass.toLowerCase().replace(/\s+/g, '_')],
      significance_score: BASE_SIGNIFICANCE,
      trip_mode:          spec.trip_mode,
      source_type:        'gnis',
      source_id:          featureId,
      source_citation:    `${GAZ_BASE_URL}/${featureId}`,
      confidence_score:   0.8,
      verified:           true,
      description:        null,
    });
  }

  result.normalized = pois.length;
  console.log(chalk.cyan(
    `[gnis] ${result.fetched.toLocaleString()} rows scanned` +
    ` → ${result.normalized.toLocaleString()} kept` +
    ` | skipped: class=${skippedClass.toLocaleString()}` +
    ` no-coords=${skippedCoords}` +
    (skippedBbox   ? ` bbox=${skippedBbox}`     : '') +
    (skippedCounty ? ` county=${skippedCounty}` : ''),
  ));

  // 5. Upsert ----------------------------------------------------------------

  const outcome    = await upsertPOIs(pois, { dryRun: opts.dryRun });
  result.inserted  = outcome.inserted;
  result.updated   = outcome.updated;
  result.skipped   = skippedClass + skippedCoords + skippedBbox + skippedCounty + outcome.skipped;
  result.errors   += outcome.errors;
  result.durationMs = Date.now() - start;

  // 6. Summary JSON ----------------------------------------------------------

  const ts          = new Date().toISOString().replace(/[:.]/g, '-');
  const summaryPath = path.join(opts.cacheDir, `gnis-${ts}.json`);
  await fs.writeFile(summaryPath, JSON.stringify({
    timestamp: new Date().toISOString(),
    sourceUrl: zipUrl,
    fetched:   result.fetched,
    skipped: {
      class:  skippedClass,
      coords: skippedCoords,
      bbox:   skippedBbox,
      county: skippedCounty,
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
    `[gnis] done in ${(result.durationMs / 1000).toFixed(1)}s — summary: ${summaryPath}`,
  ));
  return result;
}
