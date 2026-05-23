-- 20260522000001_narrators_collapse_to_a_b.sql
--
-- Migration Batch 1 / Migration 1 — Narrator collapse to (narrator_a, narrator_b).
--
-- Per addendum §5.1 + §5.7: the production narrator taxonomy is exactly two
-- slugs — narrator_a (Window Seat — reverent / contemplative) and narrator_b
-- (Shotgun — conversational / easygoing). The legacy 4-narrator preset table
-- (`the-junior-ranger`, `the-local`, `the-professor`, `the-truck-driver`) is
-- retired; rows stay on disk with `is_active = false` for FK referential
-- safety (existing `trips.narrator_id` rows continue to resolve).
--
-- Q1.A revised 2026-05-22 per curator post-rollback: use existing
-- public.narrators.name column for the user-visible label; drop the redundant
-- display_name addition. The 4 legacy presets already carry meaningful `name`
-- values that mirror display_name semantics ('The Junior Ranger' is to
-- 'the-junior-ranger' as 'Window Seat' is to 'narrator_a').
--
-- ALTER table to add posture_summary, then relax the audience_mode NOT NULL +
-- drop the audience_mode CHECK. The legacy table carried `audience_mode NOT
-- NULL CHECK ∈ 4-value enum`; the new narrator_a / narrator_b rows are not
-- bound to a single audience (each narrator pairs with multiple audiences via
-- voice_configs.narrator_slug + voice_slot in Migration 2), so the column
-- must be nullable on the new rows.
--
-- Per CLAUDE.md migration conventions:
--   * Schema-qualified table names (public.narrators)
--   * BEGIN/COMMIT wrapped
--   * Trailing verification query
--
-- Coordinated migrations in this batch:
--   2 — voice_configs gains voice_slot + drops NOT NULL on mode
--   3 — narration_audio relaxes audience_mode NOT NULL + drops DEFAULT
--   4-5 — roadstories + roadstory_audio tables
--   6 — pois.roadstory_anchor FK
--   7 — narrative_modes backfill (volcanic + hot_springs → soul) + trigger fn patch
--   8 — trips drops legacy depth/density/min_relevance/poi_distance_m columns

BEGIN;

-- ── 1. Schema relaxation (per Q1.A — Option A) ────────────────────────────
-- Add posture_summary only; the existing `name` column carries the
-- user-visible label (Window Seat / Shotgun).
ALTER TABLE public.narrators
  ADD COLUMN IF NOT EXISTS posture_summary text;

-- Drop the audience_mode CHECK so narrator_a / narrator_b rows can carry NULL.
-- The constraint name was set in 20260504000000_narrator_system.sql.
ALTER TABLE public.narrators
  DROP CONSTRAINT IF EXISTS narrators_audience_mode_check;

-- Relax NOT NULL so the new rows below (audience_mode = NULL) can land.
ALTER TABLE public.narrators
  ALTER COLUMN audience_mode DROP NOT NULL;

-- ── 2. Retire the legacy 4 presets ────────────────────────────────────────
UPDATE public.narrators
   SET is_active = false
 WHERE slug IN ('the-junior-ranger','the-local','the-professor','the-truck-driver');

-- ── 3. Upsert the new 2-narrator catalog ──────────────────────────────────
-- Posture summaries verbatim from the operator's task spec.
INSERT INTO public.narrators (slug, name, posture_summary, voice_id, is_active)
VALUES
  ('narrator_a', 'Window Seat',
   'Reverent / contemplative writing style. The land speaks first. '
   'Tactile, sensory, room for awe. Comfortable with silence.',
   NULL, true),
  ('narrator_b', 'Shotgun',
   'Conversational / easygoing writing style. Friend in the cab, '
   'campfire storyteller. Plain English, gentle humor, human stories.',
   NULL, true)
ON CONFLICT (slug) DO UPDATE
  SET is_active       = true,
      name            = EXCLUDED.name,
      posture_summary = EXCLUDED.posture_summary;

COMMIT;

-- ============================================================
-- Verification (run after COMMIT):
-- ============================================================
-- SELECT slug, name, posture_summary, audience_mode, is_active
--   FROM public.narrators
--  ORDER BY is_active DESC, slug;
-- -- Expect:
-- --   narrator_a | Window Seat | <reverent prose> | NULL | true
-- --   narrator_b | Shotgun     | <campfire prose> | NULL | true
-- --   the-junior-ranger / the-local / the-professor / the-truck-driver:
-- --     is_active=false, audience_mode preserved (non-NULL legacy values).
