// One-off: apply 20260510000005_na_unique_add_mode.sql
// Verifies post-state by re-running the pg_constraint query from the prompt.
//
// Run from repo root:
//   node scripts/poi-import/apply-na-unique-add-mode.mjs

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
  '../../supabase/migrations/20260510000005_na_unique_add_mode.sql',
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

  console.log('▶ Pre-state:');
  const pre = await pool.query(
    `SELECT conname, pg_get_constraintdef(oid) AS def
       FROM pg_constraint
      WHERE conrelid = 'public.narration_audio'::regclass
        AND contype = 'u'`,
  );
  for (const r of pre.rows) console.log(`   ${r.conname}: ${r.def}`);

  console.log('\n▶ Applying 20260510000005_na_unique_add_mode.sql...');
  await pool.query(sql);
  console.log('  ✓ applied');

  console.log('\n▶ Post-state:');
  const post = await pool.query(
    `SELECT conname, pg_get_constraintdef(oid) AS def
       FROM pg_constraint
      WHERE conrelid = 'public.narration_audio'::regclass
        AND contype = 'u'`,
  );
  for (const r of post.rows) console.log(`   ${r.conname}: ${r.def}`);

  const ok = post.rows.some(
    (r) => r.conname === 'na_unique' &&
           /\(poi_id, narrator_slug, depth, mode\)/.test(r.def),
  );

  console.log(`\nVerification ${ok ? 'PASS' : 'FAIL'}`);
  if (!ok) process.exitCode = 2;
}

main()
  .catch((err) => {
    console.error('ERROR:', err.message ?? err);
    process.exitCode = 1;
  })
  .finally(() => pool.end());
