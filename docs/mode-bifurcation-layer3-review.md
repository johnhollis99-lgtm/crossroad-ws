# Mode Bifurcation Layer 3 — Curator Review Export

**Regenerated:** 2026-05-20, post-migration `20260520000005_mode_bifurcation_narrative_modes.sql`. Parent context + rule attribution added; `curator_override` column removed (taste pass moved to `mode-bifurcation-layer3-patterns.md`; per-row marking deprecated).

**Source query:** top 200 active POIs by `significance_score` desc (tiebreak by `id` asc), `merged_into IS NULL`. Significance at rank 200 = 69.00.

**Corpus-wide post-Layer-1+2:** Total active 21,935 · Soul-only 17,041 · Local-only 835 · Both 4,059 · Empty 0.

**Rule attribution semantics:** `rule_applied` reports the FIRST-firing rule that produced the row's current `narrative_modes`. Rules 1/2/4 are additive (`+local` on Soul-only base); Rule 3 is an override (forces `['local']`); Layer 1 default means no Layer 2 rule fired and the row's modes match the slug default.

| rank | id | name | category_slug | source_type | is_venue | significance | narrative_modes | parent_name | parent_modes | rule_applied |
|---:|---|---|---|---|:---:|---:|---|---|---|---|
| 1 | `0ef620f4-9880-485e-a8b1-d2473ecbe8d7` | Santa Monica Pier | `local_culture` | `wikidata` | — | 100 | `soul,local` |  |  | Layer 1 default (slug → soul,local) |
| 2 | `44d6873c-d06f-4a0a-833a-47f93b7f6407` | Walk of Fame | `hidden_gems` | `osm` | — | 100 | `local` |  |  | Layer 1 default (slug → local) |
| 3 | `7d6987cd-002b-4000-aa4a-fc56b3f04f6a` | Grizzly River Run | `hidden_gems` | `osm` | — | 100 | `local` | Disney California Adventure Park | `soul,local` | Layer 1 default (slug → local) |
| 4 | `add6f7fd-ec7c-4ada-8da2-ed95382d61f6` | Hollywood Walk of Fame | `history` | `wikidata` | — | 99 | `soul,local` |  |  | Rule 2 (NRHP/CHL/wikidata sig>=70 → +local) |
| 5 | `2e7059ed-37f2-4c34-9599-82a7157a230d` | Hollywood Sign | `local_culture` | `editorial` | — | 95 | `soul,local` |  |  | Layer 1 default (slug → soul,local) |
| 6 | `7af8beeb-8006-42c4-b6c8-a8c889e7842f` | Manzanar National Historic Site | `history` | `editorial` | — | 95 | `soul,local` |  |  | Rule 4 (iconic_local/editorial_curated → +local) |
| 7 | `bfd29316-9df3-42f0-a1a3-ca64b9a825f4` | Mission San Miguel Arcángel | `history` | `state_landmark` | — | 93 | `soul,local` |  |  | Rule 2 (NRHP/CHL/wikidata sig>=70 → +local) |
| 8 | `395a3ce1-45b0-4a81-85c2-e4855cadd203` | Owens Lake (Patsiata) | `history` | `editorial` | — | 92 | `soul,local` |  |  | Rule 4 (iconic_local/editorial_curated → +local) |
| 9 | `415237b7-56e8-4724-9f84-63a6f292461b` | Mission San Buenaventura | `history` | `editorial` | ✓ | 92 | `soul,local` |  |  | Rule 1 (venue → +local) |
| 10 | `4027f0f8-b280-4ec2-bf56-ee937eb826ec` | Marine World/Africa USA | `local_culture` | `wikidata` | — | 90 | `soul,local` |  |  | Layer 1 default (slug → soul,local) |
| 11 | `9d6c978d-77d4-4583-bbd9-589f0a2ef6b2` | Edwards Air Force Base | `history` | `editorial` | — | 90 | `soul,local` |  |  | Rule 4 (iconic_local/editorial_curated → +local) |
| 12 | `2309b2d2-1a03-4126-b783-03095ab17b22` | Ancient Bristlecone Pine Forest | `nature` | `editorial` | — | 88 | `soul,local` |  |  | Rule 4 (iconic_local/editorial_curated → +local) |
| 13 | `7453f2d8-dce7-45cd-8c2a-fd98bea08a02` | Adventure City | `local_culture` | `wikidata` | — | 88 | `soul,local` |  |  | Layer 1 default (slug → soul,local) |
| 14 | `966be3af-5fe2-4449-bbc2-186a5ab3c5af` | Cerro Gordo Silver Mines | `history` | `editorial` | — | 88 | `soul,local` |  |  | Rule 4 (iconic_local/editorial_curated → +local) |
| 15 | `e87363a3-47cb-4110-8272-e9ca8467d223` | Misión San Gabriel Archángel | `architecture` | `osm` | — | 88 | `soul,local` |  |  | Layer 1 default (slug → soul,local) |
| 16 | `e893d57e-2d5b-4c61-9f59-025e0e8dd761` | LA Aqueduct — Jawbone Siphon | `architecture` | `editorial` | — | 88 | `soul,local` |  |  | Layer 1 default (slug → soul,local) |
| 17 | `0f1e44ea-6d28-48b4-972a-dbe5163182ac` | Museum of Contemporary Art San Diego | `art` | `wikidata` | — | 87 | `soul,local` |  |  | Layer 1 default (slug → soul,local) |
| 18 | `e68edcbe-f623-4012-88e7-5220e911ecab` | Black Hill | `nature` | `wikidata` | — | 87 | `soul,local` |  |  | Rule 2 (NRHP/CHL/wikidata sig>=70 → +local) |
| 19 | `0471fd45-90e9-4f83-831f-806573e7caee` | Verdi Peaks | `nature` | `wikidata` | — | 86 | `soul,local` |  |  | Rule 2 (NRHP/CHL/wikidata sig>=70 → +local) |
| 20 | `e891aab8-a37a-438b-8e2b-7efd98720fc9` | North Yolla Bolly Mountain | `nature` | `wikidata` | — | 86 | `soul,local` |  |  | Rule 2 (NRHP/CHL/wikidata sig>=70 → +local) |
| 21 | `382bd6be-7dfd-4b3a-a5a1-b39388ddd5b0` | Mission San Francisco de Asís | `history` | `editorial` | ✓ | 85 | `soul,local` |  |  | Rule 1 (venue → +local) |
| 22 | `c400a378-e37f-4e78-a55d-9d6e8de93554` | California State Capitol | `architecture` | `state_landmark` | — | 85 | `soul,local` |  |  | Layer 1 default (slug → soul,local) |
| 23 | `cb893ed4-68f8-49ac-aaec-94226d824a5a` | Rattlesnake Hill (Churchill County, Nevada) | `nature` | `wikidata` | — | 85 | `soul,local` |  |  | Rule 2 (NRHP/CHL/wikidata sig>=70 → +local) |
| 24 | `d613700d-5d58-4b37-b59c-ec35359e4f47` | San Andreas Fault — Palmdale Roadcut | `geology` | `editorial` | — | 85 | `soul,local` |  |  | Rule 4 (iconic_local/editorial_curated → +local) |
| 25 | `11679aee-20ff-44b1-b708-c91447579deb` | Camp Independence / Fort Independence Reservation | `history` | `editorial` | — | 84 | `soul,local` |  |  | Rule 4 (iconic_local/editorial_curated → +local) |
| 26 | `5af766ba-ea31-482a-b85e-0552362700f6` | Vasquez Rocks | `history` | `editorial` | — | 84 | `soul,local` |  |  | Rule 4 (iconic_local/editorial_curated → +local) |
| 27 | `739aca24-d217-47a8-b13d-a0e2d0d30214` | Mission San Juan Capistrano | `history` | `editorial` | ✓ | 84 | `soul,local` |  |  | Rule 1 (venue → +local) |
| 28 | `9ad91ead-dd4b-49ac-9d2c-356062995679` | Coso Volcanic Field & Red Hill | `geology` | `editorial` | — | 84 | `soul,local` |  |  | Rule 4 (iconic_local/editorial_curated → +local) |
| 29 | `d2814ccd-60fc-40da-9dd6-446bf1d9d74e` | Mission San Diego de Alcalá | `history` | `editorial` | ✓ | 84 | `soul,local` |  |  | Rule 1 (venue → +local) |
| 30 | `e1bb3c66-76c9-4acf-a7fa-0d191d20b803` | Sleeping Beauty Castle | `hidden_gems` | `wikidata` | — | 84 | `local` | Disneyland Park | `soul,local` | Layer 1 default (slug → local) |
| 31 | `2d48f77c-1881-434a-8ff2-ad8747dae34d` | Churchill Butte | `nature` | `wikidata` | — | 83 | `soul,local` |  |  | Rule 2 (NRHP/CHL/wikidata sig>=70 → +local) |
| 32 | `47646679-aba7-49d2-971a-981bd96f1194` | Mission Santa Bárbara | `history` | `editorial` | ✓ | 83 | `soul,local` |  |  | Rule 1 (venue → +local) |
| 33 | `97cd82ab-6d11-4279-965e-be22435a9914` | Mission San Luis Rey de Francia | `history` | `editorial` | ✓ | 83 | `soul,local` |  |  | Rule 1 (venue → +local) |
| 34 | `186a3dc0-d51d-4090-8138-ee45cd369f45` | Avengers Campus | `local_culture` | `wikidata` | — | 82 | `local` | Disneyland Park | `soul,local` | Rule 3 (theme-park/zoo child override) |
| 35 | `29df82da-c62d-4de9-86b6-693f986ee6df` | Mount Watkins | `nature` | `wikidata` | — | 82 | `soul,local` | Yosemite National Park | `soul,local` | Rule 2 (NRHP/CHL/wikidata sig>=70 → +local) |
| 36 | `3e2b0feb-88e9-455d-a056-2373a52969ef` | Mission Santa Cruz | `history` | `editorial` | ✓ | 82 | `soul,local` |  |  | Rule 1 (venue → +local) |
| 37 | `4ccceb49-d251-49f5-a1d6-3a7894940695` | Red Rock Canyon State Park | `geology` | `editorial` | — | 82 | `soul,local` |  |  | Rule 4 (iconic_local/editorial_curated → +local) |
| 38 | `779987b7-0ec8-46d9-80d1-1bceb8ed9639` | Mission San Luis Obispo de Tolosa | `history` | `editorial` | ✓ | 82 | `soul,local` |  |  | Rule 1 (venue → +local) |
| 39 | `88f4b88d-2866-4aa7-894a-ef588c9d223c` | Mojave Air & Space Port | `history` | `editorial` | — | 82 | `soul,local` |  |  | Rule 4 (iconic_local/editorial_curated → +local) |
| 40 | `8c70d0c6-c50c-4a43-9ddc-0ff8e18df691` | Devils Postpile National Monument | `geology` | `editorial` | — | 82 | `soul,local` |  |  | Rule 4 (iconic_local/editorial_curated → +local) |
| 41 | `8e856376-4218-481d-beab-24b735b32876` | Getty Villa | `architecture` | `editorial` | ✓ | 82 | `soul,local` |  |  | Layer 1 default (slug → soul,local) |
| 42 | `b185a594-9d62-484f-b604-d17408e97b3f` | Mission La Purísima Concepción | `history` | `editorial` | ✓ | 82 | `soul,local` |  |  | Rule 1 (venue → +local) |
| 43 | `ec6ae7b9-2a91-44a6-aeea-53b3bfc0459e` | Alabama Hills | `geology` | `editorial` | — | 82 | `soul,local` |  |  | Rule 4 (iconic_local/editorial_curated → +local) |
| 44 | `fb62e3ce-80ef-4340-b317-9fea5dbb8167` | Wayfarers Chapel | `architecture` | `nrhp` | — | 82 | `soul,local` |  |  | Layer 1 default (slug → soul,local) |
| 45 | `fce3679a-955c-4a64-9089-db767144e1ad` | Drum Barracks | `history` | `state_landmark` | — | 82 | `soul,local` |  |  | Rule 2 (NRHP/CHL/wikidata sig>=70 → +local) |
| 46 | `10ea7950-3de5-462e-8a67-1b64f47155bc` | Oceanside City Hall and Fire Station | `history` | `wikidata` | — | 81 | `soul,local` |  |  | Rule 2 (NRHP/CHL/wikidata sig>=70 → +local) |
| 47 | `9525dc70-1845-424f-b1a3-9daa1fca0ecb` | Lake Temescal | `nature` | `wikidata` | — | 81 | `soul,local` |  |  | Rule 2 (NRHP/CHL/wikidata sig>=70 → +local) |
| 48 | `96f91a79-c0b3-4e2a-930f-1d84622b5501` | Cars Land | `local_culture` | `wikidata` | — | 81 | `local` | Disney California Adventure Park | `soul,local` | Rule 3 (theme-park/zoo child override) |
| 49 | `b792f2c9-c5ea-4b3e-bd63-1785fa73cc98` | Randsburg / Rand Mining District | `history` | `editorial` | — | 81 | `soul,local` |  |  | Rule 4 (iconic_local/editorial_curated → +local) |
| 50 | `02552b0e-24ed-40d8-a9fa-ae36ae772bad` | Fossil Falls | `geology` | `editorial` | — | 80 | `soul,local` |  |  | Rule 4 (iconic_local/editorial_curated → +local) |
| 51 | `051372b6-a252-4d68-9a30-d4386f76921d` | Jurassic World-The Ride | `hidden_gems` | `osm` | — | 80 | `local` | Universal Studios Hollywood | `soul,local` | Layer 1 default (slug → local) |
| 52 | `227777ca-522f-4a91-b7fc-741db53da127` | Echo Lake | `nature` | `wikidata` | — | 80 | `soul,local` |  |  | Rule 2 (NRHP/CHL/wikidata sig>=70 → +local) |
| 53 | `244a8a6c-156a-4aee-b1ca-911754e7bb20` | Old Town San Diego State Historic Park | `history` | `editorial` | ✓ | 80 | `soul,local` |  |  | Rule 1 (venue → +local) |
| 54 | `597ad679-49ff-44a0-b90a-0496632ae6b9` | Santa Ana Fire Station Headquarters No. 1 | `history` | `wikidata` | — | 80 | `soul,local` |  |  | Rule 2 (NRHP/CHL/wikidata sig>=70 → +local) |
| 55 | `5be2bde2-7b30-409e-ae4f-b174f84a8bfe` | Fire Station No. 23 | `history` | `wikidata` | — | 80 | `soul,local` |  |  | Rule 2 (NRHP/CHL/wikidata sig>=70 → +local) |
| 56 | `6dbb1b74-7aac-4f1e-91ad-9df46391e1b0` | Mount Whitney | `geology` | `editorial` | — | 80 | `soul,local` | Sequoia National Park | `soul,local` | Rule 4 (iconic_local/editorial_curated → +local) |
| 57 | `740cc5cf-0cf9-4873-8c06-e37436b5229a` | Fremont Peak | `history` | `state_landmark` | — | 80 | `soul,local` |  |  | Rule 2 (NRHP/CHL/wikidata sig>=70 → +local) |
| 58 | `91209444-6418-4e81-b17d-f537b255ef8d` | Pacific Park | `local_culture` | `wikidata` | — | 80 | `soul,local` |  |  | Layer 1 default (slug → soul,local) |
| 59 | `92df5dbd-5cdc-452a-8a75-fcdeaa309052` | Getty Center | `architecture` | `editorial` | ✓ | 80 | `soul,local` |  |  | Layer 1 default (slug → soul,local) |
| 60 | `a4e2a610-e1dc-445c-86af-5ea130d61365` | Naval Air Weapons Station China Lake | `history` | `editorial` | — | 80 | `soul,local` |  |  | Rule 4 (iconic_local/editorial_curated → +local) |
| 61 | `a5b48978-fa40-42c0-8daf-dc9fd550f29b` | Adventuredome | `local_culture` | `wikidata` | — | 80 | `soul,local` |  |  | Layer 1 default (slug → soul,local) |
| 62 | `cbc1ac7f-d9b6-4109-a85c-d6b69a9ed2c2` | Mammoth Mountain Ski Area | `recreation` | `editorial` | — | 80 | `local` |  |  | Layer 1 default (slug → local) |
| 63 | `d9329a26-66c8-4220-9599-1fae9eca5a04` | Dallidet Adobe | `history` | `state_landmark` | — | 80 | `soul,local` |  |  | Rule 2 (NRHP/CHL/wikidata sig>=70 → +local) |
| 64 | `e7dbbeda-d044-44e4-aed5-5b33bd0e6fa4` | Tehachapi—Mojave Wind Resource Area | `architecture` | `editorial` | — | 80 | `soul,local` |  |  | Layer 1 default (slug → soul,local) |
| 65 | `1d9b9e98-c304-4f90-9488-605a6c231151` | Junipero Serra Peak | `nature` | `wikidata` | — | 79 | `soul,local` |  |  | Rule 2 (NRHP/CHL/wikidata sig>=70 → +local) |
| 66 | `3568e860-bcca-4064-9bda-87e0e8395068` | Trona Pinnacles | `geology` | `editorial` | — | 79 | `soul,local` |  |  | Rule 4 (iconic_local/editorial_curated → +local) |
| 67 | `3599f61b-a2af-4ab3-8e1e-e102639f1599` | Point San Luis Light | `architecture` | `wikidata` | — | 79 | `soul,local` |  |  | Layer 1 default (slug → soul,local) |
| 68 | `3d204afe-b1c7-4508-9831-ae59722c9d95` | Confusion Hill | `local_culture` | `wikidata` | — | 79 | `soul,local` |  |  | Layer 1 default (slug → soul,local) |
| 69 | `5866c236-1d7f-4ff0-8b8d-8ef92286a2b6` | Needle Peak | `nature` | `wikidata` | — | 79 | `soul,local` | Death Valley National Park | `soul,local` | Rule 2 (NRHP/CHL/wikidata sig>=70 → +local) |
| 70 | `60f63159-ce08-438a-a945-e4bc6e2ff3e2` | Twin Peaks (Churchill County, Nevada) | `nature` | `wikidata` | — | 79 | `soul,local` |  |  | Rule 2 (NRHP/CHL/wikidata sig>=70 → +local) |
| 71 | `6ea4408f-cd00-45ad-b298-5876193bf599` | Balboa Park | `architecture` | `editorial` | ✓ | 79 | `soul,local` |  |  | Layer 1 default (slug → soul,local) |
| 72 | `dce330bc-65eb-40e0-bef7-a6546b362b7d` | Balboa Park Gardens | `nature` | `wikidata` | — | 79 | `soul,local` | Balboa Park | `soul,local` | Rule 2 (NRHP/CHL/wikidata sig>=70 → +local) |
| 73 | `eeb1b2b2-5b0d-4ddc-9287-af437cfbc916` | Disneyland Park | `local_culture` | `editorial` | ✓ | 79 | `soul,local` |  |  | Layer 1 default (slug → soul,local) |
| 74 | `14d851d5-775a-467c-b7a1-2351081d9375` | Legoland California | `local_culture` | `editorial` | ✓ | 78 | `soul,local` |  |  | Layer 1 default (slug → soul,local) |
| 75 | `2a82aad2-ac75-4a7f-9be6-e19d8f68b3f2` | Cerro San Luis Obispo | `nature` | `wikidata` | — | 78 | `soul,local` |  |  | Rule 2 (NRHP/CHL/wikidata sig>=70 → +local) |
| 76 | `307b9fa1-3a9c-46aa-b760-a13c85bfeee4` | Mission San José | `history` | `editorial` | ✓ | 78 | `soul,local` |  |  | Rule 1 (venue → +local) |
| 77 | `813546cc-bc84-4361-977b-f3c835984054` | Garlock Fault | `geology` | `editorial` | — | 78 | `soul,local` |  |  | Rule 4 (iconic_local/editorial_curated → +local) |
| 78 | `87b78696-99b9-4865-a6f2-3ec7393f9c1c` | Mission Santa Clara de Asís | `history` | `editorial` | ✓ | 78 | `soul,local` |  |  | Rule 1 (venue → +local) |
| 79 | `991a9050-459a-4f0d-ae33-a3aba1534bff` | Cone Peak | `nature` | `wikidata` | — | 78 | `soul,local` |  |  | Rule 2 (NRHP/CHL/wikidata sig>=70 → +local) |
| 80 | `de00b1e5-3605-4d42-9dae-e16b31ff8d7e` | 1872 Lone Pine Earthquake Monument | `history` | `editorial` | — | 78 | `soul,local` |  |  | Rule 4 (iconic_local/editorial_curated → +local) |
| 81 | `f32409f3-6757-4d03-a607-daec3dda2430` | South Hill (Eureka County, Nevada) | `nature` | `wikidata` | — | 78 | `soul,local` |  |  | Rule 2 (NRHP/CHL/wikidata sig>=70 → +local) |
| 82 | `7066e918-d09e-4ed7-9e31-ffe2d2fcb9f0` | Cerro Cabrillo | `nature` | `wikidata` | — | 77 | `soul,local` |  |  | Rule 2 (NRHP/CHL/wikidata sig>=70 → +local) |
| 83 | `8a7712dd-1968-45bd-b2b4-62871fe00fa3` | Engine Company No. 28 | `history` | `wikidata` | — | 77 | `soul,local` |  |  | Rule 2 (NRHP/CHL/wikidata sig>=70 → +local) |
| 84 | `8c7fcdf8-961a-4bef-9521-2cb32388ee6f` | Golden Gate Bridge | `history` | `state_landmark` | — | 77 | `soul,local` |  |  | Rule 2 (NRHP/CHL/wikidata sig>=70 → +local) |
| 85 | `a8bc56e0-9d31-43c9-9655-180c464f2a43` | Universal Studios Hollywood | `local_culture` | `editorial` | ✓ | 77 | `soul,local` |  |  | Layer 1 default (slug → soul,local) |
| 86 | `e92ff543-c775-4dab-9f92-bca9b9c75ccb` | Hollister Peak | `nature` | `wikidata` | — | 77 | `soul,local` |  |  | Rule 2 (NRHP/CHL/wikidata sig>=70 → +local) |
| 87 | `364c0b49-73a6-4bf6-aaae-1e41a7de9bb8` | Mission San Rafael Arcángel | `history` | `state_landmark` | — | 76 | `soul,local` |  |  | Rule 2 (NRHP/CHL/wikidata sig>=70 → +local) |
| 88 | `6647284d-e277-4298-b394-344e0befad46` | Mount Lukens | `nature` | `wikidata` | — | 76 | `soul,local` |  |  | Rule 2 (NRHP/CHL/wikidata sig>=70 → +local) |
| 89 | `9129615f-6ac2-45e6-8522-59b0ea42d6a8` | Freeman Junction / Coyote Holes (Vásquez stagecoach robbery, 1874) | `history` | `editorial` | — | 76 | `soul,local` |  |  | Rule 4 (iconic_local/editorial_curated → +local) |
| 90 | `a7c1ec07-7a02-479a-aa0f-4b98d6e34388` | Disney California Adventure Park | `local_culture` | `editorial` | ✓ | 76 | `soul,local` |  |  | Layer 1 default (slug → soul,local) |
| 91 | `b8f2e45e-ed6c-4b6e-abd6-bf4e2677dc8b` | Six Flags Magic Mountain | `local_culture` | `editorial` | ✓ | 76 | `soul,local` |  |  | Layer 1 default (slug → soul,local) |
| 92 | `d1113b97-dac0-426c-bc49-96cf07eab859` | Caliente Mountain | `nature` | `wikidata` | — | 76 | `soul,local` |  |  | Rule 2 (NRHP/CHL/wikidata sig>=70 → +local) |
| 93 | `e6b5c50a-1e36-4e7f-a0e5-43a5b294db47` | Mount Lee | `nature` | `wikidata` | — | 76 | `soul,local` |  |  | Rule 2 (NRHP/CHL/wikidata sig>=70 → +local) |
| 94 | `06972144-970d-4060-9d4c-505cab4a61d2` | San Andreas Fault (Carrizo Plain segment) | `geology` | `editorial` | — | 75 | `soul,local` |  |  | Rule 4 (iconic_local/editorial_curated → +local) |
| 95 | `0c42e4eb-d987-48ba-84a6-e37585268166` | Bas Relief II | `art` | `osm` | — | 75 | `soul,local` |  |  | Layer 1 default (slug → soul,local) |
| 96 | `0cab9f2a-2a2c-4a1d-ba79-583970034094` | Frog Woman Rock | `history` | `state_landmark` | — | 75 | `soul,local` |  |  | Rule 2 (NRHP/CHL/wikidata sig>=70 → +local) |
| 97 | `24511717-fe9d-480e-990a-74e9533ca43d` | Cowles Mountain | `nature` | `wikidata` | — | 75 | `soul,local` |  |  | Rule 2 (NRHP/CHL/wikidata sig>=70 → +local) |
| 98 | `2b9a1365-8a0b-4665-844c-87f1f5ec7598` | Fire Control Station | `history` | `osm` | — | 75 | `soul` |  |  | Layer 1 default (slug → soul) |
| 99 | `5005a492-d71a-4c5a-8247-ae5882cfaf82` | Morro Bay Maritime Museum | `history` | `wikidata` | — | 75 | `soul,local` |  |  | Rule 2 (NRHP/CHL/wikidata sig>=70 → +local) |
| 100 | `5c30d140-1d95-47ae-809f-104c627e7943` | Jack House | `history` | `osm` | — | 75 | `soul` |  |  | Layer 1 default (slug → soul) |
| 101 | `796ea27b-2d48-4494-a10b-354f39518130` | Faith Mission | `history` | `osm` | — | 75 | `soul` |  |  | Layer 1 default (slug → soul) |
| 102 | `8d6f829e-3f0e-43f3-a81e-516c493c5644` | Cerro Romauldo | `nature` | `wikidata` | — | 75 | `soul,local` |  |  | Rule 2 (NRHP/CHL/wikidata sig>=70 → +local) |
| 103 | `a824aaed-2703-47da-86b2-45532f3d59a5` | Bumpass Hell | `geology` | `editorial` | — | 75 | `soul,local` |  |  | Rule 4 (iconic_local/editorial_curated → +local) |
| 104 | `b4349aeb-b473-4b3d-b811-922e90c34a4a` | The Broad | `art` | `wikidata` | — | 75 | `soul,local` |  |  | Layer 1 default (slug → soul,local) |
| 105 | `c647c0b9-640a-402e-915d-7099597199db` | Painted Dunes (Lassen) | `geology` | `editorial` | — | 75 | `soul,local` |  |  | Rule 4 (iconic_local/editorial_curated → +local) |
| 106 | `d1e192a6-2dc0-4c8f-a9b2-18645bf9c557` | Museum of Contemporary Art, Los Angeles | `art` | `wikidata` | — | 75 | `soul,local` |  |  | Layer 1 default (slug → soul,local) |
| 107 | `d60a258d-9073-4988-9436-ba6babdfda0c` | Trona Pinnacles | `geology` | `editorial` | — | 75 | `soul,local` |  |  | Rule 4 (iconic_local/editorial_curated → +local) |
| 108 | `f77d8d68-e154-4f55-8b53-53ea48a0a0a0` | The Pike | `local_culture` | `wikidata` | — | 75 | `soul,local` |  |  | Layer 1 default (slug → soul,local) |
| 109 | `f9156c05-fb32-409f-8b05-6d2e256d202d` | Andalucia Building | `history` | `osm` | — | 75 | `soul` |  |  | Layer 1 default (slug → soul) |
| 110 | `dff08aa4-36a8-496d-80fa-7a032de60330` | Belmont Park | `local_culture` | `wikidata` | — | 74 | `soul,local` |  |  | Layer 1 default (slug → soul,local) |
| 111 | `0d161c7d-350c-4847-a046-eedf52d7f07b` | San Luis Obispo Museum of Art | `art` | `wikidata` | — | 73 | `soul,local` |  |  | Layer 1 default (slug → soul,local) |
| 112 | `17946557-e092-4f0c-8d42-a08330274346` | Monterey Museum of Art | `history` | `wikidata` | — | 73 | `soul,local` |  |  | Rule 2 (NRHP/CHL/wikidata sig>=70 → +local) |
| 113 | `20c9c470-f379-4b8b-9cee-ec45e2b761c4` | Cahuenga Peak | `nature` | `wikidata` | — | 73 | `soul,local` |  |  | Rule 2 (NRHP/CHL/wikidata sig>=70 → +local) |
| 114 | `2a681cc6-2e91-440e-8322-d620d9e2a805` | Emerald Pool | `nature` | `wikidata` | — | 73 | `soul,local` | Yosemite National Park | `soul,local` | Rule 2 (NRHP/CHL/wikidata sig>=70 → +local) |
| 115 | `2be858d1-746c-4ef1-907e-750c2d08c148` | Children's Fairyland | `local_culture` | `wikidata` | — | 73 | `soul,local` |  |  | Layer 1 default (slug → soul,local) |
| 116 | `306d35d3-8061-4ba7-9cd4-201571472a0c` | Solar Star Solar Project | `architecture` | `editorial` | — | 73 | `soul,local` |  |  | Layer 1 default (slug → soul,local) |
| 117 | `670ca102-acd5-4667-b20f-d50c16759a0e` | Idora Park | `local_culture` | `wikidata` | — | 73 | `soul,local` |  |  | Layer 1 default (slug → soul,local) |
| 118 | `674f1e25-4a8c-42c1-ac74-d3597ff29a9c` | Monte Cristo Range | `nature` | `wikidata` | — | 73 | `soul,local` |  |  | Rule 2 (NRHP/CHL/wikidata sig>=70 → +local) |
| 119 | `993de05d-da8f-4ad8-9e17-ff16acca4955` | Kennedy Meadows | `nature` | `editorial` | — | 73 | `soul,local` |  |  | Rule 4 (iconic_local/editorial_curated → +local) |
| 120 | `995b7714-59e5-477d-8a97-aa022513dd8a` | Museum of Death | `history` | `wikidata` | — | 73 | `soul,local` |  |  | Rule 2 (NRHP/CHL/wikidata sig>=70 → +local) |
| 121 | `9cc51d36-63c9-4736-9332-16d87de92baa` | Mission San Juan Bautista | `history` | `editorial` | ✓ | 73 | `soul,local` |  |  | Rule 1 (venue → +local) |
| 122 | `c866e4b4-24f9-4b09-9040-5f935284a394` | Beacon Hill | `nature` | `wikidata` | — | 73 | `soul,local` |  |  | Rule 2 (NRHP/CHL/wikidata sig>=70 → +local) |
| 123 | `0c4e065c-a7d2-474e-bc88-fe46a401e3c4` | Japanese Village and Deer Park | `local_culture` | `wikidata` | — | 72 | `soul,local` |  |  | Layer 1 default (slug → soul,local) |
| 124 | `0d567265-818f-4bde-8110-4f6741d3cf53` | Pico Blanco | `nature` | `wikidata` | — | 72 | `soul,local` |  |  | Rule 2 (NRHP/CHL/wikidata sig>=70 → +local) |
| 125 | `1bd14db8-c805-49f8-a2f8-33540a215366` | Mojave | `history` | `editorial` | — | 72 | `soul,local` |  |  | Rule 4 (iconic_local/editorial_curated → +local) |
| 126 | `347e84ef-b02a-4334-b1bf-acd61e758119` | San Diego Museum of Art | `art` | `wikidata` | — | 72 | `soul,local` | Balboa Park | `soul,local` | Layer 1 default (slug → soul,local) |
| 127 | `37b0490f-0a90-4ffe-814a-886962a35f09` | Mission San Antonio de Padua | `history` | `editorial` | ✓ | 72 | `soul,local` |  |  | Rule 1 (venue → +local) |
| 128 | `43604abe-89df-40e0-a5ae-c6d14219c3fa` | Badger Mountains | `nature` | `wikidata` | — | 72 | `soul,local` |  |  | Rule 2 (NRHP/CHL/wikidata sig>=70 → +local) |
| 129 | `4dff8a6e-1280-480a-9459-f0fc4b58fa45` | Broken Hills | `nature` | `wikidata` | — | 72 | `soul,local` |  |  | Rule 2 (NRHP/CHL/wikidata sig>=70 → +local) |
| 130 | `599c180e-cdf2-4f70-911c-c0de91ed8dd5` | Mission Santa Inés | `history` | `editorial` | ✓ | 72 | `soul,local` |  |  | Rule 1 (venue → +local) |
| 131 | `6cd8edae-164e-4199-8577-7dcf2183c035` | Mount Toro | `nature` | `wikidata` | — | 72 | `soul,local` |  |  | Rule 2 (NRHP/CHL/wikidata sig>=70 → +local) |
| 132 | `7415732e-a158-4158-baf9-89011f929742` | La Brea Tar Pits | `history` | `wikidata` | — | 72 | `soul,local` |  |  | Rule 2 (NRHP/CHL/wikidata sig>=70 → +local) |
| 133 | `9a4fe4b6-9194-4b49-a7fb-1c5be5bf2e32` | San Diego Air & Space Museum | `history` | `wikidata` | — | 72 | `soul,local` | Balboa Park | `soul,local` | Rule 2 (NRHP/CHL/wikidata sig>=70 → +local) |
| 134 | `c38a3fab-278e-474d-8b05-929f45a86a2a` | Los Angeles County Museum of Art | `art` | `wikidata` | — | 72 | `soul,local` |  |  | Layer 1 default (slug → soul,local) |
| 135 | `d0b6c532-5928-4736-8a29-39fc6c5feda6` | Old Point Loma Lighthouse | `history` | `state_landmark` | — | 72 | `soul,local` |  |  | Rule 2 (NRHP/CHL/wikidata sig>=70 → +local) |
| 136 | `1c87c173-ab4d-4257-9305-ada1f8750817` | Viejas Mountain | `nature` | `wikidata` | — | 71 | `soul,local` |  |  | Rule 2 (NRHP/CHL/wikidata sig>=70 → +local) |
| 137 | `22c03e4a-f308-47ca-b970-be49d5d4f000` | Mingei International Museum | `art` | `wikidata` | — | 71 | `soul,local` | Balboa Park | `soul,local` | Layer 1 default (slug → soul,local) |
| 138 | `3e402285-b08b-49da-8eea-c7845751d719` | Mission Point | `nature` | `wikidata` | — | 71 | `soul,local` |  |  | Rule 2 (NRHP/CHL/wikidata sig>=70 → +local) |
| 139 | `6cce11d7-3f80-4849-ac85-35ead58150b9` | Dixie Hills | `nature` | `wikidata` | — | 71 | `soul,local` |  |  | Rule 2 (NRHP/CHL/wikidata sig>=70 → +local) |
| 140 | `6d5d7d89-af01-44ba-b69f-3aecbf5213d3` | Whaley House | `history` | `state_landmark` | — | 71 | `soul,local` |  |  | Rule 2 (NRHP/CHL/wikidata sig>=70 → +local) |
| 141 | `6df4d227-481e-4284-8cb1-c03c74ca5ba9` | Knott's Berry Farm | `local_culture` | `editorial` | ✓ | 71 | `soul,local` |  |  | Layer 1 default (slug → soul,local) |
| 142 | `750110ec-42ef-4035-834d-822e4e737ba2` | Mission Nuestra Señora de la Soledad | `history` | `editorial` | ✓ | 71 | `soul,local` |  |  | Rule 1 (venue → +local) |
| 143 | `81a849f0-7e65-419d-9c66-3be5423f916c` | Winchester Mystery House | `history` | `state_landmark` | — | 71 | `soul,local` |  |  | Rule 2 (NRHP/CHL/wikidata sig>=70 → +local) |
| 144 | `8dbff772-8f83-4919-88cf-b38999f77891` | Garlock (ghost town) | `history` | `editorial` | — | 71 | `soul,local` |  |  | Rule 4 (iconic_local/editorial_curated → +local) |
| 145 | `92700577-bdfb-41d8-b497-f82cf95351f6` | San Francisco Dungeon | `local_culture` | `wikidata` | — | 71 | `soul,local` |  |  | Layer 1 default (slug → soul,local) |
| 146 | `a7cbe01f-c88d-4da4-88a2-68c0a8288ba1` | Korean Bell of Friendship | `history` | `wikidata` | — | 71 | `soul,local` |  |  | Rule 2 (NRHP/CHL/wikidata sig>=70 → +local) |
| 147 | `abcc706e-9fd7-49a4-8783-298214bb11de` | Ventana Double Cone | `nature` | `wikidata` | — | 71 | `soul,local` |  |  | Rule 2 (NRHP/CHL/wikidata sig>=70 → +local) |
| 148 | `ad33f073-a7c5-437a-8160-15493105f94f` | Six Flags Hurricane Harbor Concord | `local_culture` | `wikidata` | — | 71 | `soul,local` |  |  | Layer 1 default (slug → soul,local) |
| 149 | `afad3096-0943-4d22-ab82-a19efb10eea4` | Timken Museum of Art | `art` | `wikidata` | — | 71 | `soul,local` | Balboa Park | `soul,local` | Layer 1 default (slug → soul,local) |
| 150 | `c6940de2-bd18-4569-a3bb-6155e2867dde` | Gamble House | `history` | `state_landmark` | — | 71 | `soul,local` |  |  | Rule 2 (NRHP/CHL/wikidata sig>=70 → +local) |
| 151 | `d3a189b8-0161-4188-a6af-82ee815bc408` | Museum of Us | `history` | `wikidata` | — | 71 | `soul,local` | Balboa Park | `soul,local` | Rule 2 (NRHP/CHL/wikidata sig>=70 → +local) |
| 152 | `e35d09e1-525b-4bf7-93ee-c09614f2f397` | Mossbrae Falls | `nature` | `wikidata` | — | 71 | `soul,local` |  |  | Rule 2 (NRHP/CHL/wikidata sig>=70 → +local) |
| 153 | `e81794ee-88cf-40f4-8fe8-c068e72a16f9` | Santa Barbara Museum of Art | `art` | `wikidata` | — | 71 | `soul,local` |  |  | Layer 1 default (slug → soul,local) |
| 154 | `f2fb9de2-eff2-439a-84c9-f9e6366faa85` | Cerro Alto | `nature` | `wikidata` | — | 71 | `soul,local` |  |  | Rule 2 (NRHP/CHL/wikidata sig>=70 → +local) |
| 155 | `f8765c08-f0bb-4e2b-ae38-356f2b5391e9` | Little Lake | `nature` | `editorial` | — | 71 | `soul,local` |  |  | Rule 4 (iconic_local/editorial_curated → +local) |
| 156 | `fb4c70b3-33ca-467b-9048-41dd1ac46cfa` | Autry Museum of the American West | `history` | `wikidata` | — | 71 | `soul,local` |  |  | Rule 2 (NRHP/CHL/wikidata sig>=70 → +local) |
| 157 | `00e717fa-babb-4f03-b221-fd7575090eb9` | Four Brothers | `nature` | `wikidata` | — | 70 | `soul,local` |  |  | Rule 2 (NRHP/CHL/wikidata sig>=70 → +local) |
| 158 | `0c14e495-e2ef-4d87-bf94-bb4c48f5c285` | Forestiere Underground Gardens | `history` | `state_landmark` | — | 70 | `soul,local` |  |  | Rule 2 (NRHP/CHL/wikidata sig>=70 → +local) |
| 159 | `19c3ad4b-6797-4a47-9b2f-ea7c874a6b49` | Kelso Depot, Restaurant and Employees Hotel | `history` | `nrhp` | — | 70 | `soul,local` |  |  | Rule 2 (NRHP/CHL/wikidata sig>=70 → +local) |
| 160 | `20203d1d-6c6a-492f-8d11-447b7ddc6224` | Armenian Genocide Martyrs Monument | `history` | `wikidata` | — | 70 | `soul,local` |  |  | Rule 2 (NRHP/CHL/wikidata sig>=70 → +local) |
| 161 | `25d1cc1e-a793-4a9b-bd34-b5e6fa48decb` | Mission Chumash Barracks | `history` | `osm` | — | 70 | `soul,local` |  |  | Rule 4 (iconic_local/editorial_curated → +local) |
| 162 | `2bb9f72c-4cde-4eef-ba65-6afb637fbad0` | Shooting Exposition | `hidden_gems` | `osm` | — | 70 | `local` | Disneyland Park | `soul,local` | Layer 1 default (slug → local) |
| 163 | `2f074e33-2cf9-42a1-923c-7b8d7ac944dd` | Forbes Mill | `history` | `state_landmark` | — | 70 | `soul,local` |  |  | Rule 2 (NRHP/CHL/wikidata sig>=70 → +local) |
| 164 | `312f755f-eb77-4737-b8f5-ff81e8fc2a22` | Mess Hall | `history` | `osm` | — | 70 | `soul` |  |  | Layer 1 default (slug → soul) |
| 165 | `332dc044-08e8-4808-aa02-37bc5bcd8e8c` | Museum of Latin American Art | `art` | `wikidata` | — | 70 | `soul,local` |  |  | Layer 1 default (slug → soul,local) |
| 166 | `38ef5b2f-ab91-4a91-a744-aa2f2ef76035` | Golden Gate Park | `history` | `nrhp` | — | 70 | `soul,local` |  |  | Rule 2 (NRHP/CHL/wikidata sig>=70 → +local) |
| 167 | `43062640-c5f4-49be-aab0-3fda44edc79e` | Pigeon Point Lighthouse | `history` | `state_landmark` | — | 70 | `soul,local` |  |  | Rule 2 (NRHP/CHL/wikidata sig>=70 → +local) |
| 168 | `4e7f8645-0acd-46fc-9056-deae71348fdd` | Laveaga Peak | `nature` | `wikidata` | — | 70 | `soul,local` |  |  | Rule 2 (NRHP/CHL/wikidata sig>=70 → +local) |
| 169 | `5e7d9776-2eb0-4228-9def-5a0506897a50` | Table Games | `hidden_gems` | `osm` | — | 70 | `local` |  |  | Layer 1 default (slug → local) |
| 170 | `70c6b337-3790-4854-8f1f-a745a8542343` | Slots | `hidden_gems` | `osm` | — | 70 | `local` |  |  | Layer 1 default (slug → local) |
| 171 | `83beec80-adad-47c6-a700-50cb434126a6` | Raging Waters | `local_culture` | `wikidata` | — | 70 | `soul,local` |  |  | Layer 1 default (slug → soul,local) |
| 172 | `83ef08a5-297b-4fae-bf50-a84e3aabdffe` | Rincon Hill | `nature` | `wikidata` | — | 70 | `soul,local` |  |  | Rule 2 (NRHP/CHL/wikidata sig>=70 → +local) |
| 173 | `a56b51f6-90b4-48a8-af68-8b0ae93d8f95` | Laguna Art Museum | `art` | `wikidata` | — | 70 | `soul,local` |  |  | Layer 1 default (slug → soul,local) |
| 174 | `b97edcf2-1577-4336-8fec-246f9693b59f` | Big Thunder Mountain Railroad | `hidden_gems` | `osm` | — | 70 | `local` | Disneyland Park | `soul,local` | Layer 1 default (slug → local) |
| 175 | `bc8a1e62-3b86-46a7-b555-4b1d74577279` | Davy Crockett Explorer Canoes | `hidden_gems` | `osm` | — | 70 | `local` | Disneyland Park | `soul,local` | Layer 1 default (slug → local) |
| 176 | `c742ea00-8508-455e-bdd0-bac6114e784f` | Santa Rita peak | `nature` | `wikidata` | — | 70 | `soul,local` |  |  | Rule 2 (NRHP/CHL/wikidata sig>=70 → +local) |
| 177 | `c86e8502-63fe-4928-aee9-5d1be0fbd5c6` | Museum of Photographic Arts | `art` | `wikidata` | — | 70 | `soul,local` | Balboa Park | `soul,local` | Layer 1 default (slug → soul,local) |
| 178 | `ca6f456f-d62f-426d-ac75-507a0d6ab3d3` | Kuruvungna Springs | `history` | `osm` | — | 70 | `soul,local` |  |  | Rule 4 (iconic_local/editorial_curated → +local) |
| 179 | `dd707ffc-ea20-4a45-927e-1040fdf3cd52` | San Diego Natural History Museum | `history` | `wikidata` | — | 70 | `soul,local` | Balboa Park | `soul,local` | Rule 2 (NRHP/CHL/wikidata sig>=70 → +local) |
| 180 | `df07fe5b-8164-4bb5-9227-be9cc8090bb9` | Table Mountain | `nature` | `wikidata` | — | 70 | `soul,local` |  |  | Rule 2 (NRHP/CHL/wikidata sig>=70 → +local) |
| 181 | `ed59a87f-6f5f-4752-822b-56049534bfd6` | The Chutes of San Francisco | `local_culture` | `wikidata` | — | 70 | `soul,local` |  |  | Layer 1 default (slug → soul,local) |
| 182 | `f8a60e83-061c-4f73-8ea2-59855976c76a` | Discovery Science Center | `history` | `wikidata` | — | 70 | `soul,local` |  |  | Rule 2 (NRHP/CHL/wikidata sig>=70 → +local) |
| 183 | `f952d9db-287b-4a2f-930e-5ece99fa0f31` | Santiago Peak | `nature` | `wikidata` | — | 70 | `soul,local` |  |  | Rule 2 (NRHP/CHL/wikidata sig>=70 → +local) |
| 184 | `fc697dea-5e89-48de-ae9e-d2f015913f4e` | Bowers Museum | `history` | `wikidata` | — | 70 | `soul,local` |  |  | Rule 2 (NRHP/CHL/wikidata sig>=70 → +local) |
| 185 | `15188cfd-5de2-46d7-9338-b9bc8bb11ed3` | Santa Barbara Surfing Museum | `history` | `wikidata` | — | 69 | `soul` |  |  | Layer 1 default (slug → soul) |
| 186 | `32496496-5074-4e66-9ad6-69eee988970c` | Chinese American Museum | `history` | `wikidata` | — | 69 | `soul` |  |  | Layer 1 default (slug → soul) |
| 187 | `3675de03-a7b1-4231-8e62-24efdbfc71b0` | National Steinbeck Center | `history` | `wikidata` | — | 69 | `soul` |  |  | Layer 1 default (slug → soul) |
| 188 | `3d486364-2340-4405-b314-c537cc1fe591` | Mustang Peak | `nature` | `wikidata` | — | 69 | `soul,local` |  |  | Rule 4 (iconic_local/editorial_curated → +local) |
| 189 | `461966ba-7cc6-48cf-b30e-b03e5549ee15` | Hedge Creek Falls | `nature` | `wikidata` | — | 69 | `soul,local` |  |  | Rule 4 (iconic_local/editorial_curated → +local) |
| 190 | `46ca5972-7bcd-49e6-a8e9-c57657b16f13` | El Cajon Mountain | `nature` | `wikidata` | — | 69 | `soul,local` |  |  | Rule 4 (iconic_local/editorial_curated → +local) |
| 191 | `5360eb20-5d6c-4fb6-b0fd-9c6e0ffbf152` | Second Church of Christ, Scientist | `architecture` | `wikidata` | — | 69 | `soul,local` |  |  | Layer 1 default (slug → soul,local) |
| 192 | `5bc7b23d-34a0-4fdf-aab9-7ab3f5843857` | Saint Anne Catholic Church of the Byzantine Rite | `architecture` | `wikidata` | — | 69 | `soul,local` |  |  | Layer 1 default (slug → soul,local) |
| 193 | `6042b544-3d08-4046-8d87-773baa2d59ea` | Gilroy Gardens | `local_culture` | `wikidata` | — | 69 | `soul,local` |  |  | Layer 1 default (slug → soul,local) |
| 194 | `609212f5-a07a-41e6-b347-dfbee105ad24` | Forest Lawn Memorial Park (Glendale) | `history` | `editorial` | ✓ | 69 | `soul,local` |  |  | Rule 1 (venue → +local) |
| 195 | `609f91fe-2f28-4fdf-92f9-ebbfb3d91000` | California Science Center | `history` | `wikidata` | — | 69 | `soul` | Exposition Park (Los Angeles) | `soul,local` | Layer 1 default (slug → soul) |
| 196 | `61336470-c310-46ce-9161-35ebdbcb0a31` | Norton Simon Museum | `art` | `wikidata` | — | 69 | `soul,local` |  |  | Layer 1 default (slug → soul,local) |
| 197 | `6722c968-cf83-4dc7-9a1a-fc0992230cd9` | Oceanside Museum of Art | `art` | `wikidata` | — | 69 | `soul,local` |  |  | Layer 1 default (slug → soul,local) |
| 198 | `6b3fd059-a01a-47cb-8692-abcbc462d331` | WaterWorks Park | `local_culture` | `wikidata` | — | 69 | `soul,local` |  |  | Layer 1 default (slug → soul,local) |
| 199 | `6e25e109-1273-49ef-8ed8-740d4078d941` | Mount Baden-Powell | `nature` | `wikidata` | — | 69 | `soul,local` |  |  | Rule 4 (iconic_local/editorial_curated → +local) |
| 200 | `8ccd80aa-9540-4896-8bb7-b1491a2a8e8a` | Karpeles Manuscript Library Museums | `history` | `wikidata` | — | 69 | `soul` |  |  | Layer 1 default (slug → soul) |
| — | — | **Top-200 totals** | — | — | — | — | **Soul-only: 10 · Local-only: 12 · Both: 178 · Sum: 200** | — | — | — |
