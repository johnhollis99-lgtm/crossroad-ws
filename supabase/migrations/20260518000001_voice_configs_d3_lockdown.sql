-- 20260518000001_voice_configs_d3_lockdown.sql
--
-- D3 final voice_configs lineup lock. Already applied live 2026-05-18 via
-- atomic ad-hoc UPDATE + INSERT (transaction wrapped). This file captures
-- the operations idempotently so a from-scratch migrations replay yields
-- the same end state. Per the 2026-05-15 hybrid voice plan adoption
-- (docs/decisions/2026-05-15-voice-hybrid.md) and curator's 2026-05-18
-- final lineup adjustment (Sulafat → Sadachbia on narrator_b family/local;
-- Zephyr at narrator_b kids; Schedar at narrator_b unfiltered; Sulafat at
-- narrator_a kids).
--
-- ─── Pre-flight state (the prior commit c9dfea2 left this) ───────────
--
-- Active rows before lockdown: 5
--   narrator_a  family      en-US-Chirp3-HD-Iapetus
--   narrator_a  local       en-US-Chirp3-HD-Iapetus
--   narrator_a  unfiltered  en-US-Chirp3-HD-Charon
--   narrator_b  family      en-US-Chirp3-HD-Sulafat   ← deactivate, replace
--   narrator_b  local       en-US-Chirp3-HD-Sulafat   ← deactivate, replace
--
-- ─── Target state ─────────────────────────────────────────────────────
--
-- 8 active rows (full 4 × 2 coverage):
--   narrator_a  family      Iapetus    r=1.00  v=1
--   narrator_a  kids        Sulafat    r=1.05  v=1
--   narrator_a  unfiltered  Charon     r=0.95  v=1
--   narrator_a  local       Iapetus    r=1.00  v=1
--   narrator_b  family      Sadachbia  r=1.00  v=2
--   narrator_b  kids        Zephyr     r=1.05  v=2
--   narrator_b  unfiltered  Schedar    r=0.95  v=2
--   narrator_b  local       Sadachbia  r=1.00  v=2
--
-- The partial unique index idx_voice_configs_active_mode_narrator
-- (mode, narrator_slug) WHERE is_active = true requires the two
-- Sulafat-on-narrator_b rows to deactivate BEFORE the new Sadachbia
-- rows insert, or the index throws unique-violation. Hence the
-- ordering below: UPDATEs first, INSERTs second, single transaction.

BEGIN;

-- 1. Deactivate the two Sulafat rows on narrator_b
UPDATE public.voice_configs
   SET is_active = false
 WHERE mode IN ('family', 'local')
   AND narrator_slug = 'narrator_b'
   AND voice_id = 'en-US-Chirp3-HD-Sulafat'
   AND is_active = true;

-- 2. Insert the 5 new active rows. Each per-mode `version` is computed
-- relative to the max-existing-version-for-this-mode at apply time so
-- multiple replays preserve monotonic versioning.
--
-- Idempotency: a partial unique index on (mode, narrator_slug)
-- WHERE is_active=true guarantees these rows only insert once
-- (re-running this migration after a prior successful apply will fail
-- on the unique constraint and roll back). For a true idempotent
-- replay, drop+recreate is safer; for the from-scratch case this
-- migration runs once and stays committed in migration history.

DO $$
DECLARE
  next_v_kids       int := (SELECT COALESCE(MAX(version), 0) + 1 FROM voice_configs WHERE mode = 'kids');
  next_v_family     int := (SELECT COALESCE(MAX(version), 0) + 1 FROM voice_configs WHERE mode = 'family');
  next_v_unfiltered int := (SELECT COALESCE(MAX(version), 0) + 1 FROM voice_configs WHERE mode = 'unfiltered');
  next_v_local      int := (SELECT COALESCE(MAX(version), 0) + 1 FROM voice_configs WHERE mode = 'local');
BEGIN
  INSERT INTO public.voice_configs
    (mode, provider, voice_id, voice_settings, display_name, description, is_active, version, narrator_slug)
  VALUES
    ('kids',       'google', 'en-US-Chirp3-HD-Sulafat',
      '{"speakingRate": 1.05, "pitch": 0, "volumeGainDb": 0}'::jsonb,
      'Kids — Sulafat (narrator_a)', 'Enthusiastic curious narrator, reverent register',
      true, next_v_kids, 'narrator_a'),

    ('family',     'google', 'en-US-Chirp3-HD-Sadachbia',
      '{"speakingRate": 1.00, "pitch": 0, "volumeGainDb": 0}'::jsonb,
      'Family — Sadachbia (narrator_b)', 'Warm conversational narrator, friend-in-cab register',
      true, next_v_family, 'narrator_b'),

    ('kids',       'google', 'en-US-Chirp3-HD-Zephyr',
      '{"speakingRate": 1.05, "pitch": 0, "volumeGainDb": 0}'::jsonb,
      'Kids — Zephyr (narrator_b)', 'Playful curious narrator, conversational register',
      true, next_v_kids + 1, 'narrator_b'),

    ('unfiltered', 'google', 'en-US-Chirp3-HD-Schedar',
      '{"speakingRate": 0.95, "pitch": 0, "volumeGainDb": 0}'::jsonb,
      'Unfiltered — Schedar (narrator_b)', 'Dry adult narrator, conversational register',
      true, next_v_unfiltered, 'narrator_b'),

    ('local',      'google', 'en-US-Chirp3-HD-Sadachbia',
      '{"speakingRate": 1.00, "pitch": 0, "volumeGainDb": 0}'::jsonb,
      'Local — Sadachbia (narrator_b)', 'Insider conversational narrator (hybrid: shares voice with family/B)',
      true, next_v_local, 'narrator_b');
END $$;

COMMIT;

-- ─── Verification (re-run post-apply) ────────────────────────────────
--
--   SELECT narrator_slug, mode, voice_id, voice_settings->>'speakingRate' AS rate, version
--     FROM voice_configs
--    WHERE is_active = true
--    ORDER BY narrator_slug, mode;
--
--   Expected: 8 rows, full coverage matrix.
--
--   SELECT mode, narrator_slug, COUNT(*) AS n
--     FROM voice_configs
--    WHERE is_active = true
--    GROUP BY mode, narrator_slug
--   HAVING COUNT(*) > 1;
--
--   Expected: 0 rows (partial unique passes).
