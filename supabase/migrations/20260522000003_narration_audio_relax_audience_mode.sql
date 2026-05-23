-- 20260522000003_narration_audio_relax_audience_mode.sql
--
-- Migration Batch 1 / Migration 3 — narration_audio.audience_mode goes nullable.
--
-- Per Q3.A: drop BOTH the NOT NULL constraint AND the 'family' DEFAULT.
-- This is what makes the cache-key flip actually work — new narration_audio
-- rows that come from the post-collapse route (narration.ts after Migration
-- 2 lands) write `audience_mode: null`, signalling "audience-agnostic" at
-- the row level. Audience addressability now sits in voice_configs via
-- (narrator_slug, voice_slot) per Migration 2.
--
-- The CHECK constraint stays — CHECK (audience_mode IN (...)) trivially
-- passes for NULL (`NULL IN (...)` is unknown, which CHECK treats as pass).
--
-- The `na_unique` constraint (UNIQUE NULLS NOT DISTINCT on poi_id, region_id,
-- narrator_slug, audience_mode, depth, mode) requires NO change — its
-- NULLS NOT DISTINCT shape means NULL audience_mode values are treated as
-- equal-to-each-other (so two rows for the same POI/narrator with NULL
-- audience_mode would collide, which is desired: one new-schema row per
-- cell). Existing rows backfilled to 'family' in 20260519000002 continue
-- to coexist as distinct-from-NULL.
--
-- Mobile cache lookup logic change implied by this migration (for the
-- consuming code in hooks/useTTS.ts + scripts/precache-popular-routes.ts):
--   -- WAS: WHERE poi_id = $1 AND depth = $2 AND audience_mode = $3 AND narrator_slug = $4
--   -- NOW: WHERE poi_id = $1 AND depth = $2 AND narrator_slug = $3
--   --      ORDER BY (audience_mode IS NULL) DESC LIMIT 1
-- The ORDER BY prefers the new-schema NULL-audience row when both old
-- (family-tagged) and new (NULL) rows exist for the same (poi, depth,
-- narrator). Wire-up of these callers is Batch 2 work — this migration
-- only relaxes the schema.
--
-- Per CLAUDE.md migration conventions:
--   * Schema-qualified table names
--   * BEGIN/COMMIT wrapped
--   * Trailing verification query

BEGIN;

ALTER TABLE public.narration_audio
  ALTER COLUMN audience_mode DROP NOT NULL;

ALTER TABLE public.narration_audio
  ALTER COLUMN audience_mode DROP DEFAULT;

COMMIT;

-- ============================================================
-- Verification (run after COMMIT):
-- ============================================================
-- (v1) Column now nullable + no default:
--   SELECT is_nullable, column_default
--     FROM information_schema.columns
--    WHERE table_schema = 'public'
--      AND table_name   = 'narration_audio'
--      AND column_name  = 'audience_mode';
--   -- Expect: is_nullable = YES, column_default = NULL
--
-- (v2) na_unique constraint unchanged (still 6-column NULLS NOT DISTINCT):
--   SELECT pg_get_constraintdef(oid) FROM pg_constraint
--    WHERE conrelid = 'public.narration_audio'::regclass
--      AND conname  = 'na_unique';
--   -- Expect: UNIQUE NULLS NOT DISTINCT
--   --         (poi_id, region_id, narrator_slug, audience_mode, depth, mode)
--
-- (v3) Existing 153 rows undisturbed (all still backfilled to 'family'
--      from 20260519000002):
--   SELECT audience_mode, COUNT(*) FROM public.narration_audio
--    GROUP BY audience_mode ORDER BY audience_mode NULLS FIRST;
--   -- Expect: family=148, kids=2, local=1, unfiltered=2 (per prior-agent recon).
