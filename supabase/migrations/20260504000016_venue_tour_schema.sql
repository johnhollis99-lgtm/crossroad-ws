-- ============================================================
-- Migration: Venue Tour schema (v1.0)
-- See: docs/venue-tour-design.md
--
-- Adds parent-child hierarchy, venue marking, venue polygons,
-- venue type classification, and a manual-review queue for
-- venue candidates that fail polygon lookup. Adds three new
-- RPCs (get_venue_tour_pois, detect_venue_at_location) and
-- patches get_nearby_pois with a p_include_children flag that
-- defaults to false (so drive-by triggering naturally excludes
-- venue children without changes to existing callers).
-- ============================================================

-- ────────────────────────────────────────────────────────────
-- 1. Parent-child relationship
-- ────────────────────────────────────────────────────────────

ALTER TABLE pois
  ADD COLUMN IF NOT EXISTS parent_poi_id uuid
    REFERENCES pois(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_pois_parent_poi_id
  ON pois(parent_poi_id) WHERE parent_poi_id IS NOT NULL;

-- ────────────────────────────────────────────────────────────
-- 2. Venue marking
-- ────────────────────────────────────────────────────────────

ALTER TABLE pois
  ADD COLUMN IF NOT EXISTS is_venue boolean NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_pois_is_venue
  ON pois(is_venue) WHERE is_venue = true;

-- ────────────────────────────────────────────────────────────
-- 3. Venue polygon (only populated when is_venue = true)
-- ────────────────────────────────────────────────────────────

ALTER TABLE pois
  ADD COLUMN IF NOT EXISTS venue_polygon geography(Polygon, 4326);

CREATE INDEX IF NOT EXISTS idx_pois_venue_polygon
  ON pois USING GIST(venue_polygon)
  WHERE venue_polygon IS NOT NULL;

-- ────────────────────────────────────────────────────────────
-- 4. Venue type classification
-- ────────────────────────────────────────────────────────────

ALTER TABLE pois
  ADD COLUMN IF NOT EXISTS venue_type text;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'venue_type_valid'
  ) THEN
    ALTER TABLE pois ADD CONSTRAINT venue_type_valid CHECK (
      venue_type IS NULL OR venue_type IN (
        'theme_park',
        'campus',
        'national_park',
        'state_park',
        'historic_district',
        'museum_complex',
        'mission',
        'cemetery',
        'zoo_aquarium',
        'estate',
        'shopping_district',
        'fairground',
        'religious_complex',
        'industrial_complex'
      )
    );
  END IF;
END$$;

CREATE INDEX IF NOT EXISTS idx_pois_venue_type
  ON pois(venue_type) WHERE venue_type IS NOT NULL;

-- ────────────────────────────────────────────────────────────
-- 5. Flexible per-venue metadata
-- ────────────────────────────────────────────────────────────

ALTER TABLE pois
  ADD COLUMN IF NOT EXISTS venue_metadata jsonb;

-- ────────────────────────────────────────────────────────────
-- 6. Cross-column constraints
-- ────────────────────────────────────────────────────────────

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'venue_polygon_requires_is_venue') THEN
    ALTER TABLE pois ADD CONSTRAINT venue_polygon_requires_is_venue CHECK (
      venue_polygon IS NULL OR is_venue = true
    );
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'venue_type_requires_is_venue') THEN
    ALTER TABLE pois ADD CONSTRAINT venue_type_requires_is_venue CHECK (
      venue_type IS NULL OR is_venue = true
    );
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'child_cannot_be_venue') THEN
    ALTER TABLE pois ADD CONSTRAINT child_cannot_be_venue CHECK (
      NOT (parent_poi_id IS NOT NULL AND is_venue = true)
    );
  END IF;
END$$;

-- ────────────────────────────────────────────────────────────
-- 7. Admin review queue for venue candidates without polygons
--    (Section 4.3 / 5.2 of venue-tour-design.md)
-- ────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS venue_classification_review (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  poi_id          uuid        REFERENCES pois(id) ON DELETE CASCADE,
  candidate_name  text        NOT NULL,
  proposed_type   text,
  reason          text        NOT NULL,
  source_hint     jsonb,
  review_status   text        NOT NULL DEFAULT 'pending'
                    CHECK (review_status IN ('pending', 'resolved', 'rejected')),
  resolved_at     timestamptz,
  resolved_by     text,
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_venue_review_status
  ON venue_classification_review(review_status);

ALTER TABLE venue_classification_review ENABLE ROW LEVEL SECURITY;

-- ────────────────────────────────────────────────────────────
-- 8. RPC: get_venue_tour_pois
-- ────────────────────────────────────────────────────────────

DROP FUNCTION IF EXISTS get_venue_tour_pois(uuid, double precision, double precision);

CREATE OR REPLACE FUNCTION get_venue_tour_pois(
  p_parent_poi_id uuid,
  p_user_lat      double precision DEFAULT NULL,
  p_user_lon      double precision DEFAULT NULL
)
RETURNS TABLE (
  id                  uuid,
  name                text,
  category            text,
  lat                 double precision,
  lng                 double precision,
  significance_score  numeric,
  distance_meters     double precision
)
LANGUAGE sql STABLE AS $$
  SELECT
    p.id,
    p.name,
    COALESCE(c.slug, 'unknown') AS category,
    ST_Y(p.location::geometry) AS lat,
    ST_X(p.location::geometry) AS lng,
    p.significance_score,
    CASE
      WHEN p_user_lat IS NOT NULL AND p_user_lon IS NOT NULL
        THEN ST_Distance(
          p.location,
          ST_MakePoint(p_user_lon, p_user_lat)::geography
        )
      ELSE NULL
    END AS distance_meters
  FROM pois p
  LEFT JOIN poi_categories c ON c.id = p.category_id
  WHERE p.parent_poi_id = p_parent_poi_id
    AND p.merged_into IS NULL
  ORDER BY
    CASE
      WHEN p_user_lat IS NOT NULL AND p_user_lon IS NOT NULL THEN
        ST_Distance(p.location, ST_MakePoint(p_user_lon, p_user_lat)::geography)
      ELSE 1.0 / GREATEST(p.significance_score, 1)
    END ASC;
$$;

GRANT EXECUTE ON FUNCTION get_venue_tour_pois(uuid, double precision, double precision)
  TO anon, authenticated;

-- ────────────────────────────────────────────────────────────
-- 9. RPC: detect_venue_at_location
-- ────────────────────────────────────────────────────────────

DROP FUNCTION IF EXISTS detect_venue_at_location(double precision, double precision);

CREATE OR REPLACE FUNCTION detect_venue_at_location(
  p_lat double precision,
  p_lon double precision
)
RETURNS TABLE (
  id              uuid,
  name            text,
  venue_type      text,
  polygon_area_m2 double precision
)
LANGUAGE sql STABLE AS $$
  SELECT
    p.id,
    p.name,
    p.venue_type,
    ST_Area(p.venue_polygon) AS polygon_area_m2
  FROM pois p
  WHERE p.is_venue = true
    AND p.merged_into IS NULL
    AND p.venue_polygon IS NOT NULL
    AND ST_Contains(
      p.venue_polygon::geometry,
      ST_SetSRID(ST_MakePoint(p_lon, p_lat), 4326)
    )
  ORDER BY ST_Area(p.venue_polygon) ASC
  LIMIT 1;
$$;

GRANT EXECUTE ON FUNCTION detect_venue_at_location(double precision, double precision)
  TO anon, authenticated;

-- ────────────────────────────────────────────────────────────
-- 10. Patch get_nearby_pois — add p_include_children flag
--     (defaults false, so existing drive-by callers naturally
--     exclude venue children without code changes)
-- ────────────────────────────────────────────────────────────

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

-- ────────────────────────────────────────────────────────────
-- End of migration
-- ────────────────────────────────────────────────────────────
