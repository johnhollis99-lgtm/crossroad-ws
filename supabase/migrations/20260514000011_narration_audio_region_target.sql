-- 20260514000011_narration_audio_region_target.sql
--
-- Extends `narration_audio` to address either a POI or a region. Adds
-- `region_id`, relaxes `poi_id` to nullable, enforces "exactly one of
-- poi_id / region_id is set" via CHECK, and widens `na_unique` to include
-- `region_id` so a single (slug, depth, mode) tuple can legitimately
-- address one POI render AND one region render simultaneously.
--
-- Prerequisite for Phase E2 (region narration pre-generation, addendum §3
-- + §5). The narration_plays table already carries region_id (migration
-- 20260514000006); this migration brings the audio cache table to parity.
--
-- ─── Pre-flight verification ─────────────────────────────────────────
--
-- All existing rows have poi_id NOT NULL (CHECK on poi_id was implicit
-- via NOT NULL constraint pre-migration). Confirmed 2026-05-14:
--   SELECT COUNT(*) AS n,
--          COUNT(*) FILTER (WHERE poi_id IS NULL) AS poi_null
--     FROM public.narration_audio;
--   -- Returned: n=37, poi_null=0
-- Every existing row will satisfy the new XOR CHECK once region_id is
-- added (region_id defaults to NULL → exactly one target is set).
--
-- ─── ⚠️ Coordinated code change required in the same PR ─────────────
--
-- After this migration the only matching unique constraint is the new
-- 5-column `na_unique`. Two POI-upsert callers currently use
-- `onConflict: 'poi_id,narrator_slug,depth,mode'` which will fail with
-- "ON CONFLICT specification (...) does not match any unique or exclusion
-- constraint" once the 4-column constraint is dropped:
--
--   1. server/routes/narration.js:196   (insertNarrationAudioPending)
--   2. scripts/precache-popular-routes.ts:244  (upsertNarrationAudio)
--
-- Both must be updated to:
--   onConflict: 'poi_id,region_id,narrator_slug,depth,mode'
--
-- Same coordinated-update pattern as drift catalog 5.26 / migration
-- 20260510000005 (which originally added `mode` to the constraint).
--
-- ─── ⚠️ Constraint shape — see drift catalog 5.33 ────────────────────
--
-- The live `na_unique` is constraint-backed, not a bare UNIQUE INDEX.
-- Use ALTER TABLE DROP/ADD CONSTRAINT (NOT DROP INDEX) to preserve that
-- shape — Postgres refuses DROP INDEX on a constraint-backed index with
-- "cannot drop index ... because constraint ... requires it".
--
-- ─── NULLS NOT DISTINCT ──────────────────────────────────────────────
--
-- Postgres 17.6 (verified live 2026-05-14). The 5-column constraint uses
-- `NULLS NOT DISTINCT` so that two region rows with the same
-- (region_id, slug, depth, mode) but poi_id IS NULL DO conflict. Default
-- NULLS DISTINCT semantics would let duplicate region rows in. The XOR
-- CHECK guarantees exactly one of poi_id / region_id is non-NULL per
-- row, so the "two NULLs collide" semantic is correct for the cache key.

BEGIN;

-- 1. Add region_id column (FK to regions, ON DELETE CASCADE matching poi_id behavior)
ALTER TABLE public.narration_audio
  ADD COLUMN region_id uuid REFERENCES public.regions(id) ON DELETE CASCADE;

-- 2. Relax poi_id NOT NULL → nullable
ALTER TABLE public.narration_audio
  ALTER COLUMN poi_id DROP NOT NULL;

-- 3. CHECK: exactly one of poi_id / region_id is set per row
ALTER TABLE public.narration_audio
  ADD CONSTRAINT na_target_present
  CHECK ((poi_id IS NOT NULL) <> (region_id IS NOT NULL));

-- 4. Widen na_unique to include region_id (drop + re-add, preserve constraint-backed shape)
ALTER TABLE public.narration_audio
  DROP CONSTRAINT IF EXISTS na_unique;

ALTER TABLE public.narration_audio
  ADD CONSTRAINT na_unique
    UNIQUE NULLS NOT DISTINCT (poi_id, region_id, narrator_slug, depth, mode);

-- 5. Index for region-side reads (mirrors na_poi_id_idx for the POI side)
CREATE INDEX na_region_id_idx ON public.narration_audio(region_id) WHERE region_id IS NOT NULL;

COMMIT;

-- ─── Verification (re-run post-apply) ────────────────────────────────
--
--   -- Column nullability
--   SELECT column_name, is_nullable
--     FROM information_schema.columns
--    WHERE table_schema = 'public' AND table_name = 'narration_audio'
--      AND column_name IN ('poi_id', 'region_id');
--   -- Expected: poi_id YES, region_id YES
--
--   -- New + widened constraints
--   SELECT conname, pg_get_constraintdef(oid)
--     FROM pg_constraint
--    WHERE conrelid = 'public.narration_audio'::regclass
--      AND conname IN ('na_unique', 'na_target_present');
--   -- Expected:
--   --   na_target_present | CHECK (((poi_id IS NOT NULL) <> (region_id IS NOT NULL)))
--   --   na_unique         | UNIQUE NULLS NOT DISTINCT (poi_id, region_id, narrator_slug, depth, mode)
--
--   -- region_id index
--   SELECT indexname, indexdef
--     FROM pg_indexes
--    WHERE schemaname = 'public' AND tablename = 'narration_audio'
--      AND indexname = 'na_region_id_idx';
