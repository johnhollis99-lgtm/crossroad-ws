-- Editorial POI seed: Tier 1 iconic_local landmarks (4 California icons)
-- Per Mode Bifurcation §15.10 Editorial Gate framework (commits a0d994f + 0cdaafd)
-- and the new `landmark` category slug (commit 0be4031). These 4 rows are the
-- first end-to-end INSERT-path test of:
--   * category=landmark (slug introduced 0be4031, not present in any prior seed)
--   * Bucket C dual-mode routing — landmark slug falls through Bucket A history-
--     editorial and Bucket B venue checks; editorial_curated=TRUE engages the
--     Bucket C default-to-{soul,local} branch in recompute_narrative_modes(pois).
--
-- Tier 1 means:
--   * iconic_local = TRUE
--   * editorial_curated = TRUE  (vs Tier 2 callouts where editorial_curated = FALSE)
--   * Full curator-authored ~500-word descriptions (vs Tier 2 brief callouts)
--   * intrinsic_depth = 'long'  (matches editorial_curated+sig>=75 G1 heuristic)
--   * significance_score = 9000  (iconic floor sentinel; same as Tier 2 + Madonna-class)
--
-- Routing: the pois_narrative_modes_recompute trigger fires on INSERT, calls
-- recompute_narrative_modes(NEW), walks the bucket guards, falls through to
-- the editorial_curated branch, and sets narrative_modes = ARRAY['soul','local'].
-- We do NOT set narrative_modes or narrative_modes_override here — the trigger
-- handles them. Verification block at COMMIT confirms.
--
-- Coordinates source per POI:
--   #1 Madonna Inn          — Wikipedia confirmed (35.2675, -120.67472)
--   #2 Salvation Mountain   — Wikipedia confirmed (33.25417, -115.47250)
--   #3 Cabazon Dinosaurs    — Wikipedia confirmed (33.92028, -116.77278)
--   #4 Roy's Motel & Cafe   — Wikipedia infobox (34.558982, -115.743917);
--                              Nominatim cross-check at National Trails Highway
--                              centerline returned 34.5580459, -115.7491326
--                              (~500m drift — road centerline vs. building complex).
--
-- Idempotent via ON CONFLICT (source_type, source_id) WHERE merged_into IS NULL DO NOTHING.

BEGIN;

CREATE TEMP TABLE _editorial_tier1_landmarks_stage (
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

INSERT INTO _editorial_tier1_landmarks_stage VALUES

-- #1 Madonna Inn
('editorial:tier1-iconic-landmarks-2026-05-21:01',
 'Madonna Inn',
 'landmark',
 'Alex Madonna''s pink kitsch fantasy on Highway 101 — 110 themed rooms hand-built by a construction magnate who hated bland motels, opened Christmas Eve 1958 and never stopped expanding',
 ARRAY['wikipedia_article','continuous_operation_since_1958','founded_by_alex_and_phyllis_madonna','alex_madonna_construction_magnate_self_designed','one_hundred_ten_themed_rooms_named_not_numbered','pink_color_palette_signature','swiss_alps_exterior_western_kitsch_interior','caveman_room_rock_waterfall_shower','famous_mens_room_waterfall_urinal','pink_champagne_cake_signature_dish','1500_acre_property','highway_101_central_coast_landmark','cal_poly_parent_rite_of_passage','celebrity_destination','alex_madonna_died_2004_family_owned_continuous','signature_dish:pink_champagne_cake','signature_dish:gold_rush_steakhouse_steaks'],
 'The Madonna Inn opened Christmas Eve, 1958, with twelve rooms. Alex Madonna, the construction magnate who built it, gave them away free that first night to the travelers who showed up — by his telling, the concrete hadn''t set yet. By 1959 there were forty rooms; the main inn followed in 1960. Today the property spans 1,500 acres on the west side of Highway 101, on the lower flank of Cerro San Luis Obispo, with 110 individually themed rooms and the Madonna family still running it through Madonna Enterprises.

Alex Madonna built much of California''s Central Coast — highway interchanges, bridges, original sections of California 46. He didn''t hire an architect for the Inn; he designed it himself, with Phyllis, room by room. Phyllis later told the story: Alex hated bland motels. After years on the road, he decided to build the opposite — a hotel where every room was a deliberate choice. They bought ten acres at silent auction in 1954 and broke ground four years later.

The 110 rooms are named, not numbered. Caveman has rock walls, rock ceiling, rock floor, and a waterfall shower set into the boulders. Yahoo is a barnyard tableau in primary colors. Wigwam is a teepee-shaped fantasy. Love Nest, Just Heaven, Cloud Nine, Mini-Maxi, Anniversary, Irish Hills, Cabin Still — each a self-contained world. Materials came from Alex''s own construction operation: granite boulders weighing up to two hundred tons from the San Luis Mountain directly behind the property, hand-carved Bavarian woodwork by an immigrant master named Alexander Zeller, hammered copper, gilded cupids. The Hearst family — neighbors up the coast at San Simeon — gifted a hand-carved white marble balustrade as a favor return.

The architectural vocabulary is a deliberate collision. The exterior is pseudo-Swiss Alps — steep roofs, dark timbered eaves — on California oak grassland with cattle visible on the back acres. The interior is Gold Rush Western: stone fireplaces, wagon-wheel chandeliers, leather and brass and antler. Pink unifies both: pink booths, pink carpets, pink lampposts, pink trash cans, pink uniforms. The signature dessert is Pink Champagne Cake. The men''s room at the Alex Madonna Gold Rush Steakhouse has a motion-sensor waterfall urinal that visitors stop to photograph even when they''re not staying overnight.

Critical reception has been bipolar for seven decades. Modernist architect Richard Neutra visited and was dismayed. Design critics have called it "a fantasy run amok" and "a Hansel-and-Gretel complex." Charles Phoenix, the Los Angeles humorist who chronicles mid-century Americana, describes it as "rural ranch-gone-castle" and "unapologetically original" — firing on so many cylinders of classic and kitschy American pop culture that it resonates with the creative class. John Wayne, Clint Eastwood, Dolly Parton, Debbie Harry have all stayed. For Central Coast parents whose kids attend Cal Poly San Luis Obispo, staying once is considered a rite of passage.

Alex Madonna died in April 2004. The Inn has modernized in small increments since then — quiet upgrades, new restaurant concepts, the Silver Bar Cocktail Lounge — while preserving every signature surface. The original twelve rooms still rent at premium rates. The family has never franchised and never replicated. There is only one Madonna Inn.',
 35.2675, -120.67472,
 '100 Madonna Road, San Luis Obispo, CA 93405',
 9000, 'long', 'proximity',
 'Curator-flagged 2026-05-21 (Tier 1 iconic landmarks). Wikipedia: Madonna Inn. Coords Wikipedia-confirmed.'),

-- #2 Salvation Mountain
('editorial:tier1-iconic-landmarks-2026-05-21:02',
 'Salvation Mountain',
 'landmark',
 'Leonard Knight''s 28-year painted desert mountain — adobe, hay bales, and half a million gallons of donated paint, hand-built alone to spread "God Is Love" across the Imperial Valley',
 ARRAY['wikipedia_article','leonard_knight_folk_artist_creator','single_creator_obsession_28_years','started_1984','knight_died_2014_age_82','folk_art_society_designation_2000','congressional_record_2002_barbara_boxer','into_the_wild_2007_film_appearance','slab_city_entrance_imperial_valley','half_million_gallons_donated_paint','adobe_hay_bale_construction','god_is_love_central_message','sinners_prayer_inscribed','salvation_mountain_inc_volunteer_maintenance','imperial_county_toxic_nightmare_dropped_1994','painted_yellow_brick_road_pathway','signature_feature:white_cross_at_peak'],
 'Leonard Knight arrived in Niland, California, in 1984. He was 53 and had spent the previous decade trying to launch a hot-air balloon — a 200-foot patchwork sewn from donated nylon, painted with the words "God Is Love" in bubble letters. Despite ten years of effort it never got off the ground; dry rot kept finding the seams. He gave up on the balloon and decided to build something the desert wouldn''t take back.

He chose the entrance to Slab City — a decommissioned Marine Corps base east of the Salton Sea, its concrete pads now occupied by snowbirds in RVs and disenfranchised year-round residents. The land was county-owned and unmonitored. Knight squatted, set up a converted truck as his home, and began work on a mound of adobe and discarded paint.

He worked alone for nearly thirty years. The materials were what he could scavenge: adobe mud he mixed by hand, hay bales for armature, and donated house paint — eventually estimated at over half a million gallons across all coats. He shaped the mound into a hillside about fifty feet tall and a hundred yards wide, covering five acres. He carved a yellow-painted "yellow brick road" path that winds up to the cross at the peak. He painted Biblical verses across the surface — the Sinner''s Prayer in flowing script, "God Is Love" in the bubble letters from his failed balloon, waterfalls in primary colors, hearts, flowers, doves.

In 1994 Imperial County declared the mountain a "toxic nightmare" and prepared to bulldoze it, citing lead in the paint. Knight had soil tests done at his own expense; they showed no hazardous levels. Supporters sent letters and petitions. The county dropped the campaign. In 2000 the Folk Art Society of America designated Salvation Mountain a folk art site worthy of preservation. In 2002 Senator Barbara Boxer entered it into the Congressional Record as "a unique and visionary sculpture, a national treasure, profoundly strange and beautifully accessible." In 2007 it appeared in the film *Into the Wild*; Knight himself played a brief role on the mountain''s slope.

Knight slept in his converted truck on the site for decades. He greeted every visitor personally — sometimes hundreds in a weekend — handed out small painted gifts, talked about the message. He never charged admission, never sold anything, never moved indoors. The desert continuously broke down his work, and he repainted continuously. The mountain was always under maintenance and always being completed.

His health failed in his late seventies. He left the site in 2011 for an assisted living facility, and died February 10, 2014, at age 82. Salvation Mountain Inc., a volunteer nonprofit organized in the years before his death, has maintained the site since — repainting where the desert eats through, stabilizing the adobe, hosting visiting school groups. Imperial County designated the mountain a site of "Historical Significance" in 2024. It remains free to visit, twelve miles south of Niland off Highway 111.',
 33.25417, -115.47250,
 'Beal Road, Niland, CA 92257',
 9000, 'long', 'proximity',
 'Curator-flagged 2026-05-21 (Tier 1 iconic landmarks). Wikipedia: Salvation Mountain. Coords Wikipedia-confirmed.'),

-- #3 Cabazon Dinosaurs
('editorial:tier1-iconic-landmarks-2026-05-21:03',
 'Cabazon Dinosaurs',
 'landmark',
 'Claude Bell, a 68-year-old Knott''s Berry Farm sculptor, started building Dinny in 1964 to attract diners to his Wheel Inn — a 150-foot concrete brontosaurus made from salvaged I-10 construction steel, finished eleven years later, made famous by Pee-wee in 1985',
 ARRAY['wikipedia_article','claude_k_bell_sculptor_knotts_berry_farm','construction_1964_to_1986','dinny_apatosaurus_150_feet_long_45_feet_tall','mr_rex_tyrannosaurus_65_feet_tall','scavenged_i_10_construction_steel_and_rebar','total_cost_300000_bells_own_money','pee_wees_big_adventure_1985_film_appearance','mtv_videos_coca_cola_commercials_the_wizard','roadside_attraction_canon','novelty_architecture','claude_bell_died_1988_age_91_anaheim','lucy_the_elephant_atlantic_city_inspiration','signature_feature:dinny_gift_shop_in_belly','signature_feature:mr_rex_internal_observation_deck','wheel_inn_diner_demolished_2016'],
 'Claude K. Bell was 68 when he started building Dinny. He had been a sculptor for forty years — first as a teenager in Atlantic City making sand figures on the boardwalk, then for the New Jersey amusement industry, then for Walter Knott populating Knott''s Berry Farm''s Ghost Town. He had watched the wind undo his sand sculptures for years and resented the impermanence.

In 1964, at the Wheel Inn — the diner he owned in Cabazon along Interstate 10 — he decided to build something the wind couldn''t reach. The inspiration was Lucy the Elephant, the 65-foot wooden building from his Atlantic City childhood. The pretext was traffic for the diner. The real reason was permanence.

He began with steel mesh skeleton and shotcrete, scavenging rebar and structural steel from the construction of Interstate 10 itself, which was being widened through Cabazon at the time. Dinny took eleven years. Finished in 1975, he is 150 feet long, 45 feet tall, 150 tons of concrete, and was — Bell claimed — "the first dinosaur in history, so far as I know, to be used as a building." The hollow body contained a small gift shop and museum. Bell had planned for Dinny''s eyes to glow at night and the mouth to spit fire "to scare the dickens out of drivers coming up over the pass." Neither effect was installed.

In 1981, now 85, Bell began the second dinosaur — Mr. Rex, a 65-foot Tyrannosaurus rex with an internal staircase to an observation deck behind the teeth and a slide running down the tail. He finished it in 1986. Mr. Rex weighs about 100 tons. The tail slide was filled in by later owners.

In 1985, while Mr. Rex was still under construction, the dinosaurs appeared in *Pee-wee''s Big Adventure*. Pee-wee is dropped off in front of them by Large Marge, then shares a meal in Mr. Rex''s mouth with a waitress from the Wheel Inn. The scene cemented the dinosaurs in American roadside iconography. Through the 1980s they also appeared in Coca-Cola commercials and MTV videos. Bell spent roughly $300,000 of his own money and never made it back.

Claude Bell died September 19, 1988, in Anaheim, age 91. He had been planning a third dinosaur — a woolly mammoth — that was never built. The Wheel Inn remained open until 2013 and was demolished in 2016. Bell''s family sold the dinosaurs in the mid-1990s.

The current owners added a paid dinosaur garden in the early 2000s — smaller fiberglass dinosaurs, mineral panning, fossil digs for children. From 2005 until the mid-2010s the gift shop in Dinny''s belly operated as a young-earth creationist museum; that addition has since been removed. Dinny and Mr. Rex themselves are unchanged from Bell''s construction. They get fresh paint for holidays — Mr. Rex becomes Santa Rex in December.',
 33.92028, -116.77278,
 '50770 Seminole Drive, Cabazon, CA 92230',
 9000, 'long', 'proximity',
 'Curator-flagged 2026-05-21 (Tier 1 iconic landmarks). Wikipedia: Cabazon Dinosaurs. Coords Wikipedia-confirmed.'),

-- #4 Roy's Motel & Cafe
('editorial:tier1-iconic-landmarks-2026-05-21:04',
 'Roy''s Motel & Cafe',
 'landmark',
 'Roy and Velma Crowl broke down in Amboy in 1924 and stayed — by 1938 they had built a Route 66 gas station; by 1959 the boomerang sign that''s still the only light for ten miles; after I-40 bypassed Amboy in 1972, Roy''s became the ghost town''s last surviving business',
 ARRAY['wikipedia_article','founded_1938_roy_crowl','route_66_canon','mojave_desert_amboy_ghost_town','1959_googie_boomerang_neon_sign','sign_only_light_for_ten_miles_at_night','24_hour_operation_peak_1940s_1950s','buster_burris_son_in_law_continuator','interstate_40_bypass_1972_economic_collapse','business_went_to_zero_quote','buster_burris_owned_entire_town_for_decades','buster_died_2000','bessie_burris_sold_to_okura_2005','albert_okura_juan_pollo_chain_owner','425000_dollar_purchase_950_acres_entire_town','original_mcdonalds_museum_san_bernardino_okura_owner','gas_station_cafe_reopened_april_2008','neon_sign_relit_2019_kyle_okura','albert_okura_died_2023','route_66_centennial_2026_target_full_reopening'],
 'Roy Crowl and his wife Velma broke down in Amboy, California, in 1924, on their way to Los Angeles. They couldn''t afford the repair. Roy found work as a mechanic and then as a dragline operator for California Rock Salt; Velma cooked at one of Amboy''s cafes. They stayed.

In 1938 Roy bought four acres along the newly realigned Route 66 and opened Roy''s Garage. By the early 1940s he had added a cafe and an auto court of six bungalow cabins. His son-in-law Herman "Buster" Burris joined the operation. Through the 1940s and 1950s the complex ran twenty-four hours a day, serving travelers crossing the Mojave between Chicago and Los Angeles. Amboy grew to seven hundred residents with its own school, post office, and church.

In 1959 the Crowls retired and Burris took over. That same year he commissioned the sign that would define the place: a fifty-foot Googie boomerang, vertical "ROY''S" in red neon, sputnik starburst at the top. Mid-century modern signage at scale, sited where there was nothing else on the horizon. By night it was the only light for ten miles around.

In 1972 Interstate 40 opened, bypassing Amboy by fifteen miles. Buster Burris later said the day I-40 opened, business "went down to zero." Amboy''s residents left; the school closed, the post office shrank, the church locked up. Burris hung on. By the late 1970s he was effectively the sole occupant of an inhabited ghost town, running the cafe alone for the occasional Route 66 enthusiast or film scout. He owned all of Amboy by then — the land, the buildings, the salt operation residuals — and he ran it that way for two more decades.

Buster Burris retired in 1995 and died in 2000. A New York photographer leased Amboy briefly as a film location and let it foreclose. In 2005 Bessie Burris — Buster''s widow — sold the entire 950-acre town for $425,000 to Albert Okura, a Southern California restaurateur who owned the Juan Pollo chain and the Original McDonald''s Museum in San Bernardino. Okura promised Bessie he would restore the property to Route 66 condition rather than maintain its cinematic weathered look.

The gas station and cafe reopened April 28, 2008 — the cafe selling pre-packaged drinks and souvenirs rather than hot food, but operating again after thirty-six years dark. In 2019 Okura''s son Kyle led the restoration and relighting of the original 1959 sign. The neon hadn''t burned since the 1970s; it does now. Albert Okura died in 2023 at age seventy-one. Kyle Okura and his mother Sella have continued the work. The cabins and full hot kitchen are targeted to reopen for Route 66''s centennial in 2026.',
 34.558982, -115.743917,
 '87520 National Trails Highway, Amboy, CA 92304',
 9000, 'long', 'proximity',
 'Curator-flagged 2026-05-21 (Tier 1 iconic landmarks). Wikipedia: Roy''s Motel and Cafe. Coords Wikipedia infobox (34.558982, -115.743917); Nominatim cross-check at National Trails Highway centerline returned 34.5580459, -115.7491326 (~500m drift — road centerline vs. building complex).');

-- Verify stage count
DO $$
DECLARE
  staged_count INT;
BEGIN
  SELECT COUNT(*) INTO staged_count FROM _editorial_tier1_landmarks_stage;
  IF staged_count <> 4 THEN
    RAISE EXCEPTION 'Expected 4 staged rows, got %', staged_count;
  END IF;
  RAISE NOTICE 'Stage table: % rows ready for upsert.', staged_count;
END $$;

-- Sanity check: landmark slug must resolve to a real poi_categories row.
DO $$
DECLARE
  missing_slugs TEXT;
BEGIN
  SELECT string_agg(DISTINCT s.category_slug, ', ') INTO missing_slugs
    FROM _editorial_tier1_landmarks_stage s
    LEFT JOIN public.poi_categories c ON c.slug = s.category_slug
    WHERE c.id IS NULL;
  IF missing_slugs IS NOT NULL THEN
    RAISE EXCEPTION 'Missing poi_categories slugs: %. Fix slugs or add categories before seed runs.', missing_slugs;
  END IF;
END $$;

-- INSERT into pois with editorial_curated=TRUE (Tier 1) and iconic_local=TRUE.
-- Joins poi_categories on .slug — matches Tier 2 seed convention.
-- Idempotent via the partial unique index on (source_type, source_id) WHERE merged_into IS NULL.
-- narrative_modes + narrative_modes_override intentionally NOT set — the
-- pois_narrative_modes_recompute trigger fires on INSERT, walks the bucket
-- guards (Bucket A landform slugs don't match; Bucket A history-editorial
-- slug doesn't match; Bucket B venue/venue-child checks don't fire; food_drink
-- Bucket B doesn't match), falls through to the editorial_curated branch in
-- recompute_narrative_modes (commit a0d994f), and sets
-- narrative_modes = ARRAY['soul','local'].
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
  TRUE AS editorial_curated,
  now() AS imported_at
FROM _editorial_tier1_landmarks_stage s
JOIN public.poi_categories c ON c.slug = s.category_slug
ON CONFLICT (source_type, source_id) WHERE merged_into IS NULL DO NOTHING;

-- Report inserted + Bucket C dual-mode routing verification.
DO $$
DECLARE
  inserted_count INT;
  iconic_count INT;
  curated_count INT;
  landmark_slug_count INT;
  dual_routed_count INT;
  override_count INT;
BEGIN
  SELECT COUNT(*) INTO inserted_count
    FROM public.pois
    WHERE source_type = 'editorial'
      AND source_id LIKE 'editorial:tier1-iconic-landmarks-2026-05-21:%';
  SELECT COUNT(*) INTO iconic_count
    FROM public.pois
    WHERE source_type = 'editorial'
      AND source_id LIKE 'editorial:tier1-iconic-landmarks-2026-05-21:%'
      AND iconic_local = TRUE;
  SELECT COUNT(*) INTO curated_count
    FROM public.pois
    WHERE source_type = 'editorial'
      AND source_id LIKE 'editorial:tier1-iconic-landmarks-2026-05-21:%'
      AND editorial_curated = TRUE;
  SELECT COUNT(*) INTO landmark_slug_count
    FROM public.pois p
    JOIN public.poi_categories c ON c.id = p.category_id
    WHERE p.source_type = 'editorial'
      AND p.source_id LIKE 'editorial:tier1-iconic-landmarks-2026-05-21:%'
      AND c.slug = 'landmark';
  SELECT COUNT(*) INTO dual_routed_count
    FROM public.pois
    WHERE source_type = 'editorial'
      AND source_id LIKE 'editorial:tier1-iconic-landmarks-2026-05-21:%'
      AND narrative_modes = ARRAY['soul','local'];
  SELECT COUNT(*) INTO override_count
    FROM public.pois
    WHERE source_type = 'editorial'
      AND source_id LIKE 'editorial:tier1-iconic-landmarks-2026-05-21:%'
      AND narrative_modes_override = TRUE;
  RAISE NOTICE 'Tier 1 landmarks seed: inserted=% iconic_local=% editorial_curated=% landmark_slug=% routed_to_{soul,local}=% override=%',
    inserted_count, iconic_count, curated_count, landmark_slug_count, dual_routed_count, override_count;
END $$;

COMMIT;
