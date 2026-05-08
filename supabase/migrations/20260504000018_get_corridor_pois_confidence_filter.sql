-- Add merged_into + confidence_score filters to get_corridor_pois.
--
-- Why: the dedup pipeline soft-deletes secondaries via merged_into, and
-- the NRHP importer triages city-centroid-only geocodes at confidence=0.
-- Without these filters, the corridor RPC leaks both (601 freshly-merged
-- secondaries from the 2026-05-07 4-county dedup commit, plus ~2,099
-- low-confidence NRHP rows). The sister RPC get_nearby_pois already has
-- both filters as of 20260504000017; this brings corridor to parity.
--
-- Note: deliberately *not* adding parent_poi_id IS NULL — corridor
-- narration sometimes wants venue children once you're driving slowly
-- past a complex. That filter is left to a separate decision.

CREATE OR REPLACE FUNCTION public.get_corridor_pois(
  route_geom            text,
  corridor_width_miles  double precision DEFAULT 15,
  category_filter       text[]           DEFAULT NULL::text[],
  mode_filter           text             DEFAULT NULL::text
)
RETURNS TABLE (
  id                  text,
  name                text,
  category            text,
  lat                 double precision,
  lng                 double precision,
  tags                text[],
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
    ST_Distance(p.location, ST_GeogFromText(route_geom)) AS dist_from_route_m
  FROM pois p
  JOIN poi_categories c ON c.id = p.category_id
  WHERE p.merged_into IS NULL
    AND p.confidence_score >= 0.5
    AND ST_DWithin(
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
$function$;
