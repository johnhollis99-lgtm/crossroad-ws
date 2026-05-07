-- ============================================================
-- Migration: POI significance breakdown
-- Adds significance_breakdown jsonb column, highway_routes table
-- for route adjacency scoring, and two batch RPCs used by the
-- recompute-significance.ts script.
-- ============================================================

-- ────────────────────────────────────────────────────────────
-- 1. significance_breakdown column
-- ────────────────────────────────────────────────────────────
-- Stores per-component integer points so scores can be audited.
-- Shape: { source_base, cross_source, pageviews, route_adjacency, total }
ALTER TABLE pois
  ADD COLUMN IF NOT EXISTS significance_breakdown jsonb;

-- ────────────────────────────────────────────────────────────
-- 2. Highway routes (precomputed PostGIS layer)
-- ────────────────────────────────────────────────────────────
-- Populated separately (via OSM import or manual seed).
-- highway_class values:
--   major_ca      → I-5, US-101, CA-1/PCH, I-80, I-15  (+10 pts within 1 km)
--   interstate    → all other CA Interstates             (+5 pts within 5 km)
--   us_highway    → all US-route highways in CA          (+5 pts within 5 km)
--   state_highway → CA state routes (informational only, no points)
CREATE TABLE IF NOT EXISTS highway_routes (
  id             serial  PRIMARY KEY,
  ref            text    NOT NULL,
  highway_class  text    NOT NULL
    CONSTRAINT highway_routes_class_check
    CHECK (highway_class IN ('major_ca', 'interstate', 'us_highway', 'state_highway')),
  geom           geometry(MultiLineString, 4326) NOT NULL
);

CREATE INDEX IF NOT EXISTS highway_routes_geom_idx
  ON highway_routes USING gist (geom);

-- ────────────────────────────────────────────────────────────
-- 3. batch_route_adjacency_scores RPC
-- ────────────────────────────────────────────────────────────
-- Returns adjacency_points per POI:
--   10  if within 1 km of a major_ca highway
--    5  if within 5 km of any interstate or us_highway
--    0  otherwise (including when highway_routes is empty)
CREATE OR REPLACE FUNCTION batch_route_adjacency_scores(poi_ids uuid[])
RETURNS TABLE (poi_id uuid, adjacency_points int)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  WITH pts AS (
    SELECT p.id               AS poi_id,
           p.location::geography AS geog
    FROM   pois p
    WHERE  p.id = ANY(poi_ids)
  ),
  within_major AS (
    SELECT DISTINCT pt.poi_id
    FROM   pts pt
    JOIN   highway_routes h
           ON  h.highway_class = 'major_ca'
           AND ST_DWithin(pt.geog, h.geom::geography, 1000)
  ),
  within_any AS (
    SELECT DISTINCT pt.poi_id
    FROM   pts pt
    JOIN   highway_routes h
           ON  h.highway_class IN ('interstate', 'us_highway')
           AND ST_DWithin(pt.geog, h.geom::geography, 5000)
  )
  SELECT
    pt.poi_id,
    CASE
      WHEN wm.poi_id IS NOT NULL THEN 10
      WHEN wa.poi_id IS NOT NULL THEN  5
      ELSE 0
    END::int AS adjacency_points
  FROM   pts pt
  LEFT JOIN within_major wm ON wm.poi_id = pt.poi_id
  LEFT JOIN within_any   wa ON wa.poi_id = pt.poi_id;
$$;

-- ────────────────────────────────────────────────────────────
-- 4. batch_update_significance RPC
-- ────────────────────────────────────────────────────────────
-- Accepts parallel arrays (ids / scores / breakdowns) and
-- issues a single UPDATE … FROM unnest(…) for the whole batch.
CREATE OR REPLACE FUNCTION batch_update_significance(
  p_ids        uuid[],
  p_scores     numeric[],
  p_breakdowns jsonb[]
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE pois
  SET    significance_score     = vals.score,
         significance_breakdown = vals.breakdown
  FROM   (
    SELECT
      unnest(p_ids)        AS id,
      unnest(p_scores)     AS score,
      unnest(p_breakdowns) AS breakdown
  ) AS vals
  WHERE  pois.id = vals.id;
END;
$$;
