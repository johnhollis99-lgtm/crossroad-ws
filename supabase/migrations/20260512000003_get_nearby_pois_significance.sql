-- 20260512000003_get_nearby_pois_significance.sql
--
-- Drift catalog 5.67 — parity with get_corridor_pois.
--
-- Surfaces significance_score on get_nearby_pois and adds the same three
-- optional params (min_significance, sort_mode, result_limit) so the
-- pre-route browse flow can sort by significance instead of pure
-- distance. Curation on the browse path is a v1.5 follow-up; this
-- migration is the plumbing.
--
-- Backward compatibility: defaults preserve the previous behavior
-- (no significance floor, distance_asc sort, no LIMIT). Existing 5-arg
-- callers in lib/supabase.ts continue working unchanged.

-- Drop existing overload(s) to avoid PostgREST schema-cache ambiguity.
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

CREATE OR REPLACE FUNCTION public.get_nearby_pois(
  user_lat            float8,
  user_lng            float8,
  radius_m            float8  DEFAULT 800,
  categories          text[]  DEFAULT NULL,
  mode_filter         text    DEFAULT NULL,
  p_include_children  boolean DEFAULT false,
  min_significance    float8  DEFAULT 0,
  sort_mode           text    DEFAULT 'distance_asc',
  result_limit        integer DEFAULT NULL
)
RETURNS TABLE(
  id                  text,
  name                text,
  category            text,
  lat                 float8,
  lng                 float8,
  tags                text[],
  significance_score  numeric,
  distance_m          float8
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
    p.significance_score,
    ST_Distance(
      p.location,
      ST_MakePoint(user_lng, user_lat)::geography
    ) AS distance_m
  FROM pois p
  LEFT JOIN poi_categories c ON c.id = p.category_id
  WHERE p.merged_into IS NULL
    AND p.confidence_score >= 0.5
    AND p.significance_score >= min_significance
    AND (p_include_children OR p.parent_poi_id IS NULL)
    AND ST_DWithin(
      p.location,
      ST_MakePoint(user_lng, user_lat)::geography,
      radius_m
    )
    AND (categories IS NULL OR c.slug = ANY(categories))
    AND (mode_filter IS NULL OR p.trip_mode = 'all' OR p.trip_mode = mode_filter)
  ORDER BY
    CASE WHEN sort_mode = 'significance_desc' THEN -p.significance_score END NULLS LAST,
    CASE WHEN sort_mode = 'distance_asc' OR sort_mode IS NULL OR sort_mode NOT IN ('significance_desc') THEN distance_m END NULLS LAST
  LIMIT CASE WHEN result_limit IS NULL OR result_limit < 0 THEN NULL ELSE result_limit END;
$$;

GRANT EXECUTE ON FUNCTION public.get_nearby_pois(
  float8, float8, float8, text[], text, boolean, float8, text, integer
) TO anon, authenticated;
