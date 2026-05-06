-- ============================================================
-- RoadStory Schema Migration
-- Full schema: poi_categories, pois (new), corridors, badge_definitions
-- Run on a fresh Supabase project or one that has only the old pois + routes tables.
-- ============================================================

-- Require PostGIS
CREATE EXTENSION IF NOT EXISTS postgis;

-- ============================================================
-- 1. POI CATEGORIES
-- ============================================================

CREATE TABLE IF NOT EXISTS poi_categories (
  id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  slug          text        UNIQUE NOT NULL,
  display_name  text        NOT NULL,
  parent_id     uuid        REFERENCES poi_categories(id) ON DELETE SET NULL,
  relevant_driving  boolean NOT NULL DEFAULT false,
  relevant_hiking   boolean NOT NULL DEFAULT false,
  relevant_city     boolean NOT NULL DEFAULT false,
  sort_order    integer     NOT NULL DEFAULT 0,
  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS poi_categories_parent_idx ON poi_categories (parent_id);

-- ============================================================
-- 2. POIS (new schema — drops old flat version if it exists)
-- ============================================================

-- The old pois table (if present) had flat lat/lng columns and no FK to categories.
-- It was empty, so a clean drop-and-recreate is safe.
DROP TABLE IF EXISTS pois CASCADE;

CREATE TABLE pois (
  id                      uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  name                    text        NOT NULL,
  subtitle                text,
  description             text,
  location                geography(Point, 4326) NOT NULL,
  category_id             uuid        REFERENCES poi_categories(id) ON DELETE SET NULL,
  poi_type                text        NOT NULL DEFAULT 'point',
  visibility_radius_miles numeric(6,2) NOT NULL DEFAULT 1.0,
  significance_score      numeric(4,2) NOT NULL DEFAULT 5.0,
  source                  text        NOT NULL DEFAULT 'curated',
  editorial_status        text        NOT NULL DEFAULT 'draft',
  tags                    text[]      NOT NULL DEFAULT '{}',
  created_at              timestamptz NOT NULL DEFAULT now(),
  updated_at              timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX pois_location_idx        ON pois USING GIST (location);
CREATE INDEX pois_category_id_idx     ON pois (category_id);
CREATE INDEX pois_significance_idx    ON pois (significance_score DESC);
CREATE INDEX pois_editorial_idx       ON pois (editorial_status);

-- ============================================================
-- 3. CORRIDORS
-- ============================================================

CREATE TABLE IF NOT EXISTS corridors (
  id                  uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  name                text        NOT NULL,
  subtitle            text,
  path                geography(LineString, 4326) NOT NULL,
  region_type         text        NOT NULL DEFAULT 'rural',
  region_context      jsonb,
  estimated_minutes   integer,
  editorial_status    text        NOT NULL DEFAULT 'draft',
  created_at          timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS corridors_path_idx ON corridors USING GIST (path);

-- ============================================================
-- 4. BADGE DEFINITIONS
-- ============================================================

CREATE TABLE IF NOT EXISTS badge_definitions (
  id              uuid    PRIMARY KEY DEFAULT gen_random_uuid(),
  slug            text    UNIQUE NOT NULL,
  display_name    text    NOT NULL,
  description     text,
  rule_type       text    NOT NULL,
  rule_category   text,
  rule_threshold  integer,
  tier            text    NOT NULL DEFAULT 'standard',
  sort_order      integer NOT NULL DEFAULT 0,
  created_at      timestamptz NOT NULL DEFAULT now()
);

-- ============================================================
-- 5. RPC: get_corridor_pois

-- Drop all overloads of these functions so we can redefine return types
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
-- Returns POIs within corridor_width_miles of a route LineString.
-- Returns the same shape as the app's POI interface.
-- ============================================================

CREATE OR REPLACE FUNCTION get_corridor_pois(
  route_geom          text,          -- WKT or EWKT LineString, e.g. 'SRID=4326;LINESTRING(...)'
  corridor_width_miles numeric,
  category_filter     text[] DEFAULT NULL
)
RETURNS TABLE (
  id                  uuid,
  name                text,
  category            text,
  lat                 double precision,
  lng                 double precision,
  tags                text[],
  dist_from_route_m   double precision,
  significance_score  numeric
)
LANGUAGE sql STABLE
AS $$
  SELECT
    p.id,
    p.name,
    COALESCE(c.slug, 'unknown') AS category,
    ST_Y(p.location::geometry)  AS lat,
    ST_X(p.location::geometry)  AS lng,
    p.tags,
    ST_Distance(p.location, route_geom::geography) AS dist_from_route_m,
    p.significance_score
  FROM pois p
  LEFT JOIN poi_categories c ON c.id = p.category_id
  WHERE
    p.editorial_status = 'verified'
    AND ST_DWithin(
          p.location,
          route_geom::geography,
          corridor_width_miles * 1609.34
        )
    AND (
      category_filter IS NULL
      OR c.slug = ANY(category_filter)
    )
  ORDER BY dist_from_route_m ASC, p.significance_score DESC;
$$;

-- ============================================================
-- 6. RPC: get_nearby_pois
-- Returns POIs within radius_m of a GPS coordinate.
-- ============================================================

CREATE OR REPLACE FUNCTION get_nearby_pois(
  user_lat    double precision,
  user_lng    double precision,
  radius_m    double precision DEFAULT 800,
  categories  text[] DEFAULT NULL
)
RETURNS TABLE (
  id          uuid,
  name        text,
  category    text,
  lat         double precision,
  lng         double precision,
  tags        text[],
  distance_m  double precision
)
LANGUAGE sql STABLE
AS $$
  SELECT
    p.id,
    p.name,
    COALESCE(c.slug, 'unknown') AS category,
    ST_Y(p.location::geometry) AS lat,
    ST_X(p.location::geometry) AS lng,
    p.tags,
    ST_Distance(
      p.location,
      ST_SetSRID(ST_MakePoint(user_lng, user_lat), 4326)::geography
    ) AS distance_m
  FROM pois p
  LEFT JOIN poi_categories c ON c.id = p.category_id
  WHERE
    p.editorial_status = 'verified'
    AND ST_DWithin(
          p.location,
          ST_SetSRID(ST_MakePoint(user_lng, user_lat), 4326)::geography,
          radius_m
        )
    AND (
      categories IS NULL
      OR c.slug = ANY(categories)
    )
  ORDER BY distance_m ASC;
$$;

-- ============================================================
-- 7. Row Level Security
-- Read-only public access on content tables; no anon writes.
-- ============================================================

ALTER TABLE poi_categories    ENABLE ROW LEVEL SECURITY;
ALTER TABLE pois               ENABLE ROW LEVEL SECURITY;
ALTER TABLE corridors          ENABLE ROW LEVEL SECURITY;
ALTER TABLE badge_definitions  ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public read poi_categories"   ON poi_categories   FOR SELECT USING (true);
CREATE POLICY "Public read pois"             ON pois             FOR SELECT USING (true);
CREATE POLICY "Public read corridors"        ON corridors        FOR SELECT USING (true);
CREATE POLICY "Public read badge_definitions" ON badge_definitions FOR SELECT USING (true);

-- Grant SELECT to anon and authenticated roles
GRANT SELECT ON poi_categories   TO anon, authenticated;
GRANT SELECT ON pois              TO anon, authenticated;
GRANT SELECT ON corridors         TO anon, authenticated;
GRANT SELECT ON badge_definitions TO anon, authenticated;
GRANT EXECUTE ON FUNCTION get_corridor_pois TO anon, authenticated;
GRANT EXECUTE ON FUNCTION get_nearby_pois   TO anon, authenticated;
