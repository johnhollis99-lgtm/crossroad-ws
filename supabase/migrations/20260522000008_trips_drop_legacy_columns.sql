-- 20260522000008_trips_drop_legacy_columns.sql
--
-- Migration Batch 1 / Migration 8 — Drop legacy trips columns.
--
-- Per Q6.A: archive ALL trips with any non-default legacy column, then drop
-- depth + density + min_relevance + poi_distance_m from the trips table.
-- These four columns were vestigial after the J1a + J1a-followups customize
-- UI refit (commits 54eea84, f2fbe51); the customize page no longer
-- exposes UI for any of them. Each column had a NOT NULL constraint with
-- a DB DEFAULT, so saveTrip payloads have been writing the DEFAULT value
-- since the UI was removed.
--
-- Archive predicate (per Q6.A — union of any non-default value):
--   depth          != 'ride_along' OR
--   density        != 'balanced'   OR
--   min_relevance  != 0            OR
--   poi_distance_m != 500
--
-- Prior-agent Phase 1 verified: 68 distinct trips match this predicate.
-- The archive table `_archive_trips_legacy_cols` preserves the (id,
-- depth, density, min_relevance, poi_distance_m, created_at) snapshot
-- before the columns are dropped — recoverable if the curator ever needs
-- to inspect pre-collapse trip configurations.
--
-- Per CLAUDE.md migration conventions:
--   * Schema-qualified table names
--   * BEGIN/COMMIT wrapped
--   * DROP COLUMN uses default RESTRICT (no CASCADE) so any unknown
--     dependent (e.g. a stale RPC) fails loudly rather than silently
--     casades. Drift 5.16 precedent.
--   * Trailing verification query
--
-- Coordinated code changes in this batch (see sympathetic diff section):
--   * lib/supabase.ts — SaveTripParams drops depth/density/minRelevance/poiDistanceM
--   * app/customize.tsx — saveTrip payload literals removed + drive nav payload
--     trimmed of density/minRelevance
--   * app/customize.tsx PRESET_NARRATORS + 4-card grid UNCHANGED per Q10.A

BEGIN;

-- ── 1. Archive snapshot ────────────────────────────────────────────────────
-- All 68 distinct trips with any non-default value across the 4 legacy
-- columns. CREATE TABLE AS captures schema + data in one shot.
CREATE TABLE public._archive_trips_legacy_cols AS
SELECT
  id,
  depth,
  density,
  min_relevance,
  poi_distance_m,
  created_at
FROM public.trips
WHERE depth          != 'ride_along'
   OR density        != 'balanced'
   OR min_relevance  != 0
   OR poi_distance_m != 500;

COMMENT ON TABLE public._archive_trips_legacy_cols IS
  'Snapshot of trips that carried non-default values for the legacy '
  'depth / density / min_relevance / poi_distance_m columns, captured '
  'just before those columns were dropped in 20260522000008. Recoverable '
  'data — safe to drop once the curator confirms no pre-collapse trip '
  'config needs to be inspected.';

-- ── 2. Drop the legacy columns ────────────────────────────────────────────
-- RESTRICT (the default) — fails loudly if any view / function / etc.
-- depends on these columns. Per drift 5.16 destructive-op posture.
ALTER TABLE public.trips DROP COLUMN depth;
ALTER TABLE public.trips DROP COLUMN density;
ALTER TABLE public.trips DROP COLUMN min_relevance;
ALTER TABLE public.trips DROP COLUMN poi_distance_m;

COMMIT;

-- ============================================================
-- Verification (run after COMMIT):
-- ============================================================
-- (v1) Archive table populated:
--   SELECT COUNT(*) FROM public._archive_trips_legacy_cols;
--   -- Expect: 68 (per prior-agent Phase 1 verification).
--
-- (v2) Columns gone from trips:
--   SELECT column_name FROM information_schema.columns
--    WHERE table_schema='public' AND table_name='trips'
--      AND column_name IN ('depth','density','min_relevance','poi_distance_m');
--   -- Expect: 0 rows.
--
-- (v3) trips_depth_check / trips_density_check / trips_min_relevance_check
--      constraints are gone (CHECK constraints are auto-dropped with column):
--   SELECT conname FROM pg_constraint
--    WHERE conrelid='public.trips'::regclass
--      AND conname IN ('trips_depth_check','trips_density_check','trips_min_relevance_check');
--   -- Expect: 0 rows.
