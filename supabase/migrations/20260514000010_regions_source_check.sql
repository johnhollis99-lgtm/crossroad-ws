-- =====================================================================
-- 20260514000010_regions_source_check.sql
--
-- WHAT
--   Two coupled changes to `regions.source`:
--
--   1. Re-label the 11 existing E1a rows from 'usgs' → 'cgs'.
--      The California Geological Survey (CGS) is the proximate publisher
--      of the Geomorphic Provinces dataset; the federal USGS reservation
--      is for any future federal-source regions. Separating the two
--      makes provenance unambiguous when narration templates cite
--      authority.
--
--   2. Lock `regions.source` to a 10-value enum via CHECK constraint:
--        'osm', 'wikidata', 'nrhp', 'chl', 'gnis',
--        'usgs', 'cgs', 'epa', 'native_land', 'editorial'
--      This is the wider set than the TS RegionSource enum had at
--      scaffolding time. Anticipates 'chl' (CA Historical Landmarks)
--      and 'nrhp' (National Register of Historic Places) for future
--      region layers — e.g., historic-district boundaries — and the
--      already-extant 'gnis' / 'osm' for named-feature regions.
--
--   Order: UPDATE first (rewrites the 11 rows), then ADD CONSTRAINT
--   (validates the corrected vocabulary). Both wrapped in a single
--   BEGIN/COMMIT so a partial apply rolls back cleanly.
--
--   Live audit (2026-05-14 pre-apply):
--     SELECT source, COUNT(*) FROM regions GROUP BY source;
--     → usgs: 11   (all geomorphic_province rows from E1a)
--     existing constraints on regions: no CHECK on source
--
--   Expected post-apply:
--     SELECT source, COUNT(*) FROM regions GROUP BY source;
--     → cgs: 11
--     regions_source_check constraint present
--
--   Companion code change (same commit): lib/types.ts RegionSource enum
--   widened to match the 10-value CHECK. The upsert helper does not
--   need to change — it passes `source` through opaquely.
--
-- APPLIED
--   Applied via direct pg connection on 2026-05-14. Verified: 11 rows
--   relabeled 'usgs' → 'cgs' (region_type='geomorphic_province');
--   regions_source_check CHECK present, locked to the 10-value enum.
--   Partial unique index regions_source_source_id_unique still functions
--   correctly with the new source slug (key column unchanged).
-- =====================================================================

BEGIN;

-- Step 1: relabel the existing 11 USGS geomorphic_province rows.
-- Scoped by region_type to avoid touching any future 'usgs'-sourced rows
-- of other region_types that may legitimately stay federal-USGS.
UPDATE public.regions
   SET source = 'cgs'
 WHERE source = 'usgs'
   AND region_type = 'geomorphic_province';

-- Step 2: lock the vocabulary. Idempotent via pg_constraint lookup —
-- PG doesn't support IF NOT EXISTS on CHECK adds.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
      FROM pg_constraint
     WHERE conrelid = 'public.regions'::regclass
       AND conname  = 'regions_source_check'
  ) THEN
    ALTER TABLE public.regions
      ADD CONSTRAINT regions_source_check
      CHECK (source IN (
        'osm',
        'wikidata',
        'nrhp',
        'chl',
        'gnis',
        'usgs',
        'cgs',
        'epa',
        'native_land',
        'editorial'
      ));
  END IF;
END $$;

COMMIT;

-- ---------------------------------------------------------------------
-- Verification (run separately after COMMIT):
--
--   SELECT source, COUNT(*) FROM public.regions
--    GROUP BY source ORDER BY source;
--   -- Expect:
--   --   cgs: 11
--
--   SELECT conname, pg_get_constraintdef(oid)
--     FROM pg_constraint
--    WHERE conrelid = 'public.regions'::regclass
--      AND conname  = 'regions_source_check';
--   -- Expect: regions_source_check
--   --   CHECK ((source = ANY (ARRAY['osm','wikidata','nrhp','chl','gnis',
--   --     'usgs','cgs','epa','native_land','editorial'])))
--
--   -- Confirm the partial unique index still functions correctly across
--   -- the rename (source slug changed; source_id stayed the same).
--   SELECT source, source_id, name FROM public.regions
--    WHERE region_type = 'geomorphic_province'
--    ORDER BY name LIMIT 3;
--   -- Expect: cgs / basin-and-range / Basin and Range  (etc.)
-- ---------------------------------------------------------------------
