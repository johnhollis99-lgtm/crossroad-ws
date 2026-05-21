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

### Manzanar / Edwards AFB / Vasquez Rocks duplicate rows with inconsistent editorial_curated
- Surfaced during Mode Bifurcation Layer 3 recon (2026-05-21). Each real-world place has multiple `pois` rows; `editorial_curated` is inconsistent across the dupes:
  - **Manzanar National Historic Site** — 2 rows, both `source_type='editorial'`, both `slug='history'`, both NOT venue, both no parent. One curated=TRUE, the other curated=FALSE.
  - **Edwards Air Force Base** — same shape: 2 rows, both `source_type='editorial'`, both history, one curated=TRUE, one curated=FALSE.
  - **Vasquez Rocks** — 3 rows: editorial-history-TRUE (the primary editorial seed), nrhp-history-FALSE (NRHP listing of the historic property), osm-nature-FALSE (OSM rock-formation tag). Mixed slug — the nature row could plausibly be a distinct rock-formation feature; the nrhp + editorial-history rows are dupes of each other.
- **Routing impact:** the Mode Bifurcation framework operates per-row, so the curated copy lands in Bucket C-promoted `{soul,local}` while the uncurated copy lands at Bucket C-default `{local}`. Same real-world place surfacing with mismatched modes.
- **Resolution:** real fix is dedup via the `merged_into` mechanism — pick the editorial-curated row as primary, merge the duplicates into it, transfer `additional_sources`. Phase A 50m spatial pass missed these because the dupes were already separated by source-type during initial import; Phase B name-collapse may catch some on the next dedup run, but the Vasquez nature-slug row is a separate decision. Backlog.

---

## Phase 4 carry-forward (2026-05-07 — post-NRHP-fixup pipeline)

Captured after the dedup → classify-children → recompute-significance chain that followed the NRHP coordinate fixup. 238 merges committed, 51 new children attached (all 75 venues retroactively scoped), 21,906 active POIs after.

### Immediate next session

1. **Audit `cache/nrhp-fixup/spot-check-50-100km.json`** — 28 rows applied in the 50–100 km move bucket. Verify none are ArcGIS errors before letting them ride.
2. **Phase 5 — NRHP importer rewire:** ArcGIS-up-front (replace the Nominatim-first / county-centroid-fallback flow), plus a generic geocoder precision validator usable for CHL and narrative-extracted candidates.

### New issues from this session

3. **Star of India needs an editorial venue.** Active `state_landmark` row (id `39c4eba7-eaac-4193-9625-51b7f4eb7465`) absorbed NRHP + OSM siblings (xs=20, post-recompute score=64). World's oldest active sailing ship — deserves a curated venue with a polygon and a hooked Wikidata QID for pageview attribution. Add to `seed-venues.ts`.
4. **Cabrillo National Monument should be a venue (`venue_type='national_park'`).** Currently active `state_landmark` (id `f6bc6e3e-f5d8-4ec8-bda5-0f4e42dc2cbd`, score=40). It's a real NPS unit and would naturally parent Old Point Loma Lighthouse (already at score 72 with xs=30) plus several NRHP sub-features.
5. **Mission San Fernando Rey de España still has no editorial venue.** Already in `venue_classification_review` queue awaiting manual polygon-draw. NRHP "...Convento Building" entry actually points at the Avila Adobe (see "Avila Adobe" issue above) — these are separate problems.
6. **Mission San Buenaventura: 5 nearby variants didn't auto-collapse.** All have similar name forms ("...and Mission Compound Site", etc.) within 2 km. Belongs in the v2 mission-grounds + name-alias session below.

### v2 scope (next phase, not next session)

7. **Nested-venue design.** Cases the current 1-level parent/child model can't represent:
   - Mission Dolores Cemetery inside Mission San Francisco de Asís grounds
   - Multiple museums inside Balboa Park
   - Watts Towers inside the Watts Towers Arts Center
   - Neptune Pool inside Hearst Castle
   - Plus the inverse problem from #6: known mission-name variants that should collapse via aliases (Misión↔Mission, Archángel↔Arcángel, "...Convento Building" / "...Compound Site" / "...Historic District" suffixes when geographically close).
8. **Mission grounds polygons.** Replace `osm_buffered_25m` placeholder polygons on the two missions where it's currently used; broader audit needed on the other 15 (current polygons may under- or over-cover the actual grounds).
9. **Walk of Fame canonical merge** (carry-over from Phase 2 findings above — still unresolved).
10. **Missing missions.** Editorial venue rows still absent for: San Fernando Rey de España (#5 above), San Gabriel Arcángel, San Miguel Arcángel, San Rafael Arcángel. All four are in `venue_classification_review` awaiting manual polygons.
