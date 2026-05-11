-- 20260511000001_pois_poi_type_check.sql
--
-- Resolves drift catalog entry 5.17 (the `poi_type` half — `visibility_radius_miles`
-- gets documented in CLAUDE.md only, no schema change needed since its float
-- range is open by design).
--
-- Adds a CHECK constraint locking `pois.poi_type` to the three values
-- that actually exist in production today: 'point', 'area', 'viewpoint'.
--
-- Pre-flight (verified 2026-05-11 against staging via direct pg):
--   SELECT poi_type, count(*) FROM public.pois GROUP BY poi_type;
--   → point: 23,899 (21,883 active + 2,016 merged)
--   → area: 14 (all active)
--   → viewpoint: 9 (all active)
--   No other values. Live default is 'point'.
--
-- If a new value is needed in the future, extend this CHECK in a follow-up
-- migration. Importers that emit a new value will fail loudly at INSERT
-- time, which is the intended posture per 5.17 ("Action: add a CHECK
-- constraint on poi_type once the value space is enumerated").

BEGIN;

ALTER TABLE public.pois
  ADD CONSTRAINT pois_poi_type_check
  CHECK (poi_type IN ('point', 'area', 'viewpoint'));

COMMIT;

-- Verification (re-run post-apply):
--   SELECT conname, pg_get_constraintdef(oid)
--     FROM pg_constraint
--    WHERE conrelid='public.pois'::regclass AND conname='pois_poi_type_check';
--   → CHECK ((poi_type = ANY (ARRAY['point'::text, 'area'::text, 'viewpoint'::text])))
