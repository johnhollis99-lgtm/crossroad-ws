// One-off: pull 5 sample NRHP defanged rows for Phase 1 NPS asset-page investigation.
import { config } from 'dotenv';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
config({ path: path.resolve(__dirname, '../../.env') });

const { Pool } = pg;
const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });

const TARGET_NAMES = [
  'Star of India',
  'Cabrillo National Monument',
  'Old Point Loma Lighthouse',
  'Marston, George W., House',
  'Berkeley Day Nursery',
];

async function main() {
  // First try the named set
  const { rows: named } = await pool.query(
    `SELECT id, name, source_id, source_citation,
            ST_Y(location::geometry) AS lat,
            ST_X(location::geometry) AS lon,
            confidence_score, editorial_status
       FROM pois
      WHERE source_type = 'nrhp'
        AND merged_into IS NULL
        AND name = ANY($1::text[])
      ORDER BY name`,
    [TARGET_NAMES],
  );

  console.log(`# Named set hits: ${named.length}/${TARGET_NAMES.length}`);
  console.log(JSON.stringify(named, null, 2));

  // Find which names were missing, fill with similar substitutes
  const foundNames = new Set(named.map((r) => r.name));
  const missingNames = TARGET_NAMES.filter((n) => !foundNames.has(n));
  console.log('# Missing:', missingNames);

  if (missingNames.length > 0) {
    // For substitutes, find diverse defanged NRHP rows (1 per missing slot)
    const { rows: subs } = await pool.query(
      `SELECT id, name, source_id, source_citation,
              ST_Y(location::geometry) AS lat,
              ST_X(location::geometry) AS lon,
              confidence_score, editorial_status
         FROM pois
        WHERE source_type = 'nrhp'
          AND merged_into IS NULL
          AND confidence_score = 0.0
          AND name NOT IN (SELECT unnest($1::text[]))
        ORDER BY random()
        LIMIT $2`,
      [TARGET_NAMES, missingNames.length],
    );
    console.log('# Substitutes:');
    console.log(JSON.stringify(subs, null, 2));
  }

  // Also report defanged-row total for sanity
  const { rows: totals } = await pool.query(
    `SELECT confidence_score, COUNT(*) AS n
       FROM pois
      WHERE source_type = 'nrhp' AND merged_into IS NULL
      GROUP BY confidence_score
      ORDER BY confidence_score`,
  );
  console.log('# confidence_score distribution among active NRHP rows:');
  console.log(JSON.stringify(totals, null, 2));

  await pool.end();
}

main().catch((e) => { console.error(e); process.exit(1); });
