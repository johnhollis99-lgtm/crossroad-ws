// One-off: apply 20260504000017_get_nearby_pois_confidence_filter.sql,
// also patch get_route_pois with the same filter if it exists, and
// run the three verifications from the task brief.
//
// Run from: scripts/poi-import/
//   node apply-confidence-filter.mjs

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
  '../../supabase/migrations/20260504000017_get_nearby_pois_confidence_filter.sql'
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

  console.log('▶ Applying migration 20260504000017_get_nearby_pois_confidence_filter.sql...');
  await pool.query(sql);
  console.log('  ✓ migration applied');

  // Skip get_route_pois — not present in this codebase
  const routeRpc = await pool.query(
    `SELECT proname FROM pg_proc
     WHERE proname = 'get_route_pois' AND pronamespace = 'public'::regnamespace`
  );
  if (routeRpc.rowCount === 0) {
    console.log('  ✓ get_route_pois not present — skipped per task instructions');
  } else {
    console.log('  ! get_route_pois EXISTS — manual review required (not patched)');
  }

  console.log('\n=== Verifications ===');

  // (a) function definition contains the confidence filter
  const a = await pool.query(
    `SELECT pg_get_functiondef(oid) LIKE '%confidence_score >= 0.5%' AS has_filter
     FROM pg_proc
     WHERE proname = 'get_nearby_pois' AND pronamespace = 'public'::regnamespace`
  );
  const aResult = a.rows[0]?.has_filter === true;
  console.log(`(a) get_nearby_pois body contains "confidence_score >= 0.5": ${aResult}`);

  // (b) count nearby at the test point — expected 0
  const b = await pool.query(
    `SELECT COUNT(*)::int AS n FROM get_nearby_pois(
       32.6028::float8, -117.0235::float8, 100::float8, NULL, NULL, false
     )`
  );
  const bResult = b.rows[0].n;
  console.log(`(b) get_nearby_pois(32.6028, -117.0235, 100, NULL, NULL, false) count: ${bResult} (expected 0)`);

  // (c) NRHP confidence_score distribution among active rows
  const c = await pool.query(
    `SELECT confidence_score, COUNT(*)::int AS n
     FROM pois
     WHERE source_type = 'nrhp' AND merged_into IS NULL
     GROUP BY confidence_score
     ORDER BY confidence_score`
  );
  console.log(`(c) NRHP confidence_score distribution (active rows):`);
  for (const r of c.rows) {
    console.log(`    score=${r.confidence_score}  count=${r.n}`);
  }

  // Pass conditions
  const aPass = aResult === true;
  const bPass = bResult === 0;
  const cMap = Object.fromEntries(c.rows.map(r => [Number(r.confidence_score), r.n]));
  const cZero = cMap[0] ?? 0;
  const cOne = cMap[1] ?? 0;
  const cPass = cZero >= 1500 && cZero <= 2700 && cOne >= 600 && cOne <= 1200;

  console.log(`\n(a) pass: ${aPass}`);
  console.log(`(b) pass: ${bPass}`);
  console.log(`(c) pass (≈2100 at 0, ≈900 at 1): ${cPass}  [actual: 0→${cZero}, 1→${cOne}]`);

  if (aPass && bPass && cPass) {
    console.log('\nRPC patch verified, 4-county import unblocked.');
  } else {
    const which = [];
    if (!aPass) which.push('a');
    if (!bPass) which.push('b');
    if (!cPass) which.push('c');
    console.log(`\nFAILED: verification(s) ${which.join(', ')} did not pass — stopping.`);
    process.exitCode = 2;
  }
}

main()
  .catch(err => {
    console.error('ERROR:', err.message ?? err);
    process.exitCode = 1;
  })
  .finally(() => pool.end());
