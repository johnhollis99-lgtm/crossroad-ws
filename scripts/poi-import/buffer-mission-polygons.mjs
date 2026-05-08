// Re-buffer the two mission OSM polygons by 25m, in a single transaction.
// The raw OSM polygons (1645 m² and 1360 m²) are too tight — they orphaned
// 3 children that sit 1–14 m outside. A 25 m buffer captures the immediate
// mission complex while still anchoring on real OSM geometry.
//
// Run from: scripts/poi-import/
//   node buffer-mission-polygons.mjs

import { config } from 'dotenv';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import pkg from 'pg';

const { Pool } = pkg;
const __dirname = dirname(fileURLToPath(import.meta.url));
config({ path: resolve(__dirname, '../../.env') });

const TARGETS = [
  { id: 'd2814ccd-60fc-40da-9dd6-446bf1d9d74e', name: 'Mission San Diego de Alcalá' },
  { id: '599c180e-cdf2-4f70-911c-c0de91ed8dd5', name: 'Mission Santa Inés' },
];

const pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 2 });

async function main() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const results = [];
    for (const t of TARGETS) {
      // Capture raw geometry + areas BEFORE update
      const before = await client.query(
        `SELECT venue_polygon::text                                 AS raw_wkt,
                ST_Area(venue_polygon::geography)::float            AS raw_area_m2,
                ST_Area(ST_Buffer(venue_polygon::geography, 25))::float AS buf_area_m2,
                venue_metadata->>'polygon_source'                    AS prev_source,
                venue_metadata->>'osm_id'                            AS osm_id
           FROM pois
          WHERE id = $1`,
        [t.id],
      );
      if (before.rows.length === 0) throw new Error(`Venue ${t.id} not found`);
      const b = before.rows[0];
      console.log(`\n${t.name} (${t.id})`);
      console.log(`  prev polygon_source: ${b.prev_source}`);
      console.log(`  raw OSM area: ${b.raw_area_m2.toFixed(0)} m²`);
      console.log(`  buffered (+25m) area: ${b.buf_area_m2.toFixed(0)} m²`);

      // UPDATE: replace polygon with buffered version, set provenance keys
      const upd = await client.query(
        `UPDATE pois
            SET venue_polygon = ST_Buffer(venue_polygon::geography, 25)::geography,
                venue_metadata = jsonb_set(jsonb_set(jsonb_set(jsonb_set(
                  COALESCE(venue_metadata, '{}'::jsonb),
                  '{polygon_source}', '"osm_buffered_25m"'::jsonb),
                  '{polygon_buffer_m}', '25'::jsonb),
                  '{polygon_area_m2}', to_jsonb($2::numeric)),
                  '{osm_polygon_area_m2}', to_jsonb($3::numeric))
          WHERE id = $1
        RETURNING venue_metadata`,
        [t.id, b.buf_area_m2, b.raw_area_m2],
      );
      results.push({ ...t, raw_m2: b.raw_area_m2, buf_m2: b.buf_area_m2, meta: upd.rows[0].venue_metadata });
    }
    await client.query('COMMIT');
    console.log(`\n✓ Both venues buffered in a single transaction.`);
    console.log(`\n── Final metadata ──`);
    for (const r of results) {
      console.log(`\n${r.name}`);
      console.log(`  raw_m2=${r.raw_m2.toFixed(0)}  buffered_m2=${r.buf_m2.toFixed(0)}`);
      console.log(`  metadata:`, r.meta);
    }
  } catch (err) {
    await client.query('ROLLBACK');
    console.error(`\n✗ Rolled back: ${err.message}`);
    process.exitCode = 1;
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch(err => { console.error('FATAL:', err.message); process.exitCode = 1; });
