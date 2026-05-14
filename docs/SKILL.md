---
name: xroad-roadstory
description: >
  Development companion for the XRoad / RoadStory app — a GPS-triggered AI storytelling
  companion for road trips, hikes, and city exploration. Use this skill ANY time the user
  mentions RoadStory, XRoad, POI narration, trip modes, audience modes, narration depth,
  corridor narration, driving/hiking/sightseeing pages, TTS voice integration,
  Expo / React Native mobile UI, Supabase/PostGIS spatial queries, Socket.io real-time features,
  or any aspect of building a location-aware storytelling app. Also trigger when the user
  asks about UI layout, backend architecture, prompt engineering for narration modes,
  audio caching, offline-first patterns, group trip features, or trip reports. If in doubt
  and the user is working on a mobile app with maps + AI narration, use this skill.
---

# XRoad / RoadStory — Development Skill

You are the development partner for **RoadStory**, a GPS-triggered AI narration app.
Your job is to provide intelligent, intuitive guidance across the full stack — UI,
backend, real-time systems, prompt engineering, and product decisions — always grounded
in the project's architecture and vision.

## How to Use This Skill

1. **Always read this file first** when the user asks anything related to the project.
2. For deep architectural details, read `references/architecture.md`.
3. Think holistically — a UI question may have backend implications and vice versa.
4. When writing code, match the project's stack exactly (see Tech Stack below).
5. When the user's request is ambiguous, make the decision that best serves
   a hands-free, safety-first, audio-driven experience.

---

## Core Product Identity

RoadStory is **not** an audio tour app. It is an **intelligent travel companion** that:
- Delivers narration triggered by GPS, not user interaction
- Adapts personality (audience mode) and length (depth) independently
- Fills silence with corridor narration between POIs
- Handles driving, hiking, and city walking as distinct interaction paradigms
- Is safety-first: no looking at the screen while driving, minimal taps, large targets
- Works offline as a first-class experience, not a fallback

**The golden rule:** If a feature would require the driver to look at their phone, redesign it.

---

## ⚠️ Authoritative Curation & Narration Model

**As of the Narration & Curation Addendum (`roadstory-narration-curation-addendum.md`)**, the model described in older sections below has been updated. Read the addendum before generating any code touching narration generation, lookahead, voice configs, or trip setup UI.

**Summary of the current model:**
- **The soul of the app is geology, geography, and anthropology.** Architecture and history count when significant. Everything else is opt-in. (Addendum §1)
- **Two narrators**, not four. Internal slugs `narrator_a` (reverent/contemplative) and `narrator_b` (conversational/easygoing). Display names TBD. Both handle all depth ranges; they differ in posture and conversational register, not content scope. (Addendum §5)
- **Depth is now a property of the POI** (`pois.intrinsic_depth` — {brief, standard, long}), not a user-facing setting. The user-facing control is **Pace** (`Full Drive` / `Light Touch`). Long POIs cache two audio variants (full + compressed). (Addendum §4, §6)
- **Significance floor of 70** gates which POIs trigger unsolicited narration. Sub-70 POIs are still imported and queryable but never speak unprompted. Per-category floors tunable via `category_significance_floors` table. (Addendum §2)
- **Regions** (geomorphic provinces, ecoregions, indigenous territories, named valleys) trigger boundary-crossing narration as a parallel layer to POIs. (Addendum §3)
- **Iconic Local Override** punches through filters for iconic food/drink/oddities/Americana lodging using free-tier curation sources only. (Addendum §8)
- **Skip + Tell Me More controls** + 3 feedback reports drive content quality over time. (Addendum §9)
- **Mid-trip narrator swap** is supported. (Addendum §5.5)

**Sequencing across all pending work:** see `roadstory-unified-roadmap.md`. That doc is the single source of truth for what order to build things in.

**Stale references below:** any older mention of three depths as a user setting, four narrators (Professor/Local/Junior Ranger/Truck Driver), or 12 prompt templates (4 audience × 3 depth) reflects the pre-addendum model. The schema columns themselves remain (e.g. `narration_audio.depth` still exists), but the value space and semantics have been extended. See the migration plan in the roadmap §4.4.

---

## Tech Stack (use these exactly)

| Layer | Technology |
|---|---|
| Mobile frontend | **React Native / Expo** (TypeScript) — all UI hand-coded. EAS Build for iOS/Android binaries, EAS Update for OTA. One codebase compiles to both platforms. |
| Database | **Supabase + PostGIS** (spatial queries, auth, storage) |
| Real-time server | **Node.js + Socket.io** (GPS broadcast, narration triggers, WebRTC signaling) |
| AI narration text | **Anthropic Claude API** (prompt templates: 4 audience modes × 3 depths = 12 templates) |
| AI voice (TTS) | **Provider-abstracted** via `scripts/lib/tts/`. Primary provider: **Google Cloud TTS** (Chirp 3 HD voices). ElevenLabs, OpenAI TTS, Amazon Polly, and self-hosted models are pluggable but inactive. |
| Voice configuration | **`voice_configs` table** maps each audience mode to a provider + voice_id + voice_settings. Only one active voice per mode at a time. |
| Audio storage | **Supabase Storage / CDN** (Opus files, keyed by `{poi_id}-{trip_mode}-{depth}-{narrator_slug}.opus`) |
| Offline | **Local SQLite + Opus audio cache** (spatial index on device) |
| Hosting | **Render or Fly.io** (WebSocket server) |
| Cost tracking | **`llm_calls` table** logs every Claude and TTS call (provider, voice/model, character/token counts, cost_usd) |

### Key Technical Constraints
- Frontend is **React Native / Expo** (TypeScript) — all UI hand-coded as standard RN. EAS Build for iOS/Android binaries, EAS Update for OTA. One codebase compiles to both platforms.
- Supabase RPCs are the primary data interface: `get_nearby_pois()`, `get_route_pois()`, `submit_feedback()`, `cache_narration()`, `get_cached_narration()`.
- Audio is **Opus format** (not MP3, not base64) — ~10x smaller, critical for offline cache. The TTS abstraction returns Opus buffers; providers that don't natively output Opus convert via ffmpeg before returning.
- TTS calls go through `generateNarration({ text, mode, depth })` in `scripts/lib/tts/` → never call a provider SDK directly from app code.
- Latency target: narration audio ready ≥10 seconds before user reaches trigger zone.

---

## Architecture Quick Reference

### Pages & Their Concerns

| Page | Map Style | Trigger | Cancel Button | Key Concern |
|---|---|---|---|---|
| **Home** | None | N/A | N/A | Route setup, audience_mode/depth selection, trip start |
| **Driving** | Full-screen live | Auto, speed-scaled radius | Oversized, one-tap | Safety: huge touch targets, no reading |
| **Hiking** | Full-screen terrain | Auto, 80m proximity | Standard | Offline-first: pre-cache everything |
| **City Sightseeing** | Full-screen urban | Tap-to-hear radar | Standard | Density: radar view, category filters, don't auto-blast |
| **Trip Summary** | Static route recap | N/A | N/A | Shareability, replay, social card |

### Audience Modes (personality axis)

> **⚠️ Per the curation addendum:** audience mode is now one of TWO narrator axes. The other is `narrator_slug` (Narrator A reverent / Narrator B conversational — see addendum §5). The pair (audience_mode, narrator_slug) selects a row in `voice_configs`. 4 audience × 2 narrator = 8 active voice config rows. The previous four-named-narrators model (Professor/Local/Junior Ranger/Truck Driver) is superseded; their roles have been absorbed into audience modes, intrinsic depth, the Iconic Local Override, and the narrator weight profiles.

| Mode | Personality | Voice Style | Content Rules |
|---|---|---|---|
| **Family** (default) | Warm documentary narrator | Clean, informative | Universally appropriate |
| **Kids** ("Junior Explorer") | Enthusiastic science teacher | Fun, wonder-driven | Strict guardrails: no violence/death/disturbing. Interactive games. Gamification (passport, badges) |
| **Unfiltered** ("Off the Leash") | Sharp, witty, irreverent friend | Dry, deadpan | 18+ age-gate. Crude humor OK, cruelty never. Self-aware meta-humor encouraged |
| **Local** | Insider neighbor | Conversational, knowing | Skips basics, delivers deep cuts and lesser-known stories |

Each audience mode maps to one active row in `voice_configs` (`mode` column = audience mode → provider + voice_id + speakingRate). The voice's slug surfaces in `narration_audio.narrator_slug`, which is the cache-key dimension → see the Mode column semantics section below. Voice picks are locked in via the voice audition workflow; changing a voice mid-life requires versioning, not in-place edits, so cached audio remains playable.

### Narration Depths (length axis)

> **⚠️ Per the curation addendum:** depth is now a **property of the POI** (`pois.intrinsic_depth` → {brief, standard, long}) and is NOT a user-facing setting. The user-facing control is **Pace** (Full Drive / Light Touch → see addendum §6). The legacy values below remain in the `narration_audio.depth` column for backward compatibility with already-generated audio and map to the new values: glance—brief, ride_along—standard, deep_dive—long. A `long_compressed` value is added for the Light Touch variant of long POIs.

| Legacy depth (still in CHECK constraint) | New intrinsic_depth | Length | Used for |
|---|---|---|---|
| **Glance** | `brief` | 15–35 sec | Iconic Local callouts, shallow source POIs |
| **Ride Along** | `standard` | 45–90 sec | The default. NRHP/CHL/Wikipedia-significant POIs |
| **Deep Dive** | `long` | 2–4 min | Wikipedia-significant POIs with deep source material; geological landmarks |
| *(new)* | `long_compressed` | ~90 sec | Light Touch variant of long POIs |

### Mode column semantics (the canonical "mode" disambiguation)

"Mode" is overloaded in this codebase. Two distinct axes both use the column name `mode`: **audience mode** (personality) on `voice_configs`, and **trip mode** (driving/hiking/city) on `narration_audio`. In prose, always use `audience_mode` or `trip_mode` explicitly. The literal column references self-qualify by the table they sit on, so the columns themselves don't need renaming.

| Column | Semantic | Value space |
|---|---|---|
| `voice_configs.mode` | audience mode | family / kids / unfiltered / local |
| `narration_audio.mode` | trip mode | driving / hiking / city |
| `narration_audio.narrator_slug` | voice id | per-voice slug |
| `narration_audio.depth` | depth | glance / ride_along / deep_dive |
| `trips` | no mode column today | depth + category_filter only |

Operational notes:
- `voice_configs.mode` enforces "one active row per audience mode" via the partial unique index `(mode) WHERE is_active = true`.
- `narration_audio.mode` is enforced by CHECK on `('driving','hiking','city')`. A 4th value `venue_tour` is planned (see venue-tour spec) and requires a CHECK extension.
- `user_preferences.default_audience_mode` shares the audience-mode value space and CHECK constraint.
- **Cache key shape:** `{poi_id}-{trip_mode}-{depth}-{narrator_slug}.opus`. Audience mode is collapsed into `narrator_slug` via the `voice_configs` lookup — there is exactly one active voice per audience mode, so the voice identifies the audience implicitly.
- `narration_audio.narrator_slug` is the voice-id column. A rename to `voice_id` is **intentionally deferred** → every reader/writer uses `narrator_slug` until the rename ships. Trigger condition for the rename: bundle it with a major schema overhaul that's already touching the narration generation surface (RPCs + app code + scripts). The venue_tour CHECK extension by itself is NOT a sufficient trigger → that migration is small enough that mixing in a rename would balloon its blast radius. Wait for a bigger reason.

### Dynamic Trigger Radius

```
trigger_distance = base_radius + (speed_mps × estimated_narration_seconds × lead_factor)
```

| Speed | Radius |
|---|---|
| Walking (0–6 km/h) | 80m |
| Urban driving (15–50 km/h) | 150–250m |
| Highway (80–120 km/h) | 400–800m |

Only trigger for POIs **ahead** on the route, never behind or perpendicular.

### Narration Queue Rules

> **⚠️ Per the curation addendum §6.3 and §10:** the queue logic has been substantially updated. The old "minimum 15-second gap" rule is dropped. Current rules:

1. **Priority scoring:** `effective_score = significance_score × narrator_weight[category]` × resonance modifier (for Cultural Fabric POIs)
2. **Floor gate:** POI must clear `significance_score >= category_significance_floors[category]` (default 70) to enter the queue at all
3. **Density rule:** drop any POI within 60 sec of another POI's end time IF `significance_score < 75` (high-value content is never dropped due to timing)
4. **Pace rule (Light Touch only):** non-iconic POIs need ⥠6 min gap from previous narration; long-weight POIs use `long_compressed` audio
5. **Iconic Local Override:** always queues, bypasses gap rules, max 1 per 30 min, forced to brief depth
6. **Region transitions:** always queue on first entry per trip, max 1 per 20 min
7. **Never interrupt** active narration — new triggers queue behind

### Narration Generation Pipeline
1. Lookahead: generate next 3–5 POIs in background
2. Select prompt template (audience_mode × depth) — trip_mode affects length (`DEPTH_CFG`) and Storage path but not tone
3. Inject: POI data + community corrections + regional context + corridor info
4. Claude API generates text → call `generateNarration({ text, mode, depth })` from `scripts/lib/tts/` (the `mode` parameter here is trip_mode) → returns Opus buffer
5. Upload Opus file to Supabase Storage at path `{poi_id}/{trip_mode}/{depth}/{narrator_slug}.opus`
6. Insert row into `narration_audio` (`poi_id`, `narrator_slug`, `depth`, `mode` (trip_mode), `provider`, `audio_url`, `character_count`, `duration_ms`, `cost_usd`, `prompt_version`, `status`)
7. Pre-download to device for offline

---

## Supabase Schema

### Core Tables
- **`pois`** → `id`, `name`, `category_id` (FK to `poi_categories`), `tags[]`, `description`, `location` (PostGIS geography(Point,4326)), `address`, `image_url`, `significance_score` numeric(4,2) **on a 0–100 integer-point scale** (importers write 0–1 fractions; recompute-significance.ts normalizes), `feedback_score`, `correction_notes`. **Provenance:** `source_type` CHECK → {osm, wikidata, nrhp, state_landmark, gnis, narrative_extracted, editorial, user_contributed}, `source_id`, `source_citation`, `confidence_score` (0–1, default 1.0), `verified` bool, `additional_sources` text[], `merged_into` uuid (self-FK; set when row is a merged duplicate), `imported_at`. Partial UNIQUE(source_type, source_id) WHERE merged_into IS NULL. **Significance breakdown:** `significance_breakdown` jsonb = `{ source_base, cross_source, pageviews, route_adjacency, total }` populated by recompute-significance.ts. **Narration cache:** `narration_cache` jsonb keyed by `{trip_mode}-{depth}-{narrator_slug}` → `audio_url`; O(1) lookup on the POI row, checked before the `narration_audio` table. **Venue columns:** `parent_poi_id` uuid (self-FK to parent venue), `is_venue` bool, `venue_polygon` geography(Polygon, 4326), `venue_type` text (14-value CHECK enum), `venue_metadata` jsonb. Cross-column constraints prevent venue/child overlap. **Trigger-shape columns:** `poi_type` text NOT NULL DEFAULT `'point'` CHECK (`'point','area','viewpoint'`) → 99.9% of rows are `'point'`; `'area'` and `'viewpoint'` are reserved for non-point geometries with custom trigger semantics. `visibility_radius_miles` numeric NOT NULL DEFAULT 1.0 → per-POI override of the default proximity-trigger radius (read by `usePOIStream` and the corridor RPC).
- **`trips`** → `id` uuid PK, `user_id` uuid FK—`auth.users` ON DELETE SET NULL, `route_name`, `origin`, `destination`, `distance_mi` double, `duration_min` int, `narrator_id` uuid FK—`narrators` ON DELETE SET NULL, `user_narrator_id` uuid FK—`user_narrators` ON DELETE SET NULL, `narrator_name`, `depth` text NOT NULL DEFAULT `'ride_along'` CHECK (`'glance'|'ride_along'|'deep_dive'`), `category_filter` text[] NOT NULL DEFAULT `'{}'`, `poi_distance_m` int NOT NULL DEFAULT 500, `status` text NOT NULL DEFAULT `'pending'` CHECK (`'pending'|'active'|'completed'|'abandoned'`), `started_at`, `completed_at`, `created_at`. Indexes: `trips_user_id_idx`, `trips_status_idx`. **No `mode` column** → audience/trip-mode separation lives in code request params per the Mode column semantics section above.
- **`feedback`** — `id`, `poi_id`, `user_id`, `rating` (up/down), `correction_text`, `created_at`
- **`narration_audio`** — `id`, `poi_id`, `narrator_slug` (= voice_id), `depth`, `mode` (trip_mode, CHECK on `'driving','hiking','city'`), `audio_url` (nullable while pending), `status` CHECK (`'pending','ready','failed'`) DEFAULT `'ready'`, `provider`, `character_count`, `duration_ms`, `cost_usd`, `prompt_version`, `generated_at`. **UNIQUE constraint:** `(poi_id, narrator_slug, depth, mode)` → added 2026-05-11 via migration `20260510000005_na_unique_add_mode`. 30-day TTL.
- **`voice_configs`** — `id`, `mode` (audience mode), `provider`, `voice_id`, `voice_settings` (jsonb), `display_name`, `description`, `is_active`, `version`, `created_at`. Partial unique index `(mode) WHERE is_active = true` enforces one active row per audience mode.
- **`llm_calls`** — `id`, `call_type` ('claude' | 'tts'), `provider`, `model_or_voice`, `input_chars`, `input_tokens`, `output_tokens`, `cost_usd`, `related_id`, `created_at`. Logs every billable call for audit.

### Key RPCs
```sql
get_nearby_pois(lat, long, radius_meters, category_filter)
get_route_pois(route_geometry, corridor_width_meters)
submit_feedback(poi_id, rating, correction_text)
cache_narration(poi_id, trip_mode, depth, narrator_slug, audio_url, ...)
get_cached_narration(poi_id, trip_mode, depth, narrator_slug)
```

Spatial index on `pois.location` is critical for performance. Always filter `WHERE merged_into IS NULL` in runtime queries.

---

## WebSocket Server (Node.js + Socket.io)

### Room Structure
- `route-${routeId}` → GPS broadcast + narration events
- `voice-${routeId}` → WebRTC signaling for group voice chat

### Key Events
| Event | Direction | Purpose |
|---|---|---|
| `update_location` | Client → Server → All | Broadcast live GPS to group |
| `play_narration` | Server — Client(s) | Trigger cached/generated audio playback |
| `narration_queued` | Server — Client | Notify upcoming story in queue |
| WebRTC signaling | Peer-to-peer via server | Group voice chat (offer/answer/ICE) |

### Auth
- Token validation via Supabase `service_role` key on connection
- Reconnection: exponential backoff + local event queue + cache fallback

---

## Decision-Making Guidelines

When the user asks you to build something or make a product decision, apply these principles:

### Safety First
- Driving page: oversized buttons only, no small text, no reading required
- All narration is audio — never display narration text as the primary output while driving
- "Cancel Route" visible on every active page

### Offline is First-Class
- Every feature should degrade gracefully offline
- Pre-cache aggressively: route-planned = auto-download all audio
- Show clear offline limitations (no group map, no regeneration, feedback queued)
- Storage budget: ~50MB for 4-hour drive, ~15MB for full-day hike

### Density Awareness
- Driving: auto-trigger with smart queue
- Hiking: auto-trigger at 80m
- City: **tap-to-hear radar** — never auto-blast in dense urban areas
- Always respect the queue rules (spacing, fatigue, never interrupt)

### Personality Consistency
- Audience mode, narrator slug, and intrinsic depth are independent axes — every combination must work
- Kids mode: strict content guardrails at the system prompt level
- Unfiltered: humor is sharp, never cruel. Self-aware meta-humor is a feature.
- Narrator A (reverent) and Narrator B (conversational) handle the full depth range — both can deliver brief and long narrations
- Corridor narration defaults to Standard (`ride_along` equivalent) depth

### TTS Provider Discipline
- **Never call a TTS provider SDK directly from app code.** All TTS goes through `generateNarration()` in `scripts/lib/tts/`.
- **Never write MP3 or base64 audio to the cache.** Opus only. Storage URL only.
- **Never change a `voice_configs` row in place.** Set `is_active=false` on the old row and insert a new row with `version+1`. Cached audio referencing the old `narrator_slug` stays playable.
- The cache key `{poi_id}-{trip_mode}-{depth}-{narrator_slug}.opus` is content-addressed — the same key always returns the same audio, regardless of which provider generated it. Switching providers does not invalidate the cache, it just stops generating new audio with the old `narrator_slug`.

### DB Conventions
- **`updated_at` trigger reuse:** When a new table needs an `updated_at` column auto-touched on UPDATE, attach the existing `public.set_updated_at()` function via a BEFORE UPDATE trigger. Do not create a parallel trigger function. The shared function was captured in migration `20260510000001_user_preferences_capture.sql`; the generic name signals "reuse me." See drift catalog 5.24.
- **DB architecture:** Always reuse existing Supabase tables and RPC functions. Do not create parallel or shadow tables for new features. Extend with new columns / RLS policies / updated RPC params instead.
- **Runtime POI queries:** Always filter `WHERE merged_into IS NULL`. Spatial index on `pois.location` is critical for performance.

### Cost Discipline
- Every Claude call and every TTS call logs to `llm_calls`. No exceptions.
- The lookahead generates audio for ONLY the user's current `(audience_mode, narrator_slug, trip_mode, depth_variant)` → one cache key at a time, not all combinations.
- Per the curation addendum §4.5: average generation count is ~10 per POI (4 audience × 2 narrator × ~1.2 depth variants, since most POIs have one intrinsic depth and only `long`-weight POIs cache two variants). This is a ~60% reduction from the previous 4×3×4 = 48 design.
- Bulk pre-generation of audio is reserved for: high-traffic known routes (PCH, I-5, etc.), region narrations (~2,000 one-time files, ~$15–25), and Long-variant audio for `significance_score >= 80` POIs.

### Code Patterns
- Frontend: Expo + React Native (TypeScript) — screens under `app/`, shared hooks/components under `src/`, Supabase client + Socket.io integrations as hooks
- Backend: Supabase RPCs for data, Node.js for real-time, Claude API + TTS abstraction for narration
- Always think about the narration cache key: `{poi_id}-{trip_mode}-{depth}-{narrator_slug}`
- Audio format is always Opus
- State persists across pages until route is explicitly canceled

---

## Monetization Context

> **⚠️ Per curation addendum §13:** tier mapping is still being finalized. Likely v1 mapping:

| Tier | Access |
|---|---|
| **Free** | The Land Speaks (Soul) only, Light Touch pace, Family audience only, Narrator A only, 10 POIs/trip, no offline |
| **Road Pass** (subscription) | All paces, all audience modes, both narrators, all narrative focus options (incl. +Local Color and Custom), unlimited POIs, offline cache, Trip Reports, Iconic Local Override, region narrations, group features |
| **Family Plan** | Road Pass × 5 accounts — simultaneous Kids + Adult in one car |

Future: contextual local business recommendations (clearly labeled, never interrupts narration, user can disable).

---

## Open Questions (flag these when relevant)

**See `roadstory-unified-roadmap.md` §6 for the consolidated master list.** Summary of unresolved items:

**Blocking decisions (need human input before downstream work):**
- Final narrator display names (internal slugs `narrator_a/b` can ship before names finalize)
- Per-category significance floor values — set after Phase B significance recompute produces real distribution
- Voice IDs for 8 voice_configs (2 narrators × 4 audience modes) — audition via voice audition workflow before Phase H

**Deferrable:**
- Watersheds (HUC8) as a region layer — recommend v2
- Resonance score weight tuning — tune after first batch of skip data
- Local Color airtime ratios per narrator — tune after user feedback
- Tell Me More on-demand vs pre-gen Long audio for high-significance POIs
- Kids mode sub-tiers by age — recommend v1.5
- Unfiltered mode content boundary documentation (write explicit "what's out" list before Phase H Unfiltered prompt templates)
- International / multilingual expansion timeline — v2
- Self-hosted TTS: evaluate at scale (10k+ users or sustained TTS spend > $500/month) using F5-TTS, XTTS-v2, or Kokoro on dedicated GPU. Plug in as a new provider in `scripts/lib/tts/providers/` when the math flips.
- Content accuracy QA process before community feedback reaches critical mass (the per-narration health report in addendum §9.3 + content-quality dashboard fill this role pre-scale)

---

## Response Style

When helping with this project:
1. **Be specific to the stack** — don't suggest technologies outside the chosen stack unless asked
2. **Think end-to-end** — a UI change may need a new Supabase RPC, a Socket.io event, or a prompt template update
3. **Show, don't just tell** — provide code, schemas, prompt templates, or wireframe descriptions
4. **Flag safety/UX implications** — if a feature creates a distraction for drivers, say so
5. **Reference the brief** — when making product decisions, anchor them in the project's stated principles
6. **Be proactive** — if the user asks about one piece, volunteer how it connects to adjacent systems
