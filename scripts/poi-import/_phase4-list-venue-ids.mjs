// Print a comma-separated list of all active venue POI UUIDs.
// Used to feed --venue-ids on classify-children.ts --allow-retroactive.

import { config } from 'dotenv';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { writeFile } from 'node:fs/promises';
import pkg from 'pg';

const { Pool } = pkg;
const __dirname = dirname(fileURLToPath(import.meta.url));
config({ path: resolve(__dirname, '../../.env') });

const pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 2 });

const r = await pool.query(`
  SELECT id::text AS id, name, venue_type
    FROM pois
   WHERE is_venue = true
     AND merged_into IS NULL
   ORDER BY venue_type, name
`);

console.log(`# ${r.rows.length} active venues`);
for (const row of r.rows) {
  console.log(`  ${row.id}  ${row.venue_type.padEnd(18)}  ${row.name}`);
}

const ids = r.rows.map((row) => row.id).join(',');
await writeFile(resolve(__dirname, 'cache/_phase4-venue-ids.txt'), ids, 'utf8');
console.log(`\nwrote venue ID list to cache/_phase4-venue-ids.txt`);
console.log(`length: ${ids.length} chars`);
await pool.end();
