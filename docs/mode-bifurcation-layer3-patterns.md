# Mode Bifurcation Layer 3 — Pattern Clustering

**Purpose:** the curator reviews Layer 1+2 mode routing as taste clusters, one yes/no/modify decision per pattern, rather than per-row markup in `mode-bifurcation-layer3-review.md`. The patterns below cover the top-200 rows from the review export. Decisions taken here are applied by a follow-on Layer 3 migration.

**Source:** top 200 active POIs by `significance_score` desc (sig at rank 200 = 69). Corpus-wide post-Layer-1+2 distribution: Soul-only 17,041 · Local-only 835 · Both 4,059. Top-200 slice: Soul-only 10 · Local-only 12 · Both 178.

**Naming convention:** `{soul}`, `{local}`, and `{soul,local}` denote the current `narrative_modes` value. The "Suggested override" is the curator's pending call; blank or "keep" means the auto-assignment stands.

---

## Pattern 1: California Spanish missions (the 21 missions + Old Town SD)

- **Currently routes as:** `{soul,local}`
- **Row count:** 18 (covers 15 missions via Rule 1 venue + 1 mission via Rule 2 state_landmark + 1 mission via Layer 1 architecture + Old Town SD State Historic Park via Rule 1 venue)
- **Suggested override:** keep `{soul,local}` — these are top-tier dual-mode California anchors: deep Soul material (Spanish-era / Chumash / Tongva history) AND active tourist destinations.
- **Examples (up to 5):**
  - Mission San Miguel Arcángel (sig 93, source: state_landmark, parent: standalone)
  - Mission San Buenaventura (sig 92, source: editorial, parent: standalone, venue)
  - Mission San Diego de Alcalá (sig 84, source: editorial, parent: standalone, venue)
  - Misión San Gabriel Archángel (sig 88, source: osm, parent: standalone)
  - Mission San Rafael Arcángel (sig 76, source: state_landmark, parent: standalone)
- **Notes:** Mission Chumash Barracks (rank 161) is handled in Pattern 8 (editorial historic sites — different curatorial frame, gets its own line because it's a curator-authored editorial row, not a venue).

## Pattern 2: Theme-park parent venues (Disney/Universal/Six Flags/Knott's/Legoland)

- **Currently routes as:** `{soul,local}` (via Layer 1 default — local_culture slug → `{soul,local}`)
- **Row count:** 7 (6 active CA theme parks + Marine World/Africa USA historical)
- **Suggested override:** trim to `{local}` — these are pure wayfinder destinations. Soul depth is in the surrounding area (covered by the addendum's "+Local Color" framing or by region narration); the park rows themselves shouldn't surface in Soul mode.
- **Examples:**
  - Disneyland Park (sig 79, source: editorial, parent: standalone, venue)
  - Universal Studios Hollywood (sig 77, source: editorial, parent: standalone, venue)
  - Knott's Berry Farm (sig 71, source: editorial, parent: standalone, venue)
  - Six Flags Magic Mountain (sig 76, source: editorial, parent: standalone, venue)
  - Marine World/Africa USA (sig 90, source: wikidata, parent: standalone)
- **Notes:** Marine World/Africa USA is historical (closed); curator may want a separate disposition (`{local}` with note vs. drop from catalog).

## Pattern 3 (SPECIAL a): Theme-park ride / sub-area children — handling decision required

- **Currently routes as:** `{local}` (all 8 rows; mix of Rule 3 override and Layer 1 hidden_gems default)
- **Row count:** 8 (6 Disney + 1 Universal + Avengers Campus/Cars Land as themed sub-areas)
- **Suggested override:** **do not propose a literal mode value here.** Three handling options for the curator to pick from before Layer 3 applies:
  - **(i) Copy parent's modes to children (one-time sync)** — propagates `{soul,local}` from the venue parent down. Children inherit the dual-mode treatment. Simplest but undermines the §15 split inside the venue (parent has soul context like "Disneyland opened 1955"; children don't).
  - **(ii) Null children's `narrative_modes`** — children sit outside the Soul/Local routing entirely because `trip_mode='venue_tour'` (per addendum) handles them inside the polygon. This is the cleanest in spirit but requires nulling 8 rows now AND deciding how the CHECK constraint handles `{}` (allowed per `<@` subset, currently 0 active POIs sit there).
  - **(iii) Write a Rule 6 migration enforcing parent/child consistency going forward** — adds a constraint/trigger that auto-syncs children to parents on insert/update. Forces consistency for all future theme-park children but is a bigger commitment.
- **Examples:**
  - Grizzly River Run (sig 100, source: osm, parent: Disney California Adventure Park)
  - Sleeping Beauty Castle (sig 84, source: wikidata, parent: Disneyland Park)
  - Jurassic World-The Ride (sig 80, source: osm, parent: Universal Studios Hollywood)
  - Avengers Campus (sig 82, source: wikidata, parent: Disneyland Park) — themed sub-area, not a ride
  - Cars Land (sig 81, source: wikidata, parent: Disney California Adventure Park) — themed sub-area
- **Notes:** option (ii) composes best with the existing Venue Tour design ([docs/venue-tour-design.md](venue-tour-design.md)) — but Venue Tour is itself v1.1+ scope, so this is forward-looking. Recommend curator picks **before** Layer 3 migration; the pick affects what the migration does to these 8 rows (sync / null / leave-for-trigger).

## Pattern 4: National Park children (Yosemite / Sequoia / Death Valley sub-features)

- **Currently routes as:** `{soul,local}` (via Rule 2 — all wikidata sig≥70)
- **Row count:** 4
- **Suggested override:** trim to `{soul}` — these are pure Soul-mode landforms; the National Park itself carries the dual-mode framing (NP is a tourist destination). Sub-features are Soul material.
- **Examples:**
  - Mount Watkins (sig 82, source: wikidata, parent: Yosemite National Park)
  - Mount Whitney (sig 80, source: editorial, parent: Sequoia National Park)
  - Needle Peak (sig 79, source: wikidata, parent: Death Valley National Park)
  - Emerald Pool (sig 73, source: wikidata, parent: Yosemite National Park)
- **Notes:** Mount Whitney is `editorial` (Rule 4) not `wikidata` (Rule 2), but the National-Park-child shape is the same. Composes with Pattern 6 (Wikidata mountains) — National Park children are a subset where parent context tips the call.

## Pattern 5: Museum-complex children (Balboa Park, Exposition Park)

- **Currently routes as:** `{soul,local}` (8 rows) + `{soul}` (1 row — California Science Center at sig 69, missed Rule 2 cutoff)
- **Row count:** 9
- **Suggested override:** trim to `{local}` — museums inside a museum complex are pure Local-mode destinations; the complex itself (Balboa Park, Exposition Park) carries any dual-mode framing.
- **Examples:**
  - San Diego Museum of Art (sig 72, source: wikidata, parent: Balboa Park)
  - San Diego Air & Space Museum (sig 72, source: wikidata, parent: Balboa Park)
  - Museum of Photographic Arts (sig 70, source: wikidata, parent: Balboa Park)
  - San Diego Natural History Museum (sig 70, source: wikidata, parent: Balboa Park)
  - California Science Center (sig 69, source: wikidata, parent: Exposition Park (Los Angeles))
- **Notes:** Balboa Park Gardens (rank 72, nature slug, sig 79) sits in the same complex but is a gardens not a museum — could go either way. The "trim to local" call extends if curator agrees Balboa Park's outdoor gardens are also wayfinder content.

## Pattern 6: Wikidata-named California mountains / peaks / lakes / falls

- **Currently routes as:** `{soul,local}` (via Rule 2 — wikidata sig≥70 promotion)
- **Row count:** 38 (Pattern 10's pool minus 4 National Park children = 38 standalone)
- **Suggested override:** trim to `{soul}` — Wikidata mountains are pure Soul-doctrine landforms, not Local-mode utilities. Rule 2's wikidata+sig≥70 condition is too permissive for the nature slug.
- **Examples:**
  - Black Hill (sig 87, source: wikidata, parent: standalone)
  - Verdi Peaks (sig 86, source: wikidata, parent: standalone)
  - Cerro San Luis Obispo (sig 78, source: wikidata, parent: standalone)
  - Mossbrae Falls (sig 71, source: wikidata, parent: standalone)
  - Mount Lukens (sig 76, source: wikidata, parent: standalone)
- **Notes:** the broader Rule 2 condition `source_type IN (nrhp, state_landmark, wikidata) AND sig≥70` was reasonable for history slug (where wikidata signals genuine landmark status) but over-fires for nature. If curator agrees, a Rule 2 tightening to `(source_type IN (nrhp, state_landmark)) OR (source_type = wikidata AND slug NOT IN (nature, geology))` would prevent this class going forward (separate concern from Layer 3 override).

## Pattern 7: Editorial-curated geological landforms

- **Currently routes as:** `{soul,local}` (via Rule 4)
- **Row count:** 13
- **Suggested override:** trim to `{soul}` — these are pure Soul-doctrine landforms. Local mode wouldn't surface "Painted Dunes" or "Bumpass Hell" — they're sights to see in Soul mode, not destinations to navigate to in Local mode.
- **Examples:**
  - Devils Postpile National Monument (sig 82, source: editorial, parent: standalone)
  - Coso Volcanic Field & Red Hill (sig 84, source: editorial, parent: standalone)
  - Alabama Hills (sig 82, source: editorial, parent: standalone)
  - San Andreas Fault — Palmdale Roadcut (sig 85, source: editorial, parent: standalone)
  - Fossil Falls (sig 80, source: editorial, parent: standalone)
- **Notes:** edge case is Mount Whitney (rank 56, editorial, geology) — it IS a Local destination (climbers / drive-up viewing) AND a Soul anchor. Could be kept as `{soul,local}` per Pattern 4 logic. Trona Pinnacles appears twice (ranks 66, 107) — same dedup concern as Walk of Fame, separate from routing.

## Pattern 8: Editorial-curated historic sites (Manzanar class)

- **Currently routes as:** `{soul,local}` (via Rule 4)
- **Row count:** 15
- **Suggested override:** keep `{soul,local}` — these are genuinely dual-mode: top Soul material AND active tourist destinations.
- **Examples:**
  - Manzanar National Historic Site (sig 95, source: editorial, parent: standalone)
  - Owens Lake (Patsiata) (sig 92, source: editorial, parent: standalone)
  - Edwards Air Force Base (sig 90, source: editorial, parent: standalone)
  - Cerro Gordo Silver Mines (sig 88, source: editorial, parent: standalone)
  - Vasquez Rocks (sig 84, source: editorial, parent: standalone)
- **Notes:** also includes Mojave Air & Space Port, Randsburg, Naval Air Weapons Station China Lake, 1872 Lone Pine Earthquake Monument, Freeman Junction, Mojave, Garlock (ghost town), Mission Chumash Barracks, Kuruvungna Springs. Camp Independence / Fort Independence Reservation is in here too.

## Pattern 9: Editorial-curated nature features

- **Currently routes as:** `{soul,local}` (via Rule 4)
- **Row count:** 7
- **Suggested override:** split — Ancient Bristlecone keeps `{soul,local}` (it IS a destination); the rest probably trim to `{soul}`.
- **Examples:**
  - Ancient Bristlecone Pine Forest (sig 88, source: editorial, parent: standalone) — likely keep dual-mode
  - Kennedy Meadows (sig 73, source: editorial, parent: standalone) — likely `{soul}`
  - Little Lake (sig 71, source: editorial, parent: standalone) — likely `{soul}`
  - El Cajon Mountain (sig 69, source: editorial, parent: standalone) — likely `{soul}`
  - Mount Baden-Powell (sig 69, source: editorial, parent: standalone) — likely `{soul}`
- **Notes:** Mustang Peak + Hedge Creek Falls round out the 7. If curator wants per-row treatment, these 7 can go to "Ungrouped specific cases" below; the split call here isn't clean.

## Pattern 10: State landmark historic homes and buildings

- **Currently routes as:** `{soul,local}` (via Rule 2)
- **Row count:** 14
- **Suggested override:** keep `{soul,local}` — California state landmarks are designated precisely because they're both narrative anchors AND tour-worthy destinations.
- **Examples:**
  - California State Capitol (sig 85, source: state_landmark, parent: standalone) — actually in Pattern 16 (architecture slug)
  - Drum Barracks (sig 82, source: state_landmark, parent: standalone)
  - Whaley House (sig 71, source: state_landmark, parent: standalone)
  - Winchester Mystery House (sig 71, source: state_landmark, parent: standalone)
  - Gamble House (sig 71, source: state_landmark, parent: standalone)
- **Notes:** also includes Dallidet Adobe, Fremont Peak, Frog Woman Rock, Forestiere Underground Gardens, Forbes Mill. Plus three lighthouses spun out into Pattern 11 below.

## Pattern 11: Lighthouses and iconic engineering crossings

- **Currently routes as:** `{soul,local}` (via Rule 2 state_landmark)
- **Row count:** 4
- **Suggested override:** keep `{soul,local}` — lighthouses are both Soul anchors (maritime history) and tour destinations.
- **Examples:**
  - Old Point Loma Lighthouse (sig 72, source: state_landmark, parent: standalone)
  - Pigeon Point Lighthouse (sig 70, source: state_landmark, parent: standalone)
  - Point San Luis Light (sig 79, source: wikidata, parent: standalone) — architecture slug, but lighthouse-shaped
  - Golden Gate Bridge (sig 77, source: state_landmark, parent: standalone) — engineering crossing, same dual-mode shape
- **Notes:** stable cluster, no edge cases.

## Pattern 12: Wikidata standalone history museums

- **Currently routes as:** `{soul,local}` (via Rule 2 — wikidata sig≥70)
- **Row count:** ~10
- **Suggested override:** trim to `{local}` — museums are Local-mode destinations primarily.
- **Examples:**
  - La Brea Tar Pits (sig 72, source: wikidata, parent: standalone)
  - San Diego Air & Space Museum (sig 72) — also in Pattern 5 (Balboa Park child)
  - Museum of Death (sig 73, source: wikidata, parent: standalone)
  - Autry Museum of the American West (sig 71, source: wikidata, parent: standalone)
  - Bowers Museum (sig 70, source: wikidata, parent: standalone)
- **Notes:** also includes Morro Bay Maritime Museum, Monterey Museum of Art, Discovery Science Center. La Brea Tar Pits is arguably dual-mode (it's a famous Soul anchor too) — possible per-row override.

## Pattern 13: Wikidata civic / fire-station buildings

- **Currently routes as:** `{soul,local}` (via Rule 2 — wikidata sig≥70)
- **Row count:** 7
- **Suggested override:** trim to `{soul}` — nobody navigates TO a fire station as a Local destination. These are roadside Soul context only.
- **Examples:**
  - Fire Station No. 23 (sig 80, source: wikidata, parent: standalone)
  - Engine Company No. 28 (sig 77, source: wikidata, parent: standalone)
  - Santa Ana Fire Station Headquarters No. 1 (sig 80, source: wikidata, parent: standalone)
  - Oceanside City Hall and Fire Station (sig 81, source: wikidata, parent: standalone)
  - Korean Bell of Friendship (sig 71, source: wikidata, parent: standalone)
- **Notes:** also Armenian Genocide Martyrs Monument. These rows are surfacing high because Wikidata sig signals (cross-source / pageviews) overshoot what should be a sub-70 floor.

## Pattern 14: Standalone wikidata art museums

- **Currently routes as:** `{soul,local}` (via Layer 1 art-slug default)
- **Row count:** 9
- **Suggested override:** trim to `{local}` — same logic as Pattern 12 (museums = Local-mode destinations).
- **Examples:**
  - Museum of Contemporary Art San Diego (sig 87, source: wikidata, parent: standalone)
  - The Broad (sig 75, source: wikidata, parent: standalone)
  - Museum of Contemporary Art, Los Angeles (sig 75, source: wikidata, parent: standalone)
  - Los Angeles County Museum of Art (sig 72, source: wikidata, parent: standalone)
  - Norton Simon Museum (sig 69, source: wikidata, parent: standalone)
- **Notes:** also includes SLOMA, Museum of Latin American Art, Laguna Art Museum, Santa Barbara Museum of Art, Oceanside Museum of Art. Bas Relief II (rank 95, OSM art at sig 75) is an outlier — a public sculpture, not a museum; goes to "Ungrouped" below.

## Pattern 15: Standalone amusement / boardwalk / water parks

- **Currently routes as:** `{soul,local}` (via Layer 1 local_culture default)
- **Row count:** 15
- **Suggested override:** trim to `{local}` — these are pure Local-mode destinations.
- **Examples:**
  - Santa Monica Pier (sig 100, source: wikidata, parent: standalone)
  - Pacific Park (sig 80, source: wikidata, parent: standalone) — the rides on Santa Monica Pier
  - Adventuredome (sig 80, source: wikidata, parent: standalone) — Vegas-Strip indoor park
  - Confusion Hill (sig 79, source: wikidata, parent: standalone)
  - Belmont Park (sig 74, source: wikidata, parent: standalone)
- **Notes:** also Children's Fairyland, San Francisco Dungeon, Six Flags Hurricane Harbor Concord, Raging Waters, Gilroy Gardens, WaterWorks Park, The Pike, Japanese Village and Deer Park, The Chutes of San Francisco, Idora Park, Adventure City. Santa Monica Pier (rank 1) is the edge case — it's a Soul-anchor LA landmark too, possible per-row override to keep `{soul,local}`.

## Pattern 16: Iconic California architecture (civic + landmark)

- **Currently routes as:** `{soul,local}` (via Layer 1 architecture default)
- **Row count:** ~9 (architecture slug, civic/landmark shape)
- **Suggested override:** keep `{soul,local}` — these are dual-mode California icons.
- **Examples:**
  - California State Capitol (sig 85, source: state_landmark, parent: standalone)
  - Getty Center (sig 80, source: editorial, parent: standalone, venue)
  - Getty Villa (sig 82, source: editorial, parent: standalone, venue)
  - LA Aqueduct — Jawbone Siphon (sig 88, source: editorial, parent: standalone)
  - Balboa Park (sig 79, source: editorial, parent: standalone, venue) — architecturally listed; also the museum-complex container
- **Notes:** Wayfarers Chapel (rank 44, NRHP architecture) fits here too.

## Pattern 17: Architecture — infrastructure (wind / solar / aqueduct)

- **Currently routes as:** `{soul,local}` (via Layer 1 architecture default)
- **Row count:** 2
- **Suggested override:** trim to `{soul}` — wind farms and solar fields aren't Local-mode utilities; people don't navigate TO them. Soul-only fits the engineering-narrative framing.
- **Examples:**
  - Tehachapi—Mojave Wind Resource Area (sig 80, source: editorial, parent: standalone)
  - Solar Star Solar Project (sig 73, source: editorial, parent: standalone)
- **Notes:** LA Aqueduct Jawbone Siphon (rank 16) is technically infrastructure but is currently in Pattern 16 with the iconic-architecture cluster. Could move to here for consistency or keep as iconic per curator taste.

## Pattern 18: Sub-70 wikidata churches (architecture)

- **Currently routes as:** `{soul,local}` (via Layer 1 architecture default)
- **Row count:** 2
- **Suggested override:** trim to `{soul}` (or drop entirely via Layer 3) — these barely surfaced (sig 69, well below the architecture floor of 90); they're appearing in top 200 only because of the raw-significance sort.
- **Examples:**
  - Second Church of Christ, Scientist (sig 69, source: wikidata, parent: standalone)
  - Saint Anne Catholic Church of the Byzantine Rite (sig 69, source: wikidata, parent: standalone)
- **Notes:** these would be filtered out at runtime by the per-category significance floor (architecture=90) so the routing decision is somewhat academic — but documenting for completeness.

## Pattern 19: OSM-sourced historic buildings (Soul-only)

- **Currently routes as:** `{soul}` (via Layer 1 history default; OSM doesn't qualify for Rule 2 promotion)
- **Row count:** 5
- **Suggested override:** keep `{soul}` — these are already correctly Soul-only. OSM tagging at sig 70-75 without cross-source validation doesn't make them Local-grade.
- **Examples:**
  - Fire Control Station (sig 75, source: osm, parent: standalone)
  - Jack House (sig 75, source: osm, parent: standalone)
  - Faith Mission (sig 75, source: osm, parent: standalone)
  - Andalucia Building (sig 75, source: osm, parent: standalone)
  - Mess Hall (sig 70, source: osm, parent: standalone)
- **Notes:** spot-check whether any of these are actually significant California landmarks that deserve dual-mode (the names suggest mostly local-named OSM imports without national-register status). If curator finds one that IS significant, per-row override.

## Pattern 20 (SPECIAL b): Sub-70 wikidata museums — the Karpeles class

- **Currently routes as:** `{soul}` (Layer 1 default, no Layer 2 rule fired; Rule 2 requires sig≥70 cutoff which they juuust miss at sig 69)
- **Row count:** 5 (all in top 200; **same shape almost certainly exists below the top-200 cutoff**)
- **Suggested override:** **flag as v1.1 gap.** These are legitimate California cultural museums sitting at Soul-only because of a clean threshold miss. Karpeles class.
- **Examples:**
  - Karpeles Manuscript Library Museums (sig 69, source: wikidata, parent: standalone)
  - Santa Barbara Surfing Museum (sig 69, source: wikidata, parent: standalone)
  - Chinese American Museum (sig 69, source: wikidata, parent: standalone)
  - National Steinbeck Center (sig 69, source: wikidata, parent: standalone)
  - California Science Center (sig 69, source: wikidata, parent: Exposition Park (Los Angeles)) — also in Pattern 5
- **Notes per spec:** **do NOT propose a Rule 5 here** — that decision is parked. Surface for curator awareness with two facts:
  1. These 5 rows should probably route as `{local}` (museum-shape decision per Patterns 5/12/14).
  2. The same threshold-miss shape exists below rank 200 — every wikidata museum at sig 60-69 will be Soul-only. A future Rule 5 or a Rule 2 threshold relaxation (sig≥65 for museums) would fix the class; that's v1.1 scope.

---

## Ungrouped specific cases

Rows that don't cluster cleanly under the patterns above. These become per-row overrides at Layer 3 migration time.

- **Walk of Fame (rank 2, sig 100, osm/hidden_gems, `{local}`)** — surfaces alongside Hollywood Walk of Fame (rank 4, sig 99, wikidata/history, `{soul,local}`). Same place, two records — dedup failure already in [docs/data-quality-issues.md](data-quality-issues.md). Routing decision pending dedup; both rows probably keep their respective modes until the merge.
- **Hollywood Sign (rank 5, sig 95, editorial/local_culture, `{soul,local}`)** — iconic LA dual-mode landmark. Already in Layer 1 default (local_culture). Keep as-is.
- **Mammoth Mountain Ski Area (rank 62, sig 80, editorial/recreation, `{local}`)** — sole `recreation` slug row in top 200. Could be `{soul,local}` since Mammoth Mountain is both a ski resort (Local) and a volcanic landform (Soul). Per-row override candidate.
- **NRHP rows surfacing via Rule 2 (Kelso Depot rank 159, Golden Gate Park rank 166, both sig 70, source: nrhp, `{soul,local}`)** — NRHP nature/history landmarks; keep `{soul,local}` per state-landmark logic in Pattern 10.
- **Bas Relief II (rank 95, sig 75, osm/art, `{soul,local}`)** — public sculpture, not a museum. Layer 1 default for art was `{soul,local}`. Murals/sculptures can read either way; per-row override possible.
- **Table Games / Slots (ranks 169, 170, sig 70, osm/hidden_gems, `{local}`)** — OSM bulk-imported casino sub-features with no parent venue. Routing-decision-irrelevant; these are data-cleanup candidates (drop or merge into a parent) more than routing decisions.
- **Forest Lawn Memorial Park (Glendale) (rank 194, sig 69, editorial/history, venue, `{soul,local}`)** — venue=true, Rule 1 fired. Keep `{soul,local}` (cemetery is a destination and Soul anchor).
- **Cars Land / Avengers Campus (ranks 48, 34)** — covered by Pattern 3 special handling, mentioned here for cross-reference since they're the local_culture themed sub-areas vs. the hidden_gems ride children.

---

**Summary stats:**
- 18 patterns + 2 special clusters (Pattern 3 theme-park children, Pattern 20 Karpeles class) = 20 patterns total
- ~190 of 200 rows covered by a pattern; ~10 rows in Ungrouped specific cases
- Largest pattern: Wikidata mountains/peaks (Pattern 6, 38 rows) — single biggest curator decision
- Smallest patterns: 2 rows (Patterns 17, 18) — fold into ungrouped if curator prefers

End of pattern doc. Curator review in chat; once decisions are settled, a follow-on Layer 3 migration applies overrides.
