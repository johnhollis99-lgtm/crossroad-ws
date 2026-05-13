-- 20260513000001_get_corridor_pois_overload_cleanup.sql
--
-- Drift catalog 5.90.
--
-- Migration 20260512000002 expanded `get_corridor_pois` from a 4-arg
-- signature (route_geom, corridor_width_miles, category_filter,
-- mode_filter) to a 7-arg signature (adds min_significance, sort_mode,
-- result_limit). It used `CREATE OR REPLACE FUNCTION` for the new shape.
--
-- PostgreSQL's REPLACE semantics only fire when the new argument list
-- matches the existing one exactly. With a different signature, the new
-- function is CREATED as an additional overload — the old 4-arg version
-- stays. After 20260512000002 applied, the live DB had TWO overloads of
-- `get_corridor_pois`, which PostgREST cannot disambiguate:
--
--   ERROR: PGRST203
--     "Could not choose the best candidate function between:
--      public.get_corridor_pois(route_geom => text, …)"
--
-- Every corridor RPC call from the mobile app (home post-route fetch,
-- drive corridor fetch, customize live-count badge) was failing with
-- PGRST203 silently. The downstream symptom: filter chips + sliders on
-- customize don't update the POI count.
--
-- This migration drops ALL overloads of `get_corridor_pois`, then
-- `CREATE FUNCTION`s the single canonical 7-arg shape from 20260512000002.
-- Using `CREATE FUNCTION` (not REPLACE) is intentional — after the DROP
-- loop the function does not exist; REPLACE would silently no-op the
-- "would-replace" case but CREATE makes the intent unambiguous and would
-- error loudly if a future overload somehow survived the DROP loop.
--
-- Wrapped in BEGIN/COMMIT so a partial apply (drop succeeds, create
-- fails) rolls back to the still-broken-but-not-worse two-overload
-- state rather than leaving zero overloads (which would harden the
-- outage instead of fixing it).
--
-- Sibling note: `get_nearby_pois` does NOT have this issue.
-- Migration 20260512000003 (and its fix migration in commit a8f3003)
-- pre-drops all overloads via a DO loop before the CREATE OR REPLACE,
-- so signature divergence doesn't leak stale overloads. Verified by
-- reading the file.

BEGIN;

-- Drop every overload of public.get_corridor_pois currently in the
-- schema. Loops via pg_proc so unknown / future overloads can't
-- escape — pre-flight signature inventory wasn't required; we wipe
-- whatever's there and recreate the canonical one.
DO $$
DECLARE func_sig text;
BEGIN
  FOR func_sig IN
    SELECT pg_get_function_identity_arguments(oid)
    FROM pg_proc
    WHERE proname = 'get_corridor_pois'
      AND pronamespace = 'public'::regnamespace
  LOOP
    EXECUTE 'DROP FUNCTION public.get_corridor_pois(' || func_sig || ')';
  END LOOP;
END $$;

-- Canonical 7-arg signature (same body as 20260512000002). CREATE, not
-- CREATE OR REPLACE — after the DROP loop the function is gone, and the
-- bare CREATE makes the intent explicit + fails loudly if a stray
-- overload survived (which would defeat the cleanup).
CREATE FUNCTION public.get_corridor_pois(
  route_geom            text,
  corridor_width_miles  double precision DEFAULT 15,
  category_filter       text[]           DEFAULT NULL::text[],
  mode_filter           text             DEFAULT NULL::text,
  min_significance      double precision DEFAULT 0,
  sort_mode             text             DEFAULT 'distance_asc',
  result_limit          integer          DEFAULT NULL
)
RETURNS TABLE (
  id                  text,
  name                text,
  category            text,
  lat                 double precision,
  lng                 double precision,
  tags                text[],
  significance_score  numeric,
  dist_from_route_m   double precision
)
LANGUAGE sql
STABLE
AS $function$
  SELECT
    p.id::text,
    p.name,
    c.slug    AS category,
    ST_Y(p.location::geometry) AS lat,
    ST_X(p.location::geometry) AS lng,
    p.tags,
    p.significance_score,
    ST_Distance(p.location, ST_GeogFromText(route_geom)) AS dist_from_route_m
  FROM pois p
  JOIN poi_categories c ON c.id = p.category_id
  WHERE p.merged_into IS NULL
    AND p.confidence_score >= 0.5
    AND p.significance_score >= min_significance
    AND ST_DWithin(
      p.location,
      ST_GeogFromText(route_geom),
      corridor_width_miles * 1609.34
    )
    AND (category_filter IS NULL OR c.slug = ANY(category_filter))
    AND (mode_filter IS NULL OR p.trip_mode = 'all' OR p.trip_mode = mode_filter)
  ORDER BY
    CASE WHEN sort_mode = 'significance_desc' THEN -p.significance_score END NULLS LAST,
    CASE WHEN sort_mode = 'distance_asc' OR sort_mode IS NULL OR sort_mode NOT IN ('significance_desc') THEN
      ST_LineLocatePoint(
        ST_GeomFromText(
          regexp_replace(route_geom, '^SRID=[0-9]+;', ''), 4326
        ),
        p.location::geometry
      )
    END NULLS LAST
  LIMIT CASE WHEN result_limit IS NULL OR result_limit < 0 THEN NULL ELSE result_limit END;
$function$;

GRANT EXECUTE ON FUNCTION public.get_corridor_pois(
  text, double precision, text[], text, double precision, text, integer
) TO anon, authenticated;

COMMENT ON FUNCTION public.get_corridor_pois(
  text, double precision, text[], text, double precision, text, integer
) IS
'Returns POIs within a corridor around a WKT/EWKT LineString. Canonical
7-arg signature after the 20260513000001 overload-cleanup migration
(see drift catalog 5.90 for why this cleanup was needed). Params:
min_significance (default 0; drops POIs below this 0–100 score),
sort_mode (''significance_desc'' for curation; ''distance_asc'' =
arc-length-along-route, legacy default), result_limit (server LIMIT;
NULL = unbounded). Filters: merged_into IS NULL, confidence_score >= 0.5,
significance_score >= min_significance. See drift 5.67 / 5.35 / 5.90.';

COMMIT;

-- Verification (re-run post-apply):
--
--   SELECT count(*)
--     FROM pg_proc
--    WHERE proname = 'get_corridor_pois'
--      AND pronamespace = 'public'::regnamespace;
--   → 1
--
--   SELECT pg_get_function_identity_arguments(oid)
--     FROM pg_proc
--    WHERE proname = 'get_corridor_pois'
--      AND pronamespace = 'public'::regnamespace;
--   → route_geom text, corridor_width_miles double precision,
--     category_filter text[], mode_filter text,
--     min_significance double precision, sort_mode text,
--     result_limit integer
--
-- And a live PostgREST call (curl the function endpoint, or via the
-- mobile app's `countPOIsAlongRoute`) should now succeed without
-- PGRST203.
