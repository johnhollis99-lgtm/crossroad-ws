import { config } from 'dotenv';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import pkg from 'pg';
const { Pool } = pkg;
config({ path: resolve(dirname(fileURLToPath(import.meta.url)), '../../.env') });
const pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 2 });
const r = await pool.query(
  `SELECT pg_get_functiondef(oid) AS def
     FROM pg_proc
    WHERE proname = 'get_corridor_pois'
      AND pronamespace = 'public'::regnamespace`,
);
for (const row of r.rows) console.log(row.def);
console.log(`\n[overloads: ${r.rows.length}]`);
await pool.end();
