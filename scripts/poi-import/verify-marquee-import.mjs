// Verify the 4 marquee venues now exist as wikidata-source POIs by source_id.

import { config } from 'dotenv';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import pkg from 'pg';

const { Pool } = pkg;
const __dirname = dirname(fileURLToPath(import.meta.url));
config({ path: resolve(__dirname, '../../.env') });

const pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 2 });

const QIDS = [
  { qid: 'Q1337576', name: 'Universal Studios Hollywood' },
  { qid: 'Q1207585', name: "Knott's Berry Farm" },
  { qid: 'Q2276588', name: 'Legoland California' },
  { qid: 'Q1946237', name: 'SeaWorld San Diego' },
];

async function main() {
  const ids = QIDS.map((q) => q.qid);

  // 1. Wikidata POI rows (matched by source_id)
  const wikidataRows = await pool.query(
    `SELECT source_id, name, significance_score, ST_X(location::geometry) AS lng, ST_Y(location::geometry) AS lat,
            merged_into, additional_sources, tags
       FROM pois
      WHERE source_type = 'wikidata' AND source_id = ANY($1)`,
    [ids],
  );

  // 2. Editorial venue rows that reference any of these QIDs
  const editorialRows = await pool.query(
    `SELECT id, name, significance_score, venue_metadata->>'wikidata' AS qid,
            additional_sources, source_type
       FROM pois
      WHERE source_type = 'editorial'
        AND venue_metadata->>'wikidata' = ANY($1)`,
    [ids],
  );

  console.log('=== Wikidata-source rows (post-import) ===\n');
  for (const target of QIDS) {
    const row = wikidataRows.rows.find((r) => r.source_id === target.qid);
    if (!row) {
      console.log(`  [MISSING] ${target.qid} (${target.name})`);
      continue;
    }
    const status = row.merged_into ? `MERGED into ${row.merged_into}` : 'active';
    console.log(`  ${target.qid}  ${row.name}  sig=${row.significance_score}  loc=(${row.lat.toFixed(5)}, ${row.lng.toFixed(5)})  ${status}`);
  }

  console.log('\n=== Editorial venue rows referencing these QIDs (Phase C twin-merge candidates) ===\n');
  for (const target of QIDS) {
    const row = editorialRows.rows.find((r) => r.qid === target.qid);
    if (!row) {
      console.log(`  [MISSING] no editorial venue with venue_metadata.wikidata=${target.qid}`);
      continue;
    }
    console.log(`  ${target.qid}  editorial="${row.name}"  sig=${row.significance_score}  additional_sources=${JSON.stringify(row.additional_sources)}`);
  }

  await pool.end();
}

main().catch((err) => { console.error(err); process.exit(1); });
