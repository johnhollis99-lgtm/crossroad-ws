-- Migration 3 — llm_calls indexing + TTS-dup guard.
--
-- Preflight (2026-05-10):
--   - 136 TTS rows: 99 with NULL related_id (legitimate audition/preview
--     calls — these never link to a narration_audio row by design),
--     37 with related_id (one per cached LA→Cambria narration).
--   - Zero (call_type='tts', related_id) duplicates today. The unique
--     index builds clean.
--
-- The duplicate-logging bug that CLAUDE.md flagged was either fixed before
-- the 2026-05-10 cache pass or only manifested intermittently. This index
-- is the durable guard: a future regression that emits two log rows for
-- the same narration_audio.id will surface as a unique-violation insert
-- failure instead of going silent.

CREATE INDEX IF NOT EXISTS idx_llm_calls_created_at
  ON public.llm_calls(created_at DESC);

CREATE INDEX IF NOT EXISTS idx_llm_calls_call_type_created_at
  ON public.llm_calls(call_type, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_llm_calls_related_id
  ON public.llm_calls(related_id) WHERE related_id IS NOT NULL;

-- TTS dup guard. Partial scope: only TTS calls with a related_id are
-- candidates for dedup. Audition + preview rows (NULL related_id) are
-- unaffected.
CREATE UNIQUE INDEX IF NOT EXISTS idx_llm_calls_tts_unique
  ON public.llm_calls(related_id)
  WHERE call_type = 'tts' AND related_id IS NOT NULL;
