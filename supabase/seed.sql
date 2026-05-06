-- ============================================================
-- RoadStory Seed Data: LA to South Lake Tahoe (Eastern Sierra Route)
-- Route: LA → CA-14 → US-395 → CA-89 → South Lake Tahoe
-- ============================================================
-- Run AFTER 20250503000000_roadstory_schema.sql is applied.
-- ============================================================

-- ============================================================
-- 1. POI CATEGORIES
-- ============================================================

INSERT INTO poi_categories (slug, display_name, relevant_driving, relevant_hiking, relevant_city, sort_order)
VALUES
  ('history',       'History',                     TRUE, TRUE, TRUE,  1),
  ('geology',       'Geology',                     TRUE, TRUE, FALSE, 2),
  ('architecture',  'Architecture',                TRUE, FALSE, TRUE, 3),
  ('nature',        'Nature & Wildlife',           TRUE, TRUE, FALSE, 4),
  ('food_drink',    'Food & Drink',                TRUE, FALSE, TRUE, 5),
  ('art',           'Art & Culture',               FALSE, FALSE, TRUE, 6),
  ('engineering',   'Engineering & Infrastructure',TRUE, FALSE, TRUE, 7),
  ('viewpoint',     'Scenic Viewpoint',            TRUE, TRUE, FALSE, 8),
  ('local_culture', 'Local Culture',               TRUE, TRUE, TRUE,  9),
  ('recreation',    'Recreation',                  TRUE, TRUE, TRUE, 10),
  ('legends',       'Legends & Lore',              TRUE, TRUE, TRUE, 11),
  ('hidden_gems',   'Hidden Gems',                 TRUE, TRUE, TRUE, 12)
ON CONFLICT (slug) DO NOTHING;

-- Subcategories
INSERT INTO poi_categories (slug, display_name, parent_id, relevant_driving, relevant_hiking, relevant_city, sort_order)
VALUES
  ('bridges',        'Bridges & Tunnels',   (SELECT id FROM poi_categories WHERE slug = 'engineering'), TRUE, FALSE, FALSE, 1),
  ('dams',           'Dams & Aqueducts',    (SELECT id FROM poi_categories WHERE slug = 'engineering'), TRUE, FALSE, FALSE, 2),
  ('wind_solar',     'Wind & Solar',        (SELECT id FROM poi_categories WHERE slug = 'engineering'), TRUE, FALSE, FALSE, 3),
  ('mining',         'Mining History',      (SELECT id FROM poi_categories WHERE slug = 'history'),     TRUE, TRUE, FALSE,  4),
  ('native_history', 'Native American',     (SELECT id FROM poi_categories WHERE slug = 'history'),     TRUE, TRUE, FALSE,  5),
  ('volcanic',       'Volcanic Features',   (SELECT id FROM poi_categories WHERE slug = 'geology'),     TRUE, TRUE, FALSE,  1),
  ('hot_springs',    'Hot Springs',         (SELECT id FROM poi_categories WHERE slug = 'geology'),     TRUE, TRUE, FALSE,  2),
  ('alpine',         'Alpine Features',     (SELECT id FROM poi_categories WHERE slug = 'nature'),      TRUE, TRUE, FALSE,  1)
ON CONFLICT (slug) DO NOTHING;


-- ============================================================
-- 2. POIs — Los Angeles to South Lake Tahoe
-- ============================================================

-- -------------------------------------------------------
-- SEGMENT A: Los Angeles Urban Exit (LA to CA-14)
-- -------------------------------------------------------

INSERT INTO pois (name, subtitle, description, location, category_id, poi_type, visibility_radius_miles, significance_score, source, editorial_status, tags) VALUES

(
  'Griffith Observatory',
  'Iconic hilltop observatory overlooking LA',
  'Perched on the south slope of Mount Hollywood in Griffith Park, the observatory opened in 1935 thanks to a bequest from Griffith J. Griffith. It has appeared in numerous films including Rebel Without a Cause and La La Land. The building houses a Zeiss telescope that has been used by more people than any other telescope in history — over 7 million since 1935. On clear days the view stretches from downtown LA to the Pacific Ocean.',
  ST_SetSRID(ST_MakePoint(-118.3004, 34.1184), 4326)::geography,
  (SELECT id FROM poi_categories WHERE slug = 'viewpoint'),
  'viewpoint',
  8.0,
  8.5,
  'curated',
  'verified',
  ARRAY['observatory', 'hollywood', 'photo-op', 'landmark', 'film-location']
),

(
  'Hollywood Sign',
  'The world''s most famous sign',
  'Originally erected in 1923 as "HOLLYWOODLAND" to advertise a real estate development, the sign cost $21,000 (about $380,000 today). Each letter is 45 feet tall and 31 to 39 feet wide. The "LAND" portion was removed in 1949 when the Hollywood Chamber of Commerce took over maintenance. The sign was nearly demolished in 1978 before a campaign led by Hugh Hefner raised funds to rebuild it with steel. It sits at an elevation of 1,578 feet on Mount Lee.',
  ST_SetSRID(ST_MakePoint(-118.3217, 34.1341), 4326)::geography,
  (SELECT id FROM poi_categories WHERE slug = 'local_culture'),
  'area',
  15.0,
  9.0,
  'curated',
  'verified',
  ARRAY['hollywood', 'sign', 'landmark', 'iconic', 'photo-op']
),

(
  'Los Angeles Aqueduct Cascades',
  'Where LA''s stolen water arrives',
  'The Cascades in Sylmar mark the terminus of the 233-mile Los Angeles Aqueduct, one of the most controversial engineering projects in American history. When the aqueduct opened on November 5, 1913, William Mulholland famously said "There it is. Take it." The water was diverted from the Owens Valley, eventually drying up Owens Lake and devastating the valley''s farming communities — a conflict that inspired the film Chinatown. You will drive alongside parts of this aqueduct for much of your trip today.',
  ST_SetSRID(ST_MakePoint(-118.4068, 34.3103), 4326)::geography,
  (SELECT id FROM poi_categories WHERE slug = 'engineering'),
  'point',
  1.0,
  7.5,
  'curated',
  'verified',
  ARRAY['aqueduct', 'water', 'mulholland', 'chinatown', 'engineering', 'history']
),

(
  'Angeles National Forest',
  '700,000 acres of mountain wilderness above LA',
  'One of the most visited national forests in the country, the Angeles National Forest covers over 700,000 acres of the San Gabriel Mountains directly above the Los Angeles basin. The forest serves as the primary watershed for the greater LA area, and its peaks reach over 10,000 feet. The San Gabriel Mountains are among the most rapidly rising mountain ranges on Earth, growing about 2 inches per year due to the San Andreas Fault system running along their base.',
  ST_SetSRID(ST_MakePoint(-118.1542, 34.2500), 4326)::geography,
  (SELECT id FROM poi_categories WHERE slug = 'nature'),
  'area',
  12.0,
  6.5,
  'curated',
  'verified',
  ARRAY['national-forest', 'mountains', 'san-gabriel', 'watershed', 'wilderness']
),

(
  'Vasquez Rocks Natural Area',
  'Tilted sandstone slabs from an ancient fault',
  'These dramatic tilted rock formations were pushed up by movement along the Elkhorn Fault over 25 million years ago. Named after the 1870s bandit Tiburcio Vásquez who used the rocks as a hideout, the formations have appeared in countless films and TV shows — most famously as the alien planet where Captain Kirk fought the Gorn in Star Trek. The rocks are primarily Vasquez Formation sandstone, tilted nearly vertical at angles up to 50 degrees.',
  ST_SetSRID(ST_MakePoint(-118.3206, 34.4878), 4326)::geography,
  (SELECT id FROM poi_categories WHERE slug = 'geology'),
  'point',
  3.0,
  7.0,
  'curated',
  'verified',
  ARRAY['rocks', 'geology', 'star-trek', 'film-location', 'bandit', 'hiking']
),

-- -------------------------------------------------------
-- SEGMENT B: Antelope Valley & Mojave (CA-14 corridor)
-- -------------------------------------------------------

(
  'Palmdale / Antelope Valley',
  'Aerospace capital of America',
  'The Antelope Valley is where most of America''s advanced military aircraft were designed and tested. Lockheed Martin''s Skunk Works facility in Palmdale built the SR-71 Blackbird, the F-117 Nighthawk stealth fighter, and the F-22 Raptor. Northrop Grumman''s facility here built the B-2 Spirit stealth bomber. If you look up, the unusual aircraft you might see aren''t UFOs — they''re likely classified test flights from nearby Plant 42 or Edwards Air Force Base.',
  ST_SetSRID(ST_MakePoint(-118.1165, 34.5794), 4326)::geography,
  (SELECT id FROM poi_categories WHERE slug = 'history'),
  'area',
  5.0,
  6.5,
  'curated',
  'verified',
  ARRAY['aerospace', 'skunk-works', 'lockheed', 'military', 'stealth']
),

(
  'Antelope Valley California Poppy Reserve',
  'Seasonal wildflower explosion',
  'Each spring, this 1,780-acre reserve erupts with golden California poppies that can be so dense the hillsides look like they''re on fire. The display depends entirely on winter rainfall — in good years, the orange blanket stretches to the horizon. The California poppy (Eschscholzia californica) is the state flower and has been used medicinally by Native Americans for centuries. Peak bloom typically occurs between mid-March and mid-May, but the window is unpredictable.',
  ST_SetSRID(ST_MakePoint(-118.3962, 34.7354), 4326)::geography,
  (SELECT id FROM poi_categories WHERE slug = 'nature'),
  'point',
  5.0,
  7.0,
  'curated',
  'verified',
  ARRAY['poppies', 'wildflowers', 'spring', 'seasonal', 'state-flower']
),

(
  'Edwards Air Force Base',
  'Where the sound barrier was broken',
  'On October 14, 1947, Chuck Yeager flew the Bell X-1 past Mach 1 over this dry lakebed, becoming the first person to break the sound barrier in level flight. Edwards'' Rogers Dry Lake — a perfectly flat, 44-square-mile natural runway — has been the landing site for 54 Space Shuttle missions. The base has been the epicenter of American flight testing since the 1940s, testing everything from the X-15 (which reached the edge of space at Mach 6.7) to the latest stealth aircraft.',
  ST_SetSRID(ST_MakePoint(-117.8839, 34.9054), 4326)::geography,
  (SELECT id FROM poi_categories WHERE slug = 'history'),
  'area',
  15.0,
  8.5,
  'curated',
  'verified',
  ARRAY['edwards', 'air-force', 'sound-barrier', 'yeager', 'space-shuttle', 'x-15', 'aviation']
),

(
  'Tehachapi Pass Wind Farm',
  'One of the first large-scale wind farms on Earth',
  'The first turbines here were installed in the early 1980s, making Tehachapi one of the world''s first commercial wind energy sites. Today, over 4,700 turbines generate enough electricity to power 350,000 homes. The pass works so well because the pressure differential between the hot Mojave Desert and the cooler San Joaquin Valley creates a natural wind tunnel. The original turbines were tiny by modern standards — newer ones stand over 400 feet tall with 150-foot blades.',
  ST_SetSRID(ST_MakePoint(-118.3150, 35.1300), 4326)::geography,
  (SELECT id FROM poi_categories WHERE slug = 'engineering'),
  'area',
  10.0,
  7.5,
  'curated',
  'verified',
  ARRAY['wind-farm', 'wind-energy', 'turbines', 'renewable', 'tehachapi']
),

(
  'Tehachapi Loop',
  'Engineering marvel of railroad design',
  'Built in 1876, this is one of the most famous railroad engineering features in the world. The loop allows trains to gain 77 feet of elevation over a 0.73-mile spiral. A train long enough — typically 85 cars or more — will actually cross over itself as the head passes above the tail. Union Pacific runs 30-40 freight trains through here daily, some over a mile long. The loop was designed by William Hood and was considered one of the greatest engineering feats of the 19th century.',
  ST_SetSRID(ST_MakePoint(-118.2981, 35.1419), 4326)::geography,
  (SELECT id FROM poi_categories WHERE slug = 'engineering'),
  'point',
  2.0,
  8.0,
  'curated',
  'verified',
  ARRAY['railroad', 'train', 'loop', 'engineering', 'union-pacific', 'historic']
),

-- -------------------------------------------------------
-- SEGMENT C: Southern Owens Valley (US-395)
-- -------------------------------------------------------

(
  'Red Rock Canyon State Park',
  'Colorful cliffs from an ancient seabed',
  'These striking red, white, and brown rock formations are remnants of a 10-million-year-old seabed that was uplifted by tectonic forces. The cliffs contain fossils of ancient camels, three-toed horses, saber-toothed cats, and dog-bears that roamed here when the area was a lush savanna. Red Rock Canyon has appeared in dozens of films and TV shows, often doubling as Mars or alien landscapes. The Kawaiisu people have inhabited this area for at least 20,000 years.',
  ST_SetSRID(ST_MakePoint(-117.9853, 35.3726), 4326)::geography,
  (SELECT id FROM poi_categories WHERE slug = 'geology'),
  'viewpoint',
  5.0,
  7.5,
  'curated',
  'verified',
  ARRAY['red-rock', 'canyon', 'geology', 'fossils', 'film-location', 'cliffs']
),

(
  'Indian Wells Brewing Company',
  'Desert brewery and soda maker',
  'A quirky roadside stop in Inyokern, this small brewery has been making craft beer and specialty sodas since 1996. Their claim to fame is an extensive line of unusual flavored sodas. A perfect break point on the long US-395 corridor.',
  ST_SetSRID(ST_MakePoint(-117.8126, 35.6462), 4326)::geography,
  (SELECT id FROM poi_categories WHERE slug = 'food_drink'),
  'point',
  0.2,
  4.0,
  'curated',
  'reviewed',
  ARRAY['brewery', 'soda', 'roadside-stop', 'beer', 'quirky']
),

(
  'Mount Whitney',
  'Highest peak in the contiguous United States',
  'At 14,505 feet, Mount Whitney is the tallest mountain in the lower 48 states. It sits on the eastern edge of Sequoia National Park, and remarkably, it is only 84.6 miles from Badwater Basin in Death Valley, the lowest point in North America at 282 feet below sea level. This means the highest and lowest points in the contiguous US are within sight of each other. The peak was first summited in 1873 by three fishermen from Lone Pine — Charles Begole, A.H. Johnson, and John Lucas.',
  ST_SetSRID(ST_MakePoint(-118.2924, 36.5785), 4326)::geography,
  (SELECT id FROM poi_categories WHERE slug = 'geology'),
  'area',
  25.0,
  9.5,
  'curated',
  'verified',
  ARRAY['whitney', 'tallest', 'peak', 'sierra-nevada', '14er', 'highest-point']
),

(
  'Death Valley (visible to the east)',
  'Lowest and hottest point in North America',
  'To the east, beyond the Inyo Mountains, lies Death Valley — the hottest place on Earth, where the air temperature reached a world record 134°F (56.7°C) on July 10, 1913. Badwater Basin sits 282 feet below sea level, and the valley floor is a surreal landscape of salt flats, sand dunes, and volcanic craters. The Timbisha Shoshone people have lived in and around Death Valley for over 1,000 years, calling it "tümpisa" meaning "rock paint" for the red ochre clay found there.',
  ST_SetSRID(ST_MakePoint(-116.8660, 36.2328), 4326)::geography,
  (SELECT id FROM poi_categories WHERE slug = 'geology'),
  'area',
  30.0,
  9.0,
  'curated',
  'verified',
  ARRAY['death-valley', 'hottest', 'lowest-point', 'desert', 'badwater', 'national-park']
),

(
  'Manzanar National Historic Site',
  'WWII Japanese American internment camp',
  'Between 1942 and 1945, over 10,000 Japanese Americans were forcibly relocated to this desolate camp in the Owens Valley, one of ten internment camps across the western US. Families were given 48 hours to dispose of their homes, businesses, and belongings before being transported here. The site preserves the guard tower, mess hall, and barracks foundations. The camp was surrounded by barbed wire and guard towers despite the fact that two-thirds of the internees were American-born US citizens.',
  ST_SetSRID(ST_MakePoint(-118.1547, 36.7282), 4326)::geography,
  (SELECT id FROM poi_categories WHERE slug = 'history'),
  'point',
  2.0,
  9.0,
  'curated',
  'verified',
  ARRAY['manzanar', 'internment', 'wwii', 'japanese-american', 'civil-rights', 'national-historic-site']
),

(
  'Owens Lake (dry)',
  'The lake LA drained dry',
  'This dusty playa was once a 108-square-mile lake, 50 feet deep and teeming with brine shrimp and migratory birds. When the Los Angeles Aqueduct began diverting the Owens River in 1913, the lake was dead by 1926. The exposed lakebed became the single largest source of dust pollution in the United States, releasing clouds of alkaline particles laced with arsenic and cadmium. Today, shallow flooding and gravel cover have reduced but not eliminated the dust problem. Remember the aqueduct cascades from the start of your drive — this is where that water came from.',
  ST_SetSRID(ST_MakePoint(-117.9575, 36.4359), 4326)::geography,
  (SELECT id FROM poi_categories WHERE slug = 'history'),
  'area',
  10.0,
  8.0,
  'curated',
  'verified',
  ARRAY['owens-lake', 'dry-lake', 'aqueduct', 'water-wars', 'dust', 'chinatown']
),

(
  'Alabama Hills',
  'Hollywood''s favorite Western backdrop',
  'These rounded, weathered granite boulders at the base of the Sierra Nevada have appeared in hundreds of Westerns, sci-fi films, and TV shows since the 1920s — including Gunga Din, Tremors, Iron Man, and Gladiator. Despite the Alabama name (given by Confederate sympathizers during the Civil War, after the CSS Alabama warship), the formations are classic Sierra Nevada granite, about 80-150 million years old. The contrast between the smooth, orange-toned Alabama Hills and the jagged, snow-capped Sierra peaks directly behind them is one of the most photographed landscapes in California.',
  ST_SetSRID(ST_MakePoint(-118.1106, 36.6089), 4326)::geography,
  (SELECT id FROM poi_categories WHERE slug = 'geology'),
  'viewpoint',
  5.0,
  8.0,
  'curated',
  'verified',
  ARRAY['alabama-hills', 'lone-pine', 'film-location', 'western', 'granite', 'photo-op']
),

(
  'Lone Pine Film History Museum',
  'Chronicling a century of movie-making in the Eastern Sierra',
  'Lone Pine and the Alabama Hills have been a film location since 1920, hosting productions featuring Roy Rogers, John Wayne, Gene Autry, and later Iron Man, Django Unchained, and countless others. The museum documents this history with props, costumes, and behind-the-scenes photography. Every October, the Lone Pine Film Festival draws actors and fans from across the country.',
  ST_SetSRID(ST_MakePoint(-118.0627, 36.6060), 4326)::geography,
  (SELECT id FROM poi_categories WHERE slug = 'local_culture'),
  'point',
  0.5,
  5.5,
  'curated',
  'reviewed',
  ARRAY['museum', 'film-history', 'lone-pine', 'westerns', 'movies']
),

-- -------------------------------------------------------
-- SEGMENT D: Central Owens Valley (US-395)
-- -------------------------------------------------------

(
  'Big Pine and the Paiute Shoshone Reservation',
  'Ancestral homeland of the Owens Valley Paiute',
  'The Owens Valley Paiute people have lived in this region for at least 3,000 years, developing sophisticated irrigation systems to water wild crops — one of the earliest known examples of indigenous agriculture in North America. The community''s relationship with the land was devastated by the LA aqueduct water diversion. Today the Big Pine Paiute Tribe of the Owens Valley maintains a reservation and cultural center preserving their heritage.',
  ST_SetSRID(ST_MakePoint(-118.2896, 37.1648), 4326)::geography,
  (SELECT id FROM poi_categories WHERE slug = 'history'),
  'point',
  2.0,
  7.0,
  'curated',
  'verified',
  ARRAY['paiute', 'native-american', 'indigenous', 'reservation', 'owens-valley']
),

(
  'Ancient Bristlecone Pine Forest',
  'The oldest living things on Earth',
  'High in the White Mountains east of US-395, bristlecone pines have been growing for nearly 5,000 years. The oldest known tree, named Methuselah, germinated around 2833 BCE — it was already over a thousand years old when the Egyptian pyramids were built. These trees survive at elevations above 10,000 feet in conditions so harsh that the wood is incredibly dense, making it almost impervious to rot, insects, and disease. Their exact locations are kept secret to prevent vandalism.',
  ST_SetSRID(ST_MakePoint(-118.1750, 37.3850), 4326)::geography,
  (SELECT id FROM poi_categories WHERE slug = 'nature'),
  'area',
  15.0,
  9.0,
  'curated',
  'verified',
  ARRAY['bristlecone', 'oldest-trees', 'white-mountains', 'ancient', 'methuselah']
),

(
  'Laws Railroad Museum',
  'Preserved narrow-gauge railroad depot',
  'This open-air museum preserves the 1883 depot of the Carson and Colorado Railroad, a narrow-gauge line that served the Owens Valley mining communities. The railroad was famously described by its financier as running "either from nowhere to nowhere, or from somewhere to somewhere," depending on who told the story. The original engine, freight cars, and the fully intact station sit exactly where they operated over a century ago.',
  ST_SetSRID(ST_MakePoint(-118.3482, 37.4023), 4326)::geography,
  (SELECT id FROM poi_categories WHERE slug = 'history'),
  'point',
  1.0,
  5.5,
  'curated',
  'reviewed',
  ARRAY['railroad', 'museum', 'narrow-gauge', 'historic', 'bishop']
),

(
  'Bishop',
  'Gateway to the Eastern Sierra',
  'The largest town in the Owens Valley, Bishop sits at 4,150 feet and serves as the base camp for adventures into the Sierra Nevada, White Mountains, and Owens Valley. The town is known for its excellent bouldering at the Buttermilk, Tablelands, and Happy/Sad areas — drawing climbers from around the world. Schat''s Bakkerÿ on Main Street has been making sheepherder bread since 1907 and is worth a stop.',
  ST_SetSRID(ST_MakePoint(-118.3943, 37.3635), 4326)::geography,
  (SELECT id FROM poi_categories WHERE slug = 'local_culture'),
  'point',
  2.0,
  6.0,
  'curated',
  'reviewed',
  ARRAY['bishop', 'gateway', 'climbing', 'bouldering', 'bakery', 'base-camp']
),

(
  'Volcanic Tableland',
  'A 760,000-year-old volcanic blast zone',
  'The flat-topped mesa east of Bishop is the Bishop Tuff — a 500-cubic-mile sheet of volcanic ash from the eruption that created the Long Valley Caldera 760,000 years ago. That eruption was 2,000 times more powerful than the 1980 Mount St. Helens eruption and one of the largest volcanic events in Earth''s recent history. The ash cloud reached as far as present-day Nebraska. Today the tableland is covered in petroglyphs carved by ancient Paiute people and is a world-class bouldering destination.',
  ST_SetSRID(ST_MakePoint(-118.3400, 37.4500), 4326)::geography,
  (SELECT id FROM poi_categories WHERE slug = 'geology'),
  'area',
  8.0,
  7.5,
  'curated',
  'verified',
  ARRAY['volcanic', 'tableland', 'bishop-tuff', 'caldera', 'eruption', 'petroglyphs', 'bouldering']
),

-- -------------------------------------------------------
-- SEGMENT E: Mammoth / Long Valley / Mono (US-395)
-- -------------------------------------------------------

(
  'Long Valley Caldera',
  'A sleeping supervolcano beneath your wheels',
  'You are now driving through one of the largest volcanic calderas on Earth. The Long Valley Caldera is 20 miles long and 11 miles wide, formed by the same catastrophic eruption that created the Volcanic Tableland 760,000 years ago. The caldera floor has been rising since 1980 — about 3 feet total — and the area experiences frequent earthquake swarms. The USGS monitors it continuously. The hot springs, fumaroles, and geothermal energy plants in the area are all evidence that magma still sits relatively close to the surface.',
  ST_SetSRID(ST_MakePoint(-118.8700, 37.7000), 4326)::geography,
  (SELECT id FROM poi_categories WHERE slug = 'geology'),
  'area',
  10.0,
  8.5,
  'curated',
  'verified',
  ARRAY['caldera', 'volcano', 'supervolcano', 'geothermal', 'usgs', 'long-valley']
),

(
  'Hot Creek Geological Site',
  'Boiling water erupting into a Sierra creek',
  'Hot Creek is one of the most dramatic geothermal sites in California. Superheated water from the Long Valley magma chamber erupts through fissures in the creek bed, sending boiling plumes into the otherwise cold snowmelt creek. Swimming was banned in 2006 after violent eruptions of scalding water became more frequent — water temperatures can swing from comfortable to 200°F without warning. The site is a vivid reminder that you are driving across an active volcanic system.',
  ST_SetSRID(ST_MakePoint(-118.8286, 37.6610), 4326)::geography,
  (SELECT id FROM poi_categories WHERE slug = 'geology'),
  'point',
  1.0,
  7.0,
  'curated',
  'verified',
  ARRAY['hot-creek', 'geothermal', 'hot-springs', 'volcanic', 'boiling']
),

(
  'Mammoth Mountain Ski Area',
  'Volcano you can ski on',
  'Mammoth Mountain is a 57,000-year-old lava dome — yes, the ski resort is built on a volcano. In the early 1990s, carbon dioxide from the magma chamber below began killing trees on the mountain''s flanks, creating Horseshoe Lake''s "tree kill" area. The ski resort averages over 400 inches of snow annually and typically operates into June or July, one of the longest seasons in North America. The town of Mammoth Lakes grew from a mining and lumber community into one of California''s premier outdoor recreation destinations.',
  ST_SetSRID(ST_MakePoint(-119.0326, 37.6308), 4326)::geography,
  (SELECT id FROM poi_categories WHERE slug = 'recreation'),
  'area',
  8.0,
  7.5,
  'curated',
  'verified',
  ARRAY['mammoth', 'ski', 'volcano', 'lava-dome', 'snow', 'resort']
),

(
  'Devils Postpile National Monument',
  'Perfect hexagonal basalt columns',
  'These 60-foot tall columns of basalt formed about 100,000 years ago when a lava flow cooled slowly and uniformly, contracting into near-perfect hexagonal shapes — like a giant''s causeway. Most columns are six-sided, though some have four, five, or seven sides. The top of the formation was polished smooth by glaciers during the last ice age, creating a surface that looks like a fitted tile floor. A moderate 2.5-mile hike connects the Postpile to Rainbow Falls, a 101-foot waterfall.',
  ST_SetSRID(ST_MakePoint(-119.0847, 37.6240), 4326)::geography,
  (SELECT id FROM poi_categories WHERE slug = 'geology'),
  'point',
  3.0,
  8.0,
  'curated',
  'verified',
  ARRAY['devils-postpile', 'basalt', 'columns', 'hexagonal', 'volcanic', 'national-monument']
),

(
  'June Lake Loop',
  'The Sierra''s most scenic side road',
  'This 16-mile loop (CA-158) passes four stunning alpine lakes — Grant, Silver, Gull, and June — backed by dramatic 12,000-foot peaks. In autumn, the aspens along the loop explode into gold, making it one of the best fall color drives in California. June Lake village has the feel of a small Swiss mountain town. The loop was carved by glaciers that left behind the moraines damming each lake.',
  ST_SetSRID(ST_MakePoint(-119.0826, 37.7805), 4326)::geography,
  (SELECT id FROM poi_categories WHERE slug = 'viewpoint'),
  'viewpoint',
  5.0,
  7.5,
  'curated',
  'verified',
  ARRAY['june-lake', 'loop', 'alpine', 'aspen', 'fall-colors', 'scenic-drive']
),

(
  'Mono Lake',
  'An ancient, alien lake with no outlet',
  'At least 760,000 years old, Mono Lake is one of the oldest continuously existing lakes in North America. Its famous tufa towers — eerie calcium-carbonate spires up to 30 feet tall — form underwater where calcium-rich freshwater springs meet the lake''s alkaline water, and are exposed as the lake level drops. The lake has no outlet; water leaves only through evaporation, making it 2.5 times saltier than the ocean and extremely alkaline. Trillions of brine shrimp and alkali flies support millions of migratory birds. Like Owens Lake to the south, Mono Lake was nearly destroyed by LA''s water diversions until a landmark 1994 court ruling ordered the city to let the lake recover.',
  ST_SetSRID(ST_MakePoint(-119.0306, 37.9945), 4326)::geography,
  (SELECT id FROM poi_categories WHERE slug = 'geology'),
  'area',
  8.0,
  9.0,
  'curated',
  'verified',
  ARRAY['mono-lake', 'tufa', 'alkaline', 'ancient', 'birds', 'water-wars', 'brine-shrimp']
),

(
  'Bodie Ghost Town',
  'Best-preserved ghost town in the American West',
  'Once a booming gold mining town of 10,000 people with 65 saloons, Bodie is now preserved in a state of "arrested decay" — buildings, furniture, and personal items remain exactly as they were left when the last residents departed. At its peak in 1879, Bodie had a reputation as the most lawless town in the West. A young girl reportedly wrote in her diary, "Goodbye God, I''m going to Bodie." The town sits at 8,379 feet and gets some of the coldest temperatures in California, with winter lows reaching -30°F.',
  ST_SetSRID(ST_MakePoint(-119.0145, 38.2133), 4326)::geography,
  (SELECT id FROM poi_categories WHERE slug = 'history'),
  'point',
  5.0,
  8.5,
  'curated',
  'verified',
  ARRAY['bodie', 'ghost-town', 'gold-mining', 'historic', 'preserved', 'state-park']
),

-- -------------------------------------------------------
-- SEGMENT F: Northern Mono / Bridgeport (US-395)
-- -------------------------------------------------------

(
  'Travertine Hot Springs',
  'Free natural hot springs with Sierra views',
  'These volunteer-maintained natural hot spring pools sit on a hillside overlooking the Bridgeport Valley with panoramic views of the Sierra Nevada. The mineral-rich water emerges from the ground at about 100-104°F, depositing layers of travertine (calcium carbonate) that give the pools their sculpted appearance. Free and open 24/7, the springs are one of the most popular roadside soaking spots on US-395.',
  ST_SetSRID(ST_MakePoint(-119.2176, 38.2560), 4326)::geography,
  (SELECT id FROM poi_categories WHERE slug = 'hidden_gems'),
  'point',
  1.0,
  6.5,
  'curated',
  'reviewed',
  ARRAY['hot-springs', 'travertine', 'soaking', 'free', 'bridgeport', 'natural']
),

(
  'Bridgeport',
  'Classic Western ranching town',
  'The Mono County seat is one of the most intact 19th-century towns in the Eastern Sierra. The 1880 Mono County Courthouse is the second-oldest still-functioning courthouse in California. The town sits in a broad, beautiful valley at 6,465 feet, surrounded by cattle ranches and backed by snow-capped peaks. Bridgeport Reservoir to the north is a popular trout fishing destination.',
  ST_SetSRID(ST_MakePoint(-119.2311, 38.2555), 4326)::geography,
  (SELECT id FROM poi_categories WHERE slug = 'local_culture'),
  'point',
  3.0,
  5.0,
  'curated',
  'reviewed',
  ARRAY['bridgeport', 'courthouse', 'ranching', 'historic', 'western-town']
),

(
  'Sonora Pass Viewpoint (CA-108 junction)',
  'One of the highest Sierra crossings',
  'The junction with CA-108 marks the turnoff for Sonora Pass, which at 9,624 feet is the second-highest highway pass in the Sierra Nevada. The road features 26% grades — the steepest on any California state highway — and is closed in winter. Even from US-395, the views of the Sierra crest in this area are spectacular, with peaks exceeding 11,000 feet.',
  ST_SetSRID(ST_MakePoint(-119.3500, 38.3300), 4326)::geography,
  (SELECT id FROM poi_categories WHERE slug = 'viewpoint'),
  'viewpoint',
  10.0,
  6.0,
  'curated',
  'reviewed',
  ARRAY['sonora-pass', 'mountain-pass', 'sierra', 'high-elevation', 'scenic']
),

-- -------------------------------------------------------
-- SEGMENT G: Approach to Lake Tahoe (US-395 to CA-89/88)
-- -------------------------------------------------------

(
  'Topaz Lake',
  'Lake that straddles the California-Nevada border',
  'This reservoir sits directly on the California-Nevada state line, with a casino and lodge on the Nevada side. The lake is fed by the West Walker River and is a popular fishing spot for trophy-sized rainbow and brown trout. On a clear day the water is a striking blue-green against the sagebrush hillsides.',
  ST_SetSRID(ST_MakePoint(-119.5120, 38.6920), 4326)::geography,
  (SELECT id FROM poi_categories WHERE slug = 'nature'),
  'viewpoint',
  4.0,
  5.0,
  'curated',
  'reviewed',
  ARRAY['topaz-lake', 'state-line', 'fishing', 'reservoir', 'california-nevada']
),

(
  'Gardnerville / Minden',
  'Basque heritage in the Carson Valley',
  'These twin towns in the Carson Valley have a strong Basque heritage dating to the 1800s when Basque immigrants came from Spain and France to work as sheepherders. The JT Basque Bar & Dining Room in Gardnerville serves family-style Basque meals — lamb, oxtail soup, beans, bread, and picon punch — a tradition that has continued unbroken for decades. The Carson Valley itself was part of the original Pony Express route.',
  ST_SetSRID(ST_MakePoint(-119.7469, 38.9414), 4326)::geography,
  (SELECT id FROM poi_categories WHERE slug = 'food_drink'),
  'point',
  2.0,
  6.0,
  'curated',
  'reviewed',
  ARRAY['basque', 'gardnerville', 'minden', 'carson-valley', 'pony-express', 'dining']
),

(
  'Genoa',
  'Oldest settlement in Nevada',
  'Founded in 1851 as Mormon Station, Genoa is the oldest permanent settlement in what is now Nevada. The original Mormon stockade has been reconstructed and serves as a state historic park. Genoa''s most famous landmark is the Genoa Bar — the oldest thirst parlor in Nevada, operating since 1853. The town sits at the base of the Sierra Nevada with views across the Carson Valley.',
  ST_SetSRID(ST_MakePoint(-119.8450, 39.0027), 4326)::geography,
  (SELECT id FROM poi_categories WHERE slug = 'history'),
  'point',
  2.0,
  6.5,
  'curated',
  'reviewed',
  ARRAY['genoa', 'oldest', 'nevada', 'mormon-station', 'bar', 'historic']
),

(
  'Carson Pass',
  'Where the first wagon trains crossed the Sierra',
  'At 8,574 feet, Carson Pass on CA-88 was one of the primary routes used by Gold Rush emigrants to cross the Sierra Nevada in 1848-1850, named after Kit Carson who crossed here with John C. Frémont in 1844. The pass area features spectacular wildflower displays in summer and is the northern terminus of the Pacific Crest Trail''s Sierra section. Round Top Peak (10,381 feet) dominates the skyline to the south.',
  ST_SetSRID(ST_MakePoint(-119.9880, 38.6935), 4326)::geography,
  (SELECT id FROM poi_categories WHERE slug = 'history'),
  'viewpoint',
  6.0,
  7.5,
  'curated',
  'verified',
  ARRAY['carson-pass', 'gold-rush', 'wagon-train', 'kit-carson', 'pct', 'wildflowers']
),

(
  'Hope Valley',
  'Alpine meadow gateway to Tahoe',
  'This stunning alpine meadow at 7,000 feet is one of the most beautiful valleys in the Sierra Nevada. Framed by granite peaks and filled with wildflowers in summer, golden aspens in fall, and pristine snow in winter, Hope Valley feels like a postcard from every season. The West Fork of the Carson River meanders through the meadow, supporting wild trout and creating a landscape that has barely changed since the Gold Rush emigrants first saw it.',
  ST_SetSRID(ST_MakePoint(-119.9321, 38.7348), 4326)::geography,
  (SELECT id FROM poi_categories WHERE slug = 'viewpoint'),
  'viewpoint',
  4.0,
  7.0,
  'curated',
  'verified',
  ARRAY['hope-valley', 'alpine', 'meadow', 'aspen', 'fall-colors', 'carson-river']
),

-- -------------------------------------------------------
-- SEGMENT H: Lake Tahoe
-- -------------------------------------------------------

(
  'Luther Pass',
  'Final Sierra crossing before Tahoe',
  'At 7,740 feet, Luther Pass on CA-89 is your final mountain pass before dropping into the Lake Tahoe Basin. Named after Ira Luther, who built a toll road over the pass in 1854 to capitalize on Gold Rush traffic. The pass marks the boundary between the Carson River watershed (flowing east to Nevada) and the Tahoe Basin watershed.',
  ST_SetSRID(ST_MakePoint(-120.0000, 38.7750), 4326)::geography,
  (SELECT id FROM poi_categories WHERE slug = 'history'),
  'point',
  5.0,
  5.0,
  'curated',
  'reviewed',
  ARRAY['luther-pass', 'mountain-pass', 'watershed', 'gold-rush', 'toll-road']
),

(
  'Fallen Leaf Lake',
  'Tahoe''s hidden smaller sibling',
  'This glacier-carved lake sits at 6,377 feet just south of Lake Tahoe, separated by a narrow moraine. At 3 miles long and 400 feet deep, Fallen Leaf is one of the deepest lakes in California despite being a fraction of Tahoe''s size. Its water is nearly as clear as Tahoe''s, and unlike its famous neighbor, Fallen Leaf remains relatively uncrowded. The lake was formed about 10,000 years ago when a glacial moraine dammed the valley.',
  ST_SetSRID(ST_MakePoint(-120.0573, 38.8804), 4326)::geography,
  (SELECT id FROM poi_categories WHERE slug = 'hidden_gems'),
  'point',
  2.0,
  6.5,
  'curated',
  'reviewed',
  ARRAY['fallen-leaf', 'lake', 'glacier', 'deep', 'swimming', 'hidden']
),

(
  'Emerald Bay',
  'The crown jewel of Lake Tahoe',
  'Often called the most photographed spot in the Lake Tahoe region, Emerald Bay is a sheltered inlet on the southwest shore with water that shifts from deep sapphire to vivid emerald green. Fannette Island in the center of the bay is the only island in Lake Tahoe. At the head of the bay sits Vikingsholm, a 38-room mansion built in 1929 as a faithful reproduction of an 11th-century Norse fortress — considered the finest example of Scandinavian architecture in the Western Hemisphere.',
  ST_SetSRID(ST_MakePoint(-120.1104, 38.9535), 4326)::geography,
  (SELECT id FROM poi_categories WHERE slug = 'viewpoint'),
  'viewpoint',
  3.0,
  9.0,
  'curated',
  'verified',
  ARRAY['emerald-bay', 'tahoe', 'vikingsholm', 'island', 'photo-op', 'iconic']
),

(
  'Lake Tahoe',
  'The Big Blue — North America''s largest alpine lake',
  'Lake Tahoe holds enough water to cover the entire state of California 14 inches deep. At 1,645 feet, it is the second-deepest lake in the United States (after Crater Lake) and the 16th deepest in the world. The lake''s remarkable clarity — you can see objects nearly 70 feet below the surface — comes from the purity of the surrounding granite watershed. Tahoe is so deep that it has never frozen over in recorded history. The Washoe people have lived here for at least 6,000 years, calling it "Da ow a ga" — meaning "edge of the lake." The lake straddles California and Nevada, with the Nevada side historically known for casino resorts.',
  ST_SetSRID(ST_MakePoint(-120.0324, 38.9466), 4326)::geography,
  (SELECT id FROM poi_categories WHERE slug = 'nature'),
  'area',
  20.0,
  10.0,
  'curated',
  'verified',
  ARRAY['tahoe', 'lake', 'alpine', 'deep', 'clarity', 'washoe', 'destination']
),

(
  'South Lake Tahoe',
  'Your destination — mountain town meets casino strip',
  'South Lake Tahoe straddles the California-Nevada border, with the California side featuring a beach town atmosphere and the Nevada side anchored by the Stateline casino corridor. The town sits at 6,224 feet and serves as a basecamp for Heavenly Mountain Resort, which offers skiing with views of both the lake and the Nevada desert simultaneously. The Heavenly gondola rises from the center of town to 9,123 feet.',
  ST_SetSRID(ST_MakePoint(-119.9772, 38.9332), 4326)::geography,
  (SELECT id FROM poi_categories WHERE slug = 'local_culture'),
  'point',
  3.0,
  7.0,
  'curated',
  'verified',
  ARRAY['south-lake-tahoe', 'destination', 'casino', 'ski', 'heavenly', 'beach']
);


-- ============================================================
-- 3. CORRIDORS
-- ============================================================

INSERT INTO corridors (name, subtitle, path, region_type, region_context, estimated_minutes, editorial_status) VALUES

(
  'Antelope Valley Aerospace Corridor',
  'Where America''s most advanced aircraft were born',
  ST_SetSRID(ST_MakeLine(ARRAY[
    ST_MakePoint(-118.3500, 34.4000),
    ST_MakePoint(-118.2000, 34.6000),
    ST_MakePoint(-117.9500, 34.8500)
  ]), 4326)::geography,
  'suburban',
  '{
    "geology": "The Antelope Valley is a high desert basin in the western Mojave at about 2,300 feet elevation, bounded by the San Gabriel Mountains to the south and the Tehachapi Mountains to the north.",
    "history": "The valley transformed from ranching and agriculture to the aerospace capital of America after World War II, when the military established testing facilities in the remote, clear-skied desert.",
    "ecology": "Joshua trees dot the landscape — these iconic trees are actually giant yuccas and can live for hundreds of years. The valley is also home to the endangered desert tortoise.",
    "culture": "The aerospace industry defines the valley. Many residents work at classified facilities and cannot discuss their jobs. Local legend says you can always spot an aerospace engineer at a bar — they change the subject when you ask what they do.",
    "fun_facts": ["The Antelope Valley is named for pronghorn antelope that once roamed here in large numbers — they have been locally extinct since the 1880s.", "Plant 42 in Palmdale is where every U.S. stealth aircraft has been assembled."],
    "cross_references": [{"source": "USAF", "detail": "Edwards AFB history"}, {"source": "Lockheed Martin", "detail": "Skunk Works history"}]
  }',
  25,
  'verified'
),

(
  'Tehachapi Mountains Transition',
  'Crossing from desert to farmland',
  ST_SetSRID(ST_MakeLine(ARRAY[
    ST_MakePoint(-118.2000, 35.0500),
    ST_MakePoint(-118.3200, 35.1500),
    ST_MakePoint(-118.4500, 35.2500)
  ]), 4326)::geography,
  'mountain_pass',
  '{
    "geology": "The Tehachapi Mountains form the boundary between the Mojave Desert and the San Joaquin Valley — geologically, they connect the Sierra Nevada to the Coast Ranges, making them one of the few east-west trending mountain ranges in California.",
    "history": "This pass has been a critical transportation corridor for centuries. The Southern Pacific Railroad completed the Tehachapi Loop here in 1876. The pass was also the route of the 20-mule-team borax wagons from Death Valley.",
    "ecology": "The transition from Mojave scrub to oak woodland happens rapidly as you gain elevation. Watch for golden eagles, red-tailed hawks, and California condors — the Tehachapi wind turbines have been modified to reduce bird strikes.",
    "culture": "The town of Tehachapi was once a major railroad hub and now balances wind energy, ranching, and a state prison. The annual Tehachapi Mountain Festival celebrates the town''s frontier heritage.",
    "fun_facts": ["The wind through Tehachapi Pass can exceed 60 mph — strong enough to blow semi-trucks off the highway.", "The pass marks the approximate boundary between Northern and Southern California, depending on who you ask."]
  }',
  20,
  'verified'
),

(
  'Southern Owens Valley',
  'The valley LA drank dry',
  ST_SetSRID(ST_MakeLine(ARRAY[
    ST_MakePoint(-117.9500, 35.4000),
    ST_MakePoint(-118.0000, 35.8000),
    ST_MakePoint(-118.0500, 36.3000),
    ST_MakePoint(-118.0627, 36.6000)
  ]), 4326)::geography,
  'desert',
  '{
    "geology": "The Owens Valley is a graben — a block of earth''s crust that dropped between two parallel faults. The Sierra Nevada to the west and the Inyo/White Mountains to the east are still rising while the valley floor continues to sink, creating one of the deepest valleys in North America. The vertical relief from the valley floor to Mount Whitney is over 10,000 feet in just 11 miles — greater than the Grand Canyon.",
    "history": "The Owens Valley water wars between local farmers and the City of Los Angeles in the 1920s-30s involved dynamite attacks on the aqueduct, armed standoffs, and political corruption. The conflict inspired the film Chinatown. The LA aqueduct you saw at the start of your drive runs alongside US-395 through much of this valley.",
    "ecology": "Despite the arid conditions, the valley supports a surprising variety of wildlife including mule deer, mountain lions, wild horses, and golden eagles. The remaining sections of the Owens River support Owens pupfish, a species found nowhere else on Earth.",
    "culture": "Lone Pine, Independence, and Big Pine are small, resilient communities that have weathered the water wars, military land withdrawals, and economic isolation. Their survival is a testament to the stubbornness of Eastern Sierra people.",
    "fun_facts": ["The Owens Valley sits in the rain shadow of the Sierra Nevada — Lone Pine gets about 5 inches of rain per year, while the Sierra crest just 15 miles west gets over 40 feet of snow.", "The Los Angeles Aqueduct runs downhill for its entire 233-mile length — no pumps required. Gravity does all the work."]
  }',
  55,
  'verified'
),

(
  'Long Valley Volcanic Zone',
  'Driving across a supervolcano',
  ST_SetSRID(ST_MakeLine(ARRAY[
    ST_MakePoint(-118.5000, 37.4500),
    ST_MakePoint(-118.7500, 37.6000),
    ST_MakePoint(-118.9000, 37.7000)
  ]), 4326)::geography,
  'geological',
  '{
    "geology": "The Long Valley Caldera formed 760,000 years ago in an eruption that ejected 150 cubic miles of material — enough to bury all of Los Angeles under 600 feet of ash. The resulting Bishop Tuff ash layer can be found as far away as Nebraska. The caldera floor has been inflating since 1980, and earthquake swarms are common. The USGS classifies Long Valley as a ''very high threat'' volcanic area.",
    "history": "Mammoth Lakes was a mining town before becoming a ski resort. The Casa Diablo geothermal plant has been generating electricity from the volcanic heat since 1985 — one of the few places in California where you can power your home with magma.",
    "ecology": "The volcanic soils support unique plant communities. Tree kill zones near Horseshoe Lake show where CO2 from the magma chamber is venting through the soil, suffocating tree roots.",
    "fun_facts": ["If the Long Valley supervolcano erupted today at its full historical intensity, it would be catastrophic for most of western North America.", "The Hot Creek eruptions have become more violent in recent years — geologists aren''t sure why."]
  }',
  20,
  'verified'
),

(
  'Mono Basin to Bridgeport Valley',
  'Ancient lakes and sagebrush seas',
  ST_SetSRID(ST_MakeLine(ARRAY[
    ST_MakePoint(-119.0300, 38.0000),
    ST_MakePoint(-119.1000, 38.1000),
    ST_MakePoint(-119.2300, 38.2500)
  ]), 4326)::geography,
  'geological',
  '{
    "geology": "Mono Lake is one of the oldest lakes in North America, and the landscape around it tells a story of volcanic activity, glaciation, and climate change. The Mono Craters to the south are a chain of volcanic domes, the youngest only 600 years old. Negit and Paoha Islands in Mono Lake are volcanic — Paoha rose from the lake bed in a volcanic uplift only about 300 years ago.",
    "history": "Mark Twain visited Mono Lake in 1863 and wrote about it in Roughing It, calling it ''one of the strangest freaks of Nature.'' The Kutzadika''a Paiute people harvested the alkali fly pupae (kutsavi) from the lake shores — a protein-rich food source that sustained them for thousands of years.",
    "ecology": "Mono Lake supports trillions of brine shrimp and alkali flies, which in turn feed millions of migratory birds including 90% of the California gull population and significant numbers of Wilson''s and red-necked phalaropes.",
    "fun_facts": ["Mono Lake water is approximately 3 times saltier than the ocean and has a pH of 10 — about the same as glass cleaner.", "The Mono Lake Committee''s legal victory in 1994 was one of the most significant environmental rulings in California history, establishing that the public trust doctrine could override water rights."]
  }',
  25,
  'verified'
),

(
  'Carson Valley Approach',
  'From sagebrush to pines — the final stretch',
  ST_SetSRID(ST_MakeLine(ARRAY[
    ST_MakePoint(-119.5100, 38.7000),
    ST_MakePoint(-119.7500, 38.9400),
    ST_MakePoint(-119.8500, 39.0000),
    ST_MakePoint(-120.0000, 38.7800)
  ]), 4326)::geography,
  'alpine',
  '{
    "geology": "The Carson Valley is one of the most fertile valleys in western Nevada, irrigated by the Carson River flowing from the Sierra. The valley floor sits at about 4,700 feet and is bounded by the Pine Nut Mountains to the east and the towering Sierra Nevada escarpment to the west — the same fault system that defines the Owens Valley hundreds of miles to the south.",
    "history": "The Carson Valley was on the Emigrant Trail and later the Pony Express route. Genoa, founded in 1851, is the oldest permanent settlement in Nevada. The valley was part of Utah Territory before Nevada became a state in 1864 — rushed into statehood by Abraham Lincoln to add electoral votes for the 1864 presidential election.",
    "ecology": "The transition from sagebrush to Jeffrey pine forest happens rapidly as you climb toward the Sierra crest. Jeffrey pines smell like vanilla or butterscotch if you stick your nose into the bark furrows — a distinctive feature that helps distinguish them from ponderosa pines.",
    "fun_facts": ["Nevada became a state during the Civil War partly so Lincoln could use its electoral votes and its silver revenue. The state constitution was telegraphed to Washington D.C. — the longest telegraph transmission in history at that time.", "The JT Basque Bar in Gardnerville serves picon punch, a cocktail made with Amer Picon liqueur that is almost impossible to find outside Basque communities in the American West."]
  }',
  35,
  'verified'
);


-- ============================================================
-- 4. BADGE DEFINITIONS
-- ============================================================

INSERT INTO badge_definitions (slug, display_name, description, rule_type, rule_category, rule_threshold, tier, sort_order) VALUES
  ('bridge_spotter',     'Bridge Spotter',       'Discover 5 bridges and engineering marvels',  'category_count', 'engineering',   5, 'standard', 1),
  ('bridge_master',      'Bridge Master',         'Discover 15 engineering landmarks',           'category_count', 'engineering',  15, 'gold',     2),
  ('rock_hound',         'Rock Hound',            'Visit 5 geological features',                 'category_count', 'geology',       5, 'standard', 3),
  ('geologist',          'Amateur Geologist',     'Visit 20 geological features',                'category_count', 'geology',      20, 'gold',     4),
  ('history_buff',       'History Buff',          'Hear 10 history narrations',                  'category_count', 'history',      10, 'standard', 5),
  ('historian',          'Historian',             'Hear 30 history narrations',                  'category_count', 'history',      30, 'gold',     6),
  ('nature_scout',       'Nature Scout',          'Discover 5 nature POIs',                      'category_count', 'nature',        5, 'standard', 7),
  ('wildlife_ranger',    'Wildlife Ranger',       'Discover 20 nature POIs',                     'category_count', 'nature',       20, 'gold',     8),
  ('foodie',             'Road Trip Foodie',      'Find 5 food and drink spots',                 'category_count', 'food_drink',    5, 'standard', 9),
  ('peak_bagger',        'Peak Bagger',           'Visit 10 scenic viewpoints',                  'category_count', 'viewpoint',    10, 'standard', 10),
  ('treasure_hunter',    'Treasure Hunter',       'Find 5 hidden gems',                          'category_count', 'hidden_gems',   5, 'standard', 11),
  ('legend_seeker',      'Legend Seeker',         'Discover 5 legends and lore',                 'category_count', 'legends',       5, 'standard', 12),
  ('first_ride',         'First Ride',            'Complete your first trip',                    'trip_count',     NULL,            1, 'standard', 13),
  ('road_warrior',       'Road Warrior',          'Complete 5 trips',                            'trip_count',     NULL,            5, 'standard', 14),
  ('road_legend',        'Road Legend',           'Complete 20 trips',                           'trip_count',     NULL,           20, 'gold',     15),
  ('century_club',       'Century Club',          'Hear 100 narrations total',                   'total_count',    NULL,          100, 'standard', 16),
  ('thousand_mile_club', 'Thousand Mile Club',    'Hear 500 narrations total',                   'total_count',    NULL,          500, 'gold',     17)
ON CONFLICT (slug) DO NOTHING;


-- ============================================================
-- 5. VERIFICATION QUERIES
-- ============================================================

-- Total POI count: 37 from seed + 60 from migration 20260504000000_la_tahoe_more_pois
-- After supabase db reset (migrations run before seed): expect 97
SELECT COUNT(*) AS total_pois FROM pois;

-- POIs by category
SELECT c.display_name, COUNT(p.id) AS poi_count
FROM pois p
JOIN poi_categories c ON c.id = p.category_id
GROUP BY c.display_name
ORDER BY COUNT(p.id) DESC;

-- Test corridor query: POIs within 5 miles of LA → Lone Pine line
SELECT name, significance_score,
  ROUND((ST_Distance(
    location,
    ST_SetSRID(ST_MakeLine(ST_MakePoint(-118.2437, 34.0522), ST_MakePoint(-118.0627, 36.6060)), 4326)::geography
  ) / 1609.34)::numeric, 1) AS miles_from_route
FROM pois
WHERE ST_DWithin(
  location,
  ST_SetSRID(ST_MakeLine(ST_MakePoint(-118.2437, 34.0522), ST_MakePoint(-118.0627, 36.6060)), 4326)::geography,
  8046.72  -- 5 miles in meters
)
ORDER BY significance_score DESC;

-- Corridor count (expect 6)
SELECT COUNT(*) AS total_corridors FROM corridors;

-- Badge count (expect 17)
SELECT COUNT(*) AS total_badges FROM badge_definitions;
