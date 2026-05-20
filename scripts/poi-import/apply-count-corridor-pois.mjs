// Applier: count_corridor_pois — dedicated fast count RPC.
//
// Applies migration 20260520000002_count_corridor_pois.sql then runs
// verification assertions against the LA→Mammoth 20mi corridor:
//
//   (a) Function exists post-apply (exactly 1 overload)
//   (b) LA→Mammoth 20mi corridor count = 48 (post-C1 baseline per CLAUDE.md)
//   (c) Mirror invariant — count_corridor_pois agrees with
//       count(*) FROM get_corridor_pois(...) on identical params.
//       Load-bearing: if these ever diverge we have a worse bug than
//       the timeout this RPC was created to fix.
//   (d) Curator bypass — count > 0 with min_significance=999
//       (editorial_curated/iconic_local POIs bypass the floor)
//
// Run from: scripts/poi-import/
//   node apply-count-corridor-pois.mjs

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
  '../../supabase/migrations/20260520000002_count_corridor_pois.sql',
);

if (!process.env.DATABASE_URL) {
  console.error('DATABASE_URL not set in .env');
  process.exit(1);
}
if (!existsSync(MIGRATION_PATH)) {
  console.error(`Migration file not found: ${MIGRATION_PATH}`);
  process.exit(1);
}

// LA → Mammoth 20mi corridor — canonical verification route per CLAUDE.md
// (Migration backlog → 20260520000001 entry: "post-C1 48").
const VERIFY_ROUTE_WKT = 'SRID=4326;LINESTRING(-118.2437 34.0522, -118.9722 37.6485)';
const VERIFY_CORRIDOR  = 20;
const POST_C1_BASELINE = 48;

const pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 2 });

async function main() {
  console.log('=== count_corridor_pois — dedicated fast count RPC ===\n');

  console.log('▶ Applying 20260520000002_count_corridor_pois.sql...');
  const sql = readFileSync(MIGRATION_PATH, 'utf8');
  await pool.query(sql);
  console.log('  ✓ applied\n');

  console.log('=== Verifications ===\n');

  // (a) Function exists with exactly 1 overload
  console.log('(a) Function exists post-apply');
  const a = await pool.query(`
    SELECT pg_get_function_identity_arguments(oid) AS args,
           pg_get_function_result(oid)             AS returns
      FROM pg_proc
     WHERE proname = 'count_corridor_pois'
       AND pronamespace = 'public'::regnamespace
  `);
  console.log(`    overloads: ${a.rows.length}`);
  for (const r of a.rows) {
    console.log(`      args:    ${r.args}`);
    console.log(`      returns: ${r.returns}`);
  }
  const aPass = a.rows.length === 1 && a.rows[0].returns === 'bigint';
  console.log(`    pass: ${aPass} (expected 1 overload, returns bigint)\n`);

  // (b) LA→Mammoth 20mi corridor count = 48
  console.log('(b) LA→Mammoth 20mi corridor count = post-C1 baseline');
  const b = await pool.query(
    `SELECT public.count_corridor_pois($1::text, $2::float8, NULL::text[], 'driving'::text, 0::float8) AS n`,
    [VERIFY_ROUTE_WKT, VERIFY_CORRIDOR],
  );
  const count = Number(b.rows[0].n);
  console.log(`    count: ${count} (expected ${POST_C1_BASELINE})`);
  const bPass = count === POST_C1_BASELINE;
  console.log(`    pass: ${bPass}\n`);

  // (c) Mirror invariant — agrees with get_corridor_pois row count
  console.log('(c) Agrees with get_corridor_pois row count (mirror invariant)');
  const c = await pool.query(
    `SELECT count(*)::int AS n
       FROM public.get_corridor_pois($1::text, $2::float8, NULL::text[], 'driving'::text, 0::float8)`,
    [VERIFY_ROUTE_WKT, VERIFY_CORRIDOR],
  );
  const fullCount = c.rows[0].n;
  console.log(`    get_corridor_pois rows: ${fullCount}`);
  console.log(`    count_corridor_pois:     ${count}`);
  const cPass = count === fullCount;
  console.log(`    pass: ${cPass} (expected equal)\n`);

  // (d) Curator bypass — count > 0 with min_significance=999
  console.log('(d) Curator bypass — count > 0 with min_significance=999');
  const d = await pool.query(
    `SELECT public.count_corridor_pois($1::text, $2::float8, NULL::text[], 'driving'::text, 999::float8) AS n`,
    [VERIFY_ROUTE_WKT, VERIFY_CORRIDOR],
  );
  const bypassCount = Number(d.rows[0].n);
  console.log(`    count: ${bypassCount} (expected > 0 — editorial_curated/iconic_local)`);
  const dPass = bypassCount > 0;
  console.log(`    pass: ${dPass}\n`);

  // ── Summary ─────────────────────────────────────────────────────────
  console.log('=== Summary ===');
  console.log(`(a) ${aPass ? 'PASS' : 'FAIL'}  Function exists with 1 overload`);
  console.log(`(b) ${bPass ? 'PASS' : 'FAIL'}  Baseline count = ${POST_C1_BASELINE}`);
  console.log(`(c) ${cPass ? 'PASS' : 'FAIL'}  Mirror invariant with get_corridor_pois`);
  console.log(`(d) ${dPass ? 'PASS' : 'FAIL'}  Curator bypass at min_significance=999`);

  const allPass = aPass && bPass && cPass && dPass;
  if (allPass) {
    console.log('\ncount_corridor_pois verified.');
  } else {
    console.log('\nFAILED — at least one assertion did not pass.');
    process.exitCode = 2;
  }
}

main()
  .catch(err => {
    console.error('ERROR:', err.message ?? err);
    process.exitCode = 1;
  })
  .finally(() => pool.end());
