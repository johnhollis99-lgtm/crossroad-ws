-- ============================================================
-- Migration: 60 additional POIs — LA to South Lake Tahoe
-- Sections: I-5 Corridor · Western Sierra · Southern Sierra · Eastern Sierra
-- Apply via: supabase db push  (existing DB)  or  supabase db reset  (fresh DB).
-- ============================================================

INSERT INTO pois (name, subtitle, description, location, category_id, poi_type,
                  visibility_radius_miles, significance_score, source, editorial_status, tags, trip_mode)

-- -------------------------------------------------------
-- SECTION 1: I-5 CORRIDOR (Los Angeles → Sacramento → US-50 → SLT)
-- -------------------------------------------------------

VALUES

(
  'The Grapevine — Tejon Pass',
  'Six miles of grade separating SoCal from the world',
  'The grade between Lebec and Wheeler Ridge is known simply as "The Grapevine" — named for the wild grapevines early Spanish explorers found growing in Tejon Creek canyon below. At its summit, Tejon Pass sits at 4,183 feet. The descent into the San Joaquin Valley drops nearly 2,000 feet in six miles — steep enough that runaway truck ramps appear every mile on the northbound side. In winter, the pass closes several times a year due to snow, stranding thousands of drivers. The California Highway Patrol maintains a permanent inspection station at the bottom where they check trucks for brake fade after the descent. The Grapevine is one of the most weather-sensitive corridors in California: temperatures at the bottom can be 30°F warmer than the summit.',
  ST_SetSRID(ST_MakePoint(-118.8941, 34.9978), 4326)::geography,
  (SELECT id FROM poi_categories WHERE slug = 'engineering'),
  'point', 8.0, 7.5, 'curated', 'verified',
  ARRAY['grapevine', 'tejon-pass', 'grade', 'i-5', 'mountain-pass', 'truck-safety'],
  'driving'
),

(
  'Fort Tejon State Historic Park',
  'Where the U.S. Army imported camels to California',
  'Established in 1854 to police the Tejon Pass corridor, Fort Tejon holds one of the strangest chapters in military history. In 1857, the U.S. Army imported 75 camels from North Africa and Turkey as an experiment in desert warfare — several were stationed here. The camels proved problematic: they spooked horses, smelled terrible, and bit soldiers. The experiment was abandoned with the onset of the Civil War. The fort was also shaken by the massive 1857 Fort Tejon earthquake, estimated at magnitude 7.9 — the largest historical earthquake in California — which ruptured 225 miles of the San Andreas Fault. The park preserves adobe barracks and officer quarters from the original post.',
  ST_SetSRID(ST_MakePoint(-118.8923, 34.8733), 4326)::geography,
  (SELECT id FROM poi_categories WHERE slug = 'history'),
  'point', 3.0, 7.0, 'curated', 'verified',
  ARRAY['fort-tejon', 'camels', 'civil-war', 'earthquake', 'military', 'historic-park'],
  'driving'
),

(
  'Wheeler Ridge Petroleum Anticline',
  'An oil trap you can see from the road',
  'The tilted rock layers visible at Wheeler Ridge are a surface expression of the same geological forces that created billions of dollars worth of oil below. The ridge is an anticline — a fold of rock layers arched upward — and anticlinal traps are where oil naturally concentrates. The Kern County oil fields, which begin here, have produced more petroleum than any other county in the contiguous United States. At peak production in the 1980s, Kern County yielded 250,000 barrels per day. The San Joaquin Valley as a whole sits atop one of the most prolific oil basins in North American history, and the geologic evidence is right here on the hillside.',
  ST_SetSRID(ST_MakePoint(-119.0617, 35.0106), 4326)::geography,
  (SELECT id FROM poi_categories WHERE slug = 'geology'),
  'area', 5.0, 6.5, 'curated', 'verified',
  ARRAY['oil', 'anticline', 'petroleum', 'geology', 'kern-county', 'san-joaquin'],
  'driving'
),

(
  'Kern County Oil Fields',
  'California''s most productive petroleum basin',
  'The pump jacks visible across the Bakersfield plain have been nodding since 1899, when drillers struck oil in what became one of the richest petroleum discoveries in California history. Kern County has produced more oil than any other county in the lower 48 — over 7 billion barrels total. The industry attracted Dust Bowl migrants from Oklahoma and Texas in the 1930s, an exodus immortalized by John Steinbeck in The Grapes of Wrath. The heavy crude here must be steam-injected to flow, making Kern County one of the most energy-intensive oil operations in the world. The derricks and storage tanks you see are part of an industry that has shaped this valley for 125 years.',
  ST_SetSRID(ST_MakePoint(-119.0437, 35.3920), 4326)::geography,
  (SELECT id FROM poi_categories WHERE slug = 'geology'),
  'area', 10.0, 7.0, 'curated', 'verified',
  ARRAY['oil-field', 'bakersfield', 'petroleum', 'dust-bowl', 'kern-county', 'pump-jack'],
  'driving'
),

(
  'Buck Owens'' Crystal Palace',
  'The home of the Bakersfield Sound',
  'Buck Owens and Merle Haggard invented the Bakersfield Sound in the 1950s and 60s — a rawer, electric alternative to the polished Nashville production dominating country radio at the time. The Crystal Palace is equal parts performance venue, museum, and honky-tonk restaurant, built by Owens in 1996 to honor the music he made famous. The walls are lined with guitars, Nudie suits, and gold records from an era when Bakersfield briefly challenged Nashville as the capital of country music. Owens appeared on Hee Haw for nearly two decades. He died in 2006 — in this building — just hours after performing. The Buckaroos, his backing band, invented a style of clean Telecaster picking that influenced everyone from the Beatles to Dwight Yoakam.',
  ST_SetSRID(ST_MakePoint(-119.0430, 35.3720), 4326)::geography,
  (SELECT id FROM poi_categories WHERE slug = 'local_culture'),
  'point', 3.0, 7.5, 'curated', 'verified',
  ARRAY['bakersfield-sound', 'buck-owens', 'country-music', 'crystal-palace', 'merle-haggard', 'honky-tonk'],
  'driving'
),

(
  'California Aqueduct',
  'The spine of California water',
  'The concrete-lined trench running parallel to I-5 carries water from the Sacramento-San Joaquin Delta to Southern California — 444 miles of engineered gravity and pump stations. The California Aqueduct is part of the State Water Project, the largest state-built water system in the world. It moves enough water to supply 27 million Californians and irrigate 750,000 acres of farmland. The aqueduct crosses the Tehachapi Mountains using the Edmonston Pumping Plant, which lifts water nearly 2,000 feet — the highest single pump lift in the world. The water flowing past you left the Sacramento Delta about two weeks ago and will arrive in Los Angeles reservoirs in another three weeks.',
  ST_SetSRID(ST_MakePoint(-119.3520, 35.5000), 4326)::geography,
  (SELECT id FROM poi_categories WHERE slug = 'engineering'),
  'area', 3.0, 7.5, 'curated', 'verified',
  ARRAY['aqueduct', 'water', 'california-water-project', 'engineering', 'irrigation', 'edmonston'],
  'driving'
),

(
  'Tule Elk State Natural Reserve',
  'California''s largest native land animal, returned from the brink',
  'Tule elk were once so numerous in the Central Valley that Spanish missionaries reported herds of 500,000 covering the valley floor. By 1875, they had been hunted to near-extinction — only a single pair survived on a Kern County rancho. The species was saved by cattle rancher Henry Miller, who protected them on his land for 30 years. The reserve here protects one of the largest free-ranging herds in the state. Males can weigh up to 700 pounds and their antlers — shed and regrown annually — can span five feet. The elk are most visible at dawn and dusk. The Yokuts people relied on tule elk as a primary food source and spiritual symbol for thousands of years before European contact.',
  ST_SetSRID(ST_MakePoint(-119.8939, 35.7754), 4326)::geography,
  (SELECT id FROM poi_categories WHERE slug = 'nature'),
  'area', 3.0, 7.0, 'curated', 'verified',
  ARRAY['tule-elk', 'wildlife', 'conservation', 'central-valley', 'endemic', 'herd'],
  'driving'
),

(
  'Harris Ranch',
  'California''s most famous roadside restaurant',
  'The smell hits first — a combination of beef, oak smoke, and Central Valley dust that is distinct enough to have its own zip code. Harris Ranch began as a cattle operation in 1937 and expanded into one of the largest beef producers in the western United States. The restaurant has been a mandatory I-5 stop since 1977, attracting everyone from presidents and movie stars to truckers and road-trippers. The inn sits at the midpoint of the LA-to-San Francisco drive, which explains both its success and its perpetual wait times. Harris Ranch produces about 150,000 cattle per year. The feedlot is visible and fragrant from the highway — a reminder that beef at this scale is an industrial process.',
  ST_SetSRID(ST_MakePoint(-120.2427, 36.2152), 4326)::geography,
  (SELECT id FROM poi_categories WHERE slug = 'food_drink'),
  'point', 3.0, 7.0, 'curated', 'verified',
  ARRAY['harris-ranch', 'steakhouse', 'roadside', 'california-beef', 'restaurant', 'i-5'],
  'driving'
),

(
  'Coalinga 1983 Earthquake',
  'The town that rebuilt itself — and changed earthquake science',
  'On May 2, 1983, a magnitude 6.5 earthquake struck at noon when most residents were outdoors, which is likely why no one died in the immediate collapse of Coalinga''s historic downtown. The quake destroyed 700 buildings and was felt from Sacramento to Los Angeles. Coalinga had no seismic hazard designation before the event — it wasn''t near any mapped fault. The earthquake occurred on a "blind thrust fault," meaning no surface rupture and no visible fault line. This discovery transformed earthquake science: California has dozens of similar hidden faults capable of producing damaging earthquakes in unexpected locations. The town''s name comes from "Coaling Station A," a railroad fueling depot established for the oil industry.',
  ST_SetSRID(ST_MakePoint(-120.3602, 36.1399), 4326)::geography,
  (SELECT id FROM poi_categories WHERE slug = 'history'),
  'point', 5.0, 6.5, 'curated', 'verified',
  ARRAY['earthquake', 'coalinga', 'blind-fault', 'seismology', '1983', 'disaster'],
  'driving'
),

(
  'San Luis Reservoir',
  'California''s largest off-stream reservoir',
  'The blue surface shimmering to the west holds 2.04 million acre-feet of water — enough to supply the entire San Francisco Bay Area for two years. San Luis is an off-stream reservoir: it doesn''t sit in a natural river canyon but was built by damming a valley and pumping it full from the Sacramento-San Joaquin Delta during wet years, then releasing it during droughts. The O''Neill Forebay just below serves as a holding pond and 2,000-acre recreation area. The reservoir provides critical storage for the State Water Project and Central Valley Project serving 25 million Californians. The surrounding Diablo Range hills were grazed by cattle dating to Spanish land grant ranches three centuries ago.',
  ST_SetSRID(ST_MakePoint(-121.0858, 37.0652), 4326)::geography,
  (SELECT id FROM poi_categories WHERE slug = 'engineering'),
  'area', 8.0, 7.0, 'curated', 'verified',
  ARRAY['san-luis-reservoir', 'water-storage', 'state-water-project', 'california-water', 'dam', 'drought'],
  'driving'
),

(
  'Pacheco Pass',
  'The gateway between coast and valley',
  'The crossing at 1,368 feet on Highway 152 has been used by travelers since the Ohlone people established trade routes between the coast and the Central Valley. Spanish missionaries and rancheros followed the same path. The pass gained notoriety for bandito attacks during the Gold Rush, when fortunes in gold dust were moved between the mines and San Francisco. Henry Miller — the cattle baron who also saved the tule elk — owned much of the surrounding ranchland. The steep descent into the San Joaquin Valley reveals one of California''s great panoramas: the flat valley floor stretching to the Sierra Nevada more than 100 miles away, with a horizon so flat it curves with the Earth.',
  ST_SetSRID(ST_MakePoint(-121.2269, 37.0127), 4326)::geography,
  (SELECT id FROM poi_categories WHERE slug = 'viewpoint'),
  'viewpoint', 10.0, 6.5, 'curated', 'verified',
  ARRAY['pacheco-pass', 'mountain-pass', 'gold-rush', 'sierra-view', 'ohlone', 'highway-152'],
  'driving'
),

(
  'Los Banos Wildlife Area',
  'Where the Pacific Flyway funnels through California',
  'The wetlands around Los Banos are the remnants of Tulare Lake, which was once the largest freshwater lake west of the Mississippi — bigger than Lake Erie. By 1898, drainage canals had converted the lake bed to farmland. The wildlife refuges that remain concentrate millions of migratory birds into a small area, making this one of the best birding sites in California. In winter, the sky can turn dark with arriving snow geese, white-fronted geese, and sandhill cranes making their annual Pacific Flyway journey. Tundra swans and 350 other bird species have been recorded here. "Los Banos" — The Baths — is a reference to natural hot springs that the first Spanish explorers found in the area.',
  ST_SetSRID(ST_MakePoint(-120.8497, 37.0577), 4326)::geography,
  (SELECT id FROM poi_categories WHERE slug = 'nature'),
  'area', 5.0, 7.0, 'curated', 'verified',
  ARRAY['los-banos', 'wildlife-refuge', 'pacific-flyway', 'birding', 'tulare-lake', 'migratory-birds'],
  'driving'
),

(
  'Patterson — Apricot Capital',
  'Where Central Valley agriculture gets personal',
  'Patterson declared itself the Apricot Capital of the World in the 1940s when the surrounding hills were blanketed in orchards that bloomed white every spring. The Central Valley''s Mediterranean climate — hot dry summers, mild wet winters — is almost perfectly calibrated for stone fruit. The orchards are mostly gone now, replaced by almonds, which tolerate drought better and yield twice the profit per acre. Patterson is also known to truckers as the midpoint between LA and the Bay Area, with a cluster of truck stops that function as informal communities with their own social codes. The nearby Diablo Range hillsides mark the transition from annual grassland to chaparral that defines the Coast Ranges.',
  ST_SetSRID(ST_MakePoint(-121.1297, 37.4724), 4326)::geography,
  (SELECT id FROM poi_categories WHERE slug = 'local_culture'),
  'point', 5.0, 5.5, 'curated', 'reviewed',
  ARRAY['patterson', 'apricots', 'agriculture', 'central-valley', 'california-farming', 'stone-fruit'],
  'driving'
),

(
  'Altamont Pass Wind Farm',
  'The pioneering wind farm with a complicated legacy',
  'The Altamont Pass Wind Resource Area hosts about 5,000 wind turbines — one of the oldest and densest concentrations of wind energy in the world. The machines were installed starting in 1981 when California offered aggressive tax incentives for renewable energy, making this the world''s first commercial-scale wind farm. For decades it generated the most wind energy of any single site in the United States. The pass has a complication: it sits in the middle of a golden eagle migration corridor, and the older lattice towers serve as ideal perches for raptors. Bird kills exceeded 1,000 per year in the early 2000s. Newer turbine designs and repositioning have reduced raptor fatalities by about 75%.',
  ST_SetSRID(ST_MakePoint(-121.6522, 37.7373), 4326)::geography,
  (SELECT id FROM poi_categories WHERE slug = 'engineering'),
  'area', 8.0, 7.5, 'curated', 'verified',
  ARRAY['wind-farm', 'altamont', 'renewable-energy', 'golden-eagle', 'turbines', 'environment'],
  'driving'
),

(
  'Sacramento-San Joaquin Delta',
  'California''s fresh water crossroads',
  'The delta formed where the Sacramento and San Joaquin Rivers meet before draining into San Francisco Bay, encompassing 1,100 miles of levee-edged channels crossing 700,000 acres of low-lying farmland — much of it reclaimed peat islands sitting below sea level. The delta supplies water to two-thirds of California''s population through massive pumps at its south end. It is also profoundly fragile: the levees are over a century old, and seismologists warn a moderate earthquake could cause simultaneous failure of dozens of levees, allowing salt water from the Bay to intrude and contaminate the freshwater supply for 25 million people. Delta asparagus and wine grapes have been produced here since the 1870s.',
  ST_SetSRID(ST_MakePoint(-121.6902, 38.1538), 4326)::geography,
  (SELECT id FROM poi_categories WHERE slug = 'nature'),
  'area', 10.0, 7.5, 'curated', 'verified',
  ARRAY['delta', 'sacramento-river', 'california-water', 'levees', 'peat-islands', 'water-supply'],
  'driving'
),

(
  'Old Sacramento Historic District',
  'Gold Rush waterfront frozen in 1850',
  'The 28-block historic district along the Sacramento River preserves the commercial district of California''s Gold Rush capital. Buildings date from the 1850s–1870s, and the raised wooden sidewalks reflect a permanent engineering solution: Sacramento flooded catastrophically almost every winter during the 19th century, so the city raised its streets and ground floors by up to 10 feet. The underground cellars and original first floors are accessible through underground tours. The transcontinental railroad''s western terminus was here — the Central Pacific broke ground at the K Street waterfront in 1863. The Delta King, a paddle-wheel riverboat moored here, once carried passengers between Sacramento and San Francisco.',
  ST_SetSRID(ST_MakePoint(-121.5065, 38.5800), 4326)::geography,
  (SELECT id FROM poi_categories WHERE slug = 'history'),
  'area', 3.0, 8.0, 'curated', 'verified',
  ARRAY['old-sacramento', 'gold-rush', 'transcontinental-railroad', 'waterfront', 'underground', 'historic-district'],
  'driving'
),

(
  'California State Capitol',
  'The gold dome at California''s center',
  'The California State Capitol, completed in 1874, sits in a 40-acre park and houses both a working state legislature and a museum open to the public. The dome is gilded with California gold. Sacramento became the permanent state capital in 1854 after moving between Monterey, San Jose, Vallejo, and Benicia — the frequent moves reflect the early state''s political chaos. The Capitol building was nearly demolished in the 1960s when Sacramento considered building a modern replacement; the restoration campaign that saved it was one of California''s first major historic preservation victories. The surrounding park contains trees from every county in the state, planted as part of a 19th-century botanical collection.',
  ST_SetSRID(ST_MakePoint(-121.4934, 38.5767), 4326)::geography,
  (SELECT id FROM poi_categories WHERE slug = 'architecture'),
  'point', 3.0, 8.0, 'curated', 'verified',
  ARRAY['state-capitol', 'sacramento', 'government', 'gold-dome', 'legislature', 'historic'],
  'driving'
),

(
  'Folsom Prison',
  'Where Johnny Cash played, and prisoners stayed',
  'Folsom State Prison opened in 1880 using convict labor to quarry granite from the American River canyon — California''s second state prison, quickly notorious for housing the most dangerous offenders. The prison''s most famous day was January 13, 1968, when Johnny Cash performed two concerts for 2,000 inmates. The recordings became the album "At Folsom Prison," which revitalized Cash''s career and became one of the best-selling country albums of all time. Cash had proposed the concert after visiting a prison in 1961 and became a lifelong prison reform advocate. The nearby Folsom Lake, created in 1955, is a major Sacramento water supply that has dropped dramatically during recent California droughts.',
  ST_SetSRID(ST_MakePoint(-121.1420, 38.6787), 4326)::geography,
  (SELECT id FROM poi_categories WHERE slug = 'history'),
  'point', 3.0, 8.0, 'curated', 'verified',
  ARRAY['folsom-prison', 'johnny-cash', 'country-music', 'prison-history', 'granite', 'california'],
  'driving'
),

(
  'Echo Summit (US-50)',
  'The Sierra crest between the goldfields and the lake',
  'At 7,382 feet, Echo Summit marks the high point of US-50 as it crosses the Sierra Nevada between Sacramento and South Lake Tahoe. The summit offers a sweeping view east toward the Lake Tahoe basin and west down the American River canyon that you just climbed. The road follows the general route of the Pony Express, which crossed the Sierra here in 1860–61 carrying mail between Missouri and Sacramento in about 10 days. In winter, the summit typically receives 200–400 inches of snow, and Caltrans maintains one of the highest-priority plowing operations in the state to keep US-50 open. Heavenly Mountain Resort is about 20 minutes down the eastern slope.',
  ST_SetSRID(ST_MakePoint(-120.0623, 38.8260), 4326)::geography,
  (SELECT id FROM poi_categories WHERE slug = 'viewpoint'),
  'viewpoint', 5.0, 7.0, 'curated', 'verified',
  ARRAY['echo-summit', 'us-50', 'sierra-nevada', 'pony-express', 'mountain-pass', 'ski'],
  'driving'
),

-- -------------------------------------------------------
-- SECTION 2: WESTERN SIERRA NEVADA
-- (Sequoia, Kings Canyon, Yosemite, Gold Country)
-- -------------------------------------------------------

(
  'General Sherman Tree',
  'The largest living thing on Earth by volume',
  'The General Sherman Tree is not the tallest, widest, or oldest tree on Earth — but it holds the title of largest living organism by volume at 52,508 cubic feet. The giant sequoia stands 275 feet tall with a 36-foot base diameter and is estimated to be 2,200–2,700 years old — it predates the Roman Empire. The tree adds enough new wood each year to build a 60-foot timber-framed house. Sequoias evolved bark up to 3 feet thick that allows them to survive periodic wildfires, which actually aid their reproduction: sequoia cones can remain on the tree for 20 years, waiting for the heat of a fire to open them and release seeds onto mineral soil cleared by the flames. The tree is in the Giant Forest of Sequoia National Park, established in 1890.',
  ST_SetSRID(ST_MakePoint(-118.7467, 36.5842), 4326)::geography,
  (SELECT id FROM poi_categories WHERE slug = 'nature'),
  'point', 5.0, 9.5, 'curated', 'verified',
  ARRAY['sequoia', 'general-sherman', 'giant-tree', 'national-park', 'old-growth', 'largest'],
  'all'
),

(
  'General Grant Grove',
  'The Nation''s Christmas Tree and a forest of giants',
  'The General Grant Tree was designated the Nation''s Christmas Tree by President Coolidge in 1926 and is the only living national shrine in the United States — a living memorial to Americans killed in war. At 267 feet tall with a base circumference of 107 feet, it is the third-largest tree on Earth. The surrounding Grant Grove in Kings Canyon National Park contains hundreds of mature sequoias creating an experience unlike any other forest — walking among trees so massive that your sense of scale completely fails. Kings Canyon was established as a national park in 1940, partly to prevent a dam proposal that would have flooded Cedar Grove below.',
  ST_SetSRID(ST_MakePoint(-118.9739, 36.7478), 4326)::geography,
  (SELECT id FROM poi_categories WHERE slug = 'nature'),
  'point', 5.0, 9.0, 'curated', 'verified',
  ARRAY['kings-canyon', 'general-grant', 'christmas-tree', 'sequoia', 'national-shrine', 'giant-forest'],
  'all'
),

(
  'Moro Rock',
  'A granite dome above the Giant Forest',
  'Moro Rock is a solitary granite dome rising 300 feet above the surrounding forest to a summit at 6,725 feet with 360-degree views across the Great Western Divide and the San Joaquin Valley below. The rock is exfoliated granite — shaped by the same peeling process that formed Half Dome in Yosemite. A staircase carved into the rock in the 1930s by the Civilian Conservation Corps allows hikers to reach the summit in about 15 minutes. On clear days the view west extends all the way to the Coast Ranges and, in some conditions, the Salton Sea. The name Moro is believed to derive from the Spanish word for Moorish or dark, a reference to the rock''s color.',
  ST_SetSRID(ST_MakePoint(-118.7652, 36.5455), 4326)::geography,
  (SELECT id FROM poi_categories WHERE slug = 'viewpoint'),
  'viewpoint', 5.0, 8.0, 'curated', 'verified',
  ARRAY['moro-rock', 'sequoia', 'granite', 'panorama', 'ccc', 'summit'],
  'all'
),

(
  'Hume Lake',
  'The Sierra''s hidden reservoir with a logging past',
  'Hume Lake sits at 5,200 feet in a granite basin above Kings Canyon and has the feel of a private discovery — a clear, blue reservoir ringed with mixed conifer forest and granite outcrops. The lake was created in 1908 by a logging dam built to power a flume that floated cut lumber 54 miles down to the San Joaquin Valley. The Hume-Bennett Lumber Company harvested sequoia from the surrounding forests — a practice later prohibited when the national park was expanded. The surrounding Sequoia National Forest contains Converse Basin, where the world''s largest sequoia grove was logged to near-extinction in the 1890s. A few surviving giants remain as testament to what was lost.',
  ST_SetSRID(ST_MakePoint(-118.8964, 36.7935), 4326)::geography,
  (SELECT id FROM poi_categories WHERE slug = 'hidden_gems'),
  'area', 3.0, 6.5, 'curated', 'reviewed',
  ARRAY['hume-lake', 'kings-canyon', 'logging-history', 'sequoia', 'sierra', 'reservoir'],
  'all'
),

(
  'Cedar Grove — Kings Canyon Scenic Byway',
  'One of the deepest canyons in North America',
  'Kings Canyon at Cedar Grove is deeper than the Grand Canyon — up to 8,200 feet from the canyon rim to the Kings River below — making it one of the deepest gorges in North America. The road into Cedar Grove drops 2,600 feet through switchbacks into a world of granite walls and roaring river. The Kings River here runs Class IV–V whitewater and is one of the premier rafting destinations in California during spring runoff. The canyon walls expose billion-year-old metamorphic rocks older than most Sierra Nevada granite, revealing California''s geological basement. The valley is a glacially-carved trough similar to Yosemite but without the crowds, and the road is open only in summer.',
  ST_SetSRID(ST_MakePoint(-118.5978, 36.7873), 4326)::geography,
  (SELECT id FROM poi_categories WHERE slug = 'viewpoint'),
  'viewpoint', 5.0, 8.5, 'curated', 'verified',
  ARRAY['kings-canyon', 'cedar-grove', 'deep-canyon', 'kings-river', 'whitewater', 'scenic-byway'],
  'all'
),

(
  'Tunnel View (Yosemite)',
  'The view that defined American nature photography',
  'The moment you emerge from the Wawona Tunnel and the valley opens before you is one of the most photographed vistas in the world. Ansel Adams produced his famous "Valley View" from near this spot in 1944, solidifying Yosemite Valley as the icon of American wilderness photography. The composition encompasses Half Dome at center, El Capitan to the left, and Bridalveil Fall to the right — seemingly staged by nature. The Wawona Tunnel, completed in 1933, was the longest highway tunnel in the country at the time of its construction at 4,233 feet. Yosemite Valley itself is a glacially-carved trough cut by at least three major glacial advances over the last 2 million years.',
  ST_SetSRID(ST_MakePoint(-119.6765, 37.7163), 4326)::geography,
  (SELECT id FROM poi_categories WHERE slug = 'viewpoint'),
  'viewpoint', 3.0, 9.5, 'curated', 'verified',
  ARRAY['yosemite', 'tunnel-view', 'ansel-adams', 'half-dome', 'el-capitan', 'iconic'],
  'all'
),

(
  'El Capitan',
  'The vertical mile that changed climbing',
  'El Capitan rises 3,000 feet from the Yosemite Valley floor — the largest exposed granite face on Earth. The first ascent was completed by Warren Harding and his team in 47 days of climbing spread across 1958–1960. The Nose route they pioneered has been climbed by thousands since. In 2018, Alex Honnold free-soloed El Capitan''s Nose route — climbing 3,000 feet of sheer granite with no rope — in 3 hours, 56 minutes. The feat, documented in the film "Free Solo," is considered one of the greatest athletic achievements in history. The granite of El Capitan formed from magma that intruded into the Sierra Nevada about 100 million years ago and was polished to its current state by glaciers.',
  ST_SetSRID(ST_MakePoint(-119.6376, 37.7291), 4326)::geography,
  (SELECT id FROM poi_categories WHERE slug = 'geology'),
  'viewpoint', 10.0, 9.5, 'curated', 'verified',
  ARRAY['el-capitan', 'yosemite', 'rock-climbing', 'granite', 'alex-honnold', 'free-solo'],
  'all'
),

(
  'Yosemite Falls',
  'North America''s tallest waterfall',
  'Yosemite Falls drops 2,425 feet in three tiers — the upper fall alone drops 1,430 feet, which is taller than the Empire State Building. The falls run primarily April through July, fed by snowmelt from the upper valley, and may stop completely in dry Augusts. The Ahwahneechee Miwok people called the falls "Cholock" and believed a spirit called Po-ho-no inhabited the flowing water. The first non-indigenous visitors to describe the falls were members of the Mariposa Battalion in 1851, entering the valley on a military expedition to relocate the Ahwahneechee. During peak flow in May and June, the waterfall''s roar is audible throughout the valley, and evening mist rainbows are common.',
  ST_SetSRID(ST_MakePoint(-119.5963, 37.7575), 4326)::geography,
  (SELECT id FROM poi_categories WHERE slug = 'nature'),
  'point', 5.0, 9.0, 'curated', 'verified',
  ARRAY['yosemite-falls', 'waterfall', 'tallest', 'miwok', 'snowmelt', 'north-america'],
  'all'
),

(
  'Mariposa — Gold Rush County Seat',
  'California''s oldest courthouse still in continuous use',
  'The Mariposa County Courthouse, built in 1854, is the oldest courthouse still in continuous operation in California and one of the oldest west of the Mississippi. Mariposa was a major supply town for the southern gold fields, and the surrounding mountains produced millions in gold through the 1880s. The town sits at the junction of Highway 140 — the main year-round route into Yosemite — and maintains its Gold Rush-era character. The Mariposa Museum and History Center houses one of the best collections of Gold Rush artifacts in the Sierra Nevada foothills. The name Mariposa means "butterfly" in Spanish, referring to the abundance of butterflies early explorers observed in the oak-covered foothills.',
  ST_SetSRID(ST_MakePoint(-119.9664, 37.4841), 4326)::geography,
  (SELECT id FROM poi_categories WHERE slug = 'history'),
  'point', 5.0, 7.0, 'curated', 'verified',
  ARRAY['mariposa', 'gold-rush', 'courthouse', 'yosemite-gateway', 'california-history', 'foothills'],
  'driving'
),

(
  'Columbia State Historic Park',
  'The best-preserved Gold Rush town in California',
  'Columbia was founded in 1850 and within two months had a population of 5,000 gold seekers. The town produced $87 million in gold during its heyday — over $2.5 billion in today''s money. Unlike most Gold Rush towns that became ghost towns, Columbia''s brick commercial district survived because local miners raised money to buy a fire engine from San Francisco after devastating fires in 1852 and 1854. The California State Park system has preserved 12 square blocks of the 1850s commercial district as a living history museum. Visitors can pan for gold using original techniques, ride stagecoaches, and eat in buildings unchanged since the 1850s.',
  ST_SetSRID(ST_MakePoint(-120.4040, 38.0330), 4326)::geography,
  (SELECT id FROM poi_categories WHERE slug = 'history'),
  'area', 3.0, 8.0, 'curated', 'verified',
  ARRAY['columbia', 'gold-rush', 'state-historic-park', 'mother-lode', 'living-history', '1850s'],
  'driving'
),

(
  'Calaveras Big Trees State Park',
  'The discovery that shocked the Victorian world',
  'When Augustus Dowd reported finding trees so large he could dance on a single stump, no one believed him. When the American public finally accepted the reality of the giant sequoias in 1852, the trees became a Victorian sensation. Bark sections were shipped to New York, London, and Paris for display, and P.T. Barnum promoted them as the "eighth wonder of the world." One grove was logged in the 1880s, and the largest stump — 23 feet in diameter — was used as a dance floor and bowling alley for decades. The North Grove contains about 150 mature sequoias. Naturalist John Muir lobbied here in the 1890s in a campaign that helped launch the national park movement.',
  ST_SetSRID(ST_MakePoint(-120.3118, 38.2724), 4326)::geography,
  (SELECT id FROM poi_categories WHERE slug = 'nature'),
  'area', 5.0, 8.0, 'curated', 'verified',
  ARRAY['calaveras', 'big-trees', 'sequoia', 'victorian', 'p-t-barnum', 'john-muir'],
  'driving'
),

(
  'Angels Camp — Mark Twain Country',
  'Where Twain found his voice and his jumping frog',
  'In 1865, Samuel Clemens — not yet famous as Mark Twain — was staying at the Angels Hotel trying to cure a cold when he heard a barroom tale about a frog-jumping contest. The story became "The Celebrated Jumping Frog of Calaveras County," Twain''s first nationally recognized work. The story made him famous overnight. Angels Camp has hosted an annual Jumping Frog Jubilee every May since 1928, attracting thousands of frog entries from across the country. The current record is 21 feet, 5¾ inches, set in 1986. The town sits in Mother Lode country and produced significant gold in the 1850s. Writer Bret Harte also worked this territory and briefly collaborated with Twain.',
  ST_SetSRID(ST_MakePoint(-120.5390, 38.0691), 4326)::geography,
  (SELECT id FROM poi_categories WHERE slug = 'history'),
  'point', 5.0, 7.5, 'curated', 'verified',
  ARRAY['mark-twain', 'jumping-frog', 'angels-camp', 'calaveras', 'gold-rush', 'literature'],
  'driving'
),

(
  'Sutter''s Mill — Marshall Gold Discovery State Park',
  'The moment that changed American history',
  'On January 24, 1848, James Marshall spotted flakes of gold in the tailrace of John Sutter''s mill on the American River here at Coloma. Sutter tried to keep it secret — he feared a gold rush would destroy his agricultural empire. Within months, word had leaked, and by 1849 over 300,000 people had descended on California. The Gold Rush accelerated California''s statehood (1850), built San Francisco virtually overnight, and helped trigger the transcontinental railroad. A replica of the original mill operates on weekends. Marshall is buried on the hill above the discovery site, with a statue pointing to the exact spot. The discovery occurred nine days after Mexico ceded California to the U.S. under the Treaty of Guadalupe Hidalgo.',
  ST_SetSRID(ST_MakePoint(-120.8846, 38.7986), 4326)::geography,
  (SELECT id FROM poi_categories WHERE slug = 'history'),
  'point', 3.0, 9.5, 'curated', 'verified',
  ARRAY['sutters-mill', 'gold-rush', 'james-marshall', 'coloma', 'california-statehood', 'gold-discovery'],
  'driving'
),

(
  'Amador County Wine Country',
  'The Gold Rush vineyards that outlasted the mines',
  'When gold miners needed a drink, they planted vines. Zinfandel was the grape of choice in Amador County''s Shenandoah Valley, planted from cuttings brought around Cape Horn during the Gold Rush. Some of those original "old vines" are still producing from root systems over 130 years old. Old-vine Zinfandel from Amador County fetches premium prices and has a distinctive character: high alcohol, dark fruit, and a rusticity that reflects the rocky volcanic soils of the Sierra foothills. The region nearly disappeared during Prohibition and struggled for decades in Napa''s shadow, but has seen a significant wine renaissance since the 1990s.',
  ST_SetSRID(ST_MakePoint(-120.7270, 38.4800), 4326)::geography,
  (SELECT id FROM poi_categories WHERE slug = 'food_drink'),
  'area', 10.0, 7.0, 'curated', 'verified',
  ARRAY['amador', 'wine-country', 'zinfandel', 'sierra-foothills', 'old-vines', 'gold-rush'],
  'driving'
),

-- -------------------------------------------------------
-- SECTION 3: SOUTHERN SIERRA NEVADA
-- (Kern River, Walker Pass, Mojave connections)
-- -------------------------------------------------------

(
  'Lake Isabella and the Kern River',
  'The only wild and scenic river in the southern Sierra',
  'The Kern River drains the southern end of the Sierra Nevada through one of the most dramatic canyons in California before reaching Lake Isabella, an 11,200-acre reservoir created by Isabella Dam in 1953. The river above the reservoir is designated Wild and Scenic — the southernmost such designation in the Sierra. The Kern River Gorge is famous for Class IV–V whitewater, and the river has claimed more lives per mile than almost any river in California. Below the dam, the Kern flows through Bakersfield and eventually disappears into irrigation channels. Isabella Dam is currently being seismically retrofitted following concerns about earthquake vulnerability — one of the most expensive dam safety projects in California history.',
  ST_SetSRID(ST_MakePoint(-118.4718, 35.6232), 4326)::geography,
  (SELECT id FROM poi_categories WHERE slug = 'nature'),
  'area', 8.0, 7.5, 'curated', 'verified',
  ARRAY['kern-river', 'lake-isabella', 'whitewater', 'wild-scenic', 'dam', 'southern-sierra'],
  'all'
),

(
  'Kern River Gorge',
  'Class V whitewater in a box canyon',
  'The upper Kern River Gorge cuts through a canyon so sheer that the road clings to one wall while the river crashes below. The Kern drops nearly 6,000 feet from its headwaters near Mount Whitney to Lake Isabella — one of the steepest descents of any Sierra river. The result is continuous Class IV–V whitewater that attracts expert kayakers from across the country. The gorge also contains remnant old-growth mixed conifer forest — giant ponderosa and incense cedar — that survived because the steep terrain made logging impractical. Bighorn sheep occupy the rocky ridgelines, and California condors, reintroduced in the 1990s, are occasionally seen soaring overhead. The Kern is unique among Sierra rivers in flowing south, parallel to the mountain range rather than perpendicular to it.',
  ST_SetSRID(ST_MakePoint(-118.4238, 35.7542), 4326)::geography,
  (SELECT id FROM poi_categories WHERE slug = 'geology'),
  'area', 3.0, 7.5, 'curated', 'verified',
  ARRAY['kern-gorge', 'whitewater', 'canyon', 'bighorn-sheep', 'condor', 'class-v'],
  'all'
),

(
  'Kernville',
  'The frontier town that moved for a reservoir',
  'The original Kernville was founded during a gold and silver rush in the 1860s and grew into a ranching and mining community of over 1,000 people. When Isabella Dam was built in the early 1950s, the entire town was relocated two miles north before the valley flooded. Residents moved their homes, exhumed their dead, and rebuilt their town building by building. Old Kernville — the original townsite — is now 30 feet underwater during high reservoir years, but drought years have exposed the old foundations repeatedly. The relocated town has an authentically Western character: wood-front buildings on Main Street, an outfitter culture for Kern River kayaking, and an annual Whiskey Flat Days celebration honoring the original mining community.',
  ST_SetSRID(ST_MakePoint(-118.4258, 35.7536), 4326)::geography,
  (SELECT id FROM poi_categories WHERE slug = 'history'),
  'point', 3.0, 6.5, 'curated', 'reviewed',
  ARRAY['kernville', 'relocated-town', 'reservoir', 'mining-history', 'kern-river', 'ghost-town'],
  'driving'
),

(
  'Walker Pass',
  'The low road over the southern Sierra',
  'Walker Pass at 5,245 feet is the lowest crossing of the Sierra Nevada south of Sonora Pass and was used by indigenous people for thousands of years as a trade route between the Owens Valley and the San Joaquin Valley. Joseph Walker became the first Euro-American to cross the Sierra Nevada here in 1834 — two years before anyone knew about the higher passes. The pass was briefly considered as a route for the transcontinental railroad before the higher but more direct Donner Pass was chosen. Today Highway 178 crosses the pass, and the Pacific Crest Trail uses it as a major waypoint — PCT hikers face a long, waterless stretch approaching from the south Mojave desert.',
  ST_SetSRID(ST_MakePoint(-118.0124, 35.6572), 4326)::geography,
  (SELECT id FROM poi_categories WHERE slug = 'history'),
  'point', 5.0, 7.0, 'curated', 'verified',
  ARRAY['walker-pass', 'sierra-crossing', 'pacific-crest-trail', 'joseph-walker', 'emigrant-trail', 'pct'],
  'driving'
),

(
  'Kennedy Meadows — Southern Sierra Gateway',
  'Mile 700 of the Pacific Crest Trail',
  'Kennedy Meadows sits at mile 700 of the Pacific Crest Trail, marking the unofficial end of the desert section and the start of the High Sierra. Every year from late May through July, hundreds of PCT thru-hikers converge here to resupply, pick up ice axes and crampons for snow-covered Sierra passes, and eat enormous meals before the hardest section of the trail. The community has developed an intense culture around thru-hiker traditions: the iconic general store, the bear box requirement that begins here. The surrounding South Fork Kern corridor protects the California golden trout — the state fish — in its only native habitat in the Golden Trout Wilderness.',
  ST_SetSRID(ST_MakePoint(-118.0038, 35.9793), 4326)::geography,
  (SELECT id FROM poi_categories WHERE slug = 'recreation'),
  'point', 5.0, 7.0, 'curated', 'verified',
  ARRAY['kennedy-meadows', 'pct', 'pacific-crest-trail', 'thru-hiking', 'golden-trout', 'sierra-start'],
  'all'
),

(
  'Fossil Falls',
  'A dry waterfall carved by a river that vanished',
  'Fossil Falls is a series of sculpted lava formations where the ancient Owens River once plunged through a basalt flow. The river ran here during the last ice age when Sierra snowmelt was abundant — flowing water carved the lava into smooth, bowl-shaped potholes and chutes over thousands of years. The river is gone now — its water captured by the Los Angeles Aqueduct — but the rock art remains. The polished black basalt walls and floor look almost artificially smooth. This site sits in the transition zone between the Mojave Desert and the Great Basin. Archaeological evidence shows it was used by Native Americans for over 10,000 years as a campsite beside what was then a reliable water source.',
  ST_SetSRID(ST_MakePoint(-117.9061, 35.9627), 4326)::geography,
  (SELECT id FROM poi_categories WHERE slug = 'geology'),
  'point', 5.0, 7.5, 'curated', 'verified',
  ARRAY['fossil-falls', 'basalt', 'lava', 'owens-river', 'ice-age', 'native-american'],
  'all'
),

(
  'Coso Volcanic Field',
  'The active volcanic field hiding in the desert',
  'The Coso Volcanic Field is one of the most geothermally active areas in the United States — hundreds of volcanic vents, hot springs, and fumaroles spread across 75 square miles of eastern Kern County. The most recent eruptions occurred only 38,000 years ago. Coso sits within the China Lake Naval Weapons Center boundary, which has restricted access but also protected it from development. The Navy uses geothermal energy from Coso to power the base — one of the largest military geothermal installations in the world. Coso Range obsidian was one of the most valued trade materials among California indigenous peoples; obsidian from this source has been found in archaeological sites from the Pacific coast to the Rocky Mountains.',
  ST_SetSRID(ST_MakePoint(-117.8000, 36.0500), 4326)::geography,
  (SELECT id FROM poi_categories WHERE slug = 'geology'),
  'area', 10.0, 7.5, 'curated', 'verified',
  ARRAY['coso', 'volcanic', 'geothermal', 'obsidian', 'china-lake', 'military'],
  'driving'
),

(
  'Trona Pinnacles',
  'An alien landscape of calcium carbonate spires',
  'The Trona Pinnacles rise from the floor of a dry lake bed — the remnant of Searles Lake, which covered this area during the last ice age. The 500 tufa spire formations, some reaching 140 feet, formed underwater as calcium-rich springs bubbled through the alkaline lake, precipitating calcium carbonate in formations similar to Mono Lake''s tufas but much larger. The pinnacles have appeared in dozens of science fiction films including Star Trek V and Planet of the Apes because their alien appearance is difficult to replicate in CGI. The dry lake still contains significant mineral deposits — Searles Lake is one of the most mineral-rich brines in the world, containing sodium, potassium, boron, and lithium — and has been mined continuously since the 1870s.',
  ST_SetSRID(ST_MakePoint(-117.4025, 35.6469), 4326)::geography,
  (SELECT id FROM poi_categories WHERE slug = 'geology'),
  'area', 10.0, 8.0, 'curated', 'verified',
  ARRAY['trona-pinnacles', 'tufa', 'searles-lake', 'film-location', 'geological', 'alien-landscape'],
  'driving'
),

(
  'Little Lake Cinder Cones',
  'Volcanic remnants at the Mojave-Great Basin border',
  'The cluster of dark cinder cones and lava flows near Little Lake represents one of the more recent volcanic episodes in the Owens Valley region — eruptions estimated between 10,000 and 100,000 years old, making them potentially active by geological standards. The cones were built by explosive eruptions that threw scoria (lightweight volcanic rock) in halos around each vent. Little Lake itself is a spring-fed oasis where groundwater rises through fractured basalt — one of the few permanent water sources between Fossil Falls and Lone Pine. Paiute people used this location for thousands of years, and petroglyphs have been recorded in the surrounding lava fields.',
  ST_SetSRID(ST_MakePoint(-117.9142, 35.9352), 4326)::geography,
  (SELECT id FROM poi_categories WHERE slug = 'geology'),
  'point', 5.0, 6.5, 'curated', 'reviewed',
  ARRAY['little-lake', 'cinder-cones', 'volcanic', 'paiute', 'oasis', 'basalt'],
  'driving'
),

(
  'China Lake Naval Air Weapons Station',
  'Where America''s air-to-air missiles were born',
  'The valley you''re passing holds one of the most significant military research installations in American history. China Lake Naval Air Weapons Station covers 1.1 million acres — larger than Rhode Island — and was established in 1943 specifically to develop aerial weapons away from populated areas. The Sidewinder missile, primary air-to-air missile in every U.S. aircraft since the Korean War, was invented here. The Zuni rocket, Sparrow missile, and HARM anti-radiation missile all came from China Lake. The base is run by civilian scientists rather than military officers — a unique arrangement producing a remarkable concentration of PhD engineers in the small community of Ridgecrest. The 2019 Ridgecrest earthquake sequence (M7.1) severely damaged facilities here.',
  ST_SetSRID(ST_MakePoint(-117.6912, 35.6995), 4326)::geography,
  (SELECT id FROM poi_categories WHERE slug = 'history'),
  'area', 10.0, 8.0, 'curated', 'verified',
  ARRAY['china-lake', 'navy', 'sidewinder-missile', 'military-research', 'ridgecrest', 'weapons'],
  'driving'
),

(
  'Maturango Museum (Ridgecrest)',
  'Desert rock art and military history at the end of a dead-end highway',
  'The Maturango Museum in Ridgecrest documents the remarkable rock art of the Coso Range — one of the largest concentrations of petroglyphs in the western hemisphere, with over 100,000 individual images carved into volcanic rock surfaces. Access to the China Lake base where the petroglyphs are located is restricted, but the museum offers guided tours twice a year. The images include bighorn sheep in extraordinary numbers, suggesting the area was a major hunting site for thousands of years before the Navy arrived. The museum also documents the unique culture of a scientific-military town where many residents hold security clearances and work on classified projects they cannot discuss publicly.',
  ST_SetSRID(ST_MakePoint(-117.6709, 35.6225), 4326)::geography,
  (SELECT id FROM poi_categories WHERE slug = 'history'),
  'point', 5.0, 7.0, 'curated', 'verified',
  ARRAY['maturango', 'petroglyphs', 'coso', 'rock-art', 'native-american', 'china-lake'],
  'driving'
),

(
  'Jawbone Canyon OHV Area',
  'The off-road corridor into the Tehachapis',
  'Jawbone Canyon is a natural break in the Tehachapi Mountains that has been used for millennia as a passage from the Mojave Desert to the Kern River Valley. Now managed as an off-highway vehicle recreation area, it offers 100-plus miles of designated dirt roads and trails through pinyon-juniper woodland and chaparral. The canyon walls show some of the most varied geology in the southern Sierra foothills — Miocene volcanic rocks overlain on ancient marine sediments overlain on Jurassic granite — all visible within a few miles. Rattlesnake populations here are high due to abundant prey, and the Mojave green rattlesnake — considered among the most venomous in North America — is native to this corridor.',
  ST_SetSRID(ST_MakePoint(-118.2043, 35.2710), 4326)::geography,
  (SELECT id FROM poi_categories WHERE slug = 'recreation'),
  'area', 5.0, 5.5, 'curated', 'reviewed',
  ARRAY['jawbone-canyon', 'ohv', 'off-road', 'tehachapi', 'geology', 'mojave'],
  'driving'
),

(
  'Piute Mountains Wilderness',
  'The quiet corner of the southern Sierra',
  'The Piute Mountains form the southwestern buttress of the Sierra Nevada, reaching elevations over 8,400 feet and supporting the southernmost stands of ponderosa pine and black oak in the Sierra chain. The wilderness receives few visitors because it lacks the dramatic granite scenery of the northern Sierra, but offers exceptional solitude, wildlife habitat, and views south into the Mojave. The pinyon-juniper forest covering the lower slopes was one of California''s most productive nut-producing habitats: pinyon pine seeds (pine nuts) were a critical food source for the Kawaiisu people for thousands of years. The Kawaiisu wintered in the Mojave Desert below and spent summers in these cooler mountains following the seasonal food supply.',
  ST_SetSRID(ST_MakePoint(-118.4750, 35.4260), 4326)::geography,
  (SELECT id FROM poi_categories WHERE slug = 'nature'),
  'area', 10.0, 6.0, 'curated', 'reviewed',
  ARRAY['piute-mountains', 'wilderness', 'ponderosa', 'kawaiisu', 'pinyon', 'solitude'],
  'all'
),

(
  'Tulare Lake (Historic)',
  'The lake that agriculture erased',
  'Where I-5 crosses the southern San Joaquin Valley, the land was once occupied by Tulare Lake — the largest freshwater lake west of the Mississippi and one of the most productive fisheries and waterfowl habitats in North America. The Yokuts people lived in villages along the lakeshore for thousands of years, using tule reeds to build boats and houses. By 1920, agricultural drainage had completely eliminated the lake, converting what is now some of the world''s most productive farmland. The salmon that once migrated from the Pacific into Tulare Lake are now regionally extinct. In 2023, extraordinary atmospheric river storms temporarily recreated portions of Tulare Lake for the first time in a century, flooding farmland that had not been underwater in living memory.',
  ST_SetSRID(ST_MakePoint(-119.7210, 35.9150), 4326)::geography,
  (SELECT id FROM poi_categories WHERE slug = 'history'),
  'area', 10.0, 7.5, 'curated', 'verified',
  ARRAY['tulare-lake', 'yokuts', 'wetlands', 'california-ecology', 'drainage', 'central-valley'],
  'driving'
),

(
  'Carrizo Plain and the San Andreas Fault',
  'The world''s most famous fault at the surface',
  'The Temblor Range visible to the west of I-5 is literally being pushed up by the San Andreas Fault, which runs along its eastern base. This is one of the few places in California where the surface expression of the world''s most famous fault system is visible — offset stream channels, displaced ridges, and the characteristic linear valley that marks the fault trace. The Carrizo Plain to the west contains Soda Lake, one of California''s largest remaining alkali wetlands. The 1857 Fort Tejon earthquake ruptured 225 miles of surface here, offsetting features by 30 feet, and was felt from Los Angeles to San Diego. The fault creeps and lurches on a cycle of roughly 150–300 years at this location.',
  ST_SetSRID(ST_MakePoint(-119.6540, 35.1250), 4326)::geography,
  (SELECT id FROM poi_categories WHERE slug = 'geology'),
  'area', 15.0, 8.0, 'curated', 'verified',
  ARRAY['san-andreas-fault', 'carrizo-plain', 'temblor', 'earthquake', 'geology', 'fault-trace'],
  'driving'
),

-- -------------------------------------------------------
-- SECTION 4: EASTERN SIERRA — Additional Coverage
-- -------------------------------------------------------

(
  'Convict Lake',
  'A beauty with a violent name',
  'Convict Lake was named in 1871 when a group of prisoners who escaped from the Nevada State Prison were tracked here by a posse; a lawman and a convict were killed in the resulting gunfight. The lake itself is one of the most photographed spots in the Eastern Sierra — a mirror-still alpine lake at 7,583 feet ringed by dramatic peaks: Mount Morrison, Red Slate Mountain, and Mount Laurel rising 4,000 feet above the shoreline. The surrounding rock is primarily Triassic-era metamorphic material — some of the oldest rock in the Sierra — giving the mountains reddish and purple hues unlike the gray granite of the higher peaks. The lake and resort offer excellent trout fishing and is accessible year-round as a short side road off US-395.',
  ST_SetSRID(ST_MakePoint(-118.8506, 37.5937), 4326)::geography,
  (SELECT id FROM poi_categories WHERE slug = 'nature'),
  'area', 3.0, 8.0, 'curated', 'verified',
  ARRAY['convict-lake', 'eastern-sierra', 'alpine-lake', 'photography', 'trout-fishing', 'metamorphic'],
  'all'
),

(
  'Rock Creek Canyon — Tom''s Place',
  'The gateway to the high alpine above Mammoth',
  'Rock Creek Road climbs from the Tom''s Place junction on US-395 to Rock Creek Lake at 10,000 feet — one of the highest paved roads in California. The canyon is a glacially-carved trough with polished granite walls and a clear stream supporting exceptional wild trout. Tom''s Place Resort has operated since the 1920s as a supply stop for fishermen and hunters, and the diner serves breakfast that fuels alpine hikers. The road continues on foot from Rock Creek Lake into the John Muir Wilderness, accessing dozens of high-altitude lakes above 11,000 feet and eventually connecting to the Sierra Crest above 13,000 feet.',
  ST_SetSRID(ST_MakePoint(-118.7280, 37.5580), 4326)::geography,
  (SELECT id FROM poi_categories WHERE slug = 'hidden_gems'),
  'area', 3.0, 7.0, 'curated', 'reviewed',
  ARRAY['rock-creek', 'toms-place', 'eastern-sierra', 'alpine', 'trout', 'john-muir-wilderness'],
  'all'
),

(
  'Crowley Lake',
  'The Eastern Sierra''s premier trophy trout reservoir',
  'Crowley Lake, formed by Long Valley Dam in 1941, sits at 6,781 feet in the Long Valley caldera — its floor was covered by the 760,000-year-old supervolcanic eruption that created the caldera. The reservoir attracts anglers from across California for trophy-sized rainbow and brown trout, and opening day in late April regularly draws thousands of boats. The lake''s unusual shore includes tufa columns similar to Mono Lake''s — formed by calcium-carbonate precipitation driven by underwater hot springs. The caldera beneath the lake still shows active geothermal activity, and portions of the lakeshore are noticeably warm from subsurface volcanic heat.',
  ST_SetSRID(ST_MakePoint(-118.7257, 37.5898), 4326)::geography,
  (SELECT id FROM poi_categories WHERE slug = 'nature'),
  'area', 5.0, 6.5, 'curated', 'reviewed',
  ARRAY['crowley-lake', 'fishing', 'trout', 'long-valley', 'caldera', 'reservoir'],
  'all'
),

(
  'Benton Hot Springs',
  'A ghost town that reinvented itself in hot water',
  'The small community of Benton was established in 1865 as a supply hub for silver mines in the Benton Range and briefly became a rowdy mining camp with saloons and a newspaper. The mines played out by 1880 and the population collapsed. What remained was a scattering of historic adobe and frame buildings — and a remarkable supply of geothermal hot water reaching 140°F at the source. Today the site operates as a small resort centered on private-use hot spring tubs built into the ruins of the old mining town. The setting — open desert, snow-capped White Mountains to the east, volcanic Benton Range to the west — is quintessential Eastern Sierra. The road from US-395 passes through some of the least-visited desert in California.',
  ST_SetSRID(ST_MakePoint(-118.4768, 37.8156), 4326)::geography,
  (SELECT id FROM poi_categories WHERE slug = 'hidden_gems'),
  'point', 5.0, 6.5, 'curated', 'reviewed',
  ARRAY['benton-hot-springs', 'ghost-town', 'hot-springs', 'mining', 'eastern-sierra', 'geothermal'],
  'all'
),

(
  'Glass Mountain',
  'An obsidian dome above the Owens Valley',
  'Glass Mountain, elevation 11,123 feet, is a volcanic dome composed almost entirely of obsidian — volcanic glass — that erupted only about 650 years ago, making it one of the most recent volcanic events in the Sierra Nevada. The summit is littered with natural obsidian cobbles and chunks that reflect sunlight like broken mirrors. Obsidian from this source is chemically distinctive and has been traced by archaeologists to sites across the American West — it was one of the most traded materials among indigenous peoples because it produces the sharpest cutting edges of any natural material, sharper than surgical steel. The surrounding Glass Creek Meadow is an excellent wildflower site in summer.',
  ST_SetSRID(ST_MakePoint(-119.0000, 37.7790), 4326)::geography,
  (SELECT id FROM poi_categories WHERE slug = 'geology'),
  'point', 8.0, 7.5, 'curated', 'verified',
  ARRAY['glass-mountain', 'obsidian', 'volcanic', 'trade-material', 'native-american', 'recent-eruption'],
  'all'
),

(
  'Lee Vining Canyon — Tioga Road',
  'The eastern gateway to Yosemite',
  'Lee Vining Canyon carries Highway 120 (Tioga Road) up 3,000 feet from Mono Lake at 6,380 feet to Tioga Pass at 9,943 feet — the highest paved highway crossing in California. The canyon road was originally built in 1883 as a mining road and paved incrementally through the 20th century. The canyon walls expose a complete cross-section of the Sierra''s geological history: Triassic-era marine sediments at the bottom, intruded by Jurassic granites, topped by Cretaceous batholith, overlaid by Pleistocene glacial deposits. The road is closed from November through late May — some years into July. The view from Tioga Pass looking west into Yosemite''s high country is one of the great mountain vistas in California.',
  ST_SetSRID(ST_MakePoint(-119.2141, 37.9548), 4326)::geography,
  (SELECT id FROM poi_categories WHERE slug = 'viewpoint'),
  'viewpoint', 5.0, 8.0, 'curated', 'verified',
  ARRAY['lee-vining', 'tioga-road', 'yosemite', 'tioga-pass', 'high-sierra', 'mining-road'],
  'all'
),

(
  'Lundy Canyon',
  'A hidden waterfall canyon above Mono Lake',
  'Lundy Canyon is one of the Eastern Sierra''s best-kept secrets — a narrow canyon draining into Mono Lake that hosts multiple waterfalls, a historic mill site, beaver-created wetlands, and exceptional fall color from aspens and willows. The canyon served as a mill site for the Homer Mining District in the 1880s, processing ore from mines accessible only via a precarious trail. Mill Creek flows year-round, creating a riparian corridor in contrast to the surrounding Great Basin desert. The beaver population here is unusual — Great Basin beavers were extirpated by 1900 and recolonized from Sierra drainages in the mid-20th century. The upper canyon has a trail to Lundy Lake and several wilderness lakes beyond.',
  ST_SetSRID(ST_MakePoint(-119.2400, 38.0400), 4326)::geography,
  (SELECT id FROM poi_categories WHERE slug = 'hidden_gems'),
  'area', 3.0, 7.0, 'curated', 'reviewed',
  ARRAY['lundy-canyon', 'waterfall', 'aspen', 'beaver', 'mono-lake', 'mining'],
  'all'
),

(
  'Twin Lakes — Bridgeport Valley',
  'Trophy trout at the base of the Sawtooth Ridge',
  'Twin Lakes, at 7,089 feet just south of Bridgeport, consists of two connected lakes in a classic glacial valley beneath the Sawtooth Ridge — one of the Sierra''s most dramatic granite skylines. The lakes are renowned for large brown trout; the California state record brown trout (26 pounds, 8 ounces) was caught here in 1987. The resort and campground at the upper lake has operated since the 1920s. Above the lakes, the Hoover Wilderness provides access to alpine lake chains in the headwaters of the East Walker River. The Sawtooth Ridge — with peaks approaching 12,000 feet — forms the Sierra Crest and the California-Nevada state line at this latitude.',
  ST_SetSRID(ST_MakePoint(-119.3590, 38.1713), 4326)::geography,
  (SELECT id FROM poi_categories WHERE slug = 'nature'),
  'area', 5.0, 7.0, 'curated', 'verified',
  ARRAY['twin-lakes', 'bridgeport', 'brown-trout', 'sawtooth-ridge', 'fishing', 'alpine'],
  'all'
),

(
  'Wheeler Crest',
  'The abrupt wall of the Eastern Sierra',
  'The Wheeler Crest is the dramatically steep escarpment rising from the Owens Valley floor at 4,000 feet to the 13,000-foot crest in less than 5 horizontal miles — one of the greatest topographic reliefs in the lower 48 states. The fault-scarp that produced this gradient is still active: the range is rising and the valley is sinking. The 1872 Owens Valley earthquake — magnitude 7.3, the largest historical earthquake in California at the time — occurred along this fault system near Lone Pine. GPS instruments today measure the Sierra crest here rising about 3 millimeters per year relative to the valley floor. There is no gentle foothills transition: just desert floor and then a wall of granite.',
  ST_SetSRID(ST_MakePoint(-118.5030, 37.3700), 4326)::geography,
  (SELECT id FROM poi_categories WHERE slug = 'geology'),
  'viewpoint', 10.0, 7.5, 'curated', 'verified',
  ARRAY['wheeler-crest', 'sierra-escarpment', 'fault-scarp', 'eastern-sierra', 'uplift', 'geology'],
  'driving'
),

(
  'Pine Creek Tungsten Mine',
  'Where the Sierra hid strategic metals for World War II',
  'The Pine Creek Mine above Bishop produced tungsten — a metal essential for hardening steel for military use — and was one of the most significant tungsten mines in the United States during World War II. Tungsten ore was mined here from 1916 through 1990, when declining prices made the operation uneconomic. During the war, the mine operated around the clock under government contract, supplying metal for armor-piercing rounds and aircraft components. The tailings and mill ruins are visible from the road into Pine Creek Canyon, which is otherwise a spectacular granite gorge with access to the John Muir Wilderness. The creek supports one of the cleanest wild trout fisheries in the Eastern Sierra.',
  ST_SetSRID(ST_MakePoint(-118.6789, 37.4297), 4326)::geography,
  (SELECT id FROM poi_categories WHERE slug = 'history'),
  'point', 3.0, 6.5, 'curated', 'reviewed',
  ARRAY['pine-creek', 'tungsten', 'mining', 'world-war-2', 'john-muir-wilderness', 'strategic-metals'],
  'all'
);

-- ============================================================
-- VERIFICATION
-- ============================================================
-- After running this migration on a database seeded from seed.sql (37 POIs),
-- the total should be 97 POIs.
--
-- SELECT COUNT(*) AS total_pois FROM pois;  -- expect 97
--
-- POIs added by this migration by section:
--   Section 1 (I-5 Corridor):    20 POIs
--   Section 2 (Western Sierra):  15 POIs
--   Section 3 (Southern Sierra): 15 POIs
--   Section 4 (Eastern Sierra):  10 POIs
--   Total:                       60 POIs
