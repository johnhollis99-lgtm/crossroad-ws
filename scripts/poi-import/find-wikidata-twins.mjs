// Find editorial venues whose venue_metadata.wikidata Q-number points
// to a still-active wikidata POI row. These are canonical-twin pairs
// that Phase B's exact-name match doesn't catch (e.g. "Disneyland Park"
// editorial vs "Disneyland" wikidata).
//
// Run from: scripts/poi-import/
//   node find-wikidata-twins.mjs

import { config } from 'dotenv';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import pkg from 'pg';

const { Pool } = pkg;
const __dirname = dirname(fileURLToPath(import.meta.url));
config({ path: resolve(__dirname, '../../.env') });

const pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 2 });

async function main() {
  const r = await pool.query(`
    WITH editorial_with_wikidata AS (
      SELECT id AS venue_id, name AS venue_name,
             venue_metadata->>'wikidata' AS q_number
      FROM pois
      WHERE source_type = 'editorial'
        AND merged_into IS NULL
        AND venue_metadata ? 'wikidata'
        AND venue_metadata->>'wikidata' LIKE 'Q%'
        AND venue_metadata->>'wikidata' NOT LIKE 'Q-VERIFY%'
        AND venue_metadata->>'wikidata' NOT LIKE 'Q-REAL%'
    )
    SELECT
      e.venue_id::text     AS venue_id,
      e.venue_name,
      e.q_number,
      w.id::text           AS wikidata_id,
      w.name               AS wikidata_name,
      w.is_venue,
      w.parent_poi_id IS NOT NULL AS is_child,
      w.significance_score::float AS w_score
    FROM editorial_with_wikidata e
    JOIN pois w
      ON w.source_type = 'wikidata'
     AND w.source_id   = e.q_number
     AND w.merged_into IS NULL
     AND w.id <> e.venue_id
    ORDER BY e.venue_name
  `);

  console.log(`Candidates: ${r.rows.length}\n`);
  for (const c of r.rows) {
    console.log(`  "${c.venue_name}" [${c.venue_id}] (Q=${c.q_number})`);
    console.log(`    ↔ wikidata "${c.wikidata_name}" [${c.wikidata_id}] is_venue=${c.is_venue} is_child=${c.is_child} score=${c.w_score}`);
  }
  await pool.end();
}

main().catch(err => { console.error('FATAL:', err.message); process.exitCode = 1; });
