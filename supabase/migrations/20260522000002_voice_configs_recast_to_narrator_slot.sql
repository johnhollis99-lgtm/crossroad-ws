-- 20260522000002_voice_configs_recast_to_narrator_slot.sql
--
-- Migration Batch 1 / Migration 2 — voice_configs recast to (narrator_slug, voice_slot).
--
-- Per addendum §5.7: the production voice model is exactly TWO slots per
-- narrator (slot 1 + slot 2). Audience-mode is no longer the dispatch axis;
-- the runtime picks slot 1 or slot 2 at trip-start (e.g., per-user variety,
-- per-route mood, A/B). Removing audience_mode as the addressability key
-- requires:
--
--   (a) Add `voice_slot smallint CHECK IN (1,2)` to voice_configs.
--   (b) Backfill slot assignments for the 4 active rows that survived the
--       2026-05-19 collapse (per prior-agent Phase 1 verified live state):
--           family/narrator_b/Sadachbia        → narrator_b slot 1
--           kids/narrator_a/Sulafat            → narrator_a slot 2
--           local/narrator_a/Iapetus           → narrator_a slot 1
--           unfiltered/narrator_b/Schedar      → narrator_b slot 2
--       Slot 1 assignments preserve the "primary" voice for each narrator
--       (Iapetus = narrator_a primary; Sadachbia = narrator_b primary), per
--       the same hybrid-voice mapping in 20260514000012.
--   (c) Relax `mode` NOT NULL so future inserts can carry NULL audience_mode
--       (the column itself stays on the table as forensic legacy data —
--       Migration 8 / Batch 2 may drop it later). The 4-value CHECK stays
--       — null values pass the CHECK trivially since `NULL IN (...)` is
--       unknown, which CHECK treats as pass.
--   (d) Drop the existing partial unique index
--       `idx_voice_configs_active_mode_narrator (mode, narrator_slug)
--       WHERE is_active = true` (per Q2.A).
--   (e) Create new partial unique index
--       `uq_voice_configs_narrator_slot_active (narrator_slug, voice_slot)
--       WHERE is_active = true` so each (narrator, slot) pair holds exactly
--       one active row.
--
-- Per CLAUDE.md migration conventions:
--   * Schema-qualified table names
--   * BEGIN/COMMIT wrapped
--   * Trailing verification query
--
-- Coordinated with Migration 3 (narration_audio.audience_mode goes nullable).
-- Customize UI (4-card grid in app/customize.tsx lines 125-215 + 753-789)
-- remains untouched per Q10.A — Batch 2/3 refit.

BEGIN;

-- ── 1. Add voice_slot column ───────────────────────────────────────────────
ALTER TABLE public.voice_configs
  ADD COLUMN voice_slot smallint
    CHECK (voice_slot IN (1, 2));

-- ── 2. Backfill slot assignments (per prior-agent verified live state) ────
UPDATE public.voice_configs SET voice_slot = 1
 WHERE is_active = true
   AND narrator_slug = 'narrator_a'
   AND voice_id = 'en-US-Chirp3-HD-Iapetus';

UPDATE public.voice_configs SET voice_slot = 2
 WHERE is_active = true
   AND narrator_slug = 'narrator_a'
   AND voice_id = 'en-US-Chirp3-HD-Sulafat';

UPDATE public.voice_configs SET voice_slot = 1
 WHERE is_active = true
   AND narrator_slug = 'narrator_b'
   AND voice_id = 'en-US-Chirp3-HD-Sadachbia';

UPDATE public.voice_configs SET voice_slot = 2
 WHERE is_active = true
   AND narrator_slug = 'narrator_b'
   AND voice_id = 'en-US-Chirp3-HD-Schedar';

-- ── 3. Relax mode NOT NULL (per Q2.A) ─────────────────────────────────────
-- The 4-value CHECK constraint stays — NULL passes (unknown) automatically.
ALTER TABLE public.voice_configs
  ALTER COLUMN mode DROP NOT NULL;

-- ── 4. Drop the existing partial unique index ─────────────────────────────
-- Lived in: 20260514000012_voice_configs_narrator_slug.sql line 68.
DROP INDEX IF EXISTS public.idx_voice_configs_active_mode_narrator;

-- ── 5. New addressability — (narrator_slug, voice_slot) per active row ───
CREATE UNIQUE INDEX uq_voice_configs_narrator_slot_active
  ON public.voice_configs (narrator_slug, voice_slot)
  WHERE is_active = true;

COMMIT;

-- ============================================================
-- Verification (run after COMMIT):
-- ============================================================
-- (v1) Active rows have voice_slot populated and no two share (narrator, slot):
--   SELECT narrator_slug, voice_slot, voice_id, mode
--     FROM public.voice_configs
--    WHERE is_active = true
--    ORDER BY narrator_slug, voice_slot;
--   -- Expect exactly 4 rows:
--   --   narrator_a, 1, en-US-Chirp3-HD-Iapetus,   local
--   --   narrator_a, 2, en-US-Chirp3-HD-Sulafat,   kids
--   --   narrator_b, 1, en-US-Chirp3-HD-Sadachbia, family
--   --   narrator_b, 2, en-US-Chirp3-HD-Schedar,   unfiltered
--
-- (v2) Partial unique index is the new shape:
--   SELECT indexname, indexdef FROM pg_indexes
--    WHERE tablename = 'voice_configs' AND schemaname = 'public';
--   -- Expect: uq_voice_configs_narrator_slot_active (narrator_slug, voice_slot)
--   --         WHERE is_active = true. The old idx_voice_configs_active_mode_narrator
--   --         must be gone.
--
-- (v3) mode column now nullable:
--   SELECT is_nullable FROM information_schema.columns
--    WHERE table_schema='public' AND table_name='voice_configs' AND column_name='mode';
--   -- Expect: YES
