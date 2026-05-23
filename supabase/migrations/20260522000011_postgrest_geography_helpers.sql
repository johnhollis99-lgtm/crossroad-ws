-- 20260522000011_postgrest_geography_helpers.sql
--
-- Migration Batch 2 / Track D / Migration 11 —
--   PostgREST geography helper RPC: get_roadstories_for_location.
--
-- Background: PostgREST's schema cache deliberately excludes `geography`
-- typed columns (see CLAUDE.md "Why direct pg instead of Supabase JS
-- client for upserts"). The Supabase JS client therefore cannot read
-- `roadstories.anchor_corridor` directly — any client wanting to use it
-- has to either drop down to the `pg` driver (heavy) or call a server-
-- side function that wraps the geography in a PostgREST-friendly type.
--
-- This RPC is the second option: it accepts a (lat, lon) point, ranks
-- roadstories by `ST_Distance(anchor_corridor, point)`, and returns the
-- corridor as WKT text so JS clients can read + reason about it without
-- carrying a geography type through the wire.
--
-- Filtering: status = 'published' (mirrors the RLS posture on
-- roadstories — anon clients can only see published rows; the function
-- runs with the caller's privileges so the policy still applies). The
-- caller passes lat first, lon second to match the human-readable
-- coordinate convention; PostGIS's ST_MakePoint takes (lon, lat) inside
-- the function body.
--
-- Sort:
--   ST_Distance(anchor_corridor, ST_SetSRID(ST_MakePoint(p_lon, p_lat), 4326)::geography) ASC NULLS LAST
--
-- The geography cast ensures distance is computed in meters (geometry-
-- typed distance would be returned in degrees and produce a different
-- ranking). NULLS LAST keeps rows with NULL anchor_corridor (corridor
-- type, but with no geometry populated yet) at the tail of the result
-- set rather than letting them sort first.
--
-- Per CLAUDE.md migration conventions:
--   * Schema-qualified table names
--   * BEGIN/COMMIT wrapped
--   * GRANT EXECUTE to anon + authenticated (read path)
--   * Trailing verification query

BEGIN;

-- Drop any prior version (defensive — first install of this function).
DROP FUNCTION IF EXISTS public.get_roadstories_for_location(double precision, double precision);

CREATE FUNCTION public.get_roadstories_for_location(
  p_lat double precision,
  p_lon double precision
)
RETURNS TABLE (
  id                 uuid,
  title              text,
  hook               text,
  narrator_slug      text,
  voice_slot         smallint,
  anchor_type        text,
  anchor_corridor_wkt text,
  trigger_buffer_m   integer,
  status             text
)
LANGUAGE sql
STABLE
AS $$
  SELECT
    r.id,
    r.title,
    r.hook,
    r.narrator_slug,
    r.voice_slot,
    r.anchor_type,
    ST_AsText(r.anchor_corridor::geometry) AS anchor_corridor_wkt,
    r.trigger_buffer_m,
    r.status
  FROM public.roadstories r
  WHERE r.status = 'published'
  ORDER BY
    ST_Distance(
      r.anchor_corridor,
      ST_SetSRID(ST_MakePoint(p_lon, p_lat), 4326)::geography
    ) ASC NULLS LAST;
$$;

GRANT EXECUTE ON FUNCTION public.get_roadstories_for_location(double precision, double precision)
  TO anon, authenticated;

COMMENT ON FUNCTION public.get_roadstories_for_location(double precision, double precision) IS
  'PostgREST-friendly read for roadstories near a point. '
  'Filters status=''published''; returns anchor_corridor as WKT so JS clients '
  'can consume the corridor without the geography type-cache exclusion. '
  'Sort by ST_Distance(anchor_corridor, point::geography) ASC NULLS LAST. '
  'Migration Batch 2 / Track D / Migration 11.';

COMMIT;

-- ============================================================
-- Verification (run after COMMIT):
-- ============================================================
-- (v1) Function exists with the expected signature:
--   SELECT pg_get_function_identity_arguments(oid)
--     FROM pg_proc
--    WHERE proname = 'get_roadstories_for_location'
--      AND pronamespace = 'public'::regnamespace;
--   -- Expect: 'p_lat double precision, p_lon double precision'
--
-- (v2) GRANT EXECUTE to anon + authenticated:
--   SELECT grantee, privilege_type
--     FROM information_schema.role_routine_grants
--    WHERE routine_schema = 'public'
--      AND routine_name   = 'get_roadstories_for_location'
--    ORDER BY grantee;
--   -- Expect: anon EXECUTE, authenticated EXECUTE.
--
-- (v3) Smoke call (returns 0 rows pre-launch since roadstories is empty;
--      the no-error result is the actual signal):
--   SELECT * FROM public.get_roadstories_for_location(34.0522, -118.2437);
--   -- Expect: empty result set, no error. Once published rows exist the
--   --         same call returns them sorted by distance from downtown LA.
