/**
 * Applies the trip_mode migration (20250503000001_trip_mode.sql)
 * Usage:
 *   $env:SUPABASE_ACCESS_TOKEN = "sbp_..." ; node scripts/migrate-trip-mode.mjs
 */

import { readFileSync } from 'fs';

const ACCESS_TOKEN = process.env.SUPABASE_ACCESS_TOKEN;
const PROJECT_REF  = 'eusozlexmllovlmngmug';

async function runSql(sql) {
  if (!ACCESS_TOKEN) throw new Error('Set SUPABASE_ACCESS_TOKEN env var first.');
  const res = await fetch(
    `https://api.supabase.com/v1/projects/${PROJECT_REF}/database/query`,
    {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${ACCESS_TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ query: sql }),
    }
  );
  const json = await res.json();
  if (!res.ok) throw new Error(JSON.stringify(json));
  return json;
}

async function main() {
  if (!ACCESS_TOKEN) {
    console.error(
      'Missing SUPABASE_ACCESS_TOKEN.\n\n' +
      'Get a token from: https://supabase.com/dashboard/account/tokens\n\n' +
      'Then run:\n' +
      '  $env:SUPABASE_ACCESS_TOKEN = "sbp_..." ; node scripts/migrate-trip-mode.mjs\n'
    );
    process.exit(1);
  }

  console.log('Applying 20250503000001_trip_mode.sql...');
  const sql = readFileSync(
    new URL('../supabase/migrations/20250503000001_trip_mode.sql', import.meta.url),
    'utf8'
  );
  await runSql(sql);
  console.log('  ✓ trip_mode column added, RPCs updated.\n');

  console.log('Verifying...');
  const checks = [
    { label: 'trip_mode column exists',
      sql: `SELECT column_name, data_type, column_default
            FROM information_schema.columns
            WHERE table_name = 'pois' AND column_name = 'trip_mode';` },
    { label: 'get_corridor_pois signature',
      sql: `SELECT proname, pg_get_function_arguments(oid) AS args
            FROM pg_proc WHERE proname = 'get_corridor_pois' AND pronamespace = 'public'::regnamespace;` },
    { label: 'get_nearby_pois signature',
      sql: `SELECT proname, pg_get_function_arguments(oid) AS args
            FROM pg_proc WHERE proname = 'get_nearby_pois' AND pronamespace = 'public'::regnamespace;` },
  ];

  for (const { label, sql } of checks) {
    const result = await runSql(sql);
    console.log(`\n  ${label}:`);
    console.table(result);
  }

  console.log('\n=== Migration complete. ===');
}

main().catch(err => { console.error(err); process.exit(1); });
