// One-off: apply 20260510000006_remove_unused_poi_categories.sql
// Verifies post-state by re-running the category distribution query.
//
// Run from repo root:
//   node scripts/poi-import/apply-remove-unused-poi-categories.mjs

import { config } from 'dotenv';
import { readFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import pkg from 'pg';

const { Pool } = pkg;
const __dirname = dirname(fileURLToPath(import.meta.url));

config({ path: resolve(__dirname, '../../.env') });

const MIGRATION_PATH = resolve(
  __dirname,
  '../../supabase/migrations/20260510000006_remove_unused_poi_categories.sql',
);

if (!process.env.DATABASE_URL) {
  console.error('DATABASE_URL not set in .env');
  process.exit(1);
}
if (!existsSync(MIGRATION_PATH)) {
  console.error(`Migration file not found: ${MIGRATION_PATH}`);
  process.exit(1);
}

const pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 2 });

async function main() {
  const sql = readFileSync(MIGRATION_PATH, 'utf8');

  console.log('▶ Pre-state (full distribution):');
  const pre = await pool.query(
    `SELECT pc.slug, COUNT(p.id)::int AS count
       FROM poi_categories pc
       LEFT JOIN pois p
         ON p.category_id = pc.id AND p.merged_into IS NULL
      GROUP BY pc.slug
      ORDER BY count DESC, pc.slug`,
  );
  const preMap = new Map(pre.rows.map((r) => [r.slug, r.count]));
  for (const r of pre.rows) console.log(`   ${r.slug.padEnd(18)} ${String(r.count).padStart(6)}`);

  console.log('\n▶ Applying 20260510000006_remove_unused_poi_categories.sql...');
  await pool.query(sql);
  console.log('  ✓ applied');

  console.log('\n▶ Post-state (full distribution):');
  const post = await pool.query(
    `SELECT pc.slug, COUNT(p.id)::int AS count
       FROM poi_categories pc
       LEFT JOIN pois p
         ON p.category_id = pc.id AND p.merged_into IS NULL
      GROUP BY pc.slug
      ORDER BY count DESC, pc.slug`,
  );
  const postMap = new Map(post.rows.map((r) => [r.slug, r.count]));
  for (const r of post.rows) console.log(`   ${r.slug.padEnd(18)} ${String(r.count).padStart(6)}`);

  // Verifications
  const removed = ['alpine', 'wind_solar'];
  const removedOk = removed.every((s) => !postMap.has(s));
  console.log(`\nRemoved targets gone: ${removedOk ? 'PASS' : 'FAIL'}  (${removed.join(', ')})`);

  // Kept categories must have unchanged active-row counts
  let driftCount = 0;
  for (const [slug, before] of preMap.entries()) {
    if (removed.includes(slug)) continue;
    const after = postMap.get(slug);
    if (after !== before) {
      console.log(`  DRIFT: ${slug} ${before} → ${after}`);
      driftCount++;
    }
  }
  const noDrift = driftCount === 0;
  console.log(`Other slug counts unchanged: ${noDrift ? 'PASS' : 'FAIL'}`);

  if (!(removedOk && noDrift)) process.exitCode = 2;
}

main()
  .catch((err) => {
    console.error('ERROR:', err.message ?? err);
    process.exitCode = 1;
  })
  .finally(() => pool.end());
