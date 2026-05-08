import { config } from 'dotenv';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import pkg from 'pg';
const { Pool } = pkg;
config({ path: resolve(dirname(fileURLToPath(import.meta.url)), '../../.env') });
const pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 2 });
const r = await pool.query(
  `SELECT id::text, name, source_type, significance_score::float AS score, venue_type, is_venue,
          merged_into IS NOT NULL AS merged, parent_poi_id IS NOT NULL AS has_parent
     FROM pois
    WHERE name ILIKE '%disneyland%' OR name ILIKE '%universal studios%' OR name ILIKE '%knott%berry%'
    ORDER BY score DESC NULLS LAST LIMIT 25`,
);
for (const row of r.rows) console.log(row);
await pool.end();
