-- 20260522000005_create_roadstory_audio.sql
--
-- Migration Batch 1 / Migration 5 — Create the roadstory_audio table.
--
-- Per addendum §6: RoadStories carry a single canonical text in
-- roadstories.master_text, but each RoadStory can be rendered to audio
-- multiple times (per narrator + voice_slot variant). roadstory_audio is
-- the per-rendering audio metadata table.
--
-- Cardinality decision (load-bearing):
--   PRIMARY KEY (roadstory_id) — one audio row per RoadStory in v1.
--   Variants for the same RoadStory across narrators/slots are handled by
--   the trigger geometry pre-computing one row per render at curation time;
--   a future widening can swap the PK for a composite (roadstory_id,
--   narrator_slug, voice_slot) if multi-render-per-story becomes a
--   first-class case. For now: one-render-per-story.
--
-- CASCADE on roadstory delete: removing a RoadStory removes its audio row.
-- The Storage object is NOT auto-removed — orphaned Storage objects are
-- swept by the existing scripts/sweep-orphaned-narration.ts pattern
-- (adapted to roadstory_audio in a later phase).
--
-- Schema mirrors narration_audio's economy + telemetry columns:
--   character_count / duration_ms / cost_usd  — per-render economics
--   tts_provider / voice_id                   — for cache-key + replay
--   generated_at                              — when the audio was rendered
--
-- Q4.B does not apply to roadstory_audio — only the parent roadstories
-- table gets RLS. roadstory_audio inherits visibility through the FK
-- relationship; writes are service-role only. No RLS policy on this
-- table means it's invisible to client SELECTs (consistent with how
-- narration_audio is treated today — see voice_configs anon SELECT in
-- 20260504000014 which is the explicit exception).
--
-- Per CLAUDE.md migration conventions:
--   * Schema-qualified table names
--   * BEGIN/COMMIT wrapped
--   * updated_at trigger via shared public.set_updated_at()
--   * Trailing verification query

BEGIN;

CREATE TABLE public.roadstory_audio (
  roadstory_id     uuid    PRIMARY KEY REFERENCES public.roadstories(id) ON DELETE CASCADE,
  narrator_slug    text    NOT NULL
                   CHECK (narrator_slug IN ('narrator_a','narrator_b')),
  voice_slot       smallint NOT NULL
                   CHECK (voice_slot IN (1, 2)),
  audio_url        text,
  character_count  integer,
  duration_ms      integer,
  tts_provider     text    DEFAULT 'google',
  voice_id         text,
  cost_usd         numeric(10,4),
  generated_at     timestamptz,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now()
);

-- ── Indexes ────────────────────────────────────────────────────────────────
-- Narrator filter index for runtime narrator-aware lookups.
CREATE INDEX idx_roadstory_audio_narrator
  ON public.roadstory_audio (narrator_slug);

-- ── updated_at trigger ─────────────────────────────────────────────────────
-- Same shared trigger function as roadstories + regions + user_preferences.
DROP TRIGGER IF EXISTS set_updated_at ON public.roadstory_audio;
CREATE TRIGGER set_updated_at
  BEFORE UPDATE ON public.roadstory_audio
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

COMMENT ON TABLE public.roadstory_audio IS
  'Per-RoadStory audio rendering metadata. One row per published RoadStory '
  'in v1; future widening may swap PK for (roadstory_id, narrator_slug, '
  'voice_slot) if multi-render-per-story is needed. Storage objects live in '
  'the narration-audio bucket at roadstories/{id}/{narrator}_{slot}.opus.';

COMMIT;

-- ============================================================
-- Verification (run after COMMIT):
-- ============================================================
-- (v1) Table + columns + FK:
--   \d+ public.roadstory_audio
--   -- Expect: 11 columns, PK on roadstory_id with ON DELETE CASCADE,
--   --         CHECK on narrator_slug + voice_slot.
--
-- (v2) Trigger:
--   SELECT tgname FROM pg_trigger
--    WHERE tgrelid='public.roadstory_audio'::regclass AND NOT tgisinternal;
--   -- Expect: set_updated_at
--
-- (v3) RLS posture (none enabled — service-role only):
--   SELECT relrowsecurity FROM pg_class
--    WHERE relname='roadstory_audio' AND relnamespace='public'::regnamespace;
--   -- Expect: false (no RLS — consistent with narration_audio).
