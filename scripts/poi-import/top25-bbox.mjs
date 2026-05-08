// Print top-25 POIs by significance_score within the 4-county bbox.
// Filters: parent_poi_id IS NULL AND merged_into IS NULL.
// Includes id, name, source_type, score, venue_type (when applicable).
//
// Run from: scripts/poi-import/
//   node top25-bbox.mjs

import { config } from 'dotenv';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import pkg from 'pg';

const { Pool } = pkg;
const __dirname = dirname(fileURLToPath(import.meta.url));
config({ path: resolve(__dirname, '../../.env') });

const BBOX = {
  minLat: 32.5295236,
  minLon: -120.734382,
  maxLat: 35.114665,
  maxLon: -116.0810941,
};

const pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 2 });

async function main() {
  const r = await pool.query(
    `SELECT id::text AS id,
            name,
            source_type,
            significance_score::float AS score,
            venue_type,
            is_venue
       FROM pois
      WHERE merged_into IS NULL
        AND parent_poi_id IS NULL
        AND ST_Y(location::geometry) BETWEEN $1 AND $2
        AND ST_X(location::geometry) BETWEEN $3 AND $4
      ORDER BY significance_score DESC, name
      LIMIT 25`,
    [BBOX.minLat, BBOX.maxLat, BBOX.minLon, BBOX.maxLon],
  );

  console.log('rank | score | source_type     | venue_type        | name                                            | id');
  console.log('-----+-------+-----------------+-------------------+-------------------------------------------------+--------------------------------------');
  let rank = 1;
  for (const row of r.rows) {
    const score = Number(row.score).toFixed(1).padStart(5);
    const st    = String(row.source_type ?? '-').padEnd(15);
    const vt    = String(row.venue_type ?? (row.is_venue ? '(unset)' : '-')).padEnd(17);
    const name  = String(row.name).slice(0, 47).padEnd(47);
    console.log(`${String(rank).padStart(4)} | ${score} | ${st} | ${vt} | ${name} | ${row.id}`);
    rank++;
  }
}

main()
  .catch(err => {
    console.error('ERROR:', err.message ?? err);
    process.exitCode = 1;
  })
  .finally(() => pool.end());
