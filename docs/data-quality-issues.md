# Data quality issues — manual review backlog

POI source-data problems that automatic dedup cannot safely resolve. Each entry below should land in the `poi_review_queue` table when Phase 6 (admin review) is wired up.

## Mission Soledad Museum vs Mission Nuestra Señora de la Soledad

- **POIs:**
  - `state_landmark` `"Mission Nuestra Señora de la Soledad"` — the actual mission compound
  - `osm` `"Mission Soledad Museum"` — a separate museum building 13 m away on the same property
  - `nrhp` `"Mission Nuestra Senora de la Soledad Historic District"` — the surrounding historic district, 3.5 km away
- **Status:** all three are *real, distinct* features. Auto-merge would collapse the museum and the historic district into the mission, losing real data.
- **Resolution:** address via Venue Tour parent-child relationship in a future iteration. The mission is the parent; museum + historic district are sub-features. None should be `merged_into` the others.

## Mission San José — NRHP entry at wrong coordinates

- **POIs (all normalize to `"mission san jose"`):**
  - `state_landmark` (37.53393, −121.92005) — correct location, Mission San José in Fremont
  - `wikidata` (37.53280, −121.91900) — also correct, 156 m from state_landmark (already merged into it via Phase 2)
  - `nrhp` (37.54827, −121.98857) — **6.2 km away from the actual mission**
- **Status:** the NRHP coordinates are wrong. The NRHP listing record points at a location that is not the historical mission site. Likely a transcription error in the NRHP source XLSX or a bad geocode fallback during import.
- **Resolution:** human verification needed. Either correct the coordinates (look up the NRHP reference number and re-geocode against the official address), or flag the row as `verified=false` and exclude until reviewed.

## "Mission San Fernando Rey de Convento Building" is the Avila Adobe in downtown LA

- **POIs (normalized names differ):**
  - `state_landmark` `"Mission San Fernando Rey de España"` (34.27310, −118.46120) — the actual mission in San Fernando Valley
  - `nrhp` `"Mission San Fernando Rey de Convento Building"` (34.05369, −118.24277) — 31 km away in downtown LA, at the location of the **Avila Adobe** on Olvera Street
- **Status:** the NRHP record is misnamed. The Avila Adobe (built 1818) is the oldest surviving residence in Los Angeles, but it is *not* the mission. NRHP appears to have classified it under the mission's namesake.
- **Resolution:** rename the NRHP row to its correct name ("Avila Adobe" or whatever its NRHP listing actually calls it) and recategorize. Should not merge with the mission; should remain as a distinct historical structure.

---

## Out of scope for the auto-dedup pipeline

These are upstream source-data issues, not bugs in `dedupe.ts`. The dedup rules correctly leave them alone:
- The 50 m fuzzy pass and 2 km name-collapse pass both require name+location agreement
- Phase 2 specifically uses *exact normalized name match* to prevent merging genuinely-different things that share a partial name (which is what happens with the Avila Adobe case)

When Phase 6 (`poi_review_queue` admin app) is built, seed it with these three rows and any others discovered during future imports.

## Phase 2 Findings (Tracked, Not Blocking)

### Walk of Fame Canonical Merge
- Two surviving rows: OSM medoid (#5, sig=100, addl=40) and Wikidata canonical "Hollywood Walk of Fame" (#9, sig=80, addl=5)
- 1,240m apart, exact-name match misses
- Resolution: manual SQL merge — pick Wikidata as primary, fold OSM cluster as secondary, transfer addl_sources

### Misión↔Mission Language Variants
- Example: "Misión San Gabriel Archángel" (OSM) vs "Mission San Gabriel Arcángel" (state_landmark)
- Normalization treats them as distinct
- Resolution: add Misión→Mission and Archángel→Arcángel equivalence to normalizeName before next dedup run
- Audit needed: count all such pairs across the dataset before committing the rule

### Disney/Universal Rides at Top of Significance
- #1 Grizzly River Run (sig=100), #10 Jurassic World—The Ride (80), #14 Big Thunder Mountain (70), #16 Davy Crockett Explorer Canoes (70), #23 Shooting Exposition (70)
- These outrank Hollywood Sign and Mission San Miguel Arcángel
- Resolution: Venue Tour parent-child hierarchy (future). Children inside venue polygons should be suppressed from drive-by triggers.
