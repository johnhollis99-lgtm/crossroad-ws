// Applier: G2 — per-category significance floors wired into live runtime.
//
// Applies two migrations in sequence then runs four verification queries:
//   1. supabase/migrations/20260519000003_category_significance_floors_seed_g2.sql
//   2. supabase/migrations/20260519000004_rpc_pois_floor_and_priority.sql
//
// Verifications:
//   (a) category_significance_floors row count + values
//   (b) editorial_curated POIs surface with priority_tier='curator'
//   (c) sub-90 architecture (not curated, not iconic) does NOT surface
//   (d) total post-floor count is reasonable
//
// Run from: scripts/poi-import/
//   node apply-g2-floors.mjs

import { config } from 'dotenv';
import { readFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import pkg from 'pg';

const { Pool } = pkg;
const __dirname = dirname(fileURLToPath(import.meta.url));

config({ path: resolve(__dirname, '../../.env') });

const MIGRATIONS = [
  resolve(__dirname, '../../supabase/migrations/20260519000003_category_significance_floors_seed_g2.sql'),
  resolve(__dirname, '../../supabase/migrations/20260519000004_rpc_pois_floor_and_priority.sql'),
];

if (!process.env.DATABASE_URL) {
  console.error('DATABASE_URL not set in .env');
  process.exit(1);
}
for (const path of MIGRATIONS) {
  if (!existsSync(path)) {
    console.error(`Migration file not found: ${path}`);
    process.exit(1);
  }
}

// LA → Mammoth as the verification corridor. We know it carries 26
// editorial_curated POIs (the 2026-05-18 seed) so (b) is guaranteed
// to have rows. 20mi corridor is generous enough to catch nearby
// architecture POIs for (c).
const VERIFY_ROUTE_WKT = 'SRID=4326;LINESTRING(-118.2437 34.0522, -118.9722 37.6485)';
const VERIFY_CORRIDOR_MI = 20;

const pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 2 });

function fmt(n) {
  return typeof n === 'number' ? n.toLocaleString() : String(n);
}

async function applyMigration(path) {
  const filename = path.split(/[/\\]/).pop();
  const sql = readFileSync(path, 'utf8');
  console.log(`▶ Applying ${filename}...`);
  await pool.query(sql);
  console.log(`  ✓ applied`);
}

async function main() {
  console.log('=== G2-floors apply ===\n');

  for (const path of MIGRATIONS) {
    await applyMigration(path);
  }

  console.log('\n=== Verifications ===\n');

  // (a) Seed table row count + content
  console.log('(a) category_significance_floors final state');
  const a = await pool.query(
    `SELECT category, significance_floor
       FROM public.category_significance_floors
      ORDER BY category`,
  );
  console.log(`    rows: ${a.rows.length}`);
  for (const r of a.rows) {
    console.log(`      ${r.category.padEnd(16)} ${r.significance_floor}`);
  }
  const expectedFloors = {
    architecture:   90,
    art:            75,
    bridges:        70,
    dams:           70,
    engineering:    70,
    food_drink:      0,
    geology:        60,
    hidden_gems:    70,
    history:        70,
    hot_springs:    60,
    local_culture:  70,
    mining:         70,
    native_history: 70,
    nature:         65,
    recreation:     70,
    viewpoint:      65,
    volcanic:       60,
  };
  const aPass =
    a.rows.length === 17 &&
    a.rows.every(r => expectedFloors[r.category] === r.significance_floor);
  console.log(`    pass: ${aPass} (expected 17 rows with the curator-specified values)\n`);

  // (b) editorial_curated POIs surface with priority_tier='curator'
  console.log("(b) editorial_curated POIs surface with priority_tier='curator'");
  const b = await pool.query(
    `SELECT id, name, category, significance_score, priority_tier
       FROM public.get_corridor_pois($1::text, $2::float8, NULL::text[], 'driving'::text, 0::float8)
      WHERE priority_tier = 'curator'
      LIMIT 5`,
    [VERIFY_ROUTE_WKT, VERIFY_CORRIDOR_MI],
  );
  console.log(`    rows: ${b.rows.length}`);
  for (const r of b.rows) {
    console.log(`      ${r.priority_tier.padEnd(10)} ${r.category.padEnd(14)} sig=${r.significance_score} — ${r.name}`);
  }
  const bPass = b.rows.length >= 1 && b.rows.every(r => r.priority_tier === 'curator');
  console.log(`    pass: ${bPass} (expected 1+ rows, all priority_tier='curator')\n`);

  // (c) sub-90 architecture (not curated, not iconic) should NOT surface
  console.log("(c) sub-90 architecture (not curated, not iconic) is rejected");
  const c = await pool.query(
    `SELECT count(*)::int AS leaked
       FROM public.get_corridor_pois($1::text, $2::float8, ARRAY['architecture']::text[], 'driving'::text, 0::float8)
      WHERE significance_score BETWEEN 80 AND 89
        AND priority_tier = 'standard'`,
    [VERIFY_ROUTE_WKT, VERIFY_CORRIDOR_MI],
  );
  const cLeaked = c.rows[0].leaked;
  console.log(`    leaked rows (architecture 80-89, standard tier): ${cLeaked}`);
  const cPass = cLeaked === 0;
  console.log(`    pass: ${cPass} (expected 0)\n`);

  // (d) Total post-floor count
  console.log('(d) total post-floor count is reasonable');
  const d = await pool.query(
    `SELECT count(*)::int AS n
       FROM public.get_corridor_pois($1::text, $2::float8, NULL::text[], 'driving'::text, 0::float8)`,
    [VERIFY_ROUTE_WKT, VERIFY_CORRIDOR_MI],
  );
  const dTotal = d.rows[0].n;
  console.log(`    LA→Mammoth 20mi corridor total: ${fmt(dTotal)}`);
  // Reasonable bounds: > 20 (the floor isn't excluding everything;
  // LA→Mammoth catches the 26 editorial seeds plus organic above-floor
  // standard-tier surfaces), not 22000+ (the floor IS doing something —
  // pre-G2 unbounded would return all in-corridor rows on a long route).
  const dPass = dTotal > 20 && dTotal < 22000;
  console.log(`    pass: ${dPass} (expected > 20 and < 22,000)\n`);

  // Tier breakdown (informational)
  const tierBreakdown = await pool.query(
    `SELECT priority_tier, count(*)::int AS n
       FROM public.get_corridor_pois($1::text, $2::float8, NULL::text[], 'driving'::text, 0::float8)
      GROUP BY priority_tier
      ORDER BY priority_tier`,
    [VERIFY_ROUTE_WKT, VERIFY_CORRIDOR_MI],
  );
  console.log('    Tier breakdown:');
  for (const r of tierBreakdown.rows) {
    console.log(`      ${r.priority_tier.padEnd(10)} ${fmt(r.n)}`);
  }

  console.log('\n=== Summary ===');
  console.log(`(a) ${aPass ? 'PASS' : 'FAIL'}  seed table`);
  console.log(`(b) ${bPass ? 'PASS' : 'FAIL'}  curator tier surfaces`);
  console.log(`(c) ${cPass ? 'PASS' : 'FAIL'}  sub-90 architecture rejected`);
  console.log(`(d) ${dPass ? 'PASS' : 'FAIL'}  reasonable total count`);

  const allPass = aPass && bPass && cPass && dPass;
  if (allPass) {
    console.log('\nG2-floors verified.');
  } else {
    console.log('\nFAILED — at least one verification did not pass.');
    process.exitCode = 2;
  }
}

main()
  .catch(err => {
    console.error('ERROR:', err.message ?? err);
    process.exitCode = 1;
  })
  .finally(() => pool.end());
