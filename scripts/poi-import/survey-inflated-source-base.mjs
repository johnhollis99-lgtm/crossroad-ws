// Survey inflated breakdown.source_base across all rows.
// The dedup-clamp bug at dedupe.ts:658 sets significance_score=1.0
// when (editorial_score_in_0-100_scale + bonus_0-1) overflows 1.0.
// Recompute then locks breakdown.source_base = 100 from significance_score=1.0.
//
// Scope of the survey:
//   1. editorial venues (is_venue=true)             → canonical fresh = 40 (seed-venues.ts)
//   2. editorial narrative-promoted (is_venue=false) → canonical fresh = round(confidence_score * 60)
//   3. anything else with breakdown.source_base=100 AND significance_score=1.0 (sentinel)
//
// Run from: scripts/poi-import/
//   node survey-inflated-source-base.mjs

import { config } from 'dotenv';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import pkg from 'pg';

const { Pool } = pkg;
const __dirname = dirname(fileURLToPath(import.meta.url));
config({ path: resolve(__dirname, '../../.env') });

if (!process.env.DATABASE_URL) {
  console.error('DATABASE_URL not set in .env');
  process.exit(1);
}
const pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 2 });

async function main() {
  // 1. Editorial venue rows where breakdown.source_base != 40
  const venueQ = `
    SELECT id::text, name,
           significance_score::float                          AS score,
           (significance_breakdown->>'source_base')::int      AS sb,
           (significance_breakdown->>'cross_source')::int     AS xs,
           (significance_breakdown->>'pageviews')::int        AS pv,
           (significance_breakdown->>'route_adjacency')::int  AS ra,
           is_venue, venue_type, confidence_score
    FROM pois
    WHERE merged_into IS NULL
      AND source_type = 'editorial'
      AND is_venue = true
      AND (significance_breakdown->>'source_base')::int IS DISTINCT FROM 40
    ORDER BY (significance_breakdown->>'source_base')::int DESC, name`;

  // 2. Editorial non-venue (narrative-promoted) rows where source_base != round(conf*60)
  const narrativeQ = `
    SELECT id::text, name,
           significance_score::float                          AS score,
           (significance_breakdown->>'source_base')::int      AS sb,
           confidence_score::float                            AS conf,
           ROUND(confidence_score::numeric * 60)::int         AS expected_sb,
           is_venue, venue_type
    FROM pois
    WHERE merged_into IS NULL
      AND source_type = 'editorial'
      AND is_venue = false
      AND (significance_breakdown->>'source_base')::int IS DISTINCT FROM ROUND(confidence_score::numeric * 60)::int
    ORDER BY (significance_breakdown->>'source_base')::int DESC, name`;

  // 3. Non-editorial rows showing the clamp sentinel (sb=100 AND score=1.0)
  const otherQ = `
    SELECT id::text, name, source_type,
           significance_score::float                          AS score,
           (significance_breakdown->>'source_base')::int      AS sb
    FROM pois
    WHERE merged_into IS NULL
      AND source_type <> 'editorial'
      AND (significance_breakdown->>'source_base')::int = 100
      AND significance_score::float = 1.0
    ORDER BY name`;

  const [venue, narr, other] = await Promise.all([
    pool.query(venueQ),
    pool.query(narrativeQ),
    pool.query(otherQ),
  ]);

  console.log('=== Survey 1: editorial venues (canonical fresh source_base = 40) ===');
  console.log(`Found ${venue.rowCount} venue rows where source_base != 40:\n`);
  for (const r of venue.rows) {
    console.log(
      `  ${r.id}  sb=${String(r.sb).padStart(3)}  ` +
      `score=${Number(r.score).toFixed(1).padStart(5)}  ` +
      `${String(r.venue_type ?? '?').padEnd(17)}  ${r.name}`,
    );
  }

  console.log('\n=== Survey 2: editorial narrative-promoted (canonical fresh source_base = round(confidence_score*60)) ===');
  console.log(`Found ${narr.rowCount} narrative-promoted rows where source_base != expected:\n`);
  for (const r of narr.rows) {
    console.log(
      `  ${r.id}  sb=${String(r.sb).padStart(3)}  ` +
      `expected=${String(r.expected_sb).padStart(3)}  ` +
      `conf=${Number(r.conf).toFixed(2)}  ${r.name}`,
    );
  }

  console.log('\n=== Survey 3: non-editorial clamp sentinel (sb=100 AND score=1.0) ===');
  console.log(`Found ${other.rowCount} non-editorial rows showing the clamp sentinel:\n`);
  for (const r of other.rows) {
    console.log(
      `  ${r.id}  sb=${r.sb}  score=${Number(r.score).toFixed(1)}  ` +
      `[${r.source_type}]  ${r.name}`,
    );
  }

  console.log('\n=== Summary ===');
  console.log(`  editorial venues with sb!=40                 : ${venue.rowCount}`);
  console.log(`  editorial narrative with sb!=round(conf*60)  : ${narr.rowCount}`);
  console.log(`  non-editorial with sb=100 AND score=1.0       : ${other.rowCount}`);
}

main()
  .catch((err) => {
    console.error('ERROR:', err.message ?? err);
    process.exitCode = 1;
  })
  .finally(() => pool.end());
