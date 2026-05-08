import { config } from 'dotenv';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import pkg from 'pg';
const { Pool } = pkg;
config({ path: resolve(dirname(fileURLToPath(import.meta.url)), '../../.env') });
const pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 2 });

// Editorial venues with their Q-numbers
const ev = await pool.query(`
  SELECT name, venue_metadata->>'wikidata' AS q
    FROM pois
   WHERE source_type='editorial' AND merged_into IS NULL
     AND name ILIKE ANY (ARRAY['%disneyland%','%universal studios%','%knott%berry%','%getty%','%seaworld%','%legoland%'])
   ORDER BY name`);
console.log('Editorial venues + Q:');
for (const r of ev.rows) console.log(`  ${r.q?.padEnd(15) ?? '(none)         '}  "${r.name}"`);

// Wikidata rows for the marquee names
const wd = await pool.query(`
  SELECT name, source_id, merged_into IS NOT NULL AS merged
    FROM pois
   WHERE source_type='wikidata'
     AND name ILIKE ANY (ARRAY['%disneyland%','%universal studios%','%knott%berry%','%seaworld%','%legoland%','%getty%'])
   ORDER BY name`);
console.log('\nWikidata rows:');
for (const r of wd.rows) console.log(`  ${r.source_id?.padEnd(12) ?? ''}  merged=${r.merged}  "${r.name}"`);

await pool.end();
