/**
 * RoadStory seed runner
 * Usage: node scripts/seed-db.mjs
 *
 * Requires SUPABASE_SERVICE_KEY in .env.
 * Run AFTER supabase/migrations/20250503000000_roadstory_schema.sql is applied.
 */
import 'dotenv/config';
import { readFileSync } from 'fs';
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.SUPABASE_URL;
const SERVICE_KEY  = process.env.SUPABASE_SERVICE_KEY;

if (!SUPABASE_URL || !SERVICE_KEY) {
  throw new Error('SUPABASE_URL and SUPABASE_SERVICE_KEY must be set in .env');
}

// ── Execute SQL via Management API (needs SUPABASE_ACCESS_TOKEN env var)
const ACCESS_TOKEN = process.env.SUPABASE_ACCESS_TOKEN;
const PROJECT_REF  = new URL(SUPABASE_URL).hostname.split('.')[0];

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
  console.log('=== RoadStory DB Seeder ===\n');

  if (!ACCESS_TOKEN) {
    console.error(
      'Missing SUPABASE_ACCESS_TOKEN.\n\n' +
      'Get a personal access token from:\n' +
      '  https://supabase.com/dashboard/account/tokens\n\n' +
      'Then run:\n' +
      '  $env:SUPABASE_ACCESS_TOKEN = "sbp_..." ; node scripts/seed-db.mjs\n'
    );
    process.exit(1);
  }

  // ── Step 1: Run migration ──────────────────────────────────────────────
  console.log('Step 1: Applying schema migration...');
  const migration = readFileSync(
    new URL('../supabase/migrations/20250503000000_roadstory_schema.sql', import.meta.url),
    'utf8'
  );
  await runSql(migration);
  console.log('  ✓ Migration applied.\n');

  // ── Step 2: Seed categories ────────────────────────────────────────────
  console.log('Step 2: Seeding poi_categories...');
  const seedSql = readFileSync(
    new URL('../supabase/seed.sql', import.meta.url),
    'utf8'
  );

  // Run the full seed (categories → pois → corridors → badges).
  // We split on the verification SELECT block so we can run it separately
  // and capture output.
  const [dataSql, verifySql] = seedSql.split(
    /-- ={40,}\n-- 5\. VERIFICATION/
  );

  await runSql(dataSql);
  console.log('  ✓ Seed data inserted.\n');

  // ── Step 3: Verification ───────────────────────────────────────────────
  console.log('Step 3: Running verification queries...');

  const checks = [
    { label: 'total_pois (expect 37)',       sql: 'SELECT COUNT(*) AS n FROM pois;' },
    { label: 'total_corridors (expect 6)',   sql: 'SELECT COUNT(*) AS n FROM corridors;' },
    { label: 'total_badges (expect 17)',     sql: 'SELECT COUNT(*) AS n FROM badge_definitions;' },
    { label: 'total_categories (expect 20)', sql: 'SELECT COUNT(*) AS n FROM poi_categories;' },
    {
      label: 'POIs by category (top 5)',
      sql: `SELECT c.display_name, COUNT(p.id)::int AS poi_count
            FROM pois p JOIN poi_categories c ON c.id = p.category_id
            GROUP BY c.display_name ORDER BY poi_count DESC LIMIT 5;`
    },
    {
      label: 'Corridor query sample (POIs within 5 mi of LA→Lone Pine)',
      sql: `SELECT name, significance_score,
              ROUND((ST_Distance(
                location,
                ST_SetSRID(ST_MakeLine(ST_MakePoint(-118.2437,34.0522),ST_MakePoint(-118.0627,36.6060)),4326)::geography
              ) / 1609.34)::numeric, 1) AS miles_from_route
            FROM pois
            WHERE ST_DWithin(
              location,
              ST_SetSRID(ST_MakeLine(ST_MakePoint(-118.2437,34.0522),ST_MakePoint(-118.0627,36.6060)),4326)::geography,
              8046.72
            )
            ORDER BY significance_score DESC LIMIT 10;`
    },
  ];

  for (const { label, sql } of checks) {
    const result = await runSql(sql);
    console.log(`\n  ${label}:`);
    console.table(result);
  }

  console.log('\n=== Seed complete. ===');
}

main().catch(err => { console.error(err); process.exit(1); });
