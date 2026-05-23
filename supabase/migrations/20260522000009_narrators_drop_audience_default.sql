-- 20260522000009_narrators_drop_audience_default.sql
--
-- Migration Batch 2 / Track D / Migration 9 —
--   public.narrators: drop audience_mode default + NULL legacy A/B rows.
--
-- Batch 1 / Migration 1 (20260522000001) collapsed the narrators table to
-- the two-narrator model (`narrator_a` / `narrator_b`). The
-- `narrators.audience_mode` column was kept on the row with its existing
-- DEFAULT — the assumption being some future workflow might still address
-- a narrator by audience. Batch 2 (Tracks A-C) walks back that
-- assumption: the entire app no longer reads or writes audience_mode in
-- the narrator-selection path. The remaining DEFAULT on this column is a
-- foot-gun (it would silently re-populate the legacy taxonomy on any
-- direct INSERT), and the two surviving rows should carry NULL so
-- downstream queries see "no audience set" unambiguously rather than the
-- stale default value.
--
-- This migration:
--   (a) Drops the column DEFAULT (no replacement — column stays nullable).
--   (b) NULLs the value on the two surviving rows (narrator_a, narrator_b)
--       so the legacy 'family' default text is gone from the live data.
--
-- Coordinated with Track C — useTTS.ts, all 6 precache/spot-check scripts,
-- both precache callers, server narration route, and lib/supabase.ts no
-- longer read narrators.audience_mode.
--
-- The column itself is retained (forensic legacy data; bundle a column
-- drop with the Phase D3 / narrator_id cleanup in a future batch). The
-- 4-value CHECK constraint on `audience_mode` (family/kids/unfiltered/
-- local) stays — NULL passes the CHECK trivially (`NULL IN (...)` is
-- unknown, which CHECK treats as pass).
--
-- Per CLAUDE.md migration conventions:
--   * Schema-qualified table names
--   * BEGIN/COMMIT wrapped
--   * Trailing verification query

BEGIN;

ALTER TABLE public.narrators
  ALTER COLUMN audience_mode DROP DEFAULT;

UPDATE public.narrators
   SET audience_mode = NULL
 WHERE slug IN ('narrator_a', 'narrator_b');

COMMIT;

-- ============================================================
-- Verification (run after COMMIT):
-- ============================================================
-- (v1) Column default cleared:
--   SELECT column_default
--     FROM information_schema.columns
--    WHERE table_schema = 'public'
--      AND table_name   = 'narrators'
--      AND column_name  = 'audience_mode';
--   -- Expect: NULL (no default)
--
-- (v2) Two surviving narrator rows now carry audience_mode = NULL:
--   SELECT slug, name, audience_mode
--     FROM public.narrators
--    WHERE slug IN ('narrator_a', 'narrator_b')
--    ORDER BY slug;
--   -- Expect 2 rows; audience_mode = NULL for both.
--
-- (v3) CHECK constraint still present (NULL passes trivially):
--   SELECT conname FROM pg_constraint
--    WHERE conrelid = 'public.narrators'::regclass
--      AND conname LIKE '%audience%';
--   -- Expect: the existing 4-value CHECK constraint is still listed.
