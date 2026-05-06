-- ============================================================
-- Migration: POI source provenance
-- Adds external source tracking, dedup support, and confidence
-- scoring to the pois table.
-- ============================================================

-- ────────────────────────────────────────────────────────────
-- 1. Add provenance columns
-- ────────────────────────────────────────────────────────────

-- source_type: NOT NULL with DEFAULT 'editorial' so existing rows
-- satisfy the constraint immediately on column add.
ALTER TABLE pois
  ADD COLUMN IF NOT EXISTS source_type text NOT NULL DEFAULT 'editorial'
    CONSTRAINT pois_source_type_check
    CHECK (source_type IN (
      'osm', 'wikidata', 'nrhp', 'state_landmark', 'gnis',
      'narrative_extracted', 'editorial', 'user_contributed'
    ));

-- source_id: add nullable first, backfill below, then set NOT NULL.
-- Cannot use a constant DEFAULT because the correct value (id::text)
-- differs per row.
ALTER TABLE pois
  ADD COLUMN IF NOT EXISTS source_id text;

ALTER TABLE pois
  ADD COLUMN IF NOT EXISTS source_citation text;

ALTER TABLE pois
  ADD COLUMN IF NOT EXISTS confidence_score real NOT NULL DEFAULT 1.0
    CONSTRAINT pois_confidence_score_range
    CHECK (confidence_score BETWEEN 0.0 AND 1.0);

ALTER TABLE pois
  ADD COLUMN IF NOT EXISTS verified boolean NOT NULL DEFAULT false;

ALTER TABLE pois
  ADD COLUMN IF NOT EXISTS additional_sources text[] NOT NULL DEFAULT '{}';

-- Self-referential FK: set to the canonical row's id when this row
-- is a duplicate that has been merged.
ALTER TABLE pois
  ADD COLUMN IF NOT EXISTS merged_into uuid
    REFERENCES pois (id) ON DELETE SET NULL;

ALTER TABLE pois
  ADD COLUMN IF NOT EXISTS imported_at timestamptz NOT NULL DEFAULT now();

-- ────────────────────────────────────────────────────────────
-- 2. Backfill existing rows
--    source_type = 'editorial'  (already set by the DEFAULT above)
--    source_id   = id::text     (the row's own UUID is its provenance key)
--    verified    = true         (all existing rows are hand-curated)
-- ────────────────────────────────────────────────────────────

UPDATE pois
SET
  source_id = id::text,
  verified  = true
WHERE source_id IS NULL;

-- ────────────────────────────────────────────────────────────
-- 3. Enforce NOT NULL on source_id now that every row is populated
-- ────────────────────────────────────────────────────────────

ALTER TABLE pois
  ALTER COLUMN source_id SET NOT NULL;

-- ────────────────────────────────────────────────────────────
-- 4. Indexes
-- ────────────────────────────────────────────────────────────

-- Partial unique: one live row per (source_type, source_id).
-- Merged duplicates are excluded so they can share a source key
-- with the canonical row they were merged into.
CREATE UNIQUE INDEX IF NOT EXISTS pois_source_unique_idx
  ON pois (source_type, source_id)
  WHERE merged_into IS NULL;

CREATE INDEX IF NOT EXISTS pois_source_type_idx
  ON pois (source_type);

-- Sparse index: most rows will have merged_into = NULL.
CREATE INDEX IF NOT EXISTS pois_merged_into_idx
  ON pois (merged_into)
  WHERE merged_into IS NOT NULL;
