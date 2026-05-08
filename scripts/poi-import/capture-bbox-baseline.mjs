// Capture per-source row counts inside the 4-county bbox at this moment.
// Used as a pre-state snapshot before live dedup so the final stats table
// can show "rows merged_into" as a delta.
//
// Run from: scripts/poi-import/
//   node capture-bbox-baseline.mjs <out.json>

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
  console.error('usage: node capture-bbox-baseline.mjs <out.json>');
  process.exit(1);
}

const pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 2 });

async function main() {
  const r = await pool.query(
    `SELECT source_type,
            COUNT(*) FILTER (WHERE merged_into IS NULL)::int       AS active,
            COUNT(*) FILTER (WHERE merged_into IS NOT NULL)::int   AS merged,
            COUNT(*) FILTER (WHERE parent_poi_id IS NOT NULL)::int AS children,
            COUNT(*)::int                                          AS total
       FROM pois
      WHERE ST_Y(location::geometry) BETWEEN $1 AND $2
        AND ST_X(location::geometry) BETWEEN $3 AND $4
      GROUP BY source_type
      ORDER BY source_type`,
    [BBOX.minLat, BBOX.maxLat, BBOX.minLon, BBOX.maxLon],
  );

  const snapshot = {
    captured_at: new Date().toISOString(),
    bbox: BBOX,
    by_source: r.rows,
  };
  writeFileSync(out, JSON.stringify(snapshot, null, 2), 'utf8');
  console.log(`Wrote ${out}`);
  for (const row of r.rows) {
    console.log(`  ${row.source_type.padEnd(20)} active=${row.active}  merged=${row.merged}  children=${row.children}  total=${row.total}`);
  }
}

main()
  .catch(err => {
    console.error('ERROR:', err.message ?? err);
    process.exitCode = 1;
  })
  .finally(() => pool.end());
