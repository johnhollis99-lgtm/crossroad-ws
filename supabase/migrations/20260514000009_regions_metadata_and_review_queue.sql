-- =====================================================================
-- 20260514000009_regions_metadata_and_review_queue.sql
--
-- WHAT
--   Two related additions for Phase E1 (region imports):
--
--   1. Adds `regions.metadata jsonb NOT NULL DEFAULT '{}'`. Holds per-row
--      structured side-data that doesn't fit in the existing columns.
--      Initial use case: Native Land Digital rows store the boundary
--      ethics disclaimer + attribution data as structured fields rather
--      than embedded in description prose:
--
--        {
--          "boundary_disclaimer": "Approximate, educational. See native-land.ca for context.",
--          "attribution_required": true,
--          "attribution_url": "https://native-land.ca/"
--        }
--
--      Phase H narration templates read from metadata (cleanly typed)
--      rather than parsing the description text. Description stays
--      narration-ready prose.
--
--      Defaults to '{}' so the column is non-null without forcing every
--      importer to specify metadata explicitly.
--
--   2. Creates `region_review_queue` table for Phase E1d (named valleys)
--      to log candidates that couldn't be loaded — usually because no
--      polygon was found in OSM, Wikidata P3896, or the editorial
--      fallback set. Mirrors the shape of `venue_classification_review`
--      (migration 20260504000016 §7) for consistency:
--
--        id              uuid PK
--        region_id       uuid → regions(id) ON DELETE SET NULL  (nullable;
--                          set if/when a region is eventually created
--                          from this candidate)
--        candidate_name  text NOT NULL
--        proposed_type   text  (free-form; maps to region_type enum
--                          values but kept loose so reviewers can record
--                          unclear cases)
--        source          text  ('usgs','epa','native_land','wikidata',
--                          'editorial' — same value space as regions.source)
--        source_id       text  (e.g. Q-number for a Wikidata valley)
--        reason          text NOT NULL  (free-form: 'no_polygon',
--                          'invalid_polygon', 'ambiguous_nesting', etc.)
--        source_hint     jsonb  (structured context: SPARQL row, OSM
--                          lookup attempts, etc.)
--        review_status   text NOT NULL DEFAULT 'pending'
--                          CHECK ∈ ('pending','resolved','rejected')
--        resolved_at     timestamptz
--        resolved_by     text
--        created_at      timestamptz NOT NULL DEFAULT now()
--
--   RLS: enabled with no policies. Matches the venue_classification_review
--   pattern — admin/migration-only access via service_role.
--
--   Index on review_status (mirrors venue_classification_review).
--
--   Live audit (2026-05-14 pre-apply):
--     regions.metadata column:         does not exist
--     region_review_queue table:       does not exist
--
-- APPLIED
--   Applied via direct pg connection on 2026-05-14. Two-step apply:
--     1. regions.metadata column added in an out-of-band partial apply
--        (date unknown; verified PRESENT 2026-05-14 with shape
--        jsonb NOT NULL DEFAULT '{}'::jsonb)
--     2. Remainder (region_review_queue table + CHECK + index + RLS)
--        applied 2026-05-14 via the same direct-pg script. Idempotent
--        re-apply of the full file no-op'd part 1 (IF NOT EXISTS) and
--        created the queue table for part 2.
--   Verified: region_review_queue exists with CHECK
--   `region_review_queue_review_status_check`, indexes
--   region_review_queue_pkey + idx_region_review_queue_status, RLS
--   enabled (no policies = service_role only).
-- =====================================================================

BEGIN;

-- ---------------------------------------------------------------------
-- Part 1: regions.metadata
-- ---------------------------------------------------------------------
ALTER TABLE public.regions
  ADD COLUMN IF NOT EXISTS metadata jsonb NOT NULL DEFAULT '{}'::jsonb;

-- ---------------------------------------------------------------------
-- Part 2: region_review_queue table
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.region_review_queue (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  region_id       uuid        REFERENCES public.regions(id) ON DELETE SET NULL,
  candidate_name  text        NOT NULL,
  proposed_type   text,
  source          text,
  source_id       text,
  reason          text        NOT NULL,
  source_hint     jsonb,
  review_status   text        NOT NULL DEFAULT 'pending',
  resolved_at     timestamptz,
  resolved_by     text,
  created_at      timestamptz NOT NULL DEFAULT now()
);

-- review_status CHECK — locked to the 3-value enum (mirrors
-- venue_classification_review). Idempotent via pg_constraint lookup.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
      FROM pg_constraint
     WHERE conrelid = 'public.region_review_queue'::regclass
       AND conname  = 'region_review_queue_review_status_check'
  ) THEN
    ALTER TABLE public.region_review_queue
      ADD CONSTRAINT region_review_queue_review_status_check
      CHECK (review_status IN ('pending', 'resolved', 'rejected'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_region_review_queue_status
  ON public.region_review_queue (review_status);

ALTER TABLE public.region_review_queue ENABLE ROW LEVEL SECURITY;
-- No policies — service_role only (matches venue_classification_review
-- posture in migration 20260504000016).

COMMIT;

-- ---------------------------------------------------------------------
-- Verification (run separately after COMMIT):
--
--   -- Part 1: metadata column
--   SELECT column_name, data_type, is_nullable, column_default
--     FROM information_schema.columns
--    WHERE table_schema = 'public'
--      AND table_name   = 'regions'
--      AND column_name  = 'metadata';
--   -- Expect: metadata | jsonb | NO | '{}'::jsonb
--
--   -- Part 2: region_review_queue
--   SELECT to_regclass('public.region_review_queue');
--   -- Expect: public.region_review_queue
--
--   SELECT conname, pg_get_constraintdef(oid)
--     FROM pg_constraint
--    WHERE conrelid = 'public.region_review_queue'::regclass
--      AND contype  = 'c'
--    ORDER BY conname;
--   -- Expect: region_review_queue_review_status_check
--   --   CHECK ((review_status = ANY (ARRAY['pending','resolved','rejected'])))
--
--   SELECT indexname FROM pg_indexes
--    WHERE schemaname = 'public'
--      AND tablename  = 'region_review_queue'
--    ORDER BY indexname;
--   -- Expect: idx_region_review_queue_status, region_review_queue_pkey
--
--   SELECT relrowsecurity
--     FROM pg_class
--    WHERE oid = 'public.region_review_queue'::regclass;
--   -- Expect: t
-- ---------------------------------------------------------------------
