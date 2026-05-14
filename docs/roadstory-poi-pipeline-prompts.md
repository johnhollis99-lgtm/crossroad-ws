# RoadStory POI Pipeline — Claude Code Prompt Playbook

A sequenced set of prompts for building out California-scale POI ingestion. Run them in order — later prompts depend on earlier ones. Each is scoped to a single Claude Code session.

Stack assumptions: Supabase + PostGIS, Node 20+ / TypeScript, pnpm. Adjust paths to match your repo.

> **⚠️ Important context:** This pipeline produces the POI data layer. The **narration/curation behavior** that consumes it has been updated — see `roadstory-narration-curation-addendum.md` for the current model (two narrators, intrinsic depth as data property, pace as user setting, 70 significance floor, regions, iconic local override, skip/tell-more controls). The sequencing for how this pipeline interacts with all other pending work is in `roadstory-unified-roadmap.md`.

---

## Phase 0 — Context loading (run this once at the start of any new session)

```
Read /mnt/skills/user/xroad-roadstory/SKILL.md, the curation addendum at `roadstory-narration-curation-addendum.md`, and the current Supabase schema in supabase/migrations/. Then read this repo's existing structure with `ls -la`. Confirm you understand:

1. The pois table schema and how it's currently populated (including parent_poi_id, is_venue, intrinsic_depth, iconic_local columns if those migrations have shipped)
2. The narration cache key pattern: `{poi_id}/{trip_mode}/{depth}/{narrator_slug}.opus` where depth → {brief, standard, long, long_compressed} and narrator_slug → {narrator_a, narrator_b}
3. The category enum currently in use, and the per-category significance floors in `category_significance_floors` if that table exists

Do not write any code yet. Summarize what you found and ask me which of the following phases I want to start: schema migration, ETL scaffolding, source importers, dedup, narrative extraction, depth assignment, iconic curation.
```

---

## Phase 1 — Schema migration for source provenance

Run before any importer. This is the foundation everything else depends on.

```
Add a new Supabase migration that extends the `pois` table with source provenance columns:

- source_type (text, NOT NULL): one of 'osm', 'wikidata', 'nrhp', 'state_landmark', 'gnis', 'narrative_extracted', 'editorial', 'user_contributed'
- source_id (text, NOT NULL): the source's native identifier (OSM node ID, Wikidata Q-number, NRHP reference number, CHL number, etc.)
- source_citation (text, nullable): for narrative_extracted POIs, the source document URL + verbatim passage
- confidence_score (real, default 1.0): 0.0–1.0
- verified (boolean, default false)
- additional_sources (text[], default '{}'): populated by the dedup job when multiple sources describe the same place
- merged_into (uuid, nullable, FK to pois.id): set when this row is a duplicate that has been merged
- imported_at (timestamptz, default now())

Constraints:
- UNIQUE (source_type, source_id) WHERE merged_into IS NULL
- INDEX on source_type
- INDEX on merged_into
- CHECK constraint enforcing the source_type enum values

Backfill any existing rows with source_type='editorial', source_id=id::text, verified=true.

Place migration in supabase/migrations/ with timestamp prefix. Show me the SQL before applying.
```

---

## Phase 2 — ETL scaffolding

Builds the shared infrastructure all importers will use. Run before any individual source importer.

```
Create scripts/poi-import/ with this structure:

scripts/poi-import/
——— lib/
—   ——— supabase.ts         # admin client using SUPABASE_SERVICE_ROLE_KEY
—   ——— dedupe.ts           # name similarity (token-set ratio + Levenshtein)
—   ——— geocode.ts          # place name — lat/lon via Nominatim, with rate limiting (1 req/sec) and caching
—   ——— significance.ts     # initial significance score from signals
—   ——— category-map.ts     # external tag — our category enum
—   ——— types.ts            # NormalizedPOI matching the pois schema with new source fields
—   ——— upsert.ts           # batch upsert helper (500/batch) using ON CONFLICT (source_type, source_id)
——— sources/
—   ——— osm.ts              # stub
—   ——— wikidata.ts         # stub
—   ——— nrhp.ts             # stub
—   ——— ca-landmarks.ts     # stub
—   ——— gnis.ts             # stub
——— cache/                  # gitignored, downloaded source files cached here
——— run.ts                  # CLI: pnpm import --source=osm --bbox=... or --county=...
——— README.md               # env vars required, how to run each, expected runtimes

TypeScript strict mode. Use commander for CLI. Use chalk for progress logs. All importers must be idempotent — rerunning updates rather than duplicates.

Stub each source with a TODO and a function signature: `export async function import(opts: ImportOptions): Promise<ImportResult>`.

Write the README with concrete env var names and example commands. Don't implement source bodies yet — that's the next phase.
```

---

## Phase 3 — Source importers

Run these in any order, but I'd suggest OSM first since it's the largest baseline. Each is independent.

### 3a. OpenStreetMap

```
Implement scripts/poi-import/sources/osm.ts.

Use Overpass API (https://overpass-api.de/api/interpreter). Query for these tag patterns within the bbox:

- historic=* (exclude historic=yes alone, exclude historic=memorial unless wikidata or wikipedia tag present)
- tourism in (attraction, museum, viewpoint, monument, gallery, artwork, archaeological_site, theme_park, zoo, aquarium)
- natural in (peak, waterfall, hot_spring, geyser, arch, cave_entrance, volcano)
- leisure=park WHERE wikipedia OR wikidata tag is present
- amenity=place_of_worship WHERE heritage OR wikidata tag is present
- man_made in (lighthouse, observatory, tower) WHERE name is present

For each result:
1. Skip if no `name` tag
2. For ways/relations, compute centroid lat/lon
3. Map OSM tags to our category enum via lib/category-map.ts
4. NormalizedPOI: source_type='osm', source_id=`{type}/{id}`, verified=true, confidence=1.0
5. description = OSM `description` tag if present, else null (Wikidata pass will fill this in for cross-referenced POIs)
6. Initial significance: +20 if wikipedia tag, +10 if wikidata tag, +15 if heritage tag, +10 if tourism=attraction, +5 if image tag

Respect Overpass rate limits: one query per 2 seconds, exponential backoff on 429/504. For California-wide queries, tile the bbox into 1°×1° cells and query each separately to avoid timeouts.

CLI: --bbox=lat1,lon1,lat2,lon2 OR --county=<CA county name>. Default to California state bbox.

Log to stdout: cells queried, POIs found, POIs upserted, POIs skipped (and why), elapsed time. Write a JSON summary to scripts/poi-import/cache/osm-{timestamp}.json.
```

### 3b. Wikidata

```
Implement scripts/poi-import/sources/wikidata.ts.

Use Wikidata SPARQL endpoint (https://query.wikidata.org/sparql). Query for entities with:
- coordinate location (P625) within California (Q99) OR within bbox
- instance of (P31) one of a curated set of Q-numbers (define in lib/wikidata-types.ts):
  tourist attraction, historic site, mountain, lake, waterfall, museum, monument,
  national park, state park, ghost town, mission, lighthouse, observatory,
  archaeological site, hot spring, beach, scenic viewpoint, named cave,
  historic district, battlefield, bridge (notable), dam (notable)

For each result, fetch:
- Label (English)
- Coordinates
- Wikipedia article title (sitelink)
- schema:description (short)
- Image (P18) if present

For POIs with a Wikipedia article: fetch the lead extract via the Wikipedia REST summary endpoint (https://en.wikipedia.org/api/rest_v1/page/summary/{title}). Use the extract as `description`. Cache responses in scripts/poi-import/cache/wikipedia/.

NormalizedPOI: source_type='wikidata', source_id=Q-number, confidence=1.0, verified=true.

Significance: +25 if Wikipedia article exists, +5 if image, instance-class weight (national_park=+30, historic_site=+15, generic_museum=+10, etc. — define a weights map).

SPARQL pagination: 1000 per query, sleep 1s between requests. Wikidata SPARQL has a 60s timeout — if you hit it, narrow the query by P31 class or by region.

Idempotent upsert via (source_type, source_id) unique constraint.
```

### 3c. NRHP (National Register of Historic Places)

```
Implement scripts/poi-import/sources/nrhp.ts.

Source: NPS publishes spatial data for all NRHP listings. Download the California subset:
- Try https://www.nps.gov/subjects/nationalregister/data-downloads.htm for the latest GeoJSON or CSV
- Cache the file in scripts/poi-import/cache/nrhp/ — skip re-download if file is <30 days old

For each California listing:
- name = Resource Name
- category = 'historic_site' (or refine using "Resource Type" field if present)
- description = construct from Significance + Period of Significance + Areas of Significance fields (concise, 1-3 sentences)
- source_type='nrhp', source_id=Reference Number
- confidence=1.0, verified=true
- Initial significance: +30 base, +10 if National Historic Landmark flag is set

If lat/lon is missing for a listing but address is present, geocode via lib/geocode.ts. If still no coordinates, skip and log.

Idempotent upsert. Write summary JSON.
```

### 3d. California Historical Landmarks (CHL)

```
Implement scripts/poi-import/sources/ca-landmarks.ts.

Source: California Office of Historic Preservation publishes the full CHL list. Two viable sources:
1. Primary: ohp.parks.ca.gov ListedResources export (check for CSV/JSON download)
2. Fallback: parse the Wikipedia "List of California Historical Landmarks" article — it has every landmark in tables with coordinates and plaque text

Per landmark:
- name = official landmark name
- description = the plaque inscription verbatim if available (public domain; this content is *gold* for narration, especially Local mode)
- category = 'historic_site' or refine by theme keyword in the plaque text (mission, gold_rush, indigenous, etc.)
- source_type='state_landmark', source_id=`CHL-${number}` (e.g., 'CHL-1')
- confidence=1.0, verified=true
- Initial significance: +25 base, +5 if also NRHP-listed

Plaque text often runs 100-300 words — store the full text in description. The narration generator can compress it for Glance depth and lean on it directly for Deep Dive.

Idempotent upsert.
```

### 3e. USGS GNIS (optional, lower priority)

```
Implement scripts/poi-import/sources/gnis.ts.

Source: USGS Geographic Names Information System publishes a CSV of all named features (https://www.usgs.gov/u.s.-board-on-geographic-names/download-gnis-data). California subset.

This source is high-volume and lower-quality (every named hill counts), so be selective:
- Only import features with class in: Summit, Falls, Cape, Arch, Bay, Pillar, Crater, Geyser, Hot Spring, Lava, Lake (named, area > some threshold), Island, Range
- Skip generic populated places (those should come from Wikidata)

Per feature:
- name, lat/lon, category from feature class
- source_type='gnis', source_id=Feature ID
- confidence=0.8 (some entries are stale / poorly described), verified=true (it's a government source)
- Initial significance: low base (+5), let the dedup pass boost it if it cross-references Wikidata or OSM

Idempotent upsert.
```

---

## Phase 4 — Dedup and merge

Run after all source importers complete. Critical step — without it your queries return three copies of every Yosemite Valley overlook.

```
Implement scripts/poi-import/dedupe.ts as a standalone job.

Logic:
1. Use PostGIS to find candidate pairs: pois within 50m of each other (ST_DWithin on geography column). Process in spatial batches to avoid loading everything into memory.
2. For each candidate pair, compute name similarity:
   - Token-set ratio (using a fuzzy library like fuzzball)
   - Levenshtein on normalized names (lowercase, strip punctuation)
   - Match if token-set > 0.9 OR Levenshtein > 0.85 OR one name is substring of the other
3. For matched pairs, MERGE:
   - Pick primary by source priority: state_landmark > nrhp > wikidata > osm > gnis > narrative_extracted
   - Move secondary's source_type into primary's additional_sources array
   - On primary: take the longest non-null description from any source
   - Sum significance_score boosts (capped at 100); +10 bonus per additional source (max +30)
   - verified = true if any source was verified
   - Set secondary.merged_into = primary.id (soft delete)
4. Skip POIs already merged (where merged_into IS NOT NULL) — don't merge into a tombstone

Provide --dry-run flag that logs every proposed merge without applying. Provide --county filter for testing on a subset.

Write a final report: total POIs before, total after, total merges, merges by source-pair (e.g., "osm × wikidata: 1,243 merges").

Add an index on (location, merged_into) if not present, since runtime queries should always filter merged_into IS NULL.
```

---

## Phase 5 — Significance recompute

Run after dedup, and rerun periodically (weekly?) as new data arrives.

```
Implement scripts/poi-import/recompute-significance.ts.

For each POI where merged_into IS NULL, compute final significance_score from:

1. Source signals (already accumulated during import — keep these)
2. Cross-source presence: count of additional_sources, +10 per (max +30)
3. Wikipedia pageview signal: for POIs whose source_id resolves to a Wikidata entity with a Wikipedia article, fetch 30-day pageview count from Wikimedia REST API. Normalize to 0–20 points (log scale: 100 views = 5, 1k = 10, 10k = 15, 100k+ = 20). Cache the pageview data so we don't re-fetch within 7 days.
4. Route adjacency: for POIs within 1km of a major California highway (I-5, US-101, CA-1/PCH, I-80, I-15), +10. Within 5km of any Interstate or US highway, +5. Use a precomputed PostGIS layer for this.
5. Cap final score at 100.

Update in batches of 1000. Idempotent — safe to rerun. Log score distribution histogram at the end.

Add a `significance_breakdown` jsonb column to pois (in a new migration) that stores the components: { source_base: 30, cross_source: 10, pageviews: 12, route_adjacency: 5, total: 57 }. Useful for debugging and for the eventual admin UI.
```

### Phase 5b — Intrinsic depth assignment (per curation addendum §4)

After significance recompute completes, run `scripts/poi-import/assign-intrinsic-depth.ts` to set `pois.intrinsic_depth` for every non-merged POI. Heuristic:

```
- Wikipedia article < 500 words AND no NRHP/CHL listing — 'brief'
- Wikipedia article 500–3,000 words OR NRHP/CHL listing — 'standard'
- Wikipedia article > 3,000 words OR multiple cross-references OR narrative-extracted source — 'long'
- Iconic Local Override POIs (set in Phase 5c) — forced to 'brief'
- Geological POIs with USGS bulletin references — forced to 'long'
```

Idempotent — safe to rerun as new data accumulates. See addendum §4.3 for full spec.

### Phase 5c — Iconic Local curation (per curation addendum §8)

Run `scripts/poi-import/sources/iconic-curation.ts` to scrape free-tier curated lists (James Beard Foundation archive, Roadfood.com, Atlas Obscura, Eater regional heatmaps, Society for Commercial Archeology, Historic Hotels of America) and cross-reference against existing POIs. Sets `pois.iconic_local = true` plus `pois.iconic_local_reasons` array and `pois.signature_hook` for matched POIs.

Expected hit count for CA: ~150–300 POIs. Refresh quarterly. See addendum §8 for full spec.

### Phase 5d — Per-category significance floor tuning (human curator step)

After Phases 5–5c complete, **you (the human curator) review the post-import POI list** at the significance score distribution and set the per-category floor values in the `category_significance_floors` table. The schema is in place from the addendum migrations (see roadmap §4.4 step 3); only the values need filling in. Default floor is 70 across the board until set.

Recommend spot-checking 30 random POIs that pass each proposed floor before committing. See addendum §2.2.

---

## Phase 6 — Narrative extraction pipeline

This is the differentiated content — story-tied POIs from primary historical sources. Hallucination-resistant by design (RAG with required citation).

### 6a. Schema for review queue

```
Add a migration creating poi_review_queue:

- id uuid pk
- name text
- proposed_location geography(Point, 4326)
- proposed_category text
- description text                  # the LLM-generated narration-ready summary
- source_document_url text          # where the LLM found it
- source_document_title text
- source_quote text                 # the verbatim passage from the source supporting this POI
- date_or_period text
- llm_confidence real               # 0.0–1.0 from extraction
- verification_passed boolean default false   # did the second-pass verifier confirm the quote supports the claim
- review_status text                # 'pending', 'approved', 'rejected', 'needs_human'
- reviewed_by uuid nullable
- reviewed_at timestamptz nullable
- promoted_to_poi_id uuid nullable  # FK to pois.id once approved
- created_at timestamptz default now()

Index on review_status for the review UI to query efficiently.

Only after review_status='approved' does a row get promoted into pois with source_type='narrative_extracted'.
```

### 6b. Document ingestion

```
Build scripts/narrative-extraction/sources/ for ingesting historical text corpora into a local store.

Initial sources:
- WPA Federal Writers' Project "California: A Guide to the Golden State" (1939, public domain, available on archive.org as plain text and OCR'd PDF)
- Bancroft Library oral history transcripts that are openly licensed
- California Digital Newspaper Collection (CDNC, UC Riverside) — they have an API for full-text search; start with one decade as a test (e.g., 1900-1910)

For each source:
1. Download to scripts/narrative-extraction/cache/<source>/
2. Chunk into ~2000-token segments with 200-token overlap (preserve sentence boundaries)
3. Insert into a `narrative_documents` table: id, source, title, date, url, full_text, chunk_index, chunk_text. Migration first.

Don't try to be exhaustive on the first run. Get one full source ingested cleanly before adding more.
```

### 6c. LLM extraction

```
Implement scripts/narrative-extraction/extract.ts.

For each unprocessed chunk in narrative_documents, call the Anthropic API with model `claude-haiku-4-5-20251001` and this exact system prompt:

(Model choice rationale: extraction is high-volume → WPA Guide alone is ~10K chunks, CDNC scales into the hundreds of thousands. The task is well-bounded structured JSON output with a strict citation rule. Haiku 4.5 handles this competently, runs ~10× cheaper than Sonnet, and Phase 6d's verification pass with a stronger model catches false positives before they ever become POIs. The split → cheap extract, expensive verify → is the cost-optimal shape for this pipeline.)

---
You extract location-tied historical events from primary source text for a GPS-triggered storytelling app.

CRITICAL RULES:
1. You may only output a POI candidate if the source text contains a verbatim passage that directly supports the event AND ties it to a specific place.
2. You MUST quote that passage exactly in `source_quote`. Quotes longer than 60 words must be trimmed to the most relevant sentence.
3. If a candidate cannot be supported by a direct quote, do not output it. Hallucination is a critical failure.
4. Place names must appear in the source itself or be unambiguously derivable from it. Do not infer locations from world knowledge.

Output a JSON array. If the chunk contains no location-tied events, output [].

Each candidate:
{
  "name": "short evocative name for the POI (e.g., 'Steinbeck's Tortilla Flat')",
  "event_summary": "1-2 sentences describing what happened",
  "place_name_in_source": "the place exactly as named in the source",
  "geocoding_hint": "city/county/region to disambiguate during geocoding",
  "date_or_period": "as specific as the source allows",
  "source_quote": "exact verbatim quote from the source",
  "category_guess": "labor_history | literary | indigenous | gold_rush | civil_rights | crime | folklore | architecture | maritime | military | other",
  "confidence": 0.0-1.0
}
---

Pipeline per candidate:
1. Geocode geocoding_hint + place_name_in_source via Nominatim
2. If no geocode result, mark as needs_human and queue anyway with proposed_location=null
3. Insert into poi_review_queue with review_status='pending', llm_confidence=candidate.confidence

Rate limit: 5 chunks per second. Track cost. Log per-document summary (chunks processed, candidates extracted, candidates dropped for missing quote).
```

### 6d. Verification pass

```
Implement scripts/narrative-extraction/verify.ts.

For each poi_review_queue row with verification_passed=false and llm_confidence >= 0.7:

Send a fresh Claude call using model `claude-sonnet-4-6` with this prompt:

(Model choice rationale: verification is the gate that decides what becomes a POI. Low call volume → only candidates that already passed extraction filter and have confidence ⥠0.7 reach this step → so the per-call cost premium is small in absolute terms. Sonnet 4.6's stronger judgment on "does this quote actually support this claim" is worth paying for here, since false positives that pass verification flow straight into the catalog.)

---
You are verifying whether a quoted passage supports a claim. Be strict.

Claim: {row.event_summary} at {row.place_name_in_source}

Quoted passage from the source: "{row.source_quote}"

Does the quoted passage directly and unambiguously support both the event and the place? Answer with JSON only:
{ "supports": true|false, "reasoning": "1 sentence" }
---

If supports=true, set verification_passed=true. If false, set review_status='needs_human'.

Confidence < 0.7 candidates skip auto-verification and go straight to needs_human.

After verification: candidates with verification_passed=true are eligible for auto-approval if confidence >= 0.85, else they wait for human review.

Idempotent — safe to rerun.
```

### 6e. Admin review UI (lightweight)

```
Build a minimal admin route in the existing app (or a separate Next.js admin if you don't have one) at /admin/poi-review.

Features:
- List poi_review_queue rows by review_status='needs_human' or 'pending'
- For each row, show: name, event_summary, source_quote, source_document_url (linked), proposed_location on a small map, llm_confidence, verification_passed flag
- Approve / Reject / Edit buttons
- On approve: insert into pois with source_type='narrative_extracted', source_citation=`{document_url} :: "{source_quote}"`, confidence=llm_confidence, verified=true. Set promoted_to_poi_id and review_status='approved'.
- On reject: set review_status='rejected'. No poi inserted.
- Edit: allow correcting name, location (drag pin), category, description, then approve.

Auth: require admin role on the user record. Don't expose this publicly.

This is the human-in-the-loop step for the long tail.
```

---

## Phase 7 — Lazy narration cache (not bulk)

Don't pre-generate 50k POIs × all template combinations upfront — that's a $10k+ bill even after the curation addendum reduced per-POI combinations to ~10. Generate on demand.

> **⚠️ Per curation addendum §10:** the lookahead now runs a multi-step ranking pipeline (regions, narrator weights, iconic override, pace rules, resonance, gap rules) BEFORE deciding which POIs to enqueue for generation. The cache-generation logic described below stays the same; it's just called per ranked queue entry from the addendum's lookahead.

```
Modify the existing real-time narration trigger flow so that:

1. When a route starts, the lookahead system identifies the next 3-5 upcoming POIs (per the ranking pipeline in curation addendum §10) and calls the narration generator for ONLY the user's current `(audience_mode, pace, narrator_slug, trip_mode)`. The pace value (full_drive | light_touch) combined with the POI's `intrinsic_depth` picks the right depth variant for the cache key. Audience mode + narrator_slug resolves to one voice via the active `voice_configs` row. Pre-cache audio in Supabase Storage at path `{poi_id}/{trip_mode}/{depth_variant}/{narrator_slug}.opus` where depth_variant — {brief, standard, long, long_compressed}.
2. Insert a row into narration_audio after generation. The UNIQUE constraint `(poi_id, narrator_slug, depth, mode)` (added 2026-05-11 via migration `20260510000005_na_unique_add_mode`, with depth CHECK extended for the new value space) enforces idempotency on the upsert.
3. On subsequent triggers for the same key, fetch from cache.

Use the existing `pois.narration_cache` jsonb column (keyed by `{trip_mode}-{depth_variant}-{narrator_slug}` → `audio_url`) so the lookahead can check in O(1) on the POI row before hitting the `narration_audio` table.

Separately, create scripts/precache-popular-routes.ts that takes a route geometry (e.g., PCH from SF to LA) and pre-generates narration for ALL POIs along the route for the top 5 most-used `(trip_mode, depth_variant, narrator_slug)` combinations derived from recent `narration_audio` rows. Run this as a periodic job for known-busy routes only. This is a cost optimization, not a correctness requirement.

**Targeted bulk pre-generation exceptions** (per curation addendum):
- Region narrations: ~250 regions × 2 narrators × 4 audiences = ~2,000 files one-time, ~$15–25
- Long-variant audio for POIs with `significance_score >= 80`: ~$50 one-time for CA, eliminates Tell-Me-More latency

Do NOT pre-generate narrative_extracted POIs in bulk — those need to prove themselves via user feedback first.
```

---

## Suggested execution order

1. **Day 1**: Phase 0 (context) — Phase 1 (schema migration). Verify migration on a Supabase branch first.
2. **Day 2-3**: Phase 2 (scaffolding) — Phase 3a (OSM importer). Run on one county to validate.
3. **Day 4-5**: Phase 3b (Wikidata) and 3c (NRHP) and 3d (CHL). These are independent — can run in parallel.
4. **Day 6**: Phase 4 (dedup) — `--dry-run` first, eyeball the merges, then commit.
5. **Day 7**: Phase 5 (significance recompute) → Phase 5b (intrinsic depth assignment) → Phase 5c (iconic curation) → Phase 5d (human floor tuning → your editorial pass).
6. **Week 2**: Phase 6 (narrative extraction). Start with WPA Guide only — it's high-quality, public domain, and ~750 pages. If extraction works well there, expand to CDNC.
7. **Ongoing**: Phase 7 lazy cache becomes the default. Pre-cache job runs nightly for top routes.

See `roadstory-unified-roadmap.md` §4 for how this pipeline interleaves with the rest of the project (regions import, addendum migrations, narrator collapse, UI refits, etc.).

## What to watch for

- **Dedup quality**: the first dry-run will reveal edge cases (Spanish mission names, common geographic names like "Eagle Rock"). Tune the similarity thresholds.
- **Narrative extraction precision over recall**: better to drop 20% of real POIs than promote 5% hallucinated ones. Lean strict on the verification prompt.
- **Cost monitoring**: add a simple `llm_calls` log table that records every Claude/ElevenLabs call with cost. You'll want this when bills start landing.
- **Narration cache invalidation**: when you improve a narration prompt template, you'll need to bust the cache for that `(audience_mode, depth)` combo — prompt templates are organized along the audience × depth axes; `trip_mode` affects length and Storage path but not tone. `narration_audio.prompt_version` is the invalidation handle: bump the version on the template, leave old rows in place, let new generations write rows at the new version.
