// Final stop-and-report for Phase 4 pipeline.

import { config } from 'dotenv';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import pkg from 'pg';

const { Pool } = pkg;
const __dirname = dirname(fileURLToPath(import.meta.url));
config({ path: resolve(__dirname, '../../.env') });

const pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 2 });

async function rows(sql, params = []) {
  const r = await pool.query(sql, params);
  return r.rows;
}

async function main() {
  console.log('================= STEP 6 — FINAL STATE =================\n');

  console.log('=== source_type breakdown ===');
  const breakdown = await rows(`
    SELECT
      source_type,
      count(*) FILTER (WHERE merged_into IS NULL)                                AS active,
      count(*) FILTER (WHERE merged_into IS NOT NULL)                            AS merged,
      count(*) FILTER (WHERE merged_into IS NULL AND parent_poi_id IS NOT NULL)  AS children
    FROM pois
    GROUP BY source_type
    ORDER BY active DESC
  `);
  console.log('  source_type      | active rows | merged into others | children');
  console.log('  -----------------+-------------+--------------------+---------');
  let totA = 0, totM = 0, totC = 0;
  for (const r of breakdown) {
    console.log(`  ${String(r.source_type).padEnd(16)} | ${String(r.active).padStart(11)} | ${String(r.merged).padStart(18)} | ${String(r.children).padStart(8)}`);
    totA += Number(r.active); totM += Number(r.merged); totC += Number(r.children);
  }
  console.log('  -----------------+-------------+--------------------+---------');
  console.log(`  ${'TOTAL'.padEnd(16)} | ${String(totA).padStart(11)} | ${String(totM).padStart(18)} | ${String(totC).padStart(8)}`);

  console.log('\n=== confidence_score residuals ===');
  const conf = await rows(`
    SELECT source_type,
           count(*) AS total,
           count(*) FILTER (WHERE confidence_score = 0)   AS conf0,
           count(*) FILTER (WHERE confidence_score < 0.5) AS conf_lt_05
      FROM pois
     WHERE merged_into IS NULL
     GROUP BY source_type
     ORDER BY conf_lt_05 DESC
  `);
  console.log('  source_type      | total active | conf=0  | conf<0.5');
  console.log('  -----------------+--------------+---------+--------');
  for (const r of conf) {
    console.log(`  ${String(r.source_type).padEnd(16)} | ${String(r.total).padStart(12)} | ${String(r.conf0).padStart(7)} | ${String(r.conf_lt_05).padStart(7)}`);
  }

  console.log('\n=== children added in Step 4 (parent_poi_id IS NOT NULL, by venue type) ===');
  const childrenByVenue = await rows(`
    SELECT v.venue_type,
           count(*) AS n_children
      FROM pois c
      JOIN pois v ON v.id = c.parent_poi_id
     WHERE c.merged_into IS NULL
       AND c.parent_poi_id IS NOT NULL
     GROUP BY v.venue_type
     ORDER BY n_children DESC
  `);
  for (const r of childrenByVenue) {
    console.log(`  ${String(r.venue_type).padEnd(20)}  ${r.n_children}`);
  }

  console.log('\n=== Top 10 movers (positive) — significance_score lift since pre-dedup baseline ===');
  // We need to compare against pre-dedup baseline. Let's instead compute lift for high-additional_sources POIs.
  // Use cross_source bonus as a proxy for "got lifted by this pipeline" — if breakdown.cross_source >= 20.
  const movers = await rows(`
    SELECT id::text, name, source_type, significance_score::float AS score,
           significance_breakdown,
           coalesce(array_length(additional_sources, 1), 0) AS xs_count
      FROM pois
     WHERE merged_into IS NULL
       AND (significance_breakdown->>'cross_source')::int >= 20
     ORDER BY (significance_breakdown->>'cross_source')::int DESC,
              significance_score DESC
     LIMIT 15
  `);
  for (const r of movers) {
    const b = r.significance_breakdown ?? {};
    console.log(`  score=${Number(r.score).toFixed(0).padStart(3)}  xs=${b.cross_source}  pv=${b.pageviews}  ${r.name}  [${r.source_type}]  (${r.id})`);
  }

  console.log('\n=== Star of India / Old Point Loma Lighthouse / Cabrillo NM (post-recompute) ===');
  const spot = await rows(`
    SELECT id::text, name, source_type, significance_score::float AS score,
           significance_breakdown,
           is_venue, parent_poi_id::text AS parent
      FROM pois
     WHERE merged_into IS NULL
       AND (name ILIKE 'star of india'
         OR name = 'Old Point Loma Lighthouse'
         OR name = 'Cabrillo National Monument')
     ORDER BY name
  `);
  for (const r of spot) {
    const b = r.significance_breakdown ?? {};
    console.log(`  score=${Number(r.score).toFixed(0).padStart(3)}  base=${b.source_base ?? '-'} xs=${b.cross_source ?? '-'} pv=${b.pageviews ?? '-'} ra=${b.route_adjacency ?? '-'}  ${r.name}  [${r.source_type}]`);
  }

  console.log('\n=== 8-still-split-missions: did any collapse during dedup or lift via cross_source? ===');
  const stillSplit = [
    'San Diego de Alcalá',
    'San Francisco de Asís',
    'Santa Clara de Asís',
    'San Buenaventura',
    'La Purísima Concepción',
    'Nuestra Señora de la Soledad',
    'San José',
    'San Fernando Rey de España',
  ];
  for (const m of stillSplit) {
    const r = await rows(`
      SELECT count(*) FILTER (WHERE merged_into IS NULL)     AS active,
             count(*) FILTER (WHERE merged_into IS NOT NULL) AS merged
        FROM pois
       WHERE name ILIKE $1
    `, [`%${m}%`]);
    const score = await rows(`
      SELECT id::text, name, source_type, significance_score::float AS score,
             significance_breakdown
        FROM pois
       WHERE merged_into IS NULL
         AND is_venue = true
         AND name ILIKE $1
    `, [`%${m}%`]);
    const v = score[0];
    if (v) {
      const b = v.significance_breakdown ?? {};
      console.log(`  ${m.padEnd(30)}  active=${r[0].active}  merged=${r[0].merged}   venue: score=${Number(v.score).toFixed(0)} (${b.source_base ?? '-'}/${b.cross_source ?? '-'}/${b.pageviews ?? '-'}/${b.route_adjacency ?? '-'})`);
    } else {
      console.log(`  ${m.padEnd(30)}  active=${r[0].active}  merged=${r[0].merged}   (no editorial venue)`);
    }
  }
}

main().catch((err) => { console.error('ERROR:', err.message ?? err); process.exitCode = 1; })
      .finally(() => pool.end());
