-- ============================================================================
-- 20260521000005_landmark_category_slug.sql
--
-- Adds `landmark` slug to public.poi_categories for the Tier 1 iconic landmark
-- workstream (Madonna Inn / Salvation Mountain / Cabazon Dinosaurs / Roy's
-- Motel & Cafe and future iconic landmarks that don't fit existing slugs like
-- nature, geology, history, food_drink, etc.).
--
-- Routing intent: the landmark slug does NOT trigger any Bucket A or Bucket B
-- guard in public.recompute_narrative_modes. It falls through to Bucket C,
-- where rows with editorial_curated=TRUE route to {soul, local} via the
-- existing pois_narrative_modes_recompute BEFORE INSERT OR UPDATE trigger.
--
-- Cross-refs:
--   - addendum §15.10 (Editorial Gate three-bucket framework)
--   - commit a0d994f (Layer 3 trigger install)
--   - commit a86e493 (food_drink Bucket B carveout — separate path, not invoked here)
-- ============================================================================

BEGIN;

INSERT INTO public.poi_categories
  (slug, display_name, parent_id, relevant_driving, relevant_hiking, relevant_city, sort_order)
VALUES
  ('landmark', 'Iconic Landmark', NULL, true, true, true, 13);

COMMIT;

-- ============================================================================
-- Verification (run manually post-apply; not executed by migration runner):
--
--   SELECT id, slug, display_name, parent_id,
--          relevant_driving, relevant_hiking, relevant_city, sort_order
--   FROM public.poi_categories WHERE slug = 'landmark';
--     -- expect one row, sort_order=13, all three relevance flags true.
--
--   SELECT COUNT(*) FROM public.poi_categories;
--     -- expect 19 (was 18 pre-migration).
--
-- recompute_narrative_modes(p) trace for a row with
--   category_id → 'landmark', editorial_curated=TRUE, is_venue=FALSE,
--   parent_poi_id=NULL, source_type='editorial':
--
--   1. parent_poi_id IS NOT NULL          → false (skip parent venue lookup)
--   2. v_slug := 'landmark'
--   3. v_parent_venue_type IN (...)        → NULL not in set → false
--   4. is_venue AND venue_type IN (...)    → false (not a venue)
--   5. v_slug = 'food_drink'               → false (Bucket B miss)
--   6. v_slug IN ('nature','geology')      → false (Bucket A trap 1 miss)
--   7. v_slug='history' AND source_type='editorial'
--        AND NOT is_venue AND parent_poi_id IS NULL → false (slug mismatch)
--   8. COALESCE(editorial_curated, FALSE)  → TRUE
--        → RETURN ARRAY['soul','local']
--
-- Same row with editorial_curated=FALSE → falls through ELSE → RETURN ARRAY['local'].
-- ============================================================================
