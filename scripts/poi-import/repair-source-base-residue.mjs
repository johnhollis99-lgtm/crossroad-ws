// Repair breakdown.source_base on rows inflated by the dedupe.ts:658 clamp bug.
//
// Two repair paths:
//   1. editorial venues (is_venue=true): canonical fresh = 40
//      (literal from seed-venues.ts:468 — the venue significance baseline)
//   2. editorial non-venue, sb=100 (clamp sentinel): canonical fresh =
//      ROUND(confidence_score * 60), per admin/.../actions.ts:59
//      (only fixes the 3 clamp-sentinel rows; non-clamp rows below
//      expected sb are out of scope for this repair)
//
// Run from: scripts/poi-import/
//   node repair-source-base-residue.mjs            # live
//   node repair-source-base-residue.mjs --dry-run  # preview

import { config } from 'dotenv';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import pkg from 'pg';

const { Pool } = pkg;
const __dirname = dirname(fileURLToPath(import.meta.url));
config({ path: resolve(__dirname, '../../.env') });

const dryRun = process.argv.includes('--dry-run');

if (!process.env.DATABASE_URL) {
  console.error('DATABASE_URL not set in .env');
  process.exit(1);
}
const pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 2 });

const VENUE_BASELINE_SB = 40;  // seed-venues.ts:468
const NARRATIVE_SB_FORMULA = 'ROUND(confidence_score::numeric * 60)';  // admin/.../actions.ts:59

const SELECT_VENUES_SQL = `
  SELECT id::text, name, venue_type,
         (significance_breakdown->>'source_base')::int AS sb_now
  FROM pois
  WHERE merged_into IS NULL
    AND source_type = 'editorial'
    AND is_venue = true
    AND (significance_breakdown->>'source_base')::int IS DISTINCT FROM ${VENUE_BASELINE_SB}
  ORDER BY name`;

const SELECT_NARRATIVE_SENTINEL_SQL = `
  SELECT id::text, name,
         (significance_breakdown->>'source_base')::int AS sb_now,
         confidence_score::float AS conf,
         ${NARRATIVE_SB_FORMULA}::int AS sb_target
  FROM pois
  WHERE merged_into IS NULL
    AND source_type = 'editorial'
    AND is_venue = false
    AND (significance_breakdown->>'source_base')::int = 100
  ORDER BY name`;

const UPDATE_VENUE_SB_SQL = `
  UPDATE pois
  SET significance_breakdown = jsonb_set(significance_breakdown, '{source_base}', to_jsonb(${VENUE_BASELINE_SB}::int))
  WHERE id = $1`;

const UPDATE_NARRATIVE_SB_SQL = `
  UPDATE pois
  SET significance_breakdown = jsonb_set(
        significance_breakdown,
        '{source_base}',
        to_jsonb(${NARRATIVE_SB_FORMULA}::int)
      )
  WHERE id = $1`;

async function main() {
  console.log(dryRun ? '— DRY RUN —\n' : '— LIVE —\n');

  const venues = await pool.query(SELECT_VENUES_SQL);
  const narrative = await pool.query(SELECT_NARRATIVE_SENTINEL_SQL);

  console.log(`▶ Path 1: editorial venues to repair (sb -> ${VENUE_BASELINE_SB})`);
  console.log(`  ${venues.rowCount} rows:\n`);
  for (const r of venues.rows) {
    console.log(`    ${r.id}  sb=${r.sb_now}→${VENUE_BASELINE_SB}  ${String(r.venue_type ?? '?').padEnd(17)}  ${r.name}`);
  }

  console.log(`\n▶ Path 2: editorial narrative-promoted with clamp sentinel (sb=100)`);
  console.log(`  ${narrative.rowCount} rows:\n`);
  for (const r of narrative.rows) {
    console.log(`    ${r.id}  sb=${r.sb_now}→${r.sb_target}  conf=${Number(r.conf).toFixed(2)}  ${r.name}`);
  }

  if (dryRun) {
    console.log('\n— DRY RUN — no UPDATEs sent.');
    return;
  }

  console.log('\n▶ Applying updates in a single transaction\n');
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    let n = 0;
    for (const r of venues.rows) {
      const res = await client.query(UPDATE_VENUE_SB_SQL, [r.id]);
      n += res.rowCount;
    }
    let m = 0;
    for (const r of narrative.rows) {
      const res = await client.query(UPDATE_NARRATIVE_SB_SQL, [r.id]);
      m += res.rowCount;
    }
    await client.query('COMMIT');
    console.log(`  ✓ committed; ${n} venue + ${m} narrative = ${n + m} total rows updated`);
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }

  // Verify
  const after1 = await pool.query(SELECT_VENUES_SQL);
  const after2 = await pool.query(SELECT_NARRATIVE_SENTINEL_SQL);
  console.log(`\n▶ Post-update verification`);
  console.log(`  venue rows still sb!=${VENUE_BASELINE_SB}: ${after1.rowCount}  (expected 0)`);
  console.log(`  narrative rows still sb=100              : ${after2.rowCount}  (expected 0)`);
  if (after1.rowCount !== 0 || after2.rowCount !== 0) {
    console.error('\n  ! verification failed');
    process.exitCode = 2;
  }
}

main()
  .catch((err) => {
    console.error('ERROR:', err.message ?? err);
    process.exitCode = 1;
  })
  .finally(() => pool.end());
