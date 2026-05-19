-- =====================================================================
-- 20260518000003_pois_editorial_curation.sql
--
-- WHAT
--   Adds the curator-gate columns for POI TTS generation per the hybrid
--   curation model decision (algorithm continues surfacing; curator gates
--   which surface picks get TTS). The columns:
--
--     editorial_curated        boolean    NULL DEFAULT NULL
--                                        (NULL  = unreviewed
--                                         TRUE  = curator-approved for TTS
--                                         FALSE = curator-rejected for TTS)
--     editorial_curation_note  text       NULL
--     editorial_curated_at     timestamptz NULL
--     editorial_curated_by     text       NULL DEFAULT 'curator'
--     editorial_score_boost    smallint   NOT NULL DEFAULT 0
--                                        (additive bump applied at
--                                         surfacing-time queries to lift
--                                         [+] entries above the floor
--                                         without disturbing the raw
--                                         significance_score)
--
--   `editorial_curated_by` defaults to the string literal 'curator' so
--   import.ts (and any future curation paths) need only fill the timestamp
--   + note. The column is nullable to keep the default override-able.
--
--   `editorial_score_boost` is NOT NULL DEFAULT 0 so the surfacing query
--   can additively combine it (`significance_score + editorial_score_boost`)
--   without COALESCE noise.
--
--   `editorial_curated` stays nullable (3-state) so unreviewed rows are
--   visually distinct from explicit rejections in audit queries — the
--   TTS pipeline gates on `editorial_curated = TRUE` only, so NULL and
--   FALSE both block generation but mean different things.
--
-- WHY
--   Pre-v1, the precache scripts gated on raw significance_score with
--   ad-hoc exclusion lists (precache-top-tier-pois.ts's EXCLUSION_NAMES,
--   precache-popular-routes.ts's --exclude-ids). That worked for one
--   curator-flagged batch of 30 POIs but doesn't scale to the broader
--   surface and doesn't survive across runs. With the hybrid model,
--   the algorithm continues choosing what to surface (significance
--   floors per category_significance_floors), the curator opens a
--   markdown checklist and marks approve/reject/boost per POI, and the
--   TTS pipeline (precache-*.ts) gates on editorial_curated = TRUE.
--
-- BLAST RADIUS
--   - 0 score recomputes.
--   - 0 changes to existing rows (all new columns default to NULL or 0).
--   - Existing precache scripts (precache-top-tier-pois.ts,
--     precache-popular-routes.ts) UNCHANGED by this migration alone.
--     The gate change to those scripts is a follow-up code edit; this
--     migration is the schema enabler.
--
-- REVERSIBILITY
--   Trivial column drops in reverse:
--     ALTER TABLE pois DROP COLUMN editorial_score_boost;
--     ALTER TABLE pois DROP COLUMN editorial_curated_by;
--     ALTER TABLE pois DROP COLUMN editorial_curated_at;
--     ALTER TABLE pois DROP COLUMN editorial_curation_note;
--     ALTER TABLE pois DROP COLUMN editorial_curated;
--   All drops are RESTRICT (no CASCADE) per migration convention; if any
--   future view/function references one of these columns, the drop fails
--   loudly so the dependent gets cleaned up first.
--
-- APPLY
--   Applied via direct pg connection (scripts/poi-import/apply-editorial-curation.mjs)
--   on 2026-05-18 per docs/decisions/2026-05-15-top-tier-poi-first-run.md
--   §Curation Model.
-- =====================================================================

BEGIN;

ALTER TABLE public.pois
  ADD COLUMN IF NOT EXISTS editorial_curated       boolean,
  ADD COLUMN IF NOT EXISTS editorial_curation_note text,
  ADD COLUMN IF NOT EXISTS editorial_curated_at    timestamptz,
  ADD COLUMN IF NOT EXISTS editorial_curated_by    text DEFAULT 'curator',
  ADD COLUMN IF NOT EXISTS editorial_score_boost   smallint NOT NULL DEFAULT 0;

-- Optional index: speeds up the "what's curator-approved?" lookup the
-- TTS gating scripts run. Partial — only the TRUE rows are interesting
-- (NULL/FALSE rows are blocked anyway and dominate the table).
CREATE INDEX IF NOT EXISTS idx_pois_editorial_curated_true
  ON public.pois (id)
  WHERE editorial_curated = TRUE;

COMMENT ON COLUMN public.pois.editorial_curated IS
  'Curator gate for TTS generation. NULL = unreviewed, TRUE = approved, FALSE = rejected. '
  'Precache scripts MUST gate on editorial_curated = TRUE.';
COMMENT ON COLUMN public.pois.editorial_curation_note IS
  'Free-text curator note from the markdown checklist (rejection reason, boost rationale, etc.).';
COMMENT ON COLUMN public.pois.editorial_curated_at IS
  'Timestamp the curation decision landed (set by scripts/curation/import.ts).';
COMMENT ON COLUMN public.pois.editorial_curated_by IS
  'Identity that committed the decision. Defaults to ''curator''; set explicitly by tooling that runs as a different actor.';
COMMENT ON COLUMN public.pois.editorial_score_boost IS
  'Additive bump applied at surfacing-time queries (significance_score + editorial_score_boost). '
  'Set by [+] markings in the curation markdown. Default 0; magnitude curator-chosen per entry.';

COMMIT;

-- ---------------------------------------------------------------------
-- Verification (run separately after COMMIT):
--
--   SELECT column_name, data_type, is_nullable, column_default
--     FROM information_schema.columns
--    WHERE table_schema = 'public'
--      AND table_name   = 'pois'
--      AND column_name LIKE 'editorial_%'
--    ORDER BY column_name;
--   -- Expect 5 rows: editorial_curated (boolean, YES, NULL),
--   --                editorial_curated_at (timestamptz, YES, NULL),
--   --                editorial_curated_by (text, YES, 'curator'),
--   --                editorial_curation_note (text, YES, NULL),
--   --                editorial_score_boost (smallint, NO, 0).
--
--   SELECT indexname FROM pg_indexes
--    WHERE schemaname = 'public' AND tablename = 'pois'
--      AND indexname = 'idx_pois_editorial_curated_true';
--   -- Expect one row.
--
--   SELECT COUNT(*) AS total_live,
--          COUNT(*) FILTER (WHERE editorial_curated = TRUE)  AS approved,
--          COUNT(*) FILTER (WHERE editorial_curated = FALSE) AS rejected,
--          COUNT(*) FILTER (WHERE editorial_curated IS NULL) AS unreviewed,
--          COUNT(*) FILTER (WHERE editorial_score_boost > 0) AS boosted
--     FROM public.pois
--    WHERE merged_into IS NULL;
--   -- Expect: total_live=21906, approved=0, rejected=0, unreviewed=21906, boosted=0
--   --         (no rows touched by this migration; all defaults applied to existing rows).
-- ---------------------------------------------------------------------
