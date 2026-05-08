// Fetch real OSM polygons for the two new mission venues that currently
// hold 75m temporary_buffer polygons. Replace with actual mission grounds.
//
// Targets:
//   Mission San Diego de Alcalá: d2814ccd-60fc-40da-9dd6-446bf1d9d74e
//   Mission Santa Inés:          599c180e-cdf2-4f70-911c-c0de91ed8dd5
//
// Run from: scripts/poi-import/
//   node fetch-mission-polygons.mjs           # live UPDATE
//   node fetch-mission-polygons.mjs --dry-run # report only

import { config } from 'dotenv';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import pkg from 'pg';

const { Pool } = pkg;
const __dirname = dirname(fileURLToPath(import.meta.url));
config({ path: resolve(__dirname, '../../.env') });

const DRY_RUN = process.argv.includes('--dry-run');
const USER_AGENT = 'XRoad-mission-polygon-fetch/1.0 (johnhollis99@gmail.com)';
const OVERPASS_ENDPOINT = 'https://overpass-api.de/api/interpreter';
const FETCH_INTERVAL_MS = 2000;
const CENTROID_TOLERANCE_M = 200;

// Note on the search: OSM's CA missions are tagged inconsistently —
// SD de Alcalá is on a relation tagged historic=yes (not historic=mission)
// with name "Mission Basilica San Diego de Alcala", and Santa Inés has no
// relation at all (only a church-building way named "Iglesia de Santa Inés").
// The literal historic=mission + Mission-name regex returns 0 elements
// for both. We broaden the tag filter to {historic=*, building=church,
// amenity=place_of_worship} within a 500m radius around the editorial
// centroid, then rely on the 200m centroid gate as the precision filter.
// The optional nameHint is logged but not used to reject candidates.
const TARGETS = [
  {
    venue_id: 'd2814ccd-60fc-40da-9dd6-446bf1d9d74e',
    name: 'Mission San Diego de Alcalá',
    nameHint: /(mission|basilica|iglesia)|san diego de alcal/i,
  },
  {
    venue_id: '599c180e-cdf2-4f70-911c-c0de91ed8dd5',
    name: 'Mission Santa Inés',
    nameHint: /(mission|basilica|iglesia)|santa in[eé]s/i,
  },
];

const pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 2 });

let lastFetchAt = 0;
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
async function rateLimit() {
  const wait = lastFetchAt + FETCH_INTERVAL_MS - Date.now();
  if (wait > 0) await sleep(wait);
  lastFetchAt = Date.now();
}

async function overpassQuery(q) {
  let backoff = 2000;
  for (let attempt = 0; attempt < 5; attempt++) {
    await rateLimit();
    let res;
    try {
      res = await fetch(OVERPASS_ENDPOINT, {
        method: 'POST',
        headers: { 'User-Agent': USER_AGENT, 'Accept': '*/*', 'Content-Type': 'application/x-www-form-urlencoded' },
        body: `data=${encodeURIComponent(q)}`,
      });
    } catch (err) {
      console.warn(`  network error: ${err.message}, retrying in ${backoff}ms`);
      await sleep(backoff); backoff = Math.min(backoff * 2, 32000);
      continue;
    }
    if (res.ok) return await res.json();
    if (res.status === 429 || res.status === 504 || res.status === 503) {
      console.warn(`  HTTP ${res.status}, backing off ${backoff/1000}s`);
      await sleep(backoff); backoff = Math.min(backoff * 2, 32000);
      continue;
    }
    throw new Error(`Overpass HTTP ${res.status}: ${(await res.text()).slice(0, 200)}`);
  }
  throw new Error('Overpass: max retries');
}

// Haversine distance in meters
function haversineM(lat1, lng1, lat2, lng2) {
  const R = 6371000;
  const toRad = (d) => d * Math.PI / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a = Math.sin(dLat/2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng/2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// Polygon area in m^2 via shoelace on small lat/lng patch (good enough for
// venue-scale polygons; we just need to compare relative sizes)
function polygonAreaM2(ring) {
  if (ring.length < 3) return 0;
  // Use spherical excess approximation by converting deg to meters at midpoint
  const meanLat = ring.reduce((s, [, lat]) => s + lat, 0) / ring.length;
  const cosLat = Math.cos(meanLat * Math.PI / 180);
  const M_PER_DEG_LAT = 111320;
  const xy = ring.map(([lng, lat]) => [lng * M_PER_DEG_LAT * cosLat, lat * M_PER_DEG_LAT]);
  let area = 0;
  for (let i = 0; i < xy.length; i++) {
    const [x1, y1] = xy[i];
    const [x2, y2] = xy[(i + 1) % xy.length];
    area += x1 * y2 - x2 * y1;
  }
  return Math.abs(area / 2);
}

function ringCentroid(ring) {
  let lng = 0, lat = 0;
  const n = ring.length - (ring[0][0] === ring[ring.length-1][0] && ring[0][1] === ring[ring.length-1][1] ? 1 : 0);
  for (let i = 0; i < n; i++) { lng += ring[i][0]; lat += ring[i][1]; }
  return [lng / n, lat / n];
}

// Convert Overpass element geometry to a closed [lng, lat] ring
function wayToRing(geometry) {
  if (!geometry || geometry.length < 3) return null;
  const ring = geometry.map(g => [g.lon, g.lat]);
  // Close if not closed
  const [fx, fy] = ring[0];
  const [lx, ly] = ring[ring.length - 1];
  if (fx !== lx || fy !== ly) ring.push([fx, fy]);
  return ring;
}

// For a relation, build outer rings from member ways. Stitch together
// segments that share endpoints. For mission grounds we expect 1 outer ring.
function relationToOuterRings(relation) {
  const outerSegs = (relation.members || [])
    .filter(m => m.type === 'way' && m.role === 'outer' && m.geometry)
    .map(m => m.geometry.map(g => [g.lon, g.lat]));
  if (outerSegs.length === 0) return [];

  // Stitch: greedy match-end-to-start
  const rings = [];
  const remaining = outerSegs.slice();
  while (remaining.length > 0) {
    let cur = remaining.shift();
    while (cur[0][0] !== cur[cur.length-1][0] || cur[0][1] !== cur[cur.length-1][1]) {
      const tail = cur[cur.length - 1];
      const idx = remaining.findIndex(s => (s[0][0] === tail[0] && s[0][1] === tail[1]) || (s[s.length-1][0] === tail[0] && s[s.length-1][1] === tail[1]));
      if (idx < 0) break;
      const seg = remaining.splice(idx, 1)[0];
      const fwd = seg[0][0] === tail[0] && seg[0][1] === tail[1];
      cur = cur.concat(fwd ? seg.slice(1) : seg.reverse().slice(1));
    }
    if (cur.length >= 4) rings.push(cur);
  }
  return rings;
}

function ringToWKT(ring) {
  const coords = ring.map(([lng, lat]) => `${lng} ${lat}`).join(', ');
  return `POLYGON((${coords}))`;
}

async function fetchVenueLocation(venueId) {
  const r = await pool.query(
    `SELECT name, ST_X(ST_Centroid(venue_polygon::geometry)) AS lng,
                  ST_Y(ST_Centroid(venue_polygon::geometry)) AS lat,
                  venue_metadata
       FROM pois WHERE id = $1`,
    [venueId],
  );
  if (r.rows.length === 0) throw new Error(`Venue ${venueId} not found`);
  return { name: r.rows[0].name, lng: Number(r.rows[0].lng), lat: Number(r.rows[0].lat), meta: r.rows[0].venue_metadata };
}

async function processMission(t) {
  console.log(`\n── ${t.name} (${t.venue_id}) ──`);
  const editorial = await fetchVenueLocation(t.venue_id);
  console.log(`  editorial centroid: ${editorial.lat.toFixed(5)}, ${editorial.lng.toFixed(5)}`);

  // Broad tag filter, then 200m centroid gate is the precision filter.
  const around = `(around:500,${editorial.lat},${editorial.lng})`;
  const q = `
[out:json][timeout:60];
(
  way["historic"]${around};
  way["building"="church"]${around};
  way["amenity"="place_of_worship"]${around};
  relation["historic"]${around};
  relation["building"="church"]${around};
  relation["amenity"="place_of_worship"]${around};
);
out geom;
  `.trim();

  console.log(`  querying Overpass…`);
  const data = await overpassQuery(q);
  const elems = data.elements || [];
  console.log(`  ${elems.length} element(s) returned`);

  // Build candidate polygons
  const cands = [];
  for (const e of elems) {
    if (e.type === 'way') {
      const ring = wayToRing(e.geometry);
      if (!ring) continue;
      cands.push({ kind: 'way', osmId: e.id, ring, name: e.tags?.name ?? '' });
    } else if (e.type === 'relation') {
      const rings = relationToOuterRings(e);
      for (const ring of rings) {
        cands.push({ kind: 'relation', osmId: e.id, ring, name: e.tags?.name ?? '' });
      }
    }
  }
  if (cands.length === 0) {
    console.log(`  ✗ no usable polygons in result — keeping temp_buffer`);
    return { ok: false, reason: 'no candidates' };
  }

  // Compute area + centroid + distance
  for (const c of cands) {
    c.areaM2 = polygonAreaM2(c.ring);
    c.centroid = ringCentroid(c.ring);
    c.distM = haversineM(editorial.lat, editorial.lng, c.centroid[1], c.centroid[0]);
  }

  console.log(`  candidates:`);
  for (const c of cands) {
    console.log(`    [${c.kind}/${c.osmId}] area=${c.areaM2.toFixed(0)}m²  centroid=${c.centroid[1].toFixed(5)},${c.centroid[0].toFixed(5)}  dist=${c.distM.toFixed(0)}m  name="${c.name}"`);
  }

  // Reject candidates whose centroid is more than 200m from editorial location
  const eligible = cands.filter(c => c.distM <= CENTROID_TOLERANCE_M);
  if (eligible.length === 0) {
    console.log(`  ✗ no candidate within ${CENTROID_TOLERANCE_M}m of editorial centroid — keeping temp_buffer`);
    return { ok: false, reason: 'no near match' };
  }

  // Prefer relation > way, then largest area
  eligible.sort((a, b) => {
    if (a.kind !== b.kind) return a.kind === 'relation' ? -1 : 1;
    return b.areaM2 - a.areaM2;
  });
  const winner = eligible[0];
  console.log(`  ✓ winner: [${winner.kind}/${winner.osmId}] area=${winner.areaM2.toFixed(0)}m² dist=${winner.distM.toFixed(0)}m`);

  if (DRY_RUN) {
    console.log(`  DRY RUN — would update venue_polygon to ${winner.ring.length}-vertex polygon`);
    return { ok: true, dry: true, ...winner };
  }

  // Update DB
  const wkt = ringToWKT(winner.ring);
  const osmRef = `${winner.kind}/${winner.osmId}`;
  const upd = await pool.query(
    `UPDATE pois
        SET venue_polygon = ST_GeogFromText($1),
            venue_metadata = jsonb_set(jsonb_set(jsonb_set(
              COALESCE(venue_metadata, '{}'::jsonb),
              '{polygon_source}', '"osm"'::jsonb),
              '{polygon_area_m2}', to_jsonb(ST_Area(ST_GeogFromText($1))::numeric)),
              '{osm_id}', to_jsonb($2::text))
      WHERE id = $3
      RETURNING (venue_metadata) AS new_meta,
                ST_Area(venue_polygon::geography)::float AS new_area_m2`,
    [wkt, osmRef, t.venue_id],
  );
  const row = upd.rows[0];
  console.log(`  ✓ updated DB. new area_m2=${row.new_area_m2.toFixed(0)}`);
  console.log(`  metadata:`, row.new_meta);
  return { ok: true, dry: false, osmRef, areaM2: row.new_area_m2, meta: row.new_meta };
}

async function main() {
  const results = [];
  for (const t of TARGETS) {
    try {
      results.push({ ...t, result: await processMission(t) });
    } catch (err) {
      console.error(`  ERROR for ${t.name}: ${err.message}`);
      results.push({ ...t, result: { ok: false, reason: err.message } });
    }
  }

  console.log(`\n── Summary ──`);
  for (const r of results) {
    if (r.result.ok) {
      console.log(`  ✓ ${r.name}: osm=${r.result.osmRef ?? '(dry)'}  area=${(r.result.areaM2 ?? 0).toFixed(0)}m²`);
    } else {
      console.log(`  ✗ ${r.name}: ${r.result.reason} — temp_buffer left in place`);
    }
  }
}

main()
  .catch(err => { console.error('FATAL:', err.message); process.exitCode = 1; })
  .finally(() => pool.end());
