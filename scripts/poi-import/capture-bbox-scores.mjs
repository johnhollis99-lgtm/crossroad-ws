// Capture (id, name, source_type, significance_score) for active POIs
// inside the 4-county bbox. Snapshot before/after recompute so we can
// compute the top-N movers.
//
// Run from: scripts/poi-import/
//   node capture-bbox-scores.mjs <out.json>

import { config } from 'dotenv';
import { writeFileSync } from 'node:fs';
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

const out = process.argv[2];
if (!out) {
  console.error('usage: node capture-bbox-scores.mjs <out.json>');
  process.exit(1);
}

const pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 2 });

async function main() {
  const r = await pool.query(
    `SELECT id::text AS id, name, source_type, significance_score::float AS score
       FROM pois
      WHERE merged_into IS NULL
        AND ST_Y(location::geometry) BETWEEN $1 AND $2
        AND ST_X(location::geometry) BETWEEN $3 AND $4
      ORDER BY id`,
    [BBOX.minLat, BBOX.maxLat, BBOX.minLon, BBOX.maxLon],
  );

  writeFileSync(out, JSON.stringify({ captured_at: new Date().toISOString(), rows: r.rows }, null, 2), 'utf8');
  console.log(`Wrote ${out} (${r.rows.length} rows)`);
}

main()
  .catch(err => {
    console.error('ERROR:', err.message ?? err);
    process.exitCode = 1;
  })
  .finally(() => pool.end());
