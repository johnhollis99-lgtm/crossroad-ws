-- 20260512000001_trips_density_relevance.sql
--
-- Drift catalog 5.75 (density slider) + 5.77 (relevance threshold).
--
-- Adds two trip-scoped curation knobs to the trips table:
--   • density        — POI density preference per trip ('sparse','balanced','dense')
--   • min_relevance  — minimum significance_score (0–100 integer point scale)
--
-- Both bind to a specific trip record (per the trips schema convention —
-- depth, category_filter, poi_distance_m are already per-trip), so
-- extending the trips table is the right home rather than a parallel
-- user_session_prefs table. activeTripMode + selectedCategories live in
-- the Zustand session store (src/store/tripStore.ts), not here.
--
-- Defaults:
--   • density 'balanced'  — middle of the road; user opts into sparser
--     or denser explicitly. Customize screen will set 'dense' as the
--     hiking default and 'balanced' as the driving default at render
--     time (we keep ONE column-level default here, not per-mode).
--   • min_relevance 0     — no filter; significance ranking still runs
--     but no POIs are dropped on relevance alone. Users opt into a
--     threshold via the customize slider.
--
-- The existing pattern (depth CHECK, status CHECK) is mirrored for both
-- new columns — explicit CHECKs over Postgres enums so future values
-- (e.g. 'minimal' density tier, percentile-based relevance) can be
-- added with a single ALTER … CHECK migration without a type rewrite.

BEGIN;

ALTER TABLE public.trips
  ADD COLUMN IF NOT EXISTS density       text NOT NULL DEFAULT 'balanced'
    CONSTRAINT trips_density_check
    CHECK (density IN ('sparse', 'balanced', 'dense')),
  ADD COLUMN IF NOT EXISTS min_relevance integer NOT NULL DEFAULT 0
    CONSTRAINT trips_min_relevance_check
    CHECK (min_relevance >= 0 AND min_relevance <= 100);

COMMIT;

-- Verification (re-run post-apply):
--   SELECT column_name, data_type, column_default
--     FROM information_schema.columns
--    WHERE table_schema = 'public'
--      AND table_name   = 'trips'
--      AND column_name IN ('density', 'min_relevance');
--   → 2 rows (density text 'balanced'::text, min_relevance integer 0)
--
--   SELECT conname
--     FROM pg_constraint
--    WHERE conrelid = 'public.trips'::regclass
--      AND conname IN ('trips_density_check', 'trips_min_relevance_check');
--   → 2 rows
