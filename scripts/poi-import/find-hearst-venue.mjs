// Find the Hearst SSSHM venue id (the State Historical Monument, NOT the
// Castle venue with which it shares a Q-number after this session's Item 4).
//
// Run from: scripts/poi-import/
//   node find-hearst-venue.mjs

import { config } from 'dotenv';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import pkg from 'pg';

const { Pool } = pkg;
const __dirname = dirname(fileURLToPath(import.meta.url));
config({ path: resolve(__dirname, '../../.env') });

const pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 2 });

async function main() {
  const r = await pool.query(
    `SELECT id::text, name, source_id,
            venue_metadata->>'wikidata' AS current_q,
            venue_metadata->>'q_match_method' AS q_match_method,
            (significance_breakdown->>'pageviews')::int AS pv,
            significance_score::float AS score
     FROM pois
     WHERE source_type = 'editorial'
       AND merged_into IS NULL
       AND name ILIKE '%Hearst%'
     ORDER BY name`,
  );
  console.log(`Found ${r.rowCount} editorial Hearst venue(s):\n`);
  for (const row of r.rows) {
    console.log(
      `  ${row.id}  source_id=${row.source_id}  q=${row.current_q}  ` +
      `q_match_method=${row.q_match_method ?? '—'}  ` +
      `pv=${row.pv ?? '?'}  score=${row.score}  ${row.name}`,
    );
  }
}
main()
  .catch((err) => { console.error('ERROR:', err.message ?? err); process.exitCode = 1; })
  .finally(() => pool.end());
