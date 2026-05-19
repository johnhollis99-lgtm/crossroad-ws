# POI Curation — v1 Launch Slate

_Exported: 2026-05-18T23:01:39.331Z_

_Reference: [docs/decisions/2026-05-15-top-tier-poi-first-run.md](../../docs/decisions/2026-05-15-top-tier-poi-first-run.md)_

## How to use this file

Mark each POI's **Decision** line with one of:

| Mark | Meaning |
|---|---|
| `[x]` | **Approve** for TTS generation |
| `[r]` | **Reject** — do not generate (fill in **Note** with reason if non-obvious) |
| `[+]` | **Boost** — approve AND lift score (default +20; use `[+30]` for custom magnitude) |
| `[ ]` | _(unmarked)_ skip for this batch; remains `editorial_curated = NULL` |

Pre-marked rejections from the v1 first-run listening session are stamped `[r]` with their reason. 16 known noise items recognized; matched count printed in the run summary.

When finished, run:

```
cd scripts/curation
npx tsx import.ts ../../docs/poi-curation/2026-05-18-v1-launch-slate.md --dry-run
npx tsx import.ts <same path> --apply
```

## Filter parameters

- **Category floors:** on — uses `category_significance_floors` (geology=60, nature=65, others=70)
- **Nevada longitude pre-filter:** on — `ST_X(location) <= -114.5` keeps California-side rows, drops AZ/UT bleed. **Coarse filter**: will not exclude Las Vegas (-115.14) or central-NV peaks at -118 to -119 (which share longitudes with eastern CA). Proper fix is the v1.1 `wdt:P131+ wd:Q99` SPARQL filter.
- **Per-category limit:** _(no cap)_
- **Editorial state:** only `editorial_curated IS NULL` rows surfaced (already-decided rows are not re-shown)

### Active per-category floors

| Category | Floor |
|---|---:|
| geology | 60 |
| nature | 65 |
| _(all others)_ | 70 |

# Category: architecture

_Display name: **Architecture** · Effective floor: **70** · Count: **15**_

## [80] Getty Center (architecture)
- **Source:** editorial
- **Significance breakdown:** source_base=40, cross_source=20, pageviews=15, route_adjacency=5, p31_bonus=0, total=80
- **Description:** The Getty Center, in Los Angeles, California, US, is a campus of the Getty Museum and other programs of the Getty Trust. The $1.3 billion center opened to the public on December 16, 1997, and is well known for its architecture, gardens, an…
- **Location:** 34.0770, -118.4755
- **POI id:** `92df5dbd-5cdc-452a-8a75-fcdeaa309052`
- **Decision:** [+]
- **Note:** _(curator fills in if needed)_

## [79] Balboa Park (architecture)
- **Source:** editorial
- **Significance breakdown:** source_base=40, cross_source=20, pageviews=14, route_adjacency=5, p31_bonus=0, total=79
- **Description:** Balboa Park is a 1,200-acre (490 ha) historic urban cultural park in San Diego, California. Placed in reserve in 1835, the park's site is one of the oldest in the United States dedicated to public recreational use. The park hosts various m…
- **Location:** 32.7350, -117.1495
- **POI id:** `6ea4408f-cd00-45ad-b298-5876193bf599`
- **Decision:** [+]
- **Note:** _(curator fills in if needed)_

## [79] Point San Luis Light (architecture)
- **Source:** wikidata
- **Significance breakdown:** source_base=52, cross_source=20, pageviews=7, route_adjacency=0, p31_bonus=0, total=79
- **Description:** The Point San Luis Lighthouse, also known as the San Luis Obispo Light Station, is on the National Register of Historic Places. Located near Avila Beach and Port San Luis on the Central Coast of California in San Luis Obispo County, it is…
- **Location:** 35.1603, -120.7609
- **POI id:** `3599f61b-a2af-4ab3-8e1e-e102639f1599`
- **Decision:** [+]
- **Note:** _(curator fills in if needed)_

## [76] California State Capitol (architecture)
- **Source:** state_landmark
- **Significance breakdown:** source_base=40, cross_source=30, pageviews=1, route_adjacency=5, p31_bonus=0, total=76
- **Description:** The California State Capitol Museum consists of a museum in and grounds around the California State Capitol in Sacramento, California, United States. The building has been the home of the California State Legislature since 1869. The State…
- **Location:** 38.5766, -121.4934
- **POI id:** `c400a378-e37f-4e78-a55d-9d6e8de93554`
- **Decision:** [+]
- **Note:** _(curator fills in if needed)_

## [75] Court (architecture)
- **Source:** nrhp
- **Significance breakdown:** source_base=50, cross_source=20, pageviews=0, route_adjacency=5, p31_bonus=0, total=75
- **Description:** Significant for: ARCHITECTURE.
- **Location:** 34.1327, -118.1455
- **POI id:** `14a6ccda-23ea-41e2-8ccb-c7affafa57a7`
- **Decision:** [r]
- **Note:** _(curator fills in if needed)_

## [75] First Unitarian Church of Oakland (architecture)
- **Source:** state_landmark
- **Significance breakdown:** source_base=40, cross_source=30, pageviews=0, route_adjacency=5, p31_bonus=0, total=75
- **Description:** The First Unitarian Church of Oakland is located in western Downtown Oakland, California. It is a member of the Unitarian Universalist Association.
- **Location:** 37.8064, -122.2767
- **POI id:** `82639942-2a67-429e-b91f-0bb73d7ba12b`
- **Decision:** [r]
- **Note:** _(curator fills in if needed)_

## [74] First Baptist Church of Ventura (architecture)
- **Source:** wikidata
- **Significance breakdown:** source_base=48, cross_source=10, pageviews=6, route_adjacency=10, p31_bonus=0, total=74
- **Description:** First Baptist Church of Ventura is a historic church at 101 S. Laurel Street in Ventura, California. It was built in 1926 and renovated extensively into the Mayan Revival style in 1932. Declared a landmark by the City of Ventura In 1975, t…
- **Location:** 34.2792, -119.2844
- **POI id:** `acb94771-b86c-40ab-9b9f-cf7562440a11`
- **Decision:** [r]
- **Note:** _(curator fills in if needed)_

## [74] Getty Villa (architecture)
- **Source:** editorial
- **Significance breakdown:** source_base=40, cross_source=10, pageviews=14, route_adjacency=10, p31_bonus=0, total=74
- **Description:** The Getty Villa is an educational center and an art museum located at the easterly end of the Malibu coast in the Pacific Palisades neighborhood of Los Angeles, California, United States. One of two campuses of the J. Paul Getty Museum, th…
- **Location:** 34.0455, -118.5648
- **POI id:** `8e856376-4218-481d-beab-24b735b32876`
- **Decision:** [x]
- **Note:** _(curator fills in if needed)_

## [74] St. Michael's Episcopal Church (architecture)
- **Source:** wikidata
- **Significance breakdown:** source_base=48, cross_source=10, pageviews=6, route_adjacency=10, p31_bonus=0, total=74
- **Description:** The St. Michael's Episcopal Church in Anaheim, California, also known as The Chapel at St. Michael's Episcopal Church, is a historic church at 311 West South Street. It was built in 1876 and was added to the National Register of Historic P…
- **Location:** 33.8267, -117.9131
- **POI id:** `e25a2107-7691-4fdd-af7d-186466a93745`
- **Decision:** [r]
- **Note:** _(curator fills in if needed)_

## [71] First Congregational Church of Riverside (architecture)
- **Source:** wikidata
- **Significance breakdown:** source_base=48, cross_source=10, pageviews=8, route_adjacency=5, p31_bonus=0, total=71
- **Description:** The First Congregational Church of Riverside is a historic United Church of Christ church at 3504 Mission Inn Avenue in Riverside, California. It was designed by Myron Hunt, and built in 1913. It was added to the National Register in 1997.
- **Location:** 33.9817, -117.3711
- **POI id:** `c97bb598-0df5-48dc-82e3-d447c6786814`
- **Decision:** [r]
- **Note:** _(curator fills in if needed)_

## [70] Community Church of Gonzales (architecture)
- **Source:** nrhp
- **Significance breakdown:** source_base=30, cross_source=30, pageviews=0, route_adjacency=10, p31_bonus=0, total=70
- **Description:** Community Church of Gonzales is a historic Gothic Revival church building at 301 4th Street in Gonzales, California, United States. It was built 1883–1884 and added to the National Register of Historic Places in 1983. It is one of Monterey…
- **Location:** 36.5081, -121.4447
- **POI id:** `8a2aa8c4-d3d9-4829-8ddc-6eebdcfa3e4f`
- **Decision:** [r]
- **Note:** _(curator fills in if needed)_

## [70] First Church of Christ, Scientist (architecture)
- **Source:** wikidata
- **Significance breakdown:** source_base=48, cross_source=10, pageviews=7, route_adjacency=5, p31_bonus=0, total=70
- **Description:** First Church of Christ, Scientist, built in 1901, is an historic Mission Revival-style Christian Science church located at 3606 Lemon Street in Riverside, California. It has been called: "the church that introduced Christian Science to Sou…
- **Location:** 33.9826, -117.3706
- **POI id:** `187f324a-c870-47c5-8fe0-5996aa68bab5`
- **Decision:** [r]
- **Note:** _(curator fills in if needed)_

## [70] Misión San Gabriel Archángel (architecture)
- **Source:** osm
- **Significance breakdown:** source_base=55, cross_source=10, pageviews=0, route_adjacency=5, p31_bonus=0, total=70
- **Description:** _(none)_
- **Location:** 34.0967, -118.1069
- **POI id:** `e87363a3-47cb-4110-8272-e9ca8467d223`
- **Decision:** [r]
- **Note:** _(curator fills in if needed)_

## [70] St. John's Lutheran Church (architecture)
- **Source:** wikidata
- **Significance breakdown:** source_base=48, cross_source=10, pageviews=7, route_adjacency=5, p31_bonus=0, total=70
- **Description:** The St. John's Lutheran Church of Orange, California is a Lutheran Church–Missouri Synod church. The church was founded in 1882, and its sanctuary was built in 1913-14. The building was renovated and rededicated in 1990.
- **Location:** 33.7861, -117.8489
- **POI id:** `42fa3be7-4014-4892-9d7e-1437515bc38a`
- **Decision:** [r]
- **Note:** _(curator fills in if needed)_

## [70] Wayfarers Chapel (architecture)
- **Source:** nrhp
- **Significance breakdown:** source_base=50, cross_source=20, pageviews=0, route_adjacency=0, p31_bonus=0, total=70
- **Description:** Wayfarers Chapel, or "The Glass Church", is a disassembled chapel designed by Lloyd Wright and originally located in Rancho Palos Verdes, California. The chapel had unique organic architecture sited on a bluff above the Pacific Ocean. Affi…
- **Location:** 33.7483, -118.3708
- **POI id:** `fb62e3ce-80ef-4340-b317-9fea5dbb8167`
- **Decision:** [r]
- **Note:** _(curator fills in if needed)_

# Category: art

_Display name: **Art & Culture** · Effective floor: **70** · Count: **13**_

## [87] Museum of Contemporary Art San Diego (art)
- **Source:** wikidata
- **Significance breakdown:** source_base=52, cross_source=20, pageviews=10, route_adjacency=5, p31_bonus=0, total=87
- **Description:** The Museum of Contemporary Art San Diego (MCASD) is an art museum in La Jolla, a community of San Diego, California. It is focused on the collection, preservation, exhibition, and interpretation of works of art from 1950 to the present.
- **Location:** 32.8445, -117.2782
- **POI id:** `0f1e44ea-6d28-48b4-972a-dbe5163182ac`
- **Decision:** [x]
- **Note:** _(pre-marked — art_opt_in — art category is Local Color opt-in (addendum §1.1))_

## [75] Bas Relief II (art)
- **Source:** osm
- **Significance breakdown:** source_base=40, cross_source=30, pageviews=0, route_adjacency=5, p31_bonus=0, total=75
- **Description:** _(none)_
- **Location:** 34.0757, -118.4409
- **POI id:** `0c42e4eb-d987-48ba-84a6-e37585268166`
- **Decision:** [r]
- **Note:** _(curator fills in if needed)_

## [75] Museum of Contemporary Art, Los Angeles (art)
- **Source:** wikidata
- **Significance breakdown:** source_base=42, cross_source=10, pageviews=13, route_adjacency=10, p31_bonus=0, total=75
- **Description:** The Museum of Contemporary Art, Los Angeles (MOCA) is a contemporary art museum with two locations in Los Angeles, California. The main branch is located on Grand Avenue in Downtown Los Angeles, near the Walt Disney Concert Hall. MOCA's or…
- **Location:** 34.0533, -118.2504
- **POI id:** `d1e192a6-2dc0-4c8f-a9b2-18645bf9c557`
- **Decision:** [x]
- **Note:** _(curator fills in if needed)_

## [75] The Broad (art)
- **Source:** wikidata
- **Significance breakdown:** source_base=42, cross_source=10, pageviews=13, route_adjacency=10, p31_bonus=0, total=75
- **Description:** The Broad is a contemporary art museum on Grand Avenue in Downtown Los Angeles. The museum is named for philanthropists Eli and Edythe Broad, who financed the $140 million building that houses the Broad art collections. It offers free gene…
- **Location:** 34.0544, -118.2510
- **POI id:** `b4349aeb-b473-4b3d-b811-922e90c34a4a`
- **Decision:** [r]
- **Note:** _(curator fills in if needed)_

## [73] San Luis Obispo Museum of Art (art)
- **Source:** wikidata
- **Significance breakdown:** source_base=47, cross_source=10, pageviews=6, route_adjacency=10, p31_bonus=0, total=73
- **Description:** The San Luis Obispo Museum of Art (SLOMA) is an art museum in San Luis Obispo, California. The building is west of the Mission San Luis Obispo de Tolosa.
- **Location:** 35.2796, -120.6649
- **POI id:** `0d161c7d-350c-4847-a046-eedf52d7f07b`
- **Decision:** [r]
- **Note:** _(curator fills in if needed)_

## [72] Los Angeles County Museum of Art (art)
- **Source:** wikidata
- **Significance breakdown:** source_base=42, cross_source=10, pageviews=15, route_adjacency=5, p31_bonus=0, total=72
- **Description:** The Los Angeles County Museum of Art (LACMA) is an art museum located on Wilshire Boulevard in the Miracle Mile vicinity of Los Angeles. LACMA is on Museum Row, adjacent to the La Brea Tar Pits.
- **Location:** 34.0633, -118.3592
- **POI id:** `c38a3fab-278e-474d-8b05-929f45a86a2a`
- **Decision:** [r]
- **Note:** _(curator fills in if needed)_

## [72] San Diego Museum of Art (art)
- **Source:** wikidata
- **Significance breakdown:** source_base=42, cross_source=10, pageviews=10, route_adjacency=10, p31_bonus=0, total=72
- **Description:** The San Diego Museum of Art is a fine art museum in Balboa Park in San Diego, California, that houses a broad collection with particular strength in Spanish art. It opened as the Fine Arts Gallery of San Diego on February 28, 1926, and cha…
- **Location:** 32.7322, -117.1504
- **POI id:** `347e84ef-b02a-4334-b1bf-acd61e758119`
- **Decision:** [r]
- **Note:** _(curator fills in if needed)_

## [71] Mingei International Museum (art)
- **Source:** wikidata
- **Significance breakdown:** source_base=42, cross_source=10, pageviews=9, route_adjacency=10, p31_bonus=0, total=71
- **Description:** Mingei International Museum is a non-profit public institution in Balboa Park in San Diego, California, that collects, conserves and exhibits folk art, craft, and design. The museum was founded in 1974, and its building opened in 1978. The…
- **Location:** 32.7311, -117.1510
- **POI id:** `22c03e4a-f308-47ca-b970-be49d5d4f000`
- **Decision:** [r]
- **Note:** _(curator fills in if needed)_

## [71] Santa Barbara Museum of Art (art)
- **Source:** wikidata
- **Significance breakdown:** source_base=42, cross_source=10, pageviews=9, route_adjacency=10, p31_bonus=0, total=71
- **Description:** The Santa Barbara Museum of Art (SBMA) is an art museum located in downtown Santa Barbara, California, United States.
- **Location:** 34.4228, -119.7030
- **POI id:** `e81794ee-88cf-40f4-8fe8-c068e72a16f9`
- **Decision:** [r]
- **Note:** _(curator fills in if needed)_

## [71] Timken Museum of Art (art)
- **Source:** wikidata
- **Significance breakdown:** source_base=42, cross_source=10, pageviews=9, route_adjacency=10, p31_bonus=0, total=71
- **Description:** The Timken Museum of Art is a fine art museum in Balboa Park in San Diego, California, close to the San Diego Museum of Art. It was established in 1965.
- **Location:** 32.7318, -117.1496
- **POI id:** `afad3096-0943-4d22-ab82-a19efb10eea4`
- **Decision:** [r]
- **Note:** _(curator fills in if needed)_

## [70] Laguna Art Museum (art)
- **Source:** wikidata
- **Significance breakdown:** source_base=42, cross_source=10, pageviews=8, route_adjacency=10, p31_bonus=0, total=70
- **Description:** The Laguna Art Museum (LAM) is a museum located in Laguna Beach, California, on Pacific Coast Highway. LAM exclusively features California art and is the oldest cultural institution in the area. It has been known as the Laguna Beach Art As…
- **Location:** 33.5436, -117.7883
- **POI id:** `a56b51f6-90b4-48a8-af68-8b0ae93d8f95`
- **Decision:** [r]
- **Note:** _(curator fills in if needed)_

## [70] Museum of Latin American Art (art)
- **Source:** wikidata
- **Significance breakdown:** source_base=42, cross_source=10, pageviews=13, route_adjacency=5, p31_bonus=0, total=70
- **Description:** The Museum of Latin American Art (MOLAA) was founded by Dr. Robert Gumbiner in 1996 in Long Beach, California, United States, and serves the greater Los Angeles area. MOLAA is the only museum in the United States dedicated to modern and co…
- **Location:** 33.7744, -118.1799
- **POI id:** `332dc044-08e8-4808-aa02-37bc5bcd8e8c`
- **Decision:** [r]
- **Note:** _(curator fills in if needed)_

## [70] Museum of Photographic Arts (art)
- **Source:** wikidata
- **Significance breakdown:** source_base=42, cross_source=10, pageviews=8, route_adjacency=10, p31_bonus=0, total=70
- **Description:** The Museum of Photographic Arts (MOPA) is a museum in Balboa Park in San Diego, California. First founded in 1974, MOPA opened in 1983. MOPA is one of three museums in the US dedicated exclusively to the collection and preservation of phot…
- **Location:** 32.7310, -117.1490
- **POI id:** `c86e8502-63fe-4928-aee9-5d1be0fbd5c6`
- **Decision:** [r]
- **Note:** _(curator fills in if needed)_

# Category: geology

_Display name: **Geology** · Effective floor: **60** · Count: **2**_

## [80] Mount Whitney (geology)
- **Source:** editorial
- **Significance breakdown:** source_base=60, cross_source=20, pageviews=0, route_adjacency=0, p31_bonus=0, total=80
- **Description:** Mount Whitney is a mountain in California's Sierra Nevada range, and is the highest point in the contiguous United States, with an elevation of 14,505 feet (4,421 m). It is located in East–Central California along the border of Inyo and Tu…
- **Location:** 36.5785, -118.2924
- **POI id:** `6dbb1b74-7aac-4f1e-91ad-9df46391e1b0`
- **Decision:** [x]
- **Note:** _(curator fills in if needed)_

## [60] California Caverns (geology)
- **Source:** state_landmark
- **Significance breakdown:** source_base=40, cross_source=20, pageviews=0, route_adjacency=0, p31_bonus=0, total=60
- **Description:** California Cavern is a Limestone cave in the Sierra Nevada foothills, in Cave City, Calaveras County, California.
- **Location:** 38.2029, -120.5088
- **POI id:** `2b07ee47-d78a-46e0-9a22-3ab7590f14f5`
- **Decision:** [x]
- **Note:** _(curator fills in if needed)_

# Category: hidden_gems

_Display name: **Hidden Gems** · Effective floor: **70** · Count: **9**_

## [100] Grizzly River Run (hidden_gems)
- **Source:** osm
- **Significance breakdown:** source_base=70, cross_source=30, pageviews=0, route_adjacency=10, p31_bonus=0, total=100
- **Description:** _(none)_
- **Location:** 33.8072, -117.9206
- **POI id:** `7d6987cd-002b-4000-aa4a-fc56b3f04f6a`
- **Decision:** [r]
- **Note:** _(pre-marked — theme_park_child — Disney California Adventure ride)_

## [100] Walk of Fame (hidden_gems)
- **Source:** osm
- **Significance breakdown:** source_base=70, cross_source=30, pageviews=0, route_adjacency=5, p31_bonus=0, total=100
- **Description:** _(none)_
- **Location:** 34.1017, -118.3433
- **POI id:** `44d6873c-d06f-4a0a-833a-47f93b7f6407`
- **Decision:** [r]
- **Note:** _(pre-marked — dedup_duplicate — duplicate of Hollywood Walk of Fame (dedup Phase B follow-up))_

## [84] Sleeping Beauty Castle (hidden_gems)
- **Source:** wikidata
- **Significance breakdown:** source_base=40, cross_source=20, pageviews=14, route_adjacency=10, p31_bonus=0, total=84
- **Description:** Sleeping Beauty Castle is a fairy tale castle at the center of Disneyland and formerly in Hong Kong Disneyland. It is based on the late 19th century Neuschwanstein Castle in Bavaria, Germany. It appeared in the Walt Disney Pictures logos f…
- **Location:** 33.8128, -117.9190
- **POI id:** `e1bb3c66-76c9-4acf-a7fa-0d191d20b803`
- **Decision:** [r]
- **Note:** _(pre-marked — theme_park_child — Disneyland feature)_

## [80] Jurassic World-The Ride (hidden_gems)
- **Source:** osm
- **Significance breakdown:** source_base=40, cross_source=30, pageviews=0, route_adjacency=10, p31_bonus=0, total=80
- **Description:** _(none)_
- **Location:** 34.1399, -118.3564
- **POI id:** `051372b6-a252-4d68-9a30-d4386f76921d`
- **Decision:** [r]
- **Note:** _(curator fills in if needed)_

## [70] Big Thunder Mountain Railroad (hidden_gems)
- **Source:** osm
- **Significance breakdown:** source_base=50, cross_source=10, pageviews=0, route_adjacency=10, p31_bonus=0, total=70
- **Description:** _(none)_
- **Location:** 33.8127, -117.9204
- **POI id:** `b97edcf2-1577-4336-8fec-246f9693b59f`
- **Decision:** [r]
- **Note:** _(curator fills in if needed)_

## [70] Davy Crockett Explorer Canoes (hidden_gems)
- **Source:** osm
- **Significance breakdown:** source_base=50, cross_source=10, pageviews=0, route_adjacency=10, p31_bonus=0, total=70
- **Description:** _(none)_
- **Location:** 33.8125, -117.9221
- **POI id:** `bc8a1e62-3b86-46a7-b555-4b1d74577279`
- **Decision:** [r]
- **Note:** _(curator fills in if needed)_

## [70] Shooting Exposition (hidden_gems)
- **Source:** osm
- **Significance breakdown:** source_base=50, cross_source=10, pageviews=0, route_adjacency=10, p31_bonus=0, total=70
- **Description:** _(none)_
- **Location:** 33.8123, -117.9198
- **POI id:** `2bb9f72c-4cde-4eef-ba65-6afb637fbad0`
- **Decision:** [r]
- **Note:** _(curator fills in if needed)_

## [70] Slots (hidden_gems)
- **Source:** osm
- **Significance breakdown:** source_base=40, cross_source=30, pageviews=0, route_adjacency=0, p31_bonus=0, total=70
- **Description:** _(none)_
- **Location:** 33.4571, -117.1053
- **POI id:** `70c6b337-3790-4854-8f1f-a745a8542343`
- **Decision:** [r]
- **Note:** _(curator fills in if needed)_

## [70] Table Games (hidden_gems)
- **Source:** osm
- **Significance breakdown:** source_base=40, cross_source=30, pageviews=0, route_adjacency=0, p31_bonus=0, total=70
- **Description:** _(none)_
- **Location:** 33.4566, -117.1071
- **POI id:** `5e7d9776-2eb0-4228-9def-5a0506897a50`
- **Decision:** [r]
- **Note:** _(curator fills in if needed)_

# Category: history

_Display name: **History** · Effective floor: **70** · Count: **56**_

## [99] Hollywood Walk of Fame (history)
- **Source:** wikidata
- **Significance breakdown:** source_base=45, cross_source=30, pageviews=19, route_adjacency=5, p31_bonus=0, total=99
- **Description:** The Hollywood Walk of Fame is a landmark that consists of more than 2,800 five-pointed terrazzo-and-brass stars embedded in the sidewalks along fifteen blocks of Hollywood Boulevard and three blocks of Vine Street in the Hollywood district…
- **Location:** 34.1014, -118.3450
- **POI id:** `add6f7fd-ec7c-4ada-8da2-ed95382d61f6`
- **Decision:** [x]
- **Note:** _(curator fills in if needed)_

## [93] Mission San Miguel Arcángel (history)
- **Source:** state_landmark
- **Significance breakdown:** source_base=50, cross_source=30, pageviews=3, route_adjacency=10, p31_bonus=0, total=93
- **Description:** Mission San Miguel Arcángel is a Spanish mission in San Miguel, California. It was established on July 25, 1797, by the Franciscan order, on a site chosen specifically due to the large number of Salinan Indians that inhabited the area, who…
- **Location:** 35.7447, -120.6981
- **POI id:** `bfd29316-9df3-42f0-a1a3-ca64b9a825f4`
- **Decision:** [+]
- **Note:** _(curator fills in if needed)_

## [92] Mission San Buenaventura (history)
- **Source:** editorial
- **Significance breakdown:** source_base=40, cross_source=30, pageviews=12, route_adjacency=10, p31_bonus=0, total=92
- **Description:** Ventura Also on the NRHP list as NPS-75000496
- **Location:** 34.2811, -119.2977
- **POI id:** `415237b7-56e8-4724-9f84-63a6f292461b`
- **Decision:** [+]
- **Note:** _(curator fills in if needed)_

## [85] Mission San Francisco de Asís (history)
- **Source:** editorial
- **Significance breakdown:** source_base=40, cross_source=20, pageviews=15, route_adjacency=10, p31_bonus=0, total=85
- **Description:** The Mission San Francisco de Asís, also known as Mission Dolores, is a historic Catholic church complex in San Francisco, California. Operated by the Archdiocese of San Francisco, the complex was founded in the 18th century by Spanish Cath…
- **Location:** 37.7643, -122.4270
- **POI id:** `382bd6be-7dfd-4b3a-a5a1-b39388ddd5b0`
- **Decision:** [+]
- **Note:** _(curator fills in if needed)_

## [84] Mission San Diego de Alcalá (history)
- **Source:** editorial
- **Significance breakdown:** source_base=40, cross_source=20, pageviews=14, route_adjacency=10, p31_bonus=0, total=84
- **Description:** Mission Basilica San Diego de Alcalá was the second Franciscan-founded mission in the Californias, a province of New Spain. Located in present-day San Diego, California, it was founded on July 16, 1769, by Spanish friar Junípero Serra, in…
- **Location:** 32.7844, -117.1064
- **POI id:** `d2814ccd-60fc-40da-9dd6-446bf1d9d74e`
- **Decision:** [+]
- **Note:** _(curator fills in if needed)_

## [84] Mission San Juan Capistrano (history)
- **Source:** editorial
- **Significance breakdown:** source_base=40, cross_source=20, pageviews=14, route_adjacency=10, p31_bonus=0, total=84
- **Description:** Significant for: HISTORIC - NON-ABORIGINAL; ARCHITECTURE; RELIGION.
- **Location:** 33.5032, -117.6629
- **POI id:** `739aca24-d217-47a8-b13d-a0e2d0d30214`
- **Decision:** [+]
- **Note:** _(curator fills in if needed)_

## [83] Mission San Luis Rey de Francia (history)
- **Source:** editorial
- **Significance breakdown:** source_base=40, cross_source=30, pageviews=13, route_adjacency=0, p31_bonus=0, total=83
- **Description:** Mission San Luis Rey de Francia is a former Spanish mission in San Luis Rey, a neighborhood in Oceanside, California. This Mission lent its name to the Luiseño tribe of Mission Indians.
- **Location:** 33.2325, -117.3195
- **POI id:** `97cd82ab-6d11-4279-965e-be22435a9914`
- **Decision:** [+]
- **Note:** _(curator fills in if needed)_

## [83] Mission Santa Bárbara (history)
- **Source:** editorial
- **Significance breakdown:** source_base=40, cross_source=30, pageviews=13, route_adjacency=0, p31_bonus=0, total=83
- **Description:** Santa Barbara Also on the NRHP list as NPS-66000237
- **Location:** 34.4384, -119.7138
- **POI id:** `47646679-aba7-49d2-971a-981bd96f1194`
- **Decision:** [+]
- **Note:** _(curator fills in if needed)_

## [82] Drum Barracks (history)
- **Source:** state_landmark
- **Significance breakdown:** source_base=40, cross_source=30, pageviews=2, route_adjacency=10, p31_bonus=0, total=82
- **Description:** Drum Barracks was the Union Army's headquarters for Southern California and New Mexico during the Civil War. It consisted of 19 buildings on 60 acres in what is now Wilmington, with another 37 acres near the waterfront. Its junior officers…
- **Location:** 33.7847, -118.2567
- **POI id:** `fce3679a-955c-4a64-9089-db767144e1ad`
- **Decision:** [+]
- **Note:** _(curator fills in if needed)_

## [82] Mission La Purísima Concepción (history)
- **Source:** editorial
- **Significance breakdown:** source_base=40, cross_source=30, pageviews=12, route_adjacency=0, p31_bonus=0, total=82
- **Description:** Mission La Purísima Concepción — venue (mission)
- **Location:** 34.6720, -120.4219
- **POI id:** `b185a594-9d62-484f-b604-d17408e97b3f`
- **Decision:** [+]
- **Note:** _(curator fills in if needed)_

## [82] Mission San Luis Obispo de Tolosa (history)
- **Source:** editorial
- **Significance breakdown:** source_base=40, cross_source=20, pageviews=12, route_adjacency=10, p31_bonus=0, total=82
- **Description:** Mission San Luis Obispo de Tolosa is a Spanish mission founded September 1, 1772 by Father Junípero Serra in San Luis Obispo, California. The mission was named after San Luis, obispo de Tolosa.
- **Location:** 35.2808, -120.6645
- **POI id:** `779987b7-0ec8-46d9-80d1-1bceb8ed9639`
- **Decision:** [+]
- **Note:** _(curator fills in if needed)_

## [82] Mission Santa Cruz (history)
- **Source:** editorial
- **Significance breakdown:** source_base=40, cross_source=20, pageviews=12, route_adjacency=10, p31_bonus=0, total=82
- **Description:** Mission Santa Cruz is a replica Spanish Californian mission in Santa Cruz, California. Located on the San Lorenzo River floodplain below what would later be named Mission Hill, the mission was founded on August 28, 1791, by Father Fermín F…
- **Location:** 36.9773, -122.0280
- **POI id:** `3e2b0feb-88e9-455d-a056-2373a52969ef`
- **Decision:** [+]
- **Note:** _(curator fills in if needed)_

## [81] Oceanside City Hall and Fire Station (history)
- **Source:** wikidata
- **Significance breakdown:** source_base=55, cross_source=10, pageviews=6, route_adjacency=10, p31_bonus=0, total=81
- **Description:** The Oceanside City Hall and Fire Station, also known as Oceanside Civic Center, at 704 and 714 Third St. in Oceanside, California, was built in 1929. It was listed on the National Register of Historic Places in 1989.
- **Location:** 33.1981, -117.3778
- **POI id:** `10ea7950-3de5-462e-8a67-1b64f47155bc`
- **Decision:** [r]
- **Note:** _(pre-marked — nrhp_substance — NRHP listing without narrative depth)_

## [80] Dallidet Adobe (history)
- **Source:** state_landmark
- **Significance breakdown:** source_base=50, cross_source=20, pageviews=0, route_adjacency=10, p31_bonus=0, total=80
- **Description:** San Luis Obispo
- **Location:** 35.2810, -120.6565
- **POI id:** `d9329a26-66c8-4220-9599-1fae9eca5a04`
- **Decision:** [x]
- **Note:** _(curator fills in if needed)_

## [80] Fire Station No. 23 (history)
- **Source:** wikidata
- **Significance breakdown:** source_base=55, cross_source=10, pageviews=10, route_adjacency=5, p31_bonus=0, total=80
- **Description:** Fire Station No. 23 is a former fire station in downtown Los Angeles. Built in 1910 as an operating station, it was also the Los Angeles Fire Department's headquarters until 1920 and the residence of every fire chief from 1910 to 1928. The…
- **Location:** 34.0457, -118.2467
- **POI id:** `5be2bde2-7b30-409e-ae4f-b174f84a8bfe`
- **Decision:** [x]
- **Note:** _(pre-marked — nrhp_substance — NRHP fire station, paperwork-grade only)_

## [80] Fremont Peak (history)
- **Source:** state_landmark
- **Significance breakdown:** source_base=50, cross_source=30, pageviews=0, route_adjacency=0, p31_bonus=0, total=80
- **Description:** Fremont Peak or Frémont Peak, historically known as Gabilán Peak, is a summit in the Gabilan Range, one of the mountain ranges paralleling California's central coast. The peak affords clear views of the Salinas Valley, Monterey Bay, the so…
- **Location:** 36.7572, -121.5041
- **POI id:** `740cc5cf-0cf9-4873-8c06-e37436b5229a`
- **Decision:** [x]
- **Note:** _(curator typo-resolved: was [+ → [x] per cycle-2 decision)_

## [80] Old Town San Diego State Historic Park (history)
- **Source:** editorial
- **Significance breakdown:** source_base=40, cross_source=20, pageviews=10, route_adjacency=10, p31_bonus=0, total=80
- **Description:** Old Town San Diego State Historic Park — venue (historic_district)
- **Location:** 32.7546, -117.1980
- **POI id:** `244a8a6c-156a-4aee-b1ca-911754e7bb20`
- **Decision:** [+]
- **Note:** _(curator fills in if needed)_

## [80] Santa Ana Fire Station Headquarters No. 1 (history)
- **Source:** wikidata
- **Significance breakdown:** source_base=55, cross_source=10, pageviews=5, route_adjacency=10, p31_bonus=0, total=80
- **Description:** Santa Ana Fire Station Headquarters No. 1, at 1322 N. Sycamore St. in Santa Ana, California, is a fire station which was built in 1929. It was listed on the National Register of Historic Places in 1986.
- **Location:** 33.7564, -117.8681
- **POI id:** `597ad679-49ff-44a0-b90a-0496632ae6b9`
- **Decision:** [x]
- **Note:** _(pre-marked — nrhp_substance — NRHP fire station, paperwork-grade only)_

## [78] Mission San José (history)
- **Source:** editorial
- **Significance breakdown:** source_base=40, cross_source=20, pageviews=13, route_adjacency=5, p31_bonus=0, total=78
- **Description:** Mission San José is a Spanish mission located in the present-day city of Fremont, California, United States. It was founded on June 11, 1797, by the Franciscan order and was the fourteenth Spanish mission established in California. The Mis…
- **Location:** 37.5446, -121.9363
- **POI id:** `307b9fa1-3a9c-46aa-b760-a13c85bfeee4`
- **Decision:** [+]
- **Note:** _(curator fills in if needed)_

## [78] Mission Santa Clara de Asís (history)
- **Source:** editorial
- **Significance breakdown:** source_base=40, cross_source=20, pageviews=13, route_adjacency=5, p31_bonus=0, total=78
- **Description:** Mission Santa Clara de Asís is a Spanish mission in the city of Santa Clara, California. The mission, which was the eighth in California, was founded on January 12, 1777, by the Franciscans. Named for Saint Clare of Assisi, who founded the…
- **Location:** 37.3493, -121.9416
- **POI id:** `87b78696-99b9-4865-a6f2-3ec7393f9c1c`
- **Decision:** [+]
- **Note:** _(curator fills in if needed)_

## [77] Engine Company No. 28 (history)
- **Source:** wikidata
- **Significance breakdown:** source_base=55, cross_source=10, pageviews=7, route_adjacency=5, p31_bonus=0, total=77
- **Description:** Engine Company No. 28 is a former Los Angeles Fire Department fire station on Figueroa Street in Downtown Los Angeles. Built in 1912 at a cost of US$50,000, the structure served as an operating fire station until it was closed in 1967. One…
- **Location:** 34.0497, -118.2583
- **POI id:** `8a7712dd-1968-45bd-b2b4-62871fe00fa3`
- **Decision:** [x]
- **Note:** _(curator fills in if needed)_

## [77] Golden Gate Bridge (history)
- **Source:** state_landmark
- **Significance breakdown:** source_base=40, cross_source=20, pageviews=7, route_adjacency=10, p31_bonus=0, total=77
- **Description:** The Golden Gate Bridge is a suspension bridge spanning the Golden Gate, the one-mile-wide (1.6 km) strait connecting San Francisco Bay and the Pacific Ocean in California, United States. The structure links San Francisco—the northern tip o…
- **Location:** 37.8197, -122.4786
- **POI id:** `8c7fcdf8-961a-4bef-9521-2cb32388ee6f`
- **Decision:** [+]
- **Note:** _(curator fills in if needed)_

## [76] Mission San Rafael Arcángel (history)
- **Source:** state_landmark
- **Significance breakdown:** source_base=40, cross_source=20, pageviews=6, route_adjacency=10, p31_bonus=0, total=76
- **Description:** Mission San Rafael Arcángel is a Spanish mission in San Rafael, California.
- **Location:** 37.9743, -122.5279
- **POI id:** `364c0b49-73a6-4bf6-aaae-1e41a7de9bb8`
- **Decision:** [+]
- **Note:** _(curator fills in if needed)_

## [75] Andalucia Building (history)
- **Source:** osm
- **Significance breakdown:** source_base=55, cross_source=10, pageviews=0, route_adjacency=10, p31_bonus=0, total=75
- **Description:** Significant for: ARCHITECTURE.
- **Location:** 34.4158, -119.6938
- **POI id:** `f9156c05-fb32-409f-8b05-6d2e256d202d`
- **Decision:** [r]
- **Note:** _(curator fills in if needed)_

## [75] Faith Mission (history)
- **Source:** osm
- **Significance breakdown:** source_base=55, cross_source=10, pageviews=0, route_adjacency=10, p31_bonus=0, total=75
- **Description:** Significant for: ARCHITECTURE; RELIGION; SOCIAL HISTORY.
- **Location:** 34.4159, -119.6948
- **POI id:** `796ea27b-2d48-4494-a10b-354f39518130`
- **Decision:** [r]
- **Note:** _(curator fills in if needed)_

## [75] Fire Control Station (history)
- **Source:** osm
- **Significance breakdown:** source_base=45, cross_source=30, pageviews=0, route_adjacency=0, p31_bonus=0, total=75
- **Description:** _(none)_
- **Location:** 32.6686, -117.2377
- **POI id:** `2b9a1365-8a0b-4665-844c-87f1f5ec7598`
- **Decision:** [r]
- **Note:** _(curator fills in if needed)_

## [75] Frog Woman Rock (history)
- **Source:** state_landmark
- **Significance breakdown:** source_base=40, cross_source=20, pageviews=5, route_adjacency=10, p31_bonus=0, total=75
- **Description:** Frog Woman Rock is a distinctive volcanic monolith located in Mendocino County, California, in the Russian River canyon through the California Coast Ranges. The California Historical Landmark, adjacent to U.S. Route 101, is a popular recre…
- **Location:** 38.9125, -123.0561
- **POI id:** `0cab9f2a-2a2c-4a1d-ba79-583970034094`
- **Decision:** [+]
- **Note:** _(curator fills in if needed)_

## [75] Jack House (history)
- **Source:** osm
- **Significance breakdown:** source_base=55, cross_source=10, pageviews=0, route_adjacency=10, p31_bonus=0, total=75
- **Description:** _(none)_
- **Location:** 35.2770, -120.6662
- **POI id:** `5c30d140-1d95-47ae-809f-104c627e7943`
- **Decision:** [r]
- **Note:** _(curator fills in if needed)_

## [75] Morro Bay Maritime Museum (history)
- **Source:** wikidata
- **Significance breakdown:** source_base=50, cross_source=10, pageviews=5, route_adjacency=10, p31_bonus=0, total=75
- **Description:** The Morro Bay Maritime Museum is a maritime museum in Morro Bay, California. It contains a variety of historic boats and items, some recording the history of Morro Bay itself. It has free entry but mainly supports itself via donations and…
- **Location:** 35.3703, -120.8555
- **POI id:** `5005a492-d71a-4c5a-8247-ae5882cfaf82`
- **Decision:** [+]
- **Note:** _(curator fills in if needed)_

## [73] Mission San Juan Bautista (history)
- **Source:** editorial
- **Significance breakdown:** source_base=40, cross_source=20, pageviews=13, route_adjacency=0, p31_bonus=0, total=73
- **Description:** Mission San Juan Bautista is a Spanish mission in San Juan Bautista, San Benito County, California. Founded on June 24, 1797, by Fermín de Lasuén of the Franciscan order, the mission was the fifteenth of the Spanish missions established in…
- **Location:** 36.8460, -121.5361
- **POI id:** `9cc51d36-63c9-4736-9332-16d87de92baa`
- **Decision:** [+]
- **Note:** _(curator fills in if needed)_

## [73] Monterey Museum of Art (history)
- **Source:** wikidata
- **Significance breakdown:** source_base=50, cross_source=10, pageviews=13, route_adjacency=0, p31_bonus=0, total=73
- **Description:** The Monterey Museum of Art (MMA) an art museum located in Monterey, California. It was founded in 1959 as a chapter of the American Federation of Arts. The Monterey Museum of Art's mission is to engage the community and celebrate the diver…
- **Location:** 36.5973, -121.8966
- **POI id:** `17946557-e092-4f0c-8d42-a08330274346`
- **Decision:** [x]
- **Note:** _(curator fills in if needed)_

## [73] Museum of Death (history)
- **Source:** wikidata
- **Significance breakdown:** source_base=40, cross_source=10, pageviews=13, route_adjacency=10, p31_bonus=0, total=73
- **Description:** Museum of Death is a museum with locations on Selma Ave in Hollywood, Los Angeles, and New Orleans. It was established in June 1995 by J. D. Healy and Catherine Shultz with the museum's stated goal being "to make people happy to be alive."
- **Location:** 34.1018, -118.3212
- **POI id:** `995b7714-59e5-477d-8a97-aa022513dd8a`
- **Decision:** [r]
- **Note:** _(curator fills in if needed)_

## [72] La Brea Tar Pits (history)
- **Source:** wikidata
- **Significance breakdown:** source_base=40, cross_source=10, pageviews=17, route_adjacency=5, p31_bonus=0, total=72
- **Description:** La Brea Tar Pits comprise an active paleontological research site in urban Los Angeles. Hancock Park was formed around a group of tar pits where natural asphalt has seeped up from the ground for tens of thousands of years. Over many centur…
- **Location:** 34.0631, -118.3558
- **POI id:** `7415732e-a158-4158-baf9-89011f929742`
- **Decision:** [+]
- **Note:** _(curator fills in if needed)_

## [72] Mission San Antonio de Padua (history)
- **Source:** editorial
- **Significance breakdown:** source_base=40, cross_source=20, pageviews=12, route_adjacency=0, p31_bonus=0, total=72
- **Description:** Mission San Antonio de Padua is a Spanish mission established by the Franciscan order in present-day Monterey County, California, near the present-day town of Jolon. Founded on July 14, 1771, it was the third mission founded in Alta Califo…
- **Location:** 36.0157, -121.2499
- **POI id:** `37b0490f-0a90-4ffe-814a-886962a35f09`
- **Decision:** [+]
- **Note:** _(curator fills in if needed)_

## [72] Mission Santa Inés (history)
- **Source:** editorial
- **Significance breakdown:** source_base=40, cross_source=20, pageviews=12, route_adjacency=0, p31_bonus=0, total=72
- **Description:** Nineteenth of the 21 California missions, founded in 1804 in the Santa Ynez Valley as a link between Mission Santa Bárbara and La Purísima Concepción.
- **Location:** 34.5945, -120.1366
- **POI id:** `599c180e-cdf2-4f70-911c-c0de91ed8dd5`
- **Decision:** [+]
- **Note:** _(curator fills in if needed)_

## [72] Old Point Loma Lighthouse (history)
- **Source:** state_landmark
- **Significance breakdown:** source_base=40, cross_source=30, pageviews=2, route_adjacency=0, p31_bonus=0, total=72
- **Description:** The original Point Loma Lighthouse is a historic lighthouse located on the Point Loma peninsula at the mouth of San Diego Bay in San Diego, California. It is situated on half an acre of land designated Cabrillo National Monument. It is no…
- **Location:** 32.6717, -117.2408
- **POI id:** `d0b6c532-5928-4736-8a29-39fc6c5feda6`
- **Decision:** [+]
- **Note:** _(curator fills in if needed)_

## [72] San Diego Air & Space Museum (history)
- **Source:** wikidata
- **Significance breakdown:** source_base=40, cross_source=10, pageviews=12, route_adjacency=10, p31_bonus=0, total=72
- **Description:** The San Diego Air & Space Museum (SDASM) is an aviation and space exploration museum in San Diego, California. It is located in Balboa Park and is housed in the former Ford Building, which is listed on the US National Register of Historic…
- **Location:** 32.7263, -117.1540
- **POI id:** `9a4fe4b6-9194-4b49-a7fb-1c5be5bf2e32`
- **Decision:** [x]
- **Note:** _(curator fills in if needed)_

## [71] Autry Museum of the American West (history)
- **Source:** wikidata
- **Significance breakdown:** source_base=40, cross_source=10, pageviews=11, route_adjacency=10, p31_bonus=0, total=71
- **Description:** The Autry Museum of the American West is a museum in Los Angeles, California, dedicated to exploring an inclusive history of the American West. Founded in 1988, the museum presents a wide range of exhibitions and public programs, including…
- **Location:** 34.1486, -118.2820
- **POI id:** `fb4c70b3-33ca-467b-9048-41dd1ac46cfa`
- **Decision:** [x]
- **Note:** _(curator fills in if needed)_

## [71] Gamble House (history)
- **Source:** state_landmark
- **Significance breakdown:** source_base=30, cross_source=30, pageviews=6, route_adjacency=5, p31_bonus=0, total=71
- **Description:** Pasadena Also on the NRHP list as NPS-71000155
- **Location:** 34.1516, -118.1608
- **POI id:** `c6940de2-bd18-4569-a3bb-6155e2867dde`
- **Decision:** [r]
- **Note:** _(curator fills in if needed)_

## [71] Korean Bell of Friendship (history)
- **Source:** wikidata
- **Significance breakdown:** source_base=45, cross_source=10, pageviews=11, route_adjacency=5, p31_bonus=0, total=71
- **Description:** The Korean Bell of Friendship is a massive bronze bell housed in a stone pavilion located in Angel's Gate Park, situated in the San Pedro neighborhood of Los Angeles, California. Positioned at the intersection of Gaffey and 37th Streets, t…
- **Location:** 33.7097, -118.2938
- **POI id:** `a7cbe01f-c88d-4da4-88a2-68c0a8288ba1`
- **Decision:** [r]
- **Note:** _(curator fills in if needed)_

## [71] Mission Nuestra Señora de la Soledad (history)
- **Source:** editorial
- **Significance breakdown:** source_base=40, cross_source=20, pageviews=11, route_adjacency=0, p31_bonus=0, total=71
- **Description:** Mission Nuestra Señora de la Soledad, commonly known as Mission Soledad, is a Spanish mission located in Soledad, California. The mission was founded by the Franciscan order on October 9, 1791, to convert the Native Americans living in the…
- **Location:** 36.4053, -121.3555
- **POI id:** `750110ec-42ef-4035-834d-822e4e737ba2`
- **Decision:** [+]
- **Note:** _(curator fills in if needed)_

## [71] Museum of Us (history)
- **Source:** wikidata
- **Significance breakdown:** source_base=40, cross_source=10, pageviews=11, route_adjacency=10, p31_bonus=0, total=71
- **Description:** The Museum of Us is a museum of anthropology located in Balboa Park in San Diego, California. The museum is housed in the historic landmark buildings of the California Quadrangle.
- **Location:** 32.7314, -117.1520
- **POI id:** `d3a189b8-0161-4188-a6af-82ee815bc408`
- **Decision:** [r]
- **Note:** _(curator fills in if needed)_

## [71] Whaley House (history)
- **Source:** state_landmark
- **Significance breakdown:** source_base=40, cross_source=20, pageviews=1, route_adjacency=10, p31_bonus=0, total=71
- **Description:** The Whaley House is a Greek Revival–style residence and museum in Old Town, San Diego, California. It is the oldest brick structure in Southern California, built in 1857. It is a California Historical Landmark No. 65 and is currently maint…
- **Location:** 32.7528, -117.1945
- **POI id:** `6d5d7d89-af01-44ba-b69f-3aecbf5213d3`
- **Decision:** [r]
- **Note:** _(curator fills in if needed)_

## [71] Winchester Mystery House (history)
- **Source:** state_landmark
- **Significance breakdown:** source_base=40, cross_source=20, pageviews=6, route_adjacency=5, p31_bonus=0, total=71
- **Description:** The Winchester Mystery House is a mansion in San Jose, California, that was once the personal residence of Sarah Winchester, the widow of firearms magnate William Wirt Winchester. The house became a tourist attraction nine months after Win…
- **Location:** 37.3184, -121.9508
- **POI id:** `81a849f0-7e65-419d-9c66-3be5423f916c`
- **Decision:** [r]
- **Note:** _(curator fills in if needed)_

## [70] Armenian Genocide Martyrs Monument (history)
- **Source:** wikidata
- **Significance breakdown:** source_base=45, cross_source=10, pageviews=10, route_adjacency=5, p31_bonus=0, total=70
- **Description:** The Armenian Genocide Martyrs Monument is a monument in Montebello, California in the Los Angeles metropolitan area, dedicated to the victims of the Armenian genocide of 1915. The monument, opened in April 1968, is a tower of eight arches…
- **Location:** 34.0284, -118.1310
- **POI id:** `20203d1d-6c6a-492f-8d11-447b7ddc6224`
- **Decision:** [r]
- **Note:** _(curator fills in if needed)_

## [70] Bowers Museum (history)
- **Source:** wikidata
- **Significance breakdown:** source_base=40, cross_source=10, pageviews=10, route_adjacency=10, p31_bonus=0, total=70
- **Description:** The Bowers Museum is an art museum located in Santa Ana, California. The museum's permanent collection includes more than 100,000 objects, and features notable strengths in the areas of pre-Columbian Mesoamerica, Native American art, the a…
- **Location:** 33.7630, -117.8680
- **POI id:** `fc697dea-5e89-48de-ae9e-d2f015913f4e`
- **Decision:** [r]
- **Note:** _(curator fills in if needed)_

## [70] Discovery Science Center (history)
- **Source:** wikidata
- **Significance breakdown:** source_base=40, cross_source=10, pageviews=10, route_adjacency=10, p31_bonus=0, total=70
- **Description:** The Discovery Cube Orange County, formerly known as the Discovery Science Center, Taco Bell Discovery Science Center, or simply The Cube, is a science museum in Santa Ana, California, with more than 100 hands-on science exhibits designed t…
- **Location:** 33.7699, -117.8677
- **POI id:** `f8a60e83-061c-4f73-8ea2-59855976c76a`
- **Decision:** [x]
- **Note:** _(curator fills in if needed)_

## [70] Forbes Mill (history)
- **Source:** state_landmark
- **Significance breakdown:** source_base=40, cross_source=30, pageviews=0, route_adjacency=0, p31_bonus=0, total=70
- **Description:** Forbes Mill is a now-defunct flour mill originally built in 1854 located in Los Gatos, California, which served as the History Museum of Los Gatos after having been saved from destruction in 1982. The museum closed in 2014, and its collect…
- **Location:** 37.2221, -121.9802
- **POI id:** `2f074e33-2cf9-42a1-923c-7b8d7ac944dd`
- **Decision:** [x]
- **Note:** _(curator fills in if needed)_

## [70] Forestiere Underground Gardens (history)
- **Source:** state_landmark
- **Significance breakdown:** source_base=40, cross_source=30, pageviews=0, route_adjacency=0, p31_bonus=0, total=70
- **Description:** The Forestiere Underground Gardens in Fresno, California are a series of subterranean structures built by Baldassare Forestiere, an immigrant from Sicily, over a period of 40 years from 1906 to his death in 1946. The gardens are operated b…
- **Location:** 36.8072, -119.8808
- **POI id:** `0c14e495-e2ef-4d87-bf94-bb4c48f5c285`
- **Decision:** [x]
- **Note:** _(curator fills in if needed)_

## [70] Golden Gate Park (history)
- **Source:** nrhp
- **Significance breakdown:** source_base=40, cross_source=20, pageviews=0, route_adjacency=10, p31_bonus=0, total=70
- **Description:** Golden Gate Park is an urban park between the Richmond and Sunset districts on the West Side of San Francisco, California, United States. It is the largest urban park in the city, containing 1,017 acres (412 ha), and the third-most visited…
- **Location:** 37.7696, -122.4781
- **POI id:** `38ef5b2f-ab91-4a91-a744-aa2f2ef76035`
- **Decision:** [x]
- **Note:** _(curator fills in if needed)_

## [70] Kelso Depot, Restaurant and Employees Hotel (history)
- **Source:** nrhp
- **Significance breakdown:** source_base=50, cross_source=20, pageviews=0, route_adjacency=0, p31_bonus=0, total=70
- **Description:** Significant for: ARCHITECTURE; COMMUNITY PLANNING AND DEVELOPMENT; TRANSPORTATION; ENGINEERING; INDUSTRY; EDUCATION.
- **Location:** 35.0118, -115.6515
- **POI id:** `19c3ad4b-6797-4a47-9b2f-ea7c874a6b49`
- **Decision:** [r]
- **Note:** _(curator fills in if needed)_

## [70] Kuruvungna Springs (history)
- **Source:** osm
- **Significance breakdown:** source_base=55, cross_source=10, pageviews=0, route_adjacency=5, p31_bonus=0, total=70
- **Description:** _(none)_
- **Location:** 34.0449, -118.4578
- **POI id:** `ca6f456f-d62f-426d-ac75-507a0d6ab3d3`
- **Decision:** [x]
- **Note:** _(curator fills in if needed)_

## [70] Mess Hall (history)
- **Source:** osm
- **Significance breakdown:** source_base=30, cross_source=30, pageviews=0, route_adjacency=10, p31_bonus=0, total=70
- **Description:** _(none)_
- **Location:** 34.8737, -118.8938
- **POI id:** `312f755f-eb77-4737-b8f5-ff81e8fc2a22`
- **Decision:** [r]
- **Note:** _(curator fills in if needed)_

## [70] Mission Chumash Barracks (history)
- **Source:** osm
- **Significance breakdown:** source_base=30, cross_source=30, pageviews=0, route_adjacency=10, p31_bonus=0, total=70
- **Description:** _(none)_
- **Location:** 34.2813, -119.2986
- **POI id:** `25d1cc1e-a793-4a9b-bd34-b5e6fa48decb`
- **Decision:** [x]
- **Note:** _(curator fills in if needed)_

## [70] Pigeon Point Lighthouse (history)
- **Source:** state_landmark
- **Significance breakdown:** source_base=40, cross_source=20, pageviews=0, route_adjacency=10, p31_bonus=0, total=70
- **Description:** Pigeon Point Light Station or Pigeon Point Lighthouse is a lighthouse built in 1871 to guide ships on the Pacific coast of California. It is the tallest lighthouse on the West Coast of the United States. It is still an active Coast Guard a…
- **Location:** 37.1817, -122.3939
- **POI id:** `43062640-c5f4-49be-aab0-3fda44edc79e`
- **Decision:** [+]
- **Note:** _(curator fills in if needed)_

## [70] San Diego Natural History Museum (history)
- **Source:** wikidata
- **Significance breakdown:** source_base=40, cross_source=10, pageviews=10, route_adjacency=10, p31_bonus=0, total=70
- **Description:** The San Diego Natural History Museum is a museum in Balboa Park in San Diego, California. It was founded in 1874 as the San Diego Society of Natural History. It is the second oldest scientific institution west of the Mississippi and the ol…
- **Location:** 32.7321, -117.1470
- **POI id:** `dd707ffc-ea20-4a45-927e-1040fdf3cd52`
- **Decision:** [x]
- **Note:** _(curator fills in if needed)_

# Category: local_culture

_Display name: **Local Culture** · Effective floor: **70** · Count: **24**_

## [100] Santa Monica Pier (local_culture)
- **Source:** wikidata
- **Significance breakdown:** source_base=68, cross_source=10, pageviews=14, route_adjacency=10, p31_bonus=0, total=100
- **Description:** The Santa Monica Pier is a large pier at the foot of Colorado Avenue in Santa Monica, California, United States. It contains a small amusement park, concession stands, and areas for views and fishing. The pier is part of the greater Santa…
- **Location:** 34.0086, -118.4986
- **POI id:** `0ef620f4-9880-485e-a8b1-d2473ecbe8d7`
- **Decision:** [x]
- **Note:** _(curator fills in if needed)_

## [95] Hollywood Sign (local_culture)
- **Source:** editorial
- **Significance breakdown:** source_base=60, cross_source=30, pageviews=0, route_adjacency=5, p31_bonus=0, total=95
- **Description:** The Hollywood Sign is an American landmark and cultural icon overlooking Hollywood, Los Angeles. Originally the Hollywoodland Sign, it is situated on Mount Lee, above Beachwood Canyon in the Santa Monica Mountains. Spelling out the word "H…
- **Location:** 34.1341, -118.3217
- **POI id:** `2e7059ed-37f2-4c34-9599-82a7157a230d`
- **Decision:** [x]
- **Note:** _(curator fills in if needed)_

## [90] Marine World/Africa USA (local_culture)
- **Source:** wikidata
- **Significance breakdown:** source_base=58, cross_source=10, pageviews=12, route_adjacency=10, p31_bonus=0, total=90
- **Description:** Marine World/Africa USA was an animal theme park located in the Redwood Shores area of Redwood City, California. The park was named Marine World when it first opened in 1968, before merging with a land-animal park called Africa USA in 1972…
- **Location:** 37.5317, -122.2650
- **POI id:** `4027f0f8-b280-4ec2-bf56-ee937eb826ec`
- **Decision:** [x]
- **Note:** _(pre-marked — defunct — merged with Six Flags Discovery Kingdom; entity no longer exists)_

## [88] Adventure City (local_culture)
- **Source:** wikidata
- **Significance breakdown:** source_base=68, cross_source=10, pageviews=10, route_adjacency=0, p31_bonus=0, total=88
- **Description:** Adventure City is an amusement park in Stanton, California, United States. Occupying an area of just over 2 acres (0.81 ha), Adventure City is one of the smallest theme parks in California, and receives an average attendance of between 200…
- **Location:** 33.8152, -117.9923
- **POI id:** `7453f2d8-dce7-45cd-8c2a-fd98bea08a02`
- **Decision:** [x]
- **Note:** _(pre-marked — theme_park — small Stanton theme park, not narrate-worthy)_

## [82] Avengers Campus (local_culture)
- **Source:** wikidata
- **Significance breakdown:** source_base=58, cross_source=0, pageviews=14, route_adjacency=10, p31_bonus=0, total=82
- **Description:** Avengers Campus is a Marvel Cinematic Universe (MCU)–themed area located at Disney California Adventure and Disney Adventure World in Disneyland Paris, and being developed for Hong Kong Disneyland under the name Stark Expo. The Marvel-them…
- **Location:** 33.8121, -117.9190
- **POI id:** `186a3dc0-d51d-4090-8138-ee45cd369f45`
- **Decision:** [r]
- **Note:** _(pre-marked — theme_park_child — Disney California Adventure feature)_

## [81] Cars Land (local_culture)
- **Source:** wikidata
- **Significance breakdown:** source_base=58, cross_source=0, pageviews=13, route_adjacency=10, p31_bonus=0, total=81
- **Description:** Cars Land is a themed area of Disney California Adventure, inspired by Pixar's Cars franchise, and Route 66 in America. The 12-acre (4.9 ha) area, built as part of Disney California Adventure's $1.1 billion expansion project, opened on Jun…
- **Location:** 33.8056, -117.9187
- **POI id:** `96f91a79-c0b3-4e2a-930f-1d84622b5501`
- **Decision:** [r]
- **Note:** _(pre-marked — theme_park_child — Disney California Adventure theme area)_

## [80] Adventuredome (local_culture)
- **Source:** wikidata
- **Significance breakdown:** source_base=58, cross_source=0, pageviews=12, route_adjacency=10, p31_bonus=0, total=80
- **Description:** Adventuredome is a 5-acre (2 ha) indoor amusement park at Circus Circus in Winchester, Nevada on the Las Vegas Strip. It is owned by Phil Ruffin. It is contained within a large glass dome, and offers various rides and attractions including…
- **Location:** 36.1378, -115.1660
- **POI id:** `a5b48978-fa40-42c0-8daf-dc9fd550f29b`
- **Decision:** [r]
- **Note:** _(pre-marked — nevada — Las Vegas, NV (SPARQL bbox bleed))_

## [80] Pacific Park (local_culture)
- **Source:** wikidata
- **Significance breakdown:** source_base=58, cross_source=0, pageviews=12, route_adjacency=10, p31_bonus=0, total=80
- **Description:** Pacific Park is an oceanfront amusement park located in Santa Monica, California. The park, located on the Santa Monica Pier, looks directly out on the Pacific Ocean, in the direction of Santa Catalina Island. It is the only amusement park…
- **Location:** 34.0083, -118.4981
- **POI id:** `91209444-6418-4e81-b17d-f537b255ef8d`
- **Decision:** [r]
- **Note:** _(pre-marked — theme_park_child — venue child of Santa Monica Pier)_

## [79] Confusion Hill (local_culture)
- **Source:** wikidata
- **Significance breakdown:** source_base=58, cross_source=0, pageviews=11, route_adjacency=10, p31_bonus=0, total=79
- **Description:** Confusion Hill is a roadside attraction in Piercy, California. The attraction, which opened in 1949, includes what is dubbed as a "gravity house", a structure built to give the interior visitors tilt-induced optical illusions, similar to t…
- **Location:** 39.9189, -123.7649
- **POI id:** `3d204afe-b1c7-4508-9831-ae59722c9d95`
- **Decision:** [r]
- **Note:** _(curator fills in if needed)_

## [79] Disneyland Park (local_culture)
- **Source:** editorial
- **Significance breakdown:** source_base=40, cross_source=10, pageviews=19, route_adjacency=10, p31_bonus=0, total=79
- **Description:** Disneyland is a theme park at the Disneyland Resort in Anaheim, California, United States. It was the first theme park opened by the Walt Disney Company and the only one designed and constructed under the direct supervision of Walt Disney,…
- **Location:** 33.8128, -117.9195
- **POI id:** `eeb1b2b2-5b0d-4ddc-9287-af437cfbc916`
- **Decision:** [+]
- **Note:** _(curator fills in if needed)_

## [78] Legoland California (local_culture)
- **Source:** editorial
- **Significance breakdown:** source_base=40, cross_source=20, pageviews=13, route_adjacency=5, p31_bonus=0, total=78
- **Description:** Legoland California Resort is a theme park in Carlsbad, California, United States, about 35 miles north of San Diego. Opening on March 20, 1999, it was the first Legoland park to open outside of Europe. It has over 60 rides, shows, and att…
- **Location:** 33.1272, -117.3112
- **POI id:** `14d851d5-775a-467c-b7a1-2351081d9375`
- **Decision:** [+]
- **Note:** _(curator fills in if needed)_

## [77] Universal Studios Hollywood (local_culture)
- **Source:** editorial
- **Significance breakdown:** source_base=40, cross_source=10, pageviews=17, route_adjacency=10, p31_bonus=0, total=77
- **Description:** Universal Studios Hollywood is a film studio and theme park located in Universal City, California, United States, near Hollywood, Los Angeles. Owned by NBCUniversal (Comcast) and operated by Universal Destinations & Experiences, it is one…
- **Location:** 34.1386, -118.3557
- **POI id:** `a8bc56e0-9d31-43c9-9655-180c464f2a43`
- **Decision:** [+]
- **Note:** _(curator fills in if needed)_

## [76] Disney California Adventure Park (local_culture)
- **Source:** editorial
- **Significance breakdown:** source_base=40, cross_source=10, pageviews=16, route_adjacency=10, p31_bonus=0, total=76
- **Description:** Disney California Adventure is a theme park at the Disneyland Resort in Anaheim, California. It is owned and operated by the Walt Disney Company through its Experiences division. The 72-acre (29 ha) park is themed after Disney's interpreta…
- **Location:** 33.8074, -117.9194
- **POI id:** `a7c1ec07-7a02-479a-aa0f-4b98d6e34388`
- **Decision:** [+]
- **Note:** _(curator fills in if needed)_

## [76] Six Flags Magic Mountain (local_culture)
- **Source:** editorial
- **Significance breakdown:** source_base=40, cross_source=20, pageviews=16, route_adjacency=0, p31_bonus=0, total=76
- **Description:** Six Flags Magic Mountain, formerly known and colloquially referred to as simply Magic Mountain, is a 209-acre (85 ha) amusement park located in Valencia, California, 35 miles (56 km) northwest of downtown Los Angeles. It opened on May 29,…
- **Location:** 34.4256, -118.5974
- **POI id:** `b8f2e45e-ed6c-4b6e-abd6-bf4e2677dc8b`
- **Decision:** [+]
- **Note:** _(curator fills in if needed)_

## [75] The Pike (local_culture)
- **Source:** wikidata
- **Significance breakdown:** source_base=58, cross_source=0, pageviews=12, route_adjacency=5, p31_bonus=0, total=75
- **Description:** The Pike was an amusement zone in Long Beach, California. The Pike was founded in 1902 along the shoreline south of Ocean Boulevard with several independent arcades, food stands, gift shops, a variety of rides and a grand bath house. It wa…
- **Location:** 33.7661, -118.1890
- **POI id:** `f77d8d68-e154-4f55-8b53-53ea48a0a0a0`
- **Decision:** [x]
- **Note:** _(curator fills in if needed)_

## [74] Belmont Park (local_culture)
- **Source:** wikidata
- **Significance breakdown:** source_base=58, cross_source=0, pageviews=11, route_adjacency=5, p31_bonus=0, total=74
- **Description:** Belmont Park is an oceanfront historic amusement park in the Mission Beach community of San Diego, California. The park was developed by sugar magnate John D. Spreckels and opened on July 4, 1925, as the Mission Beach Amusement Center. In…
- **Location:** 32.7714, -117.2520
- **POI id:** `dff08aa4-36a8-496d-80fa-7a032de60330`
- **Decision:** [x]
- **Note:** _(curator fills in if needed)_

## [73] Children's Fairyland (local_culture)
- **Source:** wikidata
- **Significance breakdown:** source_base=58, cross_source=0, pageviews=10, route_adjacency=5, p31_bonus=0, total=73
- **Description:** Children's Fairyland, U.S.A. is an amusement park, located in Oakland, California, on the shores of Lake Merritt. It was one of the earliest "themed" amusement parks in the United States. Fairyland includes 10 acres (4.0 ha) of play sets,…
- **Location:** 37.8090, -122.2600
- **POI id:** `2be858d1-746c-4ef1-907e-750c2d08c148`
- **Decision:** [r]
- **Note:** _(curator fills in if needed)_

## [73] Idora Park (local_culture)
- **Source:** wikidata
- **Significance breakdown:** source_base=58, cross_source=0, pageviews=10, route_adjacency=5, p31_bonus=0, total=73
- **Description:** Idora Park was a 17.5-acre (71,000 m2) Victorian era trolley park in north Oakland, California constructed in 1904 on the site of an informal park setting called Ayala Park on the north banks of Temescal Creek. It was leased by the Ingerso…
- **Location:** 37.8424, -122.2632
- **POI id:** `670ca102-acd5-4667-b20f-d50c16759a0e`
- **Decision:** [r]
- **Note:** _(curator fills in if needed)_

## [72] Japanese Village and Deer Park (local_culture)
- **Source:** wikidata
- **Significance breakdown:** source_base=53, cross_source=0, pageviews=9, route_adjacency=10, p31_bonus=0, total=72
- **Description:** The Japanese Village and Deer Park is a defunct amusement park formerly located in Buena Park, California.
- **Location:** 33.8703, -118.0100
- **POI id:** `0c4e065c-a7d2-474e-bc88-fe46a401e3c4`
- **Decision:** [r]
- **Note:** _(curator fills in if needed)_

## [71] Knott's Berry Farm (local_culture)
- **Source:** editorial
- **Significance breakdown:** source_base=40, cross_source=10, pageviews=16, route_adjacency=5, p31_bonus=0, total=71
- **Description:** Knott's Berry Farm is a 57-acre amusement park in Buena Park, California, United States, owned and operated by Six Flags. In March 2015, it was ranked as the twelfth-most-visited theme park in North America, while averaging approximately 4…
- **Location:** 33.8435, -117.9993
- **POI id:** `6df4d227-481e-4284-8cb1-c03c74ca5ba9`
- **Decision:** [+]
- **Note:** _(curator fills in if needed)_

## [71] San Francisco Dungeon (local_culture)
- **Source:** wikidata
- **Significance breakdown:** source_base=58, cross_source=0, pageviews=8, route_adjacency=5, p31_bonus=0, total=71
- **Description:** The San Francisco Dungeon was a tourist attraction that recreated historical events using 360° sets, special effects, and live actors. Visitors walked through the Dungeon, and were guided through each show by professional actors. The attra…
- **Location:** 37.8082, -122.4148
- **POI id:** `92700577-bdfb-41d8-b497-f82cf95351f6`
- **Decision:** [x]
- **Note:** _(curator fills in if needed)_

## [71] Six Flags Hurricane Harbor Concord (local_culture)
- **Source:** wikidata
- **Significance breakdown:** source_base=53, cross_source=0, pageviews=13, route_adjacency=5, p31_bonus=0, total=71
- **Description:** Six Flags Hurricane Harbor Concord is a seasonal water park located in Concord, California. It was initially developed, owned, and operated by Premier Parks. It is currently owned by EPR Properties and operated by Six Flags.
- **Location:** 37.9711, -122.0522
- **POI id:** `ad33f073-a7c5-437a-8160-15493105f94f`
- **Decision:** [x]
- **Note:** _(curator fills in if needed)_

## [70] Raging Waters (local_culture)
- **Source:** wikidata
- **Significance breakdown:** source_base=53, cross_source=0, pageviews=12, route_adjacency=5, p31_bonus=0, total=70
- **Description:** Raging Waters Los Angeles is a water theme park in San Dimas, California. Owned and operated by Lucky Strike Entertainment, it is generally closed during the winter season.
- **Location:** 34.0781, -117.8110
- **POI id:** `83beec80-adad-47c6-a700-50cb434126a6`
- **Decision:** [x]
- **Note:** _(curator fills in if needed)_

## [70] The Chutes of San Francisco (local_culture)
- **Source:** wikidata
- **Significance breakdown:** source_base=53, cross_source=0, pageviews=7, route_adjacency=10, p31_bonus=0, total=70
- **Description:** The Chutes of San Francisco was an amusement park located on Fillmore Street, in the Fillmore District of San Francisco, California, bounded by Webster, Eddy and Turk Streets.
- **Location:** 37.7803, -122.4319
- **POI id:** `ed59a87f-6f5f-4752-822b-56049534bfd6`
- **Decision:** [x]
- **Note:** _(curator fills in if needed)_

# Category: nature

_Display name: **Nature & Wildlife** · Effective floor: **65** · Count: **110**_

## [87] Black Hill (nature)
- **Source:** wikidata
- **Significance breakdown:** source_base=50, cross_source=10, pageviews=7, route_adjacency=10, p31_bonus=10, total=87
- **Description:** Black Hill is a mountain situated in Morro Bay, California, part of Morro Bay State Park. It is one of a series of volcanic plugs called the Nine Sisters.
- **Location:** 35.3586, -120.8320
- **POI id:** `e68edcbe-f623-4012-88e7-5220e911ecab`
- **Decision:** [+]
- **Note:** _(curator fills in if needed)_

## [86] North Yolla Bolly Mountain (nature)
- **Source:** wikidata
- **Significance breakdown:** source_base=50, cross_source=20, pageviews=6, route_adjacency=0, p31_bonus=10, total=86
- **Description:** North Yolla Bolly Mountain is a 7,868-foot (2,398 m) peak in the Klamath Mountains of the Coast Ranges located in Trinity County, Northern California. The mountain is located in an isolated part of the Yolla Bolly-Middle Eel Wilderness, in…
- **Location:** 40.1961, -122.9736
- **POI id:** `e891aab8-a37a-438b-8e2b-7efd98720fc9`
- **Decision:** [+]
- **Note:** _(curator fills in if needed)_

## [86] Verdi Peaks (nature)
- **Source:** wikidata
- **Significance breakdown:** source_base=50, cross_source=20, pageviews=6, route_adjacency=0, p31_bonus=10, total=86
- **Description:** The Verdi Peaks, officially just Verdi Peak, are a group of three mountain peaks in the Ruby Mountains of Elko County, Nevada, United States. The highest peak is the fiftieth-highest in the state. The peaks are located on the edge of the R…
- **Location:** 40.6444, -115.3578
- **POI id:** `0471fd45-90e9-4f83-831f-806573e7caee`
- **Decision:** [x]
- **Note:** _(NV-bleed downgrade cycle-2: was [+], now [x] — keep in slate, no boost, small narrative)_

## [85] Rattlesnake Hill (Churchill County, Nevada) (nature)
- **Source:** wikidata
- **Significance breakdown:** source_base=45, cross_source=20, pageviews=5, route_adjacency=5, p31_bonus=10, total=85
- **Description:** Rattlesnake Hill is a summit in the U.S. state of Nevada. The elevation is 4,163 feet (1,269 m).
- **Location:** 39.4900, -118.7522
- **POI id:** `cb893ed4-68f8-49ac-aaec-94226d824a5a`
- **Decision:** [x]
- **Note:** _(NV-bleed downgrade cycle-2: was [+], now [x] — keep in slate, no boost, small narrative)_

## [83] Churchill Butte (nature)
- **Source:** wikidata
- **Significance breakdown:** source_base=45, cross_source=20, pageviews=3, route_adjacency=5, p31_bonus=10, total=83
- **Description:** Churchill Butte is a summit in the U.S. state of Nevada. The elevation is 5,928 feet (1,807 m).
- **Location:** 39.3394, -119.2961
- **POI id:** `2d48f77c-1881-434a-8ff2-ad8747dae34d`
- **Decision:** [x]
- **Note:** _(NV-bleed downgrade cycle-2: was [+], now [x] — keep in slate, no boost, small narrative)_

## [82] Mount Watkins (nature)
- **Source:** wikidata
- **Significance breakdown:** source_base=45, cross_source=20, pageviews=7, route_adjacency=0, p31_bonus=10, total=82
- **Description:** Mount Watkins is an 8,497-foot-elevation (2,590-meter) mountain summit in the Sierra Nevada mountain range, in Mariposa County, California, United States.
- **Location:** 37.7828, -119.5176
- **POI id:** `29df82da-c62d-4de9-86b6-693f986ee6df`
- **Decision:** [+]
- **Note:** _(curator fills in if needed)_

## [81] Lake Temescal (nature)
- **Source:** wikidata
- **Significance breakdown:** source_base=48, cross_source=20, pageviews=8, route_adjacency=5, p31_bonus=0, total=81
- **Description:** Lake Temescal is a small reservoir in the Oakland hills, in northeastern Oakland, California. It is the centerpiece of Temescal Regional Recreational Area, also known as Temescal Regional Park. It is a part of the East Bay Regional Park Di…
- **Location:** 37.8478, -122.2314
- **POI id:** `9525dc70-1845-424f-b1a3-9daa1fca0ecb`
- **Decision:** [x]
- **Note:** _(curator fills in if needed)_

## [80] Echo Lake (nature)
- **Source:** wikidata
- **Significance breakdown:** source_base=48, cross_source=20, pageviews=7, route_adjacency=5, p31_bonus=0, total=80
- **Description:** Echo Lake, is the name of a glacial lake—summer reservoir located in El Dorado County, eastern California, United States.
- **Location:** 38.8428, -120.0760
- **POI id:** `227777ca-522f-4a91-b7fc-741db53da127`
- **Decision:** [x]
- **Note:** _(curator fills in if needed)_

## [79] Balboa Park Gardens (nature)
- **Source:** wikidata
- **Significance breakdown:** source_base=52, cross_source=10, pageviews=7, route_adjacency=10, p31_bonus=0, total=79
- **Description:** Balboa Park is a 1,200-acre (490 ha) historic urban cultural park in San Diego, California. Placed in reserve in 1835, the park's site is one of the oldest in the United States dedicated to public recreational use. The park hosts various m…
- **Location:** 32.7314, -117.1450
- **POI id:** `dce330bc-65eb-40e0-bef7-a6546b362b7d`
- **Decision:** [x]
- **Note:** _(curator fills in if needed)_

## [79] Junipero Serra Peak (nature)
- **Source:** wikidata
- **Significance breakdown:** source_base=50, cross_source=10, pageviews=9, route_adjacency=0, p31_bonus=10, total=79
- **Description:** Junipero Serra Peak is the highest mountain in the Santa Lucia range of central California with a height of 1,785 metres. It is also the highest peak in Monterey County, and is located within the boundaries of Los Padres National Forest. I…
- **Location:** 36.1456, -121.4190
- **POI id:** `1d9b9e98-c304-4f90-9488-605a6c231151`
- **Decision:** [x]
- **Note:** _(curator fills in if needed)_

## [79] Needle Peak (nature)
- **Source:** wikidata
- **Significance breakdown:** source_base=45, cross_source=20, pageviews=4, route_adjacency=0, p31_bonus=10, total=79
- **Description:** Needle Peak is a mountain in the Panamint Range in the northern Mojave Desert, in Inyo County, eastern California.
- **Location:** 35.8866, -117.0276
- **POI id:** `5866c236-1d7f-4ff0-8b8d-8ef92286a2b6`
- **Decision:** [x]
- **Note:** _(curator fills in if needed)_

## [79] Twin Peaks (Churchill County, Nevada) (nature)
- **Source:** wikidata
- **Significance breakdown:** source_base=45, cross_source=20, pageviews=4, route_adjacency=0, p31_bonus=10, total=79
- **Description:** Twin Peaks is a summit in the U.S. state of Nevada. The elevation is 7,093 feet (2,162 m).
- **Location:** 39.4094, -118.0569
- **POI id:** `60f63159-ce08-438a-a945-e4bc6e2ff3e2`
- **Decision:** [x]
- **Note:** _(curator fills in if needed)_

## [78] Cerro San Luis Obispo (nature)
- **Source:** wikidata
- **Significance breakdown:** source_base=50, cross_source=10, pageviews=8, route_adjacency=0, p31_bonus=10, total=78
- **Description:** Cerro San Luis Obispo is a 1,292 feet (394 m) mountain in San Luis Obispo, California. It is part of the chain of peaks called the Nine Sisters. It is a common spot for hiking, jogging and mountain biking, and has steep terrain. Below the…
- **Location:** 35.2828, -120.6800
- **POI id:** `2a82aad2-ac75-4a7f-9be6-e19d8f68b3f2`
- **Decision:** [x]
- **Note:** _(curator fills in if needed)_

## [78] Cone Peak (nature)
- **Source:** wikidata
- **Significance breakdown:** source_base=50, cross_source=10, pageviews=8, route_adjacency=0, p31_bonus=10, total=78
- **Description:** Cone Peak is the second highest mountain in the Santa Lucia Range in the Ventana Wilderness of the Los Padres National Forest. It rises nearly a vertical mile only 3 miles (4.8 km) from the coast as the crow flies. This is one of the steep…
- **Location:** 36.0519, -121.4964
- **POI id:** `991a9050-459a-4f0d-ae33-a3aba1534bff`
- **Decision:** [x]
- **Note:** _(curator fills in if needed)_

## [78] South Hill (Eureka County, Nevada) (nature)
- **Source:** wikidata
- **Significance breakdown:** source_base=45, cross_source=20, pageviews=3, route_adjacency=0, p31_bonus=10, total=78
- **Description:** South Hill is a summit in the U.S. state of Nevada. The elevation is 7,264 feet (2,214 m).
- **Location:** 39.3636, -115.9931
- **POI id:** `f32409f3-6757-4d03-a607-daec3dda2430`
- **Decision:** [x]
- **Note:** _(curator fills in if needed)_

## [77] Cerro Cabrillo (nature)
- **Source:** wikidata
- **Significance breakdown:** source_base=50, cross_source=10, pageviews=7, route_adjacency=0, p31_bonus=10, total=77
- **Description:** Cerro Cabrillo, also known locally as Cabrillo Peak, is a rocky mountain in eastern Morro Bay State Park, San Luis Obispo County, central California.
- **Location:** 35.3522, -120.8150
- **POI id:** `7066e918-d09e-4ed7-9e31-ffe2d2fcb9f0`
- **Decision:** [x]
- **Note:** _(curator fills in if needed)_

## [77] Hollister Peak (nature)
- **Source:** wikidata
- **Significance breakdown:** source_base=50, cross_source=10, pageviews=7, route_adjacency=0, p31_bonus=10, total=77
- **Description:** Hollister Peak is a 1,404-foot (428 m) volcanic plug located near Morro Bay, California. It is one of the Nine Sisters, and receives its name from the family that lived at its base in 1884. It was of religious importance to the Chumash. Ho…
- **Location:** 35.3440, -120.7870
- **POI id:** `e92ff543-c775-4dab-9f92-bca9b9c75ccb`
- **Decision:** [x]
- **Note:** _(curator fills in if needed)_

## [76] Caliente Mountain (nature)
- **Source:** wikidata
- **Significance breakdown:** source_base=50, cross_source=10, pageviews=6, route_adjacency=0, p31_bonus=10, total=76
- **Description:** Caliente Mountain is a mountain located in the Southern Coast Ranges of California and is a federally listed wilderness study area for more than 30 years. The summit, at 5,106 feet (1,556 m), is the highest point in San Luis Obispo County…
- **Location:** 35.0364, -119.7600
- **POI id:** `d1113b97-dac0-426c-bc49-96cf07eab859`
- **Decision:** [x]
- **Note:** _(curator fills in if needed)_

## [76] Mount Lee (nature)
- **Source:** wikidata
- **Significance breakdown:** source_base=40, cross_source=10, pageviews=11, route_adjacency=5, p31_bonus=10, total=76
- **Description:** Mount Lee is a peak in the Santa Monica Mountains, located in Griffith Park in Los Angeles, California, USA. The Hollywood Sign is located on its southern slope.
- **Location:** 34.1346, -118.3217
- **POI id:** `e6b5c50a-1e36-4e7f-a0e5-43a5b294db47`
- **Decision:** [x]
- **Note:** _(curator fills in if needed)_

## [76] Mount Lukens (nature)
- **Source:** wikidata
- **Significance breakdown:** source_base=40, cross_source=10, pageviews=11, route_adjacency=5, p31_bonus=10, total=76
- **Description:** Mount Lukens is a mountain peak of the San Gabriel Mountains, in Los Angeles County, California. It is the highest point in the city of Los Angeles.
- **Location:** 34.2689, -118.2390
- **POI id:** `6647284d-e277-4298-b394-344e0befad46`
- **Decision:** [x]
- **Note:** _(curator fills in if needed)_

## [75] Cerro Romauldo (nature)
- **Source:** wikidata
- **Significance breakdown:** source_base=50, cross_source=10, pageviews=5, route_adjacency=0, p31_bonus=10, total=75
- **Description:** Cerro Romualdo is a 1,300-foot (396 m) mountain in San Luis Obispo County, California. The mountain is the fifth in a series of volcanic plugs called the Nine Sisters. Until 1964 the mountain was officially known as Romualdo Peak.
- **Location:** 35.3141, -120.7270
- **POI id:** `8d6f829e-3f0e-43f3-a81e-516c493c5644`
- **Decision:** [x]
- **Note:** _(curator fills in if needed)_

## [75] Cowles Mountain (nature)
- **Source:** wikidata
- **Significance breakdown:** source_base=40, cross_source=10, pageviews=10, route_adjacency=5, p31_bonus=10, total=75
- **Description:** Cowles Mountain is a prominent mountain in San Carlos, San Diego, California. The 1,593-foot (486 m) summit is the highest point of the city of San Diego. It is protected within Mission Trails Regional Park.
- **Location:** 32.8128, -117.0320
- **POI id:** `24511717-fe9d-480e-990a-74e9533ca43d`
- **Decision:** [x]
- **Note:** _(curator fills in if needed)_

## [73] Beacon Hill (nature)
- **Source:** wikidata
- **Significance breakdown:** source_base=35, cross_source=10, pageviews=8, route_adjacency=10, p31_bonus=10, total=73
- **Description:** Beacon Hill, formerly known as Chocolate Drop Mountain, is the tallest summit of a range of granite hills surrounding and running northeastward from Lake Norconian, at the extreme northwest of the Temescal Mountains, in Norco, California.
- **Location:** 33.9344, -117.5610
- **POI id:** `c866e4b4-24f9-4b09-9040-5f935284a394`
- **Decision:** [x]
- **Note:** _(curator fills in if needed)_

## [73] Cahuenga Peak (nature)
- **Source:** wikidata
- **Significance breakdown:** source_base=40, cross_source=10, pageviews=8, route_adjacency=5, p31_bonus=10, total=73
- **Description:** Cahuenga Peak is the 12th-highest named peak in the Santa Monica Mountains and is located just west of the Hollywood Sign. Cahuenga Peak is the highest peak in Griffith Park. It provides a spectacular 360-degree panorama of the Los Angeles…
- **Location:** 34.1370, -118.3260
- **POI id:** `20c9c470-f379-4b8b-9cee-ec45e2b761c4`
- **Decision:** [x]
- **Note:** _(curator fills in if needed)_

## [73] Emerald Pool (nature)
- **Source:** wikidata
- **Significance breakdown:** source_base=48, cross_source=20, pageviews=5, route_adjacency=0, p31_bonus=0, total=73
- **Description:** Emerald Pool is a small, shallow lake, with an area of less than one acre. It is located about 80 meters above Vernal Fall in Yosemite National Park. It is named for its deep green color, which is caused by algae living on the rocks at the…
- **Location:** 37.7273, -119.5420
- **POI id:** `2a681cc6-2e91-440e-8322-d620d9e2a805`
- **Decision:** [x]
- **Note:** _(curator fills in if needed)_

## [73] Monte Cristo Range (nature)
- **Source:** wikidata
- **Significance breakdown:** source_base=47, cross_source=20, pageviews=6, route_adjacency=0, p31_bonus=0, total=73
- **Description:** The Monte Cristo Range is located in western Nevada in the United States. The range lies southeast of the Excelsior Mountains and east and north of Highway 95 in Esmeralda County. The Bureau of Land Management manages 99.9% of the range.…
- **Location:** 38.1390, -117.7880
- **POI id:** `674f1e25-4a8c-42c1-ac74-d3597ff29a9c`
- **Decision:** [x]
- **Note:** _(curator fills in if needed)_

## [72] Badger Mountains (nature)
- **Source:** wikidata
- **Significance breakdown:** source_base=47, cross_source=20, pageviews=5, route_adjacency=0, p31_bonus=0, total=72
- **Description:** The Badger Mountains is a mountain range in Washoe County, Nevada. The southern portion is within the East Fork High Rock Canyon Wilderness. The northern portion is within the Sheldon National Wildlife Refuge.
- **Location:** 41.6163, -119.3344
- **POI id:** `43604abe-89df-40e0-a5ae-c6d14219c3fa`
- **Decision:** [x]
- **Note:** _(curator fills in if needed)_

## [72] Broken Hills (nature)
- **Source:** wikidata
- **Significance breakdown:** source_base=47, cross_source=20, pageviews=5, route_adjacency=0, p31_bonus=0, total=72
- **Description:** The Broken Hills, or Broken Hills Range, is a mountain range bordering Churchill County, Nevada, and Mineral County, Nevada.
- **Location:** 39.1035, -117.9700
- **POI id:** `4dff8a6e-1280-480a-9459-f0fc4b58fa45`
- **Decision:** [x]
- **Note:** _(curator fills in if needed)_

## [72] Mount Toro (nature)
- **Source:** wikidata
- **Significance breakdown:** source_base=45, cross_source=10, pageviews=7, route_adjacency=0, p31_bonus=10, total=72
- **Description:** Mount Toro is a mountain peak in the Santa Lucia range in Monterey County, California. It is located within the boundaries of Los Padres National Forest. The name comes from the word "Toro," which in Spanish means "Bull".
- **Location:** 36.5261, -121.6100
- **POI id:** `6cd8edae-164e-4199-8577-7dcf2183c035`
- **Decision:** [x]
- **Note:** _(curator fills in if needed)_

## [72] Pico Blanco (nature)
- **Source:** wikidata
- **Significance breakdown:** source_base=45, cross_source=10, pageviews=7, route_adjacency=0, p31_bonus=10, total=72
- **Description:** Pico Blanco is a peak on the coast of Big Sur in the Santa Lucia Range of the Los Padres National Forest. The Little Sur River and its tributaries almost surround the mountain. The North Fork wraps around the northern flank and eastern edg…
- **Location:** 36.3186, -121.8116
- **POI id:** `0d567265-818f-4bde-8110-4f6741d3cf53`
- **Decision:** [x]
- **Note:** _(curator fills in if needed)_

## [71] Cerro Alto (nature)
- **Source:** wikidata
- **Significance breakdown:** source_base=45, cross_source=10, pageviews=6, route_adjacency=0, p31_bonus=10, total=71
- **Description:** Cerro Alto Peak is a mountain peak in San Luis Obispo County, California. It is 2,624 feet tall.
- **Location:** 35.4147, -120.7342
- **POI id:** `f2fb9de2-eff2-439a-84c9-f9e6366faa85`
- **Decision:** [x]
- **Note:** _(curator fills in if needed)_

## [71] Dixie Hills (nature)
- **Source:** wikidata
- **Significance breakdown:** source_base=47, cross_source=20, pageviews=4, route_adjacency=0, p31_bonus=0, total=71
- **Description:** The Dixie Hills are a mountain range in Elko County, Nevada.
- **Location:** 40.5124, -115.8270
- **POI id:** `6cce11d7-3f80-4849-ac85-35ead58150b9`
- **Decision:** [x]
- **Note:** _(curator fills in if needed)_

## [71] Mission Point (nature)
- **Source:** wikidata
- **Significance breakdown:** source_base=40, cross_source=10, pageviews=6, route_adjacency=5, p31_bonus=10, total=71
- **Description:** Mission Point, better known as "Mission Peak" to locals, is a spur of Oat Mountain in Los Angeles County, Southern California. At 2,771 feet (845 m) high, it is the second highest peak of the Santa Susana Mountains after Oat Mountain.
- **Location:** 34.3117, -118.5338
- **POI id:** `3e402285-b08b-49da-8eea-c7845751d719`
- **Decision:** [x]
- **Note:** _(curator fills in if needed)_

## [71] Mossbrae Falls (nature)
- **Source:** wikidata
- **Significance breakdown:** source_base=42, cross_source=0, pageviews=9, route_adjacency=10, p31_bonus=10, total=71
- **Description:** Mossbrae Falls is a waterfall flowing into the Sacramento River, in the Shasta Cascade area in Dunsmuir, California, United States. The falls are located just south of the lower portion of Shasta Springs. Access to the falls is via a mile-…
- **Location:** 41.2417, -122.2670
- **POI id:** `e35d09e1-525b-4bf7-93ee-c09614f2f397`
- **Decision:** [x]
- **Note:** _(curator fills in if needed)_

## [71] Ventana Double Cone (nature)
- **Source:** wikidata
- **Significance breakdown:** source_base=45, cross_source=10, pageviews=6, route_adjacency=0, p31_bonus=10, total=71
- **Description:** The Ventana Double Cone at 4,856 feet (1,480 m) is one of the tallest peaks in the Ventana Wilderness within the Monterey Ranger District of the Los Padres National Forest in Central California. The summit is a difficult 14.7 miles (23.7 k…
- **Location:** 36.2969, -121.7147
- **POI id:** `abcc706e-9fd7-49a4-8783-298214bb11de`
- **Decision:** [x]
- **Note:** _(curator fills in if needed)_

## [71] Viejas Mountain (nature)
- **Source:** wikidata
- **Significance breakdown:** source_base=40, cross_source=10, pageviews=6, route_adjacency=5, p31_bonus=10, total=71
- **Description:** Viejas Mountain is a mountain in San Diego County, California. At 4,189 feet (1,277 m), Viejas Mountain is the 48th tallest peak in San Diego County. The mountain can be seen from parts of metropolitan San Diego. The summit is about 3 mile…
- **Location:** 32.8612, -116.7260
- **POI id:** `1c87c173-ab4d-4257-9305-ada1f8750817`
- **Decision:** [x]
- **Note:** _(curator fills in if needed)_

## [70] Four Brothers (nature)
- **Source:** wikidata
- **Significance breakdown:** source_base=47, cross_source=20, pageviews=3, route_adjacency=0, p31_bonus=0, total=70
- **Description:** The Four Brothers are a series of four mountain peaks in Del Norte County, California. All peaks are about a mile high the highest at 5310 ft. The southernmost peak contains an active fire lookout staffed by the USFS which can be accessed…
- **Location:** 41.7357, -123.7930
- **POI id:** `00e717fa-babb-4f03-b221-fd7575090eb9`
- **Decision:** [x]
- **Note:** _(curator fills in if needed)_

## [70] Laveaga Peak (nature)
- **Source:** wikidata
- **Significance breakdown:** source_base=45, cross_source=10, pageviews=5, route_adjacency=0, p31_bonus=10, total=70
- **Description:** Laveaga Peak is a mountain located in the Diablo Range in California. Its summit rises to an elevation of 3,804 feet (1,159 m). The peak is on the boundary between Merced County and San Benito County and is the highest point in Merced Coun…
- **Location:** 36.8904, -121.1780
- **POI id:** `4e7f8645-0acd-46fc-9056-deae71348fdd`
- **Decision:** [x]
- **Note:** _(curator fills in if needed)_

## [70] Rincon Hill (nature)
- **Source:** wikidata
- **Significance breakdown:** source_base=40, cross_source=0, pageviews=10, route_adjacency=10, p31_bonus=10, total=70
- **Description:** Rincon Hill is a neighborhood in San Francisco, California. It is one of San Francisco's many hills, and one of its original "Seven Hills". The relatively compact neighborhood is bounded by Folsom Street to the north, the Embarcadero to th…
- **Location:** 37.7856, -122.3919
- **POI id:** `83ef08a5-297b-4fae-bf50-a84e3aabdffe`
- **Decision:** [x]
- **Note:** _(curator fills in if needed)_

## [70] Santa Rita peak (nature)
- **Source:** wikidata
- **Significance breakdown:** source_base=45, cross_source=10, pageviews=5, route_adjacency=0, p31_bonus=10, total=70
- **Description:** Santa Rita Peak is a mountain located in the Diablo Range of California in San Benito County, a short distance to the west of the Fresno County line and 3 miles (5 km) southeast of San Benito Mountain. Cantua Creek has its source on its no…
- **Location:** 36.3466, -120.6020
- **POI id:** `c742ea00-8508-455e-bdd0-bac6114e784f`
- **Decision:** [x]
- **Note:** _(curator fills in if needed)_

## [70] Santiago Peak (nature)
- **Source:** wikidata
- **Significance breakdown:** source_base=40, cross_source=10, pageviews=10, route_adjacency=0, p31_bonus=10, total=70
- **Description:** Santiago Peak is the southern mountain of the Saddleback landform in the Cleveland National Forest, located on the border of Orange County and Riverside County, California, United States. It is the highest and most prominent peak of both t…
- **Location:** 33.7105, -117.5340
- **POI id:** `f952d9db-287b-4a2f-930e-5ece99fa0f31`
- **Decision:** [x]
- **Note:** _(curator fills in if needed)_

## [70] Table Mountain (nature)
- **Source:** wikidata
- **Significance breakdown:** source_base=45, cross_source=10, pageviews=5, route_adjacency=0, p31_bonus=10, total=70
- **Description:** Table Mountain is a mountain ridge located in the Diablo Range in Northern California on the boundary between Kings and Monterey counties. It rises to an elevation of 3,476 feet (1,059 m) and is the highest point in Kings County. A large 5…
- **Location:** 35.9061, -120.2760
- **POI id:** `df07fe5b-8164-4bb5-9227-be9cc8090bb9`
- **Decision:** [x]
- **Note:** _(curator fills in if needed)_

## [69] El Cajon Mountain (nature)
- **Source:** wikidata
- **Significance breakdown:** source_base=40, cross_source=10, pageviews=9, route_adjacency=0, p31_bonus=10, total=69
- **Description:** El Cajon Mountain, commonly known as El Capitan or El Cap, is a mountain in the Cuyamaca Mountains, and prominent natural landmark in the East County of San Diego.
- **Location:** 32.9148, -116.8200
- **POI id:** `46ca5972-7bcd-49e6-a8e9-c57657b16f13`
- **Decision:** [x]
- **Note:** _(curator fills in if needed)_

## [69] Elsinore Peak (nature)
- **Source:** wikidata
- **Significance breakdown:** source_base=45, cross_source=10, pageviews=4, route_adjacency=0, p31_bonus=10, total=69
- **Description:** Elsinore Peak is a named 3,575-foot (1,090 m) summit, at the southern end of the mountain ridge running southeast from the vicinity east of El Cariso in the Elsinore Mountains, in Riverside County, California in the United States.
- **Location:** 33.6022, -117.3442
- **POI id:** `d95401c5-fd31-4607-a8d2-abeaffaad315`
- **Decision:** [x]
- **Note:** _(curator fills in if needed)_

## [69] Hedge Creek Falls (nature)
- **Source:** wikidata
- **Significance breakdown:** source_base=42, cross_source=0, pageviews=7, route_adjacency=10, p31_bonus=10, total=69
- **Description:** Hedge Creek Falls is a waterfall on Hedge Creek, in the Shasta Cascade area in Dunsmuir, California. There is a small cave located behind the waterfall, allowing visitors to walk behind the cascading water. Shortly after the waterfall, hed…
- **Location:** 41.2373, -122.2681
- **POI id:** `461966ba-7cc6-48cf-b30e-b03e5549ee15`
- **Decision:** [x]
- **Note:** _(curator fills in if needed)_

## [69] Mount Baden-Powell (nature)
- **Source:** wikidata
- **Significance breakdown:** source_base=40, cross_source=10, pageviews=9, route_adjacency=0, p31_bonus=10, total=69
- **Description:** Mount Baden-Powell is a peak in the San Gabriel Mountains of California named for the founder of the World Scouting Movement, Robert Baden-Powell, 1st Baron Baden-Powell. It was officially recognized by the USGS at a dedication ceremony in…
- **Location:** 34.3584, -117.7650
- **POI id:** `6e25e109-1273-49ef-8ed8-740d4078d941`
- **Decision:** [x]
- **Note:** _(curator fills in if needed)_

## [69] Mustang Peak (nature)
- **Source:** wikidata
- **Significance breakdown:** source_base=45, cross_source=10, pageviews=4, route_adjacency=0, p31_bonus=10, total=69
- **Description:** Mustang Peak is a summit in the Diablo Range on the northwest - southeast trending range of mountains marking the boundary of Monterey County and Fresno County, California. This summit rises to an elevation of 3,596 feet. It overlooks the…
- **Location:** 35.9747, -120.4133
- **POI id:** `3d486364-2340-4405-b314-c537cc1fe591`
- **Decision:** [x]
- **Note:** _(curator fills in if needed)_

## [69] Sandstone Peak (nature)
- **Source:** wikidata
- **Significance breakdown:** source_base=40, cross_source=10, pageviews=9, route_adjacency=0, p31_bonus=10, total=69
- **Description:** Sandstone Peak, also known as Mount Allen, is a mountain in Ventura County, California. It is the highest summit in the Santa Monica Mountains, with an elevation of 3,114 feet (949 m). Located near the western edge of the Santa Monica Moun…
- **Location:** 34.1203, -118.9320
- **POI id:** `a92ec9be-2332-49f0-aa98-6cdbf3d63c44`
- **Decision:** [x]
- **Note:** _(curator fills in if needed)_

## [69] Tecate Peak (nature)
- **Source:** wikidata
- **Significance breakdown:** source_base=40, cross_source=10, pageviews=9, route_adjacency=0, p31_bonus=10, total=69
- **Description:** Tecate Peak is a mountain in San Diego County, California. It is 4 miles (6.4 km) west of the twin towns of Tecate, California, and Tecate, Baja California, and it is about 1⁄2 mile (800 m) north of the Mexico–United States border.
- **Location:** 32.5796, -116.6888
- **POI id:** `9a5e530c-8dc7-4086-9417-91e3e55aae9c`
- **Decision:** [x]
- **Note:** _(curator fills in if needed)_

## [69] Tierra Redonda Mountain (nature)
- **Source:** wikidata
- **Significance breakdown:** source_base=45, cross_source=10, pageviews=4, route_adjacency=0, p31_bonus=10, total=69
- **Description:** Tierra Redonda Mountain is a mountain in northwestern San Luis Obispo County, California. It is in the eastern portion of the Santa Lucia Range, separated from the main ridge by the Nacimiento River.
- **Location:** 35.7710, -120.9860
- **POI id:** `e1190d53-799b-4b37-8638-3c0fd86d0d43`
- **Decision:** [x]
- **Note:** _(curator fills in if needed)_

## [68] Albany Hill (nature)
- **Source:** wikidata
- **Significance breakdown:** source_base=40, cross_source=0, pageviews=8, route_adjacency=10, p31_bonus=10, total=68
- **Description:** Albany Hill is a prominent hill along the east shore of San Francisco Bay in the city of Albany, California. Geologically, the hill is predominantly Jurassic sandstone, carried to the western edge of North America on the Pacific Plate and…
- **Location:** 37.8949, -122.3047
- **POI id:** `75549f43-b849-409c-a4a1-94eaa7be7573`
- **Decision:** [x]
- **Note:** _(curator fills in if needed)_

## [68] Bernal Heights Summit (nature)
- **Source:** wikidata
- **Significance breakdown:** source_base=40, cross_source=0, pageviews=8, route_adjacency=10, p31_bonus=10, total=68
- **Description:** Bernal Heights Summit or Bernal Heights Hill is a hill in the San Francisco, California neighborhood of Bernal Heights. Upper elevations are part of Bernal Heights Park, a 26.3-acre (10.6 ha) public park managed by the San Francisco Recrea…
- **Location:** 37.7430, -122.4160
- **POI id:** `0a5597d8-13a5-4645-b867-876d9a310831`
- **Decision:** [x]
- **Note:** _(curator fills in if needed)_

## [68] Black Mountain (nature)
- **Source:** wikidata
- **Significance breakdown:** source_base=45, cross_source=10, pageviews=3, route_adjacency=0, p31_bonus=10, total=68
- **Description:** Black Mountain is a summit and the high point of Anticline Ridge in the Diablo Range of Fresno County, California. It rises to an elevation of 3,629 feet.
- **Location:** 36.3044, -120.4033
- **POI id:** `7cea5b2a-e939-4fc3-ade1-6977325c7927`
- **Decision:** [x]
- **Note:** _(curator fills in if needed)_

## [68] Boney Peak (nature)
- **Source:** wikidata
- **Significance breakdown:** source_base=40, cross_source=10, pageviews=8, route_adjacency=0, p31_bonus=10, total=68
- **Description:** Boney Mountain, also known as Boney Peak, is one of the highest peaks in the Santa Monica Mountains. The mountain is located in Ventura County, California and is 2,825 feet (861 m) in height. The highest summit in the Santa Monica Mountain…
- **Location:** 34.1163, -118.9400
- **POI id:** `3077357e-3a29-4595-94c5-03c23ea306ef`
- **Decision:** [x]
- **Note:** _(curator fills in if needed)_

## [68] Buck Peak (nature)
- **Source:** wikidata
- **Significance breakdown:** source_base=45, cross_source=10, pageviews=3, route_adjacency=0, p31_bonus=10, total=68
- **Description:** Buck Peak is a summit in the Diablo Range in San Benito County, California. It rises to an elevation of 3,527 feet.
- **Location:** 36.5450, -120.8730
- **POI id:** `72a62ab7-344a-4751-ae28-7e9b78e40b6a`
- **Decision:** [x]
- **Note:** _(curator fills in if needed)_

## [68] Cuyamaca Peak (nature)
- **Source:** wikidata
- **Significance breakdown:** source_base=40, cross_source=10, pageviews=8, route_adjacency=0, p31_bonus=10, total=68
- **Description:** Cuyamaca Peak is a mountain peak of the Cuyamaca Mountains range in San Diego County, California.
- **Location:** 32.9467, -116.6060
- **POI id:** `107c05e0-2113-4974-996a-835633320005`
- **Decision:** [x]
- **Note:** _(curator fills in if needed)_

## [68] Devils Peak (nature)
- **Source:** wikidata
- **Significance breakdown:** source_base=40, cross_source=10, pageviews=8, route_adjacency=0, p31_bonus=10, total=68
- **Description:** Devils Peak at 2,429 feet (740 m) is the tallest peak on the Channel Islands of California. It is located on Santa Cruz Island within Channel Islands National Park on land owned by The Nature Conservancy. Visiting the area requires a permi…
- **Location:** 34.0291, -119.7840
- **POI id:** `be6118f7-dba5-4672-b140-84220dd133b6`
- **Decision:** [x]
- **Note:** _(curator fills in if needed)_

## [68] Double Peak (nature)
- **Source:** wikidata
- **Significance breakdown:** source_base=40, cross_source=10, pageviews=8, route_adjacency=0, p31_bonus=10, total=68
- **Description:** Double Peak is located south of San Marcos, California. The elevation at the summit is 1,646 ft (502 m), and approximately 1,000 feet above the north foot of the mountain. Most trails leading to the summit of Double Peak are classified as…
- **Location:** 33.1095, -117.1780
- **POI id:** `0cf4cc35-c75b-45cc-b60e-392d4b14af0f`
- **Decision:** [x]
- **Note:** _(curator fills in if needed)_

## [68] Figueroa Mountain (nature)
- **Source:** wikidata
- **Significance breakdown:** source_base=40, cross_source=10, pageviews=8, route_adjacency=0, p31_bonus=10, total=68
- **Description:** Figueroa Mountain is a summit in Santa Barbara County in the U.S. state of California. It is in the San Rafael Mountains, part of the Transverse Ranges group of ranges. The mountain is located in Los Padres National Forest.
- **Location:** 34.7435, -119.9850
- **POI id:** `439baa6c-bddd-4eb2-bb75-cb607eb82ba1`
- **Decision:** [x]
- **Note:** _(curator fills in if needed)_

## [68] Frazier Mountain (nature)
- **Source:** wikidata
- **Significance breakdown:** source_base=40, cross_source=10, pageviews=8, route_adjacency=0, p31_bonus=10, total=68
- **Description:** Frazier Mountain is a broad, pine-forested peak in the Transverse Ranges System, within the Los Padres National Forest in northeastern Ventura County, California. At 8,017 feet (2,444 m), Frazier Mountain is the sixteenth-highest mountain…
- **Location:** 34.7750, -118.9690
- **POI id:** `0704a918-1442-4b18-aff7-7bcd8c4f62e0`
- **Decision:** [x]
- **Note:** _(curator fills in if needed)_

## [68] Lake Gregory (nature)
- **Source:** wikidata
- **Significance breakdown:** source_base=48, cross_source=10, pageviews=10, route_adjacency=0, p31_bonus=0, total=68
- **Description:** Lake Gregory is a reservoir in the San Bernardino National Forest of the San Bernardino Mountains in San Bernardino County, California. The lake and the surrounding area make up the Lake Gregory Regional Park adjacent to Crestline, Califor…
- **Location:** 34.2466, -117.2680
- **POI id:** `9d6d1e0c-2e0c-48b6-b7a2-26b85231b436`
- **Decision:** [x]
- **Note:** _(curator fills in if needed)_

## [68] Mount Disappointment (nature)
- **Source:** wikidata
- **Significance breakdown:** source_base=40, cross_source=10, pageviews=8, route_adjacency=0, p31_bonus=10, total=68
- **Description:** Mount Disappointment is a mountain in the San Gabriel Mountains in Los Angeles County, California with a summit elevation of 5,963+ feet. It was named "Disappointment" in 1894 when USGS surveyors in the Wheeler Survey sighted it from the S…
- **Location:** 34.2467, -118.1050
- **POI id:** `0500fb77-ceec-476d-ad1f-b48e854d4c32`
- **Decision:** [x]
- **Note:** _(curator fills in if needed)_

## [68] Mount Lowe (nature)
- **Source:** wikidata
- **Significance breakdown:** source_base=40, cross_source=10, pageviews=8, route_adjacency=0, p31_bonus=10, total=68
- **Description:** Mount Lowe is a mountain on the southern fold of the San Gabriel Mountains. Originally named Oak Mountain, it was renamed for Professor Thaddeus S.C. Lowe, who is credited for being the first person to set foot on and plant the American fl…
- **Location:** 34.2319, -118.1060
- **POI id:** `fcae9c03-3bd8-4b84-9ae1-11dbbedbedbc`
- **Decision:** [x]
- **Note:** _(curator fills in if needed)_

## [68] Otay Mountain (nature)
- **Source:** wikidata
- **Significance breakdown:** source_base=40, cross_source=10, pageviews=8, route_adjacency=0, p31_bonus=10, total=68
- **Description:** Otay Mountain is a mountain in San Diego County, California. It is the highest summit of the San Ysidro Mountains. The mountain is located in the Otay Mountain Wilderness area.
- **Location:** 32.5946, -116.8450
- **POI id:** `70d5a338-247d-4407-a2f9-aec2da875784`
- **Decision:** [x]
- **Note:** _(curator fills in if needed)_

## [68] Salmon Creek Falls (nature)
- **Source:** wikidata
- **Significance breakdown:** source_base=42, cross_source=0, pageviews=6, route_adjacency=10, p31_bonus=10, total=68
- **Description:** Salmon Creek Falls is a 120-foot waterfall in the southern Big Sur region of Monterey County, California. The falls are located along California State Route 1 about 2.9 mi (4.7 km) northwest of Ragged Point and lies within the Monterey Ran…
- **Location:** 35.8193, -121.3521
- **POI id:** `fe65041d-40e0-402a-b4b7-9ebf80073ac0`
- **Decision:** [x]
- **Note:** _(curator fills in if needed)_

## [68] San Miguel Mountain (nature)
- **Source:** wikidata
- **Significance breakdown:** source_base=40, cross_source=10, pageviews=8, route_adjacency=0, p31_bonus=10, total=68
- **Description:** San Miguel Mountain is a mountain in Chula Vista, California. It is 2,567' high, and is the 84th highest peak in San Diego County.
- **Location:** 32.6964, -116.9362
- **POI id:** `f9791bcb-4c2c-4387-8d1c-fef30e450f6e`
- **Decision:** [x]
- **Note:** _(curator fills in if needed)_

## [68] Strawberry Hill (nature)
- **Source:** wikidata
- **Significance breakdown:** source_base=40, cross_source=0, pageviews=8, route_adjacency=10, p31_bonus=10, total=68
- **Description:** Strawberry Hill is a hill in San Francisco, California, near the center of Golden Gate Park. The hill occupies an entire island in the park's man-made Blue Heron Lake, and is connected by two bridges to the mainland of the park.
- **Location:** 37.7685, -122.4750
- **POI id:** `02757b86-9657-4b74-b693-a30f5b676e90`
- **Decision:** [x]
- **Note:** _(curator fills in if needed)_

## [68] Strawberry Peak (nature)
- **Source:** wikidata
- **Significance breakdown:** source_base=40, cross_source=10, pageviews=8, route_adjacency=0, p31_bonus=10, total=68
- **Description:** Strawberry Peak is a prominent peak in the San Gabriel Mountains of Los Angeles County, California. It is located about 10 miles (16 km) north of Pasadena, and 28 miles (45 km) from Los Angeles, along the Angeles Crest Highway. Strawberry…
- **Location:** 34.2836, -118.1200
- **POI id:** `f0d17906-2aac-475c-b098-14ed8a77623a`
- **Decision:** [x]
- **Note:** _(curator fills in if needed)_

## [68] Tarantula Hill (nature)
- **Source:** wikidata
- **Significance breakdown:** source_base=40, cross_source=10, pageviews=8, route_adjacency=0, p31_bonus=10, total=68
- **Description:** Tarantula Hill, is a 1,057-foot-high (322 m) peak in Thousand Oaks, California. It is located on a 45-acre (18 ha) open space and is operated by the Conejo Open Space Conservation Agency (COSCA). Climbing Tarantula Hill is a steep 0.5-mile…
- **Location:** 34.1962, -118.8879
- **POI id:** `8030edd7-041a-488a-9ae1-3863dd3bbaf5`
- **Decision:** [x]
- **Note:** _(curator fills in if needed)_

## [68] Yosemite National Park (nature)
- **Source:** editorial
- **Significance breakdown:** source_base=40, cross_source=10, pageviews=18, route_adjacency=0, p31_bonus=0, total=68
- **Description:** Yosemite National Park is a national park of the United States in California. It is bordered on the southeast by the Sierra National Forest and on the northwest by Stanislaus National Forest. The park is managed by the National Park Servic…
- **Location:** 37.9314, -119.4568
- **POI id:** `81a43c14-3ac5-4420-ab1e-761c95428942`
- **Decision:** [+]
- **Note:** _(curator typo-resolved: was [+ → [+] per cycle-2 decision; soul-doctrine flagship)_

## [68] Zwang Peak (nature)
- **Source:** wikidata
- **Significance breakdown:** source_base=45, cross_source=10, pageviews=3, route_adjacency=0, p31_bonus=10, total=68
- **Description:** Zwang Peak is a mountain in the Diablo Range, 8 miles (13 km) southwest of Avenal, and about 12 miles (19 km) from Interstate 5 in Kings County, California. Its summit is at an elevation of 3,081 feet (939 m). The peak was named for cattle…
- **Location:** 35.9466, -120.2480
- **POI id:** `e8c4c885-4644-4723-80c8-776068a51162`
- **Decision:** [x]
- **Note:** _(curator fills in if needed)_

## [67] Burnt Peak (nature)
- **Source:** wikidata
- **Significance breakdown:** source_base=40, cross_source=10, pageviews=7, route_adjacency=0, p31_bonus=10, total=67
- **Description:** Burnt Peak is the highest peak of the Sierra Pelona, located in northwestern Los Angeles County, Southern California. The peak is home to a VOR air navigation beacon.
- **Location:** 34.6825, -118.5770
- **POI id:** `c0a6a9f0-1f9f-4aae-8b85-33afe7807437`
- **Decision:** [x]
- **Note:** _(curator fills in if needed)_

## [67] Conejo Mountain (nature)
- **Source:** wikidata
- **Significance breakdown:** source_base=40, cross_source=10, pageviews=7, route_adjacency=0, p31_bonus=10, total=67
- **Description:** Conejo Mountain is a 1,814-foot-high mountain (553 m) in Ventura County, California, near Camarillo on the eastern boundary of the Oxnard Plain. At the western edge of the Conejo Valley, it is adjacent to the Santa Monica Mountains. Crossi…
- **Location:** 34.1883, -118.9844
- **POI id:** `85b4fff6-fdf1-403d-8d9c-b5dad22e27f8`
- **Decision:** [x]
- **Note:** _(curator fills in if needed)_

## [67] Hearst San Simeon State Historical Monument (nature)
- **Source:** editorial
- **Significance breakdown:** source_base=40, cross_source=0, pageviews=17, route_adjacency=10, p31_bonus=0, total=67
- **Description:** Hearst San Simeon State Historical Monument — venue (state_park)
- **Location:** 35.5968, -121.1184
- **POI id:** `6158a6b0-dda8-4efe-b7e2-61317ec76b2e`
- **Decision:** [+]
- **Note:** _(curator fills in if needed)_

## [67] Iron Mountain (nature)
- **Source:** wikidata
- **Significance breakdown:** source_base=40, cross_source=10, pageviews=7, route_adjacency=0, p31_bonus=10, total=67
- **Description:** Iron Mountain is a mountain in the San Gabriel Mountains of Los Angeles County, California. It is within the San Gabriel Mountains National Monument, in the section managed by the Angeles National Forest.
- **Location:** 34.2883, -117.7130
- **POI id:** `8052812c-3580-4cb0-aa09-cce73843a3b8`
- **Decision:** [x]
- **Note:** _(curator fills in if needed)_

## [67] Margarita Peak (nature)
- **Source:** wikidata
- **Significance breakdown:** source_base=40, cross_source=10, pageviews=7, route_adjacency=0, p31_bonus=10, total=67
- **Description:** Margarita Peak is a prominent mountain in San Diego County. It is 9 miles (14 km) southwest of Murrieta Hot Springs and 9 miles (14 km) northwest of Fallbrook. Its 3,193-foot (973 m) summit is the 32nd most prominent peak in San Diego Coun…
- **Location:** 33.4444, -117.3910
- **POI id:** `a61c6435-984d-48b4-9ad3-90da91b39f9a`
- **Decision:** [x]
- **Note:** _(curator fills in if needed)_

## [67] Superior Lake (nature)
- **Source:** wikidata
- **Significance breakdown:** source_base=43, cross_source=20, pageviews=4, route_adjacency=0, p31_bonus=0, total=67
- **Description:** Superior Lake is a dry lake basin in the Mojave Desert of San Bernardino County, California, 40 km (25 mi) north of Barstow. The lake is made up of three basins, approximately 15 km (9.3 mi) long and 6 km (3.7 mi) at its widest point. Thro…
- **Location:** 35.2450, -117.0256
- **POI id:** `48e7e61b-3b51-4df0-9966-63218fe54ce0`
- **Decision:** [x]
- **Note:** _(curator fills in if needed)_

## [66] Arlington Peak (nature)
- **Source:** wikidata
- **Significance breakdown:** source_base=40, cross_source=10, pageviews=6, route_adjacency=0, p31_bonus=10, total=66
- **Description:** Arlington Peak is a 3,258-foot (993 m) high peak within the Santa Ynez Mountains located north of Santa Barbara, California, adjacent to the south of La Cumbre Peak and to the southeast of Cathedral Peak. The name of the peak purportedly o…
- **Location:** 34.4828, -119.7146
- **POI id:** `426d7225-539d-4c38-a60d-acfb34f908b4`
- **Decision:** [x]
- **Note:** _(curator fills in if needed)_

## [66] Ballard Mountain (nature)
- **Source:** wikidata
- **Significance breakdown:** source_base=35, cross_source=10, pageviews=11, route_adjacency=0, p31_bonus=10, total=66
- **Description:** Ballard Mountain is a mountain in Los Angeles County, California in the Santa Monica Mountains with an elevation of 2,039 feet (621 m). Originally known as Niggerhead, all names containing that slur were replaced by the Board on Geographic…
- **Location:** 34.1097, -118.8097
- **POI id:** `8657edae-716a-42bd-a6b8-fe607c509f93`
- **Decision:** [x]
- **Note:** _(curator fills in if needed)_

## [66] Cobblestone Mountain (nature)
- **Source:** wikidata
- **Significance breakdown:** source_base=40, cross_source=10, pageviews=6, route_adjacency=0, p31_bonus=10, total=66
- **Description:** Cobblestone Mountain is a peak in the Topatopa Mountains, in Ventura County, about 14 mi (23 km) north of Piru, California. At 6,738 feet (2,054 m), it is the third highest peak of the Topatopa Mountains. the highest is Alamo Mountain at 7…
- **Location:** 34.6091, -118.8680
- **POI id:** `3c7fc38f-161a-430d-b0dc-c4185806fd4c`
- **Decision:** [x]
- **Note:** _(curator fills in if needed)_

## [66] Coyote Mountain (nature)
- **Source:** wikidata
- **Significance breakdown:** source_base=40, cross_source=10, pageviews=6, route_adjacency=0, p31_bonus=10, total=66
- **Description:** Coyote Mountain is a mountain in the Santa Rosa Mountains range, in eastern San Diego County, California.
- **Location:** 33.3434, -116.3290
- **POI id:** `c317b6b1-d256-408b-afa2-4ae7593ce43d`
- **Decision:** [x]
- **Note:** _(curator fills in if needed)_

## [66] Elephant Hill (nature)
- **Source:** wikidata
- **Significance breakdown:** source_base=35, cross_source=10, pageviews=6, route_adjacency=5, p31_bonus=10, total=66
- **Description:** Elephant Hill is a hill, the northernmost summit in the Puente Hills of Los Angeles County, California, United States. It rises to an elevation of 1,145 feet / 349 meters.
- **Location:** 34.0514, -117.7967
- **POI id:** `4a36ad34-e68d-4fd5-b127-d33e9857b4ce`
- **Decision:** [x]
- **Note:** _(curator fills in if needed)_

## [66] Gaviota Peak (nature)
- **Source:** wikidata
- **Significance breakdown:** source_base=40, cross_source=10, pageviews=6, route_adjacency=0, p31_bonus=10, total=66
- **Description:** Gaviota Peak is a summit in the Santa Ynez Mountains in Santa Barbara County, California. It is located 10 miles (16 km) west of Santa Barbara, 16 miles (26 km) east of Point Conception and 2 miles (3.2 km) from the Pacific Ocean.
- **Location:** 34.5018, -120.1990
- **POI id:** `ae58d179-9906-4211-9b35-e0846121f04e`
- **Decision:** [x]
- **Note:** _(curator fills in if needed)_

## [66] Half Dome (nature)
- **Source:** wikidata
- **Significance breakdown:** source_base=40, cross_source=0, pageviews=16, route_adjacency=0, p31_bonus=10, total=66
- **Description:** Half Dome is a quartz monzonite batholith at the eastern end of Yosemite Valley in Yosemite National Park, California. It is a well-known rock formation in the park, named for its distinct shape. One side is a sheer face while the other th…
- **Location:** 37.7460, -119.5332
- **POI id:** `3ec7bce6-c5dc-4c2c-a0c1-c14c12b9f68b`
- **Decision:** [+]
- **Note:** _(curator fills in if needed)_

## [66] Hines Peak (nature)
- **Source:** wikidata
- **Significance breakdown:** source_base=40, cross_source=10, pageviews=6, route_adjacency=0, p31_bonus=10, total=66
- **Description:** Hines Peak is a mountain of the Topatopa Mountains, in Ventura County, California, at an elevation of 6,703 feet (2,043 m). It is the second highest peak of the Topatopa Mountains after Cobblestone Mountain.
- **Location:** 34.5108, -119.0758
- **POI id:** `1b55957d-5956-4631-953b-174d596f4584`
- **Decision:** [x]
- **Note:** _(curator fills in if needed)_

## [66] Lyons Peak (nature)
- **Source:** wikidata
- **Significance breakdown:** source_base=40, cross_source=10, pageviews=6, route_adjacency=0, p31_bonus=10, total=66
- **Description:** Lyons Peak is a prominent mountain in San Diego County, California. The top of the mountain is enclosed in an almost rectangular patch of Cleveland National Forest. An old fire lookout tower is located at the peak.
- **Location:** 32.7019, -116.7636
- **POI id:** `ea8630c0-4ad2-4658-b241-90e2c10e0520`
- **Decision:** [x]
- **Note:** _(curator fills in if needed)_

## [66] Mission Peak (nature)
- **Source:** wikidata
- **Significance breakdown:** source_base=40, cross_source=0, pageviews=11, route_adjacency=5, p31_bonus=10, total=66
- **Description:** Mission Peak is a mountain peak located east of Fremont, California. It is the northern summit on a ridge that includes Mount Allison and Monument Peak. Mission Peak has symbolic importance, and is depicted on the logo of the City of Fremo…
- **Location:** 37.5124, -121.8810
- **POI id:** `66d79712-d210-4e53-9374-d9b5d85e7bd2`
- **Decision:** [x]
- **Note:** _(curator fills in if needed)_

## [66] Mount Burnham (nature)
- **Source:** wikidata
- **Significance breakdown:** source_base=40, cross_source=10, pageviews=6, route_adjacency=0, p31_bonus=10, total=66
- **Description:** Mount Burnham is one of the highest peaks in the San Gabriel Mountains. It is in the Sheep Mountain Wilderness. It is named for Frederick Russell Burnham the famous American military scout who taught Scoutcraft to Robert Baden-Powell and b…
- **Location:** 34.3592, -117.7810
- **POI id:** `d45c4b3f-a34a-4556-afaa-7d543f18f83a`
- **Decision:** [x]
- **Note:** _(curator fills in if needed)_

## [66] Mount Davidson (nature)
- **Source:** wikidata
- **Significance breakdown:** source_base=40, cross_source=0, pageviews=11, route_adjacency=5, p31_bonus=10, total=66
- **Description:** Mount Davidson is the highest natural point in San Francisco, California, with an elevation of 928 feet (283 m). Located on the West Side of the city, Mount Davidson sits south of Twin Peaks and Portola Drive and to the west of Diamond Hei…
- **Location:** 37.7383, -122.4533
- **POI id:** `27b272fe-626e-42fe-bda4-9f59757a9e8b`
- **Decision:** [x]
- **Note:** _(curator fills in if needed)_

## [66] Mount Islip (nature)
- **Source:** wikidata
- **Significance breakdown:** source_base=40, cross_source=10, pageviews=6, route_adjacency=0, p31_bonus=10, total=66
- **Description:** Mount Islip is a 8,250-foot (2,515 m) peak in the Angeles National Forest in California, United States. On a clear day the sharp, high peak provides impressive views of the Mojave Desert, the Los Angeles Basin, Santa Catalina Island, and S…
- **Location:** 34.3450, -117.8400
- **POI id:** `60443514-ffad-4c3b-a3a8-38cfe0c09b34`
- **Decision:** [x]
- **Note:** _(curator fills in if needed)_

## [66] Mount Rubidoux (nature)
- **Source:** wikidata
- **Significance breakdown:** source_base=40, cross_source=0, pageviews=11, route_adjacency=5, p31_bonus=10, total=66
- **Description:** Mount Rubidoux is a mountain just west of downtown in the city of Riverside, California, United States, that has been designated a city park and landmark. The mountain was once a popular Southern California tourist destination and is still…
- **Location:** 33.9839, -117.3930
- **POI id:** `3b271d9c-246f-4aa6-a1b0-e313a345f299`
- **Decision:** [x]
- **Note:** _(curator fills in if needed)_

## [66] Mount Shasta (nature)
- **Source:** wikidata
- **Significance breakdown:** source_base=40, cross_source=0, pageviews=16, route_adjacency=0, p31_bonus=10, total=66
- **Description:** Mount Shasta is a potentially active stratovolcano at the southern end of the Cascade Range in Siskiyou County, California. At an elevation of 14,179 ft (4,322 m), it is the second-highest peak in the Cascades and the fifth-highest in the…
- **Location:** 41.4092, -122.1949
- **POI id:** `8b1404a9-6b6a-4bfb-a57f-6e56aafb47a0`
- **Decision:** [+]
- **Note:** _(curator fills in if needed)_

## [66] Mount Soledad (nature)
- **Source:** wikidata
- **Significance breakdown:** source_base=40, cross_source=0, pageviews=11, route_adjacency=5, p31_bonus=10, total=66
- **Description:** Mount Soledad, also known as Soledad Mountain, is a prominent landmark in San Diego, California, United States. The mountaintop is the site of the Mount Soledad Cross.
- **Location:** 32.8397, -117.2522
- **POI id:** `63837992-fb42-4855-8d1c-241c683afd18`
- **Decision:** [x]
- **Note:** _(curator fills in if needed)_

## [66] Redonda Mesa (nature)
- **Source:** wikidata
- **Significance breakdown:** source_base=40, cross_source=10, pageviews=6, route_adjacency=0, p31_bonus=10, total=66
- **Description:** Redonda Mesa is a mesa type formation located in the southern Santa Ana Mountains, near the Pacific Ocean in Southern California. It is located in an unincorporated area of southwestern Riverside County.
- **Location:** 33.4911, -117.3456
- **POI id:** `74d648f9-1364-417f-b2d4-e805add3c269`
- **Decision:** [x]
- **Note:** _(curator fills in if needed)_

## [66] Sawmill Mountain (nature)
- **Source:** wikidata
- **Significance breakdown:** source_base=40, cross_source=10, pageviews=6, route_adjacency=0, p31_bonus=10, total=66
- **Description:** Sawmill Mountain is located on the county line between Kern and Ventura counties in California. The mountain is located in the Chumash Wilderness and its summit is the highest point in Kern County and the second highest in the Los Padres N…
- **Location:** 34.8136, -119.1670
- **POI id:** `cfc1b8b4-66a1-483c-8831-d32b865015cf`
- **Decision:** [x]
- **Note:** _(curator fills in if needed)_

## [66] Sequoia National Park (nature)
- **Source:** editorial
- **Significance breakdown:** source_base=40, cross_source=10, pageviews=16, route_adjacency=0, p31_bonus=0, total=66
- **Description:** Sequoia National Park is a national park of the United States in the southern Sierra Nevada east of Visalia, California. The park was established on September 25, 1890, and today protects 404,064 acres of forested mountainous terrain. Enco…
- **Location:** 36.4978, -118.5211
- **POI id:** `8be9a7bb-0e9e-4b05-9589-80b99385d1b1`
- **Decision:** [+]
- **Note:** _(curator fills in if needed)_

## [66] Vetter Mountain (nature)
- **Source:** wikidata
- **Significance breakdown:** source_base=40, cross_source=10, pageviews=6, route_adjacency=0, p31_bonus=10, total=66
- **Description:** Vetter Mountain is located in the San Gabriel Mountains and within the Angeles National Forest, Los Angeles County, California, United States. Elevation 5,911 feet (1,802 m) feet.
- **Location:** 34.2972, -118.0290
- **POI id:** `70f4299d-ee9a-4246-ad7c-93601a4141b6`
- **Decision:** [x]
- **Note:** _(curator fills in if needed)_

## [65] Blue Angels Peak (nature)
- **Source:** wikidata
- **Significance breakdown:** source_base=35, cross_source=10, pageviews=5, route_adjacency=5, p31_bonus=10, total=65
- **Description:** Blue Angels Peak is a mountain located in the Sierra Juárez mountains less than 300 yards (270 m) north of the United States-Mexico border in California. The mountain rises to an elevation of 4,552 feet (1,387 m) near the San Diego-Imperia…
- **Location:** 32.6217, -116.0910
- **POI id:** `274a948e-2bdd-4b6b-8571-a20735653bc2`
- **Decision:** [x]
- **Note:** _(curator fills in if needed)_

## [65] Castro Peak (nature)
- **Source:** wikidata
- **Significance breakdown:** source_base=40, cross_source=10, pageviews=5, route_adjacency=0, p31_bonus=10, total=65
- **Description:** Castro Peak, at 2,826 feet (861 m), is the highest peak in the middle part of the Santa Monica Mountains and is in the Santa Monica Mountains National Recreation Area. The town of Malibu is located to the southeast of the peak.
- **Location:** 34.0858, -118.7850
- **POI id:** `cf4c2768-2039-47ff-be72-1c7a3c716628`
- **Decision:** [x]
- **Note:** _(curator fills in if needed)_

## [65] Eagle Rock (nature)
- **Source:** wikidata
- **Significance breakdown:** source_base=40, cross_source=10, pageviews=5, route_adjacency=0, p31_bonus=10, total=65
- **Description:** Eagle Rock is a prominent sandstone pinnacle in Topanga State Park in the Santa Monica Mountains, California. The original name is "Elephant Rock" as the huge sandstone outcropping looks like an Elephant head when viewed from the north sid…
- **Location:** 34.1075, -118.5710
- **POI id:** `99baa178-e021-49a6-a076-885708b00d06`
- **Decision:** [+]
- **Note:** _(curator fills in if needed)_

## [65] Exchange Peak (nature)
- **Source:** wikidata
- **Significance breakdown:** source_base=40, cross_source=10, pageviews=5, route_adjacency=0, p31_bonus=10, total=65
- **Description:** Exchange Peak is the third highest point in the Santa Monica Mountains, with an elevation of 2,953 feet (900 m).
- **Location:** 34.1148, -118.9460
- **POI id:** `45165ee3-bee0-4d89-ae3a-40c86ea63ab2`
- **Decision:** [x]
- **Note:** _(curator fills in if needed)_

## [65] Flores Peak (nature)
- **Source:** wikidata
- **Significance breakdown:** source_base=40, cross_source=10, pageviews=5, route_adjacency=0, p31_bonus=10, total=65
- **Description:** Flores Peak is a mountain peak, overlooking the confluence Harding Canyon and Modjeska Canyon, within the Tucker Wildlife Sanctuary in Orange County, California. It rises to an elevation of 1,834 feet. It is named for Juan Flores of the Fl…
- **Location:** 33.7133, -117.6214
- **POI id:** `c20ef0ff-8638-408a-b437-3c1ab4927285`
- **Decision:** [x]
- **Note:** _(curator fills in if needed)_

## [65] Little Pine Mountain (nature)
- **Source:** wikidata
- **Significance breakdown:** source_base=40, cross_source=10, pageviews=5, route_adjacency=0, p31_bonus=10, total=65
- **Description:** Little Pine Mountain is a mountain in Santa Barbara County, California, in the Los Padres National Forest at the southern edge of the San Rafael Mountains. It separates the drainages of Oso Creek, which flows into the upper Santa Ynez Rive…
- **Location:** 34.6006, -119.7390
- **POI id:** `2e53e77b-925a-49de-b30c-e7aa1707dbc1`
- **Decision:** [x]
- **Note:** _(curator fills in if needed)_

## [65] Pisgah Crater (nature)
- **Source:** wikidata
- **Significance breakdown:** source_base=40, cross_source=0, pageviews=10, route_adjacency=5, p31_bonus=10, total=65
- **Description:** Pisgah Crater, or Pisgah Volcano, is a young volcanic cinder cone rising above a lava plain in the Mojave Desert, between Barstow and Needles, California in San Bernardino County, California. The volcanic peak is around 2.5 miles (4.0 km)…
- **Location:** 34.7464, -116.3750
- **POI id:** `d8cafbad-ae05-4c24-9ccb-34874f0a64b2`
- **Decision:** [+]
- **Note:** _(curator fills in if needed)_

## [65] Rabbit Peak (nature)
- **Source:** wikidata
- **Significance breakdown:** source_base=40, cross_source=10, pageviews=5, route_adjacency=0, p31_bonus=10, total=65
- **Description:** Rabbit Peak is a mountain in the southern part of the Santa Rosa Mountains in the Peninsular Ranges in California. It is located in Riverside County in the Santa Rosa and San Jacinto Mountains National Monument near the border of San Diego…
- **Location:** 33.4333, -116.2394
- **POI id:** `755e6e47-eb5e-448b-9cb2-497490adb177`
- **Decision:** [x]
- **Note:** _(curator fills in if needed)_

## [65] San Bruno Mountain (nature)
- **Source:** wikidata
- **Significance breakdown:** source_base=40, cross_source=0, pageviews=10, route_adjacency=5, p31_bonus=10, total=65
- **Description:** San Bruno Mountain is a fault-block horst in northern San Mateo County, California. Rising to a quarter-mile high peak directly out of San Francisco Bay, it also includes a smaller ridge in San Francisco. Viewed from downtown San Francisco…
- **Location:** 37.6874, -122.4360
- **POI id:** `13008975-b752-424a-a3d0-8ab386eb338a`
- **Decision:** [x]
- **Note:** _(curator fills in if needed)_

## [65] San Emigdio Mountains (nature)
- **Source:** wikidata
- **Significance breakdown:** source_base=47, cross_source=10, pageviews=8, route_adjacency=0, p31_bonus=0, total=65
- **Description:** The San Emigdio Mountains are a part of the Transverse Ranges in Southern California, extending from Interstate 5 at Lebec and Gorman on the east to Highway 33–166 on the west. They link the Tehachapis and Temblor Range and form the southe…
- **Location:** 34.8733, -119.1790
- **POI id:** `9f0994a5-ba9c-4248-a289-518bda1f9cd4`
- **Decision:** [x]
- **Note:** _(curator fills in if needed)_

## [65] Scotia Bluffs (nature)
- **Source:** wikidata
- **Significance breakdown:** source_base=40, cross_source=0, pageviews=5, route_adjacency=10, p31_bonus=10, total=65
- **Description:** Scotia Bluffs form a 2-mile (3-kilometer) series of gray sandstone cliffs along the north bank of the Eel River near Rio Dell, California.
- **Location:** 40.5100, -124.0990
- **POI id:** `5992922d-13ee-4e53-b446-2c80c1580177`
- **Decision:** [x]
- **Note:** _(curator fills in if needed)_

## [65] Trabuco Peak (nature)
- **Source:** wikidata
- **Significance breakdown:** source_base=40, cross_source=10, pageviews=5, route_adjacency=0, p31_bonus=10, total=65
- **Description:** Trabuco Peak is a 4,607-foot (1,404 m) summit in the Santa Ana Mountains on the border of Orange and Riverside Counties, California, about halfway between Rancho Santa Margarita and Lake Elsinore. The mountain sits on the divide between Ar…
- **Location:** 33.7022, -117.4750
- **POI id:** `3e7291fa-7290-4bcf-98c9-e84c8e860654`
- **Decision:** [x]
- **Note:** _(curator fills in if needed)_

## [65] Yosemite Falls (nature)
- **Source:** wikidata
- **Significance breakdown:** source_base=42, cross_source=0, pageviews=13, route_adjacency=0, p31_bonus=10, total=65
- **Description:** Yosemite Falls is the highest waterfall in Yosemite National Park, dropping a total of 2,425 feet (739 m) from the top of the upper fall to the base of the lower fall. Located in the Sierra Nevada of California, it is a major attraction in…
- **Location:** 37.7550, -119.5973
- **POI id:** `ff18034a-8421-43a1-8d62-e73568908921`
- **Decision:** [+]
- **Note:** _(curator fills in if needed)_

# Category: recreation

_Display name: **Recreation** · Effective floor: **70** · Count: **1**_

## [80] Mammoth Mountain Ski Area (recreation)
- **Source:** editorial
- **Significance breakdown:** source_base=60, cross_source=20, pageviews=0, route_adjacency=0, p31_bonus=0, total=80
- **Description:** Mammoth Mountain is a 57,000-year-old lava dome — yes, the ski resort is built on a volcano. In the early 1990s, carbon dioxide from the magma chamber below began killing trees on the mountain's flanks, creating Horseshoe Lake's "tree kill…
- **Location:** 37.6308, -119.0326
- **POI id:** `cbc1ac7f-d9b6-4109-a85c-d6b69a9ed2c2`
- **Decision:** [+]
- **Note:** _(curator fills in if needed)_

# Curator Additions

Use this section for **net-new editorial seeds** or **manual boosts** of POIs the algorithm did not surface (e.g., legitimate geology entries that didn't clear the floor, or iconic landmarks the catalog under-ranks).

### Three entry shapes the importer understands

1. **Manual boost — bare name** — fuzzy-matches against existing `pois.name`. If exactly one row matches, sets `editorial_curated = TRUE` + `editorial_score_boost = 20`. Multiple matches are flagged.
   ```markdown
   - [+] Mt. Whitney
   ```

2. **Manual boost — name + location hint** — disambiguates by proximity to the hinted region.
   ```markdown
   - [+] Mono Lake (Eastern Sierra)
   - [+30] Yosemite Falls (Yosemite National Park)  // custom boost magnitude
   ```

3. **Net-new editorial seed** — creates a new POI row with `source_type = 'editorial'`, baseline score 75 (or curator-specified). Coordinates required; if omitted, importer attempts Wikidata Q-number lookup.
   ```markdown
   - [+] Painted Dunes — Lassen Volcanic NP — coords 40.491,-121.421 — category geology
   - [+] Bumpass Hell — Lassen Volcanic NP — coords 40.451,-121.402 — category geology — score 80
   ```

### Curator additions go here:

<!-- Add lines below; importer parses each `-` bullet. -->

- [+] Mt. Whitney — soul-doctrine flagship, highest peak in the contiguous US, granite batholith story
- [+] Mono Lake — alkaline lake, tufa towers, Paiute anthropology layer, Sierra rain-shadow ecology
- [+] Long Valley Caldera — supervolcano, geothermal activity, geologic-time-scale story
- [+] Anza-Borrego badlands — desert geology, paleontology, Cahuilla anthropology
- [+] Mount Shasta — stratovolcano, sacred mountain, Modoc/Wintu anthropology
- [+] Mount Lassen — most recent CA eruption (1914-1917), volcanic landscape
- [+] Devils Postpile — columnar basalt, glacial geology
- [+] Trona Pinnacles — tufa spires, Searles Lake paleoclimate
- [+] Pinnacles National Park — Neenach Volcano transported by San Andreas Fault
- [+] Yosemite Falls — Sierra granite, glacial sculpting
- [+] Bristlecone Pines (Schulman Grove) — oldest individual trees on Earth, White Mountains
- [+] Painted Dunes (Lassen) — volcanic ash + lichen, photographic landscape
- [+] Bumpass Hell — hydrothermal area in Lassen, geothermal soul-doctrine
- [+] San Andreas Fault (Carrizo Plain segment) — most visible fault expression in CA
- [+] Death Valley — lowest point in North America, Pleistocene lake, badwater geology

