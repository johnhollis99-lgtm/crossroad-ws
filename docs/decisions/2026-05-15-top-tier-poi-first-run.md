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

## Top-20 noise to exclude during curation

The current significance ranking has structural issues that surface in the top-20. Curator should review and exclude these:

1. **Grizzly River Run** (score 100, child of Disney California Adventure) — theme-park ride, not a drive-by POI.
2. **Walk of Fame** (score 100, OSM) — duplicate of #4 "Hollywood Walk of Fame" (Wikidata). Dedup missed this pair. Should be merged.
3. **Adventure City** (score 88) — small theme park in Stanton; not narrate-worthy on a road trip.
4. **Sleeping Beauty Castle** (score 84, child of Disneyland) — theme-park feature.
5. **Avengers Campus** (score 82, child of Disney California Adventure) — theme-park feature.
6. **Marine World/Africa USA** (score 90) — defunct theme park (merged with Six Flags Discovery Kingdom; the entity no longer exists).

Six items out of 20. After removal, the top-20 becomes a clean slate of California Missions + Hollywood Sign + Santa Monica Pier + Hollywood Walk of Fame + Drum Barracks — the kind of set a narrator should be cutting teeth on.

These represent **two separable problems**:
- *Scoring problem:* venue children (theme-park rides) inherit cross-source bonuses that shouldn't transfer down. The `additional_sources` carve-out for theme_park/zoo_aquarium added in dedup 2026-05-07 was incomplete; the recompute-significance scoring is what produces these high scores. Fix is a recompute-significance follow-up — flag, don't fix in this decision.
- *Dedup problem:* Walk of Fame ↔ Hollywood Walk of Fame should have collapsed in Phase B name-collapse but didn't (different category slugs blocked it; one is `hidden_gems`, the other is `history`). Already in [docs/data-quality-issues.md](../data-quality-issues.md) Phase B follow-ups.

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

## Out of scope for this decision

- POI narration template authoring (`server/prompts/pois/*.js` if separate, or surface modifier on region templates) — implementation arc post-cutoff.
- Recompute-significance score-fix for venue-child inheritance (Grizzly River Run, etc.) — separate cleanup.
- Walk of Fame / Hollywood Walk of Fame manual merge — already in `docs/data-quality-issues.md`.
- ElevenLabs voice migration (per CLAUDE.md "TTS provider roadmap (locked 2026-05-18)") — deferred to late-pre-launch / post-launch.
- Region matrix expansion (162-batch) — parked.
- Audience expansion (kids / unfiltered / local) — parked.
- Phase F iconic-local curation, Phase G1 intrinsic-depth heuristic — separate phases; the first-run uses the corpus as it stands.
