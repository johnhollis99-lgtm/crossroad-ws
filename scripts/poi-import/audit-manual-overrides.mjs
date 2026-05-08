// Audit query: list all rows with venue_metadata.q_match_method='manual_override'.
//
// Run from: scripts/poi-import/
//   node audit-manual-overrides.mjs

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
    `SELECT id::text,
            name,
            venue_metadata->>'wikidata' AS q,
            venue_metadata->>'q_match_method' AS method,
            (significance_breakdown->>'pageviews')::int AS current_pv,
            significance_score::float AS current_score
     FROM pois
     WHERE merged_into IS NULL
       AND venue_metadata->>'q_match_method' = 'manual_override'
     ORDER BY name`,
  );
  console.log(`Found ${r.rowCount} manual_override row(s):\n`);
  for (const row of r.rows) {
    console.log(
      `  ${row.id}  q=${row.q}  pv=${row.current_pv ?? '?'}  ` +
      `score=${row.current_score}  ${row.name}`,
    );
  }
  // Print the comma-joined ids on a final line for easy piping.
  if (r.rowCount > 0) {
    console.log('\nIDs:');
    console.log(r.rows.map((x) => x.id).join(','));
  }
}
main()
  .catch((err) => { console.error('ERROR:', err.message ?? err); process.exitCode = 1; })
  .finally(() => pool.end());
