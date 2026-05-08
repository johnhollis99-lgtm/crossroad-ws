// Item B: Mission Dolores Cemetery → child-promotion (with spatial-check fork).
//
// Branch logic:
//   B.3.if cemetery_inside_polygon: promote (B.4) + verify (B.5/B.6)
//   B.3.else if distance <= 25m: skip — flag for the broader Mission Grounds
//                                Polygons workstream (osm_buffered_25m issue)
//   B.3.else (distance > 25m):    skip — promotion assumption was wrong
//
// Run from: scripts/poi-import/
//   node mission-dolores-cemetery-promote.mjs

import { config } from 'dotenv';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import pkg from 'pg';

const { Pool } = pkg;
const __dirname = dirname(fileURLToPath(import.meta.url));
config({ path: resolve(__dirname, '../../.env') });

const pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 2 });

async function main() {
  // B.1 — find both rows
  const rows = await pool.query(
    `SELECT id::text,
            name,
            source_type,
            is_venue,
            parent_poi_id::text                AS parent_poi_id,
            venue_polygon IS NOT NULL          AS has_polygon,
            ST_AsText(location::geometry)      AS coords,
            ST_Y(location::geometry)::float    AS lat,
            ST_X(location::geometry)::float    AS lng
     FROM pois
     WHERE merged_into IS NULL
       AND (
         name ILIKE 'Mission Dolores Cemetery%'
         OR (is_venue = true AND venue_type = 'mission'
             AND name ILIKE 'Mission San Francisco de Asís%')
       )
     ORDER BY is_venue DESC, name`,
  );
  console.log(`B.1 — Found ${rows.rowCount} candidate rows:\n`);
  for (const r of rows.rows) {
    console.log(
      `  ${r.id}  is_venue=${r.is_venue}  parent=${r.parent_poi_id ?? '—'}  ` +
      `has_polygon=${r.has_polygon}  coords=${r.coords}  ${r.name}`,
    );
  }

  const cemetery = rows.rows.find((r) => /Cemetery/i.test(r.name));
  const mission  = rows.rows.find((r) => r.is_venue === true);
  if (!cemetery || !mission) {
    console.error('\nERROR: could not identify both rows; aborting.');
    process.exit(1);
  }
  if (!mission.has_polygon) {
    console.error(`\nERROR: Mission ${mission.id} has no venue_polygon; cannot run spatial check.`);
    process.exit(1);
  }
  console.log(`\n  → cemetery_id      = ${cemetery.id}`);
  console.log(`  → mission_venue_id = ${mission.id}`);

  // B.2 — spatial check
  const spatial = await pool.query(
    `SELECT
       ST_Contains(
         (SELECT venue_polygon::geometry FROM pois WHERE id = $1),
         (SELECT location::geometry FROM pois WHERE id = $2)
       ) AS cemetery_inside_polygon,
       ST_Distance(
         (SELECT venue_polygon::geography FROM pois WHERE id = $1),
         (SELECT location::geography      FROM pois WHERE id = $2)
       )::float AS distance_m`,
    [mission.id, cemetery.id],
  );
  const inside   = spatial.rows[0].cemetery_inside_polygon;
  const distance = spatial.rows[0].distance_m;
  console.log(`\nB.2 — Spatial check:`);
  console.log(`  cemetery_inside_polygon  = ${inside}`);
  console.log(`  distance_to_polygon_m    = ${distance.toFixed(2)}`);

  // B.3 — branch
  if (inside === true) {
    console.log(`\nB.3 — Branch: cemetery is inside polygon → proceeding to promotion (B.4)\n`);
    await promote(cemetery.id, mission.id);
    await verifyVenueTour(mission.id, cemetery.id);
    await verifyNearbyExcludesChild(mission.lat, mission.lng, cemetery.id);
  } else if (distance <= 25) {
    console.log(
      `\nB.3 — Branch: cemetery is OUTSIDE polygon but only ${distance.toFixed(2)}m away.\n` +
      `       Likely the same osm_buffered_25m / chapel-only-polygon pattern as\n` +
      `       Missions San Diego de Alcalá and Santa Inés.\n` +
      `       Per spec: leave cemetery as-is (pv=0) and flag for the\n` +
      `       Mission Grounds Polygons workstream. NOT modifying anything.\n`,
    );
  } else {
    console.log(
      `\nB.3 — Branch: cemetery is GENUINELY FAR from Mission Dolores polygon ` +
      `(${distance.toFixed(2)}m).\n` +
      `       Promotion assumption was wrong. Leaving cemetery as-is with pv=0.\n`,
    );
  }
}

async function promote(cemeteryId, missionId) {
  const client = await pool.connect();
  try {
    console.log('B.4 — Promoting cemetery to child');
    await client.query('BEGIN');
    try {
      const r = await client.query(
        `UPDATE pois
         SET parent_poi_id = $2,
             venue_metadata = COALESCE(venue_metadata, '{}'::jsonb) ||
               jsonb_build_object(
                 'classification_method', 'manual_promotion',
                 'classification_note',
                 'No standalone Wikidata entity; promoted as sub-feature of '
                 'parent mission per venue-tour design'
               )
         WHERE id = $1`,
        [cemeteryId, missionId],
      );
      await client.query('COMMIT');
      console.log(`  rowCount=${r.rowCount} ✓ committed`);
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    }
  } finally {
    client.release();
  }
}

async function verifyVenueTour(missionId, cemeteryId) {
  console.log('\nB.5 — Verifying cemetery now appears in get_venue_tour_pois(mission)');
  const r = await pool.query(
    `SELECT id::text, name FROM get_venue_tour_pois($1, NULL, NULL)`,
    [missionId],
  );
  const found = r.rows.find((row) => row.id === cemeteryId);
  console.log(`  total children returned: ${r.rowCount}`);
  console.log(`  cemetery present: ${found ? 'yes ✓' : 'NO ✗ — bug to investigate'}`);
  if (!found) process.exitCode = 2;
}

async function verifyNearbyExcludesChild(lat, lng, cemeteryId) {
  console.log('\nB.6 — Verifying get_nearby_pois (default p_include_children=false) excludes the cemetery');
  const r = await pool.query(
    `SELECT id::text, name FROM get_nearby_pois($1::float8, $2::float8, 200::float8, NULL, NULL, false)`,
    [lat, lng],
  );
  const leaked = r.rows.find((row) => row.id === cemeteryId);
  console.log(`  total nearby returned: ${r.rowCount}`);
  console.log(`  cemetery present (should be NO): ${leaked ? 'YES ✗ — bug to investigate' : 'no ✓'}`);
  if (leaked) process.exitCode = 2;
}

main()
  .catch((err) => { console.error('ERROR:', err.message ?? err); process.exitCode = 1; })
  .finally(() => pool.end());
