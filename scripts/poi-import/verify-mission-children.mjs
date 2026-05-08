// After replacing the temp_buffer polygons with smaller real OSM polygons,
// check whether existing children are still inside their parent's polygon.
// Print: total children, still-inside, now-outside (with reasons + names).

import { config } from 'dotenv';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import pkg from 'pg';
const { Pool } = pkg;
config({ path: resolve(dirname(fileURLToPath(import.meta.url)), '../../.env') });

const TARGETS = [
  { id: 'd2814ccd-60fc-40da-9dd6-446bf1d9d74e', name: 'Mission San Diego de Alcalá' },
  { id: '599c180e-cdf2-4f70-911c-c0de91ed8dd5', name: 'Mission Santa Inés' },
];

const pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 2 });

for (const t of TARGETS) {
  const r = await pool.query(
    `SELECT c.id::text AS id, c.name AS child_name, c.source_type,
            ST_Y(c.location::geometry) AS lat,
            ST_X(c.location::geometry) AS lng,
            ST_Within(c.location::geometry, v.venue_polygon::geometry) AS inside,
            ST_Distance(c.location, ST_Boundary(v.venue_polygon::geometry)::geography)::float AS dist_m
       FROM pois c
       JOIN pois v ON v.id = c.parent_poi_id
      WHERE c.parent_poi_id = $1
        AND c.merged_into IS NULL
      ORDER BY ST_Within(c.location::geometry, v.venue_polygon::geometry), c.name`,
    [t.id],
  );
  const inside = r.rows.filter(x => x.inside === true);
  const outside = r.rows.filter(x => x.inside !== true);
  console.log(`\n${t.name}: ${r.rows.length} children, ${inside.length} inside polygon, ${outside.length} outside`);
  for (const x of r.rows) {
    const flag = x.inside ? 'IN ' : 'OUT';
    const dist = Number(x.dist_m).toFixed(0).padStart(4);
    console.log(`  [${flag}] ${dist}m  "${x.child_name}" [${x.source_type}]  (${Number(x.lat).toFixed(5)}, ${Number(x.lng).toFixed(5)})`);
  }
}

await pool.end();
