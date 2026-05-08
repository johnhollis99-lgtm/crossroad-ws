// Quick check: did the NRHP fixup bump imported_at on relocated rows?
// We need to know if Rule 5 (imported_before_venue) will block them.

import { config } from 'dotenv';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import pkg from 'pg';

const { Pool } = pkg;
const __dirname = dirname(fileURLToPath(import.meta.url));
config({ path: resolve(__dirname, '../../.env') });

const pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 2 });

async function main() {
  // Sample imported_at on NRHP rows
  console.log('=== imported_at distribution: NRHP rows ===');
  const r1 = await pool.query(`
    SELECT date_trunc('day', imported_at)::text AS day, count(*) AS n
      FROM pois
     WHERE source_type = 'nrhp'
       AND merged_into IS NULL
     GROUP BY 1
     ORDER BY 1 DESC
     LIMIT 20
  `);
  for (const row of r1.rows) console.log(`  ${row.day}  ${row.n}`);

  console.log('\n=== imported_at distribution: editorial venue rows ===');
  const r2 = await pool.query(`
    SELECT date_trunc('day', imported_at)::text AS day, count(*) AS n
      FROM pois
     WHERE source_type = 'editorial'
       AND is_venue = true
       AND merged_into IS NULL
     GROUP BY 1
     ORDER BY 1 DESC
     LIMIT 20
  `);
  for (const row of r2.rows) console.log(`  ${row.day}  ${row.n}`);

  console.log('\n=== Sample NRHP rows: top-significance ones (these are the candidates we care about) ===');
  const r3 = await pool.query(`
    SELECT id::text, name, source_type, significance_score::float AS score,
           imported_at::text, confidence_score
      FROM pois
     WHERE source_type = 'nrhp'
       AND merged_into IS NULL
       AND confidence_score >= 0.5
     ORDER BY significance_score DESC NULLS LAST
     LIMIT 10
  `);
  for (const row of r3.rows) {
    console.log(`  ${row.id}  imp=${row.imported_at}  conf=${row.confidence_score}  score=${row.score}  ${row.name}`);
  }

  // Check imported_at on rows that look like they might be inside Mission San Diego polygon (rough bbox)
  console.log('\n=== NRHP rows near Mission San Diego de Alcalá (32.78,-117.10 ish) ===');
  const r4 = await pool.query(`
    SELECT id::text, name, source_type, significance_score::float AS score,
           imported_at::text, confidence_score,
           ST_Y(location::geometry) AS lat, ST_X(location::geometry) AS lon
      FROM pois
     WHERE source_type = 'nrhp'
       AND merged_into IS NULL
       AND ST_Y(location::geometry) BETWEEN 32.78 AND 32.80
       AND ST_X(location::geometry) BETWEEN -117.11 AND -117.09
     ORDER BY name
     LIMIT 20
  `);
  for (const row of r4.rows) {
    console.log(`  imp=${row.imported_at}  conf=${row.confidence_score}  ${row.lat.toFixed(4)},${row.lon.toFixed(4)}  ${row.name}`);
  }
}

main().catch((err) => { console.error('ERROR:', err.message ?? err); process.exitCode = 1; })
      .finally(() => pool.end());
