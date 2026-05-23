-- 20260522000006_pois_add_roadstory_anchor.sql
--
-- Migration Batch 1 / Migration 6 — pois.roadstory_anchor FK.
--
-- Per addendum §6: a POI can be the curated anchor for a RoadStory. The
-- forward-link from POI → RoadStory lives here on `pois.roadstory_anchor`
-- so the lookahead worker, while ranking POIs, can join in one hop to
-- discover whether a POI is a roadstory anchor and prefer that narration
-- over the standard POI-narration row.
--
-- Reverse-link (RoadStory → POI) already exists on
-- `roadstories.anchor_poi_id` (Migration 4). The two FKs are independent —
-- a POI can be roadstory_anchor for at most one RoadStory in v1, but the
-- schema permits multiple RoadStories anchored at the same POI (different
-- anchor pairings are valid editorial output). The curator workflow
-- coordinates which RoadStory's id lives in `pois.roadstory_anchor`.
--
-- ON DELETE SET NULL: if a RoadStory is deleted, the POI just loses its
-- anchor pointer (POI stays alive — it still has its base narration).
-- Same pattern as `trips.narrator_id ON DELETE SET NULL` in
-- 20260504000001_trips_table.sql.
--
-- Partial index: most POIs won't be RoadStory anchors. A partial index
-- WHERE roadstory_anchor IS NOT NULL keeps the index tight (likely <500
-- rows even at full editorial scale).
--
-- Per CLAUDE.md migration conventions:
--   * Schema-qualified table names
--   * BEGIN/COMMIT wrapped
--   * Trailing verification query

BEGIN;

ALTER TABLE public.pois
  ADD COLUMN roadstory_anchor uuid
    REFERENCES public.roadstories(id) ON DELETE SET NULL;

CREATE INDEX idx_pois_roadstory_anchor
  ON public.pois (roadstory_anchor)
  WHERE roadstory_anchor IS NOT NULL;

COMMENT ON COLUMN public.pois.roadstory_anchor IS
  'FK to the RoadStory this POI is the canonical anchor for. NULL for non-anchor POIs. '
  'Reverse-link from roadstories.anchor_poi_id; curator workflow coordinates which '
  'RoadStory id lives here when multiple RoadStories share a POI anchor.';

COMMIT;

-- ============================================================
-- Verification (run after COMMIT):
-- ============================================================
-- (v1) Column exists + FK shape:
--   SELECT column_name, data_type, is_nullable
--     FROM information_schema.columns
--    WHERE table_schema='public' AND table_name='pois'
--      AND column_name='roadstory_anchor';
--   -- Expect: uuid, YES (nullable).
--
-- (v2) FK constraint:
--   SELECT conname, pg_get_constraintdef(oid)
--     FROM pg_constraint
--    WHERE conrelid='public.pois'::regclass
--      AND pg_get_constraintdef(oid) LIKE '%roadstory_anchor%';
--   -- Expect: FOREIGN KEY (roadstory_anchor) REFERENCES public.roadstories(id)
--   --         ON DELETE SET NULL.
--
-- (v3) Partial index:
--   SELECT indexdef FROM pg_indexes
--    WHERE schemaname='public' AND indexname='idx_pois_roadstory_anchor';
--   -- Expect: ON public.pois (roadstory_anchor) WHERE (roadstory_anchor IS NOT NULL).
