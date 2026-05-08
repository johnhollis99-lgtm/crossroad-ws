// One-off: verify the confidence_score on the 10 NRHP rows that remain
// merge-primary after the dedupe.ts confidence-tiering fix. Expect every
// one to have confidence_score >= 0.5 (Tier-1 or Tier-2 NRHP geocode).
//
// Run from: scripts/poi-import/
//   node verify-nrhp-tiering.mjs

import { config } from 'dotenv';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import pkg from 'pg';

const { Pool } = pkg;
const __dirname = dirname(fileURLToPath(import.meta.url));
config({ path: resolve(__dirname, '../../.env') });

const NAMES = [
  'Brick Row',
  'Leonis Adobe',
  'Bear Valley Archeological Site',
  'Episcopal Church of the Ascension',
  "St. Matthew's Episcopal Church",
  'Wayfarers Chapel',
  'St. Isidore Catholic Church',
  'Bolton Hall',
  'First Christian Church of Rialto',
  'Encinitas Boathouses',
];

const pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 2 });

async function main() {
  const rows = (await pool.query(
    `SELECT name, source_type, source_id, confidence_score
       FROM pois
      WHERE merged_into IS NULL
        AND source_type = 'nrhp'
        AND name = ANY($1)
      ORDER BY name`,
    [NAMES]
  )).rows;

  console.log(`Found ${rows.length} NRHP rows for the 10 remaining-as-primary names\n`);
  let belowThreshold = 0;
  for (const r of rows) {
    const score = Number(r.confidence_score);
    const flag = score < 0.5 ? ' ✗ FAIL — should have flipped' : '';
    if (score < 0.5) belowThreshold++;
    console.log(
      `  ${score.toFixed(2)}  "${r.name}" [nrhp/${r.source_id}]${flag}`
    );
  }

  console.log(`\nVerdict: ${belowThreshold === 0 ? 'PASS' : `FAIL (${belowThreshold} below-threshold rows still primary)`}`);
}

main()
  .catch(err => {
    console.error('ERROR:', err.message ?? err);
    process.exitCode = 1;
  })
  .finally(() => pool.end());
