-- =====================================================================
-- 20260520000001_rpc_pois_curator_corridor_extension.sql
--
-- WHAT
--   C1 — Extends both POI-surfacing RPCs (get_corridor_pois,
--   get_nearby_pois) so that editorial_curated = TRUE and
--   iconic_local = TRUE POIs bypass the user-set spatial filter
--   (corridor_width_miles for route queries, radius_m for point
--   queries), capped at a 25mi visibility horizon.
--
--   The bypass uses the same OR-pattern as G2's per-category floor
--   bypass (20260519000004) — this is the spatial equivalent of that
--   significance-tier bypass. Same gate (editorial_curated = TRUE OR
--   iconic_local = TRUE), same philosophy ("curator override on user
--   controls"), just operating on the WHERE-clause's spatial filter
--   instead of the significance filter.
--
-- WHY
--   Before C1, a curator-approved POI sitting 6mi off-route was filtered
--   out by the corridor — even though the curator explicitly approved
--   it for narration. The user's "Reach: Nearby (5mi)" pick would
--   silently drop curator content that the curator vetted as
--   surface-worthy. C1 fixes that asymmetry: curator/iconic POIs
--   always surface up to the 25mi cap; standard-tier POIs still
--   honor the user's corridor.
--
--   25mi is the curator's visibility-horizon heuristic — past ~25mi
--   atmospheric haze hides most landmarks unless at altitude with
--   clear sightlines. The number is hardcoded as `25 * 1609.34`
--   inline (matching the existing `corridor_width_miles * 1609.34`
--   style at the unconditional spatial check). If the value needs
--   tuning later, a config table migration can land.
--
-- SHAPE
--   Signature and RETURNS unchanged from G2 (20260519000004). Only
--   the WHERE clause's spatial filter is extended with the OR branch.
--   CREATE OR REPLACE FUNCTION works for body-only changes — no
--   DROP-loop needed (the drift-5.90 pattern is specifically defense
--   against signature changes silently creating overloads; not
--   applicable here).
--
-- BACKWARDS COMPAT
--   - Function names + parameter signatures unchanged → existing
--     PostgREST URLs (.rpc('get_corridor_pois', { ... })) keep working.
--   - RETURNS shape unchanged → existing TS callers (as POI[]) keep
--     working; no `lib/supabase.ts` interface changes needed.
--   - The priority_tier column from G2 is unchanged in semantics —
--     a POI that surfaces only because of the C1 bypass already has
--     priority_tier='curator' or 'iconic' from G2's SELECT-clause
--     CASE expression.
--
-- CALLER SIDE-EFFECTS (intended)
--   - app/drive.tsx: 20-25mi-band curator POIs newly surface; the
--     user's "Reach" pick (5/10/20mi) doesn't exclude curator content
--     within the 25mi cap.
--   - app/index.tsx home post-route preview: same — curator POIs at
--     20-25mi off-route now show in the preview when they previously
--     wouldn't.
--   - scripts/precache-popular-routes.ts: the 4-arg legacy call gets
--     a slight bump in returned rowcount (curator POIs in the
--     bypass band that weren't covered by the user's
--     corridor_width_miles). Not in scope to update the script.
--
-- PRE-FLIGHT
--   - editorial_curated column already exists (20260518000003)
--   - iconic_local column already exists (20260514000003)
--   - category_significance_floors table already populated (G2)
--   - get_corridor_pois canonical 7-arg signature from G2 (20260519000004)
--   - get_nearby_pois canonical 9-arg signature from G2 (20260519000004)
-- =====================================================================

BEGIN;

-- ── get_corridor_pois ────────────────────────────────────────────────
-- Body-only change vs. G2 (20260519000004); WHERE-clause spatial filter
-- extended with the C1 OR-branch for curator/iconic bypass up to 25mi.

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
  dist_from_route_m   double precision,
  priority_tier       text
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
    ST_Distance(p.location, ST_GeogFromText(route_geom)) AS dist_from_route_m,
    CASE
      WHEN p.editorial_curated = TRUE THEN 'curator'
      WHEN p.iconic_local      = TRUE THEN 'iconic'
      ELSE                                  'standard'
    END AS priority_tier
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
      -- Standard: inside the user-set corridor.
      ST_DWithin(
        p.location,
        ST_GeogFromText(route_geom),
        corridor_width_miles * 1609.34
      )
      -- C1 (2026-05-20): curator/iconic POIs bypass the user corridor,
      -- capped at 25mi visibility horizon. Standard tier remains bound.
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
    AND (mode_filter     IS NULL OR p.trip_mode = 'all' OR p.trip_mode = mode_filter)
  ORDER BY
    -- 1) Tier promotion (curator → iconic → standard)
    CASE
      WHEN p.editorial_curated = TRUE THEN 0
      WHEN p.iconic_local      = TRUE THEN 1
      ELSE                                  2
    END,
    -- 2) Significance within tier (DESC)
    p.significance_score DESC NULLS LAST,
    -- 3) Caller's spatial sort as tiebreak inside the standard tier
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

COMMENT ON FUNCTION public.get_corridor_pois(
  text, double precision, text[], text, double precision, text, integer
) IS
'Returns POIs within a corridor around a WKT/EWKT LineString. G2-floors
(2026-05-19): JOINs category_significance_floors and enforces per-category
floors via GREATEST(COALESCE(csf.significance_floor, 70), min_significance);
editorial_curated/iconic_local bypass the floor; priority_tier column added.
C1 (2026-05-20): editorial_curated/iconic_local also bypass the user-set
corridor distance (corridor_width_miles * 1609.34), capped at 25mi
(25 * 1609.34 m) visibility horizon. Standard tier remains bound by
corridor_width_miles. See drift 5.67 / 5.90.';

-- ── get_nearby_pois ──────────────────────────────────────────────────
-- Same C1 bypass translated to point-with-radius semantics.

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
  distance_m          float8,
  priority_tier       text
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
    ) AS distance_m,
    CASE
      WHEN p.editorial_curated = TRUE THEN 'curator'
      WHEN p.iconic_local      = TRUE THEN 'iconic'
      ELSE                                  'standard'
    END AS priority_tier
  FROM pois p
  LEFT JOIN poi_categories c ON c.id = p.category_id
  LEFT JOIN category_significance_floors csf ON csf.category = c.slug
  WHERE p.merged_into IS NULL
    AND p.confidence_score >= 0.5
    AND (p_include_children OR p.parent_poi_id IS NULL)
    AND (
      p.editorial_curated = TRUE
      OR p.iconic_local   = TRUE
      OR p.significance_score >= GREATEST(
           COALESCE(csf.significance_floor, 70)::float8,
           min_significance
         )
    )
    AND (
      -- Standard: inside the user-set radius.
      ST_DWithin(
        p.location,
        ST_MakePoint(user_lng, user_lat)::geography,
        radius_m
      )
      -- C1 (2026-05-20): curator/iconic POIs bypass the user radius,
      -- capped at 25mi visibility horizon.
      OR (
        (p.editorial_curated = TRUE OR p.iconic_local = TRUE)
        AND ST_DWithin(
          p.location,
          ST_MakePoint(user_lng, user_lat)::geography,
          25 * 1609.34
        )
      )
    )
    AND (categories  IS NULL OR c.slug = ANY(categories))
    AND (mode_filter IS NULL OR p.trip_mode = 'all' OR p.trip_mode = mode_filter)
  ORDER BY
    -- 1) Tier promotion
    CASE
      WHEN p.editorial_curated = TRUE THEN 0
      WHEN p.iconic_local      = TRUE THEN 1
      ELSE                                  2
    END,
    -- 2) Significance within tier
    p.significance_score DESC NULLS LAST,
    -- 3) Caller's spatial sort as tiebreak. ST_Distance inlined (was
    --    `distance_m` alias, drift 5.86) so name resolution doesn't
    --    fall through to the FROM clause and 42703 out.
    CASE WHEN sort_mode = 'significance_desc' THEN -p.significance_score END NULLS LAST,
    CASE WHEN sort_mode = 'distance_asc' OR sort_mode IS NULL OR sort_mode NOT IN ('significance_desc') THEN
      ST_Distance(p.location, ST_MakePoint(user_lng, user_lat)::geography)
    END NULLS LAST
  LIMIT CASE WHEN result_limit IS NULL OR result_limit < 0 THEN NULL ELSE result_limit END;
$$;

COMMENT ON FUNCTION public.get_nearby_pois(
  float8, float8, float8, text[], text, boolean, float8, text, integer
) IS
'Returns POIs within a radius of a point. G2-floors (2026-05-19): JOINs
category_significance_floors and enforces per-category floors; bypasses
for editorial_curated/iconic_local; priority_tier column added. C1
(2026-05-20): editorial_curated/iconic_local also bypass the user-set
radius_m, capped at 25mi (25 * 1609.34 m) visibility horizon. Standard
tier remains bound by radius_m. See drift 5.67 / 5.86.';

COMMIT;

-- ---------------------------------------------------------------------
-- Verification (post-COMMIT — wired into apply-c1-curator-corridor.mjs):
--
--   -- (b) post-C1 corridor count: >= 42 (G2 baseline), modest growth
--   SELECT count(*)::int AS n
--     FROM public.get_corridor_pois(
--       'SRID=4326;LINESTRING(-118.2437 34.0522, -118.9722 37.6485)'::text,
--       20::float8, NULL::text[], 'driving'::text, 0::float8);
--   -- Expect: 42 (G2 baseline) + ~4-6 from the 20-25mi curator band.
--
--   -- (c) e893d57e Jawbone Siphon (24.94mi) surfaces post-C1
--   SELECT count(*)::int FROM public.get_corridor_pois(/* same args */)
--    WHERE id = 'e893d57e-…';
--   -- Expect: 1 row, priority_tier='curator'.
--
--   -- (e) 6dbb1b74 Mount Whitney (25.02mi, 32m past cap) excluded
--   SELECT count(*)::int FROM public.get_corridor_pois(/* same args */)
--    WHERE id = '6dbb1b74-…';
--   -- Expect: 0 rows.
--
--   -- (f1) nearby query: Vasquez Rocks surfaces at 14.7mi via curator bypass
--   SELECT count(*)::int FROM public.get_nearby_pois(
--     34.60::float8, -118.10::float8, 8047::float8,
--     NULL::text[], 'driving'::text, false, 0::float8)
--    WHERE id = '5af766ba-…';
--   -- Expect: 1 row.
-- ---------------------------------------------------------------------
