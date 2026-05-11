-- 20260510000005_na_unique_add_mode.sql
--
-- Adds `mode` to the unique constraint on `narration_audio` so that a single
-- (poi_id, narrator_slug, depth) tuple may legitimately address multiple audio
-- objects across trip modes (driving / hiking / city / venue_tour).
--
-- Background: the Storage path `{poi_id}/{mode}/{depth}/{voiceId}.opus` and the
-- pois.narration_cache JSON key `{mode}-{depth}-{voiceId}` already include mode.
-- The unique constraint on `narration_audio` was the lone outlier. The
-- venue-tour design (docs/venue-tour-design.md §6.3) commits to mode-specific
-- prompt templates (`venue_tour_*`) that produce different content for the
-- same POI, depth, and voice — without mode in the unique constraint, an
-- upsert from one mode would silently overwrite the row for another mode
-- whose audio_url points at a different Storage object.
--
-- Pre-flight verification (run before applying):
--   SELECT poi_id, narrator_slug, depth, count(*), array_agg(mode)
--   FROM narration_audio
--   GROUP BY poi_id, narrator_slug, depth HAVING count(*) > 1;
-- Confirmed 0 rows on 2026-05-10 — see docs/audit-na-unique.md.
--
-- ⚠️ COORDINATED CODE CHANGE REQUIRED BEFORE APPLYING.
--
-- Two callers upsert with `onConflict: 'poi_id,narrator_slug,depth'`:
--   1. server/routes/narration.js  (insertNarrationAudioPending)
--   2. scripts/precache-popular-routes.ts  (upsertNarrationAudio)
--
-- Postgres requires the ON CONFLICT target to match an actual unique
-- constraint. After this migration the only matching unique constraint is
-- the new 4-column one, so both callers MUST be updated to:
--   onConflict: 'poi_id,narrator_slug,depth,mode'
-- in the same PR that applies this migration.
--
-- ⚠️ STRUCTURE NOTE — see drift catalog 5.33.
--
-- The live `na_unique` on production is a constraint-backed unique index,
-- not a bare CREATE UNIQUE INDEX. `pg_constraint` returns
-- `na_unique: UNIQUE (poi_id, narrator_slug, depth)`. Earlier drafts of
-- this migration used `DROP INDEX IF EXISTS public.na_unique` which
-- Postgres refuses on constraint-backed indexes ("cannot drop index ...
-- because constraint ... requires it"). The migration was corrected to
-- use ALTER TABLE DROP CONSTRAINT / ADD CONSTRAINT so the shape stays
-- constraint-backed.

BEGIN;

ALTER TABLE public.narration_audio
  DROP CONSTRAINT IF EXISTS na_unique;

ALTER TABLE public.narration_audio
  ADD CONSTRAINT na_unique UNIQUE (poi_id, narrator_slug, depth, mode);

COMMIT;

-- Verification (re-run post-apply):
--   SELECT conname, pg_get_constraintdef(oid)
--   FROM pg_constraint
--   WHERE conrelid = 'public.narration_audio'::regclass AND contype = 'u';
-- Expected:
--   na_unique | UNIQUE (poi_id, narrator_slug, depth, mode)
