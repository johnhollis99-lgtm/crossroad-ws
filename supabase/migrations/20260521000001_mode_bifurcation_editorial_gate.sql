-- Mode Bifurcation Layer 3 — Editorial Gate framework
-- Per addendum §15 Editorial Gate (sub-section landing in a follow-on docs commit).
-- Three buckets applied via dynamic trigger:
--   A — Always Soul-only {soul}: nature/geology + editorial-historic-Manzanar-class
--   B — Always Local-only {local}: theme-park venues + children of TP/NP/museum-complex
--   C — Editorial-gated: default {local}, editorial_curated → {soul,local}
--
-- Migration order: schema column → resolver function → trigger function → trigger
-- attach → one-time apply to top 200 → surgical override for 2 OSM Manzanar-class
-- rows. Sub-200 rows untouched; trigger applies framework to all rows going forward
-- when any of the 8 trigger columns is updated.

BEGIN;

-- 1. Schema: narrative_modes_override column for curator-locked per-row exceptions
ALTER TABLE public.pois
ADD COLUMN IF NOT EXISTS narrative_modes_override boolean NOT NULL DEFAULT FALSE;

COMMENT ON COLUMN public.pois.narrative_modes_override IS
  'When TRUE, the editorial-gate trigger leaves narrative_modes alone. Used for curator-locked per-row overrides that survive future trigger fires.';

-- 2. Bucket-resolver function (read-only, STABLE)
CREATE OR REPLACE FUNCTION public.recompute_narrative_modes(p public.pois)
RETURNS text[]
LANGUAGE plpgsql
STABLE
AS $func$
DECLARE
  v_parent_venue_type text;
  v_slug text;
BEGIN
  -- Lookup parent venue_type if parent_poi_id is set
  IF p.parent_poi_id IS NOT NULL THEN
    SELECT pp.venue_type INTO v_parent_venue_type
    FROM public.pois pp WHERE pp.id = p.parent_poi_id;
  END IF;

  -- Lookup own slug
  SELECT pc.slug INTO v_slug
  FROM public.poi_categories pc WHERE pc.id = p.category_id;

  -- Bucket B FIRST: parent context wins over own slug
  -- (b1) child of theme_park / amusement_park / national_park / museum_complex
  IF v_parent_venue_type IN ('theme_park','amusement_park','national_park','museum_complex') THEN
    RETURN ARRAY['local'];
  END IF;
  -- (b2) theme_park / amusement_park venue parent
  IF p.is_venue AND p.venue_type IN ('theme_park','amusement_park') THEN
    RETURN ARRAY['local'];
  END IF;

  -- Bucket A: contemplative content
  -- (a1) nature/geology slugs (Patterns 6, 7, 9)
  IF v_slug IN ('nature','geology') THEN
    RETURN ARRAY['soul'];
  END IF;
  -- (a2) editorial historic sites Manzanar-class (Pattern 8)
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
  'Editorial Gate framework (addendum §15). Three buckets: A always {soul} (nature/geology + editorial-historic-Manzanar-class), B always {local} (theme-park/NP/museum-complex venues and children), C editorial-gated (default {local}; {soul,local} when editorial_curated=TRUE).';

-- 3. Trigger function: bypasses recomputation if narrative_modes_override=TRUE
CREATE OR REPLACE FUNCTION public.pois_narrative_modes_recompute_trigger()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $func$
BEGIN
  -- Manual override wins: trigger leaves narrative_modes alone
  IF NEW.narrative_modes_override = TRUE THEN
    RETURN NEW;
  END IF;
  NEW.narrative_modes := public.recompute_narrative_modes(NEW);
  RETURN NEW;
END;
$func$;

-- 4. Trigger attachment: BEFORE INSERT OR UPDATE OF trigger columns
DROP TRIGGER IF EXISTS pois_narrative_modes_recompute ON public.pois;
CREATE TRIGGER pois_narrative_modes_recompute
BEFORE INSERT OR UPDATE OF
  editorial_curated,
  parent_poi_id,
  source_type,
  category_id,
  significance_score,
  is_venue,
  venue_type,
  narrative_modes_override
ON public.pois
FOR EACH ROW
EXECUTE FUNCTION public.pois_narrative_modes_recompute_trigger();

-- 5. One-time apply to top-200 rows: touch a trigger column (no-op self-assign)
-- to force the BEFORE trigger to fire and recompute narrative_modes.
WITH top200_ids AS (
  SELECT id FROM public.pois
  WHERE merged_into IS NULL
  ORDER BY significance_score DESC, id ASC
  LIMIT 200
)
UPDATE public.pois SET source_type = source_type
WHERE id IN (SELECT id FROM top200_ids);

-- 6. Surgical override: 2 OSM-sourced Manzanar-class rows that fall through the
-- Bucket A.2 predicate (which requires source_type='editorial'). Curator has
-- editorial_curated=TRUE on these; lock to {soul} permanently via the override
-- flag so future trigger fires preserve the {soul} assignment.
UPDATE public.pois
SET narrative_modes = ARRAY['soul'], narrative_modes_override = TRUE
WHERE name IN ('Mission Chumash Barracks', 'Kuruvungna Springs')
  AND source_type = 'osm'
  AND editorial_curated = TRUE
  AND merged_into IS NULL;

COMMIT;
