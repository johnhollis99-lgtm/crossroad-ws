// Top 25 active POIs in the 4-county SoCal bbox by significance.

import { config } from 'dotenv';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import pkg from 'pg';

const { Pool } = pkg;
const __dirname = dirname(fileURLToPath(import.meta.url));
config({ path: resolve(__dirname, '../../.env') });

const pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 2 });

const BBOX = {
  minLat: 32.5295236,
  minLon: -120.734382,
  maxLat: 35.114665,
  maxLon: -116.0810941,
};

const rows = await pool.query(
  `SELECT name, source_type, significance_score,
          venue_metadata->>'wikidata' AS qid,
          parent_poi_id,
          is_venue
     FROM pois
    WHERE merged_into IS NULL
      AND ST_Within(location::geometry, ST_MakeEnvelope($1, $2, $3, $4, 4326))
    ORDER BY significance_score DESC, name
    LIMIT 25`,
  [BBOX.minLon, BBOX.minLat, BBOX.maxLon, BBOX.maxLat],
);

console.log(`=== Top 25 by significance — bbox ${BBOX.minLat},${BBOX.minLon} → ${BBOX.maxLat},${BBOX.maxLon} ===\n`);
console.log('Rk | Score | Source         | Venue? | Name                                          | Q-id');
console.log('---|-------|----------------|--------|------------------------------------------------|--------');
let i = 1;
for (const r of rows.rows) {
  const venueFlag = r.is_venue ? 'V' : (r.parent_poi_id ? 'c' : ' ');
  const score = String(r.significance_score).padStart(5);
  const src = r.source_type.padEnd(14);
  const name = (r.name ?? '').padEnd(46).slice(0, 46);
  const qid = r.qid ?? '';
  console.log(`${String(i).padStart(2)} | ${score} | ${src} |   ${venueFlag}    | ${name} | ${qid}`);
  i++;
}

await pool.end();
