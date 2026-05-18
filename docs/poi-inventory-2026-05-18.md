# POI Inventory — Top-Tier-POI-First-Run Preflight

_For: docs/decisions/2026-05-15-top-tier-poi-first-run.md_

## Deliverable A — POI Database State Inventory

_Snapshot: 2026-05-18T20:35:09.081Z_

### Overall counts

- Total POI rows: **23,922**
- Live (merged_into IS NULL): **21,906**
- Merged secondaries: 2,016

### Importer coverage (source_type breakdown, live POIs only)

| source_type    | rows  | avg_score | gte_0_5_conf |
|----------------|-------|-----------|--------------|
| wikidata       | 12244 | 19.87     | 12244        |
| osm            | 5567  | 12.06     | 5567         |
| nrhp           | 2944  | 35.42     | 2776         |
| state_landmark | 1033  | 37.99     | 1033         |
| editorial      | 118   | 47.55     | 118          |

### significance_score state (live POIs)

- score NULL: 0; score 0: 1045
- min/median/mean/p90/p99/max: 0.00 / 13.00 / 20.98 / 45.00 / 65.00 / 100.00
- significance_breakdown populated: 21906 / null: 0

### intrinsic_depth state (live POIs)

| intrinsic_depth | rows  |
|-----------------|-------|
| standard        | 21906 |

### iconic_local state (live POIs)

- iconic_local = true: 0
- iconic_local_reasons populated: 0
- signature_hook set: 0

  > **Note:** Iconic-local curation has not yet been run. Column added in migration `20260514000003_pois_iconic_local.sql`; importer is roadmap Phase F (`scripts/poi-import/sources/iconic-curation.ts`), not yet built.

### editorial_status (live POIs)

| editorial_status | rows  |
|------------------|-------|
| draft            | 19819 |
| needs_geocoding  | 2044  |
| verified         | 31    |
| reviewed         | 12    |

### Venue Tour state (live POIs)

- Venues (is_venue=true): 75
- Children of venues (parent_poi_id set): 1634
- Standalone POIs: 20197

## Deliverable B — Soul-Doctrine Category × Bucket Distribution

### Category slug census (with live POI counts)

| slug           | display_name                 | live_rows | avg_score | max_score |
|----------------|------------------------------|-----------|-----------|-----------|
| nature         | Nature & Wildlife            | 11982     | 17.24     | 81.00     |
| history        | History                      | 3543      | 29.04     | 99.00     |
| architecture   | Architecture                 | 2690      | 36.11     | 80.00     |
| dams           | Dams & Aqueducts             | 1642      | 10.95     | 66.00     |
| art            | Art & Culture                | 1162      | 11.41     | 87.00     |
| hidden_gems    | Hidden Gems                  | 721       | 21.84     | 100.00    |
| local_culture  | Local Culture                | 61        | 63.77     | 100.00    |
| geology        | Geology                      | 58        | 15.26     | 80.00     |
| bridges        | Bridges & Tunnels            | 24        | 39.46     | 57.00     |
| food_drink     | Food & Drink                 | 14        | 12.14     | 35.00     |
| viewpoint      | Scenic Viewpoint             | 5         | 12.80     | 24.00     |
| engineering    | Engineering & Infrastructure | 3         | 9.67      | 13.00     |
| recreation     | Recreation                   | 1         | 80.00     | 80.00     |
| mining         | Mining History               | 0         | -         | -         |
| legends        | Legends & Lore               | 0         | -         | -         |
| native_history | Native American              | 0         | -         | -         |
| volcanic       | Volcanic Features            | 0         | -         | -         |
| hot_springs    | Hot Springs                  | 0         | -         | -         |

### Soul-doctrine category mapping

| Layer | Slugs mapped | Rationale |
|---|---|---|
| Geology | `geology`, `nature` (subset — geological-feature tags), `natural_feature` | Landform processes, tectonics, volcanism. `nature` overlaps geology + geography; bucket-tagged for both surfaces. |
| Geography | `nature` | Climate, elevation, ecology, regional distinctness — overlaps geology slug. |
| Anthropology | `native_history` | Indigenous peoples (present-tense). Aspirational slug per CLAUDE.md — populated by narrative extraction / editorial review, NOT by bulk importers. |
| History (significant) | `history` | NRHP / state landmarks / editorial historical sites. |

### Score bucket distribution by soul-doctrine layer (live POIs)

Buckets: 95–100 / 90–94 / 85–89 / 80–84 / 70–79 / <70 (below floor)

| layer                         | slugs          | b95_100 | b90_94 | b85_89 | b80_84 | b70_79 | below_floor | total |
|-------------------------------|----------------|---------|--------|--------|--------|--------|-------------|-------|
| Geology                       | geology        | 0       | 0      | 0      | 1      | 0      | 57          | 58    |
| Geography (nature)            | nature         | 0       | 0      | 0      | 2      | 13     | 11967       | 11982 |
| Anthropology (native_history) | native_history | 0       | 0      | 0      | 0      | 0      | 0           | 0     |
| History                       | history        | 1       | 2      | 1      | 14     | 38     | 3487        | 3543  |

### Full-corpus bucket distribution (all live POIs, all categories)

| layer    | slugs | b95_100 | b90_94 | b85_89 | b80_84 | b70_79 | below_floor | total |
|----------|-------|---------|--------|--------|--------|--------|-------------|-------|
| ALL LIVE | *     | 5       | 3      | 3      | 25     | 98     | 21772       | 21906 |

## Deliverable C — Top 20 POIs (curator cutoff slate)

Bucket breakdown (live POIs):

- 95–100: 5
- 90–94: 3
- 85–89: 3
- 80–84: 25
- 70–79: 98

Curator-spec requested "top 20 at the highest visible bucket." Strictly interpreted, that's the 95–100 bucket which has only 5 POIs — not enough to choose a cutoff from. **Expanded to top 20 by significance_score DESC across all live POIs** so the curator has a real slate to pick a cutoff from; the bucket annotations show where each candidate sits.

| # | Name | Category | Bucket | Score | Source | Lat, Lon | Editorial | Description |
|---|---|---|---|---:|---|---|---|---|
| 1 | **Grizzly River Run** _(child)_ | hidden_gems | 95–100 | 100.00 _(70+30+0+10)_ | osm | 33.80719, -117.92064 | draft | _(no description)_ |
| 2 | **Santa Monica Pier** | local_culture | 95–100 | 100.00 _(68+10+14+10)_ | wikidata | 34.00861, -118.49861 | draft | The Santa Monica Pier is a large pier at the foot of Colorado Avenue in Santa Monica, California, United States. It contains a small amusement park, concession stands, and areas for views and fishing. The pier is part of |
| 3 | **Walk of Fame** | hidden_gems | 95–100 | 100.00 _(70+30+0+5)_ | osm | 34.10166, -118.34334 | draft | _(no description)_ |
| 4 | **Hollywood Walk of Fame** | history | 95–100 | 99.00 _(45+30+19+5)_ | wikidata | 34.10140, -118.34497 | draft | The Hollywood Walk of Fame is a landmark that consists of more than 2,800 five-pointed terrazzo-and-brass stars embedded in the sidewalks along fifteen blocks of Hollywood Boulevard and three blocks of Vine Street in the |
| 5 | **Hollywood Sign** | local_culture | 95–100 | 95.00 _(60+30+0+5)_ | editorial | 34.13410, -118.32170 | verified | The Hollywood Sign is an American landmark and cultural icon overlooking Hollywood, Los Angeles. Originally the Hollywoodland Sign, it is situated on Mount Lee, above Beachwood Canyon in the Santa Monica Mountains. Spell |
| 6 | **Mission San Miguel Arcángel** | history | 90–94 | 93.00 _(50+30+3+10)_ | state_landmark | 35.74472, -120.69806 | draft | Mission San Miguel Arcángel is a Spanish mission in San Miguel, California. It was established on July 25, 1797, by the Franciscan order, on a site chosen specifically due to the large number of Salinan Indians that inha |
| 7 | **Mission San Buenaventura** _(venue)_ | history | 90–94 | 92.00 _(40+30+12+10)_ | editorial | 34.28110, -119.29773 | draft | Ventura Also on the NRHP list as NPS-75000496 |
| 8 | **Marine World/Africa USA** | local_culture | 90–94 | 90.00 _(58+10+12+10)_ | wikidata | 37.53167, -122.26500 | draft | Marine World/Africa USA was an animal theme park located in the Redwood Shores area of Redwood City, California. The park was named Marine World when it first opened in 1968, before merging with a land-animal park called |
| 9 | **Adventure City** | local_culture | 85–89 | 88.00 _(68+10+10+0)_ | wikidata | 33.81519, -117.99234 | draft | Adventure City is an amusement park in Stanton, California, United States. Occupying an area of just over 2 acres (0.81 ha), Adventure City is one of the smallest theme parks in California, and receives an average attend |
| 10 | **Museum of Contemporary Art San Diego** | art | 85–89 | 87.00 _(52+20+10+5)_ | wikidata | 32.84453, -117.27821 | draft | The Museum of Contemporary Art San Diego (MCASD) is an art museum in La Jolla, a community of San Diego, California. It is focused on the collection, preservation, exhibition, and interpretation of works of art from 1950 |
| 11 | **Mission San Francisco de Asís** _(venue)_ | history | 85–89 | 85.00 _(40+20+15+10)_ | editorial | 37.76435, -122.42702 | draft | The Mission San Francisco de Asís, also known as Mission Dolores, is a historic Catholic church complex in San Francisco, California. Operated by the Archdiocese of San Francisco, the complex was founded in the 18th cent |
| 12 | **Mission San Diego de Alcalá** _(venue)_ | history | 80–84 | 84.00 _(40+20+14+10)_ | editorial | 32.78444, -117.10639 | draft | Mission Basilica San Diego de Alcalá was the second Franciscan-founded mission in the Californias, a province of New Spain. Located in present-day San Diego, California, it was founded on July 16, 1769, by Spanish friar  |
| 13 | **Mission San Juan Capistrano** _(venue)_ | history | 80–84 | 84.00 _(40+20+14+10)_ | editorial | 33.50322, -117.66293 | draft | Significant for: HISTORIC - NON-ABORIGINAL; ARCHITECTURE; RELIGION. |
| 14 | **Sleeping Beauty Castle** _(child)_ | hidden_gems | 80–84 | 84.00 _(40+20+14+10)_ | wikidata | 33.81280, -117.91897 | draft | Sleeping Beauty Castle is a fairy tale castle at the center of Disneyland and formerly in Hong Kong Disneyland. It is based on the late 19th century Neuschwanstein Castle in Bavaria, Germany. It appeared in the Walt Disn |
| 15 | **Mission San Luis Rey de Francia** _(venue)_ | history | 80–84 | 83.00 _(40+30+13+0)_ | editorial | 33.23249, -117.31946 | draft | Mission San Luis Rey de Francia is a former Spanish mission in San Luis Rey, a neighborhood in Oceanside, California. This Mission lent its name to the Luiseño tribe of Mission Indians. |
| 16 | **Mission Santa Bárbara** _(venue)_ | history | 80–84 | 83.00 _(40+30+13+0)_ | editorial | 34.43839, -119.71380 | draft | Santa Barbara Also on the NRHP list as NPS-66000237 |
| 17 | **Avengers Campus** _(child)_ | local_culture | 80–84 | 82.00 _(58+0+14+10)_ | wikidata | 33.81210, -117.91900 | draft | Avengers Campus is a Marvel Cinematic Universe (MCU)–themed area located at Disney California Adventure and Disney Adventure World in Disneyland Paris, and being developed for Hong Kong Disneyland under the name Stark Ex |
| 18 | **Drum Barracks** | history | 80–84 | 82.00 _(40+30+2+10)_ | state_landmark | 33.78472, -118.25667 | draft | Drum Barracks was the Union Army's headquarters for Southern California and New Mexico during the Civil War. It consisted of 19 buildings on 60 acres in what is now Wilmington, with another 37 acres near the waterfront.  |
| 19 | **Mission La Purísima Concepción** _(venue)_ | history | 80–84 | 82.00 _(40+30+12+0)_ | editorial | 34.67203, -120.42194 | draft | Mission La Purísima Concepción — venue (mission) |
| 20 | **Mission San Luis Obispo de Tolosa** _(venue)_ | history | 80–84 | 82.00 _(40+20+12+10)_ | editorial | 35.28080, -120.66447 | draft | Mission San Luis Obispo de Tolosa is a Spanish mission founded September 1, 1772 by Father Junípero Serra in San Luis Obispo, California. The mission was named after San Luis, obispo de Tolosa. |

### Per-row detail (full breakdown + tags)

**1. Grizzly River Run** (`7d6987cd-002b-4000-aa4a-fc56b3f04f6a`)
- Category: hidden_gems / Source: osm (id=node/3167856921) / Editorial: draft
- Score: **100.00**; breakdown: `{"total":100,"pageviews":0,"source_base":70,"cross_source":30,"route_adjacency":10}`
- Coords: (33.80719, -117.92064) / intrinsic_depth=standard / venue=false/parent=a7c1ec07-7a02-479a-aa0f-4b98d6e34388/iconic=false

**2. Santa Monica Pier** (`0ef620f4-9880-485e-a8b1-d2473ecbe8d7`)
- Category: local_culture / Source: wikidata (id=Q595439) / Editorial: draft
- Score: **100.00**; breakdown: `{"total":100,"pageviews":14,"source_base":68,"cross_source":10,"route_adjacency":10}`
- Coords: (34.00861, -118.49861) / intrinsic_depth=standard / venue=false/parent=null/iconic=false
- Tags (2): amusement_park, attraction
- Description: The Santa Monica Pier is a large pier at the foot of Colorado Avenue in Santa Monica, California, United States. It contains a small amusement park, concession stands, and areas for views and fishing. The pier is part of...

**3. Walk of Fame** (`44d6873c-d06f-4a0a-833a-47f93b7f6407`)
- Category: hidden_gems / Source: osm (id=way/1419166576) / Editorial: draft
- Score: **100.00**; breakdown: `{"total":100,"pageviews":0,"source_base":70,"cross_source":30,"route_adjacency":5}`
- Coords: (34.10166, -118.34334) / intrinsic_depth=standard / venue=false/parent=null/iconic=false

**4. Hollywood Walk of Fame** (`add6f7fd-ec7c-4ada-8da2-ed95382d61f6`)
- Category: history / Source: wikidata (id=Q71719) / Editorial: draft
- Score: **99.00**; breakdown: `{"total":99,"pageviews":19,"source_base":45,"cross_source":30,"route_adjacency":5}`
- Coords: (34.10140, -118.34497) / intrinsic_depth=standard / venue=false/parent=null/iconic=false
- Tags (1): historic
- Description: The Hollywood Walk of Fame is a landmark that consists of more than 2,800 five-pointed terrazzo-and-brass stars embedded in the sidewalks along fifteen blocks of Hollywood Boulevard and three blocks of Vine Street in the...

**5. Hollywood Sign** (`2e7059ed-37f2-4c34-9599-82a7157a230d`)
- Category: local_culture / Source: editorial (id=2e7059ed-37f2-4c34-9599-82a7157a230d) / Editorial: verified
- Score: **95.00**; breakdown: `{"total":95,"pageviews":0,"source_base":60,"cross_source":30,"route_adjacency":5}`
- Coords: (34.13410, -118.32170) / intrinsic_depth=standard / venue=false/parent=null/iconic=false
- Tags (5): hollywood, sign, landmark, iconic, photo-op
- Description: The Hollywood Sign is an American landmark and cultural icon overlooking Hollywood, Los Angeles. Originally the Hollywoodland Sign, it is situated on Mount Lee, above Beachwood Canyon in the Santa Monica Mountains. Spell...

**6. Mission San Miguel Arcángel** (`bfd29316-9df3-42f0-a1a3-ca64b9a825f4`)
- Category: history / Source: state_landmark (id=CHL-326) / Editorial: draft
- Score: **93.00**; breakdown: `{"total":93,"pageviews":3,"source_base":50,"cross_source":30,"route_adjacency":10}`
- Coords: (35.74472, -120.69806) / intrinsic_depth=standard / venue=false/parent=null/iconic=false
- Tags (3): chl-326, mission, spanish_colonial
- Description: Mission San Miguel Arcángel is a Spanish mission in San Miguel, California. It was established on July 25, 1797, by the Franciscan order, on a site chosen specifically due to the large number of Salinan Indians that inha...

**7. Mission San Buenaventura** (`415237b7-56e8-4724-9f84-63a6f292461b`)
- Category: history / Source: editorial (id=venue-mission-san-buenaventura) / Editorial: draft
- Score: **92.00**; breakdown: `{"total":92,"pageviews":12,"source_base":40,"cross_source":30,"route_adjacency":10}`
- Coords: (34.28110, -119.29773) / intrinsic_depth=standard / venue=true/parent=null/iconic=false
- Tags (3): venue, mission, missions
- Description: Ventura Also on the NRHP list as NPS-75000496

**8. Marine World/Africa USA** (`4027f0f8-b280-4ec2-bf56-ee937eb826ec`)
- Category: local_culture / Source: wikidata (id=Q14683272) / Editorial: draft
- Score: **90.00**; breakdown: `{"total":90,"pageviews":12,"source_base":58,"cross_source":10,"route_adjacency":10}`
- Coords: (37.53167, -122.26500) / intrinsic_depth=standard / venue=false/parent=null/iconic=false
- Tags (2): amusement_park, attraction
- Description: Marine World/Africa USA was an animal theme park located in the Redwood Shores area of Redwood City, California. The park was named Marine World when it first opened in 1968, before merging with a land-animal park called...

**9. Adventure City** (`7453f2d8-dce7-45cd-8c2a-fd98bea08a02`)
- Category: local_culture / Source: wikidata (id=Q44043) / Editorial: draft
- Score: **88.00**; breakdown: `{"total":88,"pageviews":10,"source_base":68,"cross_source":10,"route_adjacency":0}`
- Coords: (33.81519, -117.99234) / intrinsic_depth=standard / venue=false/parent=null/iconic=false
- Tags (2): amusement_park, attraction
- Description: Adventure City is an amusement park in Stanton, California, United States. Occupying an area of just over 2 acres (0.81 ha), Adventure City is one of the smallest theme parks in California, and receives an average attend...

**10. Museum of Contemporary Art San Diego** (`0f1e44ea-6d28-48b4-972a-dbe5163182ac`)
- Category: art / Source: wikidata (id=Q3329587) / Editorial: draft
- Score: **87.00**; breakdown: `{"total":87,"pageviews":10,"source_base":52,"cross_source":20,"route_adjacency":5}`
- Coords: (32.84453, -117.27821) / intrinsic_depth=standard / venue=false/parent=null/iconic=false
- Tags (2): museum, art
- Description: The Museum of Contemporary Art San Diego (MCASD) is an art museum in La Jolla, a community of San Diego, California. It is focused on the collection, preservation, exhibition, and interpretation of works of art from 1950...

**11. Mission San Francisco de Asís** (`382bd6be-7dfd-4b3a-a5a1-b39388ddd5b0`)
- Category: history / Source: editorial (id=venue-mission-san-francisco-asis) / Editorial: draft
- Score: **85.00**; breakdown: `{"total":85,"pageviews":15,"source_base":40,"cross_source":20,"route_adjacency":10}`
- Coords: (37.76435, -122.42702) / intrinsic_depth=standard / venue=true/parent=null/iconic=false
- Tags (3): venue, mission, missions
- Description: The Mission San Francisco de Asís, also known as Mission Dolores, is a historic Catholic church complex in San Francisco, California. Operated by the Archdiocese of San Francisco, the complex was founded in the 18th cent...

**12. Mission San Diego de Alcalá** (`d2814ccd-60fc-40da-9dd6-446bf1d9d74e`)
- Category: history / Source: editorial (id=venue-mission-san-diego-de-alcala) / Editorial: draft
- Score: **84.00**; breakdown: `{"total":84,"pageviews":14,"source_base":40,"cross_source":20,"route_adjacency":10}`
- Coords: (32.78444, -117.10639) / intrinsic_depth=standard / venue=true/parent=null/iconic=false
- Tags (3): venue, mission, missions
- Description: Mission Basilica San Diego de Alcalá was the second Franciscan-founded mission in the Californias, a province of New Spain. Located in present-day San Diego, California, it was founded on July 16, 1769, by Spanish friar ...

**13. Mission San Juan Capistrano** (`739aca24-d217-47a8-b13d-a0e2d0d30214`)
- Category: history / Source: editorial (id=venue-mission-san-juan-capistrano) / Editorial: draft
- Score: **84.00**; breakdown: `{"total":84,"pageviews":14,"source_base":40,"cross_source":20,"route_adjacency":10}`
- Coords: (33.50322, -117.66293) / intrinsic_depth=standard / venue=true/parent=null/iconic=false
- Tags (3): venue, mission, missions
- Description: Significant for: HISTORIC - NON-ABORIGINAL; ARCHITECTURE; RELIGION.

**14. Sleeping Beauty Castle** (`e1bb3c66-76c9-4acf-a7fa-0d191d20b803`)
- Category: hidden_gems / Source: wikidata (id=Q2746222) / Editorial: draft
- Score: **84.00**; breakdown: `{"total":84,"pageviews":14,"source_base":40,"cross_source":20,"route_adjacency":10}`
- Coords: (33.81280, -117.91897) / intrinsic_depth=standard / venue=false/parent=eeb1b2b2-5b0d-4ddc-9287-af437cfbc916/iconic=false
- Description: Sleeping Beauty Castle is a fairy tale castle at the center of Disneyland and formerly in Hong Kong Disneyland. It is based on the late 19th century Neuschwanstein Castle in Bavaria, Germany. It appeared in the Walt Disn...

**15. Mission San Luis Rey de Francia** (`97cd82ab-6d11-4279-965e-be22435a9914`)
- Category: history / Source: editorial (id=venue-mission-san-luis-rey) / Editorial: draft
- Score: **83.00**; breakdown: `{"total":83,"pageviews":13,"source_base":40,"cross_source":30,"route_adjacency":0}`
- Coords: (33.23249, -117.31946) / intrinsic_depth=standard / venue=true/parent=null/iconic=false
- Tags (3): venue, mission, missions
- Description: Mission San Luis Rey de Francia is a former Spanish mission in San Luis Rey, a neighborhood in Oceanside, California. This Mission lent its name to the Luiseño tribe of Mission Indians.

**16. Mission Santa Bárbara** (`47646679-aba7-49d2-971a-981bd96f1194`)
- Category: history / Source: editorial (id=venue-mission-santa-barbara) / Editorial: draft
- Score: **83.00**; breakdown: `{"total":83,"pageviews":13,"source_base":40,"cross_source":30,"route_adjacency":0}`
- Coords: (34.43839, -119.71380) / intrinsic_depth=standard / venue=true/parent=null/iconic=false
- Tags (3): venue, mission, missions
- Description: Santa Barbara Also on the NRHP list as NPS-66000237

**17. Avengers Campus** (`186a3dc0-d51d-4090-8138-ee45cd369f45`)
- Category: local_culture / Source: wikidata (id=Q54954056) / Editorial: draft
- Score: **82.00**; breakdown: `{"total":82,"pageviews":14,"source_base":58,"cross_source":0,"route_adjacency":10}`
- Coords: (33.81210, -117.91900) / intrinsic_depth=standard / venue=false/parent=eeb1b2b2-5b0d-4ddc-9287-af437cfbc916/iconic=false
- Tags (2): amusement_park, attraction
- Description: Avengers Campus is a Marvel Cinematic Universe (MCU)–themed area located at Disney California Adventure and Disney Adventure World in Disneyland Paris, and being developed for Hong Kong Disneyland under the name Stark Ex...

**18. Drum Barracks** (`fce3679a-955c-4a64-9089-db767144e1ad`)
- Category: history / Source: state_landmark (id=CHL-169) / Editorial: draft
- Score: **82.00**; breakdown: `{"total":82,"pageviews":2,"source_base":40,"cross_source":30,"route_adjacency":10}`
- Coords: (33.78472, -118.25667) / intrinsic_depth=standard / venue=false/parent=null/iconic=false
- Tags (2): chl-169, military
- Description: Drum Barracks was the Union Army's headquarters for Southern California and New Mexico during the Civil War. It consisted of 19 buildings on 60 acres in what is now Wilmington, with another 37 acres near the waterfront. ...

**19. Mission La Purísima Concepción** (`b185a594-9d62-484f-b604-d17408e97b3f`)
- Category: history / Source: editorial (id=venue-mission-la-purisima) / Editorial: draft
- Score: **82.00**; breakdown: `{"total":82,"pageviews":12,"source_base":40,"cross_source":30,"route_adjacency":0}`
- Coords: (34.67203, -120.42194) / intrinsic_depth=standard / venue=true/parent=null/iconic=false
- Tags (3): venue, mission, missions
- Description: Mission La Purísima Concepción — venue (mission)

**20. Mission San Luis Obispo de Tolosa** (`779987b7-0ec8-46d9-80d1-1bceb8ed9639`)
- Category: history / Source: editorial (id=venue-mission-san-luis-obispo) / Editorial: draft
- Score: **82.00**; breakdown: `{"total":82,"pageviews":12,"source_base":40,"cross_source":20,"route_adjacency":10}`
- Coords: (35.28080, -120.66447) / intrinsic_depth=standard / venue=true/parent=null/iconic=false
- Tags (3): venue, mission, missions
- Description: Mission San Luis Obispo de Tolosa is a Spanish mission founded September 1, 1772 by Father Junípero Serra in San Luis Obispo, California. The mission was named after San Luis, obispo de Tolosa.

