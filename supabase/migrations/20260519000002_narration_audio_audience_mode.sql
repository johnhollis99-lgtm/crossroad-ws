-- Phase H1.6.1 — narration_audio audience_mode column + widened unique constraint.
--
-- Rationale: the narrator-collapse decision (2 narrators × 4 audiences → 1 voice
-- per audience) creates cache-key collisions in narration_audio because the
-- na_unique constraint (poi_id, region_id, narrator_slug, depth, mode) does
-- not distinguish audience modes. After the collapse, kids + local both sit at
-- narrator_slug='narrator_a' (Sulafat + Iapetus voices), and family + unfiltered
-- both sit at narrator_slug='narrator_b' (Sadachbia + Schedar). Inserts for one
-- audience would silently overwrite the other under the old unique shape.
--
-- This migration widens the unique constraint to include audience_mode and adds
-- the column itself with a CHECK to the canonical 4-value enum. Backfill is
-- DEFAULT 'family' because the v1 catalog is 100% narrator_b × family
-- (confirmed via voice_configs audit 2026-05-19: all 187 POI narrations + 108
-- region narrations under the v1 launch slate used family/narrator_b/Sadachbia).
--
-- Per drift 5.33 + precedent 20260510000005_na_unique_add_mode.sql: the live
-- na_unique is constraint-backed (not a bare unique index). Must use
-- ALTER TABLE DROP CONSTRAINT + ALTER TABLE ADD CONSTRAINT, not DROP INDEX.
-- Confirmed pre-flight against pg_constraint (contype='u').
--
-- Pre-migration rowcount: 149 (verified via execute_sql).

BEGIN;

-- 1. Add audience_mode column with CHECK + NOT NULL DEFAULT 'family'.
--    DEFAULT 'family' provides backfill: all 149 existing rows become 'family',
--    which matches the v1 catalog reality.
ALTER TABLE public.narration_audio
  ADD COLUMN audience_mode text NOT NULL DEFAULT 'family'
    CHECK (audience_mode IN ('family', 'kids', 'unfiltered', 'local'));

-- 2. Widen the na_unique constraint to include audience_mode.
ALTER TABLE public.narration_audio
  DROP CONSTRAINT IF EXISTS na_unique;

ALTER TABLE public.narration_audio
  ADD CONSTRAINT na_unique
    UNIQUE NULLS NOT DISTINCT
    (poi_id, region_id, narrator_slug, audience_mode, depth, mode);

COMMENT ON COLUMN public.narration_audio.audience_mode IS
  'Audience mode dimension for the narration. Decouples cache rows when two '
  'audience modes share the same narrator_slug. Added 2026-05-19 alongside '
  'the narrator-collapse to 1 voice per audience.';

COMMIT;

-- Verification queries (informational, run via execute_sql after COMMIT):
--   SELECT COUNT(*) FROM public.narration_audio;
--   -- expect: 149 (unchanged)
--
--   SELECT audience_mode, COUNT(*) FROM public.narration_audio
--    GROUP BY audience_mode;
--   -- expect: family=149 (full backfill from DEFAULT)
--
--   SELECT pg_get_constraintdef(oid) FROM pg_constraint
--    WHERE conrelid='public.narration_audio'::regclass AND conname='na_unique';
--   -- expect: UNIQUE NULLS NOT DISTINCT
--   --         (poi_id, region_id, narrator_slug, audience_mode, depth, mode)
