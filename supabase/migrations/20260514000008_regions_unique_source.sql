-- =====================================================================
-- 20260514000008_regions_unique_source.sql
--
-- WHAT
--   Adds a partial UNIQUE index on `regions(source, source_id) WHERE
--   source_id IS NOT NULL` so the region-import pipeline's upsert helper
--   can use `ON CONFLICT (source, source_id) WHERE source_id IS NOT NULL
--   DO UPDATE …` for idempotent re-runs.
--
--   Without this index, every importer rerun would INSERT duplicates
--   instead of updating in place.
--
--   The index is PARTIAL (WHERE source_id IS NOT NULL) because the
--   `source_id` column on `regions` is nullable by design (per migration
--   20260514000005_regions.sql §3.1: "editorial regions with hand-curated
--   manual polygons have no external ID"). Excluding NULL rows from the
--   uniqueness check lets multiple editorial regions coexist with
--   source_id=NULL — though in practice, Phase E1d will give every
--   editorial valley a `valley-<kebab-name>` source_id, so this NULL
--   carve-out is reserved for future hand-curated regions.
--
--   Partial unique index is preferred over plain UNIQUE because:
--   (a) Postgres treats multiple NULLs as distinct by default (16+
--       NULLS DISTINCT semantics) — plain UNIQUE would have the same
--       runtime behavior, but the partial form documents the intent
--       and avoids indexing NULL rows entirely.
--   (b) The ON CONFLICT inference syntax `ON CONFLICT (cols) WHERE pred`
--       maps 1:1 to the partial index predicate, making the upsert
--       intention explicit at call sites.
--
--   ⚠️ Caller obligation: the upsert helper in
--   `scripts/region-import/lib/upsert.ts` must include the matching
--   `WHERE source_id IS NOT NULL` predicate on its ON CONFLICT clause.
--   PostgreSQL won't infer a partial index as the conflict arbiter
--   without it. (Helper is updated in the same commit as this migration.)
--
--   Live audit (2026-05-14 pre-apply):
--     regions table:   created 2026-05-14 (migration 20260514000005)
--     regions rowcount: 0
--     existing indexes: idx_regions_polygon (GIST), idx_regions_type,
--                       regions_pkey
--     NO existing unique constraint or index on (source, source_id)
--
-- APPLIED
--   Applied via direct pg connection on 2026-05-14. Verified: index
--   regions_source_source_id_unique exists as a partial UNIQUE btree on
--   (source, source_id) WHERE source_id IS NOT NULL.
-- =====================================================================

BEGIN;

CREATE UNIQUE INDEX IF NOT EXISTS regions_source_source_id_unique
  ON public.regions (source, source_id)
  WHERE source_id IS NOT NULL;

COMMIT;

-- ---------------------------------------------------------------------
-- Verification (run separately after COMMIT):
--
--   SELECT indexname, indexdef
--     FROM pg_indexes
--    WHERE schemaname = 'public'
--      AND tablename  = 'regions'
--      AND indexname  = 'regions_source_source_id_unique';
--   -- Expect:
--   --   regions_source_source_id_unique
--   --   CREATE UNIQUE INDEX regions_source_source_id_unique
--   --     ON public.regions USING btree (source, source_id)
--   --     WHERE (source_id IS NOT NULL)
--
--   -- Smoke test (regions table is empty, so this should succeed twice
--   -- without any conflict — confirms NULL source_id rows are allowed
--   -- to coexist):
--   -- INSERT INTO regions (region_type, name, description, polygon, source)
--   --   VALUES ('named_valley_or_basin', 'Test 1', 'desc', ST_GeogFromText('SRID=4326;MULTIPOLYGON(((0 0, 0 1, 1 1, 1 0, 0 0)))'), 'editorial');
--   -- INSERT INTO regions (region_type, name, description, polygon, source)
--   --   VALUES ('named_valley_or_basin', 'Test 2', 'desc', ST_GeogFromText('SRID=4326;MULTIPOLYGON(((0 0, 0 1, 1 1, 1 0, 0 0)))'), 'editorial');
--   -- (Both succeed; both have source_id IS NULL, both skip the partial index.)
-- ---------------------------------------------------------------------
