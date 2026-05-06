-- Verification step for LLM-extracted POI candidates
ALTER TABLE poi_review_queue
  ADD COLUMN IF NOT EXISTS verification_passed    bool  NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS verification_reasoning text;

-- Partial index for the verification query (pending rows not yet verified)
CREATE INDEX IF NOT EXISTS poi_review_queue_needs_verify_idx
  ON poi_review_queue (llm_confidence)
  WHERE review_status = 'pending' AND verification_passed = false;
