# RoadStory — Unified Roadmap & Conflict Resolution

**Status:** Active planning document (v1.0, dated this session)
**Audience:** Human curator (founder), build chats, anyone picking up the project after a pause
**Purpose:** Reconcile the **Narration & Curation Addendum** with all other pending work, identify conflicts, and lay out a single execution order.

---

## 0. TL;DR

There are **four** active design documents and **one** PDF handoff. They were written at different times. The most recent → the Narration & Curation Addendum → invalidates parts of two of them (the Narration Engine prompt and the Narrator Picker prompt in the UI/UX handoff) and adds new work that must sequence carefully with the POI pipeline and the Venue Tour migration.

**The good news:** no work already shipped becomes wrong. Existing data migrates forward cleanly. Existing UI screens get refit, not rebuilt.

**The bad news:** two of the UI handoff prompts (06 Narration Engine, 10 Narrator Picker) are now stale and need rewriting before they're run by the build chat.

This document gives you the full picture, the conflict list, and the order to do everything in.

---

## 1. Pending Work Inventory (All Sources)

Here is everything that is *planned but not done* across all four design docs, with origin and current status.

### 1.1. POI Data Pipeline (`roadstory-poi-pipeline-prompts.md`)

| Phase | Scope | Status |
|---|---|---|
| Phase 0 | Context loading — re-read at session start | Recurring |
| Phase 1 | Schema migration for source provenance (`source_type`, `source_id`, `confidence_score`, etc.) | Likely complete (foundation for everything else) |
| Phase 2 | ETL scaffolding (`scripts/poi-import/lib/`, `scripts/poi-import/sources/`, run.ts CLI) | Likely complete or in progress |
| Phase 3a | OSM importer (Overpass API, whitelist tags) | Pending |
| Phase 3b | Wikidata importer (SPARQL + Wikipedia REST) | Pending |
| Phase 3c | NRHP importer | Pending |
| Phase 3d | California Historical Landmarks (CHL) importer | Pending |
| Phase 3e | USGS GNIS importer (optional, lower priority) | Pending |
| Phase 4 | Dedup and merge | Pending |
| Phase 5 | Significance recompute (cross-source, Wikipedia pageviews, route adjacency) | Pending |
| Phase 6a | Narrative extraction schema (`poi_review_queue`) | Pending |
| Phase 6b | Document ingestion (WPA Guide, CDNC, Bancroft) | Pending |
| Phase 6c | LLM extraction (Haiku 4.5) | Pending |
| Phase 6d | Verification pass (stronger model) | Pending |
| Phase 6e | Admin review UI | Pending |
| Phase 7 | Lazy narration cache (not bulk) | Partially implemented per SKILL.md references |

### 1.2. Venue Tour (`venue-tour-design.md`)

| Phase | Scope | Status |
|---|---|---|
| V1 | Schema migration (parent/child, is_venue, venue_polygon), classifier algorithm, venue seed for ~80 CA venues, backfill, RPC updates (`get_venue_tour_pois`, `detect_venue_at_location`, `get_nearby_pois` update) | Pending — blocker for all future imports |
| V2 | Update OSM/Wikidata/NRHP/CHL importers to call `classifyPOI()` | Pending — blocker for Santa Barbara + Ventura imports |
| V3 | Venue tour prompt templates (Family/Ride Along first), UI mode detection | Pending — blocker for app launch |
| V4 | Admin polygon drawing, venue review queue, classification override UI | Pending — blocker for scaling beyond CA |
| V5 | International venue catalog, multi-language venue support | Long-term |

### 1.3. UI / UX Handoff (`XRoad_ui_ux_CD_PDF.pdf`)

The handoff is structured as numbered prompts. Phases 1–2 are foundation. Phase 3 is screen refits. Codebase already has working screens; prompts rewrite the bodies.

| Prompt | Scope | Status |
|---|---|---|
| 01 | Codebase audit + alignment plan | Likely complete |
| 02 | Design tokens (paper/ink/accent/forest palette) | Likely complete |
| 03 | Core components library | Likely complete or in progress |
| 04 | Supabase + PostGIS schema + RPCs | In progress (per existing migrations) |
| 05 | WebSocket server (Node.js + Socket.io, rooms, events) | Pending or partial |
| **06** | **Narration engine (LLM + ElevenLabs) → uses old four-narrator model** | **STALE → see §2.1** |
| 07 | Mapbox styles (driving-light, driving-dark, hiking) | Partial — needs human Studio work |
| 08 | Onboarding (audience mode picker) | Likely complete |
| 09 | Home / Trip setup | Likely complete |
| **10** | **Narrator picker → four cards (Professor / Local / Junior Ranger / Truck Driver)** | **STALE → see §2.2** |
| 11 | Driving page | Likely complete |
| 12 | Hiking page | Likely complete |
| 13 | City sightseeing (radar tap-to-hear) | Likely complete |
| 14 | Trip Summary | Pending |
| 15 | (missing in scan — possibly Settings) | Unknown |
| 16 | Group features (live map, single narrator mode, voice chat) | Pending |

### 1.4. Narration & Curation Addendum (`roadstory-narration-curation-addendum.md`)

| Section | Scope | Status |
|---|---|---|
| §2 | Significance floor (70 default, per-category overrides) | Locked, pending implementation |
| §3 | Phase 7 — Regions (USGS + EPA + Native Land + Wikidata polygons) | Locked, pending implementation |
| §4 | Per-POI intrinsic depth weight (brief/standard/long) | Locked, pending implementation |
| §5 | Two-narrator model (replaces four) | Locked, pending naming + implementation |
| §6 | Pace setting (Full Drive / Light Touch) | Locked, pending implementation |
| §7 | Cultural Fabric bar + resonance score | Locked, pending implementation |
| §8 | Iconic Local Override + free-tier sources | Locked, pending implementation |
| §9 | Skip / Tell Me More + 3 reports + `narration_plays` table | Locked, pending implementation |
| §10 | Lookahead queue (the integrated ranking pipeline) | Locked, pending implementation |

### 1.5. SKILL.md Open Questions

These are flagged in SKILL.md and remain unresolved:

- Content accuracy QA process before community feedback reaches scale
- International / multilingual expansion timeline
- Kids mode sub-tiers by age (5yo vs 11yo)
- Unfiltered mode content boundary documentation (explicit "what's out" list)
- Self-hosted TTS evaluation at scale (>10k users OR >$500/mo TTS spend)

### 1.6. UI Handoff "Deliberately Not" List

These are out of v1 scope but worth tracking:

- Push notifications — v1.5
- CarPlay / Android Auto — v2
- Multilingual — v2
- Sponsored "tasteful recommendations" (monetization layer)
- AR overlay — long-term

---

## 2. Conflict Analysis

The addendum was written in isolation from the existing UI handoff and POI pipeline. Most of it composes cleanly. Two pieces don't. Three more need synchronization.

### 2.1. ⚠️ CONFLICT: UI Handoff Prompt 06 (Narration Engine) is stale

**The old plan (UI handoff Prompt 06) says:**
- 4 audience × 3 depth × **4 narrators** = **48 prompt templates**
- Cache key includes `narratorId` from {professor, local, junior_ranger, truck_driver}
- ENV vars: `ELEVEN_VOICE_PROFESSOR`, `ELEVEN_VOICE_LOCAL`, `ELEVEN_VOICE_JUNIOR`, `ELEVEN_VOICE_TRUCKER`
- Per-audience override: Kids mode → forces junior_ranger; Unfiltered → forces trucker

**The addendum says:**
- 4 audience × **brief/standard/long intrinsic depth (mostly 1 cached version per POI)** × **2 narrators**
- Cache key includes `narrator_slug` from {narrator_a, narrator_b}
- Voice IDs: 8 active rows in `voice_configs` (4 audience × 2 narrator), provider abstracted (Google TTS Chirp 3 HD primary, not ElevenLabs)
- No per-audience override needed — each audience × narrator combination has its own voice in `voice_configs`

**Impact:**
- Prompt 06 cannot be run as-written. It produces 48 prompt templates wired to a 4-narrator system the addendum collapses.
- ENV vars and provider in the prompt are also out of date — SKILL.md already lists Google Cloud TTS Chirp 3 HD as primary, not ElevenLabs.
- The narration generation worker itself (`server/src/workers/narration.ts`) is mostly correct in *shape* — it's the prompt template count and narrator dimension that need updating.

**Resolution:** Replace Prompt 06 with **Prompt 06-revised** before running it. See §4.2 for the revised prompt outline.

### 2.2. ⚠️ CONFLICT: UI Handoff Prompt 10 (Narrator Picker) is stale

**The old plan (Prompt 10) says:**
- `/trip/narrators.tsx` with **4 vertical cards**
- "THE PROFESSOR / THE LOCAL / JUNIOR RANGER / TRUCK DRIVER" + quote lines
- Junior Ranger hidden when audience=kids
- Truck Driver shows 18+ badge when audience=unfiltered

**The addendum says:**
- 2 cards (Narrator A / Narrator B; display names TBD)
- Both narrators work with all four audience modes
- No conditional hiding (audience tonal differences are handled inside the voice for that audience × narrator combo)
- Mid-trip swap available via a narrator chip on the driving page (new UI element not in the original handoff)

**Impact:**
- The screen file at `/trip/narrators.tsx` already exists per the handoff note ("Xroad codebase has working versions of Home, Driving, Narrators, City"). It currently shows 4 cards.
- It needs a refit to 2 cards plus the mid-trip swap entrypoint.

**Resolution:** Replace Prompt 10 with **Prompt 10-revised** when ready. See §4.2.

### 2.3. ⚠️ SOFT CONFLICT: Depth model

**Old:** `depth` is a user-facing setting (Glance / Ride Along / Deep Dive) chosen at trip setup or in Settings. Cache key uses these values directly.

**Addendum:** `depth` becomes two things at once → `intrinsic_depth` is a property of the POI (`brief` / `standard` / `long`), and `pace` is the user setting (Full Drive / Light Touch). The cache key uses the intrinsic_depth value (plus `long_compressed` for the Light Touch variant of long POIs).

**Impact:**
- `narration_audio.depth` CHECK constraint currently allows `'glance' / 'ride_along' / 'deep_dive'`. Must extend to also allow `'brief' / 'standard' / 'long' / 'long_compressed'`.
- Existing cached audio under old depth values stays playable: provide an alias mapping at the application layer:
  - `glance` → `brief`
  - `ride_along` → `standard`
  - `deep_dive` → `long`
- Or migrate values in place via a UPDATE statement (simpler if cache hit count is small).

**Resolution:** Decide migration strategy. Recommend **in-place migration** if existing `narration_audio` rows < 5,000 (single UPDATE), or **alias layer** if larger. See §4.3.

### 2.4. ⚠️ SOFT CONFLICT: Trip setup screen (UI handoff Prompt 09)

**Old:** Home / Trip Setup screen lets user pick destination, depth, route preview. Audience mode is fixed from onboarding.

**Addendum:** Trip setup now also needs to expose:
- Narrator picker (2 cards) — replaces Prompt 10's standalone screen, possibly inline
- Narrative focus picker (3 cards: The Land Speaks / + Local Color / Custom)
- Pace picker (2 cards: Full Drive / Light Touch)
- The depth picker (Glance/Ride Along/Deep Dive) is REMOVED from the user-facing flow

**Impact:**
- Trip setup screen layout grows. Either accommodate more controls on Home, or move some to a "Trip preferences" sub-screen.
- Settings screen needs corresponding controls so users can set defaults for these (per the existing pattern of "set once in onboarding, change in settings").

**Resolution:** Decide UI layout (inline vs sub-screen). See §4.2 for proposed approach. Settings additions are straightforward — mirror the trip-setup controls with persistent default values.

### 2.5. 🤝 SYNCHRONIZATION POINT: Venue Tour V3 prompt templates

**Venue Tour V3** plans to add 12 new prompt templates (3 depths × 4 audiences) for the `venue_tour` trip mode.

**Addendum** changes this math:
- Two narrators × four audiences = 8 distinct voice configs per trip mode
- intrinsic_depth is per-POI, not a user pick — but venue tour POIs likely all default to `standard` length given they're walk-up
- So the venue tour prompt template count is: 8 voice configs × 1-2 intrinsic depths = ~12 templates, same number, but the *structure* of how they're keyed changes

**Impact:**
- Venue Tour V3 should not be started until the new narrator/depth model is locked in. Otherwise V3 ships templates wired to the old four-narrator system.

**Resolution:** Sequence Venue Tour V3 AFTER the narrator collapse migration (§4.4 step 6). Venue Tour V1 and V2 are unaffected — they're schema and importer integration, not narration generation.

### 2.6. 🤝 SYNCHRONIZATION POINT: Lookahead worker

**Pipeline Phase 7 (lazy cache):** The lookahead generates audio for ONLY the user's current `(audience_mode, depth, trip_mode)` combination.

**Addendum §10:** Adds a multi-step ranking pipeline (regions, significance floors, narrator weights, iconic override, pace rules, resonance, gap rules) before deciding what to enqueue for generation.

**Impact:**
- These compose. Phase 7 is about *what one cache key* to generate. Addendum §10 is about *which POIs* feed into that decision.
- The lookahead's pre-fetch logic needs to know about `pace` and `narrator_slug` (in addition to `audience_mode`, `trip_mode`) to pick the right cache key.

**Resolution:** When the lookahead worker is built/updated, implement the addendum §10 logic first, then call the existing Phase 7 generation logic for each queued POI. Both compose at the same layer.

### 2.7. 🤝 SYNCHRONIZATION POINT: SKILL.md is out of date

**SKILL.md** still describes:
- 3 depths as user-facing
- 4 audience modes mapping to specific narrator framings ("Junior Explorer" etc.)
- 12 prompt templates (4 audience × 3 depth)
- Cost discipline saying "ONLY the user's current `(audience_mode, depth, trip_mode)`"

**Addendum** changes all of these.

**Impact:** Any build chat that reads SKILL.md first will get a stale model. Build chats are likely to be confused or generate code wired to the wrong dimensions.

**Resolution:** Add an explicit pointer in SKILL.md to the addendum, plus an "as-of date" note. See §4.1.

### 2.8. — NO CONFLICT: Audience modes survive

The four audience modes (Family / Kids / Unfiltered / Local) are unchanged. The addendum adds narrators as an *orthogonal* axis on top of audience. This is additive.

### 2.9. — NO CONFLICT: Onboarding flow

UI handoff Prompt 08 sets audience mode once at onboarding. The addendum doesn't touch onboarding. Onboarding stays as-is.

### 2.10. — NO CONFLICT: Iconic Local importer is purely additive

The new `scripts/poi-import/sources/iconic-curation.ts` importer is a new file. It runs *after* dedup in the pipeline, sets the `iconic_local` boolean on existing POI rows. No conflict with any existing importer.

### 2.11. — NO CONFLICT: Regions are purely additive

New `regions` table, new RPC, new importers. Composes alongside the POI pipeline without touching it.

### 2.12. — NO CONFLICT: Open question lists

The addendum's open questions (final narrator names, watersheds in v1, per-category significance floor values, resonance weights, etc.) join the existing SKILL.md and UI handoff open question lists without overlapping them. All five lists should consolidate (see §6).

---

## 3. Reconciliation — What Needs to Update

Three documents need edits to stay consistent. Two new "revised" prompts need to be written. One consolidation pass on open questions.

### 3.1. SKILL.md

Add a top-of-file pointer to the addendum and update the stale sections. Specifically:

- Add a "Curation & Narration Model (as of {date})" subsection right after "Core Product Identity" that points to the addendum and summarizes the new model in three bullets
- Update the **Narration Depths** table to note: "depth is now a POI-intrinsic property (`intrinsic_depth`), not a user setting. The user-facing control is `pace` (Full Drive / Light Touch). See addendum §4 and §6."
- Update the **Audience Modes** section to note: "Audience mode is one of two narrator axes. The other is `narrator_slug` (Narrator A / Narrator B per addendum §5). The pair selects a row in `voice_configs`."
- Update the **Cost Discipline** section to reflect the new generation count (~10 per POI on average, not 12)

### 3.2. UI/UX Handoff PDF

The PDF itself is locked (it's a PDF), but the build chat consumes prompts from it. So:

- Mark Prompts 06 and 10 as "DO NOT RUN AS-IS — see roadmap §4.2 for revised versions" in any handoff notes you give the build chat
- Add the revised prompts (06-revised, 10-revised) as separate documents you hand to the build chat at the right time

### 3.3. Venue Tour design

The venue tour design references the four-narrator model in V3's prompt template count math. One paragraph update:

> "V3 prompt templates: 4 audiences × 2 narrators = 8 voice config combinations per intrinsic_depth value. Since venue tour POIs mostly default to `standard` intrinsic_depth (walk-up callouts), expect ~8–12 template files total, not the 12 originally planned. Reuses the new two-narrator system from `roadstory-narration-curation-addendum.md` §5."

### 3.4. POI Pipeline document

One paragraph addition at the end of Phase 5 (significance recompute):

> "After significance recompute, run `scripts/poi-import/assign-intrinsic-depth.ts` per the addendum §4.3 to set the `pois.intrinsic_depth` column. Also run `scripts/poi-import/sources/iconic-curation.ts` per addendum §8 to set the `pois.iconic_local` flag on candidates."

### 3.5. Consolidate open questions

There are five separate open-question lists across the docs. Some overlap. Consolidate into one master list (see §6).

---

## 4. The Unified Execution Roadmap

### Phase status (2026-05-19, catalog v1 closed)

Quick scan of where each phase actually stands. Detail in each phase's section below.

| Phase | Status | Note |
|---|---|---|
| A — Reconciliation | ✓ DONE | Pre-session doc work landed |
| B — POI Data Pipeline | ◐ PARTIAL | B1 schema ✓, B2 all 5 importers live ✓, B3 dedup + 5-component significance ✓, B4 GNIS basic ✓. v1.1 backlog: GNIS expansion + Nevada-bleed SPARQL fix |
| C — Venue Tour | ◐ PARTIAL | V1 ✓ (75 venues seeded, 1,634 children classified). V2 (importer integration) not started — blocker for CA-outside imports |
| D — Addendum Migrations | ◐ PARTIAL | D1 all 7 migrations ✓. D2 partial (detect_regions, get_nearby_pois confidence filter, depth-alias mapping ✓; narrative_focus/pace param wiring not done). D3 voice_configs done for narrator_b × Family/Local (Sadachbia 1.0); other 6 audience×narrator combos deferred to audience expansion |
| E — Regions Import & Generation | ✓ DONE | E1a USGS, E1b EPA, E1d named valleys all live (51 regions). E1c NLD deferred to v2. E1e watersheds (HUC8) deferred to v2. E2 production region narrations: 108 generated (54 regions × narrator_b × Family/Local) |
| F — Iconic Local Curation | ○ NOT STARTED | Schema in place (`iconic_local`, `iconic_local_reasons`, `signature_hook`); importer not built; 0 POIs flagged |
| G — Depth Assignment + Significance Tuning | ◐ PARTIAL | G2 done (B1 floors + A1 P31 bonus + editorial-curation slate = 189 POIs `editorial_curated=TRUE`). G1 NOT done — all 21,906 live POIs sit at `intrinsic_depth='standard'`; brief/long heuristic outstanding |
| H — Narration Engine + Templates | ◐ PARTIAL | narrator_b × Family POI template + region templates live (with full SSML prosody pipeline). Audience × narrator matrix (Kids/Unfiltered/Local × narrator_a/b) not built. Google TTS Chirp 3 HD primary — already settled per CLAUDE.md TTS roadmap |
| I — Lookahead Worker | ◐ PARTIAL | I.1 + I.2 MVP ✓ — pure-function ranking pipeline + CLI simulator at `scripts/simulate-trip/` implementing addendum §10 (eligibility, effective_score, density gap, region rate-limit) and §10.3 (cluster suppression). First simulation timeline at `docs/simulations/2026-05-19-la-mammoth.md` (commit `ab33921`). I.3 NOT done — no WebSocket emission, no mobile UI integration, no real GPS, no Pace=Light Touch, no Iconic Local Override (Phase F dep) |
| J — UI Refits | ◐ PARTIAL | Pine redesign landed lots (home, customize, drive, components, motion infra). Trip-setup narrator/focus/pace pickers per addendum NOT done. Driving page Skip + Tell Me More + narrator chip NOT done. Settings additions NOT done |
| K — Feedback Loop & Reports | ○ NOT STARTED | `narration_plays` schema in place; event wiring + cron reports not built |
| L — Venue Tour V3 | ○ NOT STARTED | Awaits Phase H expansion (audience × narrator matrix) and venue-tour narration templates |
| M — UI Handoff Phase 3 Remainder | ◐ PARTIAL | Pine landed most of Phase 3 surface work. Trip Summary screen + Group features (Prompts 14 + 16) not done |
| N — Pre-Launch | ○ NOT STARTED | E2E test trips, cache warming, perf testing, offline cache verification, cost review |
| v1.5 Backlog | — | Conversational Query Mode (decision doc landed); other deferred items |

**Catalog v1 status** — closed 2026-05-19. 295 v1 narrations live (108 regions + 187 POIs). $15.64 lifetime spend per `llm_calls` audit. See [docs/decisions/2026-05-15-top-tier-poi-first-run.md](decisions/2026-05-15-top-tier-poi-first-run.md) §Catalog v1 closed for full close-out detail.



Sequencing all the pending work into a single plan. Each step is independently shippable. Items in the same numbered block can run in parallel; items in different blocks have dependencies.

### Phase A — Reconciliation (1–2 days, no code)

**Block A1 — Document hygiene**
1. Update SKILL.md per §3.1 above
2. Write **Prompt 06-revised** (Narration Engine, two-narrator model) — see §4.2 below
3. Write **Prompt 10-revised** (Narrator Picker, two cards) — see §4.2 below
4. Update Venue Tour design per §3.3
5. Update POI Pipeline doc per §3.4
6. Consolidate open questions into one master list (§6 of this doc serves as that list)

These have to happen before any new code starts. They're each ~30 min of writing.

### Phase B — POI Data Pipeline Core (1–2 weeks, existing plan)

This is the work already laid out in `roadstory-poi-pipeline-prompts.md`. Run as planned. The addendum doesn't change this work, it just consumes its output.

**Block B1 — Schema & scaffolding (sequential)**
1. Verify Phase 1 (schema migration for source provenance) is shipped
2. Verify Phase 2 (ETL scaffolding) is shipped
3. If either incomplete, finish them first

**Block B2 — Source importers (parallelizable)**
4. Phase 3a: OSM importer
5. Phase 3b: Wikidata importer
6. Phase 3c: NRHP importer
7. Phase 3d: CHL importer

These can run in any order or in parallel. Each is independent.

**Block B3 — Dedup & significance (sequential)**
8. Phase 4: Dedup and merge
9. Phase 5: Significance recompute

Run after Block B2 completes. Block B3 also produces the first real significance score distribution — this is when you (the human curator) review the list and tune the per-category significance floors (addendum §2.2).

**Block B4 — GNIS (optional)**
10. Phase 3e: GNIS importer if you want named geographic features beyond what OSM provides

### Phase C → Venue Tour V1 + V2 (1 week, before any new POI imports outside CA)

This is a blocker. Per the venue tour design, V1 and V2 must ship before any future state's import.

**Block C1 → Venue Tour V1 (sequential)**
1. Apply venue tour schema migration (parent_poi_id, is_venue, venue_polygon)
2. Build classifier (`classifyPOI()`)
3. Run venue seed script for ~80 CA venues
4. Run classification dry-run on existing 20,148 POIs
5. Review classification report
6. Commit classification
7. Update `get_nearby_pois` RPC to exclude children by default
8. Add `get_venue_tour_pois` and `detect_venue_at_location` RPCs

**Block C2 → Venue Tour V2 (parallelizable with B2)**
9. Update OSM/Wikidata/NRHP/CHL importers to call `classifyPOI()` after normalization

V2 can happen alongside B2 if Block C1 ships first. Otherwise, V2 follows B2.

### Phase D — Addendum Migrations (1 week)

The addendum's schema and seed work. Mostly additive, so this can ship incrementally — each migration is reversible and the system stays working between them.

**Block D1 — Schema migrations (sequential within block)**
1. Add `intrinsic_depth` column to `pois` (default 'standard'; backfill comes later)
2. Add `iconic_local`, `iconic_local_reasons`, `signature_hook` columns to `pois`
3. Create `category_significance_floors` lookup table (seed with global 70; per-category values come later when you've reviewed the list)
4. Create `regions` table + spatial index
5. Create `narration_plays` table
6. Migrate `narration_audio.depth` CHECK to include new values ('brief', 'standard', 'long', 'long_compressed') alongside existing ones
7. Update `voice_configs` partial unique index from `(mode) WHERE is_active = true` to `(mode, narrator_slug) WHERE is_active = true`

**Block D2 — RPC updates (after D1)**
8. Add `detect_regions_at_location` RPC
9. Update `get_nearby_pois` and `get_route_pois` RPCs to accept `narrative_focus`, `pace`, and `narrator_slug` parameters with per-category floor application
10. Update narration cache RPCs to use new depth value space

**Block D3 — Voice config data swap (after D1.7)**
11. Pick 8 voices in Google TTS Chirp 3 HD (or ElevenLabs if you prefer for audition → but SKILL.md target is Google) → 2 narrators × 4 audience modes
12. Deactivate the four existing narrator configs
13. Insert 8 new voice_configs rows for narrator_a + narrator_b × each audience mode
14. Run the voice audition workflow (audition each voice with sample texts before committing)

This is a real human decision. Plan an afternoon to audition voices. ~10 min per voice × 8 voices + tonal adjustment iteration = ~2 hours.

### Phase E — Regions Import & Generation (3–5 days)

Adds the soul-defining region narration layer.

**Block E1 — Region data imports (sequential)**
1. Build `scripts/region-import/sources/usgs-provinces.ts` → 11 polygons
2. Build `scripts/region-import/sources/epa-ecoregions.ts` → Level III first, Level IV after
3. Build `scripts/region-import/sources/native-land.ts` — ~30 indigenous territories
4. Build `scripts/region-import/sources/named-valleys.ts` → Wikidata + manual top 30

**Block E2 — Region narration pre-gen (after E1 + D3)**
5. Pre-generate region narrations: ~250 regions × 2 narrators × 4 audiences = ~2,000 audio files
6. Cost: ~$15–25 one-time. Logs to `llm_calls` for audit.

This depends on Block D3 voice configs being set.

### Phase F — Iconic Local Curation (3–5 days, parallelizable with E)

The new free-tier iconic curation importer.

**Block F1 — Curated source ingestion (parallelizable)**
1. Scrape James Beard Foundation archive
2. Scrape Roadfood.com directory
3. Pull Atlas Obscura via API
4. Scrape Eater 38 / regional heatmaps
5. Pull Society for Commercial Archeology + Historic Hotels of America directories
6. Wikipedia/Wikidata signals are already in the DB from Block B2

**Block F2 — Iconic flagging (after F1)**
7. Build `scripts/poi-import/sources/iconic-curation.ts` → cross-references the scraped lists against existing POIs, sets `iconic_local=true` plus `iconic_local_reasons` array
8. Run on the full POI catalog
9. Expected hit count: ~150–300 POIs for CA

### Phase G — Depth Assignment + Significance Tuning (1 day + ongoing curation)

**Block G1 — Run the depth assignment heuristic**
1. Build `scripts/poi-import/assign-intrinsic-depth.ts` per addendum §4.3
2. Run on full catalog; backfill `pois.intrinsic_depth`

**Block G2 — Human curation pass (you, ~half day)**
3. Review the post-import POI list at the significance score distribution
4. Set the per-category significance floor values in `category_significance_floors`
5. Spot-check 30 random POIs that pass each floor — do they feel right?

This is the editorial decision you flagged. Schema is in place; you fill in the numbers.

### Phase H — Narration Engine + Templates (1 week)

This is **Prompt 06-revised** territory. The narration worker existed before but the template structure changes.

**Block H1 — Prompt templates**
1. Write 16 prompt templates: 4 audiences × 2 narrators × 2 depths (standard + long for long-weight POIs, brief is its own template). Actually closer to 4 audiences × 2 narrators × 4 depth variants (brief / standard / long / long_compressed) = ~32 template files total. Many will share helper functions.
2. Add region narration templates: 4 audiences × 2 narrators = 8 templates for regions
3. Add iconic-local-callout templates: 4 audiences × 2 narrators = 8 templates
4. Add venue-tour templates (Venue Tour V3 work): same pattern

**Block H2 — Narration worker updates**
5. Update `server/src/workers/narration.ts` to use new templates and new cache key shape
6. Switch from ElevenLabs to Google TTS Chirp 3 HD as primary provider (per SKILL.md current spec)
7. Verify the unique constraint `(poi_id, narrator_slug, depth, mode)` still works with new depth values

### Phase I — Lookahead Worker (3–5 days)

The brains of runtime POI selection. Per addendum §10.

**Block I1 — Implementation**
1. Implement the multi-step ranking pipeline (regions, narrator weights, iconic override, pace rules, resonance, gap rules)
2. Wire `narrative_focus` and `pace` and `narrator_slug` parameters through
3. Pre-fetch logic for next 3–5 queued items based on full key including pace

**Block I2 — Region transition detection**
4. WS server maintains `current_regions` list in trip state
5. On each `update_location` event, call `detect_regions_at_location` and diff
6. Queue region narration on new entry, respecting rate limits

### Phase J — UI Refits (1 week, parallelizable internally)

Phase 3 of the UI handoff. The screens exist; they get refit.

**Block J1 — Trip Setup screen refit**
1. Add narrator picker (2 cards) inline OR via a sub-screen — recommend inline if screen real estate permits, otherwise sub-screen at `/trip/preferences`
2. Add narrative focus picker (3 cards: The Land Speaks / + Local Color / Custom)
3. Add pace picker (2 cards: Full Drive / Light Touch)
4. Remove the depth picker from user-facing flow (depth is now intrinsic)

**Block J2 — Narrator Picker screen refit (Prompt 10-revised)**
5. If keeping the standalone screen at `/trip/narrators.tsx`: refit from 4 cards to 2 cards
6. Update narrator sample audio files (2 new MP3s)
7. Remove the Junior Ranger / Truck Driver conditional logic
8. Add the mid-trip swap mechanism: narrator chip on `/trip/driving.tsx` top-right, opens the picker as a bottom sheet

**Block J3 → Driving page additions**
9. Add Skip button to active narration card
10. Add Tell Me More pill after Brief/Standard narrations end (6-second visibility)
11. Add narrator chip in header (entry point for mid-trip swap)
12. Wire socket events: `skip_narration`, `tell_me_more`, `change_narrator`

**Block J4 — Settings additions**
13. Add Narrator default (mirrors trip-setup control)
14. Add Narrative Focus default (mirrors trip-setup control)
15. Add Pace default (mirrors trip-setup control)
16. Add "Learn from my taps" toggle (default off; opt-in per addendum §9.4)

### Phase K — Feedback Loop & Reports (3–5 days)

The skip-data instrumentation pays off here.

**Block K1 — Event wiring**
1. Frontend emits `skip_narration` and `tell_me_more` socket events
2. WS server writes to `narration_plays` table
3. Confirm `played_through_ms`, `was_skipped`, `skipped_at_second` all populate correctly

**Block K2 — Reports (parallelizable)**
4. Build per-narration health weekly cron (regen flagging logic)
5. Build per-user nudge engine (in-app suggestions)
6. Build content-quality dashboard (admin-facing, monthly cron, simple HTML page or notebook)

### Phase L → Venue Tour V3 (5 days, after Phase H)

Now that narrators + templates are settled, finish Venue Tour.

**Block L1 — Venue tour narration**
1. Add `venue_tour` to `narration_audio.mode` CHECK constraint
2. Add venue tour prompt templates (4 audiences × 2 narrators × ~1-2 depths)
3. Wire venue mode detection in the WS server (`venue_entered`, `venue_exited` events)
4. Frontend Venue Tour page UI (already partially specified in venue-tour-design.md)

### Phase M — Existing UI Handoff Phase 3 Remainder (parallelizable with J/K/L)

Items from the UI handoff that aren't affected by the addendum:

- Prompt 14: Trip Summary screen
- Prompt 16: Group features (live map, single narrator mode, voice chat)
- Anything else still pending from Prompts 01-13 not already complete

### Phase N — Pre-Launch (1 week)

Final cleanup, content QA, performance.

- Run end-to-end test trips with both narrators × all 4 audience modes × both paces × both narrative focus options
- Pre-generate audio for top 100 POIs on PCH (SF to LA), I-5 (LA to SF), Highway 395 (LA to Mammoth) for launch-day cache warming
- Performance test: target narration latency ≥10 sec before trigger zone
- Verify offline cache works: 4-hour drive pre-cache <50MB
- Cost review: log analysis to verify per-trip cost is in line with monetization tier projections

---

## v1.5 Backlog

Items deferred past v1 public launch. Sequencing happens in a v1.5 design lap after 2–4 weeks of real-user push-narration data.

### Conversational Query Mode (Voice Assistant)

**Decision doc:** [docs/decisions/2026-05-18-conversational-query-mode.md](decisions/2026-05-18-conversational-query-mode.md)

Parallel **pull** interaction paradigm to v1's **push** narration. STT-activated user questions ("hungry, anything good around here?") answered using current location + trip context, same brain as the narration system, same voice and SSML pipeline.

- **v1 anti-preclusion checklist (must land before v1 ships):**
  - Audio queue priority enum supports a `query_response` tier above Iconic Local Override (lookahead-worker work in Phase I leaves room for one more priority slot)
  - Reserve `server/prompts/queries/` as an empty directory tree with README explaining planned use
  - Driving page UI (`app/drive.tsx`) reserves a button position for an "Ask" affordance (icon-only mic button, top-right of now-playing card); hidden under `__DEV__` or feature flag in v1
- **v1.5 design lap resolves:** external-data policy (Option A editorial-only / Option B partner data / Option C hybrid-with-opt-in), tier-gating numbers (queries-per-trip on Free vs. unlimited on Road Pass), single-turn vs. multi-turn, regional-caching policy
- **Cost envelope:** ~$0.02/query (Haiku + Google TTS), ~$0.10/trip per Road Pass user at typical usage of 5 queries/trip

### Other v1.5 backlog items already noted

- **Push notifications** — captured at [1.3 UI/UX section](#13-ui--ux-handoff-xroad_ui_ux_cd_pdfpdf)
- **Kids mode sub-tiers by age (5yo vs 11yo)** — captured at §6 decisions-that-can-wait #8

---

## 5. Critical Path & Parallel Tracks

Visualizing what blocks what:

```
              Phase A (Reconciliation)
                       |
       +---------------+---------------+
       |               |               |
       v               v               v
   Phase B         Phase C         Phase D
 (POI Pipeline)  (Venue V1+V2)    (Schema)
       |               |               |
       +-------+-------+-------+-------+
               |               |
               v               v
           Phase E         Phase F         Phase G
          (Regions)        (Iconic)      (Depth + Floors)
               |               |               |
               +------+--------+-------+-------+
                      |                |
                      v                v
                  Phase H          Phase I
                (Templates)      (Lookahead)
                      |                |
                      +-------+--------+
                              |
                              v
                           Phase J
                         (UI Refits)
                              |
                  +-----------+-----------+
                  |           |           |
                  v           v           v
              Phase K     Phase L     Phase M
            (Feedback)  (Venue V3)  (UI Remainder)
                  |           |           |
                  +-----------+-----------+
                              |
                              v
                           Phase N
                         (Pre-Launch)
```

**Critical path:** A → B → D → H → I → J → N. Roughly 5–6 weeks of focused work assuming the build chat is moving at the pace shown in existing prompts.

**Parallelizable tracks:**
- C (Venue Tour V1+V2) runs alongside B (POI Pipeline) after their shared schema is in place
- E (Regions) and F (Iconic) and G (Depth Assignment) can all run in parallel once D ships
- J (UI Refits) and K (Feedback) and L (Venue V3) and M (UI Remainder) can run in parallel after H + I ship

### Single-developer pacing (you alone with build chats)

Realistic timeline if you're the only one driving:
- Weeks 1–2: Phase A + finish whatever's in progress in Phase B and Phase C
- Weeks 3–4: Phase D migrations + start Phase E/F/G in parallel
- Weeks 5–6: Phase H templates + Phase I lookahead
- Weeks 7–8: Phase J UI refits + Phase K feedback wiring
- Weeks 9–10: Phase L Venue Tour V3 + Phase M remaining UI
- Week 11: Phase N pre-launch QA
- Week 12: Soft launch

That's a 3-month plan. Aggressive but achievable.

---

## 6. Master Open Questions List (consolidated)

Every unresolved question across all five sources, consolidated. Decisions that block work are flagged.

### Blocking decisions (resolve before downstream work starts)

| # | Question | Source | Resolution path |
|---|---|---|---|
| 1 | Final narrator display names | Addendum §5.1 | You decide before Block J2 (Narrator Picker refit). Internal slugs `narrator_a/b` can ship before this. |
| 2 | Per-category significance floor values | Addendum §2.2 | You decide after Block B3 produces the score distribution. Schema is in place; values inserted via small migration. |
| 3 | Voice IDs for 8 voice_configs (2 narrators × 4 audiences) | Addendum §5, SKILL.md voice audition workflow | You audition voices before Block H. Plan 2 hours. |

### Decisions that can wait

| # | Question | Source | Suggested resolution |
|---|---|---|---|
| 4 | Watersheds (HUC8) in v1 or v2? | Addendum §3.8 | Defer to v2. Ship USGS provinces + EPA ecoregions + Native Land + named valleys in v1. |
| 5 | Resonance score weights (§7.2) | Addendum §7 | Initial heuristic values are fine; tune after first batch of Cultural Fabric skip rates come in. |
| 6 | Local Color airtime ratios per narrator | Addendum §5.4 | Initial values (90/10 and 75/25) are guesses; tune based on user feedback. |
| 7 | Pre-generate Long audio for high-significance POIs at import time vs on-demand on Tell Me More tap? | Addendum §12 | Recommend pre-generate for `significance_score >= 80`. ~$50 one-time for CA. |
| 8 | Kids mode sub-tiers by age (5yo vs 11yo) | SKILL.md, UI handoff | Defer to v1.5. Single Kids tier ships in v1. |
| 9 | Unfiltered mode content boundary documentation | SKILL.md, UI handoff | Block H prerequisite — write the explicit "what's out" list when building Unfiltered prompt templates. |
| 10 | Content accuracy QA process before community feedback scale | SKILL.md | Block K's per-narration health report + the manual content-quality dashboard fill this role pre-scale. |
| 11 | Self-hosted TTS at scale | SKILL.md | Defer to >10k users or sustained TTS spend >$500/month. Reusable architecture in `scripts/lib/tts/providers/` allows plug-in later. |
| 12 | International / multilingual expansion timeline | SKILL.md | v2. Out of scope here. |
| 13 | Monetization tier gating final mapping (which features = Road Pass) | Addendum §13 | Decide before Phase N. Likely: Free = Soul-only Light Touch with Narrator A; Road Pass = all of the above + offline + group features. |
| 14 | Narration latency budget if real-world Google TTS exceeds 5s | UI handoff | Acceptable for v1 with lookahead pre-cache; monitor in Phase N. |

---

## 7. Conflict Summary Card

For quick reference when handing this to a build chat:

| Conflict | Severity | What it means for build chat |
|---|---|---|
| UI Prompt 06 (Narration Engine) | ⚠️ Stale | Use **Prompt 06-revised** instead. Old version generates wrong template count and wrong narrator dimension. |
| UI Prompt 10 (Narrator Picker) | ⚠️ Stale | Use **Prompt 10-revised** instead. Old version builds 4-card UI; new spec is 2-card. |
| Depth model (narration_audio.depth CHECK constraint) | ⚠️ Soft | Extend CHECK to include new values. Old values stay alongside new values (or migrate in place if existing rows are few). |
| Trip Setup screen layout | ⚠️ Soft | More controls needed. Decide inline vs sub-screen for narrator/focus/pace pickers. |
| Venue Tour V3 prompt template count | 🤝 Sync | Wait for new narrator/depth model before starting. |
| Lookahead worker logic | 🤝 Sync | Implement addendum §10 ranking pipeline before/around the cache-generation logic. |
| SKILL.md content | 🤝 Sync | Update pointers to addendum. Mark depth/narrator sections as superseded. |
| Audience modes | — No conflict | Unchanged. |
| Onboarding flow | — No conflict | Unchanged. |
| Iconic Local importer | — No conflict | Purely additive. |
| Regions | — No conflict | Purely additive. |

---

## 8. What I Need From You

To unblock the build chat after Phase A, three calls:

1. **Confirm the roadmap order** above looks right — or flag any sequencing you'd change
2. **Confirm we ship the SKILL.md update + revised Prompt 06 + revised Prompt 10** as part of Phase A
3. **Decide whether to start Phase A now or wait** — Phase A is ~1–2 days of writing; could fit before your next coding session or be the first thing the build chat reads when it returns

The naming decision for narrators (Window Seat / Shotgun vs Reverent / Easygoing vs Deep / Easy vs Take It In / Talk It Out etc.) is not on the critical path — internal slugs can ship before the display names finalize.

---

**End of roadmap.** This doc is the single source of truth for sequencing. Update it as decisions firm up; let the design docs stay focused on *what* and let this one stay focused on *when and in what order*.
