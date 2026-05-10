// One-off: apply 20260504000020_narration_audio_text.sql and verify.
//
// Run from: scripts/poi-import/
//   node apply-narration-text.mjs

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
  '../../supabase/migrations/20260504000020_narration_audio_text.sql',
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

  console.log('▶ Applying migration 20260504000020_narration_audio_text.sql...');
  await pool.query(sql);
  console.log('  ✓ migration applied');

  console.log('\n=== Verifications ===');

  // (a) information_schema column inspection
  const a = await pool.query(
    `SELECT column_name, data_type, is_nullable, column_default
       FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name   = 'narration_audio'
        AND column_name  = 'narration_text'`,
  );
  if (a.rows.length === 0) {
    console.log('(a) FAIL: narration_audio.narration_text not found');
    process.exitCode = 2;
  } else {
    const row = a.rows[0];
    const expectType = row.data_type === 'text';
    const expectNullable = row.is_nullable === 'YES';
    const expectNoDefault = row.column_default === null;
    console.log('(a) information_schema row:');
    console.log(`     data_type:      ${row.data_type}        ${expectType ? '✓' : '✗'}`);
    console.log(`     is_nullable:    ${row.is_nullable}      ${expectNullable ? '✓' : '✗'}`);
    console.log(`     column_default: ${row.column_default}   ${expectNoDefault ? '✓' : '✗'}`);
    if (!expectType || !expectNullable || !expectNoDefault) {
      process.exitCode = 2;
    }
  }

  // (b) Sanity: existing rows are NULL on the new column
  const b = await pool.query(
    `SELECT
        COUNT(*)                                 AS total_rows,
        COUNT(*) FILTER (WHERE narration_text IS NULL) AS null_text_rows
       FROM narration_audio`,
  );
  const tot = Number(b.rows[0].total_rows);
  const nul = Number(b.rows[0].null_text_rows);
  console.log(`(b) narration_audio rows: total=${tot}  narration_text IS NULL=${nul}`);
  if (tot > 0 && tot !== nul) {
    console.log('    NOTE: some existing rows already have narration_text set — backfill not blank as expected.');
  }

  if (process.exitCode) {
    console.log('\nFAILED — at least one verification did not pass.');
  } else {
    console.log('\nMigration verified.');
  }
}

main()
  .catch(err => {
    console.error('ERROR:', err.message ?? err);
    process.exitCode = 1;
  })
  .finally(() => pool.end());
