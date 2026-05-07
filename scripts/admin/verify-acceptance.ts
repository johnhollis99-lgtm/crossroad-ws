#!/usr/bin/env node
import { config as dotenvConfig } from 'dotenv';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
dotenvConfig({ path: resolve(__dirname, '../../.env') });

import chalk from 'chalk';
import { getPgPool } from '../poi-import/lib/supabase.js';

async function main() {
  const pool = getPgPool();

  // 1. Venue counts
  const venues = await pool.query<{ count: number }>(
    `SELECT COUNT(*)::int AS count FROM pois WHERE is_venue=true AND merged_into IS NULL`,
  );
  const review = await pool.query<{ count: number }>(
    `SELECT COUNT(*)::int AS count FROM venue_classification_review WHERE review_status='pending'`,
  );
  const childCount = await pool.query<{ count: number }>(
    `SELECT COUNT(*)::int AS count FROM pois WHERE parent_poi_id IS NOT NULL AND merged_into IS NULL`,
  );
  console.log(chalk.bold('Aggregate state:'));
  console.log(`  active venues:                 ${venues.rows[0]!.count}`);
  console.log(`  review queue (pending):        ${review.rows[0]!.count}`);
  console.log(`  POIs with parent_poi_id set:   ${childCount.rows[0]!.count}`);

  // 2. Top-25 by significance, parents/standalones only (drive-by simulation)
  const top25 = await pool.query<{ name: string; sig: number; venue: boolean; src: string }>(`
    SELECT p.name, p.significance_score AS sig, p.is_venue AS venue, p.source_type AS src
    FROM pois p
    WHERE p.merged_into IS NULL AND p.parent_poi_id IS NULL
    ORDER BY p.significance_score DESC, p.name
    LIMIT 25
  `);
  console.log(chalk.bold('\nTop-25 (drive-by eligible — parents + standalones, children excluded):'));
  for (const r of top25.rows) {
    const tag = r.venue ? chalk.green('[venue]') : chalk.gray(`[${r.src}]`);
    console.log(`  ${String(r.sig).padStart(6)}  ${tag.padEnd(28)} ${r.name}`);
  }

  // 3. Disneyland children (acceptance #8)
  const dl = await pool.query<{ id: string }>(
    `SELECT id::text FROM pois WHERE is_venue=true AND name='Disneyland Park' AND merged_into IS NULL LIMIT 1`,
  );
  if (dl.rows.length) {
    const dlId = dl.rows[0]!.id;
    const tour = await pool.query<{ count: number }>(
      `SELECT COUNT(*)::int AS count FROM get_venue_tour_pois($1)`,
      [dlId],
    );
    console.log(chalk.bold(`\nget_venue_tour_pois(Disneyland) → ${tour.rows[0]!.count} children`));
  }

  // 4. detect_venue_at_location at Cinderella Castle ≈ Sleeping Beauty Castle (33.8131, -117.9189)
  const det = await pool.query<{ name: string; venue_type: string; area: number }>(
    `SELECT name, venue_type, polygon_area_m2 FROM detect_venue_at_location(33.8131, -117.9189)`,
  );
  console.log(chalk.bold(`\ndetect_venue_at_location(33.8131,-117.9189):`));
  for (const r of det.rows) console.log(`  → ${r.name} [${r.venue_type}] (${Math.round(r.area)} m²)`);

  // 5. Mission child counts (acceptance #7: ≥21 missions, ≥2 children each)
  const missions = await pool.query<{ name: string; children: number }>(`
    SELECT v.name,
           COUNT(c.id)::int AS children
    FROM pois v
    LEFT JOIN pois c ON c.parent_poi_id = v.id AND c.merged_into IS NULL
    WHERE v.is_venue = true AND v.merged_into IS NULL AND v.venue_type = 'mission'
    GROUP BY v.id, v.name
    ORDER BY children DESC, v.name
  `);
  console.log(chalk.bold(`\nMissions in DB as venues: ${missions.rows.length}`));
  for (const m of missions.rows) {
    const ok = m.children >= 2 ? chalk.green('✓') : chalk.yellow('—');
    console.log(`  ${ok} ${String(m.children).padStart(3)}  ${m.name}`);
  }

  // 6. Theme park rides should NOT be in the top-25
  const ride_in_top = top25.rows.filter(r => /Mountain|Coaster|Ride|Pirates|Thunder|Splash/.test(r.name));
  console.log(chalk.bold(`\nTheme-park-ride-shaped names in top-25: ${ride_in_top.length} (target: 0)`));
  for (const r of ride_in_top) console.log(`  ${r.sig}  ${r.name}`);

  // 7. Exception rule firings (count POIs that fell inside venue but stayed standalone)
  const exceptions = await pool.query<{ count: number }>(`
    SELECT COUNT(*)::int AS count
    FROM pois p
    WHERE p.merged_into IS NULL AND p.parent_poi_id IS NULL
      AND p.is_venue = false
      AND EXISTS (
        SELECT 1 FROM pois v
        WHERE v.is_venue = true AND v.merged_into IS NULL
          AND ST_Contains(v.venue_polygon::geometry, p.location::geometry)
      )
  `);
  console.log(chalk.bold(`\nStandalone POIs inside a venue polygon (exception rules fired): ${exceptions.rows[0]!.count}`));

  await pool.end();
}
main().catch(e => { console.error(e); process.exit(1); });
