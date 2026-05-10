-- Add narration_text to narration_audio so cached LLM output can drive
-- future TTS regeneration (voice swap, format change) without re-paying
-- Claude.
--
-- Why: every audio row currently stores its provenance — provider, voice,
-- character_count, cost — but not the actual text the LLM produced. If the
-- voice catalog or audio format changes, regenerating audio means
-- re-running the LLM call for each POI. Persisting the text breaks that
-- LLM-cost coupling.
--
-- Population:
--   - Existing rows (currently 0): remain NULL — backfill not feasible
--     because the original LLM responses were not retained.
--   - New rows: server/routes/narration.js and
--     scripts/precache-popular-routes.ts both write the exact string
--     passed to generateNarration() in the same UPDATE that flips
--     status to 'ready'.
--
-- Schema notes:
--   - Nullable on purpose (existing rows + future failure modes where
--     audio is generated but text capture fails are both legitimate).
--   - No default, no index — text is fetched by row id, never queried.

ALTER TABLE narration_audio
  ADD COLUMN IF NOT EXISTS narration_text text;
