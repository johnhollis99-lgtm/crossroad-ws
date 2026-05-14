-- =====================================================================
-- 20260514000005_regions.sql
--
-- WHAT
--   Creates the `regions` table + `detect_regions_at_location` RPC per
--   the Narration & Curation Addendum §3 (Phase 7 — Regions).
--
--   Regions are a parallel narration layer to POIs. POIs are points;
--   regions are polygons. When the user crosses a region boundary
--   (geomorphic province, ecoregion, watershed, indigenous territory,
--   named valley/basin), the WS server detects the entry and queues a
--   region narration. See addendum §3.4 for trigger logic.
--
--   This migration ships the schema + the lookup RPC. The data imports
--   (USGS provinces, EPA ecoregions, Native Land Digital, Wikidata
--   valleys) come later as a separate phase (roadmap Phase E1).
--   Narration pre-generation (~2,000 files, ~$15–25 one-time) is
--   roadmap Phase E2.
--
--   Schema (per addendum §3.1):
--     id                 uuid PK
--     region_type        text NOT NULL CHECK (5-value enum)
--     name               text NOT NULL
--     display_name       text                                -- nullable
--     description        text NOT NULL                       -- 200–400 word reference
--     polygon            geography(MultiPolygon, 4326) NOT NULL
--     significance_tier  smallint NOT NULL DEFAULT 50        -- 0–100
--     source             text NOT NULL                       -- 'usgs','epa','native_land','wikidata','editorial'
--     source_id          text                                -- nullable
--     parent_region_id   uuid REFERENCES regions(id)         -- nullable; nesting
--     created_at         timestamptz NOT NULL DEFAULT now()
--     updated_at         timestamptz NOT NULL DEFAULT now()
--
--   Indexes:
--     idx_regions_polygon  GIST on polygon         (spatial lookup)
--     idx_regions_type     b-tree on region_type   (layer filtering)
--
--   `significance_tier` is the narration-priority dial used by the
--   lookahead when multiple region transitions fire simultaneously
--   (addendum §3.4 rule 2). 0–100 matches the POI significance_score
--   scale for cognitive consistency.
--
--   `source_id` is nullable because editorial regions (hand-curated
--   named valleys with manual polygons) have no external ID.
--
--   updated_at uses the shared `public.set_updated_at()` trigger
--   function.
--
--   RPC: `detect_regions_at_location(p_lat, p_lon)` returns ALL regions
--   containing the point (a user is simultaneously in a province, an
--   ecoregion, etc.), ordered by significance_tier DESC. The WS server
--   maintains `current_regions` in trip state and diffs on each
--   `update_location` event.
--
-- APPLIED
--   Applied via direct pg connection on 2026-05-14. Verified: regions table
--   created; idx_regions_polygon (GIST) + idx_regions_type (b-tree) +
--   regions_pkey present; detect_regions_at_location(double precision,
--   double precision) RPC created and grant'd to anon/authenticated;
--   smoke test against (36.5, -118.5) returns 0 rows (expected — no
--   region data imported yet, roadmap Phase E1 ships that).
-- =====================================================================

BEGIN;

CREATE TABLE IF NOT EXISTS public.regions (
  id                uuid                       PRIMARY KEY DEFAULT gen_random_uuid(),
  region_type       text                       NOT NULL,
  name              text                       NOT NULL,
  display_name      text,
  description       text                       NOT NULL,
  polygon           geography(MultiPolygon, 4326) NOT NULL,
  significance_tier smallint                   NOT NULL DEFAULT 50,
  source            text                       NOT NULL,
  source_id         text,
  parent_region_id  uuid                       REFERENCES public.regions(id) ON DELETE SET NULL,
  created_at        timestamptz                NOT NULL DEFAULT now(),
  updated_at        timestamptz                NOT NULL DEFAULT now()
);

-- region_type CHECK — locked to the 5-value enum from addendum §3.1.
-- Idempotent via pg_constraint lookup.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
      FROM pg_constraint
     WHERE conrelid = 'public.regions'::regclass
       AND conname  = 'regions_region_type_check'
  ) THEN
    ALTER TABLE public.regions
      ADD CONSTRAINT regions_region_type_check
      CHECK (region_type IN (
        'geomorphic_province',
        'ecoregion',
        'watershed',
        'indigenous_territory',
        'named_valley_or_basin'
      ));
  END IF;

  IF NOT EXISTS (
    SELECT 1
      FROM pg_constraint
     WHERE conrelid = 'public.regions'::regclass
       AND conname  = 'regions_significance_tier_check'
  ) THEN
    ALTER TABLE public.regions
      ADD CONSTRAINT regions_significance_tier_check
      CHECK (significance_tier BETWEEN 0 AND 100);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_regions_polygon ON public.regions USING GIST (polygon);
CREATE INDEX IF NOT EXISTS idx_regions_type    ON public.regions (region_type);

-- updated_at trigger reuse (per CLAUDE.md convention).
DROP TRIGGER IF EXISTS set_updated_at ON public.regions;
CREATE TRIGGER set_updated_at
  BEFORE UPDATE ON public.regions
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.regions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS regions_anon_select ON public.regions;
CREATE POLICY regions_anon_select
  ON public.regions
  FOR SELECT
  TO anon, authenticated
  USING (true);

-- ---------------------------------------------------------------------
-- RPC: detect_regions_at_location
-- ---------------------------------------------------------------------
-- New function, no prior overloads to clean up — bare CREATE.
-- Bumped to CREATE (not CREATE OR REPLACE) so the migration errors loudly
-- if a function with this signature already exists.

CREATE FUNCTION public.detect_regions_at_location(
  p_lat double precision,
  p_lon double precision
)
RETURNS TABLE (
  id                uuid,
  region_type       text,
  name              text,
  display_name      text,
  description       text,
  significance_tier smallint
)
LANGUAGE sql STABLE AS $$
  SELECT
    r.id,
    r.region_type,
    r.name,
    r.display_name,
    r.description,
    r.significance_tier
  FROM public.regions r
  WHERE ST_Contains(
    r.polygon::geometry,
    ST_SetSRID(ST_MakePoint(p_lon, p_lat), 4326)
  )
  ORDER BY r.significance_tier DESC;
$$;

GRANT EXECUTE ON FUNCTION public.detect_regions_at_location(double precision, double precision)
  TO anon, authenticated;

COMMENT ON FUNCTION public.detect_regions_at_location(double precision, double precision) IS
  'Returns all regions whose polygon contains the given coordinate, ordered by significance_tier DESC. A point can be in multiple regions simultaneously (province + ecoregion + indigenous territory + named valley). See addendum §3.2.';

COMMIT;

-- ---------------------------------------------------------------------
-- Verification (run separately after COMMIT):
--
--   SELECT to_regclass('public.regions');
--   -- Expect: public.regions
--
--   SELECT indexname FROM pg_indexes
--    WHERE schemaname = 'public' AND tablename = 'regions'
--    ORDER BY indexname;
--   -- Expect: idx_regions_polygon, idx_regions_type, regions_pkey
--
--   SELECT oid::regprocedure::text
--     FROM pg_proc
--    WHERE proname = 'detect_regions_at_location'
--      AND pronamespace = 'public'::regnamespace;
--   -- Expect: public.detect_regions_at_location(double precision, double precision)
--
--   -- Smoke test (empty result expected until region data is imported):
--   SELECT * FROM public.detect_regions_at_location(36.5, -118.5);
-- ---------------------------------------------------------------------
