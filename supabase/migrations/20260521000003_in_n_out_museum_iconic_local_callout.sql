-- In-N-Out Museum iconic_local callout (Tier 2-style; history + override path)
-- Per addendum §15.10. Target row: id='cab2ee6c-bc2d-412f-894c-ddddcd766b7f'
-- ("In-N-Out Burger Museum"), currently category=history, source_type=osm,
-- significance=5.00, narrative_modes={soul} (stale Layer 1+2 history-slug default).
--
-- This is the override path for a category-edge case: the row is a museum
-- about a restaurant, not an active restaurant — keep category=history;
-- the food_drink Bucket B carveout (20260521000002) is restaurant-targeted.
-- We lock narrative_modes={local} via narrative_modes_override=TRUE so the
-- iconic_local + history-category row surfaces only in Local mode.
--
-- Single-step UPDATE: the trigger wrapper short-circuits on
-- NEW.narrative_modes_override = TRUE and returns NEW unchanged, preserving
-- the explicit narrative_modes value from this UPDATE statement. (Confirmed
-- via pg_get_functiondef on public.pois_narrative_modes_recompute_trigger.)
--
-- Path (B) decision: location intentionally NOT touched. Triangulation against
-- OSM Nominatim geocode (34.0693780, -117.9753572 for "13752 Francisquito Ave"),
-- Wikipedia ("SW corner of I-10 × Francisquito Ave"), and the row's existing
-- OSM coords (34.0689842, -117.975096) all converge at the same ~50m
-- neighborhood; no relocation needed.
--
-- start_date column does not exist on pois.* — skip per spec ("if column exists").

BEGIN;

UPDATE public.pois
SET
  iconic_local = TRUE,
  editorial_curated = FALSE,
  significance_score = 9000,
  narrative_modes = ARRAY['local'],
  narrative_modes_override = TRUE,
  signature_hook = '1948 birthplace of California''s first drive-thru burger stand — Harry and Esther Snyder''s original ~100-sq-ft store was demolished for the I-10 freeway expansion; this 2014 replica next to the original site is now a museum',
  iconic_local_reasons = ARRAY[
    'wikipedia_article',
    'birthplace_of_in_n_out_burger',
    'start_date_1948_original',
    'replica_museum_opened_2014',
    'first_drive_thru_burger_stand_in_california',
    'founders_harry_and_esther_snyder',
    'original_two_way_speaker_box_innovation',
    'demolished_for_i_10_freeway',
    'museum_not_functional_restaurant',
    'in_n_out_brand_origin_landmark',
    'open_thursday_through_sunday_eleven_to_two'
  ],
  description = 'The original In-N-Out — store #1 — was a roughly 100-square-foot drive-thru burger stand opened in 1948 by Harry and Esther Snyder at the corner of Francisquito and Garvey Avenues in Baldwin Park. It was California''s first drive-thru burger stand and pioneered the two-way speaker box (so customers ordered before pulling to the window, eliminating queues). The original was demolished during the I-10 freeway expansion. In March 2014, In-N-Out built a meticulous full-scale replica on the original footprint and opened it as a museum. The replica is open Thursday through Sunday, 11am to 2pm, for tours and photos only — it is not a functional restaurant (a working In-N-Out is a few hundred yards down the street). The replica preserves the vintage signage, red-and-white awnings, original-style cigarette machine, and the speaker box. Birthplace of a brand that grew from one stand to over 400 locations across the American West, family-owned for three generations and never franchised.'
WHERE id = 'cab2ee6c-bc2d-412f-894c-ddddcd766b7f'
  AND merged_into IS NULL;

COMMIT;

-- ============================================================
-- Verification (run separately after apply):
-- ============================================================
-- (a) Row state:
--   SELECT id, name, ST_AsText(location), pc.slug AS category_slug,
--          iconic_local, editorial_curated, narrative_modes::text,
--          narrative_modes_override, significance_score
--   FROM public.pois p
--   LEFT JOIN public.poi_categories pc ON pc.id = p.category_id
--   WHERE p.id = 'cab2ee6c-bc2d-412f-894c-ddddcd766b7f';
--
-- (b) Callout fields:
--   SELECT signature_hook,
--          array_length(iconic_local_reasons, 1) AS reasons_count,
--          LEFT(description, 200) || '...' AS description_preview
--   FROM public.pois
--   WHERE id = 'cab2ee6c-bc2d-412f-894c-ddddcd766b7f';
--
-- (c) Sanity check against Nominatim authoritative geocode (Path B):
--   SELECT ST_Distance(location::geography, ST_MakePoint(-117.9753572, 34.0693780)::geography) AS dist_from_nominatim_geocode_m
--   FROM public.pois WHERE id = 'cab2ee6c-bc2d-412f-894c-ddddcd766b7f';
