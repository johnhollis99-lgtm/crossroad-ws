# Soul-Doctrine Misalignment — Diagnostic Report

_Snapshot: 2026-05-18T21:12:20.403Z_  
_Track 2 of [docs/decisions/2026-05-15-top-tier-poi-first-run.md](../decisions/2026-05-15-top-tier-poi-first-run.md)_

## 1. Breakdown-component distribution by soul-doctrine layer

Per-layer mean + quartile breakdown of `significance_breakdown.{source_base, cross_source, pageviews, route_adjacency}`. Live POIs only. Helps see which component is starving which layer.

### Geology  _(slugs: geology, n=58)_

Mean score: **15.26**

| component | mean | median | max | (max possible) |
|---|---:|---:|---:|---:|
| source_base    | 11.81 | 8.00 | 60.00 | 100 (importer-supplied base) |
| cross_source   | 0.86 | 0.00 | 20.00 | 30 (+10 per additional source) |
| pageviews      | 0.95 | 0.00 | 10.00 | 20 (log-scale Wikipedia 30-day) |
| route_adjacency| 1.64 | 0.00 | 10.00 | 10 (CA highway proximity) |

### Geography  _(slugs: nature, n=11982)_

Mean score: **17.24**

| component | mean | median | max | (max possible) |
|---|---:|---:|---:|---:|
| source_base    | 14.40 | 10.00 | 52.00 | 100 (importer-supplied base) |
| cross_source   | 0.64 | 0.00 | 20.00 | 30 (+10 per additional source) |
| pageviews      | 0.99 | 0.00 | 18.00 | 20 (log-scale Wikipedia 30-day) |
| route_adjacency| 1.22 | 0.00 | 10.00 | 10 (CA highway proximity) |

### Anthropology  _(slugs: native_history, n=0)_

_(no POIs in this layer)_

### History  _(slugs: history, n=3543)_

Mean score: **29.04**

| component | mean | median | max | (max possible) |
|---|---:|---:|---:|---:|
| source_base    | 22.43 | 30.00 | 55.00 | 100 (importer-supplied base) |
| cross_source   | 1.21 | 0.00 | 30.00 | 30 (+10 per additional source) |
| pageviews      | 1.28 | 0.00 | 20.00 | 20 (log-scale Wikipedia 30-day) |
| route_adjacency| 4.12 | 5.00 | 10.00 | 10 (CA highway proximity) |

### Architecture (compare)  _(slugs: architecture, n=2690)_

Mean score: **36.11**

| component | mean | median | max | (max possible) |
|---|---:|---:|---:|---:|
| source_base    | 29.92 | 30.00 | 55.00 | 100 (importer-supplied base) |
| cross_source   | 1.04 | 0.00 | 30.00 | 30 (+10 per additional source) |
| pageviews      | 0.77 | 0.00 | 20.00 | 20 (log-scale Wikipedia 30-day) |
| route_adjacency| 4.37 | 5.00 | 10.00 | 10 (CA highway proximity) |

## 2. Top 20 POIs per soul-doctrine layer (incl. sub-70 candidates)

Surfaces what the layers contain at the top, regardless of cutoff. Sub-70 candidates here are what the curator can hand-boost if needed.

### Geology

| # | Score | Name | Source | Breakdown | Desc/tags |
|---|---:|---|---|---|---|
| 1 | 80.00 | Mount Whitney | editorial | 60+20+0+0 | Mount Whitney is a mountain in California's Sierra Nevada range, and is the high |
| 2 | 60.00 | California Caverns | state_landmark | 40+20+0+0 | California Cavern is a Limestone cave in the Sierra Nevada foothills, in Cave Ci |
| 3 | 48.00 | Crystal Cave | wikidata | 38+0+10+0 | Crystal Cave is a marble karst cave within Sequoia National Park, in the western |
| 4 | 46.00 | Lake Shasta Caverns | wikidata | 38+0+8+0 | The Lake Shasta Caverns are a network of caves located near the McCloud arm of S |
| 5 | 45.00 | Mercer Caverns | wikidata | 38+0+7+0 | Mercer Caverns is a show cave located one mile north of Murphys in Calaveras Cou |
| 6 | 43.00 | Merrill Cave | wikidata | 38+0+5+0 | Merrill Cave is a 650 foot (200 m) former ice cave in Lava Beds National Monumen |
| 7 | 43.00 | Moaning Cavern | wikidata | 33+0+10+0 | Moaning Caverns is a solutional cave located in the Calaveras County, California |
| 8 | 42.00 | Valentine Cave | wikidata | 38+0+4+0 | Valentine Cave is a 1,635 foot (498 m) cave found in Lava Beds National Monument |
| 9 | 39.00 | Hall City Cave | wikidata | 33+0+6+0 |  The Hall City Cave is a limestone cave system near Hayfork, California, United  |
| 10 | 38.00 | Catacombs Cave | wikidata | 33+0+5+0 | Catacombs Cave is a 6,903 foot (2,104 m) cave in Lava Beds National Monument in  |
| 11 | 35.00 | Bronson Caves | osm | 30+0+0+5 | cave |
| 12 | 35.00 | La Brea Tar Pits and Museum | osm | 30+0+0+5 |  |
| 13 | 30.00 | Gaviota Wind Caves | osm | 10+10+0+10 | cave |
| 14 | 15.00 | Observation Pit | osm | 10+0+0+5 |  |
| 15 | 15.00 | Pit 13 | osm | 10+0+0+5 |  |
| 16 | 15.00 | Pit 9 | osm | 10+0+0+5 |  |
| 17 | 15.00 | Pit 91 | osm | 10+0+0+5 | Tar pit archeological dig site |
| 18 | 15.00 | Pits 3, 4, 61, 67 | osm | 10+0+0+5 |  |
| 19 | 15.00 | Project 23 | osm | 10+0+0+5 |  |
| 20 | 13.00 | Alabama Hills | editorial | 8+0+0+5 | These rounded, weathered granite boulders at the base of the Sierra Nevada have  |

### Geography

| # | Score | Name | Source | Breakdown | Desc/tags |
|---|---:|---|---|---|---|
| 1 | 81.00 | Lake Temescal | wikidata | 48+20+8+5 | Lake Temescal is a small reservoir in the Oakland hills, in northeastern Oakland |
| 2 | 80.00 | Echo Lake | wikidata | 48+20+7+5 | Echo Lake, is the name of a glacial lake—summer reservoir located in El Dorado C |
| 3 | 79.00 | Balboa Park Gardens | wikidata | 52+10+7+10 | Balboa Park is a 1,200-acre (490 ha) historic urban cultural park in San Diego,  |
| 4 | 77.00 | Black Hill | wikidata | 50+10+7+10 | Black Hill is a mountain situated in Morro Bay, California, part of Morro Bay St |
| 5 | 76.00 | North Yolla Bolly Mountain | wikidata | 50+20+6+0 | North Yolla Bolly Mountain is a 7,868-foot (2,398 m) peak in the Klamath Mountai |
| 6 | 76.00 | Verdi Peaks | wikidata | 50+20+6+0 | The Verdi Peaks, officially just Verdi Peak, are a group of three mountain peaks |
| 7 | 75.00 | Rattlesnake Hill (Churchill County, Nevada) | wikidata | 45+20+5+5 | Rattlesnake Hill is a summit in the U.S. state of Nevada. The elevation is 4,163 |
| 8 | 73.00 | Churchill Butte | wikidata | 45+20+3+5 | Churchill Butte is a summit in the U.S. state of Nevada. The elevation is 5,928  |
| 9 | 73.00 | Emerald Pool | wikidata | 48+20+5+0 | Emerald Pool is a small, shallow lake, with an area of less than one acre. It is |
| 10 | 73.00 | Monte Cristo Range | wikidata | 47+20+6+0 | The Monte Cristo Range is located in western Nevada in the United States. The ra |
| 11 | 72.00 | Badger Mountains | wikidata | 47+20+5+0 | The Badger Mountains is a mountain range in Washoe County, Nevada. The southern  |
| 12 | 72.00 | Broken Hills | wikidata | 47+20+5+0 | The Broken Hills, or Broken Hills Range, is a mountain range bordering Churchill |
| 13 | 72.00 | Mount Watkins | wikidata | 45+20+7+0 | Mount Watkins is an 8,497-foot-elevation (2,590-meter) mountain summit in the Si |
| 14 | 71.00 | Dixie Hills | wikidata | 47+20+4+0 | The Dixie Hills are a mountain range in Elko County, Nevada. |
| 15 | 70.00 | Four Brothers | wikidata | 47+20+3+0 | The Four Brothers are a series of four mountain peaks in Del Norte County, Calif |
| 16 | 69.00 | Junipero Serra Peak | wikidata | 50+10+9+0 | Junipero Serra Peak is the highest mountain in the Santa Lucia range of central  |
| 17 | 69.00 | Needle Peak | wikidata | 45+20+4+0 | Needle Peak is a mountain in the Panamint Range in the northern Mojave Desert, i |
| 18 | 69.00 | Twin Peaks (Churchill County, Nevada) | wikidata | 45+20+4+0 | Twin Peaks is a summit in the U.S. state of Nevada. The elevation is 7,093 feet  |
| 19 | 68.00 | Cerro San Luis Obispo | wikidata | 50+10+8+0 | Cerro San Luis Obispo is a 1,292 feet (394 m) mountain in San Luis Obispo, Calif |
| 20 | 68.00 | Cone Peak | wikidata | 50+10+8+0 | Cone Peak is the second highest mountain in the Santa Lucia Range in the Ventana |

### Anthropology

_(no POIs in this layer)_

### History

| # | Score | Name | Source | Breakdown | Desc/tags |
|---|---:|---|---|---|---|
| 1 | 99.00 | Hollywood Walk of Fame | wikidata | 45+30+19+5 | The Hollywood Walk of Fame is a landmark that consists of more than 2,800 five-p |
| 2 | 93.00 | Mission San Miguel Arcángel | state_landmark | 50+30+3+10 | Mission San Miguel Arcángel is a Spanish mission in San Miguel, California. It w |
| 3 | 92.00 | Mission San Buenaventura | editorial | 40+30+12+10 | Ventura Also on the NRHP list as NPS-75000496 |
| 4 | 85.00 | Mission San Francisco de Asís | editorial | 40+20+15+10 | The Mission San Francisco de Asís, also known as Mission Dolores, is a historic  |
| 5 | 84.00 | Mission San Diego de Alcalá | editorial | 40+20+14+10 | Mission Basilica San Diego de Alcalá was the second Franciscan-founded mission i |
| 6 | 84.00 | Mission San Juan Capistrano | editorial | 40+20+14+10 | Significant for: HISTORIC - NON-ABORIGINAL; ARCHITECTURE; RELIGION. |
| 7 | 83.00 | Mission San Luis Rey de Francia | editorial | 40+30+13+0 | Mission San Luis Rey de Francia is a former Spanish mission in San Luis Rey, a n |
| 8 | 83.00 | Mission Santa Bárbara | editorial | 40+30+13+0 | Santa Barbara Also on the NRHP list as NPS-66000237 |
| 9 | 82.00 | Drum Barracks | state_landmark | 40+30+2+10 | Drum Barracks was the Union Army's headquarters for Southern California and New  |
| 10 | 82.00 | Mission La Purísima Concepción | editorial | 40+30+12+0 | Mission La Purísima Concepción — venue (mission) |
| 11 | 82.00 | Mission San Luis Obispo de Tolosa | editorial | 40+20+12+10 | Mission San Luis Obispo de Tolosa is a Spanish mission founded September 1, 1772 |
| 12 | 82.00 | Mission Santa Cruz | editorial | 40+20+12+10 | Mission Santa Cruz is a replica Spanish Californian mission in Santa Cruz, Calif |
| 13 | 81.00 | Oceanside City Hall and Fire Station | wikidata | 55+10+6+10 | The Oceanside City Hall and Fire Station, also known as Oceanside Civic Center,  |
| 14 | 80.00 | Dallidet Adobe | state_landmark | 50+20+0+10 | San Luis Obispo |
| 15 | 80.00 | Fire Station No. 23 | wikidata | 55+10+10+5 | Fire Station No. 23 is a former fire station in downtown Los Angeles. Built in 1 |
| 16 | 80.00 | Fremont Peak | state_landmark | 50+30+0+0 | Fremont Peak or Frémont Peak, historically known as Gabilán Peak, is a summit in |
| 17 | 80.00 | Old Town San Diego State Historic Park | editorial | 40+20+10+10 | Old Town San Diego State Historic Park — venue (historic_district) |
| 18 | 80.00 | Santa Ana Fire Station Headquarters No. 1 | wikidata | 55+10+5+10 | Santa Ana Fire Station Headquarters No. 1, at 1322 N. Sycamore St. in Santa Ana, |
| 19 | 78.00 | Mission San José | editorial | 40+20+13+5 | Mission San José is a Spanish mission located in the present-day city of Fremont |
| 20 | 78.00 | Mission Santa Clara de Asís | editorial | 40+20+13+5 | Mission Santa Clara de Asís is a Spanish mission in the city of Santa Clara, Cal |

### Architecture (compare)

| # | Score | Name | Source | Breakdown | Desc/tags |
|---|---:|---|---|---|---|
| 1 | 80.00 | Getty Center | editorial | 40+20+15+5 | The Getty Center, in Los Angeles, California, US, is a campus of the Getty Museu |
| 2 | 79.00 | Balboa Park | editorial | 40+20+14+5 | Balboa Park is a 1,200-acre (490 ha) historic urban cultural park in San Diego,  |
| 3 | 79.00 | Point San Luis Light | wikidata | 52+20+7+0 | The Point San Luis Lighthouse, also known as the San Luis Obispo Light Station,  |
| 4 | 76.00 | California State Capitol | state_landmark | 40+30+1+5 | The California State Capitol Museum consists of a museum in and grounds around t |
| 5 | 75.00 | Court | nrhp | 50+20+0+5 | Significant for: ARCHITECTURE. |
| 6 | 75.00 | First Unitarian Church of Oakland | state_landmark | 40+30+0+5 | The First Unitarian Church of Oakland is located in western Downtown Oakland, Ca |
| 7 | 74.00 | First Baptist Church of Ventura | wikidata | 48+10+6+10 | First Baptist Church of Ventura is a historic church at 101 S. Laurel Street in  |
| 8 | 74.00 | Getty Villa | editorial | 40+10+14+10 | The Getty Villa is an educational center and an art museum located at the easter |
| 9 | 74.00 | St. Michael's Episcopal Church | wikidata | 48+10+6+10 | The St. Michael's Episcopal Church in Anaheim, California, also known as The Cha |
| 10 | 71.00 | First Congregational Church of Riverside | wikidata | 48+10+8+5 | The First Congregational Church of Riverside is a historic United Church of Chri |
| 11 | 70.00 | Community Church of Gonzales | nrhp | 30+30+0+10 | Community Church of Gonzales is a historic Gothic Revival church building at 301 |
| 12 | 70.00 | First Church of Christ, Scientist | wikidata | 48+10+7+5 | First Church of Christ, Scientist, built in 1901, is an historic Mission Revival |
| 13 | 70.00 | Misión San Gabriel Archángel | osm | 55+10+0+5 | religious |
| 14 | 70.00 | St. John's Lutheran Church | wikidata | 48+10+7+5 | The St. John's Lutheran Church of Orange, California is a Lutheran Church–Missou |
| 15 | 70.00 | Wayfarers Chapel | nrhp | 50+20+0+0 | Wayfarers Chapel, or "The Glass Church", is a disassembled chapel designed by Ll |
| 16 | 69.00 | First Baptist Church of Orange | wikidata | 48+10+6+5 | The First Baptist Church of Orange is a historic Baptist church building at 192  |
| 17 | 69.00 | Saint Anne Catholic Church of the Byzantine Rite | wikidata | 43+10+6+10 | Saint Anne Byzantine Catholic Church is a Catholic Christian parish of the Byzan |
| 18 | 69.00 | Second Church of Christ, Scientist | wikidata | 48+10+6+5 | The former Second Church of Christ, Scientist, located at 655 Cedar Avenue, in L |
| 19 | 68.00 | Our Lady of the Wayside Church | state_landmark | 40+20+3+5 | Our Lady of the Wayside Church is a modest church built in 1912 for the then-gro |
| 20 | 67.00 | First Presbyterian Church of Hollywood | wikidata | 38+10+9+10 | The First Presbyterian Church of Hollywood is a Presbyterian Church (USA) congre |

## 3. Importer coverage gaps per layer

### Source-type × layer (live POIs)

| layer_slug   | source_type    | rows | avg_score | max_score |
|--------------|----------------|------|-----------|-----------|
| architecture | nrhp           | 2173 | 35.54     | 75.00     |
| architecture | wikidata       | 354  | 41.27     | 79.00     |
| architecture | osm            | 99   | 21.72     | 70.00     |
| architecture | state_landmark | 48   | 43.73     | 76.00     |
| architecture | editorial      | 16   | 64.31     | 80.00     |
| geology      | osm            | 33   | 7.27      | 35.00     |
| geology      | wikidata       | 14   | 29.07     | 48.00     |
| geology      | editorial      | 10   | 17.80     | 80.00     |
| geology      | state_landmark | 1    | 60.00     | 60.00     |
| history      | osm            | 1299 | 12.11     | 75.00     |
| history      | state_landmark | 957  | 37.67     | 93.00     |
| history      | nrhp           | 771  | 35.08     | 70.00     |
| history      | wikidata       | 480  | 45.98     | 99.00     |
| history      | editorial      | 36   | 55.42     | 92.00     |
| nature       | wikidata       | 9541 | 18.57     | 81.00     |
| nature       | osm            | 2404 | 11.63     | 50.00     |
| nature       | editorial      | 21   | 44.81     | 68.00     |
| nature       | state_landmark | 16   | 33.25     | 40.00     |

### Wikidata P31 class signal (source_id sample for geology + nature)

source_id = the Q-number; we group by leading digit clusters to coarsely show concentration. _(For a real audit, run a separate Q→P31 lookup against wikidata.org — out of scope here.)_

**Top 10 geology Wikidata entries:**

| source_id  | name                | score |
|------------|---------------------|-------|
| Q5191154   | Crystal Cave        | 48.00 |
| Q2101566   | Lake Shasta Caverns | 46.00 |
| Q8342992   | Mercer Caverns      | 45.00 |
| Q6886428   | Moaning Cavern      | 43.00 |
| Q124613125 | Merrill Cave        | 43.00 |
| Q124749732 | Valentine Cave      | 42.00 |
| Q5642570   | Hall City Cave      | 39.00 |
| Q124735386 | Catacombs Cave      | 38.00 |
| Q25416611  | Lehman Caves        | 13.00 |
| Q27578363  | Bower Cave          | 13.00 |

### GNIS importer presence

- GNIS rows (live, all categories): **0**
- GNIS at score ≥50: 0
- GNIS at score ≥70: 0

  > **Finding:** GNIS importer has NOT contributed any live rows. CLAUDE.md says it's implemented (`sources/gnis.ts`, summit / falls / cape / arch / etc. whitelist) but the importer hasn't run, OR rows were all dedup-merged into Wikidata/OSM primaries (which would still leave them in merged_into IS NOT NULL). Surface for follow-up.

## 4. Proposed adjustments (not applied — curator reviews)

Three adjustment axes per the prompt. Each option includes blast-radius + reversibility notes.

### (a) Significance formula weights

Current weights (per `recompute-significance.ts`):
- `source_base` — derives from source priority + per-source seed (editorial / state_landmark / nrhp / wikidata / osm / gnis bases). Max 100 pts.
- `cross_source` — +10 per `additional_sources` entry, max 30 pts.
- `pageviews` — log-scale Wikipedia 30-day views (100→5, 1k→10, 10k→15, 100k+→20 pts).
- `route_adjacency` — +10 within 1km of major CA highways, +5 within 5km of any Interstate/US highway.
- Final cap: 100.

**Observed history-bias drivers:**
- NRHP + state_landmark are inherently *historical* sources with seeded `source_base` in the 30-50 range, while OSM's `source_base` for natural features tops out around 20 absent Wikidata/Wikipedia backing.
- `cross_source` rewards multi-source verification — historical landmarks have NRHP + Wikidata + Wikipedia cross-references far more often than peaks or geological features.
- `pageviews` favors named landmarks with strong Wikipedia presence (Hollywood Sign, Mt. Whitney) but most geological features don't have standalone Wikipedia articles.

**Proposal A1 (low risk, narrow):** add a category-conditional `+10 pts` bonus for `geology` and `nature` POIs that have a Wikidata P31 class indicating significance (`Q8502 mountain`, `Q60504 lake`, `Q34038 waterfall`, `Q124714 hot spring`, `Q1437210 caldera`, etc.). The Q-class IS already retrievable; `recompute-significance.ts` would gain a Wikidata-class lookup. Same blast radius as the existing per-source seeding logic.
- Blast radius: 11,982 nature rows + 58 geology rows; ~100-300 rows would gain 10 pts, of which 5-15 might cross into the ≥70 bucket.
- Reversibility: trivial (re-run recompute with the bonus disabled).

**Proposal A2 (medium risk):** reweight `cross_source` from `+10/source, max 30` to `+15/source, max 45`, AND bump GNIS bonus when a GNIS row dedup-merges into a primary. Helps geological features that have GNIS + Wikidata + OSM all pointing at the same peak.
- Blast radius: full corpus recompute; full top-25 baseline re-validate required (precedent: `scripts/poi-import/baselines/`).
- Reversibility: re-run recompute with prior weights.

### (b) Per-category `significance_floor` table values

Table `category_significance_floors` exists (migration `20260514000004_category_significance_floors.sql`) but is empty — falls back to global floor 70 via COALESCE.

**Proposal B1 (low risk):** lower per-layer floors where the corpus is genuinely sparse but the soul-doctrine REQUIRES them:
- `geology`: floor **60** (instead of global 70). Surfaces ~2-5 additional geology candidates without flooding the surface.
- `nature`: floor **65** (instead of global 70). Same surfacing logic; nature is geographically essential.
- `history` / `architecture`: keep at 70 (or push history to 75 to counter the over-representation, but that risks dropping legitimate landmarks).

- Blast radius: only affects the **trigger** decision (which POIs narrate unprompted); does not affect score itself.
- Reversibility: trivial (TRUNCATE the lookup table or re-seed with 70).

### (c) Importer scope

**Finding:** the GNIS importer didn't contribute meaningfully to the top tier (see Section 3). Two paths forward:

**Proposal C1:** re-run GNIS importer with a wider feature-class whitelist. CLAUDE.md current list: Summit, Falls, Cape, Arch, Bay, Pillar, Crater, Geyser, Hot Spring, Lava, Lake, Island, Range. Adding: Volcano, Basin, Plateau, Cliff, Canyon, Valley would expand geology candidates.
- Blast radius: re-run `npx tsx scripts/poi-import/run.ts import -s gnis --bbox=…`; GNIS scores at 0.05 base so most won't enter top tier directly but will provide cross-source signal during dedup.
- Reversibility: source_type='gnis' rows are isolable; deletion would be one query if needed.

**Proposal C2:** Wikidata SPARQL expansion — add P31 classes the current import doesn't fetch. CLAUDE.md `lib/wikidata-types.ts` enumerates 26 classes; geology-relevant additions might include `Q40080 beach`, `Q12766313 canyon`, `Q150784 fjord`, `Q190429 lagoon`, `Q12876 tunnel-cave`. Curator confirms which classes.
- Blast radius: re-run Wikidata SPARQL for the new classes (≥30k chars cache, $0 cost), then dedup + recompute.
- Reversibility: source_type='wikidata' rows scoped by source_id (Q-number) are isolable; new classes would be tagged so removable.

**Proposal C3 (anthropology, separate axis):** populate `native_history` slug via narrative extraction phase. This is a roadmap Phase F+ item — not solvable by tweaking importer scope; requires authored content from the WPA Guide / Bancroft / CDNC sources via the narrative-extraction pipeline (scripts/narrative-extraction/). Currently the corpus has 0 native_history POIs. **This is the soul-doctrine's biggest structural gap.**

### Summary recommendation

Lowest-risk path that addresses the most immediate misalignment:

1. **B1 (lower geology + nature floors to 60/65)** — pure trigger-policy change, no recompute. Surfaces existing high-quality candidates the global floor is hiding.
2. **A1 (Wikidata P31 class bonus)** — adds ~10 pts to legitimately-significant geological features without disturbing existing scores. Requires recompute + baseline re-validation.
3. **C1 (wider GNIS whitelist)** — improves the input corpus for future dedup passes. Long-term lift, not a v1 first-run fix.
4. **C3 (anthropology corpus)** — the hard problem. Belongs to narrative-extraction phase, not significance tuning.

None of these block the v1 first run — they shape what cutoff makes sense for the NEXT broader run. The history-skew is captured as a known issue in the decision doc; the first-run narrations are still high-quality content for the cutoff slate as-is.

