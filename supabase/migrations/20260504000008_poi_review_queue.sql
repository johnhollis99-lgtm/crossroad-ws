-- Add extraction tracking to narrative_documents
ALTER TABLE narrative_documents
  ADD COLUMN IF NOT EXISTS extracted_at timestamptz;

CREATE INDEX IF NOT EXISTS narrative_documents_unextracted_idx
  ON narrative_documents (id)
  WHERE extracted_at IS NULL;

-- POI candidates extracted by the LLM, awaiting human review
CREATE TABLE IF NOT EXISTS poi_review_queue (
  id                    uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  narrative_document_id uuid        NOT NULL REFERENCES narrative_documents (id) ON DELETE CASCADE,

  -- LLM-extracted fields
  name                  text        NOT NULL,
  event_summary         text        NOT NULL,
  place_name_in_source  text        NOT NULL,
  geocoding_hint        text,
  date_or_period        text,
  source_quote          text        NOT NULL,
  category_guess        text        NOT NULL,
  llm_confidence        numeric(4,3) NOT NULL CHECK (llm_confidence BETWEEN 0 AND 1),

  -- Geocoding result
  proposed_location     geography(Point, 4326),
  geocode_display_name  text,

  -- Review workflow
  review_status         text        NOT NULL DEFAULT 'pending'
                          CHECK (review_status IN ('pending', 'approved', 'rejected', 'needs_human')),
  promoted_poi_id       uuid        REFERENCES pois (id) ON DELETE SET NULL,

  created_at            timestamptz NOT NULL DEFAULT now(),
  reviewed_at           timestamptz,
  reviewed_by           text
);

CREATE INDEX IF NOT EXISTS poi_review_queue_status_idx
  ON poi_review_queue (review_status);

CREATE INDEX IF NOT EXISTS poi_review_queue_document_idx
  ON poi_review_queue (narrative_document_id);

CREATE INDEX IF NOT EXISTS poi_review_queue_location_idx
  ON poi_review_queue USING gist (proposed_location)
  WHERE proposed_location IS NOT NULL;

-- RLS: admins only (service role bypasses RLS; anon gets nothing)
ALTER TABLE poi_review_queue ENABLE ROW LEVEL SECURITY;
