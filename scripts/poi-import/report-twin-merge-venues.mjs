// Report on the 10 editorial venues that absorbed wikidata twins in Step 7.
// Lists post-dedup state (significance_score + additional_sources). Also
// emits a comma-separated list of UUIDs suitable for recompute-significance --ids.

import { config } from 'dotenv';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import pkg from 'pg';

const { Pool } = pkg;
const __dirname = dirname(fileURLToPath(import.meta.url));
config({ path: resolve(__dirname, '../../.env') });

const pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 2 });

const TWIN_QIDS = [
  // Marquee targets
  'Q1337576', // Universal Studios Hollywood
  'Q1207585', // Knott's Berry Farm
  'Q2276588', // Legoland California
  'Q1946237', // SeaWorld San Diego
  // Bonus pickups (Phase B name-collapse)
  'Q180401',  // Getty Villa
  'Q29247',   // Getty Center
  'Q1515080', // Six Flags Magic Mountain
  // Phase C residuals
  'Q1229098', // Disney California Adventure
  'Q181185',  // Disneyland
  'Q1142351', // Crystal Cove State Park
];

const rows = await pool.query(
  `SELECT id, name, significance_score, additional_sources, venue_metadata->>'wikidata' AS qid
     FROM pois
    WHERE source_type = 'editorial'
      AND venue_metadata->>'wikidata' = ANY($1)
    ORDER BY name`,
  [TWIN_QIDS],
);

console.log('=== Post-dedup state for 10 wikidata-twin merge primaries ===\n');
console.log('QID         | name                                    | sig    | additional_sources');
console.log('------------|------------------------------------------|--------|-----------------------------');
for (const r of rows.rows) {
  const sig = String(r.significance_score).padStart(6);
  const name = r.name.padEnd(40);
  const addl = JSON.stringify(r.additional_sources);
  console.log(`${r.qid.padEnd(12)}| ${name} | ${sig} | ${addl}`);
}

const ids = rows.rows.map((r) => r.id).join(',');
console.log(`\n--ids ${ids}`);

await pool.end();
