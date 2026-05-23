/**
 * PostGIS queries for the trip simulator. Direct pg connection — the
 * Supabase JS client can't read geography columns or call inline PostGIS
 * functions, so we use pg with `ST_*` expressions throughout.
 *
 * The simulator runs ONE corridor query for all POIs and ONE intersect
 * query for all regions, then merges + ranks client-side. This is much
 * cheaper than per-tick RPC calls and matches the addendum's "pre-fetch
 * the next N upcoming items" lookahead model better.
 */

import pkg from 'pg';
import type { Waypoint } from './routes.js';

const { Pool } = pkg;

/**
 * Returns a Postgres LINESTRING WKT (EWKT with SRID 4326) for the
 * given waypoints. Used as the input to corridor/intersect PostGIS
 * functions server-side.
 */
export function waypointsToLineStringWkt(waypoints: Waypoint[]): string {
  const points = waypoints.map(w => `${w.lon} ${w.lat}`).join(', ');
  return `SRID=4326;LINESTRING(${points})`;
}

export interface CorridorPoi {
  id: string;
  name: string;
  category_slug: string;
  significance_score: number;
  editorial_score_boost: number;
  source_type: string | null;
  parent_poi_id: string | null;
  lat: number;
  lon: number;
  dist_from_route_mi: number;
  route_position_fraction: number; // 0..1 along the route
  trigger_mode: 'proximity' | 'closest_approach';
  off_route_landmark_hint: string | null;
}

/**
 * Pull every editorial-curated POI within `corridorMi` of the route,
 * with route-projection metadata (fraction along the route + perpendicular
 * distance). One round trip. Returns rows sorted by route_position_fraction.
 */
export async function getCorridorPois(
  pool: pkg.Pool,
  routeWkt: string,
  corridorMi: number,
): Promise<CorridorPoi[]> {
  const corridorM = corridorMi * 1609.34;
  const sql = `
    WITH route AS (
      SELECT ST_GeogFromText($1) AS geog,
             ST_GeomFromEWKT($1) AS geom
    )
    SELECT
      p.id,
      p.name,
      pc.slug AS category_slug,
      p.significance_score::int AS significance_score,
      p.editorial_score_boost,
      p.source_type,
      p.parent_poi_id,
      ST_Y(p.location::geometry) AS lat,
      ST_X(p.location::geometry) AS lon,
      ST_Distance(p.location, route.geog) / 1609.34 AS dist_from_route_mi,
      ST_LineLocatePoint(
        route.geom,
        ST_ClosestPoint(route.geom, p.location::geometry)
      ) AS route_position_fraction,
      p.trigger_mode,
      p.off_route_landmark_hint
    FROM public.pois p
    JOIN public.poi_categories pc ON pc.id = p.category_id
    CROSS JOIN route
    WHERE p.merged_into IS NULL
      AND p.editorial_curated = TRUE
      AND p.parent_poi_id IS NULL
      AND ST_DWithin(p.location, route.geog, $2)
    ORDER BY route_position_fraction ASC, p.significance_score DESC, p.id ASC
  `;
  const res = await pool.query(sql, [routeWkt, corridorM]);
  return res.rows.map(r => ({
    id: r.id,
    name: r.name,
    category_slug: r.category_slug,
    significance_score: r.significance_score,
    editorial_score_boost: r.editorial_score_boost ?? 0,
    source_type: r.source_type,
    parent_poi_id: r.parent_poi_id,
    lat: Number(r.lat),
    lon: Number(r.lon),
    dist_from_route_mi: Number(r.dist_from_route_mi),
    route_position_fraction: Number(r.route_position_fraction),
    trigger_mode: r.trigger_mode as 'proximity' | 'closest_approach',
    off_route_landmark_hint: r.off_route_landmark_hint,
  }));
}

export interface RegionEntry {
  id: string;
  name: string;
  region_type: string;
  significance_tier: number | null;
  entry_fraction: number; // 0..1 along the route — first entry point
}

/**
 * Pull every region whose polygon intersects the route, with the
 * fractional position along the route where the route ENTERS the
 * polygon (first intersection's start point). One round trip.
 *
 * Reentries (route exits and re-enters the same polygon) are not
 * tracked — first entry wins. Adequate for v1 driving-mode region
 * narration which is one-per-trip-per-region per addendum.
 */
export async function getRegionEntries(
  pool: pkg.Pool,
  routeWkt: string,
): Promise<RegionEntry[]> {
  const sql = `
    WITH route AS (
      SELECT ST_GeomFromEWKT($1) AS geom
    ),
    intersected AS (
      SELECT
        r.id,
        r.name,
        r.region_type,
        r.significance_tier,
        ST_Intersection(route.geom, r.polygon::geometry) AS inter
      FROM public.regions r
      CROSS JOIN route
      WHERE ST_Intersects(route.geom, r.polygon::geometry)
    ),
    first_segment AS (
      SELECT
        i.id,
        i.name,
        i.region_type,
        i.significance_tier,
        CASE
          WHEN GeometryType(i.inter) = 'LINESTRING'      THEN i.inter
          WHEN GeometryType(i.inter) = 'MULTILINESTRING' THEN ST_GeometryN(i.inter, 1)
          WHEN GeometryType(i.inter) = 'POINT'           THEN NULL
          WHEN GeometryType(i.inter) = 'GEOMETRYCOLLECTION' THEN (
            SELECT ST_GeometryN(i.inter, gs.n)
              FROM generate_series(1, ST_NumGeometries(i.inter)) AS gs(n)
             WHERE GeometryType(ST_GeometryN(i.inter, gs.n)) IN ('LINESTRING', 'MULTILINESTRING')
             LIMIT 1
          )
          ELSE NULL
        END AS first_inter
      FROM intersected i
    )
    SELECT
      fs.id,
      fs.name,
      fs.region_type,
      fs.significance_tier,
      ST_LineLocatePoint(
        (SELECT geom FROM route),
        ST_StartPoint(
          CASE
            WHEN GeometryType(fs.first_inter) = 'MULTILINESTRING' THEN ST_GeometryN(fs.first_inter, 1)
            ELSE fs.first_inter
          END
        )
      ) AS entry_fraction
    FROM first_segment fs
    WHERE fs.first_inter IS NOT NULL
    ORDER BY entry_fraction
  `;
  const res = await pool.query(sql, [routeWkt]);
  return res.rows.map(r => ({
    id: r.id,
    name: r.name,
    region_type: r.region_type,
    significance_tier: r.significance_tier == null ? null : Number(r.significance_tier),
    entry_fraction: Number(r.entry_fraction),
  }));
}

export interface CategoryFloor {
  category: string;
  significance_floor: number;
}

export async function getCategoryFloors(pool: pkg.Pool): Promise<Map<string, number>> {
  const res = await pool.query(
    `SELECT category, significance_floor FROM public.category_significance_floors`,
  );
  const m = new Map<string, number>();
  for (const r of res.rows) m.set(r.category, Number(r.significance_floor));
  return m;
}

/**
 * Pull storage paths + estimated durations for the POI narrations
 * already in storage for the given POI IDs. The simulator uses these
 * to render "narration ready" indicators in the timeline.
 *
 * Duration estimate: Opus at the bitrate we ship lands around 24 kbps,
 * so file bytes / 3000 ≈ seconds. This is reported as an estimate.
 */
export interface PoiAudioMeta {
  poi_id: string;
  url: string;
  size_bytes: number;
  est_duration_sec: number;
}

export async function getPoiAudioMeta(
  pool: pkg.Pool,
  poiIds: string[],
  audioPrefix: string, // e.g. 'pois'
  audioSuffix: string, // e.g. 'narrator_b_family_standard.opus'
  publicUrlBase: string, // e.g. 'https://<host>/storage/v1/object/public/narration-audio'
): Promise<Map<string, PoiAudioMeta>> {
  if (poiIds.length === 0) return new Map();
  const sql = `
    SELECT o.name AS path, o.metadata->>'size' AS size_bytes
      FROM storage.objects o
     WHERE o.bucket_id = 'narration-audio'
       AND o.name ~ $1
  `;
  // Build a regex that matches "${audioPrefix}/(uuid)/${audioSuffix}" for any uuid in poiIds.
  // PostgreSQL POSIX regex; alternation on the id list.
  const idAlt = poiIds.map(id => id.replace(/-/g, '\\-')).join('|');
  const pattern = `^${audioPrefix}/(${idAlt})/${audioSuffix.replace(/\./g, '\\.')}$`;
  const res = await pool.query(sql, [pattern]);
  const out = new Map<string, PoiAudioMeta>();
  for (const row of res.rows) {
    const m = new RegExp(pattern).exec(row.path);
    if (!m) continue;
    const id = m[1]!;
    const sizeBytes = Number(row.size_bytes ?? 0);
    out.set(id, {
      poi_id: id,
      url: `${publicUrlBase}/${row.path}`,
      size_bytes: sizeBytes,
      est_duration_sec: Math.round(sizeBytes / 3000),
    });
  }
  return out;
}
