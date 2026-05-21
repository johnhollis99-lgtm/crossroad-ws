-- food_drink → Bucket B carveout (v2 trigger amendment)
-- Per addendum §15.10 amendment. All food_drink POIs route to {local}
-- regardless of editorial_curated, significance_score, is_venue, or
-- parent_poi_id. The narrative_modes_override per-row escape hatch remains
-- available for the Madonna-Inn-class iconic-class opt-in workstream (deferred).
--
-- Three corrections from spec text:
--   * Table is public.poi_categories (not categories).
--   * Force-recompute via SET source_type = source_type — the trigger fires
--     on UPDATE OF (editorial_curated, parent_poi_id, source_type, category_id,
--     significance_score, is_venue, venue_type, narrative_modes_override).
--     updated_at is NOT in that list; a SET updated_at = updated_at UPDATE
--     would touch the column but not fire the trigger.
--   * Override escape hatch is narrative_modes_override = TRUE (column is
--     boolean NOT NULL DEFAULT FALSE; never null).

BEGIN;

-- (a) CREATE OR REPLACE recompute_narrative_modes with food_drink Bucket B clause
CREATE OR REPLACE FUNCTION public.recompute_narrative_modes(p public.pois)
RETURNS text[]
LANGUAGE plpgsql
STABLE
AS $func$
DECLARE
  v_parent_venue_type text;
  v_slug text;
BEGIN
  IF p.parent_poi_id IS NOT NULL THEN
    SELECT pp.venue_type INTO v_parent_venue_type
    FROM public.pois pp WHERE pp.id = p.parent_poi_id;
  END IF;

  SELECT pc.slug INTO v_slug
  FROM public.poi_categories pc WHERE pc.id = p.category_id;

  -- Bucket B: parent context wins over own slug
  IF v_parent_venue_type IN ('theme_park','amusement_park','national_park','museum_complex') THEN
    RETURN ARRAY['local'];
  END IF;
  IF p.is_venue AND p.venue_type IN ('theme_park','amusement_park') THEN
    RETURN ARRAY['local'];
  END IF;
  -- Bucket B carveout (v2, 2026-05-21): food_drink always Local-only.
  -- Escape hatch: narrative_modes_override = TRUE on the row (short-circuited
  -- in the BEFORE trigger wrapper, not this resolver).
  IF v_slug = 'food_drink' THEN
    RETURN ARRAY['local'];
  END IF;

  -- Bucket A: contemplative content
  IF v_slug IN ('nature','geology') THEN
    RETURN ARRAY['soul'];
  END IF;
  IF v_slug = 'history'
     AND p.source_type = 'editorial'
     AND NOT p.is_venue
     AND p.parent_poi_id IS NULL THEN
    RETURN ARRAY['soul'];
  END IF;

  -- Bucket C: editorial-gated
  IF COALESCE(p.editorial_curated, FALSE) THEN
    RETURN ARRAY['soul','local'];
  ELSE
    RETURN ARRAY['local'];
  END IF;
END;
$func$;

COMMENT ON FUNCTION public.recompute_narrative_modes(public.pois) IS
  'Editorial Gate framework (addendum §15). Three buckets: A always {soul} (nature/geology + editorial-historic-Manzanar-class), B always {local} (theme-park/NP/museum-complex venues and children + food_drink), C editorial-gated (default {local}; {soul,local} when editorial_curated=TRUE). v2 (2026-05-21): food_drink Bucket B carveout — narrative_modes_override is the per-row escape hatch.';

-- (b) Force recompute on all food_drink rows via no-op self-assign on a
-- trigger-list column. The pois_narrative_modes_recompute trigger fires on
-- UPDATE OF source_type (among the 8 trigger columns); the trigger function
-- calls the new resolver above and sets narrative_modes per food_drink Bucket B.
UPDATE public.pois SET source_type = source_type
WHERE category_id IN (SELECT id FROM public.poi_categories WHERE slug = 'food_drink');

COMMIT;

-- ============================================================
-- Verification (run separately after apply):
-- ============================================================
-- (c1) All food_drink rows resolve to {local}:
--   SELECT COUNT(*)::int, narrative_modes::text
--   FROM public.pois
--   WHERE category_id IN (SELECT id FROM public.poi_categories WHERE slug='food_drink')
--   GROUP BY narrative_modes;
--
-- (c2) editorial_curated=TRUE food_drink rows still resolve to {local}:
--   SELECT id, name, editorial_curated, narrative_modes::text
--   FROM public.pois
--   WHERE category_id IN (SELECT id FROM public.poi_categories WHERE slug='food_drink')
--     AND editorial_curated = TRUE
--   LIMIT 10;
--
-- (c3) Override-locked food_drink rows (expect 0 today; override workstream
-- not started yet):
--   SELECT id, name, narrative_modes::text, narrative_modes_override
--   FROM public.pois
--   WHERE category_id IN (SELECT id FROM public.poi_categories WHERE slug='food_drink')
--     AND narrative_modes_override = TRUE;
