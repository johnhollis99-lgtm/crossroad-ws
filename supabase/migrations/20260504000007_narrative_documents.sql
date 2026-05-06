-- ============================================================
-- Migration: narrative_documents
-- Stores chunked historical text corpora for narrative
-- extraction and future semantic search / RAG use.
-- Sources: wpa-guide, bancroft, cdnc (and future additions).
-- ============================================================

-- ────────────────────────────────────────────────────────────
-- 1. narrative_documents table
-- ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS narrative_documents (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  source       text        NOT NULL,        -- 'wpa-guide' | 'bancroft' | 'cdnc'
  title        text        NOT NULL,        -- section or article title
  date         date,                        -- publication date (NULL if unknown)
  url          text        NOT NULL,        -- canonical source URL; unique per section
  full_text    text,                        -- full section text; stored on chunk_index=0 only
  chunk_index  int         NOT NULL DEFAULT 0,
  chunk_text   text        NOT NULL,        -- ~2000-token excerpt (overlapping window)
  created_at   timestamptz NOT NULL DEFAULT now(),

  UNIQUE (source, url, chunk_index)
);

-- ────────────────────────────────────────────────────────────
-- 2. Indexes
-- ────────────────────────────────────────────────────────────

-- Fast lookup by source (for pipeline re-runs and admin queries)
CREATE INDEX IF NOT EXISTS narrative_documents_source_idx
  ON narrative_documents (source);

-- Date range queries (newspaper archive browsing)
CREATE INDEX IF NOT EXISTS narrative_documents_date_idx
  ON narrative_documents (date)
  WHERE date IS NOT NULL;

-- Full-text search on the chunk content (English dictionary)
CREATE INDEX IF NOT EXISTS narrative_documents_chunk_fts_idx
  ON narrative_documents
  USING gin (to_tsvector('english', chunk_text));

-- ────────────────────────────────────────────────────────────
-- 3. RLS — service role can do everything; anon can read
-- ────────────────────────────────────────────────────────────
ALTER TABLE narrative_documents ENABLE ROW LEVEL SECURITY;

CREATE POLICY "anon_select_narrative_documents"
  ON narrative_documents FOR SELECT
  TO anon
  USING (true);

-- ────────────────────────────────────────────────────────────
-- 4. search_narrative_documents RPC
-- Simple full-text search helper usable from the app or admin UI.
-- ────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION search_narrative_documents(
  query        text,
  p_source     text    DEFAULT NULL,
  p_date_from  date    DEFAULT NULL,
  p_date_to    date    DEFAULT NULL,
  p_limit      int     DEFAULT 20,
  p_offset     int     DEFAULT 0
)
RETURNS TABLE (
  id          uuid,
  source      text,
  title       text,
  date        date,
  url         text,
  chunk_index int,
  chunk_text  text,
  rank        real
)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    nd.id,
    nd.source,
    nd.title,
    nd.date,
    nd.url,
    nd.chunk_index,
    nd.chunk_text,
    ts_rank(to_tsvector('english', nd.chunk_text),
            websearch_to_tsquery('english', query))::real AS rank
  FROM  narrative_documents nd
  WHERE to_tsvector('english', nd.chunk_text) @@ websearch_to_tsquery('english', query)
    AND (p_source    IS NULL OR nd.source = p_source)
    AND (p_date_from IS NULL OR nd.date  >= p_date_from)
    AND (p_date_to   IS NULL OR nd.date  <= p_date_to)
  ORDER BY rank DESC
  LIMIT  p_limit
  OFFSET p_offset;
$$;
