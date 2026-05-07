#!/usr/bin/env node
import { config as dotenvConfig } from 'dotenv';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
dotenvConfig({ path: resolve(__dirname, '../../.env') });

import { getPgPool } from '../poi-import/lib/supabase.js';

async function main() {
  const pool = getPgPool();
  const venues = await pool.query<{ count: number }>(
    `SELECT COUNT(*)::int AS count FROM pois WHERE is_venue = true AND merged_into IS NULL`
  );
  console.log(`Venues live in DB: ${venues.rows[0]!.count}`);

  // For each venue, count POIs within 200m with matching normalized-name prefix
  const dupes = await pool.query<{ venue_name: string; nearby: number }>(`
    SELECT v.name AS venue_name,
           COUNT(p.id) AS nearby
    FROM pois v
    LEFT JOIN pois p
      ON p.id <> v.id
     AND p.merged_into IS NULL
     AND p.is_venue = false
     AND ST_DWithin(p.location, v.location, 200)
    WHERE v.is_venue = true AND v.merged_into IS NULL
    GROUP BY v.id, v.name
    ORDER BY nearby DESC
    LIMIT 20
  `);
  console.log('\nTop venues by POIs within 200m (likely duplicates):');
  for (const r of dupes.rows) console.log(`  ${String(r.nearby).padStart(4)}  ${r.venue_name}`);

  await pool.end();
}
main().catch(e => { console.error(e); process.exit(1); });
