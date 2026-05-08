-- 20260504000017_get_nearby_pois_confidence_filter.sql
-- Adds `AND p.confidence_score >= 0.5` to get_nearby_pois so low-confidence
-- imports (e.g. NRHP rows that geocoded only to county centroid with
-- confidence_score=0) are excluded from drive-by / nearby queries.
-- Unblocks the 4-county NRHP import: low-confidence rows can be ingested
-- without polluting the live nearby surface.
--
-- get_route_pois does not exist in this codebase (the corridor query is
-- get_corridor_pois; nearby is get_nearby_pois) — skipped per instructions.

DO $$
DECLARE r RECORD;
BEGIN
  FOR r IN
    SELECT oid::regprocedure::text AS sig
    FROM pg_proc
    WHERE proname = 'get_nearby_pois'
      AND pronamespace = 'public'::regnamespace
  LOOP
    EXECUTE 'DROP FUNCTION IF EXISTS ' || r.sig || ' CASCADE';
  END LOOP;
END$$;

CREATE OR REPLACE FUNCTION get_nearby_pois(
  user_lat            float8,
  user_lng            float8,
  radius_m            float8  DEFAULT 800,
  categories          text[]  DEFAULT NULL,
  mode_filter         text    DEFAULT NULL,
  p_include_children  boolean DEFAULT false
)
RETURNS TABLE(
  id          text,
  name        text,
  category    text,
  lat         float8,
  lng         float8,
  tags        text[],
  distance_m  float8
)
LANGUAGE sql STABLE
AS $$
  SELECT
    p.id::text,
    p.name,
    COALESCE(c.slug, 'unknown') AS category,
    ST_Y(p.location::geometry) AS lat,
    ST_X(p.location::geometry) AS lng,
    p.tags,
    ST_Distance(
      p.location,
      ST_MakePoint(user_lng, user_lat)::geography
    ) AS distance_m
  FROM pois p
  LEFT JOIN poi_categories c ON c.id = p.category_id
  WHERE p.merged_into IS NULL
    AND p.confidence_score >= 0.5
    AND (p_include_children OR p.parent_poi_id IS NULL)
    AND ST_DWithin(
      p.location,
      ST_MakePoint(user_lng, user_lat)::geography,
      radius_m
    )
    AND (categories IS NULL OR c.slug = ANY(categories))
    AND (mode_filter IS NULL OR p.trip_mode = 'all' OR p.trip_mode = mode_filter)
  ORDER BY distance_m;
$$;

GRANT EXECUTE ON FUNCTION get_nearby_pois(float8, float8, float8, text[], text, boolean)
  TO anon, authenticated;
