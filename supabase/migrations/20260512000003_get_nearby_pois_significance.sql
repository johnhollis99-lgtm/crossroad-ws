-- 20260512000003_get_nearby_pois_significance.sql
--
-- Drift catalog 5.67 — parity with get_corridor_pois.
-- Drift catalog 5.86 — corrects the in-CASE alias-resolution bug from the
--   initial file shipped 2026-05-12. See "Bug fix" note below for details.
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
--
-- Bug fix (drift 5.86): the prior version of this file used `distance_m`
-- (a SELECT-list alias for ST_Distance(...)) inside the ORDER BY's CASE
-- expression. PostgreSQL only resolves SELECT aliases when they appear
-- as bare column references in ORDER BY; inside a CASE expression, name
-- resolution falls back to the FROM clause and `distance_m` isn't there
-- → `ERROR: 42703: column "distance_m" does not exist`. The corridor
-- sibling (20260512000002) doesn't hit this because it inlines
-- ST_LineLocatePoint in the ORDER BY CASE instead of aliasing it. This
-- file now inlines ST_Distance the same way.
--
-- Live-DB state at fix time: 20260512000003's DO block did successfully
-- drop the prior `get_nearby_pois` function before the CREATE failed,
-- so the live DB had ZERO get_nearby_pois function between the broken
-- apply and this fix. Browse mode and live-driving trigger queries were
-- temporarily broken. Wrapped in BEGIN/COMMIT below so a future failure
-- can't leave the DB in that half-applied state.

BEGIN;

-- Drop existing overload(s) to avoid PostgREST schema-cache ambiguity.
-- Idempotent: zero matches → zero EXECUTE iterations.
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
    -- ST_Distance inlined here (was `distance_m` alias, drift 5.86) so name
    -- resolution doesn't fall through to the FROM clause and 42703 out.
    CASE WHEN sort_mode = 'distance_asc' OR sort_mode IS NULL OR sort_mode NOT IN ('significance_desc') THEN
      ST_Distance(p.location, ST_MakePoint(user_lng, user_lat)::geography)
    END NULLS LAST
  LIMIT CASE WHEN result_limit IS NULL OR result_limit < 0 THEN NULL ELSE result_limit END;
$$;

GRANT EXECUTE ON FUNCTION public.get_nearby_pois(
  float8, float8, float8, text[], text, boolean, float8, text, integer
) TO anon, authenticated;

COMMIT;

-- Verification (re-run post-apply):
--   SELECT proname, pg_get_function_identity_arguments(oid)
--     FROM pg_proc
--    WHERE proname = 'get_nearby_pois'
--      AND pronamespace = 'public'::regnamespace;
--   → 1 row, 9 args matching the signature above
--
--   SELECT * FROM get_nearby_pois(34.05, -118.24, 5000, NULL, 'driving',
--                                  false, 50, 'significance_desc', 10);
--   → up to 10 rows, all significance_score >= 50, sorted by score DESC
