-- Migration: add trip_mode to pois, update RPCs with mode_filter param

-- 1. Add trip_mode column (idempotent)
ALTER TABLE pois
  ADD COLUMN IF NOT EXISTS trip_mode text NOT NULL DEFAULT 'all'
  CONSTRAINT pois_trip_mode_check CHECK (trip_mode IN ('driving', 'hiking', 'city', 'all'));

-- 2. Drop ALL existing overloads of both RPCs so we can recreate cleanly
DO $$
DECLARE r RECORD;
BEGIN
  FOR r IN
    SELECT oid::regprocedure::text AS sig
    FROM pg_proc
    WHERE proname IN ('get_corridor_pois', 'get_nearby_pois')
      AND pronamespace = 'public'::regnamespace
  LOOP
    EXECUTE 'DROP FUNCTION IF EXISTS ' || r.sig || ' CASCADE';
  END LOOP;
END;
$$;

-- 3. Recreate get_corridor_pois with optional mode_filter
CREATE OR REPLACE FUNCTION get_corridor_pois(
  route_geom           text,
  corridor_width_miles float8  DEFAULT 15,
  category_filter      text[]  DEFAULT NULL,
  mode_filter          text    DEFAULT NULL
)
RETURNS TABLE(
  id                text,
  name              text,
  category          text,
  lat               float8,
  lng               float8,
  tags              text[],
  dist_from_route_m float8
)
LANGUAGE sql STABLE
AS $$
  SELECT
    p.id::text,
    p.name,
    c.slug    AS category,
    ST_Y(p.location::geometry) AS lat,
    ST_X(p.location::geometry) AS lng,
    p.tags,
    ST_Distance(p.location, ST_GeogFromText(route_geom)) AS dist_from_route_m
  FROM pois p
  JOIN poi_categories c ON c.id = p.category_id
  WHERE ST_DWithin(
    p.location,
    ST_GeogFromText(route_geom),
    corridor_width_miles * 1609.34
  )
  AND (category_filter IS NULL OR c.slug = ANY(category_filter))
  AND (mode_filter IS NULL OR p.trip_mode = 'all' OR p.trip_mode = mode_filter)
  ORDER BY
    ST_LineLocatePoint(
      ST_GeomFromText(
        regexp_replace(route_geom, '^SRID=[0-9]+;', ''), 4326
      ),
      p.location::geometry
    )
$$;

-- 4. Recreate get_nearby_pois with optional mode_filter
CREATE OR REPLACE FUNCTION get_nearby_pois(
  user_lat    float8,
  user_lng    float8,
  radius_m    float8  DEFAULT 800,
  categories  text[]  DEFAULT NULL,
  mode_filter text    DEFAULT NULL
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
    c.slug    AS category,
    ST_Y(p.location::geometry) AS lat,
    ST_X(p.location::geometry) AS lng,
    p.tags,
    ST_Distance(
      p.location,
      ST_MakePoint(user_lng, user_lat)::geography
    ) AS distance_m
  FROM pois p
  JOIN poi_categories c ON c.id = p.category_id
  WHERE ST_DWithin(
    p.location,
    ST_MakePoint(user_lng, user_lat)::geography,
    radius_m
  )
  AND (categories IS NULL OR c.slug = ANY(categories))
  AND (mode_filter IS NULL OR p.trip_mode = 'all' OR p.trip_mode = mode_filter)
  ORDER BY distance_m
$$;

-- 5. Re-grant execute permissions
GRANT EXECUTE ON FUNCTION get_corridor_pois(text, float8, text[], text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION get_nearby_pois(float8, float8, float8, text[], text) TO anon, authenticated;
