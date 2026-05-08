// One-off: list candidate Phase A merge pairs at MCRD San Diego where both
// names match /^Quarters [A-Z]{1,2}$/ or /^Quarters [A-Z]{1,2}[ -]/. Used to
// sanity-check whether "Quarters X" rows are distinct historic buildings.
//
// Run from: scripts/poi-import/
//   node inspect-quarters.mjs

import { config } from 'dotenv';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import pkg from 'pg';

const { Pool } = pkg;
const __dirname = dirname(fileURLToPath(import.meta.url));
config({ path: resolve(__dirname, '../../.env') });

if (!process.env.DATABASE_URL) {
  console.error('DATABASE_URL not set in .env');
  process.exit(1);
}

const pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 2 });

const REGEX = '^Quarters [A-Z]{1,2}($|[ -])';
const PROXIMITY_M = 50;

async function main() {
  const rows = (await pool.query(
    `SELECT id, name, source_type, source_id,
            ST_X(location::geometry) AS lng,
            ST_Y(location::geometry) AS lat
     FROM pois
     WHERE merged_into IS NULL
       AND name ~ $1
     ORDER BY name`,
    [REGEX]
  )).rows;

  console.log(`Found ${rows.length} active POIs matching ${REGEX}`);
  if (rows.length > 0) {
    console.log('\nAll matches:');
    for (const r of rows) {
      console.log(`  "${r.name}" [${r.source_type}/${r.source_id}]  (${Number(r.lat).toFixed(5)}, ${Number(r.lng).toFixed(5)})`);
    }
  }

  // Pairwise distance for all combos
  const pairs = (await pool.query(
    `SELECT a.id AS a_id, a.name AS a_name, a.source_type AS a_st, a.source_id AS a_sid,
            b.id AS b_id, b.name AS b_name, b.source_type AS b_st, b.source_id AS b_sid,
            ST_Distance(a.location, b.location) AS distance_m
       FROM pois a
       JOIN pois b ON b.id > a.id
                  AND a.merged_into IS NULL
                  AND b.merged_into IS NULL
                  AND a.name ~ $1
                  AND b.name ~ $1
                  AND ST_DWithin(a.location, b.location, $2)
      ORDER BY distance_m`,
    [REGEX, PROXIMITY_M]
  )).rows;

  console.log(`\n${pairs.length} pairs within ${PROXIMITY_M}m:`);
  if (pairs.length === 0) {
    console.log('  (none)');
  } else {
    for (const p of pairs) {
      console.log(
        `  ${Number(p.distance_m).toFixed(1).padStart(5)}m  ` +
        `"${p.a_name}" [${p.a_st}/${p.a_sid}]  ↔  ` +
        `"${p.b_name}" [${p.b_st}/${p.b_sid}]`
      );
    }
  }

  // Cluster by lat/lng — show approximate venue centroid
  if (rows.length > 0) {
    const avgLat = rows.reduce((s, r) => s + Number(r.lat), 0) / rows.length;
    const avgLng = rows.reduce((s, r) => s + Number(r.lng), 0) / rows.length;
    console.log(`\nApprox centroid: ${avgLat.toFixed(5)}, ${avgLng.toFixed(5)}`);
    console.log(`Map URL:        https://www.openstreetmap.org/?mlat=${avgLat.toFixed(5)}&mlon=${avgLng.toFixed(5)}#map=17/${avgLat.toFixed(5)}/${avgLng.toFixed(5)}`);
  }
}

main()
  .catch(err => {
    console.error('ERROR:', err.message ?? err);
    process.exitCode = 1;
  })
  .finally(() => pool.end());
