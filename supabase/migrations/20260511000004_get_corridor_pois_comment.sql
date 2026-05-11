-- 20260511000004_get_corridor_pois_comment.sql
--
-- Resolves drift catalog entry 5.35 (get_corridor_pois RPC name overlap
-- with public.corridors table).
--
-- The function name suggests it joins or filters by the public.corridors
-- table; it does neither. It takes an arbitrary WKT/EWKT LineString as
-- route_geom and returns POIs within a corridor_width_miles buffer of
-- that line. COMMENT exists so a future maintainer reading function
-- definitions (\df+ in psql, pg_catalog queries) discovers actual
-- behavior without grepping the codebase.
--
-- Cross-ref: drift catalog 5.28 (corridors table is editorial seed data
-- orphaned from the request graph). The name-overlap finding surfaced
-- inside 5.28's close — it strengthened that entry but did not resolve
-- the misleading function-name signal. 5.35 closes that gap.
--
-- Pre-flight (verified 2026-05-11 against staging via direct pg):
--   Signature (single overload):
--     get_corridor_pois(route_geom text, corridor_width_miles double precision,
--                       category_filter text[], mode_filter text)
--   obj_description(oid, 'pg_proc') is NULL — no existing COMMENT to
--   replace; new metadata only.

BEGIN;

COMMENT ON FUNCTION public.get_corridor_pois(text, double precision, text[], text) IS
  'Returns POIs within corridor_width_miles of a route LineString supplied as WKT/EWKT via route_geom; optional category_filter and mode_filter narrow results. Does not read the public.corridors table — "corridor" here means the geographic buffer around the supplied route, not the editorial named-drive table.';

COMMIT;

-- Verification (re-run post-apply):
--   SELECT proname,
--          pg_get_function_identity_arguments(oid),
--          obj_description(oid, 'pg_proc')
--     FROM pg_proc
--    WHERE proname = 'get_corridor_pois'
--      AND pronamespace = 'public'::regnamespace;
--   → 1 row
--     proname = 'get_corridor_pois'
--     args    = 'route_geom text, corridor_width_miles double precision,
--                category_filter text[], mode_filter text'  (unchanged)
--     obj_description = the COMMENT text above
