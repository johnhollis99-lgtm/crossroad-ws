# E1d named-valleys candidates — boost worksheet

**Generated:** 2026-05-14
**Source:** Wikipedia Category:Valleys of California + hardcoded supplement (16 basins/plains/named valleys not in the category)
**Pageview window:** April 2026 (monthly total via Wikimedia REST `/per-article/.../monthly/20260401/20260501`)
**CA bbox filter:** lon [-124.5, -114], lat [32.5, 42] (coordinates from Wikipedia REST summary endpoint)
**Candidate pool:** 137 fetched · 129 kept after CA filter · top 80 below

## How to use this file

Fill in the **Boost** column with `0`, `1`, or `2` for each row you want to influence. Leave blank = pageviews-only ranking. Then hand the file back. The importer will:

1. Compute `score = pageviews_30d + boost × 10000` (so boost=1 ≈ +10k pageviews of weight, boost=2 ≈ +100k)
2. Re-sort and take top 30
3. Run polygon-source verification on those 30 (actual OSM Overpass + Wikidata SPARQL lookup; reports A/B/C final split and flags any administrative-polygon-vs-geological cases for per-row decision)
4. Generate two seed-text samples: Owens Valley (Tier-A OSM, contested-history guardrail test) + Long Valley Caldera (Tier-B Wikidata-buffer fallback test)
5. Wait for sample approval
6. Live run for the remaining 28

## Proposed-tier legend

Best-effort initial assignment based on prior knowledge. The polygon-source verification pass (step 3) is the authoritative source — it will move rows between tiers.

- **A** — OSM relation expected to exist with usable polygon (famous, well-mapped valleys/basins, plus the three AVA polygons accepted per sketch correction: Napa, Sonoma, Russian River)
- **B** — Default for unverified entries; will use Wikidata centroid + radius buffer fallback if OSM has no usable relation
- **C** — Known to need manual editorial polygon (Hetch Hetchy Valley, Surprise Valley, Lake Tahoe Basin — see corrections note below)

## Corrections applied to candidate names (2026-05-14)

**Dropped from list:**

- `Central Valley (California)` (22,575 pageviews/mo) — keep San Joaquin Valley + Sacramento Valley as separate regions; nested polygons would fire two narrations for the same drive.
- `Castro Valley, California` (3,501 pageviews/mo) — keep San Joaquin Valley + Sacramento Valley as separate regions; nested polygons would fire two narrations for the same drive.

**Display-overridden entries** (Wikipedia article supplies pageviews + description; row name represents the actual landform we want narrated; Phase 2 verification will look for the landform polygon, not the source article's admin/feature boundary):

- `Lake Tahoe` → **Lake Tahoe Basin**
- `Anza-Borrego Desert State Park` → **Anza-Borrego Desert**

## Top 80 candidates (sorted by 30-day pageviews)

| Rank | Name | Pageviews_30d | Boost | Tier | Description |
|-----:|------|--------------:|:-----:|:----:|-------------|
| 1 | Lake Tahoe Basin | 35,634 |  | C | Lake Tahoe is a freshwater lake in the Sierra Nevada of the Western United States, straddling the border between California and Nevada. |
| 2 | Coachella Valley | 33,149 |  | A | The Coachella Valley is an arid rift valley in the Colorado Desert of Southern California, United States. |
| 3 | San Fernando Valley | 30,338 |  | A | The San Fernando Valley, known locally as the Valley, is an urbanized valley in Los Angeles County, California. |
| 4 | Death Valley | 30,012 |  | A | Death Valley is a desert valley in Eastern California, United States, in the northern Mojave Desert, bordering the Great Basin Desert. |
| 5 | San Joaquin Valley | 8,288 |  | A | The San Joaquin Valley is the southern half of California's Central Valley. |
| 6 | San Gabriel Valley | 7,361 |  | A | The San Gabriel Valley, sometimes referred to by its initials as SGV, is one of the principal valleys of Southern California, with the city of Los Angeles directly bordering it to the west, and occupying the vast majority of the southeastern part of Los Angeles County. |
| 7 | Salinas Valley | 6,020 |  | A | The Salinas Valley is one of the major valleys and most productive agricultural regions in California. |
| 8 | Santa Ynez Valley | 5,414 |  | A | The Santa Ynez Valley is located in Santa Barbara County, California, between the Santa Ynez Mountains to the south and the San Rafael Mountains to the north. |
| 9 | Yosemite Valley | 4,798 |  | A | Yosemite Valley is a glacial valley in Yosemite National Park in the western Sierra Nevada mountains of Central California, United States. |
| 10 | Imperial Valley | 4,794 |  | A | The Imperial Valley of Southern California lies in Imperial and Riverside counties, with an urban area centered on the city of El Centro. |
| 11 | Anza-Borrego Desert | 4,751 |  | A | Anza-Borrego Desert State Park is a California State Park located within the Colorado Desert of Southern California, United States. |
| 12 | Antelope Valley | 4,749 |  | A | The Antelope Valley is a valley primarily located in northern Los Angeles County, California, United States and the southeast portion of Kern County, and constitutes the western tip of the Mojave Desert. |
| 13 | Owens Valley | 3,777 |  | A | Owens Valley is an arid valley of the Owens River in eastern California in the United States. |
| 14 | Long Valley Caldera | 3,529 |  | B | Long Valley Caldera is a volcanic caldera in eastern California that is adjacent to Mammoth Mountain. |
| 15 | Santa Clara Valley | 3,199 |  | A | The Santa Clara Valley is a geologic trough in Northern California that extends 90 miles (140 km) south–southeast from San Francisco to Hollister. |
| 16 | Los Angeles Basin | 2,897 |  | A | The Los Angeles Basin is a sedimentary basin located in Southern California, in a region known as the Peninsular Ranges. |
| 17 | Carrizo Plain | 2,545 |  | A | The Carrizo Plain is a large enclosed grassland plain, approximately 50 miles (80 km) long and up to 15 miles (24 km) across, in southeastern San Luis Obispo County, California, United States, about 100 miles (160 km) northwest of Los Angeles. |
| 18 | Sacramento Valley | 2,388 |  | A | The Sacramento Valley is the area of the Central Valley of the U.S. state of California that lies north of the Sacramento–San Joaquin River Delta and is drained by the Sacramento River. |
| 19 | Napa Valley | 1,513 | 1 | A | Napa Valley is an American Viticultural Area (AVA) in Napa County, California. |
| 20 | Conejo Valley | 1,305 |  | B | The Conejo Valley is a region spanning both southeastern Ventura County and northwestern Los Angeles County in Southern California, United States. |
| 21 | Santa Clarita Valley | 1,151 |  | B | The Santa Clarita Valley (SCV) is part of the upper watershed of the Santa Clara River in Southern California. |
| 22 | Lucerne Valley, California | 1,055 |  | B | Lucerne Valley is a census-designated place (CDP) and valley landform in the southern Mojave Desert, in western San Bernardino County, California. |
| 23 | Russian River Valley AVA | 1,018 | 1 | A | Russian River Valley is an American Viticultural Area (AVA) in Sonoma County, California located in the Russian River Valley landform. |
| 24 | San Bernardino Valley | 945 |  | B | The San Bernardino Valley is a valley in Southern California located at the south base of the Transverse Ranges. |
| 25 | Pomona Valley | 710 |  | B | The Pomona Valley is located in the Greater Los Angeles Area between the San Gabriel Valley and San Bernardino Valley in Southern California. |
| 26 | Niles Canyon | 707 |  | B | Niles Canyon is a canyon in the San Francisco Bay Area formed by Alameda Creek, known for its heritage railroad and silent movie history. |
| 27 | Sonoma Valley | 581 | 1 | A | Sonoma Valley is a valley landform located in southeastern Sonoma County, California, in the North Bay region of the San Francisco Bay Area. |
| 28 | Crescenta Valley | 567 |  | B | The Crescenta Valley is a small inland valley in Los Angeles County, California, lying between the San Gabriel Mountains on the northeast and the Verdugo Mountains and San Rafael Hills on the southwest. |
| 29 | Hetch Hetchy Valley | 497 | 1 | C | Hetch Hetchy is a valley, reservoir, and water system in California in the United States. |
| 30 | Panamint Valley | 460 | 1 | B | Panamint Valley is a long basin located east of the Argus and Slate ranges, and west of the Panamint Range in the northeastern reach of the Mojave Desert, in eastern California, United States. |
| 31 | Saline Valley | 395 | 1 | B | Saline Valley is a large, deep, and arid graben, about 27 miles (43 km) in length, in the northern Mojave Desert of California, a narrow, northwest–southeast-trending tectonic sink defined by fault-block mountains. |
| 32 | Anderson Valley | 393 | 1 | B | Anderson Valley is a sparsely populated region in western Mendocino County in Northern California. |
| 33 | San Ramon Valley | 382 |  | B | The San Ramon Valley is a valley and region in Contra Costa County and Alameda County, in the East Bay region of the San Francisco Bay Area in northern California. |
| 34 | Livermore Valley | 350 |  | B | The Livermore Valley, historically known as the Valle de San José, is a valley in Alameda County, California, located in the East Bay region. |
| 35 | Capay Valley | 325 | 1 | B | Capay Valley is a mostly rural valley northwest of Sacramento in Yolo County, California, United States. |
| 36 | Sierra Valley | 323 | 1 | B | Sierra Valley is a large mountain valley located east of the crest of California's Sierra Nevada mountain range in Plumas and Sierra Counties, north of Interstate 80. |
| 37 | Leona Valley, California | 321 |  | B | Leona Valley is a census-designated place located in the geographic Leona Valley of northern Los Angeles County, California, in the transition between the Sierra Pelona Mountains and Mojave Desert, just west of Palmdale and the Antelope Valley. |
| 38 | Holcomb Valley | 320 |  | B | Holcomb Valley is a valley located in the San Bernardino Mountains about 5 miles (8 km) north of Big Bear Lake. |
| 39 | Amador Valley | 318 |  | B | Amador Valley is a valley in eastern Alameda County, California and is the location of the cities of Dublin and Pleasanton. |
| 40 | Temecula Valley | 301 |  | B | The Temecula Valley is a graben rift valley in western Riverside County, California. |
| 41 | Grand Canyon of the Tuolumne | 298 |  | B | The Grand Canyon of the Tuolumne is the notable canyon section of the river valley of the Tuolumne River, located within Yosemite National Park, in Tuolumne County and the Sierra Nevada, California. |
| 42 | Saddleback Valley | 294 |  | B | Saddleback Valley refers to the flat and foothill areas west-southwest of the Saddleback double peak of the Santa Ana Mountains and east-northeast of the hilly Crystal Cove State Park in southern Orange County, California. |
| 43 | Little Yosemite Valley | 291 |  | B | Little Yosemite Valley is a smaller glacial valley upstream in the Merced River drainage from the Yosemite Valley in Yosemite National Park. |
| 44 | Indian Wells Valley | 275 |  | B | Indian Wells Valley is an arid north–south basin in east-central California. |
| 45 | Santa Clara River Valley | 269 |  | B | The Santa Clara River Valley is a rural, mainly agricultural valley in Ventura County, California that has been given the moniker Heritage Valley by the namesake tourism bureau. |
| 46 | Cuyama Valley | 259 | 1 | B | The Cuyama Valley is a valley along the Cuyama River in Central California, in northern Santa Barbara, southern San Luis Obispo, southwestern Kern, and northwestern Ventura counties. |
| 47 | San Jacinto Valley | 244 |  | B | The San Jacinto Valley is a valley located in Riverside County, in Southern California, in the Inland Empire. |
| 48 | Mono Basin | 243 | 2 | A | The Mono Basin is an endorheic drainage basin located east of Yosemite National Park in California and Nevada. |
| 49 | Surprise Valley, Modoc County | 231 |  | C | Surprise Valley is an endorheic valley in extreme northeastern California, US, about 60 miles in length from north to south. |
| 50 | Mohave Valley | 220 |  | B | The Mohave Valley is a valley located mostly on the east shore of the south-flowing Colorado River in northwest Arizona. |
| 51 | Deep Springs Valley | 209 |  | B | Deep Springs Valley is a high desert valley in the Inyo-White Mountains of Inyo County, California. |
| 52 | Santa Ana Canyon | 202 |  | B | Santa Ana Canyon, or the Santa Ana Narrows, is the water gap where the Santa Ana River passes between the Santa Ana Mountains and the Chino Hills, near the intersection of Orange, Riverside, and San Bernardino counties, California. |
| 53 | Palo Verde Valley | 197 |  | B | The Palo Verde Valley is located in the Lower Colorado River Valley, next to the eastern border of Southern California with Arizona, United States. |
| 54 | Temescal Valley (California) | 195 |  | B | Temescal Valley in California is a graben rift valley in western Riverside County, California, a part of the Elsinore Trough. |
| 55 | Fish Lake Valley | 189 |  | B | The Fish Lake Valley is a 25 miles (40 km) long endorheic valley in southwest Nevada, one of many contiguous inward-draining basins collectively called the Great Basin. |
| 56 | Eureka Valley (Inyo County) | 180 |  | B | Eureka Valley is located in Inyo County, in eastern California in the southwestern United States. |
| 57 | Goose Lake Valley | 178 |  | B | The Goose Lake Valley is located in south-central Oregon and northeastern California in the United States. |
| 58 | Kern River Valley | 176 |  | B | The Kern River Valley is a valley and region of the Southern Sierra Nevada, in Kern County, California. |
| 59 | Corral Hollow | 175 |  | B | Corral Hollow, is a 10 miles (16 km) long canyon in a middle reach of Corral Hollow Creek, which drains the eastern flank of the Diablo Range. |
| 60 | Pahrump Valley | 170 |  | B | Pahrump Valley is a Mojave Desert valley west of Las Vegas and the Spring Mountains massif in southern Nye County, Nevada, and eastern San Bernardino County, California. |
| 61 | Scott Valley | 170 |  | B | Scott Valley is a large, scenic rural area of western Siskiyou County, California, known for its vistas of the Marble Mountains, cattle and dairy ranches, and its historic background as a gold mining area, dating back to the days of the California Gold Rush. |
| 62 | Ivanpah Valley | 166 |  | B | The Ivanpah Valley is in southeastern California and southern Nevada in the United States. |
| 63 | Parker Valley | 151 |  | B | The Parker Valley is located along the Lower Colorado River within the Lower Colorado River Valley region, in southwestern Arizona and southeastern California. |
| 64 | Lost Horse Valley | 149 |  | B | Lost Horse Valley is a valley in Joshua Tree National Park. |
| 65 | Ojai Valley | 139 |  | B | Ojai is a city in Ventura County, California. |
| 66 | Searles Valley | 132 |  | B | Searles Valley is a valley in the northern Mojave Desert of California, with the northern half in Inyo County and the southern half in San Bernardino County, California, United States. |
| 67 | Elsinore Valley | 129 |  | B | The Elsinore Valley is a graben rift valley in western Riverside County, California, a part of the Elsinore Trough: a complex graben between the Santa Ana Block to the southwest and the Perris Block on the northeast, divided into several… |
| 68 | Antelope Valley (California-Nevada) | 125 |  | B | The Antelope Valley is a high valley in the eastern Sierra Nevada stretching from Mono County, California to Douglas County, Nevada. |
| 69 | San Lorenzo Valley | 116 |  | B | The San Lorenzo Valley is in the Santa Cruz Mountains in Santa Cruz County, California and was once a logging industry center of California especially during the rebuilding of San Francisco after the 1906 earthquake. |
| 70 | Bennett Valley | 115 |  | B | Bennett Valley is a northwest- to southeast-trending valley in Sonoma County, California, US, approximately 1 mile (1.6 km) wide in its northwestern portion, where the southeast extremity of Santa Rosa, California is located. |
| 71 | French Valley | 113 |  | B | French Valley is a region located in southwestern Riverside County, near the cities and communities of Hemet, Winchester, Murrieta, and Temecula in the state of California, United States. |
| 72 | Diablo Valley | 109 |  | B | The Diablo Valley refers to a valley in the East Bay of the San Francisco Bay Area, to the west/northwest of Mount Diablo. |
| 73 | Lanfair Valley | 95 |  | B | Lanfair Valley is located in the Mojave Desert in southeastern California near the Nevada state line. |
| 74 | Hungry Valley | 93 |  | B | Hungry Valley is a valley located along the northern border of Los Angeles and Ventura counties, about 2 mi (3.2 km) southwest of Gorman, California. |
| 75 | Aliso Canyon | 89 |  | B | Aliso Canyon is a 6.5-mile (10.5 km) canyon located in Orange County, California in the United States. |
| 76 | Earthquake Valley | 86 |  | B | Earthquake Valley is a desert valley east of Julian, California, which contains parts of Anza-Borrego Desert State Park. |
| 77 | Santa Ana Valley | 86 |  | B | The Santa Ana Valley is located in Orange County, California and is bisected by the Santa Ana River. |
| 78 | Los Osos Valley | 84 |  | B | The Los Osos Valley is a valley within San Luis Obispo County, in the Central Coast of California region. |
| 79 | Shadow Valley | 84 |  | B | Shadow Valley is a north to northwest flowing drainage within the Mojave Desert of San Bernardino County, California. |
| 80 | Elsinore Trough | 80 |  | B | The Elsinore Trough is a graben rift valley in Riverside County, southern California. |

## Supplement entries kept without coordinate

Hardcoded supplement entries whose Wikipedia summary returned no coordinate. Retained (not bbox-filtered out) because the supplement list is hand-curated CA-only. Verify these are correct CA valleys/basins.

- **Los Angeles Basin** (pageviews: 2,897): The Los Angeles Basin is a sedimentary basin located in Southern California, in a region known as the Peninsular Ranges.

## Build stats

- Wikipedia category members fetched: 132
- Supplement entries added: 5
- Coordinate present: 130
- Coordinate inside CA bbox: 130
- Coordinate outside CA bbox: 0
- No coordinate (supplement-retained / dropped): 1 / 6
- Below pageview-cutoff (>200, not top-80): 0
