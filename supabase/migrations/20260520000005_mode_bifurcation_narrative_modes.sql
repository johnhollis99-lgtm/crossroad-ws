-- Mode Bifurcation Layer 1+2: per-row narrative_modes routing
-- Per addendum §15.3, replaces slug-level-only routing with per-row tagging.
-- Layer 1: slug defaults. Layer 2: heuristic-based promotion/override.
-- Layer 3 (curator override) follows as a separate migration after review.

BEGIN;

-- Schema: add narrative_modes column with check constraint
ALTER TABLE public.pois
ADD COLUMN narrative_modes text[] NOT NULL DEFAULT '{}'
CONSTRAINT pois_narrative_modes_check
CHECK (narrative_modes <@ ARRAY['soul','local']::text[]);

CREATE INDEX idx_pois_narrative_modes ON public.pois USING GIN (narrative_modes);

-- Layer 1: slug defaults (one UPDATE, all active rows)
-- Slug lookup via JOIN on poi_categories (pois.category_slug doesn't exist;
-- slug lives on poi_categories.slug, joined via pois.category_id uuid FK).
UPDATE public.pois p
SET narrative_modes = CASE pc.slug
  WHEN 'nature'         THEN ARRAY['soul']
  WHEN 'history'        THEN ARRAY['soul']
  WHEN 'architecture'   THEN ARRAY['soul','local']
  WHEN 'dams'           THEN ARRAY['soul']
  WHEN 'art'            THEN ARRAY['soul','local']
  WHEN 'hidden_gems'    THEN ARRAY['local']
  WHEN 'geology'        THEN ARRAY['soul']
  WHEN 'local_culture'  THEN ARRAY['soul','local']
  WHEN 'bridges'        THEN ARRAY['soul']
  WHEN 'food_drink'     THEN ARRAY['local']
  WHEN 'viewpoint'      THEN ARRAY['soul']
  WHEN 'engineering'    THEN ARRAY['soul']
  WHEN 'recreation'     THEN ARRAY['local']
  WHEN 'hot_springs'    THEN ARRAY['soul']
  WHEN 'mining'         THEN ARRAY['soul']
  WHEN 'native_history' THEN ARRAY['soul']
  WHEN 'volcanic'       THEN ARRAY['soul']
  ELSE ARRAY['soul']   -- defensive: any unknown slug defaults to Soul
END
FROM public.poi_categories pc
WHERE p.merged_into IS NULL
  AND pc.id = p.category_id;

-- Layer 2 Rule 1: venues are tourist destinations → ADD 'local' (additive)
UPDATE public.pois
SET narrative_modes = array_append(narrative_modes, 'local')
WHERE merged_into IS NULL
  AND is_venue = TRUE
  AND NOT 'local' = ANY(narrative_modes);

-- Layer 2 Rule 2: high-significance Soul-listed historic places are also touristed
UPDATE public.pois
SET narrative_modes = array_append(narrative_modes, 'local')
WHERE merged_into IS NULL
  AND source_type IN ('nrhp', 'state_landmark', 'wikidata')
  AND significance_score >= 70
  AND 'soul' = ANY(narrative_modes)
  AND NOT 'local' = ANY(narrative_modes);

-- Layer 2 Rule 3: theme-park children / zoo exhibits → Local-only (OVERRIDE)
UPDATE public.pois AS child
SET narrative_modes = ARRAY['local']
FROM public.pois AS parent
WHERE child.merged_into IS NULL
  AND child.parent_poi_id = parent.id
  AND parent.venue_type IN ('theme_park', 'zoo_aquarium')
  AND child.narrative_modes != ARRAY['local'];

-- Layer 2 Rule 4: curated Local picks → ADD 'local'
UPDATE public.pois
SET narrative_modes = array_append(narrative_modes, 'local')
WHERE merged_into IS NULL
  AND (iconic_local = TRUE OR editorial_curated = TRUE)
  AND NOT 'local' = ANY(narrative_modes);

-- Verification: no POI should have empty narrative_modes after Layer 1+2
DO $$
DECLARE
  total_active INTEGER;
  soul_only INTEGER;
  local_only INTEGER;
  both_modes INTEGER;
  empty_modes INTEGER;
BEGIN
  SELECT COUNT(*) INTO total_active FROM public.pois WHERE merged_into IS NULL;
  SELECT COUNT(*) INTO soul_only FROM public.pois WHERE merged_into IS NULL AND narrative_modes = ARRAY['soul'];
  SELECT COUNT(*) INTO local_only FROM public.pois WHERE merged_into IS NULL AND narrative_modes = ARRAY['local'];
  SELECT COUNT(*) INTO both_modes FROM public.pois WHERE merged_into IS NULL AND 'soul' = ANY(narrative_modes) AND 'local' = ANY(narrative_modes);
  SELECT COUNT(*) INTO empty_modes FROM public.pois WHERE merged_into IS NULL AND cardinality(narrative_modes) = 0;

  RAISE NOTICE 'Mode Bifurcation Layer 1+2 verification:';
  RAISE NOTICE '  Total active POIs: %', total_active;
  RAISE NOTICE '  Soul-only:   %', soul_only;
  RAISE NOTICE '  Local-only:  %', local_only;
  RAISE NOTICE '  Both modes:  %', both_modes;
  RAISE NOTICE '  Empty modes (should be 0): %', empty_modes;

  IF empty_modes > 0 THEN
    RAISE EXCEPTION 'Verification failed: % POIs have empty narrative_modes', empty_modes;
  END IF;
END $$;

COMMIT;
