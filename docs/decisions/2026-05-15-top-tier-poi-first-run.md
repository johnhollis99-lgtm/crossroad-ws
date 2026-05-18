# Top-Tier POI First Run — pivot from region-matrix sequence

**Created:** 2026-05-18
**Status:** Awaiting curator cutoff selection + approval of curated set
**Supersedes:** roadmap §1.1 region-matrix sequence for the initial POI surface

## Context

The narrator_b prosody arc landed on main as of merge commit `dc7277f` (2026-05-18). The SSML pipeline, marker-frequency floor, highway/year phonetic rules, and cardinal-content sanitization fix are all production-ready for the narrator_b × Family pair at speakingRate 1.0. The 108 existing region narrations stay untouched per the curator's "do not rewrite" rule; everything new flows through the new pipeline.

The prior plan (per [docs/roadstory-unified-roadmap.md §1.1](../roadstory-unified-roadmap.md)) was to expand the region matrix next — narrator_b across kids + unfiltered + local for all 54 regions (the 162-batch). That plan is **deferred**.

Curator's pivot: before any audience expansion, prove the new pipeline on a curated, top-tier POI slate using the single locked voice (narrator_b × Family / Sadachbia 1.0). POIs are the larger surface, get heavier listener time on a real road trip, and a top-tier-first run de-risks the bulk POI generation more than another region matrix would.

## Decision

**First production run after prosody arc closes: a curator-approved top-tier POI list, narrator_b × Family only.**

Specifically:
- **Voice locked:** `en-US-Chirp3-HD-Sadachbia` at speakingRate 1.0 (current `voice_configs` active row for `narrator_b × family`).
- **Pipeline:** the merged SSML pipeline — Haiku emits marker-syntax prose; `scripts/lib/tts/ssml.ts` post-processor converts markers and digits to SSML; Google synthesizes; cost-tracker logs.
- **Set:** curator-reviewed top-N POIs at a curator-chosen significance-score cutoff (see "Curator cutoff selection" below).
- **No audience expansion** until the top-tier run lands and curator approves the audio.
- **No region-matrix work** — kids / unfiltered / local samplers stay parked.
- **No bulk significance-floor TTS** — per CLAUDE.md "Open architectural concerns" §curator-gated POI TTS; the top-tier set is human-greenlit, not auto-floor-triggered.

## Curator cutoff selection

The curator picks the cutoff from the score distribution in [docs/poi-inventory-2026-05-18.md](../poi-inventory-2026-05-18.md). The relevant bucket census (live POIs only):

| Bucket | Count | Cumulative from top |
|---|---:|---:|
| 95–100 | 5 | 5 |
| 90–94 | 3 | 8 |
| 85–89 | 3 | 11 |
| 80–84 | 25 | 36 |
| 70–79 | 98 | 134 |

The narrow top-bucket counts make a strict "highest visible bucket" cutoff impractical (5 POIs isn't enough for a real first run). Realistic cutoff candidates:

- **Cutoff ≥85**: 11 POIs — tight, mostly California Missions + Hollywood landmarks. Cleanest top-tier set; very small.
- **Cutoff ≥80**: 36 POIs — adds the rest of the missions + a few historic district entries. The natural cluster boundary.
- **Cutoff ≥70**: 134 POIs — heavy lift for a first run; introduces a lot of editorial review burden.

**Recommended (for curator consideration, not pre-decided):** ≥80 with manual exclusions for the noise items listed below. Yields ~30 high-quality narrations after curation, $0.50–$0.90 total spend at the 18s/gen + Haiku rate.

## Noise exclusions for the curated v1 slate

The current significance ranking has structural issues that surface across the cutoff slate. After v1 generation and curator listening, the full noise list is **14 items** (6 originally flagged pre-generation + 8 surfaced during the curator's listen of the 30-POI run).

### Pre-generation exclusions (original 6 — not generated)

1. **Grizzly River Run** (score 100, child of Disney California Adventure) — theme-park ride, not a drive-by POI.
2. **Walk of Fame** (score 100, OSM) — duplicate of "Hollywood Walk of Fame" (Wikidata). Dedup missed this pair (different category slugs blocked Phase B name-collapse: `hidden_gems` vs `history`).
3. **Adventure City** (score 88) — small theme park in Stanton; not narrate-worthy on a road trip.
4. **Sleeping Beauty Castle** (score 84, child of Disneyland) — theme-park feature.
5. **Avengers Campus** (score 82, child of Disney California Adventure) — theme-park feature.
6. **Marine World/Africa USA** (score 90) — defunct theme park (merged with Six Flags Discovery Kingdom; the entity no longer exists).

### Post-generation exclusions (8 surfaced by curator's v1 listen — generated audio retained in storage but NOT surfaced)

7. **Adventuredome** (score 80) — **Las Vegas, Nevada**. Confirms the Nevada-bleed issue extends beyond the geography layer into local_culture. Tracked as a known issue (see "Nevada bleed in SPARQL" below).
8. **Cars Land** (score 81) — Disney California Adventure theme area; same noise class as Sleeping Beauty Castle.
9. **Jurassic World—The Ride** (score 80) — Universal Studios ride; same noise class as Grizzly River Run.
10. **Pacific Park** (score 80) — Amusement park on Santa Monica Pier; a venue child of POI #1 in this slate.
11. **Oceanside City Hall and Fire Station** (score 81) — NRHP fire station, no substantive narrative content beyond the listing itself. Manifests the history-substance-gate failure mode below.
12. **Fire Station No. 23** (score 80) — Same failure mode: NRHP-listed fire station, paperwork-grade significance without narrative depth.
13. **Santa Ana Fire Station Headquarters No. 1** (score 80) — Same failure mode.
14. **Museum of Contemporary Art San Diego** (score 87) — Art category. Per addendum §1.1, `art` is opt-in via Local Color, not soul-doctrine surface; should not have surfaced in a top-tier first run.

The 8 post-generation exclusions' audio files **remain in storage** at `pois/{poi_id}/narrator_b_family_standard.opus` per curator's "no rewrites, no deletes" rule. They simply are not part of the curator-approved surfaced slate.

### Curated v1 first-run set: 22 narrations

After both exclusion passes (6 pre-gen + 8 post-gen), the surfaced set is 22 POIs: Santa Monica Pier, Hollywood Walk of Fame, Hollywood Sign, all 12 California Missions in the top slate, Drum Barracks, Lake Temescal, Echo Lake, Dallidet Adobe, Fremont Peak, Getty Center, Mammoth Mountain Ski Area, Mount Whitney, Old Town San Diego State Historic Park. This is the curator-approved v1 surface.

### Two separable underlying problems

- **Scoring problem:** venue children (theme-park rides) inherit cross-source bonuses that shouldn't transfer down. The `additional_sources` carve-out for theme_park/zoo_aquarium added in dedup 2026-05-07 was incomplete; recompute-significance is what produces these high scores. Partially addressed by A1 (P31-class bonus for geology/nature pulls those layers up, indirectly reducing theme-park-ride relative prominence). Full fix is a separate cleanup.
- **Dedup problem:** Walk of Fame ↔ Hollywood Walk of Fame should have collapsed but didn't. Already in [docs/data-quality-issues.md](../data-quality-issues.md) Phase B follow-ups.
- **Substance problem (NEW):** NRHP-only fire stations and similar paperwork-grade landmarks score 80 on `source_base` alone but have no narrative depth to actually fill a 100-200-word narration. See "History substance gate" tracking item below.

## Pending work that shapes "top tier" — flag to curator

The top-tier set is being chosen from a **partial dataset** in three respects:

1. **No anthropology-layer data.** The `native_history` slug has 0 live POIs. Soul-doctrine requires anthropology when source supports it, but the catalog has no indigenous-history POIs because the slug is reserved for narrative-extraction / editorial review (per CLAUDE.md "Aspirational poi_categories slugs"). Narrative-extraction phase isn't started. **Implication:** any anthropology content in the first-run narrations comes from the LLM's general knowledge prompted by the soul-doctrine rule + the POI's description text, not from a curated indigenous-history POI in the corpus.

2. **No iconic-local curation.** `iconic_local` column is 0/0 populated. Phase F importer (`scripts/poi-import/sources/iconic-curation.ts`) is not yet built. **Implication:** the addendum's Iconic Local Override mechanism is not active — the first-run set is selected purely on `significance_score`, not on iconic-local signals.

3. **Intrinsic depth not assigned.** All 21,906 live POIs sit at `intrinsic_depth = 'standard'` (the column default). The heuristic-assignment job (addendum §4.3, roadmap Phase G1) hasn't run. **Implication:** all first-run narrations will be `standard`-depth (60–90 sec / 150–200 words). Brief and long variants aren't surfaced.

These don't block the first run — they constrain it. The curated set comes from what's in the catalog now. Future POI additions (narrative extraction, iconic curation) will fold in as separate runs.

## Single-voice lockdown — narrator_b × Family / Sadachbia 1.0

Per the prosody arc's outcome:

- **`voice_configs` unchanged.** Family + Local share `en-US-Chirp3-HD-Sadachbia` at speakingRate 1.0 per [20260518000001_voice_configs_d3_lockdown.sql](../../supabase/migrations/20260518000001_voice_configs_d3_lockdown.sql).
- **Family-only for the first run.** Local / Kids / Unfiltered audience versions are deferred until the Family pass is curator-approved.
- **No migration on the voice config.** Rate stays 1.0.

The narrator_b POI templates that need to exist for this run live at `server/prompts/pois/` (currently the narrator_b/audience-mode templates only exist at `server/prompts/regions/` per the recent prosody arc). **Open question for the next session:** are POI narration templates a separate file tree from regions, or does the existing region pipeline get a per-surface (POI vs region) modifier? Flag for resolution before the first run fires.

## Audit signal — what to watch in `llm_calls` after the first run

The post-processor logs adherence events:

```sql
-- Highway / year skip rate (Layer 2 firing; should be low if Layer 1 template works)
SELECT model_or_voice, COUNT(*) AS skip_count
FROM llm_calls
WHERE model_or_voice LIKE 'ssmlize_skip_%'
GROUP BY model_or_voice;

-- SSML synthesis failures (should be zero if marker-syntax stays clean)
SELECT COUNT(*) AS fallback_count
FROM llm_calls
WHERE model_or_voice LIKE '%__SSML_PARSE_FAILED';

-- Cost summary
SELECT call_type, provider, SUM(cost_usd) AS total
FROM llm_calls
WHERE created_at >= '<first-run-start-time>'
GROUP BY call_type, provider;
```

The diagnostic scripts ([scripts/diag-ssml-comma-cardinal.ts](../../scripts/diag-ssml-comma-cardinal.ts) and [scripts/diag-mono-elevation-sentence.ts](../../scripts/diag-mono-elevation-sentence.ts)) are checked in as regression artifacts; re-run them after any Google TTS provider migration to confirm pipeline assumptions still hold.

## Process notes carried forward from the prosody arc

### Cache-artifact lesson learned (2026-05-18)

During the Mono Basin iteration cycle, three back-to-back re-renders to the same Storage path (`regions-prosody-test/{region_id}/narrator_b_ssml_rate1.0.opus`) caused a false-positive on the cardinal-content sanitization investigation: the curator listened to what appeared to be a non-working render even after the fix landed. The current file was the latest bytes (verified via HTTP HEAD: Last-Modified updated, Content-Length matched), Cache-Control was `no-cache`, but the curator's local audio player or browser cache served stale audio anyway.

**Rule for future POI-by-POI / region-by-region iterative testing:**
- Always use a **cache-buster suffix** on Storage paths during iterative testing on a single asset. Audio players (native, browser, Supabase CDN) cache aggressively even with `no-cache` headers.
- The test render script gained a `--suffix=<tag>` CLI flag for this purpose (commit `60f4674`). Default usage: `npx tsx scripts/test-prosody-render.ts --regions='Foo' --suffix=v2` → uploads to `..._v2.opus` instead of overwriting.
- For the POI first run: production paths can stay stable (cache is desired for production audio), but ANY iterative cycle on a single POI during curation should use the suffix flag.

### Audit-first prompt pattern validated

Three debugging arcs in the prosody session validated the audit-first → premise-notes → greenlight → apply pattern (per CLAUDE.md "Workflow notes"). For the POI first run: when an unexpected output occurs (LLM drift, scoring anomaly, audio issue), the first step is a targeted diagnostic to confirm or falsify the hypothesis before patching. The two SSML diagnostic scripts are precedent for this discipline.

### Scope expansion belongs to the owner

The first-run set is the curator's choice. The recommendation in this doc is exactly that — a recommendation, not a pre-decision. The curator picks the cutoff and the exclusion list; this doc provides the data to do so.

## Sequencing if approved

1. **Curator picks cutoff** (e.g., ≥80, ≥85, or custom set) from the top-N slate in `poi-inventory-2026-05-18.md`.
2. **Curator marks exclusions** for the noise items (theme park children, dedup duplicates, defunct entities — see "Top-20 noise to exclude" above).
3. **Open question resolution:** confirm POI templates location (`server/prompts/pois/` new tree, or reuse `server/prompts/regions/` with a surface modifier).
4. **Curator-approved curated set fires** — narrator_b × Family TTS only, side-channel storage path `pois/{poi_id}/narrator_b.opus` (consistent with regions-prosody-test pattern; finalize path scheme in implementation prompt).
5. **Audit:** check `llm_calls` for skip-rate, SSML fallback count, and total spend after the run.
6. **Curator listens** to all narrations in the set. Approves or flags individual items.
7. **On approval:** post-launch readiness checkpoint; audience expansion (kids / unfiltered / local) and region matrix re-evaluate.

## Soul-doctrine misalignment finding (2026-05-18 follow-up)

Curator review of the inventory deliverables flagged a structural problem: the ≥80 top-tier is **heavily history-biased**. 18 of 36 candidates are history-category POIs (Missions, NRHP buildings) vs. only 3 in geology + geography combined and 0 in anthropology. The ranking algorithm is promoting one soul-layer disproportionately. **Captured as a known issue going into the first POI run, not a blocker.** First run proceeds with the ≥80 cutoff + 6 noise exclusions; the broader-cutoff and other-audience runs hold until the misalignment is resolved.

Diagnostic report: [docs/poi-soul-doctrine-diagnostic-2026-05-18.md](../poi-soul-doctrine-diagnostic-2026-05-18.md). Script: [scripts/admin/poi-soul-doctrine-diagnostic.mjs](../../scripts/admin/poi-soul-doctrine-diagnostic.mjs). Headline findings:

### Where the bias lives

| Layer | n | mean score | mean source_base | median source_base | max source_base |
|---|---:|---:|---:|---:|---:|
| History | 3,543 | **29.04** | 22.43 | **30** | 55 |
| Architecture | 2,690 | **36.11** | 29.92 | **30** | 55 |
| Geography (nature) | 11,982 | 17.24 | 14.40 | 10 | 52 |
| Geology | 58 | 15.26 | 11.81 | **8** | 60 |
| Anthropology | **0** | — | — | — | — |

The `source_base` median for history/architecture is **3-4× higher** than for geology/geography. NRHP + state_landmark + editorial sources seed historical POIs at 30-50 pts before any signal aggregation; OSM/Wikidata sources for natural features top out around 20 absent Wikipedia backing. This single component drives most of the surface ranking.

### Structural gaps

1. **Anthropology corpus is empty.** `native_history` slug has 0 live POIs. The slug is reserved for narrative-extracted / editorial content per CLAUDE.md "Aspirational poi_categories slugs"; bulk importers will never populate it. Phase F+ narrative-extraction work is the only path. **This is the soul-doctrine's biggest structural gap and not solvable by significance tuning.**
2. **GNIS importer has 0 live rows.** CLAUDE.md says the importer is implemented (`scripts/poi-import/sources/gnis.ts`, summit/falls/cape/etc. whitelist) but no GNIS rows are live. Either it didn't run, or all rows merged into Wikidata/OSM primaries and lost their source_type tag. Either way: the corpus is missing the prominence-ranked geological feature catalog GNIS would provide.
3. **Geology corpus is mostly caves.** 10 of the top 20 geology entries are caves. Mountains, volcanoes, fault scarps are underrepresented or absent — even Mt. Whitney sits at score 80 (editorial seed) without strong cross-source signal from peak-specific sources.
4. **Geography top is heavy on Nevada peaks via Wikidata.** Half the top-20 nature entries are Nevada mountain ranges (Monte Cristo, Verdi Peaks, Badger Mountains, Broken Hills, etc.) — bleed from the bbox-based Wikidata SPARQL query into adjacent state, not actually California-relevant.

### Diagnose-before-broaden plan

Four proposals captured in the diagnostic report. **None applied yet — curator reviews and picks.** Summary recommendation order:

1. **B1 — lower geology + nature `category_significance_floors` to 60/65.** Pure trigger-policy change, no recompute. Surfaces existing high-quality candidates the global 70 floor is hiding (e.g., Junipero Serra Peak at 69, Cerro San Luis Obispo at 68 — both legitimately significant California peaks just under the cutoff). Trivial, reversible.
2. **A1 — Wikidata P31-class bonus for geology + nature** (+10 pts when a POI has a significance-indicating P31 class like `Q8502 mountain`, `Q60504 lake`, `Q34038 waterfall`). Adds ~10 pts to legitimately-significant geological features without disturbing existing scores. Requires recompute + top-25 baseline re-validation (precedent: `scripts/poi-import/baselines/`).
3. **C1 — wider GNIS feature-class whitelist** (add Volcano, Basin, Plateau, Cliff, Canyon, Valley to current Summit/Falls/Cape/etc.). Improves the input corpus for future dedup passes. Long-term lift, not a v1 first-run fix.
4. **C3 — anthropology corpus** via narrative extraction. The hard problem. Roadmap Phase F+ scope; not a significance-tuning fix.

### Hold for curator decision

The history-skew is acknowledged. The first run proceeds with the ≥80 set as-is (high-quality history + Hollywood landmarks + missions = a meaningful v1 surface even if not balanced across layers). All subsequent POI runs — broader cutoffs, other audiences, narrator_a — hold until curator picks which of B1/A1/C1/C3 to apply and the recompute lands.

The lesson for future re-tuning cycles: **the ranking algorithm makes the corpus's structural source biases visible.** History/architecture have authoritative cataloging (NRHP, state_landmark) that geology/geography don't. The soul doctrine demands all four layers; the cataloging infrastructure favors two. Either rebalance the scoring or accept that some layers need editorial-curation effort that bulk importers can't provide. This is the soul-doctrine vs. importer-coverage tradeoff captured for future arc planning.

## Curator decision on Track 2 proposals (2026-05-18 post-listen)

Curator picked **B1 + A1** to apply; **C1 + C3** deferred.

- **B1 (apply now):** Populate `category_significance_floors` with `geology=60`, `nature=65`. Leave other categories at the global 70 default. Pure trigger-policy migration, reversible by TRUNCATE.
- **A1 (apply now):** Implement Wikidata P31-class bonus (+10 pts when a geology or nature POI's Wikidata source_id has a P31 claim in the soul-doctrine-relevant class set). Extend `recompute-significance.ts`; capture before/after distribution in this doc.
- **C1 deferred:** GNIS importer expansion bundles with the Nevada-bleed SPARQL fix (see tracking item below) as a future work item on the roadmap.
- **C3 deferred:** anthropology corpus is Phase F+ via narrative extraction; NLD outreach is the long-term path. Tracked in [docs/roadstory-unified-roadmap.md](../roadstory-unified-roadmap.md) and [docs/decisions/2026-05-14-nld-deferral.md](2026-05-14-nld-deferral.md).

### A1 implementation — Wikidata P31-class bonus

The P31 classes that trigger the +10 bonus (when a geology or nature POI is `source_type='wikidata'` and its source_id's P31 claim contains any of these):

| Q-id | Class | Soul-doctrine relevance |
|---|---|---|
| Q8502 | mountain | Geology — peaks |
| Q60504 | lake | Geography — water features |
| Q34038 | waterfall | Geology / geography |
| Q1437459 | volcano | Geology — volcanic |
| Q35509 | cave | Geology — formations |
| Q190429 | fault | Geology — tectonics |
| Q133056 | hot spring | Geology — geothermal |
| Q170583 | valley | Geography — landform |
| Q160091 | plateau | Geography — landform |
| Q35666 | island | Geography — landform |

Implementation files:
- New cache module: `scripts/poi-import/lib/wikidata-p31.ts` — batch fetches P31 claims via Wikimedia API (50 QIDs/req, disk-cached 30-day TTL at `cache/wikidata-p31/`).
- Extended: `scripts/poi-import/recompute-significance.ts` — adds a 5th breakdown component `p31_bonus` (0 or 10 pts). Total formula unchanged otherwise (final cap at 100).

The bonus is applied additively to `significance_score` and recorded as `significance_breakdown.p31_bonus`, so the audit trail is preserved per-POI. Editorial venues (already at 80+) won't be affected materially because they're either source_type='editorial' (no Wikidata QID) or already at/near the cap.

## Known issues — tracking items (not applied)

### History substance gate

A scoring rule analogous to the architecture-80 floor concept, designed to catch the fire-stations / paperwork-NRHP failure mode that surfaced in the v1 run (Oceanside City Hall and Fire Station, Fire Station No. 23, Santa Ana Fire Station HQ No. 1 all scored 80–81 on NRHP source_base alone).

**Proposed rule:** history-category POIs that derive most of their `source_base` from NRHP/CHL listing alone — with NO Wikipedia article ≥500 words, NO cross-source verification (`additional_sources` empty or length 1), and NO narrative-extracted content — get a soft penalty (e.g., **−15 pts to effective score**, applied as a `substance_penalty` breakdown component).

**Why a *soft* penalty rather than a hard floor:** some NRHP-only listings are genuinely significant in a narrow regional way; a hard floor would reject them outright. A −15 penalty drops them from the 80–84 bucket into the 65–69 bucket where they're still queryable but don't surface as unprompted narration.

**Not applied yet:** needs candidate-count audit + curator review before any scoring change. Estimated affected rows: ~400–800 (NRHP entries lacking Wikipedia presence). Curator should listen to a few exemplars (Oceanside CH&FS, Fire Station No. 23, etc.) and decide if the penalty magnitude is right before applying.

### Nevada bleed in SPARQL

The Wikidata importer's bbox filter (CA_BBOX in `scripts/poi-import/sources/wikidata.ts`: lat 32.5–42.0, lon -124.5 to -114.1) catches adjacent Nevada / Oregon / Arizona territory. Confirmed instances in the v1 run:
- **Adventuredome** (Las Vegas, NV) at score 80 — surfaced in the cutoff slate
- Track 2 report also flagged: Monte Cristo Range, Verdi Peaks, Badger Mountains, Broken Hills, Twin Peaks (Churchill County NV) all at scores 71–76 in the geography layer top-20

**Proposed fix:** add a California-bound filter to the SPARQL query. Curator hypothesis: `?item wdt:P131 wd:Q99` (P131 = "located in administrative territorial entity"; Q99 = California).

**Verification:**
- ✓ Q99 is California (the U.S. state) — confirmed via Wikidata Q99 page.
- ✓ P131 is "located in the administrative territorial entity" — confirmed.
- ✗ Direct `wdt:P131 wd:Q99` is **insufficient**. Most California POIs are located directly in a county (e.g., Q108170 = Los Angeles County), not in the state itself; the county is then in California. A direct P131 filter would miss the vast majority of legitimate California POIs.
- ✓ Correct form: `?item wdt:P131+ wd:Q99` — transitive one-or-more hops up the administrative tree. Catches `POI → County → California` and any deeper nesting (e.g., neighborhood → city → county → California).

**Apply path (when this lands):**
1. Modify `scripts/poi-import/sources/wikidata.ts` buildQuery() to add `?item wdt:P131+ wd:Q99 .` to the WHERE clause. (Note: SPARQL property paths interact with `wikibase:box` — verify the bbox + transitive admin filter combine correctly in practice; may require keeping bbox and ANDing the admin filter.)
2. Re-run Wikidata importer against existing bbox. Track which existing rows would now be filtered out.
3. For Nevada-bleed POIs already in the corpus: flag for `merged_into` cleanup or batch UPDATE to set `editorial_status='needs_review'` so they're suppressed from drive-by surfaces pending curator removal.

**Bundled with C1 (wider GNIS whitelist):** both are importer-scope fixes, both will require re-import + dedup + recompute. Sensible to bundle in a single future arc.

**Not applied yet:** verification of the SPARQL combinatorics is complete (above); implementation deferred per curator. Tracked here so the next importer arc picks it up.

## Rebalance results — B1 + A1 applied (2026-05-18)

Full comparison report: [docs/poi-rebalance-2026-05-18.md](../poi-rebalance-2026-05-18.md). JSON snapshots: [docs/poi-snapshot-pre-rebalance.json](../poi-snapshot-pre-rebalance.json) + [docs/poi-snapshot-post-rebalance.json](../poi-snapshot-post-rebalance.json).

### B1 — `category_significance_floors` seeded

Migration `20260518000002_category_significance_floors_seed_b1.sql` applied. Live state:

| category | significance_floor |
|---|---:|
| geology | 60 |
| nature | 65 |
| (all others) | 70 (global default via COALESCE) |

Pure trigger-policy change; no score recompute caused by B1 alone.

### A1 — Wikidata P31 bonus implemented + recompute completed

Implementation:
- New `scripts/poi-import/lib/wikidata-p31.ts` — SPARQL-based batched P31 resolver, disk-cached 30 days at `cache/wikidata-p31/`, soul-doctrine class set hardcoded.
- Extended `scripts/poi-import/recompute-significance.ts` with a 5th breakdown component `p31_bonus`. Pre-fetches geology + nature category UUIDs once; per-batch identifies eligible POIs (geology/nature × source_type='wikidata') and SPARQL-resolves their P31; awards +10 when any P31 matches the soul-doctrine class set.
- New `--skip-p31` CLI flag for backward compat (default: apply bonus).

Recompute run: 21,906 rows updated in 22 batches. 9,217 P31 lookups (no cache hits — first run). 0 SPARQL failures. Hearst Castle manual_override flag fired as expected. Score distribution histogram:

```
   60–69   ███                                         438  (2.0%)
   70–79   █                                           119  (0.5%)
   80–89                                                34  (0.2%)
   90–99                                                 5  (0.0%)
  100–100                                                3  (0.0%)
```

### Layer-by-layer distribution shift

Buckets: 95–100 / 90–94 / 85–89 / 80–84 / 70–79 / 65–69 / 60–64 / <60 / TOTAL

**geology** (no change):
- BEFORE: 0 / 0 / 0 / 1 / 0 / 0 / 1 / 56 / **58**
- AFTER:  0 / 0 / 0 / 1 / 0 / 0 / 1 / 56 / **58**
- **Why no shift:** Mt. Whitney (the sole 80+ geology entry) is `source_type='editorial'` and has no Wikidata QID to bonus. The 13 Wikidata-sourced cave entries (Crystal/Lake Shasta/Mercer/Moaning etc.) DID get +10 (Q35509 cave is in the bonus set) but they sit at 38–48 pre-bonus → 48–58 post-bonus, all still below the 60 floor. **Geology layer needs Mt. Whitney to gain a Wikidata QID + USGS cross-source, or different fix entirely.**

**nature** (substantial shift — primary A1 beneficiary):
- BEFORE: 0 / 0 / 0 / 2 / 13 / 19 / 26 / 11,922 / **11,982**
- AFTER:  0 / 0 / 4 / 4 / 34 / 68 / 107 / 11,765 / **11,982**
- **Δ at score ≥70: +27 POIs** (15 → 42)
- **POIs newly in 65–79 band: +70** (B1 floor + A1 bonus combined effect)

**history** (no change — expected; A1 doesn't apply, B1 doesn't change history floor):
- BEFORE/AFTER identical: 1 / 2 / 1 / 14 / 38 / 47 / 84 / 3,356 / **3,543**

**architecture** (no change — same):
- BEFORE/AFTER identical: 0 / 0 / 0 / 1 / 14 / 13 / 55 / 2,607 / **2,690**

**ALL_LIVE** (+27 at ≥70, +70 in 65–79):
- BEFORE: 5 / 3 / 3 / 25 / 98 / 110 / 198 / 21,464 / **21,906**
- AFTER:  5 / 3 / 7 / 27 / 119 / 159 / 279 / 21,307 / **21,906**

### Top-30 diff

**Newly surfaced (6 — all nature, all P31-bonused):**

| New Rank | Score | Δ | Name | Category |
|---:|---:|---:|---|---|
| 10 | 87 | +10 | Black Hill (was 77) | nature |
| 12 | 86 | NEW | North Yolla Bolly Mountain | nature |
| 13 | 86 | NEW | Verdi Peaks | nature |
| 15 | 85 | NEW | Rattlesnake Hill (Churchill County, Nevada) | nature |
| 19 | 83 | NEW | Churchill Butte (Nevada) | nature |
| 27 | 82 | NEW | Mount Watkins | nature |

**Dropped out (6 — pushed down by the new nature peaks):**

Adventuredome, Dallidet Adobe, Echo Lake, Fire Station No. 23, Fremont Peak, Getty Center. All stayed at score 80 (no change in absolute score; just pushed past rank 30 by the rising nature entries).

**Stayed (24):** the California Missions, Hollywood landmarks, and noise items (Grizzly River Run, Walk of Fame, Marine World/Africa USA, Adventure City, Sleeping Beauty Castle, Avengers Campus, Cars Land) all unchanged.

### Critical observation — Nevada bleed amplified

**4 of the 6 newly-surfaced nature entries are Nevada peaks** (Verdi Peaks, Rattlesnake Hill, Churchill Butte, plus North Yolla Bolly Mountain which straddles the CA/NV border). The P31 bonus correctly lifted "mountain" POIs (Q8502) into the top tier — but the bbox-imported Wikidata corpus is heavily polluted with Nevada peaks the importer pulled in via the wide bbox.

**This confirms the Nevada-bleed tracking item is now CRITICAL, not just nice-to-have.** Before A1, Nevada bleed was a low-tier corpus issue. After A1, Nevada bleed is in the top 30. The next importer arc should bundle the Nevada-bleed SPARQL fix (`?item wdt:P131+ wd:Q99`) and re-import + dedup + re-recompute. Until then, **the curator should apply a manual Nevada-exclusion filter when selecting the next curated POI set.**

The legitimate California nature entries that surfaced (Black Hill at Morro Bay, Mount Watkins in Yosemite) are exactly the kind of geology/geography substance the soul doctrine wants. A1 works. Nevada bleed is a separate corpus-hygiene problem and the rebalance has made it more visible.

### Net assessment

- ✓ A1 mechanism works as designed (9 POIs in top 50 got the +10 bonus, 6 surfaced into top 30).
- ✓ Nature gained meaningful representation in the top tier (1 nature entry pre → 8 post in top 30 ranking).
- ✓ History/architecture undisturbed (no false fluctuation on layers we didn't intend to touch).
- ✓ The noise items from the v1 first run are unaffected (Grizzly River Run, Walk of Fame, etc. still at top — the rebalance didn't fix them; they need separate score-fix arcs).
- ⚠ Geology layer didn't materially benefit — Mt. Whitney needs a Wikidata QID + cross-source, OR the bonus needs to extend to editorial geology rows, OR a different fix path entirely.
- ⚠ Nevada bleed amplified into the top 30 — the bundled C1 + Nevada-bleed-SPARQL fix is now higher priority than originally tracked.

### Hold for curator review

The rebalance is captured. Curator reviews the post-rebalance top 30 + diff and decides:

1. Which (if any) of the 6 newly-surfaced nature entries to approve for next-tier narration (Nevada items likely excluded).
2. Whether the geology-layer non-improvement justifies a follow-up fix (extend P31 bonus to editorial rows? Different bonus for editorial geology? Manual significance boost on Mt. Whitney?).
3. Priority change on the Nevada-bleed + GNIS bundle.
4. Approval to proceed with next curated POI run on the rebalanced ranking.

All POI generation holds until curator approves.

## Out of scope for this decision

- POI narration template authoring (`server/prompts/pois/*.js` if separate, or surface modifier on region templates) — implementation arc post-cutoff.
- Recompute-significance score-fix for venue-child inheritance (Grizzly River Run, etc.) — separate cleanup.
- Walk of Fame / Hollywood Walk of Fame manual merge — already in `docs/data-quality-issues.md`.
- ElevenLabs voice migration (per CLAUDE.md "TTS provider roadmap (locked 2026-05-18)") — deferred to late-pre-launch / post-launch.
- Region matrix expansion (162-batch) — parked.
- Audience expansion (kids / unfiltered / local) — parked.
- Phase F iconic-local curation, Phase G1 intrinsic-depth heuristic — separate phases; the first-run uses the corpus as it stands.
