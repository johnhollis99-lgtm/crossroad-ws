// Fix the editorial Disneyland Park's wikidata Q-number from Q172041
// (which is actually "Disneyland Resort") to Q181185 (the actual park,
// matching the wikidata POI in our DB).
//
// Run from: scripts/poi-import/
//   node fix-disneyland-q.mjs

import { config } from 'dotenv';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import pkg from 'pg';

const { Pool } = pkg;
const __dirname = dirname(fileURLToPath(import.meta.url));
config({ path: resolve(__dirname, '../../.env') });

const pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 2 });

async function main() {
  // First, look up the row to confirm what we're touching
  const before = await pool.query(`
    SELECT id::text, source_id, source_type, name, source_citation,
           venue_metadata->>'wikidata' AS q,
           venue_metadata->>'venue_slug' AS slug
      FROM pois
     WHERE source_type = 'editorial'
       AND name = 'Disneyland Park'`);
  console.log(`Found ${before.rows.length} matching editorial Disneyland Park rows`);
  for (const r of before.rows) {
    console.log(`  id=${r.id}  source_id=${r.source_id}  q=${r.q}  slug=${r.slug}`);
    console.log(`    citation=${r.source_citation}`);
  }
  if (before.rows.length !== 1) {
    throw new Error(`Expected exactly 1 row, got ${before.rows.length}`);
  }

  const upd = await pool.query(`
    UPDATE pois
       SET source_citation = 'https://www.wikidata.org/wiki/Q181185',
           venue_metadata  = jsonb_set(venue_metadata, '{wikidata}',
                                       to_jsonb('Q181185'::text))
     WHERE source_type = 'editorial'
       AND name = 'Disneyland Park'
   RETURNING id::text, source_citation, venue_metadata->>'wikidata' AS q`);
  console.log(`\nUpdated ${upd.rows.length} row(s):`);
  for (const r of upd.rows) {
    console.log(`  id=${r.id}  q=${r.q}`);
    console.log(`  citation=${r.source_citation}`);
  }
  await pool.end();
}

main().catch(err => { console.error('FATAL:', err.message); process.exitCode = 1; });
