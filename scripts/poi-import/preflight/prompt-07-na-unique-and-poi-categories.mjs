// Pre-flight checks for Prompt 07 (activate Prompt 06 staged work).
// Read-only. Runs the three verification queries from the prompt against
// the live DB.
//
// Run from repo root:
//   node scripts/poi-import/preflight/prompt-07-na-unique-and-poi-categories.mjs

import { config } from 'dotenv';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import pkg from 'pg';

const { Pool } = pkg;
const __dirname = dirname(fileURLToPath(import.meta.url));

config({ path: resolve(__dirname, '../../../.env') });

if (!process.env.DATABASE_URL) {
  console.error('DATABASE_URL not set in .env');
  process.exit(1);
}

const pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 2 });

async function main() {
  console.log('=== Step 2: Live narration_audio UNIQUE constraints ===\n');
  const ua = await pool.query(
    `SELECT conname, pg_get_constraintdef(oid) AS def
       FROM pg_constraint
      WHERE conrelid = 'public.narration_audio'::regclass
        AND contype = 'u'
      ORDER BY conname`,
  );
  if (ua.rows.length === 0) {
    console.log('(no UNIQUE constraints reported by pg_constraint)');
  }
  for (const r of ua.rows) {
    console.log(`  ${r.conname}: ${r.def}`);
  }

  // pg_constraint only lists table-level constraints; if na_unique is a
  // bare UNIQUE INDEX (not promoted to a constraint), surface that too.
  const ui = await pool.query(
    `SELECT indexname, indexdef
       FROM pg_indexes
      WHERE schemaname = 'public'
        AND tablename = 'narration_audio'
        AND indexdef ILIKE '%UNIQUE%'
      ORDER BY indexname`,
  );
  console.log('\n  unique indexes (pg_indexes):');
  for (const r of ui.rows) {
    console.log(`    ${r.indexname}: ${r.indexdef}`);
  }

  console.log('\n=== Step 3: Live pois category distribution ===\n');
  // Note: the prompt's query uses `category` but `pois` has `category_id`
  // (5.15 ghost-column note). Join through poi_categories.
  const cat = await pool.query(
    `SELECT pc.slug, COUNT(p.id)::int AS count
       FROM poi_categories pc
       LEFT JOIN pois p
         ON p.category_id = pc.id AND p.merged_into IS NULL
      GROUP BY pc.slug
      ORDER BY count DESC, pc.slug`,
  );
  for (const r of cat.rows) {
    console.log(`  ${r.slug.padEnd(18)} ${String(r.count).padStart(6)}`);
  }

  console.log('\n=== Cross-check: 0006 removal targets ===\n');
  const rm = await pool.query(
    `SELECT pc.slug,
            COUNT(p.id) FILTER (WHERE p.merged_into IS NULL)::int AS active,
            COUNT(p.id)::int AS any_ref
       FROM poi_categories pc
       LEFT JOIN pois p ON p.category_id = pc.id
      WHERE pc.slug IN ('alpine','wind_solar')
      GROUP BY pc.slug`,
  );
  if (rm.rows.length === 0) {
    console.log('  (neither slug exists in poi_categories — already removed?)');
  }
  for (const r of rm.rows) {
    console.log(`  ${r.slug}: active=${r.active} any_ref=${r.any_ref}`);
  }
}

main()
  .catch(err => {
    console.error('ERROR:', err.message ?? err);
    process.exitCode = 1;
  })
  .finally(() => pool.end());
