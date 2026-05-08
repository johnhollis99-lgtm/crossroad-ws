// Phase 2 — fetch authoritative NRHP coordinates from the NPS ArcGIS REST
// MapServer and produce a proposed-changes JSON + a human-readable report.
//
// READ-ONLY: this script does NOT mutate the database. It writes
//   cache/nrhp-fixup/proposed-changes.json
//   cache/nrhp-fixup/report.txt
// for human review (Phase 3 stop-and-report gate). A separate Phase 4
// writer applies the changes after approval.
//
// Run from: scripts/poi-import/
//   node fetch-nrhp-coordinates.mjs            # full corpus
//   node fetch-nrhp-coordinates.mjs --limit 50 # cap for smoke-testing
//   node fetch-nrhp-coordinates.mjs --force    # bypass ArcGIS cache
//
// Endpoint:
//   https://mapservices.nps.gov/arcgis/rest/services/Cultural_Resources/nrhp_locations/MapServer
//   Layer 0 = points, Layer 1 = polygons. Both use NRIS_Refnum (string) as
//   the natural key. maxRecordCount = 2000; batch size capped at 500.

import { config } from 'dotenv';
import { promises as fs } from 'node:fs';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pkg from 'pg';

const { Pool } = pkg;
const __dirname = path.dirname(fileURLToPath(import.meta.url));
config({ path: path.resolve(__dirname, '../../.env') });

// ─── Config ────────────────────────────────────────────────────────────────

const ARCGIS_BASE =
  'https://mapservices.nps.gov/arcgis/rest/services/Cultural_Resources/nrhp_locations/MapServer';
const USER_AGENT  = 'XRoad-NRHP-Fixup/0.1 (johnhollis99@gmail.com)';
const BATCH_SIZE  = 500;          // half of layer maxRecordCount=2000, capped per task spec
const PAUSE_MS    = 200;          // inter-batch courtesy pause
const RETRY_DELAYS = [1000, 2000, 4000, 8000, 16000]; // exponential backoff

const CA_BBOX = { minLat: 32.5, maxLat: 42.0, minLon: -124.5, maxLon: -114.0 };
const PLACEHOLDER = { lat: 32.6028017, lon: -117.0235257, name: 'Tijuana-border placeholder' };
const PLACEHOLDER_REJECT_M = 100;
const ACCU_REJECT_M = 10_000;     // reject if stated accuracy exceeds 10 km
// Long-move warnings — proxy for the city-distance check the brief
// downgraded to a warning. We don't have a CA-city centroid table so
// we can't verify "within 50 km of address city" directly, but a move
// >50 km is the same signal in inverse: existing coord was either a
// county-centroid placeholder (defanged) or geocoded with bad context.
// >100 km moves are almost always either a real placeholder→real-coord
// jump OR an ArcGIS data bug (we observed two: Boulevard Park, PG&E
// Powerhouse — Sacramento addresses paired with polygons in Nevada /
// Mono County). Reviewer must look at the warning bucket before commit.
const LONG_MOVE_50KM_KM  = 50;
const LONG_MOVE_100KM_KM = 100;

const OUT_FIELDS = [
  'NRIS_Refnum',
  'RESNAME',
  'Address',
  'City',
  'County',
  'BND_TYPE',
  'MAP_METHOD',
  'SRC_ACCU',
  'Is_NHL',
];

const CACHE_DIR  = path.resolve(__dirname, 'cache', 'nrhp-fixup');
const OUTPUT_JSON = path.join(CACHE_DIR, 'proposed-changes.json');
const REPORT_TXT  = path.join(CACHE_DIR, 'report.txt');

// ─── CLI ───────────────────────────────────────────────────────────────────

const args = process.argv.slice(2);
const opts = {
  limit: parseInt(getArg('--limit') ?? '', 10),
  force: args.includes('--force'),
  refnumOnly: getArg('--refnum'),
};
function getArg(name) {
  const idx = args.indexOf(name);
  return idx >= 0 && idx + 1 < args.length ? args[idx + 1] : undefined;
}

// ─── DB ────────────────────────────────────────────────────────────────────

if (!process.env.DATABASE_URL) {
  console.error('DATABASE_URL not set in .env');
  process.exit(1);
}
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
  max: 2,
});

// ─── Helpers ───────────────────────────────────────────────────────────────

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function haversineKm(lat1, lon1, lat2, lon2) {
  const toRad = (d) => (d * Math.PI) / 180;
  const R = 6371;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

// "+/- 12 meters" / "+/- 100 feet" / "+/- 0.5 miles" / "" → meters or null.
function parseSrcAccuMeters(text) {
  if (!text) return null;
  const m = String(text).match(/([0-9]+(?:\.[0-9]+)?)\s*(meter|metre|foot|feet|ft|mile|mi|km|kilometer)/i);
  if (!m) return null;
  const n = parseFloat(m[1]);
  if (!Number.isFinite(n)) return null;
  const u = m[2].toLowerCase();
  if (u.startsWith('meter') || u.startsWith('metre')) return n;
  if (u.startsWith('km')    || u.startsWith('kilo'))  return n * 1000;
  if (u.startsWith('foot')  || u === 'feet' || u === 'ft') return n * 0.3048;
  if (u.startsWith('mile')  || u === 'mi') return n * 1609.344;
  return null;
}

// Signed-area centroid of an outer ring: rings[0] from the ArcGIS polygon.
// Holes are ignored — accurate enough for boundary-area centroids and
// equivalent to ST_Centroid for the simple convex/lobed shapes typical of
// NRHP boundaries (single-parcel buildings, historic-district outlines).
function ringCentroid(ring) {
  if (!Array.isArray(ring) || ring.length < 3) return null;
  let area = 0, cx = 0, cy = 0;
  for (let i = 0; i < ring.length - 1; i++) {
    const [x0, y0] = ring[i];
    const [x1, y1] = ring[i + 1];
    const cross = x0 * y1 - x1 * y0;
    area += cross;
    cx   += (x0 + x1) * cross;
    cy   += (y0 + y1) * cross;
  }
  area /= 2;
  if (Math.abs(area) < 1e-12) {
    // Degenerate (zero-area) ring — fall back to vertex-mean
    let sx = 0, sy = 0;
    for (const [x, y] of ring) { sx += x; sy += y; }
    return { x: sx / ring.length, y: sy / ring.length };
  }
  return { x: cx / (6 * area), y: cy / (6 * area) };
}

function batchHash(refnums) {
  return createHash('sha1').update(refnums.slice().sort().join('|')).digest('hex').slice(0, 12);
}

async function requestWithRetry(url, init = {}, attempt = 0) {
  try {
    const res = await fetch(url, {
      ...init,
      headers: { 'User-Agent': USER_AGENT, 'Accept': 'application/json', ...(init.headers ?? {}) },
    });
    // Retry only on rate-limit + 5xx; 4xx client errors are permanent and
    // throw immediately so we don't waste the backoff window.
    if (res.status === 429 || res.status >= 500) {
      if (attempt >= RETRY_DELAYS.length) throw new Error(`HTTP ${res.status} after ${attempt} retries`);
      const delay = RETRY_DELAYS[attempt];
      console.log(`  ↻ HTTP ${res.status}, retry in ${delay}ms (attempt ${attempt + 1}/${RETRY_DELAYS.length})`);
      await sleep(delay);
      return requestWithRetry(url, init, attempt + 1);
    }
    if (!res.ok) throw new Error(`HTTP ${res.status}: ${(await res.text()).slice(0, 200)}`);
    const body = await res.json();
    if (body.error) throw new Error(`ESRI error: ${JSON.stringify(body.error)}`);
    return body;
  } catch (err) {
    // Network-layer errors (DNS, ECONNRESET, etc.) — retry. HTTP errors
    // already threw above and won't get retried again here.
    if (err.message?.startsWith('HTTP ')) throw err;
    if (attempt >= RETRY_DELAYS.length) throw err;
    const delay = RETRY_DELAYS[attempt];
    console.log(`  ↻ ${err.message}, retry in ${delay}ms (attempt ${attempt + 1}/${RETRY_DELAYS.length})`);
    await sleep(delay);
    return requestWithRetry(url, init, attempt + 1);
  }
}

async function readCacheOrFetch(cachePath, requestBuilder) {
  if (!opts.force) {
    try {
      const cached = await fs.readFile(cachePath, 'utf8');
      return JSON.parse(cached);
    } catch { /* miss */ }
  }
  const { url, init } = requestBuilder();
  const body = await requestWithRetry(url, init);
  await fs.writeFile(cachePath, JSON.stringify(body), 'utf8');
  return body;
}

// ArcGIS query endpoints accept POST (form-encoded) — use it because a
// 500-refnum WHERE clause overflows the GET URL length limit (HTTP 400).
function buildQueryRequest(layerId, refnums) {
  const where = `NRIS_Refnum IN (${refnums.map((r) => `'${String(r).replace(/'/g, "''")}'`).join(',')})`;
  const params = new URLSearchParams({
    where,
    outFields: OUT_FIELDS.join(','),
    outSR: '4326',
    returnGeometry: 'true',
    f: 'json',
  });
  return {
    url: `${ARCGIS_BASE}/${layerId}/query`,
    init: {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: params.toString(),
    },
  };
}

// ─── Main ──────────────────────────────────────────────────────────────────

async function main() {
  await fs.mkdir(CACHE_DIR, { recursive: true });

  // 1. Verify maxRecordCount on both layers (live, not cached — small request) ─

  console.log('▶ Probing ArcGIS layer metadata…');
  const meta0 = await requestWithRetry(`${ARCGIS_BASE}/0?f=json`);
  const meta1 = await requestWithRetry(`${ARCGIS_BASE}/1?f=json`);
  const max0 = meta0.maxRecordCount ?? 0;
  const max1 = meta1.maxRecordCount ?? 0;
  console.log(`  layer 0 maxRecordCount=${max0} | layer 1 maxRecordCount=${max1} | batch size=${BATCH_SIZE}`);
  if (BATCH_SIZE > Math.floor(max0 / 2) || BATCH_SIZE > Math.floor(max1 / 2)) {
    console.warn(`  ⚠ batch size ${BATCH_SIZE} exceeds half of either maxRecordCount`);
  }

  // 2. Snapshot NRHP corpus from DB ────────────────────────────────────────

  console.log('▶ Loading NRHP corpus from DB…');
  let limitClause = '';
  let limitArgs = [];
  if (opts.refnumOnly) {
    limitClause = ' AND source_id = $1';
    limitArgs = [opts.refnumOnly];
  } else if (Number.isFinite(opts.limit) && opts.limit > 0) {
    limitClause = ` LIMIT ${opts.limit}`;
  }

  const sql = `
    SELECT id, name, source_id, source_citation, confidence_score,
           ST_Y(location::geometry) AS lat,
           ST_X(location::geometry) AS lon
    FROM pois
    WHERE source_type = 'nrhp'
      AND merged_into IS NULL
      AND source_id IS NOT NULL
      AND source_id <> ''
      ${opts.refnumOnly ? limitClause : ''}
    ORDER BY source_id
    ${!opts.refnumOnly ? limitClause : ''}
  `;
  const { rows: corpus } = await pool.query(sql, limitArgs);
  console.log(`  loaded ${corpus.length} NRHP rows`);

  if (corpus.length === 0) {
    console.error('  no NRHP rows found — aborting');
    await pool.end();
    process.exit(1);
  }

  // Deduplicate by source_id (defensive — UNIQUE constraint should prevent
  // dupes among active rows, but the partial index allows merged duplicates).
  const byRefnum = new Map();
  for (const row of corpus) {
    if (!byRefnum.has(row.source_id)) byRefnum.set(row.source_id, row);
  }
  const refnums = [...byRefnum.keys()];

  // 3. Batch query layer 0 (points) ───────────────────────────────────────

  console.log(`▶ Querying layer 0 (points) in ${Math.ceil(refnums.length / BATCH_SIZE)} batches…`);
  const layer0Results = new Map(); // refnum → { feature, layer:0 }
  for (let i = 0; i < refnums.length; i += BATCH_SIZE) {
    const slice = refnums.slice(i, i + BATCH_SIZE);
    const cachePath = path.join(CACHE_DIR, `layer-0-${batchHash(slice)}.json`);
    const body = await readCacheOrFetch(cachePath, () => buildQueryRequest(0, slice));
    const features = body.features ?? [];
    for (const f of features) {
      const ref = f.attributes?.NRIS_Refnum;
      if (!ref || !f.geometry) continue;
      layer0Results.set(String(ref), { feature: f, layer: 0 });
    }
    console.log(`  batch ${Math.floor(i / BATCH_SIZE) + 1}: ${slice.length} requested, ${features.length} returned (cumulative hits: ${layer0Results.size})`);
    if (i + BATCH_SIZE < refnums.length) await sleep(PAUSE_MS);
  }

  // 4. Layer 1 fallback for unresolved refnums ─────────────────────────────

  const unresolvedAfter0 = refnums.filter((r) => !layer0Results.has(r));
  console.log(`▶ Layer 0 hits: ${layer0Results.size} / ${refnums.length} | falling back to layer 1 for ${unresolvedAfter0.length} unresolved`);

  const layer1Results = new Map();
  if (unresolvedAfter0.length > 0) {
    for (let i = 0; i < unresolvedAfter0.length; i += BATCH_SIZE) {
      const slice = unresolvedAfter0.slice(i, i + BATCH_SIZE);
      const cachePath = path.join(CACHE_DIR, `layer-1-${batchHash(slice)}.json`);
      const body = await readCacheOrFetch(cachePath, () => buildQueryRequest(1, slice));
      const features = body.features ?? [];
      for (const f of features) {
        const ref = f.attributes?.NRIS_Refnum;
        if (!ref || !f.geometry) continue;
        // ArcGIS may return multiple polygon rows per refnum (e.g. boundary
        // increases). Keep the first; report duplicates.
        if (!layer1Results.has(String(ref))) {
          layer1Results.set(String(ref), { feature: f, layer: 1 });
        }
      }
      console.log(`  batch ${Math.floor(i / BATCH_SIZE) + 1}: ${slice.length} requested, ${features.length} returned (cumulative hits: ${layer1Results.size})`);
      if (i + BATCH_SIZE < unresolvedAfter0.length) await sleep(PAUSE_MS);
    }
  }

  // 5. Build proposals + run validation ──────────────────────────────────

  const stamp = new Date().toISOString();
  const proposals = [];                  // geometry-fix proposals (defanged rows)
  const metadataOnly = [];               // full-confidence rows that ArcGIS resolved
  const citationOnly = [];               // any row not resolved by ArcGIS
  const unresolved = [];                 // refnums on neither layer
  const validationStats = {
    accepted: 0,
    rejected_no_coords: 0,
    rejected_outside_ca: 0,
    rejected_at_placeholder: 0,
    rejected_bad_accuracy: 0,
    warned_far_from_city: 0,
  };
  const layerStats = { layer0: 0, layer1: 0 };
  const bndTypes = new Map();
  const mapMethods = new Map();
  const accuBins = { '<=10m': 0, '10-50m': 0, '50-200m': 0, '200-1000m': 0, '1-10km': 0, '>10km': 0, 'unknown': 0 };

  const ASSET_DETAIL = (refnum) => `https://npgallery.nps.gov/AssetDetail/NRIS/${encodeURIComponent(refnum)}`;

  for (const refnum of refnums) {
    const row = byRefnum.get(refnum);
    const newCitation = ASSET_DETAIL(refnum);
    const isDefanged = Number(row.confidence_score) === 0;

    const hit = layer0Results.get(refnum) ?? layer1Results.get(refnum);
    if (!hit) {
      unresolved.push({ id: row.id, source_id: refnum, name: row.name });
      // Still emit a citation-only update (dead-link bug affects all rows).
      if (row.source_citation !== newCitation) {
        citationOnly.push({
          id: row.id,
          source_id: refnum,
          current_citation: row.source_citation,
          new_citation: newCitation,
          reason: 'unresolved_arcgis',
          current_confidence: Number(row.confidence_score),
        });
      }
      continue;
    }

    layerStats[hit.layer === 0 ? 'layer0' : 'layer1']++;
    const attrs = hit.feature.attributes ?? {};

    // Resolve coordinates.
    let lat = null, lon = null;
    if (hit.layer === 0) {
      lon = hit.feature.geometry?.x ?? null;
      lat = hit.feature.geometry?.y ?? null;
    } else {
      const ring = hit.feature.geometry?.rings?.[0];
      const c = ring ? ringCentroid(ring) : null;
      if (c) { lon = c.x; lat = c.y; }
    }

    const warnings = [];
    let rejectReason = null;

    if (lat == null || lon == null || !Number.isFinite(lat) || !Number.isFinite(lon)) {
      rejectReason = 'no_coords';
    } else if (lat < CA_BBOX.minLat || lat > CA_BBOX.maxLat || lon < CA_BBOX.minLon || lon > CA_BBOX.maxLon) {
      rejectReason = 'outside_ca';
    } else if (haversineKm(lat, lon, PLACEHOLDER.lat, PLACEHOLDER.lon) * 1000 < PLACEHOLDER_REJECT_M) {
      rejectReason = 'at_placeholder';
    }

    const accuMeters = parseSrcAccuMeters(attrs.SRC_ACCU);
    if (!rejectReason && accuMeters != null && accuMeters > ACCU_REJECT_M) {
      rejectReason = 'bad_accuracy';
    }

    // Soft city check is deferred to Phase 4 (no inline geocoder), but
    // approximated here by long-move flags computed below from moved_km.

    if (rejectReason) {
      validationStats[`rejected_${rejectReason}`] = (validationStats[`rejected_${rejectReason}`] ?? 0) + 1;
      // Even a rejected geometry fix should still get the citation update.
      if (row.source_citation !== newCitation) {
        citationOnly.push({
          id: row.id,
          source_id: refnum,
          current_citation: row.source_citation,
          new_citation: newCitation,
          reason: `rejected_${rejectReason}`,
          current_confidence: Number(row.confidence_score),
        });
      }
      continue;
    }

    validationStats.accepted++;
    bndTypes.set(attrs.BND_TYPE ?? '(null)', (bndTypes.get(attrs.BND_TYPE ?? '(null)') ?? 0) + 1);
    mapMethods.set(attrs.MAP_METHOD ?? '(null)', (mapMethods.get(attrs.MAP_METHOD ?? '(null)') ?? 0) + 1);

    const accuBin =
      accuMeters == null  ? 'unknown'  :
      accuMeters <= 10    ? '<=10m'    :
      accuMeters <= 50    ? '10-50m'   :
      accuMeters <= 200   ? '50-200m'  :
      accuMeters <= 1000  ? '200-1000m':
      accuMeters <= 10000 ? '1-10km'   : '>10km';
    accuBins[accuBin]++;

    const arcMeta = {
      geocoding_method: 'nrhp_arcgis_2026-05-07',
      nrhp_layer: hit.layer,
      nrhp_bnd_type: attrs.BND_TYPE ?? null,
      nrhp_map_method: attrs.MAP_METHOD ?? null,
      nrhp_src_accu: attrs.SRC_ACCU ?? null,
      nrhp_src_accu_meters: accuMeters,
      nrhp_resolved_at: stamp,
    };

    const movedKm = haversineKm(lat, lon, row.lat, row.lon);

    if (movedKm >= LONG_MOVE_100KM_KM)      warnings.push('long_move_100km');
    else if (movedKm >= LONG_MOVE_50KM_KM)  warnings.push('long_move_50km');

    const baseProposal = {
      id: row.id,
      source_id: refnum,
      name: row.name,
      current_lat: row.lat,
      current_lon: row.lon,
      current_confidence: Number(row.confidence_score),
      current_citation: row.source_citation,
      new_lat: lat,
      new_lon: lon,
      moved_km: Number(movedKm.toFixed(3)),
      arcgis: {
        layer: hit.layer,
        resname: attrs.RESNAME ?? null,
        address: attrs.Address ?? null,
        city: attrs.City ?? null,
        county: attrs.County ?? null,
        bnd_type: attrs.BND_TYPE ?? null,
        map_method: attrs.MAP_METHOD ?? null,
        src_accu: attrs.SRC_ACCU ?? null,
        src_accu_meters: accuMeters,
      },
      venue_metadata_patch: arcMeta,
      new_citation: newCitation,
      warnings,
    };

    if (isDefanged) {
      proposals.push({ ...baseProposal, action: 'geometry_fix', new_confidence: 1.0 });
    } else {
      // Full-confidence row that ArcGIS resolved — only update metadata +
      // citation, leave geometry alone. (User Phase 5 reshape may change this.)
      metadataOnly.push({ ...baseProposal, action: 'metadata_only' });
    }
  }

  // 6. Sort + sample for the report ────────────────────────────────────────

  proposals.sort((a, b) => b.moved_km - a.moved_km);

  const topMoves   = proposals.slice(0, 10);
  const sampleAccept = proposals.slice(0, 5);
  const sampleUnresolved = unresolved.slice(0, 10);

  // Warning buckets across geometry_fix + metadata_only proposals.
  const allProposals = [...proposals, ...metadataOnly];
  const warn100 = allProposals.filter((p) => p.warnings.includes('long_move_100km'));
  const warn50  = allProposals.filter((p) => p.warnings.includes('long_move_50km'));
  warn100.sort((a, b) => b.moved_km - a.moved_km);
  warn50.sort((a, b) => b.moved_km - a.moved_km);

  // 7. Write JSON output ──────────────────────────────────────────────────

  const output = {
    generated_at: stamp,
    inputs: {
      total_active_nrhp_rows: corpus.length,
      defanged: corpus.filter((r) => Number(r.confidence_score) === 0).length,
      full_confidence: corpus.filter((r) => Number(r.confidence_score) === 1).length,
      limit: Number.isFinite(opts.limit) && opts.limit > 0 ? opts.limit : null,
      refnum_only: opts.refnumOnly ?? null,
    },
    arcgis: {
      service: ARCGIS_BASE,
      layer_0_max_record_count: max0,
      layer_1_max_record_count: max1,
      batch_size: BATCH_SIZE,
      out_fields: OUT_FIELDS,
    },
    summary: {
      layer_0_hits: layerStats.layer0,
      layer_1_hits: layerStats.layer1,
      unresolved: unresolved.length,
      validation: validationStats,
      bnd_type_distribution: Object.fromEntries(bndTypes),
      map_method_distribution: Object.fromEntries(mapMethods),
      src_accu_bin_distribution: accuBins,
      proposals_geometry_fix: proposals.length,
      proposals_metadata_only: metadataOnly.length,
      citation_only_updates: citationOnly.length,
      warnings: {
        long_move_50km:  warn50.length,
        long_move_100km: warn100.length,
      },
    },
    proposals,
    metadata_only: metadataOnly,
    citation_only: citationOnly,
    unresolved,
  };

  await fs.writeFile(OUTPUT_JSON, JSON.stringify(output, null, 2), 'utf8');

  // 8. Human-readable report ─────────────────────────────────────────────

  const lines = [];
  lines.push(`NRHP coordinate-fixup report — ${stamp}`);
  lines.push('═══════════════════════════════════════════════════════════════');
  lines.push('');
  lines.push(`INPUT`);
  lines.push(`  total active NRHP rows      ${output.inputs.total_active_nrhp_rows}`);
  lines.push(`  defanged (confidence=0.0)   ${output.inputs.defanged}`);
  lines.push(`  full     (confidence=1.0)   ${output.inputs.full_confidence}`);
  if (output.inputs.limit) lines.push(`  --limit applied             ${output.inputs.limit}`);
  if (output.inputs.refnum_only) lines.push(`  --refnum applied            ${output.inputs.refnum_only}`);
  lines.push('');
  lines.push(`ARCGIS COVERAGE`);
  lines.push(`  layer 0 (points)            ${layerStats.layer0}`);
  lines.push(`  layer 1 (polygons)          ${layerStats.layer1}`);
  lines.push(`  total resolved              ${layerStats.layer0 + layerStats.layer1}`);
  lines.push(`  unresolved (neither layer)  ${unresolved.length}`);
  lines.push('');
  lines.push(`VALIDATION`);
  for (const [k, v] of Object.entries(validationStats)) {
    lines.push(`  ${k.padEnd(28)}${v}`);
  }
  lines.push('');
  lines.push(`PROPOSED ACTIONS`);
  lines.push(`  geometry_fix (defanged)     ${proposals.length}    ← lat/lon overwrite + venue_metadata + citation + confidence=1.0`);
  lines.push(`  metadata_only (full conf.)  ${metadataOnly.length}    ← venue_metadata + citation only (geometry untouched)`);
  lines.push(`  citation_only               ${citationOnly.length}    ← citation update only (unresolved or rejected geometry)`);
  lines.push('');
  lines.push(`SRC_ACCU DISTRIBUTION (resolved + accepted)`);
  for (const [k, v] of Object.entries(accuBins)) {
    lines.push(`  ${k.padEnd(12)}${v}`);
  }
  lines.push('');
  lines.push(`BND_TYPE TOP 10`);
  const bndSorted = [...bndTypes.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10);
  for (const [k, v] of bndSorted) lines.push(`  ${k.padEnd(40)}${v}`);
  lines.push('');
  lines.push(`MAP_METHOD TOP 10`);
  const mapSorted = [...mapMethods.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10);
  for (const [k, v] of mapSorted) lines.push(`  ${k.padEnd(40)}${v}`);
  lines.push('');
  lines.push(`TOP 10 LARGEST MOVES (geometry_fix proposals)`);
  for (const p of topMoves) {
    lines.push(`  ${p.source_id.padEnd(11)} ${p.moved_km.toFixed(2).padStart(8)} km  layer ${p.arcgis.layer}  ${(p.name ?? '').slice(0, 50)}`);
    lines.push(`               from (${p.current_lat.toFixed(5)}, ${p.current_lon.toFixed(5)}) → (${p.new_lat.toFixed(5)}, ${p.new_lon.toFixed(5)})`);
  }
  lines.push('');
  lines.push(`SAMPLE ACCEPT (5)`);
  for (const p of sampleAccept) {
    lines.push(`  ${p.source_id} ${(p.name ?? '').slice(0, 60)}`);
    lines.push(`    arcgis: ${p.arcgis.resname} | ${p.arcgis.city ?? '—'}, ${p.arcgis.county ?? '—'}`);
    lines.push(`    BND_TYPE=${p.arcgis.bnd_type ?? '—'} MAP_METHOD=${p.arcgis.map_method ?? '—'} SRC_ACCU=${p.arcgis.src_accu ?? '—'}`);
  }
  lines.push('');
  lines.push(`REVIEW NEEDED — long-move warnings`);
  lines.push(`  long_move_100km (≥100 km)   ${warn100.length}`);
  lines.push(`  long_move_50km  (≥50 km)    ${warn50.length}`);
  lines.push('');
  if (warn100.length > 0) {
    lines.push(`  ──── ≥100 km moves (manual review BEFORE Phase 4) ────`);
    for (const p of warn100) {
      lines.push(`  ${p.source_id.padEnd(11)} ${p.moved_km.toFixed(1).padStart(7)} km  ${(p.name ?? '').slice(0, 50)}`);
      lines.push(`               arcgis: ${p.arcgis.address ?? '—'} | ${p.arcgis.city ?? '—'}, ${p.arcgis.county ?? '—'}`);
      lines.push(`               from (${p.current_lat.toFixed(5)}, ${p.current_lon.toFixed(5)}) → (${p.new_lat.toFixed(5)}, ${p.new_lon.toFixed(5)})`);
      lines.push(`               action: ${p.action}  current_conf=${p.current_confidence}`);
    }
    lines.push('');
  }
  lines.push(`SAMPLE UNRESOLVED (10)`);
  for (const u of sampleUnresolved) {
    lines.push(`  ${u.source_id} ${u.name ?? ''}`);
  }
  lines.push('');
  lines.push('───────────────────────────────────────────────────────────────');
  lines.push('STOP — Phase 3 review gate');
  lines.push('  Output: ' + OUTPUT_JSON);
  lines.push('  Inspect proposed changes and either approve via Phase 4 writer');
  lines.push('  or revise validation rules and re-run.');
  lines.push('  No DB rows have been modified by this script.');
  lines.push('───────────────────────────────────────────────────────────────');

  const report = lines.join('\n');
  await fs.writeFile(REPORT_TXT, report + '\n', 'utf8');
  console.log('\n' + report);
  console.log(`\n✓ Wrote ${OUTPUT_JSON}`);
  console.log(`✓ Wrote ${REPORT_TXT}`);

  await pool.end();
}

main().catch((err) => {
  console.error('FATAL:', err);
  pool.end().finally(() => process.exit(1));
});
