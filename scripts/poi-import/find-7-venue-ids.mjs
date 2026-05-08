// Find the POI ids for the 7 manual-Q venues from the prior pageview audit.
//
// Run from: scripts/poi-import/
//   node find-7-venue-ids.mjs

import { config } from 'dotenv';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import pkg from 'pg';

const { Pool } = pkg;
const __dirname = dirname(fileURLToPath(import.meta.url));
config({ path: resolve(__dirname, '../../.env') });
const pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 2 });

// Search patterns — match each name loosely. We'll inspect and pick the right
// row from the candidates printed below.
const TARGETS = [
  'Bodie',
  'Hearst',
  'Mission Dolores',
  'La Purísima',
  'Mountain View Cemetery',
  'Forest Lawn',
  'Pierce Brothers',
];

async function main() {
  for (const t of TARGETS) {
    const r = await pool.query(
      `SELECT id::text,
              name,
              source_type,
              is_venue,
              venue_type,
              venue_metadata->>'wikidata' AS qid,
              source_citation,
              significance_score::float AS score,
              (significance_breakdown->>'pageviews')::int AS pv
       FROM pois
       WHERE merged_into IS NULL
         AND name ILIKE $1
       ORDER BY is_venue DESC, name
       LIMIT 8`,
      [`%${t}%`],
    );
    console.log(`\n=== "${t}" — ${r.rowCount} matches ===`);
    for (const row of r.rows) {
      const flag = row.is_venue ? 'V' : ' ';
      console.log(
        `  ${flag} ${row.id}  [${String(row.source_type).padEnd(15)}]  ` +
        `qid=${(row.qid ?? '—').padEnd(12)}  ` +
        `score=${Number(row.score).toFixed(1).padStart(5)}  pv=${row.pv ?? '?'}  ` +
        `${row.name}`,
      );
    }
  }
}

main()
  .catch((err) => { console.error('ERROR:', err.message ?? err); process.exitCode = 1; })
  .finally(() => pool.end());
