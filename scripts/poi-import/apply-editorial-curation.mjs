// One-off: apply 20260518000003_pois_editorial_curation.sql and verify.
//
// Run from: scripts/poi-import/
//   node apply-editorial-curation.mjs

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
  '../../supabase/migrations/20260518000003_pois_editorial_curation.sql',
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

const EXPECTED_COLUMNS = [
  { name: 'editorial_curated',       data_type: 'boolean',                     nullable: 'YES', default: null },
  { name: 'editorial_curated_at',    data_type: 'timestamp with time zone',    nullable: 'YES', default: null },
  { name: 'editorial_curated_by',    data_type: 'text',                        nullable: 'YES', default: "'curator'::text" },
  { name: 'editorial_curation_note', data_type: 'text',                        nullable: 'YES', default: null },
  { name: 'editorial_score_boost',   data_type: 'smallint',                    nullable: 'NO',  default: '0' },
];

async function main() {
  const sql = readFileSync(MIGRATION_PATH, 'utf8');

  console.log('▶ Applying migration 20260518000003_pois_editorial_curation.sql...');
  await pool.query(sql);
  console.log('  ✓ migration applied');

  console.log('\n=== Verifications ===');

  // (a) Column inspection
  const colRes = await pool.query(
    `SELECT column_name, data_type, is_nullable, column_default
       FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name   = 'pois'
        AND column_name LIKE 'editorial_%'
      ORDER BY column_name`,
  );
  console.log('(a) editorial_* columns on public.pois:');
  let allOk = true;
  const seen = new Map();
  for (const row of colRes.rows) seen.set(row.column_name, row);
  for (const expected of EXPECTED_COLUMNS) {
    const actual = seen.get(expected.name);
    if (!actual) {
      console.log(`     ✗ missing: ${expected.name}`);
      allOk = false;
      continue;
    }
    const typeOk = actual.data_type === expected.data_type;
    const nullOk = actual.is_nullable === expected.nullable;
    const defOk = (actual.column_default ?? null) === (expected.default ?? null);
    const mark = (typeOk && nullOk && defOk) ? '✓' : '✗';
    console.log(`     ${mark} ${expected.name.padEnd(26)} ${actual.data_type.padEnd(24)} nullable=${actual.is_nullable} default=${actual.column_default ?? 'NULL'}`);
    if (!(typeOk && nullOk && defOk)) allOk = false;
  }
  if (!allOk) process.exitCode = 2;

  // (b) Index check
  const idxRes = await pool.query(
    `SELECT indexname, indexdef
       FROM pg_indexes
      WHERE schemaname = 'public'
        AND tablename  = 'pois'
        AND indexname  = 'idx_pois_editorial_curated_true'`,
  );
  if (idxRes.rows.length === 0) {
    console.log('(b) ✗ partial index idx_pois_editorial_curated_true missing');
    process.exitCode = 2;
  } else {
    console.log(`(b) ✓ ${idxRes.rows[0].indexname}`);
    console.log(`       ${idxRes.rows[0].indexdef}`);
  }

  // (c) Sanity: no rows touched, all default to NULL/0/'curator'
  const sanityRes = await pool.query(
    `SELECT COUNT(*)                                              AS total_live,
            COUNT(*) FILTER (WHERE editorial_curated = TRUE)      AS approved,
            COUNT(*) FILTER (WHERE editorial_curated = FALSE)     AS rejected,
            COUNT(*) FILTER (WHERE editorial_curated IS NULL)     AS unreviewed,
            COUNT(*) FILTER (WHERE editorial_score_boost > 0)     AS boosted,
            COUNT(*) FILTER (WHERE editorial_curated_at IS NOT NULL) AS timestamped
       FROM public.pois
      WHERE merged_into IS NULL`,
  );
  const r = sanityRes.rows[0];
  console.log(`(c) live POIs: total=${r.total_live}  approved=${r.approved}  rejected=${r.rejected}  unreviewed=${r.unreviewed}  boosted=${r.boosted}  timestamped=${r.timestamped}`);
  if (Number(r.approved) > 0 || Number(r.rejected) > 0 || Number(r.boosted) > 0 || Number(r.timestamped) > 0) {
    console.log('    NOTE: some existing rows are not at defaults — investigate before importing curator decisions.');
    process.exitCode = 2;
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
