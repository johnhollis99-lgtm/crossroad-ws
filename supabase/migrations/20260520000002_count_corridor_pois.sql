-- count_corridor_pois — fast count counterpart to get_corridor_pois.
--
-- Why: PostgREST's count='exact' wraps the RPC in a CTE that
-- materializes the full result set before counting. Under C1+G2
-- (heavier WHERE clause + dual ST_DWithin OR-branch + JOIN to
-- category_significance_floors + ORDER BY with tier promotion +
-- priority_tier CASE), concurrent count calls — notably the home
-- page's N-parallel fan-out for route-alternative POI badges — cross
-- the Supabase anon role's statement_timeout. The pg log surfaces
-- "canceling statement due to statement timeout" and PostgREST
-- returns HTTP 500. Non-fatal (countPOIsAlongRoute returns null and
-- badges stay blank) but visible.
--
-- This function mirrors get_corridor_pois's WHERE clause bit-for-bit
-- (C1+G2 state) and returns just bigint. No ORDER BY, no SELECT
-- columns, no LIMIT, no priority_tier — the planner can pick a
-- cheaper plan since the result set isn't materialized or sorted.
--
-- Signature drops sort_mode + result_limit from get_corridor_pois
-- (irrelevant for counts); keeps the same first 5 args so callsite
-- shape mirrors the existing countPOIsAlongRoute call.
--
-- Fresh function — no prior overload. Bare CREATE inside BEGIN/COMMIT;
-- drift-5.90 DROP-loop not needed.

BEGIN;

CREATE FUNCTION public.count_corridor_pois(
  route_geom            text,
  corridor_width_miles  double precision DEFAULT 15,
  category_filter       text[]           DEFAULT NULL::text[],
  mode_filter           text             DEFAULT NULL::text,
  min_significance      double precision DEFAULT 0
)
RETURNS bigint
LANGUAGE sql
STABLE
AS $function$
  SELECT COUNT(*)::bigint
  FROM pois p
  JOIN poi_categories c ON c.id = p.category_id
  LEFT JOIN category_significance_floors csf ON csf.category = c.slug
  WHERE p.merged_into IS NULL
    AND p.confidence_score >= 0.5
    AND (
      p.editorial_curated = TRUE
      OR p.iconic_local   = TRUE
      OR p.significance_score >= GREATEST(
           COALESCE(csf.significance_floor, 70)::double precision,
           min_significance
         )
    )
    AND (
      ST_DWithin(
        p.location,
        ST_GeogFromText(route_geom),
        corridor_width_miles * 1609.34
      )
      OR (
        (p.editorial_curated = TRUE OR p.iconic_local = TRUE)
        AND ST_DWithin(
          p.location,
          ST_GeogFromText(route_geom),
          25 * 1609.34
        )
      )
    )
    AND (category_filter IS NULL OR c.slug = ANY(category_filter))
    AND (mode_filter     IS NULL OR p.trip_mode = 'all' OR p.trip_mode = mode_filter);
$function$;

GRANT EXECUTE ON FUNCTION public.count_corridor_pois(
  text, double precision, text[], text, double precision
) TO anon, authenticated;

COMMENT ON FUNCTION public.count_corridor_pois IS
'Fast count of POIs in the route corridor. WHERE clause mirrors get_corridor_pois (C1+G2 state); no ORDER BY / SELECT columns / LIMIT. Use this for badge counts; use get_corridor_pois for the full row set with priority_tier + spatial sort.';

COMMIT;
