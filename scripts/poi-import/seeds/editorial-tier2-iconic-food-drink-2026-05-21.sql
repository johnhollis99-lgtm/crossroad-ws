-- Editorial POI seed: Tier 2 iconic_local food_drink callouts
-- Per Mode Bifurcation §15.10 amendment (commit a86e493) — food_drink → Bucket B
-- always Local-only. These 9 rows are famous CA food landmarks the import pipeline
-- has filtered out at INSERT time (food_drink floor=999 sentinel since 8b49c80
-- only lets manually-curated rows through).
--
-- Tier 2 means:
--   * iconic_local = TRUE
--   * editorial_curated = FALSE  (Tier 1 reserved for full curator-authored editorial
--                                 like the LA-Mammoth set)
--   * Brief callout via iconic_local_callout.ts template from structured fields
--     (signature_hook + iconic_local_reasons[] + description)
--   * intrinsic_depth = 'brief'  (matches Tier 2 callout register)
--   * significance_score = 9000  (iconic floor sentinel; matches Track B commit 92c0b6e)
--
-- Routing: the pois_narrative_modes_recompute trigger fires on INSERT, calls
-- recompute_narrative_modes(NEW), hits the food_drink Bucket B carveout, and
-- sets narrative_modes = ARRAY['local']. We do NOT set narrative_modes or
-- narrative_modes_override here — the trigger handles them.
--
-- Coordinates source per POI:
--   #1 Philippe the Original         — Wikipedia confirmed (34.059588, -118.236896)
--   #2 Musso & Frank Grill           — OSM Nominatim restaurant entity (importance 0.352)
--   #3 Bob's Big Boy Burbank         — OSM Nominatim restaurant entity (importance 0.338)
--   #4 The Apple Pan                 — OSM Nominatim fast_food amenity (importance 0.340)
--   #5 Original Tommy's              — OSM Nominatim address (house, Beverly/Rampart)
--   #6 Roscoe's (Hollywood/Gower)    — OSM Nominatim address (house, 1514 N Gower)
--   #7 Erick Schat's Bakkery         — OSM Nominatim bakery shop
--   #8 Tadich Grill                  — OSM Nominatim restaurant entity (importance 0.377)
--   #9 Swan Oyster Depot             — Wikipedia confirmed (37.79094, -122.42091)
--
-- Idempotent via ON CONFLICT (source_type, source_id) WHERE merged_into IS NULL DO NOTHING.

BEGIN;

CREATE TEMP TABLE _editorial_tier2_food_drink_stage (
  source_id              TEXT PRIMARY KEY,
  name                   TEXT NOT NULL,
  category_slug          TEXT NOT NULL,
  signature_hook         TEXT NOT NULL,
  iconic_local_reasons   TEXT[] NOT NULL,
  description            TEXT NOT NULL,
  lat                    NUMERIC NOT NULL,
  lng                    NUMERIC NOT NULL,
  address                TEXT NULL,
  significance_score     NUMERIC(6,2) NOT NULL,
  intrinsic_depth        TEXT NOT NULL CHECK (intrinsic_depth IN ('brief','standard','long','long_compressed')),
  trigger_mode           TEXT NOT NULL DEFAULT 'proximity' CHECK (trigger_mode IN ('proximity','closest_approach')),
  source_citation        TEXT NOT NULL
);

INSERT INTO _editorial_tier2_food_drink_stage VALUES

-- #1 Philippe the Original
('editorial:tier2-iconic-food-drink-2026-05-21:01',
 'Philippe the Original',
 'food_drink',
 'claims to have invented the French dip in 1918, when founder Philippe Mathieu accidentally dropped a roll in pan drippings making a sandwich for a policeman',
 ARRAY['wikipedia_article','continuous_operation_since_1908','oldest_la_restaurants_tier','french_dip_origin_claim','sawdust_floors','family_owned_since_1927','pre_dodgers_meeting_spot','signature_dish:french_dip'],
 'Family-owned since 1927 by the Martin and Binder families, currently fourth generation. Cafeteria-style ordering at the long counter, communal tables, sawdust on the floor, newspapers from historical events on the walls. Philippe Mathieu opened it as a French immigrant deli in 1908 at a different address; the French dip story originates from a 1918 incident with a policeman. Cole''s, the other historic claimant to inventing the French dip a mile south, closed in March 2026 after 118 years — Philippe''s is the surviving claimant. Traditional pre-Dodgers-game meeting spot.',
 34.059588, -118.236896,
 '1001 N. Alameda Street, Los Angeles, CA 90012',
 9000, 'brief', 'proximity',
 'Curator-flagged 2026-05-21 (Tier 2 iconic food/drink). Wikipedia: Philippe the Original. Coords Wikipedia-confirmed.'),

-- #2 Musso & Frank Grill
('editorial:tier2-iconic-food-drink-2026-05-21:02',
 'Musso & Frank Grill',
 'food_drink',
 'the oldest restaurant in Hollywood — F. Scott Fitzgerald proofread novels in the booth Charlie Chaplin used after racing horses down Hollywood Boulevard',
 ARRAY['wikipedia_article','oldest_restaurant_in_hollywood','continuous_operation_since_1919','hollywood_walk_of_fame_star_2019','first_restaurant_with_walk_of_fame_star','unchanged_menu_since_jean_rue_1923','family_owned_mosso_descendants','first_us_restaurant_to_serve_fettuccine_alfredo_1927','la_conservancy_historic','signature_dish:thursday_chicken_pot_pie','signature_dish:flannel_cakes'],
 'Opened September 27, 1919 as Frank''s Café by French immigrant Frank Toulet. Renamed Musso & Frank in 1923 after Toulet partnered with Joseph Musso; they hired French chef Jean Rue, whose menu — Welsh rarebit, lobster Thermidor, Thursday-only chicken pot pie, flannel cakes — is largely unchanged a century later. Sold in 1927 to Italian immigrants Joseph Carissimi and John Mosso; still owned by John Mosso''s descendants. The Charlie Chaplin booth (where Chaplin sat with Douglas Fairbanks after horse races down Hollywood Blvd) is still the most-requested seat. Fitzgerald, Hemingway, Faulkner, Bukowski, Sinatra, Bacall, Hopper, Monroe, Taylor — all regulars. First U.S. restaurant to serve fettuccine Alfredo (1927; recipe brought back from Italy by Mary Pickford and Douglas Fairbanks). First restaurant to receive a Hollywood Walk of Fame star (2019 centennial). Dark wood booths, coat hangers, red-jacketed bartenders, pre-digital cash register — the room is essentially unchanged since the 1934 renovation.',
 34.1017630, -118.3350264,
 '6667 Hollywood Boulevard, Los Angeles, CA 90028',
 9000, 'brief', 'proximity',
 'Curator-flagged 2026-05-21 (Tier 2 iconic food/drink). Wikipedia: Musso & Frank Grill. Coords from OSM Nominatim restaurant entity (importance 0.352).'),

-- #3 Bob's Big Boy Burbank
('editorial:tier2-iconic-food-drink-2026-05-21:03',
 'Bob''s Big Boy Burbank',
 'food_drink',
 'oldest surviving Bob''s Big Boy in America — Wayne McAllister''s 1949 Googie-transitional design, Bob Hope''s regular table, the Beatles stopped here on their 1965 American tour looking for a "real American diner"',
 ARRAY['wikipedia_article','california_point_of_historical_interest_1993','oldest_surviving_bobs_big_boy','wayne_mcallister_design_1949','googie_streamline_moderne_transitional_architecture','seventy_foot_neon_tower_sign','beatles_1965_visit','bob_hope_regular','studio_era_hollywood_destination','origin_of_double_decker_burger_franchise','la_conservancy_historic','friday_night_classic_car_show','weekend_carhop_service','signature_dish:double_deck_hamburger'],
 'Built in 1949 by Burbank residents Scott MacDonald and Ward Albert, designed by Wayne McAllister — the architect who shaped postwar California coffee-shop architecture (also designed the original Lawry''s on La Cienega, Burbank''s Smoke House, El Rancho Vegas, the Sands and Desert Inn). Transitional design — 1940s Streamline Moderne curves anticipating 1950s Googie cantilever, anchored by a 70-foot pink-and-white neon sign visible far down Riverside Drive. Oldest remaining Bob''s Big Boy of the chain Bob Wian founded in Glendale in 1936. Originally a drive-in with carhops; carhop service returns Saturday nights. Studio-era regulars included Bob Hope (who lived nearby in Toluca Lake), Mickey Rooney, Debbie Reynolds, Jonathan Winters, Dana Andrews. The Beatles stopped in 1965 — a plaque-marked booth commemorates it (stolen and replaced many times). Designated a California Point of Historical Interest in 1993 after McAllister himself campaigned to save the building from demolition. Friday night classic car show in the lot is part of LA cruising culture; Jay Leno has been known to drop in. Home of the original double-decker hamburger.',
 34.1524877, -118.3460879,
 '4211 W. Riverside Drive, Burbank, CA 91505',
 9000, 'brief', 'proximity',
 'Curator-flagged 2026-05-21 (Tier 2 iconic food/drink). Wikipedia: Bob''s Big Boy. Coords from OSM Nominatim restaurant entity (importance 0.338).'),

-- #4 The Apple Pan
('editorial:tier2-iconic-food-drink-2026-05-21:04',
 'The Apple Pan',
 'food_drink',
 'a 1947 burger counter that has not changed — 26 stools around a U-shaped counter, no tables, no chairs, the same Hickory Burger the Baker family started serving when they opened',
 ARRAY['wikipedia_article','continuous_operation_since_1947','family_owned_baker_family','u_shaped_counter_only','twenty_six_stools_no_tables','apple_pie_namesake','cash_only','la_burger_canon','signature_dish:hickory_burger','signature_dish:steakburger'],
 'Opened 1947 by Alan and Ellen Baker on what was then a quiet stretch of West LA''s Pico Boulevard. The Bakers'' family has owned it continuously since. The room is the platonic American lunch counter — a single U-shaped wooden counter with 26 stools, no tables, the cook visible the whole time. The Hickory Burger (with secret hickory sauce) and Steakburger are unchanged in recipe since opening; the apple pie that gives the place its name is baked daily on premises. Cash only. Open six days a week. The structure is a small clapboard hut that survived West LA''s transformation around it — strip malls and condos rose, the Apple Pan stayed.',
 34.0407099, -118.4278297,
 '10801 W. Pico Boulevard, Los Angeles, CA 90064',
 9000, 'brief', 'proximity',
 'Curator-flagged 2026-05-21 (Tier 2 iconic food/drink). Wikipedia: The Apple Pan. Coords from OSM Nominatim fast_food amenity (importance 0.340).'),

-- #5 Original Tommy's
('editorial:tier2-iconic-food-drink-2026-05-21:05',
 'Original Tommy''s',
 'food_drink',
 'the original 1946 chili burger stand at Beverly and Rampart — Tom Koulax''s walk-up window, his proprietary chili recipe, open 24 hours since opening day',
 ARRAY['wikipedia_article','continuous_operation_since_1946','founder_tom_koulax_greek_immigrant','twenty_four_hour_walk_up_window','no_indoor_seating','proprietary_chili_recipe','la_late_night_canon','iconic_la_chili_burger','signature_dish:chili_burger','signature_dish:chili_dog'],
 'Greek immigrant Tom Koulax opened the flagship in 1946 at the corner of Beverly and Rampart — a small walk-up shack with no indoor seating, open 24 hours, slathering thick proprietary chili on every burger, dog, and order of fries. The Beverly/Rampart flagship still operates exactly the way it did: walk up to the window, order, eat standing at the counter outside or in your car. The chili recipe is famously guarded. Decades of imitators with similar names ("Tommy Hamburger", "Tommi''s Burgers", etc.) attempted to capitalize on the original — the family fought trademark battles to defend the name. Now ~30+ locations across Southern California, but the Beverly/Rampart shack is the canonical pilgrimage.',
 34.0693585, -118.2762730,
 '2575 W. Beverly Boulevard, Los Angeles, CA 90057',
 9000, 'brief', 'proximity',
 'Curator-flagged 2026-05-21 (Tier 2 iconic food/drink). Wikipedia: Original Tommy''s. Coords from OSM Nominatim address (Beverly/Rampart).'),

-- #6 Roscoe's House of Chicken 'N Waffles (Hollywood)
('editorial:tier2-iconic-food-drink-2026-05-21:06',
 'Roscoe''s House of Chicken ''N Waffles (Hollywood)',
 'food_drink',
 'Harlem native Herb Hudson moved to LA in 1975 and opened the first Roscoe''s — Stevie Wonder and Natalie Cole and Redd Foxx made it the LA soul food canon; Obama ordered the #9 in 2011 and it got renamed The Obama',
 ARRAY['wikipedia_article','continuous_operation_since_1975','founder_herb_hudson_harlem_native','inspired_by_wells_supper_club_harlem','la_soul_food_canon','obama_presidential_visit_2011','menu_item_renamed_the_obama','music_industry_celebrity_destination','stevie_wonder_natalie_cole_redd_foxx_patronage','featured_in_jackie_brown','featured_in_swingers','signature_dish:chicken_and_waffles','signature_dish:the_obama_combo_number_9'],
 'Herb Hudson moved from Harlem to LA in 1975 — tail end of the Second Great Migration — and opened the first Roscoe''s. He was inspired by Wells Supper Club in Harlem, a Black-owned spot pairing chicken and waffles that drew the Motown crowd. Hudson used his music industry connections (Stevie Wonder, Natalie Cole, then Redd Foxx) to make the LA version a celebrity hangout. Over 50 years the chain grew to seven locations across LA and Orange counties, but the formula didn''t change: crispy fried chicken, fluffy waffles, syrup and butter, the option of getting them separately or together. President Obama stopped by in 2011 and ordered combo #9 — the menu still calls it "The Obama". Featured in Jackie Brown and Swingers. The Long Beach location is the chronologically-original storefront; the Sunset & Gower Hollywood location is the most iconic in popular memory and where most of the music industry history happened.',
 34.0984455, -118.3221963,
 '1514 N. Gower Street, Los Angeles, CA 90028',
 9000, 'brief', 'proximity',
 'Curator-flagged 2026-05-21 (Tier 2 iconic food/drink). Wikipedia: Roscoe''s House of Chicken and Waffles. Coords from OSM Nominatim address (1514 N Gower St).'),

-- #7 Erick Schat's Bakkery
('editorial:tier2-iconic-food-drink-2026-05-21:07',
 'Erick Schat''s Bakkery',
 'food_drink',
 'the canonical US 395 stop since 1938 — Erick Schat''s Basque sheepherder bread is half the reason people pull off the highway in Bishop',
 ARRAY['wikipedia_article','continuous_operation_since_1938','founder_erick_schat','basque_sourdough_tradition','us_395_eastern_sierra_canon','roadfood_listed','eastern_sierra_pilgrimage_stop','signature_dish:sheepherder_bread'],
 'Founded 1938 in Bishop, the gateway town to the Eastern Sierra on US 395. Erick Schat''s Basque-style sheepherder bread — a dense sourdough loaf with a thick crust, originally baked for the Basque sheepherders who worked the Owens Valley grazing routes — became the canonical pull-off-the-highway stop for anyone driving the 395 corridor between LA and the Eastern Sierra (Mammoth, Mono Lake, Bodie, Yosemite''s east entrance). The bakery still sells the bread baked the original way, alongside expanded sandwich and pastry operations. Open year-round; the smell of baking bread on Main Street is part of the Bishop streetscape. The flagship is the original Bishop store; satellites exist in Mammoth Lakes and Carson City.',
 37.3678518, -118.3957086,
 '763 N. Main Street, Bishop, CA 93514',
 9000, 'brief', 'proximity',
 'Curator-flagged 2026-05-21 (Tier 2 iconic food/drink). Wikipedia: Erick Schat''s Bakkery. Coords from OSM Nominatim bakery shop (763 N Main St).'),

-- #8 Tadich Grill
('editorial:tier2-iconic-food-drink-2026-05-21:08',
 'Tadich Grill',
 'food_drink',
 'California''s oldest restaurant — opened as a coffee stand during the Gold Rush in 1849 by Croatian immigrant John Tadich, family-owned by the Buich family since 1928',
 ARRAY['wikipedia_article','continuous_operation_since_1849','oldest_restaurant_in_california','gold_rush_era_founding','croatian_immigrant_founder','buich_family_owned_since_1928','sf_financial_district_canon','charcoal_broiled_seafood_tradition','signature_dish:cioppino','signature_dish:charcoal_broiled_petrale_sole','signature_dish:hangtown_fry'],
 'Opened in 1849 as a coffee stand serving Gold Rush miners on the SF waterfront. Croatian immigrant John Tadich took it over in the 1880s and gave it the name. The Buich family — also Croatian — bought it in 1928 and have owned it ever since, currently fourth generation. Moved to its present California Street location in 1967 after several earlier addresses, but the room recreates the dark-wood, white-tablecloth, mahogany-booth aesthetic of the 19th-century original. The kitchen still charcoal-broils fish over mesquite — petrale sole, sand dabs, halibut — and is famous for cioppino (the SF-Italian fisherman''s stew), Hangtown fry, and hand-shucked oysters. No reservations except for parties of six or more; suit-and-tie Financial District clientele lines up at the bar at lunch. California''s oldest continuously operating restaurant.',
 37.7934198, -122.3994720,
 '240 California Street, San Francisco, CA 94111',
 9000, 'brief', 'proximity',
 'Curator-flagged 2026-05-21 (Tier 2 iconic food/drink). Wikipedia: Tadich Grill. Coords from OSM Nominatim restaurant entity (importance 0.377).'),

-- #9 Swan Oyster Depot
('editorial:tier2-iconic-food-drink-2026-05-21:09',
 'Swan Oyster Depot',
 'food_drink',
 'the same 18 wooden stools at the same marble counter since 1912 — Sancimino family since 1946, James Beard America''s Classic, Anthony Bourdain''s San Francisco pilgrimage',
 ARRAY['wikipedia_article','continuous_operation_since_1912','jbf_americas_classics','eighteen_stool_marble_counter_since_1912','post_1906_earthquake_reopened','sancimino_family_since_1946','originally_cable_oyster_depot_1890s','cash_only','no_reservations','anthony_bourdain_favorite','sf_seafood_canon','signature_dish:fresh_oysters_on_the_half_shell','signature_dish:crab_louie','signature_dish:cioppino'],
 'Origins trace to the 1890s as Cable Oyster Depot, founded by Danish brothers from the Lausten family. Officially established 1903; rebuilt at 1517 Polk Street in 1912 after the 1906 earthquake destroyed the original. The 18 wooden stools, marble counter, and shop layout have been unchanged since the 1912 rebuild. Sancimino family (Italian-American) bought it in 1946 — Sal Sancimino and cousins — and his descendants still work behind the counter, currently third and fourth generation. James Beard America''s Classics honoree. The line wraps around the block daily; no reservations, cash only, closed Sunday. Menu — oysters on the half shell, crab Louie, clam chowder, ceviche, smoked salmon, cioppino — has barely changed. Famously beloved by Anthony Bourdain; called one of America''s finest seafood spots by many critics. Polk Gulch neighborhood, adjacent to Nob Hill.',
 37.79094, -122.42091,
 '1517 Polk Street, San Francisco, CA 94109',
 9000, 'brief', 'proximity',
 'Curator-flagged 2026-05-21 (Tier 2 iconic food/drink). Wikipedia: Swan Oyster Depot. Coords Wikipedia-confirmed.');

-- Verify stage count
DO $$
DECLARE
  staged_count INT;
BEGIN
  SELECT COUNT(*) INTO staged_count FROM _editorial_tier2_food_drink_stage;
  IF staged_count <> 9 THEN
    RAISE EXCEPTION 'Expected 9 staged rows, got %', staged_count;
  END IF;
  RAISE NOTICE 'Stage table: % rows ready for upsert.', staged_count;
END $$;

-- Sanity check: food_drink slug must resolve to a real poi_categories row.
DO $$
DECLARE
  missing_slugs TEXT;
BEGIN
  SELECT string_agg(DISTINCT s.category_slug, ', ') INTO missing_slugs
    FROM _editorial_tier2_food_drink_stage s
    LEFT JOIN public.poi_categories c ON c.slug = s.category_slug
    WHERE c.id IS NULL;
  IF missing_slugs IS NOT NULL THEN
    RAISE EXCEPTION 'Missing poi_categories slugs: %. Fix slugs or add categories before seed runs.', missing_slugs;
  END IF;
END $$;

-- INSERT into pois with editorial_curated=false (Tier 2) and iconic_local=true.
-- Joins poi_categories on .slug (not .name) — matches LA-Mammoth seed convention.
-- Idempotent via the partial unique index on (source_type, source_id) WHERE merged_into IS NULL.
-- narrative_modes + narrative_modes_override intentionally NOT set — the
-- pois_narrative_modes_recompute trigger fires on INSERT, hits the food_drink
-- Bucket B carveout (commit a86e493), and sets narrative_modes = ARRAY['local'].
INSERT INTO public.pois (
  name,
  category_id,
  description,
  location,
  significance_score,
  intrinsic_depth,
  trigger_mode,
  iconic_local,
  iconic_local_reasons,
  signature_hook,
  source_type,
  source_id,
  source_citation,
  confidence_score,
  verified,
  editorial_curated,
  imported_at
)
SELECT
  s.name,
  c.id AS category_id,
  s.description,
  ST_SetSRID(ST_MakePoint(s.lng, s.lat), 4326)::geography AS location,
  s.significance_score,
  s.intrinsic_depth,
  s.trigger_mode,
  TRUE AS iconic_local,
  s.iconic_local_reasons,
  s.signature_hook,
  'editorial' AS source_type,
  s.source_id,
  s.source_citation,
  1.0 AS confidence_score,
  TRUE AS verified,
  FALSE AS editorial_curated,
  now() AS imported_at
FROM _editorial_tier2_food_drink_stage s
JOIN public.poi_categories c ON c.slug = s.category_slug
ON CONFLICT (source_type, source_id) WHERE merged_into IS NULL DO NOTHING;

-- Report inserted
DO $$
DECLARE
  inserted_count INT;
  iconic_count INT;
  food_drink_count INT;
  local_routed_count INT;
BEGIN
  SELECT COUNT(*) INTO inserted_count
    FROM public.pois
    WHERE source_type = 'editorial'
      AND source_id LIKE 'editorial:tier2-iconic-food-drink-2026-05-21:%';
  SELECT COUNT(*) INTO iconic_count
    FROM public.pois
    WHERE source_type = 'editorial'
      AND source_id LIKE 'editorial:tier2-iconic-food-drink-2026-05-21:%'
      AND iconic_local = TRUE;
  SELECT COUNT(*) INTO food_drink_count
    FROM public.pois p
    JOIN public.poi_categories c ON c.id = p.category_id
    WHERE p.source_type = 'editorial'
      AND p.source_id LIKE 'editorial:tier2-iconic-food-drink-2026-05-21:%'
      AND c.slug = 'food_drink';
  SELECT COUNT(*) INTO local_routed_count
    FROM public.pois
    WHERE source_type = 'editorial'
      AND source_id LIKE 'editorial:tier2-iconic-food-drink-2026-05-21:%'
      AND narrative_modes = ARRAY['local'];
  RAISE NOTICE 'Tier 2 food_drink seed: inserted=% iconic_local=% food_drink_slug=% routed_to_local=%',
    inserted_count, iconic_count, food_drink_count, local_routed_count;
END $$;

COMMIT;
