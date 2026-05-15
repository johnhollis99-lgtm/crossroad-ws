-- 20260514000012_voice_configs_narrator_slug.sql
--
-- Phase D3: adds `narrator_slug` to `voice_configs` and swaps the partial
-- unique index from `(mode) WHERE is_active = true` →
-- `(mode, narrator_slug) WHERE is_active = true` so multiple narrators can
-- each own one active voice per audience mode without collision.
--
-- Per addendum §5.6 + the 2026-05-15 hybrid voice plan
-- (docs/decisions/2026-05-15-voice-hybrid.md). Two narrators × four
-- audiences = 8 active rows once all slots fill; this migration prepares
-- the schema, the same-PR seed inserts seed 4 new active rows on top of
-- the existing live family/Iapetus row (5 active rows post-commit; 3
-- remain pending re-audition for kids × A, kids × B, unfiltered × B).
--
-- ─── Pre-flight verification ─────────────────────────────────────────
--
-- Live state 2026-05-14:
--   1 row total: (family, Iapetus, is_active=true, version=1)
-- All existing rows will get narrator_slug='narrator_a' via the backfill
-- below before the NOT NULL constraint locks. The single existing row
-- corresponds to narrator_a per the curator decision (Iapetus = warm doc
-- baseline, fits the reverent posture).
--
-- ─── Coordinated code change required in the same PR? No. ────────────
--
-- voice_configs is read-only from the app's perspective today (server +
-- precache scripts SELECT it via `lookupVoiceConfig`-style helpers; no
-- one writes it programmatically except the audition CLI's --commit
-- path, which always inserts new rows with explicit values). Adding a
-- new column with a backfilled-then-NOT-NULL default is a forward-
-- compatible change for SELECT callers — they'll get an extra column
-- they ignore, no schema mismatch errors. The audition CLI will need to
-- start writing narrator_slug on new commits, but that's a follow-up
-- code change (Track A item 6) not blocking this migration.
--
-- ─── Constraint shape ───────────────────────────────────────────────
--
-- The CHECK locks narrator_slug to {'narrator_a', 'narrator_b'} per
-- addendum §5.1. If a future expansion adds a third narrator, this
-- CHECK widens via the standard drop-add pattern (precedent: drift
-- catalog 5.30 / migration 20260511000002).

BEGIN;

-- 1. Add narrator_slug column (nullable initially to allow backfill)
ALTER TABLE public.voice_configs
  ADD COLUMN narrator_slug text;

-- 2. Backfill: the single existing row (family, Iapetus) is narrator_a per
-- curator decision (warm doc baseline aligns with reverent narrator A).
UPDATE public.voice_configs
   SET narrator_slug = 'narrator_a'
 WHERE narrator_slug IS NULL;

-- 3. Lock NOT NULL + CHECK
ALTER TABLE public.voice_configs
  ALTER COLUMN narrator_slug SET NOT NULL;

ALTER TABLE public.voice_configs
  ADD CONSTRAINT voice_configs_narrator_slug_check
    CHECK (narrator_slug IN ('narrator_a', 'narrator_b'));

-- 4. Swap the partial unique index from (mode) → (mode, narrator_slug)
-- so each (audience, narrator) pair can have one active voice without
-- collision against the other narrator's active voice for the same audience.
DROP INDEX IF EXISTS public.idx_voice_configs_active_mode;

CREATE UNIQUE INDEX idx_voice_configs_active_mode_narrator
  ON public.voice_configs (mode, narrator_slug)
  WHERE is_active = true;

-- 5. Seed the 4 new active rows (5 total active post-commit, including the
-- existing family/Iapetus row which is now tagged narrator_a). The same
-- voice_id deliberately appears in two rows per narrator (Iapetus across
-- family+local for A; Sulafat across family+local for B) per the hybrid
-- plan — voice_configs holds per-(mode, narrator) settings, not per-voice
-- catalog entries.
--
-- Tier label "Region/X" in display_name disambiguates from the existing
-- POI-narration "Family — Iapetus" row (which keeps its name).

INSERT INTO public.voice_configs
  (mode, provider, voice_id, voice_settings, display_name, description, is_active, version, narrator_slug)
VALUES
  ('local',      'google', 'en-US-Chirp3-HD-Iapetus',
    '{"speakingRate": 1.0,  "pitch": 0, "volumeGainDb": 0}'::jsonb,
    'Local — Iapetus (narrator_a)', 'Conversational insider narrator (hybrid: shares voice with family/A)', true, 1, 'narrator_a'),
  ('unfiltered', 'google', 'en-US-Chirp3-HD-Charon',
    '{"speakingRate": 0.95, "pitch": 0, "volumeGainDb": 0}'::jsonb,
    'Unfiltered — Charon (narrator_a)', 'Deadpan sardonic narrator', true, 1, 'narrator_a'),
  ('family',     'google', 'en-US-Chirp3-HD-Sulafat',
    '{"speakingRate": 1.0,  "pitch": 0, "volumeGainDb": 0}'::jsonb,
    'Family — Sulafat (narrator_b)', 'Warm documentary narrator, conversational register', true, 1, 'narrator_b'),
  ('local',      'google', 'en-US-Chirp3-HD-Sulafat',
    '{"speakingRate": 1.0,  "pitch": 0, "volumeGainDb": 0}'::jsonb,
    'Local — Sulafat (narrator_b)', 'Conversational insider narrator (hybrid: shares voice with family/B)', true, 1, 'narrator_b');

COMMIT;

-- ─── Verification (re-run post-apply) ────────────────────────────────
--
--   -- narrator_slug column + CHECK
--   SELECT column_name, is_nullable
--     FROM information_schema.columns
--    WHERE table_schema = 'public' AND table_name = 'voice_configs'
--      AND column_name = 'narrator_slug';
--   -- Expected: NOT NULL
--
--   SELECT pg_get_constraintdef(oid)
--     FROM pg_constraint
--    WHERE conname = 'voice_configs_narrator_slug_check';
--   -- Expected: CHECK (narrator_slug IN ('narrator_a', 'narrator_b'))
--
--   -- Partial unique index swap
--   SELECT indexname, indexdef
--     FROM pg_indexes
--    WHERE schemaname = 'public' AND tablename = 'voice_configs';
--   -- Expected: idx_voice_configs_active_mode_narrator (no idx_voice_configs_active_mode)
--
--   -- 5 active rows total (1 existing + 4 new)
--   SELECT mode, narrator_slug, voice_id, display_name
--     FROM voice_configs
--    WHERE is_active = true
--    ORDER BY narrator_slug, mode;
