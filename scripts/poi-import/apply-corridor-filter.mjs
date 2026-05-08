// One-off: apply 20260504000018_get_corridor_pois_confidence_filter.sql
// and run the verifications from the task brief.
//
// Run from: scripts/poi-import/
//   node apply-corridor-filter.mjs

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
  '../../supabase/migrations/20260504000018_get_corridor_pois_confidence_filter.sql',
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

  console.log('▶ Applying migration 20260504000018_get_corridor_pois_confidence_filter.sql...');
  await pool.query(sql);
  console.log('  ✓ migration applied');

  console.log('\n=== Verifications ===');

  // (a) function definition contains both filters
  const a = await pool.query(
    `SELECT
       pg_get_functiondef(oid) LIKE '%merged_into IS NULL%'        AS merged_filter,
       pg_get_functiondef(oid) LIKE '%confidence_score >= 0.5%'    AS conf_filter
     FROM pg_proc
     WHERE proname = 'get_corridor_pois' AND pronamespace = 'public'::regnamespace`,
  );
  const aMerged = a.rows[0]?.merged_filter === true;
  const aConf   = a.rows[0]?.conf_filter   === true;
  console.log(`(a) get_corridor_pois has merged_into filter:        ${aMerged}`);
  console.log(`    get_corridor_pois has confidence_score >= 0.5:   ${aConf}`);

  // (b1) Synthetic corridor through (32.6028, -117.0235) — should return 0 NRHP placeholder rows.
  // Build a tiny corridor (~50m east-west) centered on the test point.
  const route1WKT = `LINESTRING(-117.0240 32.6028, -117.0230 32.6028)`;
  const b1 = await pool.query(
    `SELECT COUNT(*) FILTER (WHERE EXISTS (
        SELECT 1 FROM pois p
         WHERE p.id::text = r.id
           AND p.source_type = 'nrhp'
           AND p.confidence_score < 0.5
      ))::int AS nrhp_placeholders,
      COUNT(*)::int AS total_rows
     FROM get_corridor_pois($1::text, 0.1::float8, NULL::text[], NULL::text) r`,
    [route1WKT],
  );
  const b1Placeholders = b1.rows[0].nrhp_placeholders;
  const b1Total        = b1.rows[0].total_rows;
  console.log(`(b1) corridor through (32.6028, -117.0235), w=0.1mi: total=${b1Total}, nrhp_placeholders=${b1Placeholders} (expected 0)`);

  // (b2) Pick a random merged-into secondary, build a corridor passing
  // through its location, and confirm that secondary doesn't appear in
  // the result (and isn't included via its own row at all).
  const sec = await pool.query(
    `SELECT id::text AS id, name,
            ST_Y(location::geometry) AS lat,
            ST_X(location::geometry) AS lng
       FROM pois
      WHERE merged_into IS NOT NULL
        AND location IS NOT NULL
      ORDER BY random()
      LIMIT 1`,
  );
  if (sec.rows.length === 0) {
    console.log('(b2) no merged-into rows found (skipping)');
  } else {
    const s = sec.rows[0];
    // Tight 0.05 mile corridor (~80m) centered on the secondary's location.
    const dLng = 0.0005;
    const route2WKT = `LINESTRING(${(Number(s.lng) - dLng).toFixed(6)} ${Number(s.lat).toFixed(6)}, ${(Number(s.lng) + dLng).toFixed(6)} ${Number(s.lat).toFixed(6)})`;
    const b2 = await pool.query(
      `SELECT COUNT(*) FILTER (WHERE r.id = $1)::int AS secondary_present,
              COUNT(*)::int                          AS total_rows
         FROM get_corridor_pois($2::text, 0.1::float8, NULL::text[], NULL::text) r`,
      [s.id, route2WKT],
    );
    const b2Present = b2.rows[0].secondary_present;
    const b2Total   = b2.rows[0].total_rows;
    console.log(`(b2) corridor near secondary "${s.name}" (${s.id}): total=${b2Total}, secondary_present=${b2Present} (expected 0)`);
    if (b2Present !== 0) {
      console.log(`     FAIL: secondary leaked into corridor result`);
    }
  }

  const aPass  = aMerged && aConf;
  const b1Pass = b1Placeholders === 0;
  const b2Pass = sec.rows.length === 0
    ? true
    : (await pool.query(
        `SELECT COUNT(*) FILTER (WHERE r.id = $1)::int AS n
           FROM get_corridor_pois($2::text, 0.1::float8, NULL::text[], NULL::text) r`,
        [
          sec.rows[0].id,
          (() => {
            const s = sec.rows[0];
            const dLng = 0.0005;
            return `LINESTRING(${(Number(s.lng) - dLng).toFixed(6)} ${Number(s.lat).toFixed(6)}, ${(Number(s.lng) + dLng).toFixed(6)} ${Number(s.lat).toFixed(6)})`;
          })(),
        ],
      )).rows[0].n === 0;

  console.log(`\n(a) pass: ${aPass}`);
  console.log(`(b1) pass: ${b1Pass}`);
  console.log(`(b2) pass: ${b2Pass}`);

  if (aPass && b1Pass && b2Pass) {
    console.log('\nCorridor RPC patch verified.');
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
