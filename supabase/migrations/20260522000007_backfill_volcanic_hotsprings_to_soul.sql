-- 20260522000007_backfill_volcanic_hotsprings_to_soul.sql
--
-- Migration Batch 1 / Migration 7 — Soul Bucket A expansion: volcanic + hot_springs.
--
-- Two coordinated changes per Q5.B:
--
-- (1) Backfill: UPDATE narrative_modes on all volcanic + hot_springs +
--     geology + nature rows that currently carry 'local' but not 'soul',
--     replacing 'local' with 'soul'. Prior-agent Phase 1 verified:
--       volcanic     : 42 local / 0 soul
--       hot_springs  : 59 local / 0 soul
--     The replace-not-add semantic matches the spec literal
--     (array_replace, not array_append) so any sub-population that
--     accidentally landed as ['local'] becomes ['soul'] not ['soul','local'].
--
-- (2) Trigger function patch: extend the Bucket A branch of
--     `public.recompute_narrative_modes(public.pois)` so volcanic +
--     hot_springs slugs route to {soul} alongside nature + geology.
--     Without this patch, a future trigger-column UPDATE on any of these
--     rows would re-derive narrative_modes via the resolver, which
--     currently returns Bucket C ({local} default) for volcanic +
--     hot_springs — undoing the backfill silently.
--
-- Per CLAUDE.md drift catalog 5.90: function signature unchanged
-- (recompute_narrative_modes(pois) returns text[]). The signature stays
-- the same as 20260521000002, so CREATE OR REPLACE is technically safe;
-- per Q5.B we use CREATE OR REPLACE to match the pattern of the previous
-- two iterations (20260521000001, 20260521000002). All other branches
-- preserved verbatim from 20260521000002's body.
--
-- Per CLAUDE.md migration conventions:
--   * Schema-qualified table names
--   * BEGIN/COMMIT wrapped
--   * Trailing verification query
--
-- Note (Batch 2 backlog, per Q5-bonus, NOT addressed here): the trigger
-- function's wrapper `pois_narrative_modes_recompute_trigger` honors
-- `NEW.narrative_modes_override = TRUE` by short-circuiting (RETURN NEW),
-- but the resolver function itself never reads p.narrative_modes_override.
-- Net effect: override works only for INSERTs and UPDATEs where the
-- trigger fires. Worth either (a) honoring the override in the resolver
-- (return p.narrative_modes unchanged when override=true) or (b) retiring
-- the column. Curator decides in Batch 2.

BEGIN;

-- ── (1) Backfill: volcanic + hot_springs + geology + nature → {soul} ─────
-- Per operator's spec: array_replace local → soul on rows that have local
-- but not soul. The four-category WHERE clause covers volcanic + hot_springs
-- (the actually-broken categories) plus geology + nature (precautionary —
-- defensive against any sub-population that drifted from {soul}).
UPDATE public.pois
SET narrative_modes = array_replace(narrative_modes, 'local', 'soul')
WHERE category_id IN (
  SELECT id FROM public.poi_categories
  WHERE slug IN ('volcanic','hot_springs','geology','nature')
)
AND 'local' = ANY(narrative_modes)
AND NOT ('soul' = ANY(narrative_modes));

-- ── (2) Trigger function patch ───────────────────────────────────────────
-- Bucket A.1 widened to include volcanic + hot_springs alongside the
-- existing nature + geology. All other branches verbatim from the v2
-- (20260521000002) trigger function.
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
  IF v_slug = 'food_drink' THEN
    RETURN ARRAY['local'];
  END IF;

  -- Bucket A: contemplative content
  -- v3 (2026-05-22, Batch 1 Migration 7): volcanic + hot_springs added.
  IF v_slug IN ('nature','geology','volcanic','hot_springs') THEN
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
  'Editorial Gate framework (addendum §15). Three buckets: A always {soul} '
  '(nature/geology/volcanic/hot_springs + editorial-historic-Manzanar-class), '
  'B always {local} (theme-park/NP/museum-complex venues and children + food_drink), '
  'C editorial-gated (default {local}; {soul,local} when editorial_curated=TRUE). '
  'v3 (2026-05-22): volcanic + hot_springs promoted to Bucket A.';

COMMIT;

-- ============================================================
-- Verification (run after COMMIT):
-- ============================================================
-- (v1) Backfill: volcanic + hot_springs rows now carry 'soul':
--   SELECT pc.slug, COUNT(*)::int AS n,
--          COUNT(*) FILTER (WHERE 'soul' = ANY(p.narrative_modes))::int AS soul_count,
--          COUNT(*) FILTER (WHERE 'local' = ANY(p.narrative_modes))::int AS local_count
--     FROM public.pois p
--     JOIN public.poi_categories pc ON pc.id = p.category_id
--    WHERE pc.slug IN ('volcanic','hot_springs','geology','nature')
--      AND p.merged_into IS NULL
--    GROUP BY pc.slug
--    ORDER BY pc.slug;
--   -- Expect for volcanic + hot_springs: soul_count == n, local_count == 0.
--
-- (v2) Trigger function: simulate a fresh INSERT for a volcanic POI and
-- confirm resolver returns {soul} not {local}. Cleanest test is an
-- explicit SELECT against the resolver:
--   SELECT public.recompute_narrative_modes(p)::text AS modes, pc.slug
--     FROM public.pois p
--     JOIN public.poi_categories pc ON pc.id = p.category_id
--    WHERE pc.slug IN ('volcanic','hot_springs')
--      AND p.merged_into IS NULL
--    LIMIT 5;
--   -- Expect: every row returns '{soul}'.
--
-- (v3) Function COMMENT updated to v3:
--   SELECT obj_description('public.recompute_narrative_modes(public.pois)'::regprocedure);
--   -- Expect: "...v3 (2026-05-22): volcanic + hot_springs promoted to Bucket A."
