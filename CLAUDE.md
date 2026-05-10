# XRoad — Claude Code Project Context

## App identity

XRoad (rebranded from RoadStory 2026-05-04) — GPS-triggered AI narration for road trips and hikes.
Package/slug names still say "roadstory" internally; all user-facing strings say "XRoad".

## Stack

- **Frontend:** React Native / Expo (no Draftbit — all UI is hand-coded) — compiles to iOS + Android from one codebase
- **Navigation:** `createNativeStackNavigator` in App.tsx (NOT Expo Router). All new screens must be registered there.
  - Registered: index, filters, customize, drive, driving, hiking, trail
- **Backend:** Supabase + PostGIS, Node.js + Express + Socket.io on :3001
- **Maps:** Google Maps / Directions / Elevation (native); Mapbox shim for web
- **LLM:** xAI/Grok; TTS is provider-abstracted via `scripts/lib/tts/`. Primary provider is Google Cloud TTS. ElevenLabs, OpenAI, Polly, and self-hosted are pluggable but inactive.
- **Design tokens:** `lib/theme.ts` → `C` object. `lib/mapStyle.ts` → `MAP_STYLES`.

## Screen flows

```
index.tsx → customize.tsx → drive.tsx     (narrator-aware driving — primary flow)
index.tsx → filters.tsx   → driving.tsx   (legacy flow, still functional)
hiking.tsx → filters.tsx (mode='hiking') → trail.tsx
```

## Hard rules — never break these

**Units:** Miles and feet only in any user-facing text. Meters only for internal calculations and DB storage. Never show "km" or "m" to the user.

**DB architecture:** Always reuse existing Supabase tables and RPC functions. Do not create parallel or shadow tables for new features. Extend with new columns / RLS policies / updated RPC params instead.

**Category slug mapping:** UI labels ≠ DB slugs. The `get_corridor_pois` RPC filters by `c.slug = ANY(category_filter)` (case-sensitive). Always apply `CAT_SLUG` mapping from `app/customize.tsx` before any RPC call:
- History→history, Nature→nature, Architecture→architecture
- Food→food_drink, Music→local_culture, Weird→hidden_gems
- Roadside→local_culture, Film→art, Science→geology

**Scenic badge:** Never assign "Scenic" by elimination. Only award it when a route has strictly more POIs than the fastest route (`poiCount`). If POI data is null, show no badge.

**Mobile-only:** No desktop UI. Design at 390×844 (iPhone) / 412×915 (Android). Touch targets ≥ 64pt on the Drive screen.

**Drive screen safety:** No primary info as readable text while driving. "End trip" always visible and oversized. No nested menus on Drive.

## Screen pages (primary flow)

User mental model / naming convention used in conversation:
- **Page 1 — Home:** `app/index.tsx` — route search, map
- **Page 2 — Configuration:** `app/customize.tsx` — narrator + filters
- **Page 3 — Trip:** `app/drive.tsx` — active driving/hiking screen

## Key files

| File | Purpose |
|------|---------|
| `app/index.tsx` | Map screen — route search, POI display. Sheet starts at `peek`, auto-snaps to 85% when routes load. No trail mode state here — always fetches in `'driving'` mode. |
| `app/customize.tsx` | Narrator + filter selection; saves trip; live story count |
| `app/drive.tsx` | Full-screen map + draggable sheet; socket narration; GPS. Route polyline: `#4A90D9` blue, strokeWidth 5, rounded. `fitToCoordinates` on mount (400ms delay). Contains `trailMode` state. |
| `app/driving.tsx` | Legacy driving screen |
| `app/hiking.tsx` / `trail.tsx` | Hiking flow |
| `lib/supabase.ts` | All DB functions + type exports |
| `lib/theme.ts` | Color tokens (`C`) |
| `lib/mapStyle.ts` | Map style config + persistence |
| `lib/routeBadges.ts` | `computeBadges()` + `computeRouteTags()` — pure, unit-tested |
| `hooks/useSheetSnap.ts` | Draggable bottom-sheet with 3 snap levels |
| `hooks/usePOIStream.ts` | GPS watch + proximity trigger |
| `hooks/useTTS.ts` | Cache-first narration hook — voice_configs lookup → pois.narration_cache → narration_audio table → server generation |
| `scripts/precache-popular-routes.ts` | CLI: pre-generates narration for POIs along a named route or GeoJSON file |
| `scripts/sweep-orphaned-narration.ts` | Sweeper: deletes stale pending rows (> 1 h) and old failed rows (> 24 h) from narration_audio + tries Storage cleanup. Run hourly. |
| `components/MapStylePicker.tsx` | Floating map style selector. Button shows 22×22 thumbnail of active style (not a bars icon). Trail mode toggle prop still exists but is not wired from any screen. |
| `components/XRoadLogo.tsx` | Brand wordmark — "X" teal #2EC4B6 + "Road" cream; sizes `sm`/`md`; road-intersection icon |
| `server/` | Node.js + Express + Socket.io on :3001 |

## drive.tsx UI details

- **Back button** — top-left map overlay, inside `overlayTL` row before the narrator avatar chip. Circular dark button `←`. Shows confirmation alert before navigating back to customize.
- **Sheet snap points** — two states only: `peek` (96px) and `expanded` (82% screen height). `default === expanded` so the hook naturally collapses to two snaps. Sheet starts expanded.
- **Peek state** — shows only: play/pause + skip forward + End Trip. Everything else hidden, map visible above.
- **Expanded state** — single ScrollView containing: now-playing card, feedback/rating card, ⏮/▶/⏭ controls, up next queue (5 items, sorted by arc-length along route), story corridor slider. Below the scroll (pinned): mode segment + action row.
- **Story corridor slider** — `PoiSlider` component (same as customize.tsx) in the expanded sheet. State: `poiDist` initialized from `filters.corridorMi`. Changes trigger POI re-fetch.
- **Up next queue** — sorted by `arcLengthAlongRoute()` (projected arc-distance from route start). Display distance (`distanceMi`) comes from `liveQueue` — haversine from user's GPS position once available, arc-length from route start before GPS is acquired.
- **Top-right counter** — shows `pois.length` (total POIs loaded along route), falling back to `routePreview.storyCount` before POIs load. Label is "stories" / "story".
- **Distance field trap** — `get_corridor_pois` RPC returns `dist_from_route_m` (perpendicular distance to route line), NOT `distance_m`. Never sort or display distances using `p.distance_m` from corridor queries — it will always be `undefined`. Use `arcLengthAlongRoute()` for sequential ordering and `haversineM()` from user position for live display.
- **Mode segmented control** — `[🚗 Driving | 🥾 Hiking]` pinned above action row, outside the ScrollView. Active side fills with `ACCENT_LIGHT`. Toggling hiking re-fetches POIs in `'hiking'` mode and auto-switches map to Topo. Switching back restores the previous map style (`prevStyleRef`).
- **Recenter button** — `CompassIcon` component (teal north triangle + muted south triangle + "N" label). Positioned at `bottom: DRIVE_SNAPS.peek + 64` (above the MapStylePicker pill at `+16`) to avoid overlap.
- **MapStylePicker** — `buttonBottom: DRIVE_SNAPS.peek + 16`, `buttonRight: 12`.
- **POI callout card** — tapping any POI marker shows a floating overlay card at `bottom: DRIVE_SNAPS.peek + 20`. Displays POI name, category (teal uppercase), and tags as chips (underscores → spaces, up to 5). Tapping the same marker again or pressing `×` dismisses it. State: `selectedPoi: POI | null`. Markers use `tracksViewChanges={false}` for performance.

## customize.tsx UI details

- **Back button** — top-left of map header overlay (`s.backBtn`, circular dark, `←`). Calls `navigation.goBack()` → returns to index (home).

## Supabase schema (key tables)

- `pois` — geography(Point,4326), category_id FK, tags[], significance_score numeric(4,2) **0-100 integer-point scale** (importers write 0-1 fractions; recompute-significance.ts normalises to 0-100), trip_mode('driving'|'hiking'|'city'|'all'). Provenance columns (added 20260504000005): source_type CHECK ∈ {osm,wikidata,nrhp,state_landmark,gnis,narrative_extracted,editorial,user_contributed}, source_id, source_citation, confidence_score(0–1, default 1.0), verified bool, additional_sources text[], merged_into uuid (self-FK, set when row is a merged duplicate), imported_at. Partial UNIQUE(source_type, source_id) WHERE merged_into IS NULL. `significance_breakdown jsonb` (added 20260504000006): `{ source_base, cross_source, pageviews, route_adjacency, total }` in integer points — populated by recompute-significance.ts. `narration_cache jsonb` (added 20260504000014; populated by server after generation): `{ "{mode}-{depth}-{voice_id}": "{audio_url}" }` — O(1) lookup on the same row as the POI, checked before the narration_audio table. Venue columns (added 20260504000016): `parent_poi_id uuid` (self-FK to parent venue), `is_venue bool`, `venue_polygon geography(Polygon, 4326)`, `venue_type text` (14-value CHECK enum), `venue_metadata jsonb`. Cross-column constraints prevent venue/child overlap.
- `poi_categories` — id, slug, display_name, sort_order, relevant_driving bool
- `narrators` — preset narrator rows; 4 seeded with fixed UUIDs `00000000-0000-0000-0000-00000000000{1-4}`
- `user_narrators` — user-created narrators; slug GENERATED as `'user-' || id`
- `trips` — route_id, narrator_id, user_narrator_id, depth, category_filter[], status, started_at
- `narration_audio` — poi_id, narrator_slug (= voice_id), depth, audio_url (nullable — NULL while pending), mode, status CHECK('pending','ready','failed') DEFAULT 'ready'. UNIQUE(poi_id, narrator_slug, depth). 30-day TTL. Added columns (migration 20260504000011): provider, character_count, duration_ms, cost_usd, prompt_version. Added (migration 20260504000013): status, mode, audio_url made nullable.
- `user_contributions`, `user_badges`, `contribution_rewards` — contribution/points system
- `user_recent_locations` — **PENDING MIGRATION** (SQL is in lib/supabase.ts as a comment)
- `venue_classification_review` (added 20260504000016) — admin queue for venue candidates without polygons

Key RPCs: `get_corridor_pois`, `get_nearby_pois(... , p_include_children boolean DEFAULT false)` (patched 20260504000016 — children excluded by default for drive-by), `get_available_narrators`, `submit_contribution`, `get_cached_narration`, `cache_narration`, `batch_route_adjacency_scores(poi_ids uuid[])` (returns per-POI adjacency points from `highway_routes`), `batch_update_significance(p_ids, p_scores, p_breakdowns)` (batch UPDATE used by recompute script), `update_poi_narration_cache(p_poi_id, p_cache_key, p_audio_url)` (added 20260504000014 — atomic jsonb merge used by narration generation route), `get_venue_tour_pois(p_parent_poi_id, p_user_lat?, p_user_lon?)` (added 20260504000016), `detect_venue_at_location(p_lat, p_lon)` (added 20260504000016 — innermost venue at coordinate)

## Narration cache key

Always: `{poi_id}-{mode}-{depth}-{voice_id}.opus` (Storage path) / `{mode}-{depth}-{voice_id}` (JSON key in pois.narration_cache)

## hooks/useTTS.ts — architecture (rewritten this session)

**Options:** `{ mode: NarrationMode, depth: NarrationDepth }` — no longer takes `voice`, `guideName`, or `tone`.

**Lookup chain (fastest → authoritative):**
1. `poi.narration_cache["{mode}-{depth}-{voice_id}"]` — O(1) if POI row includes this field
2. `narration_audio` table query by `(poi_id, narrator_slug=voice_id, depth, status='ready')`
3. `POST /api/narration/generate` — only when `generateIfMissing=true`

**Public API:**
- `narratePOI(poi, depth?, generateIfMissing=false)` — depth defaults to hook's `options.depth`
- `getNarrationUrl(poiId, depth, poi?, generateIfMissing=false)` → `string | null`
- `prefetchPOIs(upcomingPOIs, depth?)` — batch URL resolution, no generation
- `cacheAllPOIs(pois, onProgress?, depth?)` — generate-if-missing, used by hiking offline-first flow
- `speakText(text)` — delegates to `POST /api/narration/preview` for voice preview (filters.tsx)
- `stop()`, `speaking`, `loading`, `error`

**Callers updated:**
- `driving.tsx`: `useTTS({ mode: 'driving', depth: filters.depth ?? 'ride_along' })`
- `trail.tsx`: `useTTS({ mode: 'hiking', depth: filters.depth ?? 'ride_along' })`
- `filters.tsx`: `useTTS({ mode: 'driving', depth: filters.depth })`
- Q&A feature (`askQuestion`) stubbed out — was xAI-specific, not yet reimplemented

**voice_configs RLS note:** Hook reads this table via anon key. Add an anon SELECT policy for `is_active = true` rows before voice picks are committed, or every narration call will throw with a clear "no active voice configured" error (fail-loud — no silent fallback).

## Server narration routes (`server/routes/narration.js`)

Registered at `app.use('/api/narration', narrationRouter)` in `server/index.js`.

**`POST /api/narration/generate`** — body: `{ poi_id, poi_name, poi_category, poi_tags, mode, depth, voice_id? }`  
`voice_id` is optional — server looks it up from `voice_configs` (fail-loud) if absent.

Write ordering (atomic, status-tracked):
1. INSERT `narration_audio` with `status='pending'`, `audio_url=NULL` → get `pendingId`
2. Generate Claude text → fire-and-forget log `llm_calls` (`call_type='claude'`, `related_id=pendingId`)
3. Synthesize Google TTS → fire-and-forget log `llm_calls` (`call_type='tts'`, `related_id=pendingId`)
4. Upload Opus to Storage at `{poi_id}/{mode}/{depth}/{voice_id}.opus`
5. UPDATE `narration_audio` SET `status='ready'`, `audio_url`, `duration_ms`, `cost_usd` WHERE `id=pendingId`
6. Fire-and-forget: patch `pois.narration_cache`
7. Returns `{ audio_url }`

On error at steps 2-5: UPDATE `status='failed'`, rethrow. Do NOT delete Storage inline — sweeper handles it.

**`POST /api/narration/preview`** — body: `{ text, voice_id }` — synthesizes arbitrary text for voice preview. Uploads to `preview/{voice_id}.opus` (transient, overwritten). No DB row. Returns `{ audio_url }`.

**New server dep:** `@google-cloud/text-to-speech: ^5.3.0` — run `npm install` in `server/`.
**New env vars for server:** `ANTHROPIC_API_KEY`, `GOOGLE_APPLICATION_CREDENTIALS` (added to `server/.env.example`).

## Narration prompt construction — current vs. planned (recon 2026-05-10)

**Two parallel implementations exist; only the simpler one is wired to production.**

### Wired (production today)
`server/routes/narration.js` calls a generic ~10-line inline prompt at `generateNarrationText()` ([narration.js:66-114](server/routes/narration.js#L66-L114)). No narrator persona, no `audience_mode` awareness. Same for `scripts/precache-popular-routes.ts` ([precache-popular-routes.ts:103-138](scripts/precache-popular-routes.ts#L103-L138)) — duplicated copy of the same prompt. Mode/depth axes affect length (`DEPTH_CFG`) and Storage path only; they do not change tone.

### Unwired (richer engine, dead in production)
`server/narration-engine.js` is a composable narrator-aware engine: `base_prompt(narrator)` + `depth_modifier(depth)` + `context_injection(trip_context, history, narrator, corridor_mode)` + JSON `OUTPUT_FORMAT`. Reads narrator persona from `narrators` table. Exports `generateNarration({poi, narrator, depth, trip_context, narration_history, corridor_mode})` and `updateNarrationHistory(history, newEntry)`. Audience-mode-scaled history injection: kids→count only, family→theme list, local/unfiltered→full callbacks + running gags. Depth ranges baked in: glance 15-30s / ride_along 45-90s / deep_dive 120-240s.

**No callers reference it** (`grep narration-engine` matches only the route's own comment + this file).

### Why it's not wired — `server/lib/llm.js` is xAI/Grok, not Claude
`narration-engine.js` calls `callLLM` from `./lib/llm`, which posts to `https://api.x.ai/v1/chat/completions` with model `grok-2-latest` and `response_format: {type: 'json_object'}`. Project has been migrating off xAI (see Q&A `askQuestion` stub note in useTTS.ts section). Calling the engine's exported `generateNarration()` from the route would fire xAI, double-spend, and drop off the `provider='anthropic'` audit trail in `llm_calls`. Engine must be invoked for **prompt construction only** — never its LLM call.

### Integration plan (when wiring it up)
Approach: **adapter shim, not pure swap.**
1. Add `buildNarrationPrompts({poi, narrator, depth, trip_context, narration_history, corridor_mode})` export to `narration-engine.js`. Returns `{systemPrompt, userPrompt, maxTokens}` — no LLM call. Existing `generateNarration()` export stays untouched (still xAI-bound, still uncalled).
2. In `server/routes/narration.js`:
   - Module-level narrator cache keyed by `audience_mode` (4 rows, never change in a server lifetime). Lookup query: `SELECT slug, system_prompt_fragment, tone_keywords, content_guardrails, audience_mode FROM narrators WHERE audience_mode = $1 AND is_active = true AND is_preset = true LIMIT 1`. Fail-loud on miss (mirrors `lookupVoiceConfig`).
   - Per-POI fetch: `SELECT description, significance_score FROM pois WHERE id = $1`. Optional context — engine accepts missing.
   - Synthesize neutral `trip_context` stub (route is stateless re: trip).
   - Call `buildNarrationPrompts` → POST to Anthropic with engine-built system + user prompts (Claude, same retry logic, same `claude-sonnet-4-6` model).
   - Parse JSON response (engine's `OUTPUT_FORMAT` demands JSON), extract `.narration`. Inline an `extractJSON()` helper (see `server/lib/llm.js:4-7` for the markdown-fence stripper pattern).
   - Bump `PROMPT_VERSION` 1 → 2 so post-rewire `narration_audio` rows are distinguishable.
   - Delete the generic prompt path entirely (no flag-gate — there's no caller that needs it).
3. **trip_context wart:** engine's `context_injection` always emits a trip-progress sentence ("Starting the X trip" or "X/Y stories told"). For precache the route doesn't know what trip will play the audio. Mitigation: add a `precache_mode: true` flag in `context_injection` that suppresses the trip-progress sentence — 6-line engine change, contained, gives clean output. (Alternatives: pass neutral stub and accept "Starting the road trip trip — this is the opening narration" wart, or `route_summary: ''`.)
4. **Out of scope:** TTS abstraction, voice_configs schema, narration_audio schema, precache `--top-n` flag, tests (none exist for the route — note but don't add).

Audience guardrails are **all four modes seeded and engine-ready** in `narrators.content_guardrails` — Family, Kids ("Strict. No violence, death, or disturbing content"), Unfiltered (18+ age-gate), Local. No tech-debt flag for missing Kids.

## Narrator preset UUIDs (hardcoded + seeded)

```
00000000-0000-0000-0000-000000000001  the-professor
00000000-0000-0000-0000-000000000002  the-truck-driver
00000000-0000-0000-0000-000000000003  the-junior-ranger
00000000-0000-0000-0000-000000000004  the-local
```
`PRESET_NARRATORS` in customize.tsx is a fallback for when `getAvailableNarrators()` fails. The DB is seeded with these same IDs so FK constraints on trips.narrator_id always pass.

## Testing

```
npm run test   # Jest + ts-jest
```
Tests in `lib/__tests__/routeBadges.test.ts` (10 tests, all passing).

## End-trip navigation pattern

The only reliable pattern for navigating to root on both platforms:
```ts
navigation.dispatch(CommonActions.reset({ index: 0, routes: [{ name: 'index' }] }));
```
Web fallback uses `window.confirm()` before calling `doEndTrip()`.

## POI ingestion pipeline (in progress)

Multi-source POI pipeline plan, executed in phases:

1. **Schema migration** — ALL APPLIED (verified 2026-05-07, watermark 20260504000016). All provenance + venue columns live in DB.
2. **ETL scaffolding** — done (`scripts/poi-import/`). Isolated package.json (commander, chalk, tsx, dotenv, **pg ^8.13.3**, **xlsx 0.18.5**). Implements: `lib/types.ts` (NormalizedPOI, ImportOptions, ImportResult), `lib/supabase.ts` (Supabase admin client via SUPABASE_SERVICE_ROLE_KEY + `getPgPool()` via DATABASE_URL for geometry writes), `lib/dedupe.ts` (token-set ratio + Levenshtein + haversine), `lib/geocode.ts` (Nominatim, 1 req/sec, disk cache), `lib/significance.ts` (weighted signal scoring), `lib/category-map.ts` (OSM/Wikidata tags → CategorySlug), `lib/upsert.ts` (100-row batches, direct pg SQL with `ST_GeogFromText()`, `ON CONFLICT (source_type, source_id) WHERE merged_into IS NULL`; deduplicates within each batch by `source_type:source_id` before Postgres INSERT to prevent `ON CONFLICT DO UPDATE command cannot affect row a second time` from duplicate ref numbers in source data), `lib/wikidata-types.ts` (26 Wikidata P31 class definitions with bonus weights). CLI: `run.ts` with `--source=osm|wikidata|nrhp|ca-landmarks|gnis|all --bbox --county --state --limit --dry-run --force`.

   **Why direct pg instead of Supabase JS client for upserts:** PostgREST's schema cache structurally excludes `geography` typed columns — the JS client cannot write to `pois.location`. All geometry writes go through `pg` with `ST_GeogFromText(wkt)`. The geometry column is named `location` (not `geom`). `DATABASE_URL` must be the direct connection string (`db.[project-ref].supabase.co:5432`), not the pooler. URL-encode special chars in password (e.g. `?` → `%3F`).

   **run.ts dotenv:** loads `../../.env` (repo root) via explicit path — safe regardless of invocation directory.

   **recompute-significance.ts dotenv:** also uses explicit `../../.env` path (not `dotenv/config` which reads from CWD). Fixed 2026-05-06.

   **recompute-significance.ts invocation:** must be run from `scripts/poi-import/` — always `cd` there first. PowerShell requires quoted paths when the directory contains spaces: `Set-Location "E:\Dev XRoad\roadstory\scripts\poi-import"` then `npx tsx recompute-significance.ts`. Last live run: 21,906 active POIs recomputed successfully (2026-05-07, post-Phase-4 NRHP geocoding).

   **batch_update_significance SQL fix (2026-05-06):** PostgreSQL does not allow a column definition list with multi-arg `UNNEST(a, b, c) AS u(col1, col2, col3)`. Fixed in `supabase/migrations/20260504000006_poi_significance_breakdown.sql` and `supabase/apply_pending_migrations.sql` to use a subquery: `FROM (SELECT unnest(p_ids) AS id, unnest(p_scores) AS score, unnest(p_breakdowns) AS breakdown) AS vals`. Live DB patched via direct `pg` connection.

   **osm.ts Overpass headers:** fetch includes `Accept: '*/*'` and `User-Agent: 'RoadStory-POI-Import/1.0 ...'` — required to avoid HTTP 406 from overpass-api.de.

   **CLI invocation:** `run.ts` uses a `import` subcommand — `npx tsx run.ts import -s wikidata --dry-run`. The `-s` flag (not `--source`) is under the `import` subcommand, not the top-level program.
3. **Source importers** — all 5 done.
   - **`sources/osm.ts`** ✅ **LIVE** — Overpass API, 18-filter union query (historic/tourism/natural/leisure/amenity/man_made), 1°×1° tiling for large bboxes, 2s rate limit + exponential backoff on 429/504, per-cell JSON cache, significance additive formula (+20 wikipedia, +10 wikidata, +15 heritage, +10 tourism=attraction, +5 image). First live run: 293 POIs inserted for San Luis Obispo county. Second live run (2026-05-07): 3,863 POIs inserted for Los Angeles County (5,840 raw → 3,863 normalized → 3,863 inserted, 0 errors, 70.9s).
   - **`sources/wikidata.ts`** ✅ — SPARQL endpoint, 26 P31 classes via `lib/wikidata-types.ts`, `wikibase:box` bbox filter (NOT `geof:latitude/longitude` — those are GeoSPARQL functions unsupported on Wikidata's Blazegraph and cause a 500), LIMIT 1000/OFFSET pagination. Combined 26-class query attempted first; 502/503/504 treated as timedOut → falls back to per-class queries. **Wikipedia sitelink lookup uses MediaWiki `wbgetentities` API** (`wikidata.org/w/api.php`) — NOT SPARQL (SPARQL 429s at 120s Retry-After under load). Batch size 50 QIDs (hard API limit), 200ms inter-batch pause, 5 retries with exponential backoff [2s/4s/8s/16s/32s], cache prefix `api-wt-{bbHash}-{bHash}.json`. `wikibase:box` blocks Wikidata's sitelinks graph so the OPTIONAL inside the main query returns nothing — the MediaWiki API batch is a separate post-processing step. Significance: +0.25 wikipedia +0.05 image +classBonus/100.
   - **`sources/nrhp.ts`** ✅ **LIVE** — Scrapes NPS downloads page for current XLSX URL, downloads with 30-day file cache (`cache/nrhp/*.meta.json` sidecar), parses with SheetJS, geocodes all entries via Nominatim (NPS spreadsheet has no coordinates) with 3-tier fallback (full address → city+county → county centroid), NHL flag detected from "NHL Designated Date" column, significance 0.30 base +0.10 NHL bonus. First live run: 3,088 California listings, geocode hit=3,088 miss=0. **Column quirks (fixes applied 2026-05-06):** refNum column is `"Ref#"` (not "Reference Number"); state values are full uppercase names `"CALIFORNIA"` (not `"CA"`); resource type column is `"Category of Property"` (not "Type" — "Request Type" is a different column that substring-matched first).
   - **`sources/ca-landmarks.ts`** ✅ **FIXED (2026-05-06)** — Hub-page rewrite complete + three parser bugs fixed. Hub page (`List_of_California_Historical_Landmarks`) now links to 58 per-county sub-articles; importer fetches each (30-day cache `county-{slug}.html`). **County sub-article table structure** (verified against San Luis Obispo): `class="wikitable sortable"`, columns: Image | CHL# | Landmark name | Location | City | Summary. CHL number is in a **`<th>` cell** (yellow, `<small>NUM</small>`), NOT a `<td>`. Geo is in a hidden `<span class="geo">lat; lng</span>` (semicolon + space before longitude). **Three bugs fixed:** (1) header-row skip `/<th[\s>]/` fired on every data row (each has a `<th>` for CHL#) — replaced with `!/<td[\s>]/` check; (2) `parseTdCells()` ignored `<th>` so CHL number was never found — replaced with dedicated regex `/<th[^>]*>\s*<small>(\d+)<\/small>\s*<\/th>/i` on raw row HTML; (3) geo regex `/;([\d.+-]+)/` didn't match the space after the semicolon — fixed to `/;\s*([\d.+-]+)/`.
   - **`sources/gnis.ts`** ✅ — Queries USGS S3 listing API (`prd-tnm.s3.amazonaws.com`) to discover latest `CA_Features_YYYYMMDD.zip`. Downloads + caches 30 days. Minimal built-in ZIP extractor using `zlib.inflateRaw` (no extra deps). Allowlisted classes: Summit, Falls, Cape, Arch, Bay, Pillar, Crater, Geyser, Hot Spring, Lava, Lake, Island, Range. Flexible pipe-delimited column detection; skips zero-zero stale coords. significance=0.05 (intentionally low — dedup boosts if cross-referenced), confidence=0.8.
   - Note: `import` is reserved — all importers export `runImport(opts): Promise<ImportResult>`.
4. **Dedup** — done (`scripts/poi-import/dedupe.ts`, standalone script). Two-phase pass: A=spatial fuzzy, B=name-collapse. **Uses `pg` directly** (PostgREST cannot read `geography` columns). Loads all active POIs (`merged_into IS NULL`) via raw SQL with `ST_X(location::geometry) AS lng, ST_Y(location::geometry) AS lat` (column is `location`, not `geom`). Reads `category_slug` via JOIN poi_categories (Phase B needs it). Optional bbox filter applied server-side in SQL. Picks primary by source priority (editorial > state_landmark > nrhp > wikidata > osm > gnis > narrative_extracted > user_contributed) then significance then UUID. Merges: primary gains `additional_sources[]` entry + longest description; secondary gets `merged_into = primary.id`. **Dedup does NOT touch `significance_score` or `significance_breakdown`** (fixed 2026-05-07 — see scale-bug note below). Merge writes wrapped in `BEGIN`/`COMMIT`/`ROLLBACK` per group (50 concurrent). **dotenv:** loads `../../.env` repo root explicitly (not CWD). Run: `npx tsx dedupe.ts [--dry-run] [--county <name>] [--limit <n>]`. Prints Phase A/B breakdown, top names by merge count, 21-California-Missions consolidation table, source-pair merge table, guard rejection table, partial index DDL suggestion.

   **Phase A — spatial fuzzy (50 m gate).** Builds 0.001° spatial grid in memory, finds candidate pairs within 50m (haversine), confirms by name similarity (tokenSetRatio > 0.9 OR levenshteinRatio > 0.85 OR substring). Chain-merge guard: outer POI breaks inner loop if it becomes secondary mid-scan. Verified against live data (17,390 POIs): 433 merges, 38 digit-blocked, 4 sensitive-token-blocked — all 42 rejections confirmed correct.

   **Phase B — name-collapse (2 km gate, exact normalized name).** Added 2026-05-07 to fix linear/extended features (Hollywood Walk of Fame ≈ 2.3 km long) and compound-property anchor drift that exceeds 50 m (mission complexes, courthouses, multi-block historic districts). Groups active POIs by `normalizeName(name)` (cross-category — only POI-level category filter applies). For each group ≥2: sorts by source priority, picks medoid (highest priority), includes all members within `NAME_COLLAPSE_RADIUS_M = 2000` of medoid. Excludes categories `{nature, geology, natural_feature}` (peaks/lakes/waterfalls legitimately repeat names). Generic-name reject list (`COLLAPSE_GENERIC_NAMES`): mural/statue/memorial/plaza/park/sculpture/fountain/bench/marker/tree/rock/garden/viewpoint/overlook/trail/sign/art/public art/mural art/painting/installation/monument. Cluster cap `MAX_CLUSTER_SIZE = 50` per primary (defensive — has not fired in production). Uses same digit + sensitive-token guards as Phase A via shared `passesGuards()`. Phase B only considers POIs not already merged in Phase A. First live run (2026-05-07): 238 merges, 0 errors. Walk of Fame collapsed 37→1, Jurassic World—The Ride 4→1, +200 misc compound properties; only "sculpture" triggered generic reject (4 POIs); cluster cap unfired; max cluster=36.

   **Shared false-positive guards** (similarity check runs first; guards only fire on pairs that would otherwise merge — counters are accurate): (a) **Digit mismatch** — if both names contain digit sequences and the sets differ, reject (e.g. "Case Study House No. 16" vs "No. 9", "6 Mile Corral" vs "8 Mile Corral"); if only one name has digits, allow. (b) **Sensitive token** — if differing tokens include a cardinal direction {north, south, east, west, central, nw, ne, sw, se} or cultural marker {chinese, japanese, mexican, italian, korean, filipino, hispanic, african, native, indigenous}, reject. NRHP "Boundary Increase" amendments always bypass both guards. Refactored to standalone `passesGuards()` in dedupe.ts so Phase A `matchReason()` and Phase B `findNameCollapsePairs()` share identical guard logic.

   **`normalizeName` accent handling** (`lib/dedupe.ts`): NFD decomposition + `/[̀-ͯ]/` strip combining marks, plus an explicit `ACCENT_MAP` fallback covering á/à/â/ä/ã/å/é/è/ê/ë/í/ì/î/ï/ó/ò/ô/ö/õ/ú/ù/û/ü/ñ/ç. The accent map is defensive — NFD already covers all Latin-1 supplement diacritics; the map exists for any future pre-composed glyphs that don't decompose. Also exported: `exactNormalizedNameMatch(a, b)` helper.

   **Data-quality backlog** — issues auto-dedup intentionally leaves alone (different things sharing partial names, bad upstream coordinates, language variants, venue sub-features) are tracked in [docs/data-quality-issues.md](docs/data-quality-issues.md) for the eventual `poi_review_queue` admin app (Phase 6). Currently 6 entries: 3 manual-review cases (Soledad Museum, Mission San José NRHP at wrong coords, Avila Adobe misnamed as Mission San Fernando Rey) + 3 Phase B follow-ups (Walk of Fame canonical merge, Misión↔Mission language equivalence, Disney/Universal rides outranking real landmarks).

   **Score-clamp scale bug — fixed 2026-05-07.** dedupe.ts:658 had `Math.min(1.0, primary.significance_score + (newBonus - prevBonus))` which assumed a 0-1 scale but ran against editorial venues seeded at 40 (0-100 scale). The clamp pushed `significance_score` to 1.0; the next recompute then read `breakdown=null AND score=1.0`, applied the `raw <= 1.0` branch of `deriveSourceBase`, and locked `breakdown.source_base = 100`. The score itself self-healed on next recompute (because the breakdown total is recomputed), but the inflated `breakdown.source_base` persisted because `deriveSourceBase` is idempotent. Fix: dedup no longer writes `significance_score` at all — the score is wholly owned by recompute. One-off repair (26 rows): 23 editorial venues set back to `breakdown.source_base = 40` (= seed-venues.ts:468 baseline); 3 narrative-promoted clamp sentinels (Hollywood Sign, Mammoth Mountain, Mount Whitney) set to `ROUND(confidence_score * 60)` per admin/.../actions.ts:59. Full-corpus recompute then refreshed 22,144 totals.
5. **Significance recompute** — done (`scripts/poi-import/recompute-significance.ts`). Runs after import + dedup. Four components capped at 100: (a) `source_base` — existing score normalised to 0-100 pts (idempotent: reads from `breakdown.source_base` on re-runs); (b) `cross_source` — +10 per `additional_sources` entry, max 30; (c) `pageviews` — Wikipedia 30-day views via Wikimedia REST monthly API on log scale 0-20 pts (100→5, 1k→10, 10k→15, 100k+→20), 7-day file cache in `cache/pageviews/`; (d) `route_adjacency` — +10 within 1km of major CA highways (I-5, US-101, CA-1, I-80, I-15), +5 within 5km of any Interstate/US highway, via `batch_route_adjacency_scores` RPC against `highway_routes` table. Writes `significance_score` (0-100) + `significance_breakdown` jsonb. Run: `npm run recompute [-- --dry-run] [-- --skip-pageviews] [-- --force-pageviews] [-- --batch-size 1000] [-- --ids <comma-uuids>] [-- --bbox <minLat,minLon,maxLat,maxLon>]`. **Adjacency sub-batching:** recompute calls the RPC in chunks of 100 POIs (not the full 1000) to avoid Supabase statement timeout — see `ADJACENCY_SUB_BATCH` constant in the script. **highway_routes is now seeded** (2026-05-06): 221 CA highway refs (5 major_ca, 54 interstate, 30 us_highway, 132 state_highway) fetched from Overpass API via `seed-highway-routes.ts`. Geometries simplified to 0.001° tolerance; geography GiST index added.

   **Pageview API date-range bug — fixed 2026-05-07.** The Wikimedia REST `/per-article/.../monthly/{start}/{end}` endpoint requires `start = first-of-target-month` and `end = first-of-NEXT-month` (it rejects start==end with HTTP 400 "no full months between dates"). The previous code passed `${stamp}/${stamp}`, so every pageview call had been silently failing across the entire 20k-POI corpus and the pageview signal was always 0. Now requests `[lastMonth, thisMonth]` and picks the lastMonth row out of the response. Cached entries from before the fix were 404s only (HTTP 400 was never cached) so no cleanup needed.

   **Pageview Q-fallback path** — when `source_citation` is not an enwiki URL, the recompute now resolves `venue_metadata.wikidata` (or a Wikidata URL embedded in the citation) to an enwiki title via `lib/wikidata-sitelinks.ts` (wbgetentities API, 50 QIDs/req, 30-day disk cache at `cache/wikidata-sitelinks/`). Resolved title is gated by a name-match check (`tokenSetRatio` ≥ 0.4 or substring containment) so a stale/wrong Q doesn't attribute someone else's pageviews to our POI. When `--ids`/`--bbox` is set the script also prints per-POI Q→title→pageview attribution + top-5 movers + a list of Q-numbers rejected by the name-match gate (signal that the catalog has wrong Q-numbers).

   **Editorial venue Q-number audit — completed 2026-05-07.** The seed-venues.ts catalog had wrong Q-numbers for ~92% of entries (Q758 was "Zinc" not Yosemite, Q49273 was "Lubbock, Texas" not Joshua Tree, etc.). `audit-venue-qids.mjs` calls `wbsearchentities` for each venue, scores candidates by token-set ratio (with stopwords-preserved tiebreaker) plus a California locality bonus (+0.2 for "California" in label/description; -0.5 for non-CA US states in absence of California — handles cases like Death Valley NP that legitimately mentions Nevada). Run `node audit-venue-qids.mjs` for a propose-only run; `--apply [--min-ratio=1.0]` commits. Live run applied 59 perfect-match (ratio=1.0) corrections; 7 already-correct kept; the 7 sub-1.0 / manual cases (Forest Lawn, Pierce Brothers, Bodie SHP, Hearst SSSHM, Mission Dolores Cemetery, Mission La Purísima Concepción, Mountain View Cemetery (Oakland)) were resolved manually 2026-05-07 — 6 got verified Q-numbers with enwiki sitelinks (Q1437214, Q1358639, Q832945 = "Bodie, California", Q378143 = Hearst Castle redirect, Q6464680, Q3866478); Mission Dolores Cemetery has no clean Wikidata entity for the cemetery alone and remains unfilled. Hearst SSSHM points to Q378143 (same as the Hearst Castle venue) which gets rejected by the recompute name-match gate at ratio=0.20 — both venues' pageview attribution comes from the Castle article, but the gate keeps SSSHM at pv=0; revisit if the gate is loosened or an alias system is added.

   **Diagnostic driver** — `audit-editorial-pageviews.mjs` runs a before/after audit query plus a scoped recompute for the 75 editorial venues with Q-numbers. Use this to verify the pageview signal is populating after a Q-number catalog change.

   Last recompute (2026-05-07, post-Phase-4 NRHP geocoding): 21,906 active POIs, zero errors. Score distribution: 19.3% in 0–9, 40.4% in 10–19, 5.7% in 20–29, 16.0% in 30–39, 12.6% in 40–49, 4.1% in 50–59, 1.4% in 60–69, 0.4% in 70–79, 0.1% in 80–89, ~0% in 90+; only 3 POIs at 100 (Grizzly River Run OSM-child, Santa Monica Pier wikidata, Walk of Fame OSM-medoid). NRHP confidence_score=0 residual: 167 (down from ~2,099 pre-Phase-4; 1,915 rows lifted to confidence=1.0 via NRHP coordinate refetch from the NPS ArcGIS FeatureServer, 239 absorbed into siblings via dedup, remaining 167 are unparseable / long-move-skipped / outside-CA cases — all properly excluded from drive-by surfaces by the `confidence_score >= 0.5` filter in `get_nearby_pois` and `get_corridor_pois`). Editorial venues that had been cap-pinned at 100 by the score-clamp residue (Getty Center, Getty Villa, Six Flags Magic Mountain, Balboa Park, all 7 missions, Old Town SDSHP, Hollywood Sign) now land in the 80–95 range from their actual component-sum totals.

   **Top-25 regression baselines** — pinned snapshots at [scripts/poi-import/baselines/](scripts/poi-import/baselines/). Each `top25-bbox-YYYY-MM-DD.json` is a frozen leaderboard for the 4-county SoCal bbox after a known-good state. New baselines should be captured after any full-corpus recompute, dedup pass, schema migration affecting POI ranking, or import covering new geography inside the bbox. Capture: `node capture-top25-baseline.mjs baselines/top25-bbox-$(date +%Y-%m-%d).json`. Diff via `node diff-baselines.mjs <pre> <post>` (prints dropped-out, moved-in, and stayed-with-delta tables, plus a spotlight-IDs check).
6. **Narrative extraction** — not started. Pull/structure source text; rows get source_type='narrative_extracted' with `source_citation` (URL + verbatim passage).

### Importer cache layout (`scripts/poi-import/cache/`)
```
cache/
  osm-cells/          cell-{lat}_{lon}.json        (Overpass raw JSON per tile)
  wikidata-sparql/    {prefix}-p{page}.json        (SPARQL result pages per class)
  wikidata-sparql/    api-wt-{bbHash}-{bHash}.json  (MediaWiki API title lookups, 50 QIDs each)
  wikipedia/          {sha1}.json                  (Wikipedia REST summary)
  pageviews/          {sha1}.json                  (Wikimedia pageviews, 7-day TTL)
  wikidata-sitelinks/ {qid}.json                   (Q-number → enwiki title, 30-day TTL; cached nulls included)
  geocode/            geocode-{hash}.json          (Nominatim results)
  geocode/            county-bbox-{slug}.json      (county bbox from Nominatim)
  nrhp/               national-register-listed_*.xlsx + *.meta.json
  ca-landmarks/       chl-list.html + .meta.json              (hub page, 30-day)
  ca-landmarks/       county-{slug}.html + .meta.json        (per-county sub-articles, 58 total, 30-day)
  gnis/               CA_Features_*.zip + *.meta.json (USGS S3 download, 30-day)
  highway-routes/     ca-highways-{hash}.json (Overpass motorway+trunk for CA, no TTL — delete to re-fetch)
  osm-{ts}.json       run summary
  wikidata-{ts}.json  run summary
  nrhp-{ts}.json      run summary
  ca-landmarks-{ts}.json  run summary
  gnis-{ts}.json      run summary
```

Old `source` text column (default 'curated') is now redundant with `source_type` — leave it for now; deprecate in a later migration once importers are live.

## Venue Tour (V1 — applied 2026-05-07)

Parent-child hierarchy for "container" POIs (theme parks, missions, parks, campuses, zoos, etc.). Spec: [docs/venue-tour-design.md](docs/venue-tour-design.md). Migration: `20260504000016_venue_tour_schema.sql`.

**Live state (2026-05-07, post-Phase-4):** 75 venue rows seeded (added Mission San Diego de Alcalá and Mission Santa Inés in a prior session); 10 rows in `venue_classification_review` (table not pruned when polygons are added — current pending: 4 missions, 3 historic districts, Huntington Library, plus 2 historical entries from when SD de Alcalá / Santa Inés were resolved); 1,634 POIs classified as children (V1 backfill seeded 1,293; subsequent classify-children runs added 341 — most recent run 2026-05-07 post-NRHP-fixup added 51 with `--allow-retroactive --venue-ids` against all 75 venues); top-25 by significance contains no theme-park rides.

**Schema additions on `pois`:**
- `parent_poi_id uuid REFERENCES pois(id) ON DELETE SET NULL` — child→parent FK
- `is_venue boolean NOT NULL DEFAULT false` — true on container rows
- `venue_polygon geography(Polygon, 4326)` — required for `is_venue=true`
- `venue_type text` — 14-value CHECK: theme_park, campus, national_park, state_park, historic_district, museum_complex, mission, cemetery, zoo_aquarium, estate, shopping_district, fairground, religious_complex, industrial_complex
- `venue_metadata jsonb`
- Cross-column constraints: `venue_polygon_requires_is_venue`, `venue_type_requires_is_venue`, `child_cannot_be_venue`
- `venue_classification_review` table — admin queue for venues without polygons

**RPCs:**
- `get_venue_tour_pois(p_parent_poi_id uuid, p_user_lat?, p_user_lon?)` — children of a venue, distance-sorted when coords given else by significance
- `detect_venue_at_location(p_lat, p_lon)` — innermost venue at a coordinate (smallest polygon area wins)
- `get_nearby_pois(...)` — patched with new last param `p_include_children boolean DEFAULT false`. Existing 5-arg callers keep working; children naturally excluded for drive-by.

**Key files:**
| File | Purpose |
|------|---------|
| `scripts/poi-import/lib/classify-poi.ts` | `detectVenueFromTags()` (Section 4.2), `classifyChild()` (Section 4.1), point-in-polygon, polygon-area, 4 standalone-exception rules (Rule 4 OFF per spec) |
| `scripts/poi-import/seed-venues.ts` | 83-venue CA catalog + Nominatim polygon fetcher; `--dry-run` writes JSON catalog to `cache/venues-catalog-latest.json`, live mode upserts as `is_venue=true` |
| `scripts/poi-import/classify-children.ts` | Backfill — reads venues from DB or `--venues-from-file <json>`, scans non-venue POIs, sets `parent_poi_id`. `--allow-retroactive` skips Rule 5 for the initial pass against pre-existing POIs; **requires `--venue-ids=<comma-uuids>`** (guardrail added 2026-05-07 — retroactive parentage claims must be scoped to a named venue set, never broad) |
| `scripts/admin/apply-migration.ts` | One-off migration applier via `pg` |
| `scripts/admin/verify-venue-schema.ts` | Schema verification post-migration |
| `scripts/admin/verify-acceptance.ts` | Section 13 acceptance checks (top-25, mission children, exception firings) |
| `scripts/admin/check-venue-dupes.ts` | Pre-dedup sanity: POIs within 200m of each venue |

**Hard rules — never break:**
- **Polygon required for `is_venue=true`.** No polygon → log to `venue_classification_review`, leave row as ordinary POI.
- **Source-priority dedup applies to venues.** `editorial` (venue rows) > state_landmark > nrhp > wikidata > osm. Venue rows always win primary; CHL/NRHP duplicates of the same place become secondary.
- **Drive-by uses `get_nearby_pois` (children excluded by default).** Venue Tour mode uses `get_venue_tour_pois`. Never query children for trigger eligibility outside venue tour mode.

**Standalone-exception rules** (Section 4.3 — POI inside venue polygon stays standalone if any fire):
1. `nrhp`/`state_landmark` inside `theme_park`/`campus`/`state_park` — historic landmarks predate modern venues
2. `additional_sources >= 2` — multi-source verified independent significance — **EXCEPT** when venue_type is `theme_park` or `zoo_aquarium` (carve-out: rides and exhibits get OSM+Wikidata records but aren't independently famous; without the carve-out Grizzly River Run, Jurassic World—The Ride etc. outranked their parent venues)
3. `confidence_score < 0.7` — uncertain geocoding
4. (OFF per spec) ownership-name match like "Disneyland Hotel" — these ARE legitimate children
5. `pois.imported_at < venue.imported_at` — POI predates venue → safer not to retro-claim. Disabled with `--allow-retroactive` for initial backfill where all POIs predate freshly-seeded venues. **Guardrail:** `--allow-retroactive` requires `--venue-ids=<comma-uuids>` so the retroactive scope is always named explicitly in the invocation; the unscoped form errors out

**Initial CA venue catalog (Section 8):** 9 theme parks, 9 national parks, 7 major state parks, 21 missions, 10 university campuses, 7 historic districts, 7 museum complexes, 8 zoos/aquariums, 5 cemeteries = 85 catalog entries (post-Phase-4); 75 with polygons, 10 rows in review queue (8 still pending — see "Live state" note in Venue Tour section above).

**Data quality follow-ups** (tracked in [docs/data-quality-issues.md](docs/data-quality-issues.md)):
- 6 missions need manual polygons (Mission San Diego de Alcalá, San Gabriel Arcángel, San Miguel Arcángel, San Fernando Rey de España, Santa Inés, San Rafael Arcángel)
- 7 missions have NRHP/state_landmark duplicates more than 2km from the venue (auto-dedup correctly skipped them; admin polygon-draw or coordinate fix needed)
- Mission San José NRHP is at wrong coordinates (already in data-quality-issues.md)

**Acceptance criteria status (Section 13):** 8/10 ✅, 2 caveats — venue seed at 88% (target 94%, gap = manual mission polygons); only Mission SJC has ≥2 children (other missions lack OSM sub-feature tagging).

## Vehicle routing roadmap (future — not started)

Do not implement any of these yet; confirm with user first. When touching the route data model, leave room for a `vehicleProfile` field.

- **Height/weight/width restrictions:** OSM `maxheight`/`maxweight`/`maxwidth` tags via Overpass API; corridor query same pattern as `countPOIsAlongRoute`
- **RV/trailer-safe routing:** Requires truck-aware engine (Google Routes API newer tier, HERE, or TomTom) — standard Google Directions ignores vehicle type
- **Steep grades:** Google Elevation API or Open-Elevation; flag segments > ~6% grade for trailer brake risk
- **Weather:** Open-Meteo (free, no key); sample 3–5 points along route; append to `fetchRoute` after routes load

## XRoadLogo placement (all screens)

`<XRoadLogo size="sm" />` — import from `../components/XRoadLogo`.

| Screen | Position |
|--------|----------|
| index.tsx | Centered above search pill (mobile SafeAreaView) |
| customize.tsx | Center of map header row (replaces "Customize trip" title text) |
| hiking.tsx | Center of top header bar (replaces "Trail Mode" text) |
| filters.tsx | Right side of header row |
| trail.tsx | Centered above bottom button bar, opacity 0.6 |
| drive.tsx | Below drag handle in bottom sheet, opacity 0.5 |

## Automation hooks (.claude/settings.json)

- **PreCompact**: injects `additionalContext` telling Claude to update CLAUDE.md before compaction + shows `systemMessage` in UI
- **Stop**: shows `systemMessage` reminder to update CLAUDE.md after each response
- Both use `shell: "powershell"`

## Mobile preview during development

- **Fastest:** `npx expo start --web` → Chrome DevTools → device toolbar → iPhone 14 (390×844). Uses Mapbox shim, layout accurate.
- **Most accurate:** `npx expo start` → scan QR with Expo Go on physical device.
- **Android native:** Android Studio emulator (Pixel 6, 412×915) → `npx expo start --android`.

## Narrative extraction pipeline (`scripts/narrative-extraction/`)

Ingests historical text corpora into `narrative_documents` for future RAG / semantic search.

### Schema (migration 20260504000007)
- `narrative_documents` — id, source, title, date, url, full_text (chunk_index=0 only), chunk_index, chunk_text. UNIQUE(source, url, chunk_index). GIN FTS index on chunk_text. RLS anon-read. `search_narrative_documents()` RPC.

### Package layout
```
scripts/narrative-extraction/
  run.ts                 CLI: npm run ingest -- -s wpa-guide [--dry-run] [--force] [--limit N]
  lib/types.ts           DocumentChunk, IngestOptions, IngestResult
  lib/supabase.ts        admin client (same pattern as poi-import)
  lib/chunker.ts         chunkText() — ~8000 chars (~2000 tokens), 800-char overlap, sentence-aware
  lib/upsert.ts          upsertChunks() — 500-row batches, onConflict source+url+chunk_index
  sources/wpa-guide.ts   DONE — full implementation (see below)
  sources/bancroft.ts    STUB — implementation notes inline
  sources/cdnc.ts        STUB — implementation notes inline
```

### WPA Guide source (`sources/wpa-guide.ts`)
- Archive.org identifier: `californiastatea00fedeworkspr` ("California: A Guide to the Golden State", 1939)
- Fetches item metadata → finds DjVuTXT file → downloads and caches 30 days in `cache/wpa-guide/`
- Pre-process: strips form feeds, standalone page numbers, running headers (lines appearing 10+ times)
- Section detection: all-caps blocks ≥ 85% uppercase letters, 5–120 chars, multi-word → section heading. Stub sections (< 150 chars body) merged into next.
- Chunks via `chunkText()`; `full_text` stored only on `chunk_index === 0`
- Upserts via `upsertChunks()`

### Extraction + verification pipeline
```
cd scripts/narrative-extraction
npm run extract -- --dry-run            # preview LLM extraction
npm run extract -- --limit 20           # process 20 chunks
npm run extract -- --source wpa-guide   # full run for one source
npm run verify  -- --dry-run            # preview verification pass
npm run verify  -- --source wpa-guide   # verify + auto-approve ≥0.85 conf
```
- `extract.ts` — calls `claude-sonnet-4-6` per chunk, geocodes via Nominatim, inserts into `poi_review_queue`. Rate: 5/sec. Tracks token cost. Marks `extracted_at` on chunks.
- `verify.ts` — re-checks source_quote supports claim. `confidence < 0.7` → needs_human (no LLM). `confidence ≥ 0.7` → LLM verify; pass + `conf ≥ 0.85` → auto-approved. Idempotent.

### Migrations
- `20260504000008_poi_review_queue.sql` — `poi_review_queue` table + `extracted_at` on `narrative_documents`
- `20260504000009_poi_review_queue_verification.sql` — `verification_passed` + `verification_reasoning` columns

## Admin app (`admin/`)

Standalone Next.js 15 app at port 3010. Human-in-the-loop review for narrative-extracted POI candidates.

### Auth
Supabase Auth via `@supabase/ssr`. Middleware checks session + `user_metadata.is_admin === true`. Set the flag in Supabase Dashboard → Authentication → Users → Edit user → Raw user meta data: `{"is_admin": true}`.

### Running
```
cd admin
cp .env.local.example .env.local   # fill in your keys
npm install
npm run dev                         # http://localhost:3010
```

### Layout
```
admin/
  middleware.ts                   — auth guard (all routes)
  app/
    login/page.tsx                — email+password login
    admin/
      layout.tsx                  — header + sign-out
      poi-review/
        page.tsx                  — server component: fetches queue + categories
        actions.ts                — approve(id, edits?), reject(id) server actions
        ReviewCard.tsx            — card per candidate (approve/reject/edit buttons)
        EditModal.tsx             — edit form + drag-pin map (Mapbox)
        MapEditor.tsx             — dynamic (ssr:false) react-map-gl/mapbox map
  lib/
    supabase-server.ts            — service role client
    supabase-browser.ts           — browser client (login)
    types.ts                      — ReviewRow, Category, EditedFields
    category-map.ts               — LLM category_guess → poi_categories slug
    location.ts                   — geography GeoJSON/WKT parsing helpers
    get-user.ts                   — session user from cookies (audit trail)
```

### Approve action
Inserts into `pois` with `source_type='narrative_extracted'`, `source_citation='<url> :: "<quote>"'`, `confidence_score=llm_confidence`, `verified=true`, `editorial_status='draft'`, `significance_score=round(conf*60)`. Sets `promoted_poi_id` + `review_status='approved'` on the queue row.

### Static map in ReviewCard
Mapbox Static Images API — no client-side map JS for the list view. Full interactive drag-pin map only in EditModal.

## TTS abstraction layer (`scripts/lib/tts/`)

Standalone package (own `package.json`) — same isolation pattern as `scripts/poi-import/` and `scripts/narrative-extraction/`.

### Package layout
```
scripts/lib/tts/
  types.ts              — all interfaces + ProviderName union
  index.ts              — generateNarration() entrypoint + provider registry
  audio-utils.ts        — convertToOpus() via ffmpeg (Google is exempt — it outputs OGG_OPUS natively)
  cost-tracker.ts       — logCost() → inserts into llm_calls table
  declarations.d.ts     — type shim for @ffmpeg-installer/ffmpeg (no official types)
  tsconfig.json         — ESNext/Bundler; excludes __tests__
  package.json          — jest + ts-jest with CommonJS override + moduleNameMapper
  providers/
    google.ts           — GoogleTTSProvider (DONE — primary provider)
    elevenlabs.ts       — stub (throw new Error('not yet implemented'))
    openai.ts           — stub
    self-hosted.ts      — stub
  __tests__/
    integration.test.ts — real Google TTS call; skips if GOOGLE_APPLICATION_CREDENTIALS unset
```

### Key types (`types.ts`)
- `ProviderName = 'google' | 'elevenlabs' | 'openai' | 'self-hosted'` — defined once, used on both `TTSProvider.name` and `TTSOutput.provider`
- `TTSInput` — text, voiceId, speakingRate?, pitch?, outputFormat?, modelOverride?
- `TTSOutput` — audioBuffer, mimeType (`'audio/ogg; codecs=opus'`), durationMs, characterCount, costUsd, provider, voiceId
- `TTSProvider` — interface: name, generateNarration(), estimateCost(), getAvailableVoices()
- `VoiceConfig` — provider, voiceId, speakingRate?, pitch?, modelOverride?
- `CostRecord` — callType ('claude'|'tts'), provider, modelOrVoice, inputChars?, costUsd, relatedId?

### Google provider (`providers/google.ts`)
- Auth: `TextToSpeechClient()` reads `GOOGLE_APPLICATION_CREDENTIALS` automatically
- Default voice: `en-US-Chirp3-HD-Aoede`; fallback on HD error: `en-US-Neural2-D`
- Encoding: `OGG_OPUS` natively — no ffmpeg needed
- Duration heuristic: `Math.round((charCount / 14) * (1000 / speakingRate))`
- Pricing: HD/Neural2/WaveNet = $16/M chars, Standard = $4/M chars
- `tierFromVoiceId()` exported — reads voice name string for pricing tier

### generateNarration() (`index.ts`)
- Retry: 4 total attempts, delays `[1000, 4000, 16000]` ms between (typed `readonly number[]` for noUncheckedIndexedAccess)
- Default voice config: `{ provider: 'google', voiceId: 'en-US-Chirp3-HD-Aoede' }`
- Cost logging: fire-and-forget (`logCost().catch(err => console.error(...))`)
- Returns `TTSOutput | null` (null after all retries fail)

### Migrations added this session
- `20260504000010_llm_calls.sql` — `llm_calls` table: id, call_type CHECK('claude','tts'), provider, model_or_voice, input_chars, input_tokens, output_tokens, cost_usd numeric(10,6), related_id, created_at. RLS: service_role only.
- `20260504000011_narration_audio_provider.sql` — adds to `narration_audio`: provider text NOT NULL DEFAULT 'google', character_count int, duration_ms int, cost_usd numeric(10,6), prompt_version int NOT NULL DEFAULT 1
- `20260504000013_narration_audio_status.sql` — adds to `narration_audio`: status text CHECK('pending','ready','failed') DEFAULT 'ready'; mode text CHECK('driving','hiking','city') DEFAULT 'driving'; makes audio_url nullable; index on (status, generated_at).
- `20260504000014_narration_cache_rpc.sql` — adds `pois.narration_cache jsonb DEFAULT '{}'`; `update_poi_narration_cache(p_poi_id, p_cache_key, p_audio_url)` RPC (atomic jsonb merge); anon SELECT policy on `voice_configs WHERE is_active=true` (unblocks useTTS.ts voice lookup).

### Required env vars (scripts — NOT EXPO_PUBLIC_ prefixed)
These go in the root `.env` alongside the Expo vars:
```
GOOGLE_APPLICATION_CREDENTIALS=C:\path\to\service-account.json
SUPABASE_URL=https://<project-ref>.supabase.co          # scripts use this name (not EXPO_PUBLIC_SUPABASE_URL)
SUPABASE_SERVICE_ROLE_KEY=<service-role-key>             # scripts use this name (not SUPABASE_SERVICE_KEY)
ANTHROPIC_API_KEY=<key>                                  # used by precache script + server narration route
DATABASE_URL=postgresql://postgres:<password>@db.<project-ref>.supabase.co:5432/postgres  # direct connection — NOT the pooler. URL-encode special chars in password (?→%3F)
```

**Root `.env` is the single source of truth — do NOT create `server/.env`.** `server/index.js` calls `require('dotenv').config()` which resolves from `process.cwd()`, so the server must be launched from the project root: `node server/index.js` (NOT `cd server && npm start`). `cd server && npm install` is still fine — only the runtime invocation cares about cwd. `server/.env.example` is kept as a documentation artifact for the keys the server reads; `server/.env` itself remains in `.gitignore` defensively in case anyone ever creates one.

### Running the integration test
```
cd scripts/lib/tts
npx jest --testPathPattern=integration
```
Skips gracefully if `GOOGLE_APPLICATION_CREDENTIALS` is not set. When credentials are present, validates: mimeType = `'audio/ogg; codecs=opus'`, audioBuffer.length > 0, durationMs > 0, costUsd > 0, and writes a row to `llm_calls`.

### voice_configs table (migration 20260504000012)
- Columns: id, mode CHECK('family','kids','unfiltered','local'), provider, voice_id, voice_settings jsonb, display_name, description, is_active, version, created_at
- Partial unique index: `idx_voice_configs_active_mode ON voice_configs(mode) WHERE is_active = true` — one active voice per mode at all times
- RLS: service_role only
- Audience modes: family (warm doc narrator), kids (Junior Explorer), unfiltered (Off the Leash deadpan), local (insider neighbor)

### Voice audition tooling

Three tools exist. **Use `audition-voices.ts` for picking voices** (it integrates with the TTS abstraction + voice_configs table). `audition-family-realistic.ts` is a production-shape alternative for Family mode that runs hand-picked Chirp 3 HD voices through real narration paragraphs at two speaking rates and builds a blinded HTML comparison page (`scripts/voice-audition/audition-family-realistic.ts` → `scripts/audition-output/family-realistic/index.html`; idempotent on re-run). `run.ts` is the older HTML-based tool kept for reference.

#### Primary: `scripts/audition-voices.ts`
Single-file CLI run from `scripts/voice-audition/`. Uses `generateNarration()` with `voiceConfigOverride` (no voice_configs table required), logs to `llm_calls`, writes Opus to `scripts/audition-output/{mode}/{voice_id}.opus`.

New helper file: `scripts/lib/tts/supabase-admin.ts` — exports `getAdminClient()` for `--commit` writes.

```
# All commands run from: scripts/voice-audition/

pnpm audition --list
  # Live Google API catalog: 30 Chirp3-HD + 9 Neural2 en-US voices (★ = default candidate)

pnpm audition --mode=family
  # Generates 3 candidate .opus files, prints cost estimate first

pnpm audition --mode=family --voices=en-US-Chirp3-HD-Aoede,en-US-Chirp3-HD-Charon
  # Narrow to specific voices

pnpm audition --mode=family --dry-run
  # Preview without generating

pnpm audition --mode=family --force
  # Regenerate even if .opus already exists

pnpm audition --commit --mode=family --voice=en-US-Chirp3-HD-Aoede --rate=1.0 --pitch=0
  # After listening: deactivates existing active row, inserts new voice_configs row
```

Listen: OGG/Opus — Chrome or Firefox (not Safari). Output: `scripts/audition-output/{mode}/`.

#### Legacy: `scripts/voice-audition/run.ts`
Generates samples + builds `scripts/voice-audition/output/index.html` browser player. Calls Google TTS directly without TTS abstraction.
```
cd scripts/voice-audition
pnpm audition:old    # generate candidates, build HTML
pnpm audition:all    # generate ALL Chirp3-HD + Neural2 voices
pnpm html            # rebuild index.html only
```

### Voice candidate shortlist (Step 3 — user has not yet picked)

3 candidates per mode. Default speaking rates: family 1.0, kids 1.1, unfiltered 0.95, local 1.0.

| Mode | Candidate voice_id | Reasoning |
|------|--------------------|-----------|
| family | `en-US-Chirp3-HD-Aoede` | Warm, clear; default HD voice used throughout TTS build — solid doc baseline |
| family | `en-US-Chirp3-HD-Charon` | Male, measured; resonant rather than bright — authoritative without being stiff |
| family | `en-US-Chirp3-HD-Kore` | Slightly softer register than Aoede; good contrast candidate |
| kids | `en-US-Chirp3-HD-Puck` | Named for Shakespeare's sprite; tends toward playful, lighter delivery |
| kids | `en-US-Chirp3-HD-Zephyr` | Airy, expressive; energetic without being shrill |
| kids | `en-US-Chirp3-HD-Leda` | Clear, accessible; enthusiastic without going over the top |
| unfiltered | `en-US-Chirp3-HD-Fenrir` | Named for Norse wolf; drier, lower-register — good deadpan candidate |
| unfiltered | `en-US-Chirp3-HD-Orus` | Deeper, more measured; slower pace for comedy should land |
| unfiltered | `en-US-Neural2-D` | Neural2 male, widely noted for dry/natural quality; non-HD control |
| local | `en-US-Chirp3-HD-Umbriel` | Conversational; sits between formal and casual |
| local | `en-US-Chirp3-HD-Sulafat` | Warm, casual inflection |
| local | `en-US-Chirp3-HD-Schedar` | Natural; slightly more informal than Aoede |

### Migration backlog status (updated 2026-05-07)

**DB watermark: `20260504000020`** — all migrations 000002–000020 applied.
Verification script: `scripts/verify-migrations.mjs` (66/66 checks passed on 000014; listed in `.gitignore`). Post-0016 schema verification lives in `scripts/admin/verify-venue-schema.ts`.

**Applied (confirmed live):**
- 20260504000002 `contributions` — user_contributions, user_badges, contribution_rewards tables + RPCs
- 20260504000003 `narration_cache` — narration_audio table + user_narrators.slug + RPCs
- 20260504000004 `trips_anon_select` — RLS policy (applied out-of-band)
- 20260504000005 `poi_source_provenance` — pois provenance columns (source_type, source_id, etc.)
- 20260504000006 `poi_significance_breakdown` — pois.significance_breakdown + highway_routes + RPCs
- 20260504000007 `narrative_documents` — narrative_documents table + FTS index + RPC
- 20260504000008 `poi_review_queue` — poi_review_queue table + narrative_documents.extracted_at
- 20260504000009 `poi_review_queue_verification` — verification_passed, verification_reasoning columns
- 20260504000010 `llm_calls` — llm_calls audit table
- 20260504000011 `narration_audio_provider` — narration_audio.provider/character_count/duration_ms/cost_usd/prompt_version
- 20260504000012 `voice_configs` — voice_configs table + partial unique index + RLS
- 20260504000013 `narration_audio_status` — narration_audio.status/mode + audio_url nullable
- 20260504000014 `narration_cache_rpc` — pois.narration_cache jsonb + update_poi_narration_cache RPC + anon SELECT policy on voice_configs
- 20260504000015 `significance_score_precision` — widens pois.significance_score from numeric(4,2) to numeric(6,2) to allow score=100 without overflow (applied live via pg + migration file created)
- 20260504000016 `venue_tour_schema` — V1 venue tour: pois.parent_poi_id (FK self), is_venue, venue_polygon (geography Polygon), venue_type (14-value CHECK), venue_metadata (jsonb) + cross-column constraints + venue_classification_review table + 3 RPCs (get_venue_tour_pois, detect_venue_at_location, patched get_nearby_pois with p_include_children flag). Backfill: 73 venues seeded, 1,293 POIs classified as children. Spec: docs/venue-tour-design.md.
- 20260504000017 `get_nearby_pois_confidence_filter` — adds `AND p.confidence_score >= 0.5` to get_nearby_pois so low-confidence imports (NRHP rows that geocoded only to county centroid, etc.) are excluded from drive-by surfaces. Unblocks 4-county NRHP import. `get_route_pois` does not exist; the corridor RPC is `get_corridor_pois` and was not modified. Applier: `scripts/poi-import/apply-confidence-filter.mjs` (also runs the verification queries).
- 20260504000018 `get_corridor_pois_confidence_filter` — brings `get_corridor_pois` to parity with `get_nearby_pois`: adds `WHERE p.merged_into IS NULL AND p.confidence_score >= 0.5` to the corridor RPC. Without this, dedup secondaries (601 freshly-merged from the 4-county dedup) and defanged-NRHP rows (~2,099) leaked into route-corridor results. Deliberately did NOT add `parent_poi_id IS NULL` — corridor narration sometimes wants children once driving slowly past a venue (separate decision). Applier: `scripts/poi-import/apply-corridor-filter.mjs`. Verifications passed live (function body has both filters; secondary at known-merged location returns 0 in the corridor result while its primary at the same coords returns 1).
- 20260504000019 `narration_audio_bucket` — creates the `narration-audio` Supabase Storage bucket (public, 10MB limit, audio/ogg + audio/opus mime types) so the first narration upload doesn't 404. Applier: `scripts/poi-import/apply-narration-bucket.mjs` (verifies via both `storage.buckets` SELECT and `listBuckets()`).
- 20260504000020 `narration_audio_text` — adds `narration_audio.narration_text text` (nullable, no default, no index) so cached LLM output drives future audio regeneration without re-paying Claude. Populated at write time by `server/routes/narration.js` (in `updateNarrationAudioReady`) and `scripts/precache-popular-routes.ts` (in `upsertNarrationAudio`) with the exact string passed to `generateNarration()`. Applier: `scripts/poi-import/apply-narration-text.mjs`.

**Out-of-band live patches (no migration file — applied directly via pg):**
- `get_corridor_pois` + `get_nearby_pois` RPCs patched (2026-05-06): live DB had diverged to reference a nonexistent `categories` table instead of `poi_categories`. Re-applied both `CREATE OR REPLACE FUNCTION` bodies from `20250503000001_trip_mode.sql` directly. Root cause unknown (likely a hand-edit in the Supabase SQL editor at some point). If you ever reset or re-apply migrations from scratch, these functions will be correct — the migration files were already right.

**Remaining pre-flight before narration works end-to-end:**
- `GOOGLE_APPLICATION_CREDENTIALS` is set and working in root `.env` ✓
- `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` aliases set in root `.env` ✓
- Add `ANTHROPIC_API_KEY` to root `.env` (single source of truth — server reads from root .env via dotenv when launched from project root)
- Run `cd server && npm install` to get `@google-cloud/text-to-speech` — install is cwd-agnostic; runtime is not. Launch the server from project root: `node server/index.js`
- Run `pnpm audition --mode=<mode>` for all 4 modes → listen to output → run `pnpm audition --commit` for each
- After 4 commits: voice_configs has one active row per mode → Phase 7 (lazy cache population) is unblocked
- After picks confirmed: wire voice_configs lookup into `generateNarration()` in `scripts/lib/tts/index.ts`
- Run precache: `cd scripts && npx tsx precache-popular-routes.ts --named-route pch-sf-la --dry-run`

## Git + repo hygiene

- **Repo:** `https://github.com/johnhollis99-lgtm/crossroad-ws.git` — main branch on origin/main.
- Git binary (not on PATH): `C:\Users\johnh\AppData\Local\GitHubDesktop\app-3.5.8\resources\app\git\cmd\git.exe`
- **`.gitignore`** — covers: `node_modules/` (all sub-packages), `.env` + `server/.env` (secrets), `.expo/`, `dist/`, `admin/.next/`, `scripts/*/cache/`, `scripts/audition-output/`, `*.opus`, `*.tsbuildinfo`, OS files, `.claude/scheduled_tasks.lock`, `.claude/settings.local.json`, `supabase/.temp/`.
- **Recent commit history (2026-05-07):**
  - `7a6648d` Carry-forward fixes: scale bug, classifier guardrail, manual Q-numbers
  - `ab53132` Three carry-forward fixes (mission Q-fix, classify-poi.ts theme_park, additional_sources dedup)
  - `26cc416` Wikidata class extension: marquee theme parks now visible
  - `bc9dadb` docs: sync CLAUDE.md with post-V1 reality
  - `4e166c0` chore: gitignore local config and Supabase CLI temp files
  - `56cd80f` chore: remove one-off diagnostic scripts
  - `2007210` docs: add data-quality-issues.md tracking manual-review cases
  - `8ed7318` feat(venues): V1 venue tour parent-child hierarchy
  - `b4047b5` chore: bundle uncommitted importer + dedup + lib work documented in CLAUDE.md
  - `d1b5c30` Initial commit - xroad project state at migration 000014

## scripts/seed-db.mjs

One-time DB seeder (categories, POIs, corridors, badges). Uses Supabase Management API — requires `SUPABASE_ACCESS_TOKEN` (personal access token from dashboard, NOT the service key).

- Reads `SUPABASE_URL` and `SUPABASE_SERVICE_KEY` from `.env` via `dotenv/config` (fails loud if missing)
- `PROJECT_REF` derived from `SUPABASE_URL` hostname — no hardcoded project ref
- `SERVICE_KEY` is validated on startup but currently unused in the script body (Management API uses `ACCESS_TOKEN`)

## Narration precache script (`scripts/precache-popular-routes.ts`)

Standalone script (run with `npx tsx` from `scripts/`). Pre-generates narration audio for all eligible POIs along a route, covering the top (mode, depth) combos from the trips table.

```
cd scripts
npx tsx precache-popular-routes.ts --named-route pch-sf-la
npx tsx precache-popular-routes.ts --route-file ./routes/pch.geojson
npx tsx precache-popular-routes.ts --named-route pch-sf-la --dry-run
npx tsx precache-popular-routes.ts --named-route pch-sf-la --mode driving --depth glance
```

**Options:** `--route-file <geojson>`, `--named-route <id>`, `--corridor-mi <n>` (default 10), `--mode`, `--depth`, `--dry-run`, `--limit <n>`

**Named routes:** `pch-sf-la`, `i5-sf-la`, `us101-la-sf` (hardcoded WKT waypoints)

**Logic:**
1. Calls `get_corridor_pois` RPC → re-fetches full POI rows for `narration_cache`, `source_type`
2. Skips `source_type = 'narrative_extracted'` (need user validation first)
3. Queries `trips.depth` distribution → derives top mode×depth combos (default: driving + hiking × top 3 depths)
4. Reads active voice per mode from `voice_configs`
5. For each POI × combo: checks `narration_cache` JSON → checks `narration_audio` table (status='ready') → generates if missing
6. Generation: Claude text → Google TTS → Storage upload → `narration_audio` upsert (status='ready', mode set) → `narration_cache` patch → `llm_calls` log (2 rows: claude + tts)
7. 500ms pause between generations to stay within API rate limits

**Uses:** same imports as `scripts/audition-voices.ts` — `registerProvider`, `generateNarration` from `./lib/tts/index.js`, `GoogleTTSProvider`, `getAdminClient`.

## Narration orphan sweeper (`scripts/sweep-orphaned-narration.ts`)

Cleans up stale narration_audio rows left by failed or interrupted generation runs.

```
cd scripts
npx tsx sweep-orphaned-narration.ts           # live run
npx tsx sweep-orphaned-narration.ts --dry-run  # preview only
```

**Rules:**
- `status='pending'` rows older than 1 hour: generation never completed; `audio_url` is NULL so no Storage object. DB row deleted only.
- `status='failed'` rows older than 24 hours: may have a Storage object if upload succeeded but ready-update failed. Attempts Storage delete at `{poi_id}/{mode}/{depth}/{narrator_slug}.opus` (404 is ignored), then deletes DB row.

**Intended cadence:** hourly cron. Schedule via `crontab` or a task scheduler once the server is deployed.

## Session workflow

When context fills (PreCompact hook fires), update this CLAUDE.md with current project state, then `/clear` to restart fresh. Proactively save when significant new screens, migrations, or server routes are completed. This file is the single source of truth — MEMORY.md just points here.
