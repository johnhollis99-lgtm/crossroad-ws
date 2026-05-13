-- 20260512000002_get_corridor_pois_significance.sql
--
-- Drift catalog 5.67 (RPC exposes significance_score + min + sort).
--
-- Patches the corridor RPC to surface significance_score to the JS
-- layer so the curation function (src/lib/curation/curateRoutePOIs.ts)
-- can score and bin POIs without a separate fetch. Adds three optional
-- params:
--   • min_significance   — drop POIs below this score (0–100). Default 0
--     (no filter); customize's relevance slider sets it.
--   • sort_mode          — 'significance_desc' (curation default) or
--     'distance_asc' (legacy arc-length, kept for callers that rely on
--     sequential ordering — drive's arc-length projector runs JS-side
--     after fetch, so it tolerates either order).
--   • result_limit       — server-side LIMIT; default NULL = unbounded.
--     The previous 40-cap lived in the client (filteredRoutePOIs.slice
--     (0, 40)); curation replaces it.
--
-- Spec note (drift 5.67): the spec body called the function
-- `get_route_pois` — that name has never existed in this repo (drift
-- 5.35). Confirmed via grep: the corridor wrapper getPOIsAlongRoute in
-- lib/supabase.ts invokes 'get_corridor_pois'. Migration patches the
-- real RPC.
--
-- Defaults preserve backward compatibility:
--   • All new params default to a no-op shape: min_significance=0,
--     sort_mode='distance_asc' (the previous behavior), result_limit=NULL.
--   • Existing 4-arg callers (route_geom, corridor_width_miles,
--     category_filter, mode_filter) keep working unchanged.

CREATE OR REPLACE FUNCTION public.get_corridor_pois(
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
'Returns POIs within a corridor around a WKT/EWKT LineString.
Params (5+ new this migration): min_significance (default 0; drops POIs
below this 0–100 score), sort_mode (''significance_desc'' for curation;
''distance_asc'' = arc-length-along-route, legacy default), result_limit
(server LIMIT; NULL = unbounded). Returns significance_score for the
JS-side curation function. Filters: merged_into IS NULL, confidence_score
>= 0.5, significance_score >= min_significance. See drift 5.67 / 5.35.';
