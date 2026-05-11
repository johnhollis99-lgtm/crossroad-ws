-- 20260511000003_pois_source_drop.sql
--
-- Resolves drift catalog entry 5.16 (`pois.source` legacy column is
-- redundant with `source_type`).
--
-- Drops the `pois.source text NOT NULL DEFAULT 'curated'` column. It
-- predates the source-provenance migration 20260504000005, which
-- introduced `source_type` (CHECK enum: osm / wikidata / nrhp /
-- state_landmark / gnis / narrative_extracted / editorial /
-- user_contributed) plus `source_id`, `source_citation`,
-- `confidence_score`, etc. `source_type` is now the authoritative
-- provenance column and `source` carries no distinguishing information.
--
-- Pre-flight (verified 2026-05-11 against staging via direct pg):
--
--   SELECT source, count(*) FROM public.pois GROUP BY source;
--   → curated: 23,922  (100% schema-default — no row has ever held
--                       any other value, including all 7,007 OSM and
--                       12,650 Wikidata imports)
--
--   SELECT source_type, count(*) FROM public.pois GROUP BY source_type;
--   → wikidata: 12,650
--   → osm: 7,007
--   → nrhp: 3,087
--   → state_landmark: 1,060
--   → editorial: 118
--   (every row has a non-NULL source_type — provenance is fully captured
--    by the post-20260504000005 columns)
--
--   pg_depend lookup for column attnum: 1 row, the column's own
--   pg_attrdef (DEFAULT 'curated'::text) — auto-cascades on column
--   drop. Zero view / RPC / trigger / generated-column dependencies.
--
--   Code-side audit (rg over app/, server/, scripts/, admin/, lib/):
--   zero readers of `pois.source`. Importer's COLS list
--   (scripts/poi-import/lib/upsert.ts:18-23) omits the column entirely.
--   Other `source` matches resolve to different columns
--   (narrative_documents.source, poi_review_queue source citation,
--   importer-internal r.source selecting OSM/Wikidata/NRHP source keys).
--
--   Only migration-side write of a literal value:
--   20260504000000_la_tahoe_more_pois.sql writes `'curated'` explicitly,
--   matching the default. This is a forward-only seed file; re-running
--   it post-drop would fail at the INSERT (cosmetic — schema is
--   forward-only, no replay path).
--
-- Default RESTRICT (no CASCADE) on the DROP so any dependency the
-- pre-flight missed fails loudly at migration time rather than
-- silently nuking dependents.

BEGIN;

ALTER TABLE public.pois
  DROP COLUMN source;

COMMIT;

-- Verification (re-run post-apply):
--   SELECT column_name
--     FROM information_schema.columns
--    WHERE table_schema = 'public'
--      AND table_name = 'pois'
--      AND column_name = 'source';
--   → 0 rows
