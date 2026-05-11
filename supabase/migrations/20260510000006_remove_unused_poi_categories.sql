-- 20260510000006_remove_unused_poi_categories.sql
--
-- Removes two poi_categories rows that had no source mapping and no
-- realistic path to populate:
--
--   alpine     — Overlapped semantically with `nature` (peak/summit).
--                The OSM importer already classifies natural=peak as
--                'nature' with tag 'summit', and Wikidata Q8502 (mountain)
--                does the same. No additional differentiation needed.
--
--   wind_solar — OSM `power=generator` is theoretically mappable but
--                vanishingly sparse with notability signals in CA, and
--                no narrative/editorial path is planned.
--
-- See docs/audit-poi-categories.md for the full per-slug analysis.
--
-- Pre-flight verification (confirmed 2026-05-10):
--   SELECT pc.slug, count(p.id)
--     FROM poi_categories pc
--     LEFT JOIN pois p ON p.category_id = pc.id  -- include merged_into rows
--    WHERE pc.slug IN ('alpine','wind_solar')
--    GROUP BY pc.slug;
--   → alpine: 0, wind_solar: 0

BEGIN;

-- Defensive: refuse to delete if any POI references either category, even a
-- merged secondary. This makes the migration idempotent and safe to re-run.
DO $$
DECLARE
  ref_count int;
BEGIN
  SELECT count(*) INTO ref_count
    FROM pois p
    JOIN poi_categories pc ON p.category_id = pc.id
   WHERE pc.slug IN ('alpine', 'wind_solar');

  IF ref_count > 0 THEN
    RAISE EXCEPTION
      'Refusing to delete poi_categories rows: % POI(s) still reference alpine or wind_solar',
      ref_count;
  END IF;
END $$;

DELETE FROM poi_categories
 WHERE slug IN ('alpine', 'wind_solar');

COMMIT;

-- Verification (re-run post-apply):
--   SELECT slug FROM poi_categories WHERE slug IN ('alpine','wind_solar');
-- Expected: 0 rows.
