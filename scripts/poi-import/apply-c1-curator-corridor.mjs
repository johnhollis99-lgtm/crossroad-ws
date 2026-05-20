// Applier: C1 — RPC corridor extension for curator/iconic POIs.
//
// Applies migration 20260520000001_rpc_pois_curator_corridor_extension.sql
// then runs 8 verification assertions:
//
//   (a)  pre-apply baseline LA→Mammoth 20mi corridor count (capture
//        the G2 floor of 42; for post-apply comparison)
//   (b)  post-C1 count: >= 42 with modest growth from the 20-25mi
//        curator band
//   (c)  e893d57e Jawbone Siphon (24.94mi) present, priority_tier='curator'
//   (c2) 7453f2d8 Adventure City (21.80mi) present, priority_tier='curator'
//   (d)  a7cbe01f Korean Bell of Friendship (23.78mi, standard) absent
//   (e)  6dbb1b74 Mount Whitney (25.02mi, 32m past cap) absent
//   (e2) 4ccceb49 Red Rock Canyon SP (28.68mi) absent
//   (f1) Vasquez Rocks (5af766ba) surfaces via get_nearby_pois at point
//        (34.60, -118.10) ≈14.7mi away with 5mi radius — curator bypass
//   (f2) Vasquez Rocks does NOT surface from point (34.0522, -118.2437)
//        (downtown LA, 30mi away, past 25mi cap)
//
// Test POI UUIDs are hardcoded (per the curator-approved Part 1 plan)
// rather than dynamically discovered — locks in the specific catalog
// state we verified against.
//
// Run from: scripts/poi-import/
//   node apply-c1-curator-corridor.mjs

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
  '../../supabase/migrations/20260520000001_rpc_pois_curator_corridor_extension.sql',
);

if (!process.env.DATABASE_URL) {
  console.error('DATABASE_URL not set in .env');
  process.exit(1);
}
if (!existsSync(MIGRATION_PATH)) {
  console.error(`Migration file not found: ${MIGRATION_PATH}`);
  process.exit(1);
}

// LA → Mammoth as the canonical verification route. We know it carries
// 26 editorial_curated POIs (the 2026-05-18 seed), and the G2 baseline
// is 42 total rows in the 20mi corridor.
const VERIFY_ROUTE_WKT  = 'SRID=4326;LINESTRING(-118.2437 34.0522, -118.9722 37.6485)';
const VERIFY_CORRIDOR   = 20;

// Hardcoded test POI UUIDs per curator-approved Part 1 plan.
const POI_JAWBONE       = 'e893d57e';  // 24.94mi curator — should surface
const POI_ADVENTURE     = '7453f2d8';  // 21.80mi curator — should surface
const POI_KOREAN_BELL   = 'a7cbe01f';  // 23.78mi standard — should NOT surface
const POI_WHITNEY       = '6dbb1b74';  // 25.02mi curator (32m past cap) — should NOT surface
const POI_RED_ROCK      = '4ccceb49';  // 28.68mi curator — should NOT surface
const POI_VASQUEZ       = '5af766ba';  // curator, used for nearby tests

// Nearby test geometry
const NEARBY_POINT_NEAR = { lat: 34.60,   lng: -118.10   }; // ≈14.7mi from Vasquez
const NEARBY_POINT_FAR  = { lat: 34.0522, lng: -118.2437 }; // ≈30mi from Vasquez (downtown LA)
const NEARBY_RADIUS_M   = 8047;  // 5mi — small enough that bypass-vs-standard is distinct

const pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 2 });

function fmt(n) {
  return typeof n === 'number' ? n.toLocaleString() : String(n);
}

async function main() {
  console.log('=== C1 — curator/iconic corridor extension ===\n');

  // ── Pre-apply: capture baseline (assertion a) ───────────────────────
  console.log('(a) Pre-apply baseline: LA→Mammoth 20mi corridor count');
  const aBefore = await pool.query(
    `SELECT count(*)::int AS n
       FROM public.get_corridor_pois($1::text, $2::float8, NULL::text[], 'driving'::text, 0::float8)`,
    [VERIFY_ROUTE_WKT, VERIFY_CORRIDOR],
  );
  const baseline = aBefore.rows[0].n;
  console.log(`    baseline: ${baseline} (G2 expected 42)\n`);

  // ── Apply migration ─────────────────────────────────────────────────
  console.log('▶ Applying 20260520000001_rpc_pois_curator_corridor_extension.sql...');
  const sql = readFileSync(MIGRATION_PATH, 'utf8');
  await pool.query(sql);
  console.log('  ✓ applied\n');

  // ── Post-apply assertions ───────────────────────────────────────────
  console.log('=== Verifications ===\n');

  // (b) Post-C1 corridor count: >= baseline (curator/iconic 20-25mi POIs add)
  console.log('(b) Post-C1 corridor count: >= baseline, modest growth');
  const b = await pool.query(
    `SELECT count(*)::int AS n
       FROM public.get_corridor_pois($1::text, $2::float8, NULL::text[], 'driving'::text, 0::float8)`,
    [VERIFY_ROUTE_WKT, VERIFY_CORRIDOR],
  );
  const postCount = b.rows[0].n;
  const growth    = postCount - baseline;
  console.log(`    post-C1: ${postCount} (baseline ${baseline}, +${growth})`);
  const bPass = postCount >= baseline && growth > 0;
  console.log(`    pass: ${bPass} (expected >= ${baseline} with growth > 0)\n`);

  // (c) Jawbone Siphon present with priority_tier='curator'
  console.log('(c) e893d57e Jawbone Siphon (24.94mi curator) surfaces');
  const c = await pool.query(
    `SELECT id, name, priority_tier
       FROM public.get_corridor_pois($1::text, $2::float8, NULL::text[], 'driving'::text, 0::float8)
      WHERE id LIKE $3 || '%'`,
    [VERIFY_ROUTE_WKT, VERIFY_CORRIDOR, POI_JAWBONE],
  );
  console.log(`    rows: ${c.rows.length}`);
  for (const r of c.rows) console.log(`      ${r.priority_tier.padEnd(10)} — ${r.name}`);
  const cPass = c.rows.length === 1 && c.rows[0].priority_tier === 'curator';
  console.log(`    pass: ${cPass} (expected 1 row, tier='curator')\n`);

  // (c2) Adventure City present with priority_tier='curator'
  console.log('(c2) 7453f2d8 Adventure City (21.80mi curator) surfaces');
  const c2 = await pool.query(
    `SELECT id, name, priority_tier
       FROM public.get_corridor_pois($1::text, $2::float8, NULL::text[], 'driving'::text, 0::float8)
      WHERE id LIKE $3 || '%'`,
    [VERIFY_ROUTE_WKT, VERIFY_CORRIDOR, POI_ADVENTURE],
  );
  console.log(`    rows: ${c2.rows.length}`);
  for (const r of c2.rows) console.log(`      ${r.priority_tier.padEnd(10)} — ${r.name}`);
  const c2Pass = c2.rows.length === 1 && c2.rows[0].priority_tier === 'curator';
  console.log(`    pass: ${c2Pass} (expected 1 row, tier='curator')\n`);

  // (d) Korean Bell of Friendship absent (standard tier outside corridor)
  console.log('(d) a7cbe01f Korean Bell (23.78mi standard) does NOT surface');
  const d = await pool.query(
    `SELECT count(*)::int AS n
       FROM public.get_corridor_pois($1::text, $2::float8, NULL::text[], 'driving'::text, 0::float8)
      WHERE id LIKE $3 || '%'`,
    [VERIFY_ROUTE_WKT, VERIFY_CORRIDOR, POI_KOREAN_BELL],
  );
  console.log(`    rows: ${d.rows[0].n}`);
  const dPass = d.rows[0].n === 0;
  console.log(`    pass: ${dPass} (expected 0 — standard tier no bypass)\n`);

  // (e) Mount Whitney absent (25.02mi, 32m past cap)
  console.log('(e) 6dbb1b74 Mount Whitney (25.02mi curator, 32m past cap) excluded');
  const e = await pool.query(
    `SELECT count(*)::int AS n
       FROM public.get_corridor_pois($1::text, $2::float8, NULL::text[], 'driving'::text, 0::float8)
      WHERE id LIKE $3 || '%'`,
    [VERIFY_ROUTE_WKT, VERIFY_CORRIDOR, POI_WHITNEY],
  );
  console.log(`    rows: ${e.rows[0].n}`);
  const ePass = e.rows[0].n === 0;
  console.log(`    pass: ${ePass} (expected 0 — beyond 25mi cap)\n`);

  // (e2) Red Rock Canyon SP absent (28.68mi past cap)
  console.log('(e2) 4ccceb49 Red Rock Canyon SP (28.68mi curator) excluded');
  const e2 = await pool.query(
    `SELECT count(*)::int AS n
       FROM public.get_corridor_pois($1::text, $2::float8, NULL::text[], 'driving'::text, 0::float8)
      WHERE id LIKE $3 || '%'`,
    [VERIFY_ROUTE_WKT, VERIFY_CORRIDOR, POI_RED_ROCK],
  );
  console.log(`    rows: ${e2.rows[0].n}`);
  const e2Pass = e2.rows[0].n === 0;
  console.log(`    pass: ${e2Pass} (expected 0 — beyond 25mi cap)\n`);

  // (f1) Vasquez Rocks via get_nearby_pois at ≈14.7mi (curator bypass)
  console.log("(f1) get_nearby_pois near point Vasquez bypass test (14.7mi from POI, 5mi radius)");
  const f1 = await pool.query(
    `SELECT id, name, priority_tier,
            ROUND((distance_m / 1609.34)::numeric, 2) AS dist_mi
       FROM public.get_nearby_pois(
         $1::float8, $2::float8, $3::float8,
         NULL::text[], 'driving'::text, false, 0::float8)
      WHERE id LIKE $4 || '%'`,
    [NEARBY_POINT_NEAR.lat, NEARBY_POINT_NEAR.lng, NEARBY_RADIUS_M, POI_VASQUEZ],
  );
  console.log(`    rows: ${f1.rows.length}`);
  for (const r of f1.rows) console.log(`      ${r.priority_tier.padEnd(10)} ${r.dist_mi}mi — ${r.name}`);
  const f1Pass = f1.rows.length === 1 && f1.rows[0].priority_tier === 'curator';
  console.log(`    pass: ${f1Pass} (expected 1 row, tier='curator')\n`);

  // (f2) Vasquez Rocks does NOT surface from downtown LA (30mi past cap)
  console.log("(f2) get_nearby_pois Vasquez over-cap test (30mi from POI, 5mi radius)");
  const f2 = await pool.query(
    `SELECT count(*)::int AS n
       FROM public.get_nearby_pois(
         $1::float8, $2::float8, $3::float8,
         NULL::text[], 'driving'::text, false, 0::float8)
      WHERE id LIKE $4 || '%'`,
    [NEARBY_POINT_FAR.lat, NEARBY_POINT_FAR.lng, NEARBY_RADIUS_M, POI_VASQUEZ],
  );
  console.log(`    rows: ${f2.rows[0].n}`);
  const f2Pass = f2.rows[0].n === 0;
  console.log(`    pass: ${f2Pass} (expected 0 — beyond 25mi cap)\n`);

  // ── Summary ─────────────────────────────────────────────────────────
  console.log('=== Summary ===');
  console.log(`(b)  ${bPass  ? 'PASS' : 'FAIL'}  post-C1 count >= baseline + growth`);
  console.log(`(c)  ${cPass  ? 'PASS' : 'FAIL'}  Jawbone Siphon surfaces (24.94mi)`);
  console.log(`(c2) ${c2Pass ? 'PASS' : 'FAIL'}  Adventure City surfaces (21.80mi)`);
  console.log(`(d)  ${dPass  ? 'PASS' : 'FAIL'}  Korean Bell absent (standard, no bypass)`);
  console.log(`(e)  ${ePass  ? 'PASS' : 'FAIL'}  Mt Whitney absent (32m past cap)`);
  console.log(`(e2) ${e2Pass ? 'PASS' : 'FAIL'}  Red Rock Canyon absent (28.68mi past cap)`);
  console.log(`(f1) ${f1Pass ? 'PASS' : 'FAIL'}  Vasquez Rocks via nearby bypass (14.7mi)`);
  console.log(`(f2) ${f2Pass ? 'PASS' : 'FAIL'}  Vasquez Rocks absent over-cap (30mi)`);

  const allPass = bPass && cPass && c2Pass && dPass && ePass && e2Pass && f1Pass && f2Pass;
  if (allPass) {
    console.log('\nC1 verified.');
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
