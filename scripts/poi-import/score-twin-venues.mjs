import { config } from 'dotenv';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import pkg from 'pg';
const { Pool } = pkg;
config({ path: resolve(dirname(fileURLToPath(import.meta.url)), '../../.env') });
const pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 2 });
const ids = ['eeb1b2b2-5b0d-4ddc-9287-af437cfbc916','92df5dbd-5cdc-452a-8a75-fcdeaa309052'];
const r = await pool.query(
  `SELECT id::text, name, significance_score::float AS score, additional_sources, significance_breakdown
     FROM pois WHERE id = ANY($1::uuid[]) ORDER BY name`,
  [ids],
);
for (const row of r.rows) {
  console.log(`"${row.name}" [${row.id}]`);
  console.log(`  score=${row.score}  additional_sources=${JSON.stringify(row.additional_sources)}`);
  console.log(`  breakdown=${JSON.stringify(row.significance_breakdown)}`);
}
await pool.end();
