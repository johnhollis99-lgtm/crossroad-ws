-- Migration 2 — narration lookahead index.
--
-- Speeds the cache-hit check: "for this POI, do I have audio in this
-- trip-mode + depth + narrator combination already?". Cheap to add now
-- (37 rows), worth it when narration_audio scales.
--
-- Column semantics:
--   - narration_audio.mode is **trip** mode (CHECK driving/hiking/city)
--   - narration_audio.narrator_slug is the voice identifier (= SKILL.md's
--     "voice_id"; rename is coordinated work for Prompt 06)
--   - narration_audio.depth is glance / ride_along / deep_dive
--
-- The existing UNIQUE index na_unique covers (poi_id, narrator_slug, depth)
-- which is enough for write uniqueness, but read paths often filter by
-- mode too — this composite index keeps those scans index-only.

CREATE INDEX IF NOT EXISTS idx_narration_audio_lookup
  ON public.narration_audio(poi_id, mode, depth, narrator_slug);
