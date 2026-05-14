-- =====================================================================
-- 20260514000002_pois_intrinsic_depth.sql
--
-- WHAT
--   Adds `pois.intrinsic_depth` per the Narration & Curation Addendum §4.2.
--   This is the per-POI depth weight (brief / standard / long) that
--   replaces user-facing depth selection. Depth becomes a property of the
--   POI, not a property of the user. The user-facing control is Pace
--   (Full Drive / Light Touch — addendum §6).
--
--   Mapping from legacy depth values (still permitted on
--   narration_audio.depth via its own CHECK):
--     glance       ↔ brief
--     ride_along   ↔ standard
--     deep_dive    ↔ long
--   (plus a new `long_compressed` Light-Touch variant — applies to the
--   narration_audio.depth value space only, NOT here)
--
--   This migration only touches `pois`. The narration_audio.depth CHECK
--   extension is deferred until the narration generation surface is
--   ready to write the new value space — see roadmap §4 Phase D1 step 6.
--
--   Column shape:
--     intrinsic_depth text NOT NULL DEFAULT 'standard'
--       CHECK (intrinsic_depth IN ('brief', 'standard', 'long'))
--
--   Backfill: the NOT NULL DEFAULT means every existing row gets
--   'standard' automatically on column add (idempotent). The
--   depth-assignment heuristic (addendum §4.3) runs later as a script,
--   not in this migration — see roadmap Phase G1.
--
--   Live audit (2026-05-14 pre-apply):
--     pois total active rows  21,922 (where merged_into IS NULL)
--     pois.intrinsic_depth    does not exist
--
--   Expected post-apply:
--     All 21,922 active rows have intrinsic_depth = 'standard' (DEFAULT)
--     CHECK constraint pois_intrinsic_depth_check is present
--
-- APPLIED
--   Applied via Supabase Studio web UI on YYYY-MM-DD — fill in after manual apply
-- =====================================================================

BEGIN;

-- Column add: NOT NULL DEFAULT 'standard' so existing rows satisfy the
-- constraint immediately. Idempotent via IF NOT EXISTS.
ALTER TABLE public.pois
  ADD COLUMN IF NOT EXISTS intrinsic_depth text NOT NULL DEFAULT 'standard';

-- CHECK constraint: locked to the three-value enum. Idempotent via
-- pg_constraint lookup (PG doesn't support IF NOT EXISTS on CHECK adds).
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
      FROM pg_constraint
     WHERE conrelid = 'public.pois'::regclass
       AND conname  = 'pois_intrinsic_depth_check'
  ) THEN
    ALTER TABLE public.pois
      ADD CONSTRAINT pois_intrinsic_depth_check
      CHECK (intrinsic_depth IN ('brief', 'standard', 'long'));
  END IF;
END $$;

COMMIT;

-- ---------------------------------------------------------------------
-- Verification (run separately after COMMIT):
--
--   SELECT intrinsic_depth, COUNT(*) AS n
--     FROM public.pois
--    GROUP BY intrinsic_depth
--    ORDER BY n DESC;
--   -- Expect: standard 21,922
--
--   SELECT conname, pg_get_constraintdef(oid)
--     FROM pg_constraint
--    WHERE conrelid = 'public.pois'::regclass
--      AND conname  = 'pois_intrinsic_depth_check';
--   -- Expect: CHECK ((intrinsic_depth = ANY (ARRAY['brief','standard','long'])))
-- ---------------------------------------------------------------------
