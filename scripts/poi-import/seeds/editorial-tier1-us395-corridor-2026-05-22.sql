-- Editorial POI seed: Tier 1 iconic_local landmarks — US-395 corridor batch 1
-- (3 California icons between LA and Lake Tahoe)
--
-- Per Mode Bifurcation §15.10 Editorial Gate framework (commits a0d994f + 0cdaafd)
-- and the `landmark` category slug (commit 0be4031). Same end-to-end shape as the
-- Tier 1 iconic landmarks seed `editorial-tier1-iconic-landmarks-2026-05-21.sql`
-- (commit d1d6c7f).
--
-- Tier 1 means:
--   * iconic_local = TRUE
--   * editorial_curated = TRUE  (vs Tier 2 callouts where editorial_curated = FALSE)
--   * Full curator-authored multi-paragraph descriptions
--   * intrinsic_depth = 'long'  (matches editorial_curated+sig>=75 G1 heuristic)
--   * significance_score = 9000  (iconic floor sentinel; same as prior Tier 1 batch)
--
-- Routing: the pois_narrative_modes_recompute trigger fires on INSERT, walks the
-- bucket guards, and falls through to the editorial_curated branch — setting
-- narrative_modes = ARRAY['soul','local']. No override or narrative_modes set here.
--
-- Coordinates source per POI:
--   #1 Museum of Western Film History — curator approximate (36.5972, -118.0640);
--                                       Wikipedia article exists at
--                                       "Lone Pine Film History Museum" but has no
--                                       infobox geographic coordinates; using
--                                       curator value.
--   #2 Bodie Ghost Town                — Wikipedia confirmed (38.21222, -119.01222);
--                                       curator approximate (38.2118, -119.0117)
--                                       drifted ~65m — used Wikipedia.
--   #3 Vikingsholm                     — Wikipedia confirmed (38.95216, -120.10675);
--                                       curator approximate (38.9522, -120.1116)
--                                       drifted ~430m west of the building (into
--                                       the Eagle Falls / inlet-head area) — used
--                                       Wikipedia.
--
-- Idempotent via ON CONFLICT (source_type, source_id) WHERE merged_into IS NULL DO NOTHING.

BEGIN;

CREATE TEMP TABLE _editorial_tier1_us395_stage (
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

INSERT INTO _editorial_tier1_us395_stage VALUES

-- #1 Museum of Western Film History (Lone Pine)
('editorial:tier1-us395-corridor-2026-05-22:01',
 'Museum of Western Film History',
 'landmark',
 'the keeper of Lone Pine''s century-long film history — four hundred-plus productions filmed in the Alabama Hills, from Hopalong Cassidy to Iron Man, anchored by a museum a town of two thousand built for itself',
 ARRAY['wikipedia_article','alabama_hills_film_location_canon','museum_opened_2006','lone_pine_film_festival_since_1990','four_hundred_plus_productions_filmed','early_hollywood_western_anchor','gunga_din_1939_filming_location','modern_blockbuster_filming_location','beverly_jim_rogers_benefactors','mount_whitney_geographic_anchor'],
 'Pull off US-395 at Lone Pine and you''re standing in a town with a population of about two thousand and a hundred years of celluloid memory layered into its dirt. The Alabama Hills rise immediately west of Main Street — rounded granite boulders piled improbably against the Sierra horizon, Mount Whitney''s serrated peak behind them at 14,505 feet. Hollywood found these hills in the silent era, in the 1920s, and never really left. Hopalong Cassidy rode them. Roy Rogers and Tom Mix and William S. Hart. Gunga Din was shot here in 1939, How the West Was Won in 1962, Gladiator in 2000, Iron Man in 2008. Westworld came back for HBO. Over four hundred films and television productions have used these boulders to stand in for somewhere else — frontier Texas, India under the Raj, alien planets.

For most of that century, nobody in Lone Pine kept official track. Crews came and went; stars filled the rooms at the old Dow Hotel and disappeared. The town''s relationship to its own film history was scattered across studio archives, fan magazines, and the memories of old-timers who''d watched John Wayne stop for coffee. The history was visible only to the people lucky enough to know what they were looking at.

In 1990, a few townspeople started the Lone Pine Film Festival — gathering surviving cast members, screening the old westerns at the high school, walking visitors out to the rock formations where particular scenes were shot. People came. They kept coming, year after year. By 2006 the community had built something larger and more permanent: the Museum of Western Film History on the south end of Main Street, eventually named for major benefactors Beverly and Jim Rogers.

The decision at the heart of this place is small and stubborn — a town of two thousand looking at its own century-long history and refusing to let Hollywood be the only one who remembered. The museum holds saddles Hopalong rode, posters for films nobody''s seen in fifty years, a Roy Rogers Trigger replica, costumes from John Wayne pictures, props from Iron Man and Django Unchained. It''s not a museum about cinema in the abstract. It''s a museum about this specific patch of granite, west of this specific small town, and what was made here.

Walk through the front rooms and out the back door, and the Alabama Hills are right there, a few minutes'' drive on Movie Road from where you parked. The Sierra wind comes down off Mount Whitney smelling like sage and high dust. Lone Pine isn''t a place that became famous for being filmed. It''s a place that decided, after a century of being someone else''s backdrop, to claim the story for itself.',
 36.5972, -118.0640,
 'South Main Street, Lone Pine, CA 93545',
 9000, 'long', 'proximity',
 'Curator-flagged 2026-05-22 (Tier 1 iconic landmarks, US-395 corridor batch 1). Wikipedia: Lone Pine Film History Museum. Coords curator-supplied (36.5972, -118.0640); Wikipedia article exists but has no infobox geographic coordinates.'),

-- #2 Bodie Ghost Town
('editorial:tier1-us395-corridor-2026-05-22:02',
 'Bodie Ghost Town',
 'landmark',
 'California''s most preserved gold rush ghost town — California State Parks took it over in 1962 and chose "arrested decay" over restoration, keeping the abandoned town exactly as it was found',
 ARRAY['wikipedia_article','california_state_historic_park','national_historic_landmark','founded_1859_gold_strike','peak_population_around_10000_1880','arrested_decay_preservation_since_1962','one_of_largest_preserved_ghost_towns_in_us','eastern_sierra_canon','off_us_395_via_highway_270','rough_dirt_road_access','photographer_pilgrimage_site','bad_man_from_bodie_violence_reputation'],
 'Bodie sits high in the Bodie Hills east of US-395, eighteen miles north of Lee Vining and thirteen miles down a road that turns from blacktop to washboard dirt. The wind up here cuts at 8,400 feet. There are no trees worth mentioning, just sagebrush and the ribbed gray of granite, and the town itself — about a hundred and ten buildings, weathered the color of old wood smoke, sitting exactly where the last residents left them.

Gold was struck in 1859 by W.S. Bodey, who died in a blizzard the next winter before he could spell his name on anything permanent. The boom didn''t come for nearly twenty years. When it hit in the late 1870s, Bodie went from a few hundred people to a peak of around ten thousand — sixty-five saloons, three breweries, a Chinatown, opium dens, two banks, four churches, and a daily newspaper called the Bodie Free Press. The town earned a reputation as one of the most violent in the American West. The phrase "Bad Man from Bodie" became national shorthand for menace. By 1881 the ore was thinning. By the early 1900s it was over. People packed what they could carry and walked away.

What''s unusual about Bodie isn''t that it boomed and busted — California has dozens of ghost towns. What''s unusual is what happened next: nothing. The town was abandoned but never demolished, never scavenged systematically, never replaced. For sixty years it sat alone in the high desert, slowly weathering. When California State Parks took it over in 1962, it had been picked over but mostly intact.

The decision at the center of this place was made in that 1962 moment. State Parks could have restored Bodie — fresh paint, new windows, the standard recreation of a frontier town for visitors. Instead they chose what they called "arrested decay": minimal stabilization to prevent collapse, no reconstruction, no replacement of missing pieces. Bottles still sit on shelves where they were left. Calendars still hang on the walls turned to whatever month it was. There''s a pool table in the saloon with the cues racked. A pianist''s sheet music is open to the page she stopped on. It is a town preserved as the moment of leaving, not the moment of arrival.

Walk through it on a windy October afternoon and you''ll hear the loose boards talking. The dirt road in from US-395 — Bodie Road off Highway 270 — is rough enough that most people who make it have made the decision twice: once to come this far, and once to keep going when the pavement ended. Bodie is a National Historic Landmark and one of the largest authentically preserved ghost towns in the United States.',
 38.21222, -119.01222,
 'Bodie Road off Highway 270, Mono County, CA',
 9000, 'long', 'proximity',
 'Curator-flagged 2026-05-22 (Tier 1 iconic landmarks, US-395 corridor batch 1). Wikipedia: Bodie, California. Coords Wikipedia-confirmed (38.21222, -119.01222); curator approximate (38.2118, -119.0117) drifted ~65m — used Wikipedia.'),

-- #3 Vikingsholm
('editorial:tier1-us395-corridor-2026-05-22:03',
 'Vikingsholm',
 'landmark',
 'a 1929 Scandinavian stave-church estate hidden at the head of Emerald Bay — Lora Knight commissioned authentic Norse architecture using traditional joinery, no nails, hand-hewn timbers shipped from Sweden',
 ARRAY['wikipedia_article','emerald_bay_state_park','built_1929_lora_knight','architect_lehman_palmedo','scandinavian_stave_church_architecture','traditional_joinery_no_nails','sod_roof_with_wildflowers','national_register_of_historic_places','hike_or_boat_access_only','one_of_finest_examples_scandinavian_architecture_western_hemisphere','lake_tahoe_west_shore_canon','emerald_bay_most_photographed_viewpoint'],
 'At the head of Emerald Bay on Lake Tahoe''s western shore, you have to leave the road to reach Vikingsholm. There''s a turnout off Highway 89 with a viewpoint famous for being one of the most photographed in California. From there it''s a steep one-mile hike down a foot trail to the lakeshore, where a 38-room mansion built in 1929 sits half-hidden among the pines, looking like a Norwegian fjord village that wandered three thousand miles west and lost the rest of the country.

Lora Josephine Knight built it. She was a widow and an heiress — her late husband, James H. Moore, had been part of a syndicate that included Standard Oil''s interests; her own family came from St. Louis money. In 1928 she traveled through Scandinavia and fell in love with the architecture she found there: the carved stave churches, the dragon-head roof ridges, the dark wood and the sod roofs sown with wildflowers. She returned to America wanting to build something that wouldn''t fake the look — would actually be the thing.

She hired Lehman Palmedo, a Swedish-trained architect who happened also to be her nephew, and gave him a brief that was unusual for a millionaire''s summer home: build it the way the old craftsmen built. No nails. No modern fasteners. Traditional joinery throughout. Hand-hewn timbers, dragon-beam carvings done by hand, some materials shipped from Sweden, local craftsmen trained in the techniques. The sod roofs were real sod, sown with wildflowers that bloom in summer. The construction took less than a year, finishing in 1929. Knight summered there until her death in 1945.

The decision at the center of Vikingsholm is small and exact: not Scandinavian-themed but Scandinavian-built. Most American attempts at European authenticity in this era went the route of pastiche — a Tudor revival in Pasadena, a Spanish fantasy along the coast, the architecture as a costume. Knight wanted the bones. She paid more, took longer, accepted constraints she didn''t need to accept, in service of getting the actual craft instead of its image. The result is one of the finest examples of Scandinavian architecture in the Western Hemisphere — not a copy of one, an example of one.

The property passed through several owners after her death and became part of Emerald Bay State Park in 1953. Today it''s on the National Register of Historic Places. Tours run in summer; the rest of the year, it sits empty by the water. The hike down passes the photographed viewpoint near the top, then drops into pines and switchbacks, and by the time you reach the lakeshore the modern world feels far away. Stand by the front door and look up — the dragon beams are still up there, the joinery still holding, the sod roof still flowering.',
 38.95216, -120.10675,
 'Emerald Bay State Park, Highway 89, El Dorado County, CA',
 9000, 'long', 'proximity',
 'Curator-flagged 2026-05-22 (Tier 1 iconic landmarks, US-395 corridor batch 1). Wikipedia: Vikingsholm. Coords Wikipedia-confirmed (38.95216, -120.10675); curator approximate (38.9522, -120.1116) drifted ~430m west of the building footprint (into the Eagle Falls / inlet-head area) — used Wikipedia.');

-- Verify stage count
DO $$
DECLARE
  staged_count INT;
BEGIN
  SELECT COUNT(*) INTO staged_count FROM _editorial_tier1_us395_stage;
  IF staged_count <> 3 THEN
    RAISE EXCEPTION 'Expected 3 staged rows, got %', staged_count;
  END IF;
  RAISE NOTICE 'Stage table: % rows ready for upsert.', staged_count;
END $$;

-- Sanity check: landmark slug must resolve to a real poi_categories row.
DO $$
DECLARE
  missing_slugs TEXT;
BEGIN
  SELECT string_agg(DISTINCT s.category_slug, ', ') INTO missing_slugs
    FROM _editorial_tier1_us395_stage s
    LEFT JOIN public.poi_categories c ON c.slug = s.category_slug
    WHERE c.id IS NULL;
  IF missing_slugs IS NOT NULL THEN
    RAISE EXCEPTION 'Missing poi_categories slugs: %. Fix slugs or add categories before seed runs.', missing_slugs;
  END IF;
END $$;

-- INSERT into pois with editorial_curated=TRUE (Tier 1) and iconic_local=TRUE.
-- Joins poi_categories on .slug — matches d1d6c7f convention.
-- Idempotent via the partial unique index on (source_type, source_id) WHERE merged_into IS NULL.
-- narrative_modes + narrative_modes_override intentionally NOT set — the
-- pois_narrative_modes_recompute trigger fires on INSERT, walks the bucket
-- guards (Bucket A landform slugs don't match; Bucket A history-editorial slug
-- doesn't match; Bucket B venue/venue-child checks don't fire; food_drink
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
FROM _editorial_tier1_us395_stage s
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
      AND source_id LIKE 'editorial:tier1-us395-corridor-2026-05-22:%';
  SELECT COUNT(*) INTO iconic_count
    FROM public.pois
    WHERE source_type = 'editorial'
      AND source_id LIKE 'editorial:tier1-us395-corridor-2026-05-22:%'
      AND iconic_local = TRUE;
  SELECT COUNT(*) INTO curated_count
    FROM public.pois
    WHERE source_type = 'editorial'
      AND source_id LIKE 'editorial:tier1-us395-corridor-2026-05-22:%'
      AND editorial_curated = TRUE;
  SELECT COUNT(*) INTO landmark_slug_count
    FROM public.pois p
    JOIN public.poi_categories c ON c.id = p.category_id
    WHERE p.source_type = 'editorial'
      AND p.source_id LIKE 'editorial:tier1-us395-corridor-2026-05-22:%'
      AND c.slug = 'landmark';
  SELECT COUNT(*) INTO dual_routed_count
    FROM public.pois
    WHERE source_type = 'editorial'
      AND source_id LIKE 'editorial:tier1-us395-corridor-2026-05-22:%'
      AND narrative_modes = ARRAY['soul','local'];
  SELECT COUNT(*) INTO override_count
    FROM public.pois
    WHERE source_type = 'editorial'
      AND source_id LIKE 'editorial:tier1-us395-corridor-2026-05-22:%'
      AND narrative_modes_override = TRUE;
  RAISE NOTICE 'Tier 1 US-395 corridor batch 1 seed: inserted=% iconic_local=% editorial_curated=% landmark_slug=% routed_to_{soul,local}=% override=%',
    inserted_count, iconic_count, curated_count, landmark_slug_count, dual_routed_count, override_count;
END $$;

COMMIT;
