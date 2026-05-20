-- =====================================================================
-- 20260519000004_rpc_pois_floor_and_priority.sql
--
-- WHAT
--   G2 — wires the per-category significance floors (seeded at
--   20260519000003) into the live POI query path. Updates both
--   get_corridor_pois and get_nearby_pois with three coordinated changes:
--
--   1. JOIN public.category_significance_floors and apply per-category
--      floors via GREATEST(COALESCE(csf.significance_floor, 70),
--      min_significance). The existing min_significance RPC parameter
--      is preserved; its semantic shifts from "the only floor" to "an
--      ADDITIONAL floor on top of the per-category floor." Callers
--      passing 0 (the current default) let the per-category floor win.
--
--   2. editorial_curated = TRUE and iconic_local = TRUE BYPASS the
--      floor. A curator-approved or strict-iconic-bar POI surfaces
--      regardless of its raw significance_score. This implements the
--      addendum §2.1 "imported but doesn't speak unprompted" rule's
--      two explicit override paths.
--
--   3. priority_tier text column added to RETURNS shape:
--        'curator'   when editorial_curated = TRUE
--        'iconic'    when iconic_local      = TRUE  (and curated is not TRUE)
--        'standard'  otherwise
--      ORDER BY promotes the tier ('curator' first, then 'iconic',
--      then 'standard'), then significance_score DESC, then the
--      existing spatial sort (arc-length-along-route for corridor;
--      ST_Distance for nearby) as the tiebreak. This intentionally
--      DEMOTES the caller's sort_mode preference — even when a caller
--      passes 'distance_asc' (the legacy default), curated POIs are
--      pushed to the top. Tier ordering wins; sort_mode breaks ties
--      inside the 'standard' tier.
--
-- WHY
--   The 70 floor (addendum §2.1) was previously enforced nowhere in
--   live runtime — only in the offline simulator (scripts/simulate-trip/)
--   and curation export (scripts/curation/export.ts). Drive.tsx and
--   home preview fetched with min_significance=0 default, surfacing
--   low-significance POIs (fire stations, junk NRHP churches, theme
--   park rides) that should not have spoken unprompted. G2 closes that
--   gap at the RPC layer so all consumers benefit consistently.
--
-- SHAPE-CHANGE → DROP LOOP REQUIRED
--   RETURNS shape changes (column added). `CREATE OR REPLACE FUNCTION`
--   errors loudly on RETURNS changes ("cannot change return type of
--   existing function"). Drift 5.90 codifies the safe pattern: DO-loop
--   drop all overloads via pg_proc → bare CREATE FUNCTION (not REPLACE)
--   so a stray surviving overload would error rather than silently
--   no-op. BEGIN/COMMIT wraps the whole migration so a failure mid-way
--   rolls back to the prior shape rather than leaving zero overloads.
--
-- PRE-FLIGHT
--   Required dependency: 20260519000003_category_significance_floors_seed_g2.sql
--     must apply first so the JOIN resolves to populated rows. (The JOIN
--     is LEFT JOIN with COALESCE-70 fallback, so the RPC would still
--     work against an empty floors table — just every category would
--     fall through to 70. G2 seeded values are what makes the per-category
--     differentiation effective.)
--
--   Required columns already on pois (verified pre-write):
--     editorial_curated     boolean NULL          (20260518000003)
--     iconic_local          boolean NOT NULL false (20260514000003)
--
-- BACKWARDS COMPAT
--   - Function names + parameter signatures unchanged → existing
--     PostgREST URLs (.rpc('get_corridor_pois', { ... })) keep working.
--   - RETURNS shape adds priority_tier text at end. Existing TS callers
--     return `data as POI[]` — POI is an open interface, so the extra
--     column flows through silently. lib/supabase.ts adds the field
--     to the POI type as part of this commit.
--   - min_significance default 0 preserved; behavior shifts from "the
--     only floor" to "additional floor." Callers passing 0 (which is
--     all of them today after J1a-followups landed) let the per-category
--     floor do the work.
--
-- CALLER SIDE-EFFECTS (intended)
--   - app/drive.tsx: fewer POIs in the queue + on the map; fire
--     stations, NRHP-junk churches, and theme-park rides drop out.
--   - app/index.tsx: home post-route preview honors floors too — the
--     "X stories" count on the route card will shrink. This is the
--     intended effect of the addendum §2.1 floor.
--   - scripts/precache-popular-routes.ts: `--min-score N` CLI arg's
--     semantics changes from "fetch everything then drop below N" to
--     "fetch above category floors then drop below N." Same surface
--     for above-floor callers; below-floor callers see fewer rows.
--     Not in scope to update the script in this commit (no active
--     re-run scheduled); flagged in CLAUDE.md G2-floors note.
-- =====================================================================

BEGIN;

-- ── get_corridor_pois ────────────────────────────────────────────────
-- Drop every overload of public.get_corridor_pois currently in the
-- schema (drift 5.90 pattern). pg_proc loop is defensive against
-- unknown / drifted / future overloads.

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

-- Canonical 7-arg signature (matches 20260513000001 plus the G2
-- result-set + filter changes). Bare CREATE FUNCTION (not REPLACE)
-- per drift 5.90 — after the DROP loop the function is gone, and
-- CREATE makes the intent explicit + fails loudly if a stray overload
-- somehow survived the cleanup.
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
    AND ST_DWithin(
      p.location,
      ST_GeogFromText(route_geom),
      corridor_width_miles * 1609.34
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

GRANT EXECUTE ON FUNCTION public.get_corridor_pois(
  text, double precision, text[], text, double precision, text, integer
) TO anon, authenticated;

COMMENT ON FUNCTION public.get_corridor_pois(
  text, double precision, text[], text, double precision, text, integer
) IS
'Returns POIs within a corridor around a WKT/EWKT LineString. G2-floors
(2026-05-19): JOINs category_significance_floors and enforces per-category
floors via GREATEST(COALESCE(csf.significance_floor, 70), min_significance).
editorial_curated = TRUE and iconic_local = TRUE bypass the floor. New
priority_tier column (''curator'' / ''iconic'' / ''standard''); ORDER BY
promotes by tier, then significance_score DESC, then existing spatial
sort. min_significance retained; semantic is now ''additional floor on
top of category floors,'' not the only floor. See drift 5.67 / 5.90.';

-- ── get_nearby_pois ──────────────────────────────────────────────────
-- Same G2 changes applied to the live-driving / browse-mode RPC.

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
END $$;

-- Canonical 9-arg signature (matches 20260512000003 plus the G2 changes).
CREATE FUNCTION public.get_nearby_pois(
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
    AND ST_DWithin(
      p.location,
      ST_MakePoint(user_lng, user_lat)::geography,
      radius_m
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

GRANT EXECUTE ON FUNCTION public.get_nearby_pois(
  float8, float8, float8, text[], text, boolean, float8, text, integer
) TO anon, authenticated;

COMMENT ON FUNCTION public.get_nearby_pois(
  float8, float8, float8, text[], text, boolean, float8, text, integer
) IS
'Returns POIs within a radius of a point. G2-floors (2026-05-19): JOINs
category_significance_floors and enforces per-category floors via
GREATEST(COALESCE(csf.significance_floor, 70), min_significance).
editorial_curated = TRUE and iconic_local = TRUE bypass the floor.
priority_tier column added; ORDER BY promotes by tier, then
significance_score DESC, then existing spatial. min_significance
retained; now an additional floor, not the only floor. See drift 5.67
/ 5.86.';

COMMIT;

-- ---------------------------------------------------------------------
-- Verification (post-COMMIT — also wired into apply-g2-floors.mjs):
--
--   -- (b) corridor RPC: editorial_curated POIs surface with priority_tier='curator'
--   SELECT id, name, category, significance_score, priority_tier
--     FROM public.get_corridor_pois(
--       'SRID=4326;LINESTRING(-118.2437 34.0522, -118.9722 37.6485)'::text,
--       20::float8, NULL::text[], 'driving'::text, 0::float8)
--    WHERE priority_tier = 'curator'
--    LIMIT 5;
--   -- Expect: 1+ rows; tier='curator'; LA→Mammoth carries 26 editorial seeds.
--
--   -- (c) sub-90 architecture should NOT surface (priority_tier='standard',
--   --     significance < 90 → below floor → filtered out)
--   SELECT count(*)::int AS leaked
--     FROM public.get_corridor_pois(
--       'SRID=4326;LINESTRING(-118.2437 34.0522, -118.9722 37.6485)'::text,
--       20::float8, ARRAY['architecture']::text[], 'driving'::text, 0::float8)
--    WHERE significance_score BETWEEN 80 AND 89
--      AND priority_tier = 'standard';
--   -- Expect: 0.
--
--   -- (d) total post-floor count should be substantially smaller than pre-G2
--   --     (which was unbounded since min_significance defaulted to 0).
--   SELECT count(*)::int AS n
--     FROM public.get_corridor_pois(
--       'SRID=4326;LINESTRING(-118.2437 34.0522, -118.9722 37.6485)'::text,
--       20::float8, NULL::text[], 'driving'::text, 0::float8);
--   -- Expect: reasonable count (not 0, not 22000+; ~hundreds-low-thousands).
-- ---------------------------------------------------------------------
